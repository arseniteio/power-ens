import { schema } from '@osd/config-schema';
import type { IRouter, Logger } from '../../../../src/core/server';
import { POWER_ENS_ANNUAL_REPORT_PATH } from '../../common/constants';
import { createAnnualReportHandlers } from '../lib/annual-report-handlers';
import type { ENSAnnualReportService } from '../lib/annual-report/annual-report-service';

export const registerAnnualReportRoutes = (
  router: IRouter,
  options: { logger: Logger; securityEnabled: boolean; annualReport: ENSAnnualReportService }
): void => {
  const h = createAnnualReportHandlers(options);

  router.get(
    {
      path: POWER_ENS_ANNUAL_REPORT_PATH,
      // Strings as the browser sends them; the service checks the year and the revision.
      validate: { query: schema.object({ period: schema.maybe(schema.string()), revision: schema.maybe(schema.string()) }) },
    },
    h.read
  );
  router.post(
    {
      path: `${POWER_ENS_ANNUAL_REPORT_PATH}/freeze`,
      validate: {
        // Every key the browser sends (ENSAnnualFreezeRequest). Required: the revision read (null when none).
        body: schema.object({
          period: schema.string(),
          reason: schema.string(),
          expectedRevision: schema.nullable(schema.number()),
        }),
      },
    },
    h.freeze
  );
};
