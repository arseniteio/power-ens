// Per-agent configuration: the `configuration.agents` and `configuration.templates` layers of the
// `active` document in wazuh-ens-configuration. Pure types and functions shared by browser and server.
//
//   configuration.controls[].parameters[].value   common value of the control (what 1.1.0, the chatbot and the scripts read)
//   configuration.templates = [                    custom templates (1.3.0); built-ins live in code
//     { id, controlId, name, description?, systemType?, values: { "<P-xx>": value } }
//   ]
//   configuration.agents = {
//     "<normalised agent id>": {
//       name, aliases[], detectedType, detectedBy, typeOverride,
//       templates[],                                1.2.0 only: converted to per-control templateId on load
//       controls: { "<control>": { templateId?, parameters: { "<P-xx>": value } } }
//     }
//   }
//
// Top-level keys because the structure validator only admits scalars and string lists in `value`, and
// inject-control.py replaces the parameter object keeping only `value`.

export type ENSSystemType = 'linux' | 'zimbra-ldap' | 'windows' | 'manager';

export const ENS_SYSTEM_TYPES: ENSSystemType[] = ['linux', 'zimbra-ldap', 'windows', 'manager'];

export const ENS_SYSTEM_TYPE_LABELS: Record<ENSSystemType, string> = {
  linux: 'Linux',
  'zimbra-ldap': 'Servidor LDAP',
  windows: 'Windows',
  manager: 'Manager Wazuh',
};

// El mismo contrato que `value`: un escalar o una lista de texto. Nunca `null`:
// quitar el valor propio de un agente es BORRAR la clave.
export type ENSAgentParameterValue = string | number | boolean | string[];

export interface ENSAgentControlOverrides {
  // Absent: the built-in template of the agent's type; ENS_NO_TEMPLATE: no template, common values.
  templateId?: string;
  parameters?: Record<string, ENSAgentParameterValue>;
}

export const ENS_NO_TEMPLATE = 'none';

export interface ENSCustomTemplate {
  id: string;
  controlId: string;
  name: string;
  description?: string;
  systemType?: ENSSystemType;
  values: Record<string, ENSAgentParameterValue>;
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

// El id de Wazuh normalizado: numérico y con tres cifras al menos (`24` y
// `024` son el mismo agente), igual que el inventario de `wazuh-monitoring`.
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
const CONTROL_KEYS = ['templateId', 'parameters'];
const TEMPLATE_KEYS = ['id', 'controlId', 'name', 'description', 'systemType', 'values'];

// ¿Es `key` un id de agente normalizado (`000`, `024`, `1003`)? Los perfiles
// se guardan por id: un nombre (`srv-web01`) no casa nunca con la fila de una
// máquina y su valor no se aplicaría.
export const isNormalisedAgentId = (key: string): boolean =>
  /^\d+$/.test(key) && normalizeAgentId(key) === key;

export const describeNonIdAgentKey = (key: string): string =>
  /^\d+$/.test(key.trim())
    ? `«${key}» no es un id de agente normalizado; usar ${normalizeAgentId(key)}`
    : `«${key}» no es un id de agente; usar el id numérico del agente de Wazuh (p. ej. 001)`;

/**
 * Comprueba la FORMA de `configuration.agents` que el motor necesita para no
 * romperse: la clave ausente es válida; presente, un mapa de perfiles cuyos
 * campos conocidos tienen su tipo y cuyos valores son un escalar o una lista de
 * texto (nunca `null` ni un objeto). Estos errores son los únicos FATALES: los
 * usa el validador estructural (hidratación) y el guardado del servidor.
 *
 * No son fatales, a propósito, y los da `checkAgentsConfigurationKeys`:
 *   - una clave de perfil que no es un id normalizado (error de significado);
 *   - una clave que esta versión no conoce, dentro de un perfil o de un control
 *     (aviso: una versión posterior puede añadir campos y volver a esta no
 *     puede tumbar el entorno);
 *   - un tipo de sistema que esta versión no conoce (aviso).
 */
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

// Fatal shape of `configuration.templates`: absent, or an array of templates whose values are scalars or
// string lists. Meaning (control, parameter class, duplicate ids, valid values) is checked elsewhere.
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
              .filter(key => !TEMPLATE_KEYS.includes(key))
              .map(key => `${path}[${index}].${key}: esta versión no conoce la clave y la ignora.`)
          : []
      )
    : [];

export interface ENSAgentsKeyCheck {
  // Perfiles guardados con una clave que no es un id: su valor no se aplica.
  errors: string[];
  // Lo que esta versión no conoce y se ignora.
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

// El tipo, si es de esta versión. Un tipo desconocido (de una versión
// posterior) se trata como ausente.
export const knownSystemType = (value: unknown): ENSSystemType | undefined =>
  typeof value === 'string' && ENS_SYSTEM_TYPES.includes(value as ENSSystemType)
    ? (value as ENSSystemType)
    : undefined;
