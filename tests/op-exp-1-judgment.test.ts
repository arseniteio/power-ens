/** op.exp.1: asset inventory; the engine judges the agent's inventory against the organization's declaration. */
import { opExp1CatalogDefinition } from '../common/ens/catalog/op-exp-1';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../common/ens/configuration/types';
import { opExp1Configuration } from '../common/ens/configuration/data/op-exp-1-parameters';
import { validateControlConfiguration } from '../common/ens/configuration/services/validation-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';
import { evaluateRequirements } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';
import { buildOpExp1ReportModel } from '../public/ens/reports/op-exp-1-report-model';

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

const RULE: Record<string, string> = {
  asset_system: '110201',
  software_inventory: '110202',
  network_inventory: '110203',
  agent_status: '110204',
  network_host_observed: '110205',
  asset_software_change: '110206',
  asset_hardware_change: '110207',
  asset_port_opened: '110208',
  asset_port_closed: '110209',
  inventory_review: '110210',
  evidence_state: '110295',
  collector_run: '110299',
};

const WAZUH_REAL = [
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"asset_system","evidence_id":"EV-01,EV-07","requisito":"op.exp.1.1","activo":"wazuh-real","fqdn":"wazuh-real","sistema_operativo":"Ubuntu","version_so":"24.04.4 LTS (Noble Numbat)","kernel":"6.8.0-111-generic","arquitectura":"x86_64","fabricante":"Hetzner","modelo":"vServer","num_serie":"156475036","virtualizacion":"kvm","cpu_modelo":"AMD EPYC-Rome Processor","cpus":2,"memoria_mb":3840}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"software_inventory","evidence_id":"EV-02","requisito":"op.exp.1.1,op.exp.1.r4.1","activo":"wazuh-real","gestor":"dpkg","paquetes":570,"snaps":0,"huella":"a9248bce0c39db8bcf3d85b904587b0ec4b7bfd2d822772ed18f8f223f940236","linea_base":"no","altas":0,"bajas":0,"actualizaciones":0}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"network_inventory","evidence_id":"EV-03","requisito":"op.exp.1.1","activo":"wazuh-real","interfaces":"eth0","direcciones":"eth0=62.238.61.123/32,eth0=2a01:4f9:c015:2f44::1/64","puertos_escucha":7,"servicios":"sshd/tcp/22121,systemd-network/udp/68,systemd-resolve/tcp/53,systemd-resolve/udp/53","procesos":137}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"agent_status","evidence_id":"EV-04","requisito":"op.exp.1.1,op.exp.1.r2.1","activo":"wazuh-real","estado_agente":"connected","mensajes_en_buffer":0,"version_agente":"4.14.5","gestor":"89.167.83.18","ultimo_keepalive":"2026-09-16T16:16:01Z","ultimo_ack":"2026-09-16T16:16:01Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"network_host_observed","evidence_id":"EV-05","requisito":"op.exp.1.1","activo":"wazuh-real","ip":"172.31.1.1","mac":"d2:74:7f:6e:37:e3","interfaz":"eth0","estado_vecino":"REACHABLE","es_pasarela":"si","primera_observacion":"2026-09-16T16:15:53Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"inventory_review","evidence_id":"EV-06","requisito":"op.exp.1.1","activo":"wazuh-real","fecha":"2026-09-10","alcance":"inventario completo","responsable":"rsis"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"collector_run","resultado":"completada","evidencias_cubiertas":"EV-05","fuentes_leidas":"EV-01,EV-07,EV-02,EV-03,EV-04,EV-05,EV-06","cambios_emitidos":0,"perfil":"linux","emisor":"recolector"}',
];

