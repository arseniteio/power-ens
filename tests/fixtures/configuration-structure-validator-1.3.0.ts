/** FROZEN COPY of the 1.3.0 structure validator (e5c4cf0), only the import paths changed. */
import {
  ENSConfigurationLifecycleStatus,
  ENSConfigurationScopeMode,
  ENSConfigurationVersion,
  ENSLevel,
  ENSParameterColumnType,
  ENSParameterStatus,
  ENSParameterType,
} from '../../common/ens/configuration/types';
import { ENS_MATCH_MODES, validateAgentsConfigurationShape, validateCustomTemplatesShape } from './agent-configuration-1.3.0';

type UnknownRecord = Record<string, unknown>;

export interface ENSConfigurationStructureValidation {
  valid: boolean;
  errors: string[];
}

const ENS_LEVELS: ENSLevel[] = [
  'BAJO',
  'MEDIO',
  'ALTO',
];

const LIFECYCLE_STATUSES: ENSConfigurationLifecycleStatus[] = [
  'DRAFT',
  'CONFIGURED',
  'INCOMPLETE',
  'INVALID',
  'ACTIVE',
  'ARCHIVED',
];

const SCOPE_MODES: ENSConfigurationScopeMode[] = [
  'global',
  'agent',
  'group',
];

const PARAMETER_TYPES: ENSParameterType[] = [
  'string',
  'number',
  'boolean',
  'select',
  'list',
  'path',
  'url',
  'duration_hours',
  'duration_days',
  'table',
];

const PARAMETER_COLUMN_TYPES: ENSParameterColumnType[] = [
  'string',
  'identifier',
  'path',
  'octal',
  'number',
  'date',
  'select',
  'multiselect',
];

const PARAMETER_STATUSES: ENSParameterStatus[] = [
  'CONFIGURED',
  'NOT_CONFIGURED',
  'NOT_APPLICABLE',
  'INVALID',
];

const AUDIT_ACTIONS = [
  'CREATED',
  'UPDATED',
  'VALIDATED',
  'RESET',
];

const isRecord = (
  value: unknown
): value is UnknownRecord =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value);

const isString = (
  value: unknown
): value is string =>
  typeof value === 'string';

const isStringArray = (
  value: unknown
): value is string[] =>
  Array.isArray(value) &&
  value.every(isString);

const isFiniteNumber = (
  value: unknown
): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value);

const isAllowedString = <T extends string>(
  value: unknown,
  allowedValues: T[]
): value is T =>
  typeof value === 'string' &&
  allowedValues.includes(value as T);

const isParameterValue = (
  value: unknown
): boolean =>
  value === undefined ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  isStringArray(value);

const validateRequiredStrings = (
  value: UnknownRecord,
  fields: string[],
  path: string,
  errors: string[]
): void => {
  fields.forEach(field => {
    if (!isString(value[field])) {
      errors.push(`${path}.${field} must be a string.`);
    }
  });
};

// `columns` is checked for shape only; whether a cell is valid for its column is decided by
// `parameter-value-validator`. This validator THROWS on hydration, and a badly filled table must degrade its
// control, not the whole Configuration screen.
const validateParameterColumns = (
  value: unknown,
  path: string,
  errors: string[]
): void => {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    errors.push(`${path}.columns must be an array.`);
    return;
  }

  value.forEach((column, index) => {
    const columnPath = `${path}.columns[${index}]`;

    if (!isRecord(column)) {
      errors.push(`${columnPath} must be an object.`);
      return;
    }

    validateRequiredStrings(
      column,
      ['name', 'label'],
      columnPath,
      errors
    );

    if (
      !isAllowedString(
        column.type,
        PARAMETER_COLUMN_TYPES
      )
    ) {
      errors.push(`${columnPath}.type is invalid.`);
    }

    if (typeof column.required !== 'boolean') {
      errors.push(`${columnPath}.required must be a boolean.`);
    }

    if (
      column.options !== undefined &&
      !isStringArray(column.options)
    ) {
      errors.push(`${columnPath}.options must be a string array.`);
    }
  });
};

