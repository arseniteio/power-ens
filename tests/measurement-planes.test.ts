/** Measurement planes: the manager (000) in scope, and each row with its own. */
import { ENSCatalog } from '../common/ens/catalog';
import type { ENSControlDefinition } from '../common/ens/catalog/types';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { buildENSScopeAgentQueryFilter } from '../common/ens/core/scope/engine';
import {
  ENS_MANAGER_AGENT_ID,
  getControlMeasurementPlanes,
} from '../common/ens/core/scope/measurement-planes';
import {
  getActiveENSScopeAgents,
  hydrateENSScope,
  resolveENSScopeAgents,
} from '../common/ens/core/scope/runtime';
import type { ENSAgentScope } from '../common/ens/core/scope/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import type {
  ENSConfigurationScope,
  ENSConfigurationVersion,
} from '../common/ens/configuration/types';

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
const { buildENSComplianceTimeline } = require('../common/ens/core/timeline/compliance-timeline') as typeof import('../common/ens/core/timeline/compliance-timeline');
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

const NOW = new Date('2026-09-26T12:00:00Z');
const LEVEL = 'MEDIO';

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
    control.controlId !== 'mp.info.6'
      ? control
      : {
          ...control,
          parameters: control.parameters.map(parameter =>
            parameter.id === 'P-04'
              ? { ...parameter, value: ['wazuh-real', 'wazuh-fake'] }
              : parameter
          ),
        }
  ),
});

const AGENT_PLANE = [
  'mp.info.6',
  'op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4', 'op.acc.5', 'op.acc.6',
  'op.exp.1', 'op.exp.2', 'op.exp.3', 'op.exp.4', 'op.exp.5', 'op.exp.6',
  'op.exp.10',
];
const MANAGER_ONLY = ['op.cont.2', 'op.cont.3', 'op.exp.7', 'op.exp.9', 'op.mon.1', 'op.mon.2', 'op.nub.1'];
const DOUBLE_PLANE = ['op.exp.8', 'op.mon.3'];
// The 11 without collector (1.4.0, DRAFT): default plane until their wave decides it.
const WITHOUT_COLLECTOR = ['mp.eq.2', 'mp.eq.3', 'mp.eq.4', 'mp.com.1', 'mp.com.3', 'mp.com.4', 'mp.sw.2', 'mp.s.1', 'mp.s.2', 'mp.s.3', 'mp.s.4'];

const AGENTS: ENSAgentScope[] = [
  { id: '001', name: 'wazuh-real', groups: ['default', 'ens'] },
  { id: '002', name: 'wazuh-fake', groups: ['ens'] },
];
const MANAGER: ENSAgentScope = { id: '000', name: 'Wazuh-4', groups: [], isManager: true };
const WITH_MANAGER = [...AGENTS, MANAGER];

let counter = 0;

const fact = (
  agentId: string,
  controlId: string,
  eventType: string,
  extra: Partial<ENSNormalizedEvent> = {}
): ENSNormalizedEvent => {
  counter += 1;

  return {
    id: `hecho-${counter}`,
    agentId,
    agentName: [...AGENTS, MANAGER].find(a => a.id === agentId)?.name,
    controlId,
    eventType,
    sourceType: 'WAZUH_ALERT',
    timestamp: '2026-09-26T11:00:00Z',
    tool: 'ENSFácil test',
    ...extra,
  };
};

const COPY = { origen: 'pbs', objeto: 'fichero', ultima_correcta: '2026-09-26T02:00:00Z', ultima_fallida: '-', resultado_ultima: 'ok' };

const OF_AGENTS: ENSNormalizedEvent[] = [
  fact('001', 'mp.info.6', 'backup_run', { evidenceId: 'EV-01', ruleId: '106601', attributes: COPY }),
  fact('001', 'mp.info.6', 'restore_test', {
    evidenceId: 'EV-05',
    ruleId: '106606',
    attributes: { origen: 'pbs', objeto: 'fichero', fecha: '2026-09-25T03:00:00Z', resultado: 'ok', coincide: 'si', limpieza: 'ok' },
  }),
  fact('002', 'mp.info.6', 'backup_run', { evidenceId: 'EV-01', ruleId: '106601', attributes: COPY }),
  fact('001', 'op.exp.8', 'collector_run', {
    attributes: { resultado: 'completada', tipo_servidor: 'linux', evidencias_cubiertas: 'EV-01,EV-02' },
  }),
];

