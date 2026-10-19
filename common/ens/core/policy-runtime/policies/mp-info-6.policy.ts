// mp.info.6 · Copias de seguridad
//
// El agente OBSERVA y esta policy JUZGA. El recolector de cada origen de copia
// (el PBS de Proxmox o Zimbra 10 Network Edition con zmbackup) emite los mismos
// hechos con el mismo contrato:
//
//   backup_run        estado   la última copia: correcta, fallida, resultado
//   backup_schedule   estado   su planificación y cada cuántas horas
//   backup_retention  estado   la retención configurada y la copia más antigua
//   backup_access     estado   quién puede leer el repositorio y la clave
//   backup_storage    estado   sus destinos: en la misma máquina o fuera
//   restore_test      acción   una prueba de restauración sobre el testigo
//   evidence_state             solo NO_EVALUABLE: no pudo mirar, y por qué
//   collector_run              el latido de la pasada
//
// Todos llevan `origen` (`pbs`, `zimbra-ne`) y `objeto` (`fichero`, `buzones`,
// `directorio`), y pueden llevar `backup_id` cuando una máquina tiene varios
// trabajos de copia del mismo objeto. Cada combinación es UNA COPIA y se juzga
// por separado: el peor resultado manda, porque una copia del directorio que
// falla no la tapa la de los buzones que funciona. Un campo que el contrato no
// nombra no molesta: se ignora. Un origen que no está en esa lista se juzga
// igual: la policy no lo filtra.
//
// Una misma máquina puede tener dos recolectores (un servidor de buzones copia
// sus ficheros con el PBS y sus buzones con Zimbra), cada uno con su latido y
// a su minuto: la última pasada se busca por `origen`, y ninguno de los dos
// esconde los hechos del otro.
//
// Por qué policy y no primitivas del catálogo: el juicio es copia a copia, con
// varios ejes por evidencia (EV-01 cruza la última correcta con el resultado de
// la última ejecución; EV-05 cruza resultado, contenido, plazo y limpieza), y
// ninguna primitiva agrupa por copia ni hace ganar al peor.
//
// Invariantes, las mismas que en `op-exp-8.policy.ts`:
//   - el agente emite instantes, no edades: toda antigüedad se mide aquí contra
//     `context.now`;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo; nunca un CUMPLE por
//     ausencia, ni un NO_CUMPLE por ausencia;
//   - lo que el recolector declara que no pudo medir (evidence_state
//     NO_EVALUABLE) sale NO_EVALUABLE con SU causa; un evidence_state con
//     veredicto no se lee;
//   - la policy nunca inventa política: ningún plazo, umbral o lista tiene
//     valor por defecto (P-02, el margen, vale cero si falta: es lo que declara
//     su ficha).
//
// El alcance: el motor solo evalúa este control en la fila de las máquinas que
// declara P-04 (`scopeParameter` del catálogo). Si P-04 no declara ninguna, no
// hay qué medir y todo sale NO_EVALUABLE por CONFIGURACIÓN.
//
// Tipos y utilidades desde el fichero, nunca desde un barrel: por ahí vuelve el
// ciclo del TDZ de Settings.
// El motivo compuesto, en texto y por partes (`reasonParts`).
import { conPartes, motivoCompuesto, partesDe } from './policy-kit';
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
  toParameterListItems,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';
import { getEvidenceDefinitions } from '../../evidence/registry';

const CONTROL = 'mp.info.6';
const POLICY = 'policy.mp.info.6';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// Frescura de un hecho de estado. El recolector corre cada hora y reemite el
// estado entero en cada pasada: 26 h tolera un día de fallos sin convertir una
// foto vieja en la situación de hoy. Es tolerancia de OBSERVACIÓN, no política.
const FRESCURA_HORAS = 26;

// Hechos de una misma pasada: el recolector los emite en pocos minutos.
const MISMA_PASADA = 5 * 60 * 1000;

// Un hecho del futuro no acredita nada (misma tolerancia de reloj que el latido).
const TOLERANCIA_FUTURO = 5 * 60 * 1000;

// `causa` solo con NO_EVALUABLE: de quién es el hueco (ver `ENSGapCause`).
type Medida = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL'>;
  motivo: string;
  causa?: ENSGapCause;
};

const cumple = (motivo: string): Medida => ({ estado: 'CUMPLE', motivo });
const noCumple = (motivo: string): Medida => ({ estado: 'NO_CUMPLE', motivo });
// Por defecto EVIDENCE: el dato llegó y no basta. Falta de parámetro y falta de
// hechos lo dicen expresamente, y lo que el recolector declara llega con SU
// causa.
const sinMedir = (motivo: string, causa: ENSGapCause = 'EVIDENCE'): Medida => ({
  estado: 'NO_EVALUABLE',
  motivo,
  causa,
});

// La causa de varias medidas sin medir, con el mismo orden que el motor
// (`resolveGapCause`): COLLECTION solo si lo dicen todas; CONFIGURATION si lo
// dice alguna; si no, EVIDENCE.
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

