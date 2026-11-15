import { POWER_ENS_EXCLUSIONS_PATH } from '../../../common/constants';
import { exclusionGroupOf } from '../../../common/ens/core/scope/evaluable-groups';
import type { ENSExclusionChange, ENSExclusionRecord, ENSExclusionStatus } from '../../../common/ens/exclusions';

interface ExclusionHttp {
  get<T>(path: string, options?: { query?: Record<string, string> }): Promise<T>;
  post<T>(path: string, options?: { body?: string }): Promise<T>;
}

interface WazuhApiResponse {
  error?: number;
  message?: string;
  data?: { affected_items?: any[]; failed_items?: { error?: { message?: string } }[] };
}

// wz-api is httpOnly; the Wazuh app keeps the selected API, URI-encoded twice, in currentApi.
const WAZUH_CURRENT_API_COOKIE = 'currentApi';

const messageOf = (error: any): string => error?.body?.message || error?.message || String(error);

export const readCookie = (cookies: string, name: string): string | undefined =>
  cookies
    .split(';')
    .map(part => part.trim().split('='))
    .find(([key]) => key === name)
    ?.slice(1)
    .join('=');

const parseCurrentApiId = (cookie: string | undefined): string | undefined => {
  if (!cookie) return undefined;
  try {
    const id = JSON.parse(decodeURIComponent(decodeURIComponent(cookie)))?.id;
    return typeof id === 'string' && id ? id : undefined;
  } catch {
    return undefined;
  }
};

export const createExclusionService = (http: ExclusionHttp, cookies: () => string) => {
  const wazuhApiId = (): string => {
    const id = parseCurrentApiId(readCookie(cookies(), WAZUH_CURRENT_API_COOKIE));
    if (!id) throw new Error('No hay ninguna API de Wazuh seleccionada. Abre una página de Wazuh y vuelve a intentarlo.');
    return id;
  };

  const callWazuh = async (method: string, path: string): Promise<WazuhApiResponse> => {
    const body = JSON.stringify({ id: wazuhApiId(), method, path, body: {} });
    let result: WazuhApiResponse;
    try {
      result = await http.post<WazuhApiResponse>('/api/request', { body });
    } catch (error) {
      throw new Error(`La API de Wazuh respondió con un error: ${messageOf(error)}`);
    }

    const failed = result?.data?.failed_items?.[0]?.error?.message;
    if (result?.error || failed) throw new Error(`La API de Wazuh respondió con un error: ${failed || result?.message || 'sin detalle'}`);
    return result;
  };

  const groupPath = ({ agentId, controlId }: { agentId: string; controlId: string }) =>
    `/agents/${agentId}/group/${encodeURIComponent(exclusionGroupOf(controlId))}`;

  const moveToGroup = (change: ENSExclusionChange) => callWazuh(change.action === 'EXCLUDED' ? 'PUT' : 'DELETE', groupPath(change));

  const moveBack = (change: ENSExclusionChange) => callWazuh(change.action === 'EXCLUDED' ? 'DELETE' : 'PUT', groupPath(change));

  const isExcluded = async (agentId: string, controlId: string): Promise<boolean> => {
    const result = await callWazuh('GET', `/agents?agents_list=${agentId}&select=group`);
    const groups: string[] = result?.data?.affected_items?.[0]?.group || [];
    return groups.includes(exclusionGroupOf(controlId));
  };

  const readStatus = async (agentId: string, controlId: string): Promise<ENSExclusionStatus> =>
    (await http.get<{ data: ENSExclusionStatus }>(POWER_ENS_EXCLUSIONS_PATH, { query: { agentId, controlId } })).data;

  const record = async (change: ENSExclusionChange): Promise<ENSExclusionRecord> =>
    (await http.post<{ data: ENSExclusionRecord }>(POWER_ENS_EXCLUSIONS_PATH, { body: JSON.stringify(change) })).data;

  const change = async (requested: ENSExclusionChange): Promise<ENSExclusionRecord> => {
    await moveToGroup(requested);

    try {
      return await record(requested);
    } catch (recordError) {
      const reason = messageOf(recordError);
      try {
        await moveBack(requested);
      } catch (revertError) {
        throw new Error(`No se pudo guardar el motivo (${reason}) ni deshacer el cambio de grupo (${messageOf(revertError)}). Revisa el grupo en Wazuh.`);
      }
      throw new Error(`No se pudo guardar el motivo (${reason}). El cambio de grupo se ha deshecho.`);
    }
  };

  return { isExcluded, readStatus, change };
};
