import React from 'react';

import { ENSControlFormProps, ParameterRendererFactory } from '.';
import { findOrganizationDataLink } from '../../../../common/ens/configuration/organization/organization-data-items';
import { OrganizationParameterRenderer } from './renderers/organization-parameter-renderer';

export const parameterAnchorId = (controlId: string, parameterId: string, agentId?: string): string =>
  `ens-config-${agentId ? `${agentId}-` : ''}${controlId}-${parameterId}`.replace(/[^A-Za-z0-9_-]/g, '_');

export const ENSControlForm = ({
  parameters,
  values,
  onChange,
  onMatchModeChange,
  level,
}: ENSControlFormProps) => (
  <>
    {parameters.map(parameter => {
      const link = findOrganizationDataLink(parameter.controlId, parameter.id);
      return (
        <div
          key={parameter.id}
          id={parameterAnchorId(parameter.controlId, parameter.id)}
        >
          {link ? (
            <OrganizationParameterRenderer parameter={parameter} value={values[parameter.name]} item={link.item} />
          ) : (
            <ParameterRendererFactory
              parameter={parameter}
              value={values[parameter.name]}
              onChange={onChange}
              onMatchModeChange={onMatchModeChange}
              level={level}
            />
          )}
        </div>
      );
    })}
  </>
);
