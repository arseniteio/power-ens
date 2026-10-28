// Import from the types file, never from the `../core` barrel: it avoids the transitive TDZ cycle of Settings.
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../common/ens/configuration/services/parameter-value-validator';
// Same grammar as the policy for P-06; P-01 through `applicableMeasures` (the policy's parser, once per measure).
import { parseMetricTargets } from '../../../common/ens/core/policy-runtime/policies/op-mon-2.policy';
import type { MetricTarget } from '../../../common/ens/core/policy-runtime/policies/op-mon-2.policy';
import { getENSCatalogControl, isPendingMeasurement } from '../../../common/ens/catalog';
import { describeAnnualReport } from '../../../common/ens/annual-report/annual-report-export';
import { applicableMeasures, describeRepeatedMeasures, implementationDegree } from '../../../common/ens/annual-report/implementation-degree';
import type { ENSAnnualReport } from '../../../common/ens/annual-report/annual-report-types';
import { statusLabel } from '../../../common/ens/core/status-label';

export type OpMon2ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpMon2ReportField {
  id: string;
  title: string;
  status: OpMon2ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpMon2ReportModel {
  controlId: string;
  status: OpMon2ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpMon2ReportField[];
}

const STATUS_VALUES = new Set<OpMon2ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpMon2ReportFieldStatus =>
  STATUS_VALUES.has(value as OpMon2ReportFieldStatus)
    ? (value as OpMon2ReportFieldStatus)
    : 'SIN_DATOS';

const formatValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'Sin valor';
  }
  if (value === undefined || value === null || value === '') {
    return 'Sin valor';
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  return String(value);
};

