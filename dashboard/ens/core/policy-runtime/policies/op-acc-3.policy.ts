// op.acc.3 · Segregación de funciones y tareas
//
// EL ÚNICO CONTROL CON EVALUADOR PROPIO, y la razón es estructural, no de
// gusto: la segregación es una propiedad del CONJUNTO de acciones de una
// persona, no de ninguna acción suelta. «jgomez ejecutó git push» no incumple
// nada; incumple si esa misma cuenta ejerce además una función incompatible
// dentro de la ventana.
//
// Las siete primitivas de juicio del motor contrastan UN hecho contra UN
// parámetro, y aquí hacen falta tres cosas a la vez:
//
//   1. clasificar cada acción observada en una función  → P-03
//   2. agrupar por cuenta dentro de una ventana         → P-06
//   3. cruzar contra los pares prohibidos               → P-02
//
// Un evaluador de policy recibe todos los parámetros y todos los eventos, que
// es exactamente lo que esto necesita. Y la política sigue viviendo SOLO en la
// pantalla: el agente emite acciones sin clasificar.
//
// Tipos desde el fichero, nunca desde un barrel de alto nivel: por ahí vuelve
// el ciclo transitivo del TDZ de Settings.
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import { toParameterListItems } from '../../../configuration/services/parameter-value-validator';

const getParameter = (
  context: ENSPolicyContext,
  parameterId: string
) =>
  context.configuration?.parameters.find(
    parameter => parameter.id === parameterId
  );

const listOf = (value: unknown): string[] => {
  if (!Array.isArray(value) && typeof value !== 'string') {
    return [];
  }

  return Array.from(
    new Set(
      toParameterListItems(
        value as Parameters<typeof toParameterListItems>[0]
      )
    )
  ).filter(Boolean);
};

// Una fila `a | b | c` partida en celdas. Misma partición que usa el
// formulario, para que lo que el auditor escribe y lo que el motor lee no
// puedan divergir.
const cellsOf = (row: string): string[] =>
  row.split('|').map(cell => cell.trim()).filter(Boolean);

// `ENSPolicyDecision` exige todos sus campos, y con razón: la traza es lo que
// un auditor recorre. Este constructor los rellena para que ninguna decisión
// de este fichero pueda salir a medias.
const decide = (
  requirementId: string,
  status: ENSPolicyDecision['status'],
  reason: string,
  extra: {
    parameterIds?: string[];
    evidenceIds?: string[];
    expected?: string;
    actual?: string;
  } = {}
): ENSPolicyDecision => ({
  policyId: 'policy.op.acc.3',
  requirementId,
  status,
  parameterIds: extra.parameterIds || [],
  evidenceIds: extra.evidenceIds || [],
  eventIds: [],
  runtimeVariables: [],
  trace: {
    ruleId: requirementId,
    ruleType: 'WHITELIST',
    expression: 'funciones incompatibles por cuenta',
    expected: extra.expected || '',
    actual: extra.actual || '',
    result: status === 'CUMPLE',
  },
  reason,
});

const NO_MEDIDO = (
  requirementId: string,
  reason: string,
  parameterIds: string[] = []
): ENSPolicyDecision =>
  decide(requirementId, 'NO_EVALUABLE', reason, { parameterIds });

// --- 1. clasificar una acción en funciones (P-03) --------------------------
//
// P-03 es `funcion | indicadores`: qué comandos, rutas o procesos identifican
// una acción de esa función. Una acción puede casar con VARIAS funciones y eso
// no es un error: `visudo` es configuración y también administración.
const functionsOfAction = (
  action: string,
  path: string,
  rows: string[]
): string[] => {
  const haystack = `${action} ${path}`.toLowerCase();

  const matched = rows.flatMap(row => {
    const cells = cellsOf(row);

    if (cells.length < 2) {
      return [];
    }

    const [fn, ...indicators] = cells;

    const hits = indicators.some(indicator =>
      indicator && haystack.includes(indicator.toLowerCase())
    );

    return hits ? [fn.toLowerCase()] : [];
  });

  return Array.from(new Set(matched));
};

