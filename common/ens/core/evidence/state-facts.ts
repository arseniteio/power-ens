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
// vieja.
//
// El corte se toma POR EVIDENCIA y con las DOS señales que deja el recolector,
// la más reciente de ellas: el latido que declara haberla cubierto
// (`evidencias_cubiertas`) y la emisión de un hecho suyo. Hacen falta las dos
// porque ningún recolector declara hoy la cobertura de TODAS sus evidencias
// —op.acc.6 declara seis de doce—, y con solo la primera señal seguían
// contando fotos de hace días: una contraseña con caducidad 99999 corregida el
// día 17 seguía suspendiendo el 21.
//
// EL CORTE SE MIDE A FECHA DE `now`. La serie diaria evalúa este mismo motor en
// días pasados; juzgar el 10 con una pasada del 17 sería inventarse el pasado.
//
// Y SIN CORTE NO SE DESCARTA NADA. Si el latido no declara cobertura, o no hay
// una pasada anterior con la que delimitar, se conserva todo: en la duda, más
// hechos, nunca menos.
//
// VARIOS RECOLECTORES DEL MISMO CONTROL EN LA MISMA MÁQUINA. En un servidor de
// buzones, mp.info.6 tiene dos: el del PBS y el de Zimbra, cada uno con su
// latido y a su minuto. Con los latidos mezclados, la pasada de Zimbra de las
// 10:40 delimitaba con el latido del PBS de las 10:00 y borraba sus hechos. Si
// las evidencias declaran `stateFactCollectorField` (`origen`), latidos y
// hechos se agrupan por máquina y por ese campo: cada recolector delimita solo
// los suyos. Sin el campo, todo es un solo recolector, como siempre.
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

// El recolector de un evento dentro de su máquina: el valor del campo que
// declaran las evidencias del control, o '' si no declaran ninguno.
type CollectorOf = (event: ENSNormalizedEvent) => string;

const collectorKey = (
  event: ENSNormalizedEvent,
  collectorOf: CollectorOf
): string => `${event.agentId || ''}|${collectorOf(event)}`;

