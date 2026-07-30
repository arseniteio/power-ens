/**
 * Pruebas de las primitivas de juicio del motor (T1.2).
 *
 *     ~/.bun/bin/bun run tests/evidence-judgment.test.ts
 *
 * Este repo no compila por sí solo (no hay package.json ni tsconfig), así que la
 * prueba no depende de ninguna infraestructura: es TypeScript suelto con su
 * propio comprobador, al modo de `config/test_inject_control.py`. Hace falta un
 * runtime que ejecute TypeScript resolviendo imports sin extensión, que es como
 * importa el resto del plugin: `bun` lo hace (probado con 1.3.14).
 *
 * Lo que se prueba es el principio rector: la ausencia de un dato no puede
 * producir una afirmación, ni en verde ni en rojo. Los cuatro casos de cada
 * primitiva son hecho+parámetro, hecho sin parámetro, parámetro sin hecho y
 * ninguno de los dos.
 */
import {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../dashboard/ens/configuration/types';
import { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';
import { consolidateAgentComplianceResults } from '../dashboard/ens/core/compliance-state/consolidation';
import { ENSEvidenceCatalog } from '../dashboard/ens/core/evidence/catalog';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
import { buildOpAcc1ReportModel } from '../dashboard/ens/informes/op-acc-1-report-model';
import {
  judgeEvidence,
  parseReferenceList,
  resolveCollectorCoverage,
} from '../dashboard/ens/core/evidence/judgment';
import { getEvidenceDefinitions } from '../dashboard/ens/core/evidence/registry';
import {
  ENSEvidenceBaseFields,
  ENSEvidenceDefinition,
  ENSEvidenceJudgment,
  ENSEvidenceResolved,
} from '../dashboard/ens/core/evidence/types';

// El repo no tiene @types/node y no va a tenerlos: se declara lo único que se
// usa del runtime para que el fichero siga comprobando tipos por sí solo.
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

const bloque = (titulo: string): void =>
  console.log(`\n${titulo}`);

// --- fixtures --------------------------------------------------------------

let contadorEventos = 0;

const evento = (
  eventType: string,
  attributes: Record<string, unknown>,
  extra: Partial<ENSNormalizedEvent> = {}
): ENSNormalizedEvent => ({
  id: `evt-${(contadorEventos += 1)}`,
  controlId: 'op.acc.1',
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-07-30T10:00:00Z',
  ruleId: '106801',
  attributes,
  ...extra,
});

const JUICIO_NINGUNO: ENSEvidenceJudgment = {
  primitive: 'NINGUNO_EN_LISTA',
  parameterId: 'P-04',
  factEventTypes: ['generic_account_login'],
  factField: 'usuario',
};

const JUICIO_TODOS: ENSEvidenceJudgment = {
  primitive: 'TODOS_EN_LISTA',
  parameterId: 'P-04',
  factEventTypes: ['auth_success'],
  factField: 'usuario',
};

const JUICIO_UMBRAL: ENSEvidenceJudgment = {
  primitive: 'UMBRAL_MAXIMO',
  parameterId: 'P-05',
  factEventTypes: ['account_offboarding'],
  factField: 'dias_desde_baja',
};

const definicion = (
  judgment: ENSEvidenceJudgment,
  extra: Partial<ENSEvidenceDefinition> = {}
): ENSEvidenceDefinition => ({
  id: 'EV-XX',
  controlId: 'op.acc.1',
  title: 'Evidencia de prueba',
  description: 'Evidencia de prueba',
  requirements: ['op.acc.1.1'],
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  category: 'ACCESS_CONTROL',
  criticality: 'HIGH',
  sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
  expectedEventTypes: ['evidence_state'],
  relatedRules: ['106801'],
  auditQuestion: '¿Pregunta de auditoría?',
  judgment,
  ...extra,
});

const base = (
  definition: ENSEvidenceDefinition
): ENSEvidenceBaseFields => ({
  id: definition.id,
  controlId: definition.controlId,
  title: definition.title,
  description: definition.description,
  requirements: definition.requirements,
  levels: definition.levels,
  category: definition.category,
  criticality: definition.criticality,
  sourceTypes: definition.sourceTypes,
  expectedEventTypes: definition.expectedEventTypes,
  relatedRules: definition.relatedRules,
  auditQuestion: definition.auditQuestion,
  qualityRequirements: definition.qualityRequirements,
});

const configuracion = (
  parameterId: string,
  value: ENSControlParameter['value'],
  nombre: string = 'cuentas_genericas_prohibidas'
): ENSControlConfiguration => ({
  controlId: 'op.acc.1',
  controlName: 'Identificación',
  family: 'op',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: parameterId,
      controlId: 'op.acc.1',
      name: nombre,
      label: nombre,
      description: '',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.1'],
      type: 'list',
      required: true,
      wazuhUsage: '',
      ensfacilUsage: '',
      evidenceIds: ['EV-XX'],
      ruleIds: ['106801'],
      ifNotConfigured: '',
      value,
    },
  ],
});

