/** op.mon.2: judgment of the metrics system. */
import * as fs from 'fs';
import * as path from 'path';
import { opMon2PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-mon-2.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opMon2CatalogDefinition } from '../common/ens/catalog/op-mon-2';
import { opMon2Configuration } from '../common/ens/configuration/data/op-mon-2-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../common/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { buildOpMon2ReportModel } from '../public/ens/reports/op-mon-2-report-model';
import { getENSReportModelDefinition, getRegisteredENSReportControls } from '../public/ens/reports/registry';
import { buildENSAllControlsFactsFilter, ENS_FACTS_QUERY_LIMIT } from '../common/ens/dashboard/all-controls-facts-filter';
import { evaluationKey, evaluationReducer, initialEvaluationState, visibleEvaluation } from '../public/evaluation/refresh-policy';
import type { EvaluationViewState } from '../public/evaluation/refresh-policy';
import type { ENSControlConfiguration, ENSLevel } from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import type { ENSComplianceResult } from '../common/ens/core/evaluation/types';

declare const process: { exit(code: number): void };
declare const __dirname: string;

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

type Line = Record<string, unknown>;

const COMPLETE = '2026-10-09T12:05';
const ANTERIOR = '2026-10-09T06:05';

const NOW = new Date('2026-10-09T12:30:00Z');

const common = (ts: string, event: string, evidence: string, requirement: string): Line => ({
  ts, event, evidence_id: evidence, requisito: requirement, plano: 'central',
});

const cycle = (ts: string, line: number, period: string, date: string, extra: Line = {}): Line => ({
  ...common(ts, 'metrics_cycle_recorded', 'EV-02', 'op.mon.2.1,op.mon.2.r2.1'),
  periodo: period, fecha_consolidacion: date, implantacion_global: 82.4, horas_internas: 118, horas_externas: 36,
  presupuesto_ejecutado: 8100, validado_por: 'Responsable de Seguridad', referencia: `https://intranet.ejemplo/metricas/${period}.pdf`,
  linea: line, ...extra,
});

const CYCLES = (ts: string): Line[] => [
  cycle(ts, 3, '2026-T2', '2026-07-08T09:00:00Z'),
  cycle(ts, 4, '2026-T3', '2026-10-02T10:00:00Z', { implantacion_global: 87.1, horas_internas: 130, horas_externas: 35, presupuesto_ejecutado: 9200, validado_por: 'RSEG' }),
];

const phase = (ts: string, line: number, id: string, name: string, date: string, extra: Line = {}): Line => ({
  ...common(ts, 'incident_registered', 'EV-03', 'op.mon.2.r1.1'),
  incidente_id: id, fase: name, fecha: date, severidad: 'alta', sistemas: 'wazuh-real', clasificacion: 'acceso no autorizado',
  escalado_a: '-', notificado_a: '-', datos_personales: 'no', notificacion_ccn_cert: '-', relevancia_juridica: 'no',
  medidas_mejora: '-', referencia: `https://intranet.ejemplo/expedientes/${id}`, linea: line, ...extra,
});

const INCIDENTS = (ts: string): Line[] => [
  phase(ts, 2, 'INC-2026-014', 'inicial', '2026-09-10T08:15:00Z'),
  phase(ts, 3, 'INC-2026-014', 'intermedio', '2026-09-10T11:40:00Z', { notificacion_ccn_cert: '2026-09-10T12:00:00Z', escalado_a: 'RSI' }),
  phase(ts, 4, 'INC-2026-014', 'final', '2026-09-11T16:30:00Z', { medidas_mejora: 'bloqueo de la cuenta genérica' }),
  phase(ts, 5, 'INC-2026-015', 'inicial', '2026-10-01T09:00:00Z', { severidad: 'media', sistemas: 'ldap-zimbra', clasificacion: 'código dañino', datos_personales: 'si' }),
  phase(ts, 6, 'INC-2026-015', 'intermedio', '2026-10-01T10:30:00Z', { severidad: 'media', sistemas: 'ldap-zimbra', clasificacion: 'código dañino', datos_personales: 'si', notificado_a: 'AEPD,Responsable de la Información' }),
];

const AGENTS: [string, string, string, string, string][] = [
  ['000', 'Wazuh-4', 'active', '2026-10-09T12:05:30Z', '-'],
  ['024', 'wazuh-real', 'active', '2026-10-09T12:04:50Z', 'default,ens'],
  ['027', 'srv-prueba', 'disconnected', '2026-09-04T10:00:12Z', 'default'],
  ['028', 'ldap-zimbra', 'active', '2026-10-09T12:04:40Z', 'default,ens'],
  ['033', 'win-prueba', 'never_connected', '-', 'default'],
];

const PASSES: Record<string, string> = {
  '000': 'op.exp.7|2026-10-09T12:00:10Z|completada,op.exp.8|2026-10-09T12:00:40Z|completada,op.exp.9|2026-10-09T12:01:05Z|completada,op.mon.1|2026-10-09T12:05:20Z|completada,op.mon.2|2026-10-09T06:05:50Z|completada',
  '024': 'mp.info.6|2026-10-09T02:00:31Z|completada,op.acc.1|2026-10-09T11:30:02Z|completada,op.exp.1|2026-10-09T11:31:10Z|completada,op.exp.2|2026-10-09T11:32:00Z|parcial',
  '027': 'op.acc.1|2026-09-04T09:30:00Z|completada',
  '028': 'op.acc.1|2026-10-09T11:45:00Z|completada,op.exp.8|2026-10-09T11:50:00Z|completada',
  '033': '-',
};

interface Options {
  ciclos?: Line[];
  incidentes?: Line[];
  lecturaCiclos?: Line;
  lecturaIncidentes?: Line;
  cubiertas?: string;
}

const reading = (ts: string, event: string, evidence: string, file: string, rows: number, extra: Line = {}): Line => ({
  ...common(ts, event, evidence, evidence === 'EV-02' ? 'op.mon.2.1,op.mon.2.r1.1,op.mon.2.r2.1' : 'op.mon.2.r1.1'),
  fichero: file, presente: 'si', legible: 'si', formato: 'ok', filas_validas: rows, filas_descartadas: 0, filas_emitidas: rows, ...extra,
});

const pass = (hhmm = COMPLETE, o: Options = {}): Line[] => {
  const t = (s: number) => `${hhmm}:${String(s).padStart(2, '0')}Z`;
  const cycles = (o.ciclos ?? CYCLES(t(11))).map(l => ({ ...l, ts: t(11) }));
  const incidents = (o.incidentes ?? []).map(l => ({ ...l, ts: t(21) }));

  return [
    reading(t(10), 'metrics_register_read', 'EV-02', '/etc/ensfacil/metrics-cycle-register.tsv', cycles.length, o.lecturaCiclos),
    ...cycles,
    reading(t(20), 'incident_register_read', 'EV-03', '/etc/ensfacil/incident-register.tsv', incidents.length, o.lecturaIncidentes),
    ...incidents,
    ...AGENTS.map(([id, agent, estado, keep, groups]) => ({
      ...common(t(30), 'agent_keepalive_observed', 'EV-04', 'op.mon.2.1'),
      agente_id: id, agente: agent, estado_conexion: estado, ultimo_keepalive: keep, grupos: groups, nodo: 'node01',
      agentes_emitidos: AGENTS.length,
    })),
    ...AGENTS.map(([id, agent]) => ({
      ...common(t(35), 'collector_heartbeat_observed', 'EV-04', 'op.mon.2.1'),
      agente_id: id, agente: agent, recolectores: PASSES[id] === '-' ? 0 : PASSES[id].split(',').length, pasadas: PASSES[id],
      observado_desde: '2026-09-20T00:00:00Z', nodo: 'node01',
    })),
    { ts: t(50), event: 'collector_run', resultado: 'completada', evidencias_cubiertas: o.cubiertas ?? 'EV-02,EV-03,EV-04', tipo_servidor: 'manager', emisor: 'recolector' },
  ];
};

let counter = 0;

const RULE: Record<string, string> = {
  metrics_register_read: '111301', metrics_cycle_recorded: '111302', incident_register_read: '111303',
  incident_registered: '111304', agent_keepalive_observed: '111305', collector_heartbeat_observed: '111306',
  evidence_state: '111350', collector_run: '111397',
};

const MANAGER = { id: '000', name: 'Wazuh-4' };

