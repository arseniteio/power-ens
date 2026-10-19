// FROZEN COPY of the 1.2.0 resolver (f2e6bd9), only the import paths changed: the parity reference for 1.3.0. Do not edit.

// CÓMO SE RESUELVE UN VALOR: agente → plantillas del agente → organización.
//
// Es el ÚNICO punto por el que la configuración entra en la evaluación
// (`getActiveControlConfiguration`, que el motor llama con el id de la fila).
// Devuelve un `ENSControlConfiguration` ya fusionado, así que las policies, el
// juicio de evidencias y la validación de completitud no cambian: leen
// `parameters[].value` como siempre.
//
// Reglas:
//   - Solo los parámetros «por sistema» y «por plataforma» (ver
//     `parameter-classes.ts`) pueden venir de un agente o de una plantilla. Los
//     de organización salen siempre de la organización, aunque un perfil traiga
//     un valor para ellos (el validador lo señala como error).
//   - Se sustituye el parámetro ENTERO, igual que `set-parameters.py`: una
//     tabla del agente reemplaza a la de la organización, no se mezclan filas.
//   - Plantillas en el orden en que están aplicadas: gana la primera que da
//     valor al parámetro.
//   - UNIÓN en lugar de herencia para los parámetros que describen OTRAS
//     máquinas: los «por sistema» de un control que se mide en el manager,
//     cuando se resuelven para la fila del manager (op.exp.7 P-04/P-07,
//     op.cont.3 P-07, op.mon.1 P-01, y en su fila de manager op.exp.8 P-02 y
//     op.mon.3 P-01/P-03/P-07), y el parámetro de alcance declarado (mp.info.6
//     P-04), que el motor lee entero para saber dónde se mide el control. Su
//     valor es el de la organización más las filas de cada agente (valor propio
//     o de su plantilla), sin repetir: la tabla que la policy ya sabe leer.
//   - Sin la clave `agents` (o sin nada que aporte para el control), devuelve
//     EL MISMO objeto de la organización: los veredictos son los de siempre.
//
// La vista de organización (sin agente) aplica las mismas uniones: es la que
// usa el motor cuando no hay fila (sin inventario) y para el alcance declarado.
import type {
  ENSAgentParameterValue,
  ENSAgentProfile,
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSControlParameter,
} from '../../../common/ens/configuration/types';
import { normalizeAgentId } from '../agent-configuration-1.2.0';
import {
  toParameterListItems,
  toParameterTableRows,
  toTableRowCells,
} from '../../../common/ens/configuration/services/parameter-value-validator';
import { getENSCatalogControl } from '../../../common/ens/catalog';
import type { ENSControlDefinition } from '../../../common/ens/catalog/types';
import { getConfigurationTemplate } from './templates';
import { getParameterClass, isAgentLevelParameter } from '../../../common/ens/configuration/agents/parameter-classes';
import { ENS_MANAGER_AGENT_ID } from '../../../common/ens/core/scope/measurement-planes';

export const ENS_MANAGER_AGENT = ENS_MANAGER_AGENT_ID;

export type ENSValueSource = 'agent' | 'template' | 'organisation' | 'union';

export interface ENSResolvedValueOrigin {
  source: ENSValueSource;
  templateId?: string;
  // En una unión, los agentes que aportan filas.
  contributors?: string[];
}

type CatalogLookup = (controlId: string) => Pick<ENSControlDefinition, 'measurementPlanes' | 'scopeParameter'> | undefined;

const defaultCatalogLookup: CatalogLookup = controlId => getENSCatalogControl(controlId);

const hasOwn = (record: object | undefined, key: string): boolean =>
  !!record && Object.prototype.hasOwnProperty.call(record, key);

// El valor propio de un agente para un parámetro, si lo tiene.
export const getAgentOwnValue = (
  profile: ENSAgentProfile | undefined,
  controlId: string,
  parameterId: string
): ENSAgentParameterValue | undefined => {
  const parameters = profile?.controls?.[controlId]?.parameters;
  return hasOwn(parameters, parameterId) ? parameters![parameterId] : undefined;
};

// El valor que dan las plantillas aplicadas a un agente: la primera que lo fija.
export const getAgentTemplateValue = (
  profile: ENSAgentProfile | undefined,
  controlId: string,
  parameterId: string
): { value: ENSAgentParameterValue; templateId: string } | undefined => {
  for (const templateId of profile?.templates || []) {
    const values = getConfigurationTemplate(templateId)?.values?.[controlId];
    if (hasOwn(values, parameterId)) {
      return { value: values![parameterId], templateId };
    }
  }
  return undefined;
};

// Valor de nivel de agente (propio o de plantilla), sin caer a la organización.
export const getAgentLevelValue = (
  profile: ENSAgentProfile | undefined,
  controlId: string,
  parameterId: string
): { value: ENSAgentParameterValue; origin: ENSResolvedValueOrigin } | undefined => {
  if (!isAgentLevelParameter(controlId, parameterId)) {
    return undefined;
  }

  const own = getAgentOwnValue(profile, controlId, parameterId);

  if (own !== undefined) {
    return { value: own, origin: { source: 'agent' } };
  }

  const fromTemplate = getAgentTemplateValue(profile, controlId, parameterId);

  return fromTemplate
    ? { value: fromTemplate.value, origin: { source: 'template', templateId: fromTemplate.templateId } }
    : undefined;
};

