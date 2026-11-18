import React, { useEffect, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { getActiveENSScopeAgents } from '../../common/ens/core/scope';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';
import { describeAgentOutOfScope, isAgentInScope, normalizeAgentIdForScope } from './agent-in-scope';
import { OsIcon, osKindOf } from '../ens/configuration/groups/os-icon';
import { hostLabel } from '../ens/configuration/profiles/profile-labels';
import { ENSHostFilters, ENSHostPage, ENSHostRow, profilesClient } from '../ens/configuration/profiles/profiles-client';
import { FilterBar } from '../ens/ui/filter-bar';

const PAGE_SIZE = 10;
const SEARCH_DELAY_MS = 300;

const FAMILY_LABELS: Record<string, string> = { debian: 'Debian', rhel: 'RHEL', suse: 'SUSE', arch: 'Arch', alpine: 'Alpine', linux: 'Linux', windows: 'Windows', darwin: 'macOS' };

const familyLabel = (family: string): string => FAMILY_LABELS[family.toLowerCase()] || family;

const useDebounced = (value: string): string => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
};

// The search runs in the server, one page at a time: the browser never holds the whole fleet.
const useHostSearch = (text: string, filters: ENSHostFilters, page: number) => {
  const [result, setResult] = useState<ENSHostPage | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const key = JSON.stringify(filters);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    profilesClient
      .searchHosts({ page, size: PAGE_SIZE, text, filters }, controller.signal)
      .then(next => {
        setResult(next);
        setError(undefined);
      })
      .catch(failure => !controller.signal.aborted && setError(failure?.message || String(failure)))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
    // The serialized filters are the dependency; the object identity changes on every render.
  }, [text, key, page]);
  return { result, loading, error };
};

const MachineTable = ({ onPick }: { onPick: (agentId: string) => void }) => {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(0);
  const text = useDebounced(query);
  const filters: ENSHostFilters = { ...(family ? { family } : {}), ...(group ? { profile: group } : {}) };
  const { result, loading, error } = useHostSearch(text, filters, page);

  useEffect(() => setPage(0), [text, family, group]);

  const groupOptions = (result?.profiles || [])
    .map(profile => ({ value: profile.id, label: profile.name, count: result?.facets.profile[profile.id] || 0 }))
    .filter(option => option.count || option.value === group);

  const columns: Array<EuiBasicTableColumn<ENSHostRow>> = [
    {
      field: 'name',
      name: 'Máquina',
      render: (_name: string, host: ENSHostRow) => (
        <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
          <EuiFlexItem grow={false}>
            <OsIcon kind={osKindOf(host)} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size='s'>
              <strong>{hostLabel(host)}</strong>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    { field: 'agentId', name: 'Agente', width: '90px' },
    { field: 'distro', name: 'Sistema', render: (distro: string, host: ENSHostRow) => distro || host.os?.name || '—' },
    { field: 'profiles', name: 'Grupos', render: (profiles: ENSHostRow['profiles']) => profiles.map(profile => profile.name).join(', ') || '—' },
  ];

  return (
    <>
      <FilterBar
        allLabel='Todos los sistemas'
        options={(result?.facets.family || []).map(bucket => ({ value: bucket.value, label: familyLabel(bucket.value), count: bucket.count }))}
        active={family}
        onFilter={setFamily}
        query={query}
        onQuery={setQuery}
        placeholder='Nombre, agente o nombre de host'
        ariaLabel='Buscar máquina'
      />
      {groupOptions.length > 0 && (
        <>
          <EuiSpacer size='s' />
          <EuiFlexGroup gutterSize='xs' alignItems='center' wrap responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size='xs' color='subdued'>
                <span>Grupo:</span>
              </EuiText>
            </EuiFlexItem>
            {groupOptions.map(option => (
              <EuiFlexItem grow={false} key={option.value}>
                <EuiBadge
                  color={group === option.value ? 'primary' : 'hollow'}
                  onClick={() => setGroup(group === option.value ? '' : option.value)}
                  onClickAriaLabel={`Filtrar por el grupo ${option.label}`}
                >
                  {`${option.label} (${option.count})`}
                </EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </>
      )}
      <EuiSpacer size='s' />
      {error && <EuiCallOut size='s' color='danger' iconType='alert' title={error} />}
      <EuiBasicTable<ENSHostRow>
        compressed
        items={result?.hosts || []}
        itemId='agentId'
        columns={columns}
        loading={loading}
        noItemsMessage={loading ? 'Buscando…' : 'Sin coincidencias'}
        rowProps={(host: ENSHostRow) => ({ onClick: () => onPick(host.agentId), style: { cursor: 'pointer' } })}
        pagination={{ pageIndex: page, pageSize: PAGE_SIZE, totalItemCount: Math.min(result?.total || 0, 10000), hidePerPageOptions: true }}
        onChange={({ page: next }: any) => next && setPage(next.index)}
      />
    </>
  );
};

export const MachineSelector = () => {
  const { agentId } = useRouterSearch();
  const changes = useSetRouterSearch();
  const agents = getActiveENSScopeAgents();
  const outside = Boolean(agentId) && !isAgentInScope(agentId, agents);
  const [open, setOpen] = useState(false);
  const current = agentId ? agents.find(agent => agent.id === normalizeAgentIdForScope(agentId)) : undefined;

  const pick = (id?: string) => {
    changes({ agentId: id });
    setOpen(false);
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
              {current ? `${current.name || current.id} (${current.id})` : agentId}
            </EuiBadge>
          ) : (
            <EuiText size='s' color='subdued'>
              <span>Todas</span>
            </EuiText>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {open ? (
            <EuiButtonEmpty size='s' iconType='arrowUp' onClick={() => setOpen(false)}>
              Cerrar
            </EuiButtonEmpty>
          ) : (
            <EuiButton size='s' iconType='search' onClick={() => setOpen(true)}>
              Seleccionar máquina
            </EuiButton>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
      {open && (
        <>
          <EuiSpacer size='s' />
          <MachineTable onPick={pick} />
        </>
      )}
      {outside && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut size='s' color='warning' iconType='alert' title={`${agentId} fuera de los grupos ENS evaluables`}>
            <p>{describeAgentOutOfScope(agentId as string)}</p>
          </EuiCallOut>
        </>
      )}
    </EuiPanel>
  );
};
