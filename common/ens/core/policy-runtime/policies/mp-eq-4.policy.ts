import { ENSPolicyDefinition } from '../types';

export const mpEq4PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.eq.4',
  controlId: 'mp.eq.4',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.eq.4.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-06'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-07'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.eq.4.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-04', 'EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.eq.4.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.eq.4.r2.1',
      levels: [],
      parameterIds: ['P-03', 'P-08'],
      evidenceIds: ['EV-01', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
