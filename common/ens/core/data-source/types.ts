export type ENSDataSourceType =
  | 'WAZUH_ALERT'
  | 'SCA'
  | 'FIM'
  | 'LOCAL_JSON'
  | 'API'
  | 'SCRIPT'
  | 'INVENTORY';

export interface ENSDataSourceDefinition {
  id: string;
  name: string;
  type: ENSDataSourceType;
  description: string;
  enabled: boolean;
}

export interface ENSNormalizedEvent {
  id: string;

  agentId?: string;
  agentName?: string;

  controlId?: string;
  requirementId?: string;
  evidenceId?: string;

  status?: string;

  eventType: string;

  sourceType: ENSDataSourceType;
  source?: string;

  timestamp: string;

  tool?: string;

  attributes?: Record<string, unknown>;
  isSynthetic?: boolean;

  ruleId?: string;
  ruleDescription?: string;

  score?: number;
  compliance?: number;

  raw?: unknown;
}
