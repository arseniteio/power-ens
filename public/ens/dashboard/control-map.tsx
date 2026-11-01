import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer, EuiText } from '@elastic/eui';
import { statusLabel } from '../../../common/ens/core/status-label';
import { ENS_STATUS_COLORS } from '../status-colors';
import { ENS_NO_RESULT_PATTERN, ENS_THEME } from '../theme-colors';
import { SectionTitle } from './dashboard-parts';
import type { ControlMapCell, ControlMapRow } from './dashboard-model';

const TILE = 30;

const LIGHT_TILES = new Set(['PARCIAL', 'NO_APLICA']);

const describeCell = (cell: ControlMapCell): string =>
  [cell.controlId, cell.title, cell.status ? statusLabel(cell.status) : 'Sin resultado', typeof cell.score === 'number' ? `${cell.score} %` : '']
    .filter(Boolean)
    .join(' · ');

const Tile = ({ cell, onOpen }: { cell: ControlMapCell; onOpen: (controlId: string) => void }) => (
  <button
    type='button'
    title={describeCell(cell)}
    aria-label={describeCell(cell)}
    onClick={() => onOpen(cell.controlId)}
    style={{
      width: TILE,
      height: TILE,
      borderRadius: 6,
      border: 'none',
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 600,
      background: cell.status ? ENS_STATUS_COLORS[cell.status] || ENS_STATUS_COLORS.NO_EVALUABLE : ENS_NO_RESULT_PATTERN,
      color: !cell.status || LIGHT_TILES.has(cell.status) ? '#1A1C21' : '#FFFFFF',
    }}
  >
    {cell.controlId.split('.').slice(2).join('.')}
  </button>
);

export const ControlMap = ({ rows, onOpen }: { rows: ControlMapRow[]; onOpen: (controlId: string) => void }) => (
  <EuiPanel hasBorder>
    <SectionTitle>Mapa de controles</SectionTitle>
    <EuiText size='xs' color='subdued'>
      <p>Cada casilla es un control. Pulsa para abrir su detalle.</p>
    </EuiText>
    <EuiSpacer size='m' />
    {rows.map(row => (
      <EuiFlexGroup key={row.family} gutterSize='s' alignItems='center' responsive={false} style={{ marginBottom: 6 }}>
        <EuiFlexItem grow={false} style={{ width: 64 }}>
          <EuiText size='xs'>
            <strong style={{ color: ENS_THEME.subduedText }}>{row.family}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {row.cells.map(cell => (
              <Tile key={cell.controlId} cell={cell} onOpen={onOpen} />
            ))}
          </div>
        </EuiFlexItem>
      </EuiFlexGroup>
    ))}
  </EuiPanel>
);
