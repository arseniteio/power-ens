import { ENSPolicyDefinition } from '../types';

export const opExp2PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.exp.2',
  controlId: 'op.exp.2',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.exp.2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.2.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-05'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-06'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.2.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-04', 'P-05'],
      evidenceIds: ['EV-01', 'EV-04', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.2.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-05'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
