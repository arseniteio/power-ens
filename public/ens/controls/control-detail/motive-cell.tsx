import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { KnownReasonParts, parseMotive } from '../../../../common/ens/evaluation/motive-parser';
import { MotiveView, MotiveViewHandlers, statusBadgeColor } from './motive-view';
import { ENS_THEME } from '../../theme-colors';
import { statusLabel } from '../../../../common/ens/core/status-label';

const QUESTION_PREFIX = 'Pregunta de auditoría:';

const TEXT_LIMIT = 190;

export interface MotiveLine {
  text: string;
  label?: string;
}

interface MotiveCellProps {
  lines: MotiveLine[];
  hidden?: number;
  title?: string;
  evidenceId?: string;
  known?: KnownReasonParts[];
  handlers?: MotiveViewHandlers;
}

const cellLine = (text: string, evidenceId?: string, known: KnownReasonParts[] = []) => {
  const motive = parseMotive(text, known);
  const part =
    (evidenceId && motive.parts.find(p => p.evidenceId === evidenceId)) ||
    motive.parts.find(p => p.status && p.status !== 'CUMPLE' && p.status !== 'NO_APLICA') ||
    motive.parts[0];
  return { motive, part, compound: motive.parts.length > 1 || Boolean(motive.policy) };
};

export const MotiveCell = ({
  lines,
  hidden = 0,
  title = 'Motivo completo',
  evidenceId,
  known = [],
  handlers = {},
}: MotiveCellProps) => {
  const [panelOpen, setPanelOpen] = useState(false);

  const question = lines.find(line =>
    line.text.startsWith(QUESTION_PREFIX)
  );

  const body = lines.filter(
    line => !line.text.startsWith(QUESTION_PREFIX)
  );

  if (!body.length && !question) {
    return (
      <EuiText size='xs' color='subdued'>
        Sin motivo registrado
      </EuiText>
    );
  }

  const first = body[0];
  const parsed = first ? cellLine(first.text, evidenceId, known) : undefined;
  const summary = parsed?.part ? parsed.part.summary : first?.text || '';
  const hasMore = body.length > 1 || Boolean(parsed && (parsed.compound || parsed.part?.detail || parsed.part?.secondary !== undefined)) || summary.length > TEXT_LIMIT;

  return (
    <>
      <EuiText size='xs'>
        {first && (
          <p style={{ marginBottom: hasMore ? 2 : 6 }}>
            {first.label && (
              <>
                <EuiBadge color='hollow'>{first.label}</EuiBadge>{' '}
              </>
            )}
            {parsed?.part?.evidenceId && parsed.compound && (
              <>
                <EuiBadge color={statusBadgeColor(parsed.part.status)}>{`${parsed.part.evidenceId} ${statusLabel(parsed.part.status)}`}</EuiBadge>{' '}
              </>
            )}
            {summary.length > TEXT_LIMIT ? `${summary.slice(0, TEXT_LIMIT).trimEnd()}…` : summary}
          </p>
        )}

        {hasMore && (
          <EuiButtonEmpty
            size='xs'
            flush='left'
            iconType='inspect'
            onClick={() => setPanelOpen(true)}
          >
            {body.length > 1
              ? `Ver motivo completo (${body.length} líneas)`
              : 'Ver motivo completo'}
          </EuiButtonEmpty>
        )}

        {hidden > 0 && (
          <p style={{ color: ENS_THEME.subduedText, marginBottom: 6 }}>
            +{hidden} motivo{hidden === 1 ? '' : 's'}
          </p>
        )}

        {question && (
          <p style={{ color: ENS_THEME.mutedText, fontStyle: 'italic', marginBottom: 0 }}>
            {question.text}
          </p>
        )}
      </EuiText>

      {panelOpen && (
        <EuiFlyout
          onClose={() => setPanelOpen(false)}
          size='m'
          ownFocus
          aria-labelledby='motivo-panel-titulo'
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size='s'>
              <h2 id='motivo-panel-titulo'>{title}</h2>
            </EuiTitle>
          </EuiFlyoutHeader>

          <EuiFlyoutBody>
            {body.map((line, index) => (
              <MotiveView
                key={`${line.text}-${index}`}
                parsed={parseMotive(line.text, known)}
                label={line.label}
                handlers={handlers}
              />
            ))}

            {question && (
              <>
                <EuiSpacer size='m' />
                <EuiText size='s' color='subdued'>
                  <p style={{ fontStyle: 'italic' }}>{question.text}</p>
                </EuiText>
              </>
            )}
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
};
