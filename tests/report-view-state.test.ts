/**
 * Lo que enseña la sección de informe de un control (U-N2, U-N3).
 *
 *   npx --yes tsx tests/report-view-state.test.ts
 *
 * Nunca una rueda sin fin ni un relleno que parezca medido: con la
 * evaluación llegada y sin resultado para la máquina elegida, «este control no
 * se mide en esta máquina» y el motivo (`describeNotMeasuredOnAgent`, la misma
 * regla que la ficha y la lista); con el panorama de op.mon.2 en curso, que
 * carga (no SIN_DATOS). Solo se exporta un informe listo.
 */
import { canExportReport, reportViewState } from '../public/ens/reports/report-view-state';
import { describeNotMeasuredOnAgent } from '../common/ens/core/scope/measurement-planes';
import { getENSCatalogControl } from '../common/ens/catalog';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

const base = { controlId: 'op.exp.3', hasData: true, hasResult: true, usesPanorama: false, panoramaLoading: false, notMeasured: () => undefined };

const cargando = reportViewState({ ...base, hasData: false, hasResult: false });
comprueba('sin la evaluación de esta selección: cargando, sin PDF', cargando.kind === 'loading' && !canExportReport(cargando));
const error = reportViewState({ ...base, error: new Error('caído'), hasData: false, hasResult: false });
comprueba('con error: el error (antes que nada), sin PDF', error.kind === 'error' && !canExportReport(error));

// U-N2: la evaluación llegó, sin resultado para la máquina elegida.
const opExp3 = getENSCatalogControl('op.exp.3')!;
let preguntado = 0;
const enManager = reportViewState({
  ...base,
  agentId: '000',
  agentLabel: '000 · wazuh4',
  hasResult: false,
  notMeasured: () => { preguntado += 1; return describeNotMeasuredOnAgent(opExp3, '000', 'wazuh4', undefined); },
});
comprueba('U-N2: control de agente en el manager: «no se mide en esta máquina», no una rueda',
  enManager.kind === 'not-measured' && /no se mide en esta máquina/.test(enManager.title) && enManager.reason?.cause === 'PLANE' && preguntado === 1, enManager);
comprueba('U-N2: con el motivo de la regla común', enManager.kind === 'not-measured' && enManager.text === describeNotMeasuredOnAgent(opExp3, '000', 'wazuh4', undefined)!.text);
comprueba('U-N2: sin PDF', !canExportReport(enManager));

const mpInfo6 = getENSCatalogControl('mp.info.6')!;
const p04 = { controlId: 'mp.info.6', parameters: [{ id: 'P-04', value: ['srv-web01 | MEDIA'] }] } as any;
const fueraDeP04 = reportViewState({
  ...base,
  controlId: 'mp.info.6',
  agentId: '028',
  agentLabel: '028 · zimbraHldap',
  hasResult: false,
  notMeasured: () => describeNotMeasuredOnAgent(mpInfo6, '028', 'zimbraHldap', p04),
});
comprueba('U-N2: máquina fuera del alcance declarado (P-04): DECLARED_SCOPE y lo que declara',
  fueraDeP04.kind === 'not-measured' && fueraDeP04.reason?.cause === 'DECLARED_SCOPE' && /P-04/.test(fueraDeP04.text), fueraDeP04);
const sinMotivo = reportViewState({ ...base, agentId: '024', hasResult: false });
comprueba('U-N2: sin motivo conocido, lo dice igual (nunca rueda)', sinMotivo.kind === 'not-measured' && /024/.test(sinMotivo.text));
const ninguna = reportViewState({ ...base, hasResult: false });
comprueba('U-N2: sin máquina elegida y sin resultado: «en ninguna máquina»', ninguna.kind === 'not-measured' && /ninguna máquina/.test(ninguna.title));

// U-N3: el panorama de op.mon.2 en curso.
const panoramaEnCurso = reportViewState({ ...base, controlId: 'op.mon.2', usesPanorama: true, panoramaLoading: true });
comprueba('U-N3: panorama en curso: carga, no SIN_DATOS, sin PDF', panoramaEnCurso.kind === 'panorama-loading' && !canExportReport(panoramaEnCurso));
const panoramaListo = reportViewState({ ...base, controlId: 'op.mon.2', usesPanorama: true, panoramaLoading: false });
comprueba('U-N3: panorama llegado (o fallido, con su aviso): informe y PDF', panoramaListo.kind === 'ready' && canExportReport(panoramaListo));
const listo = reportViewState(base);
comprueba('resultado de esta selección: informe y PDF', listo.kind === 'ready' && canExportReport(listo));

fallos.length ? console.log(`\n${fallos.length} FALLOS`) : console.log('\nTodas las comprobaciones pasan.');
process.exit(fallos.length ? 1 : 0);
