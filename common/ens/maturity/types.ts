// Maturity of a control (CMM, Annex II section 6 of RD 311/2022): the normative assessment, reported NEXT to the
// traffic light and the percentage (operational indicators), never mixed with them.
// - Accredited level: computed from the evidence, the highest level whose gates (and those below) all pass.
// - Assessed level: declared by a person, who confirms or adjusts the accredited one. It is the level the report
//   carries; above the accredited one it needs a justification and the report marks it.
// Everything a person records is kept append-only in `configuration.maturity` (organisation level, not per agent).
import type { ENSLevel } from '../configuration/types';

export type ENSMaturityLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const ENS_MATURITY_LEVELS: ENSMaturityLevel[] = [0, 1, 2, 3, 4, 5];

// Where a gate's datum comes from: A automatic (facts and engine results), D declared on screen, Doc documentary
// (reference, link, date and owner, with validity).
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

export type ENSMaturityReviewResult = 'CONFORME' | 'CON_DESVIACIONES' | 'NO_CONFORME';

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
  // Accredited level when it was recorded, computed by the server (absent if it could not be computed).
  accredited?: ENSMaturityLevel;
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

export type ENSMaturityRecordKind = 'attestation' | 'review' | 'assessment' | 'indicators' | 'feedback';

// What is stored per control. Every list is append-only: the last entry is the current one.
export interface ENSControlMaturityRecord {
  attestations: ENSProcedureAttestation[];
  reviews: ENSMaturityReview[];
  assessments: ENSMaturityAssessment[];
  indicators: ENSMaturityIndicators[];
  feedback: ENSMaturityFeedback[];
}

// `configuration.maturity`. Absent: nothing recorded yet.
export interface ENSMaturityConfiguration {
  controls: Record<string, Partial<ENSControlMaturityRecord>>;
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
  // Assessed above what the evidence accredits today: the report marks it with the justification.
  aboveAccredited: boolean;
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

// Controls per level; `none` counts those without that level (not measured, or not assessed).
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
