// La carga del inventario de agentes desde el navegador, como el usuario que
// mira. La consulta y su lectura están en `common/agents/agent-inventory.ts`.
import type { ENSAgentScope } from '../../common/ens/core/scope/types';
import {
  buildMonitoringInventoryRequest,
  inventoryFromMonitoring,
  staleInventoryMessage,
} from '../../common/agents/agent-inventory';
import { getCore, getData } from '../services';
import { withRequestTimeout } from '../../common/platform/request-timeout';

export const loadENSAgentInventory = async (): Promise<ENSAgentScope[]> => {
  const respuesta: any = await withRequestTimeout(
    signal => getData().search.search(
      { params: buildMonitoringInventoryRequest() },
      { abortSignal: signal }
    ).toPromise(),
    'inventario de agentes'
  );
  const inventario = inventoryFromMonitoring(respuesta?.rawResponse?.aggregations);

  if (!inventario.agents.length) {
    throw new Error(
      'No hay inventario de agentes: la monitorización de agentes de Wazuh (wazuh-monitoring-*) no está activa o este usuario no puede leerla.'
    );
  }

  if (inventario.stale) {
    getCore().notifications.toasts.addWarning({
      title: 'ENSFácil: inventario de agentes antiguo',
      text: staleInventoryMessage(inventario.newestTimestamp),
    });
  }

  return inventario.agents;
};
