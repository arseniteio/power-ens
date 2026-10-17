/**
 * La causa del hueco llega intacta: de quien la sabe, a la evidencia y al
 * requisito.
 *
 *     npx tsx tests/declared-gap-cause.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * POR QUÉ. Medido con datos reales (26/09/2026), una decena de requisitos de
 * op.exp.5, 7, 8, 9 y 10 salían con causa EVIDENCE («ha llegado sin datos
 * suficientes») cuando el recolector había dicho en su `evidence_state` que lo
 * que faltaba era el registro que la organización no mantiene o las reglas de
 * auditd sin cargar: `causa=CONFIGURATION`. Y op.exp.5.3 y op.exp.6.3 salían
 * COLLECTION («no ha llegado nada») cuando lo que faltaba era P-05 sin
 * declarar. Dos fallos en el mismo sitio:
 *
 *   1. el motor ponía EVIDENCE a todo `evidence_state` NO_EVALUABLE sin leer
 *      su `causa`;
 *   2. una policy no tenía por dónde decir la causa: la evidencia que ella
 *      rellenaba se quedaba con la del modelo clásico, que no ve sus hechos.
 *
 * Una misma máquina mal configurada y un agente caído puntúan igual y se
 * arreglan en sitios distintos: la causa es la acción.
 */
import { opExp5CatalogDefinition } from '../common/ens/catalog/op-exp-5';
import { opExp5Configuration } from '../common/ens/configuration/data/op-exp-5-parameters';
import { opExp8Configuration } from '../common/ens/configuration/data/op-exp-8-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import type { ENSPolicyDecision } from '../common/ens/core/policy-runtime/types';
import type { ENSComplianceStatus, ENSGapCause } from '../common/ens/core/evaluation/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

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

const AHORA = new Date('2026-09-26T23:34:23Z');

let contador = 0;

