// op.acc.3 · Segregation of duties and tasks. The only control with its own evaluator: segregation
// is a property of the SET of a person's actions (classify actions into functions P-03, group by
// account in a window P-06, cross with forbidden pairs P-02), which the single-fact judgment
// primitives cannot express.
// Types come from the file, never from a high-level barrel (Settings TDZ cycle).
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

// A `a | b | c` row split into cells; same split as the form so what the auditor writes and what
// the engine reads cannot diverge.
const cellsOf = (row: string): string[] =>
  row.split('|').map(cell => cell.trim()).filter(Boolean);

// `ENSPolicyDecision` requires every field; this builder fills them so no decision leaves
// half-built.
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

const NOT_MEASURED = (
  requirementId: string,
  reason: string,
  parameterIds: string[] = []
): ENSPolicyDecision =>
  decide(requirementId, 'NO_EVALUABLE', reason, { parameterIds });

// 1. Classify an action into functions (P-03): `function | indicators`; an action may match SEVERAL
// functions (`visudo` is configuration and administration).
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

// 2. Forbidden pairs (P-02): `a | b` is an incompatible pair; `a | *` means `a` cannot coexist with
// ANY other function, as op.acc.3.r1.2 says (no «whenever possible» nuance).
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

// WHICH PAIR GOVERNS EACH REQUIREMENT. The map comes from the ENS text, not a product decision:
// op.acc.3.1 development vs operation; op.acc.3.2 authorizing vs controlling; op.acc.3.r1.1
// configuration vs maintenance; op.acc.3.r1.2 audit or supervision vs any other function.
// One offender list against all P-02 pairs applied to the four requirements produced false
// nonconformities.
const REQUIREMENT_PAIR: Record<string, [string, string]> = {
  'op.acc.3.1': ['desarrollo', 'operacion'],
  'op.acc.3.2': ['autorizacion', 'control'],
  'op.acc.3.r1.1': ['configuracion', 'mantenimiento'],
  'op.acc.3.r1.2': ['auditoria', '*'],
};

