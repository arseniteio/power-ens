/**
 * op.acc.6: el refuerzo elegido, las zonas y los factores, el límite de
 * intentos y la calidad de contraseña.
 *
 *     tsx tests/op-acc-6-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * POR QUÉ EXISTE ESTE FICHERO. op.acc.6 es el segundo control con evaluador de
 * policy propio, y lo que decide no cabe en ninguna primitiva: qué refuerzo de
 * los cuatro rige (P-01), si un acceso viene de zona controlada (rangos CIDR de
 * P-02) y cuántos factores verificó, y tres condiciones a la vez sobre el
 * límite de intentos. Aquí se prueba el JUICIO con los hechos que el agente
 * emitió de verdad en wazuh-real el 16/09/2026, y cada afirmación lleva al lado
 * la REVERSIÓN que demuestra que no pasaría siempre: el mismo evento, otro
 * parámetro.
 */
import { opAcc6CatalogDefinition } from '../public/ens/catalog/op-acc-6';
import { opAcc6Configuration } from '../public/ens/configuration/data/op-acc-6-parameters';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../public/ens/configuration/types';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';
import { normalizeWazuhAlerts } from '../public/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../public/ens/core/policy-runtime/policy-runtime';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';

declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle: string = ''
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);
    return;
  }
  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures ----------------------------------------------------------------

const AHORA = new Date('2026-09-16T16:30:00Z');

// Hechos REALES de wazuh-real (salida de ens_opacc6_collect.sh --salida), con
// el `ts` tal cual. Solo se omiten campos que el juicio no lee.
const REALES = [
  { event: 'authentication_success', evidence_id: 'EV-01,EV-02,EV-07', plano: 'sistema', usuario: 'dioni', origen: '84.120.100.80', canal: 'ssh', servicio: 'sshd', metodos: 'publickey', factores: 1, tipo_clave: 'ED25519', ocurrencias: 42 },
  { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'pam:sshd', en_uso: 'no', mecanismo: 'ninguno', bloqueo: 'no', desbloqueo_automatico: 'no' },
  { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'pam:login', en_uso: 'si', mecanismo: 'ninguno', bloqueo: 'no', desbloqueo_automatico: 'no' },
  { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'sshd:publickey', en_uso: 'si', mecanismo: 'clave_publica', bloqueo: 'no_aplica', desbloqueo_automatico: 'no' },
  { event: 'password_policy_checked', evidence_id: 'EV-11', plano: 'sistema', mecanismo: 'pam_unix', longitud_minima: 6, clases_de_caracteres: 0, historial: 0, lista_de_bloqueo: 0 },
  { event: 'remote_channel_listening', evidence_id: 'EV-02,EV-08', plano: 'sistema', canal: 'ssh', tipo: 'autenticacion', cifrado: 'si', direcciones: '2a01:4f9:c015:2f44::1,62.238.61.123,fe80::9000:9ff:fe53:9e9c', puertos: 'tcp/22121', habilitado_permanente: 'si', factores_minimos: '1', contrasena_admitida: 'no', match_condicional: 'no' },
  { event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-01,EV-09,EV-12,EV-04,EV-07,EV-02', perfil: 'linux', emisor: 'recolector' },
];

let secuencia = 0;

const hechos = (
  datos: Record<string, unknown>[],
  ts = '2026-09-16T16:18:35Z'
): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    datos.map(data => ({
      _id: `h-${(secuencia += 1)}`,
      _source: {
        '@timestamp': ts,
        agent: { id: '001', name: 'wazuh-real' },
        rule: { id: '110100', description: 'op.acc.6' },
        data: { ensfacil: 'op.acc.6', host: 'wazuh-real', ...data },
      },
    }))
  );

const configuracion = (
  valores: Record<string, unknown>
): ENSControlConfiguration => ({
  ...opAcc6Configuration,
  parameters: opAcc6Configuration.parameters.map(parameter =>
    Object.prototype.hasOwnProperty.call(valores, parameter.id)
      ? { ...parameter, value: valores[parameter.id] as never }
      : parameter
  ),
});

