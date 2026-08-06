import { ENSPolicyDefinition } from '../types';

export const opAcc3PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.acc.3',
  controlId: 'op.acc.3',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.acc.3.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-06'],
      evidenceIds: ['EV-01', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.3.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-06'],
      evidenceIds: ['EV-02', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.3.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-04', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.3.r1.2',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-05'],
      evidenceIds: ['EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.3.r2.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.3.r3.1',
      levels: [],
      parameterIds: [],
      evidenceIds: ['EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
