export interface ENSAgentScope {
  id: string;
  name?: string;
  groups: string[];
  // El manager de Wazuh (000). No entra por grupo sino por el plano de medida
  // de los controles: ver `measurement-planes.ts`.
  isManager?: boolean;
  // Estado del agente según wazuh-monitoring; solo lo usa el selector.
  status?: string;
  // Sistema operativo según wazuh-monitoring (`os.platform`, `os.name`,
  // `os.version`, `os.uname`). Lo usa Configuración para detectar el tipo de
  // sistema; el motor no lo lee.
  os?: ENSAgentOS;
}

export interface ENSAgentOS {
  platform?: string;
  name?: string;
  version?: string;
  uname?: string;
}

export interface ENSScopeResult {
  agentId: string;
  agentName?: string;
  inScope: boolean;
  scopeGroup: string;
  matchedGroups: string[];
  reason: string;
}
