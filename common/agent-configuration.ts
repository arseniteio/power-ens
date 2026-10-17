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
  parameters: Record<string, ENSAgentParameterValue>;
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

/**
 * Comprueba la FORMA de `configuration.agents`, igual que el validador
 * estructural comprueba la del resto del documento: la clave ausente es válida;
 * presente, cada perfil tiene que tener los tipos de arriba.
 *
 * No juzga si un control o un parámetro existen, ni si un valor significa algo
 * para su columna: eso lo hace `validateAgentsConfiguration` (pantalla, scripts)
 * y, en la evaluación, la validación del control de cada máquina, que degrada
 * esa fila y no el entorno entero.
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

    if (!agentId.trim() || normalizeAgentId(agentId) !== agentId) {
      errors.push(`${at}: the key must be the normalised agent id (${normalizeAgentId(agentId) || 'empty'}).`);
    }

    if (!isRecord(profile)) {
      errors.push(`${at} must be an object.`);
      return;
    }

    Object.keys(profile).forEach(key => {
      if (!PROFILE_KEYS.includes(key)) {
        errors.push(`${at}.${key} is not a known key (${PROFILE_KEYS.join(', ')}).`);
      }
    });

    if (profile.name !== undefined && typeof profile.name !== 'string') {
      errors.push(`${at}.name must be a string.`);
    }

    if (profile.aliases !== undefined && !isStringArray(profile.aliases)) {
      errors.push(`${at}.aliases must be a string array.`);
    }

    if (profile.detectedBy !== undefined && typeof profile.detectedBy !== 'string') {
      errors.push(`${at}.detectedBy must be a string.`);
    }

    (['detectedType', 'typeOverride'] as const).forEach(key => {
      if (profile[key] !== undefined && !ENS_SYSTEM_TYPES.includes(profile[key] as ENSSystemType)) {
        errors.push(`${at}.${key} must be one of ${ENS_SYSTEM_TYPES.join(', ')}.`);
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

      if (!isRecord(control) || !isRecord(control.parameters)) {
        errors.push(`${cat} must be an object with a "parameters" object.`);
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
