import { ENSPolicyDefinition } from '../types';

// op.exp.3 no tiene módulo de runtime, igual que op.acc.4: el veredicto de cada
// requisito sale del rollup de sus evidencias, y la comparación contra la
// política (lista, tabla, umbral, plazo) la hace el `judgment` de cada evidencia
// en `core/evidence/catalog.ts`.
//
// Por eso todos los requisitos declaran COVERAGE_REQUIRED. Declarar aquí
// MAX_AGE, WHITELIST o CONDITIONAL_REQUIRED prometería una capa imperativa que no
// existe para este control, y ese error no avisa: compila, despliega y evalúa por
// rollup igualmente. Lo que es cada comparación de verdad está en el catálogo:
//
//   op.exp.3.6    EV-02  NINGUNO_FUERA_DE_LISTA  P-03
//   op.exp.3.r1.2 EV-03  NINGUNO_FUERA_DE_LISTA  P-01
//                 EV-11  ANTIGUEDAD_MAXIMA       P-05
//   op.exp.3.1    EV-04  CONFORME_A_TABLA        P-02   (y EV-01, EV-10)
//   op.exp.3.r1.3 EV-04  CONFORME_A_TABLA        P-02
//   op.exp.3.r2.1 EV-08  UMBRAL_MAXIMO           P-09
//   op.exp.3.r3.1 EV-09  ANTIGUEDAD_MAXIMA       P-10
//
// Los niveles son acumulativos: base en los tres, R1 desde MEDIO, R2 y R3 solo en
// ALTO, R4 y R5 en ninguno.
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