const OF_MANAGER: ENSNormalizedEvent[] = [
  fact('000', 'op.exp.8', 'collector_run', {
    attributes: { resultado: 'completada', tipo_servidor: 'manager', evidencias_cubiertas: 'EV-04,EV-05' },
  }),
  fact('000', 'op.exp.7', 'collector_run', {
    attributes: { resultado: 'completada', perfil: 'manager', evidencias_cubiertas: 'EV-01' },
  }),
];

const ALL = [...OF_AGENTS, ...OF_MANAGER];

type Result = { control: { id: string } };

const fingerprint = (value: unknown): string =>
  JSON.stringify(value, (clave, v) => (clave === 'evaluatedAt' ? undefined : v));

const byControl = <T extends Result>(results: T[]) =>
  new Map(results.map(r => [r.control.id, r]));

const ids = (results: Result[]) => results.map(r => r.control.id);

section('0. The catalog declares the planes');

check(
  'op.cont.2, op.cont.3, op.exp.7, op.exp.9, op.mon.1, op.mon.2 and op.nub.1 are measured only on the manager',
  MANAGER_ONLY.every(id => fingerprint(getControlMeasurementPlanes(ENSCatalog.find(c => c.id === id)!)) === '["manager"]')
);
check(
  'op.exp.8 is measured on both planes',
  fingerprint(getControlMeasurementPlanes(ENSCatalog.find(c => c.id === 'op.exp.8')!)) === '["agent","manager"]'
);
check(
  'op.mon.3 is measured on both planes',
  fingerprint(getControlMeasurementPlanes(ENSCatalog.find(c => c.id === 'op.mon.3')!)) === '["agent","manager"]'
);
check(
  'the usual 14 declare nothing and are `agent`',
  AGENT_PLANE.every(id => {
    const control = ENSCatalog.find(c => c.id === id)!;

    return control.measurementPlanes === undefined && fingerprint(getControlMeasurementPlanes(control)) === '["agent"]';
  })
);
check(
  'the 11 without collector declare nothing either (default plane, DRAFT)',
  WITHOUT_COLLECTOR.every(id => {
    const control = ENSCatalog.find(c => c.id === id)!;

    return control.status === 'DRAFT' && control.measurementPlanes === undefined;
  })
);
check(
  'the catalog is those 34',
  ENSCatalog.length === AGENT_PLANE.length + MANAGER_ONLY.length + DOUBLE_PLANE.length + WITHOUT_COLLECTOR.length
);

section('1. The scope');

const INVENTORY: ENSAgentScope[] = [
  ...AGENTS,
  { id: '003', name: 'fuera', groups: ['default'] },
];

const scopeOf = (scope: Partial<ENSConfigurationScope>): ENSConfigurationScope => ({
  mode: 'group',
  agentIds: [],
  groupIds: ['ens'],
  ...scope,
} as ENSConfigurationScope);

const MODES: Array<[string, ENSConfigurationScope]> = [
  ['global', scopeOf({ mode: 'global', groupIds: [] })],
  ['grupo', scopeOf({ mode: 'group' })],
  ['agente', scopeOf({ mode: 'agent', agentIds: ['001'], groupIds: [] })],
];

for (const [mode, scope] of MODES) {
  const agents = resolveENSScopeAgents(INVENTORY, scope);
  const manager = agents.find(a => a.id === ENS_MANAGER_AGENT_ID);

  check(`mode ${mode} · the manager enters, marked, without being in any group`, Boolean(manager?.isManager), fingerprint(agents));
  check(`mode ${mode} · without the inventory, it is still named`, Boolean(manager?.name));
}

