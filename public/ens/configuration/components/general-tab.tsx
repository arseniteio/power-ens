import React from 'react';
import {
  EuiDescriptionList,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { GlobalConfigurationPanel } from './global-configuration-panel';
import { OrganizationDataPanel } from './organization-data-panel';
import { scopeModeLabel } from './labels';

interface GeneralTabProps {
  configuration: ENSConfigurationVersion;
  onConfigurationSaved: () => void;
}

// The scope is read-only here: only the initial setup changes which agents are evaluated.
export const GeneralTab = ({ configuration, onConfigurationSaved }: GeneralTabProps) => {
  const scope = configuration.scope;
  return (
    <>
      <GlobalConfigurationPanel configuration={configuration.global} onConfigurationSaved={onConfigurationSaved} />

      <EuiSpacer size='l' />

      <OrganizationDataPanel configuration={configuration} onConfigurationSaved={onConfigurationSaved} />

      <EuiSpacer size='l' />

      <EuiPanel paddingSize='m' color='subdued'>
        <EuiTitle size='s'>
          <h3>Alcance ENS</h3>
        </EuiTitle>
        <EuiText size='s' color='subdued'>
          <p>Solo lectura: se define en la configuración inicial.</p>
        </EuiText>
        <EuiSpacer size='s' />
        <EuiDescriptionList
          compressed
          listItems={[
            { title: 'Agentes evaluados', description: scopeModeLabel(scope.mode) },
            ...(scope.mode === 'group' ? [{ title: 'Grupos', description: scope.groupIds.join(', ') || '—' }] : []),
            ...(scope.mode === 'agent' ? [{ title: 'Agentes', description: scope.agentIds.join(', ') || '—' }] : []),
          ]}
        />
      </EuiPanel>
    </>
  );
};
