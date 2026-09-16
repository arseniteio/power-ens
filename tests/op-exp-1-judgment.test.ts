/**
 * op.exp.1 · Inventario de activos: el motor juzga el inventario que emite el
 * agente contra lo que declara la organización.
 *
 *     docker run --rm -v "$PWD":/w -w /w node:22-alpine \
 *       sh -c 'npm i -g tsx >/dev/null 2>&1; tsx tests/op-exp-1-judgment.test.ts'
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Los hechos de las fixtures son LÍNEAS REALES del recolector, tomadas en
 * wazuh-real (Ubuntu 24.04) y en el servidor de directorio (Ubuntu 22.04 con
 * Zimbra), envueltas como las devuelve el índice. Lo único que se mueve en cada
 * caso es UN eje —un parámetro de la pantalla o el reloj—, y cada afirmación
 * lleva al lado su reversión: la prueba de aceptación del modelo nuevo es que
 * cambiar el parámetro cambia el veredicto sin tocar el agente.
 */
import { opExp1CatalogDefinition } from '../dashboard/ens/catalog/op-exp-1';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../dashboard/ens/configuration/types';
import { opExp1Configuration } from '../dashboard/ens/configuration/data/op-exp-1-parameters';
import { validateControlConfiguration } from '../dashboard/ens/configuration/services/validation-engine';
import { normalizeWazuhAlerts } from '../dashboard/ens/core/data-source/data-source-engine';
import type { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';
import { ENSEvidenceCatalog } from '../dashboard/ens/core/evidence/catalog';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
import type { ENSEvidenceResolved } from '../dashboard/ens/core/evidence/types';
import { evaluateRequirements } from '../dashboard/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../dashboard/ens/core/evaluation/control/control-evaluator';
import { buildOpExp1ReportModel } from '../dashboard/ens/reports/op-exp-1-report-model';

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

// --- hechos reales ---------------------------------------------------------

// Rule ID de cada hecho según agent/rules/ensfacil_op_exp_1_json_rules.xml.
const REGLA: Record<string, string> = {
  asset_system: '110201',
  software_inventory: '110202',
  network_inventory: '110203',
  agent_status: '110204',
  network_host_observed: '110205',
  asset_software_change: '110206',
  asset_hardware_change: '110207',
  asset_port_opened: '110208',
  asset_port_closed: '110209',
  inventory_review: '110210',
  evidence_state: '110295',
  collector_run: '110299',
};

// Pasada real de wazuh-real (agente 024), en régimen estable y con un registro
// de revisiones de prueba.
const WAZUH_REAL = [
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"asset_system","evidence_id":"EV-01,EV-07","requisito":"op.exp.1.1","activo":"wazuh-real","fqdn":"wazuh-real","sistema_operativo":"Ubuntu","version_so":"24.04.4 LTS (Noble Numbat)","kernel":"6.8.0-111-generic","arquitectura":"x86_64","fabricante":"Hetzner","modelo":"vServer","num_serie":"156475036","virtualizacion":"kvm","cpu_modelo":"AMD EPYC-Rome Processor","cpus":2,"memoria_mb":3840}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"software_inventory","evidence_id":"EV-02","requisito":"op.exp.1.1,op.exp.1.r4.1","activo":"wazuh-real","gestor":"dpkg","paquetes":570,"snaps":0,"huella":"a9248bce0c39db8bcf3d85b904587b0ec4b7bfd2d822772ed18f8f223f940236","linea_base":"no","altas":0,"bajas":0,"actualizaciones":0}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"network_inventory","evidence_id":"EV-03","requisito":"op.exp.1.1","activo":"wazuh-real","interfaces":"eth0","direcciones":"eth0=62.238.61.123/32,eth0=2a01:4f9:c015:2f44::1/64","puertos_escucha":7,"servicios":"sshd/tcp/22121,systemd-network/udp/68,systemd-resolve/tcp/53,systemd-resolve/udp/53","procesos":137}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"agent_status","evidence_id":"EV-04","requisito":"op.exp.1.1,op.exp.1.r2.1","activo":"wazuh-real","estado_agente":"connected","mensajes_en_buffer":0,"version_agente":"4.14.5","gestor":"89.167.83.18","ultimo_keepalive":"2026-09-16T16:16:01Z","ultimo_ack":"2026-09-16T16:16:01Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"network_host_observed","evidence_id":"EV-05","requisito":"op.exp.1.1","activo":"wazuh-real","ip":"172.31.1.1","mac":"d2:74:7f:6e:37:e3","interfaz":"eth0","estado_vecino":"REACHABLE","es_pasarela":"si","primera_observacion":"2026-09-16T16:15:53Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"inventory_review","evidence_id":"EV-06","requisito":"op.exp.1.1","activo":"wazuh-real","fecha":"2026-09-10","alcance":"inventario completo","responsable":"rsis"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"collector_run","resultado":"completada","evidencias_cubiertas":"EV-05","fuentes_leidas":"EV-01,EV-07,EV-02,EV-03,EV-04,EV-05,EV-06","cambios_emitidos":0,"perfil":"linux","emisor":"recolector"}',
];