const juzga = (
  judgment: ENSEvidenceJudgment,
  eventos: ENSNormalizedEvent[],
  config?: ENSControlConfiguration,
  extra: Partial<ENSEvidenceDefinition> = {},
  ahora?: Date
): ENSEvidenceResolved => {
  const definition = definicion(judgment, extra);

  return judgeEvidence(
    definition,
    judgment,
    base(definition),
    eventos,
    config,
    ahora
  );
};

const motivos = (
  resultado: ENSEvidenceResolved
): string => resultado.observations.join(' | ');

// --- NINGUNO_EN_LISTA ------------------------------------------------------

bloque('NINGUNO_EN_LISTA');

{
  const incumple = juzga(
    JUICIO_NINGUNO,
    [evento('generic_account_login', { usuario: 'admin' })],
    configuracion('P-04', ['admin', 'guest'])
  );

  comprueba(
    'hecho en la lista · NO_CUMPLE',
    incumple.status === 'NO_CUMPLE',
    incumple.status
  );

  comprueba(
    'hecho en la lista · el motivo nombra la cuenta concreta',
    motivos(incumple).includes("'admin'"),
    motivos(incumple)
  );

  comprueba(
    'hecho en la lista · la trazabilidad apunta al evento del hecho',
    incumple.resolvedEventType === 'generic_account_login' &&
      Boolean(incumple.resolvedEventId),
    String(incumple.resolvedEventId)
  );

  const cumple = juzga(
    JUICIO_NINGUNO,
    [evento('generic_account_login', { usuario: 'jgomez' })],
    configuracion('P-04', ['admin', 'guest'])
  );

  comprueba(
    'hecho fuera de la lista · CUMPLE',
    cumple.status === 'CUMPLE',
    cumple.status
  );

  const sinParametro = juzga(
    JUICIO_NINGUNO,
    [evento('generic_account_login', { usuario: 'admin' })],
    undefined
  );

  comprueba(
    'hecho sin parámetro · NO_EVALUABLE, nunca veredicto',
    sinParametro.status === 'NO_EVALUABLE',
    sinParametro.status
  );

  comprueba(
    'hecho sin parámetro · el motivo dice que falta el parámetro',
    motivos(sinParametro).includes('P-04'),
    motivos(sinParametro)
  );

  const parametroVacio = juzga(
    JUICIO_NINGUNO,
    [evento('generic_account_login', { usuario: 'admin' })],
    configuracion('P-04', [])
  );

  comprueba(
    'hecho con parámetro vacío · NO_EVALUABLE',
    parametroVacio.status === 'NO_EVALUABLE',
    parametroVacio.status
  );

  const sinHecho = juzga(
    JUICIO_NINGUNO,
    [],
    configuracion('P-04', ['admin', 'guest'])
  );

  comprueba(
    'parámetro sin hecho · NO_EVALUABLE, NO el falso verde',
    sinHecho.status === 'NO_EVALUABLE',
    sinHecho.status
  );

  comprueba(
    'parámetro sin hecho · el motivo explica por qué no se afirma',
    motivos(sinHecho).includes('ningún hecho observado'),
    motivos(sinHecho)
  );

  const ninguno = juzga(JUICIO_NINGUNO, [], undefined);

  comprueba(
    'ni hecho ni parámetro · NO_EVALUABLE',
    ninguno.status === 'NO_EVALUABLE',
    ninguno.status
  );

  comprueba(
    'ni hecho ni parámetro · el motivo nombra las dos ausencias',
    motivos(ninguno).includes('ningún hecho observado') &&
      motivos(ninguno).includes('P-04'),
    motivos(ninguno)
  );
}

// --- TODOS_EN_LISTA --------------------------------------------------------

bloque('TODOS_EN_LISTA');

