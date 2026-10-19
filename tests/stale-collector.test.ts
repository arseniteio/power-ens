/** Stale data: a control is not judged with what its collector stopped sending over 24 h ago. */
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { opExp1Configuration } from '../common/ens/configuration/data/op-exp-1-parameters';
import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSControlParameter,
} from '../common/ens/configuration/types';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import {
  findStaleCollector,
  STALE_COLLECTOR_MAX_AGE_HOURS,
} from '../common/ens/core/evidence/stale-collector';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

{
  const Module = require('module');
  const load = Module._load;

  Module._load = function (request: string, ...rest: unknown[]) {
    if (/kibana-services$/.test(request)) {
      return {};
    }

    return load.call(this, request, ...rest);
  };
}

const {
  getENSComplianceResultByControl,
  getENSComplianceState,
} = require('../common/ens/core/ens-engine') as typeof import('../common/ens/core/ens-engine');
const { buildENSControlComplianceTimeline } = require('../common/ens/core/timeline/control-timeline') as typeof import('../common/ens/core/timeline/control-timeline');

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

const LEVEL = 'MEDIO';
const HORA = 60 * 60 * 1000;

const RULE: Record<string, string> = {
  asset_system: '110201',
  software_inventory: '110202',
  network_inventory: '110203',
  agent_status: '110204',
  network_host_observed: '110205',
  inventory_review: '110210',
  collector_run: '110299',
};

const PASS = '2026-09-16T16:16:13Z';

const WAZUH_REAL = [
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"asset_system","evidence_id":"EV-01,EV-07","requisito":"op.exp.1.1","activo":"wazuh-real","fqdn":"wazuh-real","sistema_operativo":"Ubuntu","version_so":"24.04.4 LTS (Noble Numbat)","kernel":"6.8.0-111-generic","arquitectura":"x86_64","fabricante":"Hetzner","modelo":"vServer","num_serie":"156475036","virtualizacion":"kvm","cpu_modelo":"AMD EPYC-Rome Processor","cpus":2,"memoria_mb":3840}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"software_inventory","evidence_id":"EV-02","requisito":"op.exp.1.1,op.exp.1.r4.1","activo":"wazuh-real","gestor":"dpkg","paquetes":570,"snaps":0,"huella":"a9248bce0c39db8bcf3d85b904587b0ec4b7bfd2d822772ed18f8f223f940236","linea_base":"no","altas":0,"bajas":0,"actualizaciones":0}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"network_inventory","evidence_id":"EV-03","requisito":"op.exp.1.1","activo":"wazuh-real","interfaces":"eth0","direcciones":"eth0=62.238.61.123/32,eth0=2a01:4f9:c015:2f44::1/64","puertos_escucha":7,"servicios":"sshd/tcp/22121,systemd-network/udp/68,systemd-resolve/tcp/53,systemd-resolve/udp/53","procesos":137}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"agent_status","evidence_id":"EV-04","requisito":"op.exp.1.1,op.exp.1.r2.1","activo":"wazuh-real","estado_agente":"connected","mensajes_en_buffer":0,"version_agente":"4.14.5","gestor":"89.167.83.18","ultimo_keepalive":"2026-09-16T16:16:01Z","ultimo_ack":"2026-09-16T16:16:01Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"network_host_observed","evidence_id":"EV-05","requisito":"op.exp.1.1","activo":"wazuh-real","ip":"172.31.1.1","mac":"d2:74:7f:6e:37:e3","interfaz":"eth0","estado_vecino":"REACHABLE","es_pasarela":"si","primera_observacion":"2026-09-16T16:15:53Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"inventory_review","evidence_id":"EV-06","requisito":"op.exp.1.1","activo":"wazuh-real","fecha":"2026-09-10","alcance":"inventario completo","responsable":"rsis"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"collector_run","resultado":"completada","evidencias_cubiertas":"EV-05","fuentes_leidas":"EV-01,EV-07,EV-02,EV-03,EV-04,EV-05,EV-06","cambios_emitidos":0,"perfil":"linux","emisor":"recolector"}',
];

let counter = 0;

