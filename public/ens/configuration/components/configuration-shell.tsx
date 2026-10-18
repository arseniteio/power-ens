import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  EuiBadge,
  EuiHorizontalRule,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import {
  getActiveENSConfiguration,
  getConfiguredControlById,
  getConfiguredControls,
} from '../../../../common/ens/configuration/services';
import { ENSLevel } from '../../../../common/ens/configuration/types';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import { resolveControlLevel } from '../../../../common/ens/core/control-level';

import {
  ConfigurationCatalog,
} from './configuration-catalog';
import {
  ControlConfigurationPage,
} from './control-configuration-page';
import {
  GlobalConfigurationPanel,
} from './global-configuration-panel';

export const ConfigurationShell = () => {
  const [
    selectedControlId,
    setSelectedControlId,
  ] = useState<string | undefined>();

  const [
    configurationRevision,
    setConfigurationRevision,
  ] = useState(0);

  const handleConfigurationSaved =
    useCallback(() => {
      setConfigurationRevision(
        currentRevision =>
          currentRevision + 1
      );
    }, []);

  const activeConfiguration =
    useMemo(
      () =>
        getActiveENSConfiguration(),
      [configurationRevision]
    );

  const controls =
    useMemo(
      () =>
        getConfiguredControls(),
      [configurationRevision]
    );

  // El nivel contra el que se validan los parámetros de UN control es el mismo
  // con el que lo evalúa el motor: el global, salvo que el control se rija por
  // el nivel de una dimensión (op.exp.8 y la Trazabilidad). Validar op.exp.8
  // contra el global pedía como obligatorio lo que el motor no exige, o al revés.
  const getControlActiveLevel =
    useCallback(
      (controlId: string): ENSLevel =>
        resolveControlLevel(
          getENSCatalogControl(controlId) || {},
          activeConfiguration.global.ensLevel,
          activeConfiguration.global
        ),
      [activeConfiguration]
    );

  const selectedControl =
    useMemo(
      () =>
        selectedControlId
          ? getConfiguredControlById(
            selectedControlId
          )
          : undefined,
      [
        configurationRevision,
        selectedControlId,
      ]
    );

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel paddingSize='l'>
        <EuiTitle size='m'>
          <h2>Configuración ENS</h2>
        </EuiTitle>

        <EuiText color='subdued'>
          <p>
            Centro de configuración de controles ENS. Cada
            control configurable tendrá su propia ficha,
            parámetros y estado.
          </p>
        </EuiText>

        <EuiSpacer size='m' />

        <EuiBadge color='hollow'>
          Estado global:{' '}
          {activeConfiguration.status}
        </EuiBadge>

        <EuiHorizontalRule />

        {!selectedControl ? (
          <>
            <GlobalConfigurationPanel
              configuration={activeConfiguration.global}
              onConfigurationSaved={handleConfigurationSaved}
            />

            <EuiSpacer size='l' />

            <EuiHorizontalRule />

            <EuiTitle size='s'>
              <h3>
                Controles configurables
              </h3>
            </EuiTitle>

            <EuiSpacer size='m' />

            <ConfigurationCatalog
              controls={controls}
              getActiveLevel={getControlActiveLevel}
              selectedControlId={
                selectedControlId
              }
              onOpenControl={
                setSelectedControlId
              }
            />
          </>
        ) : (
          <ControlConfigurationPage
            control={selectedControl}
            activeLevel={getControlActiveLevel(
              selectedControl.controlId
            )}
            onBack={() =>
              setSelectedControlId(
                undefined
              )
            }
            onConfigurationSaved={
              handleConfigurationSaved
            }
          />
        )}
      </EuiPanel>
    </EuiPage>
  );
};
