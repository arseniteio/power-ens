import {
  ENSControlConfiguration,
  ENSControlConfigurationValidation,
  ENSControlParameter,
  ENSControlParameterValues,
  ENSLevel,
  ENSParameterStatus,
  ENSParameterValueIssue,
  ENSParameterValueVerdict,
} from '../types';
import {
  isEmptyParameterValue,
  validateParameterValue,
} from './parameter-value-validator';

const hasValue = (value: ENSControlParameter['value']): boolean =>
  !isEmptyParameterValue(value);

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

/** Verdict of a parameter for the active level, with the reason if invalid. "Configured" means configured with a value valid for its type. */
export const getParameterVerdict = (
  parameter: ENSControlParameter,
  activeLevel: ENSLevel
): {
  status: ENSParameterStatus;
  verdict: ENSParameterValueVerdict;
} => {
  if (!parameter.levels.includes(activeLevel)) {
    return {
      status: 'NOT_APPLICABLE',
      verdict: { valid: true },
    };
  }

  const candidateValue =
    getParameterCandidateValue(parameter);

  if (!hasValue(candidateValue)) {
    return {
      status: 'NOT_CONFIGURED',
      verdict: { valid: true },
    };
  }

  const verdict = validateParameterValue(
    parameter,
    candidateValue
  );

  return {
    status: verdict.valid
      ? 'CONFIGURED'
      : 'INVALID',
    verdict,
  };
};

export const getParameterStatus = (
  parameter: ENSControlParameter,
  activeLevel: ENSLevel
): ENSParameterStatus =>
  getParameterVerdict(parameter, activeLevel)
    .status;

export const validateControlConfiguration = (
  control: ENSControlConfiguration,
  activeLevel: ENSLevel
): ENSControlConfigurationValidation => {

  const issues: ENSParameterValueIssue[] = [];

  const parameters = control.parameters.map(parameter => {
    const { status, verdict } =
      getParameterVerdict(parameter, activeLevel);

    if (!verdict.valid) {
      issues.push({
        parameterId: parameter.id,
        parameterName: parameter.name,
        label: parameter.label,
        required: parameter.required,
        reason:
          verdict.reason ||
          'el valor no es válido para su tipo',
      });
    }

    return {
      ...parameter,
      status,
    };
  });

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

  // `INVALID` implies applicable at the active level: `getParameterVerdict` returns `NOT_APPLICABLE` first.
  const invalidRequired = invalidParameters.filter(
    parameter => parameter.required
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
    invalidRequired,
    issues,
    status: invalidParameters.length > 0
      ? 'INVALID'
      : missingRequired.length === 0
      ? 'CONFIGURED'
      : 'INCOMPLETE',
    parameters,
  };
};

/** Invalidity reasons of a not yet persisted set of values, used by the form before saving. Ignores levels (the whole control is being edited) and does not judge absences. */
export const validateControlParameterValues = (
  control: ENSControlConfiguration,
  values: ENSControlParameterValues
): ENSParameterValueIssue[] =>
  control.parameters.reduce<ENSParameterValueIssue[]>(
    (result, parameter) => {
      const value = Object.prototype.hasOwnProperty.call(
        values,
        parameter.name
      )
        ? values[parameter.name]
        : parameter.value;

      const verdict = validateParameterValue(
        parameter,
        value
      );

      if (verdict.valid) {
        return result;
      }

      return [
        ...result,
        {
          parameterId: parameter.id,
          parameterName: parameter.name,
          label: parameter.label,
          required: parameter.required,
          reason:
            verdict.reason ||
            'el valor no es válido para su tipo',
        },
      ];
    },
    []
  );

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
