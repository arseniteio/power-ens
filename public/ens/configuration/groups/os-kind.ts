export type ENSOsKind = 'wazuh' | 'windows' | 'linux' | 'apple' | 'other';

interface ENSIconHost {
  agentId?: string;
  id?: string;
  isManager?: boolean;
  role?: string;
  family?: string;
  distro?: string;
  os?: { platform?: string; name?: string };
}

const isWazuhManager = (host: ENSIconHost): boolean => Boolean(host.isManager) || host.role === 'manager' || (host.agentId ?? host.id) === '000';

export const osKindOf = (host: ENSIconHost): ENSOsKind => {
  if (isWazuhManager(host)) return 'wazuh';
  const text = `${host.family || ''} ${host.distro || ''} ${host.os?.platform || ''} ${host.os?.name || ''}`.toLowerCase();
  if (text.includes('windows')) return 'windows';
  if (text.includes('darwin') || text.includes('macos')) return 'apple';
  if (/linux|ubuntu|debian|rhel|rocky|alma|centos|fedora|suse|amazon|alpine|arch/.test(text)) return 'linux';
  return 'other';
};