const LDAP_REAL = [
  '{"ensfacil":"op.exp.1","ts":"2026-09-17T09:14:52Z","host":"ldapserver.qsprueba.com","event":"asset_system","evidence_id":"EV-01,EV-07","requisito":"op.exp.1.1","activo":"ldapserver","fqdn":"ldapserver.qsprueba.com","sistema_operativo":"Ubuntu","version_so":"22.04.5 LTS (Jammy Jellyfish)","kernel":"6.8.0-138-generic","arquitectura":"x86_64","fabricante":"innotek GmbH","modelo":"VirtualBox","num_serie":"0","virtualizacion":"oracle","cpu_modelo":"Intel(R) Core(TM) 5 120U","cpus":2,"memoria_mb":1920,"plano":"sistema"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-17T09:14:53Z","host":"ldapserver.qsprueba.com","event":"software_inventory","evidence_id":"EV-02","requisito":"op.exp.1.1,op.exp.1.r4.1","activo":"ldapserver","gestor":"dpkg","paquetes":1915,"snaps":11,"huella":"2de0f51fe32a8f74a30fe2c5599af6da5c1d9f5da1e94b67edc1f692e4106166","linea_base":"si","altas":0,"bajas":0,"actualizaciones":0,"plano":"sistema,directorio","paquetes_producto":155,"ficheros_fuera_de_gestor":3,"directorio_paquete":"zimbra-openldap-server","directorio_version":"2.5.17-1zimbra10.0b2.22.04"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-17T09:14:54Z","host":"ldapserver.qsprueba.com","event":"network_inventory","evidence_id":"EV-03","requisito":"op.exp.1.1","activo":"ldapserver","interfaces":"enp0s3,enp0s8,tailscale0","direcciones":"enp0s3=10.0.2.15/24,enp0s3=fd17:625c:f037:2:abe8:c0cd:2c1c:f146/64,enp0s3=fd17:625c:f037:2:a00:27ff:fed9:7535/64,enp0s8=192.168.10.10/24,tailscale0=100.103.116.27/32,tailscale0=fd7a:115c:a1e0::3832:741c/128","puertos_escucha":12,"servicios":"avahi-daemon/udp/5353,cupsd/tcp/631,java/tcp/7171,slapd/tcp/389,sshd/tcp/22,systemd-resolve/tcp/53,systemd-resolve/udp/53,tailscaled/tcp/34897,tailscaled/tcp/61865","procesos":237,"plano":"sistema,directorio","directorio_servicio":"slapd","directorio_binario":"/opt/zimbra/common/libexec/slapd","directorio_paquete":"zimbra-openldap-server","directorio_version":"2.5.17-1zimbra10.0b2.22.04","directorio_en_ejecucion":"si","directorio_usuario":"zimbra","directorio_escucha":"ldap://ldapserver.qsprueba.com:389 ldapi:///","directorio_sufijo":"{2}mdb:(raiz)","directorio_dominios":"dc=com|dc=ldapserver,dc=qsprueba,dc=com|dc=qsprueba,dc=com|dc=quersysprueba,dc=com|dc=replica|dc=test,dc=replica","directorio_responde":"si","directorio_config":"/opt/zimbra/data/ldap/config/cn=config"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-17T09:14:54Z","host":"ldapserver.qsprueba.com","event":"agent_status","evidence_id":"EV-04","requisito":"op.exp.1.1,op.exp.1.r2.1","activo":"ldapserver","estado_agente":"connected","mensajes_en_buffer":0,"version_agente":"4.14.5","gestor":"89.167.83.18","ultimo_keepalive":"2026-09-17T09:14:45Z","ultimo_ack":"2026-09-17T09:14:45Z","plano":"sistema"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-17T09:14:54Z","host":"ldapserver.qsprueba.com","event":"network_host_observed","evidence_id":"EV-05","requisito":"op.exp.1.1","activo":"ldapserver","ip":"10.0.2.2","mac":"52:54:00:12:35:00","interfaz":"enp0s3","estado_vecino":"REACHABLE","es_pasarela":"si","primera_observacion":"2026-09-17T09:14:54Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-17T09:14:54Z","host":"ldapserver.qsprueba.com","event":"network_host_observed","evidence_id":"EV-05","requisito":"op.exp.1.1","activo":"ldapserver","ip":"10.0.2.3","mac":"52:54:00:12:35:00","interfaz":"enp0s3","estado_vecino":"REACHABLE","es_pasarela":"no","primera_observacion":"2026-09-17T09:14:54Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-17T09:14:54Z","host":"ldapserver.qsprueba.com","event":"network_host_observed","evidence_id":"EV-05","requisito":"op.exp.1.1","activo":"ldapserver","ip":"fd17:625c:f037:2::2","mac":"52:54:00:12:35:00","interfaz":"enp0s3","estado_vecino":"STALE","es_pasarela":"no","primera_observacion":"2026-09-17T09:14:54Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-17T09:14:54Z","host":"ldapserver.qsprueba.com","event":"evidence_state","evidence_id":"EV-06","requisito":"op.exp.1.1","estado":"NO_EVALUABLE","causa":"CONFIGURATION","motivo":"no consta ningun registro de revision del inventario en /etc/ensfacil/opexp1-ldap-revisiones.tsv"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-17T09:14:54Z","host":"ldapserver.qsprueba.com","event":"collector_run","resultado":"completada","evidencias_cubiertas":"EV-05","fuentes_leidas":"EV-01,EV-07,EV-02,EV-03,EV-04,EV-05","cambios_emitidos":0,"perfil":"ldap","planos_mirados":"sistema,directorio","emisor":"recolector"}',
];