const collectorRunsByCollector = (
  controlId: string,
  events: ENSNormalizedEvent[],
  nowMs: number,
  collectorOf: CollectorOf
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

    const collector = collectorKey(event, collectorOf);

    runs.set(collector, [
      ...(runs.get(collector) || []),
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
// latido anterior a la última pasada que la miró. «Mirarla» es declararla en
// `evidencias_cubiertas` o emitir un hecho suyo, lo que ocurra más tarde.
const boundaryFor = (
  runs: CollectorRun[] | undefined,
  evidenceId: string,
  lastFactTime: number | undefined
): number | undefined => {
  if (!runs) {
    return undefined;
  }

  const covering = [...runs]
    .reverse()
    .find(run => run.covered.includes(evidenceId));

  const observed = Math.max(
    covering?.time ?? 0,
    lastFactTime ?? 0
  );

  if (!observed) {
    return undefined;
  }

  const previous = [...runs]
    .reverse()
    .find(run => run.time < observed - SAME_RUN_TOLERANCE_MS);

  return previous?.time;
};

const stateFactDefinitions = (controlId: string) =>
  getEvidenceDefinitions(controlId).filter(
    definition => (definition.stateFactEventTypes || []).length
  );

const collectorFieldOf = (
  definitions: ReturnType<typeof stateFactDefinitions>
): string | undefined =>
  definitions.find(definition => definition.stateFactCollectorField)
    ?.stateFactCollectorField;

const collectorOfField = (collectorField?: string): CollectorOf => event => {
  if (!collectorField) {
    return '';
  }

  const value = getEventFieldValue(event, collectorField);

  return value === undefined || value === null ? '' : String(value).trim();
};

export const keepLatestRunStateFacts = (
  controlId: string,
  events: ENSNormalizedEvent[],
  now: Date = new Date()
): ENSNormalizedEvent[] => {
  const definitions = stateFactDefinitions(controlId);

  if (!definitions.length) {
    return events;
  }

  const collectorOf = collectorOfField(collectorFieldOf(definitions));

  const runs = collectorRunsByCollector(
    controlId,
    events,
    now.getTime(),
    collectorOf
  );

  if (!runs.size) {
    return events;
  }

  // Última emisión de un hecho de estado de cada evidencia, por recolector de
  // cada máquina.
  const lastFact = new Map<string, number>();

  events.forEach(event => {
    if (event.controlId !== controlId) {
      return;
    }

    const time = Date.parse(event.timestamp);

    if (Number.isNaN(time) || time > now.getTime()) {
      return;
    }

    definitions.forEach(definition => {
      if (
        !(definition.stateFactEventTypes || []).includes(event.eventType) ||
        (event.evidenceId && event.evidenceId !== definition.id)
      ) {
        return;
      }

      const key = `${collectorKey(event, collectorOf)}|${definition.id}`;

      lastFact.set(key, Math.max(lastFact.get(key) ?? 0, time));
    });
  });

  const boundaries = new Map<string, number | undefined>();

  const boundaryOf = (collector: string, evidenceId: string) => {
    const key = `${collector}|${evidenceId}`;

    if (!boundaries.has(key)) {
      boundaries.set(
        key,
        boundaryFor(runs.get(collector), evidenceId, lastFact.get(key))
      );
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

    const collector = collectorKey(event, collectorOf);
    const time = Date.parse(event.timestamp);

    // Con varias dueñas manda la más permisiva: descartar un hecho que otra
    // evidencia todavía necesita sería dejarla sin nada que mirar.
    return owners.some(definition => {
      const boundary = boundaryOf(collector, definition.id);

      return (
        boundary === undefined ||
        Number.isNaN(time) ||
        time > boundary
      );
    });
  });
};

// LO QUE EL SERVIDOR PUEDE DEJAR DE LEER, Y POR QUÉ NO CAMBIA NADA.
//
// El servidor evalúa sobre la ventana entera, y los hechos de estado se repiten
// en cada pasada: leerlos todos para quedarse con la última es casi todo el
// volumen de algunos controles. Esta función dice, por máquina, recolector y
// tipo de hecho de estado, hasta qué instante (incluido) es seguro no leerlos:
// el corte de `keepLatestRunStateFacts` calculado SOLO con los latidos que
// declaran cubrir la evidencia, sin la última emisión del hecho.
//
// Por qué es seguro. El corte del motor es el latido anterior a la última vez
// que se miró la evidencia, y «mirar» es lo más tardío entre el latido que la
// cubre y el último hecho emitido. Sin el hecho, el corte solo puede salir
// IGUAL O ANTERIOR, nunca posterior: lo que queda fuera, el motor también lo
// habría descartado. Y el último hecho emitido, si es posterior al latido que
// cubre, queda dentro (es posterior al corte), así que el motor, sobre lo que
// se lee, vuelve a calcular el mismo corte y conserva los mismos hechos. Con
// varias evidencias dueñas del mismo tipo, manda el corte más antiguo. Una
// evidencia que nunca se ha declarado cubierta no tiene corte: de sus tipos no
// se descarta nada.
//
// `at` es el instante de evaluación más antiguo que se va a pedir (el primer
// punto de la serie, o ahora): el corte solo avanza con el tiempo, así que el
// de `at` vale para todos los posteriores.
//
// Devuelve claves `agente|recolector|tipo` → instante en ms.
export const computeStateFactPruningCutoffs = (
  controlId: string,
  runEvents: ENSNormalizedEvent[],
  at: Date
): Map<string, number> => {
  const cutoffs = new Map<string, number>();
  const definitions = stateFactDefinitions(controlId);

  if (!definitions.length) {
    return cutoffs;
  }

  const collectorOf = collectorOfField(collectorFieldOf(definitions));
  const runs = collectorRunsByCollector(
    controlId,
    runEvents,
    at.getTime(),
    collectorOf
  );

  runs.forEach((_list, collector) => {
    const eventTypes = new Set(
      definitions.flatMap(definition => definition.stateFactEventTypes || [])
    );

    eventTypes.forEach(eventType => {
      const owners = definitions.filter(definition =>
        (definition.stateFactEventTypes || []).includes(eventType)
      );

      const boundaries = owners.map(definition =>
        boundaryFor(runs.get(collector), definition.id, undefined)
      );

      if (boundaries.some(boundary => boundary === undefined)) {
        return;
      }

      cutoffs.set(
        `${collector}|${eventType}`,
        Math.min(...(boundaries as number[]))
      );
    });
  });

  return cutoffs;
};

// Las evidencias que pueden ser dueñas de un tipo de hecho de estado: un hecho
// que declara OTRA evidencia no es de estado para el motor y no se descarta.
export const getStateFactOwnerEvidenceIds = (
  controlId: string,
  eventType: string
): string[] =>
  stateFactDefinitions(controlId)
    .filter(definition =>
      (definition.stateFactEventTypes || []).includes(eventType)
    )
    .map(definition => definition.id);

export const getStateFactCollectorField = (
  controlId: string
): string | undefined => collectorFieldOf(stateFactDefinitions(controlId));
