/** op.cont.3: judgment of the periodic tests of the continuity plan. */
import { opCont3PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-cont-3.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opCont3CatalogDefinition } from '../common/ens/catalog/op-cont-3';
import { opCont3Configuration } from '../common/ens/configuration/data/op-cont-3-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../common/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { resolveControlLevel } from '../common/ens/core/control-level';
import { buildOpCont3ReportModel } from '../public/ens/reports/op-cont-3-report-model';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail !== '' ? ` — ${String(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

type Linea = Record<string, unknown>;

const PASS = '2026-10-09T12:05';
const NOW = new Date('2026-10-09T12:30:00Z');

const REQ = 'op.cont.3.1';
const common = { requisito: REQ, plano: 'central' };

const reading = (ts: string, event: string, evidence: string, file: string, rows: number, extra: Linea = {}): Linea => ({
  ts, event: event, evidence_id: evidence, ...common,
  fichero: file, presente: 'si', legible: 'si', cabecera: 'ok', filas: rows, filas_invalidas: 0, lineas_invalidas: '-', ...extra,
});

const TEST_FILE = '/etc/ensfacil/continuity-test-register.tsv';
const DEFICIENCY_FILE = '/etc/ensfacil/continuity-deficiency-register.tsv';

const test = (ts: string, linea: number, start: string, fin: string, type: string, scenario: string, systems: string, result: string, deficiencies: number, extra: Linea = {}): Linea => ({
  ts, event: 'continuity_test_recorded', evidence_id: 'EV-01', ...common,
  linea, inicio: start, fin, tipo: type, escenario: scenario, sistemas: systems, participantes: 'RSI, Sistemas', resultado: result, deficiencias: deficiencies,
  referencia: `https://intranet.ejemplo/continuidad/prueba-${linea}.pdf`,
  ...(systems === '-' || !['parcial', 'simulacro'].includes(type)
    ? { medicion: 'no_aplica', medido_desde: '-', medido_hasta: '-', dias_sin_alertas: '-', candidatos: 0, agents_disconnection_time: '-' }
    : {
        medicion: 'completa',
        medido_desde: new Date(Date.parse(start) - 24 * 3600 * 1000).toISOString().replace('.000Z', 'Z'),
        medido_hasta: new Date(Date.parse(fin) + 24 * 3600 * 1000).toISOString().replace('.000Z', 'Z'),
        dias_sin_alertas: '-',
        candidatos: systems.split(',').length,
        agents_disconnection_time: 600,
      }),
  ...extra,
});

const deficiency = (ts: string, linea: number, id: string, testStart: string, deadline: string, situation: string, closing: string, version: string, extra: Linea = {}): Linea => ({
  ts, event: 'continuity_deficiency_recorded', evidence_id: 'EV-05', ...common,
  linea, deficiencia_id: id, prueba_inicio: testStart, descripcion: `deficiencia ${id}`, responsable: 'Responsable de Sistemas',
  plazo: deadline, situacion: situation, cierre: closing, version_plan: version, referencia: '-', ...extra,
});

const availability = (ts: string, testStart: string, testEnd: string, system: string, id: string, agent: string, events: string, extra: Linea = {}): Linea => ({
  ts, event: 'availability_event_observed', evidence_id: 'EV-03', ...common,
  prueba_inicio: testStart, prueba_fin: testEnd, sistema: system, agente_id: id, agente: agent,
  eventos: events, eventos_total: events === '-' ? 0 : events.split(',').length, alertas_propias: 120, ...extra,
});

const heartbeat = (ts: string, covered = 'EV-01,EV-03,EV-05,EV-06,EV-08'): Linea => ({
  ts, event: 'collector_run', resultado: 'completada', evidencias_cubiertas: covered, tipo_servidor: 'manager', emisor: 'recolector',
});

const DRILL = '2026-09-17T20:00:00Z';
const DRILL_END = '2026-09-17T23:30:00Z';
const DESKTOP = '2026-06-18T09:00:00Z';
const REVISION = '2026-03-12T00:00:00Z';

const pass = (ts = PASS): Linea[] => {
  const t = (s: number) => `${ts}:${String(s).padStart(2, '0')}Z`;

  return [
    reading(t(0), 'continuity_test_register_read', 'EV-01', TEST_FILE, 3),
    test(t(1), 2, REVISION, '2026-03-12T23:59:59Z', 'revision_documental', 'pérdida total de CPD', '-', 'satisfactorio', 1),
    test(t(1), 3, DESKTOP, '2026-06-18T12:00:00Z', 'escritorio', 'ciberincidente con cifrado de datos', '-', 'parcial', 2),
    test(t(1), 4, DRILL, DRILL_END, 'simulacro', 'Pérdida total de CPD', 'wazuh-real,28', 'satisfactorio', 1),
    reading(t(2), 'continuity_deficiency_register_read', 'EV-05', DEFICIENCY_FILE, 4),
    deficiency(t(3), 2, 'DEF-2026-01', REVISION, '2026-04-30', 'cerrada', '2026-04-20', '2.1'),
    deficiency(t(3), 3, 'DEF-2026-02', DESKTOP, '2026-08-31', 'cerrada', '2026-08-25', '2.2'),
    deficiency(t(3), 4, 'DEF-2026-03', DESKTOP, '2026-08-31', 'cerrada', '2026-08-28', '-'),
    deficiency(t(3), 5, 'DEF-2026-04', DRILL, '2026-11-30', 'abierta', '-', '-'),
    availability(t(4), DRILL, DRILL_END, 'wazuh-real', '024', 'wazuh-real', 'parada@2026-09-17T20:05:00Z,arranque@2026-09-17T22:41:00Z'),
    availability(t(4), DRILL, DRILL_END, '28', '028', 'ldap-zimbra', 'desconexion@2026-09-17T20:10:00Z,actividad@2026-09-17T21:20:00Z'),
    { ts: t(5), event: 'backup_restore_observed', evidence_id: 'EV-08', ...common,
      prueba_inicio: DRILL, prueba_fin: DRILL_END, agente_id: '026', agente: 'pbs-01', instante: '2026-09-17T21:00:00Z', resultado: 'ok', coincide: 'si', backup_id: 'host/wazuh-real' },
    { ts: t(6), event: 'post_test_change_observed', evidence_id: 'EV-06', ...common,
      prueba_inicio: DRILL, prueba_fin: DRILL_END, sistema: 'wazuh-real', agente_id: '024', agente: 'wazuh-real', cambios: 3, rutas: '/etc/hosts,/etc/fstab',
      primera: '2026-09-18T08:00:00Z', ultima: '2026-09-18T09:10:00Z' },
    heartbeat(t(40)),
  ];
};

let counter = 0;

const RULE: Record<string, string> = {
  continuity_test_register_read: '111701', continuity_test_recorded: '111702',
  continuity_deficiency_register_read: '111703', continuity_deficiency_recorded: '111704',
  availability_event_observed: '111705', backup_restore_observed: '111706', post_test_change_observed: '111707',
  evidence_state: '111750', collector_run: '111797',
};

const MANAGER = { id: '000', name: 'Wazuh-4' };

