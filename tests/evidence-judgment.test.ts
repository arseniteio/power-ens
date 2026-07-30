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
import { ENSEvidenceCatalog } from '../dashboard/ens/core/evidence/catalog';
import { resolveEvidenceForControl } from '../dashboard/ens/core/evidence/engine';
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
  extra: Partial<ENSEvidenceDefinition> = {}
): ENSEvidenceResolved => {
  const definition = definicion(judgment, extra);

  return judgeEvidence(
    definition,
    judgment,
    base(definition),
    eventos,
    config
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

// --- hueco para collector_run (T1.3) ---------------------------------------

bloque('Hueco previsto para collector_run (T1.3)');

{
  comprueba(
    'resolveCollectorCoverage está enchufado y hoy devuelve DESCONOCIDA',
    resolveCollectorCoverage(
      definicion(JUICIO_NINGUNO),
      []
    ) === 'DESCONOCIDA'
  );

  const sinHecho = juzga(
    JUICIO_NINGUNO,
    [],
    configuracion('P-04', ['admin'])
  );

  comprueba(
    'el motivo de «parámetro sin hechos» declara la cobertura del recolector',
    motivos(sinHecho).includes(
      'Cobertura del recolector: DESCONOCIDA'
    ),
    motivos(sinHecho)
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
      evento('generic_account_login', {
        usuario: 'admin',
      }),
    ];

    const clasico = resolveEvidenceForControl(
      'op.acc.1',
      eventos,
      undefined,
      'ALTO'
    ).find(evidencia => evidencia.id === 'EV-03');

    comprueba(
      'sin judgment · manda el evidence_state del agente (camino de hoy)',
      clasico?.status === 'CUMPLE',
      String(clasico?.status)
    );

    ev03.judgment = {
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-04',
      factEventTypes: ['generic_account_login'],
      factField: 'usuario',
    };

    try {
      const juzgado = resolveEvidenceForControl(
        'op.acc.1',
        eventos,
        undefined,
        'ALTO',
        configuracion('P-04', ['admin', 'guest'])
      ).find(evidencia => evidencia.id === 'EV-03');

      comprueba(
        'con judgment · el evidence_state deja de mandar y decide la primitiva',
        juzgado?.status === 'NO_CUMPLE',
        String(juzgado?.status)
      );

      comprueba(
        'con judgment · el motivo nombra la cuenta del hecho crudo',
        Boolean(juzgado && motivos(juzgado).includes("'admin'")),
        juzgado ? motivos(juzgado) : ''
      );

      const sinConfiguracion = resolveEvidenceForControl(
        'op.acc.1',
        eventos,
        undefined,
        'ALTO'
      ).find(evidencia => evidencia.id === 'EV-03');

      comprueba(
        'con judgment y sin configuración · NO_EVALUABLE (la config llega por parámetro)',
        sinConfiguracion?.status === 'NO_EVALUABLE',
        String(sinConfiguracion?.status)
      );
    } finally {
      delete ev03.judgment;
    }

    comprueba(
      'restaurado · EV-03 vuelve al camino clásico',
      resolveEvidenceForControl(
        'op.acc.1',
        eventos,
        undefined,
        'ALTO'
      ).find(evidencia => evidencia.id === 'EV-03')
        ?.status === 'CUMPLE'
    );
  }
}

// --- restricción de T1.2 ---------------------------------------------------

bloque('Restricción de T1.2');

{
  const declaradas = ENSEvidenceCatalog.filter(
    definition => definition.judgment !== undefined
  ).map(definition => `${definition.controlId}/${definition.id}`);

  comprueba(
    'ninguna evidencia del catálogo declara judgment todavía (lo hace T1.3)',
    declaradas.length === 0,
    declaradas.join(', ')
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
