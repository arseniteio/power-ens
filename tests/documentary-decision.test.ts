/**
 * Decisiones DOCUMENTALES de la policy: `documental` en `ENSPolicyDecision`.
 *
 *     npx --yes tsx tests/documentary-decision.test.ts
 *
 * POR QUÉ EXISTE. Un recolector parado (`markPolicyRuntimeStale`) o un alcance
 * sin máquinas (`markPolicyRuntimeUnmatchedScope`) dejaban en NO_EVALUABLE
 * TODAS las decisiones de la policy, también las que salen de la pantalla (una
 * certificación vencida sigue vencida aunque el recolector no lata). En un
 * requisito sin evidencias técnicas, ese NO_EVALUABLE dejaba pasar a P-ATT: un
 * NO_CUMPLE declarado salía CUMPLE. Un verde falso y escondido.
 *
 * Lo que se prueba, con su reversión al lado:
 *
 *   1. con el recolector parado, una decisión `documental` se conserva en
 *      cualquier estado; una técnica pasa a NO_EVALUABLE (COLLECTION); el
 *      NO_APLICA se conserva como siempre;
 *   2. lo mismo con el alcance sin máquinas (CONFIGURATION);
 *   3. recolector parado + NO_CUMPLE documental + P-ATT → NO_CUMPLE, nunca
 *      CUMPLE; sin la marca, el mismo caso salía CUMPLE (el agujero);
 *   4. un NO_CUMPLE documental no se lee «Medido» ni manda a corregir la
 *      máquina: la etiqueta, la no conformidad y su acción lo dicen.
 *
 * Es del motor, no de un control: se usa op.acc.1.5 (sin evidencias técnicas,
 * acreditable con P-ATT) con decisiones fabricadas.
 */
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { markPolicyRuntimeStale } from '../public/ens/core/evidence/stale-collector';
import type { ENSStaleCollector } from '../public/ens/core/evidence/stale-collector';
import { markPolicyRuntimeUnmatchedScope } from '../public/ens/core/scope/measurement-planes';
import { parseRequirementAttestations } from '../public/ens/configuration/services/attestation-service';
import { ensRequirementProofLabel } from '../public/ens/reports/report-rows';
import { opAcc1CatalogDefinition } from '../public/ens/catalog/op-acc-1';
import { getEvidenceDefinitions } from '../public/ens/core/evidence/registry';
import type {
  ENSPolicyDecision,
  ENSPolicyRuntimeResult,
} from '../public/ens/core/policy-runtime/types';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../public/ens/configuration/types';
import type { ENSComplianceStatus } from '../public/ens/core/evaluation/types';
import type { ENSEvidenceResolved } from '../public/ens/core/evidence/types';

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

// op.acc.1.5 no declara ninguna evidencia: es donde P-ATT puede entrar.
const REQ = 'op.acc.1.5';
// op.acc.1.2 se demuestra con evidencias técnicas.
const TECNICO = 'op.acc.1.2';

const requisito = (id: string) => opAcc1CatalogDefinition.requirements.find(r => r.id === id)!;

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
    expected: 'certificación en vigor',
    actual: status,
    result: status === 'CUMPLE',
  },
  reason: 'La certificación nº CCN-2026-004 venció el 2026-03-01',
  ...extra,
});

const runtime = (decisiones: ENSPolicyDecision[]): ENSPolicyRuntimeResult => ({
  controlId: 'op.acc.1',
  policyId: 'prueba',
  evaluatedAt: '2026-10-09T12:00:00Z',
  decisions: decisiones,
  appliedParameters: [],
  runtimeVariables: [],
});

const PARADO: ENSStaleCollector = {
  since: '2026-10-07T10:00:00Z',
  reference: 'collector_run',
  reason: 'Sin datos del recolector desde el 2026-10-07 10:00 UTC.',
};

const configuracion = (filas: string[]): ENSControlConfiguration =>
  ({
    controlId: 'op.acc.1',
    controlName: 'Identificación',
    family: 'Marco operacional',
    enabled: true,
    applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
    parameters: [
      {
        id: 'P-ATT',
        controlId: 'op.acc.1',
        name: 'atestaciones_documentales',
        label: 'Atestaciones',
        description: '',
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        requirements: [],
        type: 'table',
        example: '',
        required: false,
        wazuhUsage: '',
        ensfacilUsage: '',
        evidenceIds: [],
        ruleIds: [],
        ifNotConfigured: '',
        value: filas,
      } as unknown as ENSControlParameter,
    ],
  }) as ENSControlConfiguration;

const ATESTACION = parseRequirementAttestations(
  configuracion([`${REQ} | Política de identificación v3 | https://intranet/pol-id-v3.pdf | 2026-05-12 | RSI`])
).get(REQ);

const juzga = (decisiones: ENSPolicyDecision[], id = REQ, evidencias: ENSEvidenceResolved[] = []) =>
  evaluateRequirement(requisito(id), 'ALTO', evidencias, false, decisiones, 'ACTIVE', id === REQ ? ATESTACION : undefined);

// --- 1. recolector parado ---------------------------------------------------

bloque('1. Recolector parado: lo documental se conserva en cualquier estado; lo técnico no');

