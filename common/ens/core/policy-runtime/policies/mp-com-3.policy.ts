import { ENSPolicyDefinition } from '../types';

export const mpCom3PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.com.3',
  controlId: 'mp.com.3',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.com.3.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.com.3.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04'],
      evidenceIds: ['EV-04', 'EV-05', 'EV-06', 'EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.com.3.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-09'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.com.3.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-06'],
      evidenceIds: ['EV-08'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.com.3.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-02', 'EV-03', 'EV-10'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.com.3.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.com.3.r4.1',
      levels: ['ALTO'],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-11'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'mp.com.3.r5.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
