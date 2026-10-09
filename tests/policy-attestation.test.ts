/**
 * Acreditado documentalmente por la POLICY: `attested` en `ENSPolicyDecision`.
 *
 *     npx --yes tsx tests/policy-attestation.test.ts
 *
 * POR QUÉ EXISTE. `P-ATT` acredita con un documento, pero solo en requisitos
 * sin ninguna evidencia y SIN CADUCIDAD: un plan de continuidad de 2019 con su
 * enlace acreditaría hoy. op.nub.1, op.cont.2 y op.mon.1 R2 necesitan juzgar
 * tablas declaradas en pantalla CON SU VIGENCIA (contratos, certificaciones,
 * planes, formación) sin presentarlas como medidas. Eso lo decide la policy y
 * lo marca con `attested` (decisión 1 del responsable, 09/10/2026).
 *
 * Lo que se prueba, con su reversión al lado:
 *
 *   1. una decisión CUMPLE con `attested` cumple MARCADA como documental;
 *   2. UNA MEDIDA EN CONTRA MANDA SIEMPRE: una evidencia del requisito en
 *      NO_CUMPLE o PARCIAL, o una decisión de la policy en contra para el mismo
 *      requisito, deja el requisito en NO_CUMPLE y sin la marca;
 *   3. `attested` con cualquier estado que no sea CUMPLE no acredita nada;
 *   4. el motor entero (puente incluido) y la consolidación entre máquinas
 *      conservan la marca solo donde el conjunto cumple;
 *   5. el detalle del control y el informe lo dicen como «acreditado
 *      documentalmente».
 *
 * Imports desde el FICHERO, nunca desde un barrel de alto nivel (el ciclo del
 * TDZ de `Settings`).
 */
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { consolidateAgentComplianceResultByControl } from '../public/ens/core/compliance-state/consolidation';
import type { ENSAgentComplianceState } from '../public/ens/core/compliance-state/types';
import type {
  ENSPolicyDecision,
  ENSPolicyRuntimeResult,
} from '../public/ens/core/policy-runtime/types';
import { opAcc1CatalogDefinition } from '../public/ens/catalog/op-acc-1';
import { opAcc1Configuration } from '../public/ens/configuration/data/op-acc-1-parameters';
import type { ENSControlDefinition } from '../public/ens/catalog/types';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../public/ens/configuration/types';
import type { ENSComplianceStatus } from '../public/ens/core/evaluation/types';
import type { ENSEvidenceResolved } from '../public/ens/core/evidence/types';
import { getEvidenceDefinitions } from '../public/ens/core/evidence/registry';
import { etiquetaDeRequisitoQueCumple } from '../public/ens/controls/control-detail/general-view';
import { ensRequirementProofLabel } from '../public/ens/reports/report-rows';

declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (nombre: string, condicion: boolean, detalle: string = ''): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

const CONTROL: ENSControlDefinition = opAcc1CatalogDefinition;

const requisito = (id: string) => {
  const encontrado = CONTROL.requirements.find(item => item.id === id);

  if (!encontrado) {
    throw new Error(`fixture rota: ${id} no está en el catálogo`);
  }

  return encontrado;
};

const evidencia = (id: string, status: ENSComplianceStatus, observations: string[] = []): ENSEvidenceResolved => {
  const definicion = getEvidenceDefinitions('op.acc.1').find(item => item.id === id);

  if (!definicion) {
    throw new Error(`fixture rota: ${id}`);
  }

  return { ...definicion, status, observations } as ENSEvidenceResolved;
};

const decision = (
  requisitoId: string,
  status: ENSComplianceStatus,
  extra: Partial<ENSPolicyDecision> = {}
): ENSPolicyDecision => ({
  policyId: 'prueba',
  requirementId: requisitoId,
  status,
  parameterIds: [],
  evidenceIds: [],
  eventIds: [],
  runtimeVariables: [],
  trace: {
    ruleId: requisitoId,
    ruleType: 'MAX_AGE',
    expression: 'prueba',
    expected: 'prueba',
    actual: status,
    result: status === 'CUMPLE',
  },
  reason: 'Plan de continuidad v4 aprobado el 2026-03-01, dentro de la periodicidad de 12 meses',
  ...extra,
});

// op.acc.1.2 se demuestra con EV-05 y EV-06: un requisito CON evidencias, que es
// justo donde `P-ATT` no puede entrar y `attested` sí.
const REQ = 'op.acc.1.2';

