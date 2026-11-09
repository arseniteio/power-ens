import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiHealth, EuiText } from '@elastic/eui';

import { ENS_OUT_OF_GROUP_LABEL } from '../../common/ens/core/scope/evaluable-groups';
import { statusSegments, type Segment } from '../ens/dashboard/dashboard-parts';
import { controlStatusCounts, donutArcs } from './compliance-status-chart';
import { useControlSummary, type ControlSummary } from './use-control-summary';

const SIZE = 180;
const STROKE = 30;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const StatusDonut = ({ segments }: { segments: Segment[] }) => (
  <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }} role='img' aria-label='Controles ENS por estado'>
    {donutArcs(segments, CIRCUMFERENCE).map(({ segment, length, offset }) => (
      <circle
        key={segment.key}
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill='none'
        stroke={segment.color}
        strokeWidth={STROKE}
        strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
        strokeDashoffset={offset}
      />
    ))}
  </svg>
);

const StatusLegend = ({ segments }: { segments: Segment[] }) => (
  <EuiFlexGroup direction='column' gutterSize='s' responsive={false}>
    {segments
      .filter(segment => segment.count > 0)
      .map(segment => (
        <EuiFlexItem key={segment.key} grow={false}>
          <EuiHealth color={segment.color}>{`${segment.label} (${segment.count})`}</EuiHealth>
        </EuiFlexItem>
      ))}
  </EuiFlexGroup>
);

const StatusChart = ({ summary }: { summary: ControlSummary }) => {
  const segments = statusSegments(controlStatusCounts(summary));

  return (
    <EuiFlexGroup alignItems='center' gutterSize='l' responsive={false}>
      <EuiFlexItem grow={false}>
        <StatusDonut segments={segments} />
      </EuiFlexItem>
      <EuiFlexItem>
        <StatusLegend segments={segments} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const Message = ({ children }: { children: string }) => (
  <EuiFlexGroup alignItems='center' justifyContent='center' style={{ minHeight: SIZE }} responsive={false}>
    <EuiFlexItem grow={false}>
      <EuiText size='s' color='subdued'>{children}</EuiText>
    </EuiFlexItem>
  </EuiFlexGroup>
);

export const ComplianceEnsView = ({ agentId }: { agentId: string }) => {
  const state = useControlSummary(agentId);

  if (state.kind === 'loading') return <Message>Cargando…</Message>;
  if (state.kind === 'outOfGroup') return <Message>{ENS_OUT_OF_GROUP_LABEL}</Message>;
  if (state.kind === 'unavailable') return <Message>Sin datos ahora mismo.</Message>;
  if (state.summary.totalControls === 0) return <Message>Ningún control aplica todavía.</Message>;
  return <StatusChart summary={state.summary} />;
};
