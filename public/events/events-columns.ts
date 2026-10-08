// Columnas y filtros fijos de la pestaña Eventos: los mismos que la tabla de
// Wazuh a la que sustituye (hechos ENS de las máquinas del alcance). Sin
// React: lo prueba tests/events-columns.test.ts.
import type { ENSAgentScope } from '../ens/core/scope/types';
import { buildRawFactsFilters } from '../search/raw-facts-filters';

export interface ENSEventColumn {
  id: string;
  label: string;
  initialWidth?: number;
}

export const ENS_EVENT_COLUMNS: ENSEventColumn[] = [
  { id: 'timestamp', label: 'Fecha', initialWidth: 190 },
  { id: 'agent.name', label: 'Máquina', initialWidth: 150 },
  { id: 'data.ensfacil', label: 'Control', initialWidth: 120 },
  { id: 'data.event', label: 'Hecho', initialWidth: 130 },
  { id: 'data.control', label: 'data.control', initialWidth: 140 },
  { id: 'data.requisito', label: 'Requisitos', initialWidth: 150 },
  { id: 'data.evidence_id', label: 'Evidencia', initialWidth: 110 },
  { id: 'data.evidencias', label: 'Evidencias', initialWidth: 150 },
  { id: 'data.estado', label: 'Estado', initialWidth: 110 },
  { id: 'data.nivel', label: 'Nivel', initialWidth: 90 },
  { id: 'rule.description', label: 'Descripción' },
  { id: 'rule.level', label: 'Nivel de regla', initialWidth: 90 },
  { id: 'rule.id', label: 'Regla', initialWidth: 90 },
];

// Los de toda vista de hechos crudos: con una máquina elegida, solo los suyos.
export const buildEventsFilters = (agents: ENSAgentScope[], agentId?: string): unknown[] =>
  buildRawFactsFilters(agents, agentId);

export const getField = (source: any, ruta: string): string => {
  const valor = ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), source);
  if (valor == null) return '';
  return Array.isArray(valor) ? valor.join(', ') : String(valor);
};

// OpenSearch no sirve más allá de from + size = index.max_result_window, que
// por defecto es 10.000 (la plantilla de Wazuh no lo cambia). Con más hechos
// la tabla dice el total y deja recorrer los 10.000 más recientes; pedir más
// allá devolvería un error en lugar de una página.
export const ENS_EVENTS_MAX_WINDOW = 10000;

export const navigableEventRows = (total: number): number =>
  Number.isFinite(total) && total > 0 ? Math.min(total, ENS_EVENTS_MAX_WINDOW) : 0;

// La página elegida vale para los filtros con los que se eligió (`key`, su
// JSON). Con otros filtros es la primera desde el mismo render: así no se
// pide la página vieja con los filtros nuevos, que puede no existir.
export const pageIndexFor = (page: { key: string; index: number }, key: string): number =>
  page.key === key ? page.index : 0;
