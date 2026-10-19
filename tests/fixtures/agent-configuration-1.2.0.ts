// FROZEN COPY of common/agent-configuration.ts from 1.2.0 (f2e6bd9). Do not edit.

// Configuración por sistema (1.2.0): la capa `configuration.agents` del
// documento `active` de wazuh-ens-configuration.
//
// Vive en `common/` porque la leen el navegador (pantalla y motor) y el
// servidor (el guardado la conserva y la valida). Solo tipos y funciones puras.
//
// FORMA DEL DOCUMENTO. Solo se AÑADE una clave de primer nivel:
//
//   configuration.controls[].parameters[].value   ← sigue siendo el valor de la
//                                                    ORGANIZACIÓN (el que leen
//                                                    un plugin 1.1.0, el chatbot
//                                                    y los scripts)
//   configuration.agents = {                       ← NUEVO
//     "<id del agente normalizado>": {
//       name, aliases[],                  identidad cuando se guardó
//       detectedType, detectedBy,         tipo detectado y de dónde salió
//       typeOverride,                     tipo corregido a mano
//       templates[],                      plantillas aplicadas, en orden
//       controls: { "<control>": { parameters: { "<P-xx>": valor } } }
//     }
//   }
//
// Por qué una clave aparte y no dentro del parámetro: el validador estructural
// solo admite escalares y listas de texto en `value` (un objeto tumbaría el
// entorno ENS entero), e `inject-control.py` sustituye el objeto parámetro y
// solo conserva `value`, así que cualquier dato por agente guardado dentro del
// parámetro se perdería al resembrar. Una clave de primer nivel sobrevive a los
// dos scripts, que escriben el `_source` entero tras editar solo `controls`.

export type ENSSystemType = 'linux' | 'zimbra-ldap' | 'windows' | 'manager';

export const ENS_SYSTEM_TYPES: ENSSystemType[] = ['linux', 'zimbra-ldap', 'windows', 'manager'];

export const ENS_SYSTEM_TYPE_LABELS: Record<ENSSystemType, string> = {
  linux: 'Linux',
  'zimbra-ldap': 'LDAP (Zimbra)',
  windows: 'Windows',
  manager: 'Manager',
};

// El mismo contrato que `value`: un escalar o una lista de texto. Nunca `null`:
// quitar el valor propio de un agente es BORRAR la clave.
export type ENSAgentParameterValue = string | number | boolean | string[];

export interface ENSAgentControlOverrides {
  // Opcional: una versión posterior puede guardar otras claves en el control
  // (`assigned`, por ejemplo) sin valores propios.
  parameters?: Record<string, ENSAgentParameterValue>;
}

export interface ENSAgentProfile {
  name?: string;
  aliases?: string[];
  detectedType?: ENSSystemType;
  detectedBy?: string;
  typeOverride?: ENSSystemType;
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
const CONTROL_KEYS = ['parameters'];

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
