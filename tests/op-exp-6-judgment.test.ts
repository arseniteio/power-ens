/** op.exp.6: judgment of protection against malicious code. */
import { opExp6PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-6.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp6CatalogDefinition } from '../common/ens/catalog/op-exp-6';
import { opExp6Configuration } from '../common/ens/configuration/data/op-exp-6-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
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

const NOW = new Date('2026-09-26T19:00:00Z');
const ago = (horas: number): string =>
  new Date(NOW.getTime() - horas * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let counter = 0;

const alert = (data: Record<string, unknown>, ts = ago(1)) => {
  counter += 1;

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: { id: '024', name: 'wazuh-real' },
      rule: { id: '110700', description: 'op.exp.6' },
      location: '/var/log/ensfacil/op_exp_6.json',
      data: Object.fromEntries(
        Object.entries({ ensfacil: 'op.exp.6', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

const events = (...alerts: ReturnType<typeof alert>[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alerts);

const configuration = (valores: Record<string, string[] | string>): ENSControlConfiguration => ({
  ...opExp6Configuration,
  parameters: opExp6Configuration.parameters.map(p => ({
    ...p,
    value: valores[p.id] as never,
  })),
});

const evaluate = (
  evs: ENSNormalizedEvent[],
  valores: Record<string, string[] | string>,
  level: ENSLevel = 'ALTO',
  now: Date = NOW
) => {
  const cfg = configuration(valores);
  const evidences = resolveEvidenceForControl('op.exp.6', evs, '024', level, cfg, now);
  const context = buildPolicyContext(opExp6CatalogDefinition, cfg, level, evs, evidences, now);
  const { decisions } = opExp6PolicyDefinition.evaluator!(context);
  const principal = (requirement: string) => decisions.find(d => d.requirementId === requirement)!;
  const ofEvidence = (id: string) => decisions.find(d => d.trace.ruleId.endsWith(`/${id}`));
  const evidence = (id: string) => evidences.find(e => e.id === id)!;
  const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, opExp6CatalogDefinition.requirements);
  const color = (id: string) => tabla.find(e => e.id === id)?.status;
  const requirement = (id: string) =>
    evaluateRequirement(
      opExp6CatalogDefinition.requirements.find(q => q.id === id)!,
      level,
      evidences,
      false,
      decisions,
      'ACTIVE'
    );

  return { evidencias: evidences, decisions, principal, deEvidencia: ofEvidence, evidencia: evidence, color, requisito: requirement };
};

const WITHOUT_ANTIMALWARE = () => [
  alert({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'sistema', equipo: 'wazuh-real', producto: 'ninguno', instalado: 'no', servicio: '-', servicio_activo: 'no', producto_activo: 'ninguno' }),
  alert({ event: 'antimalware_setting', evidence_id: 'EV-03', plano: 'sistema', equipo: 'wazuh-real', ajuste: 'proteccion_tiempo_real', valor: 'no' }),
  alert({ event: 'antimalware_setting', evidence_id: 'EV-03', plano: 'sistema', equipo: 'wazuh-real', ajuste: 'actualizacion_automatica_firmas', valor: 'no' }),
  alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-04,EV-07,EV-12', equipo: 'wazuh-real' }),
];

const WITH_CLAMAV = (signaturesAgo = 10) => [
  alert({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'sistema', equipo: 'wazuh-real', producto: 'clamav', instalado: 'si', servicio: 'clamav-daemon.service', servicio_activo: 'si', producto_activo: 'clamav' }),
  alert({ event: 'antimalware_setting', evidence_id: 'EV-03', plano: 'sistema', equipo: 'wazuh-real', ajuste: 'proteccion_tiempo_real', valor: 'si' }),
  alert({ event: 'antimalware_setting', evidence_id: 'EV-03', plano: 'sistema', equipo: 'wazuh-real', ajuste: 'actualizacion_automatica_firmas', valor: 'si' }),
  alert({ event: 'antimalware_signatures_updated', evidence_id: 'EV-02', plano: 'sistema', equipo: 'wazuh-real', producto: 'clamav', fecha: ago(signaturesAgo), version: '27772' }),
  alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-04,EV-05,EV-07,EV-12', equipo: 'wazuh-real' }),
];

const P02 = ['wazuh-real | sistema | servidor | clamav'];
const P04 = ['sistema | proteccion_tiempo_real | si', 'sistema | actualizacion_automatica_firmas | si'];

section('1. Applicability: cumulative reinforcements, R5 outside the denominator');

{
  const levelsOf = (id: string) =>
    opExp6CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  check('the base applies at the three', ['op.exp.6.1', 'op.exp.6.2', 'op.exp.6.3', 'op.exp.6.4', 'op.exp.6.5'].every(id => levelsOf(id) === 'BAJO,MEDIO,ALTO'));
  check('R1 and R2 apply at MEDIO and ALTO', levelsOf('op.exp.6.r1.1') === 'MEDIO,ALTO' && levelsOf('op.exp.6.r2.1') === 'MEDIO,ALTO');
  check('R3 and R4 apply only at ALTO', levelsOf('op.exp.6.r3.1') === 'ALTO' && levelsOf('op.exp.6.r4.1') === 'ALTO');
  check('R5 applies at no level', levelsOf('op.exp.6.r5.1') === '' && levelsOf('op.exp.6.r5.2') === '');
  check('the control is ACTIVE', opExp6CatalogDefinition.status === 'ACTIVE', opExp6CatalogDefinition.status);

  const tablas = opExp6Configuration.parameters.filter(p => ['P-02', 'P-04', 'P-09'].includes(p.id));
  check('P-02, P-04 and P-09 are tables with columns', tablas.length === 3 && tablas.every(p => p.type === 'table' && (p.columns || []).length >= 3));
  check('no parameter carries `value` in the definition', opExp6Configuration.parameters.every(p => !('value' in p)));
  check('P-ATT is optional', opExp6Configuration.parameters.find(p => p.id === 'P-ATT')!.required === false);
}

section('2. EV-01 · the running antimalware against P-02');

{
  const sin = evaluate(events(...WITHOUT_ANTIMALWARE()), { 'P-02': P02 });
  check('without antimalware and P-02 expects clamav → measured NO_CUMPLE', sin.evidencia('EV-01').status === 'NO_CUMPLE', sin.evidencia('EV-01').observations.join(' '));
  check('op.exp.6.2 comes out measured NO_CUMPLE', sin.requisito('op.exp.6.2').status === 'NO_CUMPLE' && sin.requisito('op.exp.6.2').evidenced === true, `${sin.requisito('op.exp.6.2').status}`);

  const con = evaluate(events(...WITH_CLAMAV()), { 'P-02': P02 });
  check('REVERSAL: clamav running → CUMPLE', con.evidencia('EV-01').status === 'CUMPLE', con.evidencia('EV-01').observations.join(' '));

  const parado = evaluate(events(alert({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'sistema', equipo: 'wazuh-real', producto: 'clamav', instalado: 'si', servicio_activo: 'no', producto_activo: 'ninguno' })), { 'P-02': P02 });
  check('clamav installed and STOPPED → NO_CUMPLE (it does not protect)', parado.evidencia('EV-01').status === 'NO_CUMPLE');

  const withoutP02 = evaluate(events(...WITHOUT_ANTIMALWARE()), {});
  check('without P-02 → NO_EVALUABLE, never CUMPLE', withoutP02.evidencia('EV-01').status === 'NO_EVALUABLE');

  const mail = evaluate(events(...WITH_CLAMAV(), alert({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'correo', equipo: 'wazuh-real', producto: 'clamav-zimbra', instalado: 'si', servicio_activo: 'si', producto_activo: 'clamav-zimbra' })), { 'P-02': P02 });
  check('a mail plane observed without a row in P-02 → NO_EVALUABLE (unwritten decision)', mail.evidencia('EV-01').status === 'NO_EVALUABLE', mail.evidencia('EV-01').observations.join(' '));
  const mail2 = evaluate(events(...WITH_CLAMAV(), alert({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'correo', equipo: 'wazuh-real', producto: 'clamav-zimbra', instalado: 'si', servicio_activo: 'si', producto_activo: 'clamav-zimbra' })), { 'P-02': [...P02, 'wazuh-real | correo | servidor | clamav-zimbra'] });
  check('REVERSAL: with the mail plane row → CUMPLE', mail2.evidencia('EV-01').status === 'CUMPLE');
}

section('3. EV-02 · each plane\'s signatures against P-03');

{
  const sin = evaluate(events(...WITHOUT_ANTIMALWARE()), { 'P-02': P02, 'P-03': '48' });
  check('without antimalware → measured NO_CUMPLE, not NO_EVALUABLE', sin.deEvidencia('EV-02')?.status === 'NO_CUMPLE', sin.deEvidencia('EV-02')?.reason);
  check('and the evidence table paints it so', sin.color('EV-02') === 'NO_CUMPLE', sin.color('EV-02'));

  const up_to_date = evaluate(events(...WITH_CLAMAV(10)), { 'P-02': P02, 'P-03': '48' });
  check('signatures from 10 h ago with P-03=48 → CUMPLE', up_to_date.deEvidencia('EV-02')?.status === 'CUMPLE', up_to_date.deEvidencia('EV-02')?.reason);
  const strict = evaluate(events(...WITH_CLAMAV(10)), { 'P-02': P02, 'P-03': '6' });
  check('REVERSAL: the SAME fact with P-03=6 → NO_CUMPLE', strict.deEvidencia('EV-02')?.status === 'NO_CUMPLE', strict.deEvidencia('EV-02')?.reason);
  const late = evaluate(events(...WITH_CLAMAV(10)), { 'P-02': P02, 'P-03': '48' }, 'ALTO', new Date(NOW.getTime() + 3 * 86400000));
  check('the same fact three days later ages by itself → NO_CUMPLE', late.deEvidencia('EV-02')?.status === 'NO_CUMPLE');
  const withoutP03 = evaluate(events(...WITH_CLAMAV(10)), { 'P-02': P02 });
  check('sin P-03 → NO_EVALUABLE', withoutP03.deEvidencia('EV-02')?.status === 'NO_EVALUABLE');

  const dos = evaluate(events(
    ...WITH_CLAMAV(10),
    alert({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'correo', equipo: 'wazuh-real', producto: 'clamav-zimbra', instalado: 'si', servicio_activo: 'si', producto_activo: 'clamav-zimbra' }),
    alert({ event: 'antimalware_signatures_updated', evidence_id: 'EV-02', plano: 'correo', producto: 'clamav-zimbra', fecha: ago(24 * 20) }),
  ), { 'P-02': P02, 'P-03': '48' });
  check('an up-to-date plane does NOT cover the other, expired one → NO_CUMPLE', dos.deEvidencia('EV-02')?.status === 'NO_CUMPLE', dos.deEvidencia('EV-02')?.reason);
}

section('4. EV-03 · settings against P-04');

{
  const sin = evaluate(events(...WITHOUT_ANTIMALWARE()), { 'P-04': P04 });
  check('without real-time protection and P-04 requires it → NO_CUMPLE', sin.evidencia('EV-03').status === 'NO_CUMPLE', sin.evidencia('EV-03').observations.join(' '));
  const con = evaluate(events(...WITH_CLAMAV()), { 'P-04': P04 });
  check('REVERSAL: clamonacc and freshclam running → CUMPLE', con.evidencia('EV-03').status === 'CUMPLE', con.evidencia('EV-03').observations.join(' '));
}

section('5. EV-04 · detections and their resolution');

{
  const sin = evaluate(events(...WITHOUT_ANTIMALWARE()), { 'P-02': P02 });
  check('without antimalware → NO_CUMPLE (no reaction mechanism)', sin.deEvidencia('EV-04')?.status === 'NO_CUMPLE', sin.deEvidencia('EV-04')?.reason);

  const clean = evaluate(events(...WITH_CLAMAV()), { 'P-02': P02 });
  check('clamav, logs read and no detection → CUMPLE', clean.deEvidencia('EV-04')?.status === 'CUMPLE', clean.deEvidencia('EV-04')?.reason);

  const withoutHeartbeat = evaluate(events(...WITH_CLAMAV().slice(0, 4)), { 'P-02': P02 });
  check('REVERSAL: without a heartbeat declaring the logs read → NO_EVALUABLE', withoutHeartbeat.deEvidencia('EV-04')?.status === 'NO_EVALUABLE', withoutHeartbeat.deEvidencia('EV-04')?.reason);

  const unremediated = evaluate(events(...WITH_CLAMAV(), alert({ event: 'malware_detected', evidence_id: 'EV-04', fichero: '/tmp/eicar.com', amenaza: 'Eicar-Signature', accion: 'sin_accion', fecha: ago(3) })), { 'P-02': P02 });
  check('a detection without action → NO_CUMPLE', unremediated.deEvidencia('EV-04')?.status === 'NO_CUMPLE', unremediated.deEvidencia('EV-04')?.reason);

  const quarantine = evaluate(events(...WITH_CLAMAV(), alert({ event: 'malware_detected', evidence_id: 'EV-04', fichero: '/tmp/eicar.com', amenaza: 'Eicar-Signature', accion: 'cuarentena', fecha: ago(3) })), { 'P-02': P02 });
  check('REVERSAL: the same detection in quarantine → CUMPLE', quarantine.deEvidencia('EV-04')?.status === 'CUMPLE', quarantine.deEvidencia('EV-04')?.reason);

  const duplicate = evaluate(events(...WITH_CLAMAV(),
    alert({ event: 'malware_detected', evidence_id: 'EV-04', fichero: '/srv/x.php', amenaza: 'Php.Webshell', accion: 'cuarentena', fecha: ago(30) }),
    alert({ event: 'malware_detected', evidence_id: 'EV-04', fichero: '/srv/x.php', amenaza: 'Php.Webshell', accion: 'cuarentena', fecha: ago(3) })), { 'P-02': P02 });
  check('the same threat twice in the same file → NO_CUMPLE (persistent)', duplicate.deEvidencia('EV-04')?.status === 'NO_CUMPLE', duplicate.deEvidencia('EV-04')?.reason);

  const det = (extra: Record<string, unknown>) =>
    alert({ event: 'malware_detected', evidence_id: 'EV-04', plano: 'sistema', fichero: '/var/tmp/eicar.txt', amenaza: 'Eicar-Test-Signature', ...extra });
  const eicar = [
    det({ accion: 'sin_accion', fecha: ago(10), origen_dato: '/var/log/clamav/clamav.log' }),
    det({ accion: 'sin_accion', fecha: ago(10), origen_dato: '/var/log/clamav/clamav.log' }),
    det({ accion: 'cuarentena', fecha: ago(9), origen_dato: '/var/log/clamav/clamonacc.log' }),
    det({ accion: 'cuarentena', instante: 'sin_hora', origen_dato: '/var/log/clamav/clamonacc.log' }),
  ];
  const juntas = evaluate(events(...WITH_CLAMAV(), ...eicar), { 'P-02': P02 });
  check('the same detection noted 4 times (two equal, clamonacc without time and with the read time) → one, not persistent', juntas.deEvidencia('EV-04')?.status === 'CUMPLE' && /4 anotaciones/.test(juntas.deEvidencia('EV-04')?.reason || ''), juntas.deEvidencia('EV-04')?.reason);

  const togetherWithoutAction = evaluate(events(...WITH_CLAMAV(), ...eicar.slice(0, 2), det({ accion: 'sin_accion', fecha: ago(9), origen_dato: '/var/log/clamav/clamonacc.log' })), { 'P-02': P02 });
  const r = togetherWithoutAction.deEvidencia('EV-04')?.reason || '';
  check('REVERSAL: the same detection unremediated → NO_CUMPLE for unremediated, not for persistent', togetherWithoutAction.deEvidencia('EV-04')?.status === 'NO_CUMPLE' && /sin remediar/.test(r) && !/persistente/.test(r), r);

  const soloSinHora = evaluate(events(...WITH_CLAMAV(),
    det({ fichero: '/home/x.bin', accion: 'sin_accion', instante: 'sin_hora', origen_dato: '/var/log/clamav/clamonacc.log' })), { 'P-02': P02 });
  check('a detection without time and without clamd → still an unremediated detection', soloSinHora.deEvidencia('EV-04')?.status === 'NO_CUMPLE' && /sin hora/.test(soloSinHora.deEvidencia('EV-04')?.reason || ''), soloSinHora.deEvidencia('EV-04')?.reason);

  const dosInstantes = evaluate(events(...WITH_CLAMAV(),
    det({ accion: 'cuarentena', fecha: ago(30), instante: 'log', origen_dato: '/var/log/clamav/clamav.log' }),
    det({ accion: 'cuarentena', fecha: ago(3), instante: 'log', origen_dato: '/var/log/clamav/clamav.log' }),
    det({ accion: 'cuarentena', instante: 'sin_hora', origen_dato: '/var/log/clamav/clamonacc.log' })), { 'P-02': P02 });
  check('REVERSAL: two different timed instants are still persistent (2 times, the untimed one does not add)', dosInstantes.deEvidencia('EV-04')?.status === 'NO_CUMPLE' && /\(2 veces\)/.test(dosInstantes.deEvidencia('EV-04')?.reason || ''), dosInstantes.deEvidencia('EV-04')?.reason);
}

section('6. EV-05 · the full scan against P-06');

{
  const sin = evaluate(events(...WITHOUT_ANTIMALWARE()), { 'P-06': '7' });
  check('without antimalware → NO_CUMPLE', sin.deEvidencia('EV-05')?.status === 'NO_CUMPLE', sin.deEvidencia('EV-05')?.reason);

  const scan = alert({ event: 'full_scan_completed', evidence_id: 'EV-05', fecha: ago(72), ficheros_escaneados: '184233', infectados: '0' });
  const weekly = evaluate(events(...WITH_CLAMAV(), scan), { 'P-06': '7' });
  check('scan from 3 days ago with P-06=7 → CUMPLE', weekly.deEvidencia('EV-05')?.status === 'CUMPLE', weekly.deEvidencia('EV-05')?.reason);
  const daily = evaluate(events(...WITH_CLAMAV(), scan), { 'P-06': '2' });
  check('REVERSAL: the SAME scan with P-06=2 → NO_CUMPLE', daily.deEvidencia('EV-05')?.status === 'NO_CUMPLE');

  const never = evaluate(events(...WITH_CLAMAV()), { 'P-06': '7' });
  check('clamav, record read and no scan → NO_CUMPLE («nunca»)', never.deEvidencia('EV-05')?.status === 'NO_CUMPLE', never.deEvidencia('EV-05')?.reason);

  const withoutRecord = evaluate(events(...WITH_CLAMAV().slice(0, 4),
    alert({ event: 'evidence_state', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe ningun registro de escaneos completos' })), { 'P-06': '7' });
  check('REVERSAL: without a scan record to read → NO_EVALUABLE with the agent\'s motive', withoutRecord.deEvidencia('EV-05')?.status === 'NO_EVALUABLE' && /registro de escaneos/.test(withoutRecord.deEvidencia('EV-05')?.reason || ''), withoutRecord.deEvidencia('EV-05')?.reason);
}

section('7. EV-06 · boot analysis against P-07');

{
  const boot = alert({ event: 'boot_integrity_check', evidence_id: 'EV-06', equipo: 'wazuh-real', arranque_agente: '2026-09-17T10:30:43Z', arranque_sistema: '2026-07-28T22:53:21Z', fim_inicio: '2026-09-17T10:30:43Z', fim_fin: '2026-09-17T10:30:44Z', rutas: '/bin,/boot,/etc,/sbin,/usr/bin,/usr/sbin', rootcheck_avisos: 'sin_rootkit_files,sin_rootkit_trojans' });

  const conModulos = evaluate(events(boot), { 'P-07': ['* | /boot', '* | /usr/bin', '* | /usr/sbin', '* | /lib/modules'] });
  check('P-07 includes /lib/modules and the agent does not watch it → NO_CUMPLE', conModulos.deEvidencia('EV-06')?.status === 'NO_CUMPLE' && /lib\/modules/.test(conModulos.deEvidencia('EV-06')?.reason || ''), conModulos.deEvidencia('EV-06')?.reason);

  const sinModulos = evaluate(events(boot), { 'P-07': ['* | /boot', '* | /usr/bin', '* | /usr/sbin/sshd', '* | /etc/ssh'] });
  check('REVERSAL: paths covered (also by parent directory) → CUMPLE', sinModulos.deEvidencia('EV-06')?.status === 'CUMPLE', sinModulos.deEvidencia('EV-06')?.reason);

  const ofAnother = evaluate(events(boot), { 'P-07': ['* | /boot', 'ldapserver | /opt/zimbra/data/ldap/config'] });
  check('a path declared for ANOTHER machine is not required here → CUMPLE', ofAnother.deEvidencia('EV-06')?.status === 'CUMPLE', ofAnother.deEvidencia('EV-06')?.reason);

  const unfinished = evaluate(events(alert({ event: 'boot_integrity_check', evidence_id: 'EV-06', equipo: 'wazuh-real', arranque_agente: ago(5), fim_inicio: ago(5), fim_fin: 'no', rutas: '/boot' })), { 'P-07': ['* | /boot'] });
  check('boot analysis not finished → NO_CUMPLE', unfinished.deEvidencia('EV-06')?.status === 'NO_CUMPLE', unfinished.deEvidencia('EV-06')?.reason);

  const withoutP07 = evaluate(events(boot), {});
  check('sin P-07 → NO_EVALUABLE', withoutP07.deEvidencia('EV-06')?.status === 'NO_EVALUABLE');
}

section('8. EV-07 · mechanism in enforcement mode AND executions against P-08');

{
  const none = evaluate(events(...WITHOUT_ANTIMALWARE(), alert({ event: 'execution_control_status', evidence_id: 'EV-07', mecanismo: 'ninguno', activo: 'no', modo: '-', confinamiento_apparmor: 'si' })), {});
  check('without a mechanism (AppArmor does not count) → NO_CUMPLE', none.deEvidencia('EV-07')?.status === 'NO_CUMPLE' && /AppArmor/.test(none.deEvidencia('EV-07')?.reason || ''), none.deEvidencia('EV-07')?.reason);

  const applies = alert({ event: 'execution_control_status', evidence_id: 'EV-07', mecanismo: 'fapolicyd', activo: 'si', modo: 'aplicacion' });
  const heartbeat = alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-07' });
  const ok = evaluate(events(applies, heartbeat), {});
  check('fapolicyd in enforcement mode and decisions read → CUMPLE', ok.deEvidencia('EV-07')?.status === 'CUMPLE', ok.deEvidencia('EV-07')?.reason);

  const auditoria = evaluate(events(alert({ event: 'execution_control_status', evidence_id: 'EV-07', mecanismo: 'fapolicyd', activo: 'si', modo: 'auditoria' }), heartbeat), {});
  check('REVERSAL: the same mechanism in audit mode → NO_CUMPLE', auditoria.deEvidencia('EV-07')?.status === 'NO_CUMPLE');

  const left = alert({ event: 'execution_observed', evidence_id: 'EV-07', ruta: '/tmp/x', decision: 'permitida', fecha: ago(4) });
  const outside = evaluate(events(applies, heartbeat, left), { 'P-08': ['python3 | /usr/bin/python3.12 | - | servidores'] });
  check('unblocked execution outside P-08 → NO_CUMPLE', outside.deEvidencia('EV-07')?.status === 'NO_CUMPLE', outside.deEvidencia('EV-07')?.reason);
  const inside = evaluate(events(applies, heartbeat, left), { 'P-08': ['x | /tmp/x | - | -'] });
  check('REVERSAL: the same execution declared in P-08 → CUMPLE', inside.deEvidencia('EV-07')?.status === 'CUMPLE', inside.deEvidencia('EV-07')?.reason);
}

section('9. EV-08 to EV-11 · the observed EDR layer and P-09');

{
  const edr = [
    alert({ event: 'edr_capability_observed', evidence_id: 'EV-09', capacidad: 'yara', desplegada: 'no', detalle: 'el manager la configura pero en esta maquina falta el script o el binario yara' }),
    alert({ event: 'edr_capability_observed', evidence_id: 'EV-10', capacidad: 'rootcheck', desplegada: 'si', detalle: 'ultima pasada terminada', bases: 'sin_rootkit_files,sin_rootkit_trojans' }),
    alert({ event: 'edr_capability_observed', evidence_id: 'EV-11', capacidad: 'active_response', desplegada: 'si', detalle: 'comandos de contencion configurados y presentes: firewall-drop' }),
  ];
  const P09 = ['virustotal | si | FIM', 'yara | si | rutas de riesgo', 'rootcheck | si | todos', 'active_response | si | firewall-drop'];
  const r = evaluate(events(...edr), { 'P-09': P09 });

  check('EV-08 VirusTotal declared: not observable on the machine → NO_EVALUABLE', r.deEvidencia('EV-08')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-08')?.reason);
  const vtNo = evaluate(events(...edr), { 'P-09': ['virustotal | no |'] });
  check('REVERSAL: VirusTotal declared not activated → NO_CUMPLE', vtNo.deEvidencia('EV-08')?.status === 'NO_CUMPLE');
  check('EV-09 YARA without a script on the machine → NO_CUMPLE', r.deEvidencia('EV-09')?.status === 'NO_CUMPLE', r.deEvidencia('EV-09')?.reason);
  check('EV-10 rootcheck without its databases → NO_CUMPLE', r.deEvidencia('EV-10')?.status === 'NO_CUMPLE', r.deEvidencia('EV-10')?.reason);
  const complete2 = evaluate(events(alert({ event: 'edr_capability_observed', evidence_id: 'EV-10', capacidad: 'rootcheck', desplegada: 'si', detalle: 'ok', bases: 'ninguno' })), { 'P-09': P09 });
  check('REVERSAL: rootcheck with its databases → NO_EVALUABLE (findings go to the manager), never CUMPLE', complete2.deEvidencia('EV-10')?.status === 'NO_EVALUABLE', complete2.deEvidencia('EV-10')?.reason);
  check('EV-11 only firewall-drop (network block) → NO_CUMPLE: it does not contain malicious code', r.deEvidencia('EV-11')?.status === 'NO_CUMPLE' && /firewall-drop/.test(r.deEvidencia('EV-11')?.reason || ''), r.deEvidencia('EV-11')?.reason);
  check('R4 comes out NO_CUMPLE', r.principal('op.exp.6.r4.1').status === 'NO_CUMPLE', r.principal('op.exp.6.r4.1').reason);
}

section('9b. EV-11 · malicious-code containment, executable on the machine');

{
  const real = alert({ event: 'edr_capability_observed', evidence_id: 'EV-11', requisito: 'op.exp.6.r4.1', equipo: 'wazuh-real', capacidad: 'active_response', desplegada: 'si', detalle: 'comandos de contencion configurados y presentes: firewall-drop; configurados sin script aqui: quersystem-malware-quarantine.sh,quersystem-yara.sh' });
  const P09 = ['active_response | si | firewall-drop'];

  const hoy = evaluate(events(real), { 'P-09': P09 });
  check(
    'wazuh-real: the configured quarantine does not exist on the machine → EV-11 measured NO_CUMPLE, naming it',
    hoy.deEvidencia('EV-11')?.status === 'NO_CUMPLE' && /quersystem-malware-quarantine\.sh/.test(hoy.deEvidencia('EV-11')?.reason || ''),
    hoy.deEvidencia('EV-11')?.reason
  );
  check('and op.exp.6.1 does not rest on firewall-drop', hoy.principal('op.exp.6.1').status === 'NO_CUMPLE', hoy.principal('op.exp.6.1').status);

  const structured = evaluate(events(alert({ event: 'edr_capability_observed', evidence_id: 'EV-11', capacidad: 'active_response', desplegada: 'si', detalle: 'x', comandos_presentes: 'firewall-drop', comandos_sin_script: 'quersystem-malware-quarantine.sh,quersystem-yara.sh' })), { 'P-09': P09 });
  check('with the extended collector\'s fields → the same NO_CUMPLE', structured.deEvidencia('EV-11')?.status === 'NO_CUMPLE' && /quersystem-yara\.sh/.test(structured.deEvidencia('EV-11')?.reason || ''), structured.deEvidencia('EV-11')?.reason);

  const conScripts = evaluate(events(alert({ event: 'edr_capability_observed', evidence_id: 'EV-11', capacidad: 'active_response', desplegada: 'si', detalle: 'x', comandos_presentes: 'firewall-drop,quersystem-malware-quarantine.sh,quersystem-yara.sh', comandos_sin_script: '-' })), { 'P-09': P09 });
  check('REVERSAL: with the quarantine scripts present → CUMPLE', conScripts.deEvidencia('EV-11')?.status === 'CUMPLE', conScripts.deEvidencia('EV-11')?.reason);
}

section('10. EV-12 · entry vectors and removable devices');

{
  const heartbeat = alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-12' });
  const usb = evaluate(events(heartbeat), { 'P-05': ['dispositivos_extraibles | clamonacc al montar'], 'P-10': 'bloqueados' });
  check('USB vector only, kernel read and nothing connected → CUMPLE', usb.deEvidencia('EV-12')?.status === 'CUMPLE', usb.deEvidencia('EV-12')?.reason);

  const connected = evaluate(events(heartbeat, alert({ event: 'removable_device_connected', evidence_id: 'EV-12', dispositivo: 'sdb', fecha: ago(2) })), { 'P-05': ['dispositivos_extraibles | -'], 'P-10': 'bloqueados' });
  check('REVERSAL: a removable disk connected with P-10=bloqueados → NO_CUMPLE', connected.deEvidencia('EV-12')?.status === 'NO_CUMPLE', connected.deEvidencia('EV-12')?.reason);

  const mail = evaluate(events(heartbeat), { 'P-05': ['correo | pasarela', 'dispositivos_extraibles | -'], 'P-10': 'bloqueados' });
  check('mail vector this machine does not analyze → NO_EVALUABLE', mail.deEvidencia('EV-12')?.status === 'NO_EVALUABLE', mail.deEvidencia('EV-12')?.reason);

  const analyzed = evaluate(events(heartbeat, alert({ event: 'external_file_scanned', evidence_id: 'EV-12', via: 'correo', resultado: 'limpio', fecha: ago(2) })), { 'P-05': ['correo | amavis'], 'P-10': 'bloqueados' });
  check('REVERSAL: this machine\'s gateway analyzed mail → CUMPLE', analyzed.deEvidencia('EV-12')?.status === 'CUMPLE', analyzed.deEvidencia('EV-12')?.reason);

  const withoutP05 = evaluate(events(heartbeat), {});
  check('sin P-05 → NO_EVALUABLE', withoutP05.deEvidencia('EV-12')?.status === 'NO_EVALUABLE');
}

section('10b. The gap cause: an undeclared parameter is CONFIGURATION');

{
  const cause = (r: ReturnType<typeof evaluate>, id: string) =>
    applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp6CatalogDefinition.requirements).find(e => e.id === id)?.gapCause;

  const withoutP05 = evaluate(events(alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-12' })), {});
  check('without P-05 → EV-12 with cause CONFIGURATION, not COLLECTION', cause(withoutP05, 'EV-12') === 'CONFIGURATION', cause(withoutP05, 'EV-12'));
  check('and the requirement decision op.exp.6.3 says so', withoutP05.principal('op.exp.6.3').cause === 'CONFIGURATION', withoutP05.principal('op.exp.6.3').cause);

  const withoutP06 = evaluate(events(alert({ event: 'full_scan_completed', evidence_id: 'EV-05', fecha: ago(30), ficheros_escaneados: '10' })), {});
  check('scan observed and P-06 unconfigured → CONFIGURATION', cause(withoutP06, 'EV-05') === 'CONFIGURATION', cause(withoutP06, 'EV-05'));

  const nothing = evaluate(events(alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: '' })), {});
  check('without any rootcheck observation → COLLECTION', cause(nothing, 'EV-10') === 'COLLECTION', cause(nothing, 'EV-10'));

  const declared2 = evaluate(events(alert({ event: 'evidence_state', evidence_id: 'EV-08', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'la consulta la hace el manager' })), { 'P-09': ['virustotal | si | FIM'] });
  check('what the collector declares (CONFIGURATION) reaches the evidence', cause(declared2, 'EV-08') === 'CONFIGURATION', cause(declared2, 'EV-08'));
}

section('11. wazuh-real today: the base comes out measured NO_CUMPLE, not grey');

{
  const r = evaluate(events(...WITHOUT_ANTIMALWARE()), { 'P-02': P02, 'P-03': '48', 'P-04': P04 }, 'BAJO');

  ['op.exp.6.2', 'op.exp.6.4', 'op.exp.6.5'].forEach(id => {
    const q = r.requisito(id);
    check(`${id} → measured NO_CUMPLE`, q.status === 'NO_CUMPLE' && q.evidenced === true, `${q.status} ${q.evidenced}`);
  });

  const q1 = r.requisito('op.exp.6.1');
  check('op.exp.6.1 → NO_CUMPLE (EV-01 and EV-04 sustain it)', q1.status === 'NO_CUMPLE', q1.status);
  check('at BAJO, R1 does not apply', r.requisito('op.exp.6.r1.1').status === 'NO_APLICA');

  const withClamav = evaluate(events(...WITH_CLAMAV()), { 'P-02': P02, 'P-03': '48', 'P-04': P04 }, 'BAJO');
  ['op.exp.6.2', 'op.exp.6.4', 'op.exp.6.5'].forEach(id => {
    const q = withClamav.requisito(id);
    check(`REVERSAL: with ClamAV running and up to date, ${id} → CUMPLE`, q.status === 'CUMPLE', `${q.status}`);
  });
}

section('12. Only op.exp.6 facts count');

{
  const foreignOne = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': ago(1),
      agent: { id: '024', name: 'wazuh-real' },
      data: { ensfacil: 'op.exp.3', event: 'antimalware_status', evidence_id: 'EV-01', plano: 'sistema', equipo: 'wazuh-real', producto_activo: 'clamav' },
    },
  }]);
  const r = evaluate(foreignOne, { 'P-02': P02, 'P-03': '48' });
  check('an antimalware_status from another control does not enter EV-02', r.deEvidencia('EV-02')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-02')?.reason);
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
