// The organisation's maturity (overview and panel): controls per level, accredited and assessed, and below target.
import React from 'react';
import { EuiBasicTable, EuiButton, EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import type { ENSMaturityListEntry } from '../../../common/ens/evaluation/types';
import { MATURITY_DISTRIBUTION_ROWS, MATURITY_NOTE } from './maturity-view';

export const MaturityDistributionPanel = ({ maturity, error, onRetry }: { maturity?: ENSMaturityListEntry; error?: string; onRetry?: () => void }) => {
  const distribution = maturity?.distribution;
  const items = distribution
    ? MATURITY_DISTRIBUTION_ROWS.map(row => ({
        id: row.key,
        level: row.label,
        accredited: distribution.accredited[row.key] || 0,
        assessed: distribution.assessed[row.key] || 0,
      }))
    : [];
  return (
    <EuiPanel>
      <EuiTitle size='s'>
        <h3>Madurez de la organización</h3>
      </EuiTitle>
      <EuiText size='xs' color='subdued'>
        <p>
          {MATURITY_NOTE}
        </p>
      </EuiText>
      <EuiSpacer size='s' />
      {!distribution ? (
        <>
          <EuiText size='s' color='subdued'>
            <p>{error || 'Calculando la madurez de todos los controles…'}</p>
          </EuiText>
          {error && onRetry && (
            <EuiButton size='s' iconType='refresh' onClick={onRetry}>
              Reintentar
            </EuiButton>
          )}
        </>
      ) : (
        <>
          <EuiBasicTable
            compressed
            items={items}
            columns={[
              { field: 'level', name: 'Nivel' },
              { field: 'accredited', name: 'Acreditado por la evidencia', align: 'right' },
              { field: 'assessed', name: 'Valorado', align: 'right' },
            ]}
          />
          <EuiSpacer size='s' />
          <EuiText size='s'>
            <p>
              {distribution.applicable} controles aplicables · sin medición todavía: {distribution.accredited.notMeasured || 0} · sin valorar:{' '}
              {distribution.assessed.notAssessed || 0} · <strong>por debajo del objetivo: {distribution.belowTarget}</strong>
            </p>
          </EuiText>
        </>
      )}
    </EuiPanel>
  );
};