// El evento de degradación real de EV-06 cuando no hay registro de revisiones.
const SIN_REVISION =
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:15:53Z","host":"wazuh-real","event":"evidence_state","evidence_id":"EV-06","requisito":"op.exp.1.1","estado":"NO_EVALUABLE","causa":"CONFIGURATION","motivo":"no consta ningun registro de revision del inventario en /etc/ensfacil/opexp1-revisiones.tsv"}';

let contador = 0;

const indexa = (
  lineas: string[],
  agente = { id: '024', name: 'wazuh-real' }
): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas.map(linea => {
      const data = JSON.parse(linea);

      contador += 1;

      return {
        _id: `op-exp-1-${contador}`,
        _source: {
          '@timestamp': data.ts,
          agent: agente,
          rule: {
            id: REGLA[data.event],
            description: `op.exp.1 · ${data.event}`,
          },
          data,
        },
      };
    })
  );

const sinEvento = (lineas: string[], evento: string): string[] =>
  lineas.filter(linea => JSON.parse(linea).event !== evento);

// --- configuración ---------------------------------------------------------

type Valores = Record<string, ENSControlParameter['value'] | undefined>;

const VALORES_CORRECTOS: Valores = {
  'P-01': ['wazuh-real | Responsable de Sistemas | Resp. Sistemas | HW servidor'],
  'P-02': ['gw-proveedor | router | 172.31.1.1 | Proveedor de hosting'],
  'P-03': ['HW servidor', 'HW red', 'SW base', 'servicio'],
  'P-04': 90,
  'P-08': 24,
};

// Un parámetro sin configurar no lleva la clave `value`, nunca `null`: es como
// lo guarda `wazuh-ens-configuration`.
const configuracion = (valores: Valores): ENSControlConfiguration => ({
  ...opExp1Configuration,
  parameters: opExp1Configuration.parameters.map(parametro => {
    const { value: _descartado, ...resto } = parametro as ENSControlParameter;

    return valores[parametro.id] === undefined
      ? (resto as ENSControlParameter)
      : ({ ...resto, value: valores[parametro.id] } as ENSControlParameter);
  }),
});

const con = (cambios: Valores): Valores => ({
  ...VALORES_CORRECTOS,
  ...cambios,
});

const AHORA = new Date('2026-09-16T18:00:00Z');

const resuelve = (
  lineas: string[],
  valores: Valores,
  ahora: Date = AHORA,
  agente = { id: '024', name: 'wazuh-real' }
): Map<string, ENSEvidenceResolved> =>
  new Map(
    resolveEvidenceForControl(
      'op.exp.1',
      indexa(lineas, agente),
      agente.id,
      'MEDIO',
      configuracion(valores),
      ahora
    ).map(evidencia => [evidencia.id, evidencia])
  );

const texto = (evidencia?: ENSEvidenceResolved): string =>
  (evidencia?.observations || []).join(' | ');

// --- 1. el eje del control -------------------------------------------------

bloque('1. Solo puntúa op.exp.1.1, igual en las tres categorías');

