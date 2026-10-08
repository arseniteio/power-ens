import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPage, EuiPageBody, EuiSpacer, EuiTab, EuiTabs } from '@elastic/eui';
import { ENSConfigurationBootstrap, ConfigurationENS } from '../ens/configuration';
import { ControlsENS } from '../ens/controls';
import { InformesENS } from '../ens/reports';
import { EvidencesENS } from '../ens/evidences';
import { EnsDashboardMain } from '../ens/dashboard/ens-dashboard-main';
import { EventsView } from '../events/events-view';
import { RequirementsView } from '../requirements/requirements-view';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';
import { ENS_TABS, resolveTab } from './tabs';
import { MachineSelector } from './machine-selector';

// Las vistas de cada pestaña.
const VISTAS: Record<string, React.ComponentType> = {
  dashboard: EnsDashboardMain,
  configuration: ConfigurationENS,
  controls: RequirementsView,
  events: EventsView,
  plugins: ControlsENS,
  'ens-informes': InformesENS,
  evidences: EvidencesENS,
};

// Una pestaña sin vista todavía no pinta nada. Fuera del componente: un
// componente nuevo en cada render se desmontaría y montaría cada vez.
const Vacia = () => null;

export const EnsApp = () => {
  const { tabView } = useRouterSearch();
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
      <Vista />
    </ENSConfigurationBootstrap>
  ) : (
    <Vista />
  );

  return (
    <EuiPage paddingSize="m">
      <EuiPageBody>
        <EuiTabs>
          {ENS_TABS.map(t => (
            <EuiTab key={t.id} isSelected={t.id === pestana.id} onClick={() => cambia({ tabView: t.id })}>
              {t.name}
            </EuiTab>
          ))}
        </EuiTabs>
        <EuiSpacer size="m" />
        {contenido}
      </EuiPageBody>
    </EuiPage>
  );
};
