import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import {
  ENSControlConfigurationStateStatus,
  resolveControlConfigurationState,
} from '../services';
import {
  ENSControlConfiguration,
  ENSLevel,
} from '../types';

interface ControlCardProps {
  control: ENSControlConfiguration;
  activeLevel: ENSLevel;
  isSelected: boolean;
  onOpen: (
    controlId: string
  ) => void;
}

const getConfigurationStateLabel = (
  status:
    ENSControlConfigurationStateStatus
): string => {
  if (status === 'CONFIGURED') {
    return 'Configurado';
  }

  if (status === 'INCOMPLETE') {
    return 'Configuración incompleta';
  }

  return 'Sin configurar';
};

const getConfigurationStateColor = (
  status:
    ENSControlConfigurationStateStatus
): 'success' | 'danger' | 'warning' => {
  if (status === 'CONFIGURED') {
    return 'success';
  }

  if (status === 'INCOMPLETE') {
    return 'danger';
  }

  return 'warning';
};

export const ControlCard = ({
  control,
  activeLevel,
  isSelected,
  onOpen,
}: ControlCardProps) => {
  const configurationState =
    resolveControlConfigurationState(
      control,
      activeLevel
    );

  return (
    <EuiPanel
      paddingSize='m'
      color={
        isSelected
          ? 'primary'
          : 'plain'
      }
    >
      <EuiTitle size='xs'>
        <h3>{control.controlId}</h3>
      </EuiTitle>

      <EuiText size='s'>
        <p>{control.controlName}</p>
      </EuiText>

      <EuiBadge
        color={
          control.enabled
            ? 'hollow'
            : 'default'
        }
      >
        {control.enabled
          ? 'Disponible'
          : 'No disponible'}
      </EuiBadge>

      <EuiSpacer size='s' />

      <EuiBadge
        color={getConfigurationStateColor(
          configurationState.status
        )}
      >
        {getConfigurationStateLabel(
          configurationState.status
        )}
      </EuiBadge>

      <EuiSpacer size='m' />

      <EuiButton
        size='s'
        fill={isSelected}
        onClick={() =>
          onOpen(control.controlId)
        }
      >
        Abrir
      </EuiButton>
    </EuiPanel>
  );
};