{
  const base = opExp1CatalogDefinition.requirements.find(
    requisito => requisito.id === 'op.exp.1.1'
  );

  comprueba(
    'op.exp.1.1 aplica en BAJO, MEDIO y ALTO (BÁSICA, MEDIA y ALTA)',
    JSON.stringify(base?.applicability.levels) === '["BAJO","MEDIO","ALTO"]'
  );

  const refuerzos = opExp1CatalogDefinition.requirements.filter(
    requisito => requisito.kind === 'REFUERZO'
  );

  comprueba(
    'los cuatro refuerzos existen y ninguno declara nivel',
    refuerzos.length === 4 &&
      refuerzos.every(requisito => requisito.applicability.levels.length === 0),
    refuerzos.map(requisito => requisito.id).join(', ')
  );

  for (const nivel of ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]) {
    const resultados = evaluateRequirements(
      opExp1CatalogDefinition.requirements,
      nivel,
      [],
      false,
      [],
      'ACTIVE'
    );

    const aplicables = resultados.filter(resultado => resultado.applicable);

    comprueba(
      `${nivel} · el único requisito aplicable es op.exp.1.1`,
      aplicables.length === 1 && aplicables[0].id === 'op.exp.1.1',
      aplicables.map(resultado => resultado.id).join(', ')
    );
  }

  comprueba(
    'las siete evidencias declaran juicio (modelo nuevo entero)',
    ENSEvidenceCatalog.filter(
      evidencia => evidencia.controlId === 'op.exp.1' && evidencia.judgment
    ).length === 7
  );
}

// --- 2. la máquina real, bien declarada ------------------------------------

bloque('2. wazuh-real con la organización declarada: las siete CUMPLEN');

{
  const evidencias = resuelve(WAZUH_REAL, VALORES_CORRECTOS);

  for (const id of ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07']) {
    comprueba(
      `${id} · CUMPLE`,
      evidencias.get(id)?.status === 'CUMPLE',
      `${evidencias.get(id)?.status}: ${texto(evidencias.get(id))}`
    );
  }

  comprueba(
    'EV-07 lleva la regla 110201 y el evento que lo decide',
    Boolean(
      evidencias.get('EV-07')?.relatedRules.includes('110201') &&
        evidencias.get('EV-07')?.resolvedRuleId === '110201'
    )
  );

  const validacion = validateControlConfiguration(
    configuracion(VALORES_CORRECTOS),
    'MEDIO'
  );

  const requisitos = evaluateRequirements(
    opExp1CatalogDefinition.requirements,
    'MEDIO',
    Array.from(evidencias.values()),
    validacion.missingRequired.length + validacion.invalidRequired.length > 0,
    [],
    'ACTIVE'
  );

  const control = evaluateControlStatus(requisitos);

  comprueba(
    'op.exp.1.1 CUMPLE y el control sale al 100 %',
    requisitos.find(requisito => requisito.id === 'op.exp.1.1')?.status ===
      'CUMPLE' && control.status === 'CUMPLE',
    `${control.status} ${control.score}`
  );
}

// --- 3. EV-07: la mitad organizativa ---------------------------------------

bloque('3. EV-07 · un activo observado sin fila en P-01 no cumple');

