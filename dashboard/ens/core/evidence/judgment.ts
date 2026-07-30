import {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import {
  getEventFieldValue,
  hasMeaningfulValue,
  sortByTimestampDesc,
} from './normalized-events';
import {
  ENSEvidenceBaseFields,
  ENSEvidenceDefinition,
  ENSEvidenceJudgment,
  ENSEvidenceResolved,
} from './types';

// El motor juzga la evidencia; el agente solo aporta el hecho crudo.
//
// Este fichero es el ÚNICO sitio donde vive «el motor decide esta evidencia», y
// es idéntico para los tres controles. No hay —ni puede haber— un evaluador por
// control: tener uno solo en op.acc.1 produjo dos caminos de evaluación sobre
// los mismos datos y se desconectó en `3e92f5c`.
//
// Invariante, por encima de cualquier primitiva: la ausencia de un dato no
// produce una afirmación. Sin hecho observado o sin parámetro, NO_EVALUABLE con
// motivo. Nunca un CUMPLE falso, y tampoco un NO_CUMPLE falso.

// --- Cobertura del recolector: hueco previsto para T1.3 ---------------------
//
// «El recolector corrió y no encontró nada» y «el recolector no corrió» son dos
// situaciones distintas que hoy el motor no sabe separar, y de esa distinción
// depende si la ausencia de hechos puede llegar a significar CUMPLE:
//
//   - NINGUNO_EN_LISTA con cobertura CONFIRMADA y cero hechos → sí es CUMPLE
//     (se ha mirado y no hay ninguna cuenta prohibida autenticándose).
//   - Con cobertura DESCONOCIDA, ese mismo caso es el falso verde que el
//     producto prohíbe, así que se queda en NO_EVALUABLE.
//
// T1.3 lo resuelve con el evento `collector_run`. Lo que tiene que hacer:
//   1. Añadir a `ENSEvidenceJudgment` el tipo de evento del recolector
//      (p.ej. `collectorRunEventTypes?: string[]`).
//   2. Implementar aquí la búsqueda: un `collector_run` del mismo control y
//      agente, con ejecución correcta y cubriendo la ventana evaluada →
//      'CONFIRMADA'; uno que declare fallo → 'AUSENTE'; ninguno → 'DESCONOCIDA'.
//   3. Añadir en `judgeEvidence`, en el caso «parámetro sí, hechos no», la rama
//      que convierte 'CONFIRMADA' en el veredicto que corresponda a la
//      primitiva.
//
// Mientras devuelva siempre 'DESCONOCIDA', ese caso termina siempre en
// NO_EVALUABLE, que es la respuesta correcta hoy.
export type ENSCollectorCoverage =
  | 'CONFIRMADA'
  | 'AUSENTE'
  | 'DESCONOCIDA';

export const resolveCollectorCoverage = (
  _definition: ENSEvidenceDefinition,
  _events: ENSNormalizedEvent[]
): ENSCollectorCoverage => 'DESCONOCIDA';

// --- Lectura del parámetro -------------------------------------------------

// Tolera el valor heredado en forma de cadena: lo que hay en el índice para
// muchos parámetros de tipo `list` son cadenas escritas a mano antes de que el
// formulario supiera editar listas. Se parte por saltos de línea y por comas,
// igual que `configuration/form-engine/renderers/list-parameter-renderer.tsx`
// —el motor y la pantalla tienen que leer el valor guardado de la misma forma—,
// y NUNCA por `|`, que en este producto separa los campos de un mismo elemento
// ('srv-dc01 | Windows').
export const parseReferenceList = (
  value: unknown
): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return [String(value)];
  }

  return [];
};

// Comparación de listas: sin distinguir mayúsculas y con los espacios de los
// extremos recortados.
const normalizeForComparison = (
  value: unknown
): string =>
  String(value)
    .trim()
    .toLowerCase();

const toFiniteNumber = (
  value: unknown
): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : undefined;
  }

  const text = String(value).trim();

  if (!text) {
    return undefined;
  }

  const parsed = Number(text);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
};

