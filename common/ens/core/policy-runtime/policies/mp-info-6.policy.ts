// mp.info.6 · Backups. The agent OBSERVES and this policy JUDGES; each backup origin's collector
// (Proxmox PBS, Zimbra 10 Network Edition with zmbackup) emits the same facts: backup_run,
// backup_schedule, backup_retention, backup_access, backup_storage (state), restore_test (action),
// evidence_state (only NO_EVALUABLE), collector_run (heartbeat).
// Every fact carries `origen` and `objeto` and may carry `backup_id`; each combination is ONE
// BACKUP judged separately and the worst result wins. Unknown fields and origins are not filtered.
// One machine may have two collectors (PBS and Zimbra), each with its own heartbeat: the last run
// is looked up per `origen`.
// Why a policy and not catalog primitives: the judgment is backup by backup with several axes per
// evidence, and no primitive groups by backup or lets the worst win.
// Invariants as in `op-exp-8.policy.ts`: ages are measured against `context.now`; no fact or
// parameter is NO_EVALUABLE, never CUMPLE or NO_CUMPLE by absence; what the collector declares
// unmeasurable (evidence_state NO_EVALUABLE) keeps its own cause and a verdict evidence_state is
// not read; no default deadline, threshold or list (P-02, the margin, is zero if missing per its
// sheet).
// Scope: only the machines P-04 declares are evaluated; none means NO_EVALUABLE by CONFIGURATION.
// Types and utilities come from the file, never from a barrel (Settings TDZ cycle).
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSComplianceStatus, ENSGapCause } from '../../evaluation/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSControlParameter } from '../../../configuration/types';
import {
  toParameterListItems,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';
import { getEvidenceDefinitions } from '../../evidence/registry';

const CONTROL = 'mp.info.6';
const POLICY = 'policy.mp.info.6';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Freshness of a state fact: the collector runs hourly and re-emits the whole state; 26 h tolerates
// a day of failures. Observation tolerance, not policy.
const FRESHNESS_HOURS = 26;

// Facts of one run are emitted within a few minutes.
const SAME_RUN_WINDOW_MS = 5 * 60 * 1000;

// A fact from the future proves nothing (same clock tolerance as the heartbeat).
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// `causa` only with NO_EVALUABLE: whose gap it is (see `ENSGapCause`).
type Measurement = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL'>;
  motivo: string;
  causa?: ENSGapCause;
};

const compliant = (motive: string): Measurement => ({ estado: 'CUMPLE', motivo: motive });
const nonCompliant = (motive: string): Measurement => ({ estado: 'NO_CUMPLE', motivo: motive });
// Defaults to EVIDENCE: the data arrived and is not enough; missing parameter and missing facts say
// so explicitly and the collector's declarations carry its own cause.
const notMeasured = (motive: string, cause: ENSGapCause = 'EVIDENCE'): Measurement => ({
  estado: 'NO_EVALUABLE',
  motivo: motive,
  causa: cause,
});

// Cause of several unmeasured measurements, same order as the engine (`resolveGapCause`):
// COLLECTION only if all say so, CONFIGURATION if any does, otherwise EVIDENCE.
const commonGapCause = (measurements: Measurement[]): ENSGapCause | undefined => {
  const causes = measurements
    .filter(m => m.estado === 'NO_EVALUABLE')
    .map(m => m.causa || 'EVIDENCE');

  if (!causes.length) {
    return undefined;
  }

  if (causes.every(c => c === 'COLLECTION')) {
    return 'COLLECTION';
  }

  return causes.includes('CONFIGURATION') ? 'CONFIGURATION' : 'EVIDENCE';
};

const SEVERITY: Record<Measurement['estado'], number> = {
  NO_APLICA: -1,
  CUMPLE: 0,
  NO_EVALUABLE: 1,
  NO_CUMPLE: 2,
};

const worstStatus = (measurements: Measurement[]): Measurement['estado'] =>
  measurements.reduce<Measurement['estado']>(
    (actual, measurement) =>
      SEVERITY[measurement.estado] > SEVERITY[actual] ? measurement.estado : actual,
    'CUMPLE'
  );

// Several measurements into one: worst status, with the reason that explains it (what fails or is
// missing; if all comply, what was measured).
const combineMeasurements = (partes: Measurement[]): Measurement => {
  const status = worstStatus(partes);

  if (status === 'CUMPLE') {
    return compliant(partes.map(p => p.motivo).join(' '));
  }

  const owners = partes.filter(p => p.estado === status);
  const also = partes
    .filter(p => p.estado !== status && p.estado !== 'CUMPLE' && p.estado !== 'NO_APLICA')
    .map(p => p.motivo);

  return {
    estado: status,
    motivo: [...owners.map(p => p.motivo), ...(also.length ? [`Además: ${also.join(' ')}`] : [])].join(' '),
    ...(status === 'NO_EVALUABLE' ? { causa: commonGapCause(owners) } : {}),
  };
};


// The normalizer splits an event with `evidence_id=A,B` into one per evidence (`<id>#A`, `<id>#B`);
// the FACT is judged here, so it counts once.
const facts = (
  context: ENSPolicyContext,
  type: string
): ENSNormalizedEvent[] => {
  const seen = new Set<string>();

  return context.events.filter(event => {
    if (event.controlId !== CONTROL || event.eventType !== type) {
      return false;
    }

    // A fact without `origen` is from the previous vocabulary (heartbeat and states of the former
    // collector) and is not judged; otherwise an updated machine's old heartbeat would show as one
    // more collector that stopped reporting.
    if (!factField(event, 'origen')) {
      return false;
    }

    const base = String(event.id || '').split('#')[0];

    if (seen.has(base)) {
      return false;
    }

    seen.add(base);

    return true;
  });
};

const factField = (event: ENSNormalizedEvent, name: string): string => {
  const value =
    event.attributes && Object.prototype.hasOwnProperty.call(event.attributes, name)
      ? event.attributes[name]
      : undefined;

  return value === undefined || value === null ? '' : String(value).trim();
};

// `-` is the contract's «nothing there»: no good backup, no retention, no key.
const isEmptyField = (text: string): boolean => text === '' || text === '-';

const parseNumber = (text: string): number | undefined => {
  const clean = String(text).trim().replace(',', '.');

  if (!/^[+-]?\d+(\.\d+)?$/.test(clean)) {
    return undefined;
  }

  const value = Number(clean);

  return Number.isFinite(value) ? value : undefined;
};

const parseInstant = (text: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    return undefined;
  }

  const value = new Date(text).getTime();

  return Number.isFinite(value) ? value : undefined;
};

// Permission mode in octal (`750`, `0600`).
const octal = (text: string): number | undefined =>
  /^[0-7]{3,4}$/.test(text) ? parseInt(text, 8) : undefined;

const eventTime = (event: ENSNormalizedEvent): number => {
  const t = Date.parse(event.timestamp);

  return Number.isNaN(t) ? 0 : t;
};

const iso = (t: number): string => new Date(t).toISOString().replace('.000Z', 'Z');

const formatHours = (ms: number): string => (ms / HOUR_MS).toFixed(1);

const wholeDays = (ms: number): number => Math.floor(ms / DAY_MS);

