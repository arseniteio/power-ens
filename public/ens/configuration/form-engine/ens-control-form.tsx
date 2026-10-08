import React from 'react';

import {
  ENSControlFormProps,
  ParameterRendererFactory,
} from '.';

export const ENSControlForm = ({
  parameters,
  values,
  onChange,
}: ENSControlFormProps) => (
  <>
    {parameters.map(parameter => (
      <ParameterRendererFactory
        key={parameter.id}
        parameter={parameter}
        value={values[parameter.name]}
        onChange={onChange}
      />
    ))}
  </>
);
