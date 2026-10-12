// op.mon.2 · Sistema de métricas
//
// Por qué este control tiene policy propia. Es un METACONTROL: su materia prima
// es el resultado de los demás controles, y la policy de un control solo ve
// sus eventos y su configuración (`ENSPolicyContext`). El diseño (spec
// 2026-10-09 §2) separa:
//
//   - lo que es SALIDA DEL MOTOR —el grado de implantación de todos los
//     controles (EV-01), los grises (EV-05) y los datos del informe del art. 32
//     (EV-07)—, que va al modelo de informe SIN veredicto (spec §2.6,
//     pregunta 2). Aquí salen NO_APLICA con el motivo «dato del informe»;
//   - lo que deja HUELLA y se puede fechar, medido en el manager (agent.id 000)
//     con ficheros locales y sin credenciales, que es lo que decide.
//
// Qué decide cada requisito (spec §2.3):
//
//   op.mon.2.1     EV-02: el último ciclo de métricas validado por un
//                  responsable de P-05 está dentro de la periodicidad de P-02
//                  (que aquí se convierte en plazo), con la Declaración de
//                  Aplicabilidad (P-01) configurada; y EV-04: la cobertura de
//                  la monitorización del alcance ENS (sistemas con el agente
//                  conectado y todos sus recolectores al día) alcanza el
//                  objetivo de P-06.
//   op.mon.2.r1.1  EV-03: cada indicador de P-03 se puede calcular con el
//                  registro de incidentes de op.exp.7 en el periodo, y el
//                  último ciclo de métricas está en plazo. Con cero incidentes
//                  cumple si el registro existe y el ciclo está en plazo
//                  (decisión del responsable 7): R1 pide recopilar datos, y
//                  «cero incidentes» es un dato. La invariante de op.exp.7 («no
//                  hubo incidentes no demuestra lo que se hace ante uno») sigue
//                  valiendo allí, no aquí.
//   op.mon.2.r2.1  EV-06: el último ciclo, en plazo, anota horas internas,
//                  horas externas y presupuesto, con P-04 diciendo qué entra en
//                  cada columna, y lo valida un responsable de recursos de
//                  P-05. Es DATO DECLARADO: el CUMPLE sale marcado `attested`
//                  («acreditado documentalmente»), nunca como medida.
//
// Los dos registros son de la organización y el recolector solo los lee:
// `/etc/ensfacil/metrics-cycle-register.tsv` (nuevo) y
// `/etc/ensfacil/incident-register.tsv` (el de op.exp.7, mismo formato de 13
// columnas). Sin registro, NO_EVALUABLE con causa CONFIGURATION, nunca un
// CUMPLE por vacío; con el registro vacío se juzga.
//
// Invariantes, las de `policy-kit.ts`:
//   - el recolector emite instantes, no edades: toda antigüedad se mide aquí,
//     contra el instante de la lectura (`momento` del hecho);
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo y causa;
//   - lo que el recolector declara que no pudo medir se combina con lo medido
//     sin taparlo;
//   - la policy nunca inventa política: el plazo es el periodo de P-02 más el
//     margen que declara la organización, y el umbral, el de P-06.
//
// Solo se emiten decisiones de los requisitos que aplican al nivel (la
// categoría del sistema).
//
// Tipos y utilidades desde el fichero, nunca desde un barrel: por ahí vuelve el
// ciclo del TDZ de Settings.
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import { toParameterListItems } from '../../../configuration/services/parameter-value-validator';
import { ENS_SCOPE_GROUP } from '../../scope/engine';
import { STALE_COLLECTOR_MAX_AGE_HOURS } from '../../evidence/stale-collector';
// Por la ruta del fichero, nunca por el barrel (TDZ de Settings).
import {
  HORA,
  DIA,
  MISMA_PASADA,
  TOLERANCIA_FUTURO,
  cumple,
  noCumple,
  sinMedir,
  causaComun,
  peor,
  combina,
  campo,
  numero,
  instante,
  momento,
  lista,
  dias,
  iso,
  sinTildes,
  vacio,
  iguales,
  parametro,
  etiqueta,
  filas,
  faltaParametro,
  lectorDeHechos,
  decisorDe,
} from './policy-kit';
import type { ENSTipoDeRegla, Medida } from './policy-kit';

const CONTROL = 'op.mon.2';
const POLICY = 'policy.op.mon.2';

// Todos los hechos de op.mon.2 son estados lentos: el recolector pasa cada 6 h
// y reemite el estado entero. Frescura de 26 h, la del kit.
const { hechos, estadoVigente, degradacion, sinHechos, conDegradacion } = lectorDeHechos(CONTROL, {
  recolector: 'el recolector de op.mon.2 del manager',
});

// EV-06 (R2) lee el MISMO registro de ciclos que EV-02, y el recolector declara
// los huecos de esa lectura con EV-02: con `log_alert_level` por encima de 3,
// por ejemplo, degrada EV-02, EV-03 y EV-04 por CONFIGURATION y sus hechos no
// llegan. EV-06 hereda esa degradación; si no, R2 saldría sin medir por
// RECOGIDA un hueco que es de CONFIGURACIÓN. La suya propia, si la declara,
// manda.
const HEREDA_DEGRADACION: Record<string, string> = { 'EV-06': 'EV-02' };

const decide = decisorDe(POLICY);

const MANAGER = '000';

const REGISTRO_CICLOS = '/etc/ensfacil/metrics-cycle-register.tsv';
const REGISTRO_INCIDENTES = '/etc/ensfacil/incident-register.tsv';

// Un recolector está al día si su último latido es, como mucho, tan viejo como
// el que el motor admite antes de dar el control por parado en esa máquina
// (`stale-collector.ts`). Medido contra el instante en que op.mon.2 leyó los
// latidos, no contra el reloj de la evaluación.
const LATIDO_VIGENTE_MS = STALE_COLLECTOR_MAX_AGE_HOURS * HORA;

// La duración de cada periodicidad de P-02, en días: el plazo de un ciclo es
// esto más el margen que declara la organización.
const PERIODOS: Record<string, number> = {
  mensual: 31,
  trimestral: 92,
  semestral: 184,
  anual: 366,
};

// La ventana del informe anual del art. 32.
const ANUAL_DIAS = 365;

const esMedida = (x: unknown): x is Medida =>
  typeof x === 'object' && x !== null && typeof (x as Medida).estado === 'string';

// Para comparar nombres y valores declarados: sin mayúsculas, sin tildes y con
// los espacios plegados.
const plegado = (texto: string): string => sinTildes(texto).replace(/\s+/g, ' ').trim();

const idDeAgente = (texto: string): string | undefined =>
  /^\d+$/.test(texto.trim()) ? texto.trim().padStart(3, '0') : undefined;

// El ID del agente de un hecho, normalizado: «24» y «024» son el mismo agente.
const idDelHecho = (e: ENSNormalizedEvent): string =>
  idDeAgente(campo(e, 'agente_id')) || campo(e, 'agente_id');

// Un enlace o referencia de la plantilla `.example`: no acredita nada.
const esEjemplo = (texto: string): boolean => /ejemplo\.invalido|example\.invalid/i.test(texto);

const cifra = (n: number): string => String(Math.round(n * 10) / 10);

const fecha = (t: number): string => iso(t).slice(0, 10);

// --- los registros de la organización ----------------------------------------
//
// Cada pasada emite primero la LECTURA del registro (si existe, si se puede
// leer, si su cabecera es la exigida, cuántas filas valen y cuántas emite) y
// después una fila por hecho. La lectura ancla la pasada: solo cuentan las
// filas emitidas junto a ella, y si llegan menos de las que dice haber
// emitido, falta algo y no se afirma nada.

interface Registro {
  lectura: ENSNormalizedEvent;
  t: number;
  filas: ENSNormalizedEvent[];
  validas: number;
  descartadas: number;
}

