/**
 * op.exp.9 · el juicio del registro de la gestión de incidentes.
 *
 *     npx tsx tests/op-exp-9-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. La policy de op.exp.9 correlaciona por EXPEDIENTE
 * (`incidente_id`) lo que la organización registra en los TSV del manager con
 * lo que el manager conserva y observa, cosa que ninguna primitiva expresa.
 * Cada caso mueve UN eje y lleva al lado la REVERSIÓN que demuestra que no
 * pasaría siempre: el MISMO evento del recolector con otro parámetro, otra fila
 * del registro u otro `now` cambia el veredicto.
 *
 * Los eventos se construyen como alertas de `alerts.json` del manager
 * (agent.id=000) y pasan por el normalizador real: los números llegan como
 * texto y `evidence_id` con comas se parte en uno por evidencia, igual que en
 * producción.
 */
import { opExp9PolicyDefinition } from '../dashboard/ens/core/policy-runtime/policies/op-exp-9.policy';
import { buildPolicyContext } from '../dashboard/ens/core/policy-runtime/policy-context-builder';
import { opExp9CatalogDefinition } from '../dashboard/ens/catalog/op-exp-9';
import { opExp9Configuration } from '../dashboard/ens/configuration/data/op-exp-9-parameters';
import { normalizeWazuhAlerts } from '../dashboard/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
import { getEvidenceDefinitions } from '../dashboard/ens/core/evidence/registry';
import { keepLatestRunStateFacts } from '../dashboard/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../dashboard/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../dashboard/ens/core/evaluation/requirement/requirement-evaluator';
import type { ENSControlConfiguration } from '../dashboard/ens/configuration/types';
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

