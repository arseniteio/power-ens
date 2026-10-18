// Las rutas de la evaluación. Todo se lee como el usuario que mira
// (`asCurrentUser`): el indexador sigue aplicando sus permisos. Solo la
// configuración activa se lee como hasta ahora (`asInternalUser`, igual que
// `GET /api/ensfacil/configuration`).
import { createHash } from 'crypto';
import type { Logger } from '../../../../src/core/server';
import {
  createEvaluationService,
  ENSEvaluationQuery,
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

// Dos peticiones idénticas de la misma sesión a la vez comparten el cálculo.
const claveDePeticion = (request: any, query: ENSEvaluationQuery): string =>
  createHash('sha1')
    .update(JSON.stringify([request?.headers?.authorization || '', request?.headers?.cookie || '', query]))
    .digest('hex');

export const createEvaluationHandlers = (options: {
  logger: Logger;
  securityEnabled: boolean;
  service?: ENSEvaluationService;
}) => {
  const { logger } = options;
  const service = options.service || createEvaluationService(options);

  const conErrores = async (response: any, accion: string, tarea: () => Promise<unknown>) => {
    try {
      return correcto(response, await tarea());
    } catch (error: any) {
      const estado = estadoDe(error);
      if (estado === 401 || estado === 403) {
        return fallo(response, estado, error?.message || 'No autorizado');
      }
      logger.error(`ENSFácil: no se pudo ${accion}: ${error?.message || error}`);
      return fallo(response, 500, `No se pudo ${accion}; el detalle está en el log del dashboard.`);
    }
  };

  const ejecutar = (context: any, request: any, query: ENSEvaluationQuery, options: { fullTraceability?: boolean } = {}) =>
    service.inFlight.run(claveDePeticion(request, { ...query, ...options }), () =>
      service.semaphore.use(() => service.run(clientes(context), query, options))
    );

  const evaluate = (context: any, request: any, response: any) =>
    conErrores(response, 'evaluar los controles', async () => {
      const query = normalizeQuery(request?.query || {});
      const salida = await ejecutar(context, request, query);
      const s = salida.meta.stats;
      logger.debug(
        `ENSFácil: evaluación ${query.include} ${query.controlId || '*'}/${query.agentId || '*'} en ${s.totalMs} ms ` +
          `(${s.computed} controles calculados, ${s.hits} hechos leídos)`
      );
      return buildEvaluationResponse(salida);
    });

  // La sonda: ¿ha cambiado algo desde la última evaluación? Unos cientos de
  // bytes; el navegador solo vuelve a pedir la evaluación si la huella cambia.
  const probe = (context: any, request: any, response: any) =>
    conErrores(response, 'comprobar si hay hechos nuevos', async () => {
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
    conErrores(response, 'leer la trazabilidad del control', async () => {
      const q = request?.query || {};
      const query = normalizeQuery({ ...q, include: 'control', timelineDays: 0 });
      if (!query.controlId) {
        throw Object.assign(new Error('Falta el control.'), { statusCode: 400 });
      }
      const from = Math.max(0, Math.floor(Number(q.from) || 0));
      const size = Math.max(1, Math.min(500, Math.floor(Number(q.size) || 50)));
      // Más allá de las primeras entradas de una máquina, su vista se evalúa
      // entera (las filas del conjunto solo guardan las primeras).
      return buildTraceabilityPage(await ejecutar(context, request, query, { fullTraceability: from + size > 100 }), from, size);
    });

  return { evaluate, probe, traceability, service };
};
