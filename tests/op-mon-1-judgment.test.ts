/**
 * op.mon.1 · el juicio de la detección de intrusión.
 *
 *     npx tsx tests/op-mon-1-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. Todo op.mon.1 se mide en el manager (agent.id=000) y sus
 * hechos hablan de OTROS sistemas por su campo `agente`: la policy cruza cada
 * fila de P-01 con su hecho por ID o por nombre exacto. Cada caso mueve UN eje y
 * lleva al lado la REVERSIÓN: el MISMO hecho con otro parámetro, u otro `now`,
 * cambia el veredicto.
 *
 * Los hechos siguen el contrato de eventos de op.mon.1 (el que documenta el
 * runbook `linux/op.mon.1`), con los agentes y el ruleset de wazuh4 del
 * 09/10/2026. El recolector todavía no existe: cuando exista, se sustituyen por
 * su salida real en modo --prueba. Pasan por el normalizador real como alertas
 * de alerts.json.
 */
import { opMon1PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-mon-1.policy';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { opMon1CatalogDefinition } from '../public/ens/catalog/op-mon-1';
import { opMon1Configuration } from '../public/ens/configuration/data/op-mon-1-parameters';
import { normalizeWazuhAlerts } from '../public/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../public/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { parseRequirementAttestations } from '../public/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../public/ens/configuration/services/parameter-value-validator';
import { buildOpMon1ReportModel } from '../public/ens/reports/op-mon-1-report-model';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../public/ens/configuration/types';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';

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

// --- los hechos ------------------------------------------------------------

type Linea = Record<string, unknown>;

// Las pasadas del recolector del manager: la horaria (solo el motor) a las
// 11:05 y la completa de 6 h a las 12:05.
const HORARIA = '2026-10-09T11:05';
const COMPLETA = '2026-10-09T12:05';

const AHORA = new Date('2026-10-09T12:30:00Z');

const motor = (ts: string, extra: Linea = {}): Linea => ({
  ts, event: 'detection_engine_status', evidence_id: 'EV-01', requisito: 'op.mon.1.1,op.mon.1.r1.1', plano: 'central',
  activo: 'si', eventos_recibidos: 1203345, eventos_procesados: 1203300, eventos_descartados: 0, alertas_escritas: 45210,
  fuente_contadores: '/var/ossec/var/run/wazuh-analysisd.state', alertas_nuevas: 812, ...extra,
});

const latido = (ts: string, cubiertas: string): Linea => ({
  ts, event: 'collector_run', resultado: 'completada', evidencias_cubiertas: cubiertas, tipo_servidor: 'manager', emisor: 'recolector',
});

const CUBRE_COMPLETA = 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-07,EV-08';

const cobertura = (ts: string, id: string, agente: string, estado: string, extra: Linea = {}): Linea => ({
  ts, event: 'detection_coverage_observed', evidence_id: 'EV-02', requisito: 'op.mon.1.1', plano: 'central',
  agente_id: id, agente, estado_conexion: estado, ultimo_keepalive: '2026-10-09T12:04:50Z', version_agente: 'v4.14.7',
  grupos: 'default,ens', fim_ultimo_fin: '2026-10-09T06:02:11Z', sca_ultimo_fin: '2026-10-09T05:59:40Z',
  inventario_ultimo: '2026-10-09T11:20:03Z', ...extra,
});

const actividad = (ts: string, id: string, agente: string, ultima: string, extra: Linea = {}): Linea => ({
  ts, event: 'detection_activity_observed', evidence_id: 'EV-03', requisito: 'op.mon.1.1', plano: 'central',
  agente_id: id, agente, ultima_alerta: ultima, alertas_24h: 120, nivel_max_24h: 7, reglas_distintas_24h: 14,
  tecnicas_mitre: 'T1078,T1110', observado_desde: '2026-10-01T00:00:00Z', ...extra,
});

// Rangos de ids de reglas que pueden alertar, como los comprime el recolector.
const conjunto = (ts: string, nombre: string, ruta: string, ids: string, reglas: number, parte = 1, partes = 1): Linea => ({
  ts, event: 'ruleset_rules_loaded', evidence_id: 'EV-04', requisito: 'op.mon.1.1', plano: 'central',
  conjunto: nombre, ruta, ids, reglas, parte, partes,
});

// wazuh4 a las 12:05: el manager, wazuh-real y el LDAP conectados; un agente de
// prueba desconectado desde el 04/09 y otro de Windows que nunca conectó.
const pasadaCompleta = (ts = COMPLETA): Linea[] => {
  const t = (s: number) => `${ts}:${String(s).padStart(2, '0')}Z`;

  return [
    motor(t(10), { eventos_procesados: 1210450, eventos_recibidos: 1210500, alertas_escritas: 45390 }),
    { ts: t(12), event: 'ruleset_version_observed', evidence_id: 'EV-01', requisito: 'op.mon.1.1,op.mon.1.r1.1', plano: 'central',
      version_wazuh: '4.14.7', origen_version: 'dpkg', fecha_ruleset: '2026-07-10T08:12:44Z', fichero_mas_reciente: '0580-win-security_rules.xml',
      ficheros: 167, reglas: 4510, reglas_mitre: 1013 },
    cobertura(t(14), '000', 'Wazuh-4', 'active', { grupos: '-', fim_ultimo_fin: '2026-10-09T07:40:00Z', sca_ultimo_fin: '2026-10-09T03:15:00Z' }),
    cobertura(t(14), '024', 'wazuh-real', 'active'),
    cobertura(t(14), '027', 'srv-prueba', 'disconnected', { ultimo_keepalive: '2026-09-04T10:00:12Z', fim_ultimo_fin: '2026-09-04T09:40:00Z', sca_ultimo_fin: '2026-09-04T03:00:00Z' }),
    cobertura(t(14), '028', 'ldap-zimbra', 'active', { fim_ultimo_fin: '2026-10-09T08:30:00Z', sca_ultimo_fin: '2026-10-09T08:31:00Z' }),
    cobertura(t(14), '033', 'win-prueba', 'never_connected', { ultimo_keepalive: '-', version_agente: '-', grupos: '-', fim_ultimo_fin: '-', sca_ultimo_fin: '-', inventario_ultimo: '-' }),
    actividad(t(16), '000', 'Wazuh-4', '2026-10-09T12:01:07Z', { alertas_24h: 866, nivel_max_24h: 10, reglas_distintas_24h: 41 }),
    actividad(t(16), '024', 'wazuh-real', '2026-10-09T11:58:30Z', { alertas_24h: 2875 }),
    actividad(t(16), '027', 'srv-prueba', '2026-09-04T09:58:00Z', { alertas_24h: 0, nivel_max_24h: 0, reglas_distintas_24h: 0, tecnicas_mitre: '-' }),
    actividad(t(16), '028', 'ldap-zimbra', '2026-10-09T09:30:00Z', { alertas_24h: 64, tecnicas_mitre: '-' }),
    actividad(t(16), '033', 'win-prueba', '-', { alertas_24h: 0, nivel_max_24h: 0, reglas_distintas_24h: 0, tecnicas_mitre: '-' }),
    conjunto(t(18), 'wazuh', '/var/ossec/ruleset/rules', '1002-1010,2501-2504,5104-5108,5401-5407,5501-5557,5701-5799,80700-80799,87100-87105', 4510),
    conjunto(t(18), 'local', '/var/ossec/etc/rules', '100001-100002', 2),
    conjunto(t(18), 'quersystem', '/var/ossec/etc/rules', '107201-107226', 26),
    { ts: t(20), event: 'network_detection_observed', evidence_id: 'EV-05', requisito: 'op.mon.1.1', plano: 'central',
      producto: 'ninguno', fuente: '-', ultima_alerta: '-', alertas_24h: 0 },
    { ts: t(22), event: 'active_response_configured', evidence_id: 'EV-07', requisito: 'op.mon.1.r3.1', plano: 'central',
      comando: 'firewall-drop', comando_definido: 'si', ubicacion: 'local', agente_id: '-', reglas_id: '5763', grupos: '-', nivel: '-', timeout: '180', deshabilitada: 'no' },
    { ts: t(22), event: 'active_response_configured', evidence_id: 'EV-07', requisito: 'op.mon.1.r3.1', plano: 'central',
      comando: 'quersystem-yara-linux', comando_definido: 'si', ubicacion: 'local', agente_id: '-', reglas_id: '108100,108101', grupos: '-', nivel: '-', timeout: '-', deshabilitada: 'no' },
    { ts: t(24), event: 'rule_silenced', evidence_id: 'EV-08', requisito: 'op.mon.1.r1.1', plano: 'central',
      tipo: 'fichero_excluido', objeto: '0215-policy_rules.xml', fichero: '/var/ossec/etc/ossec.conf' },
    latido(t(40), CUBRE_COMPLETA),
  ];
};

const pasadaHoraria = (ts = HORARIA, extra: Linea = {}): Linea[] => [
  motor(`${ts}:10Z`, extra),
  latido(`${ts}:12Z`, 'EV-01'),
];

let contador = 0;

const REGLA: Record<string, string> = {
  detection_engine_status: '111201', ruleset_version_observed: '111202', detection_coverage_observed: '111203',
  detection_activity_observed: '111204', ruleset_rules_loaded: '111205', network_detection_observed: '111206',
  active_response_configured: '111207', active_response_executed: '111208', rule_silenced: '111209',
  evidence_state: '111250', collector_run: '111297',
};

const MANAGER = { id: '000', name: 'Wazuh-4' };

// Una línea del NDJSON del recolector tal como la deja el manager en el índice.
const alerta = (linea: Linea) => {
  contador += 1;
  const { ts, host: _host, ...data } = linea as Linea & { ts: string };

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts,
      agent: MANAGER,
      rule: { id: REGLA[String(data.event)] || '111200', description: 'op.mon.1' },
      location: '/var/log/ensfacil/op_mon_1.json',
      data: Object.fromEntries(Object.entries({ ensfacil: 'op.mon.1', ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const eventos = (lineas: Linea[], cambia: (l: Linea) => Linea | undefined = l => l): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas
      .map(l => cambia({ ...l }))
      .filter((l): l is Linea => Boolean(l))
      .map(alerta)
  );

// Lo que hoy está en wazuh4: la horaria de las 11:05 y la completa de las 12:05.
const hoy = (cambia?: (l: Linea) => Linea | undefined) =>
  eventos([...pasadaHoraria(), ...pasadaCompleta()], cambia);

// --- la configuración --------------------------------------------------------

type Valores = Record<string, string[] | string | undefined>;

const configuracion = (valores: Valores): ENSControlConfiguration => ({
  ...opMon1Configuration,
  parameters: opMon1Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    // Un parámetro vacío es la clave `value` AUSENTE, nunca `null`.
    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

// Lo que el responsable declararía para el laboratorio (spec §1.5): solo los
// sistemas reales, el manager por su nombre y el LDAP por su ID.
const BASE: Valores = {
  'P-01': ['Wazuh-4 | Ubuntu 22.04 | alta', 'wazuh-real | Ubuntu 24.04 | alta', '028 | Ubuntu 22.04 | alta'],
  'P-02': ['no | - | AR-2026 §4.2: sin amenazas de red que exijan inspección de tráfico'],
  'P-03': ['wazuh | ruleset oficial de Wazuh | 4510'],
  'P-04': ['acceso no autorizado por SSH | servidores Linux | 5710, 5712, 5720', 'escalada con sudo | servidores Linux | 5401-5403'],
  'P-05': ['intrusión en servidor | PR-18 Respuesta a intrusión | Responsable de Seguridad'],
  'P-06': ['0215-policy_rules.xml | exclusión de fábrica de Wazuh | RSI'],
  'P-07': ['firewall-drop | fuerza bruta SSH (5763) | agente | 180 s'],
  'P-08': '180',
  'P-09': '7',
  'P-10': '26',
};

const SIN_PARAMETROS: Valores = {};

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Valores = BASE,
  nivel: ENSLevel = 'MEDIO',
  ahora: Date = AHORA
) => {
  const cfg = configuracion(valores);
  const delControl = keepLatestRunStateFacts('op.mon.1', evs, ahora);
  const evidencias = resolveEvidenceForControl('op.mon.1', delControl, '000', nivel, cfg, ahora);
  const contexto = buildPolicyContext(opMon1CatalogDefinition, cfg, nivel, delControl, evidencias, ahora);
  const { decisions, runtimeVariables } = opMon1PolicyDefinition.evaluator!(contexto);
  const tabla = applyPolicyDecisionsToEvidences(evidencias, decisions, opMon1CatalogDefinition.requirements);
  const atestaciones = parseRequirementAttestations(cfg);
  const requisito = (id: string) =>
    evaluateRequirement(
      opMon1CatalogDefinition.requirements.find(q => q.id === id)!,
      nivel,
      tabla,
      false,
      decisions,
      'ACTIVE',
      atestaciones.get(id)
    );
  const evidencia = (id: string) => tabla.find(e => e.id === id);
  const motivo = (req: string) => decisions.find(d => d.requirementId === req)?.reason || '';
  // La decisión de UNA evidencia (la del requisito lleva `trace.ruleId` sin barra).
  const deEvidencia = (req: string, ev: string) => decisions.find(d => d.trace.ruleId === `${req}/${ev}`);
  const motor = () =>
    evaluateENSControl(
      opMon1CatalogDefinition,
      cfg,
      nivel,
      evidencias,
      {
        controlId: 'op.mon.1',
        policyId: opMon1PolicyDefinition.id,
        evaluatedAt: ahora.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      delControl
    );

  return { decisions, runtimeVariables, requisito, evidencia, motivo, deEvidencia, motor };
};

// --- 1. catálogo ------------------------------------------------------------

bloque('1. Catálogo: categoría del sistema, plano del manager y refuerzos');

{
  const niveles = (id: string) =>
    opMon1CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  comprueba('op.mon.1 se rige por la categoría (sin dimensión propia)', opMon1CatalogDefinition.levelDimension === undefined);
  comprueba('se mide solo en el manager', JSON.stringify(opMon1CatalogDefinition.measurementPlanes) === '["manager"]');
  comprueba('la base rige en las tres categorías', niveles('op.mon.1.1') === 'BAJO,MEDIO,ALTO');
  comprueba('R1 desde MEDIA', niveles('op.mon.1.r1.1') === 'MEDIO,ALTO');
  comprueba('R2 solo en ALTA', niveles('op.mon.1.r2.1') === 'ALTO');
  comprueba('R3 en ninguna (definido, no exigido)', niveles('op.mon.1.r3.1') === '');
  comprueba('el control está ACTIVE', opMon1CatalogDefinition.status === 'ACTIVE', opMon1CatalogDefinition.status);
  comprueba(
    'R2 no declara ninguna evidencia técnica (documental: P-05 o P-ATT)',
    opMon1CatalogDefinition.requirements.find(r => r.id === 'op.mon.1.r2.1')!.evidenceIds.length === 0
  );
  comprueba(
    'EV-06 no la juzga ningún requisito (dato del informe)',
    opMon1CatalogDefinition.requirements.every(r => !r.evidenceIds.includes('EV-06'))
  );
  comprueba(
    'la policy declara los mismos niveles y evidencias que el catálogo',
    opMon1PolicyDefinition.requirements.every(r => {
      const c = opMon1CatalogDefinition.requirements.find(q => q.id === r.requirementId)!;

      return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',');
    })
  );
  comprueba(
    'el motor y los hechos de serie no son hechos de estado; los de 6 h, sí',
    !getStateFactEventTypes('op.mon.1').has('detection_engine_status') &&
      !getStateFactEventTypes('op.mon.1').has('ruleset_version_observed') &&
      !getStateFactEventTypes('op.mon.1').has('active_response_executed') &&
      ['detection_coverage_observed', 'detection_activity_observed', 'ruleset_rules_loaded', 'network_detection_observed', 'active_response_configured', 'rule_silenced'].every(t => getStateFactEventTypes('op.mon.1').has(t))
  );
}

// --- 2. verde: el laboratorio tal como se declararía --------------------------

bloque('2. Verde: P-01 con los sistemas reales, ruleset del 10/07 bajo P-08 = 180');

{
  const r = evalua(hoy());

  comprueba('op.mon.1.1 CUMPLE en MEDIA', r.requisito('op.mon.1.1').status === 'CUMPLE' && r.requisito('op.mon.1.1').evidenced === true, r.motivo('op.mon.1.1'));
  comprueba('op.mon.1.r1.1 CUMPLE: ruleset de 91 días, 0215-policy_rules.xml declarada en P-06', r.requisito('op.mon.1.r1.1').status === 'CUMPLE', r.motivo('op.mon.1.r1.1'));
  comprueba('R2 NO_APLICA en MEDIA', r.requisito('op.mon.1.r2.1').status === 'NO_APLICA', r.requisito('op.mon.1.r2.1').status);
  comprueba('R3 NO_APLICA siempre', r.requisito('op.mon.1.r3.1').status === 'NO_APLICA', r.requisito('op.mon.1.r3.1').status);
  comprueba('EV-01: el motor procesa (7150 eventos entre las dos pasadas)', r.evidencia('EV-01')?.status === 'CUMPLE' && /7150 eventos entre/.test(r.motivo('op.mon.1.1')), r.motivo('op.mon.1.1'));
  comprueba('EV-02 CUMPLE y nombra al LDAP declarado por su ID', r.evidencia('EV-02')?.status === 'CUMPLE' && /028 \(ldap-zimbra, 028\)/.test(r.deEvidencia('op.mon.1.1', 'EV-02')?.reason || ''), r.deEvidencia('op.mon.1.1', 'EV-02')?.reason);
  comprueba(
    'los agentes de prueba fuera de P-01 no cuentan, pero se dicen',
    /Fuera de P-01 hay 2 agente\(s\)/.test(r.deEvidencia('op.mon.1.1', 'EV-02')?.reason || '') && /srv-prueba 027 disconnected/.test(r.deEvidencia('op.mon.1.1', 'EV-02')?.reason || ''),
    r.deEvidencia('op.mon.1.1', 'EV-02')?.reason
  );
  comprueba('EV-04 CUMPLE: 5710 y 5401-5403 cargadas en el conjunto wazuh', r.evidencia('EV-04')?.status === 'CUMPLE' && /5710 \(wazuh\)/.test(r.deEvidencia('op.mon.1.1', 'EV-04')?.reason || ''), r.deEvidencia('op.mon.1.1', 'EV-04')?.reason);
  comprueba('EV-05 NO_APLICA: P-02 = no con la referencia al análisis de riesgos', r.evidencia('EV-05')?.status === 'NO_APLICA' && /AR-2026/.test(r.deEvidencia('op.mon.1.1', 'EV-05')?.reason || ''), r.evidencia('EV-05')?.status);
  comprueba('EV-06 NO_APLICA en MEDIA (no es de su categoría)', r.evidencia('EV-06')?.status === 'NO_APLICA', r.evidencia('EV-06')?.status);
  comprueba(
    'EV-07 NO_APLICA con lo que hay: R3 se informa, sin veredicto',
    r.evidencia('EV-07')?.status === 'NO_APLICA' && (r.evidencia('EV-07')?.observations || []).some(o => /se informa, sin veredicto/.test(o) && /firewall-drop/.test(o)),
    (r.evidencia('EV-07')?.observations || []).join(' | ')
  );
  comprueba(
    'y la cobertura de hecho de R3 viaja como variable (CUMPLE: firewall-drop con reversión 180 s)',
    r.runtimeVariables.find(v => v.name === 'cobertura_de_hecho_R3')?.value === 'CUMPLE',
    r.runtimeVariables.find(v => v.name === 'cobertura_de_hecho_R3')?.description
  );

  const basica = evalua(hoy(), BASE, 'BAJO');
  comprueba('en BÁSICA, R1 NO_APLICA y EV-08 también', basica.requisito('op.mon.1.r1.1').status === 'NO_APLICA' && basica.evidencia('EV-08')?.status === 'NO_APLICA', `${basica.requisito('op.mon.1.r1.1').status} ${basica.evidencia('EV-08')?.status}`);
  comprueba(
    'en BÁSICA sin P-03, EV-01 sigue CUMPLE: los conjuntos de P-03 son de R1',
    evalua(hoy(), { ...BASE, 'P-03': undefined }, 'BAJO').evidencia('EV-01')?.status === 'CUMPLE'
  );
  comprueba('el informe enseña los requisitos con su veredicto', buildOpMon1ReportModel(r.motor()).fields[0].details.some(d => /op\.mon\.1\.1 .*: CUMPLE/.test(d)));
}

// --- 3. R2: acreditado documentalmente ---------------------------------------

bloque('3. R2 en ALTA: P-05 lo acredita documentalmente; P-ATT si no hay P-05');

{
  const r = evalua(hoy(), BASE, 'ALTO');
  const r2 = r.requisito('op.mon.1.r2.1');

  comprueba('P-05 completa → R2 CUMPLE marcado `attested`', r2.status === 'CUMPLE' && r2.attested === true && r2.evidenced === true, `${r2.status} ${r2.attested}`);
  comprueba('y se lee «Acreditado documentalmente», no como medido', /^Acreditado documentalmente/.test(r2.observations[0] || ''), r2.observations[0]);
  comprueba(
    'EV-06 sale NO_APLICA como dato del informe, no en gris',
    r.evidencia('EV-06')?.status === 'NO_APLICA' && (r.evidencia('EV-06')?.observations || []).some(o => /Dato del informe/.test(o)),
    r.evidencia('EV-06')?.status
  );
  comprueba(
    'la acreditación no rellena ninguna evidencia (el puente la ignora)',
    r.decisions.filter(d => d.attested).every(d => d.evidenceIds.length === 0)
  );

  const informe = buildOpMon1ReportModel(r.motor());
  const campoR2 = informe.fields.find(f => f.id === 'op.mon.1.campo9')!;
  comprueba('el informe dice «Acreditado documentalmente» en R2', campoR2.status === 'CUMPLE' && /Acreditado documentalmente/.test(campoR2.value), campoR2.value);

  const incompleta = evalua(hoy(), { ...BASE, 'P-05': ['intrusión en servidor | PR-18 Respuesta a intrusión | '] }, 'ALTO');
  comprueba(
    'una fila de P-05 sin responsable no acredita: R2 no demostrado, causa CONFIGURATION',
    incompleta.requisito('op.mon.1.r2.1').status === 'NO_CUMPLE' && incompleta.requisito('op.mon.1.r2.1').evidenced === false && incompleta.decisions.find(d => d.requirementId === 'op.mon.1.r2.1')?.cause === 'CONFIGURATION',
    incompleta.motivo('op.mon.1.r2.1')
  );

  const sinP05 = evalua(hoy(), { ...BASE, 'P-05': undefined }, 'ALTO');
  comprueba('sin P-05 ni P-ATT → R2 no demostrado', sinP05.requisito('op.mon.1.r2.1').status === 'NO_CUMPLE' && sinP05.requisito('op.mon.1.r2.1').evidenced === false, sinP05.requisito('op.mon.1.r2.1').status);

  const conAtt = evalua(hoy(), { ...BASE, 'P-05': undefined, 'P-ATT': ['op.mon.1.r2.1 | PR-18 Respuesta a intrusión | https://intranet.ejemplo/pr-18.pdf | 2026-05-12 | Responsable de Seguridad'] }, 'ALTO');
  comprueba('REVERSIÓN: sin P-05 pero con P-ATT → R2 CUMPLE acreditado', conAtt.requisito('op.mon.1.r2.1').status === 'CUMPLE' && conAtt.requisito('op.mon.1.r2.1').attested === true, conAtt.requisito('op.mon.1.r2.1').status);
}

// --- 4. una medida en contra manda sobre el documento ------------------------

bloque('4. `attested` y P-ATT nunca tapan una medida técnica en NO_CUMPLE');

{
  const att = ['op.mon.1.1 | Plan de despliegue de agentes | https://intranet.ejemplo/despliegue.pdf | 2026-05-12 | Responsable de Seguridad'];
  const conPrueba = evalua(hoy(), { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), '027 | Ubuntu 22.04 | baja'], 'P-ATT': att }, 'ALTO');

  comprueba(
    'P-ATT para op.mon.1.1 con EV-02 en NO_CUMPLE → NO_CUMPLE medido, sin marca',
    conPrueba.requisito('op.mon.1.1').status === 'NO_CUMPLE' && conPrueba.requisito('op.mon.1.1').evidenced === true && !conPrueba.requisito('op.mon.1.1').attested,
    `${conPrueba.requisito('op.mon.1.1').status} ${conPrueba.requisito('op.mon.1.1').attested}`
  );
  comprueba(
    'y la acreditación de R2 sigue sola, sin arrastrar la base',
    conPrueba.requisito('op.mon.1.r2.1').status === 'CUMPLE' && conPrueba.requisito('op.mon.1.r2.1').attested === true
  );
}

// --- 5. rojo: cada eje con su reversión ------------------------------------

bloque('5. Rojo: cada eje con su reversión');

{
  // EV-02 · un agente de prueba desconectado, declarado en P-01.
  const conPrueba = evalua(hoy(), { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), 'srv-prueba | Ubuntu 22.04 | baja'] });
  comprueba(
    'P-01 con el agente de prueba desconectado → op.mon.1.1 NO_CUMPLE nombrándolo',
    conPrueba.requisito('op.mon.1.1').status === 'NO_CUMPLE' && /srv-prueba \(027\): agente disconnected/.test(conPrueba.motivo('op.mon.1.1')),
    conPrueba.motivo('op.mon.1.1')
  );
  comprueba(
    'y EV-03 no lo cuenta dos veces: lo deja a EV-02',
    conPrueba.evidencia('EV-03')?.status === 'CUMPLE' && /no están conectados \(los juzga EV-02\): srv-prueba \(027\)/.test(conPrueba.deEvidencia('op.mon.1.1', 'EV-03')?.reason || ''),
    conPrueba.deEvidencia('op.mon.1.1', 'EV-03')?.reason
  );

  const nunca = evalua(hoy(), { ...BASE, 'P-01': ['033 | Windows | media'] });
  comprueba('un agente que nunca conectó → NO_CUMPLE (keepalive «nunca»)', nunca.evidencia('EV-02')?.status === 'NO_CUMPLE' && /never_connected, último keepalive nunca/.test(nunca.motivo('op.mon.1.1')), nunca.motivo('op.mon.1.1'));

  const inexistente = evalua(hoy(), { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), 'srv-web01 | Linux | alta'] });
  comprueba('un sistema de P-01 sin agente → NO_CUMPLE', inexistente.evidencia('EV-02')?.status === 'NO_CUMPLE' && /srv-web01: no figura en la base de agentes/.test(inexistente.motivo('op.mon.1.1')), inexistente.motivo('op.mon.1.1'));

  // EV-02 · el análisis (FIM, SCA) contra P-10.
  const corto = evalua(hoy(), { ...BASE, 'P-10': '4' });
  comprueba('P-10 = 4 h y el FIM de wazuh-real terminó a las 06:02 → NO_CUMPLE', corto.evidencia('EV-02')?.status === 'NO_CUMPLE' && /wazuh-real \(024\): la última pasada de FIM terminó/.test(corto.motivo('op.mon.1.1')), corto.motivo('op.mon.1.1'));
  comprueba('REVERSIÓN: el mismo hecho con P-10 = 26 h → CUMPLE', evalua(hoy(), { ...BASE, 'P-10': '26' }).evidencia('EV-02')?.status === 'CUMPLE');
  // P-10 se juzga en el instante de la LECTURA: un hecho de hace 20 h (pasadas
  // completas perdidas) no convierte un FIM al día en «análisis inactivo».
  const tarde = evalua(hoy(), { ...BASE, 'P-10': '12' }, 'MEDIO', new Date('2026-10-10T08:00:00Z'));
  comprueba(
    'la lectura de las 12:05 vista 20 h después, con P-10 = 12 h: el FIM de 06:02 tenía 6 h al leerse → EV-02 CUMPLE',
    tarde.evidencia('EV-02')?.status === 'CUMPLE',
    `${tarde.evidencia('EV-02')?.status} ${tarde.deEvidencia('op.mon.1.1', 'EV-02')?.reason}`
  );

  const sinSca = evalua(hoy(l => (l.event === 'detection_coverage_observed' && l.agente_id === '028' ? { ...l, sca_ultimo_fin: '-' } : l)));
  comprueba('el LDAP sin ninguna pasada de SCA → el análisis no está activo', sinSca.evidencia('EV-02')?.status === 'NO_CUMPLE' && /ninguna pasada de SCA completada/.test(sinSca.motivo('op.mon.1.1')), sinSca.motivo('op.mon.1.1'));

  // EV-03 · sistema activo sin detecciones, contra P-09.
  const callado = evalua(hoy(l => (l.event === 'detection_activity_observed' && l.agente_id === '024' ? { ...l, ultima_alerta: '2026-09-29T08:00:00Z', alertas_24h: 0 } : l)));
  comprueba('wazuh-real conectado y 10 días sin detecciones (P-09 = 7) → NO_CUMPLE', callado.evidencia('EV-03')?.status === 'NO_CUMPLE' && /wazuh-real \(024\): 10 días sin ninguna detección/.test(callado.motivo('op.mon.1.1')), callado.motivo('op.mon.1.1'));
  comprueba('REVERSIÓN: el mismo hecho con P-09 = 15 → CUMPLE', evalua(hoy(l => (l.event === 'detection_activity_observed' && l.agente_id === '024' ? { ...l, ultima_alerta: '2026-09-29T08:00:00Z', alertas_24h: 0 } : l)), { ...BASE, 'P-09': '15' }).evidencia('EV-03')?.status === 'CUMPLE');

  const mudo = (desde: string) => hoy(l => (l.event === 'detection_activity_observed' && l.agente_id === '028' ? { ...l, ultima_alerta: '-', alertas_24h: 0, observado_desde: desde } : l));
  comprueba('el LDAP sin ninguna detección desde que se observa (09/09) → NO_CUMPLE', evalua(mudo('2026-09-09T00:00:00Z')).evidencia('EV-03')?.status === 'NO_CUMPLE');
  comprueba(
    'REVERSIÓN: sin detecciones pero observado solo desde ayer → no se puede afirmar: NO_EVALUABLE, nunca CUMPLE',
    evalua(mudo('2026-10-08T12:00:00Z')).evidencia('EV-03')?.status === 'NO_EVALUABLE',
    evalua(mudo('2026-10-08T12:00:00Z')).evidencia('EV-03')?.status
  );

  // EV-04 · situaciones de P-04 sin regla, o con reglas que no están cargadas.
  const ciega = evalua(hoy(), { ...BASE, 'P-04': [...(BASE['P-04'] as string[]), 'alteración del directorio LDAP | ldap-zimbra | ninguna'] });
  comprueba('una situación declarada sin regla (punto ciego) → NO_CUMPLE', ciega.evidencia('EV-04')?.status === 'NO_CUMPLE' && /puntos ciegos declarados: «alteración del directorio LDAP»/.test(ciega.motivo('op.mon.1.1')), ciega.motivo('op.mon.1.1'));
  // Un punto ciego con fecha de remedio: los números con guion no son reglas.
  const conFecha = (celda: string) => evalua(hoy(), { ...BASE, 'P-04': [...(BASE['P-04'] as string[]), `alteración del directorio LDAP | ldap-zimbra | ${celda}`] });
  ['pendiente 2026-12', 'CVE-2021-44228', 'AR-2026-04'].forEach(celda => {
    const r = conFecha(celda);

    comprueba(
      `«${celda}» en la columna de reglas no se lee como un rango: NO_EVALUABLE por CONFIGURATION nombrando la situación, nunca CUMPLE`,
      r.evidencia('EV-04')?.status === 'NO_EVALUABLE' && r.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /situación «alteración del directorio LDAP»/.test(r.motivo('op.mon.1.1')),
      `${r.evidencia('EV-04')?.status} ${r.evidencia('EV-04')?.gapCause} ${r.motivo('op.mon.1.1')}`
    );
  });
  comprueba('REVERSIÓN: «ninguna» es el punto ciego declarado → NO_CUMPLE medido', conFecha('ninguna').evidencia('EV-04')?.status === 'NO_CUMPLE');
  comprueba('y «5710; 5712 80700 - 80799» es una lista válida → CUMPLE', conFecha('5710; 5712 80700 - 80799').evidencia('EV-04')?.status === 'CUMPLE');

  const noCargada = evalua(hoy(), { ...BASE, 'P-04': ['exfiltración por DNS | perímetro | 99001, 99002'] });
  comprueba('una situación con reglas que el manager no carga → NO_CUMPLE', noCargada.evidencia('EV-04')?.status === 'NO_CUMPLE' && /99001, 99002/.test(noCargada.motivo('op.mon.1.1')), noCargada.motivo('op.mon.1.1'));
  const rango = evalua(hoy(), { ...BASE, 'P-04': ['exfiltración por DNS | perímetro | 99001, 80700-80705'] });
  comprueba('REVERSIÓN: basta una regla cargada, también por rango → CUMPLE, y nombra la que falta', rango.evidencia('EV-04')?.status === 'CUMPLE' && /declaradas y no cargadas: 99001/.test(rango.deEvidencia('op.mon.1.1', 'EV-04')?.reason || ''), rango.deEvidencia('op.mon.1.1', 'EV-04')?.reason);

  // EV-01 · el motor.
  const parado = evalua(eventos([...pasadaHoraria(HORARIA, { eventos_procesados: 1210450 }), ...pasadaCompleta()]));
  comprueba('el contador del motor no se mueve entre pasadas → NO_CUMPLE (en marcha, pero no analiza)', parado.evidencia('EV-01')?.status === 'NO_CUMPLE' && /no ha procesado ningún evento/.test(parado.motivo('op.mon.1.1')), parado.motivo('op.mon.1.1'));
  const reinicio = evalua(eventos([...pasadaHoraria(HORARIA, { eventos_procesados: 9999999 }), ...pasadaCompleta()]));
  comprueba('REVERSIÓN: el contador baja (reinicio) y hay eventos desde entonces → CUMPLE', reinicio.evidencia('EV-01')?.status === 'CUMPLE' && /se reinició/.test(reinicio.motivo('op.mon.1.1')), reinicio.motivo('op.mon.1.1'));
  const caido = evalua(hoy(l => (l.event === 'detection_engine_status' && String(l.ts).startsWith(COMPLETA) ? { ...l, activo: 'no' } : l)));
  comprueba('wazuh-manager no activo → NO_CUMPLE', caido.evidencia('EV-01')?.status === 'NO_CUMPLE' && /no está activo/.test(caido.motivo('op.mon.1.1')), caido.motivo('op.mon.1.1'));
  const sinContadores = evalua(hoy(l => (l.event === 'detection_engine_status' ? { ...l, eventos_procesados: '-', fuente_contadores: '-' } : l)));
  comprueba('sin contadores del motor (otra versión), alerts.json crece → CUMPLE por las alertas', sinContadores.evidencia('EV-01')?.status === 'CUMPLE' && /812 nuevas en alerts.json/.test(sinContadores.motivo('op.mon.1.1')), sinContadores.motivo('op.mon.1.1'));
  const ciego = evalua(hoy(l => (l.event === 'detection_engine_status' ? { ...l, eventos_procesados: '-', fuente_contadores: '-', alertas_nuevas: '-' } : l)));
  comprueba('sin contadores ni alertas legibles → NO_EVALUABLE por RECOGIDA, nunca CUMPLE', ciego.evidencia('EV-01')?.status === 'NO_EVALUABLE' && ciego.evidencia('EV-01')?.gapCause === 'COLLECTION', `${ciego.evidencia('EV-01')?.status} ${ciego.evidencia('EV-01')?.gapCause}`);

  // EV-08 · ruleset y silenciamientos.
  const viejo = evalua(hoy(), { ...BASE, 'P-08': '60' });
  comprueba('ruleset del 10/07 (91 días) con P-08 = 60 → R1 NO_CUMPLE', viejo.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /91 días, más que los 60 de P-08/.test(viejo.motivo('op.mon.1.r1.1')), viejo.motivo('op.mon.1.r1.1'));
  const silencio = evalua(hoy(l => l), { ...BASE, 'P-06': ['5715 | escáner interno autorizado | RSI'] });
  comprueba('0215-policy_rules.xml excluida y no declarada en P-06 → R1 NO_CUMPLE', silencio.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /Silenciamientos que P-06 no declara: 0215-policy_rules.xml/.test(silencio.motivo('op.mon.1.r1.1')), silencio.motivo('op.mon.1.r1.1'));
  const sinAprobar = evalua(hoy(), { ...BASE, 'P-06': ['0215-policy_rules.xml | exclusión de fábrica de Wazuh | '] });
  comprueba('declarada sin quién la aprobó → R1 NO_CUMPLE', sinAprobar.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /sin quién lo aprobó/.test(sinAprobar.motivo('op.mon.1.r1.1')), sinAprobar.motivo('op.mon.1.r1.1'));
  const nivel0 = evalua(hoy(l => (l.event === 'rule_silenced' ? { ...l, tipo: 'regla_nivel0', objeto: '5710', fichero: '/var/ossec/etc/rules/local_rules.xml' } : l)));
  comprueba('la 5710 reescrita a nivel 0 sin P-06 → R1 NO_CUMPLE', nivel0.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /5710 \(regla a nivel 0/.test(nivel0.motivo('op.mon.1.r1.1')), nivel0.motivo('op.mon.1.r1.1'));
  const nada = evalua(hoy(l => (l.event === 'rule_silenced' ? { ...l, tipo: 'ninguno', objeto: '-', fichero: '-' } : l)), { ...BASE, 'P-06': undefined });
  comprueba('REVERSIÓN: sin silenciamientos, P-06 no hace falta → R1 CUMPLE', nada.requisito('op.mon.1.r1.1').status === 'CUMPLE', nada.motivo('op.mon.1.r1.1'));

  // R1 · los conjuntos de P-03.
  const conjuntoFalta = evalua(hoy(), { ...BASE, 'P-03': ['wazuh | x | x', 'sigma | x | x'] });
  comprueba('un conjunto de P-03 que el manager no carga → R1 NO_CUMPLE', conjuntoFalta.requisito('op.mon.1.r1.1').status === 'NO_CUMPLE' && /no carga: sigma/.test(conjuntoFalta.motivo('op.mon.1.r1.1')), conjuntoFalta.motivo('op.mon.1.r1.1'));

  // EV-05 · la detección en red, cuando P-02 la exige.
  const exige = { ...BASE, 'P-02': ['sí | Suricata | AR-2026 §4.2: segmento DMZ'] };
  comprueba('P-02 exige Suricata y el manager no ingiere ningún NIDS → NO_CUMPLE', evalua(hoy(), exige).evidencia('EV-05')?.status === 'NO_CUMPLE');
  const conSuricata = (ultima: string) =>
    hoy(l => (l.event === 'network_detection_observed' ? { ...l, producto: 'suricata', fuente: '/var/log/suricata/eve.json', ultima_alerta: ultima, alertas_24h: 31 } : l));
  comprueba('REVERSIÓN: con Suricata por eve.json y alertas de hoy → CUMPLE', evalua(conSuricata('2026-10-09T10:00:00Z'), exige).evidencia('EV-05')?.status === 'CUMPLE');
  comprueba('Suricata con su última alerta hace 20 días (P-09 = 7) → NO_CUMPLE', evalua(conSuricata('2026-09-19T10:00:00Z'), exige).evidencia('EV-05')?.status === 'NO_CUMPLE');
  const sinJustificar = evalua(hoy(), { ...BASE, 'P-02': ['no |  | '] });
  comprueba('P-02 = no sin referencia al análisis de riesgos → no demostrado, causa CONFIGURATION', sinJustificar.evidencia('EV-05')?.status === 'NO_EVALUABLE' && sinJustificar.evidencia('EV-05')?.gapCause === 'CONFIGURATION', `${sinJustificar.evidencia('EV-05')?.status} ${sinJustificar.evidencia('EV-05')?.gapCause}`);
}

