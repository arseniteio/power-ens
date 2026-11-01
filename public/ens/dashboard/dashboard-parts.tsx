import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiHealth, EuiText, EuiTitle } from '@elastic/eui';
import { statusLabel } from '../../../common/ens/core/status-label';
import { ENS_STATUS_COLORS } from '../status-colors';
import { ENS_NO_RESULT_PATTERN, ENS_THEME } from '../theme-colors';
import { DASHBOARD_STATUSES } from './dashboard-model';

export interface Segment {
  key: string;
  label: string;
  count: number;
  color: string;
}

export const statusSegments = (counts: Record<string, number>): Segment[] =>
  DASHBOARD_STATUSES.map(status => ({ key: status, label: statusLabel(status), count: counts[status] || 0, color: ENS_STATUS_COLORS[status] }));

export const primaryShade = (weight: number): string => `color-mix(in srgb, ${ENS_THEME.primary} ${weight}%, ${ENS_THEME.surface})`;

export const SectionTitle = ({ children, aside }: { children: string; aside?: React.ReactNode }) => (
  <EuiFlexGroup alignItems='center' justifyContent='spaceBetween' gutterSize='s' responsive={false} wrap>
    <EuiFlexItem grow={false}>
      <EuiTitle size='xs'>
        <h3>{children}</h3>
      </EuiTitle>
    </EuiFlexItem>
    {aside && <EuiFlexItem grow={false}>{aside}</EuiFlexItem>}
  </EuiFlexGroup>
);

export const StackedBar = ({ segments, total, height = 10, empty = ENS_NO_RESULT_PATTERN }: { segments: Segment[]; total: number; height?: number; empty?: string }) => (
  <div style={{ display: 'flex', width: '100%', height, borderRadius: height / 2, overflow: 'hidden', background: empty }}>
    {segments
      .filter(segment => segment.count)
      .map(segment => (
        <div
          key={segment.key}
          title={`${segment.label}: ${segment.count}`}
          style={{ width: `${(segment.count / Math.max(total, 1)) * 100}%`, height, background: segment.color }}
        />
      ))}
  </div>
);

export const SegmentLegend = ({ segments, withCounts }: { segments: Segment[]; withCounts?: boolean }) => (
  <EuiFlexGroup gutterSize='m' wrap responsive={false}>
    {segments.map(segment => (
      <EuiFlexItem grow={false} key={segment.key}>
        <EuiHealth color={segment.color} textSize='xs'>
          {withCounts ? (
            <span>
              {`${segment.label} `}
              <strong>{segment.count}</strong>
            </span>
          ) : (
            segment.label
          )}
        </EuiHealth>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

export const IndexRing = ({ score, size = 132 }: { score?: number; size?: number }) => {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = typeof score === 'number' ? (Math.max(0, Math.min(score, 100)) / 100) * circumference : 0;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill='none' stroke={ENS_THEME.track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke={ENS_THEME.primary}
          strokeWidth={stroke}
          strokeLinecap='round'
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <EuiText>
          <span style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>{typeof score === 'number' ? `${score} %` : '—'}</span>
        </EuiText>
      </div>
    </div>
  );
};