// Configuración mínima completa, con valores que NO deciden los casos: cada
// bloque cambia uno.
const BASE: Record<string, unknown> = {
  'P-01': 'R2',
  'P-02': ['192.168.10.0/24'],
  'P-03': ['local'],
  'P-04': 180,
  'P-05': 5,
  'P-06': 24,
  'P-07': ['ssh | si | Responsable de Seguridad | si'],
  'P-08': ['sudo'],
  'P-09': 45,
  'P-10': ['longitud_minima | 12'],
  'P-11': ['sshd:version_software'],
  'P-ATT': [],
};

const evalua = (
  valores: Record<string, unknown>,
  eventos: ENSNormalizedEvent[],
  nivel: ENSLevel = 'BAJO'
) => {
  const config = configuracion({ ...BASE, ...valores });
  const control = { ...opAcc6CatalogDefinition, status: 'ACTIVE' as const };
  const evidencias = resolveEvidenceForControl(
    'op.acc.6',
    eventos,
    undefined,
    nivel,
    config,
    AHORA
  );
  const contexto = buildPolicyContext(control, config, nivel, eventos, evidencias, AHORA);
  const policy = runPolicyRuntime(contexto);
  const resultado = evaluateENSControl(control, config, nivel, evidencias, policy, eventos);
  const requisito = (id: string) =>
    resultado.requirements.find(requirement => requirement.id === id);
  const decision = (id: string) =>
    policy.decisions.find(item => item.requirementId === id);
  const evidencia = (id: string) =>
    resultado.evidences.find(item => item.id === id);
  return { resultado, requisito, decision, evidencia };
};

// --- 1. el refuerzo elegido y el denominador ----------------------------------

bloque('1. Solo cuenta el refuerzo de mecanismo que P-01 declara');

{
  const MECANISMO = [
    'op.acc.6.r1.1', 'op.acc.6.r1.2', 'op.acc.6.r2.1',
    'op.acc.6.r3.1', 'op.acc.6.r3.2', 'op.acc.6.r4.1', 'op.acc.6.r4.2',
  ];
  const eventos = hechos(REALES);

  const esperados: Record<string, string[]> = {
    R1: ['op.acc.6.r1.1', 'op.acc.6.r1.2'],
    R2: ['op.acc.6.r1.2', 'op.acc.6.r2.1'],
    R3: ['op.acc.6.r3.1', 'op.acc.6.r3.2'],
    R4: ['op.acc.6.r4.1', 'op.acc.6.r4.2'],
  };

  Object.entries(esperados).forEach(([refuerzo, rigen]) => {
    const { requisito, resultado } = evalua({ 'P-01': refuerzo }, eventos);
    const aplican = MECANISMO.filter(id => requisito(id)?.status !== 'NO_APLICA');
    comprueba(
      `P-01=${refuerzo} · rigen exactamente ${rigen.join(', ')}`,
      aplican.join(',') === rigen.join(','),
      aplican.join(',')
    );
    // BAJO: 9 base + 2 del mecanismo + R8 + R9 (dos) = 14.
    comprueba(
      `P-01=${refuerzo} · en BAJO el denominador es 14`,
      resultado.applicableRequirements === 14,
      String(resultado.applicableRequirements)
    );
  });

  // LA REVERSIÓN: sin P-01 no se sabe cuál rige y no se da ninguno por no
  // aplicable. Los siete cuentan, sin demostrar.
  const { requisito, resultado } = evalua({ 'P-01': undefined }, eventos);
  comprueba(
    'sin P-01 · los siete requisitos de mecanismo cuentan (ninguno NO_APLICA)',
    MECANISMO.every(id => requisito(id)?.status === 'NO_CUMPLE'),
    MECANISMO.map(id => `${id}=${requisito(id)?.status}`).join(' ')
  );
  comprueba(
    'sin P-01 · y no se fingen medidos',
    MECANISMO.every(id => requisito(id)?.evidenced === false)
  );
  comprueba(
    'sin P-01 · denominador 19 en BAJO',
    resultado.applicableRequirements === 19,
    String(resultado.applicableRequirements)
  );

  // R8 y R9 rigen desde BAJO: es la diferencia que la plantilla subraya.
  ['op.acc.6.r8.1', 'op.acc.6.r9.1', 'op.acc.6.r9.2'].forEach(id => {
    comprueba(
      `${id} rige en BAJO`,
      opAcc6CatalogDefinition.requirements
        .find(requirement => requirement.id === id)
        ?.applicability.levels.includes('BAJO') === true
    );
  });
}

