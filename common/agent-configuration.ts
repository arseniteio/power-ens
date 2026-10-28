// Top-level keys, not inside parameters: inject-control.py keeps only `value` and the validator only scalars and lists.

export type ENSSystemType = 'linux' | 'zimbra-ldap' | 'windows' | 'manager';

export const ENS_SYSTEM_TYPES: ENSSystemType[] = ['linux', 'zimbra-ldap', 'windows', 'manager'];

export const ENS_SYSTEM_TYPE_LABELS: Record<ENSSystemType, string> = {
  linux: 'Linux',
  'zimbra-ldap': 'Servidor LDAP',
  windows: 'Windows',
  manager: 'Manager Wazuh',
};

// Same contract as `value`: a scalar or a list of text. Never `null`: removing an agent's own value means DELETING the key.
export type ENSAgentParameterValue = string | number | boolean | string[];

// How a list value is compared: absent means exact, the 1.1.0 and 1.2.0 behaviour.
export type ENSMatchMode = 'exact' | 'regex';

export const ENS_MATCH_MODES: ENSMatchMode[] = ['exact', 'regex'];

export interface ENSAgentControlOverrides {
  // Absent: the built-in template of the agent's type; ENS_NO_TEMPLATE: no template, common values.
  templateId?: string;
  parameters?: Record<string, ENSAgentParameterValue>;
  // Mode of an override in `parameters`; it never applies to a value from another level.
  matchModes?: Record<string, ENSMatchMode>;
}

export const ENS_NO_TEMPLATE = 'none';

export interface ENSCustomTemplate {
  id: string;
  controlId: string;
  name: string;
  description?: string;
  systemType?: ENSSystemType;
  values: Record<string, ENSAgentParameterValue>;
  matchModes?: Record<string, ENSMatchMode>;
}

export interface ENSAgentProfile {
  name?: string;
  aliases?: string[];
  detectedType?: ENSSystemType;
  detectedBy?: string;
  typeOverride?: ENSSystemType;
  // 1.2.0 cross-control templates, kept only until the 1.3.0 conversion runs.
  templates?: string[];
  controls?: Record<string, ENSAgentControlOverrides>;
}

export type ENSAgentsConfiguration = Record<string, ENSAgentProfile>;

