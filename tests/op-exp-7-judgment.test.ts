/**
 * op.exp.7 · el juicio de la gestión de incidentes.
 *
 *     npx tsx tests/op-exp-7-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. La policy de op.exp.7 mide lo que ninguna primitiva expresa:
 * cruzar las alertas con el registro de incidentes (EV-02), restar instantes y
 * comparar MEDIAS por severidad con P-05 (EV-03, el MTTD/MTTR de op.exp.7.r2.2),
 * escalado y comunicación (EV-04), sellos de los registros (EV-05), contención
 * (EV-06), las 72 horas del RGPD (EV-07), el CCN-CERT (EV-08), las listas de
 * amenazas (EV-10) y la mejora (EV-12). Cada caso mueve UN eje y lleva al lado
 * la REVERSIÓN que demuestra que no pasaría siempre: el MISMO evento del
 * recolector con otro parámetro, u otro `now`, cambia el veredicto.
 *
 * Los eventos se construyen como alertas de `alerts.json` del manager
 * (agent.id 000) y pasan por el normalizador real: los números llegan como
 * texto y `evidence_id` con comas se parte en uno por evidencia.
 */
import { opExp7PolicyDefinition } from '../public/ens/core/policy-runtime/policies/op-exp-7.policy';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { opExp7CatalogDefinition } from '../public/ens/catalog/op-exp-7';
import { opExp7Configuration } from '../public/ens/configuration/data/op-exp-7-parameters';
import { normalizeWazuhAlerts } from '../public/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { ENSEvidenceCatalog } from '../public/ens/core/evidence/catalog';
import { applyPolicyDecisionsToEvidences } from '../public/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../public/ens/core/evaluation/requirement/requirement-evaluator';
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

// --- fixtures --------------------------------------------------------------

const AHORA = new Date('2026-09-26T12:00:00Z');
const hace = (horas: number): string =>
  new Date(AHORA.getTime() - horas * 3600 * 1000).toISOString().replace('.000Z', 'Z');

let contador = 0;

