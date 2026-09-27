/**
 * Datos sin renovar: un control no se juzga con lo que su recolector dejó de
 * enviar hace más de 24 h.
 *
 *     npx --yes tsx tests/stale-collector.test.ts
 *
 * POR QUÉ EXISTE ESTE FICHERO. El servidor de directorio (agente 028) dejó de
 * enviar datos el 25/09 y el panel seguía enseñando op.acc.3 al 100 % CUMPLE
 * con la última pasada de ese día, como si fuera de hoy. El motor juzgaba el
 * estado con la última pasada (`state-facts.ts`) sin mirar cuándo había sido.
 *
 * Decisión del 27/09: si en la fila de una máquina el último latido
 * `collector_run` de un control tiene más de 24 h respecto al `now` de la
 * evaluación, sus evidencias salen NO_EVALUABLE / COLLECTION con el motivo
 * «sin datos del recolector desde <fecha UTC>» y sus requisitos no cumplen.
 * Igual sin latido pero con hechos (datos huérfanos).
 *
 * Qué se prueba:
 *   1. El detector: umbral único de 24 h, latido o hecho huérfano como
 *      referencia, lo posterior a `now` no cuenta, sin datos no decide nada.
 *   2. Con el motor entero, op.exp.1 de wazuh-real: CUMPLE con la pasada fresca
 *      y, con la misma pasada 25 h después, NO_CUMPLE no evidenciado con causa
 *      COLLECTION y el motivo en la no conformidad. Lo que no aplica, no aplica.
 *   3. El consolidado no puede salir CUMPLE con una fila sin renovar.
 *   4. La fila del manager (000) sigue la misma regla.
 *   5. La serie diaria aplica el umbral contra el `now` de cada punto.
 *
 * Se prueba el MOTOR de verdad, con `kibana-services` sustituido por un módulo
 * vacío antes de cargarlo, igual que en `measurement-planes.test.ts`.
 */
import { ensConfigurationRepository } from '../dashboard/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../dashboard/ens/configuration/data/default-configuration';
import { opExp1Configuration } from '../dashboard/ens/configuration/data/op-exp-1-parameters';
import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSControlParameter,
} from '../dashboard/ens/configuration/types';
import { normalizeWazuhAlerts } from '../dashboard/ens/core/data-source/data-source-engine';
import type { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';
import {
  findStaleCollector,
  STALE_COLLECTOR_MAX_AGE_HOURS,
} from '../dashboard/ens/core/evidence/stale-collector';
import type { ENSAgentScope } from '../dashboard/ens/core/scope/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

// `kibana-services` de mentira, ANTES de cargar el motor.
{
  const Module = require('module');
  const cargar = Module._load;

  Module._load = function (peticion: string, ...resto: unknown[]) {
    if (/kibana-services$/.test(peticion)) {
      return {};
    }

    return cargar.call(this, peticion, ...resto);
  };
}

const {
  getENSComplianceResultByControl,
  getENSComplianceState,
} = require('../dashboard/ens/core/ens-engine') as typeof import('../dashboard/ens/core/ens-engine');
const { buildENSControlComplianceTimeline } = require('../dashboard/ens/core/timeline/control-timeline') as typeof import('../dashboard/ens/core/timeline/control-timeline');

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

const NIVEL = 'MEDIO';
const HORA = 60 * 60 * 1000;

// --- hechos reales ---------------------------------------------------------

// Rule ID de cada hecho según agent/rules/ensfacil_op_exp_1_json_rules.xml.
const REGLA: Record<string, string> = {
  asset_system: '110201',
  software_inventory: '110202',
  network_inventory: '110203',
  agent_status: '110204',
  network_host_observed: '110205',
  inventory_review: '110210',
  collector_run: '110299',
};

// Pasada real de op.exp.1 en wazuh-real (024), la misma que usa
// `op-exp-1-judgment.test.ts`. Con los parámetros de abajo, op.exp.1.1 CUMPLE.
const PASADA = '2026-09-16T16:16:13Z';

const WAZUH_REAL = [
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"asset_system","evidence_id":"EV-01,EV-07","requisito":"op.exp.1.1","activo":"wazuh-real","fqdn":"wazuh-real","sistema_operativo":"Ubuntu","version_so":"24.04.4 LTS (Noble Numbat)","kernel":"6.8.0-111-generic","arquitectura":"x86_64","fabricante":"Hetzner","modelo":"vServer","num_serie":"156475036","virtualizacion":"kvm","cpu_modelo":"AMD EPYC-Rome Processor","cpus":2,"memoria_mb":3840}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"software_inventory","evidence_id":"EV-02","requisito":"op.exp.1.1,op.exp.1.r4.1","activo":"wazuh-real","gestor":"dpkg","paquetes":570,"snaps":0,"huella":"a9248bce0c39db8bcf3d85b904587b0ec4b7bfd2d822772ed18f8f223f940236","linea_base":"no","altas":0,"bajas":0,"actualizaciones":0}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"network_inventory","evidence_id":"EV-03","requisito":"op.exp.1.1","activo":"wazuh-real","interfaces":"eth0","direcciones":"eth0=62.238.61.123/32,eth0=2a01:4f9:c015:2f44::1/64","puertos_escucha":7,"servicios":"sshd/tcp/22121,systemd-network/udp/68,systemd-resolve/tcp/53,systemd-resolve/udp/53","procesos":137}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"agent_status","evidence_id":"EV-04","requisito":"op.exp.1.1,op.exp.1.r2.1","activo":"wazuh-real","estado_agente":"connected","mensajes_en_buffer":0,"version_agente":"4.14.5","gestor":"89.167.83.18","ultimo_keepalive":"2026-09-16T16:16:01Z","ultimo_ack":"2026-09-16T16:16:01Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"network_host_observed","evidence_id":"EV-05","requisito":"op.exp.1.1","activo":"wazuh-real","ip":"172.31.1.1","mac":"d2:74:7f:6e:37:e3","interfaz":"eth0","estado_vecino":"REACHABLE","es_pasarela":"si","primera_observacion":"2026-09-16T16:15:53Z"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"inventory_review","evidence_id":"EV-06","requisito":"op.exp.1.1","activo":"wazuh-real","fecha":"2026-09-10","alcance":"inventario completo","responsable":"rsis"}',
  '{"ensfacil":"op.exp.1","ts":"2026-09-16T16:16:13Z","host":"wazuh-real","event":"collector_run","resultado":"completada","evidencias_cubiertas":"EV-05","fuentes_leidas":"EV-01,EV-07,EV-02,EV-03,EV-04,EV-05,EV-06","cambios_emitidos":0,"perfil":"linux","emisor":"recolector"}',
];