const juzga = (
  evidencias: ENSEvidenceResolved[],
  decisiones: ENSPolicyDecision[],
  requisitoId: string = REQ,
  estadoControl: ENSControlDefinition['status'] = 'ACTIVE',
  nivel: 'BAJO' | 'MEDIO' | 'ALTO' = 'MEDIO'
) => evaluateRequirement(requisito(requisitoId), nivel, evidencias, false, decisiones, estadoControl);

const ACREDITA = decision(REQ, 'CUMPLE', { attested: true });

// --- 1. la declaración acredita, marcada ----------------------------------

bloque('1. Una decisión CUMPLE con `attested` cumple marcada como documental');

{
  const r = juzga([evidencia('EV-05', 'CUMPLE'), evidencia('EV-06', 'NO_EVALUABLE')], [ACREDITA]);

  comprueba('CUMPLE', r.status === 'CUMPLE', r.status);
  comprueba('marcado como acreditado documentalmente', r.attested === true, String(r.attested));
  comprueba('demostrado (con la prueba que el ENS pide)', r.evidenced === true, String(r.evidenced));
  comprueba('con su puntuación', r.score === 100, String(r.score));
  comprueba(
    'el motivo dice que es documental y lleva la declaración',
    (r.observations[0] || '').startsWith('Acreditado documentalmente: ') &&
      (r.observations[0] || '').includes('Plan de continuidad v4'),
    r.observations[0]
  );
  comprueba('conserva las evidencias del catálogo', r.evidenceIds.join(',') === 'EV-05,EV-06', r.evidenceIds.join(','));

  // La reversión: la MISMA decisión sin la marca es una medida de la policy.
  const sinMarca = juzga([evidencia('EV-05', 'CUMPLE'), evidencia('EV-06', 'NO_EVALUABLE')], [decision(REQ, 'CUMPLE')]);

  comprueba(
    'la reversión: sin `attested`, cumple como medido y sin la marca',
    sinMarca.status === 'CUMPLE' && sinMarca.attested !== true,
    `${sinMarca.status} attested=${sinMarca.attested}`
  );

  // Un motivo que ya lo dice no se duplica.
  const yaLoDice = juzga([], [decision(REQ, 'CUMPLE', { attested: true, reason: 'Acreditado documentalmente: contrato vigente' })]);

  comprueba(
    'un motivo que ya empieza por «Acreditado documentalmente» no se duplica',
    yaLoDice.observations[0] === 'Acreditado documentalmente: contrato vigente',
    yaLoDice.observations[0]
  );

  // Un requisito SIN evidencias (op.acc.1.5) también se puede acreditar por la
  // policy: es el caso de las tablas con vigencia que P-ATT no vigila.
  const sinEvidencias = juzga([], [decision('op.acc.1.5', 'CUMPLE', { attested: true })], 'op.acc.1.5');

  comprueba(
    'en un requisito sin evidencias también acredita',
    sinEvidencias.status === 'CUMPLE' && sinEvidencias.attested === true,
    `${sinEvidencias.status} attested=${sinEvidencias.attested}`
  );
}

// --- 1 bis. lo que queda sin medir se dice ---------------------------------

bloque('1 bis. Acreditado, pero lo que queda sin medir se dice');

{
  const sinMedir = { ...evidencia('EV-06', 'NO_EVALUABLE', ['no ha llegado nada del recolector']), gapCause: 'COLLECTION' as const };
  const r = juzga([evidencia('EV-05', 'CUMPLE'), sinMedir], [ACREDITA]);

  comprueba(
    'la primera observación sigue siendo la acreditación',
    (r.observations[0] || '').startsWith('Acreditado documentalmente: '),
    r.observations[0]
  );
  comprueba(
    'y detrás, la evidencia sin medir con su causa',
    r.observations.includes('EV-06 sin medir (sin recogida)'),
    r.observations.join(' | ')
  );
  comprueba(
    'la que sí se midió no se nombra como sin medir',
    !r.observations.some(o => o.startsWith('EV-05 sin medir')),
    r.observations.join(' | ')
  );

  // Sin causa declarada, se dice igual, sin paréntesis.
  const sinCausa = juzga([evidencia('EV-05', 'NO_EVALUABLE')], [ACREDITA]);

  comprueba(
    'sin causa declarada: «EV-05 sin medir»',
    sinCausa.observations.includes('EV-05 sin medir'),
    sinCausa.observations.join(' | ')
  );
}

