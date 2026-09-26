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
import { resolveEvidenceForControl } from './evidence';
import { keepLatestRunStateFacts } from './evidence/state-facts';
import { evaluateENSControl } from './evaluation';
import {
  buildComplianceState,
  consolidateAgentComplianceResultByControl,
  consolidateAgentComplianceResults,
} from './compliance-state';
import { ENSAgentScope } from './scope/types';
import {
  ENS_MANAGER_AGENT_ID,
  isControlMeasuredOnAgent,
  isManagerAgentId,
  isManagerOnlyControl,
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

  return catalogControls.map(catalogControl => {
    // La configuración se carga ANTES de resolver las evidencias: las que
    // declaran `judgment` se juzgan contra el parámetro que el auditor puso en
    // la pantalla, así que el motor no puede resolverlas sin ella.
    const configuration = getActiveControlConfiguration(catalogControl.id);

    // Los hechos de ESTADO se juzgan con la última pasada del recolector, antes
    // de que los lean las evidencias y la policy (ver `evidence/state-facts.ts`).
    const controlEvents = keepLatestRunStateFacts(
      catalogControl.id,
      scopedEvents,
      now
    );

    const controlLevel = getControlLevel(catalogControl, level);

    const evidences = resolveEvidenceForControl(
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
      evidences,
      now
    );

    const policyRuntime = runPolicyRuntime(policyContext);

    return evaluateENSControl(
      catalogControl,
      configuration,
      controlLevel,
      evidences,
      policyRuntime,
      controlEvents
    );
  });
};

// Los controles que se evalúan en la fila de una máquina: los de su plano de
// medida (ver `scope/measurement-planes.ts`). Sin máquina, todos: es la
// evaluación del conjunto de eventos, sin filas.
const getCatalogControlsForAgent = (
  agentId?: string
): ENSControlDefinition[] =>
  agentId === undefined
    ? ENSCatalog
    : ENSCatalog.filter(control =>
        isControlMeasuredOnAgent(control, agentId)
      );

// `now` es el instante al que se evalúa. Por defecto es ahora —el caso del
// panel— y existe como parámetro porque la serie diaria evalúa este mismo
// motor a fechas pasadas: la ventana del latido y la antigüedad de la copia
// tienen que medirse contra el día del punto, no contra hoy.
//
// Con `agentId`, es la fila de ESA máquina: solo produce resultado para los
// controles de su plano. Un control que no se mide en ella no sale, ni como
// NO_APLICA: no se ha decidido que no aplique, es que no se mide ahí.
export const getENSComplianceResults = (
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  agentId?: string,
  scopeAgents?: ENSAgentScope[],
  now?: Date
) =>
  evaluateCatalogControls(
    getCatalogControlsForAgent(agentId),
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

const getAgentIdentities = (
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
        consolidateAgentComplianceResults(
          agents
        ),
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

  // Mismo orden que en `getENSComplianceResults`: primero la configuración,
  // porque las evidencias con `judgment` la necesitan para resolverse.
  const configuration =
    getActiveControlConfiguration(
      controlId
    );

  // Mismo filtro que en `getENSComplianceResults`: el estado, por su última
  // pasada; las acciones, por la ventana.
  const controlEvents = keepLatestRunStateFacts(
    controlId,
    scopedEvents,
    now
  );

  const controlLevel = getControlLevel(catalogControl, level);

  const evidences = resolveEvidenceForControl(
    controlId,
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
    evidences,
    now
  );

  const policyRuntime =
    runPolicyRuntime(policyContext);

  return evaluateENSControl(
    catalogControl,
    configuration,
    controlLevel,
    evidences,
    policyRuntime,
    controlEvents
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
        isControlMeasuredOnAgent(
          catalogControl,
          agent.agentId
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

    return evaluateENSComplianceResultByControl(
      controlId,
      level,
      events,
      agentId,
      scopeAgents,
      now
    );
  }

  const agents =
    buildAgentComplianceStatesByControl(
      controlId,
      level,
      events,
      scopeAgents,
      now
    );

  if (agents.length === 0) {
    return evaluateENSComplianceResultByControl(
      controlId,
      level,
      events,
      undefined,
      scopeAgents,
      now
    );
  }

  return (
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
    )
  );
};

export const getENSRegisteredConfigurationControls = () =>
  ENSConfigurationRegistry;
