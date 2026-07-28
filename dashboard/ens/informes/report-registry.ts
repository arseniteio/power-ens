import { buildMpInfo6ReportModel } from './mp-info-6-report-model';
import { buildOpAcc1ReportModel } from './op-acc-1-report-model';
import { buildOpAcc2ReportModel } from './op-acc-2-report-model';

// Forma común mínima de un campo de informe. Los tres modelos concretos
// (MPInfo6ReportField, OpAcc1ReportField, OpAcc2ReportField) son estructuralmente
// compatibles con esta interfaz, por lo que la vista de Informes los consume sin
// conocer el control.
export interface ENSReportField {
  id: string;
  title: string;
  status: string;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

// Forma común mínima del modelo de informe que consume index.tsx (usa .fields).
export interface ENSReportModel {
  controlId: string;
  status: string;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: ENSReportField[];
}

type ReportModelBuilder = (result: any) => ENSReportModel;

// Modelo genérico para un control sin builder dedicado: nunca renderiza los
// campos REP-xx de mp.info.6. Hoy no se alcanza (los 3 controles están en el
// registry), pero evita el fallback implícito a mp.info.6.
const buildGenericReportModel = (result: any): ENSReportModel => ({
  controlId: result?.control?.id || 'DESCONOCIDO',
  status: result?.status || 'SIN_DATOS',
  score: typeof result?.score === 'number' ? result.score : null,
  coverage: typeof result?.coverage === 'number' ? result.coverage : null,
  level: result?.level || 'SIN_DATOS',
  evaluatedAt: result?.evaluatedAt,
  fields: [],
});

export const ENSReportModelRegistry: Record<string, ReportModelBuilder> = {
  'mp.info.6': buildMpInfo6ReportModel,
  'op.acc.1': buildOpAcc1ReportModel,
  'op.acc.2': buildOpAcc2ReportModel,
};

export const buildReportModelFor = (
  controlId: string,
  result: any
): ENSReportModel =>
  (ENSReportModelRegistry[controlId] || buildGenericReportModel)(result);
