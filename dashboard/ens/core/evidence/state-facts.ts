// Hechos de ESTADO: se juzgan con la última pasada del recolector.
//
// POR QUÉ. El motor juzgaba todos los hechos de la ventana. Para una ACCIÓN es
// lo correcto: una edición no autorizada de hace tres semanas sigue contando.
// Para un ESTADO no lo es: una política de contraseñas corregida a las 12:00 y
// observada a las 12:07 seguía incumpliendo por la foto de las 11:47, y lo
// habría seguido haciendo hasta que esa foto saliera de la ventana, un mes
// después. Un auditor leía un incumplimiento que ya no existía.
//
// QUÉ HACE. Por control y por agente, descarta los hechos de los tipos que el
// catálogo declara como estado (`stateFactEventTypes`) y que son anteriores a
// la última pasada del recolector. Todo lo demás pasa intacto: las acciones,
// los latidos, los eventos de otros controles.
//
// LA ÚLTIMA PASADA SE MIDE A FECHA DE `now`. La serie diaria evalúa este mismo
// motor en días pasados; juzgar el 10 con una pasada del 17 sería inventarse el
// pasado.
//
// Y SIN LÍMITE NO SE DESCARTA NADA. Con menos de dos pasadas no se sabe dónde
// empieza la última, así que se conserva todo: en la duda, más hechos, nunca
// menos.
import type { ENSNormalizedEvent } from '../data-source/types';
import { getEvidenceDefinitions } from './registry';

const COLLECTOR_RUN_EVENT_TYPE = 'collector_run';

// Dos latidos más juntos que esto son la misma pasada (un reintento, un
// recolector que late al empezar y al terminar). No crean límite.
const SAME_RUN_TOLERANCE_MS = 60 * 1000;

export const getStateFactEventTypes = (controlId: string): Set<string> =>
  new Set(
    getEvidenceDefinitions(controlId).flatMap(
      definition => definition.stateFactEventTypes || []
    )
  );

// Instante a partir del cual empieza la última pasada de cada agente: el latido
// anterior al último, sin contar los que caen en la misma pasada.
const latestRunBoundaries = (
  controlId: string,
  events: ENSNormalizedEvent[],
  nowMs: number
): Map<string, number> => {
  const runsByAgent = new Map<string, number[]>();

  events.forEach(event => {
    if (
      event.controlId !== controlId ||
      event.eventType !== COLLECTOR_RUN_EVENT_TYPE
    ) {
      return;
    }

    const time = Date.parse(event.timestamp);

    if (Number.isNaN(time) || time > nowMs) {
      return;
    }

    const agent = event.agentId || '';
    runsByAgent.set(agent, [...(runsByAgent.get(agent) || []), time]);
  });

  const boundaries = new Map<string, number>();

  runsByAgent.forEach((runs, agent) => {
    const sorted = [...runs].sort((a, b) => b - a);
    const previous = sorted.find(
      time => time < sorted[0] - SAME_RUN_TOLERANCE_MS
    );

    if (previous !== undefined) {
      boundaries.set(agent, previous);
    }
  });

  return boundaries;
};

export const keepLatestRunStateFacts = (
  controlId: string,
  events: ENSNormalizedEvent[],
  now: Date = new Date()
): ENSNormalizedEvent[] => {
  const stateTypes = getStateFactEventTypes(controlId);

  if (!stateTypes.size) {
    return events;
  }

  const boundaries = latestRunBoundaries(controlId, events, now.getTime());

  if (!boundaries.size) {
    return events;
  }

  return events.filter(event => {
    if (
      event.controlId !== controlId ||
      !stateTypes.has(event.eventType)
    ) {
      return true;
    }

    const boundary = boundaries.get(event.agentId || '');

    return (
      boundary === undefined ||
      Date.parse(event.timestamp) > boundary
    );
  });
};
