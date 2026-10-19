// Deletes the declared configuration of a control.
// Only the values are deleted, not the control: saving from the UI rejects a control absent from the index, so
// removing the block would leave it impossible to reconfigure without reseeding with `inject-control.py`.
// Destructive on client data, so the safe default applies: the caller must pass the `controlId` to delete, and
// the screen asks to type it.
// `value` and its match mode are deleted; `defaultValue` stays (part of the parameter definition).
// Types from the file, never from a high-level barrel.
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../types';

export interface ENSConfigurationResetSummary {
  controlId: string;
  // Number of parameters that had a value before deleting.
  clearedParameters: number;
  parameterIds: string[];
}

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

  // `false` and `0` are declared values.
  return true;
};

// What would be deleted, without deleting.
export const summarizeControlConfigurationReset = (
  control: ENSControlConfiguration
): ENSConfigurationResetSummary => {
  const withValue = control.parameters.filter(hasValue);

  return {
    controlId: control.controlId,
    clearedParameters: withValue.length,
    parameterIds: withValue.map(parameter => parameter.id),
  };
};

// Returns the control with the values deleted. Does not persist: `updateActiveControlConfiguration` does, and
// validates against the server. Kept separate so it can be tested without `kibana-services`.
export const buildClearedControlConfiguration = (
  control: ENSControlConfiguration,
  confirmedControlId: string
): ENSControlConfiguration => {
  // Guard against calling this by accident.
  if (confirmedControlId.trim() !== control.controlId) {
    throw new Error(
      `Borrado cancelado: se pidió confirmar «${control.controlId}» y llegó «${confirmedControlId.trim()}».`
    );
  }

  return {
    ...control,
    parameters: control.parameters.map(parameter => {
      const cleared = { ...parameter };

      delete cleared.value;
      delete cleared.matchMode;
      // `status` is derived and the HTTP client strips it on persist; cleared here so the result equals what
      // will be saved.
      delete cleared.status;

      return cleared;
    }),
  };
};