// --- 2. zonas y factores --------------------------------------------------------

bloque('2. R8: el origen se clasifica contra P-02 y fuera exige dos factores');

{
  const eventos = hechos(REALES);

  // wazuh-real se administra desde Internet con una clave: un factor.
  const fuera = evalua({ 'P-02': ['192.168.10.0/24'] }, eventos);
  comprueba(
    'acceso con clave desde 84.120.100.80 fuera de P-02 · r8.1 NO_CUMPLE medido',
    fuera.requisito('op.acc.6.r8.1')?.status === 'NO_CUMPLE' &&
      fuera.requisito('op.acc.6.r8.1')?.evidenced === true,
    `${fuera.requisito('op.acc.6.r8.1')?.status} evidenced=${fuera.requisito('op.acc.6.r8.1')?.evidenced}`
  );
  comprueba(
    'el motivo nombra al usuario, el origen y el canal expuesto',
    /dioni/.test(fuera.decision('op.acc.6.r8.1')?.reason || '') &&
      /84\.120\.100\.80/.test(fuera.decision('op.acc.6.r8.1')?.reason || '') &&
      /62\.238\.61\.123/.test(fuera.decision('op.acc.6.r8.1')?.reason || ''),
    fuera.decision('op.acc.6.r8.1')?.reason
  );

  // LA REVERSIÓN: los MISMOS hechos, con el origen y las direcciones del
  // servidor declaradas zona controlada (IPv4 e IPv6).
  const dentro = evalua(
    {
      'P-02': [
        '84.120.100.80/32 oficina',
        '62.238.61.123',
        '2a01:4f9:c015:2f44::/64',
        'fe80::/10',
      ],
    },
    eventos
  );
  comprueba(
    'mismos hechos con origen y direcciones en P-02 · r8.1 CUMPLE',
    dentro.requisito('op.acc.6.r8.1')?.status === 'CUMPLE',
    dentro.decision('op.acc.6.r8.1')?.reason
  );

  // Basta con que UNA dirección del canal quede fuera.
  const casi = evalua(
    { 'P-02': ['84.120.100.80/32', '62.238.61.123/32', '2a01:4f9:c015:2f44::/64'] },
    eventos
  );
  comprueba(
    'una sola dirección del canal fuera (fe80::) · r8.1 NO_CUMPLE',
    casi.requisito('op.acc.6.r8.1')?.status === 'NO_CUMPLE',
    casi.decision('op.acc.6.r8.1')?.reason
  );

  // Dos factores verificados desde fuera y un canal que exige dos: cumple.
  const dosFactores = hechos([
    { ...REALES[0], metodos: 'publickey+keyboard-interactive/pam', factores: 2 },
    { ...REALES[5], factores_minimos: '2' },
  ]);
  const doble = evalua({ 'P-02': ['192.168.10.0/24'] }, dosFactores);
  comprueba(
    'dos factores desde fuera y canal que exige dos · r8.1 CUMPLE',
    doble.requisito('op.acc.6.r8.1')?.status === 'CUMPLE',
    doble.decision('op.acc.6.r8.1')?.reason
  );

  // La consola solo es zona controlada si alguien lo declara.
  const consola = hechos([
    { event: 'authentication_success', evidence_id: 'EV-01,EV-02', usuario: 'root', origen: 'local', canal: 'consola', metodos: 'password', factores: 1 },
    { ...REALES[5], direcciones: '192.168.10.10', factores_minimos: '1' },
  ]);
  comprueba(
    'consola con una contraseña y sin «local» en P-02 · NO_CUMPLE',
    evalua({ 'P-02': ['192.168.10.0/24'] }, consola).requisito('op.acc.6.r8.1')?.status === 'NO_CUMPLE'
  );
  comprueba(
    'la reversión: con «local» declarado · CUMPLE',
    evalua({ 'P-02': ['192.168.10.0/24', 'local'] }, consola).requisito('op.acc.6.r8.1')?.status === 'CUMPLE'
  );

  // Sin hechos: sin latido no se afirma nada; con latido que cubre EV-02, sí.
  const vacio = evalua({ 'P-02': ['192.168.10.0/24'] }, []);
  comprueba(
    'sin hechos ni latido · r8.1 sin demostrar',
    vacio.requisito('op.acc.6.r8.1')?.status === 'NO_CUMPLE' &&
      vacio.requisito('op.acc.6.r8.1')?.evidenced === false
  );
  const soloLatido = evalua({ 'P-02': ['192.168.10.0/24'] }, hechos([REALES[6]], '2026-09-16T16:00:00Z'));
  comprueba(
    'sin canales ni accesos y con latido que cubre EV-02 · CUMPLE',
    soloLatido.requisito('op.acc.6.r8.1')?.status === 'CUMPLE',
    soloLatido.decision('op.acc.6.r8.1')?.reason
  );

  // P-02 mal escrito no se adivina.
  const ilegible = evalua({ 'P-02': ['sede central'] }, eventos);
  comprueba(
    'P-02 con un elemento que no es red · sin demostrar, nunca CUMPLE',
    ilegible.requisito('op.acc.6.r8.1')?.evidenced === false
  );

  // EV-02 enseña el veredicto de R8, no el NO_APLICA de R1.
  comprueba(
    'con P-01=R3, EV-02 muestra el CUMPLE de r8.1 y no el NO_APLICA de r1.1',
    evalua(
      { 'P-01': 'R3', 'P-02': ['84.120.100.80/32', '62.238.61.123', '2a01:4f9:c015:2f44::/64', 'fe80::/10'] },
      eventos
    )
      .evidencia('EV-02')?.status === 'CUMPLE'
  );
}

