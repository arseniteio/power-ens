/** mp.info.6: judgment of backups from facts. */
import { ENSCatalog } from '../common/ens/catalog';
import { mpInfo6CatalogDefinition } from '../common/ens/catalog/mp-info-6';
import { mpInfo6Configuration } from '../common/ens/configuration/data/mp-info-6-parameters';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { assertENSConfigurationVersion } from '../common/ens/configuration/services/configuration-structure-validator';
import { validateControlConfiguration } from '../common/ens/configuration/services/validation-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../common/ens/core/policy-runtime/policy-runtime';
import {
  MP_INFO_6_REQUIREMENTS,
  mpInfo6PolicyDefinition,
} from '../common/ens/core/policy-runtime/policies/mp-info-6.policy';
import { buildENSReportModel } from '../public/ens/reports/registry';
import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
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

const {
  getENSComplianceResultByControl,
  getENSComplianceState,
} = require('../common/ens/core/ens-engine') as typeof import('../common/ens/core/ens-engine');

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

const CONTROL = 'mp.info.6';
const NOW = new Date('2026-09-30T12:00:00Z');
const HORA = 60 * 60 * 1000;
const DAY = 24 * HORA;

const ago = (horas: number): string =>
  new Date(NOW.getTime() - horas * HORA).toISOString().replace('.000Z', 'Z');

const PASS = ago(55 / 60);

const RULE: Record<string, string> = {
  backup_run: '106601',
  backup_schedule: '106602',
  backup_retention: '106603',
  backup_access: '106604',
  backup_storage: '106605',
  restore_test: '106606',
  evidence_state: '106650',
  collector_run: '106797',
  collector_warning: '106798',
  collector_missing: '106799',
};

const EVIDENCE: Record<string, string> = {
  backup_run: 'EV-01,EV-02',
  backup_schedule: 'EV-02',
  backup_retention: 'EV-03',
  backup_access: 'EV-04',
  backup_storage: 'EV-06',
  restore_test: 'EV-05',
};

type Linea = Record<string, string | number>;

const linea = (event: string, campos: Linea = {}, ts: string = PASS): Linea => ({
  ensfacil: CONTROL,
  ts,
  host: 'srv-01',
  event,
  ...(EVIDENCE[event] ? { evidence_id: EVIDENCE[event] } : {}),
  origen: 'pbs',
  objeto: 'fichero',
  ...campos,
});

const heartbeat = (ts: string = PASS, campos: Linea = {}): Linea =>
  linea(
    'collector_run',
    {
      resultado: 'completada',
      evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06',
      evidencias_miradas: 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06',
      rol: 'pbs',
      ...campos,
    },
    ts
  );

const copy = (campos: Linea = {}, ts: string = PASS): Linea =>
  linea(
    'backup_run',
    {
      ultima_correcta: ago(10),
      ultima_fallida: '-',
      resultado_ultima: 'ok',
      tipo: 'completa',
      tamano_bytes: 1073741824,
      destino: 'pbs01:datastore1',
      ...campos,
    },
    ts
  );

let counter = 0;

type Agente = { id: string; name: string };

const SRV01: Agente = { id: '001', name: 'srv-01' };
const SRV02: Agente = { id: '002', name: 'srv-02' };

const alert = (l: Linea, agent: Agente) => {
  counter += 1;

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': l.ts,
      agent: agent,
      rule: { id: RULE[String(l.event)] || '106600', description: 'mp.info.6' },
      location: '/var/log/ensfacil/mp_info_6.json',
      data: Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v)])),
    },
  };
};

const events = (lineas: Linea[], agent: Agente = SRV01): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(lineas.map(l => alert(l, agent)));

type Valores = Record<string, string | string[] | undefined>;

const BASE: Valores = {
  'P-01': '24',
  'P-02': '4',
  'P-03': '30',
  'P-04': 'srv-01',
  'P-05': '7',
  'P-06': '/backup',
  'P-07': 'root,backup',
  'P-10': 'pbs',
};

