// LA VISTA GENERAL, sin React (`tests/overview-model.test.ts`). Todo sale de UNA
// respuesta de la ruta de evaluación (`include=overview`): el resultado de cada
// control en la fila de cada máquina, la frescura de la sonda y las no
// conformidades de la vista de conjunto; la tendencia, de los puntos diarios
// (`include=summary&timelineDays=30`). Ninguna búsqueda de hechos.
//
//   V1  matriz control × máquina (estado, número y no conformidades)
//   V2  frescura de la recogida (último dato de cada control en cada máquina)
//   V3  resumen por máquina (estados, no conformidades, último dato, peores)
//   V4  barra por control a través de las máquinas (`controls-list-model.ts`)
//   V5  cola de trabajo por responsable
//   V6  tendencia diaria, del índice y de cada control
import { STALE_COLLECTOR_MAX_AGE_HOURS } from '../../../common/ens/core/evidence/stale-collector';
import type {
  ENSAgentControlsRow,
  ENSControlSummaryEntry,
  ENSEvaluationTimelinePoint,
  ENSFreshness,
  ENSOverviewNonConformity,
} from '../../../common/ens/evaluation/types';
import { ENSMachineTally, tallyMachines } from '../controls/controls-list-model';
import { classifyNonConformity, NonConformityClass } from '../controls/control-detail/nonconformity-class';

export const HOUR = 60 * 60 * 1000;
export const STALE_AFTER_MS = STALE_COLLECTOR_MAX_AGE_HOURS * HOUR;

export interface OverviewMachine {
  agentId: string;
  agentName?: string;
  status?: string;
  isManager: boolean;
}

// Las máquinas del alcance: las de los agentes por id y el manager al final.
export const overviewMachines = (scope: { id: string; name?: string; status?: string }[]): OverviewMachine[] =>
  [...scope]
    .map(agent => ({ agentId: agent.id, agentName: agent.name, status: agent.status, isManager: agent.id === '000' }))
    .sort((a, b) => (a.isManager === b.isManager ? a.agentId.localeCompare(b.agentId) : a.isManager ? 1 : -1));

export const machineLabel = (m: Pick<OverviewMachine, 'agentId' | 'agentName'>) => (m.agentName ? `${m.agentId} · ${m.agentName}` : m.agentId);

// «hace 12 min», «hace 5 h», «hace 3 d»; sin fecha, «nunca».
export const describeAge = (iso: string | undefined, nowMs: number): string => {
  if (!iso) return 'nunca';
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  if (ms < HOUR) return `hace ${Math.max(1, Math.round(ms / 60000))} min`;
  if (ms < 48 * HOUR) return `hace ${Math.round(ms / HOUR)} h`;
  return `hace ${Math.round(ms / (24 * HOUR))} d`;
};

// --- V1 ----------------------------------------------------------------------

export type MatrixCell =
  | { kind: 'result'; status: string; score?: number; notMet: number; notEvidenced: number }
  // Un control solo de manager visto en otra máquina: su resultado es el del
  // manager, que es otra columna.
  | { kind: 'manager' }
  // No se mide en esta máquina (plano o alcance declarado), con el motivo.
  | { kind: 'not-measured'; reason?: string }
  // Primera carga por partes: el control aún se está calculando.
  | { kind: 'pending' };

export interface MatrixRow {
  controlId: string;
  title: string;
  overall?: ENSControlSummaryEntry;
  cells: Record<string, MatrixCell>;
  tally?: ENSMachineTally;
  // Aún calculándose (`controls[].pending`): ni resultado ni «no se mide».
  pending?: boolean;
}

export interface MatrixOptions {
  isManagerOnly: (controlId: string) => boolean;
  notMeasuredReason: (controlId: string, agentId: string) => string | undefined;
}

