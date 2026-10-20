import { ENSPolicyDefinition } from '../types';

export const mpSw2PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.sw.2',
  controlId: 'mp.sw.2',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.sw.2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-04', 'P-05', 'P-06', 'P-07'],
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.sw.2.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-07', 'EV-08'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.sw.2.r2.1',
      levels: [],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
