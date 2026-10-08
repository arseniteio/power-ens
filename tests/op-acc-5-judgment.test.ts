/**
 * op.acc.5 · la elección de refuerzo, el incumplimiento directo de R1 y el
 * juicio de sus evidencias, de punta a punta por el motor real.
 *
 *     docker run --rm -v "$PWD":/w -w /w node:22-alpine npx --yes tsx tests/op-acc-5-judgment.test.ts
 *
 * POR QUÉ EXISTE. op.acc.5 es el primer control cuyo DENOMINADOR depende de un
 * parámetro: los refuerzos R1 a R4 son una elección declarada en P-01, no una
 * acumulación. Si la policy fallara en silencio, el porcentaje contaría los
 * cuatro refuerzos a la vez —o ninguno— y nada daría error. Y R1 en MEDIO o
 * ALTO tiene que incumplir sin mirar un log.
 *
 * Reglas de la casa: cada caso mueve UN eje respecto del anterior y lleva al
 * lado la reversión que demuestra que no pasaría siempre.
 */
import { opAcc5CatalogDefinition } from '../public/ens/catalog/op-acc-5';
import { opAcc5Configuration } from '../public/ens/configuration/data/op-acc-5-parameters';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../public/ens/configuration/types';
import type { ENSNormalizedEvent } from '../public/ens/core/data-source/types';
import { resolveEvidenceForControl } from '../public/ens/core/evidence/engine';
import { buildPolicyContext } from '../public/ens/core/policy-runtime/policy-context-builder';
import { runPolicyRuntime } from '../public/ens/core/policy-runtime/policy-runtime';
import { evaluateENSControl } from '../public/ens/core/evaluation/evaluation-engine';
import { requirementVerdict } from '../public/ens/core/evaluation/utils/verdict';

declare const process: { exit(code: number): void };

// --- comprobador mínimo ----------------------------------------------------

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle: string = ''
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

const AHORA = new Date('2026-09-16T12:00:00Z');

const hace = (horas: number): string =>
  new Date(AHORA.getTime() - horas * 3600 * 1000).toISOString();

type Valores = Record<string, string | number | boolean | string[]>;

const configuracion = (valores: Valores): ENSControlConfiguration => ({
  ...opAcc5Configuration,
  parameters: opAcc5Configuration.parameters.map(parameter =>
    Object.prototype.hasOwnProperty.call(valores, parameter.id)
      ? { ...parameter, value: valores[parameter.id] }
      : { ...parameter }
  ),
});

// La configuración COMPLETA de un cliente R2 de nivel MEDIO.
const COMPLETA: Valores = {
  'P-01': 'R2',
  'P-02': ['sede | sede.organismo.es | /var/log/sede/autenticacion.json'],
  'P-03': 5,
  'P-04': 'PR-07 Reactivación de credenciales v1.2',
  'P-05': 90,
  'P-06': 24,
  'P-08': 365,
  'P-09': true,
  'P-ATT': [
    'op.acc.5.1 | Procedimiento de alta de usuarios externos | https://intranet/pr-alta.pdf | 2026-05-12 | RSEG',
    'op.acc.5.2 | Acuse de recibo de credenciales | https://intranet/acuse.pdf | 2026-05-12 | RSEG',
    'op.acc.5.3 | Entrega bajo control exclusivo | https://intranet/entrega.pdf | 2026-05-12 | RSEG',
    'op.acc.5.9 | Aviso de derechos tras el acceso | https://intranet/aviso.png | 2026-05-12 | RSEG',
    'op.acc.5.r5.2 | Captura del aviso de último acceso | https://intranet/ultimo.png | 2026-05-12 | RSEG',
  ],
};

const sin = (valores: Valores, ...ids: string[]): Valores => {
  const copia = { ...valores };
  ids.forEach(id => delete copia[id]);

  return copia;
};

let secuencia = 0;

const hecho = (
  eventType: string,
  evidenceId: string | undefined,
  attributes: Record<string, unknown>,
  horas = 1
): ENSNormalizedEvent => ({
  id: `ev-${++secuencia}`,
  controlId: 'op.acc.5',
  evidenceId,
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp: hace(horas),
  agentId: '001',
  agentName: 'portal-01',
  attributes,
});