type ENSParameterReference =
  | { kind: 'LISTA'; values: string[] }
  | { kind: 'UMBRAL'; threshold: number }
  | { kind: 'SIN_PARAMETRO'; reason: string };

// Nunca se recurre a `defaultValue`: juzgar contra un valor que el auditor no ha
// puesto es exactamente la pantalla que miente. Solo cuenta lo configurado.
const resolveParameterReference = (
  judgment: ENSEvidenceJudgment,
  parameter: ENSControlParameter | undefined,
  parameterLabel: string
): ENSParameterReference => {
  if (!parameter) {
    return {
      kind: 'SIN_PARAMETRO',
      reason: `El parámetro ${parameterLabel} no existe en la configuración activa del control.`,
    };
  }

  if (!hasMeaningfulValue(parameter.value)) {
    return {
      kind: 'SIN_PARAMETRO',
      reason: `El parámetro ${parameterLabel} está sin configurar.`,
    };
  }

  if (judgment.primitive === 'UMBRAL_MAXIMO') {
    const threshold = toFiniteNumber(
      parameter.value
    );

    if (threshold === undefined) {
      return {
        kind: 'SIN_PARAMETRO',
        reason: `El parámetro ${parameterLabel} no contiene un número utilizable como umbral (valor: '${String(parameter.value)}').`,
      };
    }

    return { kind: 'UMBRAL', threshold };
  }

  const values = parseReferenceList(
    parameter.value
  );

  if (!values.length) {
    return {
      kind: 'SIN_PARAMETRO',
      reason: `El parámetro ${parameterLabel} no contiene ningún elemento utilizable como lista de referencia.`,
    };
  }

  return { kind: 'LISTA', values };
};

// --- Lectura de los hechos crudos ------------------------------------------

interface ENSObservedFact {
  event: ENSNormalizedEvent;
  text: string;
}

interface ENSUnusableFactEvent {
  event: ENSNormalizedEvent;
  reason: string;
}

// Nombra los hechos, que es lo que el auditor necesita: no «algo falló», sino
// qué cuenta concreta. Se quitan los repetidos y se corta en cinco para que la
// observación siga siendo legible.
const describeFacts = (
  facts: ENSObservedFact[]
): string => {
  const unique: string[] = [];

  facts.forEach(fact => {
    if (
      !unique.some(
        item =>
          normalizeForComparison(item) ===
          normalizeForComparison(fact.text)
      )
    ) {
      unique.push(fact.text);
    }
  });

  const shown = unique
    .slice(0, 5)
    .map(item => `'${item}'`);

  const remaining = unique.length - shown.length;

  return remaining > 0
    ? `${shown.join(', ')} y ${remaining} más`
    : shown.join(', ');
};

// --- Juicio ----------------------------------------------------------------

