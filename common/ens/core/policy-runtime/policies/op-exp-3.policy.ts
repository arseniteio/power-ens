import { ENSPolicyDefinition } from '../types';

// op.exp.3 has no runtime module (like op.acc.4): each requirement is the rollup of its evidences
// and the comparison against the policy lives in each evidence's `judgment` in
// `core/evidence/catalog.ts`.
// Every requirement therefore declares COVERAGE_REQUIRED; declaring MAX_AGE, WHITELIST or
// CONDITIONAL_REQUIRED would promise an imperative layer that does not exist.
// Levels are cumulative: base in all three, R1 from MEDIO, R2 and R3 only in ALTO, R4 and R5 in
// none.
export const opExp3PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.exp.3',
  controlId: 'op.exp.3',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.exp.3.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04'],
      evidenceIds: ['EV-01', 'EV-04', 'EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-01', 'EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.5',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: ['EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.6',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04'],
      evidenceIds: ['EV-02'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-ATT'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.r1.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-05', 'P-08'],
      evidenceIds: ['EV-03', 'EV-11'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.r1.3',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-03', 'P-09'],
      evidenceIds: ['EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-07', 'P-10'],
      evidenceIds: ['EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.r4.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.3.r5.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