// --- 6. sin parámetros -------------------------------------------------------

bloque('6. Sin parámetros: NO_EVALUABLE con causa CONFIGURATION, nunca CUMPLE por vacío');

{
  const r = evalua(hoy(), SIN_PARAMETROS, 'ALTO');

  ['op.mon.1.1', 'op.mon.1.r1.1', 'op.mon.1.r2.1'].forEach(id =>
    comprueba(`${id} no demostrado (NO_CUMPLE sin medir)`, r.requisito(id).status === 'NO_CUMPLE' && r.requisito(id).evidenced === false, `${r.requisito(id).status} ${r.requisito(id).evidenced}`)
  );
  ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-08'].forEach(id =>
    comprueba(`${id} sin medir por CONFIGURATION`, r.evidencia(id)?.status === 'NO_EVALUABLE' && r.evidencia(id)?.gapCause === 'CONFIGURATION', `${r.evidencia(id)?.status} ${r.evidencia(id)?.gapCause}`)
  );
  comprueba('EV-01 se mide igual (no depende de ningún parámetro en la base)', r.deEvidencia('op.mon.1.1', 'EV-01')?.status === 'CUMPLE');
  comprueba('y sin P-03, EV-01 en R1 queda sin medir por CONFIGURATION', r.deEvidencia('op.mon.1.r1.1', 'EV-01')?.status === 'NO_EVALUABLE' && r.deEvidencia('op.mon.1.r1.1', 'EV-01')?.cause === 'CONFIGURATION');
  comprueba('el motivo de EV-02 nombra el parámetro y lo que hay', /P-01 \(Alcance de la detección en host\) está sin configurar/.test(r.motivo('op.mon.1.1')) && /5 agentes registrados/.test(r.motivo('op.mon.1.1')), r.motivo('op.mon.1.1'));

  const soloP09 = evalua(hoy(), { ...BASE, 'P-09': undefined });
  comprueba('falta solo P-09 → op.mon.1.1 no demostrado, EV-03 CONFIGURATION', soloP09.requisito('op.mon.1.1').evidenced === false && soloP09.evidencia('EV-03')?.gapCause === 'CONFIGURATION');
  const soloP10 = evalua(hoy(), { ...BASE, 'P-10': undefined });
  comprueba('falta solo P-10 → EV-02 CONFIGURATION, nombrando los conectados', soloP10.evidencia('EV-02')?.gapCause === 'CONFIGURATION' && /con el agente conectado: Wazuh-4/.test(soloP10.deEvidencia('op.mon.1.1', 'EV-02')?.reason || ''), soloP10.deEvidencia('op.mon.1.1', 'EV-02')?.reason);
  const soloP08 = evalua(hoy(), { ...BASE, 'P-08': undefined });
  comprueba('falta solo P-08 → R1 no demostrado, CONFIGURATION', soloP08.requisito('op.mon.1.r1.1').evidenced === false && soloP08.evidencia('EV-08')?.gapCause === 'CONFIGURATION');
  const invalidos = configuracion(BASE)
    .parameters.map(p => ({ id: p.id, veredicto: validateParameterValue(p, p.value) }))
    .filter(v => !v.veredicto.valid);
  comprueba(
    'los valores de BASE son válidos para sus tablas (P-02 con la opción «sí»/«no» del desplegable)',
    invalidos.length === 0,
    invalidos.map(v => `${v.id}: ${v.veredicto.reason}`).join('; ')
  );
}

