/** FROZEN COPY of common/agent-configuration.ts from 1.2.0 (f2e6bd9). Do not edit. */

export type ENSSystemType = 'linux' | 'zimbra-ldap' | 'windows' | 'manager';

export const ENS_SYSTEM_TYPES: ENSSystemType[] = ['linux', 'zimbra-ldap', 'windows', 'manager'];

export const ENS_SYSTEM_TYPE_LABELS: Record<ENSSystemType, string> = {
  linux: 'Linux',
  'zimbra-ldap': 'LDAP (Zimbra)',
  windows: 'Windows',
  manager: 'Manager',
};

export type ENSAgentParameterValue = string | number | boolean | string[];

export interface ENSAgentControlOverrides {
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

export const isNormalisedAgentId = (key: string): boolean =>
  /^\d+$/.test(key) && normalizeAgentId(key) === key;

export const describeNonIdAgentKey = (key: string): string =>
  /^\d+$/.test(key.trim())
    ? `«${key}» no es un id de agente normalizado; usar ${normalizeAgentId(key)}`
    : `«${key}» no es un id de agente; usar el id numérico del agente de Wazuh (p. ej. 001)`;

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
  errors: string[];
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

export const knownSystemType = (value: unknown): ENSSystemType | undefined =>
  typeof value === 'string' && ENS_SYSTEM_TYPES.includes(value as ENSSystemType)
    ? (value as ENSSystemType)
    : undefined;