export const buildMatrix = (
  controls: { id: string; title: string }[],
  machines: OverviewMachine[],
  overall: ENSControlSummaryEntry[],
  agentRows: ENSAgentControlsRow[],
  options: MatrixOptions
): MatrixRow[] =>
  controls.map(control => {
    const cells: Record<string, MatrixCell> = {};
    const general = overall.find(entry => entry.controlId === control.id);
    // Un control que el servidor aún calcula no tiene filas todavía: no es que
    // no se mida en ninguna máquina.
    const pendiente = Boolean(general?.pending);
    machines.forEach(machine => {
      const fila = agentRows.find(row => row.agentId === machine.agentId);
      const entrada = fila?.controls.find(c => c.controlId === control.id);
      if (pendiente) {
        cells[machine.agentId] = !machine.isManager && options.isManagerOnly(control.id) ? { kind: 'manager' } : { kind: 'pending' };
      } else if (entrada) {
        cells[machine.agentId] = {
          kind: 'result',
          status: entrada.status,
          score: entrada.score,
          notMet: entrada.requirementsNotMet,
          notEvidenced: entrada.requirementsNotEvidenced,
        };
      } else if (!machine.isManager && options.isManagerOnly(control.id)) {
        cells[machine.agentId] = { kind: 'manager' };
      } else {
        cells[machine.agentId] = { kind: 'not-measured', reason: options.notMeasuredReason(control.id, machine.agentId) };
      }
    });
    return {
      controlId: control.id,
      title: control.title,
      overall: general,
      cells,
      tally: pendiente ? undefined : tallyMachines(control.id, agentRows),
      ...(pendiente ? { pending: true } : {}),
    };
  });

// La primera carga por partes (`meta.pending`): cuánto falta. Mientras, la
// pantalla no da cifras de conjunto (por máquina, la cola entera) como si
// fueran finales: serían de una parte de los controles.
export const describeOverviewPending = (
  pending: { rows: number; controls: string[]; total: number } | undefined
): { title: string; text: string; controls: string[] } | undefined =>
  pending
    ? {
        title: `Calculando la evaluación: ${pending.total - pending.rows} de ${pending.total} filas (control × máquina) listas`,
        text:
          `Faltan ${pending.controls.length} control${pending.controls.length === 1 ? '' : 'es'} (${pending.controls.join(', ')}). ` +
          'Las cifras por máquina y la cola de trabajo se completan cuando estén todos; mientras, la matriz enseña los ya calculados.',
        controls: pending.controls,
      }
    : undefined;

// --- V2 ----------------------------------------------------------------------

export type FreshnessCell =
  | { kind: 'fresh' | 'stale'; newest: string; count: number }
  // Se mide aquí y no ha llegado nada en la ventana.
  | { kind: 'never'; count: 0 }
  // No se espera nada (no se mide aquí, o se mide en el manager).
  | { kind: 'not-expected' };

export const freshnessCell = (
  freshness: Pick<ENSFreshness, 'cells'>,
  controlId: string,
  agentId: string,
  expected: boolean,
  nowMs: number
): FreshnessCell => {
  if (!expected) return { kind: 'not-expected' };
  const celda = freshness.cells.find(c => c.controlId === controlId && c.agentId === agentId);
  if (!celda || !celda.newest || !celda.count) return { kind: 'never', count: 0 };
  return { kind: nowMs - Date.parse(celda.newest) > STALE_AFTER_MS ? 'stale' : 'fresh', newest: celda.newest, count: celda.count };
};

// --- V3 ----------------------------------------------------------------------

const SEVERIDAD: Record<string, number> = { NO_CUMPLE: 0, PARCIAL: 1, NO_EVALUABLE: 2, CUMPLE: 3, NO_APLICA: 4 };

export interface MachineSummary {
  agentId: string;
  agentName?: string;
  status?: string;
  isManager: boolean;
  measured: number;
  counts: Record<'CUMPLE' | 'PARCIAL' | 'NO_CUMPLE' | 'NO_EVALUABLE' | 'NO_APLICA', number>;
  notMet: number;
  notEvidenced: number;
  newest?: string;
  lastHeartbeat?: string;
  // La fecha con la que se decide `stale`: la más reciente de las dos.
  lastSeen?: string;
  stale: boolean;
  worst: { controlId: string; status: string; score?: number }[];
}

