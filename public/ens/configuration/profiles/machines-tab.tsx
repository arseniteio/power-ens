import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiBadge,
  EuiCallOut,
  EuiFacetButton,
  EuiFacetGroup,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextColor,
  EuiTitle,
} from '@elastic/eui';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { NO_PROFILE_FILTER, parseMachineFilter } from './machine-filters';
import { MachineFlyout } from './machine-flyout';
import { useProfileChanges } from './profile-changes';
import { hostLabel, roleLabel } from './profile-labels';
import { ProfileTags } from './profile-tag';
import { ENSFacetBucket, ENSHostFilters, ENSHostPage, ENSHostRow, profilesClient } from './profiles-client';

interface MachinesTabProps {
  target: ENSConfigurationTarget;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
}

const PAGE_SIZES = [25, 50, 100];
const FACET_LIMIT = 8;

const FILTER_NAMES: Record<keyof ENSHostFilters, string> = {
  profile: 'Perfil',
  role: 'Función',
  distro: 'Distribución',
  service: 'Servicio',
  group: 'Grupo',
};

const Facet = ({
  title,
  buckets,
  selected,
  label,
  onToggle,
}: {
  title: string;
  buckets: ENSFacetBucket[];
  selected?: string;
  label?: (value: string) => string;
  onToggle: (value: string) => void;
}) => {
  const [all, setAll] = useState(false);
  const shown = all ? buckets : buckets.slice(0, FACET_LIMIT);
  if (!buckets.length) return null;
  return (
    <>
      <EuiTitle size='xxxs'>
        <h4>{title}</h4>
      </EuiTitle>
      <EuiSpacer size='xs' />
      <EuiFacetGroup gutterSize='none'>
        {shown.map(bucket => (
          <EuiFacetButton
            key={bucket.value}
            quantity={bucket.count}
            isSelected={selected === bucket.value}
            onClick={() => onToggle(bucket.value)}
          >
            {label ? label(bucket.value) : bucket.value}
          </EuiFacetButton>
        ))}
      </EuiFacetGroup>
      {buckets.length > FACET_LIMIT && (
        <EuiLink onClick={() => setAll(!all)}>
          <EuiText size='xs'>
            <span>{all ? 'Ver menos' : `Ver los ${buckets.length}`}</span>
          </EuiText>
        </EuiLink>
      )}
      <EuiSpacer size='m' />
    </>
  );
};

