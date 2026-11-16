import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { POWER_ENS_HOSTS_PATH } from '../../common/constants';
import { createHostHandlers } from '../lib/host-handlers';

const condition = schema.object({ field: schema.string(), op: schema.string(), value: schema.string() });

export const registerHostRoutes = (router: IRouter, options: { logger: Logger }): void => {
  const h = createHostHandlers(options);

  router.post(
    {
      path: `${POWER_ENS_HOSTS_PATH}/search`,
      validate: {
        body: schema.object({
          page: schema.number({ defaultValue: 0, min: 0 }),
          size: schema.number({ defaultValue: 25, min: 1, max: 100 }),
          text: schema.string({ defaultValue: '', maxLength: 200 }),
          filters: schema.recordOf(schema.string(), schema.string(), { defaultValue: {} }),
        }),
      },
    },
    h.search
  );
  router.get({ path: `${POWER_ENS_HOSTS_PATH}/summary`, validate: false }, h.summary);
  router.post(
    { path: `${POWER_ENS_HOSTS_PATH}/preview`, validate: { body: schema.object({ match: schema.arrayOf(condition, { maxSize: 50 }) }) } },
    h.preview
  );
  router.get(
    { path: `${POWER_ENS_HOSTS_PATH}/{agentId}`, validate: { params: schema.object({ agentId: schema.string({ maxLength: 16 }) }) } },
    h.detail
  );
};
