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
import { getActiveENSConfiguration } from '../../../common/ens/configuration/services';
// Del fichero de tipos, nunca del barrel `../core`: `import type` se borra
// entero al compilar y no añade ninguna arista al grafo de módulos (ahí vive el
// ciclo transitivo del TDZ de `Settings`).
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

// Longitud máxima de las observaciones en la tabla. El texto completo queda al
// expandir la fila y en el PDF.
const OBSERVATION_PREVIEW_LENGTH = 90;

const COLOR_SECUNDARIO_PDF = '#69707d';

// Por qué no se ha podido demostrar un requisito. Mismo vocabulario que la
// ficha del control (`controls/control-detail`): la etiqueta que lee el auditor
// en las dos pantallas tiene que ser literalmente la misma cadena.
const ETIQUETA_DE_CAUSA: Record<string, string> = {
  CATALOG: 'catálogo',
  CONFIGURATION: 'sin configurar',
  COLLECTION: 'sin recogida',
  EVIDENCE: 'evidencia insuficiente',
};

// El título del informe y el selector de modelo viven en `./registry`, que
// devuelve `undefined` para un control sin modelo en vez de fabricarle el de
// otro. Ver la cabecera de ese fichero.

// Subcomponente: informe completo de UN control. Los hooks viven aquí (no
// pueden ir en bucle), así que la lista renderiza uno por control.
//
// Recibe la definición de informe YA RESUELTA, y por eso solo se monta para
// controles que tienen modelo: quien decide es el componente de la lista. Así
// no hay ninguna rama condicional por encima de los hooks y, de paso, un control
// sin modelo no lanza la consulta a OpenSearch que no va a poder usar.
// El resultado de TODOS los controles para el informe que lo pide
// (`usesAllControls`, op.mon.2). Lo pide `<ControlReportWithPanorama>` al
// servidor aparte: el veredicto del control sigue saliendo de la evaluación de
// ESE control, igual que en el detalle, y no del conjunto.
interface ENSReportPanorama {
  // `undefined` mientras la evaluación está en curso o ha fallado: el informe
  // enseña SIN_DATOS, nunca un panorama de otra máquina.
  results?: ENSComplianceResult[];
  loading: boolean;
  error?: Error;
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

  // El resultado del control lo calcula el servidor con TODOS sus hechos de la
  // ventana (hasta 1.1.0, los 10.000 más recientes, evaluados en el navegador).
  const evaluacion = useEnsEvaluation<{ result?: ENSComplianceResult; meta?: ENSEvaluationMeta }>({
    include: 'control',
    controlId,
    agentId,
  });
  const { error } = evaluacion;
  const complianceResult = evaluacion.data?.result;
  const ensLevel = evaluacion.data?.meta?.level || activeConfiguration.global.ensLevel;
  // Un informe solo se pinta (y se exporta) con un resultado real de ESTA
  // selección: mientras llega, ni NO_EVALUABLE ni N/A de relleno.
  const hayResultado = Boolean(evaluacion.data && complianceResult);

  const panoramaResults = panorama?.results;

  const reportModel = useMemo(
    () => definition.build(complianceResult, panoramaResults),
    [definition, complianceResult, panoramaResults],
  );

  // `?? null` y no solo el ternario: un control sin medir se publica SIN
  // número, así que `score` puede venir `undefined`, y `undefined !== null` es
  // cierto — el informe imprimiría "undefined%" donde debe poner N/A.
  const motorScore = complianceResult ? complianceResult.score ?? null : null;
  const motorCoverage = complianceResult ? complianceResult.coverage : null;
  const motorLevel = complianceResult?.level || ensLevel;
  const motorEvaluatedAt = complianceResult?.evaluatedAt || '-';

  // El par diagnóstico: el porcentaje divide por los APLICABLES, y cuántos de
  // ellos se han llegado a demostrar es otro número. «60 %, 5 de 8 demostrados»
  // y «60 %, 8 de 8» son dos máquinas muy distintas con el mismo porcentaje.
  const motorApplicable = complianceResult?.applicableRequirements ?? null;
  const motorMeasured = complianceResult?.measuredRequirements ?? null;

  const estado = complianceResult?.status || 'NO_EVALUABLE';

