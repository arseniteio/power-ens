/**
 * op.exp.2 · el motor juzga los hechos REALES de una máquina.
 *
 *     npx tsx tests/op-exp-2-judgment.test.ts
 *
 * Los eventos de abajo son los que emitió el recolector de
 * linux/op.exp.2 en un Ubuntu 24.04 real (solo se ha cambiado la
 * IP de origen del acceso ssh por una de documentación). Se envuelven como las
 * alertas que indexa Wazuh y se pasan por el mismo camino que el panel:
 * normalizador, resolución de evidencias y evaluación del control.
 *
 * La prueba de aceptación es la de todo el modelo nuevo: CAMBIAR UN PARÁMETRO
 * CAMBIA EL VEREDICTO SIN TOCAR EL AGENTE. Cada bloque mueve un solo eje y lleva
 * al lado su reversión.
 */
import { opExp2CatalogDefinition } from '../common/ens/catalog/op-exp-2';
import { opExp2Configuration } from '../common/ens/configuration/data/op-exp-2-parameters';
import type { ENSControlConfiguration } from '../common/ens/configuration/types';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';

// El repo no tiene @types/node y no va a tenerlos.
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

// --- los hechos reales -----------------------------------------------------

const REALES: string[] = [
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"sca_evaluation\",\"evidence_id\":\"EV-01\",\"requisito\":\"op.exp.2.1,op.exp.2.2,op.exp.2.3\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"politicas\":\"cis_ubuntu24-04\",\"ficheros\":\"cis_ubuntu24-04.yml\",\"ultima_evaluacion\":\"2026-09-16T06:14:25Z\",\"evaluaciones\":1,\"sca_habilitado\":\"yes\",\"sca_intervalo\":\"12h\",\"origen_dato\":\"/var/ossec/logs/ossec.log\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"login_account\",\"evidence_id\":\"EV-02\",\"requisito\":\"op.exp.2.1\",\"plano\":\"sistema\",\"usuario\":\"root\",\"uid\":0,\"shell\":\"/bin/bash\",\"contrasena\":\"bloqueada\",\"claves_ssh\":1,\"origen_dato\":\"/etc/passwd\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"login_account\",\"evidence_id\":\"EV-02\",\"requisito\":\"op.exp.2.1\",\"plano\":\"sistema\",\"usuario\":\"dioni\",\"uid\":1000,\"shell\":\"/bin/bash\",\"contrasena\":\"utilizable\",\"claves_ssh\":1,\"origen_dato\":\"/etc/passwd\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"account_authenticated\",\"evidence_id\":\"EV-02\",\"requisito\":\"op.exp.2.1\",\"plano\":\"sistema\",\"usuario\":\"dioni\",\"canal\":\"ssh\",\"origen\":\"203.0.113.10\",\"metodo\":\"publickey\",\"veces\":2}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"service_exposed\",\"evidence_id\":\"EV-03\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"servicio\":\"systemd-resolve\",\"protocolo\":\"udp\",\"puerto\":\"53\",\"puerto_real\":\"53\",\"exposicion\":\"local\",\"direcciones\":\"127.0.0.54,127.0.0.53%lo\",\"origen_dato\":\"ss\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"service_exposed\",\"evidence_id\":\"EV-03\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"servicio\":\"systemd-network\",\"protocolo\":\"udp\",\"puerto\":\"68\",\"puerto_real\":\"68\",\"exposicion\":\"red\",\"direcciones\":\"62.238.61.123%eth0\",\"origen_dato\":\"ss\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"service_exposed\",\"evidence_id\":\"EV-03\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"servicio\":\"systemd-resolve\",\"protocolo\":\"tcp\",\"puerto\":\"53\",\"puerto_real\":\"53\",\"exposicion\":\"local\",\"direcciones\":\"127.0.0.54,127.0.0.53%lo\",\"origen_dato\":\"ss\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"service_exposed\",\"evidence_id\":\"EV-03\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"servicio\":\"sshd\",\"protocolo\":\"tcp\",\"puerto\":\"22121\",\"puerto_real\":\"22121\",\"exposicion\":\"red\",\"direcciones\":\"0.0.0.0,::\",\"origen_dato\":\"ss\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"ssh_permitrootlogin\",\"desviacion\":\"wazuh-real:ssh_permitrootlogin\",\"valor\":\"without-password\",\"esperado\":\"no\",\"origen_dato\":\"sshd -T\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"ssh_x11forwarding\",\"desviacion\":\"wazuh-real:ssh_x11forwarding\",\"valor\":\"yes\",\"esperado\":\"no\",\"origen_dato\":\"sshd -T\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:54Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"ssh_macs_debiles\",\"desviacion\":\"wazuh-real:ssh_macs_debiles\",\"valor\":\"umac-64-etm@openssh.com,hmac-sha1-etm@openssh.com,umac-64@openssh.com,hmac-sha1\",\"esperado\":\"sin MD5, SHA-1 ni umac-64\",\"origen_dato\":\"sshd -T\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"permisos:/etc/ssh/sshd_config\",\"desviacion\":\"wazuh-real:permisos:/etc/ssh/sshd_config\",\"valor\":\"644\",\"esperado\":\"600 o mas restrictivo\",\"origen_dato\":\"stat\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"insecure_default\",\"evidence_id\":\"EV-04\",\"requisito\":\"op.exp.2.3\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"comprobacion\":\"permisos:/etc/crontab\",\"desviacion\":\"wazuh-real:permisos:/etc/crontab\",\"valor\":\"644\",\"esperado\":\"600 o mas restrictivo\",\"origen_dato\":\"stat\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"virtualization_role\",\"evidence_id\":\"EV-05\",\"requisito\":\"op.exp.2.4\",\"plano\":\"sistema\",\"maquina\":\"wazuh-real\",\"rol\":\"vm\",\"plataforma\":\"kvm\",\"fabricante\":\"Hetzner\",\"producto\":\"vServer\",\"origen_dato\":\"systemd-detect-virt\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"evidence_state\",\"evidence_id\":\"EV-06\",\"requisito\":\"op.exp.2.2\",\"plano\":\"sistema\",\"estado\":\"NO_EVALUABLE\",\"causa\":\"CONFIGURATION\",\"motivo\":\"no se ha declarado acceso de solo lectura a la API de Wazuh (OPEXP2_API_URL, OPEXP2_API_USER, OPEXP2_API_PASSWORD): la puntuacion SCA de esta maquina solo la guarda el manager y el motor no la lee del indice\"}",
  "{\"ensfacil\":\"op.exp.2\",\"ts\":\"2026-09-16T16:19:55Z\",\"host\":\"wazuh-real\",\"event\":\"collector_run\",\"resultado\":\"completada\",\"evidencias_cubiertas\":\"EV-02,EV-04,EV-05\",\"evidencias_miradas\":\"EV-01,EV-02,EV-03,EV-04,EV-05\",\"perfil\":\"wazuh-real\",\"maquina\":\"wazuh-real\",\"plano\":\"sistema\",\"emisor\":\"recolector\"}",
];

