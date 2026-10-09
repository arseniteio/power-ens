import { ENSPolicyDefinition } from '../types';

export const opCont3PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.cont.3',
  controlId: 'op.cont.3',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.cont.3.1',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-05'],
      ruleType: 'MAX_AGE',
    },
  ],
};