const latido = (cubiertas: string, horas = 1) =>
  hecho('collector_run', undefined, {
    resultado: 'completada',
    evidencias_cubiertas: cubiertas,
  }, horas);

// Lo que emite un servicio R2 sano durante una pasada.
const SANO: ENSNormalizedEvent[] = [
  hecho('access_log_source', 'EV-01', { servicio: 'sede', dias_conservados: 400 }),
  hecho('lockout_policy', 'EV-02', { servicio: 'sede', bloqueo: 'activado', intentos: 5, reactivacion: 'intervencion' }),
  hecho('failed_attempt_streak', 'EV-02', { servicio: 'sede', usuario: 'eve', intentos: 3, bloqueo_registrado: 'no' }),
  hecho('credential_age', 'EV-04', { servicio: 'sede', usuario: 'ana', dias_desde_cambio: 30 }),
  hecho('credential_disable_delay', 'EV-05', { servicio: 'sede', usuario: 'bob', motivo: 'compromiso', horas: 4 }),
  hecho('external_auth_success', 'EV-07', { servicio: 'sede', usuario: 'ana', refuerzo: 'R2' }),
  hecho('external_auth_success', 'EV-01', { servicio: 'sede', usuario: 'ana', refuerzo: 'R2' }),
  latido('EV-03,EV-06,EV-09'),
];

const evalua = (
  nivel: ENSLevel,
  valores: Valores,
  eventos: ENSNormalizedEvent[]
) => {
  const configuration = configuracion(valores);

  const evidences = resolveEvidenceForControl(
    'op.acc.5',
    eventos,
    undefined,
    nivel,
    configuration,
    AHORA
  );

  const runtime = runPolicyRuntime(
    buildPolicyContext(
      opAcc5CatalogDefinition,
      configuration,
      nivel,
      eventos,
      evidences,
      AHORA
    )
  );

  return evaluateENSControl(
    opAcc5CatalogDefinition,
    configuration,
    nivel,
    evidences,
    runtime,
    eventos
  );
};

type Resultado = ReturnType<typeof evalua>;

const req = (resultado: Resultado, id: string) => {
  const encontrado = resultado.requirements.find(item => item.id === id);

  if (!encontrado) {
    throw new Error(`fixture rota: ${id}`);
  }

  return encontrado;
};

const veredicto = (resultado: Resultado, id: string) =>
  requirementVerdict(req(resultado, id));

const aplicables = (resultado: Resultado): string[] =>
  resultado.requirements
    .filter(item => requirementVerdict(item) !== 'NO_APLICA')
    .map(item => item.id);

const evidenciaDe = (resultado: Resultado, id: string) =>
  resultado.evidences.find(item => item.id === id);

const REFUERZOS = [
  'op.acc.5.r1.1', 'op.acc.5.r1.2', 'op.acc.5.r2.1',
  'op.acc.5.r3.1', 'op.acc.5.r3.2', 'op.acc.5.r3.3',
  'op.acc.5.r4.1', 'op.acc.5.r4.2', 'op.acc.5.r4.3',
];

// --- 0. el catálogo ------------------------------------------------------------

bloque('0. Catálogo: nueve requisitos documentales y R6/R7 sin niveles');

{
  const documentales = opAcc5CatalogDefinition.requirements
    .filter(item => item.evidenceIds.length === 0)
    .map(item => item.id);

  comprueba(
    'exactamente los nueve documentales van sin evidencia técnica',
    JSON.stringify(documentales) ===
      JSON.stringify([
        'op.acc.5.1', 'op.acc.5.2', 'op.acc.5.3', 'op.acc.5.9',
        'op.acc.5.r3.3', 'op.acc.5.r4.3', 'op.acc.5.r5.2',
        'op.acc.5.r6.1', 'op.acc.5.r7.1',
      ]),
    documentales.join(', ')
  );

  comprueba(
    'el control está ACTIVE',
    opAcc5CatalogDefinition.status === 'ACTIVE'
  );
}

// --- 1. el denominador sigue a P-01 --------------------------------------------

bloque('1. Solo cuenta el refuerzo elegido en P-01');