// --- 2. una medida en contra manda ------------------------------------------

bloque('2. Una medida en contra manda siempre sobre la acreditación');

{
  const casos: [string, ENSEvidenceResolved[], ENSPolicyDecision[]][] = [
    ['una evidencia del requisito en NO_CUMPLE', [evidencia('EV-05', 'NO_CUMPLE', ['cuenta genérica «admin» activa']), evidencia('EV-06', 'CUMPLE')], [ACREDITA]],
    ['una evidencia del requisito en PARCIAL', [evidencia('EV-05', 'CUMPLE'), evidencia('EV-06', 'PARCIAL')], [ACREDITA]],
    [
      'una evidencia que nombra la decisión, aunque no sea del requisito',
      [evidencia('EV-05', 'CUMPLE'), evidencia('EV-06', 'CUMPLE'), evidencia('EV-07', 'NO_CUMPLE')],
      [decision(REQ, 'CUMPLE', { attested: true, evidenceIds: ['EV-07'] })],
    ],
    [
      'otra decisión de la policy en contra para el mismo requisito',
      [evidencia('EV-05', 'CUMPLE'), evidencia('EV-06', 'CUMPLE')],
      [ACREDITA, decision(REQ, 'NO_CUMPLE', { evidenceIds: ['EV-06'], reason: 'EV-06: sin MFA en 2 cuentas' })],
    ],
  ];

  for (const [nombre, evidencias, decisiones] of casos) {
    const r = juzga(evidencias, decisiones);

    comprueba(
      `${nombre}: NO_CUMPLE y sin la marca`,
      r.status === 'NO_CUMPLE' && r.attested !== true,
      `${r.status} attested=${r.attested}`
    );

    comprueba(`${nombre}: cuenta como medido, no como hueco`, r.evidenced === true, String(r.evidenced));

    comprueba(
      `${nombre}: el motivo dice que manda la medida`,
      r.observations.some(o => o.startsWith('La medida manda sobre la acreditación documental')),
      r.observations.join(' | ')
    );
  }

  const conMotivo = juzga([evidencia('EV-05', 'NO_CUMPLE', ['cuenta genérica «admin» activa']), evidencia('EV-06', 'CUMPLE')], [ACREDITA]);

  comprueba(
    'y conserva el motivo de la evidencia que falla',
    conMotivo.observations.includes('cuenta genérica «admin» activa'),
    conMotivo.observations.join(' | ')
  );

  // Las reversiones: lo que NO es una medida en contra no lo impide.
  const hueco = juzga([evidencia('EV-05', 'NO_EVALUABLE'), evidencia('EV-06', 'NO_EVALUABLE')], [ACREDITA]);

  comprueba(
    'la reversión: evidencias sin medir (NO_EVALUABLE) no lo impiden',
    hueco.status === 'CUMPLE' && hueco.attested === true,
    `${hueco.status} attested=${hueco.attested}`
  );

  const otroRequisito = juzga(
    [evidencia('EV-05', 'CUMPLE'), evidencia('EV-06', 'CUMPLE'), evidencia('EV-04', 'NO_CUMPLE')],
    [ACREDITA, decision('op.acc.1.4', 'NO_CUMPLE', { evidenceIds: ['EV-04'] })]
  );

  comprueba(
    'la reversión: una medida en contra de OTRO requisito no lo impide',
    otroRequisito.status === 'CUMPLE' && otroRequisito.attested === true,
    `${otroRequisito.status} attested=${otroRequisito.attested}`
  );
}

// --- 3. solo con CUMPLE --------------------------------------------------

bloque('3. `attested` con otro estado no acredita nada');

