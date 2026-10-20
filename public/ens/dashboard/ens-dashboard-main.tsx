import React from 'react';
import { useRouterSearch } from '../../routing/use-router-search';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { MaturityDistributionPanel } from '../maturity/maturity-distribution';
import type { ENSMaturityListEntry } from '../../../common/ens/evaluation/types';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import { EvaluationLoading, EvaluationStatusLine } from '../../evaluation/evaluation-status';
import { getActiveENSConfiguration } from '../../../common/ens/configuration/services';
import { IncoherentLevelsNotice } from '../configuration/components/incoherent-levels-notice';
import { EuiBadge, EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiSpacer, EuiText } from '@elastic/eui';
import type { ENSControlSummaryEntry, ENSEvaluationMeta } from '../../../common/ens/evaluation/types';
import type { buildENSDashboardModel } from '../../../common/ens/core/dashboard-adapter/dashboard-adapter';
import { formatTimestamp } from '../../../common/ens/evaluation/motive-parser';

const findingSeverityColor = (severity: string): string => {
  if (severity === 'OK') {
    return '#00A65A';
  }

  if (severity === 'WARNING') {
    return '#F5B700';
  }

  return '#BD271E';
};

// Severity of an operational alert: red when the engine judged it, amber for a warning.
const alertSeverityPresentation = (severity: string): { color: string; label: string } => {
  if (severity === 'error') {
    return { color: '#BD271E', label: 'INCIDENCIA' };
  }

  if (severity === 'warning') {
    return { color: '#F5A700', label: 'ADVERTENCIA' };
  }

  return { color: '#69707D', label: 'INFORMACIÓN' };
};

const requirementStatusPresentation = (
  status: string
): { color: string; label: string } => {
  if (status === 'NO_CUMPLE') {
    return { color: '#BD271E', label: 'No cumple' };
  }

  if (status === 'PARCIAL') {
    return { color: '#F5B700', label: 'Parcial' };
  }

  if (status === 'NO_EVALUABLE') {
    return { color: '#98A2B3', label: 'No evaluable' };
  }

  if (status === 'CUMPLE') {
    return { color: '#00A65A', label: 'Cumple' };
  }

  if (status === 'NO_APLICA') {
    return { color: '#69707D', label: 'No aplica' };
  }

  return { color: '#69707D', label: status };
};

