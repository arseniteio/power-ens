/** Panel: unfavourable requirements by origin (ENS-DASH-002) and operational SOC alerts (ENS-DASH-004), by Francisco Caicedo. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};

let evaluations: Record<string, any> = {};
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: (params: any) => ({ ...(evaluations[params.include] || { isLoading: true }), retry: () => undefined }),
    }),
  },
});

const { EnsDashboardMain } = require('../public/ens/dashboard/ens-dashboard-main');
const { buildENSDashboardModel } = require('../common/ens/core/dashboard-adapter/dashboard-adapter');
const { buildFindingsCardModel } = require('../common/ens/core/dashboard-adapter/presenters/findings.presenter');
const { buildComplianceState } = require('../common/ens/core/compliance-state');
const alerts = require('../common/ens/core/dashboard-adapter/presenters/impact-events.presenter');
const { normalizeWazuhAlerts } = require('../common/ens/core/data-source/data-source-engine');
const { createFakeIndexer } = require('./fixtures/fake-indexer');
const { createEvaluationService, normalizeQuery } = require('../server/lib/evaluation/evaluation-service');
const { buildEvaluationResponse } = require('../server/lib/evaluation/responses');
const { buildImpactEventsRequest, readOperationalIncidents, OPERATIONAL_ALERTS_PER_TYPE } = require('../server/lib/evaluation/queries');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');

const now = new Date('2026-10-20T10:00:00Z');
const requirement = (id: string, status: string) => ({ id, title: id, status, level: ['BAJO'], observations: [], evidenceIds: [] });
const nc = (requirementId: string, origin: 'MEDIDA' | 'NO_EVIDENCIADA', evidenceId = 'EV-01') => ({
  id: `${requirementId}-${origin}-${evidenceId}`, evidenceId, requirementId, finding: 'f', impact: 'i', requiredAction: 'a', origin,
  ...(origin === 'NO_EVIDENCIADA' ? { cause: 'EVIDENCE' } : {}), evidenceIds: [evidenceId], parameterIds: [],
});
const result = (controlId: string, requirements: any[], nonConformities: any[] = [], status = 'NO_CUMPLE') => ({
  control: { id: controlId, name: controlId, family: 'op', category: 'acc', description: '' },
  level: 'MEDIO', status, score: 40, coverage: 50, applicableRequirements: requirements.length, measuredRequirements: requirements.length, unmeasuredRequirements: [],
  evaluatedAt: now.toISOString(), requirements, parameters: [], evidences: [], missingParameters: [], missingEvidences: [], relatedRules: [],
  nonConformities, observations: [], traceability: [],
});

(async () => {
  console.log('1. ENS-DASH-002: unfavourable requirements by the origin of their non-conformities');
  const opAcc1 = result(
    'op.acc.1',
    [
      requirement('op.acc.1.1', 'NO_CUMPLE'),
      requirement('op.acc.1.2', 'NO_CUMPLE'),
      requirement('op.acc.1.3', 'PARCIAL'),
      requirement('op.acc.1.4', 'NO_EVALUABLE'),
      requirement('op.acc.1.r1.1', 'CUMPLE'),
      requirement('op.acc.1.r2.1', 'NO_APLICA'),
    ],
    [
      nc('op.acc.1.1', 'MEDIDA'),
      nc('op.acc.1.1', 'MEDIDA'),
      nc('op.acc.1.2', 'NO_EVIDENCIADA'),
      nc('op.acc.1.3', 'MEDIDA'),
      nc('op.acc.1.3', 'NO_EVIDENCIADA'),
      // A favourable requirement never counts, whatever list it appears in.
      nc('op.acc.1.r1.1', 'MEDIDA'),
    ]
  );
  // mp.eq.2 is DRAFT: even a forged unfavourable requirement with its non-conformity stays out.
  const draft = result('mp.eq.2', [requirement('mp.eq.2.1', 'NO_CUMPLE')], [nc('mp.eq.2.1', 'MEDIDA')]);
  const findings = buildFindingsCardModel(buildComplianceState([opAcc1, draft] as any));
  check('one requirement in each origin: measured, unevidenced, mixed, unclassified',
    findings.measuredFindings === 1 && findings.unevidencedFindings === 1 && findings.mixedFindings === 1 && findings.unclassifiedFindings === 1, findings);
  check('exclusive: the four add up to the total (DRAFT control and favourable requirements out)',
    findings.total === 4 && findings.measuredFindings + findings.unevidencedFindings + findings.mixedFindings + findings.unclassifiedFindings === findings.total, findings);
  check('title and red with a NO_CUMPLE', findings.title === 'REQUISITOS QUE REQUIEREN ATENCIÓN' && findings.severity === 'CRITICAL', findings);
  const onlyPartial = buildFindingsCardModel(buildComplianceState([result('op.acc.1', [requirement('op.acc.1.3', 'PARCIAL')], [], 'PARCIAL')] as any));
  check('only PARCIAL: yellow, unclassified without non-conformities', onlyPartial.severity === 'WARNING' && onlyPartial.unclassifiedFindings === 1, onlyPartial);
  const onlyDraft = buildFindingsCardModel(buildComplianceState([draft] as any));
  check('only a DRAFT control: nothing to attend to', onlyDraft.total === 0 && onlyDraft.severity === 'OK', onlyDraft);

  console.log('2. The panel shows the breakdown');
  const meta = { computedAt: now.toISOString(), evaluatedAt: now.toISOString(), fingerprint: 'f', level: 'MEDIO', facts: { count: 1 }, scope: [{ id: '024', name: 'wazuh-real' }] };
  const state = buildComplianceState([opAcc1, draft] as any);
  evaluations.dashboard = { data: { meta, dashboard: buildENSDashboardModel(state) }, isLoading: false };
  const p = await h.render(EnsDashboardMain);
  check('title, total and the four origins on screen',
    /REQUISITOS QUE REQUIEREN ATENCIÓN/.test(p) && /Medidos:\s*1/.test(p) && /No evidenciados:\s*1/.test(p) && /Mixtos:\s*1/.test(p) && /Sin clasificar:\s*1/.test(p),
    p.slice(p.indexOf('REQUISITOS QUE'), p.indexOf('REQUISITOS QUE') + 400));
  const titles = h.findAll('div').map((node: any) => node.props?.title).filter(Boolean);
  check('«Mixtos» and «Sin clasificar» say what they mean',
    titles.some((t: string) => /distintas máquinas/.test(t) && /siempre es 0/.test(t)) && titles.some((t: string) => /Parciales o no evaluables/.test(t)), titles);
  check('the panel model leaves the alerts to the server: an empty box, no events read in the adapter', JSON.stringify(buildENSDashboardModel(state).impactEvents) === JSON.stringify({ title: 'ALERTAS OPERATIVAS SOC', rows: [], total: 0 }));

  console.log('3. ENS-DASH-004: operational alerts, one row per incident, judged against the engine');
  let n = 0;
  const at = (hours: number) => new Date(now.getTime() - hours * 3600e3).toISOString();
  const hit = (agent: string, name: string, data: Record<string, unknown>, hours: number) => ({
    _id: `a${++n}`,
    _index: 'wazuh-alerts-4.x-2026.10.20',
    _source: { '@timestamp': at(hours), timestamp: at(hours), agent: { id: agent, name }, rule: { id: '100', description: 'r' }, manager: { name: 'wazuh-manager' }, data },
  });
  const scope = [
    { id: '000', name: 'Manager de Wazuh', groups: [], isManager: true },
    { id: '024', name: 'wazuh-real', groups: ['ens'] },
    { id: '028', name: 'zimbraHldap', groups: ['ens'] },
  ];
  const applicable = (controlId: string, requirements: any[], ncs: any[] = []) => result(controlId, requirements, ncs, 'CUMPLE');
  const of024 = [
    applicable('op.acc.1', [requirement('op.acc.1.2', 'NO_CUMPLE'), requirement('op.acc.1.r2.1', 'NO_APLICA')], [nc('op.acc.1.2', 'MEDIDA', 'EV-06')]),
    applicable('op.exp.3', [requirement('op.exp.3.1', 'CUMPLE')]),
    // A forged row of a DRAFT control with an applicable requirement: only the DRAFT status keeps its warning out.
    applicable('mp.eq.2', [requirement('mp.eq.2.1', 'NO_CUMPLE')]),
    applicable('mp.info.6', [requirement('mp.info.6.1', 'NO_APLICA')]),
  ];
  // On 028 op.acc.1.2 fails, but measured by another evidence (EV-03) and EV-06 only unevidenced: not a multi-role finding.
  const of028 = [applicable('op.acc.1', [requirement('op.acc.1.2', 'NO_CUMPLE')], [nc('op.acc.1.2', 'MEDIDA', 'EV-03'), nc('op.acc.1.2', 'NO_EVIDENCIADA', 'EV-06')])];
  const opExp7 = applicable('op.exp.7', [requirement('op.exp.7.1', 'CUMPLE')]);
  const agentRow = (agentId: string, agentName: string, results: any[]) => ({ agentId, agentName, results, summary: buildComplianceState(results).controlSummary });
  const whole = buildComplianceState([...of024, opExp7], [agentRow('000', 'Manager de Wazuh', [opExp7]), agentRow('024', 'wazuh-real', of024), agentRow('028', 'zimbraHldap', of028)]);
  const longReason = `El recolector no puede leer ${'x'.repeat(200)}`;
  const raw = [
    // The same warning observed three times is ONE alert; another motive is another.
    hit('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', origen: 'systemd', objeto: 'telnet', motivo: 'servicio sin unidad' }, 30),
    hit('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', origen: 'systemd', objeto: 'telnet', motivo: 'servicio sin unidad' }, 20),
    hit('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', origen: 'systemd', objeto: 'telnet', motivo: 'servicio sin unidad' }, 10),
    hit('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', origen: 'systemd', objeto: 'cron', motivo: longReason }, 12),
    hit('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', origen: 'systemd', objeto: 'ssh', motivo: 'servicio sin unidad' }, 40),
    // Not applicable: every requirement NO_APLICA, a DRAFT control, a control without a row on 028, a machine outside the scope.
    hit('024', 'wazuh-real', { ensfacil: 'mp.info.6', event: 'collector_warning', origen: 'pbs', objeto: 'job', motivo: 'sin copias' }, 5),
    hit('024', 'wazuh-real', { ensfacil: 'mp.eq.2', event: 'collector_warning', origen: 'gsettings', objeto: 'lock', motivo: 'sin bloqueo' }, 5),
    hit('028', 'zimbraHldap', { ensfacil: 'op.exp.3', event: 'collector_warning', origen: 'systemd', objeto: 'x', motivo: 'y' }, 5),
    hit('099', 'otro', { ensfacil: 'op.exp.3', event: 'collector_warning', origen: 'systemd', objeto: 'x', motivo: 'y' }, 5),
    hit('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', origen: 'systemd', objeto: 'atd', motivo: 'servicio no declarado' }, 3),
    // Security alerts written by the manager: about 024 (one rule, three hours = one problem), about a machine outside the scope, about no machine.
    ...[8, 7, 6].map(h => hit('000', 'wazuh-manager', { ensfacil: 'op.exp.7', event: 'security_alert_observed', agente_id: '024', sistema: 'wazuh-real', regla: '5710', nivel: '10', alertas: '4', primera: at(h + 1), ultima: at(h), descripcion: 'sshd: intento de acceso con un usuario inexistente' }, h)),
    hit('000', 'wazuh-manager', { ensfacil: 'op.exp.7', event: 'security_alert_observed', agente_id: '029', sistema: 'fuera', regla: '5710', primera: at(9), ultima: at(8) }, 8),
    hit('000', 'wazuh-manager', { ensfacil: 'op.exp.7', event: 'security_alert_observed', regla: '31151', primera: at(4), ultima: at(4) }, 4),
  ];
  const events = normalizeWazuhAlerts(raw);
  const model = alerts.buildImpactEventsModel(events, whole, { scope });
  const byLabel = (re: RegExp) => model.rows.find((row: any) => re.test(row.label));
  const repeated = byLabel(/servicio sin unidad/);
  check('the same warning observed three times: one row, 3 observations, the last one', repeated?.count === 3 && repeated?.lastObserved === at(10) && repeated?.severity === 'warning' && repeated?.controlId === 'op.exp.3' && repeated?.agentName === 'wazuh-real', repeated);
  const cut = model.rows.find((row: any) => /cron/.test(row.description));
  check('another motive is another row; the motive cut to 140 characters', Boolean(cut) && cut.label.length === 140 && cut.label.endsWith('...'), cut?.label);
  const security = model.rows.filter((row: any) => row.eventType === 'security_alert_observed');
  const on024 = security.find((row: any) => row.agentId === '024');
  check('a security alert is attributed to the machine it names: one row for three hours of the same rule', on024?.count === 3 && on024?.agentName === 'wazuh-real' && on024?.controlId === 'op.exp.7' && /Regla 5710/.test(on024?.description), security);
  check('…labelled with the rule\'s description, and its count says it counts hours', on024?.label === 'sshd: intento de acceso con un usuario inexistente' && on024?.countLabel === 'alertas en 3 horas', on024);
  check('…and the fixed text when the fact has no description', security.find((row: any) => row.agentId === '000')?.label === 'Alerta de seguridad observada por Wazuh.', security);
  check('…and to the manager when it names none; not shown for a machine outside the scope', security.length === 2 && security.some((row: any) => row.agentId === '000') && !security.some((row: any) => row.agentId === '029'), security.map((r: any) => r.agentId));
  check('applicability: no row for NO_APLICA, DRAFT, a control without a row on that machine, or a machine outside the scope',
    !model.rows.some((row: any) => ['mp.info.6', 'mp.eq.2'].includes(row.controlId) || row.agentId === '028' || row.agentId === '099'), model.rows.map((r: any) => r.id));
  check('a DRAFT control is out even with a machine row and an applicable requirement', of024.some((r: any) => r.control.id === 'mp.eq.2' && r.requirements[0].status === 'NO_CUMPLE') && model.total === 6 && !model.rows.some((row: any) => row.controlId === 'mp.eq.2'));
  check('five rows at most, the oldest out; the total counts the six that pass (and nothing else)', model.rows.length === 5 && model.total === 6 && model.summary === 'Se muestran 5 de 6.' && !model.rows.some((row: any) => /ssh/.test(row.description)), [model.rows.length, model.total, model.summary]);
  const bounded5 = alerts.buildImpactEventsModel(events, whole, { scope, truncatedAt: 100 });
  check('when the read hit its bound the total is «al menos» and says why', bounded5.summary === 'Se muestran 5 de al menos 6: solo se leen los 100 incidentes más recientes de cada tipo.', bounded5.summary);
  const view028 = buildComplianceState(of028, [agentRow('028', 'zimbraHldap', of028)]);
  const only028 = alerts.buildImpactEventsModel(events, { ...view028, results: [...of028, opExp7] }, { scope, agentId: '028' });
  check('machine view: the manager\'s alerts yes, another machine\'s security alert no', only028.rows.length === 1 && only028.rows[0].agentId === '000', only028.rows.map((r: any) => r.id));
  check('without results nothing is shown', alerts.buildImpactEventsModel(events, undefined, { scope }).rows.length === 0);

  // Real-shaped warnings (op.acc.1's collector): `parametro` + `motivo`, the same motive for two parameters.
  const sameMotive = 'no es un entero no negativo; se usa el valor por defecto de la libreria';
  const realShaped = alerts.buildImpactEventsModel(normalizeWazuhAlerts([
    hit('024', 'wazuh-real', { ensfacil: 'op.acc.1', event: 'collector_warning', parametro: 'OPACC1_UID_MIN', valor: 'abc', motivo: sameMotive }, 2),
    hit('024', 'wazuh-real', { ensfacil: 'op.acc.1', event: 'collector_warning', parametro: 'OPACC1_RETENCION_DIAS', valor: '-1', motivo: sameMotive }, 2),
    hit('024', 'wazuh-real', { ensfacil: 'op.acc.1', event: 'collector_warning', parametro: 'OPACC1_UID_MIN', valor: 'xyz', motivo: sameMotive }, 1),
  ]), whole, { scope });
  const tips = realShaped.rows.map((row: any) => row.description).sort();
  check('same motive, different parameter: two rows, each naming its parameter (a new value of the same one is the same problem)',
    realShaped.rows.length === 2 && tips[0] === 'Parámetro OPACC1_RETENCION_DIAS' && tips[1] === 'Parámetro OPACC1_UID_MIN' && realShaped.rows.every((row: any) => row.label === sameMotive), realShaped.rows);
  const bare = alerts.buildImpactEventsModel(normalizeWazuhAlerts([hit('024', 'wazuh-real', { ensfacil: 'op.acc.1', event: 'collector_warning' }, 2)]), whole, { scope });
  check('a warning with nothing to tell: Spanish texts, never the type id', bare.rows.length === 1 && bare.rows[0].description === 'Sin más detalle del agente.' && bare.rows[0].label === 'Advertencia del recolector ENS.', bare.rows);
  const named = alerts.buildImpactEventsModel(normalizeWazuhAlerts([
    hit('024', 'wazuh-real', { ensfacil: 'op.acc.1', event: 'collector_warning', requisito: 'op.acc.1.r2.1', parametro: 'P', motivo: 'm' }, 2),
    hit('024', 'wazuh-real', { ensfacil: 'op.acc.1', event: 'collector_warning', requisito: 'op.acc.1.2', parametro: 'P', motivo: 'm' }, 2),
  ]), whole, { scope });
  check('a warning that names its requirement shows only if that requirement applies', named.rows.length === 1 && named.rows[0].description === 'Parámetro P · requisito op.acc.1.2', named.rows);

  console.log('4. The server builds them from a bounded aggregation, as the engine would in memory');
  const clock = now;
  const docs: any[] = [...raw];
  for (let h = 200; h >= 1; h -= 8) {
    docs.push(hit('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-04' }, h));
    docs.push(hit('000', 'wazuh-manager', { ensfacil: 'op.exp.7', event: 'collector_run' }, h));
  }
  const monitor = (id: string, name: string, group: string[]) => ({ _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.20', _source: { id, name, group, status: 'active', timestamp: at(0.1), manager: 'manager' } });
  const configuration = { ...defaultENSConfigurationTemplate, scope: { mode: 'group', agentIds: [], groupIds: ['ens'] }, updatedAt: '2026-10-14T10:00:00.000Z' };
  const indexer = createFakeIndexer([
    ...docs,
    monitor('024', 'wazuh-real', ['ens']),
    monitor('028', 'zimbraHldap', ['ens']),
    monitor('099', 'otro', ['otros']),
    { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt: configuration.updatedAt } },
  ], { clock: () => clock.getTime() });
  const clients = { asCurrentUser: indexer, asInternalUser: indexer };
  const logger: any = { info() {}, warn() {}, debug() {}, error() {} };
  const service = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  const runAll = await service.run(clients, normalizeQuery({ include: 'dashboard', timeZone: 'UTC' }));
  const panel = (buildEvaluationResponse(runAll) as any).dashboard.impactEvents;
  const reference = (agentIds: string[]) => normalizeWazuhAlerts(docs.filter(d => agentIds.includes(d._source.agent.id)));
  const expected = alerts.buildImpactEventsModel(reference(['000', '024', '028']), runAll.state, { scope: runAll.ctx.scope });
  check('whole view: the server\'s alerts are the in-memory ones', JSON.stringify(panel) === JSON.stringify(expected) && panel.total > 0, { panel, expected });
  check('…with the warning seen three times as one row', panel.rows.some((row: any) => row.count === 3 && /servicio sin unidad/.test(row.label)), panel.rows);
  const request = indexer.log.find((entry: any) => entry.body?.aggs?.collector_warning);
  const sizes = Object.values(request?.body?.aggs || {}).map((agg: any) => agg.aggs.incidents.multi_terms.size);
  check('one aggregation without documents, each type bounded', request?.body.size === 0 && sizes.length === 2 && sizes.every(size => size === OPERATIONAL_ALERTS_PER_TYPE), request?.body);
  const topFilters = request?.body.query.bool.filter || [];
  const eventFilter = topFilters.find((f: any) => f.terms?.['data.event'])?.terms['data.event'] || [];
  const controlFilter = topFilters.find((f: any) => f.terms?.['data.ensfacil'])?.terms['data.ensfacil'] || [];
  check('the bound is spent only on the two types and on ACTIVE controls', eventFilter.length === 2 && controlFilter.includes('op.exp.3') && controlFilter.includes('op.acc.1') && !controlFilter.includes('mp.eq.2'), { eventFilter, controlFilter });
  const run024 = await service.run(clients, normalizeQuery({ include: 'dashboard', agentId: '024', timeZone: 'UTC' }));
  const panel024 = (buildEvaluationResponse(run024) as any).dashboard.impactEvents;
  check('machine view 024: as in memory with its facts and the manager\'s', JSON.stringify(panel024) === JSON.stringify(alerts.buildImpactEventsModel(reference(['000', '024']), run024.state, { scope: run024.ctx.scope, agentId: '024' })) && panel024.total > 0, panel024);

  const many = createFakeIndexer(
    Array.from({ length: 130 }, (_, i) => hit('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', origen: 'o', objeto: `obj${i}`, motivo: 'm' }, 1 + i / 10)),
    { clock: () => clock.getTime() }
  );
  const boundedRead = readOperationalIncidents((await many.search(buildImpactEventsRequest([]))).body.aggregations);
  const bounded = boundedRead.incidents;
  const newest = bounded.map((incident: any) => incident.fields.objeto);
  check('130 different incidents: the 100 most recent, and the read says it was cut', bounded.length === OPERATIONAL_ALERTS_PER_TYPE && boundedRead.truncated && newest.includes('obj0') && newest.includes('obj99') && !newest.includes('obj100'), bounded.length);
  const longOne = createFakeIndexer([hit('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_warning', parametro: 'P', motivo: 'x'.repeat(2000) }, 1)], { clock: () => clock.getTime() });
  const longRead = readOperationalIncidents((await longOne.search(buildImpactEventsRequest([]))).body.aggregations);
  check('key values are cut on read (the cache holds no unbounded motive)', longRead.incidents[0]?.fields.motivo.length === 500 && !longRead.truncated, longRead.incidents[0]?.fields.motivo.length);

  // A failing alerts read degrades only its panel, and is not cached.
  let failing = true;
  const flaky = createFakeIndexer([
    ...docs,
    monitor('024', 'wazuh-real', ['ens']),
    monitor('028', 'zimbraHldap', ['ens']),
    { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt: configuration.updatedAt } },
  ], { clock: () => clock.getTime(), failShards: (body: any) => (failing && body?.aggs?.collector_warning ? 1 : 0) });
  const warned: string[] = [];
  const flakyService = createEvaluationService({ engineControls: [], logger: { ...logger, warn: (m: string) => warned.push(m) }, securityEnabled: true, clock: () => clock, firstResponseMs: 600000 });
  const flakyClients = { asCurrentUser: flaky, asInternalUser: flaky };
  const down = buildEvaluationResponse(await flakyService.run(flakyClients, normalizeQuery({ include: 'dashboard', timeZone: 'UTC' }))) as any;
  check('alerts read fails: the panel says so, the rest of the dashboard stands',
    down.dashboard.impactEvents.error === 'No se han podido leer las alertas operativas.' && down.dashboard.impactEvents.rows.length === 0 && down.dashboard.findings && down.dashboard.compliance && warned.some(m => /operational alerts/.test(m)),
    down.dashboard.impactEvents);
  failing = false;
  const up = buildEvaluationResponse(await flakyService.run(flakyClients, normalizeQuery({ include: 'dashboard', timeZone: 'UTC' }))) as any;
  check('…and the next request reads again', !up.dashboard.impactEvents.error && up.dashboard.impactEvents.total > 0, up.dashboard.impactEvents);

  console.log('5. The panel lists them');
  h.reset();
  evaluations.dashboard = { data: { meta, dashboard: { ...buildENSDashboardModel(whole), impactEvents: model } }, isLoading: false };
  let screen = await h.render(EnsDashboardMain);
  const box = screen.slice(screen.indexOf('ALERTAS OPERATIVAS SOC'));
  check('severity, control, machine, motive, last observation and repetitions',
    /ADVERTENCIA/.test(box) && /op\.exp\.3/.test(box) && /wazuh-real/.test(box) && /servicio no declarado/.test(box) && /Última observación:/.test(box) && /3 observaciones/.test(box),
    box.slice(0, 900));
  check('says how many are left out', /Se muestran 5 de 6/.test(box), box.slice(-300));
  check('the motive\'s detail as a tooltip', h.findAll('div').some(node => node.props?.title === 'systemd · atd'));
  h.reset();
  evaluations.dashboard = { data: { meta, dashboard: { ...buildENSDashboardModel(whole), impactEvents: alerts.buildImpactEventsModel([], whole, { scope }) } }, isLoading: false };
  screen = await h.render(EnsDashboardMain);
  check('without alerts it says so', /Sin alertas operativas en la ventana y el alcance de esta vista/.test(screen) && !/Se muestran/.test(screen));
  h.reset();
  evaluations.dashboard = { data: { meta, dashboard: { ...buildENSDashboardModel(whole), impactEvents: alerts.unreadOperationalAlertsModel() } }, isLoading: false };
  screen = await h.render(EnsDashboardMain);
  check('an unread panel says it could not read them, and the rest of the dashboard renders', /No se han podido leer las alertas operativas/.test(screen) && !/Sin alertas operativas en la ventana/.test(screen) && /REQUISITOS QUE REQUIEREN ATENCIÓN/.test(screen));

  if (failures.length) {
    console.log(`\n${failures.length} FAIL`);
    process.exit(1);
  }
  console.log('\nALL OK');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
