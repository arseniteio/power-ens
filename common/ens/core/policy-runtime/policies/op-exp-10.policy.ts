// op.exp.10 · Cryptographic key protection.
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

const CONTROL = 'op.exp.10';
const POLICY = 'policy.op.exp.10';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Same clock margin as `resolveCollectorCoverage`: a fact from the future proves nothing.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Heartbeat that enables a silence, as in the primitives.
const HEARTBEAT_HOURS = 24;

// `causa` only with NO_EVALUABLE: whose gap it is (see `ENSGapCause`). It reaches the evidence and
// requirement through the decision; without it the card inherited the classic model's cause, which
// does not see the facts the policy reads.
type Measurement = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;
  motivo: string;
  causa?: ENSGapCause;
};

const compliant = (motive: string): Measurement => ({ estado: 'CUMPLE', motivo: motive });
const nonCompliant = (motive: string): Measurement => ({ estado: 'NO_CUMPLE', motivo: motive });
// Defaults to EVIDENCE: the data arrived and is not enough. Missing parameter (CONFIGURATION),
// collector silence (COLLECTION) and what the collector declares (`withoutCoverage`) say so
// explicitly.
const notMeasured = (motive: string, cause: ENSGapCause = 'EVIDENCE'): Measurement => ({
  estado: 'NO_EVALUABLE',
  motivo: motive,
  causa: cause,
});

// Cause of several unmeasured measurements (one per machine, or several axes), same order as the
// engine (`resolveGapCause`): COLLECTION only if all say so, CONFIGURATION if any does, otherwise
// EVIDENCE.
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

// No op.exp.10 event in the whole scope: the collector has not run.
const withoutCollector = (): Measurement =>
  notMeasured('No ha llegado ningún evento de op.exp.10: el recolector no se ha ejecutado en ninguna máquina del alcance.', 'COLLECTION');

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

// Several measurements (per machine, or several axes) into one: the worst wins and the reason
// counts those that support it.
const combineMeasurements = (measurements: Measurement[], empty: Measurement): Measurement => {
  if (!measurements.length) {
    return empty;
  }

  const status = worstStatus(measurements);
  const owners = measurements.filter(m => m.estado === status);

  return {
    estado: status,
    motivo: owners.map(m => m.motivo).join(' | '),
    ...(status === 'NO_EVALUABLE' ? { causa: commonGapCause(owners) } : {}),
  };
};


