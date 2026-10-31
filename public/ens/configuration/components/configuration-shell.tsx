import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiTitle,
} from '@elastic/eui';

import { getActiveENSConfiguration } from '../../../../common/ens/configuration/services';
import { ENSLevel } from '../../../../common/ens/configuration/types';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import { resolveControlLevel } from '../../../../common/ens/core/control-level';
import { useRouterSearch, useSetRouterSearch } from '../../../routing/use-router-search';
import {
  ENSConfigurationTarget,
  configurationBackChanges,
  configurationSearchChanges,
  parseConfigurationBack,
  parseConfigurationTarget,
} from '../../../routing/configuration-link';

import { lifecycleLabel } from './labels';
import { ControlsTab } from './controls-tab';
import { AgentsTab } from './agents-tab';
import { GeneralTab } from './general-tab';
import { OrganizationDataNotice } from './organization-data-panel';
import { SaveWarningNotice } from './save-warning-notice';

// The URL decides what is shown, so the control detail links here and the browser's «back» works.
export const ConfigurationShell = () => {
  const search = useRouterSearch();
  const target = parseConfigurationTarget(search);
  // Opened from the control detail: the way back keeps its control and machine, still in the URL.
  const turn = parseConfigurationBack(search);
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

  // The level the engine evaluates each control with: the global one, or the highest of its dimensions (C, I, T, A, D).
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

  const navigate = useCallback(
    (next: Partial<ENSConfigurationTarget>) => setSearch(configurationSearchChanges(next)),
    [setSearch]
  );

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel paddingSize='l'>
        {turn && (
          <>
            <EuiButtonEmpty iconType='arrowLeft' flush='left' onClick={() => setSearch(configurationBackChanges(turn))}>
              {`Volver al detalle de ${turn.controlId}${search.agentId ? ` (${search.agentId})` : ''}`}
            </EuiButtonEmpty>
            <EuiSpacer size='s' />
          </>
        )}
        <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size='m'>
              <h2>Configuración ENS</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color='hollow'>{lifecycleLabel(activeConfiguration.status)}</EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size='m' />

        <SaveWarningNotice />

        {target.view !== 'general' && (
          <OrganizationDataNotice configuration={activeConfiguration} onOpen={() => navigate({ view: 'general' })} />
        )}

        <EuiTabs>
          <EuiTab isSelected={target.view === 'general'} onClick={() => navigate({ view: 'general' })}>
            Organización
          </EuiTab>
          <EuiTab isSelected={target.view === 'controls'} onClick={() => navigate({ view: 'controls' })}>
            Plantillas
          </EuiTab>
          <EuiTab isSelected={target.view === 'agents'} onClick={() => navigate({ view: 'agents' })}>
            Agentes
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