const configuration = (valores: Valores): ENSControlConfiguration => ({
  ...mpInfo6Configuration,
  parameters: mpInfo6Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

const evaluate = (
  evs: ENSNormalizedEvent[],
  valores: Valores = BASE,
  level: ENSLevel = 'MEDIO',
  now: Date = NOW
) => {
  const cfg = configuration(valores);
  const delControl = keepLatestRunStateFacts(CONTROL, evs, now);
  const evidences = resolveEvidenceForControl(CONTROL, delControl, SRV01.id, level, cfg, now);
  const context = buildPolicyContext(mpInfo6CatalogDefinition, cfg, level, delControl, evidences, now);
  const { decisions } = runPolicyRuntime(context);
  const tabla = applyPolicyDecisionsToEvidences(evidences, decisions, mpInfo6CatalogDefinition.requirements);
  const requirement = (id: string) =>
    evaluateRequirement(
      mpInfo6CatalogDefinition.requirements.find(q => q.id === id)!,
      level,
      tabla,
      false,
      decisions,
      'ACTIVE'
    );
  const evidence = (id: string) => tabla.find(e => e.id === id);
  const motive = (id: string) =>
    decisions.find(d => d.evidenceIds.length === 1 && d.evidenceIds[0] === id)?.reason || '';
  const estado = (id: string) => evidence(id)?.status;
  const cause = (id: string) => evidence(id)?.gapCause;
  const measure = (id: string) =>
    decisions.find(d => d.evidenceIds.length === 1 && d.evidenceIds[0] === id)?.status;

  return { decisions, requisito: requirement, evidencia: evidence, motivo: motive, estado, causa: cause, medida: measure };
};

section('0. The catalog');

{
  check('mp.info.6 declares its scope in P-04', mpInfo6CatalogDefinition.scopeParameter === 'P-04', mpInfo6CatalogDefinition.scopeParameter);
  check('and is still measured on the agents\' plane', mpInfo6CatalogDefinition.measurementPlanes === undefined);
}

section('1. The last correct backup, 10 h ago');

{
  const r = evaluate(events([copy(), heartbeat()]));

  check('EV-01 CUMPLE: there is a correct backup and the last pass does not contradict it', r.estado('EV-01') === 'CUMPLE', `${r.estado('EV-01')} ${r.motivo('EV-01')}`);
  check('EV-02 CUMPLE: 10 h within P-01 + P-02 = 28 h', r.estado('EV-02') === 'CUMPLE', `${r.estado('EV-02')} ${r.motivo('EV-02')}`);
  check('mp.info.6.2.a CUMPLE measured', r.requisito('mp.info.6.2.a').status === 'CUMPLE' && r.requisito('mp.info.6.2.a').evidenced === true, r.requisito('mp.info.6.2.a').status);
  check('EV-07 CUMPLE: recent heartbeat with declared coverage', r.estado('EV-07') === 'CUMPLE', `${r.estado('EV-07')} ${r.motivo('EV-07')}`);

  const withoutHeartbeat = evaluate(events([copy()]));
  check('REVERSAL: without a heartbeat, EV-07 cannot be asserted (NO_EVALUABLE by RECOGIDA)', withoutHeartbeat.estado('EV-07') === 'NO_EVALUABLE' && withoutHeartbeat.causa('EV-07') === 'COLLECTION', `${withoutHeartbeat.estado('EV-07')} ${withoutHeartbeat.causa('EV-07')}`);
}

section('2. The last correct backup, 30 h ago (> 24 + 4)');

{
  const r = evaluate(events([copy({ ultima_correcta: ago(30) }), heartbeat()]));

  check('EV-02 NO_CUMPLE', r.estado('EV-02') === 'NO_CUMPLE', `${r.estado('EV-02')} ${r.motivo('EV-02')}`);
  check('the motive cites the measured hours and the deadline', /30\.0 h/.test(r.motivo('EV-02')) && /28 h/.test(r.motivo('EV-02')), r.motivo('EV-02'));
  check('EV-01 is still CUMPLE: the backup exists and the last pass does not contradict it', r.estado('EV-01') === 'CUMPLE', r.motivo('EV-01'));

  const loose = evaluate(events([copy({ ultima_correcta: ago(30) }), heartbeat()]), { ...BASE, 'P-02': '8' });
  check('REVERSAL: the same fact with P-02 = 8 h (deadline 32 h) → CUMPLE', loose.estado('EV-02') === 'CUMPLE', loose.motivo('EV-02'));

  const withoutP01 = evaluate(events([copy({ ultima_correcta: ago(30) }), heartbeat()]), { ...BASE, 'P-01': undefined });
  check('without P-01 → EV-02 NO_EVALUABLE by CONFIGURACIÓN, never a verdict', withoutP01.estado('EV-02') === 'NO_EVALUABLE' && withoutP01.causa('EV-02') === 'CONFIGURATION', `${withoutP01.estado('EV-02')} ${withoutP01.causa('EV-02')}`);
}

section('3. There was never a correct backup (ultima_correcta=-, resultado_ultima=error)');

{
  const r = evaluate(events([copy({ ultima_correcta: '-', ultima_fallida: ago(2), resultado_ultima: 'error' }), heartbeat()]));

  check('EV-01 NO_CUMPLE measured', r.estado('EV-01') === 'NO_CUMPLE', `${r.estado('EV-01')} ${r.motivo('EV-01')}`);
  check('EV-02 NO_CUMPLE measured', r.estado('EV-02') === 'NO_CUMPLE', `${r.estado('EV-02')} ${r.motivo('EV-02')}`);
  check(
    'mp.info.6.2.a NO_CUMPLE and PROVEN (it is not a measurement gap)',
    r.requisito('mp.info.6.2.a').status === 'NO_CUMPLE' && r.requisito('mp.info.6.2.a').evidenced === true,
    `${r.requisito('mp.info.6.2.a').status} evidenced=${r.requisito('mp.info.6.2.a').evidenced}`
  );

  const failedAfter = evaluate(events([copy({ ultima_fallida: ago(2), resultado_ultima: 'error' }), heartbeat()]));
  check('a correct backup from 10 h ago and the last one with an error 2 h ago → EV-01 NO_CUMPLE (the last pass contradicts it)', failedAfter.estado('EV-01') === 'NO_CUMPLE', failedAfter.motivo('EV-01'));
}

section('4. Solo evidence_state NO_EVALUABLE (CONFIGURATION) para EV-01');

{
  const degraded = linea('evidence_state', {
    evidence_id: 'EV-01',
    estado: 'NO_EVALUABLE',
    causa: 'CONFIGURATION',
    motivo: 'no hay datastore del PBS declarado en /etc/ensfacil/mpinfo6.env',
  });
  const r = evaluate(events([degraded, heartbeat()]));

  check('EV-01 NO_EVALUABLE with the cause the collector declares', r.estado('EV-01') === 'NO_EVALUABLE' && r.causa('EV-01') === 'CONFIGURATION', `${r.estado('EV-01')} ${r.causa('EV-01')}`);
  check('and its motive', /datastore del PBS/.test(r.motivo('EV-01')), r.motivo('EV-01'));
  check('mp.info.6.1 not proven, never a measured NO_CUMPLE', r.requisito('mp.info.6.1').evidenced === false, `${r.requisito('mp.info.6.1').status} evidenced=${r.requisito('mp.info.6.1').evidenced}`);

  const verdict = linea('evidence_state', { evidence_id: 'EV-03', estado: 'CUMPLE', motivo: 'retención correcta' });
  const withVerdict = evaluate(events([verdict, heartbeat()]));
  check(
    'an evidence_state with a verdict is not read by the policy: EV-03 stays unmeasured',
    withVerdict.medida('EV-03') === 'NO_EVALUABLE' && !/retención correcta/.test(withVerdict.motivo('EV-03')),
    `${withVerdict.medida('EV-03')} ${withVerdict.motivo('EV-03')}`
  );
}

section('5. EV-03 · retention configured against P-03');

{
  const retention = (days: string) =>
    linea('backup_retention', { retencion_dias: days, copia_mas_antigua: ago(20 * 24) });

  const corta = evaluate(events([retention('14'), heartbeat()]));
  check('retencion_dias=14 with P-03=30 → EV-03 NO_CUMPLE', corta.estado('EV-03') === 'NO_CUMPLE' && /14/.test(corta.motivo('EV-03')), `${corta.estado('EV-03')} ${corta.motivo('EV-03')}`);

  const long = evaluate(events([retention('45'), heartbeat()]));
  check('REVERSAL: retencion_dias=45 → CUMPLE', long.estado('EV-03') === 'CUMPLE', long.motivo('EV-03'));
}

section('6. EV-04 · accounts with read access against P-07');

{
  const access = (accounts: string) =>
    linea('backup_access', {
      ruta: '/backup',
      modo: '750',
      propietario: 'root',
      grupo: 'backup',
      cuentas_con_lectura: accounts,
      clave_ruta: '/etc/proxmox-backup-client/encryption-key.json',
      clave_modo: '600',
    });

  const foreign = evaluate(events([access('root,backup,www-data'), heartbeat()]));
  check('root,backup,www-data with P-07=root,backup → NO_CUMPLE naming www-data', foreign.estado('EV-04') === 'NO_CUMPLE' && /www-data/.test(foreign.motivo('EV-04')), `${foreign.estado('EV-04')} ${foreign.motivo('EV-04')}`);

  const own = evaluate(events([access('root,backup'), heartbeat()]));
  check('REVERSAL: root,backup → CUMPLE', own.estado('EV-04') === 'CUMPLE', own.motivo('EV-04'));

  const clave = evaluate(events([{ ...access('root,backup'), clave_modo: '644' }, heartbeat()]));
  check('the encryption key readable by others (644) → NO_CUMPLE', clave.estado('EV-04') === 'NO_CUMPLE' && /clave/.test(clave.motivo('EV-04')), clave.motivo('EV-04'));

  const conClave = (mode: string) => evaluate(events([{ ...access('root,backup'), clave_modo: mode }, heartbeat()]));
  const RUTA_CLAVE = /\/etc\/proxmox-backup-client\/encryption-key\.json/;

  const group = conClave('0640');
  check(
    'the encryption key readable by its group (0640) → NO_CUMPLE naming the key and the mode',
    group.estado('EV-04') === 'NO_CUMPLE' && RUTA_CLAVE.test(group.motivo('EV-04')) && /0640/.test(group.motivo('EV-04')),
    `${group.estado('EV-04')} ${group.motivo('EV-04')}`
  );

  const others = conClave('0644');
  check(
    'the encryption key readable by group and others (0644) → NO_CUMPLE naming the key and the mode',
    others.estado('EV-04') === 'NO_CUMPLE' && RUTA_CLAVE.test(others.motivo('EV-04')) && /0644/.test(others.motivo('EV-04')),
    `${others.estado('EV-04')} ${others.motivo('EV-04')}`
  );

  const othersOnly = conClave('0604');
  check(
    'the encryption key readable only by others (0604) → NO_CUMPLE',
    othersOnly.estado('EV-04') === 'NO_CUMPLE' && /0604/.test(othersOnly.motivo('EV-04')),
    `${othersOnly.estado('EV-04')} ${othersOnly.motivo('EV-04')}`
  );

  const owner = conClave('0600');
  check('REVERSAL: the key with 0600 → CUMPLE', owner.estado('EV-04') === 'CUMPLE', `${owner.estado('EV-04')} ${owner.motivo('EV-04')}`);

  const readOnly = conClave('0400');
  check('REVERSAL: the key with 0400 → CUMPLE', readOnly.estado('EV-04') === 'CUMPLE', `${readOnly.estado('EV-04')} ${readOnly.motivo('EV-04')}`);

  const groupWrite = conClave('0620');
  check('REVERSAL: group write without read (0620) does not count as read → CUMPLE', groupWrite.estado('EV-04') === 'CUMPLE', `${groupWrite.estado('EV-04')} ${groupWrite.motivo('EV-04')}`);
}

section('7. EV-05 · the restore test against P-05');

{
  const test = (days: number, campos: Linea = {}) =>
    linea(
      'restore_test',
      {
        origen: 'zimbra-ne',
        objeto: 'buzones',
        fecha: ago(days * 24),
        testigo: 'testigo@ejemplo.invalid',
        resultado: 'ok',
        coincide: 'si',
        limpieza: 'ok',
        detalle: 'mensaje de control presente',
        ...campos,
      },
      ago(days * 24)
    );

  const recent = evaluate(events([test(3), heartbeat()]));
  check('ok and matches 3 days ago with P-05=7 → EV-05 CUMPLE', recent.estado('EV-05') === 'CUMPLE', `${recent.estado('EV-05')} ${recent.motivo('EV-05')}`);

  const old2 = evaluate(events([test(9), heartbeat()]));
  check('REVERSAL: the same test 9 days ago → NO_CUMPLE', old2.estado('EV-05') === 'NO_CUMPLE', `${old2.estado('EV-05')} ${old2.motivo('EV-05')}`);

  const dirty = evaluate(events([test(3, { limpieza: 'error' }), heartbeat()]));
  check(
    'ok and matches but limpieza=error → NO_EVALUABLE by EVIDENCIA, never CUMPLE',
    dirty.estado('EV-05') === 'NO_EVALUABLE' && dirty.causa('EV-05') === 'EVIDENCE',
    `${dirty.estado('EV-05')} ${dirty.causa('EV-05')}`
  );
  check(
    'with the motive «restauración correcta pero la cuenta restaurada no se pudo borrar»',
    dirty.motivo('EV-05').includes('restauración correcta pero la cuenta restaurada no se pudo borrar'),
    dirty.motivo('EV-05')
  );

  const failedOne = evaluate(events([test(3), test(1, { resultado: 'ok', coincide: 'no' }), heartbeat()]));
  check('the most recent test does not match → NO_CUMPLE even if the earlier one was good', failedOne.estado('EV-05') === 'NO_CUMPLE', failedOne.motivo('EV-05'));

  const low = evaluate(events([test(9), heartbeat()]), BASE, 'BAJO');
  check('at level BAJO, R1 does not apply', low.requisito('mp.info.6.r1.1').status === 'NO_APLICA', low.requisito('mp.info.6.r1.1').status);

  const byCriticality = evaluate(events([test(9), heartbeat()]), { ...BASE, 'P-04': 'srv-01 | MEDIA', 'P-05': 'ALTA=7; MEDIA=14' });
  check('P-05 by criticality: srv-01 is MEDIA in P-04, deadline 14 days → the 9-day-old test CUMPLE', byCriticality.estado('EV-05') === 'CUMPLE', byCriticality.motivo('EV-05'));
}

section('8. EV-06 · the off-machine copy (level ALTO)');

{
  const destination = (same2: string, active: string, name: string) =>
    linea('backup_storage', { destino: name, misma_maquina: same2, tipo: same2 === 'si' ? 'local' : 'remoto', activo: active });

  const soloLocal = evaluate(events([destination('si', 'si', '/backup'), heartbeat()]), BASE, 'ALTO');
  check('only misma_maquina=si → EV-06 NO_CUMPLE', soloLocal.estado('EV-06') === 'NO_CUMPLE', `${soloLocal.estado('EV-06')} ${soloLocal.motivo('EV-06')}`);

  const withRemote = evaluate(events([destination('si', 'si', '/backup'), destination('no', 'si', 'pbs-dr:datastore2'), heartbeat()]), BASE, 'ALTO');
  check('REVERSAL: with one misma_maquina=no and activo=si → CUMPLE', withRemote.estado('EV-06') === 'CUMPLE', withRemote.motivo('EV-06'));

  const inactive = evaluate(events([destination('si', 'si', '/backup'), destination('no', 'no', 'pbs-dr:datastore2'), heartbeat()]), BASE, 'ALTO');
  check('an inactive remote destination does not count → NO_CUMPLE', inactive.estado('EV-06') === 'NO_CUMPLE', inactive.motivo('EV-06'));
}

section('9. Scope by P-04');

{
  const LEVEL: ENSLevel = 'MEDIO';
  const SCOPE: ENSAgentScope[] = [
    { id: SRV01.id, name: SRV01.name, groups: ['ens'] },
    { id: SRV02.id, name: SRV02.name, groups: ['ens'] },
  ];

  const active2 = (valores: Valores): void => {
    ensConfigurationRepository.replaceActive({
      ...defaultENSConfigurationTemplate,
      global: { ...defaultENSConfigurationTemplate.global, ensLevel: LEVEL },
      scope: { mode: 'group', agentIds: [], groupIds: ['ens'] },
      controls: defaultENSConfigurationTemplate.controls.map(c =>
        c.controlId === CONTROL ? configuration(valores) : c
      ),
    } as ENSConfigurationVersion);
  };

  const FACTS = [
    ...events(
      [
        copy({ host: 'srv-02', ultima_correcta: '-', ultima_fallida: ago(2), resultado_ultima: 'error' }),
        heartbeat(PASS, { host: 'srv-02' }),
      ],
      SRV02
    ),
    ...normalizeWazuhAlerts([
      {
        _id: 'op-exp-1-latido',
        _source: {
          '@timestamp': PASS,
          agent: SRV02,
          rule: { id: '110299', description: 'op.exp.1' },
          data: { ensfacil: 'op.exp.1', event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-05' },
        },
      },
    ]),
  ];

  const deControl = (results: { control: { id: string } }[], id: string) =>
    results.find(r => r.control.id === id) as any;

  const withoutData = (r: any): boolean =>
    Boolean(r) &&
    r.status === 'NO_CUMPLE' &&
    r.measuredRequirements === 0 &&
    r.evidences.filter((e: any) => e.status !== 'NO_APLICA').every((e: any) => e.status === 'NO_EVALUABLE') &&
    r.nonConformities
      .filter((n: any) => n.id !== 'NC-CFG')
      .every((n: any) => n.origin === 'NO_EVIDENCIADA' && n.cause === 'COLLECTION');

  active2(BASE);

  {
    const estado = getENSComplianceState(LEVEL, FACTS, undefined, SCOPE, NOW);
    const row01 = estado.agents.find(a => a.agentId === SRV01.id)!;
    const row02 = estado.agents.find(a => a.agentId === SRV02.id)!;
    const itsOwn = deControl(row01.results, CONTROL);

    check('srv-01 is in P-04 and has sent nothing: mp.info.6 APPEARS in its row', Boolean(itsOwn), row01.results.map(r => r.control.id).join(', '));
    check('and appears «sin datos»: NO_CUMPLE with nothing proven, evidences NO_EVALUABLE, RECOGIDA findings', withoutData(itsOwn), JSON.stringify(itsOwn && { status: itsOwn.status, medidos: itsOwn.measuredRequirements, nc: itsOwn.nonConformities.map((n: any) => `${n.id}:${n.origin}/${n.cause}`) }));
    check(
      'just like another control measured by its policy on that machine without facts (op.exp.8)',
      withoutData(deControl(row01.results, 'op.exp.8')) &&
        deControl(row01.results, 'op.exp.8').status === itsOwn?.status,
      deControl(row01.results, 'op.exp.8')?.status
    );
    check('srv-02 is outside P-04: mp.info.6 does NOT appear in its row', !deControl(row02.results, CONTROL), row02.results.map(r => r.control.id).join(', '));
    check('and its row does not count mp.info.6 in the summary', row02.summary.totalControls === row01.summary.totalControls - 1, `${row02.summary.totalControls} frente a ${row01.summary.totalControls}`);

    const consolidated = deControl(estado.results, CONTROL);
    check(
      'the consolidated summarizes only srv-01: srv-02\'s failed backup neither adds nor subtracts',
      JSON.stringify(consolidated?.consolidatedAgents?.map((a: any) => a.agentId)) === '["001"]' && consolidated.measuredRequirements === 0,
      JSON.stringify(consolidated?.consolidatedAgents)
    );

    check('control detail in srv-02\'s view → no result', getENSComplianceResultByControl(CONTROL, LEVEL, FACTS, SRV02.id, SCOPE, NOW) === undefined);
    check('control detail in srv-01\'s view → «sin datos»', withoutData(getENSComplianceResultByControl(CONTROL, LEVEL, FACTS, SRV01.id, SCOPE, NOW)));
    check(
      'control detail, consolidated → only srv-01',
      JSON.stringify(getENSComplianceResultByControl(CONTROL, LEVEL, FACTS, undefined, SCOPE, NOW)?.consolidatedAgents?.map(a => a.agentId)) === '["001"]'
    );
  }

  active2({ ...BASE, 'P-04': 'SRV-01 | ALTA' });

  {
    const estado = getENSComplianceState(LEVEL, FACTS, undefined, SCOPE, NOW);

    check(
      'P-04 = «SRV-01 | ALTA» also includes srv-01',
      Boolean(deControl(estado.agents.find(a => a.agentId === SRV01.id)!.results, CONTROL))
    );
  }

  active2({ ...BASE, 'P-04': ['srv-01', 'srv-02'] });

  {
    const estado = getENSComplianceState(LEVEL, FACTS, undefined, SCOPE, NOW);
    const itsOwn = deControl(estado.agents.find(a => a.agentId === SRV02.id)!.results, CONTROL);

    check(
      'REVERSAL: with srv-02 in P-04, its failed backup comes out measured NO_CUMPLE in its row',
      Boolean(itsOwn) && itsOwn.requirements.some((q: any) => q.id === 'mp.info.6.2.a' && q.status === 'NO_CUMPLE' && q.evidenced === true),
      itsOwn && itsOwn.requirements.map((q: any) => `${q.id}:${q.status}/${q.evidenced}`).join(' ')
    );
  }

  active2({ ...BASE, 'P-04': undefined });

  {
    const estado = getENSComplianceState(LEVEL, FACTS, undefined, SCOPE, NOW);
    const consolidated = deControl(estado.results, CONTROL);
    const requirements = (consolidated?.nonConformities || []).filter((n: any) => n.id !== 'NC-CFG');

    check('empty P-04: mp.info.6 appears in no row', estado.agents.every(a => !deControl(a.results, CONTROL)));
    check('but it does in the consolidated: the panel has the whole catalog', Boolean(consolidated));
    check(
      'the consolidated MEASURE is NO_EVALUABLE: no evidence measured, no requirement proven',
      Boolean(consolidated) &&
        consolidated.measuredRequirements === 0 &&
        consolidated.evidences.filter((e: any) => e.status !== 'NO_APLICA').every((e: any) => e.status === 'NO_EVALUABLE'),
      consolidated && consolidated.evidences.map((e: any) => `${e.id}:${e.status}`).join(' ')
    );
    check(
      'with cause CONFIGURACIÓN, never a measured NO_CUMPLE nor a collection failure',
      requirements.length > 0 &&
        requirements.every((n: any) => n.origin === 'NO_EVIDENCIADA' && n.cause === 'CONFIGURATION'),
      requirements.map((n: any) => `${n.requirementId}:${n.origin}/${n.cause}`).join(' ')
    );
    check(
      'and the control\'s verdict is the common convention\'s: not proven, NO_CUMPLE at 0 %',
      Boolean(consolidated) && consolidated.status === 'NO_CUMPLE' && consolidated.score === 0,
      consolidated && `${consolidated.status} ${consolidated.score}`
    );
    check(
      'the control detail says the same',
      (getENSComplianceResultByControl(CONTROL, LEVEL, FACTS, undefined, SCOPE, NOW)?.nonConformities || [])
        .filter(n => n.id !== 'NC-CFG')
        .every(n => n.cause === 'CONFIGURATION')
    );
  }

  ensConfigurationRepository.reset();
}

section('10. Zimbra NE: mailboxes and directory on the same machine, the worst prevails');

{
  const zimbra = (object: string, campos: Linea = {}) =>
    copy({ origen: 'zimbra-ne', objeto: object, tipo: object === 'buzones' ? 'incremental' : 'volcado', destino: '/opt/zimbra/backup', ...campos });

  const dosBien = evaluate(events([zimbra('buzones'), zimbra('directorio'), heartbeat(PASS, { rol: 'buzones,directorio' })]));
  check('mailboxes and directory with a correct backup → EV-01 CUMPLE', dosBien.estado('EV-01') === 'CUMPLE', dosBien.motivo('EV-01'));
  check('and the motive names both objects', /buzones/.test(dosBien.motivo('EV-01')) && /directorio/.test(dosBien.motivo('EV-01')), dosBien.motivo('EV-01'));

  const directoryBad = evaluate(
    events([
      zimbra('buzones'),
      zimbra('directorio', { ultima_correcta: '-', ultima_fallida: ago(3), resultado_ultima: 'error' }),
      heartbeat(PASS, { rol: 'buzones,directorio' }),
    ])
  );
  check('the directory without a correct backup → EV-01 NO_CUMPLE even if the mailboxes are fine', directoryBad.estado('EV-01') === 'NO_CUMPLE' && /directorio/.test(directoryBad.motivo('EV-01')), directoryBad.motivo('EV-01'));

  const directoryUnmeasured = evaluate(
    events([
      zimbra('buzones'),
      linea('evidence_state', { origen: 'zimbra-ne', objeto: 'directorio', evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'zmslapcat no responde' }),
      heartbeat(PASS, { rol: 'buzones,directorio' }),
    ])
  );
  check(
    'mailboxes fine and the directory unmeasurable → EV-01 NO_EVALUABLE, never CUMPLE',
    directoryUnmeasured.estado('EV-01') === 'NO_EVALUABLE' && directoryUnmeasured.causa('EV-01') === 'COLLECTION',
    `${directoryUnmeasured.estado('EV-01')} ${directoryUnmeasured.motivo('EV-01')}`
  );
}

section('10b. Two backups of the same object in the same pass (backup_id)');

{
  const twoBackups = evaluate(
    events([
      copy({ backup_id: 'host_opt-zimbra', ultima_correcta: ago(10) }),
      copy({ backup_id: 'host_root', ultima_correcta: ago(40), cuentas: 'root', campo_que_nadie_espera: 'x' }),
      heartbeat(),
    ])
  );
  check('host_opt-zimbra 10 h ago and host_root 40 h ago → EV-02 NO_CUMPLE', twoBackups.estado('EV-02') === 'NO_CUMPLE', `${twoBackups.estado('EV-02')} ${twoBackups.motivo('EV-02')}`);
  check('naming host_root', /host_root/.test(twoBackups.motivo('EV-02')), twoBackups.motivo('EV-02'));

  const bothUpToDate = evaluate(
    events([
      copy({ backup_id: 'host_opt-zimbra', ultima_correcta: ago(10) }),
      copy({ backup_id: 'host_root', ultima_correcta: ago(12), cuentas: 'root', campo_que_nadie_espera: 'x' }),
      heartbeat(),
    ])
  );
  check('REVERSAL: both up to date → CUMPLE (and unknown fields do not interfere)', bothUpToDate.estado('EV-02') === 'CUMPLE', bothUpToDate.motivo('EV-02'));
}

section('12. Two collectors on the same machine: PBS and Zimbra NE');

{
  const PBS = ago(2);
  const ZIMBRA = ago(80 / 60);
  const zimbra = (object: string) =>
    copy({ origen: 'zimbra-ne', objeto: object, tipo: 'incremental', destino: '/opt/zimbra/backup' }, ZIMBRA);
  const zimbraHeartbeat = heartbeat(ZIMBRA, { origen: 'zimbra-ne', rol: 'buzones,directorio' });
  const zimbraPass = [zimbra('buzones'), zimbra('directorio'), zimbraHeartbeat];

  const oldPbs = evaluate(events([copy({ ultima_correcta: ago(40) }, PBS), heartbeat(PBS), ...zimbraPass]));
  check(
    'PBS at 10:00 with the backup from 40 h ago and Zimbra at 10:40 up to date → EV-02 NO_CUMPLE because of the file backup',
    oldPbs.estado('EV-02') === 'NO_CUMPLE' && /copia de ficheros \(pbs\)/.test(oldPbs.motivo('EV-02')),
    `${oldPbs.estado('EV-02')} ${oldPbs.motivo('EV-02')}`
  );
  check('and the Zimbra facts are judged too', /buzones/.test(oldPbs.motivo('EV-02')) || /buzones/.test(oldPbs.motivo('EV-01')), oldPbs.motivo('EV-01'));

  const pbsBien = evaluate(events([copy({ ultima_correcta: ago(12) }, PBS), heartbeat(PBS), ...zimbraPass]));
  check(
    'REVERSAL: the file backup from 12 h ago → EV-02 CUMPLE with the three objects',
    pbsBien.estado('EV-02') === 'CUMPLE' && ['ficheros', 'buzones', 'directorio'].every(o => pbsBien.motivo('EV-02').includes(o)),
    `${pbsBien.estado('EV-02')} ${pbsBien.motivo('EV-02')}`
  );
  check(
    'EV-07: both heartbeats, each with its origin → CUMPLE naming both',
    pbsBien.estado('EV-07') === 'CUMPLE' && /pbs/.test(pbsBien.motivo('EV-07')) && /zimbra-ne/.test(pbsBien.motivo('EV-07')),
    pbsBien.motivo('EV-07')
  );

  const pbsAnterior = ago(3);
  const withPreviousPass = evaluate(
    events([
      copy({ ultima_correcta: '-', ultima_fallida: ago(3.1), resultado_ultima: 'error' }, pbsAnterior),
      heartbeat(pbsAnterior),
      copy({ ultima_correcta: ago(12) }, PBS),
      heartbeat(PBS),
      ...zimbraPass,
    ])
  );
  check('PBS\'s earlier pass is cut by its own heartbeat → EV-01 CUMPLE', withPreviousPass.estado('EV-01') === 'CUMPLE', withPreviousPass.motivo('EV-01'));

  const cadence = evaluate(events([copy({ ultima_correcta: ago(40) }, ago(4)), heartbeat(ago(4)), ...zimbraPass]));
  check('PBS ran 3 h before Zimbra: its 40-h-old backup still counts → EV-02 NO_CUMPLE', cadence.estado('EV-02') === 'NO_CUMPLE', cadence.motivo('EV-02'));

  const pbsParado = evaluate(events([copy({ ultima_correcta: ago(31) }, ago(30)), heartbeat(ago(30)), ...zimbraPass]));
  check(
    'PBS stopped 30 h and Zimbra up to date → EV-01 NO_EVALUABLE by RECOGIDA, never CUMPLE',
    pbsParado.estado('EV-01') === 'NO_EVALUABLE' && pbsParado.causa('EV-01') === 'COLLECTION' && /pbs/.test(pbsParado.motivo('EV-01')),
    `${pbsParado.estado('EV-01')} ${pbsParado.causa('EV-01')} ${pbsParado.motivo('EV-01')}`
  );

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration(BASE) : c)),
  });

  const row = getENSComplianceResultByControl(
    CONTROL,
    'MEDIO',
    events([copy({ ultima_correcta: ago(40) }, PBS), heartbeat(PBS), ...zimbraPass]),
    SRV01.id,
    [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }],
    NOW
  );
  check(
    'in the engine, the machine row: mp.info.6.2.a NO_CUMPLE measured because of PBS\'s backup',
    Boolean(row) && row!.requirements.some(q => q.id === 'mp.info.6.2.a' && q.status === 'NO_CUMPLE' && q.evidenced === true),
    row && row.requirements.map(q => `${q.id}:${q.status}/${q.evidenced}`).join(' ')
  );

  ensConfigurationRepository.reset();
}

