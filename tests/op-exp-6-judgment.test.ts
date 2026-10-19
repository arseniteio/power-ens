/**
 * op.exp.6 · el juicio de la protección frente a código dañino.
 *
 *     npx tsx tests/op-exp-6-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba. EV-01 y EV-03 las juzga una primitiva de tabla; las demás, la
 * policy del control. La propiedad central: una máquina SIN antimalware sale
 * NO_CUMPLE MEDIDO en EV-01 a EV-05 —la ausencia del producto es un hecho que
 * el agente emite—, nunca NO_EVALUABLE. Cada caso mueve UN eje y lleva al lado
 * la REVERSIÓN que demuestra que no pasaría siempre: el MISMO evento del agente
 * con otro parámetro, u otro hecho, cambia el veredicto.
 *
 * Los hechos de los casos «reales» son los que el recolector emitió en
 * wazuh-real el 26/09/2026 (ver el informe de op.exp.6).
 */
import { opExp6PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-6.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opExp6CatalogDefinition } from '../common/ens/catalog/op-exp-6';
import { opExp6Configuration } from '../common/ens/configuration/data/op-exp-6-parameters';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { applyPolicyDecisionsToEvidences } from '../common/ens/core/evaluation/policy-evidence-bridge';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
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
  console.log(`  FALLA ${nombre}${detalle !== '' ? ` — ${String(detalle)}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

const AHORA = new Date('2026-09-26T19:00:00Z');
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
      rule: { id: '110700', description: 'op.exp.6' },
      location: '/var/log/ensfacil/op_exp_6.json',
      data: Object.fromEntries(
        Object.entries({ ensfacil: 'op.exp.6', ...data }).map(([k, v]) => [k, String(v)])
      ),
    },
  };
};

const eventos = (...alertas: ReturnType<typeof alerta>[]): ENSNormalizedEvent[] =>
  normalizeWazuhAlerts(alertas);

const configuracion = (valores: Record<string, string[] | string>): ENSControlConfiguration => ({
  ...opExp6Configuration,
  parameters: opExp6Configuration.parameters.map(p => ({
    ...p,
    value: valores[p.id] as never,
  })),
});

const evalua = (
  evs: ENSNormalizedEvent[],
  valores: Record<string, string[] | string>,
  nivel: ENSLevel = 'ALTO',
  ahora: Date = AHORA
) => {
  const cfg = configuracion(valores);
  const evidencias = resolveEvidenceForControl('op.exp.6', evs, '024', nivel, cfg, ahora);
  const contexto = buildPolicyContext(opExp6CatalogDefinition, cfg, nivel, evs, evidencias, ahora);
  const { decisions } = opExp6PolicyDefinition.evaluator!(contexto);
  const principal = (requisito: string) => decisions.find(d => d.requirementId === requisito)!;
  const deEvidencia = (id: string) => decisions.find(d => d.trace.ruleId.endsWith(`/${id}`));
  const evidencia = (id: string) => evidencias.find(e => e.id === id)!;
  const tabla = applyPolicyDecisionsToEvidences(evidencias, decisions, opExp6CatalogDefinition.requirements);
  const color = (id: string) => tabla.find(e => e.id === id)?.status;
  const requisito = (id: string) =>
    evaluateRequirement(
      opExp6CatalogDefinition.requirements.find(q => q.id === id)!,
      nivel,
      evidencias,
      false,
      decisions,
      'ACTIVE'
    );

  return { evidencias, decisions, principal, deEvidencia, evidencia, color, requisito };
};

// Los hechos de wazuh-real el 26/09/2026: sin ningún antimalware.
const SIN_ANTIMALWARE = () => [
  alerta({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'sistema', equipo: 'wazuh-real', producto: 'ninguno', instalado: 'no', servicio: '-', servicio_activo: 'no', producto_activo: 'ninguno' }),
  alerta({ event: 'antimalware_setting', evidence_id: 'EV-03', plano: 'sistema', equipo: 'wazuh-real', ajuste: 'proteccion_tiempo_real', valor: 'no' }),
  alerta({ event: 'antimalware_setting', evidence_id: 'EV-03', plano: 'sistema', equipo: 'wazuh-real', ajuste: 'actualizacion_automatica_firmas', valor: 'no' }),
  alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-04,EV-07,EV-12', equipo: 'wazuh-real' }),
];

// La misma máquina con ClamAV instalado, en marcha y con firmas de hace 10 h.
const CON_CLAMAV = (firmasHace = 10) => [
  alerta({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'sistema', equipo: 'wazuh-real', producto: 'clamav', instalado: 'si', servicio: 'clamav-daemon.service', servicio_activo: 'si', producto_activo: 'clamav' }),
  alerta({ event: 'antimalware_setting', evidence_id: 'EV-03', plano: 'sistema', equipo: 'wazuh-real', ajuste: 'proteccion_tiempo_real', valor: 'si' }),
  alerta({ event: 'antimalware_setting', evidence_id: 'EV-03', plano: 'sistema', equipo: 'wazuh-real', ajuste: 'actualizacion_automatica_firmas', valor: 'si' }),
  alerta({ event: 'antimalware_signatures_updated', evidence_id: 'EV-02', plano: 'sistema', equipo: 'wazuh-real', producto: 'clamav', fecha: hace(firmasHace), version: '27772' }),
  alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-04,EV-05,EV-07,EV-12', equipo: 'wazuh-real' }),
];

