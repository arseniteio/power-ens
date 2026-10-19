import React from 'react';

import {
  ENSControlFormProps,
  ParameterRendererFactory,
} from '.';

// El ancla de un parámetro en la pantalla, para abrirlo desde la URL
// (`configParam`).
export const parameterAnchorId = (controlId: string, parameterId: string, agentId?: string): string =>
  `ens-config-${agentId ? `${agentId}-` : ''}${controlId}-${parameterId}`.replace(/[^A-Za-z0-9_-]/g, '_');

export const ENSControlForm = ({
  parameters,
  values,
  onChange,
  onMatchModeChange,
}: ENSControlFormProps) => (
  <>
    {parameters.map(parameter => (
      <div
        key={parameter.id}
        id={parameterAnchorId(parameter.controlId, parameter.id)}
      >
        <ParameterRendererFactory
          parameter={parameter}
          value={values[parameter.name]}
          onChange={onChange}
          onMatchModeChange={onMatchModeChange}
        />
      </div>
    ))}
  </>
);
