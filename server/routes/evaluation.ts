import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { ENSFACIL_EVALUATION_PATH } from '../../common/constants';
import { createEvaluationHandlers } from '../lib/evaluation-handlers';
import { buildEvaluationQuerySchema } from './evaluation-query';

// Los parámetros, declarados en `evaluation-query.ts` (lo que no está allí no
// llega al servicio).
const consulta = buildEvaluationQuerySchema(schema);

export const registerEvaluationRoutes = (
  router: IRouter,
  options: { logger: Logger; securityEnabled: boolean }
): void => {
  const h = createEvaluationHandlers(options);

  router.get({ path: ENSFACIL_EVALUATION_PATH, validate: { query: consulta } }, h.evaluate);
  router.get({ path: `${ENSFACIL_EVALUATION_PATH}/probe`, validate: { query: consulta } }, h.probe);
  router.get({ path: `${ENSFACIL_EVALUATION_PATH}/traceability`, validate: { query: consulta } }, h.traceability);
};