export const EnsDashboardMain = () => {
  const { agentId } = useRouterSearch();

  // The panel is computed by the SERVER with all facts of the window; the browser receives the finished model.
  const evaluation = useEnsEvaluation<{ dashboard: ReturnType<typeof buildENSDashboardModel>; meta: ENSEvaluationMeta; controls?: ENSControlSummaryEntry[]; timeline?: unknown[]; maturity?: ENSMaturityListEntry; maturityError?: string }>({
    include: 'dashboard',
    agentId,
    timelineDays: 7,
  });
  const { error } = evaluation;
  const dashboardModel = evaluation.data?.dashboard;

  if (!dashboardModel) {
    // Without the result of THIS view nothing is shown: neither the previous machine's nor zeros that look like a verdict.
    return error ? (
      <div style={{ padding: 16 }}>
        <FactsReadErrorCallOut error={error} onRetry={evaluation.retry} />
      </div>
    ) : (
      <EvaluationLoading message='Evaluando los controles ENS en el servidor con todos los hechos de la ventana.' />
    );
  }

  // Partial first load: the panel figures cover ALL controls, so with some still computing they are not shown; the computed controls and 'Calculando…' are.
  const inProgress = evaluation.data?.meta?.pending;
  if (inProgress) {
    const controls = evaluation.data?.controls || [];
    return (
      <div style={{ padding: 16, background: '#F5F7FA', minHeight: 'calc(100vh - 120px)' }}>
        <EvaluationStatusLine meta={evaluation.data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />
        <EuiCallOut size='s' color='primary' iconType='clock' title='Calculando la evaluación'>
          <p>
            {inProgress.total - inProgress.rows} de {inProgress.total} filas (control × máquina) listas. Las cifras del panel
            aparecen cuando estén todos los controles; mientras, el estado de los ya calculados.
          </p>
        </EuiCallOut>
        <EuiSpacer size='m' />
        <EuiFlexGroup wrap gutterSize='s'>
          {controls.map(control => {
            const status = requirementStatusPresentation(control.status);
            return (
              <EuiFlexItem grow={false} key={control.controlId}>
                {control.pending ? (
                  <EuiBadge color='default' iconType='clock'>
                    {control.controlId} · Calculando…
                  </EuiBadge>
                ) : (
                  <EuiBadge color={status.color}>
                    {control.controlId} · {status.label}
                    {control.score !== undefined ? ` · ${control.score}%` : ''}
                  </EuiBadge>
                )}
              </EuiFlexItem>
            );
          })}
        </EuiFlexGroup>
      </div>
    );
  }

  const requirementsModel = dashboardModel.requirementsSummary;
  // The series is computed after the response (`meta.seriesPending`): the chart says so.
  const pendingSeries = Boolean(evaluation.data?.meta?.seriesPending) && !(evaluation.data?.timeline || []).length;
  const evolutionRows: typeof dashboardModel.evolution.rows = pendingSeries ? [] : dashboardModel.evolution.rows;

  const Donut = ({
    center,
    colorsList,
  }: {
    center: React.ReactNode;
    colorsList: string;
  }) => (
    <div
      style={{
        width: 112,
        height: 112,
        borderRadius: '50%',
        background: colorsList,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 20,
      }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        {center}
      </div>
    </div>
  );

  const legendDot = (color: string): React.CSSProperties => ({
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color,
    marginRight: 8,
  });

  const barSegment = (color: string, width: number): React.CSSProperties => ({
    display: 'inline-block',
    height: 12,
    width: `${Math.max(width, 0)}%`,
    background: color,
  });

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #D3DAE6',
    borderRadius: 4,
    padding: 16,
    minHeight: 150,
  };
  
  const title: React.CSSProperties = {
    fontWeight: 700,
    fontSize: 14,
    color: '#1A1C21',
    marginBottom: 12,
    textTransform: 'uppercase',
  };

  return (
    <div style={{ padding: 16, background: '#F5F7FA', minHeight: 'calc(100vh - 120px)' }}>
      <IncoherentLevelsNotice global={getActiveENSConfiguration()?.global} />
      <EvaluationStatusLine meta={evaluation.data?.meta} refreshing={evaluation.isRefreshing} onRetry={evaluation.retry} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={title}>ÍNDICE GLOBAL DE CUMPLIMIENTO ENS</div>

            {/* Without a single measured control there is no index to show: a red 0 % would be a false claim. */}
            <div
              style={{
                fontSize: 58,
                lineHeight: '60px',
                fontWeight: 700,
                color:
                  dashboardModel.compliance.measured === 0
                    ? '#69707D'
                    : dashboardModel.compliance.score >= 80
                    ? '#00A65A'
                    : dashboardModel.compliance.score >= 50
                    ? '#F5B700'
                    : '#BD271E',
              }}
            >
              {dashboardModel.compliance.measured === 0
                ? '—'
                : `${dashboardModel.compliance.score}%`}
            </div>

            <div style={{ fontSize: 16, color: '#69707D', marginTop: 4 }}>
             {dashboardModel.compliance.measured === 0
               ? 'Ningún control se ha podido medir todavía'
               : `Sobre ${dashboardModel.compliance.measured} de ${dashboardModel.compliance.total} controles medidos`}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gap: 8,
                marginTop: 22,
                textAlign: 'center',
              }}
             >

              <div>
                <b style={{ color: '#00A65A' }}>{dashboardModel.compliance.cumple}</b>
                <br />
                Cumplen
              </div>

              <div>
                <b style={{ color: '#F5B700' }}>{dashboardModel.compliance.parcial}</b>
                <br />
                Parcialmente
              </div>

             <div>
                <b style={{ color: '#BD271E' }}>{dashboardModel.compliance.noCumple}</b>
                <br />
                No cumplen
              </div>
         
              <div>
                <b style={{ color: '#98A2B3' }}>
                  {dashboardModel.compliance.noEvaluable}
                </b>
                <br />
                No evaluables
              </div>

              <div>
                <b style={{ color: '#69707D' }}>
                  {dashboardModel.compliance.noAplica}
                </b>
                <br />
                No aplicables
              </div>

              {dashboardModel.compliance.notMeasured > 0 && (
                <div title='Controles en el catálogo sin recolector todavía: no entran en el índice ni se juzgan.'>
                  <b style={{ color: '#69707D' }}>{dashboardModel.compliance.notMeasured}</b>
                  <br />
                  Sin medición todavía
                </div>
              )}
            </div>

            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#69707D' }}>
              Total controles evaluados: <b>{dashboardModel.compliance.total - dashboardModel.compliance.notMeasured}</b>
              {dashboardModel.compliance.notMeasured > 0 && (
                <> · sin medición todavía: <b>{dashboardModel.compliance.notMeasured}</b></>
              )}
            </div>
          </div>

          <div style={card}>
            <div style={title}>REQUISITOS EVALUADOS</div>

            <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
              <Donut
                center={
                  <span>
                    {requirementsModel.total}
                    <br />
                    Requisitos
                  </span>
                }
                colorsList={requirementsModel.statusDonut}
              />

              <div style={{ fontSize: 14, lineHeight: '22px' }}>
                <div>
                  <span style={legendDot('#00A65A')} />
                  {requirementsModel.cumple} Cumplen
                </div>
                <div>
                  <span style={legendDot('#F5B700')} />
                  {requirementsModel.parcial} Parcialmente
                </div>
                <div>
                  <span style={legendDot('#BD271E')} />
                  {requirementsModel.noCumple} No cumplen
                </div>
                <div>
                  <span style={legendDot('#98A2B3')} />
                  {requirementsModel.noEvaluable} No evaluables
                </div>
                <div>
                  <span style={legendDot('#D3DAE6')} />
                  {requirementsModel.noAplica} No aplicables
                </div>
                {requirementsModel.notMeasured > 0 && (
                  <div>
                    <span style={legendDot('#EEF1F5')} />
                    {requirementsModel.notMeasured} Sin medición todavía
                  </div>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12 }}>
              Total&nbsp;&nbsp;<b>{requirementsModel.total}</b>
            </div>
          </div>
           
        <div style={card}>
          <div style={title}>COBERTURA ENS</div>
          <div style={{ fontSize: 58, lineHeight: '60px', fontWeight: 700, color: '#006BB4', textAlign: 'center' }}>
            {dashboardModel.coverage.coveragePercent}%
          </div>
          <div style={{ textAlign: 'center', fontSize: 16 }}>
            Evidencias ENS verificadas
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 20 }}>
            <div><b>{dashboardModel.coverage.verifiedEvidences}</b><br />Verificadas</div>
            <div><b>{dashboardModel.coverage.pendingEvidences}</b><br />Pendientes</div>
          </div>
        </div>

        <div style={card}>
          <div style={title}>{dashboardModel.findings.title}</div>
          <div
            style={{
              fontSize: 58,
              lineHeight: '60px',
              fontWeight: 700,
              color: findingSeverityColor(dashboardModel.findings.severity),
            }}
          >
            {dashboardModel.findings.total}
          </div>
          <div style={{ fontSize: 12 }}>{dashboardModel.findings.description}</div>
          {/* The four origins are exclusive: they add up to the total. */}
          <div style={{ fontSize: 13, lineHeight: '22px', marginTop: 10 }}>
            <div title='Todas sus no conformidades son de medida: hay que corregir el sistema.'>
              Medidos: <b>{dashboardModel.findings.measuredFindings}</b>
            </div>
            <div title='Todas sus no conformidades son por falta de prueba: hay que habilitar la evidencia.'>
              No evidenciados: <b>{dashboardModel.findings.unevidencedFindings}</b>
            </div>
            <div title='Tienen no conformidades de los dos orígenes.'>
              Mixtos: <b>{dashboardModel.findings.mixedFindings}</b>
            </div>
            <div title='Desfavorables sin ninguna no conformidad asociada.'>
              Sin clasificar: <b>{dashboardModel.findings.unclassifiedFindings}</b>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            Última evaluación:<br />
            <b>{dashboardModel.findings.lastEvaluation}</b>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr 1.3fr', gap: 16, marginTop: 16 }}>
        <div style={card}>
          <div style={title}>CUMPLIMIENTO POR FAMILIA DE CONTROLES ENS</div>
          {dashboardModel.familyCompliance.rows.length ? (
            dashboardModel.familyCompliance.rows.map(row => (
              <div
                key={row.family}
                style={{
                  borderBottom: '1px solid #E6E9F0',
                  paddingBottom: 8,
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr 60px',
                    alignItems: 'center',
                    columnGap: 12,
                    marginBottom: 8,
                  }}
                >
                  <b>{row.family}</b>

                  <span style={{ color: '#343741' }}>
                   {row.label}
                  </span>

                  <b style={{ textAlign: 'right', color: '#006BB4' }}>
                    {row.evaluable > 0 ? `${row.percent}%` : 'SIN DATOS'}
                  </b>
                </div>

                <div
                  style={{
                    marginBottom: 6,
                    fontSize: 12,
                    color: '#69707D',
                 }}
                >
                 {row.evaluable} evaluables. · {row.cumple} cumple · {row.parcial} parcial · {row.noCumple} no cumple · {row.noEvaluable} no evaluable
                </div>

                <div
                  style={{
                    background: '#E5E7EB',
                    height: 12,
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={barSegment(
                      '#00A65A',
                      row.evaluable ? (row.cumple * 100) / row.evaluable : 0
                    )}
                  />
                  <span
                    style={barSegment(
                      '#F5B700',
                      row.evaluable ? (row.parcial * 100) / row.evaluable : 0
                    )}
                  />
                  <span
                    style={barSegment(
                      '#BD271E',
                      row.evaluable ? (row.noCumple * 100) / row.evaluable : 0
                    )}
                  />
                  <span
                    style={barSegment(
                      '#98A2B3',
                      row.evaluable
                        ? (row.noEvaluable * 100) / row.evaluable
                        : 0
                    )}
                  />
                </div>
              </div>
            ))
          ) : (
            <div>No hay controles ENS evaluados.</div>
          )}

          <div style={{ marginTop: 12, fontSize: 12 }}>
            <span style={legendDot('#00A65A')} /> Cumplen
            &nbsp;&nbsp;
            <span style={legendDot('#F5B700')} /> Parcialmente
            &nbsp;&nbsp;
            <span style={legendDot('#BD271E')} /> No cumplen
            &nbsp;&nbsp;
            <span style={legendDot('#98A2B3')} /> No evaluables
          </div>
        </div>

        <div style={card}>
          <div style={title}>DISTRIBUCIÓN DE REQUISITOS POR ESTADO</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Donut center={<span>{requirementsModel.total}<br />Requisitos</span>} colorsList={requirementsModel.statusDonut} />
            <div style={{ fontSize: 13, lineHeight: '26px', minWidth: 170 }}>
              <div>
                <span style={legendDot('#00A65A')} />
                Cumplen <b>{requirementsModel.cumple}</b> ({requirementsModel.cumplePercent}%)
              </div>

              <div>
                <span style={legendDot('#F5B700')} />
                Parcial <b>{requirementsModel.parcial}</b> ({requirementsModel.parcialPercent}%)
              </div>

              <div>
                <span style={legendDot('#BD271E')} />
                No cumplen <b>{requirementsModel.noCumple}</b> ({requirementsModel.noCumplePercent}%)
              </div>

              <div>
                <span style={legendDot('#98A2B3')} />
                No evaluables <b>{requirementsModel.noEvaluable}</b> ({requirementsModel.noEvaluablePercent}%)
              </div>

              <div>
                <span style={legendDot('#D3DAE6')} />
                No aplican <b>{requirementsModel.noAplica}</b> ({requirementsModel.noAplicaPercent}%)
              </div>

              {requirementsModel.notMeasured > 0 && (
                <div>
                  <span style={legendDot('#EEF1F5')} />
                  Sin medición todavía <b>{requirementsModel.notMeasured}</b> ({requirementsModel.notMeasuredPercent}%)
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={title}>{dashboardModel.requirementFindings.title}</div>

          {dashboardModel.requirementFindings.rows.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #D3DAE6' }}>
                  <th>Código</th>
                  <th>Requisito ENS</th>
                  <th>Familia</th>
                  <th>Estado</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                 {dashboardModel.requirementFindings.rows.map(row => {
                    const statusPresentation =
                      requirementStatusPresentation(row.status);

                    return (
                    <tr
                      key={row.requirementId}
                      style={{ borderBottom: '1px solid #E6E9F0' }}
                    >
                      <td>
                        <b>{row.requirementId}</b>
                      </td>
                      <td>{row.title}</td>
                      <td>{row.familyLabel}</td>
                      <td>
                        <span
                          style={{
                            color: statusPresentation.color,
                          }}
                        >
                          ●
                        </span>{' '}
                        {statusPresentation.label}
                      </td>
                      <td>
                        <b>{row.score}%</b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div
              style={{
                border: '1px solid #D3DAE6',
                borderRadius: 4,
                padding: 14,
                color: '#69707D',
                background: '#FAFBFC',
                fontSize: 13,
              }}
            >
              Todos los controles ENS evaluados se encuentran conformes o no aplicables.
            </div>
          )}
        </div>
      </div>
       
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1.1fr', gap: 16, marginTop: 16 }}>
        <div style={{ ...card, minHeight: 360 }}>
          <div style={title}>
            {dashboardModel.evolution.title}
          </div>

          <div
            style={{
              position: 'relative',
              height: 255,
              padding: '8px 14px 50px 78px',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 12,
                top: 8,
                bottom: 34,
                width: 42,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                color: '#1A1C21',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>

            <svg
              width='100%'
              height='220'
              viewBox='0 0 600 220'
              preserveAspectRatio='none'
              style={{
                overflow: 'visible',
                borderLeft: '1px solid #B9C3D0',
                borderBottom: '1px solid #B9C3D0',
              }}
            >
              {[0, 25, 50, 75, 100].map(value => {
                const y = 200 - value * 2;

                return (
                  <line
                    key={value}
                    x1='0'
                    y1={y}
                    x2='600'
                    y2={y}
                    stroke='#D3DAE6'
                    strokeDasharray={value === 0 ? '0' : '6 6'}
                    strokeWidth='1'
                  />
                );
              })}

              {evolutionRows.length > 0 && (
                <polygon
                  points={[
                    ...evolutionRows.map((row, index) => {
                      const x =
                        evolutionRows.length === 1
                          ? 300
                          : (index * 600) / (evolutionRows.length - 1);
                      const y = 200 - Math.max(0, Math.min(row.score, 100)) * 2;

                      return `${x},${y}`;
                    }),
                    `${
                      evolutionRows.length === 1
                        ? 300
                        : ((evolutionRows.length - 1) * 600) /
                          (evolutionRows.length - 1)
                    },200`,
                    `${evolutionRows.length === 1 ? 300 : 0},200`,
                  ].join(' ')}
                  fill='rgba(0, 107, 180, 0.16)'
                />
              )}

              <polyline
                fill='none'
                stroke='#006BB4'
                strokeWidth='3'
                strokeLinecap='round'
                strokeLinejoin='round'
                points={evolutionRows
                  .map((row, index) => {
                    const x =
                      evolutionRows.length === 1
                        ? 300
                        : (index * 600) / (evolutionRows.length - 1);
                    const y = 200 - Math.max(0, Math.min(row.score, 100)) * 2;

                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {evolutionRows.map((row, index) => {
                 const x =
                   evolutionRows.length === 1
                     ? 300
                     : (index * 600) / (evolutionRows.length - 1);
                 const y = 200 - Math.max(0, Math.min(row.score, 100)) * 2;

                 return (
                   <g key={`${row.label}-${index}`}>
                   {/* The present point is marked: it is the only one the auditor can compare with the panel above. */}
                   <circle
                      cx={x}
                      cy={y}
                      r={row.isCurrent ? '9' : '6'}
                      fill={row.isCurrent ? '#FFFFFF' : '#006BB4'}
                      stroke='#006BB4'
                      strokeWidth={row.isCurrent ? '4' : '2'}
                    />
                    <text
                      x={x}
                      y={y - 16}
                      textAnchor='middle'
                      fontSize='16'
                      fontWeight='700'
                      fill='#006BB4'
                    >
                      {row.score}%
                    </text>
                    <text
                      x={x}
                      y='235'
                      textAnchor='middle'
                      fontSize='15'
                      fontWeight='700'
                      fill='#1A1C21'
                    >
                      {row.label}
                    </text>
                    {row.isCurrent && (
                      <text
                        x={x}
                        y='252'
                        textAnchor='middle'
                        fontSize='12'
                        fontWeight='700'
                        fill='#006BB4'
                      >
                        ahora
                      </text>
                    )}
                   </g>
                );
       
       })}
            </svg>

            {pendingSeries && (
              <div
                style={{
                  position: 'absolute',
                  left: 78,
                  right: 14,
                  top: 8,
                  height: 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <EuiLoadingSpinner size='m' />
                <EuiText size='s' color='subdued'>
                  <span>Calculando la serie…</span>
                </EuiText>
              </div>
            )}

            <div
              style={{
                position: 'absolute',
                left: 24,
                top: '50%',
                transform: 'translateY(-50%) rotate(-90deg)',
                transformOrigin: 'center',
                color: '#1A1C21',
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              Cumplimiento ENS (%)
            </div>
          </div>

          <div
            style={{
              borderTop: '1px solid #E6E9F0',
              marginTop: 8,
              paddingTop: 10,
              color: '#69707D',
              fontSize: 12,
            }}
          >
            {pendingSeries
              ? 'Calculando en el servidor la serie diaria de los últimos 7 días; aparece en cuanto esté. Las cifras de arriba ya son las de ahora.'
              : dashboardModel.evolution.description}
          </div>
        </div>
        <div style={card}>
          <div style={title}>REQUISITOS EVALUADOS POR NIVEL ENS</div>

           <div style={{ marginTop: 12 }}>
              {dashboardModel.levelSummary.rows.map(item => {
                const color =
                  item.level === 'BAJO'
                  ? '#00A65A'
                  : item.level === 'MEDIO'
                  ? '#F5B700'
                  : '#BD271E';

                return (
                  <div key={item.level} style={{ marginBottom: 14 }}>
                   <div
                     style={{
                       display: 'grid',
                       gridTemplateColumns: '70px 1fr 70px',
                       alignItems: 'center',
                       columnGap: 10,
                       fontSize: 13,
                     }}
                   >
                     <b>{item.label}</b>
                     <span style={{ color: '#69707D' }}>
                       {item.count} requisitos
                     </span>
                     <b style={{ textAlign: 'right', color }}>{item.percent}%</b>
                   </div>

                   <div
                     style={{
                       marginTop: 6,
                       background: '#D3DAE6',
                       height: 10,
                       borderRadius: 5,
                       overflow: 'hidden',
                     }}
                    >
                     <div
                       style={{
                       width: `${item.percent}%`,
                       height: 10,
                       background: color,
                     }}
                   />
                 </div>
                </div>
              );
            })}
         </div>
          

          <div
            style={{
              marginTop: 16,
              background: '#EEF5FF',
              padding: 10,
              color: '#006BB4',
              fontSize: 12,
              borderRadius: 4,
            }}
          >
            ⓘ Distribución real de requisitos ENS evaluados por nivel de exigencia: BAJO, MEDIO y ALTO.
          </div>
        </div>

        <div style={card}>
          <div style={title}>
            {dashboardModel.impactEvents.title}
          </div>
          
          {/* One row per incident: the same problem observed many times is one alert (ENS-DASH-004). */}
          {dashboardModel.impactEvents.rows.length ? (
            dashboardModel.impactEvents.rows.map(row => {
              const severity = alertSeverityPresentation(row.severity);
              return (
                <div
                  key={row.id}
                  style={{
                    borderLeft: `4px solid ${severity.color}`,
                    padding: '8px 10px',
                    marginBottom: 8,
                    background: '#F7F9FC',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: severity.color, fontWeight: 700 }}>{severity.label}</span>
                    <span style={{ color: '#69707D' }}>{row.controlId}</span>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{row.agentName || row.agentId}</div>
                  <div title={row.description}>{row.label}</div>
                  <div style={{ marginTop: 5, fontSize: 11, color: '#69707D' }}>
                    Última observación: {formatTimestamp(row.lastObserved)}
                    {row.countLabel ? ` · ${row.countLabel}` : ''}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ color: '#69707D', fontSize: 13, marginTop: 12 }}>
              Sin alertas operativas en la ventana y el alcance de esta vista.
            </div>
          )}
          {dashboardModel.impactEvents.total > dashboardModel.impactEvents.rows.length && (
            <div style={{ color: '#69707D', fontSize: 11 }}>
              Se muestran {dashboardModel.impactEvents.rows.length} de {dashboardModel.impactEvents.total}.
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {/* The organisation's maturity (normative), apart from the compliance index (operational). */}
        <MaturityDistributionPanel maturity={evaluation.data?.maturity} error={evaluation.data?.maturityError} onRetry={evaluation.retry} />
      </div>

      <div style={{ marginTop: 16, background: '#EEF5FF', color: '#006BB4', padding: 10, borderRadius: 4 }}>
        ⓘ El índice de cumplimiento lo calcula el servidor con todos los hechos ENS de la ventana de evaluación. Cada 5 minutos se comprueba si han llegado hechos nuevos y, solo entonces, se vuelve a calcular.
      </div>
    </div>
  );
};