const SIN_REVISION =
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:15:53Z","host":"wazuh-real","event":"evidence_state","evidence_id":"EV-06","requisito":"op.exp.1.1","estado":"NO_EVALUABLE","causa":"CONFIGURATION","motivo":"no consta ningun registro de revision del inventario en /etc/ensfacil/opexp1-revisiones.tsv"}';

let counter = 0;

const indexes = (
  lineas: string[],
  agent = { id: '024', name: 'wazuh-real' }
): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas.map(linea => {
      const data = JSON.parse(linea);

      counter += 1;

      return {
        _id: `op-exp-1-${counter}`,
        _source: {
          '@timestamp': data.ts,
          agent: agent,
          rule: {
            id: RULE[data.event],
            description: `op.exp.1 · ${data.event}`,
          },
          data,
        },
      };
    })
  );

const withoutEvent = (lineas: string[], event: string): string[] =>
  lineas.filter(linea => JSON.parse(linea).event !== event);

type Valores = Record<string, ENSControlParameter['value'] | undefined>;

const CORRECT_VALUES: Valores = {
  'P-01': ['wazuh-real | Responsable de Sistemas | Resp. Sistemas | HW servidor'],
  'P-02': ['gw-proveedor | router | 172.31.1.1 | Proveedor de hosting'],
  'P-03': ['HW servidor', 'HW red', 'SW base', 'servicio'],
  'P-04': 90,
  'P-08': 24,
};

const configuration = (valores: Valores): ENSControlConfiguration => ({
  ...opExp1Configuration,
  parameters: opExp1Configuration.parameters.map(parameter => {
    const { value: _discarded, ...rest } = parameter as ENSControlParameter;

    return valores[parameter.id] === undefined
      ? (rest as ENSControlParameter)
      : ({ ...rest, value: valores[parameter.id] } as ENSControlParameter);
  }),
});

const con = (changesList: Valores): Valores => ({
  ...CORRECT_VALUES,
  ...changesList,
});

const NOW = new Date('2026-09-16T18:00:00Z');

const resolves = (
  lineas: string[],
  valores: Valores,
  now: Date = NOW,
  agent = { id: '024', name: 'wazuh-real' }
): Map<string, ENSEvidenceResolved> =>
  new Map(
    resolveEvidenceForControl(
      'op.exp.1',
      indexes(lineas, agent),
      agent.id,
      'MEDIO',
      configuration(valores),
      now
    ).map(evidence => [evidence.id, evidence])
  );

const text = (evidence?: ENSEvidenceResolved): string =>
  (evidence?.observations || []).join(' | ');

section('1. Only op.exp.1.1 scores, the same in the three categories');

{
  const base = opExp1CatalogDefinition.requirements.find(
    requirement => requirement.id === 'op.exp.1.1'
  );

  check(
    'op.exp.1.1 applies at BAJO, MEDIO and ALTO (BÁSICA, MEDIA and ALTA)',
    JSON.stringify(base?.applicability.levels) === '["BAJO","MEDIO","ALTO"]'
  );

  const reinforcements = opExp1CatalogDefinition.requirements.filter(
    requirement => requirement.kind === 'REFUERZO'
  );

  check(
    'the four reinforcements exist and none declares a level',
    reinforcements.length === 4 &&
      reinforcements.every(requirement => requirement.applicability.levels.length === 0),
    reinforcements.map(requirement => requirement.id).join(', ')
  );

  for (const level of ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]) {
    const results = evaluateRequirements(
      opExp1CatalogDefinition.requirements,
      level,
      [],
      false,
      [],
      'ACTIVE'
    );

    const applicable = results.filter(result => result.applicable);

    check(
      `${level} · the only applicable requirement is op.exp.1.1`,
      applicable.length === 1 && applicable[0].id === 'op.exp.1.1',
      applicable.map(result => result.id).join(', ')
    );
  }

  check(
    'the seven evidences declare judgment (whole new model)',
    ENSEvidenceCatalog.filter(
      evidence => evidence.controlId === 'op.exp.1' && evidence.judgment
    ).length === 7
  );
}

