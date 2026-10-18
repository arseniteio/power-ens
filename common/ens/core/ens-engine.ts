import { buildPolicyContext, runPolicyRuntime } from './policy-runtime';
import { ENSCatalog } from '../catalog';
import { ENSConfigurationRegistry } from '../configuration/registry';
import {
  getActiveControlConfiguration,
  getActiveENSConfiguration,
} from '../configuration/services';
import { ENSLevel } from '../configuration/types';
import {
  ENSDataSourceProvider,
  ENSDataSourceProviderContext,
  ENSNormalizedEvent,
  getENSNormalizedEventsFromProvider,
} from './data-source';
import { controlExpectsFacts, resolveEvidenceForControl } from './evidence';
import { keepLatestRunStateFacts } from './evidence/state-facts';
import {
  findStaleCollector,
  markEvidencesStale,
  markPolicyRuntimeStale,
} from './evidence/stale-collector';
import { evaluateENSControl } from './evaluation';
import {
  buildComplianceState,
  consolidateAgentComplianceResultByControl,
  consolidateAgentComplianceResults,
} from './compliance-state';
import { ENSAgentScope } from './scope/types';
import {
  ENS_MANAGER_AGENT_ID,
  describeOutOfScopeDeclaredMachine,
  describeUnmatchedDeclaredScope,
  getDeclaredScopeAgentNames,
  isAgentNameDeclared,
  isControlInDeclaredScope,
  isControlMeasuredOnAgent,
  isManagerAgentId,
  isManagerOnlyControl,
  markEvidencesUnmatchedScope,
  markPolicyRuntimeUnmatchedScope,
} from './scope/measurement-planes';
import { resolveControlLevel } from './control-level';
import type { ENSControlDefinition } from '../catalog/types';
import type { ENSComplianceResult } from './evaluation/types';

// Nivel efectivo de un control: el global, salvo que el control se rija por el
// nivel de una dimensión declarado en la configuración global (op.exp.8 y la
// Trazabilidad). Ver `control-level.ts`.
const getControlLevel = (
  catalogControl: Parameters<typeof resolveControlLevel>[0],
  level: ENSLevel
): ENSLevel =>
  resolveControlLevel(
    catalogControl,
    level,
    getActiveENSConfiguration()?.global
  );

const getScopedEvents = (
  events: ENSNormalizedEvent[],
  agentId?: string,
  scopeAgents?: ENSAgentScope[]
): ENSNormalizedEvent[] => {
  const scopedAgentIds =
    scopeAgents === undefined
      ? undefined
      : new Set(
          scopeAgents.map(
            agent => agent.id
          )
        );

  return events.filter(event => {
    if (
      scopedAgentIds &&
      (
        !event.agentId ||
        !scopedAgentIds.has(event.agentId)
      )
    ) {
      return false;
    }

    return (
      !agentId ||
      event.agentId === agentId
    );
  });
};

// El nombre de una máquina, para compararlo con el alcance declarado de un
// control: el del inventario del alcance y, si no lo trae, el de sus eventos.
const resolveAgentName = (
  agentId: string,
  events: ENSNormalizedEvent[],
  scopeAgents?: ENSAgentScope[]
): string | undefined =>
  scopeAgents?.find(agent => agent.id === agentId)?.name ||
  events.find(event => event.agentId === agentId && event.agentName)
    ?.agentName;

// ¿Se evalúa este control en la fila de esta máquina? Su plano de medida y, si
// lo declara, su alcance (ver `scope/measurement-planes.ts`).
const isControlEvaluatedOnAgent = (
  control: ENSControlDefinition,
  agentId: string,
  agentName: string | undefined
): boolean =>
  isControlMeasuredOnAgent(control, agentId) &&
  isControlInDeclaredScope(
    control,
    agentName,
    getActiveControlConfiguration(control.id)
  );

