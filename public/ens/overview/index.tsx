// VISTA GENERAL (1.2.0): lo que ninguna pantalla contestaba —«¿qué máquina
// está peor?», «¿en cuántas falla este control?», «¿qué recolector ha dejado de
// enviar?», «¿quién tiene trabajo pendiente?», «¿mejora o empeora?»—, con UNA
// petición a la ruta de evaluación (`include=overview`) y otra para la
// tendencia (`include=summary&timelineDays=30`). El modelo está en
// `overview-model.ts`; aquí solo se pinta, con componentes de EUI.
import React, { useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButtonGroup,
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
import type { ENSOverviewEvaluationResponse, ENSSummaryEvaluationResponse } from '../../../common/ens/evaluation/types';
import { ENSControls } from '../data';
import { getENSCatalogControl } from '../../../common/ens/catalog';
import { describeNotMeasuredOnAgent, isManagerOnlyControl } from '../../../common/ens/core/scope/measurement-planes';
import { getActiveControlConfiguration } from '../../../common/ens/configuration/services';
import { describeTally } from '../controls/controls-list-model';
import { ENS_NO_RESULT_PATTERN, ENS_STATUS_COLORS, ENS_STATUS_ORDER, statusBadgeColor } from '../status-colors';
import {
  buildMachineSummaries,
  buildMatrix,
  buildTrend,
  buildWorkQueue,
  describeAge,
  freshnessCell,
  machineLabel,
  MatrixCell,
  overviewMachines,
} from './overview-model';

// Los colores de todas las pantallas (`status-colors.ts`); lo que no se mide en
// una máquina no es gris de NO_APLICA: es un hueco rayado.
const RAYADO = ENS_NO_RESULT_PATTERN;

// La matriz: columnas de máquina con un ancho mínimo (con muchas máquinas, la
// tabla se desplaza en horizontal en vez de estrecharlas hasta no leerse), la
// columna «Control» fija a la izquierda y la de «Máquinas» a su lado.
export const MATRIX_MACHINE_MIN_WIDTH = 64;
const FIJA: React.CSSProperties = { position: 'sticky', left: 0, background: '#FFFFFF', zIndex: 1 };

const Celda = ({ cell }: { cell: MatrixCell }) => {
  if (cell.kind === 'manager') {
    return (
      <EuiText size='xs' color='subdued'>
        <span title='Control de la organización: se mide en el manager (columna 000).'>en el manager</span>
      </EuiText>
    );
  }
  if (cell.kind === 'not-measured') {
    return <div title={cell.reason || 'No se mide en esta máquina.'} style={{ background: RAYADO, height: 22, borderRadius: 3 }} />;
  }
  return (
    <span title={`${cell.status}${cell.notMet ? ` · ${cell.notMet} requisitos no cumplen` : ''}${cell.notEvidenced ? ` (${cell.notEvidenced} no evidenciados)` : ''}`}>
      <EuiBadge color={statusBadgeColor(cell.status)}>
        {typeof cell.score === 'number' ? `${cell.score}%` : cell.status === 'NO_APLICA' ? 'n/a' : '—'}
      </EuiBadge>
      {cell.notMet > 0 && <span style={{ fontSize: 11, color: '#BD271E', marginLeft: 4 }}>{cell.notMet}</span>}
    </span>
  );
};

export const OverviewENS = () => {
  const { agentId } = useRouterSearch();
  const cambiaUrl = useSetRouterSearch();
  const [modo, setModo] = useState<'estado' | 'frescura'>('estado');

  // UNA petición, siempre del conjunto: la máquina elegida se resalta y filtra
  // la cola de trabajo, pero la matriz es de todas.
  const general = useEnsEvaluation<ENSOverviewEvaluationResponse>({ include: 'overview' });
  // La tendencia aparte: sus días pasados se calculan una vez al día y tardan
  // más la primera vez; el resto de la pantalla no espera por ella.
  const tendencia = useEnsEvaluation<ENSSummaryEvaluationResponse>({ include: 'summary', timelineDays: 30, timelineControls: true, agentId });

  const datos = general.data;
  const ahora = datos ? Date.parse(datos.meta.evaluatedAt) || Date.now() : Date.now();
  const maquinas = useMemo(() => overviewMachines(datos?.meta.scope || []), [datos]);
  const nombreDe = (id: string) => maquinas.find(m => m.agentId === id)?.agentName;
  const controles = ENSControls.map(c => ({ id: c.id, title: c.title }));

  const matriz = useMemo(
    () =>
      datos
        ? buildMatrix(controles, maquinas, datos.controls, datos.agents || [], {
            isManagerOnly: id => {
              const catalogo = getENSCatalogControl(id);
              return Boolean(catalogo && isManagerOnlyControl(catalogo));
            },
            notMeasuredReason: (id, agente) => {
              const catalogo = getENSCatalogControl(id);
              return catalogo
                ? describeNotMeasuredOnAgent(catalogo, agente, nombreDe(agente), getActiveControlConfiguration(id, agente))?.text
                : undefined;
            },
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, maquinas]
  );
  const porMaquina = useMemo(
    () => (datos ? buildMachineSummaries(maquinas, datos.agents || [], datos.freshness, ahora) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, maquinas]
  );
  const cola = useMemo(
    () =>
      datos
        ? buildWorkQueue(datos.nonConformities, agentId, id => Boolean(getActiveControlConfiguration(id)), id => nombreDe(id))
        : [],
    [datos, agentId]
  );
  const serie = useMemo(() => buildTrend(tendencia.data?.timeline, controles.map(c => c.id)), [tendencia.data]);

  const abreDetalle = (controlId: string, agente?: string) =>
    cambiaUrl({ tabView: 'plugins', control: controlId, agentId: agente });

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
        ) : !datos ? (
          <EvaluationLoading message='Evaluando todos los controles en todas las máquinas del alcance.' />
        ) : (
          <>
            <EvaluationStatusLine meta={datos.meta} refreshing={general.isRefreshing} />
            <EuiSpacer size='m' />

            {/* V3 · RESUMEN POR MÁQUINA */}
            <EuiTitle size='s'>
              <h3>Máquinas</h3>
            </EuiTitle>
            <EuiSpacer size='s' />
            <EuiBasicTable
              compressed
              items={porMaquina.map(m => ({ ...m, id: m.agentId }))}
              rowProps={(m: any) => ({ style: m.agentId === agentId ? { background: '#F1F4FA' } : undefined })}
              columns={[
                {
                  field: 'agentId',
                  name: 'Máquina',
                  render: (_: string, m: any) => (
                    <EuiHealth color={m.stale ? 'danger' : m.status === 'active' ? 'success' : 'subdued'}>
                      <EuiLink onClick={() => cambiaUrl({ agentId: m.agentId })}>{machineLabel(m)}</EuiLink>
                    </EuiHealth>
                  ),
                },
                {
                  field: 'counts',
                  name: 'Controles medidos',
                  render: (_: any, m: any) => (
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
                  render: (_: any, m: any) => `${m.notMet}${m.notEvidenced ? ` (${m.notEvidenced} sin demostrar)` : ''}`,
                },
                {
                  field: 'lastSeen',
                  name: 'Último dato',
                  // La misma fecha con la que se decide el rojo: la más reciente
                  // entre el último hecho y el último latido del recolector.
                  render: (_: any, m: any) => (
                    <EuiText size='xs' color={m.stale ? 'danger' : 'default'}>
                      <span title={`Último hecho: ${m.newest || 'ninguno'} · último latido: ${m.lastHeartbeat || 'ninguno'}`}>
                        {describeAge(m.lastSeen, ahora)}
                      </span>
                    </EuiText>
                  ),
                },
                {
                  field: 'worst',
                  name: 'Peores controles',
                  render: (_: any, m: any) => (
                    <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
                      {m.worst.map((w: any) => (
                        <EuiFlexItem grow={false} key={w.controlId}>
                          <EuiBadge
                            color={statusBadgeColor(w.status)}
                            onClick={() => abreDetalle(w.controlId, m.agentId)}
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

            {/* V1 + V2 · CONTROL × MÁQUINA, por estado o por frescura */}
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
                  idSelected={modo}
                  onChange={(id: string) => setModo(id as 'estado' | 'frescura')}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiText size='xs' color='subdued'>
              <p>
                {modo === 'estado'
                  ? 'Cada celda: el resultado del control en esa máquina (número y requisitos que no cumplen, en rojo). Rayado: no se mide en esa máquina. «en el manager»: control de la organización, su resultado está en la columna 000.'
                  : `Cada celda: el último dato de ese control en esa máquina. En rojo, más de 24 h sin datos o ninguno en la ventana; esa máquina no puede demostrar nada de ese control.`}
              </p>
            </EuiText>
            <EuiSpacer size='s' />
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <EuiTable
                compressed
                tableLayout='auto'
                style={{ minWidth: 120 + 200 + maquinas.length * MATRIX_MACHINE_MIN_WIDTH }}
              >
                <EuiTableHeader>
                  <EuiTableHeaderCell style={{ ...FIJA, minWidth: 120 }}>Control</EuiTableHeaderCell>
                  <EuiTableHeaderCell style={{ minWidth: 200 }}>Máquinas</EuiTableHeaderCell>
                  {maquinas.map(m => (
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
                              color: '#69707D',
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
                  {matriz.map(fila => (
                    <EuiTableRow key={fila.controlId}>
                      <EuiTableRowCell style={FIJA}>
                        <EuiLink onClick={() => abreDetalle(fila.controlId)} title={fila.title}>
                          {fila.controlId}
                        </EuiLink>
                      </EuiTableRowCell>
                      <EuiTableRowCell>
                        <EuiText size='xs' color='subdued'>
                          {fila.tally ? describeTally(fila.tally) : 'ninguna lo mide'}
                        </EuiText>
                      </EuiTableRowCell>
                      {maquinas.map(m => {
                        const celda = fila.cells[m.agentId];
                        const medida = celda.kind === 'result';
                        if (modo === 'frescura') {
                          const f = freshnessCell(datos.freshness, fila.controlId, m.agentId, medida, ahora);
                          return (
                            <EuiTableRowCell key={m.agentId} align='center'>
                              {f.kind === 'not-expected' ? (
                                <div style={{ background: RAYADO, height: 22, borderRadius: 3 }} title='No se espera nada de este control en esta máquina.' />
                              ) : (
                                <EuiLink
                                  color={f.kind === 'fresh' ? 'secondary' : 'danger'}
                                  onClick={() => abreDetalle(fila.controlId, m.agentId)}
                                  title={f.kind === 'never' ? 'Ningún dato en la ventana' : `${f.count} hechos · último ${f.newest}`}
                                >
                                  <span style={{ fontSize: 12 }}>{f.kind === 'never' ? 'nunca' : describeAge(f.newest, ahora)}</span>
                                </EuiLink>
                              )}
                            </EuiTableRowCell>
                          );
                        }
                        return (
                          <EuiTableRowCell
                            key={m.agentId}
                            align='center'
                            style={m.agentId === agentId ? { background: '#F1F4FA' } : undefined}
                          >
                            {medida ? (
                              <EuiLink onClick={() => abreDetalle(fila.controlId, m.agentId)}>
                                <Celda cell={celda} />
                              </EuiLink>
                            ) : (
                              <Celda cell={celda} />
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

            {/* V5 · COLA DE TRABAJO */}
            <EuiTitle size='s'>
              <h3>Cola de trabajo{agentId ? ` · ${agentId}${nombreDe(agentId) ? ` · ${nombreDe(agentId)}` : ''}` : ''}</h3>
            </EuiTitle>
            <EuiText size='xs' color='subdued'>
              <p>
                Las no conformidades de todos los controles, por quien tiene que actuar. Medido y no evidenciado
                cuentan igual; la acción y la persona son distintas.
              </p>
            </EuiText>
            <EuiSpacer size='s' />
            {cola.length === 0 && (
              <EuiText size='s' color='subdued'>
                <p>No hay no conformidades abiertas.</p>
              </EuiText>
            )}
            {cola.map(grupo => (
              <EuiAccordion
                key={grupo.owner}
                id={`cola-${grupo.owner}`}
                initialIsOpen={grupo.clase.orden <= 1}
                buttonContent={
                  <span>
                    <EuiBadge color={grupo.clase.badgeColor} iconType={grupo.clase.icono}>
                      {grupo.clase.accion}
                    </EuiBadge>{' '}
                    {`${grupo.owner} · ${grupo.items.length} no conformidad${grupo.items.length === 1 ? '' : 'es'} en ${grupo.controls} control${grupo.controls === 1 ? '' : 'es'}`}
                  </span>
                }
                paddingSize='s'
              >
                <EuiBasicTable
                  compressed
                  items={grupo.items.map((it, i) => ({ ...it, id: `${it.nc.controlId}-${it.nc.id}-${i}` }))}
                  columns={[
                    {
                      field: 'controlId',
                      name: 'Control',
                      width: '110px',
                      render: (_: string, it: any) => <EuiLink onClick={() => abreDetalle(it.controlId, agentId)}>{it.controlId}</EuiLink>,
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

        {/* V6 · TENDENCIA */}
        <EuiTitle size='s'>
          <h3>Tendencia de 30 días{agentId ? ` · ${agentId}` : ''}</h3>
        </EuiTitle>
        <EuiSpacer size='s' />
        {tendencia.error ? (
          <FactsReadErrorCallOut error={tendencia.error} onRetry={tendencia.retry} />
        ) : !tendencia.data ? (
          <EvaluationLoading message='Calculando el resultado de cada día de la ventana.' />
        ) : (
          <>
            <EuiText size='xs' color='subdued'>
              <p>
                Índice medio de cumplimiento cada día
                {serie.delta !== undefined ? ` (${serie.delta >= 0 ? '+' : ''}${serie.delta} puntos en la ventana)` : ''}; debajo,
                el estado de cada control cada día. Cada día se evalúa con los hechos conocidos hasta ese día.
              </p>
            </EuiText>
            <EuiSpacer size='s' />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64, paddingLeft: 92 }}>
              {serie.points.map(p => (
                <EuiToolTip key={p.date} content={`${p.label}: ${typeof p.score === 'number' ? `${p.score}%` : 'sin datos'}`}>
                  <div
                    style={{
                      width: 14,
                      height: `${Math.max(2, ((p.score as number) || 0) * 0.6)}px`,
                      background: p.isCurrent ? '#006BB4' : '#79AAD9',
                    }}
                  />
                </EuiToolTip>
              ))}
            </div>
            {serie.points.length > 0 && (
              <EuiText size='xs' color='subdued'>
                <p style={{ paddingLeft: 92 }}>
                  {`${serie.points[0].label} — ${serie.points[serie.points.length - 1].label} (hoy)`}
                </p>
              </EuiText>
            )}
            <EuiSpacer size='s' />
            {/* La leyenda: los mismos colores que la lista y la matriz. */}
            <EuiFlexGroup gutterSize='s' wrap responsive={false}>
              {ENS_STATUS_ORDER.map(estado => (
                <EuiFlexItem grow={false} key={estado}>
                  <EuiText size='xs'>
                    <span>
                      <span style={{ display: 'inline-block', width: 12, height: 10, background: ENS_STATUS_COLORS[estado], marginRight: 4 }} />
                      {estado}
                    </span>
                  </EuiText>
                </EuiFlexItem>
              ))}
              <EuiFlexItem grow={false}>
                <EuiText size='xs'>
                  <span>
                    <span style={{ display: 'inline-block', width: 12, height: 10, background: RAYADO, marginRight: 4 }} />
                    sin resultado ese día
                  </span>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size='s' />
            {serie.hasControls && (
              <div style={{ overflowX: 'auto' }}>
                {serie.rows.map(fila => (
                  <div key={fila.controlId} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
                    <EuiLink onClick={() => abreDetalle(fila.controlId, agentId)} style={{ width: 90, fontSize: 12, fontWeight: fila.changed ? 700 : 400 }}>
                      {fila.controlId}
                    </EuiLink>
                    {fila.cells.map(c => (
                      <span
                        key={c.date}
                        title={`${fila.controlId} · ${c.label}: ${c.status || 'sin resultado'}${typeof c.score === 'number' ? ` ${c.score}%` : ''}`}
                        style={{ width: 14, height: 12, background: c.status ? ENS_STATUS_COLORS[c.status] || ENS_STATUS_COLORS.NO_EVALUABLE : RAYADO, display: 'inline-block' }}
                      />
                    ))}
                    {fila.changed && (
                      <EuiText size='xs' color='subdued'>
                        <span style={{ marginLeft: 6 }}>{`${fila.first} → ${fila.last}`}</span>
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
