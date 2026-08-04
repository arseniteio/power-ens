import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiPanel, EuiTitle, EuiText, EuiSpacer, EuiFlexGroup, EuiFlexItem,
  EuiBadge, EuiHealth, EuiBasicTable, EuiButton, EuiHorizontalRule,
  EuiButtonIcon, EuiAccordion, EuiButtonEmpty, EuiCallOut, EuiFieldSearch,
  EuiFilterGroup, EuiFilterButton,
} from '@elastic/eui';
import { useRouterSearch } from '../../../common/hooks';
import { useEsSearch } from '../../../common/hooks/use-es-search';
import { getActiveENSConfiguration } from '../configuration/services';
import {
  buildENSEvaluationTimeRangeFilter,
  getENSComplianceResultByControl,
  normalizeWazuhAlerts,
} from '../core';
import {
  buildENSScopeAgentQueryFilter,
  getActiveENSScopeAgents,
} from '../core/scope';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { buildMpInfo6ReportModel } from './report-model';
import { buildOpAcc1ReportModel } from './op-acc-1-report-model';
import { buildOpAcc2ReportModel } from './op-acc-2-report-model';
import { ENSControls } from '../data';
import {
  compareENSIds,
  filterByENSPrefix,
  listENSFamilies,
  resolveENSSectionOpenState,
} from '../control-filter/prefix';

(pdfMake as any).vfs = (pdfFonts as any).pdfMake ? (pdfFonts as any).pdfMake.vfs : (pdfFonts as any).vfs;

const getTs = (hit) =>
  (hit && hit._source && (hit._source['@timestamp'] || (hit._source.data && hit._source.data.ts))) || '-';

