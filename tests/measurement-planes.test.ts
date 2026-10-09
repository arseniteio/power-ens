/**
 * Planos de medida: el manager (000) en el alcance, y cada fila con lo suyo.
 *
 *     npx tsx tests/measurement-planes.test.ts
 *
 * El alcance ENS se resuelve por el grupo `ens`, y el manager no puede estar en
 * un grupo. op.exp.7, op.exp.9, op.mon.1 y op.mon.2 se miden SOLO en el manager y op.exp.8 en los
 * dos planos, así que el catálogo declara `measurementPlanes` y:
 *
 *   - el manager entra en el alcance cuando algún control ACTIVE lo pide;
 *   - su fila evalúa solo los controles de plano `manager`, y la de cualquier
 *     otra máquina solo los de plano `agent`;
 *   - en la vista de una máquina, los de solo manager salen con el resultado
 *     del manager.
 *
 * Qué se prueba:
 *   1. El alcance: el manager entra, marcado, en los tres modos; sin ningún
 *      control de plano `manager` ACTIVE, no entra (ni aunque el inventario lo
 *      traiga). La consulta de la vista de una máquina trae también al manager.
 *   2. Con el manager en el alcance y hechos solo de agentes, los 14 controles
 *      de plano `agent` salen IDÉNTICOS a hoy sin manager (se compara el
 *      resultado entero, control a control, consolidado y por fila).
 *   3. op.exp.7, op.exp.9, op.mon.1 y op.mon.2 se evalúan en la fila 000 y no aparecen en las de
 *      agente; en la vista de un agente salen con el resultado del manager.
 *   4. op.exp.8 aparece en las dos filas y el consolidado combina ambas.
 *   5. La serie diaria (panel y control) aplica la misma regla.
 *
 * Se prueba el MOTOR de verdad. Arrastra `kibana-services`, que solo existe en
 * el árbol del plugin `main` de Wazuh; aquí se sustituye por un módulo vacío
 * antes de cargarlo, igual que en `traceability-level.test.ts`.
 */
import { ENSCatalog } from '../public/ens/catalog';
import type { ENSControlDefinition } from '../public/ens/catalog/types';
import { ensConfigurationRepository } from '../public/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../public/ens/configuration/data/default-configuration';
import { buildENSScopeAgentQueryFilter } from '../public/ens/core/scope/engine';
import {
  ENS_MANAGER_AGENT_ID,
  getControlMeasurementPlanes,
} from '../public/ens/core/scope/measurement-planes';
import {
  getActiveENSScopeAgents,
  hydrateENSScope,
  resolveENSScopeAgents,
} from '../public/ens/core/scope/runtime';
import type { ENSAgentScope } from '../public/ens/core/scope/types';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';
import type {
  ENSConfigurationScope,
  ENSConfigurationVersion,
} from '../public/ens/configuration/types';

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
} = require('../public/ens/core/ens-engine') as typeof import('../public/ens/core/ens-engine');
const { buildENSComplianceTimeline } = require('../public/ens/core/timeline/compliance-timeline') as typeof import('../public/ens/core/timeline/compliance-timeline');
const { buildENSControlComplianceTimeline } = require('../public/ens/core/timeline/control-timeline') as typeof import('../public/ens/core/timeline/control-timeline');

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

const AHORA = new Date('2026-09-26T12:00:00Z');
const NIVEL = 'MEDIO';

ensConfigurationRepository.replaceActive({
  ...defaultENSConfigurationTemplate,
  global: {
    ...defaultENSConfigurationTemplate.global,
    clientName: 'Cliente de prueba',
    organization: 'Organización de prueba',
    scope: 'Laboratorio',
    ensLevel: NIVEL,
  } as ENSConfigurationVersion['global'],
  // mp.info.6 solo se mide en las máquinas que declara su P-04 (ver
  // `mp-info-6-judgment.test.ts`). Aquí se declaran las dos del alcance, para
  // que sus filas midan los 15 controles de plano agent y lo que se pruebe
  // sea solo el plano.
  controls: defaultENSConfigurationTemplate.controls.map(control =>
    control.controlId !== 'mp.info.6'
      ? control
      : {
          ...control,
          parameters: control.parameters.map(parameter =>
            parameter.id === 'P-04'
              ? { ...parameter, value: ['wazuh-real', 'wazuh-fake'] }
              : parameter
          ),
        }
  ),
});