const formatList = (items: string[], max = 5): string =>
  items.length > max
    ? `${items.slice(0, max).join('; ')} y ${items.length - max} más`
    : items.join('; ');

const mostRecent = (events: ENSNormalizedEvent[]): ENSNormalizedEvent =>
  [...events].sort((a, b) => eventTime(b) - eventTime(a))[0];

// A4 · the comma-separated mount points of `montajes_omitidos` and `montajes_omitidos_aceptados`.
// `-` (no log for that run) and empty (none left out) read the same: empty set.
const omittedMounts = (text: string): string[] =>
  isEmptyField(text) ? [] : text.split(',').map(m => m.trim()).filter(Boolean);


const OBJECT: Record<string, string> = {
  fichero: 'copia de ficheros',
  buzones: 'copia de los buzones',
  directorio: 'copia del directorio',
};

// A fact belongs to an ORIGIN and an OBJECT (the pair) and, if the collector distinguishes it, to
// one backup job (`backup_id`). A fact without `backup_id` covers the whole pair (the PBS schedule
// read from cron applies to all its backup-ids).
const pairOf = (e: ENSNormalizedEvent): string => `${factField(e, 'origen')}|${factField(e, 'objeto')}`;

const backupId = (e: ENSNormalizedEvent): string => factField(e, 'backup_id');

// The backup of a fact, for those grouped by backup (EV-05).
const keyOf = (e: ENSNormalizedEvent): string => `${pairOf(e)}|${backupId(e)}`;

const nameOf = (e: ENSNormalizedEvent): string => {
  const object = factField(e, 'objeto');
  const id = backupId(e);

  return `${OBJECT[object] || (object ? `copia de ${object}` : 'copia sin objeto declarado')}${id ? ` «${id}»` : ''} (${factField(e, 'origen') || 'origen sin declarar'})`;
};

// The pair without the backup job: the restore test belongs to the pair.
const pairName = (e: ENSNormalizedEvent): string => {
  const object = factField(e, 'objeto');

  return `${OBJECT[object] || (object ? `copia de ${object}` : 'copia sin objeto declarado')} (${factField(e, 'origen') || 'origen sin declarar'})`;
};

const OBJECT_LABEL: Record<string, string> = {
  fichero: 'los ficheros',
  buzones: 'los buzones',
  directorio: 'el directorio',
};

// STATE facts of the contract: re-emitted whole each run, they say which backups the machine has
// today.
const STATUS_TYPES = ['backup_run', 'backup_schedule', 'backup_retention', 'backup_access', 'backup_storage'];


// A machine may have TWO mp.info.6 collectors (PBS and Zimbra, each hourly at its own minute);
// one's run says nothing about the other's state, so the last run is looked up PER ORIGIN (as the
// engine does when trimming by heartbeat, see `stateFactCollectorField`).
type OriginRun = {
  origen: string;
  // State facts of its last run: per type, what was emitted in the hour before its last fact, if
  // not older than FRESHNESS_HOURS.
  vigentes: ENSNormalizedEvent[];
  // Its last state fact, current or not.
  ultimo: number;
};

const runsByOrigin = (
  context: ENSPolicyContext,
  types: string[],
  now: number
): OriginRun[] => {
  const all = types
    .flatMap(type => facts(context, type))
    .filter(e => eventTime(e) <= now + FUTURE_TOLERANCE_MS);

  return Array.from(new Set(all.map(e => factField(e, 'origen')))).map(origin => {
    const their = all.filter(e => factField(e, 'origen') === origin);

    return {
      origen: origin,
      ultimo: Math.max(...their.map(eventTime)),
      vigentes: types.flatMap(type => {
        const ofType = their.filter(e => e.eventType === type);

        if (!ofType.length) {
          return [];
        }

        const lastOfType = Math.max(...ofType.map(eventTime));

        return now - lastOfType > FRESHNESS_HOURS * HOUR_MS
          ? []
          : ofType.filter(e => lastOfType - eventTime(e) < HOUR_MS);
      }),
    };
  });
};

// Current state facts of all origins.
const current = (context: ENSPolicyContext, type: string, now: number): ENSNormalizedEvent[] =>
  runsByOrigin(context, [type], now).flatMap(p => p.vigentes);

// What the collector declared it could not measure for an evidence. Only an `evidence_state` with
// `estado=NO_EVALUABLE` counts: the collector sets no verdicts and an old one that does is not
// read.
const degradations = (
  context: ENSPolicyContext,
  evidence: string,
  now: number
): ENSNormalizedEvent[] =>
  facts(context, 'evidence_state').filter(
    e =>
      factField(e, 'evidence_id').split(',').map(x => x.trim()).includes(evidence) &&
      String(e.status || factField(e, 'estado')).toUpperCase() === 'NO_EVALUABLE' &&
      eventTime(e) <= now + FUTURE_TOLERANCE_MS
  );

// With the cause IT declares (it knows whether a record is missing in the organization,
// CONFIGURATION, or a source could not be read, COLLECTION); COLLECTION if none.
const asDegradation = (e: ENSNormalizedEvent): Measurement => {
  const declared = factField(e, 'causa').toUpperCase();
  const cause: ENSGapCause = ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'].includes(declared)
    ? (declared as ENSGapCause)
    : 'COLLECTION';

  return notMeasured(
    `${nameOf(e)}: el recolector no ha podido medirlo${declared ? ` (${declared})` : ''}: ${factField(e, 'motivo') || 'sin motivo declarado'}.`,
    cause
  );
};

const withoutFacts = (last: number | undefined, whatIsMissing: string): Measurement =>
  notMeasured(
    last
      ? `El último ${whatIsMissing} es del ${iso(last)}, hace más de ${FRESHNESS_HOURS} h: el recolector de mp.info.6 no está informando.`
      : `No consta ningún ${whatIsMissing} de esta máquina: el recolector de mp.info.6 no está desplegado en ella o no informa.`,
    'COLLECTION'
  );

// A degradation against the facts it declares. From a run AFTER all of them it REPLACES them
// (today's state could not be seen); from the SAME run it is ADDED to what was measured; with a
// later fact it no longer counts.
const againstFacts = (
  coveredFacts: ENSNormalizedEvent[],
  degradation: ENSNormalizedEvent | undefined
): 'sustituye' | 'suma' | 'no_cuenta' => {
  if (!degradation) {
    return 'no_cuenta';
  }

  if (!coveredFacts.length) {
    return 'sustituye';
  }

  const last = Math.max(...coveredFacts.map(eventTime));
  const t = eventTime(degradation);

  if (t > last + SAME_RUN_WINDOW_MS) {
    return 'sustituye';
  }

  return t >= last - SAME_RUN_WINDOW_MS ? 'suma' : 'no_cuenta';
};