{
  const agents = resolveENSScopeAgents(
    [...INVENTORY, { id: '000', name: 'Wazuh-4', groups: [] }],
    scopeOf({ mode: 'global', groupIds: [] })
  );

  check(
    'with 000 in the inventory, it appears once and with its name',
    agents.filter(a => a.id === '000').length === 1 && agents.find(a => a.id === '000')?.name === 'Wazuh-4',
    fingerprint(agents)
  );
}

{
  const withoutActiveManager: ENSControlDefinition[] = ENSCatalog.map(control =>
    getControlMeasurementPlanes(control).includes('manager')
      ? { ...control, status: 'DRAFT' }
      : control
  );

  for (const [mode, scope] of MODES) {
    const agents = resolveENSScopeAgents(
      [...INVENTORY, { id: '000', name: 'Wazuh-4', groups: [] }],
      scope,
      withoutActiveManager
    );

    check(
      `mode ${mode} · without an ACTIVE manager plane, the manager does not enter`,
      !agents.some(a => a.id === '000'),
      fingerprint(agents)
    );
  }

  check(
    'and the rest of the scope is as usual',
    fingerprint(resolveENSScopeAgents(INVENTORY, scopeOf({ mode: 'group' }), withoutActiveManager)) === fingerprint(AGENTS)
  );
}

hydrateENSScope(scopeOf({ mode: 'group' }), async () => INVENTORY).then(() => {
  const actives = getActiveENSScopeAgents();

  check('hydrated, the manager is among the active agents', actives.some(a => a.id === '000' && a.isManager));

  const filter = buildENSScopeAgentQueryFilter(actives) as { terms?: { 'agent.id': string[] } };

  check(
    'the whole query includes 000',
    Boolean(filter.terms?.['agent.id'].includes('000')),
    fingerprint(filter)
  );

  const ofOne = buildENSScopeAgentQueryFilter(actives, '001') as { terms?: { 'agent.id': string[] } };

  check(
    'a machine\'s view also brings the manager\'s facts',
    fingerprint(ofOne.terms?.['agent.id']) === '["001","000"]',
    fingerprint(ofOne)
  );

  const ofManager = buildENSScopeAgentQueryFilter(actives, '000') as { match_phrase?: { 'agent.id': string } };

  check(
    'the manager\'s view brings only its own',
    ofManager.match_phrase?.['agent.id'] === '000',
    fingerprint(ofManager)
  );

  check(
    'without the manager in scope, a machine\'s view is as usual',
    fingerprint(buildENSScopeAgentQueryFilter(AGENTS, '001')) === fingerprint({ match_phrase: { 'agent.id': '001' } })
  );

  rest();
}).catch(error => {
  console.log(error);
  process.exit(1);
});

