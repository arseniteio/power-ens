/**
 * La marca `documental` en las policies de los controles nuevos.
 *
 *     npx --yes tsx tests/documentary-adoption.test.ts
 *
 * La regla (integración 10/10): lleva `documental` toda decisión que sale SOLO
 * de las tablas de la pantalla, sin hechos. Lo que sale de los hechos del
 * recolector —también de un registro TSV que el recolector lee— NO es
 * documental: con el recolector parado no demuestra nada.
 *
 * Un control por bloque, con lo que el motor hace en la fila de una máquina con
 * el recolector parado (`markEvidencesStale` + `markPolicyRuntimeStale`, como
 * `ens-engine.ts`):
 *
 *   1. op.cont.2: todas sus decisiones son documentales. Un contrato vencido
 *      sigue siendo NO_CUMPLE con el recolector parado y con el alcance sin
 *      máquinas, y su no conformidad manda a renovar la documentación.
 *   2. op.mon.1: R2 (P-05) es documental. Su CUMPLE acreditado y su
 *      NO_EVALUABLE por CONFIGURATION sobreviven al recolector parado; una
 *      decisión técnica del mismo control pasa a RECOGIDA (la reversión).
 *   3. op.mon.2 y op.cont.3: ninguna decisión es documental, porque todas
 *      pasan por un registro que lee el recolector; con el recolector parado
 *      quedan sin medir por RECOGIDA.
 */
