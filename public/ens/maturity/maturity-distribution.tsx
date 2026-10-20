// The organisation's maturity (overview and panel): controls per level, accredited and assessed, and below target.
import React from 'react';
import { EuiBasicTable, EuiLink, EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import type { ENSMaturityListEntry } from '../../../common/ens/evaluation/types';
import { MATURITY_DISTRIBUTION_ROWS, MATURITY_GUIDE_URL, MATURITY_NOTE } from './maturity-view';

export const MaturityDistributionPanel = ({ maturity, error }: { maturity?: ENSMaturityListEntry; error?: string }) => {
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
          {MATURITY_NOTE}{' '}
          <EuiLink href={MATURITY_GUIDE_URL} target='_blank' external>
            Guía 10
          </EuiLink>
        </p>
      </EuiText>
      <EuiSpacer size='s' />
      {!distribution ? (
        <EuiText size='s' color='subdued'>
          <p>{error || 'Calculando la madurez de todos los controles…'}</p>
        </EuiText>
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
