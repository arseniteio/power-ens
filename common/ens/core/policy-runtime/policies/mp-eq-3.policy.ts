import { ENSPolicyDefinition } from '../types';

export const mpEq3PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.eq.3',
  controlId: 'mp.eq.3',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.eq.3.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'mp.eq.3.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-08'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.eq.3.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-05'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.eq.3.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05', 'P-08'],
      evidenceIds: ['EV-03', 'EV-06'],
      ruleType: 'PATH_MATCH',
    },
    {
      requirementId: 'mp.eq.3.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-04', 'EV-08'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.eq.3.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
