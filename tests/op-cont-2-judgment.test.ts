/** op.cont.2: judgment of the continuity plan. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ENSCatalog } from '../common/ens/catalog';
import { opCont2PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-cont-2.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opCont2CatalogDefinition } from '../common/ens/catalog/op-cont-2';
import { opCont2Configuration } from '../common/ens/configuration/data/op-cont-2-parameters';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { controlExpectsFacts, getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { buildOpCont2ReportModel } from '../public/ens/reports/op-cont-2-report-model';
import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

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

const { getENSComplianceResults, getENSComplianceState } = require('../common/ens/core/ens-engine') as typeof import('../common/ens/core/ens-engine');

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

type Values = Record<string, string[] | string | undefined>;

const configuration = (values: Values): ENSControlConfiguration => ({
  ...opCont2Configuration,
  parameters: opCont2Configuration.parameters.map(p => {
    const { value: _anterior, ...withoutValue } = p;

    return values[p.id] === undefined ? withoutValue : { ...withoutValue, value: values[p.id] };
  }),
});

const BASE: Values = {
  'P-01': [
    'Plan de Continuidad del Servicio | v3.0 | 2026-01-15 | Comité de Seguridad | Responsable de Seguridad',
    'Plan de Continuidad del Servicio | v2.1 | 2024-03-10 | Comité de Seguridad | Responsable de Seguridad',
  ],
  'P-02': ['sede electrónica | 4 h | 1 h | srv-web, srv-bd', 'correo corporativo | 8 h | 30 min | ldap-zimbra'],
  'P-03': [
    'coordinador de crisis | A. Martínez | J. Ruiz | activar el plan y convocar al comité de crisis',
    'responsable de sistemas | L. Gómez | - | conmutar al CPD alternativo y verificar la integridad',
  ],
  'P-04': [
    'CPD alternativo | Proveedor X | CT-2025-014 | 2027-06-30 | 48 h',
    'enlace de respaldo | Operador Y | CT-2024-201 | 2026-12-31 | 4 h',
  ],
  'P-05': [
    'A. Martínez | coordinación de crisis | 2026-02-10 | 2027-02-10',
    'J. Ruiz | coordinación de crisis (suplente) | 2026-02-10 | 2027-02-10',
    'L. Gómez | conmutación al CPD alternativo | 2025-11-20 | 2026-11-20',
  ],
  'P-06': ['Plan de Emergencia del edificio', 'Plan de Continuidad de Negocio corporativo'],
  'P-07': ['/boot', '/etc', 'versión de BIOS/UEFI'],
  'P-08': '12',
};

const withIt = (changesList: Values): Values => ({ ...BASE, ...changesList });

const BASE_REQ = ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'];

const evaluate = (values: Values = BASE, level: ENSLevel = 'ALTO', now: Date = NOW, touchesTable?: (t: ENSEvidenceResolved[]) => ENSEvidenceResolved[]) => {
  const cfg = configuration(values);
  const evidences = resolveEvidenceForControl('op.cont.2', [], '000', level, cfg, now);
  const context = buildPolicyContext(opCont2CatalogDefinition, cfg, level, [], evidences, now);
  const { decisions, runtimeVariables } = opCont2PolicyDefinition.evaluator!(context);
  const bridged = applyPolicyDecisionsToEvidences(evidences, decisions, opCont2CatalogDefinition.requirements, controlExpectsFacts('op.cont.2'));
  const tabla = touchesTable ? touchesTable(bridged) : bridged;
  const requirement = (id: string) =>
    evaluateRequirement(opCont2CatalogDefinition.requirements.find(q => q.id === id)!, level, tabla, false, decisions, 'ACTIVE');
  const evidence = (id: string) => tabla.find(e => e.id === id);
  const motive = (req: string) => decisions.find(d => d.requirementId === req && d.trace.ruleId === req)?.reason || '';
  const ofEvidence = (req: string, ev: string) => decisions.find(d => d.trace.ruleId === `${req}/${ev}`);
  const variable = (name: string) => runtimeVariables.find(v => v.name === name);
  const motor = () =>
    evaluateENSControl(
      opCont2CatalogDefinition,
      cfg,
      level,
      evidences,
      {
        controlId: 'op.cont.2',
        policyId: opCont2PolicyDefinition.id,
        evaluatedAt: now.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      [],
      controlExpectsFacts('op.cont.2')
    );

  return { decisions, runtimeVariables, requisito: requirement, evidencia: evidence, motivo: motive, deEvidencia: ofEvidence, variable, motor };
};

const all = (r: ReturnType<typeof evaluate>, complies: (id: string) => boolean): string[] => BASE_REQ.filter(id => !complies(id));

section('1. Catalog: Availability, ALTO only, no facts and no runbook');

{
  const levels = (id: string) => opCont2CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  check('governed by Availability (levelDimension D)', opCont2CatalogDefinition.levelDimension === 'D');
  check('evaluated only in the manager row (organization control)', JSON.stringify(opCont2CatalogDefinition.measurementPlanes) === '["manager"]');
  check('the control is ACTIVE', opCont2CatalogDefinition.status === 'ACTIVE', opCont2CatalogDefinition.status);
  check('the five base requirements only at ALTO', BASE_REQ.every(id => levels(id) === 'ALTO'));
  check('R1 and R2 defined, without levels', levels('op.cont.2.r1.1') === '' && levels('op.cont.2.r2.1') === '');
  check(
    'the five rest on EV-01 (the plan); 2.3 on EV-04 and 2.4 on EV-06; 2.5 has evidence',
    BASE_REQ.every(id => opCont2CatalogDefinition.requirements.find(r => r.id === id)!.evidenceIds[0] === 'EV-01') &&
      opCont2CatalogDefinition.requirements.find(r => r.id === 'op.cont.2.3')!.evidenceIds.join(',') === 'EV-01,EV-04' &&
      opCont2CatalogDefinition.requirements.find(r => r.id === 'op.cont.2.4')!.evidenceIds.join(',') === 'EV-01,EV-06' &&
      opCont2CatalogDefinition.requirements.find(r => r.id === 'op.cont.2.5')!.evidenceIds.join(',') === 'EV-01'
  );
  check(
    'no evidence listens to an event, has an origin or accredits rules',
    getEvidenceDefinitions('op.cont.2').length === 8 &&
      getEvidenceDefinitions('op.cont.2').every(e => !e.expectedEventTypes.length && !e.sourceTypes.length && !e.relatedRules.length && !e.judgment)
  );
  check('op.cont.2 does not wait for facts', controlExpectsFacts('op.cont.2') === false);
  check(
    'and it is the only one: all other catalog controls wait for facts',
    ENSCatalog.filter(c => c.id !== 'op.cont.2').every(c => controlExpectsFacts(c.id)),
    ENSCatalog.filter(c => c.id !== 'op.cont.2' && !controlExpectsFacts(c.id)).map(c => c.id).join(', ')
  );
  check(
    'the policy declares the same levels and evidences as the catalog',
    opCont2PolicyDefinition.requirements.length === opCont2CatalogDefinition.requirements.length &&
      opCont2PolicyDefinition.requirements.every(r => {
        const c = opCont2CatalogDefinition.requirements.find(q => q.id === r.requirementId)!;

        return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',');
      })
  );
  check('without P-ATT: an attestation does not expire', !opCont2Configuration.parameters.some(p => p.id === 'P-ATT'));
  check(
    'mandatory only P-01 and P-08',
    opCont2Configuration.parameters.filter(p => p.required).map(p => p.id).join(',') === 'P-01,P-08'
  );
  check(
    'dates are date columns (the same the screen validates)',
    ['P-01:fecha_de_aprobacion', 'P-04:vigencia', 'P-05:fecha', 'P-05:vigencia'].every(par => {
      const [id, col] = par.split(':');

      return opCont2Configuration.parameters.find(p => p.id === id)?.columns?.find(c => c.name === col)?.type === 'date';
    })
  );

  const withoutRunbook = JSON.parse(readFileSync(join(__dirname, 'controls-without-runbook.json'), 'utf-8'));
  const jsonBlock = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'op-cont-2-control-block.json'), 'utf-8'));

  check('declared without a runbook, with a motive', typeof withoutRunbook['op.cont.2'] === 'string' && withoutRunbook['op.cont.2'].length > 20);
  check('the config/ block is the TS, as is', JSON.stringify(jsonBlock) === JSON.stringify(opCont2Configuration));
}

section('2. Green: everything declared and in force on 09/10/2026, D at ALTO');

{
  const r = evaluate();

  check(
    'the five requirements CUMPLE, documentarily accredited and proven',
    all(r, id => r.requisito(id).status === 'CUMPLE' && r.requisito(id).attested === true && r.requisito(id).evidenced === true).length === 0,
    all(r, id => r.requisito(id).status === 'CUMPLE' && r.requisito(id).attested === true).join(', ')
  );
  check(
    'and their observation starts with «Acreditado documentalmente»',
    BASE_REQ.every(id => r.requisito(id).observations[0].startsWith('Acreditado documentalmente')),
    r.requisito('op.cont.2.1').observations[0]
  );
  check(
    'EV-01: the v3.0 plan of 15/01 expires on 15/01/2027 with P-08 = 12 (the 2024 v2.1 does not count)',
    r.evidencia('EV-01')?.status === 'CUMPLE' && /v3\.0, aprobado el 2026-01-15 por Comité de Seguridad: vigente hasta el 2027-01-15/.test(r.deEvidencia('op.cont.2.1', 'EV-01')?.reason || ''),
    r.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
  check(
    'the evidence says it is a declaration, not a measurement',
    (r.evidencia('EV-01')?.observations || []).some(o => /Declaración de la pantalla, no medida/.test(o)),
    (r.evidencia('EV-01')?.observations || []).join(' | ')
  );
  check(
    'EV-04: both contracts in force, with the days left',
    r.evidencia('EV-04')?.status === 'CUMPLE' && /CT-2025-014 con Proveedor X, hasta el 2027-06-30/.test(r.deEvidencia('op.cont.2.3', 'EV-04')?.reason || ''),
    r.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );
  check(
    'EV-06: the three people of P-03 (the «-» is not a deputy) with current training',
    r.evidencia('EV-06')?.status === 'CUMPLE' && /Las 3 persona\(s\) del plan/.test(r.deEvidencia('op.cont.2.4', 'EV-06')?.reason || ''),
    r.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );
  check(
    'EV-02, EV-03, EV-05, EV-07 and EV-08: NO_APLICA, report datum',
    ['EV-02', 'EV-03', 'EV-05', 'EV-07', 'EV-08'].every(
      id => r.evidencia(id)?.status === 'NO_APLICA' && (r.evidencia(id)?.observations || []).some(o => /Dato del informe, sin veredicto/.test(o))
    ),
    ['EV-02', 'EV-03', 'EV-05', 'EV-07', 'EV-08'].map(id => `${id}=${r.evidencia(id)?.status}`).join(' ')
  );
  check('R1 and R2 NO_APLICA', r.requisito('op.cont.2.r1.1').status === 'NO_APLICA' && r.requisito('op.cont.2.r2.1').status === 'NO_APLICA');
  check('the plan variable carries its last day of validity', r.variable('plan_vigente_hasta')?.value === '2027-01-15', r.variable('plan_vigente_hasta')?.value);

  const result = r.motor();

  check('the control CUMPLE at 100 %', result.status === 'CUMPLE' && result.score === 100, `${result.status} ${result.score}`);
  check('no nonconformities', result.nonConformities.length === 0, result.nonConformities.map(nc => nc.id).join(', '));
  check(
    'the BASE values are valid for the screen\'s validator',
    configuration(BASE).parameters.filter(p => p.value !== undefined).every(p => validateParameterValue(p, p.value).valid),
    configuration(BASE).parameters.filter(p => p.value !== undefined && !validateParameterValue(p, p.value).valid).map(p => `${p.id}: ${validateParameterValue(p, p.value).reason}`).join('; ')
  );

  const report = buildOpCont2ReportModel(result);
  const campo = (id: string) => report.fields.find(f => f.id === `op.cont.2.${id}`);

  check('the report has the twelve fields of the template', report.fields.length === 12, report.fields.length);
  check('report · plan valid until 2027-01-15, DOCUMENTO APORTADO', /DOCUMENTO APORTADO.*2027-01-15/.test(campo('campo2')?.value || ''), campo('campo2')?.value);
  check('report · P-02\'s essential services', campo('campo3')?.status === 'CUMPLE' && /sede electrónica/.test(campo('campo3')?.value || ''), campo('campo3')?.value);
  check('report · the integration with other plans from P-06', campo('campo10')?.status === 'CUMPLE', campo('campo10')?.status);
  check(
    'report · interruptions, availability and activation of means: not measured, and it says so',
    ['campo4', 'campo5', 'campo6'].every(id => campo(id)?.status === 'NO_APLICA' && /No se mide/.test(campo(id)?.value || '')),
    ['campo4', 'campo5', 'campo6'].map(id => campo(id)?.value).join(' | ')
  );
  check(
    'report · the score says everything is documentary',
    /100 %.*5 de 5 acreditados documentalmente.*nada se verifica técnicamente/.test(campo('campo12')?.value || ''),
    campo('campo12')?.value
  );
}

section('3. EV-01: the expired plan brings down all five; periodicity and date decide');

{
  const old = withIt({ 'P-01': ['Plan de Continuidad del Servicio | v2.1 | 2025-09-01 | Comité de Seguridad | RS'] });
  const r = evaluate(old);

  check(
    'approved on 01/09/2025 with P-08 = 12: expired on 2026-09-01 → all five measured NO_CUMPLE, without the mark',
    all(r, id => r.requisito(id).status === 'NO_CUMPLE' && r.requisito(id).evidenced === true && !r.requisito(id).attested).length === 0,
    BASE_REQ.map(id => `${id}=${r.requisito(id).status}/${r.requisito(id).attested}`).join(' ')
  );
  check('and the motive gives the date and the days', /venció el 2026-09-01, hace 37 días/.test(r.motivo('op.cont.2.3')), r.motivo('op.cont.2.3'));

  const biennial = evaluate({ ...old, 'P-08': '24' });

  check(
    'reversal · the same plan with P-08 = 24 (biennial): accredited CUMPLE',
    all(biennial, id => biennial.requisito(id).status === 'CUMPLE' && biennial.requisito(id).attested === true).length === 0,
    biennial.motivo('op.cont.2.1')
  );

  const justo = withIt({ 'P-01': ['Plan | v1 | 2025-10-09 | Comité | RS'] });

  check(
    'approved on 09/10/2025 with P-08 = 12: on 09/10/2026 it is still valid (expires at the end of the day)',
    evaluate(justo).evidencia('EV-01')?.status === 'CUMPLE',
    evaluate(justo).deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
  check(
    'reversal · on 10/10/2026 it has expired',
    evaluate(justo, 'ALTO', new Date('2026-10-10T00:00:00Z')).evidencia('EV-01')?.status === 'NO_CUMPLE'
  );

  const endOfMonth = withIt({ 'P-01': ['Plan | v1 | 2026-01-31 | Comité | RS'], 'P-08': '1' });

  check(
    'months are calendar months: 31/01 + 1 month expires on 28/02, not 03/03',
    evaluate(endOfMonth, 'ALTO', new Date('2026-02-28T23:00:00Z')).evidencia('EV-01')?.status === 'CUMPLE' &&
      evaluate(endOfMonth, 'ALTO', new Date('2026-03-01T00:00:00Z')).evidencia('EV-01')?.status === 'NO_CUMPLE',
    evaluate(endOfMonth, 'ALTO', new Date('2026-02-28T23:00:00Z')).deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );

  const antes = evaluate(BASE, 'ALTO', new Date('2025-12-01T12:00:00Z'));

  check(
    'on 01/12/2025 the 2024 v2.1 counts (v3.0 did not exist yet), expired on 10/03/2025',
    antes.evidencia('EV-01')?.status === 'NO_CUMPLE' && /v2\.1/.test(antes.deEvidencia('op.cont.2.1', 'EV-01')?.reason || ''),
    antes.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );

  const onlyFuture = evaluate(withIt({ 'P-01': ['Plan | v3.0 | 2026-01-15 | Comité | RS'] }), 'ALTO', new Date('2025-12-01T12:00:00Z'));

  check(
    'no approved version on that date: not proven (CONFIGURATION), never CUMPLE',
    onlyFuture.evidencia('EV-01')?.status === 'NO_EVALUABLE' && onlyFuture.evidencia('EV-01')?.gapCause === 'CONFIGURATION',
    onlyFuture.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
}

section('4. EV-04 and EV-06: what the organization declares missing or expired is NO_CUMPLE');

{
  const withoutContract = evaluate(withIt({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 2027-06-30 | 48 h', 'sede de respaldo | - |  |  | 24 h'] }));

  check(
    'a means without a contract: op.cont.2.3 measured NO_CUMPLE, and it names it',
    withoutContract.requisito('op.cont.2.3').status === 'NO_CUMPLE' && withoutContract.requisito('op.cont.2.3').evidenced === true && /sin acuerdo ni contrato: sede de respaldo/.test(withoutContract.motivo('op.cont.2.3')),
    withoutContract.motivo('op.cont.2.3')
  );
  check(
    'and the other four stay accredited (the plan is in force)',
    ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.4', 'op.cont.2.5'].every(id => withoutContract.requisito(id).status === 'CUMPLE' && withoutContract.requisito(id).attested === true)
  );

  const expired2 = evaluate(withIt({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 2026-06-30 | 48 h'] }));

  check(
    'a contract expired on 30/06: NO_CUMPLE with the date',
    expired2.evidencia('EV-04')?.status === 'NO_CUMPLE' && /venció el 2026-06-30/.test(expired2.deEvidencia('op.cont.2.3', 'EV-04')?.reason || ''),
    expired2.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );
  check(
    'reversal · the same contract evaluated on 15/06/2026: in force',
    evaluate(withIt({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 2026-06-30 | 48 h'] }), 'ALTO', new Date('2026-06-15T12:00:00Z')).evidencia('EV-04')?.status === 'CUMPLE'
  );

  const withoutDate = evaluate(withIt({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 |  | 48 h'] }));

  check(
    'a contract without a validity date: not proven (CONFIGURATION), not CUMPLE',
    withoutDate.evidencia('EV-04')?.status === 'NO_EVALUABLE' &&
      withoutDate.evidencia('EV-04')?.gapCause === 'CONFIGURATION' &&
      withoutDate.requisito('op.cont.2.3').status === 'NO_CUMPLE' &&
      withoutDate.requisito('op.cont.2.3').evidenced === false,
    withoutDate.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );

  const mala = evaluate(withIt({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 30/06/2027 | 48 h'] }));

  check(
    'a validity «30/06/2027» is not a date: CONFIGURATION, naming the means',
    mala.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /CPD alternativo \(CT-2025-014\): vigencia «30\/06\/2027»/.test(mala.deEvidencia('op.cont.2.3', 'EV-04')?.reason || ''),
    mala.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );
  check(
    'and the screen rejects it all the same',
    (() => {
      const p04 = configuration(withIt({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 30/06/2027 | 48 h'] })).parameters.find(p => p.id === 'P-04')!;

      return !validateParameterValue(p04, p04.value).valid;
    })()
  );

  const mixedOne = evaluate(withIt({ 'P-04': ['CPD alternativo | Proveedor X | CT-2025-014 | 2026-06-30 | 48 h', 'enlace | Operador Y | CT-9 |  | 4 h'] }));

  check(
    'an expired contract and another without a date: the breach prevails, and the other is mentioned',
    mixedOne.evidencia('EV-04')?.status === 'NO_CUMPLE' && /Además: P-04 no permite afirmar/.test(mixedOne.deEvidencia('op.cont.2.3', 'EV-04')?.reason || ''),
    mixedOne.deEvidencia('op.cont.2.3', 'EV-04')?.reason
  );

  const withoutRuiz = evaluate(withIt({ 'P-05': (BASE['P-05'] as string[]).filter(f => !f.startsWith('J. Ruiz')) }));

  check(
    'the deputy without registered training: op.cont.2.4 NO_CUMPLE, and it names them',
    withoutRuiz.requisito('op.cont.2.4').status === 'NO_CUMPLE' && /sin formación registrada en P-05: J\. Ruiz/.test(withoutRuiz.motivo('op.cont.2.4')),
    withoutRuiz.motivo('op.cont.2.4')
  );

  const unreadableRuiz = evaluate(withIt({ 'P-05': ['A. Martínez | coordinación | 2026-02-10 | 2027-02-10', 'J. Ruiz | coordinación (suplente) | 2026-02-10 | 10/02/2027', 'L. Gómez | conmutación | 2025-11-20 | 2026-11-20'] }));

  check(
    'the deputy\'s only row with unreadable validity: not proven (CONFIGURATION) naming the row, not «sin formación»',
    unreadableRuiz.evidencia('EV-06')?.status === 'NO_EVALUABLE' &&
      unreadableRuiz.evidencia('EV-06')?.gapCause === 'CONFIGURATION' &&
      /fila 2 \(J\. Ruiz\): vigencia «10\/02\/2027»/.test(unreadableRuiz.deEvidencia('op.cont.2.4', 'EV-06')?.reason || '') &&
      !/sin formación registrada/.test(unreadableRuiz.deEvidencia('op.cont.2.4', 'EV-06')?.reason || ''),
    unreadableRuiz.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );

  const expiredPlusUnreadable = evaluate(withIt({ 'P-05': ['A. Martínez | coordinación | 2026-02-10 | 2027-02-10', 'J. Ruiz | x | 2025-01-10 | 2026-01-10', 'J. Ruiz | renovación |  | ', 'L. Gómez | conmutación | 2025-11-20 | 2026-11-20'] }));

  check(
    'one expired row and another row without validity for the same person: not proven, not NO_CUMPLE',
    expiredPlusUnreadable.evidencia('EV-06')?.status === 'NO_EVALUABLE' && /fila 3 \(J\. Ruiz\)/.test(expiredPlusUnreadable.deEvidencia('op.cont.2.4', 'EV-06')?.reason || ''),
    expiredPlusUnreadable.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );
  check(
    'reversal · with the date well written, CUMPLE',
    evaluate(withIt({ 'P-05': ['A. Martínez | coordinación | 2026-02-10 | 2027-02-10', 'J. Ruiz | coordinación (suplente) | 2026-02-10 | 2027-02-10', 'L. Gómez | conmutación | 2025-11-20 | 2026-11-20'] })).evidencia('EV-06')?.status === 'CUMPLE'
  );
  check(
    'and a person with no row at all is still NO_CUMPLE even if there are unreadable rows of another',
    evaluate(withIt({ 'P-05': ['A. Martínez | coordinación | 2026-02-10 | 10/02/2027', 'L. Gómez | conmutación | 2025-11-20 | 2026-11-20'] })).evidencia('EV-06')?.status === 'NO_CUMPLE'
  );

  const lowerCase = evaluate(withIt({ 'P-05': ['a. martinez | coordinación | 2026-02-10 | 2027-02-10', 'J.  RUIZ | coordinación | 2026-02-10 | 2027-02-10', 'L. Gómez | conmutación | 2025-11-20 | 2026-11-20'] }));

  check(
    'reversal · «a. martinez» and «J.  RUIZ» are P-03\'s people (ignoring case, accents and extra spaces)',
    lowerCase.evidencia('EV-06')?.status === 'CUMPLE',
    lowerCase.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );
  check(
    'but never by similarity: «Martínez» is not «A. Martínez»',
    evaluate(withIt({ 'P-05': ['Martínez | coordinación | 2026-02-10 | 2027-02-10', 'J. Ruiz | x | 2026-02-10 | 2027-02-10', 'L. Gómez | x | 2025-11-20 | 2026-11-20'] })).evidencia('EV-06')?.status === 'NO_CUMPLE'
  );

  const expiredOne = evaluate(withIt({ 'P-05': ['A. Martínez | coordinación | 2025-02-10 | 2026-02-10', 'J. Ruiz | x | 2026-02-10 | 2027-02-10', 'L. Gómez | x | 2025-11-20 | 2026-11-20'] }));

  check(
    'training expired on 10/02: NO_CUMPLE with the date',
    expiredOne.evidencia('EV-06')?.status === 'NO_CUMPLE' && /A\. Martínez \(coordinación, venció el 2026-02-10/.test(expiredOne.deEvidencia('op.cont.2.4', 'EV-06')?.reason || ''),
    expiredOne.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );

  const renewed = evaluate(withIt({ 'P-05': ['A. Martínez | coordinación | 2025-02-10 | 2026-02-10', 'A. Martínez | coordinación (renovación) | 2026-02-09 | 2027-02-09', 'J. Ruiz | x | 2026-02-10 | 2027-02-10', 'L. Gómez | x | 2025-11-20 | 2026-11-20'] }));

  check('reversal · with the renewal in another row, valid', renewed.evidencia('EV-06')?.status === 'CUMPLE', renewed.deEvidencia('op.cont.2.4', 'EV-06')?.reason);

  const futureOne = evaluate(withIt({ 'P-05': ['A. Martínez | coordinación | 2026-11-15 | 2027-11-15', 'J. Ruiz | x | 2026-02-10 | 2027-02-10', 'L. Gómez | x | 2025-11-20 | 2026-11-20'] }));

  check(
    'training that will be received in November does not train today',
    futureOne.evidencia('EV-06')?.status === 'NO_CUMPLE' && /recibida el 2026-11-15, después de la fecha de la evaluación/.test(futureOne.deEvidencia('op.cont.2.4', 'EV-06')?.reason || ''),
    futureOne.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );

  const withoutP05 = evaluate(withIt({ 'P-05': undefined }));

  check(
    'empty P-05: not proven (CONFIGURATION), never CUMPLE nor an invented NO_CUMPLE',
    withoutP05.evidencia('EV-06')?.status === 'NO_EVALUABLE' && withoutP05.evidencia('EV-06')?.gapCause === 'CONFIGURATION' && withoutP05.requisito('op.cont.2.4').evidenced === false,
    withoutP05.deEvidencia('op.cont.2.4', 'EV-06')?.reason
  );
}

section('5. P-03, P-02 and P-06: a half row or unreadable duration is CONFIGURATION, with the row');

{
  const withoutActivities = evaluate(withIt({ 'P-03': ['coordinador de crisis | A. Martínez | J. Ruiz | ', 'responsable de sistemas | L. Gómez | - | conmutar'] }));

  check(
    'a function without activities: op.cont.2.1 not proven (CONFIGURATION), naming the row',
    withoutActivities.requisito('op.cont.2.1').status === 'NO_CUMPLE' &&
      withoutActivities.requisito('op.cont.2.1').evidenced === false &&
      /fila 1 \(coordinador de crisis\)/.test(withoutActivities.motivo('op.cont.2.1')),
    withoutActivities.motivo('op.cont.2.1')
  );
  check(
    'and EV-01 stays CUMPLE: the plan is not painted «sin medir» for a parameter that is not its own',
    withoutActivities.evidencia('EV-01')?.status === 'CUMPLE',
    `${withoutActivities.evidencia('EV-01')?.status} ${(withoutActivities.evidencia('EV-01')?.observations || [])[0]}`
  );

  const rto = evaluate(withIt({ 'P-02': ['sede electrónica | cuanto antes | 1 h | srv-web', 'correo corporativo | 8 h | 30 min | ldap-zimbra'] }));

  check(
    'an RTO «cuanto antes»: op.cont.2.2 not proven (CONFIGURATION), naming the service',
    rto.requisito('op.cont.2.2').evidenced === false && /fila 1 \(sede electrónica\): RTO «cuanto antes»/.test(rto.motivo('op.cont.2.2')),
    rto.motivo('op.cont.2.2')
  );
  check(
    'reversal · «1,5 horas», «2 días» and «45 min» are durations',
    evaluate(withIt({ 'P-02': ['sede electrónica | 1,5 horas | 45 min | srv-web', 'correo | 2 días | 4 h | x'] })).requisito('op.cont.2.2').status === 'CUMPLE'
  );
  check('an RTO «4» without a unit is not', evaluate(withIt({ 'P-02': ['sede | 4 | 1 h | x'] })).requisito('op.cont.2.2').evidenced === false);

  const withoutP06 = evaluate(withIt({ 'P-06': undefined }));

  check(
    'empty P-06: op.cont.2.5 not proven (CONFIGURATION)',
    withoutP06.requisito('op.cont.2.5').status === 'NO_CUMPLE' && withoutP06.requisito('op.cont.2.5').evidenced === false && /P-06 .* está sin configurar/.test(withoutP06.motivo('op.cont.2.5')),
    withoutP06.motivo('op.cont.2.5')
  );
}

section('6. attested: a measure in NO_CUMPLE always prevails over the declaration');

{
  const measuredAgainst = (t: ENSEvidenceResolved[]) =>
    t.map(e => (e.id === 'EV-04' ? { ...e, status: 'NO_CUMPLE' as const, observations: ['EV-04 medida: contrato rescindido.'] } : e));
  const r = evaluate(BASE, 'ALTO', NOW, measuredAgainst);

  check(
    'EV-04 measured as NO_CUMPLE: op.cont.2.3 NO_CUMPLE, without the mark',
    r.requisito('op.cont.2.3').status === 'NO_CUMPLE' && !r.requisito('op.cont.2.3').attested,
    r.requisito('op.cont.2.3').observations.join(' | ')
  );
  check(
    'and the observation explains it',
    r.requisito('op.cont.2.3').observations.some(o => /La medida manda sobre la acreditación documental: EV-04 NO_CUMPLE/.test(o))
  );
  check(
    'reversal · requirements not resting on EV-04 stay accredited',
    ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.4', 'op.cont.2.5'].every(id => r.requisito(id).status === 'CUMPLE' && r.requisito(id).attested === true)
  );
  check(
    'an accreditation does not fill evidences: the requirement\'s accredited decision is not in the table, only the evidence ones',
    evaluate().decisions.filter(d => d.attested).every(d => BASE_REQ.includes(d.trace.ruleId))
  );
}

section('7. Without parameters: NO_CUMPLE not proven for CONFIGURACIÓN, never for collection');

{
  const r = evaluate({});

  check(
    'the five NO_CUMPLE, not proven',
    all(r, id => r.requisito(id).status === 'NO_CUMPLE' && r.requisito(id).evidenced === false).length === 0,
    BASE_REQ.map(id => `${id}=${r.requisito(id).status}/${r.requisito(id).evidenced}`).join(' ')
  );
  check(
    'EV-01, EV-04 and EV-06 unmeasured by CONFIGURATION (P-01, P-04 and P-03 unconfigured)',
    ['EV-01', 'EV-04', 'EV-06'].every(id => r.evidencia(id)?.status === 'NO_EVALUABLE' && r.evidencia(id)?.gapCause === 'CONFIGURATION'),
    ['EV-01', 'EV-04', 'EV-06'].map(id => `${id}=${r.evidencia(id)?.status}/${r.evidencia(id)?.gapCause}`).join(' ')
  );

  const result = r.motor();
  const causes = result.nonConformities.map(nc => `${nc.id}:${nc.cause}`);

  check('the control does not comply and nothing is CUMPLE', result.status === 'NO_CUMPLE' && result.requirements.every(q => q.status !== 'CUMPLE'), result.status);
  check(
    'NC-CFG with P-01 and P-08, the mandatory ones',
    result.nonConformities.find(nc => nc.id === 'NC-CFG')?.parameterIds.join(',') === 'P-01,P-08',
    result.nonConformities.find(nc => nc.id === 'NC-CFG')?.parameterIds.join(',')
  );
  check(
    'all nonconformities by CONFIGURATION; none sends to restore collection',
    result.nonConformities.every(nc => nc.cause === 'CONFIGURATION' && !/RECOGIDA/.test(nc.requiredAction)),
    causes.join(' ')
  );

  const asIfExpectingFacts = evaluateENSControl(
    opCont2CatalogDefinition,
    configuration({}),
    'ALTO',
    resolveEvidenceForControl('op.cont.2', [], '000', 'ALTO', configuration({}), NOW),
    {
      controlId: 'op.cont.2',
      policyId: opCont2PolicyDefinition.id,
      evaluatedAt: NOW.toISOString(),
      decisions: r.decisions,
      appliedParameters: [],
      runtimeVariables: r.runtimeVariables,
    },
    [],
    true
  );

  check(
    'reversal · if it waited for facts, the same emptiness would come out as RECOGIDA',
    asIfExpectingFacts.nonConformities.some(nc => nc.cause === 'COLLECTION'),
    asIfExpectingFacts.nonConformities.map(nc => `${nc.id}:${nc.cause}`).join(' ')
  );

  const withoutP08 = evaluate(withIt({ 'P-08': undefined }));

  check(
    'without P-08: the plan has no validity to measure (CONFIGURATION)',
    withoutP08.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /P-08 .* está sin configurar/.test(withoutP08.deEvidencia('op.cont.2.1', 'EV-01')?.reason || ''),
    withoutP08.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
  check(
    'P-08 = 12,5: it must be a whole number of months (CONFIGURATION)',
    evaluate(withIt({ 'P-08': '12.5' })).evidencia('EV-01')?.gapCause === 'CONFIGURATION'
  );

  const badDate = evaluate(withIt({ 'P-01': ['Plan de Continuidad del Servicio | v3.0 | 15/01/2026 | Comité | RS'] }));

  check(
    'an approval date «15/01/2026»: CONFIGURATION, naming the row',
    badDate.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /fila 1 \(Plan de Continuidad del Servicio\): «15\/01\/2026»/.test(badDate.deEvidencia('op.cont.2.1', 'EV-01')?.reason || ''),
    badDate.deEvidencia('op.cont.2.1', 'EV-01')?.reason
  );
  check(
    'a plan version without version: CONFIGURATION',
    evaluate(withIt({ 'P-01': ['Plan de Continuidad del Servicio |  | 2026-01-15 | Comité | RS'] })).evidencia('EV-01')?.gapCause === 'CONFIGURATION'
  );
}

section('8. Whole engine: only with D at ALTO, in the manager row and without collection');

{
  const withValues = (global: Record<string, unknown>, values: Values): ENSConfigurationVersion => ({
    ...defaultENSConfigurationTemplate,
    global: {
      ...defaultENSConfigurationTemplate.global,
      clientName: 'Cliente de prueba',
      organization: 'Organización de prueba',
      scope: 'Laboratorio',
      ...global,
    } as ENSConfigurationVersion['global'],
    controls: defaultENSConfigurationTemplate.controls.map(control =>
      control.controlId !== 'op.cont.2' ? control : configuration(values)
    ),
  });

  const evaluateEngine = (global: Record<string, unknown>, level: ENSLevel, values: Values = BASE) => {
    ensConfigurationRepository.replaceActive(withValues(global, values));

    return getENSComplianceResults(level, [], undefined, undefined, NOW).find(r => r.control.id === 'op.cont.2')!;
  };

  const highWithMediumD = evaluateEngine({ ensLevel: 'ALTO', availabilityLevel: 'MEDIO' }, 'ALTO');

  check(
    'category ALTA with D at MEDIO: NO_APLICA, and the policy decides nothing',
    highWithMediumD.status === 'NO_APLICA' && highWithMediumD.level === 'MEDIO' && (highWithMediumD.policyRuntime?.decisions || []).length === 0,
    `${highWithMediumD.status} ${highWithMediumD.level} ${(highWithMediumD.policyRuntime?.decisions || []).length}`
  );
  check(
    'and no evidence or requirement counts',
    highWithMediumD.requirements.every(q => q.status === 'NO_APLICA') && highWithMediumD.evidences.every(e => e.status === 'NO_APLICA')
  );

  const media = evaluateEngine({ ensLevel: 'MEDIO' }, 'MEDIO');

  check('category MEDIA without D: NO_APLICA (the owner\'s goal)', media.status === 'NO_APLICA', media.status);
  check(
    'report at MEDIA: everything NO_APLICA and says why',
    buildOpCont2ReportModel(media).fields.every(f => f.status === 'NO_APLICA') && /solo se exige con nivel ALTO de Disponibilidad/.test(buildOpCont2ReportModel(media).fields[1].value)
  );

  const mediumWithHighD = evaluateEngine({ ensLevel: 'MEDIO', availabilityLevel: 'ALTO' }, 'MEDIO');

  check(
    'reversal · category MEDIA with D at ALTO: it is required, and with everything in force, accredited CUMPLE',
    mediumWithHighD.status === 'CUMPLE' && mediumWithHighD.level === 'ALTO' && mediumWithHighD.requirements.filter(q => BASE_REQ.includes(q.id)).every(q => q.attested),
    `${mediumWithHighD.status} ${mediumWithHighD.level}`
  );

  const emptyHigh = evaluateEngine({ ensLevel: 'ALTO' }, 'ALTO', {});

  check(
    'category ALTA without parameters, through the engine: all by CONFIGURATION, nothing by collection',
    emptyHigh.status === 'NO_CUMPLE' &&
      emptyHigh.nonConformities.length > 0 &&
      emptyHigh.nonConformities.every(nc => nc.cause === 'CONFIGURATION') &&
      emptyHigh.evidences
        .filter(e => e.status === 'NO_EVALUABLE')
        .every(e => e.observations.some(o => /está sin configurar/.test(o)) && !e.observations.some(o => /ningún evento|recogida|RECOGIDA/.test(o))),
    emptyHigh.nonConformities.map(nc => `${nc.id}:${nc.cause}`).join(' ') +
      ' | ' +
      emptyHigh.evidences.filter(e => e.status === 'NO_EVALUABLE').map(e => `${e.id}: ${e.observations.join(' / ')}`).join(' || ')
  );

  ensConfigurationRepository.replaceActive(withValues({ ensLevel: 'ALTO' }, BASE));

  const scope = [
    { id: '001', name: 'wazuh-real', groups: ['ens'] },
    { id: '000', name: 'Wazuh-4', groups: [], isManager: true },
  ];
  const estado = getENSComplianceState('ALTO', [], undefined, scope, NOW);
  const managerRow = estado.agents.find(a => a.agentId === '000');
  const agentRow = estado.agents.find(a => a.agentId === '001');

  check('it is evaluated in the manager row', Boolean(managerRow?.results.some(x => x.control.id === 'op.cont.2')));
  check('and not in an agent\'s', Boolean(agentRow) && !agentRow!.results.some(x => x.control.id === 'op.cont.2'));
  check(
    'the consolidated accredited CUMPLE over the manager row',
    estado.results.find(x => x.control.id === 'op.cont.2')?.status === 'CUMPLE' &&
      JSON.stringify(estado.results.find(x => x.control.id === 'op.cont.2')?.consolidatedAgents?.map(a => a.agentId)) === '["000"]',
    estado.results.find(x => x.control.id === 'op.cont.2')?.status
  );

  ensConfigurationRepository.reset();
}

console.log(`\n${failures.length ? `${failures.length} FAIL` : 'ALL OK'}`);

if (failures.length) {
  process.exit(1);
}