const P02 = ['wazuh-real | sistema | servidor | clamav'];
const P04 = ['sistema | proteccion_tiempo_real | si', 'sistema | actualizacion_automatica_firmas | si'];

// --- 1. catálogo -----------------------------------------------------------

bloque('1. Aplicabilidad: refuerzos acumulativos, R5 fuera del denominador');

{
  const nivelesDe = (id: string) =>
    opExp6CatalogDefinition.requirements.find(r => r.id === id)!.applicability.levels.join(',');

  comprueba('la base rige en los tres', ['op.exp.6.1', 'op.exp.6.2', 'op.exp.6.3', 'op.exp.6.4', 'op.exp.6.5'].every(id => nivelesDe(id) === 'BAJO,MEDIO,ALTO'));
  comprueba('R1 y R2 rigen en MEDIO y ALTO', nivelesDe('op.exp.6.r1.1') === 'MEDIO,ALTO' && nivelesDe('op.exp.6.r2.1') === 'MEDIO,ALTO');
  comprueba('R3 y R4 rigen solo en ALTO', nivelesDe('op.exp.6.r3.1') === 'ALTO' && nivelesDe('op.exp.6.r4.1') === 'ALTO');
  comprueba('R5 no rige en ningún nivel', nivelesDe('op.exp.6.r5.1') === '' && nivelesDe('op.exp.6.r5.2') === '');
  comprueba('el control está ACTIVE', opExp6CatalogDefinition.status === 'ACTIVE', opExp6CatalogDefinition.status);

  const tablas = opExp6Configuration.parameters.filter(p => ['P-02', 'P-04', 'P-09'].includes(p.id));
  comprueba('P-02, P-04 y P-09 son tablas con columnas', tablas.length === 3 && tablas.every(p => p.type === 'table' && (p.columns || []).length >= 3));
  comprueba('ningún parámetro trae `value` en la definición', opExp6Configuration.parameters.every(p => !('value' in p)));
  comprueba('P-ATT es opcional', opExp6Configuration.parameters.find(p => p.id === 'P-ATT')!.required === false);
}

// --- 2. EV-01 ---------------------------------------------------------------

bloque('2. EV-01 · el antimalware en ejecución contra P-02');

{
  const sin = evalua(eventos(...SIN_ANTIMALWARE()), { 'P-02': P02 });
  comprueba('sin antimalware y P-02 espera clamav → NO_CUMPLE medido', sin.evidencia('EV-01').status === 'NO_CUMPLE', sin.evidencia('EV-01').observations.join(' '));
  comprueba('op.exp.6.2 sale NO_CUMPLE y medido', sin.requisito('op.exp.6.2').status === 'NO_CUMPLE' && sin.requisito('op.exp.6.2').evidenced === true, `${sin.requisito('op.exp.6.2').status}`);

  const con = evalua(eventos(...CON_CLAMAV()), { 'P-02': P02 });
  comprueba('REVERSIÓN: clamav en ejecución → CUMPLE', con.evidencia('EV-01').status === 'CUMPLE', con.evidencia('EV-01').observations.join(' '));

  const parado = evalua(eventos(alerta({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'sistema', equipo: 'wazuh-real', producto: 'clamav', instalado: 'si', servicio_activo: 'no', producto_activo: 'ninguno' })), { 'P-02': P02 });
  comprueba('clamav instalado y PARADO → NO_CUMPLE (no protege)', parado.evidencia('EV-01').status === 'NO_CUMPLE');

  const sinP02 = evalua(eventos(...SIN_ANTIMALWARE()), {});
  comprueba('sin P-02 → NO_EVALUABLE, nunca CUMPLE', sinP02.evidencia('EV-01').status === 'NO_EVALUABLE');

  const correo = evalua(eventos(...CON_CLAMAV(), alerta({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'correo', equipo: 'wazuh-real', producto: 'clamav-zimbra', instalado: 'si', servicio_activo: 'si', producto_activo: 'clamav-zimbra' })), { 'P-02': P02 });
  comprueba('un plano correo observado sin fila en P-02 → NO_EVALUABLE (decisión sin escribir)', correo.evidencia('EV-01').status === 'NO_EVALUABLE', correo.evidencia('EV-01').observations.join(' '));
  const correo2 = evalua(eventos(...CON_CLAMAV(), alerta({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'correo', equipo: 'wazuh-real', producto: 'clamav-zimbra', instalado: 'si', servicio_activo: 'si', producto_activo: 'clamav-zimbra' })), { 'P-02': [...P02, 'wazuh-real | correo | servidor | clamav-zimbra'] });
  comprueba('REVERSIÓN: con la fila del plano correo → CUMPLE', correo2.evidencia('EV-01').status === 'CUMPLE');
}

