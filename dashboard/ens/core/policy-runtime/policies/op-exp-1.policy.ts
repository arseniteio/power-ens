import { ENSPolicyDefinition } from '../types';

export const opExp1PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.exp.1',
  controlId: 'op.exp.1',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.exp.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-05'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.1.r1.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.1.r2.1',
      levels: [],
      parameterIds: [],
      evidenceIds: ['EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.1.r3.1',
      levels: [],
      parameterIds: ['P-06'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.1.r4.1',
      levels: [],
      parameterIds: [],
      evidenceIds: ['EV-02'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
