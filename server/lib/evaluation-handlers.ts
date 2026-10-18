// Las rutas de la evaluación. Todo se lee como el usuario que mira
// (`asCurrentUser`): el indexador sigue aplicando sus permisos. Solo la
// configuración activa se lee como hasta ahora (`asInternalUser`, igual que
// `GET /api/ensfacil/configuration`).
//
// Los cálculos se comparten por fila (un control en una máquina, ver
// `evaluation-service.ts`), no por petición: lo que sale de la memoria nunca
// espera detrás de un cálculo en frío, y el panel y la lista de controles
// abiertos a la vez leen una sola vez. Si el navegador cierra la petición y
// nadie más espera ese cálculo, se cancela.
import type { Logger } from '../../../../src/core/server';
import { ENS_EVALUATION_LIMITS } from '../../common/ens/evaluation/limits';
import { CancelSignal } from './evaluation/cache';
import {
  createEvaluationService,
  ENSBadRequestError,
  ENSEvaluationService,
  normalizeQuery,
} from './evaluation/evaluation-service';
import { buildEvaluationResponse, buildTraceabilityPage } from './evaluation/responses';

const correcto = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const fallo = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const estadoDe = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

const clientes = (context: any) => ({
  asCurrentUser: context.core.opensearch.client.asCurrentUser,
  asInternalUser: context.core.opensearch.client.asInternalUser,
});

// La señal de la petición: se cancela si el navegador la cierra.
const senalDe = (request: any) => {
  const signal = new CancelSignal();
  const suscripcion = request?.events?.aborted$?.subscribe?.(() => signal.cancel());
  return { signal, suelta: () => suscripcion?.unsubscribe?.() };
};

const entero = (valor: unknown, defecto: number, min: number, max: number, nombre: string): number => {
  if (valor === undefined || valor === '') return defecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ENSBadRequestError(`${nombre} va de ${min} a ${max}.`);
  }
  return n;
};

export const createEvaluationHandlers = (options: {
  logger: Logger;
  securityEnabled: boolean;
  service?: ENSEvaluationService;
}) => {
  const { logger } = options;
  const service = options.service || createEvaluationService(options);

  const conErrores = async (request: any, response: any, accion: string, tarea: (signal: CancelSignal) => Promise<unknown>) => {
    const { signal, suelta } = senalDe(request);
    try {
      return correcto(response, await tarea(signal));
    } catch (error: any) {
      const estado = estadoDe(error);
      // Lo que tiene un motivo para quien mira (petición mal hecha, permisos,
      // datos incompletos, demasiados hechos, cancelada) sale con él.
      if ((estado >= 400 && estado < 500) || estado === 503) {
        if (estado === 503) logger.warn(`ENSFácil: no se pudo ${accion}: ${error?.message}`);
        return fallo(response, estado, error?.message || 'No autorizado');
      }
      logger.error(`ENSFácil: no se pudo ${accion}: ${error?.message || error}`);
      return fallo(response, 500, `No se pudo ${accion}; el detalle está en el log del dashboard.`);
    } finally {
      suelta();
    }
  };

  const evaluate = (context: any, request: any, response: any) =>
    conErrores(request, response, 'evaluar los controles', async signal => {
      const query = normalizeQuery(request?.query || {});
      const salida = await service.run(clientes(context), query, { allowStale: true, signal });
      const s = salida.meta.stats;
      logger.debug(
        `ENSFácil: evaluación ${query.include} ${query.controlId || '*'}/${query.agentId || '*'} en ${s.totalMs} ms ` +
          `(${s.computed} filas calculadas, ${s.refreshingInBackground} refrescándose, ${s.hits} hechos leídos)`
      );
      return buildEvaluationResponse(salida);
    });

  // La sonda: ¿ha cambiado algo desde la última evaluación? Unos cientos de
  // bytes; el navegador solo vuelve a pedir la evaluación si la huella cambia.
  const probe = (context: any, request: any, response: any) =>
    conErrores(request, response, 'comprobar si hay hechos nuevos', async () => {
      const query = normalizeQuery(request?.query || {});
      const ctx = await service.loadContext(clientes(context), query);
      return {
        fingerprint: service.viewFingerprint(ctx, query),
        checkedAt: ctx.now.toISOString(),
        configurationUpdatedAt: ctx.configurationUpdatedAt,
        facts: { count: ctx.probe.count, newest: ctx.probe.newest },
      };
    });

  const traceability = (context: any, request: any, response: any) =>
    conErrores(request, response, 'leer la trazabilidad del control', async signal => {
      const q = request?.query || {};
      const query = normalizeQuery({ ...q, include: 'control', timelineDays: '0' });
      if (!query.controlId) throw new ENSBadRequestError('Falta el control.');
      const from = entero(q.from, 0, 0, ENS_EVALUATION_LIMITS.traceabilityStored, '«from»');
      const size = entero(q.size, 50, 1, ENS_EVALUATION_LIMITS.traceabilityPageMax, '«size»');
      return buildTraceabilityPage(await service.run(clientes(context), query, { allowStale: true, signal }), from, size);
    });

  return { evaluate, probe, traceability, service };
};
