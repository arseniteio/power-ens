// Las evidencias que una policy declara haber medido, resueltas por ella.
//
// POR QUÉ EXISTE. op.acc.3 se veía así en producción el 07/08/2026:
//
//     Cumplimiento del control        100 %  CUMPLE
//     Requisitos  2 de 2 cumplen
//     Evidencias  0 de 7 cumplen · 5 sin prueba
//
// Un control al 100 % en el que NADA se había podido demostrar. Cualquiera que
// lo mire deja de fiarse del informe entero, y hace bien.
//
// La causa es que op.acc.3 es un híbrido a medio hacer. Sus REQUISITOS los
// decide una policy que lee los hechos crudos (`account_action`) y los
// correlaciona; sus EVIDENCIAS están declaradas en el modelo clásico, esperando
// un `evidence_state` que su agente NO EMITE —precisamente porque juzga la
// policy— y sin `judgment` con el que derivarlo. Eran estructuralmente
// incapaces de salir de NO_EVALUABLE: no es que faltara un dato, es que no
// había ningún camino por el que pudieran resolverse jamás.
//
// Y como `requirement-evaluator` deja que la decisión de la policy sustituya a
// las evidencias, el requisito salía CUMPLE y la evidencia que lo respalda
// seguía diciendo «sin prueba», en la misma pantalla y a diez centímetros.
//
// LO QUE NO ES ESTE MÓDULO. No inventa una medida: la policy YA midió, y sus
// decisiones declaran `evidenceIds` con las evidencias sobre las que midió.
// Aquí solo se lleva ese resultado a la capa que lo enseña, para que las dos
// digan lo mismo. Si la policy no nombra una evidencia, esa evidencia se queda
// como estaba.
//
// Y NUNCA PISA UNA MEDIDA. Si una evidencia ya tiene veredicto propio —del
// agente, de una primitiva— manda ella. La policy solo rellena el hueco que el
// modelo clásico dejó vacío: cambiar un NO_CUMPLE observado por un CUMPLE de
// policy sería exactamente el CUMPLE falso que esto viene a quitar.
import { ENSEvidenceResolved } from '../evidence/types';
import { ENSPolicyDecision } from '../policy-runtime/types';

// Solo se rellena lo que el modelo clásico no pudo resolver. Un `NO_APLICA` es
// una decisión de nivel y tampoco se toca.
const SE_PUEDE_RELLENAR = ['NO_EVALUABLE'];

export const applyPolicyDecisionsToEvidences = (
  evidences: ENSEvidenceResolved[],
  decisions: ENSPolicyDecision[] = []
): ENSEvidenceResolved[] => {
  if (!decisions.length) {
    return evidences;
  }

  // Una evidencia puede aparecer en varias decisiones. Gana la PEOR, por la
  // misma razón que en la consolidación entre máquinas: si un requisito que se
  // apoya en ella no conforma, la evidencia no puede salir en verde.
  const peorPorEvidencia = new Map<string, ENSPolicyDecision>();

  const gravedad = (estado: string): number =>
    estado === 'NO_CUMPLE' ? 3 : estado === 'PARCIAL' ? 2 : estado === 'NO_EVALUABLE' ? 1 : 0;

  decisions.forEach(decision => {
    (decision.evidenceIds || []).forEach(evidenceId => {
      const actual = peorPorEvidencia.get(evidenceId);

      if (!actual || gravedad(decision.status) > gravedad(actual.status)) {
        peorPorEvidencia.set(evidenceId, decision);
      }
    });
  });

  if (!peorPorEvidencia.size) {
    return evidences;
  }

  return evidences.map(evidence => {
    const decision = peorPorEvidencia.get(evidence.id);

    if (!decision) {
      return evidence;
    }

    if (!SE_PUEDE_RELLENAR.includes(evidence.status)) {
      return evidence;
    }

    return {
      ...evidence,
      status: decision.status,
      // Se dice QUIÉN lo decidió. Un auditor tiene que poder distinguir una
      // evidencia que el agente declaró de una que dedujo el motor
      // correlacionando, porque la traza que sigue después es distinta.
      observations: [
        `Resuelta por la política del control (${decision.policyId || 'policy'}), que mide esta evidencia junto a ${decision.requirementId}: ${decision.reason}`,
        ...evidence.observations,
      ],
    };
  });
};
