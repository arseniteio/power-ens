import { ENSPolicyDefinition } from '../types';

export const opExp4PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.exp.4',
  controlId: 'op.exp.4',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.exp.4.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-05'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-05', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.4.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-04', 'P-08'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-07', 'EV-10'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.4.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04'],
      evidenceIds: ['EV-04'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.4.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.4.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.4.r3.1',
      levels: [],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-11'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.4.r4.1',
      levels: [],
      parameterIds: [],
      evidenceIds: ['EV-01', 'EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