// Judges a STATE evidence backup by backup: per origin, the facts of its last run are split by pair
// and then by `backup_id` (a fact without it applies to all backups of the pair); each backup is
// judged by `judges` with all its facts of that run and the worst wins.
// Degradations count if younger than FRESHNESS_HOURS and per `againstFacts`: a backup's against its
// own facts, the whole pair's against all the pair's. An origin whose collector stopped reporting
// is NO_EVALUABLE even if the other reports hourly.
const byBackup = (
  context: ENSPolicyContext,
  evidence: string,
  types: string[],
  now: number,
  whatIsMissing: string,
  judges: (name: string, backupFacts: ENSNormalizedEvent[]) => Measurement
): Measurement => {
  const runs = runsByOrigin(context, types, now);
  const declared = degradations(context, evidence, now);
  const recent = declared.filter(e => now - eventTime(e) <= FRESHNESS_HOURS * HOUR_MS);
  const origins = Array.from(
    new Set([...runs.map(p => p.origen), ...recent.map(e => factField(e, 'origen'))])
  );

  if (!origins.length) {
    const last = declared.length ? Math.max(...declared.map(eventTime)) : undefined;

    return withoutFacts(last, whatIsMissing);
  }

  const lastOf = (events: ENSNormalizedEvent[]): ENSNormalizedEvent | undefined =>
    events.length ? mostRecent(events) : undefined;

  const measurements = origins.flatMap(origin => {
    const run = runs.find(p => p.origen === origin);
    const their = run ? run.vigentes : [];
    const ownDegradations = recent.filter(e => factField(e, 'origen') === origin);

    if (!their.length && !ownDegradations.length) {
      return [withoutFacts(run?.ultimo, `${whatIsMissing} de origen ${origin || 'sin declarar'}`)];
    }

    const pairs = Array.from(new Set([...their, ...ownDegradations].map(pairOf)));

    return pairs.flatMap(pair => {
      const ofPair = their.filter(e => pairOf(e) === pair);
      const pairDegradations = ownDegradations.filter(e => pairOf(e) === pair);
      const generales = ofPair.filter(e => !backupId(e));
      const ids = Array.from(
        new Set([...ofPair, ...pairDegradations].map(backupId).filter(Boolean))
      );

      const backups = ids.length
        ? ids.map(id => ({ id, hechos: [...ofPair.filter(e => backupId(e) === id), ...generales] }))
        : generales.length
        ? [{ id: '', hechos: generales }]
        : [];

      const pairMeasurements = backups.map(backup => {
        const own = backup.hechos.filter(e => backupId(e) === backup.id);
        const degradation = backup.id
          ? lastOf(pairDegradations.filter(e => backupId(e) === backup.id))
          : undefined;
        const against = againstFacts(own, degradation);

        if (against === 'sustituye') {
          return asDegradation(degradation as ENSNormalizedEvent);
        }

        const measurement = own.length
          ? judges(nameOf(own[0]), ofLastRun(backup.hechos, types))
          : judges(nameOf(backup.hechos[0]), ofLastRun(backup.hechos, types));

        return against === 'suma' ? combineMeasurements([measurement, asDegradation(degradation as ENSNormalizedEvent)]) : measurement;
      });

      // The whole pair's degradation, against all the pair's facts.
      const general = lastOf(pairDegradations.filter(e => !backupId(e)));
      const against = againstFacts(ofPair, general);

      if (against === 'sustituye') {
        return [asDegradation(general as ENSNormalizedEvent)];
      }

      return against === 'suma' ? [...pairMeasurements, asDegradation(general as ENSNormalizedEvent)] : pairMeasurements;
    });
  });

  return combineMeasurements(measurements);
};

// A backup's facts in its last run, type by type: the schedule may arrive in another run than the
// backup state.
const ofLastRun = (backup: ENSNormalizedEvent[], types: string[]): ENSNormalizedEvent[] =>
  types.flatMap(type => {
    const ofType = backup.filter(e => e.eventType === type);
    const lastOfType = Math.max(...ofType.map(eventTime));

    return ofType.filter(e => lastOfType - eventTime(e) <= SAME_RUN_WINDOW_MS);
  });


const findParameter = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

