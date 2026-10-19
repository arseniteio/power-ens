export interface ENSAgentScope {
  id: string;
  name?: string;
  groups: string[];
  // The Wazuh manager (000). It enters by the controls' measurement plane, not by group: see `measurement-planes.ts`.
  isManager?: boolean;
  // Agent status per wazuh-monitoring; only the selector uses it.
  status?: string;
  // Operating system per wazuh-monitoring (`os.platform`, `os.name`, `os.version`, `os.uname`). Configuration uses it to detect the system type; the engine does not read it.
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
