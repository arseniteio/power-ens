export type ENSOsKind =
  | 'wazuh'
  | 'windows'
  | 'apple'
  | 'ubuntu'
  | 'debian'
  | 'rhel'
  | 'rocky'
  | 'alma'
  | 'centos'
  | 'fedora'
  | 'oracle'
  | 'amazon'
  | 'suse'
  | 'linux'
  | 'other';

interface ENSIconHost {
  agentId?: string;
  id?: string;
  isManager?: boolean;
  role?: string;
  family?: string;
  distro?: string;
  os?: { platform?: string; name?: string };
}

// First match wins: a distribution is checked before the family it belongs to.
const DISTRIBUTIONS: Array<[ENSOsKind, RegExp]> = [
  ['windows', /windows/],
  ['apple', /darwin|macos|mac os/],
  ['ubuntu', /ubuntu/],
  ['debian', /debian/],
  ['rocky', /rocky/],
  ['alma', /alma/],
  ['centos', /centos/],
  ['fedora', /fedora/],
  ['oracle', /oracle|\bol\b/],
  ['amazon', /amazon|\bamzn\b/],
  ['suse', /suse|sles/],
  ['rhel', /rhel|red ?hat/],
  ['linux', /linux|alpine|arch\b|gentoo|kali|mint|raspbian/],
];

const isWazuhManager = (host: ENSIconHost): boolean => Boolean(host.isManager) || host.role === 'manager' || (host.agentId ?? host.id) === '000';

export const osKindOf = (host: ENSIconHost): ENSOsKind => {
  if (isWazuhManager(host)) return 'wazuh';
  const text = `${host.distro || ''} ${host.os?.platform || ''} ${host.os?.name || ''} ${host.family || ''}`.toLowerCase();
  return DISTRIBUTIONS.find(([, pattern]) => pattern.test(text))?.[0] || 'other';
};
