import { ENSPolicyDefinition } from '../types';

export const opNub1PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.nub.1',
  controlId: 'op.nub.1',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.nub.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.nub.1.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-06', 'P-08', 'P-09', 'P-10', 'P-11', 'P-12', 'P-13'],
      evidenceIds: ['EV-01', 'EV-04', 'EV-07', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.nub.1.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04'],
      evidenceIds: ['EV-08'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.nub.1.r1.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.nub.1.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-06', 'P-07'],
      evidenceIds: ['EV-02'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
