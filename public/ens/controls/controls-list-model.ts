// LO QUE ENSEÑA LA LISTA DE CONTROLES, sin React (`tests/controls-list.test.ts`).
//
// Los controles no desaparecen (diagnóstico de 17/10, §2): con el manager
// elegido se quitaban 14 de 23 y con una máquina fuera de P-04, mp.info.6. Ahora
// salen siempre los 23 del catálogo:
//
//   - primero, en el orden del catálogo, los que se miden en la máquina elegida
//     (o todos, sin máquina);
//   - al final, en gris, los que no se miden en ella, con el motivo y sin
//     número (no es un incumplimiento ni un cumplimiento);
//   - los que no están en la configuración activa lo dicen, con la acción de
//     añadirlos, en vez de la acción del productor de la evidencia;
//   - sin máquina elegida, cada control lleva cuántas máquinas cumplen, cuántas
//     no y cuántas no tienen datos (de las filas que da el servidor).
import type { ENSControlSummaryEntry, ENSAgentControlsRow } from '../../../common/ens/evaluation/types';
import type { ENSNotMeasuredReason } from '../../../common/ens/core/scope/measurement-planes';

export interface ENSListControl {
  id: string;
  title: string;
  activeLevels: string[];
}

// Cuántas máquinas dicen qué de un control (las que lo miden).
export interface ENSMachineTally {
  cumple: number;
  parcial: number;
  noCumple: number;
  sinDatos: number;
  noAplica: number;
  total: number;
}

export interface ENSControlListEntry {
  id: string;
  title: string;
  levels: string;
  // ¿Tiene resultado en la vista? (la máquina elegida, o el conjunto)
  measured: boolean;
  notMeasured?: ENSNotMeasuredReason;
  configured: boolean;
  appliesAtLevel: boolean;
  summary?: ENSControlSummaryEntry;
  machines?: ENSMachineTally;
}

export interface ENSControlListOptions {
  agentId?: string;
  summaries: Map<string, ENSControlSummaryEntry>;
  agentRows?: ENSAgentControlsRow[];
  isConfigured: (controlId: string) => boolean;
  notMeasured: (controlId: string) => ENSNotMeasuredReason | undefined;
  levelOf: (controlId: string) => string;
}

export const tallyMachines = (controlId: string, agentRows: ENSAgentControlsRow[] = []): ENSMachineTally | undefined => {
  const tally: ENSMachineTally = { cumple: 0, parcial: 0, noCumple: 0, sinDatos: 0, noAplica: 0, total: 0 };
  agentRows.forEach(row => {
    const entry = row.controls.find(control => control.controlId === controlId);
    if (!entry) return;
    tally.total += 1;
    if (entry.status === 'CUMPLE') tally.cumple += 1;
    else if (entry.status === 'PARCIAL') tally.parcial += 1;
    else if (entry.status === 'NO_CUMPLE') tally.noCumple += 1;
    else if (entry.status === 'NO_APLICA') tally.noAplica += 1;
    else tally.sinDatos += 1;
  });
  return tally.total ? tally : undefined;
};

// «2 cumplen · 1 parcial · 3 no cumplen · 1 sin datos» (sin los ceros).
export const describeTally = (tally: ENSMachineTally): string =>
  [
    tally.cumple ? `${tally.cumple} ${tally.cumple === 1 ? 'cumple' : 'cumplen'}` : '',
    tally.parcial ? `${tally.parcial} parcial${tally.parcial === 1 ? '' : 'es'}` : '',
    tally.noCumple ? `${tally.noCumple} no ${tally.noCumple === 1 ? 'cumple' : 'cumplen'}` : '',
    tally.sinDatos ? `${tally.sinDatos} sin datos` : '',
    tally.noAplica ? `${tally.noAplica} no aplica${tally.noAplica === 1 ? '' : 'n'}` : '',
  ]
    .filter(Boolean)
    .join(' · ') + ` (de ${tally.total} máquina${tally.total === 1 ? '' : 's'})`;

export const buildControlListEntries = (controls: ENSListControl[], options: ENSControlListOptions): ENSControlListEntry[] => {
  const entries = controls.map(control => {
    const notMeasured = options.agentId ? options.notMeasured(control.id) : undefined;
    return {
      id: control.id,
      title: control.title,
      levels: control.activeLevels.join(', '),
      measured: !notMeasured,
      ...(notMeasured ? { notMeasured } : {}),
      configured: options.isConfigured(control.id),
      appliesAtLevel: control.activeLevels.includes(options.levelOf(control.id)),
      summary: notMeasured ? undefined : options.summaries.get(control.id),
      ...(!options.agentId && options.agentRows ? { machines: tallyMachines(control.id, options.agentRows) } : {}),
    };
  });
  // Estable: dentro de cada grupo, el orden del catálogo.
  return [...entries.filter(entry => entry.measured), ...entries.filter(entry => !entry.measured)];
};

// «Nivel BAJO: 4 controles no aplican» (con cuáles). Cada control con SU nivel
// (op.exp.8 el de Trazabilidad, op.cont.2 y op.cont.3 el de Disponibilidad).
export const describeLevelExclusions = (
  entries: Pick<ENSControlListEntry, 'id' | 'appliesAtLevel'>[],
  globalLevel: string
): { count: number; ids: string[]; text: string } | undefined => {
  const ids = entries.filter(entry => !entry.appliesAtLevel).map(entry => entry.id);
  if (!ids.length) return undefined;
  return {
    count: ids.length,
    ids,
    text: `Nivel ${globalLevel}: ${ids.length} control${ids.length === 1 ? ' no aplica' : 'es no aplican'} (${ids.join(', ')})`,
  };
};
