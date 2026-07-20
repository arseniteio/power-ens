import {
  ENSControlConfiguration,
  ENSControlConfigurationValidation,
  ENSControlParameter,
  ENSLevel,
  ENSParameterStatus,
} from '../types';

const hasValue = (value: ENSControlParameter['value']): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const isNumericParameter = (
  parameter: ENSControlParameter
): boolean =>
  parameter.type === 'number' ||
  parameter.type === 'duration_hours' ||
  parameter.type === 'duration_days';

const getParameterCandidateValue = (
  parameter: ENSControlParameter
): ENSControlParameter['value'] => {
  if (hasValue(parameter.value)) {
    return parameter.value;
  }

  if (
    !parameter.required &&
    hasValue(parameter.defaultValue)
  ) {
    return parameter.defaultValue;
  }

  return undefined;
};

const isNumericParameterValueValid = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): boolean => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return false;
  }

  if (
    parameter.minValue !== undefined &&
    value < parameter.minValue
  ) {
    return false;
  }

  if (
    parameter.maxValue !== undefined &&
    value > parameter.maxValue
  ) {
    return false;
  }

  return true;
};

export const getParameterStatus = (
  parameter: ENSControlParameter,
  activeLevel: ENSLevel
): ENSParameterStatus => {
  if (!parameter.levels.includes(activeLevel)) {
    return 'NOT_APPLICABLE';
  }

  const candidateValue =
    getParameterCandidateValue(parameter);

  if (!hasValue(candidateValue)) {
    return 'NOT_CONFIGURED';
  }

  if (
    isNumericParameter(parameter) &&
    !isNumericParameterValueValid(
      parameter,
      candidateValue
    )
  ) {
    return 'INVALID';
  }

  return 'CONFIGURED';
};

export const validateControlConfiguration = (
  control: ENSControlConfiguration,
  activeLevel: ENSLevel
): ENSControlConfigurationValidation => {

  const parameters = control.parameters.map(parameter => ({
    ...parameter,
    status: getParameterStatus(parameter, activeLevel),
  }));

  const requiredForLevel = parameters.filter(
    parameter =>
      parameter.required &&
      parameter.levels.includes(activeLevel)
  );

  const missingRequired = requiredForLevel.filter(
    parameter => parameter.status === 'NOT_CONFIGURED'
  );

  const invalidParameters = parameters.filter(
    parameter => parameter.status === 'INVALID'
  );

  return {
    controlId: control.controlId,
    controlName: control.controlName,
    activeLevel,
    totalParameters: parameters.length,
    configured: parameters.filter(p => p.status === 'CONFIGURED').length,
    notConfigured: parameters.filter(p => p.status === 'NOT_CONFIGURED').length,
    notApplicable: parameters.filter(p => p.status === 'NOT_APPLICABLE').length,
    invalid: invalidParameters.length,
    missingRequired,
    invalidParameters,
    status: invalidParameters.length > 0
      ? 'INVALID'
      : missingRequired.length === 0
      ? 'CONFIGURED'
      : 'INCOMPLETE',
    parameters,
  };
};

export type ENSControlConfigurationStateStatus =
  | 'NOT_CONFIGURED'
  | 'INCOMPLETE'
  | 'INVALID'
  | 'CONFIGURED';

export interface ENSControlConfigurationState {
  status: ENSControlConfigurationStateStatus;
  validation: ENSControlConfigurationValidation;
}

export const resolveControlConfigurationState = (
  control: ENSControlConfiguration,
  activeLevel: ENSLevel
): ENSControlConfigurationState => {
  const validation =
    validateControlConfiguration(
      control,
      activeLevel
    );

  if (validation.status === 'INVALID') {
    return {
      status: 'INVALID',
      validation,
    };
  }

  const hasExplicitApplicableValue =
    validation.parameters.some(
      parameter =>
        parameter.status !==
          'NOT_APPLICABLE' &&
        hasValue(parameter.value)
    );

  if (!hasExplicitApplicableValue) {
    return {
      status: 'NOT_CONFIGURED',
      validation,
    };
  }

  return {
    status: validation.status,
    validation,
  };
};