const indexes = (
  lines: string[],
  agent: { id: string; name: string } = { id: '024', name: 'wazuh-real' }
): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lines.map(line => {
      const data = JSON.parse(line);

      counter += 1;

      return {
        _id: `stale-${counter}`,
        _source: {
          '@timestamp': data.ts,
          agent: agent,
          rule: { id: RULE[data.event] || '110299', description: data.event },
          data,
        },
      };
    })
  );

const fact = (
  controlId: string,
  eventType: string,
  timestamp: string,
  agentId = '024'
): ENSNormalizedEvent => ({
  id: `h-${(counter += 1)}`,
  agentId,
  controlId,
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp,
  attributes: {},
});

const VALUES: Record<string, ENSControlParameter['value']> = {
  'P-01': ['wazuh-real | Responsable de Sistemas | Resp. Sistemas | HW servidor'],
  'P-02': ['gw-proveedor | router | 172.31.1.1 | Proveedor de hosting'],
  'P-03': ['HW servidor', 'HW red', 'SW base', 'servicio'],
  'P-04': 90,
  'P-08': 720,
};

const opExp1: ENSControlConfiguration = {
  ...opExp1Configuration,
  parameters: opExp1Configuration.parameters.map(parameter => {
    const { value: _discarded, ...rest } = parameter as ENSControlParameter;

    return VALUES[parameter.id] === undefined
      ? (rest as ENSControlParameter)
      : ({ ...rest, value: VALUES[parameter.id] } as ENSControlParameter);
  }),
};

ensConfigurationRepository.replaceActive({
  ...defaultENSConfigurationTemplate,
  global: {
    ...defaultENSConfigurationTemplate.global,
    clientName: 'Cliente de prueba',
    organization: 'Organización de prueba',
    scope: 'Laboratorio',
    ensLevel: LEVEL,
  } as ENSConfigurationVersion['global'],
  controls: defaultENSConfigurationTemplate.controls.map(control =>
    control.controlId === 'op.exp.1' ? opExp1 : control
  ),
});

const WAZUH: ENSAgentScope = { id: '024', name: 'wazuh-real', groups: ['ens'] };
const LDAP: ENSAgentScope = { id: '028', name: 'zimbraHldap', groups: ['ens'] };
const MANAGER: ENSAgentScope = { id: '000', name: 'Wazuh-4', groups: [], isManager: true };

const after2 = (hours: number, since = PASS): Date =>
  new Date(Date.parse(since) + hours * HORA);

const opExp1Of = (
  events: ENSNormalizedEvent[],
  agent: string | undefined,
  scope: ENSAgentScope[],
  now: Date
) =>
  getENSComplianceState(LEVEL, events, agent, scope, now).results.find(
    result => result.control.id === 'op.exp.1'
  );

section('1. The detector: 24 h since the last heartbeat, or since the last orphan fact');

{
  check('the threshold is a single 24 h constant', STALE_COLLECTOR_MAX_AGE_HOURS === 24);

  const pass = [
    fact('op.acc.3', 'account_action', '2026-09-25T12:33:02Z', '028'),
    fact('op.acc.3', 'collector_run', '2026-09-25T12:33:03Z', '028'),
  ];

  check(
    'with the heartbeat from 23 h ago there is nothing to mark',
    findStaleCollector('op.acc.3', pass, after2(23, '2026-09-25T12:33:03Z')) === undefined
  );
  check(
    'exactly at 24 h it still counts as alive',
    findStaleCollector('op.acc.3', pass, after2(24, '2026-09-25T12:33:03Z')) === undefined
  );

  const old = findStaleCollector('op.acc.3', pass, new Date('2026-09-27T03:49:49Z'));

  check('with the 25/09 heartbeat as of 27/09, not renewed', Boolean(old));
  check('the reference is the heartbeat', old?.reference === 'collector_run', old?.reference);
  check('since the instant of the last heartbeat', old?.since === '2026-09-25T12:33:03.000Z', old?.since);
  check(
    'motive «sin datos del recolector desde <fecha UTC>»',
    /sin datos del recolector desde 2026-09-25 12:33 UTC/i.test(old?.reason || ''),
    old?.reason
  );

  check(
    'another control\'s heartbeat does not renew this one',
    Boolean(
      findStaleCollector(
        'op.acc.3',
        [...pass, fact('op.acc.1', 'collector_run', '2026-09-27T03:00:00Z', '028')],
        new Date('2026-09-27T03:49:49Z')
      )
    )
  );

  check(
    'a heartbeat AFTER `now` did not exist at that instant',
    Boolean(
      findStaleCollector(
        'op.acc.3',
        [...pass, fact('op.acc.3', 'collector_run', '2026-09-28T10:00:00Z', '028')],
        new Date('2026-09-27T03:49:49Z')
      )
    )
  );

  const orphan2 = [fact('op.acc.3', 'account_action', '2026-09-25T12:33:02Z', '028')];
  const oldOrphan = findStaleCollector('op.acc.3', orphan2, new Date('2026-09-27T03:49:49Z'));

  check('facts without a heartbeat and over 24 h old: not renewed', Boolean(oldOrphan));
  check('with the last fact as reference', oldOrphan?.reference === 'fact', oldOrphan?.reference);
  check(
    'and the same motive, with the fact\'s date',
    /sin datos del recolector desde 2026-09-25 12:33 UTC/i.test(oldOrphan?.reason || ''),
    oldOrphan?.reason
  );
  check(
    'facts without a heartbeat but recent: judged',
    findStaleCollector('op.acc.3', orphan2, after2(2, '2026-09-25T12:33:02Z')) === undefined
  );
  check(
    'without facts or heartbeat it decides nothing: it is already «no ha llegado nada»',
    findStaleCollector('op.acc.3', [], new Date('2026-09-27T03:49:49Z')) === undefined
  );
}