section('2. wazuh-real with the organization declared: the seven COMPLY');

{
  const evidences = resolves(WAZUH_REAL, CORRECT_VALUES);

  for (const id of ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07']) {
    check(
      `${id} · CUMPLE`,
      evidences.get(id)?.status === 'CUMPLE',
      `${evidences.get(id)?.status}: ${text(evidences.get(id))}`
    );
  }

  check(
    'EV-07 carries rule 110201 and the event that decides it',
    Boolean(
      evidences.get('EV-07')?.relatedRules.includes('110201') &&
        evidences.get('EV-07')?.resolvedRuleId === '110201'
    )
  );

  const validation = validateControlConfiguration(
    configuration(CORRECT_VALUES),
    'MEDIO'
  );

  const requirements = evaluateRequirements(
    opExp1CatalogDefinition.requirements,
    'MEDIO',
    Array.from(evidences.values()),
    validation.missingRequired.length + validation.invalidRequired.length > 0,
    [],
    'ACTIVE'
  );

  const control = evaluateControlStatus(requirements);

  check(
    'op.exp.1.1 CUMPLE and the control comes out at 100 %',
    requirements.find(requirement => requirement.id === 'op.exp.1.1')?.status ===
      'CUMPLE' && control.status === 'CUMPLE',
    `${control.status} ${control.score}`
  );
}

section('3. EV-07 · an observed asset without a row in P-01 does not comply');

{
  const withoutRow = resolves(
    WAZUH_REAL,
    con({ 'P-01': ['srv-otro | Responsable | Rol | HW servidor'] })
  ).get('EV-07');

  check(
    'without wazuh-real in P-01 · NO_CUMPLE (measured, not a gap)',
    withoutRow?.status === 'NO_CUMPLE',
    String(withoutRow?.status)
  );

  check(
    'the motive names the asset',
    text(withoutRow).includes("'wazuh-real'"),
    text(withoutRow)
  );

  check(
    'reversal · with the row it goes back to CUMPLE',
    resolves(WAZUH_REAL, CORRECT_VALUES).get('EV-07')?.status === 'CUMPLE'
  );

  check(
    'the comparison is case-sensitive (Wazuh-Real does not authorize wazuh-real)',
    resolves(
      WAZUH_REAL,
      con({ 'P-01': ['Wazuh-Real | Responsable | Rol | HW servidor'] })
    ).get('EV-07')?.status === 'NO_CUMPLE'
  );

  const withoutP01 = resolves(WAZUH_REAL, con({ 'P-01': undefined })).get('EV-07');

  check(
    'P-01 unconfigured · NO_EVALUABLE with cause CONFIGURATION, never CUMPLE',
    withoutP01?.status === 'NO_EVALUABLE' && withoutP01?.gapCause === 'CONFIGURATION',
    `${withoutP01?.status} ${withoutP01?.gapCause}`
  );

  const withoutOwner = validateControlConfiguration(
    configuration(con({ 'P-01': ['wazuh-real |  | Rol | HW servidor'] })),
    'MEDIO'
  );

  check(
    'a row without owner leaves P-01 invalid',
    withoutOwner.invalidRequired.some(parameter => parameter.id === 'P-01'),
    withoutOwner.issues.map(issue => issue.reason).join('; ')
  );

  const withoutNature = validateControlConfiguration(
    configuration(con({ 'P-01': ['wazuh-real | Responsable | Rol'] })),
    'MEDIO'
  );

  check(
    'a row without nature leaves P-01 invalid',
    withoutNature.invalidRequired.some(parameter => parameter.id === 'P-01')
  );

  check(
    'reversal · the complete row is valid',
    validateControlConfiguration(configuration(CORRECT_VALUES), 'MEDIO')
      .invalidRequired.length === 0
  );

  const requirement = evaluateRequirements(
    opExp1CatalogDefinition.requirements,
    'MEDIO',
    Array.from(resolves(WAZUH_REAL, CORRECT_VALUES).values()),
    true,
    [],
    'ACTIVE'
  ).find(result => result.id === 'op.exp.1.1');

  check(
    'with P-01 invalid op.exp.1.1 does NOT COMPLY even though the seven evidences are green',
    requirement?.status === 'NO_CUMPLE',
    String(requirement?.status)
  );
}