{
  const noCumple = juzga([], [decision(REQ, 'NO_CUMPLE', { attested: true, reason: 'plan caducado el 2025-03-01' })]);

  comprueba(
    'NO_CUMPLE + attested → NO_CUMPLE sin la marca (un plan caducado es un incumplimiento corriente)',
    noCumple.status === 'NO_CUMPLE' && noCumple.attested !== true && noCumple.evidenced === true,
    `${noCumple.status} attested=${noCumple.attested} evidenced=${noCumple.evidenced}`
  );

  const noEvaluable = juzga([], [decision(REQ, 'NO_EVALUABLE', { attested: true, cause: 'CONFIGURATION' })]);

  comprueba(
    'NO_EVALUABLE + attested → NO_CUMPLE no evidenciado, sin la marca',
    noEvaluable.status === 'NO_CUMPLE' && noEvaluable.attested !== true && noEvaluable.evidenced === false,
    `${noEvaluable.status} attested=${noEvaluable.attested} evidenced=${noEvaluable.evidenced}`
  );

  const noAplica = juzga([], [decision(REQ, 'NO_APLICA', { attested: true })]);

  comprueba(
    'NO_APLICA + attested → NO_APLICA, fuera del denominador',
    noAplica.status === 'NO_APLICA' && noAplica.applicable === false && noAplica.attested !== true,
    `${noAplica.status} attested=${noAplica.attested}`
  );

  const borrador = juzga([], [ACREDITA], REQ, 'DRAFT');

  comprueba(
    'un control en DRAFT no se acredita: NO_APLICA',
    borrador.status === 'NO_APLICA' && borrador.attested !== true,
    `${borrador.status} attested=${borrador.attested}`
  );

  // op.acc.1.r1.2 rige en MEDIO y ALTO: en BAJO no aplica, se declare lo que se declare.
  const fueraDeNivel = juzga([], [decision('op.acc.1.r1.2', 'CUMPLE', { attested: true })], 'op.acc.1.r1.2', 'ACTIVE', 'BAJO');

  comprueba(
    'fuera de su nivel no aplica aunque la policy lo acredite',
    fueraDeNivel.status === 'NO_APLICA' && fueraDeNivel.attested !== true,
    `${fueraDeNivel.status} attested=${fueraDeNivel.attested}`
  );
}

// --- 3 bis. varias decisiones para el mismo requisito -----------------------
//
// Una policy debería emitir una por requisito. Si emite varias, una decisión
// anterior sin medida no puede esconder la acreditación; un NO_APLICA sigue
// sacando el requisito del juego, y una en contra sigue mandando.

bloque('3 bis. Varias decisiones para el mismo requisito');

{
  const sinMedida = decision(REQ, 'NO_EVALUABLE', { cause: 'COLLECTION', reason: 'sin hechos del recolector' });

  const detras = juzga([], [sinMedida, ACREDITA]);

  comprueba(
    '[NO_EVALUABLE, CUMPLE acreditado] → se lee la acreditada: CUMPLE y marcado',
    detras.status === 'CUMPLE' && detras.attested === true,
    `${detras.status} attested=${detras.attested}`
  );

  const delante = juzga([], [ACREDITA, sinMedida]);

  comprueba(
    '[CUMPLE acreditado, NO_EVALUABLE] → lo mismo',
    delante.status === 'CUMPLE' && delante.attested === true,
    `${delante.status} attested=${delante.attested}`
  );

  const noAplica = juzga([], [decision(REQ, 'NO_APLICA', { reason: 'refuerzo no elegido' }), ACREDITA]);

  comprueba(
    'la reversión · [NO_APLICA, CUMPLE acreditado] → NO_APLICA: sale del juego antes que nada',
    noAplica.status === 'NO_APLICA' && noAplica.attested !== true,
    `${noAplica.status} attested=${noAplica.attested}`
  );

  const enContra = juzga([], [decision(REQ, 'NO_CUMPLE', { reason: 'medida en contra' }), ACREDITA]);

  comprueba(
    'la reversión · [NO_CUMPLE, CUMPLE acreditado] → NO_CUMPLE: la medida en contra manda',
    enContra.status === 'NO_CUMPLE' && enContra.attested !== true,
    `${enContra.status} attested=${enContra.attested}`
  );

  const sinAcreditar = juzga([], [sinMedida, decision(REQ, 'CUMPLE')]);

  comprueba(
    'la reversión · sin acreditación, manda la primera como siempre: NO_EVALUABLE → NO_CUMPLE',
    sinAcreditar.status === 'NO_CUMPLE' && sinAcreditar.evidenced === false,
    `${sinAcreditar.status} evidenced=${sinAcreditar.evidenced}`
  );
}

// --- 4. el motor entero y la consolidación ---------------------------------

bloque('4. El motor (con el puente de evidencias) y la consolidación entre máquinas');

const runtime = (decisiones: ENSPolicyDecision[]): ENSPolicyRuntimeResult => ({
  controlId: 'op.acc.1',
  policyId: 'prueba',
  evaluatedAt: '2026-10-09T12:00:00Z',
  decisions: decisiones,
  appliedParameters: [],
  runtimeVariables: [],
});

const TODAS = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'];

