// CMM maturity per control (Annex II s.6): accredited by the evidence, assessed by a person, next to the traffic light.
import type { ENSLevel } from '../configuration/types';

export type ENSMaturityLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const ENS_MATURITY_LEVELS: ENSMaturityLevel[] = [0, 1, 2, 3, 4, 5];

// Origin of a gate's datum: A automatic, D declared on screen, Doc documentary (reference, link, date, owner, validity).
export type ENSMaturityGateOrigin = 'A' | 'D' | 'Doc' | 'D+A' | 'Doc+D';

export type ENSMaturityGateId =
  | 'L1.facts'
  | 'L2.recurrence'
  | 'L3.parameters'
  | 'L3.procedure'
  | 'L3.continuity'
  | 'L4.threshold'
  | 'L4.reviews'
  | 'L5.trend'
  | 'L5.feedback';

export interface ENSMaturityGate {
  id: ENSMaturityGateId;
  level: Exclude<ENSMaturityLevel, 0>;
  origin: ENSMaturityGateOrigin;
  label: string;
  passed: boolean;
  // Why it passes or fails, in Spanish for the screen and the report.
  reason: string;
}

// Who and when wrote an entry: set by the server, never by the browser.
export interface ENSMaturityStamp {
  recordedAt: string;
  recordedBy: string;
}

// The documented procedure of the control as a process (Doc gate of L3).
export interface ENSProcedureAttestation extends ENSMaturityStamp {
  reference: string;
  version: string;
  link: string;
  // YYYY-MM-DD.
  approvedAt: string;
  validUntil: string;
  disseminatedAt: string;
  disseminatedTo: string;
  owner: string;
}

export type ENSMaturityReviewResult = 'CONFORME' | 'CON_DESVIACIONES' | 'NO_CONFORME' | 'DESVIACION_EN_TRATAMIENTO';

export interface ENSMaturityReview extends ENSMaturityStamp {
  date: string;
  reviewer: string;
  result: ENSMaturityReviewResult;
  actions: string;
}

export interface ENSMaturityAssessment extends ENSMaturityStamp {
  level: ENSMaturityLevel;
  // Optional: without it the target is the default of the control's category.
  target?: ENSMaturityLevel;
  reviewer: string;
  date: string;
  justification?: string;
  // Accredited level and gates when it was recorded, computed by the server (absent if it could not be computed).
  accredited?: ENSMaturityLevel;
  accreditedGates?: Pick<ENSMaturityGate, 'id' | 'level' | 'passed' | 'reason'>[];
}

// Indicators of the control (L4): the score threshold watched and how often it is reviewed.
export interface ENSMaturityIndicators extends ENSMaturityStamp {
  minScore: number;
  reviewPeriodDays: number;
}

export type ENSMaturityFeedbackSource = 'op.exp.9.3' | 'op.exp.7' | 'op.cont.3' | 'auditoria' | 'revision';

// A lesson learnt or a deficiency linked to the control (L5). The same reference written again is its new state.
export interface ENSMaturityFeedback extends ENSMaturityStamp {
  reference: string;
  source: ENSMaturityFeedbackSource;
  description: string;
  openedAt: string;
  closedAt?: string;
  // Version of the procedure that closed it.
  procedureVersion?: string;
}

// Declared entry of an Annex II measure without engine (not in the catalog, or in DRAFT) for the art. 32 report.
export interface ENSMeasureDeclaration extends ENSMaturityStamp {
  applies: boolean;
  // Assessed maturity: required when the measure applies.
  level?: ENSMaturityLevel;
  target?: ENSMaturityLevel;
  // Documentary reference (document code and title) and, optionally, where it is.
  reference: string;
  link?: string;
  owner: string;
  // YYYY-MM-DD of the assessment.
  date: string;
  // Required when the measure does not apply.
  justification?: string;
}