section('4. EV-05 · a neighbour host not declared in P-02 does not comply');

{
  const undeclared2 = resolves(
    WAZUH_REAL,
    con({ 'P-02': ['impresora-01 | impresora | 10.0.0.9 | Oficina'] })
  ).get('EV-05');

  check(
    'the gateway 172.31.1.1 outside P-02 · NO_CUMPLE naming the IP',
    undeclared2?.status === 'NO_CUMPLE' && text(undeclared2).includes('172.31.1.1'),
    text(undeclared2)
  );

  check(
    'reversal · declared in P-02 goes back to CUMPLE',
    resolves(WAZUH_REAL, CORRECT_VALUES).get('EV-05')?.status === 'CUMPLE'
  );

  const onlyName = resolves(
    WAZUH_REAL,
    con({ 'P-02': ['sai-01 | SAI |  | Mantenimiento'] })
  ).get('EV-05');

  check(
    'P-02 without any IP · NO_EVALUABLE by configuration (nothing to compare against)',
    onlyName?.status === 'NO_EVALUABLE' && onlyName?.gapCause === 'CONFIGURATION',
    `${onlyName?.status} ${onlyName?.gapCause}`
  );

  const silence = resolves(
    withoutEvent(WAZUH_REAL, 'network_host_observed'),
    CORRECT_VALUES
  ).get('EV-05');

  check(
    'without neighbours and with the heartbeat covering EV-05 · CUMPLE (it is a sweep)',
    silence?.status === 'CUMPLE',
    text(silence)
  );

  const withoutHeartbeat = resolves(
    withoutEvent(withoutEvent(WAZUH_REAL, 'network_host_observed'), 'collector_run'),
    CORRECT_VALUES
  ).get('EV-05');

  check(
    'reversal · the same silence without a heartbeat · NO_EVALUABLE (COLLECTION)',
    withoutHeartbeat?.status === 'NO_EVALUABLE' && withoutHeartbeat?.gapCause === 'COLLECTION',
    `${withoutHeartbeat?.status} ${withoutHeartbeat?.gapCause}`
  );
}

section('5. EV-01 to EV-04 · the technical inventory expires against P-08');

{
  const inside = resolves(WAZUH_REAL, CORRECT_VALUES, new Date('2026-09-17T15:00:00Z'));
  const outside = resolves(WAZUH_REAL, CORRECT_VALUES, new Date('2026-09-17T18:00:00Z'));
  const longerDeadline = resolves(
    WAZUH_REAL,
    con({ 'P-08': 48 }),
    new Date('2026-09-17T18:00:00Z')
  );

  for (const id of ['EV-01', 'EV-02', 'EV-03', 'EV-04']) {
    check(
      `${id} · at 23 h from the snapshot, with P-08 = 24 · CUMPLE`,
      inside.get(id)?.status === 'CUMPLE',
      text(inside.get(id))
    );

    check(
      `${id} · at 26 h, with P-08 = 24 · NO_CUMPLE (the agent stopped reporting)`,
      outside.get(id)?.status === 'NO_CUMPLE',
      text(outside.get(id))
    );

    check(
      `${id} · reversal · the same clock with P-08 = 48 · CUMPLE`,
      longerDeadline.get(id)?.status === 'CUMPLE'
    );
  }

  const withoutKeepalive = WAZUH_REAL.map(linea => {
    const data = JSON.parse(linea);

    if (data.event !== 'agent_status') {
      return linea;
    }

    delete data.ultimo_keepalive;
    data.estado_agente = 'pending';

    return JSON.stringify(data);
  });

  const ev04 = resolves(withoutKeepalive, CORRECT_VALUES).get('EV-04');

  check(
    'EV-04 without keepalive · NO_EVALUABLE (EVIDENCE), never CUMPLE',
    ev04?.status === 'NO_EVALUABLE' && ev04?.gapCause === 'EVIDENCE',
    `${ev04?.status} ${ev04?.gapCause}`
  );

  const withoutP07 = resolves(WAZUH_REAL, con({ 'P-08': undefined })).get('EV-01');

  check(
    'P-08 unconfigured · EV-01 NO_EVALUABLE (CONFIGURATION)',
    withoutP07?.status === 'NO_EVALUABLE' && withoutP07?.gapCause === 'CONFIGURATION'
  );
}