const alert = (linea: Linea) => {
  counter += 1;
  const { ts, host: _host, ...data } = linea as Linea & { ts: string };

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: MANAGER,
      rule: { id: RULE[String(data.event)] || '111700', description: 'op.cont.3' },
      location: '/var/log/ensfacil/op_cont_3.json',
      data: Object.fromEntries(Object.entries({ ensfacil: 'op.cont.3', ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const events = (lineas: Linea[], changes: (l: Linea) => Linea | undefined = l => l): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas
      .map(l => changes({ ...l }))
      .filter((l): l is Linea => Boolean(l))
      .map(alert)
  );

const hoy = (changes?: (l: Linea) => Linea | undefined, extra: Linea[] = []) => events([...pass(), ...extra], changes);

const row = (event: string, where: (l: Linea) => boolean, change: Linea) => (l: Linea): Linea =>
  l.event === event && where(l) ? { ...l, ...change } : l;

const drill = (l: Linea) => l.inicio === DRILL || l.prueba_inicio === DRILL;

type Valores = Record<string, string[] | string | undefined>;

const configuration = (valores: Valores): ENSControlConfiguration => ({
  ...opCont3Configuration,
  parameters: opCont3Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

const TEST_RECORD = 'Registro ENSFácil (/etc/ensfacil/continuity-test-register.tsv)';
const DEFICIENCY_RECORD = 'Registro ENSFácil (/etc/ensfacil/continuity-deficiency-register.tsv)';

const BASE: Valores = {
  'P-01': '12',
  'P-02': ['revision_documental | revisión del plan | anual', 'escritorio | ejercicio de mesa | 12', 'simulacro | conmutación real al CPD alternativo | 12'],
  'P-03': ['pérdida total de CPD | todos', 'ciberincidente con cifrado de datos | correo, LDAP'],
  'P-04': TEST_RECORD,
  'P-05': DEFICIENCY_RECORD,
  'P-06': ['17/09/2026 | 20:00 | 23:30 | wazuh-real, 028'],
  'P-07': ['* | 4 | 0', '028 | 2 | 15'],
};

const NO_PARAMETERS: Valores = {};

const evaluate = (
  evs: ENSNormalizedEvent[],
  valores: Valores = BASE,
  level: ENSLevel = 'ALTO',
  now: Date = NOW
) => {
  const cfg = configuration(valores);
  const delControl = keepLatestRunStateFacts('op.cont.3', evs, now);
  const evidences = resolveEvidenceForControl('op.cont.3', delControl, '000', level, cfg, now);
  const context = buildPolicyContext(opCont3CatalogDefinition, cfg, level, delControl, evidences, now);
  const { decisions, runtimeVariables } = opCont3PolicyDefinition.evaluator!(context);
  const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, opCont3CatalogDefinition.requirements);
  const attestations = parseRequirementAttestations(cfg);
  const requirement = () =>
    evaluateRequirement(
      opCont3CatalogDefinition.requirements[0],
      level,
      tabla,
      false,
      decisions,
      'ACTIVE',
      attestations.get(REQ)
    );
  const evidence = (id: string) => tabla.find(e => e.id === id);
  const motive = () => decisions.find(d => d.trace.ruleId === REQ)?.reason || '';
  const de = (ev: string) => decisions.find(d => d.trace.ruleId === `${REQ}/${ev}`)?.reason || '';
  const motor = () =>
    evaluateENSControl(
      opCont3CatalogDefinition,
      cfg,
      level,
      evidences,
      {
        controlId: 'op.cont.3',
        policyId: opCont3PolicyDefinition.id,
        evaluatedAt: now.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      delControl
    );

  return { decisions, runtimeVariables, requisito: requirement, evidencia: evidence, motivo: motive, de, motor };
};

const estado = (r: ReturnType<typeof evaluate>, id: string) => `${r.evidencia(id)?.status} ${r.evidencia(id)?.gapCause || ''}`.trim();

section('1. Catalog: Availability at ALTO, manager plane, one requirement');

{
  check('op.cont.3 is governed by Availability', opCont3CatalogDefinition.levelDimension === 'D');
  check('se mide solo en el manager', JSON.stringify(opCont3CatalogDefinition.measurementPlanes) === '["manager"]');
  check('one requirement, ALTO only', opCont3CatalogDefinition.requirements.length === 1 && opCont3CatalogDefinition.requirements[0].applicability.levels.join(',') === 'ALTO');
  check('the control is ACTIVE', opCont3CatalogDefinition.status === 'ACTIVE', opCont3CatalogDefinition.status);
  check(
    'the requirement is decided with EV-01, EV-02, EV-04 and EV-05 (spec §6.3)',
    opCont3CatalogDefinition.requirements[0].evidenceIds.join(',') === 'EV-01,EV-02,EV-04,EV-05'
  );
  check(
    'the policy declares the same levels and evidences as the catalog',
    opCont3PolicyDefinition.requirements.every(r => {
      const c = opCont3CatalogDefinition.requirements.find(q => q.id === r.requirementId)!;

      return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',');
    })
  );
  check(
    'all facts with a verdict or measure are state facts (also the downs and restorations of each test)',
    ['continuity_test_register_read', 'continuity_test_recorded', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded', 'availability_event_observed', 'backup_restore_observed', 'post_test_change_observed'].every(t => getStateFactEventTypes('op.cont.3').has(t))
  );
  check(
    'D at MEDIO with category ALTA: the control is evaluated at MEDIO',
    resolveControlLevel(opCont3CatalogDefinition, 'ALTO', { availabilityLevel: 'MEDIO' }) === 'MEDIO'
  );
  check(
    'no contract fact is named like a failure or carries an `estado` field',
    pass().every(l => !/error|failed|missing|unauthorized/.test(String(l.event)) && !('estado' in l) && !('status' in l))
  );
}

section('2. Green: three tests up to date, the drill measured within the RTO, deficiencies being followed');

{
  const r = evaluate(hoy());

  check('op.cont.3.1 CUMPLE at ALTO', r.requisito().status === 'CUMPLE' && r.requisito().evidenced === true, r.motivo());
  ['EV-01', 'EV-02', 'EV-04', 'EV-05'].forEach(id => check(`${id} CUMPLE`, r.evidencia(id)?.status === 'CUMPLE', `${estado(r, id)} ${r.de(id)}`));
  check('EV-01 counts tests by type', /3 prueba\(s\) registrada\(s\) \(1 revision_documental, 1 escritorio, 0 parcial, 1 simulacro\)/.test(r.de('EV-01')), r.de('EV-01'));
  check('EV-02 gives the next due date (the annual documentary review, on 12/03/2027)', /próximo vencimiento es el 2027-03-12/.test(r.de('EV-02')), r.de('EV-02'));
  check(
    'EV-04: wazuh-real exactly 2 h 36 min (stop → start, RTO 4 h) and the LDAP, declared «28», at most 1 h 20 min (504 minus 10 min → its first alert; RTO 2 h + 15 min)',
    /wazuh-real \(024\): 1 caída\(s\): parada 2026-09-17T20:05:00Z: 2 h 36 min, restablecido \(arranque\) \(RTO 4 h\)/.test(r.de('EV-04')) && /28 \(ldap-zimbra, 028\): 1 caída\(s\): desconexion 2026-09-17T20:10:00Z: entre 0 min y 1 h 20 min, de vuelta antes de su primera alerta propia \(RTO 2 h \+ 15 min\)/.test(r.de('EV-04')),
    r.de('EV-04')
  );
  ['EV-03', 'EV-06', 'EV-07', 'EV-08'].forEach(id =>
    check(`${id} NO_APLICA as a report datum, not grey`, r.evidencia(id)?.status === 'NO_APLICA' && /Dato del informe/.test(r.de(id)), `${estado(r, id)} ${r.de(id)}`)
  );
  check('EV-07 flags the deficiency closed without a plan version', /corrección posiblemente nominal: DEF-2026-03/.test(r.de('EV-07')) && /DEF-2026-01 → versión 2\.1/.test(r.de('EV-07')), r.de('EV-07'));
  check('EV-08 shows the window\'s restoration', /pbs-01 \(026\) 2026-09-17T21:00:00Z: ok/.test(r.de('EV-08')), r.de('EV-08'));
  check('EV-06 shows the later FIM changes and the recorded deficiencies of that test', /wazuh-real \(024\) 3 cambio\(s\)/.test(r.de('EV-06')) && /1 deficiencia\(s\) registradas/.test(r.de('EV-06')), r.de('EV-06'));

  const report = buildOpCont3ReportModel(r.motor());
  check('the report shows the requirement with its verdict', report.fields[0].details.some(d => /op\.cont\.3\.1 .*: CUMPLE/.test(d)), report.fields[0].details.join(' | '));
  const measurement = report.fields.find(f => f.id === 'op.cont.3.campo5')!;
  check('the test measurement carries EV-04\'s state, which it feeds, and its chronology', measurement.status === 'CUMPLE' && measurement.details.some(d => /2 h 36 min/.test(d)), `${measurement.status} ${measurement.details.join(' | ')}`);
}

section('3. At MEDIA (no dimension at ALTO) everything is NO_APLICA');

{
  const r = evaluate(hoy(), BASE, 'MEDIO');

  check('op.cont.3.1 NO_APLICA', r.requisito().status === 'NO_APLICA', r.requisito().status);
  check('the policy emits no decision', r.decisions.length === 0, r.decisions.length);
  check('and no evidence comes out grey', ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'].every(id => r.evidencia(id)?.status === 'NO_APLICA'), ['EV-01', 'EV-05'].map(id => estado(r, id)).join(', '));
  check('not even without records or parameters', evaluate([], NO_PARAMETERS, 'MEDIO').requisito().status === 'NO_APLICA');
  check('the report comes out NO_APLICA per field', buildOpCont3ReportModel(r.motor()).fields.slice(1, 10).every(f => f.status === 'NO_APLICA'));
}

section('4. Red, first obligation: periodicity, scenarios and scope, each with its reversal');

{
  const p01 = evaluate(hoy(), { ...BASE, 'P-01': '3' });
  check(
    'P-01 = 3: the cyber-incident scenario was tested on 18/06, 3 months and 3 weeks ago → NO_CUMPLE',
    p01.evidencia('EV-02')?.status === 'NO_CUMPLE' && /escenario «ciberincidente con cifrado de datos»: la última es del 2026-06-18, hace 3 meses \(P-01 = 3\)/.test(p01.de('EV-02')),
    p01.de('EV-02')
  );
  check('and the requirement measured NO_CUMPLE', p01.requisito().status === 'NO_CUMPLE' && p01.requisito().evidenced === true);
  check('REVERSAL: the same facts with P-01 = 12 → EV-02 CUMPLE', evaluate(hoy(), { ...BASE, 'P-01': '12' }).evidencia('EV-02')?.status === 'CUMPLE');

  const never = evaluate(hoy(), { ...BASE, 'P-03': [...(BASE['P-03'] as string[]), 'caída de proveedor crítico | ERP'] });
  check('a P-03 scenario never tested → NO_CUMPLE naming it', never.evidencia('EV-02')?.status === 'NO_CUMPLE' && /escenario «caída de proveedor crítico»: nunca se ha probado/.test(never.de('EV-02')), never.de('EV-02'));
  check(
    'scenarios are compared ignoring case and accents («PERDIDA TOTAL DE CPD»)',
    evaluate(hoy(), { ...BASE, 'P-03': ['PERDIDA TOTAL DE CPD | todos'] }).evidencia('EV-02')?.status === 'CUMPLE'
  );

  const byType = evaluate(hoy(), { ...BASE, 'P-02': ['escritorio | ejercicio de mesa | trimestral', 'simulacro | conmutación | 12'] });
  check('P-02 asks for a quarterly desktop test and the last is from 18/06 → NO_CUMPLE by type', byType.evidencia('EV-02')?.status === 'NO_CUMPLE' && /tipo escritorio: la última es del 2026-06-18.*P-02 = 3/.test(byType.de('EV-02')), byType.de('EV-02'));
  check('REVERSAL: semiannual → CUMPLE', evaluate(hoy(), { ...BASE, 'P-02': ['escritorio | ejercicio de mesa | semestral', 'simulacro | conmutación | 12'] }).evidencia('EV-02')?.status === 'CUMPLE');
  check(
    'a P-02 type without its own periodicity uses P-01',
    evaluate(hoy(), { ...BASE, 'P-01': '3', 'P-03': ['pérdida total de CPD | todos'], 'P-02': ['escritorio | x | ', 'simulacro | x | 12'] }).evidencia('EV-02')?.status === 'NO_CUMPLE'
  );

  const soloMesa = hoy(row('continuity_test_recorded', drill, { tipo: 'escritorio', medicion: 'no_aplica' }));
  const mesa = evaluate(soloMesa);
  check(
    'only documentary and desktop reviews → EV-01 NO_CUMPLE (none exercises the alternative means)',
    mesa.evidencia('EV-01')?.status === 'NO_CUMPLE' && /solo revisiones documentales o de escritorio/.test(mesa.de('EV-01')),
    mesa.de('EV-01')
  );
  check('and EV-02: the drill planned in P-02 has never been done', mesa.evidencia('EV-02')?.status === 'NO_CUMPLE' && /tipo simulacro: nunca se ha probado/.test(mesa.de('EV-02')), mesa.de('EV-02'));
  check(
    'REVERSAL: the same row as a partial test → EV-01 CUMPLE',
    evaluate(hoy(row('continuity_test_recorded', drill, { tipo: 'parcial' })), { ...BASE, 'P-02': [...(BASE['P-02'] as string[]).filter(f => !f.startsWith('simulacro')), 'parcial | conmutación de componentes | 12'] }).evidencia('EV-01')?.status === 'CUMPLE'
  );

  const sinReales = evaluate(hoy(), { ...BASE, 'P-02': ['revision_documental | x | 12', 'escritorio | x | 12'] });
  check('P-02 provides no modality that exercises the alternative means → EV-01 NO_CUMPLE', sinReales.evidencia('EV-01')?.status === 'NO_CUMPLE' && /ninguna modalidad \(parcial o simulacro\)/.test(sinReales.de('EV-01')), sinReales.de('EV-01'));
}

section('5. Red, EV-04: declared satisfactory and measured out of target');

{
  const lento = hoy(row('availability_event_observed', l => l.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-18T00:52:00Z' }));
  const r = evaluate(lento);
  check(
    'wazuh-real 4 h 47 min out of service with RTO 4 h and the test declared satisfactory → NO_CUMPLE (discrepancy)',
    r.evidencia('EV-04')?.status === 'NO_CUMPLE' && /declarada satisfactorio, y la medida la desmiente: wazuh-real \(024\) estuvo 4 h 47 min sin servicio \(parada 2026-09-17T20:05:00Z → arranque 2026-09-18T00:52:00Z\), por encima de su RTO 4 h/.test(r.de('EV-04')),
    r.de('EV-04')
  );
  check('and the requirement measured NO_CUMPLE', r.requisito().status === 'NO_CUMPLE' && r.requisito().evidenced === true);
  check('REVERSAL: P-07 with a general RTO of 5 h → CUMPLE', evaluate(lento, { ...BASE, 'P-07': ['* | 5 | 0', '028 | 2 | 15'] }).evidencia('EV-04')?.status === 'CUMPLE');
  const slowAndPartial = (l: Linea): Linea =>
    row('continuity_test_recorded', drill, { resultado: 'parcial' })(
      row('availability_event_observed', x => x.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-18T00:52:00Z' })(l)
    );
  const honest = evaluate(hoy(slowAndPartial));
  check(
    'REVERSAL: the same measurement with the test declared «parcial» → coherent, CUMPLE (EV-05 judges the correction)',
    honest.evidencia('EV-04')?.status === 'CUMPLE' && /coherente con lo declarado/.test(honest.de('EV-04')),
    `${estado(honest, 'EV-04')} ${honest.de('EV-04')}`
  );

  const withoutReturn = evaluate(hoy(row('availability_event_observed', l => l.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z', eventos_total: 1 })));
  check(
    'wazuh-real stopped and with no observed return (neither start nor own alert) in 27 h → it may have returned silently: NO_EVALUABLE, never CUMPLE nor NO_CUMPLE',
    withoutReturn.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /no se observó su vuelta/.test(withoutReturn.de('EV-04')),
    `${estado(withoutReturn, 'EV-04')} ${withoutReturn.de('EV-04')}`
  );

  const restoration = (result: string, coincide: string) =>
    hoy(row('backup_restore_observed', () => true, { resultado: result, coincide }));
  check(
    'the window\'s restoration failed and the test was declared satisfactory → NO_CUMPLE',
    evaluate(restoration('error', 'no')).evidencia('EV-04')?.status === 'NO_CUMPLE' && /falló la restauración de copias: pbs-01 \(026\)/.test(evaluate(restoration('error', 'no')).de('EV-04')),
    evaluate(restoration('error', 'no')).de('EV-04')
  );
  check('a restoration «ok» whose content does not match also fails', evaluate(restoration('ok', 'no')).evidencia('EV-04')?.status === 'NO_CUMPLE');
  check('REVERSAL: restoration ok and matches → CUMPLE', evaluate(restoration('ok', 'si')).evidencia('EV-04')?.status === 'CUMPLE');

  const after = evaluate(hoy(row('availability_event_observed', l => l.agente_id === '024', {
    eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-17T22:41:00Z,desconexion@2026-09-18T02:00:00Z,actividad@2026-09-18T09:00:00Z',
  })));
  check('a 7 h disconnection starting after the window does not count for the test → CUMPLE', after.evidencia('EV-04')?.status === 'CUMPLE', after.de('EV-04'));
}

section('5 bis. The down as an interval: NO_CUMPLE only with the lower bound; CUMPLE only with the upper');

{
  const ldap = (events: string, extra: Linea = {}) =>
    evaluate(hoy(row('availability_event_observed', l => l.agente_id === '028', { eventos: events, eventos_total: events.split(',').length, ...extra })));

  const antes = evaluate(hoy(row('availability_event_observed', l => l.agente_id === '024', { eventos: 'parada@2026-09-17T19:55:00Z,arranque@2026-09-18T03:00:00Z' })));
  check(
    'wazuh-real stopped at 19:55 (before the start, 20:00) and started at 03:00 → 7 h 5 min: NO_CUMPLE',
    antes.evidencia('EV-04')?.status === 'NO_CUMPLE' && /estuvo 7 h 5 min sin servicio/.test(antes.de('EV-04')),
    `${estado(antes, 'EV-04')} ${antes.de('EV-04')}`
  );
  const closedBefore = evaluate(hoy(row('availability_event_observed', l => l.agente_id === '024', {
    eventos: 'parada@2026-09-17T10:00:00Z,arranque@2026-09-17T11:00:00Z,parada@2026-09-17T20:05:00Z,arranque@2026-09-17T22:41:00Z',
  })));
  check('a down that started and ended before the start is not the test\'s → CUMPLE', closedBefore.evidencia('EV-04')?.status === 'CUMPLE', closedBefore.de('EV-04'));
  const orphan = evaluate(hoy(l =>
    row('continuity_test_recorded', drill, { medido_desde: DRILL })(
      row('availability_event_observed', x => x.agente_id === '024', { eventos: 'arranque@2026-09-17T21:00:00Z', eventos_total: 1 })(l)
    )
  ));
  check(
    'without looking before the start, a start with no previous down → NO_EVALUABLE (EVIDENCE), never «no downs»',
    orphan.evidencia('EV-04')?.status === 'NO_EVALUABLE' && orphan.evidencia('EV-04')?.gapCause === 'EVIDENCE' && /sin ninguna caída observada antes/.test(orphan.de('EV-04')),
    `${estado(orphan, 'EV-04')} ${orphan.de('EV-04')}`
  );

  const long = ldap('desconexion@2026-09-17T20:10:00Z,arranque@2026-09-17T22:30:00Z');
  check(
    'LDAP: 504 at 20:10 and start at 22:30 → at least 2 h 20 min, more than its RTO of 2 h 15 min: NO_CUMPLE',
    long.evidencia('EV-04')?.status === 'NO_CUMPLE' && /28 \(ldap-zimbra, 028\) estuvo al menos 2 h 20 min sin servicio/.test(long.de('EV-04')),
    `${estado(long, 'EV-04')} ${long.de('EV-04')}`
  );
  const doubtfulOne = ldap('desconexion@2026-09-17T20:10:00Z,arranque@2026-09-17T22:20:00Z');
  check(
    'LDAP: 504 at 20:10 and start at 22:20 → between 2 h 10 min and 2 h 20 min, and its RTO falls inside: NO_EVALUABLE',
    doubtfulOne.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /entre 2 h 10 min y 2 h 20 min/.test(doubtfulOne.de('EV-04')),
    `${estado(doubtfulOne, 'EV-04')} ${doubtfulOne.de('EV-04')}`
  );
  check('REVERSAL: start at 21:00 → at most 1 h: CUMPLE', ldap('desconexion@2026-09-17T20:10:00Z,arranque@2026-09-17T21:00:00Z').evidencia('EV-04')?.status === 'CUMPLE');
  const byActivity = ldap('desconexion@2026-09-17T20:10:00Z,actividad@2026-09-17T23:00:00Z');
  check(
    'LDAP back before its first alert at 23:00 (at most 3 h) → the first alert is only an upper bound: NO_EVALUABLE, never NO_CUMPLE',
    byActivity.evidencia('EV-04')?.status === 'NO_EVALUABLE',
    `${estado(byActivity, 'EV-04')} ${byActivity.de('EV-04')}`
  );
  const withoutTime = evaluate(hoy(row('continuity_test_recorded', drill, { agents_disconnection_time: '-' })));
  check(
    'without agents_disconnection_time, a down that starts with a 504 has no known beginning → NO_EVALUABLE by RECOGIDA',
    withoutTime.evidencia('EV-04')?.status === 'NO_EVALUABLE' && withoutTime.evidencia('EV-04')?.gapCause === 'COLLECTION' && /agents_disconnection_time/.test(withoutTime.de('EV-04')),
    `${estado(withoutTime, 'EV-04')} ${withoutTime.de('EV-04')}`
  );

  const withGap = evaluate(hoy(l =>
    row('continuity_test_recorded', drill, { medicion: 'parcial', dias_sin_alertas: '2026-09-17' })(
      row('availability_event_observed', x => x.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-18T00:52:00Z' })(l)
    )
  ));
  check(
    'the same 4 h 47 min down, but day 17 is missing → NO_EVALUABLE by RECOGIDA, not NO_CUMPLE',
    withGap.evidencia('EV-04')?.status === 'NO_EVALUABLE' && withGap.evidencia('EV-04')?.gapCause === 'COLLECTION',
    `${estado(withGap, 'EV-04')} ${withGap.de('EV-04')}`
  );
  const cut2 = evaluate(hoy(row('availability_event_observed', x => x.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-18T00:52:00Z', eventos_total: 60 })));
  check('and with the chronology truncated, the same: NO_EVALUABLE', cut2.evidencia('EV-04')?.status === 'NO_EVALUABLE', estado(cut2, 'EV-04'));

  const silent2 = evaluate(hoy(row('availability_event_observed', x => x.agente_id === '024', { eventos: '-', eventos_total: 0, alertas_propias: 0 })));
  check(
    'no downs, but not a single own alert in the whole range → it is not on record that it was running: NO_EVALUABLE',
    silent2.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /tampoco envió ninguna alerta propia/.test(silent2.de('EV-04')),
    `${estado(silent2, 'EV-04')} ${silent2.de('EV-04')}`
  );
  check('REVERSAL: no downs and with own alerts → CUMPLE', evaluate(hoy(row('availability_event_observed', x => x.agente_id === '024', { eventos: '-', eventos_total: 0 }))).evidencia('EV-04')?.status === 'CUMPLE');

  const lost2 = evaluate(hoy(l => (l.event === 'availability_event_observed' && l.agente_id === '024' ? undefined : l)));
  check(
    '1 of the 2 availability facts arrives (candidatos=2) → NO_EVALUABLE by RECOGIDA, not «wazuh-real is not an agent»',
    lost2.evidencia('EV-04')?.status === 'NO_EVALUABLE' && lost2.evidencia('EV-04')?.gapCause === 'COLLECTION' && /faltan 1/.test(lost2.de('EV-04')),
    `${estado(lost2, 'EV-04')} ${lost2.de('EV-04')}`
  );
  const withoutCandidates = evaluate(hoy(row('continuity_test_recorded', drill, { candidatos: '-' })));
  check('a row without `candidatos` → what was lost cannot be told: RECOGIDA', withoutCandidates.evidencia('EV-04')?.gapCause === 'COLLECTION', estado(withoutCandidates, 'EV-04'));
  const otherWindow = evaluate(hoy(row('availability_event_observed', () => true, { prueba_fin: '2026-09-17T22:00:00Z' })));
  check(
    'availability facts from another window (the row was edited: another end) do not count → missing, RECOGIDA',
    otherWindow.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /faltan 2/.test(otherWindow.de('EV-04')),
    `${estado(otherWindow, 'EV-04')} ${otherWindow.de('EV-04')}`
  );

  const restores = (change: Linea) => evaluate(hoy(row('backup_restore_observed', () => true, change)));
  check(
    'a failed PBS restoration the next day (outside the window, and PBS is not part of the test) → does not count: CUMPLE',
    restores({ instante: '2026-09-18T10:00:00Z', resultado: 'error', coincide: 'no' }).evidencia('EV-04')?.status === 'CUMPLE'
  );
  check(
    'the same, but from wazuh-real (a system of the test) → counts: NO_CUMPLE',
    restores({ instante: '2026-09-18T10:00:00Z', resultado: 'error', coincide: 'no', agente_id: '024', agente: 'wazuh-real' }).evidencia('EV-04')?.status === 'NO_CUMPLE'
  );
  check('a result without data («-») is not an explicit failure → CUMPLE', restores({ resultado: '-', coincide: '-' }).evidencia('EV-04')?.status === 'CUMPLE');
  const restoresOther = evaluate(hoy(row('backup_restore_observed', () => true, { resultado: 'error', prueba_fin: '2026-09-17T22:00:00Z' })));
  check('a failed restoration from another window (another end) does not count → CUMPLE', restoresOther.evidencia('EV-04')?.status === 'CUMPLE');

  const julyWithoutSystems = evaluate(hoy(undefined, [test(`${PASS}:01Z`, 5, '2026-07-20T18:00:00Z', '2026-07-20T21:00:00Z', 'parcial', 'pérdida total de CPD', '-', 'satisfactorio', 0)]).concat([]), BASE);
  check(
    'a partial July test without systems, next to the measured drill → no longer slips through: NO_EVALUABLE',
    julyWithoutSystems.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /no declara ningún sistema/.test(julyWithoutSystems.de('EV-04')),
    `${estado(julyWithoutSystems, 'EV-04')} ${julyWithoutSystems.de('EV-04')}`
  );
}

section('6. Red, second obligation: deficiencies past due, alive at the next test or without follow-up');

{
  const expired = evaluate(hoy(row('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-04', { plazo: '2026-10-01' })));
  check(
    'DEF-2026-04 open with deadline 01/10 → EV-05 NO_CUMPLE naming it',
    expired.evidencia('EV-05')?.status === 'NO_CUMPLE' && /fuera de plazo a 2026-10-09: DEF-2026-04 \(prueba del 2026-09-17, plazo 2026-10-01/.test(expired.de('EV-05')),
    expired.de('EV-05')
  );
  check('and the requirement NO_CUMPLE: testing without correcting does not comply', expired.requisito().status === 'NO_CUMPLE' && expired.requisito().evidenced === true);
  check('REVERSAL: the same fact with deadline 30/11 → CUMPLE', evaluate(hoy(row('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-04', { plazo: '2026-11-30' }))).evidencia('EV-05')?.status === 'CUMPLE');
  check(
    'the deadline expires at the END of its day: deadline 09/10 read on 09/10 at 12:05 → still on time',
    evaluate(hoy(row('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-04', { plazo: '2026-10-09' }))).evidencia('EV-05')?.status === 'CUMPLE'
  );

  const open03 = row('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-03', { situacion: 'abierta', cierre: '-', plazo: '2026-12-31' });
  const somethingElse = evaluate(hoy(open03));
  check(
    'DEF-2026-03 open and on time; afterwards only the drill of ANOTHER scenario (CPD) → does not count: CUMPLE',
    somethingElse.evidencia('EV-05')?.status === 'CUMPLE',
    `${estado(somethingElse, 'EV-05')} ${somethingElse.de('EV-05')}`
  );
  const sameScenario = test(`${PASS}:01Z`, 5, '2026-09-30T09:00:00Z', '2026-09-30T12:00:00Z', 'escritorio', 'Ciberincidente con cifrado de datos', '-', 'satisfactorio', 0);
  const viva = evaluate(hoy(open03, [sameScenario]));
  check(
    'and with a later test of the SAME scenario (30/09) → still alive after the next test: NO_CUMPLE',
    viva.evidencia('EV-05')?.status === 'NO_CUMPLE' && /siguen abiertas después de la prueba siguiente: DEF-2026-03 \(de la prueba del 2026-06-18; la siguiente fue escritorio del 2026-09-30/.test(viva.de('EV-05')),
    viva.de('EV-05')
  );
  const withoutScenario = (l: Linea) => open03(row('continuity_test_recorded', x => x.inicio === DESKTOP, { escenario: '-' })(l));
  check(
    'if the originating test has no scenario, the next of the same TYPE (desktop) counts → NO_CUMPLE',
    evaluate(hoy(withoutScenario, [{ ...sameScenario, escenario: '-' }])).evidencia('EV-05')?.status === 'NO_CUMPLE'
  );
  check('REVERSAL: without a scenario and only a drill afterwards (another type) → CUMPLE', evaluate(hoy(withoutScenario)).evidencia('EV-05')?.status === 'CUMPLE');

  const declaredOnes = evaluate(hoy(row('continuity_test_recorded', drill, { deficiencias: 3 })));
  check(
    'the drill declares 3 deficiencies and the record follows only 1 → NO_CUMPLE',
    declaredOnes.evidencia('EV-05')?.status === 'NO_CUMPLE' && /declara 3, en seguimiento 1/.test(declaredOnes.de('EV-05')),
    declaredOnes.de('EV-05')
  );
  check('REVERSAL: declares 1 → CUMPLE', evaluate(hoy(row('continuity_test_recorded', drill, { deficiencias: 1 }))).evidencia('EV-05')?.status === 'CUMPLE');

  const orphan = evaluate(hoy(undefined, [deficiency(`${PASS}:03Z`, 6, 'DEF-2026-05', '2026-07-01T00:00:00Z', '2026-08-31', 'cerrada', '2026-08-01', '2.2')]));
  check(
    'a deficiency whose prueba_inicio is no test of the record → NO_EVALUABLE by CONFIGURATION, naming it',
    orphan.evidencia('EV-05')?.status === 'NO_EVALUABLE' && orphan.evidencia('EV-05')?.gapCause === 'CONFIGURATION' && /DEF-2026-05 \(2026-07-01T00:00:00Z, línea 6\)/.test(orphan.de('EV-05')),
    `${estado(orphan, 'EV-05')} ${orphan.de('EV-05')}`
  );
}

section('7. Without a record: NO_EVALUABLE by CONFIGURATION; empty record: judged');

{
  const withoutRecord = evaluate(hoy(l => {
    if (l.event === 'continuity_test_recorded') {
      return undefined;
    }

    return l.event === 'continuity_test_register_read' ? { ...l, presente: 'no', legible: '-', cabecera: '-', filas: 0 } : l;
  }));
  ['EV-01', 'EV-02', 'EV-04'].forEach(id =>
    check(`without a test record, ${id} NO_EVALUABLE by CONFIGURATION`, withoutRecord.evidencia(id)?.status === 'NO_EVALUABLE' && withoutRecord.evidencia(id)?.gapCause === 'CONFIGURATION', estado(withoutRecord, id))
  );
  check('and the requirement not proven, never CUMPLE', withoutRecord.requisito().status === 'NO_CUMPLE' && withoutRecord.requisito().evidenced === false, `${withoutRecord.requisito().status} ${withoutRecord.requisito().evidenced}`);
  check('the motive says an absent record is not an empty record', /un registro ausente no es un registro vacío/.test(withoutRecord.de('EV-01')), withoutRecord.de('EV-01'));

  const empty = evaluate(hoy(l => {
    if (l.event === 'continuity_test_recorded' || l.event === 'availability_event_observed') {
      return undefined;
    }

    return l.event === 'continuity_test_register_read' ? { ...l, filas: 0 } : l;
  }));
  check('empty test record → EV-01 measured NO_CUMPLE: no test on record', empty.evidencia('EV-01')?.status === 'NO_CUMPLE' && /no consta ninguna prueba realizada/.test(empty.de('EV-01')), empty.de('EV-01'));
  check('and the requirement measured NO_CUMPLE', empty.requisito().status === 'NO_CUMPLE' && empty.requisito().evidenced === true);
  check('EV-04 with nothing to contrast does not come out CUMPLE', empty.evidencia('EV-04')?.status === 'NO_EVALUABLE', estado(empty, 'EV-04'));

  const emptied2 = evaluate(events([
    ...pass('2026-10-09T06:05'),
    ...pass().filter(l => l.event !== 'continuity_test_recorded').map(l => (l.event === 'continuity_test_register_read' ? { ...l, filas: 0 } : l)),
  ]));
  check(
    'a record emptied between two passes: the earlier pass\'s rows do not count → NO_CUMPLE',
    emptied2.evidencia('EV-01')?.status === 'NO_CUMPLE',
    `${estado(emptied2, 'EV-01')} ${emptied2.de('EV-01')}`
  );

  const withoutDeficiencies = evaluate(hoy(l => (l.event === 'continuity_deficiency_register_read' ? { ...l, presente: 'no', legible: '-', cabecera: '-', filas: 0 } : l.event === 'continuity_deficiency_recorded' ? undefined : l)));
  check('without a deficiency record → EV-05 NO_EVALUABLE by CONFIGURATION', withoutDeficiencies.evidencia('EV-05')?.status === 'NO_EVALUABLE' && withoutDeficiencies.evidencia('EV-05')?.gapCause === 'CONFIGURATION', estado(withoutDeficiencies, 'EV-05'));

  const withoutRows = (declaredDeficiencies: number) =>
    evaluate(hoy(l => (l.event === 'continuity_deficiency_recorded' ? undefined : l.event === 'continuity_deficiency_register_read' ? { ...l, filas: 0 } : l.event === 'continuity_test_recorded' ? { ...l, deficiencias: declaredDeficiencies, ...(declaredDeficiencies === 0 ? { resultado: 'satisfactorio' } : {}) } : l)));
  check('empty deficiency record and the tests declare deficiencies → NO_CUMPLE', withoutRows(2).evidencia('EV-05')?.status === 'NO_CUMPLE');
  check('REVERSAL: empty and no test declares deficiencies → CUMPLE (nothing to correct)', withoutRows(0).evidencia('EV-05')?.status === 'CUMPLE', withoutRows(0).de('EV-05'));

  const withoutDefsOf = (change: Linea) => (l: Linea): Linea | undefined =>
    l.event === 'continuity_deficiency_recorded' && l.deficiencia_id === 'DEF-2026-04'
      ? undefined
      : l.event === 'continuity_deficiency_register_read'
      ? { ...l, filas: 3 }
      : row('continuity_test_recorded', drill, { deficiencias: 0, ...change })(l);
  const failedOne = evaluate(hoy(withoutDefsOf({ resultado: 'fallido' })));
  check(
    'the drill declared «fallido» with 0 declared deficiencies and none in the record → NO_CUMPLE',
    failedOne.evidencia('EV-05')?.status === 'NO_CUMPLE' && /revelaron algo que corregir.*simulacro del 2026-09-17.*declarada fallido/.test(failedOne.de('EV-05')),
    `${estado(failedOne, 'EV-05')} ${failedOne.de('EV-05')}`
  );
  const exceeded = evaluate(hoy(l => withoutDefsOf({ resultado: 'parcial' })(row('availability_event_observed', x => x.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-18T00:52:00Z' })(l) as Linea)));
  check(
    'declared «parcial», with wazuh-real above its RTO and no deficiencies → NO_CUMPLE naming what was measured',
    exceeded.evidencia('EV-05')?.status === 'NO_CUMPLE' && /wazuh-real \(024\) por encima de su RTO 4 h/.test(exceeded.de('EV-05')),
    `${estado(exceeded, 'EV-05')} ${exceeded.de('EV-05')}`
  );
  const restoresBadly = evaluate(hoy(l => withoutDefsOf({})(row('backup_restore_observed', () => true, { resultado: 'error' })(l) as Linea)));
  check('satisfactory, but with a failed restoration in the window and no deficiencies → NO_CUMPLE', restoresBadly.evidencia('EV-05')?.status === 'NO_CUMPLE', restoresBadly.de('EV-05'));
  check('REVERSAL: satisfactory, measured within the RTO and no deficiencies → CUMPLE', evaluate(hoy(withoutDefsOf({}))).evidencia('EV-05')?.status === 'CUMPLE');

  const other = evaluate(hoy(), { ...BASE, 'P-04': 'Otra herramienta' });
  check('P-04 declares another tool → NO_EVALUABLE by CONFIGURATION (the integration does not exist)', other.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /la integración con esa herramienta no existe/.test(other.de('EV-01')), other.de('EV-01'));

  const header = evaluate(hoy(l => (l.event === 'continuity_test_register_read' ? { ...l, cabecera: 'distinta' } : l)));
  check('the record header is not the documented one → CONFIGURATION', header.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /no es la cabecera documentada/.test(header.de('EV-01')), header.de('EV-01'));
}

section('8. Without parameters: NO_EVALUABLE with cause CONFIGURATION, never CUMPLE by emptiness');

{
  const r = evaluate(hoy(), NO_PARAMETERS);

  check('op.cont.3.1 not proven (unmeasured NO_CUMPLE)', r.requisito().status === 'NO_CUMPLE' && r.requisito().evidenced === false, `${r.requisito().status} ${r.requisito().evidenced}`);
  ['EV-01', 'EV-02', 'EV-04', 'EV-05'].forEach(id =>
    check(`${id} unmeasured by CONFIGURATION`, r.evidencia(id)?.status === 'NO_EVALUABLE' && r.evidencia(id)?.gapCause === 'CONFIGURATION', estado(r, id))
  );
  check('the motive names the parameter', /P-04 \(Registro de las pruebas realizadas\) está sin configurar/.test(r.de('EV-01')), r.de('EV-01'));

  const withoutP07 = evaluate(hoy(), { ...BASE, 'P-07': undefined });
  check('only P-07 missing → EV-04 CONFIGURATION, and the requirement not proven', withoutP07.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && withoutP07.requisito().evidenced === false, estado(withoutP07, 'EV-04'));
  const withoutP03 = evaluate(hoy(), { ...BASE, 'P-03': undefined });
  check('only P-03 missing → EV-02 CONFIGURATION', withoutP03.evidencia('EV-02')?.status === 'NO_EVALUABLE' && withoutP03.evidencia('EV-02')?.gapCause === 'CONFIGURATION', estado(withoutP03, 'EV-02'));
  check('P-03 missing but something else expired → the measured NO_CUMPLE prevails', evaluate(hoy(), { ...BASE, 'P-03': undefined, 'P-02': ['escritorio | x | 1', 'simulacro | x | 12'] }).evidencia('EV-02')?.status === 'NO_CUMPLE');
  const withoutRto028 = evaluate(hoy(), { ...BASE, 'P-07': ['wazuh-real | 4 | 0'] });
  check('P-07 without an RTO for the LDAP or a general one (*) → CONFIGURATION naming it', withoutRto028.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /no declara el RTO de «28»/.test(withoutRto028.de('EV-04')), withoutRto028.de('EV-04'));

  const invalid = configuration(BASE)
    .parameters.map(p => ({ id: p.id, veredicto: validateParameterValue(p, p.value) }))
    .filter(v => !v.veredicto.valid);
  check('the BASE values are valid for the screen (selects and tables)', invalid.length === 0, invalid.map(v => `${v.id}: ${v.veredicto.reason}`).join('; '));
  check('«Otra herramienta» is also a valid P-04 value', validateParameterValue(configuration(BASE).parameters.find(p => p.id === 'P-04')!, 'Otra herramienta').valid);
}

section('9. Without a collector or with the source broken: NO_EVALUABLE by RECOGIDA');

{
  const nothing = evaluate([]);
  check('without any fact → not proven', nothing.requisito().evidenced === false && nothing.requisito().status === 'NO_CUMPLE');
  check('and by RECOGIDA, not by configuration', nothing.evidencia('EV-01')?.gapCause === 'COLLECTION' && nothing.evidencia('EV-05')?.gapCause === 'COLLECTION', `${estado(nothing, 'EV-01')} ${estado(nothing, 'EV-05')}`);

  const old = evaluate(hoy(), BASE, 'ALTO', new Date('2026-10-11T12:30:00Z'));
  check('two days without passes: the records read do not describe today → RECOGIDA', old.evidencia('EV-01')?.gapCause === 'COLLECTION' && /no está informando/.test(old.de('EV-01')), old.de('EV-01'));

  const conEstado = evaluate(hoy(l => (l.event === 'continuity_test_register_read' ? undefined : l), [
    { ts: `${PASS}:00Z`, event: 'evidence_state', evidence_id: 'EV-01', ...common, estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'sin python3 en el manager: no se puede leer el registro de pruebas' },
  ]));
  check('the collector declares it could not read → NO_EVALUABLE with ITS motive', conEstado.evidencia('EV-01')?.status === 'NO_EVALUABLE' && /sin python3/.test(conEstado.de('EV-01')), conEstado.de('EV-01'));

  const unreadable = evaluate(hoy(l => (l.event === 'continuity_test_register_read' ? { ...l, legible: 'no' } : l)));
  check('record present but unreadable → RECOGIDA', unreadable.evidencia('EV-01')?.gapCause === 'COLLECTION', estado(unreadable, 'EV-01'));

  const foreignOne = normalizeWazuhAlerts([alert({ ...pass()[0] })].map(a => ({ ...a, _source: { ...a._source, data: { ...a._source.data, ensfacil: 'op.cont.2' } } })));
  check('a fact from another control does not accredit op.cont.3', evaluate(foreignOne).evidencia('EV-01')?.status !== 'CUMPLE');
}

section('10. Each test\'s systems are matched with agents by ID or EXACT name');

{
  const systems = (valor: string) => evaluate(hoy(row('continuity_test_recorded', drill, { sistemas: valor })));

  check('«28» is agent 028 (ID without zeros)', systems('wazuh-real,28').evidencia('EV-04')?.status === 'CUMPLE');
  check('«WAZUH-REAL» is wazuh-real (ignoring case)', systems('WAZUH-REAL,28').evidencia('EV-04')?.status === 'CUMPLE');
  const id24 = evaluate(hoy(row('availability_event_observed', l => l.agente_id === '024', { agente_id: '24' }), []), BASE);
  check('a fact with agente_id «24» matches «wazuh-real» and «024» (normalized on both sides)', id24.evidencia('EV-04')?.status === 'CUMPLE' && evaluate(hoy(l => (l.event === 'availability_event_observed' && l.agente_id === '024' ? { ...l, agente_id: '24' } : l.event === 'continuity_test_recorded' && drill(l) ? { ...l, sistemas: '024,28' } : l))).evidencia('EV-04')?.status === 'CUMPLE');

  const withoutAgent = (valor: string, candidates: number) => (l: Linea): Linea | undefined =>
    l.event === 'availability_event_observed' && l.agente_id === '024'
      ? undefined
      : row('continuity_test_recorded', drill, { sistemas: valor, candidatos: candidates })(l);
  const similar = evaluate(hoy(withoutAgent('wazuh-rea,28', 1)));
  check(
    '«wazuh-rea» is NOT wazuh-real: it is not an agent, it is said, and it does not block because the LDAP is measured → CUMPLE',
    similar.evidencia('EV-04')?.status === 'CUMPLE' && /Sin medida, porque no son agentes de Wazuh: wazuh-rea/.test(similar.de('EV-04')),
    `${estado(similar, 'EV-04')} ${similar.de('EV-04')}`
  );
  const none = evaluate(hoy(l => (l.event === 'availability_event_observed' ? undefined : row('continuity_test_recorded', drill, { sistemas: 'switch-core', candidatos: 0 })(l))));
  check(
    'if NO system of the test is an agent → NO_EVALUABLE: its result cannot be contrasted',
    none.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /ninguno de sus sistemas \(switch-core\) es un agente de Wazuh/.test(none.de('EV-04')),
    `${estado(none, 'EV-04')} ${none.de('EV-04')}`
  );

  const dos = hoy(undefined, [availability(`${PASS}:04Z`, DRILL, DRILL_END, 'wazuh-real', '041', 'wazuh-real', '-')]);
  const ambiguous = evaluate(dos);
  check(
    'a name with two agents (024 and 041) → not chosen: NO_EVALUABLE by CONFIGURATION asking for the ID',
    ambiguous.evidencia('EV-04')?.status === 'NO_EVALUABLE' && ambiguous.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /Decláralo por su ID/.test(ambiguous.de('EV-04')),
    `${estado(ambiguous, 'EV-04')} ${ambiguous.de('EV-04')}`
  );
  const byId = evaluate(events([...pass(), availability(`${PASS}:04Z`, DRILL, DRILL_END, 'wazuh-real', '041', 'wazuh-real', '-')], row('continuity_test_recorded', drill, { sistemas: '024,28' })));
  check('REVERSAL: declared by its ID (024) → CUMPLE', byId.evidencia('EV-04')?.status === 'CUMPLE', byId.de('EV-04'));
}

section('11. Cells with strict grammar; one test\'s gap does not cover what was measured in another');

{
  const p02 = evaluate(hoy(), { ...BASE, 'P-02': ['escritorio | x | cada año', 'simulacro | x | 12'] });
  check(
    'P-02 with periodicity «cada año» → not guessed: CONFIGURATION naming the row',
    p02.evidencia('EV-02')?.status === 'NO_EVALUABLE' && p02.evidencia('EV-02')?.gapCause === 'CONFIGURATION' && /fila «escritorio»: periodicidad «cada año»/.test(p02.de('EV-02')),
    `${estado(p02, 'EV-02')} ${p02.de('EV-02')}`
  );
  const p07 = evaluate(hoy(), { ...BASE, 'P-07': ['* | cuatro horas | 0', '028 | 2 | 15'] });
  check('P-07 with «cuatro horas» → CONFIGURATION naming the row', p07.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /fila «\*»: RTO «cuatro horas»/.test(p07.de('EV-04')), p07.de('EV-04'));
  check('P-07 admits decimals with comma («4,5»)', evaluate(hoy(), { ...BASE, 'P-07': ['* | 4,5 | 0', '028 | 2 | 15'] }).evidencia('EV-04')?.status === 'CUMPLE');
  check('P-01 not an integer (12,5) → CONFIGURATION', evaluate(hoy(), { ...BASE, 'P-01': '12.5' }).evidencia('EV-02')?.gapCause === 'CONFIGURATION');

  const discarded = evaluate(hoy(l => (l.event === 'continuity_test_register_read' ? { ...l, filas_invalidas: 2, lineas_invalidas: '5:inicio,7:tipo' } : l)));
  check(
    'two record rows discarded by the collector → NO_EVALUABLE by CONFIGURATION naming line and column',
    discarded.evidencia('EV-01')?.status === 'NO_EVALUABLE' && discarded.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /5:inicio; 7:tipo/.test(discarded.de('EV-01')),
    `${estado(discarded, 'EV-01')} ${discarded.de('EV-01')}`
  );
  const discards = (l: Linea) => (l.event === 'continuity_test_register_read' ? { ...l, filas_invalidas: 2, lineas_invalidas: '5:inicio,7:tipo' } : l);
  const expiredWithDiscards = evaluate(hoy(discards), { ...BASE, 'P-01': '3' });
  check(
    'with discarded rows, «vencido» becomes NO_EVALUABLE by CONFIGURATION (the discarded one may be the missing test)',
    expiredWithDiscards.evidencia('EV-02')?.status === 'NO_EVALUABLE' && expiredWithDiscards.evidencia('EV-02')?.gapCause === 'CONFIGURATION' && /No se puede afirmar/.test(expiredWithDiscards.de('EV-02')),
    `${estado(expiredWithDiscards, 'EV-02')} ${expiredWithDiscards.de('EV-02')}`
  );
  check(
    'but a deficiency open past its deadline (something PRESENT) still prevails: NO_CUMPLE',
    evaluate(hoy(l => row('continuity_deficiency_recorded', x => x.deficiencia_id === 'DEF-2026-04', { plazo: '2026-10-01' })(discards(l)))).evidencia('EV-05')?.status === 'NO_CUMPLE'
  );
  check(
    'and a measured discrepancy in EV-04, too',
    evaluate(hoy(l => row('availability_event_observed', x => x.agente_id === '024', { eventos: 'parada@2026-09-17T20:05:00Z,arranque@2026-09-18T00:52:00Z' })(discards(l)))).evidencia('EV-04')?.status === 'NO_CUMPLE'
  );
  const declaresWithDiscards = evaluate(hoy(l =>
    row('continuity_test_recorded', drill, { deficiencias: 3 })(l.event === 'continuity_deficiency_register_read' ? { ...l, filas_invalidas: 1, lineas_invalidas: '9:plazo' } : l)
  ));
  check(
    '«declares 3, follows 1» with a discarded row in the deficiency record → NO_EVALUABLE by CONFIGURATION',
    declaresWithDiscards.evidencia('EV-05')?.status === 'NO_EVALUABLE' && declaresWithDiscards.evidencia('EV-05')?.gapCause === 'CONFIGURATION',
    `${estado(declaresWithDiscards, 'EV-05')} ${declaresWithDiscards.de('EV-05')}`
  );

  const partial = hoy(row('continuity_test_recorded', drill, { medicion: 'parcial', dias_sin_alertas: '2026-09-18' }));
  const r = evaluate(partial);
  check(
    'the drill lacks the 18/09 alerts → EV-04 NO_EVALUABLE by RECOGIDA naming the day',
    r.evidencia('EV-04')?.status === 'NO_EVALUABLE' && r.evidencia('EV-04')?.gapCause === 'COLLECTION' && /días sin alertas: 2026-09-18/.test(r.de('EV-04')),
    `${estado(r, 'EV-04')} ${r.de('EV-04')}`
  );
  const julio = '2026-07-20T18:00:00Z';
  const withAnother = evaluate(events([
    ...pass(),
    test(`${PASS}:01Z`, 5, julio, '2026-07-20T21:00:00Z', 'parcial', 'pérdida total de CPD', '028', 'satisfactorio', 0),
    availability(`${PASS}:04Z`, julio, '2026-07-20T21:00:00Z', '028', '028', 'ldap-zimbra', 'parada@2026-07-20T18:10:00Z,arranque@2026-07-20T21:12:00Z'),
  ], row('continuity_test_recorded', drill, { medicion: 'parcial', dias_sin_alertas: '2026-09-18' })));
  check(
    'the drill\'s gap does not cover the discrepancy measured in the July test → NO_CUMPLE',
    withAnother.evidencia('EV-04')?.status === 'NO_CUMPLE' && /028 \(ldap-zimbra, 028\) estuvo 3 h 2 min sin servicio/.test(withAnother.de('EV-04')) && /Además: La medición de la prueba simulacro/.test(withAnother.de('EV-04')),
    withAnother.de('EV-04')
  );

  const truncated = evaluate(hoy(row('availability_event_observed', l => l.agente_id === '024', { eventos_total: 57 })));
  check('a truncated chronology with no down exceeding the RTO → cannot be asserted: RECOGIDA', truncated.evidencia('EV-04')?.gapCause === 'COLLECTION', estado(truncated, 'EV-04'));

  const pendingOne = evaluate(
    events([
      ...pass(),
      test(`${PASS}:01Z`, 5, '2026-10-09T08:00:00Z', '2026-10-09T10:00:00Z', 'parcial', 'pérdida total de CPD', '028', 'satisfactorio', 0, { medicion: 'pendiente', medido_hasta: '2026-10-09T12:05:00Z' }),
      availability(`${PASS}:04Z`, '2026-10-09T08:00:00Z', '2026-10-09T10:00:00Z', '028', '028', 'ldap-zimbra', 'parada@2026-10-09T09:30:00Z,arranque@2026-10-09T12:00:00Z'),
    ])
  );
  check(
    'a test from this morning: the LDAP stopped 2 h 30 min until its start, with its RTO of 2 h 15 min → NO_CUMPLE even though the measurement is still open',
    pendingOne.evidencia('EV-04')?.status === 'NO_CUMPLE',
    pendingOne.de('EV-04')
  );
  const shortPending = evaluate(
    events([
      ...pass(),
      test(`${PASS}:01Z`, 5, '2026-10-09T08:00:00Z', '2026-10-09T11:00:00Z', 'parcial', 'pérdida total de CPD', '028', 'satisfactorio', 0, { medicion: 'pendiente', medido_hasta: '2026-10-09T12:05:00Z' }),
      availability(`${PASS}:04Z`, '2026-10-09T08:00:00Z', '2026-10-09T11:00:00Z', '028', '028', 'ldap-zimbra', 'parada@2026-10-09T09:30:00Z'),
    ])
  );
  check(
    'REVERSAL: the same LDAP stopped since 09:30 with no observed return, with the measurement open → not known yet: NO_EVALUABLE, never CUMPLE nor NO_CUMPLE',
    shortPending.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /todavía no es concluyente/.test(shortPending.de('EV-04')),
    `${estado(shortPending, 'EV-04')} ${shortPending.de('EV-04')}`
  );
}

section('11 bis. Rows lost on the way, repeated or with cells that are not understood');

{
  const lostOne = evaluate(hoy(l => (l.event === 'continuity_test_recorded' && l.linea === 3 ? undefined : l)));
  check(
    'the read announces 3 tests and 2 arrive → NO_EVALUABLE by RECOGIDA, saying how many are missing',
    lostOne.evidencia('EV-01')?.status === 'NO_EVALUABLE' && lostOne.evidencia('EV-01')?.gapCause === 'COLLECTION' && /faltan 1/.test(lostOne.de('EV-01')),
    `${estado(lostOne, 'EV-01')} ${lostOne.de('EV-01')}`
  );
  check(
    'and with a test lost, «scenario never tested» is not asserted',
    evaluate(hoy(l => (l.event === 'continuity_test_recorded' && l.linea === 3 ? undefined : l))).evidencia('EV-02')?.status === 'NO_EVALUABLE'
  );

  const def04 = pass().find(l => l.deficiencia_id === 'DEF-2026-04')!;
  const duplicate = evaluate(
    hoy(row('continuity_test_recorded', drill, { deficiencias: 2 }), [{ ...def04 }])
  );
  check(
    'a repeated deficiency in the pass counts once: the drill declares 2 and 1 is followed → NO_CUMPLE',
    duplicate.evidencia('EV-05')?.status === 'NO_CUMPLE' && /declara 2, en seguimiento 1/.test(duplicate.de('EV-05')),
    `${estado(duplicate, 'EV-05')} ${duplicate.de('EV-05')}`
  );
  const repeatedTest = evaluate(hoy(undefined, [pass().find(l => l.event === 'continuity_test_recorded' && l.linea === 4)!]));
  check('a repeated test in the pass unbalances nothing → CUMPLE', repeatedTest.requisito().status === 'CUMPLE', repeatedTest.motivo());

  const result = evaluate(hoy(row('continuity_test_recorded', drill, { resultado: 'ok' })));
  check(
    'a result outside the vocabulary («ok») → the row is not interpreted: RECOGIDA, naming line and column',
    result.evidencia('EV-01')?.status === 'NO_EVALUABLE' && /línea 4 \(resultado «ok»\)/.test(result.de('EV-01')),
    `${estado(result, 'EV-01')} ${result.de('EV-01')}`
  );
  const deficiencies = evaluate(hoy(row('continuity_test_recorded', drill, { deficiencias: 'tres' })));
  check('deficiencies that are not a number («tres») → the same', /deficiencias «tres»/.test(deficiencies.de('EV-01')), deficiencies.de('EV-01'));

  const withoutClosing = evaluate(hoy(row('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-03', { cierre: '-' })));
  check(
    'DEF-2026-03 «cerrada» without closing date is judged open: its 31/08 deadline expired → NO_CUMPLE',
    withoutClosing.evidencia('EV-05')?.status === 'NO_CUMPLE' && /DEF-2026-03 .*declarada cerrada sin fecha de cierre: se juzga abierta/.test(withoutClosing.de('EV-05')),
    withoutClosing.de('EV-05')
  );
  const futureClosing = evaluate(hoy(row('continuity_deficiency_recorded', l => l.deficiencia_id === 'DEF-2026-03', { cierre: '2026-12-01' })));
  check('«cerrada» with a closing after the read (01/12) → open, and expired: NO_CUMPLE', futureClosing.evidencia('EV-05')?.status === 'NO_CUMPLE' && /posterior a la lectura/.test(futureClosing.de('EV-05')), futureClosing.de('EV-05'));
  check('REVERSAL: closed on 28/08 → CUMPLE', evaluate(hoy()).evidencia('EV-05')?.status === 'CUMPLE');
}

section('11 ter. What is not known to have arrived whole is not taken as whole (integration)');

{
  const sin = (clave: string) => (l: Linea): Linea => {
    const { [clave]: _outside, ...rest } = l;

    return rest as Linea;
  };
  const withoutRows = evaluate(hoy(l => (l.event === 'continuity_test_register_read' ? sin('filas')(l) : l)));
  check(
    'a record read without «filas» → NO_EVALUABLE by RECOGIDA, never a whole record',
    withoutRows.evidencia('EV-01')?.status === 'NO_EVALUABLE' && withoutRows.evidencia('EV-01')?.gapCause === 'COLLECTION' && /no dice cuántas filas válidas leyó/.test(withoutRows.de('EV-01')),
    `${estado(withoutRows, 'EV-01')} ${withoutRows.de('EV-01')}`
  );
  check('REVERSAL: with «filas», EV-01 CUMPLE', evaluate(hoy()).evidencia('EV-01')?.status === 'CUMPLE');

  const withoutInvalid = evaluate(hoy(l => (l.event === 'continuity_test_register_read' ? sin('filas_invalidas')(l) : l)));
  check(
    'a test-record read without «filas_invalidas» → NO_EVALUABLE by RECOGIDA, never zero discarded',
    withoutInvalid.evidencia('EV-01')?.status === 'NO_EVALUABLE' && withoutInvalid.evidencia('EV-01')?.gapCause === 'COLLECTION' && /no dice cuántas filas descartó el recolector por no seguir el formato \(filas_invalidas\)/.test(withoutInvalid.de('EV-01')),
    `${estado(withoutInvalid, 'EV-01')} ${withoutInvalid.de('EV-01')}`
  );
  const withoutInvalidDef = evaluate(hoy(l => (l.event === 'continuity_deficiency_register_read' ? sin('filas_invalidas')(l) : l)));
  check(
    'and the deficiency-record one without «filas_invalidas» → EV-05 NO_EVALUABLE by RECOGIDA',
    withoutInvalidDef.evidencia('EV-05')?.status === 'NO_EVALUABLE' && withoutInvalidDef.evidencia('EV-05')?.gapCause === 'COLLECTION' && /registro de deficiencias .*\(filas_invalidas\)/.test(withoutInvalidDef.de('EV-05')),
    `${estado(withoutInvalidDef, 'EV-05')} ${withoutInvalidDef.de('EV-05')}`
  );
  check('REVERSAL: with «filas_invalidas» = 0, EV-05 CUMPLE', evaluate(hoy()).evidencia('EV-05')?.status === 'CUMPLE');

  const sinTotal = evaluate(hoy(l => (l.event === 'availability_event_observed' && l.agente_id === '024' ? sin('eventos_total')(l) : l)));
  check(
    'a chronology without «eventos_total» → EV-04 NO_EVALUABLE by RECOGIDA, never whole',
    sinTotal.evidencia('EV-04')?.status === 'NO_EVALUABLE' && sinTotal.evidencia('EV-04')?.gapCause === 'COLLECTION' && /eventos_total/.test(sinTotal.de('EV-04')),
    `${estado(sinTotal, 'EV-04')} ${sinTotal.de('EV-04')}`
  );
  check('REVERSAL: with «eventos_total», EV-04 CUMPLE', evaluate(hoy()).evidencia('EV-04')?.status === 'CUMPLE');

  const completeWithGaps = evaluate(hoy(row('continuity_test_recorded', drill, { dias_sin_alertas: '2026-09-18' })));
  check(
    'a «complete» measurement with days without alerts does not give CUMPLE → NO_EVALUABLE by RECOGIDA',
    completeWithGaps.evidencia('EV-04')?.status === 'NO_EVALUABLE' && completeWithGaps.evidencia('EV-04')?.gapCause === 'COLLECTION' && /se declara completa, pero hay días sin alertas leídas \(2026-09-18\)/.test(completeWithGaps.de('EV-04')),
    `${estado(completeWithGaps, 'EV-04')} ${completeWithGaps.de('EV-04')}`
  );

  const discardedTests = evaluate(hoy(row('continuity_test_register_read', () => true, { filas_invalidas: 1, lineas_invalidas: '6:fin' })));
  check(
    'EV-05 carries the test record\'s reservations: a discarded test row does not let the correction pass as good',
    discardedTests.evidencia('EV-05')?.status === 'NO_EVALUABLE' && /registro de pruebas .* descartadas/.test(discardedTests.de('EV-05')),
    `${estado(discardedTests, 'EV-05')} ${discardedTests.de('EV-05')}`
  );
  check('REVERSAL: with the whole test record, EV-05 CUMPLE', evaluate(hoy()).evidencia('EV-05')?.status === 'CUMPLE');

  const lostTest = evaluate(hoy(l => (l.event === 'continuity_test_recorded' && l.linea === 3 ? undefined : l)));
  check(
    'a deficiency whose test was lost on the way → RECOGIDA, not «copy the exact start»',
    lostTest.evidencia('EV-05')?.gapCause === 'COLLECTION' && /le faltan filas que el recolector leyó/.test(lostTest.de('EV-05')) && !/Copia en prueba_inicio/.test(lostTest.de('EV-05')),
    `${estado(lostTest, 'EV-05')} ${lostTest.de('EV-05')}`
  );
  const lostWithoutRows = evaluate(
    hoy(l => (l.event === 'continuity_test_recorded' && l.linea === 3 ? undefined : l.event === 'continuity_test_register_read' ? sin('filas')(l) : l))
  );
  check(
    'without «filas», the deficiency without a test does not say it «lacks rows the collector read»: it says it is not known how many it read',
    lostWithoutRows.evidencia('EV-05')?.gapCause === 'COLLECTION' &&
      /no dice cuántas filas leyó el recolector, así que no se puede comprobar que hayan llegado todas, y su prueba puede ser una de las que faltan/.test(lostWithoutRows.de('EV-05')) &&
      !/le faltan filas que el recolector leyó/.test(lostWithoutRows.de('EV-05')),
    `${estado(lostWithoutRows, 'EV-05')} ${lostWithoutRows.de('EV-05')}`
  );
  const unreadableTest = evaluate(hoy(row('continuity_test_recorded', l => l.linea === 3, { resultado: 'ok' })));
  check(
    'a deficiency whose test arrived in an unreadable row → RECOGIDA, naming the row',
    unreadableTest.evidencia('EV-05')?.gapCause === 'COLLECTION' && /cuya prueba está en una fila del registro de pruebas que no se puede interpretar: DEF-2026-02/.test(unreadableTest.de('EV-05')) && !/Copia en prueba_inicio/.test(unreadableTest.de('EV-05')),
    `${estado(unreadableTest, 'EV-05')} ${unreadableTest.de('EV-05')}`
  );
  const badlyCopied = evaluate(hoy(undefined, [deficiency(`${PASS}:03Z`, 6, 'DEF-2026-99', '2026-05-01T00:00:00Z', '2026-06-30', 'cerrada', '2026-06-01', '2.1')]));
  check(
    'REVERSAL: with the whole test record, a prueba_inicio that does not match → CONFIGURATION, «copia el inicio exacto»',
    badlyCopied.evidencia('EV-05')?.gapCause === 'CONFIGURATION' && /Copia en prueba_inicio el inicio exacto/.test(badlyCopied.de('EV-05')),
    `${estado(badlyCopied, 'EV-05')} ${badlyCopied.de('EV-05')}`
  );

  const drillRow = pass().find(l => l.event === 'continuity_test_recorded' && l.linea === 4)!;
  const lastPrevails = evaluate(hoy(undefined, [{ ...drillRow, ts: `${PASS}:30Z`, deficiencias: 2 }]));
  check(
    'a repeated row in the pass: the LAST prevails (declares 2, following 1 → NO_CUMPLE)',
    lastPrevails.evidencia('EV-05')?.status === 'NO_CUMPLE' && /declara 2, en seguimiento 1/.test(lastPrevails.de('EV-05')),
    `${estado(lastPrevails, 'EV-05')} ${lastPrevails.de('EV-05')}`
  );
  const firstOld = evaluate(hoy(undefined, [{ ...drillRow, ts: `${PASS}:00Z`, deficiencias: 2 }]));
  check(
    'REVERSAL: if the repeated one is the EARLIER, the later prevails (declares 1) → CUMPLE',
    firstOld.evidencia('EV-05')?.status === 'CUMPLE',
    `${estado(firstOld, 'EV-05')} ${firstOld.de('EV-05')}`
  );
}

section('12. Deadlines are judged when the record was read, not when evaluating');

{
  const withDeadline = (l: Linea) => (l.event === 'continuity_deficiency_recorded' && l.deficiencia_id === 'DEF-2026-04' ? { ...l, plazo: '2026-10-08' } : l);
  const yesterday = '2026-10-08T18:05';
  const readYesterday = evaluate(events(pass(yesterday), withDeadline), BASE, 'ALTO', new Date('2026-10-09T12:30:00Z'));
  check(
    'read on 08/10 at 18:05 (18 h ago; a pass was lost): still on time → CUMPLE',
    readYesterday.evidencia('EV-05')?.status === 'CUMPLE',
    `${estado(readYesterday, 'EV-05')} ${readYesterday.de('EV-05')}`
  );
  const readToday = evaluate(events([...pass(yesterday), ...pass('2026-10-09T00:05')], withDeadline), BASE, 'ALTO', new Date('2026-10-09T12:30:00Z'));
  check('REVERSAL: read on 09/10 at 00:05 → past deadline: NO_CUMPLE', readToday.evidencia('EV-05')?.status === 'NO_CUMPLE', readToday.de('EV-05'));
}

section('13. State facts: a deficiency closed at noon stops counting as open');

{
  const open = (l: Linea) => (l.event === 'continuity_deficiency_recorded' && l.deficiencia_id === 'DEF-2026-03' ? { ...l, situacion: 'abierta', cierre: '-' } : l);
  const morning = events(pass('2026-10-09T06:05'), open);
  const r0630 = evaluate(morning, BASE, 'ALTO', new Date('2026-10-09T06:30:00Z'));
  check('at 06:30, DEF-2026-03 is still open after the drill → NO_CUMPLE', r0630.evidencia('EV-05')?.status === 'NO_CUMPLE');
  const r1230 = evaluate(morning.concat(events(pass())));
  check('at 12:30, the 12:05 pass brings it closed → CUMPLE', r1230.evidencia('EV-05')?.status === 'CUMPLE', r1230.de('EV-05'));
}

section('14. Volume: the fact budget');

{
  const day = [0, 6, 12, 18].flatMap(h => pass(`2026-10-09T${String(h).padStart(2, '0')}:05`));
  check(`a lab day is ${day.length} facts, far below the budget's 300`, day.length <= 300, day.length);

  const perPass = 2 + 8 + 20 + 4 * 3 + 3 + 4 + 1;
  check(`an organization with history: ${perPass} per pass, ${perPass * 4} per day (≤ 300)`, perPass * 4 <= 300, perPass * 4);

  const cuarenta = Array.from({ length: 40 }, (_, k) => `${k % 2 ? 'arranque' : 'parada'}@2026-09-17T2${k % 4}:${String(k).padStart(2, '0')}:00Z`).join(',');
  const bytes = new TextEncoder().encode(JSON.stringify({ ensfacil: 'op.cont.3', host: 'Wazuh-4', ...availability(`${PASS}:04Z`, DRILL, DRILL_END, 'wazuh-real', '024', 'wazuh-real', cuarenta) })).length;
  check(`a 40-event chronology takes ${bytes} bytes, far from logcollector's 64 KiB`, bytes < 4096, bytes);
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