// Evalúa UN control sobre los eventos ya recortados a la fila (o al conjunto,
// sin `agentId`). Es el camino único del panel y del detalle.
const evaluateControlOnEvents = (
  catalogControl: ENSControlDefinition,
  level: ENSLevel,
  scopedEvents: ENSNormalizedEvent[],
  agentId?: string,
  now?: Date,
  scopeAgents?: ENSAgentScope[],
  // Hueco de CONFIGURACIÓN impuesto desde fuera: la fila de una máquina que el
  // alcance declarado nombra y que no es ninguna del alcance ENS (ver
  // `buildOutOfScopeDeclaredRows`).
  configurationGap?: string
): ENSComplianceResult => {
  // La configuración se carga ANTES de resolver las evidencias: las que
  // declaran `judgment` se juzgan contra el parámetro que el auditor puso en
  // la pantalla, así que el motor no puede resolverlas sin ella.
  const configuration = getActiveControlConfiguration(catalogControl.id);

  // Sin fila, un control con alcance declarado se mide solo con los hechos de
  // las máquinas declaradas: los de una máquina que no está en su alcance no
  // suman ni restan tampoco aquí. Con la fila, el motor ya solo la evalúa si
  // la máquina está declarada.
  const declaredScope =
    agentId === undefined
      ? getDeclaredScopeAgentNames(catalogControl, configuration)
      : undefined;

  const eventsInScope = declaredScope
    ? scopedEvents.filter(event =>
        isAgentNameDeclared(event.agentName, declaredScope)
      )
    : scopedEvents;

  // Las máquinas que se conocen: las del alcance y, sin él, las de los
  // eventos. Si el alcance declarado no nombra a ninguna (vacío, o una errata
  // en los nombres), no hay de quién esperar hechos: lo que no se ha podido
  // medir es de CONFIGURACIÓN, no de recogida.
  const knownAgentNames = declaredScope
    ? (scopeAgents
        ? scopeAgents.map(agent => agent.name)
        : scopedEvents.map(event => event.agentName)
      ).filter((name): name is string => Boolean(name))
    : [];

  const unmatchedScope =
    declaredScope !== undefined &&
    !knownAgentNames.some(name => isAgentNameDeclared(name, declaredScope));

  const unmatchedScopeReason =
    configurationGap ??
    (unmatchedScope && catalogControl.scopeParameter
      ? describeUnmatchedDeclaredScope(
          catalogControl.scopeParameter,
          declaredScope as string[]
        )
      : undefined);

  // Tampoco se esperan hechos de un control que no escucha ninguno (op.cont.2:
  // solo configuración, sin runbook). Ver `controlExpectsFacts`.
  const expectsFacts =
    !unmatchedScopeReason && controlExpectsFacts(catalogControl.id);

  // Los hechos de ESTADO se juzgan con la última pasada del recolector, antes
  // de que los lean las evidencias y la policy (ver `evidence/state-facts.ts`).
  const controlEvents = keepLatestRunStateFacts(
    catalogControl.id,
    eventsInScope,
    now
  );

  const controlLevel = getControlLevel(catalogControl, level);

  const resolvedEvidences = resolveEvidenceForControl(
    catalogControl.id,
    controlEvents,
    agentId,
    controlLevel,
    configuration,
    now
  );

  const policyContext = buildPolicyContext(
    catalogControl,
    configuration,
    controlLevel,
    controlEvents,
    resolvedEvidences,
    now
  );

  const resolvedPolicyRuntime = runPolicyRuntime(policyContext);

  // En la fila de una máquina, un recolector que lleva más de 24 h sin latir no
  // demuestra nada a fecha de `now`: el control no se juzga con esos datos (ver
  // `evidence/stale-collector.ts`). Sin máquina no
  // hay fila a la que atribuir el latido, y el conjunto sale de consolidar las
  // filas, que ya lo aplican.
  const stale =
    agentId === undefined
      ? undefined
      : findStaleCollector(catalogControl.id, scopedEvents, now);

  const evidences = stale
    ? markEvidencesStale(resolvedEvidences, stale)
    : unmatchedScopeReason
    ? markEvidencesUnmatchedScope(resolvedEvidences, unmatchedScopeReason)
    : resolvedEvidences;

  const policyRuntime = stale
    ? markPolicyRuntimeStale(resolvedPolicyRuntime, stale)
    : unmatchedScopeReason
    ? markPolicyRuntimeUnmatchedScope(resolvedPolicyRuntime, unmatchedScopeReason)
    : resolvedPolicyRuntime;

  return evaluateENSControl(
    catalogControl,
    configuration,
    controlLevel,
    evidences,
    policyRuntime,
    controlEvents,
    expectsFacts
  );
};