export const buildMachineSummaries = (
  machines: OverviewMachine[],
  agentRows: ENSAgentControlsRow[],
  freshness: Pick<ENSFreshness, 'agents'>,
  nowMs: number
): MachineSummary[] =>
  machines.map(machine => {
    const controles = agentRows.find(row => row.agentId === machine.agentId)?.controls || [];
    const counts = { CUMPLE: 0, PARCIAL: 0, NO_CUMPLE: 0, NO_EVALUABLE: 0, NO_APLICA: 0 };
    controles.forEach(c => {
      const clave = (c.status in counts ? c.status : 'NO_EVALUABLE') as keyof typeof counts;
      counts[clave] += 1;
    });
    const fresca = freshness.agents.find(a => a.agentId === machine.agentId);
    const ultimo = [fresca?.newest, fresca?.lastHeartbeat].filter(Boolean).sort().pop();
    return {
      ...machine,
      measured: controles.length,
      counts,
      notMet: controles.reduce((n, c) => n + (c.requirementsNotMet || 0), 0),
      notEvidenced: controles.reduce((n, c) => n + (c.requirementsNotEvidenced || 0), 0),
      newest: fresca?.newest,
      lastHeartbeat: fresca?.lastHeartbeat,
      lastSeen: ultimo,
      stale: !ultimo || nowMs - Date.parse(ultimo) > STALE_AFTER_MS,
      worst: controles
        .filter(c => c.status !== 'CUMPLE' && c.status !== 'NO_APLICA')
        .sort(
          (a, b) =>
            (SEVERIDAD[a.status] ?? 2) - (SEVERIDAD[b.status] ?? 2) ||
            (a.score ?? 0) - (b.score ?? 0) ||
            (b.requirementsNotMet || 0) - (a.requirementsNotMet || 0) ||
            a.controlId.localeCompare(b.controlId)
        )
        .slice(0, 3)
        .map(c => ({ controlId: c.controlId, status: c.status, score: c.score })),
    };
  });

// --- V5 ----------------------------------------------------------------------

export interface WorkItem {
  controlId: string;
  nc: ENSOverviewNonConformity;
  // La primera frase de la evidencia culpable (la calcula el servidor con
  // `motive-parser.ts`, el mismo analizador que la tarjeta).
  title: string;
  evidenceId?: string;
  status?: string;
  machines: string;
}

export interface WorkGroup {
  owner: string;
  clase: NonConformityClass;
  items: WorkItem[];
  controls: number;
}

const describeMachines = (agentIds: string[], nameOf: (agentId: string) => string | undefined) =>
  !agentIds.length
    ? 'todas las máquinas'
    : agentIds.length <= 3
    ? agentIds.map(id => (nameOf(id) ? `${nameOf(id)} (${id})` : id)).join(', ')
    : `${agentIds.length} máquinas`;

export const buildWorkQueue = (
  ncs: ENSOverviewNonConformity[],
  agentId?: string,
  isConfigured: (controlId: string) => boolean = () => true,
  nameOf: (agentId: string) => string | undefined = () => undefined
): WorkGroup[] => {
  const grupos = new Map<string, WorkGroup>();
  ncs
    .filter(nc => !agentId || !nc.agentIds.length || nc.agentIds.includes(agentId))
    .forEach(nc => {
      const clase = classifyNonConformity(nc, { controlConfigured: isConfigured(nc.controlId) });
      const grupo = grupos.get(clase.responsable) || { owner: clase.responsable, clase, items: [], controls: 0 };
      grupo.items.push({
        controlId: nc.controlId,
        nc,
        title: nc.title,
        ...(nc.titleEvidenceId ? { evidenceId: nc.titleEvidenceId, status: nc.titleStatus } : {}),
        machines: describeMachines(nc.agentIds, nameOf),
      });
      grupos.set(clase.responsable, grupo);
    });
  return Array.from(grupos.values())
    .map(g => ({ ...g, controls: new Set(g.items.map(i => i.controlId)).size }))
    .sort((a, b) => a.clase.orden - b.clase.orden);
};

// --- V6 ----------------------------------------------------------------------

export interface TrendControlRow {
  controlId: string;
  cells: { date: string; label: string; status?: string; score?: number }[];
  // Cambió de estado en la ventana.
  changed: boolean;
  first?: string;
  last?: string;
}

export const buildTrend = (timeline: ENSEvaluationTimelinePoint[] = [], controlIds: string[]) => {
  const points = timeline.map(p => ({ date: p.date, label: p.label, score: p.score, isCurrent: p.isCurrent }));
  const rows: TrendControlRow[] = controlIds.map(controlId => {
    const cells = timeline.map(p => ({ date: p.date, label: p.label, ...(p.controls?.[controlId] || {}) }));
    const estados = cells.map(c => c.status).filter(Boolean) as string[];
    return {
      controlId,
      cells,
      changed: new Set(estados).size > 1,
      first: estados[0],
      last: estados[estados.length - 1],
    };
  });
  const conValor = points.filter(p => typeof p.score === 'number') as { score: number }[];
  return {
    points,
    rows,
    delta: conValor.length > 1 ? conValor[conValor.length - 1].score - conValor[0].score : undefined,
    hasControls: timeline.some(p => p.controls && Object.keys(p.controls).length > 0),
  };
};
