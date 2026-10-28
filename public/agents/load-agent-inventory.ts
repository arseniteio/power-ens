// Loads the agent inventory from the browser as the viewing user. The query and its reading are in `common/agents/agent-inventory.ts`.
import type { ENSAgentScope } from '../../common/ens/core/scope/types';
import {
  buildMonitoringInventoryRequest,
  inventoryFromMonitoring,
  staleInventoryMessage,
} from '../../common/agents/agent-inventory';
import { getCore, getData } from '../services';
import { withRequestTimeout } from '../../common/platform/request-timeout';

export const loadENSAgentInventory = async (): Promise<ENSAgentScope[]> => {
  const response: any = await withRequestTimeout(
    signal => getData().search.search(
      { params: buildMonitoringInventoryRequest() },
      { abortSignal: signal }
    ).toPromise(),
    'inventario de agentes'
  );
  const inventory = inventoryFromMonitoring(response?.rawResponse?.aggregations);

  if (!inventory.agents.length) {
    throw new Error(
      'No hay inventario de agentes: la monitorización de agentes de Wazuh (wazuh-monitoring-*) no está activa o este usuario no puede leerla.'
    );
  }

  if (inventory.stale) {
    getCore().notifications.toasts.addWarning({
      title: 'Power ENS: inventario de agentes antiguo',
      text: staleInventoryMessage(inventory.newestTimestamp),
    });
  }

  return inventory.agents;
};