import { opCont2PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-cont-2.policy';
import { opMon1PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-mon-1.policy';
import { opMon2PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-mon-2.policy';
import { opCont3PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-cont-3.policy';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { opCont2CatalogDefinition } from '../public/ens/catalog/op-cont-2';
import { opMon1CatalogDefinition } from '../public/ens/catalog/op-mon-1';
import { opMon2CatalogDefinition } from '../public/ens/catalog/op-mon-2';
import { opCont3CatalogDefinition } from '../public/ens/catalog/op-cont-3';
import { opCont2Configuration } from '../public/ens/configuration/data/op-cont-2-parameters';
import { opMon1Configuration } from '../public/ens/configuration/data/op-mon-1-parameters';
import { opMon2Configuration } from '../public/ens/configuration/data/op-mon-2-parameters';
import { opCont3Configuration } from '../public/ens/configuration/data/op-cont-3-parameters';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { controlExpectsFacts } from '../public/ens/core/evidence/registry';
import { markEvidencesStale, markPolicyRuntimeStale } from '../public/ens/core/evidence/stale-collector';
import type { ENSStaleCollector } from '../public/ens/core/evidence/stale-collector';
import { markPolicyRuntimeUnmatchedScope } from '../public/ens/core/scope/measurement-planes';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../public/ens/configuration/services/attestation-service';
import type { ENSControlDefinition } from '../public/ens/catalog/types';
import type { ENSControlConfiguration, ENSLevel } from '../public/ens/configuration/types';
import type { ENSPolicyDefinition, ENSPolicyRuntimeResult } from '../public/ens/core/policy-runtime/types';

declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (nombre: string, condicion: boolean, detalle: unknown = ''): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle !== '' ? ` — ${String(detalle)}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

const AHORA = new Date('2026-10-09T12:00:00Z');

const PARADO: ENSStaleCollector = {
  since: '2026-10-07T10:00:00Z',
  reference: 'collector_run',
  reason: 'Sin datos del recolector desde el 2026-10-07 10:00 UTC.',
};

type Valores = Record<string, string[] | string | undefined>;

const configuracion = (base: ENSControlConfiguration, valores: Valores): ENSControlConfiguration => ({
  ...base,
  parameters: base.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    // Un parámetro vacío es la clave `value` AUSENTE, nunca `null`.
    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

// El camino del motor para la fila de una máquina, sin hechos, con y sin el
// recolector parado.
const evalua = (
  control: ENSControlDefinition,
  politica: ENSPolicyDefinition,
  cfg: ENSControlConfiguration,
  nivel: ENSLevel,
  marca?: 'parado' | 'sin-alcance'
) => {
  const evidencias = resolveEvidenceForControl(control.id, [], '000', nivel, cfg, AHORA);
  const contexto = buildPolicyContext(control, cfg, nivel, [], evidencias, AHORA);
  const { decisions, runtimeVariables } = politica.evaluator!(contexto);
  const original: ENSPolicyRuntimeResult = {
    controlId: control.id,
    policyId: politica.id,
    evaluatedAt: AHORA.toISOString(),
    decisions,
    appliedParameters: [],
    runtimeVariables,
  };
  const runtime =
    marca === 'parado'
      ? markPolicyRuntimeStale(original, PARADO)!
      : marca === 'sin-alcance'
      ? markPolicyRuntimeUnmatchedScope(original, 'Ninguna máquina del alcance.')!
      : original;
  const tablaBase = marca === 'parado' ? markEvidencesStale(evidencias, PARADO) : evidencias;
  const tabla = applyPolicyDecisionsToEvidences(tablaBase, runtime.decisions, control.requirements, controlExpectsFacts(control.id));
  const atestaciones = parseRequirementAttestations(cfg);
  const requisito = (id: string) =>
    evaluateRequirement(control.requirements.find(q => q.id === id)!, nivel, tabla, false, runtime.decisions, 'ACTIVE', atestaciones.get(id));
  const decision = (id: string) => runtime.decisions.find(d => d.requirementId === id && d.trace.ruleId === id);
  const motor = () => evaluateENSControl(control, cfg, nivel, tablaBase, runtime, [], controlExpectsFacts(control.id));

  return { decisions: runtime.decisions, original: decisions, requisito, decision, motor };
};

// --- 1. op.cont.2 ------------------------------------------------------------

bloque('1. op.cont.2: todo documental; un contrato vencido sigue vencido');

{
  // Lo de op-cont-2-judgment, con el contrato del CPD alternativo vencido el
  // 30/06/2026.
  const VALORES: Valores = {
    'P-01': ['Plan de Continuidad del Servicio | v3.0 | 2026-01-15 | Comité de Seguridad | Responsable de Seguridad'],
    'P-02': ['sede electrónica | 4 h | 1 h | srv-web, srv-bd'],
    'P-03': ['coordinador de crisis | A. Martínez | J. Ruiz | activar el plan y convocar al comité de crisis'],
    'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 2026-06-30 | 48 h'],
    'P-05': [
      'A. Martínez | coordinación de crisis | 2026-02-10 | 2027-02-10',
      'J. Ruiz | coordinación de crisis (suplente) | 2026-02-10 | 2027-02-10',
    ],
    'P-06': ['Plan de Emergencia del edificio'],
    'P-08': '12',
  };
  const cfg = configuracion(opCont2Configuration, VALORES);
  const sano = evalua(opCont2CatalogDefinition, opCont2PolicyDefinition, cfg, 'ALTO');
  const parado = evalua(opCont2CatalogDefinition, opCont2PolicyDefinition, cfg, 'ALTO', 'parado');
  const sinAlcance = evalua(opCont2CatalogDefinition, opCont2PolicyDefinition, cfg, 'ALTO', 'sin-alcance');

  comprueba('todas sus decisiones llevan `documental`', sano.original.length > 0 && sano.original.every(d => d.documental === true));
  comprueba('el contrato vencido da NO_CUMPLE en op.cont.2.3', sano.requisito('op.cont.2.3').status === 'NO_CUMPLE', sano.requisito('op.cont.2.3').status);
  comprueba(
    'con el recolector parado, sigue NO_CUMPLE (y documental)',
    parado.decision('op.cont.2.3')?.status === 'NO_CUMPLE' &&
      parado.requisito('op.cont.2.3').status === 'NO_CUMPLE' &&
      parado.requisito('op.cont.2.3').documental === true,
    `${parado.decision('op.cont.2.3')?.status} ${parado.requisito('op.cont.2.3').status}`
  );
  comprueba(
    'con el alcance sin máquinas, también',
    sinAlcance.decision('op.cont.2.3')?.status === 'NO_CUMPLE' && sinAlcance.requisito('op.cont.2.3').status === 'NO_CUMPLE',
    sinAlcance.decision('op.cont.2.3')?.status
  );
  comprueba(
    'y el CUMPLE acreditado de los demás también sobrevive',
    parado.requisito('op.cont.2.1').status === 'CUMPLE' && parado.requisito('op.cont.2.1').attested === true,
    parado.requisito('op.cont.2.1').status
  );

  const nc = parado.motor().nonConformities.find(n => n.requirementId === 'op.cont.2.3');

  comprueba(
    'su no conformidad es documental y manda a renovar la documentación',
    nc?.documental === true && /^Renovar o completar la documentación/.test(nc?.requiredAction || ''),
    `${nc?.documental} ${nc?.requiredAction}`
  );
}

// --- 2. op.mon.1 -------------------------------------------------------------

bloque('2. op.mon.1: R2 (P-05) documental; lo técnico no');

{
  const COMPLETA: Valores = { 'P-05': ['intrusión en servidor | PR-18 Respuesta a intrusión | Responsable de Seguridad'] };
  const A_MEDIAS: Valores = { 'P-05': ['intrusión en servidor | PR-18 Respuesta a intrusión | '] };
  const completa = configuracion(opMon1Configuration, COMPLETA);
  const aMedias = configuracion(opMon1Configuration, A_MEDIAS);

  const sano = evalua(opMon1CatalogDefinition, opMon1PolicyDefinition, completa, 'ALTO');

  comprueba(
    'la decisión de R2 lleva `documental`',
    sano.original.find(d => d.requirementId === 'op.mon.1.r2.1' && d.trace.ruleId === 'op.mon.1.r2.1')?.documental === true
  );
  comprueba(
    'las técnicas no (op.mon.1.1, op.mon.1.r1.1)',
    sano.original.filter(d => ['op.mon.1.1', 'op.mon.1.r1.1'].includes(d.requirementId)).every(d => d.documental !== true)
  );

  const parado = evalua(opMon1CatalogDefinition, opMon1PolicyDefinition, completa, 'ALTO', 'parado');

  comprueba(
    'con el recolector parado, R2 sigue CUMPLE acreditado documentalmente',
    parado.requisito('op.mon.1.r2.1').status === 'CUMPLE' && parado.requisito('op.mon.1.r2.1').attested === true,
    parado.requisito('op.mon.1.r2.1').status
  );

  const paradoAMedias = evalua(opMon1CatalogDefinition, opMon1PolicyDefinition, aMedias, 'ALTO', 'parado');

  comprueba(
    'con P-05 a medias y el recolector parado, R2 sigue sin medir por CONFIGURATION (no por RECOGIDA)',
    paradoAMedias.decision('op.mon.1.r2.1')?.status === 'NO_EVALUABLE' && paradoAMedias.decision('op.mon.1.r2.1')?.cause === 'CONFIGURATION',
    `${paradoAMedias.decision('op.mon.1.r2.1')?.status} ${paradoAMedias.decision('op.mon.1.r2.1')?.cause}`
  );
  comprueba(
    'REVERSIÓN: la decisión técnica op.mon.1.1 pasa a RECOGIDA',
    parado.decision('op.mon.1.1')?.status === 'NO_EVALUABLE' && parado.decision('op.mon.1.1')?.cause === 'COLLECTION',
    `${parado.decision('op.mon.1.1')?.status} ${parado.decision('op.mon.1.1')?.cause}`
  );
}

// --- 3. op.mon.2 y op.cont.3 -------------------------------------------------

bloque('3. op.mon.2 y op.cont.3: todo pasa por un registro que lee el recolector');

{
  const casos: [string, ENSControlDefinition, ENSPolicyDefinition, ENSControlConfiguration][] = [
    ['op.mon.2', opMon2CatalogDefinition, opMon2PolicyDefinition, opMon2Configuration],
    ['op.cont.3', opCont3CatalogDefinition, opCont3PolicyDefinition, opCont3Configuration],
  ];

  casos.forEach(([id, control, politica, cfg]) => {
    const sano = evalua(control, politica, cfg, 'ALTO');
    const parado = evalua(control, politica, cfg, 'ALTO', 'parado');

    comprueba(`${id} · emite decisiones y ninguna lleva \`documental\``, sano.original.length > 0 && sano.original.every(d => d.documental !== true));
    comprueba(
      `${id} · con el recolector parado, las que no son NO_APLICA quedan sin medir por RECOGIDA`,
      parado.decisions.filter(d => d.status !== 'NO_APLICA').every(d => d.status === 'NO_EVALUABLE' && d.cause === 'COLLECTION'),
      parado.decisions.filter(d => d.status !== 'NO_APLICA').map(d => `${d.trace.ruleId}:${d.status}:${d.cause}`).join(', ')
    );
  });
}

// ---------------------------------------------------------------------------

if (fallos.length) {
  console.log(`\n${fallos.length} comprobación(es) fallan:\n  - ${fallos.join('\n  - ')}`);
  process.exit(1);
}

console.log('\nTodas las comprobaciones pasan.');