const alert = (line: Line) => {
  counter += 1;
  const { ts, ...data } = line as Line & { ts: string };

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: MANAGER,
      rule: { id: RULE[String(data.event)] || '111300', description: 'op.mon.2' },
      location: '/var/log/ensfacil/op_mon_2.json',
      data: Object.fromEntries(Object.entries({ ensfacil: 'op.mon.2', ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const events = (lines: Line[], changes: (l: Line) => Line | undefined = l => l): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lines
      .map(l => changes({ ...l }))
      .filter((l): l is Line => Boolean(l))
      .map(alert)
  );

const hoy = (changes?: (l: Line) => Line | undefined, o: Options = {}) =>
  events([...pass(ANTERIOR, o), ...pass(COMPLETE, o)], changes);

const withIncidents = (incidents: Line[] = INCIDENTS(COMPLETE), changes?: (l: Line) => Line | undefined) =>
  events([...pass(COMPLETE, { incidentes: incidents })], changes);

type Values = Record<string, string[] | string | undefined>;

const configuration = (values: Values): ENSControlConfiguration => ({
  ...opMon2Configuration,
  parameters: opMon2Configuration.parameters.map(p => {
    const { value: _anterior, ...withoutValue } = p;

    return values[p.id] === undefined ? withoutValue : { ...withoutValue, value: values[p.id] };
  }),
});

const BASE: Values = {
  'P-01': [
    'op.acc.1 | sí | MEDIO | R1',
    'op.exp.7 | sí | MEDIO | R1 R2',
    'op.mon.1 | sí | MEDIO | R1',
    'op.mon.2 | sí | MEDIO | R1 R2',
    'org.1 | sí | MEDIO | ',
    'op.cont.2 | no |  | ',
  ],
  'P-02': ['trimestral | 15 | 12-31'],
  'P-03': ['incidentes_por_tipo', 'incidentes_por_severidad', 'tiempo_medio_contencion', 'tiempo_medio_resolucion', 'notificados_ccn_cert', 'notificados_aepd'],
  'P-04': [
    'Personal TIC propio | horas_internas | partes de dedicación al sistema de seguridad',
    'Soporte del integrador | horas_externas | horas facturadas',
    'Licencias y servicios de seguridad | presupuesto_ejecutado | contabilidad analítica',
  ],
  'P-05': ['Responsable de Seguridad | RSEG | ambos'],
  'P-06': ['cobertura_monitorizacion | 95 | 5', 'implantacion_global | 90 | ', 'controles_no_evaluables | 0 | ', 'tiempo_medio_resolucion | 72 | '],
};

const NO_PARAMETERS: Values = {};

const evaluate = (
  evs: ENSNormalizedEvent[],
  values: Values = BASE,
  level: ENSLevel = 'MEDIO',
  now: Date = NOW
) => {
  const cfg = configuration(values);
  const ofTheControl = keepLatestRunStateFacts('op.mon.2', evs, now);
  const evidences = resolveEvidenceForControl('op.mon.2', ofTheControl, '000', level, cfg, now);
  const context = buildPolicyContext(opMon2CatalogDefinition, cfg, level, ofTheControl, evidences, now);
  const { decisions, runtimeVariables } = opMon2PolicyDefinition.evaluator!(context);
  const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, opMon2CatalogDefinition.requirements);
  const attestations = parseRequirementAttestations(cfg);
  const requirement = (id: string) =>
    evaluateRequirement(
      opMon2CatalogDefinition.requirements.find(q => q.id === id)!,
      level,
      tabla,
      false,
      decisions,
      'ACTIVE',
      attestations.get(id)
    );
  const evidence = (id: string) => tabla.find(e => e.id === id);
  const motive = (req: string) => decisions.find(d => d.requirementId === req)?.reason || '';
  const ofEvidence = (req: string, ev: string) => decisions.find(d => d.trace.ruleId === `${req}/${ev}`);
  const decision = (req: string) => decisions.find(d => d.trace.ruleId === req);
  const variable = (name: string) => runtimeVariables.find(v => v.name === name);
  const motor = () =>
    evaluateENSControl(
      opMon2CatalogDefinition,
      cfg,
      level,
      evidences,
      {
        controlId: 'op.mon.2',
        policyId: opMon2PolicyDefinition.id,
        evaluatedAt: now.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      ofTheControl
    );

  return { decisions, runtimeVariables, requisito: requirement, evidencia: evidence, motivo: motive, deEvidencia: ofEvidence, decision, variable, motor };
};

const unproven = (r: ReturnType<typeof evaluate>, req: string, cause: string): boolean =>
  r.requisito(req).status !== 'CUMPLE' && r.requisito(req).evidenced === false && r.decision(req)?.status === 'NO_EVALUABLE' && r.decision(req)?.cause === cause;

section('1. Catalog: system category, manager plane and report data');

{
  const levels = (id: string) =>
    opMon2CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  check('op.mon.2 is governed by the category (no dimension of its own)', opMon2CatalogDefinition.levelDimension === undefined);
  check('se mide solo en el manager', JSON.stringify(opMon2CatalogDefinition.measurementPlanes) === '["manager"]');
  check('the base applies in the three categories', levels('op.mon.2.1') === 'BAJO,MEDIO,ALTO');
  check('R1 and R2 from MEDIA (MEDIA and ALTA require the same)', levels('op.mon.2.r1.1') === 'MEDIO,ALTO' && levels('op.mon.2.r2.1') === 'MEDIO,ALTO');
  check('the control is ACTIVE', opMon2CatalogDefinition.status === 'ACTIVE', opMon2CatalogDefinition.status);
  check(
    'EV-01, EV-05 and EV-07 are judged by no requirement (report data)',
    ['EV-01', 'EV-05', 'EV-07'].every(ev => opMon2CatalogDefinition.requirements.every(r => !r.evidenceIds.includes(ev)))
  );
  check(
    'the policy declares the same levels and evidences as the catalog',
    opMon2PolicyDefinition.requirements.every(r => {
      const c = opMon2CatalogDefinition.requirements.find(q => q.id === r.requirementId)!;

      return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',');
    })
  );
  check(
    'the collector\'s six facts are state facts (re-emitted whole every 6 h)',
    ['metrics_register_read', 'metrics_cycle_recorded', 'incident_register_read', 'incident_registered', 'agent_keepalive_observed', 'collector_heartbeat_observed'].every(t =>
      getStateFactEventTypes('op.mon.2').has(t)
    )
  );
}

section('2. Green: the last cycle validated on time, 100 % coverage, empty incident record');

{
  const r = evaluate(hoy());

  check('op.mon.2.1 CUMPLE at MEDIA', r.requisito('op.mon.2.1').status === 'CUMPLE' && r.requisito('op.mon.2.1').evidenced === true, r.motivo('op.mon.2.1'));
  check(
    'EV-02: the last validated cycle is 2026-T3, from 7 days ago, within the quarterly + 15 deadline',
    r.evidencia('EV-02')?.status === 'CUMPLE' && /2026-T3 \(consolidado el 2026-10-02.*validado por RSEG\), hace 7 días/.test(r.deEvidencia('op.mon.2.1', 'EV-02')?.reason || '') && /92 días \+ 15 de margen = 107/.test(r.deEvidencia('op.mon.2.1', 'EV-02')?.reason || ''),
    r.deEvidencia('op.mon.2.1', 'EV-02')?.reason
  );
  check('and shows the implementation trend (82.4 % → 87.1 %)', /2026-T2 82\.4 % → 2026-T3 87\.1 %/.test(r.deEvidencia('op.mon.2.1', 'EV-02')?.reason || ''), r.deEvidencia('op.mon.2.1', 'EV-02')?.reason);
  check(
    'EV-04: 100 % coverage (3 of 3 in scope: the manager and the two in the ens group)',
    r.evidencia('EV-04')?.status === 'CUMPLE' && /100 % \(3 de 3 sistemas del alcance ENS/.test(r.deEvidencia('op.mon.2.1', 'EV-04')?.reason || ''),
    r.deEvidencia('op.mon.2.1', 'EV-04')?.reason
  );
  check(
    'the test agents outside the ens group do not count, but are mentioned',
    /Fuera del alcance ENS \(sin el grupo ens\) hay 2 agente\(s\)/.test(r.deEvidencia('op.mon.2.1', 'EV-04')?.reason || '') && /srv-prueba \(027\) disconnected/.test(r.deEvidencia('op.mon.2.1', 'EV-04')?.reason || ''),
    r.deEvidencia('op.mon.2.1', 'EV-04')?.reason
  );
  check('coverage travels as a variable for the report (100)', r.variable('cobertura_monitorizacion')?.value === 100, r.variable('cobertura_monitorizacion')?.value);

  check(
    'R1 CUMPLE with zero incidents: the record exists and the last cycle is on time (decision 7)',
    r.requisito('op.mon.2.r1.1').status === 'CUMPLE' && /Ningún incidente registrado/.test(r.motivo('op.mon.2.r1.1')) && /cero incidentes es un dato\./.test(r.motivo('op.mon.2.r1.1')) && /Se consolidan en el ciclo 2026-T3/.test(r.motivo('op.mon.2.r1.1')),
    r.motivo('op.mon.2.r1.1')
  );

  const r2 = r.requisito('op.mon.2.r2.1');
  check('R2 CUMPLE marked `attested`: declared datum, not measured', r2.status === 'CUMPLE' && r2.attested === true && r2.evidenced === true, `${r2.status} ${r2.attested}`);
  check('and its motive says DATO DECLARADO with the last cycle\'s figures', /130 h internas, 35 h externas y 9200 € de presupuesto ejecutado, validado por RSEG/.test(r.motivo('op.mon.2.r2.1')) && /DATO DECLARADO/.test(r.motivo('op.mon.2.r2.1')), r.motivo('op.mon.2.r2.1'));
  check(
    'the only `attested` decisions are R2\'s: the requirement\'s and EV-06\'s',
    r.decisions.filter(d => d.attested).map(d => d.trace.ruleId).join(',') === 'op.mon.2.r2.1,op.mon.2.r2.1/EV-06',
    r.decisions.filter(d => d.attested).map(d => d.trace.ruleId).join(',')
  );
  check(
    'and the bridge does not fill EV-06 as measured: in the table it does not come out measured CUMPLE',
    r.evidencia('EV-06')?.status !== 'CUMPLE',
    `${r.evidencia('EV-06')?.status} ${r.evidencia('EV-06')?.gapCause} ${(r.evidencia('EV-06')?.observations || []).join(' | ')}`
  );

  ['EV-01', 'EV-05', 'EV-07'].forEach(id =>
    check(
      `${id} comes out NO_APLICA as a report datum, not grey`,
      r.evidencia(id)?.status === 'NO_APLICA' && (r.evidencia(id)?.observations || []).some(o => /Dato del informe, sin veredicto/.test(o)),
      `${r.evidencia(id)?.status} ${(r.evidencia(id)?.observations || []).join(' | ')}`
    )
  );

  const motor = r.motor();
  check('the engine scores the control at 100 % at MEDIA', motor.status === 'CUMPLE' && motor.score === 100, `${motor.status} ${motor.score}`);

  const basic = evaluate(hoy(), BASE, 'BAJO');
  check('at BÁSICA, R1 and R2 NO_APLICA and the base stays CUMPLE', basic.requisito('op.mon.2.r1.1').status === 'NO_APLICA' && basic.requisito('op.mon.2.r2.1').status === 'NO_APLICA' && basic.requisito('op.mon.2.1').status === 'CUMPLE');
  check(
    'at BÁSICA neither P-03 nor P-04 are needed',
    evaluate(hoy(), { ...BASE, 'P-03': undefined, 'P-04': undefined }, 'BAJO').motor().status === 'CUMPLE'
  );
  check('ALTA requires the same as MEDIA', evaluate(hoy(), BASE, 'ALTO').motor().score === 100);
}

section('3. R1 with incidents: P-03\'s indicators come from the record, and a missing datum → NO_CUMPLE');

{
  const r = evaluate(withIncidents());

  check('with complete data → R1 CUMPLE', r.requisito('op.mon.2.r1.1').status === 'CUMPLE', r.motivo('op.mon.2.r1.1'));
  check(
    'and computes the indicators: resolution 32.3 h, containment 2.5 h, 1 of 2 to CCN-CERT, 1 of 1 to AEPD',
    /tiempo_medio_resolucion: 32\.3 h \(1 cerrados\)/.test(r.motivo('op.mon.2.r1.1')) &&
      /tiempo_medio_contencion: 2\.5 h \(2 contenidos\)/.test(r.motivo('op.mon.2.r1.1')) &&
      /notificados_ccn_cert: 1 de 2/.test(r.motivo('op.mon.2.r1.1')) &&
      /notificados_aepd: 1 de 1 con datos personales/.test(r.motivo('op.mon.2.r1.1')) &&
      /incidentes_por_severidad: alta 1, media 1/.test(r.motivo('op.mon.2.r1.1')),
    r.motivo('op.mon.2.r1.1')
  );
  check(
    'the period\'s and the year\'s indicators travel to the report',
    (r.variable('indicadores_incidentes_periodo')?.value as string[]).some(x => /2 incidente\(s\)/.test(x)) &&
      (r.variable('indicadores_incidentes_anual')?.value as string[]).some(x => /tiempo_medio_resolucion: 32\.3 h/.test(x)),
    JSON.stringify(r.variable('indicadores_incidentes_periodo')?.value)
  );

  const withoutContainment = INCIDENTS(COMPLETE).filter(l => !(l.incidente_id === 'INC-2026-014' && l.fase === 'intermedio'));
  const red = evaluate(withIncidents(withoutContainment));
  check(
    'INC-2026-014 closed without an intermediate phase and P-03 asks for containment → R1 NO_CUMPLE naming it',
    red.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && red.requisito('op.mon.2.r1.1').evidenced === true && /tiempo_medio_contencion: INC-2026-014 cerrado sin fase intermedia/.test(red.motivo('op.mon.2.r1.1')),
    red.motivo('op.mon.2.r1.1')
  );
  const withoutRequestingIt = evaluate(withIncidents(withoutContainment), { ...BASE, 'P-03': ['incidentes_por_tipo', 'tiempo_medio_resolucion'] });
  check('REVERSAL: the same record with P-03 without containment → CUMPLE', withoutRequestingIt.requisito('op.mon.2.r1.1').status === 'CUMPLE', withoutRequestingIt.motivo('op.mon.2.r1.1'));

  const withoutClass = evaluate(withIncidents(INCIDENTS(COMPLETE).map(l => (l.incidente_id === 'INC-2026-015' ? { ...l, clasificacion: '-' } : l))));
  check('an unclassified incident → cannot be counted by type: NO_CUMPLE', withoutClass.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && /incidentes_por_tipo: INC-2026-015 sin clasificación/.test(withoutClass.motivo('op.mon.2.r1.1')), withoutClass.motivo('op.mon.2.r1.1'));

  const withoutPersonalData = evaluate(withIncidents(INCIDENTS(COMPLETE).map(l => (l.incidente_id === 'INC-2026-015' ? { ...l, datos_personales: '-' } : l))));
  check(
    'an incident that does not say whether it affects personal data → AEPD cannot be counted: NO_CUMPLE',
    withoutPersonalData.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && /notificados_aepd: INC-2026-015 sin indicar si afecta a datos personales/.test(withoutPersonalData.motivo('op.mon.2.r1.1')),
    withoutPersonalData.motivo('op.mon.2.r1.1')
  );

  const old = [
    phase(COMPLETE, 2, 'INC-2026-003', 'inicial', '2026-03-02T08:00:00Z', { clasificacion: '-' }),
    phase(COMPLETE, 3, 'INC-2026-003', 'final', '2026-03-03T08:00:00Z', { clasificacion: '-' }),
  ];
  const outsidePeriod = evaluate(withIncidents(old));
  check(
    'an unclassified incident closed in March is not in the period: R1 CUMPLE with zero incidents',
    outsidePeriod.requisito('op.mon.2.r1.1').status === 'CUMPLE' && /Ningún incidente registrado/.test(outsidePeriod.motivo('op.mon.2.r1.1')),
    outsidePeriod.motivo('op.mon.2.r1.1')
  );

  const discarded = evaluate(withIncidents(INCIDENTS(COMPLETE), l => (l.event === 'incident_register_read' ? { ...l, filas_descartadas: 1 } : l)));
  check(
    'a row discarded by the collector → it cannot be asserted that the indicators are complete: NO_EVALUABLE, never CUMPLE',
    discarded.requisito('op.mon.2.r1.1').status !== 'CUMPLE' && discarded.decision('op.mon.2.r1.1')?.status === 'NO_EVALUABLE' && /1 fila\(s\) del registro de incidentes se descartaron/.test(discarded.motivo('op.mon.2.r1.1')),
    discarded.motivo('op.mon.2.r1.1')
  );

  const oldCycle = (o: Options = {}) =>
    events(pass(COMPLETE, { ...o, ciclos: [cycle(COMPLETE, 3, '2026-T1', '2026-04-03T09:00:00Z', { validado_por: 'RSEG' })] }));
  const oldR1 = evaluate(oldCycle());
  check(
    'zero incidents with the last cycle from 03/04 (189 days) → R1 NO_CUMPLE: they are not consolidated',
    oldR1.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && /no se están consolidando/.test(oldR1.motivo('op.mon.2.r1.1')),
    oldR1.motivo('op.mon.2.r1.1')
  );
  check('REVERSAL: the same cycle with annual P-02 → R1 CUMPLE', evaluate(oldCycle(), { ...BASE, 'P-02': ['anual | 0 | 12-31'] }).requisito('op.mon.2.r1.1').status === 'CUMPLE');
}

section('4. Red: cycles out of time or unvalidated, low coverage, incomplete resources');

{
  const lagging = [
    cycle(COMPLETE, 3, '2026-T1', '2026-03-20T09:00:00Z', { validado_por: 'RSEG' }),
    cycle(COMPLETE, 4, '2026-T2', '2026-06-20T09:00:00Z', { validado_por: 'RSEG' }),
  ];
  const late = evaluate(events(pass(COMPLETE, { ciclos: lagging })));
  check(
    'the last validated cycle is from 20/06 (111 days) and the quarterly + 15 deadline is 107 → NO_CUMPLE',
    late.requisito('op.mon.2.1').status === 'NO_CUMPLE' && /de hace 111 días: fuera del plazo/.test(late.motivo('op.mon.2.1')),
    late.motivo('op.mon.2.1')
  );
  check('REVERSAL: the same cycle with 20 days of margin (112) → CUMPLE', evaluate(events(pass(COMPLETE, { ciclos: lagging })), { ...BASE, 'P-02': ['trimestral | 20 | 12-31'] }).evidencia('EV-02')?.status === 'CUMPLE');

  const unvalidated = evaluate(hoy(l => (l.event === 'metrics_cycle_recorded' ? { ...l, validado_por: '-' } : l)));
  check('no validated cycle → NO_CUMPLE', unvalidated.evidencia('EV-02')?.status === 'NO_CUMPLE' && /no tiene quién lo validó/.test(unvalidated.motivo('op.mon.2.1')), unvalidated.motivo('op.mon.2.1'));
  const another = (l: Line) => (l.event === 'metrics_cycle_recorded' ? { ...l, validado_por: 'Técnico de sistemas' } : l);
  const foreignOne = evaluate(hoy(another));
  check('validated by someone P-05 does not designate → NO_CUMPLE', foreignOne.evidencia('EV-02')?.status === 'NO_CUMPLE' && /lo validó «Técnico de sistemas», que P-05 no designa/.test(foreignOne.motivo('op.mon.2.1')), foreignOne.motivo('op.mon.2.1'));
  check(
    'REVERSAL: the same cycle with that person in P-05 (ignoring accents and case) → CUMPLE',
    evaluate(hoy(another), { ...BASE, 'P-05': ['tecnico de SISTEMAS |  | metricas', 'Responsable de Seguridad | RSEG | recursos'] }).evidencia('EV-02')?.status === 'CUMPLE'
  );
  const pendingOne = evaluate(hoy(l => (l.event === 'metrics_cycle_recorded' && l.periodo === '2026-T3' ? { ...l, validado_por: '-' } : l)));
  check(
    'T3 unvalidated and T2 validated on 08/07 (93 days) still in time → CUMPLE, saying T3 is pending',
    pendingOne.evidencia('EV-02')?.status === 'CUMPLE' && /2026-T3 .* está pendiente de validar/.test(pendingOne.deEvidencia('op.mon.2.1', 'EV-02')?.reason || ''),
    pendingOne.deEvidencia('op.mon.2.1', 'EV-02')?.reason
  );

  const empty = evaluate(events(pass(COMPLETE, { ciclos: [] })));
  check(
    'cycle record present and empty → measured NO_CUMPLE (no series), not a grey',
    empty.requisito('op.mon.2.1').status === 'NO_CUMPLE' && empty.requisito('op.mon.2.1').evidenced === true && /no tiene ningún ciclo anotado/.test(empty.motivo('op.mon.2.1')),
    empty.motivo('op.mon.2.1')
  );
  check('and with it, R1 and R2 also NO_CUMPLE', empty.requisito('op.mon.2.r1.1').status === 'NO_CUMPLE' && empty.requisito('op.mon.2.r2.1').status === 'NO_CUMPLE');

  const downedLdap = (l: Line) => (l.event === 'agent_keepalive_observed' && l.agente_id === '028' ? { ...l, estado_conexion: 'disconnected', ultimo_keepalive: '2026-10-08T22:00:00Z' } : l);
  const down = evaluate(hoy(downedLdap));
  check(
    'the LDAP of the ens group disconnected → coverage 66.7 %, below 95 − 5 → NO_CUMPLE naming it',
    down.evidencia('EV-04')?.status === 'NO_CUMPLE' && /66\.7 % \(2 de 3/.test(down.motivo('op.mon.2.1')) && /ldap-zimbra \(028\): agente disconnected/.test(down.motivo('op.mon.2.1')),
    down.motivo('op.mon.2.1')
  );
  check('REVERSAL: the same state with target 70 and tolerance 5 → CUMPLE within tolerance', /dentro de la tolerancia/.test(evaluate(hoy(downedLdap), { ...BASE, 'P-06': ['cobertura_monitorizacion | 70 | 5'] }).deEvidencia('op.mon.2.1', 'EV-04')?.reason || '') && evaluate(hoy(downedLdap), { ...BASE, 'P-06': ['cobertura_monitorizacion | 70 | 5'] }).evidencia('EV-04')?.status === 'CUMPLE');
  check('and without the tolerance, the same target 70 → NO_CUMPLE', evaluate(hoy(downedLdap), { ...BASE, 'P-06': ['cobertura_monitorizacion | 70 | '] }).evidencia('EV-04')?.status === 'NO_CUMPLE');

  const parado = (l: Line) =>
    l.event === 'collector_heartbeat_observed' && l.agente_id === '024' ? { ...l, pasadas: String(l.pasadas).replace('op.acc.1|2026-10-09T11:30:02Z', 'op.acc.1|2026-10-08T10:00:00Z') } : l;
  const withStopped = evaluate(hoy(parado));
  check(
    'wazuh-real\'s op.acc.1 with no pass for 26 h → the machine does not count as covered: NO_CUMPLE',
    withStopped.evidencia('EV-04')?.status === 'NO_CUMPLE' && /wazuh-real \(024\): op\.acc\.1 sin pasada desde 2026-10-08T10:00:00Z/.test(withStopped.motivo('op.mon.2.1')),
    withStopped.motivo('op.mon.2.1')
  );
  const failedOne = evaluate(hoy(l => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: String(l.pasadas).replace('11:50:00Z|completada', '11:50:00Z|fallida') } : l)));
  check('the LDAP\'s op.exp.8 failed in its last pass → not covered: NO_CUMPLE', failedOne.evidencia('EV-04')?.status === 'NO_CUMPLE' && /op\.exp\.8 falló en su última pasada/.test(failedOne.motivo('op.mon.2.1')), failedOne.motivo('op.mon.2.1'));
  check('a «parcial» pass does count as up to date (wazuh-real\'s op.exp.2)', evaluate(hoy()).evidencia('EV-04')?.status === 'CUMPLE');
  const withoutCollectors = evaluate(hoy(l => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: '-', recolectores: 0 } : l)));
  check(
    'the LDAP with no collector since it is observed (20/09) → not covered: NO_CUMPLE',
    withoutCollectors.evidencia('EV-04')?.status === 'NO_CUMPLE' && /ningún recolector de ENSFácil ha informado desde él desde 2026-09-20/.test(withoutCollectors.motivo('op.mon.2.1')),
    withoutCollectors.motivo('op.mon.2.1')
  );
  const justNow = evaluate(hoy(l => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: '-', recolectores: 0, observado_desde: '2026-10-09T06:00:00Z' } : l)));
  check(
    'REVERSAL: no collectors but observed only since today → cannot be asserted: NO_EVALUABLE, never CUMPLE',
    justNow.evidencia('EV-04')?.status === 'NO_EVALUABLE' && /todavía no ha informado ningún recolector/.test(justNow.motivo('op.mon.2.1')),
    `${justNow.evidencia('EV-04')?.status} ${justNow.motivo('op.mon.2.1')}`
  );

  const withoutExternal = evaluate(hoy(l => (l.event === 'metrics_cycle_recorded' && l.periodo === '2026-T3' ? { ...l, horas_externas: '-' } : l)));
  check('the last cycle without external hours → R2 NO_CUMPLE', withoutExternal.requisito('op.mon.2.r2.1').status === 'NO_CUMPLE' && !withoutExternal.requisito('op.mon.2.r2.1').attested && /no anota horas externas/.test(withoutExternal.motivo('op.mon.2.r2.1')), withoutExternal.motivo('op.mon.2.r2.1'));
  const separated = { ...BASE, 'P-05': ['Responsable de Seguridad | RSEG | metricas', 'Gerencia | Dirección | recursos'] };
  const ofManagement = evaluate(hoy(), separated);
  check(
    'P-05 separates resources (Gerencia) and the cycle was validated by RSEG → R2 NO_CUMPLE, the base stays CUMPLE',
    ofManagement.requisito('op.mon.2.r2.1').status === 'NO_CUMPLE' && /no están validados por un responsable de recursos de P-05 \(Gerencia \(Dirección\)\)/.test(ofManagement.motivo('op.mon.2.r2.1')) && ofManagement.requisito('op.mon.2.1').status === 'CUMPLE',
    ofManagement.motivo('op.mon.2.r2.1')
  );
  check(
    'REVERSAL: the same P-05 with the cycle validated by «Dirección» → R2 CUMPLE and the base NO_CUMPLE (not a metrics one)',
    (() => {
      const d = evaluate(hoy(l => (l.event === 'metrics_cycle_recorded' ? { ...l, validado_por: 'Dirección' } : l)), separated);

      return d.requisito('op.mon.2.r2.1').status === 'CUMPLE' && d.requisito('op.mon.2.1').status === 'NO_CUMPLE';
    })()
  );
  check('the cycle out of time → R2 NO_CUMPLE: resources are not up to date', evaluate(events(pass(COMPLETE, { ciclos: lagging }))).requisito('op.mon.2.r2.1').status === 'NO_CUMPLE');
}

