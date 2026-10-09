import { ENSPolicyDefinition } from '../types';

export const opMon2PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.mon.2',
  controlId: 'op.mon.2',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.mon.2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-05', 'P-06'],
      evidenceIds: ['EV-02', 'EV-04'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.2.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-03'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.2.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04', 'P-05'],
      evidenceIds: ['EV-06'],
      ruleType: 'MAX_AGE',
    },
  ],
};