const PLANO_AGENTE = [
  'mp.info.6',
  'op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4', 'op.acc.5', 'op.acc.6',
  'op.exp.1', 'op.exp.2', 'op.exp.3', 'op.exp.4', 'op.exp.5', 'op.exp.6',
  'op.exp.10',
];
const SOLO_MANAGER = ['op.exp.7', 'op.exp.9', 'op.mon.1', 'op.mon.2'];
const DOBLE_PLANO = ['op.exp.8'];

const AGENTES: ENSAgentScope[] = [
  { id: '001', name: 'wazuh-real', groups: ['default', 'ens'] },
  { id: '002', name: 'wazuh-fake', groups: ['ens'] },
];
const MANAGER: ENSAgentScope = { id: '000', name: 'Wazuh-4', groups: [], isManager: true };
const CON_MANAGER = [...AGENTES, MANAGER];

let contador = 0;

const hecho = (
  agentId: string,
  controlId: string,
  eventType: string,
  extra: Partial<ENSNormalizedEvent> = {}
): ENSNormalizedEvent => {
  contador += 1;

  return {
    id: `hecho-${contador}`,
    agentId,
    agentName: [...AGENTES, MANAGER].find(a => a.id === agentId)?.name,
    controlId,
    eventType,
    sourceType: 'WAZUH_ALERT',
    timestamp: '2026-09-26T11:00:00Z',
    tool: 'ENSFácil test',
    ...extra,
  };
};

// Hechos SOLO de agentes: los de mp.info.6 (su contrato de hechos) y el latido
// de op.exp.8 de un servidor corriente.
const COPIA = { origen: 'pbs', objeto: 'fichero', ultima_correcta: '2026-09-26T02:00:00Z', ultima_fallida: '-', resultado_ultima: 'ok' };

const DE_AGENTES: ENSNormalizedEvent[] = [
  hecho('001', 'mp.info.6', 'backup_run', { evidenceId: 'EV-01', ruleId: '106601', attributes: COPIA }),
  hecho('001', 'mp.info.6', 'restore_test', {
    evidenceId: 'EV-05',
    ruleId: '106606',
    attributes: { origen: 'pbs', objeto: 'fichero', fecha: '2026-09-25T03:00:00Z', resultado: 'ok', coincide: 'si', limpieza: 'ok' },
  }),
  hecho('002', 'mp.info.6', 'backup_run', { evidenceId: 'EV-01', ruleId: '106601', attributes: COPIA }),
  hecho('001', 'op.exp.8', 'collector_run', {
    attributes: { resultado: 'completada', tipo_servidor: 'linux', evidencias_cubiertas: 'EV-01,EV-02' },
  }),
];

// Y los del manager: su latido de op.exp.8 (fila central) y el de op.exp.7.
const DEL_MANAGER: ENSNormalizedEvent[] = [
  hecho('000', 'op.exp.8', 'collector_run', {
    attributes: { resultado: 'completada', tipo_servidor: 'manager', evidencias_cubiertas: 'EV-04,EV-05' },
  }),
  hecho('000', 'op.exp.7', 'collector_run', {
    attributes: { resultado: 'completada', perfil: 'manager', evidencias_cubiertas: 'EV-01' },
  }),
];

const TODOS = [...DE_AGENTES, ...DEL_MANAGER];

type Resultado = { control: { id: string } };

// El resultado entero, sin el instante de cálculo (`evaluatedAt`), que es lo
// único que cambia entre dos evaluaciones idénticas.
const huella = (valor: unknown): string =>
  JSON.stringify(valor, (clave, v) => (clave === 'evaluatedAt' ? undefined : v));

