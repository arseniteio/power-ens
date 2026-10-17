import React, { useMemo } from 'react';
import {
  EuiCallOut,
  EuiHorizontalRule,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';

import {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../types';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import {
  getParameterClass,
  isAgentLevelParameter,
} from '../agents/parameter-classes';

import { ConfigurationCatalog } from './configuration-catalog';
import { ControlConfigurationPage } from './control-configuration-page';
import { GlobalConfigurationPanel } from './global-configuration-panel';
import { MissingControlsPanel } from './missing-controls-panel';

interface OrganisationLevelProps {
  configuration: ENSConfigurationVersion;
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

// Los parámetros de organización de un control, en el orden del control.
export const organisationParameterIds = (control: ENSControlConfiguration): string[] =>
  control.parameters
    .filter(parameter => getParameterClass(control.controlId, parameter.id) === 'organisation' ||
      getParameterClass(control.controlId, parameter.id) === undefined)
    .map(parameter => parameter.id);

const agentLevelParameterIds = (control: ENSControlConfiguration): string[] =>
  control.parameters
    .filter(parameter => isAgentLevelParameter(control.controlId, parameter.id))
    .map(parameter => parameter.id);

// Lo que la tarjeta y el estado de Organización juzgan: solo los parámetros de
// organización. Los demás se completan en cada sistema; contarlos aquí daría
// por incompleta una política que no lo está.
const organisationView = (control: ENSControlConfiguration): ENSControlConfiguration => {
  const ids = organisationParameterIds(control);
  return { ...control, parameters: control.parameters.filter(parameter => ids.includes(parameter.id)) };
};

export const OrganisationLevel = ({
  configuration,
  target,
  getActiveLevel,
  onNavigate,
  onConfigurationSaved,
}: OrganisationLevelProps) => {
  const selectedControl = target.controlId
    ? configuration.controls.find(control => control.controlId === target.controlId)
    : undefined;

  const catalogControls = useMemo(
    () => configuration.controls.map(organisationView),
    [configuration]
  );

  if (selectedControl) {
    return (
      <ControlConfigurationPage
        key={`${selectedControl.controlId}-${target.parameterId || ''}`}
        control={selectedControl}
        activeLevel={getActiveLevel(selectedControl.controlId)}
        onBack={() => onNavigate({ view: 'organisation' })}
        onConfigurationSaved={onConfigurationSaved}
        parameterIds={organisationParameterIds(selectedControl)}
        secondaryParameterIds={agentLevelParameterIds(selectedControl)}
        secondaryTitle='Valores que heredan los sistemas (por sistema y por plataforma)'
        secondaryDescription='Estos parámetros se declaran en cada sistema (pestaña «Sistemas») o con una plantilla. El valor de aquí es el que hereda una máquina que no tiene valor propio ni plantilla que lo fije; las filas que la migración no pudo asignar a ningún agente se quedan aquí.'
        focusParameterId={target.parameterId}
      />
    );
  }

  return (
    <>
      {target.controlId && (
        <>
          <EuiCallOut
            color='warning'
            iconType='iInCircle'
            title={`${target.controlId} no está en la configuración`}
          >
            <p>
              El enlace pide un control que todavía no se ha añadido. Se añade
              abajo, en «Controles del catálogo sin añadir».
            </p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <GlobalConfigurationPanel
        configuration={configuration.global}
        onConfigurationSaved={onConfigurationSaved}
      />

      <EuiSpacer size='l' />

      <EuiHorizontalRule />

      <EuiTitle size='s'>
        <h3>Controles configurables: política de la organización</h3>
      </EuiTitle>

      <EuiSpacer size='m' />

      <ConfigurationCatalog
        controls={catalogControls}
        getActiveLevel={getActiveLevel}
        selectedControlId={target.controlId}
        onOpenControl={controlId => onNavigate({ view: 'organisation', controlId })}
      />

      <EuiSpacer size='l' />

      <MissingControlsPanel
        configuration={configuration}
        highlightControlId={target.controlId}
        onConfigurationSaved={onConfigurationSaved}
      />
    </>
  );
};
