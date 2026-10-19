// op.nub.1 · Cloud service protection. Mostly CONTRACTUAL: provider conformity and certification,
// pentest, data jurisdiction and encryption are screen declarations with their validity; the
// technical part is the integration of cloud services with Wazuh. None fits a primitive:
// 1. DOCUMENTARY THINGS ARE JUDGED WITH THEIR VALIDITY. Each used service of P-02 is crossed by
// name with P-03, P-08, P-09 and P-10 (EV-09) and, from MEDIA, with P-04 (EV-08), and each date is
// compared with `context.now`. What complies is marked `attested`: «acreditado documentalmente» on
// screen, never measured.
// 2. TECHNICAL THINGS ARE MEASURED ON THE MANAGER and facts speak of cloud MODULES, not this
// machine: each P-06 row is crossed with its module (EV-01) and its administrative operations
// against P-11 (EV-04). A service without integration is a report finding, not a verdict. Accesses
// without a second factor (EV-07) too: the criterion is op.acc.6.r8.1's and they are reported
// crossed with it.
// 3. THE MEASUREMENT WINS OVER THE DOCUMENT. op.nub.1.2 complies accredited if the file is complete
// and valid and no technical measurement is against; a technical NO_CUMPLE leaves it NO_CUMPLE, and
// `requirement-evaluator` does the same on its own.
// Requirements: op.nub.1.1 provider: documentary without technical evidence; NO_APLICA if P-01 is
// neither provider nor both; otherwise the conformity of each provided service of P-02 in P-03, in
// force (`attested`). op.nub.1.2 user: EV-09 (file) with EV-01 and EV-04 of the used services P-06
// integrates; EV-07 reported. op.nub.1.r1.1 EV-08: P-04 certification in force per service.
// op.nub.1.r1.2 P-05 with a single «ninguno» row is NO_APLICA; empty, or «ninguno» mixed with
// services, unmeasured (CONFIGURATION); with services, each with its op.pl.5 verification declared,
// reference and validity (`attested`); «cumple = no» or expired fails. op.nub.1.r2.1 EV-02: the
// provider's own posture findings per P-07 service; Wazuh 4.14 has no «SCA cloud», so without those
// findings it is not automatable.
// There is no P-ATT: documentary things are judged with their validity; op.nub.1 does not declare
// P-ATT, so no non-expiring attestation can accredit 1.1 or R1.2.
// P-01 = ninguno leaves the WHOLE control NO_APLICA, declared and auditable.
// EV-03 (shadow IT), EV-05 (encryption) and EV-06 (region) stay in the catalog with no requirement
// judging them: NO_APLICA with the «dato del informe» reason so they are not painted grey.
// EV-08 and EV-09 decisions do NOT carry the `attested` mark, on purpose: the bridge
// (`policy-evidence-bridge.ts`) does not fill an evidence with an accredited decision so a document
// is not passed off as a TECHNICAL evidence's measurement and leaked into another requirement.
// EV-08 and EV-09 are not technical: they ARE the documentary file, each of a single requirement,
// and their reason says «Acreditado documentalmente». Marked, they would stay «sin recogida»,
// sending the operator to look for a collector that does not exist. The mark goes on the
// REQUIREMENT's decision.
// Invariants (as in `evidence/judgment.ts` and the kit): the collector emits instants and counts,
// not ages: a record's age is measured at the observation instant (`eventTime`) and a document's
// against `context.now`; no fact or parameter is NO_EVALUABLE with reason and cause, never CUMPLE
// by absence; what the collector declares unmeasurable keeps its reason and cause, combined with
// what was measured; no default deadline, threshold or list.
// Decisions are emitted only for requirements applying at the level (system category).
// Types and utilities come from the file, never from a barrel (Settings TDZ cycle).
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
import type { ENSReasonPart } from '../types';
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import {
  HOUR_MS,
  DAY_MS,
  compliant,
  nonCompliant,
  notMeasured,
  notApplicable,
  commonGapCause,
  worstStatus,
  combineMeasurements,
  factField,
  parseNumber,
  parseInstant,
  eventTime,
  formatList,
  formatHours,
  iso,
  stripAccents,
  isEmptyField,
  equalsIgnoreCase,
  findParameter,
  parameterDisplayName,
  tableParameterRows,
  positiveScalar,
  missingParameter,
  createFactReader,
  decisionBuilderFor,
} from './policy-kit';
import type { ENSDecisionRuleType, Measurement } from './policy-kit';

const CONTROL = 'op.nub.1';
const POLICY = 'policy.op.nub.1';

// op.nub.1 facts, with state-fact freshness (26 h): the manager's collector runs every 6 h and
// re-emits the whole state.
const { validos: valid, estadoVigente: currentStatus, degradacion: degradation, sinHechos: withoutFacts, conDegradacion: withDegradation } = createFactReader(CONTROL, {
  recolector: 'el recolector de op.nub.1 del manager',
});

// INGESTION (EV-01) is a liveness state: it says whether records enter today. With 26 h freshness a
// day-old run would keep accrediting a live integration, and EV-04 («no operations -> complies»)
// rests on it. 13 h tolerates two missed 6 h runs.
const INGESTION_FRESHNESS_HOURS = 13;

const ingestionLector = createFactReader(CONTROL, {
  recolector: 'el recolector de op.nub.1 del manager',
  frescuraHoras: INGESTION_FRESHNESS_HOURS,
});

const decide = decisionBuilderFor(POLICY);

// A fact from the future proves nothing, nor does a future-dated document. Same clock tolerance as
// the kit.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Wazuh 4.14 cloud modules P-06 may declare.
const MODULES = ['aws-s3', 'azure-logs', 'gcp-pubsub', 'gcp-bucket', 'office365', 'ms-graph', 'github'];

const ACCREDITED = 'Acreditado documentalmente';

// Decided from screen tables, not facts: their decisions carry `documental` (op.nub.1.2, only when
// the file decides; marked where decided).
const DOCUMENTARY_REQUIREMENTS = ['op.nub.1.1', 'op.nub.1.r1.1', 'op.nub.1.r1.2'];
const DOCUMENTARY_EVIDENCES = ['EV-08', 'EV-09'];


type Position = 'prestador' | 'usuario' | 'ambos' | 'ninguno';

const POSITIONS: Position[] = ['prestador', 'usuario', 'ambos', 'ninguno'];

const positionOf = (
  context: ENSPolicyContext
): { posicion?: Position; medida?: Measurement } => {
  const value = findParameter(context, 'P-01')?.value;
  const text = value === undefined || value === null || Array.isArray(value) ? '' : String(value).trim();

  if (!text) {
    return {
      medida: missingParameter(context, 'P-01', 'qué requisitos son exigibles: si el sistema presta servicios en la nube, si los utiliza de terceros, ambas cosas o ninguna'),
    };
  }

  const position = POSITIONS.find(p => p === stripAccents(text));

  return position
    ? { posicion: position }
    : {
        medida: notMeasured(
          `${parameterDisplayName(context, 'P-01')} dice «${text}», que no es ninguna de sus opciones (${POSITIONS.join(', ')}): no se puede saber qué requisitos son exigibles.`,
          'CONFIGURATION'
        ),
      };
};

const uses = (p?: Position): boolean => p === 'usuario' || p === 'ambos';
const provides = (p?: Position): boolean => p === 'prestador' || p === 'ambos';

const NONE = 'P-01 declara que el sistema no presta ni utiliza servicios en la nube («ninguno»): op.nub.1 no aplica.';


interface Inventory {
  utilizados: Record<string, string>[];
  prestados: Record<string, string>[];
  // Rows that cannot be classified are reported, naming the row.
  errores: Measurement[];
}

const inventory = (context: ENSPolicyContext, position: Position): Inventory | undefined => {
  const all = tableParameterRows(context, 'P-02');

  if (!all) {
    return undefined;
  }

  const output: Inventory = { utilizados: [], prestados: [], errores: [] };

  all.forEach(row => {
    const usage = stripAccents(row.uso || '');
    const name = row.servicio || '(sin nombre)';

    if (!usage) {
      if (position === 'usuario') {
        output.utilizados.push(row);
      } else if (position === 'prestador') {
        output.prestados.push(row);
      } else {
        output.errores.push(
          notMeasured(`P-02, servicio «${name}»: con P-01 = ambos hay que decir en la columna «uso» si se utiliza de un tercero o se presta.`, 'CONFIGURATION')
        );
      }

      return;
    }

    if (usage !== 'utilizado' && usage !== 'prestado') {
      output.errores.push(
        notMeasured(`P-02, servicio «${name}»: la columna «uso» dice «${row.uso}», que no es «utilizado» ni «prestado».`, 'CONFIGURATION')
      );

      return;
    }

    if ((usage === 'prestado' && position === 'usuario') || (usage === 'utilizado' && position === 'prestador')) {
      output.errores.push(
        notMeasured(`P-02, servicio «${name}»: se declara ${usage} y P-01 dice «${position}». Corrige una de las dos.`, 'CONFIGURATION')
      );

      return;
    }

    (usage === 'utilizado' ? output.utilizados : output.prestados).push(row);
  });

  return output;
};