section('5. Without a record or parameters: NO_EVALUABLE with cause CONFIGURATION, never CUMPLE by emptiness');

{
  const withoutCycles = evaluate(hoy(undefined, { ciclos: [], lecturaCiclos: { presente: 'no', legible: '-', formato: '-' } }));
  check('without a cycle record → op.mon.2.1 not proven, CONFIGURATION', unproven(withoutCycles, 'op.mon.2.1', 'CONFIGURATION') && /No existe el registro de ciclos de métricas/.test(withoutCycles.motivo('op.mon.2.1')), withoutCycles.motivo('op.mon.2.1'));
  check('and R2 not proven, CONFIGURATION', unproven(withoutCycles, 'op.mon.2.r2.1', 'CONFIGURATION'), withoutCycles.motivo('op.mon.2.r2.1'));
  check(
    'and R1 neither: without cycles it is not on record that incident data are consolidated (CONFIGURATION)',
    unproven(withoutCycles, 'op.mon.2.r1.1', 'CONFIGURATION') && /no consta que los datos de incidentes se consoliden/.test(withoutCycles.motivo('op.mon.2.r1.1')),
    withoutCycles.motivo('op.mon.2.r1.1')
  );

  const withoutIncidents = evaluate(hoy(undefined, { lecturaIncidentes: { presente: 'no', legible: '-', formato: '-' } }));
  check(
    'without an incident record (wazuh4 has only the .example) → R1 not proven, CONFIGURATION; never CUMPLE for zero incidents',
    unproven(withoutIncidents, 'op.mon.2.r1.1', 'CONFIGURATION') && /No existe el registro de incidentes \(\/etc\/ensfacil\/incident-register\.tsv\)/.test(withoutIncidents.motivo('op.mon.2.r1.1')),
    withoutIncidents.motivo('op.mon.2.r1.1')
  );
  check('REVERSAL: the record present and empty → R1 CUMPLE', evaluate(hoy()).requisito('op.mon.2.r1.1').status === 'CUMPLE');

  const header = evaluate(hoy(undefined, { ciclos: [], lecturaCiclos: { formato: 'cabecera_distinta', filas_validas: 0, filas_emitidas: 0 } }));
  check('record with another header → CONFIGURATION (no row is interpreted)', unproven(header, 'op.mon.2.1', 'CONFIGURATION') && /no es la cabecera exigida/.test(header.motivo('op.mon.2.1')), header.motivo('op.mon.2.1'));
  const unreadable = evaluate(hoy(undefined, { incidentes: [], lecturaIncidentes: { legible: 'no', formato: '-' } }));
  check('unreadable incident record → COLLECTION', unproven(unreadable, 'op.mon.2.r1.1', 'COLLECTION'), unreadable.motivo('op.mon.2.r1.1'));

  const r = evaluate(hoy(), NO_PARAMETERS, 'ALTO');
  ['op.mon.2.1', 'op.mon.2.r1.1', 'op.mon.2.r2.1'].forEach(id =>
    check(`without any parameter, ${id} not proven by CONFIGURATION`, unproven(r, id, 'CONFIGURATION'), `${r.requisito(id).status} ${r.decision(id)?.cause} ${r.motivo(id)}`)
  );
  check('and the control does not score as met', r.motor().status !== 'CUMPLE');

  const missingOne = (id: string, req: string, patron: RegExp) => {
    const withoutIt = evaluate(hoy(), { ...BASE, [id]: undefined });

    check(`only ${id} missing → ${req} not proven by CONFIGURATION, naming it`, unproven(withoutIt, req, 'CONFIGURATION') && patron.test(withoutIt.motivo(req)), withoutIt.motivo(req));
  };
  missingOne('P-01', 'op.mon.2.1', /P-01 \(Declaración de aplicabilidad\) está sin configurar/);
  missingOne('P-02', 'op.mon.2.1', /P-02 \(Periodicidad de los ciclos de métricas\) está sin configurar/);
  missingOne('P-02', 'op.mon.2.r1.1', /P-02/);
  missingOne('P-02', 'op.mon.2.r2.1', /P-02/);
  missingOne('P-03', 'op.mon.2.r1.1', /P-03 \(Indicadores de la gestión de incidentes\) está sin configurar/);
  missingOne('P-04', 'op.mon.2.r2.1', /P-04 \(Partidas de los recursos consumidos\) está sin configurar/);
  missingOne('P-05', 'op.mon.2.1', /P-05 \(Responsables de validar las métricas\) está sin configurar/);
  missingOne('P-05', 'op.mon.2.r2.1', /P-05/);
  missingOne('P-06', 'op.mon.2.1', /P-06 \(Objetivos de las métricas\) está sin configurar.*Cobertura medida: 100 %/);

  const withoutCoverage = evaluate(hoy(), { ...BASE, 'P-06': ['implantacion_global | 90 | '] });
  check('P-06 without the coverage row → CONFIGURATION, naming the metric', withoutCoverage.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /no declara el objetivo de cobertura_monitorizacion/.test(withoutCoverage.motivo('op.mon.2.1')), withoutCoverage.motivo('op.mon.2.1'));

  const p04Incomplete = evaluate(hoy(), { ...BASE, 'P-04': ['Personal TIC propio | horas_internas | partes'] });
  check('P-04 without external-hours or budget items → R2 CONFIGURATION', unproven(p04Incomplete, 'op.mon.2.r2.1', 'CONFIGURATION') && /horas_externas, presupuesto_ejecutado/.test(p04Incomplete.motivo('op.mon.2.r2.1')), p04Incomplete.motivo('op.mon.2.r2.1'));

  const appliesToNothing = evaluate(hoy(), { ...BASE, 'P-01': ['op.acc.1 | no |  | '] });
  check('P-01 without any applicable measure → op.mon.2.1 CONFIGURATION (no base)', unproven(appliesToNothing, 'op.mon.2.1', 'CONFIGURATION'), appliesToNothing.motivo('op.mon.2.1'));

  const invalid = configuration(BASE)
    .parameters.map(p => ({ id: p.id, veredicto: validateParameterValue(p, p.value) }))
    .filter(v => !v.veredicto.valid);
  check('the BASE values are valid for their tables and list', invalid.length === 0, invalid.map(v => `${v.id}: ${v.veredicto.reason}`).join('; '));
}