const EVENTS_024 = indexes(WAZUH_REAL);

section('2. op.exp.1 on wazuh-real: the same pass, fresh and 25 h later');

{
  const fresco = opExp1Of(EVENTS_024, '024', [WAZUH], after2(1));
  const old = opExp1Of(EVENTS_024, '024', [WAZUH], after2(25));

  check('with the pass from 1 h ago, CUMPLE', fresco?.status === 'CUMPLE', `${fresco?.score} ${fresco?.status}`);
  check('with the same pass 25 h later, NO_CUMPLE', old?.status === 'NO_CUMPLE', `${old?.score} ${old?.status}`);
  check('y al 0 %', old?.score === 0, old?.score);

  const applicable = old?.evidences.filter(e => e.status !== 'NO_APLICA') || [];

  check(
    'all the evidences that apply, NO_EVALUABLE',
    applicable.length > 0 && applicable.every(e => e.status === 'NO_EVALUABLE'),
    applicable.map(e => `${e.id}:${e.status}`).join(' ')
  );
  check(
    'with the motive in the evidence',
    applicable.every(e => e.observations.some(o => o.includes('Sin datos del recolector desde 2026-09-16 16:16 UTC'))),
    applicable[0]?.observations[0]
  );
  check(
    'they no longer point to the old event as the one that resolves them',
    applicable.every(e => !e.resolvedEventId)
  );
  check(
    'but they keep when the last datum arrived',
    applicable.some(e => e.lastSeen === '2026-09-16T16:16:13Z')
  );

  const nonconformities = old?.nonConformities.filter(nc => nc.requirementId === 'op.exp.1.1') || [];

  check(
    'op.exp.1.1 opens a NOT EVIDENCED nonconformity with cause COLLECTION',
    nonconformities.length === 1 &&
      nonconformities[0].origin === 'NO_EVIDENCIADA' &&
      nonconformities[0].cause === 'COLLECTION',
    JSON.stringify(nonconformities.map(nc => [nc.origin, nc.cause]))
  );
  check(
    'and the card cites the motive',
    /Sin datos del recolector desde 2026-09-16 16:16 UTC/.test(nonconformities[0]?.finding || ''),
    nonconformities[0]?.finding
  );

  const notApplicableBefore = fresco?.requirements.filter(r => r.status === 'NO_APLICA').map(r => r.id).join(',');
  const notApplicableAfter = old?.requirements.filter(r => r.status === 'NO_APLICA').map(r => r.id).join(',');

  check(
    'what does not apply still does not apply: the denominator does not change',
    notApplicableBefore === notApplicableAfter && fresco?.applicableRequirements === old?.applicableRequirements,
    `${notApplicableBefore} / ${notApplicableAfter}`
  );
  check(
    'old facts stay in traceability',
    (old?.traceability || []).some(t => t.source === 'WAZUH' && t.timestamp === '2026-09-16T16:16:13Z')
  );

  const opAcc1 = getENSComplianceState(
    LEVEL,
    [...EVENTS_024, fact('op.acc.1', 'collector_run', after2(24.5).toISOString())],
    '024',
    [WAZUH],
    after2(25)
  ).results.find(r => r.control.id === 'op.acc.1');

  check(
    'the threshold is PER CONTROL: op.acc.1 with a fresh heartbeat carries no motive',
    !(opAcc1?.evidences || []).some(e => e.observations.some(o => o.includes('Sin datos del recolector')))
  );
}

