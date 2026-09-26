import { ENSPolicyDefinition } from '../types';

export const opExp9PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.exp.9',
  controlId: 'op.exp.9',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.exp.9.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.9.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04', 'P-05', 'P-06'],
      evidenceIds: ['EV-05', 'EV-06', 'EV-07', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.9.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-08', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
