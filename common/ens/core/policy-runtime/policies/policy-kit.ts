// Utilidades compartidas de las policies imperativas.
//
// Lo que op.exp.8 escribió para juzgar con hechos crudos y que cada policy
// nueva copiaba casi entero: la medida de una evidencia (`Medida`) y cómo se
// combinan varias, la lectura de los hechos de un control (la última pasada,
// su frescura, lo que el recolector declaró que no pudo medir) y la de las
// tablas de la pantalla. op.mon.1 es la primera que lo importa; las policies
// anteriores (op.exp.*, op.acc.*) conservan su copia y no se tocan.
//
// SE IMPORTA POR LA RUTA DEL FICHERO, nunca desde un barrel: por un barrel
// vuelve el ciclo del TDZ de Settings. Por la misma razón aquí solo hay tipos y
// el validador de parámetros, también por su fichero.
//
// Invariantes, las de `evidence/judgment.ts`:
//   - el recolector emite instantes, no edades: toda antigüedad se mide contra
//     `context.now`;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo y causa; nunca un
//     CUMPLE por ausencia, ni por una lista vacía de medidas;
//   - lo que el recolector declara que no pudo medir sale con SU motivo y SU
//     causa, y se combina con lo medido sin taparlo;
//   - nada de aquí inventa política: ningún plazo, umbral o lista por defecto.
import type { ENSPolicyContext, ENSPolicyDecision } from '../types';
import type { ENSComplianceStatus, ENSGapCause } from '../../evaluation/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSControlParameter } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';

export const HORA = 60 * 60 * 1000;
export const DIA = 24 * HORA;

// Frescura por defecto de un hecho de estado. Los recolectores reemiten el
// estado entero en cada pasada: 26 h tolera un día de fallos sin convertir una
// foto vieja en la situación de hoy. Es tolerancia de OBSERVACIÓN, no política.
export const FRESCURA_HORAS = 26;

// Un hecho del futuro no acredita nada (misma tolerancia de reloj que el latido).
export const TOLERANCIA_FUTURO = 5 * 60 * 1000;

// Hechos de una misma pasada: el recolector los emite en pocos segundos.
export const MISMA_PASADA = 5 * 60 * 1000;

// --- la medida de una evidencia --------------------------------------------

// `causa` solo con NO_EVALUABLE: de quién es el hueco (ver `ENSGapCause`).
export type Medida = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL'>;
  motivo: string;
  causa?: ENSGapCause;
};

export const cumple = (motivo: string): Medida => ({ estado: 'CUMPLE', motivo });
export const noCumple = (motivo: string): Medida => ({ estado: 'NO_CUMPLE', motivo });
// Por defecto EVIDENCE: el dato llegó y no basta. Falta de parámetro y falta de
// hechos lo dicen expresamente (`faltaParametro`, `sinHechos`), y lo que el
// recolector declara llega con SU causa (`degradacion`).
export const sinMedir = (motivo: string, causa: ENSGapCause = 'EVIDENCE'): Medida => ({
  estado: 'NO_EVALUABLE',
  motivo,
  causa,
});
export const noAplica = (motivo: string): Medida => ({ estado: 'NO_APLICA', motivo });

// La causa de varias medidas sin medir, con el mismo orden que el motor
// (`resolveGapCause`): COLLECTION solo si lo dicen todas; CONFIGURATION si lo
// dice alguna; si no, EVIDENCE.
export const causaComun = (medidas: Medida[]): ENSGapCause | undefined => {
  const causas = medidas
    .filter(m => m.estado === 'NO_EVALUABLE')
    .map(m => m.causa || 'EVIDENCE');

  if (!causas.length) {
    return undefined;
  }

  if (causas.every(c => c === 'COLLECTION')) {
    return 'COLLECTION';
  }

  return causas.includes('CONFIGURATION') ? 'CONFIGURATION' : 'EVIDENCE';
};

const GRAVEDAD: Record<Medida['estado'], number> = {
  NO_APLICA: -1,
  CUMPLE: 0,
  NO_EVALUABLE: 1,
  NO_CUMPLE: 2,
};

