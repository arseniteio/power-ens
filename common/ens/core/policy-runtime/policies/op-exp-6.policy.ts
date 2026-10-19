// op.exp.6 · Protection against malicious code.
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
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';

const CONTROL = 'op.exp.6';
const POLICY = 'policy.op.exp.6';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Same clock margin as `resolveCollectorCoverage`: a fact from the future proves nothing.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// A heartbeat counts as coverage for 24 h, as in the primitives.
const HEARTBEAT_HOURS = 24;

// `causa` only with NO_EVALUABLE: whose gap it is (see `ENSGapCause`). It reaches the evidence and
// requirement through the decision; without it the card inherited the classic model's cause, which
// does not see the facts the policy reads (op.exp.6.3 said «nothing arrived» when P-05 was
// missing).
type Measurement = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;
  motivo: string;
  causa?: ENSGapCause;
};

const compliant = (motive: string): Measurement => ({ estado: 'CUMPLE', motivo: motive });
const nonCompliant = (motive: string): Measurement => ({ estado: 'NO_CUMPLE', motivo: motive });
// Defaults to EVIDENCE: the data arrived and is not enough. Missing parameter (CONFIGURATION),
// missing facts or heartbeat (COLLECTION) and what the collector declares (`degradacion`) say so
// explicitly.
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

// Several checks of one evidence: the worst wins and the reason counts those that support it.
const combineMeasurements = (measurements: Measurement[]): Measurement => {
  const status = worstStatus(measurements);
  const owners = measurements.filter(m => m.estado === status);

  return {
    estado: status,
    motivo: owners.map(m => m.motivo).join(' '),
    ...(status === 'NO_EVALUABLE' ? { causa: commonGapCause(owners) } : {}),
  };
};