section('13. An old collector verdict does not reach the table');

{
  const verdict = linea('evidence_state', { evidence_id: 'EV-05', estado: 'CUMPLE', motivo: 'restauracion correcta' }, ago(24 * 5));
  const r = evaluate(events([verdict, heartbeat()]));

  check(
    'evidence_state estado=CUMPLE for EV-05 and no restore_test → EV-05 does not come out CUMPLE in the table',
    r.estado('EV-05') === 'NO_EVALUABLE',
    `${r.estado('EV-05')} ${r.evidencia('EV-05')?.resolvedEventType || ''}`
  );

  const nonCompliant = linea('evidence_state', { evidence_id: 'EV-06', estado: 'NO_CUMPLE', motivo: 'sin copia offsite' });
  const r6 = evaluate(events([nonCompliant, heartbeat()]), BASE, 'ALTO');
  check('nor a NO_CUMPLE: EV-06 without facts comes out NO_EVALUABLE', r6.estado('EV-06') === 'NO_EVALUABLE', r6.estado('EV-06'));

  const degraded = linea('evidence_state', { evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no hay cuenta testigo declarada' });
  const r2 = evaluate(events([degraded, heartbeat()]));
  check('REVERSAL: its NO_EVALUABLE does arrive, with its cause', r2.estado('EV-05') === 'NO_EVALUABLE' && r2.causa('EV-05') === 'CONFIGURATION', `${r2.estado('EV-05')} ${r2.causa('EV-05')}`);
}

section('14. mp.info.6.2.c: storage in other places (EV-06 and EV-07)');

{
  const requirement = mpInfo6CatalogDefinition.requirements.find(q => q.id === 'mp.info.6.2.c')!;
  check('the catalog accredits mp.info.6.2.c with EV-06 and EV-07', ['EV-06', 'EV-07'].every(id => requirement.evidenceIds.includes(id)), requirement.evidenceIds.join(','));

  const soloLocal = events([
    linea('backup_storage', { destino: '/backup', misma_maquina: 'si', tipo: 'local', activo: 'si' }),
    heartbeat(),
  ]);

  const alto = evaluate(soloLocal, BASE, 'ALTO');
  check(
    'at ALTO, local copy only → mp.info.6.2.c NO_CUMPLE measured even if the heartbeat is fine',
    alto.requisito('mp.info.6.2.c').status === 'NO_CUMPLE' && alto.requisito('mp.info.6.2.c').evidenced === true,
    `${alto.requisito('mp.info.6.2.c').status} ${alto.requisito('mp.info.6.2.c').evidenced}`
  );

  const medio = evaluate(soloLocal, BASE, 'MEDIO');
  check(
    'at MEDIO, EV-06 does not apply (the separate copy is R2 of ALTO): mp.info.6.2.c is decided by EV-07 → CUMPLE',
    medio.requisito('mp.info.6.2.c').status === 'CUMPLE' && medio.estado('EV-06') === 'NO_APLICA',
    `${medio.requisito('mp.info.6.2.c').status} EV-06 ${medio.estado('EV-06')}`
  );

  const withRemote = evaluate(
    events([
      linea('backup_storage', { destino: '/backup', misma_maquina: 'si', tipo: 'local', activo: 'si' }),
      linea('backup_storage', { destino: 'pbs-dr:datastore2', misma_maquina: 'no', tipo: 'remoto', activo: 'si' }),
      heartbeat(),
    ]),
    BASE,
    'ALTO'
  );
  check('REVERSAL: at ALTO with an off-machine copy → CUMPLE', withRemote.requisito('mp.info.6.2.c').status === 'CUMPLE', withRemote.requisito('mp.info.6.2.c').status);
}

section('15. The mp.info.6 report shows what was measured');

{
  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration(BASE) : c)),
  });

  const facts = events([
    copy({ ultima_correcta: '2026-09-30T02:00:00Z' }),
    linea('backup_retention', { retencion_dias: '45', copia_mas_antigua: '2026-08-20T02:00:00Z' }),
    linea('backup_access', { ruta: '/backup', modo: '750', propietario: 'root', grupo: 'backup', cuentas_con_lectura: 'root,backup', clave_ruta: '-', clave_modo: '-' }),
    linea('backup_storage', { destino: 'pbs-dr:datastore2', misma_maquina: 'no', tipo: 'remoto', activo: 'si' }),
    linea('restore_test', { fecha: '2026-09-28T03:00:00Z', testigo: '/etc/hostname', resultado: 'ok', coincide: 'si', limpieza: 'ok' }, '2026-09-28T03:00:00Z'),
    heartbeat(),
  ]);

  const result = getENSComplianceResultByControl(CONTROL, 'ALTO', facts, SRV01.id, [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }], NOW);
  const report = buildENSReportModel(CONTROL, result);
  const campo = (id: string) => report?.fields.find(f => f.id === id);
  const valor = (id: string) => campo(id)?.value || '';

  check('REP-02 · the last correct backup, with its date and age', /2026-09-30T02:00:00Z/.test(valor('REP-02')) && /10\.0 h/.test(valor('REP-02')), valor('REP-02'));
  check('REP-03 · the age against the P-01 + P-02 deadline', /10\.0 h/.test(valor('REP-03')) && /28 h/.test(valor('REP-03')), valor('REP-03'));
  check('REP-05 · the configured retention', /45 días/.test(valor('REP-05')), valor('REP-05'));
  check('REP-06 · who can read the backups', /root, backup/.test(valor('REP-06')), valor('REP-06'));
  check('REP-07 · the last restore test, its result and its cleanup', /2026-09-28T03:00:00Z/.test(valor('REP-07')) && /limpieza ok/.test(valor('REP-07')), valor('REP-07'));
  check('REP-08 · the off-machine destination', /pbs-dr:datastore2/.test(valor('REP-08')), valor('REP-08'));
  check('no report field comes out SIN_DATOS with all the facts', (report?.fields || []).every(f => !/SIN_DATOS/.test(f.value) && f.status !== 'SIN_DATOS'), (report?.fields || []).filter(f => /SIN_DATOS/.test(f.value) || f.status === 'SIN_DATOS').map(f => `${f.id}: ${f.value}`).join(' | '));
  check('and each field\'s state is its evidence\'s', campo('REP-02')?.status === 'CUMPLE' && campo('REP-08')?.status === 'CUMPLE', `${campo('REP-02')?.status} ${campo('REP-08')?.status}`);

  ensConfigurationRepository.reset();
}

