/** op.acc.6: chosen reinforcement, zones and factors, attempt limit and password quality. */
import { opAcc6CatalogDefinition } from '../common/ens/catalog/op-acc-6';
import { opAcc6Configuration } from '../common/ens/configuration/data/op-acc-6-parameters';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../common/ens/core/policy-runtime/policy-runtime';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (
  name: string,
  condition: boolean,
  detail: string = ''
): void => {
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures.push(name);
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const NOW = new Date('2026-09-16T16:30:00Z');

const REALES = [
  { event: 'authentication_success', evidence_id: 'EV-01,EV-02,EV-07', plano: 'sistema', usuario: 'dioni', origen: '84.120.100.80', canal: 'ssh', servicio: 'sshd', metodos: 'publickey', factores: 1, tipo_clave: 'ED25519', ocurrencias: 42 },
  { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'pam:sshd', en_uso: 'no', mecanismo: 'ninguno', bloqueo: 'no', desbloqueo_automatico: 'no' },
  { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'pam:login', en_uso: 'si', mecanismo: 'ninguno', bloqueo: 'no', desbloqueo_automatico: 'no' },
  { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'sshd:publickey', en_uso: 'si', mecanismo: 'clave_publica', bloqueo: 'no_aplica', desbloqueo_automatico: 'no' },
  { event: 'password_policy_checked', evidence_id: 'EV-11', plano: 'sistema', mecanismo: 'pam_unix', longitud_minima: 6, clases_de_caracteres: 0, historial: 0, lista_de_bloqueo: 0 },
  { event: 'remote_channel_listening', evidence_id: 'EV-02,EV-08', plano: 'sistema', canal: 'ssh', tipo: 'autenticacion', cifrado: 'si', direcciones: '2a01:4f9:c015:2f44::1,62.238.61.123,fe80::9000:9ff:fe53:9e9c', puertos: 'tcp/22121', habilitado_permanente: 'si', factores_minimos: '1', contrasena_admitida: 'no', match_condicional: 'no' },
  { event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-01,EV-09,EV-12,EV-04,EV-07,EV-02', perfil: 'linux', emisor: 'recolector' },
];

let sequence = 0;

const facts = (
  alertRows: Record<string, unknown>[],
  ts = '2026-09-16T16:18:35Z'
): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    alertRows.map(data => ({
      _id: `h-${(sequence += 1)}`,
      _source: {
        '@timestamp': ts,
        agent: { id: '001', name: 'wazuh-real' },
        rule: { id: '110100', description: 'op.acc.6' },
        data: { ensfacil: 'op.acc.6', host: 'wazuh-real', ...data },
      },
    }))
  );

const configuration = (
  values: Record<string, unknown>
): ENSControlConfiguration => ({
  ...opAcc6Configuration,
  parameters: opAcc6Configuration.parameters.map(parameter =>
    Object.prototype.hasOwnProperty.call(values, parameter.id)
      ? { ...parameter, value: values[parameter.id] as never }
      : parameter
  ),
});

const BASE: Record<string, unknown> = {
  'P-01': 'R2',
  'P-02': ['192.168.10.0/24'],
  'P-03': ['local'],
  'P-04': 180,
  'P-05': 5,
  'P-06': 24,
  'P-07': ['ssh | si | Responsable de Seguridad | si'],
  'P-08': ['sudo'],
  'P-09': 45,
  'P-10': ['longitud_minima | 12'],
  'P-11': ['sshd:version_software'],
  'P-ATT': [],
};

const evaluate = (
  values: Record<string, unknown>,
  events: ENSNormalizedEvent[],
  level: ENSLevel = 'BAJO'
) => {
  const config = configuration({ ...BASE, ...values });
  const control = { ...opAcc6CatalogDefinition, status: 'ACTIVE' as const };
  const evidences = resolveEvidenceForControl(
    'op.acc.6',
    events,
    undefined,
    level,
    config,
    NOW
  );
  const context = buildPolicyContext(control, config, level, events, evidences, NOW);
  const policy = runPolicyRuntime(context);
  const result = evaluateENSControl(control, config, level, evidences, policy, events);
  const requirementOf = (id: string) =>
    result.requirements.find(requirement => requirement.id === id);
  const decision = (id: string) =>
    policy.decisions.find(item => item.requirementId === id);
  const evidence = (id: string) =>
    result.evidences.find(item => item.id === id);
  return { resultado: result, requisito: requirementOf, decision, evidencia: evidence };
};

section('1. Only the mechanism reinforcement that P-01 declares counts');

{
  const MECHANISM = [
    'op.acc.6.r1.1', 'op.acc.6.r1.2', 'op.acc.6.r2.1',
    'op.acc.6.r3.1', 'op.acc.6.r3.2', 'op.acc.6.r4.1', 'op.acc.6.r4.2',
  ];
  const events = facts(REALES);

  const expectedItems: Record<string, string[]> = {
    R1: ['op.acc.6.r1.1', 'op.acc.6.r1.2'],
    R2: ['op.acc.6.r1.2', 'op.acc.6.r2.1'],
    R3: ['op.acc.6.r3.1', 'op.acc.6.r3.2'],
    R4: ['op.acc.6.r4.1', 'op.acc.6.r4.2'],
  };

  Object.entries(expectedItems).forEach(([reinforcement, apply2]) => {
    const { requisito: requirement, resultado: result } = evaluate({ 'P-01': reinforcement }, events);
    const apply = MECHANISM.filter(id => requirement(id)?.status !== 'NO_APLICA');
    check(
      `P-01=${reinforcement} · exactly ${apply2.join(', ')} apply`,
      apply.join(',') === apply2.join(','),
      apply.join(',')
    );
    check(
      `P-01=${reinforcement} · at BAJO the denominator is 14`,
      result.applicableRequirements === 14,
      String(result.applicableRequirements)
    );
  });

  const { requisito: requirementOf, resultado: result } = evaluate({ 'P-01': undefined }, events);
  check(
    'without P-01 · the seven mechanism requirements count (none NO_APLICA)',
    MECHANISM.every(id => requirementOf(id)?.status === 'NO_CUMPLE'),
    MECHANISM.map(id => `${id}=${requirementOf(id)?.status}`).join(' ')
  );
  check(
    'without P-01 · and they are not pretended measured',
    MECHANISM.every(id => requirementOf(id)?.evidenced === false)
  );
  check(
    'without P-01 · denominator 19 at BAJO',
    result.applicableRequirements === 19,
    String(result.applicableRequirements)
  );

  ['op.acc.6.r8.1', 'op.acc.6.r9.1', 'op.acc.6.r9.2'].forEach(id => {
    check(
      `${id} applies at BAJO`,
      opAcc6CatalogDefinition.requirements
        .find(requirement => requirement.id === id)
        ?.applicability.levels.includes('BAJO') === true
    );
  });
}

section('2. R8: the origin is classified against P-02 and outside requires two factors');

{
  const events = facts(REALES);

  const outside = evaluate({ 'P-02': ['192.168.10.0/24'] }, events);
  check(
    'key access from 84.120.100.80 outside P-02 · r8.1 measured NO_CUMPLE',
    outside.requisito('op.acc.6.r8.1')?.status === 'NO_CUMPLE' &&
      outside.requisito('op.acc.6.r8.1')?.evidenced === true,
    `${outside.requisito('op.acc.6.r8.1')?.status} evidenced=${outside.requisito('op.acc.6.r8.1')?.evidenced}`
  );
  check(
    'the motive names the user, the origin and the exposed channel',
    /dioni/.test(outside.decision('op.acc.6.r8.1')?.reason || '') &&
      /84\.120\.100\.80/.test(outside.decision('op.acc.6.r8.1')?.reason || '') &&
      /62\.238\.61\.123/.test(outside.decision('op.acc.6.r8.1')?.reason || ''),
    outside.decision('op.acc.6.r8.1')?.reason
  );

  const inside = evaluate(
    {
      'P-02': [
        '84.120.100.80/32 oficina',
        '62.238.61.123',
        '2a01:4f9:c015:2f44::/64',
        'fe80::/10',
      ],
    },
    events
  );
  check(
    'same facts with origin and addresses in P-02 · r8.1 CUMPLE',
    inside.requisito('op.acc.6.r8.1')?.status === 'CUMPLE',
    inside.decision('op.acc.6.r8.1')?.reason
  );

  const almost = evaluate(
    { 'P-02': ['84.120.100.80/32', '62.238.61.123/32', '2a01:4f9:c015:2f44::/64'] },
    events
  );
  check(
    'a single channel address outside (fe80::) · r8.1 NO_CUMPLE',
    almost.requisito('op.acc.6.r8.1')?.status === 'NO_CUMPLE',
    almost.decision('op.acc.6.r8.1')?.reason
  );

  const twoFactors = facts([
    { ...REALES[0], metodos: 'publickey+keyboard-interactive/pam', factores: 2 },
    { ...REALES[5], factores_minimos: '2' },
  ]);
  const double = evaluate({ 'P-02': ['192.168.10.0/24'] }, twoFactors);
  check(
    'two factors from outside and a channel that requires two · r8.1 CUMPLE',
    double.requisito('op.acc.6.r8.1')?.status === 'CUMPLE',
    double.decision('op.acc.6.r8.1')?.reason
  );

  const console = facts([
    { event: 'authentication_success', evidence_id: 'EV-01,EV-02', usuario: 'root', origen: 'local', canal: 'consola', metodos: 'password', factores: 1 },
    { ...REALES[5], direcciones: '192.168.10.10', factores_minimos: '1' },
  ]);
  check(
    'console with a password and without «local» in P-02 · NO_CUMPLE',
    evaluate({ 'P-02': ['192.168.10.0/24'] }, console).requisito('op.acc.6.r8.1')?.status === 'NO_CUMPLE'
  );
  check(
    'the reversal: with «local» declared · CUMPLE',
    evaluate({ 'P-02': ['192.168.10.0/24', 'local'] }, console).requisito('op.acc.6.r8.1')?.status === 'CUMPLE'
  );

  const empty = evaluate({ 'P-02': ['192.168.10.0/24'] }, []);
  check(
    'without facts or heartbeat · r8.1 unproven',
    empty.requisito('op.acc.6.r8.1')?.status === 'NO_CUMPLE' &&
      empty.requisito('op.acc.6.r8.1')?.evidenced === false
  );
  const onlyHeartbeat = evaluate({ 'P-02': ['192.168.10.0/24'] }, facts([REALES[6]], '2026-09-16T16:00:00Z'));
  check(
    'without channels or accesses and with a heartbeat covering EV-02 · CUMPLE',
    onlyHeartbeat.requisito('op.acc.6.r8.1')?.status === 'CUMPLE',
    onlyHeartbeat.decision('op.acc.6.r8.1')?.reason
  );

  const unreadable = evaluate({ 'P-02': ['sede central'] }, events);
  check(
    'P-02 with a non-network element · unproven, never CUMPLE',
    unreadable.requisito('op.acc.6.r8.1')?.evidenced === false
  );

  check(
    'with P-01=R3, EV-02 shows r8.1\'s CUMPLE and not r1.1\'s NO_APLICA',
    evaluate(
      { 'P-01': 'R3', 'P-02': ['84.120.100.80/32', '62.238.61.123', '2a01:4f9:c015:2f44::/64', 'fe80::/10'] },
      events
    )
      .evidencia('EV-02')?.status === 'CUMPLE'
  );
}

section('3. R1 and R2 over the same facts');

{
  const events = facts([
    { event: 'authentication_success', evidence_id: 'EV-01,EV-02,EV-07', usuario: 'ana', origen: '203.0.113.9', canal: 'ssh', metodos: 'password', factores: 1 },
    { ...REALES[5], direcciones: '192.168.10.10', factores_minimos: '1', contrasena_admitida: 'si' },
  ]);

  const r1 = evaluate({ 'P-01': 'R1', 'P-02': ['192.168.10.0/24'] }, events);
  check(
    'R1 · password alone from outside · r1.1 NO_CUMPLE',
    r1.requisito('op.acc.6.r1.1')?.status === 'NO_CUMPLE'
  );

  const r1dentro = evaluate({ 'P-01': 'R1', 'P-02': ['192.168.10.0/24', '203.0.113.0/24'] }, events);
  check(
    'the reversal: the same access from a controlled zone · r1.1 CUMPLE',
    r1dentro.requisito('op.acc.6.r1.1')?.status === 'CUMPLE',
    r1dentro.decision('op.acc.6.r1.1')?.reason
  );

  const r2 = evaluate({ 'P-01': 'R2', 'P-02': ['192.168.10.0/24', '203.0.113.0/24'] }, events);
  check(
    'R2 · a single factor even from a controlled zone · r2.1 NO_CUMPLE',
    r2.requisito('op.acc.6.r2.1')?.status === 'NO_CUMPLE'
  );
}

section('4. op.acc.6.8: there is a lockout, within P-05 and without automatic unlock');

{
  const reales = evaluate({}, facts(REALES));
  check(
    'wazuh-real: the console (pam:login) does not lock · measured NO_CUMPLE',
    reales.requisito('op.acc.6.8')?.status === 'NO_CUMPLE' &&
      reales.requisito('op.acc.6.8')?.evidenced === true &&
      /pam:login/.test(reales.decision('op.acc.6.8')?.reason || ''),
    reales.decision('op.acc.6.8')?.reason
  );
  check(
    'and it does not accuse pam:sshd (disabled) or the public key',
    !/pam:sshd|sshd:publickey/.test(reales.decision('op.acc.6.8')?.reason || ''),
    reales.decision('op.acc.6.8')?.reason
  );

  const faillock = (deny: number, unlock: number) =>
    facts([
      { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'pam:login', en_uso: 'si', mecanismo: 'pam_faillock', bloqueo: 'si', max_intentos: deny, desbloqueo_automatico: unlock > 0 ? 'si' : 'no', desbloqueo_segundos: unlock },
    ]);

  check(
    'faillock deny=5 unlock_time=0 with P-05=5 · CUMPLE',
    evaluate({ 'P-05': 5 }, faillock(5, 0)).requisito('op.acc.6.8')?.status === 'CUMPLE'
  );
  check(
    'the threshold reversal: the same fact with P-05=3 · NO_CUMPLE',
    evaluate({ 'P-05': 3 }, faillock(5, 0)).requisito('op.acc.6.8')?.status === 'NO_CUMPLE'
  );
  check(
    'automatic unlock after 600 s · NO_CUMPLE',
    evaluate({ 'P-05': 5 }, faillock(5, 600)).requisito('op.acc.6.8')?.status === 'NO_CUMPLE'
  );

  const failures8 = [
    ...faillock(5, 0),
    ...facts([{ event: 'authentication_failure', evidence_id: 'EV-01,EV-04', usuario: 'root', usuario_existe: 'si', origen: '203.0.113.9', canal: 'ssh', fallos: 8 }]),
  ];
  check(
    '8 failures of an existing account without a recorded lockout · NO_CUMPLE',
    evaluate({ 'P-05': 5 }, failures8).requisito('op.acc.6.8')?.status === 'NO_CUMPLE'
  );
  check(
    'the reversal: with the lockout recorded · CUMPLE',
    evaluate({ 'P-05': 5 }, [
      ...failures8,
      ...facts([{ event: 'account_locked', evidence_id: 'EV-03,EV-04', usuario: 'root', mecanismo: 'pam_faillock' }]),
    ]).requisito('op.acc.6.8')?.status === 'CUMPLE'
  );
  check(
    'failures against nonexistent accounts cannot be locked and accuse nobody',
    evaluate({ 'P-05': 5 }, [
      ...faillock(5, 0),
      ...facts([{ event: 'authentication_failure', evidence_id: 'EV-01,EV-04', usuario: 'admin', usuario_existe: 'no', origen: '203.0.113.9', canal: 'ssh', fallos: 50 }]),
    ]).requisito('op.acc.6.8')?.status === 'CUMPLE'
  );
}

section('4 bis. The unmeasured directory plane prevents the system\'s CUMPLE');

{
  const faillockOk = facts([
    { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'pam:login', en_uso: 'si', mecanismo: 'pam_faillock', bloqueo: 'si', max_intentos: 5, desbloqueo_automatico: 'no', desbloqueo_segundos: 0 },
  ]);
  const unreadableDirectory = facts([
    { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'directorio', ruta: 'slapd:bind', en_uso: 'si', mecanismo: 'ppolicy', bloqueo: 'desconocido' },
  ]);

  const onlySystem = evaluate({ 'P-05': 5 }, faillockOk);
  const withDirectory = evaluate({ 'P-05': 5 }, [...faillockOk, ...unreadableDirectory]);
  check(
    'the reversal: only the system, well configured · 6.8 CUMPLE',
    onlySystem.requisito('op.acc.6.8')?.status === 'CUMPLE'
  );
  check(
    'with the directory policy unreadable · 6.8 unproven, not measured NO_CUMPLE',
    withDirectory.requisito('op.acc.6.8')?.status === 'NO_CUMPLE' &&
      withDirectory.requisito('op.acc.6.8')?.evidenced === false,
    withDirectory.decision('op.acc.6.8')?.reason
  );

  const systemAge = facts([
    { event: 'credential_age_checked', evidence_id: 'EV-05', plano: 'sistema', usuario: 'user', credencial: 'contrasena', medida: 'antiguedad', dias: 30 },
    { event: 'credential_age_checked', evidence_id: 'EV-05', plano: 'sistema', usuario: 'user', credencial: 'contrasena', medida: 'caducidad_configurada', dias: 180 },
  ]);
  const directoryAge = facts([
    { event: 'credential_age_checked', evidence_id: 'EV-05', plano: 'directorio', usuario: 'directorio', observacion: 'no_disponible', motivo: 'la ACL no deja ver zimbraPasswordModifiedTime' },
  ]);
  check(
    'the reversal: EV-05 only with the system inside P-04 · CUMPLE',
    evaluate({ 'P-04': 180 }, systemAge).evidencia('EV-05')?.status === 'CUMPLE'
  );
  check(
    'with the directory not observed · EV-05 NO_EVALUABLE, never CUMPLE',
    evaluate({ 'P-04': 180 }, [...systemAge, ...directoryAge]).evidencia('EV-05')?.status === 'NO_EVALUABLE'
  );
  check(
    'but a measured breach by the system still prevails',
    evaluate({ 'P-04': 90 }, [...systemAge, ...directoryAge]).evidencia('EV-05')?.status === 'NO_CUMPLE'
  );
}

section('5. op.acc.6.r1.2: each P-10 minimum, only with R1 or R2');

{
  const events = facts(REALES);

  check(
    'wazuh-real (pam_unix, length 6) with P-10 longitud_minima 12 · NO_CUMPLE',
    evaluate({ 'P-01': 'R2', 'P-10': ['longitud_minima | 12'] }, events).requisito('op.acc.6.r1.2')?.status === 'NO_CUMPLE'
  );
  check(
    'the reversal: P-10 longitud_minima 6 · CUMPLE',
    evaluate({ 'P-01': 'R2', 'P-10': ['longitud_minima | 6'] }, events).requisito('op.acc.6.r1.2')?.status === 'CUMPLE'
  );
  check(
    'a second criterion not met (history 5) · NO_CUMPLE',
    evaluate({ 'P-01': 'R1', 'P-10': ['longitud_minima | 6', 'historial | 5'] }, events).requisito('op.acc.6.r1.2')?.status === 'NO_CUMPLE'
  );
  check(
    'with R3 it does not apply · NO_APLICA, and EV-11 is not shown as a gap either',
    (() => {
      const r3 = evaluate({ 'P-01': 'R3' }, events);
      return (
        r3.requisito('op.acc.6.r1.2')?.status === 'NO_APLICA' &&
        r3.evidencia('EV-11')?.status === 'NO_APLICA'
      );
    })()
  );
  check(
    'R2 without P-10 · unproven',
    evaluate({ 'P-01': 'R2', 'P-10': undefined }, events).requisito('op.acc.6.r1.2')?.evidenced === false
  );
}

section('6. R9: authorized channel, encryption and constant use against P-07');

{
  const events = facts(REALES);
  const ok = evaluate({ 'P-07': ['ssh | si | Responsable de Seguridad | si'] }, events);
  check(
    'ssh encrypted and declared constant use · EV-07 and EV-08 CUMPLE',
    ok.evidencia('EV-07')?.status === 'CUMPLE' && ok.evidencia('EV-08')?.status === 'CUMPLE',
    `EV-07=${ok.evidencia('EV-07')?.status} EV-08=${ok.evidencia('EV-08')?.status}`
  );
  const notConstant = evaluate({ 'P-07': ['ssh | si | Responsable de Seguridad | no'] }, events);
  check(
    'the reversal: declared NOT constant use and it always starts · EV-08 NO_CUMPLE',
    notConstant.evidencia('EV-08')?.status === 'NO_CUMPLE'
  );
  const otherChannel = evaluate({ 'P-07': ['vpn | si | Responsable de Seguridad | si'] }, events);
  check(
    'access by ssh with only vpn authorized · EV-07 NO_CUMPLE',
    otherChannel.evidencia('EV-07')?.status === 'NO_CUMPLE'
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
