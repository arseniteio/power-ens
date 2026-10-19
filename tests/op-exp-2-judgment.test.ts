/** op.exp.2: the engine judges the REAL facts of a machine. */
import { opExp2CatalogDefinition } from '../common/ens/catalog/op-exp-2';
import { opExp2Configuration } from '../common/ens/configuration/data/op-exp-2-parameters';
import type { ENSControlConfiguration } from '../common/ens/configuration/types';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';
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

const REALES: string[] = [
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"sca_evaluation\",\"evidence_id\":\"EV-01\",\"requisito\":\"op.exp.2.1,op.exp.2.2,op.exp.2.3\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"politicas\":\"cis_ubuntu24-04\",\"ficheros\":\"cis_ubuntu24-04.yml\",\"ultima_evaluacion\":\"2026-09-16T06:14:25Z\",\"evaluaciones\":1,\"sca_habilitado\":\"yes\",\"sca_intervalo\":\"12h\",\"origen_dato\":\"/var/ossec/logs/ossec.log\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"login_account\",\"evidence_id\":\"EV-02\",\"requisito\":\"op.exp.2.1\",\"plano\":\"sistema\",\"usuario\":\"root\",\"uid\":0,\"shell\":\"/bin/bash\",\"contrasena\":\"bloqueada\",\"claves_ssh\":1,\"origen_dato\":\"/etc/passwd\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"login_account\",\"evidence_id\":\"EV-02\",\"requisito\":\"op.exp.2.1\",\"plano\":\"sistema\",\"usuario\":\"dioni\",\"uid\":1000,\"shell\":\"/bin/bash\",\"contrasena\":\"utilizable\",\"claves_ssh\":1,\"origen_dato\":\"/etc/passwd\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"account_authenticated\",\"evidence_id\":\"EV-02\",\"requisito\":\"op.exp.2.1\",\"plano\":\"sistema\",\"usuario\":\"dioni\",\"canal\":\"ssh\",\"origen\":\"203.0.113.10\",\"metodo\":\"publickey\",\"veces\":2}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"service_exposed\",\"evidence_id\":\"EV-03\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"servicio\":\"systemd-resolve\",\"protocolo\":\"udp\",\"puerto\":\"53\",\"puerto_real\":\"53\",\"exposicion\":\"local\",\"direcciones\":\"127.0.0.54,127.0.0.53%lo\",\"origen_dato\":\"ss\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"service_exposed\",\"evidence_id\":\"EV-03\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"servicio\":\"systemd-network\",\"protocolo\":\"udp\",\"puerto\":\"68\",\"puerto_real\":\"68\",\"exposicion\":\"red\",\"direcciones\":\"62.238.61.123%eth0\",\"origen_dato\":\"ss\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"service_exposed\",\"evidence_id\":\"EV-03\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"servicio\":\"systemd-resolve\",\"protocolo\":\"tcp\",\"puerto\":\"53\",\"puerto_real\":\"53\",\"exposicion\":\"local\",\"direcciones\":\"127.0.0.54,127.0.0.53%lo\",\"origen_dato\":\"ss\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"service_exposed\",\"evidence_id\":\"EV-03\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"servicio\":\"sshd\",\"protocolo\":\"tcp\",\"puerto\":\"22121\",\"puerto_real\":\"22121\",\"exposicion\":\"red\",\"direcciones\":\"0.0.0.0,::\",\"origen_dato\":\"ss\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"ssh_permitrootlogin\",\"desviacion\":\"wazuh-real:ssh_permitrootlogin\",\"valor\":\"without-password\",\"esperado\":\"no\",\"origen_dato\":\"sshd -T\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"ssh_x11forwarding\",\"desviacion\":\"wazuh-real:ssh_x11forwarding\",\"valor\":\"yes\",\"esperado\":\"no\",\"origen_dato\":\"sshd -T\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"ssh_macs_debiles\",\"desviacion\":\"wazuh-real:ssh_macs_debiles\",\"valor\":\"umac-64-etm@openssh.com,hmac-sha1-etm@openssh.com,umac-64@openssh.com,hmac-sha1\",\"esperado\":\"sin MD5, SHA-1 ni umac-64\",\"origen_dato\":\"sshd -T\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"permisos:/etc/ssh/sshd_config\",\"desviacion\":\"wazuh-real:permisos:/etc/ssh/sshd_config\",\"valor\":\"644\",\"esperado\":\"600 o mas restrictivo\",\"origen_dato\":\"stat\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"permisos:/etc/crontab\",\"desviacion\":\"wazuh-real:permisos:/etc/crontab\",\"valor\":\"644\",\"esperado\":\"600 o mas restrictivo\",\"origen_dato\":\"stat\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"virtualization_role\",\"evidence_id\":\"EV-05\",\"requisito\":\"op.exp.2.4\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"rol\":\"vm\",\"plataforma\":\"kvm\",\"fabricante\":\"Hetzner\",\"producto\":\"vServer\",\"origen_dato\":\"systemd-detect-virt\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"evidence_state\",\"evidence_id\":\"EV-06\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"estado\":\"NO_EVALUABLE\",\"causa\":\"CONFIGURATION\",\"motivo\":\"no se ha declarado acceso de solo lectura a la API de Wazuh (OPEXP2_API_URL, OPEXP2_API_USER, OPEXP2_API_PASSWORD): la puntuacion SCA de esta maquina solo la guarda el manager y el motor no la lee del indice\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"collector_run\",\"resultado\":\"completada\",\"evidencias_cubiertas\":\"EV-02,EV-04,EV-05\",\"evidencias_miradas\":\"EV-01,EV-02,EV-03,EV-04,EV-05\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"plano\":\"sistema\",\"emisor\":\"recolector\"}",
];

