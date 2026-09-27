// op.exp.10 · Protección de claves criptográficas
//
// Por qué este control tiene policy propia. Las siete primitivas contrastan UN
// campo de UN hecho contra UN parámetro, y casi todo op.exp.10 necesita algo
// más:
//
//   EV-01  el actor de cada acceso contra P-08, PERO además la cobertura: un
//          acceso autorizado observado solo acredita los almacenes vigilados, y
//          la primitiva no mira el latido cuando hay hechos.
//   EV-03  cada algoritmo que acepta un servicio contra SU fila de uso en P-03
//   EV-04  y su longitud mínima; y P-04 exige además que cada servicio
//   EV-07  declarado para la máquina se haya observado.
//   EV-05  la generación observada contra la función de ESA máquina en P-05.
//   EV-06  P-01 filtrado por `estado` antes de buscar huella o ubicación.
//   EV-07  la caducidad contra el reloj, con el aviso de P-10.
//
// EV-02 y EV-08 los juzga su primitiva y aquí solo se LEE su resultado.
//
// Invariantes, las mismas que `evidence/judgment.ts`:
//   - el agente emite instantes y familias, no edades ni veredictos: la
//     caducidad se mide aquí contra `context.now`;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo; un silencio solo es
//     CUMPLE en las aserciones negativas (nadie no autorizado accede, no se
//     genera, no hay retiradas presentes, no hay certificados caducados) y solo
//     con el latido de la última pasada declarando esa evidencia cubierta;
//   - la policy nunca inventa política: ningún algoritmo, longitud, cuenta ni
//     plazo tiene valor por defecto.
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
import type { ENSComplianceStatus, ENSGapCause } from '../../evaluation/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSControlParameter } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';

const CONTROL = 'op.exp.10';
const POLICY = 'policy.op.exp.10';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// Mismo margen de reloj que `resolveCollectorCoverage`: un hecho del futuro no
// acredita nada.
const TOLERANCIA_FUTURO = 5 * 60 * 1000;

// Latido que habilita un silencio, igual que en las primitivas.
const LATIDO_HORAS = 24;

// `causa` solo con NO_EVALUABLE: de quién es el hueco (ver `ENSGapCause`).
// Llega a la evidencia y al requisito por la decisión; sin ella la tarjeta
// heredaba la causa del modelo clásico, que no ve los hechos que lee la policy.
type Medida = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;
  motivo: string;
  causa?: ENSGapCause;
};

const cumple = (motivo: string): Medida => ({ estado: 'CUMPLE', motivo });
const noCumple = (motivo: string): Medida => ({ estado: 'NO_CUMPLE', motivo });
// Por defecto EVIDENCE: el dato llegó y no basta. La falta de parámetro
// (CONFIGURATION), el silencio del recolector (COLLECTION) y lo que el propio
// recolector declara (`sinCobertura`) lo dicen expresamente.
const sinMedir = (motivo: string, causa: ENSGapCause = 'EVIDENCE'): Medida => ({
  estado: 'NO_EVALUABLE',
  motivo,
  causa,
});

// La causa de varias medidas sin medir (una por máquina, o varios ejes), con el
// mismo orden que el motor (`resolveGapCause`): COLLECTION solo si lo dicen
// todas; CONFIGURATION si lo dice alguna; si no, EVIDENCE.
const causaComun = (medidas: Medida[]): ENSGapCause | undefined => {
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

// Ningún evento de op.exp.10 en todo el alcance: el recolector no ha corrido.
const sinRecolector = (): Medida =>
  sinMedir('No ha llegado ningún evento de op.exp.10: el recolector no se ha ejecutado en ninguna máquina del alcance.', 'COLLECTION');

const GRAVEDAD: Record<Medida['estado'], number> = {
  CUMPLE: 0,
  NO_EVALUABLE: 1,
  NO_CUMPLE: 2,
};

const peor = (medidas: Medida[]): Medida['estado'] =>
  medidas.reduce<Medida['estado']>(
    (actual, medida) =>
      GRAVEDAD[medida.estado] > GRAVEDAD[actual] ? medida.estado : actual,
    'CUMPLE'
  );

// Varias medidas (una por máquina, o varios ejes) en una: manda la peor, y el
// motivo cuenta las que la sostienen.
const combina = (medidas: Medida[], vacio: Medida): Medida => {
  if (!medidas.length) {
    return vacio;
  }

  const estado = peor(medidas);
  const responsables = medidas.filter(m => m.estado === estado);

  return {
    estado,
    motivo: responsables.map(m => m.motivo).join(' | '),
    ...(estado === 'NO_EVALUABLE' ? { causa: causaComun(responsables) } : {}),
  };
};

// --- lectura de hechos -----------------------------------------------------

// El normalizador parte un evento con `evidence_id=EV-02,EV-06,EV-08` en uno por
// evidencia (`<id>#EV-06`). Aquí se juzga el HECHO, así que se cuenta una vez.
const hechos = (
  eventos: ENSNormalizedEvent[],
  tipo: string
): ENSNormalizedEvent[] => {
  const vistos = new Set<string>();

  return eventos.filter(event => {
    if (event.controlId !== CONTROL || event.eventType !== tipo) {
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

const campo = (event: ENSNormalizedEvent, nombre: string): string => {
  const valor =
    event.attributes && Object.prototype.hasOwnProperty.call(event.attributes, nombre)
      ? event.attributes[nombre]
      : undefined;

  return valor === undefined || valor === null ? '' : String(valor).trim();
};

const instante = (texto: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(texto)) {
    return undefined;
  }

  const valor = new Date(texto).getTime();

  return Number.isFinite(valor) ? valor : undefined;
};

const sinTildes = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const lista = (elementos: string[], maximo = 5): string => {
  const unicos = Array.from(new Set(elementos));

  return unicos.length > maximo
    ? `${unicos.slice(0, maximo).join('; ')} y ${unicos.length - maximo} más`
    : unicos.join('; ');
};

// --- lectura de parámetros -------------------------------------------------

const parametro = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

const configurado = (p: ENSControlParameter | undefined): boolean => {
  if (!p) return false;
  if (Array.isArray(p.value)) return p.value.some(v => String(v).trim());
  return p.value !== undefined && p.value !== null && String(p.value).trim() !== '';
};

// Filas de una tabla repartidas en sus columnas declaradas. Sin columnas no se
// adivina la posición: el parámetro se trata como no configurado.
const filas = (
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
        fila[columna.name] = celdas[i] || '';
      });

      return fila;
    });

  return resultado.length ? resultado : undefined;
};

