/** Maturity (CMM L0-L5): each level reached, each gate failing, red and grey limits, DRAFT, targets, records. */
import {
  accreditedLevelOf,
  computeControlMaturity,
  computeMaturityGates,
  describeMaturityHeadline,
  describeTrend,
  summarizeControlMaturity,
  summarizeMaturityDistribution,
  wholeWindowDays,
} from '../common/ens/maturity/maturity-engine';
import type { ENSMaturityInput } from '../common/ens/maturity/maturity-engine';
import {
  appendMaturityEntry,
  readControlMaturityRecord,
  resolveMaturityTargets,
  validateMaturityEntry,
  validateMaturityTargetsShape,
} from '../common/ens/maturity/maturity-records';
import type { ENSControlMaturityRecord } from '../common/ens/maturity/types';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { validateENSConfigurationStructure as validate130 } from './fixtures/configuration-structure-validator-1.3.0';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};

const now = new Date('2026-10-20T10:00:00Z');
const window = { from: new Date(now.getTime() - 30 * 86400e3).toISOString(), to: now.toISOString() };
const stamp = { recordedAt: '2026-10-01T10:00:00Z', recordedBy: 'ana' };
const allDays = wholeWindowDays(window, now, 'Europe/Madrid');
const emptyRecord = (): ENSControlMaturityRecord => ({ attestations: [], reviews: [], assessments: [], indicators: [], feedback: [] });

const attestation = (over: Record<string, unknown> = {}) => ({
  ...stamp,
  reference: 'PR-ACC-01',
  version: '2.0',
  link: 'https://intranet.example.es/pr-acc-01.pdf',
  approvedAt: '2026-03-01',
  validUntil: '2027-03-01',
  disseminatedAt: '2026-03-05',
  disseminatedTo: 'Equipo de sistemas',
  owner: 'Responsable de Seguridad',
  ...over,
});

const snapshotsImproving = Array.from({ length: 120 }, (_, i) => ({
  date: new Date(now.getTime() - (120 - i) * 86400e3).toISOString().slice(0, 10),
  score: 60 + Math.floor(i / 4),
}));

const result = (over: Record<string, unknown> = {}) => ({
  status: 'CUMPLE',
  score: 100,
  coverage: 100,
  applicableRequirements: 4,
  measuredRequirements: 4,
  unmeasuredRequirements: [],
  missingParameters: [],
  parameters: [],
  nonConformities: [],
  ...over,
});

// Everything needed for L5.
const full = (): ENSMaturityInput => ({
  control: { id: 'op.acc.1', status: 'ACTIVE', levelDimension: ['T', 'A'] },
  result: result() as any,
  configured: true,
  activity: { days: [...allDays, '2026-10-20'] },
  window,
  timeZone: 'Europe/Madrid',
  record: {
    attestations: [attestation({ version: '1.0', approvedAt: '2025-01-10' }), attestation()],
    reviews: [{ ...stamp, date: '2026-09-15', reviewer: 'Luis', result: 'CONFORME', actions: '' }],
    assessments: [],
    indicators: [{ ...stamp, minScore: 80, reviewPeriodDays: 365 }],
    feedback: [
      { ...stamp, reference: 'LEC-7', source: 'op.exp.9.3', description: 'Alta tardía', openedAt: '2026-02-01' },
      { ...stamp, reference: 'LEC-7', source: 'op.exp.9.3', description: 'Alta tardía', openedAt: '2026-02-01', closedAt: '2026-03-10', procedureVersion: '2.0' },
    ],
  } as any,
  targets: { BAJO: 2, MEDIO: 3, ALTO: 4 },
  ensLevel: 'MEDIO',
  global: {},
  snapshots: snapshotsImproving,
  now,
});

const level = (input: ENSMaturityInput) => accreditedLevelOf(computeMaturityGates(input));
const gateOf = (input: ENSMaturityInput, id: string) => computeMaturityGates(input).find(g => g.id === id)!;
const without = (mutate: (input: ENSMaturityInput) => void) => {
  const input = full();
  mutate(input);
  return input;
};

console.log('1. Each level reached');
check('everything: L5', level(full()) === 5, computeMaturityGates(full()).filter(g => !g.passed));
check('no feedback: L4', level(without(i => (i.record.feedback = []))) === 4);
check('no reviews: L3', level(without(i => (i.record.reviews = []))) === 3);
check('no procedure: L2', level(without(i => (i.record.attestations = []))) === 2);
check('facts only on some days: L1', level(without(i => (i.activity = { days: allDays.slice(0, 5) }))) === 1);
check('no facts: L0', level(without(i => (i.activity = { days: [] }))) === 0);
check('the levels are cumulative: L5 gates passing do not lift a failed L3', level(without(i => (i.record.attestations = [attestation({ validUntil: '2026-01-01' })]))) === 2);

