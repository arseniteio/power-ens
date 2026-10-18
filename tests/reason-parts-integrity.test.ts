/**
 * Las partes publicadas de un motivo (`reasonParts`) solo valen para SU motivo
 * (revisión de Task 2, lógica C1 e I1):
 *
 *   npx --yes tsx tests/reason-parts-integrity.test.ts
 *
 *   1. Quien sustituye el motivo de una decisión suelta las partes: recolector
 *      parado (`markPolicyRuntimeStale`), alcance declarado que no nombra a
 *      nadie (`markPolicyRuntimeUnmatchedScope`) y consolidación de máquinas.
 *   2. El analizador solo acepta partes que, unidas, son exactamente el texto;
 *      si no, parte el texto. La tarjeta de un recolector parado dice «Sin datos
 *      del recolector…», nunca los veredictos viejos de otro requisito.
 *   3. Un control que no está en la configuración activa: «… no está en la
 *      configuración activa» y «Añadir con valores por defecto» con cualquier
 *      causa (op.mon.3 sin datos en 034, op.cont.2 en ALTO); un control
 *      configurado con causa CONFIGURATION sin parámetros: «Completar la
 *      configuración obligatoria» (mp.info.6 con P-04 que no nombra a nadie).
 *   4. El analizador no pierde nada con cualquier texto (prueba aleatoria con
 *      las piezas de su gramática, incluido « Además: » al principio).
 */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) fallos.push(n);
};

const h = installReactHarness();
const React = require('react');
const { readFileSync, readdirSync } = require('fs');
const { conPartes, motivoCompuesto, partesDe } = require('../common/ens/core/policy-runtime/policies/policy-kit');
const { markPolicyRuntimeStale } = require('../common/ens/core/evidence/stale-collector');
const { markPolicyRuntimeUnmatchedScope } = require('../common/ens/core/scope/measurement-planes');
const { consolidateAgentComplianceResultByControl } = require('../common/ens/core/compliance-state/consolidation');
const { parseMotive, motiveToText } = require('../public/ens/controls/control-detail/motive-parser');
const { NonConformityCard } = require('../public/ens/controls/control-detail/nonconformity-card');
const { classifyNonConformity } = require('../public/ens/controls/control-detail/nonconformity-class');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { getENSComplianceState } = require('../common/ens/core/ens-engine');

const PUENTE = (req: string) => `Resuelta por la política del control (policy.op.exp.6), que mide esta evidencia junto a ${req}: `;
const propias = [
  { id: 'EV-01', medida: { estado: 'NO_EVALUABLE', motivo: 'P-02 sin configurar.', causa: 'CONFIGURATION' } },
  { id: 'EV-11', medida: { estado: 'NO_CUMPLE', motivo: 'Faltan scripts de respuesta en op.exp.6.1.' } },
];
const decision = (req: string) =>
  conPartes({ policyId: 'policy.op.exp.6', requirementId: req, status: 'NO_CUMPLE', parameterIds: [], evidenceIds: ['EV-11'], eventIds: [], runtimeVariables: [], trace: { ruleId: req, ruleType: 'x', expression: '', expected: '', actual: '', result: false }, reason: motivoCompuesto(propias) }, partesDe(propias));
const STALE = 'Sin datos del recolector desde 2026-10-15 12:47 UTC: el último latido de op.exp.6 en esta máquina tiene más de 24 h y lo que envió entonces no demuestra su estado a fecha de la evaluación.';