// --- 3. EV-02 ---------------------------------------------------------------

bloque('3. EV-02 · firmas de cada plano contra P-03');

{
  const sin = evalua(eventos(...SIN_ANTIMALWARE()), { 'P-02': P02, 'P-03': '48' });
  comprueba('sin antimalware → NO_CUMPLE medido, no NO_EVALUABLE', sin.deEvidencia('EV-02')?.status === 'NO_CUMPLE', sin.deEvidencia('EV-02')?.reason);
  comprueba('y la tabla de evidencias lo pinta así', sin.color('EV-02') === 'NO_CUMPLE', sin.color('EV-02'));

  const al_dia = evalua(eventos(...CON_CLAMAV(10)), { 'P-02': P02, 'P-03': '48' });
  comprueba('firmas de hace 10 h con P-03=48 → CUMPLE', al_dia.deEvidencia('EV-02')?.status === 'CUMPLE', al_dia.deEvidencia('EV-02')?.reason);
  const estricto = evalua(eventos(...CON_CLAMAV(10)), { 'P-02': P02, 'P-03': '6' });
  comprueba('REVERSIÓN: el MISMO hecho con P-03=6 → NO_CUMPLE', estricto.deEvidencia('EV-02')?.status === 'NO_CUMPLE', estricto.deEvidencia('EV-02')?.reason);
  const tarde = evalua(eventos(...CON_CLAMAV(10)), { 'P-02': P02, 'P-03': '48' }, 'ALTO', new Date(AHORA.getTime() + 3 * 86400000));
  comprueba('el mismo hecho tres días después envejece solo → NO_CUMPLE', tarde.deEvidencia('EV-02')?.status === 'NO_CUMPLE');
  const sinP03 = evalua(eventos(...CON_CLAMAV(10)), { 'P-02': P02 });
  comprueba('sin P-03 → NO_EVALUABLE', sinP03.deEvidencia('EV-02')?.status === 'NO_EVALUABLE');

  const dos = evalua(eventos(
    ...CON_CLAMAV(10),
    alerta({ event: 'antimalware_status', evidence_id: 'EV-01', plano: 'correo', equipo: 'wazuh-real', producto: 'clamav-zimbra', instalado: 'si', servicio_activo: 'si', producto_activo: 'clamav-zimbra' }),
    alerta({ event: 'antimalware_signatures_updated', evidence_id: 'EV-02', plano: 'correo', producto: 'clamav-zimbra', fecha: hace(24 * 20) }),
  ), { 'P-02': P02, 'P-03': '48' });
  comprueba('un plano al día NO tapa al otro caducado → NO_CUMPLE', dos.deEvidencia('EV-02')?.status === 'NO_CUMPLE', dos.deEvidencia('EV-02')?.reason);
}

// --- 4. EV-03 ---------------------------------------------------------------

bloque('4. EV-03 · ajustes contra P-04');

{
  const sin = evalua(eventos(...SIN_ANTIMALWARE()), { 'P-04': P04 });
  comprueba('sin protección en tiempo real y P-04 la exige → NO_CUMPLE', sin.evidencia('EV-03').status === 'NO_CUMPLE', sin.evidencia('EV-03').observations.join(' '));
  const con = evalua(eventos(...CON_CLAMAV()), { 'P-04': P04 });
  comprueba('REVERSIÓN: clamonacc y freshclam en marcha → CUMPLE', con.evidencia('EV-03').status === 'CUMPLE', con.evidencia('EV-03').observations.join(' '));
}

// --- 5. EV-04 ---------------------------------------------------------------

bloque('5. EV-04 · detecciones y su resolución');

