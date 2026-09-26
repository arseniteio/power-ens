import { ENSPolicyDefinition } from '../types';

export const opExp10PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.exp.10',
  controlId: 'op.exp.10',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.exp.10.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-07', 'P-08'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-07', 'EV-08'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.10.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-05'],
      ruleType: 'TOOL_MATCH',
    },
    {
      requirementId: 'op.exp.10.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-06'],
      ruleType: 'PATH_MATCH',
    },
    {
      requirementId: 'op.exp.10.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04'],
      evidenceIds: ['EV-03', 'EV-04', 'EV-07'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.10.r2.1',
      levels: [],
      parameterIds: ['P-09'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
