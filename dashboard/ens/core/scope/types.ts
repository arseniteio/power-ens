export interface ENSAgentScope {
  id: string;
  name?: string;
  groups: string[];
}

export interface ENSScopeResult {
  agentId: string;
  agentName?: string;
  inScope: boolean;
  scopeGroup: string;
  matchedGroups: string[];
  reason: string;
}
