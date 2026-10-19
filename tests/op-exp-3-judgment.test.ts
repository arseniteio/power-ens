/**
 * op.exp.3 · la aplicabilidad acumulativa y el juicio de sus evidencias.
 *
 *     npx tsx tests/op-exp-3-judgment.test.ts
 *
 * Mismo montaje que sus hermanas: TypeScript suelto con su propio comprobador.
 *
 * Qué se prueba, y por qué cada cosa:
 *
 *   1. Los refuerzos son ACUMULATIVOS: 6 requisitos en BAJO, 9 en MEDIO, 11 en
 *      ALTO, y R4/R5 nunca. El catálogo generado ponía R1 solo en ALTO.
 *   2. Cada evidencia con `judgment` cambia de veredicto al cambiar SU
 *      parámetro, con el MISMO evento del agente. Es la prueba de aceptación del
 *      modelo nuevo.
 *   3. El silencio solo cumple donde puede cumplir (EV-02, EV-03) y solo con el
 *      latido confirmando la cobertura. EV-08, EV-09 y EV-11 no cumplen nunca
 *      por ausencia.
 *   4. Las evidencias sin fuente en la máquina (EV-01, EV-05, EV-06, EV-07,
 *      EV-10) no pueden acreditar nada con lo que el agente emite.
 *   5. r1.1 se acredita por documento, y el ejemplo del parámetro no acredita.
 *   6. Los ejemplos de los parámetros son valores válidos, y el bloque semilla
 *      dice lo mismo que el TypeScript.
 *
 * Cada afirmación lleva al lado su REVERSIÓN.
 */