const field = (
  id: string,
  title: string,
  status: OpMon2ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpMon2ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

const ALL_EVIDENCES = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'];

const CONTROL = 'op.mon.2';

const figure = (n: number): string => String(Math.round(n * 10) / 10);

const table = (
  result: ENSComplianceResult | undefined,
  id: string,
  columns: string[],
): Record<string, string>[] => {
  const value = (result?.parameters || []).find(p => p.id === id)?.value;

  if (value === undefined) {
    return [];
  }

  return toParameterTableRows(value as Parameters<typeof toParameterTableRows>[0])
    .map(row => toTableRowCells(row))
    .filter(cells => cells.some(Boolean))
    .map(cells => {
      const row: Record<string, string> = {};

      columns.forEach((column, i) => {
        row[column] = (cells[i] || '').trim();
      });

      return row;
    });
};

const deviation = (value: number, o: MetricTarget | undefined): string => {
  if (!o) {
    return 'sin objetivo en P-06';
  }

  const target = `objetivo ${o.sentido === 'minimo' ? '≥' : '≤'} ${figure(o.objetivo)}${o.unidad ? ` ${o.unidad}` : ''}`;
  const outside = o.sentido === 'minimo' ? value < o.umbral : value > o.umbral;
  const belowTarget = o.sentido === 'minimo' ? value < o.objetivo : value > o.objetivo;

  return outside
    ? `${target}: DESVIACIÓN`
    : belowTarget
    ? `${target}: dentro de la tolerancia`
    : `${target}: alcanzado`;
};

// A control without collector is out of every op.mon.2 figure: it cannot be configured «for evaluation» yet.
const greys = (panorama: ENSComplianceResult[]): string[] =>
  panorama
    .filter(r => r.control.id !== CONTROL && !isPendingMeasurement(getENSCatalogControl(r.control.id)))
    .map(r => {
      const parameters = new Set<string>(r.missingParameters || []);

      (r.nonConformities || [])
        .filter(nc => nc.origin === 'NO_EVIDENCIADA' && nc.cause === 'CONFIGURATION')
        .forEach(nc => (nc.parameterIds || []).forEach(p => parameters.add(p)));

      const withoutParameter = (r.nonConformities || []).some(
        nc => nc.origin === 'NO_EVIDENCIADA' && nc.cause === 'CONFIGURATION' && !(nc.parameterIds || []).length,
      );

      return parameters.size || withoutParameter
        ? `${r.control.id}: ${parameters.size ? Array.from(parameters).sort().join(', ') : 'configuración incompleta'}`
        : '';
    })
    .filter(Boolean);

/** Report model of op.mon.2: translates the engine result into report fields. */
export const buildOpMon2ReportModel = (
  result: ENSComplianceResult | undefined,
  panorama?: ENSComplianceResult[],
  extra: { annualReport?: ENSAnnualReport } = {},
): OpMon2ReportModel => {
  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const requirements = new Map(
    (result?.requirements || []).map(requirement => [requirement.id, requirement]),
  );

  const variables = new Map(
    (result?.policyRuntime?.runtimeVariables || []).map(variable => [variable.name, variable]),
  );

  const list = (name: string): string[] => {
    const value = variables.get(name)?.value;

    return Array.isArray(value) ? value.map(String) : [];
  };

  const evidenceStatus = (evidenceId: string): OpMon2ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();
  const reinforcements = level === 'MEDIO' || level === 'ALTO';

  // One entry per measure (the last row wins), as in the art. 32 data set.
  const declaration = applicableMeasures(
    table(result, 'P-01', ['medida', 'aplicable', 'nivel', 'refuerzos_exigibles']),
  );
  const { objetivos: targets } = parseMetricTargets(
    table(result, 'P-06', ['metrica', 'objetivo', 'tolerancia']),
  );

  const degree = panorama && declaration.applicable.length
    ? implementationDegree(declaration.applicable, panorama)
    : undefined;
  const pendingItems = panorama ? greys(panorama) : undefined;
  const series = list('serie_ciclos_metricas');
  const coverage = variables.get('cobertura_monitorizacion');
  const periodIndicators = list('indicadores_incidentes_periodo');
  const annualIndicators = list('indicadores_incidentes_anual');
  const r2 = requirements.get('op.mon.2.r2.1');

  const field1 = field(
    'op.mon.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ALL_EVIDENCES,
    (result?.requirements || [])
      .filter(requirement => requirement.status !== 'NO_APLICA')
      .map(requirement => `${requirement.id} ${requirement.title}: ${statusLabel(requirement.status)}${requirement.attested ? ' (acreditado documentalmente)' : ''}`),
  );

  const field2 = field(
    'op.mon.2.campo2',
    'Grado de implantación de las medidas',
    degree ? 'NO_APLICA' : 'SIN_DATOS',
    !panorama
      ? 'Sin el resultado de todos los controles: se calcula en la pantalla de Informes, con los hechos de todos.'
      : !declaration.applicable.length
      ? 'Sin Declaración de Aplicabilidad (P-01): el grado de implantación no tiene base.'
      : degree && degree.global !== undefined
      ? `${figure(degree.global)} % global sobre ${degree.evaluadas} de ${degree.medidas} medidas aplicables de P-01 evaluadas por Power ENS (${deviation(degree.global, targets.get('implantacion_global'))}). Dato del informe, sin veredicto.`
      : `Ninguna de las ${declaration.applicable.length} medidas aplicables de P-01 tiene puntuación en Power ENS.`,
    ['EV-01'],
    [describeRepeatedMeasures(declaration.repeated), ...(degree ? degree.lineas : []), ...evidenceObservations('EV-01')],
  );

  const field3 = field(
    'op.mon.2.campo3',
    'Evolución del grado de implantación',
    evidenceStatus('EV-02'),
    series.length
      ? `${series.length} ciclo(s) en el registro de ciclos de métricas; el último: ${series[0]}.`
      : 'Sin ciclos de métricas anotados en el registro de la organización.',
    ['EV-02'],
    [...series, ...evidenceObservations('EV-02')],
  );

  const field4 = field(
    'op.mon.2.campo4',
    'Fiabilidad de la medición',
    evidenceStatus('EV-04'),
    coverage && typeof coverage.value === 'number'
      ? `Cobertura de la monitorización ${figure(coverage.value)} %: ${coverage.description} (${deviation(coverage.value, targets.get('cobertura_monitorizacion'))}).`
      : 'Sin cobertura medida.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  const field5 = field(
    'op.mon.2.campo5',
    'Controles no evaluables por falta de parámetros',
    pendingItems ? 'NO_APLICA' : 'SIN_DATOS',
    !pendingItems
      ? 'Sin el resultado de todos los controles: se calcula en la pantalla de Informes, con los hechos de todos.'
      : `${pendingItems.length} control(es) con requisitos sin evaluar por falta de configuración (${deviation(pendingItems.length, targets.get('controles_no_evaluables'))}). Dato del informe, sin veredicto: es la lista de acciones pendientes del cliente.`,
    ['EV-05'],
    [...(pendingItems || []), ...evidenceObservations('EV-05')],
  );

  const field6 = field(
    'op.mon.2.campo6',
    'Métricas de gestión de incidentes (R1)',
    reinforcements ? evidenceStatus('EV-03') : 'NO_APLICA',
    !reinforcements
      ? 'R1 solo se exige en categoría MEDIA y ALTA.'
      : periodIndicators.length
      ? `Indicadores del periodo de P-02, calculados con el registro de incidentes de op.exp.7: ${periodIndicators.join('; ')}.`
      : 'Sin indicadores: el registro de incidentes no se ha podido leer o P-02 no está configurada.',
    ['EV-03'],
    [
      ...(annualIndicators.length ? [`Últimos 365 días (art. 32): ${annualIndicators.join('; ')}`] : []),
      ...evidenceObservations('EV-03'),
    ],
  );

  const field7 = field(
    'op.mon.2.campo7',
    'Recursos consumidos por el sistema de seguridad (R2)',
    reinforcements ? asStatus(r2?.status) : 'NO_APLICA',
    !reinforcements
      ? 'R2 solo se exige en categoría MEDIA y ALTA.'
      : r2?.attested
      ? 'DATO DECLARADO, acreditado documentalmente: horas y presupuesto del último ciclo, anotados y validados por la organización. Power ENS lo registra, no lo verifica.'
      : 'Sin acreditar: el último ciclo en plazo no trae horas y presupuesto validados por un responsable de P-05.',
    ['EV-06'],
    [...(r2?.observations || []), ...evidenceObservations('EV-06')],
  );

  // With the art. 32 data set, field 8 is its summary (the same figures as the JSON and CSV exports).
  const annual = extra.annualReport;
  const field8 = annual
    ? field(
        'op.mon.2.campo8',
        'Datos para el informe anual del artículo 32',
        'NO_APLICA',
        `Conjunto de datos del periodo ${annual.period} por medida del Anexo II, con el origen de cada cifra (formato ${annual.schema}). Dato del informe, sin veredicto.`,
        ['EV-07'],
        describeAnnualReport(annual),
      )
    : field(
    'op.mon.2.campo8',
    'Datos para el informe anual del artículo 32',
    panorama ? 'NO_APLICA' : 'SIN_DATOS',
    panorama
      ? 'Conjunto consolidado con el origen de cada cifra. Dato del informe, sin veredicto.'
      : 'Sin el resultado de todos los controles: se calcula en la pantalla de Informes.',
    ['EV-07'],
    panorama
      ? [
          degree && degree.global !== undefined
            ? `Grado de implantación: ${figure(degree.global)} % (motor de Power ENS sobre P-01, ${degree.evaluadas} de ${degree.medidas} medidas evaluadas)`
            : 'Grado de implantación: sin base (P-01)',
          coverage && typeof coverage.value === 'number'
            ? `Fiabilidad de la medición: ${figure(coverage.value)} % (global.db y latidos de los recolectores en el manager)`
            : 'Fiabilidad de la medición: sin medir',
          series.length ? `Último ciclo de métricas: ${series[0]} (registro de ciclos de la organización)` : 'Último ciclo de métricas: ninguno anotado',
          pendingItems ? `Controles no evaluables por falta de parámetros: ${pendingItems.length} (motor de Power ENS)` : '',
          reinforcements && annualIndicators.length
            ? `Incidentes de los últimos 365 días: ${annualIndicators.join('; ')} (registro de incidentes de op.exp.7)`
            : '',
          reinforcements
            ? `Recursos consumidos: ${r2?.attested ? 'dato declarado del último ciclo, acreditado documentalmente' : 'sin acreditar'} (registro de ciclos de la organización)`
            : '',
        ]
      : [],
  );

  const field9 = field(
    'op.mon.2.campo9',
    'Validación del ciclo de métricas',
    evidenceStatus('EV-02'),
    series.length ? `Último ciclo: ${series[0]}.` : 'Sin ciclos anotados.',
    ['EV-02'],
    [variables.get('periodicidad_metricas')?.description || '', ...evidenceObservations('EV-02')],
  );

  const field10 = field(
    'op.mon.2.campo10',
    'Puntuación de cumplimiento op.mon.2',
    asStatus(result?.status),
    typeof result?.score === 'number' ? `${result.score} %` : formatValue(result?.status),
    ALL_EVIDENCES,
    [
      ...(result?.requirements || []).map(requirement =>
        requirement.status === 'NO_APLICA'
          ? `${requirement.id}: no aplica`
          : `${requirement.id}: ${statusLabel(requirement.status)}${requirement.attested ? ', acreditado documentalmente (dato declarado, la herramienta no lo verifica)' : requirement.evidenced === false ? ', no demostrado' : ''}`,
      ),
    ],
  );

  return {
    controlId: CONTROL,
    status: asStatus(result?.status),
    score: typeof result?.score === 'number' ? result.score : null,
    coverage: typeof result?.coverage === 'number' ? result.coverage : null,
    level: result?.level || '',
    evaluatedAt: result?.evaluatedAt,
    fields: [field1, field2, field3, field4, field5, field6, field7, field8, field9, field10],
  };
};