{
  const r2 = evalua('MEDIO', COMPLETA, SANO);

  comprueba(
    'MEDIO + R2: cuentan la base, r2.1 y R5 (12 requisitos)',
    aplicables(r2).length === 12,
    aplicables(r2).join(', ')
  );

  comprueba(
    'MEDIO + R2: r1.*, r3.* y r4.* salen NO_APLICA',
    REFUERZOS.filter(id => id !== 'op.acc.5.r2.1').every(
      id => veredicto(r2, id) === 'NO_APLICA'
    )
  );

  comprueba(
    'MEDIO + R2: R6 y R7 no cuentan en ningún caso',
    veredicto(r2, 'op.acc.5.r6.1') === 'NO_APLICA' &&
      veredicto(r2, 'op.acc.5.r7.1') === 'NO_APLICA'
  );

  const r3 = evalua('MEDIO', { ...COMPLETA, 'P-01': 'R3' }, SANO);

  comprueba(
    'reversión: el MISMO caso con R3 cuenta r3.1, r3.2 y r3.3 (14) y r2.1 sale NO_APLICA',
    aplicables(r3).length === 14 &&
      veredicto(r3, 'op.acc.5.r2.1') === 'NO_APLICA' &&
      ['op.acc.5.r3.1', 'op.acc.5.r3.2', 'op.acc.5.r3.3'].every(
        id => veredicto(r3, id) !== 'NO_APLICA'
      ),
    aplicables(r3).join(', ')
  );

  const sinP01 = evalua('MEDIO', sin(COMPLETA, 'P-01'), SANO);

  comprueba(
    'sin P-01 no se descarta ningún refuerzo: los nueve cuentan, sin demostrar',
    REFUERZOS.every(id => veredicto(sinP01, id) === 'NO_CUMPLE') &&
      REFUERZOS.every(id => req(sinP01, id).evidenced === false),
    REFUERZOS.map(id => `${id}=${veredicto(sinP01, id)}`).join(', ')
  );

  comprueba(
    'y el control no puede salir CUMPLE sin declarar el mecanismo',
    sinP01.status !== 'CUMPLE'
  );
}

// --- 2. R1 en MEDIO y ALTO ------------------------------------------------------

bloque('2. R1 en MEDIO o ALTO incumple sin mirar un log');

{
  for (const nivel of ['MEDIO', 'ALTO'] as ENSLevel[]) {
    const r1 = evalua(nivel, { ...COMPLETA, 'P-01': 'R1' }, []);

    comprueba(
      `${nivel} + R1: r1.1 y r1.2 NO_CUMPLE MEDIDOS, sin ningún evento`,
      ['op.acc.5.r1.1', 'op.acc.5.r1.2'].every(
        id =>
          veredicto(r1, id) === 'NO_CUMPLE' && req(r1, id).evidenced === true
      )
    );

    comprueba(
      `${nivel} + R1: el motivo dice que R1 no es admisible`,
      req(r1, 'op.acc.5.r1.1').observations.some(texto =>
        /R1 \(contraseña sola\).*no figura entre las opciones/.test(texto)
      )
    );

    comprueba(
      `${nivel} + R1: la no conformidad es MEDIDA`,
      r1.nonConformities.some(
        nc => nc.requirementId === 'op.acc.5.r1.1' && nc.origin === 'MEDIDA'
      )
    );

    comprueba(
      `${nivel} + R1: R2, R3 y R4 no cuentan (13 aplicables)`,
      aplicables(r1).length === 13,
      aplicables(r1).join(', ')
    );
  }

  const bajo = evalua('BAJO', { ...COMPLETA, 'P-01': 'R1' }, []);

  comprueba(
    'reversión: BAJO + R1 no es un incumplimiento directo (sin datos: sin demostrar)',
    ['op.acc.5.r1.1', 'op.acc.5.r1.2'].every(
      id => req(bajo, id).evidenced === false
    ) &&
      !req(bajo, 'op.acc.5.r1.1').observations.some(texto =>
        /no figura entre las opciones/.test(texto)
      )
  );

  comprueba(
    'BAJO + R1: R5 no rige y cuentan la base y R1 (11 aplicables)',
    aplicables(bajo).length === 11,
    aplicables(bajo).join(', ')
  );

  const bajoR1Sano = evalua(
    'BAJO',
    { ...COMPLETA, 'P-01': 'R1' },
    [
      ...SANO.filter(event => event.eventType !== 'external_auth_success'),
      hecho('external_auth_success', 'EV-07', { servicio: 'sede', usuario: 'ana', refuerzo: 'R1' }),
      hecho('password_policy', 'EV-02', { servicio: 'sede', complejidad: 'activada', longitud_minima: 12 }),
    ]
  );

  comprueba(
    'BAJO + R1 con contraseña observada y normas de complejidad: r1.1 y r1.2 CUMPLE',
    veredicto(bajoR1Sano, 'op.acc.5.r1.1') === 'CUMPLE' &&
      veredicto(bajoR1Sano, 'op.acc.5.r1.2') === 'CUMPLE',
    `${veredicto(bajoR1Sano, 'op.acc.5.r1.1')} / ${veredicto(bajoR1Sano, 'op.acc.5.r1.2')}`
  );

  const bajoR1SinNormas = evalua(
    'BAJO',
    { ...COMPLETA, 'P-01': 'R1' },
    [
      ...SANO.filter(event => event.eventType !== 'external_auth_success'),
      hecho('external_auth_success', 'EV-07', { servicio: 'sede', usuario: 'ana', refuerzo: 'R1' }),
      hecho('password_policy', 'EV-02', { servicio: 'sede', complejidad: 'desactivada' }),
    ]
  );

  comprueba(
    'reversión: sin normas de complejidad r1.2 NO_CUMPLE medido',
    veredicto(bajoR1SinNormas, 'op.acc.5.r1.2') === 'NO_CUMPLE' &&
      req(bajoR1SinNormas, 'op.acc.5.r1.2').evidenced === true
  );
}

