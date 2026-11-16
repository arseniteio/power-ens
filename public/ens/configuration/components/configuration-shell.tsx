import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiNotificationBadge,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { getActiveENSConfiguration } from '../../../../common/ens/configuration/services';
import { ENSLevel } from '../../../../common/ens/configuration/types';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import { resolveControlLevel } from '../../../../common/ens/core/control-level';
import { useRouterSearch, useSetRouterSearch } from '../../../routing/use-router-search';
import {
  ENSConfigurationTarget,
  ENSConfigurationView,
  configurationBackChanges,
  configurationSearchChanges,
  parseConfigurationBack,
  parseConfigurationTarget,
} from '../../../routing/configuration-link';

import { lifecycleLabel } from './labels';
import { ControlsTab } from './controls-tab';
import { GeneralTab } from './general-tab';
import { AgentValuesFlyout } from './agent-values-flyout';
import { OrganizationDataNotice, OrganizationDataPanel } from './organization-data-panel';
import { SaveWarningNotice } from './save-warning-notice';
import { ProfileChangesProvider, useProfileChanges } from '../profiles/profile-changes';
import { ProfileSaveBar } from '../profiles/save-bar';
import { useHostSummary } from '../profiles/use-host-summary';
import { StatusTab } from '../profiles/status-tab';
import { MachinesTab } from '../profiles/machines-tab';
import { ProfilesTab } from '../profiles/profiles-tab';
import { PendingTab } from '../profiles/pending-tab';

type TabId = 'status' | 'machines' | 'profiles' | 'pending' | 'organization' | 'general';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'status', label: 'Estado' },
  { id: 'machines', label: 'Máquinas' },
  { id: 'profiles', label: 'Perfiles' },
  { id: 'pending', label: 'Pendiente' },
  { id: 'organization', label: 'Organización' },
  { id: 'general', label: 'General' },
];

const tabOf = (view: ENSConfigurationView): TabId => {
  if (view === 'controls') return 'organization';
  if (view === 'agents') return 'machines';
  return view;
};

const scopeText = (groupIds: string[], mode: string): string => {
  if (mode !== 'group') return 'todas las máquinas';
  return groupIds.length ? `${groupIds.length === 1 ? 'grupo' : 'grupos'} ${groupIds.join(', ')}` : 'ningún grupo';
};

const ShellTabs = ({ tab, onSelect, pendingCount }: { tab: TabId; onSelect: (tab: TabId) => void; pendingCount?: number }) => {
  const { working } = useProfileChanges();
  const profileCount = working.filter(entry => entry.staged !== 'deleted' && entry.errors.length === 0).length;
  return (
    <EuiTabs>
      {TABS.map(item => (
        <EuiTab key={item.id} isSelected={tab === item.id} onClick={() => onSelect(item.id)}>
          {item.label}
          {item.id === 'profiles' && profileCount > 0 && (
            <>
              {' '}
              <EuiNotificationBadge color='subdued'>{profileCount}</EuiNotificationBadge>
            </>
          )}
          {item.id === 'pending' && pendingCount !== undefined && pendingCount > 0 && (
            <>
              {' '}
              <EuiNotificationBadge color='subdued'>{pendingCount}</EuiNotificationBadge>
            </>
          )}
        </EuiTab>
      ))}
    </EuiTabs>
  );
};

const ConfigurationContent = () => {
  const search = useRouterSearch();
  const target = parseConfigurationTarget(search);
  const turn = parseConfigurationBack(search);
  const setSearch = useSetRouterSearch();
  const { savedAt } = useProfileChanges();

  const [configurationRevision, setConfigurationRevision] = useState(0);
  const handleConfigurationSaved = useCallback(() => setConfigurationRevision(revision => revision + 1), []);
  const activeConfiguration = useMemo(() => getActiveENSConfiguration(), [configurationRevision]);
  const summary = useHostSummary(`${savedAt || 0}-${configurationRevision}`);

  const getControlActiveLevel = useCallback(
    (controlId: string): ENSLevel => resolveControlLevel(getENSCatalogControl(controlId) || {}, activeConfiguration.global.ensLevel, activeConfiguration.global),
    [activeConfiguration]
  );

  const navigate = useCallback((next: Partial<ENSConfigurationTarget>) => setSearch(configurationSearchChanges(next)), [setSearch]);
  const tab = tabOf(target.view);
  const pendingCount = summary.data ? (summary.data.pending?.parameters.length || 0) + (summary.data.withoutProfile ? 1 : 0) : undefined;

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
        <EuiSpacer size='xs' />
        <EuiText size='s' color='subdued'>
          <p>
            {`Nivel ${activeConfiguration.global.ensLevel} · Alcance: ${scopeText(activeConfiguration.scope.groupIds, activeConfiguration.scope.mode)}`}
          </p>
        </EuiText>

        <EuiSpacer size='m' />

        <SaveWarningNotice />

        {tab !== 'organization' && (
          <OrganizationDataNotice configuration={activeConfiguration} onOpen={() => navigate({ view: 'organization' })} />
        )}

        <ShellTabs tab={tab} onSelect={next => navigate({ view: next })} pendingCount={pendingCount} />

        <EuiSpacer size='l' />

        {tab === 'status' && <StatusTab summary={summary} configuration={activeConfiguration} onNavigate={navigate} />}
        {tab === 'machines' && <MachinesTab target={target} onNavigate={navigate} />}
        {tab === 'profiles' && <ProfilesTab target={target} onNavigate={navigate} />}
        {tab === 'pending' && <PendingTab summary={summary} onNavigate={navigate} />}
        {tab === 'organization' && (
          <>
            <OrganizationDataPanel configuration={activeConfiguration} onConfigurationSaved={handleConfigurationSaved} />
            <EuiSpacer size='l' />
            <ControlsTab
              configuration={activeConfiguration}
              target={target}
              getActiveLevel={getControlActiveLevel}
              onNavigate={navigate}
              onConfigurationSaved={handleConfigurationSaved}
            />
          </>
        )}
        {tab === 'general' && <GeneralTab configuration={activeConfiguration} onConfigurationSaved={handleConfigurationSaved} />}

        {target.view === 'agents' && target.agentId && (
          <AgentValuesFlyout
            configuration={activeConfiguration}
            target={target}
            getActiveLevel={getControlActiveLevel}
            onNavigate={navigate}
            onConfigurationSaved={handleConfigurationSaved}
          />
        )}

        <ProfileSaveBar />
      </EuiPanel>
    </EuiPage>
  );
};

export const ConfigurationShell = () => (
  <ProfileChangesProvider>
    <ConfigurationContent />
  </ProfileChangesProvider>
);
