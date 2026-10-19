/** op.acc.5: reinforcement choice, direct R1 breach and judgment of its evidences, through the real engine. */
import { opAcc5CatalogDefinition } from '../common/ens/catalog/op-acc-5';
import { opAcc5Configuration } from '../common/ens/configuration/data/op-acc-5-parameters';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../common/ens/core/policy-runtime/policy-runtime';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { requirementVerdict } from '../common/ens/core/evaluation/utils/verdict';

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

const NOW = new Date('2026-09-16T12:00:00Z');

const ago = (horas: number): string =>
  new Date(NOW.getTime() - horas * 3600 * 1000).toISOString();

type Valores = Record<string, string | number | boolean | string[]>;

const buildConfiguration = (valores: Valores): ENSControlConfiguration => ({
  ...opAcc5Configuration,
  parameters: opAcc5Configuration.parameters.map(parameter =>
    Object.prototype.hasOwnProperty.call(valores, parameter.id)
      ? { ...parameter, value: valores[parameter.id] }
      : { ...parameter }
  ),
});

const COMPLETE: Valores = {
  'P-01': 'R2',
  'P-02': ['sede | sede.organismo.es | /var/log/sede/autenticacion.json'],
  'P-03': 5,
  'P-04': 'PR-07 Reactivación de credenciales v1.2',
  'P-05': 90,
  'P-06': 24,
  'P-08': 365,
  'P-09': true,
  'P-ATT': [
    'op.acc.5.1 | Procedimiento de alta de usuarios externos | https://intranet/pr-alta.pdf | 2026-05-12 | RSEG',
    'op.acc.5.2 | Acuse de recibo de credenciales | https://intranet/acuse.pdf | 2026-05-12 | RSEG',
    'op.acc.5.3 | Entrega bajo control exclusivo | https://intranet/entrega.pdf | 2026-05-12 | RSEG',
    'op.acc.5.9 | Aviso de derechos tras el acceso | https://intranet/aviso.png | 2026-05-12 | RSEG',
    'op.acc.5.r5.2 | Captura del aviso de último acceso | https://intranet/ultimo.png | 2026-05-12 | RSEG',
  ],
};

const sin = (valores: Valores, ...ids: string[]): Valores => {
  const copy = { ...valores };
  ids.forEach(id => delete copy[id]);

  return copy;
};

let sequence = 0;

const fact = (
  eventType: string,
  evidenceId: string | undefined,
  attributes: Record<string, unknown>,
  horas = 1
): ENSNormalizedEvent => ({
  id: `ev-${++sequence}`,
  controlId: 'op.acc.5',
  evidenceId,
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp: ago(horas),
  agentId: '001',
  agentName: 'portal-01',
  attributes,
});

const heartbeat = (covered: string, horas = 1) =>
  fact('collector_run', undefined, {
    resultado: 'completada',
    evidencias_cubiertas: covered,
  }, horas);

const HEALTHY: ENSNormalizedEvent[] = [
  fact('access_log_source', 'EV-01', { servicio: 'sede', dias_conservados: 400 }),
  fact('lockout_policy', 'EV-02', { servicio: 'sede', bloqueo: 'activado', intentos: 5, reactivacion: 'intervencion' }),
  fact('failed_attempt_streak', 'EV-02', { servicio: 'sede', usuario: 'eve', intentos: 3, bloqueo_registrado: 'no' }),
  fact('credential_age', 'EV-04', { servicio: 'sede', usuario: 'ana', dias_desde_cambio: 30 }),
  fact('credential_disable_delay', 'EV-05', { servicio: 'sede', usuario: 'bob', motivo: 'compromiso', horas: 4 }),
  fact('external_auth_success', 'EV-07', { servicio: 'sede', usuario: 'ana', refuerzo: 'R2' }),
  fact('external_auth_success', 'EV-01', { servicio: 'sede', usuario: 'ana', refuerzo: 'R2' }),
  heartbeat('EV-03,EV-06,EV-09'),
];

const evaluate = (
  level: ENSLevel,
  valores: Valores,
  events: ENSNormalizedEvent[]
) => {
  const configuration = buildConfiguration(valores);

  const evidences = resolveEvidenceForControl(
    'op.acc.5',
    events,
    undefined,
    level,
    configuration,
    NOW
  );

  const runtime = runPolicyRuntime(
    buildPolicyContext(
      opAcc5CatalogDefinition,
      configuration,
      level,
      events,
      evidences,
      NOW
    )
  );

  return evaluateENSControl(
    opAcc5CatalogDefinition,
    configuration,
    level,
    evidences,
    runtime,
    events
  );
};

