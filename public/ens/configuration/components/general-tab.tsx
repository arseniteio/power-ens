import React from 'react';
import { EuiSpacer } from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { GlobalConfigurationPanel } from './global-configuration-panel';
import { OrganizationDataPanel } from './organization-data-panel';
import { EvaluableGroupsPanel } from './evaluable-groups-panel';
import { ControlGroupsPanel } from './control-groups-panel';

interface GeneralTabProps {
  configuration: ENSConfigurationVersion;
  onConfigurationSaved: () => void;
}

export const GeneralTab = ({ configuration, onConfigurationSaved }: GeneralTabProps) => {
  return (
    <>
      <GlobalConfigurationPanel configuration={configuration.global} onConfigurationSaved={onConfigurationSaved} />

      <EuiSpacer size='l' />

      <OrganizationDataPanel configuration={configuration} onConfigurationSaved={onConfigurationSaved} />

      <EuiSpacer size='l' />

      <EvaluableGroupsPanel configuration={configuration} onConfigurationSaved={onConfigurationSaved} />

      <EuiSpacer size='l' />

      <ControlGroupsPanel configuration={configuration} onConfigurationSaved={onConfigurationSaved} />
    </>
  );
};