const parameterDisplayName = (context: ENSPolicyContext, id: string): string => {
  const p = findParameter(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

const positiveScalar = (context: ENSPolicyContext, id: string): number | undefined => {
  const value = findParameter(context, id)?.value;

  if (value === undefined || value === null || Array.isArray(value)) {
    return undefined;
  }

  return parseNumber(String(value));
};

// Entries of a list parameter without repeats. A lone number or boolean is not a list.
const entries = (context: ENSPolicyContext, id: string): string[] => {
  const value = findParameter(context, id)?.value;

  if (!Array.isArray(value) && typeof value !== 'string') {
    return [];
  }

  return Array.from(new Set(toParameterListItems(value)));
};

const missingParameter = (context: ENSPolicyContext, id: string, purpose: string): Measurement =>
  notMeasured(`${parameterDisplayName(context, id)} está sin configurar: no hay contra qué juzgar ${purpose}.`, 'CONFIGURATION');

// P-04 machines, each with its criticality (`srv-bd01 | ALTA`).
const scope = (context: ENSPolicyContext): { maquina: string; criticidad: string }[] =>
  entries(context, 'P-04')
    .map(entry => {
      const [machine, criticality] = toTableRowCells(entry);

      return { maquina: machine || '', criticidad: (criticality || '').toUpperCase() };
    })
    .filter(row => row.maquina);

// The row's machine: that of its own facts.
const rowMachine = (context: ENSPolicyContext): string | undefined =>
  context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName;


// EV-01 · the last good backup exists and the last run does not contradict it. `ultima_correcta=-`
// is a measured fact: the collector read the backup system and there is no good one.
const ev01 = (context: ENSPolicyContext, now: number): Measurement =>
  byBackup(context, 'EV-01', ['backup_run'], now, 'estado de las copias', (name, backups) =>
    combineMeasurements(
      backups.map(e => {
        const correct = factField(e, 'ultima_correcta');
        const failed = factField(e, 'ultima_fallida');
        const withError = factField(e, 'resultado_ultima') === 'error';
        const onFailure = !isEmptyField(failed) ? ` el ${failed}` : '';
        const partes: Measurement[] = [];

        if (isEmptyField(correct)) {
          partes.push(
            nonCompliant(
              `${name}: no consta ninguna copia terminada correctamente${withError ? `; la última terminó con error${onFailure}` : ''}.`
            )
          );
        } else {
          const tc = parseInstant(correct);

          if (tc === undefined) {
            partes.push(notMeasured(`${name}: la fecha de la última copia correcta no se puede leer (${correct}).`));
          } else {
            const tf = parseInstant(failed);

            if (withError || (tf !== undefined && tf > tc)) {
              partes.push(nonCompliant(`${name}: la última ejecución de la copia terminó con error${onFailure}; la última correcta es del ${correct}.`));
            } else {
              const type = factField(e, 'tipo');
              const destination = factField(e, 'destino');

              partes.push(
                compliant(
                  `${name}: última copia correcta el ${correct}${type || destination ? ` (${[type, destination ? `destino ${destination}` : ''].filter(Boolean).join(', ')})` : ''}.`
                )
              );
            }
          }
        }

        // A4 · separately mounted disks the last run left out of the backup leave data unprotected
        // even if the backup ended well; those the organization accepts on purpose do not count but
        // are cited.
        const omitted = omittedMounts(factField(e, 'montajes_omitidos'));

        if (omitted.length) {
          partes.push(
            nonCompliant(
              `${name}: deja fuera de la copia ${formatList(omitted)}: están en otro disco montado aparte y no se incluyeron en la copia.`
            )
          );
        }

        const measurement = combineMeasurements(partes);
        const accepted = omittedMounts(factField(e, 'montajes_omitidos_aceptados'));

        return accepted.length
          ? { ...measurement, motivo: `${measurement.motivo} La organización acepta la omisión de ${formatList(accepted)}.` }
          : measurement;
      })
    )
  );

// EV-02 · age of the last good backup against P-01 + P-02, and the schedule, if any, against P-01.
// Backup deadline: P-01 plus the P-02 margin. P-02 without value applies no margin (per its sheet);
// an unreadable value is an illegible margin, not a missing one.
const backupDeadline = (
  context: ENSPolicyContext
): { frecuencia: number; margen: number; plazo: number } | Measurement => {
  const frequency = positiveScalar(context, 'P-01');

  if (frequency === undefined || frequency <= 0) {
    return missingParameter(context, 'P-01', 'la antigüedad de la última copia');
  }

  const declaredMargin = findParameter(context, 'P-02')?.value;
  const margin =
    declaredMargin === undefined || String(declaredMargin).trim() === ''
      ? 0
      : positiveScalar(context, 'P-02');

  if (margin === undefined || margin < 0) {
    return notMeasured(`${parameterDisplayName(context, 'P-02')} tiene un valor que no es un número de horas (${String(declaredMargin)}).`, 'CONFIGURATION');
  }

  return { frecuencia: frequency, margen: margin, plazo: frequency + margin };
};

const ev02 = (context: ENSPolicyContext, now: number): Measurement => {
  const readDeadline = backupDeadline(context);

  if ('estado' in readDeadline) {
    return readDeadline;
  }

  const { frecuencia: frequency, margen: margin, plazo: deadline } = readDeadline;
  const deadlineText = `las ${deadline} h de P-01 (${frequency} h) + P-02 (${margin} h)`;

  return byBackup(context, 'EV-02', ['backup_run', 'backup_schedule'], now, 'estado de las copias', (name, backups) => {
    const runs = backups.filter(e => e.eventType === 'backup_run');
    const plans = backups.filter(e => e.eventType === 'backup_schedule');
    const partes: Measurement[] = [];

    // Without the backup state, what is missing is a fact the collector did not deliver:
    // COLLECTION, like the degradation that usually accompanies it.
    if (!runs.length) {
      partes.push(notMeasured(`${name}: consta su planificación pero no el estado de la última copia.`, 'COLLECTION'));
    }

    runs.forEach(e => {
      const correct = factField(e, 'ultima_correcta');

      if (isEmptyField(correct)) {
        partes.push(nonCompliant(`${name}: no consta ninguna copia correcta, así que ninguna está dentro de ${deadlineText}.`));

        return;
      }

      const tc = parseInstant(correct);

      if (tc === undefined || tc > now + FUTURE_TOLERANCE_MS) {
        partes.push(notMeasured(`${name}: la fecha de la última copia correcta no es válida (${correct}).`));

        return;
      }

      const age = now - tc;

      partes.push(
        age > deadline * HOUR_MS
          ? nonCompliant(`${name}: la última copia correcta es del ${correct}, hace ${formatHours(age)} h, más que ${deadlineText}.`)
          : compliant(`${name}: última copia correcta hace ${formatHours(age)} h, dentro de ${deadlineText}.`)
      );
    });

    // `planificacion=-` is a MEASURED absence: the collector read where it is scheduled and nothing
    // is.
    const withPlan = plans.filter(e => !isEmptyField(factField(e, 'planificacion')));
    const withoutPlan = plans.filter(e => isEmptyField(factField(e, 'planificacion')));

    if (!withPlan.length && withoutPlan.length) {
      const source = factField(withoutPlan[0], 'fuente');

      partes.push(nonCompliant(`${name}: no hay ninguna copia planificada${source ? ` (según ${source})` : ''}.`));
    }

    // The schedule: the backup's most frequent one (weekly full plus daily incremental schedule one
    // a day).
    const intervals = withPlan
      .map(e => ({ e, cada: parseNumber(factField(e, 'intervalo_horas')) }))
      .filter((p): p is { e: ENSNormalizedEvent; cada: number } => p.cada !== undefined && p.cada > 0)
      .sort((a, b) => a.cada - b.cada);

    if (intervals.length) {
      const { e, cada: each } = intervals[0];
      const asWhat = `${factField(e, 'planificacion') || 'sin describir'}, ${factField(e, 'fuente') || 'fuente sin declarar'}`;

      partes.push(
        each > frequency
          ? nonCompliant(`${name}: está planificada cada ${each} h (${asWhat}), más espaciada que las ${frequency} h de P-01.`)
          : compliant(`${name}: planificada cada ${each} h (${asWhat}).`)
      );
    }

    return combineMeasurements(partes);
  });
};

// EV-03 · configured retention against P-03, with the oldest backup kept. Without configured
// retention the only proof the period is kept is such an old backup.
const ev03 = (context: ENSPolicyContext, now: number): Measurement => {
  const min = positiveScalar(context, 'P-03');

  if (min === undefined || min <= 0) {
    return missingParameter(context, 'P-03', 'cuánto tiempo se conservan las copias');
  }

  return byBackup(context, 'EV-03', ['backup_retention'], now, 'estado de la retención de las copias', (name, backups) =>
    combineMeasurements(
      backups.map(e => {
        const configured = factField(e, 'retencion_dias');
        const retention = parseNumber(configured);
        const old = factField(e, 'copia_mas_antigua');
        const ta = parseInstant(old);
        const keeps = ta !== undefined ? ` La copia más antigua que se conserva es del ${old} (${wholeDays(now - ta)} días).` : '';

        if (retention !== undefined) {
          return retention < min
            ? nonCompliant(`${name}: retención configurada de ${retention} días, menos que los ${min} de P-03.${keeps}`)
            : compliant(`${name}: retención configurada de ${retention} días, al menos los ${min} de P-03.${keeps}`);
        }

        if (!isEmptyField(configured)) {
          return notMeasured(`${name}: la retención configurada no es un número de días (${configured}).`);
        }

        if (ta !== undefined && now - ta >= min * DAY_MS) {
          return compliant(`${name}: no consta una retención configurada, y se conservan copias desde el ${old} (${wholeDays(now - ta)} días), al menos los ${min} de P-03.`);
        }

        return notMeasured(
          `${name}: no consta una retención configurada${ta !== undefined ? ` y la copia más antigua (${old}, ${wholeDays(now - ta)} días) no llega a los ${min} de P-03` : ''}: no se puede afirmar que las copias se conserven ese plazo.`
        );
      })
    )
  );
};

// EV-04 · who can read the repository against P-07, and that the encryption key is readable only by
// its owner.
const ev04 = (context: ENSPolicyContext, now: number): Measurement => {
  const authorized = entries(context, 'P-07');

  if (!authorized.length) {
    return missingParameter(context, 'P-07', 'quién puede leer las copias');
  }

  return byBackup(context, 'EV-04', ['backup_access'], now, 'estado del acceso a las copias', (name, backups) =>
    combineMeasurements(
      backups.map(e => {
        const path = factField(e, 'ruta') || '(ruta sin declarar)';
        const mode = factField(e, 'modo');
        const permissions = octal(mode);
        // `-` is the empty set (nobody besides root, who reads everything); an empty field means
        // the collector did not report it.
        const declared = factField(e, 'cuentas_con_lectura');
        const accounts = declared
          .split(',')
          .map(c => c.trim())
          .filter(c => c && c !== '-');
        const partes: Measurement[] = [];

        if (accounts.includes('*') || (permissions !== undefined && (permissions & 0o004) !== 0)) {
          partes.push(nonCompliant(`${name}: el repositorio ${path}${mode ? ` (modo ${mode})` : ''} lo puede leer cualquier cuenta de la máquina.`));
        }

        // LITERAL comparison: on Linux 'Backup' and 'backup' are two accounts.
        const foreign = accounts.filter(c => c !== '*' && !authorized.includes(c));

        if (foreign.length) {
          partes.push(nonCompliant(`${name}: el repositorio ${path} lo pueden leer cuentas que P-07 no autoriza: ${foreign.join(', ')}.`));
        }

        if (declared === '') {
          partes.push(notMeasured(`${name}: el recolector no ha informado de qué cuentas pueden leer ${path}.`));
        } else if (!partes.length) {
          partes.push(
            compliant(
              accounts.length
                ? `${name}: ${path} solo lo pueden leer cuentas autorizadas en P-07 (${accounts.join(', ')}).`
                : `${name}: ${path} no lo puede leer ninguna cuenta además de root.`
            )
          );
        }

        const key = factField(e, 'clave_ruta');

        if (!isEmptyField(key)) {
          const modeKey = factField(e, 'clave_modo');
          const permissionsKey = octal(modeKey);

          // The key is readable only by its owner (0600 or 0400): with group read it already fails,
          // since a reader decrypts every backup and the file's group is usually a service's, not a
          // P-07 account.
          if (permissionsKey === undefined) {
            partes.push(notMeasured(`${name}: no se ha podido leer el modo de la clave de cifrado ${key} (${modeKey || 'vacío'}).`));
          } else if ((permissionsKey & 0o044) !== 0) {
            const who =
              (permissionsKey & 0o004) !== 0
                ? 'la puede leer cualquier cuenta de la máquina'
                : 'la puede leer su grupo';

            partes.push(nonCompliant(`${name}: la clave de cifrado ${key} tiene modo ${modeKey}: ${who}; tiene que ser 0600 o 0400, solo su dueño.`));
          } else {
            partes.push(compliant(`${name}: la clave de cifrado ${key} (modo ${modeKey}) solo la puede leer su dueño.`));
          }
        }

        return combineMeasurements(partes);
      })
    )
  );
};

// P-05 deadline for the row's machine: one number of days for all, or a contract per criticality
// (`ALTA=30; MEDIA=90`) resolved with the criticality P-04 declares for it.
const restoreDeadline = (context: ENSPolicyContext): number | Measurement => {
  const direct = positiveScalar(context, 'P-05');

  if (direct !== undefined) {
    return direct > 0
      ? direct
      : notMeasured(`${parameterDisplayName(context, 'P-05')} no es un plazo en días (${direct}).`, 'CONFIGURATION');
  }

  const contract = entries(context, 'P-05');

  if (!contract.length) {
    return missingParameter(context, 'P-05', 'cada cuánto tiene que probarse la restauración');
  }

  let general: number | undefined;
  const byCriticality = new Map<string, number>();

  contract.forEach(entry => {
    const pair = entry.match(/^(ALTA|MEDIA|BAJA)\s*=\s*(\d+)$/i);

    if (pair) {
      byCriticality.set(pair[1].toUpperCase(), Number(pair[2]));
    } else if (/^\d+$/.test(entry)) {
      general = Number(entry);
    }
  });

  const machine = rowMachine(context);
  const criticality = machine
    ? scope(context).find(row => row.maquina.toLowerCase() === machine.toLowerCase())?.criticidad
    : undefined;
  const deadline = (criticality && byCriticality.get(criticality)) || general;

  return deadline !== undefined && deadline > 0
    ? deadline
    : notMeasured(
        `${parameterDisplayName(context, 'P-05')} no fija un plazo para ${machine ? `${machine} (criticidad en P-04: ${criticality || 'sin declarar'})` : 'esta máquina'}.`,
        'CONFIGURATION'
      );
};

const RESTORED: Record<string, string> = {
  fichero: 'el fichero restaurado',
  buzones: 'la cuenta restaurada',
  directorio: 'la copia restaurada del directorio',
};

// EV-05 · the latest restore test of each backup against P-05. It is an ACTION: every test of the
// window counts and the latest wins per backup (a failed test yesterday is not hidden by a good one
// three days ago). A failed cleanup leaves restored data in production: no clean CUMPLE, and the
// collector does not repeat until resolved.
const ev05 = (context: ENSPolicyContext, now: number): Measurement => {
  // Deadline first, as in the others: without it there is nothing to judge against.
  const deadline = restoreDeadline(context);

  if (typeof deadline !== 'number') {
    return deadline;
  }

  const tests = facts(context, 'restore_test').filter(e => eventTime(e) <= now + FUTURE_TOLERANCE_MS);
  // The restore test is weekly and so is its degradation: the latest of the window counts, not only
  // of the last hours.
  const declaredDegradations = degradations(context, 'EV-05', now);

  // Backups the machine has today (by last state) and those with any test or degradation: each must
  // account for its restore test. By pair (origin and object), not `backup_id`: the PBS witness
  // lives in one backup-id and covers the pair.
  const presentes = runsByOrigin(context, STATUS_TYPES, now).flatMap(p => p.vigentes);
  const pairs = Array.from(new Set([...presentes, ...tests, ...declaredDegradations].map(pairOf)));

  if (!pairs.length) {
    // With the collector beating it is not a collection failure: the queried window was looked at
    // and holds no test.
    const late = lastHeartbeats(context, now).some(e => now - eventTime(e) <= FRESHNESS_HOURS * HOUR_MS);

    return notMeasured(
      late
        ? `No se ha visto ninguna prueba de restauración de esta máquina en la ventana consultada, y el recolector de mp.info.6 sí informa: no hay prueba que demuestre que las copias se restauran dentro de los ${deadline} días de P-05.`
        : 'No se ha visto ninguna prueba de restauración de esta máquina en la ventana consultada, ni ningún latido reciente del recolector de mp.info.6: no está desplegado o no informa.',
      late ? 'EVIDENCE' : 'COLLECTION'
    );
  }

  const date = (e: ENSNormalizedEvent): number => parseInstant(factField(e, 'fecha')) ?? eventTime(e);

  return combineMeasurements(
    pairs.map(pair => {
      const their = tests.filter(e => pairOf(e) === pair);

      if (!their.length) {
        const declaredEvent = [...declaredDegradations.filter(e => pairOf(e) === pair)].sort((a, b) => eventTime(b) - eventTime(a))[0];

        if (declaredEvent) {
          return asDegradation(declaredEvent);
        }

        const e = presentes.find(h => pairOf(h) === pair) as ENSNormalizedEvent;

        return notMeasured(
          `No consta ninguna prueba de restauración de ${OBJECT_LABEL[factField(e, 'objeto')] || `la copia de ${factField(e, 'objeto') || 'objeto sin declarar'}`} (${factField(e, 'origen')}) en la ventana consultada, y el recolector no ha declarado por qué: no hay prueba de que esa copia se pueda recuperar.`
        );
      }

      const e = [...their].sort((a, b) => date(b) - date(a))[0];
      const name = pairName(e);
      const when = date(e);
      const witness = factField(e, 'testigo');
      const detail = factField(e, 'detalle');
      const backup = backupId(e) ? ` de la copia «${backupId(e)}»` : '';
      // Declared test (`testigo=declarado`, `detalle=declarada: <checked>`): an origin without a
      // technical witness where the organization declares the test by hand. No published collector
      // emits it; kept as generic support of the contract. Judged like any other test, but the
      // reason says it is declared and cites what was checked.
      const isDeclared = witness === 'declarado';
      const verified = detail.replace(/^declarada:\s*/i, '').trim();
      const test = isDeclared
        ? `${name}: prueba declarada por la organización del ${iso(when)}${backup}, sobre «${verified || 'sin detalle'}»`
        : `${name}: prueba del ${iso(when)}${backup}${witness ? ` sobre el testigo ${witness}` : ''}`;
      const detailExtra = !isDeclared && detail ? ` (${detail})` : '';
      const correct = factField(e, 'resultado') === 'ok' && factField(e, 'coincide') === 'si';
      const partes: Measurement[] = [];

      if (factField(e, 'resultado') !== 'ok') {
        partes.push(nonCompliant(`${test}: la restauración falló${detailExtra}.`));
      } else if (factField(e, 'coincide') !== 'si') {
        partes.push(nonCompliant(`${test}: se restauró pero el contenido no coincide con el esperado${detailExtra}.`));
      } else if (now - when > deadline * DAY_MS) {
        partes.push(nonCompliant(`${test}: correcta, pero tiene ${wholeDays(now - when)} días, más que los ${deadline} de P-05.`));
      } else {
        partes.push(compliant(`${test}: restauración correcta y contenido verificado, dentro de los ${deadline} días de P-05.`));
      }

      if (factField(e, 'limpieza') === 'error') {
        const restored = RESTORED[factField(e, 'objeto')] || 'lo restaurado';

        partes.push(
          notMeasured(
            `${name}: ${correct ? 'restauración correcta pero' : 'además,'} ${restored} no se pudo borrar${witness ? ` (testigo ${witness})` : ''}: la prueba ha dejado rastro en producción y el recolector no la repetirá hasta que se limpie.`,
            'EVIDENCE'
          )
        );
      }

      return combineMeasurements(partes);
    })
  );
};

// EV-06 · at least one destination outside the machine and active, per backup.
const ev06 = (context: ENSPolicyContext, now: number): Measurement => {
  const declaresAlternative = ['si', 'sí', 'true', 'yes'].includes(
    String(findParameter(context, 'P-08')?.value ?? '').trim().toLowerCase()
  );

  return byBackup(context, 'EV-06', ['backup_storage'], now, 'estado de los destinos de las copias', (name, destinations) => {
    const describe = (e: ENSNormalizedEvent) =>
      `${factField(e, 'destino') || '(destino sin declarar)'} (${[
        factField(e, 'tipo'),
        factField(e, 'misma_maquina') === 'si' ? 'en la misma máquina' : '',
        factField(e, 'activo') !== 'si' ? 'inactivo' : '',
      ]
        .filter(Boolean)
        .join(', ')})`;
    const outside = destinations.filter(e => factField(e, 'misma_maquina') === 'no' && factField(e, 'activo') === 'si');

    if (outside.length) {
      return compliant(`${name}: copia fuera de la máquina y activa en ${outside.map(describe).join(', ')}.`);
    }

    const doubtful = destinations.filter(
      e => !['si', 'no'].includes(factField(e, 'misma_maquina')) || !['si', 'no'].includes(factField(e, 'activo'))
    );

    if (doubtful.length) {
      return notMeasured(`${name}: no consta si ${doubtful.map(describe).join(', ')} está fuera de la máquina y activo.`);
    }

    return nonCompliant(
      `${name}: ningún destino de la copia está fuera de la máquina y activo: ${destinations.map(describe).join('; ')}.${declaresAlternative ? ' P-08 declara que existe copia en ubicación alternativa, y no se observa.' : ''}`
    );
  });
};

// EV-07 · heartbeat: the last run of the collector is recent, finished and declares what it
// covered. The latest heartbeat of each origin: each collector beats on its own and one does not
// accredit the other.
const lastHeartbeats = (context: ENSPolicyContext, now: number): ENSNormalizedEvent[] => {
  const heartbeats = facts(context, 'collector_run').filter(e => eventTime(e) <= now + FUTURE_TOLERANCE_MS);

  return Array.from(new Set(heartbeats.map(e => factField(e, 'origen')))).map(origin =>
    mostRecent(heartbeats.filter(e => factField(e, 'origen') === origin))
  );
};

const describeCollector = (e: ENSNormalizedEvent): string => {
  const origin = factField(e, 'origen');
  const role = factField(e, 'rol');

  return `El recolector${origin ? ` de ${origin}` : ''}${role && role !== origin ? ` (${role})` : ''}`;
};

// EV-07 · heartbeat: the last run of EACH collector is recent, finished (whole or partial) and
// declares what it covered.
const ev07 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeats = lastHeartbeats(context, now);

  if (!heartbeats.length) {
    return withoutFacts(undefined, 'latido del recolector de copias');
  }

  return combineMeasurements(
    heartbeats.map(e => {
      const t = eventTime(e);
      const who = describeCollector(e);

      if (now - t > FRESHNESS_HOURS * HOUR_MS) {
        return notMeasured(`${who} pasó por última vez el ${iso(t)}, hace más de ${FRESHNESS_HOURS} h: no está informando.`, 'COLLECTION');
      }

      const run = `${who} pasó el ${iso(t)}`;
      const result = factField(e, 'resultado');
      const covered = factField(e, 'evidencias_cubiertas')
        .split(',')
        .map(x => x.trim())
        .filter(x => x && x !== '-');

      // A `parcial` run also ran: what it could not look at already carries its own NO_EVALUABLE in
      // the affected evidence.
      if (!['completada', 'ok', 'parcial'].includes(result.toLowerCase())) {
        return notMeasured(`${run} y terminó como «${result || 'sin resultado'}»: los registros de copia de esa pasada no se han interpretado enteros.`, 'COLLECTION');
      }

      if (!covered.length) {
        return notMeasured(`${run} y no declara ninguna evidencia cubierta: no consta qué se ha mirado.`);
      }

      return compliant(
        `${run}, terminó${result.toLowerCase() === 'parcial' ? ' en parte (lo que no pudo mirar sale en su evidencia)' : ''} y declara cubiertas ${formatList(covered, 7)}.`
      );
    })
  );
};

// Measured values for the report: the values behind each measurement, backup by backup, as runtime
// variables, from the same current facts the policy judged.
const variable = (
  name: string,
  value: ENSRuntimeVariable['value'],
  evidenceIds: string[],
  parameterIds: string[],
  description: string
): ENSRuntimeVariable => ({ name, value, parameterIds, evidenceIds, eventIds: [], description });

// The last of each thing: within the hour after a backup, the end-of-backup run and the hourly one
// coexist in the window and the report must name each backup once, with the latest.
const lastOfEach = (
  events: ENSNormalizedEvent[],
  key: (e: ENSNormalizedEvent) => string
): ENSNormalizedEvent[] => {
  const byKey = new Map<string, ENSNormalizedEvent>();

  events.forEach(e => {
    const actual = byKey.get(key(e));

    if (!actual || eventTime(e) > eventTime(actual)) {
      byKey.set(key(e), e);
    }
  });

  return Array.from(byKey.values());
};

const measured = (context: ENSPolicyContext, now: number): ENSRuntimeVariable[] => {
  const result: ENSRuntimeVariable[] = [];
  const backups = lastOfEach(current(context, 'backup_run', now), keyOf);
  const ages = backups
    .map(e => parseInstant(factField(e, 'ultima_correcta')))
    .filter((t): t is number => t !== undefined)
    .map(t => Math.round(((now - t) / HOUR_MS) * 10) / 10);

  if (backups.length) {
    result.push(
      variable(
        'copias_ultima_correcta',
        backups.map(e => {
          const correct = factField(e, 'ultima_correcta');
          const tc = parseInstant(correct);
          const omitted = omittedMounts(factField(e, 'montajes_omitidos'));
          // This row is per backup, so THIS backup's accepted omission always shows here: when
          // another backup's worst result decides EV-01, `combineMeasurements` drops the CUMPLE
          // parts' reason and the citation would vanish if it lived only in the reason.
          const accepted = omittedMounts(factField(e, 'montajes_omitidos_aceptados'));

          return `${nameOf(e)}: ${isEmptyField(correct) ? 'ninguna copia correcta' : `${correct}${tc !== undefined ? `, hace ${formatHours(now - tc)} h` : ''}`}${factField(e, 'resultado_ultima') === 'error' ? `; la última terminó con error${isEmptyField(factField(e, 'ultima_fallida')) ? '' : ` el ${factField(e, 'ultima_fallida')}`}` : ''}${omitted.length ? `; deja fuera ${formatList(omitted)}` : ''}${accepted.length ? `; omisión aceptada por la organización: ${formatList(accepted)}` : ''}`;
        }),
        ['EV-01', 'EV-02'],
        [],
        'Última copia correcta de cada copia en la última pasada de su recolector, y su antigüedad.'
      )
    );
  }

  if (ages.length) {
    result.push(
      variable('copias_antiguedad_maxima_horas', Math.max(...ages), ['EV-02'], [], 'Antigüedad, en horas, de la última copia correcta más vieja entre las copias de la máquina.')
    );
  }

  const deadline = backupDeadline(context);

  if (!('estado' in deadline)) {
    result.push(variable('copias_plazo_horas', deadline.plazo, ['EV-02'], ['P-01', 'P-02'], 'Plazo máximo entre copias correctas: P-01 más el margen de P-02.'));
  }

  const plans = lastOfEach(current(context, 'backup_schedule', now), e => `${keyOf(e)}|${factField(e, 'planificacion')}`);

  if (plans.length) {
    result.push(
      variable(
        'copias_planificacion',
        plans.map(e => `${nameOf(e)}: ${factField(e, 'planificacion') || 'sin describir'}${parseNumber(factField(e, 'intervalo_horas')) !== undefined ? `, cada ${factField(e, 'intervalo_horas')} h` : ''} (${factField(e, 'fuente') || 'fuente sin declarar'})`),
        ['EV-02'],
        [],
        'Planificación de cada copia.'
      )
    );
  }

  const retentions = lastOfEach(current(context, 'backup_retention', now), keyOf);

  if (retentions.length) {
    result.push(
      variable(
        'copias_retencion',
        retentions.map(e => {
          const retention = factField(e, 'retencion_dias');
          const old = factField(e, 'copia_mas_antigua');

          return `${nameOf(e)}: ${isEmptyField(retention) ? 'sin retención configurada' : `${retention} días de retención configurada`}${isEmptyField(old) ? '' : `; la copia más antigua es del ${old}`}`;
        }),
        ['EV-03'],
        [],
        'Retención configurada de cada copia y su copia más antigua.'
      )
    );
  }

  const accesses = lastOfEach(current(context, 'backup_access', now), e => `${keyOf(e)}|${factField(e, 'ruta')}`);

  if (accesses.length) {
    result.push(
      variable(
        'copias_cuentas_con_lectura',
        accesses.map(e => {
          const accounts = factField(e, 'cuentas_con_lectura')
            .split(',')
            .map(c => c.trim())
            .filter(c => c && c !== '-');
          const key = factField(e, 'clave_ruta');

          return `${nameOf(e)}: ${factField(e, 'ruta') || '(ruta sin declarar)'} → ${accounts.length ? accounts.join(', ') : 'sin informar'}${isEmptyField(key) ? '' : `; clave ${key} con modo ${factField(e, 'clave_modo') || 'sin informar'}`}`;
        }),
        ['EV-04'],
        [],
        'Cuentas que pueden leer el repositorio de cada copia y permisos de su clave de cifrado.'
      )
    );
  }

  const tests = facts(context, 'restore_test').filter(e => eventTime(e) <= now + FUTURE_TOLERANCE_MS);

  if (tests.length) {
    const date = (e: ENSNormalizedEvent): number => parseInstant(factField(e, 'fecha')) ?? eventTime(e);
    const last = Array.from(new Set(tests.map(pairOf))).map(
      pair => [...tests.filter(e => pairOf(e) === pair)].sort((a, b) => date(b) - date(a))[0]
    );

    result.push(
      variable(
        'restauracion_ultima_prueba',
        last.map(e => {
          const witness = factField(e, 'testigo');
          const declared = witness === 'declarado';
          // Declared test (generic support, see EV-05): what is checked is what the organization
          // declares to have verified.
          const verified = factField(e, 'detalle').replace(/^declarada:\s*/i, '').trim();
          const who = declared
            ? ` · declarada por la organización: «${verified || 'sin detalle'}»`
            : witness
            ? ` · testigo ${witness}`
            : '';

          return `${nameOf(e)}: ${iso(date(e))} · resultado ${factField(e, 'resultado') || '-'} · coincide ${factField(e, 'coincide') || '-'} · limpieza ${factField(e, 'limpieza') || '-'}${who}`;
        }),
        ['EV-05'],
        [],
        'Prueba de restauración más reciente de cada origen y objeto en la ventana.'
      )
    );
  }

  const deadlineTest = restoreDeadline(context);

  if (typeof deadlineTest === 'number') {
    result.push(variable('restauracion_plazo_dias', deadlineTest, ['EV-05'], ['P-04', 'P-05'], 'Plazo máximo sin una prueba de restauración correcta para esta máquina (P-05).'));
  }

  const destinations = lastOfEach(current(context, 'backup_storage', now), e => `${keyOf(e)}|${factField(e, 'destino')}`);

  if (destinations.length) {
    result.push(
      variable(
        'copias_destinos',
        destinations.map(
          e =>
            `${nameOf(e)}: ${factField(e, 'destino') || '(destino sin declarar)'} (${[
              factField(e, 'tipo'),
              factField(e, 'misma_maquina') === 'no' ? 'fuera de la máquina' : factField(e, 'misma_maquina') === 'si' ? 'en la misma máquina' : '',
              factField(e, 'activo') === 'si' ? 'activo' : 'inactivo',
            ]
              .filter(Boolean)
              .join(', ')})`
        ),
        ['EV-06'],
        [],
        'Destinos de cada copia: dónde están y si están activos.'
      )
    );
  }

  const heartbeats = lastHeartbeats(context, now);

  if (heartbeats.length) {
    result.push(
      variable(
        'recolectores_ultimo_latido',
        heartbeats.map(e => `${factField(e, 'origen') || 'origen sin declarar'}: ${iso(eventTime(e))} · ${factField(e, 'resultado') || 'sin resultado'} · cubiertas ${factField(e, 'evidencias_cubiertas') || '-'}`),
        ['EV-07'],
        [],
        'Última pasada de cada recolector de copias de la máquina.'
      )
    );
  }

  return result;
};


type Type = ENSPolicyDecision['trace']['ruleType'];

// Which evidences measure each requirement: the catalog's (one test checks it); at each level only
// those that apply count (EV-06, the separate copy, only at ALTO).
export const MP_INFO_6_REQUIREMENTS: Record<string, { evidencias: string[]; parametros: string[]; tipo: Type }> = {
  'mp.info.6.1': { evidencias: ['EV-01', 'EV-02', 'EV-07'], parametros: ['P-01', 'P-02', 'P-03', 'P-04', 'P-10'], tipo: 'COVERAGE_REQUIRED' },
  'mp.info.6.2.a': { evidencias: ['EV-01', 'EV-02'], parametros: ['P-01', 'P-02'], tipo: 'MAX_AGE' },
  'mp.info.6.2.b': { evidencias: ['EV-03', 'EV-07'], parametros: ['P-03'], tipo: 'MIN_RETENTION' },
  'mp.info.6.2.c': { evidencias: ['EV-06', 'EV-07'], parametros: ['P-03', 'P-08', 'P-09'], tipo: 'COVERAGE_REQUIRED' },
  'mp.info.6.2.d': { evidencias: ['EV-03', 'EV-04'], parametros: ['P-07'], tipo: 'WHITELIST' },
  'mp.info.6.r1.1': { evidencias: ['EV-05'], parametros: ['P-04', 'P-05', 'P-10'], tipo: 'MAX_AGE' },
  'mp.info.6.r2.1': { evidencias: ['EV-06'], parametros: ['P-08', 'P-09'], tipo: 'CONDITIONAL_REQUIRED' },
};

const decide = (
  requirement: string,
  status: Measurement['estado'],
  evidences: string[],
  parameters: string[],
  type: Type,
  ruleId: string,
  motive: string,
  expected: string,
  cause?: ENSGapCause
): ENSPolicyDecision => ({
  policyId: POLICY,
  requirementId: requirement,
  status: status,
  parameterIds: parameters,
  evidenceIds: evidences,
  eventIds: [],
  runtimeVariables: [],
  trace: {
    ruleId,
    ruleType: type,
    expression: expected,
    expected: expected,
    actual: status,
    result: status === 'CUMPLE',
  },
  reason: motive,
  ...(status === 'NO_EVALUABLE' && cause ? { cause: cause } : {}),
});

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();
  const machines = scope(context);

  // Without any machine in P-04 there is nothing to measure: not a collection or machine failure,
  // the organization has not declared its scope.
  const withoutScope = machines.length
    ? undefined
    : notMeasured(
        `${parameterDisplayName(context, 'P-04')} no declara ninguna máquina: mp.info.6 solo se mide en las máquinas que la organización declara, y sin ninguna no hay qué medir.`,
        'CONFIGURATION'
      );

  // Evidences applying at the evaluated level. One that does not apply is neither measured nor
  // decides any requirement: the table shows it NO_APLICA and the requirement cannot say otherwise.
  const apply = new Set(
    getEvidenceDefinitions(CONTROL)
      .filter(definition => definition.levels.includes(context.level))
      .map(definition => definition.id)
  );

  const measure: Record<string, () => Measurement> = {
    'EV-01': () => ev01(context, now),
    'EV-02': () => ev02(context, now),
    'EV-03': () => ev03(context, now),
    'EV-04': () => ev04(context, now),
    'EV-05': () => ev05(context, now),
    'EV-06': () => ev06(context, now),
    'EV-07': () => ev07(context, now),
  };

  const measurements: Record<string, Measurement> = {};

  Object.keys(measure)
    .filter(id => apply.has(id))
    .forEach(id => {
      measurements[id] = withoutScope || measure[id]();
    });

  const requirementDecisions: ENSPolicyDecision[] = [];
  const evidenceDecisions: ENSPolicyDecision[] = [];

  Object.entries(MP_INFO_6_REQUIREMENTS).forEach(([requirement, definition]) => {
    const own = definition.evidencias
      .filter(id => apply.has(id))
      .map(id => ({ id, medida: measurements[id] }));

    if (!own.length) {
      requirementDecisions.push(
        decide(
          requirement,
          'NO_APLICA',
          [],
          definition.parametros,
          definition.tipo,
          requirement,
          `Ninguna de sus evidencias aplica en el nivel ${context.level}.`,
          'no aplica en este nivel'
        )
      );

      return;
    }

    const status = worstStatus(own.map(p => p.medida));
    const owners = own.filter(p => p.medida.estado === status);

    // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads).
    requirementDecisions.push(
      withReasonParts(decide(
        requirement,
        status,
        owners.map(p => p.id),
        definition.parametros,
        definition.tipo,
        requirement,
        compositeReason(own),
        own.map(p => `${p.id} CUMPLE`).join(' y '),
        commonGapCause(owners.map(p => p.medida))
      ), reasonPartsOf(own))
    );

    // And one per evidence, with ITS status: it carries the measurement to the evidence table (see
    // `policy-evidence-bridge.ts`).
    own.forEach(p =>
      evidenceDecisions.push(
        decide(requirement, p.medida.estado, [p.id], definition.parametros, definition.tipo, `${requirement}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`, p.medida.causa)
      )
    );
  });

  const variables: ENSRuntimeVariable[] = [
    {
      name: 'alcance_declarado',
      value: machines.map(row => row.maquina),
      parameterIds: ['P-04'],
      evidenceIds: [],
      eventIds: [],
      description: machines.length
        ? 'Máquinas en las que la organización declara que se mide mp.info.6 (P-04).'
        : 'P-04 no declara ninguna máquina: mp.info.6 no se mide en ninguna.',
    },
    ...Object.entries(measurements).map(([id, measurement]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: measurement.estado,
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: measurement.motivo,
    })),
    ...(withoutScope ? [] : measured(context, now)),
  ];

  return { decisions: [...requirementDecisions, ...evidenceDecisions], runtimeVariables: variables };
};

export const mpInfo6PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '2.0.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'mp.info.6.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-10'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.info.6.2.a',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'mp.info.6.2.b',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-03', 'EV-07'],
      ruleType: 'MIN_RETENTION',
    },
    {
      requirementId: 'mp.info.6.2.c',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-08', 'P-09'],
      evidenceIds: ['EV-06', 'EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.info.6.2.d',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-03', 'EV-04'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.info.6.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-04', 'P-05', 'P-10'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'mp.info.6.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-06'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