  // Un color, tres consumidores. `EuiHealth` acepta 'subdued'; `EuiStat`, no.
  const semaforo =
    estado === 'CUMPLE'
      ? { health: 'success', stat: 'success', pdf: '#4caf50' }
      : estado === 'PARCIAL'
      ? { health: 'warning', stat: 'warning', pdf: '#f5a700' }
      : estado === 'NO_CUMPLE'
      ? { health: 'danger', stat: 'danger', pdf: '#e53935' }
      : { health: 'subdued', stat: 'default', pdf: COLOR_SECUNDARIO_PDF };

  const evidenceResults = complianceResult?.evidences || [];
  const requirementResults = complianceResult?.requirements || [];
  const parameterResults = complianceResult?.parameters || [];
  const nonConformities = complianceResult?.nonConformities || [];

  const evidenceAgent = evidenceResults.find(
    evidence => evidence.agentName || evidence.agentId,
  );

  const agente = agentId
    ? (evidenceAgent?.agentName || evidenceAgent?.agentId || `Agente ${agentId}`)
    : 'Todos los agentes';

  const formatPercent = (value) => (value !== null ? value + '%' : 'N/A');

  const demostradosTexto =
    motorApplicable === null
      ? 'N/A'
      : `${motorMeasured ?? 0}/${motorApplicable}`;

  // Las filas y los colores viven en `./report-rows`, fuera del componente: es
  // lo único de esta pantalla que se puede probar sin React ni EUI, y era justo
  // donde estaba el fallo de la columna «Evidencia».
  const rows: ENSReportRow[] = buildENSReportRows(reportModel);

  // MEDIDO / NO EVIDENCIADO. El veredicto es el mismo a propósito —lo no
  // demostrado cuenta en contra—, así que la distinción no puede salir del
  // estado: sale de `evidenced` y, cuando falta prueba, de la `cause` de sus no
  // conformidades. Una se corrige en la máquina; la otra, habilitando la prueba.
  const causasDeRequisito = (requirementId: string): string[] => {
    const causas: string[] = [];

    nonConformities.forEach(nonConformity => {
      if (
        nonConformity.requirementId !== requirementId ||
        nonConformity.origin !== 'NO_EVIDENCIADA' ||
        !nonConformity.cause
      ) {
        return;
      }

      const etiqueta =
        ETIQUETA_DE_CAUSA[nonConformity.cause] || nonConformity.cause;

      if (causas.indexOf(etiqueta) < 0) {
        causas.push(etiqueta);
      }
    });

    return causas;
  };

  // La etiqueta sale de `./report-rows` (`ensRequirementProofLabel`), donde se
  // puede probar: acreditado documentalmente, medido o no evidenciado.
  const etiquetaDePrueba = (requirement: ENSRequirementResult): string =>
    ensRequirementProofLabel(
      requirement,
      causasDeRequisito(requirement.id)
    );

  // De la evidencia al evento crudo: regla, id del evento y cuándo se vio. Es
  // el tramo de la cadena que el informe no llevaba, y sin él el auditor se
  // queda en «EV-03» sin poder ir a mirarlo.
  const trazaDeEvidencias = (evidenceIds: string[]): string[] =>
    (evidenceIds || []).map(id => {
      const evidence = evidenceResults.find(item => item.id === id);

      const partes = [
        evidence?.resolvedRuleId ? `regla ${evidence.resolvedRuleId}` : null,
        evidence?.resolvedEventId ? `evento ${evidence.resolvedEventId}` : null,
        evidence?.lastSeen ? fmt(evidence.lastSeen) : null,
      ].filter(Boolean);

      return `${id} · ${partes.length > 0 ? partes.join(' · ') : 'sin evento'}`;
    });

