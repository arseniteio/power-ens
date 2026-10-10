/**
 * op.nub.1 · el juicio de la protección de servicios en la nube.
 *
 *     npx tsx tests/op-nub-1-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. op.nub.1 tiene dos planos que no se mezclan:
 *
 *   - lo DOCUMENTAL (P-03, P-04, P-08, P-09, P-10) se juzga con su vigencia
 *     contra la fecha de la evaluación y, si cumple, sale «acreditado
 *     documentalmente» (`attested`);
 *   - lo TÉCNICO lo mide el recolector del manager (agent.id=000): los módulos
 *     cloud de Wazuh, sus registros, sus errores, las operaciones
 *     administrativas y los accesos. Una medida técnica en contra manda
 *     siempre sobre el documento.
 *
 * Cada caso mueve UN eje y lleva al lado la REVERSIÓN: el MISMO hecho con otro
 * parámetro, u otro `now`, cambia el veredicto.
 *
 * Los hechos siguen el contrato de eventos de op.nub.1 (el que documenta el
 * runbook `linux/op.nub.1`). En el laboratorio no hay nube: son los de un
 * cliente simulado con AWS (aws-s3 en el agent.conf de un grupo), Azure
 * (azure-logs en el ossec.conf local de un agente dedicado, visto solo por
 * sus alertas) y GCP (gcp-pubsub en el manager), más un IaaS sin módulo de
 * Wazuh. Cuando exista el recolector, se sustituyen por su salida real en modo
 * --prueba. Pasan por el normalizador real como alertas de alerts.json.
 */
import { opNub1PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-nub-1.policy';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { opNub1CatalogDefinition } from '../public/ens/catalog/op-nub-1';
import { opNub1Configuration } from '../public/ens/configuration/data/op-nub-1-parameters';
import { normalizeWazuhAlerts } from '../public/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { getEvidenceDefinitions } from '../public/ens/core/evidence/registry';
import { getStateFactEventTypes, keepLatestRunStateFacts } from '../public/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { markEvidencesStale, markPolicyRuntimeStale } from '../public/ens/core/evidence/stale-collector';
import { parseRequirementAttestations } from '../public/ens/configuration/services/attestation-service';
import { validateParameterValue } from '../public/ens/configuration/services/parameter-value-validator';
import { buildOpNub1ReportModel } from '../public/ens/reports/op-nub-1-report-model';
import { ensRequirementProofLabel } from '../public/ens/reports/report-rows';
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

// Tres pasadas de 6 h del recolector del manager; la última a las 12:05.
const PASADAS = ['2026-10-08T18:05', '2026-10-09T00:05', '2026-10-09T06:05', '2026-10-09T12:05'];
const COMPLETA = PASADAS[PASADAS.length - 1];

const AHORA = new Date('2026-10-09T12:30:00Z');

const CUBRE = 'EV-01,EV-02,EV-04,EV-07';

const latido = (ts: string, cubiertas = CUBRE): Linea => ({
  ts, event: 'collector_run', resultado: 'completada', evidencias_cubiertas: cubiertas, tipo_servidor: 'manager', emisor: 'recolector', pasada: 'completa',
});

const integracion = (ts: string, modulo: string, extra: Linea = {}): Linea => ({
  ts, event: 'cloud_integration_observed', evidence_id: 'EV-01', requisito: 'op.nub.1.2', plano: 'central',
  modulo, familia: '-', donde: '-', habilitado: 'si', servicios: '-', intervalo: '-', secreto_en_linea: 'no',
  agentes_origen: '-', ultima_alerta: '-', alertas_24h: 0, errores_24h: 0, ultimo_error: '-',
  observado_desde: '2026-09-20T00:05:00Z', ...extra,
});

const operacion = (ts: string, modulo: string, actor: string, extra: Linea = {}): Linea => ({
  ts, event: 'cloud_admin_operation_observed', evidence_id: 'EV-04', requisito: 'op.nub.1.2', plano: 'central',
  modulo, familia: '-', cuenta: '-', actor, tipo_actor: 'rol', operaciones: 'CreateUser', veces: 1,
  primera: ts.replace(/:(\d\d)Z$/, ':00Z'), ultima: ts.replace(/:(\d\d)Z$/, ':00Z'), agente_id: '031', ...extra,
});

const acceso = (ts: string, modulo: string, usuario: string, extra: Linea = {}): Linea => ({
  ts, event: 'cloud_authentication_observed', evidence_id: 'EV-07', requisito: 'op.nub.1.2', plano: 'central',
  modulo, familia: '-', cuenta: '-', usuario, resultado: 'exito', segundo_factor: 'si', metodo: 'consola', veces: 1,
  primera: '2026-10-09T09:00:00Z', ultima: '2026-10-09T09:00:00Z', origenes: '203.0.113.10', ...extra,
});

const postura = (ts: string, extra: Linea = {}): Linea => ({
  ts, event: 'cloud_posture_finding_observed', evidence_id: 'EV-02', requisito: 'op.nub.1.r2.1', plano: 'central',
  modulo: '-', fuente: 'ninguna', estandar: '-', cuenta: '-', controles_evaluados: 0, controles_fallidos: 0,
  fallidos_criticos: 0, fallidos: '-', ultimo_hallazgo: '-', ...extra,
});

// Una pasada completa del cliente simulado. Las acciones (operaciones y
// accesos) se agregan por pasada: cada una trae lo leído desde la anterior.
const pasada = (ts: string, acciones = true): Linea[] => {
  const t = (s: number) => `${ts}:${String(s).padStart(2, '0')}Z`;

  return [
    integracion(t(10), 'aws-s3', {
      familia: 'amazon', donde: 'grupo:cloud-aws', servicios: 'cloudtrail,guardduty', intervalo: '10m',
      agentes_origen: '031', ultima_alerta: '2026-10-09T12:01:30Z', alertas_24h: 1840, errores_24h: 0,
    }),
    integracion(t(10), 'azure-logs', {
      familia: 'azure', donde: 'agente:031', habilitado: '-', servicios: '-', secreto_en_linea: '-',
      agentes_origen: '031', ultima_alerta: '2026-10-09T11:40:00Z', alertas_24h: 412, errores_24h: '-',
    }),
    integracion(t(10), 'gcp-pubsub', {
      familia: 'gcp', donde: 'manager', servicios: 'pubsub', intervalo: '1h',
      agentes_origen: '000', ultima_alerta: '2026-10-09T10:15:00Z', alertas_24h: 96, errores_24h: 0,
    }),
    postura(t(12)),
    ...(acciones
      ? [
          operacion(t(14), 'aws-s3', 'arn:aws:iam::123456789012:role/Admin', { cuenta: '123456789012', operaciones: 'CreateUser,AttachRolePolicy', veces: 3 }),
          operacion(t(14), 'aws-s3', 'config.amazonaws.com', { cuenta: '123456789012', tipo_actor: 'servicio', operaciones: 'PutEvaluations', veces: 12 }),
          operacion(t(14), 'azure-logs', 'admin@cliente.example', { cuenta: 'sub-0001', tipo_actor: 'usuario', operaciones: 'Microsoft.Network/networkSecurityGroups/write', veces: 1 }),
          acceso(t(16), 'aws-s3', 'arn:aws:iam::123456789012:user/alice', { cuenta: '123456789012' }),
          acceso(t(16), 'azure-logs', 'admin@cliente.example', { cuenta: 'sub-0001', metodo: 'entra-id' }),
          acceso(t(16), 'azure-logs', 'bob@cliente.example', { cuenta: 'sub-0001', metodo: 'entra-id', resultado: 'fallo', segundo_factor: '-', veces: 4 }),
        ]
      : []),
    latido(t(40)),
  ];
};

let contador = 0;

const REGLA: Record<string, string> = {
  cloud_integration_observed: '111501', cloud_posture_finding_observed: '111502', cloud_admin_operation_observed: '111503',
  cloud_authentication_observed: '111504', evidence_state: '111550', collector_run: '111597',
};

const MANAGER = { id: '000', name: 'Wazuh-4' };

// Una línea del NDJSON del recolector tal como la deja el manager en el índice.
const alerta = (linea: Linea, control = 'op.nub.1') => {
  contador += 1;
  const { ts, host: _host, ...data } = linea as Linea & { ts: string };

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts,
      agent: MANAGER,
      rule: { id: REGLA[String(data.event)] || '111500', description: 'op.nub.1' },
      location: '/var/log/ensfacil/op_nub_1.json',
      data: Object.fromEntries(Object.entries({ ensfacil: control, ...data }).map(([k, v]) => [k, String(v)])),
    },
  };
};

const eventos = (lineas: Linea[], cambia: (l: Linea) => Linea | Linea[] | undefined = l => l): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(
    lineas
      .flatMap(l => {
        const r = cambia({ ...l });

        return r === undefined ? [] : Array.isArray(r) ? r : [r];
      })
      .map(l => alerta(l))
  );

// La ventana de hoy: cuatro pasadas de 6 h, la última a las 12:05.
const hoy = (cambia?: (l: Linea) => Linea | Linea[] | undefined) =>
  eventos(PASADAS.flatMap(ts => pasada(ts)), cambia);

const enLaUltima = (l: Linea): boolean => String(l.ts).startsWith(COMPLETA);

// --- la configuración --------------------------------------------------------

type Valores = Record<string, string[] | string | undefined>;

const configuracion = (valores: Valores): ENSControlConfiguration => ({
  ...opNub1Configuration,
  parameters: opNub1Configuration.parameters.map(p => {
    const { value: _anterior, ...sinValor } = p;

    // Un parámetro vacío es la clave `value` AUSENTE, nunca `null`.
    return valores[p.id] === undefined ? sinValor : { ...sinValor, value: valores[p.id] };
  }),
});

