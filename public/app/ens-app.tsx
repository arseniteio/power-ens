import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPage, EuiPageBody, EuiSpacer, EuiTab, EuiTabs } from '@elastic/eui';
import { ENSConfigurationBootstrap, ConfigurationENS } from '../ens/configuration';
import { LoadingSpinner } from '../platform/loading-spinner';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';
import { ENS_TABS, resolveTab } from './tabs';
import { MachineSelector } from './machine-selector';
import { TabErrorBoundary } from './tab-error-boundary';

// Las vistas de cada pestaña.
const VISTAS: Record<string, React.ComponentType> = {
  dashboard: React.lazy(() => import('../ens/dashboard/ens-dashboard-main').then(m => ({ default: m.EnsDashboardMain }))),
  overview: React.lazy(() => import('../ens/overview').then(m => ({ default: m.OverviewENS }))),
  configuration: ConfigurationENS,
  controls: React.lazy(() => import('../requirements/requirements-view').then(m => ({ default: m.RequirementsView }))),
  events: React.lazy(() => import('../events/events-view').then(m => ({ default: m.EventsView }))),
  plugins: React.lazy(() => import('../ens/controls').then(m => ({ default: m.ControlsENS }))),
  'ens-informes': React.lazy(() => import('../ens/reports').then(m => ({ default: m.InformesENS }))),
  evidences: React.lazy(() => import('../ens/evidences').then(m => ({ default: m.EvidencesENS }))),
};

// Una pestaña sin vista todavía no pinta nada. Fuera del componente: un
// componente nuevo en cada render se desmontaría y montaría cada vez.
const Vacia = () => null;

export const EnsApp = () => {
  const { tabView, agentId } = useRouterSearch();
  const cambia = useSetRouterSearch();
  const pestana = resolveTab(tabView);
  const Vista = VISTAS[pestana.id] || Vacia;

  const contenido = pestana.withBootstrap ? (
    <ENSConfigurationBootstrap>
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false} style={{ minWidth: 320 }}>
          <MachineSelector />
        </EuiFlexItem>
      </EuiFlexGroup>
      <TabErrorBoundary key={`${pestana.id}|${agentId || ''}`} tabName={pestana.name}>
        <Vista />
      </TabErrorBoundary>
    </ENSConfigurationBootstrap>
  ) : (
    <TabErrorBoundary key={pestana.id} tabName={pestana.name}>
      <Vista />
    </TabErrorBoundary>
  );

  return (
    <EuiPage paddingSize="m">
      <EuiPageBody>
        <EuiTabs>
          {ENS_TABS.map(t => (
            <EuiTab key={t.id} isSelected={t.id === pestana.id} onClick={() =>
                // Los parámetros de Configuración (y su vuelta al detalle) son
                // de esa pantalla: se limpian al cambiar de pestaña.
                cambia({ tabView: t.id, configView: undefined, configAgent: undefined, configControl: undefined, configParam: undefined, configBack: undefined })
              }>
              {t.name}
            </EuiTab>
          ))}
        </EuiTabs>
        <EuiSpacer size="m" />
        <React.Suspense fallback={<LoadingSpinner message="Cargando pantalla ENS..." />}>
          {contenido}
        </React.Suspense>
      </EuiPageBody>
    </EuiPage>
  );
};
