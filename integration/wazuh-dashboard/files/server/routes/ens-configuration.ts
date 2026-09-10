import { schema } from '@osd/config-schema';
import { IRouter } from 'opensearch_dashboards/server';

import { ENSConfigurationCtrl } from '../controllers';
import { routeDecoratorProtectedAdministrator } from '../controllers/decorators';

export function ENSConfigurationRoutes(router: IRouter) {
  const ctrl = new ENSConfigurationCtrl();

  router.get(
    {
      path: '/ens/configuration',
      validate: false,
    },
    async (context, request, response) =>
      ctrl.getActiveConfiguration(
        context,
        request,
        response,
      ),
  );

  router.put(
    {
      path: '/ens/configuration',
      validate: {
        body: schema.object({
          configuration: schema.any(),
          changeReason: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) =>
      ctrl.saveConfiguration(
        context,
        request,
        response,
      ),
  );

  router.get(
    {
      path: '/ens/configuration/history',
      validate: false,
    },
    routeDecoratorProtectedAdministrator(6004)(
      async (context, request, response) =>
        ctrl.getConfigurationHistory(
          context,
          request,
          response,
        ),
    ),
  );
}
