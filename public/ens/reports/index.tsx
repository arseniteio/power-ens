import React, { useMemo, useState } from 'react';
import {
  EuiPanel, EuiTitle, EuiText, EuiSpacer, EuiFlexGroup, EuiFlexItem,
  EuiBadge, EuiHealth, EuiBasicTable, EuiButton, EuiHorizontalRule,
  EuiButtonIcon, EuiAccordion, EuiButtonEmpty, EuiCallOut, EuiFieldSearch,
  EuiFilterGroup, EuiFilterButton, EuiStat,
} from '@elastic/eui';
import { useRouterSearch } from '../../routing/use-router-search';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import { EvaluationStatusLine, EvaluationLoading } from '../../evaluation/evaluation-status';
import { getActiveControlConfiguration, getActiveENSConfiguration } from '../../../common/ens/configuration/services';
import { getENSCatalogControl } from '../../../common/ens/catalog';
import { describeNotMeasuredOnAgent } from '../../../common/ens/core/scope/measurement-planes';
import { canExportReport, reportViewState } from './report-view-state';
import { describeParameterForMachine } from '../controls/parameter-origins';
// Import from the types file, never from the `../core` barrel: it avoids the transitive TDZ cycle of Settings.
import type {
  ENSComplianceResult,
  ENSRequirementResult,
} from '../../../common/ens/core/evaluation/types';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import {
  getENSReportModelDefinition,
  listENSControlsWithoutReportModel,
} from './registry';
import type { ENSReportModelDefinition } from './registry';
import type { ENSEvaluationMeta } from '../../../common/ens/evaluation/types';
import {
  buildENSReportEvidencePdfCell,
  buildENSReportRows,
  ensReportStatusBadgeColor,
  ensReportStatusPdfColor,
  ensRequirementProofLabel,
  ENS_REPORT_EVIDENCE_FIELD,
} from './report-rows';
import type { ENSReportRow } from './report-rows';
import { MotiveCell } from '../controls/control-detail/motive-cell';
import { ENSControls } from '../data';
import {
  compareENSIds,
  filterByENSPrefix,
  listENSFamilies,
  resolveENSSectionOpenState,
} from '../control-filter/prefix';

(pdfMake as any).vfs = (pdfFonts as any).pdfMake ? (pdfFonts as any).pdfMake.vfs : (pdfFonts as any).vfs;