type Result = ReturnType<typeof evaluate>;

const req = (result: Result, id: string) => {
  const found = result.requirements.find(item => item.id === id);

  if (!found) {
    throw new Error(`fixture rota: ${id}`);
  }

  return found;
};

const verdict = (result: Result, id: string) =>
  requirementVerdict(req(result, id));

const applicable = (result: Result): string[] =>
  result.requirements
    .filter(item => requirementVerdict(item) !== 'NO_APLICA')
    .map(item => item.id);

const evidenceOf = (result: Result, id: string) =>
  result.evidences.find(item => item.id === id);

const REINFORCEMENTS = [
  'op.acc.5.r1.1', 'op.acc.5.r1.2', 'op.acc.5.r2.1',
  'op.acc.5.r3.1', 'op.acc.5.r3.2', 'op.acc.5.r3.3',
  'op.acc.5.r4.1', 'op.acc.5.r4.2', 'op.acc.5.r4.3',
];

section('0. Catalog: nine documentary requirements and R6/R7 without levels');

{
  const documentales = opAcc5CatalogDefinition.requirements
    .filter(item => item.evidenceIds.length === 0)
    .map(item => item.id);

  check(
    'exactly the nine documentary ones go without technical evidence',
    JSON.stringify(documentales) ===
      JSON.stringify([
        'op.acc.5.1', 'op.acc.5.2', 'op.acc.5.3', 'op.acc.5.9',
        'op.acc.5.r3.3', 'op.acc.5.r4.3', 'op.acc.5.r5.2',
        'op.acc.5.r6.1', 'op.acc.5.r7.1',
      ]),
    documentales.join(', ')
  );

  check(
    'the control is ACTIVE',
    opAcc5CatalogDefinition.status === 'ACTIVE'
  );
}

section('1. Only the reinforcement chosen in P-01 counts');

{
  const r2 = evaluate('MEDIO', COMPLETE, HEALTHY);

  check(
    'MEDIO + R2: the base, r2.1 and R5 count (12 requirements)',
    applicable(r2).length === 12,
    applicable(r2).join(', ')
  );

  check(
    'MEDIO + R2: r1.*, r3.* and r4.* come out NO_APLICA',
    REINFORCEMENTS.filter(id => id !== 'op.acc.5.r2.1').every(
      id => verdict(r2, id) === 'NO_APLICA'
    )
  );

  check(
    'MEDIO + R2: R6 and R7 do not count in any case',
    verdict(r2, 'op.acc.5.r6.1') === 'NO_APLICA' &&
      verdict(r2, 'op.acc.5.r7.1') === 'NO_APLICA'
  );

  const r3 = evaluate('MEDIO', { ...COMPLETE, 'P-01': 'R3' }, HEALTHY);

  check(
    'reversal: the SAME case with R3 counts r3.1, r3.2 and r3.3 (14) and r2.1 comes out NO_APLICA',
    applicable(r3).length === 14 &&
      verdict(r3, 'op.acc.5.r2.1') === 'NO_APLICA' &&
      ['op.acc.5.r3.1', 'op.acc.5.r3.2', 'op.acc.5.r3.3'].every(
        id => verdict(r3, id) !== 'NO_APLICA'
      ),
    applicable(r3).join(', ')
  );

  const withoutP01 = evaluate('MEDIO', sin(COMPLETE, 'P-01'), HEALTHY);

  check(
    'without P-01 no reinforcement is discarded: all nine count, unproven',
    REINFORCEMENTS.every(id => verdict(withoutP01, id) === 'NO_CUMPLE') &&
      REINFORCEMENTS.every(id => req(withoutP01, id).evidenced === false),
    REINFORCEMENTS.map(id => `${id}=${verdict(withoutP01, id)}`).join(', ')
  );

  check(
    'and the control cannot come out CUMPLE without declaring the mechanism',
    withoutP01.status !== 'CUMPLE'
  );
}

section('2. R1 at MEDIO or ALTO breaches without looking at a log');