const NOW = new Date('2026-09-16T18:00:00Z');

const RULE_ID: Record<string, string> = {
  sca_evaluation: '110301',
  login_account: '110302',
  account_authenticated: '110303',
  service_exposed: '110304',
  insecure_default: '110305',
  virtualization_role: '110306',
  sca_score: '110307',
  evidence_state: '110350',
  collector_run: '110390',
};

const alerts = (lines: string[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lines.map((line, i) => {
      const data = JSON.parse(line);

      return {
        _id: `op-exp-2-${i}`,
        _source: {
          '@timestamp': data.ts,
          agent: { id: '024', name: 'wazuh-real' },
          rule: { id: RULE_ID[data.event] || '110300' },
          location: '/var/log/ensfacil/op_exp_2.json',
          data,
        },
      };
    })
  );

const withoutEvent = (event: string): string[] =>
  REALES.filter(line => JSON.parse(line).event !== event);

const withEvent = (extra: Record<string, unknown>): string[] => [
  ...REALES,
  JSON.stringify({
    ensfacil: 'op.exp.2',
    ts: '2026-09-16T16:19:55Z',
    host: 'wazuh-real',
    ...extra,
  }),
];

type Value = string[] | number | undefined;

const VALUES: Record<string, Value> = {
  'P-01': ['wazuh-real | cis_ubuntu24-04'],
  'P-02': ['wazuh-real | sshd,systemd-resolve,systemd-network | 22121,53,68'],
  'P-03': [
    'admin | Zimbra',
    'ubuntu | imagen cloud de Ubuntu',
    'sa | SQL Server',
  ],
  'P-04': ['ninguno | ninguna | Sin excepciones autorizadas'],
  'P-05': 90,
  'P-06': ['hetzner-cloud | wazuh-real | acreditación del proveedor (referencia)'],
};

const configuration = (
  changesList: Record<string, Value> = {}
): ENSControlConfiguration => {
  const values = { ...VALUES, ...changesList };

  return {
    ...opExp2Configuration,
    parameters: opExp2Configuration.parameters.map(parameter => ({
      ...parameter,
      value: values[parameter.id] as string[] | number | undefined,
    })),
  };
};

const evidences = (
  lines: string[] = REALES,
  changesList: Record<string, Value> = {}
): Map<string, ENSEvidenceResolved> =>
  new Map(
    resolveEvidenceForControl(
      'op.exp.2',
      alerts(lines),
      '024',
      'BAJO',
      configuration(changesList),
      NOW
    ).map(evidence => [evidence.id, evidence])
  );

const estado = (
  e: Map<string, ENSEvidenceResolved>,
  id: string
): string => `${e.get(id)?.status}`;

const motive = (
  e: Map<string, ENSEvidenceResolved>,
  id: string
): string => (e.get(id)?.observations || []).join(' | ');

section('1. wazuh-real as it is, with the proposed configuration');

{
  const e = evidences();

  check(
    'EV-01 CUMPLE: evaluates cis_ubuntu24-04, the one P-01 assigns it',
    estado(e, 'EV-01') === 'CUMPLE',
    motive(e, 'EV-01')
  );
  check(
    'EV-02 CUMPLE: root and dioni are not standard accounts in P-03',
    estado(e, 'EV-02') === 'CUMPLE',
    motive(e, 'EV-02')
  );
  check(
    'EV-03 CUMPLE: its four exposed functions are justified',
    estado(e, 'EV-03') === 'CUMPLE',
    motive(e, 'EV-03')
  );
  check(
    'EV-04 NO_CUMPLE: five insecure defaults without exception',
    estado(e, 'EV-04') === 'NO_CUMPLE',
    motive(e, 'EV-04')
  );
  check(
    'EV-04 names the deviation, not «algo falló»',
    motive(e, 'EV-04').includes('wazuh-real:ssh_permitrootlogin'),
    motive(e, 'EV-04')
  );
  check(
    'EV-05 CUMPLE: the VM is in the inventory',
    estado(e, 'EV-05') === 'CUMPLE',
    motive(e, 'EV-05')
  );
  check(
    'EV-06 NO_EVALUABLE: without an API no score arrives',
    estado(e, 'EV-06') === 'NO_EVALUABLE',
    motive(e, 'EV-06')
  );
  check(
    'EV-06 never CUMPLE by silence, not even with confirmed heartbeat',
    e.get('EV-06')?.gapCause === 'COLLECTION',
    `${e.get('EV-06')?.gapCause}`
  );
  check(
    'the deciding fact\'s rule travels in the trace (EV-04 → 110305)',
    (e.get('EV-04')?.relatedRules || []).includes('110305'),
    (e.get('EV-04')?.relatedRules || []).join(',')
  );
}

section('2. The four requirements, with the whole engine');

{
  const events = alerts(REALES);
  const resolved = resolveEvidenceForControl(
    'op.exp.2',
    events,
    '024',
    'BAJO',
    configuration(),
    NOW
  );
  const result = evaluateENSControl(
    opExp2CatalogDefinition,
    configuration(),
    'BAJO',
    resolved,
    undefined,
    events
  );
  const requirement = (id: string) =>
    result.requirements.find(item => item.id === id);

  check(
    'the control is ACTIVE',
    opExp2CatalogDefinition.status === 'ACTIVE'
  );
  check(
    'op.exp.2.1 CUMPLE (EV-01 and EV-02 green)',
    requirement('op.exp.2.1')?.status === 'CUMPLE',
    `${requirement('op.exp.2.1')?.status}`
  );
  check(
    'op.exp.2.2 NO_CUMPLE and NOT evidenced: EV-06 is missing',
    requirement('op.exp.2.2')?.status === 'NO_CUMPLE' &&
      requirement('op.exp.2.2')?.evidenced === false,
    `${requirement('op.exp.2.2')?.status} evidenced=${requirement('op.exp.2.2')?.evidenced}`
  );
  check(
    'op.exp.2.3 NO_CUMPLE and evidenced: EV-04 measured and failed',
    requirement('op.exp.2.3')?.status === 'NO_CUMPLE' &&
      requirement('op.exp.2.3')?.evidenced === true,
    `${requirement('op.exp.2.3')?.status} evidenced=${requirement('op.exp.2.3')?.evidenced}`
  );
  check(
    'op.exp.2.4 CUMPLE',
    requirement('op.exp.2.4')?.status === 'CUMPLE',
    `${requirement('op.exp.2.4')?.status}`
  );
  check(
    'P-07 and P-ATT do not block the evaluation: they are not mandatory',
    !opExp2Configuration.parameters.some(
      parameter =>
        ['P-07', 'P-ATT'].includes(parameter.id) && parameter.required
    )
  );

  const withoutThreshold = evaluateENSControl(
    opExp2CatalogDefinition,
    configuration({ 'P-05': undefined }),
    'BAJO',
    resolved,
    undefined,
    events
  );
  check(
    'reversal: without a mandatory parameter, op.exp.2.1 stops COMPLYING',
    withoutThreshold.requirements.find(item => item.id === 'op.exp.2.1')?.status ===
      'NO_CUMPLE'
  );
}

section('3. P-03 decides which account is standard, not the agent');

{
  const withRoot = evidences(REALES, { 'P-03': ['root | Linux'] });

  check(
    'root in P-03 → EV-02 NO_CUMPLE naming root',
    estado(withRoot, 'EV-02') === 'NO_CUMPLE' &&
      motive(withRoot, 'EV-02').includes("'root'"),
    motive(withRoot, 'EV-02')
  );
  check(
    'ROOT in upper case counts the same (forbidden list)',
    estado(evidences(REALES, { 'P-03': ['ROOT | Linux'] }), 'EV-02') ===
      'NO_CUMPLE'
  );
  check(
    'reversal: without root it goes back to CUMPLE',
    estado(evidences(), 'EV-02') === 'CUMPLE'
  );
  check(
    'an authentication with a standard account also breaches',
    estado(
      evidences(
        withEvent({
          event: 'account_authenticated',
          evidence_id: 'EV-02',
          usuario: 'admin',
          canal: 'ssh',
        })
      ),
      'EV-02'
    ) === 'NO_CUMPLE'
  );

  const withoutP03 = evidences(REALES, { 'P-03': undefined });
  check(
    'without P-03 → NO_EVALUABLE by CONFIGURATION',
    estado(withoutP03, 'EV-02') === 'NO_EVALUABLE' &&
      withoutP03.get('EV-02')?.gapCause === 'CONFIGURATION',
    `${estado(withoutP03, 'EV-02')} ${withoutP03.get('EV-02')?.gapCause}`
  );
}

section('4. P-02: minimum functionality');

{
  const withoutDhcp = evidences(REALES, {
    'P-02': ['wazuh-real | sshd,systemd-resolve | 22121,53'],
  });

  check(
    'without systemd-network or 68 justified → EV-03 NO_CUMPLE naming it',
    estado(withoutDhcp, 'EV-03') === 'NO_CUMPLE' &&
      motive(withoutDhcp, 'EV-03').includes('systemd-network'),
    motive(withoutDhcp, 'EV-03')
  );
  check(
    'the port counts too: sshd justified on 22 and not on 22121 → NO_CUMPLE',
    estado(
      evidences(REALES, {
        'P-02': ['wazuh-real | sshd,systemd-resolve,systemd-network | 22,53,68'],
      }),
      'EV-03'
    ) === 'NO_CUMPLE'
  );

  const otherProfile = evidences(REALES, { 'P-02': ['srv-web | nginx | 443'] });
  check(
    'a row of ANOTHER profile does not decide for this machine → NO_EVALUABLE CONFIGURATION',
    estado(otherProfile, 'EV-03') === 'NO_EVALUABLE' &&
      otherProfile.get('EV-03')?.gapCause === 'CONFIGURATION',
    `${estado(otherProfile, 'EV-03')} ${otherProfile.get('EV-03')?.gapCause}`
  );
  check(
    'reversal: with the complete row, CUMPLE',
    estado(evidences(), 'EV-03') === 'CUMPLE'
  );
}

section('5. P-04: exceptions are per machine');

{
  const allOnes = [
    'ssh_permitrootlogin',
    'ssh_x11forwarding',
    'ssh_macs_debiles',
    'permisos:/etc/ssh/sshd_config',
    'permisos:/etc/crontab',
  ];

  check(
    'the five authorized for wazuh-real → EV-04 CUMPLE',
    estado(
      evidences(REALES, {
        'P-04': allOnes.map(c => `wazuh-real | wazuh-real:${c} | prueba`),
      }),
      'EV-04'
    ) === 'CUMPLE'
  );
  check(
    'the same authorized for ANOTHER machine do not excuse this one → NO_CUMPLE',
    estado(
      evidences(REALES, {
        'P-04': allOnes.map(c => `otra | otra:${c} | prueba`),
      }),
      'EV-04'
    ) === 'NO_CUMPLE'
  );
  check(
    'without deviations, with heartbeat and «ninguna» declared → CUMPLE',
    estado(evidences(withoutEvent('insecure_default')), 'EV-04') === 'CUMPLE'
  );
  check(
    'without deviations and WITHOUT heartbeat → NO_EVALUABLE (no record that it was looked at)',
    estado(
      evidences(
        withoutEvent('insecure_default').filter(
          line => JSON.parse(line).event !== 'collector_run'
        )
      ),
      'EV-04'
    ) === 'NO_EVALUABLE'
  );
}

section('6. P-01: the assigned baseline');

{
  check(
    'assigned cis_ubuntu22-04 and evaluates 24-04 → EV-01 NO_CUMPLE',
    estado(
      evidences(REALES, { 'P-01': ['wazuh-real | cis_ubuntu22-04'] }),
      'EV-01'
    ) === 'NO_CUMPLE'
  );
  check(
    'two assigned and it evaluates one → NO_CUMPLE (the set is compared)',
    estado(
      evidences(REALES, {
        'P-01': ['wazuh-real | cis_ubuntu24-04,ensfacil_extra'],
      }),
      'EV-01'
    ) === 'NO_CUMPLE'
  );
  check(
    'without a row for the profile → NO_EVALUABLE CONFIGURATION',
    evidences(REALES, { 'P-01': ['otro | cis_ubuntu24-04'] }).get('EV-01')
      ?.gapCause === 'CONFIGURATION'
  );
}

section('7. P-05: the SCA score is judged by the engine');

{
  const withScore = withEvent({
    event: 'sca_score',
    evidence_id: 'EV-06',
    perfil: 'wazuh-real',
    politica: 'cis_ubuntu24-04',
    puntuacion: 49,
  });

  check(
    '49 with threshold 90 → EV-06 NO_CUMPLE',
    estado(evidences(withScore), 'EV-06') === 'NO_CUMPLE'
  );
  check(
    'the SAME event with threshold 45 → CUMPLE',
    estado(evidences(withScore, { 'P-05': 45 }), 'EV-06') === 'CUMPLE'
  );
  check(
    'a drop in the series below the threshold breaches even if the last one rises',
    estado(
      evidences(
        [
          ...withScore,
          JSON.stringify({
            ensfacil: 'op.exp.2',
            ts: '2026-09-16T17:00:00Z',
            event: 'sca_score',
            evidence_id: 'EV-06',
            politica: 'cis_ubuntu24-04',
            puntuacion: 95,
          }),
        ],
        { 'P-05': 60 }
      ),
      'EV-06'
    ) === 'NO_CUMPLE'
  );
}

section('8. P-06: virtualization inventory');

{
  check(
    'the VM outside the inventory → EV-05 NO_CUMPLE',
    estado(evidences(REALES, { 'P-06': ['pve01 | otra-vm | agente pve01'] }), 'EV-05') ===
      'NO_CUMPLE'
  );

  const withoutP06 = evidences(REALES, { 'P-06': undefined });
  check(
    'without P-06 → EV-05 NO_EVALUABLE by CONFIGURATION',
    estado(withoutP06, 'EV-05') === 'NO_EVALUABLE' &&
      withoutP06.get('EV-05')?.gapCause === 'CONFIGURATION'
  );

  const events = alerts(REALES);
  const withoutInventory = evaluateENSControl(
    opExp2CatalogDefinition,
    configuration({ 'P-06': undefined }),
    'BAJO',
    resolveEvidenceForControl('op.exp.2', events, '024', 'BAJO', configuration({ 'P-06': undefined }), NOW),
    undefined,
    events
  );
  check(
    'without P-06, op.exp.2.4 NO_CUMPLE not evidenced and op.exp.2.1 stays CUMPLE',
    withoutInventory.requirements.find(r => r.id === 'op.exp.2.4')?.evidenced === false &&
      withoutInventory.requirements.find(r => r.id === 'op.exp.2.1')?.status === 'CUMPLE',
    withoutInventory.requirements.map(r => `${r.id}=${r.status}`).join(' ')
  );
  check(
    'a physical machine (no fact) with heartbeat and declared inventory → CUMPLE',
    estado(
      evidences(withoutEvent('virtualization_role'), {
        'P-06': ['pve01 | srv-bd01 | agente pve01'],
      }),
      'EV-05'
    ) === 'CUMPLE'
  );
}

section('9. EV-07 does not pretend to measure what cannot be observed');

{
  check(
    'EV-07 NO_EVALUABLE',
    estado(evidences(), 'EV-07') === 'NO_EVALUABLE'
  );
  check(
    'and no requirement declares it',
    !opExp2CatalogDefinition.requirements.some(requirement =>
      requirement.evidenceIds.includes('EV-07')
    )
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