// Una hora y media después de la pasada: el latido está dentro de su ventana.
const AHORA = new Date('2026-09-16T18:00:00Z');

const RULE_ID: Record<string, string> = {
  sca_evaluation: '110301',
  login_account: '110302',
  account_authenticated: '110303',
  service_exposed: '110304',
  insecure_default: '110305',
  virtualization_role: '110306',
  sca_score: '110307',
  evidence_state: '110350',
  collector_run: '110390',
};

const alertas = (lineas: string[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas.map((linea, i) => {
      const data = JSON.parse(linea);

      return {
        _id: `op-exp-2-${i}`,
        _source: {
          '@timestamp': data.ts,
          agent: { id: '024', name: 'wazuh-real' },
          rule: { id: RULE_ID[data.event] || '110300' },
          location: '/var/log/ensfacil/op_exp_2.json',
          data,
        },
      };
    })
  );

const sinEvento = (evento: string): string[] =>
  REALES.filter(linea => JSON.parse(linea).event !== evento);

const conEvento = (extra: Record<string, unknown>): string[] => [
  ...REALES,
  JSON.stringify({
    ensfacil: 'op.exp.2',
    ts: '2026-09-16T16:19:55Z',
    host: 'wazuh-real',
    ...extra,
  }),
];

// --- la configuración que se declararía para esta máquina -------------------

type Valor = string[] | number | undefined;

const VALORES: Record<string, Valor> = {
  'P-01': ['wazuh-real | cis_ubuntu24-04'],
  'P-02': ['wazuh-real | sshd,systemd-resolve,systemd-network | 22121,53,68'],
  'P-03': [
    'admin | Zimbra',
    'ubuntu | imagen cloud de Ubuntu',
    'sa | SQL Server',
  ],
  'P-04': ['ninguno | ninguna | Sin excepciones autorizadas'],
  'P-05': 90,
  'P-06': ['hetzner-cloud | wazuh-real | acreditación del proveedor (referencia)'],
};

const configuracion = (
  cambios: Record<string, Valor> = {}
): ENSControlConfiguration => {
  const valores = { ...VALORES, ...cambios };

  return {
    ...opExp2Configuration,
    parameters: opExp2Configuration.parameters.map(parametro => ({
      ...parametro,
      value: valores[parametro.id] as string[] | number | undefined,
    })),
  };
};

const evidencias = (
  lineas: string[] = REALES,
  cambios: Record<string, Valor> = {}
): Map<string, ENSEvidenceResolved> =>
  new Map(
    resolveEvidenceForControl(
      'op.exp.2',
      alertas(lineas),
      '024',
      'BAJO',
      configuracion(cambios),
      AHORA
    ).map(evidencia => [evidencia.id, evidencia])
  );

const estado = (
  e: Map<string, ENSEvidenceResolved>,
  id: string
): string => `${e.get(id)?.status}`;

const motivo = (
  e: Map<string, ENSEvidenceResolved>,
  id: string
): string => (e.get(id)?.observations || []).join(' | ');

// --- 1. la máquina real con su configuración ---------------------------------

bloque('1. wazuh-real tal como está, con la configuración propuesta');

{
  const e = evidencias();

  comprueba(
    'EV-01 CUMPLE: evalúa cis_ubuntu24-04, la que P-01 le asigna',
    estado(e, 'EV-01') === 'CUMPLE',
    motivo(e, 'EV-01')
  );
  comprueba(
    'EV-02 CUMPLE: root y dioni no son cuentas estándar de P-03',
    estado(e, 'EV-02') === 'CUMPLE',
    motivo(e, 'EV-02')
  );
  comprueba(
    'EV-03 CUMPLE: sus cuatro funciones expuestas están justificadas',
    estado(e, 'EV-03') === 'CUMPLE',
    motivo(e, 'EV-03')
  );
  comprueba(
    'EV-04 NO_CUMPLE: cinco valores por defecto inseguros sin excepción',
    estado(e, 'EV-04') === 'NO_CUMPLE',
    motivo(e, 'EV-04')
  );
  comprueba(
    'EV-04 nombra la desviación, no «algo falló»',
    motivo(e, 'EV-04').includes('wazuh-real:ssh_permitrootlogin'),
    motivo(e, 'EV-04')
  );
  comprueba(
    'EV-05 CUMPLE: la VM consta en el inventario',
    estado(e, 'EV-05') === 'CUMPLE',
    motivo(e, 'EV-05')
  );
  comprueba(
    'EV-06 NO_EVALUABLE: sin API no llega ninguna puntuación',
    estado(e, 'EV-06') === 'NO_EVALUABLE',
    motivo(e, 'EV-06')
  );
  comprueba(
    'EV-06 nunca CUMPLE por silencio, ni con el latido confirmado',
    e.get('EV-06')?.gapCause === 'COLLECTION',
    `${e.get('EV-06')?.gapCause}`
  );
  comprueba(
    'la regla del hecho decisivo viaja en la traza (EV-04 → 110305)',
    (e.get('EV-04')?.relatedRules || []).includes('110305'),
    (e.get('EV-04')?.relatedRules || []).join(',')
  );
}

// --- 2. los requisitos -----------------------------------------------------

bloque('2. Los cuatro requisitos, con el motor entero');

{
  const eventos = alertas(REALES);
  const resueltas = resolveEvidenceForControl(
    'op.exp.2',
    eventos,
    '024',
    'BAJO',
    configuracion(),
    AHORA
  );
  const resultado = evaluateENSControl(
    opExp2CatalogDefinition,
    configuracion(),
    'BAJO',
    resueltas,
    undefined,
    eventos
  );
  const requisito = (id: string) =>
    resultado.requirements.find(item => item.id === id);

  comprueba(
    'el control está ACTIVE',
    opExp2CatalogDefinition.status === 'ACTIVE'
  );
  comprueba(
    'op.exp.2.1 CUMPLE (EV-01 y EV-02 en verde)',
    requisito('op.exp.2.1')?.status === 'CUMPLE',
    `${requisito('op.exp.2.1')?.status}`
  );
  comprueba(
    'op.exp.2.2 NO_CUMPLE y NO evidenciado: le falta EV-06',
    requisito('op.exp.2.2')?.status === 'NO_CUMPLE' &&
      requisito('op.exp.2.2')?.evidenced === false,
    `${requisito('op.exp.2.2')?.status} evidenced=${requisito('op.exp.2.2')?.evidenced}`
  );
  comprueba(
    'op.exp.2.3 NO_CUMPLE y SÍ evidenciado: EV-04 midió y falló',
    requisito('op.exp.2.3')?.status === 'NO_CUMPLE' &&
      requisito('op.exp.2.3')?.evidenced === true,
    `${requisito('op.exp.2.3')?.status} evidenced=${requisito('op.exp.2.3')?.evidenced}`
  );
  comprueba(
    'op.exp.2.4 CUMPLE',
    requisito('op.exp.2.4')?.status === 'CUMPLE',
    `${requisito('op.exp.2.4')?.status}`
  );
  comprueba(
    'P-07 y P-ATT no bloquean la evaluación: no son obligatorios',
    !opExp2Configuration.parameters.some(
      parametro =>
        ['P-07', 'P-ATT'].includes(parametro.id) && parametro.required
    )
  );

  // La reversión del bloque: sin P-05, que SÍ es obligatorio, ni op.exp.2.1
  // —cuyas dos evidencias están en verde— puede salir CUMPLE.
  const sinUmbral = evaluateENSControl(
    opExp2CatalogDefinition,
    configuracion({ 'P-05': undefined }),
    'BAJO',
    resueltas,
    undefined,
    eventos
  );
  comprueba(
    'reversión: sin un parámetro obligatorio, op.exp.2.1 deja de CUMPLIR',
    sinUmbral.requirements.find(item => item.id === 'op.exp.2.1')?.status ===
      'NO_CUMPLE'
  );
}

// --- 3. P-03 --------------------------------------------------------------

bloque('3. P-03 decide qué cuenta es estándar, no el agente');

{
  const conRoot = evidencias(REALES, { 'P-03': ['root | Linux'] });

  comprueba(
    'root en P-03 → EV-02 NO_CUMPLE nombrando root',
    estado(conRoot, 'EV-02') === 'NO_CUMPLE' &&
      motivo(conRoot, 'EV-02').includes("'root'"),
    motivo(conRoot, 'EV-02')
  );
  comprueba(
    'ROOT en mayúsculas cuenta igual (lista prohibida)',
    estado(evidencias(REALES, { 'P-03': ['ROOT | Linux'] }), 'EV-02') ===
      'NO_CUMPLE'
  );
  comprueba(
    'reversión: sin root vuelve a CUMPLE',
    estado(evidencias(), 'EV-02') === 'CUMPLE'
  );
  comprueba(
    'una autenticación con una cuenta estándar también incumple',
    estado(
      evidencias(
        conEvento({
          event: 'account_authenticated',
          evidence_id: 'EV-02',
          usuario: 'admin',
          canal: 'ssh',
        })
      ),
      'EV-02'
    ) === 'NO_CUMPLE'
  );

  const sinP03 = evidencias(REALES, { 'P-03': undefined });
  comprueba(
    'sin P-03 → NO_EVALUABLE por CONFIGURATION',
    estado(sinP03, 'EV-02') === 'NO_EVALUABLE' &&
      sinP03.get('EV-02')?.gapCause === 'CONFIGURATION',
    `${estado(sinP03, 'EV-02')} ${sinP03.get('EV-02')?.gapCause}`
  );
}

// --- 4. P-02 --------------------------------------------------------------

bloque('4. P-02: mínima funcionalidad');

{
  const sinDhcp = evidencias(REALES, {
    'P-02': ['wazuh-real | sshd,systemd-resolve | 22121,53'],
  });

  comprueba(
    'sin systemd-network ni 68 justificados → EV-03 NO_CUMPLE nombrándolo',
    estado(sinDhcp, 'EV-03') === 'NO_CUMPLE' &&
      motivo(sinDhcp, 'EV-03').includes('systemd-network'),
    motivo(sinDhcp, 'EV-03')
  );
  comprueba(
    'el puerto también cuenta: sshd justificado en 22 y no en 22121 → NO_CUMPLE',
    estado(
      evidencias(REALES, {
        'P-02': ['wazuh-real | sshd,systemd-resolve,systemd-network | 22,53,68'],
      }),
      'EV-03'
    ) === 'NO_CUMPLE'
  );

  const otroPerfil = evidencias(REALES, { 'P-02': ['srv-web | nginx | 443'] });
  comprueba(
    'una fila de OTRO perfil no decide por esta máquina → NO_EVALUABLE CONFIGURATION',
    estado(otroPerfil, 'EV-03') === 'NO_EVALUABLE' &&
      otroPerfil.get('EV-03')?.gapCause === 'CONFIGURATION',
    `${estado(otroPerfil, 'EV-03')} ${otroPerfil.get('EV-03')?.gapCause}`
  );
  comprueba(
    'reversión: con la fila completa, CUMPLE',
    estado(evidencias(), 'EV-03') === 'CUMPLE'
  );
}

// --- 5. P-04 --------------------------------------------------------------

bloque('5. P-04: las excepciones son por máquina');

{
  const todas = [
    'ssh_permitrootlogin',
    'ssh_x11forwarding',
    'ssh_macs_debiles',
    'permisos:/etc/ssh/sshd_config',
    'permisos:/etc/crontab',
  ];

  comprueba(
    'las cinco autorizadas para wazuh-real → EV-04 CUMPLE',
    estado(
      evidencias(REALES, {
        'P-04': todas.map(c => `wazuh-real | wazuh-real:${c} | prueba`),
      }),
      'EV-04'
    ) === 'CUMPLE'
  );
  comprueba(
    'las mismas autorizadas para OTRA máquina no excusan a ésta → NO_CUMPLE',
    estado(
      evidencias(REALES, {
        'P-04': todas.map(c => `otra | otra:${c} | prueba`),
      }),
      'EV-04'
    ) === 'NO_CUMPLE'
  );
  comprueba(
    'sin desviaciones, con latido y «ninguna» declarada → CUMPLE',
    estado(evidencias(sinEvento('insecure_default')), 'EV-04') === 'CUMPLE'
  );
  comprueba(
    'sin desviaciones y SIN latido → NO_EVALUABLE (no consta que se mirara)',
    estado(
      evidencias(
        sinEvento('insecure_default').filter(
          linea => JSON.parse(linea).event !== 'collector_run'
        )
      ),
      'EV-04'
    ) === 'NO_EVALUABLE'
  );
}

// --- 6. P-01 --------------------------------------------------------------

bloque('6. P-01: la línea base asignada');

{
  comprueba(
    'asignada cis_ubuntu22-04 y evalúa 24-04 → EV-01 NO_CUMPLE',
    estado(
      evidencias(REALES, { 'P-01': ['wazuh-real | cis_ubuntu22-04'] }),
      'EV-01'
    ) === 'NO_CUMPLE'
  );
  comprueba(
    'asignadas dos y evalúa una → NO_CUMPLE (se compara el conjunto)',
    estado(
      evidencias(REALES, {
        'P-01': ['wazuh-real | cis_ubuntu24-04,ensfacil_extra'],
      }),
      'EV-01'
    ) === 'NO_CUMPLE'
  );
  comprueba(
    'sin fila para el perfil → NO_EVALUABLE CONFIGURATION',
    evidencias(REALES, { 'P-01': ['otro | cis_ubuntu24-04'] }).get('EV-01')
      ?.gapCause === 'CONFIGURATION'
  );
}

// --- 7. P-05 y EV-06 ------------------------------------------------------

bloque('7. P-05: la puntuación SCA la juzga el motor');

{
  const conPuntuacion = conEvento({
    event: 'sca_score',
    evidence_id: 'EV-06',
    perfil: 'wazuh-real',
    politica: 'cis_ubuntu24-04',
    puntuacion: 49,
  });

  comprueba(
    '49 con umbral 90 → EV-06 NO_CUMPLE',
    estado(evidencias(conPuntuacion), 'EV-06') === 'NO_CUMPLE'
  );
  comprueba(
    'el MISMO evento con umbral 45 → CUMPLE',
    estado(evidencias(conPuntuacion, { 'P-05': 45 }), 'EV-06') === 'CUMPLE'
  );
  comprueba(
    'una caída en la serie por debajo del umbral incumple aunque la última suba',
    estado(
      evidencias(
        [
          ...conPuntuacion,
          JSON.stringify({
            ensfacil: 'op.exp.2',
            ts: '2026-09-16T17:00:00Z',
            event: 'sca_score',
            evidence_id: 'EV-06',
            politica: 'cis_ubuntu24-04',
            puntuacion: 95,
          }),
        ],
        { 'P-05': 60 }
      ),
      'EV-06'
    ) === 'NO_CUMPLE'
  );
}

// --- 8. P-06 --------------------------------------------------------------

bloque('8. P-06: inventario de virtualización');

{
  comprueba(
    'la VM fuera del inventario → EV-05 NO_CUMPLE',
    estado(evidencias(REALES, { 'P-06': ['pve01 | otra-vm | agente pve01'] }), 'EV-05') ===
      'NO_CUMPLE'
  );

  const sinP06 = evidencias(REALES, { 'P-06': undefined });
  comprueba(
    'sin P-06 → EV-05 NO_EVALUABLE por CONFIGURATION',
    estado(sinP06, 'EV-05') === 'NO_EVALUABLE' &&
      sinP06.get('EV-05')?.gapCause === 'CONFIGURATION'
  );

  // P-06 no es obligatorio: su ausencia deja op.exp.2.4 sin evidenciar y NO
  // arrastra a op.exp.2.1, que no depende de él.
  const eventos = alertas(REALES);
  const sinInventario = evaluateENSControl(
    opExp2CatalogDefinition,
    configuracion({ 'P-06': undefined }),
    'BAJO',
    resolveEvidenceForControl('op.exp.2', eventos, '024', 'BAJO', configuracion({ 'P-06': undefined }), AHORA),
    undefined,
    eventos
  );
  comprueba(
    'sin P-06, op.exp.2.4 NO_CUMPLE no evidenciado y op.exp.2.1 sigue CUMPLE',
    sinInventario.requirements.find(r => r.id === 'op.exp.2.4')?.evidenced === false &&
      sinInventario.requirements.find(r => r.id === 'op.exp.2.1')?.status === 'CUMPLE',
    sinInventario.requirements.map(r => `${r.id}=${r.status}`).join(' ')
  );
  comprueba(
    'una máquina física (sin hecho) con latido e inventario declarado → CUMPLE',
    estado(
      evidencias(sinEvento('virtualization_role'), {
        'P-06': ['pve01 | srv-bd01 | agente pve01'],
      }),
      'EV-05'
    ) === 'CUMPLE'
  );
}

// --- 9. EV-07 -------------------------------------------------------------

bloque('9. EV-07 no finge medir lo que no se puede observar');

{
  comprueba(
    'EV-07 NO_EVALUABLE',
    estado(evidencias(), 'EV-07') === 'NO_EVALUABLE'
  );
  comprueba(
    'y ningún requisito la declara',
    !opExp2CatalogDefinition.requirements.some(requisito =>
      requisito.evidenceIds.includes('EV-07')
    )
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
