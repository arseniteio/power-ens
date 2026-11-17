import React, { useMemo, useState } from 'react';
import { EuiBadge, EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiHealth, EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';
import { getActiveENSScopeAgents } from '../../common/ens/core/scope';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';
import { describeAgentOutOfScope, isAgentInScope, normalizeAgentIdForScope } from './agent-in-scope';
import { ENSOsKind, OsIcon, osKindOf } from '../ens/configuration/groups/os-icon';
import { FilterBar } from '../ens/ui/filter-bar';

const SHOWN = 12;

const KINDS: Array<{ value: ENSOsKind | 'manager'; label: string }> = [
  { value: 'linux', label: 'Linux' },
  { value: 'windows', label: 'Windows' },
  { value: 'manager', label: 'Manager' },
];

export const MachineSelector = () => {
  const { agentId } = useRouterSearch();
  const changes = useSetRouterSearch();
  const agents = getActiveENSScopeAgents();
  const outside = Boolean(agentId) && !isAgentInScope(agentId, agents);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');

  const kindOf = (agent: (typeof agents)[number]): string => (agent.isManager ? 'manager' : osKindOf({ os: agent.os }));
  const current = agentId ? agents.find(agent => agent.id === normalizeAgentIdForScope(agentId)) : undefined;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter(
      agent =>
        (!kind || kindOf(agent) === kind) &&
        (!q || agent.id.includes(q) || (agent.name || '').toLowerCase().includes(q) || (agent.os?.name || '').toLowerCase().includes(q))
    );
  }, [agents, query, kind]);

  const searching = Boolean(query.trim() || kind);
  const pick = (id?: string) => {
    changes({ agentId: id });
    setQuery('');
    setKind('');
  };

  return (
    <EuiPanel hasBorder paddingSize='s'>
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiText size='s'>
            <strong>Máquina:</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {agentId ? (
            <EuiBadge color='primary' iconType='cross' iconSide='right' iconOnClick={() => pick(undefined)} iconOnClickAriaLabel='Ver todas las máquinas'>
              {current ? `${current.name || 'sin nombre'} (${current.id})` : agentId}
            </EuiBadge>
          ) : (
            <EuiText size='s' color='subdued'>{`todas (${agents.length})`}</EuiText>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='s' />
      <FilterBar
        allLabel='Todas'
        options={KINDS.map(item => ({ value: item.value, label: item.label, count: agents.filter(agent => kindOf(agent) === item.value).length })).filter(item => item.count)}
        active={kind}
        onFilter={setKind}
        query={query}
        onQuery={setQuery}
        placeholder='Buscar máquina por nombre, número de agente o sistema'
        ariaLabel='Buscar máquina'
      />
      {searching && (
        <>
          <EuiSpacer size='s' />
          <EuiFlexGroup gutterSize='s' wrap responsive={false}>
            {matches.slice(0, SHOWN).map(agent => (
              <EuiFlexItem grow={false} key={agent.id} style={{ minWidth: 220 }}>
                <EuiPanel hasBorder paddingSize='s' onClick={() => pick(agent.id)} aria-label={`Ver ${agent.name || agent.id}`}>
                  <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
                    <EuiFlexItem grow={false}>
                      <OsIcon kind={osKindOf({ os: agent.os })} />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size='s'>
                        <strong>{agent.name || 'sin nombre'}</strong>
                      </EuiText>
                      <EuiText size='xs' color='subdued'>
                        {agent.id}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiHealth color={agent.status === 'active' ? 'success' : 'subdued'} />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
          <EuiSpacer size='xs' />
          <EuiText size='xs' color='subdued'>
            <p>{matches.length > SHOWN ? `${SHOWN} de ${matches.length}. Escribe para acotar.` : matches.length ? `${matches.length} máquinas` : 'Ninguna máquina coincide.'}</p>
          </EuiText>
        </>
      )}
      {outside && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut size='s' color='warning' iconType='alert' title={`${agentId} no está en un grupo ENS evaluable`}>
            <p>{describeAgentOutOfScope(agentId as string)}</p>
          </EuiCallOut>
        </>
      )}
    </EuiPanel>
  );
};