{
  const sin = evalua(eventos(...SIN_ANTIMALWARE()), { 'P-02': P02 });
  comprueba('sin antimalware → NO_CUMPLE (no hay mecanismo de reacción)', sin.deEvidencia('EV-04')?.status === 'NO_CUMPLE', sin.deEvidencia('EV-04')?.reason);

  const limpio = evalua(eventos(...CON_CLAMAV()), { 'P-02': P02 });
  comprueba('clamav, logs leídos y ninguna detección → CUMPLE', limpio.deEvidencia('EV-04')?.status === 'CUMPLE', limpio.deEvidencia('EV-04')?.reason);

  const sinLatido = evalua(eventos(...CON_CLAMAV().slice(0, 4)), { 'P-02': P02 });
  comprueba('REVERSIÓN: sin latido que declare leídos los logs → NO_EVALUABLE', sinLatido.deEvidencia('EV-04')?.status === 'NO_EVALUABLE', sinLatido.deEvidencia('EV-04')?.reason);

  const sinRemediar = evalua(eventos(...CON_CLAMAV(), alerta({ event: 'malware_detected', evidence_id: 'EV-04', fichero: '/tmp/eicar.com', amenaza: 'Eicar-Signature', accion: 'sin_accion', fecha: hace(3) })), { 'P-02': P02 });
  comprueba('una detección sin acción → NO_CUMPLE', sinRemediar.deEvidencia('EV-04')?.status === 'NO_CUMPLE', sinRemediar.deEvidencia('EV-04')?.reason);

  const cuarentena = evalua(eventos(...CON_CLAMAV(), alerta({ event: 'malware_detected', evidence_id: 'EV-04', fichero: '/tmp/eicar.com', amenaza: 'Eicar-Signature', accion: 'cuarentena', fecha: hace(3) })), { 'P-02': P02 });
  comprueba('REVERSIÓN: la misma detección en cuarentena → CUMPLE', cuarentena.deEvidencia('EV-04')?.status === 'CUMPLE', cuarentena.deEvidencia('EV-04')?.reason);

  const repetida = evalua(eventos(...CON_CLAMAV(),
    alerta({ event: 'malware_detected', evidence_id: 'EV-04', fichero: '/srv/x.php', amenaza: 'Php.Webshell', accion: 'cuarentena', fecha: hace(30) }),
    alerta({ event: 'malware_detected', evidence_id: 'EV-04', fichero: '/srv/x.php', amenaza: 'Php.Webshell', accion: 'cuarentena', fecha: hace(3) })), { 'P-02': P02 });
  comprueba('la misma amenaza dos veces en el mismo fichero → NO_CUMPLE (persistente)', repetida.deEvidencia('EV-04')?.status === 'NO_CUMPLE', repetida.deEvidencia('EV-04')?.reason);

  // Una detección = fichero + firma + instante. La prueba EICAR real de
  // wazuh-real (26/09/2026): clamd anota dos veces el mismo segundo y
  // clamonacc la suya sin hora; el recolector anterior le ponía la hora de
  // lectura. Todo eso es UNA detección, en cuarentena.
  const det = (extra: Record<string, unknown>) =>
    alerta({ event: 'malware_detected', evidence_id: 'EV-04', plano: 'sistema', fichero: '/var/tmp/eicar.txt', amenaza: 'Eicar-Test-Signature', ...extra });
  const eicar = [
    det({ accion: 'sin_accion', fecha: hace(10), origen_dato: '/var/log/clamav/clamav.log' }),
    det({ accion: 'sin_accion', fecha: hace(10), origen_dato: '/var/log/clamav/clamav.log' }),
    det({ accion: 'cuarentena', fecha: hace(9), origen_dato: '/var/log/clamav/clamonacc.log' }),
    det({ accion: 'cuarentena', instante: 'sin_hora', origen_dato: '/var/log/clamav/clamonacc.log' }),
  ];
  const juntas = evalua(eventos(...CON_CLAMAV(), ...eicar), { 'P-02': P02 });
  comprueba('la misma detección anotada 4 veces (dos iguales, clamonacc sin hora y con la hora de lectura) → una, no persistente', juntas.deEvidencia('EV-04')?.status === 'CUMPLE' && /4 anotaciones/.test(juntas.deEvidencia('EV-04')?.reason || ''), juntas.deEvidencia('EV-04')?.reason);

  const juntasSinAccion = evalua(eventos(...CON_CLAMAV(), ...eicar.slice(0, 2), det({ accion: 'sin_accion', fecha: hace(9), origen_dato: '/var/log/clamav/clamonacc.log' })), { 'P-02': P02 });
  const r = juntasSinAccion.deEvidencia('EV-04')?.reason || '';
  comprueba('REVERSIÓN: la misma detección sin remediar → NO_CUMPLE por sin remediar, no por persistente', juntasSinAccion.deEvidencia('EV-04')?.status === 'NO_CUMPLE' && /sin remediar/.test(r) && !/persistente/.test(r), r);

  const soloSinHora = evalua(eventos(...CON_CLAMAV(),
    det({ fichero: '/home/x.bin', accion: 'sin_accion', instante: 'sin_hora', origen_dato: '/var/log/clamav/clamonacc.log' })), { 'P-02': P02 });
  comprueba('una detección sin hora y sin clamd → sigue siendo una detección sin remediar', soloSinHora.deEvidencia('EV-04')?.status === 'NO_CUMPLE' && /sin hora/.test(soloSinHora.deEvidencia('EV-04')?.reason || ''), soloSinHora.deEvidencia('EV-04')?.reason);

  const dosInstantes = evalua(eventos(...CON_CLAMAV(),
    det({ accion: 'cuarentena', fecha: hace(30), instante: 'log', origen_dato: '/var/log/clamav/clamav.log' }),
    det({ accion: 'cuarentena', fecha: hace(3), instante: 'log', origen_dato: '/var/log/clamav/clamav.log' }),
    det({ accion: 'cuarentena', instante: 'sin_hora', origen_dato: '/var/log/clamav/clamonacc.log' })), { 'P-02': P02 });
  comprueba('REVERSIÓN: dos instantes con hora distintos siguen siendo persistente (2 veces, la sin hora no suma)', dosInstantes.deEvidencia('EV-04')?.status === 'NO_CUMPLE' && /\(2 veces\)/.test(dosInstantes.deEvidencia('EV-04')?.reason || ''), dosInstantes.deEvidencia('EV-04')?.reason);
}