const AHORA = new Date('2026-09-26T12:00:00Z');
const hace = (horas: number): string =>
  new Date(AHORA.getTime() - horas * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let contador = 0;

const alerta = (data: Record<string, unknown>, ts = hace(1)) => {
  contador += 1;

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts,
      agent: { id: '000', name: 'Wazuh-4' },
      rule: { id: '111000', description: 'op.exp.9' },
      location: '/var/log/ensfacil/op_exp_9.json',
      data: Object.fromEntries(
        Object.entries({ ensfacil: 'op.exp.9', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

const TODAS = 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08,EV-09';

const latido = (ts = hace(0.5), cubiertas = TODAS) =>
  alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: cubiertas, perfil: 'manager' }, ts);

const leido = (registro: string, extra: Record<string, unknown> = {}, ts = hace(0.6)) =>
  alerta({
    event: 'register_read',
    evidence_id: TODAS,
    registro,
    fichero: `/etc/ensfacil/${registro}.tsv`,
    presente: 'si',
    legible: 'si',
    formato: 'ok',
    filas_validas: 1,
    filas_invalidas: 0,
    ...extra,
  }, ts);

const registros = (extra: Record<string, Record<string, unknown>> = {}, ts = hace(0.6)) =>
  ['incidentes', 'actuaciones', 'custodia', 'custodia_accesos'].map(r => leido(r, extra[r] || {}, ts));

const fila = (id: string, fase: string, fecha: string, extra: Record<string, unknown> = {}, ts = hace(0.6)) =>
  alerta({
    event: 'incident_report_registered',
    evidence_id: 'EV-02,EV-09',
    incidente_id: id,
    fase,
    fecha,
    severidad: 'alta',
    sistemas: 'wazuh-real',
    clasificacion: 'acceso-no-autorizado',
    escalado_a: '-',
    notificado_a: '-',
    datos_personales: 'no',
    notificacion_ccn_cert: '-',
    relevancia_juridica: 'no',
    medidas_mejora: '-',
    referencia: `https://expedientes.invalido/${id}`,
    ...extra,
  }, ts);

const ventana = (id: string, extra: Record<string, unknown> = {}, ts = hace(0.6)) =>
  alerta({
    event: 'incident_source_events_available',
    evidence_id: 'EV-01,EV-07',
    incidente_id: id,
    sistema: 'wazuh-real',
    agente_id: '024',
    agente_conocido: 'si',
    desde: '2026-09-09T10:00:00Z',
    inicio: '2026-09-10T10:00:00Z',
    hasta: '2026-09-12T10:00:00Z',
    abierto: 'no',
    alertas: 812,
    nivel_max: 12,
    dias: 4,
    dias_sin_archivo: '-',
    dias_alterados: '-',
    dias_sin_suma: '-',
    acciones: 0,
    acciones_emitidas: 0,
    cambios: 0,
    cambios_emitidos: 0,
    ...extra,
  }, ts);

const eventos = (...alertas: ReturnType<typeof alerta>[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alertas);

const BASICOS: Record<string, string[] | string> = {
  'P-01': 'Registro ENSFácil (/etc/ensfacil/incident-register.tsv)',
  'P-02': ['inicial | detección, alcance |', 'intermedio | evolución, medidas | 24', 'final | causa, impacto, cierre |'],
  'P-03': ['logs sellados del período | repositorio-custodia', 'acta de recogida |'],
  'P-04': ['acceso no autorizado por empleado', 'exfiltración'],
  'P-05': ['repositorio-custodia | SHA-256 + sellado de tiempo | solo RSeg'],
  'P-06': ['disciplinaria | 1095', 'contractual | 1825'],
  'P-07': ['alta | 30 | PRO-07', 'critica | 15 | PRO-07'],
  'P-08': '12',
};

const configuracion = (valores: Record<string, string[] | string | undefined>): ENSControlConfiguration => ({
  ...opExp9Configuration,
  parameters: opExp9Configuration.parameters.map(p => {
    const valor = valores[p.id];
    const copia = { ...p };

    // Un parámetro vacío es la clave `value` AUSENTE, nunca null.
    if (valor === undefined) {
      delete copia.value;
    } else {
      copia.value = valor;
    }

    return copia;
  }),
});

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Record<string, string[] | string | undefined> = BASICOS,
  ahora: Date = AHORA
) => {
  const cfg = configuracion(valores);
  const cortados = keepLatestRunStateFacts('op.exp.9', evs, ahora);
  const evidencias = resolveEvidenceForControl('op.exp.9', cortados, '000', 'MEDIO', cfg, ahora);
  const contexto = buildPolicyContext(opExp9CatalogDefinition, cfg, 'MEDIO', cortados, evidencias, ahora);
  const { decisions } = opExp9PolicyDefinition.evaluator!(contexto);
  const principal = (requisito: string) => decisions.find(d => d.requirementId === requisito)!;
  const de = (id: string) => decisions.find(d => d.trace.ruleId.endsWith(`/${id}`))!;
  const puente = applyPolicyDecisionsToEvidences(evidencias, decisions, opExp9CatalogDefinition.requirements);
  const requisito = (id: string) =>
    evaluateRequirement(
      opExp9CatalogDefinition.requirements.find(r => r.id === id)!,
      'MEDIO',
      puente,
      false,
      decisions,
      opExp9CatalogDefinition.status
    );

  return { decisions, principal, de, puente, requisito };
};

// Un incidente cerrado, bien llevado, de tres días en wazuh-real.
const incidenteCerrado = (id = 'INC-2026-001', extra: Record<string, unknown> = {}) => [
  fila(id, 'inicial', '2026-09-10T10:00:00Z', extra),
  fila(id, 'intermedio', '2026-09-11T10:00:00Z', extra),
  fila(id, 'final', '2026-09-12T10:00:00Z', extra),
];

// --- 1. catálogo -----------------------------------------------------------

bloque('1. Catálogo: tres requisitos base, activo, estado por la última pasada');

{
  comprueba('op.exp.9 está ACTIVE', opExp9CatalogDefinition.status === 'ACTIVE');

  comprueba(
    'los tres requisitos aplican en BAJO, MEDIO y ALTO (sin refuerzos)',
    opExp9CatalogDefinition.requirements.every(r => r.applicability.levels.join(',') === 'BAJO,MEDIO,ALTO') &&
      opExp9CatalogDefinition.requirements.length === 3
  );

  const definiciones = getEvidenceDefinitions('op.exp.9');

  comprueba('nueve evidencias en el catálogo', definiciones.length === 9, definiciones.length);

  comprueba(
    'ninguna evidencia lleva `judgment`: las juzga la policy',
    definiciones.every(d => !d.judgment)
  );

  comprueba(
    'toda evidencia con hechos de estado acredita reglas de la banda 111000-111099',
    definiciones.every(d => d.relatedRules.length > 0 && d.relatedRules.every(r => /^1110\d\d$/.test(r)))
  );

  const tablas = ['P-02', 'P-03', 'P-05', 'P-06', 'P-07'];

  comprueba(
    'P-02, P-03, P-05, P-06 y P-07 son tablas con columnas',
    tablas.every(id => {
      const p = opExp9Configuration.parameters.find(x => x.id === id)!;

      return p.type === 'table' && (p.columns || []).length >= 2;
    })
  );

  comprueba(
    'ningún parámetro declara `value` (vacío = clave ausente)',
    opExp9Configuration.parameters.every(p => !Object.prototype.hasOwnProperty.call(p, 'value'))
  );

  comprueba(
    'P-ATT y P-08 son opcionales',
    ['P-ATT', 'P-08'].every(id => opExp9Configuration.parameters.find(p => p.id === id)!.required === false)
  );
}

// --- 2. latido y registro ---------------------------------------------------

bloque('2. Sin latido no se juzga; un registro AUSENTE no es un registro VACÍO');

{
  const sinLatido = evalua(eventos(...registros(), ...incidenteCerrado(), ventana('INC-2026-001')));

  comprueba(
    'sin latido del recolector: los tres requisitos NO_EVALUABLE',
    ['op.exp.9.1', 'op.exp.9.2', 'op.exp.9.3'].every(r => sinLatido.principal(r).status === 'NO_EVALUABLE'),
    sinLatido.principal('op.exp.9.1').reason
  );

  const viejo = evalua(eventos(latido(hace(30)), ...registros({}, hace(30.1)), ...incidenteCerrado()));

  comprueba(
    'latido de hace 30 h: NO_EVALUABLE diciendo que el estado no es el de hoy',
    viejo.de('EV-02').status === 'NO_EVALUABLE' && /no describe el estado de hoy/.test(viejo.de('EV-02').reason),
    viejo.de('EV-02').reason
  );

  const ausente = evalua(eventos(latido(), ...registros({ incidentes: { presente: 'no', legible: 'no', formato: '-', filas_validas: 0 } })));

  comprueba(
    'registro ausente: NO_EVALUABLE con causa CONFIGURATION',
    ausente.de('EV-02').status === 'NO_EVALUABLE' && /CONFIGURATION/.test(ausente.de('EV-02').reason),
    ausente.de('EV-02').reason
  );

  const volumen = (porNivel: string, reglas: number) =>
    alerta({ event: 'alert_volume_observed', evidence_id: 'EV-02', desde: '2026-08-27T12:00:00Z', hasta: '2026-09-26T11:00:00Z', dias: 30, por_nivel: porNivel, nivel_detalle: 7, reglas, dias_sin_archivo: '-' }, hace(0.6));

  const regla = (id: string, nivel: number, alertas: number, grupos: string) =>
    alerta({ event: 'alert_rule_volume_observed', evidence_id: 'EV-02', regla: id, nivel, alertas, grupos, descripcion: `regla ${id}`, agentes: 'wazuh-real' }, hace(0.6));

  const vacio = eventos(
    latido(),
    ...registros({ incidentes: { filas_validas: 0 } }),
    volumen('7=40,10=12,12=3,13=1760', 4),
    regla('5712', 7, 40, 'syslog,sshd'),
    regla('23505', 10, 12, 'vulnerability-detector'),
    regla('108130', 12, 3, 'yara,malware'),
    regla('23506', 13, 1760, 'vulnerability-detector')
  );

  const con12 = evalua(vacio);

  comprueba(
    'registro vacío con P-08=12 y sin P-09: cuentan también las 1760 CVE → NO_CUMPLE por 1763',
    con12.de('EV-02').status === 'NO_CUMPLE' && /1763 alertas/.test(con12.de('EV-02').reason),
    con12.de('EV-02').reason
  );

  const sinCve = evalua(vacio, { ...BASICOS, 'P-09': ['vulnerability-detector'] });

  comprueba(
    'excluido vulnerability-detector en P-09: quedan las 3 de YARA → sigue NO_CUMPLE, y el motivo dice qué se excluyó',
    sinCve.de('EV-02').status === 'NO_CUMPLE' && /3 alertas/.test(sinCve.de('EV-02').reason) && /Excluidas por P-09/.test(sinCve.de('EV-02').reason),
    sinCve.de('EV-02').reason
  );

  const incompleto = evalua(eventos(latido(), ...registros({ incidentes: { filas_validas: 0 } }), volumen('12=3', 2), regla('108130', 12, 3, 'yara')));

  comprueba(
    'el recolector declara 2 reglas y llega 1: el contraste no se hace sobre una parte',
    incompleto.de('EV-02').status === 'NO_EVALUABLE'
  );

  comprueba(
    '… y EV-01 NO_EVALUABLE: no hay expediente que examinar',
    con12.de('EV-01').status === 'NO_EVALUABLE'
  );

  const con13 = evalua(vacio, { ...BASICOS, 'P-08': '13', 'P-09': ['vulnerability-detector'] });

  comprueba(
    'REVERSIÓN: el MISMO registro vacío con P-08=13 y las CVE excluidas → EV-02 CUMPLE y op.exp.9.1 CUMPLE',
    con13.de('EV-02').status === 'CUMPLE' && con13.principal('op.exp.9.1').status === 'CUMPLE',
    `${con13.de('EV-02').reason} | ${con13.principal('op.exp.9.1').reason}`
  );

  const sinP08 = evalua(vacio, { ...BASICOS, 'P-08': undefined });

  comprueba(
    'registro vacío sin P-08: NO_EVALUABLE, no hay contra qué contrastar',
    sinP08.de('EV-02').status === 'NO_EVALUABLE' && /P-08/.test(sinP08.de('EV-02').reason)
  );

  const otraHerramienta = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001')), { ...BASICOS, 'P-01': 'TheHive' });

  comprueba(
    'P-01 = TheHive: NO_EVALUABLE diciendo que la integración no existe',
    otraHerramienta.de('EV-02').status === 'NO_EVALUABLE' && /integración con esa herramienta no existe/.test(otraHerramienta.de('EV-02').reason)
  );

  const noCubierta = evalua(eventos(latido(hace(0.5), 'EV-02,EV-09'), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001')));

  comprueba(
    'la última pasada no cubrió EV-01: EV-01 NO_EVALUABLE aunque haya hechos',
    noCubierta.de('EV-01').status === 'NO_EVALUABLE' && /no declara haber leído/.test(noCubierta.de('EV-01').reason)
  );
}

// --- 3. EV-02 ---------------------------------------------------------------

bloque('3. EV-02: las fases de P-02, con la excepción de la duración y del final abierto');

{
  const soloCierre = evalua(eventos(latido(), ...registros(), fila('INC-1', 'inicial', '2026-09-10T10:00:00Z'), fila('INC-1', 'final', '2026-09-13T10:00:00Z'), ventana('INC-1')));

  comprueba(
    'incidente de 3 días sin reporte intermedio (P-02 lo exige desde 24 h): NO_CUMPLE',
    soloCierre.de('EV-02').status === 'NO_CUMPLE' && /INC-1.*intermedio/.test(soloCierre.de('EV-02').reason),
    soloCierre.de('EV-02').reason
  );

  const largo = evalua(
    eventos(latido(), ...registros(), fila('INC-1', 'inicial', '2026-09-10T10:00:00Z'), fila('INC-1', 'final', '2026-09-13T10:00:00Z'), ventana('INC-1')),
    { ...BASICOS, 'P-02': ['inicial | |', 'intermedio | | 100', 'final | |'] }
  );

  comprueba(
    'REVERSIÓN: el MISMO incidente con el intermedio exigible desde 100 h → CUMPLE',
    largo.de('EV-02').status === 'CUMPLE',
    largo.de('EV-02').reason
  );

  const abierto = evalua(eventos(latido(), ...registros(), fila('INC-2', 'inicial', hace(10)), ventana('INC-2')));

  comprueba(
    'incidente abierto hace 10 h, solo con inicial: el final no se exige todavía → CUMPLE',
    abierto.de('EV-02').status === 'CUMPLE',
    abierto.de('EV-02').reason
  );

  const abiertoLargo = evalua(eventos(latido(), ...registros(), fila('INC-2', 'inicial', hace(48)), ventana('INC-2')));

  comprueba(
    'el MISMO abierto hace 48 h: el intermedio ya es exigible → NO_CUMPLE',
    abiertoLargo.de('EV-02').status === 'NO_CUMPLE'
  );

  const sinSeveridad = evalua(eventos(latido(), ...registros(), fila('INC-3', 'inicial', hace(5), { severidad: '-' }), ventana('INC-3')));

  comprueba(
    'reporte inicial sin severidad: NO_CUMPLE por cumplimentación',
    sinSeveridad.de('EV-02').status === 'NO_CUMPLE' && /sin severidad/.test(sinSeveridad.de('EV-02').reason)
  );

  const invalidas = evalua(eventos(latido(), ...registros({ incidentes: { filas_invalidas: 2 } }), ...incidenteCerrado('INC-1'), ventana('INC-1')));

  comprueba(
    'con 2 filas no interpretables un CUMPLE baja a NO_EVALUABLE, nunca a NO_CUMPLE',
    invalidas.de('EV-02').status === 'NO_EVALUABLE' && /no se pudieron interpretar/.test(invalidas.de('EV-02').reason)
  );
}

// --- 4. EV-01 y EV-07 ---------------------------------------------------------

bloque('4. EV-01 y EV-07: los eventos del periodo, en disco y con su suma');

{
  const bien = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001')));

  comprueba('ventana con alertas y todos los días verificados: EV-01 CUMPLE', bien.de('EV-01').status === 'CUMPLE', bien.de('EV-01').reason);

  comprueba(
    'incidente cerrado sin relevancia jurídica: EV-07 CUMPLE, no hay periodo que proteger',
    bien.de('EV-07').status === 'CUMPLE'
  );

  const perdido = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001', { dias_sin_archivo: '2026-09-10' })));

  comprueba(
    'falta el archivo del 10/09: EV-01 NO_CUMPLE nombrando el día',
    perdido.de('EV-01').status === 'NO_CUMPLE' && /2026-09-10/.test(perdido.de('EV-01').reason)
  );

  const alterado = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001', { dias_alterados: '2026-09-11' })));

  comprueba('el archivo del 11/09 no coincide con su suma: NO_CUMPLE', alterado.de('EV-01').status === 'NO_CUMPLE');

  const mudo = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001', { alertas: 0 })));

  comprueba('ninguna alerta del sistema en la ventana: NO_EVALUABLE', mudo.de('EV-01').status === 'NO_EVALUABLE');

  const ajeno = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001', { agente_conocido: 'no', alertas: 0 })));

  comprueba('el sistema no es un agente del manager: NO_EVALUABLE', ajeno.de('EV-01').status === 'NO_EVALUABLE' && /no es un agente/.test(ajeno.de('EV-01').reason));

  const abierto = evalua(eventos(latido(), ...registros(), fila('INC-9', 'inicial', hace(5)), ventana('INC-9', { abierto: 'si' })));

  comprueba(
    'incidente abierto con su periodo en disco: EV-07 NO_EVALUABLE con causa CONFIGURATION (indexer sin credenciales)',
    abierto.de('EV-07').status === 'NO_EVALUABLE' && /CONFIGURATION/.test(abierto.de('EV-07').reason) && /ISM/.test(abierto.de('EV-07').reason),
    abierto.de('EV-07').reason
  );

  const abiertoPerdido = evalua(eventos(latido(), ...registros(), fila('INC-9', 'inicial', hace(50)), ventana('INC-9', { abierto: 'si', dias_sin_archivo: '2026-09-24' })));

  comprueba('REVERSIÓN: el MISMO abierto con un día perdido → EV-07 NO_CUMPLE', abiertoPerdido.de('EV-07').status === 'NO_CUMPLE');
}

// --- 5. EV-03 y EV-04 ---------------------------------------------------------

bloque('5. EV-03 y EV-04: lo que Wazuh vio en la ventana, contra el expediente');

{
  const ar = alerta({ event: 'emergency_action_observed', evidence_id: 'EV-03', incidente_id: 'INC-2026-001', sistema: 'wazuh-real', programa: 'firewall-drop', veces: 2, primera: '2026-09-10T10:05:00Z', ultima: '2026-09-10T10:06:00Z', regla: '651' }, hace(0.6));

  const accion = (tipo: string, objeto: string, sistema = 'wazuh-real') =>
    alerta({ event: 'incident_action_registered', evidence_id: 'EV-03,EV-04,EV-08', incidente_id: 'INC-2026-001', fecha: '2026-09-10T10:30:00Z', sistema, tipo, objeto, descripcion: 'x', referencia: 'y' }, hace(0.6));

  const conAr = (extra: ReturnType<typeof alerta>[] = []) =>
    eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001', { acciones: 1, acciones_emitidas: 1 }), ar, ...extra);

  const sinRegistrar = evalua(conAr());

  comprueba(
    'respuesta activa firewall-drop sin actuación registrada: EV-03 NO_CUMPLE',
    sinRegistrar.de('EV-03').status === 'NO_CUMPLE' && /firewall-drop/.test(sinRegistrar.de('EV-03').reason),
    sinRegistrar.de('EV-03').reason
  );

  const registrada = evalua(conAr([accion('emergencia', 'firewall-drop')]));

  comprueba('REVERSIÓN: la MISMA con su actuación de emergencia registrada → CUMPLE', registrada.de('EV-03').status === 'CUMPLE', registrada.de('EV-03').reason);

  const otroTipo = evalua(conAr([accion('modificacion', 'firewall-drop')]));

  comprueba('registrada como modificación, no como emergencia: sigue NO_CUMPLE', otroTipo.de('EV-03').status === 'NO_CUMPLE');

  const incompleto = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001', { acciones: 2, acciones_emitidas: 2 }), ar, accion('emergencia', '*')));

  comprueba('el barrido declara 2 y solo llega 1: NO_EVALUABLE', incompleto.de('EV-03').status === 'NO_EVALUABLE');

  const nada = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001')));

  comprueba('ventanas barridas sin ninguna respuesta activa: EV-03 CUMPLE', nada.de('EV-03').status === 'CUMPLE', nada.de('EV-03').reason);

  const cambio = alerta({ event: 'system_change_observed', evidence_id: 'EV-04', incidente_id: 'INC-2026-001', sistema: 'wazuh-real', origen: 'fim', objeto: '/etc/ssh/sshd_config', veces: 1, primera: '2026-09-11T09:00:00Z', ultima: '2026-09-11T09:00:00Z', regla: '550' }, hace(0.6));

  const conCambio = (extra: ReturnType<typeof alerta>[]) =>
    eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001', { cambios: 1, cambios_emitidos: 1 }), cambio, ...extra);

  const otroPrefijo = evalua(conCambio([accion('modificacion', '/etc/nginx/')]));

  comprueba(
    'cambio de /etc/ssh/sshd_config y solo se registró /etc/nginx/: EV-04 NO_CUMPLE',
    otroPrefijo.de('EV-04').status === 'NO_CUMPLE' && /sshd_config/.test(otroPrefijo.de('EV-04').reason)
  );

  const prefijo = evalua(conCambio([accion('modificacion', '/etc/ssh/')]));

  comprueba('REVERSIÓN: registrado el prefijo /etc/ssh/ → CUMPLE', prefijo.de('EV-04').status === 'CUMPLE', prefijo.de('EV-04').reason);

  const otroSistema = evalua(conCambio([accion('modificacion', '/etc/ssh/', 'zimbraHldap')]));

  comprueba('el prefijo registrado es de OTRO sistema: NO_CUMPLE', otroSistema.de('EV-04').status === 'NO_CUMPLE');
}

// --- 6. EV-05 y EV-06 ---------------------------------------------------------

bloque('6. EV-05 y EV-06: la evidencia jurisdiccional, condicionada por la marca del registro');

{
  const HASH = 'a'.repeat(64);
  const sellada = (tipo: string, fichero: string, extra: Record<string, unknown> = {}) =>
    alerta({ event: 'evidence_export_sealed', evidence_id: 'EV-05,EV-06', incidente_id: 'INC-7', fecha: '2026-09-11T12:00:00Z', tipo_evidencia: tipo, fichero, sha256: HASH, destino: 'repositorio-custodia', referencia: 'z', ...extra }, hace(0.6));
  const verificada = (fichero: string, extra: Record<string, unknown> = {}) =>
    alerta({ event: 'custody_integrity_checked', evidence_id: 'EV-06', incidente_id: 'INC-7', fichero, sha256_declarado: HASH, sha256_actual: HASH, verificable: 'si', coincide: 'si', motivo: '-', verificado: '2026-09-26T11:00:00Z', ...extra }, hace(0.6));
  const anotada = (fichero: string) =>
    alerta({ event: 'custody_access_recorded', evidence_id: 'EV-06', fecha: '2026-09-11T12:05:00Z', incidente_id: 'INC-7', fichero, usuario: 'rseg', finalidad: 'deposito', referencia: 'z' }, hace(0.6));

  const relevante = [
    fila('INC-7', 'inicial', '2026-09-10T10:00:00Z', { relevancia_juridica: 'si' }),
    fila('INC-7', 'intermedio', '2026-09-11T10:00:00Z', { relevancia_juridica: 'si' }),
    fila('INC-7', 'final', '2026-09-12T10:00:00Z', { relevancia_juridica: 'si' }),
    ventana('INC-7'),
  ];

  const logs = '/srv/custodia/INC-7/logs.tar.gz';
  const acta = '/srv/custodia/INC-7/acta.pdf';

  const media = evalua(eventos(latido(), ...registros(), ...relevante, sellada('logs sellados del período', logs), verificada(logs), anotada(logs)));

  comprueba(
    'incidente con relevancia jurídica sin el acta de recogida que exige P-03: EV-05 NO_CUMPLE',
    media.de('EV-05').status === 'NO_CUMPLE' && /acta de recogida/.test(media.de('EV-05').reason),
    media.de('EV-05').reason
  );

  const completa = evalua(eventos(latido(), ...registros(), ...relevante,
    sellada('logs sellados del período', logs), verificada(logs), anotada(logs),
    sellada('Acta de recogida', acta), verificada(acta), anotada(acta)));

  comprueba('REVERSIÓN: con el acta sellada → EV-05 CUMPLE', completa.de('EV-05').status === 'CUMPLE', completa.de('EV-05').reason);
  comprueba('… y EV-06 CUMPLE: destino de P-05, custodia anotada y hash intacto', completa.de('EV-06').status === 'CUMPLE', completa.de('EV-06').reason);

  const sinRelevancia = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001')));

  comprueba('ningún incidente con relevancia jurídica: EV-05 CUMPLE diciendo por qué', sinRelevancia.de('EV-05').status === 'CUMPLE' && /relevancia jurídica/.test(sinRelevancia.de('EV-05').reason));

  const sinP03 = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001')), { ...BASICOS, 'P-03': undefined });

  comprueba('sin P-03 (determinación legal): EV-05 NO_EVALUABLE aunque no haya incidentes relevantes', sinP03.de('EV-05').status === 'NO_EVALUABLE' && /asesoramiento legal/.test(sinP03.de('EV-05').reason));

  const alterada = evalua(eventos(latido(), ...registros(), ...relevante,
    sellada('logs sellados del período', logs), verificada(logs, { sha256_actual: 'b'.repeat(64), coincide: 'no' }), anotada(logs),
    sellada('acta de recogida', acta), verificada(acta), anotada(acta)));

  comprueba('el SHA-256 de los logs ya no coincide: EV-06 NO_CUMPLE', alterada.de('EV-06').status === 'NO_CUMPLE' && /alterado/.test(alterada.de('EV-06').reason));

  const destruida = (ahora: Date) =>
    evalua(eventos(latido(new Date(ahora.getTime() - 1800e3).toISOString()),
      ...registros({}, new Date(ahora.getTime() - 2000e3).toISOString()),
      ...[
        fila('INC-7', 'inicial', '2026-09-10T10:00:00Z', { relevancia_juridica: 'si' }, new Date(ahora.getTime() - 2000e3).toISOString()),
      ],
      alerta({ event: 'evidence_export_sealed', evidence_id: 'EV-05,EV-06', incidente_id: 'INC-7', fecha: '2026-09-11T12:00:00Z', tipo_evidencia: 'acta de recogida', fichero: acta, sha256: HASH, destino: 'repositorio-custodia', referencia: 'z' }, new Date(ahora.getTime() - 2000e3).toISOString()),
      alerta({ event: 'custody_integrity_checked', evidence_id: 'EV-06', incidente_id: 'INC-7', fichero: acta, sha256_declarado: HASH, sha256_actual: '-', verificable: 'no', coincide: '-', motivo: 'ausente' }, new Date(ahora.getTime() - 2000e3).toISOString()),
      alerta({ event: 'custody_access_recorded', evidence_id: 'EV-06', fecha: '2026-09-11T12:05:00Z', incidente_id: 'INC-7', fichero: acta, usuario: 'rseg', finalidad: 'deposito', referencia: 'z' }, new Date(ahora.getTime() - 2000e3).toISOString())
    ), BASICOS, ahora);

  comprueba('evidencia desaparecida dentro del plazo más largo de P-06: NO_CUMPLE', destruida(AHORA).de('EV-06').status === 'NO_CUMPLE');

  const tarde = destruida(new Date('2031-09-20T12:00:00Z'));

  comprueba(
    'REVERSIÓN: la MISMA desaparición pasados los 1825 días de P-06 → ya no es destrucción anticipada',
    tarde.de('EV-06').status === 'CUMPLE',
    tarde.de('EV-06').reason
  );

  const fuera = evalua(eventos(latido(), ...registros(), ...relevante,
    sellada('logs sellados del período', logs, { destino: 'nas-oficina' }), verificada(logs), anotada(logs),
    sellada('acta de recogida', acta), verificada(acta), anotada(acta)));

  comprueba('depositada en un destino que no es de P-05: EV-06 NO_CUMPLE (y EV-05 porque P-03 pide otro destino)',
    fuera.de('EV-06').status === 'NO_CUMPLE' && fuera.de('EV-05').status === 'NO_CUMPLE');
}

// --- 7. EV-08 ----------------------------------------------------------------

bloque('7. EV-08: la revisión de eventos auditables, con el reloj empezando en el cierre');

{
  const cerrado = [
    fila('INC-5', 'inicial', '2026-08-01T10:00:00Z'),
    fila('INC-5', 'intermedio', '2026-08-02T10:00:00Z'),
    fila('INC-5', 'final', '2026-08-03T10:00:00Z'),
    ventana('INC-5'),
  ];

  const vencido = evalua(eventos(latido(), ...registros(), ...cerrado));

  comprueba(
    'incidente alto cerrado el 03/08 sin revisión y con P-07 alta=30: NO_CUMPLE',
    vencido.de('EV-08').status === 'NO_CUMPLE' && /INC-5/.test(vencido.de('EV-08').reason),
    vencido.de('EV-08').reason
  );

  // La misma pasada, observada el 20/08: los hechos llevan la hora de esa pasada.
  const el20 = new Date('2026-08-20T12:00:00Z');
  const pasada20 = '2026-08-20T11:30:00Z';
  const antes20 = '2026-08-20T11:29:00Z';

  const aTiempo = evalua(
    eventos(
      latido(pasada20),
      ...registros({}, antes20),
      fila('INC-5', 'inicial', '2026-08-01T10:00:00Z', {}, antes20),
      fila('INC-5', 'intermedio', '2026-08-02T10:00:00Z', {}, antes20),
      fila('INC-5', 'final', '2026-08-03T10:00:00Z', {}, antes20),
      ventana('INC-5', {}, antes20)
    ),
    BASICOS,
    el20
  );

  comprueba('REVERSIÓN: el MISMO incidente el 20/08, dentro de plazo → CUMPLE (pendiente)', aTiempo.de('EV-08').status === 'CUMPLE' && /Dentro de plazo/.test(aTiempo.de('EV-08').reason), aTiempo.de('EV-08').reason);

  const conCambio = evalua(eventos(latido(), ...registros(), ...cerrado,
    alerta({ event: 'auditable_events_revised', evidence_id: 'EV-08', fichero: '/var/ossec/etc/rules/local_rules.xml', modificado: '2026-08-10T09:00:00Z', sha256: 'c'.repeat(64), origen: 'cambio_detectado' }, hace(0.6))));

  comprueba('cambio de reglas el 10/08: CUMPLE por correlación temporal', conCambio.de('EV-08').status === 'CUMPLE' && /correlación temporal/.test(conCambio.de('EV-08').reason));

  const conRevision = evalua(eventos(latido(), ...registros(), ...cerrado,
    alerta({ event: 'incident_action_registered', evidence_id: 'EV-03,EV-04,EV-08', incidente_id: 'INC-5', fecha: '2026-08-15T09:00:00Z', sistema: '*', tipo: 'revision_eventos', objeto: '-', descripcion: 'sin cambios necesarios', referencia: 'acta' }, hace(0.6))));

  comprueba('revisión registrada el 15/08 sin cambios: CUMPLE', conRevision.de('EV-08').status === 'CUMPLE');

  const baja = evalua(eventos(latido(), ...registros(), ...cerrado.map(a => a), ), { ...BASICOS, 'P-07': ['critica | 15 |'] });

  comprueba('P-07 solo obliga en severidad crítica: el incidente alto no exige revisión → CUMPLE', baja.de('EV-08').status === 'CUMPLE');

  // Severidad de un incidente con varias filas: la MÁS ALTA de sus fases, como
  // en op.exp.7. Llegó a crítico y se rebajó a baja al cerrarlo: sigue
  // obligando a la revisión de los críticos.
  const rebajado = evalua(eventos(latido(), ...registros(),
    fila('INC-5', 'inicial', '2026-08-01T10:00:00Z', { severidad: 'alta' }),
    fila('INC-5', 'intermedio', '2026-08-02T10:00:00Z', { severidad: 'Crítica' }),
    fila('INC-5', 'final', '2026-08-03T10:00:00Z', { severidad: 'baja' }),
    ventana('INC-5')), { ...BASICOS, 'P-07': ['critica | 15 |'] });

  comprueba(
    'crítico en una fase y rebajado a baja al cerrar: cuenta la más alta → EV-08 NO_CUMPLE (severidad critica)',
    rebajado.de('EV-08').status === 'NO_CUMPLE' && /INC-5 \(severidad critica/.test(rebajado.de('EV-08').reason),
    rebajado.de('EV-08').reason
  );

  const sinP07 = evalua(eventos(latido(), ...registros(), ...cerrado), { ...BASICOS, 'P-07': undefined });

  comprueba('sin P-07: NO_EVALUABLE', sinP07.de('EV-08').status === 'NO_EVALUABLE');
}

// --- 8. EV-09 y los requisitos -------------------------------------------------

bloque('8. EV-09 y las decisiones de requisito');

{
  const sinReferencia = evalua(eventos(latido(), ...registros(),
    fila('INC-1', 'inicial', '2026-09-10T10:00:00Z'),
    fila('INC-1', 'intermedio', '2026-09-11T10:00:00Z', { referencia: '-' }),
    fila('INC-1', 'final', '2026-09-12T10:00:00Z'),
    ventana('INC-1')));

  comprueba('una fila sin referencia al expediente: EV-09 NO_CUMPLE', sinReferencia.de('EV-09').status === 'NO_CUMPLE');

  comprueba(
    '… y arrastra a los tres requisitos, que se apoyan en el expediente',
    ['op.exp.9.1', 'op.exp.9.2', 'op.exp.9.3'].every(r => sinReferencia.principal(r).status === 'NO_CUMPLE')
  );

  const bien = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001'),
    alerta({ event: 'incident_action_registered', evidence_id: 'EV-03,EV-04,EV-08', incidente_id: 'INC-2026-001', fecha: '2026-09-20T09:00:00Z', sistema: '*', tipo: 'revision_eventos', objeto: '-', descripcion: 'x', referencia: 'y' }, hace(0.6))));

  comprueba('incidente bien llevado: op.exp.9.1 CUMPLE', bien.principal('op.exp.9.1').status === 'CUMPLE', bien.principal('op.exp.9.1').reason);
  comprueba('op.exp.9.2 CUMPLE (sin relevancia jurídica ni incidentes abiertos)', bien.principal('op.exp.9.2').status === 'CUMPLE', bien.principal('op.exp.9.2').reason);
  comprueba('op.exp.9.3 CUMPLE (revisión registrada)', bien.principal('op.exp.9.3').status === 'CUMPLE', bien.principal('op.exp.9.3').reason);

  comprueba(
    'el requisito evaluado sale CUMPLE y medido',
    bien.requisito('op.exp.9.1').status === 'CUMPLE' && bien.requisito('op.exp.9.1').evidenced === true
  );

  comprueba(
    'el puente lleva la medida a la tabla de evidencias (EV-02 deja de estar en gris)',
    bien.puente.find(e => e.id === 'EV-02')?.status === 'CUMPLE'
  );

  const abierto = evalua(eventos(latido(), ...registros(), fila('INC-9', 'inicial', hace(5)), ventana('INC-9', { abierto: 'si' })));

  comprueba(
    'con un incidente abierto, op.exp.9.2 queda NO_EVALUABLE por EV-07 (indexer) y su veredicto es NO_CUMPLE no evidenciado',
    abierto.principal('op.exp.9.2').status === 'NO_EVALUABLE' &&
      abierto.requisito('op.exp.9.2').status === 'NO_CUMPLE' &&
      abierto.requisito('op.exp.9.2').evidenced === false
  );
}

// --- 9. estado por la última pasada ---------------------------------------------

bloque('9. Los registros se juzgan con la última pasada, no con la ventana de 30 días');

{
  // Pasada de ayer: INC-1 con su reporte inicial sin severidad. Hoy la fila
  // está corregida. Solo cuenta la de hoy.
  const ayer = hace(24);
  const antes = hace(24.1);
  const evs = eventos(
    latido(ayer),
    ...registros({}, antes),
    fila('INC-1', 'inicial', hace(30), { severidad: '-' }, antes),
    ventana('INC-1', {}, antes),
    latido(),
    ...registros(),
    fila('INC-1', 'inicial', hace(30)),
    ventana('INC-1')
  );

  const r = evalua(evs, { ...BASICOS, 'P-02': ['inicial | |'] });

  comprueba(
    'la fila corregida hoy manda: EV-02 CUMPLE aunque ayer faltara la severidad',
    r.de('EV-02').status === 'CUMPLE',
    r.de('EV-02').reason
  );

  const soloAyer = evalua(eventos(latido(ayer), ...registros({}, antes), fila('INC-1', 'inicial', hace(30), { severidad: '-' }, antes), ventana('INC-1', {}, antes), latido()), { ...BASICOS, 'P-02': ['inicial | |'] });

  comprueba(
    'REVERSIÓN: si hoy la pasada no reemite el registro, no se juzga sobre la foto de ayer',
    soloAyer.de('EV-02').status !== 'CUMPLE',
    soloAyer.de('EV-02').reason
  );
}

// --- 10. la causa del hueco ----------------------------------------------------

bloque('10. La causa de lo que no se puede medir llega a la evidencia y al requisito');

{
  // El caso real de wazuh4: el manager no tiene /etc/ensfacil/incident-register.tsv.
  // La policy ya decía «causa CONFIGURATION» en el texto, pero la tarjeta de
  // op.exp.9.1 salía EVIDENCE: la causa se quedaba en el motivo.
  const ausente = evalua(eventos(latido(), ...registros({ incidentes: { presente: 'no', legible: 'no', formato: '-', filas_validas: 0 } })));
  const ev01 = ausente.puente.find(e => e.id === 'EV-01');

  comprueba(
    'registro de incidentes ausente: EV-01 sin medir con causa CONFIGURATION, no EVIDENCE',
    ev01?.status === 'NO_EVALUABLE' && ev01?.gapCause === 'CONFIGURATION',
    `${ev01?.status} ${ev01?.gapCause}`
  );
  comprueba(
    'y la decisión de op.exp.9.1 declara la misma causa',
    ausente.principal('op.exp.9.1').status === 'NO_EVALUABLE' && ausente.principal('op.exp.9.1').cause === 'CONFIGURATION',
    `${ausente.principal('op.exp.9.1').status} ${ausente.principal('op.exp.9.1').cause}`
  );

  // Sin latido lo que falla es la RECOGIDA, aunque el registro sí se leyera.
  const sinLatido = evalua(eventos(...registros(), ...incidenteCerrado(), ventana('INC-2026-001')));
  const ev02 = sinLatido.puente.find(e => e.id === 'EV-02');

  comprueba(
    'sin latido del recolector: EV-02 sin medir con causa COLLECTION',
    ev02?.status === 'NO_EVALUABLE' && ev02?.gapCause === 'COLLECTION',
    `${ev02?.status} ${ev02?.gapCause}`
  );

  // Un parámetro sin configurar se arregla en la pantalla de Configuración.
  const sinP07 = evalua(eventos(latido(), ...registros(), ...incidenteCerrado(), ventana('INC-2026-001')), { ...BASICOS, 'P-07': undefined });
  const ev08 = sinP07.puente.find(e => e.id === 'EV-08');

  comprueba(
    'sin P-07: EV-08 sin medir con causa CONFIGURATION',
    ev08?.status === 'NO_EVALUABLE' && ev08?.gapCause === 'CONFIGURATION',
    `${ev08?.status} ${ev08?.gapCause}`
  );
}

console.log(`\n${fallos.length ? `${fallos.length} comprobación(es) fallan:\n  - ${fallos.join('\n  - ')}` : 'todas las comprobaciones pasan'}`);

process.exit(fallos.length ? 1 : 0);