const rest = (): void => {
  section('2. With the manager and facts only from agents, the 14 agent-plane ones do not change');

  const hoy = getENSComplianceState(LEVEL, OF_AGENTS, undefined, AGENTS, NOW);
  const now = getENSComplianceState(LEVEL, OF_AGENTS, undefined, WITH_MANAGER, NOW);

  const changed = AGENT_PLANE.filter(
    id => fingerprint(byControl(hoy.results).get(id)) !== fingerprint(byControl(now.results).get(id))
  );

  check('consolidated · none of the 14 changes', changed.length === 0, changed.join(', '));
  check(
    'consolidated · all 34 are there, in catalog order',
    fingerprint(ids(now.results)) === fingerprint(ENSCatalog.map(c => c.id)),
    ids(now.results).join(', ')
  );

  for (const agent of AGENTS) {
    const rowToday = hoy.agents.find(a => a.agentId === agent.id)!;
    const rowNow = now.agents.find(a => a.agentId === agent.id)!;
    const distinct = AGENT_PLANE.filter(
      id => fingerprint(byControl(rowToday.results).get(id)) !== fingerprint(byControl(rowNow.results).get(id))
    );

    check(`row ${agent.id} · none of the 14 changes`, distinct.length === 0, distinct.join(', '));

    const vistaHoy = getENSComplianceState(LEVEL, OF_AGENTS, agent.id, AGENTS, NOW);
    const viewNow = getENSComplianceState(LEVEL, OF_AGENTS, agent.id, WITH_MANAGER, NOW);
    const distinctView = AGENT_PLANE.filter(
      id => fingerprint(byControl(vistaHoy.results).get(id)) !== fingerprint(byControl(viewNow.results).get(id))
    );

    check(`view of ${agent.id} · none of the 14 changes`, distinctView.length === 0, distinctView.join(', '));
  }

  const byControlDistinct = AGENT_PLANE.filter(
    id =>
      fingerprint(getENSComplianceResultByControl(id, LEVEL, OF_AGENTS, undefined, AGENTS, NOW)) !==
      fingerprint(getENSComplianceResultByControl(id, LEVEL, OF_AGENTS, undefined, WITH_MANAGER, NOW))
  );

  check('control by control (detail) · none of the 14 changes', byControlDistinct.length === 0, byControlDistinct.join(', '));

  check(
    'the manager is one more row and brings only its 9 controls',
    fingerprint(ids(now.agents.find(a => a.agentId === '000')!.results)) === '["op.exp.7","op.exp.8","op.exp.9","op.nub.1","op.cont.2","op.cont.3","op.mon.1","op.mon.2","op.mon.3"]',
    ids(now.agents.find(a => a.agentId === '000')?.results || []).join(', ')
  );
  check(
    'and its summary counts only those 9',
    now.agents.find(a => a.agentId === '000')!.summary.totalControls === 9
  );
  check(
    'an agent row\'s summary does not count the manager-only ones nor the 11 without collector (no row of their own)',
    now.agents.filter(a => a.agentId !== '000').every(a => a.summary.totalControls === 16 && !a.results.some(r => WITHOUT_COLLECTOR.includes(r.control.id)))
  );

  section('3. op.cont.2, op.cont.3, op.exp.7, op.exp.9, op.mon.1, op.mon.2 and op.nub.1: manager row; in an agent\'s view, its result');

  const estado = getENSComplianceState(LEVEL, ALL, undefined, WITH_MANAGER, NOW);
  const managerRow = estado.agents.find(a => a.agentId === '000')!;

  for (const id of MANAGER_ONLY) {
    check(`${id} · evaluated in row 000`, byControl(managerRow.results).has(id));
    check(
      `${id} · does not appear in any agent row`,
      estado.agents.filter(a => a.agentId !== '000').every(a => !byControl(a.results).has(id))
    );

    const ofManager = byControl(managerRow.results).get(id);
    const consolidated = byControl(estado.results).get(id);

    check(
      `${id} · the consolidated is the manager row's, over a single machine`,
      consolidated?.status === ofManager?.status &&
        fingerprint(consolidated?.consolidatedAgents?.map(a => a.agentId)) === '["000"]',
      fingerprint(consolidated?.consolidatedAgents)
    );

    for (const agent of AGENTS) {
      const vista = getENSComplianceState(LEVEL, ALL, agent.id, WITH_MANAGER, NOW);

      check(
        `${id} · in ${agent.name}'s view, the manager's result`,
        fingerprint(byControl(vista.results).get(id)) === fingerprint(ofManager),
        byControl(vista.results).get(id)?.status
      );
      check(
        `${id} · and the same in the control detail`,
        fingerprint(getENSComplianceResultByControl(id, LEVEL, ALL, agent.id, WITH_MANAGER, NOW)) === fingerprint(ofManager)
      );
    }
  }

  {
    const withoutFacts = getENSComplianceState(LEVEL, OF_AGENTS, '001', WITH_MANAGER, NOW);
    const withFacts = getENSComplianceState(LEVEL, ALL, '001', WITH_MANAGER, NOW);

    check(
      'op.exp.7 · in an agent\'s view, the manager\'s facts change the result',
      fingerprint(byControl(withoutFacts.results).get('op.exp.7')) !== fingerprint(byControl(withFacts.results).get('op.exp.7'))
    );
  }

  {
    const vista = getENSComplianceState(LEVEL, ALL, '001', WITH_MANAGER, NOW);

    check(
      'an agent\'s view · all 34 are there, in catalog order',
      fingerprint(ids(vista.results)) === fingerprint(ENSCatalog.map(c => c.id)),
      ids(vista.results).join(', ')
    );
  }

  {
    const vista = getENSComplianceState(LEVEL, ALL, '000', WITH_MANAGER, NOW);

    check(
      'vista del manager · sus 9 controles',
      fingerprint(ids(vista.results)) === '["op.exp.7","op.exp.8","op.exp.9","op.nub.1","op.cont.2","op.cont.3","op.mon.1","op.mon.2","op.mon.3"]',
      ids(vista.results).join(', ')
    );
    check(
      'manager\'s view · an agent-plane control has no result',
      getENSComplianceResultByControl('op.acc.1', LEVEL, ALL, '000', WITH_MANAGER, NOW) === undefined
    );
  }

  section('4. op.exp.8: in both rows, and the consolidated combines them');

  {
    const rows = estado.agents.filter(a => byControl(a.results).has('op.exp.8')).map(a => a.agentId);

    check('op.exp.8 · appears in the manager row and in the agent ones', fingerprint(rows) === '["000","001","002"]', fingerprint(rows));

    const consolidated = byControl(estado.results).get('op.exp.8')!;

    check(
      'op.exp.8 · the consolidated summarizes the three machines',
      fingerprint(consolidated.consolidatedAgents?.map(a => a.agentId)) === '["000","001","002"]',
      fingerprint(consolidated.consolidatedAgents)
    );
    check(
      'op.exp.8 · its applicable requirements are the sum of the rows',
      consolidated.applicableRequirements ===
        estado.agents.reduce((sum, a) => sum + (byControl(a.results).get('op.exp.8')?.applicableRequirements || 0), 0)
    );
    check(
      'op.exp.8 · the control detail gives the same consolidated',
      fingerprint(getENSComplianceResultByControl('op.exp.8', LEVEL, ALL, undefined, WITH_MANAGER, NOW)) === fingerprint(consolidated)
    );

    const vista = getENSComplianceState(LEVEL, ALL, '001', WITH_MANAGER, NOW);

    check(
      'op.exp.8 · in an agent\'s view, THAT agent\'s row',
      fingerprint(byControl(vista.results).get('op.exp.8')) ===
        fingerprint(byControl(estado.agents.find(a => a.agentId === '001')!.results).get('op.exp.8'))
    );
  }

  section('5. The daily series applies the same rule');

  {
    const series = buildENSComplianceTimeline(LEVEL, ALL, { scopeAgents: WITH_MANAGER, now: NOW, days: 2 });
    const ultimo = series[series.length - 1];

    check(
      'panel · the last point is the panel number with the manager',
      ultimo?.isCurrent === true && ultimo.score === estado.controlSummary.scoreAverage,
      `${ultimo?.score} frente a ${estado.controlSummary.scoreAverage}`
    );

    const agentSeries = buildENSComplianceTimeline(LEVEL, ALL, { agentId: '001', scopeAgents: WITH_MANAGER, now: NOW, days: 2 });
    const vista = getENSComplianceState(LEVEL, ALL, '001', WITH_MANAGER, NOW);

    check(
      'an agent\'s panel · the last point is its view\'s',
      agentSeries[agentSeries.length - 1]?.score === vista.controlSummary.scoreAverage
    );

    const controlSeries = buildENSControlComplianceTimeline('op.exp.7', LEVEL, ALL, {
      agentId: '001',
      scopeAgents: WITH_MANAGER,
      now: NOW,
      days: 2,
    });
    const ofManager = byControl(managerRow.results).get('op.exp.7');

    check(
      'op.exp.7 detail in an agent\'s view · the last point is the manager\'s',
      controlSeries[controlSeries.length - 1]?.status === ofManager?.status &&
        controlSeries[controlSeries.length - 1]?.score === ofManager?.score,
      fingerprint(controlSeries[controlSeries.length - 1])
    );
  }

  ensConfigurationRepository.reset();

  if (failures.length) {
    console.log(`\n${failures.length} check(s) FAIL:`);
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\nALL OK');
};