import { opExp3CatalogDefinition } from '../common/ens/catalog/op-exp-3';
import { opExp3Configuration } from '../common/ens/configuration/data/op-exp-3-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../common/ens/configuration/types';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { parseRequirementAttestations } from '../common/ens/configuration/services/attestation-service';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { evaluateRequirements } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';
import { opExp3PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-3.policy';
import bloqueSemilla from '../config/op-exp-3-control-block.json';

declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle: unknown = ''
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FAIL ${nombre}${detalle !== '' ? ` — ${String(detalle)}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

const AHORA = new Date('2026-09-16T12:00:00Z');

let contador = 0;

const evento = (
  eventType: string,
  evidenceId: string | undefined,
  attributes: Record<string, unknown>,
  timestamp = '2026-09-16T11:00:00Z'
): ENSNormalizedEvent => ({
  id: `evt-${(contador += 1)}`,
  controlId: 'op.exp.3',
  evidenceId,
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp,
  attributes,
});

const latido = (cubiertas: string, resultado = 'completada') =>
  evento('collector_run', undefined, {
    resultado,
    evidencias_cubiertas: cubiertas,
  });

// Configuración con los valores que se pidan; el resto de parámetros sin valor.
const configuracion = (
  valores: Record<string, ENSControlParameter['value']>
): ENSControlConfiguration => ({
  ...opExp3Configuration,
  parameters: opExp3Configuration.parameters.map(parametro =>
    parametro.id in valores
      ? { ...parametro, value: valores[parametro.id] }
      : { ...parametro }
  ),
});

const evidencia = (
  id: string,
  eventos: ENSNormalizedEvent[],
  valores: Record<string, ENSControlParameter['value']>,
  nivel: ENSLevel = 'ALTO'
) =>
  resolveEvidenceForControl(
    'op.exp.3',
    eventos,
    undefined,
    nivel,
    configuracion(valores),
    AHORA
  ).find(item => item.id === id);

const aplicables = (nivel: ENSLevel): string[] =>
  evaluateRequirements(
    opExp3CatalogDefinition.requirements,
    nivel,
    [],
    false,
    [],
    'ACTIVE'
  )
    .filter(requisito => requisito.applicable)
    .map(requisito => requisito.id);

// --- 1. aplicabilidad acumulativa -----------------------------------------

bloque('1. Los refuerzos se acumulan: 6 en BAJO, 9 en MEDIO, 11 en ALTO');

{
  const base = [
    'op.exp.3.1', 'op.exp.3.2', 'op.exp.3.3',
    'op.exp.3.4', 'op.exp.3.5', 'op.exp.3.6',
  ];
  const r1 = ['op.exp.3.r1.1', 'op.exp.3.r1.2', 'op.exp.3.r1.3'];
  const r2r3 = ['op.exp.3.r2.1', 'op.exp.3.r3.1'];

  const iguales = (a: string[], b: string[]) =>
    a.length === b.length && a.every(x => b.includes(x));

  comprueba('BAJO · exactamente los 6 base', iguales(aplicables('BAJO'), base), aplicables('BAJO').join(','));
  comprueba('MEDIO · base + R1 entero (9)', iguales(aplicables('MEDIO'), [...base, ...r1]), aplicables('MEDIO').join(','));
  comprueba('ALTO · base + R1 + R2 + R3 (11)', iguales(aplicables('ALTO'), [...base, ...r1, ...r2r3]), aplicables('ALTO').join(','));

  // La reversión del error del generador: R1 no es solo de ALTO.
  comprueba('R1 NO aplica en BAJO', !aplicables('BAJO').some(id => r1.includes(id)));

  for (const nivel of ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]) {
    comprueba(
      `${nivel} · R4 y R5 nunca en el denominador`,
      !aplicables(nivel).includes('op.exp.3.r4.1') && !aplicables(nivel).includes('op.exp.3.r5.1')
    );
  }

  // La policy tiene que decir exactamente lo mismo que el catálogo.
  const divergentes = opExp3CatalogDefinition.requirements.filter(requisito => {
    const decision = opExp3PolicyDefinition.requirements.find(
      item => item.requirementId === requisito.id
    );

    return (
      !decision ||
      decision.levels.join(',') !== requisito.applicability.levels.join(',') ||
      decision.evidenceIds.join(',') !== requisito.evidenceIds.join(',')
    );
  });

  comprueba('la policy declara los mismos niveles y evidencias que el catálogo', divergentes.length === 0, divergentes.map(r => r.id).join(','));

  // Y cada evidencia acredita exactamente los requisitos que la declaran.
  const evidencias = ENSEvidenceCatalog.filter(e => e.controlId === 'op.exp.3');

  const incoherentes = evidencias.filter(e => {
    const declaran = opExp3CatalogDefinition.requirements
      .filter(r => r.evidenceIds.includes(e.id))
      .map(r => r.id)
      .sort()
      .join(',');

    return declaran !== [...e.requirements].sort().join(',');
  });

  comprueba('evidencias y requisitos se declaran mutuamente', incoherentes.length === 0, incoherentes.map(e => e.id).join(','));
}

// --- 2. EV-02 · quién edita la configuración ----------------------------

bloque('2. EV-02 · el actor contra P-03, y el silencio solo con cobertura');

{
  const edicion = evento('config_file_modified', 'EV-02', {
    actor: 'dioni',
    sesion: 'con_sesion',
    recurso: '/etc/ssh/sshd_config',
  });

  const autorizado = evidencia('EV-02', [edicion], { 'P-03': ['dioni', 'jgomez'] });
  comprueba('dioni en P-03 · CUMPLE', autorizado?.status === 'CUMPLE', autorizado?.status);

  const noAutorizado = evidencia('EV-02', [edicion], { 'P-03': ['jgomez'] });
  comprueba('MISMO evento, dioni fuera de P-03 · NO_CUMPLE', noAutorizado?.status === 'NO_CUMPLE', noAutorizado?.status);
  comprueba('y el motivo nombra la cuenta', (noAutorizado?.observations || []).some(o => o.includes("'dioni'")));

  // La comparación contra una lista autorizada distingue mayúsculas.
  const mayusculas = evidencia('EV-02', [edicion], { 'P-03': ['Dioni'] });
  comprueba("'Dioni' no autoriza a 'dioni'", mayusculas?.status === 'NO_CUMPLE', mayusculas?.status);

  const silencioCubierto = evidencia('EV-02', [latido('EV-02,EV-03')], { 'P-03': ['jgomez'] });
  comprueba('sin ediciones y con EV-02 cubierta · CUMPLE', silencioCubierto?.status === 'CUMPLE', silencioCubierto?.status);

  const silencioSinCubrir = evidencia('EV-02', [latido('EV-03')], { 'P-03': ['jgomez'] });
  comprueba('sin ediciones y el latido NO cubre EV-02 · NO_EVALUABLE', silencioSinCubrir?.status === 'NO_EVALUABLE', silencioSinCubrir?.status);

  const sinLatido = evidencia('EV-02', [], { 'P-03': ['jgomez'] });
  comprueba('sin ediciones y sin latido · NO_EVALUABLE (COLLECTION)', sinLatido?.status === 'NO_EVALUABLE' && sinLatido?.gapCause === 'COLLECTION', `${sinLatido?.status}/${sinLatido?.gapCause}`);

  const sinParametro = evidencia('EV-02', [edicion], {});
  comprueba('con edición y sin P-03 · NO_EVALUABLE (CONFIGURATION)', sinParametro?.status === 'NO_EVALUABLE' && sinParametro?.gapCause === 'CONFIGURATION', `${sinParametro?.status}/${sinParametro?.gapCause}`);

  // El evidence_state del agente NO manda sobre una evidencia juzgada.
  const degradacion = evento('evidence_state', 'EV-02', { estado: 'NO_EVALUABLE', causa: 'CONFIGURATION' });
  const conDegradacion = evidencia('EV-02', [degradacion, edicion], { 'P-03': ['dioni'] });
  comprueba('una degradación del agente no tapa el juicio del hecho', conDegradacion?.status === 'CUMPLE', conDegradacion?.status);
}

// --- 3. EV-03 · software introducido ------------------------------------

bloque('3. EV-03 · lo instalado contra P-01');

{
  const instalacion = evento('software_installed', 'EV-03', { paquete: 'nmap', version: '7.94' });

  const fuera = evidencia('EV-03', [instalacion], { 'P-01': ['jq'] }, 'MEDIO');
  comprueba('nmap fuera de P-01 · NO_CUMPLE', fuera?.status === 'NO_CUMPLE', fuera?.status);

  const dentro = evidencia('EV-03', [instalacion], { 'P-01': ['jq', 'nmap'] }, 'MEDIO');
  comprueba('MISMO evento con nmap en P-01 · CUMPLE', dentro?.status === 'CUMPLE', dentro?.status);

  const silencio = evidencia('EV-03', [latido('EV-03')], { 'P-01': ['jq'] }, 'MEDIO');
  comprueba('sin instalaciones y registro leído · CUMPLE', silencio?.status === 'CUMPLE', silencio?.status);

  const enBajo = evidencia('EV-03', [instalacion], { 'P-01': ['jq'] }, 'BAJO');
  comprueba('en BAJO no aplica', enBajo?.status === 'NO_APLICA', enBajo?.status);
}

// --- 4. EV-04 · servicios contra la fila de su perfil -------------------

bloque('4. EV-04 · cada servicio en la celda de su perfil');

{
  const servicios = [
    evento('service_running', 'EV-04', { perfil: 'wazuh-real', servicio: 'ssh.service' }),
    evento('service_running', 'EV-04', { perfil: 'wazuh-real', servicio: 'cron.service' }),
  ];

  const politica = ['wazuh-real | ssh.service,cron.service'];

  const conforme = evidencia('EV-04', servicios, { 'P-02': politica }, 'BAJO');
  comprueba('todos en la celda del perfil · CUMPLE', conforme?.status === 'CUMPLE', conforme?.status);

  const oyente = evento('service_running', 'EV-04', { perfil: 'wazuh-real', servicio: 'proceso:nc' });
  const conOyente = evidencia('EV-04', [...servicios, oyente], { 'P-02': politica }, 'BAJO');
  comprueba('un proceso escuchando fuera de la lista · NO_CUMPLE', conOyente?.status === 'NO_CUMPLE', conOyente?.status);

  const autorizado = evidencia('EV-04', [...servicios, oyente], { 'P-02': ['wazuh-real | ssh.service,cron.service,proceso:nc'] }, 'BAJO');
  comprueba('MISMOS eventos con proceso:nc autorizado · CUMPLE', autorizado?.status === 'CUMPLE', autorizado?.status);

  const sinFila = evidencia('EV-04', servicios, { 'P-02': ['otro-host | ssh.service'] }, 'BAJO');
  comprueba('perfil sin fila · NO_EVALUABLE (CONFIGURATION), no NO_CUMPLE', sinFila?.status === 'NO_EVALUABLE' && sinFila?.gapCause === 'CONFIGURATION', `${sinFila?.status}/${sinFila?.gapCause}`);

  const sinHechos = evidencia('EV-04', [latido('EV-02,EV-03,EV-04')], { 'P-02': politica }, 'BAJO');
  comprueba('sin servicios observados no cumple ni con latido', sinHechos?.status === 'NO_EVALUABLE', sinHechos?.status);
}

// --- 5. EV-08 · administradores efectivos -------------------------------

bloque('5. EV-08 · el recuento contra P-09, nunca por ausencia');

{
  const recuento = evento('config_admins_observed', 'EV-08', { administradores: 4, cuentas: 'a,b,c,d' });

  const excede = evidencia('EV-08', [recuento], { 'P-09': 3 });
  comprueba('4 administradores con máximo 3 · NO_CUMPLE', excede?.status === 'NO_CUMPLE', excede?.status);

  const admite = evidencia('EV-08', [recuento], { 'P-09': 5 });
  comprueba('MISMO evento con máximo 5 · CUMPLE', admite?.status === 'CUMPLE', admite?.status);

  const silencio = evidencia('EV-08', [latido('EV-02,EV-03,EV-08')], { 'P-09': 3 });
  comprueba('sin recuento (ventana incompleta) · NO_EVALUABLE aunque haya latido', silencio?.status === 'NO_EVALUABLE', silencio?.status);

  const enMedio = evidencia('EV-08', [recuento], { 'P-09': 3 }, 'MEDIO');
  comprueba('en MEDIO no aplica', enMedio?.status === 'NO_APLICA', enMedio?.status);
}

// --- 6. EV-09 y EV-11 · plazos contra el reloj --------------------------

bloque('6. EV-09 y EV-11 · antigüedad contra el reloj');

{
  const copia = evento('config_backup_observed', 'EV-09', { fecha: '2026-09-16T02:00:00Z' });

  const fresca = evidencia('EV-09', [copia], { 'P-10': 24 });
  comprueba('copia de hace 10 h con plazo 24 h · CUMPLE', fresca?.status === 'CUMPLE', fresca?.status);

  const vieja = evidencia('EV-09', [copia], { 'P-10': 6 });
  comprueba('MISMA copia con plazo 6 h · NO_CUMPLE', vieja?.status === 'NO_CUMPLE', vieja?.status);

  const sinCopia = evidencia('EV-09', [latido('EV-02,EV-03,EV-09')], { 'P-10': 24 });
  comprueba('sin copia no cumple nunca', sinCopia?.status === 'NO_EVALUABLE', sinCopia?.status);

  const verificacion = evento('baseline_verification_performed', 'EV-11', { fecha: '2026-08-01', alcance: 'servidores' });

  const enPlazo = evidencia('EV-11', [verificacion], { 'P-05': 90 }, 'MEDIO');
  comprueba('verificación de hace 46 días con periodicidad 90 · CUMPLE', enPlazo?.status === 'CUMPLE', enPlazo?.status);

  const fueraDePlazo = evidencia('EV-11', [verificacion], { 'P-05': 30 }, 'MEDIO');
  comprueba('MISMA verificación con periodicidad 30 · NO_CUMPLE', fueraDePlazo?.status === 'NO_CUMPLE', fueraDePlazo?.status);
}

// --- 7. lo que no tiene fuente en la máquina ----------------------------

bloque('7. EV-01, EV-05, EV-06, EV-07 y EV-10 no acreditan con lo que emite el agente');

{
  const sinFuente = ['EV-01', 'EV-05', 'EV-06', 'EV-07', 'EV-10'];

  for (const id of sinFuente) {
    const declarada = ENSEvidenceCatalog.find(e => e.controlId === 'op.exp.3' && e.id === id);

    comprueba(`${id} · sin judgment, sin regla acreditada`, !declarada?.judgment && (declarada?.relatedRules.length ?? 1) === 0);

    const degradada = evidencia(id, [
      evento('evidence_state', id, { estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'sin fuente' }, '2026-09-16T11:00:00Z'),
      latido('EV-02,EV-03'),
    ], {});

    comprueba(`${id} · con la degradación del agente sale NO_EVALUABLE`, degradada?.status === 'NO_EVALUABLE', degradada?.status);
  }

  // Y el requisito que solo depende de ellas no cumple, aunque todo lo demás
  // esté en verde: lo no demostrado no cumple.
  const resueltas = resolveEvidenceForControl('op.exp.3', [], undefined, 'BAJO', configuracion({}), AHORA);
  const requisitos = evaluateRequirements(opExp3CatalogDefinition.requirements, 'BAJO', resueltas, false, [], 'ACTIVE');
  const dos = requisitos.find(r => r.id === 'op.exp.3.2');

  comprueba('op.exp.3.2 · NO_CUMPLE y marcado como no evidenciado', dos?.status === 'NO_CUMPLE' && dos?.evidenced === false, `${dos?.status}/${dos?.evidenced}`);

  // La reversión: sin evidencias de nada, el control en BAJO no cumple y puntúa 0.
  const control = evaluateControlStatus(requisitos);
  comprueba('el control sin medir nada no cumple', control.status === 'NO_CUMPLE', control.status);
}

// --- 8. r1.1 · documental ---------------------------------------------------

bloque('8. op.exp.3.r1.1 se acredita por documento, y el ejemplo no acredita');

{
  const r11 = opExp3CatalogDefinition.requirements.find(r => r.id === 'op.exp.3.r1.1')!;

  comprueba('r1.1 no declara evidencia técnica', r11.evidenceIds.length === 0);

  const juzga = (fila: string) =>
    evaluateRequirements(
      [r11],
      'MEDIO',
      [],
      false,
      [],
      'ACTIVE',
      parseRequirementAttestations(configuracion({ 'P-ATT': [fila] }))
    )[0];

  const ejemplo = opExp3Configuration.parameters.find(p => p.id === 'P-ATT')!.example || '';

  const conEjemplo = juzga(ejemplo);
  comprueba('copiar el ejemplo tal cual NO acredita', conEjemplo.status === 'NO_CUMPLE' && !conEjemplo.attested, `${conEjemplo.status}/${conEjemplo.attested}`);

  const conDocumento = juzga(ejemplo.replace(/https:\/\/EJEMPLO\.invalido\/[^ |]+/, 'https://intranet/linea-base-v3.pdf'));
  comprueba('con un enlace real SÍ acredita, marcado como atestación', conDocumento.status === 'CUMPLE' && conDocumento.attested === true, `${conDocumento.status}/${conDocumento.attested}`);
}

// --- 9. parámetros ------------------------------------------------------

bloque('9. Los ejemplos son valores válidos y el bloque semilla dice lo mismo');

{
  for (const parametro of opExp3Configuration.parameters) {
    const ejemplo = parametro.example || '';
    const valor = parametro.type === 'list' || parametro.type === 'table' ? [ejemplo] : ejemplo;
    const veredicto = validateParameterValue(parametro, valor);

    comprueba(`${parametro.id} · su ejemplo es válido`, veredicto.valid, veredicto.reason);
  }

  const semilla = bloqueSemilla as unknown as { parameters: ENSControlParameter[] };

  const divergen = opExp3Configuration.parameters.filter(parametro => {
    const enBloque = semilla.parameters.find(p => p.id === parametro.id);

    return (
      !enBloque ||
      enBloque.type !== parametro.type ||
      enBloque.required !== parametro.required ||
      enBloque.levels.join(',') !== parametro.levels.join(',') ||
      JSON.stringify(enBloque.columns || []) !== JSON.stringify(parametro.columns || [])
    );
  });

  comprueba('el bloque semilla coincide con el TypeScript', divergen.length === 0 && semilla.parameters.length === opExp3Configuration.parameters.length, divergen.map(p => p.id).join(','));

  comprueba(
    'ningún parámetro lleva un rule ID simbólico',
    semilla.parameters.every(p => (p.ruleIds || []).every(r => /^\d+$/.test(r)))
  );

  // Solo bloquean el control los tres de la base.
  const obligatorios = opExp3Configuration.parameters.filter(p => p.required).map(p => p.id).sort();
  comprueba('obligatorios: P-02, P-03 y P-04', obligatorios.join(',') === 'P-02,P-03,P-04', obligatorios.join(','));
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} check(s) FAIL:`);
  fallos.forEach(fallo => console.log(`  - ${fallo}`));
  process.exit(1);
}

console.log('All checks pass.');