export const MachinesTab = ({ target, onNavigate }: MachinesTabProps) => {
  const { savedAt } = useProfileChanges();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ENSHostFilters>(() => parseMachineFilter(target.machineFilter));
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<ENSHostPage | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const controller = useRef<AbortController>();

  useEffect(() => {
    setFilters(parseMachineFilter(target.machineFilter));
    setPageIndex(0);
  }, [target.machineFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text);
      setPageIndex(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    profilesClient
      .searchHosts({ page: pageIndex, size: pageSize, text: query, filters }, current.signal)
      .then(page => {
        setResult(page);
        setError(undefined);
      })
      .catch(failure => {
        if (!current.signal.aborted) setError(failure?.message || String(failure));
      })
      .finally(() => {
        if (!current.signal.aborted) setLoading(false);
      });
    return () => current.abort();
  }, [pageIndex, pageSize, query, filters, savedAt]);

  const toggle = (key: keyof ENSHostFilters, value: string) => {
    setFilters(previous => {
      const next = { ...previous };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
    setPageIndex(0);
  };

  const profileNames = useMemo(() => Object.fromEntries((result?.profiles || []).map(p => [p.id, p])), [result]);
  const profileBuckets: ENSFacetBucket[] = useMemo(() => {
    const counts = result?.facets.profile || {};
    const named = (result?.profiles || []).map(p => ({ value: p.id, count: counts[p.id] || 0 })).filter(b => b.count > 0 || filters.profile === b.value);
    named.sort((a, b) => b.count - a.count);
    return counts[NO_PROFILE_FILTER] ? [...named, { value: NO_PROFILE_FILTER, count: counts[NO_PROFILE_FILTER] }] : named;
  }, [result, filters.profile]);

  const filterLabel = (key: keyof ENSHostFilters, value: string): string => {
    if (key === 'profile') return value === NO_PROFILE_FILTER ? 'Sin perfil' : profileNames[value]?.name || value;
    if (key === 'role') return roleLabel(value);
    return value;
  };

  const columns: Array<EuiBasicTableColumn<ENSHostRow>> = [
    {
      field: 'name',
      name: 'Máquina',
      render: (_name: string, row: ENSHostRow) => (
        <EuiText size='s'>
          <EuiLink onClick={() => onNavigate({ view: 'machines', hostId: row.agentId, machineFilter: target.machineFilter })}>{hostLabel(row)}</EuiLink>{' '}
          <EuiTextColor color='subdued'>
            <small>{row.agentId}</small>
          </EuiTextColor>
        </EuiText>
      ),
    },
    { field: 'profiles', name: 'Perfiles', render: (profiles: ENSHostRow['profiles']) => <ProfileTags profiles={profiles} /> },
    { field: 'distro', name: 'Distribución', width: '140px', render: (distro: string) => distro || <EuiText size='xs' color='subdued'>Sin deducir</EuiText> },
    { field: 'role', name: 'Función', width: '150px', render: (role: string) => roleLabel(role) },
    {
      field: 'services',
      name: 'Servicios',
      width: '200px',
      render: (services: string[]) =>
        services.length ? (
          <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
            {services.map(service => (
              <EuiFlexItem grow={false} key={service}>
                <EuiBadge color='hollow'>{service}</EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        ) : (
          <EuiText size='xs' color='subdued'>
            Ninguno
          </EuiText>
        ),
    },
  ];

  const facets = result?.facets;
  const total = result?.total || 0;

  return (
    <>
      <EuiFlexGroup gutterSize='l' alignItems='flexStart'>
        <EuiFlexItem grow={false} style={{ width: 240 }}>
          <EuiPanel paddingSize='m' hasBorder>
            {facets ? (
              <>
                <Facet title='Perfil' buckets={profileBuckets} selected={filters.profile} label={value => filterLabel('profile', value)} onToggle={v => toggle('profile', v)} />
                <Facet title='Función' buckets={facets.role} selected={filters.role} label={roleLabel} onToggle={v => toggle('role', v)} />
                <Facet title='Distribución' buckets={facets.distro} selected={filters.distro} onToggle={v => toggle('distro', v)} />
                <Facet title='Servicio' buckets={facets.service} selected={filters.service} onToggle={v => toggle('service', v)} />
                <Facet title='Grupo de Wazuh' buckets={facets.group} selected={filters.group} onToggle={v => toggle('group', v)} />
              </>
            ) : (
              <EuiText size='s' color='subdued'>
                <p>Cargando filtros...</p>
              </EuiText>
            )}
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFieldSearch
            fullWidth
            placeholder='Buscar por nombre, hostname o número de agente'
            value={text}
            onChange={event => setText(event.target.value)}
            isLoading={loading}
            aria-label='Buscar máquinas'
          />
          <EuiSpacer size='s' />
          {Object.keys(filters).length > 0 && (
            <>
              <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
                {(Object.keys(filters) as Array<keyof ENSHostFilters>).map(key => (
                  <EuiFlexItem grow={false} key={key}>
                    <EuiBadge
                      color='primary'
                      iconType='cross'
                      iconSide='right'
                      iconOnClick={() => toggle(key, filters[key]!)}
                      iconOnClickAriaLabel={`Quitar el filtro ${FILTER_NAMES[key]}`}
                    >
                      {`${FILTER_NAMES[key]}: ${filterLabel(key, filters[key]!)}`}
                    </EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
              <EuiSpacer size='s' />
            </>
          )}
          {error && (
            <>
              <EuiCallOut size='s' color='danger' iconType='alert' title={error} />
              <EuiSpacer size='s' />
            </>
          )}
          <EuiBasicTable
            items={result?.hosts || []}
            itemId='agentId'
            columns={columns}
            loading={loading}
            noItemsMessage={loading ? 'Cargando máquinas...' : 'Ninguna máquina cumple estos filtros.'}
            pagination={{ pageIndex, pageSize, totalItemCount: Math.min(total, 10000), pageSizeOptions: PAGE_SIZES }}
            onChange={({ page }: any) => {
              if (!page) return;
              setPageIndex(page.size !== pageSize ? 0 : page.index);
              setPageSize(page.size);
            }}
          />
          <EuiSpacer size='s' />
          <EuiText size='xs' color='subdued'>
            <p>
              {`${total.toLocaleString('es-ES')} ${total === 1 ? 'máquina' : 'máquinas'}`}
              {total > 10000 ? '. La tabla recorre las 10.000 primeras; usa la búsqueda o los filtros para el resto.' : ''}
            </p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      {target.hostId && <MachineFlyout agentId={target.hostId} onClose={() => onNavigate({ view: 'machines', machineFilter: target.machineFilter })} onNavigate={onNavigate} />}
    </>
  );
};

