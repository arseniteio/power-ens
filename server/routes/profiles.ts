import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { POWER_ENS_PROFILES_PATH } from '../../common/constants';
import { MAX_IMPORT_BYTES, createProfileHandlers } from '../lib/profile-handlers';

const version = schema.maybe(schema.nullable(schema.object({ seqNo: schema.number(), primaryTerm: schema.number() })));
const profileId = schema.object({ id: schema.string({ minLength: 1, maxLength: 63 }) });

export const registerProfileRoutes = (router: IRouter, options: { logger: Logger; securityEnabled: boolean }): void => {
  const h = createProfileHandlers(options);

  router.get({ path: POWER_ENS_PROFILES_PATH, validate: false }, h.list);
  router.get(
    { path: `${POWER_ENS_PROFILES_PATH}/export`, validate: { query: schema.object({ ids: schema.maybe(schema.string()) }) } },
    h.exportYaml
  );
  router.post(
    {
      path: `${POWER_ENS_PROFILES_PATH}/import/plan`,
      validate: { body: schema.object({ text: schema.string() }) },
      options: { body: { maxBytes: MAX_IMPORT_BYTES + 64 * 1024 } },
    },
    h.importPlan
  );
  router.post(
    {
      path: `${POWER_ENS_PROFILES_PATH}/apply`,
      validate: {
        body: schema.object({
          upserts: schema.arrayOf(schema.object({ profile: schema.any(), expectedVersion: version }), { defaultValue: [] }),
          deletions: schema.arrayOf(schema.object({ id: schema.string(), expectedVersion: version }), { defaultValue: [] }),
        }),
      },
      options: { body: { maxBytes: MAX_IMPORT_BYTES + 64 * 1024 } },
    },
    h.apply
  );
  router.get({ path: `${POWER_ENS_PROFILES_PATH}/{id}`, validate: { params: profileId } }, h.get);
  router.put(
    {
      path: `${POWER_ENS_PROFILES_PATH}/{id}`,
      validate: { params: profileId, body: schema.object({ profile: schema.any(), expectedVersion: version }) },
    },
    h.put
  );
  router.delete(
    {
      path: `${POWER_ENS_PROFILES_PATH}/{id}`,
      validate: {
        params: profileId,
        query: schema.object({ seqNo: schema.maybe(schema.number()), primaryTerm: schema.maybe(schema.number()) }),
      },
    },
    h.remove
  );
};