// --- 6. EV-05 ---------------------------------------------------------------

bloque('6. EV-05 · el escaneo completo contra P-06');

{
  const sin = evalua(eventos(...SIN_ANTIMALWARE()), { 'P-06': '7' });
  comprueba('sin antimalware → NO_CUMPLE', sin.deEvidencia('EV-05')?.status === 'NO_CUMPLE', sin.deEvidencia('EV-05')?.reason);

  const escaneo = alerta({ event: 'full_scan_completed', evidence_id: 'EV-05', fecha: hace(72), ficheros_escaneados: '184233', infectados: '0' });
  const semanal = evalua(eventos(...CON_CLAMAV(), escaneo), { 'P-06': '7' });
  comprueba('escaneo de hace 3 días con P-06=7 → CUMPLE', semanal.deEvidencia('EV-05')?.status === 'CUMPLE', semanal.deEvidencia('EV-05')?.reason);
  const diario = evalua(eventos(...CON_CLAMAV(), escaneo), { 'P-06': '2' });
  comprueba('REVERSIÓN: el MISMO escaneo con P-06=2 → NO_CUMPLE', diario.deEvidencia('EV-05')?.status === 'NO_CUMPLE');

  const nunca = evalua(eventos(...CON_CLAMAV()), { 'P-06': '7' });
  comprueba('clamav, registro leído y ningún escaneo → NO_CUMPLE («nunca»)', nunca.deEvidencia('EV-05')?.status === 'NO_CUMPLE', nunca.deEvidencia('EV-05')?.reason);

  const sinRegistro = evalua(eventos(...CON_CLAMAV().slice(0, 4),
    alerta({ event: 'evidence_state', evidence_id: 'EV-05', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'no existe ningun registro de escaneos completos' })), { 'P-06': '7' });
  comprueba('REVERSIÓN: sin registro de escaneos que leer → NO_EVALUABLE con el motivo del agente', sinRegistro.deEvidencia('EV-05')?.status === 'NO_EVALUABLE' && /registro de escaneos/.test(sinRegistro.deEvidencia('EV-05')?.reason || ''), sinRegistro.deEvidencia('EV-05')?.reason);
}

// --- 7. EV-06 ---------------------------------------------------------------

bloque('7. EV-06 · análisis al arranque contra P-07');

{
  // El arranque real de wazuh-real.
  const arranque = alerta({ event: 'boot_integrity_check', evidence_id: 'EV-06', equipo: 'wazuh-real', arranque_agente: '2026-09-17T10:30:43Z', arranque_sistema: '2026-07-28T22:53:21Z', fim_inicio: '2026-09-17T10:30:43Z', fim_fin: '2026-09-17T10:30:44Z', rutas: '/bin,/boot,/etc,/sbin,/usr/bin,/usr/sbin', rootcheck_avisos: 'sin_rootkit_files,sin_rootkit_trojans' });

  const conModulos = evalua(eventos(arranque), { 'P-07': ['* | /boot', '* | /usr/bin', '* | /usr/sbin', '* | /lib/modules'] });
  comprueba('P-07 incluye /lib/modules y el agente no lo vigila → NO_CUMPLE', conModulos.deEvidencia('EV-06')?.status === 'NO_CUMPLE' && /lib\/modules/.test(conModulos.deEvidencia('EV-06')?.reason || ''), conModulos.deEvidencia('EV-06')?.reason);

  const sinModulos = evalua(eventos(arranque), { 'P-07': ['* | /boot', '* | /usr/bin', '* | /usr/sbin/sshd', '* | /etc/ssh'] });
  comprueba('REVERSIÓN: rutas cubiertas (también por directorio padre) → CUMPLE', sinModulos.deEvidencia('EV-06')?.status === 'CUMPLE', sinModulos.deEvidencia('EV-06')?.reason);

  const deOtro = evalua(eventos(arranque), { 'P-07': ['* | /boot', 'ldapserver | /opt/zimbra/data/ldap/config'] });
  comprueba('una ruta declarada para OTRO equipo no se exige aquí → CUMPLE', deOtro.deEvidencia('EV-06')?.status === 'CUMPLE', deOtro.deEvidencia('EV-06')?.reason);

  const sinTerminar = evalua(eventos(alerta({ event: 'boot_integrity_check', evidence_id: 'EV-06', equipo: 'wazuh-real', arranque_agente: hace(5), fim_inicio: hace(5), fim_fin: 'no', rutas: '/boot' })), { 'P-07': ['* | /boot'] });
  comprueba('análisis de arranque sin terminar → NO_CUMPLE', sinTerminar.deEvidencia('EV-06')?.status === 'NO_CUMPLE', sinTerminar.deEvidencia('EV-06')?.reason);

  const sinP07 = evalua(eventos(arranque), {});
  comprueba('sin P-07 → NO_EVALUABLE', sinP07.deEvidencia('EV-06')?.status === 'NO_EVALUABLE');
}