// Pairs declared in P-02 that govern THIS requirement. Compared as a set (order irrelevant) with
// accents normalized: «operación» and «operacion» are the same function.
const stripAccents = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const requirementPairs = (
  requirementId: string,
  declared: IncompatiblePair[]
): IncompatiblePair[] => {
  const expected = REQUIREMENT_PAIR[requirementId];

  if (!expected) {
    return [];
  }

  const [a, b] = expected.map(stripAccents);

  return declared.filter(pair => {
    const left = stripAccents(pair.left);
    const right = stripAccents(pair.right);

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

  // HAS ANYONE LOOKED? Silence only accredits if a sweep is recorded. «Nobody seen combining
  // functions» and «nobody looked» give the same empty set, so a machine WITHOUT AGENT scored 100.
  // The `collector_run` heartbeat with `evidencias_cubiertas` already supports «silence =
  // compliance» on the primitives path (`resolveCollectorCoverage` in evidence/judgment.ts), which
  // this policy does not take: the same rule applies here, no heartbeat means NO_EVALUABLE.
  const FACT_TYPES = [
    'account_action',
    'critical_task_run',
    'security_info_access',
  ];

  const hasFacts = context.events.some(event =>
    FACT_TYPES.includes(event.eventType)
  );

  const HEARTBEAT_HOURS = 24;

  const hasHeartbeat = context.events.some(event => {
    if (event.eventType !== 'collector_run') {
      return false;
    }

    const when = new Date(event.timestamp).getTime();

    if (!Number.isFinite(when)) {
      return false;
    }

    // A future-dated heartbeat (skewed clock) accredits nothing: it would be a perpetual heartbeat
    // and keep a dead machine green.
    const now = context.now ? context.now.getTime() : Date.now();

    return (
      when <= now &&
      now - when <= HEARTBEAT_HOURS * 3600 * 1000
    );
  });

  // Concurrency on critical tasks, BEFORE the pair crossing. Its verdict is not a separate
  // decision: it is MERGED with the crossing in op.acc.3.2, because `requirement-evaluator`
  // resolves a requirement with `policyDecisions.find(d => d.requirementId === requirement.id)` and
  // `find` returns the FIRST; a second decision for the same requirement is silently ignored.
  // It goes to op.acc.3.2 because that is what P-04 measures (dual control, two people for one
  // task); op.acc.3.1 is covered by the pair crossing. Decisions must carry a requirement id, not
  // the control id; a test requires every `requirementId` this policy emits to exist in the
  // catalog.
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

      // A TASK NOT EXECUTED DOES NOT FAIL: requiring concurrency of something nobody did would
      // accuse by absence.
      if (!observed) {
        return;
      }

      if (observed.size < required) {
        // WITH NAMES: an auditor reading «1 of 2 people» should not go back to raw events to know
        // whom to ask.
        concurrencyBreaches.push(
          `${cells[0]} (${observed.size} de ${required} personas: ${Array.from(observed).join(', ')})`
        );
      }
    });
  }

  // op.acc.3.1, op.acc.3.2 and R1 are decided with the same crossing; only the pair changes.
  // Without P-02 or P-03 there is no crossing and the missing one is named: «not evaluable» without
  // the parameter is not actionable.
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
      // op.acc.3.2 measures TWO things (crossing and P-04 concurrency): if P-04 is also missing it
      // must be named too.
      const alsoMissing =
        requirementId === 'op.acc.3.2' && !concurrencyMeasurable
          ? `${missing} y P-04 (tareas críticas y personas exigidas)`
          : missing;

      decisions.push(
        NOT_MEASURED(
          requirementId,
          `Falta declarar ${alsoMissing}. Sin esa traducción, una acción observada no se puede clasificar en una función y la segregación no se puede medir.`
        )
      );
    });
  } else {
    // THIS requirement's offenders, not everyone's: each requirement is judged against the pair its
    // own text names.
    const offendersOf = (requirementId: string): string[] => {
      const pairs = requirementPairs(requirementId, incompatible);
      const isAudit = requirementId === 'op.acc.3.r1.2';
      const output: string[] = [];

      byAccount.forEach((functions, account) => {
        const list = Array.from(functions);

        const breaksPair = pairs.some(pair => violatesPair(list, pair));

        // An audit account with ANY other function fails op.acc.3.r1.2 (categorical). Checked apart
        // from the wildcard because it does not depend on `auditoría | *` being declared, and
        // counts ONLY for that requirement.
        const breaksAudit =
          isAudit &&
          auditAccounts.includes(account.toLowerCase()) &&
          list.some(
            fn =>
              fn !== 'auditoria' &&
              fn !== 'auditoría' &&
              fn !== 'supervision'
          );

        if (breaksPair || breaksAudit) {
          output.push(`${account} (${list.join(' + ')})`);
        }
      });

      return output;
    };

    cruceRequirements.forEach(requirementId => {
      const offenders = offendersOf(requirementId);

      // IF THE PAIR WAS NOT DECLARED there is nothing to measure against: not the same as «no
      // offenders». op.acc.3.r1.2 is apart: its categorical check needs only P-05.
      if (
        requirementId !== 'op.acc.3.r1.2' &&
        !requirementPairs(requirementId, incompatible).length
      ) {
        const [a, b] = REQUIREMENT_PAIR[requirementId] || ['', ''];

        decisions.push(
          NOT_MEASURED(
            requirementId,
            `P-02 no declara el par «${a} | ${b}», que es el que este requisito exige. Sin esa decisión no hay contra qué contrastar las funciones observadas.`
          )
        );

        return;
      }

      // Only op.acc.3.2 carries the concurrency; for the other three the crossing is the whole
      // measurement.
      const carriesConcurrency = requirementId === 'op.acc.3.2';

      // «What is not proven does not comply» applies to the WHOLE REQUIREMENT: with a clean
      // crossing but P-04 undeclared, op.acc.3.2 cannot be green. WITHOUT ANY FACT AND WITHOUT
      // HEARTBEAT the machine cannot be declared compliant. «No fact» means no fact OF ANY TYPE: a
      // critical task or a security-information access shows the collector ran, so its silence
      // about actions is an observation (limiting it to `byAccount` left reporting machines grey).
      if (!hasFacts && !hasHeartbeat) {
        decisions.push(
          NOT_MEASURED(
            requirementId,
            'No se ha observado ninguna acción y no consta ningún latido del recolector en las últimas 24 horas: no se puede distinguir «no hay nadie que aúne funciones» de «no se ha mirado», y el silencio sin barrido no acredita.'
          )
        );

        return;
      }

      if (carriesConcurrency && !concurrencyMeasurable) {
        decisions.push(
          NOT_MEASURED(
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
    // The ENS does not require R2 and R3 in any applicability table: they go without levels and the
    // engine evaluates them NO_APLICA; still declared for whoever implements them.
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