// El peor estado de las medidas; NO_APLICA solo si todas lo son. Sin ninguna
// medida no hay nada demostrado: NO_EVALUABLE, nunca un CUMPLE por vacío.
export const peor = (medidas: Medida[]): Medida['estado'] => {
  if (!medidas.length) {
    return 'NO_EVALUABLE';
  }

  if (medidas.every(m => m.estado === 'NO_APLICA')) {
    return 'NO_APLICA';
  }

  return medidas.reduce<Medida['estado']>(
    (actual, medida) =>
      GRAVEDAD[medida.estado] > GRAVEDAD[actual] ? medida.estado : actual,
    'CUMPLE'
  );
};

// Varios ejes de una evidencia en una medida: el estado del peor, y en el
// motivo lo que lo explica (lo que falla o falta; si todo cumple, lo medido).
export const combina = (partes: Medida[]): Medida => {
  if (!partes.length) {
    return sinMedir('No hay ninguna medida que juzgar.');
  }

  const estado = peor(partes);

  if (estado === 'CUMPLE' || estado === 'NO_APLICA') {
    return { estado, motivo: partes.map(p => p.motivo).join(' ') };
  }

  const responsables = partes.filter(p => p.estado === estado);
  const ademas = partes
    .filter(p => p.estado !== estado && p.estado !== 'CUMPLE' && p.estado !== 'NO_APLICA')
    .map(p => p.motivo);

  return {
    estado,
    motivo: [...responsables.map(p => p.motivo), ...(ademas.length ? [`Además: ${ademas.join(' ')}`] : [])].join(' '),
    ...(estado === 'NO_EVALUABLE' ? { causa: causaComun(responsables) } : {}),
  };
};

// --- valores de un hecho ------------------------------------------------------

export const campo = (event: ENSNormalizedEvent, nombre: string): string => {
  const valor =
    event.attributes && Object.prototype.hasOwnProperty.call(event.attributes, nombre)
      ? event.attributes[nombre]
      : undefined;

  return valor === undefined || valor === null ? '' : String(valor).trim();
};

export const numero = (texto: string): number | undefined => {
  const limpio = String(texto).trim().replace(',', '.');

  if (!/^[+-]?\d+(\.\d+)?$/.test(limpio)) {
    return undefined;
  }

  const valor = Number(limpio);

  return Number.isFinite(valor) ? valor : undefined;
};

export const instante = (texto: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(texto)) {
    return undefined;
  }

  const valor = new Date(texto).getTime();

  return Number.isFinite(valor) ? valor : undefined;
};

export const momento = (event: ENSNormalizedEvent): number => {
  const t = Date.parse(event.timestamp);

  return Number.isNaN(t) ? 0 : t;
};

export const lista = (elementos: string[], maximo = 5): string =>
  elementos.length > maximo
    ? `${elementos.slice(0, maximo).join('; ')} y ${elementos.length - maximo} más`
    : elementos.join('; ');

export const horas = (ms: number): string => (ms / HORA).toFixed(1);

export const dias = (ms: number): number => Math.floor(ms / DIA);

export const iso = (t: number): string => new Date(t).toISOString().replace('.000Z', 'Z');

export const sinTildes = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Un campo que el recolector deja vacío o a `-` (lo que no hay).
export const vacio = (texto: string): boolean => !texto || texto === '-';

export const iguales = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// --- los hechos de un control --------------------------------------------------

export interface ENSLectorDeHechos {
  hechos: (context: ENSPolicyContext, tipo: string) => ENSNormalizedEvent[];
  validos: (context: ENSPolicyContext, tipo: string, ahora: number) => ENSNormalizedEvent[];
  estadoVigente: (
    context: ENSPolicyContext,
    tipo: string,
    ahora: number
  ) => { vigentes: ENSNormalizedEvent[]; ultimo?: number };
  degradacion: (
    context: ENSPolicyContext,
    evidencia: string,
    ahora: number,
    despuesDe?: number
  ) => Medida | undefined;
  sinHechos: (
    context: ENSPolicyContext,
    evidencia: string,
    ahora: number,
    ultimo: number | undefined,
    queFalta: string
  ) => Medida;
  conDegradacion: (
    context: ENSPolicyContext,
    ahora: number,
    evidencia: string,
    tipo: string,
    medida: Medida
  ) => Medida;
}