const ofService = (table: Record<string, string>[] | undefined, service: string): Record<string, string>[] =>
  (table || []).filter(f => equalsIgnoreCase(f.servicio || '', service));


// Only YYYY-MM-DD and existing (the column is `date`). Any other text («hasta 06/2027», «2027») is
// not interpreted: the row must be corrected.
const date = (text: string): number | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((text || '').trim());

  if (!m) {
    return undefined;
  }

  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(year, month - 1, day);
  const d = new Date(t);

  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? t : undefined;
};

const day10 = (t: number): string => iso(t).slice(0, 10);

// Days left until the end of the validity day (negative if expired).
const daysUntil = (end: number, now: number): number => Math.floor((end + DAY_MS - now) / DAY_MS);


const CATEGORY: Record<string, number> = { basica: 0, media: 1, alta: 2 };
const OF_LEVEL: Record<string, number> = { BAJO: 0, MEDIO: 1, ALTO: 2 };
const CATEGORY_NAME = ['BÁSICA', 'MEDIA', 'ALTA'];

type Conformity = { tipo: 'ens'; categoria: number } | { tipo: 'guia' } | { tipo: 'ens-sin-categoria' } | { tipo: 'desconocida' };

// ENS first, with its category: «ENS BÁSICA (CCN-STIC 809)» is ENS BÁSICA, and looking at the guide
// first accepted it on a MEDIA system. Only a text without «ENS» is read as a CCN-STIC guide. With
// two categories in the text, the lowest.
const conformityOf = (text: string): Conformity => {
  const t = stripAccents(text || '');

  if (/\bens\b/.test(t)) {
    const categories = (t.match(/\b(basica|media|alta)\b/g) || []).map(c => CATEGORY[c]);

    return categories.length ? { tipo: 'ens', categoria: Math.min(...categories) } : { tipo: 'ens-sin-categoria' };
  }

  if (/\bccn-stic\b/.test(t)) {
    return { tipo: 'guia' };
  }

  return { tipo: 'desconocida' };
};

// One service's conformity in P-03: ENS of category not lower than the system's, or a CCN-STIC
// guide, in force at the evaluation date. One valid row is enough; if none, the worst is reported.
// Served by op.nub.1.2 (used services) and op.nub.1.1 (provided services).
const serviceConformity = (
  p03: Record<string, string>[],
  name: string,
  now: number,
  level: number,
  validities: string[],
  // Each judged conformity, for the report's validity field.
  record: Measurement[] = []
): Measurement => {
  const their = ofService(p03, name);

  if (!their.length) {
    const missing = nonCompliant('sin conformidad con el ENS ni con una guía CCN-STIC en P-03');

    record.push({ ...missing, motivo: `«${name}»: ${missing.motivo}` });

    return missing;
  }

  const judgments = their.map((row): Measurement => {
    const end = date(row.vigencia);
    const type = conformityOf(row.conformidad);

    if (end === undefined) {
      return notMeasured(`P-03, fila de «${name}»: la vigencia «${row.vigencia || ''}» no es una fecha AAAA-MM-DD`, 'CONFIGURATION');
    }

    if (type.tipo === 'desconocida' || type.tipo === 'ens-sin-categoria') {
      return notMeasured(
        `P-03, fila de «${name}»: la conformidad «${row.conformidad || ''}» no dice ${type.tipo === 'ens-sin-categoria' ? 'la categoría (ENS BÁSICA, ENS MEDIA o ENS ALTA)' : 'si es ENS <categoría> o una guía CCN-STIC'}`,
        'CONFIGURATION'
      );
    }

    const remain = daysUntil(end, now);

    validities.push(`${name}: conformidad ${row.conformidad} hasta ${day10(end)} (${remain >= 0 ? `quedan ${remain} días` : `vencida hace ${-remain} días`})`);

    if (remain < 0) {
      return nonCompliant(`conformidad ${row.conformidad} vencida el ${day10(end)}`);
    }

    if (type.tipo === 'ens' && type.categoria < level) {
      return nonCompliant(`conformidad ENS ${CATEGORY_NAME[type.categoria]}, inferior a la categoría ${CATEGORY_NAME[level]} del sistema`);
    }

    return compliant(`conformidad ${row.conformidad} hasta ${day10(end)}${row.referencia ? ` (${row.referencia})` : ''}`);
  });

  const measurement = judgments.find(j => j.estado === 'CUMPLE') || combineMeasurements(judgments);

  record.push({ ...measurement, motivo: `«${name}»: ${measurement.motivo}` });

  return measurement;
};


// Documentary things are judged with their validity, not with P-ATT (which does not expire). The
// provider accredits the provided model's measures with each provided service's conformity in P-03.
const provider = (
  context: ENSPolicyContext,
  now: number,
  provided: Record<string, string>[],
  conformities: Measurement[] = []
): File => {
  const p03 = tableParameterRows(context, 'P-03');
  const validities: string[] = [];

  if (!p03) {
    const missing = missingParameter(context, 'P-03', `la conformidad de los servicios prestados (${formatList(provided.map(s => s.servicio))}) con las medidas del modelo según las guías CCN-STIC`);

    // For the report's validity field: there are services and no P-03, so the conformities are
    // unevaluated, not out of scope.
    conformities.push({ ...missing, motivo: `servicios prestados: ${missing.motivo}` });

    return { medida: missing, vigencias: validities };
  }

  const level = OF_LEVEL[context.level] ?? 0;
  const byService = provided.map(service => {
    const m = serviceConformity(p03, service.servicio, now, level, validities, conformities);

    return { ...m, motivo: `«${service.servicio}»${service.modelo ? ` (${service.modelo})` : ''}: ${m.motivo}` };
  });
  const measurement = combineMeasurements(byService);

  return {
    medida:
      measurement.estado === 'CUMPLE'
        ? { ...measurement, motivo: `${ACCREDITED}: los ${provided.length} servicios prestados tienen su conformidad en vigor. ${measurement.motivo}` }
        : measurement,
    vigencias: validities,
  };
};


// Each security service of P-05 with its op.pl.5 verification declared, reference and validity.
// ENSFácil has no op.pl.5: the declaration is judged against the evaluation date, like a
// certification.
const security = (context: ENSPolicyContext, now: number, p05: Record<string, string>[]): Measurement => {
  const byService = p05.map((row): Measurement => {
    const name = `«${row.servicio}»${row.tipo_de_seguridad ? ` (${row.tipo_de_seguridad})` : ''}`;
    const declares = stripAccents(row.cumple_op_pl_5 || '');

    if (declares === 'no') {
      return nonCompliant(`${name}: P-05 declara que no cumple op.pl.5`);
    }

    if (declares !== 'si') {
      return notMeasured(`P-05, fila de ${name}: falta si cumple op.pl.5 («sí» o «no»)`, 'CONFIGURATION');
    }

    const end = date(row.vigente_hasta);

    if (isEmptyField(row.referencia || '') || end === undefined) {
      return notMeasured(
        `P-05, fila de ${name}: ${isEmptyField(row.referencia || '') ? 'falta la referencia de la verificación de op.pl.5' : `la vigencia «${row.vigente_hasta || ''}» no es una fecha AAAA-MM-DD`}`,
        'CONFIGURATION'
      );
    }

    const remain = daysUntil(end, now);

    return remain < 0
      ? nonCompliant(`${name}: la verificación de op.pl.5 «${row.referencia}» venció el ${day10(end)}`)
      : compliant(`${name}: verificación de op.pl.5 «${row.referencia}» hasta ${day10(end)} (quedan ${remain} días)`);
  });

  const measurement = combineMeasurements(byService);

  return measurement.estado === 'CUMPLE'
    ? { ...measurement, motivo: `${ACCREDITED}: los ${p05.length} servicios en la nube de seguridad de P-05 tienen su verificación de op.pl.5 en vigor. ${measurement.motivo}` }
    : measurement;
};

// A declared encryption that says there is none.
const NO_ENCRYPTION = /^(no|ninguno|ninguna|sin cifrar|sin cifrado|no cifrado|no se cifra)$/;


interface File {
  medida: Measurement;
  // What travels to the report: each conformity's validity.
  vigencias: string[];
}