const porControl = <T extends Resultado>(resultados: T[]) =>
  new Map(resultados.map(r => [r.control.id, r]));

const ids = (resultados: Resultado[]) => resultados.map(r => r.control.id);

// ---------------------------------------------------------------------------

bloque('0. El catálogo declara los planos');

comprueba(
  'op.exp.7, op.exp.9, op.mon.1 y op.mon.2 se miden solo en el manager',
  SOLO_MANAGER.every(id => huella(getControlMeasurementPlanes(ENSCatalog.find(c => c.id === id)!)) === '["manager"]')
);
comprueba(
  'op.exp.8 se mide en los dos planos',
  huella(getControlMeasurementPlanes(ENSCatalog.find(c => c.id === 'op.exp.8')!)) === '["agent","manager"]'
);
comprueba(
  'los 14 de siempre no declaran nada y valen `agent`',
  PLANO_AGENTE.every(id => {
    const control = ENSCatalog.find(c => c.id === id)!;

    return control.measurementPlanes === undefined && huella(getControlMeasurementPlanes(control)) === '["agent"]';
  })
);
comprueba(
  'el catálogo son esos 19',
  ENSCatalog.length === PLANO_AGENTE.length + SOLO_MANAGER.length + DOBLE_PLANO.length
);

// ---------------------------------------------------------------------------

bloque('1. El alcance');

const INVENTARIO: ENSAgentScope[] = [
  ...AGENTES,
  { id: '003', name: 'fuera', groups: ['default'] },
];

const alcance = (scope: Partial<ENSConfigurationScope>): ENSConfigurationScope => ({
  mode: 'group',
  agentIds: [],
  groupIds: ['ens'],
  ...scope,
} as ENSConfigurationScope);

const MODOS: Array<[string, ENSConfigurationScope]> = [
  ['global', alcance({ mode: 'global', groupIds: [] })],
  ['grupo', alcance({ mode: 'group' })],
  ['agente', alcance({ mode: 'agent', agentIds: ['001'], groupIds: [] })],
];

for (const [modo, scope] of MODOS) {
  const agentes = resolveENSScopeAgents(INVENTARIO, scope);
  const manager = agentes.find(a => a.id === ENS_MANAGER_AGENT_ID);

  comprueba(`modo ${modo} · el manager entra, marcado, sin estar en ningún grupo`, Boolean(manager?.isManager), huella(agentes));
  comprueba(`modo ${modo} · sin el inventario, se nombra igualmente`, Boolean(manager?.name));
}

// El inventario puede traer al manager (depende de la consulta de agentes):
// entonces se usa su nombre y no se duplica.
{
  const agentes = resolveENSScopeAgents(
    [...INVENTARIO, { id: '000', name: 'Wazuh-4', groups: [] }],
    alcance({ mode: 'global', groupIds: [] })
  );

  comprueba(
    'con el 000 en el inventario, sale una vez y con su nombre',
    agentes.filter(a => a.id === '000').length === 1 && agentes.find(a => a.id === '000')?.name === 'Wazuh-4',
    huella(agentes)
  );
}

// Sin ningún control de plano `manager` ACTIVE, el manager no entra: ni por el
// plano, ni porque el modo global lo recoja del inventario.
{
  const sinManagerActivo: ENSControlDefinition[] = ENSCatalog.map(control =>
    getControlMeasurementPlanes(control).includes('manager')
      ? { ...control, status: 'DRAFT' }
      : control
  );

  for (const [modo, scope] of MODOS) {
    const agentes = resolveENSScopeAgents(
      [...INVENTARIO, { id: '000', name: 'Wazuh-4', groups: [] }],
      scope,
      sinManagerActivo
    );

    comprueba(
      `modo ${modo} · sin plano manager ACTIVE, el manager no entra`,
      !agentes.some(a => a.id === '000'),
      huella(agentes)
    );
  }

  comprueba(
    'y el resto del alcance es el de siempre',
    huella(resolveENSScopeAgents(INVENTARIO, alcance({ mode: 'group' }), sinManagerActivo)) === huella(AGENTES)
  );
}

