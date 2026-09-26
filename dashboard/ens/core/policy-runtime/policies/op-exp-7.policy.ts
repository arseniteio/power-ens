import { ENSPolicyDefinition } from '../types';

export const opExp7PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.exp.7',
  controlId: 'op.exp.7',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.exp.7.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-05', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r2.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-03'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.7.r2.3',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04'],
      evidenceIds: ['EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r2.4',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: ['EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-09', 'P-10'],
      evidenceIds: ['EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r3.2',
      levels: ['ALTO'],
      parameterIds: ['P-11'],
      evidenceIds: ['EV-10'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.7.r4.1',
      levels: [],
      parameterIds: [],
      evidenceIds: ['EV-11'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