{
  for (const level of ['MEDIO', 'ALTO'] as ENSLevel[]) {
    const r1 = evaluate(level, { ...COMPLETE, 'P-01': 'R1' }, []);

    check(
      `${level} + R1: r1.1 and r1.2 MEASURED NO_CUMPLE, without any event`,
      ['op.acc.5.r1.1', 'op.acc.5.r1.2'].every(
        id =>
          verdict(r1, id) === 'NO_CUMPLE' && req(r1, id).evidenced === true
      )
    );

    check(
      `${level} + R1: the motive says R1 is not admissible`,
      req(r1, 'op.acc.5.r1.1').observations.some(text =>
        /R1 \(contraseña sola\).*no figura entre las opciones/.test(text)
      )
    );

    check(
      `${level} + R1: the nonconformity is MEASURED`,
      r1.nonConformities.some(
        nc => nc.requirementId === 'op.acc.5.r1.1' && nc.origin === 'MEDIDA'
      )
    );

    check(
      `${level} + R1: R2, R3 and R4 do not count (13 applicable)`,
      applicable(r1).length === 13,
      applicable(r1).join(', ')
    );
  }

  const low = evaluate('BAJO', { ...COMPLETE, 'P-01': 'R1' }, []);

  check(
    'reversal: BAJO + R1 is not a direct breach (no data: unproven)',
    ['op.acc.5.r1.1', 'op.acc.5.r1.2'].every(
      id => req(low, id).evidenced === false
    ) &&
      !req(low, 'op.acc.5.r1.1').observations.some(text =>
        /no figura entre las opciones/.test(text)
      )
  );

  check(
    'BAJO + R1: R5 does not apply and the base and R1 count (11 applicable)',
    applicable(low).length === 11,
    applicable(low).join(', ')
  );

  const lowR1Healthy = evaluate(
    'BAJO',
    { ...COMPLETE, 'P-01': 'R1' },
    [
      ...HEALTHY.filter(event => event.eventType !== 'external_auth_success'),
      fact('external_auth_success', 'EV-07', { servicio: 'sede', usuario: 'ana', refuerzo: 'R1' }),
      fact('password_policy', 'EV-02', { servicio: 'sede', complejidad: 'activada', longitud_minima: 12 }),
    ]
  );

  check(
    'BAJO + R1 with observed password and complexity rules: r1.1 and r1.2 CUMPLE',
    verdict(lowR1Healthy, 'op.acc.5.r1.1') === 'CUMPLE' &&
      verdict(lowR1Healthy, 'op.acc.5.r1.2') === 'CUMPLE',
    `${verdict(lowR1Healthy, 'op.acc.5.r1.1')} / ${verdict(lowR1Healthy, 'op.acc.5.r1.2')}`
  );

  const lowR1WithoutRules = evaluate(
    'BAJO',
    { ...COMPLETE, 'P-01': 'R1' },
    [
      ...HEALTHY.filter(event => event.eventType !== 'external_auth_success'),
      fact('external_auth_success', 'EV-07', { servicio: 'sede', usuario: 'ana', refuerzo: 'R1' }),
      fact('password_policy', 'EV-02', { servicio: 'sede', complejidad: 'desactivada' }),
    ]
  );

  check(
    'reversal: without complexity rules r1.2 NO_CUMPLE measured',
    verdict(lowR1WithoutRules, 'op.acc.5.r1.2') === 'NO_CUMPLE' &&
      req(lowR1WithoutRules, 'op.acc.5.r1.2').evidenced === true
  );
}

section('3. A well-configured, healthy R2 client at MEDIO complies entirely');

{
  const healthy = evaluate('MEDIO', COMPLETE, HEALTHY);

  check(
    'MEDIO + healthy R2: CUMPLE at 100 %',
    healthy.status === 'CUMPLE' && healthy.score === 100,
    `${healthy.status} ${healthy.score} · ${healthy.requirements
      .filter(item => requirementVerdict(item) === 'NO_CUMPLE')
      .map(item => `${item.id}: ${item.observations.slice(-1)[0] || ''}`)
      .join(' | ')}`
  );

  check(
    'EV-07 CUMPLE and the unchosen reinforcements that share it do not drag it to NO_APLICA',
    evidenceOf(healthy, 'EV-07')?.status === 'CUMPLE',
    evidenceOf(healthy, 'EV-07')?.status
  );

  check(
    'EV-08 (only R3 and R4) comes out NO_APLICA with R2',
    evidenceOf(healthy, 'EV-08')?.status === 'NO_APLICA',
    evidenceOf(healthy, 'EV-08')?.status
  );

  const conR1 = evaluate('MEDIO', COMPLETE, [
    ...HEALTHY,
    fact('external_auth_success', 'EV-07', { servicio: 'sede', usuario: 'luis', refuerzo: 'R1' }),
  ]);

  check(
    'reversal: ONE authentication without OTP brings r2.1 down (measured NO_CUMPLE)',
    verdict(conR1, 'op.acc.5.r2.1') === 'NO_CUMPLE' &&
      req(conR1, 'op.acc.5.r2.1').evidenced === true
  );
}