const fmt = (iso) => {
  if (!iso || iso === '-') return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Maximum length of observations in the table; the full text is in the expanded row and the PDF.
const OBSERVATION_PREVIEW_LENGTH = 90;

const PDF_SECONDARY_COLOR = '#69707d';

// Same vocabulary as the control detail: the cause label must be the same string on both screens.
const CAUSE_LABEL: Record<string, string> = {
  CATALOG: 'catálogo',
  CONFIGURATION: 'sin configurar',
  COLLECTION: 'sin recogida',
  EVIDENCE: 'evidencia insuficiente',
};

interface ENSReportPanorama {
  results?: ENSComplianceResult[];
  loading: boolean;
  error?: Error;
  meta?: ENSEvaluationMeta;
  refreshing?: boolean;
  retry?: () => void;
}

const ControlReport = ({
  controlId,
  definition,
  panorama,
}: {
  controlId: string;
  definition: ENSReportModelDefinition;
  panorama?: ENSReportPanorama;
}) => {
  const { agentId } = useRouterSearch();
  const [expandedReqIds, setExpandedReqIds] = useState<string[]>([]);

  const toggleRequirementDetail = (id: string) =>
    setExpandedReqIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id],
    );

  const activeConfiguration = getActiveENSConfiguration();
  const evaluationPeriod = activeConfiguration.global.evaluationPeriod;
  const evaluationPeriodText = evaluationPeriod || 'sin configurar';

  const evaluation = useEnsEvaluation<{ result?: ENSComplianceResult; meta?: ENSEvaluationMeta }>({
    include: 'control',
    controlId,
    agentId,
  });
  const { error } = evaluation;
  const complianceResult = evaluation.data?.result;
  const ensLevel = evaluation.data?.meta?.level || activeConfiguration.global.ensLevel;
  // A report is drawn and exported only with a real result for THIS selection: no filler while loading.
  const machine = agentId ? evaluation.data?.meta?.scope?.find(agent => agent.id === agentId) : undefined;
  const view = reportViewState({
    controlId,
    agentId,
    agentLabel: agentId ? (machine?.name ? `${agentId} · ${machine.name}` : agentId) : undefined,
    error,
    hasData: Boolean(evaluation.data),
    hasResult: Boolean(complianceResult),
    usesPanorama: Boolean(panorama),
    panoramaLoading: Boolean(panorama?.loading),
    notMeasured: () => {
      const catalogo = getENSCatalogControl(controlId);
      return catalogo && agentId
        ? describeNotMeasuredOnAgent(catalogo, agentId, machine?.name, getActiveControlConfiguration(controlId, agentId))
        : undefined;
    },
  });
  const exportable = canExportReport(view);

  const panoramaResults = panorama?.results;

  const reportModel = useMemo(
    () => definition.build(complianceResult, panoramaResults),
    [definition, complianceResult, panoramaResults],
  );

  // `?? null`, not only the ternary: an unmeasured control has no score (undefined) and would print 'undefined%'.
  const engineScore = complianceResult ? complianceResult.score ?? null : null;
  const engineCoverage = complianceResult ? complianceResult.coverage : null;
  const engineLevel = complianceResult?.level || ensLevel;
  const engineEvaluatedAt = complianceResult?.evaluatedAt || '-';

  const engineApplicable = complianceResult?.applicableRequirements ?? null;
  const engineMeasured = complianceResult?.measuredRequirements ?? null;

  const statusValue = complianceResult?.status || 'NO_EVALUABLE';

  const trafficLight =
    statusValue === 'CUMPLE'
      ? { health: 'success', stat: 'success', pdf: '#4caf50' }
      : statusValue === 'PARCIAL'
      ? { health: 'warning', stat: 'warning', pdf: '#f5a700' }
      : statusValue === 'NO_CUMPLE'
      ? { health: 'danger', stat: 'danger', pdf: '#e53935' }
      : { health: 'subdued', stat: 'default', pdf: PDF_SECONDARY_COLOR };

  const evidenceResults = complianceResult?.evidences || [];
  const requirementResults = complianceResult?.requirements || [];
  const parameterResults = complianceResult?.parameters || [];
  const nonConformities = complianceResult?.nonConformities || [];

  const evidenceAgent = evidenceResults.find(
    evidence => evidence.agentName || evidence.agentId,
  );

  const agentValue = agentId
    ? (evidenceAgent?.agentName || evidenceAgent?.agentId || `Agente ${agentId}`)
    : 'Todos los agentes';

  const formatPercent = (value) => (value !== null ? value + '%' : 'N/A');

  const provenText =
    engineApplicable === null
      ? 'N/A'
      : `${engineMeasured ?? 0}/${engineApplicable}`;

  const rows: ENSReportRow[] = buildENSReportRows(reportModel);

  // MEDIDO and NO EVIDENCIADO share the verdict on purpose (unproven counts against): the distinction comes from `evidenced` and the cause of the non-conformities, not from the status.
  const requirementCauses = (requirementId: string): string[] => {
    const causes: string[] = [];

    nonConformities.forEach(nonConformity => {
      if (
        nonConformity.requirementId !== requirementId ||
        nonConformity.origin !== 'NO_EVIDENCIADA' ||
        !nonConformity.cause
      ) {
        return;
      }

      const label =
        CAUSE_LABEL[nonConformity.cause] || nonConformity.cause;

      if (causes.indexOf(label) < 0) {
        causes.push(label);
      }
    });

    return causes;
  };

  const testLabel = (requirement: ENSRequirementResult): string =>
    ensRequirementProofLabel(
      requirement,
      requirementCauses(requirement.id)
    );

  const evidenceTrace = (evidenceIds: string[]): string[] =>
    (evidenceIds || []).map(id => {
      const evidence = evidenceResults.find(item => item.id === id);

      const parts = [
        evidence?.resolvedRuleId ? `regla ${evidence.resolvedRuleId}` : null,
        evidence?.resolvedEventId ? `evento ${evidence.resolvedEventId}` : null,
        evidence?.lastSeen ? fmt(evidence.lastSeen) : null,
      ].filter(Boolean);

      return `${id} · ${parts.length > 0 ? parts.join(' · ') : 'sin evento'}`;
    });

  const requirementRows = requirementResults.map(requirement => ({
    id: requirement.id,
    title: requirement.title,
    status: requirement.status,
    prueba: testLabel(requirement),
    level: requirement.level.join(', ') || '-',
    evidences: (requirement.evidenceIds || []).join(', ') || '-',
    observationList: requirement.observations || [],
    observations: (requirement.observations || []).join(' · '),
    traza: evidenceTrace(requirement.evidenceIds || []),
  }));

  const formatParameterValue = (value) => {
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : '—';
    }

    if (value === undefined || value === null || value === '') {
      return '—';
    }

    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }

    return String(value);
  };

  const parameterRows = parameterResults.map(parameter => ({
    parametro: `${parameter.id} · ${parameter.label}`,
    status: parameter.status,
    value: formatParameterValue(parameter.value),
    origin: describeParameterForMachine(activeConfiguration, controlId, agentId, parameter.id)?.origin || '',
    required: parameter.required ? 'Sí' : 'No',
    requirements: parameter.requirements.join(', ') || '-',
    ifNotConfigured:
      parameter.status === 'NOT_CONFIGURED' || parameter.status === 'INVALID'
        ? parameter.ifNotConfigured || ''
        : '',
  }));

  const parameterBadgeColor = (status) =>
    status === 'CONFIGURED'
      ? 'success'
      : status === 'NOT_APPLICABLE'
      ? 'hollow'
      : status === 'INVALID'
      ? 'danger'
      : 'warning';

  const parameterPdfColor = (status) =>
    status === 'CONFIGURED'
      ? '#4caf50'
      : status === 'INVALID'
      ? '#e53935'
      : status === 'NOT_CONFIGURED'
      ? '#f5a700'
      : PDF_SECONDARY_COLOR;

  const hasDetail = (item: { observations: string; traza: string[] }) =>
    (item.observations || '').length > OBSERVATION_PREVIEW_LENGTH ||
    item.traza.length > 0;

  const requirementColumns = [
    {
      field: 'id',
      name: 'Requisito',
      width: '130px',
    },
    {
      field: 'title',
      name: 'Descripción',
    },
    {
      field: 'level',
      name: 'Nivel',
      width: '90px',
    },
    {
      field: 'status',
      name: 'Estado',
      width: '190px',
      render: (status: string, item: { prueba: string }) => (
        <>
          <EuiBadge color={ensReportStatusBadgeColor(status)}>{status}</EuiBadge>
          {item.prueba ? (
            <EuiText size='xs' color='subdued'>
              {item.prueba}
            </EuiText>
          ) : null}
        </>
      ),
    },
    {
      field: 'evidences',
      name: 'Evidencias',
      width: '130px',
    },
    {
      field: 'observations',
      name: 'Observaciones',
      render: (value: string) => {
        const text = value || '—';

        return (
          <EuiText size='xs'>
            {text.length <= OBSERVATION_PREVIEW_LENGTH
              ? text
              : text.slice(0, OBSERVATION_PREVIEW_LENGTH).trimEnd() + '…'}
          </EuiText>
        );
      },
    },
    {
      align: 'right' as const,
      width: '40px',
      isExpander: true,
      render: (item: { id: string; observations: string; traza: string[] }) =>
        hasDetail(item) ? (
          <EuiButtonIcon
            onClick={() => toggleRequirementDetail(item.id)}
            aria-label={
              expandedReqIds.includes(item.id)
                ? 'Contraer detalle'
                : 'Ver observaciones y trazabilidad'
            }
            iconType={
              expandedReqIds.includes(item.id) ? 'arrowUp' : 'arrowDown'
            }
          />
        ) : null,
    },
  ];

  const requirementExpandedRowMap = expandedReqIds.reduce(
    (acc: Record<string, React.ReactNode>, id) => {
      const row = requirementRows.find(item => item.id === id);

      // `hasDetail` is the condition that renders the expand button; without it an id left in expandedReqIds opens an empty panel.
      if (row && hasDetail(row)) {
        acc[id] = (
          <EuiText size='xs'>
            {row.observationList.length > 0 ? (
              <>
                <strong>Observaciones</strong>
                <ul>
                  {row.observationList.map((observation, index) => (
                    <li key={index}>{observation}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {row.traza.length > 0 ? (
              <>
                <strong>Trazabilidad</strong>
                <ul>
                  {row.traza.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </EuiText>
        );
      }

      return acc;
    },
    {},
  );

  const parameterColumns = [
    {
      field: 'parametro',
      name: 'Parámetro',
      render: (parameter: string, item: { ifNotConfigured: string }) => (
        <>
          <EuiText size='xs'>{parameter}</EuiText>
          {item.ifNotConfigured ? (
            <EuiText size='xs' color='subdued'>
              Si falta: {item.ifNotConfigured}
            </EuiText>
          ) : null}
        </>
      ),
    },
    {
      field: 'value',
      name: 'Valor aplicado',
      render: (value: string, item: { origin: string }) => (
        <>
          <EuiText size='xs'>{value}</EuiText>
          {item.origin ? (
            <EuiText size='xs' color='subdued'>
              {item.origin}
            </EuiText>
          ) : null}
        </>
      ),
    },
    {
      field: 'required',
      name: 'Obligatorio',
      width: '110px',
    },
    {
      field: 'requirements',
      name: 'Requisitos',
      width: '160px',
    },
    {
      field: 'status',
      name: 'Estado',
      width: '210px',
      render: (status: string) => (
        <EuiBadge color={parameterBadgeColor(status)}>{status}</EuiBadge>
      ),
    },
  ];

  const columns = [
    {
      field: 'campo',
      name: 'Campo',
      width: '28%',
    },
    {
      field: 'valor',
      name: 'Valor',
      render: (value: string, item: ENSReportRow) => (
        <>
          <MotiveCell
            lineas={value
              .split(' · ')
              .map(text => text.trim())
              .filter(Boolean)
              .map(text => ({ texto: text }))}
            titulo={item.campo}
          />
          {item.contexto ? (
            <EuiText size='xs' color='subdued'>
              {item.contexto}
            </EuiText>
          ) : null}
        </>
      ),
    },
    {
      field: ENS_REPORT_EVIDENCE_FIELD,
      name: 'Evidencia',
      width: '190px',
      render: (evidence: string, item: ENSReportRow) => (
        <>
          <EuiBadge color={ensReportStatusBadgeColor(item.estado)}>
            {item.estado}
          </EuiBadge>
          <EuiText size='xs'>{evidence}</EuiText>
          {item.datosPendientes ? (
            <EuiText size='xs' color='subdued'>
              {item.datosPendientes}
            </EuiText>
          ) : null}
        </>
      ),
    },
  ];

  const exportPdf = () => {
    // A signed report is not issued without the result of this selection.
    if (!exportable || !complianceResult) return;
    const now = new Date();
    const issueDate = now.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      footer: (currentPage, pageCount) => ({
        columns: [
          { text: 'ENSFacil sobre Wazuh', alignment: 'left', fontSize: 7, color: '#999', margin: [40, 0, 0, 0] },
          { text: currentPage + ' / ' + pageCount, alignment: 'right', fontSize: 7, color: '#999', margin: [0, 0, 40, 0] },
        ],
      }),
      content: [
        { text: 'INFORME DE CUMPLIMIENTO ENS', style: 'h1' },
        { text: definition.name, style: 'h2' },
        { text: 'RD 311/2022', style: 'sub' },
        { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: '#cccccc' }], margin: [0, 4, 0, 12] },

        {
          columns: [
            { width: '50%', stack: [
              { text: 'Activo evaluado', style: 'metaLabel' },
              { text: agentValue, style: 'metaValue' },
              { text: 'Periodo evaluado', style: 'metaLabel' },
              { text: evaluationPeriodText, style: 'metaValue' },
            ]},
            { width: '50%', stack: [
              { text: 'Fecha de emision', style: 'metaLabel' },
              { text: issueDate, style: 'metaValue' },
              { text: 'Estado del control', style: 'metaLabel' },
              { text: statusValue, style: 'metaValue', color: trafficLight.pdf, bold: true },
            ]},
          ],
          margin: [0, 0, 0, 16],
        },

        { text: 'Resultado', style: 'h3' },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*', '*'],
            body: [
              [
                { text: 'Nivel ENS', style: 'th' },
                { text: 'Cumplimiento', style: 'th' },
                { text: 'Cobertura', style: 'th' },
                { text: 'Requisitos demostrados', style: 'th' },
              ],
              [
                { text: String(engineLevel), style: 'scoreCell', color: '#006bb4' },
                { text: formatPercent(engineScore), style: 'scoreCell', color: trafficLight.pdf },
                {
                  text: formatPercent(engineCoverage),
                  style: 'scoreCell',
                  color: engineCoverage === null ? PDF_SECONDARY_COLOR : '#006bb4',
                },
                {
                  text: provenText,
                  style: 'scoreCell',
                  // `> 0` as well as equality: a draft control has no applicable requirements and 0/0 would paint it green in the signed document.
                  color:
                    engineApplicable !== null &&
                    engineApplicable > 0 &&
                    engineMeasured === engineApplicable
                      ? '#4caf50'
                      : PDF_SECONDARY_COLOR,
                },
              ],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 16],
        },

        { text: 'Campos del informe', style: 'h3' },
        {
          table: {
            headerRows: 1,
            // Fixed width for 'Evidencia', not 'auto': pdfMake would size it to the unbroken line and squeeze 'Valor'.
            widths: ['38%', '*', '18%'],
            body: [
              [
                { text: 'Campo', style: 'th' },
                { text: 'Valor', style: 'th' },
                { text: 'Evidencia', style: 'th' },
              ],
              ...rows.map((r) => [
                { text: r.campo, style: 'td' },
                {
                  text: r.contexto
                    ? [
                        r.valor,
                        {
                          text: `\n${r.contexto}`,
                          fontSize: 7,
                          color: '#69707D',
                        },
                      ]
                    : r.valor,
                  style: 'td',
                },
                buildENSReportEvidencePdfCell(r),
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },

        { text: 'Requisitos', style: 'h3', margin: [0, 16, 0, 6] },
        {
          table: {
            headerRows: 1,
            // 'Estado' has a fixed width: 'auto' would not wrap its longest line.
            widths: ['auto', '*', 'auto', 105],
            body: [
              [
                { text: 'Requisito', style: 'th' },
                { text: 'Descripción, trazabilidad y observaciones', style: 'th' },
                { text: 'Nivel', style: 'th' },
                { text: 'Estado', style: 'th' },
              ],
              ...requirementRows.map(requirement => [
                { text: requirement.id, style: 'td' },
                {
                  text: [
                    requirement.title,
                    ...requirement.traza,
                    requirement.observations || undefined,
                  ]
                    .filter(Boolean)
                    .join('\n'),
                  style: 'td',
                },
                { text: requirement.level, style: 'td' },
                {
                  style: 'td',
                  text: [
                    {
                      text: requirement.status,
                      color: ensReportStatusPdfColor(requirement.status),
                      bold: true,
                    },
                    ...(requirement.prueba
                      ? [{ text: `\n${requirement.prueba}`, color: PDF_SECONDARY_COLOR }]
                      : []),
                  ],
                },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 16],
        },

        { text: 'Parámetros', style: 'h3' },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Parámetro y valor', style: 'th' },
                { text: 'Obligatorio', style: 'th' },
                { text: 'Requisitos', style: 'th' },
                { text: 'Estado', style: 'th' },
              ],
              ...parameterRows.map(parameter => [
                {
                  text: `${parameter.parametro}: ${parameter.value}${parameter.origin ? ` (${parameter.origin})` : ''}`,
                  style: 'td',
                },
                { text: parameter.required, style: 'td' },
                { text: parameter.requirements, style: 'td' },
                {
                  style: 'td',
                  text: [
                    {
                      text: parameter.status,
                      color: parameterPdfColor(parameter.status),
                      bold: true,
                    },
                    ...(parameter.ifNotConfigured
                      ? [
                          {
                            text: `\nSi falta: ${parameter.ifNotConfigured}`,
                            color: PDF_SECONDARY_COLOR,
                          },
                        ]
                      : []),
                  ],
                },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
      ],
      styles: {
        h1: { fontSize: 16, bold: true, color: '#1a1c21' },
        h2: { fontSize: 13, bold: true, color: '#006bb4', margin: [0, 2, 0, 0] },
        h3: { fontSize: 11, bold: true, color: '#1a1c21', margin: [0, 0, 0, 6] },
        sub: { fontSize: 9, color: '#69707d', margin: [0, 2, 0, 0] },
        metaLabel: { fontSize: 8, color: '#69707d', margin: [0, 6, 0, 0] },
        metaValue: { fontSize: 10, color: '#1a1c21', bold: false },
        th: { fontSize: 9, bold: true, color: '#ffffff', fillColor: '#006bb4', margin: [2, 4, 2, 4] },
        td: { fontSize: 9, color: '#1a1c21', margin: [2, 3, 2, 3] },
        scoreCell: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 6, 0, 6] },
      },
      defaultStyle: { fontSize: 10 },
    };

    const name = 'Informe_ENS_' + controlId + '_' + (agentId ? agentValue.replace(/[^a-zA-Z0-9]/g, '_') : 'general') + '.pdf';
    (pdfMake as any).createPdf(docDefinition).download(name);
  };

  if (error) {
    return (
      <>
        <FactsReadErrorCallOut error={error} onRetry={evaluation.retry} />
        <EuiSpacer size='m' />
        <EuiButton iconType='download' size='s' fill isDisabled>
          Exportar PDF
        </EuiButton>
      </>
    );
  }

  if (view.kind === 'not-measured') {
    return (
      <>
        <EvaluationStatusLine meta={evaluation.data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />
        <EuiCallOut size='s' color='primary' iconType='iInCircle' title={view.title}>
          <EuiText size='xs'>
            <p>{view.text}</p>
            <p>Sin resultado en esta selección no hay informe que exportar.</p>
          </EuiText>
        </EuiCallOut>
        <EuiSpacer size='m' />
        <EuiButton iconType='download' size='s' fill isDisabled>
          Exportar PDF
        </EuiButton>
      </>
    );
  }

  if (view.kind === 'loading' || view.kind === 'panorama-loading') {
    return (
      <>
        <EvaluationLoading
          message={
            view.kind === 'loading'
              ? 'Evaluando el control en el servidor con todos los hechos de la ventana…'
              : 'Evaluando todos los controles para el panorama del informe (grado de implantación, controles no evaluables, art. 32)…'
          }
        />
        <EuiButton iconType='download' size='s' fill isDisabled>
          Exportar PDF
        </EuiButton>
      </>
    );
  }

  return (
    <>
      <EvaluationStatusLine meta={evaluation.data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />
      {panorama?.meta ? (
        <EvaluationStatusLine label='Panorama de todos los controles' meta={panorama.meta} refreshing={panorama.refreshing} onRetry={panorama.retry} />
      ) : null}
      {panorama?.error ? (
        <>
          <EuiCallOut
            size='s'
            color='warning'
            iconType='alert'
            title='No se han podido leer los hechos de todos los controles'
          >
            <EuiText size='xs'>
              <p>
                El grado de implantación, los controles no evaluables y los
                datos del art. 32 salen sin datos. El veredicto del control no
                depende de esta consulta.
              </p>
              <p>{String(panorama.error?.message || panorama.error)}</p>
            </EuiText>
            {panorama.retry ? (
              <EuiButtonEmpty size='xs' iconType='refresh' onClick={panorama.retry}>
                Reintentar
              </EuiButtonEmpty>
            ) : null}
          </EuiCallOut>
          <EuiSpacer size='s' />
        </>
      ) : null}
      <EuiFlexGroup justifyContent='spaceBetween' alignItems='center'>
        <EuiFlexItem>
          <EuiText size='xs' color='subdued'>
            <p>
              {agentValue} · periodo {evaluationPeriodText} · evaluado{' '}
              {fmt(engineEvaluatedAt)}
            </p>
          </EuiText>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiHealth color={trafficLight.health}>{statusValue}</EuiHealth>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule margin='m' />

      <EuiFlexGroup gutterSize='l'>
        <EuiFlexItem>
          <EuiStat title={String(engineLevel)} description='Nivel ENS' />
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiStat
            title={formatPercent(engineScore)}
            description='Cumplimiento'
            titleColor={trafficLight.stat}
          />
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiStat
            title={formatPercent(engineCoverage)}
            description='Cobertura'
          />
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiStat
            title={provenText}
            description='Requisitos demostrados'
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size='l' />

      <EuiTitle size='xs'>
        <h3>Campos del informe</h3>
      </EuiTitle>

      <EuiSpacer size='s' />

      <EuiBasicTable items={rows} columns={columns} tableLayout='fixed' />

      <EuiSpacer size='l' />

      <EuiTitle size='xs'>
        <h3>Requisitos</h3>
      </EuiTitle>

      <EuiSpacer size='s' />

      <EuiBasicTable
        items={requirementRows}
        itemId='id'
        itemIdToExpandedRowMap={requirementExpandedRowMap}
        isExpandable={true}
        compressed={true}
        columns={requirementColumns}
      />

      <EuiSpacer size='l' />

      <EuiTitle size='xs'>
        <h3>Parámetros</h3>
      </EuiTitle>

      <EuiSpacer size='s' />

      <EuiBasicTable
        items={parameterRows}
        compressed={true}
        columns={parameterColumns}
      />

      <EuiSpacer size='l' />

      <EuiButton iconType='download' size='s' fill onClick={exportPdf} isDisabled={!exportable}>
        Exportar PDF
      </EuiButton>
    </>
  );
};

// A report that gathers all controls (`usesAllControls`, op.mon.2) issues a SECOND query only to compute each control's result.
const ControlReportWithPanorama = ({
  controlId,
  definition,
}: {
  controlId: string;
  definition: ENSReportModelDefinition;
}) => {
  const { agentId } = useRouterSearch();

  // The overview result is computed by the server with all facts of the window; the hook never returns another machine's.
  const evaluation = useEnsEvaluation<{ results: ENSComplianceResult[]; meta?: ENSEvaluationMeta }>({
    include: 'results',
    agentId,
  });
  const { error } = evaluation;
  const valid = {
    valor: evaluation.data ? { results: evaluation.data.results } : undefined,
    cargando: !evaluation.data && !error,
  };

  return (
    <ControlReport
      controlId={controlId}
      definition={definition}
      panorama={{
        results: valid.valor?.results,
        loading: valid.cargando,
        error,
        meta: evaluation.data?.meta,
        refreshing: evaluation.isRefreshing,
        retry: evaluation.retry,
      }}
    />
  );
};

interface ControlReportEntry {
  controlId: string;
  title: string;
  levels: string;
  requirementCount: number;
  evidenceCount: number;

  filterableIds: string[];

  reportModelDefinition?: ENSReportModelDefinition;
}

const ControlReportHeader = ({ entry }: { entry: ControlReportEntry }) => (
  <EuiFlexGroup alignItems='center' gutterSize='s' responsive={false} wrap>
    <EuiFlexItem grow={false}>
      <EuiText size='s'>
        <strong>{entry.controlId}</strong> — {entry.title}
      </EuiText>
    </EuiFlexItem>

    <EuiFlexItem grow={false}>
      <EuiBadge color='hollow'>{entry.levels}</EuiBadge>
    </EuiFlexItem>

    <EuiFlexItem grow={false}>
      <EuiBadge color='default'>
        {entry.requirementCount} requisito(s) · {entry.evidenceCount}{' '}
        evidencia(s)
      </EuiBadge>
    </EuiFlexItem>

    {!entry.reportModelDefinition && (
      <EuiFlexItem grow={false}>
        <EuiBadge color='warning' iconType='alert'>
          Sin modelo de informe
        </EuiBadge>
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
);

// A control without a report model never borrows another's: the selector used to default to mp.info.6 and produced a plausible, wrong document.
const ControlWithoutReportModel = ({
  entry,
}: {
  entry: ControlReportEntry;
}) => (
  <EuiCallOut
    size='s'
    color='warning'
    iconType='documentEdit'
    title={`${entry.controlId} no tiene modelo de informe`}
  >
    <EuiText size='xs'>
      <p>
        Se evalúa en Controles. Alta en{' '}
        <code>public/ens/reports/registry.ts</code>.
      </p>
    </EuiText>
  </EuiCallOut>
);

export const ReportsENS = () => {
  const [prefix, setPrefix] = React.useState<string>('');

  const [openControlIds, setOpenControlIds] = React.useState<
    Record<string, boolean | undefined>
  >({});

  const applyPrefix = (value: string) => {
    setPrefix(value);
    setOpenControlIds({});
  };

  const entries: ControlReportEntry[] = React.useMemo(
    () =>
      ENSControls.map(control => ({
        controlId: control.id,
        title: control.title,
        levels: control.scope.activeLevels.join(', '),
        requirementCount: control.requirements.length,
        evidenceCount: control.evidences.length,
        filterableIds: [
          control.id,
          ...control.requirements.map(requirement => requirement.id),
        ],
        reportModelDefinition: getENSReportModelDefinition(control.id),
      })).sort((a, b) => compareENSIds(a.controlId, b.controlId)),
    [],
  );

  // Controls missing a report model are named at the top, unfiltered: the omission must be visible.
  const withoutReportModel = React.useMemo(
    () =>
      listENSControlsWithoutReportModel(
        entries.map(entry => entry.controlId),
      ),
    [entries],
  );

  const families = React.useMemo(
    () => listENSFamilies(entries.map(entry => entry.controlId)),
    [entries],
  );

  const filtered = React.useMemo(
    () => filterByENSPrefix(entries, prefix, entry => entry.filterableIds),
    [entries, prefix],
  );

  const isOpen = (controlId: string): boolean =>
    resolveENSSectionOpenState(
      openControlIds,
      controlId,
      filtered.matched.length,
    );

  const toggleControl = (controlId: string, nextIsOpen: boolean) =>
    setOpenControlIds(current => ({
      ...current,
      [controlId]: nextIsOpen,
    }));

  return (
    <>
      <EuiPanel paddingSize='m'>
        <EuiTitle size='xs'>
          <h3>Informes de cumplimiento ENS</h3>
        </EuiTitle>

        <EuiSpacer size='s' />

        <EuiFlexGroup gutterSize='m' alignItems='center' wrap>
          <EuiFlexItem grow={false}>
            <EuiFilterGroup>
              <EuiFilterButton
                hasActiveFilters={!filtered.isActive}
                onClick={() => applyPrefix('')}
              >
                Todos
              </EuiFilterButton>
              {families.map(family => (
                <EuiFilterButton
                  key={family}
                  hasActiveFilters={filtered.query === family}
                  onClick={() => applyPrefix(family)}
                >
                  {family}
                </EuiFilterButton>
              ))}
            </EuiFilterGroup>
          </EuiFlexItem>

          <EuiFlexItem>
            <EuiFieldSearch
              fullWidth
              incremental
              isClearable
              placeholder='Filtrar por prefijo: op.acc, op.acc.1, op.acc.1.2…'
              aria-label='Filtrar controles por prefijo del identificador ENS'
              value={prefix}
              onChange={(event: { target: { value: string } }) =>
                applyPrefix(event.target.value)
              }
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size='s' />

        <EuiFlexGroup
          gutterSize='s'
          alignItems='center'
          wrap
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <EuiText size='xs' color='subdued'>
              <p>
                {filtered.isActive
                  ? `${filtered.matched.length} de ${entries.length} controles`
                  : `${entries.length} controles`}
              </p>
            </EuiText>
          </EuiFlexItem>

          {filtered.isActive && (
            <EuiFlexItem grow={false}>
              <EuiBadge color='accent'>Filtro: {filtered.query}</EuiBadge>
            </EuiFlexItem>
          )}

          {filtered.isActive && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size='xs'
                iconType='cross'
                onClick={() => applyPrefix('')}
              >
                Quitar filtro
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>

        {filtered.isActive && filtered.hidden.length > 0 && (
          <>
            <EuiSpacer size='s' />
            <EuiText size='xs' color='subdued'>
              <p>
                Fuera del filtro:{' '}
                {filtered.hidden.map(entry => entry.controlId).join(', ')}
              </p>
            </EuiText>
          </>
        )}

        {withoutReportModel.length > 0 && (
          <>
            <EuiSpacer size='s' />
            <EuiCallOut
              size='s'
              color='warning'
              iconType='alert'
              title={`Sin modelo de informe: ${withoutReportModel.join(', ')}`}
            />
          </>
        )}
      </EuiPanel>

      <EuiSpacer size='m' />

      {filtered.matched.length === 0 ? (
        <EuiPanel paddingSize='m'>
          <EuiCallOut
            size='s'
            color='warning'
            iconType='search'
            title={`Ningún control coincide con «${filtered.query}»`}
          >
            <EuiButtonEmpty
              size='s'
              iconType='cross'
              onClick={() => applyPrefix('')}
            >
              Quitar filtro
            </EuiButtonEmpty>
          </EuiCallOut>
        </EuiPanel>
      ) : (
        filtered.matched.map(entry => (
          <React.Fragment key={entry.controlId}>
            <EuiPanel paddingSize='m'>
              <EuiAccordion
                id={`ens-informe-${entry.controlId.replace(/\./g, '-')}`}
                buttonContent={<ControlReportHeader entry={entry} />}
                forceState={isOpen(entry.controlId) ? 'open' : 'closed'}
                onToggle={(nextIsOpen: boolean) =>
                  toggleControl(entry.controlId, nextIsOpen)
                }
                paddingSize='m'
              >
                {/* Mounted ONLY while the section is open: each `<ControlReport>` requests its control's evaluation. Without a model there is no fallback report. */}
                {isOpen(entry.controlId) ? (
                  entry.reportModelDefinition ? (
                    entry.reportModelDefinition.usesAllControls ? (
                      <ControlReportWithPanorama
                        controlId={entry.controlId}
                        definition={entry.reportModelDefinition}
                      />
                    ) : (
                      <ControlReport
                        controlId={entry.controlId}
                        definition={entry.reportModelDefinition}
                      />
                    )
                  ) : (
                    <ControlWithoutReportModel entry={entry} />
                  )
                ) : null}
              </EuiAccordion>
            </EuiPanel>
            <EuiSpacer size='m' />
          </React.Fragment>
        ))
      )}
    </>
  );
};
