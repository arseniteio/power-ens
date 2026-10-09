// Del fichero de tipos, nunca del barrel `../core`: `import type` se borra al
// compilar y no añade aristas al grafo de módulos (TDZ de Settings).
import type { ENSComplianceResult } from '../core/evaluation/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../configuration/services/parameter-value-validator';
// Las mismas gramáticas que la policy: P-01 y P-06 se leen igual en el juicio y
// en el informe, o el informe presentaría contra un objetivo que la policy no
// reconoce.
import {
  parseDeclaracionAplicabilidad,
  parseObjetivos,
} from '../core/policy-runtime/policies/op-mon-2.policy';
import type { ObjetivoDeMetrica } from '../core/policy-runtime/policies/op-mon-2.policy';

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

const cifra = (n: number): string => String(Math.round(n * 10) / 10);

const MARCOS: Record<string, string> = {
  org: 'Marco organizativo',
  op: 'Marco operacional',
  mp: 'Medidas de protección',
};

// Las filas de una tabla de la pantalla en sus columnas, por posición.
const tabla = (
  result: ENSComplianceResult | undefined,
  id: string,
  columnas: string[],
): Record<string, string>[] => {
  const valor = (result?.parameters || []).find(p => p.id === id)?.value;

  if (valor === undefined) {
    return [];
  }

  return toParameterTableRows(valor as Parameters<typeof toParameterTableRows>[0])
    .map(fila => toTableRowCells(fila))
    .filter(celdas => celdas.some(Boolean))
    .map(celdas => {
      const fila: Record<string, string> = {};

      columnas.forEach((columna, i) => {
        fila[columna] = (celdas[i] || '').trim();
      });

      return fila;
    });
};

const desviacion = (valor: number, o: ObjetivoDeMetrica | undefined): string => {
  if (!o) {
    return 'sin objetivo en P-06';
  }

  const objetivo = `objetivo ${o.sentido === 'minimo' ? '≥' : '≤'} ${cifra(o.objetivo)}${o.unidad ? ` ${o.unidad}` : ''}`;
  const fuera = o.sentido === 'minimo' ? valor < o.umbral : valor > o.umbral;
  const bajoObjetivo = o.sentido === 'minimo' ? valor < o.objetivo : valor > o.objetivo;

  return fuera
    ? `${objetivo}: DESVIACIÓN`
    : bajoObjetivo
    ? `${objetivo}: dentro de la tolerancia`
    : `${objetivo}: alcanzado`;
};

interface Implantacion {
  global?: number;
  medidas: number;
  evaluadas: number;
  lineas: string[];
}

// EV-01 · el grado de implantación de cada medida aplicable de P-01, con el
// resultado que el motor da a cada control. Las medidas que ENSFácil no evalúa
// se dicen y no entran en la cifra: no se inventa su puntuación.
const implantacion = (
  aplicables: string[],
  panorama: ENSComplianceResult[],
): Implantacion => {
  const porControl = new Map(
    panorama
      .filter(r => r.control.id !== CONTROL)
      .map(r => [r.control.id, r]),
  );
  const puntuadas: { medida: string; score: number }[] = [];
  const lineas: string[] = [];

  aplicables.forEach(medida => {
    const r = porControl.get(medida);

    if (!r) {
      lineas.push(`${medida}: sin evaluar en ENSFácil (no cuenta en la cifra)`);
    } else if (r.status === 'NO_APLICA') {
      lineas.push(`${medida}: P-01 la declara aplicable y el motor no la exige en esta categoría (revisa P-01)`);
    } else if (typeof r.score !== 'number') {
      lineas.push(`${medida}: ${r.status}, sin puntuación`);
    } else {
      puntuadas.push({ medida, score: r.score });
      lineas.push(`${medida}: ${cifra(r.score)} % (${r.status})`);
    }
  });

  const porMarco = Object.entries(MARCOS)
    .map(([prefijo, nombre]) => {
      const suyas = puntuadas.filter(p => p.medida.split('.')[0] === prefijo);

      return suyas.length
        ? `${nombre}: ${cifra(suyas.reduce((a, p) => a + p.score, 0) / suyas.length)} % (${suyas.length} medidas)`
        : '';
    })
    .filter(Boolean);

  return {
    global: puntuadas.length
      ? puntuadas.reduce((a, p) => a + p.score, 0) / puntuadas.length
      : undefined,
    medidas: aplicables.length,
    evaluadas: puntuadas.length,
    lineas: [...porMarco, ...lineas],
  };
};

