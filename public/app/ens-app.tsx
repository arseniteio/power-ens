import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPage, EuiPageBody, EuiSpacer, EuiTab, EuiTabs } from '@elastic/eui';
import { ENSConfigurationBootstrap, ConfigurationENS } from '../ens/configuration';
import { ControlsENS } from '../ens/controls';
import { InformesENS } from '../ens/reports';
import { EvidencesENS } from '../ens/evidences';
import { EnsDashboardMain } from '../ens/dashboard/ens-dashboard-main';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';
import { ENS_TABS, resolveTab } from './tabs';
import { MachineSelector } from './machine-selector';

// Las vistas de cada pestaña. Requisitos y Eventos llegan en las tareas 6 y 7.
const VISTAS: Record<string, React.ComponentType> = {
  dashboard: EnsDashboardMain,
  configuration: ConfigurationENS,
  plugins: ControlsENS,
  'ens-informes': InformesENS,
  evidences: EvidencesENS,
};

export const EnsApp = () => {
  const { tabView } = useRouterSearch();
  const cambia = useSetRouterSearch();
  const pestana = resolveTab(tabView);
  const Vista = VISTAS[pestana.id] || (() => null);

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