const evaluateCatalogControls = (
  catalogControls: ENSControlDefinition[],
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) => {
  const scopedEvents = getScopedEvents(
    events,
    agentId,
    scopeAgents
  );

  return catalogControls.map(catalogControl =>
    evaluateControlOnEvents(
      catalogControl,
      level,
      scopedEvents,
      agentId,
      now,
      scopeAgents
    )
  );
};

// Los controles que se evalúan en la fila de una máquina: los de su plano de
// medida que, si declaran alcance, la tienen declarada (ver
// `scope/measurement-planes.ts`). Sin máquina, todos: es la evaluación del
// conjunto de eventos, sin filas.
const getCatalogControlsForAgent = (
  agentId?: string,
  agentName?: string
): ENSControlDefinition[] =>
  agentId === undefined
    ? ENSCatalog
    : ENSCatalog.filter(control =>
        isControlEvaluatedOnAgent(control, agentId, agentName)
      );

// `now` es el instante al que se evalúa. Por defecto es ahora —el caso del
// panel— y existe como parámetro porque la serie diaria evalúa este mismo
// motor a fechas pasadas: la ventana del latido y la antigüedad de la copia
// tienen que medirse contra el día del punto, no contra hoy.
//
// Con `agentId`, es la fila de ESA máquina: solo produce resultado para los
// controles de su plano y de cuyo alcance declarado forma parte. Un control
// que no se mide en ella no sale, ni como NO_APLICA: no se ha decidido que no
// aplique, es que no se mide ahí.
export const getENSComplianceResults = (
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) =>
  evaluateCatalogControls(
    getCatalogControlsForAgent(
      agentId,
      agentId === undefined
        ? undefined
        : resolveAgentName(agentId, events, scopeAgents)
    ),
    level,
    events,
    agentId,
    scopeAgents,
    now
  );

// Los resultados en el orden del catálogo. La fila del manager (000) es la
// primera al ordenar por id y solo trae sus controles, así que la consolidación
// los pondría delante de los demás.
const sortByCatalog = (
  results: ENSComplianceResult[]
): ENSComplianceResult[] => {
  const catalogOrder = new Map(
    ENSCatalog.map((control, index) => [control.id, index])
  );

  return [...results].sort(
    (left, right) =>
      (catalogOrder.get(left.control.id) ?? Number.MAX_SAFE_INTEGER) -
      (catalogOrder.get(right.control.id) ?? Number.MAX_SAFE_INTEGER)
  );
};

// Vista de UNA máquina. Los controles que se miden solo en el manager son de la
// organización, no de la máquina: se muestran con el resultado de la fila del
// manager. Los de doble plano (op.exp.8) siguen con la fila de la máquina.
// Seleccionado el propio manager, su fila ya los trae y no hay nada que añadir.
const withOrganizationControls = (
  agentResults: ENSComplianceResult[],
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  agentId: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
): ENSComplianceResult[] => {
  if (isManagerAgentId(agentId)) {
    return agentResults;
  }

  const organizationControls = ENSCatalog.filter(isManagerOnlyControl);

  if (organizationControls.length === 0) {
    return agentResults;
  }

  return sortByCatalog([
    ...agentResults,
    ...evaluateCatalogControls(
      organizationControls,
      level,
      events,
      ENS_MANAGER_AGENT_ID,
      scopeAgents,
      now
    ),
  ]);
};