// --- 8. EV-07 ---------------------------------------------------------------

bloque('8. EV-07 · mecanismo en modo aplicación Y ejecuciones contra P-08');

{
  const ninguno = evalua(eventos(...SIN_ANTIMALWARE(), alerta({ event: 'execution_control_status', evidence_id: 'EV-07', mecanismo: 'ninguno', activo: 'no', modo: '-', confinamiento_apparmor: 'si' })), {});
  comprueba('sin mecanismo (AppArmor no cuenta) → NO_CUMPLE', ninguno.deEvidencia('EV-07')?.status === 'NO_CUMPLE' && /AppArmor/.test(ninguno.deEvidencia('EV-07')?.reason || ''), ninguno.deEvidencia('EV-07')?.reason);

  const aplica = alerta({ event: 'execution_control_status', evidence_id: 'EV-07', mecanismo: 'fapolicyd', activo: 'si', modo: 'aplicacion' });
  const latido = alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-07' });
  const ok = evalua(eventos(aplica, latido), {});
  comprueba('fapolicyd en modo aplicación y decisiones leídas → CUMPLE', ok.deEvidencia('EV-07')?.status === 'CUMPLE', ok.deEvidencia('EV-07')?.reason);

  const auditoria = evalua(eventos(alerta({ event: 'execution_control_status', evidence_id: 'EV-07', mecanismo: 'fapolicyd', activo: 'si', modo: 'auditoria' }), latido), {});
  comprueba('REVERSIÓN: el mismo mecanismo en modo auditoría → NO_CUMPLE', auditoria.deEvidencia('EV-07')?.status === 'NO_CUMPLE');

  const dejo = alerta({ event: 'execution_observed', evidence_id: 'EV-07', ruta: '/tmp/x', decision: 'permitida', fecha: hace(4) });
  const fuera = evalua(eventos(aplica, latido, dejo), { 'P-08': ['python3 | /usr/bin/python3.12 | - | servidores'] });
  comprueba('ejecución no bloqueada fuera de P-08 → NO_CUMPLE', fuera.deEvidencia('EV-07')?.status === 'NO_CUMPLE', fuera.deEvidencia('EV-07')?.reason);
  const dentro = evalua(eventos(aplica, latido, dejo), { 'P-08': ['x | /tmp/x | - | -'] });
  comprueba('REVERSIÓN: la misma ejecución declarada en P-08 → CUMPLE', dentro.deEvidencia('EV-07')?.status === 'CUMPLE', dentro.deEvidencia('EV-07')?.reason);
}

// --- 9. R4 -------------------------------------------------------------------

bloque('9. EV-08 a EV-11 · la capa EDR observada y P-09');