// --- 2. los pares prohibidos (P-02) ---------------------------------------
//
// `a | b` es un par incompatible. `a | *` significa que `a` no puede
// coexistir con NINGUNA otra función, que es literalmente lo que dice
// op.acc.3.r1.2 de la auditoría: es taxativo y no admite el matiz «siempre que
// sea posible».
interface IncompatiblePair {
  left: string;
  right: string;
  wildcard: boolean;
}

const pairsOf = (rows: string[]): IncompatiblePair[] =>
  rows.flatMap(row => {
    const cells = cellsOf(row);

    if (cells.length < 2) {
      return [];
    }

    const left = cells[0].toLowerCase();
    const right = cells[1].toLowerCase();

    return [{ left, right, wildcard: right === '*' }];
  });

// QUÉ PAR GOBIERNA CADA REQUISITO.
//
// Hasta el 07/08/2026 esto no existía y era un defecto con consecuencias: se
// calculaba UNA lista de infractores contra TODOS los pares de P-02 y se
// aplicaba a los cuatro requisitos. Una cuenta que aunaba desarrollo y
// operación —que incumple op.acc.3.1— teñía también op.acc.3.2, que habla de
// quién autoriza y quién controla y no tiene nada que ver. Tres de cada cuatro
// eran NO CONFORMIDADES FALSAS, y una no conformidad falsa miente igual que un
// CUMPLE falso: manda a corregir algo que no está mal.
//
// El mapa sale del TEXTO del ENS, no de una decisión de producto:
//
//   op.acc.3.1     «las capacidades de desarrollo y operación no recaerán en la
//                   misma persona»
//   op.acc.3.2     «las personas que autorizan y controlan el uso serán
//                   distintas»
//   op.acc.3.r1.1  «la misma persona no aunará configuración y mantenimiento»
//   op.acc.3.r1.2  «auditoría o supervisión con cualquier otra función»
//
// Y encaja con lo que la propia pantalla dice de P-02: «En MEDIO:
// desarrollo↔operación, autorización↔control. En ALTO se añade:
// configuración↔mantenimiento y auditoría↔cualquier otra».
const PAR_DEL_REQUISITO: Record<string, [string, string]> = {
  'op.acc.3.1': ['desarrollo', 'operacion'],
  'op.acc.3.2': ['autorizacion', 'control'],
  'op.acc.3.r1.1': ['configuracion', 'mantenimiento'],
  'op.acc.3.r1.2': ['auditoria', '*'],
};

// Los pares que el responsable declaró en P-02 y que gobiernan ESTE requisito.
// La comparación es por conjunto: da igual el orden en que los escriba, y se
// normalizan los acentos porque «operación» y «operacion» son la misma función
// y nadie debería perder cumplimiento por una tilde.
const sinTildes = (valor: string): string =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const paresDelRequisito = (
  requirementId: string,
  declarados: IncompatiblePair[]
): IncompatiblePair[] => {
  const esperado = PAR_DEL_REQUISITO[requirementId];

  if (!esperado) {
    return [];
  }

  const [a, b] = esperado.map(sinTildes);

  return declarados.filter(pair => {
    const left = sinTildes(pair.left);
    const right = sinTildes(pair.right);

    return (left === a && right === b) || (left === b && right === a);
  });
};

const violatesPair = (
  functions: string[],
  pair: IncompatiblePair
): boolean => {
  if (!functions.includes(pair.left)) {
    return false;
  }

  if (pair.wildcard) {
    return functions.some(fn => fn !== pair.left);
  }

  return functions.includes(pair.right);
};

// --- el evaluador ----------------------------------------------------------