{
  const incumple = juzga(
    JUICIO_TODOS,
    [
      evento('auth_success', { usuario: 'jgomez' }),
      evento('auth_success', { usuario: 'intruso' }),
    ],
    configuracion('P-04', ['jgomez', 'mlopez'])
  );

  comprueba(
    'hecho fuera de la lista · NO_CUMPLE',
    incumple.status === 'NO_CUMPLE',
    incumple.status
  );

  comprueba(
    'hecho fuera de la lista · el motivo nombra al que incumple y no al que cumple',
    motivos(incumple).includes("'intruso'") &&
      !motivos(incumple).includes("'jgomez'"),
    motivos(incumple)
  );

  const cumple = juzga(
    JUICIO_TODOS,
    [
      evento('auth_success', { usuario: 'jgomez' }),
      evento('auth_success', { usuario: 'mlopez' }),
    ],
    configuracion('P-04', ['jgomez', 'mlopez'])
  );

  comprueba(
    'todos en la lista · CUMPLE',
    cumple.status === 'CUMPLE',
    cumple.status
  );

  const sinParametro = juzga(
    JUICIO_TODOS,
    [evento('auth_success', { usuario: 'jgomez' })],
    undefined
  );

  comprueba(
    'hecho sin parámetro · NO_EVALUABLE',
    sinParametro.status === 'NO_EVALUABLE',
    sinParametro.status
  );

  const sinHecho = juzga(
    JUICIO_TODOS,
    [],
    configuracion('P-04', ['jgomez'])
  );

  comprueba(
    'parámetro sin hecho · NO_EVALUABLE',
    sinHecho.status === 'NO_EVALUABLE',
    sinHecho.status
  );

  const ninguno = juzga(JUICIO_TODOS, [], undefined);

  comprueba(
    'ni hecho ni parámetro · NO_EVALUABLE',
    ninguno.status === 'NO_EVALUABLE',
    ninguno.status
  );
}

// --- UMBRAL_MAXIMO ---------------------------------------------------------

bloque('UMBRAL_MAXIMO');

{
  const incumple = juzga(
    JUICIO_UMBRAL,
    [
      evento('account_offboarding', { dias_desde_baja: 1 }),
      evento('account_offboarding', { dias_desde_baja: 30 }),
    ],
    configuracion('P-05', 7, 'plazo_max_deshabilitar_dias')
  );

  comprueba(
    'valor por encima del umbral · NO_CUMPLE',
    incumple.status === 'NO_CUMPLE',
    incumple.status
  );

  comprueba(
    'valor por encima del umbral · el motivo nombra el valor concreto',
    motivos(incumple).includes("'30'"),
    motivos(incumple)
  );

  const cumple = juzga(
    JUICIO_UMBRAL,
    [evento('account_offboarding', { dias_desde_baja: 7 })],
    configuracion('P-05', 7, 'plazo_max_deshabilitar_dias')
  );

  comprueba(
    'valor igual al umbral · CUMPLE (no lo supera)',
    cumple.status === 'CUMPLE',
    cumple.status
  );

  const sinParametro = juzga(
    JUICIO_UMBRAL,
    [evento('account_offboarding', { dias_desde_baja: 30 })],
    undefined
  );

  comprueba(
    'hecho sin parámetro · NO_EVALUABLE, ni siquiera con un valor enorme',
    sinParametro.status === 'NO_EVALUABLE',
    sinParametro.status
  );

  const parametroNoNumerico = juzga(
    JUICIO_UMBRAL,
    [evento('account_offboarding', { dias_desde_baja: 30 })],
    configuracion('P-05', 'abc', 'plazo_max_deshabilitar_dias')
  );

  comprueba(
    'parámetro no numérico · NO_EVALUABLE con motivo',
    parametroNoNumerico.status === 'NO_EVALUABLE' &&
      motivos(parametroNoNumerico).includes('P-05'),
    motivos(parametroNoNumerico)
  );

  const sinHecho = juzga(
    JUICIO_UMBRAL,
    [],
    configuracion('P-05', 7, 'plazo_max_deshabilitar_dias')
  );

  comprueba(
    'parámetro sin hecho · NO_EVALUABLE',
    sinHecho.status === 'NO_EVALUABLE',
    sinHecho.status
  );

  const ninguno = juzga(JUICIO_UMBRAL, [], undefined);

  comprueba(
    'ni hecho ni parámetro · NO_EVALUABLE',
    ninguno.status === 'NO_EVALUABLE',
    ninguno.status
  );

  const valorIlegible = juzga(
    JUICIO_UMBRAL,
    [evento('account_offboarding', { dias_desde_baja: 'muchos' })],
    configuracion('P-05', 7, 'plazo_max_deshabilitar_dias')
  );

  comprueba(
    'valor observado no numérico · NO_EVALUABLE, no CUMPLE',
    valorIlegible.status === 'NO_EVALUABLE',
    valorIlegible.status
  );
}

// --- comparación de listas -------------------------------------------------

bloque('Comparación de listas');

