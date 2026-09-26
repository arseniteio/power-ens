import { ENSPolicyDefinition } from '../types';

export const opExp8PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.exp.8',
  controlId: 'op.exp.8',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.exp.8.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-13'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.8.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-02', 'EV-04'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.8.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.8.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05', 'P-06'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.8.r3.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'MIN_RETENTION',
    },
    {
      requirementId: 'op.exp.8.r4.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-08', 'EV-09', 'EV-13'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.8.r5.1',
      levels: ['ALTO'],
      parameterIds: ['P-10'],
      evidenceIds: ['EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.8.r5.2',
      levels: ['ALTO'],
      parameterIds: ['P-11'],
      evidenceIds: ['EV-11', 'EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
