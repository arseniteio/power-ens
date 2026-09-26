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
  ENSLevel,
} from '../dashboard/ens/configuration/types';
import { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';
import { normalizeWazuhAlerts } from '../dashboard/ens/core/data-source/data-source-engine';
import { consolidateAgentComplianceResults } from '../dashboard/ens/core/compliance-state/consolidation';
import { ENSEvidenceCatalog } from '../dashboard/ens/core/evidence/catalog';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
import { buildOpAcc1ReportModel } from '../dashboard/ens/reports/op-acc-1-report-model';
import {
  judgeEvidence,
  parseReferenceList,
  parseReferenceRows,
  resolveCollectorCoverage,
  splitRowCells,
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

// Constructor libre de parámetros, para las primitivas nuevas: hacen falta
// tablas con columnas, duraciones en horas y en días, y dos parámetros en la
// misma configuración (umbral y margen).
const parametro = (
  overrides: Partial<ENSControlParameter> & {
    id: string;
  }
): ENSControlParameter => {
  const fusionado = {
    controlId: 'op.acc.1',
    label: '',
    description: '',
    levels: ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[],
    requirements: ['op.acc.1.1'],
    type: 'list' as ENSControlParameter['type'],
    required: true,
    wazuhUsage: '',
    ensfacilUsage: '',
    evidenceIds: ['EV-XX'],
    ruleIds: ['106801'],
    ifNotConfigured: '',
    name: overrides.id,
    ...overrides,
  };

  return {
    ...fusionado,
    name: fusionado.name || fusionado.id,
  };
};

const config = (
  ...parametros: ENSControlParameter[]
): ENSControlConfiguration => ({
  controlId: 'op.acc.1',
  controlName: 'Identificación',
  family: 'op',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: parametros,
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

// --- NINGUNO_FUERA_DE_LISTA ------------------------------------------------
//
// Comparte la comparación EXACTA con TODOS_EN_LISTA. Lo único que cambia es qué
// pasa con el conjunto vacío, y eso es lo que hay que demostrar: si las dos se
// comportaran igual también sin hechos, una de las dos sobraría.

bloque('NINGUNO_FUERA_DE_LISTA');

{
  const AHORA = new Date('2026-08-05T12:00:00Z');

  const JUICIO_BARRIDO: ENSEvidenceJudgment = {
    primitive: 'NINGUNO_FUERA_DE_LISTA',
    parameterId: 'P-10',
    factEventTypes: ['suid_sgid'],
    factField: 'ruta',
  };

  // La misma lista y los mismos hechos para las dos primitivas: lo único que se
  // mueve entre las dos columnas de esta comparación es el nombre de la
  // primitiva.
  const JUICIO_ACREDITA: ENSEvidenceJudgment = {
    ...JUICIO_BARRIDO,
    primitive: 'TODOS_EN_LISTA',
  };

  const BASE_SUID = config(
    parametro({
      id: 'P-10',
      name: 'suid_autorizados',
      value: ['/usr/bin/sudo', '/usr/bin/passwd'],
    })
  );

  const hallazgo = (ruta: string) => [
    evento('suid_sgid', { ruta }),
  ];

  const latidoBarrido = evento(
    'collector_run',
    {
      resultado: 'completada',
      evidencias_cubiertas: 'EV-XX',
    },
    { timestamp: '2026-08-05T11:30:00Z' }
  );

  const dentro = juzga(
    JUICIO_BARRIDO,
    hallazgo('/usr/bin/sudo'),
    BASE_SUID
  );

  comprueba(
    'hallazgo en la línea base · CUMPLE',
    dentro.status === 'CUMPLE',
    `${dentro.status} — ${motivos(dentro)}`
  );

  const fuera = juzga(
    JUICIO_BARRIDO,
    hallazgo('/tmp/puerta-trasera'),
    BASE_SUID
  );

  comprueba(
    'hallazgo fuera de la línea base · NO_CUMPLE',
    fuera.status === 'NO_CUMPLE',
    fuera.status
  );

  comprueba(
    'el motivo nombra el binario concreto, no dice «hay hallazgos»',
    motivos(fuera).includes(
      "'/tmp/puerta-trasera'"
    ),
    motivos(fuera)
  );

  // --- el eje que separa las dos primitivas ---
  //
  // Con hechos, las dos tienen que coincidir SIEMPRE; sin hechos, tienen que
  // discrepar. Cualquier otra cosa significa que una de las dos no hace lo que
  // dice su nombre.
  comprueba(
    'con hechos · NINGUNO_FUERA_DE_LISTA y TODOS_EN_LISTA coinciden (cumpliendo)',
    juzga(
      JUICIO_ACREDITA,
      hallazgo('/usr/bin/sudo'),
      BASE_SUID
    ).status === dentro.status,
    dentro.status
  );

  comprueba(
    'con hechos · NINGUNO_FUERA_DE_LISTA y TODOS_EN_LISTA coinciden (incumpliendo)',
    juzga(
      JUICIO_ACREDITA,
      hallazgo('/tmp/puerta-trasera'),
      BASE_SUID
    ).status === fuera.status,
    fuera.status
  );

  const barridoLimpio = juzga(
    JUICIO_BARRIDO,
    [latidoBarrido],
    BASE_SUID,
    {},
    AHORA
  );

  comprueba(
    'barrido sin hallazgos y cobertura CONFIRMADA · CUMPLE',
    barridoLimpio.status === 'CUMPLE',
    `${barridoLimpio.status} — ${motivos(barridoLimpio)}`
  );

  comprueba(
    'el motivo del barrido limpio dice que se barrió, no que se «miró la lista»',
    motivos(barridoLimpio).includes(
      'el recolector barrió'
    ),
    motivos(barridoLimpio)
  );

  const acreditaSinHechos = juzga(
    JUICIO_ACREDITA,
    [latidoBarrido],
    BASE_SUID,
    {},
    AHORA
  );

  comprueba(
    'MISMO caso con TODOS_EN_LISTA · NO_EVALUABLE (ahí sí discrepan)',
    acreditaSinHechos.status === 'NO_EVALUABLE',
    `${acreditaSinHechos.status} — ${motivos(acreditaSinHechos)}`
  );

  // Sin latido, ni siquiera el barrido cumple: cero hallazgos y agente apagado
  // son indistinguibles.
  const barridoSinLatido = juzga(
    JUICIO_BARRIDO,
    [],
    BASE_SUID,
    {},
    AHORA
  );

  comprueba(
    'barrido sin hallazgos y SIN latido · NO_EVALUABLE, no el falso verde',
    barridoSinLatido.status === 'NO_EVALUABLE',
    barridoSinLatido.status
  );

  const barridoSinParametro = juzga(
    JUICIO_BARRIDO,
    hallazgo('/usr/bin/sudo'),
    undefined
  );

  comprueba(
    'hallazgo sin parámetro · NO_EVALUABLE',
    barridoSinParametro.status ===
      'NO_EVALUABLE',
    barridoSinParametro.status
  );

  const barridoNiNi = juzga(
    JUICIO_BARRIDO,
    [],
    undefined
  );

  comprueba(
    'ni hallazgo ni parámetro · NO_EVALUABLE',
    barridoNiNi.status === 'NO_EVALUABLE',
    barridoNiNi.status
  );
}

// --- mayúsculas: en qué dirección se equivoca el motor ----------------------

bloque(
  'Mayúsculas · lista prohibida frente a lista autorizada'
);

{
  const JUICIO_AUTORIZADOS: ENSEvidenceJudgment = {
    primitive: 'TODOS_EN_LISTA',
    parameterId: 'P-07',
    factEventTypes: ['account_active'],
    factField: 'usuario',
  };

  const LISTA = config(
    parametro({
      id: 'P-07',
      name: 'lista_usuarios_autorizados',
      value: ['jgomez'],
    })
  );

  const exacto = juzga(
    JUICIO_AUTORIZADOS,
    [evento('account_active', { usuario: 'jgomez' })],
    LISTA
  );

  comprueba(
    'lista autorizada · el nombre exacto CUMPLE',
    exacto.status === 'CUMPLE',
    exacto.status
  );

  // Control negativo por reversión sobre UN solo eje: la misma lista, el mismo
  // parámetro, el mismo tipo de evento; solo cambia la caja del nombre.
  const otraCaja = juzga(
    JUICIO_AUTORIZADOS,
    [evento('account_active', { usuario: 'Jgomez' })],
    LISTA
  );

  comprueba(
    "lista autorizada · 'Jgomez' NO pasa por el 'jgomez' autorizado",
    otraCaja.status === 'NO_CUMPLE',
    `${otraCaja.status} — ${motivos(otraCaja)}`
  );

  // Y en la dirección contraria la regla es la opuesta, a propósito: en una
  // lista PROHIBIDA equivocarse produce un NO_CUMPLE de más, nunca un verde.
  const prohibidaOtraCaja = juzga(
    JUICIO_NINGUNO,
    [
      evento('generic_account_login', {
        usuario: 'Admin',
      }),
    ],
    configuracion('P-04', ['admin'])
  );

  comprueba(
    "lista prohibida · 'Admin' SÍ cuenta como la cuenta prohibida 'admin'",
    prohibidaOtraCaja.status === 'NO_CUMPLE',
    prohibidaOtraCaja.status
  );
}

// --- UMBRAL_MINIMO ---------------------------------------------------------

bloque('UMBRAL_MINIMO');

{
  const JUICIO_MINIMO: ENSEvidenceJudgment = {
    primitive: 'UMBRAL_MINIMO',
    parameterId: 'P-06',
    factEventTypes: ['account_deleted'],
    factField: 'dias_retenida',
  };

  const RETENCION = config(
    parametro({
      id: 'P-06',
      name: 'periodo_retencion_cuentas_dias',
      type: 'duration_days',
      value: 365,
    })
  );

  const pronto = juzga(
    JUICIO_MINIMO,
    [
      evento('account_deleted', {
        dias_retenida: 200,
      }),
    ],
    RETENCION
  );

  comprueba(
    'valor por debajo del mínimo · NO_CUMPLE',
    pronto.status === 'NO_CUMPLE',
    pronto.status
  );

  comprueba(
    'el motivo nombra el valor concreto y dice que no llega al mínimo',
    motivos(pronto).includes("'200'") &&
      motivos(pronto).includes('no llega al mínimo'),
    motivos(pronto)
  );

  comprueba(
    'valor igual al mínimo · CUMPLE (no queda por debajo)',
    juzga(
      JUICIO_MINIMO,
      [
        evento('account_deleted', {
          dias_retenida: 365,
        }),
      ],
      RETENCION
    ).status === 'CUMPLE',
    ''
  );

  comprueba(
    'valor por encima del mínimo · CUMPLE',
    juzga(
      JUICIO_MINIMO,
      [
        evento('account_deleted', {
          dias_retenida: 400,
        }),
      ],
      RETENCION
    ).status === 'CUMPLE',
    ''
  );

  // Control negativo de un solo eje: MISMO hecho, MISMO parámetro; lo único que
  // cambia es la primitiva, y el veredicto tiene que invertirse. Si no lo
  // hiciera, UMBRAL_MINIMO sería UMBRAL_MAXIMO con otro nombre.
  const mismoHechoComoMaximo = juzga(
    {
      ...JUICIO_MINIMO,
      primitive: 'UMBRAL_MAXIMO',
    },
    [
      evento('account_deleted', {
        dias_retenida: 200,
      }),
    ],
    RETENCION
  );

  comprueba(
    'el MISMO 200 contra el MISMO 365 · UMBRAL_MAXIMO dice CUMPLE y UMBRAL_MINIMO NO_CUMPLE',
    mismoHechoComoMaximo.status === 'CUMPLE' &&
      pronto.status === 'NO_CUMPLE',
    `${mismoHechoComoMaximo.status} / ${pronto.status}`
  );

  comprueba(
    'hecho sin parámetro · NO_EVALUABLE',
    juzga(
      JUICIO_MINIMO,
      [
        evento('account_deleted', {
          dias_retenida: 1,
        }),
      ],
      undefined
    ).status === 'NO_EVALUABLE',
    ''
  );

  comprueba(
    'parámetro sin hecho · NO_EVALUABLE, no CUMPLE',
    juzga(JUICIO_MINIMO, [], RETENCION).status ===
      'NO_EVALUABLE',
    ''
  );

  comprueba(
    'ni hecho ni parámetro · NO_EVALUABLE',
    juzga(JUICIO_MINIMO, [], undefined).status ===
      'NO_EVALUABLE',
    ''
  );

  comprueba(
    'valor observado no numérico · NO_EVALUABLE, no CUMPLE',
    juzga(
      JUICIO_MINIMO,
      [
        evento('account_deleted', {
          dias_retenida: 'muchos',
        }),
      ],
      RETENCION
    ).status === 'NO_EVALUABLE',
    ''
  );
}

// --- ANTIGUEDAD_MAXIMA -----------------------------------------------------

bloque('ANTIGUEDAD_MAXIMA');

{
  const AHORA = new Date('2026-08-05T12:00:00Z');

  const JUICIO_EDAD: ENSEvidenceJudgment = {
    primitive: 'ANTIGUEDAD_MAXIMA',
    parameterId: 'P-01',
    factEventTypes: ['backup_ok'],
    factField: 'fin_copia',
  };

  const FRECUENCIA = config(
    parametro({
      id: 'P-01',
      name: 'frecuencia_backup_horas',
      type: 'duration_hours',
      value: 24,
    })
  );

  const copia = (fin: string) => [
    evento('backup_ok', { fin_copia: fin }),
  ];

  const reciente = juzga(
    JUICIO_EDAD,
    copia('2026-08-05T04:00:00Z'),
    FRECUENCIA,
    {},
    AHORA
  );

  comprueba(
    'copia de hace 8 h con plazo de 24 h · CUMPLE',
    reciente.status === 'CUMPLE',
    `${reciente.status} — ${motivos(reciente)}`
  );

  const vieja = juzga(
    JUICIO_EDAD,
    copia('2026-08-03T04:00:00Z'),
    FRECUENCIA,
    {},
    AHORA
  );

  comprueba(
    'copia de hace 56 h con plazo de 24 h · NO_CUMPLE',
    vieja.status === 'NO_CUMPLE',
    `${vieja.status} — ${motivos(vieja)}`
  );

  comprueba(
    'el motivo dice la antigüedad medida y el plazo',
    motivos(vieja).includes('56.0 h') &&
      motivos(vieja).includes('24 h'),
    motivos(vieja)
  );

  // ÉSTE es el motivo de que la primitiva exista en vez de un UMBRAL_MAXIMO
  // sobre un `horas_desde_la_copia` que traiga el agente: se mide contra el
  // reloj. El hecho no se toca; se adelanta el reloj tres días y el veredicto
  // se cae solo. Un delta precalculado seguiría diciendo lo mismo para siempre.
  const mismaCopiaTresDiasDespues = juzga(
    JUICIO_EDAD,
    copia('2026-08-05T04:00:00Z'),
    FRECUENCIA,
    {},
    new Date('2026-08-08T12:00:00Z')
  );

  comprueba(
    'el MISMO hecho, tres días después · pasa de CUMPLE a NO_CUMPLE sin tocar el agente',
    reciente.status === 'CUMPLE' &&
      mismaCopiaTresDiasDespues.status ===
        'NO_CUMPLE',
    `${reciente.status} -> ${mismaCopiaTresDiasDespues.status}`
  );

  // Existencial: le basta UN hecho reciente. A una primitiva universal la copia
  // vieja le habría producido un incumplimiento.
  const viejaYReciente = juzga(
    JUICIO_EDAD,
    [
      ...copia('2026-08-03T04:00:00Z'),
      ...copia('2026-08-05T04:00:00Z'),
    ],
    FRECUENCIA,
    {},
    AHORA
  );

  comprueba(
    'una copia vieja Y una reciente · CUMPLE (es existencial: le basta una)',
    viejaYReciente.status === 'CUMPLE',
    `${viejaYReciente.status} — ${motivos(viejaYReciente)}`
  );

  comprueba(
    'el veredicto se sostiene sobre la reciente, no sobre la vieja',
    motivos(viejaYReciente).includes(
      '2026-08-05T04:00:00Z'
    ) &&
      !motivos(viejaYReciente).includes(
        '2026-08-03T04:00:00Z'
      ),
    motivos(viejaYReciente)
  );

  // La unidad sale del TIPO del parámetro. El mismo número, con el mismo hecho:
  // 24 días admiten lo que 24 horas no.
  const enDias = juzga(
    JUICIO_EDAD,
    copia('2026-08-03T04:00:00Z'),
    config(
      parametro({
        id: 'P-01',
        name: 'frecuencia_backup_horas',
        type: 'duration_days',
        value: 24,
      })
    ),
    {},
    AHORA
  );

  comprueba(
    'el MISMO 24 como duration_days admite lo que como duration_hours no',
    enDias.status === 'CUMPLE' &&
      vieja.status === 'NO_CUMPLE',
    `${enDias.status} / ${vieja.status}`
  );

  // Guarda: un parámetro que no expresa duración no se interpreta a ojo.
  const sinUnidad = juzga(
    JUICIO_EDAD,
    copia('2026-08-05T04:00:00Z'),
    config(
      parametro({
        id: 'P-01',
        name: 'frecuencia_backup_horas',
        type: 'number',
        value: 24,
      })
    ),
    {},
    AHORA
  );

  comprueba(
    'parámetro sin unidad de tiempo · NO_EVALUABLE con motivo, no se adivinan las horas',
    sinUnidad.status === 'NO_EVALUABLE' &&
      motivos(sinUnidad).includes('plazo'),
    `${sinUnidad.status} — ${motivos(sinUnidad)}`
  );

  // Guarda de la cota superior, la misma que la del latido: sin ella un hecho
  // fechado en 2099 dejaría la evidencia en verde para siempre.
  const delFuturo = juzga(
    JUICIO_EDAD,
    copia('2099-01-01T00:00:00Z'),
    FRECUENCIA,
    {},
    AHORA
  );

  comprueba(
    'copia fechada en 2099 · NO_EVALUABLE, jamás CUMPLE',
    delFuturo.status === 'NO_EVALUABLE',
    `${delFuturo.status} — ${motivos(delFuturo)}`
  );

  comprueba(
    'marca de tiempo ilegible · NO_EVALUABLE, no CUMPLE',
    juzga(
      JUICIO_EDAD,
      copia('anteayer por la tarde'),
      FRECUENCIA,
      {},
      AHORA
    ).status === 'NO_EVALUABLE',
    ''
  );

  comprueba(
    'hecho sin parámetro · NO_EVALUABLE',
    juzga(
      JUICIO_EDAD,
      copia('2026-08-05T04:00:00Z'),
      undefined,
      {},
      AHORA
    ).status === 'NO_EVALUABLE',
    ''
  );

  comprueba(
    'parámetro sin hecho · NO_EVALUABLE aunque la cobertura esté confirmada',
    juzga(
      JUICIO_EDAD,
      [
        evento(
          'collector_run',
          {
            resultado: 'completada',
            evidencias_cubiertas: 'EV-XX',
          },
          { timestamp: '2026-08-05T11:30:00Z' }
        ),
      ],
      FRECUENCIA,
      {},
      AHORA
    ).status === 'NO_EVALUABLE',
    ''
  );

  comprueba(
    'ni hecho ni parámetro · NO_EVALUABLE',
    juzga(
      JUICIO_EDAD,
      [],
      undefined,
      {},
      AHORA
    ).status === 'NO_EVALUABLE',
    ''
  );

  // --- el margen de tolerancia (P-02 sobre P-01) ---
  const JUICIO_CON_MARGEN: ENSEvidenceJudgment = {
    ...JUICIO_EDAD,
    toleranceParameterId: 'P-02',
  };

  const COPIA_DE_26H = copia(
    '2026-08-04T10:00:00Z'
  );

  const sinMargen = juzga(
    JUICIO_CON_MARGEN,
    COPIA_DE_26H,
    FRECUENCIA,
    {},
    AHORA
  );

  comprueba(
    'margen declarado pero no configurado · se aplica SIN margen (extremo estricto)',
    sinMargen.status === 'NO_CUMPLE',
    `${sinMargen.status} — ${motivos(sinMargen)}`
  );

  const conMargen = juzga(
    JUICIO_CON_MARGEN,
    COPIA_DE_26H,
    config(
      parametro({
        id: 'P-01',
        name: 'frecuencia_backup_horas',
        type: 'duration_hours',
        value: 24,
      }),
      parametro({
        id: 'P-02',
        name: 'margen_tolerancia_horas',
        type: 'duration_hours',
        required: false,
        value: 4,
      })
    ),
    {},
    AHORA
  );

  comprueba(
    'el MISMO hecho con P-02 = 4 h · pasa a CUMPLE (el margen se suma)',
    conMargen.status === 'CUMPLE',
    `${conMargen.status} — ${motivos(conMargen)}`
  );

  comprueba(
    'el motivo nombra el margen que se ha aplicado',
    motivos(conMargen).includes('P-02'),
    motivos(conMargen)
  );

  const margenIlegible = juzga(
    JUICIO_CON_MARGEN,
    COPIA_DE_26H,
    config(
      parametro({
        id: 'P-01',
        name: 'frecuencia_backup_horas',
        type: 'duration_hours',
        value: 24,
      }),
      parametro({
        id: 'P-02',
        name: 'margen_tolerancia_horas',
        type: 'duration_hours',
        required: false,
        value: 'un poco',
      })
    ),
    {},
    AHORA
  );

  comprueba(
    'margen configurado pero ilegible · NO_EVALUABLE, no se da por ausente',
    margenIlegible.status === 'NO_EVALUABLE',
    `${margenIlegible.status} — ${motivos(margenIlegible)}`
  );

  // Guarda de catálogo: un margen sobre una primitiva que no compara números no
  // se ignora en silencio.
  const margenDondeNoPinta = juzga(
    {
      ...JUICIO_NINGUNO,
      toleranceParameterId: 'P-02',
    },
    [
      evento('generic_account_login', {
        usuario: 'jgomez',
      }),
    ],
    configuracion('P-04', ['admin'])
  );

  comprueba(
    'margen declarado sobre una primitiva de lista · NO_EVALUABLE con motivo',
    margenDondeNoPinta.status ===
      'NO_EVALUABLE' &&
      motivos(margenDondeNoPinta).includes(
        'margen'
      ),
    `${margenDondeNoPinta.status} — ${motivos(margenDondeNoPinta)}`
  );
}

// --- La columna del parámetro (el aviso de `parseReferenceList`) ------------
//
// P-07 de op.acc.1 es una TABLA `usuario | sistema | rol`. Hasta ahora
// `parseReferenceList` devolvía la fila entera, y no chocaba solo porque la
// única evidencia migrada apunta a un `list`.

bloque(
  'La columna del parámetro · tablas comparadas contra un valor suelto'
);

{
  const P07 = (valor: string[]) =>
    config(
      parametro({
        id: 'P-07',
        name: 'lista_usuarios_autorizados',
        type: 'table',
        value: valor,
        columns: [
          {
            name: 'usuario',
            label: 'Usuario',
            type: 'identifier',
            required: true,
          },
          {
            name: 'sistema',
            label: 'Sistema',
            type: 'string',
            required: false,
          },
          {
            name: 'rol',
            label: 'Rol',
            type: 'string',
            required: false,
          },
        ],
      })
    );

  const FILAS = [
    'jgomez | srv01 | ops',
    'mlopez | srv02 | auditor',
  ];

  const CUENTA_ACTIVA = [
    evento('account_active', {
      usuario: 'jgomez',
    }),
  ];

  const JUICIO_P07: ENSEvidenceJudgment = {
    primitive: 'TODOS_EN_LISTA',
    parameterId: 'P-07',
    factEventTypes: ['account_active'],
    factField: 'usuario',
    parameterColumn: 'usuario',
  };

  // La trampa, demostrada sobre la función misma: lo que devolvía antes NO es
  // el nombre de la cuenta.
  comprueba(
    'la trampa · parseReferenceList sobre una fila devuelve la fila entera',
    parseReferenceList(FILAS)[0] ===
      'jgomez | srv01 | ops',
    JSON.stringify(parseReferenceList(FILAS))
  );

  const proyectada = juzga(
    JUICIO_P07,
    CUENTA_ACTIVA,
    P07(FILAS)
  );

  comprueba(
    "declarando la columna 'usuario' · la cuenta autorizada CUMPLE",
    proyectada.status === 'CUMPLE',
    `${proyectada.status} — ${motivos(proyectada)}`
  );

  // Control negativo por reversión, sobre UN solo eje: los mismos hechos, la
  // misma tabla, la misma primitiva; solo se quita `parameterColumn`. El texto
  // buscado ('parameterColumn') no aparece en ningún motivo del camino normal.
  const sinDeclararColumna = juzga(
    { ...JUICIO_P07, parameterColumn: undefined },
    CUENTA_ACTIVA,
    P07(FILAS)
  );

  comprueba(
    'sin declarar la columna · NO_EVALUABLE, y NUNCA un veredicto sobre la fila entera',
    sinDeclararColumna.status ===
      'NO_EVALUABLE',
    `${sinDeclararColumna.status} — ${motivos(sinDeclararColumna)}`
  );

  comprueba(
    'sin declarar la columna · el motivo dice exactamente qué falta',
    motivos(sinDeclararColumna).includes(
      'parameterColumn'
    ),
    motivos(sinDeclararColumna)
  );

  comprueba(
    'y ese texto NO sale por el camino normal (control negativo del propio motivo)',
    !motivos(proyectada).includes(
      'parameterColumn'
    ),
    motivos(proyectada)
  );

  // La mutación se aplica donde creo: si se proyectara «cualquier celda» en vez
  // de la declarada, esto también casaría. Declarando la columna 'rol', el
  // usuario 'jgomez' no está en ella y el veredicto se invierte.
  const columnaEquivocada = juzga(
    { ...JUICIO_P07, parameterColumn: 'rol' },
    CUENTA_ACTIVA,
    P07(FILAS)
  );

  comprueba(
    "proyectando la columna 'rol' · 'jgomez' no figura en ella · NO_CUMPLE",
    columnaEquivocada.status === 'NO_CUMPLE',
    `${columnaEquivocada.status} — ${motivos(columnaEquivocada)}`
  );

  const columnaInexistente = juzga(
    { ...JUICIO_P07, parameterColumn: 'usuarios' },
    CUENTA_ACTIVA,
    P07(FILAS)
  );

  comprueba(
    'columna declarada que la tabla no tiene · NO_EVALUABLE con motivo',
    columnaInexistente.status ===
      'NO_EVALUABLE' &&
      motivos(columnaInexistente).includes(
        "'usuarios'"
      ),
    `${columnaInexistente.status} — ${motivos(columnaInexistente)}`
  );

  const tablaSinColumnas = juzga(
    JUICIO_P07,
    CUENTA_ACTIVA,
    config(
      parametro({
        id: 'P-07',
        name: 'lista_usuarios_autorizados',
        type: 'table',
        value: FILAS,
      })
    )
  );

  comprueba(
    'bloque sembrado antes de que existieran las columnas · NO_EVALUABLE, no se adivina la posición',
    tablaSinColumnas.status === 'NO_EVALUABLE',
    `${tablaSinColumnas.status} — ${motivos(tablaSinColumnas)}`
  );

  // Una lista de UNA columna sigue leyéndose plana: es la tolerancia de los
  // valores heredados, y es por donde entra P-04 de la evidencia ya migrada.
  const listaDeUnaColumna = juzga(
    {
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-10',
      factEventTypes: ['suid_sgid'],
      factField: 'ruta',
    },
    [evento('suid_sgid', { ruta: '/usr/bin/sudo' })],
    config(
      parametro({
        id: 'P-10',
        name: 'suid_autorizados',
        value: ['/usr/bin/sudo'],
        columns: [
          {
            name: 'ruta',
            label: 'Binario autorizado',
            type: 'path',
            required: true,
          },
        ],
      })
    )
  );

  comprueba(
    'lista de UNA columna · se sigue leyendo plana, sin declarar nada',
    listaDeUnaColumna.status === 'CUMPLE',
    `${listaDeUnaColumna.status} — ${motivos(listaDeUnaColumna)}`
  );

  // Filas guardadas como cadena (bloque sembrado a mano): se parten por saltos
  // de línea y NUNCA por comas, que dentro de una celda multiselect significan
  // otra cosa.
  comprueba(
    'parseReferenceRows · parte por saltos de línea y no por comas',
    parseReferenceRows(
      'ops | /srv/datos | lectura,escritura\nauditor | /srv/datos | lectura'
    ).length === 2,
    JSON.stringify(
      parseReferenceRows(
        'ops | /srv/datos | lectura,escritura\nauditor | /srv/datos | lectura'
      )
    )
  );

  comprueba(
    'splitRowCells · reparte la fila entre las columnas declaradas',
    splitRowCells('jgomez | srv01 | ops', [
      {
        name: 'usuario',
        label: '',
        type: 'identifier',
        required: true,
      },
      {
        name: 'sistema',
        label: '',
        type: 'string',
        required: false,
      },
      {
        name: 'rol',
        label: '',
        type: 'string',
        required: false,
      },
    ]).rol === 'ops',
    ''
  );

  comprueba(
    'splitRowCells · una fila corta deja vacías las columnas que no trae',
    splitRowCells('jgomez', [
      {
        name: 'usuario',
        label: '',
        type: 'identifier',
        required: true,
      },
      {
        name: 'sistema',
        label: '',
        type: 'string',
        required: false,
      },
    ]).sistema === '',
    ''
  );
}

// --- CONFORME_A_TABLA ------------------------------------------------------
//
// La ACL declarada de op.acc.2 (P-08): `recurso | modo | propietario:grupo |
// ACL`. Es la primitiva de op.acc.2.2 — «los derechos de acceso siguen la
// decisión del responsable del recurso».

bloque('CONFORME_A_TABLA');

{
  const AHORA = new Date('2026-08-05T12:00:00Z');

  const COLUMNAS_P08 = [
    {
      name: 'recurso',
      label: 'Recurso',
      type: 'path' as const,
      required: true,
    },
    {
      name: 'modo',
      label: 'Modo',
      type: 'octal' as const,
      required: true,
    },
    {
      name: 'propietario_grupo',
      label: 'Propietario:grupo',
      type: 'string' as const,
      required: false,
    },
    {
      name: 'acl_esperada',
      label: 'ACL esperada',
      type: 'string' as const,
      required: false,
    },
  ];

  const P08 = (filas: string[]) =>
    config(
      parametro({
        id: 'P-08',
        name: 'acl_declarada',
        type: 'table',
        value: filas,
        columns: COLUMNAS_P08,
      })
    );

  const JUICIO_ACL: ENSEvidenceJudgment = {
    primitive: 'CONFORME_A_TABLA',
    parameterId: 'P-08',
    factEventTypes: ['resource_permissions'],
    factField: '',
    tableKeyColumn: 'recurso',
    factKeyField: 'recurso',
    tableChecks: [
      { column: 'modo', factField: 'modo' },
      {
        column: 'propietario_grupo',
        factField: 'propietario_grupo',
      },
      { column: 'acl_esperada', factField: 'acl' },
    ],
  };

  const medida = (
    attrs: Record<string, unknown>
  ) => [evento('resource_permissions', attrs)];

  const FILA_COMPLETA = [
    '/srv/datos | 750 | root:ops | user:auditor:r-x',
  ];

  const conforme = juzga(
    JUICIO_ACL,
    medida({
      recurso: '/srv/datos',
      modo: '750',
      propietario_grupo: 'root:ops',
      acl: 'user:auditor:r-x',
    }),
    P08(FILA_COMPLETA)
  );

  comprueba(
    'los tres ejes casan con su fila · CUMPLE',
    conforme.status === 'CUMPLE',
    `${conforme.status} — ${motivos(conforme)}`
  );

  const masPermisivo = juzga(
    JUICIO_ACL,
    medida({
      recurso: '/srv/datos',
      modo: '777',
      propietario_grupo: 'root:ops',
      acl: 'user:auditor:r-x',
    }),
    P08(FILA_COMPLETA)
  );

  comprueba(
    'modo más permisivo que el declarado · NO_CUMPLE',
    masPermisivo.status === 'NO_CUMPLE',
    masPermisivo.status
  );

  comprueba(
    'el motivo nombra el recurso, el eje y los dos valores',
    motivos(masPermisivo).includes('/srv/datos') &&
      motivos(masPermisivo).includes("modo='777'") &&
      motivos(masPermisivo).includes("'750'"),
    motivos(masPermisivo)
  );

  comprueba(
    'modo MÁS restrictivo que el declarado · CUMPLE (no crea riesgo)',
    juzga(
      JUICIO_ACL,
      medida({
        recurso: '/srv/datos',
        modo: '700',
        propietario_grupo: 'root:ops',
        acl: 'user:auditor:r-x',
      }),
      P08(FILA_COMPLETA)
    ).status === 'CUMPLE',
    ''
  );

  comprueba(
    "el cero inicial no cambia el modo · '0750' casa con '750'",
    juzga(
      JUICIO_ACL,
      medida({
        recurso: '/srv/datos',
        modo: '0750',
        propietario_grupo: 'root:ops',
        acl: 'user:auditor:r-x',
      }),
      P08(FILA_COMPLETA)
    ).status === 'CUMPLE',
    ''
  );

  comprueba(
    'propietario distinto del declarado · NO_CUMPLE',
    juzga(
      JUICIO_ACL,
      medida({
        recurso: '/srv/datos',
        modo: '750',
        propietario_grupo: 'root:root',
        acl: 'user:auditor:r-x',
      }),
      P08(FILA_COMPLETA)
    ).status === 'NO_CUMPLE',
    ''
  );

  // Control negativo por reversión sobre UN eje: el MISMO hecho que acaba de
  // dar NO_CUMPLE por el propietario, contra la MISMA fila con esa celda
  // vacía. La política no declara ese eje, así que no se juzga.
  const conCeldaVacia = juzga(
    JUICIO_ACL,
    medida({
      recurso: '/srv/datos',
      modo: '750',
      propietario_grupo: 'root:root',
      acl: 'user:auditor:r-x',
    }),
    P08([
      '/srv/datos | 750 |  | user:auditor:r-x',
    ])
  );

  comprueba(
    'celda vacía · ese eje NO se juzga, y el mismo hecho pasa a CUMPLE',
    conCeldaVacia.status === 'CUMPLE',
    `${conCeldaVacia.status} — ${motivos(conCeldaVacia)}`
  );

  // Guarda: una fila que no declara NINGUNO de los ejes contrastados no
  // acredita nada. El recurso está en la política y la política no dice nada
  // de él.
  const filaMuda = juzga(
    { ...JUICIO_ACL, tableChecks: [
      {
        column: 'propietario_grupo',
        factField: 'propietario_grupo',
      },
    ] },
    medida({
      recurso: '/srv/datos',
      propietario_grupo: 'root:ops',
    }),
    P08(['/srv/datos | 750 |  | '])
  );

  comprueba(
    'fila sin ningún eje contrastado declarado · NO_EVALUABLE, no CUMPLE',
    filaMuda.status === 'NO_EVALUABLE',
    `${filaMuda.status} — ${motivos(filaMuda)}`
  );

  // Guarda: recurso observado que la política no declara. NUNCA NO_CUMPLE: el
  // motor no puede afirmar que un modo esté mal si nadie dijo cuál debía ser.
  const sinFila = juzga(
    JUICIO_ACL,
    medida({
      recurso: '/srv/secreto',
      modo: '777',
      propietario_grupo: 'root:root',
      acl: '-',
    }),
    P08(FILA_COMPLETA)
  );

  comprueba(
    'recurso sin fila en la política · NO_EVALUABLE, jamás NO_CUMPLE medido',
    sinFila.status === 'NO_EVALUABLE',
    `${sinFila.status} — ${motivos(sinFila)}`
  );

  comprueba(
    'recurso sin fila · la causa es CONFIGURATION (falta la decisión, no la medida)',
    sinFila.gapCause === 'CONFIGURATION',
    String(sinFila.gapCause)
  );

  // Guarda: la política declara un eje y el hecho no lo trae.
  const ejeNoObservado = juzga(
    JUICIO_ACL,
    medida({
      recurso: '/srv/datos',
      modo: '750',
      propietario_grupo: 'root:ops',
    }),
    P08(FILA_COMPLETA)
  );

  comprueba(
    'la política declara la ACL y el hecho no la trae · NO_EVALUABLE, no CUMPLE',
    ejeNoObservado.status === 'NO_EVALUABLE',
    `${ejeNoObservado.status} — ${motivos(ejeNoObservado)}`
  );

  // Una desviación demostrada manda sobre un recurso sin fila: el hallazgo es
  // un hecho, la fila que falta es un hueco.
  const mezcla = juzga(
    JUICIO_ACL,
    [
      ...medida({
        recurso: '/srv/datos',
        modo: '777',
        propietario_grupo: 'root:ops',
        acl: 'user:auditor:r-x',
      }),
      ...medida({
        recurso: '/srv/secreto',
        modo: '700',
        propietario_grupo: 'root:root',
        acl: '-',
      }),
    ],
    P08(FILA_COMPLETA)
  );

  comprueba(
    'desviación demostrada + recurso sin fila · NO_CUMPLE (el hallazgo manda)',
    mezcla.status === 'NO_CUMPLE',
    `${mezcla.status} — ${motivos(mezcla)}`
  );

  const modoIlegible = juzga(
    JUICIO_ACL,
    medida({
      recurso: '/srv/datos',
      modo: 'rwxr-x---',
      propietario_grupo: 'root:ops',
      acl: 'user:auditor:r-x',
    }),
    P08(FILA_COMPLETA)
  );

  comprueba(
    'modo observado que no es octal · NO_EVALUABLE, no CUMPLE ni NO_CUMPLE',
    modoIlegible.status === 'NO_EVALUABLE',
    `${modoIlegible.status} — ${motivos(modoIlegible)}`
  );

  // Control negativo de la causa: MISMA primitiva y MISMA tabla que el recurso
  // sin fila, y la causa tiene que ser la otra. Aquí la política está completa y
  // lo que no se puede leer es el dato, así que la acción es sobre el agente.
  comprueba(
    'modo ilegible · la causa es EVIDENCE, no CONFIGURATION (la política sí está)',
    modoIlegible.gapCause === 'EVIDENCE',
    String(modoIlegible.gapCause)
  );

  const sinClave = juzga(
    JUICIO_ACL,
    medida({ modo: '750' }),
    P08(FILA_COMPLETA)
  );

  comprueba(
    'hecho sin el campo que identifica su fila · NO_EVALUABLE',
    sinClave.status === 'NO_EVALUABLE',
    `${sinClave.status} — ${motivos(sinClave)}`
  );

  comprueba(
    'hecho sin parámetro · NO_EVALUABLE',
    juzga(
      JUICIO_ACL,
      medida({
        recurso: '/srv/datos',
        modo: '777',
      }),
      undefined
    ).status === 'NO_EVALUABLE',
    ''
  );

  comprueba(
    'tabla sin columnas declaradas · NO_EVALUABLE con motivo',
    juzga(
      JUICIO_ACL,
      medida({
        recurso: '/srv/datos',
        modo: '750',
      }),
      config(
        parametro({
          id: 'P-08',
          name: 'acl_declarada',
          type: 'table',
          value: FILA_COMPLETA,
        })
      )
    ).status === 'NO_EVALUABLE',
    ''
  );

  comprueba(
    'parámetro sin hecho · NO_EVALUABLE aunque la cobertura esté confirmada',
    juzga(
      JUICIO_ACL,
      [
        evento(
          'collector_run',
          {
            resultado: 'completada',
            evidencias_cubiertas: 'EV-XX',
          },
          { timestamp: '2026-08-05T11:30:00Z' }
        ),
      ],
      P08(FILA_COMPLETA),
      {},
      AHORA
    ).status === 'NO_EVALUABLE',
    ''
  );

  comprueba(
    'ni hecho ni parámetro · NO_EVALUABLE',
    juzga(JUICIO_ACL, [], undefined).status ===
      'NO_EVALUABLE',
    ''
  );

  // --- celda multiselect (P-06 de op.acc.2) ---
  //
  // La celda lleva comas dentro. Si las filas se partieran por comas —que es lo
  // que hace `parseReferenceList`—, esta tabla se rompería en pedazos.
  const P06 = config(
    parametro({
      id: 'P-06',
      name: 'tipos_acceso_permitidos_por_perfil',
      type: 'table',
      value: [
        'ops | /srv/datos | lectura,escritura',
      ],
      columns: [
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          name: 'recurso',
          label: 'Recurso',
          type: 'path',
          required: true,
        },
        {
          name: 'tipos_permitidos',
          label: 'Tipos de acceso',
          type: 'multiselect',
          required: true,
          options: [
            'lectura',
            'escritura',
            'ejecucion',
            'modificacion',
          ],
        },
      ],
    })
  );

  const JUICIO_TIPOS: ENSEvidenceJudgment = {
    primitive: 'CONFORME_A_TABLA',
    parameterId: 'P-06',
    factEventTypes: ['object_access'],
    factField: '',
    tableKeyColumn: 'perfil',
    factKeyField: 'perfil',
    tableChecks: [
      {
        column: 'tipos_permitidos',
        factField: 'acceso',
      },
    ],
  };

  comprueba(
    "multiselect · 'escritura' está entre los permitidos · CUMPLE",
    juzga(
      JUICIO_TIPOS,
      [
        evento('object_access', {
          perfil: 'ops',
          acceso: 'escritura',
        }),
      ],
      P06
    ).status === 'CUMPLE',
    ''
  );

  const tipoNoPermitido = juzga(
    JUICIO_TIPOS,
    [
      evento('object_access', {
        perfil: 'ops',
        acceso: 'ejecucion',
      }),
    ],
    P06
  );

  comprueba(
    "multiselect · 'ejecucion' no está entre los permitidos · NO_CUMPLE",
    tipoNoPermitido.status === 'NO_CUMPLE',
    `${tipoNoPermitido.status} — ${motivos(tipoNoPermitido)}`
  );
}

// --- op.acc.1 / EV-05: dos evidencias sobre el MISMO hecho -------------------
//
// EV-05 se migró sin inventar ningún hecho: comparte el `account_authenticated`
// de EV-03 y solo cambia la lista contra la que se contrasta (P-03 en vez de
// P-04). Lo que hay que demostrar no es que la primitiva funcione —eso ya está
// probado arriba— sino que UNA sola alerta produce DOS veredictos
// independientes, que es lo que el modelo clásico no podía hacer sin emitir el
// hecho dos veces.
//
// La prueba entra por la ALERTA CRUDA, no por eventos normalizados a mano: el
// reparto de un `evidence_id` con varias evidencias lo hace
// `normalizeWazuhAlerts`, y si ese reparto se rompiera, una prueba escrita
// sobre eventos ya normalizados seguiría en verde mientras en producción EV-05
// no vería un solo hecho.

bloque('op.acc.1 / EV-05 · dos evidencias sobre el mismo hecho');

{
  const definiciones = getEvidenceDefinitions('op.acc.1');

  const ev05 = definiciones.find(
    candidato => candidato.id === 'EV-05'
  );

  comprueba(
    'EV-05 declara NINGUNO_EN_LISTA contra P-03',
    ev05?.judgment?.primitive ===
      'NINGUNO_EN_LISTA' &&
      ev05?.judgment?.parameterId === 'P-03',
    JSON.stringify(ev05?.judgment)
  );

  comprueba(
    'EV-05 lee el mismo hecho crudo que EV-03',
    Boolean(
      ev05?.judgment?.factEventTypes.includes(
        'account_authenticated'
      ) && ev05?.judgment?.factField === 'usuario'
    ),
    JSON.stringify(ev05?.judgment)
  );

  // La alerta tal como la deja Wazuh a partir de la línea que emite
  // ev03_autenticaciones (lib/opacc1-lib.sh) desde el 04/08.
  const alertaCruda = (
    usuario: string
  ): unknown => ({
    _id: 'alerta-compartida',
    _source: {
      '@timestamp': '2026-07-30T10:00:00Z',
      rule: {
        id: '106873',
        description:
          'op.acc.1 · HECHO (EV-03, EV-05) · Autenticación observada',
      },
      agent: { id: '001', name: 'srv01' },
      data: {
        ensfacil: 'op.acc.1',
        event: 'account_authenticated',
        evidence_id: 'EV-03,EV-05',
        requisito: 'op.acc.1.1,op.acc.1.2',
        usuario,
        origen: '10.0.0.12',
      },
    },
  });

  const repartida = normalizeWazuhAlerts([
    alertaCruda('svc_backup'),
  ]);

  comprueba(
    'la alerta con dos evidencias se reparte en dos eventos normalizados',
    repartida.length === 2 &&
      repartida.some(
        item => item.evidenceId === 'EV-03'
      ) &&
      repartida.some(
        item => item.evidenceId === 'EV-05'
      ),
    repartida
      .map(item => String(item.evidenceId))
      .join(', ')
  );

  // svc_backup NO está en P-04 (genéricas prohibidas) y SÍ en P-03 (cuentas de
  // servicio): el mismo hecho tiene que salir verde en una evidencia y rojo en
  // la otra. Si el motor confundiera los parámetros, o si las dos evidencias
  // compartieran veredicto, este caso lo cazaría; con un usuario que estuviera
  // en las dos listas, o en ninguna, la prueba pasaría sin demostrar nada.
  const dosListas = config(
    parametro({
      id: 'P-03',
      name: 'cuentas_servicio_definidas',
      type: 'list',
      value: ['svc_backup', 'svc_web'],
    }),
    parametro({
      id: 'P-04',
      name: 'cuentas_genericas_prohibidas',
      type: 'list',
      value: ['admin', 'guest'],
    })
  );

  const resueltas = resolveEvidenceForControl(
    'op.acc.1',
    repartida,
    undefined,
    'ALTO',
    dosListas
  );

  const ev03Resuelta = resueltas.find(
    evidencia => evidencia.id === 'EV-03'
  );

  const ev05Resuelta = resueltas.find(
    evidencia => evidencia.id === 'EV-05'
  );

  comprueba(
    'svc_backup no está en P-04 · EV-03 CUMPLE',
    ev03Resuelta?.status === 'CUMPLE',
    `${ev03Resuelta?.status} — ${ev03Resuelta ? motivos(ev03Resuelta) : ''}`
  );

  comprueba(
    'el MISMO hecho está en P-03 · EV-05 NO_CUMPLE',
    ev05Resuelta?.status === 'NO_CUMPLE',
    `${ev05Resuelta?.status} — ${ev05Resuelta ? motivos(ev05Resuelta) : ''}`
  );

  comprueba(
    'el motivo de EV-05 nombra la cuenta de servicio, no dice «algo falló»',
    Boolean(
      ev05Resuelta &&
        motivos(ev05Resuelta).includes(
          "'svc_backup'"
        )
    ),
    ev05Resuelta ? motivos(ev05Resuelta) : ''
  );

  // Reversión sobre el parámetro: se saca svc_backup de P-03 y EV-05 vuelve,
  // con el mismo evento. Es la prueba de aceptación de la migración aplicada a
  // esta evidencia.
  const sinSvcEnP03 = resolveEvidenceForControl(
    'op.acc.1',
    repartida,
    undefined,
    'ALTO',
    config(
      parametro({
        id: 'P-03',
        name: 'cuentas_servicio_definidas',
        type: 'list',
        value: ['svc_web'],
      }),
      parametro({
        id: 'P-04',
        name: 'cuentas_genericas_prohibidas',
        type: 'list',
        value: ['admin', 'guest'],
      })
    )
  ).find(evidencia => evidencia.id === 'EV-05');

  comprueba(
    'se quita svc_backup de P-03 · MISMO evento · EV-05 vuelve a CUMPLE',
    sinSvcEnP03?.status === 'CUMPLE',
    `${sinSvcEnP03?.status} — ${sinSvcEnP03 ? motivos(sinSvcEnP03) : ''}`
  );

  // El nombre viejo se readmite porque `service_account_interactive` e
  // `interactive_login` cubrían entre los dos TODOS los logins. Lo que se
  // descarta del evento viejo es su `estado`, no su `usuario`.
  const legadoEv05 = resolveEvidenceForControl(
    'op.acc.1',
    [
      evento(
        'interactive_login',
        { usuario: 'svc_backup' },
        {
          evidenceId: 'EV-05',
          status: 'CUMPLE',
        }
      ),
    ],
    undefined,
    'ALTO',
    dosListas
  ).find(evidencia => evidencia.id === 'EV-05');

  comprueba(
    "un 'interactive_login' de agente viejo se re-juzga con el P-03 de hoy (decía CUMPLE)",
    legadoEv05?.status === 'NO_CUMPLE',
    String(legadoEv05?.status)
  );
}

// --- op.acc.1 / EV-07: la primera evidencia contra una TABLA -----------------
//
// La lista de usuarios autorizados era un fichero en cada máquina. Ahora es la
// columna 'usuario' de P-07, y el hecho es el `account_active` que EV-01 ya
// emitía por cada cuenta de /etc/passwd.

bloque('op.acc.1 / EV-07 · TODOS_EN_LISTA contra la tabla P-07');

{
  const definiciones = getEvidenceDefinitions('op.acc.1');

  const ev07 = definiciones.find(
    candidato => candidato.id === 'EV-07'
  );

  comprueba(
    'EV-07 declara TODOS_EN_LISTA contra la columna usuario de P-07',
    ev07?.judgment?.primitive ===
      'TODOS_EN_LISTA' &&
      ev07?.judgment?.parameterId === 'P-07' &&
      ev07?.judgment?.parameterColumn === 'usuario',
    JSON.stringify(ev07?.judgment)
  );

  const listaAutorizados = (
    filas: string[]
  ): ENSControlConfiguration =>
    config(
      parametro({
        id: 'P-07',
        name: 'lista_usuarios_autorizados',
        type: 'table',
        columns: [
          { name: 'usuario', type: 'text' },
          { name: 'sistema', type: 'text' },
          { name: 'rol', type: 'text' },
        ],
        value: filas,
      })
    );

  const cuentasActivas = (
    ...usuarios: string[]
  ): ENSNormalizedEvent[] =>
    usuarios.map(usuario =>
      evento(
        'account_active',
        { usuario, uid: 1001, tipo: 'persona' },
        { evidenceId: 'EV-07', status: 'CUMPLE' }
      )
    );

  const conforme = resolveEvidenceForControl(
    'op.acc.1',
    cuentasActivas('jgomez', 'mlopez'),
    undefined,
    'ALTO',
    listaAutorizados([
      'jgomez | srv01 | ops',
      'mlopez | srv01 | dev',
    ])
  ).find(evidencia => evidencia.id === 'EV-07');

  comprueba(
    'las dos cuentas activas figuran en la columna usuario · CUMPLE',
    conforme?.status === 'CUMPLE',
    `${conforme?.status} — ${conforme ? motivos(conforme) : ''}`
  );

  const intrusa = resolveEvidenceForControl(
    'op.acc.1',
    cuentasActivas('jgomez', 'exempleado'),
    undefined,
    'ALTO',
    listaAutorizados([
      'jgomez | srv01 | ops',
      'mlopez | srv01 | dev',
    ])
  ).find(evidencia => evidencia.id === 'EV-07');

  comprueba(
    'una cuenta activa que no figura en la tabla · NO_CUMPLE',
    intrusa?.status === 'NO_CUMPLE',
    `${intrusa?.status} — ${intrusa ? motivos(intrusa) : ''}`
  );

  comprueba(
    'el motivo nombra la cuenta no autorizada',
    Boolean(
      intrusa &&
        motivos(intrusa).includes("'exempleado'")
    ),
    intrusa ? motivos(intrusa) : ''
  );

  // Con `parameterColumn` mal declarada la fila entera se compararía contra
  // 'jgomez' y no casaría jamás: TODA la plantilla saldría no autorizada. Es el
  // fallo que `parameterColumn` existe para impedir, y esta prueba comprueba que
  // la proyección de la columna se aplica de verdad — sin ella, el caso
  // «conforme» de arriba habría salido NO_CUMPLE.
  comprueba(
    'la comparación proyecta la columna, no la fila entera',
    Boolean(
      conforme?.status === 'CUMPLE' &&
        motivos(conforme).includes(
          "la columna 'usuario'"
        )
    ),
    conforme ? motivos(conforme) : ''
  );

  // TODOS_EN_LISTA nunca cumple por ausencia, ni con la cobertura confirmada:
  // «todas las cuentas activas están autorizadas» sobre cero cuentas
  // observadas es cierto en lógica y falso en una auditoría. /etc/passwd
  // siempre rinde cuentas: cero hechos aquí significa que no se leyó.
  const sinCuentas = resolveEvidenceForControl(
    'op.acc.1',
    [
      evento(
        'collector_run',
        {
          resultado: 'completada',
          evidencias_cubiertas:
            'EV-03,EV-05,EV-06,EV-07',
        },
        { timestamp: '2026-07-30T09:59:00Z' }
      ),
    ],
    undefined,
    'ALTO',
    listaAutorizados(['jgomez | srv01 | ops']),
    new Date('2026-07-30T10:00:00Z')
  ).find(evidencia => evidencia.id === 'EV-07');

  comprueba(
    'cero cuentas observadas con cobertura confirmada · NO_EVALUABLE, no CUMPLE',
    sinCuentas?.status === 'NO_EVALUABLE',
    `${sinCuentas?.status} — ${sinCuentas ? motivos(sinCuentas) : ''}`
  );

  // La trampa de esta migración: `unauthorized_user` solo se emitía para las
  // cuentas que FALLABAN. Si el catálogo lo readmitiera como hecho, una máquina
  // con cuarenta cuentas sin mirar saldría CUMPLE en cuanto su única infractora
  // histórica estuviera hoy en P-07.
  const soloInfractorLegado = resolveEvidenceForControl(
    'op.acc.1',
    [
      evento(
        'unauthorized_user',
        { usuario: 'jgomez' },
        {
          evidenceId: 'EV-07',
          status: 'NO_CUMPLE',
        }
      ),
    ],
    undefined,
    'ALTO',
    listaAutorizados(['jgomez | srv01 | ops'])
  ).find(evidencia => evidencia.id === 'EV-07');

  comprueba(
    "un 'unauthorized_user' suelto NO acredita a EV-07 (muestra sesgada)",
    soloInfractorLegado?.status !== 'CUMPLE',
    String(soloInfractorLegado?.status)
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
  //
  // op.acc.4 no aparece aquí por migración sino por NACIMIENTO: entró el 06/08
  // con sus ocho evidencias ya en el modelo nuevo, sin pasar nunca por el
  // clásico. Es la diferencia entre migrar un control y empezarlo bien, y por
  // eso su agente no tiene ni score.py ni watchdog: no hay veredicto que
  // calcular en la máquina.
  const MIGRADAS = [
    'op.acc.1/EV-03',
    'op.acc.1/EV-05',
    'op.acc.1/EV-07',
    'op.acc.4/EV-01',
    'op.acc.4/EV-02',
    'op.acc.4/EV-03',
    'op.acc.4/EV-04',
    'op.acc.4/EV-05',
    'op.acc.4/EV-06',
    'op.acc.4/EV-07',
    'op.acc.4/EV-08',
    // op.exp.1 también nace entero en el modelo nuevo: sus siete evidencias
    // juzgan hechos crudos de su recolector contra P-01, P-02, P-04 y P-07.
    'op.exp.1/EV-01',
    'op.exp.1/EV-02',
    'op.exp.1/EV-03',
    'op.exp.1/EV-04',
    'op.exp.1/EV-05',
    'op.exp.1/EV-06',
    'op.exp.1/EV-07',
    // op.exp.2 también nace en el modelo nuevo. EV-07 no está: no tiene hecho
    // que observar (ver su entrada en el catálogo).
    'op.exp.2/EV-01',
    'op.exp.2/EV-02',
    'op.exp.2/EV-03',
    'op.exp.2/EV-04',
    'op.exp.2/EV-05',
    'op.exp.2/EV-06',
    // op.acc.6 nace también en el modelo nuevo. EV-02, EV-03, EV-04 y EV-11 no
    // llevan `judgment` porque las decide su evaluador de policy.
    'op.acc.6/EV-01',
    'op.acc.6/EV-05',
    'op.acc.6/EV-06',
    'op.acc.6/EV-07',
    'op.acc.6/EV-08',
    'op.acc.6/EV-09',
    'op.acc.6/EV-10',
    'op.acc.6/EV-12',
    // op.acc.5 nace igual que op.acc.4: sus nueve evidencias ya en el modelo
    // nuevo desde el primer día.
    'op.acc.5/EV-01',
    'op.acc.5/EV-02',
    'op.acc.5/EV-03',
    'op.acc.5/EV-04',
    'op.acc.5/EV-05',
    'op.acc.5/EV-06',
    'op.acc.5/EV-07',
    'op.acc.5/EV-08',
    'op.acc.5/EV-09',
    // op.exp.3 también nace en el modelo nuevo: sus seis evidencias con hecho
    // en la máquina declaran `judgment`. Las otras cinco no tienen fuente en el
    // agente y no se juzgan (ver tests/op-exp-3-judgment.test.ts).
    'op.exp.3/EV-02',
    'op.exp.3/EV-03',
    'op.exp.3/EV-04',
    'op.exp.3/EV-08',
    'op.exp.3/EV-09',
    'op.exp.3/EV-11',
    // op.exp.4 también nace en el modelo nuevo. Solo tres de sus evidencias
    // declaran primitiva; las demás las mide su policy, que no cabe en
    // ninguna de las siete (ver `policies/op-exp-4.policy.ts`).
    'op.exp.4/EV-04',
    'op.exp.4/EV-06',
    'op.exp.4/EV-11',
    // op.exp.6 también nace en el modelo nuevo. Solo EV-01 y EV-03 declaran
    // primitiva; las demás las mide su policy (ver `policies/op-exp-6.policy.ts`).
    'op.exp.6/EV-01',
    'op.exp.6/EV-03',
  ];

  comprueba(
    `las migradas son exactamente ${MIGRADAS.join(', ')}`,
    declaradas.length === MIGRADAS.length &&
      MIGRADAS.every(esperada =>
        declaradas.includes(esperada)
      ),
    declaradas.join(', ') || '(ninguna)'
  );

  // Una evidencia migrada no puede seguir escuchando su propio `evidence_state`
  // como hecho: sería el segundo camino de evaluación sobre los mismos datos.
  const conEstadoEntreLosHechos = ENSEvidenceCatalog.filter(
    definition =>
      definition.judgment?.factEventTypes.includes(
        'evidence_state'
      )
  ).map(
    definition =>
      `${definition.controlId}/${definition.id}`
  );

  comprueba(
    'ninguna evidencia migrada lee `evidence_state` como hecho',
    conEstadoEntreLosHechos.length === 0,
    conEstadoEntreLosHechos.join(', ')
  );

  // Toda evidencia que apunte a un parámetro de varias columnas tiene que
  // declarar cuál compara. Sin esto el motor devuelve NO_EVALUABLE con motivo,
  // pero el fallo se descubre en producción en vez de aquí.
  const tablasSinColumna = ENSEvidenceCatalog.filter(
    definition =>
      definition.judgment &&
      definition.judgment.primitive !==
        'CONFORME_A_TABLA' &&
      definition.judgment.parameterId ===
        'P-07' &&
      !definition.judgment.parameterColumn
  ).map(
    definition =>
      `${definition.controlId}/${definition.id}`
  );

  comprueba(
    'ninguna evidencia compara P-07 sin declarar su columna',
    tablasSinColumna.length === 0,
    tablasSinColumna.join(', ')
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
      // Un incumplimiento demostrado: un requisito aplicable, medido, que no
      // conforma. Los tres campos son parte del contrato de
      // `ENSComplianceResult` desde que el motor separa lo medido de lo que no
      // se ha podido medir, y la consolidación los suma entre agentes.
      applicableRequirements: 1,
      measuredRequirements: 1,
      unmeasuredRequirements: [],
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
      measurementGaps: [],
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
