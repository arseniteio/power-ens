// Lo que devuelve cada vista. Compacto: el navegador recibe resultados, nunca
// hechos. La forma de cada una está en `server/README.md`.
import { buildENSDashboardModel } from '../../../common/ens/core/dashboard-adapter/dashboard-adapter';
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';
import { ENS_EVALUATION_LIMITS } from '../../../common/ens/evaluation/limits';
import type { ENSEvaluationService } from './evaluation-service';

type RunOutput = Awaited<ReturnType<ENSEvaluationService['run']>>;

// Lo que pinta la lista de controles de cada uno: el estado y cuántos
// requisitos aplicables no cumplen (y de ellos, cuántos por falta de prueba).
export const controlSummaryOf = (controlId: string, result?: ENSComplianceResult) => {
  // `applicable` lo pone el evaluador de requisitos aunque el tipo no lo
  // declare; es el mismo filtro que usaba la fila de la lista.
  const requisitos = (result?.requirements || []).filter(requisito => (requisito as { applicable?: boolean }).applicable);
  return {
    controlId,
    status: result?.status || 'NO_EVALUABLE',
    score: result?.score,
    evaluated: Boolean(result),
    requirementsNotMet: requisitos.filter(requisito => requisito.status !== 'CUMPLE').length,
    requirementsNotEvidenced: requisitos.filter(
      requisito => requisito.status !== 'CUMPLE' && (requisito as { evidenced?: boolean }).evidenced === false
    ).length,
  };
};

// La fila de cada máquina con lo que dice cada control en ella (la matriz de
// la Vista general y la barra por control de la lista).
const agentControlRows = (run: RunOutput) =>
  (run.state?.agents || []).map(agent => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    summary: agent.summary,
    controls: agent.results.map(result => controlSummaryOf(result.control.id, result)),
  }));

// La frescura, de la sonda que ya se hizo para la huella: ni una lectura más.
const freshnessOf = (run: RunOutput) => {
  const probe = run.ctx.probe;
  const enAlcance = new Set(run.meta.scope.map(agent => agent.id));
  return {
    checkedAt: run.meta.evaluatedAt,
    agents: run.meta.scope.map(agent => {
      const presencia = probe.presence.find(p => p.agentId === agent.id);
      const latidos = probe.heartbeats[agent.id] || [];
      return {
        agentId: agent.id,
        agentName: agent.name || presencia?.agentName,
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

// La cola de trabajo: las no conformidades de la vista de conjunto, con su
// control. Sin impacto ni trazas: el detalle está a un clic.
const nonConformitiesOf = (run: RunOutput) =>
  (run.state?.results || []).flatMap(result =>
    (result.nonConformities || []).map(nc => ({
      controlId: result.control.id,
      id: nc.id,
      requirementId: nc.requirementId,
      origin: nc.origin,
      ...(nc.cause ? { cause: nc.cause } : {}),
      ...(nc.documental ? { documental: true } : {}),
      evidenceIds: nc.evidenceIds || [],
      parameterIds: nc.parameterIds || [],
      agents: nc.agents || [],
      finding: nc.finding,
      requiredAction: nc.requiredAction,
    }))
  );

const agentRows = (run: RunOutput) =>
  (run.state?.agents || []).map(agent => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    summary: agent.summary,
    results: agent.results.map(result => ({ controlId: result.control.id, status: result.status, score: result.score })),
  }));

const stateHeader = (run: RunOutput) => {
  const state = run.state!;
  return {
    controlSummary: state.controlSummary,
    requirementSummary: state.requirementSummary,
    agentSummary: state.agentSummary,
    evidenceSummary: state.evidenceSummary,
  };
};

export const buildEvaluationResponse = (run: RunOutput) => {
  const { meta, query, state, views, timeline } = run;

  if (query.include === 'control' && query.controlId) {
    const entrada = views.get(query.controlId);
    return {
      meta,
      // Las primeras entradas de la trazabilidad (las más recientes); el resto,
      // por páginas en `/evaluation/traceability`.
      result: entrada?.result
        ? { ...entrada.result, traceability: (entrada.traceability || []).slice(0, ENS_EVALUATION_LIMITS.traceabilityInitial) }
        : undefined,
      traceabilityTotal: entrada?.traceabilityTotal || 0,
      traceabilityAvailable: (entrada?.traceability || []).length,
      agents: (entrada?.rows || []).map(row => ({
        agentId: row.agentId,
        agentName: run.rowName(row.agentId) || meta.scope.find(agent => agent.id === row.agentId)?.name,
        status: row.result.status,
        score: row.result.score,
      })),
      timeline,
    };
  }

  if (!state) {
    return { meta };
  }

  if (query.include === 'summary' || query.include === 'overview') {
    const resumen = {
      meta,
      ...stateHeader(run),
      controls: state.results.map(result => controlSummaryOf(result.control.id, result)),
      agents: agentControlRows(run),
      ...(timeline ? { timeline } : {}),
    };
    return query.include === 'overview'
      ? { ...resumen, freshness: freshnessOf(run), nonConformities: nonConformitiesOf(run) }
      : resumen;
  }

  if (query.include === 'dashboard') {
    const modelo = buildENSDashboardModel(state, [], (timeline || []).map(point => ({ ...point, date: new Date(point.date) })));
    return {
      meta,
      ...stateHeader(run),
      dashboard: { ...modelo, impactEvents: run.impact },
      agents: agentRows(run),
      timeline,
    };
  }

  // 'results': todo lo que el motor dice de cada control, sin la trazabilidad.
  return {
    meta,
    ...stateHeader(run),
    results: state.results,
    agents: agentRows(run),
    timeline,
  };
};

// La trazabilidad de un control, por páginas, de lo guardado.
export const buildTraceabilityPage = (run: RunOutput, from: number, size: number) => {
  const entrada = run.query.controlId ? run.views.get(run.query.controlId) : undefined;
  const lista = entrada?.traceability || [];
  return {
    meta: run.meta,
    total: entrada?.traceabilityTotal || 0,
    available: lista.length,
    from,
    items: lista.slice(from, from + size),
  };
};