// --- 7. sin recolector -------------------------------------------------------

bloque('7. Sin recolector o con la fuente rota: NO_EVALUABLE por RECOGIDA');

{
  const nada = evalua([]);
  comprueba('sin ningún hecho → op.mon.1.1 no demostrado', nada.requisito('op.mon.1.1').evidenced === false);
  comprueba('y EV-02 por RECOGIDA, no por configuración', nada.evidencia('EV-02')?.gapCause === 'COLLECTION', nada.evidencia('EV-02')?.gapCause);

  // wazuh-analysisd muere después de la pasada de las 12:05: systemctl sigue
  // diciendo «active», pero sin el motor no llega ni el estado del propio motor.
  const sinMotor = evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-09T16:10:00Z'));
  comprueba(
    'cuatro horas sin estado del motor (pasa cada hora) → EV-01 NO_EVALUABLE por RECOGIDA, nombrando analysisd',
    sinMotor.evidencia('EV-01')?.status === 'NO_EVALUABLE' && sinMotor.evidencia('EV-01')?.gapCause === 'COLLECTION' && /wazuh-analysisd/.test(sinMotor.motivo('op.mon.1.1')),
    `${sinMotor.evidencia('EV-01')?.status} ${sinMotor.motivo('op.mon.1.1')}`
  );
  comprueba('y op.mon.1.1 deja de cumplir: no demostrado', sinMotor.requisito('op.mon.1.1').status === 'NO_CUMPLE' && sinMotor.requisito('op.mon.1.1').evidenced === false);
  comprueba('mientras los hechos de 6 h, con cuatro horas, siguen vigentes', sinMotor.evidencia('EV-02')?.status === 'CUMPLE' && sinMotor.evidencia('EV-04')?.status === 'CUMPLE');
  const conMotor = evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-09T14:30:00Z'));
  comprueba('REVERSIÓN: a las 2 h 25 min del último estado del motor → EV-01 CUMPLE', conMotor.evidencia('EV-01')?.status === 'CUMPLE', conMotor.evidencia('EV-01')?.status);

  const viejo = evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-11T12:30:00Z'));
  comprueba('dos días sin pasadas: el estado no describe hoy → no demostrado', viejo.requisito('op.mon.1.1').evidenced === false && /no está informando/.test(viejo.motivo('op.mon.1.1')), viejo.motivo('op.mon.1.1'));

  const sinBase = evalua(hoy().concat(eventos([
    { ts: `${COMPLETA}:30Z`, event: 'evidence_state', evidence_id: 'EV-02', requisito: 'op.mon.1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer la base de agentes del manager /var/ossec/queue/db/global.db' },
  ])));
  comprueba('global.db ilegible en la última pasada → NO_EVALUABLE con el motivo del recolector', sinBase.evidencia('EV-02')?.status === 'NO_EVALUABLE' && /global\.db/.test(sinBase.motivo('op.mon.1.1')), sinBase.motivo('op.mon.1.1'));

  // Contrato (ronda 1): el evidence_state de EV-02 entera es solo para
  // global.db. La base ilegible de UN agente llega en su hecho (`lectura=error`).
  const conPrueba = { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), '027 | x | x'] };
  const sinBaseConFallo = evalua(hoy().concat(eventos([
    { ts: `${COMPLETA}:30Z`, event: 'evidence_state', evidence_id: 'EV-02', requisito: 'op.mon.1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer la base de agentes del manager /var/ossec/queue/db/global.db' },
  ])), conPrueba);
  comprueba(
    'global.db ilegible después de una pasada con un sistema de P-01 desconectado → manda la medida: NO_CUMPLE, y la degradación se dice aparte',
    sinBaseConFallo.evidencia('EV-02')?.status === 'NO_CUMPLE' && /027.*disconnected/.test(sinBaseConFallo.motivo('op.mon.1.1')) && /Además: El recolector no ha podido medirlo/.test(sinBaseConFallo.motivo('op.mon.1.1')),
    sinBaseConFallo.motivo('op.mon.1.1')
  );

  // Una degradación de hace dos días no describe hoy (misma frescura que los hechos).
  const sinCobertura = (ts: string) =>
    evalua(hoy(l => (l.event === 'detection_coverage_observed' ? undefined : l)).concat(eventos([
      { ts, event: 'evidence_state', evidence_id: 'EV-02', requisito: 'op.mon.1.1', plano: 'central', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'no se puede leer la base de agentes del manager /var/ossec/queue/db/global.db' },
    ])));
  const antigua = sinCobertura('2026-10-07T12:05:30Z');
  comprueba(
    'un evidence_state de hace dos días no se usa como motivo de hoy',
    antigua.evidencia('EV-02')?.status === 'NO_EVALUABLE' && !/global\.db/.test(antigua.motivo('op.mon.1.1')) && /No consta ningún estado de los agentes/.test(antigua.motivo('op.mon.1.1')),
    antigua.motivo('op.mon.1.1')
  );
  comprueba('REVERSIÓN: el mismo evidence_state de hoy sí da el motivo', /global\.db/.test(sinCobertura(`${COMPLETA}:30Z`).motivo('op.mon.1.1')));

  const lecturaError = (id: string) =>
    hoy(l => (l.event === 'detection_coverage_observed' && l.agente_id === id ? { ...l, lectura: 'error', fim_ultimo_fin: '-', sca_ultimo_fin: '-', inventario_ultimo: '-' } : l));
  comprueba('la base ilegible de un agente FUERA de P-01 (027) no bloquea nada → EV-02 CUMPLE', evalua(lecturaError('027')).evidencia('EV-02')?.status === 'CUMPLE');
  const ldapIlegible = evalua(lecturaError('028'));
  comprueba(
    'la base ilegible de un sistema de P-01 (028) → NO_EVALUABLE por RECOGIDA nombrándolo, no NO_CUMPLE por «ninguna pasada»',
    ldapIlegible.evidencia('EV-02')?.status === 'NO_EVALUABLE' && ldapIlegible.evidencia('EV-02')?.gapCause === 'COLLECTION' && /028 \(ldap-zimbra, 028\): el recolector no ha podido leer su base/.test(ldapIlegible.motivo('op.mon.1.1')),
    `${ldapIlegible.evidencia('EV-02')?.status} ${ldapIlegible.motivo('op.mon.1.1')}`
  );
  const ambos = evalua(lecturaError('028'), conPrueba);
  comprueba(
    'y con otro sistema de P-01 desconectado, manda la medida → NO_CUMPLE',
    ambos.evidencia('EV-02')?.status === 'NO_CUMPLE' && /027.*disconnected/.test(ambos.motivo('op.mon.1.1')),
    ambos.motivo('op.mon.1.1')
  );

  const ajeno = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': `${COMPLETA}:14Z`,
      agent: MANAGER,
      data: { ensfacil: 'op.exp.8', event: 'detection_coverage_observed', evidence_id: 'EV-02', agente_id: '024', agente: 'wazuh-real', estado_conexion: 'active' },
    },
  }]);
  comprueba('un hecho de otro control no acredita op.mon.1', evalua(ajeno).evidencia('EV-02')?.status !== 'CUMPLE');
}

