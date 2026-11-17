export const ENS_MATURITY_MAX = 5;
export const ENS_MATURITY_MAX_ACCREDITED = 2;

export const ENS_MATURITY_LABELS: Record<number, string> = {
  0: 'Inexistente',
  1: 'Inicial',
  2: 'Reproducible pero intuitivo',
  3: 'Proceso definido',
  4: 'Gestionado y medible',
  5: 'Optimizado',
};

export const ENS_MATURITY_NOTE =
  'Acreditado: lo que Wazuh demuestra, hasta L2. Valorado: el nivel que declara la organización con sus documentos, de L0 a L5.';

export const incoherenceText = (assessed?: number, accredited?: number): string =>
  `Valorado en L${assessed ?? '?'}, pero Wazuh solo acredita L${accredited ?? 0}: no ve la práctica funcionando 27 de los últimos 30 días. Revisa la valoración o la configuración del control.`;

export const maturityLabel = (level?: number): string =>
  level === undefined || level === null ? '—' : `L${level} ${ENS_MATURITY_LABELS[level] || ''}`.trim();

export interface ENSMaturityAssessment {
  measureId: string;
  level?: number;
  target?: number;
  assessedBy?: string;
  assessedAt?: string;
  references?: string;
  note?: string;
}

export interface ENSMaturityConfiguration {
  assessments: ENSMaturityAssessment[];
}

export interface ENSEngineMaturity {
  accredited?: number;
  working_days?: number;
  period_days?: number;
  assessed?: number;
  target?: number;
  assessed_by?: string;
  assessed_at?: string;
  references?: string;
  note?: string;
  incoherent?: boolean;
  machines?: number;
  applicable?: number;
  unmeasured?: number;
  unassessed?: number;
  below_target?: string[];
  accredited_counts?: number[];
  assessed_counts?: number[];
  global_accredited?: number;
  global_assessed?: number;
}

export interface ENSOrganizationMaturity {
  at?: string;
  summary?: ENSEngineMaturity;
  measures: Record<string, ENSEngineMaturity>;
}
