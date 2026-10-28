// Builds the art. 32 data set from the organisation results, the maturity, the declared entries and the registers.
import { ENSCatalog } from '../catalog';
import { resolveControlConfigurationForAgent } from '../configuration/agents/configuration-resolver';
import { toParameterTableRows, toTableRowCells } from '../configuration/services/parameter-value-validator';
import type { ENSConfigurationVersion, ENSLevel } from '../configuration/types';
import {
  compareENSLevels,
  describeDimensionsAboveENSLevel,
  ENS_DIMENSION_LEVEL_KEYS,
  ENS_DIMENSION_NAMES,
  ENS_DIMENSIONS,
  resolveControlLevel,
  resolveDimensionLevel,
} from '../core/control-level';
import type { ENSComplianceResult } from '../core/evaluation/types';
import { stripAccents } from '../core/policy-runtime/policies/policy-kit';
import { dayIn } from '../maturity/maturity-engine';
import { ENS_CATEGORY_NAMES, readControlMaturityRecord, resolveMaturityTargets } from '../maturity/maturity-records';
import type { ENSControlMaturity, ENSMaturityLevel, ENSMaturityRecords, ENSMeasureDeclaration } from '../maturity/types';
import { annexFramework, describeAnnexAxis, ENS_ANNEX_II_MEASURES, ENS_NOT_APPLICABLE_REQUIREMENT, resolveAnnexMeasureLevel } from './annex-ii-measures';
import type { ENSAnnexMeasure } from './annex-ii-measures';
import { annualPeriodBounds, annualPeriodInstants, annualPeriodOfDay, ENS_DEFAULT_ANNUAL_CLOSING, isAnnualClosing } from './annual-period';
import { ENS_ANNUAL_REPORT_SCHEMA } from './annual-report-types';
import type { ENSAnnualDatum, ENSAnnualFreezeEntry, ENSAnnualMeasure, ENSAnnualReport, ENSAnnualSource, ENSAnnualValue } from './annual-report-types';
import { ART32_MAX_INCIDENTS, ART32_REGISTER_WINDOW_DAYS } from '../core/policy-runtime/policies/op-mon-2.policy';
import { ENS_ANNUAL_REPORT_CONTROL, measureEngine } from './declared-measures';
import { applicableMeasures, describeRepeatedMeasures, implementationDegree } from './implementation-degree';
import { statusLabel } from '../core/status-label';

const INCIDENTS_CONTROL = 'op.exp.7';
const HOUR_MS = 3600e3;
const CONSOLIDATED = 'Valores consolidados por agente.';
const SEVERITIES = ['baja', 'media', 'alta', 'critica'];

export interface ENSAnnualReportInput {
  configuration: ENSConfigurationVersion;
  // Organisation view: one consolidated result per catalog control.
  results: ENSComplianceResult[];
  // Raw rows of op.mon.2 and op.exp.7 (the manager's), whose report variables are not consolidated.
  managerRows?: Partial<Record<string, ENSComplianceResult>>;
  maturity: Map<string, ENSControlMaturity>;
  records?: ENSMaturityRecords;
  now: Date;
  timeZone: string;
  // YYYY; by default the period of today.
  period?: string;
  pluginVersion: string;
  freeze?: ENSAnnualFreezeEntry;
  // The incidents of the period read on the server (`incident-source.ts`), used instead of op.mon.2's live variable.
  periodIncidents?: Record<string, unknown>;
}

const round = (n: number): number => Math.round(n * 10) / 10;
const fold = (text: string): string => stripAccents(String(text || '')).toLowerCase().trim();
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z');
const mean = (values: number[]): number | undefined => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined);
const last = <T>(list: T[]): T | undefined => list[list.length - 1];

const datum = (
  id: string,
  value: ENSAnnualValue | undefined,
  source: ENSAnnualSource,
  trace: string,
  extra: { key?: string; unit?: string } = {}
): ENSAnnualDatum => ({
  id,
  ...(extra.key !== undefined ? { key: extra.key } : {}),
  value: value === undefined || (typeof value === 'number' && !Number.isFinite(value)) ? null : value,
  ...(extra.unit ? { unit: extra.unit } : {}),
  source,
  trace,
});

// A report variable of a row; from a consolidated result («agente=valor»), the first machine's value.
export const readRuntimeVariable = (result: ENSComplianceResult | undefined, name: string): unknown => {
  const variable = result?.policyRuntime?.runtimeVariables?.find(entry => entry.name === name);
  if (!variable) return undefined;
  if (Array.isArray(variable.value) && String(variable.description || '').endsWith(CONSOLIDATED)) {
    const first = String(variable.value[0] ?? '');
    const at = first.indexOf('=');
    try {
      return at >= 0 ? JSON.parse(first.slice(at + 1)) : undefined;
    } catch {
      return undefined;
    }
  }
  return variable.value;
};