// The normalizer splits an event with `evidence_id=EV-02,EV-10` into one per evidence
// (`<id>#EV-02`, `<id>#EV-10`); the FACT is judged here, so it counts once.
const facts = (
  context: ENSPolicyContext,
  type: string,
  evidence?: string
): ENSNormalizedEvent[] => {
  const seen = new Set<string>();

  return context.events.filter(event => {
    if (event.controlId !== CONTROL || event.eventType !== type) {
      return false;
    }

    if (evidence && event.evidenceId && event.evidenceId !== evidence) {
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

const parseInstant = (text: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    return undefined;
  }

  const value = new Date(text).getTime();

  return Number.isFinite(value) ? value : undefined;
};

const eventTime = (event: ENSNormalizedEvent): number => {
  const t = Date.parse(event.timestamp);

  return Number.isFinite(t) ? t : 0;
};

// Most recent first, nothing dated ahead of the clock.
const recent = (
  events: ENSNormalizedEvent[],
  now: number
): ENSNormalizedEvent[] =>
  events
    .filter(e => eventTime(e) <= now + FUTURE_TOLERANCE_MS)
    .sort((a, b) => eventTime(b) - eventTime(a));

const formatList = (items: string[], max = 5): string =>
  items.length > max
    ? `${items.slice(0, max).join('; ')} y ${items.length - max} más`
    : items.join('; ');

const formatHours = (ms: number): string => (ms / HOUR_MS).toFixed(1);


const findParameter = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

const parameterDisplayName = (context: ENSPolicyContext, id: string): string => {
  const p = findParameter(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

// Table rows split into their declared columns. Without columns the position is not guessed: the
// parameter is treated as not configured.
const tableParameterRows = (
  context: ENSPolicyContext,
  id: string
): Record<string, string>[] | undefined => {
  const p = findParameter(context, id);
  const columns = p?.columns || [];

  if (!p || !columns.length) {
    return undefined;
  }

  const result = toParameterTableRows(p.value)
    .map(row => toTableRowCells(row))
    .filter(cells => cells.some(Boolean))
    .map(cells => {
      const row: Record<string, string> = {};

      columns.forEach((column, i) => {
        row[column.name] = cells[i] || '';
      });

      return row;
    });

  return result.length ? result : undefined;
};

// A positive number (hours or days). Empty or unreadable is «not configured».
const parseNumber = (context: ENSPolicyContext, id: string): number | undefined => {
  const value = findParameter(context, id)?.value;
  const text = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');

  if (!/^\d+(\.\d+)?$/.test(text.trim())) {
    return undefined;
  }

  const n = Number(text.trim());

  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const selection = (context: ENSPolicyContext, id: string): string => {
  const value = findParameter(context, id)?.value;

  return (Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')).trim();
};


// Does the last heartbeat (within 24 h) declare it read this evidence's source? It is the only
// thing that turns a silence into a measurement.
const covered = (
  context: ENSPolicyContext,
  evidence: string,
  now: number
): boolean => {
  const heartbeat = recent(facts(context, 'collector_run'), now).find(
    e => now - eventTime(e) <= HEARTBEAT_HOURS * HOUR_MS
  );

  if (!heartbeat || factField(heartbeat, 'resultado') !== 'completada') {
    return false;
  }

  return factField(heartbeat, 'evidencias_cubiertas')
    .split(',')
    .map(s => s.trim())
    .includes(evidence);
};

// What the collector declared it could not measure for this evidence, with the cause IT declares
// (COLLECTION if none).
const degradation = (
  context: ENSPolicyContext,
  evidence: string,
  now: number
): Measurement | undefined => {
  const e = recent(
    context.events.filter(
      ev =>
        ev.controlId === CONTROL &&
        ev.eventType === 'evidence_state' &&
        ev.evidenceId === evidence
    ),
    now
  )[0];

  if (!e) {
    return undefined;
  }

  const declared = factField(e, 'causa').toUpperCase();

  return notMeasured(
    `El recolector declara que no pudo medirla (${factField(e, 'causa') || 'sin causa'}): ${factField(e, 'motivo')}.`,
    ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'].includes(declared) ? (declared as ENSGapCause) : 'COLLECTION'
  );
};

// What the collector declared or, if nothing, `motivo` with `causa`.
const degradedOr = (
  context: ENSPolicyContext,
  evidence: string,
  now: number,
  motive: string,
  cause: ENSGapCause = 'COLLECTION'
): Measurement => degradation(context, evidence, now) || notMeasured(motive, cause);


type Plane = {
  plano: string;
  equipo: string;
  producto: string;
  productoActivo: string;
  instalado: string;
};

// The last `antimalware_status` of each plane. A STATE fact: the `state-facts.ts` phase already
// left only the last emission.
const planes = (
  context: ENSPolicyContext,
  now: number
): Map<string, Plane> => {
  const result = new Map<string, Plane>();

  recent(facts(context, 'antimalware_status', 'EV-01'), now).forEach(e => {
    const plane = factField(e, 'plano') || 'sistema';

    if (result.has(plane)) {
      return;
    }

    result.set(plane, {
      plano: plane,
      equipo: factField(e, 'equipo'),
      producto: factField(e, 'producto') || 'ninguno',
      productoActivo: factField(e, 'producto_activo') || 'ninguno',
      instalado: factField(e, 'instalado'),
    });
  });

  return result;
};

const active = (p: Plane | undefined): boolean =>
  !!p && p.productoActivo !== '' && p.productoActivo !== 'ninguno';

const hostOf = (
  context: ENSPolicyContext,
  estados: Map<string, Plane>
): string =>
  Array.from(estados.values()).find(p => p.equipo)?.equipo ||
  context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName ||
  '';

// Planes that must have antimalware: those P-02 declares for this host, plus those with one
// running. Without a P-02 row, the system plane: every host has one.
const requiredPlanes = (
  context: ENSPolicyContext,
  estados: Map<string, Plane>
): string[] => {
  const host = hostOf(context, estados);
  const declaredRows = (tableParameterRows(context, 'P-02') || [])
    .filter(f => host && f.equipo === host)
    .map(f => f.plano)
    .filter(Boolean);

  const withProduct = Array.from(estados.values())
    .filter(active)
    .map(p => p.plano);

  const all = Array.from(new Set([...declaredRows, ...withProduct]));

  return all.length ? all : ['sistema'];
};

const describePlane = (p: Plane | undefined, plane: string): string =>
  !p
    ? `el plano ${plane} no consta en ninguna observación del agente`
    : p.instalado === 'si'
      ? `en el plano ${plane} ${p.producto} está instalado y su servicio no está en ejecución`
      : `en el plano ${plane} no hay ningún antimalware instalado`;

// Without antimalware in a required plane nothing has signatures, detects or scans. Returns the
// measurement of that absence, or undefined if all run.
const withoutAntimalware = (
  context: ENSPolicyContext,
  estados: Map<string, Plane>,
  consequence: string,
  planeOnly?: string
): Measurement | undefined => {
  const required = planeOnly ? [planeOnly] : requiredPlanes(context, estados);
  const missing = required.filter(plane => !active(estados.get(plane)));

  if (!missing.length) {
    return undefined;
  }

  return nonCompliant(
    `${formatList(missing.map(plane => describePlane(estados.get(plane), plane)))}: ${consequence}`
  );
};

const withoutStatus = (): Measurement =>
  notMeasured(
    'No consta qué antimalware tiene este equipo: el agente no ha emitido `antimalware_status` (EV-01) en la ventana.',
    'COLLECTION'
  );


const ev02 = (context: ENSPolicyContext, now: number): Measurement => {
  const estados = planes(context, now);

  if (!estados.size) {
    return withoutStatus();
  }

  const required = requiredPlanes(context, estados);
  const measurements: Measurement[] = [];

  const absence = withoutAntimalware(
    context,
    estados,
    'no hay bases de detección que mantener actualizadas.'
  );

  if (absence) {
    measurements.push(absence);
  }

  const limit = parseNumber(context, 'P-03');
  const signatures = recent(facts(context, 'antimalware_signatures_updated', 'EV-02'), now);

  required
    .filter(plane => active(estados.get(plane)))
    .forEach(plane => {
      const dates = signatures
        .filter(e => (factField(e, 'plano') || 'sistema') === plane)
        .map(e => ({ e, t: parseInstant(factField(e, 'fecha')) }))
        .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
          x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS
        )
        .sort((a, b) => b.t - a.t);

      const product = estados.get(plane)!.productoActivo;

      if (!dates.length) {
        const motive = degradation(context, 'EV-02', now);

        measurements.push(
          motive
            ? notMeasured(`Plano ${plane} (${product}): ${motive.motivo}`, motive.causa)
            : nonCompliant(`En el plano ${plane} ${product} está en ejecución y no se observa ninguna base de firmas.`)
        );

        return;
      }

      if (limit === undefined) {
        measurements.push(
          notMeasured(
            `${parameterDisplayName(context, 'P-03')} está sin configurar: las firmas de ${product} (plano ${plane}) son del ${factField(dates[0].e, 'fecha')} y no hay umbral contra el que juzgarlas.`,
            'CONFIGURATION'
          )
        );

        return;
      }

      const age = now - dates[0].t;
      const text = `las firmas de ${product} en el plano ${plane} se publicaron el ${factField(dates[0].e, 'fecha')} (versión ${factField(dates[0].e, 'version') || '?'}, hace ${formatHours(age)} h)`;

      measurements.push(
        age > limit * HOUR_MS
          ? nonCompliant(`${text}, más que las ${limit} h de ${parameterDisplayName(context, 'P-03')}.`)
          : compliant(`${text}, dentro de las ${limit} h de ${parameterDisplayName(context, 'P-03')}.`)
      );
    });

  return combineMeasurements(measurements.length ? measurements : [withoutStatus()]);
};

// EV-04 · a detection is a file, a signature and an instant. The same detection arrives repeated
// (clamd logs the same second twice; clamonacc logs its own without time; a late note is re-emitted
// with clamd's time) and counting it twice would fabricate a «persistent infection». They are
// merged here and the reason says how many notes were merged.
// Without instant: `instante=sin_hora`, or a fact predating the `instante` field that only
// clamonacc.log noted, whose `fecha` was the collector's read time. It counts as a detection (its
// action is judged) but never as a repetition; if a timed detection of the same file and signature
// exists, it is that one.
const REMEDIATES = ['eliminado', 'cuarentena', 'bloqueado'];

const actionWeight = (action: string): number =>
  REMEDIATES.includes(action) ? 3 : action === 'fallida' ? 2 : 1;

const withoutHour = (e: ENSNormalizedEvent): boolean => {
  const mark = factField(e, 'instante');

  if (mark) return mark === 'sin_hora';

  return /(^|\/)clamonacc\.log$/.test(factField(e, 'origen_dato'));
};

interface Detection {
  amenaza: string;
  fichero: string;
  fecha: string;
  accion: string;
  conHora: boolean;
  anotaciones: number;
}

const mergeDetections = (events: ENSNormalizedEvent[]): { detecciones: Detection[]; juntadas: number } => {
  const byKey = new Map<string, Detection>();
  const loose: ENSNormalizedEvent[] = [];
  const base = (e: ENSNormalizedEvent) => `${factField(e, 'plano')}|${factField(e, 'amenaza')}|${factField(e, 'fichero')}`;
  const sum = (d: Detection, e: ENSNormalizedEvent) => {
    d.anotaciones += 1;
    if (actionWeight(factField(e, 'accion')) > actionWeight(d.accion)) d.accion = factField(e, 'accion');
  };

  events.forEach(e => {
    if (withoutHour(e)) {
      loose.push(e);

      return;
    }

    const key = `${base(e)}|${factField(e, 'fecha')}`;
    const previous = byKey.get(key);

    if (previous) {
      sum(previous, e);
    } else {
      byKey.set(key, {
        amenaza: factField(e, 'amenaza'),
        fichero: factField(e, 'fichero'),
        fecha: factField(e, 'fecha'),
        accion: factField(e, 'accion'),
        conHora: true,
        anotaciones: 1,
      });
    }
  });

  const withHour = Array.from(byKey.entries());

  loose.forEach(e => {
    // The most recent timed one of the same file and signature, if any.
    const same = withHour
      .filter(([key]) => key.startsWith(`${base(e)}|`))
      .map(([, d]) => d)
      .sort((x, y) => (parseInstant(y.fecha) || 0) - (parseInstant(x.fecha) || 0))[0];

    if (same) {
      sum(same, e);

      return;
    }

    const key = `${base(e)}|sin_hora`;
    const previous = byKey.get(key);

    if (previous) {
      sum(previous, e);
    } else {
      byKey.set(key, {
        amenaza: factField(e, 'amenaza'),
        fichero: factField(e, 'fichero'),
        fecha: 'sin hora',
        accion: factField(e, 'accion'),
        conHora: false,
        anotaciones: 1,
      });
    }
  });

  const detections = Array.from(byKey.values());

  return { detecciones: detections, juntadas: events.length - detections.length };
};

const ev04 = (context: ENSPolicyContext, now: number): Measurement => {
  const estados = planes(context, now);
  const annotations = recent(facts(context, 'malware_detected', 'EV-04'), now);
  const { detecciones: detections, juntadas: merged } = mergeDetections(annotations);
  const mergedText = merged
    ? ` (${annotations.length} anotaciones en los logs, ${merged} de ellas repetidas de la misma detección —mismo fichero, firma e instante, o la de clamonacc sin hora—, que se cuentan una vez)`
    : '';
  const measurements: Measurement[] = [];

  // An unremediated detection fails even if there is no antimalware today.
  const withoutRemediate = detections.filter(d => ['sin_accion', 'fallida'].includes(d.accion));

  if (withoutRemediate.length) {
    measurements.push(
      nonCompliant(
        `Detecciones sin remediar: ${formatList(withoutRemediate.map(d => `${d.amenaza} en ${d.fichero} (${d.accion}, ${d.fecha})`))}${mergedText}.`
      )
    );
  }

  // The same threat in the same file at more than one instant: the sheet calls it persistent
  // infection, a failure condition of its own. A detection without time is not another instant.
  const times = new Map<string, number>();

  detections.filter(d => d.conHora).forEach(d => {
    const key = `${d.amenaza} en ${d.fichero}`;
    times.set(key, (times.get(key) || 0) + 1);
  });

  const repeated = Array.from(times.entries()).filter(([, n]) => n > 1);

  if (repeated.length) {
    measurements.push(
      nonCompliant(
        `Detecciones repetidas sobre el mismo fichero en instantes distintos, indicio de infección persistente: ${formatList(repeated.map(([k, n]) => `${k} (${n} veces)`))}${mergedText}.`
      )
    );
  }

  if (!estados.size) {
    measurements.push(withoutStatus());

    return combineMeasurements(measurements);
  }

  const absence = withoutAntimalware(
    context,
    estados,
    'no hay ningún mecanismo que detecte ni reaccione ante código dañino.'
  );

  if (absence) {
    measurements.push(absence);
  }

  if (measurements.length) {
    return combineMeasurements(measurements);
  }

  if (!covered(context, 'EV-04', now)) {
    return degradedOr(
      context,
      'EV-04',
      now,
      'El último latido del recolector no declara haber leído los logs de detección: no se puede afirmar que no haya detecciones sin resolver.'
    );
  }

  return compliant(
    detections.length
      ? `Las ${detections.length} detecciones de la ventana están remediadas y ninguna se repite${mergedText}.`
      : 'Los logs de detección se han leído y no registran ninguna detección en la ventana.'
  );
};

const ev05 = (context: ENSPolicyContext, now: number): Measurement => {
  const estados = planes(context, now);
  const deadline = parseNumber(context, 'P-06');
  const scans = recent(facts(context, 'full_scan_completed', 'EV-05'), now)
    .map(e => ({ e, t: parseInstant(factField(e, 'fecha')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS
    )
    .sort((a, b) => b.t - a.t);

  if (scans.length) {
    if (deadline === undefined) {
      return notMeasured(
        `${parameterDisplayName(context, 'P-06')} está sin configurar: el último escaneo completo terminó el ${factField(scans[0].e, 'fecha')} y no hay periodicidad contra la que juzgarlo.`,
        'CONFIGURATION'
      );
    }

    const age = now - scans[0].t;
    const text = `El último escaneo completo terminó el ${factField(scans[0].e, 'fecha')} (${factField(scans[0].e, 'ficheros_escaneados') || '?'} ficheros, hace ${(age / DAY_MS).toFixed(1)} días)`;

    return age > deadline * DAY_MS
      ? nonCompliant(`${text}, más que los ${deadline} días de ${parameterDisplayName(context, 'P-06')}.`)
      : compliant(`${text}, dentro de los ${deadline} días de ${parameterDisplayName(context, 'P-06')}.`);
  }

  if (!estados.size) {
    return withoutStatus();
  }

  // A scan of the WHOLE system is done by the system antimalware: the mail one only scans mail.
  const absence = withoutAntimalware(
    context,
    estados,
    'no hay nada que escanee el sistema.',
    'sistema'
  );

  if (absence) {
    return absence;
  }

  if (covered(context, 'EV-05', now)) {
    return nonCompliant(
      'El registro de escaneos completos se ha leído y no consta ningún escaneo de todo el sistema terminado: el equipo nunca ha completado uno, o no en la ventana.'
    );
  }

  return degradedOr(
    context,
    'EV-05',
    now,
    'El último latido del recolector no declara haber leído el registro de escaneos completos.'
  );
};

const covers = (monitored: string, critical: string): boolean => {
  const v = monitored.replace(/\/+$/, '') || '/';
  const c = critical.replace(/\/+$/, '') || '/';

  return v === '/' || c === v || c.startsWith(`${v}/`);
};

const ev06 = (context: ENSPolicyContext, now: number): Measurement => {
  const boots = facts(context, 'boot_integrity_check', 'EV-06')
    .map(e => ({ e, t: parseInstant(factField(e, 'arranque_agente')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS
    )
    .sort((a, b) => b.t - a.t);

  if (!boots.length) {
    return degradedOr(
      context,
      'EV-06',
      now,
      'No consta ningún arranque del agente con su análisis: el recolector no ha emitido `boot_integrity_check` en la ventana.'
    );
  }

  const last = boots[0].e;
  const when = factField(last, 'arranque_agente');
  const measurements: Measurement[] = [];

  if (factField(last, 'fim_inicio') === 'no') {
    measurements.push(
      nonCompliant(`En su último arranque (${when}) el agente no lanzó el análisis de integridad al arrancar (scan_on_start desactivado o FIM parado).`)
    );
  } else if (factField(last, 'fim_fin') === 'no') {
    measurements.push(
      nonCompliant(`En su último arranque (${when}) el agente empezó el análisis de integridad y no consta que lo terminara.`)
    );
  }

  const host =
    factField(last, 'equipo') ||
    context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName ||
    '';

  const critical = (tableParameterRows(context, 'P-07') || [])
    .filter(f => f.equipo === '*' || (host && f.equipo === host))
    .map(f => f.ruta)
    .filter(Boolean);

  if (!critical.length) {
    measurements.push(
      notMeasured(
        `${parameterDisplayName(context, 'P-07')} no declara ninguna ruta crítica para este equipo ni para «*»: se sabe qué analizó el agente al arrancar (${factField(last, 'rutas')}), pero no qué es crítico.`,
        'CONFIGURATION'
      )
    );

    return combineMeasurements(measurements);
  }

  const monitored = factField(last, 'rutas')
    .split(',')
    .map(s => s.trim())
    .filter(s => s && s !== 'ninguna');

  const outside = critical.filter(c => !monitored.some(v => covers(v, c)));

  measurements.push(
    outside.length
      ? nonCompliant(
          `En su último arranque (${when}) el agente no analizaba ${outside.length} ruta(s) crítica(s) de ${parameterDisplayName(context, 'P-07')}: ${formatList(outside)}. Vigilaba: ${monitored.join(', ') || 'ninguna'}.`
        )
      : compliant(
          `En su último arranque (${when}) el agente analizó las ${critical.length} rutas críticas declaradas (${formatList(critical)}) y terminó el análisis el ${factField(last, 'fim_fin')}.`
        )
  );

  return combineMeasurements(measurements);
};

const ev07 = (context: ENSPolicyContext, now: number): Measurement => {
  const status = recent(facts(context, 'execution_control_status', 'EV-07'), now)[0];

  if (!status) {
    return degradedOr(
      context,
      'EV-07',
      now,
      'No consta el estado de ningún mecanismo de lista blanca: el agente no ha emitido `execution_control_status` en la ventana.'
    );
  }

  const mechanism = factField(status, 'mecanismo');
  const measurements: Measurement[] = [];

  if (!mechanism || mechanism === 'ninguno') {
    measurements.push(
      nonCompliant(
        `No hay ningún mecanismo de lista blanca de ejecución en el equipo${factField(status, 'confinamiento_apparmor') === 'si' ? ' (AppArmor está activo, pero confina programas concretos: no impide ejecutar lo que no está autorizado)' : ''}.`
      )
    );
  } else if (factField(status, 'activo') !== 'si') {
    measurements.push(nonCompliant(`${mechanism} está instalado y no está en ejecución: no impide nada.`));
  } else if (factField(status, 'modo') !== 'aplicacion') {
    measurements.push(
      nonCompliant(`${mechanism} está en modo ${factField(status, 'modo') || 'desconocido'}: registra las ejecuciones no autorizadas pero no las impide.`)
    );
  }

  // Executions the mechanism let through, against the P-08 path.
  const allowed = recent(facts(context, 'execution_observed', 'EV-07'), now).filter(
    e => factField(e, 'decision') === 'permitida'
  );

  if (allowed.length) {
    const authorized = (tableParameterRows(context, 'P-08') || []).map(f => f.ruta).filter(Boolean);

    if (!authorized.length) {
      measurements.push(
        notMeasured(
          `${allowed.length} ejecución(es) fuera de la lista del mecanismo no se bloquearon, y ${parameterDisplayName(context, 'P-08')} está vacío: no se puede decir si estaban autorizadas.`,
          'CONFIGURATION'
        )
      );
    } else {
      const outside = allowed.filter(e => !authorized.includes(factField(e, 'ruta')));

      if (outside.length) {
        measurements.push(
          nonCompliant(
            `Ejecuciones no bloqueadas de binarios que no figuran en ${parameterDisplayName(context, 'P-08')}: ${formatList(outside.map(e => `${factField(e, 'ruta')} (${factField(e, 'fecha')})`))}.`
          )
        );
      }
    }
  }

  if (measurements.length) {
    return combineMeasurements(measurements);
  }

  if (!covered(context, 'EV-07', now)) {
    return degradedOr(
      context,
      'EV-07',
      now,
      `${mechanism} está en modo aplicación, pero el último latido no declara haber leído sus decisiones.`
    );
  }

  return compliant(
    `${mechanism} está activo y en modo aplicación, y no ha dejado pasar ninguna ejecución fuera de la lista autorizada.`
  );
};

// A capability's P-09 row, if any.
const rowEdr = (
  context: ENSPolicyContext,
  capacity: string
): Record<string, string> | undefined =>
  (tableParameterRows(context, 'P-09') || []).find(f => f.capacidad === capacity);

const observedCapacity = (
  context: ENSPolicyContext,
  evidence: string,
  now: number
): ENSNormalizedEvent | undefined =>
  recent(facts(context, 'edr_capability_observed', evidence), now)[0];

const declaredCapacity = (row: Record<string, string> | undefined, capacity: string): string =>
  row
    ? ` P-09 la declara ${row.activada === 'si' ? 'activada' : 'no activada'}${row.alcance ? ` con alcance «${row.alcance}»` : ''}.`
    : ` P-09 no tiene fila para «${capacity}».`;

const ev08 = (context: ENSPolicyContext, now: number): Measurement => {
  const row = rowEdr(context, 'virustotal');

  if (!row) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-09')} no declara si la consulta reputacional a VirusTotal está activada, y el equipo no puede verlo: la hace el manager.`,
      'CONFIGURATION'
    );
  }

  if (row.activada !== 'si') {
    return nonCompliant(
      `${parameterDisplayName(context, 'P-09')} declara la consulta reputacional a VirusTotal como no activada: falta esa capacidad de detección.`
    );
  }

  // The collector declares it CONFIGURATION: the host has no source to read it from, and collection
  // does not fix that.
  const deg = degradation(context, 'EV-08', now);

  return notMeasured(
    `${parameterDisplayName(context, 'P-09')} declara VirusTotal activado${row.alcance ? ` (${row.alcance})` : ''}, pero la consulta la hace el manager y su resultado no llega al equipo: no se puede demostrar desde aquí. ${deg ? deg.motivo : ''}`.trim(),
    deg?.causa || 'CONFIGURATION'
  );
};

const ev09 = (context: ENSPolicyContext, now: number): Measurement => {
  const row = rowEdr(context, 'yara');
  const obs = observedCapacity(context, 'EV-09', now);

  if (!obs) {
    return degradedOr(context, 'EV-09', now, 'No consta ninguna observación de la capacidad YARA en el equipo.');
  }

  const matches = facts(context, 'content_rule_match', 'EV-09').length;

  if (factField(obs, 'desplegada') !== 'si') {
    return nonCompliant(`El análisis de contenido con YARA no está desplegado en el equipo: ${factField(obs, 'detalle')}.${declaredCapacity(row, 'yara')}`);
  }

  return compliant(
    `El análisis de contenido con YARA está desplegado en el equipo (${factField(obs, 'detalle')}), con ${matches} coincidencia(s) en la ventana.${declaredCapacity(row, 'yara')}`
  );
};

const ev10 = (context: ENSPolicyContext, now: number): Measurement => {
  const row = rowEdr(context, 'rootcheck');
  const obs = observedCapacity(context, 'EV-10', now);

  if (!obs) {
    return degradedOr(context, 'EV-10', now, 'No consta ninguna observación de rootcheck en el equipo.');
  }

  if (factField(obs, 'desplegada') !== 'si') {
    return nonCompliant(`rootcheck no se está ejecutando en el equipo: ${factField(obs, 'detalle')}.${declaredCapacity(row, 'rootcheck')}`);
  }

  const bases = factField(obs, 'bases');

  if (bases && bases !== 'ninguno') {
    return nonCompliant(
      `rootcheck se ejecuta (${factField(obs, 'detalle')}) sin sus bases de firmas (${bases.replace(/sin_/g, 'falta ')}): las comprobaciones de ficheros de rootkits y de binarios troyanizados no se pueden hacer.${declaredCapacity(row, 'rootcheck')}`
    );
  }

  return notMeasured(
    `rootcheck se ejecuta con sus bases (${factField(obs, 'detalle')}), pero sus hallazgos se envían al manager y no quedan en el equipo: no se puede afirmar desde aquí que no haya actividad sospechosa sin detectar.${declaredCapacity(row, 'rootcheck')}`
  );
};

// EV-11 · automatic containment of malicious code. Having some active response with its script on
// the host is not containing malware: on a real server it was CUMPLE held only by firewall-drop
// (blocks network addresses) while the responses the manager configures for malware
// (quersystem-malware-quarantine.sh, quersystem-yara.sh) did not exist in
// /var/ossec/active-response/bin/. They are recognized by name: the agent sees the `ar.conf` the
// manager distributes (command and executable), not the rules triggering them.
const MALWARE_RESPONSE = /malware|quarant|cuarentena|yara|virus|clam|amenaza|threat/i;

const fieldList = (text: string): string[] =>
  text
    .split(',')
    .map(x => x.trim())
    .filter(x => x && x !== '-');

// What the collector saw of `ar.conf`: containment commands with their script on the host and
// without it. Earlier collectors only said it in `detalle`, in a fixed format the collector itself
// writes.
const containmentCommands = (
  obs: ENSNormalizedEvent
): { presentes: string[]; sinScript: string[] } => {
  if (factField(obs, 'comandos_presentes') || factField(obs, 'comandos_sin_script')) {
    return {
      presentes: fieldList(factField(obs, 'comandos_presentes')),
      sinScript: fieldList(factField(obs, 'comandos_sin_script')),
    };
  }

  const detail = factField(obs, 'detalle');

  return {
    presentes: fieldList((/configurados y presentes: ([^;]*)/.exec(detail) || [])[1] || ''),
    sinScript: fieldList((/configurados sin script aqui: ([^;]*)/.exec(detail) || [])[1] || ''),
  };
};

const ev11 = (context: ENSPolicyContext, now: number): Measurement => {
  const row = rowEdr(context, 'active_response');
  const obs = observedCapacity(context, 'EV-11', now);

  if (!obs) {
    return degradedOr(context, 'EV-11', now, 'No consta ninguna observación de la respuesta activa en el equipo.');
  }

  const executed = facts(context, 'active_response_executed', 'EV-11');
  const { presentes, sinScript: withoutScript } = containmentCommands(obs);
  const forMalware = presentes.filter(c => MALWARE_RESPONSE.test(c));
  const forMalwareWithoutScript = withoutScript.filter(c => MALWARE_RESPONSE.test(c));
  const red = presentes.filter(c => !MALWARE_RESPONSE.test(c));

  if (forMalwareWithoutScript.length) {
    return nonCompliant(
      `La respuesta que el manager configura para el código dañino no se puede ejecutar en el equipo: ${formatList(forMalwareWithoutScript)} no existe en /var/ossec/active-response/bin/, así que ante una detección no se contiene nada.${red.length ? ` Lo que sí se ejecutaría (${red.join(', ')}) no contiene código dañino.` : ''}${declaredCapacity(row, 'active_response')}`
    );
  }

  if (factField(obs, 'desplegada') !== 'si') {
    return nonCompliant(`No hay contención automática desplegada en el equipo: ${factField(obs, 'detalle')}.${declaredCapacity(row, 'active_response')}`);
  }

  if (!forMalware.length) {
    return nonCompliant(
      `Ninguna respuesta automática del equipo contiene código dañino: las que tienen script (${presentes.join(', ') || 'ninguna'}) actúan sobre la red o el servicio, y el manager no configura ninguna de cuarentena o eliminación de malware.${declaredCapacity(row, 'active_response')}`
    );
  }

  return compliant(
    `Hay contención automática de código dañino desplegada en el equipo: ${forMalware.join(', ')} con su script presente. ${executed.length} ejecución(es) de contención en la ventana.${declaredCapacity(row, 'active_response')}`
  );
};

const ev12 = (context: ENSPolicyContext, now: number): Measurement => {
  const measurements: Measurement[] = [];
  const routes = (tableParameterRows(context, 'P-05') || []).map(f => f.via).filter(Boolean);
  const policy = selection(context, 'P-10');
  const connections = recent(facts(context, 'removable_device_connected', 'EV-12'), now);
  const read = covered(context, 'EV-12', now);

  if (connections.length) {
    const text = formatList(connections.map(e => `${factField(e, 'dispositivo')} (${factField(e, 'fecha')})`));

    if (!policy) {
      measurements.push(
        notMeasured(`Se han conectado dispositivos extraíbles (${text}) y ${parameterDisplayName(context, 'P-10')} está sin configurar.`, 'CONFIGURATION')
      );
    } else if (policy === 'bloqueados') {
      measurements.push(
        nonCompliant(`${parameterDisplayName(context, 'P-10')} los declara bloqueados y el kernel ha montado dispositivos extraíbles: ${text}.`)
      );
    } else if (policy === 'permitidos_con_analisis') {
      const rt = recent(facts(context, 'antimalware_setting', 'EV-03'), now).find(
        e => (factField(e, 'plano') || 'sistema') === 'sistema' && factField(e, 'ajuste') === 'proteccion_tiempo_real'
      );

      measurements.push(
        rt && factField(rt, 'valor') === 'si'
          ? compliant(`Los dispositivos extraíbles conectados (${text}) los analiza la protección en tiempo real del sistema.`)
          : nonCompliant(`Se han conectado dispositivos extraíbles (${text}) y no hay protección en tiempo real que los analice al montarlos.`)
      );
    } else {
      measurements.push(
        notMeasured(`Se han conectado dispositivos extraíbles (${text}); que se montaran solo en lectura no se observa desde el agente.`)
      );
    }
  }

  if (!routes.length) {
    measurements.push(
      notMeasured(`${parameterDisplayName(context, 'P-05')} no declara ninguna vía de entrada de ficheros externos.`, 'CONFIGURATION')
    );

    return combineMeasurements(measurements);
  }

  const mail = recent(facts(context, 'external_file_scanned', 'EV-12'), now).filter(
    e => factField(e, 'via') === 'correo'
  );

  const pending: string[] = [];

  routes.forEach(route => {
    if (route === 'correo') {
      if (mail.length) {
        // The agent counts messages per run (`analizados`): a fact per message would be noise on a
        // mail server.
        const messages = mail.reduce((total, e) => {
          const n = Number(factField(e, 'analizados'));

          return total + (Number.isFinite(n) && n > 0 ? n : 1);
        }, 0);

        measurements.push(compliant(`La pasarela de correo de este equipo ha analizado ${messages} mensaje(s) en la ventana (${mail.length} pasada(s) del recolector).`));
      } else {
        pending.push('correo (este equipo no analiza correo, o no en la ventana)');
      }

      return;
    }

    if (route === 'dispositivos_extraibles') {
      if (!read) {
        pending.push('dispositivos_extraibles (el último latido no declara haber leído el registro del kernel)');
      } else if (!connections.length) {
        measurements.push(compliant('El registro del kernel se ha leído y no se ha conectado ningún dispositivo extraíble en la ventana.'));
      }

      return;
    }

    pending.push(`${route} (se analiza fuera de este equipo)`);
  });

  if (pending.length) {
    measurements.push(
      notMeasured(`Vías de ${parameterDisplayName(context, 'P-05')} que este equipo no puede demostrar: ${formatList(pending)}.`)
    );
  }

  return combineMeasurements(measurements);
};


type Evidences = Record<string, Measurement>;

// Measurement of an evidence judged by a primitive, as its primitive left it; not re-judged here.
const ofPrimitive = (context: ENSPolicyContext, id: string): Measurement => {
  const evidence = context.evidences.find(e => e.id === id);
  const status = evidence?.status;
  const motive = evidence?.observations?.filter(o => !o.startsWith('Pregunta de auditoría')).slice(1).join(' ') || '';

  if (status === 'CUMPLE') return compliant(motive);
  if (status === 'NO_CUMPLE' || status === 'PARCIAL') return nonCompliant(motive);

  return notMeasured(motive || `${id} no se ha podido medir.`, evidence?.gapCause || 'COLLECTION');
};

const PRIMITIVES = ['EV-01', 'EV-03'];

// Requirements that govern at some level. R5 governs at none: the engine returns it NO_APLICA
// before looking at the policy.
const REQUIREMENTS: Record<string, { evidencias: string[]; parametros: string[]; tipo: ENSPolicyDecision['trace']['ruleType'] }> = {
  'op.exp.6.1': { evidencias: ['EV-01', 'EV-04', 'EV-10', 'EV-11'], parametros: ['P-01', 'P-02', 'P-09'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.2': { evidencias: ['EV-01'], parametros: ['P-01', 'P-02'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.3': { evidencias: ['EV-12'], parametros: ['P-05', 'P-10'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.4': { evidencias: ['EV-02'], parametros: ['P-03'], tipo: 'MAX_AGE' },
  'op.exp.6.5': { evidencias: ['EV-03'], parametros: ['P-04'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.r1.1': { evidencias: ['EV-05'], parametros: ['P-06'], tipo: 'MAX_AGE' },
  'op.exp.6.r2.1': { evidencias: ['EV-06'], parametros: ['P-07'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.6.r3.1': { evidencias: ['EV-07'], parametros: ['P-08'], tipo: 'WHITELIST' },
  'op.exp.6.r4.1': { evidencias: ['EV-08', 'EV-09', 'EV-10', 'EV-11'], parametros: ['P-09'], tipo: 'COVERAGE_REQUIRED' },
};

const decide = (
  requirement: string,
  status: Measurement['estado'],
  evidences: string[],
  parameters: string[],
  type: ENSPolicyDecision['trace']['ruleType'],
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

  const measurements: Evidences = {
    'EV-01': ofPrimitive(context, 'EV-01'),
    'EV-02': ev02(context, now),
    'EV-03': ofPrimitive(context, 'EV-03'),
    'EV-04': ev04(context, now),
    'EV-05': ev05(context, now),
    'EV-06': ev06(context, now),
    'EV-07': ev07(context, now),
    'EV-08': ev08(context, now),
    'EV-09': ev09(context, now),
    'EV-10': ev10(context, now),
    'EV-11': ev11(context, now),
    'EV-12': ev12(context, now),
  };

  const decisions: ENSPolicyDecision[] = [];

  Object.entries(REQUIREMENTS).forEach(([requirement, { evidencias: evidences, parametros: parameters, tipo: type }]) => {
    const own = evidences.map(id => ({ id, medida: measurements[id] }));
    const status = worstStatus(own.map(p => p.medida));

    // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads; `find` returns
    // the first). It names only the evidences that support it so the bridge does not paint a
    // healthy one with another's color.
    const owners = own.filter(p => p.medida.estado === status);

    decisions.push(
      withReasonParts(decide(
        requirement,
        status,
        owners.map(p => p.id),
        parameters,
        type,
        requirement,
        compositeReason(own),
        evidences.map(id => `${id} CUMPLE`).join(' y '),
        commonGapCause(owners.map(p => p.medida))
      ), reasonPartsOf(own))
    );

    // And one per evidence measured here, with ITS status, so the evidence table shows what was
    // measured of each and not the aggregate. Primitive ones already have their verdict.
    own
      .filter(p => !PRIMITIVES.includes(p.id))
      .forEach(p =>
        decisions.push(
          decide(
            requirement,
            p.medida.estado,
            [p.id],
            parameters,
            type,
            `${requirement}/${p.id}`,
            p.medida.motivo,
            `${p.id} CUMPLE`,
            p.medida.causa
          )
        )
      );
  });

  const variables: ENSRuntimeVariable[] = Object.entries(measurements).map(([id, measurement]) => ({
    name: `medida_${id.replace('-', '')}`,
    value: measurement.estado,
    parameterIds: [],
    evidenceIds: [id],
    eventIds: [],
    description: measurement.motivo,
  }));

  return { decisions, runtimeVariables: variables };
};

export const opExp6PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.exp.6.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-09'],
      evidenceIds: ['EV-01', 'EV-04', 'EV-10', 'EV-11'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05', 'P-10'],
      evidenceIds: ['EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-02'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.6.5',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      // Cumulative reinforcements: MEDIA «+ R1 + R2», ALTA «+ R1 + R2 + R3 + R4».
      requirementId: 'op.exp.6.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.6.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-07'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.6.r4.1',
      levels: ['ALTO'],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-08', 'EV-09', 'EV-10', 'EV-11'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    // The ENS defines R5 but requires it in no category: without levels the engine evaluates it
    // NO_APLICA.
    {
      requirementId: 'op.exp.6.r5.1',
      levels: [],
      parameterIds: ['P-10'],
      evidenceIds: ['EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.6.r5.2',
      levels: [],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