let contador = 0;

const indexa = (
  lineas: string[],
  agente: { id: string; name: string } = { id: '024', name: 'wazuh-real' }
): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas.map(linea => {
      const data = JSON.parse(linea);

      contador += 1;

      return {
        _id: `stale-${contador}`,
        _source: {
          '@timestamp': data.ts,
          agent: agente,
          rule: { id: REGLA[data.event] || '110299', description: data.event },
          data,
        },
      };
    })
  );

// Hecho mínimo para el detector, que solo mira control, tipo, agente y fecha.
const hecho = (
  controlId: string,
  eventType: string,
  timestamp: string,
  agentId = '024'
): ENSNormalizedEvent => ({
  id: `h-${(contador += 1)}`,
  agentId,
  controlId,
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp,
  attributes: {},
});

// --- configuración: la de op.exp.1 con sus parámetros declarados -----------

// P-08 (antigüedad máxima del inventario) va a 720 h a propósito: con las 24 h
// de ejemplo, la foto de hace 25 h ya saldría NO_CUMPLE por la propia medida
// de op.exp.1 y la prueba no distinguiría si lo que la tumba es el umbral del
// recolector o el del control.

const VALORES: Record<string, ENSControlParameter['value']> = {
  'P-01': ['wazuh-real | Responsable de Sistemas | Resp. Sistemas | HW servidor'],
  'P-02': ['gw-proveedor | router | 172.31.1.1 | Proveedor de hosting'],
  'P-03': ['HW servidor', 'HW red', 'SW base', 'servicio'],
  'P-04': 90,
  'P-08': 720,
};

// Un parámetro sin configurar no lleva la clave `value`, nunca `null`.
const opExp1: ENSControlConfiguration = {
  ...opExp1Configuration,
  parameters: opExp1Configuration.parameters.map(parametro => {
    const { value: _descartado, ...resto } = parametro as ENSControlParameter;

    return VALORES[parametro.id] === undefined
      ? (resto as ENSControlParameter)
      : ({ ...resto, value: VALORES[parametro.id] } as ENSControlParameter);
  }),
};

