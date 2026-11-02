import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { POWER_ENS_EVALUATION_PATH } from '../../common/constants';
import { createEvaluationHandlers } from '../lib/evaluation-handlers';
import type { ENSEvaluationService } from '../lib/evaluation/evaluation-service';
import { buildEvaluationQuerySchema } from './evaluation-query';

const searchQuery = buildEvaluationQuerySchema(schema);

export const registerEvaluationRoutes = (
  router: IRouter,
  options: { logger: Logger; securityEnabled: boolean; service?: ENSEvaluationService }
): void => {
  const h = createEvaluationHandlers(options);

  router.get({ path: POWER_ENS_EVALUATION_PATH, validate: { query: searchQuery } }, h.evaluate);
  router.get({ path: `${POWER_ENS_EVALUATION_PATH}/probe`, validate: { query: searchQuery } }, h.probe);
  router.get({ path: `${POWER_ENS_EVALUATION_PATH}/traceability`, validate: { query: searchQuery } }, h.traceability);
};
