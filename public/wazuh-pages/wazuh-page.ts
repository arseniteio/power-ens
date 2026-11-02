export type WazuhPage = { kind: 'home' } | { kind: 'agent'; agentId: string };

const WAZUH_HOME_APP = 'wz-home';
const WAZUH_ENDPOINTS_APP = 'endpoints-summary';

export const wazuhPageOf = (appId: string | undefined, hash: string): WazuhPage | undefined => {
  if (appId === WAZUH_HOME_APP) {
    return { kind: 'home' };
  }
  if (appId !== WAZUH_ENDPOINTS_APP) {
    return undefined;
  }

  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const agentId = new URLSearchParams(query).get('agent');
  return path === '/agents' && agentId ? { kind: 'agent', agentId } : undefined;
};

export const powerEnsPathOf = (page: WazuhPage): string =>
  page.kind === 'agent' ? `?agentId=${encodeURIComponent(page.agentId)}` : '';
