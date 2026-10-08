import { ENSControlParameter, ENSControlParameterValues } from '../types';

export interface ENSFormFieldProps {
  parameter: ENSControlParameter;
  value?: ENSControlParameter['value'];
  onChange: (parameterName: string, value: ENSControlParameter['value']) => void;
}

export interface ENSControlFormProps {
  parameters: ENSControlParameter[];
  values: ENSControlParameterValues;
  onChange: (parameterName: string, value: ENSControlParameter['value']) => void;
}
