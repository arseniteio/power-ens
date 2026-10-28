// What a control's report section shows, without React (tests/report-view-state.test.ts). Never a filler that looks measured.
import type { ENSNotMeasuredReason } from '../../../common/ens/core/scope/measurement-planes';

type ENSReportViewState =
  | { kind: 'error'; error: unknown }
  | { kind: 'loading' }
  | { kind: 'not-measured'; title: string; text: string; reason?: ENSNotMeasuredReason }
  | { kind: 'panorama-loading' }
  | { kind: 'ready' };

interface ENSReportViewInput {
  controlId: string;
  agentId?: string;
  agentLabel?: string;
  error?: unknown;
  hasData: boolean;
  hasResult: boolean;
  usesPanorama: boolean;
  panoramaLoading: boolean;
  notMeasured: () => ENSNotMeasuredReason | undefined;
}

export const reportViewState = (input: ENSReportViewInput): ENSReportViewState => {
  if (input.error) return { kind: 'error', error: input.error };
  if (!input.hasData) return { kind: 'loading' };
  if (!input.hasResult) {
    if (!input.agentId) {
      return {
        kind: 'not-measured',
        title: `${input.controlId} no tiene resultado en ninguna máquina`,
        text: 'Ninguna máquina del alcance ENS mide este control (por su plano o por el alcance que declara su configuración).',
      };
    }
    const reason = input.notMeasured();
    return {
      kind: 'not-measured',
      title: `Este control no se mide en esta máquina (${input.agentLabel || input.agentId})`,
      text: reason?.text || `El servidor no da resultado de ${input.controlId} para ${input.agentLabel || input.agentId}.`,
      reason,
    };
  }
  if (input.usesPanorama && input.panoramaLoading) return { kind: 'panorama-loading' };
  return { kind: 'ready' };
};

export const canExportReport = (state: ENSReportViewState): boolean => state.kind === 'ready';