// --- 3. el caso completo sano llega al 100 % -----------------------------------

bloque('3. Un cliente R2 de MEDIO bien configurado y sano cumple entero');

{
  const sano = evalua('MEDIO', COMPLETA, SANO);

  comprueba(
    'MEDIO + R2 sano: CUMPLE al 100 %',
    sano.status === 'CUMPLE' && sano.score === 100,
    `${sano.status} ${sano.score} · ${sano.requirements
      .filter(item => requirementVerdict(item) === 'NO_CUMPLE')
      .map(item => `${item.id}: ${item.observations.slice(-1)[0] || ''}`)
      .join(' | ')}`
  );

  comprueba(
    'EV-07 CUMPLE y no la arrastran a NO_APLICA los refuerzos no elegidos que la comparten',
    evidenciaDe(sano, 'EV-07')?.status === 'CUMPLE',
    evidenciaDe(sano, 'EV-07')?.status
  );

  comprueba(
    'EV-08 (solo R3 y R4) sale NO_APLICA con R2',
    evidenciaDe(sano, 'EV-08')?.status === 'NO_APLICA',
    evidenciaDe(sano, 'EV-08')?.status
  );

  const conR1 = evalua('MEDIO', COMPLETA, [
    ...SANO,
    hecho('external_auth_success', 'EV-07', { servicio: 'sede', usuario: 'luis', refuerzo: 'R1' }),
  ]);

  comprueba(
    'reversión: UNA autenticación sin OTP tumba r2.1 (NO_CUMPLE medido)',
    veredicto(conR1, 'op.acc.5.r2.1') === 'NO_CUMPLE' &&
      req(conR1, 'op.acc.5.r2.1').evidenced === true
  );
}

// --- 4. op.acc.5.8 -------------------------------------------------------------

bloque('4. op.acc.5.8: límite configurado, bloqueo efectivo y reactivación');

