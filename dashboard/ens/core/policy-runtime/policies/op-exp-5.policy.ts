import { ENSPolicyDefinition } from '../types';

export const opExp5PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.exp.5',
  controlId: 'op.exp.5',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.exp.5.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.5.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-03'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.3',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.4',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04'],
      evidenceIds: ['EV-04'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.5',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-06', 'EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-07', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.r1.2',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-08'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.r1.3',
      levels: ['ALTO'],
      parameterIds: [],
      evidenceIds: ['EV-03'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
