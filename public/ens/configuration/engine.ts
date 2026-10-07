import {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSControlParameterValues,
} from './types';

const applyValueToParameter = (
  parameter: ENSControlParameter,
  values: ENSControlParameterValues
): ENSControlParameter => {
  const hasValueByName = Object.prototype.hasOwnProperty.call(
    values,
    parameter.name
  );

  const hasValueById = Object.prototype.hasOwnProperty.call(
    values,
    parameter.id
  );

  if (!hasValueByName && !hasValueById) {
    return parameter;
  }

  return {
    ...parameter,
    value: hasValueByName ? values[parameter.name] : values[parameter.id],
  };
};

export const applyENSControlParameterValues = (
  control: ENSControlConfiguration,
  values: ENSControlParameterValues
): ENSControlConfiguration => ({
  ...control,
  parameters: control.parameters.map(parameter =>
    applyValueToParameter(parameter, values)
  ),
});
