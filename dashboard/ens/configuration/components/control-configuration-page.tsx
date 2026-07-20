import React from 'react';
import {
  EuiButton,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import {
  ENSControlConfiguration,
  ENSLevel,
} from '../types';
import {
  ControlConfigurationResolver,
} from './control-configuration-resolver';

interface ControlConfigurationPageProps {
  control: ENSControlConfiguration;
  activeLevel: ENSLevel;
  onBack: () => void;
  onConfigurationSaved: () => void;
}

export const ControlConfigurationPage = ({
  control,
  activeLevel,
  onBack,
  onConfigurationSaved,
}: ControlConfigurationPageProps) => (
  <EuiPanel paddingSize='l'>
    <EuiButton
      size='s'
      onClick={onBack}
    >
      Volver a controles
    </EuiButton>

    <EuiSpacer size='m' />

    <EuiTitle size='m'>
      <h2>
        {control.controlId} ·{' '}
        {control.controlName}
      </h2>
    </EuiTitle>

    <EuiText color='subdued'>
      <p>{control.family}</p>
    </EuiText>

    <EuiSpacer size='m' />

    <ControlConfigurationResolver
      control={control}
      activeLevel={activeLevel}
      onConfigurationSaved={
        onConfigurationSaved
      }
    />
  </EuiPanel>
);
