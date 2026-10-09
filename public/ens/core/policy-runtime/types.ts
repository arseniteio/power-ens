import { ENSLevel } from '../../configuration/types';
import { ENSControlDefinition } from '../../catalog';
import { ENSControlConfiguration } from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { ENSEvidenceResolved } from '../evidence/types';
import { ENSComplianceStatus, ENSGapCause } from '../evaluation/types';

export type ENSPolicyRuleType =
  | 'MAX_AGE'
  | 'MIN_RETENTION'
  | 'COVERAGE_REQUIRED'
  | 'WHITELIST'
  | 'CONDITIONAL_REQUIRED'
  | 'PATH_MATCH'
  | 'TOOL_MATCH';

export type ENSRuntimeVariableValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | undefined;

export interface ENSPolicyContext {
  control: ENSControlDefinition;
  configuration?: ENSControlConfiguration;
  level: ENSLevel;
  events: ENSNormalizedEvent[];
  evidences: ENSEvidenceResolved[];
  // El instante contra el que se mide la antigüedad de una evidencia. Por
  // defecto es ahora, que es el caso del panel. Existe como parámetro porque
  // la serie diaria evalúa el mismo motor A UNA FECHA PASADA: con un
  // `Date.now()` suelto, la copia de hace tres días saldría vencida en el
  // punto de hace tres días, y la línea contaría una historia falsa.
  now?: Date;
}

export interface ENSPolicyEvaluatorResult {
  decisions: ENSPolicyDecision[];
  runtimeVariables: ENSRuntimeVariable[];
}

export type ENSPolicyEvaluator = (
  context: ENSPolicyContext
) => ENSPolicyEvaluatorResult;

export interface ENSAppliedParameter {
  id: string;
  name: string;
  value?: ENSRuntimeVariableValue;
  required: boolean;
}

export interface ENSRuntimeVariable {
  name: string;
  value: ENSRuntimeVariableValue;
  parameterIds: string[];
  evidenceIds: string[];
  eventIds: string[];
  description: string;
}

export interface ENSPolicyTrace {
  ruleId: string;
  ruleType: ENSPolicyRuleType;
  expression: string;
  expected: string;
  actual: string;
  result: boolean;
}

export interface ENSPolicyDecision {
  policyId: string;
  requirementId: string;
  status: ENSComplianceStatus;
  parameterIds: string[];
  evidenceIds: string[];
  eventIds: string[];
  runtimeVariables: string[];
  trace: ENSPolicyTrace;
  reason: string;
  // Solo con `status` NO_EVALUABLE: POR QUÉ la policy no ha podido medir. Es la
  // misma causa que `ENSEvidenceResolved.gapCause`, y el puente la lleva a las
  // evidencias que la decisión rellena. Sin ella, una evidencia que la policy
  // mide con hechos que no son los suyos del modelo clásico se quedaba con la
  // causa de ese modelo («no ha llegado nada», COLLECTION) aunque lo que
  // faltara fuera un parámetro, o la causa que declaró el recolector.
  cause?: ENSGapCause;
  // Acreditado DOCUMENTALMENTE: la policy ha juzgado una DECLARACIÓN de la
  // pantalla con su vigencia (un contrato no vencido, un plan aprobado dentro
  // de su periodicidad, una certificación en vigor), no una medida de la
  // máquina. Es la versión de `P-ATT` que sí vigila la vigencia.
  //
  // Solo cuenta con `status` CUMPLE: el requisito cumple marcado como
  // acreditado documentalmente (`attested` en el resultado), para que la
  // pantalla y el informe nunca lo presenten como medido. Con cualquier otro
  // estado se ignora: un plan caducado es un NO_CUMPLE corriente.
  //
  // Y UNA MEDIDA EN CONTRA MANDA SIEMPRE. Si alguna evidencia del requisito
  // (las del catálogo y las que nombra la decisión) está en NO_CUMPLE o
  // PARCIAL, u otra decisión de la policy para el mismo requisito lo está, el
  // requisito sale NO_CUMPLE y sin la marca. Ver `requirement-evaluator.ts`.
  attested?: boolean;
}

export interface ENSPolicyRuntimeResult {
  controlId: string;
  policyId: string;
  evaluatedAt: string;
  decisions: ENSPolicyDecision[];
  appliedParameters: ENSAppliedParameter[];
  runtimeVariables: ENSRuntimeVariable[];
}

export interface ENSPolicyRequirementDefinition {
  requirementId: string;
  levels: ENSLevel[];
  parameterIds: string[];
  evidenceIds: string[];
  ruleType: ENSPolicyRuleType;
}

export interface ENSPolicyDefinition {
  id: string;
  controlId: string;
  version: string;
  requirements: ENSPolicyRequirementDefinition[];
  evaluator?: ENSPolicyEvaluator;
}