export const judgeEvidence = (
  definition: ENSEvidenceDefinition,
  judgment: ENSEvidenceJudgment,
  baseEvidence: ENSEvidenceBaseFields,
  events: ENSNormalizedEvent[],
  configuration?: ENSControlConfiguration
): ENSEvidenceResolved => {
  const parameter =
    configuration?.parameters.find(
      candidate =>
        candidate.id === judgment.parameterId
    );

  const parameterLabel = parameter?.name
    ? `${judgment.parameterId} (${parameter.name})`
    : judgment.parameterId;

  const reference = resolveParameterReference(
    judgment,
    parameter,
    parameterLabel
  );

  // Los eventos de hecho son SOLO los tipos declarados en `factEventTypes`. El
  // `evidence_state` del agente no entra aquí y su `estado` no se lee en ningún
  // punto de este fichero: cuando una evidencia declara `judgment`, deja de
  // mandar sobre ella.
  const factEvents = sortByTimestampDesc(
    events.filter(
      event =>
        definition.sourceTypes.includes(
          event.sourceType
        ) &&
        judgment.factEventTypes.includes(
          event.eventType
        ) &&
        (!event.evidenceId ||
          event.evidenceId === definition.id)
    )
  );

  const observedFacts: ENSObservedFact[] = [];
  const unusableFactEvents: ENSUnusableFactEvent[] = [];

  factEvents.forEach(event => {
    if (
      definition.qualityRequirements
        ?.rejectSynthetic &&
      event.isSynthetic
    ) {
      unusableFactEvents.push({
        event,
        reason:
          'está marcado como sintético o de demostración',
      });

      return;
    }

    const rawValue = getEventFieldValue(
      event,
      judgment.factField
    );

    const rawValues = Array.isArray(rawValue)
      ? rawValue
      : [rawValue];

    const usableValues = rawValues.filter(
      hasMeaningfulValue
    );

    if (!usableValues.length) {
      unusableFactEvents.push({
        event,
        reason: `no trae valor en el campo '${judgment.factField}'`,
      });

      return;
    }

    usableValues.forEach(value => {
      observedFacts.push({
        event,
        text: String(value).trim(),
      });
    });
  });

  const buildResult = (
    status: ENSEvidenceResolved['status'],
    motives: string[],
    decisiveEvent?: ENSNormalizedEvent
  ): ENSEvidenceResolved => ({
    ...baseEvidence,
    status,
    relatedRules: Array.from(
      new Set([
        ...definition.relatedRules,
        ...(decisiveEvent?.ruleId
          ? [decisiveEvent.ruleId]
          : []),
      ])
    ),
    lastSeen: decisiveEvent?.timestamp,
    agentId: decisiveEvent?.agentId,
    agentName: decisiveEvent?.agentName,
    resolvedEventId: decisiveEvent?.id,
    resolvedEventType: decisiveEvent?.eventType,
    resolvedSourceType:
      decisiveEvent?.sourceType,
    resolvedSource: decisiveEvent?.source,
    resolvedRuleId: decisiveEvent?.ruleId,
    resolvedRuleDescription:
      decisiveEvent?.ruleDescription,
    resolvedAttributes:
      decisiveEvent?.attributes,
    latestSuccessfulEventId:
      status === 'CUMPLE'
        ? decisiveEvent?.id
        : undefined,
    latestSuccessfulAttributes:
      status === 'CUMPLE'
        ? decisiveEvent?.attributes
        : undefined,
    observations: [
      `Evidencia ${definition.id} juzgada por el motor con la primitiva ${judgment.primitive} sobre el parámetro ${parameterLabel}.`,
      ...motives,
      `Pregunta de auditoría: ${definition.auditQuestion}`,
    ],
  });

  const missingFactsMotive = factEvents.length
    ? `No hay ningún hecho observado utilizable para ${definition.id}: llegaron ${factEvents.length} evento(s) de tipo ${judgment.factEventTypes.join(', ')}, pero ninguno aporta valor en el campo '${judgment.factField}'.`
    : `No hay ningún hecho observado para ${definition.id}: no ha llegado ningún evento de tipo ${judgment.factEventTypes.join(', ')}.`;

  // Caso 1: ni hecho ni parámetro.
  if (
    !observedFacts.length &&
    reference.kind === 'SIN_PARAMETRO'
  ) {
    return buildResult(
      'NO_EVALUABLE',
      [
        missingFactsMotive,
        reference.reason,
        'Sin hecho observado y sin parámetro de referencia no se puede afirmar ni negar el cumplimiento.',
      ],
      factEvents[0]
    );
  }

  // Caso 2: hay hecho, pero no hay parámetro contra el que contrastarlo. Nunca
  // un veredicto: sin la referencia configurada, el hecho no dice nada.
  if (reference.kind === 'SIN_PARAMETRO') {
    return buildResult(
      'NO_EVALUABLE',
      [
        reference.reason,
        `Se han observado ${observedFacts.length} hecho(s) (${describeFacts(observedFacts)}), pero sin el valor de referencia no se puede afirmar ni negar el cumplimiento.`,
      ],
      observedFacts[0]?.event
    );
  }

  // Caso 3: hay parámetro, pero no se ha observado ningún hecho. Es donde vive
  // la tentación del falso verde: «no se ha visto nada malo, luego cumple». No.
  // Mientras no conste que el recolector ejecutó y cubrió la ventana, la
  // ausencia de hechos no distingue «no hay nada» de «no se ha mirado».
  if (!observedFacts.length) {
    const coverage = resolveCollectorCoverage(
      definition,
      events
    );

    return buildResult(
      'NO_EVALUABLE',
      [
        missingFactsMotive,
        `Cobertura del recolector: ${coverage}. Sin constancia de que el recolector haya ejecutado y cubierto la ventana evaluada, la ausencia de hechos no permite afirmar cumplimiento.`,
        ...unusableFactEvents
          .slice(0, 1)
          .map(
            unusable =>
              `Último evento descartado ${unusable.event.id}: ${unusable.reason}.`
          ),
      ],
      factEvents[0]
    );
  }

  // Caso 4: hecho observado y parámetro válido. Aquí sí hay veredicto.
  let offenders: ENSObservedFact[] = [];
  let breachMotive = '';
  let complianceMotive = '';
  let undecidableMotive: string | undefined;

  if (reference.kind === 'UMBRAL') {
    const threshold = reference.threshold;

    offenders = observedFacts.filter(fact => {
      const observed = toFiniteNumber(fact.text);

      return (
        observed !== undefined &&
        observed > threshold
      );
    });

    const unreadable = observedFacts.filter(
      fact =>
        toFiniteNumber(fact.text) === undefined
    );

    breachMotive = `Se ha observado ${describeFacts(offenders)}, que supera el máximo ${threshold} definido en el parámetro ${parameterLabel}.`;

    complianceMotive = `Ninguno de los ${observedFacts.length} valor(es) observado(s) supera el máximo ${threshold} definido en el parámetro ${parameterLabel}.`;

    if (unreadable.length) {
      undecidableMotive = `No se puede interpretar como número ${describeFacts(unreadable)}, así que no cabe afirmar que el umbral se respeta.`;
    }
  } else {
    // NINGUNO_EN_LISTA incumple con lo que SÍ está en la lista;
    // TODOS_EN_LISTA, con lo que NO está.
    const mustBeInList =
      judgment.primitive === 'TODOS_EN_LISTA';

    const normalizedReference = reference.values.map(
      normalizeForComparison
    );

    offenders = observedFacts.filter(
      fact =>
        normalizedReference.includes(
          normalizeForComparison(fact.text)
        ) !== mustBeInList
    );

    breachMotive = mustBeInList
      ? `Se ha observado ${describeFacts(offenders)}, que no figura en la lista del parámetro ${parameterLabel}.`
      : `Se ha observado ${describeFacts(offenders)}, que figura en la lista del parámetro ${parameterLabel}.`;

    complianceMotive = mustBeInList
      ? `Los ${observedFacts.length} hecho(s) observado(s) figuran todos en la lista del parámetro ${parameterLabel}.`
      : `Ninguno de los ${observedFacts.length} hecho(s) observado(s) figura en la lista del parámetro ${parameterLabel}.`;
  }

  if (offenders.length) {
    return buildResult(
      'NO_CUMPLE',
      [breachMotive],
      offenders[0].event
    );
  }

  if (undecidableMotive) {
    return buildResult(
      'NO_EVALUABLE',
      [undecidableMotive],
      observedFacts[0].event
    );
  }

  // No basta con que lo observado no incumpla: si además hay eventos de hecho
  // que no se han podido leer, lo observado está incompleto y afirmar
  // cumplimiento sería afirmar sobre lo que falta.
  if (unusableFactEvents.length) {
    return buildResult(
      'NO_EVALUABLE',
      [
        `${unusableFactEvents.length} evento(s) de hecho no se han podido interpretar (último, ${unusableFactEvents[0].event.id}: ${unusableFactEvents[0].reason}), así que lo observado está incompleto y no cabe afirmar cumplimiento.`,
      ],
      observedFacts[0].event
    );
  }

  return buildResult(
    'CUMPLE',
    [complianceMotive],
    observedFacts[0].event
  );
};