// Vista del conjunto. Cada control sale de consolidar las filas que lo miden. Si
// ninguna lo mide —un control de manager sin el manager en el alcance, que es lo
// que pasa si no está ACTIVE—, se evalúa sobre todos los eventos, igual que se
// hace cuando no hay ninguna fila: el panel tiene siempre el catálogo entero.
const withUnmeasuredControls = (
  consolidatedResults: ENSComplianceResult[],
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  scopeAgents?: ENSAgentScope[],
  now?: Date
): ENSComplianceResult[] => {
  const consolidatedIds = new Set(
    consolidatedResults.map(result => result.control.id)
  );

  const unmeasuredControls = ENSCatalog.filter(
    control => !consolidatedIds.has(control.id)
  );

  return sortByCatalog([
    ...consolidatedResults,
    ...evaluateCatalogControls(
      unmeasuredControls,
      level,
      events,
      undefined,
      scopeAgents,
      now
    ),
  ]);
};

interface ENSAgentIdentity {
  agentId: string;
  agentName?: string;
}

// Exportada para el servidor, que arma el estado control a control (ver
// `control-partition.ts`) y necesita las mismas máquinas, en el mismo orden.
export const getAgentIdentities = (
  events: ENSNormalizedEvent[],
  requestedAgentId?: string,
  scopeAgents?: ENSAgentScope[]
): ENSAgentIdentity[] => {
  const identities = new Map<
    string,
    string | undefined
  >();

  if (scopeAgents !== undefined) {
    scopeAgents
      .filter(
        agent =>
          !requestedAgentId ||
          agent.id === requestedAgentId
      )
      .forEach(agent => {
        identities.set(
          agent.id,
          agent.name
        );
      });
  }

  const identityEvents = getScopedEvents(
    events,
    requestedAgentId,
    scopeAgents
  );

  identityEvents.forEach(event => {
    if (!event.agentId) {
      return;
    }

    const existingName = identities.get(
      event.agentId
    );

    if (
      !identities.has(event.agentId) ||
      (!existingName && event.agentName)
    ) {
      identities.set(
        event.agentId,
        event.agentName
      );
    }
  });

  if (
    scopeAgents === undefined &&
    requestedAgentId &&
    !identities.has(requestedAgentId)
  ) {
    identities.set(
      requestedAgentId,
      undefined
    );
  }

  return Array.from(
    identities.entries()
  )
    .map(([agentId, agentName]) => ({
      agentId,
      agentName,
    }))
    .sort(
      (left, right) =>
        left.agentId.localeCompare(
          right.agentId
        )
    );
};

const buildAgentComplianceStates = (
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  requestedAgentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) =>
  getAgentIdentities(
    events,
    requestedAgentId,
    scopeAgents
  ).map(agent => {
    const agentEvents = getScopedEvents(
      events,
      agent.agentId,
      scopeAgents
    );

    const results =
      getENSComplianceResults(
        level,
        agentEvents,
        agent.agentId,
        scopeAgents,
        now
      );

    const state =
      buildComplianceState(results);

    return {
      agentId: agent.agentId,
      agentName: agent.agentName,
      results,
      summary: state.controlSummary,
    };
  });