{
  // Lo que se observó en wazuh-real.
  const edr = [
    alerta({ event: 'edr_capability_observed', evidence_id: 'EV-09', capacidad: 'yara', desplegada: 'no', detalle: 'el manager la configura pero en esta maquina falta el script o el binario yara' }),
    alerta({ event: 'edr_capability_observed', evidence_id: 'EV-10', capacidad: 'rootcheck', desplegada: 'si', detalle: 'ultima pasada terminada', bases: 'sin_rootkit_files,sin_rootkit_trojans' }),
    alerta({ event: 'edr_capability_observed', evidence_id: 'EV-11', capacidad: 'active_response', desplegada: 'si', detalle: 'comandos de contencion configurados y presentes: firewall-drop' }),
  ];
  const P09 = ['virustotal | si | FIM', 'yara | si | rutas de riesgo', 'rootcheck | si | todos', 'active_response | si | firewall-drop'];
  const r = evalua(eventos(...edr), { 'P-09': P09 });

  comprueba('EV-08 VirusTotal declarado: no observable en el equipo → NO_EVALUABLE', r.deEvidencia('EV-08')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-08')?.reason);
  const vtNo = evalua(eventos(...edr), { 'P-09': ['virustotal | no |'] });
  comprueba('REVERSIÓN: VirusTotal declarado no activado → NO_CUMPLE', vtNo.deEvidencia('EV-08')?.status === 'NO_CUMPLE');
  comprueba('EV-09 YARA sin script en el equipo → NO_CUMPLE', r.deEvidencia('EV-09')?.status === 'NO_CUMPLE', r.deEvidencia('EV-09')?.reason);
  comprueba('EV-10 rootcheck sin sus bases → NO_CUMPLE', r.deEvidencia('EV-10')?.status === 'NO_CUMPLE', r.deEvidencia('EV-10')?.reason);
  const completo = evalua(eventos(alerta({ event: 'edr_capability_observed', evidence_id: 'EV-10', capacidad: 'rootcheck', desplegada: 'si', detalle: 'ok', bases: 'ninguno' })), { 'P-09': P09 });
  comprueba('REVERSIÓN: rootcheck con sus bases → NO_EVALUABLE (los hallazgos van al manager), nunca CUMPLE', completo.deEvidencia('EV-10')?.status === 'NO_EVALUABLE', completo.deEvidencia('EV-10')?.reason);
  comprueba('EV-11 solo firewall-drop (bloqueo de red) → NO_CUMPLE: no contiene código dañino', r.deEvidencia('EV-11')?.status === 'NO_CUMPLE' && /firewall-drop/.test(r.deEvidencia('EV-11')?.reason || ''), r.deEvidencia('EV-11')?.reason);
  comprueba('R4 sale NO_CUMPLE', r.principal('op.exp.6.r4.1').status === 'NO_CUMPLE', r.principal('op.exp.6.r4.1').reason);
}

// --- 9b. EV-11: la respuesta al malware tiene que poder ejecutarse ----------

bloque('9b. EV-11 · la contención del código dañino, ejecutable en el equipo');

{
  // El hecho REAL de wazuh-real el 26/09/2026 (recolector anterior: solo
  // `detalle`). El manager configura la cuarentena y YARA; sus scripts no
  // están en /var/ossec/active-response/bin/.
  const real = alerta({ event: 'edr_capability_observed', evidence_id: 'EV-11', requisito: 'op.exp.6.r4.1', equipo: 'wazuh-real', capacidad: 'active_response', desplegada: 'si', detalle: 'comandos de contencion configurados y presentes: firewall-drop; configurados sin script aqui: quersystem-malware-quarantine.sh,quersystem-yara.sh' });
  const P09 = ['active_response | si | firewall-drop'];

  const hoy = evalua(eventos(real), { 'P-09': P09 });
  comprueba(
    'wazuh-real: la cuarentena configurada no existe en el equipo → EV-11 NO_CUMPLE medido, nombrándola',
    hoy.deEvidencia('EV-11')?.status === 'NO_CUMPLE' && /quersystem-malware-quarantine\.sh/.test(hoy.deEvidencia('EV-11')?.reason || ''),
    hoy.deEvidencia('EV-11')?.reason
  );
  comprueba('y op.exp.6.1 no se sostiene en firewall-drop', hoy.principal('op.exp.6.1').status === 'NO_CUMPLE', hoy.principal('op.exp.6.1').status);

  // El recolector ampliado lo dice en campos propios.
  const estructurado = evalua(eventos(alerta({ event: 'edr_capability_observed', evidence_id: 'EV-11', capacidad: 'active_response', desplegada: 'si', detalle: 'x', comandos_presentes: 'firewall-drop', comandos_sin_script: 'quersystem-malware-quarantine.sh,quersystem-yara.sh' })), { 'P-09': P09 });
  comprueba('con los campos del recolector ampliado → el mismo NO_CUMPLE', estructurado.deEvidencia('EV-11')?.status === 'NO_CUMPLE' && /quersystem-yara\.sh/.test(estructurado.deEvidencia('EV-11')?.reason || ''), estructurado.deEvidencia('EV-11')?.reason);

  const conScripts = evalua(eventos(alerta({ event: 'edr_capability_observed', evidence_id: 'EV-11', capacidad: 'active_response', desplegada: 'si', detalle: 'x', comandos_presentes: 'firewall-drop,quersystem-malware-quarantine.sh,quersystem-yara.sh', comandos_sin_script: '-' })), { 'P-09': P09 });
  comprueba('REVERSIÓN: con los scripts de cuarentena presentes → CUMPLE', conScripts.deEvidencia('EV-11')?.status === 'CUMPLE', conScripts.deEvidencia('EV-11')?.reason);
}

// --- 10. EV-12 ---------------------------------------------------------------

bloque('10. EV-12 · vías de entrada y dispositivos extraíbles');

{
  const latido = alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-12' });
  const usb = evalua(eventos(latido), { 'P-05': ['dispositivos_extraibles | clamonacc al montar'], 'P-10': 'bloqueados' });
  comprueba('solo vía USB, kernel leído y nada conectado → CUMPLE', usb.deEvidencia('EV-12')?.status === 'CUMPLE', usb.deEvidencia('EV-12')?.reason);

  const conectado = evalua(eventos(latido, alerta({ event: 'removable_device_connected', evidence_id: 'EV-12', dispositivo: 'sdb', fecha: hace(2) })), { 'P-05': ['dispositivos_extraibles | -'], 'P-10': 'bloqueados' });
  comprueba('REVERSIÓN: un disco extraíble conectado con P-10=bloqueados → NO_CUMPLE', conectado.deEvidencia('EV-12')?.status === 'NO_CUMPLE', conectado.deEvidencia('EV-12')?.reason);

  const correo = evalua(eventos(latido), { 'P-05': ['correo | pasarela', 'dispositivos_extraibles | -'], 'P-10': 'bloqueados' });
  comprueba('vía correo que este equipo no analiza → NO_EVALUABLE', correo.deEvidencia('EV-12')?.status === 'NO_EVALUABLE', correo.deEvidencia('EV-12')?.reason);

  const analizado = evalua(eventos(latido, alerta({ event: 'external_file_scanned', evidence_id: 'EV-12', via: 'correo', resultado: 'limpio', fecha: hace(2) })), { 'P-05': ['correo | amavis'], 'P-10': 'bloqueados' });
  comprueba('REVERSIÓN: la pasarela de este equipo analizó correo → CUMPLE', analizado.deEvidencia('EV-12')?.status === 'CUMPLE', analizado.deEvidencia('EV-12')?.reason);

  const sinP05 = evalua(eventos(latido), {});
  comprueba('sin P-05 → NO_EVALUABLE', sinP05.deEvidencia('EV-12')?.status === 'NO_EVALUABLE');
}

// --- 10b. la causa de lo que no se ha podido medir --------------------------

bloque('10b. La causa del hueco: parámetro sin declarar es CONFIGURATION');

{
  const causa = (r: ReturnType<typeof evalua>, id: string) =>
    applyPolicyDecisionsToEvidences(r.evidencias, r.decisions, opExp6CatalogDefinition.requirements).find(e => e.id === id)?.gapCause;

  // op.exp.6.3 en wazuh-real: ningún hecho de EV-12 en el modelo clásico y
  // P-05 sin declarar. Salía COLLECTION («no ha llegado nada»).
  const sinP05 = evalua(eventos(alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: 'EV-12' })), {});
  comprueba('sin P-05 → EV-12 con causa CONFIGURATION, no COLLECTION', causa(sinP05, 'EV-12') === 'CONFIGURATION', causa(sinP05, 'EV-12'));
  comprueba('y la decisión del requisito op.exp.6.3 lo dice', sinP05.principal('op.exp.6.3').cause === 'CONFIGURATION', sinP05.principal('op.exp.6.3').cause);

  const sinP06 = evalua(eventos(alerta({ event: 'full_scan_completed', evidence_id: 'EV-05', fecha: hace(30), ficheros_escaneados: '10' })), {});
  comprueba('escaneo observado y P-06 sin configurar → CONFIGURATION', causa(sinP06, 'EV-05') === 'CONFIGURATION', causa(sinP06, 'EV-05'));

  const nada = evalua(eventos(alerta({ event: 'collector_run', resultado: 'completada', evidencias_cubiertas: '' })), {});
  comprueba('sin ninguna observación de rootcheck → COLLECTION', causa(nada, 'EV-10') === 'COLLECTION', causa(nada, 'EV-10'));

  const declarada = evalua(eventos(alerta({ event: 'evidence_state', evidence_id: 'EV-08', estado: 'NO_EVALUABLE', causa: 'CONFIGURATION', motivo: 'la consulta la hace el manager' })), { 'P-09': ['virustotal | si | FIM'] });
  comprueba('lo que declara el recolector (CONFIGURATION) llega a la evidencia', causa(declarada, 'EV-08') === 'CONFIGURATION', causa(declarada, 'EV-08'));
}

