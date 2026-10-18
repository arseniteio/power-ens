// Lo que devuelve cada vista. Compacto: el navegador recibe resultados, nunca
// hechos. La forma de cada una está en `server/README.md`.
import { buildENSDashboardModel } from '../../../common/ens/core/dashboard-adapter/dashboard-adapter';
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';
import { ENS_EVALUATION_LIMITS } from '../../../common/ens/evaluation/limits';
import { catalogControlIds } from './queries';
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
        ? { ...entrada.result, traceability: entrada.traceability().slice(0, ENS_EVALUATION_LIMITS.traceabilityInitial) }
        : undefined,
      traceabilityTotal: entrada?.traceabilityTotal || 0,
      traceabilityAvailable: entrada?.traceabilityStored || 0,
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

  // Los controles aún por calcular (primera carga): en su sitio, sin estado.
  const pendientes = meta.pending?.controls || [];
  const conPendientes = <T extends { controlId: string }>(listos: T[], pendiente: (controlId: string) => T): T[] => {
    if (!pendientes.length) return listos;
    const porId = new Map(listos.map(entrada => [entrada.controlId, entrada]));
    return catalogControlIds()
      .filter(id => porId.has(id) || pendientes.includes(id))
      .map(id => porId.get(id) || pendiente(id));
  };

  if (query.include === 'summary') {
    return {
      meta,
      ...stateHeader(run),
      controls: conPendientes(
        state.results.map(result => controlSummaryOf(result.control.id, result)),
        controlId => ({ ...controlSummaryOf(controlId, undefined), pending: true })
      ),
      agents: agentRows(run).map(({ results, ...agent }) => agent),
    };
  }

  if (query.include === 'dashboard') {
    const modelo = buildENSDashboardModel(state, [], (timeline || []).map(point => ({ ...point, date: new Date(point.date) })));
    return {
      meta,
      ...stateHeader(run),
      dashboard: { ...modelo, impactEvents: run.impact },
      agents: agentRows(run),
      timeline,
      // Con la primera carga a medias, el estado de cada control (los que
      // faltan, `pending`): el panel enseña esos y no cifras de conjunto.
      ...(pendientes.length
        ? {
            controls: conPendientes(
              state.results.map(result => controlSummaryOf(result.control.id, result)),
              controlId => ({ ...controlSummaryOf(controlId, undefined), pending: true })
            ),
          }
        : {}),
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
  const lista = entrada ? entrada.traceability() : [];
  return {
    meta: run.meta,
    total: entrada?.traceabilityTotal || 0,
    available: lista.length,
    from,
    items: lista.slice(from, from + size),
  };
};
