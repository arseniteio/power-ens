import { ENSPolicyDefinition } from '../types';

export const opAcc2PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.acc.2',
  controlId: 'op.acc.2',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.acc.2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03', 'P-07'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.2.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-03', 'EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.2.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-02', 'EV-03', 'EV-07'],
      ruleType: 'PATH_MATCH',
    },
    {
      requirementId: 'op.acc.2.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-05'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.2.r1.2',
      levels: ['ALTO'],
      parameterIds: ['P-05', 'P-06'],
      evidenceIds: ['EV-05', 'EV-06'],
      ruleType: 'WHITELIST',
    },
  ],
};
