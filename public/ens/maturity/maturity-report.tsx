// The maturity block of every control's report (screen and PDF), generic: no report model is touched.
import React from 'react';
import { EuiBasicTable, EuiCallOut, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import { describeAssessment, describeMaturityHeadline } from '../../../common/ens/maturity/maturity-engine';
import { ENS_MATURITY_FEEDBACK_SOURCES, ENS_MATURITY_REVIEW_RESULTS, ownLabel } from '../../../common/ens/maturity/maturity-records';
import type { ENSControlMaturity } from '../../../common/ens/maturity/types';
import { MATURITY_ORIGIN_LABELS } from './maturity-view';

export const MATURITY_REPORT_NOTE =
  'Nota metodológica: semáforo y porcentaje, operativos (ENSFácil); madurez (CMM, Anexo II, ap. 6), normativa: el nivel acreditado sale de las evidencias y el valorado, el que se informa, lo fija una persona.';

export interface MaturityReportModel {
  headline: string;
  // Who assessed it and when, always; the mark against the level stored then; and a drop of the evidence since.
  assessment?: string;
  mark?: string;
  dropped?: string;
  draft: boolean;
  applicable: boolean;
  gates: { id: string; level: string; label: string; origin: string; state: string; reason: string; passed: boolean }[];
  records: { label: string; value: string }[];
}

export const buildMaturityReportModel = (maturity: ENSControlMaturity): MaturityReportModel => ({
  headline: describeMaturityHeadline(maturity),
  assessment: describeAssessment(maturity).line,
  mark: describeAssessment(maturity).mark,
  dropped: describeAssessment(maturity).dropped,
  draft: !maturity.measured,
  applicable: maturity.applicable,
  gates: maturity.gates.map(gate => ({
    id: gate.id,
    level: `L${gate.level}`,
    label: gate.label,
    origin: MATURITY_ORIGIN_LABELS[gate.origin] || gate.origin,
    state: gate.passed ? 'Se cumple' : 'No se cumple',
    reason: gate.reason,
    passed: gate.passed,
  })),
  records: [
    {
      label: 'Procedimiento',
      value: maturity.attestation
        ? `${maturity.attestation.reference} versión ${maturity.attestation.version}, aprobado el ${maturity.attestation.approvedAt}, vigente hasta ${maturity.attestation.validUntil}; difundido el ${maturity.attestation.disseminatedAt} a ${maturity.attestation.disseminatedTo}. Responsable: ${maturity.attestation.owner}. ${maturity.attestation.link}`
        : 'Sin registrar.',
    },
    {
      label: 'Última revisión',
      value: maturity.lastReview
        ? `${maturity.lastReview.date}, ${maturity.lastReview.reviewer}: ${ownLabel(ENS_MATURITY_REVIEW_RESULTS, maturity.lastReview.result) || maturity.lastReview.result}${
            maturity.lastReview.actions ? `. Acciones: ${maturity.lastReview.actions}` : ''
          }.`
        : 'Ninguna registrada.',
    },
    {
      label: 'Umbral',
      value: maturity.indicators ? `${maturity.indicators.minScore} %, revisión cada ${maturity.indicators.reviewPeriodDays} días.` : 'Sin declarar.',
    },
    {
      label: 'Realimentación',
      value: maturity.feedback.length
        ? maturity.feedback
            .map(
              entry =>
                `${entry.reference} (${ownLabel(ENS_MATURITY_FEEDBACK_SOURCES, entry.source) || entry.source}): ${
                  entry.closedAt ? `cerrada el ${entry.closedAt}${entry.procedureVersion ? ` con la versión ${entry.procedureVersion}` : ''}` : 'abierta'
                }`
            )
            .join('; ')
        : 'Ninguna registrada.',
    },
  ],
});

const DRAFT_TEXT = 'Sin medición todavía: el control está en borrador y ningún agente lo mide. Se puede declarar el nivel valorado.';

// pdfmake nodes, with the document's own styles (h3, th, td, sub).
export const buildMaturityPdfContent = (maturity?: ENSControlMaturity, error?: string): any[] => {
  const title = { text: 'Madurez del proceso (CMM)', style: 'h3', margin: [0, 0, 0, 6] };
  const note = { text: MATURITY_REPORT_NOTE, style: 'sub', margin: [0, 4, 0, 16] };
  if (!maturity) return [title, { text: error || 'Madurez no disponible en esta exportación.', style: 'sub' }, note];
  const model = buildMaturityReportModel(maturity);
  if (!model.applicable) return [title, { text: 'No aplica en este nivel: la madurez no se valora.', fontSize: 9 }, note];
  return [
    title,
    { text: model.headline, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
    ...(model.assessment ? [{ text: model.assessment, fontSize: 9, margin: [0, 0, 0, 4] }] : []),
    ...(model.mark ? [{ text: model.mark, color: '#BD271E', fontSize: 9, margin: [0, 0, 0, 4] }] : []),
    ...(model.dropped ? [{ text: model.dropped, color: '#BD271E', fontSize: 9, margin: [0, 0, 0, 4] }] : []),
    ...(model.draft ? [{ text: DRAFT_TEXT, fontSize: 9, color: '#69707d', margin: [0, 0, 0, 4] }] : []),
    ...(model.gates.length
      ? [
          {
            table: {
              headerRows: 1,
              widths: ['auto', '*', 'auto', 'auto', '*'],
              body: [
                ['Nivel', 'Puerta', 'Origen', 'Estado', 'Motivo'].map(text => ({ text, style: 'th' })),
                ...model.gates.map(gate => [
                  { text: gate.level, style: 'td', bold: true },
                  { text: gate.label, style: 'td' },
                  { text: gate.origin, style: 'td' },
                  { text: gate.state, style: 'td', bold: true, color: gate.passed ? '#4caf50' : '#e53935' },
                  { text: gate.reason, style: 'td' },
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 2, 0, 6],
          },
        ]
      : []),
    ...model.records.map(record => ({ text: [{ text: `${record.label}: `, bold: true }, record.value], fontSize: 9, margin: [0, 0, 0, 2] })),
    note,
  ];
};

// The same block on the report screen.
export const MaturityReportSection = ({ maturity, error }: { maturity?: ENSControlMaturity; error?: string }) => {
  const model = maturity ? buildMaturityReportModel(maturity) : undefined;
  return (
    <>
      <EuiTitle size='xs'>
        <h3>Madurez del proceso (CMM)</h3>
      </EuiTitle>
      <EuiText size='xs' color='subdued'>
        <p>{MATURITY_REPORT_NOTE}</p>
      </EuiText>
      <EuiSpacer size='s' />
      {!model ? (
        <EuiText size='s' color='subdued'>
          <p>{error || 'Calculando la madurez…'}</p>
        </EuiText>
      ) : !model.applicable ? (
        <EuiText size='s'>
          <p>No aplica en este nivel: la madurez no se valora.</p>
        </EuiText>
      ) : (
        <>
          <EuiText size='s'>
            <p>
              <strong>{model.headline}</strong>
            </p>
            {model.assessment && <p>{model.assessment}</p>}
            {model.draft && <p>{DRAFT_TEXT}</p>}
          </EuiText>
          {model.mark && <EuiCallOut size='s' color='warning' iconType='alert' title={model.mark} />}
          {model.dropped && <EuiCallOut size='s' color='warning' iconType='clock' title={model.dropped} />}
          {model.gates.length > 0 && (
            <EuiBasicTable
              compressed
              items={model.gates}
              columns={[
                { field: 'level', name: 'Nivel', width: '60px' },
                { field: 'label', name: 'Puerta' },
                { field: 'origin', name: 'Origen', width: '150px' },
                { field: 'state', name: 'Estado', width: '110px' },
                { field: 'reason', name: 'Motivo' },
              ]}
            />
          )}
          <EuiSpacer size='s' />
          <EuiText size='xs'>
            {model.records.map(record => (
              <p key={record.label}>
                <strong>{record.label}:</strong> {record.value}
              </p>
            ))}
          </EuiText>
        </>
      )}
    </>
  );
};