ensConfigurationRepository.replaceActive({
  ...defaultENSConfigurationTemplate,
  global: {
    ...defaultENSConfigurationTemplate.global,
    clientName: 'Cliente de prueba',
    organization: 'Organización de prueba',
    scope: 'Laboratorio',
    ensLevel: NIVEL,
  } as ENSConfigurationVersion['global'],
  controls: defaultENSConfigurationTemplate.controls.map(control =>
    control.controlId === 'op.exp.1' ? opExp1 : control
  ),
});

const WAZUH: ENSAgentScope = { id: '024', name: 'wazuh-real', groups: ['ens'] };
const LDAP: ENSAgentScope = { id: '028', name: 'zimbraHldap', groups: ['ens'] };
const MANAGER: ENSAgentScope = { id: '000', name: 'Wazuh-4', groups: [], isManager: true };

const tras = (horas: number, desde = PASADA): Date =>
  new Date(Date.parse(desde) + horas * HORA);

const opExp1De = (
  eventos: ENSNormalizedEvent[],
  agente: string | undefined,
  alcance: ENSAgentScope[],
  ahora: Date
) =>
  getENSComplianceState(NIVEL, eventos, agente, alcance, ahora).results.find(
    resultado => resultado.control.id === 'op.exp.1'
  );

// --- 1. el detector ----------------------------------------------------------

bloque('1. El detector: 24 h desde el último latido, o desde el último hecho huérfano');

{
  comprueba('el umbral es una constante única de 24 h', STALE_COLLECTOR_MAX_AGE_HOURS === 24);

  const pasada = [
    hecho('op.acc.3', 'account_action', '2026-09-25T12:33:02Z', '028'),
    hecho('op.acc.3', 'collector_run', '2026-09-25T12:33:03Z', '028'),
  ];

  comprueba(
    'con el latido de hace 23 h no hay nada que marcar',
    findStaleCollector('op.acc.3', pasada, tras(23, '2026-09-25T12:33:03Z')) === undefined
  );
  comprueba(
    'justo en 24 h todavía cuenta como vivo',
    findStaleCollector('op.acc.3', pasada, tras(24, '2026-09-25T12:33:03Z')) === undefined
  );

  const viejo = findStaleCollector('op.acc.3', pasada, new Date('2026-09-27T03:49:49Z'));

  comprueba('con el latido del 25/09 a fecha del 27/09, sin renovar', Boolean(viejo));
  comprueba('la referencia es el latido', viejo?.reference === 'collector_run', viejo?.reference);
  comprueba('desde el instante del último latido', viejo?.since === '2026-09-25T12:33:03.000Z', viejo?.since);
  comprueba(
    'motivo «sin datos del recolector desde <fecha UTC>»',
    /sin datos del recolector desde 2026-09-25 12:33 UTC/i.test(viejo?.reason || ''),
    viejo?.reason
  );

  comprueba(
    'un latido de otro control no renueva este',
    Boolean(
      findStaleCollector(
        'op.acc.3',
        [...pasada, hecho('op.acc.1', 'collector_run', '2026-09-27T03:00:00Z', '028')],
        new Date('2026-09-27T03:49:49Z')
      )
    )
  );

  comprueba(
    'un latido POSTERIOR a `now` no existía en ese instante',
    Boolean(
      findStaleCollector(
        'op.acc.3',
        [...pasada, hecho('op.acc.3', 'collector_run', '2026-09-28T10:00:00Z', '028')],
        new Date('2026-09-27T03:49:49Z')
      )
    )
  );

  const huerfano = [hecho('op.acc.3', 'account_action', '2026-09-25T12:33:02Z', '028')];
  const huerfanoViejo = findStaleCollector('op.acc.3', huerfano, new Date('2026-09-27T03:49:49Z'));

  comprueba('hechos sin latido y de hace más de 24 h: sin renovar', Boolean(huerfanoViejo));
  comprueba('con el último hecho como referencia', huerfanoViejo?.reference === 'fact', huerfanoViejo?.reference);
  comprueba(
    'y el mismo motivo, con la fecha del hecho',
    /sin datos del recolector desde 2026-09-25 12:33 UTC/i.test(huerfanoViejo?.reason || ''),
    huerfanoViejo?.reason
  );
  comprueba(
    'hechos sin latido pero recientes: se juzgan',
    findStaleCollector('op.acc.3', huerfano, tras(2, '2026-09-25T12:33:02Z')) === undefined
  );
  comprueba(
    'sin hechos ni latido no decide nada: ya es «no ha llegado nada»',
    findStaleCollector('op.acc.3', [], new Date('2026-09-27T03:49:49Z')) === undefined
  );
}

