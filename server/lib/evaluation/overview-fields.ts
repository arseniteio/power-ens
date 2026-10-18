// Los campos que la ruta de evaluación añade para las vistas generales (1.2.0,
// Task 2). Funciones puras sobre lo que la evaluación ya tiene en memoria (el
// estado armado, la sonda, los puntos de la serie): ninguna lectura más. Viven
// aparte de `responses.ts` y `evaluation-service.ts` para engancharlas con una
// línea en cada sitio. Lo que consumen las pantallas está en `server/README.md`.
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';
import type { ENSComplianceState } from '../../../common/ens/core/compliance-state/types';
import type { ENSControlSummaryEntry, ENSFreshness, ENSOverviewNonConformity } from '../../../common/ens/evaluation/types';
import type { ENSProbeResult } from './queries';
import { guiltyPart, parseMotive } from '../../../common/ens/evaluation/motive-parser';

// `summary` y `overview`: cada máquina con lo que dice cada control EN SU FILA
// (la matriz de la Vista general y la barra por control de la lista). Un
// control que no se mide en ella no aparece.
export const agentControlRows = (
  state: Pick<ENSComplianceState, 'agents'> | undefined,
  summaryOf: (controlId: string, result?: ENSComplianceResult) => ENSControlSummaryEntry
) =>
  (state?.agents || []).map(agent => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    summary: agent.summary,
    controls: agent.results.map(result => summaryOf(result.control.id, result)),
  }));

// `overview`: la frescura de la recogida, de la sonda que ya se hizo para la
// huella. Las máquinas son las del alcance.
export const freshnessOf = (
  probe: Pick<ENSProbeResult, 'presence' | 'heartbeats' | 'controls'>,
  meta: { evaluatedAt: string; scope: { id: string; name?: string }[] }
): ENSFreshness => {
  const enAlcance = new Set(meta.scope.map(agent => agent.id));
  return {
    checkedAt: meta.evaluatedAt,
    agents: meta.scope.map(agent => {
      const presencia = probe.presence.find(p => p.agentId === agent.id);
      const latidos = probe.heartbeats[agent.id] || [];
      return {
        agentId: agent.id,
        count: presencia?.count || 0,
        earliest: presencia?.earliest,
        newest: presencia?.newest,
        lastHeartbeat: latidos.length ? latidos[latidos.length - 1] : undefined,
      };
    }),
    cells: Object.entries(probe.controls).flatMap(([controlId, hechos]) =>
      Object.entries(hechos.agents || {})
        .filter(([agentId]) => enAlcance.has(agentId))
        .map(([agentId, h]) => ({ controlId, agentId, count: h.count, newest: h.newest }))
    ),
  };
};

// `overview`: la cola de trabajo, las no conformidades de la vista de conjunto
// con su control. Solo lo que pinta la cola: el titular (la primera frase de la
// evidencia culpable, el mismo analizador que la tarjeta), las máquinas por id.
// Ni acción, ni hallazgo entero, ni impacto, ni trazas: el detalle está a un clic.
export const nonConformitiesOf = (state: Pick<ENSComplianceState, 'results'> | undefined): ENSOverviewNonConformity[] =>
  (state?.results || []).flatMap(result =>
    (result.nonConformities || []).map(nc => {
      const culpable = guiltyPart(parseMotive(nc.finding).parts, nc.evidenceIds || []);
      return {
        controlId: result.control.id,
        id: nc.id,
        requirementId: nc.requirementId,
        origin: nc.origin,
        ...(nc.cause ? { cause: nc.cause } : {}),
        ...(nc.documental ? { documental: true } : {}),
        evidenceIds: nc.evidenceIds || [],
        agentIds: (nc.agents || []).map(agent => agent.agentId),
        title: culpable?.summary || nc.finding,
        ...(culpable?.evidenceId ? { titleEvidenceId: culpable.evidenceId, titleStatus: culpable.status } : {}),
      };
    })
  );

// Las cifras por control de cada punto de la serie solo van a quien las pide
// (`timelineControls=true`, la tendencia de la Vista general): el Panel y el
// detalle no las leen. El servicio las calcula siempre (se guardan con los días
// pasados y valen para cualquier petición); aquí se quitan si no se piden.
export const overviewQueryFlags = (query: Record<string, unknown>): { timelineControls?: true } =>
  query.timelineControls === true || query.timelineControls === 'true' ? { timelineControls: true } : {};

export const visibleTimeline = (timeline: any[] | undefined, query: { timelineControls?: boolean }): any[] | undefined =>
  timeline && !query.timelineControls ? timeline.map(({ controls, ...point }) => point) : timeline;

// Un punto de la serie sin control: el estado de cada control ese día (la
// tendencia por control de la Vista general). `points[i]` es el del control
// `controls[i]` en ese corte.
export const perControlOfPoint = (
  controls: string[],
  points: ({ status?: string; score?: number } | undefined)[]
): Record<string, { status?: string; score?: number }> =>
  Object.fromEntries(controls.flatMap((controlId, i) => (points[i] ? [[controlId, { status: points[i]!.status, score: points[i]!.score }]] : [])));

// El punto de hoy: los resultados de la vista.
export const perControlOfResults = (results: Pick<ENSComplianceResult, 'control' | 'status' | 'score'>[]) =>
  Object.fromEntries(results.map(r => [r.control.id, { status: r.status, score: r.score }]));
