import React, { useState } from 'react';
import { EuiBadge, EuiButton, EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';

import {
  ENSControlConfigurationState,
  ENSControlConfigurationStateStatus,
  resolveControlConfigurationState,
} from '../../../../common/ens/configuration/services';
import { ENSControlConfiguration, ENSLevel } from '../../../../common/ens/configuration/types';
import { ConfigurationSession } from '../sessions';

interface ControlConfigurationResolverProps {
  control: ENSControlConfiguration;
  activeLevel: ENSLevel;
  onConfigurationSaved: () => void;
  // Parameters of this screen level (Organización): the state is computed from them alone and the form shows
  // them first; the rest go in a dropdown. Without it, all.
  parameterIds?: string[];
  secondaryParameterIds?: string[];
  secondaryTitle?: string;
  secondaryDescription?: string;
  focusParameterId?: string;
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
      `Completo para el nivel ${activeLevel}.`
    );
  }

  // The reason, not just the count: an invalid value is fixed by correcting, a missing one by filling.
  if (state.status === 'INVALID') {
    return (
      `Valores inválidos para el nivel ${activeLevel}: ${state.validation.issues
        .map(
          issue =>
            `${issue.parameterId} (${issue.label}) ${issue.reason}`
        )
        .join('; ')}.`
    );
  }

  if (state.status === 'INCOMPLETE') {
    return (
      `Faltan ${state.validation.missingRequired.length} parámetros obligatorios para el nivel ${activeLevel}: ${state.validation.missingRequired
        .map(parameter => parameter.id)
        .join(', ')}.`
    );
  }

  return (
    `Sin valores para el nivel ${activeLevel}.`
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
  parameterIds,
  secondaryParameterIds,
  secondaryTitle,
  secondaryDescription,
  focusParameterId,
}: ControlConfigurationResolverProps) => {
  // With a parameter requested by the URL, the form opens directly.
  const [
    isConfiguring,
    setIsConfiguring,
  ] = useState(!!focusParameterId);

  const configurationState =
    resolveControlConfigurationState(
      parameterIds
        ? {
            ...control,
            parameters: control.parameters.filter(parameter =>
              parameterIds.includes(parameter.id)
            ),
          }
        : control,
      activeLevel
    );

  if (isConfiguring) {
    return (
      <ConfigurationSession
        control={control}
        onConfigurationSaved={
          onConfigurationSaved
        }
        parameterIds={parameterIds}
        secondaryParameterIds={secondaryParameterIds}
        secondaryTitle={secondaryTitle}
        secondaryDescription={secondaryDescription}
        focusParameterId={focusParameterId}
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