console.log('2. Each gate failing, with its reason');
const failing: [string, (i: ENSMaturityInput) => void, RegExp][] = [
  ['L1.facts', i => (i.activity = { days: [] }), /Ningún hecho/],
  ['L1.facts', i => (i.activity = undefined), /No se pudo leer/],
  ['L2.recurrence', i => (i.activity = { days: allDays.filter(d => d !== allDays[allDays.length - 2]) }), new RegExp(`Últimos 7 días: 1 de 7 días sin hechos \\(${allDays[allDays.length - 2]}\\)`)],
  ['L2.recurrence', i => (i.activity = { days: allDays, machines: [{ agentId: '024', agentName: 'wazuh-real', days: allDays }, { agentId: '028', agentName: 'ldap', days: allDays.slice(0, -3) }] }), /ldap: 3 de 7 días sin hechos/],
  ['L3.parameters', i => (i.result = result({ missingParameters: ['P-03'] }) as any), /Faltan P-03/],
  ['L3.parameters', i => (i.result = result({ parameters: [{ id: 'P-02', required: true, status: 'INVALID' }] }) as any), /no válidos P-02/],
  ['L3.parameters', i => (i.configured = false), /no está en la configuración activa/],
  ['L3.procedure', i => (i.record.attestations = []), /Sin procedimiento/],
  ['L3.procedure', i => (i.record.attestations = [attestation({ validUntil: '2026-10-01' })]), /vencido el 2026-10-01/],
  ['L3.procedure', i => (i.record.attestations = [attestation({ disseminatedTo: '' })]), /falta destinatarios de la difusión/],
  ['L3.procedure', i => (i.record.attestations = [attestation({ link: 'https://EJEMPLO.invalido/x.pdf' })]), /sin enlace utilizable/],
  ['L3.continuity', i => (i.activity = { days: allDays.slice(3) }), /3 de \d+ días sin hechos/],
  ['L3.continuity', i => (i.activity = { days: allDays, machines: [{ agentId: '024', days: allDays }, { agentId: '028', agentName: 'ldap', days: allDays.slice(2) }] }), /ldap: 2 de \d+ días sin hechos/],
  ['L3.continuity', i => (i.result = result({ measuredRequirements: 3, unmeasuredRequirements: ['op.acc.1.4'] }) as any), /3 de 4 requisitos evidenciados; sin evidencia: op\.acc\.1\.4/],
  ['L4.threshold', i => (i.record.indicators = []), /Sin umbral/],
  ['L4.reviews', i => (i.record.reviews = []), /Sin revisiones/],
  ['L4.reviews', i => (i.record.reviews = [{ ...stamp, date: '2025-06-01', reviewer: 'Luis', result: 'CONFORME', actions: '' }] as any), /fuera de la periodicidad de 365 días/],
  ['L5.trend', i => (i.snapshots = snapshotsImproving.slice(-30)), /Hacen falta 90 días/],
  ['L5.trend', i => (i.snapshots = snapshotsImproving.map(s => ({ ...s, score: 160 - s.score }))), /Sin mejora/],
  ['L5.feedback', i => (i.record.feedback = []), /Sin lecciones/],
  ['L5.feedback', i => (i.record.feedback = [i.record.feedback[0]]), /ninguna cerrada/],
  ['L5.feedback', i => (i.record.feedback = [{ ...i.record.feedback[1], procedureVersion: '1.0' }]), /aprobada después de su apertura/],
];
failing.forEach(([id, mutate, reason]) => {
  const g = gateOf(without(mutate), id);
  check(`${id} fails: ${reason.source.slice(0, 50)}`, g && !g.passed && reason.test(g.reason), g);
});
const passed = computeMaturityGates(full());
check('every gate passes with its reason written', passed.length === 9 && passed.every(g => g.passed && g.reason.length > 10), passed);
check('gate origins: A, Doc, D+A, Doc+D', passed.map(g => g.origin).join(',') === 'A,A,A,Doc,A,D+A,D+A,A,Doc+D');
check('the threshold gate says the deviation (ámbar + L4 is valid)', /desviación: por debajo del umbral/.test(gateOf(without(i => (i.result = result({ score: 60, status: 'PARCIAL' }) as any)), 'L4.threshold').reason));
check('sustained at 100 % is an improving trend', describeTrend(snapshotsImproving.map(s => ({ ...s, score: 100 })), now).improving);

