/** Maturity (CMM L0-L5): each level reached, each gate failing, grey and red limits, deviations, DRAFT, records. */
import {
  accreditedLevelOf,
  computeControlMaturity,
  computeMaturityGates,
  dayIn,
  describeAssessment,
  describeMaturityHeadline,
  describeTrend,
  summarizeControlMaturity,
  summarizeMaturityDistribution,
  wholePeriodDays,
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
import { opAcc1CatalogDefinition } from '../common/ens/catalog/op-acc-1';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};

const now = new Date('2026-10-20T10:00:00Z');
const period = { from: new Date(now.getTime() - 30 * 86400e3).toISOString(), to: now.toISOString() };
const stamp = { recordedAt: '2026-10-01T10:00:00Z', recordedBy: 'ana' };
const allDays = wholePeriodDays(period, now, 'Europe/Madrid');
const day = (offset: number) => new Date(now.getTime() - offset * 86400e3).toISOString().slice(0, 10);
const addDaysTo = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400e3).toISOString().slice(0, 10);

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

// 120 daily snapshots climbing from 60 % to 89 %: above the 80 % threshold the last weeks.
const snapshotsImproving = Array.from({ length: 120 }, (_, i) => ({ date: day(120 - i), score: 60 + Math.floor(i / 4) }));

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
  period,
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
  ['L1.facts', i => (i.activity = { days: [] }), /Ningún hecho del control en los últimos 30 días/],
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
check('sustained at 100 % is an improving trend', describeTrend(snapshotsImproving.map(s => ({ ...s, score: 100 })), now).improving);