{
  const sinFila = resuelve(
    WAZUH_REAL,
    con({ 'P-01': ['srv-otro | Responsable | Rol | HW servidor'] })
  ).get('EV-07');

  comprueba(
    'sin wazuh-real en P-01 · NO_CUMPLE (medido, no hueco)',
    sinFila?.status === 'NO_CUMPLE',
    String(sinFila?.status)
  );

  comprueba(
    'el motivo nombra el activo',
    texto(sinFila).includes("'wazuh-real'"),
    texto(sinFila)
  );

  comprueba(
    'reversión · con la fila vuelve a CUMPLE',
    resuelve(WAZUH_REAL, VALORES_CORRECTOS).get('EV-07')?.status === 'CUMPLE'
  );

  comprueba(
    'la comparación distingue mayúsculas (Wazuh-Real no autoriza wazuh-real)',
    resuelve(
      WAZUH_REAL,
      con({ 'P-01': ['Wazuh-Real | Responsable | Rol | HW servidor'] })
    ).get('EV-07')?.status === 'NO_CUMPLE'
  );

  const sinP01 = resuelve(WAZUH_REAL, con({ 'P-01': undefined })).get('EV-07');

  comprueba(
    'P-01 sin configurar · NO_EVALUABLE con causa CONFIGURATION, nunca CUMPLE',
    sinP01?.status === 'NO_EVALUABLE' && sinP01?.gapCause === 'CONFIGURATION',
    `${sinP01?.status} ${sinP01?.gapCause}`
  );

  // El responsable no se observa: se exige declararlo. Una fila sin él deja
  // P-01 inválido, y un obligatorio inválido bloquea el control entero.
  const sinResponsable = validateControlConfiguration(
    configuracion(con({ 'P-01': ['wazuh-real |  | Rol | HW servidor'] })),
    'MEDIO'
  );

  comprueba(
    'una fila sin responsable deja P-01 inválido',
    sinResponsable.invalidRequired.some(parametro => parametro.id === 'P-01'),
    sinResponsable.issues.map(issue => issue.reason).join('; ')
  );

  const sinNaturaleza = validateControlConfiguration(
    configuracion(con({ 'P-01': ['wazuh-real | Responsable | Rol'] })),
    'MEDIO'
  );

  comprueba(
    'una fila sin naturaleza deja P-01 inválido',
    sinNaturaleza.invalidRequired.some(parametro => parametro.id === 'P-01')
  );

  comprueba(
    'reversión · la fila completa es válida',
    validateControlConfiguration(configuracion(VALORES_CORRECTOS), 'MEDIO')
      .invalidRequired.length === 0
  );

  const requisito = evaluateRequirements(
    opExp1CatalogDefinition.requirements,
    'MEDIO',
    Array.from(resuelve(WAZUH_REAL, VALORES_CORRECTOS).values()),
    true,
    [],
    'ACTIVE'
  ).find(resultado => resultado.id === 'op.exp.1.1');

  comprueba(
    'con P-01 inválido op.exp.1.1 NO CUMPLE aunque las siete evidencias estén en verde',
    requisito?.status === 'NO_CUMPLE',
    String(requisito?.status)
  );
}

// --- 4. EV-05: hosts de red sin declarar -----------------------------------

bloque('4. EV-05 · un host vecino sin declarar en P-02 no cumple');

{
  const sinDeclarar = resuelve(
    WAZUH_REAL,
    con({ 'P-02': ['impresora-01 | impresora | 10.0.0.9 | Oficina'] })
  ).get('EV-05');

  comprueba(
    'la pasarela 172.31.1.1 fuera de P-02 · NO_CUMPLE nombrando la IP',
    sinDeclarar?.status === 'NO_CUMPLE' && texto(sinDeclarar).includes('172.31.1.1'),
    texto(sinDeclarar)
  );

  comprueba(
    'reversión · declarada en P-02 vuelve a CUMPLE',
    resuelve(WAZUH_REAL, VALORES_CORRECTOS).get('EV-05')?.status === 'CUMPLE'
  );

  const soloNombre = resuelve(
    WAZUH_REAL,
    con({ 'P-02': ['sai-01 | SAI |  | Mantenimiento'] })
  ).get('EV-05');

  comprueba(
    'P-02 sin ninguna IP · NO_EVALUABLE por configuración (no hay contra qué comparar)',
    soloNombre?.status === 'NO_EVALUABLE' && soloNombre?.gapCause === 'CONFIGURATION',
    `${soloNombre?.status} ${soloNombre?.gapCause}`
  );

  const silencio = resuelve(
    sinEvento(WAZUH_REAL, 'network_host_observed'),
    VALORES_CORRECTOS
  ).get('EV-05');

  comprueba(
    'sin vecinos y con el latido cubriendo EV-05 · CUMPLE (es un barrido)',
    silencio?.status === 'CUMPLE',
    texto(silencio)
  );

  const sinLatido = resuelve(
    sinEvento(sinEvento(WAZUH_REAL, 'network_host_observed'), 'collector_run'),
    VALORES_CORRECTOS
  ).get('EV-05');

  comprueba(
    'reversión · el mismo silencio sin latido · NO_EVALUABLE (COLLECTION)',
    sinLatido?.status === 'NO_EVALUABLE' && sinLatido?.gapCause === 'COLLECTION',
    `${sinLatido?.status} ${sinLatido?.gapCause}`
  );
}

