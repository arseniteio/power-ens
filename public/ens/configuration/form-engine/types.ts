import {
  ENSControlParameter,
  ENSControlParameterValues,
  ENSLevel,
  ENSMatchMode,
} from '../../../../common/ens/configuration/types';

export interface ENSFormFieldProps {
  parameter: ENSControlParameter;
  value?: ENSControlParameter['value'];
  onChange: (parameterName: string, value: ENSControlParameter['value']) => void;
  onMatchModeChange?: (parameterName: string, mode: ENSMatchMode) => void;
  level?: ENSLevel;
}

export interface ENSControlFormProps {
  parameters: ENSControlParameter[];
  values: ENSControlParameterValues;
  onChange: (parameterName: string, value: ENSControlParameter['value']) => void;
  onMatchModeChange?: (parameterName: string, mode: ENSMatchMode) => void;
  level?: ENSLevel;
}
