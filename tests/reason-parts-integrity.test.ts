/** Published motive parts (`reasonParts`) are valid only for THEIR motive. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) failures.push(n);
};

const h = installReactHarness();
const React = require('react');
const { readFileSync, readdirSync } = require('fs');
const { withReasonParts, compositeReason, reasonPartsOf } = require('../common/ens/core/policy-runtime/policies/policy-kit');
const { markPolicyRuntimeStale } = require('../common/ens/core/evidence/stale-collector');
const { markPolicyRuntimeUnmatchedScope } = require('../common/ens/core/scope/measurement-planes');
const { consolidateAgentComplianceResultByControl } = require('../common/ens/core/compliance-state/consolidation');
const { parseMotive, motiveToText } = require('../common/ens/evaluation/motive-parser');
const { NonConformityCard } = require('../public/ens/controls/control-detail/nonconformity-card');
const { classifyNonConformity } = require('../public/ens/controls/control-detail/nonconformity-class');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { getENSComplianceState } = require('../common/ens/core/ens-engine');

const BRIDGE = (req: string) => `Resuelta por la política del control (policy.op.exp.6), que mide esta evidencia junto a ${req}: `;
const ownOnes = [
  { id: 'EV-01', medida: { estado: 'NO_EVALUABLE', motivo: 'P-02 sin configurar.', causa: 'CONFIGURATION' } },
  { id: 'EV-11', medida: { estado: 'NO_CUMPLE', motivo: 'Faltan scripts de respuesta en op.exp.6.1.' } },
];
const decision = (req: string) =>
  withReasonParts({ policyId: 'policy.op.exp.6', requirementId: req, status: 'NO_CUMPLE', parameterIds: [], evidenceIds: ['EV-11'], eventIds: [], runtimeVariables: [], trace: { ruleId: req, ruleType: 'x', expression: '', expected: '', actual: '', result: false }, reason: compositeReason(ownOnes) }, reasonPartsOf(ownOnes));
const STALE = 'Sin datos del recolector desde 2026-10-15 12:47 UTC: el último latido de op.exp.6 en esta máquina tiene más de 24 h y lo que envió entonces no demuestra su estado a fecha de la evaluación.';

(async () => {
  console.log('1. Whoever replaces the motive drops the parts');
  const runtime = { policyId: 'policy.op.exp.6', decisions: [decision('op.exp.6.1'), decision('op.exp.6.2')] };
  const parado = markPolicyRuntimeStale(runtime, { since: '2026-10-15T12:47:00Z', reference: 'collector_run', reason: STALE });
  check('stopped collector: new motive and no parts', parado.decisions.every((d: any) => d.reason === STALE && d.reasonParts === undefined && d.cause === 'COLLECTION'), parado.decisions.map((d: any) => Object.keys(d)));
  const outside = markPolicyRuntimeUnmatchedScope(runtime, 'P-04 no declara ninguna máquina…');
  check('scope that names nobody: new motive and no parts', outside.decisions.every((d: any) => d.reasonParts === undefined && d.cause === 'CONFIGURATION'));
  check('the original decision is not touched', runtime.decisions.every((d: any) => d.reasonParts?.length === 2));
  {
    const blocks: Record<string, any> = {};
    readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
      const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
      blocks[b.controlId] = b;
    });
    ensConfigurationRepository.completeHydration({ ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: [JSON.parse(JSON.stringify(blocks['op.exp.6']))] });
    const scope = [{ id: '101', name: 'srv-a', groups: ['ens'], status: 'active' }, { id: '102', name: 'srv-b', groups: ['ens'], status: 'active' }];
    const estado = getENSComplianceState('BAJO', [], undefined, scope, new Date('2026-10-17T12:00:00Z'));
    const agentes = estado.agents.map((a: any) => ({
      ...a,
      results: a.results.map((r: any) => (r.control.id === 'op.exp.6' && r.policyRuntime ? { ...r, policyRuntime: { ...r.policyRuntime, decisions: r.policyRuntime.decisions.map((d: any) => withReasonParts(d, reasonPartsOf(ownOnes))) } } : r)),
    }));
    const conPartesAntes = agentes.flatMap((a: any) => a.results.filter((r: any) => r.control.id === 'op.exp.6').flatMap((r: any) => r.policyRuntime?.decisions || [])).filter((d: any) => d.reasonParts).length;
    const consolidated = consolidateAgentComplianceResultByControl(agentes, 'op.exp.6');
    check('consolidation: consolidated decisions carry no parts', conPartesAntes > 0 && (consolidated?.policyRuntime?.decisions || []).length > 0 && consolidated.policyRuntime.decisions.every((d: any) => d.reasonParts === undefined), { conPartesAntes });
  }

  console.log('2. The parser only accepts parts that are the text');
  const oldOnes2 = { reason: STALE, parts: reasonPartsOf(ownOnes) };
  const m = parseMotive(`${BRIDGE('op.exp.6.2')}${STALE}`, [oldOnes2]);
  check('parts that do not rebuild the text: ignored (not structured) and the text comes back exact', !m.structured && motiveToText(m) === `${BRIDGE('op.exp.6.2')}${STALE}` && m.parts.length === 1 && !m.parts[0].evidenceId, m.parts.map((p: any) => p.evidenceId));
  const goodOnes = parseMotive(`${BRIDGE('op.exp.6.1')}${compositeReason(ownOnes)}`, [{ reason: compositeReason(ownOnes), parts: reasonPartsOf(ownOnes) }]);
  check('parts that do be the text: structured', goodOnes.structured && goodOnes.parts.length === 2);
  const item = { id: 'NC-2', requirement: 'op.exp.6.2', origin: 'NO_EVIDENCIADA', cause: 'COLLECTION', finding: STALE, impact: 'Cuenta.', requiredAction: 'Restablecer la RECOGIDA.', parameterIds: [], evidenceIds: ['EV-11'] };
  const screen = await h.render(() => React.createElement(NonConformityCard, {
    item, clase: classifyNonConformity(item), etiquetaAlcance: 'Sin demostrar en', textoAlcance: 'srv-a (101)',
    lineasMotivo: [{ texto: `${BRIDGE('op.exp.6.2')}${STALE}`, etiqueta: 'EV-11' }], evidenciasImplicadas: ['EV-11'], controlId: 'op.exp.6',
    conocidos: [oldOnes2],
  }));
  const titular = h.nodes().find(n => n.type === 'p' && n.props?.title)?.props.title;
  check('a stopped collector\'s card is titled «Sin datos del recolector…»', /^Sin datos del recolector desde 2026-10-15 12:47 UTC/.test(titular || ''), titular);
  check('...and does not show the old verdicts (EV-11 NO_CUMPLE, «Faltan scripts»)', !/Faltan scripts/.test(screen) && !/\[ NO_CUMPLE \]/.test(screen), screen.slice(0, 300));

  console.log('3. Control outside the active configuration');
  {
    const blocks: Record<string, any> = {};
    readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
      const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
      blocks[b.controlId] = b;
    });
    const mp = JSON.parse(JSON.stringify(blocks['mp.info.6']));
    mp.parameters.forEach((p: any) => { if (p.required && p.example !== undefined) p.value = p.example; });
    mp.parameters.find((p: any) => p.id === 'P-04').value = ['srv-inexistente | MEDIA'];
    ensConfigurationRepository.completeHydration({ ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: [mp] });
    const scope = [{ id: '101', name: 'srv-a', groups: ['ens'], status: 'active' }, { id: '034', name: 'copias01', groups: ['ens'], status: 'active' }, { id: '000', name: 'm', groups: [], isManager: true }];
    const ncsDe = (level: string, agent: string | undefined, control: string) =>
      (getENSComplianceState(level, [], agent, scope, new Date('2026-10-17T12:00:00Z')).results.find((r: any) => r.control.id === control)?.nonConformities || []) as any[];
    const mon3 = ncsDe('BAJO', '034', 'op.mon.3');
    check('op.mon.3 unconfigured and no data on 034 (COLLECTION): there are nonconformities', mon3.length > 0 && mon3.every(n => n.cause === 'COLLECTION'), mon3.map(n => n.cause));
    check('...with «op.mon.3 no está en la configuración activa» and the collection datum behind it', mon3.every(n => /^op\.mon\.3 no está en la configuración activa/.test(n.finding) && /Además, no ha llegado ningún dato para/.test(n.finding)));
    check('...and the action «Añadir con valores por defecto», never «Restablecer la RECOGIDA»', mon3.every(n => /^Añadir con valores por defecto \(Configuración/.test(n.requiredAction) && !/RECOGIDA/.test(n.requiredAction)));
    const cont2 = ncsDe('ALTO', undefined, 'op.cont.2');
    check('op.cont.2 at ALTO (CONFIGURATION): the same action', cont2.length > 0 && cont2.every(n => n.cause === 'CONFIGURATION' && /^Añadir con valores por defecto/.test(n.requiredAction)), cont2.map(n => [n.cause, n.requiredAction.slice(0, 30)]));
    const mp6 = ncsDe('BAJO', undefined, 'mp.info.6');
    check('mp.info.6 configured, P-04 with no known machine (CONFIGURATION without parameters): «Completar la configuración obligatoria»',
      mp6.length > 0 && mp6.every(n => n.cause === 'CONFIGURATION' && !n.parameterIds.length && /^Completar la configuración obligatoria del control mp\.info\.6/.test(n.requiredAction)) && !mp6.some(n => /productor/.test(n.requiredAction)), mp6.map(n => [n.cause, n.parameterIds, n.requiredAction.slice(0, 40)]));
    check('the catalog is still the product\'s', ncsDe('BAJO', undefined, 'op.nub.1').filter(n => n.cause === 'CATALOG').every(n => /^Declarar en el catálogo/.test(n.requiredAction)));
    const kind = classifyNonConformity({ origin: 'NO_EVIDENCIADA', cause: 'COLLECTION' }, { controlConfigured: false });
    check('the card and the queue classify it «Añadir el control a la configuración» (Responsable ENS)', kind.accion === 'Añadir el control a la configuración' && kind.responsable === 'Responsable ENS');
  }

  console.log('4. Lossless with any text');
  {
    const pieces = ['EV-01 NO_CUMPLE: ', 'EV-11 CUMPLE: ', 'P-02 NO_EVALUABLE: ', ' | ', 'Además: ', ' Además: ', 'texto', 'Frase. ', 'Otra frase', '; ', ' y 3 más', '2026-10-17T06:03:34Z', 'P-02 (nombre)', '[2 máquinas: a (1), b (2)] ', 'Resuelta por la política del control (p), que mide esta evidencia junto a r.1: ', 'Pregunta de auditoría: ', '«x | EV-09 CUMPLE: y»', ' ', '.', 'a; b; c'];
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let malos = 0;
    let example = '';
    for (let i = 0; i < 20000; i++) {
      const n = 1 + Math.floor(random() * 8);
      let t = '';
      for (let k = 0; k < n; k++) t += pieces[Math.floor(random() * pieces.length)];
      const r = parseMotive(t);
      const ok = motiveToText(r) === t && r.parts.every((p: any) => p.summary + (p.detail ? ` ${p.detail}` : '') === p.text && (!p.list || p.text.slice(p.list.start, p.list.end) === p.list.values.join('; ') + (p.list.more !== undefined ? ` y ${p.list.more} más` : '')));
      if (!ok) { malos += 1; example = example || t; }
    }
    check('20,000 random texts with the grammar\'s pieces: all come back exact', malos === 0, { malos, ejemplo: example });
    check('« Además: x» with the leading space does not lose the space', motiveToText(parseMotive('EV-01 CUMPLE:  Además: x')) === 'EV-01 CUMPLE:  Además: x');
    const withSpace = reasonPartsOf([{ id: 'EV-01', medida: { estado: 'CUMPLE', motivo: ' Además: x' } }]);
    check('reasonPartsOf does not split there either', withSpace[0].text === ' Además: x' && withSpace[0].secondary === undefined);
  }

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