// --- 5. EV-01 a EV-04: inventario al día -----------------------------------

bloque('5. EV-01 a EV-04 · el inventario técnico caduca contra P-08');

{
  const dentro = resuelve(WAZUH_REAL, VALORES_CORRECTOS, new Date('2026-09-17T15:00:00Z'));
  const fuera = resuelve(WAZUH_REAL, VALORES_CORRECTOS, new Date('2026-09-17T18:00:00Z'));
  const plazoMayor = resuelve(
    WAZUH_REAL,
    con({ 'P-08': 48 }),
    new Date('2026-09-17T18:00:00Z')
  );

  for (const id of ['EV-01', 'EV-02', 'EV-03', 'EV-04']) {
    comprueba(
      `${id} · a las 23 h de la foto, con P-08 = 24 · CUMPLE`,
      dentro.get(id)?.status === 'CUMPLE',
      texto(dentro.get(id))
    );

    comprueba(
      `${id} · a las 26 h, con P-08 = 24 · NO_CUMPLE (el agente dejó de reportar)`,
      fuera.get(id)?.status === 'NO_CUMPLE',
      texto(fuera.get(id))
    );

    comprueba(
      `${id} · reversión · el mismo reloj con P-08 = 48 · CUMPLE`,
      plazoMayor.get(id)?.status === 'CUMPLE'
    );
  }

  // Un agente que nunca ha conectado no trae keepalive: no puede pasar por
  // conectado.
  const sinKeepalive = WAZUH_REAL.map(linea => {
    const data = JSON.parse(linea);

    if (data.event !== 'agent_status') {
      return linea;
    }

    delete data.ultimo_keepalive;
    data.estado_agente = 'pending';

    return JSON.stringify(data);
  });

  const ev04 = resuelve(sinKeepalive, VALORES_CORRECTOS).get('EV-04');

  comprueba(
    'EV-04 sin keepalive · NO_EVALUABLE (EVIDENCE), nunca CUMPLE',
    ev04?.status === 'NO_EVALUABLE' && ev04?.gapCause === 'EVIDENCE',
    `${ev04?.status} ${ev04?.gapCause}`
  );

  const sinP07 = resuelve(WAZUH_REAL, con({ 'P-08': undefined })).get('EV-01');

  comprueba(
    'P-08 sin configurar · EV-01 NO_EVALUABLE (CONFIGURATION)',
    sinP07?.status === 'NO_EVALUABLE' && sinP07?.gapCause === 'CONFIGURATION'
  );
}

// --- 6. EV-06: revisión formal del inventario ------------------------------

bloque('6. EV-06 · la revisión del inventario caduca contra P-04');

{
  comprueba(
    'revisión del 10/09 evaluada el 16/09 con P-04 = 90 · CUMPLE',
    resuelve(WAZUH_REAL, VALORES_CORRECTOS).get('EV-06')?.status === 'CUMPLE'
  );

  const vencida = resuelve(WAZUH_REAL, con({ 'P-04': 3 })).get('EV-06');

  comprueba(
    'reversión · el mismo registro con P-04 = 3 · NO_CUMPLE',
    vencida?.status === 'NO_CUMPLE',
    texto(vencida)
  );

  // Lo que emite de verdad wazuh-real hoy: no hay registro de revisiones. El
  // `evidence_state` del agente NO decide la evidencia; decide la ausencia del
  // hecho, y eso nunca es CUMPLE.
  const sinRegistro = resuelve(
    [...sinEvento(WAZUH_REAL, 'inventory_review'), SIN_REVISION],
    VALORES_CORRECTOS
  ).get('EV-06');

  comprueba(
    'sin revisión anotada · NO_EVALUABLE, nunca CUMPLE por ausencia',
    sinRegistro?.status === 'NO_EVALUABLE',
    `${sinRegistro?.status}: ${texto(sinRegistro)}`
  );

  // Los cambios de composición se escuchan para la traza pero no deciden.
  const conCambio = resuelve(
    [
      ...WAZUH_REAL,
      '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:04Z","host":"wazuh-real","event":"asset_software_change","evidence_id":"EV-06","requisito":"op.exp.1.1","activo":"wazuh-real","cambio":"alta","gestor":"dpkg","paquete":"jq","version_anterior":"-","version_nueva":"1.7.1-3ubuntu0.24.04.2"}',
    ],
    VALORES_CORRECTOS
  ).get('EV-06');

  comprueba(
    'un cambio de software no altera el veredicto de la revisión',
    conCambio?.status === 'CUMPLE',
    String(conCambio?.status)
  );
}