{
  const mayusculas = juzga(
    JUICIO_NINGUNO,
    [evento('generic_account_login', { usuario: '  ADMIN ' })],
    configuracion('P-04', ['admin'])
  );

  comprueba(
    'insensible a mayúsculas y con espacios recortados',
    mayusculas.status === 'NO_CUMPLE',
    mayusculas.status
  );

  const cadenaLegacy = juzga(
    JUICIO_NINGUNO,
    [evento('generic_account_login', { usuario: 'test' })],
    configuracion('P-04', 'admin, guest\ntest')
  );

  comprueba(
    'parámetro guardado como cadena · se parte por comas y saltos de línea',
    cadenaLegacy.status === 'NO_CUMPLE',
    cadenaLegacy.status
  );

  comprueba(
    "parseReferenceList · NUNCA parte por '|' (separa campos de un elemento)",
    parseReferenceList('srv-dc01 | Windows').length === 1 &&
      parseReferenceList('srv-dc01 | Windows')[0] ===
        'srv-dc01 | Windows',
    JSON.stringify(parseReferenceList('srv-dc01 | Windows'))
  );

  const listaEnElHecho = juzga(
    JUICIO_NINGUNO,
    [
      evento('generic_account_login', {
        usuario: ['jgomez', 'guest'],
      }),
    ],
    configuracion('P-04', ['admin', 'guest'])
  );

  comprueba(
    'un campo con varios valores cuenta como varios hechos',
    listaEnElHecho.status === 'NO_CUMPLE' &&
      motivos(listaEnElHecho).includes("'guest'"),
    motivos(listaEnElHecho)
  );
}

// --- hechos ilegibles ------------------------------------------------------

bloque('Hechos ilegibles');

{
  const sinCampo = juzga(
    JUICIO_NINGUNO,
    [evento('generic_account_login', { otro_campo: 'x' })],
    configuracion('P-04', ['admin'])
  );

  comprueba(
    'evento de hecho sin el campo · NO_EVALUABLE, no CUMPLE',
    sinCampo.status === 'NO_EVALUABLE',
    sinCampo.status
  );

  const mezcla = juzga(
    JUICIO_NINGUNO,
    [
      evento('generic_account_login', { usuario: 'jgomez' }),
      evento('generic_account_login', { otro_campo: 'x' }),
    ],
    configuracion('P-04', ['admin'])
  );

  comprueba(
    'hecho legible sin incumplir + hecho ilegible · NO_EVALUABLE, lo observado está incompleto',
    mezcla.status === 'NO_EVALUABLE',
    mezcla.status
  );

  const sintetico = juzga(
    JUICIO_NINGUNO,
    [
      evento(
        'generic_account_login',
        { usuario: 'admin' },
        { isSynthetic: true }
      ),
    ],
    configuracion('P-04', ['admin']),
    { qualityRequirements: { rejectSynthetic: true } }
  );

  comprueba(
    'evento sintético con rejectSynthetic · no produce NO_CUMPLE',
    sintetico.status === 'NO_EVALUABLE',
    sintetico.status
  );
}

// --- cobertura del recolector (T1.3) ---------------------------------------
//
// Aquí se decide si el producto miente: sin resolver la cobertura, «cero
// hechos» es indistinguible de «agente apagado».

bloque('Cobertura del recolector (T1.3)');

