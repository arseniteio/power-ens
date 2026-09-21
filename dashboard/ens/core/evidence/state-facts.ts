// Hechos de ESTADO: se juzgan con la última observación, no con la ventana.
//
// POR QUÉ. El motor juzgaba todos los hechos de la ventana. Para una ACCIÓN es
// lo correcto: una edición no autorizada de hace tres semanas sigue contando.
// Para un ESTADO no lo es: una política de contraseñas corregida a las 12:00 y
// observada a las 12:07 seguía incumpliendo por la foto de las 11:47, y lo
// habría seguido haciendo hasta que esa foto saliera de la ventana, un mes
// después. Un auditor leía un incumplimiento que ya no existía.
//
// CUÁL ES LA ÚLTIMA OBSERVACIÓN, Y POR QUÉ NO ES «LA ÚLTIMA PASADA». Un
// recolector no mira todo en cada pasada: op.exp.3 emite el inventario de
// servicios una vez al día y op.exp.2 solo puede leer el SCA cuando hay un
// escaneo reciente. Tomar «la última pasada» a secas dejaba esas evidencias sin
// un solo hecho y las hundía a NO_EVALUABLE, que es tan falso como la foto
// vieja. El corte se toma POR EVIDENCIA: la última pasada cuyo latido declara
// haberla cubierto (`evidencias_cubiertas`), que es lo que el propio recolector
// dice haber mirado.
//
// EL CORTE SE MIDE A FECHA DE `now`. La serie diaria evalúa este mismo motor en
// días pasados; juzgar el 10 con una pasada del 17 sería inventarse el pasado.
//
// Y SIN CORTE NO SE DESCARTA NADA. Si el latido no declara cobertura, o no hay
// una pasada anterior con la que delimitar, se conserva todo: en la duda, más
// hechos, nunca menos.
import type { ENSNormalizedEvent } from '../data-source/types';
import { parseReferenceList } from './judgment';
import { getEventFieldValue } from './normalized-events';
import { getEvidenceDefinitions } from './registry';

const COLLECTOR_RUN_EVENT_TYPE = 'collector_run';
const COLLECTOR_RUN_COVERAGE_FIELD = 'evidencias_cubiertas';

// Dos latidos más juntos que esto son la misma pasada (un reintento, un
// recolector que late al empezar y al terminar). No delimitan nada.
const SAME_RUN_TOLERANCE_MS = 60 * 1000;

export const getStateFactEventTypes = (controlId: string): Set<string> =>
  new Set(
    getEvidenceDefinitions(controlId).flatMap(
      definition => definition.stateFactEventTypes || []
    )
  );

interface CollectorRun {
  time: number;
  covered: string[];
}

const collectorRunsByAgent = (
  controlId: string,
  events: ENSNormalizedEvent[],
  nowMs: number
): Map<string, CollectorRun[]> => {
  const runs = new Map<string, CollectorRun[]>();

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

    runs.set(agent, [
      ...(runs.get(agent) || []),
      {
        time,
        covered: parseReferenceList(
          getEventFieldValue(event, COLLECTOR_RUN_COVERAGE_FIELD)
        ),
      },
    ]);
  });

  runs.forEach(list => list.sort((a, b) => a.time - b.time));

  return runs;
};

// Instante a partir del cual cuenta la última observación de una evidencia: el
// latido anterior a la última pasada que declaró haberla cubierto.
const boundaryFor = (
  runs: CollectorRun[] | undefined,
  evidenceId: string
): number | undefined => {
  if (!runs) {
    return undefined;
  }

  const covering = [...runs]
    .reverse()
    .find(run => run.covered.includes(evidenceId));

  if (!covering) {
    return undefined;
  }

  const previous = [...runs]
    .reverse()
    .find(run => run.time < covering.time - SAME_RUN_TOLERANCE_MS);

  return previous?.time;
};

export const keepLatestRunStateFacts = (
  controlId: string,
  events: ENSNormalizedEvent[],
  now: Date = new Date()
): ENSNormalizedEvent[] => {
  const definitions = getEvidenceDefinitions(controlId).filter(
    definition => (definition.stateFactEventTypes || []).length
  );

  if (!definitions.length) {
    return events;
  }

  const runs = collectorRunsByAgent(controlId, events, now.getTime());

  if (!runs.size) {
    return events;
  }

  const boundaries = new Map<string, number | undefined>();

  const boundaryOf = (agent: string, evidenceId: string) => {
    const key = `${agent}|${evidenceId}`;

    if (!boundaries.has(key)) {
      boundaries.set(key, boundaryFor(runs.get(agent), evidenceId));
    }

    return boundaries.get(key);
  };

  return events.filter(event => {
    if (event.controlId !== controlId) {
      return true;
    }

    // Las evidencias que declaran este tipo como estado. Si el hecho dice a
    // cuál pertenece, solo cuenta esa.
    const owners = definitions.filter(
      definition =>
        (definition.stateFactEventTypes || []).includes(event.eventType) &&
        (!event.evidenceId || event.evidenceId === definition.id)
    );

    if (!owners.length) {
      return true;
    }

    const agent = event.agentId || '';
    const time = Date.parse(event.timestamp);

    // Con varias dueñas manda la más permisiva: descartar un hecho que otra
    // evidencia todavía necesita sería dejarla sin nada que mirar.
    return owners.some(definition => {
      const boundary = boundaryOf(agent, definition.id);

      return (
        boundary === undefined ||
        Number.isNaN(time) ||
        time > boundary
      );
    });
  });
};