// La hidratación real: lo que leen las seis pantallas.
hydrateENSScope(alcance({ mode: 'group' }), async () => INVENTARIO).then(() => {
  const activos = getActiveENSScopeAgents();

  comprueba('hidratado, el manager está en los agentes activos', activos.some(a => a.id === '000' && a.isManager));

  const filtro = buildENSScopeAgentQueryFilter(activos) as { terms?: { 'agent.id': string[] } };

  comprueba(
    'la consulta del conjunto incluye el 000',
    Boolean(filtro.terms?.['agent.id'].includes('000')),
    huella(filtro)
  );

  const deUno = buildENSScopeAgentQueryFilter(activos, '001') as { terms?: { 'agent.id': string[] } };

  comprueba(
    'la vista de una máquina trae también los hechos del manager',
    huella(deUno.terms?.['agent.id']) === '["001","000"]',
    huella(deUno)
  );

  const delManager = buildENSScopeAgentQueryFilter(activos, '000') as { match_phrase?: { 'agent.id': string } };

  comprueba(
    'la vista del manager trae solo los suyos',
    delManager.match_phrase?.['agent.id'] === '000',
    huella(delManager)
  );

  comprueba(
    'sin el manager en el alcance, la vista de una máquina es la de siempre',
    huella(buildENSScopeAgentQueryFilter(AGENTES, '001')) === huella({ match_phrase: { 'agent.id': '001' } })
  );

  resto();
}).catch(error => {
  console.log(error);
  process.exit(1);
});