section('6. EV-06 · the inventory review expires against P-04');

{
  check(
    'review of 10/09 evaluated on 16/09 with P-04 = 90 · CUMPLE',
    resolves(WAZUH_REAL, CORRECT_VALUES).get('EV-06')?.status === 'CUMPLE'
  );

  const expired = resolves(WAZUH_REAL, con({ 'P-04': 3 })).get('EV-06');

  check(
    'reversal · the same record with P-04 = 3 · NO_CUMPLE',
    expired?.status === 'NO_CUMPLE',
    text(expired)
  );

  const withoutRecord = resolves(
    [...withoutEvent(WAZUH_REAL, 'inventory_review'), SIN_REVISION],
    CORRECT_VALUES
  ).get('EV-06');

  check(
    'no review noted · NO_EVALUABLE, never CUMPLE by absence',
    withoutRecord?.status === 'NO_EVALUABLE',
    `${withoutRecord?.status}: ${text(withoutRecord)}`
  );

  const withChange = resolves(
    [
      ...WAZUH_REAL,
      '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:04Z","host":"wazuh-real","event":"asset_software_change","evidence_id":"EV-06","requisito":"op.exp.1.1","activo":"wazuh-real","cambio":"alta","gestor":"dpkg","paquete":"jq","version_anterior":"-","version_nueva":"1.7.1-3ubuntu0.24.04.2"}',
    ],
    CORRECT_VALUES
  ).get('EV-06');

  check(
    'a software change does not alter the review\'s verdict',
    withChange?.status === 'CUMPLE',
    String(withChange?.status)
  );
}

section('7. op.exp.1.1 declaring nothing: does NOT COMPLY, and not for lack of an agent');

{
  const empty: Valores = {};

  const evidences = Array.from(resolves(WAZUH_REAL, empty).values());

  const validation = validateControlConfiguration(configuration(empty), 'MEDIO');

  const requirement = evaluateRequirements(
    opExp1CatalogDefinition.requirements,
    'MEDIO',
    evidences,
    validation.missingRequired.length > 0,
    [],
    'ACTIVE'
  ).find(result => result.id === 'op.exp.1.1');

  check(
    'op.exp.1.1 NO_CUMPLE',
    requirement?.status === 'NO_CUMPLE',
    String(requirement?.status)
  );

  check(
    'the missing mandatory ones are P-01, P-02, P-03, P-04 and P-08 (P-05, P-06 and P-ATT do not block)',
    validation.missingRequired.map(parameter => parameter.id).sort().join(',') ===
      'P-01,P-02,P-03,P-04,P-08',
    validation.missingRequired.map(parameter => parameter.id).join(',')
  );

  check(
    'no evidence comes out green without a parameter',
    evidences.every(evidence => evidence.status !== 'CUMPLE'),
    evidences.map(evidence => `${evidence.id}=${evidence.status}`).join(' ')
  );
}

section('8. The report distinguishes what is observed from what is declared');