{
  const documentales = (['NO_CUMPLE', 'CUMPLE', 'NO_EVALUABLE'] as ENSComplianceStatus[]).map(status =>
    decision(REQ, status, { documental: true, cause: status === 'NO_EVALUABLE' ? 'CONFIGURATION' : undefined, attested: status === 'CUMPLE' || undefined })
  );
  const tecnica = decision(TECNICO, 'CUMPLE');
  const fuera = decision('op.acc.1.r1.1', 'NO_APLICA');
  const marcadas = markPolicyRuntimeStale(runtime([...documentales, tecnica, fuera]), PARADO)!.decisions;

  comprueba(
    'las tres documentales salen intactas (estado, motivo, causa)',
    marcadas.slice(0, 3).every((d, i) => d.status === documentales[i].status && d.reason === documentales[i].reason && d.cause === documentales[i].cause),
    marcadas.slice(0, 3).map(d => `${d.status}/${d.cause}`).join(', ')
  );
  comprueba(
    'la técnica pasa a NO_EVALUABLE por RECOGIDA con el motivo del recolector',
    marcadas[3].status === 'NO_EVALUABLE' && marcadas[3].cause === 'COLLECTION' && /Sin datos del recolector/.test(marcadas[3].reason),
    `${marcadas[3].status} ${marcadas[3].cause}`
  );
  comprueba('el NO_APLICA se conserva', marcadas[4].status === 'NO_APLICA');
  comprueba(
    'y un requisito técnico con el recolector parado no cumple: no demostrado',
    juzga([marcadas[3]], TECNICO).status === 'NO_CUMPLE' && juzga([marcadas[3]], TECNICO).evidenced === false
  );
}

// --- 2. alcance sin máquinas --------------------------------------------------

bloque('2. Alcance sin máquinas: la misma regla, con causa CONFIGURATION para lo técnico');

{
  const marcadas = markPolicyRuntimeUnmatchedScope(
    runtime([decision(REQ, 'NO_CUMPLE', { documental: true }), decision(TECNICO, 'CUMPLE')]),
    'P-04 no declara ninguna máquina'
  )!.decisions;

  comprueba('la documental sale intacta', marcadas[0].status === 'NO_CUMPLE' && marcadas[0].documental === true);
  comprueba('la técnica, NO_EVALUABLE por CONFIGURATION', marcadas[1].status === 'NO_EVALUABLE' && marcadas[1].cause === 'CONFIGURATION');
}

// --- 3. el agujero de P-ATT -------------------------------------------------------

bloque('3. Recolector parado + NO_CUMPLE documental + P-ATT: nunca CUMPLE');

{
  const vencida = decision(REQ, 'NO_CUMPLE', { documental: true });
  const conMarca = juzga(markPolicyRuntimeStale(runtime([vencida]), PARADO)!.decisions);

  comprueba(
    'con la marca: NO_CUMPLE medido desde la declaración, sin acreditar',
    conMarca.status === 'NO_CUMPLE' && conMarca.evidenced === true && !conMarca.attested && conMarca.documental === true,
    `${conMarca.status} evidenced=${conMarca.evidenced} attested=${conMarca.attested}`
  );

  const { documental: _sin, ...sinMarca } = vencida;
  const agujero = juzga(markPolicyRuntimeStale(runtime([sinMarca]), PARADO)!.decisions);
  comprueba(
    'REVERSIÓN (el agujero que cierra): sin la marca, el recolector parado lo deja NO_EVALUABLE y P-ATT lo daba por CUMPLE',
    agujero.status === 'CUMPLE' && agujero.attested === true,
    `${agujero.status} attested=${agujero.attested}`
  );
  comprueba('y sin recolector parado, el NO_CUMPLE documental sigue mandando sobre P-ATT', juzga([vencida]).status === 'NO_CUMPLE');
}

// --- 4. cómo se dice ------------------------------------------------------------------

bloque('4. Un NO_CUMPLE documental no es «Medido» ni «corregir la máquina»');

{
  const vencida = juzga([decision(REQ, 'NO_CUMPLE', { documental: true })]);
  const medida = juzga([decision(REQ, 'NO_CUMPLE')]);

  comprueba('la etiqueta del informe dice «Declarado (documental)»', ensRequirementProofLabel(vencida) === 'Declarado (documental)', ensRequirementProofLabel(vencida));
  comprueba('REVERSIÓN: sin la marca, «Medido»', ensRequirementProofLabel(medida) === 'Medido');
  comprueba('un CUMPLE acreditado sigue diciendo «Acreditado documentalmente»', ensRequirementProofLabel(juzga([decision(REQ, 'CUMPLE', { documental: true, attested: true })])) === 'Acreditado documentalmente');

  const evidencias = getEvidenceDefinitions('op.acc.1').map(e => ({ ...e, status: 'CUMPLE', observations: [] }) as ENSEvidenceResolved);
  const control = (marca: boolean) =>
    evaluateENSControl(
      opAcc1CatalogDefinition,
      configuracion([]),
      'ALTO',
      evidencias,
      runtime([decision(REQ, 'NO_CUMPLE', marca ? { documental: true } : {})]),
      []
    ).nonConformities.find(nc => nc.requirementId === REQ);

  const documental = control(true);
  comprueba(
    'la no conformidad es demostrada (cuenta igual) pero documental, y manda a renovar la documentación',
    documental?.origin === 'MEDIDA' && documental?.documental === true && /^Renovar o completar la documentación/.test(documental?.requiredAction || ''),
    `${documental?.origin} ${documental?.documental} ${documental?.requiredAction}`
  );
  const tecnica = control(false);
  comprueba('REVERSIÓN: sin la marca, «Corregir para alcanzar»', tecnica?.documental !== true && /^Corregir para alcanzar/.test(tecnica?.requiredAction || ''), tecnica?.requiredAction);
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
