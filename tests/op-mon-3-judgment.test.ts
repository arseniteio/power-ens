/**
 * op.mon.3 · el juicio de la vigilancia.
 *
 *     npx tsx tests/op-mon-3-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. op.mon.3 se mide en DOS planos: el manager (000) mide la
 * recolección central, la correlación, la superficie de exposición, los canales
 * de alerta y los registros; cada agente, sus propias fuentes
 * (wazuh-logcollector.state, wazuh-agentd.state). La policy sabe en qué fila
 * está por el agent.id de los hechos. Cada caso mueve UN eje y lleva al lado la
 * REVERSIÓN: el MISMO hecho con otro parámetro, u otro `now`, cambia el
 * veredicto.
 *
 * Los hechos siguen el contrato de eventos de op.mon.3 (el que documenta el
 * runbook `linux/op.mon.3`), con los agentes de wazuh4 del 09/10/2026. Los
 * recolectores todavía no existen: cuando existan, se sustituyen por su salida
 * real en modo --prueba. Pasan por el normalizador real como alertas de
 * alerts.json, y el último bloque por el motor entero.
 */
import { opMon3PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-mon-3.policy';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { opMon3CatalogDefinition } from '../public/ens/catalog/op-mon-3';
import { opMon3Configuration } from '../public/ens/configuration/data/op-mon-3-parameters';
import { normalizeWazuhAlerts } from '../public/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { getEvidenceDefinitions } from '../public/ens/core/evidence/registry';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../public/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../public/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../public/ens/configuration/services/parameter-value-validator';
import { buildOpMon3ReportModel } from '../public/ens/reports/op-mon-3-report-model';
import type { ENSControlConfiguration, ENSLevel } from '../public/ens/configuration/types';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

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

// --- las máquinas y los hechos -----------------------------------------------

type Linea = Record<string, unknown>;

const MAQUINAS: Record<string, string> = {
  '000': 'Wazuh-4',
  '024': 'wazuh-real',
  '027': 'srv-prueba',
  '028': 'ldap-zimbra',
  '030': 'srv-copias',
  '033': 'win-prueba',
};

// Pasadas: la horaria del manager a las 11:05, la completa a las 12:05, y las
// de los agentes a las 12:20 (wazuh-real) y 12:25 (LDAP).
const HORARIA = '2026-10-09T11:05';
const COMPLETA = '2026-10-09T12:05';
const AGENTE_024 = '2026-10-09T12:20';
const AGENTE_028 = '2026-10-09T12:25';

const AHORA = new Date('2026-10-09T12:30:00Z');

const t = (base: string, s: number): string => `${base}:${String(s).padStart(2, '0')}Z`;

const coleccion = (ts: string, extra: Linea = {}): Linea => ({
  _a: '000', ts, event: 'event_collection_status', evidence_id: 'EV-01', requisito: 'op.mon.3.1', plano: 'central',
  activo: 'si', eventos_recibidos: 1203345, eventos_procesados: 1203300, eventos_descartados: 0,
  fuente_contadores: '/var/ossec/var/run/wazuh-analysisd.state', mensajes_remoted: 990210, descartados_remoted: 0, sesiones_tcp: 4,
  conexiones: 'secure:1514/tcp', agentes_registrados: 4, agentes_activos: 2, alertas_observadas_desde: '2026-09-01T00:00:00Z', ...extra,
});

const latido = (a: string, ts: string, cubiertas: string, tipo = 'manager'): Linea => ({
  _a: a, ts, event: 'collector_run', resultado: 'completada', evidencias_cubiertas: cubiertas, tipo_servidor: tipo, emisor: 'recolector',
});

const CUBRE_COMPLETA = 'EV-01,EV-02,EV-03,EV-04,EV-06,EV-07,EV-08,EV-09,EV-12,EV-13';

const fuente = (a: string, ts: string, ubicacion: string, extra: Linea = {}): Linea => ({
  _a: a, ts, event: 'log_source_observed', evidence_id: 'EV-02', requisito: 'op.mon.3.1', plano: a === '000' ? 'central' : 'agente',
  ubicacion, eventos: 18250, bytes: 2410200, descartes: 0, descartes_periodo: 0, contador_desde: '2026-10-01T07:00:00Z',
  ultimo_evento: '2026-10-09T12:00:00Z', observado_desde: '2026-10-01T08:00:00Z', lectura: 'ok', ...extra,
});

const envio = (a: string, ts: string, extra: Linea = {}): Linea => ({
  _a: a, ts, event: 'agent_forwarding_observed', evidence_id: 'EV-02', requisito: 'op.mon.3.1', plano: 'agente',
  conexion: 'connected', ultimo_keepalive: '2026-10-09T12:19:50Z', ultimo_ack: '2026-10-09T12:19:55Z',
  mensajes_generados: 88120, mensajes_enviados: 88120, mensajes_en_buffer: 0, lectura: 'ok', ...extra,
});

const sca = (ts: string, id: string, politica: string, fin: string, extra: Linea = {}): Linea => ({
  _a: '000', ts, event: 'config_assessment_observed', evidence_id: 'EV-04', requisito: 'op.mon.3.r2.1', plano: 'central',
  agente_id: id, agente: MAQUINAS[id] || id, politica, politica_nombre: `CIS ${politica}`, ultimo_fin: fin,
  aprobados: 120, fallos: 61, puntuacion: 66, lectura: 'ok', ...extra,
});

const inventario = (ts: string, id: string, conexion: string, ultimo: string, extra: Linea = {}): Linea => ({
  _a: '000', ts, event: 'package_inventory_observed', evidence_id: 'EV-04', requisito: 'op.mon.3.r2.1', plano: 'central',
  agente_id: id, agente: MAQUINAS[id] || id, estado_conexion: conexion, ultimo_keepalive: '2026-10-09T12:04:50Z',
  inventario_ultimo: ultimo, paquetes: 812, recolector_agente_ultimo: '-', lectura: 'ok', ...extra,
});

const detector = (ts: string, extra: Linea = {}): Linea => ({
  _a: '000', ts, event: 'vulnerability_detection_status', evidence_id: 'EV-04', requisito: 'op.mon.3.r2.1', plano: 'central',
  habilitado: 'si', intervalo_feed: '60m', feed_actualizado: '2026-10-09T11:46:00Z', inventario_vd_actualizado: '2026-10-09T11:50:00Z',
  errores_indexacion_24h: 0, ultimo_error_indexacion: '-', muestra_error: '-', errores_conector_24h: 0, cve_por_activo: 'sin_medir', ...extra,
});

// wazuh4 a las 12:05, después de subir el heap del indexer: el manager,
// wazuh-real y el LDAP conectados; un agente de prueba desconectado desde el
// 04/09 y otro de Windows que nunca conectó.
const pasadaCompleta = (ts = COMPLETA, extra: { coleccion?: Linea; detector?: Linea } = {}): Linea[] => [
  coleccion(t(ts, 10), { eventos_procesados: 1210450, eventos_recibidos: 1210500, mensajes_remoted: 995300, ...extra.coleccion }),
  fuente('000', t(ts, 11), '/var/log/auth.log', { ultimo_evento: '2026-10-09T12:00:00Z' }),
  fuente('000', t(ts, 11), 'journald', { eventos: 99120 }),
  fuente('000', t(ts, 11), '/var/ossec/logs/active-responses.log', { eventos: 3, ultimo_evento: '2026-10-02T09:00:00Z' }),
  { _a: '000', ts: t(ts, 12), event: 'syslog_source_observed', evidence_id: 'EV-02', requisito: 'op.mon.3.1', plano: 'central',
    ubicacion: 'ninguna', ultima_alerta: '-', alertas_24h: 0, nivel_max_24h: 0 },
  { _a: '000', ts: t(ts, 14), event: 'correlation_rules_inventory', evidence_id: 'EV-03', requisito: 'op.mon.3.r1.1', plano: 'central',
    conjunto: 'wazuh', ruta: '/var/ossec/ruleset/rules', ficheros: 167, reglas: 4515, reglas_con_mitre: 1188, tecnicas_mitre: 214,
    reglas_correlacion: 361, reglas_frecuencia: 158, reglas_if_matched: 211, tecnicas_correlacion: 63 },
  { _a: '000', ts: t(ts, 14), event: 'correlation_rules_inventory', evidence_id: 'EV-03', requisito: 'op.mon.3.r1.1', plano: 'central',
    conjunto: 'quersystem', ruta: '/var/ossec/etc/rules', ficheros: 6, reglas: 41, reglas_con_mitre: 12, tecnicas_mitre: 9,
    reglas_correlacion: 3, reglas_frecuencia: 3, reglas_if_matched: 0, tecnicas_correlacion: 2 },
  { _a: '000', ts: t(ts, 14), event: 'correlation_rules_inventory', evidence_id: 'EV-03', requisito: 'op.mon.3.r1.1', plano: 'central',
    conjunto: 'ensfacil', ruta: '/var/ossec/etc/rules', ficheros: 19, reglas: 300, reglas_con_mitre: 0, tecnicas_mitre: 0,
    reglas_correlacion: 0, reglas_frecuencia: 0, reglas_if_matched: 0, tecnicas_correlacion: 0 },
  { _a: '000', ts: t(ts, 15), event: 'correlation_alert_observed', evidence_id: 'EV-03', requisito: 'op.mon.3.r1.1', plano: 'central',
    regla: '5712', dia: '2026-10-09', veces: 3, nivel: 10, descripcion: 'sshd: brute force trying to get access to the system', grupos: 'syslog,sshd',
    tecnicas_mitre: 'T1110', agentes: 1, primera: '2026-10-09T07:12:00Z', ultima: '2026-10-09T09:40:00Z' },
  sca(t(ts, 16), '000', 'cis_ubuntu22-04', '2026-10-09T03:15:00Z'),
  sca(t(ts, 16), '024', 'cis_ubuntu24-04', '2026-10-09T05:59:40Z'),
  sca(t(ts, 16), '027', 'cis_ubuntu22-04', '2026-09-04T03:00:00Z'),
  sca(t(ts, 16), '028', 'cis_ubuntu22-04', '2026-10-09T08:31:00Z'),
  sca(t(ts, 16), '033', '-', '-', { politica_nombre: '-', aprobados: '-', fallos: '-', puntuacion: '-', lectura: 'ausente' }),
  inventario(t(ts, 17), '000', 'active', '2026-10-09T11:30:00Z'),
  inventario(t(ts, 17), '024', 'active', '2026-10-09T11:20:03Z', { recolector_agente_ultimo: '2026-10-09T06:20:14Z' }),
  inventario(t(ts, 17), '027', 'disconnected', '2026-09-04T09:00:00Z', { ultimo_keepalive: '2026-09-04T10:00:12Z', recolector_agente_ultimo: '2026-09-04T06:20:00Z' }),
  inventario(t(ts, 17), '028', 'active', '2026-10-09T11:40:00Z', { recolector_agente_ultimo: '2026-10-09T06:25:14Z' }),
  // Un agente activo FUERA del alcance ENS (sin grupo ens) y sin el recolector
  // de agente: el manager lo conoce, pero nadie mide sus fuentes.
  inventario(t(ts, 17), '030', 'active', '2026-10-09T11:10:00Z'),
  inventario(t(ts, 17), '033', 'never_connected', '-', { ultimo_keepalive: '-', paquetes: '-', lectura: 'ausente' }),
  detector(t(ts, 18), extra.detector),
  { _a: '000', ts: t(ts, 19), event: 'network_detection_observed', evidence_id: 'EV-06', requisito: 'op.mon.3.r3.2', plano: 'central',
    producto: 'ninguno', fuente: '-', ultima_alerta: '-', alertas_24h: 0 },
  { _a: '000', ts: t(ts, 20), event: 'ioc_list_observed', evidence_id: 'EV-07', requisito: 'op.mon.3.r4.1', plano: 'central',
    lista: 'etc/lists/malicious-ioc/malicious-ip', entradas: 1520, actualizada: '2026-06-02T10:00:00Z', reglas_que_la_usan: 1 },
  { _a: '000', ts: t(ts, 21), event: 'query_volume_rules_observed', evidence_id: 'EV-08', requisito: 'op.mon.3.r5.1', plano: 'central',
    ids: '5551,5712,5720,5763,107215-107217', reglas_umbral: 161, parte: 1, partes: 1 },
  { _a: '000', ts: t(ts, 22), event: 'notification_channel_configured', evidence_id: 'EV-09', requisito: 'op.mon.3.r5.2', plano: 'central',
    canal: 'correo', habilitado: 'no', nivel_minimo: 12, grupos: '-', formato: '-', destinatarios: 0, errores_24h: '-' },
  { _a: '000', ts: t(ts, 23), event: 'security_inspection_recorded', evidence_id: 'EV-12', requisito: 'op.mon.3.r6.1,op.mon.3.r6.2,op.mon.3.r6.3', plano: 'central',
    fila: 0, fecha: '-', tipo: 'ninguna', alcance: '-', ejecutor: '-', hallazgos: '-', estado_remediacion: '-', motivo: '-', incidente_id: '-', referencia: '-', formato: 'ok' },
  { _a: '000', ts: t(ts, 24), event: 'incident_registered', evidence_id: 'EV-13', requisito: 'op.mon.3.r6.1,op.mon.3.r6.2,op.mon.3.r6.3', plano: 'central',
    incidente_id: 'ninguno', fecha: '-', severidad: '-', sistemas: '-', clasificacion: '-', referencia: '-', fila: 0 },
  latido('000', t(ts, 40), CUBRE_COMPLETA),
];

const pasadaHoraria = (ts = HORARIA, extra: Linea = {}): Linea[] => [
  coleccion(t(ts, 10), extra),
  latido('000', t(ts, 12), 'EV-01'),
];

// wazuh-real: auth.log, syslog y journald. El LDAP: zimbra.log y auth.log.
const pasadaAgente = (a: '024' | '028', ts = a === '024' ? AGENTE_024 : AGENTE_028, extra: { fuentes?: Linea; envio?: Linea } = {}): Linea[] => [
  ...(a === '024'
    ? [
        fuente(a, t(ts, 10), '/var/log/auth.log', { ultimo_evento: '2026-10-09T12:00:00Z', ...extra.fuentes }),
        fuente(a, t(ts, 10), '/var/log/syslog', { eventos: 66010 }),
        fuente(a, t(ts, 10), 'journald', { eventos: 120001 }),
      ]
    : [
        fuente(a, t(ts, 10), '/var/log/zimbra.log', { eventos: 403221, ultimo_evento: '2026-10-09T12:00:00Z', ...extra.fuentes }),
        fuente(a, t(ts, 10), '/var/log/auth.log', { eventos: 1022 }),
      ]),
  envio(a, t(ts, 12), extra.envio),
  latido(a, t(ts, 14), 'EV-02', 'agente'),
];

let contador = 0;

const REGLA: Record<string, string> = {
  event_collection_status: '111401', log_source_observed: '111402', agent_forwarding_observed: '111403',
  syslog_source_observed: '111404', correlation_rules_inventory: '111405', correlation_alert_observed: '111406',
  config_assessment_observed: '111407', package_inventory_observed: '111408', vulnerability_detection_status: '111409',
  network_detection_observed: '111410', ioc_list_observed: '111411', query_volume_rules_observed: '111412',
  notification_channel_configured: '111413', security_inspection_recorded: '111414', incident_registered: '111415',
  evidence_state: '111450', collector_run: '111497',
};

// Una línea del NDJSON de un recolector tal como la deja el manager en el
// índice: con el agente que la emitió.
const alerta = (linea: Linea, control = 'op.mon.3') => {
  contador += 1;
  const { ts, _a, host: _host, ...data } = linea as Linea & { ts: string; _a: string };

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts,
      agent: { id: _a, name: MAQUINAS[_a] || _a },
      rule: { id: REGLA[String(data.event)] || '111400', description: control },
      location: `/var/log/ensfacil/${control.replace(/\./g, '_')}.json`,
      data: Object.fromEntries(Object.entries({ ensfacil: control, ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const eventos = (lineas: Linea[], cambia: (l: Linea) => Linea | undefined = l => l): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas
      .map(l => cambia({ ...l }))
      .filter((l): l is Linea => Boolean(l))
      .map(l => alerta(l))
  );

// Lo que hoy está en wazuh4 (tras subir el heap del indexer).
const hoy = (cambia?: (l: Linea) => Linea | undefined, extra: { coleccion?: Linea; detector?: Linea } = {}) =>
  eventos([...pasadaHoraria(), ...pasadaCompleta(COMPLETA, extra), ...pasadaAgente('024'), ...pasadaAgente('028')], cambia);

// Cambia los campos de las líneas de UN evento (y, si se dice, de un agente o
// de una ubicación).
const en = (evento: string, cambios: Linea, filtro: (l: Linea) => boolean = () => true) => (l: Linea): Linea =>
  l.event === evento && filtro(l) ? { ...l, ...cambios } : l;

const sin = (evento: string, filtro: (l: Linea) => boolean = () => true) => (l: Linea): Linea | undefined =>
  l.event === evento && filtro(l) ? undefined : l;

// --- la configuración --------------------------------------------------------

type Valores = Record<string, string[] | string | undefined>;

const configuracion = (valores: Valores): ENSControlConfiguration => ({
  ...opMon3Configuration,
  parameters: opMon3Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    // Un parámetro vacío es la clave `value` AUSENTE, nunca `null`.
    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

// Lo que el responsable declararía para el laboratorio en MEDIA (spec §3.5):
// las fuentes reales, el manager por su nombre, el LDAP por su ID.
const BASE: Valores = {
  'P-01': [
    'auth.log de wazuh-real | Linux auth | agente | wazuh-real | /var/log/auth.log | 24',
    'zimbra.log del LDAP | Zimbra | agente | 028 | /var/log/zimbra.log | ',
    'auth.log del manager | Linux auth | agente | Wazuh-4 | /var/log/auth.log | 24',
  ],
  'P-02': ['wazuh | 4515 | técnicas del ruleset oficial'],
  'P-03': ['Wazuh-4 | interna | ', 'wazuh-real | Internet | cis_ubuntu24-04', '028 | interna | '],
  'P-11': '26',
};

// Y en ALTA, los refuerzos declarados con lo que el laboratorio tiene.
const ALTA: Valores = {
  ...BASE,
  'P-04': ['accesos fuera de horario | 7-20 h | cualquier acceso a otra hora'],
  'P-05': ['Suricata | TAP del perímetro → syslog a Wazuh | 2'],
  'P-06': ['cibervigilancia externa | Proveedor S.L. | dominios similares'],
  'P-07': ['BD expedientes | gestor | 500 registros | 1 h | 107215'],
  'P-08': ['RSI | correo | 10 | 24x7'],
  'P-09': ['verificacion_configuracion | continua | Wazuh SCA', 'analisis_vulnerabilidades | continua | Wazuh VD', 'pentest | 365 | externo'],
  'P-10': ['Registro ENSFácil del manager | /etc/ensfacil/security-inspection-register.tsv | Responsable de Seguridad'],
  'P-ATT': [
    'op.mon.3.r3.1 | Línea base de comportamiento validada | https://intranet.cliente-prueba.es/seguridad/linea-base.pdf | 2026-05-12 | RSI',
    'op.mon.3.r4.1 | Contrato de cibervigilancia 2026 | https://intranet.cliente-prueba.es/contratos/cibervigilancia-2026.pdf | 2026-05-12 | RSI',
  ],
};

const SIN_PARAMETROS: Valores = {};

// La evaluación de UNA fila (máquina), como la hace el motor: sus hechos, la
// última pasada, las evidencias, la policy, el puente y los requisitos.
const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Valores = BASE,
  nivel: ENSLevel = 'MEDIO',
  ahora: Date = AHORA,
  fila = '000'
) => {
  const cfg = configuracion(valores);
  const deFila = evs.filter(e => e.agentId === fila);
  const delControl = keepLatestRunStateFacts('op.mon.3', deFila, ahora);
  const evidencias = resolveEvidenceForControl('op.mon.3', delControl, fila, nivel, cfg, ahora);
  const contexto = buildPolicyContext(opMon3CatalogDefinition, cfg, nivel, delControl, evidencias, ahora);
  const { decisions, runtimeVariables } = opMon3PolicyDefinition.evaluator!(contexto);
  const tabla = applyPolicyDecisionsToEvidences(evidencias, decisions, opMon3CatalogDefinition.requirements);
  const atestaciones = parseRequirementAttestations(cfg);
  const requisito = (id: string) =>
    evaluateRequirement(
      opMon3CatalogDefinition.requirements.find(q => q.id === id)!,
      nivel,
      tabla,
      false,
      decisions,
      'ACTIVE',
      atestaciones.get(id)
    );
  const evidencia = (id: string) => tabla.find(e => e.id === id);
  const decision = (req: string) => decisions.find(d => d.trace.ruleId === req);
  const motivo = (req: string) => decision(req)?.reason || '';
  // La decisión de UNA evidencia (la del requisito lleva `trace.ruleId` sin barra).
  const deEvidencia = (req: string, ev: string) => decisions.find(d => d.trace.ruleId === `${req}/${ev}`);
  const motor = () =>
    evaluateENSControl(
      opMon3CatalogDefinition,
      cfg,
      nivel,
      evidencias,
      {
        controlId: 'op.mon.3',
        policyId: opMon3PolicyDefinition.id,
        evaluatedAt: ahora.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      delControl
    );

  return { decisions, runtimeVariables, requisito, evidencia, decision, motivo, deEvidencia, motor };
};

const estado = (r: ReturnType<typeof evalua>, req: string): string => r.decision(req)?.status || 'SIN_DECISION';
const causa = (r: ReturnType<typeof evalua>, req: string): string => r.decision(req)?.cause || '';
const ev = (r: ReturnType<typeof evalua>, req: string, id: string): string => r.deEvidencia(req, id)?.status || 'SIN_DECISION';
const evMotivo = (r: ReturnType<typeof evalua>, req: string, id: string): string => r.deEvidencia(req, id)?.reason || '';

// --- 1. catálogo ------------------------------------------------------------

bloque('1. Catálogo: categoría del sistema, dos planos y siete refuerzos');

{
  const reqs = new Map(opMon3CatalogDefinition.requirements.map(r => [r.id, r]));
  const niveles = (id: string) => JSON.stringify(reqs.get(id)?.applicability.levels);

  comprueba('ACTIVE y en los dos planos', opMon3CatalogDefinition.status === 'ACTIVE' && JSON.stringify(opMon3CatalogDefinition.measurementPlanes) === '["agent","manager"]');
  comprueba('base en las tres categorías; R1 y R2 desde MEDIA', niveles('op.mon.3.1') === '["BAJO","MEDIO","ALTO"]' && niveles('op.mon.3.r1.1') === '["MEDIO","ALTO"]' && niveles('op.mon.3.r2.1') === '["MEDIO","ALTO"]');
  comprueba(
    'R3 a R6 solo en ALTA; R7 sin niveles',
    ['op.mon.3.r3.1', 'op.mon.3.r3.2', 'op.mon.3.r4.1', 'op.mon.3.r5.1', 'op.mon.3.r5.2', 'op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'].every(id => niveles(id) === '["ALTO"]') &&
      niveles('op.mon.3.r7.1') === '[]'
  );
  comprueba(
    'R3.1 y R4 sin evidencias (documentales, P-ATT)',
    reqs.get('op.mon.3.r3.1')!.evidenceIds.length === 0 && reqs.get('op.mon.3.r4.1')!.evidenceIds.length === 0
  );
  comprueba(
    'la policy declara los mismos requisitos, niveles y evidencias que el catálogo',
    opMon3PolicyDefinition.requirements.every(p => {
      const r = reqs.get(p.requirementId);

      return r && JSON.stringify(r.applicability.levels) === JSON.stringify(p.levels) && JSON.stringify(r.evidenceIds) === JSON.stringify(p.evidenceIds);
    }) && opMon3PolicyDefinition.requirements.length === reqs.size
  );

  const definiciones = getEvidenceDefinitions('op.mon.3');
  const estados = getStateFactEventTypes('op.mon.3');

  comprueba('13 evidencias, todas «el agente solo declara huecos»', definiciones.length === 13 && definiciones.every(d => d.agentDeclaresOnlyGaps));
  comprueba(
    'los hechos de estado son los del contrato; la serie y la acción no',
    estados.size === 13 && !estados.has('event_collection_status') && !estados.has('correlation_alert_observed') && estados.has('agent_forwarding_observed')
  );
  comprueba(
    'cada relatedRule está en la banda 111400-111499',
    definiciones.every(d => (d.relatedRules || []).every(r => Number(r) >= 111401 && Number(r) <= 111449))
  );
  comprueba(
    'cada evento esperado tiene su regla en el contrato',
    definiciones.every(d => d.expectedEventTypes.every(e => e === 'evidence_state' || REGLA[e]))
  );
  comprueba(
    'solo P-01 es obligatorio',
    JSON.stringify(opMon3Configuration.parameters.filter(p => p.required).map(p => p.id)) === '["P-01"]'
  );
  comprueba(
    'los valores de BASE y ALTA son válidos para el validador de tablas',
    configuracion(ALTA).parameters.filter(p => p.value !== undefined).every(p => validateParameterValue(p, p.value).valid),
    configuracion(ALTA).parameters.filter(p => p.value !== undefined && !validateParameterValue(p, p.value).valid).map(p => p.id).join(', ')
  );
}

// --- 2. verde: el techo de MEDIA en el laboratorio ------------------------------

bloque('2. Verde: el techo de MEDIA del laboratorio (spec §3.5), en las tres filas');

{
  const evs = hoy();
  const m = evalua(evs);

  comprueba('manager · op.mon.3.1 CUMPLE', estado(m, 'op.mon.3.1') === 'CUMPLE', m.motivo('op.mon.3.1'));
  comprueba('manager · EV-01: recolecta (la serie sube) y sin descartes', ev(m, 'op.mon.3.1', 'EV-01') === 'CUMPLE' && /procesó 7150 eventos/.test(evMotivo(m, 'op.mon.3.1', 'EV-01')));
  comprueba(
    'manager · EV-02: su auth.log, y wazuh-real y el LDAP conectados (su detalle, en su fila)',
    ev(m, 'op.mon.3.1', 'EV-02') === 'CUMPLE' && /wazuh-real \(024\) conectado/.test(evMotivo(m, 'op.mon.3.1', 'EV-02')) && /Se juzgan en la fila de su máquina/.test(evMotivo(m, 'op.mon.3.1', 'EV-02')),
    evMotivo(m, 'op.mon.3.1', 'EV-02')
  );
  comprueba('manager · R1 CUMPLE con el conjunto wazuh', estado(m, 'op.mon.3.r1.1') === 'CUMPLE' && /5712: 3/.test(m.motivo('op.mon.3.r1.1')), m.motivo('op.mon.3.r1.1'));
  comprueba('manager · R2 CUMPLE por capacidad, con el recuento de CVE «sin medir»', estado(m, 'op.mon.3.r2.1') === 'CUMPLE' && /sin medir/.test(m.motivo('op.mon.3.r2.1')), m.motivo('op.mon.3.r2.1'));
  comprueba('manager · los tres requisitos de MEDIA cumplen en el motor', ['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].every(id => m.requisito(id).status === 'CUMPLE'));
  comprueba('manager · R3 a R6 no aplican en MEDIA', ['op.mon.3.r3.2', 'op.mon.3.r5.1', 'op.mon.3.r6.3'].every(id => m.requisito(id).status === 'NO_APLICA'));

  const r24 = evalua(evs, BASE, 'MEDIO', AHORA, '024');

  comprueba('wazuh-real · op.mon.3.1 CUMPLE con su auth.log y su agente conectado', estado(r24, 'op.mon.3.1') === 'CUMPLE' && /último evento 2026-10-09T12:00:00Z/.test(r24.motivo('op.mon.3.1')), r24.motivo('op.mon.3.1'));
  comprueba('wazuh-real · R1 y R2 NO_APLICA («se mide en el manager»)', r24.requisito('op.mon.3.r1.1').status === 'NO_APLICA' && /manager/.test(r24.motivo('op.mon.3.r2.1')));
  comprueba('wazuh-real · EV-01 NO_APLICA en su fila', ev(r24, 'op.mon.3.1', 'EV-01') === 'NO_APLICA');

  const r28 = evalua(evs, BASE, 'MEDIO', AHORA, '028');

  comprueba('LDAP · op.mon.3.1 CUMPLE con zimbra.log (sin máximo de horas: presencia y descartes)', estado(r28, 'op.mon.3.1') === 'CUMPLE', r28.motivo('op.mon.3.1'));

  const basica = evalua(evs, BASE, 'BAJO');

  comprueba('BÁSICA · solo la base, y cumple', estado(basica, 'op.mon.3.1') === 'CUMPLE' && basica.requisito('op.mon.3.r1.1').status === 'NO_APLICA' && !basica.decision('op.mon.3.r2.1'));

  const informe = buildOpMon3ReportModel(m.motor());

  comprueba(
    'informe · 12 campos, R2 «sin medir» y en MEDIA sin componentes externos',
    informe.fields.length === 12 &&
      /sin medir/.test(informe.fields[3].value) &&
      informe.fields[10].status === 'NO_APLICA' &&
      informe.fields[3].status === 'CUMPLE'
  );

  const crudo = evs.find(e => e.eventType === 'agent_forwarding_observed');
  const registro = evs.find(e => e.eventType === 'security_inspection_recorded');

  comprueba(
    'normalizador · `conexion` y `estado_remediacion` no se leen como veredicto (sin `estado`, el hecho no afirma nada)',
    crudo !== undefined && crudo.status === 'NO_EVALUABLE' && crudo.attributes?.status === undefined &&
      registro !== undefined && registro.status === 'NO_EVALUABLE' && registro.attributes?.status === undefined
  );
}

// --- 3. R2: el laboratorio de hoy y cada eje --------------------------------------

bloque('3. R2 (superficie de exposición): el indexer, cada eje y su reversión');

{
  // Hoy en wazuh4, antes de subir el heap: el detector no escribe.
  const roto = evalua(hoy(undefined, { detector: { errores_indexacion_24h: 37, ultimo_error_indexacion: '2026-10-09T09:12:00Z', muestra_error: 'circuit_breaking_exception' } }));

  comprueba(
    'circuit_breaking_exception al escribir las vulnerabilidades → NO_CUMPLE medido',
    estado(roto, 'op.mon.3.r2.1') === 'NO_CUMPLE' && /circuit_breaking_exception/.test(roto.motivo('op.mon.3.r2.1')) && roto.requisito('op.mon.3.r2.1').evidenced === true,
    roto.motivo('op.mon.3.r2.1')
  );
  comprueba('reversión · con 0 errores en 24 h (heap a 2 GB), CUMPLE', estado(evalua(hoy()), 'op.mon.3.r2.1') === 'CUMPLE');

  const deshabilitado = evalua(hoy(undefined, { detector: { habilitado: 'no' } }));

  comprueba('detector deshabilitado → NO_CUMPLE', estado(deshabilitado, 'op.mon.3.r2.1') === 'NO_CUMPLE' && /no está habilitado/.test(deshabilitado.motivo('op.mon.3.r2.1')));

  const feedViejo = hoy(undefined, { detector: { feed_actualizado: '2026-10-07T11:46:00Z' } });

  comprueba('fuente del detector de hace 48 h con P-11 = 26 → NO_CUMPLE', estado(evalua(feedViejo), 'op.mon.3.r2.1') === 'NO_CUMPLE');
  comprueba('reversión · la misma fuente con P-11 = 72 → CUMPLE', estado(evalua(feedViejo, { ...BASE, 'P-11': '72' }), 'op.mon.3.r2.1') === 'CUMPLE');

  const sinContar = evalua(hoy(undefined, { detector: { errores_indexacion_24h: '-' } }));

  comprueba('sin poder contar los errores → NO_EVALUABLE (COLLECTION), nunca CUMPLE', estado(sinContar, 'op.mon.3.r2.1') === 'NO_EVALUABLE' && causa(sinContar, 'op.mon.3.r2.1') === 'COLLECTION');

  const scaViejo = hoy(en('config_assessment_observed', { ultimo_fin: '2026-10-08T03:00:00Z' }, l => l.agente_id === '024'));

  comprueba('el SCA de wazuh-real de hace 33 h → NO_CUMPLE nombrándolo', estado(evalua(scaViejo), 'op.mon.3.r2.1') === 'NO_CUMPLE' && /wazuh-real \(024\)/.test(evalua(scaViejo).motivo('op.mon.3.r2.1')));
  comprueba('reversión · con P-11 = 48, CUMPLE', estado(evalua(scaViejo, { ...BASE, 'P-11': '48' }), 'op.mon.3.r2.1') === 'CUMPLE');

  // La edad se mide en el instante del hecho, no desde ahora: 20 h después los
  // mismos hechos (aún frescos) siguen diciendo lo mismo.
  const tarde = new Date('2026-10-10T08:30:00Z');

  comprueba(
    'edad en el instante del hecho: 20 h después, el mismo SCA sigue dentro de P-11',
    estado(evalua(hoy(), BASE, 'MEDIO', tarde), 'op.mon.3.r2.1') === 'CUMPLE'
  );

  const apache = { ...BASE, 'P-03': ['Wazuh-4 | interna | ', 'wazuh-real | Internet | cis_ubuntu24-04, cis_apache_24', '028 | interna | '] };

  comprueba('P-03 exige cis_apache_24 en wazuh-real y no se evalúa → NO_CUMPLE', estado(evalua(hoy(), apache), 'op.mon.3.r2.1') === 'NO_CUMPLE' && /cis_apache_24/.test(evalua(hoy(), apache).motivo('op.mon.3.r2.1')));

  const libre = { ...BASE, 'P-03': ['wazuh-real | Internet | CIS Apache + CVE feed'] };

  comprueba('politicas_sca en texto libre → CONFIGURATION nombrando el activo', estado(evalua(hoy(), libre), 'op.mon.3.r2.1') === 'NO_EVALUABLE' && causa(evalua(hoy(), libre), 'op.mon.3.r2.1') === 'CONFIGURATION' && /activo «wazuh-real»/.test(evalua(hoy(), libre).motivo('op.mon.3.r2.1')));

  const sinInventario = hoy(en('package_inventory_observed', { inventario_ultimo: '-' }, l => l.agente_id === '028'));

  comprueba('el LDAP sin inventario de paquetes → NO_CUMPLE', estado(evalua(sinInventario), 'op.mon.3.r2.1') === 'NO_CUMPLE');

  comprueba(
    'un activo de prueba desconectado en P-03 (027) → NO_CUMPLE; uno que nunca conectó (033) → NO_CUMPLE',
    estado(evalua(hoy(), { ...BASE, 'P-03': ['27 | interna | '] }), 'op.mon.3.r2.1') === 'NO_CUMPLE' &&
      estado(evalua(hoy(), { ...BASE, 'P-03': ['win-prueba | interna | '] }), 'op.mon.3.r2.1') === 'NO_CUMPLE'
  );
  comprueba('un activo que no está en el manager → NO_CUMPLE', /no figura en la base de agentes/.test(evalua(hoy(), { ...BASE, 'P-03': ['srv-web01 | Internet | '] }).motivo('op.mon.3.r2.1')));

  const ilegible = hoy(l =>
    (l.event === 'package_inventory_observed' || l.event === 'config_assessment_observed') && l.agente_id === '028' ? { ...l, lectura: 'error' } : l
  );

  comprueba('la base del LDAP ilegible → NO_EVALUABLE (COLLECTION) nombrándola', estado(evalua(ilegible), 'op.mon.3.r2.1') === 'NO_EVALUABLE' && causa(evalua(ilegible), 'op.mon.3.r2.1') === 'COLLECTION' && /queue\/db\/028\.db/.test(evalua(ilegible).motivo('op.mon.3.r2.1')));
  comprueba(
    'y un NO_CUMPLE medido de otro activo sigue mandando',
    estado(evalua(hoy(l => (l.event === 'package_inventory_observed' && l.agente_id === '028' ? { ...l, lectura: 'error' } : l.event === 'config_assessment_observed' && l.agente_id === '024' ? { ...l, ultimo_fin: '2026-10-01T00:00:00Z' } : l))), 'op.mon.3.r2.1') === 'NO_CUMPLE'
  );
}

// --- 4. op.mon.3.1 en rojo, eje a eje ---------------------------------------------

bloque('4. op.mon.3.1 (recolección): cada fuente, cada eje, con su reversión');

{
  const fila24 = (evs: ENSNormalizedEvent[], valores: Valores = BASE) => evalua(evs, valores, 'MEDIO', AHORA, '024');
  const conP01 = (...filas: string[]): Valores => ({ ...BASE, 'P-01': filas });

  const secure = conP01('secure de wazuh-real | Linux auth | agente | 24 | /var/log/secure | ');

  comprueba('una fuente declarada que el logcollector no lee → NO_CUMPLE (y dice lo que lee)', estado(fila24(hoy(), secure), 'op.mon.3.1') === 'NO_CUMPLE' && /no lee \/var\/log\/secure \(lee: \/var\/log\/auth\.log/.test(fila24(hoy(), secure).motivo('op.mon.3.1')));
  comprueba('reversión · con el comodín /var/log/auth*, CUMPLE', estado(fila24(hoy(), conP01('auth de wazuh-real | Linux auth | agente | 24 | /var/log/auth* | ')), 'op.mon.3.1') === 'CUMPLE');

  const conDescartes = hoy(en('log_source_observed', { descartes: 5, descartes_periodo: 5 }, l => l._a === '024' && l.ubicacion === '/var/log/auth.log'));

  comprueba('5 eventos descartados en el periodo → NO_CUMPLE medido', estado(fila24(conDescartes), 'op.mon.3.1') === 'NO_CUMPLE' && /descartados/.test(fila24(conDescartes).motivo('op.mon.3.1')));
  comprueba(
    'reversión · descartes de antes del periodo (descartes=5, descartes_periodo=0) → CUMPLE',
    estado(fila24(hoy(en('log_source_observed', { descartes: 5, descartes_periodo: 0 }, l => l._a === '024'))), 'op.mon.3.1') === 'CUMPLE'
  );

  const laguna = hoy(en('log_source_observed', { ultimo_evento: '2026-10-08T06:00:00Z' }, l => l._a === '024' && l.ubicacion === '/var/log/auth.log'));

  comprueba('30 h sin eventos en auth.log con máximo 24 → NO_CUMPLE (laguna)', estado(fila24(laguna), 'op.mon.3.1') === 'NO_CUMPLE' && /laguna/.test(fila24(laguna).motivo('op.mon.3.1')));
  comprueba('reversión · sin máximo declarado, la continuidad no se juzga → CUMPLE', estado(fila24(laguna, conP01('auth.log de wazuh-real | Linux auth | agente | wazuh-real | /var/log/auth.log | ')), 'op.mon.3.1') === 'CUMPLE');

  const nunca = (desde: string) => hoy(en('log_source_observed', { ultimo_evento: '-', observado_desde: desde }, l => l._a === '024' && l.ubicacion === '/var/log/auth.log'));

  comprueba('ningún evento desde que se observa hace 3 días, máximo 24 → NO_CUMPLE', estado(fila24(nunca('2026-10-06T12:00:00Z')), 'op.mon.3.1') === 'NO_CUMPLE');
  comprueba('ningún evento, pero se observa desde hace 2 h → NO_EVALUABLE, nunca CUMPLE', estado(fila24(nunca('2026-10-09T10:20:00Z')), 'op.mon.3.1') === 'NO_EVALUABLE');

  const desconectado = hoy(en('agent_forwarding_observed', { conexion: 'disconnected' }, l => l._a === '024'));

  comprueba('el agente desconectado al leerlo → NO_CUMPLE', estado(fila24(desconectado), 'op.mon.3.1') === 'NO_CUMPLE' && /no está conectado/.test(fila24(desconectado).motivo('op.mon.3.1')));

  const sinEstado = hoy(l =>
    l.event === 'log_source_observed' && l._a === '024'
      ? l.ubicacion === '/var/log/auth.log'
        ? { ...l, ubicacion: '-', eventos: '-', bytes: '-', descartes: '-', descartes_periodo: '-', lectura: 'error' }
        : undefined
      : l
  );

  comprueba('wazuh-logcollector.state ilegible → NO_EVALUABLE (COLLECTION) en esa fila', estado(fila24(sinEstado), 'op.mon.3.1') === 'NO_EVALUABLE' && causa(fila24(sinEstado), 'op.mon.3.1') === 'COLLECTION');

  // El manager: EV-01.
  const parado = eventos([...pasadaHoraria(HORARIA, { eventos_procesados: 1210450 }), ...pasadaCompleta()]);

  comprueba('el contador del motor parado entre dos pasadas → NO_CUMPLE («no recolecta»)', ev(evalua(parado), 'op.mon.3.1', 'EV-01') === 'NO_CUMPLE' && /no recolecta/.test(evMotivo(evalua(parado), 'op.mon.3.1', 'EV-01')));

  const descarta = hoy(undefined, { coleccion: { eventos_descartados: 412 } });

  comprueba('412 eventos descartados entre las dos pasadas → NO_CUMPLE', ev(evalua(descarta), 'op.mon.3.1', 'EV-01') === 'NO_CUMPLE' && /descartado 412/.test(evMotivo(evalua(descarta), 'op.mon.3.1', 'EV-01')));

  const reinicio = hoy(undefined, { coleccion: { eventos_procesados: 5300, eventos_descartados: 0 } });

  comprueba('reinicio (el contador baja) con eventos desde entonces → CUMPLE', ev(evalua(reinicio), 'op.mon.3.1', 'EV-01') === 'CUMPLE' && /se reinició/.test(evMotivo(evalua(reinicio), 'op.mon.3.1', 'EV-01')));

  const soloRemoted = hoy(l => (l.event === 'event_collection_status' ? { ...l, eventos_procesados: '-', eventos_recibidos: '-', eventos_descartados: '-', fuente_contadores: '-' } : l));

  comprueba('sin wazuh-analysisd.state, la serie de wazuh-remoted → CUMPLE', ev(evalua(soloRemoted), 'op.mon.3.1', 'EV-01') === 'CUMPLE' && /wazuh-remoted/.test(evMotivo(evalua(soloRemoted), 'op.mon.3.1', 'EV-01')));

  const sinContadores = hoy(l => (l.event === 'event_collection_status' ? { ...l, eventos_procesados: '-', eventos_descartados: '-', mensajes_remoted: '-', fuente_contadores: '-' } : l));

  comprueba('sin ningún contador → NO_EVALUABLE (COLLECTION)', ev(evalua(sinContadores), 'op.mon.3.1', 'EV-01') === 'NO_EVALUABLE' && evalua(sinContadores).deEvidencia('op.mon.3.1', 'EV-01')?.cause === 'COLLECTION');
  comprueba('wazuh-manager no activo → NO_CUMPLE', ev(evalua(hoy(undefined, { coleccion: { activo: 'no' } })), 'op.mon.3.1', 'EV-01') === 'NO_CUMPLE');
  comprueba('sin ninguna conexión en <remote> → NO_CUMPLE', ev(evalua(hoy(undefined, { coleccion: { conexiones: '-' } })), 'op.mon.3.1', 'EV-01') === 'NO_CUMPLE');
  comprueba(
    'frescura de 3 h: el mismo estado a las 15:30 → NO_EVALUABLE (COLLECTION); a las 14:30, CUMPLE',
    ev(evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-09T15:30:00Z')), 'op.mon.3.1', 'EV-01') === 'NO_EVALUABLE' &&
      ev(evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-09T14:30:00Z')), 'op.mon.3.1', 'EV-01') === 'CUMPLE'
  );

  // El manager: las fuentes de otras máquinas.
  const deOtra = (sistema: string) => conP01(`auth.log de ${sistema} | Linux auth | agente | ${sistema} | /var/log/auth.log | `);

  comprueba('fila del manager · una fuente del agente de prueba desconectado (027) → NO_CUMPLE', estado(evalua(hoy(), deOtra('srv-prueba')), 'op.mon.3.1') === 'NO_CUMPLE' && /desconnected|disconnected/.test(evalua(hoy(), deOtra('srv-prueba')).motivo('op.mon.3.1')));
  comprueba('fila del manager · una máquina que el manager no conoce → NO_CUMPLE', /no figura en la base de agentes/.test(evalua(hoy(), deOtra('srv-web01')).motivo('op.mon.3.1')));
  comprueba(
    'fila del manager · una fuente de un agente activo sin recolector de agente (fuera del alcance) → NO_EVALUABLE (COLLECTION), nunca CUMPLE',
    estado(evalua(hoy(), deOtra('srv-copias')), 'op.mon.3.1') === 'NO_EVALUABLE' &&
      causa(evalua(hoy(), deOtra('srv-copias')), 'op.mon.3.1') === 'COLLECTION' &&
      /su recolector de agente de op\.mon\.3 no informa/.test(evalua(hoy(), deOtra('srv-copias')).motivo('op.mon.3.1'))
  );

  const latidoViejo = hoy(en('package_inventory_observed', { recolector_agente_ultimo: '2026-10-07T06:20:14Z' }, l => l.agente_id === '024'));

  comprueba(
    'fila del manager · el último latido del recolector de wazuh-real de hace 54 h → NO_EVALUABLE (COLLECTION)',
    estado(evalua(latidoViejo), 'op.mon.3.1') === 'NO_EVALUABLE' && causa(evalua(latidoViejo), 'op.mon.3.1') === 'COLLECTION'
  );

  // Un nombre con dos agentes: el 041, un registro viejo desconectado.
  const duplicado = hoy(l => l);
  const viejo = eventos([inventario(t(COMPLETA, 17), '041', 'disconnected', '2026-08-01T00:00:00Z', { agente: 'wazuh-real' })]);
  const conDuplicado = [...duplicado, ...viejo];

  comprueba('fila del manager · «wazuh-real» casa con 024 y 041 → CONFIGURATION, «decláralo por su ID»', estado(evalua(conDuplicado), 'op.mon.3.1') === 'NO_EVALUABLE' && /Decláralo por su ID/.test(evalua(conDuplicado).motivo('op.mon.3.1')));
  comprueba(
    'reversión · declarado por su ID (24) → CUMPLE; declarar el viejo (41) → NO_CUMPLE',
    estado(evalua(conDuplicado, conP01('auth.log de wazuh-real | Linux auth | agente | 24 | /var/log/auth.log | 24')), 'op.mon.3.1') === 'CUMPLE' &&
      estado(evalua(conDuplicado, conP01('auth.log viejo | Linux auth | agente | 41 | /var/log/auth.log | ')), 'op.mon.3.1') === 'NO_CUMPLE'
  );

  // Syslog en el manager.
  const fw = conP01('Cortafuegos perimetral | syslog | syslog | 192.0.2.10 |  | 2');
  const conFw = (ultima: string) => hoy(en('syslog_source_observed', { ubicacion: '192.0.2.10', ultima_alerta: ultima, alertas_24h: 480, nivel_max_24h: 6 }));

  comprueba('syslog · el emisor con alertas hace 1 h, máximo 2 → CUMPLE', estado(evalua(conFw('2026-10-09T11:05:00Z'), fw), 'op.mon.3.1') === 'CUMPLE');
  comprueba('syslog · su última alerta de hace 5 h, máximo 2 → NO_CUMPLE', estado(evalua(conFw('2026-10-09T07:05:00Z'), fw), 'op.mon.3.1') === 'NO_CUMPLE');
  comprueba('syslog · sin alertas del emisor y 38 días observando → NO_CUMPLE', estado(evalua(hoy(), fw), 'op.mon.3.1') === 'NO_CUMPLE' && /30 días/.test(evalua(hoy(), fw).motivo('op.mon.3.1')));
  comprueba(
    'syslog · sin alertas y observando desde hace 2 días → NO_EVALUABLE, nunca CUMPLE',
    estado(evalua(hoy(undefined, { coleccion: { alertas_observadas_desde: '2026-10-07T12:00:00Z' } }), fw), 'op.mon.3.1') === 'NO_EVALUABLE'
  );
  comprueba('syslog · en la fila de un agente no se juzga', estado(fila24(hoy(), conP01(...(BASE['P-01'] as string[]), 'Cortafuegos | syslog | syslog | 192.0.2.10 |  | ')), 'op.mon.3.1') === 'CUMPLE');

  // P-01 mal escrita.
  const malMetodo = conP01('ftp del NAS | ficheros | ftp | wazuh-real | /var/log/auth.log | ');

  comprueba('P-01 con un método que no es agente ni syslog → CONFIGURATION nombrando la fuente', estado(fila24(hoy(), malMetodo), 'op.mon.3.1') === 'NO_EVALUABLE' && causa(fila24(hoy(), malMetodo), 'op.mon.3.1') === 'CONFIGURATION' && /fuente «ftp del NAS»/.test(fila24(hoy(), malMetodo).motivo('op.mon.3.1')));

  const malMax = conP01('auth.log | Linux | agente | wazuh-real | /var/log/auth.log | muchas', 'secure | Linux | agente | wazuh-real | /var/log/secure | ');

  comprueba('y un NO_CUMPLE medido de otra fuente sigue mandando sobre la fila mal escrita', estado(fila24(hoy(), malMax), 'op.mon.3.1') === 'NO_CUMPLE' && /max_horas_sin_eventos dice «muchas»/.test(fila24(hoy(), malMax).motivo('op.mon.3.1')));

  const noDeclarada = evalua(hoy(), conP01('auth.log del manager | Linux auth | agente | 000 | /var/log/auth.log | '), 'MEDIO', AHORA, '024');

  comprueba('un agente que P-01 no nombra → op.mon.3.1 NO_APLICA en su fila', noDeclarada.requisito('op.mon.3.1').status === 'NO_APLICA' && /no es una fuente declarada/.test(noDeclarada.motivo('op.mon.3.1')));
}

// --- 5. sin parámetros ------------------------------------------------------------

bloque('5. Sin parámetros: NO_EVALUABLE por CONFIGURATION, nunca CUMPLE');

{
  const m = evalua(hoy(), SIN_PARAMETROS);

  comprueba('sin P-01 → op.mon.3.1 sin demostrar, EV-02 por CONFIGURATION', estado(m, 'op.mon.3.1') === 'NO_EVALUABLE' && m.deEvidencia('op.mon.3.1', 'EV-02')?.cause === 'CONFIGURATION' && m.requisito('op.mon.3.1').status === 'NO_CUMPLE');
  comprueba('y EV-01 se mide igual', ev(m, 'op.mon.3.1', 'EV-01') === 'CUMPLE');
  comprueba('sin P-02 → R1 por CONFIGURATION', estado(m, 'op.mon.3.r1.1') === 'NO_EVALUABLE' && causa(m, 'op.mon.3.r1.1') === 'CONFIGURATION');
  comprueba('sin P-03 → R2 por CONFIGURATION', estado(m, 'op.mon.3.r2.1') === 'NO_EVALUABLE' && causa(m, 'op.mon.3.r2.1') === 'CONFIGURATION');
  comprueba('sin P-11 (con P-03) → R2 por CONFIGURATION', causa(evalua(hoy(), { ...BASE, 'P-11': undefined }), 'op.mon.3.r2.1') === 'CONFIGURATION');
  comprueba(
    'ningún requisito aplicable sale CUMPLE en el motor',
    ['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].every(id => m.requisito(id).status === 'NO_CUMPLE' && m.requisito(id).evidenced === false)
  );

  const alta = evalua(hoy(), SIN_PARAMETROS, 'ALTO');

  comprueba(
    'ALTA sin parámetros: R5.1, R5.2 y R6 por CONFIGURATION',
    ['op.mon.3.r5.1', 'op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'].every(id => estado(alta, id) === 'NO_EVALUABLE' && causa(alta, id) === 'CONFIGURATION'),
    ['op.mon.3.r5.1', 'op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'].map(id => `${id}=${estado(alta, id)}/${causa(alta, id)}`).join(' ')
  );
  comprueba('R5.2 sin P-08 pero sin ningún canal habilitado → NO_CUMPLE medido', estado(alta, 'op.mon.3.r5.2') === 'NO_CUMPLE');
  comprueba('R3.2 sin P-05 pero sin ningún NIDS → NO_CUMPLE medido', estado(alta, 'op.mon.3.r3.2') === 'NO_CUMPLE');
  comprueba('R3.1 y R4 sin P-ATT → no demostrados', alta.requisito('op.mon.3.r3.1').status === 'NO_CUMPLE' && alta.requisito('op.mon.3.r4.1').status === 'NO_CUMPLE');
}

// --- 6. sin recolector ------------------------------------------------------------

bloque('6. Sin recolector, o con lo que el recolector declara que no pudo medir');

{
  const nada = evalua([], BASE, 'MEDIO', AHORA, '024');

  comprueba(
    'una fila sin ningún hecho → todo NO_EVALUABLE (COLLECTION), nunca NO_APLICA ni CUMPLE',
    ['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].every(id => estado(nada, id) === 'NO_EVALUABLE' && causa(nada, id) === 'COLLECTION'),
    ['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].map(id => `${id}=${estado(nada, id)}`).join(' ')
  );

  // Un agente con hechos de otro control (sabe quién es) pero sin el de op.mon.3.
  const deOtroControl = normalizeWazuhAlerts([alerta({ _a: '024', ts: t(AGENTE_024, 0), event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-01' }, 'op.exp.8')]);
  const sinRecolector = evalua(deOtroControl, BASE, 'MEDIO', AHORA, '024');

  comprueba('wazuh-real sin el recolector de op.mon.3 → op.mon.3.1 NO_EVALUABLE (COLLECTION)', estado(sinRecolector, 'op.mon.3.1') === 'NO_EVALUABLE' && causa(sinRecolector, 'op.mon.3.1') === 'COLLECTION');
  comprueba('y R2 NO_APLICA en su fila (se sabe que es un agente)', sinRecolector.requisito('op.mon.3.r2.1').status === 'NO_APLICA');
  comprueba('un hecho de op.exp.8 no acredita op.mon.3', estado(sinRecolector, 'op.mon.3.1') !== 'CUMPLE');

  const dosDias = new Date('2026-10-11T13:00:00Z');

  comprueba('dos días sin pasadas → COLLECTION en el manager y en el agente', causa(evalua(hoy(), BASE, 'MEDIO', dosDias), 'op.mon.3.r2.1') === 'COLLECTION' && causa(evalua(hoy(), BASE, 'MEDIO', dosDias, '024'), 'op.mon.3.1') === 'COLLECTION');

  const degradado = (ts: string) => ({ _a: '000', ts, event: 'evidence_state', evidence_id: 'EV-02,EV-04', requisito: 'op.mon.3.1,op.mon.3.r2.1', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer /var/ossec/queue/db/global.db' });

  const despues = [...hoy(), ...eventos([degradado('2026-10-09T12:28:00Z')])];

  comprueba(
    'global.db ilegible DESPUÉS de la última pasada: lo que cumplía pasa a NO_EVALUABLE con el motivo del recolector',
    estado(evalua(despues), 'op.mon.3.r2.1') === 'NO_EVALUABLE' && /global\.db/.test(evalua(despues).motivo('op.mon.3.r2.1'))
  );

  const despuesRoto = [...hoy(undefined, { detector: { errores_indexacion_24h: 37, muestra_error: 'circuit_breaking_exception' } }), ...eventos([degradado('2026-10-09T12:28:00Z')])];

  comprueba('y un NO_CUMPLE medido sigue mandando', estado(evalua(despuesRoto), 'op.mon.3.r2.1') === 'NO_CUMPLE');

  const antiguo = [...hoy(), ...eventos([degradado('2026-10-08T06:00:00Z')])];

  comprueba('una degradación de hace más de 26 h, o anterior a la pasada, no cuenta', estado(evalua(antiguo), 'op.mon.3.r2.1') === 'CUMPLE');

  const registroAusente = [
    ...hoy(sin('security_inspection_recorded')),
    ...eventos([{ _a: '000', ts: t(COMPLETA, 23), event: 'evidence_state', evidence_id: 'EV-12,EV-13', requisito: 'op.mon.3.r6.1,op.mon.3.r6.2,op.mon.3.r6.3', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de inspecciones /etc/ensfacil/security-inspection-register.tsv' }]),
  ];
  const r6 = evalua(registroAusente, ALTA, 'ALTO');

  comprueba('sin registro de inspecciones → R6.3 NO_EVALUABLE (CONFIGURATION), nunca CUMPLE por vacío', estado(r6, 'op.mon.3.r6.3') === 'NO_EVALUABLE' && causa(r6, 'op.mon.3.r6.3') === 'CONFIGURATION');
}

// --- 7. ALTA ---------------------------------------------------------------------

bloque('7. ALTA: refuerzos R3 a R6, documentales e inspecciones');

{
  const suricata = (ultima: string) =>
    en('network_detection_observed', { producto: 'suricata', fuente: 'syslog', ultima_alerta: ultima, alertas_24h: 2210 });
  const slack = (nivel: number, errores = 0): Linea[] => [
    { _a: '000', ts: t(COMPLETA, 22), event: 'notification_channel_configured', evidence_id: 'EV-09', requisito: 'op.mon.3.r5.2', plano: 'central',
      canal: 'slack', habilitado: 'si', nivel_minimo: nivel, grupos: '-', formato: 'json', destinatarios: '-', errores_24h: errores },
  ];
  const inspeccion = (fecha: string, tipo: string, extra: Linea = {}): Linea => ({
    _a: '000', ts: t(COMPLETA, 23), event: 'security_inspection_recorded', evidence_id: 'EV-12', requisito: 'op.mon.3.r6.1,op.mon.3.r6.2,op.mon.3.r6.3', plano: 'central',
    fila: 2, fecha, tipo, alcance: 'perímetro y aplicaciones web', ejecutor: 'Proveedor S.L.', hallazgos: '12 hallazgos, 2 críticos', estado_remediacion: 'en_remediacion', motivo: 'periodica', incidente_id: '-', referencia: 'pentest-2026', formato: 'ok', ...extra,
  });
  const conPentest = (fecha = '2026-03-12T00:00:00Z', extra: Linea = {}) =>
    [...hoy(l => (l.event === 'security_inspection_recorded' ? undefined : suricata('2026-10-09T11:50:00Z')(l))), ...eventos([inspeccion(fecha, 'pentest', extra)])];
  const correoSi = (evs: ENSNormalizedEvent[]) => evs;
  const verde = (evs = conPentest()) =>
    correoSi([
      ...evs.filter(e => e.eventType !== 'notification_channel_configured'),
      ...eventos([{ _a: '000', ts: t(COMPLETA, 22), event: 'notification_channel_configured', evidence_id: 'EV-09', requisito: 'op.mon.3.r5.2', plano: 'central', canal: 'correo', habilitado: 'si', nivel_minimo: 10, grupos: '-', formato: '-', destinatarios: 2, errores_24h: '-' }]),
    ]);

  const a = evalua(verde(), ALTA, 'ALTO');
  const todos = opMon3CatalogDefinition.requirements.filter(r => r.applicability.levels.includes('ALTO')).map(r => r.id);

  comprueba(
    'ALTA con todo declarado y operativo → los 11 requisitos cumplen',
    todos.every(id => a.requisito(id).status === 'CUMPLE'),
    todos.map(id => `${id}=${a.requisito(id).status}`).join(' ')
  );
  comprueba('R3.1 y R4 · acreditados documentalmente (P-ATT), nunca como medidos', a.requisito('op.mon.3.r3.1').attested === true && a.requisito('op.mon.3.r4.1').attested === true);
  comprueba('R3.1 y R4 · su decisión es NO_EVALUABLE (CONFIGURATION), así que P-ATT puede acreditar', estado(a, 'op.mon.3.r3.1') === 'NO_EVALUABLE' && causa(a, 'op.mon.3.r4.1') === 'CONFIGURATION');
  comprueba('EV-05 y EV-07 · NO_APLICA, dato del informe', ev(a, 'op.mon.3.r3.1', 'EV-05') === 'NO_APLICA' && /malicious-ip/.test(evMotivo(a, 'op.mon.3.r4.1', 'EV-07')));
  comprueba(
    'R6.1 y R6.2 continuos · con SCA y el detector; el registro no se exige',
    estado(a, 'op.mon.3.r6.1') === 'CUMPLE' && ev(a, 'op.mon.3.r6.1', 'EV-12') === 'NO_APLICA' && ev(a, 'op.mon.3.r6.2', 'EV-11') === 'CUMPLE'
  );
  comprueba('R6.3 · el pentest del 12/03 dentro de 365 días', estado(a, 'op.mon.3.r6.3') === 'CUMPLE' && /2026-03-12/.test(a.motivo('op.mon.3.r6.3')));

  // R3.2: la sonda.
  comprueba('R3.2 · sin NIDS → NO_CUMPLE aunque P-05 declare Suricata', estado(evalua(verde([...hoy(sin('security_inspection_recorded')), ...eventos([inspeccion('2026-03-12', 'pentest')])]), ALTA, 'ALTO'), 'op.mon.3.r3.2') === 'NO_CUMPLE');
  comprueba(
    'R3.2 · Suricata con su última alerta de hace 4 días y máximo 2 → NO_CUMPLE; reversión con máximo 7',
    estado(evalua(verde(conPentest().map(e => (e.eventType === 'network_detection_observed' ? { ...e, attributes: { ...e.attributes, ultima_alerta: '2026-10-05T11:50:00Z' } } : e))), ALTA, 'ALTO'), 'op.mon.3.r3.2') === 'NO_CUMPLE' &&
      estado(evalua(verde(conPentest().map(e => (e.eventType === 'network_detection_observed' ? { ...e, attributes: { ...e.attributes, ultima_alerta: '2026-10-05T11:50:00Z' } } : e))), { ...ALTA, 'P-05': ['Suricata | TAP | 7'] }, 'ALTO'), 'op.mon.3.r3.2') === 'CUMPLE'
  );

  // R5.1: las reglas de umbral.
  comprueba('R5.1 · la regla de P-07 no es de umbral → NO_CUMPLE', estado(evalua(verde(), { ...ALTA, 'P-07': ['BD expedientes | gestor | 500 | 1 h | 100510'] }, 'ALTO'), 'op.mon.3.r5.1') === 'NO_CUMPLE');
  comprueba('R5.1 · «ninguna» → NO_CUMPLE (consulta sin vigilar)', /ninguna regla vigila/.test(evalua(verde(), { ...ALTA, 'P-07': ['BD expedientes | gestor | 500 | 1 h | ninguna'] }, 'ALTO').motivo('op.mon.3.r5.1')));
  comprueba('R5.1 · «pendiente 2026-12» no se lee como rango → CONFIGURATION', causa(evalua(verde(), { ...ALTA, 'P-07': ['BD expedientes | gestor | 500 | 1 h | pendiente 2026-12'] }, 'ALTO'), 'op.mon.3.r5.1') === 'CONFIGURATION');
  comprueba('R5.1 · un rango que cubre la regla → CUMPLE', estado(evalua(verde(), { ...ALTA, 'P-07': ['BD expedientes | gestor | 500 | 1 h | 107210-107220'] }, 'ALTO'), 'op.mon.3.r5.1') === 'CUMPLE');

  // R5.2: los canales.
  comprueba('R5.2 · el correo deshabilitado (el laboratorio) → NO_CUMPLE', estado(evalua(conPentest(), ALTA, 'ALTO'), 'op.mon.3.r5.2') === 'NO_CUMPLE');

  const conSlack = (nivel: number, errores = 0) => [...conPentest(), ...eventos(slack(nivel, errores))];
  const porSlack = { ...ALTA, 'P-08': ['SOC | slack | 10 | 24x7'] };

  comprueba('R5.2 · slack desde el nivel 12 y P-08 lo exige desde el 10 → NO_CUMPLE', estado(evalua(conSlack(12), porSlack, 'ALTO'), 'op.mon.3.r5.2') === 'NO_CUMPLE');
  comprueba('reversión · slack desde el nivel 7 → CUMPLE', estado(evalua(conSlack(7), porSlack, 'ALTO'), 'op.mon.3.r5.2') === 'CUMPLE');
  comprueba('R5.2 · slack con 3 errores de envío en 24 h → NO_CUMPLE', estado(evalua(conSlack(7, 3), porSlack, 'ALTO'), 'op.mon.3.r5.2') === 'NO_CUMPLE');
  comprueba('R5.2 · nivel_minimo «alto» en P-08 → CONFIGURATION', causa(evalua(conSlack(7), { ...ALTA, 'P-08': ['SOC | slack | alto | 24x7'] }, 'ALTO'), 'op.mon.3.r5.2') === 'CONFIGURATION');

  // R6.3: el pentest y su periodicidad.
  comprueba('R6.3 · el mismo pentest con periodicidad 180 → NO_CUMPLE (vencido)', estado(evalua(verde(), { ...ALTA, 'P-09': ['verificacion_configuracion | continua | -', 'analisis_vulnerabilidades | continua | -', 'pentest | 180 | externo'] }, 'ALTO'), 'op.mon.3.r6.3') === 'NO_CUMPLE');
  comprueba('R6.3 · registro vacío → NO_CUMPLE («no consta ninguna»)', /No consta ninguna prueba de penetración/.test(evalua(hoy(suricata('2026-10-09T11:50:00Z')), ALTA, 'ALTO').motivo('op.mon.3.r6.3')));
  comprueba('R6.3 · pentest «continua» en P-09 → CONFIGURATION', causa(evalua(verde(), { ...ALTA, 'P-09': ['pentest | continua | externo'] }, 'ALTO'), 'op.mon.3.r6.3') === 'CONFIGURATION');
  comprueba('R6.3 · periodicidad «anual» (no es un número de días) → CONFIGURATION', causa(evalua(verde(), { ...ALTA, 'P-09': ['pentest | anual | externo'] }, 'ALTO'), 'op.mon.3.r6.3') === 'CONFIGURATION');

  const malFila = [...conPentest(), ...eventos([inspeccion('03/2026', 'pentest', { fila: 3, formato: 'fecha «03/2026» no es AAAA-MM-DD' })])];

  comprueba(
    'R6 · una fila con formato inválido no cuenta y se dice (CONFIGURATION), y la buena sigue acreditando',
    /línea 3: fecha «03\/2026»/.test(evalua(verde(malFila), ALTA, 'ALTO').motivo('op.mon.3.r6.3')) && estado(evalua(verde(malFila), ALTA, 'ALTO'), 'op.mon.3.r6.3') === 'NO_EVALUABLE'
  );

  // R6.1 periódico: SCA no basta, pero la fila del registro sí.
  const periodica = { ...ALTA, 'P-09': ['verificacion_configuracion | 90 | interno', 'analisis_vulnerabilidades | continua | -', 'pentest | 365 | externo'] };
  const scaRoto = conPentest().map(e => (e.eventType === 'config_assessment_observed' && e.attributes?.agente_id === '024' ? { ...e, attributes: { ...e.attributes, ultimo_fin: '2026-10-01T00:00:00Z' } } : e));

  comprueba('R6.1 periódica · SCA viejo y sin fila del registro → NO_CUMPLE', estado(evalua(verde(scaRoto), periodica, 'ALTO'), 'op.mon.3.r6.1') === 'NO_CUMPLE');

  const conRevision = [...scaRoto, ...eventos([inspeccion('2026-08-20', 'verificacion_configuracion', { fila: 4, ejecutor: 'interno', motivo: 'periodica' })])];

  comprueba('reversión · con una verificación del 20/08 dentro de 90 días → CUMPLE con el registro', estado(evalua(verde(conRevision), periodica, 'ALTO'), 'op.mon.3.r6.1') === 'CUMPLE' && /Acreditada con el registro/.test(evalua(verde(conRevision), periodica, 'ALTO').motivo('op.mon.3.r6.1')));
  comprueba('y R2 (MEDIA) sigue en NO_CUMPLE por ese SCA: la inspección no tapa la medida de R2', estado(evalua(verde(conRevision), periodica, 'ALTO'), 'op.mon.3.r2.1') === 'NO_CUMPLE');

  // EV-13: se informa.
  const conIncidente = [
    ...verde(),
    ...eventos([
      { _a: '000', ts: t(COMPLETA, 24), event: 'incident_registered', evidence_id: 'EV-13', requisito: 'op.mon.3.r6.1', plano: 'central', incidente_id: 'INC-2026-007', fecha: '2026-09-18T08:00:00Z', severidad: 'alta', sistemas: 'wazuh-real', clasificacion: 'malware', referencia: '-', fila: 5 },
      inspeccion('2026-09-20', 'analisis_vulnerabilidades', { fila: 6, motivo: 'post_incidente', incidente_id: 'INC-2026-007' }),
    ]),
  ].filter(e => !(e.eventType === 'incident_registered' && e.attributes?.incidente_id === 'ninguno'));
  const e13 = evalua(conIncidente, ALTA, 'ALTO');

  comprueba(
    'EV-13 · NO_APLICA con el cruce: el incidente y su inspección posterior',
    ev(e13, 'op.mon.3.r6.1', 'EV-13') === 'NO_APLICA' && /INC-2026-007 \(analisis_vulnerabilidades del 2026-09-20/.test(evMotivo(e13, 'op.mon.3.r6.1', 'EV-13')),
    evMotivo(e13, 'op.mon.3.r6.1', 'EV-13')
  );

  // El informe en ALTA.
  const informe = buildOpMon3ReportModel(evalua(verde(), ALTA, 'ALTO').motor());

  comprueba(
    'informe ALTA · R3.1 y R4 «acreditado documentalmente»; componentes externos con su estado',
    /Acreditado documentalmente/.test(informe.fields[4].value) &&
      /Sonda de detección en red \(R3\.2\): desplegado y operativo/.test(informe.fields[10].details.join(' ')) &&
      /Servicio de cibervigilancia \(R4\): acreditado documentalmente/.test(informe.fields[10].details.join(' ')),
    informe.fields[10].details.join(' | ')
  );

  const sinSonda = buildOpMon3ReportModel(evalua(verde([...hoy(sin('security_inspection_recorded')), ...eventos([inspeccion('2026-03-12', 'pentest')])]), ALTA, 'ALTO').motor());

  comprueba('informe ALTA · sin sonda, «no cubierto»', /R3\.2\): no cubierto/.test(sinSonda.fields[10].details.join(' ')) && sinSonda.fields[10].status === 'NO_CUMPLE');
}

// --- 8. estado, cadencia y presupuesto ------------------------------------------------

bloque('8. Estado y dos cadencias; partes de ids; presupuesto de hechos');

{
  // Cinco pasadas horarias después de la completa no borran sus hechos.
  const horarias = ['13:05', '14:05', '15:05', '16:05', '17:05'].flatMap(h =>
    pasadaHoraria(`2026-10-09T${h}`, { eventos_procesados: 1210450 + Number(h.slice(0, 2)) * 1000 })
  );
  const a1730 = new Date('2026-10-09T17:30:00Z');
  const conHorarias = eventos([...pasadaHoraria(), ...pasadaCompleta(), ...horarias]);

  comprueba('cinco pasadas horarias no borran los hechos de 6 h (R2 sigue medido)', estado(evalua(conHorarias, BASE, 'MEDIO', a1730), 'op.mon.3.r2.1') === 'CUMPLE');

  // La siguiente completa sí los reemplaza: 024 deja de tener SCA reciente.
  const siguiente = pasadaCompleta('2026-10-09T18:05').map(l =>
    l.event === 'config_assessment_observed' && l.agente_id === '024' ? { ...l, ultimo_fin: '2026-10-08T01:00:00Z' } : l
  );
  const conSiguiente = eventos([...pasadaHoraria(), ...pasadaCompleta(), ...horarias, ...siguiente]);

  comprueba('la siguiente completa los reemplaza: el SCA de 024 de la de las 18:05 manda', estado(evalua(conSiguiente, BASE, 'MEDIO', new Date('2026-10-09T18:30:00Z')), 'op.mon.3.r2.1') === 'NO_CUMPLE');

  // Las pasadas de un agente no delimitan las del manager, ni al revés.
  comprueba(
    'la pasada de wazuh-real (12:20) no borra la del manager (12:05), ni la del LDAP (12:25) la de wazuh-real',
    estado(evalua(hoy()), 'op.mon.3.r2.1') === 'CUMPLE' && estado(evalua(hoy(), BASE, 'MEDIO', AHORA, '024'), 'op.mon.3.1') === 'CUMPLE'
  );

  // Ids de las reglas de umbral en dos partes.
  const muchos = Array.from({ length: 1500 }, (_, i) => String(200000 + i * 2));
  const corta = (ids: string[], max = 6000): string[] => {
    const partes: string[] = [];
    let actual = '';

    ids.forEach(id => {
      if (actual && actual.length + id.length + 1 > max) {
        partes.push(actual);
        actual = id;
      } else {
        actual = actual ? `${actual},${id}` : id;
      }
    });

    return actual ? [...partes, actual] : partes;
  };
  const partes = corta([...muchos, '107215']);
  const lineasUmbral = partes.map((ids, i) => ({
    _a: '000', ts: t(COMPLETA, 21), event: 'query_volume_rules_observed', evidence_id: 'EV-08', requisito: 'op.mon.3.r5.1', plano: 'central',
    ids, reglas_umbral: muchos.length + 1, parte: i + 1, partes: partes.length,
  }));
  const conPartes = (cuales: number[]) => [...hoy(sin('query_volume_rules_observed')), ...eventos(lineasUmbral.filter((_, i) => cuales.includes(i)))];
  const jsonMasLargo = Math.max(...lineasUmbral.map(l => JSON.stringify({ ensfacil: 'op.mon.3', host: 'wazuh-4', ...l }).length));

  comprueba(`1501 ids sueltos en ${partes.length} partes; ninguna línea pasa de 8 KiB (${jsonMasLargo})`, partes.length >= 2 && jsonMasLargo < 8192);
  comprueba('las partes se unen: la regla de P-07 en la última parte se encuentra', estado(evalua(conPartes(partes.map((_, i) => i)), ALTA, 'ALTO'), 'op.mon.3.r5.1') === 'CUMPLE');
  comprueba('si falta la parte que la trae → NO_EVALUABLE (COLLECTION), no NO_CUMPLE', estado(evalua(conPartes([0]), ALTA, 'ALTO'), 'op.mon.3.r5.1') === 'NO_EVALUABLE' && causa(evalua(conPartes([0]), ALTA, 'ALTO'), 'op.mon.3.r5.1') === 'COLLECTION');

  // Un día del laboratorio: 24 pasadas del manager (4 completas) y 4 emisiones
  // de cada agente con recolector.
  const dia: Linea[] = [];

  for (let h = 0; h < 24; h += 1) {
    const ts = `2026-10-09T${String(h).padStart(2, '0')}:05`;

    dia.push(...(h % 6 === 0 ? pasadaCompleta(ts) : pasadaHoraria(ts)));
  }

  ['00:20', '06:20', '12:20', '18:20'].forEach(h => {
    dia.push(...pasadaAgente('024', `2026-10-09T${h}`), ...pasadaAgente('028', `2026-10-09T${h.replace('20', '25')}`));
  });

  comprueba(`un día del laboratorio de la fixture: ${dia.length} hechos, menos de 300`, dia.length < 300);
}

// --- 9. el motor entero: tres filas y el consolidado ------------------------------------

bloque('9. El motor: op.mon.3 en la fila del manager y en las de agente, y el consolidado');

{
  // `kibana-services` de mentira, ANTES de cargar el motor (como en
  // measurement-planes.test.ts).
  const Module = require('module');
  const cargar = Module._load;

  Module._load = function (peticion: string, ...resto: unknown[]) {
    if (/kibana-services$/.test(peticion)) {
      return {};
    }

    return cargar.call(this, peticion, ...resto);
  };

  const { ensConfigurationRepository } = require('../public/ens/configuration/repository');
  const { defaultENSConfigurationTemplate } = require('../public/ens/configuration/data/default-configuration');
  const { getENSComplianceState } = require('../public/ens/core/ens-engine');

  const conValores = (valores: Valores) =>
    ensConfigurationRepository.replaceActive({
      ...defaultENSConfigurationTemplate,
      global: { ...defaultENSConfigurationTemplate.global, clientName: 'Cliente de prueba', organization: 'Organización de prueba', scope: 'Laboratorio', ensLevel: 'MEDIO' },
      controls: defaultENSConfigurationTemplate.controls.map((control: { controlId: string }) =>
        control.controlId === 'op.mon.3' ? configuracion(valores) : control
      ),
    });

  const alcance = [
    { id: '000', name: 'Wazuh-4', groups: [], isManager: true },
    { id: '024', name: 'wazuh-real', groups: ['ens'] },
    { id: '028', name: 'ldap-zimbra', groups: ['ens'] },
  ];
  const resultado = (evs: ENSNormalizedEvent[]) => {
    const estadoMotor = getENSComplianceState('MEDIO', evs, undefined, alcance, AHORA);
    const porFila = (id: string) =>
      estadoMotor.agents.find((a: { agentId: string }) => a.agentId === id)?.results.find((r: { control: { id: string } }) => r.control.id === 'op.mon.3');
    const consolidado = estadoMotor.results.find((r: { control: { id: string } }) => r.control.id === 'op.mon.3');
    const req = (r: any, id: string) => r?.requirements.find((q: { id: string }) => q.id === id)?.status;

    return { porFila, consolidado, req };
  };

  conValores(BASE);

  const verde = resultado(hoy());

  comprueba(
    'op.mon.3 está en las tres filas y el consolidado cumple en MEDIA',
    ['000', '024', '028'].every(id => verde.porFila(id)) && verde.consolidado?.status === 'CUMPLE',
    `${verde.consolidado?.status} · ${['op.mon.3.1', 'op.mon.3.r1.1', 'op.mon.3.r2.1'].map(id => `${id}=${verde.req(verde.consolidado, id)}`).join(' ')}`
  );
  comprueba('en la fila de un agente, R2 no aplica; en el consolidado, R2 es el del manager', verde.req(verde.porFila('024'), 'op.mon.3.r2.1') === 'NO_APLICA' && verde.req(verde.consolidado, 'op.mon.3.r2.1') === 'CUMPLE');

  const caido = resultado(hoy(en('agent_forwarding_observed', { conexion: 'disconnected' }, l => l._a === '028')));

  comprueba(
    'el LDAP desconectado al leerlo: su fila y el consolidado no cumplen op.mon.3.1; la del manager sí',
    caido.req(caido.porFila('028'), 'op.mon.3.1') === 'NO_CUMPLE' && caido.req(caido.consolidado, 'op.mon.3.1') === 'NO_CUMPLE' && caido.req(caido.porFila('000'), 'op.mon.3.1') === 'CUMPLE'
  );

  conValores({ ...BASE, 'P-01': [...(BASE['P-01'] as string[]), 'copias de srv-copias | Linux | agente | srv-copias | /var/log/syslog | 24'] });

  const fuera = resultado(hoy());

  comprueba(
    'una fuente de P-01 en un agente activo FUERA del alcance: no hay fila que la mida y el consolidado no cumple op.mon.3.1',
    !fuera.porFila('030') && fuera.req(fuera.porFila('000'), 'op.mon.3.1') === 'NO_CUMPLE' && fuera.req(fuera.consolidado, 'op.mon.3.1') === 'NO_CUMPLE',
    `${fuera.req(fuera.porFila('000'), 'op.mon.3.1')} / ${fuera.req(fuera.consolidado, 'op.mon.3.1')}`
  );

  conValores(BASE);

  const lab = resultado(hoy(undefined, { detector: { errores_indexacion_24h: 37, muestra_error: 'circuit_breaking_exception' } }));

  comprueba('el laboratorio de hoy (indexer sin memoria): el consolidado no cumple R2', lab.req(lab.consolidado, 'op.mon.3.r2.1') === 'NO_CUMPLE');
}

// ---------------------------------------------------------------------------

console.log(`\n${fallos.length ? `${fallos.length} FALLAN` : 'todo en verde'}`);

if (fallos.length) {
  process.exit(1);
}