// --- 8. foco: P-01 por nombre o por ID -------------------------------------

bloque('8. P-01 se cruza por ID o por nombre EXACTO, sin confundir agentes');

{
  const por = (p01: string[]) => evalua(hoy(), { ...BASE, 'P-01': p01 });

  comprueba('«24» es el agente 024 (ID sin ceros)', por(['24 | Linux | alta']).evidencia('EV-02')?.status === 'CUMPLE');
  comprueba('«WAZUH-REAL» es wazuh-real (sin distinguir mayúsculas)', por(['WAZUH-REAL | Linux | alta']).evidencia('EV-02')?.status === 'CUMPLE');
  comprueba('«000» es el manager', por(['000 | Linux | alta']).evidencia('EV-02')?.status === 'CUMPLE');
  comprueba(
    '«wazuh-rea» NO es wazuh-real: nunca por parecido',
    por(['wazuh-rea | Linux | alta']).evidencia('EV-02')?.status === 'NO_CUMPLE' && /wazuh-rea: no figura/.test(por(['wazuh-rea | Linux | alta']).motivo('op.mon.1.1'))
  );

  // Dos agentes con el mismo nombre (uno reinstalado, el viejo sin dar de baja).
  const duplicado = (l: Linea): Linea[] =>
    (l.event === 'detection_coverage_observed' || l.event === 'detection_activity_observed') && l.agente_id === '024'
      ? [l, { ...l, agente_id: '041', ...(l.event === 'detection_coverage_observed' ? { estado_conexion: 'disconnected' } : {}) }]
      : [l];
  const dosNombres = eventos([...pasadaHoraria(), ...pasadaCompleta().flatMap(duplicado)]);
  const ambiguo = evalua(dosNombres);
  comprueba(
    'un nombre con dos agentes (024 y 041) → no se elige: NO_EVALUABLE por CONFIGURATION pidiendo el ID',
    ambiguo.evidencia('EV-02')?.status === 'NO_EVALUABLE' && ambiguo.evidencia('EV-02')?.gapCause === 'CONFIGURATION' && /Decláralo por su ID/.test(ambiguo.motivo('op.mon.1.1')),
    `${ambiguo.evidencia('EV-02')?.status} ${ambiguo.motivo('op.mon.1.1')}`
  );
  const porId = evalua(dosNombres, { ...BASE, 'P-01': ['Wazuh-4 | x | x', '024 | x | x', '028 | x | x'] });
  comprueba('REVERSIÓN: declarado por su ID (024) → CUMPLE, y el viejo desconectado no cuenta', porId.evidencia('EV-02')?.status === 'CUMPLE' && /041 disconnected/.test(porId.deEvidencia('op.mon.1.1', 'EV-02')?.reason || ''), porId.deEvidencia('op.mon.1.1', 'EV-02')?.reason);
  const porIdViejo = evalua(dosNombres, { ...BASE, 'P-01': ['Wazuh-4 | x | x', '041 | x | x', '028 | x | x'] });
  comprueba('y declarar el viejo (041) por su ID → NO_CUMPLE: está desconectado', porIdViejo.evidencia('EV-02')?.status === 'NO_CUMPLE');
}

