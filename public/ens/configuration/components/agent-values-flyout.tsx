import React, { useMemo } from 'react';
import { EuiFlyout, EuiFlyoutBody, EuiFlyoutHeader, EuiTitle } from '@elastic/eui';

import type { ENSConfigurationVersion, ENSLevel } from '../../../../common/ens/configuration/types';
import { normalizeAgentId } from '../../../../common/agent-configuration';
import { detectAgentSystem, withInventoryTypes } from '../../../../common/ens/configuration/agents/system-detection';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { AgentConfigurationPage } from './agent-configuration-page';
import { ENSAgentRow, agentRowLabel, buildAgentRows, useAgentsData } from './use-agents-data';

interface AgentValuesFlyoutProps {
  configuration: ENSConfigurationVersion;
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

export const AgentValuesFlyout = ({ configuration: stored, target, getActiveLevel, onNavigate, onConfigurationSaved }: AgentValuesFlyoutProps) => {
  const data = useAgentsData();
  const configuration = useMemo(() => withInventoryTypes(stored, data.inventory), [stored, data.inventory]);
  const rows = useMemo<ENSAgentRow[]>(() => buildAgentRows(configuration, data), [data, configuration]);
  const openId = normalizeAgentId(target.agentId);
  const agent = data.inventory.find(item => normalizeAgentId(item.id) === openId);
  const row: ENSAgentRow = rows.find(item => item.id === openId) || {
    id: openId,
    agent: agent || { id: openId, groups: [] },
    inScope: false,
    detection: detectAgentSystem(agent || { id: openId }),
  };

  return (
    <EuiFlyout size='l' ownFocus onClose={() => onNavigate({ view: 'machines', hostId: openId })} aria-labelledby='ens-agent-flyout-title'>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size='s'>
          <h2 id='ens-agent-flyout-title'>{`Valores propios de ${agentRowLabel(row)}`}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <AgentConfigurationPage
          key={row.id}
          configuration={configuration}
          row={row}
          known={rows.some(item => item.id === row.id) || Boolean(agent)}
          loading={data.loading}
          target={target}
          getActiveLevel={getActiveLevel}
          onNavigate={onNavigate}
          onConfigurationSaved={onConfigurationSaved}
        />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
