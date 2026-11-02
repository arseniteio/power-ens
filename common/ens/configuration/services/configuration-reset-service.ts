import type { ENSControlConfiguration, ENSControlParameter } from '../types';
import { isOrganizationDataParameter } from '../organization/organization-data-items';

interface ENSConfigurationResetSummary {
  controlId: string;
  clearedParameters: number;
  parameterIds: string[];
}

const isShared = (
  control: ENSControlConfiguration,
  parameter: ENSControlParameter
): boolean => isOrganizationDataParameter(control.controlId, parameter.id);

const hasValue = (
  parameter: ENSControlParameter
): boolean => {
  const value = parameter.value;

  if (value === undefined || value === null) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
};

export const summarizeControlConfigurationReset = (
  control: ENSControlConfiguration
): ENSConfigurationResetSummary => {
  const withValue = control.parameters.filter(parameter => hasValue(parameter) && !isShared(control, parameter));

  return {
    controlId: control.controlId,
    clearedParameters: withValue.length,
    parameterIds: withValue.map(parameter => parameter.id),
  };
};

export const buildClearedControlConfiguration = (
  control: ENSControlConfiguration,
  confirmedControlId: string
): ENSControlConfiguration => {
  if (confirmedControlId.trim() !== control.controlId) {
    throw new Error(
      `Borrado cancelado: se pidió confirmar «${control.controlId}» y llegó «${confirmedControlId.trim()}».`
    );
  }

  return {
    ...control,
    parameters: control.parameters.map(parameter => {
      if (isShared(control, parameter)) {
        return parameter;
      }

      const cleared = { ...parameter };

      delete cleared.value;
      delete cleared.matchMode;
      delete cleared.status;

      return cleared;
    }),
  };
};
