// Replaces Wazuh's 'Explore agent': picks a machine of the ENS scope, or all. It only touches `agentId` in the URL, which the screens read.
import { ENS_OUT_OF_GROUP_LABEL } from '../../common/ens/core/scope/evaluable-groups';
import React from 'react';
import { EuiButton, EuiCallOut, EuiFormRow, EuiSpacer, EuiSuperSelect, EuiHealth } from '@elastic/eui';
import { getActiveENSScopeAgents } from '../../common/ens/core/scope';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';
import { describeAgentOutOfScope, isAgentInScope, normalizeAgentIdForScope } from './agent-in-scope';

const ALL = '__todas__';

export const MachineSelector = () => {
  const { agentId } = useRouterSearch();
  const changes = useSetRouterSearch();
  const agents = getActiveENSScopeAgents();
  const outside = Boolean(agentId) && !isAgentInScope(agentId, agents);

  const options = [
    { value: ALL, inputDisplay: 'Todas las máquinas' },
    ...agents.map(a => ({
      value: a.id,
      inputDisplay: (
        <EuiHealth color={a.status === 'active' ? 'success' : 'subdued'}>
          {`${a.id} · ${a.name || 'sin nombre'}`}
        </EuiHealth>
      ),
    })),
    ...(outside
      ? [
          {
            value: agentId as string,
            inputDisplay: <EuiHealth color='danger'>{`${agentId} · ${ENS_OUT_OF_GROUP_LABEL}`}</EuiHealth>,
          },
        ]
      : []),
  ];

  return (
    <>
      <EuiFormRow label="Máquina" display="columnCompressed">
        <EuiSuperSelect
          compressed
          options={options}
          valueOfSelected={agentId ? (outside ? agentId : normalizeAgentIdForScope(agentId)) : ALL}
          onChange={value => changes({ agentId: value === ALL ? undefined : value })}
        />
      </EuiFormRow>
      {outside && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut size="s" color="warning" iconType="alert" title={`${agentId} no está en un grupo ENS evaluable`}>
            <p>{describeAgentOutOfScope(agentId as string)}</p>
            <EuiButton size="s" onClick={() => changes({ agentId: undefined })}>
              Quitar la máquina y ver todas
            </EuiButton>
          </EuiCallOut>
        </>
      )}
    </>
  );
};
