import React from 'react';
import { EuiFormRow, EuiLink, EuiText } from '@elastic/eui';

import type { ENSControlParameter } from '../../../../../common/ens/configuration/types';
import type {
  ENSOrganizationDataItem,
} from '../../../../../common/ens/configuration/organization/organization-data-items';
import { organizationValueLines } from '../../../../../common/ens/configuration/organization/organization-data-form';
import { useSetRouterSearch } from '../../../../routing/use-router-search';
import { configurationSearchChanges } from '../../../../routing/configuration-link';

interface OrganizationParameterRendererProps {
  parameter: ENSControlParameter;
  value?: ENSControlParameter['value'];
  item: ENSOrganizationDataItem;
}

// A parameter that is organisation data: read-only here, with the way to where it is edited.
export const OrganizationParameterRenderer = ({ parameter, value, item }: OrganizationParameterRendererProps) => {
  const setSearch = useSetRouterSearch();
  const lines = organizationValueLines(value);
  return (
    <EuiFormRow label={`${parameter.id} · ${parameter.label}`} helpText={parameter.description} fullWidth>
      <EuiText size='s'>
        {lines.length ? (
          <ul>
            {lines.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p>Sin valor</p>
        )}
        <p>
          {'Se edita en Datos de la organización. '}
          <EuiLink onClick={() => setSearch(configurationSearchChanges({ view: 'general', itemId: item.id }))}>
            {`Ir a «${item.label}»`}
          </EuiLink>
        </p>
      </EuiText>
    </EuiFormRow>
  );
};
