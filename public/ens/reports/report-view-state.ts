// Qué enseña la sección de informe de un control, sin React (lo prueba
// `tests/report-view-state.test.ts`). Nunca un relleno que parezca medido:
//
//   - error          la evaluación falló: el motivo y «Reintentar»;
//   - loading        aún no ha llegado la evaluación de ESTA selección;
//   - not-measured   llegó, y el servidor no da resultado para esta máquina:
//                    «este control no se mide en esta máquina» y por qué
//                    (`describeNotMeasuredOnAgent`, la misma regla que la ficha
//                    y la lista de controles);
//   - panorama-loading  el informe recopila todos los controles (op.mon.2) y su
//                    panorama aún no ha llegado: ni SIN_DATOS ni N/A de relleno;
//   - ready          se pinta el informe (y se puede exportar).
//
// Un panorama que FALLÓ no bloquea el informe: sale SIN_DATOS con su aviso.
import type { ENSNotMeasuredReason } from '../../../common/ens/core/scope/measurement-planes';

export type ENSReportViewState =
  | { kind: 'error'; error: unknown }
  | { kind: 'loading' }
  | { kind: 'not-measured'; title: string; text: string; reason?: ENSNotMeasuredReason }
  | { kind: 'panorama-loading' }
  | { kind: 'ready' };

export interface ENSReportViewInput {
  controlId: string;
  agentId?: string;
  agentLabel?: string;
  error?: unknown;
  hasData: boolean;
  hasResult: boolean;
  usesPanorama: boolean;
  panoramaLoading: boolean;
  // Solo se llama con una máquina elegida y sin resultado.
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