const validateParameter = (
  value: unknown,
  path: string,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  validateRequiredStrings(
    value,
    [
      'id',
      'controlId',
      'name',
      'label',
      'description',
      'wazuhUsage',
      'powerEnsUsage',
      'ifNotConfigured',
    ],
    path,
    errors
  );

  if (
    value.example !== undefined &&
    !isString(value.example)
  ) {
    errors.push(`${path}.example must be a string.`);
  }

  // `options` is checked for shape only; whether the value is one of them is decided by
  // `parameter-value-validator.ts` (this validator throws on hydration).
  if (
    value.options !== undefined &&
    !isStringArray(value.options)
  ) {
    errors.push(`${path}.options must be a string array.`);
  }

  validateParameterColumns(
    value.columns,
    path,
    errors
  );

  if (
    !Array.isArray(value.levels) ||
    !value.levels.every(level =>
      isAllowedString(level, ENS_LEVELS)
    )
  ) {
    errors.push(`${path}.levels contains an invalid ENS level.`);
  }

  if (!isStringArray(value.requirements)) {
    errors.push(`${path}.requirements must be a string array.`);
  }

  if (!isAllowedString(value.type, PARAMETER_TYPES)) {
    errors.push(`${path}.type is invalid.`);
  }

  if (typeof value.required !== 'boolean') {
    errors.push(`${path}.required must be a boolean.`);
  }

  if (value.matchMode !== undefined && !isAllowedString(value.matchMode, ENS_MATCH_MODES)) {
    errors.push(`${path}.matchMode is invalid.`);
  }

  if (
    value.minValue !== undefined &&
    !isFiniteNumber(value.minValue)
  ) {
    errors.push(`${path}.minValue must be a finite number.`);
  }

  if (
    value.maxValue !== undefined &&
    !isFiniteNumber(value.maxValue)
  ) {
    errors.push(`${path}.maxValue must be a finite number.`);
  }

  if (
    isFiniteNumber(value.minValue) &&
    isFiniteNumber(value.maxValue) &&
    value.minValue > value.maxValue
  ) {
    errors.push(`${path}.minValue cannot be greater than maxValue.`);
  }

  if (!isParameterValue(value.defaultValue)) {
    errors.push(`${path}.defaultValue has an invalid value.`);
  }

  if (!isParameterValue(value.value)) {
    errors.push(`${path}.value has an invalid value.`);
  }

  if (!isStringArray(value.evidenceIds)) {
    errors.push(`${path}.evidenceIds must be a string array.`);
  }

  if (!isStringArray(value.ruleIds)) {
    errors.push(`${path}.ruleIds must be a string array.`);
  }

  if (
    value.status !== undefined &&
    !isAllowedString(value.status, PARAMETER_STATUSES)
  ) {
    errors.push(`${path}.status is invalid.`);
  }
};

const validateControl = (
  value: unknown,
  path: string,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  validateRequiredStrings(
    value,
    [
      'controlId',
      'controlName',
      'family',
    ],
    path,
    errors
  );

  if (typeof value.enabled !== 'boolean') {
    errors.push(`${path}.enabled must be a boolean.`);
  }

  if (
    !Array.isArray(value.applicableLevels) ||
    !value.applicableLevels.every(level =>
      isAllowedString(level, ENS_LEVELS)
    )
  ) {
    errors.push(
      `${path}.applicableLevels contains an invalid ENS level.`,
    );
  }

  if (!Array.isArray(value.parameters)) {
    errors.push(`${path}.parameters must be an array.`);
    return;
  }

  value.parameters.forEach((parameter, index) => {
    validateParameter(
      parameter,
      `${path}.parameters[${index}]`,
      errors
    );
  });
};