// Las máquinas que el alcance declarado de un control nombra y que no son
// ninguna de las que conoce el motor (las del alcance ENS y las de los hechos):
// un nombre mal escrito, o una máquina que está en el grupo de sus copias y no
// en el del ENS. Cuentan como máquinas declaradas SIN DATOS: se añaden a la
// CONSOLIDACIÓN —no a las filas del panel, porque no son máquinas del
// alcance— con todo NO_EVALUABLE por CONFIGURACIÓN y un motivo que las nombra.
// Sin esto, P-04 = «srv-01, srv-99» con srv-01 al día daba el control
// demostrado al 100 %.
const buildOutOfScopeDeclaredRows = (
  controls: ENSControlDefinition[],
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  scopeAgents?: ENSAgentScope[],
  now?: Date
) => {
  const knownNames = getAgentIdentities(events, undefined, scopeAgents)
    .map(agent => agent.agentName)
    .filter((name): name is string => Boolean(name));

  const rows = new Map<string, ENSComplianceResult[]>();

  controls.forEach(control => {
    if (!control.scopeParameter) {
      return;
    }

    (getDeclaredScopeAgentNames(control, getActiveControlConfiguration(control.id)) || [])
      .filter(name => !knownNames.some(known => isAgentNameDeclared(known, [name])))
      .forEach(name => {
        rows.set(name, [
          ...(rows.get(name) || []),
          evaluateControlOnEvents(
            control,
            level,
            [],
            undefined,
            now,
            scopeAgents,
            describeOutOfScopeDeclaredMachine(control.scopeParameter as string, name)
          ),
        ]);
      });
  });

  return Array.from(rows.entries()).map(([name, results]) => ({
    agentId: name,
    agentName: name,
    results,
    summary: buildComplianceState(results).controlSummary,
  }));
};

export const getENSComplianceState = (
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) => {
  const agents = buildAgentComplianceStates(
    level,
    events,
    agentId,
    scopeAgents,
    now
  );

  const selectedAgentResults = agentId
    ? agents.find(
        agent =>
          agent.agentId === agentId
      )?.results
    : undefined;

  const results = agentId
    ? withOrganizationControls(
        selectedAgentResults ||
          getENSComplianceResults(
            level,
            events,
            agentId,
            scopeAgents,
            now
          ),
        level,
        events,
        agentId,
        scopeAgents,
        now
      )
    : agents.length > 0
    ? withUnmeasuredControls(
        consolidateAgentComplianceResults([
          ...agents,
          ...buildOutOfScopeDeclaredRows(
            ENSCatalog,
            level,
            events,
            scopeAgents,
            now
          ),
        ]),
        level,
        events,
        scopeAgents,
        now
      )
    : getENSComplianceResults(
        level,
        events,
        agentId,
        scopeAgents,
        now
      );

  return buildComplianceState(
    results,
    agents
  );
};

export const getENSComplianceStateFromProvider = async (
  provider: ENSDataSourceProvider,
  level: ENSLevel,
  context: ENSDataSourceProviderContext = {},
  scopeAgents?: ENSAgentScope[]
) => {
  const dataSourceResult = await getENSNormalizedEventsFromProvider({
    provider,
    ...context,
  });

  return getENSComplianceState(
    level,
    dataSourceResult.events,
    context.agentId,
    scopeAgents
  );
};

const evaluateENSComplianceResultByControl = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  // El instante al que se evalúa, igual que en la ruta de todos los controles.
  // Lo necesita la serie diaria del detalle: sin él, cada punto del histórico se
  // juzgaría contra el reloj de hoy y la línea bajaría hacia el pasado por el
  // mero hecho de que el pasado es viejo.
  now?: Date
) => {
  const catalogControl = ENSCatalog.find(
    control =>
      control.id === controlId
  );

  if (!catalogControl) {
    return undefined;
  }

  const scopedEvents = getScopedEvents(
    events,
    agentId,
    scopeAgents
  );

  return evaluateControlOnEvents(
    catalogControl,
    level,
    scopedEvents,
    agentId,
    now,
    scopeAgents
  );
};

