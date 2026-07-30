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

// --- Cobertura del recolector (T1.3) ---------------------------------------
//
// «El recolector corrió y no encontró nada» y «el recolector no corrió» son dos
// situaciones distintas, y de esa distinción depende si la ausencia de hechos
// puede llegar a significar CUMPLE:
//
//   - NINGUNO_EN_LISTA con cobertura CONFIRMADA y cero hechos → sí es CUMPLE
//     (se ha mirado y no hay ninguna cuenta prohibida autenticándose).
//   - Con cobertura DESCONOCIDA o AUSENTE, ese mismo caso es el falso verde que
//     el producto prohíbe, así que se queda en NO_EVALUABLE.
//
// Aquí es donde se decide si el producto miente: con la cobertura sin resolver,
// «cero hechos» es indistinguible de «agente apagado».
export type ENSCollectorCoverage =
  | 'CONFIRMADA'
  | 'AUSENTE'
  | 'DESCONOCIDA';

export interface ENSCollectorCoverageResult {
  coverage: ENSCollectorCoverage;

  // El motivo va SIEMPRE, también cuando la cobertura está confirmada: es lo
  // que el auditor lee para saber sobre qué latido concreto se sostiene un
  // CUMPLE que nadie ha observado directamente.
  reason: string;

  // Latido en el que se apoya la respuesta, para la traza.
  event?: ENSNormalizedEvent;
}

const DEFAULT_COLLECTOR_RUN_EVENT_TYPES = [
  'collector_run',
];

const DEFAULT_COLLECTOR_RUN_MAX_AGE_HOURS = 24;

// Cota SUPERIOR de la ventana. Un latido no puede venir del futuro: si lo hace,
// o el reloj está desviado o el dato está manipulado, y en ninguno de los dos
// casos demuestra que el recolector haya mirado nada. Sin esta cota, un
// `collector_run` fechado en 2099 valdría como latido perpetuo y volvería verde
// para siempre a cualquier evidencia de aserción negativa, aunque el agente
// llevara meses apagado. Es un fallo real, ya visto en revisión de este
// producto, y el mismo margen y el mismo criterio que aplica el agente en
// `ens_opacc1_score.py` (MARGEN_FUTURO) — los dos lados tienen que tratar igual
// un ts adelantado o vuelve a haber dos interpretaciones del mismo evento.
const COLLECTOR_RUN_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Campos del latido. No se declaran por evidencia en el catálogo a propósito:
// son el contrato agente↔motor, idéntico para los tres controles, y ponerlos en
// el catálogo invitaría a que cada evidencia lo declarara distinto.
const COLLECTOR_RUN_RESULT_FIELD = 'resultado';

const COLLECTOR_RUN_SUCCESS_VALUES = [
  'completada',
];

// Lista blanca de evidencias que ESA pasada llegó a mirar. No es lo mismo que
// «sobre las que emitió algo»: una evidencia de aserción negativa calla
// legítimamente cuando no hay nada que reportar, y ese silencio es justo el
// caso que puede significar CUMPLE. Lo que hace falta saber es si la fuente se
// pudo leer.
const COLLECTOR_RUN_COVERAGE_FIELD = 'evidencias_cubiertas';

const parseTimestamp = (
  value: string | undefined
): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
};