// Normalized Wazuh id: numeric with at least three digits (`24` and `024` are the same agent), as in the `wazuh-monitoring` inventory.
export const normalizeAgentId = (value: unknown): string => {
  const text = String(value ?? '').trim();
  return /^\d+$/.test(text) ? text.padStart(3, '0') : text;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

export const isAgentParameterValue = (value: unknown): value is ENSAgentParameterValue =>
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  typeof value === 'boolean' ||
  isStringArray(value);

const PROFILE_KEYS = ['name', 'aliases', 'detectedType', 'detectedBy', 'typeOverride', 'templates', 'controls'];
const CONTROL_KEYS = ['templateId', 'parameters', 'matchModes'];
export const ENS_CUSTOM_TEMPLATE_KEYS = ['id', 'controlId', 'name', 'description', 'systemType', 'values', 'matchModes'];

const isMatchMode = (value: unknown): value is ENSMatchMode => ENS_MATCH_MODES.includes(value as ENSMatchMode);

// Fatal like an invalid `value`: a pattern read with the wrong mode would be judged as a literal name.
const validateMatchModesShape = (value: unknown, path: string): string[] => {
  if (value === undefined) return [];
  if (!isRecord(value)) return [`${path} must be an object keyed by parameter id.`];
  return Object.entries(value)
    .filter(([, mode]) => !isMatchMode(mode))
    .map(([parameterId]) => `${path}.${parameterId} must be "exact" or "regex".`);
};

// Is `key` a normalized agent id (`000`, `024`, `1003`)? Profiles are stored by id: a name (`srv-web01`) never matches a machine's row and its value would not apply.
export const isNormalisedAgentId = (key: string): boolean =>
  /^\d+$/.test(key) && normalizeAgentId(key) === key;

export const describeNonIdAgentKey = (key: string): string =>
  /^\d+$/.test(key.trim())
    ? `«${key}» no es un id de agente normalizado; usar ${normalizeAgentId(key)}`
    : `«${key}» no es un id de agente; usar el id numérico del agente de Wazuh (p. ej. 001)`;

// Checks the SHAPE of `configuration.agents` the engine needs: an absent key is valid; when present, a map of profiles whose known fields have their type and whose values are a scalar or a list of text (never `null` or an object).
// These are the only FATAL errors, used by the structural validator (hydration) and the server save.
// Not fatal on purpose, given by `checkAgentsConfigurationKeys`: a profile key that is not a normalized id (a meaning error); a key this version does not know inside a profile or control (a warning, so a later version can add fields);
// a system type this version does not know (a warning).
export const validateAgentsConfigurationShape = (
  value: unknown,
  path: string = 'configuration.agents'
): string[] => {
  const errors: string[] = [];

  if (value === undefined) {
    return errors;
  }

  if (!isRecord(value)) {
    return [`${path} must be an object keyed by agent id.`];
  }

  Object.entries(value).forEach(([agentId, profile]) => {
    const at = `${path}.${agentId}`;

    if (!isRecord(profile)) {
      errors.push(`${at} must be an object.`);
      return;
    }

    if (profile.name !== undefined && typeof profile.name !== 'string') {
      errors.push(`${at}.name must be a string.`);
    }

    if (profile.aliases !== undefined && !isStringArray(profile.aliases)) {
      errors.push(`${at}.aliases must be a string array.`);
    }

    (['detectedBy', 'detectedType', 'typeOverride'] as const).forEach(key => {
      if (profile[key] !== undefined && typeof profile[key] !== 'string') {
        errors.push(`${at}.${key} must be a string.`);
      }
    });

    if (profile.templates !== undefined && !isStringArray(profile.templates)) {
      errors.push(`${at}.templates must be a string array.`);
    }

    if (profile.controls === undefined) {
      return;
    }

    if (!isRecord(profile.controls)) {
      errors.push(`${at}.controls must be an object keyed by control id.`);
      return;
    }

    Object.entries(profile.controls).forEach(([controlId, control]) => {
      const cat = `${at}.controls.${controlId}`;

      if (!isRecord(control)) {
        errors.push(`${cat} must be an object.`);
        return;
      }

      if (control.templateId !== undefined && (typeof control.templateId !== 'string' || !control.templateId.trim())) {
        errors.push(`${cat}.templateId must be a non-empty string (to go back to the built-in template of the type, remove the key).`);
      }

      errors.push(...validateMatchModesShape(control.matchModes, `${cat}.matchModes`));

      if (control.parameters === undefined) {
        return;
      }

      if (!isRecord(control.parameters)) {
        errors.push(`${cat}.parameters must be an object keyed by parameter id.`);
        return;
      }

      Object.entries(control.parameters).forEach(([parameterId, parameterValue]) => {
        if (!isAgentParameterValue(parameterValue)) {
          errors.push(
            `${cat}.parameters.${parameterId} has an invalid value (a string, a number, a boolean or a string array; to clear it, remove the key, never null).`
          );
        }
      });
    });
  });

  return errors;
};

// The common value's mode, checked on save: the hydration refuses an unknown one and the environment would not load.
export const validateCommonMatchModesShape = (controls: unknown, path: string = 'configuration.controls'): string[] =>
  Array.isArray(controls)
    ? controls.flatMap((control, controlIndex) =>
        isRecord(control) && Array.isArray(control.parameters)
          ? control.parameters
              .map((parameter, parameterIndex) => ({ parameter, parameterIndex }))
              .filter(({ parameter }) => isRecord(parameter) && parameter.matchMode !== undefined && !isMatchMode(parameter.matchMode))
              .map(({ parameterIndex }) => `${path}[${controlIndex}].parameters[${parameterIndex}].matchMode must be "exact" or "regex".`)
          : []
      )
    : [];

// Only what would stop the environment from loading; meaning is the agent validator's job.
export const validateCustomTemplatesShape = (
  value: unknown,
  path: string = 'configuration.templates'
): string[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return [`${path} must be an array of templates.`];
  }

  const errors: string[] = [];

  value.forEach((template, index) => {
    const at = `${path}[${index}]`;

    if (!isRecord(template)) {
      errors.push(`${at} must be an object.`);
      return;
    }

    (['id', 'controlId', 'name'] as const).forEach(key => {
      if (typeof template[key] !== 'string' || !(template[key] as string).trim()) {
        errors.push(`${at}.${key} must be a non-empty string.`);
      }
    });

    (['description', 'systemType'] as const).forEach(key => {
      if (template[key] !== undefined && typeof template[key] !== 'string') {
        errors.push(`${at}.${key} must be a string.`);
      }
    });

    errors.push(...validateMatchModesShape(template.matchModes, `${at}.matchModes`));

    if (!isRecord(template.values)) {
      errors.push(`${at}.values must be an object keyed by parameter id.`);
      return;
    }

    Object.entries(template.values).forEach(([parameterId, parameterValue]) => {
      if (!isAgentParameterValue(parameterValue)) {
        errors.push(
          `${at}.values.${parameterId} has an invalid value (a string, a number, a boolean or a string array; to clear it, remove the key, never null).`
        );
      }
    });
  });

  return errors;
};

