import { ENSControlParameter, ENSControlParameterValues, ENSMatchMode } from '../../../../common/ens/configuration/types';

export interface ENSFormFieldProps {
  parameter: ENSControlParameter;
  value?: ENSControlParameter['value'];
  onChange: (parameterName: string, value: ENSControlParameter['value']) => void;
  // Without it, a parameter in regex mode is shown with its mode read-only.
  onMatchModeChange?: (parameterName: string, mode: ENSMatchMode) => void;
}

export interface ENSControlFormProps {
  parameters: ENSControlParameter[];
  values: ENSControlParameterValues;
  onChange: (parameterName: string, value: ENSControlParameter['value']) => void;
  onMatchModeChange?: (parameterName: string, mode: ENSMatchMode) => void;
}