section('4. op.acc.5.8: configured limit, effective lockout and reactivation');

{
  const base = (events: ENSNormalizedEvent[]) =>
    evaluate('MEDIO', COMPLETE, events);

  check(
    'policy of 5 attempts, P-03=5, streaks of 3 and EV-03 covered without failures: CUMPLE',
    verdict(base(HEALTHY), 'op.acc.5.8') === 'CUMPLE'
  );

  const disabled = base([
    ...HEALTHY.filter(event => event.eventType !== 'lockout_policy'),
    fact('lockout_policy', 'EV-02', { servicio: 'sede', bloqueo: 'desactivado', reactivacion: 'intervencion' }),
  ]);

  check(
    'lockout disabled: MEASURED NO_CUMPLE even though there is no number to compare',
    verdict(disabled, 'op.acc.5.8') === 'NO_CUMPLE' &&
      req(disabled, 'op.acc.5.8').evidenced === true
  );

  const automatic = base([
    ...HEALTHY.filter(event => event.eventType !== 'lockout_policy'),
    fact('lockout_policy', 'EV-02', { servicio: 'sede', bloqueo: 'activado', intentos: 5, reactivacion: 'automatica' }),
  ]);

  check(
    'automatic reactivation by time: NO_CUMPLE',
    verdict(automatic, 'op.acc.5.8') === 'NO_CUMPLE'
  );

  const streak = base([
    ...HEALTHY,
    fact('failed_attempt_streak', 'EV-02', { servicio: 'sede', usuario: 'eve', intentos: 7, bloqueo_registrado: 'si' }),
  ]);

  check(
    'a streak of 7 with P-03=5: NO_CUMPLE',
    verdict(streak, 'op.acc.5.8') === 'NO_CUMPLE'
  );

  const withoutHeartbeat = base(HEALTHY.filter(event => event.eventType !== 'collector_run'));

  check(
    'without heartbeat, EV-03\'s silence is worthless: unproven',
    verdict(withoutHeartbeat, 'op.acc.5.8') === 'NO_CUMPLE' &&
      req(withoutHeartbeat, 'op.acc.5.8').evidenced === false
  );

  const withoutPolicy = base(HEALTHY.filter(event => event.eventType !== 'lockout_policy'));

  check(
    'only small streaks and no policy: unproven (zero failures do not prove a limit)',
    verdict(withoutPolicy, 'op.acc.5.8') === 'NO_CUMPLE' &&
      req(withoutPolicy, 'op.acc.5.8').evidenced === false
  );

  const undeclaredOne = base([
    ...HEALTHY.filter(event => event.eventType !== 'lockout_policy'),
    fact('lockout_policy', 'EV-02', { servicio: 'sede', bloqueo: 'no_declarado', reactivacion: 'desconocida' }),
  ]);

  check(
    'undeclared policy (what the agent emits): the EVIDENCE EV-02 does not come out green either',
    evidenceOf(undeclaredOne, 'EV-02')?.status === 'NO_EVALUABLE',
    evidenceOf(undeclaredOne, 'EV-02')?.status
  );

  const withoutP04 = evaluate('MEDIO', sin(COMPLETE, 'P-04'), HEALTHY);

  check(
    'without P-04 (reactivation procedure) there is no CUMPLE',
    verdict(withoutP04, 'op.acc.5.8') !== 'CUMPLE'
  );
}

section('5. op.acc.5.r5.2: P-09 declares, P-ATT accredits');

{
  const doesNotWarn = evaluate('MEDIO', { ...COMPLETE, 'P-09': false, 'P-ATT': (COMPLETE['P-ATT'] as string[]).filter(row => !row.startsWith('op.acc.5.r5.2')) }, HEALTHY);

  check(
    'P-09 = no: measured NO_CUMPLE',
    verdict(doesNotWarn, 'op.acc.5.r5.2') === 'NO_CUMPLE' &&
      req(doesNotWarn, 'op.acc.5.r5.2').evidenced === true
  );

  const yesWithoutDocument = evaluate('MEDIO', { ...COMPLETE, 'P-ATT': (COMPLETE['P-ATT'] as string[]).filter(row => !row.startsWith('op.acc.5.r5.2')) }, HEALTHY);

  check(
    'P-09 = sí without document: unproven',
    verdict(yesWithoutDocument, 'op.acc.5.r5.2') === 'NO_CUMPLE' &&
      req(yesWithoutDocument, 'op.acc.5.r5.2').evidenced === false
  );

  const withDocument = evaluate('MEDIO', COMPLETE, HEALTHY);

  check(
    'reversal: with the row in P-ATT, documentarily accredited',
    verdict(withDocument, 'op.acc.5.r5.2') === 'CUMPLE' &&
      req(withDocument, 'op.acc.5.r5.2').attested === true
  );
}