// La configuración COMPLETA: con un parámetro obligatorio vacío, todo requisito
// medido sale NO_EVALUABLE y la prueba de la fuga de abajo pasaría por esa
// razón y no por la que dice. Mismo criterio que `aggregated-overview.test.ts`.
const valorValido = (parametro: ENSControlParameter): ENSControlParameter['value'] => {
  if (parametro.options && parametro.options.length) {
    return parametro.options[0];
  }

  switch (parametro.type) {
    case 'number':
    case 'duration_days':
    case 'duration_hours':
      return typeof parametro.minValue === 'number' ? Math.max(parametro.minValue, 1) : 7;
    case 'boolean':
      return true;
    case 'list':
      return parametro.columns && parametro.columns.length ? [parametro.example || ''] : ['valor-uno', 'valor-dos'];
    case 'table':
      return [parametro.example || ''];
    case 'path':
      return '/var/lib/ensfacil';
    case 'url':
      return 'https://ensfacil.example.org/api';
    default:
      return 'valor';
  }
};

const CONFIGURACION_COMPLETA: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parametro => ({ ...parametro, value: valorValido(parametro) })),
};

const maquina = (excepciones: Record<string, ENSComplianceStatus>, decisiones: ENSPolicyDecision[]) =>
  evaluateENSControl(
    CONTROL,
    CONFIGURACION_COMPLETA,
    'MEDIO',
    TODAS.map(id => evidencia(id, excepciones[id] || 'CUMPLE')),
    runtime(decisiones),
    []
  );

const req = (resultado: ReturnType<typeof maquina> | undefined, id: string = REQ) =>
  resultado?.requirements.find(r => r.id === id);

