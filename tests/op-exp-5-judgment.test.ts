/** op.exp.5: judgment of change management. */
import { opExp5PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-5.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp5CatalogDefinition } from '../common/ens/catalog/op-exp-5';
import { opExp5Configuration } from '../common/ens/configuration/data/op-exp-5-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import {
  evaluateRequirement,
  evaluateRequirements,
} from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';
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
const ago = (hours: number): string =>
  new Date(NOW.getTime() - hours * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let counter = 0;

const alert = (data: Record<string, unknown>, ts = ago(1)) => {
  counter += 1;

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: { id: '024', name: 'wazuh-real' },
      rule: { id: '110600', description: 'op.exp.5' },
      location: '/var/log/power-ens/op_exp_5.json',
      data: Object.fromEntries(
        Object.entries({ power_ens: 'op.exp.5', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

type Alert = ReturnType<typeof alert>;

const configuration = (values: Record<string, unknown>): ENSControlConfiguration => ({
  ...opExp5Configuration,
  parameters: opExp5Configuration.parameters.map(p => ({
    ...p,
    value: values[p.id] as never,
  })),
});

const BASE: Record<string, unknown> = {
  'P-01': ['registro_tsv | /etc/power-ens/change-register.tsv | RFC-'],
  'P-02': ['descripcion', 'riesgo', 'aprobado_por', 'ventana_inicio', 'ventana_fin'],
  'P-03': ['cambio en el cortafuegos o en la autenticación'],
  'P-04': ['Responsable de Seguridad | rsi'],
  'P-05': ['wazuh-real | pre-real | informe 2026-09'],
  'P-06': ['inventario | /srv/doc/inventario.ods | 7'],
  'P-07': ['buzon | rsi@organizacion.es'],
  'P-08': ['* | lvm | snapshot previo | 24'],
  'P-09': '24',
};

const withIt = (changesList: Record<string, unknown>): Record<string, unknown> => ({ ...BASE, ...changesList });

const request = (fields: Record<string, string>) => ({
  peticion_id: 'RFC-1',
  fecha_registro: ago(48),
  sistema: 'wazuh-real',
  descripcion: 'actualización de seguridad',
  riesgo: 'bajo',
  aprobado_por: 'rsi',
  fecha_aprobacion: ago(24),
  ventana_inicio: ago(6),
  ventana_fin: ago(4),
  preproduccion: '-',
  estado: 'implantada',
  documentacion: '-',
  impacto_seguridad: 'bajo: parche de seguridad',
  referencia: 'https://tickets.invalido/RFC-1',
  ...fields,
});

const record = (requests: Record<string, string>[], extra: Record<string, unknown> = {}, ts = ago(0.5)): Alert[] => [
  alert({
    event: 'change_register_read',
    evidence_id: 'EV-02,EV-03,EV-04,EV-06',
    registro: '/etc/power-ens/change-register.tsv',
    filas: requests.length,
    filas_ilegibles: 0,
    firma: 'f1',
    leido: ts,
    sistema_local: 'wazuh-real',
    ...extra,
  }, ts),
  ...requests.map((p, i) =>
    alert({
      event: 'change_request_registered',
      evidence_id: 'EV-02,EV-03,EV-04,EV-06',
      registro_firma: 'f1',
      linea: i + 2,
      ...p,
    }, ts)
  ),
];

const heartbeat = (covered = 'EV-01,EV-07', ts = ago(0.5)) =>
  alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: covered }, ts);

const software = (start: string, end = start, actor = 'unattended-upgrades') =>
  alert({
    event: 'package_changed',
    evidence_id: 'EV-01,EV-02,EV-04,EV-07,EV-09',
    actor,
    mecanismo: 'unattended-upgrades',
    inicio: start,
    fin: end,
    paquetes: 'openssl 3.0.13-0ubuntu3.6',
  }, end);

const editedConfiguration = (first: string, process = '/usr/bin/vim.basic') =>
  alert({
    event: 'config_file_modified',
    evidence_id: 'EV-01,EV-02,EV-04,EV-07,EV-09',
    actor: 'diqueran',
    sesion: 'con_sesion',
    recurso: '/etc/ssh/sshd_config',
    operacion: 'rename',
    proceso: process,
    primera: first,
    ultima: first,
  }, first);

const port = (since: string, detected: string) =>
  alert({
    event: 'listening_port_changed',
    evidence_id: 'EV-01,EV-02,EV-04,EV-07',
    cambio: 'abierto',
    protocolo: 'tcp',
    direccion: '0.0.0.0',
    puerto: 8443,
    proceso: 'nginx',
    desde: since,
    detectado: detected,
  }, detected);

const down = (unit: string, since: string, ts = ago(0.5)) =>
  alert({ event: 'service_failed', evidence_id: 'EV-07', unidad: unit, desde: since }, ts);

const document = (ruta: string, modified: string) =>
  alert({ event: 'config_doc_modified', evidence_id: 'EV-06', ruta, modificado: modified }, ago(0.5));

const snapshot = (created: string) =>
  alert({ event: 'reversion_point_created', evidence_id: 'EV-09', mecanismo: 'lvm', identificador: 'vg0/pre-cambio', creado: created }, ago(0.5));

const evaluate = (alerts: Alert[], values: Record<string, unknown> = BASE, level: ENSLevel = 'ALTO') => {
  const cfg = configuration(values);
  const evs: ENSNormalizedEvent[] = keepLatestRunStateFacts('op.exp.5', normalizeWazuhAlerts(alerts), NOW);
  const evidences = resolveEvidenceForControl('op.exp.5', evs, '024', level, cfg, NOW);
  const context = buildPolicyContext(opExp5CatalogDefinition, cfg, level, evs, evidences, NOW);
  const { decisions } = opExp5PolicyDefinition.evaluator!(context);
  const ofEvidence = (id: string) => decisions.find(d => d.trace.ruleId.endsWith(`/${id}`));
  const estado = (id: string) => ofEvidence(id)?.status;
  const motive = (id: string) => ofEvidence(id)?.reason || '(sin decisión)';
  const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, opExp5CatalogDefinition.requirements);
  const requirement = (id: string) =>
    evaluateRequirement(
      opExp5CatalogDefinition.requirements.find(q => q.id === id)!,
      level,
      tabla,
      false,
      decisions,
      'ACTIVE'
    );
  const evidence = (id: string) => tabla.find(e => e.id === id);

  return { evidencias: evidences, decisions, estado, motivo: motive, requisito: requirement, evidencia: evidence };
};

section('1. Applicability: n.a. at BÁSICA, base at MEDIA and ALTA, R1 only at ALTA');

{
  const levelsOf = (id: string) =>
    opExp5CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  check('the control declares only MEDIO and ALTO', opExp5CatalogDefinition.levels.join(',') === 'MEDIO,ALTO', opExp5CatalogDefinition.levels.join(','));
  check('the base applies at MEDIO and ALTO', ['op.exp.5.1', 'op.exp.5.2', 'op.exp.5.3', 'op.exp.5.4', 'op.exp.5.5'].every(id => levelsOf(id) === 'MEDIO,ALTO'));
  check('R1 applies only at ALTO', ['op.exp.5.r1.1', 'op.exp.5.r1.2', 'op.exp.5.r1.3'].every(id => levelsOf(id) === 'ALTO'));
  check(
    'the policy says the same as the catalog for each requirement',
    opExp5PolicyDefinition.requirements.every(r => r.levels.join(',') === levelsOf(r.requirementId))
  );

  const alerts = [heartbeat(), software(ago(5)), ...record([])];
  const low = evaluate(alerts, BASE, 'BAJO');

  check('at BAJO the policy decides no requirement', low.decisions.length === 0, low.decisions.length);

  const requirements = evaluateRequirements(opExp5CatalogDefinition.requirements, 'BAJO', low.evidencias, false, low.decisions, 'ACTIVE');
  const control = evaluateControlStatus(requirements);

  check('at BAJO the eight requirements come out NO_APLICA', requirements.every(r => r.status === 'NO_APLICA'), requirements.map(r => r.status).join(','));
  check('at BAJO the control comes out NO_APLICA, not red', control.status === 'NO_APLICA', control.status);
  check('at BAJO without score: outside the average', control.score === undefined, String(control.score));
  check('at BAJO no requirement enters the denominator', control.applicableRequirements === 0, String(control.applicableRequirements));

  const alto = evaluate(alerts, BASE, 'ALTO');
  const reqAlto = evaluateRequirements(opExp5CatalogDefinition.requirements, 'ALTO', alto.evidencias, false, alto.decisions, 'ACTIVE');
  check('REVERSAL: the SAME events at ALTO do accuse (op.exp.5.1 NO_CUMPLE)', reqAlto.find(r => r.id === 'op.exp.5.1')?.status === 'NO_CUMPLE', reqAlto.find(r => r.id === 'op.exp.5.1')?.status);
  check('and at ALTO the control enters the denominator', evaluateControlStatus(reqAlto).applicableRequirements === 8, String(evaluateControlStatus(reqAlto).applicableRequirements));

  const medio = evaluate(alerts, BASE, 'MEDIO');
  const reqMedio = evaluateRequirements(opExp5CatalogDefinition.requirements, 'MEDIO', medio.evidencias, false, medio.decisions, 'ACTIVE');
  check('at MEDIO the three of R1 come out NO_APLICA and the base applies', reqMedio.filter(r => r.status === 'NO_APLICA').map(r => r.id).join(',') === 'op.exp.5.r1.1,op.exp.5.r1.2,op.exp.5.r1.3', reqMedio.map(r => `${r.id}:${r.status}`).join(' '));
}

section('2. EV-02 · each real change needs an approved request whose window covers it');

{
  const change = software(ago(5), ago(4.9));
  const covered2 = evaluate([heartbeat(), change, ...record([request({})])]);
  check('change within the window of approved RFC-1 → CUMPLE', covered2.estado('EV-02') === 'CUMPLE', covered2.motivo('EV-02'));
  check('and the motive names the request and says the source is the TSV record', /RFC-1/.test(covered2.motivo('EV-02')) && /registro TSV/.test(covered2.motivo('EV-02')), covered2.motivo('EV-02'));
  check('op.exp.5.1 comes out measured CUMPLE', covered2.requisito('op.exp.5.1').status === 'CUMPLE', covered2.requisito('op.exp.5.1').status);

  const withoutRow = evaluate([heartbeat(), change, ...record([])]);
  check('REVERSAL: the SAME change with the empty record → NO_CUMPLE', withoutRow.estado('EV-02') === 'NO_CUMPLE', withoutRow.motivo('EV-02'));
  check('and the motive names the change', /software .* unattended-upgrades/.test(withoutRow.motivo('EV-02')), withoutRow.motivo('EV-02'));

  const notApproved = evaluate([heartbeat(), change, ...record([request({ estado: 'registrada' })])]);
  check('a merely registered request does not authorize → NO_CUMPLE', notApproved.estado('EV-02') === 'NO_CUMPLE', notApproved.motivo('EV-02'));

  const exPost = evaluate([heartbeat(), change, ...record([request({ fecha_aprobacion: ago(2) })])]);
  check('a request approved AFTER the change does not cover it (ex-post ratification) → NO_CUMPLE', exPost.estado('EV-02') === 'NO_CUMPLE', exPost.motivo('EV-02'));

  const otherMachine = evaluate([heartbeat(), change, ...record([request({ sistema: 'zimbraHldap' })])]);
  check('a request from ANOTHER machine does not cover → NO_CUMPLE', otherMachine.estado('EV-02') === 'NO_CUMPLE', otherMachine.motivo('EV-02'));

  const outside = evaluate([heartbeat(), software(ago(3)), ...record([request({})])]);
  check('change one hour after the end of the window → NO_CUMPLE', outside.estado('EV-02') === 'NO_CUMPLE', outside.motivo('EV-02'));

  const withoutHeartbeat = evaluate([change, ...record([request({})])]);
  check('changes covered but without a heartbeat confirming detection → NO_EVALUABLE', withoutHeartbeat.estado('EV-02') === 'NO_EVALUABLE', withoutHeartbeat.motivo('EV-02'));

  const dpkg = evaluate([heartbeat(), change, editedConfiguration(ago(5), '/usr/bin/dpkg'), ...record([request({})])]);
  check('dpkg\'s configuration write counts inside its transaction, not separately', dpkg.estado('EV-02') === 'CUMPLE', dpkg.motivo('EV-02'));

  const portOverlaps = evaluate([heartbeat(), port(ago(4.5), ago(3.5)), ...record([request({})])]);
  check('a port detected between two passes overlapping the window → covered', portOverlaps.estado('EV-02') === 'CUMPLE', portOverlaps.motivo('EV-02'));
  const portOutside = evaluate([heartbeat(), port(ago(3), ago(2)), ...record([request({})])]);
  check('REVERSAL: the same port detected after the window → NO_CUMPLE', portOutside.estado('EV-02') === 'NO_CUMPLE', portOutside.motivo('EV-02'));

  const dateOnly = evaluate([heartbeat(), software(ago(5)), ...record([request({ ventana_inicio: '2026-09-26', ventana_fin: '2026-09-26' })])]);
  check('a window written with a date only includes the whole day', dateOnly.estado('EV-02') === 'CUMPLE', dateOnly.motivo('EV-02'));
}

section('3. EV-02 · without changes, without a record, or another management system in P-01');

{
  const calm = evaluate([heartbeat(), ...record([])]);
  check('no change, detection confirmed and record read → CUMPLE', calm.estado('EV-02') === 'CUMPLE', calm.motivo('EV-02'));

  const withoutHeartbeat = evaluate([...record([])]);
  check('REVERSAL: without a heartbeat silence accredits nothing → NO_EVALUABLE', withoutHeartbeat.estado('EV-02') === 'NO_EVALUABLE', withoutHeartbeat.motivo('EV-02'));

  const withoutRecord = evaluate([
    heartbeat(),
    alert({ event: 'evidence_state', evidence_id: 'EV-02', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe /etc/power-ens/change-register.tsv' }),
  ]);
  check('absent record → NO_EVALUABLE with the collector\'s motive', withoutRecord.estado('EV-02') === 'NO_EVALUABLE' && /change-register\.tsv/.test(withoutRecord.motivo('EV-02')), withoutRecord.motivo('EV-02'));

  const jira = evaluate([heartbeat(), ...record([])], withIt({ 'P-01': ['jira | https://jira.invalido | CHG-'] }));
  check('P-01 declares Jira without integration → NO_EVALUABLE, the TSV is not judged', jira.estado('EV-02') === 'NO_EVALUABLE' && /integración/.test(jira.motivo('EV-02')), jira.motivo('EV-02'));

  const withoutP01 = evaluate([heartbeat(), ...record([])], withIt({ 'P-01': undefined }));
  check('sin P-01 → NO_EVALUABLE', withoutP01.estado('EV-02') === 'NO_EVALUABLE', withoutP01.motivo('EV-02'));

  const incomplete = evaluate([heartbeat(), ...record([request({})], { filas: 3 })]);
  check('the header declares 3 requests and 1 arrives → NO_EVALUABLE', incomplete.estado('EV-02') === 'NO_EVALUABLE', incomplete.motivo('EV-02'));

  const old = evaluate([heartbeat(), ...record([], {}, ago(30))]);
  check('record read from 30 h ago → NO_EVALUABLE', old.estado('EV-02') === 'NO_EVALUABLE', old.motivo('EV-02'));
}

section('4. EV-03 · minimum information from P-02, and at ALTO the impact assessment');

{
  const complete = [heartbeat(), ...record([request({})])];
  check('request with P-02\'s fields → CUMPLE', evaluate(complete, BASE, 'MEDIO').estado('EV-03') === 'CUMPLE', evaluate(complete, BASE, 'MEDIO').motivo('EV-03'));

  const withoutDescription = [heartbeat(), ...record([request({ descripcion: '-' })])];
  check('REVERSAL: without description → NO_CUMPLE', evaluate(withoutDescription, BASE, 'MEDIO').estado('EV-03') === 'NO_CUMPLE', evaluate(withoutDescription, BASE, 'MEDIO').motivo('EV-03'));

  const withoutImpact = [heartbeat(), ...record([request({ impacto_seguridad: '-' })])];
  check('without impacto_seguridad at MEDIO → CUMPLE (P-02 does not ask for it)', evaluate(withoutImpact, BASE, 'MEDIO').estado('EV-03') === 'CUMPLE', evaluate(withoutImpact, BASE, 'MEDIO').motivo('EV-03'));
  const alto = evaluate(withoutImpact, BASE, 'ALTO');
  check('the SAME record at ALTO → NO_CUMPLE by op.exp.5.r1.3', alto.estado('EV-03') === 'NO_CUMPLE' && /impacto_seguridad/.test(alto.motivo('EV-03')), alto.motivo('EV-03'));
  check('and op.exp.5.r1.3 comes out NO_CUMPLE', alto.requisito('op.exp.5.r1.3').status === 'NO_CUMPLE', alto.requisito('op.exp.5.r1.3').status);

  const numero = [heartbeat(), ...record([request({ peticion_id: 'CAMBIO-7' })])];
  check('number outside P-01\'s «RFC-» prefix → NO_CUMPLE', evaluate(numero, BASE, 'MEDIO').estado('EV-03') === 'NO_CUMPLE', evaluate(numero, BASE, 'MEDIO').motivo('EV-03'));

  const unreadable = [heartbeat(), ...record([request({})], { filas_ilegibles: 1 })];
  check('a row that lacks the 14 columns → NO_CUMPLE', evaluate(unreadable, BASE, 'MEDIO').estado('EV-03') === 'NO_CUMPLE', evaluate(unreadable, BASE, 'MEDIO').motivo('EV-03'));

  const oddField = evaluate(complete, withIt({ 'P-02': ['descripcion', 'solicitante'] }), 'MEDIO');
  check('P-02 names a column the record lacks → NO_EVALUABLE', oddField.estado('EV-03') === 'NO_EVALUABLE', oddField.motivo('EV-03'));
}

section('5. EV-04 · high risk: approved by the RSI and BEFORE deployment');

{
  const change = software(ago(5));
  const good = evaluate([heartbeat(), change, ...record([request({ riesgo: 'alto', fecha_aprobacion: ago(24) })])]);
  check('approved by rsi one day before → CUMPLE', good.estado('EV-04') === 'CUMPLE', good.motivo('EV-04'));

  const late = evaluate([heartbeat(), change, ...record([request({ riesgo: 'alto', fecha_aprobacion: ago(4.5) })])]);
  check('REVERSAL: approved after the real change → NO_CUMPLE', late.estado('EV-04') === 'NO_CUMPLE' && /DESPUÉS/.test(late.motivo('EV-04')), late.motivo('EV-04'));

  const another = evaluate([heartbeat(), change, ...record([request({ riesgo: 'alto', aprobado_por: 'jgomez' })])]);
  check('approved by another account → NO_CUMPLE', another.estado('EV-04') === 'NO_CUMPLE' && /jgomez/.test(another.motivo('EV-04')), another.motivo('EV-04'));

  const lowRisk = evaluate([heartbeat(), change, ...record([request({ aprobado_por: 'jgomez' })])]);
  check('the same approver on a low-risk change is not an EV-04 finding', lowRisk.estado('EV-04') === 'CUMPLE', lowRisk.motivo('EV-04'));

  const withoutP03 = evaluate([heartbeat(), change, ...record([request({ riesgo: 'alto' })])], withIt({ 'P-03': undefined }));
  check('without high-risk criteria (P-03) → NO_EVALUABLE', withoutP03.estado('EV-04') === 'NO_EVALUABLE', withoutP03.motivo('EV-04'));

  const withoutRequest = evaluate([heartbeat(), change, ...record([])]);
  check('a change without a request leaves EV-04 unproven (its risk was not analyzed)', withoutRequest.estado('EV-04') === 'NO_EVALUABLE', withoutRequest.motivo('EV-04'));
}

section('6. EV-06 · P-06 documentation is modified after the change and on time');

{
  const askFor = request({ documentacion: 'inventario', ventana_inicio: ago(24 * 10), ventana_fin: ago(24 * 9) });
  const done = evaluate([heartbeat(), document('/srv/doc/inventario.ods', ago(24 * 8)), ...record([askFor])]);
  check('inventory modified one day after the change, deadline 7 → CUMPLE', done.estado('EV-06') === 'CUMPLE', done.motivo('EV-06'));

  const old3 = evaluate([heartbeat(), document('/srv/doc/inventario.ods', ago(24 * 20)), ...record([askFor])]);
  check('REVERSAL: last modification BEFORE the change and deadline expired → NO_CUMPLE', old3.estado('EV-06') === 'NO_CUMPLE', old3.motivo('EV-06'));

  const recent = request({ documentacion: 'inventario', ventana_inicio: ago(30), ventana_fin: ago(26) });
  const onTime = evaluate([heartbeat(), document('/srv/doc/inventario.ods', ago(24 * 20)), ...record([recent])]);
  check('unmodified but with the deadline open → not a finding yet', onTime.estado('EV-06') === 'CUMPLE' && /plazo/.test(onTime.motivo('EV-06')), onTime.motivo('EV-06'));

  const unwatched = evaluate([heartbeat(), ...record([askFor])]);
  check('document the collector does not watch → NO_EVALUABLE', unwatched.estado('EV-06') === 'NO_EVALUABLE', unwatched.motivo('EV-06'));

  const withoutP06 = evaluate([heartbeat(), ...record([askFor])], withIt({ 'P-06': undefined }));
  check('sin P-06 → NO_EVALUABLE', withoutP06.estado('EV-06') === 'NO_EVALUABLE', withoutP06.motivo('EV-06'));
}

section('7. EV-07 · a service that goes down after a change and stays down');

{
  const change = software(ago(5), ago(4.9));
  const adverse = evaluate([heartbeat(), change, down('nginx.service', ago(3)), ...record([request({})])]);
  check('nginx goes down 2 h after a change and stays down → NO_CUMPLE', adverse.estado('EV-07') === 'NO_CUMPLE', adverse.motivo('EV-07'));

  const corta = evaluate([heartbeat(), change, down('nginx.service', ago(3)), ...record([request({})])], withIt({ 'P-09': '1' }));
  check('REVERSAL: with a 1 h stability window it is not attributed to the change → CUMPLE', corta.estado('EV-07') === 'CUMPLE', corta.motivo('EV-07'));

  const reverted = evaluate([heartbeat(), change, down('nginx.service', ago(3)), ...record([request({ estado: 'revertida' })])]);
  check('the change is recorded as reverted in the record → CUMPLE', reverted.estado('EV-07') === 'CUMPLE', reverted.motivo('EV-07'));

  const recovered = evaluate([
    heartbeat('EV-01,EV-07', ago(2)),
    down('nginx.service', ago(3), ago(2)),
    heartbeat('EV-01,EV-07', ago(1)),
    change,
    ...record([request({})]),
  ]);
  check('down in the previous pass and up in the last → CUMPLE', recovered.estado('EV-07') === 'CUMPLE', recovered.motivo('EV-07'));

  const withoutP09 = evaluate([heartbeat(), change, ...record([request({})])], withIt({ 'P-09': undefined }));
  check('sin P-09 → NO_EVALUABLE', withoutP09.estado('EV-07') === 'NO_EVALUABLE', withoutP09.motivo('EV-07'));
}

section('8. EV-09 · rollback point BEFORE the change (op.exp.4\'s logic)');

{
  const change = software(ago(5));
  const withDot = evaluate([heartbeat(), change, snapshot(ago(6)), ...record([request({})])]);
  check('LVM snapshot 1 h before the change → CUMPLE', withDot.estado('EV-09') === 'CUMPLE', withDot.motivo('EV-09'));

  const after = evaluate([heartbeat(), change, snapshot(ago(4)), ...record([request({})])]);
  check('REVERSAL: snapshot AFTER the change → NO_CUMPLE', after.estado('EV-09') === 'NO_CUMPLE', after.motivo('EV-09'));

  const withoutLvm = evaluate([
    heartbeat(),
    change,
    alert({ event: 'evidence_state', evidence_id: 'EV-09', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'la maquina no tiene ningun mecanismo de reversion local observable' }),
    ...record([request({})]),
  ]);
  check('machine without an observable local mechanism → NO_EVALUABLE with the motive', withoutLvm.estado('EV-09') === 'NO_EVALUABLE' && /mecanismo/.test(withoutLvm.motivo('EV-09')), withoutLvm.motivo('EV-09'));

  const hypervisor = evaluate([heartbeat(), change, ...record([request({})])], withIt({ 'P-08': ['* | hipervisor | snapshot de Proxmox | 24'] }));
  check('P-08 declares hypervisor → NO_EVALUABLE, it is not simulated', hypervisor.estado('EV-09') === 'NO_EVALUABLE', hypervisor.motivo('EV-09'));

  const calm = evaluate([heartbeat(), ...record([])]);
  check('no change with detection confirmed → CUMPLE (negative assertion)', calm.estado('EV-09') === 'CUMPLE', calm.motivo('EV-09'));
}

section('9. EV-05 and EV-08 · without a real source: always NO_EVALUABLE, never CUMPLE');

{
  const all = evaluate([heartbeat(), ...record([request({ preproduccion: 'prueba en pre-real 2026-09-20' })])]);
  check('EV-05 with P-05 and the pre-production declared in the record → NO_EVALUABLE', all.estado('EV-05') === 'NO_EVALUABLE', all.motivo('EV-05'));
  check('EV-08 without any failure → NO_EVALUABLE (communication is not observed)', all.estado('EV-08') === 'NO_EVALUABLE', all.motivo('EV-08'));
  check('op.exp.5.3 does not come out CUMPLE', all.requisito('op.exp.5.3').status !== 'CUMPLE', all.requisito('op.exp.5.3').status);
  check('op.exp.5.r1.2 does not come out CUMPLE', all.requisito('op.exp.5.r1.2').status !== 'CUMPLE', all.requisito('op.exp.5.r1.2').status);

  const otherControl = evaluate([
    heartbeat(),
    ...record([]),
    {
      _id: 'ajeno',
      _source: {
        '@timestamp': ago(1),
        agent: { id: '024', name: 'wazuh-real' },
        rule: { id: '110505', description: 'op.exp.4' },
        location: '/var/log/power-ens/op_exp_4.json',
        data: { power_ens: 'op.exp.4', event: 'package_changed', actor: 'root', inicio: ago(5), fin: ago(5) },
      },
    },
  ]);
  check('an op.exp.4 package_changed does not count as an op.exp.5 change', otherControl.estado('EV-02') === 'CUMPLE', otherControl.motivo('EV-02'));
}

section('10. The cause of what could not be measured reaches the evidence');

{
  const withoutP05 = evaluate([heartbeat(), ...record([])], withIt({ 'P-05': undefined }));
  check(
    'without P-05 → EV-05 NO_EVALUABLE with cause CONFIGURATION, not COLLECTION',
    withoutP05.evidencia('EV-05')?.status === 'NO_EVALUABLE' && withoutP05.evidencia('EV-05')?.gapCause === 'CONFIGURATION',
    `${withoutP05.evidencia('EV-05')?.status} ${withoutP05.evidencia('EV-05')?.gapCause}`
  );

  const withP05 = evaluate([heartbeat(), ...record([])]);
  check(
    'REVERSAL: with P-05 declared, EV-05 is still unmeasured but no longer for configuration (EVIDENCE)',
    withP05.evidencia('EV-05')?.status === 'NO_EVALUABLE' && withP05.evidencia('EV-05')?.gapCause === 'EVIDENCE',
    `${withP05.evidencia('EV-05')?.status} ${withP05.evidencia('EV-05')?.gapCause}`
  );

  const withoutRecord = evaluate([
    heartbeat(),
    alert({ event: 'evidence_state', evidence_id: 'EV-02', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe /etc/power-ens/change-register.tsv' }),
  ]);
  check(
    'absent record (collector\'s CONFIGURATION) → EV-03 carries that cause, not COLLECTION',
    withoutRecord.evidencia('EV-03')?.status === 'NO_EVALUABLE' && withoutRecord.evidencia('EV-03')?.gapCause === 'CONFIGURATION',
    `${withoutRecord.evidencia('EV-03')?.status} ${withoutRecord.evidencia('EV-03')?.gapCause}`
  );

  const notLoaded = evaluate([
    software(ago(3)),
    alert({ event: 'evidence_state', evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'reglas de auditd escritas y no cargadas' }, ago(4)),
    ...record([]),
  ]);
  check(
    'the cause the collector declares (CONFIGURATION) reaches EV-01',
    notLoaded.evidencia('EV-01')?.status === 'NO_EVALUABLE' && notLoaded.evidencia('EV-01')?.gapCause === 'CONFIGURATION',
    `${notLoaded.evidencia('EV-01')?.status} ${notLoaded.evidencia('EV-01')?.gapCause}`
  );
  const silence = evaluate([
    alert({ event: 'evidence_state', evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'reglas de auditd escritas y no cargadas' }),
    ...record([]),
  ]);
  check(
    'and the silence of EV-09 resting on EV-01 inherits that cause (CONFIGURATION)',
    silence.evidencia('EV-09')?.status === 'NO_EVALUABLE' && silence.evidencia('EV-09')?.gapCause === 'CONFIGURATION',
    `${silence.evidencia('EV-09')?.status} ${silence.evidencia('EV-09')?.gapCause}`
  );

  const old = evaluate([heartbeat(), ...record([], {}, ago(30))]);
  check(
    'expired record read → EV-02 with cause COLLECTION',
    old.evidencia('EV-02')?.status === 'NO_EVALUABLE' && old.evidencia('EV-02')?.gapCause === 'COLLECTION',
    `${old.evidencia('EV-02')?.status} ${old.evidencia('EV-02')?.gapCause}`
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
