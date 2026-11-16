import React from 'react';
import { EuiBasicTable, EuiBasicTableColumn, EuiButton, EuiButtonEmpty, EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import { isAgentLevelParameter } from '../../../../common/ens/configuration/agents/parameter-classes';
import { ageLabel } from '../../../../common/ens/core/date-label';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { LoadingSpinner } from '../../../platform/loading-spinner';
import { NO_PROFILE_FILTER } from './machine-filters';
import { controlTitle, parameterTitle } from './parameter-titles';
import { machines } from './profile-labels';
import type { ENSPendingParameter } from './profiles-client';
import type { ENSHostSummaryState } from './use-host-summary';

interface PendingTabProps {
  summary: ENSHostSummaryState;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
}

export const PendingTab = ({ summary, onNavigate }: PendingTabProps) => {
  if (summary.loading && !summary.data) return <LoadingSpinner message='Buscando lo que falta por decidir...' />;
  if (summary.error && !summary.data) {
    return (
      <EuiCallOut color='danger' iconType='alert' title='No se pudo leer lo pendiente'>
        <p>{summary.error}</p>
        <EuiButton color='danger' size='s' onClick={summary.retry}>
          Reintentar
        </EuiButton>
      </EuiCallOut>
    );
  }

  const data = summary.data!;
  const parameters = data.pending?.parameters || [];

  const columns: Array<EuiBasicTableColumn<ENSPendingParameter>> = [
    {
      field: 'parameterId',
      name: 'Parámetro',
      render: (_id: string, row: ENSPendingParameter) => (
        <EuiText size='s'>
          <strong>{parameterTitle(row.controlId, row.parameterId)}</strong>
          <EuiText size='xs' color='subdued'>
            {`${row.controlId} ${row.parameterId} · ${controlTitle(row.controlId)}`}
          </EuiText>
        </EuiText>
      ),
    },
    {
      field: 'evidences',
      name: 'Evidencias sin evaluar',
      width: '170px',
      render: (evidences: string[]) => <EuiText size='s'>{evidences.join(', ')}</EuiText>,
    },
    { field: 'agents', name: 'Máquinas', width: '120px', render: (agents: number) => machines(agents) },
    {
      field: 'controlId',
      name: 'Dónde se fija',
      width: '230px',
      render: (_c: string, row: ENSPendingParameter) =>
        isAgentLevelParameter(row.controlId, row.parameterId) ? (
          <EuiButtonEmpty size='s' flush='left' onClick={() => onNavigate({ view: 'profiles' })}>
            Por máquina: en un perfil
          </EuiButtonEmpty>
        ) : (
          <EuiButtonEmpty size='s' flush='left' onClick={() => onNavigate({ view: 'controls', controlId: row.controlId, parameterId: row.parameterId })}>
            Para toda la organización
          </EuiButtonEmpty>
        ),
    },
  ];

  return (
    <>
      <EuiText size='s' color='subdued'>
        <p>
          Lo que necesita una decisión. Power ENS no supone ningún valor: un parámetro sin valor deja sin evaluar las evidencias que lo usan, y el motor lo
          dice en cada veredicto.
        </p>
      </EuiText>
      <EuiSpacer size='m' />

      <EuiPanel paddingSize='m' hasBorder>
        <EuiFlexGroup alignItems='center' gutterSize='m' responsive={false}>
          <EuiFlexItem>
            <EuiTitle size='xs'>
              <h3>{data.withoutProfile ? `${machines(data.withoutProfile)} sin ningún perfil` : 'Todas las máquinas tienen algún perfil'}</h3>
            </EuiTitle>
            <EuiText size='s' color='subdued'>
              <p>
                {data.withoutProfile
                  ? 'Solo reciben los valores de la plantilla de su tipo, si la hay, y los comunes de la organización.'
                  : 'Cada máquina descrita por el motor cumple las condiciones de al menos un perfil.'}
              </p>
            </EuiText>
          </EuiFlexItem>
          {data.withoutProfile > 0 && (
            <>
              <EuiFlexItem grow={false}>
                <EuiButton size='s' onClick={() => onNavigate({ view: 'machines', machineFilter: `profile:${NO_PROFILE_FILTER}` })}>
                  Ver máquinas
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton size='s' fill onClick={() => onNavigate({ view: 'profiles', profileId: 'nuevo' })}>
                  Crear un perfil
                </EuiButton>
              </EuiFlexItem>
            </>
          )}
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size='m' />

      <EuiPanel paddingSize='m' hasBorder>
        <EuiTitle size='xs'>
          <h3>Parámetros sin valor que dejan evidencias sin evaluar</h3>
        </EuiTitle>
        <EuiText size='xs' color='subdued'>
          <p>
            {data.pending?.newest
              ? `Según los veredictos de la última pasada del motor, ${ageLabel(data.pending.newest)}.`
              : data.pending
              ? 'El motor todavía no ha escrito veredictos.'
              : 'No se pudieron leer los veredictos.'}
          </p>
        </EuiText>
        <EuiSpacer size='s' />
        <EuiBasicTable
          items={parameters}
          itemId={(row: ENSPendingParameter) => `${row.controlId}-${row.parameterId}`}
          columns={columns}
          noItemsMessage='Ningún parámetro sin valor deja evidencias sin evaluar.'
        />
      </EuiPanel>
    </>
  );
};
