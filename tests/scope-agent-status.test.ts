/** Each agent's `status` reaches the scope agents, which the machine selector paints. */
import { getActiveENSScopeAgents, hydrateENSScope, resolveENSScopeAgents } from '../common/ens/core/scope/runtime';
import type { ENSAgentScope } from '../common/ens/core/scope/types';
import type { ENSConfigurationScope } from '../common/ens/configuration/types';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const INVENTORY: ENSAgentScope[] = [
  { id: '024', name: 'real', groups: ['ens'], status: 'active' },
  { id: '028', name: 'ldap', groups: ['ens'], status: 'disconnected' },
  { id: '030', name: 'sin-estado', groups: ['ens'] },
  { id: '000', name: 'Wazuh-4', groups: [], status: 'active' },
];
const global: ENSConfigurationScope = { mode: 'global', agentIds: [], groupIds: [] };

const conManager = resolveENSScopeAgents(INVENTORY, global, [{ status: 'ACTIVE', measurementPlanes: ['manager'] }] as any);
check('the manager keeps its inventory state', conManager.find(a => a.id === '000')?.status === 'active', conManager);
const managerWithoutInventory = resolveENSScopeAgents(INVENTORY.filter(a => a.id !== '000'), global, [{ status: 'ACTIVE', measurementPlanes: ['manager'] }] as any);
check('without 000 in the inventory, the manager invents no state', !('status' in (managerWithoutInventory.find(a => a.id === '000') || {})), managerWithoutInventory);

hydrateENSScope(global, async () => INVENTORY)
  .then(() => {
    const actives = getActiveENSScopeAgents();
    check('hydrated: 024 stays active', actives.find(a => a.id === '024')?.status === 'active', actives);
    check('hydrated: 028 stays disconnected', actives.find(a => a.id === '028')?.status === 'disconnected', actives);
    check('hydrated: no state, no status field', !('status' in (actives.find(a => a.id === '030') || { status: 'x' })), actives);
  })
  .catch(error => check('hydration does not fail', false, String(error)))
  .then(() => {
    console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
    process.exit(failures.length ? 1 : 0);
  });