// Un latido del mismo control y agente (ya filtrados por
// `resolveEvidenceForControl`), con ejecución correcta, cubriendo la ventana
// evaluada y declarando esta evidencia → CONFIRMADA; uno que declare fallo o
// que declare NO haber cubierto esta evidencia → AUSENTE; ninguno del que se
// pueda decir nada → DESCONOCIDA.
//
// Regla de fondo, y la razón de que falten datos se resuelva siempre hacia
// DESCONOCIDA: CONFIRMADA hay que GANÁRSELA. Un latido que no declara su
// resultado, o que no declara qué llegó a mirar, no demuestra cobertura —
// demuestra que el recolector es más viejo que este contrato. Y lo que no
// consta no puede convertir un silencio en un CUMPLE.
export const resolveCollectorCoverage = (
  definition: ENSEvidenceDefinition,
  judgment: ENSEvidenceJudgment,
  events: ENSNormalizedEvent[],
  now: Date = new Date()
): ENSCollectorCoverageResult => {
  const eventTypes =
    judgment.collectorRunEventTypes?.length
      ? judgment.collectorRunEventTypes
      : DEFAULT_COLLECTOR_RUN_EVENT_TYPES;

  const maxAgeHours =
    judgment.collectorRunMaxAgeHours !==
      undefined &&
    Number.isFinite(
      judgment.collectorRunMaxAgeHours
    ) &&
    judgment.collectorRunMaxAgeHours > 0
      ? judgment.collectorRunMaxAgeHours
      : DEFAULT_COLLECTOR_RUN_MAX_AGE_HOURS;

  const candidates = sortByTimestampDesc(
    events.filter(
      event =>
        eventTypes.includes(event.eventType) &&
        definition.sourceTypes.includes(
          event.sourceType
        ) &&
        // El latido no es de ninguna evidencia en particular; si alguno viene
        // marcado, solo cuenta para la suya.
        (!event.evidenceId ||
          event.evidenceId === definition.id)
    )
  );

  if (!candidates.length) {
    return {
      coverage: 'DESCONOCIDA',
      reason: `No consta ningún evento de recolector (${eventTypes.join(', ')}) para ${definition.id}: no hay forma de saber si el recolector llegó a ejecutarse.`,
    };
  }

  const nowMs = now.getTime();

  const lowerBound =
    nowMs - maxAgeHours * 60 * 60 * 1000;

  const upperBound =
    nowMs + COLLECTOR_RUN_FUTURE_TOLERANCE_MS;

  let futureCandidate:
    | ENSNormalizedEvent
    | undefined;

  const inWindow = candidates.filter(event => {
    const timestamp = parseTimestamp(
      event.timestamp
    );

    if (timestamp === undefined) {
      return false;
    }

    if (timestamp > upperBound) {
      futureCandidate =
        futureCandidate || event;

      return false;
    }

    return timestamp >= lowerBound;
  });

  if (!inWindow.length) {
    return futureCandidate
      ? {
          coverage: 'DESCONOCIDA',
          reason: `El único evento de recolector para ${definition.id} está fechado en el futuro (${futureCandidate.timestamp}): un reloj desviado o un dato manipulado no demuestra que se haya mirado nada, así que no cuenta como latido.`,
          event: futureCandidate,
        }
      : {
          coverage: 'DESCONOCIDA',
          reason: `No consta ningún evento de recolector para ${definition.id} dentro de las últimas ${maxAgeHours} horas (el más reciente es de ${candidates[0].timestamp}).`,
          event: candidates[0],
        };
  }

  const latest = inWindow[0];

  const declaredResult = getEventFieldValue(
    latest,
    COLLECTOR_RUN_RESULT_FIELD
  );

  if (!hasMeaningfulValue(declaredResult)) {
    return {
      coverage: 'DESCONOCIDA',
      reason: `El latido del recolector ${latest.id} (${latest.timestamp}) no declara el campo '${COLLECTOR_RUN_RESULT_FIELD}', así que no consta que la pasada terminara bien.`,
      event: latest,
    };
  }

  if (
    !COLLECTOR_RUN_SUCCESS_VALUES.includes(
      normalizeForComparison(declaredResult)
    )
  ) {
    return {
      coverage: 'AUSENTE',
      reason: `El recolector ejecutó, pero su latido ${latest.id} (${latest.timestamp}) declara ${COLLECTOR_RUN_RESULT_FIELD}='${String(declaredResult)}': la pasada no terminó correctamente.`,
      event: latest,
    };
  }

  const declaredCoverage = getEventFieldValue(
    latest,
    COLLECTOR_RUN_COVERAGE_FIELD
  );

  if (!hasMeaningfulValue(declaredCoverage)) {
    return {
      coverage: 'DESCONOCIDA',
      reason: `El latido del recolector ${latest.id} (${latest.timestamp}) no declara '${COLLECTOR_RUN_COVERAGE_FIELD}', así que no consta que la pasada llegara a observar ${definition.id}.`,
      event: latest,
    };
  }

  const coveredEvidences = parseReferenceList(
    declaredCoverage
  ).map(normalizeForComparison);

  if (
    !coveredEvidences.includes(
      normalizeForComparison(definition.id)
    )
  ) {
    return {
      coverage: 'AUSENTE',
      reason: `El recolector ejecutó correctamente, pero su latido ${latest.id} (${latest.timestamp}) declara haber cubierto ${coveredEvidences.length ? `'${parseReferenceList(declaredCoverage).join("', '")}'` : 'ninguna evidencia'} y ${definition.id} no está: esa pasada no llegó a observar esta evidencia.`,
      event: latest,
    };
  }

  return {
    coverage: 'CONFIRMADA',
    reason: `El recolector ejecutó correctamente y declara haber cubierto ${definition.id} (latido ${latest.id} de ${latest.timestamp}, dentro de las últimas ${maxAgeHours} horas).`,
    event: latest,
  };
};

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

