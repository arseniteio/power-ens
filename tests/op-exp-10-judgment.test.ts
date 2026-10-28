/** op.exp.10: judgment of cryptographic key protection. */
import { opExp10PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-10.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp10CatalogDefinition } from '../common/ens/catalog/op-exp-10';
import { opExp10Configuration } from '../common/ens/configuration/data/op-exp-10-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { compareENSIds } from '../public/ens/control-filter/prefix';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

declare const process: { exit(code: number): void };

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

const NOW = new Date('2026-09-26T19:30:00Z');
const ago = (hours: number): string =>
  new Date(NOW.getTime() - hours * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let counter = 0;

const alert = (data: Record<string, unknown>, ts = ago(0.5), agent = 'wazuh-real', control = 'op.exp.10') => {
  counter += 1;

  return {
    _id: `alerta-${counter}`,
    _source: {
      '@timestamp': ts,
      agent: { id: agent === 'wazuh-real' ? '024' : '031', name: agent },
      rule: { id: '111100', description: 'op.exp.10' },
      location: '/var/log/power-ens/op_exp_10.json',
      data: Object.fromEntries(
        Object.entries({ power_ens: control, ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

const heartbeat = (covered: string, agent = 'wazuh-real', ts = ago(0.4)) =>
  alert({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: covered }, ts, agent);

const ALL_OF_THEM = 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08';

const clave = (ruta: string, extra: Record<string, unknown> = {}, agent = 'wazuh-real') =>
  alert({
    event: 'key_material_found',
    evidence_id: 'EV-02,EV-06,EV-08',
    requisito: 'op.exp.10.1',
    ruta,
    directorio: ruta.replace(/\/[^/]+$/, ''),
    formato: 'openssh',
    algoritmo: 'ED25519:256',
    cifrada: 'no',
    huella: `SHA256:${ruta}`,
    modo: '600',
    propietario: 'root',
    grupo: 'root',
    ...extra,
  }, ago(0.45), agent);

const config = (usage: string, element: string, algorithms: string, service = 'sshd') =>
  alert({
    event: 'crypto_config_observed',
    evidence_id: 'EV-03',
    servicio: service,
    uso: usage,
    elemento: element,
    algoritmos: algorithms,
    identificadores: 'x',
  }, ago(0.45));

const certificate = (caduca: string, extra: Record<string, unknown> = {}) =>
  alert({
    event: 'certificate_observed',
    evidence_id: 'EV-07',
    ruta: '/var/ossec/etc/wpk_root.pem',
    sujeto: 'Wazuh CA',
    emisor: 'Wazuh CA',
    desde: '2022-08-18T15:41:28Z',
    caduca,
    algoritmo_clave: 'RSA:2048',
    algoritmo_firma: 'sha256WithRSAEncryption',
    hash_firma: 'SHA-256',
    ...extra,
  }, ago(0.45));

const events = (...alerts: ReturnType<typeof alert>[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alerts);

const configuration = (values: Record<string, string[] | string>): ENSControlConfiguration => ({
  ...opExp10Configuration,
  parameters: opExp10Configuration.parameters.map(p => ({
    ...p,
    value: values[p.id],
  })),
});

const P02 = ['/etc/ssh | 600 | root', '/var/ossec/etc | 640 | wazuh'];
const P03 = [
  'cifrado | AES-GCM | 128',
  'cifrado | AES-CTR | 128',
  'mac | HMAC-SHA2-256 | 256',
  'mac | HMAC-SHA2-512 | 512',
  'intercambio | ECDH-P256 | 256',
  'intercambio | ECDH-P384 | 384',
  'intercambio | DH | 3072',
  'firma | ECDSA-P256 | 256',
  'firma | ECDSA-P384 | 384',
  'firma | RSA | 3072',
  'firma | ED25519 | 256',
  'hash | SHA-256 | ',
  'hash | SHA-384 | ',
];
const BASE: Record<string, string[] | string> = {
  'P-01': ['clave de host SSH | acceso | fichero | /etc/ssh | Sistemas | activa |'],
  'P-02': P02,
  'P-03': P03,
  'P-04': ['sshd | * | 22121'],
  'P-05': ['wazuh-real | explotacion | red de laboratorio'],
  'P-06': ['caja fuerte CPD | soporte fuera de línea | sin conexión a red'],
  'P-07': 'PR-20 Gestión de claves criptográficas v2 (5 fases)',
  'P-08': ['root | todas | total', 'wazuh | client.keys | lectura', 'dioni | todas | total'],
};

const evaluate = (
  evs: ENSNormalizedEvent[],
  values: Record<string, string[] | string> = BASE,
  now: Date = NOW,
  level: ENSLevel = 'MEDIO'
) => {
  const cfg = configuration(values);
  const evidences = resolveEvidenceForControl('op.exp.10', evs, undefined, level, cfg, now);
  const context = buildPolicyContext(opExp10CatalogDefinition, cfg, level, evs, evidences, now);
  const { decisions } = opExp10PolicyDefinition.evaluator!(context);
  const principal = (requirement: string) => decisions.find(d => d.requirementId === requirement);
  const ofEvidence = (id: string, requirement?: string) =>
    decisions.find(d => d.trace.ruleId.endsWith(`/${id}`) && (!requirement || d.requirementId === requirement));
  const evidence = (id: string) => evidences.find(e => e.id === id);

  return { evidencias: evidences, decisions, principal, deEvidencia: ofEvidence, evidencia: evidence, cfg, nivel: level };
};

section('1. Catalog: ACTIVE, base at the three levels, R1 at MEDIO and ALTO, R2 at none');

{
  const levelsOf = (id: string) =>
    opExp10CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  check('the control is ACTIVE', opExp10CatalogDefinition.status === 'ACTIVE');
  check('op.exp.10.1 to .3 at BAJO, MEDIO and ALTO', ['op.exp.10.1', 'op.exp.10.2', 'op.exp.10.3'].every(id => levelsOf(id) === 'BAJO,MEDIO,ALTO'));
  check('R1 at MEDIO and ALTO: MEDIA and ALTA require the same', levelsOf('op.exp.10.r1.1') === 'MEDIO,ALTO');
  check('R2 is not required in any category', levelsOf('op.exp.10.r2.1') === '');

  const p01 = opExp10Configuration.parameters.find(p => p.id === 'P-01')!;
  check('P-01 carries the `estado` column (activa | retirada)', (p01.columns || []).some(c => c.name === 'estado' && (c.options || []).includes('retirada')));
  const p06 = opExp10Configuration.parameters.find(p => p.id === 'P-06')!;
  check('P-06 is a table with columns, not a format of its own', p06.type === 'table' && (p06.columns || []).length === 3);
  const p10 = opExp10Configuration.parameters.find(p => p.id === 'P-10')!;
  check('P-10 (expiry lead time) is optional and in days', p10.type === 'duration_days' && p10.required === false);
  check('no parameter is mandatory and only R1\'s', opExp10Configuration.parameters.filter(p => p.required && p.levels.join() === 'MEDIO,ALTO').length === 0);
}

section('2. op.exp.10 is not confused with op.exp.1');

{
  const ids = ['op.exp.2', 'op.exp.10', 'op.exp.1', 'op.exp.9'].sort(compareENSIds);
  check('natural order puts op.exp.10 after op.exp.9', ids.join(',') === 'op.exp.1,op.exp.2,op.exp.9,op.exp.10', ids.join(','));

  const foreignOne = events(
    heartbeat(ALL_OF_THEM),
    alert({ event: 'key_material_accessed', evidence_id: 'EV-01', actor: 'intruso', recurso: '/etc/ssh/ssh_host_rsa_key', acceso: 'lectura', proceso: '/usr/bin/cp' }, ago(1), 'wazuh-real', 'op.exp.1')
  );
  const r = evaluate(foreignOne);
  check('an access emitted as op.exp.1 does not count in op.exp.10\'s EV-01', r.deEvidencia('EV-01')?.status === 'CUMPLE', r.deEvidencia('EV-01')?.reason);
}

section('3. EV-02 (key outside the store) and EV-08 (protection), with their reversals');

{
  const evs = events(
    heartbeat(ALL_OF_THEM),
    clave('/etc/ssh/ssh_host_ed25519_key'),
    clave('/home/dioni/.ssh/id_ed25519', { propietario: 'dioni', grupo: 'dioni' }),
    clave('/var/ossec/etc/client.keys', { formato: 'wazuh-client-keys', algoritmo: 'clave-compartida', huella: '', modo: '640', propietario: 'wazuh' })
  );
  let r = evaluate(evs);
  check('a key in /home/dioni/.ssh with no declared store → EV-02 NO_CUMPLE', r.evidencia('EV-02')?.status === 'NO_CUMPLE', r.evidencia('EV-02')?.observations.join(' '));
  check('and EV-08 cannot judge it: its directory has no row', r.evidencia('EV-08')?.status === 'NO_EVALUABLE' && r.evidencia('EV-08')?.gapCause === 'CONFIGURATION', r.evidencia('EV-08')?.status);

  r = evaluate(evs, { ...BASE, 'P-02': [...P02, '/home/dioni/.ssh | 600 | dioni'] });
  check('SAME event with the store declared → EV-02 CUMPLE', r.evidencia('EV-02')?.status === 'CUMPLE', r.evidencia('EV-02')?.observations.join(' '));
  check('and EV-08 CUMPLE: 600 and 640 grant no more than declared', r.evidencia('EV-08')?.status === 'CUMPLE', r.evidencia('EV-08')?.observations.join(' '));

  const lax = events(heartbeat(ALL_OF_THEM), clave('/etc/ssh/ssh_host_rsa_key', { modo: '644' }));
  r = evaluate(lax);
  check('a host key at 644 where 600 is admitted → EV-08 NO_CUMPLE', r.evidencia('EV-08')?.status === 'NO_CUMPLE', r.evidencia('EV-08')?.observations.join(' '));
  r = evaluate(events(heartbeat(ALL_OF_THEM), clave('/etc/ssh/ssh_host_rsa_key', { modo: '400' })));
  check('the same at 400 → EV-08 CUMPLE: more restrictive is not a deviation', r.evidencia('EV-08')?.status === 'CUMPLE');
  r = evaluate(events(heartbeat(ALL_OF_THEM), clave('/etc/ssh/ssh_host_rsa_key', { propietario: 'dioni' })));
  check('the same with another owner → EV-08 NO_CUMPLE', r.evidencia('EV-08')?.status === 'NO_CUMPLE');

  r = evaluate(events(heartbeat(ALL_OF_THEM)));
  check('complete sweep with no key → EV-02 CUMPLE by absence with heartbeat', r.evidencia('EV-02')?.status === 'CUMPLE');
  r = evaluate(events(heartbeat('EV-03')));
  check('without a heartbeat covering EV-02 → NO_EVALUABLE, never CUMPLE', r.evidencia('EV-02')?.status === 'NO_EVALUABLE');
}

section('4. EV-01: the actor against P-08, and coverage even with facts');

{
  const access = (actor: string) =>
    alert({ event: 'key_material_accessed', evidence_id: 'EV-01', actor, sesion: 'con_sesion', recurso: '/etc/ssh/ssh_host_rsa_key', acceso: 'lectura', operacion: 'openat', proceso: '/usr/bin/cp', veces: 1, ultima: ago(2) }, ago(0.45));

  let r = evaluate(events(heartbeat(ALL_OF_THEM), access('mallory')));
  check('mallory reads a host key and is not in P-08 → NO_CUMPLE', r.deEvidencia('EV-01')?.status === 'NO_CUMPLE', r.deEvidencia('EV-01')?.reason);
  check('the motive names the account and the path', /mallory/.test(r.deEvidencia('EV-01')?.reason || '') && /ssh_host_rsa_key/.test(r.deEvidencia('EV-01')?.reason || ''));
  r = evaluate(events(heartbeat(ALL_OF_THEM), access('mallory')), { ...BASE, 'P-08': [...(BASE['P-08'] as string[]), 'mallory | clave de host | lectura'] });
  check('SAME event with mallory in P-08 → CUMPLE', r.deEvidencia('EV-01')?.status === 'CUMPLE', r.deEvidencia('EV-01')?.reason);

  r = evaluate(events(heartbeat('EV-02,EV-03'), access('root')));
  check('authorized access but the heartbeat does not cover EV-01 → NO_EVALUABLE (not everything was watched)', r.deEvidencia('EV-01')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-01')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM)));
  check('no access with confirmed coverage → CUMPLE', r.deEvidencia('EV-01')?.status === 'CUMPLE');
  r = evaluate(events(heartbeat(ALL_OF_THEM, 'wazuh-real', ago(30))));
  check('with the heartbeat from 30 h ago → NO_EVALUABLE', r.deEvidencia('EV-01')?.status === 'NO_EVALUABLE');
  r = evaluate(events(heartbeat(ALL_OF_THEM)), { ...BASE, 'P-08': [] });
  check('sin P-08 → NO_EVALUABLE', r.deEvidencia('EV-01')?.status === 'NO_EVALUABLE');
}

section('5. EV-03: each algorithm against its usage row and minimum length');

{
  const sshd = [
    config('cifrado', 'Ciphers', 'AES-CTR:128,AES-GCM:256'),
    config('firma', 'PubkeyAcceptedAlgorithms', 'ED25519:256,ECDSA-P256:256,RSA:1024'),
  ];
  let r = evaluate(events(heartbeat(ALL_OF_THEM), ...sshd));
  check('RequiredRSASize 1024 against RSA 3072 → EV-03 NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE', r.deEvidencia('EV-03')?.reason);
  check('the motive names the element and the minimum', /RSA:1024/.test(r.deEvidencia('EV-03')?.reason || '') && /3072/.test(r.deEvidencia('EV-03')?.reason || ''));
  r = evaluate(events(heartbeat(ALL_OF_THEM), ...sshd), { ...BASE, 'P-03': P03.map(f => (f === 'firma | RSA | 3072' ? 'firma | RSA | 1024' : f)) });
  check('SAME event with RSA 1024 admitted in P-03 → CUMPLE', r.deEvidencia('EV-03')?.status === 'CUMPLE', r.deEvidencia('EV-03')?.reason);

  r = evaluate(events(heartbeat(ALL_OF_THEM), config('cifrado', 'Ciphers', 'CHACHA20-POLY1305:256,AES-GCM:256')));
  check('a cipher without a row in P-03 (CHACHA20-POLY1305) → NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE', r.deEvidencia('EV-03')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM), config('intercambio', 'KexAlgorithms', 'ECDH-P256:256,SNTRUP761-X25519')), { ...BASE, 'P-03': [...P03, 'intercambio | SNTRUP761-X25519 | '] });
  check('an algorithm without length complies if its row requires no length', r.deEvidencia('EV-03')?.status === 'CUMPLE', r.deEvidencia('EV-03')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM), config('intercambio', 'KexAlgorithms', 'DH')));
  check('DH without length against a row requiring 3072 → NO_EVALUABLE, not CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-03')?.reason);

  r = evaluate(events(heartbeat(ALL_OF_THEM), config('cifrado', 'Ciphers', 'AES-GCM:256')), { ...BASE, 'P-04': ['sshd | * | 22', 'slapd | wazuh-real | 636'] });
  check('P-04 declares slapd on this machine and it is not observed → NO_EVALUABLE', r.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-03')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM), config('cifrado', 'Ciphers', 'AES-GCM:256')), { ...BASE, 'P-04': [] });
  check('without P-04 → NO_EVALUABLE: without scope it is not asserted that everything was verified', r.deEvidencia('EV-03')?.status === 'NO_EVALUABLE');
  r = evaluate(events(heartbeat(ALL_OF_THEM), config('cifrado', 'Ciphers', 'AES-GCM:256')), { ...BASE, 'P-03': [] });
  check('sin P-03 → NO_EVALUABLE', r.deEvidencia('EV-03')?.status === 'NO_EVALUABLE');
}

section('6. EV-04: what was negotiated, and partial coverage with LogLevel INFO');

{
  const negotiated = (usage: string, algorithm: string) =>
    alert({ event: 'crypto_protocol_negotiated', evidence_id: 'EV-04', servicio: 'sshd', uso: usage, algoritmo: algorithm, identificador: 'publickey', veces: 39, ultima: ago(1) }, ago(0.45));

  let r = evaluate(events(heartbeat('EV-02,EV-03'), negotiated('firma', 'ED25519:256')));
  check('authorized but without coverage (LogLevel INFO) → NO_EVALUABLE', r.deEvidencia('EV-04')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-04')?.reason);
  r = evaluate(events(heartbeat('EV-02,EV-03'), negotiated('firma', 'RSA:2048')));
  check('a negotiated RSA 2048 key → NO_CUMPLE even if coverage is partial', r.deEvidencia('EV-04')?.status === 'NO_CUMPLE', r.deEvidencia('EV-04')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM), negotiated('firma', 'ED25519:256')));
  check('authorized and with full coverage → CUMPLE', r.deEvidencia('EV-04')?.status === 'CUMPLE');
}

section('7. EV-05: THIS machine\'s function in P-05');

{
  const genera = alert({ event: 'key_generation_tool_executed', evidence_id: 'EV-05', herramienta: 'ssh-keygen', operacion: '-t ed25519', actor: 'dioni', veces: 1, ultima: ago(3) }, ago(0.45));

  let r = evaluate(events(heartbeat(ALL_OF_THEM), genera));
  check('ssh-keygen generating on a production machine → NO_CUMPLE', r.deEvidencia('EV-05')?.status === 'NO_CUMPLE', r.deEvidencia('EV-05')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM), genera), { ...BASE, 'P-05': ['wazuh-real | generacion | red aislada'] });
  check('SAME event with the machine declared for generation → no breach (NO_EVALUABLE: isolation is not measured)', r.deEvidencia('EV-05')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-05')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM)));
  check('production without generation and with coverage → CUMPLE', r.deEvidencia('EV-05')?.status === 'CUMPLE');
  r = evaluate(events(heartbeat('EV-02')));
  check('without EV-05 coverage (auditd rules not loaded) → NO_EVALUABLE', r.deEvidencia('EV-05')?.status === 'NO_EVALUABLE');
  r = evaluate(events(heartbeat(ALL_OF_THEM)), { ...BASE, 'P-05': ['otra-maquina | explotacion | DMZ'] });
  check('machine without a row in P-05 → NO_EVALUABLE', r.deEvidencia('EV-05')?.status === 'NO_EVALUABLE');
  r = evaluate(events(heartbeat(ALL_OF_THEM), genera), { ...BASE, 'P-05': ['WAZUH-REAL | Explotación | DMZ'] });
  check('name and function are compared ignoring case and accents', r.deEvidencia('EV-05')?.status === 'NO_CUMPLE');
}

section('8. EV-06: P-01 filtered by state, fingerprint or location');

{
  const evs = events(heartbeat(ALL_OF_THEM), clave('/etc/ssh/ssh_host_rsa_key', { huella: 'SHA256:M71np' }));
  let r = evaluate(evs, { ...BASE, 'P-01': ['clave de host RSA vieja | acceso | fichero | /srv/otra | Sistemas | retirada | SHA256:M71np'] });
  check('a key RETIRED in P-01 present by fingerprint → NO_CUMPLE', r.deEvidencia('EV-06')?.status === 'NO_CUMPLE', r.deEvidencia('EV-06')?.reason);
  r = evaluate(evs, { ...BASE, 'P-01': ['clave de host RSA | acceso | fichero | /srv/otra | Sistemas | activa | SHA256:M71np'] });
  check('SAME event with the ACTIVE key → CUMPLE', r.deEvidencia('EV-06')?.status === 'CUMPLE', r.deEvidencia('EV-06')?.reason);
  r = evaluate(evs, { ...BASE, 'P-01': ['vieja | acceso | fichero | /etc/ssh/ssh_host_rsa_key | Sistemas | retirada |'] });
  check('retired identified by exact location → NO_CUMPLE', r.deEvidencia('EV-06')?.status === 'NO_CUMPLE');
  r = evaluate(evs, { ...BASE, 'P-06': ['wazuh-real | disco | ninguno'] });
  check('P-06 archives on a production machine → NO_CUMPLE by itself', r.deEvidencia('EV-06')?.status === 'NO_CUMPLE', r.deEvidencia('EV-06')?.reason);
  r = evaluate(evs, { ...BASE, 'P-06': [] });
  check('sin P-06 → NO_EVALUABLE', r.deEvidencia('EV-06')?.status === 'NO_EVALUABLE');
  const encrypted = events(heartbeat(ALL_OF_THEM), clave('/root/backup.p12', { formato: 'pkcs12', huella: '', algoritmo: 'desconocido' }));
  r = evaluate(encrypted, { ...BASE, 'P-01': ['vieja | acceso | fichero |  | Sistemas | retirada | SHA256:zzz'] });
  check('retired only by fingerprint and a key without a readable fingerprint → NO_EVALUABLE, not CUMPLE', r.deEvidencia('EV-06')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-06')?.reason);
}

section('9. EV-07: expiry against the clock and algorithms against P-03');

{
  const evs = events(heartbeat(ALL_OF_THEM), certificate('2027-08-17T15:41:28Z'));
  let r = evaluate(evs);
  check('valid certificate → EV-07 CUMPLE for op.exp.10.1', r.deEvidencia('EV-07', 'op.exp.10.1')?.status === 'CUMPLE', r.deEvidencia('EV-07', 'op.exp.10.1')?.reason);
  r = evaluate(evs, BASE, new Date('2027-09-01T00:00:00Z'));
  check('SAME event a year later → expired → NO_CUMPLE', r.deEvidencia('EV-07', 'op.exp.10.1')?.status === 'NO_CUMPLE', r.deEvidencia('EV-07', 'op.exp.10.1')?.reason);
  r = evaluate(evs, { ...BASE, 'P-10': '400' });
  check('within P-10\'s lead time it is still CUMPLE, and the motive warns about it', r.deEvidencia('EV-07', 'op.exp.10.1')?.status === 'CUMPLE' && /PRÓXIMOS A CADUCAR/.test(r.deEvidencia('EV-07', 'op.exp.10.1')?.reason || ''), r.deEvidencia('EV-07', 'op.exp.10.1')?.reason);

  r = evaluate(evs);
  check('the RSA 2048 certificate against RSA 3072 → EV-07 NO_CUMPLE for R1', r.deEvidencia('EV-07', 'op.exp.10.r1.1')?.status === 'NO_CUMPLE', r.deEvidencia('EV-07', 'op.exp.10.r1.1')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM), certificate('2027-08-17T15:41:28Z', { algoritmo_clave: 'ECDSA-P256:256', hash_firma: 'SHA-1' })));
  check('SHA-1 signature → NO_CUMPLE for R1', r.deEvidencia('EV-07', 'op.exp.10.r1.1')?.status === 'NO_CUMPLE');
  r = evaluate(evs, BASE, NOW, 'BAJO');
  check('at BAJO there is no R1 decision: the bridge does not paint EV-07 with R1', !r.decisions.some(d => d.requirementId === 'op.exp.10.r1.1'));
}

section('10. Requirements and evidence table');

{
  const healthy = events(
    heartbeat(ALL_OF_THEM),
    clave('/etc/ssh/ssh_host_ed25519_key'),
    config('cifrado', 'Ciphers', 'AES-GCM:256'),
    certificate('2027-08-17T15:41:28Z', { algoritmo_clave: 'ECDSA-P256:256' })
  );
  let r = evaluate(healthy);
  const req = (id: string, rr = r) => evaluateRequirement(
    opExp10CatalogDefinition.requirements.find(q => q.id === id)!,
    'MEDIO',
    rr.evidencias,
    false,
    rr.decisions,
    'ACTIVE'
  );
  check('healthy machine with the whole policy declared → op.exp.10.1 CUMPLE', req('op.exp.10.1').status === 'CUMPLE', r.principal('op.exp.10.1')?.reason);
  check('op.exp.10.2 CUMPLE', req('op.exp.10.2').status === 'CUMPLE');
  check('op.exp.10.3 CUMPLE', req('op.exp.10.3').status === 'CUMPLE');
  check('op.exp.10.r1.1 CUMPLE', req('op.exp.10.r1.1').status === 'CUMPLE', r.principal('op.exp.10.r1.1')?.reason);
  check('op.exp.10.r2.1 NO_APLICA', req('op.exp.10.r2.1').status === 'NO_APLICA');

  r = evaluate(healthy, { ...BASE, 'P-07': '' });
  check('without P-07 → op.exp.10.1 not evidenced (NO_CUMPLE for not proven)', req('op.exp.10.1', r).status === 'NO_CUMPLE' && req('op.exp.10.1', r).evidenced === false, `${req('op.exp.10.1', r).status} ${req('op.exp.10.1', r).evidenced}`);
  const tabla = applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp10CatalogDefinition.requirements);
  check('and EV-01, which is measured, stays CUMPLE in the table: it does not inherit P-07\'s grey', tabla.find(e => e.id === 'EV-01')?.status === 'CUMPLE', tabla.find(e => e.id === 'EV-01')?.status);

  const withRed = events(heartbeat(ALL_OF_THEM), clave('/etc/ssh/ssh_host_ed25519_key', { modo: '644' }), config('cifrado', 'Ciphers', 'AES-GCM:256'), certificate('2027-08-17T15:41:28Z', { algoritmo_clave: 'ECDSA-P256:256' }));
  r = evaluate(withRed);
  check('a key at 644 brings down measured op.exp.10.1', req('op.exp.10.1', r).status === 'NO_CUMPLE' && req('op.exp.10.1', r).evidenced === true);
  const table2 = applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp10CatalogDefinition.requirements);
  check('EV-07, healthy, does not inherit EV-08\'s red', table2.find(e => e.id === 'EV-07')?.status === 'CUMPLE', table2.find(e => e.id === 'EV-07')?.status);
}

