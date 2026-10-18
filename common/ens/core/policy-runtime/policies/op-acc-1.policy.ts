import { ENSPolicyDefinition } from '../types';

// Evaluador desconectado a propósito (2026-07-30).
//
// `op-acc-1.evaluator.ts` sigue en el repo y no se borra: son 2.491 líneas que
// implementan el modelo hacia el que el producto quiere migrar —el agente emite
// hechos técnicos crudos y el motor juzga— y es el punto de partida de esa
// migración cuando se aborde para los tres controles a la vez.
//
// Por qué se desconecta ahora: era el ÚNICO control con evaluador. mp.info.6 y
// op.acc.2 consolidan desde `evidence_state`, y los agentes desplegados emiten
// ese contrato. Con el evaluador activo, op.acc.1 no reconocía el vocabulario
// de sus propios agentes y salía NO_EVALUABLE al 0 % mientras sus ocho
// evidencias se mostraban correctamente: dos caminos de evaluación en el mismo
// plugin dando respuestas distintas sobre los mismos datos.
//
// `policy-runtime.ts` usa el evaluador solo si la policy lo declara; sin esta
// línea, op.acc.1 recorre el mismo camino que los otros dos. Migrar es
// deseable; migrar un control de tres no lo es.
export const opAcc1PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.acc.1',
  controlId: 'op.acc.1',
  version: '1.0.0',
  requirements: [
    {
      requirementId: 'op.acc.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-04'],
      evidenceIds: ['EV-03'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.acc.1.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-05', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-05', 'P-06', 'P-08'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-08'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.acc.1.5',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.r1.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: ['EV-01', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.1.r1.3',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-01', 'EV-07'],
      ruleType: 'WHITELIST',
    },
  ],
};