const buildAgentComplianceStatesByControl = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  scopeAgents?: ENSAgentScope[],
  now?: Date
) =>
  getAgentIdentities(
    events,
    undefined,
    scopeAgents
  )
    // Solo las filas que miden el control: en las demás no produce resultado,
    // y una fila sin resultado no entra en la consolidación.
    .filter(agent => {
      const catalogControl = ENSCatalog.find(
        control => control.id === controlId
      );

      return (
        !catalogControl ||
        isControlEvaluatedOnAgent(
          catalogControl,
          agent.agentId,
          agent.agentName
        )
      );
    })
    .map(agent => {
      const agentEvents = getScopedEvents(
        events,
        agent.agentId,
        scopeAgents
      );

      const result =
        evaluateENSComplianceResultByControl(
          controlId,
          level,
          agentEvents,
          agent.agentId,
          scopeAgents,
          now
        );

      const results = result
        ? [result]
        : [];

      const state =
        buildComplianceState(results);

      return {
        agentId: agent.agentId,
        agentName: agent.agentName,
        results,
        summary: state.controlSummary,
      };
    });

export const getENSComplianceResultByControl = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) => {
  if (agentId) {
    const catalogControl = ENSCatalog.find(
      control => control.id === controlId
    );

    // Misma regla de planos que en `getENSComplianceState`: en la vista de una
    // máquina, un control solo de manager sale con la fila del manager; en la
    // del manager, un control que no se mide en él no tiene resultado.
    if (
      catalogControl &&
      !isControlMeasuredOnAgent(catalogControl, agentId)
    ) {
      return isManagerOnlyControl(catalogControl) &&
        !isManagerAgentId(agentId)
        ? evaluateENSComplianceResultByControl(
            controlId,
            level,
            events,
            ENS_MANAGER_AGENT_ID,
            scopeAgents,
            now
          )
        : undefined;
    }

    // Y la del alcance declarado: en la vista de una máquina que el control
    // no declara, no tiene resultado.
    if (
      catalogControl &&
      !isControlInDeclaredScope(
        catalogControl,
        resolveAgentName(agentId, events, scopeAgents),
        getActiveControlConfiguration(controlId)
      )
    ) {
      return undefined;
    }

    return evaluateENSComplianceResultByControl(
      controlId,
      level,
      events,
      agentId,
      scopeAgents,
      now
    );
  }

  return getENSControlEvaluation(
    controlId,
    level,
    events,
    scopeAgents,
    now
  ).result;
};

// La vista de conjunto de UN control y, además, las filas de las máquinas que
// lo miden. Es la rama sin máquina de `getENSComplianceResultByControl` (que la
// llama) y la usa el servidor, que evalúa control a control: con las filas
// arma la lista de máquinas del panel sin volver a evaluar nada. Las filas de
// las máquinas declaradas que no están en el alcance entran en la
// consolidación, pero no son filas del panel, y por eso no se devuelven.
export const getENSControlEvaluation = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  scopeAgents?: ENSAgentScope[],
  now?: Date
): {
  result: ENSComplianceResult | undefined;
  agents: ReturnType<typeof buildAgentComplianceStatesByControl>;
} => {
  const measuredAgents = buildAgentComplianceStatesByControl(
    controlId,
    level,
    events,
    scopeAgents,
    now
  );

  const agents = [
    ...measuredAgents,
    ...buildOutOfScopeDeclaredRows(
      ENSCatalog.filter(control => control.id === controlId),
      level,
      events,
      scopeAgents,
      now
    ),
  ];

  if (agents.length === 0) {
    return {
      result: evaluateENSComplianceResultByControl(
        controlId,
        level,
        events,
        undefined,
        scopeAgents,
        now
      ),
      agents: measuredAgents,
    };
  }

  return {
    result:
      consolidateAgentComplianceResultByControl(
        agents,
        controlId
      ) ||
      evaluateENSComplianceResultByControl(
        controlId,
        level,
        events,
        undefined,
        scopeAgents,
        now
      ),
    agents: measuredAgents,
  };
};

export const getENSRegisteredConfigurationControls = () =>
  ENSConfigurationRegistry;