bloque('3. R1 y R2 sobre los mismos hechos');

{
  const eventos = hechos([
    { event: 'authentication_success', evidence_id: 'EV-01,EV-02,EV-07', usuario: 'ana', origen: '203.0.113.9', canal: 'ssh', metodos: 'password', factores: 1 },
    { ...REALES[5], direcciones: '192.168.10.10', factores_minimos: '1', contrasena_admitida: 'si' },
  ]);

  const r1 = evalua({ 'P-01': 'R1', 'P-02': ['192.168.10.0/24'] }, eventos);
  comprueba(
    'R1 · contraseña sola desde fuera · r1.1 NO_CUMPLE',
    r1.requisito('op.acc.6.r1.1')?.status === 'NO_CUMPLE'
  );

  const r1dentro = evalua({ 'P-01': 'R1', 'P-02': ['192.168.10.0/24', '203.0.113.0/24'] }, eventos);
  comprueba(
    'la reversión: el mismo acceso desde zona controlada · r1.1 CUMPLE',
    r1dentro.requisito('op.acc.6.r1.1')?.status === 'CUMPLE',
    r1dentro.decision('op.acc.6.r1.1')?.reason
  );

  const r2 = evalua({ 'P-01': 'R2', 'P-02': ['192.168.10.0/24', '203.0.113.0/24'] }, eventos);
  comprueba(
    'R2 · un solo factor aunque sea desde zona controlada · r2.1 NO_CUMPLE',
    r2.requisito('op.acc.6.r2.1')?.status === 'NO_CUMPLE'
  );
}

// --- 4. límite de intentos --------------------------------------------------------

bloque('4. op.acc.6.8: hay bloqueo, dentro de P-05 y sin desbloqueo automático');