const validateGlobalConfiguration = (
  value: unknown,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push('configuration.global must be an object.');
    return;
  }

  validateRequiredStrings(
    value,
    [
      'clientName',
      'organization',
      'ensVersion',
      'scope',
      'evaluationPeriod',
      'timezone',
      'activePolicy',
    ],
    'configuration.global',
    errors
  );

  if (!isAllowedString(value.ensLevel, ENS_LEVELS)) {
    errors.push('configuration.global.ensLevel is invalid.');
  }

  // Optional: an absent key is valid (`ensLevel` is used). If present it must be a level; `null` is not.
  if (
    'traceabilityLevel' in value &&
    !isAllowedString(value.traceabilityLevel, ENS_LEVELS)
  ) {
    errors.push('configuration.global.traceabilityLevel is invalid.');
  }

  // The Availability level, same contract: absent or a level.
  if (
    'availabilityLevel' in value &&
    !isAllowedString(value.availabilityLevel, ENS_LEVELS)
  ) {
    errors.push('configuration.global.availabilityLevel is invalid.');
  }

  if (
    value.reportLanguage !== 'es' &&
    value.reportLanguage !== 'en'
  ) {
    errors.push(
      'configuration.global.reportLanguage is invalid.',
    );
  }
};

const validateScope = (
  value: unknown,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push('configuration.scope must be an object.');
    return;
  }

  if (!isAllowedString(value.mode, SCOPE_MODES)) {
    errors.push('configuration.scope.mode is invalid.');
  }

  if (!isStringArray(value.agentIds)) {
    errors.push(
      'configuration.scope.agentIds must be a string array.',
    );
  }

  if (!isStringArray(value.groupIds)) {
    errors.push(
      'configuration.scope.groupIds must be a string array.',
    );
  }
};

const validateAuditEntry = (
  value: unknown,
  path: string,
  errors: string[]
): void => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }

  if (!isAllowedString(value.action, AUDIT_ACTIONS)) {
    errors.push(`${path}.action is invalid.`);
  }

  validateRequiredStrings(
    value,
    [
      'user',
      'date',
      'summary',
    ],
    path,
    errors
  );
};

export const validateENSConfigurationStructure = (
  value: unknown
): ENSConfigurationStructureValidation => {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: [
        'configuration must be an object.',
      ],
    };
  }

  validateRequiredStrings(
    value,
    [
      'id',
      'clientId',
      'version',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'changeReason',
    ],
    'configuration',
    errors
  );

  if (
    !isAllowedString(
      value.status,
      LIFECYCLE_STATUSES
    )
  ) {
    errors.push('configuration.status is invalid.');
  }

  validateGlobalConfiguration(
    value.global,
    errors
  );

  validateScope(
    value.scope,
    errors
  );

  if (!Array.isArray(value.controls)) {
    errors.push('configuration.controls must be an array.');
  } else {
    value.controls.forEach((control, index) => {
      validateControl(
        control,
        `configuration.controls[${index}]`,
        errors
      );
    });
  }

  // Per-system layer (1.2.0): optional; if present, shape-checked. Existence of controls and parameters and
  // value validity are judged in `agents/agent-configuration-validator.ts`: a bad value in an agent degrades
  // that machine's row, not the whole environment.
  errors.push(...validateAgentsConfigurationShape(value.agents));
  errors.push(...validateCustomTemplatesShape(value.templates));

  if (!Array.isArray(value.auditTrail)) {
    errors.push('configuration.auditTrail must be an array.');
  } else {
    value.auditTrail.forEach((entry, index) => {
      validateAuditEntry(
        entry,
        `configuration.auditTrail[${index}]`,
        errors
      );
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const isENSConfigurationVersion = (
  value: unknown
): value is ENSConfigurationVersion =>
  validateENSConfigurationStructure(value).valid;

export const assertENSConfigurationVersion = (
  value: unknown
): ENSConfigurationVersion => {
  const validation =
    validateENSConfigurationStructure(value);

  if (!validation.valid) {
    throw new Error(
      [
        'Invalid ENS configuration structure:',
        ...validation.errors,
      ].join(' ')
    );
  }

  return value as ENSConfigurationVersion;
};
