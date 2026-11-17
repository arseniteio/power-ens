import React from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { ageLabel, dateTimeLabel } from '../../../../common/ens/core/date-label';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { LoadingSpinner } from '../../../platform/loading-spinner';
import { NO_PROFILE_FILTER } from './machine-filters';
import { useProfileChanges } from './profile-changes';
import { layerLabel, machines, roleLabel } from './profile-labels';
import { parameterTitle } from './parameter-titles';
import type { ENSFacetBucket } from './profiles-client';
import type { ENSHostSummaryState } from './use-host-summary';

interface StatusTabProps {
  summary: ENSHostSummaryState;
  configuration: ENSConfigurationVersion;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <EuiPanel paddingSize='m' hasBorder>
    <EuiTitle size='xs'>
      <h3>{title}</h3>
    </EuiTitle>
    <EuiSpacer size='s' />
    {children}
  </EuiPanel>
);

const Row = ({ title, detail, action }: { title: React.ReactNode; detail?: React.ReactNode; action?: React.ReactNode }) => (
  <>
    <EuiFlexGroup alignItems='center' gutterSize='m' responsive={false}>
      <EuiFlexItem>
        <EuiText size='s'>
          <strong>{title}</strong>
        </EuiText>
        {detail && (
          <EuiText size='xs' color='subdued'>
            {detail}
          </EuiText>
        )}
      </EuiFlexItem>
      {action && <EuiFlexItem grow={false}>{action}</EuiFlexItem>}
    </EuiFlexGroup>
    <EuiHorizontalRule margin='s' />
  </>
);

const Share = ({ label, count, total, onClick }: { label: string; count: number; total: number; onClick: () => void }) => (
  <>
    <EuiFlexGroup gutterSize='s' justifyContent='spaceBetween' responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiButtonEmpty size='xs' flush='left' onClick={onClick}>
          {label}
        </EuiButtonEmpty>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText size='xs' color='subdued'>
          {machines(count)}
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiProgress value={count} max={Math.max(total, 1)} size='s' color='primary' />
    <EuiSpacer size='s' />
  </>
);

const ClickableStat = ({ title, description, color, onClick }: { title: string; description: string; color?: string; onClick: () => void }) => (
  <EuiPanel paddingSize='m' hasBorder onClick={onClick}>
    <EuiStat title={title} description={description} titleColor={color || 'default'} titleSize='m' reverse />
  </EuiPanel>
);

const Coverage = ({ buckets, total, field, label, onNavigate }: { buckets: ENSFacetBucket[]; total: number; field: string; label: (value: string) => string; onNavigate: StatusTabProps['onNavigate'] }) =>
  buckets.length ? (
    <>
      {buckets.slice(0, 8).map(bucket => (
        <Share key={bucket.value} label={label(bucket.value)} count={bucket.count} total={total} onClick={() => onNavigate({ view: 'machines', machineFilter: `${field}:${bucket.value}` })} />
      ))}
    </>
  ) : (
    <EuiText size='s' color='subdued'>
      <p>Sin datos todavía.</p>
    </EuiText>
  );