section('16. EV-02 · the cron schedule holds for all backup-ids');

{
  const plan = (each: string, schedule = '17 2 * * *') =>
    linea('backup_schedule', { planificacion: schedule, intervalo_horas: each, fuente: 'cron' });
  const twoBackups = [copy({ backup_id: 'srv01_root', ultima_correcta: ago(10) }), copy({ backup_id: 'srv01_opt-zimbra', ultima_correcta: ago(12) })];

  const daily = evaluate(events([...twoBackups, plan('24'), heartbeat()]));
  check(
    'two backup-ids and a schedule without backup_id every 24 h → EV-02 CUMPLE',
    daily.estado('EV-02') === 'CUMPLE' && !/no el estado/.test(daily.motivo('EV-02')),
    `${daily.estado('EV-02')} ${daily.motivo('EV-02')}`
  );
  check(
    'and the schedule applies to both backups',
    (daily.motivo('EV-02').match(/planificada cada 24 h/g) || []).length === 2,
    daily.motivo('EV-02')
  );

  const weekly = evaluate(events([...twoBackups, plan('168', '@weekly'), heartbeat()]));
  check(
    'scheduled every 168 h with P-01 = 24 h → EV-02 NO_CUMPLE',
    weekly.estado('EV-02') === 'NO_CUMPLE' && /cada 168 h/.test(weekly.motivo('EV-02')),
    `${weekly.estado('EV-02')} ${weekly.motivo('EV-02')}`
  );

  const looseWeekly = evaluate(events([...twoBackups, plan('168', '@weekly'), heartbeat()]), { ...BASE, 'P-01': '168' });
  check('REVERSAL: the same schedule with P-01 = 168 h → CUMPLE', looseWeekly.estado('EV-02') === 'CUMPLE', looseWeekly.motivo('EV-02'));

  const lasDos = evaluate(events([...twoBackups, plan('168', '@weekly'), plan('24'), heartbeat()]));
  check(
    'one weekly and one daily: the more frequent prevails → CUMPLE',
    lasDos.estado('EV-02') === 'CUMPLE' && /cada 24 h/.test(lasDos.motivo('EV-02')),
    lasDos.motivo('EV-02')
  );

  const soloPlan = evaluate(events([plan('24'), heartbeat()]));
  check(
    'a schedule with no backup reported → EV-02 NO_EVALUABLE, never CUMPLE',
    soloPlan.estado('EV-02') === 'NO_EVALUABLE' && /no el estado de la última copia/.test(soloPlan.motivo('EV-02')),
    `${soloPlan.estado('EV-02')} ${soloPlan.motivo('EV-02')}`
  );
}

section('17. Degradations without backup_id belong to the pair (origin and object)');

{
  const couldNot = (evidence: string, cause: string, motive: string, ts: string = PASS, campos: Linea = {}) =>
    linea('evidence_state', { evidence_id: evidence, estado: 'NO_EVALUABLE', causa: cause, motivo: motive, ...campos }, ts);
  const antes = ago(2);

  const replaced = evaluate(
    events([
      couldNot('EV-01', 'COLLECTION', 'el PBS no respondió', antes),
      heartbeat(antes, { resultado: 'parcial', evidencias_cubiertas: 'EV-04' }),
      copy({ backup_id: 'srv01_root' }),
      copy({ backup_id: 'srv01_opt-zimbra' }),
      heartbeat(),
    ])
  );
  check(
    'a pair degradation from 2 h ago and a later pass with backup-ids → EV-01 CUMPLE',
    replaced.estado('EV-01') === 'CUMPLE',
    `${replaced.estado('EV-01')} ${replaced.motivo('EV-01')}`
  );

  const posterior = evaluate(
    events([
      copy({ backup_id: 'srv01_root' }, antes),
      copy({ backup_id: 'srv01_opt-zimbra' }, antes),
      heartbeat(antes),
      couldNot('EV-01', 'COLLECTION', 'el PBS no respondió'),
      heartbeat(PASS, { resultado: 'parcial', evidencias_cubiertas: 'EV-04' }),
    ])
  );
  check(
    'REVERSAL: the later pass\'s degradation replaces the facts → NO_EVALUABLE by RECOGIDA',
    posterior.estado('EV-01') === 'NO_EVALUABLE' && posterior.causa('EV-01') === 'COLLECTION' && /no respondió/.test(posterior.motivo('EV-01')),
    `${posterior.estado('EV-01')} ${posterior.causa('EV-01')} ${posterior.motivo('EV-01')}`
  );

  const samePass = evaluate(
    events([
      linea('backup_retention', { backup_id: 'srv01_root', retencion_dias: '-', copia_mas_antigua: ago(40 * 24) }),
      couldNot('EV-03', 'EVIDENCE', 'el PBS no conserva ninguna copia de srv01_nuevo'),
      heartbeat(),
    ])
  );
  check(
    'in the same pass, a measured backup and a pair degradation → EV-03 NO_EVALUABLE (a part was not measured)',
    samePass.estado('EV-03') === 'NO_EVALUABLE' && /srv01_nuevo/.test(samePass.motivo('EV-03')),
    `${samePass.estado('EV-03')} ${samePass.motivo('EV-03')}`
  );

  const withFailure = evaluate(
    events([
      linea('backup_retention', { backup_id: 'srv01_root', retencion_dias: '14', copia_mas_antigua: ago(10 * 24) }),
      couldNot('EV-03', 'EVIDENCE', 'el PBS no conserva ninguna copia de srv01_nuevo'),
      heartbeat(),
    ])
  );
  check('but a measured breach in the same pass prevails → EV-03 NO_CUMPLE', withFailure.estado('EV-03') === 'NO_CUMPLE', withFailure.motivo('EV-03'));

  const old2 = linea('evidence_state', { evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'sin PBS_REPO', origen: '', objeto: '' }, ago(72));
  const withOld = evaluate(events([old2]));
  check(
    'a degradation without origin (earlier vocabulary) is not read: EV-01 says nothing from this machine is on record (RECOGIDA), not its CONFIGURATION',
    withOld.estado('EV-01') === 'NO_EVALUABLE' && withOld.causa('EV-01') === 'COLLECTION' && /No consta ningún/.test(withOld.motivo('EV-01')),
    `${withOld.estado('EV-01')} ${withOld.causa('EV-01')} ${withOld.motivo('EV-01')}`
  );
}

section('18. EV-05 · the deadline first, and the window without tests');

{
  const test = linea('restore_test', { fecha: ago(3 * 24), testigo: '/etc/ensfacil/mpinfo6-witness.txt', resultado: 'ok', coincide: 'si', limpieza: 'ok' }, ago(3 * 24));

  const withoutDeadline = evaluate(events([test, heartbeat()]), { ...BASE, 'P-05': undefined });
  check('without P-05 → EV-05 NO_EVALUABLE by CONFIGURACIÓN even if there are tests', withoutDeadline.estado('EV-05') === 'NO_EVALUABLE' && withoutDeadline.causa('EV-05') === 'CONFIGURATION', `${withoutDeadline.estado('EV-05')} ${withoutDeadline.causa('EV-05')}`);

  const unreadable = evaluate(events([test, heartbeat()]), { ...BASE, 'P-05': 'cada semana' });
  check('unreadable P-05 → CONFIGURACIÓN', unreadable.estado('EV-05') === 'NO_EVALUABLE' && unreadable.causa('EV-05') === 'CONFIGURATION', `${unreadable.estado('EV-05')} ${unreadable.causa('EV-05')}`);

  const emptyWindow = evaluate(events([heartbeat()]));
  check(
    'no test in the window with the collector beating → NO_EVALUABLE by EVIDENCIA, without blaming collection',
    emptyWindow.estado('EV-05') === 'NO_EVALUABLE' && emptyWindow.causa('EV-05') === 'EVIDENCE' && /ventana consultada/.test(emptyWindow.motivo('EV-05')),
    `${emptyWindow.estado('EV-05')} ${emptyWindow.causa('EV-05')} ${emptyWindow.motivo('EV-05')}`
  );

  const withoutAnything = evaluate([]);
  check('no fact or heartbeat at all → RECOGIDA', withoutAnything.estado('EV-05') === 'NO_EVALUABLE' && withoutAnything.causa('EV-05') === 'COLLECTION', `${withoutAnything.estado('EV-05')} ${withoutAnything.causa('EV-05')}`);

  const backupWithoutTest = evaluate(events([copy()]));
  check(
    'a backup the collector reports and was never tested → NO_EVALUABLE by EVIDENCIA naming it',
    backupWithoutTest.estado('EV-05') === 'NO_EVALUABLE' && backupWithoutTest.causa('EV-05') === 'EVIDENCE' && /no consta ninguna prueba de restauración de los ficheros \(pbs\)/i.test(backupWithoutTest.motivo('EV-05')),
    `${backupWithoutTest.estado('EV-05')} ${backupWithoutTest.causa('EV-05')} ${backupWithoutTest.motivo('EV-05')}`
  );
}

