/**
 * op.exp.5 · el juicio de la gestión de cambios.
 *
 *     npx tsx tests/op-exp-5-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. La policy de op.exp.5 cruza los cambios REALES de la máquina
 * (auditd, apt/dpkg, puertos, hardware) con el registro de peticiones que la
 * organización mantiene en la máquina, y juzga lo que ninguna primitiva expresa:
 * la ventana que cubre un cambio, la aprobación del RSI anterior a la
 * implantación, la documentación posterior al cambio, el servicio que cae tras
 * él y el punto de reversión anterior. Cada caso mueve UN eje y lleva al lado la
 * REVERSIÓN que demuestra que no pasaría siempre.
 *
 * Y el bloque 1 fija lo que el Anexo II dice de este control: en BÁSICA no
 * aplica NADA, ni la base. En BAJO el control sale NO_APLICA, sin puntuación y
 * fuera del denominador, y no en rojo.
 *
 * Los eventos se construyen como alertas de `alerts.json` y pasan por el
 * normalizador real y por el corte de hechos de estado, igual que en producción.
 */
import { opExp5PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-5.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp5CatalogDefinition } from '../common/ens/catalog/op-exp-5';
import { opExp5Configuration } from '../common/ens/configuration/data/op-exp-5-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import {
  evaluateRequirement,
  evaluateRequirements,
} from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (nombre: string, condicion: boolean, detalle: unknown = ''): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FAIL ${nombre}${detalle !== '' ? ` — ${String(detalle)}` : ''}`);
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
      agent: { id: '024', name: 'wazuh-real' },
      rule: { id: '110600', description: 'op.exp.5' },
      location: '/var/log/ensfacil/op_exp_5.json',
      data: Object.fromEntries(
        Object.entries({ ensfacil: 'op.exp.5', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

type Alerta = ReturnType<typeof alerta>;

const configuracion = (valores: Record<string, unknown>): ENSControlConfiguration => ({
  ...opExp5Configuration,
  parameters: opExp5Configuration.parameters.map(p => ({
    ...p,
    value: valores[p.id] as never,
  })),
});

const BASE: Record<string, unknown> = {
  'P-01': ['registro_tsv | /etc/ensfacil/change-register.tsv | RFC-'],
  'P-02': ['descripcion', 'riesgo', 'aprobado_por', 'ventana_inicio', 'ventana_fin'],
  'P-03': ['cambio en el cortafuegos o en la autenticación'],
  'P-04': ['Responsable de Seguridad | rsi'],
  'P-05': ['wazuh-real | pre-real | informe 2026-09'],
  'P-06': ['inventario | /srv/doc/inventario.ods | 7'],
  'P-07': ['buzon | rsi@organizacion.es'],
  'P-08': ['* | lvm | snapshot previo | 24'],
  'P-09': '24',
};

const con = (cambios: Record<string, unknown>): Record<string, unknown> => ({ ...BASE, ...cambios });

// Una petición del registro con valores por defecto sensatos.
const peticion = (campos: Record<string, string>) => ({
  peticion_id: 'RFC-1',
  fecha_registro: hace(48),
  sistema: 'wazuh-real',
  descripcion: 'actualización de seguridad',
  riesgo: 'bajo',
  aprobado_por: 'rsi',
  fecha_aprobacion: hace(24),
  ventana_inicio: hace(6),
  ventana_fin: hace(4),
  preproduccion: '-',
  estado: 'implantada',
  documentacion: '-',
  impacto_seguridad: 'bajo: parche de seguridad',
  referencia: 'https://tickets.invalido/RFC-1',
  ...campos,
});

// La lectura del registro: cabecera + filas con la misma firma.
const registro = (peticiones: Record<string, string>[], extra: Record<string, unknown> = {}, ts = hace(0.5)): Alerta[] => [
  alerta({
    event: 'change_register_read',
    evidence_id: 'EV-02,EV-03,EV-04,EV-06',
    registro: '/etc/ensfacil/change-register.tsv',
    filas: peticiones.length,
    filas_ilegibles: 0,
    firma: 'f1',
    leido: ts,
    sistema_local: 'wazuh-real',
    ...extra,
  }, ts),
  ...peticiones.map((p, i) =>
    alerta({
      event: 'change_request_registered',
      evidence_id: 'EV-02,EV-03,EV-04,EV-06',
      registro_firma: 'f1',
      linea: i + 2,
      ...p,
    }, ts)
  ),
];

const latido = (cubiertas = 'EV-01,EV-07', ts = hace(0.5)) =>
  alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: cubiertas }, ts);

const software = (inicio: string, fin = inicio, actor = 'unattended-upgrades') =>
  alerta({
    event: 'package_changed',
    evidence_id: 'EV-01,EV-02,EV-04,EV-07,EV-09',
    actor,
    mecanismo: 'unattended-upgrades',
    inicio,
    fin,
    paquetes: 'openssl 3.0.13-0ubuntu3.6',
  }, fin);

const configuracionEditada = (primera: string, proceso = '/usr/bin/vim.basic') =>
  alerta({
    event: 'config_file_modified',
    evidence_id: 'EV-01,EV-02,EV-04,EV-07,EV-09',
    actor: 'diqueran',
    sesion: 'con_sesion',
    recurso: '/etc/ssh/sshd_config',
    operacion: 'rename',
    proceso,
    primera,
    ultima: primera,
  }, primera);

const puerto = (desde: string, detectado: string) =>
  alerta({
    event: 'listening_port_changed',
    evidence_id: 'EV-01,EV-02,EV-04,EV-07',
    cambio: 'abierto',
    protocolo: 'tcp',
    direccion: '0.0.0.0',
    puerto: 8443,
    proceso: 'nginx',
    desde,
    detectado,
  }, detectado);

const caido = (unidad: string, desde: string, ts = hace(0.5)) =>
  alerta({ event: 'service_failed', evidence_id: 'EV-07', unidad, desde }, ts);

const documento = (ruta: string, modificado: string) =>
  alerta({ event: 'config_doc_modified', evidence_id: 'EV-06', ruta, modificado }, hace(0.5));

const snapshot = (creado: string) =>
  alerta({ event: 'reversion_point_created', evidence_id: 'EV-09', mecanismo: 'lvm', identificador: 'vg0/pre-cambio', creado }, hace(0.5));

const evalua = (alertas: Alerta[], valores: Record<string, unknown> = BASE, nivel: ENSLevel = 'ALTO') => {
  const cfg = configuracion(valores);
  const evs: ENSNormalizedEvent[] = keepLatestRunStateFacts('op.exp.5', normalizeWazuhAlerts(alertas), AHORA);
  const evidencias = resolveEvidenceForControl('op.exp.5', evs, '024', nivel, cfg, AHORA);
  const contexto = buildPolicyContext(opExp5CatalogDefinition, cfg, nivel, evs, evidencias, AHORA);
  const { decisions } = opExp5PolicyDefinition.evaluator!(contexto);
  const deEvidencia = (id: string) => decisions.find(d => d.trace.ruleId.endsWith(`/${id}`));
  const estado = (id: string) => deEvidencia(id)?.status;
  const motivo = (id: string) => deEvidencia(id)?.reason || '(sin decisión)';
  const tabla = applyPolicyDecisionsToEvidences(evidencias, decisions, opExp5CatalogDefinition.requirements);
  const requisito = (id: string) =>
    evaluateRequirement(
      opExp5CatalogDefinition.requirements.find(q => q.id === id)!,
      nivel,
      tabla,
      false,
      decisions,
      'ACTIVE'
    );
  // La evidencia tal como la pinta la tabla, con su causa.
  const evidencia = (id: string) => tabla.find(e => e.id === id);

  return { evidencias, decisions, estado, motivo, requisito, evidencia };
};

// --- 1. aplicabilidad -----------------------------------------------------

bloque('1. Aplicabilidad: n.a. en BÁSICA, base en MEDIA y ALTA, R1 solo en ALTA');

{
  const nivelesDe = (id: string) =>
    opExp5CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  comprueba('el control declara solo MEDIO y ALTO', opExp5CatalogDefinition.levels.join(',') === 'MEDIO,ALTO', opExp5CatalogDefinition.levels.join(','));
  comprueba('la base rige en MEDIO y ALTO', ['op.exp.5.1', 'op.exp.5.2', 'op.exp.5.3', 'op.exp.5.4', 'op.exp.5.5'].every(id => nivelesDe(id) === 'MEDIO,ALTO'));
  comprueba('R1 rige solo en ALTO', ['op.exp.5.r1.1', 'op.exp.5.r1.2', 'op.exp.5.r1.3'].every(id => nivelesDe(id) === 'ALTO'));
  comprueba(
    'la policy dice lo mismo que el catálogo para cada requisito',
    opExp5PolicyDefinition.requirements.every(r => r.levels.join(',') === nivelesDe(r.requirementId))
  );

  // Con eventos que en ALTO darían un NO_CUMPLE, para que la prueba no pase por
  // falta de datos.
  const alertas = [latido(), software(hace(5)), ...registro([])];
  const bajo = evalua(alertas, BASE, 'BAJO');

  comprueba('en BAJO la policy no decide ningún requisito', bajo.decisions.length === 0, bajo.decisions.length);

  const requisitos = evaluateRequirements(opExp5CatalogDefinition.requirements, 'BAJO', bajo.evidencias, false, bajo.decisions, 'ACTIVE');
  const control = evaluateControlStatus(requisitos);

  comprueba('en BAJO los ocho requisitos salen NO_APLICA', requisitos.every(r => r.status === 'NO_APLICA'), requisitos.map(r => r.status).join(','));
  comprueba('en BAJO el control sale NO_APLICA, no en rojo', control.status === 'NO_APLICA', control.status);
  comprueba('en BAJO sin puntuación: fuera del promedio', control.score === undefined, String(control.score));
  comprueba('en BAJO ningún requisito entra en el denominador', control.applicableRequirements === 0, String(control.applicableRequirements));

  const alto = evalua(alertas, BASE, 'ALTO');
  const reqAlto = evaluateRequirements(opExp5CatalogDefinition.requirements, 'ALTO', alto.evidencias, false, alto.decisions, 'ACTIVE');
  comprueba('REVERSIÓN: los MISMOS eventos en ALTO sí acusan (op.exp.5.1 NO_CUMPLE)', reqAlto.find(r => r.id === 'op.exp.5.1')?.status === 'NO_CUMPLE', reqAlto.find(r => r.id === 'op.exp.5.1')?.status);
  comprueba('y en ALTO el control entra en el denominador', evaluateControlStatus(reqAlto).applicableRequirements === 8, String(evaluateControlStatus(reqAlto).applicableRequirements));

  const medio = evalua(alertas, BASE, 'MEDIO');
  const reqMedio = evaluateRequirements(opExp5CatalogDefinition.requirements, 'MEDIO', medio.evidencias, false, medio.decisions, 'ACTIVE');
  comprueba('en MEDIO los tres de R1 salen NO_APLICA y la base aplica', reqMedio.filter(r => r.status === 'NO_APLICA').map(r => r.id).join(',') === 'op.exp.5.r1.1,op.exp.5.r1.2,op.exp.5.r1.3', reqMedio.map(r => `${r.id}:${r.status}`).join(' '));
}

// --- 2. EV-02: cambio real frente a petición ------------------------------

bloque('2. EV-02 · cada cambio real necesita una petición aprobada cuya ventana lo cubra');

{
  const cambio = software(hace(5), hace(4.9));
  const cubierto = evalua([latido(), cambio, ...registro([peticion({})])]);
  comprueba('cambio dentro de la ventana de RFC-1 aprobada → CUMPLE', cubierto.estado('EV-02') === 'CUMPLE', cubierto.motivo('EV-02'));
  comprueba('y el motivo nombra la petición y dice que la fuente es el registro TSV', /RFC-1/.test(cubierto.motivo('EV-02')) && /registro TSV/.test(cubierto.motivo('EV-02')), cubierto.motivo('EV-02'));
  comprueba('op.exp.5.1 sale CUMPLE medido', cubierto.requisito('op.exp.5.1').status === 'CUMPLE', cubierto.requisito('op.exp.5.1').status);

  const sinFila = evalua([latido(), cambio, ...registro([])]);
  comprueba('REVERSIÓN: el MISMO cambio con el registro vacío → NO_CUMPLE', sinFila.estado('EV-02') === 'NO_CUMPLE', sinFila.motivo('EV-02'));
  comprueba('y el motivo nombra el cambio', /software .* unattended-upgrades/.test(sinFila.motivo('EV-02')), sinFila.motivo('EV-02'));

  const noAprobada = evalua([latido(), cambio, ...registro([peticion({ estado: 'registrada' })])]);
  comprueba('una petición solo registrada no autoriza → NO_CUMPLE', noAprobada.estado('EV-02') === 'NO_CUMPLE', noAprobada.motivo('EV-02'));

  const aPosteriori = evalua([latido(), cambio, ...registro([peticion({ fecha_aprobacion: hace(2) })])]);
  comprueba('una petición aprobada DESPUÉS del cambio no lo cubre (ratificación a posteriori) → NO_CUMPLE', aPosteriori.estado('EV-02') === 'NO_CUMPLE', aPosteriori.motivo('EV-02'));

  const otraMaquina = evalua([latido(), cambio, ...registro([peticion({ sistema: 'zimbraHldap' })])]);
  comprueba('una petición de OTRA máquina no cubre → NO_CUMPLE', otraMaquina.estado('EV-02') === 'NO_CUMPLE', otraMaquina.motivo('EV-02'));

  const fuera = evalua([latido(), software(hace(3)), ...registro([peticion({})])]);
  comprueba('cambio una hora después del fin de la ventana → NO_CUMPLE', fuera.estado('EV-02') === 'NO_CUMPLE', fuera.motivo('EV-02'));

  const sinLatido = evalua([cambio, ...registro([peticion({})])]);
  comprueba('cambios cubiertos pero sin latido que confirme la detección → NO_EVALUABLE', sinLatido.estado('EV-02') === 'NO_EVALUABLE', sinLatido.motivo('EV-02'));

  const dpkg = evalua([latido(), cambio, configuracionEditada(hace(5), '/usr/bin/dpkg'), ...registro([peticion({})])]);
  comprueba('la escritura de configuración de dpkg cuenta dentro de su transacción, no aparte', dpkg.estado('EV-02') === 'CUMPLE', dpkg.motivo('EV-02'));

  const puertoSolapa = evalua([latido(), puerto(hace(4.5), hace(3.5)), ...registro([peticion({})])]);
  comprueba('un puerto detectado entre dos pasadas que solapan con la ventana → cubierto', puertoSolapa.estado('EV-02') === 'CUMPLE', puertoSolapa.motivo('EV-02'));
  const puertoFuera = evalua([latido(), puerto(hace(3), hace(2)), ...registro([peticion({})])]);
  comprueba('REVERSIÓN: el mismo puerto detectado después de la ventana → NO_CUMPLE', puertoFuera.estado('EV-02') === 'NO_CUMPLE', puertoFuera.motivo('EV-02'));

  const fechaSola = evalua([latido(), software(hace(5)), ...registro([peticion({ ventana_inicio: '2026-09-26', ventana_fin: '2026-09-26' })])]);
  comprueba('una ventana escrita solo con fecha incluye el día entero', fechaSola.estado('EV-02') === 'CUMPLE', fechaSola.motivo('EV-02'));
}

bloque('3. EV-02 · sin cambios, sin registro, u otro sistema de gestión en P-01');

{
  const tranquilo = evalua([latido(), ...registro([])]);
  comprueba('ningún cambio, detección confirmada y registro leído → CUMPLE', tranquilo.estado('EV-02') === 'CUMPLE', tranquilo.motivo('EV-02'));

  const sinLatido = evalua([...registro([])]);
  comprueba('REVERSIÓN: sin latido el silencio no acredita nada → NO_EVALUABLE', sinLatido.estado('EV-02') === 'NO_EVALUABLE', sinLatido.motivo('EV-02'));

  const sinRegistro = evalua([
    latido(),
    alerta({ event: 'evidence_state', evidence_id: 'EV-02', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe /etc/ensfacil/change-register.tsv' }),
  ]);
  comprueba('registro ausente → NO_EVALUABLE con el motivo del recolector', sinRegistro.estado('EV-02') === 'NO_EVALUABLE' && /change-register\.tsv/.test(sinRegistro.motivo('EV-02')), sinRegistro.motivo('EV-02'));

  const jira = evalua([latido(), ...registro([])], con({ 'P-01': ['jira | https://jira.invalido | CHG-'] }));
  comprueba('P-01 declara Jira sin integración → NO_EVALUABLE, no juzga el TSV', jira.estado('EV-02') === 'NO_EVALUABLE' && /integración/.test(jira.motivo('EV-02')), jira.motivo('EV-02'));

  const sinP01 = evalua([latido(), ...registro([])], con({ 'P-01': undefined }));
  comprueba('sin P-01 → NO_EVALUABLE', sinP01.estado('EV-02') === 'NO_EVALUABLE', sinP01.motivo('EV-02'));

  const incompleto = evalua([latido(), ...registro([peticion({})], { filas: 3 })]);
  comprueba('la cabecera declara 3 peticiones y llega 1 → NO_EVALUABLE', incompleto.estado('EV-02') === 'NO_EVALUABLE', incompleto.motivo('EV-02'));

  const viejo = evalua([latido(), ...registro([], {}, hace(30))]);
  comprueba('lectura del registro de hace 30 h → NO_EVALUABLE', viejo.estado('EV-02') === 'NO_EVALUABLE', viejo.motivo('EV-02'));
}

// --- 4. EV-03 --------------------------------------------------------------

bloque('4. EV-03 · información mínima de P-02, y en ALTO la valoración de impacto');

{
  const completa = [latido(), ...registro([peticion({})])];
  comprueba('petición con los campos de P-02 → CUMPLE', evalua(completa, BASE, 'MEDIO').estado('EV-03') === 'CUMPLE', evalua(completa, BASE, 'MEDIO').motivo('EV-03'));

  const sinDescripcion = [latido(), ...registro([peticion({ descripcion: '-' })])];
  comprueba('REVERSIÓN: sin descripción → NO_CUMPLE', evalua(sinDescripcion, BASE, 'MEDIO').estado('EV-03') === 'NO_CUMPLE', evalua(sinDescripcion, BASE, 'MEDIO').motivo('EV-03'));

  const sinImpacto = [latido(), ...registro([peticion({ impacto_seguridad: '-' })])];
  comprueba('sin impacto_seguridad en MEDIO → CUMPLE (P-02 no lo pide)', evalua(sinImpacto, BASE, 'MEDIO').estado('EV-03') === 'CUMPLE', evalua(sinImpacto, BASE, 'MEDIO').motivo('EV-03'));
  const alto = evalua(sinImpacto, BASE, 'ALTO');
  comprueba('el MISMO registro en ALTO → NO_CUMPLE por op.exp.5.r1.3', alto.estado('EV-03') === 'NO_CUMPLE' && /impacto_seguridad/.test(alto.motivo('EV-03')), alto.motivo('EV-03'));
  comprueba('y op.exp.5.r1.3 sale NO_CUMPLE', alto.requisito('op.exp.5.r1.3').status === 'NO_CUMPLE', alto.requisito('op.exp.5.r1.3').status);

  const numero = [latido(), ...registro([peticion({ peticion_id: 'CAMBIO-7' })])];
  comprueba('número fuera del prefijo «RFC-» de P-01 → NO_CUMPLE', evalua(numero, BASE, 'MEDIO').estado('EV-03') === 'NO_CUMPLE', evalua(numero, BASE, 'MEDIO').motivo('EV-03'));

  const ilegible = [latido(), ...registro([peticion({})], { filas_ilegibles: 1 })];
  comprueba('una fila que no tiene las 14 columnas → NO_CUMPLE', evalua(ilegible, BASE, 'MEDIO').estado('EV-03') === 'NO_CUMPLE', evalua(ilegible, BASE, 'MEDIO').motivo('EV-03'));

  const campoRaro = evalua(completa, con({ 'P-02': ['descripcion', 'solicitante'] }), 'MEDIO');
  comprueba('P-02 nombra una columna que el registro no tiene → NO_EVALUABLE', campoRaro.estado('EV-03') === 'NO_EVALUABLE', campoRaro.motivo('EV-03'));
}

// --- 5. EV-04 --------------------------------------------------------------

bloque('5. EV-04 · riesgo alto: aprobada por el RSI y ANTES de implantarse');

{
  const cambio = software(hace(5));
  const bien = evalua([latido(), cambio, ...registro([peticion({ riesgo: 'alto', fecha_aprobacion: hace(24) })])]);
  comprueba('aprobada por rsi un día antes → CUMPLE', bien.estado('EV-04') === 'CUMPLE', bien.motivo('EV-04'));

  const tarde = evalua([latido(), cambio, ...registro([peticion({ riesgo: 'alto', fecha_aprobacion: hace(4.5) })])]);
  comprueba('REVERSIÓN: aprobada después del cambio real → NO_CUMPLE', tarde.estado('EV-04') === 'NO_CUMPLE' && /DESPUÉS/.test(tarde.motivo('EV-04')), tarde.motivo('EV-04'));

  const otro = evalua([latido(), cambio, ...registro([peticion({ riesgo: 'alto', aprobado_por: 'jgomez' })])]);
  comprueba('aprobada por otra cuenta → NO_CUMPLE', otro.estado('EV-04') === 'NO_CUMPLE' && /jgomez/.test(otro.motivo('EV-04')), otro.motivo('EV-04'));

  const bajoRiesgo = evalua([latido(), cambio, ...registro([peticion({ aprobado_por: 'jgomez' })])]);
  comprueba('el mismo aprobador en un cambio de riesgo bajo no es hallazgo de EV-04', bajoRiesgo.estado('EV-04') === 'CUMPLE', bajoRiesgo.motivo('EV-04'));

  const sinP03 = evalua([latido(), cambio, ...registro([peticion({ riesgo: 'alto' })])], con({ 'P-03': undefined }));
  comprueba('sin criterios de riesgo alto (P-03) → NO_EVALUABLE', sinP03.estado('EV-04') === 'NO_EVALUABLE', sinP03.motivo('EV-04'));

  const sinPeticion = evalua([latido(), cambio, ...registro([])]);
  comprueba('un cambio sin petición deja EV-04 sin demostrar (su riesgo no se analizó)', sinPeticion.estado('EV-04') === 'NO_EVALUABLE', sinPeticion.motivo('EV-04'));
}

// --- 6. EV-06 --------------------------------------------------------------

bloque('6. EV-06 · la documentación de P-06 se modifica después del cambio y en plazo');

{
  const pide = peticion({ documentacion: 'inventario', ventana_inicio: hace(24 * 10), ventana_fin: hace(24 * 9) });
  const hecha = evalua([latido(), documento('/srv/doc/inventario.ods', hace(24 * 8)), ...registro([pide])]);
  comprueba('inventario modificado un día después del cambio, plazo 7 → CUMPLE', hecha.estado('EV-06') === 'CUMPLE', hecha.motivo('EV-06'));

  const antigua = evalua([latido(), documento('/srv/doc/inventario.ods', hace(24 * 20)), ...registro([pide])]);
  comprueba('REVERSIÓN: última modificación ANTERIOR al cambio y plazo vencido → NO_CUMPLE', antigua.estado('EV-06') === 'NO_CUMPLE', antigua.motivo('EV-06'));

  const reciente = peticion({ documentacion: 'inventario', ventana_inicio: hace(30), ventana_fin: hace(26) });
  const enPlazo = evalua([latido(), documento('/srv/doc/inventario.ods', hace(24 * 20)), ...registro([reciente])]);
  comprueba('sin modificar pero con el plazo abierto → no es hallazgo todavía', enPlazo.estado('EV-06') === 'CUMPLE' && /plazo/.test(enPlazo.motivo('EV-06')), enPlazo.motivo('EV-06'));

  const noVigilado = evalua([latido(), ...registro([pide])]);
  comprueba('documento que el recolector no vigila → NO_EVALUABLE', noVigilado.estado('EV-06') === 'NO_EVALUABLE', noVigilado.motivo('EV-06'));

  const sinP06 = evalua([latido(), ...registro([pide])], con({ 'P-06': undefined }));
  comprueba('sin P-06 → NO_EVALUABLE', sinP06.estado('EV-06') === 'NO_EVALUABLE', sinP06.motivo('EV-06'));
}

// --- 7. EV-07 --------------------------------------------------------------

bloque('7. EV-07 · un servicio que cae tras un cambio y sigue caído');

{
  const cambio = software(hace(5), hace(4.9));
  const adverso = evalua([latido(), cambio, caido('nginx.service', hace(3)), ...registro([peticion({})])]);
  comprueba('nginx cae 2 h después de un cambio y sigue caído → NO_CUMPLE', adverso.estado('EV-07') === 'NO_CUMPLE', adverso.motivo('EV-07'));

  const corta = evalua([latido(), cambio, caido('nginx.service', hace(3)), ...registro([peticion({})])], con({ 'P-09': '1' }));
  comprueba('REVERSIÓN: con ventana de estabilidad de 1 h no se le atribuye al cambio → CUMPLE', corta.estado('EV-07') === 'CUMPLE', corta.motivo('EV-07'));

  const revertido = evalua([latido(), cambio, caido('nginx.service', hace(3)), ...registro([peticion({ estado: 'revertida' })])]);
  comprueba('el cambio consta revertido en el registro → CUMPLE', revertido.estado('EV-07') === 'CUMPLE', revertido.motivo('EV-07'));

  // Hecho de ESTADO: caído en una pasada, en pie en la siguiente.
  const recuperado = evalua([
    latido('EV-01,EV-07', hace(2)),
    caido('nginx.service', hace(3), hace(2)),
    latido('EV-01,EV-07', hace(1)),
    cambio,
    ...registro([peticion({})]),
  ]);
  comprueba('caído en la pasada anterior y en pie en la última → CUMPLE', recuperado.estado('EV-07') === 'CUMPLE', recuperado.motivo('EV-07'));

  const sinP09 = evalua([latido(), cambio, ...registro([peticion({})])], con({ 'P-09': undefined }));
  comprueba('sin P-09 → NO_EVALUABLE', sinP09.estado('EV-07') === 'NO_EVALUABLE', sinP09.motivo('EV-07'));
}

// --- 8. EV-09 --------------------------------------------------------------

bloque('8. EV-09 · punto de reversión ANTERIOR al cambio (la lógica de op.exp.4)');

{
  const cambio = software(hace(5));
  const conPunto = evalua([latido(), cambio, snapshot(hace(6)), ...registro([peticion({})])]);
  comprueba('snapshot LVM 1 h antes del cambio → CUMPLE', conPunto.estado('EV-09') === 'CUMPLE', conPunto.motivo('EV-09'));

  const despues = evalua([latido(), cambio, snapshot(hace(4)), ...registro([peticion({})])]);
  comprueba('REVERSIÓN: snapshot DESPUÉS del cambio → NO_CUMPLE', despues.estado('EV-09') === 'NO_CUMPLE', despues.motivo('EV-09'));

  const sinLvm = evalua([
    latido(),
    cambio,
    alerta({ event: 'evidence_state', evidence_id: 'EV-09', estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'la maquina no tiene ningun mecanismo de reversion local observable' }),
    ...registro([peticion({})]),
  ]);
  comprueba('máquina sin mecanismo local observable → NO_EVALUABLE con el motivo', sinLvm.estado('EV-09') === 'NO_EVALUABLE' && /mecanismo/.test(sinLvm.motivo('EV-09')), sinLvm.motivo('EV-09'));

  const hipervisor = evalua([latido(), cambio, ...registro([peticion({})])], con({ 'P-08': ['* | hipervisor | snapshot de Proxmox | 24'] }));
  comprueba('P-08 declara hipervisor → NO_EVALUABLE, no se simula', hipervisor.estado('EV-09') === 'NO_EVALUABLE', hipervisor.motivo('EV-09'));

  const tranquilo = evalua([latido(), ...registro([])]);
  comprueba('ningún cambio con la detección confirmada → CUMPLE (aserción negativa)', tranquilo.estado('EV-09') === 'CUMPLE', tranquilo.motivo('EV-09'));
}

// --- 9. lo que no tiene fuente ---------------------------------------------

bloque('9. EV-05 y EV-08 · sin fuente real: NO_EVALUABLE siempre, nunca CUMPLE');

{
  const todo = evalua([latido(), ...registro([peticion({ preproduccion: 'prueba en pre-real 2026-09-20' })])]);
  comprueba('EV-05 con P-05 y la preproducción declarada en el registro → NO_EVALUABLE', todo.estado('EV-05') === 'NO_EVALUABLE', todo.motivo('EV-05'));
  comprueba('EV-08 sin ningún fallo → NO_EVALUABLE (la comunicación no se observa)', todo.estado('EV-08') === 'NO_EVALUABLE', todo.motivo('EV-08'));
  comprueba('op.exp.5.3 no sale CUMPLE', todo.requisito('op.exp.5.3').status !== 'CUMPLE', todo.requisito('op.exp.5.3').status);
  comprueba('op.exp.5.r1.2 no sale CUMPLE', todo.requisito('op.exp.5.r1.2').status !== 'CUMPLE', todo.requisito('op.exp.5.r1.2').status);

  const otroControl = evalua([
    latido(),
    ...registro([]),
    {
      _id: 'ajeno',
      _source: {
        '@timestamp': hace(1),
        agent: { id: '024', name: 'wazuh-real' },
        rule: { id: '110505', description: 'op.exp.4' },
        location: '/var/log/ensfacil/op_exp_4.json',
        data: { ensfacil: 'op.exp.4', event: 'package_changed', actor: 'root', inicio: hace(5), fin: hace(5) },
      },
    },
  ]);
  comprueba('un package_changed de op.exp.4 no cuenta como cambio de op.exp.5', otroControl.estado('EV-02') === 'CUMPLE', otroControl.motivo('EV-02'));
}

// --- 10. la causa del hueco -------------------------------------------------

bloque('10. La causa de lo que no se ha podido medir llega a la evidencia');

{
  // Datos reales de wazuh-real (26/09): P-05 sin declarar salía «no ha llegado
  // nada» (COLLECTION), mandando a revisar el agente cuando lo que falta es
  // una decisión en la pantalla de Configuración.
  const sinP05 = evalua([latido(), ...registro([])], con({ 'P-05': undefined }));
  comprueba(
    'sin P-05 → EV-05 NO_EVALUABLE con causa CONFIGURATION, no COLLECTION',
    sinP05.evidencia('EV-05')?.status === 'NO_EVALUABLE' && sinP05.evidencia('EV-05')?.gapCause === 'CONFIGURATION',
    `${sinP05.evidencia('EV-05')?.status} ${sinP05.evidencia('EV-05')?.gapCause}`
  );

  const conP05 = evalua([latido(), ...registro([])]);
  comprueba(
    'REVERSIÓN: con P-05 declarado, EV-05 sigue sin medir pero ya no por configuración (EVIDENCE)',
    conP05.evidencia('EV-05')?.status === 'NO_EVALUABLE' && conP05.evidencia('EV-05')?.gapCause === 'EVIDENCE',
    `${conP05.evidencia('EV-05')?.status} ${conP05.evidencia('EV-05')?.gapCause}`
  );

  // El recolector declara CONFIGURATION (registro ausente) en EV-02; EV-03 se
  // mide sobre el mismo registro y no tiene hecho propio en el modelo clásico.
  const sinRegistro = evalua([
    latido(),
    alerta({ event: 'evidence_state', evidence_id: 'EV-02', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe /etc/ensfacil/change-register.tsv' }),
  ]);
  comprueba(
    'registro ausente (CONFIGURATION del recolector) → EV-03 lleva esa causa, no COLLECTION',
    sinRegistro.evidencia('EV-03')?.status === 'NO_EVALUABLE' && sinRegistro.evidencia('EV-03')?.gapCause === 'CONFIGURATION',
    `${sinRegistro.evidencia('EV-03')?.status} ${sinRegistro.evidencia('EV-03')?.gapCause}`
  );

  // Reglas de auditd escritas y no cargadas: el recolector lo declara
  // CONFIGURATION. Aunque haya cambios reales de software (que el modelo
  // clásico toma como el hecho de EV-01), la causa es la del recolector.
  const sinCargar = evalua([
    software(hace(3)),
    alerta({ event: 'evidence_state', evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'reglas de auditd escritas y no cargadas' }, hace(4)),
    ...registro([]),
  ]);
  comprueba(
    'la causa que declara el recolector (CONFIGURATION) llega a EV-01',
    sinCargar.evidencia('EV-01')?.status === 'NO_EVALUABLE' && sinCargar.evidencia('EV-01')?.gapCause === 'CONFIGURATION',
    `${sinCargar.evidencia('EV-01')?.status} ${sinCargar.evidencia('EV-01')?.gapCause}`
  );
  // Sin ningún cambio, el silencio de EV-09 se apoya en una detección que el
  // recolector declara incompleta por configuración: esa es su causa.
  const silencio = evalua([
    alerta({ event: 'evidence_state', evidence_id: 'EV-01', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'reglas de auditd escritas y no cargadas' }),
    ...registro([]),
  ]);
  comprueba(
    'y el silencio de EV-09 que se apoya en EV-01 hereda esa causa (CONFIGURATION)',
    silencio.evidencia('EV-09')?.status === 'NO_EVALUABLE' && silencio.evidencia('EV-09')?.gapCause === 'CONFIGURATION',
    `${silencio.evidencia('EV-09')?.status} ${silencio.evidencia('EV-09')?.gapCause}`
  );

  // Una lectura del registro de hace 30 h: llegó el hecho, pero el recolector
  // lleva más de un día sin leerlo. Es RECOGIDA.
  const viejo = evalua([latido(), ...registro([], {}, hace(30))]);
  comprueba(
    'lectura del registro caducada → EV-02 con causa COLLECTION',
    viejo.evidencia('EV-02')?.status === 'NO_EVALUABLE' && viejo.evidencia('EV-02')?.gapCause === 'COLLECTION',
    `${viejo.evidencia('EV-02')?.status} ${viejo.evidencia('EV-02')?.gapCause}`
  );
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} check(s) FAIL:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
