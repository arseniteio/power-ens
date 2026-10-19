/** op.exp.7: judgment of incident management. */
import { opExp7PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-7.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp7CatalogDefinition } from '../common/ens/catalog/op-exp-7';
import { opExp7Configuration } from '../common/ens/configuration/data/op-exp-7-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
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

const NOW = new Date('2026-09-26T12:00:00Z');
const ago = (horas: number): string =>
  new Date(NOW.getTime() - horas * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let counter = 0;

const alert = (data: Record<string, unknown>, ts = ago(1)) => {
  counter += 1;

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: { id: '000', name: 'Wazuh-4' },
      rule: { id: '110800', description: 'op.exp.7' },
      location: '/var/log/ensfacil/op_exp_7.json',
      data: Object.fromEntries(
        Object.entries({ ensfacil: 'op.exp.7', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

type Alert = ReturnType<typeof alert>;

const events = (...alerts: Alert[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alerts);

const TODAS = 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08,EV-09,EV-10,EV-11,EV-12';

const heartbeat = (record = 'presente', extra: Record<string, unknown> = {}) =>
  alert({
    event: 'collector_run',
    resultado: 'completada',
    evidencias_cubiertas: record === 'presente' || record === 'vacio' ? TODAS : 'EV-01,EV-06,EV-09,EV-10,EV-11',
    evidencias_miradas: record === 'presente' || record === 'vacio' ? TODAS : 'EV-01,EV-06,EV-09,EV-11,EV-10',
    registro_incidentes: record,
    alertas_leidas: 16000,
    nivel_observado_desde: 7,
    perfil: 'manager',
    ...extra,
  }, ago(0.5));

const observed = (system: string, level: number, rule: string, n: number, first: string, ultima = first) =>
  alert({
    event: 'security_alert_observed',
    evidence_id: 'EV-01,EV-02,EV-03',
    sistema: system,
    agente_id: '024',
    nivel: level,
    regla: rule,
    alertas: n,
    primera: first,
    ultima,
    descripcion: `regla ${rule}`,
  });

type Row = {
  id: string;
  fase: string;
  fecha: string;
  severidad?: string;
  sistemas?: string;
  datos?: string;
  escalado?: string;
  notificado?: string;
  ccn?: string;
  mejora?: string;
};

const row = (f: Row): Alert[] => {
  const output = [
    alert({
      event: 'incident_registered',
      evidence_id: 'EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08,EV-12',
      incidente_id: f.id,
      fase: f.fase,
      fecha: f.fecha,
      severidad: f.severidad || 'alta',
      sistemas: f.sistemas || 'wazuh-real',
      clasificacion: 'acceso no autorizado',
      datos_personales: f.datos || 'no',
      relevancia_juridica: 'no',
      referencia: '-',
    }),
  ];

  if (f.escalado || f.notificado) {
    output.push(alert({
      event: 'incident_notification_recorded',
      evidence_id: 'EV-04,EV-07',
      incidente_id: f.id,
      fase: f.fase,
      fecha: f.fecha,
      severidad: f.severidad || 'alta',
      sistemas: f.sistemas || 'wazuh-real',
      escalado_a: f.escalado || '-',
      notificado_a: f.notificado || '-',
    }));
  }

  if (f.ccn) {
    output.push(alert({
      event: 'ccn_cert_notification_recorded',
      evidence_id: 'EV-08',
      incidente_id: f.id,
      fase: f.fase,
      fecha: f.fecha,
      notificacion_ccn_cert: f.ccn,
    }));
  }

  if (f.mejora) {
    output.push(alert({
      event: 'improvement_action_recorded',
      evidence_id: 'EV-12',
      incidente_id: f.id,
      fase: f.fase,
      fecha: f.fecha,
      medidas_mejora: f.mejora,
    }));
  }

  return output;
};

const configuration = (valores: Record<string, string[]>): ENSControlConfiguration => ({
  ...opExp7Configuration,
  parameters: opExp7Configuration.parameters.map(p => ({
    ...p,
    value: valores[p.id],
  })),
});

const evaluate = (
  evs: ENSNormalizedEvent[],
  valores: Record<string, string[]>,
  level: ENSLevel = 'ALTO',
  now: Date = NOW
) => {
  const cfg = configuration(valores);
  const evidences = resolveEvidenceForControl('op.exp.7', evs, '000', level, cfg, now);
  const context = buildPolicyContext(opExp7CatalogDefinition, cfg, level, evs, evidences, now);
  const { decisions } = opExp7PolicyDefinition.evaluator!(context);
  const principal = (requirement: string) => decisions.find(d => d.requirementId === requirement)!;
  const ofEvidence = (id: string) =>
    decisions.find(d => d.trace.ruleId.endsWith(`/${id}`));
  const estado = (id: string) => ofEvidence(id)?.status;
  const motive = (id: string) => ofEvidence(id)?.reason || '';

  return { evidencias: evidences, decisions, principal, deEvidencia: ofEvidence, estado, motivo: motive };
};

const P01 = ['intrusión | Crítica | 13 | si | compromiso confirmado', 'ataque | Alta | 12 | no |', 'aviso | Media | 7 | no |'];
const P02 = ['Crítica | RSI + CISO | 1 | teléfono', 'Alta | RSI | 4 | correo', 'Media | RSI | 24 | correo'];
const BASE = { 'P-01': P01, 'P-02': P02 };

section('1. Applicability and contract');

{
  const levelsOf = (id: string) =>
    opExp7CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  check('the base applies at the three', ['op.exp.7.1', 'op.exp.7.2'].every(id => levelsOf(id) === 'BAJO,MEDIO,ALTO'));
  check('R1 and R2 apply at MEDIO and ALTO', ['op.exp.7.r1.1', 'op.exp.7.r2.1', 'op.exp.7.r2.2', 'op.exp.7.r2.3', 'op.exp.7.r2.4'].every(id => levelsOf(id) === 'MEDIO,ALTO'));
  check('R3 solo en ALTO', ['op.exp.7.r3.1', 'op.exp.7.r3.2'].every(id => levelsOf(id) === 'ALTO'));
  check('R4 applies at no level', levelsOf('op.exp.7.r4.1') === '');
  check('the control is ACTIVE', opExp7CatalogDefinition.status === 'ACTIVE', opExp7CatalogDefinition.status);

  const ours = ENSEvidenceCatalog.filter(e => e.controlId === 'op.exp.7');
  check('twelve evidences, all with a rule from band 110800-110899',
    ours.length === 12 && ours.every(e => e.relatedRules.length && e.relatedRules.every(r => /^1108\d\d$/.test(r))),
    ours.map(e => `${e.id}:${e.relatedRules.join('+')}`).join(' '));
  check('none declares `judgment`: the policy decides them all', ours.every(e => !e.judgment));
  check('actions are NOT state facts (security_alert_observed, active_response_executed)',
    ours.every(e => !(e.stateFactEventTypes || []).some(t => t === 'security_alert_observed' || t === 'active_response_executed')));

  const p03 = opExp7Configuration.parameters.find(p => p.id === 'P-03')!;
  check('P-03 admits no credentials: no access column',
    p03.type === 'table' && (p03.columns || []).every(c => !/acceso|clave|password|token|usuario|api/i.test(`${c.name} ${c.label}`)),
    (p03.columns || []).map(c => c.name).join(','));
  check('P-03, P-06, P-07, P-08 and P-11 are tables with columns',
    ['P-03', 'P-06', 'P-07', 'P-08', 'P-11'].every(id => {
      const p = opExp7Configuration.parameters.find(x => x.id === id)!;

      return p.type === 'table' && (p.columns || []).length >= 2;
    }));
  check('P-ATT is optional', opExp7Configuration.parameters.find(p => p.id === 'P-ATT')!.required === false);
}

section('2. Without a collector pass, or without an incident record');

{
  const withoutHeartbeat = evaluate(events(observed('wazuh-real', 13, '23506', 10, ago(48))), BASE);
  check('no heartbeat: EV-01 and EV-02 NO_EVALUABLE naming the collector',
    withoutHeartbeat.estado('EV-01') === 'NO_EVALUABLE' && withoutHeartbeat.estado('EV-02') === 'NO_EVALUABLE' && /ens_opexp7_collect/.test(withoutHeartbeat.motivo('EV-02')),
    withoutHeartbeat.motivo('EV-02'));

  const absent = events(
    heartbeat('ausente'),
    alert({ event: 'evidence_state', evidence_id: 'EV-02', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de incidentes /etc/ensfacil/incident-register.tsv' }, ago(0.5)),
    observed('wazuh-real', 13, '23506', 10, ago(48)),
  );
  const r = evaluate(absent, BASE);
  check('absent record: EV-02 NO_EVALUABLE with the collector\'s motive',
    r.estado('EV-02') === 'NO_EVALUABLE' && /no existe el registro/.test(r.motivo('EV-02')), r.motivo('EV-02'));
  check('and EV-01, which does not depend on the record, CUMPLE', r.estado('EV-01') === 'CUMPLE', r.motivo('EV-01'));
  check('EV-03 to EV-08 and EV-12 NO_EVALUABLE, never CUMPLE or NO_CUMPLE',
    ['EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-12'].every(id => r.estado(id) === 'NO_EVALUABLE'));

  const old = evaluate(absent, BASE, 'ALTO', new Date(NOW.getTime() + 30 * 3600000));
  check('30 h later without a new heartbeat: EV-01 stops asserting → NO_EVALUABLE', old.estado('EV-01') === 'NO_EVALUABLE', old.motivo('EV-01'));
}

section('3. EV-02 · High or Critical alerts without an incident');

{
  const vd = events(heartbeat('vacio'), observed('wazuh-real', 13, '23506', 424, ago(24 * 20), ago(24 * 20 - 0.1)));

  const r1 = evaluate(vd, BASE);
  check('424 level-13 alerts with no incident → NO_CUMPLE', r1.estado('EV-02') === 'NO_CUMPLE', r1.motivo('EV-02'));
  check('and the motive names system, number and rule', /wazuh-real: 424 alerta\(s\) Crítica de la regla 23506/.test(r1.motivo('EV-02')), r1.motivo('EV-02'));

  const r2 = evaluate(vd, { ...BASE, 'P-12': ['23506 | CVE crítica: se gestiona en op.exp.4'] });
  check('REVERSAL: the SAME alert with 23506 in P-12 → CUMPLE', r2.estado('EV-02') === 'CUMPLE', r2.motivo('EV-02'));
  check('and the exclusion is not silent: count and motive in the verdict', /424 alerta\(s\) de la regla 23506 \(CVE crítica: se gestiona en op.exp.4\)/.test(r2.motivo('EV-02')), r2.motivo('EV-02'));

  const level10 = events(heartbeat('vacio'), observed('wazuh-real', 10, '5404', 2, ago(48)));
  const r3 = evaluate(level10, BASE);
  check('level 10 with Alta from 12 is not relevant → CUMPLE', r3.estado('EV-02') === 'CUMPLE', r3.motivo('EV-02'));
  const r3b = evaluate(level10, { ...BASE, 'P-01': ['ataque | Alta | 10 | no |'] });
  check('REVERSAL: the SAME event with Alta from 10 → NO_CUMPLE', r3b.estado('EV-02') === 'NO_CUMPLE', r3b.motivo('EV-02'));

  const recent = events(heartbeat('vacio'), observed('wazuh-real', 12, '5712', 1, ago(2)));
  const r4 = evaluate(recent, BASE);
  check('Alta alert from 2 h ago with escalation deadline 4 h: not an orphan yet → CUMPLE and says so', r4.estado('EV-02') === 'CUMPLE' && /dentro de su plazo de escalado/.test(r4.motivo('EV-02')), r4.motivo('EV-02'));
  const r4b = evaluate(recent, BASE, 'ALTO', new Date(NOW.getTime() + 3 * 3600000));
  check('REVERSAL: 3 h later, with the heartbeat still fresh → NO_CUMPLE', r4b.estado('EV-02') === 'NO_CUMPLE', r4b.motivo('EV-02'));

  const withIncident = events(
    heartbeat(),
    observed('wazuh-real', 12, '5712', 3, ago(10)),
    ...row({ id: 'INC-1', fase: 'inicial', fecha: ago(8) }),
  );
  const r5 = evaluate(withIncident, BASE);
  check('incident of the system opened 2 h later (deadline 4) → CUMPLE naming the incident', r5.estado('EV-02') === 'CUMPLE' && /INC-1/.test(r5.motivo('EV-02')), r5.motivo('EV-02'));

  const late = events(
    heartbeat(),
    observed('wazuh-real', 12, '5712', 3, ago(10)),
    ...row({ id: 'INC-1', fase: 'inicial', fecha: ago(5) }),
  );
  const r6 = evaluate(late, BASE);
  check('REVERSAL: registered 5 h later (deadline 4) → NO_CUMPLE', r6.estado('EV-02') === 'NO_CUMPLE', r6.motivo('EV-02'));

  const otherSystem = events(
    heartbeat(),
    observed('wazuh-real', 12, '5712', 3, ago(10)),
    ...row({ id: 'INC-1', fase: 'inicial', fecha: ago(8), sistemas: 'zimbraHldap' }),
  );
  check('an incident of ANOTHER system does not reconcile the alert → NO_CUMPLE', evaluate(otherSystem, BASE).estado('EV-02') === 'NO_CUMPLE');

  const withoutCoverage = events(heartbeat('vacio', { evidencias_cubiertas: 'EV-01' }));
  check('no alerts but no declared record coverage → NO_EVALUABLE, silence does not accredit',
    evaluate(withoutCoverage, BASE).estado('EV-02') === 'NO_EVALUABLE', evaluate(withoutCoverage, BASE).motivo('EV-02'));
  check('sin P-02 → NO_EVALUABLE', evaluate(vd, { 'P-01': P01 }).estado('EV-02') === 'NO_EVALUABLE');
}

section('4. EV-03 · MTTD and MTTR against P-05 (op.exp.7.r2.2)');

{
  const incident = events(
    heartbeat(),
    observed('wazuh-real', 12, '5712', 1, ago(72)),
    ...row({ id: 'INC-7', fase: 'inicial', fecha: ago(70) }),
    ...row({ id: 'INC-7', fase: 'intermedio', fecha: ago(68) }),
    ...row({ id: 'INC-7', fase: 'final', fecha: ago(40) }),
  );

  const r1 = evaluate(incident, { ...BASE, 'P-05': ['Alta | 4 | 24'] });
  check('resolution in 30 h with deadline 24 → NO_CUMPLE', r1.estado('EV-03') === 'NO_CUMPLE', r1.motivo('EV-03'));
  check('the motive gives the mean and the MTTD', /resolución media de Alta 30\.0 h > 24 h/.test(r1.motivo('EV-03')) && /MTTD 2\.0 h/.test(r1.motivo('EV-03')), r1.motivo('EV-03'));

  const r2 = evaluate(incident, { ...BASE, 'P-05': ['Alta | 4 | 48'] });
  check('REVERSAL: the SAME incident with deadline 48 → CUMPLE', r2.estado('EV-03') === 'CUMPLE', r2.motivo('EV-03'));

  const r3 = evaluate(incident, { ...BASE, 'P-05': ['Alta | 1 | 48'] });
  check('containment in 2 h with deadline 1 → NO_CUMPLE', r3.estado('EV-03') === 'NO_CUMPLE', r3.motivo('EV-03'));

  const opened = events(heartbeat(), ...row({ id: 'INC-8', fase: 'inicial', fecha: ago(60) }));
  const r4 = evaluate(opened, { ...BASE, 'P-05': ['Alta | 4 | 48'] });
  check('open 60 h without containing or resolving, deadlines 4/48 → NO_CUMPLE: what is open counts with what it has accumulated', r4.estado('EV-03') === 'NO_CUMPLE', r4.motivo('EV-03'));
  const r4b = evaluate(opened, { ...BASE, 'P-05': ['Alta | 72 | 96'] });
  check('REVERSAL: still within its deadlines → NO_EVALUABLE (nothing measured yet)', r4b.estado('EV-03') === 'NO_EVALUABLE', r4b.motivo('EV-03'));

  check('no incidents → NO_EVALUABLE, not CUMPLE', evaluate(events(heartbeat('vacio')), { ...BASE, 'P-05': ['Alta | 4 | 48'] }).estado('EV-03') === 'NO_EVALUABLE');
  check('sin P-05 → NO_EVALUABLE', evaluate(incident, BASE).estado('EV-03') === 'NO_EVALUABLE');

  const downgraded = events(
    heartbeat(),
    observed('wazuh-real', 12, '5712', 1, ago(72)),
    ...row({ id: 'INC-8', fase: 'inicial', fecha: ago(70), severidad: 'alta' }),
    ...row({ id: 'INC-8', fase: 'intermedio', fecha: ago(68), severidad: 'Crítica' }),
    ...row({ id: 'INC-8', fase: 'final', fecha: ago(40), severidad: 'baja' }),
  );
  const r5 = evaluate(downgraded, { ...BASE, 'P-05': ['Crítica | 4 | 24', 'Baja | 4 | 48'] });
  check('critical in one phase and downgraded to low on closing: the highest counts → resolution 30 h > Crítica\'s 24 h, NO_CUMPLE',
    r5.estado('EV-03') === 'NO_CUMPLE' && /Crítica 30\.0 h > 24 h/.test(r5.motivo('EV-03')), r5.motivo('EV-03'));
}

section('5. EV-04 · escalation (P-02) and owners (P-04)');

{
  const criticalOne = (escalado: string, notified = '-') => events(
    heartbeat(),
    ...row({ id: 'INC-9', fase: 'inicial', fecha: ago(30), severidad: 'critica', escalado }),
    ...row({ id: 'INC-9', fase: 'intermedio', fecha: ago(29.5), severidad: 'critica', notificado: notified }),
  );

  const r1 = evaluate(criticalOne('RSI'), BASE, 'BAJO');
  check('critical escalated only to RSI when P-02 requires RSI + CISO → NO_CUMPLE', r1.estado('EV-04') === 'NO_CUMPLE' && /CISO/.test(r1.motivo('EV-04')), r1.motivo('EV-04'));
  const r2 = evaluate(criticalOne('RSI + CISO'), BASE, 'BAJO');
  check('REVERSAL: escalated to RSI + CISO → CUMPLE at BAJO', r2.estado('EV-04') === 'CUMPLE', r2.motivo('EV-04'));

  const r3 = evaluate(criticalOne('RSI + CISO'), BASE, 'MEDIO');
  check('at MEDIO without P-04 → NO_EVALUABLE (r2.3 undecided)', r3.estado('EV-04') === 'NO_EVALUABLE', r3.motivo('EV-04'));
  const r4 = evaluate(criticalOne('RSI + CISO'), { ...BASE, 'P-04': ['wazuh-real | J. Ruiz | M. Sanz'] }, 'MEDIO');
  check('with P-04 and no communication to the owners → NO_CUMPLE', r4.estado('EV-04') === 'NO_CUMPLE' && /J\. Ruiz|j\. ruiz/i.test(r4.motivo('EV-04')), r4.motivo('EV-04'));
  const r5 = evaluate(criticalOne('RSI + CISO', 'J. Ruiz, M. Sanz'), { ...BASE, 'P-04': ['wazuh-real | J. Ruiz | M. Sanz'] }, 'MEDIO');
  check('REVERSAL: J. Ruiz and M. Sanz notified → CUMPLE', r5.estado('EV-04') === 'CUMPLE', r5.motivo('EV-04'));
}

section('6. EV-05 · the alert log of each incident day');

{
  const stamp = (computed: string, preserved = 'si') => alert({
    event: 'alert_log_seal_checked',
    evidence_id: 'EV-05',
    dia: '2026-09-24',
    fichero: 'logs/alerts/2026/Sep/ossec-alerts-24.json.gz',
    conservado: preserved,
    sellado: preserved,
    sello_sha256: 'aaaa1111',
    calculado_sha256: computed,
    cadena_sha256: 'bbbb',
    anterior_sha256: 'bbbb',
    incidentes: 'INC-5',
  });
  const base = (s: Alert) => events(heartbeat(), s, ...row({ id: 'INC-5', fase: 'inicial', fecha: ago(40) }));
  const P08 = { ...BASE, 'P-08': ['registros de alertas del SIEM | manager', 'volcado de memoria | repositorio forense'] };

  const r1 = evaluate(base(stamp('aaaa1111')), P08);
  check('seal and content match → CUMPLE', r1.estado('EV-05') === 'CUMPLE', r1.motivo('EV-05'));
  check('and says what of P-08 is NOT verified', /volcado de memoria/.test(r1.motivo('EV-05')), r1.motivo('EV-05'));
  const r2 = evaluate(base(stamp('cccc2222')), P08);
  check('REVERSAL: content different from the sealed one → NO_CUMPLE (tampered)', r2.estado('EV-05') === 'NO_CUMPLE' && /alterado/.test(r2.motivo('EV-05')), r2.motivo('EV-05'));
  const r3 = evaluate(base(stamp('-', 'no')), P08);
  check('the day is not preserved → NO_CUMPLE', r3.estado('EV-05') === 'NO_CUMPLE', r3.motivo('EV-05'));
  check('sin P-08 → NO_EVALUABLE', evaluate(base(stamp('aaaa1111')), BASE).estado('EV-05') === 'NO_EVALUABLE');
}

section('7. EV-06 · containment of serious incidents');

{
  const ar = alert({
    event: 'active_response_executed',
    evidence_id: 'EV-06,EV-09,EV-11',
    sistema: 'wazuh-real',
    comando: 'firewall-drop',
    accion: 'add',
    regla: '651',
    regla_disparadora: '5763',
    instante: ago(49),
  });
  const closed = [
    ...row({ id: 'INC-3', fase: 'inicial', fecha: ago(48) }),
    ...row({ id: 'INC-3', fase: 'final', fecha: ago(20) }),
  ];

  const r1 = evaluate(events(heartbeat(), ...closed), BASE);
  check('high closed without active response or intermediate phase → NO_CUMPLE', r1.estado('EV-06') === 'NO_CUMPLE', r1.motivo('EV-06'));
  const r2 = evaluate(events(heartbeat(), ar, ...closed), { ...BASE, 'P-09': ['firewall-drop | fuerza bruta | origen | 180 s'] });
  check('REVERSAL: P-09\'s firewall-drop on its system, 1 h before (escalation deadline 4) → CUMPLE', r2.estado('EV-06') === 'CUMPLE', r2.motivo('EV-06'));
  const r3 = evaluate(events(heartbeat(), ar, ...closed), BASE);
  check('the SAME active response without declaring it in P-09 does not count → NO_CUMPLE and says so', r3.estado('EV-06') === 'NO_CUMPLE' && /no declara/.test(r3.motivo('EV-06')), r3.motivo('EV-06'));
}

section('8. EV-07 · GDPR: assessment and AEPD within 72 hours');

{
  const P07 = { ...BASE, 'P-07': ['zimbraHldap | directorio de usuarios'] };
  const withData = (opening: number, notified?: string) => events(
    heartbeat(),
    ...row({ id: 'INC-4', fase: 'inicial', fecha: ago(opening), sistemas: 'zimbraHldap', datos: 'si' }),
    ...(notified ? row({ id: 'INC-4', fase: 'intermedio', fecha: ago(opening - 10), sistemas: 'zimbraHldap', datos: 'si', notificado: notified }) : []),
  );

  const r1 = evaluate(withData(100), P07);
  check('affects personal data, 100 h, no AEPD → NO_CUMPLE', r1.estado('EV-07') === 'NO_CUMPLE', r1.motivo('EV-07'));
  const r2 = evaluate(withData(100, 'AEPD'), P07);
  check('REVERSAL: notified to the AEPD at 10 h → CUMPLE', r2.estado('EV-07') === 'CUMPLE', r2.motivo('EV-07'));
  const r3 = evaluate(withData(20), P07);
  check('at 20 h with no AEPD yet: pending → NO_EVALUABLE, not NO_CUMPLE', r3.estado('EV-07') === 'NO_EVALUABLE', r3.motivo('EV-07'));

  const unassessed = events(heartbeat(), ...row({ id: 'INC-6', fase: 'inicial', fecha: ago(100), sistemas: 'zimbraHldap', datos: '-' }));
  check('incident on a P-07 system without assessment → NO_CUMPLE', evaluate(unassessed, P07).estado('EV-07') === 'NO_CUMPLE');
  check('REVERSAL: the SAME incident with P-07 on another system → NO_EVALUABLE (does not affect it)',
    evaluate(unassessed, { ...BASE, 'P-07': ['wazuh-real | nóminas'] }).estado('EV-07') === 'NO_EVALUABLE');
}

section('9. EV-08 · notification to CCN-CERT');

{
  const P06 = { ...BASE, 'P-06': ['LUCIA | Subdirección General'] };
  const criticalOne = (ccn?: string) => events(heartbeat(), ...row({ id: 'INC-2', fase: 'inicial', fecha: ago(10), severidad: 'critica', ccn }));

  check('critical (notifiable in P-01) not notified after 10 h (deadline 1) → NO_CUMPLE', evaluate(criticalOne(), P06).estado('EV-08') === 'NO_CUMPLE');
  check('REVERSAL: notified after 30 min → CUMPLE', evaluate(criticalOne(ago(9.5)), P06).estado('EV-08') === 'CUMPLE', evaluate(criticalOne(ago(9.5)), P06).motivo('EV-08'));
  check('sin P-06 → NO_EVALUABLE', evaluate(criticalOne(), BASE).estado('EV-08') === 'NO_EVALUABLE');
  const alto = events(heartbeat(), ...row({ id: 'INC-2', fase: 'inicial', fecha: ago(10), severidad: 'alta' }));
  check('Alta is not notifiable in P-01 → NO_EVALUABLE (nothing to notify)', evaluate(alto, P06).estado('EV-08') === 'NO_EVALUABLE');
}

section('10. EV-10 · CDB lists from CCN-CERT notices');

{
  const list = (modifiedOne: string, rules = 16) => events(
    heartbeat(),
    alert({ event: 'threat_list_observed', evidence_id: 'EV-10', lista: 'etc/lists/malicious-ioc/malicious-ip', existe: 'si', modificada: modifiedOne, entradas: 199, compilada: 'si', reglas_que_la_usan: rules }),
  );
  const P11 = (days: number) => ({ 'P-11': [`boletines CCN-CERT | RSI | etc/lists/malicious-ioc/malicious-ip | ${days}`] });

  check('list used and updated 3 days ago with deadline 7 → CUMPLE', evaluate(list(ago(72)), P11(7)).estado('EV-10') === 'CUMPLE');
  check('REVERSAL: the SAME list with deadline 2 → NO_CUMPLE', evaluate(list(ago(72)), P11(2)).estado('EV-10') === 'NO_CUMPLE');
  check('no rule uses it → NO_CUMPLE', evaluate(list(ago(72), 0), P11(7)).estado('EV-10') === 'NO_CUMPLE');
  check('a P-11 list that ossec.conf does not load → NO_CUMPLE',
    evaluate(list(ago(72)), { 'P-11': ['boletines | RSI | etc/lists/ccn-cert-ioc | 7'] }).estado('EV-10') === 'NO_CUMPLE');
}

section('11. EV-12 · improvement after closing; EV-09 · no observable element');

{
  const closed = (improvement?: string) => events(
    heartbeat(),
    ...row({ id: 'INC-1', fase: 'inicial', fecha: ago(50) }),
    ...row({ id: 'INC-1', fase: 'final', fecha: ago(20), mejora: improvement }),
  );

  check('closed without improvement measures → NO_CUMPLE', evaluate(closed(), BASE).estado('EV-12') === 'NO_CUMPLE');
  check('REVERSAL: with measures → CUMPLE', evaluate(closed('revisión de sudoers'), BASE).estado('EV-12') === 'CUMPLE');

  const r = evaluate(events(heartbeat('vacio'), observed('wazuh-real', 7, '550', 1, ago(3))), { 'P-10': ['fw-perimetral | reglas | RSI'], 'P-09': ['firewall-drop | x | y | z'] });
  check('P-10 with an element without an agent → NO_EVALUABLE saying it cannot be observed', r.estado('EV-09') === 'NO_EVALUABLE' && /no se pueden observar/.test(r.motivo('EV-09')), r.motivo('EV-09'));
}

section('12. The decision reaches the requirement and the evidence table');

{
  const evs = events(heartbeat('vacio'), observed('wazuh-real', 13, '23506', 424, ago(24 * 20)));
  const r = evaluate(evs, BASE, 'BAJO');
  const decision = r.principal('op.exp.7.1');
  check('the FIRST decision of op.exp.7.1 is the requirement\'s, and it is NO_CUMPLE', decision.status === 'NO_CUMPLE' && decision.trace.ruleId === 'op.exp.7.1', `${decision.trace.ruleId} ${decision.status}`);

  const requirement = evaluateRequirement(
    opExp7CatalogDefinition.requirements.find(q => q.id === 'op.exp.7.1')!,
    'BAJO',
    r.evidencias,
    false,
    r.decisions,
    'ACTIVE'
  );
  check('evaluateRequirement publishes op.exp.7.1 measured NO_CUMPLE', requirement.status === 'NO_CUMPLE' && requirement.evidenced === true, `${requirement.status} ${requirement.evidenced}`);

  const tabla = applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp7CatalogDefinition.requirements);
  const color = (id: string) => tabla.find(e => e.id === id)?.status;
  check('EV-02 comes out NO_CUMPLE in the table', color('EV-02') === 'NO_CUMPLE', color('EV-02'));
  check('and EV-01, which is measured, comes out CUMPLE: it does not inherit EV-02\'s red', color('EV-01') === 'CUMPLE', color('EV-01'));
}

section('14. Automatic response: only one triggered by an alert accredits');

{
  const restart = (triggering: string) =>
    alert({
      event: 'active_response_executed',
      evidence_id: 'EV-06,EV-09,EV-11',
      sistema: 'WIN-OPACC-LAB',
      agente_id: '029',
      comando: 'restart-wazuh',
      programa: 'restart-wazuh.exe',
      accion: 'add',
      regla: '657',
      regla_disparadora: triggering,
      origen: '-',
      instante: '2026-09-24T07:09:48Z',
    });
  const configured = alert({
    event: 'active_response_configured',
    evidence_id: 'EV-11',
    comando: 'firewall-drop',
    reglas: '5763',
    deshabilitada: 'no',
  }, ago(0.5));

  const withoutOrigin = evaluate(events(heartbeat('vacio'), configured, restart('-')), BASE);
  check('restart-wazuh.exe without a source alert does NOT accredit EV-11 (not CUMPLE)',
    withoutOrigin.estado('EV-11') !== 'CUMPLE', `${withoutOrigin.estado('EV-11')} ${withoutOrigin.motivo('EV-11')}`);
  check('and the motive names it as an execution without an alert that triggers it',
    /sin alerta que las dispare/.test(withoutOrigin.motivo('EV-11')) && /restart-wazuh\.exe/.test(withoutOrigin.motivo('EV-11')), withoutOrigin.motivo('EV-11'));
  check('it stays unmeasured with cause EVIDENCE (the data arrived, it proves nothing)',
    withoutOrigin.estado('EV-11') === 'NO_EVALUABLE' && withoutOrigin.deEvidencia('EV-11')?.cause === 'EVIDENCE', `${withoutOrigin.estado('EV-11')} ${withoutOrigin.deEvidencia('EV-11')?.cause}`);

  const withOrigin = evaluate(events(heartbeat('vacio'), configured, restart('5763')), BASE);
  check('REVERSAL: the SAME execution triggered by rule 5763 → CUMPLE',
    withOrigin.estado('EV-11') === 'CUMPLE', withOrigin.motivo('EV-11'));

  const closed = [
    ...row({ id: 'INC-4', fase: 'inicial', fecha: ago(48), sistemas: 'WIN-OPACC-LAB' }),
    ...row({ id: 'INC-4', fase: 'final', fecha: ago(20), sistemas: 'WIN-OPACC-LAB' }),
  ];
  const ar = (triggering: string) =>
    alert({
      event: 'active_response_executed',
      evidence_id: 'EV-06,EV-09,EV-11',
      sistema: 'WIN-OPACC-LAB',
      comando: 'restart-wazuh',
      accion: 'add',
      regla: '657',
      regla_disparadora: triggering,
      instante: ago(47),
    });
  const p09 = { ...BASE, 'P-09': ['restart-wazuh | x | y | z'] };
  const contentWithoutOrigin = evaluate(events(heartbeat(), ar('-'), ...closed), p09);
  check('EV-06: a P-09 response without a source alert does not contain the incident → NO_CUMPLE',
    contentWithoutOrigin.estado('EV-06') === 'NO_CUMPLE', contentWithoutOrigin.motivo('EV-06'));
  const contentWithOrigin = evaluate(events(heartbeat(), ar('5763'), ...closed), p09);
  check('REVERSAL: the same response triggered by an alert → CUMPLE',
    contentWithOrigin.estado('EV-06') === 'CUMPLE', contentWithOrigin.motivo('EV-06'));
}

section('15. The gap cause reaches the evidence');

{
  const withoutP01 = evaluate(events(heartbeat('vacio'), observed('wazuh-real', 13, '23506', 10, ago(48))), { 'P-02': P02 });
  const tabla = applyPolicyDecisionsToEvidences(withoutP01.evidencias, withoutP01.decisions, opExp7CatalogDefinition.requirements);
  const ev02 = tabla.find(e => e.id === 'EV-02');
  check('without P-01 → EV-02 NO_EVALUABLE with cause CONFIGURATION in the table',
    ev02?.status === 'NO_EVALUABLE' && ev02?.gapCause === 'CONFIGURATION', `${ev02?.status} ${ev02?.gapCause}`);

  const absent = evaluate(events(
    heartbeat('ausente'),
    alert({ event: 'evidence_state', evidence_id: 'EV-04', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de incidentes /etc/ensfacil/incident-register.tsv' }, ago(0.5)),
  ), BASE);
  const absentTable = applyPolicyDecisionsToEvidences(absent.evidencias, absent.decisions, opExp7CatalogDefinition.requirements);
  const ev04 = absentTable.find(e => e.id === 'EV-04');
  check('absent record (collector\'s CONFIGURATION) → EV-04 with cause CONFIGURATION',
    ev04?.status === 'NO_EVALUABLE' && ev04?.gapCause === 'CONFIGURATION', `${ev04?.status} ${ev04?.gapCause}`);
  const ev03 = absentTable.find(e => e.id === 'EV-03');
  check('and EV-03, which the collector does not degrade, also CONFIGURATION: the heartbeat says record absent',
    ev03?.status === 'NO_EVALUABLE' && ev03?.gapCause === 'CONFIGURATION', `${ev03?.status} ${ev03?.gapCause}`);

  const withoutHeartbeat = evaluate(events(observed('wazuh-real', 13, '23506', 10, ago(48))), BASE);
  check('without a collector pass → EV-02\'s decision carries cause COLLECTION',
    withoutHeartbeat.deEvidencia('EV-02')?.cause === 'COLLECTION', withoutHeartbeat.deEvidencia('EV-02')?.cause);
}

section('13. Only op.exp.7 facts count');

{
  const foreignOne = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': ago(1),
      agent: { id: '000', name: 'Wazuh-4' },
      rule: { id: '110900' },
      data: { ensfacil: 'op.exp.9', event: 'security_alert_observed', sistema: 'wazuh-real', nivel: '13', regla: '1', alertas: '5', primera: ago(48), ultima: ago(48) },
    },
  }]);
  const r = evaluate([...events(heartbeat('vacio')), ...foreignOne], BASE);
  check('an alert with another control\'s tag does not count → EV-02 CUMPLE', r.estado('EV-02') === 'CUMPLE', r.motivo('EV-02'));
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL`);
  process.exit(1);
}

console.log('all checks pass');
