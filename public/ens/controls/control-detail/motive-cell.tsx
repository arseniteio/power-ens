// The 'Motivo' cell: one line in the table, the full text in a panel.
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
  texto: string;
  etiqueta?: string;
}

interface MotiveCellProps {
  lineas: MotiveLine[];
  ocultos?: number;
  titulo?: string;
  evidenceId?: string;
  conocidos?: KnownReasonParts[];
  handlers?: MotiveViewHandlers;
}

export const cellLine = (text: string, evidenceId?: string, known: KnownReasonParts[] = []) => {
  const motive = parseMotive(text, known);
  const part =
    (evidenceId && motive.parts.find(p => p.evidenceId === evidenceId)) ||
    motive.parts.find(p => p.status && p.status !== 'CUMPLE' && p.status !== 'NO_APLICA') ||
    motive.parts[0];
  return { motivo: motive, parte: part, compuesto: motive.parts.length > 1 || Boolean(motive.policy) };
};

export const MotiveCell = ({
  lineas: lines,
  ocultos: hidden = 0,
  titulo: title = 'Motivo completo',
  evidenceId,
  conocidos: known = [],
  handlers = {},
}: MotiveCellProps) => {
  const [panelOpen, setPanelOpen] = useState(false);

  const question = lines.find(line =>
    line.texto.startsWith(QUESTION_PREFIX)
  );

  const body = lines.filter(
    line => !line.texto.startsWith(QUESTION_PREFIX)
  );

  if (!body.length && !question) {
    return (
      <EuiText size='xs' color='subdued'>
        Sin motivo registrado
      </EuiText>
    );
  }

  const first = body[0];
  const parsed = first ? cellLine(first.texto, evidenceId, known) : undefined;
  const summary = parsed?.parte ? parsed.parte.summary : first?.texto || '';
  const hasMore = body.length > 1 || Boolean(parsed && (parsed.compuesto || parsed.parte?.detail || parsed.parte?.secondary !== undefined)) || summary.length > TEXT_LIMIT;

  return (
    <>
      <EuiText size='xs'>
        {first && (
          <p style={{ marginBottom: hasMore ? 2 : 6 }}>
            {first.etiqueta && (
              <>
                <EuiBadge color='hollow'>{first.etiqueta}</EuiBadge>{' '}
              </>
            )}
            {parsed?.parte?.evidenceId && parsed.compuesto && (
              <>
                <EuiBadge color={statusBadgeColor(parsed.parte.status)}>{`${parsed.parte.evidenceId} ${statusLabel(parsed.parte.status)}`}</EuiBadge>{' '}
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
            y {hidden} motivo{hidden === 1 ? '' : 's'} más · seleccione un
            agente para verlos todos
          </p>
        )}

        {question && (
          <p style={{ color: ENS_THEME.mutedText, fontStyle: 'italic', marginBottom: 0 }}>
            {question.texto}
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
                key={`${line.texto}-${index}`}
                parsed={parseMotive(line.texto, known)}
                label={line.etiqueta}
                handlers={handlers}
              />
            ))}

            {question && (
              <>
                <EuiSpacer size='m' />
                <EuiText size='s' color='subdued'>
                  <p style={{ fontStyle: 'italic' }}>{question.texto}</p>
                </EuiText>
              </>
            )}
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
};
