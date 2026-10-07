/**
 * El estado de cada agente (`status`, de wazuh-monitoring) llega hasta los
 * agentes del alcance: es lo que pinta el selector de máquinas. Si la
 * hidratación lo pierde, todas las máquinas salen sin estado.
 *
 *   npx --yes tsx tests/scope-agent-status.test.ts
 */
import { getActiveENSScopeAgents, hydrateENSScope, resolveENSScopeAgents } from '../public/ens/core/scope/runtime';
import type { ENSAgentScope } from '../public/ens/core/scope/types';
import type { ENSConfigurationScope } from '../public/ens/configuration/types';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

const INVENTARIO: ENSAgentScope[] = [
  { id: '024', name: 'real', groups: ['ens'], status: 'active' },
  { id: '028', name: 'ldap', groups: ['ens'], status: 'disconnected' },
  { id: '030', name: 'sin-estado', groups: ['ens'] },
  { id: '000', name: 'Wazuh-4', groups: [], status: 'active' },
];
const global: ENSConfigurationScope = { mode: 'global', agentIds: [], groupIds: [] };

// El manager, con un catálogo mínimo que lo mete en el alcance.
const conManager = resolveENSScopeAgents(INVENTARIO, global, [{ status: 'ACTIVE', measurementPlanes: ['manager'] }] as any);
comprueba('el manager conserva su estado del inventario', conManager.find(a => a.id === '000')?.status === 'active', conManager);
const managerSinInventario = resolveENSScopeAgents(INVENTARIO.filter(a => a.id !== '000'), global, [{ status: 'ACTIVE', measurementPlanes: ['manager'] }] as any);
comprueba('sin el 000 en el inventario, el manager no inventa estado', !('status' in (managerSinInventario.find(a => a.id === '000') || {})), managerSinInventario);

hydrateENSScope(global, async () => INVENTARIO)
  .then(() => {
    const activos = getActiveENSScopeAgents();
    comprueba('hidratado: 024 sigue activo', activos.find(a => a.id === '024')?.status === 'active', activos);
    comprueba('hidratado: 028 sigue desconectado', activos.find(a => a.id === '028')?.status === 'disconnected', activos);
    comprueba('hidratado: sin estado, sin campo status', !('status' in (activos.find(a => a.id === '030') || { status: 'x' })), activos);
  })
  .catch(error => comprueba('la hidratación no falla', false, String(error)))
  .then(() => {
    console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
    process.exit(fallos.length ? 1 : 0);
  });
