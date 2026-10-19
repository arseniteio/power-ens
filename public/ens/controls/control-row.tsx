// A catalogue row. It queries nothing: the list fetches one server summary, evaluated as in the detail.
import React from 'react';
import { EuiBadge, EuiFacetButton, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiText } from '@elastic/eui';
import { ENS_STATUS_COLORS } from '../status-colors';
import { ENS_THEME } from '../theme-colors';
import { EVALUATION_ERROR_TITLE, evaluationErrorText } from '../../platform/facts-read-error';
import type { ENSControlSummaryEntry } from '../../../common/ens/evaluation/types';
import { controlRowWaitLabel } from './control-row-state';
import type { ENSControlListEntry, ENSMachineTally } from './controls-list-model';
import { describeTally } from './controls-list-model';
import { AddControlWithDefaultsButton, NOT_IN_CONFIGURATION_TEXT } from './add-control-button';

export interface ControlRowData {
  id: string;
  title: string;
  levels: string;
  status: string;
  alerts: number;
  pending: number;
}

export type ControlRowSummary = ENSControlSummaryEntry;

interface ControlRowProps {
  entry: ENSControlListEntry;
  isLoading: boolean;
  error?: Error;
  colorDelEstado: (status: string) => string;
  badgeDelEstado: (status: string) => string;
  onSelect: () => void;
  onConfigurationChanged?: () => void;
}

export const MachineTallyBar = ({ tally }: { tally: ENSMachineTally }) => {
  const spans = [
    { estado: 'CUMPLE', n: tally.cumple },
    { estado: 'PARCIAL', n: tally.parcial },
    { estado: 'NO_CUMPLE', n: tally.noCumple },
    { estado: 'NO_EVALUABLE', n: tally.sinDatos },
    { estado: 'NO_APLICA', n: tally.noAplica },
  ].filter(barSpan => barSpan.n > 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      <span style={{ display: 'inline-flex', width: 96, height: 8, borderRadius: 4, overflow: 'hidden', background: ENS_THEME.track }}>
        {spans.map(barSpan => (
          <span key={barSpan.estado} style={{ width: `${(barSpan.n / tally.total) * 100}%`, background: ENS_STATUS_COLORS[barSpan.estado] }} />
        ))}
      </span>
      <EuiText size='xs' color='subdued'>
        <span>{`Máquinas: ${describeTally(tally)}`}</span>
      </EuiText>
    </div>
  );
};

export const ControlRow = ({ entry, isLoading, error, colorDelEstado: statusColor, badgeDelEstado: statusBadge, onSelect, onConfigurationChanged }: ControlRowProps) => {
  const { id: controlId, title, levels, summary } = entry;
  const action = !entry.configured ? (
    <EuiFlexItem grow={false}>
      <AddControlWithDefaultsButton controlId={controlId} onAdded={onConfigurationChanged} />
    </EuiFlexItem>
  ) : null;
  const unconfigured = !entry.configured ? (
    <EuiBadge color='warning' iconType='gear' style={{ marginLeft: 6 }}>
      {NOT_IN_CONFIGURATION_TEXT}
    </EuiBadge>
  ) : null;

  const row = (content: React.ReactNode, secondLine?: React.ReactNode) => (
    <div style={{ marginBottom: 8 }}>
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
        <EuiFlexItem>{content}</EuiFlexItem>
        {action}
      </EuiFlexGroup>
      {secondLine && <div style={{ padding: '2px 0 0 16px' }}>{secondLine}</div>}
    </div>
  );

  // Not measured on this machine: no number, it is neither compliance nor failure.
  if (entry.notMeasured) {
    return row(
      <EuiFacetButton isSelected={false} onClick={onSelect} style={{ borderLeft: `4px dashed ${ENS_THEME.track}`, opacity: 0.7 }}>
        <strong>{controlId}</strong> — {title}
        <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
          {levels}
        </EuiBadge>
        <EuiBadge color='hollow' iconType='minusInCircle' style={{ marginLeft: 6 }} title={entry.notMeasured.text}>
          No se mide en esta máquina
        </EuiBadge>
        {unconfigured}
      </EuiFacetButton>,
      <EuiText size='xs' color='subdued'>
        <p>{entry.notMeasured.text}</p>
      </EuiText>
    );
  }

  // While this view's summary loads no verdict is drawn: the previous machine's does not apply.
  const waitLabel = error ? undefined : controlRowWaitLabel(isLoading, summary);
  if (waitLabel) {
    return row(
      <EuiFacetButton isSelected={false} onClick={onSelect} style={{ borderLeft: `4px solid ${ENS_THEME.track}` }}>
        <strong>{controlId}</strong> — {title}
        <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
          {levels}
        </EuiBadge>
        <span style={{ marginLeft: 8 }}>
          <EuiLoadingSpinner size='s' />
        </span>
        <EuiBadge color='default' iconType='clock' style={{ marginLeft: 6 }}>
          {waitLabel}
        </EuiBadge>
        {unconfigured}
      </EuiFacetButton>
    );
  }

  if (error) {
    return row(
      <EuiFacetButton isSelected={false} onClick={onSelect} style={{ borderLeft: `4px solid ${ENS_THEME.dangerText}` }}>
        <strong>{controlId}</strong> — {title}
        <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
          {levels}
        </EuiBadge>
        <EuiBadge color='danger' title={evaluationErrorText(error)} style={{ marginLeft: 6 }}>
          {EVALUATION_ERROR_TITLE}
        </EuiBadge>
        {unconfigured}
      </EuiFacetButton>
    );
  }

  const status = summary?.status || 'NO_EVALUABLE';
  const nonConformities = summary?.requirementsNotMet || 0;
  const unproven = summary?.requirementsNotEvidenced || 0;

  return row(
    <EuiFacetButton
      quantity={nonConformities}
      isSelected={false}
      onClick={onSelect}
      style={{ borderLeft: `4px solid ${statusColor(status)}` }}
    >
      <strong>{controlId}</strong> — {title}
      <EuiBadge color='hollow' style={{ marginLeft: 8 }}>
        {levels}
      </EuiBadge>
      <EuiBadge color={statusBadge(status)} style={{ marginLeft: 6 }}>
        {status}
      </EuiBadge>
      {unproven > 0 && (
        <EuiBadge color='default' iconType='questionInCircle' style={{ marginLeft: 6 }}>
          {unproven} no evidenciada{unproven === 1 ? '' : 's'}
        </EuiBadge>
      )}
      {unconfigured}
    </EuiFacetButton>,
    entry.machines ? <MachineTallyBar tally={entry.machines} /> : undefined
  );
};
