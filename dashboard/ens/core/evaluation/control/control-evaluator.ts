import { ENSComplianceStatus } from '../types';
import { ENSRequirementEvaluationResult } from '../requirement';
import { requirementVerdict, scoreByStatus } from '../utils';

export interface ENSControlEvaluationResult {
  status: ENSComplianceStatus;

  // Ausente SOLO cuando no hay ningún requisito aplicable (NO_APLICA). Todo lo
  // que aplica trae número, porque todo lo que aplica tiene veredicto.
  score?: number;

  coverage: number;

  applicableRequirements: number;
  measuredRequirements: number;
  unmeasuredRequirements: string[];
}

/**
 * Estado y porcentaje del control a partir de sus requisitos.
 *
 * Criterio vigente desde el 04/08 (decisión del responsable). Lo que no se
 * puede demostrar cuenta en contra:
 *
 *   todo lo aplicable en CUMPLE                  -> CUMPLE, 100
 *   todo lo aplicable en NO_CUMPLE               -> NO_CUMPLE
 *   mezcla                                        -> PARCIAL
 *   nada aplicable                                -> NO_APLICA, sin número
 *
 * y el requisito que no se ha podido demostrar entra en la cuenta como
 * NO_CUMPLE, se etiquete como se etiquete (`requirementVerdict`).
 *
 * **El denominador vuelve a ser `applicableRequirements`.** Entre el 30/07 y el
 * 04/08 fue `measuredRequirements`, y era lo correcto MIENTRAS un requisito sin
 * medir no fuera un incumplimiento: dejarlo en el denominador lo hacía restar
 * exactamente igual que uno incumplido, y ese era el error. Con el criterio
 * nuevo eso deja de ser un error y pasa a ser la definición. Además, el
 * denominador de lo medido tiene un efecto perverso que ahora sería inaceptable:
 * cuanto menos se mide, más sube el porcentaje —una máquina con siete requisitos
 * en gris y uno conforme publicaba un 100 %—.
 *
 * `measuredRequirements` se sigue calculando y publicando, pero ya no divide
 * nada: es el diagnóstico que acompaña al número.
 */
export const evaluateControlStatus = (
  requirements: ENSRequirementEvaluationResult[]
): ENSControlEvaluationResult => {
  const applicable = requirements.filter(
    requirement => requirementVerdict(requirement) !== 'NO_APLICA'
  );

  if (!applicable.length) {
    // SIN número, no un 0. Un control que no aplica no es un control que se
    // incumple, y el 0 se pinta en rojo igual que un incumplimiento real. Es lo
    // que permite que un cliente de nivel BAJO llegue al 100 % sin arrastrar los
    // refuerzos de MEDIO y ALTO.
    return {
      status: 'NO_APLICA',
      score: undefined,
      coverage: 0,
      applicableRequirements: 0,
      measuredRequirements: 0,
      unmeasuredRequirements: [],
    };
  }

  // Medido = el motor ha podido pronunciarse mirando algo. Ya NO se deduce del
  // estado: un NO_CUMPLE medido y uno no evidenciado son el mismo estado, y
  // `evidenced` es lo único que los separa.
  const unmeasured = applicable.filter(
    requirement => requirement.evidenced === false
  );

  const measured = applicable.filter(
    requirement => requirement.evidenced !== false
  );

  const coverage = Math.round((measured.length / applicable.length) * 100);

  const counters = {
    applicableRequirements: applicable.length,
    measuredRequirements: measured.length,
    unmeasuredRequirements: unmeasured.map(requirement => requirement.id),
  };

  const some = (value: ENSComplianceStatus) =>
    applicable.some(requirement => requirementVerdict(requirement) === value);

  // Sin nada que incumpla ni que conforme a medias, todo lo aplicable está en
  // CUMPLE: el 100 es exacto y no hay redondeo que pueda enmascarar nada. Es la
  // única línea de la que sale un CUMPLE.
  if (!some('NO_CUMPLE') && !some('PARCIAL')) {
    return {
      status: 'CUMPLE',
      score: 100,
      coverage,
      ...counters,
    };
  }

  const score = Math.round(
    applicable.reduce(
      (sum, requirement) => sum + scoreByStatus(requirementVerdict(requirement)),
      0
    ) / applicable.length
  );

  return {
    status:
      some('NO_CUMPLE') && !some('CUMPLE') && !some('PARCIAL')
        ? 'NO_CUMPLE'
        : 'PARCIAL',
    score,
    coverage,
    ...counters,
  };
};
