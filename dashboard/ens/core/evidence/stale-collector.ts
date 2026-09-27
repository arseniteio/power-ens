// Datos sin renovar: un control no se juzga con lo que su recolector dejó de
// enviar hace días.
//
// POR QUÉ. El motor juzga el estado con la última pasada del recolector (ver
// `state-facts.ts`), y eso es lo correcto mientras el recolector sigue pasando.
// Cuando deja de hacerlo —el LDAP (028) cayó el 25/09—, «la última pasada» es
// una foto vieja, y el panel enseñaba op.acc.3 al 100 % CUMPLE con los datos del
// 25 como si fueran de hoy. Eso es un CUMPLE que nadie ha demostrado HOY: lo que
// dijo la máquina hace dos días no prueba cómo está ahora.
//
// LA REGLA (decisión del 27/09). En la fila de una máquina, si el último latido
// `collector_run` de un control es más antiguo que `STALE_COLLECTOR_MAX_AGE_HOURS`
// respecto al instante de la evaluación, ese control en esa máquina no se juzga
// con esos datos: todas sus evidencias salen NO_EVALUABLE con causa COLLECTION
// y el motivo «sin datos del recolector desde <fecha UTC>», y sus requisitos no
// cumplen porque no se han demostrado. No es un hallazgo sobre la máquina: es un
// fallo de recogida, y la tarjeta lo dice así.
//
// SIN NINGÚN LATIDO PERO CON HECHOS (datos huérfanos) rige lo mismo, con el
// hecho más reciente del control como referencia: sin latido no hay otra señal
// de cuándo miró el recolector por última vez.
//
// SIN LATIDO NI HECHOS no se hace nada: el motor ya lo resuelve como «no ha
// llegado nada» (NO_EVALUABLE / COLLECTION) por su camino de siempre.
//
// SE MIDE A FECHA DE `now`, no del reloj. La serie diaria evalúa este mismo
// motor en días pasados: el punto del 24/09 tiene que ver al 028 vivo, porque
// ese día lo estaba.
//
// LO QUE NO TOCA. Lo que viene de la configuración y no de los datos: un
// requisito que la policy saca del juego (NO_APLICA por el refuerzo elegido) o
// una evidencia que no aplica al nivel siguen fuera del denominador. Tampoco se
// esconden los hechos viejos: siguen en la trazabilidad, que es donde el
// auditor ve qué llegó y cuándo.
import type { ENSNormalizedEvent } from '../data-source/types';
import type { ENSPolicyRuntimeResult } from '../policy-runtime/types';
import type { ENSEvidenceResolved } from './types';

// Umbral ÚNICO de antigüedad del último latido. Los recolectores laten cada
// hora (op.exp.1 cada 6 h y op.exp.2 cada 12 h en la instalación de
// referencia), así que 24 h tolera un día de fallos de red sin dejar de
// reconocer un recolector vivo, y es el mismo margen que ya usa por defecto la
// cobertura del latido de las evidencias con `judgment`.
export const STALE_COLLECTOR_MAX_AGE_HOURS = 24;

const STALE_COLLECTOR_MAX_AGE_MS =
  STALE_COLLECTOR_MAX_AGE_HOURS * 60 * 60 * 1000;

const COLLECTOR_RUN_EVENT_TYPE = 'collector_run';

export interface ENSStaleCollector {
  // Instante del último latido (o del último hecho, si no hay latido).
  since: string;
  // Si la referencia es un latido o, a falta de él, un hecho huérfano.
  reference: 'collector_run' | 'fact';
  reason: string;
}

// `2026-09-25 12:33 UTC`. En UTC a propósito: el motivo lo leen el panel, el
// informe y el auditor, y cada uno puede estar en una zona distinta.
const formatUtc = (time: number): string =>
  `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// ¿Se ha dejado de renovar el control en esta máquina? `events` son los de UNA
// fila: el motor solo lo pregunta con la máquina fijada.
export const findStaleCollector = (
  controlId: string,
  events: ENSNormalizedEvent[],
  now: Date = new Date()
): ENSStaleCollector | undefined => {
  const nowMs = now.getTime();

  let lastRun: number | undefined;
  let lastFact: number | undefined;

  events.forEach(event => {
    if (event.controlId !== controlId) {
      return;
    }

    const time = Date.parse(event.timestamp);

    // Lo posterior a `now` no existía en el instante evaluado.
    if (Number.isNaN(time) || time > nowMs) {
      return;
    }

    if (event.eventType === COLLECTOR_RUN_EVENT_TYPE) {
      lastRun = Math.max(lastRun ?? time, time);
    } else {
      lastFact = Math.max(lastFact ?? time, time);
    }
  });

  const reference = lastRun ?? lastFact;

  if (reference === undefined || nowMs - reference <= STALE_COLLECTOR_MAX_AGE_MS) {
    return undefined;
  }

  const since = formatUtc(reference);

  return {
    since: new Date(reference).toISOString(),
    reference: lastRun !== undefined ? 'collector_run' : 'fact',
    reason:
      lastRun !== undefined
        ? `Sin datos del recolector desde ${since}: el último latido de ${controlId} en esta máquina tiene más de ${STALE_COLLECTOR_MAX_AGE_HOURS} h y lo que envió entonces no demuestra su estado a fecha de la evaluación.`
        : `Sin datos del recolector desde ${since}: hay hechos de ${controlId} en esta máquina pero ningún latido del recolector, y el más reciente tiene más de ${STALE_COLLECTOR_MAX_AGE_HOURS} h.`,
  };
};

// Todas las evidencias que aplican, a NO_EVALUABLE / COLLECTION con el motivo.
// Se quita el evento que las resolvía —ya no es lo que las decide— y se
// conserva `lastSeen`, que dice con verdad cuándo llegó el último dato.
export const markEvidencesStale = (
  evidences: ENSEvidenceResolved[],
  stale: ENSStaleCollector
): ENSEvidenceResolved[] =>
  evidences.map(evidence => {
    if (evidence.status === 'NO_APLICA') {
      return evidence;
    }

    const {
      resolvedEventId,
      resolvedEventType,
      resolvedSourceType,
      resolvedSource,
      resolvedRuleId,
      resolvedRuleDescription,
      resolvedAttributes,
      latestSuccessfulEventId,
      latestSuccessfulAttributes,
      ...rest
    } = evidence;

    return {
      ...rest,
      status: 'NO_EVALUABLE',
      gapCause: 'COLLECTION',
      // El `motivo` es lo que la no conformidad cita como «Motivo — EV-xx: …».
      resolvedAttributes: { motivo: stale.reason, causa: 'COLLECTION' },
      observations: [
        `${evidence.id} NO_EVALUABLE: ${stale.reason}`,
        `Pregunta de auditoría: ${evidence.auditQuestion}`,
      ],
    };
  });

// Las decisiones de la policy salen de los mismos datos viejos, así que tampoco
// pueden decidir. Solo sobrevive el NO_APLICA, que sale de la configuración.
export const markPolicyRuntimeStale = (
  policyRuntime: ENSPolicyRuntimeResult | undefined,
  stale: ENSStaleCollector
): ENSPolicyRuntimeResult | undefined =>
  policyRuntime && {
    ...policyRuntime,
    decisions: policyRuntime.decisions.map(decision =>
      decision.status === 'NO_APLICA'
        ? decision
        : {
            ...decision,
            status: 'NO_EVALUABLE',
            cause: 'COLLECTION',
            reason: stale.reason,
          }
    ),
  };
