import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiHorizontalRule,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import {
  getActiveENSConfiguration,
  getPendingTemplateMigration,
  saveFromLatestConfiguration,
} from '../../../../common/ens/configuration/services';
import { summarizeTemplateMigration } from '../../../../common/ens/configuration/agents/template-migration';
import { ENSLevel } from '../../../../common/ens/configuration/types';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import { resolveControlLevel } from '../../../../common/ens/core/control-level';
import {
  useRouterSearch,
  useSetRouterSearch,
} from '../../../routing/use-router-search';
import {
  ENSConfigurationTarget,
  configurationBackChanges,
  configurationSearchChanges,
  parseConfigurationBack,
  parseConfigurationTarget,
} from '../../../routing/configuration-link';

import { errorMessage } from './confirm-modal';
import { ControlsTab } from './controls-tab';
import { AgentsTab } from './agents-tab';
import { GeneralTab } from './general-tab';

// Configuración in three tabs: «Controles», «Agentes» and «General». The URL decides what is shown
// (`configControl`, `configAgent`, `configParam`, `configView`), so the control detail links here and «back» works.
export const ConfigurationShell = () => {
  const search = useRouterSearch();
  const target = parseConfigurationTarget(search);
  // Abierta desde el Detalle del control («Configurar este control» o un
  // parámetro de una no conformidad): la vuelta a ese mismo detalle, con su
  // control y su máquina (siguen en la URL).
  const vuelta = parseConfigurationBack(search);
  const setSearch = useSetRouterSearch();

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

  // El nivel contra el que se validan los parámetros de UN control es el mismo
  // con el que lo evalúa el motor: el global, salvo que el control se rija por
  // el nivel de una dimensión (op.exp.8 y la Trazabilidad).
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

  const pendingMigration = getPendingTemplateMigration();
  const [migrationError, setMigrationError] = useState<string | undefined>();

  const saveMigration = async () => {
    setMigrationError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: latest, reason: summarizeTemplateMigration(pendingMigration!) }));
      handleConfigurationSaved();
    } catch (failure) {
      setMigrationError(errorMessage(failure));
    }
  };

  const navigate = useCallback(
    (next: Partial<ENSConfigurationTarget>) => setSearch(configurationSearchChanges(next)),
    [setSearch]
  );

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel paddingSize='l'>
        {vuelta && (
          <>
            <EuiButtonEmpty iconType='arrowLeft' flush='left' onClick={() => setSearch(configurationBackChanges(vuelta))}>
              {`Volver al detalle de ${vuelta.controlId}${search.agentId ? ` (${search.agentId})` : ''}`}
            </EuiButtonEmpty>
            <EuiSpacer size='s' />
          </>
        )}
        <EuiTitle size='m'>
          <h2>Configuración ENS</h2>
        </EuiTitle>

        <EuiText color='subdued'>
          <p>
            El valor que se aplica a un agente: su ajuste propio; si no, el de la plantilla asignada en el control;
            sin plantilla asignada, el de la plantilla de serie de su tipo; si no, el valor común del control.
          </p>
        </EuiText>

        <EuiSpacer size='m' />

        <EuiBadge color='hollow'>
          Estado global:{' '}
          {activeConfiguration.status}
        </EuiBadge>

        <EuiSpacer size='m' />

        {pendingMigration && (
          <>
            <EuiCallOut color='primary' iconType='iInCircle' title='Configuración de la 1.2.0 convertida a plantillas por control'>
              <p>{summarizeTemplateMigration(pendingMigration)}</p>
              <p>Los valores de cada agente no cambian. Se guarda con el próximo cambio; la versión anterior queda en el historial.</p>
              {migrationError && <p>{migrationError}</p>}
              <EuiButton size='s' onClick={saveMigration}>
                Guardar la conversión
              </EuiButton>
            </EuiCallOut>
            <EuiSpacer size='m' />
          </>
        )}

        <EuiTabs>
          <EuiTab isSelected={target.view === 'controls'} onClick={() => navigate({ view: 'controls' })}>
            Controles
          </EuiTab>
          <EuiTab isSelected={target.view === 'agents'} onClick={() => navigate({ view: 'agents' })}>
            Agentes
          </EuiTab>
          <EuiTab isSelected={target.view === 'general'} onClick={() => navigate({ view: 'general' })}>
            General
          </EuiTab>
        </EuiTabs>

        <EuiHorizontalRule />

        {target.view === 'controls' && (
          <ControlsTab
            configuration={activeConfiguration}
            target={target}
            getActiveLevel={getControlActiveLevel}
            onNavigate={navigate}
            onConfigurationSaved={handleConfigurationSaved}
          />
        )}
        {target.view === 'agents' && (
          <AgentsTab
            configuration={activeConfiguration}
            target={target}
            getActiveLevel={getControlActiveLevel}
            onNavigate={navigate}
            onConfigurationSaved={handleConfigurationSaved}
          />
        )}
        {target.view === 'general' && (
          <GeneralTab configuration={activeConfiguration} onConfigurationSaved={handleConfigurationSaved} />
        )}
      </EuiPanel>
    </EuiPage>
  );
};