const ev09 = (context: ENSPolicyContext, now: number, used: Record<string, string>[], conformities: Measurement[] = []): File => {
  const p03 = tableParameterRows(context, 'P-03');
  const p08 = tableParameterRows(context, 'P-08');
  const p09 = tableParameterRows(context, 'P-09');
  const p10 = tableParameterRows(context, 'P-10');
  const months = positiveScalar(context, 'P-12');
  const level = OF_LEVEL[context.level] ?? 0;
  const validities: string[] = [];
  const global: Measurement[] = [];

  if (!p03) {
    const missing = missingParameter(context, 'P-03', 'la conformidad con el ENS de los servicios utilizados');

    global.push(missing);
    // As for the provider: without P-03 the conformities are unevaluated.
    if (used.length) {
      conformities.push({ ...missing, motivo: `servicios utilizados: ${missing.motivo}` });
    }
  }

  if (!p10) {
    global.push(missingParameter(context, 'P-10', 'el pentest de los proveedores (op.nub.1.2 a)'));
  } else if (months === undefined) {
    global.push(missingParameter(context, 'P-12', 'la antigüedad de los informes de pentest de P-10'));
  }

  if (!p09) {
    global.push(missingParameter(context, 'P-09', 'el cifrado y la gestión de claves (op.nub.1.2 c)'));
  }

  if (!p08) {
    global.push(missingParameter(context, 'P-08', 'la jurisdicción de los datos (op.nub.1.2 d)'));
  }

  const byService = used.map(service => {
    const name = service.servicio;
    const pieces: Measurement[] = [];

    // ENS conformity or CCN-STIC guide, valid and of sufficient category.
    if (p03) {
      pieces.push(serviceConformity(p03, name, now, level, validities, conformities));
    }

    // a) Provider pentest, no older than P-12 months.
    if (p10 && months !== undefined) {
      const their = ofService(p10, name);

      if (!their.length) {
        pieces.push(nonCompliant('a) sin informe de pentest del proveedor en P-10'));
      } else {
        const judgments = their.map((row): Measurement => {
          const t = date(row.fecha);

          if (t === undefined || isEmptyField(row.ultimo_informe || '')) {
            return notMeasured(
              `P-10, fila de «${name}»: ${t === undefined ? `la fecha «${row.fecha || ''}» no es una fecha AAAA-MM-DD` : 'falta el informe'}`,
              'CONFIGURATION'
            );
          }

          if (t > now + FUTURE_TOLERANCE_MS) {
            return notMeasured(`P-10, fila de «${name}»: el informe está fechado en el futuro (${day10(t)})`, 'CONFIGURATION');
          }

          const date0 = new Date(t);
          const limit = Date.UTC(date0.getUTCFullYear(), date0.getUTCMonth() + months, date0.getUTCDate()) + DAY_MS;

          return now > limit
            ? nonCompliant(`a) el pentest «${row.ultimo_informe}» es del ${day10(t)}, más viejo que los ${months} meses de P-12`)
            : compliant(`a) pentest «${row.ultimo_informe}» del ${day10(t)}`);
        });

        pieces.push(judgments.find(j => j.estado === 'CUMPLE') || combineMeasurements(judgments));
      }
    }

    // c) Encryption and key management.
    if (p09) {
      const row = ofService(p09, name)[0];

      if (!row) {
        pieces.push(nonCompliant('c) sin cifrado ni gestión de claves declarados en P-09'));
      } else if (NO_ENCRYPTION.test(stripAccents(row.cifrado || '').trim())) {
        // Declaring no encryption is declaring failure of c).
        pieces.push(nonCompliant(`c) P-09 declara que los datos no se cifran («${row.cifrado}»)`));
      } else if (isEmptyField(row.cifrado || '') || isEmptyField(row.gestion_claves || '')) {
        pieces.push(notMeasured(`P-09, fila de «${name}»: falta ${isEmptyField(row.cifrado || '') ? 'el cifrado' : 'la gestión de claves'}`, 'CONFIGURATION'));
      } else {
        pieces.push(compliant(`c) ${row.cifrado}, claves: ${row.gestion_claves}`));
      }
    }

    // d) Region of data and backups, and jurisdiction.
    if (p08) {
      const row = ofService(p08, name)[0];
      const missing = row
        ? [['region_datos', 'la región de los datos'], ['region_copias', 'la de las copias'], ['jurisdiccion', 'la jurisdicción']]
            .filter(([c]) => isEmptyField(row[c] || ''))
            .map(([, text]) => text)
        : [];

      if (!row) {
        pieces.push(nonCompliant('d) sin región de los datos ni jurisdicción declaradas en P-08'));
      } else if (missing.length) {
        pieces.push(notMeasured(`P-08, fila de «${name}»: falta ${missing.join(' y ')}`, 'CONFIGURATION'));
      } else {
        pieces.push(compliant(`d) datos en ${row.region_datos}, copias en ${row.region_copias}, ${row.jurisdiccion}`));
      }
    }

    if (!pieces.length) {
      return undefined;
    }

    const joined = combineMeasurements(pieces);

    return { ...joined, motivo: `«${name}»: ${joined.motivo}` };
  }).filter((m): m is Measurement => Boolean(m));

  const measurement = combineMeasurements([...byService, ...global]);

  return {
    medida:
      measurement.estado === 'CUMPLE'
        ? {
            ...measurement,
            motivo: `${ACCREDITED}: los ${used.length} servicios utilizados de P-02 tienen su expediente completo y vigente (la transparencia, b), la cubre la conformidad declarada). ${byService.map(m => m.motivo).join(' ')}`,
          }
        : measurement,
    vigencias: validities,
  };
};


const ev08 = (context: ENSPolicyContext, now: number, used: Record<string, string>[]): File => {
  const p04 = tableParameterRows(context, 'P-04');
  const validities: string[] = [];

  if (!p04) {
    return {
      medida: missingParameter(context, 'P-04', `la certificación reconocida de los servicios utilizados (${formatList(used.map(s => s.servicio))})`),
      vigencias: validities,
    };
  }

  const byService = used.map((service): Measurement => {
    const name = service.servicio;
    const their = ofService(p04, name);

    if (!their.length) {
      return nonCompliant(`«${name}»: sin certificación reconocida en P-04`);
    }

    const judgments = their.map((row): Measurement => {
      const end = date(row.vigencia);

      if (end === undefined || isEmptyField(row.metodologia || '') || isEmptyField(row.n_certificado || '')) {
        return notMeasured(
          `P-04, fila de «${name}»: ${end === undefined ? `la vigencia «${row.vigencia || ''}» no es una fecha AAAA-MM-DD` : `falta ${isEmptyField(row.metodologia || '') ? 'la metodología' : 'el número de certificado'}`}`,
          'CONFIGURATION'
        );
      }

      const remain = daysUntil(end, now);

      validities.push(`${name}: certificación ${row.metodologia} nº ${row.n_certificado} hasta ${day10(end)} (${remain >= 0 ? `quedan ${remain} días` : `vencida hace ${-remain} días`})`);

      return remain < 0
        ? nonCompliant(`«${name}»: la certificación ${row.metodologia} nº ${row.n_certificado} venció el ${day10(end)}`)
        : compliant(`«${name}»: ${row.metodologia} nº ${row.n_certificado} hasta ${day10(end)} (quedan ${remain} días)`);
    });

    return judgments.find(j => j.estado === 'CUMPLE') || combineMeasurements(judgments);
  });

  const measurement = combineMeasurements(byService);

  return {
    medida:
      measurement.estado === 'CUMPLE'
        ? { ...measurement, motivo: `${ACCREDITED}: los ${used.length} servicios utilizados tienen certificación reconocida en vigor. ${measurement.motivo}` }
        : measurement,
    vigencias: validities,
  };
};


interface Integrations {
  // Module -> P-06 services declaring it.
  porModulo: Map<string, string[]>;
  // Services with «ninguno» (or without row): report finding.
  sinIntegrar: string[];
  errores: Measurement[];
  // All modules P-06 declares, also of provided services: so what is declared is not presented as
  // «not declared».
  enP06: string[];
}

const integrations = (context: ENSPolicyContext, services: Record<string, string>[]): Integrations | undefined => {
  const p06 = tableParameterRows(context, 'P-06');

  if (!p06) {
    return undefined;
  }

  const output: Integrations = {
    porModulo: new Map(),
    sinIntegrar: [],
    errores: [],
    enP06: p06.map(f => (f.modulo || '').trim().toLowerCase()).filter(m => MODULES.includes(m)),
  };

  // Only the services judged (the USED ones of op.nub.1.2): a provided service's integration is not
  // this requirement's.
  p06.filter(row => services.some(s => equalsIgnoreCase(s.servicio || '', row.servicio || ''))).forEach(row => {
    const module = (row.modulo || '').trim().toLowerCase();

    if (!module) {
      output.errores.push(
        notMeasured(`P-06, servicio «${row.servicio}»: falta el módulo de Wazuh (o «ninguno» si no se integra).`, 'CONFIGURATION')
      );

      return;
    }

    if (module === 'ninguno') {
      output.sinIntegrar.push(row.servicio);

      return;
    }

    if (!MODULES.includes(module)) {
      output.errores.push(
        notMeasured(`P-06, servicio «${row.servicio}»: «${row.modulo}» no es un módulo cloud de Wazuh (${MODULES.join(', ')}, o «ninguno»).`, 'CONFIGURATION')
      );

      return;
    }

    output.porModulo.set(module, [...(output.porModulo.get(module) || []), row.servicio]);
  });

  services
    .filter(s => !ofService(p06, s.servicio).length)
    .forEach(s => output.sinIntegrar.push(s.servicio));

  return output;
};

