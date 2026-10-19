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
import { normalizeAgentId } from '../../../agent-configuration';
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

      // Lo que una versión posterior guarde junto a `parameters` se conserva.
      const { parameters: _previous, ...rest } = (controls[controlId] || {}) as Record<string, unknown>;
      if (Object.keys(parameters).length) {
        controls[controlId] = { ...rest, parameters } as typeof controls[string];
      } else if (Object.keys(rest).length) {
        controls[controlId] = rest as unknown as typeof controls[string];
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

// --- remedios ---------------------------------------------------------------

/**
 * Quita lo que un perfil guarda y no se aplica: un perfil entero (por ejemplo,
 * uno guardado con un nombre en lugar de un id), los valores de un control o
 * el valor de un parámetro. `agentKey` es la clave TAL CUAL está en el
 * documento, sin normalizar: es la que hay que borrar.
 */
export const removeAgentEntry = (
  configuration: ENSConfigurationVersion,
  agentKey: string,
  controlId?: string,
  parameterId?: string
): ENSConfigurationVersion => {
  if (!configuration.agents || !configuration.agents[agentKey]) {
    return configuration;
  }

  const next = clone(configuration);
  const agents = next.agents!;

  if (!controlId) {
    delete agents[agentKey];
    return next;
  }

  const profile = agents[agentKey];
  const controls = profile.controls || {};

  if (!parameterId) {
    delete controls[controlId];
  } else {
    const entry = controls[controlId];
    if (entry?.parameters) {
      delete entry.parameters[parameterId];
      if (!Object.keys(entry.parameters).length) delete entry.parameters;
    }
    if (entry && !Object.keys(entry).length) delete controls[controlId];
  }

  if (!Object.keys(controls).length) delete profile.controls;
  return next;
};

// Otros nombres por los que se conoce a la máquina en las tablas de la
// configuración: los usa la migración para reconocerla.
export const setAgentAliases = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  aliases: string[],
  agent?: ENSDetectableAgent,
  detection?: ENSSystemDetection
): ENSConfigurationVersion =>
  withProfile(
    configuration,
    agentId,
    current => {
      const clean = mergeAliases(aliases);
      const next = { ...current };
      if (clean) next.aliases = clean;
      else delete next.aliases;
      return next;
    },
    agent,
    detection
  );

// --- vista previa de una plantilla ------------------------------------------

export interface ENSTemplatePreview {
  agentId: string;
  templateId: string;
  label: string;
  // Lo que la plantilla fija en controles que están en la configuración.
  sets: string[];
  // De esos, los que el sistema tiene como valor propio: el suyo sigue ganando.
  ownWins: string[];
  // Parámetros cuyo valor efectivo cambia en este sistema al aplicarla.
  changes: string[];
  // La plantilla de plataforma a la que sustituye, si la hay.
  replaces?: string;
  // La plantilla no es para el tipo de este sistema.
  mismatch?: string;
  // No se puede aplicar (incompatible): el motivo.
  error?: string;
  // Solo al QUITAR la plantilla: los obligatorios que se quedan sin valor en
  // este sistema (tenían valor y dejan de tenerlo).
  leftEmpty?: string[];
  configuration: ENSConfigurationVersion;
}

const TYPE_LABELS: Record<string, string> = {
  linux: 'Linux',
  'zimbra-ldap': 'LDAP (Zimbra)',
  windows: 'Windows',
  manager: 'Manager',
};

