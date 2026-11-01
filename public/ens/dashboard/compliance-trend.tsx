import React from 'react';
import { EuiLoadingSpinner, EuiText, EuiToolTip } from '@elastic/eui';
import { ENS_THEME } from '../theme-colors';
import type { TrendPoint } from './dashboard-model';

const HEIGHT = 200;
const GRID = [100, 75, 50, 25, 0];
const AXIS_WIDTH = 48;

const xOf = (index: number, total: number): number => (total === 1 ? 50 : (index * 100) / (total - 1));
const yOf = (score: number): number => 100 - Math.max(0, Math.min(score, 100));

export const ComplianceTrend = ({ points, pending }: { points: TrendPoint[]; pending: boolean }) => {
  const scored = points.map((point, index) => ({ ...point, x: xOf(index, points.length) })).filter(point => typeof point.score === 'number');
  const line = scored.map(point => `${point.x},${yOf(point.score as number)}`).join(' ');
  const area = scored.length > 1 ? `${scored[0].x},100 ${line} ${scored[scored.length - 1].x},100` : '';
  const labelEvery = Math.ceil(points.length / 8);

  return (
    <div style={{ position: 'relative', paddingLeft: AXIS_WIDTH, paddingTop: 8 }}>
      <div style={{ position: 'relative', height: HEIGHT }}>
        {GRID.map(value => (
          <EuiText key={value} size='xs' color='subdued' style={{ position: 'absolute', left: -AXIS_WIDTH, width: AXIS_WIDTH - 8, top: `${yOf(value)}%`, transform: 'translateY(-50%)', textAlign: 'right', whiteSpace: 'nowrap' }}>
            <span>{`${value} %`}</span>
          </EuiText>
        ))}
        <svg width='100%' height={HEIGHT} viewBox='0 0 100 100' preserveAspectRatio='none' style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {GRID.map(value => (
            <line
              key={value}
              x1='0'
              x2='100'
              y1={yOf(value)}
              y2={yOf(value)}
              stroke={ENS_THEME.border}
              strokeDasharray={value === 0 ? undefined : '3 3'}
              vectorEffect='non-scaling-stroke'
            />
          ))}
          {area && <polygon points={area} fill={ENS_THEME.primary} fillOpacity={0.12} />}
          {scored.length > 1 && (
            <polyline points={line} fill='none' stroke={ENS_THEME.primary} strokeWidth={2} strokeLinejoin='round' vectorEffect='non-scaling-stroke' />
          )}
        </svg>
        {scored.map(point => (
          <EuiToolTip key={point.label} content={`${point.label}: ${point.score} %`}>
            <div
              style={{
                position: 'absolute',
                left: `${point.x}%`,
                top: `${yOf(point.score as number)}%`,
                width: point.isCurrent ? 12 : 8,
                height: point.isCurrent ? 12 : 8,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                background: point.isCurrent ? ENS_THEME.surface : ENS_THEME.primary,
                border: `2px solid ${ENS_THEME.primary}`,
                boxSizing: 'border-box',
              }}
            />
          </EuiToolTip>
        ))}
        {scored
          .filter(point => point.isCurrent)
          .map(point => (
            <EuiText
              key='current'
              size='xs'
              style={{ position: 'absolute', left: `${point.x}%`, top: `${yOf(point.score as number)}%`, transform: 'translate(-50%, -150%)', fontWeight: 600, color: ENS_THEME.primary, whiteSpace: 'nowrap' }}
            >
              <span>{`${point.score} %`}</span>
            </EuiText>
          ))}
        {pending && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <EuiLoadingSpinner size='m' />
            <EuiText size='s' color='subdued'>
              <span>Calculando la serie…</span>
            </EuiText>
          </div>
        )}
      </div>
      <div style={{ position: 'relative', height: 20, marginTop: 6 }}>
        {points.map((point, index) =>
          index % labelEvery === 0 || point.isCurrent ? (
            <EuiText
              key={point.label}
              size='xs'
              color={point.isCurrent ? 'default' : 'subdued'}
              style={{ position: 'absolute', left: `${xOf(index, points.length)}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontWeight: point.isCurrent ? 600 : 400 }}
            >
              <span>{point.label}</span>
            </EuiText>
          ) : null
        )}
      </div>
    </div>
  );
};
