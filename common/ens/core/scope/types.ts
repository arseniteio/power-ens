export interface ENSAgentScope {
  id: string;
  name?: string;
  groups: string[];
  // El manager de Wazuh (000). No entra por grupo sino por el plano de medida
  // de los controles: ver `measurement-planes.ts`.
  isManager?: boolean;
  // Estado del agente según wazuh-monitoring; solo lo usa el selector.
  status?: string;
}

export interface ENSScopeResult {
  agentId: string;
  agentName?: string;
  inScope: boolean;
  scopeGroup: string;
  matchedGroups: string[];
  reason: string;
}
