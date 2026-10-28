/** Choices the index admits only at some levels (`optionsByLevel`): the form offers them for the level being edited, and saving refuses a value that level does not admit (screen and server). */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};
const section = (title: string) => console.log(`\n${title}`);

const h = installReactHarness();
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { describeLevelOptionIssues, describeNewLevelOptionIssues, controlLevelIn } = require('../common/ens/configuration/services/level-options');
const { validateControlParameterValues } = require('../common/ens/configuration/services/validation-engine');
const state = require('../common/ens/configuration/services/configuration-state-service');
const client = require('../common/ens/configuration/services/configuration-http-client');
const { ParameterRendererFactory } = require('../public/ens/configuration/form-engine');
const { createConfigurationHandlers } = require('../server/lib/configuration-handlers');

const clone = (value: any) => JSON.parse(JSON.stringify(value));
const documentWith = (ensLevel: string, values: Record<string, string> = {}) => {
  const doc = clone(defaultENSConfigurationTemplate);
  doc.global.ensLevel = ensLevel;
  Object.entries(values).forEach(([key, value]) => {
    const [controlId, parameterId] = key.split(' ');
    doc.controls.find((control: any) => control.controlId === controlId).parameters.find((p: any) => p.id === parameterId).value = value;
  });
  return doc;
};
const parameterOf = (doc: any, controlId: string, parameterId: string) =>
  doc.controls.find((control: any) => control.controlId === controlId).parameters.find((p: any) => p.id === parameterId);