// Una alerta del manager: agente 000, regla de la banda y `data` en texto.
const alerta = (data: Record<string, unknown>, ts = hace(1)) => {
  contador += 1;

  return {
    _id: `alerta-${contador}`,
    _source: {
      '@timestamp': ts,
      agent: { id: '000', name: 'Wazuh-4' },
      rule: { id: '110800', description: 'op.exp.7' },
      location: '/var/log/ensfacil/op_exp_7.json',
      data: Object.fromEntries(
        Object.entries({ ensfacil: 'op.exp.7', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

type Alerta = ReturnType<typeof alerta>;

const eventos = (...alertas: Alerta[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alertas);

const TODAS = 'EV-01,EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08,EV-09,EV-10,EV-11,EV-12';

const latido = (registro = 'presente', extra: Record<string, unknown> = {}) =>
  alerta({
    event: 'collector_run',
    resultado: 'completada',
    evidencias_cubiertas: registro === 'presente' || registro === 'vacio' ? TODAS : 'EV-01,EV-06,EV-09,EV-10,EV-11',
    evidencias_miradas: registro === 'presente' || registro === 'vacio' ? TODAS : 'EV-01,EV-06,EV-09,EV-11,EV-10',
    registro_incidentes: registro,
    alertas_leidas: 16000,
    nivel_observado_desde: 7,
    perfil: 'manager',
    ...extra,
  }, hace(0.5));

const observada = (sistema: string, nivel: number, regla: string, n: number, primera: string, ultima = primera) =>
  alerta({
    event: 'security_alert_observed',
    evidence_id: 'EV-01,EV-02,EV-03',
    sistema,
    agente_id: '024',
    nivel,
    regla,
    alertas: n,
    primera,
    ultima,
    descripcion: `regla ${regla}`,
  });

type Fila = {
  id: string;
  fase: string;
  fecha: string;
  severidad?: string;
  sistemas?: string;
  datos?: string;
  escalado?: string;
  notificado?: string;
  ccn?: string;
  mejora?: string;
};

// Una fila del registro: los hechos que el recolector emite por ella.
const fila = (f: Fila): Alerta[] => {
  const salida = [
    alerta({
      event: 'incident_registered',
      evidence_id: 'EV-02,EV-03,EV-04,EV-05,EV-06,EV-07,EV-08,EV-12',
      incidente_id: f.id,
      fase: f.fase,
      fecha: f.fecha,
      severidad: f.severidad || 'alta',
      sistemas: f.sistemas || 'wazuh-real',
      clasificacion: 'acceso no autorizado',
      datos_personales: f.datos || 'no',
      relevancia_juridica: 'no',
      referencia: '-',
    }),
  ];

  if (f.escalado || f.notificado) {
    salida.push(alerta({
      event: 'incident_notification_recorded',
      evidence_id: 'EV-04,EV-07',
      incidente_id: f.id,
      fase: f.fase,
      fecha: f.fecha,
      severidad: f.severidad || 'alta',
      sistemas: f.sistemas || 'wazuh-real',
      escalado_a: f.escalado || '-',
      notificado_a: f.notificado || '-',
    }));
  }

  if (f.ccn) {
    salida.push(alerta({
      event: 'ccn_cert_notification_recorded',
      evidence_id: 'EV-08',
      incidente_id: f.id,
      fase: f.fase,
      fecha: f.fecha,
      notificacion_ccn_cert: f.ccn,
    }));
  }

  if (f.mejora) {
    salida.push(alerta({
      event: 'improvement_action_recorded',
      evidence_id: 'EV-12',
      incidente_id: f.id,
      fase: f.fase,
      fecha: f.fecha,
      medidas_mejora: f.mejora,
    }));
  }

  return salida;
};

// Configuración a partir del catálogo real de parámetros: se rellena solo lo que
// cada caso declara.
const configuracion = (valores: Record<string, string[]>): ENSControlConfiguration => ({
  ...opExp7Configuration,
  parameters: opExp7Configuration.parameters.map(p => ({
    ...p,
    value: valores[p.id],
  })),
});

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Record<string, string[]>,
  nivel: ENSLevel = 'ALTO',
  ahora: Date = AHORA
) => {
  const cfg = configuracion(valores);
  const evidencias = resolveEvidenceForControl('op.exp.7', evs, '000', nivel, cfg, ahora);
  const contexto = buildPolicyContext(opExp7CatalogDefinition, cfg, nivel, evs, evidencias, ahora);
  const { decisions } = opExp7PolicyDefinition.evaluator!(contexto);
  const principal = (requisito: string) => decisions.find(d => d.requirementId === requisito)!;
  const deEvidencia = (id: string) =>
    decisions.find(d => d.trace.ruleId.endsWith(`/${id}`));
  const estado = (id: string) => deEvidencia(id)?.status;
  const motivo = (id: string) => deEvidencia(id)?.reason || '';

  return { evidencias, decisions, principal, deEvidencia, estado, motivo };
};

const P01 = ['intrusión | Crítica | 13 | si | compromiso confirmado', 'ataque | Alta | 12 | no |', 'aviso | Media | 7 | no |'];
const P02 = ['Crítica | RSI + CISO | 1 | teléfono', 'Alta | RSI | 4 | correo', 'Media | RSI | 24 | correo'];
const BASE = { 'P-01': P01, 'P-02': P02 };

// --- 1. catálogo -----------------------------------------------------------

bloque('1. Aplicabilidad y contrato');

{
  const nivelesDe = (id: string) =>
    opExp7CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  comprueba('la base rige en los tres', ['op.exp.7.1', 'op.exp.7.2'].every(id => nivelesDe(id) === 'BAJO,MEDIO,ALTO'));
  comprueba('R1 y R2 rigen en MEDIO y ALTO', ['op.exp.7.r1.1', 'op.exp.7.r2.1', 'op.exp.7.r2.2', 'op.exp.7.r2.3', 'op.exp.7.r2.4'].every(id => nivelesDe(id) === 'MEDIO,ALTO'));
  comprueba('R3 solo en ALTO', ['op.exp.7.r3.1', 'op.exp.7.r3.2'].every(id => nivelesDe(id) === 'ALTO'));
  comprueba('R4 no rige en ningún nivel', nivelesDe('op.exp.7.r4.1') === '');
  comprueba('el control está ACTIVE', opExp7CatalogDefinition.status === 'ACTIVE', opExp7CatalogDefinition.status);

  const nuestras = ENSEvidenceCatalog.filter(e => e.controlId === 'op.exp.7');
  comprueba('doce evidencias, todas con regla de la banda 110800-110899',
    nuestras.length === 12 && nuestras.every(e => e.relatedRules.length && e.relatedRules.every(r => /^1108\d\d$/.test(r))),
    nuestras.map(e => `${e.id}:${e.relatedRules.join('+')}`).join(' '));
  comprueba('ninguna declara `judgment`: todas las decide la policy', nuestras.every(e => !e.judgment));
  comprueba('las acciones NO son hechos de estado (security_alert_observed, active_response_executed)',
    nuestras.every(e => !(e.stateFactEventTypes || []).some(t => t === 'security_alert_observed' || t === 'active_response_executed')));

  const p03 = opExp7Configuration.parameters.find(p => p.id === 'P-03')!;
  comprueba('P-03 no admite credenciales: ninguna columna de acceso',
    p03.type === 'table' && (p03.columns || []).every(c => !/acceso|clave|password|token|usuario|api/i.test(`${c.name} ${c.label}`)),
    (p03.columns || []).map(c => c.name).join(','));
  comprueba('P-03, P-06, P-07, P-08 y P-11 son tablas con columnas',
    ['P-03', 'P-06', 'P-07', 'P-08', 'P-11'].every(id => {
      const p = opExp7Configuration.parameters.find(x => x.id === id)!;

      return p.type === 'table' && (p.columns || []).length >= 2;
    }));
  comprueba('P-ATT es opcional', opExp7Configuration.parameters.find(p => p.id === 'P-ATT')!.required === false);
}

// --- 2. sin recolector, sin registro ---------------------------------------

bloque('2. Sin pasada del recolector, o sin registro de incidentes');

{
  const sinLatido = evalua(eventos(observada('wazuh-real', 13, '23506', 10, hace(48))), BASE);
  comprueba('sin latido: EV-01 y EV-02 NO_EVALUABLE nombrando el recolector',
    sinLatido.estado('EV-01') === 'NO_EVALUABLE' && sinLatido.estado('EV-02') === 'NO_EVALUABLE' && /ens_opexp7_collect/.test(sinLatido.motivo('EV-02')),
    sinLatido.motivo('EV-02'));

  const ausente = eventos(
    latido('ausente'),
    alerta({ event: 'evidence_state', evidence_id: 'EV-02', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de incidentes /etc/ensfacil/incident-register.tsv' }, hace(0.5)),
    observada('wazuh-real', 13, '23506', 10, hace(48)),
  );
  const r = evalua(ausente, BASE);
  comprueba('registro ausente: EV-02 NO_EVALUABLE con el motivo del recolector',
    r.estado('EV-02') === 'NO_EVALUABLE' && /no existe el registro/.test(r.motivo('EV-02')), r.motivo('EV-02'));
  comprueba('y EV-01, que no depende del registro, CUMPLE', r.estado('EV-01') === 'CUMPLE', r.motivo('EV-01'));
  comprueba('EV-03 a EV-08 y EV-12 NO_EVALUABLE, nunca CUMPLE ni NO_CUMPLE',
    ['EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-12'].every(id => r.estado(id) === 'NO_EVALUABLE'));

  const viejo = evalua(ausente, BASE, 'ALTO', new Date(AHORA.getTime() + 30 * 3600000));
  comprueba('30 h después sin latido nuevo: EV-01 deja de afirmar → NO_EVALUABLE', viejo.estado('EV-01') === 'NO_EVALUABLE', viejo.motivo('EV-01'));
}

// --- 3. EV-02: la conciliación ---------------------------------------------

bloque('3. EV-02 · alertas Alta o Crítica sin incidente');

{
  const vd = eventos(latido('vacio'), observada('wazuh-real', 13, '23506', 424, hace(24 * 20), hace(24 * 20 - 0.1)));

  const r1 = evalua(vd, BASE);
  comprueba('424 alertas de nivel 13 sin ningún incidente → NO_CUMPLE', r1.estado('EV-02') === 'NO_CUMPLE', r1.motivo('EV-02'));
  comprueba('y el motivo nombra sistema, número y regla', /wazuh-real: 424 alerta\(s\) Crítica de la regla 23506/.test(r1.motivo('EV-02')), r1.motivo('EV-02'));

  const r2 = evalua(vd, { ...BASE, 'P-12': ['23506 | CVE crítica: se gestiona en op.exp.4'] });
  comprueba('REVERSIÓN: la MISMA alerta con 23506 en P-12 → CUMPLE', r2.estado('EV-02') === 'CUMPLE', r2.motivo('EV-02'));
  comprueba('y la exclusión no es silenciosa: cuenta y motivo en el veredicto', /424 alerta\(s\) de la regla 23506 \(CVE crítica: se gestiona en op.exp.4\)/.test(r2.motivo('EV-02')), r2.motivo('EV-02'));

  const nivel10 = eventos(latido('vacio'), observada('wazuh-real', 10, '5404', 2, hace(48)));
  const r3 = evalua(nivel10, BASE);
  comprueba('nivel 10 con Alta desde 12 no es relevante → CUMPLE', r3.estado('EV-02') === 'CUMPLE', r3.motivo('EV-02'));
  const r3b = evalua(nivel10, { ...BASE, 'P-01': ['ataque | Alta | 10 | no |'] });
  comprueba('REVERSIÓN: el MISMO evento con Alta desde 10 → NO_CUMPLE', r3b.estado('EV-02') === 'NO_CUMPLE', r3b.motivo('EV-02'));

  const reciente = eventos(latido('vacio'), observada('wazuh-real', 12, '5712', 1, hace(2)));
  const r4 = evalua(reciente, BASE);
  comprueba('alerta Alta de hace 2 h con plazo de escalado 4 h: aún no es huérfana → CUMPLE y lo dice', r4.estado('EV-02') === 'CUMPLE' && /dentro de su plazo de escalado/.test(r4.motivo('EV-02')), r4.motivo('EV-02'));
  const r4b = evalua(reciente, BASE, 'ALTO', new Date(AHORA.getTime() + 3 * 3600000));
  comprueba('REVERSIÓN: 3 h después, con el latido todavía fresco → NO_CUMPLE', r4b.estado('EV-02') === 'NO_CUMPLE', r4b.motivo('EV-02'));

  const conIncidente = eventos(
    latido(),
    observada('wazuh-real', 12, '5712', 3, hace(10)),
    ...fila({ id: 'INC-1', fase: 'inicial', fecha: hace(8) }),
  );
  const r5 = evalua(conIncidente, BASE);
  comprueba('incidente del sistema abierto 2 h después (plazo 4) → CUMPLE nombrando el incidente', r5.estado('EV-02') === 'CUMPLE' && /INC-1/.test(r5.motivo('EV-02')), r5.motivo('EV-02'));

  const tarde = eventos(
    latido(),
    observada('wazuh-real', 12, '5712', 3, hace(10)),
    ...fila({ id: 'INC-1', fase: 'inicial', fecha: hace(5) }),
  );
  const r6 = evalua(tarde, BASE);
  comprueba('REVERSIÓN: registrado 5 h después (plazo 4) → NO_CUMPLE', r6.estado('EV-02') === 'NO_CUMPLE', r6.motivo('EV-02'));

  const otroSistema = eventos(
    latido(),
    observada('wazuh-real', 12, '5712', 3, hace(10)),
    ...fila({ id: 'INC-1', fase: 'inicial', fecha: hace(8), sistemas: 'zimbraHldap' }),
  );
  comprueba('un incidente de OTRO sistema no concilia la alerta → NO_CUMPLE', evalua(otroSistema, BASE).estado('EV-02') === 'NO_CUMPLE');

  const sinCobertura = eventos(latido('vacio', { evidencias_cubiertas: 'EV-01' }));
  comprueba('sin alertas pero sin cobertura declarada del registro → NO_EVALUABLE, el silencio no acredita',
    evalua(sinCobertura, BASE).estado('EV-02') === 'NO_EVALUABLE', evalua(sinCobertura, BASE).motivo('EV-02'));
  comprueba('sin P-02 → NO_EVALUABLE', evalua(vd, { 'P-01': P01 }).estado('EV-02') === 'NO_EVALUABLE');
}

// --- 4. EV-03: MTTD/MTTR ----------------------------------------------------

bloque('4. EV-03 · MTTD y MTTR contra P-05 (op.exp.7.r2.2)');

{
  const incidente = eventos(
    latido(),
    observada('wazuh-real', 12, '5712', 1, hace(72)),
    ...fila({ id: 'INC-7', fase: 'inicial', fecha: hace(70) }),
    ...fila({ id: 'INC-7', fase: 'intermedio', fecha: hace(68) }),
    ...fila({ id: 'INC-7', fase: 'final', fecha: hace(40) }),
  );

  const r1 = evalua(incidente, { ...BASE, 'P-05': ['Alta | 4 | 24'] });
  comprueba('resolución en 30 h con plazo 24 → NO_CUMPLE', r1.estado('EV-03') === 'NO_CUMPLE', r1.motivo('EV-03'));
  comprueba('el motivo da la media y el MTTD', /resolución media de Alta 30\.0 h > 24 h/.test(r1.motivo('EV-03')) && /MTTD 2\.0 h/.test(r1.motivo('EV-03')), r1.motivo('EV-03'));

  const r2 = evalua(incidente, { ...BASE, 'P-05': ['Alta | 4 | 48'] });
  comprueba('REVERSIÓN: el MISMO incidente con plazo 48 → CUMPLE', r2.estado('EV-03') === 'CUMPLE', r2.motivo('EV-03'));

  const r3 = evalua(incidente, { ...BASE, 'P-05': ['Alta | 1 | 48'] });
  comprueba('contención en 2 h con plazo 1 → NO_CUMPLE', r3.estado('EV-03') === 'NO_CUMPLE', r3.motivo('EV-03'));

  const abierto = eventos(latido(), ...fila({ id: 'INC-8', fase: 'inicial', fecha: hace(60) }));
  const r4 = evalua(abierto, { ...BASE, 'P-05': ['Alta | 4 | 48'] });
  comprueba('abierto 60 h sin contener ni resolver, plazos 4/48 → NO_CUMPLE: lo abierto cuenta con lo que lleva', r4.estado('EV-03') === 'NO_CUMPLE', r4.motivo('EV-03'));
  const r4b = evalua(abierto, { ...BASE, 'P-05': ['Alta | 72 | 96'] });
  comprueba('REVERSIÓN: dentro de sus plazos todavía → NO_EVALUABLE (nada medido aún)', r4b.estado('EV-03') === 'NO_EVALUABLE', r4b.motivo('EV-03'));

  comprueba('sin incidentes → NO_EVALUABLE, no CUMPLE', evalua(eventos(latido('vacio')), { ...BASE, 'P-05': ['Alta | 4 | 48'] }).estado('EV-03') === 'NO_EVALUABLE');
  comprueba('sin P-05 → NO_EVALUABLE', evalua(incidente, BASE).estado('EV-03') === 'NO_EVALUABLE');

  // Severidad de un incidente con varias filas: la MÁS ALTA de sus fases, como
  // en op.exp.9. Llegó a crítico y se rebajó a baja al cerrarlo: se juzga con
  // el plazo de los críticos, no con el de los bajos.
  const rebajado = eventos(
    latido(),
    observada('wazuh-real', 12, '5712', 1, hace(72)),
    ...fila({ id: 'INC-8', fase: 'inicial', fecha: hace(70), severidad: 'alta' }),
    ...fila({ id: 'INC-8', fase: 'intermedio', fecha: hace(68), severidad: 'Crítica' }),
    ...fila({ id: 'INC-8', fase: 'final', fecha: hace(40), severidad: 'baja' }),
  );
  const r5 = evalua(rebajado, { ...BASE, 'P-05': ['Crítica | 4 | 24', 'Baja | 4 | 48'] });
  comprueba('crítico en una fase y rebajado a baja al cerrar: cuenta la más alta → resolución 30 h > 24 h de Crítica, NO_CUMPLE',
    r5.estado('EV-03') === 'NO_CUMPLE' && /Crítica 30\.0 h > 24 h/.test(r5.motivo('EV-03')), r5.motivo('EV-03'));
}

// --- 5. EV-04 ---------------------------------------------------------------

bloque('5. EV-04 · escalado (P-02) y responsables (P-04)');

{
  const critico = (escalado: string, notificado = '-') => eventos(
    latido(),
    ...fila({ id: 'INC-9', fase: 'inicial', fecha: hace(30), severidad: 'critica', escalado }),
    ...fila({ id: 'INC-9', fase: 'intermedio', fecha: hace(29.5), severidad: 'critica', notificado }),
  );

  const r1 = evalua(critico('RSI'), BASE, 'BAJO');
  comprueba('crítico escalado solo a RSI cuando P-02 exige RSI + CISO → NO_CUMPLE', r1.estado('EV-04') === 'NO_CUMPLE' && /CISO/.test(r1.motivo('EV-04')), r1.motivo('EV-04'));
  const r2 = evalua(critico('RSI + CISO'), BASE, 'BAJO');
  comprueba('REVERSIÓN: escalado a RSI + CISO → CUMPLE en BAJO', r2.estado('EV-04') === 'CUMPLE', r2.motivo('EV-04'));

  const r3 = evalua(critico('RSI + CISO'), BASE, 'MEDIO');
  comprueba('en MEDIO sin P-04 → NO_EVALUABLE (r2.3 sin decidir)', r3.estado('EV-04') === 'NO_EVALUABLE', r3.motivo('EV-04'));
  const r4 = evalua(critico('RSI + CISO'), { ...BASE, 'P-04': ['wazuh-real | J. Ruiz | M. Sanz'] }, 'MEDIO');
  comprueba('con P-04 y sin comunicación a los responsables → NO_CUMPLE', r4.estado('EV-04') === 'NO_CUMPLE' && /J\. Ruiz|j\. ruiz/i.test(r4.motivo('EV-04')), r4.motivo('EV-04'));
  const r5 = evalua(critico('RSI + CISO', 'J. Ruiz, M. Sanz'), { ...BASE, 'P-04': ['wazuh-real | J. Ruiz | M. Sanz'] }, 'MEDIO');
  comprueba('REVERSIÓN: notificados J. Ruiz y M. Sanz → CUMPLE', r5.estado('EV-04') === 'CUMPLE', r5.motivo('EV-04'));
}

// --- 6. EV-05 ---------------------------------------------------------------

bloque('6. EV-05 · el registro de alertas de cada día del incidente');

{
  const sello = (calculado: string, conservado = 'si') => alerta({
    event: 'alert_log_seal_checked',
    evidence_id: 'EV-05',
    dia: '2026-09-24',
    fichero: 'logs/alerts/2026/Sep/ossec-alerts-24.json.gz',
    conservado,
    sellado: conservado,
    sello_sha256: 'aaaa1111',
    calculado_sha256: calculado,
    cadena_sha256: 'bbbb',
    anterior_sha256: 'bbbb',
    incidentes: 'INC-5',
  });
  const base = (s: Alerta) => eventos(latido(), s, ...fila({ id: 'INC-5', fase: 'inicial', fecha: hace(40) }));
  const P08 = { ...BASE, 'P-08': ['registros de alertas del SIEM | manager', 'volcado de memoria | repositorio forense'] };

  const r1 = evalua(base(sello('aaaa1111')), P08);
  comprueba('sello y contenido coinciden → CUMPLE', r1.estado('EV-05') === 'CUMPLE', r1.motivo('EV-05'));
  comprueba('y dice qué de P-08 NO se verifica', /volcado de memoria/.test(r1.motivo('EV-05')), r1.motivo('EV-05'));
  const r2 = evalua(base(sello('cccc2222')), P08);
  comprueba('REVERSIÓN: contenido distinto del sellado → NO_CUMPLE (alterado)', r2.estado('EV-05') === 'NO_CUMPLE' && /alterado/.test(r2.motivo('EV-05')), r2.motivo('EV-05'));
  const r3 = evalua(base(sello('-', 'no')), P08);
  comprueba('el día no se conserva → NO_CUMPLE', r3.estado('EV-05') === 'NO_CUMPLE', r3.motivo('EV-05'));
  comprueba('sin P-08 → NO_EVALUABLE', evalua(base(sello('aaaa1111')), BASE).estado('EV-05') === 'NO_EVALUABLE');
}

// --- 7. EV-06 ---------------------------------------------------------------

bloque('7. EV-06 · contención de los incidentes graves');

{
  const ar = alerta({
    event: 'active_response_executed',
    evidence_id: 'EV-06,EV-09,EV-11',
    sistema: 'wazuh-real',
    comando: 'firewall-drop',
    accion: 'add',
    regla: '651',
    regla_disparadora: '5763',
    instante: hace(49),
  });
  const cerrado = [
    ...fila({ id: 'INC-3', fase: 'inicial', fecha: hace(48) }),
    ...fila({ id: 'INC-3', fase: 'final', fecha: hace(20) }),
  ];

  const r1 = evalua(eventos(latido(), ...cerrado), BASE);
  comprueba('alto cerrado sin respuesta activa ni fase intermedio → NO_CUMPLE', r1.estado('EV-06') === 'NO_CUMPLE', r1.motivo('EV-06'));
  const r2 = evalua(eventos(latido(), ar, ...cerrado), { ...BASE, 'P-09': ['firewall-drop | fuerza bruta | origen | 180 s'] });
  comprueba('REVERSIÓN: firewall-drop de P-09 en su sistema, 1 h antes (plazo de escalado 4) → CUMPLE', r2.estado('EV-06') === 'CUMPLE', r2.motivo('EV-06'));
  const r3 = evalua(eventos(latido(), ar, ...cerrado), BASE);
  comprueba('la MISMA respuesta activa sin declararla en P-09 no cuenta → NO_CUMPLE y lo dice', r3.estado('EV-06') === 'NO_CUMPLE' && /no declara/.test(r3.motivo('EV-06')), r3.motivo('EV-06'));
}

// --- 8. EV-07 ---------------------------------------------------------------

bloque('8. EV-07 · RGPD: valoración y AEPD en 72 horas');

{
  const P07 = { ...BASE, 'P-07': ['zimbraHldap | directorio de usuarios'] };
  const conDatos = (apertura: number, notificado?: string) => eventos(
    latido(),
    ...fila({ id: 'INC-4', fase: 'inicial', fecha: hace(apertura), sistemas: 'zimbraHldap', datos: 'si' }),
    ...(notificado ? fila({ id: 'INC-4', fase: 'intermedio', fecha: hace(apertura - 10), sistemas: 'zimbraHldap', datos: 'si', notificado }) : []),
  );

  const r1 = evalua(conDatos(100), P07);
  comprueba('afecta a datos personales, 100 h, sin AEPD → NO_CUMPLE', r1.estado('EV-07') === 'NO_CUMPLE', r1.motivo('EV-07'));
  const r2 = evalua(conDatos(100, 'AEPD'), P07);
  comprueba('REVERSIÓN: notificado a la AEPD a las 10 h → CUMPLE', r2.estado('EV-07') === 'CUMPLE', r2.motivo('EV-07'));
  const r3 = evalua(conDatos(20), P07);
  comprueba('a las 20 h sin AEPD todavía: pendiente → NO_EVALUABLE, no NO_CUMPLE', r3.estado('EV-07') === 'NO_EVALUABLE', r3.motivo('EV-07'));

  const sinValorar = eventos(latido(), ...fila({ id: 'INC-6', fase: 'inicial', fecha: hace(100), sistemas: 'zimbraHldap', datos: '-' }));
  comprueba('incidente en un sistema de P-07 sin valoración → NO_CUMPLE', evalua(sinValorar, P07).estado('EV-07') === 'NO_CUMPLE');
  comprueba('REVERSIÓN: el MISMO incidente con P-07 sobre otro sistema → NO_EVALUABLE (no le afecta)',
    evalua(sinValorar, { ...BASE, 'P-07': ['wazuh-real | nóminas'] }).estado('EV-07') === 'NO_EVALUABLE');
}

// --- 9. EV-08 ---------------------------------------------------------------

bloque('9. EV-08 · notificación al CCN-CERT');

{
  const P06 = { ...BASE, 'P-06': ['LUCIA | Subdirección General'] };
  const critico = (ccn?: string) => eventos(latido(), ...fila({ id: 'INC-2', fase: 'inicial', fecha: hace(10), severidad: 'critica', ccn }));

  comprueba('crítico (notificable en P-01) sin notificar tras 10 h (plazo 1) → NO_CUMPLE', evalua(critico(), P06).estado('EV-08') === 'NO_CUMPLE');
  comprueba('REVERSIÓN: notificado a los 30 min → CUMPLE', evalua(critico(hace(9.5)), P06).estado('EV-08') === 'CUMPLE', evalua(critico(hace(9.5)), P06).motivo('EV-08'));
  comprueba('sin P-06 → NO_EVALUABLE', evalua(critico(), BASE).estado('EV-08') === 'NO_EVALUABLE');
  const alto = eventos(latido(), ...fila({ id: 'INC-2', fase: 'inicial', fecha: hace(10), severidad: 'alta' }));
  comprueba('Alta no es notificable en P-01 → NO_EVALUABLE (nada que notificar)', evalua(alto, P06).estado('EV-08') === 'NO_EVALUABLE');
}

// --- 10. EV-10 --------------------------------------------------------------

bloque('10. EV-10 · listas CDB de los avisos del CCN-CERT');

{
  const lista = (modificada: string, reglas = 16) => eventos(
    latido(),
    alerta({ event: 'threat_list_observed', evidence_id: 'EV-10', lista: 'etc/lists/malicious-ioc/malicious-ip', existe: 'si', modificada, entradas: 199, compilada: 'si', reglas_que_la_usan: reglas }),
  );
  const P11 = (dias: number) => ({ 'P-11': [`boletines CCN-CERT | RSI | etc/lists/malicious-ioc/malicious-ip | ${dias}`] });

  comprueba('lista usada y actualizada hace 3 días con plazo 7 → CUMPLE', evalua(lista(hace(72)), P11(7)).estado('EV-10') === 'CUMPLE');
  comprueba('REVERSIÓN: la MISMA lista con plazo 2 → NO_CUMPLE', evalua(lista(hace(72)), P11(2)).estado('EV-10') === 'NO_CUMPLE');
  comprueba('ninguna regla la usa → NO_CUMPLE', evalua(lista(hace(72), 0), P11(7)).estado('EV-10') === 'NO_CUMPLE');
  comprueba('lista de P-11 que el ossec.conf no carga → NO_CUMPLE',
    evalua(lista(hace(72)), { 'P-11': ['boletines | RSI | etc/lists/ccn-cert-ioc | 7'] }).estado('EV-10') === 'NO_CUMPLE');
}

// --- 11. EV-12 y EV-09 ------------------------------------------------------

bloque('11. EV-12 · mejora tras el cierre; EV-09 · sin elemento observable');

{
  const cerrado = (mejora?: string) => eventos(
    latido(),
    ...fila({ id: 'INC-1', fase: 'inicial', fecha: hace(50) }),
    ...fila({ id: 'INC-1', fase: 'final', fecha: hace(20), mejora }),
  );

  comprueba('cerrado sin medidas de mejora → NO_CUMPLE', evalua(cerrado(), BASE).estado('EV-12') === 'NO_CUMPLE');
  comprueba('REVERSIÓN: con medidas → CUMPLE', evalua(cerrado('revisión de sudoers'), BASE).estado('EV-12') === 'CUMPLE');

  const r = evalua(eventos(latido('vacio'), observada('wazuh-real', 7, '550', 1, hace(3))), { 'P-10': ['fw-perimetral | reglas | RSI'], 'P-09': ['firewall-drop | x | y | z'] });
  comprueba('P-10 con un elemento sin agente → NO_EVALUABLE diciendo que no se puede observar', r.estado('EV-09') === 'NO_EVALUABLE' && /no se pueden observar/.test(r.motivo('EV-09')), r.motivo('EV-09'));
}

// --- 12. del veredicto al requisito ----------------------------------------

bloque('12. La decisión llega al requisito y a la tabla de evidencias');

{
  const evs = eventos(latido('vacio'), observada('wazuh-real', 13, '23506', 424, hace(24 * 20)));
  const r = evalua(evs, BASE, 'BAJO');
  const decision = r.principal('op.exp.7.1');
  comprueba('la PRIMERA decisión de op.exp.7.1 es la del requisito, y es NO_CUMPLE', decision.status === 'NO_CUMPLE' && decision.trace.ruleId === 'op.exp.7.1', `${decision.trace.ruleId} ${decision.status}`);

  const requisito = evaluateRequirement(
    opExp7CatalogDefinition.requirements.find(q => q.id === 'op.exp.7.1')!,
    'BAJO',
    r.evidencias,
    false,
    r.decisions,
    'ACTIVE'
  );
  comprueba('evaluateRequirement publica op.exp.7.1 NO_CUMPLE medido', requisito.status === 'NO_CUMPLE' && requisito.evidenced === true, `${requisito.status} ${requisito.evidenced}`);

  const tabla = applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp7CatalogDefinition.requirements);
  const color = (id: string) => tabla.find(e => e.id === id)?.status;
  comprueba('EV-02 sale NO_CUMPLE en la tabla', color('EV-02') === 'NO_CUMPLE', color('EV-02'));
  comprueba('y EV-01, que sí está medida, sale CUMPLE: no hereda el rojo de EV-02', color('EV-01') === 'CUMPLE', color('EV-01'));
}

bloque('14. Respuesta automática: solo acredita la que disparó una alerta');

{
  // Salida real del recolector del manager (wazuh4, 26/09): un reinicio del
  // agente de WIN-OPACC-LAB pedido sin ninguna alerta que lo dispare.
  const reinicio = (disparadora: string) =>
    alerta({
      event: 'active_response_executed',
      evidence_id: 'EV-06,EV-09,EV-11',
      sistema: 'WIN-OPACC-LAB',
      agente_id: '029',
      comando: 'restart-wazuh',
      programa: 'restart-wazuh.exe',
      accion: 'add',
      regla: '657',
      regla_disparadora: disparadora,
      origen: '-',
      instante: '2026-09-24T07:09:48Z',
    });
  const configurada = alerta({
    event: 'active_response_configured',
    evidence_id: 'EV-11',
    comando: 'firewall-drop',
    reglas: '5763',
    deshabilitada: 'no',
  }, hace(0.5));

  const sinOrigen = evalua(eventos(latido('vacio'), configurada, reinicio('-')), BASE);
  comprueba('el restart-wazuh.exe sin alerta de origen NO acredita EV-11 (no CUMPLE)',
    sinOrigen.estado('EV-11') !== 'CUMPLE', `${sinOrigen.estado('EV-11')} ${sinOrigen.motivo('EV-11')}`);
  comprueba('y el motivo lo nombra como ejecución sin alerta que la dispare',
    /sin alerta que las dispare/.test(sinOrigen.motivo('EV-11')) && /restart-wazuh\.exe/.test(sinOrigen.motivo('EV-11')), sinOrigen.motivo('EV-11'));
  comprueba('queda sin medir con causa EVIDENCE (llegó el dato, no demuestra nada)',
    sinOrigen.estado('EV-11') === 'NO_EVALUABLE' && sinOrigen.deEvidencia('EV-11')?.cause === 'EVIDENCE', `${sinOrigen.estado('EV-11')} ${sinOrigen.deEvidencia('EV-11')?.cause}`);

  const conOrigen = evalua(eventos(latido('vacio'), configurada, reinicio('5763')), BASE);
  comprueba('REVERSIÓN: la MISMA ejecución disparada por la regla 5763 → CUMPLE',
    conOrigen.estado('EV-11') === 'CUMPLE', conOrigen.motivo('EV-11'));

  // EV-06: la contención tampoco se acredita con una ejecución sin origen.
  const cerrado = [
    ...fila({ id: 'INC-4', fase: 'inicial', fecha: hace(48), sistemas: 'WIN-OPACC-LAB' }),
    ...fila({ id: 'INC-4', fase: 'final', fecha: hace(20), sistemas: 'WIN-OPACC-LAB' }),
  ];
  const ar = (disparadora: string) =>
    alerta({
      event: 'active_response_executed',
      evidence_id: 'EV-06,EV-09,EV-11',
      sistema: 'WIN-OPACC-LAB',
      comando: 'restart-wazuh',
      accion: 'add',
      regla: '657',
      regla_disparadora: disparadora,
      instante: hace(47),
    });
  const p09 = { ...BASE, 'P-09': ['restart-wazuh | x | y | z'] };
  const contenidoSinOrigen = evalua(eventos(latido(), ar('-'), ...cerrado), p09);
  comprueba('EV-06: una respuesta de P-09 sin alerta de origen no contiene el incidente → NO_CUMPLE',
    contenidoSinOrigen.estado('EV-06') === 'NO_CUMPLE', contenidoSinOrigen.motivo('EV-06'));
  const contenidoConOrigen = evalua(eventos(latido(), ar('5763'), ...cerrado), p09);
  comprueba('REVERSIÓN: la misma respuesta disparada por una alerta → CUMPLE',
    contenidoConOrigen.estado('EV-06') === 'CUMPLE', contenidoConOrigen.motivo('EV-06'));
}

bloque('15. La causa del hueco llega a la evidencia');

{
  // Sin P-01, EV-02 no puede clasificar las alertas: falta una decisión del
  // responsable (CONFIGURATION), no un dato del recolector.
  const sinP01 = evalua(eventos(latido('vacio'), observada('wazuh-real', 13, '23506', 10, hace(48))), { 'P-02': P02 });
  const tabla = applyPolicyDecisionsToEvidences(sinP01.evidencias, sinP01.decisions, opExp7CatalogDefinition.requirements);
  const ev02 = tabla.find(e => e.id === 'EV-02');
  comprueba('sin P-01 → EV-02 NO_EVALUABLE con causa CONFIGURATION en la tabla',
    ev02?.status === 'NO_EVALUABLE' && ev02?.gapCause === 'CONFIGURATION', `${ev02?.status} ${ev02?.gapCause}`);

  // El registro de incidentes ausente: el recolector declara CONFIGURATION.
  const ausente = evalua(eventos(
    latido('ausente'),
    alerta({ event: 'evidence_state', evidence_id: 'EV-04', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe el registro de incidentes /etc/ensfacil/incident-register.tsv' }, hace(0.5)),
  ), BASE);
  const tablaAusente = applyPolicyDecisionsToEvidences(ausente.evidencias, ausente.decisions, opExp7CatalogDefinition.requirements);
  const ev04 = tablaAusente.find(e => e.id === 'EV-04');
  comprueba('registro ausente (CONFIGURATION del recolector) → EV-04 con causa CONFIGURATION',
    ev04?.status === 'NO_EVALUABLE' && ev04?.gapCause === 'CONFIGURATION', `${ev04?.status} ${ev04?.gapCause}`);
  const ev03 = tablaAusente.find(e => e.id === 'EV-03');
  comprueba('y EV-03, que el recolector no degrada, también CONFIGURATION: el latido dice registro ausente',
    ev03?.status === 'NO_EVALUABLE' && ev03?.gapCause === 'CONFIGURATION', `${ev03?.status} ${ev03?.gapCause}`);

  const sinLatido = evalua(eventos(observada('wazuh-real', 13, '23506', 10, hace(48))), BASE);
  comprueba('sin pasada del recolector → la decisión de EV-02 lleva causa COLLECTION',
    sinLatido.deEvidencia('EV-02')?.cause === 'COLLECTION', sinLatido.deEvidencia('EV-02')?.cause);
}

bloque('13. Solo cuentan los hechos de op.exp.7');

{
  const ajeno = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': hace(1),
      agent: { id: '000', name: 'Wazuh-4' },
      rule: { id: '110900' },
      data: { ensfacil: 'op.exp.9', event: 'security_alert_observed', sistema: 'wazuh-real', nivel: '13', regla: '1', alertas: '5', primera: hace(48), ultima: hace(48) },
    },
  }]);
  const r = evalua([...eventos(latido('vacio')), ...ajeno], BASE);
  comprueba('una alerta con la etiqueta de otro control no cuenta → EV-02 CUMPLE', r.estado('EV-02') === 'CUMPLE', r.motivo('EV-02'));
}

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) FALLAN`);
  process.exit(1);
}

console.log('todas las comprobaciones pasan');
