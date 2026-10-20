import { ENSControlParameter, ENSControlParameterValues, ENSLevel, ENSMatchMode } from '../../../../common/ens/configuration/types';

export interface ENSFormFieldProps {
  parameter: ENSControlParameter;
  value?: ENSControlParameter['value'];
  onChange: (parameterName: string, value: ENSControlParameter['value']) => void;
  // Without it, a parameter in regex mode is shown with its mode read-only.
  onMatchModeChange?: (parameterName: string, mode: ENSMatchMode) => void;
  // The level the control is edited for: a select with `optionsByLevel` offers only what that level admits.
  // Without it, the level of the active configuration.
  level?: ENSLevel;
}

export interface ENSControlFormProps {
  parameters: ENSControlParameter[];
  values: ENSControlParameterValues;
  onChange: (parameterName: string, value: ENSControlParameter['value']) => void;
  onMatchModeChange?: (parameterName: string, mode: ENSMatchMode) => void;
  level?: ENSLevel;
}
