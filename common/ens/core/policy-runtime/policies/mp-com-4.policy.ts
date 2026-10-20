import { ENSPolicyDefinition } from '../types';

export const mpCom4PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.com.4',
  controlId: 'mp.com.4',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.com.4.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-07'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-09', 'EV-10'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.com.4.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-04'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.com.4.r1.1',
      levels: ['MEDIO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.com.4.r1.2',
      levels: ['MEDIO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-08'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.com.4.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.com.4.r3.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.com.4.r4.1',
      levels: ['ALTO'],
      parameterIds: ['P-05', 'P-06'],
      evidenceIds: ['EV-05', 'EV-06'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.com.4.r4.2',
      levels: ['ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