{
  const AHORA = new Date(
    '2026-07-30T12:00:00Z'
  );

  // Latido tal como lo emite ens_opacc1_collect.sh: `resultado` y la lista
  // blanca `evidencias_cubiertas`.
  const latido = (
    attributes: Record<string, unknown>,
    timestamp: string = '2026-07-30T11:30:00Z'
  ): ENSNormalizedEvent =>
    evento(
      'collector_run',
      attributes,
      { timestamp }
    );

  const latidoSano = () =>
    latido({
      resultado: 'completada',
      evidencias_cubiertas:
        'EV-XX,EV-05,EV-06',
    });

  const cobertura = (
    eventos: ENSNormalizedEvent[]
  ) =>
    resolveCollectorCoverage(
      definicion(JUICIO_NINGUNO),
      JUICIO_NINGUNO,
      eventos,
      AHORA
    );

  comprueba(
    'sin ningún collector_run · DESCONOCIDA',
    cobertura([]).coverage === 'DESCONOCIDA',
    cobertura([]).coverage
  );

  comprueba(
    'latido correcto que declara la evidencia · CONFIRMADA',
    cobertura([latidoSano()]).coverage ===
      'CONFIRMADA',
    cobertura([latidoSano()]).reason
  );

  const conFallo = cobertura([
    latido({
      resultado: 'sin_evidencias',
      evidencias_cubiertas: 'EV-XX',
    }),
  ]);

  comprueba(
    'latido que declara fallo · AUSENTE',
    conFallo.coverage === 'AUSENTE',
    conFallo.reason
  );

  const noCubierta = cobertura([
    latido({
      resultado: 'completada',
      evidencias_cubiertas: 'EV-05,EV-06',
    }),
  ]);

  comprueba(
    'latido correcto que NO declara esta evidencia · AUSENTE',
    noCubierta.coverage === 'AUSENTE',
    noCubierta.reason
  );

  comprueba(
    'latido correcto que no declara esta evidencia · el motivo lo explica',
    noCubierta.reason.includes('EV-XX'),
    noCubierta.reason
  );

  const sinCampoCobertura = cobertura([
    latido({ resultado: 'completada' }),
  ]);

  comprueba(
    'latido de un agente anterior al contrato (sin evidencias_cubiertas) · DESCONOCIDA',
    sinCampoCobertura.coverage ===
      'DESCONOCIDA',
    sinCampoCobertura.reason
  );

  const sinResultado = cobertura([
    latido({
      evidencias_cubiertas: 'EV-XX',
    }),
  ]);

  comprueba(
    'latido que no declara resultado · DESCONOCIDA, CONFIRMADA hay que ganársela',
    sinResultado.coverage === 'DESCONOCIDA',
    sinResultado.reason
  );

  // --- las dos cotas de la ventana ---
  const demasiadoViejo = cobertura([
    latido(
      {
        resultado: 'completada',
        evidencias_cubiertas: 'EV-XX',
      },
      '2026-07-28T11:30:00Z'
    ),
  ]);

  comprueba(
    'cota inferior · un latido de hace dos días no cubre la ventana',
    demasiadoViejo.coverage ===
      'DESCONOCIDA',
    demasiadoViejo.reason
  );

  // El fallo real que ya apareció en revisión de este producto: sin cota
  // superior, un ts absurdo en el futuro valdría como latido perpetuo y
  // dejaría en verde para siempre cualquier aserción negativa aunque el
  // agente llevara meses apagado.
  const enElFuturo = cobertura([
    latido(
      {
        resultado: 'completada',
        evidencias_cubiertas: 'EV-XX',
      },
      '2099-01-01T00:00:00Z'
    ),
  ]);

  comprueba(
    'cota superior · un latido fechado en 2099 NO vale como latido perpetuo',
    enElFuturo.coverage === 'DESCONOCIDA',
    `${enElFuturo.coverage} — ${enElFuturo.reason}`
  );

  comprueba(
    'cota superior · el motivo nombra la fecha futura, no calla el descarte',
    enElFuturo.reason.includes('2099'),
    enElFuturo.reason
  );

  // Tolerancia de reloj: unos minutos de desfase entre máquinas son normales
  // y no pueden tumbar la cobertura.
  const desfaseLeve = cobertura([
    latido(
      {
        resultado: 'completada',
        evidencias_cubiertas: 'EV-XX',
      },
      '2026-07-30T12:02:00Z'
    ),
  ]);

  comprueba(
    'cota superior · dos minutos de desfase de reloj siguen siendo cobertura',
    desfaseLeve.coverage === 'CONFIRMADA',
    desfaseLeve.reason
  );

  // --- el efecto sobre el veredicto ---
  const verde = juzga(
    JUICIO_NINGUNO,
    [latidoSano()],
    configuracion('P-04', ['admin']),
    {},
    AHORA
  );

  comprueba(
    'NINGUNO_EN_LISTA · cobertura CONFIRMADA y cero hechos · CUMPLE',
    verde.status === 'CUMPLE',
    `${verde.status} — ${motivos(verde)}`
  );

  comprueba(
    'CUMPLE por ausencia · el motivo dice sobre qué latido se sostiene',
    motivos(verde).includes(
      'Cobertura del recolector: CONFIRMADA'
    ),
    motivos(verde)
  );

  const gris = juzga(
    JUICIO_NINGUNO,
    [],
    configuracion('P-04', ['admin']),
    {},
    AHORA
  );

  comprueba(
    'NINGUNO_EN_LISTA · sin latido y cero hechos · sigue NO_EVALUABLE',
    gris.status === 'NO_EVALUABLE',
    gris.status
  );

  comprueba(
    'el motivo de «parámetro sin hechos» declara la cobertura del recolector',
    motivos(gris).includes(
      'Cobertura del recolector: DESCONOCIDA'
    ),
    motivos(gris)
  );

  const grisFuturo = juzga(
    JUICIO_NINGUNO,
    [
      latido(
        {
          resultado: 'completada',
          evidencias_cubiertas: 'EV-XX',
        },
        '2099-01-01T00:00:00Z'
      ),
    ],
    configuracion('P-04', ['admin']),
    {},
    AHORA
  );

  comprueba(
    'un latido del futuro NO convierte la ausencia de hechos en CUMPLE',
    grisFuturo.status === 'NO_EVALUABLE',
    `${grisFuturo.status} — ${motivos(grisFuturo)}`
  );

  // Solo la aserción negativa se cumple por ausencia. Una afirmación positiva
  // sobre un sistema del que no se ha observado nada no se acredita ni con la
  // cobertura confirmada: cero copias observadas no es «las copias se hacen».
  const todosSinHechos = juzga(
    JUICIO_TODOS,
    [latidoSano()],
    configuracion('P-04', ['jgomez']),
    {},
    AHORA
  );

  comprueba(
    'TODOS_EN_LISTA · cobertura CONFIRMADA y cero hechos · NO_EVALUABLE, no CUMPLE',
    todosSinHechos.status === 'NO_EVALUABLE',
    `${todosSinHechos.status} — ${motivos(todosSinHechos)}`
  );

  const umbralSinHechos = juzga(
    JUICIO_UMBRAL,
    [latidoSano()],
    configuracion(
      'P-05',
      7,
      'plazo_max_deshabilitar_dias'
    ),
    {},
    AHORA
  );

  comprueba(
    'UMBRAL_MAXIMO · cobertura CONFIRMADA y cero hechos · NO_EVALUABLE, no CUMPLE',
    umbralSinHechos.status === 'NO_EVALUABLE',
    `${umbralSinHechos.status} — ${motivos(umbralSinHechos)}`
  );

  // Con cobertura confirmada pero eventos de hecho ilegibles, lo observado no
  // está vacío: está incompleto. No cabe CUMPLE.
  const cubiertaConIlegible = juzga(
    JUICIO_NINGUNO,
    [
      latidoSano(),
      evento('generic_account_login', {
        otro_campo: 'x',
      }),
    ],
    configuracion('P-04', ['admin']),
    {},
    AHORA
  );

  comprueba(
    'cobertura CONFIRMADA + hechos ilegibles · NO_EVALUABLE, lo observado está incompleto',
    cubiertaConIlegible.status ===
      'NO_EVALUABLE',
    `${cubiertaConIlegible.status} — ${motivos(cubiertaConIlegible)}`
  );
}