const moduleName = (module: string, services: string[]): string => `${formatList(services.map(s => `«${s}»`))} (${module})`;


interface Ingestion {
  medida: Measurement;
  // Module -> its measurement, for EV-04 and EV-07 (a stopped ingestion does not allow asserting
  // there are no operations or accesses).
  porModulo: Map<string, Measurement>;
  // Module -> its current integration facts, for EV-04 (`fuentes_admin`).
  hechos: Map<string, ENSNormalizedEvent[]>;
}

const moduleIngestionOf = (
  context: ENSPolicyContext,
  module: string,
  services: string[],
  current: ENSNormalizedEvent[]
): Measurement => {
  const who = moduleName(module, services);
  const their = current.filter(e => equalsIgnoreCase(factField(e, 'modulo'), module));

  if (!their.length) {
    return nonCompliant(
      `${who}: P-06 lo declara integrado y Wazuh no tiene el módulo ${module} configurado en el manager ni en ningún grupo, ni recibe sus registros de ningún agente.`
    );
  }

  const where = Array.from(new Set(their.flatMap(e => factField(e, 'donde').split(',').map(x => x.trim()).filter(x => !isEmptyField(x))))).join(', ') || 'origen desconocido';
  const pieces: Measurement[] = [];

  // Enabled: its configuration says so; a dedicated agent's is only seen through its alerts
  // (habilitado=-), and then its ingestion proves it.
  if (their.every(e => factField(e, 'habilitado') === 'no')) {
    pieces.push(nonCompliant(`${who}: el módulo está configurado en ${where} pero deshabilitado.`));
  }

  // Module errors in the last 24 h (in the manager's ossec.log, or the agent's if it forwards; `-`
  // if not visible).
  const withErrors = their.filter(e => (parseNumber(factField(e, 'errores_24h')) || 0) > 0);
  const errors = withErrors.reduce((t, e) => t + (parseNumber(factField(e, 'errores_24h')) || 0), 0);
  const withoutSeen = their.every(e => parseNumber(factField(e, 'errores_24h')) === undefined);

  if (errors > 0) {
    const last = withErrors.map(e => factField(e, 'ultimo_error')).find(t => !isEmptyField(t));

    pieces.push(nonCompliant(`${who}: el módulo registra ${errors} errores en 24 h${last ? ` (el último: «${last}»)` : ''}: hay registros que no entran.`));
  }

  // Recent records, measured at the observation instant.
  const deadline = positiveScalar(context, 'P-13');
  const withAlert = their
    .map(e => ({ e, t: parseInstant(factField(e, 'ultima_alerta')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined)
    .sort((a, b) => b.t - a.t)[0];
  const n24 = their.reduce((t, e) => t + (parseNumber(factField(e, 'alertas_24h')) || 0), 0);

  if (deadline === undefined) {
    pieces.push(missingParameter(context, 'P-13', `si la ingesta de ${who} está parada${withAlert ? ` (última alerta ${iso(withAlert.t)})` : ''}`));
  } else if (withAlert) {
    const age = eventTime(withAlert.e) - withAlert.t;

    pieces.push(
      age > deadline * HOUR_MS
        ? nonCompliant(`${who}: su última alerta es del ${iso(withAlert.t)}, ${formatHours(age)} h antes de la observación (P-13 = ${deadline} h): la ingesta está parada.`)
        : compliant(
            `${who}: configurado en ${where}, última alerta ${iso(withAlert.t)}, ${n24} en 24 h${withoutSeen ? ' (sus errores no se ven desde el manager: el módulo corre en un agente que no reenvía su ossec.log)' : ', sin errores'}.`
          )
    );
  } else {
    const starts = their.map(e => parseInstant(factField(e, 'observado_desde'))).filter((t): t is number => t !== undefined);
    const since = starts.length ? Math.min(...starts) : undefined;
    const observed = Math.max(...their.map(eventTime));

    pieces.push(
      since !== undefined && observed - since > deadline * HOUR_MS
        ? nonCompliant(`${who}: configurado en ${where} y sin ningún registro desde que se observa (${iso(since)}), más que P-13 (${deadline} h).`)
        : notMeasured(
            `${who}: configurado en ${where}, sin registros todavía y observado desde ${since !== undefined ? iso(since) : 'un instante desconocido'}, menos que P-13 (${deadline} h): no se puede afirmar ni negar que la ingesta funcione.`
          )
    );
  }

  return combineMeasurements(pieces);
};

const ev01 = (context: ENSPolicyContext, now: number, services: Record<string, string>[]): Ingestion => {
  const byModule = new Map<string, Measurement>();
  const facts = new Map<string, ENSNormalizedEvent[]>();
  const integrated = integrations(context, services);

  if (!integrated) {
    return {
      medida: missingParameter(context, 'P-06', 'qué servicios de P-02 se integran en Wazuh y con qué módulo (o «ninguno»)'),
      porModulo: byModule,
      hechos: facts,
    };
  }

  const { vigentes: current, ultimo: last } = ingestionLector.estadoVigente(context, 'cloud_integration_observed', now);
  const observed = current.filter(e => !isEmptyField(factField(e, 'modulo')) && factField(e, 'modulo') !== 'ninguno');
  const declared = Array.from(integrated.porModulo.keys());
  const withoutIntegrate = integrated.sinIntegrar.length
    ? ` Sin integración en Wazuh (hallazgo del informe, sin veredicto: el ENS no exige integrarlos): ${formatList(integrated.sinIntegrar.map(s => `«${s}»`))}.`
    : '';
  const foreign = observed.filter(e => !integrated.enP06.includes(factField(e, 'modulo').toLowerCase()));
  const notDeclared = foreign.length
    ? ` Wazuh ingiere además ${formatList(Array.from(new Set(foreign.map(e => factField(e, 'modulo')))))}, que P-06 no declara.`
    : '';
  const secrets = observed.filter(e => factField(e, 'secreto_en_linea') === 'si');
  const notice = secrets.length
    ? ` Aviso: ${formatList(secrets.map(e => `${factField(e, 'modulo')} en ${factField(e, 'donde')}`))} lleva la credencial del proveedor escrita en la configuración del manager o de un grupo; tiene que vivir solo en el agente dedicado.`
    : '';

  if (!declared.length) {
    return {
      medida: combineMeasurements([
        ...integrated.errores,
        notApplicable(`P-06 no declara ningún servicio integrado en Wazuh: la parte técnica de op.nub.1.2 no aplica.${withoutIntegrate}${notDeclared}`),
      ]),
      porModulo: byModule,
      hechos: facts,
    };
  }

  if (!current.length || last === undefined) {
    const missing = ingestionLector.sinHechos(context, 'EV-01', now, last, 'inventario de integraciones cloud del manager');

    declared.forEach(m => byModule.set(m, missing));

    return { medida: combineMeasurements([...integrated.errores, { ...missing, motivo: `${missing.motivo}${withoutIntegrate}` }]), porModulo: byModule, hechos: facts };
  }

  const measurements = declared.map(module => {
    const measurement = moduleIngestionOf(context, module, integrated.porModulo.get(module) || [], current);

    byModule.set(module, measurement);
    facts.set(module, current.filter(e => equalsIgnoreCase(factField(e, 'modulo'), module)));

    return measurement;
  });

  const joined = combineMeasurements([...measurements, ...integrated.errores]);

  return {
    medida: ingestionLector.conDegradacion(context, now, 'EV-01', 'cloud_integration_observed', {
      ...joined,
      motivo: `${joined.motivo}${withoutIntegrate}${notDeclared}${notice}`,
    }),
    porModulo: byModule,
    hechos: facts,
  };
};


// Administration-operation records the collector can read (contract, round 2), with the module that
// brings them. `fuentes_admin` says which gave at least one event in 30 days: with none, absence of
// operations proves nothing (Entra ID via Graph, office365, github, an aws-s3 without
// CloudTrail...).
const ADMIN_SOURCES: Record<string, string> = {
  cloudtrail: 'CloudTrail',
  'azure-activity': 'el registro de actividad de Azure',
  'gcp-admin-activity': 'los Cloud Audit Logs de Admin Activity',
};

const MODULE_SOURCE: Record<string, string> = {
  'aws-s3': 'CloudTrail (un bucket de tipo cloudtrail en aws-s3)',
  'azure-logs': 'el registro de actividad de Azure (AzureActivity, por Log Analytics en azure-logs)',
  'gcp-pubsub': 'los Cloud Audit Logs de Admin Activity (una suscripción de Pub/Sub en gcp-pubsub)',
  'gcp-bucket': 'los Cloud Audit Logs de Admin Activity, que ENSFácil lee por gcp-pubsub',
};

const toEnable = (module: string): string =>
  MODULE_SOURCE[module]
    ? `Para medirlo, activa ${MODULE_SOURCE[module]}.`
    : `${module} no trae ningún registro de administración que ENSFácil lea: para medirlo, integra el del proveedor con CloudTrail (aws-s3), el registro de actividad de Azure (AzureActivity, por azure-logs) o los Cloud Audit Logs de Admin Activity (gcp-pubsub).`;

// Without operations by people and with live ingestion: only a measurement if the module brings an
// administration record read in 30 days.
const withoutOperations = (who: string, module: string, facts: ENSNormalizedEvent[], ofServices: number): Measurement => {
  const declared = facts.map(e => factField(e, 'fuentes_admin'));
  const sources = Array.from(
    new Set(declared.flatMap(v => v.split('|').map(x => x.trim().toLowerCase())).filter(x => !isEmptyField(x)))
  );
  const noOperationsReason = `${who}: ninguna operación de administración de una persona en la ventana`;

  if (sources.length) {
    return compliant(
      `${noOperationsReason}, y el recolector lee su registro de administración (${formatList(sources.map(f => ADMIN_SOURCES[f] || f))}, con eventos en los últimos 30 días)${ofServices ? `; ${ofServices} de servicios del proveedor` : ''}.`
    );
  }

  if (!declared.length || declared.some(v => v === '')) {
    return notMeasured(
      `${noOperationsReason}, pero el inventario de integraciones no dice qué registros de administración lee el recolector (falta fuentes_admin: es de una versión anterior), así que la ausencia no demuestra nada. Actualiza el recolector de op.nub.1 en el manager.`,
      'COLLECTION'
    );
  }

  return notMeasured(
    `${noOperationsReason}, pero el recolector no ha leído en los últimos 30 días ningún registro de operaciones de administración de este módulo (fuentes_admin = -), así que la ausencia no demuestra nada. ${toEnable(module)}`
  );
};

// A technical measurement per integrated module, over the window's facts.
const byIntegratedModule = (
  context: ENSPolicyContext,
  services: Record<string, string>[],
  ingestion: Ingestion,
  judges: (module: string, services: string[], moduleIngestion: Measurement | undefined) => Measurement
): Measurement => {
  const integrated = integrations(context, services);

  if (!integrated) {
    return missingParameter(context, 'P-06', 'qué servicios se integran en Wazuh');
  }

  const modules = Array.from(integrated.porModulo.keys());

  if (!modules.length) {
    return notApplicable('P-06 no declara ningún servicio integrado en Wazuh: no hay registros del proveedor que juzgar (hallazgo del informe, sin veredicto).');
  }

  return combineMeasurements(
    modules.map(module => judges(module, integrated.porModulo.get(module) || [], ingestion.porModulo.get(module)))
  );
};

const alive = (moduleIngestion: Measurement | undefined): boolean => moduleIngestion?.estado === 'CUMPLE';

// Without proven ingestion, absence of records proves nothing. If what is missing is the collector
// itself, the gap is COLLECTION.
const notAlive = (who: string, moduleIngestion: Measurement | undefined, extra = ''): Measurement =>
  notMeasured(
    `${who}: su ingesta no está demostrada (ver EV-01), así que la ausencia de registros no prueba nada.${extra}`,
    moduleIngestion?.estado === 'NO_EVALUABLE' && moduleIngestion.causa === 'COLLECTION' ? 'COLLECTION' : 'EVIDENCE'
  );

const ev04 = (context: ENSPolicyContext, now: number, services: Record<string, string>[], ingestion: Ingestion): Measurement => {
  const operations = valid(context, 'cloud_admin_operation_observed', now);
  const p11 = tableParameterRows(context, 'P-11');

  const measurement = byIntegratedModule(context, services, ingestion, (module, their, moduleIngestion) => {
    const who = moduleName(module, their);
    const ofModule = operations.filter(e => equalsIgnoreCase(factField(e, 'modulo'), module));
    // Actions of the provider's own services (AWSService, an Azure managed identity) are not
    // contrasted with P-11.
    const human = ofModule.filter(e => factField(e, 'tipo_actor') !== 'servicio');

    if (!human.length) {
      return alive(moduleIngestion)
        ? withoutOperations(who, module, ingestion.hechos.get(module) || [], ofModule.length)
        : notAlive(who, moduleIngestion);
    }

    // By actor, whole window.
    const actors = new Map<string, { veces: number; operaciones: Set<string>; ultima: number; cuentas: Set<string> }>();

    human.forEach(e => {
      const actor = factField(e, 'actor');
      const a = actors.get(actor.toLowerCase()) || { veces: 0, operaciones: new Set<string>(), ultima: 0, cuentas: new Set<string>() };

      a.veces += parseNumber(factField(e, 'veces')) || 1;
      factField(e, 'operaciones').split(',').map(x => x.trim()).filter(x => !isEmptyField(x)).forEach(o => a.operaciones.add(o));
      a.ultima = Math.max(a.ultima, parseInstant(factField(e, 'ultima')) || eventTime(e));
      if (!isEmptyField(factField(e, 'cuenta'))) {
        a.cuentas.add(factField(e, 'cuenta'));
      }
      actors.set(actor.toLowerCase(), a);
    });

    const describe = (actor: string) => {
      const a = actors.get(actor)!;
      const original = human.find(e => factField(e, 'actor').toLowerCase() === actor);

      return `${original ? factField(original, 'actor') : actor} (${a.veces} operaciones: ${formatList(Array.from(a.operaciones), 4)}; la última el ${iso(a.ultima)})`;
    };

    if (!p11) {
      return missingParameter(context, 'P-11', `si los ${actors.size} actores con operaciones de administración en ${who} están autorizados (${formatList(Array.from(actors.keys()).map(describe))})`);
    }

    const authorized = p11
      .filter(f => their.some(s => equalsIgnoreCase(f.servicio || '', s)))
      .map(f => (f.identidad || '').trim().toLowerCase())
      .filter(Boolean);
    const outside = Array.from(actors.keys()).filter(a => !authorized.includes(a));

    return outside.length
      ? nonCompliant(`${who}: operaciones de administración de actores que P-11 no autoriza para el servicio: ${formatList(outside.map(describe))}.`)
      : compliant(`${who}: las operaciones de administración de la ventana son de actores autorizados en P-11: ${formatList(Array.from(actors.keys()).map(describe))}.`);
  });

  // What the collector could not emit (too many actors in one run) is added to what was measured,
  // without hiding it.
  const deg = degradation(context, 'EV-04', now);

  return deg && measurement.estado !== 'NO_APLICA' ? combineMeasurements([measurement, deg]) : measurement;
};


const ev07 = (context: ENSPolicyContext, now: number, services: Record<string, string>[], ingestion: Ingestion): Measurement => {
  const accesses = valid(context, 'cloud_authentication_observed', now);

  const measurement = byIntegratedModule(context, services, ingestion, (module, their, moduleIngestion) => {
    const who = moduleName(module, their);
    const ofModule = accesses.filter(e => equalsIgnoreCase(factField(e, 'modulo'), module));
    const successes = ofModule.filter(e => factField(e, 'resultado') === 'exito');
    const failures = ofModule.filter(e => factField(e, 'resultado') === 'fallo');
    const times = (is: ENSNormalizedEvent[]) => is.reduce((t, e) => t + (parseNumber(factField(e, 'veces')) || 1), 0);
    const attempts = failures.length
      ? ` Intentos fallidos en la ventana: ${times(failures)} de ${new Set(failures.map(e => factField(e, 'usuario').toLowerCase())).size} usuario(s).`
      : '';
    const describe = (e: ENSNormalizedEvent) =>
      `${factField(e, 'usuario')}${isEmptyField(factField(e, 'cuenta')) ? '' : ` en ${factField(e, 'cuenta')}`} (${factField(e, 'veces') || '1'} veces, la última el ${factField(e, 'ultima')}${isEmptyField(factField(e, 'origenes')) ? '' : `, desde ${factField(e, 'origenes')}`})`;

    const withoutFactor = successes.filter(e => factField(e, 'segundo_factor') === 'no');
    const withoutData = successes.filter(e => factField(e, 'segundo_factor') !== 'no' && factField(e, 'segundo_factor') !== 'si');

    if (withoutFactor.length) {
      return nonCompliant(
        `${who}: accesos interactivos con éxito SIN segundo factor, y un servicio en la nube es acceso desde una zona no controlada (op.acc.6): ${formatList(withoutFactor.map(describe))}.${attempts}`
      );
    }

    if (withoutData.length) {
      return notMeasured(
        `${who}: el registro del proveedor no dice si estos accesos usaron segundo factor (accesos federados o sin el dato): ${formatList(withoutData.map(describe))}. No se puede afirmar que todos lo usaran.${attempts}`
      );
    }

    if (successes.length) {
      return compliant(`${who}: los ${times(successes)} accesos interactivos con éxito de la ventana usaron segundo factor (${new Set(successes.map(e => factField(e, 'usuario').toLowerCase())).size} usuario(s)).${attempts}`);
    }

    return alive(moduleIngestion)
      ? notMeasured(
          `${who}: no consta ningún acceso interactivo con éxito en la ventana, así que no hay nada que demuestre el segundo factor (la integración puede no traer los inicios de sesión).${attempts}`
        )
      : notAlive(who, moduleIngestion, attempts);
  });

  const deg = degradation(context, 'EV-07', now);

  return deg && measurement.estado !== 'NO_APLICA' ? combineMeasurements([measurement, deg]) : measurement;
};

// EV-07 does not decide op.nub.1.2: the second-factor criterion is op.acc.6.r8.1's (access from an
// uncontrolled zone) and its nuances are not visible here (Azure trusted locations would give false
// reds). What is measured is REPORTED, crossed with op.acc.6, without verdict.
const reportedAccesses = (measurement: Measurement): Measurement =>
  notApplicable(
    `Hallazgo del informe, sin veredicto: el criterio del segundo factor en el acceso desde una zona no controlada es el de op.acc.6.r8.1, que lo juzga. Lo observado: ${measurement.estado === 'NO_CUMPLE' ? 'HAY ACCESOS SIN SEGUNDO FACTOR. ' : ''}${measurement.motivo}`
  );


const ev02 = (context: ENSPolicyContext, now: number): Measurement => {
  const p07 = tableParameterRows(context, 'P-07');

  if (!p07) {
    return missingParameter(context, 'P-07', 'qué guía CCN-STIC y qué estándar de postura aplican a cada servicio');
  }

  const p06 = tableParameterRows(context, 'P-06');

  if (!p06) {
    return missingParameter(context, 'P-06', 'qué módulo de Wazuh trae los hallazgos de postura de cada servicio de P-07');
  }

  const { vigentes: current, ultimo: last } = currentStatus(context, 'cloud_posture_finding_observed', now);

  if (!current.length || last === undefined) {
    return withoutFacts(context, 'EV-02', now, last, 'resumen de hallazgos de postura del manager');
  }

  const findings = current.filter(e => !isEmptyField(factField(e, 'fuente')) && factField(e, 'fuente') !== 'ninguna');

  const measurements = p07.map((row): Measurement => {
    const name = row.servicio;
    const integration = ofService(p06, name)
      .map(f => (f.modulo || '').trim().toLowerCase())
      .find(m => MODULES.includes(m));

    if (!integration) {
      return notMeasured(
        `«${name}»: no tiene integración en Wazuh (P-06), y sin los hallazgos de postura del propio proveedor R2 no es automatizable (Wazuh 4.14 no tiene SCA para inquilinos cloud).`
      );
    }

    const standard = (row.estandar || '').trim();
    const their = findings.filter(
      e => equalsIgnoreCase(factField(e, 'modulo'), integration) && (!standard || stripAccents(factField(e, 'estandar')).includes(stripAccents(standard)))
    );

    if (!their.length) {
      return notMeasured(
        `«${name}» (${integration}): Wazuh no recibe hallazgos de postura del proveedor${standard ? ` del estándar «${standard}»` : ''} (Security Hub, Defender, Security Command Center): R2 no es automatizable para este servicio.`
      );
    }

    const evaluated = their.reduce((t, e) => t + (parseNumber(factField(e, 'controles_evaluados')) || 0), 0);
    const failed = their.reduce((t, e) => t + (parseNumber(factField(e, 'controles_fallidos')) || 0), 0);
    const critical = their.reduce((t, e) => t + (parseNumber(factField(e, 'fallidos_criticos')) || 0), 0);
    const standards = Array.from(new Set(their.map(e => `${factField(e, 'fuente')}: ${factField(e, 'estandar')}`))).join('; ');

    if (failed > 0) {
      const failedList = their.flatMap(e => factField(e, 'fallidos').split(',').map(x => x.trim()).filter(x => !isEmptyField(x)));
      // Without the total evaluated (a «-» count) «N of 0» is not written.
      const withoutTotal = their.some(e => parseNumber(factField(e, 'controles_evaluados')) === undefined) || evaluated < failed;
      const count = withoutTotal ? `${failed} controles fallidos (sin total de evaluados)` : `${failed} de ${evaluated} controles fallidos`;

      return nonCompliant(
        `«${name}» (${standards}): ${count}${critical ? `, ${critical} críticos o altos` : ''}: ${formatList(failedList, 8)}. La configuración no sigue ${row.guia_ccn_stic || 'la guía CCN-STIC aplicable'}.`
      );
    }

    // An unreadable count («-») is not zero: without it it cannot be asserted that the controls
    // pass. A failure measured in another standard still wins.
    const unreadable = their.filter(e => parseNumber(factField(e, 'controles_evaluados')) === undefined || parseNumber(factField(e, 'controles_fallidos')) === undefined);

    if (unreadable.length) {
      return notMeasured(
        `«${name}»: el recolector no pudo contar los controles de ${formatList(unreadable.map(e => `${factField(e, 'fuente')}: ${factField(e, 'estandar')}`))} (recuento «-»): no se puede afirmar que pasen.`
      );
    }

    return evaluated > 0
      ? compliant(`«${name}» (${standards}): los ${evaluated} controles evaluados pasan (${row.guia_ccn_stic || 'guía CCN-STIC sin declarar'}).`)
      : notMeasured(`«${name}» (${standards}): el proveedor no ha evaluado ningún control.`);
  });

  return withDegradation(context, now, 'EV-02', 'cloud_posture_finding_observed', combineMeasurements(measurements));
};


const DATA_EV03 =
  'Dato del informe, sin veredicto: detectar servicios en la nube en uso que no figuran en P-02 (shadow IT) exige el DNS o el proxy de los equipos, y con los ficheros locales del manager no se ven. EV-01 dice, eso sí, qué módulos cloud ingiere Wazuh que P-06 no declara.';

const declaredData = (context: ENSPolicyContext, id: string, subject: string, columns: string[]): string => {
  const table = tableParameterRows(context, id);

  return table
    ? ` Declarado en ${id}: ${formatList(table.map(f => `${f.servicio}: ${columns.map(c => f[c]).filter(x => !isEmptyField(x || '')).join(', ') || '-'}`))}.`
    : ` ${id} sin declarar: ${subject} no consta.`;
};

const DATA_EV05 =
  'Dato del informe, sin veredicto: Wazuh 4.14 no tiene SCA para inquilinos cloud y el recolector no usa credenciales del proveedor, así que el cifrado configurado no se puede medir. Lo declarado en P-09 se juzga en el expediente (EV-09, op.nub.1.2 c).';

const DATA_EV07 =
  'Hallazgo del informe, sin veredicto: el criterio del segundo factor en el acceso desde una zona no controlada es el de op.acc.6.r8.1, que lo juzga.';

const DATA_EV06 =
  'Dato del informe, sin veredicto: Wazuh 4.14 no tiene SCA para inquilinos cloud ni el recolector usa credenciales del proveedor, así que la región configurada no se puede medir. Lo declarado en P-08 se juzga en el expediente (EV-09, op.nub.1.2 d).';


const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();
  const applies = (requirement: string): boolean =>
    Boolean(
      context.control.requirements
        .find(r => r.id === requirement)
        ?.applicability.levels.includes(context.level)
    );
  const parametersOf = (requirement: string): string[] =>
    context.control.requirements.find(r => r.id === requirement)?.parameterIds || [];
  const typeOf = (requirement: string): ENSDecisionRuleType =>
    opNub1PolicyDefinition.requirements.find(r => r.requirementId === requirement)?.ruleType || 'CONDITIONAL_REQUIRED';

  const requirementDecisions: ENSPolicyDecision[] = [];
  const evidenceDecisions: ENSPolicyDecision[] = [];
  const measurements: Record<string, Measurement> = {};

  // `documental`: the decision comes from screen tables, not facts, and survives a stopped
  // collector (see `ENSPolicyDecision`).
  const mark = (decision: ENSPolicyDecision, documental: boolean): ENSPolicyDecision =>
    documental ? { ...decision, documental: true } : decision;

  const decideRequirement = (
    requirement: string,
    measurement: Measurement,
    evidences: string[],
    expected: string,
    accredited = false,
    documental = DOCUMENTARY_REQUIREMENTS.includes(requirement),
    // When the reason is the evidences' composite, its parts.
    pieces?: ENSReasonPart[]
  ) => {
    const decision = decide(requirement, measurement.estado, evidences, parametersOf(requirement), typeOf(requirement), requirement, measurement.motivo, expected, measurement.causa, accredited);
    requirementDecisions.push(mark(pieces ? withReasonParts(decision, pieces) : decision, documental));
  };

  const decideEvidence = (
    requirement: string,
    evidence: string,
    measurement: Measurement,
    expected = `${evidence} CUMPLE`,
    documental = DOCUMENTARY_EVIDENCES.includes(evidence)
  ) => {
    measurements[evidence] = measurement;
    evidenceDecisions.push(
      mark(
        decide(requirement, measurement.estado, [evidence], parametersOf(requirement), typeOf(requirement), `${requirement}/${evidence}`, measurement.motivo, expected, measurement.causa),
        documental
      )
    );
  };

  const { posicion: position, medida: withoutPosition } = positionOf(context);

  // Without P-01 (or with a value not among its options) what is required is unknown: everything
  // applying at the level stays unmeasured by CONFIGURATION.
  if (!position) {
    const without = withoutPosition!;

    context.control.requirements
      .filter(r => applies(r.id))
      .forEach(r => {
        // Without P-01 the gap is CONFIGURATION, also with the collector stopped: marked
        // documentary so it does not become COLLECTION.
        decideRequirement(r.id, without, r.evidenceIds, 'P-01 configurado', false, true);
        r.evidenceIds.forEach(ev => decideEvidence(r.id, ev, without, `${ev} CUMPLE`, true));
      });

    ['EV-03', 'EV-05', 'EV-06', 'EV-07'].forEach(ev =>
      decideEvidence('op.nub.1.2', ev, notApplicable(ev === 'EV-03' ? DATA_EV03 : ev === 'EV-05' ? DATA_EV05 : ev === 'EV-06' ? DATA_EV06 : DATA_EV07), 'dato del informe')
    );

    return {
      decisions: [...requirementDecisions, ...evidenceDecisions],
      runtimeVariables: [
        { name: 'posicion_P01', value: 'sin configurar', parameterIds: ['P-01'], evidenceIds: [], eventIds: [], description: without.motivo },
        // The report's validity field: without P-01 nothing was judged.
        { name: 'vigencia_conformidades', value: 'NO_EVALUABLE', parameterIds: ['P-01', 'P-03'], evidenceIds: ['EV-09'], eventIds: [], description: without.motivo },
      ],
    };
  }

  // P-01 = ninguno: all NO_APLICA, declared; unless the screen itself contradicts it (P-02 with
  // used or provided services) or what the manager sees (a cloud module ingesting records): then
  // the declaration does not hold and nothing leaves the denominator.
  if (position === 'ninguno') {
    // A row without `uso` also contradicts: it is a cloud service in the inventory and with
    // «ninguno» there should be none.
    const inP02 = (tableParameterRows(context, 'P-02') || []).filter(f => {
      const usage = stripAccents(f.uso || '').trim();

      return !usage || ['utilizado', 'prestado'].includes(usage);
    });
    const ingesting = ingestionLector
      .estadoVigente(context, 'cloud_integration_observed', now)
      .vigentes.filter(e => !isEmptyField(factField(e, 'modulo')) && factField(e, 'modulo') !== 'ninguno' && (parseNumber(factField(e, 'alertas_24h')) || 0) > 0);
    const contradictions = [
      ...(inP02.length ? [`P-02 declara ${inP02.length} servicio(s) en uso: ${formatList(inP02.map(f => `${f.servicio} (${f.uso || 'sin uso declarado'})`))}`] : []),
      ...(ingesting.length ? [`Wazuh está ingiriendo registros de ${formatList(ingesting.map(e => `${factField(e, 'modulo')} (${factField(e, 'alertas_24h')} en 24 h)`))}`] : []),
    ];
    const measurement = contradictions.length
      ? notMeasured(`P-01 declara «ninguno» (ni presta ni utiliza servicios en la nube), y lo contradice: ${contradictions.join('; ')}. Corrige P-01 o la contradicción.`, 'CONFIGURATION')
      : notApplicable(NONE);
    // A contradiction seen in the facts is not only the screen's.
    const documental = !ingesting.length;

    context.control.requirements
      .filter(r => applies(r.id))
      .forEach(r => {
        decideRequirement(r.id, measurement, r.evidenceIds, 'servicios en la nube en el alcance', false, documental);
        r.evidenceIds.forEach(ev => decideEvidence(r.id, ev, measurement, `${ev} CUMPLE`, documental));
      });

    ['EV-03', 'EV-05', 'EV-06', 'EV-07'].forEach(ev => decideEvidence('op.nub.1.2', ev, notApplicable(NONE), 'dato del informe'));

    return {
      decisions: [...requirementDecisions, ...evidenceDecisions],
      runtimeVariables: [
        { name: 'posicion_P01', value: 'ninguno', parameterIds: ['P-01'], evidenceIds: [], eventIds: [], description: measurement.motivo },
        // And the validity field: not applicable, or unevaluated if the declaration is
        // contradicted.
        { name: 'vigencia_conformidades', value: measurement.estado, parameterIds: ['P-01', 'P-03'], evidenceIds: ['EV-09'], eventIds: [], description: measurement.motivo },
      ],
    };
  }

  const inv = inventory(context, position);
  const withoutInventory = missingParameter(context, 'P-02', 'qué servicios en la nube están en el alcance');
  // The technical part of op.nub.1.2 belongs to USED services.
  const used = inv?.utilizados || [];
  const validities: string[] = [];
  // The judged P-03 conformities (used and provided): the report paints them with the
  // certifications so an expired one does not show green in the validity field.
  const conformities: Measurement[] = [];

  if (applies('op.nub.1.1')) {
    if (!provides(position)) {
      decideRequirement('op.nub.1.1', notApplicable(`P-01 = ${position}: el sistema no presta servicios en la nube al sector público.`), [], 'prestador');
    } else {
      let measurement: Measurement;

      if (!inv) {
        measurement = withoutInventory;
      } else if (!inv.prestados.length) {
        measurement = combineMeasurements([
          ...inv.errores,
          notMeasured(`${parameterDisplayName(context, 'P-02')} no declara ningún servicio prestado (columna «uso»), y P-01 = ${position}.`, 'CONFIGURATION'),
        ]);
      } else {
        const e = provider(context, now, inv.prestados, conformities);

        validities.push(...e.vigencias);
        measurement = e.medida;
      }

      // Without provided services to judge, the conformities are unevaluated: the report's validity
      // field cannot be NO_APLICA.
      if (!inv || !inv.prestados.length) {
        conformities.push({ ...measurement, motivo: `servicios prestados: ${measurement.motivo}` });
      }

      decideRequirement('op.nub.1.1', measurement, [], 'conformidad en vigor de cada servicio prestado (P-03)', measurement.estado === 'CUMPLE');
    }
  }

  let ingestion: Ingestion | undefined;
  let accesses: Measurement | undefined;

  if (applies('op.nub.1.2')) {
    if (!uses(position)) {
      const outside = notApplicable(`P-01 = ${position}: el sistema no utiliza servicios en la nube de terceros.`);

      decideRequirement('op.nub.1.2', outside, ['EV-01', 'EV-04', 'EV-09'], 'usuario');
      ['EV-01', 'EV-04', 'EV-07', 'EV-09'].forEach(ev => decideEvidence('op.nub.1.2', ev, outside));
    } else {
      const file: Measurement = !inv
        ? withoutInventory
        : !used.length
        ? combineMeasurements([...inv.errores, notMeasured(`${parameterDisplayName(context, 'P-02')} no declara ningún servicio utilizado de un tercero, y P-01 = ${position}.`, 'CONFIGURATION')])
        : (() => {
            const e = ev09(context, now, used, conformities);

            validities.push(...e.vigencias);

            return inv.errores.length ? combineMeasurements([e.medida, ...inv.errores]) : e.medida;
          })();

      // The same with used services.
      if (!inv || !used.length) {
        conformities.push({ ...file, motivo: `servicios utilizados: ${file.motivo}` });
      }

      ingestion = ev01(context, now, used);
      const technical: { id: string; medida: Measurement }[] = [
        { id: 'EV-01', medida: ingestion.medida },
        { id: 'EV-04', medida: ev04(context, now, used, ingestion) },
      ];
      const own = [{ id: 'EV-09', medida: file }, ...technical];

      // EV-07: report finding, without verdict (see `reportedAccesses`).
      accesses = ev07(context, now, used, ingestion);
      decideEvidence('op.nub.1.2', 'EV-07', reportedAccesses(accesses), 'hallazgo del informe');
      const failingOwn = own.filter(p => p.medida.estado === 'NO_CUMPLE');
      const summary = compositeReason(own);

      // The measurement wins: a NO_CUMPLE (technical or from the file) decides. Otherwise the
      // complete, valid file accredits the requirement even if the technical part could not be
      // measured (integrating is not required). Documentary when ONLY the file decides: a NO_CUMPLE
      // only from EV-09, the accredited CUMPLE (the technical part can only overturn it) and the
      // unmeasured one, always the file's. With a technical measurement against it is not: that
      // decision comes from facts.
      if (failingOwn.length) {
        decideRequirement(
          'op.nub.1.2',
          nonCompliant(summary),
          failingOwn.map(p => p.id),
          'EV-09 CUMPLE y ninguna medida técnica en contra',
          false,
          failingOwn.every(p => p.id === 'EV-09'),
          reasonPartsOf(own)
        );
      } else if (file.estado === 'CUMPLE') {
        decideRequirement(
          'op.nub.1.2',
          compliant(`${ACCREDITED}: el expediente de los servicios utilizados está completo y vigente, y ninguna medida técnica está en contra. ${summary}`),
          ['EV-09'],
          'EV-09 CUMPLE y ninguna medida técnica en contra',
          true,
          true
        );
      } else {
        const withoutMeasureYet = own.filter(p => p.medida.estado === 'NO_EVALUABLE');

        decideRequirement(
          'op.nub.1.2',
          { estado: 'NO_EVALUABLE', motivo: summary, causa: commonGapCause([file]) },
          withoutMeasureYet.length ? withoutMeasureYet.map(p => p.id) : ['EV-09'],
          'EV-09 CUMPLE y ninguna medida técnica en contra',
          false,
          true,
          reasonPartsOf(own)
        );
      }

      own.forEach(p => decideEvidence('op.nub.1.2', p.id, p.medida));
    }

    // Report data, without verdict.
    decideEvidence('op.nub.1.2', 'EV-03', notApplicable(DATA_EV03), 'dato del informe');
    decideEvidence('op.nub.1.2', 'EV-05', notApplicable(`${DATA_EV05}${declaredData(context, 'P-09', 'el cifrado', ['cifrado', 'gestion_claves'])}`), 'dato del informe');
    decideEvidence('op.nub.1.2', 'EV-06', notApplicable(`${DATA_EV06}${declaredData(context, 'P-08', 'la región', ['region_datos', 'region_copias', 'jurisdiccion'])}`), 'dato del informe');
  }

  if (applies('op.nub.1.r1.1')) {
    if (!uses(position)) {
      const outside = notApplicable(`P-01 = ${position}: R1 es para los servicios en la nube de terceros que se utilizan.`);

      decideRequirement('op.nub.1.r1.1', outside, ['EV-08'], 'usuario');
      decideEvidence('op.nub.1.r1.1', 'EV-08', outside);
    } else {
      let measurement: Measurement;

      if (!inv) {
        measurement = withoutInventory;
      } else if (!used.length) {
        measurement = notMeasured(`${parameterDisplayName(context, 'P-02')} no declara ningún servicio utilizado de un tercero.`, 'CONFIGURATION');
      } else {
        const e = ev08(context, now, used);

        validities.push(...e.vigencias);
        measurement = e.medida;
      }

      decideRequirement('op.nub.1.r1.1', measurement, ['EV-08'], 'EV-08 CUMPLE', measurement.estado === 'CUMPLE');
      decideEvidence('op.nub.1.r1.1', 'EV-08', measurement);
    }
  }

  if (applies('op.nub.1.r1.2')) {
    const p05 = tableParameterRows(context, 'P-05');

    if (!uses(position)) {
      decideRequirement('op.nub.1.r1.2', notApplicable(`P-01 = ${position}: R1.2 es para los servicios en la nube de terceros que se utilizan.`), [], 'usuario');
    } else if (!p05) {
      // Empty is not «ninguno»: what is undeclared cannot leave the denominator; «ninguno» is a
      // declaration and is written.
      decideRequirement(
        'op.nub.1.r1.2',
        notMeasured(
          `${parameterDisplayName(context, 'P-05')} está sin configurar: no consta si alguno de los servicios en la nube es de seguridad (un SIEM gestionado, un WAF, copias gestionadas). Si no se usa ninguno, declara una sola fila «ninguno».`,
          'CONFIGURATION'
        ),
        [],
        'servicios de seguridad en P-05, o «ninguno»'
      );
    } else if (p05.some(f => stripAccents(f.servicio || '') === 'ninguno')) {
      decideRequirement(
        'op.nub.1.r1.2',
        p05.length === 1
          ? notApplicable(`${parameterDisplayName(context, 'P-05')} declara que no se utiliza ningún servicio en la nube de seguridad («ninguno»): R1.2 no aplica.`)
          : notMeasured(
              `${parameterDisplayName(context, 'P-05')} mezcla «ninguno» con ${p05.length - 1} servicio(s) (${formatList(p05.filter(f => stripAccents(f.servicio || '') !== 'ninguno').map(f => f.servicio))}): o una sola fila «ninguno», o los servicios de seguridad.`,
              'CONFIGURATION'
            ),
        [],
        'servicios de seguridad en P-05, o «ninguno»'
      );
    } else {
      const measurement = security(context, now, p05);

      decideRequirement('op.nub.1.r1.2', measurement, [], 'verificación de op.pl.5 en vigor de cada servicio de seguridad (P-05)', measurement.estado === 'CUMPLE');
    }
  }

  if (applies('op.nub.1.r2.1')) {
    const measurement = ev02(context, now);

    decideRequirement('op.nub.1.r2.1', measurement, ['EV-02'], 'EV-02 CUMPLE');
    decideEvidence('op.nub.1.r2.1', 'EV-02', measurement);
  }

  // What the report separates: the documentary block and the technical one.
  const statusOf = (ids: string[]) => {
    const their = ids.filter(id => measurements[id]).map(id => measurements[id]);

    return their.length ? worstStatus(their) : 'NO_APLICA';
  };
  const describeBlock = (ids: string[]) =>
    ids
      .filter(id => measurements[id])
      .map(id => `${id} ${measurements[id].estado}`)
      .join(', ') || 'no aplica';
  const withoutIntegrate = (() => {
    const integrated = inv ? integrations(context, used) : undefined;

    return integrated ? integrated.sinIntegrar : [];
  })();

  const variables: ENSRuntimeVariable[] = [
    { name: 'posicion_P01', value: position, parameterIds: ['P-01'], evidenceIds: [], eventIds: [], description: `P-01 = ${position}` },
    {
      name: 'bloque_documental',
      value: statusOf(['EV-08', 'EV-09']),
      parameterIds: ['P-03', 'P-04', 'P-08', 'P-09', 'P-10'],
      evidenceIds: ['EV-08', 'EV-09'],
      eventIds: [],
      description: `Documentación aportada, no verificada técnicamente: ${describeBlock(['EV-09', 'EV-08'])}.`,
    },
    {
      name: 'bloque_tecnico',
      value: statusOf(['EV-01', 'EV-04', 'EV-02']),
      parameterIds: ['P-06', 'P-07', 'P-11', 'P-13'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-07'],
      eventIds: [],
      description: `Medido en el manager de Wazuh: ${describeBlock(['EV-01', 'EV-04', 'EV-02'])}.`,
    },
    {
      name: 'servicios_sin_integracion',
      value: withoutIntegrate,
      parameterIds: ['P-02', 'P-06'],
      evidenceIds: ['EV-01'],
      eventIds: [],
      description: withoutIntegrate.length
        ? `Servicios sin integración en Wazuh (hallazgo del informe, sin veredicto): ${withoutIntegrate.join(', ')}.`
        : 'Todos los servicios declarados tienen integración en Wazuh, o P-06 no está declarado.',
    },
    {
      name: 'vigencia_conformidades',
      value: conformities.length ? worstStatus(conformities) : 'NO_APLICA',
      parameterIds: ['P-03'],
      evidenceIds: ['EV-09'],
      eventIds: [],
      description: conformities.length
        ? `Conformidades de P-03: ${conformities.map(m => `${m.estado} ${m.motivo}`).join('; ')}`
        : 'No se ha juzgado ninguna conformidad de P-03.',
    },
    {
      name: 'accesos_cloud',
      value: accesses ? accesses.estado : 'NO_APLICA',
      parameterIds: ['P-06'],
      evidenceIds: ['EV-07'],
      eventIds: [],
      description: accesses
        ? `${accesses.estado === 'NO_CUMPLE' ? 'Hay accesos interactivos con éxito sin segundo factor (hallazgo, lo juzga op.acc.6.r8.1). ' : ''}${accesses.motivo}`
        : 'No se juzgan accesos: op.nub.1.2 no aplica o no hay servicios utilizados.',
    },
    {
      name: 'vigencias',
      value: validities,
      parameterIds: ['P-03', 'P-04'],
      evidenceIds: ['EV-08', 'EV-09'],
      eventIds: [],
      description: validities.length ? validities.join('; ') : 'Sin vigencias declaradas.',
    },
    ...Object.entries(measurements).map(([id, measurement]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: measurement.estado,
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: measurement.motivo,
    })),
  ];

  return { decisions: [...requirementDecisions, ...evidenceDecisions], runtimeVariables: variables };
};

export const opNub1PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // By system category: base in all three, R1 from MEDIA, R2 only in ALTA. Which requirements are
  // required within the level is decided by P-01.
  requirements: [
    {
      requirementId: 'op.nub.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.nub.1.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-06', 'P-08', 'P-09', 'P-10', 'P-11', 'P-12', 'P-13'],
      evidenceIds: ['EV-01', 'EV-04', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.nub.1.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04'],
      evidenceIds: ['EV-08'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.nub.1.r1.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.nub.1.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-06', 'P-07'],
      evidenceIds: ['EV-02'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
