// op.exp.4 · Security maintenance and updates. The seven primitives contrast ONE fact against ONE
// parameter and op.exp.4's central questions fit none: EV-02 classifies the open vulnerability with
// P-08 (CVSS to criticality) and looks up its deadline in P-01 (criticality to days) against the
// clock; EV-03 measures pending security updates and pending restart against P-01's LONGEST
// deadline, and what is observed since the baseline is a bound, not an age; EV-05 an end-of-support
// date against today, the earliest of the declared (P-05) and the vendor's; EV-07 each change
// placed in P-04 time bands; EV-09 the reversion point must PRECEDE the change (P-07); EV-10
// week-by-week debt trend.
// What primitives judge is left to them (EV-04, EV-06, EV-11) and only their result is READ here;
// op.exp.4.3 has no decision, EV-04 resolves it alone.
// Invariants (as in `evidence/judgment.ts`): the agent emits instants, not ages, so the same fact
// ages by itself against `context.now`; no fact or parameter is NO_EVALUABLE, never CUMPLE by
// absence except EV-07's negative assertion with a confirmed heartbeat; no default deadline, window
// or date except P-08's CVSS scale, which the control sheet says applies if undeclared.
// Types and utilities come from the file, never from a barrel (Settings TDZ cycle).
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSComplianceStatus } from '../../evaluation/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSControlParameter } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';

const CONTROL = 'op.exp.4';
const POLICY = 'policy.op.exp.4';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Freshness of a snapshot: the bridge and the collector re-emit unchanged data every 24 h and run
// hourly, so 24 h + one run + margin. Observation tolerance, not policy.
const FRESHNESS_HOURS = 26;

// Same clock margin as `resolveCollectorCoverage`: a fact from the future proves nothing.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Heartbeat for EV-07's negative assertion, as in the primitives.
const HEARTBEAT_HOURS = 24;

type Measurement = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;
  motivo: string;
};

const compliant = (motive: string): Measurement => ({ estado: 'CUMPLE', motivo: motive });
const nonCompliant = (motive: string): Measurement => ({ estado: 'NO_CUMPLE', motivo: motive });
const notMeasured = (motive: string): Measurement => ({ estado: 'NO_EVALUABLE', motivo: motive });

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


