// Lo que la pantalla hace con el documento, como funciones PURAS: reciben el
// documento y devuelven otro (nunca lo modifican). El guardado lo hace
// `configuration-state-service`; así cada acción se prueba sin servidor.
import type {
  ENSAgentParameterValue,
  ENSAgentProfile,
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
  ENSSystemType,
} from '../types';
import { normalizeAgentId } from '../../../../common/agent-configuration';
import { isEmptyParameterValue } from '../services/parameter-value-validator';
import { getConfigurationTemplate } from '../templates';
import { ENSConfigurationRegistry } from '../registry';
import { getAgentTemplateValue, resolveControlConfigurationWithOrigins } from './configuration-resolver';
import { getParameterClass, isAgentLevelParameter } from './parameter-classes';
import type { ENSDetectableAgent, ENSSystemDetection } from './system-detection';
import { cloneDocument, mergeAliases, profileIdentity } from './profile-identity';

const clone = cloneDocument;

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const identity = profileIdentity;

const withProfile = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  update: (profile: ENSAgentProfile) => ENSAgentProfile,
  agent?: ENSDetectableAgent,
  detection?: ENSSystemDetection
): ENSConfigurationVersion => {
  const id = normalizeAgentId(agentId);
  const next = clone(configuration);
  const agents = next.agents || {};
  const current = agents[id] || {};
  // La identidad se refresca con lo que se sabe hoy; lo demás se conserva.
  const updated = update({ ...current, ...identity(agent, detection), aliases: mergeAliases(current.aliases, identity(agent).aliases) });
  if (!updated.aliases?.length) delete updated.aliases;
  agents[id] = updated;
  next.agents = agents;
  return next;
};

/**
 * Valor propio de un agente para un parámetro. `undefined` lo QUITA (la clave
 * desaparece; nunca `null`). Un valor igual al que heredaría (de su plantilla o
 * de la organización) tampoco se guarda: así lo que es propio de la máquina se
 * ve, y lo heredado sigue a su origen cuando cambie.
 */
export const setAgentParameterValue = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  controlId: string,
  parameterId: string,
  value: ENSAgentParameterValue | undefined,
  agent?: ENSDetectableAgent,
  detection?: ENSSystemDetection
): ENSConfigurationVersion => {
  if (!isAgentLevelParameter(controlId, parameterId)) {
    throw new Error(`${controlId} ${parameterId} es un parámetro de organización: no admite valor por agente.`);
  }

  const id = normalizeAgentId(agentId);
  const profile = configuration.agents?.[id];
  const inherited =
    getAgentTemplateValue(profile, controlId, parameterId)?.value ??
    configuration.controls.find(control => control.controlId === controlId)?.parameters.find(parameter => parameter.id === parameterId)?.value;
  const remove = value === undefined || isEmptyParameterValue(value) || sameValue(value, inherited);

  return withProfile(
    configuration,
    id,
    current => {
      const controls = { ...(current.controls || {}) };
      const parameters = { ...(controls[controlId]?.parameters || {}) };

      if (remove) {
        delete parameters[parameterId];
      } else {
        parameters[parameterId] = value as ENSAgentParameterValue;
      }

      if (Object.keys(parameters).length) {
        controls[controlId] = { parameters };
      } else {
        delete controls[controlId];
      }

      const next = { ...current, controls };
      if (!Object.keys(controls).length) delete next.controls;
      return next;
    },
    agent,
    detection
  );
};

/**
 * Aplica una plantilla a una máquina. Una plantilla de plataforma SUSTITUYE a
 * la que tuviera (una máquina es de una plataforma); un añadido se suma, salvo
 * que sea incompatible con otro (PBS y Zimbra NE): entonces se devuelve el
 * motivo y el documento no cambia.
 */
export const applyTemplateToAgent = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  templateId: string,
  agent?: ENSDetectableAgent,
  detection?: ENSSystemDetection
): { configuration: ENSConfigurationVersion; error?: string } => {
  const template = getConfigurationTemplate(templateId);

  if (!template) {
    return { configuration, error: `la plantilla ${templateId} no existe en esta versión del plugin` };
  }

  const applied = configuration.agents?.[normalizeAgentId(agentId)]?.templates || [];
  const kept = template.kind === 'base'
    ? applied.filter(id => getConfigurationTemplate(id)?.kind !== 'base')
    : applied.filter(id => id !== templateId);
  const clash = kept.find(
    id => template.incompatibleWith?.includes(id) || getConfigurationTemplate(id)?.incompatibleWith?.includes(templateId)
  );

  if (clash) {
    return {
      configuration,
      error: `${template.label} no se combina con ${getConfigurationTemplate(clash)?.label || clash}`,
    };
  }

  // La plataforma primero y los añadidos después: con el orden de aplicación
  // gana la primera plantilla que fija cada parámetro.
  const templates = template.kind === 'base' ? [templateId, ...kept] : [...kept, templateId];

  return {
    configuration: withProfile(configuration, agentId, current => ({ ...current, templates }), agent, detection),
  };
};