section('11. LDAP server: slapd facts are judged with the same policy');

{
  const slapd = (usage: string, algorithms: string) =>
    alert({ event: 'crypto_config_observed', evidence_id: 'EV-03', plano: 'directorio', servicio: 'slapd', uso: usage, elemento: 'olcTLS', algoritmos: algorithms, identificadores: 'x' }, ago(0.45), 'ldapserver');
  const P03L = [...P03, 'protocolo | TLS1.2 |', 'protocolo | TLS1.3 |', 'intercambio | ECDH |', 'hash_contrasenas | SSHA-512 |'];
  const values = { ...BASE, 'P-03': P03L, 'P-04': ['slapd | ldapserver | 636'], 'P-05': ['ldapserver | explotacion | DMZ'] };

  let r = evaluate(events(heartbeat(ALL_OF_THEM, 'ldapserver'), slapd('protocolo', 'TLS1.0,TLS1.1,TLS1.2,TLS1.3'), slapd('hash_contrasenas', 'SSHA-512')), values);
  check('olcTLSProtocolMin 3.1 (accepts TLS1.0) → EV-03 NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE', r.deEvidencia('EV-03')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM, 'ldapserver'), slapd('protocolo', 'TLS1.2,TLS1.3'), slapd('intercambio', 'ECDH'), slapd('hash_contrasenas', 'SSHA-512')), values);
  check('with minimum TLS1.2, ECDH and SSHA-512 authorized → CUMPLE', r.deEvidencia('EV-03')?.status === 'CUMPLE', r.deEvidencia('EV-03')?.reason);
  r = evaluate(events(heartbeat(ALL_OF_THEM, 'ldapserver'), slapd('protocolo', 'SIN_TLS')), values);
  check('slapd on the network without TLS → NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE');
  r = evaluate(events(heartbeat(ALL_OF_THEM, 'ldapserver'), slapd('hash_contrasenas', 'SSHA')), values);
  check('password hash {SSHA} without a row → NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE');
}

