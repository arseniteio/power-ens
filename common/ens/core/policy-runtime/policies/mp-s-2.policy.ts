import { ENSPolicyDefinition } from '../types';

export const mpS2PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.s.2',
  controlId: 'mp.s.2',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.s.2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-05'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.2.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-01', 'EV-07', 'EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.2.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-01', 'EV-08', 'EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.s.2.r1.1',
      levels: ['BAJO', 'MEDIO'],
      parameterIds: ['P-07', 'P-08'],
      evidenceIds: ['EV-11'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.s.2.r1.2',
      levels: ['BAJO', 'MEDIO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-11'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.s.2.r2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07', 'P-08'],
      evidenceIds: ['EV-11'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.s.2.r2.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-10', 'EV-11'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.s.2.r2.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-12'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'mp.s.2.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-10'],
      evidenceIds: ['EV-13'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