{
  const reales = evalua({}, hechos(REALES));
  comprueba(
    'wazuh-real: la consola (pam:login) no bloquea · NO_CUMPLE medido',
    reales.requisito('op.acc.6.8')?.status === 'NO_CUMPLE' &&
      reales.requisito('op.acc.6.8')?.evidenced === true &&
      /pam:login/.test(reales.decision('op.acc.6.8')?.reason || ''),
    reales.decision('op.acc.6.8')?.reason
  );
  comprueba(
    'y no acusa a pam:sshd (deshabilitado) ni a la clave pública',
    !/pam:sshd|sshd:publickey/.test(reales.decision('op.acc.6.8')?.reason || ''),
    reales.decision('op.acc.6.8')?.reason
  );

  const faillock = (deny: number, unlock: number) =>
    hechos([
      { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'pam:login', en_uso: 'si', mecanismo: 'pam_faillock', bloqueo: 'si', max_intentos: deny, desbloqueo_automatico: unlock > 0 ? 'si' : 'no', desbloqueo_segundos: unlock },
    ]);

  comprueba(
    'faillock deny=5 unlock_time=0 con P-05=5 · CUMPLE',
    evalua({ 'P-05': 5 }, faillock(5, 0)).requisito('op.acc.6.8')?.status === 'CUMPLE'
  );
  comprueba(
    'la reversión por umbral: el mismo hecho con P-05=3 · NO_CUMPLE',
    evalua({ 'P-05': 3 }, faillock(5, 0)).requisito('op.acc.6.8')?.status === 'NO_CUMPLE'
  );
  comprueba(
    'desbloqueo automático a los 600 s · NO_CUMPLE',
    evalua({ 'P-05': 5 }, faillock(5, 600)).requisito('op.acc.6.8')?.status === 'NO_CUMPLE'
  );

  const fallos8 = [
    ...faillock(5, 0),
    ...hechos([{ event: 'authentication_failure', evidence_id: 'EV-01,EV-04', usuario: 'root', usuario_existe: 'si', origen: '203.0.113.9', canal: 'ssh', fallos: 8 }]),
  ];
  comprueba(
    '8 fallos de una cuenta existente sin bloqueo registrado · NO_CUMPLE',
    evalua({ 'P-05': 5 }, fallos8).requisito('op.acc.6.8')?.status === 'NO_CUMPLE'
  );
  comprueba(
    'la reversión: con el bloqueo registrado · CUMPLE',
    evalua({ 'P-05': 5 }, [
      ...fallos8,
      ...hechos([{ event: 'account_locked', evidence_id: 'EV-03,EV-04', usuario: 'root', mecanismo: 'pam_faillock' }]),
    ]).requisito('op.acc.6.8')?.status === 'CUMPLE'
  );
  comprueba(
    'los fallos contra cuentas inexistentes no se pueden bloquear y no acusan',
    evalua({ 'P-05': 5 }, [
      ...faillock(5, 0),
      ...hechos([{ event: 'authentication_failure', evidence_id: 'EV-01,EV-04', usuario: 'admin', usuario_existe: 'no', origen: '203.0.113.9', canal: 'ssh', fallos: 50 }]),
    ]).requisito('op.acc.6.8')?.status === 'CUMPLE'
  );
}

// --- 4 bis. un plano que no se pudo mirar no deja salir el verde ---------------------

bloque('4 bis. El plano directorio sin medir impide el CUMPLE del sistema');

{
  const faillockOk = hechos([
    { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'sistema', ruta: 'pam:login', en_uso: 'si', mecanismo: 'pam_faillock', bloqueo: 'si', max_intentos: 5, desbloqueo_automatico: 'no', desbloqueo_segundos: 0 },
  ]);
  const directorioIlegible = hechos([
    { event: 'lockout_policy_checked', evidence_id: 'EV-03', plano: 'directorio', ruta: 'slapd:bind', en_uso: 'si', mecanismo: 'ppolicy', bloqueo: 'desconocido' },
  ]);

  const soloSistema = evalua({ 'P-05': 5 }, faillockOk);
  const conDirectorio = evalua({ 'P-05': 5 }, [...faillockOk, ...directorioIlegible]);
  comprueba(
    'la reversión: solo el sistema, bien configurado · 6.8 CUMPLE',
    soloSistema.requisito('op.acc.6.8')?.status === 'CUMPLE'
  );
  comprueba(
    'con la política del directorio ilegible · 6.8 sin demostrar, no medido NO_CUMPLE',
    conDirectorio.requisito('op.acc.6.8')?.status === 'NO_CUMPLE' &&
      conDirectorio.requisito('op.acc.6.8')?.evidenced === false,
    conDirectorio.decision('op.acc.6.8')?.reason
  );

  const edadSistema = hechos([
    { event: 'credential_age_checked', evidence_id: 'EV-05', plano: 'sistema', usuario: 'user', credencial: 'contrasena', medida: 'antiguedad', dias: 30 },
    { event: 'credential_age_checked', evidence_id: 'EV-05', plano: 'sistema', usuario: 'user', credencial: 'contrasena', medida: 'caducidad_configurada', dias: 180 },
  ]);
  const edadDirectorio = hechos([
    { event: 'credential_age_checked', evidence_id: 'EV-05', plano: 'directorio', usuario: 'directorio', observacion: 'no_disponible', motivo: 'la ACL no deja ver zimbraPasswordModifiedTime' },
  ]);
  comprueba(
    'la reversión: EV-05 solo con el sistema dentro de P-04 · CUMPLE',
    evalua({ 'P-04': 180 }, edadSistema).evidencia('EV-05')?.status === 'CUMPLE'
  );
  comprueba(
    'con el directorio no observado · EV-05 NO_EVALUABLE, nunca CUMPLE',
    evalua({ 'P-04': 180 }, [...edadSistema, ...edadDirectorio]).evidencia('EV-05')?.status === 'NO_EVALUABLE'
  );
  comprueba(
    'pero un incumplimiento medido del sistema sigue mandando',
    evalua({ 'P-04': 90 }, [...edadSistema, ...edadDirectorio]).evidencia('EV-05')?.status === 'NO_CUMPLE'
  );
}