(async () => {
  console.log('1. Quien sustituye el motivo suelta las partes');
  const runtime = { policyId: 'policy.op.exp.6', decisions: [decision('op.exp.6.1'), decision('op.exp.6.2')] };
  const parado = markPolicyRuntimeStale(runtime, { since: '2026-10-15T12:47:00Z', reference: 'collector_run', reason: STALE });
  comprueba('recolector parado: motivo nuevo y sin partes', parado.decisions.every((d: any) => d.reason === STALE && d.reasonParts === undefined && d.cause === 'COLLECTION'), parado.decisions.map((d: any) => Object.keys(d)));
  const fuera = markPolicyRuntimeUnmatchedScope(runtime, 'P-04 no declara ninguna máquina…');
  comprueba('alcance que no nombra a nadie: motivo nuevo y sin partes', fuera.decisions.every((d: any) => d.reasonParts === undefined && d.cause === 'CONFIGURATION'));
  comprueba('la decisión original no se toca', runtime.decisions.every((d: any) => d.reasonParts?.length === 2));
  {
    const bloques: Record<string, any> = {};
    readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
      const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
      bloques[b.controlId] = b;
    });
    ensConfigurationRepository.completeHydration({ ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: [JSON.parse(JSON.stringify(bloques['op.exp.6']))] });
    const scope = [{ id: '101', name: 'srv-a', groups: ['ens'], status: 'active' }, { id: '102', name: 'srv-b', groups: ['ens'], status: 'active' }];
    const estado = getENSComplianceState('BAJO', [], undefined, scope, new Date('2026-10-17T12:00:00Z'));
    const agentes = estado.agents.map((a: any) => ({
      ...a,
      results: a.results.map((r: any) => (r.control.id === 'op.exp.6' && r.policyRuntime ? { ...r, policyRuntime: { ...r.policyRuntime, decisions: r.policyRuntime.decisions.map((d: any) => conPartes(d, partesDe(propias))) } } : r)),
    }));
    const conPartesAntes = agentes.flatMap((a: any) => a.results.filter((r: any) => r.control.id === 'op.exp.6').flatMap((r: any) => r.policyRuntime?.decisions || [])).filter((d: any) => d.reasonParts).length;
    const consolidado = consolidateAgentComplianceResultByControl(agentes, 'op.exp.6');
    comprueba('consolidación: las decisiones consolidadas no llevan partes', conPartesAntes > 0 && (consolidado?.policyRuntime?.decisions || []).length > 0 && consolidado.policyRuntime.decisions.every((d: any) => d.reasonParts === undefined), { conPartesAntes });
  }

  console.log('2. El analizador solo acepta partes que son el texto');
  const viejas = { reason: STALE, parts: partesDe(propias) };
  const m = parseMotive(`${PUENTE('op.exp.6.2')}${STALE}`, [viejas]);
  comprueba('partes que no rebuildean el texto: se ignoran (no estructurado) y el texto vuelve exacto', !m.structured && motiveToText(m) === `${PUENTE('op.exp.6.2')}${STALE}` && m.parts.length === 1 && !m.parts[0].evidenceId, m.parts.map((p: any) => p.evidenceId));
  const buenas = parseMotive(`${PUENTE('op.exp.6.1')}${motivoCompuesto(propias)}`, [{ reason: motivoCompuesto(propias), parts: partesDe(propias) }]);
  comprueba('partes que sí son el texto: estructurado', buenas.structured && buenas.parts.length === 2);
  const item = { id: 'NC-2', requirement: 'op.exp.6.2', origin: 'NO_EVIDENCIADA', cause: 'COLLECTION', finding: STALE, impact: 'Cuenta.', requiredAction: 'Restablecer la RECOGIDA.', parameterIds: [], evidenceIds: ['EV-11'] };
  const pantalla = await h.render(() => React.createElement(NonConformityCard, {
    item, clase: classifyNonConformity(item), etiquetaAlcance: 'Sin demostrar en', textoAlcance: 'srv-a (101)',
    lineasMotivo: [{ texto: `${PUENTE('op.exp.6.2')}${STALE}`, etiqueta: 'EV-11' }], evidenciasImplicadas: ['EV-11'], controlId: 'op.exp.6',
    conocidos: [viejas],
  }));
  const titular = h.nodes().find(n => n.type === 'p' && n.props?.title)?.props.title;
  comprueba('la tarjeta de un recolector parado titula «Sin datos del recolector…»', /^Sin datos del recolector desde 2026-10-15 12:47 UTC/.test(titular || ''), titular);
  comprueba('…y no enseña los veredictos viejos (EV-11 NO_CUMPLE, «Faltan scripts»)', !/Faltan scripts/.test(pantalla) && !/\[ NO_CUMPLE \]/.test(pantalla), pantalla.slice(0, 300));

  console.log('3. Control fuera de la configuración activa');
  {
    const bloques: Record<string, any> = {};
    readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
      const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
      bloques[b.controlId] = b;
    });
    const mp = JSON.parse(JSON.stringify(bloques['mp.info.6']));
    mp.parameters.forEach((p: any) => { if (p.required && p.example !== undefined) p.value = p.example; });
    mp.parameters.find((p: any) => p.id === 'P-04').value = ['srv-inexistente | MEDIA'];
    ensConfigurationRepository.completeHydration({ ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: [mp] });
    const scope = [{ id: '101', name: 'srv-a', groups: ['ens'], status: 'active' }, { id: '034', name: 'copias01', groups: ['ens'], status: 'active' }, { id: '000', name: 'm', groups: [], isManager: true }];
    const ncsDe = (nivel: string, agente: string | undefined, control: string) =>
      (getENSComplianceState(nivel, [], agente, scope, new Date('2026-10-17T12:00:00Z')).results.find((r: any) => r.control.id === control)?.nonConformities || []) as any[];
    const mon3 = ncsDe('BAJO', '034', 'op.mon.3');
    comprueba('op.mon.3 sin configurar y sin datos en 034 (COLLECTION): hay no conformidades', mon3.length > 0 && mon3.every(n => n.cause === 'COLLECTION'), mon3.map(n => n.cause));
    comprueba('…con «op.mon.3 no está en la configuración activa» y el dato de la recogida detrás', mon3.every(n => /^op\.mon\.3 no está en la configuración activa/.test(n.finding) && /Además, no ha llegado ningún dato para/.test(n.finding)));
    comprueba('…y la acción «Añadir con valores por defecto», nunca «Restablecer la RECOGIDA»', mon3.every(n => /^Añadir con valores por defecto \(Configuración/.test(n.requiredAction) && !/RECOGIDA/.test(n.requiredAction)));
    const cont2 = ncsDe('ALTO', undefined, 'op.cont.2');
    comprueba('op.cont.2 en ALTO (CONFIGURATION): la misma acción', cont2.length > 0 && cont2.every(n => n.cause === 'CONFIGURATION' && /^Añadir con valores por defecto/.test(n.requiredAction)), cont2.map(n => [n.cause, n.requiredAction.slice(0, 30)]));
    const mp6 = ncsDe('BAJO', undefined, 'mp.info.6');
    comprueba('mp.info.6 configurado, P-04 sin ninguna máquina conocida (CONFIGURATION sin parámetros): «Completar la configuración obligatoria»',
      mp6.length > 0 && mp6.every(n => n.cause === 'CONFIGURATION' && !n.parameterIds.length && /^Completar la configuración obligatoria del control mp\.info\.6/.test(n.requiredAction)) && !mp6.some(n => /productor/.test(n.requiredAction)), mp6.map(n => [n.cause, n.parameterIds, n.requiredAction.slice(0, 40)]));
    comprueba('el catálogo sigue siendo del producto', ncsDe('BAJO', undefined, 'op.nub.1').filter(n => n.cause === 'CATALOG').every(n => /^Declarar en el catálogo/.test(n.requiredAction)));
    const clase = classifyNonConformity({ origin: 'NO_EVIDENCIADA', cause: 'COLLECTION' }, { controlConfigured: false });
    comprueba('la tarjeta y la cola lo clasifican «Añadir el control a la configuración» (Responsable ENS)', clase.accion === 'Añadir el control a la configuración' && clase.responsable === 'Responsable ENS');
  }

  console.log('4. Sin pérdida con cualquier texto');
  {
    const piezas = ['EV-01 NO_CUMPLE: ', 'EV-11 CUMPLE: ', 'P-02 NO_EVALUABLE: ', ' | ', 'Además: ', ' Además: ', 'texto', 'Frase. ', 'Otra frase', '; ', ' y 3 más', '2026-10-17T06:03:34Z', 'P-02 (nombre)', '[2 máquinas: a (1), b (2)] ', 'Resuelta por la política del control (p), que mide esta evidencia junto a r.1: ', 'Pregunta de auditoría: ', '«x | EV-09 CUMPLE: y»', ' ', '.', 'a; b; c'];
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
    let malos = 0;
    let ejemplo = '';
    for (let i = 0; i < 20000; i++) {
      const n = 1 + Math.floor(azar() * 8);
      let t = '';
      for (let k = 0; k < n; k++) t += piezas[Math.floor(azar() * piezas.length)];
      const r = parseMotive(t);
      const ok = motiveToText(r) === t && r.parts.every((p: any) => p.summary + (p.detail ? ` ${p.detail}` : '') === p.text && (!p.list || p.text.slice(p.list.start, p.list.end) === p.list.values.join('; ') + (p.list.more !== undefined ? ` y ${p.list.more} más` : '')));
      if (!ok) { malos += 1; ejemplo = ejemplo || t; }
    }
    comprueba('20.000 textos al azar con las piezas de la gramática: todos vuelven exactos', malos === 0, { malos, ejemplo });
    comprueba('« Además: x» con el espacio al principio no pierde el espacio', motiveToText(parseMotive('EV-01 CUMPLE:  Además: x')) === 'EV-01 CUMPLE:  Además: x');
    const conEspacio = partesDe([{ id: 'EV-01', medida: { estado: 'CUMPLE', motivo: ' Además: x' } }]);
    comprueba('partesDe tampoco parte ahí', conEspacio[0].text === ' Además: x' && conEspacio[0].secondary === undefined);
  }

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