// --- 7. el requisito sin la mitad organizativa -----------------------------

bloque('7. op.exp.1.1 sin declarar nada: NO CUMPLE, y no por falta de agente');

{
  const vacia: Valores = {};

  const evidencias = Array.from(resuelve(WAZUH_REAL, vacia).values());

  const validacion = validateControlConfiguration(configuracion(vacia), 'MEDIO');

  const requisito = evaluateRequirements(
    opExp1CatalogDefinition.requirements,
    'MEDIO',
    evidencias,
    validacion.missingRequired.length > 0,
    [],
    'ACTIVE'
  ).find(resultado => resultado.id === 'op.exp.1.1');

  comprueba(
    'op.exp.1.1 NO_CUMPLE',
    requisito?.status === 'NO_CUMPLE',
    String(requisito?.status)
  );

  comprueba(
    'los obligatorios que faltan son P-01, P-02, P-03, P-04 y P-08 (P-05, P-06 y P-ATT no bloquean)',
    validacion.missingRequired.map(parametro => parametro.id).sort().join(',') ===
      'P-01,P-02,P-03,P-04,P-08',
    validacion.missingRequired.map(parametro => parametro.id).join(',')
  );

  comprueba(
    'ninguna evidencia sale en verde sin parámetro',
    evidencias.every(evidencia => evidencia.status !== 'CUMPLE'),
    evidencias.map(evidencia => `${evidencia.id}=${evidencia.status}`).join(' ')
  );
}

// --- 8. el informe enseña lo observado y lo declarado ----------------------

bloque('8. El informe distingue lo observado de lo declarado');

{
  const evidencias = Array.from(resuelve(WAZUH_REAL, VALORES_CORRECTOS).values());

  // Solo lo que el modelo lee: el resultado real lo construye
  // evaluation-engine.ts, que arrastra kibana-services.
  const resultado = {
    control: { id: 'op.exp.1' },
    status: 'CUMPLE',
    score: 100,
    level: 'MEDIO',
    parameters: configuracion(VALORES_CORRECTOS).parameters.map(parametro => ({
      id: parametro.id,
      value: parametro.value,
    })),
    evidences: evidencias.map(evidencia => ({
      id: evidencia.id,
      status: evidencia.status,
      observations: evidencia.observations,
      resolvedAttributes: evidencia.resolvedAttributes,
    })),
  } as unknown as Parameters<typeof buildOpExp1ReportModel>[0];

  const modelo = buildOpExp1ReportModel(resultado);
  const campo = (id: string) =>
    modelo.fields.find(item => item.id === `op.exp.1.${id}`);

  comprueba(
    'once campos, los de la hoja «Informe ENSFácil»',
    modelo.fields.length === 11,
    String(modelo.fields.length)
  );

  comprueba(
    'el inventario consolidado enseña el activo y su hardware observados',
    Boolean(
      campo('campo2')?.value.includes('activo: wazuh-real') &&
        campo('campo2')?.value.includes('fabricante: Hetzner')
    ),
    campo('campo2')?.value
  );

  comprueba(
    'la cobertura enseña la fila declarada en P-01',
    Boolean(campo('campo3')?.value.includes('Responsable de Sistemas')),
    campo('campo3')?.value
  );

  comprueba(
    'la revisión periódica enseña la fecha observada',
    Boolean(campo('campo10')?.value.includes('fecha: 2026-09-10')),
    campo('campo10')?.value
  );

  comprueba(
    'los activos críticos (R3) salen NO_APLICA',
    campo('campo9')?.status === 'NO_APLICA'
  );
}

// --- resultado -------------------------------------------------------------

console.log(
  fallos.length
    ? `\n${fallos.length} comprobación(es) FALLAN`
    : '\nop.exp.1: todas las comprobaciones pasan'
);

process.exit(fallos.length ? 1 : 0);
