import React, { useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHealth,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { getActiveENSScopeAgents } from '../../common/ens/core/scope';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';
import { describeAgentOutOfScope, isAgentInScope, normalizeAgentIdForScope } from './agent-in-scope';
import { OsIcon, osKindOf } from '../ens/configuration/groups/os-icon';

const LIST_LIMIT = 200;

export const MachineSelector = () => {
  const { agentId } = useRouterSearch();
  const changes = useSetRouterSearch();
  const agents = getActiveENSScopeAgents();
  const outside = Boolean(agentId) && !isAgentInScope(agentId, agents);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const current = agentId ? agents.find(agent => agent.id === normalizeAgentIdForScope(agentId)) : undefined;
  const label = !agentId ? 'Todas las máquinas' : current ? `${current.name || 'sin nombre'} (${current.id})` : agentId;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter(agent => !q || agent.id.includes(q) || (agent.name || '').toLowerCase().includes(q) || (agent.os?.name || '').toLowerCase().includes(q));
  }, [agents, query]);

  const pick = (id?: string) => {
    changes({ agentId: id });
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <EuiFlexGroup gutterSize='s' alignItems='center' justifyContent='flexEnd' responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size='s' color='subdued'>
            Máquina:
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton size='s' iconType='search' iconSide='right' onClick={() => setOpen(true)}>
            {label}
          </EuiButton>
        </EuiFlexItem>
        {agentId && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='s' onClick={() => pick(undefined)}>
              Ver todas
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {outside && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut size='s' color='warning' iconType='alert' title={`${agentId} no está en un grupo ENS evaluable`}>
            <p>{describeAgentOutOfScope(agentId as string)}</p>
          </EuiCallOut>
        </>
      )}

      {open && (
        <EuiFlyout size='s' ownFocus onClose={() => setOpen(false)} aria-labelledby='ens-machine-picker-title'>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size='s'>
              <h2 id='ens-machine-picker-title'>Elegir máquina</h2>
            </EuiTitle>
            <EuiSpacer size='s' />
            <EuiFieldSearch fullWidth autoFocus placeholder='Nombre, número de agente o sistema' value={query} onChange={event => setQuery(event.target.value)} />
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiPanel hasBorder paddingSize='s' color={!agentId ? 'primary' : 'plain'} onClick={() => pick(undefined)} aria-label='Ver todas las máquinas'>
              <EuiText size='s'>
                <strong>Todas las máquinas</strong>
              </EuiText>
              <EuiText size='xs' color='subdued'>{`${agents.length} en el alcance`}</EuiText>
            </EuiPanel>
            <EuiSpacer size='s' />
            {matches.slice(0, LIST_LIMIT).map(agent => (
              <React.Fragment key={agent.id}>
                <EuiPanel
                  hasBorder
                  paddingSize='s'
                  color={current?.id === agent.id ? 'primary' : 'plain'}
                  onClick={() => pick(agent.id)}
                  aria-label={`Ver ${agent.name || agent.id}`}
                >
                  <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
                    <EuiFlexItem grow={false}>
                      <OsIcon kind={osKindOf({ os: { name: agent.os?.name, platform: agent.os?.platform } })} />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size='s'>
                        <strong>{agent.name || 'sin nombre'}</strong>
                      </EuiText>
                      <EuiText size='xs' color='subdued'>
                        {[agent.id, agent.os?.name].filter(Boolean).join(' · ')}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiHealth color={agent.status === 'active' ? 'success' : 'subdued'}>{agent.status === 'active' ? 'Activa' : 'Sin conexión'}</EuiHealth>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
                <EuiSpacer size='xs' />
              </React.Fragment>
            ))}
            {matches.length > LIST_LIMIT && (
              <EuiText size='xs' color='subdued'>
                <p>{`Se muestran ${LIST_LIMIT} de ${matches.length}. Escribe para acotar.`}</p>
              </EuiText>
            )}
            {!matches.length && (
              <EuiText size='s' color='subdued'>
                <p>Ninguna máquina coincide.</p>
              </EuiText>
            )}
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
};