// The normalizer splits an event with `evidence_id=EV-02,EV-06,EV-08` into one per evidence
// (`<id>#EV-06`); the FACT is judged here, so it counts once.
const facts = (
  events: ENSNormalizedEvent[],
  type: string
): ENSNormalizedEvent[] => {
  const seen = new Set<string>();

  return events.filter(event => {
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

const parseInstant = (text: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    return undefined;
  }

  const value = new Date(text).getTime();

  return Number.isFinite(value) ? value : undefined;
};

const stripAccents = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const formatList = (items: string[], max = 5): string => {
  const unique = Array.from(new Set(items));

  return unique.length > max
    ? `${unique.slice(0, max).join('; ')} y ${unique.length - max} más`
    : unique.join('; ');
};


const findParameter = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

const configured = (p: ENSControlParameter | undefined): boolean => {
  if (!p) return false;
  if (Array.isArray(p.value)) return p.value.some(v => String(v).trim());
  return p.value !== undefined && p.value !== null && String(p.value).trim() !== '';
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

const parameterDisplayName = (context: ENSPolicyContext, id: string): string => {
  const p = findParameter(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};


type Machine = { nombre: string; eventos: ENSNormalizedEvent[] };

// Each machine's facts apart: P-05 is a decision PER MACHINE and coverage is declared by each
// collector's heartbeat.
const machines = (context: ENSPolicyContext): Machine[] => {
  const byAgent = new Map<string, ENSNormalizedEvent[]>();

  context.events
    .filter(e => e.controlId === CONTROL)
    .forEach(e => {
      const key = e.agentName || e.agentId || 'desconocida';
      byAgent.set(key, [...(byAgent.get(key) || []), e]);
    });

  return Array.from(byAgent.entries()).map(([name, events]) => ({ nombre: name, eventos: events }));
};

// Does this machine's last heartbeat, recent and correct, declare that the run looked at this
// evidence ENTIRELY?
const coveredCheck = (
  machine: Machine,
  evidence: string,
  now: number
): { si: boolean; motivo: string } => {
  const heartbeats = facts(machine.eventos, 'collector_run')
    .map(e => ({ e, t: new Date(e.timestamp).getTime() }))
    .filter(x => Number.isFinite(x.t) && x.t <= now + FUTURE_TOLERANCE_MS && x.t >= now - HEARTBEAT_HOURS * HOUR_MS)
    .sort((a, b) => b.t - a.t);

  const last = heartbeats[0]?.e;

  if (!last) {
    return { si: false, motivo: `no consta ningún latido del recolector de ${machine.nombre} en las últimas ${HEARTBEAT_HOURS} h` };
  }

  if (factField(last, 'resultado') !== 'completada') {
    return { si: false, motivo: `el último latido de ${machine.nombre} no declara una pasada completada` };
  }

  const coveredEvidences = factField(last, 'evidencias_cubiertas')
    .split(',')
    .map(x => x.trim());

  return coveredEvidences.includes(evidence)
    ? { si: true, motivo: `el latido de ${machine.nombre} (${last.timestamp}) declara ${evidence} cubierta` }
    : { si: false, motivo: `el último latido de ${machine.nombre} (${last.timestamp}) no declara ${evidence} cubierta: esa pasada no pudo mirarla entera` };
};

// The most recent degradation the collector emitted for an evidence on this machine: it says WHY it
// could not look.
const lastDegradation = (machine: Machine, evidence: string): ENSNormalizedEvent | undefined =>
  facts(machine.eventos, 'evidence_state')
    .filter(e => e.evidenceId === evidence || factField(e, 'evidence_id').split(',').includes(evidence))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];

const degradation = (machine: Machine, evidence: string): string => {
  const last = lastDegradation(machine, evidence);

  return last ? ` El recolector dice: ${factField(last, 'motivo')}` : '';
};

// The cause with which the collector declared it could not look: it knows whether auditd rules are
// unloaded (CONFIGURATION) or a source could not be read (COLLECTION). Without declared
// degradation, `byDefault`.
const declaredCause = (machine: Machine, evidence: string, byDefault: ENSGapCause): ENSGapCause => {
  const last = lastDegradation(machine, evidence);
  const declared = last ? factField(last, 'causa').toUpperCase() : '';

  return ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'].includes(declared)
    ? (declared as ENSGapCause)
    : byDefault;
};

// An evidence the last run did not look at entirely: the reason ends with what the collector says
// and the cause is its own. Declaring nothing, the missing heartbeat or one not covering it is a
// COLLECTION failure.
const withoutCoverage = (machine: Machine, evidence: string, motive: string): Measurement =>
  notMeasured(`${motive}${degradation(machine, evidence)}`, declaredCause(machine, evidence, 'COLLECTION'));

const prefix = (machine: Machine, several: boolean): string =>
  several ? `[${machine.nombre}] ` : '';


type Authorized = { algoritmo: string; minimo?: number };

// P-03 by usage. A row without algorithm authorizes nothing.
const authorizedByKey = (context: ENSPolicyContext): Map<string, Authorized[]> | undefined => {
  const table = tableParameterRows(context, 'P-03');

  if (!table) {
    return undefined;
  }

  const byUsage = new Map<string, Authorized[]>();

  table.forEach(row => {
    const usage = stripAccents(row.uso || '');
    const algorithm = (row.algoritmo || '').trim().toUpperCase();

    if (!usage || !algorithm) {
      return;
    }

    const min = /^\d+$/.test((row.longitud_min || '').trim())
      ? Number(row.longitud_min)
      : undefined;

    byUsage.set(usage, [...(byUsage.get(usage) || []), { algoritmo: algorithm, minimo: min }]);
  });

  return byUsage.size ? byUsage : undefined;
};

// An observed element ('AES-GCM:256', 'SNTRUP761-X25519') against its usage. `undefined` = cannot
// be decided (P-03 requires length and the fact lacks it).
const authorizedFor = (
  policy: Map<string, Authorized[]>,
  usage: string,
  item: string
): { ok: boolean | undefined; motivo: string } => {
  const [family, bitsText] = item.split(':');
  const algorithm = (family || '').trim().toUpperCase();
  const bits = /^\d+$/.test((bitsText || '').trim()) ? Number(bitsText) : undefined;

  const rowsUsage = policy.get(stripAccents(usage)) || [];
  const candidate = rowsUsage.filter(f => f.algoritmo === algorithm);

  if (!candidate.length) {
    return { ok: false, motivo: `${item} no está autorizado para ${usage}` };
  }

  // One row admitting it is enough: two rows of the same algorithm with different minimums do not
  // contradict, the most permissive decides.
  if (candidate.some(f => f.minimo === undefined)) {
    return { ok: true, motivo: '' };
  }

  const min = Math.min(...candidate.map(f => f.minimo as number));

  if (bits === undefined) {
    return { ok: undefined, motivo: `${item} (${usage}) no trae longitud y P-03 exige ${min} bits` };
  }

  return bits >= min
    ? { ok: true, motivo: '' }
    : { ok: false, motivo: `${item} está por debajo de los ${min} bits que P-03 exige para ${usage}` };
};

// Contrasts a list of (usage, element, context) and returns the measurement.
const checks = (
  policy: Map<string, Authorized[]>,
  items: { uso: string; elemento: string; donde: string }[]
): { fallos: string[]; dudas: string[] } => {
  const failures: string[] = [];
  const doubts: string[] = [];

  items.forEach(({ uso: usage, elemento: item, donde: where }) => {
    const r = authorizedFor(policy, usage, item);

    if (r.ok === false) failures.push(`${where}: ${r.motivo}`);
    if (r.ok === undefined) doubts.push(`${where}: ${r.motivo}`);
  });

  return { fallos: failures, dudas: doubts };
};


const ev01 = (context: ENSPolicyContext, all: Machine[], now: number): Measurement => {
  const table = tableParameterRows(context, 'P-08');

  if (!table) {
    return notMeasured(`${parameterDisplayName(context, 'P-08')} está sin configurar: no hay contra qué contrastar quién accede a las claves.`, 'CONFIGURATION');
  }

  const accounts = new Set(table.map(f => (f.cuenta || '').trim()).filter(Boolean));
  const several = all.length > 1;

  return combineMeasurements(
    all.map(m => {
      const accesses = facts(m.eventos, 'key_material_accessed');
      const outside = accesses.filter(e => !accounts.has(factField(e, 'actor')));
      const cov = coveredCheck(m, 'EV-01', now);

      if (outside.length) {
        return nonCompliant(
          `${prefix(m, several)}Accesos al material criptográfico por cuentas que no figuran en ${parameterDisplayName(context, 'P-08')}: ${formatList(
            outside.map(e => `${factField(e, 'actor')} (${factField(e, 'sesion')}) · ${factField(e, 'acceso')} de ${factField(e, 'recurso')} con ${factField(e, 'proceso')}, ${factField(e, 'veces')} vez/veces hasta ${factField(e, 'ultima')}`)
          )}.`
        );
      }

      if (!cov.si) {
        return withoutCoverage(
          m,
          'EV-01',
          `${prefix(m, several)}${accesses.length ? `Los ${accesses.length} acceso(s) observados son de cuentas autorizadas, pero` : 'No se ha observado ningún acceso, y'} ${cov.motivo}: lo que no se vigila no acredita nada.`
        );
      }

      return compliant(
        accesses.length
          ? `${prefix(m, several)}Los ${accesses.length} acceso(s) al material criptográfico son de cuentas de ${parameterDisplayName(context, 'P-08')} (${formatList(accesses.map(e => factField(e, 'actor')))}), y ${cov.motivo}.`
          : `${prefix(m, several)}Ningún acceso al material criptográfico en la ventana, y ${cov.motivo}.`
      );
    }),
    withoutCollector()
  );
};


const ev03 = (context: ENSPolicyContext, all: Machine[]): Measurement => {
  const policy = authorizedByKey(context);

  if (!policy) {
    return notMeasured(`${parameterDisplayName(context, 'P-03')} está sin configurar: no hay algoritmos autorizados contra los que contrastar la configuración.`, 'CONFIGURATION');
  }

  const scope = tableParameterRows(context, 'P-04');

  if (!scope) {
    return notMeasured(`${parameterDisplayName(context, 'P-04')} está sin configurar: sin el alcance declarado no se puede afirmar que se hayan verificado todos los servicios criptográficos.`, 'CONFIGURATION');
  }

  const several = all.length > 1;

  return combineMeasurements(
    all.map(m => {
      const observed = facts(m.eventos, 'crypto_config_observed');
      const services = new Set(observed.map(e => stripAccents(factField(e, 'servicio'))));

      const declared = scope
        .filter(f => (f.sistema || '').trim() === '*' || stripAccents(f.sistema || '') === stripAccents(m.nombre))
        .map(f => (f.servicio || '').trim())
        .filter(Boolean);

      const withoutObserve = declared.filter(s => !services.has(stripAccents(s)));

      const { fallos: failures, dudas: doubts } = checks(
        policy,
        observed.flatMap(e =>
          factField(e, 'algoritmos')
            .split(',')
            .map(x => x.trim())
            .filter(Boolean)
            .map(item => ({
              uso: factField(e, 'uso'),
              elemento: item,
              donde: `${factField(e, 'servicio')} ${factField(e, 'elemento')}`,
            }))
        )
      );

      if (failures.length) {
        return nonCompliant(`${prefix(m, several)}Algoritmos no autorizados en ${parameterDisplayName(context, 'P-03')}: ${formatList(failures, 8)}.`);
      }

      // The collector ran and saw no service: its cause if it says why; otherwise the data arrived
      // and is not enough.
      if (!observed.length) {
        return notMeasured(
          `${prefix(m, several)}No se ha observado la configuración de ningún servicio criptográfico.${degradation(m, 'EV-03')}`,
          declaredCause(m, 'EV-03', 'EVIDENCE')
        );
      }

      if (withoutObserve.length) {
        return notMeasured(`${prefix(m, several)}${parameterDisplayName(context, 'P-04')} declara para esta máquina ${formatList(withoutObserve)}, y no se ha observado: un servicio declarado sin verificar deja R1 sin demostrar.`);
      }

      if (doubts.length) {
        return notMeasured(`${prefix(m, several)}No se puede contrastar: ${formatList(doubts)}.`);
      }

      return compliant(
        `${prefix(m, several)}Todos los algoritmos que aceptan ${formatList(Array.from(new Set(observed.map(e => factField(e, 'servicio')))))} (${observed.length} directiva(s)) figuran en ${parameterDisplayName(context, 'P-03')} con la longitud exigida.`
      );
    }),
    withoutCollector()
  );
};


const ev04 = (context: ENSPolicyContext, all: Machine[], now: number): Measurement => {
  const policy = authorizedByKey(context);

  if (!policy) {
    return notMeasured(`${parameterDisplayName(context, 'P-03')} está sin configurar: no hay algoritmos autorizados contra los que contrastar lo negociado.`, 'CONFIGURATION');
  }

  const several = all.length > 1;

  return combineMeasurements(
    all.map(m => {
      const negotiated = facts(m.eventos, 'crypto_protocol_negotiated');
      const cov = coveredCheck(m, 'EV-04', now);

      const { fallos: failures, dudas: doubts } = checks(
        policy,
        negotiated.map(e => ({
          uso: factField(e, 'uso'),
          elemento: factField(e, 'algoritmo'),
          donde: `${factField(e, 'servicio')} ${factField(e, 'identificador')} (${factField(e, 'veces')} vez/veces, última ${factField(e, 'ultima')})`,
        }))
      );

      if (failures.length) {
        return nonCompliant(`${prefix(m, several)}Se han negociado algoritmos no autorizados en ${parameterDisplayName(context, 'P-03')}: ${formatList(failures)}.`);
      }

      if (!cov.si) {
        return withoutCoverage(
          m,
          'EV-04',
          `${prefix(m, several)}${negotiated.length ? `Lo observado (${negotiated.length} algoritmo(s) negociados) está autorizado, pero` : 'No se ha observado ninguna negociación, y'} ${cov.motivo}.`
        );
      }

      if (doubts.length) {
        return notMeasured(`${prefix(m, several)}No se puede contrastar: ${formatList(doubts)}.`);
      }

      return compliant(
        negotiated.length
          ? `${prefix(m, several)}Los ${negotiated.length} algoritmo(s) negociados en la ventana figuran en ${parameterDisplayName(context, 'P-03')}, y ${cov.motivo}.`
          : `${prefix(m, several)}No se ha negociado nada en la ventana, y ${cov.motivo}.`
      );
    }),
    withoutCollector()
  );
};


const ev05 = (context: ENSPolicyContext, all: Machine[], now: number): Measurement => {
  const table = tableParameterRows(context, 'P-05');

  if (!table) {
    return notMeasured(`${parameterDisplayName(context, 'P-05')} está sin configurar: no se sabe qué máquinas son medios de explotación.`, 'CONFIGURATION');
  }

  const several = all.length > 1;

  return combineMeasurements(
    all.map(m => {
      const row = table.find(f => stripAccents(f.medio || '') === stripAccents(m.nombre));

      if (!row) {
        return notMeasured(`${prefix(m, several)}${m.nombre} no figura en ${parameterDisplayName(context, 'P-05')}: su función (generación o explotación) no está declarada.`, 'CONFIGURATION');
      }

      const role = stripAccents(row.funcion || '');
      const generated = facts(m.eventos, 'key_generation_tool_executed');

      if (role === 'generacion') {
        // In a generation medium, generating is its function; what op.exp.10.2 requires of IT is
        // isolation, which is declared in P-05 and not measured: nothing to assert from here.
        return notMeasured(`${prefix(m, several)}${m.nombre} está declarado medio de GENERACIÓN en ${parameterDisplayName(context, 'P-05')} (aislamiento: ${row.aislamiento || 'sin declarar'}). Su aislamiento de los medios de explotación es declarativo y no se mide.`);
      }

      if (role !== 'explotacion') {
        return notMeasured(`${prefix(m, several)}La fila de ${m.nombre} en ${parameterDisplayName(context, 'P-05')} no declara una función reconocible ('${row.funcion}').`, 'CONFIGURATION');
      }

      if (generated.length) {
        return nonCompliant(
          `${prefix(m, several)}${m.nombre} es un medio de EXPLOTACIÓN y en él se ha generado material criptográfico: ${formatList(
            generated.map(e => `${factField(e, 'actor')} ejecutó ${factField(e, 'herramienta')} ${factField(e, 'operacion')} ${factField(e, 'veces')} vez/veces (última ${factField(e, 'ultima')})`)
          )}.`
        );
      }

      const cov = coveredCheck(m, 'EV-05', now);

      return cov.si
        ? compliant(`${prefix(m, several)}${m.nombre} es un medio de explotación y no se ha generado ninguna clave en la ventana; ${cov.motivo}.`)
        : withoutCoverage(m, 'EV-05', `${prefix(m, several)}No se ha observado ninguna generación en ${m.nombre}, pero ${cov.motivo}.`);
    }),
    withoutCollector()
  );
};


const ev06 = (context: ENSPolicyContext, all: Machine[], now: number): Measurement => {
  const inventory = tableParameterRows(context, 'P-01');

  if (!inventory) {
    return notMeasured(`${parameterDisplayName(context, 'P-01')} está sin configurar: sin inventario no se sabe qué claves están retiradas.`, 'CONFIGURATION');
  }

  const file = tableParameterRows(context, 'P-06');

  if (!file) {
    return notMeasured(`${parameterDisplayName(context, 'P-06')} está sin configurar: no consta dónde se archivan las claves retiradas.`, 'CONFIGURATION');
  }

  // An archive destination that is a PRODUCTION machine contradicts the requirement by itself,
  // whatever is observed.
  const production = new Set(
    (tableParameterRows(context, 'P-05') || [])
      .filter(f => stripAccents(f.funcion || '') === 'explotacion')
      .map(f => stripAccents(f.medio || ''))
  );
  const productionFile = file.filter(f => production.has(stripAccents(f.destino || '')));

  if (productionFile.length) {
    return nonCompliant(`${parameterDisplayName(context, 'P-06')} declara como archivo de claves retiradas ${formatList(productionFile.map(f => f.destino))}, que ${parameterDisplayName(context, 'P-05')} declara medio de explotación.`);
  }

  const withdrawn = inventory.filter(f => stripAccents(f.estado || '') === 'retirada');
  const several = all.length > 1;

  return combineMeasurements(
    all.map(m => {
      const claves = facts(m.eventos, 'key_material_found');
      const cov = coveredCheck(m, 'EV-06', now);

      const presentes = withdrawn.flatMap(f =>
        claves
          .filter(e =>
            (f.huella && factField(e, 'huella') && f.huella.trim() === factField(e, 'huella')) ||
            (f.ubicacion && f.ubicacion.trim() === factField(e, 'ruta'))
          )
          .map(e => `'${f.clave}' sigue en ${factField(e, 'ruta')}`)
      );

      if (presentes.length) {
        return nonCompliant(`${prefix(m, several)}Claves declaradas RETIRADAS en ${parameterDisplayName(context, 'P-01')} siguen presentes en esta máquina: ${formatList(presentes)}.`);
      }

      if (!cov.si) {
        return withoutCoverage(m, 'EV-06', `${prefix(m, several)}No se ha encontrado ninguna clave retirada, pero ${cov.motivo}.`);
      }

      // A withdrawal identified only by fingerprint cannot be ruled out against a key whose
      // fingerprint could not be read (encrypted, PKCS#12).
      const fingerprintOnly = withdrawn.filter(f => f.huella && !f.ubicacion);
      const withoutFingerprint = claves.filter(e => !factField(e, 'huella'));

      if (fingerprintOnly.length && withoutFingerprint.length) {
        return notMeasured(`${prefix(m, several)}${fingerprintOnly.length} clave(s) retirada(s) se identifican solo por huella, y de ${formatList(withoutFingerprint.map(e => factField(e, 'ruta')))} no se puede leer la huella: no se puede descartar que sean ellas.`);
      }

      return compliant(
        withdrawn.length
          ? `${prefix(m, several)}Ninguna de las ${withdrawn.length} clave(s) retirada(s) de ${parameterDisplayName(context, 'P-01')} está presente entre las ${claves.length} clave(s) privadas encontradas; ${cov.motivo}.`
          : `${prefix(m, several)}${parameterDisplayName(context, 'P-01')} no declara ninguna clave retirada, y el barrido de esta máquina está completo (${cov.motivo}).`
      );
    }),
    withoutCollector()
  );
};


const ev07Validity = (context: ENSPolicyContext, all: Machine[], now: number): Measurement => {
  const p10 = findParameter(context, 'P-10');
  const lead = configured(p10) && /^\d+$/.test(String(p10?.value).trim())
    ? Number(p10?.value) * DAY_MS
    : undefined;
  const several = all.length > 1;

  return combineMeasurements(
    all.map(m => {
      const certificates = facts(m.eventos, 'certificate_observed');
      const cov = coveredCheck(m, 'EV-07', now);
      const expired: string[] = [];
      const next: string[] = [];
      const unreadable: string[] = [];

      certificates.forEach(e => {
        const end = parseInstant(factField(e, 'caduca'));
        const name = `${factField(e, 'sujeto')} (${factField(e, 'ruta')})`;

        if (end === undefined) {
          unreadable.push(name);
        } else if (end < now) {
          expired.push(`${name} caducó el ${factField(e, 'caduca')}`);
        } else if (lead !== undefined && end - now <= lead) {
          next.push(`${name} caduca el ${factField(e, 'caduca')} (${((end - now) / DAY_MS).toFixed(0)} días)`);
        }
      });

      if (expired.length) {
        return nonCompliant(`${prefix(m, several)}Certificados CADUCADOS que siguen instalados: ${formatList(expired)}. La retirada (fase 4 del ciclo de vida) no se gestiona.`);
      }

      if (unreadable.length) {
        return notMeasured(`${prefix(m, several)}No se puede leer la caducidad de ${formatList(unreadable)}.`);
      }

      if (!cov.si) {
        return withoutCoverage(m, 'EV-07', `${prefix(m, several)}No hay certificados caducados entre los observados, pero ${cov.motivo}.`);
      }

      const notice = next.length
        ? ` PRÓXIMOS A CADUCAR según ${parameterDisplayName(context, 'P-10')}: ${formatList(next)}.`
        : lead === undefined && certificates.length
          ? ` Sin ${parameterDisplayName(context, 'P-10')} no se avisa de los próximos a caducar.`
          : '';

      return compliant(
        certificates.length
          ? `${prefix(m, several)}Ninguno de los ${certificates.length} certificado(s) en disco está caducado.${notice}`
          : `${prefix(m, several)}No hay certificados en disco fuera del almacén de CA del sistema, y ${cov.motivo}.`
      );
    }),
    withoutCollector()
  );
};

const ev07Algorithms = (context: ENSPolicyContext, all: Machine[], now: number): Measurement => {
  const policy = authorizedByKey(context);

  if (!policy) {
    return notMeasured(`${parameterDisplayName(context, 'P-03')} está sin configurar: no hay algoritmos autorizados contra los que contrastar los certificados.`, 'CONFIGURATION');
  }

  const several = all.length > 1;

  return combineMeasurements(
    all.map(m => {
      const certificates = facts(m.eventos, 'certificate_observed');
      const cov = coveredCheck(m, 'EV-07', now);

      const items = certificates.flatMap(e => {
        const where = `certificado ${factField(e, 'sujeto')} (${factField(e, 'ruta')})`;
        const hash = factField(e, 'hash_firma');

        return [
          { uso: 'firma', elemento: factField(e, 'algoritmo_clave'), donde: where },
          ...(hash && hash !== 'INTRINSECO' ? [{ uso: 'hash', elemento: hash, donde: where }] : []),
        ];
      });

      const { fallos: failures, dudas: doubts } = checks(policy, items);

      if (failures.length) {
        return nonCompliant(`${prefix(m, several)}Certificados con clave o firma no autorizadas en ${parameterDisplayName(context, 'P-03')}: ${formatList(failures)}.`);
      }

      if (doubts.length) {
        return notMeasured(`${prefix(m, several)}No se puede contrastar: ${formatList(doubts)}.`);
      }

      if (!cov.si) {
        return withoutCoverage(m, 'EV-07', `${prefix(m, several)}Los certificados observados están autorizados, pero ${cov.motivo}.`);
      }

      return compliant(
        certificates.length
          ? `${prefix(m, several)}La clave y la firma de los ${certificates.length} certificado(s) figuran en ${parameterDisplayName(context, 'P-03')}.`
          : `${prefix(m, several)}No hay certificados en disco fuera del almacén de CA del sistema, y ${cov.motivo}.`
      );
    }),
    withoutCollector()
  );
};

// Measurement of an evidence judged by a primitive, as its primitive left it; not re-judged here.
const ofPrimitive = (context: ENSPolicyContext, id: string): Measurement => {
  const evidence = context.evidences.find(e => e.id === id);
  const status = evidence?.status;
  const motive =
    evidence?.observations
      ?.filter(o => !o.startsWith('Pregunta de auditoría'))
      .slice(1)
      .join(' ') || '';

  if (status === 'CUMPLE') return compliant(motive);
  if (status === 'NO_CUMPLE' || status === 'PARCIAL') return nonCompliant(motive);

  return notMeasured(motive || `${id} no se ha podido medir.`, evidence?.gapCause || 'COLLECTION');
};


type TypeRule = ENSPolicyDecision['trace']['ruleType'];

const REQUIREMENTS: Record<string, { niveles: string[]; parametros: string[]; tipo: TypeRule }> = {
  'op.exp.10.1': { niveles: ['BAJO', 'MEDIO', 'ALTO'], parametros: ['P-01', 'P-02', 'P-07', 'P-08', 'P-10'], tipo: 'WHITELIST' },
  'op.exp.10.2': { niveles: ['BAJO', 'MEDIO', 'ALTO'], parametros: ['P-05'], tipo: 'TOOL_MATCH' },
  'op.exp.10.3': { niveles: ['BAJO', 'MEDIO', 'ALTO'], parametros: ['P-01', 'P-05', 'P-06'], tipo: 'PATH_MATCH' },
  'op.exp.10.r1.1': { niveles: ['MEDIO', 'ALTO'], parametros: ['P-03', 'P-04'], tipo: 'WHITELIST' },
};

const decide = (
  requirement: string,
  status: Measurement['estado'],
  evidences: string[],
  parameters: string[],
  type: TypeRule,
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

// Those judged by their primitive already have a verdict in the evidence table and are not repeated
// as own decision.
const PRIMITIVE_EVIDENCES = ['EV-02', 'EV-08'];

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();
  const all = machines(context);

  // op.exp.10.1 cannot be proven without inventory or procedure: the sheet says so (condition A6),
  // independent of what the machine measures.
  const missingDocuments = ['P-01', 'P-07'].filter(id => !configured(findParameter(context, id)));
  const documental: Measurement = missingDocuments.length
    ? notMeasured(`Sin ${missingDocuments.map(id => parameterDisplayName(context, id)).join(' ni ')} op.exp.10.1 no se puede evaluar: no hay inventario de claves o procedimiento de ciclo de vida contra el que contrastar la custodia medida.`, 'CONFIGURATION')
    : compliant(`${parameterDisplayName(context, 'P-01')} y ${parameterDisplayName(context, 'P-07')} están declarados.`);

  const validity = ev07Validity(context, all, now);
  const algorithmsCert = ev07Algorithms(context, all, now);

  const measurements: Record<string, Measurement> = {
    'EV-01': ev01(context, all, now),
    'EV-02': ofPrimitive(context, 'EV-02'),
    'EV-03': ev03(context, all),
    'EV-04': ev04(context, all, now),
    'EV-05': ev05(context, all, now),
    'EV-06': ev06(context, all, now),
    'EV-08': ofPrimitive(context, 'EV-08'),
  };

  // EV-07 answers two requirements with two different questions.
  const byRequirement: Record<string, { id: string; medida: Measurement }[]> = {
    'op.exp.10.1': [
      { id: 'P-01/P-07', medida: documental },
      { id: 'EV-01', medida: measurements['EV-01'] },
      { id: 'EV-02', medida: measurements['EV-02'] },
      { id: 'EV-07', medida: validity },
      { id: 'EV-08', medida: measurements['EV-08'] },
    ],
    'op.exp.10.2': [{ id: 'EV-05', medida: measurements['EV-05'] }],
    'op.exp.10.3': [{ id: 'EV-06', medida: measurements['EV-06'] }],
    'op.exp.10.r1.1': [
      { id: 'EV-03', medida: measurements['EV-03'] },
      { id: 'EV-04', medida: measurements['EV-04'] },
      { id: 'EV-07', medida: algorithmsCert },
    ],
  };

  const decisions: ENSPolicyDecision[] = [];

  Object.entries(REQUIREMENTS).forEach(([requirement, { niveles: levels, parametros: parameters, tipo: type }]) => {
    // A requirement not applying at the level decides nothing: otherwise the bridge would paint its
    // evidences with a verdict the level does not require.
    if (!levels.includes(context.level)) {
      return;
    }

    const own = byRequirement[requirement];
    const status = worstStatus(own.map(p => p.medida));

    // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads; `find` returns
    // the first). It names only the evidences that support it so the bridge does not paint a
    // healthy one with another's color.
    // If what supports it is a documentary parameter (P-01 or P-07 undeclared) the parameter is
    // named: an empty list would make the bridge inherit ALL the requirement's evidences and paint
    // a measured custody grey.
    const evidencesOwners = own
      .filter(p => p.medida.estado === status && p.id.startsWith('EV-'))
      .map(p => p.id);
    const owners = evidencesOwners.length
      ? evidencesOwners
      : missingDocuments.length
        ? missingDocuments
        : own.map(p => p.id).filter(id => id.startsWith('EV-'));

    decisions.push(
      withReasonParts(decide(
        requirement,
        status,
        owners,
        parameters,
        type,
        requirement,
        compositeReason(own),
        own.map(p => `${p.id} CUMPLE`).join(' y '),
        commonGapCause(own.filter(p => p.medida.estado === status).map(p => p.medida))
      ), reasonPartsOf(own))
    );

    // And one per evidence measured here, with ITS status, so the evidence table shows what was
    // measured of each and not the aggregate.
    own
      .filter(p => p.id.startsWith('EV-') && !PRIMITIVE_EVIDENCES.includes(p.id))
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

  const variables: ENSRuntimeVariable[] = [
    ...Object.entries(measurements).map(([id, measurement]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: measurement.estado,
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: measurement.motivo,
    })),
    {
      name: 'medida_EV07_vigencia',
      value: validity.estado,
      parameterIds: ['P-10'],
      evidenceIds: ['EV-07'],
      eventIds: [],
      description: validity.motivo,
    },
    {
      name: 'medida_EV07_algoritmos',
      value: algorithmsCert.estado,
      parameterIds: ['P-03'],
      evidenceIds: ['EV-07'],
      eventIds: [],
      description: algorithmsCert.motivo,
    },
  ];

  return { decisions, runtimeVariables: variables };
};

export const opExp10PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.exp.10.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-07', 'P-08', 'P-10'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-07', 'EV-08'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.10.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-05'],
      ruleType: 'TOOL_MATCH',
    },
    {
      requirementId: 'op.exp.10.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-05', 'P-06'],
      evidenceIds: ['EV-06'],
      ruleType: 'PATH_MATCH',
    },
    {
      // MEDIA and ALTA require exactly the same: base + R1.
      requirementId: 'op.exp.10.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04'],
      evidenceIds: ['EV-03', 'EV-04', 'EV-07'],
      ruleType: 'WHITELIST',
    },
    // The ENS defines R2 but requires it in no category: without levels the engine evaluates it
    // NO_APLICA.
    {
      requirementId: 'op.exp.10.r2.1',
      levels: [],
      parameterIds: ['P-09'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