// --- 11. el requisito sale de sus evidencias --------------------------------

bloque('11. wazuh-real hoy: la base sale NO_CUMPLE medida, no gris');

{
  const r = evalua(eventos(...SIN_ANTIMALWARE()), { 'P-02': P02, 'P-03': '48', 'P-04': P04 }, 'BAJO');

  ['op.exp.6.2', 'op.exp.6.4', 'op.exp.6.5'].forEach(id => {
    const q = r.requisito(id);
    comprueba(`${id} → NO_CUMPLE medido`, q.status === 'NO_CUMPLE' && q.evidenced === true, `${q.status} ${q.evidenced}`);
  });

  const q1 = r.requisito('op.exp.6.1');
  comprueba('op.exp.6.1 → NO_CUMPLE (EV-01 y EV-04 lo sostienen)', q1.status === 'NO_CUMPLE', q1.status);
  comprueba('en BAJO, R1 no aplica', r.requisito('op.exp.6.r1.1').status === 'NO_APLICA');

  const conClamav = evalua(eventos(...CON_CLAMAV()), { 'P-02': P02, 'P-03': '48', 'P-04': P04 }, 'BAJO');
  ['op.exp.6.2', 'op.exp.6.4', 'op.exp.6.5'].forEach(id => {
    const q = conClamav.requisito(id);
    comprueba(`REVERSIÓN: con ClamAV en marcha y al día, ${id} → CUMPLE`, q.status === 'CUMPLE', `${q.status}`);
  });
}

bloque('12. Solo cuentan los hechos de op.exp.6');

{
  const ajeno = normalizeWazuhAlerts([{
    _id: 'otro',
    _source: {
      '@timestamp': hace(1),
      agent: { id: '024', name: 'wazuh-real' },
      data: { ensfacil: 'op.exp.3', event: 'antimalware_status', evidence_id: 'EV-01', plano: 'sistema', equipo: 'wazuh-real', producto_activo: 'clamav' },
    },
  }]);
  const r = evalua(ajeno, { 'P-02': P02, 'P-03': '48' });
  comprueba('un antimalware_status de otro control no entra en EV-02', r.deEvidencia('EV-02')?.status === 'NO_EVALUABLE', r.deEvidencia('EV-02')?.reason);
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
