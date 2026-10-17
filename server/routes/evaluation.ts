import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { ENSFACIL_EVALUATION_PATH } from '../../common/constants';
import { createEvaluationHandlers } from '../lib/evaluation-handlers';

const consulta = schema.object(
  {
    agentId: schema.maybe(schema.string({ maxLength: 64 })),
    controlId: schema.maybe(schema.string({ maxLength: 64 })),
    include: schema.maybe(schema.string({ maxLength: 16 })),
    timelineDays: schema.maybe(schema.string({ maxLength: 3 })),
    timeZone: schema.maybe(schema.string({ maxLength: 64 })),
    from: schema.maybe(schema.string({ maxLength: 8 })),
    size: schema.maybe(schema.string({ maxLength: 4 })),
  },
  { unknowns: 'ignore' }
);

export const registerEvaluationRoutes = (
  router: IRouter,
  options: { logger: Logger; securityEnabled: boolean }
): void => {
  const h = createEvaluationHandlers(options);

  router.get({ path: ENSFACIL_EVALUATION_PATH, validate: { query: consulta } }, h.evaluate);
  router.get({ path: `${ENSFACIL_EVALUATION_PATH}/probe`, validate: { query: consulta } }, h.probe);
  router.get({ path: `${ENSFACIL_EVALUATION_PATH}/traceability`, validate: { query: consulta } }, h.traceability);
};
