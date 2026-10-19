import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPage, EuiPageBody, EuiSpacer, EuiTab, EuiTabs } from '@elastic/eui';
import { ENSConfigurationBootstrap, ConfigurationENS } from '../ens/configuration';
import { LoadingSpinner } from '../platform/loading-spinner';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';
import { ENS_TABS, resolveTab } from './tabs';
import { MachineSelector } from './machine-selector';
import { TabErrorBoundary } from './tab-error-boundary';
import { isAgentInScope } from './agent-in-scope';
import { useActiveENSScopeAgents } from '../ens/scope/use-active-scope-agents';

// A URL machine outside the scope renders no tab: the selector says so, and each screen would otherwise request an evaluation that answers 400.
const OnlyInScope = ({ children }: { children: React.ReactNode }) => {
  const { agentId } = useRouterSearch();
  const scope = useActiveENSScopeAgents();
  return agentId && !isAgentInScope(agentId, scope) ? null : (children as any);
};

const VIEWS: Record<string, React.ComponentType> = {
  dashboard: React.lazy(() => import('../ens/dashboard/ens-dashboard-main').then(m => ({ default: m.EnsDashboardMain }))),
  overview: React.lazy(() => import('../ens/overview').then(m => ({ default: m.OverviewENS }))),
  configuration: ConfigurationENS,
  controls: React.lazy(() => import('../requirements/requirements-view').then(m => ({ default: m.RequirementsView }))),
  events: React.lazy(() => import('../events/events-view').then(m => ({ default: m.EventsView }))),
  plugins: React.lazy(() => import('../ens/controls').then(m => ({ default: m.ControlsENS }))),
  'ens-informes': React.lazy(() => import('../ens/reports').then(m => ({ default: m.ReportsENS }))),
  evidences: React.lazy(() => import('../ens/evidences').then(m => ({ default: m.EvidencesENS }))),
};

// Outside the component: a component created on every render would remount each time.
const EmptyView = () => null;

export const EnsApp = () => {
  const { tabView, agentId, control } = useRouterSearch();
  // Changing machine or control does not unmount the tab (see tab-error-boundary.tsx): it only clears a previous render error.
  const retry = `${agentId || ''}|${control || ''}`;
  const changes = useSetRouterSearch();
  const tab = resolveTab(tabView);
  const ActiveView = VIEWS[tab.id] || EmptyView;

  const content = tab.withBootstrap ? (
    <ENSConfigurationBootstrap>
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false} style={{ minWidth: 320 }}>
          <MachineSelector />
        </EuiFlexItem>
      </EuiFlexGroup>
      <TabErrorBoundary key={tab.id} tabName={tab.name} resetKey={retry}>
        <OnlyInScope>
          <ActiveView />
        </OnlyInScope>
      </TabErrorBoundary>
    </ENSConfigurationBootstrap>
  ) : (
    <TabErrorBoundary key={tab.id} tabName={tab.name} resetKey={retry}>
      <ActiveView />
    </TabErrorBoundary>
  );

  return (
    <EuiPage paddingSize="m">
      <EuiPageBody>
        <EuiTabs>
          {ENS_TABS.map(t => (
            <EuiTab key={t.id} isSelected={t.id === tab.id} onClick={() =>
                // Configuration parameters (and their return to the detail) belong to that screen: cleared on tab change.
                changes({ tabView: t.id, configView: undefined, configAgent: undefined, configControl: undefined, configParam: undefined, configBack: undefined, evidenceControl: undefined })
              }>
              {t.name}
            </EuiTab>
          ))}
        </EuiTabs>
        <EuiSpacer size="m" />
        <React.Suspense fallback={<LoadingSpinner message="Cargando pantalla ENS..." />}>
          {content}
        </React.Suspense>
      </EuiPageBody>
    </EuiPage>
  );
};