const evaluate = (
  context: ENSPolicyContext
): ENSPolicyEvaluatorResult => {
  const decisions: ENSPolicyDecision[] = [];
  const variables: ENSRuntimeVariable[] = [];

  const actionsToFunctions = listOf(getParameter(context, 'P-03')?.value);
  const incompatible = pairsOf(
    listOf(getParameter(context, 'P-02')?.value)
  );
  const auditAccounts = listOf(
    getParameter(context, 'P-05')?.value
  ).map(entry => cellsOf(entry)[0]?.toLowerCase()).filter(Boolean);

  const criticalTasks = listOf(getParameter(context, 'P-04')?.value);

  // --- las acciones observadas, agrupadas por cuenta ---
  const actionEvents = context.events.filter(
    event => event.eventType === 'account_action'
  );

  const byAccount = new Map<string, Set<string>>();

  actionEvents.forEach(event => {
    const account = String(
      event.attributes?.usuario ?? ''
    ).trim();

    if (!account) {
      return;
    }

    const functions = functionsOfAction(
      String(event.attributes?.accion ?? ''),
      String(event.attributes?.ruta ?? ''),
      actionsToFunctions
    );

    const current = byAccount.get(account) || new Set<string>();
    functions.forEach(fn => current.add(fn));
    byAccount.set(account, current);
  });

  variables.push({
    name: 'cuentasObservadas',
    value: byAccount.size,
    parameterIds: ['P-03'],
    evidenceIds: ['EV-06'],
    eventIds: [],
    description:
      'Cuentas con al menos una acción observada y clasificada en el periodo.',
  });

  // ¿HA MIRADO ALGUIEN? El silencio solo acredita si consta que se barrió.
  //
  // ESTO CORRIGE UN CUMPLE FALSO. Hasta el 07/08/2026, cuando no se observaba
  // ninguna acción esta policy respondía «no hay ninguna cuenta que aúne
  // funciones» y daba CUMPLE — 100 puntos. Pero «no he visto a nadie aunar
  // funciones» y «no he mirado» producen exactamente el mismo conjunto vacío, y
  // la policy no los distinguía: una máquina SIN AGENTE puntuaba 100.
  //
  // Se vio en wazuh-fake, que está en el índice y no tiene recolector: op.acc.3
  // le daba el 100 y ese 100 subía la media del control.
  //
  // El producto ya tiene el mecanismo —el latido `collector_run` con
  // `evidencias_cubiertas`, que es lo que sostiene «silencio = cumplimiento»—
  // pero vivía solo en el camino de las primitivas (`resolveCollectorCoverage`
  // en evidence/judgment.ts) y esta policy no pasa por ahí. Se aplica aquí la
  // misma regla: sin latido, NO_EVALUABLE.
  const TIPOS_DE_HECHO = [
    'account_action',
    'critical_task_run',
    'security_info_access',
  ];

  const hayHechos = context.events.some(event =>
    TIPOS_DE_HECHO.includes(event.eventType)
  );

  const HORAS_DE_LATIDO = 24;

  const hayLatido = context.events.some(event => {
    if (event.eventType !== 'collector_run') {
      return false;
    }

    const cuando = new Date(event.timestamp).getTime();

    if (!Number.isFinite(cuando)) {
      return false;
    }

    // Un latido con fecha futura —reloj desviado— no acredita: valdría como
    // latido perpetuo y volvería verde para siempre una máquina muerta.
    const ahora = context.now ? context.now.getTime() : Date.now();

    return (
      cuando <= ahora &&
      ahora - cuando <= HORAS_DE_LATIDO * 3600 * 1000
    );
  });

  // --- la concurrencia en tareas críticas, ANTES del cruce ---
  //
  // Se calcula aquí y no donde se decide porque su veredicto NO es una decisión
  // aparte: se FUNDE con el del cruce en op.acc.3.2. La razón es del motor —
  // `requirement-evaluator` resuelve la decisión de un requisito con
  // `policyDecisions.find(d => d.requirementId === requirement.id)`, y `find`
  // devuelve la PRIMERA. Empujar dos decisiones para el mismo requisito no
  // suma: la segunda no la lee nadie, en silencio.
  //
  // Y va a op.acc.3.2 —«las personas que autorizan y controlan el uso serán
  // distintas»— porque eso es exactamente lo que mide P-04: control dual, dos
  // personas para una tarea. op.acc.3.1 (desarrollo frente a operación) ya lo
  // cubre el cruce de pares.
  //
  // Hasta el 06/08/2026 estas decisiones se emitían contra `'op.acc.3'`, que es
  // el id del CONTROL y no el de ningún requisito. Ninguna casaba, así que el
  // control existía para comprobar la segregación y la comprobación no llegaba
  // a ninguna parte: P-04 y EV-03 no movían el resultado ni un punto. Un fallo
  // así no da error —todo compila, todo despliega— y por eso hay una prueba
  // que exige que todo `requirementId` que emita esta policy exista en el
  // catálogo.
  const taskEvents = context.events.filter(
    event => event.eventType === 'critical_task_run'
  );

  const concurrencyBreaches: string[] = [];
  const concurrencyMeasurable = criticalTasks.length > 0;
  let tasksObserved = 0;

  if (concurrencyMeasurable) {
    const peopleByTask = new Map<string, Set<string>>();

    taskEvents.forEach(event => {
      const task = String(event.attributes?.tarea ?? '').trim().toLowerCase();
      const account = String(event.attributes?.usuario ?? '').trim();

      if (!task || !account) {
        return;
      }

      const current = peopleByTask.get(task) || new Set<string>();
      current.add(account);
      peopleByTask.set(task, current);
    });

    tasksObserved = peopleByTask.size;

    criticalTasks.forEach(row => {
      const cells = cellsOf(row);

      if (cells.length < 2) {
        return;
      }

      const task = cells[0].toLowerCase();
      const required = Number(cells[1]);

      if (!Number.isFinite(required) || required < 2) {
        return;
      }

      const observed = peopleByTask.get(task);

      // UNA TAREA QUE NO SE HA EJECUTADO NO INCUMPLE. Exigir concurrencia a
      // algo que nadie hizo sería acusar por una ausencia, y la ausencia aquí
      // no es un hallazgo: es que no hubo despliegue esta semana.
      if (!observed) {
        return;
      }

      if (observed.size < required) {
        // CON NOMBRES. Un auditor que lee «1 de 2 personas» tiene que volver a
        // los eventos crudos para saber a quién preguntar; con el nombre
        // delante, la traza empieza donde se lee el hallazgo.
        concurrencyBreaches.push(
          `${cells[0]} (${observed.size} de ${required} personas: ${Array.from(observed).join(', ')})`
        );
      }
    });
  }

  // --- op.acc.3.1 y op.acc.3.2 y el R1 ---
  //
  // Los cuatro requisitos se deciden con el mismo cruce; lo que cambia es qué
  // par se mira. Sin P-02 o sin P-03 no hay cruce posible y se dice cuál falta:
  // decir «no evaluable» sin nombrar el parámetro no es accionable.
  const cruceRequirements = [
    'op.acc.3.1',
    'op.acc.3.2',
    'op.acc.3.r1.1',
    'op.acc.3.r1.2',
  ];

  if (!actionsToFunctions.length || !incompatible.length) {
    const missing = [
      !actionsToFunctions.length ? 'P-03 (acciones por función)' : '',
      !incompatible.length ? 'P-02 (pares incompatibles)' : '',
    ].filter(Boolean).join(' y ');

    cruceRequirements.forEach(requirementId => {
      // op.acc.3.2 mide DOS cosas —el cruce y la concurrencia de P-04—, así que
      // si además falta P-04 hay que nombrarlo: un «no evaluable» que solo cita
      // la mitad de lo que falta manda al operador a rellenar un parámetro y a
      // volver a encontrarse el mismo gris.
      const alsoMissing =
        requirementId === 'op.acc.3.2' && !concurrencyMeasurable
          ? `${missing} y P-04 (tareas críticas y personas exigidas)`
          : missing;

      decisions.push(
        NO_MEDIDO(
          requirementId,
          `Falta declarar ${alsoMissing}. Sin esa traducción, una acción observada no se puede clasificar en una función y la segregación no se puede medir.`
        )
      );
    });
  } else {
    // LOS INFRACTORES DE **ESTE** REQUISITO, no los de todos.
    //
    // Cada requisito se juzga contra el par que su propio texto nombra. Una
    // cuenta que aúna desarrollo y operación incumple op.acc.3.1 y NO dice nada
    // de op.acc.3.2, que habla de quién autoriza y quién controla.
    const infractoresDe = (requirementId: string): string[] => {
      const pares = paresDelRequisito(requirementId, incompatible);
      const esAuditoria = requirementId === 'op.acc.3.r1.2';
      const salida: string[] = [];

      byAccount.forEach((functions, account) => {
        const lista = Array.from(functions);

        const rompePar = pares.some(pair => violatesPair(lista, pair));

        // Una cuenta de auditoría con CUALQUIER otra función incumple
        // op.acc.3.r1.2, que es taxativo. Se comprueba aparte del comodín
        // porque no depende de que el auditor haya declarado `auditoría | *`,
        // y SOLO cuenta para ese requisito: es lo que dice su enunciado.
        const rompeAuditoria =
          esAuditoria &&
          auditAccounts.includes(account.toLowerCase()) &&
          lista.some(
            fn =>
              fn !== 'auditoria' &&
              fn !== 'auditoría' &&
              fn !== 'supervision'
          );

        if (rompePar || rompeAuditoria) {
          salida.push(`${account} (${lista.join(' + ')})`);
        }
      });

      return salida;
    };

    cruceRequirements.forEach(requirementId => {
      const offenders = infractoresDe(requirementId);

      // SI EL RESPONSABLE NO HA DECLARADO ESTE PAR, no hay contra qué medir. No
      // es lo mismo que «no hay infractores»: es que nadie ha dicho que esas dos
      // funciones sean incompatibles aquí, y el silencio no acredita.
      // op.acc.3.r1.2 va aparte porque su comprobación taxativa no depende de
      // P-02: le basta con P-05.
      if (
        requirementId !== 'op.acc.3.r1.2' &&
        !paresDelRequisito(requirementId, incompatible).length
      ) {
        const [a, b] = PAR_DEL_REQUISITO[requirementId] || ['', ''];

        decisions.push(
          NO_MEDIDO(
            requirementId,
            `P-02 no declara el par «${a} | ${b}», que es el que este requisito exige. Sin esa decisión no hay contra qué contrastar las funciones observadas.`
          )
        );

        return;
      }

      // Solo op.acc.3.2 arrastra la concurrencia. Para los otros tres el cruce
      // es toda la medida.
      const carriesConcurrency = requirementId === 'op.acc.3.2';

      // «Lo no demostrado no cumple» opera sobre el REQUISITO ENTERO. Si el
      // cruce sale limpio pero P-04 está sin declarar, op.acc.3.2 NO puede
      // salir verde: la mitad de lo que afirma —que quien autoriza y quien
      // controla son personas distintas— no se ha llegado a mirar. Decir CUMPLE
      // ahí sería el CUMPLE falso que este producto existe para no dar.
      // SIN NINGÚN HECHO Y SIN LATIDO, no se puede decir que la máquina
      // conforme: no consta que nadie haya mirado.
      //
      // «Ningún hecho» es ningún hecho DE NINGÚN TIPO, no solo ninguna acción
      // clasificada: si llegó una tarea crítica o un acceso a la información de
      // seguridad, el recolector corrió y su silencio sobre las acciones sí es
      // una observación. Acotarlo a `byAccount` dejaba en gris a máquinas que
      // sí habían reportado.
      if (!hayHechos && !hayLatido) {
        decisions.push(
          NO_MEDIDO(
            requirementId,
            'No se ha observado ninguna acción y no consta ningún latido del recolector en las últimas 24 horas: no se puede distinguir «no hay nadie que aúne funciones» de «no se ha mirado», y el silencio sin barrido no acredita.'
          )
        );

        return;
      }

      if (carriesConcurrency && !concurrencyMeasurable) {
        decisions.push(
          NO_MEDIDO(
            requirementId,
            'Falta declarar P-04 (tareas críticas y personas exigidas). El cruce de funciones incompatibles sí se ha podido hacer, pero sin P-04 no se sabe cuántas personas exige cada tarea crítica y la mitad del requisito se queda sin medir.'
          )
        );
        return;
      }

      const breaches = [
        ...offenders.map(entry => `funciones incompatibles: ${entry}`),
        ...(carriesConcurrency
          ? concurrencyBreaches.map(entry => `sin la concurrencia exigida: ${entry}`)
          : []),
      ];

      const parameterIds = carriesConcurrency
        ? ['P-02', 'P-03', 'P-04']
        : ['P-02', 'P-03'];

      const expected = carriesConcurrency
        ? 'ninguna cuenta con dos funciones incompatibles y concurrencia de dos o más personas en cada tarea crítica'
        : 'ninguna cuenta con dos funciones incompatibles';

      decisions.push(
        breaches.length
          ? decide(
              requirementId,
              'NO_CUMPLE',
              `Segregación incumplida — ${breaches.join('; ')}.`,
              {
                parameterIds,
                ...(carriesConcurrency ? { evidenceIds: ['EV-03', 'EV-06'] } : {}),
                expected,
                actual: `${breaches.length} hallazgo(s)`,
              }
            )
          : decide(
              requirementId,
              'CUMPLE',
              [
                byAccount.size > 0
                  ? `Ninguna de las ${byAccount.size} cuentas observadas aúna funciones incompatibles.`
                  : 'No se ha observado ninguna acción en el periodo: no hay ninguna cuenta que aúne funciones.',
                carriesConcurrency
                  ? tasksObserved > 0
                    ? `Las ${tasksObserved} tarea(s) críticas ejecutadas cumplen la concurrencia exigida.`
                    : 'No se ha ejecutado ninguna tarea crítica en el periodo.'
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
              {
                parameterIds,
                ...(carriesConcurrency ? { evidenceIds: ['EV-03', 'EV-06'] } : {}),
                expected,
                actual: carriesConcurrency
                  ? `${byAccount.size} cuenta(s) observadas y ${tasksObserved} tarea(s) ejecutadas, 0 hallazgos`
                  : `${byAccount.size} cuenta(s) observadas, 0 con incompatibilidad`,
              }
            )
      );
    });
  }

  return { decisions, runtimeVariables: variables };
};

export const opAcc3PolicyDefinition: ENSPolicyDefinition = {
  id: 'policy.op.acc.3',
  controlId: 'op.acc.3',
  version: '1.0.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.acc.3.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-06'],
      evidenceIds: ['EV-01', 'EV-06'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.acc.3.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-06'],
      evidenceIds: ['EV-02', 'EV-06'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.acc.3.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-04', 'EV-06'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.acc.3.r1.2',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-05'],
      evidenceIds: ['EV-05'],
      ruleType: 'WHITELIST',
    },
    // R2 y R3 no los exige el ENS en ninguna tabla de aplicabilidad: van sin
    // niveles y el motor los evalúa NO_APLICA. Se declaran igualmente para que
    // quien quiera implantarlos los tenga.
    {
      requirementId: 'op.acc.3.r2.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.3.r3.1',
      levels: [],
      parameterIds: [],
      evidenceIds: ['EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
