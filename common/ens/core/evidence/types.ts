import { ENSLevel } from '../../configuration/types';
import { ENSDataSourceType } from '../data-source/types';

export type ENSEvidenceCategory =
  | 'CONFIGURATION'
  | 'EXECUTION'
  | 'MONITORING'
  | 'INTEGRITY'
  | 'ACCESS_CONTROL'
  | 'RECOVERY'
  | 'OFFSITE'
  | 'TRACEABILITY';

export type ENSEvidenceCriticality =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';

export interface ENSEvidenceQualityRequirements {
  requiredFields?: string[];
  requiredFieldsWhenStatus?: string[];
  fieldPatterns?: Record<string, string>;
  rejectSynthetic?: boolean;
}

type ENSEvidenceJudgmentPrimitive =
  | 'NINGUNO_EN_LISTA'
  | 'TODOS_EN_LISTA'
  | 'NINGUNO_FUERA_DE_LISTA'
  | 'UMBRAL_MAXIMO'
  | 'UMBRAL_MINIMO'
  | 'ANTIGUEDAD_MAXIMA'
  | 'CONFORME_A_TABLA';

interface ENSEvidenceTableCheck {
  column: string;
  factField: string;
}

export interface ENSEvidenceJudgment {
  primitive: ENSEvidenceJudgmentPrimitive;

  parameterId: string;

  factEventTypes: string[];

  factField: string;

  parameterColumn?: string;


  tableKeyColumn?: string;

  factKeyField?: string;

  tableKeyColumns?: string[];
  factKeyFields?: string[];

  tableChecks?: ENSEvidenceTableCheck[];


  toleranceParameterId?: string;

  collectorRunEventTypes?: string[];

  collectorRunMaxAgeHours?: number;
}

export interface ENSEvidenceDefinition {
  id: string;
  controlId: string;
  title: string;
  description: string;
  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
  qualityRequirements?: ENSEvidenceQualityRequirements;

  judgment?: ENSEvidenceJudgment;

  stateFactEventTypes?: string[];

  stateFactCollectorField?: string;

  agentDeclaresOnlyGaps?: boolean;
}