// Los parámetros por sistema y por plataforma cuyo valor efectivo en la fila
// de `agentId` cambia de un documento a otro y, de ellos, los obligatorios que
// tenían valor y se quedan sin él.
const effectiveChanges = (
  before: ENSConfigurationVersion,
  after: ENSConfigurationVersion,
  agentId: string
): { changes: string[]; leftEmpty: string[] } => {
  const changes: string[] = [];
  const leftEmpty: string[] = [];
  before.controls.forEach(control => {
    const left = resolveControlConfigurationWithOrigins(before, control.controlId, agentId);
    const right = resolveControlConfigurationWithOrigins(after, control.controlId, agentId);
    control.parameters.forEach(parameter => {
      if (!isAgentLevelParameter(control.controlId, parameter.id)) return;
      const was = left?.configuration.parameters.find(item => item.id === parameter.id)?.value;
      const is = right?.configuration.parameters.find(item => item.id === parameter.id)?.value;
      if (sameValue(was, is)) return;
      changes.push(`${control.controlId} ${parameter.id}`);
      if (parameter.required && !isEmptyParameterValue(was) && isEmptyParameterValue(is)) {
        leftEmpty.push(`${control.controlId} ${parameter.id}`);
      }
    });
  });
  return { changes, leftEmpty };
};

/**
 * Qué haría aplicar `templateId` a una máquina, sin guardar nada: qué fija, qué
 * valores propios siguen ganando, qué cambia de verdad y, si la plantilla no es
 * para su tipo o sustituye a otra de plataforma, el aviso. La pantalla lo
 * enseña y solo guarda tras confirmarlo.
 */
export const previewTemplateApplication = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  templateId: string,
  effectiveType: ENSSystemType | undefined,
  agent?: ENSDetectableAgent,
  detection?: ENSSystemDetection
): ENSTemplatePreview => {
  const id = normalizeAgentId(agentId);
  const template = getConfigurationTemplate(templateId);
  const base: ENSTemplatePreview = {
    agentId: id,
    templateId,
    label: template?.label || templateId,
    sets: [],
    ownWins: [],
    changes: [],
    configuration,
  };

  const result = applyTemplateToAgent(configuration, id, templateId, agent, detection);

  if (!template || result.error) {
    return { ...base, error: result.error || `la plantilla ${templateId} no existe` };
  }

  const profile = configuration.agents?.[id];
  const seeded = (controlId: string) => configuration.controls.some(control => control.controlId === controlId);

  Object.entries(template.values).forEach(([controlId, values]) => {
    if (!seeded(controlId)) return;
    Object.keys(values).forEach(parameterId => {
      base.sets.push(`${controlId} ${parameterId}`);
      const own = profile?.controls?.[controlId]?.parameters;
      if (own && Object.prototype.hasOwnProperty.call(own, parameterId)) {
        base.ownWins.push(`${controlId} ${parameterId}`);
      }
    });
  });

  base.changes.push(...effectiveChanges(configuration, result.configuration, id).changes);

  const replaced =
    template.kind === 'base'
      ? (profile?.templates || []).find(other => other !== templateId && getConfigurationTemplate(other)?.kind === 'base')
      : undefined;

  if (replaced) {
    base.replaces = getConfigurationTemplate(replaced)?.label || replaced;
  }

  if (!effectiveType) {
    base.mismatch = `el tipo de este sistema no está detectado; «${template.label}» es para ${template.systemTypes.map(type => TYPE_LABELS[type] || type).join(' o ')}`;
  } else if (!template.systemTypes.includes(effectiveType)) {
    base.mismatch = `«${template.label}» es para ${template.systemTypes.map(type => TYPE_LABELS[type] || type).join(' o ')} y este sistema es ${TYPE_LABELS[effectiveType] || effectiveType}`;
  }

  return { ...base, configuration: result.configuration };
};

/**
 * Qué haría QUITAR `templateId` de una máquina, sin guardar nada: lo que la
 * plantilla fijaba, qué valores efectivos cambian (pasan a heredar de la
 * siguiente plantilla o de la organización) y qué obligatorios se quedan sin
 * valor. La pantalla lo enseña igual que al aplicar y solo guarda tras
 * confirmarlo.
 */
