/** op.exp.7 cost: one parse of alerts and incidents per evaluation, shared by EV-02, EV-03 and the art. 32 data. */
import { opExp7PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-7.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp7CatalogDefinition } from '../common/ens/catalog/op-exp-7';
import { opExp7Configuration } from '../common/ens/configuration/data/op-exp-7-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';

declare const process: { exit(code: number): void; argv: string[] };
const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  if (!ok) failures.push(name);
};

const NOW = new Date('2026-09-26T12:00:00Z');
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3600e3).toISOString().replace('.000Z', 'Z');
let counter = 0;
const fact = (data: Record<string, unknown>, ts = ago(1)) => ({
  _id: `f-${(counter += 1)}`,
  _source: {
    '@timestamp': ts,
    agent: { id: '000', name: 'Wazuh-4' },
    rule: { id: '110800', description: 'op.exp.7' },
    location: '/var/log/ensfacil/op_exp_7.json',
    data: Object.fromEntries(Object.entries({ ensfacil: 'op.exp.7', ...data }).map(([k, v]) => [k, String(v)])),
  },
});
const ALL = 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08,EV-09,EV-10,EV-11,EV-12';
const VALUES: Record<string, string[]> = {
  'P-01': ['intrusión | Crítica | 13 | si | compromiso confirmado', 'ataque | Alta | 12 | no |', 'aviso | Media | 7 | no |'],
  'P-02': ['Crítica | RSI + CISO | 1 | teléfono', 'Alta | RSI | 4 | correo', 'Media | RSI | 24 | correo'],
  'P-05': ['critica | 4 | 24', 'alta | 8 | 48', 'media | 24 | 120', 'baja | 48 | 240'],
};
const cfg = { ...opExp7Configuration, parameters: opExp7Configuration.parameters.map(p => ({ ...p, value: VALUES[p.id] })) };

// `incidents` incidents (each with its own system) and `groups` alert groups, half of them on an incident's system.
const opExp7Context = (incidents: number, groups: number) => {
  const raw: any[] = [
    fact({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: ALL, evidencias_miradas: ALL, registro_incidentes: 'presente', alertas_leidas: 16000, nivel_observado_desde: 7, perfil: 'manager' }, ago(0.5)),
  ];
  for (let i = 0; i < incidents; i += 1) {
    const opened = 24 * (1 + (i % 25));
    raw.push(
      fact({ event: 'incident_registered', evidence_id: 'EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08,EV-12', incidente_id: `INC-${i}`, fase: 'inicial', fecha: ago(opened), severidad: i % 2 ? 'alta' : 'critica', sistemas: `srv-${i}`, clasificacion: 'acceso no autorizado', datos_personales: 'no', relevancia_juridica: 'no', referencia: '-' })
    );
  }
  for (let g = 0; g < groups; g += 1) {
    const system = g % 2 ? `srv-${g % Math.max(1, incidents)}` : `otro-${g}`;
    const first = 24 * (1 + (g % 25)) + 1;
    raw.push(
      fact({ event: 'security_alert_observed', evidence_id: 'EV-01,EV-02,EV-03', sistema: system, agente_id: '024', nivel: g % 3 ? 12 : 13, regla: String(23000 + (g % 50)), alertas: 1 + (g % 7), primera: ago(first), ultima: ago(first - 0.5), descripcion: `regla ${g}` })
    );
  }
  const events = normalizeWazuhAlerts(raw);
  const evidences = resolveEvidenceForControl('op.exp.7', events, '000', 'ALTO', cfg as any, NOW);
  return buildPolicyContext(opExp7CatalogDefinition, cfg as any, 'ALTO', events, evidences, NOW);
};

// Full passes over the facts during one evaluation.
const scansOf = (incidents: number, groups: number): number => {
  const context: any = opExp7Context(incidents, groups);
  let scans = 0;
  const events = context.events.slice();
  events.filter = function (...args: any[]) {
    scans += 1;
    return Array.prototype.filter.apply(this, args as any);
  };
  context.events = events;
  opExp7PolicyDefinition.evaluator!(context);
  return scans;
};

const msPerEvaluation = (incidents: number, groups: number, rounds = 5): number => {
  const context = opExp7Context(incidents, groups);
  opExp7PolicyDefinition.evaluator!(buildPolicyContext(opExp7CatalogDefinition, cfg as any, 'ALTO', context.events, context.evidences, NOW));
  const t0 = Date.now();
  for (let i = 0; i < rounds; i += 1) {
    // A new context per round: the memo is per evaluation, as in the engine.
    opExp7PolicyDefinition.evaluator!(buildPolicyContext(opExp7CatalogDefinition, cfg as any, 'ALTO', context.events, context.evidences, NOW));
  }
  return (Date.now() - t0) / rounds;
};

console.log('Passes over the facts per evaluation');
const small = scansOf(10, 200);
const more = scansOf(60, 200);
const many = scansOf(150, 1200);
check('the same number of passes with 10, 60 or 150 incidents (no parse per incident)', small === more && more === many, { small, more, many });
check('a bounded number of passes', small < 60, small);

const variable = (context: any, name: string) => opExp7PolicyDefinition.evaluator!(context).runtimeVariables.find(v => v.name === name)?.value as string;
const detection = JSON.parse(variable(opExp7Context(20, 500), 'informe_art32_deteccion'));
check('the art. 32 detection still names the incidents with a reconciled alert', Array.isArray(detection.incidentes) && detection.incidentes.length > 0, detection);

// The reviewer's three sizes: printed for the record (timings are not asserted).
console.log('\nms per evaluation (informative)');
[[20, 500], [60, 1500], [150, 3000]].forEach(([incidents, groups]) => console.log(`  ${incidents} incidents × ${groups} alert groups: ${msPerEvaluation(incidents, groups).toFixed(1)} ms`));

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