// --- integración con resolveEvidenceForControl -----------------------------

bloque('Integración con el motor');

{
  const definiciones = getEvidenceDefinitions('op.acc.1');

  const ev03 = definiciones.find(
    candidato => candidato.id === 'EV-03'
  );

  if (!ev03) {
    comprueba('EV-03 de op.acc.1 existe en el catálogo', false);
  } else {
    comprueba(
      'EV-03 de op.acc.1 declara judgment en el catálogo (T1.3)',
      ev03.judgment?.primitive ===
        'NINGUNO_EN_LISTA' &&
        ev03.judgment?.parameterId === 'P-04',
      JSON.stringify(ev03.judgment)
    );

    comprueba(
      'EV-03 apunta al hecho crudo que emite el agente',
      Boolean(
        ev03.judgment?.factEventTypes.includes(
          'account_authenticated'
        ) &&
          ev03.judgment?.factField === 'usuario'
      ),
      JSON.stringify(ev03.judgment)
    );

    // El evidence_state del agente sigue llegando desde despliegues a medias:
    // tiene que quedar claro que ya no manda.
    const eventos: ENSNormalizedEvent[] = [
      evento(
        'evidence_state',
        {},
        {
          evidenceId: 'EV-03',
          status: 'CUMPLE',
          timestamp: '2026-07-30T11:00:00Z',
        }
      ),
      evento('account_authenticated', {
        usuario: 'admin',
      }),
    ];

    const juzgado = resolveEvidenceForControl(
      'op.acc.1',
      eventos,
      undefined,
      'ALTO',
      configuracion('P-04', ['admin', 'guest'])
    ).find(evidencia => evidencia.id === 'EV-03');

    comprueba(
      'el evidence_state CUMPLE del agente ya no manda sobre EV-03',
      juzgado?.status === 'NO_CUMPLE',
      String(juzgado?.status)
    );

    comprueba(
      'el motivo nombra la cuenta concreta del hecho crudo',
      Boolean(juzgado && motivos(juzgado).includes("'admin'")),
      juzgado ? motivos(juzgado) : ''
    );

    comprueba(
      'la trazabilidad apunta al evento del hecho crudo, no al evidence_state',
      juzgado?.resolvedEventType ===
        'account_authenticated',
      String(juzgado?.resolvedEventType)
    );

    const sinConfiguracion = resolveEvidenceForControl(
      'op.acc.1',
      eventos,
      undefined,
      'ALTO'
    ).find(evidencia => evidencia.id === 'EV-03');

    comprueba(
      'sin configuración · NO_EVALUABLE, ni siquiera con el evidence_state CUMPLE delante',
      sinConfiguracion?.status === 'NO_EVALUABLE',
      String(sinConfiguracion?.status)
    );

    // Migración: un agente sin actualizar sigue emitiendo los nombres viejos, y
    // su `usuario` sigue siendo un hecho utilizable. Lo que se descarta es su
    // `estado`, no el dato.
    const legado = resolveEvidenceForControl(
      'op.acc.1',
      [
        evento(
          'auth_success',
          { usuario: 'guest' },
          { status: 'CUMPLE' }
        ),
      ],
      undefined,
      'ALTO',
      configuracion('P-04', ['admin', 'guest'])
    ).find(evidencia => evidencia.id === 'EV-03');

    comprueba(
      "un 'auth_success' de agente viejo se re-juzga con el P-04 de hoy (decía CUMPLE)",
      legado?.status === 'NO_CUMPLE',
      String(legado?.status)
    );
  }
}