export const previewTemplateRemoval = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  templateId: string
): ENSTemplatePreview => {
  const id = normalizeAgentId(agentId);
  const template = getConfigurationTemplate(templateId);
  const profile = configuration.agents?.[id];
  const base: ENSTemplatePreview = {
    agentId: id,
    templateId,
    label: template?.label || templateId,
    sets: [],
    ownWins: [],
    changes: [],
    leftEmpty: [],
    configuration,
  };

  if (!(profile?.templates || []).includes(templateId)) {
    return { ...base, error: `la plantilla ${templateId} no está aplicada a ${id}` };
  }

  const seeded = (controlId: string) => configuration.controls.some(control => control.controlId === controlId);
  Object.entries(template?.values || {}).forEach(([controlId, values]) => {
    if (!seeded(controlId)) return;
    Object.keys(values).forEach(parameterId => {
      base.sets.push(`${controlId} ${parameterId}`);
      const own = profile?.controls?.[controlId]?.parameters;
      if (own && Object.prototype.hasOwnProperty.call(own, parameterId)) base.ownWins.push(`${controlId} ${parameterId}`);
    });
  });

  const next = removeTemplateFromAgent(configuration, id, templateId);
  const { changes, leftEmpty } = effectiveChanges(configuration, next, id);
  return { ...base, changes, leftEmpty, configuration: next };
};

const describeValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.length ? value.map(item => String(item)).join('; ') : '(vacío)';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value === undefined || value === null || value === '' ? '(vacío)' : String(value);
};

/**
 * Lo que se pierde al quitar una entrada de un perfil (el perfil entero, un
 * control o un parámetro): una línea por dato guardado. La pantalla lo enseña
 * antes de quitar un perfil o un control enteros, que pueden llevar muchos
 * valores y solo se recuperan desde el historial.
 */
export const describeAgentEntryRemoval = (
  configuration: ENSConfigurationVersion,
  agentKey: string,
  controlId?: string,
  parameterId?: string
): string[] => {
  const profile: any = configuration.agents?.[agentKey];
  if (!profile) return [];
  const lines: string[] = [];
  const controls: Record<string, any> = profile.controls || {};

  if (!controlId) {
    if (profile.name) lines.push(`Nombre: ${profile.name}`);
    if (profile.aliases?.length) lines.push(`Otros nombres: ${profile.aliases.join(', ')}`);
    if (profile.typeOverride) lines.push(`Tipo corregido a mano: ${profile.typeOverride}`);
    if (profile.templates?.length) {
      lines.push(`Plantillas: ${profile.templates.map((id: string) => getConfigurationTemplate(id)?.label || id).join(', ')}`);
    }
  }

  Object.entries(controls)
    .filter(([id]) => !controlId || id === controlId)
    .forEach(([id, entry]) => {
      const parameters: Record<string, unknown> = entry?.parameters || {};
      Object.entries(parameters)
        .filter(([parameter]) => !parameterId || parameter === parameterId)
        .forEach(([parameter, value]) => lines.push(`${id} ${parameter}: ${describeValue(value)}`));
      if (!parameterId && !Object.keys(parameters).length) lines.push(`${id}: sin valores`);
    });

  return lines;
};

// Qué pasa al guardar `value` como valor de un sistema: se quita (vacío), no se
// guarda (igual al que hereda) o pasa a ser propio. La pantalla lo dice antes.
export const describeAgentValueSave = (
  configuration: ENSConfigurationVersion,
  agentId: string,
  controlId: string,
  parameterId: string,
  value: ENSAgentParameterValue | undefined
): 'quitar' | 'igual' | 'propio' => {
  if (value === undefined || isEmptyParameterValue(value)) return 'quitar';
  const profile = configuration.agents?.[normalizeAgentId(agentId)];
  const inherited =
    getAgentTemplateValue(profile, controlId, parameterId)?.value ??
    configuration.controls.find(control => control.controlId === controlId)?.parameters.find(parameter => parameter.id === parameterId)?.value;
  return sameValue(value, inherited) ? 'igual' : 'propio';
};
