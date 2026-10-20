import { ENSPolicyDefinition } from '../types';

export const mpEq2PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.eq.2',
  controlId: 'mp.eq.2',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.eq.2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03', 'P-04', 'P-05'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'mp.eq.2.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-02', 'EV-04'],
      ruleType: 'MAX_AGE',
    },
  ],
};