section('6. Without a collector, old or lost facts: NO_EVALUABLE by COLLECTION');

{
  const nothing = evaluate([]);
  ['op.mon.2.r1.1', 'op.mon.2.r2.1'].forEach(id => check(`without any fact → ${id} not proven by COLLECTION`, unproven(nothing, id, 'COLLECTION'), nothing.motivo(id)));
  check('and EV-04 by COLLECTION', nothing.evidencia('EV-04')?.gapCause === 'COLLECTION', nothing.evidencia('EV-04')?.gapCause);

  const old = evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-11T12:30:00Z'));
  check('two days without passes: the state does not describe today → not proven', old.requisito('op.mon.2.1').evidenced === false && /no está informando/.test(old.motivo('op.mon.2.1')), old.motivo('op.mon.2.1'));

  const lostOne = evaluate(events(pass(COMPLETE), l => (l.event === 'metrics_cycle_recorded' && l.periodo === '2026-T3' ? undefined : l)));
  check(
    'the collector emitted 2 cycles and 1 arrives (lost line) → nothing is asserted about the record: COLLECTION',
    lostOne.evidencia('EV-02')?.status === 'NO_EVALUABLE' && lostOne.evidencia('EV-02')?.gapCause === 'COLLECTION' && /han llegado 1/.test(lostOne.motivo('op.mon.2.1')),
    lostOne.motivo('op.mon.2.1')
  );

  const degraded2 = (ts: string, changes?: (l: Line) => Line | undefined) =>
    evaluate(hoy(changes).concat(events([
      { ts, event: 'evidence_state', evidence_id: 'EV-04', requisito: 'op.mon.2.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer /var/ossec/logs/alerts/alerts.json: los latidos de los recolectores no se actualizan' },
    ])));
  const deg = degraded2(`${COMPLETE}:45Z`);
  check(
    'alerts.json unreadable in the last pass, after the facts → what complied becomes NO_EVALUABLE with the collector\'s motive',
    deg.evidencia('EV-04')?.status === 'NO_EVALUABLE' && deg.evidencia('EV-04')?.gapCause === 'COLLECTION' && /alerts\.json/.test(deg.motivo('op.mon.2.1')),
    deg.motivo('op.mon.2.1')
  );
  const degWithFailure = degraded2(`${COMPLETE}:45Z`, l => (l.event === 'agent_keepalive_observed' && l.agente_id === '028' ? { ...l, estado_conexion: 'disconnected' } : l));
  check(
    'and with the LDAP disconnected measured, the measurement prevails → NO_CUMPLE, with the degradation apart',
    degWithFailure.evidencia('EV-04')?.status === 'NO_CUMPLE' && /Además: El recolector no ha podido medirlo/.test(degWithFailure.motivo('op.mon.2.1')),
    degWithFailure.motivo('op.mon.2.1')
  );
  check('a degradation from two days ago is not used', degraded2('2026-10-07T12:05:45Z').evidencia('EV-04')?.status === 'CUMPLE');

  const withoutCycleReader = evaluate(
    hoy(l => (l.event === 'metrics_register_read' || l.event === 'metrics_cycle_recorded' ? undefined : l)).concat(events([
      { ts: `${COMPLETE}:15Z`, event: 'evidence_state', evidence_id: 'EV-02,EV-06', requisito: 'op.mon.2.1,op.mon.2.r2.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'sin python3 no se puede leer el registro de ciclos de métricas' },
    ]))
  );
  check(
    'without a cycle-record reader (EV-02\'s evidence_state) → R1 not proven with EV-02 collector\'s motive',
    withoutCycleReader.decision('op.mon.2.r1.1')?.status === 'NO_EVALUABLE' && /sin python3 no se puede leer el registro de ciclos/.test(withoutCycleReader.motivo('op.mon.2.r1.1')),
    withoutCycleReader.motivo('op.mon.2.r1.1')
  );
  const degradedCycle = evaluate(hoy().concat(events([
    { ts: `${COMPLETE}:45Z`, event: 'evidence_state', evidence_id: 'EV-02,EV-06', requisito: 'op.mon.2.1,op.mon.2.r2.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'el registro de ciclos cambió durante la lectura' },
  ])));
  check(
    'an EV-02 degradation after the cycle read also stops accrediting R1\'s deadline',
    degradedCycle.requisito('op.mon.2.r1.1').status !== 'CUMPLE' && /el registro de ciclos cambió durante la lectura/.test(degradedCycle.motivo('op.mon.2.r1.1')),
    degradedCycle.motivo('op.mon.2.r1.1')
  );

  const alertLevel = evaluate(
    hoy(l => (l.event === 'metrics_register_read' || l.event === 'metrics_cycle_recorded' ? undefined : l)).concat(events([
      { ts: `${COMPLETE}:15Z`, event: 'evidence_state', evidence_id: 'EV-02,EV-03,EV-04', requisito: 'op.mon.2.1,op.mon.2.r1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'log_alert_level es 4 en ossec.conf: los hechos de nivel 3 no llegan a alerts.json' },
    ]))
  );
  check(
    'log_alert_level > 3 (EV-02 degraded by CONFIGURATION) → R2 unmeasured by CONFIGURATION, with the collector\'s motive',
    alertLevel.decision('op.mon.2.r2.1')?.status === 'NO_EVALUABLE' &&
      alertLevel.decision('op.mon.2.r2.1')?.cause === 'CONFIGURATION' &&
      alertLevel.deEvidencia('op.mon.2.r2.1', 'EV-06')?.cause === 'CONFIGURATION' &&
      /log_alert_level es 4/.test(alertLevel.motivo('op.mon.2.r2.1')),
    `${alertLevel.decision('op.mon.2.r2.1')?.cause}: ${alertLevel.motivo('op.mon.2.r2.1')}`
  );
  const withoutAnyDegradation = evaluate(hoy(l => (l.event === 'metrics_register_read' || l.event === 'metrics_cycle_recorded' ? undefined : l)));
  check(
    'REVERSAL: without EV-02\'s degradation, the cycle record that does not arrive is a COLLECTION one',
    withoutAnyDegradation.decision('op.mon.2.r2.1')?.status === 'NO_EVALUABLE' && withoutAnyDegradation.decision('op.mon.2.r2.1')?.cause === 'COLLECTION',
    withoutAnyDegradation.decision('op.mon.2.r2.1')?.cause
  );
  const afterReading = evaluate(hoy().concat(events([
    { ts: `${COMPLETE}:45Z`, event: 'evidence_state', evidence_id: 'EV-02', requisito: 'op.mon.2.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'log_alert_level es 4 en ossec.conf' },
  ])));
  check(
    'EV-02\'s degradation after the cycle read also stops accrediting R2, with its cause',
    afterReading.decision('op.mon.2.r2.1')?.status === 'NO_EVALUABLE' && afterReading.decision('op.mon.2.r2.1')?.cause === 'CONFIGURATION',
    `${afterReading.decision('op.mon.2.r2.1')?.status} ${afterReading.decision('op.mon.2.r2.1')?.cause}: ${afterReading.motivo('op.mon.2.r2.1')}`
  );
  const both = evaluate(hoy().concat(events([
    { ts: `${COMPLETE}:45Z`, event: 'evidence_state', evidence_id: 'EV-02,EV-06', requisito: 'op.mon.2.1,op.mon.2.r2.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'el registro de ciclos cambió durante la lectura' },
  ])));
  check(
    'a line naming EV-02 and EV-06 does not repeat the motive in R2',
    (both.deEvidencia('op.mon.2.r2.1', 'EV-06')?.reason.match(/cambió durante la lectura/g) || []).length === 1,
    both.deEvidencia('op.mon.2.r2.1', 'EV-06')?.reason
  );

  const foreignOne = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': `${COMPLETE}:30Z`,
      agent: MANAGER,
      data: { ensfacil: 'op.exp.8', event: 'agent_keepalive_observed', evidence_id: 'EV-04', agente_id: '024', agente: 'wazuh-real', estado_conexion: 'active', grupos: 'ens' },
    },
  }]);
  check('a fact from another control (op.exp.8) does not accredit op.mon.2', evaluate(foreignOne).evidencia('EV-04')?.status !== 'CUMPLE');
}

section('7. Strict grammars, ages when read, normalized IDs and state by the last pass');

{
  const p06 = (rows: string[]) => evaluate(hoy(), { ...BASE, 'P-06': rows });
  const coverage = p06(['cobertura | 95 | 5']);
  check('P-06 «cobertura» (not a vocabulary metric) → CONFIGURATION naming the row', coverage.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /«cobertura \| 95 \| 5»: la métrica no es ninguna de/.test(coverage.motivo('op.mon.2.1')), coverage.motivo('op.mon.2.1'));
  check('P-06 target «noventa» → CONFIGURATION', p06(['cobertura_monitorizacion | noventa | ']).evidencia('EV-04')?.gapCause === 'CONFIGURATION');
  check('P-06 target 150 % → CONFIGURATION', p06(['cobertura_monitorizacion | 150 | ']).evidencia('EV-04')?.gapCause === 'CONFIGURATION');
  const tolerant = p06(['cobertura_monitorizacion | 50 | 60']);
  check(
    'P-06 with tolerance (60) greater than a minimum\'s target (50) → CONFIGURATION, never a negative threshold that everything meets',
    tolerant.evidencia('EV-04')?.status === 'NO_EVALUABLE' && tolerant.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /la tolerancia iguala o supera el objetivo/.test(tolerant.motivo('op.mon.2.1')),
    tolerant.motivo('op.mon.2.1')
  );
  check('and the equal one too (95 | 95)', p06(['cobertura_monitorizacion | 95 | 95']).evidencia('EV-04')?.gapCause === 'CONFIGURATION');
  check('REVERSAL: in a maximum metric the tolerance can exceed the target', p06(['cobertura_monitorizacion | 95 | 5', 'tiempo_medio_resolucion | 4 | 8']).evidencia('EV-04')?.status === 'CUMPLE');
  check('REVERSAL: «95 %» with its unit is valid → CUMPLE', p06(['cobertura_monitorizacion | 95 % | 5']).evidencia('EV-04')?.status === 'CUMPLE');
  check('P-06 with the metric twice → CONFIGURATION', p06(['cobertura_monitorizacion | 95 | 5', 'cobertura_monitorizacion | 90 | ']).evidencia('EV-04')?.gapCause === 'CONFIGURATION');

  const p01 = evaluate(hoy(), { ...BASE, 'P-01': ['Control de acceso | sí | MEDIO | R1', 'op.acc.1 | sí | MEDIO | R1'] });
  check('P-01 «Control de acceso» is not an ENS measure → CONFIGURATION naming it', unproven(p01, 'op.mon.2.1', 'CONFIGURATION') && /«Control de acceso» no es el identificador de una medida del ENS/.test(p01.motivo('op.mon.2.1')), p01.motivo('op.mon.2.1'));
  const p01BrokenMeasure = evaluate(hoy(l => (l.event === 'metrics_cycle_recorded' ? { ...l, validado_por: '-' } : l)), { ...BASE, 'P-01': ['Control de acceso | sí | | '] });
  check('and with an unvalidated cycle measured, the measurement prevails: NO_CUMPLE', p01BrokenMeasure.requisito('op.mon.2.1').status === 'NO_CUMPLE' && p01BrokenMeasure.requisito('op.mon.2.1').evidenced === true, p01BrokenMeasure.motivo('op.mon.2.1'));

  const p03 = evaluate(hoy(), { ...BASE, 'P-03': ['tiempo medio de detección', 'tiempo_medio_resolucion'] });
  check('P-03 «tiempo medio de detección» (not computed from the record) → R1 CONFIGURATION naming it', unproven(p03, 'op.mon.2.r1.1', 'CONFIGURATION') && /«tiempo medio de detección»/.test(p03.motivo('op.mon.2.r1.1')), p03.motivo('op.mon.2.r1.1'));

  const p02 = (row: string) => evaluate(hoy(), { ...BASE, 'P-02': [row] });
  check('P-02 margin «quince» → CONFIGURATION naming the row', unproven(p02('trimestral | quince | 12-31'), 'op.mon.2.1', 'CONFIGURATION') && /el margen «quince» no es un número entero de días/.test(p02('trimestral | quince | 12-31').motivo('op.mon.2.1')));
  check('P-02 closing «31/12» → CONFIGURATION', unproven(p02('trimestral | 15 | 31/12'), 'op.mon.2.1', 'CONFIGURATION'));
  check('P-02 closing «02-30» (does not exist) → CONFIGURATION', unproven(p02('trimestral | 15 | 02-30'), 'op.mon.2.1', 'CONFIGURATION'));
  check('P-02 «bienal» → CONFIGURATION', unproven(p02('bienal | 15 | 12-31'), 'op.mon.2.1', 'CONFIGURATION'));
  check('REVERSAL: P-02 without margin or closing is valid (margin 0) → CUMPLE', p02('trimestral |  | ').requisito('op.mon.2.1').status === 'CUMPLE');
  check('P-02 with two rows → CONFIGURATION', unproven(evaluate(hoy(), { ...BASE, 'P-02': ['trimestral | 15 | ', 'anual | 0 | '] }), 'op.mon.2.1', 'CONFIGURATION'));

  const p05 = evaluate(hoy(), { ...BASE, 'P-05': ['Responsable de Seguridad | RSEG | todos'] });
  check('P-05 with a scope outside the vocabulary → CONFIGURATION', unproven(p05, 'op.mon.2.1', 'CONFIGURATION'), p05.motivo('op.mon.2.1'));

  const late = evaluate(hoy(), BASE, 'MEDIO', new Date('2026-10-10T08:00:00Z'));
  check(
    'the 12:05 read seen 20 h later: the manager\'s op.mon.2 was 6 h old when read → still covered, EV-04 CUMPLE',
    late.evidencia('EV-04')?.status === 'CUMPLE',
    `${late.evidencia('EV-04')?.status} ${late.motivo('op.mon.2.1')}`
  );

  const withoutZeros = evaluate(hoy(l => (l.event === 'agent_keepalive_observed' && l.agente_id === '024' ? { ...l, agente_id: '24' } : l)));
  check('a keepalive with «24» matches the «024» heartbeat', withoutZeros.evidencia('EV-04')?.status === 'CUMPLE', withoutZeros.motivo('op.mon.2.1'));

  const unreadable = (l: Line) => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: 'op.acc.1@ayer' } : l);
  const oneUnreadable = evaluate(hoy(unreadable));
  check(
    'the LDAP\'s unreadable pass list → that machine undetermined; with 2 of 3 covered and target 90, it cannot be decided: NO_EVALUABLE by COLLECTION',
    oneUnreadable.evidencia('EV-04')?.status === 'NO_EVALUABLE' && oneUnreadable.evidencia('EV-04')?.gapCause === 'COLLECTION' && /ldap-zimbra \(028\): su lista de pasadas no se puede interpretar/.test(oneUnreadable.motivo('op.mon.2.1')),
    `${oneUnreadable.evidencia('EV-04')?.status} ${oneUnreadable.motivo('op.mon.2.1')}`
  );
  const withDowned = evaluate(hoy(l => unreadable(l.event === 'agent_keepalive_observed' && l.agente_id === '024' ? { ...l, estado_conexion: 'disconnected' } : l)));
  check(
    'and with wazuh-real disconnected, not even with the LDAP covered is it reached (66.7 % < 90): measured NO_CUMPLE',
    withDowned.evidencia('EV-04')?.status === 'NO_CUMPLE' && /como mucho 66\.7 %/.test(withDowned.motivo('op.mon.2.1')),
    withDowned.motivo('op.mon.2.1')
  );

  const withoutWazuhReal = (l: Line) => (l.event === 'agent_keepalive_observed' && l.agente_id === '024' ? undefined : l);
  const lost2 = evaluate(hoy(withoutWazuhReal));
  check(
    'the collector emitted 5 keepalives and 4 arrive → the missing one counts as in scope and undetermined: NO_EVALUABLE by COLLECTION, never CUMPLE with 2 of 2',
    lost2.evidencia('EV-04')?.status === 'NO_EVALUABLE' && lost2.evidencia('EV-04')?.gapCause === 'COLLECTION' && /de los 5 agentes que el recolector emitió en la última pasada han llegado 4/.test(lost2.motivo('op.mon.2.1')),
    `${lost2.evidencia('EV-04')?.status} ${lost2.motivo('op.mon.2.1')}`
  );
  check(
    'and with the LDAP disconnected, not even counting the lost one as covered is it reached (66.7 % < 90): measured NO_CUMPLE',
    evaluate(hoy(l => withoutWazuhReal(l.event === 'agent_keepalive_observed' && l.agente_id === '028' ? { ...l, estado_conexion: 'disconnected' } : l) as Line)).evidencia('EV-04')?.status === 'NO_CUMPLE'
  );

  const inWorker = (l: Line) => (l.event === 'agent_keepalive_observed' && l.agente_id === '024' ? { ...l, nodo: 'worker01' } : l);
  const cluster = evaluate(hoy(inWorker));
  check(
    'wazuh-real connected to another cluster node → undetermined by COLLECTION, never «no collector has reported»: NO_EVALUABLE',
    cluster.evidencia('EV-04')?.status === 'NO_EVALUABLE' && cluster.evidencia('EV-04')?.gapCause === 'COLLECTION' && /wazuh-real \(024\): está conectado al nodo worker01 del clúster/.test(cluster.motivo('op.mon.2.1')) && !/ningún recolector/.test(cluster.motivo('op.mon.2.1')),
    `${cluster.evidencia('EV-04')?.status} ${cluster.motivo('op.mon.2.1')}`
  );
  check('REVERSAL: the same agent on the collector\'s node → CUMPLE', evaluate(hoy(l => (l.event === 'agent_keepalive_observed' && l.agente_id === '024' ? { ...l, nodo: 'NODE01' } : l))).evidencia('EV-04')?.status === 'CUMPLE');
  check(
    'and disconnected on another node is still a measurement (the master\'s global.db covers the whole cluster): NO_CUMPLE',
    evaluate(hoy(l => inWorker(l.event === 'agent_keepalive_observed' && l.agente_id === '024' ? { ...l, estado_conexion: 'disconnected' } : l))).evidencia('EV-04')?.status === 'NO_CUMPLE'
  );

  const ahead = (l: Line) =>
    l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: String(l.pasadas).replace('op.acc.1|2026-10-09T11:45:00Z', 'op.acc.1|2026-10-09T18:45:00Z') } : l;
  const futureLdap = evaluate(hoy(ahead));
  check(
    'the LDAP\'s op.acc.1 with its last pass at 18:45 and read at 12:05 → that machine undetermined (clock ahead), never covered: NO_EVALUABLE',
    futureLdap.evidencia('EV-04')?.status === 'NO_EVALUABLE' && futureLdap.evidencia('EV-04')?.gapCause === 'EVIDENCE' && /ldap-zimbra \(028\): op\.acc\.1 con su última pasada en el futuro.*reloj adelantado/.test(futureLdap.motivo('op.mon.2.1')),
    `${futureLdap.evidencia('EV-04')?.status} ${futureLdap.evidencia('EV-04')?.gapCause} ${futureLdap.motivo('op.mon.2.1')}`
  );
  check(
    'REVERSAL: the same pass within the clock tolerance (12:08) → covered, CUMPLE',
    evaluate(hoy(l => (l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: String(l.pasadas).replace('op.acc.1|2026-10-09T11:45:00Z', 'op.acc.1|2026-10-09T12:08:00Z') } : l))).evidencia('EV-04')?.status === 'CUMPLE'
  );
  const futureAndStopped = evaluate(hoy(l => ahead(l.event === 'collector_heartbeat_observed' && l.agente_id === '028' ? { ...l, pasadas: String(l.pasadas).replace('11:50:00Z|completada', '11:50:00Z|fallida') } : l)));
  check('and with another failed LDAP collector, the measurement prevails: not covered, NO_CUMPLE', futureAndStopped.evidencia('EV-04')?.status === 'NO_CUMPLE', futureAndStopped.motivo('op.mon.2.1'));

  const withoutScope = evaluate(hoy(l => (l.event === 'agent_keepalive_observed' || l.event === 'collector_heartbeat_observed' ? (l.agente_id === '000' ? undefined : { ...l, grupos: 'default' }) : l)));
  check('the agent base without any scope system → NO_EVALUABLE, never CUMPLE', withoutScope.evidencia('EV-04')?.status === 'NO_EVALUABLE', `${withoutScope.evidencia('EV-04')?.status} ${withoutScope.motivo('op.mon.2.1')}`);

  const deleted = events([
    ...pass(ANTERIOR),
    ...pass(COMPLETE, { ciclos: [cycle(COMPLETE, 3, '2026-T2', '2026-07-08T09:00:00Z')] }),
  ]);
  const withoutT3 = evaluate(deleted);
  check(
    'T3 was there at 06:05 and was deleted at 12:05: only T2 counts (93 days, still in time)',
    withoutT3.evidencia('EV-02')?.status === 'CUMPLE' && /2026-T2 \(consolidado el 2026-07-08.*hace 93 días/.test(withoutT3.deEvidencia('op.mon.2.1', 'EV-02')?.reason || '') && !/2026-T3/.test(withoutT3.deEvidencia('op.mon.2.1', 'EV-02')?.reason || ''),
    withoutT3.deEvidencia('op.mon.2.1', 'EV-02')?.reason
  );

  const example = evaluate(events(pass(COMPLETE, { ciclos: [cycle(COMPLETE, 3, '2026-T3', '2026-10-02T10:00:00Z', { validado_por: 'RSEG', referencia: 'https://EJEMPLO.invalido/metricas.pdf' })] })));
  check('a cycle with the template\'s example reference does not count → there is no cycle: NO_CUMPLE', example.evidencia('EV-02')?.status === 'NO_CUMPLE' && /EJEMPLO\.invalido/.test(example.motivo('op.mon.2.1')), example.motivo('op.mon.2.1'));
  const future = evaluate(events(pass(COMPLETE, { ciclos: [cycle(COMPLETE, 3, '2026-T4', '2026-12-31T10:00:00Z', { validado_por: 'RSEG' })] })));
  check('a cycle dated in the future does not count', future.evidencia('EV-02')?.status === 'NO_CUMPLE' && /fechados en el futuro: 2026-T4/.test(future.motivo('op.mon.2.1')), future.motivo('op.mon.2.1'));
}

