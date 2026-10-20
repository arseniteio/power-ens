import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { ENSFACIL_MATURITY_PATH } from '../../common/constants';
import { createMaturityHandlers } from '../lib/maturity-handlers';
import type { ENSMaturityService } from '../lib/maturity/maturity-service';

export const registerMaturityRoutes = (
  router: IRouter,
  options: { logger: Logger; securityEnabled: boolean; maturity: ENSMaturityService }
): void => {
  const h = createMaturityHandlers(options);

  router.put(
    {
      path: ENSFACIL_MATURITY_PATH,
      validate: {
        // Every key the browser sends (ENSMaturitySaveRequest); the entry is validated by the handler.
        body: schema.object({
          controlId: schema.string(),
          kind: schema.string(),
          entry: schema.any(),
          expectedVersion: schema.maybe(
            schema.nullable(schema.object({ seqNo: schema.number(), primaryTerm: schema.number() }))
          ),
        }),
      },
    },
    h.save
  );
  router.get(
    {
      path: `${ENSFACIL_MATURITY_PATH}/snapshots`,
      validate: {
        query: schema.object({ controlId: schema.maybe(schema.string()), from: schema.string(), to: schema.string() }),
      },
    },
    h.snapshots
  );
};
