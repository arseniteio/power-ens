// Las peticiones a la evaluación del servidor (`/api/ensfacil/evaluation`).
// El navegador ya no lee hechos para juzgar: recibe el resultado.
import { ENSFACIL_EVALUATION_PATH } from '../../common/constants';
import { withRequestTimeout } from '../../common/platform/request-timeout';
import { getHttp } from '../services';
import { RequestLimiter } from './refresh-policy';
import type { ENSTraceabilityPageResponse } from '../../common/ens/evaluation/types';

// Una evaluación en frío lee la ventana entera (en el laboratorio, ~20-30 s
// para todo el alcance); el minuto de las búsquedas no basta. Si se agota, la
// pantalla lo dice y ofrece «Reintentar».
export const EVALUATION_TIMEOUT_MS = 180 * 1000;

export interface ENSEvaluationParams {
  include: 'summary' | 'results' | 'dashboard' | 'control';
  agentId?: string;
  controlId?: string;
  timelineDays?: number;
}

const limiter = new RequestLimiter();

export const browserTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

const consulta = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries({ ...params, timeZone: browserTimeZone() }).filter(([, value]) => value !== undefined && value !== '')
  );

// El servidor explica en `body.message` por qué falla.
const conMotivo = (error: any): Error => {
  const motivo = error?.body?.message;
  return typeof motivo === 'string' && motivo.trim() ? new Error(motivo.trim()) : error;
};

const pide = async <T>(path: string, query: Record<string, unknown>, operacion: string, controller?: AbortController): Promise<T> => {
  const respuesta: any = await limiter
    .run(() =>
      withRequestTimeout(
        signal => getHttp().get(path, { query: consulta(query), signal }),
        operacion,
        controller,
        EVALUATION_TIMEOUT_MS
      )
    )
    .catch(error => {
      throw conMotivo(error);
    });
  if (!respuesta || respuesta.statusCode !== 200 || respuesta.error !== 0) {
    throw new Error(`La evaluación ENS respondió algo inesperado (${operacion}).`);
  }
  return respuesta.data as T;
};

export const fetchEvaluation = <T = any>(params: ENSEvaluationParams, controller?: AbortController) =>
  pide<T>(ENSFACIL_EVALUATION_PATH, { ...params }, 'evaluación ENS', controller);

export const fetchEvaluationProbe = (params: ENSEvaluationParams, controller?: AbortController) =>
  pide<{ fingerprint: string; checkedAt: string; facts: { count: number; newest?: string } }>(
    `${ENSFACIL_EVALUATION_PATH}/probe`,
    { agentId: params.agentId, controlId: params.controlId },
    'comprobación de hechos nuevos',
    controller
  );

export const fetchTraceabilityPage = (
  params: { controlId: string; agentId?: string; from: number; size: number },
  controller?: AbortController
) =>
  pide<ENSTraceabilityPageResponse>(
    `${ENSFACIL_EVALUATION_PATH}/traceability`,
    { ...params },
    'trazabilidad del control',
    controller
  );