const GRAVEDAD: Record<Medida['estado'], number> = {
  NO_APLICA: -1,
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

// Varias medidas en una: el estado de la peor, y en el motivo lo que lo explica
// (lo que falla o falta; si todo cumple, lo medido).
const combina = (partes: Medida[]): Medida => {
  const estado = peor(partes);

  if (estado === 'CUMPLE') {
    return cumple(partes.map(p => p.motivo).join(' '));
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

// --- lectura de hechos -----------------------------------------------------

// El normalizador parte un evento con `evidence_id=A,B` en uno por evidencia
// (`<id>#A`, `<id>#B`). Aquí se juzga el HECHO, así que se cuenta una vez.
const hechos = (
  context: ENSPolicyContext,
  tipo: string
): ENSNormalizedEvent[] => {
  const vistos = new Set<string>();

  return context.events.filter(event => {
    if (event.controlId !== CONTROL || event.eventType !== tipo) {
      return false;
    }

    // Un hecho sin `origen` es del vocabulario anterior (el latido y los
    // estados que emitía el recolector de la versión previa): no se juzga. Si
    // contara, el latido viejo de una máquina ya actualizada saldría como un
    // recolector más que dejó de informar.
    if (!campo(event, 'origen')) {
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

// `-` es como el contrato dice «no hay»: ninguna copia correcta, ninguna
// retención configurada, ninguna clave.
const vacio = (texto: string): boolean => texto === '' || texto === '-';

const numero = (texto: string): number | undefined => {
  const limpio = String(texto).trim().replace(',', '.');

  if (!/^[+-]?\d+(\.\d+)?$/.test(limpio)) {
    return undefined;
  }

  const valor = Number(limpio);

  return Number.isFinite(valor) ? valor : undefined;
};

const instante = (texto: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(texto)) {
    return undefined;
  }

  const valor = new Date(texto).getTime();

  return Number.isFinite(valor) ? valor : undefined;
};

// Modo de permisos en octal (`750`, `0600`).
const octal = (texto: string): number | undefined =>
  /^[0-7]{3,4}$/.test(texto) ? parseInt(texto, 8) : undefined;

const momento = (event: ENSNormalizedEvent): number => {
  const t = Date.parse(event.timestamp);

  return Number.isNaN(t) ? 0 : t;
};

const iso = (t: number): string => new Date(t).toISOString().replace('.000Z', 'Z');

const horas = (ms: number): string => (ms / HORA).toFixed(1);

const dias = (ms: number): number => Math.floor(ms / DIA);

const lista = (elementos: string[], maximo = 5): string =>
  elementos.length > maximo
    ? `${elementos.slice(0, maximo).join('; ')} y ${elementos.length - maximo} más`
    : elementos.join('; ');

const masReciente = (eventos: ENSNormalizedEvent[]): ENSNormalizedEvent =>
  [...eventos].sort((a, b) => momento(b) - momento(a))[0];

// A4 · los puntos de montaje separados por comas de `montajes_omitidos` y de
// `montajes_omitidos_aceptados`. `-` es que no hay log de esa pasada (se
// desconoce, no es que no haya ninguno) y vacío es que no dejó ninguno fuera:
// los dos se leen igual, como conjunto vacío.
const montajesOmitidos = (texto: string): string[] =>
  vacio(texto) ? [] : texto.split(',').map(m => m.trim()).filter(Boolean);

// --- la copia a la que se refiere un hecho ---------------------------------

const OBJETO: Record<string, string> = {
  fichero: 'copia de ficheros',
  buzones: 'copia de los buzones',
  directorio: 'copia del directorio',
};

// Un hecho es de un ORIGEN y de un OBJETO (el par) y, si el recolector lo
// distingue, de un trabajo de copia concreto (`backup_id`). Un hecho sin
// `backup_id` es del par entero: la planificación que lee el recolector del
// PBS en el cron vale para todos sus backup-id, y un `evidence_state` sin
// `backup_id` habla de todo el par.
const parDe = (e: ENSNormalizedEvent): string => `${campo(e, 'origen')}|${campo(e, 'objeto')}`;

const backupId = (e: ENSNormalizedEvent): string => campo(e, 'backup_id');

// La copia de un hecho, para los que se agrupan por copia (EV-05).
const claveDe = (e: ENSNormalizedEvent): string => `${parDe(e)}|${backupId(e)}`;

const nombreDe = (e: ENSNormalizedEvent): string => {
  const objeto = campo(e, 'objeto');
  const id = backupId(e);

  return `${OBJETO[objeto] || (objeto ? `copia de ${objeto}` : 'copia sin objeto declarado')}${id ? ` «${id}»` : ''} (${campo(e, 'origen') || 'origen sin declarar'})`;
};

// El par, sin el trabajo de copia: la prueba de restauración es del par.
const nombreDelPar = (e: ENSNormalizedEvent): string => {
  const objeto = campo(e, 'objeto');

  return `${OBJETO[objeto] || (objeto ? `copia de ${objeto}` : 'copia sin objeto declarado')} (${campo(e, 'origen') || 'origen sin declarar'})`;
};

const DE_OBJETO: Record<string, string> = {
  fichero: 'los ficheros',
  buzones: 'los buzones',
  directorio: 'el directorio',
};

// Los hechos de ESTADO del contrato: los que el recolector reemite enteros en
// cada pasada y dicen qué copias tiene hoy la máquina.
const TIPOS_DE_ESTADO = ['backup_run', 'backup_schedule', 'backup_retention', 'backup_access', 'backup_storage'];

// --- la última pasada de cada origen y las degradaciones -------------------

// En una misma máquina puede haber DOS recolectores de mp.info.6: un servidor
// de buzones copia sus ficheros con el PBS y sus buzones con Zimbra, y cada
// recolector pasa cada hora a su minuto. La pasada de uno no dice nada del
// estado que mide el otro, así que la última pasada se busca POR ORIGEN (el
// motor hace lo mismo al recortar por latidos, ver `stateFactCollectorField`).
type PasadaDeOrigen = {
  origen: string;
  // Los hechos de estado de su última pasada: por tipo, lo emitido en la hora
  // anterior a su último hecho, si no es más viejo que FRESCURA_HORAS.
  vigentes: ENSNormalizedEvent[];
  // Su último hecho de estado, vigente o no.
  ultimo: number;
};

const pasadasPorOrigen = (
  context: ENSPolicyContext,
  tipos: string[],
  ahora: number
): PasadaDeOrigen[] => {
  const todos = tipos
    .flatMap(tipo => hechos(context, tipo))
    .filter(e => momento(e) <= ahora + TOLERANCIA_FUTURO);

  return Array.from(new Set(todos.map(e => campo(e, 'origen')))).map(origen => {
    const suyos = todos.filter(e => campo(e, 'origen') === origen);

    return {
      origen,
      ultimo: Math.max(...suyos.map(momento)),
      vigentes: tipos.flatMap(tipo => {
        const delTipo = suyos.filter(e => e.eventType === tipo);

        if (!delTipo.length) {
          return [];
        }

        const ultimoDelTipo = Math.max(...delTipo.map(momento));

        return ahora - ultimoDelTipo > FRESCURA_HORAS * HORA
          ? []
          : delTipo.filter(e => ultimoDelTipo - momento(e) < HORA);
      }),
    };
  });
};

// Los hechos de estado vigentes de todos los orígenes.
const vigentes = (context: ENSPolicyContext, tipo: string, ahora: number): ENSNormalizedEvent[] =>
  pasadasPorOrigen(context, [tipo], ahora).flatMap(p => p.vigentes);

// Lo que el recolector declaró que no pudo medir de una evidencia. Solo cuenta
// un `evidence_state` con `estado=NO_EVALUABLE`: el recolector no pone
// veredictos, y si alguno antiguo lo hace, no se lee.
const degradaciones = (
  context: ENSPolicyContext,
  evidencia: string,
  ahora: number
): ENSNormalizedEvent[] =>
  hechos(context, 'evidence_state').filter(
    e =>
      campo(e, 'evidence_id').split(',').map(x => x.trim()).includes(evidencia) &&
      String(e.status || campo(e, 'estado')).toUpperCase() === 'NO_EVALUABLE' &&
      momento(e) <= ahora + TOLERANCIA_FUTURO
  );

// Con la causa que ÉL declara: es quien sabe si falta un registro que la
// organización no mantiene (CONFIGURATION) o una fuente que no pudo leer
// (COLLECTION). Sin causa declarada, COLLECTION.
const comoDegradacion = (e: ENSNormalizedEvent): Medida => {
  const declarada = campo(e, 'causa').toUpperCase();
  const causa: ENSGapCause = ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'].includes(declarada)
    ? (declarada as ENSGapCause)
    : 'COLLECTION';

  return sinMedir(
    `${nombreDe(e)}: el recolector no ha podido medirlo${declarada ? ` (${declarada})` : ''}: ${campo(e, 'motivo') || 'sin motivo declarado'}.`,
    causa
  );
};

const sinHechos = (ultimo: number | undefined, queFalta: string): Medida =>
  sinMedir(
    ultimo
      ? `El último ${queFalta} es del ${iso(ultimo)}, hace más de ${FRESCURA_HORAS} h: el recolector de mp.info.6 no está informando.`
      : `No consta ningún ${queFalta} de esta máquina: el recolector de mp.info.6 no está desplegado en ella o no informa.`,
    'COLLECTION'
  );

// Una degradación frente a los hechos de lo que declara. De una pasada
// POSTERIOR a todos ellos, los SUSTITUYE: el estado de hoy no se ha podido
// ver. De la MISMA pasada, se SUMA a lo medido (una parte se midió y otra no).
// Si hay un hecho posterior, ya NO CUENTA: la pasada siguiente sí pudo mirar.
const frenteALosHechos = (
  hechosQueCubre: ENSNormalizedEvent[],
  degradacion: ENSNormalizedEvent | undefined
): 'sustituye' | 'suma' | 'no_cuenta' => {
  if (!degradacion) {
    return 'no_cuenta';
  }

  if (!hechosQueCubre.length) {
    return 'sustituye';
  }

  const ultimo = Math.max(...hechosQueCubre.map(momento));
  const t = momento(degradacion);

  if (t > ultimo + MISMA_PASADA) {
    return 'sustituye';
  }

  return t >= ultimo - MISMA_PASADA ? 'suma' : 'no_cuenta';
};

// Juzga una evidencia de ESTADO copia a copia. Por cada origen, los hechos de
// su última pasada se reparten por par (origen y objeto) y, dentro del par, por
// `backup_id`; un hecho sin `backup_id` vale para todas las copias del par.
// Cada copia la juzga `juzga` con TODOS sus hechos de esa pasada; manda el peor.
//
// Las degradaciones cuentan si tienen menos de FRESCURA_HORAS y según
// `frenteALosHechos`: la de una copia frente a los hechos de esa copia, y la
// del par entero frente a los de todo el par. Un origen cuyo recolector ha
// dejado de informar sale NO_EVALUABLE aunque el otro informe cada hora.
const porCopia = (
  context: ENSPolicyContext,
  evidencia: string,
  tipos: string[],
  ahora: number,
  queFalta: string,
  juzga: (nombre: string, hechosDeLaCopia: ENSNormalizedEvent[]) => Medida
): Medida => {
  const pasadas = pasadasPorOrigen(context, tipos, ahora);
  const declaradas = degradaciones(context, evidencia, ahora);
  const recientes = declaradas.filter(e => ahora - momento(e) <= FRESCURA_HORAS * HORA);
  const origenes = Array.from(
    new Set([...pasadas.map(p => p.origen), ...recientes.map(e => campo(e, 'origen'))])
  );

  if (!origenes.length) {
    const ultimo = declaradas.length ? Math.max(...declaradas.map(momento)) : undefined;

    return sinHechos(ultimo, queFalta);
  }

  const ultimaDe = (eventos: ENSNormalizedEvent[]): ENSNormalizedEvent | undefined =>
    eventos.length ? masReciente(eventos) : undefined;

  const medidas = origenes.flatMap(origen => {
    const pasada = pasadas.find(p => p.origen === origen);
    const suyos = pasada ? pasada.vigentes : [];
    const susDegradaciones = recientes.filter(e => campo(e, 'origen') === origen);

    if (!suyos.length && !susDegradaciones.length) {
      return [sinHechos(pasada?.ultimo, `${queFalta} de origen ${origen || 'sin declarar'}`)];
    }

    const pares = Array.from(new Set([...suyos, ...susDegradaciones].map(parDe)));

    return pares.flatMap(par => {
      const delPar = suyos.filter(e => parDe(e) === par);
      const degradacionesDelPar = susDegradaciones.filter(e => parDe(e) === par);
      const generales = delPar.filter(e => !backupId(e));
      const ids = Array.from(
        new Set([...delPar, ...degradacionesDelPar].map(backupId).filter(Boolean))
      );

      const copias = ids.length
        ? ids.map(id => ({ id, hechos: [...delPar.filter(e => backupId(e) === id), ...generales] }))
        : generales.length
        ? [{ id: '', hechos: generales }]
        : [];

      const medidasDelPar = copias.map(copia => {
        const propios = copia.hechos.filter(e => backupId(e) === copia.id);
        const degradacion = copia.id
          ? ultimaDe(degradacionesDelPar.filter(e => backupId(e) === copia.id))
          : undefined;
        const frente = frenteALosHechos(propios, degradacion);

        if (frente === 'sustituye') {
          return comoDegradacion(degradacion as ENSNormalizedEvent);
        }

        const medida = propios.length
          ? juzga(nombreDe(propios[0]), deLaUltimaPasada(copia.hechos, tipos))
          : juzga(nombreDe(copia.hechos[0]), deLaUltimaPasada(copia.hechos, tipos));

        return frente === 'suma' ? combina([medida, comoDegradacion(degradacion as ENSNormalizedEvent)]) : medida;
      });

      // La degradación del par entero, frente a todos los hechos del par.
      const general = ultimaDe(degradacionesDelPar.filter(e => !backupId(e)));
      const frente = frenteALosHechos(delPar, general);

      if (frente === 'sustituye') {
        return [comoDegradacion(general as ENSNormalizedEvent)];
      }

      return frente === 'suma' ? [...medidasDelPar, comoDegradacion(general as ENSNormalizedEvent)] : medidasDelPar;
    });
  });

  return combina(medidas);
};

// Los hechos de una copia en su última pasada, tipo a tipo: la planificación
// puede llegar en otra pasada que el estado de la copia.
const deLaUltimaPasada = (copia: ENSNormalizedEvent[], tipos: string[]): ENSNormalizedEvent[] =>
  tipos.flatMap(tipo => {
    const delTipo = copia.filter(e => e.eventType === tipo);
    const ultimoDelTipo = Math.max(...delTipo.map(momento));

    return delTipo.filter(e => ultimoDelTipo - momento(e) <= MISMA_PASADA);
  });

// --- lectura de parámetros -------------------------------------------------

const parametro = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

const etiqueta = (context: ENSPolicyContext, id: string): string => {
  const p = parametro(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

const escalar = (context: ENSPolicyContext, id: string): number | undefined => {
  const valor = parametro(context, id)?.value;

  if (valor === undefined || valor === null || Array.isArray(valor)) {
    return undefined;
  }

  return numero(String(valor));
};

// Las entradas de un parámetro lista, sin repetir. Un número o un booleano
// sueltos no son una lista (no nombran ninguna cuenta ni ninguna máquina).
const entradas = (context: ENSPolicyContext, id: string): string[] => {
  const valor = parametro(context, id)?.value;

  if (!Array.isArray(valor) && typeof valor !== 'string') {
    return [];
  }

  return Array.from(new Set(toParameterListItems(valor)));
};

const faltaParametro = (context: ENSPolicyContext, id: string, para: string): Medida =>
  sinMedir(`${etiqueta(context, id)} está sin configurar: no hay contra qué juzgar ${para}.`, 'CONFIGURATION');

// Las máquinas de P-04, cada una con su criticidad (`srv-bd01 | ALTA`).
const alcance = (context: ENSPolicyContext): { maquina: string; criticidad: string }[] =>
  entradas(context, 'P-04')
    .map(entrada => {
      const [maquina, criticidad] = toTableRowCells(entrada);

      return { maquina: maquina || '', criticidad: (criticidad || '').toUpperCase() };
    })
    .filter(fila => fila.maquina);

// La máquina de la fila: la de sus propios hechos.
const maquinaDeLaFila = (context: ENSPolicyContext): string | undefined =>
  context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName;

// --- las evidencias --------------------------------------------------------

// EV-01 · la última copia correcta existe y la última ejecución no la
// contradice. `ultima_correcta=-` es un hecho medido: el recolector leyó el
// sistema de copias y no hay ninguna buena (recién instalado, o solo fallos).
const ev01 = (context: ENSPolicyContext, ahora: number): Medida =>
  porCopia(context, 'EV-01', ['backup_run'], ahora, 'estado de las copias', (nombre, copias) =>
    combina(
      copias.map(e => {
        const correcta = campo(e, 'ultima_correcta');
        const fallida = campo(e, 'ultima_fallida');
        const conError = campo(e, 'resultado_ultima') === 'error';
        const cuandoFallo = !vacio(fallida) ? ` el ${fallida}` : '';
        const partes: Medida[] = [];

        if (vacio(correcta)) {
          partes.push(
            noCumple(
              `${nombre}: no consta ninguna copia terminada correctamente${conError ? `; la última terminó con error${cuandoFallo}` : ''}.`
            )
          );
        } else {
          const tc = instante(correcta);

          if (tc === undefined) {
            partes.push(sinMedir(`${nombre}: la fecha de la última copia correcta no se puede leer (${correcta}).`));
          } else {
            const tf = instante(fallida);

            if (conError || (tf !== undefined && tf > tc)) {
              partes.push(noCumple(`${nombre}: la última ejecución de la copia terminó con error${cuandoFallo}; la última correcta es del ${correcta}.`));
            } else {
              const tipo = campo(e, 'tipo');
              const destino = campo(e, 'destino');

              partes.push(
                cumple(
                  `${nombre}: última copia correcta el ${correcta}${tipo || destino ? ` (${[tipo, destino ? `destino ${destino}` : ''].filter(Boolean).join(', ')})` : ''}.`
                )
              );
            }
          }
        }

        // A4 · los discos montados aparte que la última ejecución dejó fuera
        // de la copia: no basta con que la copia haya terminado bien, porque
        // deja datos sin proteger. Los que la organización acepta a propósito
        // no cuentan, pero se citan igual.
        const omitidos = montajesOmitidos(campo(e, 'montajes_omitidos'));

        if (omitidos.length) {
          partes.push(
            noCumple(
              `${nombre}: deja fuera de la copia ${lista(omitidos)}: están en otro disco montado aparte y no se incluyeron en la copia.`
            )
          );
        }

        const medida = combina(partes);
        const aceptados = montajesOmitidos(campo(e, 'montajes_omitidos_aceptados'));

        return aceptados.length
          ? { ...medida, motivo: `${medida.motivo} La organización acepta la omisión de ${lista(aceptados)}.` }
          : medida;
      })
    )
  );

// EV-02 · la antigüedad de la última copia correcta, contra P-01 + P-02; y la
// planificación, si la hay, contra P-01.
// El plazo de la copia: P-01 más el margen de P-02. P-02 sin valor se aplica
// sin margen, como dice su ficha; con un valor que no se puede leer no es un
// margen ausente, es uno ilegible.
const plazoDeCopia = (
  context: ENSPolicyContext
): { frecuencia: number; margen: number; plazo: number } | Medida => {
  const frecuencia = escalar(context, 'P-01');

  if (frecuencia === undefined || frecuencia <= 0) {
    return faltaParametro(context, 'P-01', 'la antigüedad de la última copia');
  }

  const margenDeclarado = parametro(context, 'P-02')?.value;
  const margen =
    margenDeclarado === undefined || String(margenDeclarado).trim() === ''
      ? 0
      : escalar(context, 'P-02');

  if (margen === undefined || margen < 0) {
    return sinMedir(`${etiqueta(context, 'P-02')} tiene un valor que no es un número de horas (${String(margenDeclarado)}).`, 'CONFIGURATION');
  }

  return { frecuencia, margen, plazo: frecuencia + margen };
};

const ev02 = (context: ENSPolicyContext, ahora: number): Medida => {
  const plazoLeido = plazoDeCopia(context);

  if ('estado' in plazoLeido) {
    return plazoLeido;
  }

  const { frecuencia, margen, plazo } = plazoLeido;
  const plazoTexto = `las ${plazo} h de P-01 (${frecuencia} h) + P-02 (${margen} h)`;

  return porCopia(context, 'EV-02', ['backup_run', 'backup_schedule'], ahora, 'estado de las copias', (nombre, copias) => {
    const ejecuciones = copias.filter(e => e.eventType === 'backup_run');
    const planes = copias.filter(e => e.eventType === 'backup_schedule');
    const partes: Medida[] = [];

    // Sin el estado de la copia, lo que falta es un hecho que el recolector no
    // ha entregado: es de RECOGIDA, como la degradación que suele acompañarlo.
    if (!ejecuciones.length) {
      partes.push(sinMedir(`${nombre}: consta su planificación pero no el estado de la última copia.`, 'COLLECTION'));
    }

    ejecuciones.forEach(e => {
      const correcta = campo(e, 'ultima_correcta');

      if (vacio(correcta)) {
        partes.push(noCumple(`${nombre}: no consta ninguna copia correcta, así que ninguna está dentro de ${plazoTexto}.`));

        return;
      }

      const tc = instante(correcta);

      if (tc === undefined || tc > ahora + TOLERANCIA_FUTURO) {
        partes.push(sinMedir(`${nombre}: la fecha de la última copia correcta no es válida (${correcta}).`));

        return;
      }

      const edad = ahora - tc;

      partes.push(
        edad > plazo * HORA
          ? noCumple(`${nombre}: la última copia correcta es del ${correcta}, hace ${horas(edad)} h, más que ${plazoTexto}.`)
          : cumple(`${nombre}: última copia correcta hace ${horas(edad)} h, dentro de ${plazoTexto}.`)
      );
    });

    // `planificacion=-` es una ausencia MEDIDA: el recolector ha leído dónde se
    // planifica y no hay ninguna copia programada.
    const conPlan = planes.filter(e => !vacio(campo(e, 'planificacion')));
    const sinPlan = planes.filter(e => vacio(campo(e, 'planificacion')));

    if (!conPlan.length && sinPlan.length) {
      const fuente = campo(sinPlan[0], 'fuente');

      partes.push(noCumple(`${nombre}: no hay ninguna copia planificada${fuente ? ` (según ${fuente})` : ''}.`));
    }

    // La planificación: la más frecuente de la copia (una completa semanal y
    // una incremental diaria planifican una copia al día).
    const intervalos = conPlan
      .map(e => ({ e, cada: numero(campo(e, 'intervalo_horas')) }))
      .filter((p): p is { e: ENSNormalizedEvent; cada: number } => p.cada !== undefined && p.cada > 0)
      .sort((a, b) => a.cada - b.cada);

    if (intervalos.length) {
      const { e, cada } = intervalos[0];
      const como = `${campo(e, 'planificacion') || 'sin describir'}, ${campo(e, 'fuente') || 'fuente sin declarar'}`;

      partes.push(
        cada > frecuencia
          ? noCumple(`${nombre}: está planificada cada ${cada} h (${como}), más espaciada que las ${frecuencia} h de P-01.`)
          : cumple(`${nombre}: planificada cada ${cada} h (${como}).`)
      );
    }

    return combina(partes);
  });
};

// EV-03 · la retención configurada contra P-03, con la copia más antigua que
// se conserva. Sin retención configurada, la única prueba de que se conserva
// el plazo es que quede una copia así de antigua.
const ev03 = (context: ENSPolicyContext, ahora: number): Medida => {
  const minimo = escalar(context, 'P-03');

  if (minimo === undefined || minimo <= 0) {
    return faltaParametro(context, 'P-03', 'cuánto tiempo se conservan las copias');
  }

  return porCopia(context, 'EV-03', ['backup_retention'], ahora, 'estado de la retención de las copias', (nombre, copias) =>
    combina(
      copias.map(e => {
        const configurada = campo(e, 'retencion_dias');
        const retencion = numero(configurada);
        const antigua = campo(e, 'copia_mas_antigua');
        const ta = instante(antigua);
        const conserva = ta !== undefined ? ` La copia más antigua que se conserva es del ${antigua} (${dias(ahora - ta)} días).` : '';

        if (retencion !== undefined) {
          return retencion < minimo
            ? noCumple(`${nombre}: retención configurada de ${retencion} días, menos que los ${minimo} de P-03.${conserva}`)
            : cumple(`${nombre}: retención configurada de ${retencion} días, al menos los ${minimo} de P-03.${conserva}`);
        }

        if (!vacio(configurada)) {
          return sinMedir(`${nombre}: la retención configurada no es un número de días (${configurada}).`);
        }

        if (ta !== undefined && ahora - ta >= minimo * DIA) {
          return cumple(`${nombre}: no consta una retención configurada, y se conservan copias desde el ${antigua} (${dias(ahora - ta)} días), al menos los ${minimo} de P-03.`);
        }

        return sinMedir(
          `${nombre}: no consta una retención configurada${ta !== undefined ? ` y la copia más antigua (${antigua}, ${dias(ahora - ta)} días) no llega a los ${minimo} de P-03` : ''}: no se puede afirmar que las copias se conserven ese plazo.`
        );
      })
    )
  );
};

// EV-04 · quién puede leer el repositorio, contra P-07; y que la clave de
// cifrado solo la pueda leer su dueño.
const ev04 = (context: ENSPolicyContext, ahora: number): Medida => {
  const autorizadas = entradas(context, 'P-07');

  if (!autorizadas.length) {
    return faltaParametro(context, 'P-07', 'quién puede leer las copias');
  }

  return porCopia(context, 'EV-04', ['backup_access'], ahora, 'estado del acceso a las copias', (nombre, copias) =>
    combina(
      copias.map(e => {
        const ruta = campo(e, 'ruta') || '(ruta sin declarar)';
        const modo = campo(e, 'modo');
        const permisos = octal(modo);
        // `-` es el conjunto vacío (nadie, además de root, que lo lee todo);
        // un campo vacío es que el recolector no lo ha informado.
        const declaradas = campo(e, 'cuentas_con_lectura');
        const cuentas = declaradas
          .split(',')
          .map(c => c.trim())
          .filter(c => c && c !== '-');
        const partes: Medida[] = [];

        if (cuentas.includes('*') || (permisos !== undefined && (permisos & 0o004) !== 0)) {
          partes.push(noCumple(`${nombre}: el repositorio ${ruta}${modo ? ` (modo ${modo})` : ''} lo puede leer cualquier cuenta de la máquina.`));
        }

        // Comparación LITERAL: en Linux 'Backup' y 'backup' son dos cuentas.
        const ajenas = cuentas.filter(c => c !== '*' && !autorizadas.includes(c));

        if (ajenas.length) {
          partes.push(noCumple(`${nombre}: el repositorio ${ruta} lo pueden leer cuentas que P-07 no autoriza: ${ajenas.join(', ')}.`));
        }

        if (declaradas === '') {
          partes.push(sinMedir(`${nombre}: el recolector no ha informado de qué cuentas pueden leer ${ruta}.`));
        } else if (!partes.length) {
          partes.push(
            cumple(
              cuentas.length
                ? `${nombre}: ${ruta} solo lo pueden leer cuentas autorizadas en P-07 (${cuentas.join(', ')}).`
                : `${nombre}: ${ruta} no lo puede leer ninguna cuenta además de root.`
            )
          );
        }

        const clave = campo(e, 'clave_ruta');

        if (!vacio(clave)) {
          const modoClave = campo(e, 'clave_modo');
          const permisosClave = octal(modoClave);

          // La clave solo la lee su dueño (0600 o 0400, lo que piden las guías
          // de los runbooks). Con lectura de grupo ya incumple: quien la lee
          // descifra todas las copias, y el grupo de un fichero suele ser el
          // de un servicio, no una cuenta de P-07.
          if (permisosClave === undefined) {
            partes.push(sinMedir(`${nombre}: no se ha podido leer el modo de la clave de cifrado ${clave} (${modoClave || 'vacío'}).`));
          } else if ((permisosClave & 0o044) !== 0) {
            const quien =
              (permisosClave & 0o004) !== 0
                ? 'la puede leer cualquier cuenta de la máquina'
                : 'la puede leer su grupo';

            partes.push(noCumple(`${nombre}: la clave de cifrado ${clave} tiene modo ${modoClave}: ${quien}; tiene que ser 0600 o 0400, solo su dueño.`));
          } else {
            partes.push(cumple(`${nombre}: la clave de cifrado ${clave} (modo ${modoClave}) solo la puede leer su dueño.`));
          }
        }

        return combina(partes);
      })
    )
  );
};

// El plazo de P-05 para la máquina de la fila: un número de días para todas, o
// un contrato por criticidad (`ALTA=30; MEDIA=90`) que se resuelve con la
// criticidad que P-04 declara para esta máquina.
const plazoDeRestauracion = (context: ENSPolicyContext): number | Medida => {
  const directo = escalar(context, 'P-05');

  if (directo !== undefined) {
    return directo > 0
      ? directo
      : sinMedir(`${etiqueta(context, 'P-05')} no es un plazo en días (${directo}).`, 'CONFIGURATION');
  }

  const contrato = entradas(context, 'P-05');

  if (!contrato.length) {
    return faltaParametro(context, 'P-05', 'cada cuánto tiene que probarse la restauración');
  }

  let general: number | undefined;
  const porCriticidad = new Map<string, number>();

  contrato.forEach(entrada => {
    const pareja = entrada.match(/^(ALTA|MEDIA|BAJA)\s*=\s*(\d+)$/i);

    if (pareja) {
      porCriticidad.set(pareja[1].toUpperCase(), Number(pareja[2]));
    } else if (/^\d+$/.test(entrada)) {
      general = Number(entrada);
    }
  });

  const maquina = maquinaDeLaFila(context);
  const criticidad = maquina
    ? alcance(context).find(fila => fila.maquina.toLowerCase() === maquina.toLowerCase())?.criticidad
    : undefined;
  const plazo = (criticidad && porCriticidad.get(criticidad)) || general;

  return plazo !== undefined && plazo > 0
    ? plazo
    : sinMedir(
        `${etiqueta(context, 'P-05')} no fija un plazo para ${maquina ? `${maquina} (criticidad en P-04: ${criticidad || 'sin declarar'})` : 'esta máquina'}.`,
        'CONFIGURATION'
      );
};

const RESTAURADO: Record<string, string> = {
  fichero: 'el fichero restaurado',
  buzones: 'la cuenta restaurada',
  directorio: 'la copia restaurada del directorio',
};

// EV-05 · la prueba de restauración más reciente de cada copia, contra P-05.
// Es una ACCIÓN: cuenta cada prueba de la ventana, y de cada copia manda la
// más reciente (una prueba fallida ayer no la tapa una buena de hace tres
// días). Una limpieza fallida deja lo restaurado en producción: la prueba no
// puede dar un CUMPLE limpio, y el recolector no la repite hasta que se
// resuelva.
const ev05 = (context: ENSPolicyContext, ahora: number): Medida => {
  // Primero el plazo, como en las demás: sin él no hay contra qué juzgar.
  const plazo = plazoDeRestauracion(context);

  if (typeof plazo !== 'number') {
    return plazo;
  }

  const pruebas = hechos(context, 'restore_test').filter(e => momento(e) <= ahora + TOLERANCIA_FUTURO);
  // La prueba de restauración es semanal: su degradación también, así que
  // vale la más reciente de la ventana, no solo la de las últimas horas.
  const declaradas = degradaciones(context, 'EV-05', ahora);

  // Las copias que la máquina tiene hoy (por su último estado), y las que
  // tienen alguna prueba o degradación: cada una tiene que dar cuenta de su
  // prueba de restauración. Por par (origen y objeto), no por `backup_id`: el
  // testigo del PBS vive en un backup-id y vale para todo el par.
  const presentes = pasadasPorOrigen(context, TIPOS_DE_ESTADO, ahora).flatMap(p => p.vigentes);
  const pares = Array.from(new Set([...presentes, ...pruebas, ...declaradas].map(parDe)));

  if (!pares.length) {
    // Con el recolector latiendo, no es un fallo de recogida: se ha mirado la
    // ventana consultada y en ella no hay ninguna prueba.
    const late = ultimosLatidos(context, ahora).some(e => ahora - momento(e) <= FRESCURA_HORAS * HORA);

    return sinMedir(
      late
        ? `No se ha visto ninguna prueba de restauración de esta máquina en la ventana consultada, y el recolector de mp.info.6 sí informa: no hay prueba que demuestre que las copias se restauran dentro de los ${plazo} días de P-05.`
        : 'No se ha visto ninguna prueba de restauración de esta máquina en la ventana consultada, ni ningún latido reciente del recolector de mp.info.6: no está desplegado o no informa.',
      late ? 'EVIDENCE' : 'COLLECTION'
    );
  }

  const fecha = (e: ENSNormalizedEvent): number => instante(campo(e, 'fecha')) ?? momento(e);

  return combina(
    pares.map(par => {
      const suyas = pruebas.filter(e => parDe(e) === par);

      if (!suyas.length) {
        const declarada = [...declaradas.filter(e => parDe(e) === par)].sort((a, b) => momento(b) - momento(a))[0];

        if (declarada) {
          return comoDegradacion(declarada);
        }

        const e = presentes.find(h => parDe(h) === par) as ENSNormalizedEvent;

        return sinMedir(
          `No consta ninguna prueba de restauración de ${DE_OBJETO[campo(e, 'objeto')] || `la copia de ${campo(e, 'objeto') || 'objeto sin declarar'}`} (${campo(e, 'origen')}) en la ventana consultada, y el recolector no ha declarado por qué: no hay prueba de que esa copia se pueda recuperar.`
        );
      }

      const e = [...suyas].sort((a, b) => fecha(b) - fecha(a))[0];
      const nombre = nombreDelPar(e);
      const cuando = fecha(e);
      const testigo = campo(e, 'testigo');
      const detalle = campo(e, 'detalle');
      const copia = backupId(e) ? ` de la copia «${backupId(e)}»` : '';
      // Prueba declarada (`testigo=declarado`, `detalle=declarada:
      // <comprobado>`): un origen sin testigo técnico en el que la
      // organización declara la prueba a mano. Ningún recolector publicado la
      // emite (Zimbra Open Source, para el que se pensó, se retiró el
      // 01/10/2026); queda como soporte genérico del contrato. Se juzga igual
      // que cualquier otra prueba, pero el motivo dice que es una prueba
      // declarada y cita lo comprobado en vez del testigo.
      const declarada = testigo === 'declarado';
      const comprobado = detalle.replace(/^declarada:\s*/i, '').trim();
      const prueba = declarada
        ? `${nombre}: prueba declarada por la organización del ${iso(cuando)}${copia}, sobre «${comprobado || 'sin detalle'}»`
        : `${nombre}: prueba del ${iso(cuando)}${copia}${testigo ? ` sobre el testigo ${testigo}` : ''}`;
      const detalleExtra = !declarada && detalle ? ` (${detalle})` : '';
      const correcta = campo(e, 'resultado') === 'ok' && campo(e, 'coincide') === 'si';
      const partes: Medida[] = [];

      if (campo(e, 'resultado') !== 'ok') {
        partes.push(noCumple(`${prueba}: la restauración falló${detalleExtra}.`));
      } else if (campo(e, 'coincide') !== 'si') {
        partes.push(noCumple(`${prueba}: se restauró pero el contenido no coincide con el esperado${detalleExtra}.`));
      } else if (ahora - cuando > plazo * DIA) {
        partes.push(noCumple(`${prueba}: correcta, pero tiene ${dias(ahora - cuando)} días, más que los ${plazo} de P-05.`));
      } else {
        partes.push(cumple(`${prueba}: restauración correcta y contenido verificado, dentro de los ${plazo} días de P-05.`));
      }

      if (campo(e, 'limpieza') === 'error') {
        const restaurado = RESTAURADO[campo(e, 'objeto')] || 'lo restaurado';

        partes.push(
          sinMedir(
            `${nombre}: ${correcta ? 'restauración correcta pero' : 'además,'} ${restaurado} no se pudo borrar${testigo ? ` (testigo ${testigo})` : ''}: la prueba ha dejado rastro en producción y el recolector no la repetirá hasta que se limpie.`,
            'EVIDENCE'
          )
        );
      }

      return combina(partes);
    })
  );
};

// EV-06 · al menos un destino fuera de la máquina y activo, por copia.
const ev06 = (context: ENSPolicyContext, ahora: number): Medida => {
  const declaraAlternativa = ['si', 'sí', 'true', 'yes'].includes(
    String(parametro(context, 'P-08')?.value ?? '').trim().toLowerCase()
  );

  return porCopia(context, 'EV-06', ['backup_storage'], ahora, 'estado de los destinos de las copias', (nombre, destinos) => {
    const describe = (e: ENSNormalizedEvent) =>
      `${campo(e, 'destino') || '(destino sin declarar)'} (${[
        campo(e, 'tipo'),
        campo(e, 'misma_maquina') === 'si' ? 'en la misma máquina' : '',
        campo(e, 'activo') !== 'si' ? 'inactivo' : '',
      ]
        .filter(Boolean)
        .join(', ')})`;
    const fuera = destinos.filter(e => campo(e, 'misma_maquina') === 'no' && campo(e, 'activo') === 'si');

    if (fuera.length) {
      return cumple(`${nombre}: copia fuera de la máquina y activa en ${fuera.map(describe).join(', ')}.`);
    }

    const dudosos = destinos.filter(
      e => !['si', 'no'].includes(campo(e, 'misma_maquina')) || !['si', 'no'].includes(campo(e, 'activo'))
    );

    if (dudosos.length) {
      return sinMedir(`${nombre}: no consta si ${dudosos.map(describe).join(', ')} está fuera de la máquina y activo.`);
    }

    return noCumple(
      `${nombre}: ningún destino de la copia está fuera de la máquina y activo: ${destinos.map(describe).join('; ')}.${declaraAlternativa ? ' P-08 declara que existe copia en ubicación alternativa, y no se observa.' : ''}`
    );
  });
};

// EV-07 · el latido: la última pasada del recolector es reciente, terminó y
// declara qué cubrió.
// El último latido de cada origen: cada recolector de la máquina late por su
// cuenta, y el de uno no acredita al otro.
const ultimosLatidos = (context: ENSPolicyContext, ahora: number): ENSNormalizedEvent[] => {
  const latidos = hechos(context, 'collector_run').filter(e => momento(e) <= ahora + TOLERANCIA_FUTURO);

  return Array.from(new Set(latidos.map(e => campo(e, 'origen')))).map(origen =>
    masReciente(latidos.filter(e => campo(e, 'origen') === origen))
  );
};

const describeRecolector = (e: ENSNormalizedEvent): string => {
  const origen = campo(e, 'origen');
  const rol = campo(e, 'rol');

  return `El recolector${origen ? ` de ${origen}` : ''}${rol && rol !== origen ? ` (${rol})` : ''}`;
};

// EV-07 · el latido: la última pasada de CADA recolector es reciente, terminó
// (entera o en parte) y declara qué cubrió.
const ev07 = (context: ENSPolicyContext, ahora: number): Medida => {
  const latidos = ultimosLatidos(context, ahora);

  if (!latidos.length) {
    return sinHechos(undefined, 'latido del recolector de copias');
  }

  return combina(
    latidos.map(e => {
      const t = momento(e);
      const quien = describeRecolector(e);

      if (ahora - t > FRESCURA_HORAS * HORA) {
        return sinMedir(`${quien} pasó por última vez el ${iso(t)}, hace más de ${FRESCURA_HORAS} h: no está informando.`, 'COLLECTION');
      }

      const pasada = `${quien} pasó el ${iso(t)}`;
      const resultado = campo(e, 'resultado');
      const cubiertas = campo(e, 'evidencias_cubiertas')
        .split(',')
        .map(x => x.trim())
        .filter(x => x && x !== '-');

      // Una pasada `parcial` también ha pasado: lo que no pudo mirar ya lleva
      // su propio NO_EVALUABLE en la evidencia afectada, y el latido no tiene
      // que repetirlo.
      if (!['completada', 'ok', 'parcial'].includes(resultado.toLowerCase())) {
        return sinMedir(`${pasada} y terminó como «${resultado || 'sin resultado'}»: los registros de copia de esa pasada no se han interpretado enteros.`, 'COLLECTION');
      }

      if (!cubiertas.length) {
        return sinMedir(`${pasada} y no declara ninguna evidencia cubierta: no consta qué se ha mirado.`);
      }

      return cumple(
        `${pasada}, terminó${resultado.toLowerCase() === 'parcial' ? ' en parte (lo que no pudo mirar sale en su evidencia)' : ''} y declara cubiertas ${lista(cubiertas, 7)}.`
      );
    })
  );
};

// --- lo medido, para el informe --------------------------------------------
//
// Los valores que sostienen cada medida, copia a copia, como variables de
// ejecución: el informe de mp.info.6 los enseña tal cual. Salen de los mismos
// hechos vigentes que ha juzgado la policy.
const variable = (
  name: string,
  value: ENSRuntimeVariable['value'],
  evidenceIds: string[],
  parameterIds: string[],
  description: string
): ENSRuntimeVariable => ({ name, value, parameterIds, evidenceIds, eventIds: [], description });

// La última de cada cosa: durante la hora que sigue a una copia conviven en la
// ventana la pasada del final de la copia y la horaria, y el informe tiene que
// nombrar cada copia una vez, con lo más reciente.
const ultimaDeCada = (
  eventos: ENSNormalizedEvent[],
  clave: (e: ENSNormalizedEvent) => string
): ENSNormalizedEvent[] => {
  const porClave = new Map<string, ENSNormalizedEvent>();

  eventos.forEach(e => {
    const actual = porClave.get(clave(e));

    if (!actual || momento(e) > momento(actual)) {
      porClave.set(clave(e), e);
    }
  });

  return Array.from(porClave.values());
};

const loMedido = (context: ENSPolicyContext, ahora: number): ENSRuntimeVariable[] => {
  const resultado: ENSRuntimeVariable[] = [];
  const copias = ultimaDeCada(vigentes(context, 'backup_run', ahora), claveDe);
  const edades = copias
    .map(e => instante(campo(e, 'ultima_correcta')))
    .filter((t): t is number => t !== undefined)
    .map(t => Math.round(((ahora - t) / HORA) * 10) / 10);

  if (copias.length) {
    resultado.push(
      variable(
        'copias_ultima_correcta',
        copias.map(e => {
          const correcta = campo(e, 'ultima_correcta');
          const tc = instante(correcta);
          const omitidos = montajesOmitidos(campo(e, 'montajes_omitidos'));
          // Esta línea es por copia, así que la omisión aceptada de ESTA
          // copia se ve siempre aquí: cuando el peor de otra copia manda en
          // el veredicto de EV-01, `combina` descarta el motivo de las partes
          // CUMPLE y la cita desaparecería si solo viviera en el motivo.
          const aceptados = montajesOmitidos(campo(e, 'montajes_omitidos_aceptados'));

          return `${nombreDe(e)}: ${vacio(correcta) ? 'ninguna copia correcta' : `${correcta}${tc !== undefined ? `, hace ${horas(ahora - tc)} h` : ''}`}${campo(e, 'resultado_ultima') === 'error' ? `; la última terminó con error${vacio(campo(e, 'ultima_fallida')) ? '' : ` el ${campo(e, 'ultima_fallida')}`}` : ''}${omitidos.length ? `; deja fuera ${lista(omitidos)}` : ''}${aceptados.length ? `; omisión aceptada por la organización: ${lista(aceptados)}` : ''}`;
        }),
        ['EV-01', 'EV-02'],
        [],
        'Última copia correcta de cada copia en la última pasada de su recolector, y su antigüedad.'
      )
    );
  }

  if (edades.length) {
    resultado.push(
      variable('copias_antiguedad_maxima_horas', Math.max(...edades), ['EV-02'], [], 'Antigüedad, en horas, de la última copia correcta más vieja entre las copias de la máquina.')
    );
  }

  const plazo = plazoDeCopia(context);

  if (!('estado' in plazo)) {
    resultado.push(variable('copias_plazo_horas', plazo.plazo, ['EV-02'], ['P-01', 'P-02'], 'Plazo máximo entre copias correctas: P-01 más el margen de P-02.'));
  }

  const planes = ultimaDeCada(vigentes(context, 'backup_schedule', ahora), e => `${claveDe(e)}|${campo(e, 'planificacion')}`);

  if (planes.length) {
    resultado.push(
      variable(
        'copias_planificacion',
        planes.map(e => `${nombreDe(e)}: ${campo(e, 'planificacion') || 'sin describir'}${numero(campo(e, 'intervalo_horas')) !== undefined ? `, cada ${campo(e, 'intervalo_horas')} h` : ''} (${campo(e, 'fuente') || 'fuente sin declarar'})`),
        ['EV-02'],
        [],
        'Planificación de cada copia.'
      )
    );
  }

  const retenciones = ultimaDeCada(vigentes(context, 'backup_retention', ahora), claveDe);

  if (retenciones.length) {
    resultado.push(
      variable(
        'copias_retencion',
        retenciones.map(e => {
          const retencion = campo(e, 'retencion_dias');
          const antigua = campo(e, 'copia_mas_antigua');

          return `${nombreDe(e)}: ${vacio(retencion) ? 'sin retención configurada' : `${retencion} días de retención configurada`}${vacio(antigua) ? '' : `; la copia más antigua es del ${antigua}`}`;
        }),
        ['EV-03'],
        [],
        'Retención configurada de cada copia y su copia más antigua.'
      )
    );
  }

  const accesos = ultimaDeCada(vigentes(context, 'backup_access', ahora), e => `${claveDe(e)}|${campo(e, 'ruta')}`);

  if (accesos.length) {
    resultado.push(
      variable(
        'copias_cuentas_con_lectura',
        accesos.map(e => {
          const cuentas = campo(e, 'cuentas_con_lectura')
            .split(',')
            .map(c => c.trim())
            .filter(c => c && c !== '-');
          const clave = campo(e, 'clave_ruta');

          return `${nombreDe(e)}: ${campo(e, 'ruta') || '(ruta sin declarar)'} → ${cuentas.length ? cuentas.join(', ') : 'sin informar'}${vacio(clave) ? '' : `; clave ${clave} con modo ${campo(e, 'clave_modo') || 'sin informar'}`}`;
        }),
        ['EV-04'],
        [],
        'Cuentas que pueden leer el repositorio de cada copia y permisos de su clave de cifrado.'
      )
    );
  }

  const pruebas = hechos(context, 'restore_test').filter(e => momento(e) <= ahora + TOLERANCIA_FUTURO);

  if (pruebas.length) {
    const fecha = (e: ENSNormalizedEvent): number => instante(campo(e, 'fecha')) ?? momento(e);
    const ultimas = Array.from(new Set(pruebas.map(parDe))).map(
      par => [...pruebas.filter(e => parDe(e) === par)].sort((a, b) => fecha(b) - fecha(a))[0]
    );

    resultado.push(
      variable(
        'restauracion_ultima_prueba',
        ultimas.map(e => {
          const testigo = campo(e, 'testigo');
          const declarada = testigo === 'declarado';
          // Prueba declarada (soporte genérico, ver EV-05): lo que se
          // comprueba es lo que la organización declara haber verificado.
          const comprobado = campo(e, 'detalle').replace(/^declarada:\s*/i, '').trim();
          const quien = declarada
            ? ` · declarada por la organización: «${comprobado || 'sin detalle'}»`
            : testigo
            ? ` · testigo ${testigo}`
            : '';

          return `${nombreDe(e)}: ${iso(fecha(e))} · resultado ${campo(e, 'resultado') || '-'} · coincide ${campo(e, 'coincide') || '-'} · limpieza ${campo(e, 'limpieza') || '-'}${quien}`;
        }),
        ['EV-05'],
        [],
        'Prueba de restauración más reciente de cada origen y objeto en la ventana.'
      )
    );
  }

  const plazoPrueba = plazoDeRestauracion(context);

  if (typeof plazoPrueba === 'number') {
    resultado.push(variable('restauracion_plazo_dias', plazoPrueba, ['EV-05'], ['P-04', 'P-05'], 'Plazo máximo sin una prueba de restauración correcta para esta máquina (P-05).'));
  }

  const destinos = ultimaDeCada(vigentes(context, 'backup_storage', ahora), e => `${claveDe(e)}|${campo(e, 'destino')}`);

  if (destinos.length) {
    resultado.push(
      variable(
        'copias_destinos',
        destinos.map(
          e =>
            `${nombreDe(e)}: ${campo(e, 'destino') || '(destino sin declarar)'} (${[
              campo(e, 'tipo'),
              campo(e, 'misma_maquina') === 'no' ? 'fuera de la máquina' : campo(e, 'misma_maquina') === 'si' ? 'en la misma máquina' : '',
              campo(e, 'activo') === 'si' ? 'activo' : 'inactivo',
            ]
              .filter(Boolean)
              .join(', ')})`
        ),
        ['EV-06'],
        [],
        'Destinos de cada copia: dónde están y si están activos.'
      )
    );
  }

  const latidos = ultimosLatidos(context, ahora);

  if (latidos.length) {
    resultado.push(
      variable(
        'recolectores_ultimo_latido',
        latidos.map(e => `${campo(e, 'origen') || 'origen sin declarar'}: ${iso(momento(e))} · ${campo(e, 'resultado') || 'sin resultado'} · cubiertas ${campo(e, 'evidencias_cubiertas') || '-'}`),
        ['EV-07'],
        [],
        'Última pasada de cada recolector de copias de la máquina.'
      )
    );
  }

  return resultado;
};

// --- decisiones ------------------------------------------------------------

type Tipo = ENSPolicyDecision['trace']['ruleType'];

// Con qué evidencias se mide cada requisito. Son las del catálogo (una prueba
// lo comprueba); en cada nivel cuentan solo las que aplican (EV-06, la copia
// separada, solo en ALTO).
export const MP_INFO_6_REQUISITOS: Record<string, { evidencias: string[]; parametros: string[]; tipo: Tipo }> = {
  'mp.info.6.1': { evidencias: ['EV-01', 'EV-02', 'EV-07'], parametros: ['P-01', 'P-02', 'P-03', 'P-04', 'P-10'], tipo: 'COVERAGE_REQUIRED' },
  'mp.info.6.2.a': { evidencias: ['EV-01', 'EV-02'], parametros: ['P-01', 'P-02'], tipo: 'MAX_AGE' },
  'mp.info.6.2.b': { evidencias: ['EV-03', 'EV-07'], parametros: ['P-03'], tipo: 'MIN_RETENTION' },
  'mp.info.6.2.c': { evidencias: ['EV-06', 'EV-07'], parametros: ['P-03', 'P-08', 'P-09'], tipo: 'COVERAGE_REQUIRED' },
  'mp.info.6.2.d': { evidencias: ['EV-03', 'EV-04'], parametros: ['P-07'], tipo: 'WHITELIST' },
  'mp.info.6.r1.1': { evidencias: ['EV-05'], parametros: ['P-04', 'P-05', 'P-10'], tipo: 'MAX_AGE' },
  'mp.info.6.r2.1': { evidencias: ['EV-06'], parametros: ['P-08', 'P-09'], tipo: 'CONDITIONAL_REQUIRED' },
};

const decide = (
  requisito: string,
  estado: Medida['estado'],
  evidencias: string[],
  parametros: string[],
  tipo: Tipo,
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

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();
  const maquinas = alcance(context);

  // Sin ninguna máquina en P-04 no hay qué medir: no es un fallo de recogida
  // ni de la máquina, es que la organización no ha declarado su alcance.
  const sinAlcance = maquinas.length
    ? undefined
    : sinMedir(
        `${etiqueta(context, 'P-04')} no declara ninguna máquina: mp.info.6 solo se mide en las máquinas que la organización declara, y sin ninguna no hay qué medir.`,
        'CONFIGURATION'
      );

  // Las evidencias que aplican al nivel con el que se evalúa. Una que no
  // aplica no se mide ni decide ningún requisito: la tabla la enseña NO_APLICA
  // y el requisito no puede decir otra cosa.
  const aplican = new Set(
    getEvidenceDefinitions(CONTROL)
      .filter(definicion => definicion.levels.includes(context.level))
      .map(definicion => definicion.id)
  );

  const medir: Record<string, () => Medida> = {
    'EV-01': () => ev01(context, ahora),
    'EV-02': () => ev02(context, ahora),
    'EV-03': () => ev03(context, ahora),
    'EV-04': () => ev04(context, ahora),
    'EV-05': () => ev05(context, ahora),
    'EV-06': () => ev06(context, ahora),
    'EV-07': () => ev07(context, ahora),
  };

  const medidas: Record<string, Medida> = {};

  Object.keys(medir)
    .filter(id => aplican.has(id))
    .forEach(id => {
      medidas[id] = sinAlcance || medir[id]();
    });

  const requisitoDecisions: ENSPolicyDecision[] = [];
  const evidenciaDecisions: ENSPolicyDecision[] = [];

  Object.entries(MP_INFO_6_REQUISITOS).forEach(([requisito, definicion]) => {
    const propias = definicion.evidencias
      .filter(id => aplican.has(id))
      .map(id => ({ id, medida: medidas[id] }));

    if (!propias.length) {
      requisitoDecisions.push(
        decide(
          requisito,
          'NO_APLICA',
          [],
          definicion.parametros,
          definicion.tipo,
          requisito,
          `Ninguna de sus evidencias aplica en el nivel ${context.level}.`,
          'no aplica en este nivel'
        )
      );

      return;
    }

    const estado = peor(propias.map(p => p.medida));
    const responsables = propias.filter(p => p.medida.estado === estado);

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`.
    requisitoDecisions.push(
      conPartes(decide(
        requisito,
        estado,
        responsables.map(p => p.id),
        definicion.parametros,
        definicion.tipo,
        requisito,
        motivoCompuesto(propias),
        propias.map(p => `${p.id} CUMPLE`).join(' y '),
        causaComun(responsables.map(p => p.medida))
      ), partesDe(propias))
    );

    // Y una por evidencia, con SU estado: es la que lleva la medida a la tabla
    // de evidencias (ver `policy-evidence-bridge.ts`).
    propias.forEach(p =>
      evidenciaDecisions.push(
        decide(requisito, p.medida.estado, [p.id], definicion.parametros, definicion.tipo, `${requisito}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`, p.medida.causa)
      )
    );
  });

  const variables: ENSRuntimeVariable[] = [
    {
      name: 'alcance_declarado',
      value: maquinas.map(fila => fila.maquina),
      parameterIds: ['P-04'],
      evidenceIds: [],
      eventIds: [],
      description: maquinas.length
        ? 'Máquinas en las que la organización declara que se mide mp.info.6 (P-04).'
        : 'P-04 no declara ninguna máquina: mp.info.6 no se mide en ninguna.',
    },
    ...Object.entries(medidas).map(([id, medida]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: medida.estado,
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: medida.motivo,
    })),
    ...(sinAlcance ? [] : loMedido(context, ahora)),
  ];

  return { decisions: [...requisitoDecisions, ...evidenciaDecisions], runtimeVariables: variables };
};

export const mpInfo6PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '2.0.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'mp.info.6.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-10'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.info.6.2.a',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'mp.info.6.2.b',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03'],
      evidenceIds: ['EV-03', 'EV-07'],
      ruleType: 'MIN_RETENTION',
    },
    {
      requirementId: 'mp.info.6.2.c',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-08', 'P-09'],
      evidenceIds: ['EV-06', 'EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'mp.info.6.2.d',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-03', 'EV-04'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'mp.info.6.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-04', 'P-05', 'P-10'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'mp.info.6.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-06'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
