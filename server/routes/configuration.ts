import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { ENSFACIL_CONFIGURATION_PATH } from '../../common/constants';
import { createConfigurationHandlers } from '../lib/configuration-handlers';

export const registerConfigurationRoutes = (
  router: IRouter,
  options: { logger: Logger; securityEnabled: boolean }
): void => {
  const h = createConfigurationHandlers(options);

  router.get({ path: ENSFACIL_CONFIGURATION_PATH, validate: false }, h.getActive);
  router.put(
    {
      path: ENSFACIL_CONFIGURATION_PATH,
      validate: {
        // Every key the browser sends (ENSConfigurationSaveRequest): the schema rejects any other.
        body: schema.object({
          configuration: schema.any(),
          changeReason: schema.maybe(schema.string()),
          // null: loaded when there was no configuration; absent: a client or script that does not send it.
          expectedVersion: schema.maybe(
            schema.nullable(schema.object({ seqNo: schema.number(), primaryTerm: schema.number() }))
          ),
        }),
      },
    },
    h.save
  );
  router.get({ path: `${ENSFACIL_CONFIGURATION_PATH}/history`, validate: false }, h.history);
};