export const StatusTab = ({ summary, configuration, onNavigate }: StatusTabProps) => {
  const { working } = useProfileChanges();

  if (summary.loading && !summary.data) return <LoadingSpinner message='Leyendo lo que el motor sabe de cada máquina...' />;
  if (summary.error && !summary.data) {
    return (
      <EuiCallOut color='danger' iconType='alert' title='No se pudo leer el estado de la configuración'>
        <p>{summary.error}</p>
        <EuiButton color='danger' size='s' onClick={summary.retry}>
          Reintentar
        </EuiButton>
      </EuiCallOut>
    );
  }

  const data = summary.data!;
  const pending = data.pending;
  const urgentParameters = pending?.parameters.slice(0, 4) || [];

  const changes = [
    ...working
      .filter(entry => entry.updatedAt && entry.origin !== 'builtin')
      .map(entry => ({ date: entry.updatedAt!, user: entry.updatedBy || 'desconocido', text: `Perfil «${entry.profile.name}» guardado` })),
    ...(configuration.auditTrail || []).map(entry => ({ date: entry.date, user: entry.user, text: entry.summary })),
  ]
    .filter(entry => entry.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  if (data.total === 0) {
    return (
      <EuiCallOut color='primary' iconType='iInCircle' title='El motor todavía no ha descrito ninguna máquina'>
        <p>
          En cada pasada, el motor deduce la distribución, la función y los servicios de cada máquina a partir del inventario de Wazuh y los deja en el
          índice oscompliance-host-profile. Hace falta la versión del motor que incluye los perfiles.
        </p>
      </EuiCallOut>
    );
  }

  return (
    <>
      <EuiFlexGrid columns={4} gutterSize='m'>
        <EuiFlexItem>
          <ClickableStat title={data.total.toLocaleString('es-ES')} description='Máquinas descritas por el motor' onClick={() => onNavigate({ view: 'machines' })} />
        </EuiFlexItem>
        <EuiFlexItem>
          <ClickableStat
            title={data.withoutProfile.toLocaleString('es-ES')}
            description='Sin ningún perfil'
            color={data.withoutProfile ? 'danger' : 'default'}
            onClick={() => onNavigate({ view: 'machines', machineFilter: `profile:${NO_PROFILE_FILTER}` })}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <ClickableStat
            title={pending ? pending.agents.toLocaleString('es-ES') : '—'}
            description='Con evidencias sin evaluar'
            color={pending?.agents ? 'accent' : 'default'}
            onClick={() => onNavigate({ view: 'pending' })}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <ClickableStat
            title={pending ? pending.parameters.length.toLocaleString('es-ES') : '—'}
            description='Parámetros sin valor'
            onClick={() => onNavigate({ view: 'pending' })}
          />
        </EuiFlexItem>
      </EuiFlexGrid>

      <EuiSpacer size='s' />
      <EuiText size='xs' color='subdued'>
        <p>
          {`Datos de la última pasada del motor${data.hostsUpdatedAt ? `, ${ageLabel(data.hostsUpdatedAt)}` : ''}. Los cambios guardados se aplican en la siguiente.`}
        </p>
      </EuiText>
      <EuiSpacer size='m' />

      <EuiFlexGroup gutterSize='m' alignItems='flexStart'>
        <EuiFlexItem grow={2}>
          <Section title='Pendiente de configurar'>
            {data.withoutProfile > 0 && (
              <Row
                title={`${machines(data.withoutProfile)} sin ningún perfil`}
                detail='Solo reciben la plantilla de su tipo, si la hay. Revisa las condiciones de los perfiles o crea uno que las incluya.'
                action={
                  <EuiButton size='s' onClick={() => onNavigate({ view: 'machines', machineFilter: `profile:${NO_PROFILE_FILTER}` })}>
                    Ver máquinas
                  </EuiButton>
                }
              />
            )}
            {urgentParameters.map(parameter => (
              <Row
                key={`${parameter.controlId}-${parameter.parameterId}`}
                title={parameterTitle(parameter.controlId, parameter.parameterId)}
                detail={`${parameter.controlId} ${parameter.parameterId} · deja ${parameter.evidences.length === 1 ? '1 evidencia' : `${parameter.evidences.length} evidencias`} sin evaluar en ${machines(parameter.agents)}`}
                action={
                  <EuiButton size='s' onClick={() => onNavigate({ view: 'pending' })}>
                    Resolver
                  </EuiButton>
                }
              />
            ))}
            {!data.withoutProfile && !urgentParameters.length && (
              <EuiText size='s' color='subdued'>
                <p>
                  {pending
                    ? 'Todas las máquinas tienen perfil y ningún parámetro sin valor deja evidencias sin evaluar.'
                    : 'Todas las máquinas tienen algún perfil. No se pudieron leer los veredictos para saber si falta algún parámetro.'}
                </p>
              </EuiText>
            )}
          </Section>
        </EuiFlexItem>
        <EuiFlexItem grow={1}>
          <Section title='Cobertura por función'>
            <Coverage buckets={data.roles} total={data.total} field='role' label={roleLabel} onNavigate={onNavigate} />
          </Section>
          <EuiSpacer size='m' />
          <Section title='Cobertura por distribución'>
            <Coverage buckets={data.distros} total={data.total} field='distro' label={value => value} onNavigate={onNavigate} />
          </Section>
          <EuiSpacer size='m' />
          <Section title='Cobertura por perfil'>
            {data.profiles.length ? (
              data.profiles
                .slice()
                .sort((a, b) => b.count - a.count)
                .map(profile => (
                  <Share
                    key={profile.id}
                    label={`${profile.name} · ${layerLabel(profile.layer)}`}
                    count={profile.count}
                    total={data.total}
                    onClick={() => onNavigate({ view: 'machines', machineFilter: `profile:${profile.id}` })}
                  />
                ))
            ) : (
              <EuiText size='s' color='subdued'>
                <p>No hay perfiles.</p>
              </EuiText>
            )}
          </Section>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size='m' />

      <Section title='Últimos cambios'>
        {changes.length ? (
          changes.map((change, index) => <Row key={`${change.date}-${index}`} title={change.text} detail={`${change.user} · ${dateTimeLabel(change.date)}`} />)
        ) : (
          <EuiText size='s' color='subdued'>
            <p>Todavía no se ha guardado ningún cambio.</p>
          </EuiText>
        )}
      </Section>
    </>
  );
};
