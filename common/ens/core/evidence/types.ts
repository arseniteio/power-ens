import { ENSComplianceStatus, ENSGapCause } from '../evaluation/types';
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

// Judgment primitives of the engine: deliberately few and identical for every control (no code per control, only a catalog declaration).
// They are named by what they mean to an AUDITOR; seven exist because each answers a different audit question.
//
// Against a reference LIST:
//   NINGUNO_EN_LISTA        No observed fact is in the FORBIDDEN list. Negative assertion: zero facts with confirmed coverage is CUMPLE.
//   TODOS_EN_LISTA          Every observed fact is in the AUTHORISED list. Facts ACCREDIT something: zero facts means nothing was measured.
//   NINGUNO_FUERA_DE_LISTA  No sweep FINDING is outside the authorised list. Same comparison as TODOS_EN_LISTA, opposite absence rule:
//                           zero facts with confirmed coverage means "swept and found nothing", which is CUMPLE.
// Against a numeric THRESHOLD:
//   UMBRAL_MAXIMO           No observed value exceeds the parameter.
//   UMBRAL_MINIMO           No observed value is below the parameter.
// Against a DEADLINE:
//   ANTIGUEDAD_MAXIMA      The latest fact is not older than the deadline. The only EXISTENTIAL primitive (ONE recent fact suffices), so it never passes by absence.
// Against a policy TABLE:
//   CONFORME_A_TABLA        Each observed fact matches ITS row in the table, column by column (op.acc.2.2).
export type ENSEvidenceJudgmentPrimitive =
  | 'NINGUNO_EN_LISTA'
  | 'TODOS_EN_LISTA'
  | 'NINGUNO_FUERA_DE_LISTA'
  | 'UMBRAL_MAXIMO'
  | 'UMBRAL_MINIMO'
  | 'ANTIGUEDAD_MAXIMA'
  | 'CONFORME_A_TABLA';

// A policy-table column checked against a fact field. Declared separately on purpose: the column is what the owner DECIDED ('acl_esperada'), the field what the agent OBSERVED ('acl').
export interface ENSEvidenceTableCheck {
  column: string;
  factField: string;
}

// Declares that the engine, not the agent, decides this evidence. The agent emits the RAW FACT and the engine compares it with the screen parameter;
// `evidence_state` no longer rules and `estado` is not read on this path.
// Invariant: without an observed fact or a parameter, NO_EVALUABLE with a motive; never CUMPLE or NO_CUMPLE by absence.
export interface ENSEvidenceJudgment {
  primitive: ENSEvidenceJudgmentPrimitive;

  // `id` of the ENSControlParameter (e.g. 'P-04'), not its `name`: the `id` is stable between the `config/` seed block and the index.
  parameterId: string;

  // Event types carrying the raw fact. A list because one fact may arrive under several types and old and new types coexist during a migration.
  factEventTypes: string[];

  // Event field whose value is checked: looked up in `attributes` first, then at the root of the normalized event. A list value counts as independent facts.
  // Unused in `CONFORME_A_TABLA` (`factKeyField` and `tableChecks` declare the fields there).
  factField: string;

  // Parameter column acting as reference list when the parameter is NOT flat.
  // MANDATORY as soon as the parameter declares two or more columns; without it the judgment stays NO_EVALUABLE with a motive.
  // Comparing the WHOLE ROW with an account name never matches, and guessing the column would fail silently on the next table whose key is not column 1.
  parameterColumn?: string;

  // Only `CONFORME_A_TABLA`.

  // Column that identifies the table row.
  tableKeyColumn?: string;

  // Fact field carrying that key. Defaults to the same name as `tableKeyColumn`.
  factKeyField?: string;

  // When one column does NOT identify the row (a subject has privileges over several resources). If declared, they take precedence over `tableKeyColumn` / `factKeyField`.
  tableKeyColumns?: string[];
  factKeyFields?: string[];

  // Compared columns and the fact field of each. A column not listed is NOT compared even if the row fills it: what is judged is declared, not deduced.
  tableChecks?: ENSEvidenceTableCheck[];

  // Numeric and deadline primitives.

  // Second parameter ADDED to the threshold or deadline (the mp.info.6 tolerance, P-02 over P-01).
  // Missing or empty: applied WITHOUT margin (the strict extreme). Present but unreadable: NO_EVALUABLE.
  toleranceParameterId?: string;

  // Heartbeat event types. They tell "looked and found nothing" apart from not having been able to look (see `resolveCollectorCoverage` in judgment.ts). Default `collector_run`.
  collectorRunEventTypes?: string[];

  // Maximum age in hours of a heartbeat to count as coverage of the evaluated window. Default 24 (collectors beat hourly).
  // The window's UPPER bound is not configured here: it is clock tolerance, not policy.
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

  // Optional. Without `judgment`, the evidence resolves as before: the agent's `evidence_state` rules.
  judgment?: ENSEvidenceJudgment;

  // Fact types describing a machine STATE that the collector reissues WHOLE on every pass. Judged by the last pass, not the window (see `state-facts.ts`).
  // Declare only what is VERIFIED to be reissued on every pass: a type emitted only on change or an action must not be here, or its only proof disappears.
  stateFactEventTypes?: string[];

  // Field distinguishing the collectors of one control on one machine (`origen` in mp.info.6: PBS and Zimbra). If declared, the last pass is delimited by the heartbeats
  // of ITS collector (same value in that field), so one collector does not discard the other's facts.
  stateFactCollectorField?: string;

  // This evidence's collector only declares gaps (`evidence_state` NO_EVALUABLE with cause), never verdicts. An event declaring CUMPLE, NO_CUMPLE or PARCIAL is incompatible and resolves nothing.
  agentDeclaresOnlyGaps?: boolean;
}

export interface ENSEvidenceResolved {
  id: string;
  controlId: string;
  title: string;
  description: string;
  status: ENSComplianceStatus;
  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
  qualityRequirements?: ENSEvidenceQualityRequirements;
  lastSeen?: string;
  agentId?: string;
  agentName?: string;
  resolvedEventId?: string;
  resolvedEventType?: string;
  resolvedSourceType?: ENSDataSourceType;
  resolvedSource?: string;
  resolvedRuleId?: string;
  resolvedRuleDescription?: string;
  resolvedAttributes?: Record<string, unknown>;
  latestSuccessfulEventId?: string;
  latestSuccessfulAttributes?: Record<string, unknown>;
  observations: string[];

  // WHY there is no measure; travels only with `status` NO_EVALUABLE.
  //   COLLECTION     nothing arrived: agent down, collector not run, no heartbeat.
  //   EVIDENCE       data arrived but is not enough: quality contract, unreadable field, or the agent says it could not measure.
  //   CONFIGURATION  the parameter to judge against is missing or empty.
  // Never CATALOG: that cause belongs to the requirement, not the evidence.
  gapCause?: ENSGapCause;
}

// The part of the resolved evidence copied from the catalog before anything is known about the verdict or the event. Built by `engine.ts`, also consumed by `judgment.ts`.
export type ENSEvidenceBaseFields = Omit<
  ENSEvidenceResolved,
  | 'status'
  | 'observations'
  | 'gapCause'
  | 'lastSeen'
  | 'agentId'
  | 'agentName'
  | 'resolvedEventId'
  | 'resolvedEventType'
  | 'resolvedSourceType'
  | 'resolvedSource'
  | 'resolvedRuleId'
  | 'resolvedRuleDescription'
>;