section('8. The band 111300 rules match the catalog, and a day fits the budget');

{
  const xml = fs.readFileSync(path.join(__dirname, '..', 'agent', 'rules', 'ensfacil_op_mon_2_json_rules.xml'), 'utf8');
  const rules = new Map<string, string>();
  Array.from(xml.matchAll(/<rule id="(\d+)"[^>]*>([\s\S]*?)<\/rule>/g)).forEach(([, id, body]) => {
    const event = /<field name="event">([a-z_]+)<\/field>/.exec(body);

    if (event) {
      rules.set(event[1], id);
    }
  });

  check('all rules are in band 111300-111399', Array.from(xml.matchAll(/<rule id="(\d+)"/g)).every(x => Number(x[1]) >= 111300 && Number(x[1]) <= 111399));
  check('each contract event has its rule, the test\'s', Object.entries(RULE).every(([event, id]) => rules.get(event) === id), JSON.stringify(Array.from(rules.entries())));

  const definitions = getEvidenceDefinitions('op.mon.2');
  check(
    'each evidence\'s `relatedRules` are the rules of its events (EV-06 reads the cycles\' one)',
    definitions.every(d => {
      const ownOnes = (d.expectedEventTypes || []).filter(t => t !== 'evidence_state').map(t => rules.get(t));
      const expectedOnes = d.id === 'EV-06' ? ['111302'] : ownOnes;

      return JSON.stringify([...(d.relatedRules || [])].sort()) === JSON.stringify([...expectedOnes].sort());
    }),
    definitions.map(d => `${d.id}:${(d.relatedRules || []).join('/')}`).join(' ')
  );
  check('no rule carries an `estado` field except evidence_state\'s', (xml.match(/<field name="estado">/g) || []).length === 1);

  const monthly = Array.from({ length: 14 }, (_, i) => cycle(COMPLETE, i + 3, `2025-${String(i + 1).padStart(2, '0')}`, `2025-${String((i % 12) + 1).padStart(2, '0')}-05T09:00:00Z`));
  const rows = Array.from({ length: 30 }, (_, i) => phase(COMPLETE, i + 2, `INC-${Math.floor(i / 3)}`, ['inicial', 'intermedio', 'final'][i % 3], '2026-09-10T08:00:00Z'));
  const day = ['00', '06', '12', '18'].flatMap(h => pass(`2026-10-09T${h}:05`, { ciclos: monthly, incidentes: rows }));
  check(`a lab day is ${day.length} facts, below the budget's 300`, day.length <= 300, day.length);

  const largo = Array.from({ length: 30 }, (_, i) => `op.ctl.${i}|2026-10-09T11:30:02Z|completada`).join(',');
  const line = JSON.stringify({ ...pass()[0], event: 'collector_heartbeat_observed', pasadas: largo });
  check(`a heartbeat with 30 collectors takes ${line.length} bytes, far below a logcollector line`, line.length < 8192, line.length);
}