// --- prueba de aceptación de la fase ---------------------------------------
//
// «Cambiar P-04 en la pantalla de Configuración cambia el veredicto de EV-03
// SIN TOCAR EL AGENTE.» Los eventos son literalmente el mismo objeto en las dos
// evaluaciones: lo único distinto es el valor del parámetro.

bloque('Aceptación · P-04 manda sobre EV-03 sin tocar el agente');

{
  // Lo que emite hoy fake/ens_opacc1_fake.sh en los escenarios cumple, mixto y
  // no_evaluable, tal cual.
  const HECHO_DEL_AGENTE: ENSNormalizedEvent[] = [
    evento('account_authenticated', {
      usuario: 'jgomez',
      origen: '10.0.0.12',
    }),
  ];

  const veredicto = (
    p04: string[]
  ): ENSEvidenceResolved | undefined =>
    resolveEvidenceForControl(
      'op.acc.1',
      HECHO_DEL_AGENTE,
      undefined,
      'ALTO',
      configuracion('P-04', p04)
    ).find(
      evidencia => evidencia.id === 'EV-03'
    );

  const conPorDefecto = veredicto([
    'admin',
    'administrador',
    'guest',
    'test',
    'temp',
    'usuario1',
  ]);

  const conJgomezProhibido = veredicto([
    'admin',
    'jgomez',
  ]);

  comprueba(
    'P-04 por defecto · jgomez no está en la lista · CUMPLE',
    conPorDefecto?.status === 'CUMPLE',
    `${conPorDefecto?.status} — ${conPorDefecto ? motivos(conPorDefecto) : ''}`
  );

  comprueba(
    'se añade jgomez a P-04 · MISMO evento del agente · pasa a NO_CUMPLE',
    conJgomezProhibido?.status === 'NO_CUMPLE',
    `${conJgomezProhibido?.status} — ${conJgomezProhibido ? motivos(conJgomezProhibido) : ''}`
  );

  comprueba(
    'el motivo del NO_CUMPLE nombra la cuenta, no dice «algo falló»',
    Boolean(
      conJgomezProhibido &&
        motivos(
          conJgomezProhibido
        ).includes("'jgomez'")
    ),
    conJgomezProhibido
      ? motivos(conJgomezProhibido)
      : ''
  );

  // Y se quita otra vez: el veredicto vuelve. Verificación por reversión sobre
  // el propio parámetro.
  comprueba(
    'se quita jgomez de P-04 · el veredicto vuelve a CUMPLE',
    veredicto(['admin', 'guest'])?.status ===
      'CUMPLE',
    String(veredicto(['admin', 'guest'])?.status)
  );

  // El escenario `incumple` del simulador, con el mismo P-04 por defecto.
  const escenarioIncumple = resolveEvidenceForControl(
    'op.acc.1',
    [
      evento('account_authenticated', {
        usuario: 'admin',
        origen: '10.0.0.55',
      }),
    ],
    undefined,
    'ALTO',
    configuracion('P-04', [
      'admin',
      'administrador',
      'guest',
      'test',
      'temp',
      'usuario1',
    ])
  ).find(evidencia => evidencia.id === 'EV-03');

  comprueba(
    'escenario `incumple` del simulador · NO_CUMPLE con el P-04 por defecto',
    escenarioIncumple?.status === 'NO_CUMPLE',
    String(escenarioIncumple?.status)
  );
}

// --- estado de la migración ------------------------------------------------

bloque('Estado de la migración');

{
  const declaradas = ENSEvidenceCatalog.filter(
    definition => definition.judgment !== undefined
  ).map(
    definition =>
      `${definition.controlId}/${definition.id}`
  );

  // La migración es evidencia a evidencia. Esta prueba es el marcador: cuando
  // se migre la siguiente, hay que actualizarla a conciencia, no de pasada.
  comprueba(
    'solo op.acc.1/EV-03 declara judgment (la migración va evidencia a evidencia)',
    declaradas.length === 1 &&
      declaradas[0] === 'op.acc.1/EV-03',
    declaradas.join(', ') || '(ninguna)'
  );
}

// --- el motivo llega al auditor (T1.5) -------------------------------------
//
// `ENSEvidenceResult` no tenía campo `observations`, así que el motivo de la
// evidencia se descartaba al pasar de la resolución a la evaluación, y los dos
// modelos de informe (que ya lo leían) recibían siempre `[]`. Es preexistente y
// afecta a los tres controles.
//
// La construcción del resultado en `evaluation-engine.ts` no se puede ejercitar
// desde aquí (arrastra `kibana-services`, que vive en el árbol del plugin
// `main`); esa mitad la sostiene el comprobador de tipos: `observations` es
// OBLIGATORIO en `ENSEvidenceResult`, así que cualquier sitio que construya uno
// sin él no compila. Lo que sí se ejercita aquí son los dos tramos siguientes:
// la consolidación entre agentes y el modelo de informe.