section('19. P-04 with a name that belongs to no agent');

{
  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration({ ...BASE, 'P-04': 'srv-99' }) : c)),
  });

  const scope: ENSAgentScope[] = [
    { id: SRV01.id, name: SRV01.name, groups: ['ens'] },
    { id: SRV02.id, name: SRV02.name, groups: ['ens'] },
  ];
  const estado = getENSComplianceState('MEDIO', events([copy(), heartbeat()]), undefined, scope, NOW);
  const consolidated = estado.results.find(r => r.control.id === CONTROL);
  const findings = (consolidated?.nonConformities || []).filter(n => n.id !== 'NC-CFG');

  check('no row measures it', estado.agents.every(a => !a.results.some(r => r.control.id === CONTROL)));
  check(
    'the consolidated says CONFIGURACIÓN, not RECOGIDA',
    findings.length > 0 && findings.every(n => n.origin === 'NO_EVIDENCIADA' && n.cause === 'CONFIGURATION'),
    findings.map(n => `${n.requirementId}:${n.cause}`).join(' ')
  );
  check(
    'and the motive names the declared machine that does not exist',
    (consolidated?.evidences || []).some(e => e.observations.some(o => /srv-99/.test(o) && /no es ninguna máquina del alcance ENS/.test(o))),
    (consolidated?.evidences || [])[0]?.observations[0]
  );

  ensConfigurationRepository.reset();
}

section('20. Ramas de EV-03, EV-04, EV-06 y EV-07');

{
  const access = (accounts: string, mode = '0640') =>
    linea('backup_access', { ruta: '/etc/ensfacil/mpinfo6.env', modo: mode, propietario: 'root', grupo: 'root', cuentas_con_lectura: accounts, clave_ruta: '-', clave_modo: '-' });

  const anyOne = evaluate(events([access('root,*'), heartbeat()]));
  check('cuentas_con_lectura with * → EV-04 NO_CUMPLE (any account)', anyOne.estado('EV-04') === 'NO_CUMPLE' && /cualquier cuenta/.test(anyOne.motivo('EV-04')), anyOne.motivo('EV-04'));

  const world = evaluate(events([access('root', '0644'), heartbeat()]));
  check('mode 0644 (read for others) → EV-04 NO_CUMPLE', world.estado('EV-04') === 'NO_CUMPLE', world.motivo('EV-04'));

  const nobody = evaluate(events([access('-', '0600'), heartbeat()]));
  check('cuentas_con_lectura = - is the empty set, not an account called «-» → CUMPLE', nobody.estado('EV-04') === 'CUMPLE' && !/«-»|: -\./.test(nobody.motivo('EV-04')), `${nobody.estado('EV-04')} ${nobody.motivo('EV-04')}`);

  const unreported = evaluate(events([access(''), heartbeat()]));
  check('empty cuentas_con_lectura means it was not reported → NO_EVALUABLE', unreported.estado('EV-04') === 'NO_EVALUABLE', unreported.estado('EV-04'));

  const retention = (ageDays: number) =>
    linea('backup_retention', { backup_id: 'srv01_root', retencion_dias: '-', copia_mas_antigua: ago(ageDays * 24) });

  const old3 = evaluate(events([retention(40), heartbeat()]));
  check('without configured retention and the oldest backup from 40 days ago (≥ P-03) → EV-03 CUMPLE', old3.estado('EV-03') === 'CUMPLE', old3.motivo('EV-03'));

  const recent = evaluate(events([retention(20), heartbeat()]));
  check('REVERSAL: the oldest from 20 days ago (< P-03) → NO_EVALUABLE, never CUMPLE', recent.estado('EV-03') === 'NO_EVALUABLE', `${recent.estado('EV-03')} ${recent.motivo('EV-03')}`);

  const doubtful = evaluate(events([linea('backup_storage', { destino: 'nas:/copias', misma_maquina: 'desconocido', tipo: 'montaje', activo: 'si' }), heartbeat()]), BASE, 'ALTO');
  check('misma_maquina with a value that is not si/no → EV-06 NO_EVALUABLE', doubtful.estado('EV-06') === 'NO_EVALUABLE', `${doubtful.estado('EV-06')} ${doubtful.motivo('EV-06')}`);

  const partial = evaluate(events([heartbeat(PASS, { resultado: 'parcial', evidencias_cubiertas: 'EV-01,EV-04' })]));
  check('a partial heartbeat with declared coverage → EV-07 CUMPLE', partial.estado('EV-07') === 'CUMPLE', `${partial.estado('EV-07')} ${partial.motivo('EV-07')}`);

  const failedOne = evaluate(events([heartbeat(PASS, { resultado: 'error' })]));
  check('REVERSAL: a heartbeat with result error → NO_EVALUABLE', failedOne.estado('EV-07') === 'NO_EVALUABLE', failedOne.estado('EV-07'));
}

section('21. The policy\'s requirement table is the catalog\'s');

{
  const sorts = (ids: string[]) => [...ids].sort().join(',');
  const catalog = Object.fromEntries(mpInfo6CatalogDefinition.requirements.map(q => [q.id, sorts(q.evidenceIds)]));
  const policy = Object.fromEntries(Object.entries(MP_INFO_6_REQUIREMENTS).map(([id, q]) => [id, sorts(q.evidencias)]));
  const definition = Object.fromEntries(mpInfo6PolicyDefinition.requirements.map(q => [q.requirementId, sorts(q.evidenceIds)]));

  check('same requirements and same evidences as the catalog', JSON.stringify(policy) === JSON.stringify(catalog), `${JSON.stringify(policy)} ≠ ${JSON.stringify(catalog)}`);
  check('and as the policy definition', JSON.stringify(definition) === JSON.stringify(catalog), `${JSON.stringify(definition)} ≠ ${JSON.stringify(catalog)}`);
}

section('22. A real PBS collector pass (tests/fixtures/mp-info-6-pbs-pass.ndjson)');

{
  const fs = require('fs');
  const lineas: Linea[] = String(fs.readFileSync(`${__dirname}/fixtures/mp-info-6-pbs-pass.ndjson`, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l: string) => JSON.parse(l));
  const machine = { id: SRV01.id, name: String(lineas[0].host) };
  const realNow = new Date(Math.max(...lineas.map(l => Date.parse(String(l.ts)))) + 10 * 60 * 1000);
  const valores = { ...BASE, 'P-04': machine.name };
  const real = evaluate(events(lineas, machine), valores, 'ALTO', realNow);
  const todas = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'];

  check(
    'the seven evidences are measured: none NO_EVALUABLE because of how facts are crossed',
    todas.every(id => real.estado(id) !== 'NO_EVALUABLE'),
    todas.map(id => `${id}:${real.estado(id)}`).join(' ')
  );
  check('and with this pass, all CUMPLE', todas.every(id => real.estado(id) === 'CUMPLE'), todas.filter(id => real.estado(id) !== 'CUMPLE').map(id => `${id}: ${real.motivo(id)}`).join(' | '));
  check(
    'all ALTO requirements, proven',
    mpInfo6CatalogDefinition.requirements.every(q => real.requisito(q.id).evidenced === true),
    mpInfo6CatalogDefinition.requirements.map(q => `${q.id}:${real.requisito(q.id).status}/${real.requisito(q.id).evidenced}`).join(' ')
  );
  check('EV-02 applies the cron schedule to both backup-ids', (real.motivo('EV-02').match(/planificada cada 24 h/g) || []).length === 2, real.motivo('EV-02'));

  const nobody = evaluate(events(lineas.map(l => (l.event === 'backup_access' ? { ...l, cuentas_con_lectura: '-' } : l)), machine), valores, 'ALTO', realNow);
  check('with cuentas_con_lectura = - (nobody) → EV-04 stays CUMPLE', nobody.estado('EV-04') === 'CUMPLE', nobody.motivo('EV-04'));

  const anyOne = evaluate(events(lineas.map(l => (l.event === 'backup_access' && l.tipo_ruta === 'directorio' ? { ...l, cuentas_con_lectura: 'backup,root,*' } : l)), machine), valores, 'ALTO', realNow);
  check('with * in the local directory → EV-04 NO_CUMPLE', anyOne.estado('EV-04') === 'NO_CUMPLE', anyOne.motivo('EV-04'));

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration(valores) : c)),
  });

  const row = getENSComplianceResultByControl(CONTROL, 'ALTO', events(lineas, machine), machine.id, [{ ...machine, groups: ['ens'] }], realNow);
  check(
    'and through the whole engine: the machine row, 100 % with everything proven',
    row?.status === 'CUMPLE' && row.measuredRequirements === row.applicableRequirements,
    row && `${row.status} ${row.score} ${row.measuredRequirements}/${row.applicableRequirements}`
  );

  ensConfigurationRepository.reset();
}

const rescale = (lineas: Linea[], destination: Date): Linea[] => {
  const maxTs = Math.max(...lineas.map(l => Date.parse(String(l.ts))));
  const delta = destination.getTime() - maxTs;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

  return lineas.map(l => {
    const shifted: Linea = {};

    for (const [k, v] of Object.entries(l)) {
      shifted[k] =
        typeof v === 'string' && iso.test(v)
          ? new Date(Date.parse(v) + delta).toISOString().replace('.000Z', 'Z')
          : v;
    }

    return shifted;
  });
};

section('23. A real Zimbra collector pass (tests/fixtures/mp-info-6-zimbra-pass.ndjson)');

{
  const fs = require('fs');
  const lineas: Linea[] = String(fs.readFileSync(`${__dirname}/fixtures/mp-info-6-zimbra-pass.ndjson`, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l: string) => JSON.parse(l));
  const machine = { id: SRV01.id, name: String(lineas[0].host) };
  const realNow = new Date(Math.max(...lineas.map(l => Date.parse(String(l.ts)))) + 10 * 60 * 1000);
  const valores = { ...BASE, 'P-04': machine.name, 'P-07': 'zimbra' };
  const real = evaluate(events(lineas, machine), valores, 'ALTO', realNow);
  const todas = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'];

  check(
    'the seven evidences are measured: none NO_EVALUABLE because of how mailbox and directory facts are crossed',
    todas.every(id => real.estado(id) !== 'NO_EVALUABLE'),
    todas.map(id => `${id}:${real.estado(id)}`).join(' ')
  );
  check(
    'and with this pass, all CUMPLE',
    todas.every(id => real.estado(id) === 'CUMPLE'),
    todas.filter(id => real.estado(id) !== 'CUMPLE').map(id => `${id}: ${real.motivo(id)}`).join(' | ')
  );
  check(
    'EV-01 names the node\'s two objects: mailboxes and directory',
    /buzones/.test(real.motivo('EV-01')) && /directorio/.test(real.motivo('EV-01')),
    real.motivo('EV-01')
  );
  check(
    'EV-06 CUMPLE: the declared remote copy is active for both objects',
    real.estado('EV-06') === 'CUMPLE' && /buzones/.test(real.motivo('EV-06')) && /directorio/.test(real.motivo('EV-06')),
    real.motivo('EV-06')
  );
  check(
    'all ALTO requirements, proven',
    mpInfo6CatalogDefinition.requirements.every(q => real.requisito(q.id).evidenced === true),
    mpInfo6CatalogDefinition.requirements.map(q => `${q.id}:${real.requisito(q.id).status}/${real.requisito(q.id).evidenced}`).join(' ')
  );
  check(
    'EV-07: the heartbeat names the two covered roles',
    /EV-01/.test(real.motivo('EV-07')) && /EV-06/.test(real.motivo('EV-07')),
    real.motivo('EV-07')
  );

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration(valores) : c)),
  });

  const row = getENSComplianceResultByControl(CONTROL, 'ALTO', events(lineas, machine), machine.id, [{ ...machine, groups: ['ens'] }], realNow);
  check(
    'and through the whole engine: the machine row, 100 % with everything proven',
    row?.status === 'CUMPLE' && row.measuredRequirements === row.applicableRequirements,
    row && `${row.status} ${row.score} ${row.measuredRequirements}/${row.applicableRequirements}`
  );

  ensConfigurationRepository.reset();
}

section('24. Real PBS and Zimbra on the same agent, at different minutes');

