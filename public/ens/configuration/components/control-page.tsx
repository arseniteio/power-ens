import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../../../../common/ens/configuration/types';
import { getParameterClass, isAgentLevelParameter } from '../../../../common/ens/configuration/agents/parameter-classes';
import { hasTemplateParameters } from '../../../../common/ens/configuration/templates';
import { useRouterSearch } from '../../../routing/use-router-search';
import { ENSConfigurationTarget, parseConfigurationBack } from '../../../routing/configuration-link';
import { ControlConfigurationResolver } from './control-configuration-resolver';
import { ControlConfigurationReset } from './control-configuration-reset';
import { ControlTemplatesPanel } from './control-templates-panel';
import { ControlAssignmentPanel } from './control-assignment-panel';
import { buildAgentRows, useAgentsData } from './use-agents-data';

// Common parameters of a control, in its order: the «Ajustes comunes» and the only ones its state is judged on.
export const commonParameterIds = (control: ENSControlConfiguration): string[] =>
  control.parameters
    .filter(parameter => {
      const parameterClass = getParameterClass(control.controlId, parameter.id);
      return parameterClass === 'organisation' || parameterClass === undefined;
    })
    .map(parameter => parameter.id);

export const commonView = (control: ENSControlConfiguration): ENSControlConfiguration => {
  const ids = commonParameterIds(control);
  return { ...control, parameters: control.parameters.filter(parameter => ids.includes(parameter.id)) };
};

interface ControlPageProps {
  configuration: ENSConfigurationVersion;
  control: ENSControlConfiguration;
  activeLevel: ENSLevel;
  focusParameterId?: string;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

// One control: «Ajustes comunes», «Plantillas» and «Asignación».
export const ControlPage = ({
  configuration,
  control,
  activeLevel,
  focusParameterId,
  onNavigate,
  onConfigurationSaved,
}: ControlPageProps) => {
  const fromDetail = Boolean(parseConfigurationBack(useRouterSearch()));
  const data = useAgentsData();
  const rows = buildAgentRows(configuration, data);
  const withTemplates = hasTemplateParameters(control.controlId);

  return (
    <EuiPanel paddingSize='l'>
      {!fromDetail && (
        <>
          <EuiButton size='s' onClick={() => onNavigate({ view: 'controls' })}>
            Volver a controles
          </EuiButton>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiBadge color='hollow'>{control.controlId}</EuiBadge>
      <EuiTitle size='m'>
        <h2>{control.controlName}</h2>
      </EuiTitle>
      <EuiText color='subdued'>
        <p>{control.family}</p>
      </EuiText>

      <EuiSpacer size='m' />

      <EuiTitle size='s'>
        <h3>Ajustes comunes</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>Lo que es igual para toda la organización.</p>
      </EuiText>
      <EuiSpacer size='s' />
      <ControlConfigurationResolver
        key={`${control.controlId}-${focusParameterId || ''}`}
        control={control}
        activeLevel={activeLevel}
        onConfigurationSaved={onConfigurationSaved}
        parameterIds={commonParameterIds(control)}
        secondaryParameterIds={control.parameters.filter(parameter => isAgentLevelParameter(control.controlId, parameter.id)).map(parameter => parameter.id)}
        secondaryTitle='Valor común de los parámetros por sistema y por plataforma'
        secondaryDescription='Lo toma un agente sin ajuste propio ni plantilla que fije el parámetro.'
        focusParameterId={focusParameterId}
      />

      <EuiHorizontalRule />

      {withTemplates ? (
        <>
          <ControlTemplatesPanel configuration={configuration} control={control} onConfigurationSaved={onConfigurationSaved} />
          <EuiHorizontalRule />
          <ControlAssignmentPanel
            configuration={configuration}
            controlId={control.controlId}
            rows={rows}
            loading={data.loading}
            activeLevel={activeLevel}
            onNavigate={onNavigate}
            onConfigurationSaved={onConfigurationSaved}
          />
          {data.errors.map(error => (
            <EuiText key={error} size='xs' color='subdued'>
              <p>Detección incompleta: {error}</p>
            </EuiText>
          ))}
        </>
      ) : (
        <EuiText size='s' color='subdued'>
          <p>Este control solo tiene ajustes comunes: no tiene plantillas ni asignación por agente.</p>
        </EuiText>
      )}

      <EuiSpacer size='l' />

      <ControlConfigurationReset control={control} onConfigurationSaved={onConfigurationSaved} />
    </EuiPanel>
  );
};