const resto = (): void => {
  // -------------------------------------------------------------------------

  bloque('2. Con el manager y hechos solo de agentes, los 14 de plano agent no cambian');

  const hoy = getENSComplianceState(NIVEL, DE_AGENTES, undefined, AGENTES, AHORA);
  const ahora = getENSComplianceState(NIVEL, DE_AGENTES, undefined, CON_MANAGER, AHORA);

  const cambiados = PLANO_AGENTE.filter(
    id => huella(porControl(hoy.results).get(id)) !== huella(porControl(ahora.results).get(id))
  );

  comprueba('consolidado · ninguno de los 14 cambia', cambiados.length === 0, cambiados.join(', '));
  comprueba(
    'consolidado · están los 19, en el orden del catálogo',
    huella(ids(ahora.results)) === huella(ENSCatalog.map(c => c.id)),
    ids(ahora.results).join(', ')
  );

  for (const agente of AGENTES) {
    const filaHoy = hoy.agents.find(a => a.agentId === agente.id)!;
    const filaAhora = ahora.agents.find(a => a.agentId === agente.id)!;
    const distintos = PLANO_AGENTE.filter(
      id => huella(porControl(filaHoy.results).get(id)) !== huella(porControl(filaAhora.results).get(id))
    );

    comprueba(`fila ${agente.id} · ninguno de los 14 cambia`, distintos.length === 0, distintos.join(', '));

    const vistaHoy = getENSComplianceState(NIVEL, DE_AGENTES, agente.id, AGENTES, AHORA);
    const vistaAhora = getENSComplianceState(NIVEL, DE_AGENTES, agente.id, CON_MANAGER, AHORA);
    const distintosVista = PLANO_AGENTE.filter(
      id => huella(porControl(vistaHoy.results).get(id)) !== huella(porControl(vistaAhora.results).get(id))
    );

    comprueba(`vista de ${agente.id} · ninguno de los 14 cambia`, distintosVista.length === 0, distintosVista.join(', '));
  }

  const porControlDistintos = PLANO_AGENTE.filter(
    id =>
      huella(getENSComplianceResultByControl(id, NIVEL, DE_AGENTES, undefined, AGENTES, AHORA)) !==
      huella(getENSComplianceResultByControl(id, NIVEL, DE_AGENTES, undefined, CON_MANAGER, AHORA))
  );

  comprueba('control a control (detalle) · ninguno de los 14 cambia', porControlDistintos.length === 0, porControlDistintos.join(', '));

  comprueba(
    'el manager es una fila más y solo trae sus 5 controles',
    huella(ids(ahora.agents.find(a => a.agentId === '000')!.results)) === '["op.exp.7","op.exp.8","op.exp.9","op.mon.1","op.mon.2"]',
    ids(ahora.agents.find(a => a.agentId === '000')?.results || []).join(', ')
  );
  comprueba(
    'y su resumen cuenta solo esos 5',
    ahora.agents.find(a => a.agentId === '000')!.summary.totalControls === 5
  );
  comprueba(
    'el resumen de una fila de agente no cuenta los de solo manager',
    ahora.agents.filter(a => a.agentId !== '000').every(a => a.summary.totalControls === 15)
  );

  // -------------------------------------------------------------------------

  bloque('3. op.exp.7, op.exp.9, op.mon.1 y op.mon.2: fila del manager; en la vista de un agente, su resultado');

  const estado = getENSComplianceState(NIVEL, TODOS, undefined, CON_MANAGER, AHORA);
  const filaManager = estado.agents.find(a => a.agentId === '000')!;

  for (const id of SOLO_MANAGER) {
    comprueba(`${id} · se evalúa en la fila 000`, porControl(filaManager.results).has(id));
    comprueba(
      `${id} · no aparece en ninguna fila de agente`,
      estado.agents.filter(a => a.agentId !== '000').every(a => !porControl(a.results).has(id))
    );

    const delManager = porControl(filaManager.results).get(id);
    const consolidado = porControl(estado.results).get(id);

    comprueba(
      `${id} · el consolidado es el de la fila del manager, sobre una sola máquina`,
      consolidado?.status === delManager?.status &&
        huella(consolidado?.consolidatedAgents?.map(a => a.agentId)) === '["000"]',
      huella(consolidado?.consolidatedAgents)
    );

    for (const agente of AGENTES) {
      const vista = getENSComplianceState(NIVEL, TODOS, agente.id, CON_MANAGER, AHORA);

      comprueba(
        `${id} · en la vista de ${agente.name}, el resultado del manager`,
        huella(porControl(vista.results).get(id)) === huella(delManager),
        porControl(vista.results).get(id)?.status
      );
      comprueba(
        `${id} · y lo mismo en el detalle del control`,
        huella(getENSComplianceResultByControl(id, NIVEL, TODOS, agente.id, CON_MANAGER, AHORA)) === huella(delManager)
      );
    }
  }

  // Que el resultado del manager no es uno cualquiera: sin sus hechos, op.exp.7
  // no sale igual. Si saliera igual, la prueba de arriba pasaría con un
  // resultado vacío.
  {
    const sinHechos = getENSComplianceState(NIVEL, DE_AGENTES, '001', CON_MANAGER, AHORA);
    const conHechos = getENSComplianceState(NIVEL, TODOS, '001', CON_MANAGER, AHORA);

    comprueba(
      'op.exp.7 · en la vista de un agente, los hechos del manager cambian el resultado',
      huella(porControl(sinHechos.results).get('op.exp.7')) !== huella(porControl(conHechos.results).get('op.exp.7'))
    );
  }

  {
    const vista = getENSComplianceState(NIVEL, TODOS, '001', CON_MANAGER, AHORA);

    comprueba(
      'vista de un agente · están los 19, en el orden del catálogo',
      huella(ids(vista.results)) === huella(ENSCatalog.map(c => c.id)),
      ids(vista.results).join(', ')
    );
  }

  // Seleccionado el propio manager: su fila, con sus 5 controles; los de plano
  // agent no tienen resultado en ella.
  {
    const vista = getENSComplianceState(NIVEL, TODOS, '000', CON_MANAGER, AHORA);

    comprueba(
      'vista del manager · sus 5 controles',
      huella(ids(vista.results)) === '["op.exp.7","op.exp.8","op.exp.9","op.mon.1","op.mon.2"]',
      ids(vista.results).join(', ')
    );
    comprueba(
      'vista del manager · un control de plano agent no tiene resultado',
      getENSComplianceResultByControl('op.acc.1', NIVEL, TODOS, '000', CON_MANAGER, AHORA) === undefined
    );
  }

  // -------------------------------------------------------------------------

  bloque('4. op.exp.8: en las dos filas, y el consolidado las combina');

  {
    const filas = estado.agents.filter(a => porControl(a.results).has('op.exp.8')).map(a => a.agentId);

    comprueba('op.exp.8 · aparece en la fila del manager y en las de agente', huella(filas) === '["000","001","002"]', huella(filas));

    const consolidado = porControl(estado.results).get('op.exp.8')!;

    comprueba(
      'op.exp.8 · el consolidado resume las tres máquinas',
      huella(consolidado.consolidatedAgents?.map(a => a.agentId)) === '["000","001","002"]',
      huella(consolidado.consolidatedAgents)
    );
    comprueba(
      'op.exp.8 · sus requisitos aplicables son la suma de las filas',
      consolidado.applicableRequirements ===
        estado.agents.reduce((suma, a) => suma + (porControl(a.results).get('op.exp.8')?.applicableRequirements || 0), 0)
    );
    comprueba(
      'op.exp.8 · el detalle del control da el mismo consolidado',
      huella(getENSComplianceResultByControl('op.exp.8', NIVEL, TODOS, undefined, CON_MANAGER, AHORA)) === huella(consolidado)
    );

    const vista = getENSComplianceState(NIVEL, TODOS, '001', CON_MANAGER, AHORA);

    comprueba(
      'op.exp.8 · en la vista de un agente, la fila de ESE agente',
      huella(porControl(vista.results).get('op.exp.8')) ===
        huella(porControl(estado.agents.find(a => a.agentId === '001')!.results).get('op.exp.8'))
    );
  }

  // -------------------------------------------------------------------------

  bloque('5. La serie diaria aplica la misma regla');

  {
    const serie = buildENSComplianceTimeline(NIVEL, TODOS, { scopeAgents: CON_MANAGER, now: AHORA, days: 2 });
    const ultimo = serie[serie.length - 1];

    comprueba(
      'panel · el último punto es el número del panel con el manager',
      ultimo?.isCurrent === true && ultimo.score === estado.controlSummary.scoreAverage,
      `${ultimo?.score} frente a ${estado.controlSummary.scoreAverage}`
    );

    const serieAgente = buildENSComplianceTimeline(NIVEL, TODOS, { agentId: '001', scopeAgents: CON_MANAGER, now: AHORA, days: 2 });
    const vista = getENSComplianceState(NIVEL, TODOS, '001', CON_MANAGER, AHORA);

    comprueba(
      'panel de un agente · el último punto es el de su vista',
      serieAgente[serieAgente.length - 1]?.score === vista.controlSummary.scoreAverage
    );

    const serieControl = buildENSControlComplianceTimeline('op.exp.7', NIVEL, TODOS, {
      agentId: '001',
      scopeAgents: CON_MANAGER,
      now: AHORA,
      days: 2,
    });
    const delManager = porControl(filaManager.results).get('op.exp.7');

    comprueba(
      'detalle de op.exp.7 en la vista de un agente · el último punto es el del manager',
      serieControl[serieControl.length - 1]?.status === delManager?.status &&
        serieControl[serieControl.length - 1]?.score === delManager?.score,
      huella(serieControl[serieControl.length - 1])
    );
  }

  // -------------------------------------------------------------------------

  ensConfigurationRepository.reset();

  if (fallos.length) {
    console.log(`\n${fallos.length} comprobación(es) fallan:`);
    fallos.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\nTodo correcto.');
};
