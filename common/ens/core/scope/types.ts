export interface ENSAgentScope {
  id: string;
  name?: string;
  groups: string[];
  isManager?: boolean;
  status?: string;
  os?: ENSAgentOS;
}

export interface ENSAgentOS {
  platform?: string;
  name?: string;
  version?: string;
  uname?: string;
}
