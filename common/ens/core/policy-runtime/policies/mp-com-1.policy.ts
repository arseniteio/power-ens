import { ENSPolicyDefinition } from '../types';

export const mpCom1PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.mp.com.1',
  controlId: 'mp.com.1',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'mp.com.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03', 'P-05'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-07', 'EV-08'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.com.1.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04', 'P-05'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-06', 'EV-07', 'EV-08'],
      ruleType: 'WHITELIST',
    },
  ],
};