// EV-05 · los controles con requisitos sin evaluar por falta de configuración,
// con los parámetros que faltan.
const grises = (panorama: ENSComplianceResult[]): string[] =>
  panorama
    .filter(r => r.control.id !== CONTROL)
    .map(r => {
      const parametros = new Set<string>(r.missingParameters || []);

      (r.nonConformities || [])
        .filter(nc => nc.origin === 'NO_EVIDENCIADA' && nc.cause === 'CONFIGURATION')
        .forEach(nc => (nc.parameterIds || []).forEach(p => parametros.add(p)));

      const sinParametro = (r.nonConformities || []).some(
        nc => nc.origin === 'NO_EVIDENCIADA' && nc.cause === 'CONFIGURATION' && !(nc.parameterIds || []).length,
      );

      return parametros.size || sinParametro
        ? `${r.control.id}: ${parametros.size ? Array.from(parametros).sort().join(', ') : 'configuración incompleta'}`
        : '';
    })
    .filter(Boolean);

/**
 * Modelo de informe de op.mon.2 (Sistema de métricas).
 *
 * Es el CUADRO DE MANDO de ENSFácil y la antesala del informe anual del art.
 * 32: no describe un estado del sistema, recopila el de todos los controles.
 * Por eso, además del resultado de op.mon.2, recibe el `panorama`: el resultado
 * de TODOS los controles, que la pantalla de Informes calcula con los hechos de
 * todos (la policy de un control no ve los demás).
 *
 *   - Grado de implantación (EV-01), controles no evaluables (EV-05) y datos
 *     del art. 32 (EV-07) son salida del motor: salen SIN VEREDICTO (NO_APLICA)
 *     y, sin panorama, SIN_DATOS (spec 2026-10-09 §2.6, pregunta 2).
 *   - La serie de ciclos, los indicadores de incidentes y los recursos llegan
 *     en las variables de la policy (`policies/op-mon-2.policy.ts`).
 *   - R2 es DATO DECLARADO y lo dice: acreditado documentalmente, no medido.
 *   - Cada cifra conserva su origen, porque el informe se reporta fuera.
 */
