// Overview: one request to the evaluation route (`include=overview`) answers which machine is worst, where a control fails, which collector stopped sending and who has pending work.
import React, { useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButtonGroup,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLink,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiTable,
  EuiTableBody,
  EuiTableHeader,
  EuiTableHeaderCell,
  EuiTableRow,
  EuiTableRowCell,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { EvaluationLoading, EvaluationStatusLine } from '../../evaluation/evaluation-status';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import { useRouterSearch, useSetRouterSearch } from '../../routing/use-router-search';
import { ENS_CONTROL_DETAIL_TAB_ID } from '../../app/tabs';
import type { ENSOverviewEvaluationResponse, ENSSummaryEvaluationResponse } from '../../../common/ens/evaluation/types';
import { ENSControlsInAnnexOrder as ENSControls } from '../controls-in-order';
import { getENSCatalogControl } from '../../../common/ens/catalog';
import { describeNotMeasuredOnAgent, isManagerOnlyControl } from '../../../common/ens/core/scope/measurement-planes';
import {
  ENS_PENDING_MEASUREMENT_LABEL,
  describePendingMeasurement,
  isPendingMeasurement,
} from '../../../common/ens/catalog/support/measurement-plan';
import { getActiveControlConfiguration } from '../../../common/ens/configuration/services';
import { describeTally } from '../controls/controls-list-model';
import { ENS_STATUS_COLORS, ENS_STATUS_ORDER, statusBadgeColor } from '../status-colors';
import { ENS_NO_RESULT_PATTERN, ENS_THEME } from '../theme-colors';
import {
  buildMachineSummaries,
  buildMatrix,
  buildTrend,
  buildWorkQueue,
  describeAge,
  describeOverviewPending,
  freshnessCell,
  machineLabel,
  MatrixCell,
  overviewMachines,
} from './overview-model';

// A control not measured on a machine is a striped gap, not the NO_APLICA grey.
const STRIPED = ENS_NO_RESULT_PATTERN;

export const MATRIX_MACHINE_MIN_WIDTH = 64;
const STICKY_CELL: React.CSSProperties = { position: 'sticky', left: 0, background: ENS_THEME.surface, zIndex: 1 };

// Still computing (partial first load): neither a result nor 'not measured'.
const Calculating = () => (
  <EuiBadge color='default' iconType='clock' title='Calculando: el servidor aún no tiene todas las filas de este control.'>
    …
  </EuiBadge>
);

const MatrixCellView = ({ cell }: { cell: MatrixCell }) => {
  if (cell.kind === 'pending') return <Calculating />;
  if (cell.kind === 'manager') {
    return (
      <EuiText size='xs' color='subdued'>
        <span title='Control de la organización: se mide en el manager (columna 000).'>en el manager</span>
      </EuiText>
    );
  }
  if (cell.kind === 'not-measured') {
    return <div title={cell.reason || 'No se mide en esta máquina.'} style={{ background: STRIPED, height: 22, borderRadius: 3 }} />;
  }
  return (
    <span title={`${cell.status}${cell.notMet ? ` · ${cell.notMet} requisitos no cumplen` : ''}${cell.notEvidenced ? ` (${cell.notEvidenced} no evidenciados)` : ''}`}>
      <EuiBadge color={statusBadgeColor(cell.status)}>
        {typeof cell.score === 'number' ? `${cell.score}%` : cell.status === 'NO_APLICA' ? 'n/a' : '—'}
      </EuiBadge>
      {cell.notMet > 0 && <span style={{ fontSize: 11, color: ENS_THEME.dangerText, marginLeft: 4 }}>{cell.notMet}</span>}
    </span>
  );
};

export const OverviewENS = () => {
  const { agentId } = useRouterSearch();
  const updateUrl = useSetRouterSearch();
  const [mode, setMode] = useState<'estado' | 'frescura'>('estado');

  // One request, always for the whole set: the chosen machine is highlighted and filters the work queue, but the matrix covers all.
  const general = useEnsEvaluation<ENSOverviewEvaluationResponse>({ include: 'overview' });
  // The trend is apart: its past days are computed once a day and take longer the first time; the rest does not wait for it.
  const trend = useEnsEvaluation<ENSSummaryEvaluationResponse>({ include: 'summary', timelineDays: 30, timelineControls: true, agentId });

  const data = general.data;
  const now = data ? Date.parse(data.meta.evaluatedAt) || Date.now() : Date.now();
  const machines = useMemo(() => overviewMachines(data?.meta.scope || []), [data]);
  const nameOf = (id: string) => machines.find(m => m.agentId === id)?.agentName;
  const controls = ENSControls.map(c => ({ id: c.id, title: c.title }));

  const matrix = useMemo(
    () =>
      data
        ? buildMatrix(controls, machines, data.controls, data.agents || [], {
            isManagerOnly: id => {
              const catalog = getENSCatalogControl(id);
              return Boolean(catalog && isManagerOnlyControl(catalog));
            },
            pendingMeasurement: id => {
              const catalog = getENSCatalogControl(id);
              return catalog && isPendingMeasurement(catalog) ? describePendingMeasurement(catalog) : undefined;
            },
            notMeasuredReason: (id, agent) => {
              const catalog = getENSCatalogControl(id);
              return catalog
                ? describeNotMeasuredOnAgent(catalog, agent, nameOf(agent), getActiveControlConfiguration(id, agent))?.text
                : undefined;
            },
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, machines]
  );
  const byMachine = useMemo(
    () => (data ? buildMachineSummaries(machines, data.agents || [], data.freshness, now) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, machines]
  );
  const queue = useMemo(
    () =>
      data
        ? buildWorkQueue(data.nonConformities, agentId, id => Boolean(getActiveControlConfiguration(id)), id => nameOf(id))
        : [],
    [data, agentId]
  );
  const series = useMemo(() => buildTrend(trend.data?.timeline, controls.map(c => c.id)), [trend.data]);
  // Partial first load (`meta.pending`): the matrix shows computed controls and '…' for the rest; per-machine figures and the queue wait. Polls every 2 s (15 s after 2 minutes).
  const inProgress = describeOverviewPending(data?.meta.pending);
  // The series is computed after the response (`meta.seriesPending`): the trend says so instead of staying empty.
  const pendingSeries =
    Boolean(trend.data?.meta?.pending) ||
    (Boolean(trend.data?.meta?.seriesPending) && !(trend.data?.timeline || []).length);

  const openDetail = (controlId: string, agent?: string) =>
    updateUrl({ tabView: ENS_CONTROL_DETAIL_TAB_ID, control: controlId, agentId: agent });

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel>
        <EuiTitle size='m'>
          <h2>Vista general</h2>
        </EuiTitle>
        <EuiText size='s' color='subdued'>
          <p>
            Todas las máquinas del alcance y todos los controles a la vez: qué máquina está peor, en cuántas falla
            cada control, qué recogida se ha parado, quién tiene trabajo pendiente y cómo evoluciona. Pulsar una
            celda abre el detalle de ese control en esa máquina.
          </p>
        </EuiText>
        <EuiSpacer size='s' />
        {general.error ? (
          <FactsReadErrorCallOut error={general.error} onRetry={general.retry} />
        ) : !data ? (
          <EvaluationLoading message='Evaluando todos los controles en todas las máquinas del alcance.' />
        ) : (
          <>
            <EvaluationStatusLine meta={data.meta} refreshing={general.isRefreshing} onRetry={general.retry} />
            {inProgress && (
              <>
                <EuiSpacer size='s' />
                <EuiCallOut size='s' color='primary' iconType='clock' title={inProgress.title}>
                  <p>{inProgress.text}</p>
                </EuiCallOut>
              </>
            )}
            <EuiSpacer size='m' />

            <EuiTitle size='s'>
              <h3>Máquinas</h3>
            </EuiTitle>
            <EuiSpacer size='s' />
            <EuiBasicTable
              compressed
              items={byMachine.map(m => ({ ...m, id: m.agentId }))}
              rowProps={(m: any) => ({ style: m.agentId === agentId ? { background: ENS_THEME.highlight } : undefined })}
              columns={[
                {
                  field: 'agentId',
                  name: 'Máquina',
                  render: (_: string, m: any) => (
                    <EuiHealth color={m.stale ? 'danger' : m.status === 'active' ? 'success' : 'subdued'}>
                      <EuiLink onClick={() => updateUrl({ agentId: m.agentId })}>{machineLabel(m)}</EuiLink>
                    </EuiHealth>
                  ),
                },
                {
                  field: 'counts',
                  name: 'Controles medidos',
                  render: (_: any, m: any) => inProgress ? <Calculating /> : (
                    <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
                      {(['NO_CUMPLE', 'PARCIAL', 'NO_EVALUABLE', 'CUMPLE', 'NO_APLICA'] as const)
                        .filter(e => m.counts[e] > 0)
                        .map(e => (
                          <EuiFlexItem grow={false} key={e}>
                            <EuiBadge color={statusBadgeColor(e)}>{`${m.counts[e]} ${e}`}</EuiBadge>
                          </EuiFlexItem>
                        ))}
                      {m.measured === 0 && <EuiText size='xs' color='subdued'>ninguno</EuiText>}
                    </EuiFlexGroup>
                  ),
                },
                {
                  field: 'notMet',
                  name: 'Requisitos que no cumplen',
                  render: (_: any, m: any) => (inProgress ? <Calculating /> : `${m.notMet}${m.notEvidenced ? ` (${m.notEvidenced} sin demostrar)` : ''}`),
                },
                {
                  field: 'lastSeen',
                  name: 'Último dato',
                  // The same date that decides red: the later of the last fact and the last collector heartbeat.
                  render: (_: any, m: any) => (
                    <EuiText size='xs' color={m.stale ? 'danger' : 'default'}>
                      <span title={`Último hecho: ${m.newest || 'ninguno'} · último latido: ${m.lastHeartbeat || 'ninguno'}`}>
                        {describeAge(m.lastSeen, now)}
                      </span>
                    </EuiText>
                  ),
                },
                {
                  field: 'worst',
                  name: 'Peores controles',
                  render: (_: any, m: any) => inProgress ? <Calculating /> : (
                    <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
                      {m.worst.map((w: any) => (
                        <EuiFlexItem grow={false} key={w.controlId}>
                          <EuiBadge
                            color={statusBadgeColor(w.status)}
                            onClick={() => openDetail(w.controlId, m.agentId)}
                            onClickAriaLabel={`Abrir ${w.controlId} en ${m.agentId}`}
                          >
                            {`${w.controlId}${typeof w.score === 'number' ? ` ${w.score}%` : ''}`}
                          </EuiBadge>
                        </EuiFlexItem>
                      ))}
                    </EuiFlexGroup>
                  ),
                },
              ]}
            />

            <EuiSpacer size='l' />

            <EuiFlexGroup alignItems='center' justifyContent='spaceBetween' responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiTitle size='s'>
                  <h3>Controles × máquinas</h3>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  legend='Qué enseña la matriz'
                  buttonSize='compressed'
                  options={[
                    { id: 'estado', label: 'Cumplimiento' },
                    { id: 'frescura', label: 'Frescura de la recogida' },
                  ]}
                  idSelected={mode}
                  onChange={(id: string) => setMode(id as 'estado' | 'frescura')}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiText size='xs' color='subdued'>
              <p>
                {mode === 'estado'
                  ? 'Cada celda: el resultado del control en esa máquina (número y requisitos que no cumplen, en rojo). Rayado: no se mide en esa máquina. «en el manager»: control de la organización, su resultado está en la columna 000.'
                  : `Cada celda: el último dato de ese control en esa máquina. En rojo, más de 24 h sin datos o ninguno en la ventana; esa máquina no puede demostrar nada de ese control.`}
              </p>
            </EuiText>
            <EuiSpacer size='s' />
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <EuiTable
                compressed
                tableLayout='auto'
                style={{ minWidth: 120 + 200 + machines.length * MATRIX_MACHINE_MIN_WIDTH }}
              >
                <EuiTableHeader>
                  <EuiTableHeaderCell style={{ ...STICKY_CELL, minWidth: 120 }}>Control</EuiTableHeaderCell>
                  <EuiTableHeaderCell style={{ minWidth: 200 }}>Máquinas</EuiTableHeaderCell>
                  {machines.map(m => (
                    <EuiTableHeaderCell key={m.agentId} align='center' style={{ minWidth: MATRIX_MACHINE_MIN_WIDTH }}>
                      <EuiToolTip content={machineLabel(m)}>
                        <span style={{ display: 'block', lineHeight: 1.2 }}>
                          <span style={{ fontWeight: m.agentId === agentId ? 700 : 400 }}>{m.agentId}</span>
                          <br />
                          <span
                            style={{
                              display: 'inline-block',
                              maxWidth: MATRIX_MACHINE_MIN_WIDTH,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: 11,
                              color: ENS_THEME.subduedText,
                            }}
                          >
                            {m.agentName || ''}
                          </span>
                        </span>
                      </EuiToolTip>
                    </EuiTableHeaderCell>
                  ))}
                </EuiTableHeader>
                <EuiTableBody>
                  {matrix.map(row => (
                    <EuiTableRow key={row.controlId}>
                      <EuiTableRowCell style={STICKY_CELL}>
                        <EuiLink onClick={() => openDetail(row.controlId)} title={row.title}>
                          {row.controlId}
                        </EuiLink>
                      </EuiTableRowCell>
                      <EuiTableRowCell>
                        <EuiText size='xs' color='subdued'>
                          {row.pendingMeasurement ? (
                            <span title={row.pendingMeasurement}>{ENS_PENDING_MEASUREMENT_LABEL}</span>
                          ) : row.pending ? 'Calculando…' : row.tally ? describeTally(row.tally) : 'ninguna lo mide'}
                        </EuiText>
                      </EuiTableRowCell>
                      {machines.map(m => {
                        const cell = row.cells[m.agentId];
                        const measure = cell.kind === 'result';
                        if (mode === 'frescura' && cell.kind === 'pending') {
                          return (
                            <EuiTableRowCell key={m.agentId} align='center'>
                              <Calculating />
                            </EuiTableRowCell>
                          );
                        }
                        if (mode === 'frescura') {
                          const f = freshnessCell(data.freshness, row.controlId, m.agentId, measure, now);
                          return (
                            <EuiTableRowCell key={m.agentId} align='center'>
                              {f.kind === 'not-expected' ? (
                                <div style={{ background: STRIPED, height: 22, borderRadius: 3 }} title='No se espera nada de este control en esta máquina.' />
                              ) : (
                                <EuiLink
                                  color={f.kind === 'fresh' ? 'secondary' : 'danger'}
                                  onClick={() => openDetail(row.controlId, m.agentId)}
                                  title={f.kind === 'never' ? 'Ningún dato en la ventana' : `${f.count} hechos · último ${f.newest}`}
                                >
                                  <span style={{ fontSize: 12 }}>{f.kind === 'never' ? 'nunca' : describeAge(f.newest, now)}</span>
                                </EuiLink>
                              )}
                            </EuiTableRowCell>
                          );
                        }
                        return (
                          <EuiTableRowCell
                            key={m.agentId}
                            align='center'
                            style={m.agentId === agentId ? { background: ENS_THEME.highlight } : undefined}
                          >
                            {measure ? (
                              <EuiLink onClick={() => openDetail(row.controlId, m.agentId)}>
                                <MatrixCellView cell={cell} />
                              </EuiLink>
                            ) : (
                              <MatrixCellView cell={cell} />
                            )}
                          </EuiTableRowCell>
                        );
                      })}
                    </EuiTableRow>
                  ))}
                </EuiTableBody>
              </EuiTable>
            </div>

            <EuiSpacer size='l' />

            <EuiTitle size='s'>
              <h3>Cola de trabajo{agentId ? ` · ${agentId}${nameOf(agentId) ? ` · ${nameOf(agentId)}` : ''}` : ''}</h3>
            </EuiTitle>
            <EuiText size='xs' color='subdued'>
              <p>
                Las no conformidades de todos los controles, por quien tiene que actuar. Medido y no evidenciado
                cuentan igual; la acción y la persona son distintas.
              </p>
            </EuiText>
            <EuiSpacer size='s' />
            {inProgress && (
              <EuiText size='s' color='subdued'>
                <p>{`Incompleta: faltan ${inProgress.controls.join(', ')}. Se completa cuando estén calculados.`}</p>
              </EuiText>
            )}
            {queue.length === 0 && !inProgress && (
              <EuiText size='s' color='subdued'>
                <p>No hay no conformidades abiertas.</p>
              </EuiText>
            )}
            {queue.map(group => (
              <EuiAccordion
                key={group.owner}
                id={`cola-${group.owner}`}
                initialIsOpen={group.clase.orden <= 1}
                buttonContent={
                  <span>
                    <EuiBadge color={group.clase.badgeColor} iconType={group.clase.icono}>
                      {group.clase.accion}
                    </EuiBadge>{' '}
                    {`${group.owner} · ${group.items.length} no conformidad${group.items.length === 1 ? '' : 'es'} en ${group.controls} control${group.controls === 1 ? '' : 'es'}`}
                  </span>
                }
                paddingSize='s'
              >
                <EuiBasicTable
                  compressed
                  items={group.items.map((it, i) => ({ ...it, id: `${it.nc.controlId}-${it.nc.id}-${i}` }))}
                  columns={[
                    {
                      field: 'controlId',
                      name: 'Control',
                      width: '110px',
                      render: (_: string, it: any) => <EuiLink onClick={() => openDetail(it.controlId, agentId)}>{it.controlId}</EuiLink>,
                    },
                    { field: 'nc', name: 'Requisito', width: '120px', render: (nc: any) => nc.requirementId },
                    {
                      field: 'title',
                      name: 'Qué falla',
                      render: (title: string, it: any) => (
                        <EuiText size='xs'>
                          <span>
                            {it.evidenceId && <EuiBadge color='hollow'>{it.evidenceId}</EuiBadge>}{' '}
                            {it.status && <EuiBadge color={statusBadgeColor(it.status)}>{it.status}</EuiBadge>} {title}
                          </span>
                        </EuiText>
                      ),
                    },
                    { field: 'machines', name: 'Dónde', width: '200px' },
                  ]}
                />
              </EuiAccordion>
            ))}
          </>
        )}

        <EuiSpacer size='l' />

        <EuiTitle size='s'>
          <h3>Tendencia de 30 días{agentId ? ` · ${agentId}` : ''}</h3>
        </EuiTitle>
        <EuiSpacer size='s' />
        {trend.error ? (
          <FactsReadErrorCallOut error={trend.error} onRetry={trend.retry} />
        ) : !trend.data ? (
          <EvaluationLoading message='Calculando el resultado de cada día de la ventana.' />
        ) : pendingSeries ? (
          <>
            <EvaluationStatusLine meta={trend.data.meta} refreshing={trend.isRefreshing} onRetry={trend.retry} label='Tendencia' />
            <EvaluationLoading message='Calculando la serie de 30 días en el servidor: aparece en cuanto esté.' />
          </>
        ) : (
          <>
            <EuiText size='xs' color='subdued'>
              <p>
                Índice medio de cumplimiento cada día
                {series.delta !== undefined ? ` (${series.delta >= 0 ? '+' : ''}${series.delta} puntos en la ventana)` : ''}; debajo,
                el estado de cada control cada día. Cada día se evalúa con los hechos conocidos hasta ese día.
              </p>
            </EuiText>
            <EuiSpacer size='s' />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64, paddingLeft: 92 }}>
              {series.points.map(p => (
                <EuiToolTip key={p.date} content={`${p.label}: ${typeof p.score === 'number' ? `${p.score}%` : 'sin datos'}`}>
                  <div
                    style={{
                      width: 14,
                      height: `${Math.max(2, ((p.score as number) || 0) * 0.6)}px`,
                      background: ENS_THEME.primary,
                      opacity: p.isCurrent ? 1 : 0.55,
                    }}
                  />
                </EuiToolTip>
              ))}
            </div>
            {series.points.length > 0 && (
              <EuiText size='xs' color='subdued'>
                <p style={{ paddingLeft: 92 }}>
                  {`${series.points[0].label} — ${series.points[series.points.length - 1].label} (hoy)`}
                </p>
              </EuiText>
            )}
            <EuiSpacer size='s' />
            <EuiFlexGroup gutterSize='s' wrap responsive={false}>
              {ENS_STATUS_ORDER.map(status => (
                <EuiFlexItem grow={false} key={status}>
                  <EuiText size='xs'>
                    <span>
                      <span style={{ display: 'inline-block', width: 12, height: 10, background: ENS_STATUS_COLORS[status], marginRight: 4 }} />
                      {status}
                    </span>
                  </EuiText>
                </EuiFlexItem>
              ))}
              <EuiFlexItem grow={false}>
                <EuiText size='xs'>
                  <span>
                    <span style={{ display: 'inline-block', width: 12, height: 10, background: STRIPED, marginRight: 4 }} />
                    sin resultado ese día
                  </span>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size='s' />
            {series.hasControls && (
              <div style={{ overflowX: 'auto' }}>
                {series.rows.map(row => (
                  <div key={row.controlId} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
                    <EuiLink onClick={() => openDetail(row.controlId, agentId)} style={{ width: 90, fontSize: 12, fontWeight: row.changed ? 700 : 400 }}>
                      {row.controlId}
                    </EuiLink>
                    {row.cells.map(c => (
                      <span
                        key={c.date}
                        title={`${row.controlId} · ${c.label}: ${c.status || 'sin resultado'}${typeof c.score === 'number' ? ` ${c.score}%` : ''}`}
                        style={{ width: 14, height: 12, background: c.status ? ENS_STATUS_COLORS[c.status] || ENS_STATUS_COLORS.NO_EVALUABLE : STRIPED, display: 'inline-block' }}
                      />
                    ))}
                    {row.changed && (
                      <EuiText size='xs' color='subdued'>
                        <span style={{ marginLeft: 6 }}>{`${row.first} → ${row.last}`}</span>
                      </EuiText>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </EuiPanel>
    </EuiPage>
  );
};