const registro = (
  context: ENSPolicyContext,
  ahora: number,
  tipoLectura: string,
  tipoFila: string,
  evidencia: string,
  nombre: string,
  fichero: string
): Registro | Medida => {
  const { vigentes, ultimo } = estadoVigente(context, tipoLectura, ahora);

  if (!vigentes.length || ultimo === undefined) {
    const heredada = HEREDA_DEGRADACION[evidencia];

    return (
      degradacion(context, evidencia, ahora) ||
      (heredada ? degradacion(context, heredada, ahora) : undefined) ||
      sinHechos(context, evidencia, ahora, ultimo, `hecho de lectura del ${nombre}`)
    );
  }

  const lectura = vigentes[vigentes.length - 1];
  const t = momento(lectura);
  const ruta = campo(lectura, 'fichero') || fichero;
  const presente = campo(lectura, 'presente');

  if (presente === 'no') {
    return sinMedir(
      `No existe el ${nombre} (${ruta}): la organización no lo ha creado. Sin él no hay nada que juzgar, y un registro ausente no es un registro vacío. La plantilla con la cabecera exacta está junto a él, con extensión .example.`,
      'CONFIGURATION'
    );
  }

  if (presente !== 'si') {
    return sinMedir(`La lectura del ${nombre} de ${iso(t)} no dice si el fichero existe (presente=${presente || 'vacío'}).`, 'COLLECTION');
  }

  if (campo(lectura, 'legible') !== 'si') {
    return sinMedir(`El ${nombre} (${ruta}) existe, pero el recolector no lo ha podido leer en la pasada de ${iso(t)}.`, 'COLLECTION');
  }

  if (campo(lectura, 'formato') !== 'ok') {
    return sinMedir(
      `La primera línea del ${nombre} (${ruta}) no es la cabecera exigida (${campo(lectura, 'formato') || 'formato desconocido'}): no se interpreta ninguna fila. La cabecera exacta está en la plantilla .example.`,
      'CONFIGURATION'
    );
  }

  const validas = numero(campo(lectura, 'filas_validas')) ?? 0;
  const descartadas = numero(campo(lectura, 'filas_descartadas')) ?? 0;
  const emitidas = numero(campo(lectura, 'filas_emitidas')) ?? validas;

  // Las filas de ESTA pasada, una por línea del fichero (si la pasada se
  // repitió, cuenta la última copia).
  const porLinea = new Map<string, ENSNormalizedEvent>();

  hechos(context, tipoFila)
    .filter(e => momento(e) >= t - MISMA_PASADA && momento(e) <= t + HORA)
    .sort((a, b) => momento(a) - momento(b))
    .forEach(e => porLinea.set(campo(e, 'linea') || String(e.id), e));

  const filasDeLaPasada = Array.from(porLinea.values());

  if (filasDeLaPasada.length < emitidas) {
    return sinMedir(
      `De las ${emitidas} filas del ${nombre} que el recolector emitió en la pasada de ${iso(t)} han llegado ${filasDeLaPasada.length}: con filas perdidas no se puede afirmar nada del registro.`,
      'COLLECTION'
    );
  }

  return { lectura, t, filas: filasDeLaPasada, validas, descartadas };
};

const notaDescartadas = (reg: Registro, nombre: string): string =>
  reg.descartadas > 0
    ? ` ${reg.descartadas} fila(s) del ${nombre} se descartaron por no tener el formato exigido (ver los avisos del recolector, regla 111398).`
    : '';

// --- los ciclos de métricas -----------------------------------------------------

interface Ciclo {
  periodo: string;
  fecha: number;
  implantacion?: number;
  horasInternas?: number;
  horasExternas?: number;
  presupuesto?: number;
  validadoPor: string;
  referencia: string;
  linea: string;
}

const LEE_CICLOS = (context: ENSPolicyContext, ahora: number, evidencia: string): Registro | Medida =>
  registro(context, ahora, 'metrics_register_read', 'metrics_cycle_recorded', evidencia, 'registro de ciclos de métricas', REGISTRO_CICLOS);