// La lectura de los hechos de UN control. `recolector` nombra a quien no está
// informando en los motivos («el recolector de op.mon.1 del manager»).
export const lectorDeHechos = (
  control: string,
  opciones: { recolector: string; frescuraHoras?: number }
): ENSLectorDeHechos => {
  const frescura = (opciones.frescuraHoras ?? FRESCURA_HORAS) * HORA;
  const frescuraHoras = opciones.frescuraHoras ?? FRESCURA_HORAS;

  // El normalizador parte un evento con `evidence_id=A,B` en uno por evidencia
  // (`<id>#A`, `<id>#B`). Aquí se juzga el HECHO, así que se cuenta una vez.
  const hechos = (context: ENSPolicyContext, tipo: string): ENSNormalizedEvent[] => {
    const vistos = new Set<string>();

    return context.events.filter(event => {
      if (event.controlId !== control || event.eventType !== tipo) {
        return false;
      }

      const base = String(event.id || '').split('#')[0];

      if (vistos.has(base)) {
        return false;
      }

      vistos.add(base);

      return true;
    });
  };

  // Hechos válidos de un tipo (sin los del futuro), del más antiguo al más nuevo.
  const validos = (context: ENSPolicyContext, tipo: string, ahora: number): ENSNormalizedEvent[] =>
    hechos(context, tipo)
      .filter(e => momento(e) <= ahora + TOLERANCIA_FUTURO)
      .sort((a, b) => momento(a) - momento(b));

  // Los hechos de estado de la ÚLTIMA pasada que los emitió, sin los del
  // futuro. Si la última es más vieja que la frescura, no describen hoy.
  const estadoVigente = (
    context: ENSPolicyContext,
    tipo: string,
    ahora: number
  ): { vigentes: ENSNormalizedEvent[]; ultimo?: number } => {
    const todos = validos(context, tipo, ahora);

    if (!todos.length) {
      return { vigentes: [] };
    }

    const ultimo = momento(todos[todos.length - 1]);

    if (ahora - ultimo > frescura) {
      return { vigentes: [], ultimo };
    }

    // La última pasada: lo emitido en la hora anterior al último hecho.
    return {
      vigentes: todos.filter(e => ultimo - momento(e) < HORA),
      ultimo,
    };
  };

  // Lo que el recolector declaró que no pudo medir de una evidencia, si es más
  // reciente que `despuesDe`, con la causa que ÉL declara. Sin causa declarada,
  // COLLECTION. Con la misma frescura que los hechos: una degradación de hace
  // días no describe hoy, ni una del futuro.
  const degradacion = (
    context: ENSPolicyContext,
    evidencia: string,
    ahora: number,
    despuesDe = 0
  ): Medida | undefined => {
    const desde = Math.max(despuesDe, ahora - frescura);
    const ultima = hechos(context, 'evidence_state')
      .filter(
        e =>
          campo(e, 'evidence_id').split(',').map(x => x.trim()).includes(evidencia) &&
          String(e.status || campo(e, 'estado')).toUpperCase() === 'NO_EVALUABLE' &&
          momento(e) >= desde &&
          momento(e) <= ahora + TOLERANCIA_FUTURO
      )
      .sort((a, b) => momento(b) - momento(a))[0];

    if (!ultima) {
      return undefined;
    }

    const declarada = campo(ultima, 'causa').toUpperCase();
    const causa: ENSGapCause = ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'].includes(declarada)
      ? (declarada as ENSGapCause)
      : 'COLLECTION';

    return sinMedir(
      `El recolector no ha podido medirlo${declarada ? ` (${declarada})` : ''}: ${campo(ultima, 'motivo') || 'sin motivo declarado'}.`,
      causa
    );
  };

  const sinHechos = (
    context: ENSPolicyContext,
    evidencia: string,
    ahora: number,
    ultimo: number | undefined,
    queFalta: string
  ): Medida =>
    degradacion(context, evidencia, ahora) ||
    sinMedir(
      ultimo
        ? `El último ${queFalta} es de ${iso(ultimo)}, hace más de ${frescuraHoras} h: ${opciones.recolector} no está informando.`
        : `No consta ningún ${queFalta}: ${opciones.recolector} no está desplegado o no informa.`,
      'COLLECTION'
    );

  // Lo que el recolector declaró que no pudo medir DESPUÉS del último hecho de
  // una evidencia se COMBINA con lo medido, no lo sustituye: un NO_CUMPLE medido
  // en la última pasada buena sigue mandando, y lo que cumplía deja de cumplir
  // (NO_EVALUABLE con la causa del recolector). Sin hechos vigentes no hay nada
  // que combinar: eso ya lo dice `sinHechos`, con la misma degradación.
  const conDegradacion = (
    context: ENSPolicyContext,
    ahora: number,
    evidencia: string,
    tipo: string,
    medida: Medida
  ): Medida => {
    const { vigentes, ultimo } = estadoVigente(context, tipo, ahora);

    if (!vigentes.length || ultimo === undefined) {
      return medida;
    }

    const deg = degradacion(context, evidencia, ahora, ultimo + 1);

    return deg ? combina([medida, deg]) : medida;
  };

  return { hechos, validos, estadoVigente, degradacion, sinHechos, conDegradacion };
};