const readJsonVariable = (result: ENSComplianceResult | undefined, name: string): any => {
  const value = readRuntimeVariable(result, name);
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

// Rows of a table parameter as the engine applied it.
const parameterRows = (result: ENSComplianceResult | undefined, id: string, columns: string[]): Record<string, string>[] =>
  rowsOf(result?.parameters, id, columns);

const rowsOf = (parameters: { id: string; value?: unknown }[] | undefined, id: string, columns: string[]): Record<string, string>[] => {
  const value = (parameters || []).find(parameter => parameter.id === id)?.value;
  if (value === undefined || value === null) return [];
  return toParameterTableRows(value as Parameters<typeof toParameterTableRows>[0])
    .map(row => toTableRowCells(row))
    .filter(cells => cells.some(Boolean))
    .map(cells => Object.fromEntries(columns.map((column, i) => [column, (cells[i] || '').trim()])));
};

const closingOfRows = (rows: Record<string, string>[]): { closing: string; declared: boolean } => {
  const declared = rows[0]?.cierre_anual;
  return isAnnualClosing(declared) ? { closing: declared, declared: true } : { closing: ENS_DEFAULT_ANNUAL_CLOSING, declared: false };
};

const P02_COLUMNS = ['periodicidad', 'margen_dias', 'cierre_anual'];

// Closing day of the report: op.mon.2 P-02 `cierre_anual` as the engine applied it, else 12-31.
export const annualClosingOf = (opMon2?: ENSComplianceResult): { closing: string; declared: boolean } => closingOfRows(parameterRows(opMon2, 'P-02', P02_COLUMNS));

// The same closing read from the configuration (the manager's op.mon.2), with no evaluation.
export const annualClosingOfConfiguration = (configuration: ENSConfigurationVersion): { closing: string; declared: boolean } =>
  closingOfRows(rowsOf(resolveControlConfigurationForAgent(configuration, ENS_ANNUAL_REPORT_CONTROL, '000')?.parameters, 'P-02', P02_COLUMNS));

// Rows of the Statement of Applicability (op.mon.2 P-01) by measure; the last row of a measure wins.
const statementOfApplicability = (opMon2?: ENSComplianceResult): Map<string, { applies?: boolean; raw: string; level: string; rows: number }> => {
  const rows = new Map<string, { applies?: boolean; raw: string; level: string; rows: number }>();
  parameterRows(opMon2, 'P-01', ['medida', 'aplicable', 'nivel', 'refuerzos_exigibles']).forEach(row => {
    const id = fold(row.medida);
    const applies = fold(row.aplicable);
    rows.set(id, {
      applies: applies === 'si' ? true : applies === 'no' ? false : undefined,
      raw: [row.medida, row.aplicable, row.nivel, row.refuerzos_exigibles].filter(Boolean).join(' | '),
      level: row.nivel,
      rows: (rows.get(id)?.rows || 0) + 1,
    });
  });
  return rows;
};

const get = (data: ENSAnnualDatum[], id: string): ENSAnnualDatum | undefined => data.find(entry => entry.id === id);
const valueOf = (data: ENSAnnualDatum[], id: string): ENSAnnualValue => get(data, id)?.value ?? null;

// --- measures -------------------------------------------------------------------------------------------------

interface MeasureContext {
  global: ENSConfigurationVersion['global'];
  targets: ReturnType<typeof resolveMaturityTargets>;
  soa: ReturnType<typeof statementOfApplicability>;
  soaRead: boolean;
  results: Map<string, ENSComplianceResult>;
  maturity: Map<string, ENSControlMaturity>;
  records?: ENSMaturityRecords;
}

const describeDeclaration = (d: ENSMeasureDeclaration): string =>
  `entrada declarada del ${d.date} (registrada el ${d.recordedAt.slice(0, 10)} por ${d.recordedBy}; ${d.reference}${d.link ? `, ${d.link}` : ''})`;

const buildMeasure = (measure: ENSAnnexMeasure, ctx: MeasureContext): ENSAnnualMeasure => {
  const engine = measureEngine(measure.id);
  const control = ENSCatalog.find(entry => entry.id === measure.id);
  const level: ENSLevel = control
    ? resolveControlLevel(control, ctx.global.ensLevel, ctx.global)
    : resolveAnnexMeasureLevel(measure, ctx.global);
  const requirement = measure.requirement[level];
  const byAnnex = requirement !== ENS_NOT_APPLICABLE_REQUIREMENT;
  const axis = describeAnnexAxis(measure.axis);
  const soa = ctx.soa.get(measure.id);
  const record = readControlMaturityRecord(ctx.records, measure.id);
  const declaration = engine === 'MEDIDO' ? undefined : last(record.declarations);
  const result = ctx.results.get(measure.id);
  const maturity = ctx.maturity.get(measure.id);
  const key = { key: measure.id };
  const data: ENSAnnualDatum[] = [];
  const push = (id: string, value: ENSAnnualValue | undefined, source: ENSAnnualSource, trace: string, unit?: string) =>
    data.push(datum(`measure.${id}`, value, source, trace, { ...key, ...(unit ? { unit } : {}) }));

  push('name', measure.name, 'ANNEX_II', `Anexo II, apartado ${measure.annexSection}`);
  push(
    'engine',
    engine,
    'NONE',
    engine === 'MEDIDO'
      ? 'en el catálogo de Power ENS, medida por el motor'
      : engine === 'SIN_MEDICION'
      ? 'en el catálogo de Power ENS en borrador: sin medición todavía'
      : 'fuera del catálogo de Power ENS: sin motor'
  );
  push('axis', axis, 'ANNEX_II', `Anexo II: se aplica por ${measure.axis === 'CATEGORIA' ? 'la categoría' : `las dimensiones ${axis}`}`);
  push(
    'level',
    level,
    'CONFIGURATION',
    measure.axis === 'CATEGORIA'
      ? 'Configuración > General: nivel ENS (categoría)'
      : `Configuración > General: el mayor nivel de ${axis} (clave ausente: el nivel ENS)`
  );
  push('annex_requirement', requirement, 'ANNEX_II', `Anexo II, ${measure.id} en nivel ${level}`);

  // Applies: the Statement of Applicability, else the declared entry, else the Annex at its level.
  if (soa && soa.applies !== undefined) {
    const repeated = soa.rows > 1 ? `; P-01 la repite en ${soa.rows} filas: cuenta la última` : '';
    push('soa', soa.applies ? 'sí' : 'no', 'SOA', `op.mon.2 P-01, fila «${soa.raw}»${repeated}`);
    push(
      'applies',
      soa.applies,
      'SOA',
      `op.mon.2 P-01, fila «${soa.raw}»${repeated}${soa.applies && !byAnnex ? `; el Anexo II no la exige en nivel ${level}` : !soa.applies && byAnnex ? `; el Anexo II la exige en nivel ${level} (${requirement})` : ''}`
    );
  } else {
    push('soa', null, 'SOA', soa ? `op.mon.2 P-01, fila «${soa.raw}»: no dice sí o no` : ctx.soaRead ? 'sin fila en op.mon.2 P-01' : 'op.mon.2 P-01 sin configurar');
    if (declaration) push('applies', declaration.applies, 'DECLARED', describeDeclaration(declaration));
    else push('applies', byAnnex, 'ANNEX_II', `Anexo II: «${requirement}» en nivel ${level}, sin fila en la DA ni entrada declarada`);
  }

  // Status and implementation: only the engine measures.
  if (engine === 'MEDIDO') {
    push('status', result ? result.status : null, 'ENGINE', result ? `motor de Power ENS, evaluación del ${result.evaluatedAt}` : 'sin resultado del motor');
    push(
      'implementation_pct',
      result && typeof result.score === 'number' ? round(result.score) : null,
      'ENGINE',
      !result
        ? 'sin resultado del motor'
        : typeof result.score === 'number'
        ? `motor de Power ENS: ${result.applicableRequirements} requisitos aplicables en nivel ${result.level}, ${result.measuredRequirements} demostrados`
        : `sin puntuación: ${statusLabel(result.status)} en nivel ${result.level}`,
      '%'
    );
    push(
      'coverage_pct',
      result && typeof result.coverage === 'number' ? round(result.coverage) : null,
      'ENGINE',
      result ? 'motor de Power ENS: requisitos con evidencia sobre los aplicables' : 'sin resultado del motor',
      '%'
    );
  } else {
    const why = engine === 'SIN_MEDICION' ? 'sin medición todavía: ningún recolector la mide' : 'sin motor: Power ENS no la mide';
    push('status', engine, 'NONE', why);
    push('implementation_pct', null, 'NONE', why, '%');
    push('coverage_pct', null, 'NONE', why, '%');
  }

  // Maturity: accredited by the evidence (engine only), assessed by a person or declared, target.
  if (engine === 'MEDIDO' && maturity && maturity.measured && maturity.accredited !== undefined) {
    push('maturity_accredited', maturity.accredited, 'MATURITY_ENGINE', `puertas de madurez superadas por las evidencias (cálculo del ${maturity.evaluatedAt})`, 'L0-L5');
  } else {
    push(
      'maturity_accredited',
      null,
      'NONE',
      engine === 'MEDIDO' ? 'madurez sin calcular' : engine === 'SIN_MEDICION' ? 'sin medición todavía: ninguna evidencia la acredita' : 'sin motor: ninguna evidencia la acredita',
      'L0-L5'
    );
  }
  const assessment = maturity?.assessed || last(record.assessments);
  const useDeclaration = declaration && declaration.level !== undefined && (!assessment || declaration.recordedAt >= assessment.recordedAt);
  if (useDeclaration && declaration) {
    push('maturity_assessed', declaration.level as ENSMaturityLevel, 'DECLARED', describeDeclaration(declaration), 'L0-L5');
  } else if (assessment) {
    push(
      'maturity_assessed',
      assessment.level,
      'ASSESSMENT',
      `valoración del ${assessment.date} por ${assessment.reviewer}${assessment.justification ? ` («${assessment.justification}»)` : ''}`,
      'L0-L5'
    );
  } else {
    push('maturity_assessed', null, 'NONE', 'sin valorar', 'L0-L5');
  }
  const categoryTarget = ctx.targets[level];
  if (useDeclaration && declaration && declaration.target !== undefined) {
    push('maturity_target', declaration.target, 'DECLARED', describeDeclaration(declaration), 'L0-L5');
  } else if (maturity && maturity.targetSource === 'ASSESSMENT') {
    push('maturity_target', maturity.target, 'ASSESSMENT', 'objetivo fijado en la valoración', 'L0-L5');
  } else {
    push('maturity_target', maturity ? maturity.target : categoryTarget, 'CONFIGURATION', `objetivo de la categoría ${ENS_CATEGORY_NAMES[level]} (Configuración > General)`, 'L0-L5');
  }

  // Documentary reference and owner: the declared entry, else the procedure registered in the maturity.
  const attestation = maturity?.attestation || last(record.attestations);
  if (declaration) {
    push('documentary_reference', `${declaration.reference}${declaration.link ? ` (${declaration.link})` : ''}`, 'DECLARED', describeDeclaration(declaration));
    push('owner', declaration.owner, 'DECLARED', describeDeclaration(declaration));
  } else if (attestation) {
    const trace = `procedimiento registrado en la madurez el ${attestation.recordedAt.slice(0, 10)} por ${attestation.recordedBy}`;
    push('documentary_reference', `${attestation.reference} versión ${attestation.version} (${attestation.link})`, 'DECLARED', trace);
    push('owner', attestation.owner, 'DECLARED', trace);
  } else {
    push('documentary_reference', null, 'NONE', 'sin procedimiento ni entrada declarada');
    push('owner', null, 'NONE', 'sin procedimiento ni entrada declarada');
  }
  const assessedAt = useDeclaration && declaration ? declaration.date : assessment?.date;
  push('assessed_at', assessedAt ?? null, useDeclaration ? 'DECLARED' : assessment ? 'ASSESSMENT' : 'NONE', assessedAt ? 'fecha de la valoración o de la entrada declarada' : 'sin valorar');

  return { id: measure.id, name: measure.name, annexSection: measure.annexSection, framework: annexFramework(measure.id), engine, data };
};

// --- aggregates -----------------------------------------------------------------------------------------------

// The same figure as op.mon.2 field 2: the engine score of P-01's applicable measures (implementation-degree.ts).
const implementationOf = (measures: ENSAnnualMeasure[], applicable: string[], results: ENSComplianceResult[], repeated: string[]): ENSAnnualDatum[] => {
  const degree = implementationDegree(applicable, results);
  const base = applicable.map(id => measures.find(measure => measure.id === id)).filter((measure): measure is ENSAnnualMeasure => Boolean(measure));
  const pending = base.filter(measure => !degree.scored.includes(measure.id));
  const declared = pending.filter(measure => valueOf(measure.data, 'measure.maturity_assessed') !== null);
  const without = pending.filter(measure => !declared.includes(measure));
  const outside = measures.filter(measure => valueOf(measure.data, 'measure.applies') === true && get(measure.data, 'measure.applies')?.source !== 'SOA');
  const noBase = 'sin medidas aplicables en la Declaración de Aplicabilidad (op.mon.2 P-01): el grado de implantación no tiene base';
  return [
    datum(
      'implementation.global_pct',
      degree.global === undefined ? null : round(degree.global),
      degree.global === undefined ? 'NONE' : 'ENGINE',
      !applicable.length
        ? noBase
        : degree.global === undefined
        ? `ninguna de las ${applicable.length} medidas aplicables de P-01 tiene porcentaje del motor`
        : `media del porcentaje del motor de ${degree.evaluadas} de las ${degree.medidas} medidas aplicables de la DA (P-01); no cuentan op.mon.2, las medidas sin medición todavía ni las que no aplican en su nivel (el mismo cálculo que el campo 2 de op.mon.2)`,
      { unit: '%' }
    ),
    ...(['org', 'op', 'mp'] as const).map(framework => {
      const own = degree.byFramework[framework];
      return datum(
        'implementation.framework_pct',
        own.score === undefined ? null : round(own.score),
        own.score === undefined ? 'NONE' : 'ENGINE',
        own.score === undefined ? 'ninguna medida aplicable de P-01 de este marco con porcentaje del motor' : `media de ${own.measures} medidas aplicables de P-01 medidas por Power ENS`,
        { key: framework, unit: '%' }
      );
    }),
    datum(
      'implementation.measures_applicable',
      applicable.length,
      'SOA',
      [applicable.length ? 'medidas aplicables según la DA (op.mon.2 P-01)' : noBase, describeRepeatedMeasures(repeated)].filter(Boolean).join('; '),
      { unit: 'n' }
    ),
    datum('implementation.measures_measured', degree.evaluadas, 'ENGINE', 'de ellas, con porcentaje del motor (cuentan en el grado de implantación)', { unit: 'n' }),
    datum('implementation.measures_declared', declared.length, 'DECLARED', `de ellas, sin porcentaje y con madurez valorada o declarada: ${declared.map(measure => measure.id).join(', ') || 'ninguna'}`, { unit: 'n' }),
    datum('implementation.measures_without_data', without.length, 'NONE', `de ellas, sin porcentaje ni madurez: ${without.map(measure => measure.id).join(', ') || 'ninguna'}`, { unit: 'n' }),
    datum(
      'implementation.measures_applicable_outside_soa',
      outside.length,
      outside.length ? 'ANNEX_II' : 'SOA',
      `aplican sin fila en la DA (entrada declarada o Anexo II) y no cuentan en el grado de implantación: ${outside.map(measure => measure.id).join(', ') || 'ninguna'}`,
      { unit: 'n' }
    ),
  ];
};

const maturityOf = (measures: ENSAnnualMeasure[]): ENSAnnualDatum[] => {
  const applying = measures.filter(measure => valueOf(measure.data, 'measure.applies') === true);
  const levelOf = (measure: ENSAnnualMeasure): number | null => {
    const assessed = valueOf(measure.data, 'measure.maturity_assessed');
    const accredited = valueOf(measure.data, 'measure.maturity_accredited');
    return typeof assessed === 'number' ? assessed : typeof accredited === 'number' ? accredited : null;
  };
  const below = applying.filter(measure => {
    const level = levelOf(measure);
    const target = valueOf(measure.data, 'measure.maturity_target');
    return level !== null && typeof target === 'number' && level < target;
  });
  return [
    ...[0, 1, 2, 3, 4, 5].map(level =>
      datum(
        'maturity.measures_at_level',
        applying.filter(measure => levelOf(measure) === level).length,
        'ASSESSMENT',
        'medidas aplicables por nivel: el valorado o declarado y, sin él, el acreditado',
        { key: `L${level}`, unit: 'n' }
      )
    ),
    datum('maturity.not_assessed', applying.filter(measure => levelOf(measure) === null).length, 'NONE', 'medidas aplicables sin nivel valorado, declarado ni acreditado', { unit: 'n' }),
    datum('maturity.below_target', below.length, 'ASSESSMENT', `por debajo de su objetivo: ${below.map(measure => measure.id).join(', ') || 'ninguna'}`, { unit: 'n' }),
  ];
};

// The system category: the highest of the ENS level and the dimension levels (Annex I); header and categorisation use it.
const systemCategory = (global: ENSConfigurationVersion['global']): ENSLevel =>
  ENS_DIMENSIONS.map(dimension => resolveDimensionLevel(dimension, global.ensLevel, global)).reduce<ENSLevel>(
    (max, level) => (compareENSLevels(level, max) > 0 ? level : max),
    global.ensLevel
  );

const categorisationOf = (global: ENSConfigurationVersion['global']): ENSAnnualDatum[] => {
  const levels = ENS_DIMENSIONS.map(dimension => ({ dimension, level: resolveDimensionLevel(dimension, global.ensLevel, global) }));
  const highest = systemCategory(global);
  const incoherent = describeDimensionsAboveENSLevel(global);
  return [
    ...levels.map(({ dimension, level }) =>
      datum(
        `category.level_${dimension.toLowerCase()}`,
        level,
        'CONFIGURATION',
        global[ENS_DIMENSION_LEVEL_KEYS[dimension]] ? `Configuración > General: nivel de ${ENS_DIMENSION_NAMES[dimension]}` : `clave ausente en Configuración > General: igual al nivel ENS`
      )
    ),
    datum('category.ens_level', global.ensLevel, 'CONFIGURATION', 'Configuración > General: nivel ENS'),
    datum('category.category', ENS_CATEGORY_NAMES[highest], 'CONFIGURATION', `el mayor nivel de las dimensiones (Anexo I)${incoherent ? `. ${incoherent}` : ''}`),
  ];
};

// --- incidents ------------------------------------------------------------------------------------------------

interface RegisterIncident {
  id: string;
  severidad?: string;
  clasificacion?: string;
  apertura?: string;
  primera: string;
  contencion?: string;
  cierre?: string;
  ocurrencia?: string;
  ccnCert?: string;
  ccn?: boolean;
  aepd?: boolean;
  datosPersonales?: string;
}

const ms = (value?: string): number | undefined => {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : undefined;
};

const countBy = (values: string[]): [string, number][] => {
  const map = new Map<string, number>();
  values.forEach(value => map.set(value, (map.get(value) || 0) + 1));
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

const hours = (values: number[]): number | null => {
  const value = mean(values);
  return value === undefined ? null : round(value / HOUR_MS);
};

// Whether the live variable's 500 cap cut incidents that open inside the window (then it cannot be used for it).
export const liveIncidentsCutInto = (opMon2: ENSComplianceResult | undefined, fromMs: number): boolean => {
  const register = readJsonVariable(opMon2, 'informe_art32_incidentes');
  if (!register?.recortados || !Array.isArray(register.incidentes)) return false;
  const first = register.incidentes[0];
  const opened = ms(first?.apertura) ?? ms(first?.primera);
  return opened === undefined || opened > fromMs;
};

const incidentsOf = (
  opMon2: ENSComplianceResult | undefined,
  opExp7: ENSComplianceResult | undefined,
  window: { fromMs: number; toMs: number; label: string },
  // The period's incidents read on the server (freezes, closed periods); without them, the live variable.
  periodIncidents?: Record<string, any>
): ENSAnnualDatum[] => {
  const register = periodIncidents || readJsonVariable(opMon2, 'informe_art32_incidentes');
  const reconciliation = readJsonVariable(opExp7, 'informe_art32_conciliacion');
  const detection = readJsonVariable(opExp7, 'informe_art32_deteccion');
  const data: ENSAnnualDatum[] = [
    datum('incidents.window_start', iso(window.fromMs), 'CONFIGURATION', 'inicio del periodo del informe'),
    datum('incidents.window_end', iso(window.toMs), 'CONFIGURATION', window.label),
  ];
  const source = 'INCIDENT_REGISTER';
  const where = (n: number) =>
    `registro de incidentes de op.exp.7 reemitido por op.mon.2 (leído el ${register?.leido || '—'}${periodIncidents ? ', todas las filas del periodo' : ''}), ${n} incidente(s) abiertos en el periodo`;

  // Never a figure from an incomplete list: over the limit, a start the source does not cover, or the live cap.
  const publishedFrom = ms(register?.desde);
  const reemittedFrom = ms(register?.cubreDesde);
  const cut = !periodIncidents && Boolean(register?.recortados) && liveIncidentsCutInto(opMon2, window.fromMs);
  const unavailable =
    register?.excedido !== undefined
      ? `no disponible: el periodo tiene más de ${register.limite} incidentes (${register.excedido}); el informe no publica cifras de incidentes de un periodo así`
      : !register || !Array.isArray(register.incidentes) || register.motivo
      ? register?.motivo || 'op.mon.2 no ha leído el registro de incidentes'
      : reemittedFrom !== undefined && window.fromMs < reemittedFrom
      ? `no disponible para este periodo: op.mon.2 reemite los incidentes de los ${ART32_REGISTER_WINDOW_DAYS} días anteriores a su lectura (desde el ${String(register.cubreDesde).slice(0, 10)}) y el periodo empieza antes; solo su congelado tiene las cifras completas`
      : publishedFrom !== undefined && window.fromMs < publishedFrom
      ? `no disponible para este periodo: op.mon.2 publica en vivo los incidentes abiertos desde el ${String(register.desde).slice(0, 10)}; un periodo anterior solo está completo en su congelado`
      : cut
      ? `incompleto: op.mon.2 publica en vivo como mucho ${ART32_MAX_INCIDENTS} incidentes (${register.recortados} sin publicar) y el corte cae dentro del periodo`
      : undefined;
  if (unavailable) {
    ['total', 'mttd_hours', 'mttd_lower_bound_hours', 'mttc_hours', 'mttr_hours', 'notified_ccn_cert', 'with_personal_data', 'notified_aepd'].forEach(id =>
      data.push(datum(`incidents.${id}`, null, 'NONE', unavailable, { unit: id.endsWith('hours') ? 'h' : 'n' }))
    );
  } else {
    const all = register.incidentes as RegisterIncident[];
    const opened = (i: RegisterIncident) => ms(i.apertura) ?? ms(i.primera);
    const ofPeriod = all.filter(i => {
      const t = opened(i);
      return t !== undefined && t >= window.fromMs && t < window.toMs;
    });
    const trace = `${where(ofPeriod.length)}${register.futuros ? `; ${register.futuros} incidente(s) con fecha posterior a la lectura no cuentan` : ''}`;
    data.push(datum('incidents.total', ofPeriod.length, source, trace, { unit: 'n' }));
    countBy(ofPeriod.map(i => i.clasificacion || 'sin clasificar')).forEach(([type, n]) =>
      data.push(datum('incidents.by_type', n, source, `${trace}; columna clasificacion`, { key: type, unit: 'n' }))
    );
    [...SEVERITIES, 'sin severidad'].forEach(severity => {
      const n = ofPeriod.filter(i => (i.severidad || 'sin severidad') === severity).length;
      if (n || SEVERITIES.includes(severity)) data.push(datum('incidents.by_severity', n, source, `${trace}; la mayor severidad de sus fases`, { key: severity, unit: 'n' }));
    });

    // Detection: fecha_ocurrencia when the register has it, else the first alert op.exp.7 reconciled with it.
    const alertOf = new Map<string, number>();
    (Array.isArray(detection?.incidentes) ? detection.incidentes : []).forEach((entry: any) => {
      const t = ms(entry?.deteccion);
      if (entry?.id && t !== undefined) alertOf.set(String(entry.id), t);
    });
    const fromOccurrence: number[] = [];
    const fromAlert: number[] = [];
    const without: string[] = [];
    ofPeriod.forEach(i => {
      const base = opened(i) as number;
      const occurred = ms(i.ocurrencia);
      const alert = alertOf.get(i.id);
      if (occurred !== undefined && occurred <= base) fromOccurrence.push(base - occurred);
      else if (alert !== undefined && alert <= base) fromAlert.push(base - alert);
      else without.push(i.id);
    });
    // Exact times and lower bounds are never averaged together.
    data.push(
      datum(
        'incidents.mttd_hours',
        hours(fromOccurrence),
        fromOccurrence.length ? source : 'NONE',
        fromOccurrence.length
          ? `de fecha_ocurrencia a la fase inicial, ${fromOccurrence.length} incidente(s); ${fromAlert.length} más solo con cota inferior (incidents.mttd_lower_bound_hours) y ${without.length} sin dato`
          : `ningún incidente del periodo con fecha_ocurrencia; ${fromAlert.length} con cota inferior (incidents.mttd_lower_bound_hours)`,
        { unit: 'h' }
      ),
      datum(
        'incidents.mttd_lower_bound_hours',
        hours(fromAlert),
        fromAlert.length ? 'ALERT_RECONCILIATION' : 'NONE',
        fromAlert.length
          ? `cota inferior: de la primera alerta conciliada por op.exp.7 a la fase inicial, ${fromAlert.length} incidente(s) sin fecha_ocurrencia (ventana de op.exp.7 de ${detection?.desde || '—'} a ${detection?.hasta || '—'})`
          : 'ningún incidente sin fecha_ocurrencia con alerta conciliada',
        { unit: 'h' }
      ),
      datum('incidents.mttd_from_occurrence', fromOccurrence.length, source, 'incidentes medidos con la columna fecha_ocurrencia del registro', { unit: 'n' }),
      datum(
        'incidents.mttd_from_alert',
        fromAlert.length,
        'ALERT_RECONCILIATION',
        `incidentes sin fecha_ocurrencia medidos con la primera alerta conciliada (op.exp.7, ventana de ${detection?.desde || '—'} a ${detection?.hasta || '—'}): cota inferior`,
        { unit: 'n' }
      ),
      datum('incidents.mttd_without_data', without.length, 'NONE', without.length ? `sin fecha_ocurrencia ni alerta conciliada: ${without.join(', ')}` : 'todos los incidentes con dato', { unit: 'n' })
    );
    const contained = ofPeriod.filter(i => ms(i.apertura) !== undefined && ms(i.contencion) !== undefined && (ms(i.contencion) as number) >= (ms(i.apertura) as number));
    const closed = ofPeriod.filter(i => ms(i.apertura) !== undefined && ms(i.cierre) !== undefined && (ms(i.cierre) as number) >= (ms(i.apertura) as number));
    data.push(
      datum('incidents.mttc_hours', hours(contained.map(i => (ms(i.contencion) as number) - (ms(i.apertura) as number))), source, `${trace}; de la fase inicial a la primera intermedia, ${contained.length} contenidos`, { unit: 'h' }),
      datum('incidents.mttr_hours', hours(closed.map(i => (ms(i.cierre) as number) - (ms(i.apertura) as number))), source, `${trace}; de la fase inicial a la última final, ${closed.length} cerrados`, { unit: 'h' }),
      datum('incidents.notified_ccn_cert', ofPeriod.filter(i => i.ccn || ms(i.ccnCert) !== undefined).length, source, `${trace}; columna notificacion_ccn_cert`, { unit: 'n' })
    );
    const personal = ofPeriod.filter(i => i.datosPersonales === 'si');
    data.push(
      datum('incidents.with_personal_data', personal.length, source, `${trace}; columna datos_personales`, { unit: 'n' }),
      datum('incidents.notified_aepd', personal.filter(i => i.aepd).length, source, `${trace}; AEPD en notificado_a`, { unit: 'n' })
    );
  }

  // Share of the relevant alerts that ended in an incident: op.exp.7's reconciliation, only if its window touches the period.
  const reconciledFrom = ms(reconciliation?.desde);
  const reconciledTo = ms(reconciliation?.hasta);
  // Where op.exp.7's window falls against the period, as a datum of its own (field 8 reads it, not a trace).
  const coverage =
    reconciledFrom === undefined || reconciledTo === undefined
      ? null
      : reconciledTo <= window.fromMs || reconciledFrom >= window.toMs
      ? 'FUERA'
      : reconciledFrom >= window.fromMs && reconciledTo <= window.toMs
      ? 'DENTRO'
      : 'PARCIAL';
  data.push(
    datum(
      'incidents.alerts_window',
      coverage,
      coverage ? 'ALERT_RECONCILIATION' : 'NONE',
      coverage
        ? `ventana de la conciliación de op.exp.7 (${reconciliation.desde} a ${reconciliation.hasta}) frente al periodo: DENTRO, PARCIAL o FUERA`
        : reconciliation?.motivo || 'sin la conciliación de alertas de op.exp.7'
    )
  );
  const outside =
    coverage === 'FUERA'
      ? `no disponible para este periodo: la ventana de conciliación de op.exp.7 (${reconciliation.desde} a ${reconciliation.hasta}) queda fuera del periodo`
      : undefined;
  if (!reconciliation || reconciliation.motivo || typeof reconciliation.relevantes !== 'number' || outside) {
    const why = outside || reconciliation?.motivo || 'sin la conciliación de alertas de op.exp.7';
    data.push(
      datum('incidents.alerts_relevant', null, 'NONE', why, { unit: 'n' }),
      datum('incidents.alerts_in_incident', null, 'NONE', why, { unit: 'n' }),
      datum('incidents.alerts_to_incident_pct', null, 'NONE', why, { unit: '%' })
    );
  } else {
    const r = reconciliation;
    const decided = r.enIncidente + r.sinIncidente;
    const partial = coverage === 'PARCIAL' ? '; la ventana solo cubre en parte el periodo' : '';
    const trace = `conciliación de op.exp.7 de los ${r.ventanaDias} días de ${r.desde} a ${r.hasta} (no del periodo entero${partial}): alertas Alta y Crítica; ${r.pendientes} dentro de su plazo de escalado, ${r.sinPlazo} sin plazo en P-02 y ${r.excluidas} excluidas por P-12 no cuentan`;
    data.push(
      datum('incidents.alerts_relevant', r.relevantes, 'ALERT_RECONCILIATION', trace, { unit: 'n' }),
      datum('incidents.alerts_in_incident', r.enIncidente, 'ALERT_RECONCILIATION', trace, { unit: 'n' }),
      datum(
        'incidents.alerts_to_incident_pct',
        decided ? round((r.enIncidente / decided) * 100) : null,
        decided ? 'ALERT_RECONCILIATION' : 'NONE',
        decided ? `${r.enIncidente} de ${decided} alertas decididas; ${trace}` : `ninguna alerta relevante decidida; ${trace}`,
        { unit: '%' }
      )
    );
  }
  return data;
};

// --- resources and measurement --------------------------------------------------------------------------------

const resourcesOf = (
  opMon2: ENSComplianceResult | undefined,
  records: ENSMaturityRecords | undefined,
  period: string,
  window: { fromMs: number; toMs: number }
): ENSAnnualDatum[] => {
  const register = readJsonVariable(opMon2, 'informe_art32_ciclos');
  const data: ENSAnnualDatum[] = [];
  const sum = (values: (number | undefined)[]): number | null => {
    const known = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return known.length ? round(known.reduce((a, b) => a + b, 0)) : null;
  };
  let budget: number | null = null;
  if (!register || !Array.isArray(register.ciclos) || register.motivo) {
    const why = register?.motivo || 'op.mon.2 no ha leído el registro de ciclos de métricas';
    ['cycles', 'hours_internal', 'hours_external', 'budget_executed'].forEach(id =>
      data.push(datum(`resources.${id}`, null, 'NONE', why, { unit: id === 'cycles' ? 'n' : id === 'budget_executed' ? '€' : 'h' }))
    );
  } else {
    const cycles = (register.ciclos as any[]).filter(c => {
      const t = ms(c.fecha);
      return t !== undefined && t >= window.fromMs && t < window.toMs;
    });
    const trace = `registro de ciclos de métricas (leído el ${register.leido}), dato declarado: ${
      cycles.map(c => `${c.periodo}${c.validadoPor ? ` validado por ${c.validadoPor}` : ' sin validar'}`).join(', ') || 'ningún ciclo consolidado en el periodo'
    }`;
    budget = sum(cycles.map(c => c.presupuesto));
    data.push(
      datum('resources.cycles', cycles.length, 'CYCLE_REGISTER', trace, { unit: 'n' }),
      datum('resources.hours_internal', sum(cycles.map(c => c.horasInternas)), 'CYCLE_REGISTER', `${trace}; suma de horas_internas`, { unit: 'h' }),
      datum('resources.hours_external', sum(cycles.map(c => c.horasExternas)), 'CYCLE_REGISTER', `${trace}; suma de horas_externas`, { unit: 'h' }),
      datum('resources.budget_executed', budget, 'CYCLE_REGISTER', `${trace}; suma de presupuesto_ejecutado`, { unit: '€' })
    );
  }

  const declared = readControlMaturityRecord(records, ENS_ANNUAL_REPORT_CONTROL).resources.filter(entry => entry.period === period);
  const totals = last(declared);
  const trace = totals
    ? `recursos TIC totales declarados en op.mon.2 el ${totals.recordedAt.slice(0, 10)} por ${totals.recordedBy} (${totals.reference}; responsable ${totals.owner})`
    : `sin recursos TIC totales declarados para ${period}`;
  data.push(
    datum('resources.ict_budget_total', totals?.ictBudget ?? null, totals?.ictBudget !== undefined ? 'DECLARED' : 'NONE', trace, { unit: '€' }),
    datum('resources.ict_staff_total', totals?.ictStaff ?? null, totals?.ictStaff !== undefined ? 'DECLARED' : 'NONE', trace, { unit: 'FTE' }),
    datum('resources.security_staff', totals?.securityStaff ?? null, totals?.securityStaff !== undefined ? 'DECLARED' : 'NONE', trace, { unit: 'FTE' }),
    datum(
      'resources.budget_pct_of_ict',
      budget !== null && totals?.ictBudget ? round((budget / totals.ictBudget) * 100) : null,
      budget !== null && totals?.ictBudget ? 'DECLARED' : 'NONE',
      budget !== null && totals?.ictBudget ? 'presupuesto ejecutado del registro de ciclos sobre el presupuesto TIC total declarado' : 'falta el presupuesto ejecutado o el presupuesto TIC total',
      { unit: '%' }
    ),
    datum(
      'resources.security_staff_pct_of_ict',
      totals?.securityStaff !== undefined && totals?.ictStaff ? round((totals.securityStaff / totals.ictStaff) * 100) : null,
      totals?.securityStaff !== undefined && totals?.ictStaff ? 'DECLARED' : 'NONE',
      totals?.securityStaff !== undefined && totals?.ictStaff ? 'plantilla de seguridad sobre la plantilla TIC total, ambas declaradas' : 'falta la plantilla de seguridad o la plantilla TIC total',
      { unit: '%' }
    )
  );
  return data;
};

// Controls with requirements left unevaluated for lack of configuration (same rule as field 5 of op.mon.2).
const notEvaluable = (results: ENSComplianceResult[]): string[] =>
  results
    .filter(result => result.control.id !== ENS_ANNUAL_REPORT_CONTROL && measureEngine(result.control.id) === 'MEDIDO')
    .filter(
      result =>
        (result.missingParameters || []).length > 0 ||
        (result.nonConformities || []).some(nc => nc.origin === 'NO_EVIDENCIADA' && nc.cause === 'CONFIGURATION')
    )
    .map(result => result.control.id);

const measurementOf = (opMon2: ENSComplianceResult | undefined, results: ENSComplianceResult[], window: { toMs: number }): ENSAnnualDatum[] => {
  const coverage = readRuntimeVariable(opMon2, 'cobertura_monitorizacion');
  const pending = notEvaluable(results);
  const cycles = readJsonVariable(opMon2, 'informe_art32_ciclos');
  const lastCycle = last(((cycles?.ciclos || []) as any[]).filter(c => (ms(c.fecha) ?? Infinity) < window.toMs));
  return [
    datum(
      'measurement.coverage_pct',
      typeof coverage === 'number' ? coverage : null,
      typeof coverage === 'number' ? 'ENGINE' : 'NONE',
      typeof coverage === 'number' ? 'op.mon.2 EV-04: sistemas del alcance con el agente conectado y sus recolectores al día' : 'sin cobertura medida (op.mon.2 EV-04)',
      { unit: '%' }
    ),
    datum('measurement.controls_not_evaluable', pending.length, 'ENGINE', `controles con requisitos sin evaluar por falta de configuración: ${pending.join(', ') || 'ninguno'}`, { unit: 'n' }),
    datum('measurement.last_cycle', lastCycle ? lastCycle.periodo : null, lastCycle ? 'CYCLE_REGISTER' : 'NONE', lastCycle ? `consolidado el ${String(lastCycle.fecha).slice(0, 10)}` : 'ningún ciclo anotado'),
    datum(
      'measurement.last_cycle_implementation_pct',
      typeof lastCycle?.implantacion === 'number' ? lastCycle.implantacion : null,
      typeof lastCycle?.implantacion === 'number' ? 'CYCLE_REGISTER' : 'NONE',
      'implantacion_global del último ciclo, dato declarado por la organización',
      { unit: '%' }
    ),
  ];
};

// --- the data set ---------------------------------------------------------------------------------------------

export const buildAnnualReport = (input: ENSAnnualReportInput): ENSAnnualReport => {
  const { configuration, now, timeZone } = input;
  const global = configuration.global;
  const results = new Map(input.results.map(result => [result.control.id, result]));
  const opMon2 = input.managerRows?.[ENS_ANNUAL_REPORT_CONTROL] || results.get(ENS_ANNUAL_REPORT_CONTROL);
  const opExp7 = input.managerRows?.[INCIDENTS_CONTROL] || results.get(INCIDENTS_CONTROL);
  const { closing, declared } = annualClosingOf(opMon2);
  const today = dayIn(now, timeZone);
  const period = input.period || annualPeriodOfDay(today, closing);
  const bounds = annualPeriodBounds(period, closing);
  const instants = annualPeriodInstants(period, closing, timeZone);
  const open = now.getTime() < instants.toMs;
  const window = {
    fromMs: instants.fromMs,
    toMs: Math.min(instants.toMs, now.getTime()),
    label: open ? `periodo en curso: hasta la generación (${iso(now.getTime())})` : `fin del periodo (cierre ${closing})`,
  };
  const soa = statementOfApplicability(opMon2);
  // P-01 once per measure, the last row winning: the same list as field 2 and as `measure.applies`.
  const statement = applicableMeasures(parameterRows(opMon2, 'P-01', ['medida', 'aplicable', 'nivel', 'refuerzos_exigibles']));
  const measures = ENS_ANNEX_II_MEASURES.map(measure =>
    buildMeasure(measure, {
      global,
      targets: resolveMaturityTargets(configuration),
      soa,
      soaRead: soa.size > 0,
      results,
      maturity: input.maturity,
      records: input.records,
    })
  );
  const text = (value: string | undefined, label: string) =>
    datum(`header.${label}`, value && value.trim() ? value.trim() : null, 'CONFIGURATION', value && value.trim() ? 'Configuración > General' : 'sin declarar en Configuración > General');
  const freeze = input.freeze;

  return {
    schema: ENS_ANNUAL_REPORT_SCHEMA,
    period,
    header: [
      datum('header.schema', ENS_ANNUAL_REPORT_SCHEMA, 'NONE', 'versión del formato del conjunto de datos'),
      { ...text(global.clientName, 'organisation'), trace: global.clientName ? 'Configuración > General: Cliente' : 'sin declarar en Configuración > General (Cliente)' },
      { ...text(global.organization, 'unit'), trace: global.organization ? 'Configuración > General: Organización' : 'sin declarar en Configuración > General (Organización)' },
      { ...text(global.scope, 'system'), trace: global.scope ? 'Configuración > General: Alcance' : 'sin declarar en Configuración > General (Alcance)' },
      datum('header.period', period, 'CONFIGURATION', `año del cierre del periodo`),
      datum('header.period_start', bounds.from, 'CONFIGURATION', `día siguiente al cierre anterior (${timeZone})`),
      datum('header.period_end', bounds.to, 'CONFIGURATION', declared ? `op.mon.2 P-02 cierre_anual ${closing}` : `op.mon.2 P-02 sin cierre_anual: ${closing}`),
      datum('header.period_open', open, 'NONE', open ? 'el periodo no ha cerrado: las cifras son las de hoy' : 'periodo cerrado'),
      datum('header.category', ENS_CATEGORY_NAMES[systemCategory(global)], 'CONFIGURATION', 'la de category.category: el mayor nivel de las dimensiones (Anexo I)'),
      datum('header.generated_at', iso(now.getTime()), 'NONE', 'instante de la evaluación con la que se generó'),
      datum('header.plugin_version', input.pluginVersion, 'NONE', 'versión de Power ENS que lo generó'),
      datum('header.frozen', Boolean(freeze), 'FREEZE', freeze ? 'conjunto congelado en wazuh-ens-snapshots' : 'conjunto calculado ahora, sin congelar'),
      datum('header.frozen_at', freeze?.frozenAt ?? null, freeze ? 'FREEZE' : 'NONE', freeze ? 'instante del congelado' : 'sin congelar'),
      datum('header.frozen_by', freeze?.frozenBy ?? null, freeze ? 'FREEZE' : 'NONE', freeze ? 'quién lo congeló' : 'sin congelar'),
      datum('header.revision', freeze?.revision ?? null, freeze ? 'FREEZE' : 'NONE', freeze ? 'revisión del congelado (1 = el del cierre)' : 'sin congelar'),
      datum('header.freeze_reason', freeze?.reason ?? null, freeze?.reason ? 'FREEZE' : 'NONE', freeze?.reason ? 'motivo de la regeneración' : 'sin motivo: congelado al cierre o sin congelar'),
    ],
    categorisation: categorisationOf(global),
    implementation: implementationOf(measures, statement.applicable, input.results, statement.repeated),
    maturity: maturityOf(measures),
    measures,
    incidents: incidentsOf(opMon2, opExp7, window, input.periodIncidents),
    resources: resourcesOf(opMon2, input.records, period, window),
    measurement: measurementOf(opMon2, input.results, window),
  };
};

// The same data set marked as frozen (the header changes, nothing else).
export const markAnnualReportFrozen = (report: ENSAnnualReport, freeze: ENSAnnualFreezeEntry): ENSAnnualReport => ({
  ...report,
  header: report.header.map(entry => {
    switch (entry.id) {
      case 'header.frozen':
        return datum(entry.id, true, 'FREEZE', 'conjunto congelado en wazuh-ens-snapshots');
      case 'header.frozen_at':
        return datum(entry.id, freeze.frozenAt, 'FREEZE', 'instante del congelado');
      case 'header.frozen_by':
        return datum(entry.id, freeze.frozenBy, 'FREEZE', 'quién lo congeló');
      case 'header.revision':
        return datum(entry.id, freeze.revision, 'FREEZE', 'revisión del congelado (1 = el del cierre)');
      case 'header.freeze_reason':
        return freeze.reason ? datum(entry.id, freeze.reason, 'FREEZE', 'motivo de la regeneración') : entry;
      default:
        return entry;
    }
  }),
});