section('3. The consolidated does not come out CUMPLE with an unrenewed row');

{
  const ldap = indexes(
    WAZUH_REAL.map(line => line.replace(/2026-09-16T16:16:13Z/g, '2026-09-15T16:00:00Z')),
    { id: '028', name: 'zimbraHldap' }
  );
  const now = after2(1);
  const whole = opExp1Of([...EVENTS_024, ...ldap], undefined, [WAZUH, LDAP], now);
  const wazuhOnly = opExp1Of([...EVENTS_024, ...ldap], '024', [WAZUH, LDAP], now);
  const ldapOnly = opExp1Of([...EVENTS_024, ...ldap], '028', [WAZUH, LDAP], now);

  check('the fresh row CUMPLE', wazuhOnly?.status === 'CUMPLE', wazuhOnly?.status);
  check('the unrenewed row NO_CUMPLE', ldapOnly?.status === 'NO_CUMPLE', ldapOnly?.status);
  check('the whole is not CUMPLE', whole?.status !== 'CUMPLE', `${whole?.score} ${whole?.status}`);

  const detail = getENSComplianceResultByControl('op.exp.1', LEVEL, [...EVENTS_024, ...ldap], undefined, [WAZUH, LDAP], now);

  check(
    'and the control detail says the same as the panel',
    detail?.status === whole?.status && detail?.score === whole?.score,
    `${detail?.score} ${detail?.status}`
  );
}

section('4. The manager row (000) follows the same rule');

{
  const managerHeartbeat = fact('op.exp.7', 'collector_run', '2026-09-26T03:00:00Z', '000');
  const vista = (now: Date) =>
    getENSComplianceState(LEVEL, [managerHeartbeat], '000', [WAZUH, MANAGER], now).results.find(
      r => r.control.id === 'op.exp.7'
    );

  const old = vista(new Date('2026-09-27T04:00:00Z'));
  const fresco = vista(new Date('2026-09-26T04:00:00Z'));
  const marked = (r: typeof old) =>
    (r?.evidences || []).filter(e => e.observations.some(o => o.includes('Sin datos del recolector desde 2026-09-26 03:00 UTC')));

  check(
    'op.exp.7 with the heartbeat from 25 h ago: all its evidences unrenewed',
    Boolean(old) &&
      marked(old).length === (old?.evidences || []).filter(e => e.status !== 'NO_APLICA').length &&
      marked(old).every(e => e.status === 'NO_EVALUABLE'),
    `${marked(old).length} de ${old?.evidences.length}`
  );
  check('no requirement CUMPLE', !(old?.requirements || []).some(r => r.status === 'CUMPLE'));
  check('with the heartbeat from 1 h ago, without the motive', marked(fresco).length === 0);
}

section('5. The daily series measures the threshold against each point\'s `now`');

{
  const series = buildENSControlComplianceTimeline('op.exp.1', LEVEL, EVENTS_024, {
    agentId: '024',
    scopeAgents: [WAZUH],
    days: 3,
    now: new Date('2026-09-18T12:00:00Z'),
  });

  const perDay = series.map(p => `${p.label}:${p.status}`).join(' ');

  check('three points', series.length === 3, perDay);
  check('the day of the pass, CUMPLE', series[0]?.status === 'CUMPLE', perDay);
  check('the next day, already unrenewed', series[1]?.status === 'NO_CUMPLE', perDay);
  check('and today, same as the panel', series[2]?.status === 'NO_CUMPLE' && series[2]?.isCurrent, perDay);
}

console.log(failures.length ? `\n${failures.length} FAILURES: ${failures.join('; ')}` : '\nALL OK');

if (failures.length) {
  process.exit(1);
}