// --- 9. foco: el estado por la última pasada, con dos cadencias -------------

bloque('9. Hechos de estado: la pasada horaria no borra los de 6 h; la de 6 h sí reemplaza la anterior');

{
  // 06:05 completa con el agente de prueba aún conectado; horarias hasta las
  // 11:05. A las 11:30 los hechos de 6 h siguen siendo los de las 06:05.
  const manana = '2026-10-09T06:05';
  const horarias = ['07', '08', '09', '10', '11'].flatMap((h, i) =>
    pasadaHoraria(`2026-10-09T${h}:05`, { eventos_procesados: 1203300 + i * 1000 })
  );
  const conectado = (l: Linea) =>
    l.agente_id !== '027'
      ? l
      : l.event === 'detection_coverage_observed'
      ? { ...l, estado_conexion: 'active', ultimo_keepalive: '2026-10-09T06:04:30Z', fim_ultimo_fin: '2026-10-09T05:10:00Z', sca_ultimo_fin: '2026-10-09T05:12:00Z' }
      : l.event === 'detection_activity_observed'
      ? { ...l, ultima_alerta: '2026-10-09T05:30:00Z', alertas_24h: 40 }
      : l;
  const p01ConPrueba = { ...BASE, 'P-01': [...(BASE['P-01'] as string[]), '027 | x | x'] };
  const mananaEvs = eventos([...pasadaCompleta(manana).map(conectado), ...horarias]);
  const a1130 = evalua(mananaEvs, p01ConPrueba, 'MEDIO', new Date('2026-10-09T11:30:00Z'));

  comprueba(
    'a las 11:30, cinco pasadas horarias después: EV-02, EV-04 y EV-08 siguen medidas con la pasada de las 06:05',
    ['EV-02', 'EV-04'].every(id => a1130.evidencia(id)?.status === 'CUMPLE') && a1130.requisito('op.mon.1.r1.1').status === 'CUMPLE',
    ['EV-02', 'EV-04', 'EV-08'].map(id => `${id} ${a1130.evidencia(id)?.status}`).join(', ')
  );

  const tarde = evalua(
    eventos([...pasadaCompleta(manana).map(conectado), ...horarias, ...pasadaCompleta()]),
    p01ConPrueba
  );
  comprueba(
    'a las 12:30, la completa de las 12:05 reemplaza la de las 06:05: 027 ya está desconectado → NO_CUMPLE',
    tarde.evidencia('EV-02')?.status === 'NO_CUMPLE' && /027.*disconnected/.test(tarde.motivo('op.mon.1.1')),
    tarde.motivo('op.mon.1.1')
  );
}