// --- los parámetros de la pantalla -------------------------------------------

export const parametro = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

export const etiqueta = (context: ENSPolicyContext, id: string): string => {
  const p = parametro(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

// Filas de una tabla repartidas en sus columnas declaradas. Sin columnas no se
// adivina la posición: el parámetro se trata como no configurado.
export const filas = (
  context: ENSPolicyContext,
  id: string
): Record<string, string>[] | undefined => {
  const p = parametro(context, id);
  const columnas = p?.columns || [];

  if (!p || !columnas.length) {
    return undefined;
  }

  const resultado = toParameterTableRows(p.value)
    .map(fila => toTableRowCells(fila))
    .filter(celdas => celdas.some(Boolean))
    .map(celdas => {
      const fila: Record<string, string> = {};

      columnas.forEach((columna, i) => {
        fila[columna.name] = (celdas[i] || '').trim();
      });

      return fila;
    });

  return resultado.length ? resultado : undefined;
};

// Un escalar positivo (un plazo, un umbral). Cero o negativo es no configurado.
export const escalar = (context: ENSPolicyContext, id: string): number | undefined => {
  const valor = parametro(context, id)?.value;

  if (valor === undefined || valor === null || Array.isArray(valor)) {
    return undefined;
  }

  const n = numero(String(valor));

  return n !== undefined && n > 0 ? n : undefined;
};

export const faltaParametro = (context: ENSPolicyContext, id: string, para: string): Medida =>
  sinMedir(`${etiqueta(context, id)} está sin configurar: no hay contra qué juzgar ${para}.`, 'CONFIGURATION');

// --- las decisiones ----------------------------------------------------------

export type ENSTipoDeRegla = ENSPolicyDecision['trace']['ruleType'];

// Una decisión de la policy `policyId`. `acreditado` marca un CUMPLE como
// documental (`attested`): con otro estado no marca nada.
export const decisorDe = (policyId: string) => (
  requisito: string,
  estado: Medida['estado'],
  evidencias: string[],
  parametros: string[],
  tipo: ENSTipoDeRegla,
  ruleId: string,
  motivo: string,
  esperado: string,
  causa?: ENSGapCause,
  acreditado = false
): ENSPolicyDecision => ({
  policyId,
  requirementId: requisito,
  status: estado,
  parameterIds: parametros,
  evidenceIds: evidencias,
  eventIds: [],
  runtimeVariables: [],
  trace: {
    ruleId,
    ruleType: tipo,
    expression: esperado,
    expected: esperado,
    actual: estado,
    result: estado === 'CUMPLE',
  },
  reason: motivo,
  ...(estado === 'NO_EVALUABLE' && causa ? { cause: causa } : {}),
  ...(acreditado && estado === 'CUMPLE' ? { attested: true } : {}),
});
