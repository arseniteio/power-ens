import React from 'react';
import {
  EuiDescriptionList,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { GlobalConfigurationPanel } from './global-configuration-panel';

interface GeneralTabProps {
  configuration: ENSConfigurationVersion;
  onConfigurationSaved: () => void;
}

const MODES: Record<string, string> = {
  global: 'todos los agentes del inventario',
  agent: 'los agentes de la lista',
  group: 'los agentes de los grupos',
};

// «General»: ENS level, T and D levels and the rest of the global settings; the ENS scope, read-only.
export const GeneralTab = ({ configuration, onConfigurationSaved }: GeneralTabProps) => {
  const scope = configuration.scope;
  return (
    <>
      <GlobalConfigurationPanel configuration={configuration.global} onConfigurationSaved={onConfigurationSaved} />

      <EuiSpacer size='l' />

      <EuiPanel paddingSize='m' color='subdued'>
        <EuiTitle size='s'>
          <h3>Alcance ENS</h3>
        </EuiTitle>
        <EuiText size='s' color='subdued'>
          <p>Qué agentes se evalúan. Solo lectura: se define en initial-setup.</p>
        </EuiText>
        <EuiSpacer size='s' />
        <EuiDescriptionList
          compressed
          listItems={[
            { title: 'Modo', description: `${scope.mode}: ${MODES[scope.mode] || scope.mode}` },
            { title: 'Grupos', description: scope.groupIds.length ? scope.groupIds.join(', ') : '—' },
            { title: 'Agentes', description: scope.agentIds.length ? scope.agentIds.join(', ') : '—' },
          ]}
        />
      </EuiPanel>
    </>
  );
};
