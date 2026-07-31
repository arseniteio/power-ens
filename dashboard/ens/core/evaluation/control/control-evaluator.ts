import { ENSComplianceStatus } from '../types';
import { ENSRequirementEvaluationResult } from '../requirement';
import { scoreByStatus } from '../utils/score';

export interface ENSControlEvaluationResult {
  status: ENSComplianceStatus;

  // Ausente cuando el control no se puede puntuar (NO_EVALUABLE, NO_APLICA).
  // Ver el comentario de `score` en `../types`.
  score?: number;

  coverage: number;

  applicableRequirements: number;
  measuredRequirements: number;
  unmeasuredRequirements: string[];
}

/**
 * Estado y porcentaje del control a partir de sus requisitos.
 *
 * El criterio es el mismo que aplican los tres agentes desde el 30/07 (63ac3bc
 * en op.acc.1, 706f04c en mp.info.6, 26b4dd5 en op.acc.2):
 *
 *   hay >=1 requisito NO_CUMPLE o PARCIAL demostrado -> NO_CUMPLE o PARCIAL
 *   ninguno, y todo lo evaluable en CUMPLE           -> CUMPLE
 *   ninguno, pero quedan requisitos sin medir        -> NO_EVALUABLE, sin número
 *
 * Y el denominador del porcentaje son los requisitos MEDIDOS, no todos los
 * aplicables. Con el denominador completo, un requisito sin medir restaría
 * EXACTAMENTE IGUAL que uno incumplido, y el error que la regla de arriba evita
 * volvería por la puerta del número.
 */
export const evaluateControlStatus = (
  requirements: ENSRequirementEvaluationResult[]
): ENSControlEvaluationResult => {
  const applicable = requirements.filter(
    requirement => requirement.status !== 'NO_APLICA'
  );

  if (!applicable.length) {
    // SIN número, no un 0. Un control que no aplica no es un control que se
    // incumple, y el 0 se pinta en rojo igual que un incumplimiento real.
    return {
      status: 'NO_APLICA',
      score: undefined,
      coverage: 0,
      applicableRequirements: 0,
      measuredRequirements: 0,
      unmeasuredRequirements: [],
    };
  }

  // Medido = el motor ha podido pronunciarse: CUMPLE, NO_CUMPLE o PARCIAL.
  // NO_EVALUABLE es exactamente lo contrario, y es lo que sale del denominador.
  const unmeasured = applicable.filter(
    requirement => requirement.status === 'NO_EVALUABLE'
  );

  const measured = applicable.filter(
    requirement => requirement.status !== 'NO_EVALUABLE'
  );

  const coverage = Math.round((measured.length / applicable.length) * 100);

  const counters = {
    applicableRequirements: applicable.length,
    measuredRequirements: measured.length,
    unmeasuredRequirements: unmeasured.map(requirement => requirement.id),
  };

  // Un incumplimiento demostrado SIEMPRE manda sobre un hueco de medida: esta
  // rama va la primera y conserva el criterio de siempre, para que un NO_CUMPLE
  // real siga saliendo igual de rojo aunque falten datos en otra parte.
  const hasDemonstratedFailure = measured.some(
    requirement =>
      requirement.status === 'NO_CUMPLE' || requirement.status === 'PARCIAL'
  );

  if (hasDemonstratedFailure) {
    const score = Math.round(
      measured.reduce(
        (sum, requirement) => sum + scoreByStatus(requirement.status),
        0
      ) / measured.length
    );

    const some = (value: ENSComplianceStatus) =>
      measured.some(requirement => requirement.status === value);

    return {
      status:
        some('NO_CUMPLE') && !some('CUMPLE') && !some('PARCIAL')
          ? 'NO_CUMPLE'
          : 'PARCIAL',
      score,
      coverage,
      ...counters,
    };
  }

  if (unmeasured.length) {
    // Sin número, igual que el `score_snapshot` del agente: un porcentaje
    // calculado sobre requisitos que no se han medido se lee como cumplimiento
    // parcial, que es justo lo que no se puede afirmar. Y publicar en su lugar
    // el 100 de lo medido sería peor: un CUMPLE del 100 % sobre media máquina.
    // `unmeasuredRequirements` dice CUÁLES faltan, que es lo accionable.
    return {
      status: 'NO_EVALUABLE',
      score: undefined,
      coverage,
      ...counters,
    };
  }

  // Sin incumplidores y sin huecos, todo lo aplicable está medido y en CUMPLE:
  // el 100 es exacto, no hay redondeo que pueda enmascarar nada. Es la única
  // línea de la que sale un CUMPLE, y solo se llega a ella con `unmeasured`
  // vacío; hacerlo imposible por estructura es más fuerte que comprobarlo.
  return {
    status: 'CUMPLE',
    score: 100,
    coverage,
    ...counters,
  };
};
