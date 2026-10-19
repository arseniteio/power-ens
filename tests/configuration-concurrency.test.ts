/** A save made over a newer configuration is refused (409) instead of undoing the other administrator's change. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};

const h = installReactHarness();
const { createConfigurationHandlers } = require('../server/lib/configuration-handlers');
const { persistENSConfiguration, ENSConfigurationConflictError } = require('../server/lib/configuration-storage');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const client = require('../common/ens/configuration/services/configuration-http-client');
const service = require('../common/ens/configuration/services/configuration-state-service');
const { ConfigurationSession } = require('../public/ens/configuration/sessions');
const { OrganizationDataPanel } = require('../public/ens/configuration/components/organization-data-panel');

const CONFLICT = 'La configuración ha cambiado desde que la abriste. Recarga la página para ver los cambios.';
const clone = (value: any) => JSON.parse(JSON.stringify(value));

// An index that keeps `_seq_no` and honours `if_seq_no`/`if_primary_term` and `create`, as OpenSearch does.
const versionedIndex = () => {
  const docs = new Map<string, { source: any; seqNo: number }>();
  let sequence = 0;
  const index: any = {
    docs,
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }) },
    search: async (request: any) => {
      const ids = request.body?.query?.ids?.values;
      const type = request.body?.query?.term?.documentType;
      const hits = [...docs.entries()]
        .filter(([id, doc]) => (ids ? ids.includes(id) : doc.source.documentType === type))
        .map(([, doc]) => ({ _source: doc.source, ...(request.body?.seq_no_primary_term ? { _seq_no: doc.seqNo, _primary_term: 1 } : {}) }))
        .sort((a, b) => String(b._source.createdAt || '').localeCompare(String(a._source.createdAt || '')))
        .slice(0, request.body?.size || 10);
      return { body: { hits: { hits } } };
    },
    bulk: async (request: any) => {
      const lines = String(request.body).split('\n').filter(Boolean).map(line => JSON.parse(line));
      if (index.historyFails && lines.some(line => String((line.create || {})._id || '').startsWith('history-'))) {
        return { body: { errors: true, items: [{ create: { status: 403, error: { type: 'security_exception' } } }] } };
      }
      const items: any[] = [];
      for (let i = 0; i < lines.length; i += 2) {
        const kind = lines[i].create ? 'create' : 'index';
        const meta = lines[i][kind];
        const existing = docs.get(meta._id);
        const stale = (kind === 'create' && existing) || (meta.if_seq_no !== undefined && (!existing || existing.seqNo !== meta.if_seq_no || meta.if_primary_term !== 1));
        if (stale) {
          items.push({ [kind]: { status: 409, error: { type: 'version_conflict_engine_exception' } } });
          continue;
        }
        sequence += 1;
        docs.set(meta._id, { source: lines[i + 1], seqNo: sequence });
        items.push({ [kind]: { status: 200, _seq_no: sequence, _primary_term: 1 } });
      }
      return { body: { errors: items.some(item => (item.create || item.index).status === 409), items } };
    },
  };
  return index;
};

const responses = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
const logger = { info: () => undefined, error: () => undefined, warn: () => undefined, debug: () => undefined };
const context = (index: any, user = 'rsis') => ({
  core: { opensearch: { client: { asInternalUser: index, asCurrentUser: { transport: { request: async () => ({ body: { user_name: user, roles: ['ensfacil_admin'] } }) } } } } },
});
const withLevel = (doc: any, level: string) => ({ ...doc, global: { ...doc.global, ensLevel: level } });

(async () => {
  console.log('1. Server');
  const index = versionedIndex();
  const handlers = createConfigurationHandlers({ logger: logger as any, securityEnabled: true });
  const first: any = await handlers.save(context(index), { body: { configuration: clone(defaultENSConfigurationTemplate) } }, responses);
  check('the first save creates the document and returns its version', first.status === 200 && Number.isInteger(first.body.data.metadata.seqNo) && first.body.data.metadata.primaryTerm === 1, first.body);
  const loaded: any = await handlers.getActive(context(index), {}, responses);
  const version = { seqNo: loaded.body.data.metadata.seqNo, primaryTerm: loaded.body.data.metadata.primaryTerm };
  check('reading returns the version too', version.seqNo === first.body.data.metadata.seqNo);

  const ana: any = await handlers.save(context(index, 'ana'), { body: { configuration: withLevel(loaded.body.data.configuration, 'ALTO'), expectedVersion: version } }, responses);
  check('a save with the version it read is accepted', ana.status === 200 && ana.body.data.metadata.seqNo > version.seqNo, ana.body);
  const historyBefore = [...index.docs.values()].filter((doc: any) => doc.source.documentType === 'CONFIGURATION_HISTORY').length;
  const luis: any = await handlers.save(context(index, 'luis'), { body: { configuration: withLevel(loaded.body.data.configuration, 'BAJO'), expectedVersion: version } }, responses);
  check('a save over a newer document is refused with 409 and the message', luis.status === 409 && luis.body.message === CONFLICT, luis);
  check('the newer document stays as it was', index.docs.get('active').source.configuration.global.ensLevel === 'ALTO' && index.docs.get('active').source.updatedBy === 'ana');
  check('and the refused save leaves nothing in the history', [...index.docs.values()].filter((doc: any) => doc.source.documentType === 'CONFIGURATION_HISTORY').length === historyBefore);
  const script: any = await handlers.save(context(index), { body: { configuration: withLevel(index.docs.get('active').source.configuration, 'MEDIO') } }, responses);
  check('a save without a version (a script through the API) is still accepted', script.status === 200);

  let raced: unknown;
  try {
    await persistENSConfiguration(index, logger, clone(defaultENSConfigurationTemplate), 'luis', undefined, { seqNo: 1, primaryTerm: 1 });
  } catch (error) {
    raced = error;
  }
  check('a write that loses the race between reading and writing is refused too', raced instanceof ENSConfigurationConflictError);
  let created: unknown;
  try {
    await persistENSConfiguration(index, logger, clone(defaultENSConfigurationTemplate), 'luis', undefined, 'absent');
  } catch (error) {
    created = error;
  }
  check('so is a first save when another one already created the document', created instanceof ENSConfigurationConflictError);

  const fresh = versionedIndex();
  const born: any = await handlers.save(context(fresh), { body: { configuration: clone(defaultENSConfigurationTemplate), expectedVersion: null } }, responses);
  check('«there was none» (null) creates the first configuration', born.status === 200 && fresh.docs.get('active').source.updatedBy === 'rsis', born.body);
  const late: any = await handlers.save(context(fresh, 'luis'), { body: { configuration: withLevel(clone(defaultENSConfigurationTemplate), 'ALTO'), expectedVersion: null } }, responses);
  check('and is refused with 409 when one was created meanwhile', late.status === 409 && late.body.message === CONFLICT && fresh.docs.get('active').source.updatedBy === 'rsis', late);

  index.historyFails = true;
  const current: any = await handlers.getActive(context(index), {}, responses);
  const noHistory: any = await handlers.save(context(index, 'ana'), {
    body: { configuration: withLevel(current.body.data.configuration, 'BAJO'), expectedVersion: { seqNo: current.body.data.metadata.seqNo, primaryTerm: 1 } },
  }, responses);
  index.historyFails = false;
  check('a history entry that cannot be written after saving is a warning, not a failed save',
    noHistory.status === 200 && noHistory.body.data.warning === 'Guardado; no se pudo registrar el historial' && index.docs.get('active').source.configuration.global.ensLevel === 'BAJO' &&
    noHistory.body.data.metadata.seqNo > current.body.data.metadata.seqNo, noHistory.body);

  console.log('2. Browser');
  let stored = clone(defaultENSConfigurationTemplate);
  let seqNo = 7;
  const sent: any[] = [];
  let refuse = false;
  client.setENSConfigurationHttp(() => ({
    get: async () => ({ statusCode: 200, error: 0, data: { configuration: clone(stored), metadata: { seqNo, primaryTerm: 1 } } }),
    put: async (_path: string, options: any) => {
      const body = JSON.parse(options.body);
      sent.push(body);
      if (refuse) return Promise.reject({ body: { message: CONFLICT } });
      stored = body.configuration;
      seqNo += 1;
      return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: { seqNo, primaryTerm: 1 } } };
    },
  }));
  await service.hydrateENSConfiguration(true);
  await service.updateActiveGlobalConfiguration({ ...service.getActiveENSConfiguration().global, ensLevel: 'ALTO' });
  check('the browser sends the version it loaded', JSON.stringify(sent[0].expectedVersion) === '{"seqNo":7,"primaryTerm":1}', sent[0].expectedVersion);
  await service.updateActiveGlobalConfiguration({ ...service.getActiveENSConfiguration().global, ensLevel: 'MEDIO' });
  check('and, after saving, the version the server returned', JSON.stringify(sent[1].expectedVersion) === '{"seqNo":8,"primaryTerm":1}', sent[1].expectedVersion);

  const [one, two] = [
    service.updateActiveGlobalConfiguration({ ...service.getActiveENSConfiguration().global, ensLevel: 'BAJO' }),
    service.updateActiveControlConfiguration(service.getActiveENSConfiguration().controls.find((candidate: any) => candidate.controlId === 'op.acc.2')),
  ];
  await Promise.all([one, two]);
  check('two saves started together wait for each other and carry consecutive versions (no 409 against itself)',
    JSON.stringify(sent.slice(-2).map(body => body.expectedVersion.seqNo)) === '[9,10]' && sent[sent.length - 1].configuration.global.ensLevel === 'BAJO', sent.slice(-2).map(body => body.expectedVersion));

  refuse = true;
  const control = service.getActiveENSConfiguration().controls.find((candidate: any) => candidate.controlId === 'op.acc.1');
  let screen = await h.render(ConfigurationSession, { control, onConfigurationSaved: () => undefined });
  const field = h.findAll('ParameterRendererFactory').find(node => node.props.parameter.id === 'P-04')!;
  field.props.onChange(field.props.parameter.name, ['admin', 'invitado']);
  await h.rerender();
  screen = await h.click(/Guardar configuración/);
  check('a refused save shows the message on the control form', screen.includes(CONFLICT), screen.slice(0, 300));
  check('and keeps what the user wrote', JSON.stringify(h.findAll('ParameterRendererFactory').find(node => node.props.parameter.id === 'P-04')!.props.value) === '["admin","invitado"]');
  check('the loaded configuration is not replaced', service.getActiveENSConfiguration().global.ensLevel === 'BAJO');

  h.reset();
  screen = await h.render(OrganizationDataPanel, { configuration: service.getActiveENSConfiguration(), onConfigurationSaved: () => undefined });
  const edit = h.findAll('EuiButton', /^Editar$/);
  await edit[edit.length - 1].props.onClick();
  await h.rerender();
  const item = h.find('ParameterRendererFactory')!;
  item.props.onChange(item.props.parameter.name, ['op.acc.1 | sí | MEDIO']);
  await h.rerender();
  screen = await h.click(/^Guardar$/);
  check('in Datos de la organización too, with the value still being edited', screen.includes(CONFLICT) && JSON.stringify(h.find('ParameterRendererFactory')?.props.value) === '["op.acc.1 | sí | MEDIO"]', screen.slice(0, 300));

  console.log('3. First save and warnings in the browser');
  h.reset();
  const firstBodies: any[] = [];
  client.setENSConfigurationHttp(() => ({
    get: async () => ({ statusCode: 200, error: 0, data: { configuration: null, metadata: null } }),
    put: async (_path: string, options: any) => {
      const body = JSON.parse(options.body);
      firstBodies.push(body);
      return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: { seqNo: 1, primaryTerm: 1 }, warning: 'Guardado; no se pudo registrar el historial' } };
    },
  }));
  await service.hydrateENSConfiguration(true);
  await service.updateActiveGlobalConfiguration({ ...service.getActiveENSConfiguration().global, ensLevel: 'ALTO' });
  check('loaded with no configuration, the first save says it expects none (null)', firstBodies[0].expectedVersion === null && 'expectedVersion' in firstBodies[0]);
  check('a warning returned with the save is kept for the screen', service.getLastSaveWarning() === 'Guardado; no se pudo registrar el historial');
  const { SaveWarningNotice } = require('../public/ens/configuration/components/save-warning-notice');
  screen = await h.render(SaveWarningNotice, {});
  check('and shown: saved, but without its history entry', screen.includes('Guardado; no se pudo registrar el historial') && screen.includes('La configuración se ha guardado.'), screen);

  let failNext = false;
  client.setENSConfigurationHttp(() => ({
    get: async () => ({ statusCode: 200, error: 0, data: { configuration: clone(defaultENSConfigurationTemplate), metadata: { seqNo: 5, primaryTerm: 1 } } }),
    put: async () => (failNext ? Promise.reject({ body: { message: CONFLICT } }) : { statusCode: 200, error: 0, data: { configuration: clone(defaultENSConfigurationTemplate), metadata: { seqNo: 6, primaryTerm: 1 } } }),
  }));
  await service.hydrateENSConfiguration(true);
  check('reloading clears the warning of an earlier save', service.getLastSaveWarning() === undefined);
  client.setENSConfigurationHttp(() => ({
    get: async () => ({}),
    put: async () => ({ statusCode: 200, error: 0, data: { configuration: clone(defaultENSConfigurationTemplate), metadata: { seqNo: 6, primaryTerm: 1 }, warning: 'Guardado; no se pudo registrar el historial' } }),
  }));
  await service.updateActiveGlobalConfiguration({ ...service.getActiveENSConfiguration().global });
  failNext = true;
  client.setENSConfigurationHttp(() => ({ get: async () => ({}), put: async () => Promise.reject({ body: { message: CONFLICT } }) }));
  await service.updateActiveGlobalConfiguration({ ...service.getActiveENSConfiguration().global }).catch(() => undefined);
  check('and so does a later save that fails, so an old warning does not sit under a new error', service.getLastSaveWarning() === undefined);

  console.log('4. A document without configuration');
  const bare: any[] = [];
  client.setENSConfigurationHttp(() => ({
    get: async () => ({ statusCode: 200, error: 0, data: { configuration: null, metadata: { updatedBy: 'script', seqNo: 12, primaryTerm: 1 } } }),
    put: async (_path: string, options: any) => {
      const body = JSON.parse(options.body);
      bare.push(body);
      return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: { seqNo: 13, primaryTerm: 1 } } };
    },
  }));
  await service.hydrateENSConfiguration(true);
  await service.updateActiveGlobalConfiguration({ ...service.getActiveENSConfiguration().global, ensLevel: 'ALTO' });
  check('an active document without configuration is saved over its version, not as «there was none»', JSON.stringify(bare[0].expectedVersion) === '{"seqNo":12,"primaryTerm":1}', bare[0].expectedVersion);

  console.log('5. A save that does not answer');
  client.setENSConfigurationHttp(() => ({ get: async () => ({}), put: (_path: string, _options: any) => new Promise(() => undefined) }));
  client.setENSConfigurationSaveTimeout(50);
  const hung = await service.updateActiveGlobalConfiguration({ ...service.getActiveENSConfiguration().global }).then(() => 'saved', (error: Error) => error.message);
  check('is cut with a clear message', hung === client.SAVE_TIMED_OUT, hung);
  client.setENSConfigurationHttp(() => ({
    get: async () => ({}),
    put: async (_path: string, options: any) => ({ statusCode: 200, error: 0, data: { configuration: JSON.parse(options.body).configuration, metadata: { seqNo: 20, primaryTerm: 1 } } }),
  }));
  const after = await service.updateActiveGlobalConfiguration({ ...service.getActiveENSConfiguration().global }).then(() => 'saved', (error: Error) => error.message);
  check('and the saves queued after it still run', after === 'saved', after);
  client.setENSConfigurationSaveTimeout(60000);

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
