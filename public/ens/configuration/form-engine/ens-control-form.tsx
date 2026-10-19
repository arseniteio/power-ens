import React from 'react';

import {
  ENSControlFormProps,
  ParameterRendererFactory,
} from '.';

// Anchor of a parameter on the screen, to open it from the URL (`configParam`).
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