section('12. What cannot be measured says WHY: the cause reaches the evidence');

{
  const tabla = (r: ReturnType<typeof evaluate>) =>
    applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp10CatalogDefinition.requirements);

  let r = evaluate(events(heartbeat(ALL_OF_THEM)), { ...BASE, 'P-08': [] });
  let ev = tabla(r).find(e => e.id === 'EV-01');
  check('without P-08 → EV-01 unmeasured with cause CONFIGURATION, not COLLECTION', ev?.status === 'NO_EVALUABLE' && ev?.gapCause === 'CONFIGURATION', `${ev?.status} ${ev?.gapCause}`);
  r = evaluate(events(heartbeat(ALL_OF_THEM)), { ...BASE, 'P-05': ['otra-maquina | explotacion | DMZ'] });
  ev = tabla(r).find(e => e.id === 'EV-05');
  check('the machine without a row in P-05 → EV-05 with cause CONFIGURATION', ev?.status === 'NO_EVALUABLE' && ev?.gapCause === 'CONFIGURATION', `${ev?.status} ${ev?.gapCause}`);
  check('and the requirement decision op.exp.10.2 carries it', r.principal('op.exp.10.2')?.cause === 'CONFIGURATION', r.principal('op.exp.10.2')?.cause);

  r = evaluate(events(
    heartbeat('EV-02,EV-03'),
    alert({ event: 'evidence_state', evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'las reglas de auditd de op.exp.10 no estan cargadas en el kernel' }, ago(0.5)),
    alert({ event: 'key_material_accessed', evidence_id: 'EV-01', actor: 'root', sesion: 'con_sesion', recurso: '/etc/ssh/ssh_host_rsa_key', acceso: 'lectura', operacion: 'openat', proceso: '/usr/bin/cp', veces: 1, ultima: ago(2) }, ago(0.45))
  ));
  ev = tabla(r).find(e => e.id === 'EV-01');
  check('the cause the collector declares (CONFIGURATION) reaches EV-01 intact', ev?.status === 'NO_EVALUABLE' && ev?.gapCause === 'CONFIGURATION', `${ev?.status} ${ev?.gapCause}`);
  check('and the motive is its own', /reglas de auditd/.test(r.deEvidencia('EV-01')?.reason || ''), r.deEvidencia('EV-01')?.reason);

  r = evaluate([]);
  check('without any event → EV-05 unmeasured with cause COLLECTION in its decision', r.deEvidencia('EV-05')?.status === 'NO_EVALUABLE' && r.deEvidencia('EV-05')?.cause === 'COLLECTION', `${r.deEvidencia('EV-05')?.status} ${r.deEvidencia('EV-05')?.cause}`);
  check('and op.exp.10.2 too', r.principal('op.exp.10.2')?.cause === 'COLLECTION', r.principal('op.exp.10.2')?.cause);
  r = evaluate(events(heartbeat('EV-02')));
  check('heartbeat without EV-05 and nothing declared → COLLECTION', r.deEvidencia('EV-05')?.cause === 'COLLECTION', r.deEvidencia('EV-05')?.cause);
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