// Total ICT resources of a report period (op.mon.2 only): the base of the resource percentages.
export interface ENSAnnualResourcesDeclaration extends ENSMaturityStamp {
  // Report period, the year of its closing date (YYYY).
  period: string;
  // Euros.
  ictBudget?: number;
  // Full-time equivalents.
  ictStaff?: number;
  securityStaff?: number;
  reference: string;
  owner: string;
}

export type ENSMaturityRecordKind = 'attestation' | 'review' | 'assessment' | 'indicators' | 'feedback' | 'declaration' | 'resources';

// What is stored per control (or Annex II measure). Every list is append-only: the last entry is the current one.
export interface ENSControlMaturityRecord {
  attestations: ENSProcedureAttestation[];
  reviews: ENSMaturityReview[];
  assessments: ENSMaturityAssessment[];
  indicators: ENSMaturityIndicators[];
  feedback: ENSMaturityFeedback[];
  declarations: ENSMeasureDeclaration[];
  resources: ENSAnnualResourcesDeclaration[];
}

// The maturity document (`wazuh-ens-configuration/_doc/maturity`). Absent: nothing recorded yet. `controls` is keyed
// by control id and, for declared entries, by Annex II measure id.
export interface ENSMaturityRecords {
  controls: Record<string, Partial<ENSControlMaturityRecord>>;
}

// Index version of the maturity document, sent back with each record (null: there is none yet).
export interface ENSMaturityVersion {
  seqNo: number;
  primaryTerm: number;
}

// Default target per category, editable in General (`global.maturityTargets`).
export type ENSMaturityTargets = Record<ENSLevel, ENSMaturityLevel>;

// The maturity of one control as the screens and the report show it.
export interface ENSControlMaturity {
  controlId: string;
  // false for a control in DRAFT: «Sin medición todavía» (a person may still declare the assessed level).
  measured: boolean;
  // false when nothing of the control applies at its level (NO_APLICA): it is left out of the distribution.
  applicable: boolean;
  accredited?: ENSMaturityLevel;
  assessed?: ENSMaturityAssessment;
  target: ENSMaturityLevel;
  targetSource: 'CATEGORY' | 'ASSESSMENT';
  // Level the control is applied with (category or its dimensions): it picks the default target.
  applicableLevel: ENSLevel;
  // Assessed above the level the evidence accredited when it was recorded: marked with the justification.
  aboveAccredited: boolean;
  // The evidence accredits less today than when it was assessed, and less than the assessed level: review it.
  accreditedDropped: boolean;
  gates: ENSMaturityGate[];
  attestation?: ENSProcedureAttestation;
  attestations: number;
  lastReview?: ENSMaturityReview;
  reviews: number;
  indicators?: ENSMaturityIndicators;
  feedback: ENSMaturityFeedback[];
  assessments: number;
  evaluatedAt: string;
}

// What the list, the overview and the panel need of each control.
export type ENSControlMaturitySummary = Pick<
  ENSControlMaturity,
  'controlId' | 'measured' | 'applicable' | 'accredited' | 'target' | 'aboveAccredited'
> & { assessed?: ENSMaturityLevel };

// Controls per level, plus `notMeasured` (accredited) and `notAssessed` (assessed).
export interface ENSMaturityDistribution {
  accredited: Record<string, number>;
  assessed: Record<string, number>;
  // Applicable controls whose level (the assessed one, else the accredited one) is below their target.
  belowTarget: number;
  applicable: number;
}

// A daily snapshot of a control (index `wazuh-ens-snapshots`): trends for L5 and the annual report.
export interface ENSControlSnapshot {
  date: string;
  controlId: string;
  status: string;
  score?: number;
  coverage?: number;
  applicableRequirements?: number;
  measuredRequirements?: number;
  level?: string;
  accredited?: ENSMaturityLevel;
  assessed?: ENSMaturityLevel;
  target?: ENSMaturityLevel;
  recordedAt: string;
  recordedBy?: string;
}