{
  const fs = require('fs');
  const cargaLineas = (file: string): Linea[] =>
    String(fs.readFileSync(`${__dirname}/fixtures/${file}`, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l: string) => JSON.parse(l));

  const realNow = new Date('2026-09-30T14:00:00Z');
  const pbsHora = new Date(realNow.getTime() - 2 * HORA);
  const zimbraHora = new Date(realNow.getTime() - 2 * HORA + 40 * 60 * 1000);

  const pbs = rescale(cargaLineas('mp-info-6-pbs-pass.ndjson'), pbsHora);
  const zimbra = rescale(cargaLineas('mp-info-6-zimbra-pass.ndjson'), zimbraHora);

  const machine = SRV01;
  const valores = { ...BASE, 'P-04': machine.name, 'P-07': 'root,backup,zimbra' };
  const real = evaluate(events([...pbs, ...zimbra], machine), valores, 'ALTO', realNow);
  const todas = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'];

  check(
    'the two real passes coexist: no evidence is left unmeasured for having two origins',
    todas.every(id => real.estado(id) !== 'NO_EVALUABLE'),
    todas.map(id => `${id}:${real.estado(id)}`).join(' ')
  );
  check(
    'EV-01 (the worst prevails) names the three objects: PBS files, Zimbra mailboxes and directory',
    ['ficheros', 'buzones', 'directorio'].every(o => real.motivo('EV-01').includes(o)),
    real.motivo('EV-01')
  );
  check(
    'EV-07 names the two origins, each with its heartbeat: neither covers the other',
    /pbs/.test(real.motivo('EV-07')) && /zimbra-ne/.test(real.motivo('EV-07')),
    real.motivo('EV-07')
  );
  check('and with both passes up to date, all CUMPLE', todas.every(id => real.estado(id) === 'CUMPLE'), todas.filter(id => real.estado(id) !== 'CUMPLE').map(id => `${id}: ${real.motivo(id)}`).join(' | '));

  const pbsParado = rescale(cargaLineas('mp-info-6-pbs-pass.ndjson'), new Date(zimbraHora.getTime() - 30 * HORA));
  const stoppage = evaluate(events([...pbsParado, ...zimbra], machine), valores, 'ALTO', realNow);
  check(
    'REVERSAL: PBS 30 h without beating → EV-07 NO_EVALUABLE by RECOGIDA naming pbs, even if Zimbra keeps beating on time',
    stoppage.estado('EV-07') === 'NO_EVALUABLE' && stoppage.causa('EV-07') === 'COLLECTION' && /pbs/.test(stoppage.motivo('EV-07')),
    `${stoppage.estado('EV-07')} ${stoppage.causa('EV-07')} ${stoppage.motivo('EV-07')}`
  );
}

section('25. A machine updated with heartbeats from the earlier collector');

{
  const MACHINE = { id: '034', name: 'mp.info' };
  const T = ago(0.9);
  const fresh = (event: string, campos: Linea) => linea(event, { host: MACHINE.name, ...campos }, T);
  const added = [
    fresh('backup_run', { backup_id: 'r', ultima_correcta: ago(10), ultima_fallida: '-', resultado_ultima: 'ok', tipo: 'completa' }),
    fresh('backup_schedule', { planificacion: '17 2 * * *', intervalo_horas: '24', fuente: 'cron' }),
    fresh('backup_retention', { backup_id: 'r', retencion_dias: '-', copia_mas_antigua: ago(24 * 40) }),
    fresh('backup_access', { ruta: '/etc/ensfacil/mpinfo6.env', modo: '0640', propietario: 'root', grupo: 'root', cuentas_con_lectura: 'root', clave_ruta: '-', clave_modo: '-' }),
    fresh('backup_storage', { destino: 'pbs:ds', misma_maquina: 'no', tipo: 'remoto', activo: 'si' }),
    fresh('restore_test', { backup_id: 'r', fecha: ago(24), testigo: '/etc/w', resultado: 'ok', coincide: 'si', limpieza: 'ok' }),
    heartbeat(T, { host: MACHINE.name }),
  ];
  const oldOnes = normalizeWazuhAlerts([
    { _id: 'viejo-latido', _source: { '@timestamp': ago(72), agent: MACHINE, rule: { id: '106608' }, data: { ensfacil: 'mp.info.6', event: 'collector_run', version: '1', resultado: 'completada', evidencias_cubiertas: 'EV-01,EV-02,EV-07' } } },
    { _id: 'viejo-estado', _source: { '@timestamp': ago(72), agent: MACHINE, rule: { id: '106700' }, data: { ensfacil: 'mp.info.6', event: 'evidence_state', evidence_id: 'EV-07', estado: 'CUMPLE' } } },
  ]);

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration({ ...BASE, 'P-04': MACHINE.name }) : c)),
  });

  const row = getENSComplianceResultByControl(CONTROL, 'MEDIO', [...oldOnes, ...events(added, MACHINE)], MACHINE.id, [{ ...MACHINE, groups: ['ens', 'ens-copias'] }], NOW);
  const ev07 = row?.evidences.find(e => e.id === 'EV-07');

  check('with the old heartbeat without origin in the window, EV-07 stays CUMPLE', ev07?.status === 'CUMPLE', `${ev07?.status} ${ev07?.observations[0]}`);
  check('and the machine, up to date, comes out CUMPLE', row?.status === 'CUMPLE', `${row?.status} ${row?.score}`);

  ensConfigurationRepository.reset();
}

section('26. EV-05 by origin and object: each backup must account for its test');

{
  const zimbraRun = (object: string, origin = 'zimbra-ne') =>
    copy({ origen: origin, objeto: object, tipo: 'incremental', destino: '/opt/zimbra/backup' });
  const zimbraHeartbeat = heartbeat(PASS, { origen: 'zimbra-ne', rol: 'buzones,directorio' });
  const test = (origin: string, object: string, campos: Linea = {}) =>
    linea('restore_test', { origen: origin, objeto: object, fecha: ago(72), testigo: 'testigo', resultado: 'ok', coincide: 'si', limpieza: 'ok', ...campos }, ago(72));
  const withoutWitness = linea(
    'evidence_state',
    { origen: 'zimbra-ne', objeto: 'buzones', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'declara MPINFO6ZIMBRA_TESTIGO, la cuenta testigo' },
    ago(72)
  );

  const directoryOnly = evaluate(events([zimbraRun('buzones'), zimbraRun('directorio'), zimbraHeartbeat, test('zimbra-ne', 'directorio'), withoutWitness]));
  check(
    'Zimbra: the directory tested and the mailboxes never (no declared witness) → EV-05 NO_EVALUABLE by CONFIGURACIÓN, never CUMPLE',
    directoryOnly.estado('EV-05') === 'NO_EVALUABLE' && directoryOnly.causa('EV-05') === 'CONFIGURATION' && /MPINFO6ZIMBRA_TESTIGO/.test(directoryOnly.motivo('EV-05')),
    `${directoryOnly.estado('EV-05')} ${directoryOnly.causa('EV-05')} ${directoryOnly.motivo('EV-05')}`
  );

  const lasDos = evaluate(events([zimbraRun('buzones'), zimbraRun('directorio'), zimbraHeartbeat, test('zimbra-ne', 'directorio'), test('zimbra-ne', 'buzones')]));
  check('REVERSAL: with the mailboxes\' test too → CUMPLE', lasDos.estado('EV-05') === 'CUMPLE', lasDos.motivo('EV-05'));

  const ose = evaluate(events([zimbraRun('buzones', 'zimbra-ose-declarada'), heartbeat(PASS, { origen: 'zimbra-ose-declarada', rol: 'buzones' })]));
  check(
    'Zimbra Open Source: mailboxes without zmrestore or test → NO_EVALUABLE by EVIDENCIA, with a motive saying which backup',
    ose.estado('EV-05') === 'NO_EVALUABLE' && ose.causa('EV-05') === 'EVIDENCE' && /no consta ninguna prueba de restauración de los buzones \(zimbra-ose-declarada\)/i.test(ose.motivo('EV-05')),
    `${ose.estado('EV-05')} ${ose.causa('EV-05')} ${ose.motivo('EV-05')}`
  );

  const pbsDos = evaluate(
    events([
      copy({ backup_id: 'srv01_root' }),
      copy({ backup_id: 'srv01_opt-zimbra' }),
      heartbeat(),
      test('pbs', 'fichero', { backup_id: 'srv01_root', testigo: '/etc/ensfacil/mpinfo6-witness.txt' }),
    ])
  );
  check('PBS with two backup-ids and the witness on one of them → CUMPLE (the test belongs to the pair)', pbsDos.estado('EV-05') === 'CUMPLE', `${pbsDos.estado('EV-05')} ${pbsDos.motivo('EV-05')}`);

  const soloPbs = evaluate(
    events([
      copy({ backup_id: 'srv01_root' }),
      heartbeat(),
      zimbraRun('buzones'),
      zimbraRun('directorio'),
      zimbraHeartbeat,
      test('pbs', 'fichero', { backup_id: 'srv01_root' }),
    ])
  );
  check(
    'a server with PBS and Zimbra where only PBS was tested → does not CUMPLE',
    soloPbs.estado('EV-05') !== 'CUMPLE' && /buzones/.test(soloPbs.motivo('EV-05')) && /directorio/.test(soloPbs.motivo('EV-05')),
    `${soloPbs.estado('EV-05')} ${soloPbs.motivo('EV-05')}`
  );
}

section('27. P-04 with a machine that is not in the ENS scope');

{
  const LEVEL: ENSLevel = 'ALTO';
  const BACKUPS = { id: '003', name: 'srv-copias' };
  const upToDate = (agent: Agente) =>
    events(
      [
        copy({ host: agent.name, backup_id: 'r' }),
        linea('backup_schedule', { host: agent.name, planificacion: '17 2 * * *', intervalo_horas: '24', fuente: 'cron' }),
        linea('backup_retention', { host: agent.name, backup_id: 'r', retencion_dias: '-', copia_mas_antigua: ago(24 * 40) }),
        linea('backup_access', { host: agent.name, ruta: '/etc/ensfacil/mpinfo6.env', modo: '0640', propietario: 'root', grupo: 'root', cuentas_con_lectura: 'root', clave_ruta: '-', clave_modo: '-' }),
        linea('backup_storage', { host: agent.name, destino: 'pbs:ds', misma_maquina: 'no', tipo: 'remoto', activo: 'si' }),
        linea('restore_test', { host: agent.name, backup_id: 'r', fecha: ago(24), testigo: '/etc/w', resultado: 'ok', coincide: 'si', limpieza: 'ok' }),
        heartbeat(PASS, { host: agent.name }),
      ],
      agent
    );
  const SCOPE: ENSAgentScope[] = [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }];
  const active2 = (p04: string[]) =>
    ensConfigurationRepository.replaceActive({
      ...defaultENSConfigurationTemplate,
      controls: defaultENSConfigurationTemplate.controls.map(c =>
        c.controlId === CONTROL ? configuration({ ...BASE, 'P-04': p04, 'P-08': 'si' }) : c
      ),
    });
  const findingThatNames = (r: any, name: string) =>
    (r?.nonConformities || []).some(
      (n: any) => n.cause === 'CONFIGURATION' && n.finding.includes(name) && /no es ninguna máquina del alcance ENS/.test(n.finding)
    );

  active2(['srv-01']);
  const soloUna = getENSComplianceResultByControl(CONTROL, LEVEL, upToDate(SRV01), undefined, SCOPE, NOW);
  check('P-04 = srv-01 and srv-01 up to date → CUMPLE 100', soloUna?.status === 'CUMPLE' && soloUna.score === 100, `${soloUna?.status} ${soloUna?.score}`);

  active2(['srv-01', 'srv-99']);
  const conErrata = getENSComplianceResultByControl(CONTROL, LEVEL, upToDate(SRV01), undefined, SCOPE, NOW);
  check('P-04 = srv-01, srv-99 (typo) → no longer CUMPLE 100', Boolean(conErrata) && conErrata!.status !== 'CUMPLE', `${conErrata?.status} ${conErrata?.score}`);
  check('and a CONFIGURACIÓN finding names srv-99', findingThatNames(conErrata, 'srv-99'), (conErrata?.nonConformities || []).map(n => `${n.cause}: ${n.finding.slice(0, 160)}`).join(' | '));
  check(
    'srv-99 counts as a declared machine without data in the consolidated',
    JSON.stringify(conErrata?.consolidatedAgents?.map(a => a.agentName)) === '["srv-01","srv-99"]',
    JSON.stringify(conErrata?.consolidatedAgents)
  );

  const estado = getENSComplianceState(LEVEL, upToDate(SRV01), undefined, SCOPE, NOW);
  const panel = estado.results.find(r => r.control.id === CONTROL);
  check('the panel says the same', Boolean(panel) && panel!.status !== 'CUMPLE' && findingThatNames(panel, 'srv-99'), `${panel?.status}`);
  check('but srv-99 does not appear as a panel row: it is not a scope machine', estado.agents.every(a => a.agentName !== 'srv-99'), estado.agents.map(a => a.agentName).join(','));

  active2(['srv-01', 'srv-copias']);
  const onlyInBackups = getENSComplianceResultByControl(CONTROL, LEVEL, [...upToDate(SRV01), ...upToDate(BACKUPS)], undefined, SCOPE, NOW);
  check(
    'a machine only in ens-copias (outside the ENS scope) even if it sends data → CONFIGURACIÓN finding that names it, not CUMPLE',
    Boolean(onlyInBackups) && onlyInBackups!.status !== 'CUMPLE' && findingThatNames(onlyInBackups, 'srv-copias'),
    `${onlyInBackups?.status} ${(onlyInBackups?.nonConformities || []).map(n => n.cause).join(',')}`
  );

  ensConfigurationRepository.reset();
}

