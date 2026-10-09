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
  decisions: ENSPolicyDecision[] = [],
  // Los requisitos del catálogo, para saber qué evidencias demuestran cada uno.
  requirements: { id: string; evidenceIds: string[] }[] = [],
  // Si de esta máquina no ha llegado NINGÚN hecho del control. Ver abajo.
  nadaRecibido = false
): ENSEvidenceResolved[] => {
  if (!decisions.length) {
    return evidences;
  }

  // UNA DECISIÓN QUE NO NOMBRA SUS EVIDENCIAS HEREDA LAS DEL REQUISITO, y esto
  // no es una comodidad: es lo único que hace que las dos capas digan lo mismo
  // siempre y no solo cuando el autor de la policy se acordó de rellenar el
  // campo.
  //
  // En op.acc.3 solo la decisión de op.acc.3.2 declaraba `evidenceIds`. Las
  // otras tres iban con la lista vacía, así que EV-01 y EV-02 se quedaban en
  // «sin prueba» mientras los requisitos que se apoyan en ellas salían
  // decididos. En la misma pantalla: «EV-02 · sin prueba» arriba y
  // «op.acc.3.2 · CUMPLE» abajo.
  //
  // Que una policy decida un requisito significa, por definición, que ha medido
  // aquello con lo que ese requisito se demuestra. Si no dice cuáles, son las
  // suyas.
  const evidenciasDelRequisito = new Map(
    requirements.map(requisito => [requisito.id, requisito.evidenceIds || []])
  );

  const evidenciasDe = (decision: ENSPolicyDecision): string[] =>
    decision.evidenceIds?.length
      ? decision.evidenceIds
      : evidenciasDelRequisito.get(decision.requirementId) || [];

  // Una evidencia puede aparecer en varias decisiones. Gana la PEOR, por la
  // misma razón que en la consolidación entre máquinas: si un requisito que se
  // apoya en ella no conforma, la evidencia no puede salir en verde.
  const peorPorEvidencia = new Map<string, ENSPolicyDecision>();

  const gravedad = (estado: string): number =>
    estado === 'NO_CUMPLE' ? 3 : estado === 'PARCIAL' ? 2 : estado === 'NO_EVALUABLE' ? 1 : 0;

  decisions.forEach(decision => {
    // UNA ACREDITACIÓN DOCUMENTAL NO MIDE NINGUNA EVIDENCIA. Un CUMPLE con
    // `attested` dice que una DECLARACIÓN basta para el requisito, no que la
    // policy haya medido sus evidencias. Si rellenara una evidencia sin medir
    // con ese CUMPLE, la evidencia pasaría por medida y, con ella, cualquier
    // OTRO requisito que se apoye en ella saldría CUMPLE «medido» sobre un
    // documento ajeno: op.acc.1.2 acreditado dejaba op.acc.1.r1.2 en CUMPLE a
    // través de EV-06. La evidencia se queda como estaba. Una decisión
    // acreditada en cualquier otro estado no acredita nada (ver
    // `requirement-evaluator`) y sí cuenta aquí, como cualquier otra.
    if (decision.attested && decision.status === 'CUMPLE') {
      return;
    }

    evidenciasDe(decision).forEach(evidenceId => {
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

    // Si la policy tampoco ha podido medirla, la causa es la que ELLA declara:
    // es quien ha leído los hechos y los parámetros. Manda la de la decisión
    // que nombra solo a esta evidencia; si no la hay, la de la peor. Sin
    // causa declarada se conserva la que traía la evidencia.
    //
    // Con una excepción, la misma que ordena `resolveGapCause`: si de esta
    // máquina no ha llegado nada del control, el hueco es de RECOGIDA aunque la
    // policy, sin hechos que mirar, haya tropezado antes con un parámetro
    // vacío. Rellenar el parámetro no produce ninguna medida mientras el
    // recolector no informe, y quien tiene que actuar es otro.
    const declarada =
      decisions.find(
        d =>
          d.status === 'NO_EVALUABLE' &&
          d.cause &&
          d.evidenceIds?.length === 1 &&
          d.evidenceIds[0] === evidence.id
      )?.cause || decision.cause;

    const causa =
      decision.status !== 'NO_EVALUABLE'
        ? undefined
        : declarada && nadaRecibido
        ? 'COLLECTION'
        : declarada || evidence.gapCause;

    return {
      ...evidence,
      status: decision.status,
      gapCause: causa,
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
