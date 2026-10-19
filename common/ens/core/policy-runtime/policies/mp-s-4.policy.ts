import { ENSPolicyDefinition } from '../types';

export const mpS4PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.s.4',
  controlId: 'mp.s.4',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.s.4.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01', 'EV-04', 'EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.4.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03'],
      evidenceIds: ['EV-02', 'EV-04', 'EV-10'],
      ruleType: 'TOOL_MATCH',
    },
    {
      requirementId: 'mp.s.4.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-04', 'P-07'],
      evidenceIds: ['EV-03', 'EV-04', 'EV-07', 'EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.4.r1.2',
      levels: ['ALTO'],
      parameterIds: ['P-05', 'P-06'],
      evidenceIds: ['EV-05', 'EV-06'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.s.4.r2.1',
      levels: [],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-08', 'EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