section('6. EV-06 and EV-09: findings on P-02 services');

{
  const reveals = evaluate('MEDIO', COMPLETE, [
    ...HEALTHY,
    fact('auth_error_verbose', 'EV-06', { servicio: 'sede', patron: 'usuario_inexistente', mensaje: 'El usuario no existe' }),
  ]);

  check(
    'a revealing rejection on «sede» (declared in P-02): EV-06 and op.acc.5.7 NO_CUMPLE',
    evidenceOf(reveals, 'EV-06')?.status === 'NO_CUMPLE' &&
      verdict(reveals, 'op.acc.5.7') === 'NO_CUMPLE'
  );

  const outside = evaluate('MEDIO', COMPLETE, [
    ...HEALTHY,
    fact('auth_error_verbose', 'EV-06', { servicio: 'intranet', patron: 'usuario_inexistente', mensaje: 'El usuario no existe' }),
  ]);

  check(
    'reversal: the same finding on a service outside P-02 does not count',
    evidenceOf(outside, 'EV-06')?.status === 'CUMPLE'
  );

  const lacuna = evaluate('MEDIO', COMPLETE, [
    ...HEALTHY,
    fact('access_log_gap', 'EV-09', { servicio: 'sede', tipo: 'truncado_sin_rotacion' }),
  ]);

  check(
    'a gap on «sede»: op.acc.5.r5.1 NO_CUMPLE',
    verdict(lacuna, 'op.acc.5.r5.1') === 'NO_CUMPLE'
  );
}

section('7. Without any external access service (wazuh-real and the LDAP today)');

{
  const degradations = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'].map(id =>
    ({
      ...fact('evidence_state', id, {
        causa: 'CONFIGURATION',
        motivo: 'no hay ningun servicio de acceso externo declarado en OPACC5_SERVICIOS',
      }),
      status: 'NO_EVALUABLE',
    })
  );

  const empty = [
    fact('listening_service', undefined, { proceso: 'sshd', direccion: '0.0.0.0', puerto: 22121 }),
    ...degradations,
    heartbeat(''),
  ];

  const result = evaluate('MEDIO', sin({ ...COMPLETE, 'P-01': 'R2' }, 'P-02'), empty);

  const technicalOnes = result.requirements.filter(
    item =>
      requirementVerdict(item) !== 'NO_APLICA' &&
      (item.evidenceIds || []).length > 0
  );

  check(
    'no technical requirement comes out CUMPLE: there is no subject to measure',
    technicalOnes.every(item => requirementVerdict(item) === 'NO_CUMPLE'),
    technicalOnes.map(item => `${item.id}=${requirementVerdict(item)}`).join(', ')
  );

  check(
    'and none as a MEASURED breach: all unproven',
    technicalOnes.every(item => item.evidenced === false)
  );

  check(
    'the configuration nonconformity names P-02',
    result.nonConformities.some(
      nc => nc.id === 'NC-CFG' && nc.parameterIds.includes('P-02')
    )
  );

  check(
    'evidences stay NO_EVALUABLE, none green or red',
    result.evidences
      .filter(evidence => evidence.status !== 'NO_APLICA')
      .every(evidence => evidence.status === 'NO_EVALUABLE'),
    result.evidences.map(evidence => `${evidence.id}=${evidence.status}`).join(', ')
  );

  check(
    'reversal: attested documentary items stay accredited even without a service',
    verdict(result, 'op.acc.5.1') === 'CUMPLE' &&
      req(result, 'op.acc.5.1').attested === true
  );

  check(
    'the control comes out PARCIAL, never CUMPLE',
    result.status === 'PARCIAL',
    `${result.status} ${result.score}`
  );
}

console.log(
  failures.length
    ? `\n${failures.length} check(s) FAIL`
    : '\nall checks pass'
);

process.exit(failures.length ? 1 : 0);