const isManagerRow = (agentId?: string): boolean =>
  agentId === undefined || normalizeAgentId(agentId) === ENS_MANAGER_AGENT;

// ¿Se resuelve por UNIÓN este parámetro en esta fila?
export const isUnionParameter = (
  controlId: string,
  parameterId: string,
  agentId?: string,
  catalogLookup: CatalogLookup = defaultCatalogLookup
): boolean => {
  const control = catalogLookup(controlId);

  if (control?.scopeParameter === parameterId) {
    return true;
  }

  return (
    getParameterClass(controlId, parameterId) === 'system' &&
    (control?.measurementPlanes || []).includes('manager') &&
    isManagerRow(agentId)
  );
};

const rowsOf = (parameter: ENSControlParameter, value: unknown): string[] =>
  (parameter.type === 'table'
    ? toParameterTableRows(value as ENSControlParameter['value'])
    : toParameterListItems(value as ENSControlParameter['value'])
  )
    .map(row => String(row))
    .filter(row => row.trim().length > 0);

// Dos filas son la misma solo si dicen EXACTAMENTE lo mismo celda a celda,
// sin contar los espacios alrededor de `|`. Las mayúsculas cuentan: en Linux
// `Ana` y `ana` son dos cuentas distintas.
export const rowKey = (row: string): string =>
  toTableRowCells(row).join('|');

const resolveUnion = (
  configuration: Pick<ENSConfigurationVersion, 'agents'>,
  controlId: string,
  parameter: ENSControlParameter
): { value: string[]; contributors: string[] } | undefined => {
  const seen = new Set<string>();
  const rows: string[] = [];
  const add = (row: string): boolean => {
    const key = rowKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    rows.push(row);
    return true;
  };

  rowsOf(parameter, parameter.value).forEach(add);

  const contributors: string[] = [];

  Object.keys(configuration.agents || {})
    .sort()
    .forEach(agentId => {
      const agentValue = getAgentLevelValue(configuration.agents![agentId], controlId, parameter.id);
      if (!agentValue) return;
      const added = rowsOf(parameter, agentValue.value).map(add).some(Boolean);
      if (added) contributors.push(agentId);
    });

  return contributors.length ? { value: rows, contributors } : undefined;
};

export interface ENSResolvedControlConfiguration {
  configuration: ENSControlConfiguration;
  origins: Record<string, ENSResolvedValueOrigin>;
}

/**
 * Resuelve un control para la fila de un agente (o, sin agente, la vista de
 * organización) y dice de dónde sale cada valor. Lo usa la pantalla; el motor
 * usa `resolveControlConfigurationForAgent`, que es lo mismo sin los orígenes y
 * con memoria.
 */
export const resolveControlConfigurationWithOrigins = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'agents'>,
  controlId: string,
  agentId?: string,
  catalogLookup: CatalogLookup = defaultCatalogLookup
): ENSResolvedControlConfiguration | undefined => {
  const base = configuration.controls.find(control => control.controlId === controlId);

  if (!base) {
    return undefined;
  }

  const origins: Record<string, ENSResolvedValueOrigin> = {};
  base.parameters.forEach(parameter => {
    origins[parameter.id] = { source: 'organisation' };
  });

  const agents = configuration.agents;

  if (!agents || Object.keys(agents).length === 0) {
    return { configuration: base, origins };
  }

  const profile = agentId === undefined ? undefined : agents[normalizeAgentId(agentId)];
  let changed = false;

  const parameters = base.parameters.map(parameter => {
    if (!isAgentLevelParameter(controlId, parameter.id)) {
      return parameter;
    }

    if (isUnionParameter(controlId, parameter.id, agentId, catalogLookup)) {
      const union = resolveUnion(configuration, controlId, parameter);
      if (!union) return parameter;
      changed = true;
      origins[parameter.id] = { source: 'union', contributors: union.contributors };
      return { ...parameter, value: union.value };
    }

    const agentValue = agentId === undefined ? undefined : getAgentLevelValue(profile, controlId, parameter.id);

    if (!agentValue) {
      return parameter;
    }

    changed = true;
    origins[parameter.id] = agentValue.origin;
    return { ...parameter, value: agentValue.value };
  });

  return {
    configuration: changed ? { ...base, parameters } : base,
    origins,
  };
};

// Memoria por documento: el repositorio sustituye el objeto en cada guardado,
// así que la clave (control, agente) dentro de un documento no caduca nunca.
// La evaluación resuelve el mismo control para la misma fila muchas veces
// (serie diaria, vistas), y esto lo deja en una búsqueda en un mapa.
const cache = new WeakMap<object, Map<string, ENSControlConfiguration | undefined>>();

export const resolveControlConfigurationForAgent = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'agents'>,
  controlId: string,
  agentId?: string
): ENSControlConfiguration | undefined => {
  if (!configuration.agents || Object.keys(configuration.agents).length === 0) {
    return configuration.controls.find(control => control.controlId === controlId);
  }

  let byKey = cache.get(configuration);

  if (!byKey) {
    byKey = new Map();
    cache.set(configuration, byKey);
  }

  const key = `${controlId}|${agentId === undefined ? '' : normalizeAgentId(agentId)}`;

  if (!byKey.has(key)) {
    byKey.set(key, resolveControlConfigurationWithOrigins(configuration, controlId, agentId)?.configuration);
  }

  return byKey.get(key);
};