// --- 10. foco: una cadena larga de rangos de ids -----------------------------

bloque('10. Volumen: los ids de un conjunto grande caben en líneas de logcollector');

{
  // Lo que hace el recolector según el contrato: comprime los ids en rangos y
  // parte la cadena en hechos de, como mucho, LIMITE_IDS caracteres.
  const LIMITE_IDS = 6000;
  const comprime = (ids: number[]): string[] => {
    const salida: string[] = [];
    let i = 0;

    while (i < ids.length) {
      let j = i;

      while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) {
        j += 1;
      }

      salida.push(i === j ? String(ids[i]) : `${ids[i]}-${ids[j]}`);
      i = j + 1;
    }

    return salida;
  };
  const parte = (trozos: string[]): string[] => {
    const partes: string[] = [];
    let actual = '';

    trozos.forEach(t => {
      if (actual && actual.length + 1 + t.length > LIMITE_IDS) {
        partes.push(actual);
        actual = t;
      } else {
        actual = actual ? `${actual},${t}` : t;
      }
    });

    return actual ? [...partes, actual] : partes;
  };

  // Un ruleset patológico: uno de cada tres ids entre 1000 y 120000, sin
  // ningún rango (39.667 reglas sueltas).
  const ids = Array.from({ length: 39667 }, (_, k) => 1000 + k * 3);
  const trozos = parte(comprime(ids));
  const ts = `${COMPLETA}:18Z`;
  const lineas = trozos.map((s, k) => conjunto(ts, 'wazuh', '/var/ossec/ruleset/rules', s, ids.length, k + 1, trozos.length));
  // La línea NDJSON tal como la escribe `ens_emit` (con ensfacil, ts y host).
  const bytes = lineas.map(l => new TextEncoder().encode(JSON.stringify({ ensfacil: 'op.mon.1', host: 'Wazuh-4', ...l })).length);

  comprueba(
    `${trozos.length} partes, ninguna línea pasa de 8 KiB (logcollector corta a 64 KiB; el indexer no indexa un término de más de 32 KiB)`,
    trozos.length > 1 && Math.max(...bytes) <= 8192,
    Math.max(...bytes)
  );

  const largo = (quitar?: number) =>
    eventos([
      ...pasadaHoraria(),
      ...pasadaCompleta().filter(l => !(l.event === 'ruleset_rules_loaded' && l.conjunto === 'wazuh')),
      ...lineas.filter((_, k) => k !== quitar),
    ]);
  const ultimaParte = rangos(trozos[trozos.length - 1])[0];
  const p04 = { ...BASE, 'P-04': [`situación de la última parte | x | ${ultimaParte}`] };

  const entero = evalua(largo(), p04);
  comprueba(`con todas las partes, la regla ${ultimaParte} (de la última) está cargada → CUMPLE`, entero.evidencia('EV-04')?.status === 'CUMPLE', entero.deEvidencia('op.mon.1.1', 'EV-04')?.reason);

  const sinUna = evalua(largo(trozos.length - 1), p04);
  comprueba(
    'si falta una parte, una regla que no aparece no se da por no cargada: NO_EVALUABLE por RECOGIDA',
    sinUna.evidencia('EV-04')?.status === 'NO_EVALUABLE' && sinUna.evidencia('EV-04')?.gapCause === 'COLLECTION' && /faltan partes del inventario de wazuh/.test(sinUna.motivo('op.mon.1.1')),
    `${sinUna.evidencia('EV-04')?.status} ${sinUna.motivo('op.mon.1.1')}`
  );
  const otraParte = rangos(trozos[0])[0];
  comprueba(
    'y una regla que sí aparece en las partes que llegaron sigue contando → CUMPLE',
    evalua(largo(trozos.length - 1), { ...BASE, 'P-04': [`situación | x | ${otraParte}`] }).evidencia('EV-04')?.status === 'CUMPLE'
  );

  // El presupuesto de hechos (spec, riesgo 1 del §7.6): un día del
  // laboratorio, con las cadencias del contrato.
  const dia = [
    ...Array.from({ length: 24 }, (_, h) => h).filter(h => h % 6 !== 0).flatMap(h => pasadaHoraria(`2026-10-09T${String(h).padStart(2, '0')}:05`)),
    ...[0, 6, 12, 18].flatMap(h => pasadaCompleta(`2026-10-09T${String(h).padStart(2, '0')}:05`)),
  ];
  comprueba(`un día del laboratorio son ${dia.length} hechos, por debajo de los 300 del presupuesto`, dia.length <= 300, dia.length);
}

function rangos(texto: string): string[] {
  return texto.split(',').filter(Boolean);
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