{
  const base = (eventos: ENSNormalizedEvent[]) =>
    evalua('MEDIO', COMPLETA, eventos);

  comprueba(
    'política de 5 intentos, P-03=5, rachas de 3 y EV-03 cubierta sin fallos: CUMPLE',
    veredicto(base(SANO), 'op.acc.5.8') === 'CUMPLE'
  );

  const desactivado = base([
    ...SANO.filter(event => event.eventType !== 'lockout_policy'),
    hecho('lockout_policy', 'EV-02', { servicio: 'sede', bloqueo: 'desactivado', reactivacion: 'intervencion' }),
  ]);

  comprueba(
    'bloqueo desactivado: NO_CUMPLE MEDIDO aunque no haya número que comparar',
    veredicto(desactivado, 'op.acc.5.8') === 'NO_CUMPLE' &&
      req(desactivado, 'op.acc.5.8').evidenced === true
  );

  const automatico = base([
    ...SANO.filter(event => event.eventType !== 'lockout_policy'),
    hecho('lockout_policy', 'EV-02', { servicio: 'sede', bloqueo: 'activado', intentos: 5, reactivacion: 'automatica' }),
  ]);

  comprueba(
    'reactivación automática por tiempo: NO_CUMPLE',
    veredicto(automatico, 'op.acc.5.8') === 'NO_CUMPLE'
  );

  const racha = base([
    ...SANO,
    hecho('failed_attempt_streak', 'EV-02', { servicio: 'sede', usuario: 'eve', intentos: 7, bloqueo_registrado: 'si' }),
  ]);

  comprueba(
    'una racha de 7 con P-03=5: NO_CUMPLE',
    veredicto(racha, 'op.acc.5.8') === 'NO_CUMPLE'
  );

  const sinLatido = base(SANO.filter(event => event.eventType !== 'collector_run'));

  comprueba(
    'sin latido, el silencio de EV-03 no vale: sin demostrar',
    veredicto(sinLatido, 'op.acc.5.8') === 'NO_CUMPLE' &&
      req(sinLatido, 'op.acc.5.8').evidenced === false
  );

  const sinPolitica = base(SANO.filter(event => event.eventType !== 'lockout_policy'));

  comprueba(
    'solo rachas pequeñas y ninguna política: sin demostrar (cero fallos no prueban un límite)',
    veredicto(sinPolitica, 'op.acc.5.8') === 'NO_CUMPLE' &&
      req(sinPolitica, 'op.acc.5.8').evidenced === false
  );

  const noDeclarada = base([
    ...SANO.filter(event => event.eventType !== 'lockout_policy'),
    hecho('lockout_policy', 'EV-02', { servicio: 'sede', bloqueo: 'no_declarado', reactivacion: 'desconocida' }),
  ]);

  comprueba(
    'política no declarada (lo que emite el agente): la EVIDENCIA EV-02 tampoco sale en verde',
    evidenciaDe(noDeclarada, 'EV-02')?.status === 'NO_EVALUABLE',
    evidenciaDe(noDeclarada, 'EV-02')?.status
  );

  const sinP04 = evalua('MEDIO', sin(COMPLETA, 'P-04'), SANO);

  comprueba(
    'sin P-04 (procedimiento de reactivación) no hay CUMPLE',
    veredicto(sinP04, 'op.acc.5.8') !== 'CUMPLE'
  );
}

// --- 5. P-09 y el aviso del último acceso ----------------------------------------

bloque('5. op.acc.5.r5.2: P-09 declara, P-ATT acredita');

{
  const noAvisa = evalua('MEDIO', { ...COMPLETA, 'P-09': false, 'P-ATT': (COMPLETA['P-ATT'] as string[]).filter(fila => !fila.startsWith('op.acc.5.r5.2')) }, SANO);

  comprueba(
    'P-09 = no: NO_CUMPLE medido',
    veredicto(noAvisa, 'op.acc.5.r5.2') === 'NO_CUMPLE' &&
      req(noAvisa, 'op.acc.5.r5.2').evidenced === true
  );

  const siSinDocumento = evalua('MEDIO', { ...COMPLETA, 'P-ATT': (COMPLETA['P-ATT'] as string[]).filter(fila => !fila.startsWith('op.acc.5.r5.2')) }, SANO);

  comprueba(
    'P-09 = sí sin documento: sin demostrar',
    veredicto(siSinDocumento, 'op.acc.5.r5.2') === 'NO_CUMPLE' &&
      req(siSinDocumento, 'op.acc.5.r5.2').evidenced === false
  );

  const conDocumento = evalua('MEDIO', COMPLETA, SANO);

  comprueba(
    'reversión: con la fila en P-ATT, acreditado documentalmente',
    veredicto(conDocumento, 'op.acc.5.r5.2') === 'CUMPLE' &&
      req(conDocumento, 'op.acc.5.r5.2').attested === true
  );
}

// --- 6. EV-06 y EV-09 contra P-02 ---------------------------------------------

bloque('6. EV-06 y EV-09: hallazgos en servicios de P-02');