console.log('3. Grey and red limit, never force L0');
check('red by measure at L3 (score 50, latest snapshot within the threshold): still L5', level(without(i => (i.result = result({ status: 'NO_CUMPLE', score: 50, nonConformities: [{ origin: 'MEDIDA' }] }) as any))) === 5);
const machines = (stopped: string[]) => [{ agentId: '024', agentName: 'wazuh-real', days: stopped }, { agentId: '028', agentName: 'ldap', days: [...allDays, '2026-10-20'] }];
const stopped = without(i => {
  i.result = result({ status: 'NO_CUMPLE', score: 50, nonConformities: [{ origin: 'NO_EVIDENCIADA', cause: 'COLLECTION', agents: [{ agentId: '024', agentName: 'wazuh-real' }] }] }) as any;
  i.activity = { days: [...allDays, '2026-10-20'], machines: machines(allDays.slice(0, -4)) };
});
check('a machine that stopped reporting: L1, not L0 (the other one does not hide it)', level(stopped) === 1);
check('...and the reason names the machine', /wazuh-real: 4 de 7 días sin hechos/.test(gateOf(stopped, 'L2.recurrence').reason), gateOf(stopped, 'L2.recurrence'));
const evidenceMissing = without(i => {
  i.result = result({ status: 'NO_CUMPLE', score: 75, measuredRequirements: 3, unmeasuredRequirements: ['op.acc.1.2'], nonConformities: [{ origin: 'NO_EVIDENCIADA', cause: 'COLLECTION', agents: [{ agentId: '024' }] }] }) as any;
});
check('an evidence that never arrives while the collector reports daily: L2 (it fails continuity, not recurrence)', level(evidenceMissing) === 2 && /3 de 4 requisitos/.test(gateOf(evidenceMissing, 'L3.continuity').reason));
const greyCollection = without(i => (i.result = result({ status: 'NO_EVALUABLE', nonConformities: [{ origin: 'NO_EVIDENCIADA', cause: 'COLLECTION' }] }) as any));
check('grey by collection (or a stale collector): L1 with facts', level(greyCollection) === 1 && /gris por falta de recogida/.test(gateOf(greyCollection, 'L2.recurrence').reason), gateOf(greyCollection, 'L2.recurrence'));
const greyConfiguration = without(i => (i.result = result({ status: 'NO_EVALUABLE', missingParameters: ['P-04'], nonConformities: [{ origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION' }] }) as any));
check('grey by configuration with daily facts: L2 (the auditor\'s L2: recurrent, no parameters declared)', level(greyConfiguration) === 2 && gateOf(greyConfiguration, 'L2.recurrence').passed && /Faltan P-04/.test(gateOf(greyConfiguration, 'L3.parameters').reason));
check('grey by catalog with daily facts: L2 (the unproven requirement fails continuity)', level(without(i => (i.result = result({ status: 'NO_EVALUABLE', measuredRequirements: 3, unmeasuredRequirements: ['op.acc.1.r1.1'], nonConformities: [{ origin: 'NO_EVIDENCIADA', cause: 'CATALOG' }] }) as any))) === 2);
check('grey without facts: L0', level(without(i => { i.result = result({ status: 'NO_EVALUABLE' }) as any; i.activity = { days: [] }; })) === 0);

console.log('4. Own period, retention and machines added later');
const limited = without(i => (i.period = { ...period, historyFrom: new Date(now.getTime() - 12 * 86400e3).toISOString() }));
check('facts only for 12 days (a new installation): L2 and L3 fail with «Faltan 17 días de historial» (whole days before the oldest fact) → L1', level(limited) === 1 && /Faltan 17 días de historial: solo hay hechos desde el 2026-10-08/.test(gateOf(limited, 'L2.recurrence').reason) && /Faltan 17 días de historial/.test(gateOf(limited, 'L3.continuity').reason), [gateOf(limited, 'L2.recurrence'), gateOf(limited, 'L3.continuity')]);
check('...and L1 says since when', gateOf(limited, 'L1.facts').passed && /solo hay hechos desde el 2026-10-08/.test(gateOf(limited, 'L1.facts').reason));
check('boundary: the oldest fact on the first whole day of the period (a 30-day retention) covers it: L2 and L3 pass', allDays[0] === '2026-09-21' && level(without(i => (i.period = { ...period, historyFrom: '2026-09-21T10:00:00Z' }))) === 5);
const oneDay = without(i => (i.period = { ...period, historyFrom: '2026-09-22T10:00:00Z' }));
check('...one whole day short: «Falta 1 día de historial» (singular)', level(oneDay) === 1 && /^Falta 1 día de historial/.test(gateOf(oneDay, 'L2.recurrence').reason), gateOf(oneDay, 'L2.recurrence'));
const unknownFirst = without(i => (i.period = { ...period, firstFactsUnknown: true }));
check('first facts unreadable: every machine counts from the start of the period, and the reason says so', /no se pudo leer el primer hecho de cada máquina/.test(gateOf(unknownFirst, 'L3.continuity').reason) && /no se pudo leer el primer hecho/.test(gateOf(unknownFirst, 'L2.recurrence').reason));
const added = without(i => (i.activity = { days: allDays, machines: [{ agentId: '024', agentName: 'wazuh-real', days: allDays }, { agentId: '031', agentName: 'nuevo', days: allDays.slice(-10), since: allDays[allDays.length - 10] }] }));
check('a machine added 10 days ago is not held below L3 for the days before it', gateOf(added, 'L3.continuity').passed && /nuevo desde el/.test(gateOf(added, 'L3.continuity').reason), gateOf(added, 'L3.continuity'));
const addedGap = without(i => (i.activity = { days: allDays, machines: [{ agentId: '024', days: allDays }, { agentId: '031', agentName: 'nuevo', days: allDays.slice(-10, -2), since: allDays[allDays.length - 10] }] }));
check('...but its own gaps since then still count', !gateOf(addedGap, 'L3.continuity').passed && /nuevo: 2 de 10 días sin hechos .*en el alcance desde el/.test(gateOf(addedGap, 'L3.continuity').reason), gateOf(addedGap, 'L3.continuity'));

console.log('5. L4 with a deviation');
const below = snapshotsImproving.map((s, i) => ({ ...s, score: i < 110 ? 90 : 60 }));
const firstBelow = below[110].date;
const deviating = without(i => (i.snapshots = below));
check('latest snapshot below the threshold, no review since: L3', level(deviating) === 3 && new RegExp(`Desviación desde el ${firstBelow}`).test(gateOf(deviating, 'L4.threshold').reason), gateOf(deviating, 'L4.threshold'));
const oldReview = without(i => { i.snapshots = below; i.record.reviews = [{ ...stamp, date: day(15), reviewer: 'Luis', result: 'CON_DESVIACIONES', actions: 'Ajuste' }] as any; });
check('a review before the deviation began does not treat it', !gateOf(oldReview, 'L4.threshold').passed);
const treatedWithActions = without(i => { i.snapshots = below; i.record.reviews.push({ ...stamp, date: firstBelow, reviewer: 'Luis', result: 'CON_DESVIACIONES', actions: 'Alta de cuentas revisada' } as any); });
check('a review on the first day below, with actions: L4 passes, says who treated it', gateOf(treatedWithActions, 'L4.threshold').passed && /tratada en la revisión del .* de Luis/.test(gateOf(treatedWithActions, 'L4.threshold').reason));
const inTreatment = without(i => { i.snapshots = below; i.record.reviews.push({ ...stamp, date: day(2), reviewer: 'Ana', result: 'DESVIACION_EN_TRATAMIENTO', actions: '' } as any); });
check('«Desviación en tratamiento» without actions also treats it', gateOf(inTreatment, 'L4.threshold').passed);
const conformingEmpty = without(i => { i.snapshots = below; i.record.reviews.push({ ...stamp, date: day(2), reviewer: 'Ana', result: 'CONFORME', actions: '' } as any); });
check('a conforming review without actions does not', !gateOf(conformingEmpty, 'L4.threshold').passed);
const recovered = without(i => (i.snapshots = below.map((s, k) => (k === below.length - 1 ? { ...s, score: 85 } : s))));
check('back within the threshold: passes again', gateOf(recovered, 'L4.threshold').passed && /dentro del umbral/.test(gateOf(recovered, 'L4.threshold').reason));
const noSnapshots = without(i => { i.snapshots = []; i.result = result({ score: 50, status: 'PARCIAL' }) as any; });
check('no snapshots: the threshold gate fails («sin instantáneas para comprobar el umbral»), never «dentro del umbral»', !gateOf(noSnapshots, 'L4.threshold').passed && /sin instantáneas para comprobar el umbral/.test(gateOf(noSnapshots, 'L4.threshold').reason) && !/dentro/.test(gateOf(noSnapshots, 'L4.threshold').reason) && level(noSnapshots) === 3);
const oldSeries = without(i => (i.snapshots = snapshotsImproving.map(snapshot => ({ ...snapshot, date: addDaysTo(snapshot.date, -4) }))));
check('snapshots older than 2 days: L4 fails «la última instantánea es del …», and so does the L5 trend', !gateOf(oldSeries, 'L4.threshold').passed && /la última instantánea es del 2026-10-15/.test(gateOf(oldSeries, 'L4.threshold').reason) && !gateOf(oldSeries, 'L5.trend').passed && /Sin instantáneas recientes: la última instantánea es del 2026-10-15/.test(gateOf(oldSeries, 'L5.trend').reason) && level(oldSeries) === 3, [gateOf(oldSeries, 'L4.threshold'), gateOf(oldSeries, 'L5.trend')]);
check('...a snapshot from 2 days ago is still recent', gateOf(without(i => (i.snapshots = snapshotsImproving.map(snapshot => ({ ...snapshot, date: addDaysTo(snapshot.date, -1) })))), 'L4.threshold').passed);
const unreadable = without(i => (i.snapshotsError = 'sin permiso de lectura de wazuh-ens-snapshots'));
check('snapshots that cannot be read: it fails too («no se pueden leer las instantáneas»)', !gateOf(unreadable, 'L4.threshold').passed && /no se pueden leer las instantáneas/.test(gateOf(unreadable, 'L4.threshold').reason) && level(unreadable) === 3);

console.log('6. The control maturity');
const assessedWith = (level: number, extra: Record<string, unknown> = {}, mutate: (i: ENSMaturityInput) => void = () => undefined) =>
  without(i => { i.record.assessments = [{ ...stamp, level, reviewer: 'Luis', date: '2026-10-19', ...extra } as any]; mutate(i); });
const m = computeControlMaturity(full());
check('without assessment: target by category (MEDIO = MEDIA → L3)', m.target === 3 && m.targetSource === 'CATEGORY' && m.applicableLevel === 'MEDIO');
check('headline without assessment', describeMaturityHeadline(m) === 'Madurez: sin valorar (acreditado L5, objetivo L3)', describeMaturityHeadline(m));
check('the target follows the applicable level (T ALTO → L4)', computeControlMaturity(without(i => (i.global = { traceabilityLevel: 'ALTO' } as any))).target === 4);
check('targets editable in General', computeControlMaturity(without(i => (i.targets = resolveMaturityTargets({ global: { maturityTargets: { MEDIO: 2 } } } as any)))).target === 2);
const a = computeControlMaturity(assessedWith(3, { target: 5, accredited: 5 }));
check('assessment: level, its target and «Madurez: L3 (acreditado L5, objetivo L5)»', a.assessed?.level === 3 && a.target === 5 && a.targetSource === 'ASSESSMENT' && describeMaturityHeadline(a) === 'Madurez: L3 (acreditado L5, objetivo L5)');
const above = computeControlMaturity(assessedWith(4, { justification: 'Proceso auditado', accredited: 2 }, i => (i.record.attestations = [])));
check('assessed above the level stored when recording: marked', above.accredited === 2 && above.aboveAccredited && !above.accreditedDropped);
const aboveText = describeAssessment(above);
check('...the report line always says who and when, and the mark the stored level', /Valorado L4 por Luis el 2026-10-19\. Justificación: Proceso auditado/.test(aboveText.line || '') && /por encima de lo acreditado al registrarlo \(L4 frente a L2\)/.test(aboveText.mark || ''), aboveText);
const dropped = computeControlMaturity(assessedWith(3, { accredited: 3 }, i => (i.activity = { days: allDays.slice(0, 5) })));
check('valid when recorded, the evidence drops later: not «above», but «revisar la valoración»', !dropped.aboveAccredited && dropped.accreditedDropped && /acreditaba L3 al valorarlo \(2026-10-19\); hoy acredita L1: revisar la valoración/.test(describeAssessment(dropped).dropped || ''), describeAssessment(dropped));
check('assessed at or below the stored level is not marked', !a.aboveAccredited && !describeAssessment(a).mark);
const catalogRequirements = opAcc1CatalogDefinition.requirements;
const draft = computeControlMaturity(without(i => { i.control = { id: 'mp.eq.3', status: 'DRAFT', requirements: catalogRequirements }; i.result = result({ status: 'NO_APLICA' }) as any; }));
check('DRAFT: not measured, no gates, no accredited level, applicable at its level', !draft.measured && draft.applicable && draft.accredited === undefined && draft.gates.length === 0);
check('DRAFT headline: «sin medición todavía»', describeMaturityHeadline(draft) === 'Madurez: sin valorar (sin medición todavía, objetivo L3)', describeMaturityHeadline(draft));
const draftHigh = computeControlMaturity(without(i => { i.control = { id: 'x.1', status: 'DRAFT', requirements: [{ applicability: { levels: ['ALTO'] } }] as any }; i.ensLevel = 'BAJO'; }));
check('DRAFT with nothing applicable at the organisation\'s level: not applicable', !draftHigh.applicable);
const draftAssessed = computeControlMaturity(without(i => { i.control = { id: 'mp.eq.3', status: 'DRAFT' }; i.record.assessments = [{ ...stamp, level: 2, reviewer: 'L', date: '2026-10-19', justification: 'Procedimiento en papel', accredited: 0 } as any]; }));
check('DRAFT: a person may still assess it', draftAssessed.assessed?.level === 2 && draftAssessed.aboveAccredited);
const notApplicable = computeControlMaturity(without(i => (i.result = result({ status: 'NO_APLICA' }) as any)));
check('NO_APLICA: not applicable, out of the distribution', !notApplicable.applicable && describeMaturityHeadline(notApplicable) === 'Madurez: no aplica en este nivel');
const distribution = summarizeMaturityDistribution([m, a, above, draft, notApplicable].map(summarizeControlMaturity));
check('distribution: accredited and assessed per level (notMeasured, notAssessed), below target', distribution.applicable === 4 && distribution.accredited.L5 === 2 && distribution.accredited.L2 === 1 && distribution.accredited.notMeasured === 1 && distribution.assessed.notAssessed === 2 && distribution.assessed.L3 === 1 && distribution.assessed.L4 === 1 && distribution.belowTarget === 1, distribution);
const versions = without(i => (i.record.attestations = [attestation(), attestation({ version: '1.0', approvedAt: '2024-01-10', validUntil: '2025-01-10' })]));
check('recording an older version afterwards does not replace the one in force', gateOf(versions, 'L3.procedure').passed && computeControlMaturity(versions).attestation?.version === '2.0');

console.log('7. Records: validation and append-only');
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
check('review with deviations needs actions; «Desviación en tratamiento» does not', v('review', { date: '2026-10-01', reviewer: 'Luis', result: 'NO_CONFORME' }).errors.some(e => /Acciones/.test(e)) && v('review', { date: '2026-10-01', reviewer: 'Luis', result: 'DESVIACION_EN_TRATAMIENTO' }).errors.length === 0);
check('prototype keys are not values: result «toString», origin «constructor»', v('review', { date: '2026-10-01', reviewer: 'L', result: 'toString' }).errors.some(e => /Resultado/.test(e)) && v('feedback', { reference: 'D-1', source: 'constructor', description: 'x', openedAt: '2026-01-01' }).errors.some(e => /Origen/.test(e)));
check('indicators: threshold 0-100 and period', v('indicators', { minScore: 120, reviewPeriodDays: 0 }).errors.length === 2);
check('feedback: version only when closing', v('feedback', { reference: 'D-1', source: 'op.cont.3', description: 'x', openedAt: '2026-01-01', procedureVersion: '2' }).errors.some(e => /solo al cerrar/.test(e)));
let records: any = appendMaturityEntry(undefined, 'op.acc.1', 'review', { ...stamp, date: '2026-09-01', reviewer: 'A', result: 'CONFORME', actions: '' });
const first = JSON.stringify(records.controls['op.acc.1'].reviews[0]);
records = appendMaturityEntry(records, 'op.acc.1', 'review', { ...stamp, date: '2026-10-01', reviewer: 'B', result: 'CONFORME', actions: '' });
check('append keeps the earlier entry untouched', records.controls['op.acc.1'].reviews.length === 2 && JSON.stringify(records.controls['op.acc.1'].reviews[0]) === first);
records.controls['op.acc.1'].reviews.push(null, { date: 3 });
check('the reader skips malformed entries, never throws', readControlMaturityRecord(records, 'op.acc.1').reviews.length === 2 && readControlMaturityRecord('x' as any, 'op.acc.1').reviews.length === 0 && readControlMaturityRecord(records, 'toString').reviews.length === 0);
check('targets shape: absent valid, a level per category', validateMaturityTargetsShape(undefined).length === 0 && validateMaturityTargetsShape({ BAJO: 2 }).length === 0 && validateMaturityTargetsShape({ BASICA: 2, MEDIO: 7 }).length === 2);
const withTargets = { ...defaultENSConfigurationTemplate, global: { ...defaultENSConfigurationTemplate.global, maturityTargets: { BAJO: 1, MEDIO: 3, ALTO: 4 } } };
check('a configuration with targets is valid', validateENSConfigurationStructure(withTargets).valid, validateENSConfigurationStructure(withTargets).errors);
check('...and a 1.3.0 plugin loads it', validate130(withTargets).valid, validate130(withTargets).errors);
check('the day of an instant in the configured zone (Madrid after midnight is already the next day)', dayIn(new Date('2026-10-19T23:30:00Z'), 'Europe/Madrid') === '2026-10-20' && dayIn(new Date('2026-10-19T23:30:00Z'), 'Not/AZone') === '2026-10-19');

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