{
  // EV-06 sin medir. La acreditación NO la rellena: un documento no mide
  // ninguna evidencia (ver `policy-evidence-bridge.ts`).
  const acreditada = maquina({ 'EV-06': 'NO_EVALUABLE' }, [ACREDITA]);
  const ev06 = acreditada.evidences.find(e => e.id === 'EV-06');

  comprueba(
    'motor · el requisito llega al resultado CUMPLE y marcado',
    req(acreditada)?.status === 'CUMPLE' && req(acreditada)?.attested === true,
    `${req(acreditada)?.status} attested=${req(acreditada)?.attested}`
  );

  comprueba(
    'motor · la evidencia sin medir sigue NO_EVALUABLE: la acreditación no la mide',
    ev06?.status === 'NO_EVALUABLE',
    ev06?.status
  );

  // Y no se filtra a OTRO requisito que se apoya en la misma evidencia:
  // op.acc.1.r1.2 (EV-01 y EV-06) no puede salir CUMPLE «medido» por un
  // documento que acredita op.acc.1.2.
  const r12 = req(acreditada, 'op.acc.1.r1.2');

  comprueba(
    'fixture · la configuración está completa (el eje parámetros, quieto)',
    !acreditada.requirements.some(r => r.observations.includes('Existen parámetros obligatorios pendientes de configuración.')),
    acreditada.requirements.filter(r => r.observations.includes('Existen parámetros obligatorios pendientes de configuración.')).map(r => r.id).join(',')
  );

  comprueba(
    'motor · op.acc.1.r1.2, que comparte EV-06, no sale CUMPLE por la acreditación ajena',
    r12?.status !== 'CUMPLE' && r12?.attested !== true,
    `${r12?.status} attested=${r12?.attested} evidenced=${r12?.evidenced}`
  );

  // La reversión: una decisión CUMPLE SIN la marca es una medida de la policy y
  // sí rellena la evidencia, como siempre.
  const medidaPorPolicy = maquina({ 'EV-06': 'NO_EVALUABLE' }, [decision(REQ, 'CUMPLE')]);

  comprueba(
    'la reversión · una decisión CUMPLE sin marca sí rellena EV-06',
    medidaPorPolicy.evidences.find(e => e.id === 'EV-06')?.status === 'CUMPLE',
    medidaPorPolicy.evidences.find(e => e.id === 'EV-06')?.status
  );

  // Una decisión acreditada en otro estado sí alimenta el puente: no acredita
  // nada, así que es una medida corriente.
  const caducada = maquina({ 'EV-06': 'NO_EVALUABLE' }, [decision(REQ, 'NO_CUMPLE', { attested: true })]);

  comprueba(
    'y una acreditada en NO_CUMPLE sí rellena EV-06 con su NO_CUMPLE',
    caducada.evidences.find(e => e.id === 'EV-06')?.status === 'NO_CUMPLE',
    caducada.evidences.find(e => e.id === 'EV-06')?.status
  );

  // EV-05 medida en contra por el agente: el puente no la pisa y manda.
  const medidaEnContra = maquina({ 'EV-05': 'NO_CUMPLE' }, [ACREDITA]);

  comprueba(
    'motor · con EV-05 medida en NO_CUMPLE, el requisito NO_CUMPLE y sin marca',
    req(medidaEnContra)?.status === 'NO_CUMPLE' && req(medidaEnContra)?.attested !== true,
    `${req(medidaEnContra)?.status} attested=${req(medidaEnContra)?.attested}`
  );

  comprueba(
    'motor · y abre su no conformidad',
    medidaEnContra.nonConformities.some(nc => nc.requirementId === REQ),
    medidaEnContra.nonConformities.map(nc => nc.requirementId).join(',')
  );

  const parque = (resultados: ReturnType<typeof maquina>[]): ENSAgentComplianceState[] =>
    resultados.map((result, indice) => ({
      agentId: `02${indice + 1}`,
      agentName: `CLIENTE-0${indice + 1}`,
      results: [result],
      summary: undefined as never,
    }));

  const ambas = consolidateAgentComplianceResultByControl(parque([acreditada, acreditada]), 'op.acc.1');

  comprueba(
    'consolidación · dos máquinas acreditadas: CUMPLE y marcado',
    req(ambas)?.status === 'CUMPLE' && req(ambas)?.attested === true,
    `${req(ambas)?.status} attested=${req(ambas)?.attested}`
  );

  // La primera acredita y la segunda mide en contra: antes la marca se heredaba
  // de la primera máquina y salía «acreditado» en un requisito que no cumple.
  const unaEnContra = consolidateAgentComplianceResultByControl(parque([acreditada, medidaEnContra]), 'op.acc.1');

  comprueba(
    'consolidación · una máquina con la medida en contra: NO_CUMPLE y sin marca',
    req(unaEnContra)?.status === 'NO_CUMPLE' && req(unaEnContra)?.attested !== true,
    `${req(unaEnContra)?.status} attested=${req(unaEnContra)?.attested}`
  );

  const medida = maquina({}, [decision(REQ, 'CUMPLE')]);
  const mixta = consolidateAgentComplianceResultByControl(parque([medida, acreditada]), 'op.acc.1');

  comprueba(
    'consolidación · una medida y otra acreditada: CUMPLE marcado (en parte descansa en un documento)',
    req(mixta)?.status === 'CUMPLE' && req(mixta)?.attested === true,
    `${req(mixta)?.status} attested=${req(mixta)?.attested}`
  );

  const soloMedidas = consolidateAgentComplianceResultByControl(parque([medida, medida]), 'op.acc.1');

  comprueba(
    'la reversión · dos máquinas medidas: CUMPLE sin marca',
    req(soloMedidas)?.status === 'CUMPLE' && req(soloMedidas)?.attested !== true,
    `${req(soloMedidas)?.status} attested=${req(soloMedidas)?.attested}`
  );
}

// --- 5. cómo se lee en pantalla y en el informe ----------------------------

bloque('5. El detalle del control y el informe lo dicen como documental');

{
  comprueba(
    'detalle · un requisito acreditado se lee «acreditado documentalmente»',
    etiquetaDeRequisitoQueCumple({ attested: true }) === 'acreditado documentalmente'
  );
  comprueba('detalle · uno medido se lee «cumple»', etiquetaDeRequisitoQueCumple({}) === 'cumple');

  comprueba(
    'informe · un requisito acreditado: «Acreditado documentalmente»',
    ensRequirementProofLabel({ status: 'CUMPLE', attested: true, evidenced: true }) === 'Acreditado documentalmente'
  );
  comprueba(
    'informe · uno medido: «Medido»',
    ensRequirementProofLabel({ status: 'CUMPLE', evidenced: true }) === 'Medido'
  );
  comprueba(
    'informe · uno no demostrado: «No evidenciado» con sus causas',
    ensRequirementProofLabel({ status: 'NO_CUMPLE', evidenced: false }, ['Configuración']) === 'No evidenciado · Configuración'
  );
  comprueba(
    'informe · un NO_APLICA no lleva línea de prueba',
    ensRequirementProofLabel({ status: 'NO_APLICA', attested: true }) === ''
  );
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(fallo => console.log(`  - ${fallo}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