// --- 2. con el motor entero ----------------------------------------------

const EVENTOS_024 = indexa(WAZUH_REAL);

bloque('2. op.exp.1 en wazuh-real: la misma pasada, fresca y 25 h después');

{
  const fresco = opExp1De(EVENTOS_024, '024', [WAZUH], tras(1));
  const viejo = opExp1De(EVENTOS_024, '024', [WAZUH], tras(25));

  comprueba('con la pasada de hace 1 h, CUMPLE', fresco?.status === 'CUMPLE', `${fresco?.score} ${fresco?.status}`);
  comprueba('con la misma pasada 25 h después, NO_CUMPLE', viejo?.status === 'NO_CUMPLE', `${viejo?.score} ${viejo?.status}`);
  comprueba('y al 0 %', viejo?.score === 0, viejo?.score);

  const aplicables = viejo?.evidences.filter(e => e.status !== 'NO_APLICA') || [];

  comprueba(
    'todas las evidencias que aplican, NO_EVALUABLE',
    aplicables.length > 0 && aplicables.every(e => e.status === 'NO_EVALUABLE'),
    aplicables.map(e => `${e.id}:${e.status}`).join(' ')
  );
  comprueba(
    'con el motivo en la evidencia',
    aplicables.every(e => e.observations.some(o => o.includes('Sin datos del recolector desde 2026-09-16 16:16 UTC'))),
    aplicables[0]?.observations[0]
  );
  comprueba(
    'ya no apuntan al evento viejo como el que las resuelve',
    aplicables.every(e => !e.resolvedEventId)
  );
  comprueba(
    'pero conservan cuándo llegó el último dato',
    aplicables.some(e => e.lastSeen === '2026-09-16T16:16:13Z')
  );

  const noConformidades = viejo?.nonConformities.filter(nc => nc.requirementId === 'op.exp.1.1') || [];

  comprueba(
    'op.exp.1.1 abre no conformidad NO EVIDENCIADA con causa COLLECTION',
    noConformidades.length === 1 &&
      noConformidades[0].origin === 'NO_EVIDENCIADA' &&
      noConformidades[0].cause === 'COLLECTION',
    JSON.stringify(noConformidades.map(nc => [nc.origin, nc.cause]))
  );
  comprueba(
    'y la tarjeta cita el motivo',
    /Sin datos del recolector desde 2026-09-16 16:16 UTC/.test(noConformidades[0]?.finding || ''),
    noConformidades[0]?.finding
  );

  const noAplicanAntes = fresco?.requirements.filter(r => r.status === 'NO_APLICA').map(r => r.id).join(',');
  const noAplicanDespues = viejo?.requirements.filter(r => r.status === 'NO_APLICA').map(r => r.id).join(',');

  comprueba(
    'lo que no aplica sigue sin aplicar: el denominador no cambia',
    noAplicanAntes === noAplicanDespues && fresco?.applicableRequirements === viejo?.applicableRequirements,
    `${noAplicanAntes} / ${noAplicanDespues}`
  );
  comprueba(
    'los hechos viejos siguen en la trazabilidad',
    (viejo?.traceability || []).some(t => t.source === 'WAZUH' && t.timestamp === '2026-09-16T16:16:13Z')
  );

  // Otro control de la misma máquina con latido fresco no se ve afectado.
  const opAcc1 = getENSComplianceState(
    NIVEL,
    [...EVENTOS_024, hecho('op.acc.1', 'collector_run', tras(24.5).toISOString())],
    '024',
    [WAZUH],
    tras(25)
  ).results.find(r => r.control.id === 'op.acc.1');

  comprueba(
    'el umbral es POR CONTROL: op.acc.1 con latido fresco no lleva el motivo',
    !(opAcc1?.evidences || []).some(e => e.observations.some(o => o.includes('Sin datos del recolector')))
  );
}

// --- 3. consolidado -----------------------------------------------------------

bloque('3. El consolidado no sale CUMPLE con una fila sin renovar');