// --- 5. calidad de contraseña -------------------------------------------------------

bloque('5. op.acc.6.r1.2: cada mínimo de P-10, solo con R1 o R2');

{
  const eventos = hechos(REALES);

  comprueba(
    'wazuh-real (pam_unix, longitud 6) con P-10 longitud_minima 12 · NO_CUMPLE',
    evalua({ 'P-01': 'R2', 'P-10': ['longitud_minima | 12'] }, eventos).requisito('op.acc.6.r1.2')?.status === 'NO_CUMPLE'
  );
  comprueba(
    'la reversión: P-10 longitud_minima 6 · CUMPLE',
    evalua({ 'P-01': 'R2', 'P-10': ['longitud_minima | 6'] }, eventos).requisito('op.acc.6.r1.2')?.status === 'CUMPLE'
  );
  comprueba(
    'un segundo criterio que no alcanza (historial 5) · NO_CUMPLE',
    evalua({ 'P-01': 'R1', 'P-10': ['longitud_minima | 6', 'historial | 5'] }, eventos).requisito('op.acc.6.r1.2')?.status === 'NO_CUMPLE'
  );
  comprueba(
    'con R3 no rige · NO_APLICA, y EV-11 tampoco se enseña como hueco',
    (() => {
      const r3 = evalua({ 'P-01': 'R3' }, eventos);
      return (
        r3.requisito('op.acc.6.r1.2')?.status === 'NO_APLICA' &&
        r3.evidencia('EV-11')?.status === 'NO_APLICA'
      );
    })()
  );
  comprueba(
    'R2 sin P-10 · sin demostrar',
    evalua({ 'P-01': 'R2', 'P-10': undefined }, eventos).requisito('op.acc.6.r1.2')?.evidenced === false
  );
}

// --- 6. las primitivas de R9 sobre hechos reales ---------------------------------------

bloque('6. R9: canal autorizado, cifrado y uso constante contra P-07');

{
  const eventos = hechos(REALES);
  const ok = evalua({ 'P-07': ['ssh | si | Responsable de Seguridad | si'] }, eventos);
  comprueba(
    'ssh cifrado y de uso constante declarado · EV-07 y EV-08 CUMPLE',
    ok.evidencia('EV-07')?.status === 'CUMPLE' && ok.evidencia('EV-08')?.status === 'CUMPLE',
    `EV-07=${ok.evidencia('EV-07')?.status} EV-08=${ok.evidencia('EV-08')?.status}`
  );
  const noConstante = evalua({ 'P-07': ['ssh | si | Responsable de Seguridad | no'] }, eventos);
  comprueba(
    'la reversión: declarado de uso NO constante y arranca siempre · EV-08 NO_CUMPLE',
    noConstante.evidencia('EV-08')?.status === 'NO_CUMPLE'
  );
  const otroCanal = evalua({ 'P-07': ['vpn | si | Responsable de Seguridad | si'] }, eventos);
  comprueba(
    'acceso por ssh con solo vpn autorizada · EV-07 NO_CUMPLE',
    otroCanal.evidencia('EV-07')?.status === 'NO_CUMPLE'
  );
}

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(fallo => console.log(`  - ${fallo}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
