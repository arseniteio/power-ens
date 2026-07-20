import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import {
  ENSControlConfigurationState,
  ENSControlConfigurationStateStatus,
  resolveControlConfigurationState,
} from '../services';
import {
  ENSControlConfiguration,
  ENSLevel,
} from '../types';
import {
  ConfigurationSession,
} from '../sessions';

interface ControlConfigurationResolverProps {
  control: ENSControlConfiguration;
  activeLevel: ENSLevel;
  onConfigurationSaved: () => void;
}

const getConfigurationStateLabel = (
  status:
    ENSControlConfigurationStateStatus
): string => {
  if (status === 'CONFIGURED') {
    return 'Configurado';
  }

  if (status === 'INVALID') {
    return 'Configuración inválida';
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

  if (status === 'INVALID') {
    return 'danger';
  }

  if (status === 'INCOMPLETE') {
    return 'danger';
  }

  return 'warning';
};

const getConfigurationStateDescription = (
  state: ENSControlConfigurationState,
  activeLevel: ENSLevel
): string => {
  if (state.status === 'CONFIGURED') {
    return (
      `Todos los parámetros obligatorios aplicables al nivel ${activeLevel} están configurados.`
    );
  }

  if (state.status === 'INVALID') {
    return (
      `Hay ${state.validation.invalid} parámetros con valores inválidos para el nivel ${activeLevel}.`
    );
  }

  if (state.status === 'INCOMPLETE') {
    return (
      `Faltan ${state.validation.missingRequired.length} parámetros obligatorios para el nivel ${activeLevel}.`
    );
  }

  return (
    `Todavía no existen valores explícitos para los parámetros aplicables al nivel ${activeLevel}.`
  );
};

const getConfigurationButtonLabel = (
  status:
    ENSControlConfigurationStateStatus,
  controlId: string
): string => {
  if (status === 'CONFIGURED') {
    return 'Revisar configuración';
  }

  if (status === 'INVALID') {
    return 'Corregir configuración';
  }

  if (status === 'INCOMPLETE') {
    return 'Completar configuración';
  }

  return `Configurar ${controlId}`;
};

export const ControlConfigurationResolver = ({
  control,
  activeLevel,
  onConfigurationSaved,
}: ControlConfigurationResolverProps) => {
  const [
    isConfiguring,
    setIsConfiguring,
  ] = useState(false);

  const configurationState =
    resolveControlConfigurationState(
      control,
      activeLevel
    );

  if (isConfiguring) {
    return (
      <ConfigurationSession
        control={control}
        onConfigurationSaved={
          onConfigurationSaved
        }
      />
    );
  }

  return (
    <EuiPanel
      paddingSize='m'
      color='subdued'
    >
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

      <EuiText>
        <p>
          {getConfigurationStateDescription(
            configurationState,
            activeLevel
          )}
        </p>
      </EuiText>

      <EuiText
        size='s'
        color='subdued'
      >
        <p>
          Configurados:{' '}
          {configurationState.validation.configured}
          {' · '}Sin valor:{' '}
          {configurationState.validation.notConfigured}
          {' · '}Inválidos:{' '}
          {configurationState.validation.invalid}
          {' · '}No aplican:{' '}
          {configurationState.validation.notApplicable}
        </p>
      </EuiText>

      <EuiSpacer size='m' />

      <EuiButton
        fill
        onClick={() =>
          setIsConfiguring(true)
        }
      >
        {getConfigurationButtonLabel(
          configurationState.status,
          control.controlId
        )}
      </EuiButton>
    </EuiPanel>
  );
};
