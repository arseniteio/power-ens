import { ENSPolicyDefinition } from '../types';

export const mpS1PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.s.1',
  controlId: 'mp.s.1',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.s.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.1.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-03'],
      evidenceIds: ['EV-06', 'EV-07', 'EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.1.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.1.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.1.5',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-01', 'EV-05'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.s.1.6',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-08'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.1.7',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-10'],
      ruleType: 'MAX_AGE',
    },
  ],
};