// `now` es un parámetro y no una llamada suelta a `new Date()` porque la
// cobertura del recolector se mide contra una ventana con dos cotas: sin poder
// congelar el reloj, la prueba de que un latido del futuro NO vale sería
// imposible de escribir de forma determinista.
export const judgeEvidence = (
  definition: ENSEvidenceDefinition,
  judgment: ENSEvidenceJudgment,
  baseEvidence: ENSEvidenceBaseFields,
  events: ENSNormalizedEvent[],
  configuration?: ENSControlConfiguration,
  now: Date = new Date()
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
  // la tentación del falso verde: «no se ha visto nada malo, luego cumple». Solo
  // deja de serlo cuando consta que el recolector ejecutó y cubrió la ventana.
  if (!observedFacts.length) {
    const coverage = resolveCollectorCoverage(
      definition,
      judgment,
      events,
      now
    );

    const coverageMotive = `Cobertura del recolector: ${coverage.coverage}. ${coverage.reason}`;

    // Solo la aserción NEGATIVA puede cumplirse por ausencia. «Ninguno de los
    // hechos observados está en la lista» sigue siendo cierto con cero hechos
    // observados, siempre que conste que se ha mirado — es literalmente lo que
    // acredita EV-03: nadie se autenticó con una cuenta prohibida.
    //
    // Las otras dos no: «todos los hechos observados están en la lista» y
    // «ningún valor observado supera el umbral» son afirmaciones POSITIVAS
    // sobre un sistema del que no se ha observado nada. Que sean vacuamente
    // ciertas en lógica no las hace ciertas en una auditoría: cero copias de
    // seguridad observadas no acredita que las copias se hagan a tiempo. Se
    // quedan en NO_EVALUABLE aunque la cobertura esté confirmada.
    const admiteCumplimientoPorAusencia =
      judgment.primitive === 'NINGUNO_EN_LISTA';

    // Ni siquiera con cobertura confirmada: si llegaron eventos de hecho que no
    // se han podido leer, no se ha observado «nada», se ha observado algo
    // ilegible. Afirmar cumplimiento sería afirmar sobre lo que falta.
    if (
      coverage.coverage === 'CONFIRMADA' &&
      admiteCumplimientoPorAusencia &&
      !unusableFactEvents.length
    ) {
      return buildResult(
        'CUMPLE',
        [
          coverageMotive,
          `No se ha observado ningún hecho de tipo ${judgment.factEventTypes.join(', ')} en la ventana evaluada, y consta que el recolector miró: ningún valor de la lista del parámetro ${parameterLabel} se ha producido.`,
        ],
        coverage.event
      );
    }

    return buildResult(
      'NO_EVALUABLE',
      [
        missingFactsMotive,
        coverageMotive,
        ...(coverage.coverage === 'CONFIRMADA' &&
        !admiteCumplimientoPorAusencia
          ? [
              `La primitiva ${judgment.primitive} afirma algo sobre los hechos observados, así que no puede acreditarse sin observar ninguno, ni siquiera con la cobertura confirmada.`,
            ]
          : []),
        ...(coverage.coverage === 'CONFIRMADA' &&
        unusableFactEvents.length
          ? [
              `La cobertura está confirmada, pero ${unusableFactEvents.length} evento(s) de hecho no se han podido interpretar, así que lo observado no está vacío: está incompleto.`,
            ]
          : []),
        ...unusableFactEvents
          .slice(0, 1)
          .map(
            unusable =>
              `Último evento descartado ${unusable.event.id}: ${unusable.reason}.`
          ),
      ],
      factEvents[0] || coverage.event
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
