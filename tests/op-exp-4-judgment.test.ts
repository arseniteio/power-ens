/** op.exp.4: judgment of maintenance and security updates. */
import { opExp4PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-4.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp4CatalogDefinition } from '../common/ens/catalog/op-exp-4';
import { opExp4Configuration } from '../common/ens/configuration/data/op-exp-4-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail !== '' ? ` — ${String(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const NOW = new Date('2026-09-16T12:00:00Z');
const ago = (hours: number): string =>
  new Date(NOW.getTime() - hours * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let counter = 0;

const alert = (data: Record<string, unknown>, ts = ago(1)) => {
  counter += 1;

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: { id: '024', name: 'wazuh-real' },
      rule: { id: '110500', description: 'op.exp.4' },
      location: '/var/log/power-ens/op_exp_4.json',
      data: Object.fromEntries(
        Object.entries({ power_ens: 'op.exp.4', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

const events = (...alerts: ReturnType<typeof alert>[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alerts);

const configuration = (values: Record<string, string[]>): ENSControlConfiguration => ({
  ...opExp4Configuration,
  parameters: opExp4Configuration.parameters.map(p => ({
    ...p,
    value: values[p.id],
  })),
});

const snapshotOne = (text: string, openOnes: { cvss: string; detectada: string; cve: string; n?: number }[]) => [
  alert({
    event: 'vulnerability_inventory',
    evidence_id: 'EV-01,EV-10',
    instantanea: text,
    abiertas: openOnes.reduce((t, a) => t + (a.n || 1), 0),
    sin_puntuacion: openOnes.filter(a => a.cvss === '-').reduce((t, a) => t + (a.n || 1), 0),
    puntuaciones: openOnes.length,
  }, text),
  ...openOnes.map(a =>
    alert({
      event: 'vulnerability_open',
      evidence_id: 'EV-02,EV-10',
      instantanea: text,
      cvss: a.cvss,
      detectada: a.detectada,
      cve: a.cve,
      paquete: 'linux-image-6.8.0-139-generic',
      abiertas: a.n || 1,
    }, text)
  ),
];

const evaluate = (
  evs: ENSNormalizedEvent[],
  values: Record<string, string[]>,
  now: Date = NOW,
  level: ENSLevel = 'ALTO'
) => {
  const cfg = configuration(values);
  const evidences = resolveEvidenceForControl('op.exp.4', evs, '024', level, cfg, now);
  const context = buildPolicyContext(opExp4CatalogDefinition, cfg, level, evs, evidences, now);
  const { decisions } = opExp4PolicyDefinition.evaluator!(context);
  const principal = (requirement: string) => decisions.find(d => d.requirementId === requirement)!;
  const ofEvidence = (id: string) =>
    decisions.find(d => d.trace.ruleId.endsWith(`/${id}`));

  return { evidencias: evidences, decisions, principal, deEvidencia: ofEvidence, cfg, nivel: level };
};

const P01 = (critical: string) => ['Crítica | ' + critical, 'Alta | 30', 'Media | 90', 'Baja | 180', 'Sin puntuación | 180'];

section('1. Applicability: cumulative reinforcements, R3 and R4 outside the denominator');

{
  const levelsOf = (id: string) =>
    opExp4CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  check('R1 applies at MEDIO and ALTO', levelsOf('op.exp.4.r1.1') === 'MEDIO,ALTO', levelsOf('op.exp.4.r1.1'));
  check('R2 applies only at ALTO', levelsOf('op.exp.4.r2.1') === 'ALTO', levelsOf('op.exp.4.r2.1'));
  check('R3 applies at no level', levelsOf('op.exp.4.r3.1') === '');
  check('R4 applies at no level', levelsOf('op.exp.4.r4.1') === '');
  check('the base applies at the three', ['op.exp.4.1', 'op.exp.4.2', 'op.exp.4.3'].every(id => levelsOf(id) === 'BAJO,MEDIO,ALTO'));
  check('the control is ACTIVE', opExp4CatalogDefinition.status === 'ACTIVE', opExp4CatalogDefinition.status);

  const policyLevels = (id: string) =>
    opExp4PolicyDefinition.requirements.find(r => r.requirementId === id)!.levels.join(',');

  check('the policy says the same as the catalog for R1 and R2',
    policyLevels('op.exp.4.r1.1') === 'MEDIO,ALTO' && policyLevels('op.exp.4.r2.1') === 'ALTO');
}

section('2. EV-02 · the oldest of each score against its deadline');

{
  const evs = events(...snapshotOne(ago(2), [
    { cvss: '9.8', detectada: ago(10 * 24), cve: 'CVE-2026-31536', n: 164 },
    { cvss: '5.5', detectada: ago(10 * 24), cve: 'CVE-2025-1000' },
  ]));

  const seven = evaluate(evs, { 'P-01': P01('7') });
  check('critical open 10 days with deadline 7 → NO_CUMPLE', seven.deEvidencia('EV-02')?.status === 'NO_CUMPLE', seven.deEvidencia('EV-02')?.reason);
  check('and the motive names the CVE and the deadline', /CVE-2026-31536.*plazo de 7/.test(seven.deEvidencia('EV-02')?.reason || ''), seven.deEvidencia('EV-02')?.reason);

  const thirty = evaluate(evs, { 'P-01': P01('30') });
  check('REVERSAL: the SAME event with deadline 30 → CUMPLE', thirty.deEvidencia('EV-02')?.status === 'CUMPLE', thirty.deEvidencia('EV-02')?.reason);

  const p08 = evaluate(evs, { 'P-01': P01('7'), 'P-08': ['Crítica | 9.9', 'Alta | 7.0', 'Media | 4.0', 'Baja | 0.1'] });
  check('P-08 declares Crítica from 9.9: the 9.8 becomes Alta (30 days) → CUMPLE', p08.deEvidencia('EV-02')?.status === 'CUMPLE', p08.deEvidencia('EV-02')?.reason);

  const late = evaluate(evs, { 'P-01': P01('30') }, new Date(NOW.getTime() + 25 * 86400000));
  check('25 days later, without a new snapshot, nothing is asserted: NO_EVALUABLE', late.deEvidencia('EV-02')?.status === 'NO_EVALUABLE', late.deEvidencia('EV-02')?.reason);

  const withoutP01 = evaluate(evs, {});
  check('without P-01 → NO_EVALUABLE, never CUMPLE', withoutP01.deEvidencia('EV-02')?.status === 'NO_EVALUABLE');
}

section('3. EV-02 · incomplete, old or scoreless snapshot');

{
  const incompleteOne = events(...snapshotOne(ago(2), [
    { cvss: '9.8', detectada: ago(1), cve: 'CVE-A' },
    { cvss: '7.5', detectada: ago(1), cve: 'CVE-B' },
  ]).slice(0, 2));
  const r1 = evaluate(incompleteOne, { 'P-01': P01('7') });
  check('declares 2 scores and 1 arrives → NO_EVALUABLE', r1.deEvidencia('EV-02')?.status === 'NO_EVALUABLE', r1.deEvidencia('EV-02')?.reason);

  const old2 = events(...snapshotOne(ago(30), [{ cvss: '9.8', detectada: ago(40), cve: 'CVE-A' }]));
  const r2 = evaluate(old2, { 'P-01': P01('7') });
  check('snapshot from 30 h ago → NO_EVALUABLE', r2.deEvidencia('EV-01')?.status === 'NO_EVALUABLE' && r2.deEvidencia('EV-02')?.status === 'NO_EVALUABLE');
  const r2b = evaluate(old2, { 'P-01': P01('7') }, new Date(NOW.getTime() - 20 * 3600000));
  check('REVERSAL: the same snapshot evaluated 20 h earlier is current', r2b.deEvidencia('EV-01')?.status === 'CUMPLE', r2b.deEvidencia('EV-01')?.reason);

  const withoutScore = events(...snapshotOne(ago(2), [{ cvss: '-', detectada: ago(24), cve: 'CVE-X', n: 706 }]));
  const r3 = evaluate(withoutScore, { 'P-01': ['Crítica | 7'] });
  check('without a score and without a row in P-01 → NO_EVALUABLE', r3.deEvidencia('EV-02')?.status === 'NO_EVALUABLE', r3.deEvidencia('EV-02')?.reason);
  const r3b = evaluate(withoutScore, { 'P-01': ['Crítica | 7', 'Sin puntuación | 180'] });
  check('REVERSAL: with the «Sin puntuación» row it is judged → CUMPLE', r3b.deEvidencia('EV-02')?.status === 'CUMPLE', r3b.deEvidencia('EV-02')?.reason);
  const r3c = evaluate(withoutScore, { 'P-01': ['Crítica | 7', 'Sin puntuación |'] });
  check('«Sin puntuación» row with empty days = no declared deadline → CUMPLE and says so', r3c.deEvidencia('EV-02')?.status === 'CUMPLE' && /Sin plazo declarado/.test(r3c.deEvidencia('EV-02')?.reason || ''), r3c.deEvidencia('EV-02')?.reason);
}

section('4. EV-03 · pending security and restart against the longest deadline');

{
  const snapshot = (extra: Record<string, unknown>) =>
    events(alert({
      event: 'patch_status',
      evidence_id: 'EV-03',
      actualizaciones_pendientes: 36,
      seguridad_pendientes: 0,
      indice_paquetes: ago(3),
      linea_base: ago(24 * 40),
      desde_linea_base: 'no',
      reinicio_pendiente: 'no',
      ...extra,
    }));

  const restart = snapshot({ reinicio_pendiente: 'si', reinicio_pendiente_desde: ago(24 * 48), reinicio_desde_aproximado: 'no', paquetes_que_piden_reinicio: 'libc6,linux-image-6.8.0-139-generic' });
  const r1 = evaluate(restart, { 'P-01': ['Crítica | 7', 'Alta | 30'] });
  check('restart pending 48 days with longest deadline 30 → NO_CUMPLE', r1.deEvidencia('EV-03')?.status === 'NO_CUMPLE', r1.deEvidencia('EV-03')?.reason);
  const r1b = evaluate(restart, { 'P-01': ['Crítica | 7', 'Alta | 60'] });
  check('REVERSAL: with longest deadline 60 → CUMPLE', r1b.deEvidencia('EV-03')?.status === 'CUMPLE', r1b.deEvidencia('EV-03')?.reason);

  const base = snapshot({ seguridad_pendientes: 3, seguridad_pendiente_desde: ago(2), linea_base: ago(2), desde_linea_base: 'si' });
  const r2 = evaluate(base, { 'P-01': ['Alta | 30'] });
  check('pending since the baseline just set → NO_EVALUABLE (it is a bound)', r2.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r2.deEvidencia('EV-03')?.reason);
  const r2b = evaluate(base, { 'P-01': ['Alta | 30'] }, new Date(NOW.getTime() + 31 * 86400000));
  check('REVERSAL: 31 days later it is still pending... but the snapshot is no longer fresh', r2b.deEvidencia('EV-03')?.status === 'NO_EVALUABLE');

  const oldIndex = snapshot({ indice_paquetes: ago(24 * 45) });
  const r3 = evaluate(oldIndex, { 'P-01': ['Alta | 30'] });
  check('apt index older than the deadline → NO_EVALUABLE, «0 pendientes» is worthless', r3.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r3.deEvidencia('EV-03')?.reason);
}

section('4 bis. EV-03 · a directory server sends two snapshots and both are judged');

{
  const system = alert({
    event: 'patch_status', evidence_id: 'EV-03', plano: 'sistema',
    actualizaciones_pendientes: 0, seguridad_pendientes: 0, indice_paquetes: ago(3),
    linea_base: ago(24 * 60), desde_linea_base: 'no', reinicio_pendiente: 'no',
  }, ago(1));
  const directory = (sinceHours: number) => alert({
    event: 'patch_status', evidence_id: 'EV-03', plano: 'directorio', ambito_pendientes: 'parches_zimbra',
    actualizaciones_pendientes: 3, seguridad_pendientes: 3, seguridad_pendiente_desde: ago(sinceHours),
    indice_paquetes: ago(3), linea_base: ago(24 * 60), desde_linea_base: 'no', reinicio_pendiente: 'no',
  }, ago(2));

  const r1 = evaluate(events(directory(24 * 45), system), { 'P-01': ['Alta | 30'] });
  check('Zimbra patches pending 45 days with deadline 30 → NO_CUMPLE even if the system is up to date', r1.deEvidencia('EV-03')?.status === 'NO_CUMPLE' && /Zimbra/.test(r1.deEvidencia('EV-03')?.reason || ''), r1.deEvidencia('EV-03')?.reason);
  const r1b = evaluate(events(directory(24 * 10), system), { 'P-01': ['Alta | 30'] });
  check('REVERSAL: pending only 10 days → CUMPLE', r1b.deEvidencia('EV-03')?.status === 'CUMPLE', r1b.deEvidencia('EV-03')?.reason);
  const r1c = evaluate(events(directory(24 * 10)), { 'P-01': ['Alta | 30'] });
  check('without the system-plane snapshot → NO_EVALUABLE', r1c.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r1c.deEvidencia('EV-03')?.reason);
}

section('5. EV-04 · actor against P-02 (primitive NINGUNO_FUERA_DE_LISTA)');

{
  const change = (actor: string) =>
    alert({ event: 'package_changed', evidence_id: 'EV-04,EV-07,EV-08,EV-09', actor, mecanismo: 'unattended-upgrades', inicio: '2026-09-11T06:14:01+00:00' });
  const heartbeat = alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-04,EV-07' });

  const evs = events(change('unattended-upgrades'), change('dioni'), heartbeat);
  const r1 = evaluate(evs, { 'P-02': ['unattended-upgrades | servidores | automático'] });
  const ev04 = (r: ReturnType<typeof evaluate>) => r.evidencias.find(e => e.id === 'EV-04')!;
  check('dioni is not in P-02 → NO_CUMPLE', ev04(r1).status === 'NO_CUMPLE', ev04(r1).observations.join(' '));
  const r1b = evaluate(evs, { 'P-02': ['unattended-upgrades | servidores | automático', 'dioni | servidores | administrador'] });
  check('REVERSAL: dioni is authorized → CUMPLE', ev04(r1b).status === 'CUMPLE', ev04(r1b).observations.join(' '));

  const r2 = evaluate(events(heartbeat), { 'P-02': ['dioni | servidores | administrador'] });
  check('without changes and with a heartbeat covering EV-04 → CUMPLE (clean sweep)', ev04(r2).status === 'CUMPLE');
  const r2b = evaluate(events(), { 'P-02': ['dioni | servidores | administrador'] });
  check('REVERSAL: without a heartbeat, silence does not accredit → NO_EVALUABLE', ev04(r2b).status === 'NO_EVALUABLE');
}

section('6. EV-07 · maintenance windows in local time');

{
  const evs = events(alert({ event: 'package_changed', evidence_id: 'EV-04,EV-07,EV-08,EV-09', actor: 'unattended-upgrades', mecanismo: 'unattended-upgrades', inicio: '2026-09-02T06:41:18+02:00' }));

  const r1 = evaluate(evs, { 'P-04': ['* | sab 22:00-02:00'] });
  check('Wednesday 06:41 with window «sab 22:00-02:00» → NO_CUMPLE', r1.deEvidencia('EV-07')?.status === 'NO_CUMPLE', r1.deEvidencia('EV-07')?.reason);
  const r1b = evaluate(evs, { 'P-04': ['* | sab 22:00-02:00; * 06:00-07:30'] });
  check('REVERSAL: adding «* 06:00-07:30» → CUMPLE', r1b.deEvidencia('EV-07')?.status === 'CUMPLE', r1b.deEvidencia('EV-07')?.reason);
  const r1c = evaluate(evs, { 'P-04': ['* | mar 23:00-07:00'] });
  check('a span that crosses midnight covers the next day → CUMPLE', r1c.deEvidencia('EV-07')?.status === 'CUMPLE', r1c.deEvidencia('EV-07')?.reason);
  const r1d = evaluate(evs, { 'P-04': ['wazuh-real | lun-vie 06:00-07:00', '* | sab 22:00-02:00'] });
  check('the agent\'s own row prevails over «*»', r1d.deEvidencia('EV-07')?.status === 'CUMPLE', r1d.deEvidencia('EV-07')?.reason);
  const r1e = evaluate(evs, { 'P-04': ['* | los sábados por la noche'] });
  check('a window that is not understood is not guessed → NO_EVALUABLE', r1e.deEvidencia('EV-07')?.status === 'NO_EVALUABLE', r1e.deEvidencia('EV-07')?.reason);
}

section('7. EV-05 · end of support: the earliest date between vendor and P-05');

{
  const ubuntu = (standard: string) =>
    events(alert({ event: 'product_support', evidence_id: 'EV-05', producto: 'Ubuntu', version: '24.04', fin_soporte_estandar: standard, fin_soporte_ampliado: '2034-04-25', soporte_ampliado: 'no_adjunto' }));

  const r1 = evaluate(ubuntu('2029-05-31'), { 'P-05': ['Ubuntu | 24.04 | 2029-05-31'] });
  check('Ubuntu 24.04 declared and in support → CUMPLE', r1.deEvidencia('EV-05')?.status === 'CUMPLE', r1.deEvidencia('EV-05')?.reason);
  const r1b = evaluate(ubuntu('2029-05-31'), { 'P-05': ['Ubuntu | 24.04 | 2026-01-01'] });
  check('REVERSAL: P-05 declares a date already past → NO_CUMPLE', r1b.deEvidencia('EV-05')?.status === 'NO_CUMPLE', r1b.deEvidencia('EV-05')?.reason);
  const r1c = evaluate(ubuntu('2029-05-31'), { 'P-05': ['Ubuntu | 24.04 | 2035-01-01'] });
  check('a declaration does not extend support beyond the vendor\'s (uses 2029)', r1c.deEvidencia('EV-05')?.status === 'CUMPLE' && /2029-05-31/.test(r1c.deEvidencia('EV-05')?.reason || ''), r1c.deEvidencia('EV-05')?.reason);
  const r2 = evaluate(ubuntu('2029-05-31'), { 'P-05': ['Zimbra | 10.1 | 2027-12-31'] });
  check('product reported without a row in P-05 → NO_EVALUABLE', r2.deEvidencia('EV-05')?.status === 'NO_EVALUABLE', r2.deEvidencia('EV-05')?.reason);
  const r3 = evaluate(ubuntu('2025-05-29'), { 'P-05': ['Zimbra | 10.1 | 2027-12-31'] });
  check('vendor date expired even without a row → NO_CUMPLE', r3.deEvidencia('EV-05')?.status === 'NO_CUMPLE', r3.deEvidencia('EV-05')?.reason);
}

section('8. R1 unsimulated and R2 with precedence');

{
  const change = alert({ event: 'package_changed', evidence_id: 'EV-04,EV-07,EV-08,EV-09', actor: 'dioni', mecanismo: 'apt', inicio: ago(5) });

  const r1 = evaluate(events(change), { 'P-06': ['wazuh-real | pre-wazuh-real | informe'] });
  check('R1 with P-06 declared stays NO_EVALUABLE: two machines are not crossed', r1.principal('op.exp.4.r1.1').status === 'NO_EVALUABLE', r1.principal('op.exp.4.r1.1').reason);

  const hypervisor = evaluate(events(change), { 'P-07': ['* | hipervisor | snapshot Hetzner | 24'] });
  check('R2 with mechanism «hipervisor» → NO_EVALUABLE (leaves no trace on the machine)', hypervisor.principal('op.exp.4.r2.1').status === 'NO_EVALUABLE', hypervisor.principal('op.exp.4.r2.1').reason);

  const antes = alert({ event: 'reversion_point_created', evidence_id: 'EV-09', mecanismo: 'lvm', identificador: 'vg0/pre-parche', creado: ago(7) });
  const after = alert({ event: 'reversion_point_created', evidence_id: 'EV-09', mecanismo: 'lvm', identificador: 'vg0/tarde', creado: ago(4) });

  const r2 = evaluate(events(change, antes), { 'P-07': ['* | lvm | snapshot | 24'] });
  check('LVM snapshot 2 h before the change, window 24 h → CUMPLE', r2.principal('op.exp.4.r2.1').status === 'CUMPLE', r2.principal('op.exp.4.r2.1').reason);
  const r2b = evaluate(events(change, after), { 'P-07': ['* | lvm | snapshot | 24'] });
  check('REVERSAL: the snapshot is AFTER the change → NO_CUMPLE', r2b.principal('op.exp.4.r2.1').status === 'NO_CUMPLE', r2b.principal('op.exp.4.r2.1').reason);
  const r2c = evaluate(events(change, antes), { 'P-07': ['* | lvm | snapshot | 1'] });
  check('REVERSAL: a 1 h prior window does not cover the 2 h → NO_CUMPLE', r2c.principal('op.exp.4.r2.1').status === 'NO_CUMPLE');
}

section('9. EV-10 · debt week by week');

{
  const header = (hours: number, openOnes: number) =>
    alert({ event: 'vulnerability_inventory', evidence_id: 'EV-01,EV-10', instantanea: ago(hours), abiertas: openOnes, puntuaciones: 0, sin_puntuacion: 0 }, ago(hours));

  const grows = evaluate(events(header(24 * 15, 100), header(24 * 8, 120), header(2, 150)), {});
  check('100 → 120 → 150 in three weeks → NO_CUMPLE', grows.deEvidencia('EV-10')?.status === 'NO_CUMPLE', grows.deEvidencia('EV-10')?.reason);
  const lowOne = evaluate(events(header(24 * 15, 100), header(24 * 8, 160), header(2, 150)), {});
  check('REVERSAL: 100 → 160 → 150 is not sustained growth → CUMPLE', lowOne.deEvidencia('EV-10')?.status === 'CUMPLE', lowOne.deEvidencia('EV-10')?.reason);
  const corta = evaluate(events(header(2, 150)), {});
  check('a single week of series → NO_EVALUABLE', corta.deEvidencia('EV-10')?.status === 'NO_EVALUABLE');
}

section('10. The requirement comes out of its evidences and each evidence keeps its colour');

{
  const evs = events(
    ...snapshotOne(ago(2), [{ cvss: '9.8', detectada: ago(10 * 24), cve: 'CVE-2026-31536', n: 164 }]),
    alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-04,EV-07' })
  );
  const r = evaluate(evs, { 'P-01': P01('7'), 'P-04': ['* | * 00:00-24:00'] });

  const decision = r.principal('op.exp.4.2');
  check('the FIRST decision of op.exp.4.2 is the requirement\'s, and it is NO_CUMPLE', decision.status === 'NO_CUMPLE' && decision.trace.ruleId === 'op.exp.4.2', `${decision.trace.ruleId} ${decision.status}`);

  const requirement = evaluateRequirement(
    opExp4CatalogDefinition.requirements.find(q => q.id === 'op.exp.4.2')!,
    'BAJO',
    r.evidencias,
    false,
    r.decisions,
    'ACTIVE'
  );
  check('evaluateRequirement publishes op.exp.4.2 measured NO_CUMPLE', requirement.status === 'NO_CUMPLE' && requirement.evidenced === true, `${requirement.status} ${requirement.evidenced}`);

  const tabla = applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp4CatalogDefinition.requirements);
  const color = (id: string) => tabla.find(e => e.id === id)?.status;
  check('EV-02 comes out NO_CUMPLE in the table', color('EV-02') === 'NO_CUMPLE', color('EV-02'));
  check('and EV-01, which is measured, comes out CUMPLE: it does not inherit EV-02\'s red', color('EV-01') === 'CUMPLE', color('EV-01'));
  check('EV-07 without changes with heartbeat → CUMPLE', color('EV-07') === 'CUMPLE', color('EV-07'));
}

section('11. Only op.exp.4 facts count');

{
  const foreignOne = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': ago(1),
      agent: { id: '024', name: 'wazuh-real' },
      data: { power_ens: 'op.acc.4', event: 'package_changed', actor: 'intruso', inicio: '2026-09-02T03:00:00+00:00' },
    },
  }]);
  const r = evaluate(foreignOne, { 'P-04': ['* | sab 22:00-02:00'] });
  check('a package_changed from another control does not enter EV-07', r.deEvidencia('EV-07')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-07')?.reason);
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
