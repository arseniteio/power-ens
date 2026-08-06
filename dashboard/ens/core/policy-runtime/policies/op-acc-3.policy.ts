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
      decisions.push(
        NO_MEDIDO(
          requirementId,
          `Falta declarar ${missing}. Sin esa traducción, una acción observada no se puede clasificar en una función y la segregación no se puede medir.`
        )
      );
    });
  } else {
    const offenders: string[] = [];

    byAccount.forEach((functions, account) => {
      const broken = incompatible.filter(pair =>
        violatesPair(Array.from(functions), pair)
      );

      // Una cuenta de auditoría con CUALQUIER otra función incumple
      // op.acc.3.r1.2, que es taxativo. Se comprueba aparte del comodín
      // porque no depende de que el auditor haya declarado `auditoría | *`.
      const isAuditAccount = auditAccounts.includes(account.toLowerCase());
      const auditBreach =
        isAuditAccount && Array.from(functions).some(
          fn => fn !== 'auditoria' && fn !== 'auditoría' && fn !== 'supervision'
        );

      if (broken.length || auditBreach) {
        offenders.push(
          `${account} (${Array.from(functions).join(' + ')})`
        );
      }
    });

    cruceRequirements.forEach(requirementId => {
      decisions.push(
        offenders.length
          ? decide(
              requirementId,
              'NO_CUMPLE',
              `Cuentas que aúnan funciones incompatibles: ${offenders.join('; ')}.`,
              {
                parameterIds: ['P-02', 'P-03'],
                expected: 'ninguna cuenta con dos funciones incompatibles',
                actual: `${offenders.length} cuenta(s)`,
              }
            )
          : decide(
              requirementId,
              'CUMPLE',
              byAccount.size > 0
                ? `Ninguna de las ${byAccount.size} cuentas observadas aúna funciones incompatibles.`
                : 'No se ha observado ninguna acción en el periodo: no hay ninguna cuenta que aúne funciones.',
              {
                parameterIds: ['P-02', 'P-03'],
                expected: 'ninguna cuenta con dos funciones incompatibles',
                actual: `${byAccount.size} cuenta(s) observadas, 0 con incompatibilidad`,
              }
            )
      );
    });
  }

  // --- el enunciado general: concurrencia en tareas críticas ---
  //
  // P-04 declara `tarea | nº personas`. Se cuentan las cuentas DISTINTAS que
  // ejecutaron cada tarea observada.
  const taskEvents = context.events.filter(
    event => event.eventType === 'critical_task_run'
  );

  if (!criticalTasks.length) {
    decisions.push(
      NO_MEDIDO(
        'op.acc.3',
        'Falta declarar P-04 (tareas críticas y personas exigidas). Sin él no se puede saber cuántas personas exige cada tarea.'
      )
    );
  } else {
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

    const breaches: string[] = [];

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
        breaches.push(
          `${cells[0]}: ${observed.size} persona(s) (${Array.from(observed).join(', ')}), exigidas ${required}`
        );
      }
    });

    decisions.push(
      breaches.length
        ? decide(
            'op.acc.3',
            'NO_CUMPLE',
            `Tareas críticas ejecutadas sin la concurrencia exigida: ${breaches.join('; ')}.`,
            {
              parameterIds: ['P-04'],
              evidenceIds: ['EV-03'],
              expected: 'concurrencia de dos o más personas',
              actual: `${breaches.length} tarea(s) sin ella`,
            }
          )
        : decide(
            'op.acc.3',
            'CUMPLE',
            peopleByTask.size
              ? `Las ${peopleByTask.size} tarea(s) críticas ejecutadas en el periodo cumplen la concurrencia exigida.`
              : 'No se ha ejecutado ninguna tarea crítica en el periodo.',
            {
              parameterIds: ['P-04'],
              evidenceIds: ['EV-03'],
              expected: 'concurrencia de dos o más personas',
              actual: `${peopleByTask.size} tarea(s) ejecutadas, 0 sin concurrencia`,
            }
          )
    );
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