section('28. EV-02 · PBS down for more than 26 h: the cause is still collection');

{
  const now = PASS;
  const couldNot = (evidence: string) =>
    linea('evidence_state', { evidence_id: evidence, estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se pudo listar las copias de pbs:ds: connection refused' }, now);
  const down = evaluate(
    events([
      copy({ backup_id: 'srv01_root', ultima_correcta: ago(40) }, ago(30)),
      ...['EV-01', 'EV-02', 'EV-03'].map(couldNot),
      linea('backup_schedule', { planificacion: '17 2 * * *', intervalo_horas: '24', fuente: 'cron' }, now),
      heartbeat(now, { resultado: 'parcial', evidencias_cubiertas: 'EV-04' }),
    ])
  );
  check(
    'with the cron plan up to date and PBS not answering → EV-02 NO_EVALUABLE by RECOGIDA, not by EVIDENCIA',
    down.estado('EV-02') === 'NO_EVALUABLE' && down.causa('EV-02') === 'COLLECTION',
    `${down.estado('EV-02')} ${down.causa('EV-02')} ${down.motivo('EV-02')}`
  );
}

section('29. EV-02 · planificacion=- means no backup is scheduled');

{
  const plan = (schedule: string, each: string) =>
    linea('backup_schedule', { origen: 'zimbra-ne', objeto: 'buzones', planificacion: schedule, intervalo_horas: each, fuente: 'cron' });
  const mailboxes = copy({ origen: 'zimbra-ne', objeto: 'buzones', tipo: 'incremental', destino: '/opt/zimbra/backup' });

  const sinPlan = evaluate(events([mailboxes, plan('-', '-'), heartbeat(PASS, { origen: 'zimbra-ne' })]));
  check(
    'Zimbra with planificacion=- → EV-02 NO_CUMPLE «no hay ninguna copia planificada»',
    sinPlan.estado('EV-02') === 'NO_CUMPLE' && /no hay ninguna copia planificada/.test(sinPlan.motivo('EV-02')),
    `${sinPlan.estado('EV-02')} ${sinPlan.motivo('EV-02')}`
  );

  const conPlan = evaluate(events([mailboxes, plan('completa 0 1 * * 6; incremental 0 1 * * 0-5', '24'), heartbeat(PASS, { origen: 'zimbra-ne' })]));
  check('REVERSAL: with the schedule read → CUMPLE', conPlan.estado('EV-02') === 'CUMPLE', conPlan.motivo('EV-02'));
}

section('30. The report names each backup once, with its latest state');

{
  const cfg = configuration(BASE);
  const policyFacts = events([
    copy({ backup_id: 'srv01_root', ultima_correcta: ago(24.5) }, ago(0.9)),
    copy({ backup_id: 'srv01_root', ultima_correcta: ago(0.4) }, ago(0.3)),
  ]);
  const { runtimeVariables } = runPolicyRuntime(buildPolicyContext(mpInfo6CatalogDefinition, cfg, 'MEDIO', policyFacts, [], NOW));
  const list = runtimeVariables.find(v => v.name === 'copias_ultima_correcta')?.value as string[];
  const age = runtimeVariables.find(v => v.name === 'copias_antiguedad_maxima_horas')?.value;

  check('srv01_root appears only once', Array.isArray(list) && list.filter(l => l.includes('srv01_root')).length === 1, JSON.stringify(list));
  check('with today\'s backup, not yesterday\'s', age === 0.4, String(age));
}

section('31. EV-01 · A4, the mount points the backup left out');

{
  const withOmission = evaluate(events([copy({ montajes_omitidos: '/opt/zimbra/backup' }), heartbeat()]));
  check(
    'montajes_omitidos with a mount point → EV-01 NO_CUMPLE naming the directory',
    withOmission.estado('EV-01') === 'NO_CUMPLE' && /\/opt\/zimbra\/backup/.test(withOmission.motivo('EV-01')),
    `${withOmission.estado('EV-01')} ${withOmission.motivo('EV-01')}`
  );
  check(
    'and the motive says it is on another disk and was not included',
    /otro disco/.test(withOmission.motivo('EV-01')) && /no se incluyeron en la copia/.test(withOmission.motivo('EV-01')),
    withOmission.motivo('EV-01')
  );

  const unknown = evaluate(events([copy({ montajes_omitidos: '-' }), heartbeat()]));
  check(
    'REVERSAL: montajes_omitidos=- (no log, unknown) does not count → EV-01 stays CUMPLE',
    unknown.estado('EV-01') === 'CUMPLE',
    `${unknown.estado('EV-01')} ${unknown.motivo('EV-01')}`
  );

  const none = evaluate(events([copy({ montajes_omitidos: '' }), heartbeat()]));
  check(
    'empty montajes_omitidos (none) does not count → EV-01 stays CUMPLE',
    none.estado('EV-01') === 'CUMPLE',
    `${none.estado('EV-01')} ${none.motivo('EV-01')}`
  );

  const sinCampo = evaluate(events([copy(), heartbeat()]));
  check(
    'a fact without the field (earlier collector) is judged as before → EV-01 CUMPLE',
    sinCampo.estado('EV-01') === 'CUMPLE',
    `${sinCampo.estado('EV-01')} ${sinCampo.motivo('EV-01')}`
  );

  const accepted = evaluate(events([copy({ montajes_omitidos: '', montajes_omitidos_aceptados: '/mnt/aceptado' }), heartbeat()]));
  check(
    'montajes_omitidos_aceptados is cited in the motive',
    /\/mnt\/aceptado/.test(accepted.motivo('EV-01')),
    accepted.motivo('EV-01')
  );
  check(
    'but it does not count: EV-01 stays CUMPLE',
    accepted.estado('EV-01') === 'CUMPLE',
    `${accepted.estado('EV-01')} ${accepted.motivo('EV-01')}`
  );

  const ambos = evaluate(
    events([copy({ montajes_omitidos: '/opt/zimbra/backup', montajes_omitidos_aceptados: '/mnt/aceptado' }), heartbeat()])
  );
  check(
    'with one unaccepted omission and one accepted → NO_CUMPLE naming the unaccepted one and citing the accepted one',
    ambos.estado('EV-01') === 'NO_CUMPLE' && /\/opt\/zimbra\/backup/.test(ambos.motivo('EV-01')) && /\/mnt\/aceptado/.test(ambos.motivo('EV-01')),
    ambos.motivo('EV-01')
  );
}

section('32. EV-05 · A6, the test declared by the organization on Zimbra Open Source');

{
  const declared2 = linea(
    'restore_test',
    {
      origen: 'zimbra-ose-declarada',
      objeto: 'buzones',
      fecha: ago(3 * 24),
      testigo: 'declarado',
      resultado: 'ok',
      coincide: 'si',
      limpieza: 'no_aplica',
      detalle: 'declarada: se abrió el buzón ensfacil_testigo y se comprobaron los últimos 5 correos',
    },
    ago(3 * 24)
  );
  const r = evaluate(events([declared2, heartbeat(PASS, { origen: 'zimbra-ose-declarada', rol: 'buzones' })]));

  check(
    'ok+matches within P-05 → EV-05 CUMPLE, like any other test',
    r.estado('EV-05') === 'CUMPLE',
    `${r.estado('EV-05')} ${r.motivo('EV-05')}`
  );
  check(
    'and the motive says it is a test declared by the organization',
    /prueba declarada por la organización/.test(r.motivo('EV-05')),
    r.motivo('EV-05')
  );
  check(
    'citing what was checked',
    /se abrió el buzón ensfacil_testigo/.test(r.motivo('EV-05')),
    r.motivo('EV-05')
  );

  const normal = evaluate(
    events([
      linea(
        'restore_test',
        {
          origen: 'zimbra-ne',
          objeto: 'buzones',
          fecha: ago(3 * 24),
          testigo: 'testigo@ejemplo.invalid',
          resultado: 'ok',
          coincide: 'si',
          limpieza: 'ok',
          detalle: 'mensaje de control presente',
        },
        ago(3 * 24)
      ),
      heartbeat(),
    ])
  );
  check(
    'REVERSAL: a normal test (with technical witness) does not carry that phrase',
    !/prueba declarada por la organización/.test(normal.motivo('EV-05')),
    normal.motivo('EV-05')
  );

  const failure = evaluate(
    events([
      linea(
        'restore_test',
        {
          origen: 'zimbra-ose-declarada',
          objeto: 'buzones',
          fecha: ago(2 * 24),
          testigo: 'declarado',
          resultado: 'error',
          coincide: 'no',
          limpieza: 'no_aplica',
          detalle: 'declarada: no se pudo acceder a los correos migrados',
        },
        ago(2 * 24)
      ),
      heartbeat(PASS, { origen: 'zimbra-ose-declarada', rol: 'buzones' }),
    ])
  );
  check(
    'a declared test with resultado=error is judged like any other → NO_CUMPLE',
    failure.estado('EV-05') === 'NO_CUMPLE' && /prueba declarada por la organización/.test(failure.motivo('EV-05')),
    `${failure.estado('EV-05')} ${failure.motivo('EV-05')}`
  );
}

section('33. The report shows the omitted mounts and the declared test');

{
  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration(BASE) : c)),
  });

  const facts = events([
    copy({ ultima_correcta: ago(10), montajes_omitidos: '/opt/zimbra/backup', montajes_omitidos_aceptados: '/mnt/aceptado' }),
    heartbeat(),
    linea(
      'restore_test',
      {
        origen: 'zimbra-ose-declarada',
        objeto: 'buzones',
        fecha: ago(3 * 24),
        testigo: 'declarado',
        resultado: 'ok',
        coincide: 'si',
        limpieza: 'no_aplica',
        detalle: 'declarada: se comprobó el buzón testigo',
      },
      ago(3 * 24)
    ),
    heartbeat(PASS, { origen: 'zimbra-ose-declarada', rol: 'buzones' }),
  ]);

  const result = getENSComplianceResultByControl(CONTROL, 'MEDIO', facts, SRV01.id, [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }], NOW);
  const report = buildENSReportModel(CONTROL, result);
  const campo = (id: string) => report?.fields.find(f => f.id === id);

  check(
    'REP-02 names the mount point the backup left out',
    /\/opt\/zimbra\/backup/.test(campo('REP-02')?.value || ''),
    campo('REP-02')?.value
  );
  check(
    'and its detail cites the accepted omission',
    (campo('REP-02')?.details || []).some(d => /\/mnt\/aceptado/.test(d)),
    JSON.stringify(campo('REP-02')?.details)
  );
  check(
    'REP-07 marks the test as declared by the organization',
    /declarada por la organización/.test(campo('REP-07')?.value || ''),
    campo('REP-07')?.value
  );

  ensConfigurationRepository.reset();
}

section('34. A backup\'s accepted omission does not disappear when another backup fails');

{
  const backupA = copy({ backup_id: 'srv01_a', ultima_correcta: ago(10), montajes_omitidos: '', montajes_omitidos_aceptados: '/mnt/aceptado' });
  const backupB = copy({ backup_id: 'srv01_b', ultima_correcta: '-', ultima_fallida: ago(2), resultado_ultima: 'error' });
  const facts = events([backupA, backupB, heartbeat()]);

  const r = evaluate(facts);
  check(
    'two backup-ids, one CUMPLE with an accepted omission and the other NO_CUMPLE for another reason → EV-01 NO_CUMPLE',
    r.estado('EV-01') === 'NO_CUMPLE',
    `${r.estado('EV-01')} ${r.motivo('EV-01')}`
  );

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration(BASE) : c)),
  });

  const result = getENSComplianceResultByControl(CONTROL, 'MEDIO', facts, SRV01.id, [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }], NOW);
  const report = buildENSReportModel(CONTROL, result);
  const rep02 = report?.fields.find(f => f.id === 'REP-02');

  check(
    'but the report datum (REP-02) still shows srv01_a\'s accepted omission, even though EV-01\'s combined motive loses it',
    /srv01_a/.test(rep02?.value || '') && /\/mnt\/aceptado/.test(rep02?.value || ''),
    rep02?.value
  );

  ensConfigurationRepository.reset();
}

