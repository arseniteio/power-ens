import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { POWER_ENS_EXCLUSIONS_PATH } from '../../common/constants';
import { createExclusionHandlers } from '../lib/exclusion-handlers';

export const registerExclusionRoutes = (router: IRouter, options: { logger: Logger; securityEnabled: boolean }): void => {
  const h = createExclusionHandlers(options);

  router.get(
    {
      path: POWER_ENS_EXCLUSIONS_PATH,
      validate: { query: schema.object({ agentId: schema.string(), controlId: schema.string() }) },
    },
    h.status
  );
  router.post(
    {
      path: POWER_ENS_EXCLUSIONS_PATH,
      validate: {
        body: schema.object({
          agentId: schema.string(),
          controlId: schema.string(),
          action: schema.string(),
          reason: schema.string(),
        }),
      },
    },
    h.record
  );
};