console.log('3. Red and grey limit, never force L0');
check('red by measure (NO_CUMPLE, MEDIDA) at L3: still L5', level(without(i => (i.result = result({ status: 'NO_CUMPLE', score: 50, nonConformities: [{ origin: 'MEDIDA' }] }) as any))) === 5);
const machines = (stopped: string[]) => [{ agentId: '024', agentName: 'wazuh-real', days: stopped }, { agentId: '028', agentName: 'ldap', days: [...allDays, '2026-10-20'] }];
const collection = without(i => {
  i.result = result({ status: 'NO_CUMPLE', score: 50, nonConformities: [{ origin: 'NO_EVIDENCIADA', cause: 'COLLECTION', agents: [{ agentId: '024', agentName: 'wazuh-real' }] }] }) as any;
  i.activity = { days: [...allDays, '2026-10-20'], machines: machines(allDays.slice(0, -4)) };
});
check('a machine that stopped reporting: L1, not L0 (the other one does not hide it)', level(collection) === 1);
check('...and the reason names the machine', /wazuh-real: 4 de 7 días sin hechos/.test(gateOf(collection, 'L2.recurrence').reason), gateOf(collection, 'L2.recurrence'));
const evidenceMissing = without(i => {
  i.result = result({ status: 'NO_CUMPLE', score: 75, measuredRequirements: 3, unmeasuredRequirements: ['op.acc.1.2'], nonConformities: [{ origin: 'NO_EVIDENCIADA', cause: 'COLLECTION', agents: [{ agentId: '024' }] }] }) as any;
});
check('an evidence that never arrives while the collector reports daily: L2 (it fails continuity, not recurrence)', level(evidenceMissing) === 2 && /3 de 4 requisitos/.test(gateOf(evidenceMissing, 'L3.continuity').reason));
check('grey (NO_EVALUABLE): L1 with facts', level(without(i => (i.result = result({ status: 'NO_EVALUABLE' }) as any))) === 1);
check('...the reason says it could not be measured', /no se ha podido medir \(gris\)/.test(gateOf(without(i => (i.result = result({ status: 'NO_EVALUABLE' }) as any)), 'L2.recurrence').reason));
check('grey without facts: L0', level(without(i => { i.result = result({ status: 'NO_EVALUABLE' }) as any; i.activity = { days: [] }; })) === 0);

console.log('4. The control maturity');
const assessed = (level: number, extra: Record<string, unknown> = {}) =>
  without(i => (i.record.assessments = [{ ...stamp, level, reviewer: 'Luis', date: '2026-10-19', ...extra } as any]));
const m = computeControlMaturity(full());
check('without assessment: target by category (MEDIO = MEDIA → L3)', m.target === 3 && m.targetSource === 'CATEGORY' && m.applicableLevel === 'MEDIO');
check('headline without assessment', describeMaturityHeadline(m) === 'Madurez: sin valorar (acreditado L5, objetivo L3)', describeMaturityHeadline(m));
const dims = computeControlMaturity(without(i => (i.global = { traceabilityLevel: 'ALTO' } as any)));
check('the target follows the applicable level (T ALTO → L4)', dims.applicableLevel === 'ALTO' && dims.target === 4);
const custom = computeControlMaturity(without(i => (i.targets = resolveMaturityTargets({ global: { maturityTargets: { MEDIO: 2 } } } as any))));
check('targets editable in General', custom.target === 2);
const a = computeControlMaturity(assessed(3, { target: 5 }));
check('assessment: level, its target and «Madurez: L3 (acreditado L5, objetivo L5)»', a.assessed?.level === 3 && a.target === 5 && a.targetSource === 'ASSESSMENT' && describeMaturityHeadline(a) === 'Madurez: L3 (acreditado L5, objetivo L5)');
const above = computeControlMaturity(without(i => { i.record.assessments = [{ ...stamp, level: 4, reviewer: 'L', date: '2026-10-19', justification: 'Proceso auditado' } as any]; i.record.attestations = []; }));
check('assessed above accredited is marked', above.accredited === 2 && above.aboveAccredited);
check('assessed at or below accredited is not', !a.aboveAccredited);
const draft = computeControlMaturity(without(i => { i.control = { id: 'mp.eq.3', status: 'DRAFT' }; i.result = result({ status: 'NO_APLICA' }) as any; }));
check('DRAFT: not measured, no gates, no accredited level', !draft.measured && draft.applicable && draft.accredited === undefined && draft.gates.length === 0);
check('DRAFT headline: «sin medición todavía»', describeMaturityHeadline(draft) === 'Madurez: sin valorar (sin medición todavía, objetivo L3)', describeMaturityHeadline(draft));
const draftAssessed = computeControlMaturity(without(i => { i.control = { id: 'mp.eq.3', status: 'DRAFT' }; i.record.assessments = [{ ...stamp, level: 2, reviewer: 'L', date: '2026-10-19', justification: 'Procedimiento en papel' } as any]; }));
check('DRAFT: a person may still assess it', draftAssessed.assessed?.level === 2 && draftAssessed.aboveAccredited);
const notApplicable = computeControlMaturity(without(i => (i.result = result({ status: 'NO_APLICA' }) as any)));
check('NO_APLICA: not applicable, out of the distribution', !notApplicable.applicable && describeMaturityHeadline(notApplicable) === 'Madurez: no aplica en este nivel');
const distribution = summarizeMaturityDistribution([m, a, above, draft, notApplicable].map(summarizeControlMaturity));
check('distribution: accredited and assessed per level, below target', distribution.applicable === 4 && distribution.accredited.L5 === 2 && distribution.accredited.L2 === 1 && distribution.accredited.sinMedicion === 1 && distribution.assessed.sinValorar === 2 && distribution.assessed.L3 === 1 && distribution.assessed.L4 === 1 && distribution.belowTarget === 1, distribution);

