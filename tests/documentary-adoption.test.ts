/** The `documental` mark on the policies of the new controls. */
import { opCont2PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-cont-2.policy';
import { opMon1PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-mon-1.policy';
import { opMon2PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-mon-2.policy';
import { opCont3PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-cont-3.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opCont2CatalogDefinition } from '../common/ens/catalog/op-cont-2';
import { opMon1CatalogDefinition } from '../common/ens/catalog/op-mon-1';
import { opMon2CatalogDefinition } from '../common/ens/catalog/op-mon-2';
import { opCont3CatalogDefinition } from '../common/ens/catalog/op-cont-3';
import { opCont2Configuration } from '../common/ens/configuration/data/op-cont-2-parameters';
import { opMon1Configuration } from '../common/ens/configuration/data/op-mon-1-parameters';
import { opMon2Configuration } from '../common/ens/configuration/data/op-mon-2-parameters';
import { opCont3Configuration } from '../common/ens/configuration/data/op-cont-3-parameters';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { controlExpectsFacts } from '../common/ens/core/evidence/registry';
import { markEvidencesStale, markPolicyRuntimeStale } from '../common/ens/core/evidence/stale-collector';
import type { ENSStaleCollector } from '../common/ens/core/evidence/stale-collector';
import { markEvidencesUnmatchedScope, markPolicyRuntimeUnmatchedScope } from '../common/ens/core/scope/measurement-planes';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import type { ENSConfigurationVersion } from '../common/ens/configuration/types';
import type { ENSAgentScope } from '../common/ens/core/scope/types';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../common/ens/configuration/services/attestation-service';
import type { ENSControlDefinition } from '../common/ens/catalog/types';
import type { ENSControlConfiguration, ENSLevel } from '../common/ens/configuration/types';
import type { ENSPolicyDefinition, ENSPolicyRuntimeResult } from '../common/ens/core/policy-runtime/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

{
  const Module = require('module');
  const load = Module._load;

  Module._load = function (request: string, ...rest: unknown[]) {
    if (/kibana-services$/.test(request)) {
      return {};
    }

    return load.call(this, request, ...rest);
  };
}

const { getENSComplianceResultByControl } = require('../common/ens/core/ens-engine') as typeof import('../common/ens/core/ens-engine');

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

const NOW = new Date('2026-10-09T12:00:00Z');

const PARADO: ENSStaleCollector = {
  since: '2026-10-07T10:00:00Z',
  reference: 'collector_run',
  reason: 'Sin datos del recolector desde el 2026-10-07 10:00 UTC.',
};

type Valores = Record<string, string[] | string | undefined>;

const configuration = (base: ENSControlConfiguration, valores: Valores): ENSControlConfiguration => ({
  ...base,
  parameters: base.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

const NO_SCOPE = 'Ninguna de las máquinas declaradas coincide con un agente del alcance ENS.';

const evaluate = (
  control: ENSControlDefinition,
  policy: ENSPolicyDefinition,
  cfg: ENSControlConfiguration,
  level: ENSLevel,
  mark?: 'parado' | 'sin-alcance'
) => {
  const evidences = resolveEvidenceForControl(control.id, [], '000', level, cfg, NOW);
  const context = buildPolicyContext(control, cfg, level, [], evidences, NOW);
  const { decisions, runtimeVariables } = policy.evaluator!(context);
  const original: ENSPolicyRuntimeResult = {
    controlId: control.id,
    policyId: policy.id,
    evaluatedAt: NOW.toISOString(),
    decisions,
    appliedParameters: [],
    runtimeVariables,
  };
  const runtime =
    mark === 'parado'
      ? markPolicyRuntimeStale(original, PARADO)!
      : mark === 'sin-alcance'
      ? markPolicyRuntimeUnmatchedScope(original, NO_SCOPE)!
      : original;
  const tablaBase =
    mark === 'parado'
      ? markEvidencesStale(evidences, PARADO)
      : mark === 'sin-alcance'
      ? markEvidencesUnmatchedScope(evidences, NO_SCOPE)
      : evidences;
  const factsWait = mark !== 'sin-alcance' && controlExpectsFacts(control.id);
  const tabla = applyPolicyDecisionsToEvidences(tablaBase, runtime.decisions, control.requirements, factsWait);
  const attestations = parseRequirementAttestations(cfg);
  const requirement = (id: string) =>
    evaluateRequirement(control.requirements.find(q => q.id === id)!, level, tabla, false, runtime.decisions, 'ACTIVE', attestations.get(id));
  const decision = (id: string) => runtime.decisions.find(d => d.requirementId === id && d.trace.ruleId === id);
  const motor = () => evaluateENSControl(control, cfg, level, tablaBase, runtime, [], factsWait);

  return { decisions: runtime.decisions, original: decisions, requisito: requirement, decision, motor };
};

section('1. op.cont.2: all documentary; an expired contract stays expired (through the real engine and with the scope gap)');

{
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
  const cfg = configuration(opCont2Configuration, VALORES);
  const healthy = evaluate(opCont2CatalogDefinition, opCont2PolicyDefinition, cfg, 'ALTO');
  const withoutScope = evaluate(opCont2CatalogDefinition, opCont2PolicyDefinition, cfg, 'ALTO', 'sin-alcance');

  check('all its decisions carry `documental`', healthy.original.length > 0 && healthy.original.every(d => d.documental === true));
  check('the expired contract gives NO_CUMPLE on op.cont.2.3', healthy.requisito('op.cont.2.3').status === 'NO_CUMPLE', healthy.requisito('op.cont.2.3').status);

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    global: {
      ...defaultENSConfigurationTemplate.global,
      clientName: 'Cliente de prueba',
      organization: 'Organización de prueba',
      scope: 'Laboratorio',
      ensLevel: 'ALTO',
    } as ENSConfigurationVersion['global'],
    controls: defaultENSConfigurationTemplate.controls.map(control => (control.controlId === 'op.cont.2' ? cfg : control)),
  });
  const MANAGER: ENSAgentScope = { id: '000', name: 'manager', groups: [], isManager: true };
  const real = getENSComplianceResultByControl('op.cont.2', 'ALTO', [], '000', [MANAGER], NOW);
  const realRequirement = (id: string) => real?.requirements.find(q => q.id === id);
  const ncReal = real?.nonConformities.find(n => n.requirementId === 'op.cont.2.3');

  check(
    'through the real engine, without facts: op.cont.2.3 documentary NO_CUMPLE and op.cont.2.1 accredited CUMPLE',
    realRequirement('op.cont.2.3')?.status === 'NO_CUMPLE' &&
      realRequirement('op.cont.2.3')?.documental === true &&
      realRequirement('op.cont.2.1')?.status === 'CUMPLE' &&
      realRequirement('op.cont.2.1')?.attested === true,
    `${realRequirement('op.cont.2.3')?.status} ${realRequirement('op.cont.2.1')?.status}`
  );
  check(
    'and it never says «Sin datos del recolector»: op.cont.2 does not wait for facts',
    real !== undefined && !JSON.stringify(real).includes('Sin datos del recolector'),
    real?.status
  );
  check(
    'its nonconformity is documentary and sends to renew the documentation',
    ncReal?.documental === true && /^Renovar o completar la documentación/.test(ncReal?.requiredAction || ''),
    `${ncReal?.documental} ${ncReal?.requiredAction}`
  );

  check(
    'with the scope gap, it stays NO_CUMPLE (and documentary)',
    withoutScope.decision('op.cont.2.3')?.status === 'NO_CUMPLE' &&
      withoutScope.requisito('op.cont.2.3').status === 'NO_CUMPLE' &&
      withoutScope.requisito('op.cont.2.3').documental === true,
    `${withoutScope.decision('op.cont.2.3')?.status} ${withoutScope.requisito('op.cont.2.3').status}`
  );
  check(
    'and the accredited CUMPLE of the others survives too',
    withoutScope.requisito('op.cont.2.1').status === 'CUMPLE' && withoutScope.requisito('op.cont.2.1').attested === true,
    withoutScope.requisito('op.cont.2.1').status
  );

  const nc = withoutScope.motor().nonConformities.find(n => n.requirementId === 'op.cont.2.3');

  check(
    'and its nonconformity stays documentary',
    nc?.documental === true && /^Renovar o completar la documentación/.test(nc?.requiredAction || ''),
    `${nc?.documental} ${nc?.requiredAction}`
  );
}

section('2. op.mon.1: R2 (P-05) documentary; the technical part is not');

{
  const COMPLETE: Valores = { 'P-05': ['intrusión en servidor | PR-18 Respuesta a intrusión | Responsable de Seguridad'] };
  const A_MEDIAS: Valores = { 'P-05': ['intrusión en servidor | PR-18 Respuesta a intrusión | '] };
  const complete = configuration(opMon1Configuration, COMPLETE);
  const aMedias = configuration(opMon1Configuration, A_MEDIAS);

  const healthy = evaluate(opMon1CatalogDefinition, opMon1PolicyDefinition, complete, 'ALTO');

  check(
    'R2\'s decision carries `documental`',
    healthy.original.find(d => d.requirementId === 'op.mon.1.r2.1' && d.trace.ruleId === 'op.mon.1.r2.1')?.documental === true
  );
  check(
    'the technical ones do not (op.mon.1.1, op.mon.1.r1.1)',
    healthy.original.filter(d => ['op.mon.1.1', 'op.mon.1.r1.1'].includes(d.requirementId)).every(d => d.documental !== true)
  );

  const parado = evaluate(opMon1CatalogDefinition, opMon1PolicyDefinition, complete, 'ALTO', 'parado');

  check(
    'with the collector stopped, R2 stays documentarily accredited CUMPLE',
    parado.requisito('op.mon.1.r2.1').status === 'CUMPLE' && parado.requisito('op.mon.1.r2.1').attested === true,
    parado.requisito('op.mon.1.r2.1').status
  );

  const paradoAMedias = evaluate(opMon1CatalogDefinition, opMon1PolicyDefinition, aMedias, 'ALTO', 'parado');

  check(
    'with P-05 half done and the collector stopped, R2 stays unmeasured by CONFIGURATION (not by RECOGIDA)',
    paradoAMedias.decision('op.mon.1.r2.1')?.status === 'NO_EVALUABLE' && paradoAMedias.decision('op.mon.1.r2.1')?.cause === 'CONFIGURATION',
    `${paradoAMedias.decision('op.mon.1.r2.1')?.status} ${paradoAMedias.decision('op.mon.1.r2.1')?.cause}`
  );
  check(
    'REVERSAL: the technical decision op.mon.1.1 becomes RECOGIDA',
    parado.decision('op.mon.1.1')?.status === 'NO_EVALUABLE' && parado.decision('op.mon.1.1')?.cause === 'COLLECTION',
    `${parado.decision('op.mon.1.1')?.status} ${parado.decision('op.mon.1.1')?.cause}`
  );
}

section('3. op.mon.2 and op.cont.3: everything goes through a record the collector reads');

{
  const cases: [string, ENSControlDefinition, ENSPolicyDefinition, ENSControlConfiguration][] = [
    ['op.mon.2', opMon2CatalogDefinition, opMon2PolicyDefinition, opMon2Configuration],
    ['op.cont.3', opCont3CatalogDefinition, opCont3PolicyDefinition, opCont3Configuration],
  ];

  cases.forEach(([id, control, policy, cfg]) => {
    const healthy = evaluate(control, policy, cfg, 'ALTO');
    const parado = evaluate(control, policy, cfg, 'ALTO', 'parado');

    check(`${id} · emits decisions and none carries \`documental\``, healthy.original.length > 0 && healthy.original.every(d => d.documental !== true));
    check(
      `${id} · with the collector stopped, those that are not NO_APLICA are left unmeasured by RECOGIDA`,
      parado.decisions.filter(d => d.status !== 'NO_APLICA').every(d => d.status === 'NO_EVALUABLE' && d.cause === 'COLLECTION'),
      parado.decisions.filter(d => d.status !== 'NO_APLICA').map(d => `${d.trace.ruleId}:${d.status}:${d.cause}`).join(', ')
    );
  });
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) FAIL:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}

console.log('\nAll checks pass.');