section('9. The report: implementation and greys with the result of all controls, without a verdict');

{
  const r = evaluate(withIncidents());
  const result = r.motor() as ENSComplianceResult;
  const from = (id: string, status: ENSComplianceResult['status'], score: number | undefined, extra: Partial<ENSComplianceResult> = {}) =>
    ({ ...result, control: { ...result.control, id }, status, score, missingParameters: [], nonConformities: [], ...extra } as ENSComplianceResult);
  const panorama: ENSComplianceResult[] = [
    from('op.acc.1', 'CUMPLE', 100),
    from('op.exp.7', 'PARCIAL', 60, {
      nonConformities: [{ id: 'nc', evidenceId: 'EV-07', requirementId: 'op.exp.7.2', finding: 'x', impact: 'x', requiredAction: 'x', origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION', evidenceIds: ['EV-07'], parameterIds: ['P-07'] }],
    }),
    from('op.mon.1', 'NO_CUMPLE', 80, { missingParameters: ['P-01'] }),
    from('op.mon.2', result.status, result.score),
  ];
  const report = buildOpMon2ReportModel(result, panorama);
  const campo = (id: string) => report.fields.find(f => f.id === id)!;

  check(
    'implementation degree: 80 % global over 3 of 5 applicable measures (op.mon.2 does not count itself; org.1 is not evaluated)',
    campo('op.mon.2.campo2').status === 'NO_APLICA' && /^80 % global sobre 3 de 5 medidas aplicables/.test(campo('op.mon.2.campo2').value) && /DESVIACIÓN/.test(campo('op.mon.2.campo2').value),
    campo('op.mon.2.campo2').value
  );
  check(
    'and breaks it down by framework and by measure',
    campo('op.mon.2.campo2').details.some(d => /^Marco operacional: 80 % \(3 medidas\)/.test(d)) && campo('op.mon.2.campo2').details.some(d => /org\.1: sin evaluar en ENSFácil/.test(d)) && campo('op.mon.2.campo2').details.some(d => /op\.mon\.2: sin evaluar/.test(d)),
    campo('op.mon.2.campo2').details.join(' | ')
  );
  check(
    'non-evaluable controls: op.exp.7 (P-07) and op.mon.1 (P-01), without a verdict',
    campo('op.mon.2.campo5').status === 'NO_APLICA' && /^2 control\(es\)/.test(campo('op.mon.2.campo5').value) && campo('op.mon.2.campo5').details.includes('op.exp.7: P-07') && campo('op.mon.2.campo5').details.includes('op.mon.1: P-01'),
    `${campo('op.mon.2.campo5').value} ${campo('op.mon.2.campo5').details.join(' | ')}`
  );
  {
    // A measure declared applicable whose control is in the catalog without collector (DRAFT): not a level matter.
    const withDraft = evaluate(withIncidents(), { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), 'mp.com.1 | sí | MEDIA | '] });
    const draftResult = withDraft.motor() as ENSComplianceResult;
    const draftReport = buildOpMon2ReportModel(draftResult, [...panorama, from('mp.com.1', 'NO_APLICA', undefined)]);
    const details = draftReport.fields.find(f => f.id === 'op.mon.2.campo2')!.details;
    check(
      'a measure without collector yet: «sin medición todavía», out of the figure, without asking to review P-01',
      details.some(d => /^mp\.com\.1: sin medición todavía, documental hasta que su recolector emita \(no cuenta en la cifra\)$/.test(d)) && !details.some(d => /mp\.com\.1.*revisa P-01/.test(d)),
      details.join(' | ')
    );
  }
  check('R2 is presented as DATO DECLARADO', /DATO DECLARADO/.test(campo('op.mon.2.campo7').value) && campo('op.mon.2.campo7').status === 'CUMPLE', campo('op.mon.2.campo7').value);
  check('reliability carries the coverage against its target', /Cobertura de la monitorización 100 %.*objetivo ≥ 95 %: alcanzado/.test(campo('op.mon.2.campo4').value), campo('op.mon.2.campo4').value);
  check('the period\'s incident indicators, with R1', campo('op.mon.2.campo6').status === 'CUMPLE' && /tiempo_medio_resolucion: 32\.3 h/.test(campo('op.mon.2.campo6').value), campo('op.mon.2.campo6').value);
  check('the cycle series, with the latest first', /el último: 2026-T3/.test(campo('op.mon.2.campo3').value) && campo('op.mon.2.campo3').details.some(d => /2026-T2/.test(d)), campo('op.mon.2.campo3').value);
  check(
    'the art. 32 data carry each figure\'s origin',
    campo('op.mon.2.campo8').status === 'NO_APLICA' && campo('op.mon.2.campo8').details.some(d => /Grado de implantación: 80 % \(motor de ENSFácil sobre P-01/.test(d)) && campo('op.mon.2.campo8').details.some(d => /registro de incidentes de op\.exp\.7/.test(d)),
    campo('op.mon.2.campo8').details.join(' | ')
  );

  {
    // The art. 32 data carry only the incidents since the previous report period started (12-31 closing: 2025), compact.
    const old = phase(COMPLETE, 9, 'INC-2024-001', 'inicial', '2024-06-01T08:00:00Z');
    const withOld = (evaluate(withIncidents([...INCIDENTS(COMPLETE), old])).motor() as ENSComplianceResult).policyRuntime!.runtimeVariables;
    const art32 = JSON.parse(String(withOld.find(v => v.name === 'informe_art32_incidentes')!.value));
    check(
      'art. 32 incidents: since the start of the previous period, without the 2024 one',
      /^2024-12-31/.test(art32.desde) && art32.incidentes.map((i: any) => i.id).join() === 'INC-2026-014,INC-2026-015' && !art32.recortados,
      art32
    );
    check('...compact: no repeated first date, booleans only when true', art32.incidentes.every((i: any) => !('primera' in i)) && art32.incidentes[0].ccn === true && !('aepd' in art32.incidentes[0]) && art32.incidentes[1].aepd === true, art32.incidentes);
  }

  const withoutOverview = buildOpMon2ReportModel(result);
  check(
    'without the result of all controls: implementation, greys and art. 32 SIN_DATOS, never invented',
    ['op.mon.2.campo2', 'op.mon.2.campo5', 'op.mon.2.campo8'].every(id => withoutOverview.fields.find(f => f.id === id)!.status === 'SIN_DATOS')
  );
  const withOverview = getRegisteredENSReportControls().filter(id => getENSReportModelDefinition(id)?.usesAllControls);
  check('op.mon.2 is the ONLY registered report that asks for the result of all controls', JSON.stringify(withOverview) === '["op.mon.2"]', withOverview.join(', '));

  const source = (relative: string) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const reports = source('public/ens/reports/index.tsx');
  const own = reports.slice(reports.indexOf('const ControlReport = ('), reports.indexOf('const ControlReportWithPanorama = ('));
  const secondOne = reports.slice(reports.indexOf('const ControlReportWithPanorama = ('), reports.indexOf('interface ControlReportEntry'));
  check(
    'op.mon.2\'s verdict comes from ITS evaluation (the control\'s on the server), like everyone\'s, never from the shared set',
    /include: 'control',\s*controlId,/.test(own) && !/definition\.usesAllControls/.test(own) && !/exists: \{ field: 'data\.ensfacil' \}/.test(reports),
    own.length
  );
  check(
    'the overview comes from a SECOND server evaluation, that of all controls (the one the panel and Evidences use)',
    /useEnsEvaluation</.test(secondOne) && /include: 'results'/.test(secondOne) && /include: 'dashboard'/.test(source('public/ens/dashboard/ens-dashboard-main.tsx'))
  );
  check(
    'only the report that asks for it mounts that second evaluation; the others, the usual component',
    /usesAllControls \? \(\s*<ControlReportWithPanorama/.test(reports) && /\) : \(\s*<ControlReport\s/.test(reports)
  );
  check(
    'without this machine\'s overview, PDF disabled and the loading (not SIN_DATOS); the overview is only the current evaluation\'s',
    /valor: evaluation\.data \? \{ results: evaluation\.data\.results \} : undefined/.test(secondOne) &&
      /loading: valid\.cargando/.test(secondOne) &&
      /panoramaLoading: Boolean\(panorama\?\.loading\)/.test(reports) &&
      /if \(!exportable \|\| !complianceResult\) return;/.test(reports) &&
      /isDisabled=\{!exportable\}/.test(reports)
  );

  {
    let estado: EvaluationViewState<string> = initialEvaluationState<string>();
    const A = evaluationKey({ include: 'results', agentId: 'A' });
    const B = evaluationKey({ include: 'results', agentId: 'B' });
    const ve = (clave: string) => {
      const v = visibleEvaluation(estado, clave);
      return { valor: v.data, cargando: !v.data && !v.error };
    };
    const pdfActive = (v: { cargando: boolean }) => !v.cargando;

    estado = evaluationReducer(estado, { type: 'load', key: A });
    const mount2 = ve(A);
    check('first load: SIN_DATOS and PDF disabled', mount2.valor === undefined && !pdfActive(mount2));
    estado = evaluationReducer(estado, { type: 'success', key: A, data: 'panorama de A' });
    const arrivesA = ve(A);
    check('A\'s response arrives: its overview', arrivesA.valor === 'panorama de A' && pdfActive(arrivesA), JSON.stringify(arrivesA));
    estado = evaluationReducer(estado, { type: 'refresh', key: A });
    const refresh = ve(A);
    check('refresh of the SAME key in progress: A\'s overview stays and the PDF active (no flicker)', refresh.valor === 'panorama de A' && pdfActive(refresh), JSON.stringify(refresh));
    estado = evaluationReducer(estado, { type: 'success', key: A, data: 'panorama de A2' });
    check('and on return, A\'s new one', ve(A).valor === 'panorama de A2');
    const change = ve(B);
    check(
      'the key changes (another machine) and its own has not been requested yet: SIN_DATOS and PDF disabled, never A\'s overview',
      change.valor === undefined && !pdfActive(change),
      JSON.stringify(change)
    );
    estado = evaluationReducer(estado, { type: 'load', key: B });
    const inProgressB = ve(B);
    check('while B is in progress, the same: SIN_DATOS and PDF disabled', inProgressB.valor === undefined && !pdfActive(inProgressB), JSON.stringify(inProgressB));
    estado = evaluationReducer(estado, { type: 'success', key: A, data: 'tardía de A' });
    check('a late response from A does not slip into B', ve(B).valor === undefined);
    estado = evaluationReducer(estado, { type: 'success', key: B, data: 'panorama de B' });
    const arrivesB = ve(B);
    check('B arrives: its overview', arrivesB.valor === 'panorama de B' && pdfActive(arrivesB));
    const wayBack = ve(A);
    check('going back to A with B\'s data on screen does not show A\'s old one either', wayBack.valor === undefined && !pdfActive(wayBack), JSON.stringify(wayBack));
    estado = evaluationReducer(estado, { type: 'load', key: A });
    estado = evaluationReducer(estado, { type: 'failure', key: A, error: new Error('index down') });
    check('with a failure, no overview (the failure is stated apart)', ve(A).valor === undefined);
  }

  const filter = JSON.stringify(buildENSAllControlsFactsFilter(['op.acc.1', 'op.mon.2']));
  check(
    'the shared filter is the panel\'s: data.ensfacil, data.control, data.evidence_id and the ENS groups',
    ENS_FACTS_QUERY_LIMIT === 10000 && ['"exists":{"field":"data.ensfacil"}', '"exists":{"field":"data.control"}', '"exists":{"field":"data.evidence_id"}', '"rule.groups":"ENS_op.mon.2"', '"data.ensfacil":"op.acc.1"'].every(x => filter.includes(x)),
    filter
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