// Los ciclos que cuentan, del más antiguo al más reciente, y lo que se dejó
// fuera (ejemplos de la plantilla, fechados en el futuro, ilegibles).
const ciclosDe = (reg: Registro): { ciclos: Ciclo[]; nota: string } => {
  const ciclos: Ciclo[] = [];
  const ejemplos: string[] = [];
  const futuros: string[] = [];
  const ilegibles: string[] = [];

  const cantidad = (e: ENSNormalizedEvent, nombre: string): number | undefined => {
    const texto = campo(e, nombre).replace(/%$/, '').trim();

    return vacio(texto) ? undefined : numero(texto);
  };

  reg.filas.forEach(e => {
    const linea = campo(e, 'linea') || '?';
    const t = instante(campo(e, 'fecha_consolidacion'));
    const periodo = campo(e, 'periodo') || '?';

    if (t === undefined) {
      ilegibles.push(`línea ${linea}`);

      return;
    }

    if (esEjemplo(campo(e, 'referencia'))) {
      ejemplos.push(`${periodo} (línea ${linea})`);

      return;
    }

    if (t > reg.t + TOLERANCIA_FUTURO) {
      futuros.push(`${periodo} del ${fecha(t)}`);

      return;
    }

    ciclos.push({
      periodo,
      fecha: t,
      implantacion: cantidad(e, 'implantacion_global'),
      horasInternas: cantidad(e, 'horas_internas'),
      horasExternas: cantidad(e, 'horas_externas'),
      presupuesto: cantidad(e, 'presupuesto_ejecutado'),
      validadoPor: campo(e, 'validado_por'),
      referencia: campo(e, 'referencia'),
      linea,
    });
  });

  ciclos.sort((a, b) => a.fecha - b.fecha);

  const nota = [
    ejemplos.length ? `No cuentan los ciclos con la referencia de ejemplo de la plantilla (EJEMPLO.invalido): ${lista(ejemplos)}.` : '',
    futuros.length ? `No cuentan los ciclos fechados en el futuro: ${lista(futuros)}.` : '',
    ilegibles.length ? `Sin fecha de consolidación legible: ${lista(ilegibles)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return { ciclos, nota: nota ? ` ${nota}` : '' };
};

const describeCiclo = (c: Ciclo): string =>
  `${c.periodo} (consolidado el ${fecha(c.fecha)}${c.implantacion !== undefined ? `, implantación ${cifra(c.implantacion)} %` : ''}${
    vacio(c.validadoPor) ? ', sin validar' : `, validado por ${c.validadoPor}`
  })`;

// --- P-02 · la periodicidad, convertida en plazo ------------------------------

interface Periodicidad {
  nombre: string;
  dias: number;
  margen: number;
  plazoDias: number;
  cierre?: string;
}

const MES_DIA = /^(\d{2})-(\d{2})$/;

const periodicidad = (context: ENSPolicyContext): Periodicidad | Medida => {
  const declaradas = filas(context, 'P-02');

  if (!declaradas) {
    return faltaParametro(context, 'P-02', 'cada cuánto se tiene que consolidar un ciclo de métricas');
  }

  if (declaradas.length > 1) {
    return sinMedir(`${etiqueta(context, 'P-02')} declara ${declaradas.length} periodicidades: se declara una sola fila.`, 'CONFIGURATION');
  }

  const fila = declaradas[0];
  const nombre = plegado(fila.periodicidad || '');
  const problemas: string[] = [];

  if (!PERIODOS[nombre]) {
    problemas.push(`la periodicidad «${fila.periodicidad || ''}» no es mensual, trimestral, semestral ni anual`);
  }

  const margenTexto = (fila.margen_dias || '').trim();
  const margen = vacio(margenTexto) ? 0 : /^\d+$/.test(margenTexto) ? Number(margenTexto) : undefined;

  if (margen === undefined) {
    problemas.push(`el margen «${margenTexto}» no es un número entero de días`);
  }

  const cierreTexto = (fila.cierre_anual || '').trim();
  let cierre: string | undefined;

  if (!vacio(cierreTexto)) {
    const m = MES_DIA.exec(cierreTexto);
    const mes = m ? Number(m[1]) : 0;
    const dia = m ? Number(m[2]) : 0;
    const maximo = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] || 0;

    if (!m || dia < 1 || dia > maximo) {
      problemas.push(`el cierre anual «${cierreTexto}» no es una fecha MM-DD`);
    } else {
      cierre = cierreTexto;
    }
  }

  if (problemas.length || margen === undefined) {
    return sinMedir(`${etiqueta(context, 'P-02')}, fila «${[fila.periodicidad, fila.margen_dias, fila.cierre_anual].filter(Boolean).join(' | ')}»: ${problemas.join('; ')}.`, 'CONFIGURATION');
  }

  return { nombre, dias: PERIODOS[nombre], margen, plazoDias: PERIODOS[nombre] + margen, cierre };
};

const describePlazo = (p: Periodicidad): string =>
  `P-02 ${p.nombre}: ${p.dias} días${p.margen ? ` + ${p.margen} de margen` : ''} = ${p.plazoDias}`;

// --- P-05 · quién valida --------------------------------------------------------

type Ambito = 'metricas' | 'recursos';

const validadores = (context: ENSPolicyContext, ambito: Ambito): Set<string> | Medida => {
  const declaradas = filas(context, 'P-05');
  const que = ambito === 'metricas' ? 'los ciclos de métricas' : 'los datos de recursos';

  if (!declaradas) {
    return faltaParametro(context, 'P-05', `quién tiene que validar ${que}`);
  }

  const malas = declaradas.filter(f => !['', 'metricas', 'recursos', 'ambos'].includes(plegado(f.ambito || '')));

  if (malas.length) {
    return sinMedir(
      `${etiqueta(context, 'P-05')}: ámbito que no es metricas, recursos ni ambos en ${lista(malas.map(f => `«${f.responsable} | ${f.cargo || ''} | ${f.ambito}»`))}.`,
      'CONFIGURATION'
    );
  }

  const suyas = declaradas.filter(f => ['', ambito, 'ambos'].includes(plegado(f.ambito || '')));
  const nombres = new Set<string>();

  suyas.forEach(f => {
    [f.responsable, f.cargo].filter(x => !vacio((x || '').trim())).forEach(x => nombres.add(plegado(x)));
  });

  if (!nombres.size) {
    return sinMedir(`${etiqueta(context, 'P-05')} no designa a nadie para validar ${que} (ámbito ${ambito} o ambos).`, 'CONFIGURATION');
  }

  return nombres;
};

const designados = (context: ENSPolicyContext, ambito: Ambito): string =>
  (filas(context, 'P-05') || [])
    .filter(f => ['', ambito, 'ambos'].includes(plegado(f.ambito || '')))
    .map(f => (f.cargo ? `${f.responsable} (${f.cargo})` : f.responsable))
    .join(', ');

// --- P-01 · la Declaración de Aplicabilidad ---------------------------------------

// Un identificador de medida del ENS: org.1, op.acc.1, mp.info.6.
const MEDIDA_ENS = /^(org\.\d+|(op|mp)\.[a-z]+\.\d+)$/;

export const parseDeclaracionAplicabilidad = (
  declaradas: Record<string, string>[]
): { aplicables: string[]; noAplicables: string[]; problemas: string[] } => {
  const aplicables: string[] = [];
  const noAplicables: string[] = [];
  const problemas: string[] = [];

  declaradas.forEach(f => {
    const medida = (f.medida || '').trim().toLowerCase();
    const aplica = plegado(f.aplicable || '');

    if (!MEDIDA_ENS.test(medida)) {
      problemas.push(`«${f.medida}» no es el identificador de una medida del ENS (op.acc.1, mp.info.6, org.1)`);

      return;
    }

    if (aplica === 'si') {
      aplicables.push(medida);
    } else if (aplica === 'no') {
      noAplicables.push(medida);
    } else {
      problemas.push(`${medida}: «${f.aplicable || ''}» no dice si aplica (sí/no)`);
    }
  });

  return { aplicables, noAplicables, problemas };
};

const declaracion = (context: ENSPolicyContext): Medida | undefined => {
  const declaradas = filas(context, 'P-01');

  if (!declaradas) {
    return faltaParametro(context, 'P-01', 'el grado de implantación (no hay relación de medidas aplicables contra la que calcularlo)');
  }

  const { aplicables, problemas } = parseDeclaracionAplicabilidad(declaradas);

  if (problemas.length) {
    return sinMedir(`${etiqueta(context, 'P-01')} tiene filas que no se pueden interpretar: ${lista(problemas)}.`, 'CONFIGURATION');
  }

  if (!aplicables.length) {
    return sinMedir(`${etiqueta(context, 'P-01')} no declara ninguna medida aplicable: el grado de implantación no tiene base.`, 'CONFIGURATION');
  }

  return undefined;
};

// --- P-06 · los objetivos ---------------------------------------------------------

type Sentido = 'minimo' | 'maximo';

const METRICAS: Record<string, { sentido: Sentido; unidad: string; porcentaje?: boolean }> = {
  cobertura_monitorizacion: { sentido: 'minimo', unidad: '%', porcentaje: true },
  implantacion_global: { sentido: 'minimo', unidad: '%', porcentaje: true },
  controles_no_evaluables: { sentido: 'maximo', unidad: '' },
  tiempo_medio_contencion: { sentido: 'maximo', unidad: 'h' },
  tiempo_medio_resolucion: { sentido: 'maximo', unidad: 'h' },
};

export interface ObjetivoDeMetrica {
  metrica: string;
  objetivo: number;
  tolerancia: number;
  // El valor a partir del cual la métrica deja de ser aceptable.
  umbral: number;
  sentido: Sentido;
  unidad: string;
}

// Las filas de P-06 con su gramática: métrica del vocabulario, objetivo
// numérico (con su unidad opcional) y tolerancia numérica o vacía.
export const parseObjetivos = (
  declaradas: Record<string, string>[]
): { objetivos: Map<string, ObjetivoDeMetrica>; problemas: string[] } => {
  const objetivos = new Map<string, ObjetivoDeMetrica>();
  const problemas: string[] = [];

  const cantidad = (texto: string): number | undefined =>
    numero(texto.trim().replace(/\s*(%|h)$/i, ''));

  declaradas.forEach(f => {
    const metrica = plegado(f.metrica || '');
    const definicion = METRICAS[metrica];
    const describe = `«${[f.metrica, f.objetivo, f.tolerancia].filter(x => x !== undefined && x !== '').join(' | ')}»`;

    if (!definicion) {
      problemas.push(`${describe}: la métrica no es ninguna de ${Object.keys(METRICAS).join(', ')}`);

      return;
    }

    if (objetivos.has(metrica)) {
      problemas.push(`${describe}: ${metrica} está declarada dos veces`);

      return;
    }

    const objetivo = cantidad(f.objetivo || '');
    const tolerancia = vacio((f.tolerancia || '').trim()) ? 0 : cantidad(f.tolerancia || '');

    if (objetivo === undefined || objetivo < 0 || (definicion.porcentaje && objetivo > 100)) {
      problemas.push(`${describe}: el objetivo no es un número${definicion.porcentaje ? ' entre 0 y 100' : ' positivo'}`);

      return;
    }

    if (tolerancia === undefined || tolerancia < 0) {
      problemas.push(`${describe}: la tolerancia no es un número positivo`);

      return;
    }

    // En una métrica de mínimo, una tolerancia igual o mayor que el objetivo
    // deja el umbral en cero o por debajo: cualquier valor lo cumpliría.
    if (definicion.sentido === 'minimo' && tolerancia >= objetivo) {
      problemas.push(`${describe}: la tolerancia iguala o supera el objetivo, y cualquier valor lo cumpliría`);

      return;
    }

    objetivos.set(metrica, {
      metrica,
      objetivo,
      tolerancia,
      umbral: definicion.sentido === 'minimo' ? objetivo - tolerancia : objetivo + tolerancia,
      sentido: definicion.sentido,
      unidad: definicion.unidad,
    });
  });

  return { objetivos, problemas };
};

const objetivoDe = (context: ENSPolicyContext, metrica: string, para: string): ObjetivoDeMetrica | Medida => {
  const declaradas = filas(context, 'P-06');

  if (!declaradas) {
    return faltaParametro(context, 'P-06', para);
  }

  const { objetivos, problemas } = parseObjetivos(declaradas);

  if (problemas.length) {
    return sinMedir(`${etiqueta(context, 'P-06')} tiene filas que no se pueden interpretar: ${lista(problemas)}.`, 'CONFIGURATION');
  }

  const objetivo = objetivos.get(metrica);

  return objetivo || sinMedir(`${etiqueta(context, 'P-06')} no declara el objetivo de ${metrica}: no hay contra qué juzgar ${para}.`, 'CONFIGURATION');
};

const describeObjetivo = (o: ObjetivoDeMetrica): string =>
  `${o.sentido === 'minimo' ? '≥' : '≤'} ${cifra(o.objetivo)}${o.unidad ? ` ${o.unidad}` : ''}${o.tolerancia ? `, tolerancia ${cifra(o.tolerancia)}` : ''}`;

// --- EV-02 · el último ciclo validado, dentro del plazo ----------------------------

const juzgaCiclos = (reg: Registro, per: Periodicidad, quienes: Set<string>, quienesTexto: string): Medida => {
  const { ciclos, nota } = ciclosDe(reg);
  const notas = `${nota}${notaDescartadas(reg, 'registro de ciclos')}`;
  const ultimo = ciclos[ciclos.length - 1];
  const validados = ciclos.filter(c => !vacio(c.validadoPor) && quienes.has(plegado(c.validadoPor)));
  const ultimoValidado = validados[validados.length - 1];
  const plazo = per.plazoDias * DIA;

  if (!ultimoValidado) {
    return noCumple(
      `Ningún ciclo del registro está validado por un responsable de métricas de P-05 (${quienesTexto}): el último, ${describeCiclo(ultimo)}, ${
        vacio(ultimo.validadoPor) ? 'no tiene quién lo validó' : `lo validó «${ultimo.validadoPor}», que P-05 no designa`
      }. Un dato que se reporta fuera sin validación formal no tiene responsable.${notas}`
    );
  }

  const edad = reg.t - ultimoValidado.fecha;

  if (edad > plazo) {
    return noCumple(
      `El último ciclo validado es ${describeCiclo(ultimoValidado)}, de hace ${dias(edad)} días: fuera del plazo (${describePlazo(per)} días). Los datos del grado de implantación no se consolidan con la periodicidad declarada.${
        ultimo !== ultimoValidado ? ` Después hay ${describeCiclo(ultimo)}, pendiente de una validación de P-05.` : ''
      }${notas}`
    );
  }

  const conImplantacion = validados.filter(c => c.implantacion !== undefined);
  const tendencia =
    conImplantacion.length >= 2
      ? ` Tendencia de la implantación: ${conImplantacion
          .slice(-3)
          .map(c => `${c.periodo} ${cifra(c.implantacion as number)} %`)
          .join(' → ')}.`
      : '';

  return cumple(
    `Último ciclo validado: ${describeCiclo(ultimoValidado)}, hace ${dias(edad)} días, dentro del plazo (${describePlazo(per)} días). Serie: ${ciclos.length} ciclo(s) anotados.${tendencia}${
      ultimo !== ultimoValidado ? ` El ciclo ${describeCiclo(ultimo)} está pendiente de validar.` : ''
    }${notas}`
  );
};

const ev02Hechos = (context: ENSPolicyContext, ahora: number): Medida => {
  const partes: Medida[] = [];
  const soa = declaracion(context);

  if (soa) {
    partes.push(soa);
  }

  const reg = LEE_CICLOS(context, ahora, 'EV-02');

  if (esMedida(reg)) {
    return combina([...partes, reg]);
  }

  const { ciclos, nota } = ciclosDe(reg);

  if (!ciclos.length) {
    // Registro presente y sin ningún ciclo: es un dato medido, sin plazo que valga.
    return combina([
      ...partes,
      noCumple(
        `El registro de ciclos de métricas existe pero no tiene ningún ciclo anotado: los datos del grado de implantación no se consolidan con ninguna periodicidad y no hay serie histórica.${nota}${notaDescartadas(reg, 'registro de ciclos')}`
      ),
    ]);
  }

  const per = periodicidad(context);
  const quienes = validadores(context, 'metricas');

  if (esMedida(per)) {
    partes.push(per);
  }

  if (esMedida(quienes)) {
    partes.push(quienes);
  }

  if (!esMedida(per) && !esMedida(quienes)) {
    partes.push(juzgaCiclos(reg, per, quienes, designados(context, 'metricas')));
  }

  return combina(partes);
};

const ev02 = (context: ENSPolicyContext, ahora: number): Medida =>
  conDegradacion(context, ahora, 'EV-02', 'metrics_register_read', ev02Hechos(context, ahora));

// --- EV-04 · la fiabilidad de la medición -------------------------------------------

interface Pasada {
  control: string;
  t: number;
  resultado: string;
}

// `control|instante|resultado`, separadas por comas; `-` si no hay ninguna.
// Cualquier otra forma es una lista ilegible (undefined), nunca una vacía.
const pasadasDe = (texto: string): Pasada[] | undefined => {
  if (vacio(texto)) {
    return [];
  }

  const pasadas: Pasada[] = [];

  for (const entrada of texto.split(',')) {
    const m = /^([^|\s]+)\|([^|]+)\|(completada|parcial|fallida|-)$/.exec(entrada.trim());
    const t = m ? instante(m[2].trim()) : undefined;

    if (!m || t === undefined) {
      return undefined;
    }

    pasadas.push({ control: m[1], t, resultado: m[3] });
  }

  return pasadas;
};

const enAlcance = (e: ENSNormalizedEvent): boolean =>
  idDelHecho(e) === MANAGER ||
  campo(e, 'grupos')
    .split(',')
    .map(g => plegado(g))
    .includes(ENS_SCOPE_GROUP);

interface Cobertura {
  medida: Medida;
  porcentaje?: number;
  alcance: number;
  cubiertos: number;
}

const ev04Cobertura = (context: ENSPolicyContext, ahora: number): Cobertura => {
  const { vigentes, ultimo } = estadoVigente(context, 'agent_keepalive_observed', ahora);

  if (!vigentes.length) {
    return { medida: sinHechos(context, 'EV-04', ahora, ultimo, 'estado de los agentes leído en el manager'), alcance: 0, cubiertos: 0 };
  }

  // Un hecho por agente: el último, con su ID normalizado.
  const agentes = new Map<string, ENSNormalizedEvent>();

  vigentes.forEach(e => agentes.set(idDelHecho(e), e));

  // Cuántos agentes dice el recolector que emitió: si llegan menos, faltan
  // líneas, y un agente perdido no puede desaparecer del alcance sin decirlo.
  // Cuentan como sistemas del alcance sin determinar, que es la cota segura
  // (si fueran de fuera del alcance, la cobertura real solo sería mejor).
  const emitidos = Math.max(0, ...vigentes.map(e => numero(campo(e, 'agentes_emitidos')) ?? 0));
  const perdidos = Math.max(0, emitidos - agentes.size);

  const latidos = estadoVigente(context, 'collector_heartbeat_observed', ahora).vigentes;
  const latidoDe = new Map<string, ENSNormalizedEvent>();

  latidos.forEach(e => latidoDe.set(idDelHecho(e), e));

  const alcance = Array.from(agentes.values()).filter(enAlcance);
  const fuera = Array.from(agentes.values()).filter(e => !enAlcance(e));
  const cubiertos: string[] = [];
  const descubiertos: string[] = [];
  const indeterminados: Medida[] = [];

  alcance.forEach(e => {
    const id = idDelHecho(e);
    const nombre = `${campo(e, 'agente') || '?'} (${id})`;
    const estado = campo(e, 'estado_conexion');

    if (estado !== 'active') {
      descubiertos.push(`${nombre}: agente ${estado || 'en estado desconocido'}, último keepalive ${vacio(campo(e, 'ultimo_keepalive')) ? 'nunca' : campo(e, 'ultimo_keepalive')}`);

      return;
    }

    if (!latidos.length) {
      indeterminados.push(sinMedir(`${nombre}: no han llegado los latidos de los recolectores leídos en alerts.json`, 'COLLECTION'));

      return;
    }

    const latido = latidoDe.get(id);

    if (!latido) {
      indeterminados.push(sinMedir(`${nombre}: no ha llegado su hecho de latidos (111306) en la última pasada`, 'COLLECTION'));

      return;
    }

    // En un clúster de Wazuh, alerts.json es de cada nodo: el recolector solo
    // ve los latidos de los agentes conectados a SU nodo. Un agente de otro nodo
    // no está ni cubierto ni descubierto: no se ha podido mirar.
    const nodoAgente = campo(e, 'nodo');
    const nodoLocal = campo(latido, 'nodo');

    if (!vacio(nodoAgente) && !vacio(nodoLocal) && !iguales(nodoAgente, nodoLocal)) {
      indeterminados.push(
        sinMedir(
          `${nombre}: está conectado al nodo ${nodoAgente} del clúster, y op.mon.2 lee los latidos en el alerts.json del nodo ${nodoLocal}, que no recibe los suyos`,
          'COLLECTION'
        )
      );

      return;
    }

    const pasadas = pasadasDe(campo(latido, 'pasadas'));
    const leido = momento(latido);

    if (!pasadas) {
      indeterminados.push(sinMedir(`${nombre}: su lista de pasadas no se puede interpretar («${campo(latido, 'pasadas')}»)`, 'COLLECTION'));

      return;
    }

    if (!pasadas.length) {
      const desde = instante(campo(latido, 'observado_desde'));

      if (desde !== undefined && leido - desde > LATIDO_VIGENTE_MS) {
        descubiertos.push(`${nombre}: ningún recolector de ENSFácil ha informado desde él desde ${fecha(desde)}`);
      } else {
        indeterminados.push(
          sinMedir(`${nombre}: todavía no ha informado ningún recolector de ENSFácil desde que op.mon.2 lee los latidos${desde !== undefined ? ` (${iso(desde)})` : ''}`)
        );
      }

      return;
    }

    // Una pasada fechada DESPUÉS de la lectura no prueba que el recolector
    // esté al día: es un reloj adelantado (el de la máquina, si el instante
    // salió de `data.ts`). Lo medido en contra manda; si no hay nada en contra,
    // esa máquina queda sin determinar.
    const futuras = pasadas.filter(p => p.t > leido + TOLERANCIA_FUTURO);
    const parados = pasadas.filter(
      p => p.t <= leido + TOLERANCIA_FUTURO && (leido - p.t > LATIDO_VIGENTE_MS || p.resultado === 'fallida')
    );

    if (parados.length) {
      descubiertos.push(
        `${nombre}: ${lista(
          parados.map(p =>
            p.resultado === 'fallida'
              ? `${p.control} falló en su última pasada (${iso(p.t)})`
              : `${p.control} sin pasada desde ${iso(p.t)}`
          )
        )}`
      );

      return;
    }

    if (futuras.length) {
      indeterminados.push(
        sinMedir(
          `${nombre}: ${lista(futuras.map(p => `${p.control} con su última pasada en el futuro (${iso(p.t)})`))}, después de la lectura de ${iso(leido)}: reloj adelantado, no se puede afirmar que esté al día`
        )
      );

      return;
    }

    cubiertos.push(`${nombre}, ${pasadas.length} recolector(es)`);
  });

  if (perdidos) {
    indeterminados.push(
      sinMedir(
        `de los ${emitidos} agentes que el recolector emitió en la última pasada han llegado ${agentes.size}; los ${perdidos} que faltan se cuentan como del alcance y sin determinar`,
        'COLLECTION'
      )
    );
  }

  const n = alcance.length + perdidos;
  const cuantosSinDeterminar = indeterminados.length - (perdidos ? 1 : 0) + perdidos;
  const notaFuera = fuera.length
    ? ` Fuera del alcance ENS (sin el grupo ${ENS_SCOPE_GROUP}) hay ${fuera.length} agente(s) que no cuentan: ${lista(fuera.map(e => `${campo(e, 'agente')} (${idDelHecho(e)}) ${campo(e, 'estado_conexion')}`))}.`
    : '';

  if (!n) {
    return {
      medida: sinMedir(`La base de agentes del manager no tiene ningún sistema del alcance ENS (el grupo ${ENS_SCOPE_GROUP} y el manager).${notaFuera}`),
      alcance: 0,
      cubiertos: 0,
    };
  }

  const porcentaje = (cubiertos.length / n) * 100;
  const maximo = ((cubiertos.length + cuantosSinDeterminar) / n) * 100;
  const medido = `${cifra(porcentaje)} % (${cubiertos.length} de ${n} sistemas del alcance ENS con el agente conectado y todos sus recolectores al día)`;
  const objetivo = objetivoDe(context, 'cobertura_monitorizacion', 'si la cobertura de la monitorización es suficiente');

  if (esMedida(objetivo)) {
    return { medida: sinMedir(`${objetivo.motivo} Cobertura medida: ${medido}.`, objetivo.causa), porcentaje, alcance: n, cubiertos: cubiertos.length };
  }

  const sinCubrir = descubiertos.length ? ` Sin cubrir: ${lista(descubiertos)}.` : '';
  const sinDeterminar = indeterminados.length ? ` Sin determinar: ${lista(indeterminados.map(m => m.motivo))}.` : '';

  if (maximo < objetivo.umbral) {
    return {
      medida: noCumple(
        `Cobertura de la monitorización ${medido}${cuantosSinDeterminar ? `, como mucho ${cifra(maximo)} % con los ${cuantosSinDeterminar} sin determinar` : ''}: por debajo del objetivo de P-06 (${describeObjetivo(objetivo)}). Un grado de implantación calculado sobre esta monitorización no es un dato sólido.${sinCubrir}${sinDeterminar}${notaFuera}`
      ),
      porcentaje,
      alcance: n,
      cubiertos: cubiertos.length,
    };
  }

  if (porcentaje >= objetivo.umbral) {
    return {
      medida: cumple(
        `Cobertura de la monitorización ${medido}, frente al objetivo de P-06 (${describeObjetivo(objetivo)})${
          porcentaje < objetivo.objetivo ? ': por debajo del objetivo, dentro de la tolerancia' : ''
        }.${sinCubrir}${sinDeterminar}${notaFuera}`
      ),
      porcentaje,
      alcance: n,
      cubiertos: cubiertos.length,
    };
  }

  return {
    medida: sinMedir(
      `Cobertura de la monitorización ${medido}, por debajo del objetivo de P-06 (${describeObjetivo(objetivo)}), pero ${cuantosSinDeterminar} sistema(s) sin determinar podrían alcanzarlo.${sinCubrir}${sinDeterminar}${notaFuera}`,
      causaComun(indeterminados)
    ),
    porcentaje,
    alcance: n,
    cubiertos: cubiertos.length,
  };
};

// --- EV-03 · los indicadores de la gestión de incidentes ------------------------------

export const INDICADORES = [
  'incidentes_por_tipo',
  'incidentes_por_severidad',
  'tiempo_medio_contencion',
  'tiempo_medio_resolucion',
  'notificados_ccn_cert',
  'notificados_aepd',
];

const SEVERIDADES = ['baja', 'media', 'alta', 'critica'];

interface Incidente {
  id: string;
  severidad: string;
  // La fase inicial más temprana: el registro del incidente.
  apertura?: number;
  // La fecha más temprana de cualquier fase (para la ventana).
  primera: number;
  contencion?: number;
  cierre?: number;
  clasificacion?: string;
  datosPersonales: 'si' | 'no' | '-';
  aepd: boolean;
  ccnCert?: number;
}

const LEE_INCIDENTES = (context: ENSPolicyContext, ahora: number): Registro | Medida =>
  registro(context, ahora, 'incident_register_read', 'incident_registered', 'EV-03', 'registro de incidentes', REGISTRO_INCIDENTES);

// Las fases del registro agrupadas por incidente, con las mismas reglas que
// op.exp.7: la severidad es la más alta de sus fases; la contención, la primera
// fase intermedia; el cierre, la última final.
const incidentesDe = (reg: Registro): Incidente[] => {
  const porId = new Map<string, Incidente>();

  reg.filas.forEach(e => {
    const id = campo(e, 'incidente_id');
    const t = instante(campo(e, 'fecha'));

    if (!id || t === undefined) {
      return;
    }

    const actual: Incidente = porId.get(id) || { id, severidad: '', primera: t, datosPersonales: '-', aepd: false };
    const severidad = sinTildes(campo(e, 'severidad'));
    const fase = campo(e, 'fase');

    if (SEVERIDADES.indexOf(severidad) > SEVERIDADES.indexOf(actual.severidad)) {
      actual.severidad = severidad;
    }

    actual.primera = Math.min(actual.primera, t);

    if (fase === 'inicial') {
      actual.apertura = Math.min(actual.apertura ?? t, t);
    } else if (fase === 'intermedio') {
      actual.contencion = Math.min(actual.contencion ?? t, t);
    } else if (fase === 'final') {
      actual.cierre = Math.max(actual.cierre ?? t, t);
    }

    if (!vacio(campo(e, 'clasificacion'))) {
      actual.clasificacion = campo(e, 'clasificacion');
    }

    const dp = campo(e, 'datos_personales');

    if (dp === 'si' || (dp === 'no' && actual.datosPersonales !== 'si')) {
      actual.datosPersonales = dp;
    }

    if (plegado(campo(e, 'notificado_a')).includes('aepd')) {
      actual.aepd = true;
    }

    const ccn = instante(campo(e, 'notificacion_ccn_cert'));

    if (ccn !== undefined) {
      actual.ccnCert = Math.min(actual.ccnCert ?? ccn, ccn);
    }

    porId.set(id, actual);
  });

  return Array.from(porId.values()).sort((a, b) => a.primera - b.primera);
};

// Vivos en la ventana [desde, hasta]: empezados antes de su fin y no cerrados
// antes de su principio. Un incidente fechado en el futuro no cuenta.
const vivosEn = (incidentes: Incidente[], desde: number, hasta: number): Incidente[] =>
  incidentes.filter(i => i.primera <= hasta + TOLERANCIA_FUTURO && (i.cierre === undefined || i.cierre >= desde));

// Qué le falta a un incidente para calcular un indicador, o undefined.
const faltaPara = (indicador: string, i: Incidente): string | undefined => {
  switch (indicador) {
    case 'incidentes_por_tipo':
      return i.clasificacion ? undefined : 'sin clasificación';
    case 'tiempo_medio_contencion':
      if (i.apertura === undefined) {
        return 'sin fase inicial';
      }

      if (i.contencion !== undefined && i.contencion < i.apertura) {
        return 'contención anterior a la fase inicial';
      }

      return i.cierre !== undefined && i.contencion === undefined ? 'cerrado sin fase intermedia (contención) anotada' : undefined;
    case 'tiempo_medio_resolucion':
      if (i.cierre === undefined) {
        return undefined;
      }

      if (i.apertura === undefined) {
        return 'cerrado sin fase inicial';
      }

      return i.cierre < i.apertura ? 'cierre anterior a la fase inicial' : undefined;
    case 'notificados_aepd':
      return i.datosPersonales === '-' ? 'sin indicar si afecta a datos personales' : undefined;
    default:
      return undefined;
  }
};

const media = (valores: number[]): string =>
  valores.length ? `${cifra(valores.reduce((a, b) => a + b, 0) / valores.length / HORA)} h` : 'sin datos';

const cuenta = (valores: string[]): string => {
  const mapa = new Map<string, number>();

  valores.forEach(v => mapa.set(v, (mapa.get(v) || 0) + 1));

  return mapa.size
    ? Array.from(mapa.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([v, n]) => `${v} ${n}`)
        .join(', ')
    : 'ninguno';
};

// El valor de un indicador sobre unos incidentes (los que tienen el dato).
const valorDeIndicador = (indicador: string, incidentes: Incidente[]): string => {
  switch (indicador) {
    case 'incidentes_por_tipo':
      return cuenta(incidentes.map(i => i.clasificacion || 'sin clasificar'));
    case 'incidentes_por_severidad':
      return cuenta(incidentes.map(i => i.severidad || 'sin severidad'));
    case 'tiempo_medio_contencion': {
      const contenidos = incidentes.filter(i => i.apertura !== undefined && i.contencion !== undefined && i.contencion >= i.apertura);

      return `${media(contenidos.map(i => (i.contencion as number) - (i.apertura as number)))} (${contenidos.length} contenidos)`;
    }
    case 'tiempo_medio_resolucion': {
      const cerrados = incidentes.filter(i => i.apertura !== undefined && i.cierre !== undefined && i.cierre >= i.apertura);

      return `${media(cerrados.map(i => (i.cierre as number) - (i.apertura as number)))} (${cerrados.length} cerrados)`;
    }
    case 'notificados_ccn_cert':
      return `${incidentes.filter(i => i.ccnCert !== undefined).length} de ${incidentes.length}`;
    case 'notificados_aepd': {
      const personales = incidentes.filter(i => i.datosPersonales === 'si');

      return `${personales.filter(i => i.aepd).length} de ${personales.length} con datos personales`;
    }
    default:
      return 'indicador desconocido';
  }
};

// P-03: una lista de indicadores del vocabulario. Cualquier otro texto deja R1
// sin evaluar, nombrándolo.
const indicadores = (context: ENSPolicyContext): string[] | Medida => {
  const p = parametro(context, 'P-03');
  const elementos = p && p.value !== undefined ? toParameterListItems(p.value).map(x => x.trim()).filter(Boolean) : [];

  if (!elementos.length) {
    return faltaParametro(context, 'P-03', 'qué indicadores de la gestión de incidentes se consolidan');
  }

  const malos = elementos.filter(x => !INDICADORES.includes(plegado(x)));

  if (malos.length) {
    return sinMedir(
      `${etiqueta(context, 'P-03')} tiene indicadores que ENSFácil no sabe calcular con el registro de incidentes: ${lista(malos.map(x => `«${x}»`))}. Los que sabe: ${INDICADORES.join(', ')}.`,
      'CONFIGURATION'
    );
  }

  return Array.from(new Set(elementos.map(plegado)));
};

// Decisión del responsable 7: los datos de incidentes se dan por consolidados
// si el último ciclo de métricas está dentro de su plazo.
//
// El registro de ciclos es de EV-02: se lee como EV-02 (su falta de hechos
// busca la degradación de EV-02) y lo que el recolector declare de él después
// de su lectura se combina igual que en EV-02.
const cicloEnPlazo = (context: ENSPolicyContext, ahora: number, per: Periodicidad): Medida =>
  conDegradacion(context, ahora, 'EV-02', 'metrics_register_read', cicloEnPlazoHechos(context, ahora, per));

const cicloEnPlazoHechos = (context: ENSPolicyContext, ahora: number, per: Periodicidad): Medida => {
  const reg = LEE_CICLOS(context, ahora, 'EV-02');

  if (esMedida(reg)) {
    return reg.estado === 'NO_EVALUABLE'
      ? sinMedir(`Sin el registro de ciclos de métricas no consta que los datos de incidentes se consoliden: ${reg.motivo}`, reg.causa)
      : reg;
  }

  const { ciclos } = ciclosDe(reg);
  const ultimo = ciclos[ciclos.length - 1];

  if (!ultimo) {
    return noCumple('El registro de ciclos de métricas no tiene ningún ciclo anotado: los datos de incidentes no se consolidan en ningún ciclo.');
  }

  const edad = reg.t - ultimo.fecha;

  return edad > per.plazoDias * DIA
    ? noCumple(`El último ciclo de métricas, ${describeCiclo(ultimo)}, es de hace ${dias(edad)} días: fuera del plazo (${describePlazo(per)} días), así que los datos de incidentes no se están consolidando.`)
    : cumple(`Se consolidan en el ciclo ${describeCiclo(ultimo)}, dentro del plazo (${describePlazo(per)} días).`);
};

const ev03Hechos = (context: ENSPolicyContext, ahora: number): Medida => {
  const reg = LEE_INCIDENTES(context, ahora);

  if (esMedida(reg)) {
    return reg;
  }

  const partes: Medida[] = [];
  const declarados = indicadores(context);
  const per = periodicidad(context);

  if (esMedida(declarados)) {
    partes.push(declarados);
  }

  if (esMedida(per)) {
    partes.push(per);
  }

  if (esMedida(declarados) || esMedida(per)) {
    return combina(partes);
  }

  partes.push(cicloEnPlazo(context, ahora, per));

  const desde = reg.t - per.dias * DIA;
  const delPeriodo = vivosEn(incidentesDe(reg), desde, reg.t);
  const ventana = `el periodo ${per.nombre} hasta la lectura (desde ${fecha(desde)})`;

  if (reg.descartadas > 0) {
    partes.push(
      sinMedir(
        `${reg.descartadas} fila(s) del registro de incidentes se descartaron por no tener el formato exigido (ver los avisos del recolector): no se puede afirmar que los indicadores estén completos.`
      )
    );
  }

  if (!delPeriodo.length) {
    partes.push(
      cumple(
        `Ningún incidente registrado en ${ventana}: los indicadores de P-03 (${declarados.join(', ')}) valen cero. Con el registro presente, cero incidentes es un dato.`
      )
    );

    return combina(partes);
  }

  const faltas: string[] = [];

  declarados.forEach(indicador => {
    const sin = delPeriodo
      .map(i => ({ i, falta: faltaPara(indicador, i) }))
      .filter(x => x.falta);

    if (sin.length) {
      faltas.push(`${indicador}: ${lista(sin.map(x => `${x.i.id} ${x.falta}`))}`);
    }
  });

  partes.push(
    faltas.length
      ? noCumple(
          `Faltan datos en el registro de incidentes para calcular los indicadores de P-03 de ${ventana} (${delPeriodo.length} incidente(s)): ${faltas.join(' | ')}. Sin ellos no se puede evaluar el comportamiento de la gestión de incidentes.`
        )
      : cumple(
          `Indicadores de P-03 de ${ventana}, ${delPeriodo.length} incidente(s): ${declarados.map(x => `${x}: ${valorDeIndicador(x, delPeriodo)}`).join('; ')}.`
        )
  );

  return combina(partes);
};

const ev03 = (context: ENSPolicyContext, ahora: number): Medida =>
  conDegradacion(context, ahora, 'EV-03', 'incident_register_read', ev03Hechos(context, ahora));

// --- EV-06 · los recursos del último ciclo (dato declarado) ------------------------

const COLUMNAS_RECURSOS = ['horas_internas', 'horas_externas', 'presupuesto_ejecutado'];

const partidas = (context: ENSPolicyContext): Medida | undefined => {
  const declaradas = filas(context, 'P-04');

  if (!declaradas) {
    return faltaParametro(context, 'P-04', 'qué partidas entran en las horas y el presupuesto que anota el registro');
  }

  const malas = declaradas.filter(f => !COLUMNAS_RECURSOS.includes(plegado(f.columna || '')));

  if (malas.length) {
    return sinMedir(
      `${etiqueta(context, 'P-04')}: la columna de ${lista(malas.map(f => `«${f.partida}» («${f.columna || ''}»)`))} no es ${COLUMNAS_RECURSOS.join(', ')}.`,
      'CONFIGURATION'
    );
  }

  const faltan = COLUMNAS_RECURSOS.filter(c => !declaradas.some(f => plegado(f.columna || '') === c));

  return faltan.length
    ? sinMedir(`${etiqueta(context, 'P-04')} no declara ninguna partida para ${faltan.join(', ')}: esa cifra del registro no tiene un significado declarado.`, 'CONFIGURATION')
    : undefined;
};

const ev06Hechos = (context: ENSPolicyContext, ahora: number): Medida => {
  const partes: Medida[] = [];
  const reg = LEE_CICLOS(context, ahora, 'EV-06');

  if (esMedida(reg)) {
    return reg;
  }

  const { ciclos, nota } = ciclosDe(reg);
  const notas = `${nota}${notaDescartadas(reg, 'registro de ciclos')}`;
  const ultimo = ciclos[ciclos.length - 1];
  const sinPartidas = partidas(context);

  if (sinPartidas) {
    partes.push(sinPartidas);
  }

  if (!ultimo) {
    return combina([...partes, noCumple(`El registro de ciclos de métricas no tiene ningún ciclo anotado: no hay datos de horas ni de presupuesto.${notas}`)]);
  }

  const per = periodicidad(context);
  const quienes = validadores(context, 'recursos');

  if (esMedida(per)) {
    partes.push(per);
  }

  if (esMedida(quienes)) {
    partes.push(quienes);
  }

  if (esMedida(per) || esMedida(quienes)) {
    return combina(partes);
  }

  const edad = reg.t - ultimo.fecha;

  if (edad > per.plazoDias * DIA) {
    partes.push(noCumple(`El último ciclo, ${describeCiclo(ultimo)}, es de hace ${dias(edad)} días: fuera del plazo (${describePlazo(per)} días). Los datos de recursos no están al día.${notas}`));

    return combina(partes);
  }

  const faltan = [
    ultimo.horasInternas === undefined ? 'horas internas' : '',
    ultimo.horasExternas === undefined ? 'horas externas' : '',
    ultimo.presupuesto === undefined ? 'presupuesto ejecutado' : '',
  ].filter(Boolean);

  if (faltan.length) {
    partes.push(noCumple(`El último ciclo, ${describeCiclo(ultimo)}, no anota ${faltan.join(', ')}: R2 pide los recursos consumidos en horas y presupuesto.${notas}`));
  } else if (vacio(ultimo.validadoPor) || !quienes.has(plegado(ultimo.validadoPor))) {
    partes.push(
      noCumple(
        `Los recursos del último ciclo, ${describeCiclo(ultimo)}, no están validados por un responsable de recursos de P-05 (${designados(context, 'recursos')}).${notas}`
      )
    );
  } else {
    partes.push(
      cumple(
        `Ciclo ${ultimo.periodo}, consolidado el ${fecha(ultimo.fecha)}: ${cifra(ultimo.horasInternas as number)} h internas, ${cifra(ultimo.horasExternas as number)} h externas y ${cifra(ultimo.presupuesto as number)} € de presupuesto ejecutado, validado por ${ultimo.validadoPor} (P-05). DATO DECLARADO: ENSFácil lo registra y lo presenta, pero no lo verifica.${notas}`
      )
    );
  }

  return combina(partes);
};

// Lo que el recolector declare después de la última lectura se combina con lo
// medido: la degradación de EV-06 si la hay, y si no la de EV-02 (el mismo
// registro). Nunca las dos: la misma línea puede nombrar «EV-02,EV-06».
const ev06 = (context: ENSPolicyContext, ahora: number): Medida => {
  const medida = ev06Hechos(context, ahora);
  const propia = conDegradacion(context, ahora, 'EV-06', 'metrics_register_read', medida);

  return propia !== medida
    ? propia
    : conDegradacion(context, ahora, HEREDA_DEGRADACION['EV-06'], 'metrics_register_read', medida);
};

// --- datos para el informe (sin veredicto) ----------------------------------------

const DATO_DEL_INFORME: Record<string, string> = {
  'EV-01':
    'Dato del informe, sin veredicto: el grado de implantación de cada medida aplicable de P-01 es salida del motor sobre el resultado de todos los controles, y lo calcula el informe de op.mon.2. Que se consolida con su periodicidad lo acredita EV-02.',
  'EV-05':
    'Dato del informe, sin veredicto: los controles con requisitos sin evaluar por falta de configuración, con el parámetro que falta, salen del resultado de todos los controles y los presenta el informe de op.mon.2.',
  'EV-07':
    'Dato del informe, sin veredicto: los datos del informe anual del art. 32 son el propio informe de op.mon.2, que combina EV-01 a EV-06 con el origen de cada cifra.',
};

// La serie de ciclos para el informe, del más reciente al más antiguo.
const serieDeCiclos = (context: ENSPolicyContext, ahora: number): string[] => {
  const reg = LEE_CICLOS(context, ahora, 'EV-02');

  if (esMedida(reg)) {
    return [];
  }

  return ciclosDe(reg)
    .ciclos.slice()
    .reverse()
    .map(c =>
      [
        describeCiclo(c),
        c.horasInternas !== undefined || c.horasExternas !== undefined || c.presupuesto !== undefined
          ? `recursos: ${c.horasInternas !== undefined ? cifra(c.horasInternas) : '-'} h internas, ${c.horasExternas !== undefined ? cifra(c.horasExternas) : '-'} h externas, ${
              c.presupuesto !== undefined ? cifra(c.presupuesto) : '-'
            } €`
          : '',
        vacio(c.referencia) ? '' : `ref. ${c.referencia}`,
      ]
        .filter(Boolean)
        .join(' · ')
    );
};

// Los seis indicadores sobre una ventana, para el informe (con P-03 o sin ella).
const indicadoresDelInforme = (context: ENSPolicyContext, ahora: number, diasVentana: number | undefined): string[] => {
  const reg = LEE_INCIDENTES(context, ahora);

  if (esMedida(reg) || diasVentana === undefined) {
    return [];
  }

  const desde = reg.t - diasVentana * DIA;
  const vivos = vivosEn(incidentesDe(reg), desde, reg.t);

  return [
    `Ventana: ${fecha(desde)} a ${fecha(reg.t)}, ${vivos.length} incidente(s)`,
    ...INDICADORES.map(x => `${x}: ${vivos.length ? valorDeIndicador(x, vivos) : 'cero'}`),
  ];
};

// --- decisiones ------------------------------------------------------------

interface Tecnico {
  requisito: string;
  evidencias: string[];
  parametros: string[];
  tipo: ENSTipoDeRegla;
  acreditado?: boolean;
}

const TECNICOS: Tecnico[] = [
  { requisito: 'op.mon.2.1', evidencias: ['EV-02', 'EV-04'], parametros: ['P-01', 'P-02', 'P-05', 'P-06'], tipo: 'MAX_AGE' },
  { requisito: 'op.mon.2.r1.1', evidencias: ['EV-03'], parametros: ['P-02', 'P-03'], tipo: 'COVERAGE_REQUIRED' },
  // R2 es dato declarado: su CUMPLE se marca acreditado documentalmente.
  { requisito: 'op.mon.2.r2.1', evidencias: ['EV-06'], parametros: ['P-02', 'P-04', 'P-05'], tipo: 'MAX_AGE', acreditado: true },
];

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();
  const aplica = (requisito: string): boolean =>
    Boolean(
      context.control.requirements
        .find(r => r.id === requisito)
        ?.applicability.levels.includes(context.level)
    );

  // Cada medida se calcula una vez y solo si algún requisito que aplica la usa.
  const cache: Record<string, Medida> = {};
  const ev04: { cobertura?: Cobertura } = {};

  const medidaDe = (evidencia: string): Medida => {
    if (!cache[evidencia]) {
      switch (evidencia) {
        case 'EV-02':
          cache[evidencia] = ev02(context, ahora);
          break;
        case 'EV-03':
          cache[evidencia] = ev03(context, ahora);
          break;
        case 'EV-04':
          ev04.cobertura = ev04Cobertura(context, ahora);
          cache[evidencia] = conDegradacion(context, ahora, 'EV-04', 'agent_keepalive_observed', ev04.cobertura.medida);
          break;
        default:
          cache[evidencia] = ev06(context, ahora);
      }
    }

    return cache[evidencia];
  };

  const requisitoDecisions: ENSPolicyDecision[] = [];
  const evidenciaDecisions: ENSPolicyDecision[] = [];

  TECNICOS.filter(r => aplica(r.requisito)).forEach(definicion => {
    const propias = definicion.evidencias.map(id => ({ id, medida: medidaDe(id) }));
    const estado = peor(propias.map(p => p.medida));
    const responsables = propias.filter(p => p.medida.estado === estado);

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`.
    requisitoDecisions.push(
      decide(
        definicion.requisito,
        estado,
        responsables.map(p => p.id),
        definicion.parametros,
        definicion.tipo,
        definicion.requisito,
        propias.map(p => `${p.id} ${p.medida.estado}: ${p.medida.motivo}`).join(' | '),
        definicion.evidencias.map(id => `${id} CUMPLE`).join(' y '),
        causaComun(responsables.map(p => p.medida)),
        Boolean(definicion.acreditado)
      )
    );

    // Y una por evidencia, con SU estado. La de un requisito acreditado lleva la
    // misma marca: el puente no rellena una evidencia con una acreditación, así
    // que EV-06 no se presenta como medida (es dato declarado).
    propias.forEach(p =>
      evidenciaDecisions.push(
        decide(
          definicion.requisito,
          p.medida.estado,
          [p.id],
          definicion.parametros,
          definicion.tipo,
          `${definicion.requisito}/${p.id}`,
          p.medida.motivo,
          `${p.id} CUMPLE`,
          p.medida.causa,
          Boolean(definicion.acreditado)
        )
      )
    );
  });

  // EV-01, EV-05 y EV-07: datos del informe, sin veredicto. op.mon.2.1 aplica
  // en las tres categorías.
  ['EV-01', 'EV-05', 'EV-07'].forEach(id =>
    evidenciaDecisions.push(decide('op.mon.2.1', 'NO_APLICA', [id], ['P-01', 'P-06'], 'MAX_AGE', `op.mon.2.1/${id}`, DATO_DEL_INFORME[id], 'dato del informe'))
  );

  const per = periodicidad(context);
  const variables: ENSRuntimeVariable[] = [
    ...Object.entries(cache).map(([evidencia, medida]) => ({
      name: `medida_${evidencia.replace('-', '')}`,
      value: medida.estado,
      parameterIds: [],
      evidenceIds: [evidencia],
      eventIds: [],
      description: medida.motivo,
    })),
    {
      name: 'periodicidad_metricas',
      value: esMedida(per) ? undefined : per.nombre,
      parameterIds: ['P-02'],
      evidenceIds: ['EV-02'],
      eventIds: [],
      description: esMedida(per)
        ? per.motivo
        : `${describePlazo(per)} días de plazo por ciclo${per.cierre ? `; cierre anual del art. 32 el ${per.cierre}` : ''}.`,
    },
    {
      name: 'serie_ciclos_metricas',
      value: serieDeCiclos(context, ahora),
      parameterIds: ['P-02', 'P-05'],
      evidenceIds: ['EV-02', 'EV-06'],
      eventIds: [],
      description: 'Ciclos de métricas anotados en el registro de la organización, del más reciente al más antiguo.',
    },
    {
      name: 'indicadores_incidentes_periodo',
      value: indicadoresDelInforme(context, ahora, esMedida(per) ? undefined : per.dias),
      parameterIds: ['P-02', 'P-03'],
      evidenceIds: ['EV-03'],
      eventIds: [],
      description: 'Indicadores de la gestión de incidentes del periodo de P-02, calculados con el registro de incidentes de op.exp.7.',
    },
    {
      name: 'indicadores_incidentes_anual',
      value: indicadoresDelInforme(context, ahora, ANUAL_DIAS),
      parameterIds: ['P-03'],
      evidenceIds: ['EV-03'],
      eventIds: [],
      description: 'Indicadores de la gestión de incidentes de los últimos 365 días, para el informe anual del art. 32.',
    },
  ];

  const cobertura = ev04.cobertura;

  if (cobertura && cobertura.porcentaje !== undefined) {
    variables.push({
      name: 'cobertura_monitorizacion',
      value: Math.round(cobertura.porcentaje * 10) / 10,
      parameterIds: ['P-06'],
      evidenceIds: ['EV-04'],
      eventIds: [],
      description: `${cobertura.cubiertos} de ${cobertura.alcance} sistemas del alcance ENS con el agente conectado y todos sus recolectores al día.`,
    });
  }

  return { decisions: [...requisitoDecisions, ...evidenciaDecisions], runtimeVariables: variables };
};

export const opMon2PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // Por categoría del sistema: la base en las tres; R1 y R2 desde MEDIA, que
  // exige lo mismo que ALTA.
  requirements: [
    {
      requirementId: 'op.mon.2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-05', 'P-06'],
      evidenceIds: ['EV-02', 'EV-04'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.2.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-03'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.2.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04', 'P-05'],
      evidenceIds: ['EV-06'],
      ruleType: 'MAX_AGE',
    },
  ],
};