bloque('El motivo llega al auditor (T1.5)');

{
  const MOTIVO =
    "Se ha observado 'admin', que figura en la lista del parámetro P-04 (cuentas_genericas_prohibidas).";

  const evidenciaDeResultado = (
    id: string,
    observations: string[]
  ) => ({
    id,
    controlId: 'op.acc.1',
    status: 'NO_CUMPLE' as const,
    description: 'Evidencia de prueba',
    observations,
    requirements: ['op.acc.1.1'],
    levels: ['BAJO' as const],
    category: 'ACCESS_CONTROL' as const,
    criticality: 'HIGH' as const,
    sourceTypes: ['WAZUH_ALERT' as const],
    expectedEventTypes: [
      'account_authenticated',
    ],
    relatedRules: ['106873'],
    auditQuestion: '¿Pregunta?',
  });

  const resultado = (
    observations: string[]
  ) =>
    ({
      control: {
        id: 'op.acc.1',
        name: 'Identificación',
        family: 'op',
        category: 'acc',
        description: '',
      },
      level: 'BAJO',
      status: 'NO_CUMPLE',
      score: 0,
      coverage: 0,
      evaluatedAt: '2026-07-30T12:00:00Z',
      requirements: [],
      parameters: [],
      evidences: [
        evidenciaDeResultado(
          'EV-03',
          observations
        ),
      ],
      missingParameters: [],
      missingEvidences: [],
      relatedRules: [],
      nonConformities: [],
      observations: [],
      traceability: [],
    }) as any;

  // --- tramo 1: informe
  const informe = buildOpAcc1ReportModel(
    resultado([MOTIVO])
  );

  const campoEv03 = informe.fields.find(
    campo =>
      campo.evidenceIds.length === 1 &&
      campo.evidenceIds[0] === 'EV-03'
  );

  comprueba(
    'el informe de op.acc.1 tiene un campo alimentado por EV-03',
    Boolean(campoEv03),
    informe.fields
      .map(campo => campo.id)
      .join(', ')
  );

  comprueba(
    'el motivo de EV-03 llega al informe y nombra la cuenta concreta',
    Boolean(
      campoEv03?.details.some(detalle =>
        detalle.includes("'admin'")
      )
    ),
    JSON.stringify(campoEv03?.details)
  );

  // Verificación por reversión sobre el propio dato: sin motivo en la
  // evidencia, ese detalle NO aparece. El texto buscado es exclusivo del
  // motivo — una prueba que buscara «EV-03» pasaría con y sin la propagación,
  // porque «EV-03» sale igual en el resto del campo.
  const informeSinMotivo = buildOpAcc1ReportModel(
    resultado([])
  );

  const campoSinMotivo =
    informeSinMotivo.fields.find(
      campo => campo.id === campoEv03?.id
    );

  comprueba(
    'sin motivo en la evidencia, el informe no se inventa ninguno',
    !campoSinMotivo?.details.some(detalle =>
      detalle.includes("'admin'")
    ),
    JSON.stringify(campoSinMotivo?.details)
  );

  // --- tramo 2: consolidación entre agentes
  const consolidado =
    consolidateAgentComplianceResults([
      {
        agentId: '001',
        agentName: 'srv-dc01',
        results: [resultado([MOTIVO])],
        summary: [],
      },
      {
        agentId: '002',
        agentName: 'srv-web01',
        results: [
          resultado([
            "Se ha observado 'guest', que figura en la lista del parámetro P-04 (cuentas_genericas_prohibidas).",
          ]),
        ],
        summary: [],
      },
    ] as any);

  const ev03Consolidada = consolidado[0]?.evidences.find(
    evidencia => evidencia.id === 'EV-03'
  );

  comprueba(
    'consolidando dos agentes, el motivo de LOS DOS sobrevive',
    Boolean(
      ev03Consolidada?.observations.some(o =>
        o.includes("'admin'")
      ) &&
        ev03Consolidada?.observations.some(o =>
          o.includes("'guest'")
        )
    ),
    JSON.stringify(
      ev03Consolidada?.observations
    )
  );

  comprueba(
    'cada motivo consolidado dice de qué máquina viene',
    Boolean(
      ev03Consolidada?.observations.every(o =>
        o.startsWith('[srv-')
      )
    ),
    JSON.stringify(
      ev03Consolidada?.observations
    )
  );
}

// --- salida ----------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(
    `${fallos.length} prueba(s) fallidas: ${fallos.join(', ')}`
  );

  process.exit(1);
}

console.log('todas las pruebas pasan');
