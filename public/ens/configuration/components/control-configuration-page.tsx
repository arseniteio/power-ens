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
import {
  ControlConfigurationReset,
} from './control-configuration-reset';

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

    <EuiSpacer size='l' />

    {/* Abajo del todo y como enlace, no como botón principal: borrar la
        política declarada es lo último que alguien quiere hacer en esta
        pantalla, y ponerlo al lado de «Configurar» invitaría al error. */}
    <ControlConfigurationReset
      control={control}
      onConfigurationSaved={
        onConfigurationSaved
      }
    />
  </EuiPanel>
);