export const buildOpMon2ReportModel = (
  result: ENSComplianceResult | undefined,
  panorama?: ENSComplianceResult[],
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

  const lista = (nombre: string): string[] => {
    const valor = variables.get(nombre)?.value;

    return Array.isArray(valor) ? valor.map(String) : [];
  };

  const evidenceStatus = (evidenceId: string): OpMon2ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();
  const refuerzos = level === 'MEDIO' || level === 'ALTO';

  // P-01 y P-06 con las gramáticas de la policy.
  const declaracion = parseDeclaracionAplicabilidad(
    tabla(result, 'P-01', ['medida', 'aplicable', 'nivel', 'refuerzos_exigibles']),
  );
  const { objetivos } = parseObjetivos(
    tabla(result, 'P-06', ['metrica', 'objetivo', 'tolerancia']),
  );

  const grado = panorama && declaracion.aplicables.length
    ? implantacion(declaracion.aplicables, panorama)
    : undefined;
  const pendientes = panorama ? grises(panorama) : undefined;
  const serie = lista('serie_ciclos_metricas');
  const cobertura = variables.get('cobertura_monitorizacion');
  const indicadoresPeriodo = lista('indicadores_incidentes_periodo');
  const indicadoresAnual = lista('indicadores_incidentes_anual');
  const r2 = requirements.get('op.mon.2.r2.1');

  // Estado del control (semáforo ENS)
  const campo1 = field(
    'op.mon.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ALL_EVIDENCES,
    (result?.requirements || [])
      .filter(requirement => requirement.status !== 'NO_APLICA')
      .map(requirement => `${requirement.id} ${requirement.title}: ${requirement.status}${requirement.attested ? ' (acreditado documentalmente)' : ''}`),
  );

  // Grado de implantación de las medidas  ·  fuente: Motor ENSFácil (EV-01)
  const campo2 = field(
    'op.mon.2.campo2',
    'Grado de implantación de las medidas',
    grado ? 'NO_APLICA' : 'SIN_DATOS',
    !panorama
      ? 'Sin el resultado de todos los controles: se calcula en la pantalla de Informes, con los hechos de todos.'
      : !declaracion.aplicables.length
      ? 'Sin Declaración de Aplicabilidad (P-01): el grado de implantación no tiene base.'
      : grado && grado.global !== undefined
      ? `${cifra(grado.global)} % global sobre ${grado.evaluadas} de ${grado.medidas} medidas aplicables de P-01 evaluadas por ENSFácil (${desviacion(grado.global, objetivos.get('implantacion_global'))}). Dato del informe, sin veredicto.`
      : `Ninguna de las ${declaracion.aplicables.length} medidas aplicables de P-01 tiene puntuación en ENSFácil.`,
    ['EV-01'],
    [...(grado ? grado.lineas : []), ...evidenceObservations('EV-01')],
  );

  // Evolución del grado de implantación  ·  fuente: registro de ciclos (EV-02)
  const campo3 = field(
    'op.mon.2.campo3',
    'Evolución del grado de implantación',
    evidenceStatus('EV-02'),
    serie.length
      ? `${serie.length} ciclo(s) en el registro de ciclos de métricas; el último: ${serie[0]}.`
      : 'Sin ciclos de métricas anotados en el registro de la organización.',
    ['EV-02'],
    [...serie, ...evidenceObservations('EV-02')],
  );

  // Fiabilidad de la medición  ·  fuente: global.db y latidos (EV-04)
  const campo4 = field(
    'op.mon.2.campo4',
    'Fiabilidad de la medición',
    evidenceStatus('EV-04'),
    cobertura && typeof cobertura.value === 'number'
      ? `Cobertura de la monitorización ${cifra(cobertura.value)} %: ${cobertura.description} (${desviacion(cobertura.value, objetivos.get('cobertura_monitorizacion'))}).`
      : 'Sin cobertura medida.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Controles no evaluables por falta de parámetros  ·  fuente: Motor ENSFácil (EV-05)
  const campo5 = field(
    'op.mon.2.campo5',
    'Controles no evaluables por falta de parámetros',
    pendientes ? 'NO_APLICA' : 'SIN_DATOS',
    !pendientes
      ? 'Sin el resultado de todos los controles: se calcula en la pantalla de Informes, con los hechos de todos.'
      : `${pendientes.length} control(es) con requisitos sin evaluar por falta de configuración (${desviacion(pendientes.length, objetivos.get('controles_no_evaluables'))}). Dato del informe, sin veredicto: es la lista de acciones pendientes del cliente.`,
    ['EV-05'],
    [...(pendientes || []), ...evidenceObservations('EV-05')],
  );

  // Métricas de gestión de incidentes (R1)  ·  fuente: registro de incidentes de op.exp.7 (EV-03)
  const campo6 = field(
    'op.mon.2.campo6',
    'Métricas de gestión de incidentes (R1)',
    refuerzos ? evidenceStatus('EV-03') : 'NO_APLICA',
    !refuerzos
      ? 'R1 solo se exige en categoría MEDIA y ALTA.'
      : indicadoresPeriodo.length
      ? `Indicadores del periodo de P-02, calculados con el registro de incidentes de op.exp.7: ${indicadoresPeriodo.join('; ')}.`
      : 'Sin indicadores: el registro de incidentes no se ha podido leer o P-02 no está configurada.',
    ['EV-03'],
    [
      ...(indicadoresAnual.length ? [`Últimos 365 días (art. 32): ${indicadoresAnual.join('; ')}`] : []),
      ...evidenceObservations('EV-03'),
    ],
  );

  // Recursos consumidos por el sistema de seguridad (R2)  ·  fuente: registro de ciclos (EV-06)
  const campo7 = field(
    'op.mon.2.campo7',
    'Recursos consumidos por el sistema de seguridad (R2)',
    refuerzos ? asStatus(r2?.status) : 'NO_APLICA',
    !refuerzos
      ? 'R2 solo se exige en categoría MEDIA y ALTA.'
      : r2?.attested
      ? 'DATO DECLARADO, acreditado documentalmente: horas y presupuesto del último ciclo, anotados y validados por la organización. ENSFácil lo registra, no lo verifica.'
      : 'Sin acreditar: el último ciclo en plazo no trae horas y presupuesto validados por un responsable de P-05.',
    ['EV-06'],
    [...(r2?.observations || []), ...evidenceObservations('EV-06')],
  );

  // Datos para el informe anual del artículo 32  ·  fuente: Motor ENSFácil (EV-07)
  const campo8 = field(
    'op.mon.2.campo8',
    'Datos para el informe anual del artículo 32',
    panorama ? 'NO_APLICA' : 'SIN_DATOS',
    panorama
      ? 'Conjunto consolidado con el origen de cada cifra. Dato del informe, sin veredicto.'
      : 'Sin el resultado de todos los controles: se calcula en la pantalla de Informes.',
    ['EV-07'],
    panorama
      ? [
          grado && grado.global !== undefined
            ? `Grado de implantación: ${cifra(grado.global)} % (motor de ENSFácil sobre P-01, ${grado.evaluadas} de ${grado.medidas} medidas evaluadas)`
            : 'Grado de implantación: sin base (P-01)',
          cobertura && typeof cobertura.value === 'number'
            ? `Fiabilidad de la medición: ${cifra(cobertura.value)} % (global.db y latidos de los recolectores en el manager)`
            : 'Fiabilidad de la medición: sin medir',
          serie.length ? `Último ciclo de métricas: ${serie[0]} (registro de ciclos de la organización)` : 'Último ciclo de métricas: ninguno anotado',
          pendientes ? `Controles no evaluables por falta de parámetros: ${pendientes.length} (motor de ENSFácil)` : '',
          refuerzos && indicadoresAnual.length
            ? `Incidentes de los últimos 365 días: ${indicadoresAnual.join('; ')} (registro de incidentes de op.exp.7)`
            : '',
          refuerzos
            ? `Recursos consumidos: ${r2?.attested ? 'dato declarado del último ciclo, acreditado documentalmente' : 'sin acreditar'} (registro de ciclos de la organización)`
            : '',
        ]
      : [],
  );

  // Validación del ciclo de métricas  ·  fuente: registro de ciclos (EV-02)
  const campo9 = field(
    'op.mon.2.campo9',
    'Validación del ciclo de métricas',
    evidenceStatus('EV-02'),
    serie.length ? `Último ciclo: ${serie[0]}.` : 'Sin ciclos anotados.',
    ['EV-02'],
    [variables.get('periodicidad_metricas')?.description || '', ...evidenceObservations('EV-02')],
  );

  // Puntuación de cumplimiento op.mon.2  ·  fuente: Motor ENSFácil
  const campo10 = field(
    'op.mon.2.campo10',
    'Puntuación de cumplimiento op.mon.2',
    asStatus(result?.status),
    typeof result?.score === 'number' ? `${result.score} %` : formatValue(result?.status),
    ALL_EVIDENCES,
    [
      ...(result?.requirements || []).map(requirement =>
        requirement.status === 'NO_APLICA'
          ? `${requirement.id}: no aplica`
          : `${requirement.id}: ${requirement.status}${requirement.attested ? ', acreditado documentalmente (dato declarado, la herramienta no lo verifica)' : requirement.evidenced === false ? ', no demostrado' : ''}`,
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
    fields: [campo1, campo2, campo3, campo4, campo5, campo6, campo7, campo8, campo9, campo10],
  };
};