const etiqueta = (context: ENSPolicyContext, id: string): string => {
  const p = parametro(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

// --- máquinas y cobertura --------------------------------------------------

type Maquina = { nombre: string; eventos: ENSNormalizedEvent[] };

// Los hechos de cada máquina por separado: P-05 es una decisión POR MÁQUINA, y
// la cobertura la declara el latido de cada recolector.
const maquinas = (context: ENSPolicyContext): Maquina[] => {
  const porAgente = new Map<string, ENSNormalizedEvent[]>();

  context.events
    .filter(e => e.controlId === CONTROL)
    .forEach(e => {
      const clave = e.agentName || e.agentId || 'desconocida';
      porAgente.set(clave, [...(porAgente.get(clave) || []), e]);
    });

  return Array.from(porAgente.entries()).map(([nombre, eventos]) => ({ nombre, eventos }));
};

// ¿Declara el último latido de esta máquina, reciente y correcto, que la pasada
// miró ENTERA esta evidencia?
const cubierta = (
  maquina: Maquina,
  evidencia: string,
  ahora: number
): { si: boolean; motivo: string } => {
  const latidos = hechos(maquina.eventos, 'collector_run')
    .map(e => ({ e, t: new Date(e.timestamp).getTime() }))
    .filter(x => Number.isFinite(x.t) && x.t <= ahora + TOLERANCIA_FUTURO && x.t >= ahora - LATIDO_HORAS * HORA)
    .sort((a, b) => b.t - a.t);

  const ultimo = latidos[0]?.e;

  if (!ultimo) {
    return { si: false, motivo: `no consta ningún latido del recolector de ${maquina.nombre} en las últimas ${LATIDO_HORAS} h` };
  }

  if (campo(ultimo, 'resultado') !== 'completada') {
    return { si: false, motivo: `el último latido de ${maquina.nombre} no declara una pasada completada` };
  }

  const cubiertas = campo(ultimo, 'evidencias_cubiertas')
    .split(',')
    .map(x => x.trim());

  return cubiertas.includes(evidencia)
    ? { si: true, motivo: `el latido de ${maquina.nombre} (${ultimo.timestamp}) declara ${evidencia} cubierta` }
    : { si: false, motivo: `el último latido de ${maquina.nombre} (${ultimo.timestamp}) no declara ${evidencia} cubierta: esa pasada no pudo mirarla entera` };
};

// La degradación más reciente que el recolector emitió para una evidencia en
// esta máquina: es lo que dice POR QUÉ no se pudo mirar.
const ultimaDegradacion = (maquina: Maquina, evidencia: string): ENSNormalizedEvent | undefined =>
  hechos(maquina.eventos, 'evidence_state')
    .filter(e => e.evidenceId === evidencia || campo(e, 'evidence_id').split(',').includes(evidencia))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];

const degradacion = (maquina: Maquina, evidencia: string): string => {
  const ultima = ultimaDegradacion(maquina, evidencia);

  return ultima ? ` El recolector dice: ${campo(ultima, 'motivo')}` : '';
};

// La causa con la que el recolector declaró que no pudo mirar: él sabe si son
// las reglas de auditd sin cargar (CONFIGURATION) o una fuente que no pudo leer
// (COLLECTION). Sin degradación declarada, `porDefecto`.
const causaDeclarada = (maquina: Maquina, evidencia: string, porDefecto: ENSGapCause): ENSGapCause => {
  const ultima = ultimaDegradacion(maquina, evidencia);
  const declarada = ultima ? campo(ultima, 'causa').toUpperCase() : '';

  return ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'].includes(declarada)
    ? (declarada as ENSGapCause)
    : porDefecto;
};

// Una evidencia que la última pasada no miró entera: el motivo acaba con lo
// que dice el recolector, y la causa es la suya. Sin nada declarado, el
// latido que falta o no la cubre es un fallo de RECOGIDA.
const sinCobertura = (maquina: Maquina, evidencia: string, motivo: string): Medida =>
  sinMedir(`${motivo}${degradacion(maquina, evidencia)}`, causaDeclarada(maquina, evidencia, 'COLLECTION'));

const prefijo = (maquina: Maquina, varias: boolean): string =>
  varias ? `[${maquina.nombre}] ` : '';

// --- P-03: el vocabulario de algoritmos -----------------------------------

type Autorizado = { algoritmo: string; minimo?: number };

// P-03 por uso. Una fila sin algoritmo no autoriza nada.
const autorizados = (context: ENSPolicyContext): Map<string, Autorizado[]> | undefined => {
  const tabla = filas(context, 'P-03');

  if (!tabla) {
    return undefined;
  }

  const porUso = new Map<string, Autorizado[]>();

  tabla.forEach(fila => {
    const uso = sinTildes(fila.uso || '');
    const algoritmo = (fila.algoritmo || '').trim().toUpperCase();

    if (!uso || !algoritmo) {
      return;
    }

    const minimo = /^\d+$/.test((fila.longitud_min || '').trim())
      ? Number(fila.longitud_min)
      : undefined;

    porUso.set(uso, [...(porUso.get(uso) || []), { algoritmo, minimo }]);
  });

  return porUso.size ? porUso : undefined;
};

// Un elemento observado ('AES-GCM:256', 'SNTRUP761-X25519') contra su uso.
// `undefined` = no se puede decidir (P-03 exige longitud y el hecho no la trae).
const autorizado = (
  politica: Map<string, Autorizado[]>,
  uso: string,
  elemento: string
): { ok: boolean | undefined; motivo: string } => {
  const [familia, bitsTexto] = elemento.split(':');
  const algoritmo = (familia || '').trim().toUpperCase();
  const bits = /^\d+$/.test((bitsTexto || '').trim()) ? Number(bitsTexto) : undefined;

  const filasUso = politica.get(sinTildes(uso)) || [];
  const candidatas = filasUso.filter(f => f.algoritmo === algoritmo);

  if (!candidatas.length) {
    return { ok: false, motivo: `${elemento} no está autorizado para ${uso}` };
  }

  // Basta una fila que lo admita: dos filas del mismo algoritmo con mínimos
  // distintos no se contradicen, la más permisiva es la decisión.
  if (candidatas.some(f => f.minimo === undefined)) {
    return { ok: true, motivo: '' };
  }

  const minimo = Math.min(...candidatas.map(f => f.minimo as number));

  if (bits === undefined) {
    return { ok: undefined, motivo: `${elemento} (${uso}) no trae longitud y P-03 exige ${minimo} bits` };
  }

  return bits >= minimo
    ? { ok: true, motivo: '' }
    : { ok: false, motivo: `${elemento} está por debajo de los ${minimo} bits que P-03 exige para ${uso}` };
};

// Contrasta una lista de (uso, elemento, contexto) y devuelve la medida.
const contrasta = (
  politica: Map<string, Autorizado[]>,
  elementos: { uso: string; elemento: string; donde: string }[]
): { fallos: string[]; dudas: string[] } => {
  const fallos: string[] = [];
  const dudas: string[] = [];

  elementos.forEach(({ uso, elemento, donde }) => {
    const r = autorizado(politica, uso, elemento);

    if (r.ok === false) fallos.push(`${donde}: ${r.motivo}`);
    if (r.ok === undefined) dudas.push(`${donde}: ${r.motivo}`);
  });

  return { fallos, dudas };
};

// --- EV-01 · accesos al material ------------------------------------------

const ev01 = (context: ENSPolicyContext, todas: Maquina[], ahora: number): Medida => {
  const tabla = filas(context, 'P-08');

  if (!tabla) {
    return sinMedir(`${etiqueta(context, 'P-08')} está sin configurar: no hay contra qué contrastar quién accede a las claves.`, 'CONFIGURATION');
  }

  const cuentas = new Set(tabla.map(f => (f.cuenta || '').trim()).filter(Boolean));
  const varias = todas.length > 1;

  return combina(
    todas.map(m => {
      const accesos = hechos(m.eventos, 'key_material_accessed');
      const fuera = accesos.filter(e => !cuentas.has(campo(e, 'actor')));
      const cob = cubierta(m, 'EV-01', ahora);

      if (fuera.length) {
        return noCumple(
          `${prefijo(m, varias)}Accesos al material criptográfico por cuentas que no figuran en ${etiqueta(context, 'P-08')}: ${lista(
            fuera.map(e => `${campo(e, 'actor')} (${campo(e, 'sesion')}) · ${campo(e, 'acceso')} de ${campo(e, 'recurso')} con ${campo(e, 'proceso')}, ${campo(e, 'veces')} vez/veces hasta ${campo(e, 'ultima')}`)
          )}.`
        );
      }

      if (!cob.si) {
        return sinCobertura(
          m,
          'EV-01',
          `${prefijo(m, varias)}${accesos.length ? `Los ${accesos.length} acceso(s) observados son de cuentas autorizadas, pero` : 'No se ha observado ningún acceso, y'} ${cob.motivo}: lo que no se vigila no acredita nada.`
        );
      }

      return cumple(
        accesos.length
          ? `${prefijo(m, varias)}Los ${accesos.length} acceso(s) al material criptográfico son de cuentas de ${etiqueta(context, 'P-08')} (${lista(accesos.map(e => campo(e, 'actor')))}), y ${cob.motivo}.`
          : `${prefijo(m, varias)}Ningún acceso al material criptográfico en la ventana, y ${cob.motivo}.`
      );
    }),
    sinRecolector()
  );
};

// --- EV-03 · configuración de los servicios -------------------------------

const ev03 = (context: ENSPolicyContext, todas: Maquina[]): Medida => {
  const politica = autorizados(context);

  if (!politica) {
    return sinMedir(`${etiqueta(context, 'P-03')} está sin configurar: no hay algoritmos autorizados contra los que contrastar la configuración.`, 'CONFIGURATION');
  }

  const alcance = filas(context, 'P-04');

  if (!alcance) {
    return sinMedir(`${etiqueta(context, 'P-04')} está sin configurar: sin el alcance declarado no se puede afirmar que se hayan verificado todos los servicios criptográficos.`, 'CONFIGURATION');
  }

  const varias = todas.length > 1;

  return combina(
    todas.map(m => {
      const observados = hechos(m.eventos, 'crypto_config_observed');
      const servicios = new Set(observados.map(e => sinTildes(campo(e, 'servicio'))));

      const declarados = alcance
        .filter(f => (f.sistema || '').trim() === '*' || sinTildes(f.sistema || '') === sinTildes(m.nombre))
        .map(f => (f.servicio || '').trim())
        .filter(Boolean);

      const sinObservar = declarados.filter(s => !servicios.has(sinTildes(s)));

      const { fallos, dudas } = contrasta(
        politica,
        observados.flatMap(e =>
          campo(e, 'algoritmos')
            .split(',')
            .map(x => x.trim())
            .filter(Boolean)
            .map(elemento => ({
              uso: campo(e, 'uso'),
              elemento,
              donde: `${campo(e, 'servicio')} ${campo(e, 'elemento')}`,
            }))
        )
      );

      if (fallos.length) {
        return noCumple(`${prefijo(m, varias)}Algoritmos no autorizados en ${etiqueta(context, 'P-03')}: ${lista(fallos, 8)}.`);
      }

      // El recolector corrió y no vio ningún servicio: si dice por qué, su
      // causa; si no, el dato llegó y no basta.
      if (!observados.length) {
        return sinMedir(
          `${prefijo(m, varias)}No se ha observado la configuración de ningún servicio criptográfico.${degradacion(m, 'EV-03')}`,
          causaDeclarada(m, 'EV-03', 'EVIDENCE')
        );
      }

      if (sinObservar.length) {
        return sinMedir(`${prefijo(m, varias)}${etiqueta(context, 'P-04')} declara para esta máquina ${lista(sinObservar)}, y no se ha observado: un servicio declarado sin verificar deja R1 sin demostrar.`);
      }

      if (dudas.length) {
        return sinMedir(`${prefijo(m, varias)}No se puede contrastar: ${lista(dudas)}.`);
      }

      return cumple(
        `${prefijo(m, varias)}Todos los algoritmos que aceptan ${lista(Array.from(new Set(observados.map(e => campo(e, 'servicio')))))} (${observados.length} directiva(s)) figuran en ${etiqueta(context, 'P-03')} con la longitud exigida.`
      );
    }),
    sinRecolector()
  );
};

// --- EV-04 · lo negociado --------------------------------------------------

const ev04 = (context: ENSPolicyContext, todas: Maquina[], ahora: number): Medida => {
  const politica = autorizados(context);

  if (!politica) {
    return sinMedir(`${etiqueta(context, 'P-03')} está sin configurar: no hay algoritmos autorizados contra los que contrastar lo negociado.`, 'CONFIGURATION');
  }

  const varias = todas.length > 1;

  return combina(
    todas.map(m => {
      const negociados = hechos(m.eventos, 'crypto_protocol_negotiated');
      const cob = cubierta(m, 'EV-04', ahora);

      const { fallos, dudas } = contrasta(
        politica,
        negociados.map(e => ({
          uso: campo(e, 'uso'),
          elemento: campo(e, 'algoritmo'),
          donde: `${campo(e, 'servicio')} ${campo(e, 'identificador')} (${campo(e, 'veces')} vez/veces, última ${campo(e, 'ultima')})`,
        }))
      );

      if (fallos.length) {
        return noCumple(`${prefijo(m, varias)}Se han negociado algoritmos no autorizados en ${etiqueta(context, 'P-03')}: ${lista(fallos)}.`);
      }

      if (!cob.si) {
        return sinCobertura(
          m,
          'EV-04',
          `${prefijo(m, varias)}${negociados.length ? `Lo observado (${negociados.length} algoritmo(s) negociados) está autorizado, pero` : 'No se ha observado ninguna negociación, y'} ${cob.motivo}.`
        );
      }

      if (dudas.length) {
        return sinMedir(`${prefijo(m, varias)}No se puede contrastar: ${lista(dudas)}.`);
      }

      return cumple(
        negociados.length
          ? `${prefijo(m, varias)}Los ${negociados.length} algoritmo(s) negociados en la ventana figuran en ${etiqueta(context, 'P-03')}, y ${cob.motivo}.`
          : `${prefijo(m, varias)}No se ha negociado nada en la ventana, y ${cob.motivo}.`
      );
    }),
    sinRecolector()
  );
};

// --- EV-05 · generación en explotación ------------------------------------

const ev05 = (context: ENSPolicyContext, todas: Maquina[], ahora: number): Medida => {
  const tabla = filas(context, 'P-05');

  if (!tabla) {
    return sinMedir(`${etiqueta(context, 'P-05')} está sin configurar: no se sabe qué máquinas son medios de explotación.`, 'CONFIGURATION');
  }

  const varias = todas.length > 1;

  return combina(
    todas.map(m => {
      const fila = tabla.find(f => sinTildes(f.medio || '') === sinTildes(m.nombre));

      if (!fila) {
        return sinMedir(`${prefijo(m, varias)}${m.nombre} no figura en ${etiqueta(context, 'P-05')}: su función (generación o explotación) no está declarada.`, 'CONFIGURATION');
      }

      const funcion = sinTildes(fila.funcion || '');
      const generadas = hechos(m.eventos, 'key_generation_tool_executed');

      if (funcion === 'generacion') {
        // En un medio de generación, generar es su función. Lo que exige
        // op.exp.10.2 de ÉL es el aislamiento, y eso se declara en P-05 y no se
        // mide: no hay nada que afirmar desde aquí.
        return sinMedir(`${prefijo(m, varias)}${m.nombre} está declarado medio de GENERACIÓN en ${etiqueta(context, 'P-05')} (aislamiento: ${fila.aislamiento || 'sin declarar'}). Su aislamiento de los medios de explotación es declarativo y no se mide.`);
      }

      if (funcion !== 'explotacion') {
        return sinMedir(`${prefijo(m, varias)}La fila de ${m.nombre} en ${etiqueta(context, 'P-05')} no declara una función reconocible ('${fila.funcion}').`, 'CONFIGURATION');
      }

      if (generadas.length) {
        return noCumple(
          `${prefijo(m, varias)}${m.nombre} es un medio de EXPLOTACIÓN y en él se ha generado material criptográfico: ${lista(
            generadas.map(e => `${campo(e, 'actor')} ejecutó ${campo(e, 'herramienta')} ${campo(e, 'operacion')} ${campo(e, 'veces')} vez/veces (última ${campo(e, 'ultima')})`)
          )}.`
        );
      }

      const cob = cubierta(m, 'EV-05', ahora);

      return cob.si
        ? cumple(`${prefijo(m, varias)}${m.nombre} es un medio de explotación y no se ha generado ninguna clave en la ventana; ${cob.motivo}.`)
        : sinCobertura(m, 'EV-05', `${prefijo(m, varias)}No se ha observado ninguna generación en ${m.nombre}, pero ${cob.motivo}.`);
    }),
    sinRecolector()
  );
};

// --- EV-06 · claves retiradas presentes -----------------------------------

const ev06 = (context: ENSPolicyContext, todas: Maquina[], ahora: number): Medida => {
  const inventario = filas(context, 'P-01');

  if (!inventario) {
    return sinMedir(`${etiqueta(context, 'P-01')} está sin configurar: sin inventario no se sabe qué claves están retiradas.`, 'CONFIGURATION');
  }

  const archivo = filas(context, 'P-06');

  if (!archivo) {
    return sinMedir(`${etiqueta(context, 'P-06')} está sin configurar: no consta dónde se archivan las claves retiradas.`, 'CONFIGURATION');
  }

  // Un destino de archivo que es una máquina de EXPLOTACIÓN contradice el
  // requisito por sí mismo, se observe lo que se observe.
  const explotacion = new Set(
    (filas(context, 'P-05') || [])
      .filter(f => sinTildes(f.funcion || '') === 'explotacion')
      .map(f => sinTildes(f.medio || ''))
  );
  const archivoEnExplotacion = archivo.filter(f => explotacion.has(sinTildes(f.destino || '')));

  if (archivoEnExplotacion.length) {
    return noCumple(`${etiqueta(context, 'P-06')} declara como archivo de claves retiradas ${lista(archivoEnExplotacion.map(f => f.destino))}, que ${etiqueta(context, 'P-05')} declara medio de explotación.`);
  }

  const retiradas = inventario.filter(f => sinTildes(f.estado || '') === 'retirada');
  const varias = todas.length > 1;

  return combina(
    todas.map(m => {
      const claves = hechos(m.eventos, 'key_material_found');
      const cob = cubierta(m, 'EV-06', ahora);

      const presentes = retiradas.flatMap(f =>
        claves
          .filter(e =>
            (f.huella && campo(e, 'huella') && f.huella.trim() === campo(e, 'huella')) ||
            (f.ubicacion && f.ubicacion.trim() === campo(e, 'ruta'))
          )
          .map(e => `'${f.clave}' sigue en ${campo(e, 'ruta')}`)
      );

      if (presentes.length) {
        return noCumple(`${prefijo(m, varias)}Claves declaradas RETIRADAS en ${etiqueta(context, 'P-01')} siguen presentes en esta máquina: ${lista(presentes)}.`);
      }

      if (!cob.si) {
        return sinCobertura(m, 'EV-06', `${prefijo(m, varias)}No se ha encontrado ninguna clave retirada, pero ${cob.motivo}.`);
      }

      // Una retirada que solo se identifica por huella no se puede descartar
      // frente a una clave cuya huella no se pudo leer (cifrada, PKCS#12).
      const soloHuella = retiradas.filter(f => f.huella && !f.ubicacion);
      const sinHuella = claves.filter(e => !campo(e, 'huella'));

      if (soloHuella.length && sinHuella.length) {
        return sinMedir(`${prefijo(m, varias)}${soloHuella.length} clave(s) retirada(s) se identifican solo por huella, y de ${lista(sinHuella.map(e => campo(e, 'ruta')))} no se puede leer la huella: no se puede descartar que sean ellas.`);
      }

      return cumple(
        retiradas.length
          ? `${prefijo(m, varias)}Ninguna de las ${retiradas.length} clave(s) retirada(s) de ${etiqueta(context, 'P-01')} está presente entre las ${claves.length} clave(s) privadas encontradas; ${cob.motivo}.`
          : `${prefijo(m, varias)}${etiqueta(context, 'P-01')} no declara ninguna clave retirada, y el barrido de esta máquina está completo (${cob.motivo}).`
      );
    }),
    sinRecolector()
  );
};

// --- EV-07 · certificados --------------------------------------------------

const ev07Vigencia = (context: ENSPolicyContext, todas: Maquina[], ahora: number): Medida => {
  const p10 = parametro(context, 'P-10');
  const antelacion = configurado(p10) && /^\d+$/.test(String(p10?.value).trim())
    ? Number(p10?.value) * DIA
    : undefined;
  const varias = todas.length > 1;

  return combina(
    todas.map(m => {
      const certificados = hechos(m.eventos, 'certificate_observed');
      const cob = cubierta(m, 'EV-07', ahora);
      const caducados: string[] = [];
      const proximos: string[] = [];
      const ilegibles: string[] = [];

      certificados.forEach(e => {
        const fin = instante(campo(e, 'caduca'));
        const nombre = `${campo(e, 'sujeto')} (${campo(e, 'ruta')})`;

        if (fin === undefined) {
          ilegibles.push(nombre);
        } else if (fin < ahora) {
          caducados.push(`${nombre} caducó el ${campo(e, 'caduca')}`);
        } else if (antelacion !== undefined && fin - ahora <= antelacion) {
          proximos.push(`${nombre} caduca el ${campo(e, 'caduca')} (${((fin - ahora) / DIA).toFixed(0)} días)`);
        }
      });

      if (caducados.length) {
        return noCumple(`${prefijo(m, varias)}Certificados CADUCADOS que siguen instalados: ${lista(caducados)}. La retirada (fase 4 del ciclo de vida) no se gestiona.`);
      }

      if (ilegibles.length) {
        return sinMedir(`${prefijo(m, varias)}No se puede leer la caducidad de ${lista(ilegibles)}.`);
      }

      if (!cob.si) {
        return sinCobertura(m, 'EV-07', `${prefijo(m, varias)}No hay certificados caducados entre los observados, pero ${cob.motivo}.`);
      }

      const aviso = proximos.length
        ? ` PRÓXIMOS A CADUCAR según ${etiqueta(context, 'P-10')}: ${lista(proximos)}.`
        : antelacion === undefined && certificados.length
          ? ` Sin ${etiqueta(context, 'P-10')} no se avisa de los próximos a caducar.`
          : '';

      return cumple(
        certificados.length
          ? `${prefijo(m, varias)}Ninguno de los ${certificados.length} certificado(s) en disco está caducado.${aviso}`
          : `${prefijo(m, varias)}No hay certificados en disco fuera del almacén de CA del sistema, y ${cob.motivo}.`
      );
    }),
    sinRecolector()
  );
};

const ev07Algoritmos = (context: ENSPolicyContext, todas: Maquina[], ahora: number): Medida => {
  const politica = autorizados(context);

  if (!politica) {
    return sinMedir(`${etiqueta(context, 'P-03')} está sin configurar: no hay algoritmos autorizados contra los que contrastar los certificados.`, 'CONFIGURATION');
  }

  const varias = todas.length > 1;

  return combina(
    todas.map(m => {
      const certificados = hechos(m.eventos, 'certificate_observed');
      const cob = cubierta(m, 'EV-07', ahora);

      const elementos = certificados.flatMap(e => {
        const donde = `certificado ${campo(e, 'sujeto')} (${campo(e, 'ruta')})`;
        const hash = campo(e, 'hash_firma');

        return [
          { uso: 'firma', elemento: campo(e, 'algoritmo_clave'), donde },
          ...(hash && hash !== 'INTRINSECO' ? [{ uso: 'hash', elemento: hash, donde }] : []),
        ];
      });

      const { fallos, dudas } = contrasta(politica, elementos);

      if (fallos.length) {
        return noCumple(`${prefijo(m, varias)}Certificados con clave o firma no autorizadas en ${etiqueta(context, 'P-03')}: ${lista(fallos)}.`);
      }

      if (dudas.length) {
        return sinMedir(`${prefijo(m, varias)}No se puede contrastar: ${lista(dudas)}.`);
      }

      if (!cob.si) {
        return sinCobertura(m, 'EV-07', `${prefijo(m, varias)}Los certificados observados están autorizados, pero ${cob.motivo}.`);
      }

      return cumple(
        certificados.length
          ? `${prefijo(m, varias)}La clave y la firma de los ${certificados.length} certificado(s) figuran en ${etiqueta(context, 'P-03')}.`
          : `${prefijo(m, varias)}No hay certificados en disco fuera del almacén de CA del sistema, y ${cob.motivo}.`
      );
    }),
    sinRecolector()
  );
};

// La medida de una evidencia juzgada por primitiva, tal como la dejó su
// primitiva. Aquí no se re-juzga.
const deLaPrimitiva = (context: ENSPolicyContext, id: string): Medida => {
  const evidencia = context.evidences.find(e => e.id === id);
  const estado = evidencia?.status;
  const motivo =
    evidencia?.observations
      ?.filter(o => !o.startsWith('Pregunta de auditoría'))
      .slice(1)
      .join(' ') || '';

  if (estado === 'CUMPLE') return cumple(motivo);
  if (estado === 'NO_CUMPLE' || estado === 'PARCIAL') return noCumple(motivo);

  return sinMedir(motivo || `${id} no se ha podido medir.`, evidencia?.gapCause || 'COLLECTION');
};

// --- decisiones -------------------------------------------------------------

type TipoRegla = ENSPolicyDecision['trace']['ruleType'];

const REQUISITOS: Record<string, { niveles: string[]; parametros: string[]; tipo: TipoRegla }> = {
  'op.exp.10.1': { niveles: ['BAJO', 'MEDIO', 'ALTO'], parametros: ['P-01', 'P-02', 'P-07', 'P-08', 'P-10'], tipo: 'WHITELIST' },
  'op.exp.10.2': { niveles: ['BAJO', 'MEDIO', 'ALTO'], parametros: ['P-05'], tipo: 'TOOL_MATCH' },
  'op.exp.10.3': { niveles: ['BAJO', 'MEDIO', 'ALTO'], parametros: ['P-01', 'P-05', 'P-06'], tipo: 'PATH_MATCH' },
  'op.exp.10.r1.1': { niveles: ['MEDIO', 'ALTO'], parametros: ['P-03', 'P-04'], tipo: 'WHITELIST' },
};

const decide = (
  requisito: string,
  estado: Medida['estado'],
  evidencias: string[],
  parametros: string[],
  tipo: TipoRegla,
  ruleId: string,
  motivo: string,
  esperado: string,
  causa?: ENSGapCause
): ENSPolicyDecision => ({
  policyId: POLICY,
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
});

// Las que juzga su primitiva: ya tienen veredicto en la tabla de evidencias y
// no se repiten como decisión propia.
const DE_PRIMITIVA = ['EV-02', 'EV-08'];

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();
  const todas = maquinas(context);

  // op.exp.10.1 no se puede demostrar sin inventario ni procedimiento: lo dice
  // la ficha (condición A6) y es independiente de lo que mida la máquina.
  const faltanDocumentos = ['P-01', 'P-07'].filter(id => !configurado(parametro(context, id)));
  const documental: Medida = faltanDocumentos.length
    ? sinMedir(`Sin ${faltanDocumentos.map(id => etiqueta(context, id)).join(' ni ')} op.exp.10.1 no se puede evaluar: no hay inventario de claves o procedimiento de ciclo de vida contra el que contrastar la custodia medida.`, 'CONFIGURATION')
    : cumple(`${etiqueta(context, 'P-01')} y ${etiqueta(context, 'P-07')} están declarados.`);

  const vigencia = ev07Vigencia(context, todas, ahora);
  const algoritmosCert = ev07Algoritmos(context, todas, ahora);

  const medidas: Record<string, Medida> = {
    'EV-01': ev01(context, todas, ahora),
    'EV-02': deLaPrimitiva(context, 'EV-02'),
    'EV-03': ev03(context, todas),
    'EV-04': ev04(context, todas, ahora),
    'EV-05': ev05(context, todas, ahora),
    'EV-06': ev06(context, todas, ahora),
    'EV-08': deLaPrimitiva(context, 'EV-08'),
  };

  // EV-07 responde a dos requisitos con dos preguntas distintas.
  const porRequisito: Record<string, { id: string; medida: Medida }[]> = {
    'op.exp.10.1': [
      { id: 'P-01/P-07', medida: documental },
      { id: 'EV-01', medida: medidas['EV-01'] },
      { id: 'EV-02', medida: medidas['EV-02'] },
      { id: 'EV-07', medida: vigencia },
      { id: 'EV-08', medida: medidas['EV-08'] },
    ],
    'op.exp.10.2': [{ id: 'EV-05', medida: medidas['EV-05'] }],
    'op.exp.10.3': [{ id: 'EV-06', medida: medidas['EV-06'] }],
    'op.exp.10.r1.1': [
      { id: 'EV-03', medida: medidas['EV-03'] },
      { id: 'EV-04', medida: medidas['EV-04'] },
      { id: 'EV-07', medida: algoritmosCert },
    ],
  };

  const decisions: ENSPolicyDecision[] = [];

  Object.entries(REQUISITOS).forEach(([requisito, { niveles, parametros, tipo }]) => {
    // Un requisito que no aplica al nivel no decide nada: si lo hiciera, el
    // puente pintaría sus evidencias con un veredicto que el nivel no exige.
    if (!niveles.includes(context.level)) {
      return;
    }

    const propias = porRequisito[requisito];
    const estado = peor(propias.map(p => p.medida));

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`
    // (`find` devuelve la primera). Nombra solo las evidencias que la
    // sostienen, para que el puente no pinte una evidencia sana con el color de
    // otra.
    //
    // Si lo que la sostiene no es una evidencia sino un parámetro documental
    // (P-01 o P-07 sin declarar), se nombra el parámetro: una lista vacía haría
    // que el puente heredara TODAS las evidencias del requisito y pintara de
    // gris una custodia que sí se ha medido.
    const evidenciasResponsables = propias
      .filter(p => p.medida.estado === estado && p.id.startsWith('EV-'))
      .map(p => p.id);
    const responsables = evidenciasResponsables.length
      ? evidenciasResponsables
      : faltanDocumentos.length
        ? faltanDocumentos
        : propias.map(p => p.id).filter(id => id.startsWith('EV-'));

    decisions.push(
      decide(
        requisito,
        estado,
        responsables,
        parametros,
        tipo,
        requisito,
        propias.map(p => `${p.id} ${p.medida.estado}: ${p.medida.motivo}`).join(' | '),
        propias.map(p => `${p.id} CUMPLE`).join(' y '),
        causaComun(propias.filter(p => p.medida.estado === estado).map(p => p.medida))
      )
    );

    // Y una por evidencia medida aquí, con SU estado, para que la tabla de
    // evidencias diga lo que se midió de cada una y no el agregado.
    propias
      .filter(p => p.id.startsWith('EV-') && !DE_PRIMITIVA.includes(p.id))
      .forEach(p =>
        decisions.push(
          decide(
            requisito,
            p.medida.estado,
            [p.id],
            parametros,
            tipo,
            `${requisito}/${p.id}`,
            p.medida.motivo,
            `${p.id} CUMPLE`,
            p.medida.causa
          )
        )
      );
  });

  const variables: ENSRuntimeVariable[] = [
    ...Object.entries(medidas).map(([id, medida]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: medida.estado,
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: medida.motivo,
    })),
    {
      name: 'medida_EV07_vigencia',
      value: vigencia.estado,
      parameterIds: ['P-10'],
      evidenceIds: ['EV-07'],
      eventIds: [],
      description: vigencia.motivo,
    },
    {
      name: 'medida_EV07_algoritmos',
      value: algoritmosCert.estado,
      parameterIds: ['P-03'],
      evidenceIds: ['EV-07'],
      eventIds: [],
      description: algoritmosCert.motivo,
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
      // MEDIA y ALTA exigen exactamente lo mismo: base + R1.
      requirementId: 'op.exp.10.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04'],
      evidenceIds: ['EV-03', 'EV-04', 'EV-07'],
      ruleType: 'WHITELIST',
    },
    // R2 lo define el ENS pero no lo exige en ninguna categoría: sin niveles,
    // el motor lo evalúa NO_APLICA.
    {
      requirementId: 'op.exp.10.r2.1',
      levels: [],
      parameterIds: ['P-09'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
