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

  refuse = true;
  const control = service.getActiveENSConfiguration().controls.find((candidate: any) => candidate.controlId === 'op.acc.1');
  let screen = await h.render(ConfigurationSession, { control, onConfigurationSaved: () => undefined });
  const field = h.findAll('ParameterRendererFactory').find(node => node.props.parameter.id === 'P-04')!;
  field.props.onChange(field.props.parameter.name, ['admin', 'invitado']);
  await h.rerender();
  screen = await h.click(/Guardar configuración/);
  check('a refused save shows the message on the control form', screen.includes(CONFLICT), screen.slice(0, 300));
  check('and keeps what the user wrote', JSON.stringify(h.findAll('ParameterRendererFactory').find(node => node.props.parameter.id === 'P-04')!.props.value) === '["admin","invitado"]');
  check('the loaded configuration is not replaced', service.getActiveENSConfiguration().global.ensLevel === 'MEDIO');

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

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
