/**
 * op.exp.10 · el juicio de la protección de claves criptográficas.
 *
 *     npx tsx tests/op-exp-10-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. EV-02 y EV-08 los juzga su primitiva; el resto, la policy de
 * op.exp.10, que añade lo que ninguna primitiva expresa: la cobertura de los
 * almacenes aunque haya hechos (EV-01), cada algoritmo contra SU fila de uso y
 * su longitud mínima (EV-03, EV-04, EV-07), la función de la máquina en P-05
 * (EV-05), P-01 filtrado por estado (EV-06) y la caducidad contra el reloj
 * (EV-07). Cada caso mueve UN eje y lleva al lado la REVERSIÓN que demuestra que
 * no pasaría siempre: el MISMO evento del agente con otro parámetro, u otro
 * `now`, cambia el veredicto.
 *
 * Los eventos se construyen como alertas de `alerts.json` y pasan por el
 * normalizador real: los números llegan como texto y `evidence_id` con comas se
 * parte en uno por evidencia, igual que en producción. Los hechos son los que
 * emitió el recolector en wazuh-real el 26/09/2026.
 */
import { opExp10PolicyDefinition } from '../dashboard/ens/core/policy-runtime/policies/op-exp-10.policy';
import { buildPolicyContext } from '../dashboard/ens/core/policy-runtime/policy-context-builder';
import { opExp10CatalogDefinition } from '../dashboard/ens/catalog/op-exp-10';
import { opExp10Configuration } from '../dashboard/ens/configuration/data/op-exp-10-parameters';
import { normalizeWazuhAlerts } from '../dashboard/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
import { applyPolicyDecisionsToEvidences } from '../dashboard/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../dashboard/ens/core/evaluation/requirement/requirement-evaluator';
import { compareENSIds } from '../dashboard/ens/control-filter/prefix';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../dashboard/ens/configuration/types';
import type { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';

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

const AHORA = new Date('2026-09-26T19:30:00Z');
const hace = (horas: number): string =>
  new Date(AHORA.getTime() - horas * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let contador = 0;

const alerta = (data: Record<string, unknown>, ts = hace(0.5), agente = 'wazuh-real', control = 'op.exp.10') => {
  contador += 1;

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts,
      agent: { id: agente === 'wazuh-real' ? '024' : '031', name: agente },
      rule: { id: '111100', description: 'op.exp.10' },
      location: '/var/log/ensfacil/op_exp_10.json',
      data: Object.fromEntries(
        Object.entries({ ensfacil: control, ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

const latido = (cubiertas: string, agente = 'wazuh-real', ts = hace(0.4)) =>
  alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: cubiertas }, ts, agente);

const TODAS = 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08';

const clave = (ruta: string, extra: Record<string, unknown> = {}, agente = 'wazuh-real') =>
  alerta({
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
  }, hace(0.45), agente);

const config = (uso: string, elemento: string, algoritmos: string, servicio = 'sshd') =>
  alerta({
    event: 'crypto_config_observed',
    evidence_id: 'EV-03',
    servicio,
    uso,
    elemento,
    algoritmos,
    identificadores: 'x',
  }, hace(0.45));

const certificado = (caduca: string, extra: Record<string, unknown> = {}) =>
  alerta({
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
  }, hace(0.45));

const eventos = (...alertas: ReturnType<typeof alerta>[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alertas);

const configuracion = (valores: Record<string, string[] | string>): ENSControlConfiguration => ({
  ...opExp10Configuration,
  parameters: opExp10Configuration.parameters.map(p => ({
    ...p,
    value: valores[p.id],
  })),
});

// Política de referencia: la que se propone en el informe para wazuh-real.
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

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Record<string, string[] | string> = BASE,
  ahora: Date = AHORA,
  nivel: ENSLevel = 'MEDIO'
) => {
  const cfg = configuracion(valores);
  const evidencias = resolveEvidenceForControl('op.exp.10', evs, undefined, nivel, cfg, ahora);
  const contexto = buildPolicyContext(opExp10CatalogDefinition, cfg, nivel, evs, evidencias, ahora);
  const { decisions } = opExp10PolicyDefinition.evaluator!(contexto);
  const principal = (requisito: string) => decisions.find(d => d.requirementId === requisito);
  const deEvidencia = (id: string, requisito?: string) =>
    decisions.find(d => d.trace.ruleId.endsWith(`/${id}`) && (!requisito || d.requirementId === requisito));
  const evidencia = (id: string) => evidencias.find(e => e.id === id);

  return { evidencias, decisions, principal, deEvidencia, evidencia, cfg, nivel };
};

// --- 1. catálogo -----------------------------------------------------------

bloque('1. Catálogo: ACTIVE, base en los tres niveles, R1 en MEDIO y ALTO, R2 en ninguno');

{
  const nivelesDe = (id: string) =>
    opExp10CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  comprueba('el control está ACTIVE', opExp10CatalogDefinition.status === 'ACTIVE');
  comprueba('op.exp.10.1 a .3 en BAJO, MEDIO y ALTO', ['op.exp.10.1', 'op.exp.10.2', 'op.exp.10.3'].every(id => nivelesDe(id) === 'BAJO,MEDIO,ALTO'));
  comprueba('R1 en MEDIO y ALTO: MEDIA y ALTA exigen lo mismo', nivelesDe('op.exp.10.r1.1') === 'MEDIO,ALTO');
  comprueba('R2 no se exige en ninguna categoría', nivelesDe('op.exp.10.r2.1') === '');

  const p01 = opExp10Configuration.parameters.find(p => p.id === 'P-01')!;
  comprueba('P-01 lleva la columna `estado` (activa | retirada)', (p01.columns || []).some(c => c.name === 'estado' && (c.options || []).includes('retirada')));
  const p06 = opExp10Configuration.parameters.find(p => p.id === 'P-06')!;
  comprueba('P-06 es una tabla con columnas, no un formato propio', p06.type === 'table' && (p06.columns || []).length === 3);
  const p10 = opExp10Configuration.parameters.find(p => p.id === 'P-10')!;
  comprueba('P-10 (antelación de caducidad) es opcional y en días', p10.type === 'duration_days' && p10.required === false);
  comprueba('ningún parámetro es obligatorio y solo de R1', opExp10Configuration.parameters.filter(p => p.required && p.levels.join() === 'MEDIO,ALTO').length === 0);
}

// --- 2. id de dos dígitos -----------------------------------------------------

bloque('2. op.exp.10 no se confunde con op.exp.1');

{
  const ids = ['op.exp.2', 'op.exp.10', 'op.exp.1', 'op.exp.9'].sort(compareENSIds);
  comprueba('el orden natural pone op.exp.10 detrás de op.exp.9', ids.join(',') === 'op.exp.1,op.exp.2,op.exp.9,op.exp.10', ids.join(','));

  // Un hecho de op.exp.1 con el mismo nombre de evento no entra en op.exp.10.
  const ajeno = eventos(
    latido(TODAS),
    alerta({ event: 'key_material_accessed', evidence_id: 'EV-01', actor: 'intruso', recurso: '/etc/ssh/ssh_host_rsa_key', acceso: 'lectura', proceso: '/usr/bin/cp' }, hace(1), 'wazuh-real', 'op.exp.1')
  );
  const r = evalua(ajeno);
  comprueba('un acceso emitido como op.exp.1 no cuenta en EV-01 de op.exp.10', r.deEvidencia('EV-01')?.status === 'CUMPLE', r.deEvidencia('EV-01')?.reason);
}

// --- 3. EV-02 y EV-08: las primitivas ----------------------------------------

bloque('3. EV-02 (clave fuera de almacén) y EV-08 (protección), con sus reversiones');

{
  const evs = eventos(
    latido(TODAS),
    clave('/etc/ssh/ssh_host_ed25519_key'),
    clave('/home/dioni/.ssh/id_ed25519', { propietario: 'dioni', grupo: 'dioni' }),
    clave('/var/ossec/etc/client.keys', { formato: 'wazuh-client-keys', algoritmo: 'clave-compartida', huella: '', modo: '640', propietario: 'wazuh' })
  );
  let r = evalua(evs);
  comprueba('una clave en /home/dioni/.ssh sin almacén declarado → EV-02 NO_CUMPLE', r.evidencia('EV-02')?.status === 'NO_CUMPLE', r.evidencia('EV-02')?.observations.join(' '));
  comprueba('y EV-08 no la puede juzgar: su directorio no tiene fila', r.evidencia('EV-08')?.status === 'NO_EVALUABLE' && r.evidencia('EV-08')?.gapCause === 'CONFIGURATION', r.evidencia('EV-08')?.status);

  r = evalua(evs, { ...BASE, 'P-02': [...P02, '/home/dioni/.ssh | 600 | dioni'] });
  comprueba('MISMO evento con el almacén declarado → EV-02 CUMPLE', r.evidencia('EV-02')?.status === 'CUMPLE', r.evidencia('EV-02')?.observations.join(' '));
  comprueba('y EV-08 CUMPLE: 600 y 640 no conceden más que lo declarado', r.evidencia('EV-08')?.status === 'CUMPLE', r.evidencia('EV-08')?.observations.join(' '));

  const laxa = eventos(latido(TODAS), clave('/etc/ssh/ssh_host_rsa_key', { modo: '644' }));
  r = evalua(laxa);
  comprueba('una clave de host en 644 donde se admite 600 → EV-08 NO_CUMPLE', r.evidencia('EV-08')?.status === 'NO_CUMPLE', r.evidencia('EV-08')?.observations.join(' '));
  r = evalua(eventos(latido(TODAS), clave('/etc/ssh/ssh_host_rsa_key', { modo: '400' })));
  comprueba('la misma en 400 → EV-08 CUMPLE: más restrictivo no es desviación', r.evidencia('EV-08')?.status === 'CUMPLE');
  r = evalua(eventos(latido(TODAS), clave('/etc/ssh/ssh_host_rsa_key', { propietario: 'dioni' })));
  comprueba('la misma con otro propietario → EV-08 NO_CUMPLE', r.evidencia('EV-08')?.status === 'NO_CUMPLE');

  r = evalua(eventos(latido(TODAS)));
  comprueba('barrido completo sin ninguna clave → EV-02 CUMPLE por ausencia con latido', r.evidencia('EV-02')?.status === 'CUMPLE');
  r = evalua(eventos(latido('EV-03')));
  comprueba('sin latido que cubra EV-02 → NO_EVALUABLE, nunca CUMPLE', r.evidencia('EV-02')?.status === 'NO_EVALUABLE');
}

// --- 4. EV-01: accesos y cobertura -------------------------------------------

bloque('4. EV-01: el actor contra P-08, y la cobertura aunque haya hechos');

{
  const acceso = (actor: string) =>
    alerta({ event: 'key_material_accessed', evidence_id: 'EV-01', actor, sesion: 'con_sesion', recurso: '/etc/ssh/ssh_host_rsa_key', acceso: 'lectura', operacion: 'openat', proceso: '/usr/bin/cp', veces: 1, ultima: hace(2) }, hace(0.45));

  let r = evalua(eventos(latido(TODAS), acceso('mallory')));
  comprueba('mallory lee una clave de host y no está en P-08 → NO_CUMPLE', r.deEvidencia('EV-01')?.status === 'NO_CUMPLE', r.deEvidencia('EV-01')?.reason);
  comprueba('el motivo nombra la cuenta y la ruta', /mallory/.test(r.deEvidencia('EV-01')?.reason || '') && /ssh_host_rsa_key/.test(r.deEvidencia('EV-01')?.reason || ''));
  r = evalua(eventos(latido(TODAS), acceso('mallory')), { ...BASE, 'P-08': [...(BASE['P-08'] as string[]), 'mallory | clave de host | lectura'] });
  comprueba('MISMO evento con mallory en P-08 → CUMPLE', r.deEvidencia('EV-01')?.status === 'CUMPLE', r.deEvidencia('EV-01')?.reason);

  r = evalua(eventos(latido('EV-02,EV-03'), acceso('root')));
  comprueba('acceso autorizado pero el latido no cubre EV-01 → NO_EVALUABLE (no se vigilaba todo)', r.deEvidencia('EV-01')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-01')?.reason);
  r = evalua(eventos(latido(TODAS)));
  comprueba('ningún acceso con cobertura confirmada → CUMPLE', r.deEvidencia('EV-01')?.status === 'CUMPLE');
  r = evalua(eventos(latido(TODAS, 'wazuh-real', hace(30))));
  comprueba('con el latido de hace 30 h → NO_EVALUABLE', r.deEvidencia('EV-01')?.status === 'NO_EVALUABLE');
  r = evalua(eventos(latido(TODAS)), { ...BASE, 'P-08': [] });
  comprueba('sin P-08 → NO_EVALUABLE', r.deEvidencia('EV-01')?.status === 'NO_EVALUABLE');
}

// --- 5. EV-03: lo que aceptan los servicios -----------------------------------

bloque('5. EV-03: cada algoritmo contra su fila de uso y su longitud mínima');

{
  const sshd = [
    config('cifrado', 'Ciphers', 'AES-CTR:128,AES-GCM:256'),
    config('firma', 'PubkeyAcceptedAlgorithms', 'ED25519:256,ECDSA-P256:256,RSA:1024'),
  ];
  let r = evalua(eventos(latido(TODAS), ...sshd));
  comprueba('RequiredRSASize 1024 contra RSA 3072 → EV-03 NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE', r.deEvidencia('EV-03')?.reason);
  comprueba('el motivo nombra el elemento y el mínimo', /RSA:1024/.test(r.deEvidencia('EV-03')?.reason || '') && /3072/.test(r.deEvidencia('EV-03')?.reason || ''));
  r = evalua(eventos(latido(TODAS), ...sshd), { ...BASE, 'P-03': P03.map(f => (f === 'firma | RSA | 3072' ? 'firma | RSA | 1024' : f)) });
  comprueba('MISMO evento con RSA 1024 admitido en P-03 → CUMPLE', r.deEvidencia('EV-03')?.status === 'CUMPLE', r.deEvidencia('EV-03')?.reason);

  r = evalua(eventos(latido(TODAS), config('cifrado', 'Ciphers', 'CHACHA20-POLY1305:256,AES-GCM:256')));
  comprueba('un cifrado sin fila en P-03 (CHACHA20-POLY1305) → NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE', r.deEvidencia('EV-03')?.reason);
  r = evalua(eventos(latido(TODAS), config('intercambio', 'KexAlgorithms', 'ECDH-P256:256,SNTRUP761-X25519')), { ...BASE, 'P-03': [...P03, 'intercambio | SNTRUP761-X25519 | '] });
  comprueba('un algoritmo sin longitud cumple si su fila no exige longitud', r.deEvidencia('EV-03')?.status === 'CUMPLE', r.deEvidencia('EV-03')?.reason);
  r = evalua(eventos(latido(TODAS), config('intercambio', 'KexAlgorithms', 'DH')));
  comprueba('DH sin longitud contra una fila que exige 3072 → NO_EVALUABLE, no CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-03')?.reason);

  r = evalua(eventos(latido(TODAS), config('cifrado', 'Ciphers', 'AES-GCM:256')), { ...BASE, 'P-04': ['sshd | * | 22', 'slapd | wazuh-real | 636'] });
  comprueba('P-04 declara slapd en esta máquina y no se observa → NO_EVALUABLE', r.deEvidencia('EV-03')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-03')?.reason);
  r = evalua(eventos(latido(TODAS), config('cifrado', 'Ciphers', 'AES-GCM:256')), { ...BASE, 'P-04': [] });
  comprueba('sin P-04 → NO_EVALUABLE: sin alcance no se afirma que se verificó todo', r.deEvidencia('EV-03')?.status === 'NO_EVALUABLE');
  r = evalua(eventos(latido(TODAS), config('cifrado', 'Ciphers', 'AES-GCM:256')), { ...BASE, 'P-03': [] });
  comprueba('sin P-03 → NO_EVALUABLE', r.deEvidencia('EV-03')?.status === 'NO_EVALUABLE');
}

// --- 6. EV-04: lo negociado ----------------------------------------------------

bloque('6. EV-04: lo negociado, y la cobertura parcial con LogLevel INFO');

{
  const negociado = (uso: string, algoritmo: string) =>
    alerta({ event: 'crypto_protocol_negotiated', evidence_id: 'EV-04', servicio: 'sshd', uso, algoritmo, identificador: 'publickey', veces: 39, ultima: hace(1) }, hace(0.45));

  let r = evalua(eventos(latido('EV-02,EV-03'), negociado('firma', 'ED25519:256')));
  comprueba('autorizado pero sin cobertura (LogLevel INFO) → NO_EVALUABLE', r.deEvidencia('EV-04')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-04')?.reason);
  r = evalua(eventos(latido('EV-02,EV-03'), negociado('firma', 'RSA:2048')));
  comprueba('una clave RSA 2048 negociada → NO_CUMPLE aunque la cobertura sea parcial', r.deEvidencia('EV-04')?.status === 'NO_CUMPLE', r.deEvidencia('EV-04')?.reason);
  r = evalua(eventos(latido(TODAS), negociado('firma', 'ED25519:256')));
  comprueba('autorizado y con cobertura completa → CUMPLE', r.deEvidencia('EV-04')?.status === 'CUMPLE');
}

// --- 7. EV-05: generación en explotación -------------------------------------

bloque('7. EV-05: la función de ESTA máquina en P-05');

{
  const genera = alerta({ event: 'key_generation_tool_executed', evidence_id: 'EV-05', herramienta: 'ssh-keygen', operacion: '-t ed25519', actor: 'dioni', veces: 1, ultima: hace(3) }, hace(0.45));

  let r = evalua(eventos(latido(TODAS), genera));
  comprueba('ssh-keygen generando en una máquina de explotación → NO_CUMPLE', r.deEvidencia('EV-05')?.status === 'NO_CUMPLE', r.deEvidencia('EV-05')?.reason);
  r = evalua(eventos(latido(TODAS), genera), { ...BASE, 'P-05': ['wazuh-real | generacion | red aislada'] });
  comprueba('MISMO evento con la máquina declarada de generación → no incumple (NO_EVALUABLE: el aislamiento no se mide)', r.deEvidencia('EV-05')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-05')?.reason);
  r = evalua(eventos(latido(TODAS)));
  comprueba('explotación sin generación y con cobertura → CUMPLE', r.deEvidencia('EV-05')?.status === 'CUMPLE');
  r = evalua(eventos(latido('EV-02')));
  comprueba('sin cobertura de EV-05 (reglas de auditd sin cargar) → NO_EVALUABLE', r.deEvidencia('EV-05')?.status === 'NO_EVALUABLE');
  r = evalua(eventos(latido(TODAS)), { ...BASE, 'P-05': ['otra-maquina | explotacion | DMZ'] });
  comprueba('máquina sin fila en P-05 → NO_EVALUABLE', r.deEvidencia('EV-05')?.status === 'NO_EVALUABLE');
  r = evalua(eventos(latido(TODAS), genera), { ...BASE, 'P-05': ['WAZUH-REAL | Explotación | DMZ'] });
  comprueba('el nombre y la función se comparan sin mayúsculas ni tildes', r.deEvidencia('EV-05')?.status === 'NO_CUMPLE');
}

// --- 8. EV-06: claves retiradas ----------------------------------------------

bloque('8. EV-06: P-01 filtrado por estado, por huella o por ubicación');

{
  const evs = eventos(latido(TODAS), clave('/etc/ssh/ssh_host_rsa_key', { huella: 'SHA256:M71np' }));
  let r = evalua(evs, { ...BASE, 'P-01': ['clave de host RSA vieja | acceso | fichero | /srv/otra | Sistemas | retirada | SHA256:M71np'] });
  comprueba('una clave RETIRADA en P-01 presente por huella → NO_CUMPLE', r.deEvidencia('EV-06')?.status === 'NO_CUMPLE', r.deEvidencia('EV-06')?.reason);
  r = evalua(evs, { ...BASE, 'P-01': ['clave de host RSA | acceso | fichero | /srv/otra | Sistemas | activa | SHA256:M71np'] });
  comprueba('MISMO evento con la clave ACTIVA → CUMPLE', r.deEvidencia('EV-06')?.status === 'CUMPLE', r.deEvidencia('EV-06')?.reason);
  r = evalua(evs, { ...BASE, 'P-01': ['vieja | acceso | fichero | /etc/ssh/ssh_host_rsa_key | Sistemas | retirada |'] });
  comprueba('retirada identificada por ubicación exacta → NO_CUMPLE', r.deEvidencia('EV-06')?.status === 'NO_CUMPLE');
  r = evalua(evs, { ...BASE, 'P-06': ['wazuh-real | disco | ninguno'] });
  comprueba('P-06 archiva en una máquina de explotación → NO_CUMPLE por sí mismo', r.deEvidencia('EV-06')?.status === 'NO_CUMPLE', r.deEvidencia('EV-06')?.reason);
  r = evalua(evs, { ...BASE, 'P-06': [] });
  comprueba('sin P-06 → NO_EVALUABLE', r.deEvidencia('EV-06')?.status === 'NO_EVALUABLE');
  const cifrada = eventos(latido(TODAS), clave('/root/backup.p12', { formato: 'pkcs12', huella: '', algoritmo: 'desconocido' }));
  r = evalua(cifrada, { ...BASE, 'P-01': ['vieja | acceso | fichero |  | Sistemas | retirada | SHA256:zzz'] });
  comprueba('retirada solo por huella y una clave sin huella legible → NO_EVALUABLE, no CUMPLE', r.deEvidencia('EV-06')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-06')?.reason);
}

// --- 9. EV-07: caducidad y algoritmos ------------------------------------------

bloque('9. EV-07: la caducidad contra el reloj y los algoritmos contra P-03');

{
  const evs = eventos(latido(TODAS), certificado('2027-08-17T15:41:28Z'));
  let r = evalua(evs);
  comprueba('certificado vigente → EV-07 CUMPLE para op.exp.10.1', r.deEvidencia('EV-07', 'op.exp.10.1')?.status === 'CUMPLE', r.deEvidencia('EV-07', 'op.exp.10.1')?.reason);
  r = evalua(evs, BASE, new Date('2027-09-01T00:00:00Z'));
  comprueba('MISMO evento un año después → caducado → NO_CUMPLE', r.deEvidencia('EV-07', 'op.exp.10.1')?.status === 'NO_CUMPLE', r.deEvidencia('EV-07', 'op.exp.10.1')?.reason);
  r = evalua(evs, { ...BASE, 'P-10': '400' });
  comprueba('dentro de la antelación de P-10 sigue CUMPLE, y el motivo lo avisa', r.deEvidencia('EV-07', 'op.exp.10.1')?.status === 'CUMPLE' && /PRÓXIMOS A CADUCAR/.test(r.deEvidencia('EV-07', 'op.exp.10.1')?.reason || ''), r.deEvidencia('EV-07', 'op.exp.10.1')?.reason);

  r = evalua(evs);
  comprueba('el certificado RSA 2048 contra RSA 3072 → EV-07 NO_CUMPLE para R1', r.deEvidencia('EV-07', 'op.exp.10.r1.1')?.status === 'NO_CUMPLE', r.deEvidencia('EV-07', 'op.exp.10.r1.1')?.reason);
  r = evalua(eventos(latido(TODAS), certificado('2027-08-17T15:41:28Z', { algoritmo_clave: 'ECDSA-P256:256', hash_firma: 'SHA-1' })));
  comprueba('firma con SHA-1 → NO_CUMPLE para R1', r.deEvidencia('EV-07', 'op.exp.10.r1.1')?.status === 'NO_CUMPLE');
  r = evalua(evs, BASE, AHORA, 'BAJO');
  comprueba('en BAJO no hay decisión de R1: el puente no pinta EV-07 con R1', !r.decisions.some(d => d.requirementId === 'op.exp.10.r1.1'));
}

// --- 10. requisitos y puente --------------------------------------------------

bloque('10. Requisitos y tabla de evidencias');

{
  const sano = eventos(
    latido(TODAS),
    clave('/etc/ssh/ssh_host_ed25519_key'),
    config('cifrado', 'Ciphers', 'AES-GCM:256'),
    certificado('2027-08-17T15:41:28Z', { algoritmo_clave: 'ECDSA-P256:256' })
  );
  let r = evalua(sano);
  const req = (id: string, rr = r) => evaluateRequirement(
    opExp10CatalogDefinition.requirements.find(q => q.id === id)!,
    'MEDIO',
    rr.evidencias,
    false,
    rr.decisions,
    'ACTIVE'
  );
  comprueba('máquina sana con toda la política declarada → op.exp.10.1 CUMPLE', req('op.exp.10.1').status === 'CUMPLE', r.principal('op.exp.10.1')?.reason);
  comprueba('op.exp.10.2 CUMPLE', req('op.exp.10.2').status === 'CUMPLE');
  comprueba('op.exp.10.3 CUMPLE', req('op.exp.10.3').status === 'CUMPLE');
  comprueba('op.exp.10.r1.1 CUMPLE', req('op.exp.10.r1.1').status === 'CUMPLE', r.principal('op.exp.10.r1.1')?.reason);
  comprueba('op.exp.10.r2.1 NO_APLICA', req('op.exp.10.r2.1').status === 'NO_APLICA');

  r = evalua(sano, { ...BASE, 'P-07': '' });
  comprueba('sin P-07 → op.exp.10.1 no evidenciado (NO_CUMPLE por no demostrado)', req('op.exp.10.1', r).status === 'NO_CUMPLE' && req('op.exp.10.1', r).evidenced === false, `${req('op.exp.10.1', r).status} ${req('op.exp.10.1', r).evidenced}`);
  const tabla = applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp10CatalogDefinition.requirements);
  comprueba('y EV-01, que sí está medida, sigue CUMPLE en la tabla: no hereda el gris de P-07', tabla.find(e => e.id === 'EV-01')?.status === 'CUMPLE', tabla.find(e => e.id === 'EV-01')?.status);

  const conRojo = eventos(latido(TODAS), clave('/etc/ssh/ssh_host_ed25519_key', { modo: '644' }), config('cifrado', 'Ciphers', 'AES-GCM:256'), certificado('2027-08-17T15:41:28Z', { algoritmo_clave: 'ECDSA-P256:256' }));
  r = evalua(conRojo);
  comprueba('una clave en 644 tumba op.exp.10.1 medido', req('op.exp.10.1', r).status === 'NO_CUMPLE' && req('op.exp.10.1', r).evidenced === true);
  const tabla2 = applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp10CatalogDefinition.requirements);
  comprueba('EV-07, sana, no hereda el rojo de EV-08', tabla2.find(e => e.id === 'EV-07')?.status === 'CUMPLE', tabla2.find(e => e.id === 'EV-07')?.status);
}

// --- 11. servidor LDAP: el plano directorio --------------------------------

bloque('11. Servidor LDAP: los hechos de slapd se juzgan con la misma política');

{
  const slapd = (uso: string, algoritmos: string) =>
    alerta({ event: 'crypto_config_observed', evidence_id: 'EV-03', plano: 'directorio', servicio: 'slapd', uso, elemento: 'olcTLS', algoritmos, identificadores: 'x' }, hace(0.45), 'ldapserver');
  const P03L = [...P03, 'protocolo | TLS1.2 |', 'protocolo | TLS1.3 |', 'intercambio | ECDH |', 'hash_contrasenas | SSHA-512 |'];
  const valores = { ...BASE, 'P-03': P03L, 'P-04': ['slapd | ldapserver | 636'], 'P-05': ['ldapserver | explotacion | DMZ'] };

  let r = evalua(eventos(latido(TODAS, 'ldapserver'), slapd('protocolo', 'TLS1.0,TLS1.1,TLS1.2,TLS1.3'), slapd('hash_contrasenas', 'SSHA-512')), valores);
  comprueba('olcTLSProtocolMin 3.1 (acepta TLS1.0) → EV-03 NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE', r.deEvidencia('EV-03')?.reason);
  r = evalua(eventos(latido(TODAS, 'ldapserver'), slapd('protocolo', 'TLS1.2,TLS1.3'), slapd('intercambio', 'ECDH'), slapd('hash_contrasenas', 'SSHA-512')), valores);
  comprueba('con mínimo TLS1.2, ECDH y SSHA-512 autorizados → CUMPLE', r.deEvidencia('EV-03')?.status === 'CUMPLE', r.deEvidencia('EV-03')?.reason);
  r = evalua(eventos(latido(TODAS, 'ldapserver'), slapd('protocolo', 'SIN_TLS')), valores);
  comprueba('slapd en la red sin TLS → NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE');
  r = evalua(eventos(latido(TODAS, 'ldapserver'), slapd('hash_contrasenas', 'SSHA')), valores);
  comprueba('hash de contraseñas {SSHA} sin fila → NO_CUMPLE', r.deEvidencia('EV-03')?.status === 'NO_CUMPLE');
}

// --- 12. la causa del hueco ----------------------------------------------------

bloque('12. Lo que no se puede medir dice POR QUÉ: la causa llega a la evidencia');

{
  const tabla = (r: ReturnType<typeof evalua>) =>
    applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp10CatalogDefinition.requirements);

  // (a) Falta el parámetro: se arregla en la pantalla de Configuración, no en
  // el despliegue. El modelo clásico, sin ningún acceso observado, decía
  // «no ha llegado nada» (COLLECTION).
  let r = evalua(eventos(latido(TODAS)), { ...BASE, 'P-08': [] });
  let ev = tabla(r).find(e => e.id === 'EV-01');
  comprueba('sin P-08 → EV-01 sin medir con causa CONFIGURATION, no COLLECTION', ev?.status === 'NO_EVALUABLE' && ev?.gapCause === 'CONFIGURATION', `${ev?.status} ${ev?.gapCause}`);
  r = evalua(eventos(latido(TODAS)), { ...BASE, 'P-05': ['otra-maquina | explotacion | DMZ'] });
  ev = tabla(r).find(e => e.id === 'EV-05');
  comprueba('la máquina sin fila en P-05 → EV-05 con causa CONFIGURATION', ev?.status === 'NO_EVALUABLE' && ev?.gapCause === 'CONFIGURATION', `${ev?.status} ${ev?.gapCause}`);
  comprueba('y la decisión del requisito op.exp.10.2 la lleva', r.principal('op.exp.10.2')?.cause === 'CONFIGURATION', r.principal('op.exp.10.2')?.cause);

  // (b) La pasada no cubrió EV-01 y el recolector dice por qué: las reglas de
  // auditd no están cargadas (CONFIGURATION). El acceso observado, más reciente
  // que la degradación, es lo que el modelo clásico toma, y sin `causa` suya
  // la tarjeta decía EVIDENCE.
  r = evalua(eventos(
    latido('EV-02,EV-03'),
    alerta({ event: 'evidence_state', evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'las reglas de auditd de op.exp.10 no estan cargadas en el kernel' }, hace(0.5)),
    alerta({ event: 'key_material_accessed', evidence_id: 'EV-01', actor: 'root', sesion: 'con_sesion', recurso: '/etc/ssh/ssh_host_rsa_key', acceso: 'lectura', operacion: 'openat', proceso: '/usr/bin/cp', veces: 1, ultima: hace(2) }, hace(0.45))
  ));
  ev = tabla(r).find(e => e.id === 'EV-01');
  comprueba('la causa que declara el recolector (CONFIGURATION) llega intacta a EV-01', ev?.status === 'NO_EVALUABLE' && ev?.gapCause === 'CONFIGURATION', `${ev?.status} ${ev?.gapCause}`);
  comprueba('y el motivo es el suyo', /reglas de auditd/.test(r.deEvidencia('EV-01')?.reason || ''), r.deEvidencia('EV-01')?.reason);

  // (c) No ha llegado nada de op.exp.10: fallo de RECOGIDA, dicho por la policy.
  r = evalua([]);
  comprueba('sin ningún evento → EV-05 sin medir con causa COLLECTION en su decisión', r.deEvidencia('EV-05')?.status === 'NO_EVALUABLE' && r.deEvidencia('EV-05')?.cause === 'COLLECTION', `${r.deEvidencia('EV-05')?.status} ${r.deEvidencia('EV-05')?.cause}`);
  comprueba('y op.exp.10.2 también', r.principal('op.exp.10.2')?.cause === 'COLLECTION', r.principal('op.exp.10.2')?.cause);
  r = evalua(eventos(latido('EV-02')));
  comprueba('latido sin EV-05 y nada declarado → COLLECTION', r.deEvidencia('EV-05')?.cause === 'COLLECTION', r.deEvidencia('EV-05')?.cause);
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