// Un cliente usuario de AWS, Azure y GCP, más un IaaS sin módulo de Wazuh.
const BASE: Valores = {
  'P-01': 'usuario',
  'P-02': [
    'AWS producción | IaaS | Amazon Web Services | expedientes | alta | utilizado',
    'Azure suscripción | PaaS | Microsoft | portal del ciudadano | alta | utilizado',
    'GCP analítica | PaaS | Google | estadísticas | media | utilizado',
    'Hetzner | IaaS | Hetzner | laboratorio | baja | utilizado',
  ],
  'P-03': [
    'AWS producción | ENS ALTA | servicios de AWS en el alcance del CCN | 2027-06-30 | declaración de conformidad AWS-ENS-2026',
    'Azure suscripción | ENS ALTA | Microsoft Azure | 2027-03-31 | certificado de conformidad nº 2026/101',
    'GCP analítica | ENS MEDIA | Google Cloud | 2027-01-15 | certificado de conformidad nº 2026/202',
    'Hetzner | CCN-STIC-823 | servidores dedicados | 2026-12-31 | declaración del proveedor',
  ],
  'P-04': [
    'AWS producción | Common Criteria EAL4+ | CCN-2026-001 | 2027-06-30',
    'Azure suscripción | Common Criteria EAL4+ | CCN-2026-002 | 2027-03-31',
    'GCP analítica | LINCE | CCN-2026-003 | 2027-01-15',
    'Hetzner | LINCE | CCN-2026-004 | 2026-12-31',
  ],
  'P-06': [
    'AWS producción | aws-s3 | CloudTrail y GuardDuty de la cuenta 123456789012',
    'Azure suscripción | azure-logs | registro de actividad y Entra ID de sub-0001',
    'GCP analítica | gcp-pubsub | Cloud Audit Logs del proyecto analitica',
    'Hetzner | ninguno | sin módulo de Wazuh',
  ],
  'P-08': [
    'AWS producción | eu-south-2 (España) | eu-west-3 | RGPD',
    'Azure suscripción | Spain Central | West Europe | RGPD',
    'GCP analítica | europe-southwest1 | europe-west1 | RGPD',
    'Hetzner | Falkenstein (DE) | Helsinki (FI) | RGPD',
  ],
  'P-09': [
    'AWS producción | AES-256 en S3 y EBS | KMS con CMK propia',
    'Azure suscripción | AES-256 | claves del proveedor',
    'GCP analítica | AES-256 | Cloud KMS con CMEK',
    'Hetzner | LUKS en los discos | claves propias',
  ],
  'P-10': [
    'AWS producción | resumen ejecutivo del pentest 2026 | 2026-02-15 | plataforma',
    'Azure suscripción | informe de pentest 2026 | 2026-04-01 | Azure',
    'GCP analítica | resumen ejecutivo 2025 | 2025-11-20 | Google Cloud',
    'Hetzner | informe de pentest 2026 | 2026-05-10 | centro de datos',
  ],
  'P-11': [
    'AWS producción | arn:aws:iam::123456789012:role/Admin',
    'Azure suscripción | admin@cliente.example',
    'GCP analítica | ops@cliente.example',
  ],
  'P-05': ['ninguno'],
  'P-12': '12',
  'P-13': '24',
};

const SIN_PARAMETROS: Valores = {};

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Valores = BASE,
  nivel: ENSLevel = 'MEDIO',
  ahora: Date = AHORA
) => {
  const cfg = configuracion(valores);
  const delControl = keepLatestRunStateFacts('op.nub.1', evs, ahora);
  const evidencias = resolveEvidenceForControl('op.nub.1', delControl, '000', nivel, cfg, ahora);
  const contexto = buildPolicyContext(opNub1CatalogDefinition, cfg, nivel, delControl, evidencias, ahora);
  const { decisions, runtimeVariables } = opNub1PolicyDefinition.evaluator!(contexto);
  const tabla = applyPolicyDecisionsToEvidences(evidencias, decisions, opNub1CatalogDefinition.requirements);
  const atestaciones = parseRequirementAttestations(cfg);
  const requisito = (id: string) =>
    evaluateRequirement(
      opNub1CatalogDefinition.requirements.find(q => q.id === id)!,
      nivel,
      tabla,
      false,
      decisions,
      'ACTIVE',
      atestaciones.get(id)
    );
  const evidencia = (id: string) => tabla.find(e => e.id === id);
  const motivo = (req: string) => decisions.find(d => d.requirementId === req)?.reason || '';
  const deEvidencia = (req: string, ev: string) => decisions.find(d => d.trace.ruleId === `${req}/${ev}`);
  const motor = () =>
    evaluateENSControl(
      opNub1CatalogDefinition,
      cfg,
      nivel,
      evidencias,
      {
        controlId: 'op.nub.1',
        policyId: opNub1PolicyDefinition.id,
        evaluatedAt: ahora.toISOString(),
        decisions,
        appliedParameters: [],
        runtimeVariables,
      },
      delControl
    );

  return { decisions, runtimeVariables, requisito, evidencia, motivo, deEvidencia, motor };
};

const estadoDe = (r: ReturnType<typeof evalua>, ev: string) => `${r.evidencia(ev)?.status} ${r.evidencia(ev)?.gapCause || ''}`.trim();

// --- 1. catálogo ------------------------------------------------------------

bloque('1. Catálogo: categoría del sistema, plano del manager, documentales y datos del informe');

{
  const niveles = (id: string) =>
    opNub1CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');
  const req = (id: string) => opNub1CatalogDefinition.requirements.find(r => r.id === id)!;

  comprueba('op.nub.1 se rige por la categoría (sin dimensión propia)', opNub1CatalogDefinition.levelDimension === undefined);
  comprueba('se mide solo en el manager', JSON.stringify(opNub1CatalogDefinition.measurementPlanes) === '["manager"]');
  comprueba('la base (1.1 y 1.2) rige en las tres categorías', niveles('op.nub.1.1') === 'BAJO,MEDIO,ALTO' && niveles('op.nub.1.2') === 'BAJO,MEDIO,ALTO');
  comprueba('R1 (r1.1 y r1.2) desde MEDIA', niveles('op.nub.1.r1.1') === 'MEDIO,ALTO' && niveles('op.nub.1.r1.2') === 'MEDIO,ALTO');
  comprueba('R2 solo en ALTA', niveles('op.nub.1.r2.1') === 'ALTO');
  comprueba('el control está ACTIVE', opNub1CatalogDefinition.status === 'ACTIVE', opNub1CatalogDefinition.status);
  comprueba('op.nub.1.1 y op.nub.1.r1.2 no declaran evidencia técnica (documentales: P-03 y P-05)', !req('op.nub.1.1').evidenceIds.length && !req('op.nub.1.r1.2').evidenceIds.length);
  comprueba(
    'op.nub.1 no declara P-ATT: ninguna atestación sin caducidad puede acreditar 1.1 ni R1.2 (decisión 1)',
    !opNub1Configuration.parameters.some(p => p.id === 'P-ATT') && parseRequirementAttestations(configuracion(BASE)).size === 0
  );
  comprueba(
    'EV-03, EV-05, EV-06 y EV-07 no las juzga ningún requisito (datos del informe: sin SCA cloud; el segundo factor lo juzga op.acc.6)',
    opNub1CatalogDefinition.requirements.every(r => !['EV-03', 'EV-05', 'EV-06', 'EV-07'].some(ev => r.evidenceIds.includes(ev)))
  );
  comprueba(
    'la policy declara los mismos niveles, evidencias y parámetros que el catálogo',
    opNub1PolicyDefinition.requirements.every(r => {
      const c = req(r.requirementId);

      return r.levels.join(',') === c.applicability.levels.join(',') && r.evidenceIds.join(',') === c.evidenceIds.join(',') && r.parameterIds.join(',') === c.parameterIds.join(',');
    })
  );
  comprueba(
    'los estados (integraciones, postura) son hechos de estado; las acciones (operaciones, accesos), no',
    ['cloud_integration_observed', 'cloud_posture_finding_observed'].every(t => getStateFactEventTypes('op.nub.1').has(t)) &&
      !getStateFactEventTypes('op.nub.1').has('cloud_admin_operation_observed') &&
      !getStateFactEventTypes('op.nub.1').has('cloud_authentication_observed')
  );
  const definiciones = getEvidenceDefinitions('op.nub.1');
  comprueba(
    'cada evidencia con hecho lo acredita con su regla de la banda 111500 (y ninguna regla inventada)',
    definiciones.length === 9 &&
      definiciones.every(e => e.relatedRules.every(r => /^1115\d\d$/.test(r))) &&
      JSON.stringify(definiciones.filter(e => e.relatedRules.length).map(e => `${e.id}:${e.relatedRules.join('+')}`)) ===
        '["EV-01:111501","EV-02:111502","EV-04:111503","EV-07:111504"]',
    definiciones.map(e => `${e.id}:${e.relatedRules.join('+')}`).join(' ')
  );
  comprueba('ningún parámetro lleva un identificador de regla inventado', opNub1Configuration.parameters.every(p => !p.ruleIds.length));
  const invalidos = configuracion(BASE)
    .parameters.map(p => ({ id: p.id, veredicto: validateParameterValue(p, p.value) }))
    .filter(v => !v.veredicto.valid);
  comprueba(
    'los valores de BASE son válidos para sus tablas (fechas AAAA-MM-DD, módulos y usos del desplegable)',
    invalidos.length === 0,
    invalidos.map(v => `${v.id}: ${v.veredicto.reason}`).join('; ')
  );
  comprueba(
    'y una vigencia «hasta 06/2027» no la admite el formulario',
    !validateParameterValue(configuracion(BASE).parameters.find(p => p.id === 'P-03')!, ['AWS producción | ENS ALTA | x | hasta 06/2027 | x']).valid
  );
}