  const requirementRows = requirementResults.map(requirement => ({
    id: requirement.id,
    title: requirement.title,
    status: requirement.status,
    prueba: etiquetaDePrueba(requirement),
    level: requirement.level.join(', ') || '-',
    evidences: (requirement.evidenceIds || []).join(', ') || '-',
    observationList: requirement.observations || [],
    observations: (requirement.observations || []).join(' · '),
    traza: trazaDeEvidencias(requirement.evidenceIds || []),
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
    required: parameter.required ? 'Sí' : 'No',
    requirements: parameter.requirements.join(', ') || '-',
    // Solo en los dos estados en los que el motor aplica de verdad el
    // tratamiento por defecto —los mismos que `unusableParametersFor` del
    // motor—. En un CONFIGURED no se aplica, y en un NOT_APPLICABLE no falta
    // nada: «Si falta» bajo un parámetro que no aplica es sencillamente falso.
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
      : COLOR_SECUNDARIO_PDF;

  const tieneDetalle = (item: { observations: string; traza: string[] }) =>
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
      // Veredicto arriba, prueba debajo. La misma columna sostiene las dos
      // capas: qué se ha decidido y sobre qué base.
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
        tieneDetalle(item) ? (
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

      // `tieneDetalle` además de encontrar la fila: es la misma condición que
      // decide si se pinta el botón de expandir, y sin ella un id que se quedó
      // en `expandedReqIds` abre un panel vacío que ya no tiene botón con el
      // que volver a cerrarse.
      if (row && tieneDetalle(row)) {
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
                  {row.traza.map((linea, index) => (
                    <li key={index}>{linea}</li>
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
      // «Si falta» vivía dentro de la columna «Estado», que mide 210 px: el
      // texto se partía en tiras de dos palabras y estiraba la fila hasta
      // media pantalla. Aquí tiene ancho, y además se lee pegado al parámetro
      // que le falta, que es de lo que habla.
      render: (parametro: string, item: { ifNotConfigured: string }) => (
        <>
          <EuiText size='xs'>{parametro}</EuiText>
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
      // El hallazgo arriba y, debajo y en gris, contra qué se comparó.
      //
      // Y PLEGADO, con el mismo panel que el motivo. Un valor de mp.info.6
      // llega a ser «Retención configurada: SIN_DATOS · Consolidación por
      // agente: wazuh-real (024)=NO_EVALUABLE, … · 2026-08-02T23:30:02.722+0000
      // · control_state · …» repetido seis veces. Escrito entero en la celda no
      // solo era ilegible: sus marcas de tiempo son introzables, así que el
      // navegador le robaba el ancho a la columna «Evidencia» hasta dejarla
      // escribiendo «E V - 0 1» en vertical. Plegarlo devuelve el ancho a la
      // tabla y el texto completo sigue a un clic.
      render: (valor: string, item: ENSReportRow) => (
        <>
          <MotiveCell
            lineas={valor
              .split(' · ')
              .map(texto => texto.trim())
              .filter(Boolean)
              .map(texto => ({ texto }))}
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
      // El nombre del campo sale de `./report-rows`, donde se construye la
      // fila. Aquí decía `'ev'`, una clave que la fila no tuvo nunca, y la
      // insignia salía vacía en los informes de los tres controles.
      field: ENS_REPORT_EVIDENCE_FIELD,
      name: 'Evidencia',
      width: '190px',
      render: (evidencia: string, item: ENSReportRow) => (
        <>
          <EuiBadge color={ensReportStatusBadgeColor(item.estado)}>
            {item.estado}
          </EuiBadge>
          <EuiText size='xs'>{evidencia}</EuiText>
          {item.datosPendientes ? (
            <EuiText size='xs' color='subdued'>
              {item.datosPendientes}
            </EuiText>
          ) : null}
        </>
      ),
    },
  ];

  const exportarPDF = () => {
    // Un informe firmado sin el resultado de esta selección no se emite.
    if (error || !complianceResult) return;
    // Ni uno que recopila todos los controles mientras su evaluación no ha vuelto.
    if (panorama?.loading) return;
    const now = new Date();
    const fechaEmision = now.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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
              { text: agente, style: 'metaValue' },
              { text: 'Periodo evaluado', style: 'metaLabel' },
              { text: evaluationPeriodText, style: 'metaValue' },
            ]},
            { width: '50%', stack: [
              { text: 'Fecha de emision', style: 'metaLabel' },
              { text: fechaEmision, style: 'metaValue' },
              { text: 'Estado del control', style: 'metaLabel' },
              { text: estado, style: 'metaValue', color: semaforo.pdf, bold: true },
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
                { text: String(motorLevel), style: 'scoreCell', color: '#006bb4' },
                { text: formatPercent(motorScore), style: 'scoreCell', color: semaforo.pdf },
                {
                  text: formatPercent(motorCoverage),
                  style: 'scoreCell',
                  color: motorCoverage === null ? COLOR_SECUNDARIO_PDF : '#006bb4',
                },
                {
                  text: demostradosTexto,
                  style: 'scoreCell',
                  // `> 0` y no solo la igualdad: un control en borrador no tiene
                  // requisitos aplicables, y «0/0» cumple la igualdad. Pintarlo
                  // verde en el documento que se firma es afirmar que está todo
                  // demostrado justo donde no se ha medido nada.
                  color:
                    motorApplicable !== null &&
                    motorApplicable > 0 &&
                    motorMeasured === motorApplicable
                      ? '#4caf50'
                      : COLOR_SECUNDARIO_PDF,
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
            // Ancho fijo para «Evidencia» y no `'auto'`: la celda es la lista de
            // evidencias, y con `'auto'` pdfMake le daba a la columna el ancho
            // del renglón sin partir —hasta ocho identificadores— y
            // estrangulaba «Valor».
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
            // «Estado» con ancho FIJO, no `'auto'`. Desde que la celda lleva la
            // línea de prueba debajo del veredicto, su renglón más largo es
            // «No evidenciado · evidencia insuficiente» (~175 pt), y `'auto'`
            // se lo daría entero sin partir: entre las tres columnas `'auto'`
            // se comerían 315 de los 515 pt de la caja y estrangularían la
            // descripción, que es la que ahora carga además la trazabilidad.
            // Es el mismo fallo que ya se corrigió en la tabla de campos.
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
                  // El veredicto y, debajo, si está medido o no evidenciado con
                  // su causa. El documento firmado no puede fundir las dos: un
                  // requisito que no se ha podido demostrar y uno que falla
                  // medido restan igual y se arreglan al revés.
                  style: 'td',
                  text: [
                    {
                      text: requirement.status,
                      color: ensReportStatusPdfColor(requirement.status),
                      bold: true,
                    },
                    ...(requirement.prueba
                      ? [{ text: `\n${requirement.prueba}`, color: COLOR_SECUNDARIO_PDF }]
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
                  text: `${parameter.parametro}: ${parameter.value}`,
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
                            color: COLOR_SECUNDARIO_PDF,
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

    const nombre = 'Informe_ENS_' + controlId + '_' + (agentId ? agente.replace(/[^a-zA-Z0-9]/g, '_') : 'general') + '.pdf';
    (pdfMake as any).createPdf(docDefinition).download(nombre);
  };

  // Sin la evaluación de ahora, ni informe ni PDF: «Reintentar» la vuelve a pedir.
  if (error) {
    return (
      <>
        <FactsReadErrorCallOut error={error} onRetry={evaluacion.retry} />
        <EuiSpacer size='m' />
        <EuiButton iconType='download' size='s' fill isDisabled>
          Exportar PDF
        </EuiButton>
      </>
    );
  }

  if (!hayResultado) {
    return (
      <>
        <EvaluationLoading message='Evaluando el control en el servidor con todos los hechos de la ventana…' />
        <EuiButton iconType='download' size='s' fill isDisabled>
          Exportar PDF
        </EuiButton>
      </>
    );
  }

  // Sin panel propio: el informe se renderiza ya dentro de la sección plegable
  // de su control, que es la que pone el marco.
  return (
    <>
      {/* Sin título: el del control ya está en la cabecera del acordeón que
          envuelve este informe. `definition.name` encabeza el PDF, que sí sale
          suelto del contexto de la pantalla. */}
      <EvaluationStatusLine meta={evaluacion.data?.meta} refreshing={evaluacion.isRefreshing} />
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
            </EuiText>
          </EuiCallOut>
          <EuiSpacer size='s' />
        </>
      ) : null}
      <EuiFlexGroup justifyContent='spaceBetween' alignItems='center'>
        <EuiFlexItem>
          <EuiText size='xs' color='subdued'>
            <p>
              {agente} · periodo {evaluationPeriodText} · evaluado{' '}
              {fmt(motorEvaluatedAt)}
            </p>
          </EuiText>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiHealth color={semaforo.health}>{estado}</EuiHealth>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule margin='m' />

      <EuiFlexGroup gutterSize='l'>
        <EuiFlexItem>
          <EuiStat title={String(motorLevel)} description='Nivel ENS' />
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiStat
            title={formatPercent(motorScore)}
            description='Cumplimiento'
            titleColor={semaforo.stat}
          />
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiStat
            title={formatPercent(motorCoverage)}
            description='Cobertura'
          />
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiStat
            title={demostradosTexto}
            description='Requisitos demostrados'
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size='l' />

      <EuiTitle size='xs'>
        <h3>Campos del informe</h3>
      </EuiTitle>

      <EuiSpacer size='s' />

      {/* ANCHO FIJO. Con el reparto automático del navegador, la celda de
          «Valor» —que puede traer marcas de tiempo sin punto de corte— se
          quedaba el ancho de la fila y estrangulaba «Evidencia» hasta
          escribirla letra a letra en vertical. */}
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

      <EuiButton iconType='download' size='s' fill onClick={exportarPDF} isDisabled={Boolean(error) || !complianceResult || Boolean(panorama?.loading)}>
        Exportar PDF
      </EuiButton>
    </>
  );
};

// El informe de un control que recopila el de TODOS (`usesAllControls`,
// op.mon.2). Lanza una SEGUNDA consulta, con el filtro y el tope del panel, solo
// para calcular el resultado de cada control; el del propio control sigue
// saliendo de la consulta de sus hechos dentro de `<ControlReport>`, como en el
// detalle. Los demás informes no pasan por aquí y no cambian.
const ControlReportWithPanorama = ({
  controlId,
  definition,
}: {
  controlId: string;
  definition: ENSReportModelDefinition;
}) => {
  const { agentId } = useRouterSearch();

  // El panorama (el resultado de todos los controles) lo calcula el servidor
  // con todos los hechos de la ventana: ya no hay tope ni hechos recortados.
  // El hook no devuelve nunca el de otra máquina como si fuera de esta: con
  // otra clave, `data` vuelve a estar vacío hasta que llega el suyo (lo que
  // antes resolvía `panorama-vigente.ts` para `useEsSearch`).
  const evaluacion = useEnsEvaluation<{ results: ENSComplianceResult[] }>({
    include: 'results',
    agentId,
  });
  const { error } = evaluacion;
  const vigente = {
    valor: evaluacion.data ? { results: evaluacion.data.results } : undefined,
    cargando: !evaluacion.data && !error,
  };

  return (
    <ControlReport
      controlId={controlId}
      definition={definition}
      panorama={{
        results: vigente.valor?.results,
        loading: vigente.cargando,
        error,
      }}
    />
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

  // El modelo de informe del control, o `undefined` si todavía no tiene. Se
  // resuelve AQUÍ, en la lista, y no dentro de `<ControlReport>`: así el
  // componente que sí genera informe solo se monta cuando hay modelo.
  reportModelDefinition?: ENSReportModelDefinition;
}

// Cabecera plegable de un control. NO lleva semáforo a propósito: el estado sale
// de evaluar, y evaluar es lo que se aplaza hasta que la sección se abre. El
// estado consolidado de un vistazo está en la pestaña Controles.
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

// Un control sin modelo de informe no estrena el de otro: el selector caía por
// defecto en mp.info.6 y producía un documento plausible y equivocado, listo
// para firmar. Aquí no se genera nada.
const ControlSinModeloDeInforme = ({
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
        reportModelDefinition: getENSReportModelDefinition(control.id),
      })).sort((a, b) => compareENSIds(a.controlId, b.controlId)),
    [],
  );

  // Los controles del catálogo a los que les falta el modelo de informe. Se
  // nombran arriba del todo y SIN filtrar: el olvido tiene que verse al entrar
  // en la pantalla, no solo si a alguien se le ocurre desplegar ese control.
  const sinModeloDeInforme = React.useMemo(
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

        {/* Los informes que el filtro deja fuera se nombran uno a uno: son
            pocos por definición y decir cuáles evita que un control con
            hallazgos desaparezca sin más de la pantalla. */}
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

        {/* Al margen del filtro: qué controles del catálogo no tienen todavía
            modelo de informe. Antes este olvido no tenía síntoma —el control
            abría el informe de mp.info.6 y parecía completo—. */}
        {sinModeloDeInforme.length > 0 && (
          <>
            <EuiSpacer size='s' />
            <EuiCallOut
              size='s'
              color='warning'
              iconType='alert'
              title={`Sin modelo de informe: ${sinModeloDeInforme.join(', ')}`}
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
                {/* Montado SOLO cuando la sección está abierta. Cada
                    `<ControlReport>` pide la evaluación de su control al
                    servidor: cerrado no pide nada. Y solo si el control TIENE
                    modelo: sin modelo no hay informe de repuesto. */}
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
                    <ControlSinModeloDeInforme entry={entry} />
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