export const removeTemplateFromAgent = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  templateId: string
): ENSConfigurationVersion =>
  withProfile(configuration, agentId, current => {
    const templates = (current.templates || []).filter(id => id !== templateId);
    const next = { ...current, templates };
    if (!templates.length) delete next.templates;
    return next;
  });

// Corrige el tipo a mano (`undefined` vuelve al detectado). Guarda también lo
// detectado, para que se vea qué se corrigió.
export const setAgentTypeOverride = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  type: ENSSystemType | undefined,
  agent?: ENSDetectableAgent,
  detection?: ENSSystemDetection
): ENSConfigurationVersion =>
  withProfile(
    configuration,
    agentId,
    current => {
      const next = { ...current };
      if (type) next.typeOverride = type;
      else delete next.typeOverride;
      return next;
    },
    agent,
    detection
  );

// --- controles del catálogo que no están en el documento --------------------

// Los controles del catálogo que el documento no tiene (los que
// `inject-control.py` todavía no ha sembrado).
export const getMissingCatalogControls = (
  configuration: Pick<ENSConfigurationVersion, 'controls'>,
  registry: ENSControlConfiguration[] = ENSConfigurationRegistry
): ENSControlConfiguration[] =>
  registry.filter(control => !configuration.controls.some(item => item.controlId === control.controlId));

/**
 * Añade controles que faltan con sus valores por defecto: la definición del
 * control tal cual (la misma que el bloque semilla de `config/`) y ningún
 * valor, salvo los `defaultValue` que declare. Es lo que hace
 * `inject-control.py` con un control que no estaba («Alta»): no toca los demás
 * controles, ni `agents`, ni crea asignaciones. Un control que ya está no se
 * toca: para fusionar uno existente, `inject-control.py`.
 */
export const addMissingControls = (
  configuration: ENSConfigurationVersion,
  controlIds: string[],
  registry: ENSControlConfiguration[] = ENSConfigurationRegistry
): { configuration: ENSConfigurationVersion; added: string[] } => {
  const missing = getMissingCatalogControls(configuration, registry).filter(control =>
    controlIds.includes(control.controlId)
  );

  if (!missing.length) {
    return { configuration, added: [] };
  }

  const next = clone(configuration);
  missing.forEach(control => {
    const block = clone(control);
    block.parameters = block.parameters.map(parameter => {
      const { value: _omitted, status: _status, ...rest } = parameter;
      return rest;
    });
    next.controls.push(block);
  });

  return { configuration: next, added: missing.map(control => control.controlId) };
};

// --- completitud de un agente -----------------------------------------------

export interface ENSAgentCompleteness {
  withValue: number;
  total: number;
  ownValues: number;
  missingRequired: string[];
}

/**
 * Cuántos parámetros por sistema y por plataforma tienen valor efectivo para
 * esta máquina (propio, de plantilla o de organización) entre los controles que
 * se le aplican, al nivel de cada control; y qué obligatorios faltan.
 */
export const getAgentCompleteness = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  controls: { controlId: string; level: ENSLevel }[]
): ENSAgentCompleteness => {
  const result: ENSAgentCompleteness = { withValue: 0, total: 0, ownValues: 0, missingRequired: [] };

  controls.forEach(({ controlId, level }) => {
    const resolved = resolveControlConfigurationWithOrigins(configuration, controlId, agentId);
    resolved?.configuration.parameters.forEach(parameter => {
      const parameterClass = getParameterClass(controlId, parameter.id);
      if (parameterClass !== 'system' && parameterClass !== 'platform') return;
      if (!parameter.levels.includes(level)) return;
      result.total += 1;
      if (resolved.origins[parameter.id]?.source === 'agent') result.ownValues += 1;
      if (!isEmptyParameterValue(parameter.value)) result.withValue += 1;
      else if (parameter.required) result.missingRequired.push(`${controlId} ${parameter.id}`);
    });
  });

  return result;
};
