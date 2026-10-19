import { ENSPolicyDefinition } from '../types';

// Evaluator deliberately disconnected: op.acc.1 evaluates from `evidence_state` like the other
// controls. `op-acc-1.evaluator.ts` is kept as the starting point of the raw-facts migration.
export const opAcc1PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.acc.1',
  controlId: 'op.acc.1',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.acc.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-04'],
      evidenceIds: ['EV-03'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.acc.1.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-05', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-05', 'P-06', 'P-08'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-08'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.acc.1.5',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.r1.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: ['EV-01', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.r1.3',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-01', 'EV-07'],
      ruleType: 'WHITELIST',
    },
  ],
};