(async () => {
  section('1. Which values a level admits');
  {
    check('mp.s.2 P-07 = R1 in MEDIA: admitted', describeLevelOptionIssues(documentWith('MEDIO', { 'mp.s.2 P-07': 'R1' })).length === 0);
    const alto = describeLevelOptionIssues(documentWith('ALTO', { 'mp.s.2 P-07': 'R1' }));
    check('mp.s.2 P-07 = R1 in ALTA: refused, saying what the level admits', alto.length === 1 && /mp\.s\.2 P-07: «R1» no se admite en nivel ALTO \(admite: R2\)/.test(alto[0]), alto);
    check('mp.com.4 P-03 = R1 in ALTA refused, R2 admitted', describeLevelOptionIssues(documentWith('ALTO', { 'mp.com.4 P-03': 'R1' })).length === 1 && describeLevelOptionIssues(documentWith('ALTO', { 'mp.com.4 P-03': 'R2' })).length === 0);
    check('an empty value is never an issue', describeLevelOptionIssues(documentWith('ALTO')).length === 0);
    check('a leftover is not new; a level change into it is', describeNewLevelOptionIssues(documentWith('ALTO', { 'mp.s.2 P-07': 'R1' }), documentWith('ALTO', { 'mp.s.2 P-07': 'R1' })).length === 0 &&
      describeNewLevelOptionIssues(documentWith('ALTO', { 'mp.s.2 P-07': 'R1' }), documentWith('MEDIO', { 'mp.s.2 P-07': 'R1' })).length === 1);
    check('the level of a control follows its dimension (mp.s.4 by D)', controlLevelIn({ global: { ensLevel: 'ALTO', availabilityLevel: 'MEDIO' } }, 'mp.s.4') === 'MEDIO');
  }

  section('2. The form offers the options of the level being edited');
  {
    const p07 = parameterOf(documentWith('MEDIO'), 'mp.s.2', 'P-07');
    const optionsAt = async (level?: string) => {
      h.reset();
      await h.render(ParameterRendererFactory, { parameter: p07, value: undefined, onChange: () => undefined, level });
      return (h.find('EuiSelect')?.props.options || []).map((option: any) => option.value).filter(Boolean).join(',');
    };
    ensConfigurationRepository.replaceActive(documentWith('BAJO'));
    check('edited for ALTA: only R2, whatever the saved level is', (await optionsAt('ALTO')) === 'R2', await optionsAt('ALTO'));
    check('edited for MEDIA: R1 and R2', (await optionsAt('MEDIO')) === 'R1,R2');
    ensConfigurationRepository.replaceActive(documentWith('ALTO'));
    check('without a level: the active configuration\'s (ALTA → R2)', (await optionsAt()) === 'R2');
    const control = documentWith('ALTO').controls.find((c: any) => c.controlId === 'mp.s.2');
    const issues = validateControlParameterValues(control, { modalidad_auditoria: 'R1' }, 'ALTO');
    check('the screen\'s save check refuses R1 for ALTA and names the parameter', issues.some((issue: any) => issue.parameterId === 'P-07'), issues);
    check('...and accepts it for MEDIA', !validateControlParameterValues(control, { modalidad_auditoria: 'R1' }, 'MEDIO').some((issue: any) => issue.parameterId === 'P-07'));
  }

  section('3. Saving from the screen');
  {
    const sent: any[] = [];
    client.setENSConfigurationHttp(() => ({
      get: async () => ({ statusCode: 200, error: 0, data: { configuration: null, metadata: null } }),
      put: async (_path: string, options: any) => {
        const body = JSON.parse(options.body);
        sent.push(body.configuration);
        return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: null } };
      },
    }));
    ensConfigurationRepository.replaceActive(documentWith('MEDIO', { 'mp.s.2 P-07': 'R1' }));
    let refused = '';
    try {
      await state.updateActiveGlobalConfiguration({ ...documentWith('ALTO').global });
    } catch (error) {
      refused = String((error as Error).message);
    }
    check('raising the level to ALTA with P-07 = R1 is refused before sending', sent.length === 0 && /mp\.s\.2 P-07: «R1» no se admite en nivel ALTO/.test(refused), refused);

    ensConfigurationRepository.replaceActive(documentWith('ALTO'));
    const mp = clone(ensConfigurationRepository.getActive().controls.find((c: any) => c.controlId === 'mp.com.4'));
    mp.parameters.find((p: any) => p.id === 'P-03').value = 'R1';
    refused = '';
    try {
      await state.updateActiveControlConfiguration(mp);
    } catch (error) {
      refused = String((error as Error).message);
    }
    check('saving mp.com.4 P-03 = R1 in ALTA is refused', sent.length === 0 && /mp\.com\.4 P-03: «R1» no se admite en nivel ALTO/.test(refused), refused);
    mp.parameters.find((p: any) => p.id === 'P-03').value = 'R2';
    await state.updateActiveControlConfiguration(mp);
    check('...and R2 is saved', sent.length === 1 && parameterOf(sent[0], 'mp.com.4', 'P-03').value === 'R2');
  }

  section('4. Saving on the server');
  {
    const docs = new Map<string, any>();
    const ix = {
      indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }) },
      search: async (p: any) => {
        const ids = p.body?.query?.ids?.values;
        const type = p.body?.query?.term?.documentType;
        const hits = [...docs.entries()].filter(([id, d]) => (ids ? ids.includes(id) : d.documentType === type)).map(([, d]) => ({ _source: d }));
        return { body: { hits: { hits } } };
      },
      bulk: async (p: any) => {
        const lines = String(p.body).split('\n').filter(Boolean).map((l: string) => JSON.parse(l));
        for (let i = 0; i < lines.length; i += 2) docs.set((lines[i].create || lines[i].index)._id, lines[i + 1]);
        return { body: { errors: false } };
      },
    };
    const admin = { transport: { request: async () => ({ body: { user_name: 'rsis', roles: ['power_ens_admin'] } }) } };
    const context = { core: { opensearch: { client: { asInternalUser: ix, asCurrentUser: admin } } } };
    const responses = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
    const handlers = createConfigurationHandlers({ logger: { info() {}, warn() {}, error() {}, debug() {} } as any, securityEnabled: true });
    const save = (configuration: any) => handlers.save(context as any, { body: { configuration } } as any, responses as any);

    let r: any = await save(documentWith('MEDIO', { 'mp.s.2 P-07': 'R1' }));
    check('P-07 = R1 in MEDIA: saved', r.status === 200, r);
    r = await save(documentWith('ALTO', { 'mp.s.2 P-07': 'R1' }));
    check('raising to ALTA with it: 400 naming the parameter and what ALTA admits', r.status === 400 && /mp\.s\.2 P-07: «R1» no se admite en nivel ALTO \(admite: R2\)/.test(JSON.stringify(r.body)), r);
    docs.set('active', { ...docs.get('active'), configuration: { ...documentWith('ALTO', { 'mp.s.2 P-07': 'R1' }) } });
    r = await save(documentWith('ALTO', { 'mp.s.2 P-07': 'R1', 'mp.s.1 P-05': 'SpamAssassin' }));
    check('a leftover does not block saving something else', r.status === 200, r);
  }

  ensConfigurationRepository.reset();
  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.log(`  FAIL exception: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
