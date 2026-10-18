/**
 * La Vista general (diagnóstico de 17/10, §3, V1-V6):
 *
 *   npx --yes tsx tests/overview-model.test.ts
 *
 *   1. El modelo: máquinas (el manager al final), matriz control × máquina con
 *      «no se mide aquí» y «en el manager» distintos de un resultado, frescura
 *      (24 h), resumen por máquina con sus peores controles, cola de trabajo
 *      por responsable con el titular de la evidencia culpable, tendencia.
 *   2. La pantalla, con una respuesta de la ruta: la matriz entera, una celda
 *      abre el detalle con control y máquina, la frescura dice «nunca» donde
 *      no ha llegado nada, la cola por responsable y la tendencia.
 */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) fallos.push(n);
};

const respuestas: Record<string, any> = {};
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: (p: any) => {
        const r = respuestas[p.include];
        return { data: r, error: undefined, isLoading: !r, isRefreshing: false, retry: () => undefined };
      },
    }),
  },
});

const m = require('../public/ens/overview/overview-model') as typeof import('../public/ens/overview/overview-model');
const { ENSControls } = require('../public/ens/data');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { OverviewENS } = require('../public/ens/overview');
const { parseRouterSearch } = require('../public/routing/router-search');

const AHORA = Date.parse('2026-10-17T16:00:00Z');
const hace = (h: number) => new Date(AHORA - h * 3600 * 1000).toISOString();
const entrada = (controlId: string, status: string, score?: number, notMet = 0, notEvidenced = 0) => ({ controlId, status, score, evaluated: true, requirementsNotMet: notMet, requirementsNotEvidenced: notEvidenced });
const scope = [
  { id: '000', name: 'manager01', status: 'active' },
  { id: '102', name: 'ldap01', status: 'disconnected' },
  { id: '101', name: 'srv-web01', status: 'active' },
];
const respuesta: any = {
  meta: { evaluatedAt: new Date(AHORA).toISOString(), computedAt: new Date(AHORA).toISOString(), fingerprint: 'f', refreshing: false, level: 'BAJO', scope, facts: { count: 10 }, window: {}, inventory: {} },
  controls: [entrada('op.acc.1', 'PARCIAL', 50, 2), entrada('op.exp.7', 'NO_CUMPLE', 0, 3), entrada('mp.info.6', 'NO_CUMPLE', 0, 1)],
  agents: [
    { agentId: '101', controls: [entrada('op.acc.1', 'CUMPLE', 100), entrada('mp.info.6', 'NO_CUMPLE', 0, 1), entrada('op.exp.3', 'NO_EVALUABLE', 0, 2, 2)] },
    { agentId: '102', controls: [entrada('op.acc.1', 'NO_CUMPLE', 0, 4, 1), entrada('op.exp.3', 'PARCIAL', 40, 1)] },
    { agentId: '000', controls: [entrada('op.exp.7', 'NO_CUMPLE', 0, 3), entrada('op.mon.3', 'CUMPLE', 100)] },
  ],
  freshness: {
    checkedAt: new Date(AHORA).toISOString(),
    agents: [
      { agentId: '101', count: 50, newest: hace(1) },
      { agentId: '102', count: 20, newest: hace(50) },
      { agentId: '000', count: 30, newest: hace(0.5), lastHeartbeat: hace(0.5) },
    ],
    cells: [
      { controlId: 'op.acc.1', agentId: '101', count: 10, newest: hace(1) },
      { controlId: 'op.acc.1', agentId: '102', count: 10, newest: hace(50) },
      { controlId: 'op.exp.7', agentId: '000', count: 5, newest: hace(2) },
    ],
  },
  nonConformities: [
    { controlId: 'op.exp.6', id: 'NC-1', requirementId: 'op.exp.6.1', origin: 'MEDIDA', evidenceIds: ['EV-11'], agentIds: ['101'], title: 'Faltan scripts de respuesta.', titleEvidenceId: 'EV-11', titleStatus: 'NO_CUMPLE' },
    { controlId: 'op.acc.1', id: 'NC-2', requirementId: 'op.acc.1.2', origin: 'NO_EVIDENCIADA', cause: 'COLLECTION', evidenceIds: ['EV-03'], agentIds: ['102'], title: 'El requisito op.acc.1.2 no se ha podido demostrar: no ha llegado ningún dato para EV-03.' },
    { controlId: 'op.nub.1', id: 'NC-3', requirementId: 'op.nub.1.1', origin: 'NO_EVIDENCIADA', cause: 'CATALOG', evidenceIds: [], agentIds: [], title: 'El requisito op.nub.1.1 no declara ninguna evidencia en el catálogo.' },
    { controlId: 'op.exp.4', id: 'NC-4', requirementId: 'op.exp.4.1', origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION', evidenceIds: ['EV-01'], agentIds: ['101', '102'], title: 'P-01 (inventario) sin configurar.', titleEvidenceId: 'EV-01', titleStatus: 'NO_EVALUABLE' },
  ],
};

(async () => {
  console.log('1. El modelo');
  const maquinas = m.overviewMachines(scope);
  comprueba('máquinas por id y el manager al final', maquinas.map(x => x.agentId).join() === '101,102,000');
  const matriz = m.buildMatrix(ENSControls.map((c: any) => ({ id: c.id, title: c.title })), maquinas, respuesta.controls, respuesta.agents, {
    isManagerOnly: id => ['op.exp.7', 'op.exp.9', 'op.cont.2', 'op.cont.3', 'op.mon.1', 'op.mon.2', 'op.nub.1'].includes(id),
    notMeasuredReason: (id, a) => `${id} no se mide en ${a}`,
  });
  const fila = (id: string) => matriz.find(r => r.controlId === id)!;
  comprueba('los 23 controles, siempre', matriz.length === 23);
  comprueba('op.acc.1: resultado en 101 y 102; en el manager, «no se mide» con el motivo', fila('op.acc.1').cells['101'].kind === 'result' && (fila('op.acc.1').cells['102'] as any).notMet === 4 && fila('op.acc.1').cells['000'].kind === 'not-measured' && (fila('op.acc.1').cells['000'] as any).reason === 'op.acc.1 no se mide en 000');
  comprueba('op.exp.7 (solo manager): resultado en 000, «en el manager» en las demás', fila('op.exp.7').cells['000'].kind === 'result' && fila('op.exp.7').cells['101'].kind === 'manager');
  comprueba('mp.info.6 solo en 101 (fuera de su alcance en 102: «no se mide»)', fila('mp.info.6').cells['101'].kind === 'result' && fila('mp.info.6').cells['102'].kind === 'not-measured');
  comprueba('la barra del control a través de las máquinas (V4)', fila('op.acc.1').tally?.cumple === 1 && fila('op.acc.1').tally?.noCumple === 1 && fila('op.acc.1').tally?.total === 2);
  comprueba('frescura: fresca, vieja (> 24 h), nunca, no esperada',
    m.freshnessCell(respuesta.freshness, 'op.acc.1', '101', true, AHORA).kind === 'fresh' &&
    m.freshnessCell(respuesta.freshness, 'op.acc.1', '102', true, AHORA).kind === 'stale' &&
    m.freshnessCell(respuesta.freshness, 'op.exp.3', '101', true, AHORA).kind === 'never' &&
    m.freshnessCell(respuesta.freshness, 'op.acc.1', '000', false, AHORA).kind === 'not-expected');
  const resumen = m.buildMachineSummaries(maquinas, respuesta.agents, respuesta.freshness, AHORA);
  const r101 = resumen.find(x => x.agentId === '101')!;
  const r102 = resumen.find(x => x.agentId === '102')!;
  comprueba('por máquina: estados, requisitos que no cumplen y sin demostrar', r101.counts.CUMPLE === 1 && r101.counts.NO_CUMPLE === 1 && r101.counts.NO_EVALUABLE === 1 && r101.notMet === 3 && r101.notEvidenced === 2, r101);
  comprueba('la máquina sin datos desde hace 50 h, vieja; la de hace 1 h, no', r102.stale && !r101.stale);
  const r000 = resumen.find(x => x.agentId === '000')!;
  comprueba('«Último dato» es la fecha con la que se decide el rojo (lo más reciente de hecho y latido)', r102.lastSeen === hace(50) && r000.lastSeen === hace(0.5));
  comprueba('peores primero: NO_CUMPLE antes que NO_EVALUABLE; sin los que cumplen', r101.worst.map(w => w.controlId).join() === 'mp.info.6,op.exp.3', r101.worst);
  const nombres: Record<string, string> = { '101': 'srv-web01', '102': 'ldap01' };
  const cola = m.buildWorkQueue(respuesta.nonConformities, undefined, () => true, id => nombres[id]);
  comprueba('la cola, por responsable y en orden de acción', cola.map(g => g.owner).join(' | ') === 'Sistema auditado | Responsable ENS | Operación Wazuh | Producto ENSFácil', cola.map(g => g.owner));
  comprueba('el titular del servidor, con su evidencia y estado', cola[0].items[0].title === 'Faltan scripts de respuesta.' && cola[0].items[0].evidenceId === 'EV-11' && cola[0].items[0].status === 'NO_CUMPLE');
  comprueba('sin evidencia culpable, solo el titular', cola[2].items[0].evidenceId === undefined);
  const sinAlta = m.buildWorkQueue(respuesta.nonConformities, undefined, id => id !== 'op.acc.1', id => nombres[id]);
  comprueba('un control sin configurar: a «Responsable ENS», con la acción de añadirlo', sinAlta.find(g => g.owner === 'Responsable ENS')!.items.some(i => i.controlId === 'op.acc.1') && !sinAlta.some(g => g.owner === 'Operación Wazuh'));
  comprueba('dónde: máquinas por nombre; las del catálogo, todas', cola[0].items[0].machines === 'srv-web01 (101)' && cola[3].items[0].machines === 'todas las máquinas');
  const de102 = m.buildWorkQueue(respuesta.nonConformities, '102');
  comprueba('con una máquina elegida, solo lo suyo (y lo del catálogo)', de102.flatMap(g => g.items.map(i => i.nc.id)).sort().join() === 'NC-2,NC-3,NC-4');
  const tl = [
    { date: '2026-10-15', label: '15/10', isCurrent: false, events: 1, score: 40, controls: { 'op.acc.1': { status: 'NO_CUMPLE', score: 0 }, 'op.exp.7': { status: 'NO_CUMPLE', score: 0 } } },
    { date: '2026-10-16', label: '16/10', isCurrent: false, events: 1, score: 45, controls: { 'op.acc.1': { status: 'PARCIAL', score: 50 }, 'op.exp.7': { status: 'NO_CUMPLE', score: 0 } } },
    { date: '2026-10-17', label: '17/10', isCurrent: true, events: 1, score: 50, controls: { 'op.acc.1': { status: 'PARCIAL', score: 50 }, 'op.exp.7': { status: 'NO_CUMPLE', score: 0 } } },
  ];
  const serie = m.buildTrend(tl as any, ['op.acc.1', 'op.exp.7', 'op.nub.1']);
  comprueba('tendencia: +10 puntos; op.acc.1 cambió (NO_CUMPLE → PARCIAL), op.exp.7 no', serie.delta === 10 && serie.rows[0].changed && serie.rows[0].first === 'NO_CUMPLE' && serie.rows[0].last === 'PARCIAL' && !serie.rows[1].changed);
  comprueba('un control sin puntos: celdas sin estado', serie.rows[2].cells.every(c => !c.status));
  comprueba('edad: min, h, d, nunca', m.describeAge(hace(0.2), AHORA) === 'hace 12 min' && m.describeAge(hace(5), AHORA) === 'hace 5 h' && m.describeAge(hace(72), AHORA) === 'hace 3 d' && m.describeAge(undefined, AHORA) === 'nunca');

  console.log('2. La pantalla');
  ensConfigurationRepository.completeHydration(JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)));
  h.setSearch('?tabView=overview');
  respuestas.overview = respuesta;
  respuestas.summary = { meta: respuesta.meta, controls: [], timeline: tl };
  let p = await h.render(OverviewENS);
  comprueba('la tabla de máquinas, con la vieja en rojo', h.findAll('EuiHealth').some(n => n.props.color === 'danger') && /hace 50 h|hace 2 d/.test(p));
  comprueba('la matriz: 23 filas', h.findAll('EuiTableRow').length === 23, h.findAll('EuiTableRow').length);
  // La celda de op.acc.1 en 102: la que, pulsada, lleva a ese control en esa máquina.
  let abre: any;
  for (const enlace of h.findAll('EuiLink')) {
    h.setSearch('?tabView=overview');
    enlace.props.onClick?.();
    const q = parseRouterSearch(h.search());
    if (q.control === 'op.acc.1' && q.agentId === '102') { abre = q; break; }
  }
  comprueba('la celda de op.acc.1 en 102 abre el detalle de ese control en esa máquina', abre?.tabView === 'plugins', abre);
  const filaAcc1 = h.findAll('EuiBadge').filter(n => n.texto === '0%');
  comprueba('…y pinta 0 % con los 4 requisitos que no cumplen', filaAcc1.length > 0 && /\[ 0% \] 4/.test(p), p.slice(p.indexOf('op.acc.1'), p.indexOf('op.acc.1') + 200));
  h.setSearch('?tabView=overview');
  p = await h.render(OverviewENS);
  const grupo = h.find('EuiButtonGroup');
  grupo!.props.onChange('frescura');
  p = await h.rerender();
  comprueba('frescura: «nunca» donde se mide y no ha llegado nada, y edades', /nunca/.test(p) && /hace 1 h/.test(p) && /hace 2 d/.test(p));
  comprueba('la cola: un acordeón por responsable', h.findAll('EuiAccordion').length === 4);
  comprueba('la tendencia: un tramo por día y la fila de op.acc.1 marcada como cambiada', /NO_CUMPLE → PARCIAL/.test(p));
  comprueba('la tendencia: leyenda con los cinco estados y «sin resultado», y las fechas del primer y del último día', ['CUMPLE', 'PARCIAL', 'NO_CUMPLE', 'NO_EVALUABLE', 'NO_APLICA'].every(e => p.includes(e)) && /sin resultado ese día/.test(p) && /15\/10 — 17\/10 \(hoy\)/.test(p));
  respuestas.summary = undefined;
  p = await h.rerender();
  comprueba('sin la tendencia aún: su carga, y el resto ya pintado', /Calculando el resultado de cada día/.test(p) && h.findAll('EuiTableRow').length === 23);

  console.log('3. La matriz con 6 y con 50 máquinas');
  for (const n of [6, 50]) {
    const muchas = Array.from({ length: n }, (_, i) => ({ id: String(200 + i).padStart(3, '0'), name: `servidor-de-nombre-largo-${i}`, status: 'active' }));
    respuestas.overview = {
      ...respuesta,
      meta: { ...respuesta.meta, scope: muchas },
      agents: muchas.map(m => ({ agentId: m.id, controls: [entrada('op.acc.1', 'CUMPLE', 100)] })),
      freshness: { checkedAt: respuesta.meta.evaluatedAt, agents: [], cells: [] },
    };
    h.reset();
    p = await h.render(OverviewENS);
    const tabla = h.findAll('EuiTable')[0];
    const cabeceras = h.findAll('EuiTableHeaderCell');
    comprueba(`${n} máquinas: tabla en disposición automática, más ancha que ${n} × 64 px (se desplaza, no se estrecha)`, tabla?.props.tableLayout === 'auto' && tabla.props.style.minWidth >= n * 64, tabla?.props);
    comprueba(`${n} máquinas: «Control» fija a la izquierda y «Máquinas» a su lado; cada máquina con ancho mínimo`,
      cabeceras.length === n + 2 && cabeceras[0].props.style.position === 'sticky' && /Máquinas/.test(cabeceras[1].texto) && cabeceras.slice(2).every(c => c.props.style.minWidth === 64));
    comprueba(`${n} máquinas: cada cabecera con el id y el nombre (recortado; entero en el tooltip)`, h.findAll('EuiToolTip').filter(t => /^2\d\d · servidor-de-nombre-largo-/.test(String(t.props.content))).length === n && /200 servidor-de-nombre-largo-0/.test(p));
    comprueba(`${n} máquinas: las celdas de «Control» también fijas`, h.findAll('EuiTableRowCell').filter(c => c.props.style?.position === 'sticky').length === 23);
  }

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