{
  // La misma pasada en las dos máquinas, pero el LDAP dejó de enviar 25 h antes.
  const ldap = indexa(
    WAZUH_REAL.map(linea => linea.replace(/2026-09-16T16:16:13Z/g, '2026-09-15T16:00:00Z')),
    { id: '028', name: 'zimbraHldap' }
  );
  const ahora = tras(1);
  const conjunto = opExp1De([...EVENTOS_024, ...ldap], undefined, [WAZUH, LDAP], ahora);
  const soloWazuh = opExp1De([...EVENTOS_024, ...ldap], '024', [WAZUH, LDAP], ahora);
  const soloLdap = opExp1De([...EVENTOS_024, ...ldap], '028', [WAZUH, LDAP], ahora);

  comprueba('la fila fresca CUMPLE', soloWazuh?.status === 'CUMPLE', soloWazuh?.status);
  comprueba('la fila sin renovar NO_CUMPLE', soloLdap?.status === 'NO_CUMPLE', soloLdap?.status);
  comprueba('el conjunto no es CUMPLE', conjunto?.status !== 'CUMPLE', `${conjunto?.score} ${conjunto?.status}`);

  const detalle = getENSComplianceResultByControl('op.exp.1', NIVEL, [...EVENTOS_024, ...ldap], undefined, [WAZUH, LDAP], ahora);

  comprueba(
    'y el detalle del control dice lo mismo que el panel',
    detalle?.status === conjunto?.status && detalle?.score === conjunto?.score,
    `${detalle?.score} ${detalle?.status}`
  );
}

// --- 4. la fila del manager ---------------------------------------------------

bloque('4. La fila del manager (000) sigue la misma regla');

{
  const latidoManager = hecho('op.exp.7', 'collector_run', '2026-09-26T03:00:00Z', '000');
  const vista = (ahora: Date) =>
    getENSComplianceState(NIVEL, [latidoManager], '000', [WAZUH, MANAGER], ahora).results.find(
      r => r.control.id === 'op.exp.7'
    );

  const viejo = vista(new Date('2026-09-27T04:00:00Z'));
  const fresco = vista(new Date('2026-09-26T04:00:00Z'));
  const marcadas = (r: typeof viejo) =>
    (r?.evidences || []).filter(e => e.observations.some(o => o.includes('Sin datos del recolector desde 2026-09-26 03:00 UTC')));

  comprueba(
    'op.exp.7 con el latido de hace 25 h: todas sus evidencias sin renovar',
    Boolean(viejo) &&
      marcadas(viejo).length === (viejo?.evidences || []).filter(e => e.status !== 'NO_APLICA').length &&
      marcadas(viejo).every(e => e.status === 'NO_EVALUABLE'),
    `${marcadas(viejo).length} de ${viejo?.evidences.length}`
  );
  comprueba('ningún requisito CUMPLE', !(viejo?.requirements || []).some(r => r.status === 'CUMPLE'));
  comprueba('con el latido de hace 1 h, sin el motivo', marcadas(fresco).length === 0);
}

// --- 5. la serie diaria ---------------------------------------------------------

bloque('5. La serie diaria mide el umbral contra el `now` de cada punto');

{
  // La pasada es del 16 a las 16:16Z y hoy es el 18 a las 12:00Z. El punto del
  // 16 (fin del día) ve la pasada con horas; el del 17 y el de hoy, con más de 24.
  const serie = buildENSControlComplianceTimeline('op.exp.1', NIVEL, EVENTOS_024, {
    agentId: '024',
    scopeAgents: [WAZUH],
    days: 3,
    now: new Date('2026-09-18T12:00:00Z'),
  });

  const porDia = serie.map(p => `${p.label}:${p.status}`).join(' ');

  comprueba('tres puntos', serie.length === 3, porDia);
  comprueba('el día de la pasada, CUMPLE', serie[0]?.status === 'CUMPLE', porDia);
  comprueba('el día siguiente, ya sin renovar', serie[1]?.status === 'NO_CUMPLE', porDia);
  comprueba('y hoy, igual que el panel', serie[2]?.status === 'NO_CUMPLE' && serie[2]?.isCurrent, porDia);
}

// -----------------------------------------------------------------------------

console.log(fallos.length ? `\n${fallos.length} FALLOS: ${fallos.join('; ')}` : '\nTodo OK');

if (fallos.length) {
  process.exit(1);
}