{
  const evidences = Array.from(resolves(WAZUH_REAL, CORRECT_VALUES).values());

  const result = {
    control: { id: 'op.exp.1' },
    status: 'CUMPLE',
    score: 100,
    level: 'MEDIO',
    parameters: configuration(CORRECT_VALUES).parameters.map(parameter => ({
      id: parameter.id,
      value: parameter.value,
    })),
    evidences: evidences.map(evidence => ({
      id: evidence.id,
      status: evidence.status,
      observations: evidence.observations,
      resolvedAttributes: evidence.resolvedAttributes,
    })),
  } as unknown as Parameters<typeof buildOpExp1ReportModel>[0];

  const model = buildOpExp1ReportModel(result);
  const campo = (id: string) =>
    model.fields.find(item => item.id === `op.exp.1.${id}`);

  check(
    'eleven fields, those of the sheet «Informe ENSFácil»',
    model.fields.length === 11,
    String(model.fields.length)
  );

  check(
    'the consolidated inventory shows the observed asset and its hardware',
    Boolean(
      campo('campo2')?.value.includes('activo: wazuh-real') &&
        campo('campo2')?.value.includes('fabricante: Hetzner')
    ),
    campo('campo2')?.value
  );

  check(
    'the coverage shows the row declared in P-01',
    Boolean(campo('campo3')?.value.includes('Responsable de Sistemas')),
    campo('campo3')?.value
  );

  check(
    'the periodic review shows the observed date',
    Boolean(campo('campo10')?.value.includes('fecha: 2026-09-10')),
    campo('campo10')?.value
  );

  check(
    'critical assets (R3) come out NO_APLICA',
    campo('campo9')?.status === 'NO_APLICA'
  );
}

section('9. Real LDAP: the directory plane arrives, and without a review it does not comply');

{
  const ldapAgent = { id: '028', name: 'zimbraHldap' };

  const valoresLdap: Valores = {
    'P-01': ['ldapserver | Responsable del directorio | Resp. directorio | servicio de directorio'],
    'P-02': [
      'nat-virtualbox | HW red | 10.0.2.2 | Laboratorio',
      'dns-virtualbox | servicio | 10.0.2.3 | Laboratorio',
      'nat-virtualbox-ipv6 | HW red | fd17:625c:f037:2::2 | Laboratorio',
    ],
    'P-03': ['HW servidor', 'HW red', 'servicio de directorio', 'servicio'],
    'P-04': 90,
    'P-08': 24,
  };

  const now = new Date('2026-09-17T12:00:00Z');
  const evidences = resolves(LDAP_REAL, valoresLdap, now, ldapAgent);

  for (const id of ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-07']) {
    check(
      `${id} · CUMPLE with the real LDAP facts`,
      evidences.get(id)?.status === 'CUMPLE',
      `${evidences.get(id)?.status}: ${text(evidences.get(id))}`
    );
  }

  check(
    'EV-03 decides on the fact with the directory plane (Zimbra\'s slapd, base at the root)',
    evidences.get('EV-03')?.resolvedAttributes?.directorio_paquete ===
      'zimbra-openldap-server' &&
      evidences.get('EV-03')?.resolvedAttributes?.directorio_sufijo ===
        '{2}mdb:(raiz)'
  );

  check(
    'EV-06 without a review record · NO_EVALUABLE, and op.exp.1.1 does NOT COMPLY',
    evidences.get('EV-06')?.status === 'NO_EVALUABLE' &&
      evaluateRequirements(
        opExp1CatalogDefinition.requirements,
        'MEDIO',
        Array.from(evidences.values()),
        false,
        [],
        'ACTIVE'
      ).find(result => result.id === 'op.exp.1.1')?.status === 'NO_CUMPLE'
  );

  const configuredLdapAgent = evidences.get('EV-07');

  check(
    'the asset is the hostname (ldapserver), not the agent name (zimbraHldap)',
    resolves(
      LDAP_REAL,
      { ...valoresLdap, 'P-01': ['zimbraHldap | Responsable | Rol | servicio de directorio'] },
      now,
      ldapAgent
    ).get('EV-07')?.status === 'NO_CUMPLE' &&
      configuredLdapAgent?.status === 'CUMPLE'
  );

  const withoutIpv6 = resolves(
    LDAP_REAL,
    { ...valoresLdap, 'P-02': valoresLdap['P-02']!.slice(0, 2) as string[] },
    now,
    ldapAgent
  ).get('EV-05');

  check(
    'reversal · without the IPv6 gateway in P-02, EV-05 NO_CUMPLE naming it',
    withoutIpv6?.status === 'NO_CUMPLE' && text(withoutIpv6).includes('fd17:625c:f037:2::2'),
    text(withoutIpv6)
  );
}

console.log(
  failures.length
    ? `\n${failures.length} check(s) FAIL`
    : '\nop.exp.1: all checks pass'
);

process.exit(failures.length ? 1 : 0);