export const checkCustomTemplatesKeys = (
  value: unknown,
  path: string = 'configuration.templates'
): string[] =>
  Array.isArray(value)
    ? value.flatMap((template, index) =>
        isRecord(template)
          ? Object.keys(template)
              .filter(key => !ENS_CUSTOM_TEMPLATE_KEYS.includes(key))
              .map(key => `${path}[${index}].${key}: esta versión no conoce la clave y la ignora.`)
          : []
      )
    : [];

interface ENSAgentsKeyCheck {
  // Profiles stored with a key that is not an id: their value does not apply.
  errors: string[];
  // What this version does not know and ignores.
  warnings: string[];
}

export const checkAgentsConfigurationKeys = (
  value: unknown,
  path: string = 'configuration.agents'
): ENSAgentsKeyCheck => {
  const result: ENSAgentsKeyCheck = { errors: [], warnings: [] };

  if (!isRecord(value)) {
    return result;
  }

  Object.entries(value).forEach(([agentId, profile]) => {
    const at = `${path}.${agentId}`;

    if (!isNormalisedAgentId(agentId)) {
      result.errors.push(`${at}: ${describeNonIdAgentKey(agentId)}.`);
    }

    if (!isRecord(profile)) {
      return;
    }

    Object.keys(profile)
      .filter(key => !PROFILE_KEYS.includes(key))
      .forEach(key => result.warnings.push(`${at}.${key}: esta versión no conoce la clave y la ignora.`));

    (['detectedType', 'typeOverride'] as const).forEach(key => {
      const type = profile[key];
      if (typeof type === 'string' && !ENS_SYSTEM_TYPES.includes(type as ENSSystemType)) {
        result.warnings.push(`${at}.${key}: el tipo «${type}» no es de esta versión (${ENS_SYSTEM_TYPES.join(', ')}) y se ignora.`);
      }
    });

    if (!isRecord(profile.controls)) {
      return;
    }

    Object.entries(profile.controls).forEach(([controlId, control]) => {
      if (!isRecord(control)) return;
      Object.keys(control)
        .filter(key => !CONTROL_KEYS.includes(key))
        .forEach(key => result.warnings.push(`${at}.controls.${controlId}.${key}: esta versión no conoce la clave y la ignora.`));
    });
  });

  return result;
};

// The type, if from this version. An unknown type (from a later version) is treated as absent.
export const knownSystemType = (value: unknown): ENSSystemType | undefined =>
  typeof value === 'string' && ENS_SYSTEM_TYPES.includes(value as ENSSystemType)
    ? (value as ENSSystemType)
    : undefined;
