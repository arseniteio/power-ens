/**
 * Columnas y filtros fijos de la pestaña Eventos, y la paginación contra el
 * índice: hasta dónde se puede pasar página y cuándo se vuelve a la primera.
 *
 *   npx --yes tsx tests/events-columns.test.ts
 */
import {
  buildEventsFilters,
  ENS_EVENT_COLUMNS,
  ENS_EVENTS_MAX_WINDOW,
  getField,
  navigableEventRows,
  pageIndexFor,
} from '../public/events/events-columns';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

comprueba(
  'las columnas de hoy, en su orden',
  ENS_EVENT_COLUMNS.map(c => c.id).join() ===
    'timestamp,agent.name,data.ensfacil,data.event,data.control,data.requisito,data.evidence_id,data.evidencias,data.estado,data.nivel,rule.description,rule.level,rule.id',
  ENS_EVENT_COLUMNS.map(c => c.id)
);
comprueba('cada columna con su etiqueta', ENS_EVENT_COLUMNS.every(c => !!c.label));
const f: any[] = buildEventsFilters([{ id: '024', groups: ['ens'] }, { id: '028', groups: ['ens'] }], undefined);
comprueba('solo hechos ENS', JSON.stringify(f[0]) === '{"match_phrase":{"rule.groups":"ensfacil"}}');
comprueba('solo máquinas del alcance', JSON.stringify(f[1]) === '{"terms":{"agent.id":["024","028"]}}');
const g: any[] = buildEventsFilters([{ id: '024', groups: ['ens'] }], '024');
comprueba('una máquina elegida', JSON.stringify(g[1]) === '{"match_phrase":{"agent.id":"024"}}');
comprueba(
  'los mismos agentes dan el mismo JSON (useEsSearch no vuelve a buscar)',
  JSON.stringify(buildEventsFilters([{ id: '024', groups: ['ens'] }], '024')) === JSON.stringify(g)
);
comprueba('campo anidado', getField({ data: { requisito: 'op.acc.1.1' } }, 'data.requisito') === 'op.acc.1.1');
comprueba('campo ausente: vacío', getField({}, 'data.nivel') === '');
comprueba('sin documento: vacío', getField(undefined, 'data.nivel') === '');
comprueba('lista: separada por comas', getField({ rule: { groups: ['a', 'b'] } }, 'rule.groups') === 'a, b');
comprueba('número: como texto', getField({ rule: { level: 3 } }, 'rule.level') === '3');

// OpenSearch no sirve más allá de from + size = index.max_result_window
// (10.000 por defecto, y la plantilla de Wazuh no lo cambia): la tabla deja
// recorrer hasta ahí, aunque el total diga más.
comprueba('la ventana del índice', ENS_EVENTS_MAX_WINDOW === 10000);
comprueba('pocos hechos: todos navegables', navigableEventRows(120) === 120);
comprueba('más de la ventana: solo la ventana', navigableEventRows(53210) === 10000);
comprueba('sin total: cero', navigableEventRows(NaN) === 0 && navigableEventRows(-1) === 0);
for (const tamano of [25, 50, 100]) {
  const ultima = Math.ceil(navigableEventRows(53210) / tamano) - 1;
  comprueba(`la última página de ${tamano} cabe en la ventana`, ultima * tamano + tamano <= ENS_EVENTS_MAX_WINDOW);
}

// La página elegida vale para los filtros con los que se eligió: con otros
// (otra máquina, otra consulta, otras fechas) se vuelve a la primera, sin
// pedir antes la página vieja con los filtros nuevos.
comprueba('mismos filtros: la página elegida', pageIndexFor({ key: 'A', index: 4 }, 'A') === 4);
comprueba('otros filtros: la primera', pageIndexFor({ key: 'A', index: 4 }, 'B') === 0);

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