// --- 2. verde ------------------------------------------------------------------

bloque('2. Verde: usuario de AWS, Azure y GCP con expediente vigente y la integración viva');

{
  const r = evalua(hoy());
  const r12 = r.requisito('op.nub.1.2');

  comprueba('op.nub.1.2 CUMPLE en MEDIA, acreditado documentalmente', r12.status === 'CUMPLE' && r12.attested === true && r12.evidenced === true, `${r12.status} ${r12.attested} ${r.motivo('op.nub.1.2')}`);
  comprueba('y se lee «Acreditado documentalmente», no como medido', /^Acreditado documentalmente/.test(r12.observations[0] || ''), r12.observations[0]);
  comprueba('op.nub.1.r1.1 CUMPLE acreditado: las cuatro certificaciones en vigor', r.requisito('op.nub.1.r1.1').status === 'CUMPLE' && r.requisito('op.nub.1.r1.1').attested === true, r.motivo('op.nub.1.r1.1'));
  comprueba('op.nub.1.1 NO_APLICA: P-01 = usuario, no presta', r.requisito('op.nub.1.1').status === 'NO_APLICA', r.requisito('op.nub.1.1').status);
  comprueba('op.nub.1.r1.2 NO_APLICA: P-05 declara «ninguno»', r.requisito('op.nub.1.r1.2').status === 'NO_APLICA' && /no se utiliza ningún servicio en la nube de seguridad/.test(r.motivo('op.nub.1.r1.2')), r.motivo('op.nub.1.r1.2'));
  comprueba('op.nub.1.r2.1 NO_APLICA en MEDIA', r.requisito('op.nub.1.r2.1').status === 'NO_APLICA');
  comprueba(
    'EV-01 CUMPLE: los tres módulos vivos, sin errores, y el de Azure visto por sus alertas',
    r.evidencia('EV-01')?.status === 'CUMPLE' && /azure-logs\): configurado en agente:031/.test(r.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''),
    r.deEvidencia('op.nub.1.2', 'EV-01')?.reason
  );
  comprueba(
    'el IaaS sin módulo de Wazuh es un hallazgo del informe, no un incumplimiento',
    /Sin integración en Wazuh \(hallazgo del informe, sin veredicto.*«Hetzner»/.test(r.deEvidencia('op.nub.1.2', 'EV-01')?.reason || '') &&
      JSON.stringify(r.runtimeVariables.find(v => v.name === 'servicios_sin_integracion')?.value) === '["Hetzner"]',
    r.deEvidencia('op.nub.1.2', 'EV-01')?.reason
  );
  comprueba(
    'EV-04 CUMPLE: el rol Admin y admin@ están en P-11; la acción de config.amazonaws.com no se contrasta',
    r.evidencia('EV-04')?.status === 'CUMPLE' && /role\/Admin/.test(r.deEvidencia('op.nub.1.2', 'EV-04')?.reason || '') && !/config\.amazonaws\.com/.test(r.deEvidencia('op.nub.1.2', 'EV-04')?.reason || ''),
    r.deEvidencia('op.nub.1.2', 'EV-04')?.reason
  );
  comprueba(
    'EV-07 NO_APLICA: hallazgo del informe cruzado con op.acc.6.r8.1, con lo observado (GCP no trae inicios de sesión)',
    r.evidencia('EV-07')?.status === 'NO_APLICA' && /op\.acc\.6\.r8\.1/.test(r.deEvidencia('op.nub.1.2', 'EV-07')?.reason || '') && /GCP analítica.*no consta ningún acceso interactivo/.test(r.deEvidencia('op.nub.1.2', 'EV-07')?.reason || ''),
    `${estadoDe(r, 'EV-07')} ${r.deEvidencia('op.nub.1.2', 'EV-07')?.reason}`
  );
  comprueba(
    'EV-09 CUMPLE «acreditado documentalmente», y el puente no la deja en «sin recogida»',
    r.evidencia('EV-09')?.status === 'CUMPLE' && (r.evidencia('EV-09')?.observations || []).some(o => /Acreditado documentalmente/.test(o)),
    estadoDe(r, 'EV-09')
  );
  ['EV-03', 'EV-05', 'EV-06'].forEach(ev =>
    comprueba(
      `${ev} NO_APLICA como dato del informe, no en gris`,
      r.evidencia(ev)?.status === 'NO_APLICA' && (r.evidencia(ev)?.observations || []).some(o => /Dato del informe, sin veredicto/.test(o)),
      estadoDe(r, ev)
    )
  );
  comprueba('EV-05 enseña lo declarado en P-09', (r.evidencia('EV-05')?.observations || []).some(o => /Declarado en P-09: AWS producción: AES-256/.test(o)));
  comprueba('EV-08 enseña los días que quedan', /quedan \d+ días/.test(r.deEvidencia('op.nub.1.r1.1', 'EV-08')?.reason || ''));

  const control = r.motor();
  comprueba('el control sale CUMPLE al 100 % en MEDIA', control.status === 'CUMPLE' && control.score === 100, `${control.status} ${control.score}`);

  const informe = buildOpNub1ReportModel(control);
  comprueba('el informe tiene los 12 campos de la plantilla', informe.fields.length === 12, informe.fields.length);
  comprueba(
    'y separa el bloque documental del técnico en la puntuación',
    informe.fields[11].details.some(d => /^Bloque documental/.test(d)) && informe.fields[11].details.some(d => /^Bloque técnico/.test(d)),
    informe.fields[11].details.join(' | ')
  );
  comprueba('el expediente se marca DOCUMENTACIÓN APORTADA', /DOCUMENTACIÓN APORTADA/.test(informe.fields[2].value));

  const basica = evalua(hoy(), BASE, 'BAJO');
  comprueba('en BÁSICA, R1 no aplica y op.nub.1.2 sigue acreditado', basica.requisito('op.nub.1.r1.1').status === 'NO_APLICA' && basica.requisito('op.nub.1.2').status === 'CUMPLE');
}

// --- 3. P-01 = ninguno ------------------------------------------------------------

bloque('3. P-01 = ninguno: todo NO_APLICA, declarado (y no NO_EVALUABLE por un inventario vacío)');

