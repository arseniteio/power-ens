import { ENSPolicyDefinition } from '../types';

export const opAcc4PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.acc.4',
  controlId: 'op.acc.4',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.acc.4.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.4.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-06'],
      evidenceIds: ['EV-02', 'EV-03', 'EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.4.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.4.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-03'],
      evidenceIds: ['EV-03', 'EV-04', 'EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.4.5',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-04', 'P-05'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