const alerta = (control: string, agente: { id: string; name: string }, data: Record<string, unknown>) => {
  contador += 1;

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': '2026-09-26T23:26:50.000Z',
      agent: agente,
      rule: { id: '110950', description: control },
      data: Object.fromEntries(Object.entries({ ensfacil: control, ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const MANAGER = { id: '000', name: 'Wazuh-4' };
const REAL = { id: '024', name: 'wazuh-real' };

const decision = (
  requisito: string,
  estado: ENSComplianceStatus,
  evidencias: string[],
  causa?: ENSGapCause
): ENSPolicyDecision => ({
  policyId: 'policy.prueba',
  requirementId: requisito,
  status: estado,
  parameterIds: [],
  evidenceIds: evidencias,
  eventIds: [],
  runtimeVariables: [],
  trace: { ruleId: requisito, ruleType: 'COVERAGE_REQUIRED', expression: '', expected: '', actual: estado, result: false },
  reason: 'motivo de la policy',
  ...(causa ? { cause: causa } : {}),
});

// --- 1. el motor lee la causa del recolector --------------------------------

bloque('1. Un evidence_state NO_EVALUABLE llega con la causa que declara el recolector');

{
  // El hecho REAL del manager: no existe el registro de revisiones.
  const eventos = normalizeWazuhAlerts([
    alerta('op.exp.8', MANAGER, {
      event: 'evidence_state', evidence_id: 'EV-05', requisito: 'op.exp.8.r1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION',
      motivo: 'no existe el registro de revisiones de los registros /etc/ensfacil/log-review-register.tsv: no consta donde anota la organizacion sus revisiones',
    }),
  ]);
  const ev05 = resolveEvidenceForControl('op.exp.8', eventos, '000', 'MEDIO', opExp8Configuration, AHORA).find(e => e.id === 'EV-05');
  comprueba('registro ausente, causa=CONFIGURATION → gapCause CONFIGURATION (antes EVIDENCE)', ev05?.status === 'NO_EVALUABLE' && ev05?.gapCause === 'CONFIGURATION', `${ev05?.status} ${ev05?.gapCause}`);

  const leida = normalizeWazuhAlerts([
    alerta('op.exp.8', MANAGER, { event: 'evidence_state', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'collection', motivo: 'no se puede leer' }),
  ]);
  comprueba(
    'la causa se lee sin distinguir mayúsculas (collection → COLLECTION)',
    resolveEvidenceForControl('op.exp.8', leida, '000', 'MEDIO', opExp8Configuration, AHORA).find(e => e.id === 'EV-05')?.gapCause === 'COLLECTION'
  );

  const sinCausa = normalizeWazuhAlerts([
    alerta('op.exp.8', MANAGER, { event: 'evidence_state', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', motivo: 'algo' }),
  ]);
  comprueba(
    'sin causa declarada sigue siendo EVIDENCE: el dato llegó y no basta',
    resolveEvidenceForControl('op.exp.8', sinCausa, '000', 'MEDIO', opExp8Configuration, AHORA).find(e => e.id === 'EV-05')?.gapCause === 'EVIDENCE'
  );

  const rara = normalizeWazuhAlerts([
    alerta('op.exp.8', MANAGER, { event: 'evidence_state', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'CATALOG', motivo: 'x' }),
  ]);
  comprueba(
    'CATALOG no es una causa de evidencia: se ignora (EVIDENCE)',
    resolveEvidenceForControl('op.exp.8', rara, '000', 'MEDIO', opExp8Configuration, AHORA).find(e => e.id === 'EV-05')?.gapCause === 'EVIDENCE'
  );
}

// --- 2. el puente lleva la causa de la policy -------------------------------

bloque('2. La evidencia que rellena una policy lleva la causa que la policy declara');

// op.exp.5.3 en wazuh-real: EV-05 no tiene ningún hecho del modelo clásico
// (COLLECTION) y la policy sabe que lo que falta es P-05.
const hechos5 = normalizeWazuhAlerts([
  alerta('op.exp.5', REAL, { event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-01,EV-02' }),
]);
const clasicas = resolveEvidenceForControl('op.exp.5', hechos5, '024', 'MEDIO', opExp5Configuration, AHORA);

{
  comprueba('punto de partida: el modelo clásico dice COLLECTION para EV-05', clasicas.find(e => e.id === 'EV-05')?.gapCause === 'COLLECTION', clasicas.find(e => e.id === 'EV-05')?.gapCause);

  const decisiones = [
    decision('op.exp.5.3', 'NO_EVALUABLE', ['EV-05'], 'CONFIGURATION'),
    decision('op.exp.5.3', 'NO_EVALUABLE', ['EV-05'], 'CONFIGURATION'),
  ];
  const tabla = applyPolicyDecisionsToEvidences(clasicas, decisiones, opExp5CatalogDefinition.requirements);
  comprueba('con la causa de la policy, EV-05 sale CONFIGURATION', tabla.find(e => e.id === 'EV-05')?.gapCause === 'CONFIGURATION', tabla.find(e => e.id === 'EV-05')?.gapCause);

  const mixta = applyPolicyDecisionsToEvidences(
    clasicas,
    [decision('op.exp.5.1', 'NO_EVALUABLE', ['EV-01', 'EV-02'], 'EVIDENCE'), decision('op.exp.5.1', 'NO_EVALUABLE', ['EV-02'], 'CONFIGURATION')],
    opExp5CatalogDefinition.requirements
  );
  comprueba('manda la decisión que nombra SOLO a esa evidencia', mixta.find(e => e.id === 'EV-02')?.gapCause === 'CONFIGURATION', mixta.find(e => e.id === 'EV-02')?.gapCause);

  const muda = applyPolicyDecisionsToEvidences(clasicas, [decision('op.exp.5.3', 'NO_EVALUABLE', ['EV-05'])], opExp5CatalogDefinition.requirements);
  comprueba('una policy que no declara causa no cambia la que había (las de los controles anteriores)', muda.find(e => e.id === 'EV-05')?.gapCause === 'COLLECTION', muda.find(e => e.id === 'EV-05')?.gapCause);

  const nada = applyPolicyDecisionsToEvidences(clasicas, decisiones, opExp5CatalogDefinition.requirements, true);
  comprueba('si de la máquina no ha llegado NADA del control, el hueco es de recogida (COLLECTION)', nada.find(e => e.id === 'EV-05')?.gapCause === 'COLLECTION', nada.find(e => e.id === 'EV-05')?.gapCause);
}

// --- 3. y llega a la no conformidad -----------------------------------------

bloque('3. La causa llega a la no conformidad del requisito');

{
  const runtime = (decisiones: ENSPolicyDecision[]) => ({
    controlId: 'op.exp.5',
    policyId: 'policy.prueba',
    evaluatedAt: AHORA.toISOString(),
    decisions: decisiones,
    appliedParameters: [],
    runtimeVariables: [],
  });
  const decisiones = [decision('op.exp.5.3', 'NO_EVALUABLE', ['EV-05'], 'CONFIGURATION')];

  const conHechos = evaluateENSControl(opExp5CatalogDefinition, opExp5Configuration, 'MEDIO', clasicas, runtime(decisiones), hechos5);
  const nc = conHechos.nonConformities.find(n => n.requirementId === 'op.exp.5.3');
  comprueba('op.exp.5.3 con el recolector informando y P-05 sin declarar → NC CONFIGURATION (antes COLLECTION)', nc?.cause === 'CONFIGURATION', `${nc?.origin} ${nc?.cause}`);

  const sinHechos = evaluateENSControl(
    opExp5CatalogDefinition,
    opExp5Configuration,
    'MEDIO',
    resolveEvidenceForControl('op.exp.5', [], '028', 'MEDIO', opExp5Configuration, AHORA),
    runtime(decisiones),
    []
  );
  const nc2 = sinHechos.nonConformities.find(n => n.requirementId === 'op.exp.5.3');
  comprueba('REVERSIÓN: la misma decisión en una máquina de la que no llega nada → COLLECTION', nc2?.cause === 'COLLECTION', `${nc2?.origin} ${nc2?.cause}`);
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
