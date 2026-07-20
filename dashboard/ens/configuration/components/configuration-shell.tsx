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
} from '../services';

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
              activeLevel={activeConfiguration.global.ensLevel}
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
            activeLevel={activeConfiguration.global.ensLevel}
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
