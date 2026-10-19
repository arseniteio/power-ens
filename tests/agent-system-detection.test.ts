/**
 * Detección del tipo de sistema de cada agente (Configuración → Sistemas).
 *
 *   npx --yes tsx tests/agent-system-detection.test.ts
 *
 *   1. El inventario pide `os` y lo conserva hasta el alcance.
 *   2. Los hechos se piden con UNA agregación (size 0) por agente: planos y
 *      orígenes de mp.info.6.
 *   3. La regla: 000 → Manager; windows → Windows; hechos de directorio →
 *      LDAP (Zimbra); familia Linux → Linux; sin os → sin detectar. Con la
 *      evidencia («detectado por …») y la corrección a mano.
 *   4. Los alias por los que se reconoce a una máquina en las tablas.
 */
import { buildMonitoringInventoryRequest, inventoryFromMonitoring } from '../common/agents/agent-inventory';
import { buildPlatformFactsRequest, platformFactsFromAggregations } from '../public/agents/agent-platform-facts';
import { hydrateENSScope } from '../common/ens/core/scope/runtime';
import {
  agentAliases,
  detectAgentSystem,
  effectiveSystemType,
  hostnameFromUname,
  proposedTemplates,
} from '../common/ens/configuration/agents/system-detection';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`);
  if (!c) fallos.push(n);
};

const UBUNTU = { platform: 'ubuntu', name: 'Ubuntu', version: '22.04.5 LTS', uname: 'Linux |dir01.example.com |6.8.0-138-generic |#138 SMP |x86_64' };
const WINDOWS = { platform: 'windows', name: 'Microsoft Windows Server 2022 Standard', version: '10.0.20348', uname: 'Microsoft Windows Server 2022 Standard' };

(async () => {
  console.log('1. Inventario');
  {
    const q = buildMonitoringInventoryRequest();
    comprueba('pide os', q.body.aggs.agentes.aggs.ultimo.top_hits._source.includes('os'));
    const ahora = Date.parse('2026-10-17T10:00:00Z');
    const cubo = (key: string, source: any) => ({ key, ultimo: { hits: { hits: [{ _source: source }] } } });
    const inv = inventoryFromMonitoring({
      agentes: {
        buckets: [
          cubo('101', { id: '101', name: 'dir01', group: ['ens'], status: 'active', timestamp: '2026-10-17T09:50:00Z', manager: 'mgr', os: { ...UBUNTU, arch: 'x86_64' } }),
          cubo('102', { id: '102', name: 'win01', group: ['ens'], status: 'active', timestamp: '2026-10-17T09:50:00Z', os: WINDOWS }),
          cubo('103', { id: '103', name: 'nuevo', group: ['ens'], status: 'never_connected', timestamp: '2026-10-17T09:50:00Z' }),
        ],
      },
    }, ahora);
    const dir = inv.agents.find(a => a.id === '101');
    comprueba('conserva platform, name, version y uname', dir?.os?.platform === 'ubuntu' && dir?.os?.version === '22.04.5 LTS' && /dir01/.test(dir?.os?.uname || ''), dir);
    comprueba('no copia lo que no usa (arch)', !(dir?.os as any)?.arch);
    comprueba('sin os, sin la clave', !('os' in (inv.agents.find(a => a.id === '103') || {})));

    const alcance = await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => inv.agents, true);
    comprueba('el alcance conserva os', alcance.find(a => a.id === '102')?.os?.platform === 'windows', alcance);
  }

  console.log('2. Hechos');
  {
    const q: any = buildPlatformFactsRequest();
    comprueba('una agregación sin documentos', q.body.size === 0 && q.body.aggs.agentes.terms.field === 'agent.id');
    comprueba('30 días y solo hechos de ENSFácil', JSON.stringify(q.body.query).includes('now-30d') && JSON.stringify(q.body.query).includes('data.ensfacil'));
    comprueba('planos por agente', q.body.aggs.agentes.aggs.planos.terms.field === 'data.plano');
    comprueba('orígenes solo de mp.info.6', q.body.aggs.agentes.aggs.copias.filter.term['data.ensfacil'] === 'mp.info.6');
    const f = platformFactsFromAggregations({
      agentes: {
        buckets: [
          { key: '101', planos: { buckets: [{ key: 'sistema', doc_count: 10 }, { key: 'directorio', doc_count: 13548 }, { key: 'sistema,directorio', doc_count: 32 }] }, copias: { origenes: { buckets: [] } } },
          { key: 104, planos: { buckets: [{ key: 'sistema', doc_count: 5 }] }, copias: { origenes: { buckets: [{ key: 'pbs', doc_count: 3454 }] } } },
        ],
      },
    });
    comprueba('id normalizado', Object.keys(f).sort().join(',') === '101,104', Object.keys(f));
    comprueba('cuenta por plano', f['101'].planes.directorio === 13548 && f['101'].planes['sistema,directorio'] === 32);
    comprueba('cuenta por origen', f['104'].backupOrigins.pbs === 3454);

    console.log('3. Regla');
    const m = detectAgentSystem({ id: '000' });
    comprueba('000 → Manager', m.type === 'manager' && /manager de Wazuh/.test(m.evidence), m);
    const w = detectAgentSystem({ id: '102', os: WINDOWS });
    comprueba('windows → Windows, por el inventario', w.type === 'windows' && w.source === 'inventario' && /inventario de agentes \(Windows\)/.test(w.evidence), w);
    const l = detectAgentSystem({ id: '101', os: UBUNTU }, f['101']);
    comprueba('Ubuntu con hechos de directorio → LDAP (Zimbra), por los hechos', l.type === 'zimbra-ldap' && l.source === 'hechos', l);
    comprueba('la evidencia cuenta también los planos compuestos', /13\.580/.test(l.evidence), l.evidence);
    const u = detectAgentSystem({ id: '104', os: { platform: 'ubuntu' } }, f['104']);
    comprueba('Ubuntu sin directorio → Linux', u.type === 'linux' && /inventario de agentes \(Ubuntu\)/.test(u.evidence), u);
    comprueba('origen pbs → propone Copias con PBS', u.addons.length === 1 && u.addons[0].templateId === 'pbs-backup', u.addons);
    comprueba('mp.info.6 proposes «Copias con PBS»; other controls nothing', proposedTemplates('mp.info.6', u).join(',') === 'pbs-backup' && proposedTemplates('op.acc.1', u).length === 0);
    const n = detectAgentSystem({ id: '103' });
    comprueba('sin os → sin detectar y lo dice', n.type === undefined && /se elige a mano/.test(n.evidence), n);
    const r = detectAgentSystem({ id: '105', os: { uname: 'Linux |host |5.15 |x86_64' } });
    comprueba('sin platform pero con uname Linux → Linux', r.type === 'linux');

    const corregido = effectiveSystemType(u, { typeOverride: 'zimbra-ldap' });
    comprueba('corrección a mano: manda y dice qué se detectó', corregido.type === 'zimbra-ldap' && corregido.manual && /corregido a mano/.test(corregido.description) && /Linux/.test(corregido.description), corregido);
    const guardado = effectiveSystemType(n, { detectedType: 'linux', detectedBy: 'os.platform = ubuntu en el inventario de agentes' });
    comprueba('sin datos vivos, el tipo detectado guardado', guardado.type === 'linux' && /detectado por os\.platform/.test(guardado.description), guardado);
    const sin = effectiveSystemType(n);
    comprueba('sin nada: sin detectar', sin.type === undefined && /^sin detectar/.test(sin.description), sin);
  }

  console.log('4. Alias');
  {
    comprueba('hostname de os.uname', hostnameFromUname(UBUNTU.uname) === 'dir01.example.com');
    comprueba('Windows no trae hostname en uname', hostnameFromUname(WINDOWS.uname) === undefined);
    const a = agentAliases({ id: '101', name: 'dirHost', os: UBUNTU }, { aliases: ['Directorio-Principal'] });
    comprueba('id, nombre, hostname, hostname corto y alias guardados, en minúsculas',
      ['101', 'dirhost', 'dir01.example.com', 'dir01', 'directorio-principal'].every(x => a.includes(x)), a);
  }

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