section('35. Without P-06: the backup path is reported by each collector');

{
  const fs = require('fs');
  const lineas: Linea[] = String(fs.readFileSync(`${__dirname}/fixtures/mp-info-6-pbs-pass.ndjson`, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l: string) => JSON.parse(l));
  const machine = { id: SRV01.id, name: String(lineas[0].host) };
  const realNow = new Date(Math.max(...lineas.map(l => Date.parse(String(l.ts)))) + 10 * 60 * 1000);
  const declared: Valores = {
    'P-01': '24',
    'P-02': '4',
    'P-03': '30',
    'P-04': `${machine.name} | MEDIA`,
    'P-05': '90',
    'P-07': 'root,backup',
    'P-14': '7',
  };

  const validation = validateControlConfiguration(configuration(declared), 'MEDIO');
  check(
    'the declared configuration is complete: P-06 is not mandatory',
    validation.status === 'CONFIGURED' && validation.missingRequired.length === 0,
    `${validation.status}: faltan ${validation.missingRequired.map(p => p.id).join(', ') || 'ninguno'}`
  );

  ensConfigurationRepository.replaceActive({
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration(declared) : c)),
  });

  const row = getENSComplianceResultByControl(CONTROL, 'MEDIO', events(lineas, machine), machine.id, [{ ...machine, groups: ['ens'] }], realNow);
  check(
    'with the real pass and without P-06, the row complies with everything proven',
    row?.status === 'CUMPLE' && row.measuredRequirements === row.applicableRequirements,
    row && `${row.status} ${row.score} ${row.measuredRequirements}/${row.applicableRequirements}`
  );

  const ultimo = lineas.reduce((a, l) => (String(l.ts) > a ? String(l.ts) : a), '');
  const withoutRetention = [
    ...lineas.filter(l => l.event !== 'backup_retention'),
    {
      ensfacil: CONTROL,
      ts: ultimo,
      host: machine.name,
      event: 'evidence_state',
      evidence_id: 'EV-03',
      origen: 'pbs',
      objeto: 'fichero',
      estado: 'NO_EVALUABLE',
      causa: 'EVIDENCE',
      motivo: 'el PBS no devuelve la poda del datastore',
    },
  ];
  const retentionUnmeasured = getENSComplianceResultByControl(CONTROL, 'MEDIO', events(withoutRetention, machine), machine.id, [{ ...machine, groups: ['ens'] }], realNow);
  const retentionKept = (retentionUnmeasured?.nonConformities || []).find(n => n.requirementId === 'mp.info.6.2.b');
  check(
    'EV-03 unmeasured and without P-06: the mp.info.6.2.b finding does not send to configure P-06',
    !!retentionKept && !/P-06/.test(retentionKept.finding),
    retentionKept && `${retentionKept.cause}: ${retentionKept.finding}`
  );

  ensConfigurationRepository.reset();
}

section('36. Parameters the judgment never reads are never requested in a finding');

{
  const INFORMATIVE = ['P-06', 'P-08', 'P-09', 'P-10', 'P-11', 'P-12', 'P-13', 'P-14'];
  const NAMES = new RegExp(`\\b(${INFORMATIVE.join('|')})\\b`);
  const mandatory: Valores = {
    'P-01': '24',
    'P-02': '4',
    'P-03': '30',
    'P-04': 'srv-01',
    'P-05': '7',
    'P-07': 'root,backup',
  };
  const unmeasured = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06'].map(id =>
    linea('evidence_state', { evidence_id: id, estado: 'NO_EVALUABLE', causa: 'EVIDENCE', motivo: `el PBS no responde (${id})` })
  );
  const findings = (valores: Valores) => {
    ensConfigurationRepository.replaceActive({
      ...defaultENSConfigurationTemplate,
      controls: defaultENSConfigurationTemplate.controls.map(c => (c.controlId === CONTROL ? configuration(valores) : c)),
    });

    const row = getENSComplianceResultByControl(CONTROL, 'ALTO', events([...unmeasured, heartbeat()]), SRV01.id, [{ id: SRV01.id, name: SRV01.name, groups: ['ens'] }], NOW);

    ensConfigurationRepository.reset();

    return (row?.nonConformities || []).filter(n => n.id !== 'NC-CFG');
  };

  const emptyInformatives = findings(mandatory);
  const culpables = emptyInformatives.filter(
    n => NAMES.test(`${n.finding} ${n.requiredAction}`) || (n.parameterIds || []).some(p => INFORMATIVE.includes(p))
  );
  check(
    'everything pending at ALTO and P-06, P-08...P-14 without value: there are findings for all requirements',
    emptyInformatives.length === mpInfo6CatalogDefinition.requirements.length,
    emptyInformatives.map(n => n.requirementId).join(', ')
  );
  check(
    'and none names or asks to configure an informative parameter',
    culpables.length === 0,
    culpables.map(n => `${n.requirementId}: ${n.requiredAction} [${(n.parameterIds || []).join(',')}]`).join(' | ')
  );
  check(
    'nor turns the gap into a CONFIGURACIÓN one: it is EVIDENCIA, as the collector declares',
    emptyInformatives.every(n => n.cause === 'EVIDENCE'),
    emptyInformatives.map(n => `${n.requirementId}:${n.cause}`).join(' ')
  );

  const { 'P-07': _p07, ...withoutP07 } = mandatory;
  const access = findings(withoutP07).find(n => n.requirementId === 'mp.info.6.2.d');
  check(
    'REVERSAL: without P-07 the mp.info.6.2.d finding does ask to configure it',
    !!access && access.cause === 'CONFIGURATION' && /P-07/.test(access.requiredAction),
    access && `${access.cause}: ${access.requiredAction}`
  );

  const soloLocal = [linea('backup_storage', { destino: '/backup', misma_maquina: 'si', tipo: 'local', activo: 'si' }), heartbeat()];
  const declared2 = evaluate(events(soloLocal), { ...BASE, 'P-08': 'sí' }, 'ALTO');
  check(
    'P-08 = sí with no off-machine copy → EV-06 NO_CUMPLE and its motive cites P-08',
    declared2.estado('EV-06') === 'NO_CUMPLE' && /P-08 declara que existe copia en ubicación alternativa, y no se observa/.test(declared2.motivo('EV-06')),
    `${declared2.estado('EV-06')} ${declared2.motivo('EV-06')}`
  );
  const undeclared2 = evaluate(events(soloLocal), BASE, 'ALTO');
  check(
    'REVERSAL: without P-08, the same NO_CUMPLE and without the citation',
    undeclared2.estado('EV-06') === 'NO_CUMPLE' && !/P-08/.test(undeclared2.motivo('EV-06')),
    `${undeclared2.estado('EV-06')} ${undeclared2.motivo('EV-06')}`
  );
}

section('11. No other control changes');

{
  const fs = require('fs');
  const folder = process.env.ENSFACIL_REAL_DATA;
  const reales = Boolean(folder && fs.existsSync(`${folder}/data/now.txt`));

  let base: ENSConfigurationVersion = defaultENSConfigurationTemplate;
  let facts: ENSNormalizedEvent[];
  let now = NOW;

  if (reales) {
    const parameters = `${folder}/params/active.clean.json`;

    if (fs.existsSync(parameters)) {
      base = assertENSConfigurationVersion(JSON.parse(fs.readFileSync(parameters, 'utf8'))._source.configuration);
    }

    now = new Date(fs.readFileSync(`${folder}/data/now.txt`, 'utf8').trim());

    const vistos = new Set<string>();
    const hits: any[] = [];

    ENSCatalog.forEach(c => {
      const file = `${folder}/data/a-${c.id}.json`;

      if (!fs.existsSync(file)) {
        return;
      }

      JSON.parse(fs.readFileSync(file, 'utf8')).hits.hits.forEach((h: any) => {
        if (!vistos.has(h._id)) {
          vistos.add(h._id);
          hits.push(h);
        }
      });
    });

    facts = normalizeWazuhAlerts(hits).filter(e => e.controlId !== CONTROL);
  } else {
    facts = normalizeWazuhAlerts(
      [SRV01, SRV02].flatMap(agent => [
        {
          _id: `op-exp-1-${agent.id}`,
          _source: {
            '@timestamp': PASS,
            agent: agent,
            rule: { id: '110299' },
            data: { ensfacil: 'op.exp.1', event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-05' },
          },
        },
        {
          _id: `op-exp-8-${agent.id}`,
          _source: {
            '@timestamp': PASS,
            agent: agent,
            rule: { id: '110901' },
            data: { ensfacil: 'op.exp.8', event: 'audit_log_status', evidence_id: 'EV-01', fuente: 'auditd', activo: 'si', reglas_cargadas: '80' },
          },
        },
      ])
    );
  }

  const scope: ENSAgentScope[] = Array.from(
    new Map(facts.filter(e => e.agentId).map(e => [e.agentId as string, e.agentName])).entries()
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, name]) => ({ id, name, groups: id === '000' ? [] : ['ens'], ...(id === '000' ? { isManager: true } : {}) }));

  const machine = scope.find(a => a.id !== '000')!;
  const level = base.global.ensLevel;

  const withMpInfo6 = (valores: Valores | undefined): void => {
    ensConfigurationRepository.replaceActive({
      ...base,
      controls: base.controls.map(c =>
        c.controlId !== CONTROL || !valores
          ? c
          : {
              ...c,
              parameters: c.parameters.map(p => {
                const { value: _anterior, ...sinValor } = p;

                return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
              }),
            }
      ),
    });
  };

  const ofMpInfo6 = events(
    [
      copy({ host: machine.name || '', ultima_correcta: '-', ultima_fallida: now.toISOString(), resultado_ultima: 'error' }, now.toISOString()),
      heartbeat(now.toISOString(), { host: machine.name || '' }),
    ],
    { id: machine.id, name: machine.name || '' }
  );

  const fingerprint = (valor: unknown): string =>
    JSON.stringify(valor, (clave, v) => (clave === 'evaluatedAt' ? undefined : v));

  const others = ENSCatalog.map(c => c.id).filter(id => id !== CONTROL);

  const snapshot = (evs: ENSNormalizedEvent[]) => {
    const result: Record<string, string> = {};
    const vistas: Array<string | undefined> = [undefined, ...scope.map(a => a.id)];

    vistas.forEach(vista => {
      const estado = getENSComplianceState(level, evs, vista, scope, now);

      estado.results
        .filter(r => others.includes(r.control.id))
        .forEach(r => {
          result[`vista ${vista || 'conjunto'} · ${r.control.id}`] = fingerprint(r);
        });

      if (vista === undefined) {
        estado.agents.forEach(a =>
          a.results
            .filter(r => others.includes(r.control.id))
            .forEach(r => {
              result[`fila ${a.agentId} · ${r.control.id}`] = fingerprint(r);
            })
        );
      }
    });

    others.forEach(id => {
      result[`detalle · ${id}`] = fingerprint(getENSComplianceResultByControl(id, level, evs, undefined, scope, now));
    });

    return result;
  };

  withMpInfo6({ 'P-04': undefined });
  const sin = snapshot(facts);
  const rowWithout = getENSComplianceState(level, facts, undefined, scope, now).agents.find(a => a.agentId === machine.id)!;

  withMpInfo6({ ...BASE, 'P-04': machine.name });
  const con = snapshot([...facts, ...ofMpInfo6]);
  const rowWith = getENSComplianceState(level, [...facts, ...ofMpInfo6], undefined, scope, now).agents.find(a => a.agentId === machine.id)!;

  check(
    `${reales ? 'real data' : 'minimal sample'}: without P-04, mp.info.6 is not in ${machine.name}'s row; with P-04 and its facts, it is`,
    !rowWithout.results.some(r => r.control.id === CONTROL) && rowWith.results.some(r => r.control.id === CONTROL)
  );

  const claves = Object.keys(sin);
  const distinct = claves.filter(k => sin[k] !== con[k]);

  check(
    `the other ${others.length} controls do not change (${claves.length} results compared)`,
    others.length === 22 && claves.length > others.length && distinct.length === 0 && Object.keys(con).length === claves.length,
    distinct.slice(0, 5).join('; ')
  );

  ensConfigurationRepository.reset();
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
