import React from 'react';
import { EuiBadge, EuiButton, EuiHorizontalRule, EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';

import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../../../../common/ens/configuration/types';
import {
  getParameterClass,
  isAgentLevelParameter,
} from '../../../../common/ens/configuration/agents/parameter-classes';
import { hasTemplateParameters } from '../../../../common/ens/configuration/templates';
import { useRouterSearch } from '../../../routing/use-router-search';
import { ENSConfigurationTarget, parseConfigurationBack } from '../../../routing/configuration-link';
import { ControlConfigurationResolver } from './control-configuration-resolver';
import { ControlConfigurationReset } from './control-configuration-reset';
import { ControlTemplatesPanel } from './control-templates-panel';
import { ControlAssignmentPanel } from './control-assignment-panel';
import { ENSAgentsData, buildAgentRows } from './use-agents-data';

// Only common parameters judge the common state: agent-level ones are judged per agent.
const commonParameterIds = (control: ENSControlConfiguration): string[] =>
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
  data: ENSAgentsData;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

export const ControlPage = ({
  configuration,
  control,
  activeLevel,
  focusParameterId,
  data,
  onNavigate,
  onConfigurationSaved,
}: ControlPageProps) => {
  // From the control detail, its own «Volver al detalle» replaces this one only on that same control.
  const back = parseConfigurationBack(useRouterSearch());
  const fromDetail = back?.controlId === control.controlId;
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
        secondaryTitle='Valor común de los parámetros que cambian por agente'
        secondaryDescription='Lo toma un agente sin ajuste propio ni plantilla que lo fije.'
        focusParameterId={focusParameterId}
      />

      <EuiHorizontalRule />

      {withTemplates ? (
        <>
          <ControlTemplatesPanel configuration={configuration} control={control} rows={rows} onConfigurationSaved={onConfigurationSaved} />
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
              <p>No se pudo leer: {error}</p>
            </EuiText>
          ))}
        </>
      ) : (
        <EuiText size='s' color='subdued'>
          <p>Este control solo tiene ajustes comunes.</p>
        </EuiText>
      )}

      <EuiSpacer size='l' />

      <ControlConfigurationReset control={control} onConfigurationSaved={onConfigurationSaved} />
    </EuiPanel>
  );
};