// The normalizer splits an event with `evidence_id=EV-02,EV-10` into one per evidence
// (`<id>#EV-02`, `<id>#EV-10`); the FACT is judged here, so it counts once.
const facts = (
  context: ENSPolicyContext,
  type: string
): ENSNormalizedEvent[] => {
  const seen = new Set<string>();

  return context.events.filter(event => {
    if (event.controlId !== CONTROL || event.eventType !== type) {
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

// Numbers arrive as text from `alerts.json`.
const parseNumber = (text: string): number | undefined => {
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return undefined;
  }

  const value = Number(text);

  return Number.isFinite(value) ? value : undefined;
};

const parseInstant = (text: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    return undefined;
  }

  const value = new Date(text).getTime();

  return Number.isFinite(value) ? value : undefined;
};

const wholeDays = (ms: number): string => (ms / DAY_MS).toFixed(1);

const stripAccents = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const formatList = (items: string[], max = 5): string =>
  items.length > max
    ? `${items.slice(0, max).join('; ')} y ${items.length - max} más`
    : items.join('; ');


const findParameter = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

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

const parameterDisplayName = (context: ENSPolicyContext, id: string): string => {
  const p = findParameter(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

// The system's row: that of the agent name or, if none, that of «*».
const systemRow = (
  table: Record<string, string>[],
  column: string,
  agent: string | undefined
): Record<string, string> | undefined =>
  table.find(f => agent && f[column].toLowerCase() === agent.toLowerCase()) ||
  table.find(f => f[column] === '*');

const agentName = (context: ENSPolicyContext): string | undefined =>
  context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName;


type Deadlines = {
  porCriticidad: Map<string, number | null>;
  masLargo?: number;
};

const CRITICALITIES = ['critica', 'alta', 'media', 'baja'];
const NO_SCORE = 'sin puntuacion';

const NAME: Record<string, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  [NO_SCORE]: 'Sin puntuación',
};

// P-01: an empty days cell means «no deadline» (null), a written decision; a criticality without
// row is undecided and absent from the map.
const deadlines = (context: ENSPolicyContext): Deadlines | undefined => {
  const table = tableParameterRows(context, 'P-01');

  if (!table) {
    return undefined;
  }

  const byCriticality = new Map<string, number | null>();

  table.forEach(row => {
    const key = stripAccents(row.criticidad);

    if (![...CRITICALITIES, NO_SCORE].includes(key)) {
      return;
    }

    if (!row.dias) {
      byCriticality.set(key, null);

      return;
    }

    const value = parseNumber(row.dias.replace(',', '.'));

    if (value !== undefined && value >= 0) {
      byCriticality.set(key, value);
    }
  });

  const numeric = Array.from(byCriticality.values()).filter(
    (v): v is number => typeof v === 'number'
  );

  if (!byCriticality.size) {
    return undefined;
  }

  return {
    porCriticidad: byCriticality,
    masLargo: numeric.length ? Math.max(...numeric) : undefined,
  };
};

// CVSS v3.1 qualitative scale (FIRST), used only if P-08 is undeclared, as the control sheet says.
const SCALE_FIRST: [string, number][] = [
  ['critica', 9.0],
  ['alta', 7.0],
  ['media', 4.0],
  ['baja', 0.1],
];

const cvssScale = (
  context: ENSPolicyContext
): { umbrales: [string, number][]; declarada: boolean } => {
  const table = tableParameterRows(context, 'P-08');
  const thresholds: [string, number][] = [];

  (table || []).forEach(row => {
    const key = stripAccents(row.criticidad);
    const min = parseNumber((row.cvss_minimo || '').replace(',', '.'));

    if (CRITICALITIES.includes(key) && min !== undefined) {
      thresholds.push([key, min]);
    }
  });

  return thresholds.length
    ? { umbrales: thresholds.sort((a, b) => b[1] - a[1]), declarada: true }
    : { umbrales: SCALE_FIRST, declarada: false };
};

const classifies = (
  cvss: string,
  thresholds: [string, number][]
): string | undefined => {
  if (cvss === '-' || cvss === '') {
    return NO_SCORE;
  }

  const value = parseNumber(cvss);

  if (value === undefined) {
    return undefined;
  }

  // A 0.0 score has no CVSS severity but is still an open CVE: treated as the lowest declared
  // criticality.
  return (
    thresholds.find(([, min]) => value >= min)?.[0] ||
    (value === 0 ? thresholds[thresholds.length - 1]?.[0] : undefined)
  );
};


type Snapshot = {
  momento: number;
  texto: string;
  cabecera: ENSNormalizedEvent;
  abiertas: ENSNormalizedEvent[];
};

// The latest header and its rows. A snapshot with fewer rows than it declares is incomplete:
// judging it would judge a sample.
const snapshot = (
  context: ENSPolicyContext,
  now: number
): Snapshot | Measurement => {
  const headers = facts(context, 'vulnerability_inventory')
    .map(e => ({ e, t: parseInstant(factField(e, 'instantanea')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS
    )
    .sort((a, b) => b.t - a.t);

  if (!headers.length) {
    return notMeasured(
      'No consta ningún inventario del Vulnerability Detector para esta máquina: el puente del manager (ens_opexp4_vd_bridge.py) no ha entregado ninguna instantánea, o la respuesta activa no está habilitada en el agente.'
    );
  }

  const { e: header, t } = headers[0];
  const age = now - t;

  if (age > FRESHNESS_HOURS * HOUR_MS) {
    return notMeasured(
      `La instantánea más reciente del Vulnerability Detector es de ${factField(header, 'instantanea')} (hace ${(age / HOUR_MS).toFixed(1)} h, más de ${FRESHNESS_HOURS} h): no describe la situación de hoy.`
    );
  }

  const text = factField(header, 'instantanea');
  const byScore = new Map<string, ENSNormalizedEvent>();

  facts(context, 'vulnerability_open')
    .filter(e => factField(e, 'instantanea') === text)
    .forEach(e => byScore.set(factField(e, 'cvss'), e));

  const declared = parseNumber(factField(header, 'puntuaciones'));

  if (declared === undefined || byScore.size < declared) {
    return notMeasured(
      `La instantánea ${text} declara ${factField(header, 'puntuaciones') || '?'} puntuaciones CVSS con vulnerabilidades abiertas y solo han llegado ${byScore.size}: está incompleta y no se juzga sobre una parte.`
    );
  }

  return {
    momento: t,
    texto: text,
    cabecera: header,
    abiertas: Array.from(byScore.values()),
  };
};

const isMeasurement = (x: Snapshot | Measurement): x is Measurement =>
  (x as Measurement).estado !== undefined;


const ev01 = (context: ENSPolicyContext, now: number): Measurement => {
  const photo = snapshot(context, now);

  if (isMeasurement(photo)) {
    return photo;
  }

  return compliant(
    `Inventario de vulnerabilidades vigente: instantánea del ${photo.texto} con ${factField(photo.cabecera, 'abiertas')} CVE abiertas (${factField(photo.cabecera, 'sin_puntuacion') || '0'} sin puntuación CVSS), leída del estado del Vulnerability Detector.`
  );
};

const ev02 = (context: ENSPolicyContext, now: number): Measurement => {
  const photo = snapshot(context, now);

  if (isMeasurement(photo)) {
    return photo;
  }

  const p01 = deadlines(context);

  if (!p01) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-01')} está sin configurar: hay ${factField(photo.cabecera, 'abiertas')} vulnerabilidades abiertas y no hay plazo contra el que juzgar si la reacción es tardía.`
    );
  }

  const { umbrales: thresholds, declarada: declared } = cvssScale(context);
  const pastDeadline: { texto: string; exceso: number }[] = [];
  const withoutDecide: string[] = [];
  const withoutDeadline: string[] = [];

  photo.abiertas.forEach(e => {
    const cvss = factField(e, 'cvss');
    const criticality = classifies(cvss, thresholds);
    const detected = parseInstant(factField(e, 'detectada'));
    const cve = factField(e, 'cve');
    const count = factField(e, 'abiertas') || '1';

    if (!criticality) {
      withoutDecide.push(`CVSS ${cvss}: ${declared ? 'P-08' : 'la escala CVSS'} no le da criticidad`);

      return;
    }

    if (!p01.porCriticidad.has(criticality)) {
      withoutDecide.push(`${count} con CVSS ${cvss} (${NAME[criticality]}): P-01 no tiene fila para esa criticidad`);

      return;
    }

    const deadline = p01.porCriticidad.get(criticality);

    if (deadline === null || deadline === undefined) {
      withoutDeadline.push(`${NAME[criticality]} (CVSS ${cvss})`);

      return;
    }

    if (detected === undefined) {
      withoutDecide.push(`${cve}: sin instante de detección legible`);

      return;
    }

    const open = now - detected;

    if (open > deadline * DAY_MS) {
      pastDeadline.push({
        exceso: open - deadline * DAY_MS,
        texto: `${cve} (CVSS ${cvss}, ${NAME[criticality]}) abierta desde ${factField(e, 'detectada')}: ${wholeDays(open)} días con plazo de ${deadline}${Number(count) > 1 ? `; es la más antigua de ${count} con esa puntuación` : ''}`,
      });
    }
  });

  // Resolved ones of the window: data for the auditor, not a verdict. The sheet judges what REMAINS
  // open past deadline.
  const resolved = facts(context, 'vulnerability_resolved');
  const resolvedSummary = resolved.length
    ? ` En la ventana constan ${resolved.length} CVE resueltas.`
    : '';

  const scale = declared
    ? ''
    : ' P-08 no está declarado: se ha aplicado la escala cualitativa de CVSS v3.1 (FIRST), como indica la ficha del control.';

  if (pastDeadline.length) {
    pastDeadline.sort((a, b) => b.exceso - a.exceso);

    return nonCompliant(
      `Vulnerabilidades abiertas fuera del plazo de su criticidad en P-01 (instantánea ${photo.texto}): ${formatList(pastDeadline.map(f => f.texto))}.${scale}${resolvedSummary}`
    );
  }

  if (withoutDecide.length) {
    return notMeasured(
      `No se puede juzgar todo lo abierto: ${formatList(withoutDecide)}. Declara la criticidad que falta en P-01 (y en P-08 si hace falta).${scale}`
    );
  }

  return compliant(
    `Ninguna de las ${factField(photo.cabecera, 'abiertas')} vulnerabilidades abiertas (instantánea ${photo.texto}) supera el plazo de su criticidad en P-01.${withoutDeadline.length ? ` Sin plazo declarado, y por tanto sin juzgar: ${Array.from(new Set(withoutDeadline)).join(', ')}.` : ''}${scale}${resolvedSummary}`
  );
};

// A patching snapshot of ONE plane. A regular server has only the `sistema` plane; a directory
// server also gets `directorio` (Zimbra patches, which do not go through Ubuntu's security pocket).
const ev03Plane = (
  context: ENSPolicyContext,
  now: number,
  ofPlane: ENSNormalizedEvent[],
  plane: string
): Measurement => {
  const snapshots = ofPlane
    .map(e => ({ e, t: parseInstant(e.timestamp) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS)
    .sort((a, b) => b.t - a.t);

  if (!snapshots.length || now - snapshots[0].t > FRESHNESS_HOURS * HOUR_MS) {
    return notMeasured(
      snapshots.length
        ? `El último estado de parcheado del plano ${plane} es de ${snapshots[0].e.timestamp}, más de ${FRESHNESS_HOURS} h: el recolector no está informando.`
        : 'No consta ningún estado de parcheado de esta máquina: el recolector de op.exp.4 no está desplegado o no informa.'
    );
  }

  const photo = snapshots[0].e;
  const p01 = deadlines(context);

  if (!p01 || p01.masLargo === undefined) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-01')} no declara ningún plazo en días: no hay contra qué medir lo que lleva pendiente la máquina.`
    );
  }

  const deadline = p01.masLargo * DAY_MS;
  const findings: string[] = [];
  const bounds: string[] = [];

  const index = parseInstant(factField(photo, 'indice_paquetes'));

  if (index === undefined || now - index > deadline) {
    return notMeasured(
      `El índice de paquetes de la máquina ${index === undefined ? 'no tiene fecha legible' : `no se actualiza desde ${factField(photo, 'indice_paquetes')}`}: con un índice más viejo que el plazo más largo de P-01 (${p01.masLargo} días), «pendientes» no significa nada.`
    );
  }

  const pending = parseNumber(factField(photo, 'seguridad_pendientes')) || 0;
  const subject =
    factField(photo, 'ambito_pendientes') === 'parches_zimbra'
      ? 'parche(s) de Zimbra'
      : 'actualización(es) de seguridad';

  if (pending > 0) {
    const since = parseInstant(factField(photo, 'seguridad_pendiente_desde'));
    const base = parseInstant(factField(photo, 'linea_base'));

    if (since !== undefined && now - since > deadline) {
      findings.push(
        `${pending} ${subject} pendiente(s) desde ${factField(photo, 'seguridad_pendiente_desde')} (${wholeDays(now - since)} días), más que el plazo más largo de P-01 (${p01.masLargo} días)`
      );
    } else if (
      factField(photo, 'desde_linea_base') === 'si' &&
      base !== undefined &&
      now - base <= deadline
    ) {
      bounds.push(
        `${pending} ${subject} ya estaban pendientes cuando el recolector empezó a observar (${factField(photo, 'linea_base')}): su antigüedad real no se conoce hasta que la observación cubra ${p01.masLargo} días`
      );
    }
  }

  if (factField(photo, 'reinicio_pendiente') === 'si') {
    const since = parseInstant(factField(photo, 'reinicio_pendiente_desde'));

    if (since !== undefined && now - since > deadline) {
      findings.push(
        `parches instalados sin activar: reinicio pendiente desde ${factField(photo, 'reinicio_pendiente_desde')} (${wholeDays(now - since)} días, plazo más largo de P-01 ${p01.masLargo}) por ${factField(photo, 'paquetes_que_piden_reinicio') || 'paquetes sin identificar'}`
      );
    } else if (factField(photo, 'reinicio_desde_aproximado') === 'si') {
      bounds.push(
        `reinicio pendiente de fecha aproximada (${factField(photo, 'reinicio_pendiente_desde')}): no se puede afirmar que esté en plazo`
      );
    }
  }

  const summary = `plano ${plane}: ${factField(photo, 'actualizaciones_pendientes') || '0'} actualizaciones pendientes, ${pending} de seguridad; actualizaciones automáticas ${factField(photo, 'actualizaciones_automaticas') || 'sin dato'}; última actualización aplicada ${factField(photo, 'ultima_actualizacion') || 'sin dato'}`;

  if (findings.length) {
    return nonCompliant(`Mantenimiento atrasado: ${formatList(findings)}. (${summary}.)`);
  }

  if (bounds.length) {
    return notMeasured(`${formatList(bounds)}. (${summary}.)`);
  }

  return compliant(`Nada pendiente más allá del plazo más largo de P-01 (${p01.masLargo} días): ${summary}.`);
};

const ev03 = (context: ENSPolicyContext, now: number): Measurement => {
  const byPlane = new Map<string, ENSNormalizedEvent[]>();

  facts(context, 'patch_status').forEach(e => {
    const plane = factField(e, 'plano') || 'sistema';
    byPlane.set(plane, [...(byPlane.get(plane) || []), e]);
  });

  // The `sistema` plane is always required: a directory snapshot alone says nothing of the Ubuntu
  // serving it.
  if (!byPlane.has('sistema')) {
    byPlane.set('sistema', []);
  }

  const measurements = Array.from(byPlane.entries()).map(([plane, snapshots]) =>
    ev03Plane(context, now, snapshots, plane)
  );

  const status = worstStatus(measurements);

  return {
    estado: status,
    motivo: measurements.map(m => m.motivo).join(' | '),
  };
};

const ev05 = (context: ENSPolicyContext, now: number): Measurement => {
  const last = new Map<string, ENSNormalizedEvent>();

  facts(context, 'product_support')
    .sort((a, b) => (parseInstant(a.timestamp) || 0) - (parseInstant(b.timestamp) || 0))
    .forEach(e => last.set(`${factField(e, 'producto')}|${factField(e, 'version')}`, e));

  if (!last.size) {
    return notMeasured('No consta ningún producto informado por el recolector: no se sabe qué soporte tiene lo instalado.');
  }

  const table = tableParameterRows(context, 'P-05') || [];
  const expired: string[] = [];
  const withoutDate: string[] = [];
  const next: string[] = [];
  const current: string[] = [];

  last.forEach(e => {
    const product = factField(e, 'producto');
    const version = factField(e, 'version');
    const name = `${product} ${version}`.trim();

    const row = table.find(
      f =>
        f.producto.toLowerCase() === product.toLowerCase() &&
        (!f.version || version.startsWith(f.version))
    );

    const extended = factField(e, 'soporte_ampliado') === 'enabled';
    const ofVendor = parseInstant(
      factField(e, extended ? 'fin_soporte_ampliado' : 'fin_soporte_estandar')
    );
    const declared = row?.eol ? parseInstant(row.eol) : undefined;

    const dates = [ofVendor, declared].filter((t): t is number => t !== undefined);

    if (!dates.length || (!row && (ofVendor === undefined || ofVendor > now))) {
      withoutDate.push(
        row
          ? `${name}: la fila de P-05 no trae fecha y el fabricante no la publica en la máquina`
          : `${name}: no figura en P-05`
      );

      return;
    }

    const effective = Math.min(...dates);
    const date = new Date(effective).toISOString().slice(0, 10);
    const origin =
      ofVendor === effective && declared !== effective
        ? `fabricante${extended ? ', soporte ampliado' : ''}`
        : 'P-05';

    if (effective <= now) {
      expired.push(`${name} sin soporte desde ${date} (${origin})`);
    } else if (effective - now <= 365 * DAY_MS) {
      next.push(`${name} pierde el soporte el ${date} (${origin})`);
    } else {
      current.push(`${name} hasta ${date} (${origin})`);
    }
  });

  if (expired.length) {
    return nonCompliant(`Software fuera del soporte del fabricante: ${formatList(expired)}.`);
  }

  if (withoutDate.length) {
    return notMeasured(`No se conoce el fin de soporte de: ${formatList(withoutDate)}. Declara su fecha en P-05.`);
  }

  return compliant(
    `Todo lo informado está en soporte: ${formatList(current.concat(next))}.${next.length ? ` Próximos a perderlo en doce meses: ${formatList(next)}.` : ''}`
  );
};

// P-04: «days HH:MM-HH:MM», spans separated by «;». Minutes of the week starting Monday 00:00.
const WEEK_DAYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
const WEEK = 7 * 24 * 60;

const daysOf = (text: string): number[] | undefined => {
  const t = stripAccents(text).replace(/\s+/g, '');

  if (['*', 'todos', 'diario', 'cualquierdia'].includes(t)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  const result: number[] = [];

  for (const part of t.split(',')) {
    const range = part.split('-');
    const start = WEEK_DAYS.indexOf(range[0].slice(0, 3));
    const end = WEEK_DAYS.indexOf((range[1] || range[0]).slice(0, 3));

    if (start < 0 || end < 0 || range.length > 2) {
      return undefined;
    }

    for (let d = start; ; d = (d + 1) % 7) {
      result.push(d);

      if (d === end) {
        break;
      }
    }
  }

  return result;
};

const spans = (window: string): [number, number][] | undefined => {
  const result: [number, number][] = [];

  for (const span of window.split(';').map(t => t.trim()).filter(Boolean)) {
    const m = span.match(/^(.+?)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);

    if (!m) {
      return undefined;
    }

    const list = daysOf(m[1]);
    const start = Number(m[2]) * 60 + Number(m[3]);
    let end = Number(m[4]) * 60 + Number(m[5]);

    if (!list || start >= 24 * 60 || end > 24 * 60) {
      return undefined;
    }

    if (end <= start) {
      end += 24 * 60;
    }

    list.forEach(d => result.push([d * 24 * 60 + start, d * 24 * 60 + end]));
  }

  return result.length ? result : undefined;
};

// Minute of the week of the change START in the machine's local time, which travels written in the
// instant itself.
const minuteLocal = (iso: string): number | undefined => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);

  if (!m) {
    return undefined;
  }

  const dayWeek = (new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() + 6) % 7;

  return dayWeek * 24 * 60 + Number(m[4]) * 60 + Number(m[5]);
};

const within = (minute: number, intervals: [number, number][]): boolean =>
  intervals.some(
    ([start, end]) =>
      (minute >= start && minute < end) ||
      (minute + WEEK >= start && minute + WEEK < end)
  );

const heartbeatConfirms = (
  context: ENSPolicyContext,
  evidence: string,
  now: number
): boolean => {
  const heartbeat = facts(context, 'collector_run')
    .map(e => ({ e, t: parseInstant(e.timestamp) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS && now - x.t <= HEARTBEAT_HOURS * HOUR_MS
    )
    .sort((a, b) => b.t - a.t)[0];

  return Boolean(
    heartbeat &&
      factField(heartbeat.e, 'resultado') === 'completada' &&
      factField(heartbeat.e, 'evidencias_cubiertas').split(',').map(s => s.trim()).includes(evidence)
  );
};

const ev07 = (context: ENSPolicyContext, now: number): Measurement => {
  const table = tableParameterRows(context, 'P-04');

  if (!table) {
    return notMeasured(`${parameterDisplayName(context, 'P-04')} está sin configurar: no hay franjas contra las que situar los cambios.`);
  }

  const agent = agentName(context);
  const row = systemRow(table, 'sistema', agent);

  if (!row) {
    return notMeasured(`P-04 no tiene fila para ${agent || 'esta máquina'} ni una fila «*».`);
  }

  const intervals = spans(row.ventana);

  if (!intervals) {
    return notMeasured(`La ventana «${row.ventana}» de P-04 no se entiende: se esperan tramos como «sab 22:00-02:00» o «* 06:00-07:30», separados por «;».`);
  }

  const changes = facts(context, 'package_changed');

  if (!changes.length) {
    return heartbeatConfirms(context, 'EV-07', now)
      ? compliant('No ha habido cambios de software en la ventana evaluada, y consta que el recolector leyó los logs de apt y dpkg.')
      : notMeasured('No consta ningún cambio de software ni un latido reciente del recolector que declare haber leído los logs: el silencio no acredita nada.');
  }

  const outside: string[] = [];
  let unreadable = 0;

  changes.forEach(e => {
    const minute = minuteLocal(factField(e, 'inicio'));

    if (minute === undefined) {
      unreadable += 1;

      return;
    }

    if (!within(minute, intervals)) {
      outside.push(`${factField(e, 'inicio')} por ${factField(e, 'actor') || '?'} (${factField(e, 'mecanismo') || '?'})`);
    }
  });

  if (outside.length) {
    return nonCompliant(`Cambios de software fuera de la ventana «${row.ventana}» de P-04: ${formatList(outside)}.`);
  }

  if (unreadable) {
    return notMeasured(`${unreadable} cambio(s) sin instante de inicio legible: no se puede afirmar que todos estén en ventana.`);
  }

  return compliant(`Los ${changes.length} cambios de software de la ventana evaluada empezaron dentro de «${row.ventana}».`);
};

const ev08 = (context: ENSPolicyContext): Measurement => {
  if (!tableParameterRows(context, 'P-06')) {
    return notMeasured(`${parameterDisplayName(context, 'P-06')} está sin configurar: no hay ningún entorno de preproducción declarado para esta máquina.`);
  }

  return notMeasured(
    'P-06 declara la preproducción, pero demostrar que cada versión pasó ANTES por ella exige cruzar los cambios de software de las dos máquinas, y el motor evalúa cada máquina por separado. R1 queda sin demostrar hasta que la consolidación entre máquinas lo soporte.'
  );
};

const LOCAL_MECHANISMS = ['lvm', 'zfs', 'btrfs'];

const ev09 = (context: ENSPolicyContext): Measurement => {
  const table = tableParameterRows(context, 'P-07');

  if (!table) {
    return notMeasured(`${parameterDisplayName(context, 'P-07')} está sin configurar: no se ha previsto ningún mecanismo de reversión.`);
  }

  const agent = agentName(context);
  const row = systemRow(table, 'sistema', agent);

  if (!row) {
    return notMeasured(`P-07 no tiene fila para ${agent || 'esta máquina'} ni una fila «*».`);
  }

  const mechanism = row.mecanismo.toLowerCase();

  if (!LOCAL_MECHANISMS.includes(mechanism)) {
    return notMeasured(
      `El mecanismo declarado en P-07 («${row.mecanismo}») no deja huella en la máquina: un snapshot de hipervisor o una copia externa no los observa este control, y no se simulan.`
    );
  }

  const window = parseNumber((row.ventana_horas || '').replace(',', '.'));

  if (window === undefined || window <= 0) {
    return notMeasured(`La ventana previa de P-07 («${row.ventana_horas}») no es un número de horas utilizable.`);
  }

  const changes = facts(context, 'package_changed');

  if (!changes.length) {
    return notMeasured('No ha habido cambios de software en la ventana evaluada: no hay ningún punto de reversión que exigir ni que demostrar.');
  }

  const degraded = context.events.find(
    e => e.controlId === CONTROL && e.eventType === 'evidence_state' && e.evidenceId === 'EV-09'
  );

  const points = facts(context, 'reversion_point_created')
    .filter(e => factField(e, 'mecanismo').toLowerCase() === mechanism)
    .map(e => parseInstant(factField(e, 'creado')))
    .filter((t): t is number => t !== undefined);

  const withoutPoint: string[] = [];

  changes.forEach(e => {
    const start = parseInstant(factField(e, 'inicio'));

    if (start === undefined) {
      withoutPoint.push(`cambio sin instante legible (${factField(e, 'inicio')})`);

      return;
    }

    if (!points.some(t => t <= start && start - t <= window * HOUR_MS)) {
      withoutPoint.push(`${factField(e, 'inicio')} (${factField(e, 'actor') || '?'})`);
    }
  });

  if (!points.length && degraded) {
    return notMeasured(`El recolector no ha podido observar puntos de reversión: ${factField(degraded, 'motivo')}.`);
  }

  if (withoutPoint.length) {
    return nonCompliant(
      `Cambios de software sin punto de reversión ${row.mecanismo} en las ${window} h previas: ${formatList(withoutPoint)}.`
    );
  }

  return compliant(`Los ${changes.length} cambios de software tenían un punto de reversión ${row.mecanismo} en las ${window} h previas.`);
};

const ev10 = (context: ENSPolicyContext, now: number): Measurement => {
  // Latest header of each week before `ahora`.
  const weeks = new Map<number, { t: number; abiertas: number }>();

  facts(context, 'vulnerability_inventory').forEach(e => {
    const t = parseInstant(factField(e, 'instantanea'));
    const open = parseNumber(factField(e, 'abiertas'));

    if (t === undefined || open === undefined || t > now + FUTURE_TOLERANCE_MS) {
      return;
    }

    const week = Math.floor((now - t) / (7 * DAY_MS));
    const actual = weeks.get(week);

    if (!actual || t > actual.t) {
      weeks.set(week, { t, abiertas: open });
    }
  });

  const series = [2, 1, 0].map(s => weeks.get(s));

  if (series.some(point => !point)) {
    return notMeasured(
      `La serie del inventario de vulnerabilidades no cubre las tres últimas semanas (hay ${weeks.size} semana(s) con instantánea): todavía no se puede hablar de tendencia.`
    );
  }

  const [twoWeeksAgo, weekAgo, thisWeek] = series as { t: number; abiertas: number }[];
  const text = `${twoWeeksAgo.abiertas} → ${weekAgo.abiertas} → ${thisWeek.abiertas} CVE abiertas en las tres últimas semanas`;

  if (twoWeeksAgo.abiertas < weekAgo.abiertas && weekAgo.abiertas < thisWeek.abiertas) {
    return nonCompliant(`La deuda de vulnerabilidades crece de forma sostenida: ${text}.`);
  }

  return compliant(`La deuda de vulnerabilidades no crece de forma sostenida: ${text}.`);
};


type Evidences = Record<string, Measurement>;

// Measurement of an evidence judged by a primitive, as its primitive left it; not re-judged here.
const ofPrimitive = (context: ENSPolicyContext, id: string): Measurement => {
  const evidence = context.evidences.find(e => e.id === id);
  const status = evidence?.status;
  const motive = evidence?.observations?.filter(o => !o.startsWith('Pregunta de auditoría')).slice(1).join(' ') || '';

  if (status === 'CUMPLE') return compliant(motive);
  if (status === 'NO_CUMPLE' || status === 'PARCIAL') return nonCompliant(motive);

  return notMeasured(motive || `${id} no se ha podido medir.`);
};

const REQUIREMENTS: Record<string, { evidencias: string[]; parametros: string[]; tipo: ENSPolicyDecision['trace']['ruleType'] }> = {
  'op.exp.4.1': { evidencias: ['EV-01', 'EV-03', 'EV-05', 'EV-06'], parametros: ['P-01', 'P-03', 'P-05'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.4.2': { evidencias: ['EV-01', 'EV-02', 'EV-03', 'EV-07', 'EV-10'], parametros: ['P-01', 'P-04', 'P-08'], tipo: 'MAX_AGE' },
  'op.exp.4.r1.1': { evidencias: ['EV-08'], parametros: ['P-06'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.4.r2.1': { evidencias: ['EV-09'], parametros: ['P-07'], tipo: 'CONDITIONAL_REQUIRED' },
  'op.exp.4.r4.1': { evidencias: ['EV-01', 'EV-10'], parametros: [], tipo: 'COVERAGE_REQUIRED' },
};

const decide = (
  requirement: string,
  status: Measurement['estado'],
  evidences: string[],
  parameters: string[],
  type: ENSPolicyDecision['trace']['ruleType'],
  ruleId: string,
  motive: string,
  expected: string
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
});

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();

  const measurements: Evidences = {
    'EV-01': ev01(context, now),
    'EV-02': ev02(context, now),
    'EV-03': ev03(context, now),
    'EV-05': ev05(context, now),
    'EV-06': ofPrimitive(context, 'EV-06'),
    'EV-07': ev07(context, now),
    'EV-08': ev08(context),
    'EV-09': ev09(context),
    'EV-10': ev10(context, now),
  };

  const decisions: ENSPolicyDecision[] = [];

  Object.entries(REQUIREMENTS).forEach(([requirement, { evidencias: evidences, parametros: parameters, tipo: type }]) => {
    const own = evidences.map(id => ({ id, medida: measurements[id] }));
    const status = worstStatus(own.map(p => p.medida));

    // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads; `find` returns
    // the first). It names only the evidences that support it so the bridge does not paint a
    // healthy evidence with another's color.
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
        evidences.map(id => `${id} CUMPLE`).join(' y ')
      ), reasonPartsOf(own))
    );

    // And one per evidence measured here, with ITS status, so the evidence table shows what was
    // measured of each and not the aggregate. Primitive ones (EV-06) already have their verdict.
    own
      .filter(p => p.id !== 'EV-06')
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
            `${p.id} CUMPLE`
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

export const opExp4PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.exp.4.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03', 'P-05'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-05', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.4.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-04', 'P-08'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-07', 'EV-10'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.4.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-04'],
      ruleType: 'WHITELIST',
    },
    {
      // Cumulative reinforcement: MEDIA «+ R1», ALTA «+ R1 + R2».
      requirementId: 'op.exp.4.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.4.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    // The ENS defines R3 and R4 but requires them in no category: without levels the engine
    // evaluates them NO_APLICA.
    {
      requirementId: 'op.exp.4.r3.1',
      levels: [],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-11'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.4.r4.1',
      levels: [],
      parameterIds: [],
      evidenceIds: ['EV-01', 'EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