{
  const revela = evalua('MEDIO', COMPLETA, [
    ...SANO,
    hecho('auth_error_verbose', 'EV-06', { servicio: 'sede', patron: 'usuario_inexistente', mensaje: 'El usuario no existe' }),
  ]);

  comprueba(
    'un rechazo revelador en «sede» (declarado en P-02): EV-06 y op.acc.5.7 NO_CUMPLE',
    evidenciaDe(revela, 'EV-06')?.status === 'NO_CUMPLE' &&
      veredicto(revela, 'op.acc.5.7') === 'NO_CUMPLE'
  );

  const fuera = evalua('MEDIO', COMPLETA, [
    ...SANO,
    hecho('auth_error_verbose', 'EV-06', { servicio: 'intranet', patron: 'usuario_inexistente', mensaje: 'El usuario no existe' }),
  ]);

  comprueba(
    'reversión: el mismo hallazgo en un servicio fuera de P-02 no cuenta',
    evidenciaDe(fuera, 'EV-06')?.status === 'CUMPLE'
  );

  const laguna = evalua('MEDIO', COMPLETA, [
    ...SANO,
    hecho('access_log_gap', 'EV-09', { servicio: 'sede', tipo: 'truncado_sin_rotacion' }),
  ]);

  comprueba(
    'una laguna en «sede»: op.acc.5.r5.1 NO_CUMPLE',
    veredicto(laguna, 'op.acc.5.r5.1') === 'NO_CUMPLE'
  );
}

// --- 7. la máquina sin servicio para usuarios externos -------------------------

bloque('7. Sin ningún servicio de acceso externo (wazuh-real y el LDAP hoy)');

{
  // Lo que emite de verdad el recolector en una máquina sin sujeto: inventario,
  // la degradación de las nueve evidencias y el latido sin nada cubierto.
  const degradaciones = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'].map(id =>
    ({
      ...hecho('evidence_state', id, {
        causa: 'CONFIGURATION',
        motivo: 'no hay ningun servicio de acceso externo declarado en OPACC5_SERVICIOS',
      }),
      status: 'NO_EVALUABLE',
    })
  );

  const vacio = [
    hecho('listening_service', undefined, { proceso: 'sshd', direccion: '0.0.0.0', puerto: 22121 }),
    ...degradaciones,
    latido(''),
  ];

  const resultado = evalua('MEDIO', sin({ ...COMPLETA, 'P-01': 'R2' }, 'P-02'), vacio);

  const tecnicos = resultado.requirements.filter(
    item =>
      requirementVerdict(item) !== 'NO_APLICA' &&
      (item.evidenceIds || []).length > 0
  );

  comprueba(
    'ningún requisito técnico sale CUMPLE: no hay sujeto que medir',
    tecnicos.every(item => requirementVerdict(item) === 'NO_CUMPLE'),
    tecnicos.map(item => `${item.id}=${requirementVerdict(item)}`).join(', ')
  );

  comprueba(
    'y ninguno como incumplimiento MEDIDO: todos sin demostrar',
    tecnicos.every(item => item.evidenced === false)
  );

  comprueba(
    'la no conformidad de configuración nombra P-02',
    resultado.nonConformities.some(
      nc => nc.id === 'NC-CFG' && nc.parameterIds.includes('P-02')
    )
  );

  comprueba(
    'las evidencias quedan NO_EVALUABLE, ninguna en verde ni en rojo',
    resultado.evidences
      .filter(evidence => evidence.status !== 'NO_APLICA')
      .every(evidence => evidence.status === 'NO_EVALUABLE'),
    resultado.evidences.map(evidence => `${evidence.id}=${evidence.status}`).join(', ')
  );

  comprueba(
    'reversión: lo documental atestado sigue acreditado aunque no haya servicio',
    veredicto(resultado, 'op.acc.5.1') === 'CUMPLE' &&
      req(resultado, 'op.acc.5.1').attested === true
  );

  comprueba(
    'el control sale PARCIAL, nunca CUMPLE',
    resultado.status === 'PARCIAL',
    `${resultado.status} ${resultado.score}`
  );
}

console.log(
  fallos.length
    ? `\n${fallos.length} comprobación(es) FALLAN`
    : '\ntodas las comprobaciones pasan'
);

process.exit(fallos.length ? 1 : 0);
