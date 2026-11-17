import React from 'react';
import { EuiBasicTable, EuiButtonEmpty, EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiLink, EuiPanel, EuiSpacer, EuiStat, EuiText, EuiTitle } from '@elastic/eui';
import {
  ENS_MATURITY_LABELS,
  ENS_MATURITY_MAX,
  ENS_MATURITY_NOTE,
  ENSOrganizationMaturity,
  maturityLabel,
} from '../../../common/ens/maturity/types';

interface LevelRow {
  level: number;
  accredited: number | string;
  assessed: number;
}

const rowsOf = (data: ENSOrganizationMaturity): LevelRow[] =>
  Array.from({ length: ENS_MATURITY_MAX + 1 }, (_, level) => ({
    level,
    accredited: level > 2 ? '—' : data.summary?.accredited_counts?.[level] ?? 0,
    assessed: data.summary?.assessed_counts?.[level] ?? 0,
  }));

const footerOf = (data: ENSOrganizationMaturity): string => {
  const s = data.summary || {};
  return [
    `${s.applicable ?? 0} medidas aplicables`,
    `sin medición todavía: ${s.unmeasured ?? 0}`,
    `sin valorar: ${s.unassessed ?? 0}`,
    `por debajo del objetivo: ${s.below_target?.length ?? 0}`,
  ].join(' · ');
};

export const OrganizationMaturityPanel = ({
  data,
  error,
  loading,
  onOpen,
  onExport,
}: {
  data?: ENSOrganizationMaturity;
  error?: string;
  loading: boolean;
  onOpen: (controlId: string) => void;
  onExport?: () => void;
}) => {
  const incoherent = Object.entries(data?.measures || {})
    .filter(([, m]) => m.incoherent)
    .map(([id]) => id)
    .sort();

  return (
    <EuiPanel hasBorder>
      <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false}>
        <EuiFlexItem>
          <EuiTitle size='xs'>
            <h3>Madurez de la organización</h3>
          </EuiTitle>
        </EuiFlexItem>
        {onExport && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='s' iconType='download' onClick={onExport}>
              Exportar métricas (CSV)
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size='s' />
      {error && <EuiCallOut size='s' color='danger' iconType='alert' title={error} />}
      {!error && !loading && !data?.summary && (
        <EuiText size='s' color='subdued'>
          <p>El motor todavía no ha escrito la madurez. Aparece tras su siguiente pasada.</p>
        </EuiText>
      )}
      {data?.summary && (
        <>
          <EuiFlexGroup gutterSize='m' responsive={false}>
            <EuiFlexItem>
              <EuiStat title={maturityLabel(data.summary.global_accredited)} description='Acreditado por la evidencia' titleSize='s' />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiStat title={maturityLabel(data.summary.global_assessed)} description='Valorado' titleSize='s' />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size='s' />
          <EuiBasicTable<LevelRow>
            compressed
            items={rowsOf(data)}
            noItemsMessage='No hay datos.'
            columns={[
              { field: 'level', name: 'Nivel', render: (level: LevelRow['level']) => `L${level} ${ENS_MATURITY_LABELS[level]}` },
              { field: 'accredited', name: 'Acreditado por la evidencia', align: 'right', width: '170px' },
              { field: 'assessed', name: 'Valorado', align: 'right', width: '90px' },
            ]}
          />
          <EuiSpacer size='s' />
          <EuiText size='xs' color='subdued'>
            <p>{footerOf(data)}</p>
          </EuiText>
          {data.summary.below_target?.length ? (
            <EuiText size='xs'>
              <p>
                Por debajo del objetivo:{' '}
                {data.summary.below_target.map((id, index) => (
                  <React.Fragment key={id}>
                    {index > 0 && ', '}
                    <EuiLink onClick={() => onOpen(id)}>{id}</EuiLink>
                  </React.Fragment>
                ))}
              </p>
            </EuiText>
          ) : null}
          {incoherent.length > 0 && (
            <>
              <EuiSpacer size='s' />
              <EuiCallOut size='s' color='warning' iconType='alert' title={`Valoración por encima de lo que Wazuh acredita: ${incoherent.join(', ')}`}>
                <EuiText size='xs'>
                  <p>Valorados en L3 o más, pero Wazuh no ve la práctica funcionando 27 de los últimos 30 días. Abre el control para revisarlo.</p>
                </EuiText>
              </EuiCallOut>
            </>
          )}
          <EuiSpacer size='s' />
          <EuiText size='xs' color='subdued'>
            <p>{ENS_MATURITY_NOTE}</p>
          </EuiText>
        </>
      )}
    </EuiPanel>
  );
};