{
  const r = evalua([], { 'P-01': 'ninguno' }, 'ALTO');

  comprueba(
    'los cinco requisitos NO_APLICA en ALTA, sin hechos ni más parámetros',
    ['op.nub.1.1', 'op.nub.1.2', 'op.nub.1.r1.1', 'op.nub.1.r1.2', 'op.nub.1.r2.1'].every(id => r.requisito(id).status === 'NO_APLICA'),
    ['op.nub.1.1', 'op.nub.1.2', 'op.nub.1.r1.1', 'op.nub.1.r1.2', 'op.nub.1.r2.1'].map(id => r.requisito(id).status).join(',')
  );
  comprueba('y todas las evidencias también', ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'].every(ev => r.evidencia(ev)?.status === 'NO_APLICA'));
  comprueba('el control sale NO_APLICA, sin número', r.motor().status === 'NO_APLICA' && r.motor().score === undefined, `${r.motor().status} ${r.motor().score}`);
  comprueba('el motivo dice que es una declaración', /P-01 declara que el sistema no presta ni utiliza servicios en la nube/.test(r.motivo('op.nub.1.2')));
}

// --- 4. la medida manda sobre el documento -----------------------------------------

bloque('4. `attested` nunca tapa una medida técnica en NO_CUMPLE (cada eje con su reversión)');

{
  const noAcreditado = (r: ReturnType<typeof evalua>) => {
    const q = r.requisito('op.nub.1.2');

    return q.status === 'NO_CUMPLE' && q.evidenced === true && !q.attested;
  };

  // EV-04 · un actor fuera de P-11.
  const conContratista = (actor: string) =>
    hoy(l => (l.event === 'cloud_admin_operation_observed' && l.modulo === 'azure-logs' && enLaUltima(l) ? [l, { ...l, actor, operaciones: 'Microsoft.Authorization/roleAssignments/write' }] : l));
  const intruso = evalua(conContratista('contratista@externo.example'));
  comprueba(
    'operación de administración de un actor que P-11 no autoriza → op.nub.1.2 NO_CUMPLE medido, sin la marca',
    noAcreditado(intruso) && /contratista@externo\.example/.test(intruso.motivo('op.nub.1.2')),
    `${intruso.requisito('op.nub.1.2').status} ${intruso.motivo('op.nub.1.2')}`
  );
  comprueba('y EV-04 sale NO_CUMPLE en la tabla', intruso.evidencia('EV-04')?.status === 'NO_CUMPLE');
  comprueba(
    'REVERSIÓN: el mismo hecho con el actor en P-11 → CUMPLE acreditado',
    evalua(conContratista('contratista@externo.example'), { ...BASE, 'P-11': [...(BASE['P-11'] as string[]), 'Azure suscripción | contratista@externo.example'] }).requisito('op.nub.1.2').attested === true
  );
  comprueba(
    'un actor autorizado para OTRO servicio no vale para este',
    noAcreditado(evalua(conContratista('ops@cliente.example')))
  );

  // EV-07 · acceso con éxito sin segundo factor: HALLAZGO, no veredicto
  // (ronda 1: el criterio es el de op.acc.6.r8.1; las ubicaciones de confianza
  // de Azure darían rojos falsos aquí).
  const sinMfa = evalua(hoy(l => (l.event === 'cloud_authentication_observed' && l.usuario === 'arn:aws:iam::123456789012:user/alice' && enLaUltima(l) ? { ...l, segundo_factor: 'no' } : l)));
  comprueba(
    'un acceso a la consola de AWS sin segundo factor NO tumba op.nub.1.2: sigue acreditado',
    sinMfa.requisito('op.nub.1.2').attested === true,
    `${sinMfa.requisito('op.nub.1.2').status} ${sinMfa.motivo('op.nub.1.2')}`
  );
  comprueba(
    'y se informa destacado, nombrando al usuario y su origen, cruzado con op.acc.6.r8.1',
    sinMfa.evidencia('EV-07')?.status === 'NO_APLICA' &&
      /HAY ACCESOS SIN SEGUNDO FACTOR.*user\/alice.*203\.0\.113\.10/.test(sinMfa.deEvidencia('op.nub.1.2', 'EV-07')?.reason || '') &&
      sinMfa.runtimeVariables.find(v => v.name === 'accesos_cloud')?.value === 'NO_CUMPLE',
    sinMfa.deEvidencia('op.nub.1.2', 'EV-07')?.reason
  );
  const federado = evalua(hoy(l => (l.event === 'cloud_authentication_observed' && l.modulo === 'aws-s3' ? { ...l, segundo_factor: '-' } : l)));
  comprueba(
    'REVERSIÓN: el acceso federado, sin el dato del segundo factor, no se destaca (no se puede afirmar)',
    federado.runtimeVariables.find(v => v.name === 'accesos_cloud')?.value === 'NO_EVALUABLE' && !/HAY ACCESOS SIN SEGUNDO FACTOR/.test(federado.deEvidencia('op.nub.1.2', 'EV-07')?.reason || ''),
    federado.runtimeVariables.find(v => v.name === 'accesos_cloud')?.value
  );
  const fallido = evalua(hoy(l => (l.event === 'cloud_authentication_observed' && l.usuario === 'bob@cliente.example' ? { ...l, segundo_factor: 'no' } : l)));
  comprueba('un intento FALLIDO sin segundo factor no es un acceso: no se destaca', fallido.runtimeVariables.find(v => v.name === 'accesos_cloud')?.value !== 'NO_CUMPLE');

  // EV-01 · el módulo, su ingesta y sus errores.
  const sinModulo = evalua(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' ? undefined : l)));
  comprueba(
    'P-06 declara GCP por gcp-pubsub y Wazuh no tiene el módulo → NO_CUMPLE',
    noAcreditado(sinModulo) && /no tiene el módulo gcp-pubsub configurado/.test(sinModulo.motivo('op.nub.1.2')),
    sinModulo.motivo('op.nub.1.2')
  );
  comprueba(
    'REVERSIÓN: el mismo hecho con GCP declarado «ninguno» en P-06 → hallazgo, no incumplimiento',
    evalua(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' ? undefined : l)), {
      ...BASE,
      'P-06': (BASE['P-06'] as string[]).map(f => (f.startsWith('GCP') ? 'GCP analítica | ninguno | -' : f)),
    }).requisito('op.nub.1.2').attested === true
  );

  const parada = (l: Linea) => (l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' ? { ...l, ultima_alerta: '2026-10-07T08:00:00Z', alertas_24h: 0 } : l);
  comprueba('AWS sin registros desde hace 52 h (P-13 = 24) → la ingesta está parada: NO_CUMPLE', noAcreditado(evalua(hoy(parada))), evalua(hoy(parada)).motivo('op.nub.1.2'));
  comprueba('REVERSIÓN: el mismo hecho con P-13 = 72 → CUMPLE acreditado', evalua(hoy(parada), { ...BASE, 'P-13': '72' }).requisito('op.nub.1.2').attested === true);

  const errores = evalua(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' && enLaUltima(l) ? { ...l, errores_24h: 7, ultimo_error: 'wazuh-modulesd:gcp-pubsub: ERROR: 403 permission denied on subscription' } : l)));
  comprueba(
    'gcp-pubsub con 7 errores en 24 h → NO_CUMPLE con el último error',
    noAcreditado(errores) && /7 errores en 24 h.*403 permission denied/.test(errores.motivo('op.nub.1.2')),
    errores.motivo('op.nub.1.2')
  );
  const deshabilitado = evalua(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' && enLaUltima(l) ? { ...l, habilitado: 'no' } : l)));
  comprueba('aws-s3 configurado pero deshabilitado → NO_CUMPLE', noAcreditado(deshabilitado) && /deshabilitado/.test(deshabilitado.motivo('op.nub.1.2')), deshabilitado.motivo('op.nub.1.2'));

}

// --- 5. rojo documental -------------------------------------------------------------

bloque('5. Rojo documental: vigencias, categoría, pentest y expediente incompleto');

{
  // Conformidad vencida: la de Hetzner vence el 2026-12-31.
  const enero = new Date('2027-01-10T12:30:00Z');
  const tarde = evalua([], BASE, 'MEDIO', enero);
  comprueba(
    'el 10/01/2027 la conformidad de Hetzner ha vencido → op.nub.1.2 NO_CUMPLE (documental, sin la marca)',
    tarde.requisito('op.nub.1.2').status === 'NO_CUMPLE' && !tarde.requisito('op.nub.1.2').attested && /«Hetzner».*vencida el 2026-12-31/.test(tarde.motivo('op.nub.1.2')),
    tarde.motivo('op.nub.1.2')
  );
  comprueba('y su certificación también → R1 NO_CUMPLE', tarde.requisito('op.nub.1.r1.1').status === 'NO_CUMPLE' && /Hetzner.*venció el 2026-12-31/.test(tarde.motivo('op.nub.1.r1.1')), tarde.motivo('op.nub.1.r1.1'));
  // P-12 = 24 para que el pentest de GCP (2025-11-20) no caduque antes.
  const enDiciembre = evalua(hoy(), { ...BASE, 'P-12': '24' }, 'MEDIO', new Date('2026-12-31T20:00:00Z'));
  comprueba(
    'REVERSIÓN: el último día de vigencia todavía vale (el expediente; la ingesta ya no se juzga a esa fecha)',
    enDiciembre.evidencia('EV-09')?.status === 'CUMPLE' && enDiciembre.evidencia('EV-08')?.status === 'CUMPLE',
    `${estadoDe(enDiciembre, 'EV-09')} ${estadoDe(enDiciembre, 'EV-08')}`
  );

  // Categoría de la conformidad frente a la del sistema.
  const basicaGcp = { ...BASE, 'P-03': (BASE['P-03'] as string[]).map(f => (f.startsWith('GCP') ? 'GCP analítica | ENS BÁSICA | Google Cloud | 2027-01-15 | nº 1' : f)) };
  comprueba('GCP con conformidad ENS BÁSICA en un sistema MEDIA → NO_CUMPLE', evalua(hoy(), basicaGcp).evidencia('EV-09')?.status === 'NO_CUMPLE' && /inferior a la categoría MEDIA/.test(evalua(hoy(), basicaGcp).motivo('op.nub.1.2')));
  comprueba('REVERSIÓN: la misma conformidad en un sistema BÁSICA → CUMPLE', evalua(hoy(), basicaGcp, 'BAJO').evidencia('EV-09')?.status === 'CUMPLE');
  // Mencionar una guía CCN-STIC no salta la categoría del ENS.
  const conGuia = (conformidad: string) =>
    evalua(hoy(), { ...BASE, 'P-03': (BASE['P-03'] as string[]).map(f => (f.startsWith('GCP') ? `GCP analítica | ${conformidad} | Google Cloud | 2027-01-15 | nº 1` : f)) });
  comprueba(
    '«ENS BÁSICA (CCN-STIC 809)» en un sistema MEDIA → NO_CUMPLE: manda la categoría del ENS, no la guía',
    conGuia('ENS BÁSICA (CCN-STIC 809)').evidencia('EV-09')?.status === 'NO_CUMPLE' && /inferior a la categoría MEDIA/.test(conGuia('ENS BÁSICA (CCN-STIC 809)').motivo('op.nub.1.2')),
    conGuia('ENS BÁSICA (CCN-STIC 809)').motivo('op.nub.1.2')
  );
  comprueba('REVERSIÓN: «ENS MEDIA (CCN-STIC 809)» → CUMPLE', conGuia('ENS MEDIA (CCN-STIC 809)').evidencia('EV-09')?.status === 'CUMPLE');
  comprueba('y una guía sin «ENS» («CCN-STIC-823») se acepta como guía → CUMPLE', conGuia('CCN-STIC-823').evidencia('EV-09')?.status === 'CUMPLE');

  // Pentest más viejo que P-12.
  const viejo = evalua(hoy(), { ...BASE, 'P-12': '10' });
  comprueba('el pentest de GCP es del 2025-11-20 y P-12 = 10 meses → NO_CUMPLE (a)', viejo.evidencia('EV-09')?.status === 'NO_CUMPLE' && /a\) el pentest «resumen ejecutivo 2025» es del 2025-11-20/.test(viejo.motivo('op.nub.1.2')), viejo.motivo('op.nub.1.2'));
  comprueba('REVERSIÓN: P-12 = 12 → CUMPLE', evalua(hoy(), { ...BASE, 'P-12': '12' }).evidencia('EV-09')?.status === 'CUMPLE');

  // Expediente sin una fila.
  const sinJurisdiccion = evalua(hoy(), { ...BASE, 'P-08': (BASE['P-08'] as string[]).filter(f => !f.startsWith('Azure')) });
  comprueba('Azure sin región ni jurisdicción en P-08 → NO_CUMPLE (d)', sinJurisdiccion.evidencia('EV-09')?.status === 'NO_CUMPLE' && /«Azure suscripción».*d\) sin región/.test(sinJurisdiccion.motivo('op.nub.1.2')), sinJurisdiccion.motivo('op.nub.1.2'));
  ['no', 'ninguno', 'Sin cifrar'].forEach(cifrado => {
    const r = evalua(hoy(), { ...BASE, 'P-09': (BASE['P-09'] as string[]).map(f => (f.startsWith('Hetzner') ? `Hetzner | ${cifrado} | -` : f)) });

    comprueba(
      `cifrado «${cifrado}» en P-09 → NO_CUMPLE (c), no una fila incompleta`,
      r.evidencia('EV-09')?.status === 'NO_CUMPLE' && /«Hetzner».*c\) P-09 declara que los datos no se cifran/.test(r.motivo('op.nub.1.2')),
      `${estadoDe(r, 'EV-09')} ${r.motivo('op.nub.1.2')}`
    );
  });
  comprueba(
    'REVERSIÓN: «LUKS en los discos» con la gestión de claves vacía → CONFIGURATION, no NO_CUMPLE',
    evalua(hoy(), { ...BASE, 'P-09': (BASE['P-09'] as string[]).map(f => (f.startsWith('Hetzner') ? 'Hetzner | LUKS en los discos | ' : f)) }).evidencia('EV-09')?.gapCause === 'CONFIGURATION'
  );
  const sinCertificado = evalua(hoy(), { ...BASE, 'P-04': (BASE['P-04'] as string[]).filter(f => !f.startsWith('Hetzner')) });
  comprueba('Hetzner sin certificación en P-04 → R1 NO_CUMPLE', sinCertificado.requisito('op.nub.1.r1.1').status === 'NO_CUMPLE' && sinCertificado.requisito('op.nub.1.r1.1').evidenced === true, sinCertificado.motivo('op.nub.1.r1.1'));
  comprueba('y op.nub.1.2 sigue acreditado: la certificación es de R1', sinCertificado.requisito('op.nub.1.2').attested === true);

  // Texto donde va una fecha: nunca se interpreta.
  ['hasta 06/2027', '06/2027', '2027'].forEach(celda => {
    const r = evalua(hoy(), { ...BASE, 'P-03': (BASE['P-03'] as string[]).map(f => (f.startsWith('Azure') ? `Azure suscripción | ENS ALTA | Microsoft Azure | ${celda} | nº` : f)) });

    comprueba(
      `vigencia «${celda}» → NO_EVALUABLE por CONFIGURATION nombrando la fila, nunca CUMPLE`,
      r.evidencia('EV-09')?.status === 'NO_EVALUABLE' && r.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /P-03, fila de «Azure suscripción»/.test(r.motivo('op.nub.1.2')) && !r.requisito('op.nub.1.2').attested,
      `${estadoDe(r, 'EV-09')} ${r.motivo('op.nub.1.2')}`
    );
  });
  const sinCategoria = evalua(hoy(), { ...BASE, 'P-03': (BASE['P-03'] as string[]).map(f => (f.startsWith('Azure') ? 'Azure suscripción | ENS | Microsoft Azure | 2027-03-31 | nº' : f)) });
  comprueba('conformidad «ENS» sin categoría → CONFIGURATION, pide la categoría', sinCategoria.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /no dice la categoría/.test(sinCategoria.motivo('op.nub.1.2')));
  const futuro = evalua(hoy(), { ...BASE, 'P-10': (BASE['P-10'] as string[]).map(f => (f.startsWith('AWS') ? 'AWS producción | pentest 2027 | 2027-02-15 | plataforma' : f)) });
  comprueba('un pentest fechado en el futuro → CONFIGURATION, no acredita', futuro.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /fechado en el futuro/.test(futuro.motivo('op.nub.1.2')));
}

// --- 6. sin parámetros ni inventario -------------------------------------------------

bloque('6. Sin parámetros o sin inventario: NO_EVALUABLE con causa CONFIGURATION, nunca CUMPLE por vacío');

{
  const r = evalua(hoy(), SIN_PARAMETROS, 'ALTO');

  ['op.nub.1.1', 'op.nub.1.2', 'op.nub.1.r1.1', 'op.nub.1.r1.2', 'op.nub.1.r2.1'].forEach(id =>
    comprueba(
      `sin P-01, ${id} no demostrado (NO_CUMPLE sin medir), causa CONFIGURATION`,
      r.requisito(id).status === 'NO_CUMPLE' && r.requisito(id).evidenced === false && r.decisions.find(d => d.requirementId === id)?.cause === 'CONFIGURATION',
      `${r.requisito(id).status} ${r.requisito(id).evidenced} ${r.decisions.find(d => d.requirementId === id)?.cause}`
    )
  );
  ['EV-01', 'EV-02', 'EV-04', 'EV-08', 'EV-09'].forEach(ev =>
    comprueba(`${ev} sin medir por CONFIGURATION`, r.evidencia(ev)?.status === 'NO_EVALUABLE' && r.evidencia(ev)?.gapCause === 'CONFIGURATION', estadoDe(r, ev))
  );
  comprueba('el motivo nombra P-01', /P-01 \(Posición respecto a los servicios en la nube\) está sin configurar/.test(r.motivo('op.nub.1.2')), r.motivo('op.nub.1.2'));

  const raro = evalua(hoy(), { ...BASE, 'P-01': 'cliente' });
  comprueba('P-01 con un valor que no es una opción → CONFIGURATION', raro.requisito('op.nub.1.2').evidenced === false && /no es ninguna de sus opciones/.test(raro.motivo('op.nub.1.2')));

  const sinInventario = evalua(hoy(), { ...BASE, 'P-02': undefined });
  comprueba(
    'sin P-02 (el alcance), op.nub.1.2 y R1 no demostrados por CONFIGURATION, aunque la ingesta cumpla',
    sinInventario.requisito('op.nub.1.2').evidenced === false && sinInventario.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && sinInventario.requisito('op.nub.1.r1.1').evidenced === false,
    `${sinInventario.requisito('op.nub.1.2').status} ${estadoDe(sinInventario, 'EV-09')}`
  );
  const soloP03 = evalua(hoy(), { ...BASE, 'P-03': undefined });
  comprueba('falta solo P-03 → op.nub.1.2 no demostrado, EV-09 CONFIGURATION', soloP03.requisito('op.nub.1.2').evidenced === false && soloP03.evidencia('EV-09')?.gapCause === 'CONFIGURATION');
  const soloP12 = evalua(hoy(), { ...BASE, 'P-12': undefined });
  comprueba('falta solo P-12 → EV-09 CONFIGURATION (no hay contra qué medir el pentest)', soloP12.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /P-12/.test(soloP12.motivo('op.nub.1.2')));
  const soloP04 = evalua(hoy(), { ...BASE, 'P-04': undefined });
  comprueba('falta solo P-04 → R1 no demostrado, CONFIGURATION', soloP04.requisito('op.nub.1.r1.1').evidenced === false && soloP04.evidencia('EV-08')?.gapCause === 'CONFIGURATION');

  const soloP13 = evalua(hoy(), { ...BASE, 'P-13': undefined });
  comprueba('falta solo P-13 → EV-01 CONFIGURATION', soloP13.evidencia('EV-01')?.status === 'NO_EVALUABLE' && soloP13.evidencia('EV-01')?.gapCause === 'CONFIGURATION', estadoDe(soloP13, 'EV-01'));
  comprueba(
    'y op.nub.1.2 sigue acreditado por el expediente, diciendo qué falta medir (integrar no es exigible)',
    soloP13.requisito('op.nub.1.2').attested === true && soloP13.requisito('op.nub.1.2').observations.some(o => /^EV-01 sin medir \(sin configurar\)/.test(o)),
    soloP13.requisito('op.nub.1.2').observations.join(' | ')
  );
  const soloP06 = evalua(hoy(), { ...BASE, 'P-06': undefined });
  comprueba(
    'falta P-06 → EV-01 y EV-04 CONFIGURATION (y el accesos se informa sin integración)',
    ['EV-01', 'EV-04'].every(ev => soloP06.evidencia(ev)?.gapCause === 'CONFIGURATION') && soloP06.evidencia('EV-07')?.status === 'NO_APLICA',
    ['EV-01', 'EV-04', 'EV-07'].map(ev => estadoDe(soloP06, ev)).join(', ')
  );
  const soloP11 = evalua(hoy(), { ...BASE, 'P-11': undefined });
  comprueba('falta P-11 con operaciones de personas → EV-04 CONFIGURATION, nombrando a los actores', soloP11.evidencia('EV-04')?.gapCause === 'CONFIGURATION' && /role\/Admin/.test(soloP11.deEvidencia('op.nub.1.2', 'EV-04')?.reason || ''));
  const sinOps = evalua(hoy(l => (l.event === 'cloud_admin_operation_observed' ? undefined : l)), { ...BASE, 'P-11': undefined });
  comprueba('REVERSIÓN: sin operaciones en la ventana y con la ingesta viva, P-11 no hace falta → EV-04 CUMPLE', sinOps.evidencia('EV-04')?.status === 'CUMPLE', estadoDe(sinOps, 'EV-04'));

  // P-02 contra P-01.
  const ambosSinUso = { ...BASE, 'P-01': 'ambos', 'P-02': (BASE['P-02'] as string[]).map(f => (f.startsWith('Hetzner') ? 'Hetzner | IaaS | Hetzner | laboratorio | baja' : f)) };
  const ambos = evalua(hoy(), ambosSinUso);
  comprueba(
    'P-01 = ambos y una fila de P-02 sin «uso» → CONFIGURATION nombrando la fila, nunca CUMPLE',
    ambos.evidencia('EV-09')?.gapCause === 'CONFIGURATION' && /P-02, servicio «Hetzner»: con P-01 = ambos hay que decir/.test(ambos.motivo('op.nub.1.2')) && !ambos.requisito('op.nub.1.2').attested,
    `${estadoDe(ambos, 'EV-09')} ${ambos.motivo('op.nub.1.2')}`
  );
  comprueba('REVERSIÓN: con P-01 = usuario la misma fila es un servicio utilizado → acreditado', evalua(hoy(), { ...ambosSinUso, 'P-01': 'usuario' }).requisito('op.nub.1.2').attested === true);
  const contradictorio = evalua(hoy(), { ...BASE, 'P-02': [...(BASE['P-02'] as string[]), 'Portal propio | SaaS | Quersystem | trámites | alta | prestado'] });
  comprueba('P-01 = usuario y una fila «prestado» → CONFIGURATION nombrando la fila, nunca CUMPLE', contradictorio.requisito('op.nub.1.2').attested !== true && /«Portal propio»: se declara prestado y P-01 dice «usuario»/.test(contradictorio.motivo('op.nub.1.2')), contradictorio.motivo('op.nub.1.2'));
  const p06Raro = evalua(hoy(), { ...BASE, 'P-06': [...(BASE['P-06'] as string[]), 'Hetzner | hcloud | API'] });
  comprueba('P-06 con un módulo que no es de Wazuh → CONFIGURATION nombrando la fila', p06Raro.evidencia('EV-01')?.gapCause === 'CONFIGURATION' && /«hcloud» no es un módulo cloud de Wazuh/.test(p06Raro.motivo('op.nub.1.2')), p06Raro.motivo('op.nub.1.2'));
}

// --- 7. sin recolector o con la fuente rota ----------------------------------------

bloque('7. Sin recolector o con la fuente rota: NO_EVALUABLE por RECOGIDA; lo medido no se tapa');

{
  const nada = evalua([]);
  comprueba('sin ningún hecho → EV-01 por RECOGIDA', nada.evidencia('EV-01')?.status === 'NO_EVALUABLE' && nada.evidencia('EV-01')?.gapCause === 'COLLECTION', estadoDe(nada, 'EV-01'));
  comprueba('y EV-04 también por RECOGIDA (no por evidencia)', nada.evidencia('EV-04')?.gapCause === 'COLLECTION', estadoDe(nada, 'EV-04'));
  comprueba('op.nub.1.2 se acredita con el expediente, diciendo que no se ha medido la ingesta', nada.requisito('op.nub.1.2').attested === true && nada.requisito('op.nub.1.2').observations.some(o => /^EV-01 sin medir \(sin recogida\)/.test(o)));

  // La ingesta es vivacidad: caduca a las 13 h (dos pasadas de 6 h perdidas),
  // no a las 26 h de los estados lentos.
  const a14h = evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-10T02:10:00Z'));
  comprueba(
    '14 h sin pasadas → EV-01 NO_EVALUABLE por RECOGIDA, y EV-04 no puede afirmar «sin operaciones»',
    a14h.evidencia('EV-01')?.status === 'NO_EVALUABLE' && a14h.evidencia('EV-01')?.gapCause === 'COLLECTION' && /más de 13 h/.test(a14h.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''),
    `${estadoDe(a14h, 'EV-01')} ${a14h.deEvidencia('op.nub.1.2', 'EV-01')?.reason}`
  );
  const sinOpsA = (ahora: string) => evalua(hoy(l => (l.event === 'cloud_admin_operation_observed' ? undefined : l)), BASE, 'MEDIO', new Date(ahora));
  comprueba('sin operaciones y la ingesta caducada → EV-04 NO_EVALUABLE, nunca CUMPLE', sinOpsA('2026-10-10T02:10:00Z').evidencia('EV-04')?.status === 'NO_EVALUABLE', estadoDe(sinOpsA('2026-10-10T02:10:00Z'), 'EV-04'));
  comprueba('REVERSIÓN: a las 12 h de la última pasada → EV-01 CUMPLE y EV-04 CUMPLE', evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-10T00:05:00Z')).evidencia('EV-01')?.status === 'CUMPLE' && sinOpsA('2026-10-10T00:05:00Z').evidencia('EV-04')?.status === 'CUMPLE');

  const viejo = evalua(hoy(), BASE, 'MEDIO', new Date('2026-10-11T12:30:00Z'));
  comprueba('dos días sin pasadas: el estado no describe hoy → EV-01 por RECOGIDA', viejo.evidencia('EV-01')?.gapCause === 'COLLECTION' && /no está informando/.test(viejo.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''), viejo.deEvidencia('op.nub.1.2', 'EV-01')?.reason);

  const gap = (ev: string, causa: string, motivo: string) =>
    ({ ts: `${COMPLETA}:30Z`, event: 'evidence_state', evidence_id: ev, requisito: 'op.nub.1.2', plano: 'central', estado: 'NO_EVALUABLE', causa, motivo });
  const sinConf = evalua(hoy().concat(eventos([gap('EV-01', 'COLLECTION', 'no se puede leer /var/ossec/etc/ossec.conf')])));
  comprueba('ossec.conf ilegible después de la pasada → EV-01 NO_EVALUABLE con el motivo del recolector', sinConf.evidencia('EV-01')?.status === 'NO_EVALUABLE' && /ossec\.conf/.test(sinConf.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''));
  const paradaYGap = evalua(eventos(PASADAS.flatMap(ts => pasada(ts)), l => (l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' ? { ...l, ultima_alerta: '2026-10-07T08:00:00Z' } : l)).concat(eventos([gap('EV-01', 'COLLECTION', 'no se puede leer ossec.log')])));
  comprueba(
    'y si en la pasada había una ingesta parada, manda la medida: NO_CUMPLE, con la degradación aparte',
    paradaYGap.evidencia('EV-01')?.status === 'NO_CUMPLE' && /Además: El recolector no ha podido medirlo/.test(paradaYGap.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''),
    paradaYGap.deEvidencia('op.nub.1.2', 'EV-01')?.reason
  );
  const tope = evalua(hoy(l => (l.event === 'cloud_admin_operation_observed' && l.modulo === 'azure-logs' && enLaUltima(l) ? [l, { ...l, actor: 'contratista@externo.example' }] : l)).concat(eventos([gap('EV-04', 'EVIDENCE', 'más de 60 actores distintos en la pasada: no se emiten todos')])));
  comprueba('demasiados actores en una pasada (EVIDENCE) no tapan un actor no autorizado: NO_CUMPLE', tope.evidencia('EV-04')?.status === 'NO_CUMPLE' && /más de 60 actores/.test(tope.deEvidencia('op.nub.1.2', 'EV-04')?.reason || ''), tope.deEvidencia('op.nub.1.2', 'EV-04')?.reason);
  const topeLimpio = evalua(hoy().concat(eventos([gap('EV-04', 'EVIDENCE', 'más de 60 actores distintos en la pasada')])));
  comprueba('REVERSIÓN: sin actor no autorizado, la vista incompleta no deja afirmar: NO_EVALUABLE', topeLimpio.evidencia('EV-04')?.status === 'NO_EVALUABLE');

  // El mismo hecho con la etiqueta de otro control: el motor filtra por
  // `data.ensfacil` y no lo ve.
  const linea = integracion(`${COMPLETA}:10Z`, 'aws-s3', { ultima_alerta: '2026-10-09T12:01:30Z' });
  const soloAws = { ...BASE, 'P-06': ['AWS producción | aws-s3 | -'] };
  const propio = evalua(normalizeWazuhAlerts([alerta(linea), alerta(latido(`${COMPLETA}:40Z`))]), soloAws);
  const deOtro = evalua(normalizeWazuhAlerts([alerta(linea, 'op.mon.1'), alerta(latido(`${COMPLETA}:40Z`), 'op.mon.1')]), soloAws);
  comprueba('un hecho de otro control no acredita op.nub.1 (REVERSIÓN: el mismo, propio, sí)', propio.evidencia('EV-01')?.status === 'CUMPLE' && deOtro.evidencia('EV-01')?.status === 'NO_EVALUABLE', `${estadoDe(propio, 'EV-01')} / ${estadoDe(deOtro, 'EV-01')}`);
}

// --- 8. la edad, en el instante de la observación ------------------------------------

bloque('8. La antigüedad de los registros se mide cuando se observó, no al evaluar');

{
  // La pasada de las 12:05 vio la última alerta de AWS a las 13:00 del día
  // anterior (23 h 05 min). Evaluada a las 20:00, ya son 31 h; pero la foto es
  // de las 12:05 y sigue vigente (frescura 26 h).
  const ayer = (l: Linea) => (l.event === 'cloud_integration_observed' && l.modulo === 'aws-s3' ? { ...l, ultima_alerta: '2026-10-08T13:00:00Z' } : l);
  const r = evalua(hoy(ayer), BASE, 'MEDIO', new Date('2026-10-09T20:00:00Z'));
  comprueba('23 h antes de la observación con P-13 = 24 → CUMPLE aunque al evaluar sean 31 h', r.evidencia('EV-01')?.status === 'CUMPLE', r.deEvidencia('op.nub.1.2', 'EV-01')?.reason);
  comprueba('REVERSIÓN: con P-13 = 20 → NO_CUMPLE, y el motivo da las horas en la observación', evalua(hoy(ayer), { ...BASE, 'P-13': '20' }, 'MEDIO', new Date('2026-10-09T20:00:00Z')).evidencia('EV-01')?.status === 'NO_CUMPLE' &&
    /23\.1 h antes de la observación/.test(evalua(hoy(ayer), { ...BASE, 'P-13': '20' }).motivo('op.nub.1.2')));

  // Un módulo recién configurado, sin registros todavía.
  const nuevo = (desde: string) => hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' ? { ...l, ultima_alerta: '-', alertas_24h: 0, observado_desde: desde } : l));
  comprueba('gcp-pubsub sin registros desde hace 3 días → NO_CUMPLE', evalua(nuevo('2026-10-06T12:05:00Z')).evidencia('EV-01')?.status === 'NO_CUMPLE');
  comprueba('REVERSIÓN: observado solo desde hace 6 h → no se puede afirmar: NO_EVALUABLE, nunca CUMPLE', evalua(nuevo('2026-10-09T06:05:00Z')).evidencia('EV-01')?.status === 'NO_EVALUABLE');

  // Un secreto escrito en la configuración del manager: aviso, no veredicto.
  const secreto = evalua(hoy(l => (l.event === 'cloud_integration_observed' && l.modulo === 'gcp-pubsub' ? { ...l, secreto_en_linea: 'si' } : l)));
  comprueba('una credencial escrita en el manager se avisa sin cambiar el veredicto', secreto.evidencia('EV-01')?.status === 'CUMPLE' && /Aviso: gcp-pubsub en manager lleva la credencial/.test(secreto.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''));
  const ajeno = evalua(hoy(l => (l.event === 'cloud_integration_observed' && enLaUltima(l) && l.modulo === 'gcp-pubsub' ? [l, { ...l, modulo: 'office365', familia: 'office365', donde: 'agente:031' }] : l)));
  comprueba('un módulo que Wazuh ingiere y P-06 no declara se dice, sin veredicto', ajeno.evidencia('EV-01')?.status === 'CUMPLE' && /Wazuh ingiere además office365, que P-06 no declara/.test(ajeno.deEvidencia('op.nub.1.2', 'EV-01')?.reason || ''));
}

// --- 9. R2 en ALTA ---------------------------------------------------------------------

bloque('9. R2 en ALTA: hallazgos de postura del proveedor; sin ellos, no automatizable');

{
  const P07 = { ...BASE, 'P-07': ['AWS producción | CCN-STIC-887 | AWS Foundational Security Best Practices'] };
  const sinPostura = evalua(hoy(), P07, 'ALTO');
  comprueba(
    'sin hallazgos de postura (fuente=ninguna) → R2 NO_EVALUABLE, no demostrado: no hay SCA cloud',
    sinPostura.evidencia('EV-02')?.status === 'NO_EVALUABLE' && sinPostura.requisito('op.nub.1.r2.1').evidenced === false && /no es automatizable/.test(sinPostura.motivo('op.nub.1.r2.1')),
    sinPostura.motivo('op.nub.1.r2.1')
  );
  const hub = (fallidos: number) =>
    hoy(l => (l.event === 'cloud_posture_finding_observed' && enLaUltima(l)
      ? { ...l, modulo: 'aws-s3', fuente: 'securityhub', estandar: 'AWS Foundational Security Best Practices v1.0.0', cuenta: '123456789012', controles_evaluados: 212, controles_fallidos: fallidos, fallidos_criticos: fallidos ? 1 : 0, fallidos: fallidos ? 'S3.2,IAM.6,EC2.19' : '-', ultimo_hallazgo: '2026-10-09T11:00:00Z' }
      : l));
  const fallan = evalua(hub(3), P07, 'ALTO');
  comprueba('Security Hub con 3 controles fallidos → R2 NO_CUMPLE medido, nombrándolos', fallan.requisito('op.nub.1.r2.1').status === 'NO_CUMPLE' && fallan.requisito('op.nub.1.r2.1').evidenced === true && /S3\.2/.test(fallan.motivo('op.nub.1.r2.1')), fallan.motivo('op.nub.1.r2.1'));
  comprueba('REVERSIÓN: los 212 controles pasan → R2 CUMPLE (medido, no acreditado)', evalua(hub(0), P07, 'ALTO').requisito('op.nub.1.r2.1').status === 'CUMPLE' && !evalua(hub(0), P07, 'ALTO').requisito('op.nub.1.r2.1').attested);
  const ilegible = evalua(hoy(l => (l.event === 'cloud_posture_finding_observed' && enLaUltima(l)
    ? { ...l, modulo: 'aws-s3', fuente: 'securityhub', estandar: 'AWS Foundational Security Best Practices v1.0.0', controles_evaluados: '-', controles_fallidos: '-', fallidos: '-' }
    : l)), P07, 'ALTO');
  comprueba(
    'controles_fallidos «-» (ilegible) → NO_EVALUABLE, nunca leído como cero (CUMPLE)',
    ilegible.evidencia('EV-02')?.status === 'NO_EVALUABLE' && /recuento «-»/.test(ilegible.motivo('op.nub.1.r2.1')),
    `${estadoDe(ilegible, 'EV-02')} ${ilegible.motivo('op.nub.1.r2.1')}`
  );
  comprueba('con otro estándar declarado en P-07, esos hallazgos no cuentan → NO_EVALUABLE', evalua(hub(3), { ...BASE, 'P-07': ['AWS producción | CCN-STIC-887 | CIS AWS Foundations'] }, 'ALTO').evidencia('EV-02')?.status === 'NO_EVALUABLE');
  comprueba('sin P-07 en ALTA → CONFIGURATION', evalua(hub(0), BASE, 'ALTO').evidencia('EV-02')?.gapCause === 'CONFIGURATION');
  comprueba('Hetzner en P-07, sin integración → no automatizable', /«Hetzner»: no tiene integración en Wazuh/.test(evalua(hub(0), { ...BASE, 'P-07': ['Hetzner | CCN-STIC-887 | -'] }, 'ALTO').motivo('op.nub.1.r2.1')));
}

// --- 10. prestador y op.pl.5 ---------------------------------------------------------

bloque('10. Prestador (op.nub.1.1) y servicios de seguridad (R1.2): documentales, con su vigencia y sin P-ATT');

{
  const prestador = { 'P-01': 'prestador', 'P-02': ['Portal de trámites | SaaS | Quersystem | expedientes | alta | prestado'] };
  const sinP03 = evalua([], prestador);
  comprueba(
    'prestador sin P-03 → op.nub.1.1 no demostrado (CONFIGURATION), nombrando lo prestado',
    sinP03.requisito('op.nub.1.1').status === 'NO_CUMPLE' && sinP03.requisito('op.nub.1.1').evidenced === false && /Portal de trámites/.test(sinP03.motivo('op.nub.1.1')),
    sinP03.motivo('op.nub.1.1')
  );
  comprueba('y op.nub.1.2, R1 y R1.2 no aplican: no utiliza servicios de terceros', ['op.nub.1.2', 'op.nub.1.r1.1', 'op.nub.1.r1.2'].every(id => sinP03.requisito(id).status === 'NO_APLICA'));
  const conConformidad = (vigencia: string) =>
    evalua([], { ...prestador, 'P-03': [`Portal de trámites | ENS MEDIA | SaaS de tramitación | ${vigencia} | certificado de conformidad nº 2026/300`] });
  comprueba(
    'REVERSIÓN: con la conformidad ENS MEDIA en vigor en P-03 → op.nub.1.1 CUMPLE acreditado',
    conConformidad('2027-09-30').requisito('op.nub.1.1').status === 'CUMPLE' && conConformidad('2027-09-30').requisito('op.nub.1.1').attested === true,
    conConformidad('2027-09-30').motivo('op.nub.1.1')
  );
  comprueba('el control del prestador sale CUMPLE con su conformidad', conConformidad('2027-09-30').motor().status === 'CUMPLE', conConformidad('2027-09-30').motor().status);
  const vencida = conConformidad('2026-09-30');
  comprueba(
    'con la conformidad vencida → NO_CUMPLE documental: «Declarado (documental)», no «Medido»',
    vencida.requisito('op.nub.1.1').status === 'NO_CUMPLE' && vencida.requisito('op.nub.1.1').documental === true && ensRequirementProofLabel(vencida.requisito('op.nub.1.1')) === 'Declarado (documental)',
    `${vencida.requisito('op.nub.1.1').status} ${vencida.motivo('op.nub.1.1')}`
  );

  // P-05 vacío no es «ninguno».
  const vacio = evalua(hoy(), { ...BASE, 'P-05': undefined });
  comprueba(
    'P-05 vacío → R1.2 no demostrado por CONFIGURATION, pidiendo «ninguno» (nunca NO_APLICA por ausencia)',
    vacio.requisito('op.nub.1.r1.2').status === 'NO_CUMPLE' && vacio.requisito('op.nub.1.r1.2').evidenced === false &&
      vacio.decisions.find(d => d.requirementId === 'op.nub.1.r1.2')?.cause === 'CONFIGURATION' && /una sola fila «ninguno»/.test(vacio.motivo('op.nub.1.r1.2')),
    `${vacio.requisito('op.nub.1.r1.2').status} ${vacio.motivo('op.nub.1.r1.2')}`
  );
  comprueba('REVERSIÓN: la misma configuración con P-05 = «ninguno» → NO_APLICA', evalua(hoy(), BASE).requisito('op.nub.1.r1.2').status === 'NO_APLICA');
  const mezcla = evalua(hoy(), { ...BASE, 'P-05': ['ninguno', 'SIEM gestionado | SIEM | sí'] });
  comprueba(
    '«ninguno» mezclado con un servicio → CONFIGURATION, nunca NO_APLICA',
    mezcla.requisito('op.nub.1.r1.2').evidenced === false && mezcla.decisions.find(d => d.requirementId === 'op.nub.1.r1.2')?.cause === 'CONFIGURATION' && /mezcla «ninguno»/.test(mezcla.motivo('op.nub.1.r1.2')),
    mezcla.motivo('op.nub.1.r1.2')
  );

  const siem = (fila: string) => evalua(hoy(), { ...BASE, 'P-05': [fila] });
  const sinRef = siem('SIEM gestionado | SIEM | sí');
  comprueba(
    'un servicio de seguridad con «sí» pero sin la referencia de la verificación → no demostrado (CONFIGURATION), nombrando la fila',
    sinRef.requisito('op.nub.1.r1.2').status === 'NO_CUMPLE' && sinRef.requisito('op.nub.1.r1.2').evidenced === false && /P-05, fila de «SIEM gestionado»/.test(sinRef.motivo('op.nub.1.r1.2')),
    sinRef.motivo('op.nub.1.r1.2')
  );
  const vigente = siem('SIEM gestionado | SIEM | sí | informe de verificación op.pl.5 nº 12 | 2027-05-31');
  comprueba(
    'REVERSIÓN: con referencia y vigencia en vigor → R1.2 CUMPLE acreditado documentalmente',
    vigente.requisito('op.nub.1.r1.2').status === 'CUMPLE' && vigente.requisito('op.nub.1.r1.2').attested === true,
    vigente.motivo('op.nub.1.r1.2')
  );
  const caducada = siem('SIEM gestionado | SIEM | sí | informe de verificación op.pl.5 nº 12 | 2026-05-31');
  comprueba(
    'la verificación vencida → NO_CUMPLE documental',
    caducada.requisito('op.nub.1.r1.2').status === 'NO_CUMPLE' && caducada.requisito('op.nub.1.r1.2').documental === true && /venció el 2026-05-31/.test(caducada.motivo('op.nub.1.r1.2')),
    caducada.motivo('op.nub.1.r1.2')
  );
  const noPl5 = siem('SIEM gestionado | SIEM | no | - | 2027-05-31');
  comprueba('«cumple op.pl.5 = no» es un incumplimiento declarado', noPl5.requisito('op.nub.1.r1.2').status === 'NO_CUMPLE' && noPl5.requisito('op.nub.1.r1.2').evidenced === true && !noPl5.requisito('op.nub.1.r1.2').attested);

  const ambos = {
    ...BASE,
    'P-01': 'ambos',
    'P-02': [...(BASE['P-02'] as string[]), 'Portal de trámites | SaaS | Quersystem | expedientes | alta | prestado'],
  };
  const r = evalua(hoy(), ambos);
  comprueba('ambos: el servicio prestado no entra en el expediente de terceros (op.nub.1.2 sigue acreditado)', r.requisito('op.nub.1.2').attested === true, r.motivo('op.nub.1.2'));
  comprueba(
    'y op.nub.1.1 juzga la conformidad de lo prestado: sin fila en P-03 → NO_CUMPLE documental',
    r.requisito('op.nub.1.1').status === 'NO_CUMPLE' && r.requisito('op.nub.1.1').documental === true && /«Portal de trámites» \(SaaS\): sin conformidad/.test(r.motivo('op.nub.1.1')),
    r.motivo('op.nub.1.1')
  );
}

// --- 11. volumen y presupuesto -------------------------------------------------------

bloque('11. Volumen: un día del cliente simulado cabe en el presupuesto; las líneas, en logcollector');

{
  const dia = ['00', '06', '12', '18'].flatMap(h => pasada(`2026-10-09T${h}:05`));
  comprueba(`un día del cliente simulado son ${dia.length} hechos, por debajo de los 300 del presupuesto`, dia.length <= 300, dia.length);

  // El caso grande que el contrato acota: 60 actores por pasada en cada tipo
  // de acción, 3 módulos y 3 estándares de postura.
  const grande = 4 * (3 + 3 + 60 + 60 + 1);
  comprueba(`con el tope del contrato (60 actores por tipo y pasada) son ${grande} al día: el tope existe para esto`, grande <= 600, grande);

  // Las listas acotadas del contrato en una línea de ens_emit.
  const larga = acceso(`${COMPLETA}:16Z`, 'aws-s3', `arn:aws:iam::123456789012:user/${'x'.repeat(64)}`, {
    origenes: Array.from({ length: 10 }, (_, i) => `2001:db8:1234:5678:9abc:def0:1234:${String(i).padStart(4, '0')}`).join(','),
  });
  const postu = postura(`${COMPLETA}:12Z`, { fallidos: Array.from({ length: 20 }, (_, i) => `CloudFront.${i + 100}`).join(','), estandar: 'x'.repeat(120) });
  const bytes = [larga, postu].map(l => new TextEncoder().encode(JSON.stringify({ ensfacil: 'op.nub.1', host: 'Wazuh-4', ...l })).length);
  comprueba('las líneas con las listas al tope no pasan de 8 KiB', Math.max(...bytes) <= 8192, Math.max(...bytes));
}

// --- 12. recolector parado ------------------------------------------------------

bloque('12. Recolector parado: lo documental sobrevive (marca `documental`); lo técnico pasa a sin recogida');

{
  const PARADO = { since: '2026-10-07T12:05:40Z', reference: 'collector_run' as const, reason: 'Sin datos del recolector desde el 2026-10-07 12:05 UTC.' };
  // Lo que hace `ens-engine` con una fila sin renovar: marcar las evidencias y
  // las decisiones, y juzgar con eso.
  const parado = (valores: Valores, cambia?: (l: Linea) => Linea | Linea[] | undefined) => {
    const r = evalua(hoy(cambia), valores);
    const decisiones = markPolicyRuntimeStale(
      { controlId: 'op.nub.1', policyId: opNub1PolicyDefinition.id, evaluatedAt: AHORA.toISOString(), decisions: r.decisions, appliedParameters: [], runtimeVariables: [] },
      PARADO
    )!.decisions;
    const cfg = configuracion(valores);
    const evidencias = markEvidencesStale(resolveEvidenceForControl('op.nub.1', [], '000', 'MEDIO', cfg, AHORA), PARADO);
    const tabla = applyPolicyDecisionsToEvidences(evidencias, decisiones, opNub1CatalogDefinition.requirements);
    const requisito = (id: string) =>
      evaluateRequirement(opNub1CatalogDefinition.requirements.find(q => q.id === id)!, 'MEDIO', tabla, false, decisiones, 'ACTIVE');

    return { decisiones, tabla, requisito };
  };

  const sinCertificado = parado({ ...BASE, 'P-04': (BASE['P-04'] as string[]).filter(f => !f.startsWith('Hetzner')) });
  comprueba(
    'la certificación ausente de R1 sigue siendo un NO_CUMPLE documental, no «sin recogida»',
    sinCertificado.requisito('op.nub.1.r1.1').status === 'NO_CUMPLE' && sinCertificado.requisito('op.nub.1.r1.1').evidenced === true && sinCertificado.requisito('op.nub.1.r1.1').documental === true,
    `${sinCertificado.requisito('op.nub.1.r1.1').status} ${sinCertificado.requisito('op.nub.1.r1.1').evidenced}`
  );
  comprueba(
    'el expediente sigue acreditando op.nub.1.2, y la ingesta se dice sin recogida',
    sinCertificado.requisito('op.nub.1.2').attested === true && sinCertificado.tabla.find(e => e.id === 'EV-01')?.gapCause === 'COLLECTION' && sinCertificado.tabla.find(e => e.id === 'EV-09')?.status === 'CUMPLE',
    `${sinCertificado.requisito('op.nub.1.2').status} ${sinCertificado.tabla.find(e => e.id === 'EV-01')?.status}`
  );
  const intruso = parado(BASE, l => (l.event === 'cloud_admin_operation_observed' && l.modulo === 'azure-logs' && enLaUltima(l) ? [l, { ...l, actor: 'contratista@externo.example' }] : l));
  comprueba(
    'un NO_CUMPLE técnico (actor no autorizado) NO sobrevive: con los datos viejos, no demostrado',
    intruso.decisiones.find(d => d.requirementId === 'op.nub.1.2')?.documental !== true && intruso.requisito('op.nub.1.2').status === 'NO_CUMPLE' && intruso.requisito('op.nub.1.2').evidenced === false,
    `${intruso.requisito('op.nub.1.2').status} ${intruso.requisito('op.nub.1.2').evidenced}`
  );
  comprueba(
    'las decisiones documentales de op.nub.1 llevan la marca: R1, EV-08 y EV-09',
    ['op.nub.1.r1.1', 'op.nub.1.r1.1/EV-08', 'op.nub.1.2/EV-09'].every(id => evalua(hoy()).decisions.find(d => d.trace.ruleId === id)?.documental === true) &&
      evalua(hoy()).decisions.filter(d => ['op.nub.1.2/EV-01', 'op.nub.1.2/EV-04', 'op.nub.1.2/EV-07'].includes(d.trace.ruleId)).every(d => !d.documental)
  );
  comprueba(
    'y la etiqueta de un NO_CUMPLE documental es «Declarado (documental)»',
    ensRequirementProofLabel(sinCertificado.requisito('op.nub.1.r1.1')) === 'Declarado (documental)'
  );
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
