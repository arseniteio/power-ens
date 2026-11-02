import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { POWER_ENS_CONFIGURATION_PATH } from '../../common/constants';
import { createConfigurationHandlers } from '../lib/configuration-handlers';

export const registerConfigurationRoutes = (
  router: IRouter,
  options: { logger: Logger; securityEnabled: boolean }
): void => {
  const h = createConfigurationHandlers(options);

  router.get({ path: POWER_ENS_CONFIGURATION_PATH, validate: false }, h.getActive);
  router.put(
    {
      path: POWER_ENS_CONFIGURATION_PATH,
      validate: {
        body: schema.object({
          configuration: schema.any(),
          changeReason: schema.maybe(schema.string()),
          expectedVersion: schema.maybe(
            schema.nullable(schema.object({ seqNo: schema.number(), primaryTerm: schema.number() }))
          ),
        }),
      },
    },
    h.save
  );
  router.get({ path: `${POWER_ENS_CONFIGURATION_PATH}/history`, validate: false }, h.history);
};
