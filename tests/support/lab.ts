import { ENS_CONFIGURATION_INDEX, ENS_VERDICTS_INDEX } from '../../common/constants';
import { defaultENSConfigurationTemplate } from '../../common/ens/configuration/data/default-configuration';
import type { ENSEngineVerdict } from '../../common/ens/core/engine-verdicts';
import { createEvaluationService } from '../../server/lib/evaluation/evaluation-service';
import type { ENSEvaluationServiceOptions } from '../../server/lib/evaluation/evaluation-service';
import { createFakeIndexer, FakeDoc } from './fake-indexer';

const HOUR = 3600e3;

export const createClock = (start = '2026-10-17T12:00:00Z') => {
  let now = new Date(start);
  return {
    now: () => now,
    hoursAgo: (hours: number) => new Date(now.getTime() - hours * HOUR).toISOString(),
    advance: (hours: number) => {
      now = new Date(now.getTime() + hours * HOUR);
    },
  };
};

type Clock = ReturnType<typeof createClock>;

interface Machine {
  id: string;
  name: string;
}

export const AGENT: Machine = { id: '001', name: 'lab-agent-01' };
export const MANAGER: Machine = { id: '000', name: 'wazuh.manager' };

let sequence = 0;

const verdictDoc = (verdict: ENSEngineVerdict): FakeDoc => ({
  _id: `verdict-${++sequence}`,
  _index: ENS_VERDICTS_INDEX,
  _source: { oscompliance_verdict: '1', ...verdict },
});

interface PassSpec {
  control?: string;
  machine?: Machine;
  at: string;
  status: string;
  score?: number;
  requirements?: Partial<ENSEngineVerdict>[];
  evidences?: Partial<ENSEngineVerdict>[];
}

export const enginePass = ({ control = 'op.acc.1', machine = AGENT, at, status, score, requirements = [], evidences = [] }: PassSpec): FakeDoc[] => {
  const common = { '@timestamp': at, control, agent: { id: machine.id, name: machine.name } };
  return [
    verdictDoc({ ...common, scope: 'control', status, score, coverage: 100, reason: 'control verdict' } as ENSEngineVerdict),
    ...requirements.map(r => verdictDoc({ ...common, scope: 'requirement', status: 'COMPLIANT', evidenced: true, ...r } as ENSEngineVerdict)),
    ...evidences.map(e => verdictDoc({ ...common, scope: 'evidence', status: 'COMPLIANT', ...e } as ENSEngineVerdict)),
  ];
};

export const inventoryDoc = (machine: Machine, clock: Clock, groups = ['ens'], platform?: string): FakeDoc => ({
  _id: `monitoring-${machine.id}`,
  _index: 'wazuh-monitoring-2026.10.17',
  _source: { id: machine.id, name: machine.name, group: groups, status: 'active', timestamp: clock.hoursAgo(0.1), manager: 'manager', ...(platform ? { os: { platform } } : {}) },
});

export const activeConfiguration = (change: (configuration: any) => void = () => undefined): FakeDoc => {
  const configuration: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
  configuration.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
  configuration.updatedAt = '2026-10-14T10:00:00.000Z';
  change(configuration);
  return {
    _id: 'active',
    _index: ENS_CONFIGURATION_INDEX,
    _source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt: configuration.updatedAt },
  };
};

const silentLogger: any = { info() {}, warn() {}, debug() {}, error() {} };

export const createLab = (docs: FakeDoc[], clock: Clock, options: Partial<ENSEvaluationServiceOptions> = {}, latencyMs = 0, missingIndices: string[] = []) => {
  const index = createFakeIndexer(docs, { clock: () => clock.now().getTime(), user: { user_name: 'ana', roles: ['all_access'] }, latencyMs, missingIndices });
  const clients = { asCurrentUser: index, asInternalUser: index };
  const service = createEvaluationService({ logger: silentLogger, securityEnabled: true, clock: clock.now, firstResponseMs: 60000, ...options });
  return { index, clients, service };
};

export const waitUntil = async (done: () => boolean | Promise<boolean>, timeoutMs = 3000) => {
  const start = Date.now();
  while (!(await done())) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
