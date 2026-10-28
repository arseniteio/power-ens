type ENSLevel = 'BAJO' | 'MEDIO' | 'ALTO';

type ENSStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA';

export interface ENSScope {
  activeLevels: ENSLevel[];
  declaredLevels: ENSLevel[];
  highLevelStatus: ENSStatus;
}

interface ENSExpectedLevelResult {
  status?: ENSStatus;
  score?: number;
  statusWithoutRestore?: ENSStatus;
  scoreWithoutRestore?: number;
  statusWithRestore?: ENSStatus;
  condition: string;
}

export interface ENSExpectedResult {
  bajo: ENSExpectedLevelResult;
  medio: ENSExpectedLevelResult;
  alto: ENSExpectedLevelResult;
}

export interface ENSParameter {
  id: string;
  name: string;
  description: string;
  level: ENSLevel[];
  requirements: string[];
  type: string;
  usage: string;
  missingBehavior: string;
}

export interface ENSEvidence {
  id: string;
  title: string;
  description: string;
  level: ENSLevel[];
  expectedStatus: ENSStatus;
  format: string;
  events: string[];
  wazuhRuleIds: string[];
  requirement: string[];
  active?: boolean;
}

export interface ENSRequirement {
  id: string;
  title: string;
  description: string;
  level: ENSLevel[];
  evidences: string[];
  active?: boolean;
}

export interface ENSPresentationRules {
  auditorSees: string[];
  internalTraceability: string[];
  neverShowAsControls: string[];
}

export interface ENSControl {
  id: string;
  title: string;
  framework: string;
  category: string;
  family: string;
  dimension: string;
  scope: ENSScope;
  expectedResult?: ENSExpectedResult;
  requirements: ENSRequirement[];
  evidences: ENSEvidence[];
  parameters: ENSParameter[];
  events?: string[];
  presentationRules?: ENSPresentationRules;
}
