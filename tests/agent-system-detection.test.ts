/** Detection of each agent's system type (Configuration -> Systems). */
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
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`);
  if (!c) failures.push(n);
};

const UBUNTU = { platform: 'ubuntu', name: 'Ubuntu', version: '22.04.5 LTS', uname: 'Linux |dir01.example.com |6.8.0-138-generic |#138 SMP |x86_64' };
const WINDOWS = { platform: 'windows', name: 'Microsoft Windows Server 2022 Standard', version: '10.0.20348', uname: 'Microsoft Windows Server 2022 Standard' };

(async () => {
  console.log('1. Inventory');
  {
    const q = buildMonitoringInventoryRequest();
    check('asks for os', q.body.aggs.agentes.aggs.ultimo.top_hits._source.includes('os'));
    const now = Date.parse('2026-10-17T10:00:00Z');
    const bucket = (key: string, source: any) => ({ key, ultimo: { hits: { hits: [{ _source: source }] } } });
    const inv = inventoryFromMonitoring({
      agentes: {
        buckets: [
          bucket('101', { id: '101', name: 'dir01', group: ['ens'], status: 'active', timestamp: '2026-10-17T09:50:00Z', manager: 'mgr', os: { ...UBUNTU, arch: 'x86_64' } }),
          bucket('102', { id: '102', name: 'win01', group: ['ens'], status: 'active', timestamp: '2026-10-17T09:50:00Z', os: WINDOWS }),
          bucket('103', { id: '103', name: 'nuevo', group: ['ens'], status: 'never_connected', timestamp: '2026-10-17T09:50:00Z' }),
        ],
      },
    }, now);
    const dir = inv.agents.find(a => a.id === '101');
    check('keeps platform, name, version and uname', dir?.os?.platform === 'ubuntu' && dir?.os?.version === '22.04.5 LTS' && /dir01/.test(dir?.os?.uname || ''), dir);
    check('does not copy what it does not use (arch)', !(dir?.os as any)?.arch);
    check('sin os, sin la clave', !('os' in (inv.agents.find(a => a.id === '103') || {})));

    const scope = await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => inv.agents, true);
    check('the scope keeps os', scope.find(a => a.id === '102')?.os?.platform === 'windows', scope);
  }

  console.log('2. Facts');
  {
    const q: any = buildPlatformFactsRequest();
    check('an aggregation with no documents', q.body.size === 0 && q.body.aggs.agentes.terms.field === 'agent.id');
    check('30 days and only Power ENS facts', JSON.stringify(q.body.query).includes('now-30d') && JSON.stringify(q.body.query).includes('data.power_ens'));
    check('planes per agent', q.body.aggs.agentes.aggs.planos.terms.field === 'data.plano');
    check('origins only from mp.info.6', q.body.aggs.agentes.aggs.copias.filter.term['data.power_ens'] === 'mp.info.6');
    const f = platformFactsFromAggregations({
      agentes: {
        buckets: [
          { key: '101', planos: { buckets: [{ key: 'sistema', doc_count: 10 }, { key: 'directorio', doc_count: 13548 }, { key: 'sistema,directorio', doc_count: 32 }] }, copias: { origenes: { buckets: [] } } },
          { key: 104, planos: { buckets: [{ key: 'sistema', doc_count: 5 }] }, copias: { origenes: { buckets: [{ key: 'pbs', doc_count: 3454 }] } } },
        ],
      },
    });
    check('normalized id', Object.keys(f).sort().join(',') === '101,104', Object.keys(f));
    check('counts by plane', f['101'].planes.directorio === 13548 && f['101'].planes['sistema,directorio'] === 32);
    check('counts by origin', f['104'].backupOrigins.pbs === 3454);

    console.log('3. Rule');
    const m = detectAgentSystem({ id: '000' });
    check('000 → Manager', m.type === 'manager' && /manager de Wazuh/.test(m.evidence), m);
    const w = detectAgentSystem({ id: '102', os: WINDOWS });
    check('windows -> Windows, by the inventory', w.type === 'windows' && w.source === 'inventario' && /inventario de agentes \(Windows\)/.test(w.evidence), w);
    const l = detectAgentSystem({ id: '101', os: UBUNTU }, f['101']);
    check('Ubuntu with directory facts -> LDAP (Zimbra), by the facts', l.type === 'zimbra-ldap' && l.source === 'hechos', l);
    check('the evidence also counts composite planes', /13\.580/.test(l.evidence), l.evidence);
    const u = detectAgentSystem({ id: '104', os: { platform: 'ubuntu' } }, f['104']);
    check('Ubuntu without directory -> Linux', u.type === 'linux' && /inventario de agentes \(Ubuntu\)/.test(u.evidence), u);
    check('origin pbs -> proposes Copias con PBS', u.addons.length === 1 && u.addons[0].templateId === 'pbs-backup', u.addons);
    check('mp.info.6 proposes «Copias con PBS»; other controls nothing', proposedTemplates('mp.info.6', u).join(',') === 'pbs-backup' && proposedTemplates('op.acc.1', u).length === 0);
    const n = detectAgentSystem({ id: '103' });
    check('no os -> undetected, and says so', n.type === undefined && /se elige a mano/.test(n.evidence), n);
    const r = detectAgentSystem({ id: '105', os: { uname: 'Linux |host |5.15 |x86_64' } });
    check('no platform but uname Linux -> Linux', r.type === 'linux');

    const corrected = effectiveSystemType(u, { typeOverride: 'zimbra-ldap' });
    check('manual correction: wins and says what was detected', corrected.type === 'zimbra-ldap' && corrected.manual && /corregido a mano/.test(corrected.description) && /Linux/.test(corrected.description), corrected);
    const saved = effectiveSystemType(n, { detectedType: 'linux', detectedBy: 'os.platform = ubuntu en el inventario de agentes' });
    check('no live data, the stored detected type', saved.type === 'linux' && /detectado por os\.platform/.test(saved.description), saved);
    const withoutIt = effectiveSystemType(n);
    check('nothing: undetected', withoutIt.type === undefined && /^sin detectar/.test(withoutIt.description), withoutIt);
  }

  console.log('4. Alias');
  {
    check('hostname from os.uname', hostnameFromUname(UBUNTU.uname) === 'dir01.example.com');
    check('Windows brings no hostname in uname', hostnameFromUname(WINDOWS.uname) === undefined);
    const a = agentAliases({ id: '101', name: 'dirHost', os: UBUNTU }, { aliases: ['Directorio-Principal'] });
    check('id, name, hostname, short hostname and stored aliases, in lower case',
      ['101', 'dirhost', 'dir01.example.com', 'dir01', 'directorio-principal'].every(x => a.includes(x)), a);
  }

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