console.log('5. Records: validation and append-only');
const v = (kind: any, value: unknown, accredited?: any) => validateMaturityEntry(kind, value, now, accredited);
check('a complete attestation is valid', v('attestation', attestation({ recordedAt: undefined, recordedBy: undefined })).errors.length === 0, v('attestation', attestation()).errors);
check('attestation: dissemination record and owner required', v('attestation', { ...attestation(), disseminatedTo: '', owner: ' ' }).errors.length === 2);
check('attestation: the example link is refused', v('attestation', attestation({ link: 'https://EJEMPLO.invalido/a.pdf' })).errors.some(e => /Enlace/.test(e)));
check('attestation: approval in the future is refused', v('attestation', attestation({ approvedAt: '2027-01-01', validUntil: '2028-01-01', disseminatedAt: '2027-01-02' })).errors.some(e => /posterior a hoy/.test(e)));
check('assessed > accredited needs a justification', v('assessment', { level: 4, reviewer: 'Luis', date: '2026-10-19' }, 2).errors.some(e => /supera al acreditado \(L2\)/.test(e)));
check('...and with it, it is valid', v('assessment', { level: 4, reviewer: 'Luis', date: '2026-10-19', justification: 'Auditado' }, 2).errors.length === 0);
check('assessed ≤ accredited needs none', v('assessment', { level: 2, reviewer: 'Luis', date: '2026-10-19' }, 2).errors.length === 0);
check('accredited unknown: justification required', v('assessment', { level: 1, reviewer: 'Luis', date: '2026-10-19' }).errors.some(e => /no se ha podido calcular/.test(e)));
check('assessment: level out of range refused', v('assessment', { level: 6, reviewer: 'L', date: '2026-10-19', justification: 'x' }, 5).errors.some(e => /de 0 a 5/.test(e)));
check('review not conforming needs actions', v('review', { date: '2026-10-01', reviewer: 'Luis', result: 'NO_CONFORME' }).errors.some(e => /Acciones/.test(e)));
check('indicators: threshold 0-100 and period', v('indicators', { minScore: 120, reviewPeriodDays: 0 }).errors.length === 2);
check('feedback: version only when closing', v('feedback', { reference: 'D-1', source: 'op.cont.3', description: 'x', openedAt: '2026-01-01', procedureVersion: '2' }).errors.some(e => /solo al cerrar/.test(e)));
let configuration: any = { ...defaultENSConfigurationTemplate };
configuration = appendMaturityEntry(configuration, 'op.acc.1', 'review', { ...stamp, date: '2026-09-01', reviewer: 'A', result: 'CONFORME', actions: '' });
const first = JSON.stringify(configuration.maturity.controls['op.acc.1'].reviews[0]);
configuration = appendMaturityEntry(configuration, 'op.acc.1', 'review', { ...stamp, date: '2026-10-01', reviewer: 'B', result: 'CONFORME', actions: '' });
check('append keeps the earlier entry untouched', configuration.maturity.controls['op.acc.1'].reviews.length === 2 && JSON.stringify(configuration.maturity.controls['op.acc.1'].reviews[0]) === first);
configuration.maturity.controls['op.acc.1'].reviews.push(null, { date: 3 });
check('the reader skips malformed entries, never throws', readControlMaturityRecord(configuration, 'op.acc.1').reviews.length === 2 && readControlMaturityRecord({ maturity: 'x' } as any, 'op.acc.1').reviews.length === 0);
check('targets shape: absent valid, a level per category', validateMaturityTargetsShape(undefined).length === 0 && validateMaturityTargetsShape({ BAJO: 2 }).length === 0 && validateMaturityTargetsShape({ BASICA: 2, MEDIO: 7 }).length === 2);
const withTargets = { ...configuration, global: { ...configuration.global, maturityTargets: { BAJO: 1, MEDIO: 3, ALTO: 4 } } };
check('a document with maturity data and targets is still a valid configuration', validateENSConfigurationStructure(withTargets).valid, validateENSConfigurationStructure(withTargets).errors);
check('...and a 1.3.0 plugin loads it', validate130(withTargets).valid, validate130(withTargets).errors);

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
