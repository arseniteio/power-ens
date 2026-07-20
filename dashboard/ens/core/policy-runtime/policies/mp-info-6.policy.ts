import { ENSPolicyDefinition } from '../types';

export const mpInfo6PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.info.6',
  controlId: 'mp.info.6',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.info.6.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-10'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.info.6.2.a',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'mp.info.6.2.b',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-06'],
      evidenceIds: ['EV-03', 'EV-07'],
      ruleType: 'MIN_RETENTION',
    },
    {
      requirementId: 'mp.info.6.2.c',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.info.6.2.d',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-06', 'P-07'],
      evidenceIds: ['EV-03', 'EV-04'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.info.6.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-04', 'P-05', 'P-10'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'mp.info.6.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-06'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