const fmt = (iso) => {
  if (!iso || iso === '-') return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Longitud máxima de las observaciones en la tabla. El texto completo
// queda accesible al expandir la fila y en el PDF exportado.
const OBSERVATION_PREVIEW_LENGTH = 90;

// Metadatos de presentación por control (título e info del informe).
const CONTROL_META: Record<string, { name: string; subtitle: string }> = {
  'mp.info.6': {
    name: 'mp.info.6 - Copias de seguridad',
    subtitle: 'Protección de la información',
  },
  'op.acc.1': {
    name: 'op.acc.1 - Identificación',
    subtitle: 'Control de acceso',
  },
  'op.acc.2': {
    name: 'op.acc.2 - Requisitos de acceso',
    subtitle: 'Control de acceso',
  },
};

// Selecciona el builder de modelo de informe según el control.
//
// ASIMETRÍA CONOCIDA: op.acc.1 y op.acc.2 tienen fichero propio
// (`op-acc-<n>-report-model.ts`), pero mp.info.6 vive en `report-model.ts`, de
// nombre genérico, y además es la RAMA POR DEFECTO de esta cadena. Un control
// nuevo que no se añada aquí no fallará: se le generará en silencio el informe
// de mp.info.6, con sus requisitos y sus evidencias. Al añadir un control hay
// que tocar esta función; lo correcto sería un registro por controlId que
// devuelva undefined para los no registrados.
const buildReportModelFor = (controlId: string, result: any) =>
  controlId === 'op.acc.2'
    ? buildOpAcc2ReportModel(result)
    : controlId === 'op.acc.1'
    ? buildOpAcc1ReportModel(result)
    : buildMpInfo6ReportModel(result);

// Subcomponente: informe completo de UN control. Los hooks viven aquí
// (no pueden ir en bucle), así que General renderiza uno por control.
const ControlReport = ({ controlId }: { controlId: string }) => {
  const { agentId } = useRouterSearch();
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedReqIds, setExpandedReqIds] = useState<string[]>([]);

  const toggleRequirementDetail = (id: string) =>
    setExpandedReqIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id],
    );
  useEffect(() => {
    const i = window.setInterval(() => setRefreshKey(c => c + 1), 15000);
    return () => window.clearInterval(i);
  }, []);

  const activeConfiguration = getActiveENSConfiguration();
  const ensLevel = activeConfiguration.global.ensLevel;
  const evaluationPeriod =
    activeConfiguration.global.evaluationPeriod;

  const evaluationPeriodText =
    evaluationPeriod ||
    'No configurado';

  const evaluationTimeFilter =
    buildENSEvaluationTimeRangeFilter(
      evaluationPeriod,
    );

  const scopeAgents =
    getActiveENSScopeAgents();

  const scopeAgentQueryFilter =
    buildENSScopeAgentQueryFilter(
      scopeAgents,
      agentId,
    );

  const { esResults } = useEsSearch({
    preAppliedFilters: [
      evaluationTimeFilter,
      scopeAgentQueryFilter,
      { match_phrase: { 'data.ensfacil': controlId } },
    ],
    size: 2000,
    refreshKey,
  });

  const hits = useMemo(() => {
    const raw = (esResults && esResults.hits && esResults.hits.hits) || [];
    return [...raw].sort((a, b) => (new Date(getTs(b)).getTime() || 0) - (new Date(getTs(a)).getTime() || 0));
  }, [esResults]);

  const normalizedEvents = useMemo(
    () => normalizeWazuhAlerts(hits),
    [hits],
  );

  const complianceResult = useMemo(
    () =>
      getENSComplianceResultByControl(
        controlId,
        ensLevel,
        normalizedEvents,
        agentId,
        scopeAgents,
      ),
    [
      // `controlId` en las dependencias, y no solo en las de `reportModel`:
      // faltaba, y hasta ahora el selector de control renderizaba SIEMPRE el
      // mismo `<ControlReport>` sin `key`, así que React reutilizaba la
      // instancia al cambiar de control y el resultado del motor se quedaba
      // congelado en el anterior mientras el modelo de informe sí cambiaba —
      // un informe de op.acc.2 con los datos de op.acc.1. Cada sección lleva
      // ahora su `key`, pero la dependencia que faltaba se arregla igual.
      controlId,
      ensLevel,
      normalizedEvents,
      agentId,
      scopeAgents,
    ],
  );

  const reportModel = useMemo(
    () =>
      buildReportModelFor(
        controlId,
        complianceResult,
      ),
    [
      controlId,
      complianceResult,
    ],
  );

  // El score y la cobertura proceden exclusivamente del motor ENS.
  // Se conserva el valor 0 como resultado válido y no se confunde
  // con ausencia de evaluación.
  // `?? null` y no solo el ternario: desde que un control sin medir se publica
  // SIN número, `score` puede venir `undefined`, y `undefined !== null` es
  // cierto — el informe imprimiría "undefined%" donde debe poner N/A.
  const motorScore =
    complianceResult
      ? complianceResult.score ?? null
      : null;

  const motorCoverage =
    complianceResult
      ? complianceResult.coverage
      : null;

  const motorLevel =
    complianceResult?.level ||
    ensLevel;

  const motorEvaluatedAt =
    complianceResult?.evaluatedAt ||
    '-';

  // Estado evaluado exclusivamente por el motor ENS.
  const estado =
    complianceResult?.status ||
    'NO_EVALUABLE';

  const semaforo =
    estado === 'CUMPLE'
      ? { color: 'success', label: 'VERDE - CUMPLE' }
      : estado === 'PARCIAL'
      ? { color: 'warning', label: 'ÁMBAR - PARCIAL' }
      : estado === 'NO_CUMPLE'
      ? { color: 'danger', label: 'ROJO - NO CUMPLE' }
      : estado === 'NO_APLICA'
      ? { color: 'subdued', label: 'GRIS - NO APLICA' }
      : { color: 'subdued', label: 'GRIS - NO EVALUABLE' };

  const evidenceResults =
    complianceResult?.evidences || [];

  const evidenceAgent =
    evidenceResults.find(
      evidence =>
        evidence.agentName ||
        evidence.agentId
    );

  const agente = agentId
    ? (
        evidenceAgent?.agentName ||
        evidenceAgent?.agentId ||
        `Agente ${agentId}`
      )
    : 'Todos los agentes (vista general)';

  const evidenceBadgeColor = (status) =>
    status === 'CUMPLE'
      ? 'success'
      : status === 'PARCIAL'
      ? 'warning'
      : status === 'NO_CUMPLE'
      ? 'danger'
      : status === 'NO_APLICA'
      ? 'hollow'
      : 'default';

  const rows = reportModel.fields.map((field) => ({
    campo: `${field.id} · ${field.title}`,
    valor: [
      field.status,
      field.value,
      ...field.details,
    ]
      .filter(Boolean)
      .join(' · '),
    evidencia: [
      field.evidenceIds.length
        ? field.evidenceIds.join(', ')
        : 'SIN_DATOS',
      field.producerGaps.length
        ? `Datos pendientes: ${field.producerGaps.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join(' · '),
  }));

  const requirementResults =
    complianceResult?.requirements || [];

  const parameterResults =
    complianceResult?.parameters || [];

  const formatParameterValue = (value) => {
    if (Array.isArray(value)) {
      return value.length > 0
        ? value.join(', ')
        : 'Sin valor';
    }

    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return 'Sin valor';
    }

    if (typeof value === 'boolean') {
      return value
        ? 'Sí'
        : 'No';
    }

    return String(value);
  };

  const requirementRows =
    requirementResults.map(
      requirement => ({
        id: requirement.id,
        title: requirement.title,
        status: requirement.status,
        level:
          requirement.level.join(', ') ||
          '-',
        evidences:
          (
            requirement.evidenceIds || []
          ).join(', ') ||
          '-',
        observations:
          requirement.observations.length > 0
            ? requirement.observations.join(' · ')
            : 'Sin observaciones',
      }),
    );

  const parameterRows =
    parameterResults.map(
      parameter => ({
        id: parameter.id,
        label: parameter.label,
        name: parameter.name,
        status: parameter.status,
        value:
          formatParameterValue(
            parameter.value,
          ),
        required:
          parameter.required
            ? 'Sí'
            : 'No',
        requirements:
          parameter.requirements.join(', ') ||
          '-',
        ifNotConfigured:
          parameter.ifNotConfigured ||
          '-',
      }),
    );

  const parameterBadgeColor = (status) =>
    status === 'CONFIGURED'
      ? 'success'
      : status === 'NOT_APPLICABLE'
      ? 'hollow'
      : status === 'INVALID'
      ? 'danger'
      : 'warning';

  const requirementColumns = [
    {
      field: 'id',
      name: 'Requisito',
      width: '150px',
    },
    {
      field: 'title',
      name: 'Descripción',
    },
    {
      field: 'level',
      name: 'Nivel',
      width: '110px',
    },
    {
      field: 'evidences',
      name: 'Evidencias',
      width: '130px',
    },
    {
      field: 'status',
      name: 'Estado',
      width: '150px',
      render: status => (
        <EuiBadge
          color={evidenceBadgeColor(status)}
        >
          {status}
        </EuiBadge>
      ),
    },
    {
      field: 'observations',
      name: 'Observaciones',
      render: (value: string) => {
        const text = value || 'Sin observaciones';

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
      render: (item: { id: string; observations: string }) =>
        (item.observations || '').length > OBSERVATION_PREVIEW_LENGTH ? (
          <EuiButtonIcon
            onClick={() => toggleRequirementDetail(item.id)}
            aria-label={
              expandedReqIds.includes(item.id)
                ? 'Contraer observaciones'
                : 'Ver observaciones completas'
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

      if (row) {
        acc[id] = (
          <EuiText size='xs'>
            <p style={{ whiteSpace: 'pre-line' }}>
              {(row.observations || '').split(' · ').join('\n· ')}
            </p>
          </EuiText>
        );
      }

      return acc;
    },
    {},
  );

  const parameterColumns = [
    {
      field: 'id',
      name: 'Parámetro',
      width: '100px',
    },
    {
      field: 'label',
      name: 'Nombre',
    },
    {
      field: 'value',
      name: 'Valor aplicado',
    },
    {
      field: 'required',
      name: 'Obligatorio',
      width: '100px',
    },
    {
      field: 'requirements',
      name: 'Requisitos',
      width: '160px',
    },
    {
      field: 'status',
      name: 'Estado',
      width: '170px',
      render: status => (
        <EuiBadge
          color={parameterBadgeColor(status)}
        >
          {status}
        </EuiBadge>
      ),
    },
    {
      field: 'ifNotConfigured',
      name: 'Tratamiento si falta',
    },
  ];

  const columns = [
    {
      field: 'campo',
      name: 'Campo del informe',
      width: '38%',
    },
    {
      field: 'valor',
      name: 'Valor',
    },
    {
      field: 'ev',
      name: 'Evidencia',
      width: '170px',
      render: (ev, item) => (
        <EuiBadge
          color={evidenceBadgeColor(item.status)}
        >
          {ev} · {item.status}
        </EuiBadge>
      ),
    },
  ];

  const pdfColor = (c) =>
    c === 'success'
      ? '#4caf50'
      : c === 'warning'
      ? '#f5a700'
      : c === 'danger'
      ? '#e53935'
      : '#69707d';

  const evidencePdfColor = (status) =>
    status === 'CUMPLE'
      ? '#4caf50'
      : status === 'PARCIAL'
      ? '#f5a700'
      : status === 'NO_CUMPLE'
      ? '#e53935'
      : '#69707d';

  const exportarPDF = () => {
    const now = new Date();
    const fechaEmision = now.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const formatPercent = (value) =>
      value !== null
        ? value + '%'
        : 'N/A';

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      footer: (currentPage, pageCount) => ({
        columns: [
          { text: 'Informe generado automaticamente por ENSFacil sobre Wazuh', alignment: 'left', fontSize: 7, color: '#999', margin: [40, 0, 0, 0] },
          { text: currentPage + ' / ' + pageCount, alignment: 'right', fontSize: 7, color: '#999', margin: [0, 0, 40, 0] },
        ],
      }),
      content: [
        { text: 'INFORME DE CUMPLIMIENTO ENS', style: 'h1' },
        { text: (CONTROL_META[controlId]?.name || controlId), style: 'h2' },
        { text: 'RD 311/2022 - Esquema Nacional de Seguridad', style: 'sub' },
        { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: '#cccccc' }], margin: [0, 4, 0, 12] },

        {
          columns: [
            { width: '50%', stack: [
              { text: 'Activo evaluado', style: 'metaLabel' },
              { text: agente, style: 'metaValue' },
              { text: 'Periodo evaluado', style: 'metaLabel' },
              {
                text: evaluationPeriodText,
                style: 'metaValue',
              },
            ]},
            { width: '50%', stack: [
              { text: 'Fecha de emision', style: 'metaLabel' },
              { text: fechaEmision, style: 'metaValue' },
              { text: 'Estado global del control', style: 'metaLabel' },
              { text: semaforo.label, style: 'metaValue', color: pdfColor(semaforo.color), bold: true },
            ]},
          ],
          margin: [0, 0, 0, 16],
        },

        { text: 'Resultado consolidado del motor ENS', style: 'h3' },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*'],
            body: [
              [
                { text: 'Nivel ENS evaluado', style: 'th' },
                { text: 'Puntuación', style: 'th' },
                { text: 'Cobertura', style: 'th' },
              ],
              [
                {
                  text: String(motorLevel),
                  style: 'scoreCell',
                  color: '#006bb4',
                },
                {
                  text: formatPercent(motorScore),
                  style: 'scoreCell',
                  color: pdfColor(semaforo.color),
                },
                {
                  text: formatPercent(motorCoverage),
                  style: 'scoreCell',
                  color:
                    motorCoverage === null
                      ? '#69707d'
                      : '#006bb4',
                },
              ],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 16],
        },

        { text: 'Detalle de evidencias del control', style: 'h3' },
        {
          table: {
            headerRows: 1,
            widths: ['38%', '*', 'auto'],
            body: [
              [
                { text: 'Campo del informe', style: 'th' },
                { text: 'Valor', style: 'th' },
                { text: 'Evidencia', style: 'th' },
              ],
              ...rows.map((r) => [
                {
                  text: r.campo,
                  style: 'td',
                },
                {
                  text: r.valor,
                  style: 'td',
                },
                {
                  text: `${r.ev} · ${r.status}`,
                  style: 'td',
                  color: evidencePdfColor(r.status),
                  bold: true,
                },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },

        {
          text: 'Estado de los requisitos ENS',
          style: 'h3',
          margin: [0, 16, 0, 6],
        },
        {
          table: {
            headerRows: 1,
            widths: [
              'auto',
              '*',
              'auto',
              'auto',
            ],
            body: [
              [
                {
                  text: 'Requisito',
                  style: 'th',
                },
                {
                  text: 'Descripción y observaciones',
                  style: 'th',
                },
                {
                  text: 'Nivel',
                  style: 'th',
                },
                {
                  text: 'Estado',
                  style: 'th',
                },
              ],
              ...requirementRows.map(
                requirement => [
                  {
                    text: requirement.id,
                    style: 'td',
                  },
                  {
                    text: [
                      requirement.title,
                      requirement.evidences !== '-'
                        ? `Evidencias: ${requirement.evidences}`
                        : undefined,
                      requirement.observations !==
                        'Sin observaciones'
                        ? requirement.observations
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                    style: 'td',
                  },
                  {
                    text: requirement.level,
                    style: 'td',
                  },
                  {
                    text: requirement.status,
                    style: 'td',
                    color:
                      evidencePdfColor(
                        requirement.status,
                      ),
                    bold: true,
                  },
                ],
              ),
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 16],
        },

        {
          text: 'Parámetros aplicados por el motor ENS',
          style: 'h3',
        },
        {
          table: {
            headerRows: 1,
            widths: [
              'auto',
              '*',
              'auto',
              '*',
            ],
            body: [
              [
                {
                  text: 'ID',
                  style: 'th',
                },
                {
                  text: 'Parámetro y valor',
                  style: 'th',
                },
                {
                  text: 'Estado',
                  style: 'th',
                },
                {
                  text: 'Requisitos y tratamiento',
                  style: 'th',
                },
              ],
              ...parameterRows.map(
                parameter => [
                  {
                    text: parameter.id,
                    style: 'td',
                  },
                  {
                    text:
                      `${parameter.label}: ` +
                      parameter.value,
                    style: 'td',
                  },
                  {
                    text: parameter.status,
                    style: 'td',
                    color:
                      parameter.status ===
                      'CONFIGURED'
                        ? '#4caf50'
                        : parameter.status ===
                          'INVALID'
                        ? '#e53935'
                        : parameter.status ===
                          'NOT_CONFIGURED'
                        ? '#f5a700'
                        : '#69707d',
                    bold: true,
                  },
                  {
                    text: [
                      `Obligatorio: ${parameter.required}`,
                      `Requisitos: ${parameter.requirements}`,
                      `Si falta: ${parameter.ifNotConfigured}`,
                    ].join(' · '),
                    style: 'td',
                  },
                ],
              ),
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
        scoreCell: { fontSize: 18, bold: true, alignment: 'center', margin: [0, 6, 0, 6] },
      },
      defaultStyle: { fontSize: 10 },
    };

    const nombre = 'Informe_ENS_' + controlId + '_' + (agentId ? agente.replace(/[^a-zA-Z0-9]/g, '_') : 'general') + '.pdf';
    (pdfMake as any).createPdf(docDefinition).download(nombre);
  };

  // Sin panel propio: el informe se renderiza ya dentro de la sección plegable
  // de su control, que es la que pone el marco. Anidar dos paneles solo añadía
  // un borde dentro de otro.
  return (
    <>
      <EuiFlexGroup justifyContent='spaceBetween' alignItems='flexStart'>
        <EuiFlexItem>
          <EuiTitle size='m'><h2>{CONTROL_META[controlId]?.name || controlId}</h2></EuiTitle>
          <EuiText size='s' color='subdued'>
            <p>
              Informe de cumplimiento ENS · RD 311/2022
            </p>
            <p>
              Activo: {agente} · Periodo evaluado: {evaluationPeriodText}
            </p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}><EuiHealth color={semaforo.color}>{semaforo.label}</EuiHealth></EuiFlexItem>
      </EuiFlexGroup>
      <EuiHorizontalRule margin='m' />
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiText size='s' color='subdued'>
            <p>Nivel ENS evaluado</p>
          </EuiText>
          <EuiTitle size='l'>
            <h3>{motorLevel}</h3>
          </EuiTitle>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiText size='s' color='subdued'>
            <p>Puntuación del motor</p>
          </EuiText>
          <EuiTitle size='l'>
            <h3>
              {motorScore !== null
                ? motorScore + '%'
                : 'N/A'}
            </h3>
          </EuiTitle>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiText size='s' color='subdued'>
            <p>Cobertura evaluada</p>
          </EuiText>
          <EuiTitle size='l'>
            <h3>
              {motorCoverage !== null
                ? motorCoverage + '%'
                : 'N/A'}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiText size='xs' color='subdued'>
        <p>
          Evaluación del motor: {fmt(motorEvaluatedAt)}
        </p>
      </EuiText>
      <EuiSpacer size='l' />
      <EuiTitle size='xs'><h3>Campos del informe</h3></EuiTitle>
      <EuiSpacer size='s' />
      <EuiBasicTable
        items={rows}
        columns={columns}
      />

      <EuiSpacer size='l' />

      <EuiTitle size='xs'>
        <h3>Estado de los requisitos ENS</h3>
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
        <h3>Parámetros aplicados por el motor ENS</h3>
      </EuiTitle>

      <EuiText
        size='s'
        color='subdued'
      >
        <p>
          Los valores y estados proceden de la configuración
          activa utilizada durante la evaluación.
        </p>
      </EuiText>

      <EuiSpacer size='s' />

      <EuiBasicTable
        items={parameterRows}
        columns={parameterColumns}
      />

      <EuiSpacer size='l' />

      <EuiButton
        iconType='download'
        size='s'
        fill
        onClick={exportarPDF}
      >
        Exportar PDF
      </EuiButton>
    </>
  );
};

// Un control en la lista de informes. Todo sale del catálogo estático, sin
// consultar a OpenSearch: es lo que permite listar los controles sin evaluar
// ninguno.
interface ControlReportEntry {
  controlId: string;
  title: string;
  levels: string;
  requirementCount: number;
  evidenceCount: number;

  // Identificadores por los que responde al filtro: el del control y los de sus
  // requisitos, del mismo espacio jerárquico (`op.acc.1`, `op.acc.1.2`).
  filterableIds: string[];
}

// Cabecera plegable de un control. NO lleva semáforo a propósito: el estado sale
// de evaluar, y evaluar es justamente lo que se aplaza hasta que la sección se
// abre. Poner aquí un color exigiría lanzar las N consultas que este cambio
// evita, y un color obtenido a medias sería peor que no ponerlo. El estado
// consolidado de un vistazo está en la pestaña Controles.
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
  </EuiFlexGroup>
);

// Componente público: filtro por prefijo + un informe plegable por control.
export const InformesENS = () => {
  const [prefix, setPrefix] = React.useState<string>('');

  const [openControlIds, setOpenControlIds] = React.useState<
    Record<string, boolean | undefined>
  >({});

  // Cambiar el filtro devuelve las secciones a su estado por defecto.
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
      })).sort((a, b) => compareENSIds(a.controlId, b.controlId)),
    [],
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
          <h3>Informe de cumplimiento ENS</h3>
        </EuiTitle>
        <EuiText size='s' color='subdued'>
          <p>
            Filtra por prefijo del identificador ENS y despliega el control cuyo
            informe quieras ver. Cada informe se evalúa al abrirlo.
          </p>
        </EuiText>

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
                  ? `Mostrando ${filtered.matched.length} de ${entries.length} control(es); ${filtered.hidden.length} fuera del filtro.`
                  : `${entries.length} control(es). Sin filtro.`}
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

        {/* Los informes que el filtro deja fuera se nombran uno a uno: son
            pocos por definición y decir cuáles evita que un control con
            hallazgos desaparezca sin más de la pantalla. */}
        {filtered.isActive && filtered.hidden.length > 0 && (
          <>
            <EuiSpacer size='s' />
            <EuiText size='xs' color='subdued'>
              <p>
                Sin informe en pantalla por el filtro:{' '}
                {filtered.hidden.map(entry => entry.controlId).join(', ')}.
              </p>
            </EuiText>
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
            <EuiText size='s'>
              <p>
                Sin filtro hay {entries.length} control(es) con informe
                disponible.
              </p>
            </EuiText>
            <EuiSpacer size='s' />
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
                {/* Montado SOLO cuando la sección está abierta. Cada
                    `<ControlReport>` lanza su propia consulta a OpenSearch y la
                    repite cada 15 s: con los tres controles de hoy eran tres
                    consultas en marcha a la vez sin haber pedido nada, y con
                    treinta serían treinta. Cerrado no consulta. */}
                {isOpen(entry.controlId) ? (
                  <ControlReport controlId={entry.controlId} />
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
