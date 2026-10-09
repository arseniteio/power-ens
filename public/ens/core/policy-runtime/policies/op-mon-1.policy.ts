import { ENSPolicyDefinition } from '../types';

export const opMon1PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.mon.1',
  controlId: 'op.mon.1',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.mon.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-04', 'P-06', 'P-09', 'P-10'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.1.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-08'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-05', 'EV-08'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.1.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.1.r3.1',
      levels: [],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
