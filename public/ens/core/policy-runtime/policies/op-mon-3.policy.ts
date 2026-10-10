// op.mon.3 · Vigilancia
//
// Por qué este control tiene policy propia. La plantilla pide lo que Wazuh
// hace por oficio (recolectar, correlacionar, determinar la superficie de
// exposición), y el diseño (spec 2026-10-09 §3) mide que lo haga DE VERDAD
// sobre lo que la organización declara. Nada de eso cabe en una primitiva:
//
//   1. DOS PLANOS. El recolector del MANAGER (agent.id=000) mide la
//      recolección central, la correlación, la superficie de exposición, los
//      canales de alerta y los registros. El de cada AGENTE lee sus ficheros
//      de estado de Wazuh (wazuh-logcollector.state, wazuh-agentd.state): el
//      volumen y los descartes de una fuente solo se ven en la máquina que la
//      lee. El motor evalúa por máquina, así que esta policy sabe en qué fila
//      está por el `agent.id` de los hechos que recibe (de cualquier control):
//
//        - fila del manager: todo, y de las fuentes de P-01 de OTRAS máquinas,
//          que su agente exista en el manager y esté conectado;
//        - fila de un agente: solo op.mon.3.1, con las fuentes de P-01 de esa
//          máquina; lo demás NO_APLICA («se mide en el manager»);
//        - fila sin ningún hecho: no se sabe de quién es, y nada se da por
//          bueno (NO_EVALUABLE, COLLECTION).
//
//   2. CRUCES ENTRE TABLAS Y HECHOS: cada fuente de P-01 con su hecho (agente
//      + ubicación, o IP del emisor syslog); cada activo de P-03 con su SCA y
//      su inventario; cada conjunto de P-02 con las reglas que correlacionan;
//      cada fila de P-07 con las reglas de umbral cargadas; cada canal de P-08
//      con la configuración del manager; cada inspección de P-09 con el
//      registro.
//
//   3. LAS SERIES: que el manager recolecta y no descarta se ve comparando sus
//      contadores entre dos pasadas horarias (EV-01).
//
// Qué decide cada requisito (spec §3.3):
//
//   op.mon.3.1     EV-01 (recolección central en marcha, recolectando y sin
//                  descartes) y EV-02 (cada fuente de P-01 leída, sin descartes
//                  y, si la fila lo declara, sin lagunas).
//   op.mon.3.r1.1  EV-03: los conjuntos de P-02, cargados con reglas que
//                  correlacionan.
//   op.mon.3.r2.1  EV-04, por CAPACIDAD (decisión del responsable 2): SCA e
//                  inventario de cada activo de P-03 dentro de P-11, detector
//                  de vulnerabilidades habilitado, con su fuente al día y sin
//                  errores del conector del indexer. El recuento de CVE por
//                  activo no es local: se informa «sin medir».
//   op.mon.3.r3.1  documental: P-ATT (EV-05 se informa).
//   op.mon.3.r3.2  EV-06: la sonda de P-05 ingerida y reciente.
//   op.mon.3.r4.1  documental: P-ATT (EV-07 se informa).
//   op.mon.3.r5.1  EV-08: cada fila de P-07 vigilada por una regla de umbral.
//   op.mon.3.r5.2  EV-09: cada canal de P-08 configurado, habilitado, desde
//                  su nivel y sin errores de envío.
//   op.mon.3.r6.x  P-09 manda: una inspección «continua» se acredita con la
//                  medida continua (EV-10 SCA, EV-11 detector); una periódica,
//                  con la medida continua o con su última fila del registro
//                  dentro de la periodicidad (EV-12). El pentest solo con el
//                  registro. EV-13 se informa.
//
// Invariantes, las de `evidence/judgment.ts` y las de `policy-kit.ts`: sin
// hecho o sin parámetro, NO_EVALUABLE con motivo y causa, nunca un CUMPLE por
// ausencia; las antigüedades se miden en el instante del hecho (`momento`),
// nunca desde ahora; ningún plazo, umbral o lista tiene valor por defecto.
//
// Solo se emiten decisiones de los requisitos que aplican a la categoría: una
// decisión de R1 en BÁSICA no cuenta para el requisito, pero el puente la
// llevaría a la tabla de evidencias.
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
// Por la ruta del fichero, nunca por el barrel (TDZ de Settings).
import {
  HORA,
  DIA,
  FRESCURA_HORAS,
  MISMA_PASADA,
  cumple,
  noCumple,
  sinMedir,
  noAplica,
  causaComun,
  peor,
  combina,
  campo,
  numero,
  instante,
  momento,
  lista,
  horas,
  dias,
  iso,
  sinTildes,
  vacio,
  iguales,
  etiqueta,
  filas,
  escalar,
  faltaParametro,
  lectorDeHechos,
  decisorDe,
} from './policy-kit';
import type { ENSTipoDeRegla, Medida } from './policy-kit';

const CONTROL = 'op.mon.3';
const POLICY = 'policy.op.mon.3';

// Los hechos de op.mon.3, con la frescura de los hechos de estado (26 h): los
// recolectores reemiten el estado entero cada 6 h.
const { validos, estadoVigente, degradacion, sinHechos, conDegradacion } = lectorDeHechos(CONTROL, {
  recolector: 'el recolector de op.mon.3',
});

const decide = decisorDe(POLICY);

// Frescura del estado de la RECOLECCIÓN CENTRAL, que llega cada hora. No vale
// la de 26 h: los hechos de ENSFácil llegan al índice a través del propio
// sistema de recolección, así que si se para deja de llegar su estado, y el
// último —«recolectando»— seguiría acreditando el control un día entero. 3 h
// toleran dos pasadas horarias perdidas.
const FRESCURA_RECOLECCION_HORAS = 3;

// La ventana de las ACCIONES (decisión del 17/09: el estado se juzga por la
// última pasada; las acciones, por 30 días). Es lo que el recolector conserva
// de las alertas de cada emisor syslog y de los incidentes del periodo.
const VENTANA_DIAS = 30;

const MANAGER = '000';

const SE_MIDE_EN_EL_MANAGER =
  'Se mide en el sistema central de recolección (el manager de Wazuh, agente 000), no en esta máquina: su resultado sale en la fila del manager y en el del control.';

const SIN_NINGUN_HECHO =
  'De esta fila no ha llegado ningún hecho, de op.mon.3 ni de otro control, así que no se sabe si es el manager o un agente: no está desplegado ningún recolector o la máquina no informa. Nada se da por bueno.';

// --- las máquinas de la fila -----------------------------------------------
//
// El ID de un agente, normalizado: 24 es el agente 024, como en Wazuh.
const idDeAgente = (texto: string | undefined): string | undefined => {
  const limpio = String(texto || '').trim();

  return /^\d+$/.test(limpio) ? limpio.padStart(3, '0') : undefined;
};

// Las máquinas de cuyos hechos dispone la evaluación, con su nombre. En la fila
// de una máquina es una sola; sin fila (el conjunto), todas.
const maquinasDe = (context: ENSPolicyContext): Map<string, string> => {
  const maquinas = new Map<string, string>();

  context.events.forEach(event => {
    const id = idDeAgente(event.agentId);

    if (id && (!maquinas.has(id) || (!maquinas.get(id) && event.agentName))) {
      maquinas.set(id, event.agentName || '');
    }
  });

  return maquinas;
};

// Los hechos de UNA máquina: los recolectores de cada máquina pasan a su
// minuto, así que la última pasada se delimita máquina a máquina.
const deMaquina = (context: ENSPolicyContext, id: string): ENSPolicyContext => ({
  ...context,
  events: context.events.filter(event => idDeAgente(event.agentId) === id),
});

const describeMaquina = (id: string, nombre: string): string => (nombre ? `${nombre} (${id})` : id);

// La máquina de la fila de P-01 (o de P-03) entre las de la evaluación: por ID
// o por nombre EXACTO, sin distinguir mayúsculas. Nunca por parecido.
const maquinaDeLaFila = (sistema: string, maquinas: Map<string, string>): string | undefined => {
  const id = idDeAgente(sistema);

  if (id && maquinas.has(id)) {
    return id;
  }

  const porNombre = Array.from(maquinas.entries()).filter(([, nombre]) => iguales(nombre, sistema));

  return porNombre.length === 1 ? porNombre[0][0] : undefined;
};

// --- los agentes que conoce el manager ---------------------------------------
//
// `package_inventory_observed` (EV-04) trae una fila por agente registrado en
// global.db, con su conexión: es el padrón con el que la fila del manager
// comprueba los sistemas de P-01 y de P-03. Un nombre que casa con dos agentes
// no se elige: se pide declararlo por su ID.

type Resolucion =
  | { tipo: 'unico'; hecho: ENSNormalizedEvent }
  | { tipo: 'ninguno' }
  | { tipo: 'ambiguo'; ids: string[] };

const idDelHecho = (e: ENSNormalizedEvent): string =>
  idDeAgente(campo(e, 'agente_id')) || campo(e, 'agente_id');

const resuelve = (sistema: string, deAgentes: ENSNormalizedEvent[]): Resolucion => {
  const id = idDeAgente(sistema);

  if (id) {
    const porId = deAgentes.find(e => idDelHecho(e) === id);

    if (porId) {
      return { tipo: 'unico', hecho: porId };
    }
  }

  const porNombre = deAgentes.filter(e => iguales(campo(e, 'agente'), sistema));
  const ids = Array.from(new Set(porNombre.map(idDelHecho)));

  if (ids.length === 1) {
    return { tipo: 'unico', hecho: porNombre[0] };
  }

  return ids.length > 1 ? { tipo: 'ambiguo', ids } : { tipo: 'ninguno' };
};

const ambiguo = (parametro: string, sistema: string, ids: string[]): Medida =>
  sinMedir(
    `${parametro} declara «${sistema}» y en el manager hay ${ids.length} agentes con ese nombre (${ids.join(', ')}): no se elige uno. Decláralo por su ID.`,
    'CONFIGURATION'
  );

const nombreDe = (sistema: string, e: ENSNormalizedEvent): string => {
  const id = idDelHecho(e);
  const agente = campo(e, 'agente');

  return iguales(agente, sistema) ? `${sistema} (${id})` : `${sistema} (${agente}, ${id})`;
};

// --- rangos de ids -----------------------------------------------------------

type Rango = [number, number];

const rangos = (texto: string): Rango[] => {
  const salida: Rango[] = [];
  const patron = /(\d+)\s*-\s*(\d+)|(\d+)/g;
  let m: RegExpExecArray | null;

  while ((m = patron.exec(texto)) !== null) {
    if (m[3] !== undefined) {
      const n = Number(m[3]);

      salida.push([n, n]);
    } else {
      const a = Number(m[1]);
      const b = Number(m[2]);

      salida.push(a <= b ? [a, b] : [b, a]);
    }
  }

  return salida;
};

const describeRango = ([a, b]: Rango): string => (a === b ? String(a) : `${a}-${b}`);

const seCortan = ([a, b]: Rango, [c, d]: Rango): boolean => a <= d && c <= b;

// Una celda de ids de reglas solo admite ids y rangos: «100510, 100500-100509».
// Cualquier otro texto se rechaza en vez de interpretarse (lección de op.mon.1:
// «pendiente 2026-12» leído como rango convertía un hueco en una cobertura).
const REGLAS_EN_CELDA = /^\d+(\s*-\s*\d+)?(\s*[,;\s]\s*\d+(\s*-\s*\d+)?)*$/;

const SIN_REGLA = /^(-|ninguna|ninguno|sin regla)$/i;

// --- P-01: la gramática de cada fila -------------------------------------------

interface Fuente {
  n: number;
  fuente: string;
  metodo: 'agente' | 'syslog';
  sistema: string;
  ubicacion: string;
  maxHoras?: number;
}

const ENTERO_POSITIVO = /^\d+$/;

// Una fila de P-01 con su defecto, si lo tiene. Nada se adivina: un método que
// no es «agente» ni «syslog», una fuente de agente sin ubicación o un máximo de
// horas que no es un entero positivo son CONFIGURACIÓN, nombrando la fila.
const leeFuente = (fila: Record<string, string>, n: number): Fuente | string => {
  const nombre = fila.fuente || `fila ${n}`;
  const metodo = sinTildes(fila.metodo || '');
  const sistema = (fila.sistema || '').trim();
  const ubicacion = (fila.ubicacion || '').trim();
  const max = (fila.max_horas_sin_eventos || '').trim();

  if (metodo !== 'agente' && metodo !== 'syslog') {
    return `P-01, fuente «${nombre}»: el método dice «${fila.metodo || ''}» y solo puede ser «agente» o «syslog».`;
  }

  if (!sistema || sistema === '-') {
    return `P-01, fuente «${nombre}»: falta el sistema (el agente que la lee, o la IP del emisor syslog).`;
  }

  if (metodo === 'agente' && (!ubicacion || ubicacion === '-')) {
    return `P-01, fuente «${nombre}»: una fuente de agente necesita su ubicación (la ruta o el nombre del localfile).`;
  }

  if (max && max !== '-' && (!ENTERO_POSITIVO.test(max) || Number(max) <= 0)) {
    return `P-01, fuente «${nombre}»: max_horas_sin_eventos dice «${max}», que no es un número entero de horas; vacía si la continuidad de esta fuente no se juzga.`;
  }

  return {
    n,
    fuente: nombre,
    metodo,
    sistema,
    ubicacion,
    ...(max && max !== '-' ? { maxHoras: Number(max) } : {}),
  };
};

// La ubicación de P-01 contra la del hecho: exacta, o con los comodines * y ?
// del propio localfile. Las rutas distinguen mayúsculas, como en Linux.
const coincideUbicacion = (declarada: string, observada: string): boolean => {
  if (!/[*?]/.test(declarada)) {
    return declarada === observada;
  }

  const patron = declarada
    .split('')
    .map(c => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');

  return new RegExp(`^${patron}$`).test(observada);
};

// --- EV-01 · la recolección central -------------------------------------------

const ev01 = (ctxM: ENSPolicyContext, ahora: number): Medida => {
  const serie = validos(ctxM, 'event_collection_status', ahora);
  const ultimo = serie.length ? momento(serie[serie.length - 1]) : undefined;

  if (ultimo === undefined) {
    return sinHechos(ctxM, 'EV-01', ahora, undefined, 'estado de la recolección central del manager');
  }

  if (ahora - ultimo > FRESCURA_RECOLECCION_HORAS * HORA) {
    return sinMedir(
      `El último estado de la recolección central es de ${iso(ultimo)}, hace ${horas(ahora - ultimo)} h (más de ${FRESCURA_RECOLECCION_HORAS} h, y el recolector pasa cada hora): se ha parado el recolector de op.mon.3 del manager o el propio sistema de recolección, por el que llegan sus hechos. No se puede afirmar que el manager esté recolectando.`,
      'COLLECTION'
    );
  }

  const actual = serie[serie.length - 1];
  const anterior = [...serie].reverse().find(e => momento(e) < ultimo - MISMA_PASADA);
  const entre = anterior ? `entre ${iso(momento(anterior))} y ${iso(ultimo)}` : '';
  const partes: Medida[] = [];

  const activo = campo(actual, 'activo');

  partes.push(
    activo === 'si'
      ? cumple('wazuh-manager activo.')
      : noCumple(`wazuh-manager no está activo (${activo || 'desconocido'}): no hay sistema central de recolección en marcha.`)
  );

  const conexiones = campo(actual, 'conexiones');

  partes.push(
    vacio(conexiones)
      ? noCumple('El manager no declara ninguna conexión de recepción en <remote> (ni «secure» para los agentes ni «syslog»): no recibe eventos de ninguna otra fuente.')
      : cumple(
          `Recibe por ${conexiones}; ${campo(actual, 'agentes_activos') || '?'} de ${campo(actual, 'agentes_registrados') || '?'} agentes activos.`
        )
  );

  // Que recolecta: el contador de procesados del motor de análisis entre dos
  // pasadas; sin él, el de mensajes de wazuh-remoted.
  const procesa = (): Medida => {
    const contadores: [string, string][] = [
      ['eventos_procesados', 'El motor de análisis'],
      ['mensajes_remoted', 'wazuh-remoted'],
    ];

    for (const [nombre, quien] of contadores) {
      const ahoraN = numero(campo(actual, nombre));

      if (ahoraN === undefined) {
        continue;
      }

      const antes = anterior ? numero(campo(anterior, nombre)) : undefined;

      if (antes === undefined) {
        return ahoraN > 0
          ? cumple(`${quien} ha recibido ${ahoraN} eventos desde que arrancó; una sola pasada, sin serie todavía.`)
          : sinMedir(`${quien} no ha procesado ningún evento y no hay una pasada anterior con la que comparar.`);
      }

      if (ahoraN > antes) {
        return cumple(`Recolecta: ${quien} procesó ${ahoraN - antes} eventos ${entre}.`);
      }

      if (ahoraN < antes) {
        return ahoraN > 0
          ? cumple(`${quien} se reinició ${entre} y ha procesado ${ahoraN} eventos desde entonces.`)
          : sinMedir(`${quien} se reinició ${entre} y todavía no ha procesado ningún evento.`);
      }

      return noCumple(
        `${quien} no ha procesado ningún evento ${entre} (contador parado en ${ahoraN}): el sistema de recolección está en marcha, pero no recolecta.`
      );
    }

    return (
      degradacion(ctxM, 'EV-01', ahora, ultimo + 1) ||
      sinMedir(
        `El recolector no ha podido leer los contadores del motor de análisis ni los de wazuh-remoted (${campo(actual, 'fuente_contadores') || 'sin fuente'}): no se puede afirmar que el manager recolecte.`,
        'COLLECTION'
      )
    );
  };

  partes.push(procesa());

  // Que no pierde: los descartes del motor de análisis (su cola llena) entre
  // las dos pasadas. Tras un reinicio, el contador cuenta desde el reinicio.
  const descartados = numero(campo(actual, 'eventos_descartados'));

  if (descartados !== undefined) {
    const antes = anterior ? numero(campo(anterior, 'eventos_descartados')) : undefined;
    const procesadosAhora = numero(campo(actual, 'eventos_procesados'));
    const procesadosAntes = anterior ? numero(campo(anterior, 'eventos_procesados')) : undefined;
    const reinicio =
      antes !== undefined &&
      (descartados < antes ||
        (procesadosAhora !== undefined && procesadosAntes !== undefined && procesadosAhora < procesadosAntes));
    const nuevos = antes === undefined || reinicio ? descartados : descartados - antes;
    const cuando =
      antes === undefined ? 'desde que arrancó el motor' : reinicio ? `desde que se reinició (${entre})` : entre;

    partes.push(
      nuevos > 0
        ? noCumple(
            `El motor de análisis ha descartado ${nuevos} eventos ${cuando}: su cola se llena y la recolección pierde eventos.`
          )
        : cumple(`Sin eventos descartados ${cuando}.`)
    );
  }

  const medida = combina(partes);
  const deg = degradacion(ctxM, 'EV-01', ahora, ultimo + 1);

  return deg ? combina([medida, deg]) : medida;
};

// --- EV-02 · cada fuente de P-01 ------------------------------------------------

// Una fuente de AGENTE en la fila de su máquina: la lee el logcollector, sin
// descartes en el periodo y, si la fila lo declara, sin una laguna mayor que
// max_horas_sin_eventos. Las horas se miden en el instante del hecho.
const fuenteLocal = (ctxA: ENSPolicyContext, ahora: number, fuente: Fuente, maquina: string): Medida => {
  const { vigentes, ultimo } = estadoVigente(ctxA, 'log_source_observed', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(ctxA, 'EV-02', ahora, ultimo, `inventario de las fuentes del logcollector de ${maquina}`);
  }

  const leidas = vigentes.filter(e => campo(e, 'lectura') === 'ok' || !campo(e, 'lectura'));

  if (!leidas.length) {
    const lectura = campo(vigentes[0], 'lectura');

    return sinMedir(
      `«${fuente.fuente}»: el recolector de ${maquina} no ha podido leer wazuh-logcollector.state (${lectura === 'ausente' ? 'no existe' : 'existe y no se puede leer'}), así que no se sabe qué fuentes lee.`,
      'COLLECTION'
    );
  }

  const suyas = leidas.filter(e => coincideUbicacion(fuente.ubicacion, campo(e, 'ubicacion')));

  if (!suyas.length) {
    return noCumple(
      `«${fuente.fuente}»: el logcollector de ${maquina} no lee ${fuente.ubicacion} (lee: ${lista(leidas.map(e => campo(e, 'ubicacion')), 6)}).`
    );
  }

  const detalle = `${fuente.ubicacion} en ${maquina}`;

  // Con la lectura buena, un contador que falta o vale `-` es un hueco del
  // recolector, nunca un cero.
  const sinContador = suyas.filter(e => numero(campo(e, 'descartes_periodo')) === undefined || numero(campo(e, 'eventos')) === undefined);

  if (sinContador.length) {
    return sinMedir(
      `«${fuente.fuente}» (${detalle}): el recolector no informa de los eventos o los descartes de ${lista(sinContador.map(e => campo(e, 'ubicacion')))}, así que no se sabe si recolecta sin pérdidas.`,
      'COLLECTION'
    );
  }

  const descartes = suyas.reduce((t, e) => t + (numero(campo(e, 'descartes_periodo')) || 0), 0);
  const eventos = suyas.reduce((t, e) => t + (numero(campo(e, 'eventos')) || 0), 0);

  if (descartes > 0) {
    return noCumple(`«${fuente.fuente}» (${detalle}): ${descartes} eventos descartados en el periodo; la recolección pierde eventos.`);
  }

  if (fuente.maxHoras === undefined) {
    // Leída pero sin ningún evento nunca visto: que se lea no demuestra que
    // recolecte. Sin un máximo de horas no hay contra qué juzgarlo.
    if (eventos === 0 && suyas.every(e => instante(campo(e, 'ultimo_evento')) === undefined)) {
      return sinMedir(
        `«${fuente.fuente}» (${detalle}): el logcollector la lee pero no ha producido ningún evento desde que se observa. Declara max_horas_sin_eventos para esta fuente en P-01 y se juzgará su continuidad; sin él, lo que no se demuestra no cumple.`,
        'CONFIGURATION'
      );
    }

    return cumple(`«${fuente.fuente}» (${detalle}): ${eventos} eventos desde el arranque del logcollector, sin descartes.`);
  }

  // La fuente entera: el último evento de cualquiera de sus ficheros.
  const ultimos = suyas
    .map(e => ({ e, t: instante(campo(e, 'ultimo_evento')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined);

  if (ultimos.length) {
    const masReciente = ultimos.reduce((a, b) => (b.t > a.t ? b : a));
    const laguna = momento(masReciente.e) - masReciente.t;

    return laguna > fuente.maxHoras * HORA
      ? noCumple(
          `«${fuente.fuente}» (${detalle}): ${horas(laguna)} h sin un evento nuevo al leerla (el último, ${iso(masReciente.t)}), más que las ${fuente.maxHoras} h que admite: la vigilancia tiene una laguna.`
        )
      : cumple(`«${fuente.fuente}» (${detalle}): último evento ${iso(masReciente.t)}, sin descartes.`);
  }

  const desdes = suyas
    .map(e => ({ e, t: instante(campo(e, 'observado_desde')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined);
  const desde = desdes.length ? desdes.reduce((a, b) => (b.t < a.t ? b : a)) : undefined;

  if (desde && momento(desde.e) - desde.t > fuente.maxHoras * HORA) {
    return noCumple(
      `«${fuente.fuente}» (${detalle}): ningún evento desde que el recolector la observa (${iso(desde.t)}), más de las ${fuente.maxHoras} h que admite.`
    );
  }

  return sinMedir(
    `«${fuente.fuente}» (${detalle}): sin eventos nuevos observados, y se observa desde ${desde ? iso(desde.t) : 'un instante desconocido'}, menos que las ${fuente.maxHoras} h que admite: todavía no se puede afirmar ni negar su continuidad.`
  );
};

// El envío de un AGENTE (wazuh-agentd.state). El manager no tiene agentd.
const envioDelAgente = (ctxA: ENSPolicyContext, ahora: number, maquina: string): Medida => {
  const { vigentes, ultimo } = estadoVigente(ctxA, 'agent_forwarding_observed', ahora);
  const hecho = vigentes[vigentes.length - 1];

  if (!hecho) {
    return sinHechos(ctxA, 'EV-02', ahora, ultimo, `estado de envío del agente de ${maquina}`);
  }

  const lectura = campo(hecho, 'lectura');

  if (lectura && lectura !== 'ok') {
    return sinMedir(
      `El recolector de ${maquina} no ha podido leer wazuh-agentd.state (${lectura}): no se sabe si el agente envía sus eventos al manager.`,
      'COLLECTION'
    );
  }

  const estado = campo(hecho, 'conexion');
  const cola = campo(hecho, 'mensajes_en_buffer');

  return estado === 'connected'
    ? cumple(`El agente de ${maquina} está conectado al manager (último ack ${campo(hecho, 'ultimo_ack') || '-'}${!vacio(cola) ? `, ${cola} mensajes en cola` : ''}).`)
    : noCumple(
        `El agente de ${maquina} no está conectado al manager al leerlo (${estado || 'estado desconocido'}, último ack ${campo(hecho, 'ultimo_ack') || '-'}): sus eventos no llegan.`
      );
};

// Una fuente SYSLOG, en la fila del manager: el emisor solo deja rastro cuando
// sus eventos alertan, así que se juzga su última alerta, conservada por el
// recolector durante la ventana de 30 días.
const fuenteSyslog = (ctxM: ENSPolicyContext, ahora: number, fuente: Fuente): Medida => {
  const { vigentes, ultimo } = estadoVigente(ctxM, 'syslog_source_observed', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(ctxM, 'EV-02', ahora, ultimo, 'resumen de los emisores syslog del manager');
  }

  const hecho = vigentes.find(e => iguales(campo(e, 'ubicacion'), fuente.sistema));

  if (!hecho) {
    const estados = validos(ctxM, 'event_collection_status', ahora);
    const desde = estados.length ? instante(campo(estados[estados.length - 1], 'alertas_observadas_desde')) : undefined;
    const emisores = vigentes.filter(e => campo(e, 'ubicacion') !== 'ninguna').map(e => campo(e, 'ubicacion'));
    const otros = emisores.length ? ` Emisores syslog con alertas: ${lista(emisores)}.` : ' El manager no tiene alertas de ningún emisor syslog.';

    if (desde !== undefined && ultimo - desde >= VENTANA_DIAS * DIA) {
      return noCumple(
        `«${fuente.fuente}» (syslog desde ${fuente.sistema}): ninguna alerta de ese emisor en los últimos ${VENTANA_DIAS} días; o no envía, o lo que envía no llega a alertar.${otros}`
      );
    }

    return sinMedir(
      `«${fuente.fuente}» (syslog desde ${fuente.sistema}): ninguna alerta de ese emisor, pero el manager solo observa las alertas desde ${desde !== undefined ? iso(desde) : 'un instante desconocido'}, menos de ${VENTANA_DIAS} días. Las fuentes syslog solo dejan rastro cuando alertan.${otros}`
    );
  }

  const ultima = instante(campo(hecho, 'ultima_alerta'));
  const n24 = campo(hecho, 'alertas_24h') || '0';

  if (ultima === undefined) {
    return noCumple(`«${fuente.fuente}» (syslog desde ${fuente.sistema}): no consta ninguna alerta de ese emisor.`);
  }

  if (fuente.maxHoras !== undefined && momento(hecho) - ultima > fuente.maxHoras * HORA) {
    return noCumple(
      `«${fuente.fuente}» (syslog desde ${fuente.sistema}): ${horas(momento(hecho) - ultima)} h sin alertas al leerlo (la última, ${iso(ultima)}), más que las ${fuente.maxHoras} h que admite.`
    );
  }

  return cumple(`«${fuente.fuente}» (syslog desde ${fuente.sistema}): última alerta ${iso(ultima)}, ${n24} en 24 h.`);
};

// En la fila del manager, las fuentes de OTRAS máquinas: que su agente esté
// registrado en el manager, sin ambigüedad, conectado y con su recolector de
// agente informando. El detalle de cada fuente (descartes, lagunas) se juzga en
// la fila de su máquina, PERO esa fila solo existe si la máquina está en el
// alcance ENS: una fuente de un agente fuera del alcance, o de uno sin el
// recolector de agente, no la mide nadie. Por eso el padrón trae el último
// latido de su recolector de agente que el manager ha visto en alerts.json
// (`recolector_agente_ultimo`): sin él, o más viejo que la frescura de los
// hechos, sus fuentes están sin medir y nada se da por bueno.
const agenteDeLaFuente = (ctxM: ENSPolicyContext, ahora: number, sistema: string, padron: ENSNormalizedEvent[]): Medida => {
  const r = resuelve(sistema, padron);

  if (r.tipo === 'ninguno') {
    return noCumple(`${sistema}: no figura en la base de agentes del manager; sus fuentes no pueden llegar.`);
  }

  if (r.tipo === 'ambiguo') {
    return ambiguo('P-01', sistema, r.ids);
  }

  const e = r.hecho;
  const estado = campo(e, 'estado_conexion');

  if (estado !== 'active') {
    return noCumple(
      `${nombreDe(sistema, e)}: agente ${estado || 'en estado desconocido'} (último keepalive ${vacio(campo(e, 'ultimo_keepalive')) ? 'nunca' : campo(e, 'ultimo_keepalive')}); sus fuentes no llegan.`
    );
  }

  const latido = instante(campo(e, 'recolector_agente_ultimo'));

  if (latido === undefined || momento(e) - latido > FRESCURA_HORAS * HORA) {
    return sinMedir(
      `${nombreDe(sistema, e)}: conectado, pero su recolector de agente de op.mon.3 no informa (${
        latido === undefined ? 'el manager no ha visto nunca su latido' : `último latido ${iso(latido)}, más de ${FRESCURA_HORAS} h antes de la lectura`
      }): sus fuentes no se miden. Si la máquina no está en el alcance ENS (grupo ens), su fila no existe y nadie las mide.`,
      'COLLECTION'
    );
  }

  return cumple(`${nombreDe(sistema, e)} conectado al manager, con su recolector de agente informando (último latido ${iso(latido)}).`);
};

const ev02 = (context: ENSPolicyContext, ahora: number, maquinas: Map<string, string>): Medida => {
  const declaradas = filas(context, 'P-01');

  if (!declaradas) {
    return faltaParametro(context, 'P-01', 'qué fuentes tienen que alimentar la recolección');
  }

  const hayManager = maquinas.has(MANAGER);
  const ctxM = deMaquina(context, MANAGER);
  const padron: { vigentes: ENSNormalizedEvent[]; ultimo?: number } = hayManager
    ? estadoVigente(ctxM, 'package_inventory_observed', ahora)
    : { vigentes: [] };
  const configuracion: Medida[] = [];
  const medidas: Medida[] = [];
  const fueraDeAqui: string[] = [];
  // Lo que se ha juzgado aquí, como pares (máquina, hecho de estado que
  // delimita su última pasada): solo esas degradaciones cuentan. Una máquina
  // puede tener los dos del manager (sus fuentes y las syslog).
  const juzgadas = new Map<string, [string, string]>();
  const juzga = (id: string, tipo: string) => juzgadas.set(`${id}|${tipo}`, [id, tipo]);
  const envios = new Set<string>();
  const padronJuzgado = new Set<string>();

  declaradas.forEach((fila, i) => {
    const fuente = leeFuente(fila, i + 1);

    if (typeof fuente === 'string') {
      configuracion.push(sinMedir(fuente, 'CONFIGURATION'));

      return;
    }

    if (fuente.metodo === 'syslog') {
      if (hayManager) {
        medidas.push(fuenteSyslog(ctxM, ahora, fuente));
        juzga(MANAGER, 'syslog_source_observed');
      } else {
        fueraDeAqui.push(`«${fuente.fuente}» (syslog, en el manager)`);
      }

      return;
    }

    const id = maquinaDeLaFila(fuente.sistema, maquinas);

    if (id) {
      const ctxA = deMaquina(context, id);
      const maquina = describeMaquina(id, maquinas.get(id) || '');

      medidas.push(fuenteLocal(ctxA, ahora, fuente, maquina));

      if (id !== MANAGER && !envios.has(id)) {
        envios.add(id);
        medidas.push(envioDelAgente(ctxA, ahora, maquina));
      }

      juzga(id, 'log_source_observed');
    } else {
      fueraDeAqui.push(`«${fuente.fuente}» de ${fuente.sistema}`);
    }

    // La fila del manager comprueba también el agente de las fuentes de OTRA
    // máquina: que exista y esté conectado. Una vez por sistema declarado.
    if (hayManager && id !== MANAGER) {
      const clave = idDeAgente(fuente.sistema) || fuente.sistema.toLowerCase();

      if (!padronJuzgado.has(clave)) {
        padronJuzgado.add(clave);
        medidas.push(
          padron.vigentes.length
            ? agenteDeLaFuente(ctxM, ahora, fuente.sistema, padron.vigentes)
            : sinHechos(ctxM, 'EV-02', ahora, padron.ultimo, 'padrón de agentes del manager')
        );
      }
    }
  });

  const aqui = Array.from(maquinas.entries()).map(([id, nombre]) => describeMaquina(id, nombre)).join(', ');
  const nota = fueraDeAqui.length
    ? ` Se juzgan en la fila de su máquina${hayManager ? ' (aquí, solo que su agente exista y esté conectado)' : ''}: ${lista(fueraDeAqui)}.`
    : '';

  if (!medidas.length && !configuracion.length) {
    return noAplica(`Ninguna fuente de P-01 es de esta máquina (${aqui}): no es una fuente declarada de la vigilancia.${nota}`);
  }

  const fallos = medidas.filter(m => m.estado === 'NO_CUMPLE');
  const huecos = medidas.filter(m => m.estado === 'NO_EVALUABLE');
  const bien = medidas.filter(m => m.estado === 'CUMPLE');
  const partes: Medida[] = [...configuracion, ...huecos];

  if (fallos.length) {
    partes.push(noCumple(`Fuentes de P-01 sin recolección efectiva: ${lista(fallos.map(m => m.motivo), 6)}${nota}`));
  } else if (bien.length) {
    partes.push(cumple(`Recolección efectiva de las fuentes de P-01: ${lista(bien.map(m => m.motivo), 6)}${nota}`));
  }

  // Lo que un recolector declaró que no pudo leer después de su última pasada
  // buena se combina con lo medido, máquina a máquina.
  const degradadas = Array.from(juzgadas.values())
    .map(([id, tipo]) => conDegradacion(deMaquina(context, id), ahora, 'EV-02', tipo, cumple('')))
    .filter((m, i, todas) => m.estado !== 'CUMPLE' && todas.findIndex(x => x.motivo === m.motivo) === i);

  return combina([...partes, ...degradadas]);
};

// --- EV-03 · la correlación (R1) -------------------------------------------------

const enVentana = (ctxM: ENSPolicyContext, tipo: string, ahora: number): ENSNormalizedEvent[] =>
  validos(ctxM, tipo, ahora).filter(e => ahora - momento(e) <= VENTANA_DIAS * DIA);

const alertasDeCorrelacion = (ctxM: ENSPolicyContext, ahora: number, filtro?: Rango[]): string => {
  const alertas = enVentana(ctxM, 'correlation_alert_observed', ahora).filter(e => {
    if (!filtro) {
      return true;
    }

    const n = numero(campo(e, 'regla'));

    return n !== undefined && filtro.some(r => seCortan(r, [n, n]));
  });

  if (!alertas.length) {
    return `Ninguna alerta de correlación en los últimos ${VENTANA_DIAS} días.`;
  }

  const porRegla = new Map<string, number>();

  alertas.forEach(e => porRegla.set(campo(e, 'regla'), (porRegla.get(campo(e, 'regla')) || 0) + (numero(campo(e, 'veces')) || 0)));

  const total = Array.from(porRegla.values()).reduce((a, b) => a + b, 0);

  return `${total} alertas de correlación en los últimos ${VENTANA_DIAS} días, de ${porRegla.size} reglas (${lista(Array.from(porRegla.entries()).map(([r, n]) => `${r}: ${n}`))}).`;
};

const ev03 = (context: ENSPolicyContext, ctxM: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(ctxM, 'correlation_rules_inventory', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(ctxM, 'EV-03', ahora, ultimo, 'inventario de reglas de correlación del manager');
  }

  const correlacionan = (e: ENSNormalizedEvent) => numero(campo(e, 'reglas_correlacion')) || 0;
  const total = vigentes.reduce((t, e) => t + correlacionan(e), 0);
  const resumen = vigentes
    .map(e => `${campo(e, 'conjunto')}: ${campo(e, 'reglas') || '?'} reglas, ${correlacionan(e)} de correlación, ${campo(e, 'tecnicas_correlacion') || '0'} técnicas MITRE`)
    .join('; ');
  const partes: Medida[] = [];

  if (total === 0) {
    partes.push(noCumple(`El manager no carga ninguna regla que correlacione eventos (frequency o if_matched_*) y pueda alertar: recolecta, pero no correlaciona (${resumen}).`));
  }

  const declarados = filas(context, 'P-02');

  if (!declarados) {
    partes.push(faltaParametro(context, 'P-02', `qué conjuntos de reglas de correlación tienen que estar desplegados (cargados hoy: ${resumen})`));
  } else {
    declarados.forEach((f, i) => {
      if (!(f.conjunto || '').trim() || f.conjunto.trim() === '-') {
        partes.push(sinMedir(`P-02, fila ${i + 1}: falta el conjunto de reglas.`, 'CONFIGURATION'));
      }
    });

    const faltan = declarados
      .map(f => (f.conjunto || '').trim())
      .filter(nombre => nombre && nombre !== '-')
      .filter(nombre => !vigentes.some(e => iguales(campo(e, 'conjunto'), nombre) && correlacionan(e) > 0));

    if (faltan.length) {
      partes.push(noCumple(`Conjuntos de P-02 que el manager no carga, o que no tienen ninguna regla de correlación: ${faltan.join(', ')}. Cargados: ${resumen}.`));
    } else if (total > 0) {
      partes.push(cumple(`Cargados con reglas de correlación todos los conjuntos de P-02 (${resumen}). ${alertasDeCorrelacion(ctxM, ahora)}`));
    }
  }

  return conDegradacion(ctxM, ahora, 'EV-03', 'correlation_rules_inventory', combina(partes));
};

// --- EV-04, EV-10 y EV-11 · la superficie de exposición ------------------------

interface Superficie {
  sca: Medida;
  inventario: Medida;
  detector: Medida;
}

const POLITICAS_EN_CELDA = /^[A-Za-z0-9_.-]+(\s*,\s*[A-Za-z0-9_.-]+)*$/;

const superficie = (context: ENSPolicyContext, ctxM: ENSPolicyContext, ahora: number): Superficie => {
  const plazo = escalar(context, 'P-11');

  // El detector de vulnerabilidades: no depende de P-03.
  const detector = ((): Medida => {
    const { vigentes, ultimo } = estadoVigente(ctxM, 'vulnerability_detection_status', ahora);
    const vd = vigentes[vigentes.length - 1];

    if (!vd) {
      return sinHechos(ctxM, 'EV-04', ahora, ultimo, 'estado del detector de vulnerabilidades del manager');
    }

    const habilitado = campo(vd, 'habilitado');

    if (habilitado !== 'si') {
      return noCumple(`El detector de vulnerabilidades no está habilitado en ossec.conf (${habilitado || 'desconocido'}): no se determinan las vulnerabilidades.`);
    }

    const partes: Medida[] = [];
    const feed = instante(campo(vd, 'feed_actualizado'));

    if (feed === undefined) {
      partes.push(noCumple('El detector de vulnerabilidades no tiene fuente (queue/vd/feed): no hay contra qué comparar el inventario.'));
    } else if (plazo === undefined) {
      partes.push(faltaParametro(context, 'P-11', `la vigencia de la fuente del detector de vulnerabilidades (del ${iso(feed)})`));
    } else if (momento(vd) - feed > plazo * HORA) {
      partes.push(
        noCumple(`La fuente del detector de vulnerabilidades es del ${iso(feed)}: ${horas(momento(vd) - feed)} h al leerla, más que las ${plazo} de P-11. El detector no se actualiza.`)
      );
    } else {
      partes.push(cumple(`Detector de vulnerabilidades habilitado, con su fuente del ${iso(feed)}${!vacio(campo(vd, 'intervalo_feed')) ? ` (actualización cada ${campo(vd, 'intervalo_feed')})` : ''}.`));
    }

    // Los errores del conector del indexer. ossec.log rota a medianoche, así que
    // el recolector lee también el rotado del día anterior, conserva el último
    // error entre pasadas y dice desde cuándo ha podido leer (`errores_desde`).
    // Un error de hace 24 h o menos manda aunque el recuento de la ventana
    // leída sea 0; y un 0 sobre una ventana corta no demuestra nada.
    const errores = numero(campo(vd, 'errores_indexacion_24h'));
    const ultimoError = instante(campo(vd, 'ultimo_error_indexacion'));
    const desde = instante(campo(vd, 'errores_desde'));
    const muestra = campo(vd, 'muestra_error') || 'sin muestra';

    if (ultimoError !== undefined && momento(vd) - ultimoError <= 24 * HORA) {
      partes.push(
        noCumple(
          `El detector no consigue escribir su resultado en el indexer: el último error del conector es del ${iso(ultimoError)}, ${horas(momento(vd) - ultimoError)} h antes de la lectura (${errores ?? '?'} en la ventana leída; ${muestra}). Un detector que no escribe no determina nada.`
        )
      );
    } else if (errores === undefined) {
      partes.push(
        sinMedir(
          'El recolector no ha podido contar los errores del conector del indexer (ossec.log ausente, vacío o solo en JSON): no se sabe si el detector consigue escribir su resultado.',
          'COLLECTION'
        )
      );
    } else if (errores > 0) {
      partes.push(
        noCumple(
          `El detector no consigue escribir su resultado en el indexer: ${errores} errores del conector en las 24 h anteriores a la lectura (${muestra}). Un detector que no escribe no determina nada.`
        )
      );
    } else if (desde === undefined || desde > momento(vd) - 23 * HORA) {
      partes.push(
        sinMedir(
          desde === undefined
            ? 'El recolector no dice desde cuándo ha leído ossec.log (errores_desde): un recuento de 0 errores sin su ventana no demuestra que el detector escriba.'
            : `Sin errores del conector, pero el recolector solo ha podido leer ${horas(Math.max(0, momento(vd) - desde))} h de ossec.log (desde ${iso(desde)}), menos que las 24 h que se juzgan: no se puede afirmar que el detector escriba.`,
          'COLLECTION'
        )
      );
    } else {
      partes.push(
        cumple(
          `Sin errores del conector del indexer al escribir las vulnerabilidades desde ${iso(desde)}${ultimoError !== undefined ? ` (el último, del ${iso(ultimoError)})` : ''}.`
        )
      );
    }

    return combina(partes);
  })();

  const activos = filas(context, 'P-03');

  if (!activos) {
    const falta = faltaParametro(context, 'P-03', 'sobre qué activos tiene que determinarse la superficie de exposición');

    return { sca: falta, inventario: falta, detector };
  }

  if (plazo === undefined) {
    const falta = faltaParametro(context, 'P-11', 'cuántas horas puede pasar un activo sin SCA o sin inventario');

    return { sca: falta, inventario: falta, detector };
  }

  const padron = estadoVigente(ctxM, 'package_inventory_observed', ahora);
  const scas = estadoVigente(ctxM, 'config_assessment_observed', ahora);
  const configuracion: Medida[] = [];
  const sca: Medida[] = [];
  const inventario: Medida[] = [];

  activos.forEach((fila, i) => {
    const activo = (fila.activo || '').trim();
    const declaradas = (fila.politicas_sca || '').trim();

    if (!activo || activo === '-') {
      configuracion.push(sinMedir(`P-03, fila ${i + 1}: falta el activo (el nombre o el ID de su agente).`, 'CONFIGURATION'));

      return;
    }

    if (declaradas && declaradas !== '-' && !POLITICAS_EN_CELDA.test(declaradas)) {
      configuracion.push(
        sinMedir(
          `P-03, activo «${activo}»: la columna politicas_sca dice «${declaradas}», que no es una lista de identificadores de política SCA (cis_ubuntu24-04, cis_apache_24). Vacía si basta cualquier política.`,
          'CONFIGURATION'
        )
      );

      return;
    }

    if (!padron.vigentes.length) {
      const sinPadron = sinHechos(ctxM, 'EV-04', ahora, padron.ultimo, 'padrón de agentes del manager');

      sca.push(sinPadron);
      inventario.push(sinPadron);

      return;
    }

    const r = resuelve(activo, padron.vigentes);

    if (r.tipo === 'ninguno') {
      const sinAgente = noCumple(`${activo}: no figura en la base de agentes del manager, así que no se analiza.`);

      sca.push(sinAgente);
      inventario.push(sinAgente);

      return;
    }

    if (r.tipo === 'ambiguo') {
      configuracion.push(ambiguo('P-03', activo, r.ids));

      return;
    }

    const e = r.hecho;
    const id = idDelHecho(e);
    const nombre = nombreDe(activo, e);
    const lectura = campo(e, 'lectura');

    // Inventario de paquetes, del que se alimenta el detector.
    if (lectura === 'error') {
      inventario.push(sinMedir(`${nombre}: el recolector no ha podido leer su base en el manager (queue/db/${id}.db).`, 'COLLECTION'));
    } else if (lectura === 'ausente') {
      inventario.push(noCumple(`${nombre}: no tiene base en el manager (nunca ha enviado inventario).`));
    } else {
      const t = instante(campo(e, 'inventario_ultimo'));

      if (t === undefined) {
        inventario.push(noCumple(`${nombre}: sin inventario de paquetes; el detector no puede analizarlo.`));
      } else if (momento(e) - t > plazo * HORA) {
        inventario.push(noCumple(`${nombre}: su inventario de paquetes es del ${iso(t)}, ${horas(momento(e) - t)} h al leerlo (P-11 = ${plazo} h).`));
      } else {
        inventario.push(cumple(`${nombre}: inventario del ${iso(t)}${!vacio(campo(e, 'paquetes')) ? `, ${campo(e, 'paquetes')} paquetes` : ''}`));
      }
    }

    // SCA, por política.
    const suyas = scas.vigentes.filter(x => idDelHecho(x) === id);

    if (!suyas.length) {
      sca.push(
        scas.vigentes.length
          ? sinMedir(`${nombre}: el recolector no informa de su evaluación de configuración (SCA).`, 'COLLECTION')
          : sinHechos(ctxM, 'EV-04', ahora, scas.ultimo, 'inventario de evaluaciones SCA del manager')
      );

      return;
    }

    if (suyas.some(x => campo(x, 'lectura') === 'error')) {
      sca.push(sinMedir(`${nombre}: el recolector no ha podido leer su base en el manager (queue/db/${id}.db).`, 'COLLECTION'));

      return;
    }

    const politicas = suyas.filter(x => !vacio(campo(x, 'politica')) && campo(x, 'politica') !== 'ninguna');

    if (!politicas.length) {
      sca.push(noCumple(`${nombre}: ninguna política SCA evaluada; sus deficiencias de configuración no se determinan.`));

      return;
    }

    const describe = (x: ENSNormalizedEvent) =>
      `${campo(x, 'politica')} ${campo(x, 'ultimo_fin') || '-'} (puntuación ${campo(x, 'puntuacion') || '-'}%)`;
    const vigente = (x: ENSNormalizedEvent): boolean => {
      const t = instante(campo(x, 'ultimo_fin'));

      return t !== undefined && momento(x) - t <= plazo * HORA;
    };

    if (declaradas && declaradas !== '-') {
      const exigidas = declaradas.split(',').map(p => p.trim()).filter(Boolean);
      const fallan = exigidas.filter(p => !politicas.some(x => iguales(campo(x, 'politica'), p) && vigente(x)));

      sca.push(
        fallan.length
          ? noCumple(`${nombre}: políticas SCA de P-03 sin evaluar en P-11 (${plazo} h): ${fallan.join(', ')} (evaluadas: ${lista(politicas.map(describe))}).`)
          : cumple(`${nombre}: ${lista(politicas.filter(x => exigidas.some(p => iguales(campo(x, 'politica'), p))).map(describe))}`)
      );

      return;
    }

    const recientes = politicas.filter(vigente);

    sca.push(
      recientes.length
        ? cumple(`${nombre}: ${lista(recientes.map(describe))}`)
        : noCumple(`${nombre}: ninguna pasada SCA en P-11 (${plazo} h) (${lista(politicas.map(describe))}).`)
    );
  });

  const resume = (medidas: Medida[], que: string): Medida => {
    const fallos = medidas.filter(m => m.estado === 'NO_CUMPLE');
    const huecos = medidas.filter(m => m.estado === 'NO_EVALUABLE');
    const bien = medidas.filter(m => m.estado === 'CUMPLE');
    const partes: Medida[] = [...configuracion, ...huecos];

    if (fallos.length) {
      partes.push(noCumple(`Activos de P-03 sin ${que} vigente: ${lista(fallos.map(m => m.motivo))}`));
    } else if (bien.length) {
      partes.push(cumple(`${que[0].toUpperCase()}${que.slice(1)} vigente en los activos de P-03: ${lista(bien.map(m => m.motivo))}.`));
    }

    return combina(partes);
  };

  return {
    sca: resume(sca, 'evaluación de configuración (SCA)'),
    inventario: resume(inventario, 'inventario para el análisis de vulnerabilidades'),
    detector,
  };
};

const CVE_SIN_MEDIR =
  'El recuento de vulnerabilidades por activo vive en el indexer y no se lee sin credenciales: sin medir (R2 se juzga por capacidad).';

// --- EV-06 · la sonda de red (R3.2) ------------------------------------------------

const ev06 = (context: ENSPolicyContext, ctxM: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(ctxM, 'network_detection_observed', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(ctxM, 'EV-06', ahora, ultimo, 'inventario de detección en red del manager');
  }

  const observados = vigentes.filter(e => !vacio(campo(e, 'producto')) && campo(e, 'producto') !== 'ninguno');
  const vistos = observados.map(e => `${campo(e, 'producto')} por ${campo(e, 'fuente') || '-'}`).join(', ');

  if (!observados.length) {
    return conDegradacion(
      ctxM,
      ahora,
      'EV-06',
      'network_detection_observed',
      noCumple('El manager no ingiere ninguna detección en red (Suricata, Snort, Zeek): sin sonda de red, R3.2 no se cumple. Es un componente externo, no configuración de Wazuh.')
    );
  }

  const sondas = filas(context, 'P-05');

  if (!sondas) {
    return conDegradacion(
      ctxM,
      ahora,
      'EV-06',
      'network_detection_observed',
      faltaParametro(context, 'P-05', `qué sonda de red se exige (el manager ingiere: ${vistos})`)
    );
  }

  const partes: Medida[] = [];
  const fallos: string[] = [];
  const bien: string[] = [];

  sondas.forEach((f, i) => {
    const producto = (f.producto || '').trim();
    const max = (f.max_dias_sin_alertas || '').trim();

    if (!producto || producto === '-') {
      partes.push(sinMedir(`P-05, fila ${i + 1}: falta el producto de la sonda de red.`, 'CONFIGURATION'));

      return;
    }

    if (max && max !== '-' && !ENTERO_POSITIVO.test(max)) {
      partes.push(sinMedir(`P-05, sonda «${producto}»: max_dias_sin_alertas dice «${max}», que no es un número entero de días.`, 'CONFIGURATION'));

      return;
    }

    const suyos = observados.filter(e =>
      iguales(campo(e, 'producto'), producto) || sinTildes(producto).split(/[^a-z0-9]+/).includes(sinTildes(campo(e, 'producto')))
    );

    if (!suyos.length) {
      fallos.push(`${producto}: P-05 la declara y el manager no ingiere sus alertas (ingiere: ${vistos})`);

      return;
    }

    const conAlerta = suyos
      .map(e => ({ e, t: instante(campo(e, 'ultima_alerta')) }))
      .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined);

    if (!conAlerta.length) {
      fallos.push(`${producto}: llega por ${suyos.map(e => campo(e, 'fuente')).join(', ')} y no se ha recibido ninguna alerta suya`);

      return;
    }

    const ultima = conAlerta.reduce((a, b) => (b.t > a.t ? b : a));

    if (max && max !== '-' && momento(ultima.e) - ultima.t > Number(max) * DIA) {
      fallos.push(`${producto}: su última alerta es del ${iso(ultima.t)}, ${dias(momento(ultima.e) - ultima.t)} días al leerla (máximo ${max})`);
    } else {
      bien.push(`${producto} por ${campo(ultima.e, 'fuente') || '-'}: última alerta ${iso(ultima.t)}`);
    }
  });

  if (fallos.length) {
    partes.push(noCumple(`Detección en red de P-05 que no está operativa: ${lista(fallos)}.`));
  } else if (bien.length) {
    partes.push(cumple(`El manager ingiere la detección en red de P-05: ${lista(bien)}.`));
  }

  return conDegradacion(ctxM, ahora, 'EV-06', 'network_detection_observed', combina(partes));
};

// --- EV-08 · las reglas de umbral de P-07 (R5.1) -------------------------------

const ev08 = (context: ENSPolicyContext, ctxM: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(ctxM, 'query_volume_rules_observed', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(ctxM, 'EV-08', ahora, ultimo, 'inventario de reglas de umbral del manager');
  }

  const cargadas: Rango[] = [];
  const presentes = new Set<number>();
  let partesTotales = 1;

  vigentes.forEach(e => {
    if (!vacio(campo(e, 'ids'))) {
      cargadas.push(...rangos(campo(e, 'ids')));
    }

    partesTotales = Math.max(partesTotales, numero(campo(e, 'partes')) || 1);
    presentes.add(numero(campo(e, 'parte')) || 1);
  });

  const incompleto = presentes.size < partesTotales;
  const total = numero(campo(vigentes[0], 'reglas_umbral'));
  const umbrales = filas(context, 'P-07');

  if (!umbrales) {
    return conDegradacion(
      ctxM,
      ahora,
      'EV-08',
      'query_volume_rules_observed',
      faltaParametro(context, 'P-07', `qué consultas tienen que vigilarse y con qué regla (el manager carga ${total ?? '?'} reglas de umbral)`)
    );
  }

  const partes: Medida[] = [];
  const sinRegla: string[] = [];
  const sinCargar: string[] = [];
  const bien: string[] = [];

  umbrales.forEach(f => {
    const nombre = `${f.sistema}${f.perfil ? ` / ${f.perfil}` : ''}`;
    const texto = (f.reglas || '').trim();

    if (!texto || SIN_REGLA.test(texto)) {
      sinRegla.push(`«${nombre}» (${f.max_consultas || '?'} en ${f.ventana || '?'})`);

      return;
    }

    if (!REGLAS_EN_CELDA.test(texto)) {
      partes.push(
        sinMedir(
          `P-07, «${nombre}»: la columna reglas dice «${texto}», que no es una lista de ids o rangos de reglas (100510, 100500-100509). Si nadie la vigila, escribe «ninguna».`,
          'CONFIGURATION'
        )
      );

      return;
    }

    const declaradas = rangos(texto);
    const cubiertas = declaradas.filter(r => cargadas.some(c => seCortan(c, r)));

    if (cubiertas.length) {
      bien.push(`«${nombre}» → ${cubiertas.map(describeRango).join(', ')}. ${alertasDeCorrelacion(ctxM, ahora, cubiertas)}`);
    } else if (incompleto) {
      partes.push(
        sinMedir(
          `«${nombre}»: ninguna de sus reglas (${declaradas.map(describeRango).join(', ')}) aparece en lo recibido, pero faltan partes del inventario (${presentes.size} de ${partesTotales}): no se puede afirmar que no estén cargadas.`,
          'COLLECTION'
        )
      );
    } else {
      sinCargar.push(`«${nombre}» (${declaradas.map(describeRango).join(', ')})`);
    }
  });

  if (sinRegla.length) {
    partes.push(noCumple(`Consultas de P-07 que ninguna regla vigila: ${lista(sinRegla)}.`));
  }

  if (sinCargar.length) {
    partes.push(noCumple(`Consultas de P-07 cuyas reglas no están cargadas como reglas de umbral (frequency) o no pueden alertar: ${lista(sinCargar)}.`));
  }

  if (!sinRegla.length && !sinCargar.length && bien.length) {
    partes.push(cumple(`Cada consulta de P-07 la vigila una regla de umbral cargada: ${lista(bien)}`));
  }

  return conDegradacion(ctxM, ahora, 'EV-08', 'query_volume_rules_observed', combina(partes));
};

// --- EV-09 · los canales de alerta en tiempo real (R5.2) -----------------------

const ev09 = (context: ENSPolicyContext, ctxM: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(ctxM, 'notification_channel_configured', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(ctxM, 'EV-09', ahora, ultimo, 'inventario de canales de notificación del manager');
  }

  const habilitados = vigentes.filter(e => campo(e, 'habilitado') === 'si');
  const resumen = vigentes
    .map(e => `${campo(e, 'canal')} ${campo(e, 'habilitado') === 'si' ? `desde nivel ${campo(e, 'nivel_minimo') || '-'}` : 'deshabilitado'}`)
    .join(', ');
  const destinatarios = filas(context, 'P-08');
  const partes: Medida[] = [];

  if (!habilitados.length) {
    partes.push(noCumple(`El manager no tiene ningún canal de notificación habilitado (${resumen}): las detecciones no llegan a nadie en tiempo real.`));
  }

  if (!destinatarios) {
    partes.push(faltaParametro(context, 'P-08', `a quién y por qué canal tiene que llegar la alerta en tiempo real (canales: ${resumen})`));

    return conDegradacion(ctxM, ahora, 'EV-09', 'notification_channel_configured', combina(partes));
  }

  const fallos: string[] = [];
  const bien: string[] = [];

  destinatarios.forEach(f => {
    const canal = (f.canal || '').trim();
    const nivel = (f.nivel_minimo || '').trim();
    const quien = f.destinatario || canal;

    if (!canal) {
      partes.push(sinMedir(`P-08, «${quien}»: falta el canal («correo» o el nombre de la integración).`, 'CONFIGURATION'));

      return;
    }

    if (nivel && nivel !== '-' && (!ENTERO_POSITIVO.test(nivel) || Number(nivel) < 1 || Number(nivel) > 16)) {
      partes.push(sinMedir(`P-08, «${quien}»: nivel_minimo dice «${nivel}», que no es un nivel de alerta de Wazuh (1-16).`, 'CONFIGURATION'));

      return;
    }

    const e = vigentes.find(x => iguales(campo(x, 'canal'), canal));

    if (!e) {
      fallos.push(`${quien} por ${canal}: el canal no está configurado en el manager`);

      return;
    }

    if (campo(e, 'habilitado') !== 'si') {
      fallos.push(`${quien} por ${canal}: el canal está deshabilitado`);

      return;
    }

    const desde = numero(campo(e, 'nivel_minimo'));

    if (nivel && nivel !== '-' && desde !== undefined && desde > Number(nivel)) {
      fallos.push(`${quien} por ${canal}: el canal solo avisa desde el nivel ${desde} y P-08 lo exige desde el ${nivel}`);

      return;
    }

    if (iguales(canal, 'correo') && numero(campo(e, 'destinatarios')) === 0) {
      fallos.push(`${quien} por correo: el correo está habilitado sin ningún destinatario`);

      return;
    }

    const errores = numero(campo(e, 'errores_24h'));

    if (errores !== undefined && errores > 0) {
      fallos.push(`${quien} por ${canal}: ${errores} errores de envío en las 24 h anteriores a la lectura (integrations.log)`);

      return;
    }

    bien.push(`${quien} por ${canal} desde nivel ${desde ?? 'cualquiera'}`);
  });

  if (fallos.length) {
    partes.push(noCumple(`Alertas en tiempo real de P-08 que no llegan: ${lista(fallos)}.`));
  } else if (bien.length) {
    partes.push(cumple(`Canales de P-08 configurados, habilitados y sin errores: ${lista(bien)}. La latencia alerta → aviso no es medible: Wazuh no anota los envíos correctos.`));
  }

  return conDegradacion(ctxM, ahora, 'EV-09', 'notification_channel_configured', combina(partes));
};

// --- R6 · el plan (P-09) y el registro de inspecciones (EV-12) -------------------

type TipoInspeccion = 'verificacion_configuracion' | 'analisis_vulnerabilidades' | 'pentest';

const NOMBRE_INSPECCION: Record<TipoInspeccion, string> = {
  verificacion_configuracion: 'verificación de configuración',
  analisis_vulnerabilidades: 'análisis de vulnerabilidades',
  pentest: 'prueba de penetración',
};

type Plan = { continua: true } | { continua: false; dias: number };

// La fila de P-09 de una inspección: «continua» o un número de días. Nada más.
const planDe = (context: ENSPolicyContext, tipo: TipoInspeccion): Plan | Medida => {
  const plan = filas(context, 'P-09');

  if (!plan) {
    return faltaParametro(context, 'P-09', `con qué periodicidad tiene que hacerse la ${NOMBRE_INSPECCION[tipo]}`);
  }

  const suyas = plan.filter(f => sinTildes(f.inspeccion || '') === tipo);

  if (!suyas.length) {
    return sinMedir(`P-09 no declara la periodicidad de la ${NOMBRE_INSPECCION[tipo]} (${tipo}).`, 'CONFIGURATION');
  }

  if (suyas.length > 1) {
    return sinMedir(`P-09 declara ${suyas.length} veces la ${NOMBRE_INSPECCION[tipo]}: una fila por inspección.`, 'CONFIGURATION');
  }

  const texto = sinTildes((suyas[0].periodicidad || '').trim());

  if (texto === 'continua') {
    return { continua: true };
  }

  const m = /^(\d+)(\s*(dias|d))?$/.exec(texto);

  if (!m || Number(m[1]) <= 0) {
    return sinMedir(
      `P-09, ${tipo}: la periodicidad dice «${suyas[0].periodicidad || ''}», y solo puede ser un número de días (365 para anual) o «continua».`,
      'CONFIGURATION'
    );
  }

  return { continua: false, dias: Number(m[1]) };
};

const esPlan = (x: Plan | Medida): x is Plan => 'continua' in x;

// La última inspección de un tipo en el registro, contra la periodicidad. La
// antigüedad se mide en el instante en que el recolector leyó el registro.
const registroDe = (ctxM: ENSPolicyContext, ahora: number, tipo: TipoInspeccion, diasPlan: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(ctxM, 'security_inspection_recorded', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(ctxM, 'EV-12', ahora, ultimo, 'registro de inspecciones del manager');
  }

  const filasRegistro = vigentes.filter(e => campo(e, 'tipo') !== 'ninguna');
  const defectuosas = filasRegistro.filter(e => !vacio(campo(e, 'formato')) && campo(e, 'formato') !== 'ok');
  const partes: Medida[] = [];

  if (defectuosas.length) {
    partes.push(
      sinMedir(
        `Filas del registro de inspecciones con formato inválido, que no cuentan: ${lista(defectuosas.map(e => `línea ${campo(e, 'fila')}: ${campo(e, 'formato')}`))}.`,
        'CONFIGURATION'
      )
    );
  }

  const futuras = filasRegistro.filter(e => {
    const t = instante(campo(e, 'fecha'));

    return campo(e, 'formato') === 'ok' && t !== undefined && t > momento(e) + MISMA_PASADA;
  });

  if (futuras.length) {
    partes.push(
      sinMedir(
        `Inspecciones con fecha futura en el registro, que es de actos realizados: ${lista(futuras.map(e => `línea ${campo(e, 'fila')} (${campo(e, 'fecha')})`))}.`,
        'CONFIGURATION'
      )
    );
  }

  const hechas = filasRegistro
    .filter(e => (vacio(campo(e, 'formato')) || campo(e, 'formato') === 'ok') && campo(e, 'tipo') === tipo)
    .map(e => ({ e, t: instante(campo(e, 'fecha')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined && x.t <= momento(x.e) + MISMA_PASADA);

  if (!hechas.length) {
    partes.push(noCumple(`No consta ninguna ${NOMBRE_INSPECCION[tipo]} en el registro de inspecciones (periodicidad de P-09: ${diasPlan} días).`));
  } else {
    const ultima = hechas.reduce((a, b) => (b.t > a.t ? b : a));
    const edad = momento(ultima.e) - ultima.t;
    const que = `la última ${NOMBRE_INSPECCION[tipo]} es del ${iso(ultima.t)} (${campo(ultima.e, 'ejecutor') || 'ejecutor sin declarar'}, ${campo(ultima.e, 'alcance') || 'alcance sin declarar'}; hallazgos: ${campo(ultima.e, 'hallazgos') || '-'}, ${campo(ultima.e, 'estado_remediacion') || '-'})`;

    partes.push(
      edad > diasPlan * DIA
        ? noCumple(`Vencida: ${que}, hace ${dias(edad)} días al leer el registro, más que los ${diasPlan} de P-09.`)
        : cumple(`Dentro de la periodicidad de P-09 (${diasPlan} días): ${que}.`)
    );
  }

  return conDegradacion(ctxM, ahora, 'EV-12', 'security_inspection_recorded', combina(partes));
};

// Una inspección de R6. Devuelve la medida del requisito y la de cada
// evidencia que la sostiene en ESTE requisito.
const inspeccion = (
  context: ENSPolicyContext,
  ctxM: ENSPolicyContext,
  ahora: number,
  tipo: TipoInspeccion,
  continua?: { evidencia: string; medida: Medida }
): { requisito: Medida; evidencias: { id: string; medida: Medida }[] } => {
  const deContinua = continua ? [{ id: continua.evidencia, medida: continua.medida }] : [];

  const plan = planDe(context, tipo);

  if (!esPlan(plan)) {
    // Sin plan no hay contra qué juzgar el registro, pero una medida continua
    // en contra sigue mandando.
    const evidencias = [...deContinua, { id: 'EV-12', medida: plan }];

    return { requisito: combina(evidencias.map(x => x.medida)), evidencias };
  }

  if (plan.continua) {
    if (!continua) {
      const medida = sinMedir(
        `P-09 declara la ${NOMBRE_INSPECCION[tipo]} «continua», y no lo es: declara su periodicidad en días (365 para anual).`,
        'CONFIGURATION'
      );

      return { requisito: medida, evidencias: [{ id: 'EV-12', medida }] };
    }

    return {
      requisito: continua.medida,
      evidencias: [
        ...deContinua,
        { id: 'EV-12', medida: noAplica(`P-09 declara la ${NOMBRE_INSPECCION[tipo]} continua: se acredita con ${continua.evidencia}, sin fila del registro.`) },
      ],
    };
  }

  const registro = registroDe(ctxM, ahora, tipo, plan.dias);

  if (!continua) {
    return { requisito: registro, evidencias: [{ id: 'EV-12', medida: registro }] };
  }

  // Periódica: basta la medida continua (supera la periodicidad) o la última
  // fila del registro dentro de ella.
  if (continua.medida.estado === 'CUMPLE') {
    return {
      requisito: cumple(`La ${NOMBRE_INSPECCION[tipo]} es continua (${continua.evidencia}), lo que supera la periodicidad de P-09 (${plan.dias} días): ${continua.medida.motivo}`),
      evidencias: [
        ...deContinua,
        { id: 'EV-12', medida: noAplica(`La ${NOMBRE_INSPECCION[tipo]} continua (${continua.evidencia}) ya cubre la periodicidad de P-09. Registro: ${registro.motivo}`) },
      ],
    };
  }

  if (registro.estado === 'CUMPLE') {
    return {
      requisito: cumple(`Acreditada con el registro: ${registro.motivo} (la medida continua no basta: ${continua.medida.motivo})`),
      evidencias: [...deContinua, { id: 'EV-12', medida: registro }],
    };
  }

  return {
    requisito: combina([continua.medida, registro]),
    evidencias: [...deContinua, { id: 'EV-12', medida: registro }],
  };
};

// --- EV-13 · inspecciones tras incidentes (se informa) ---------------------------

const ev13 = (ctxM: ENSPolicyContext, ahora: number): string => {
  const incidentes = estadoVigente(ctxM, 'incident_registered', ahora);
  const inspecciones = estadoVigente(ctxM, 'security_inspection_recorded', ahora).vigentes.filter(
    e => campo(e, 'motivo') === 'post_incidente'
  );

  if (!incidentes.vigentes.length) {
    const deg = degradacion(ctxM, 'EV-13', ahora);

    return deg ? deg.motivo : `No consta el resumen de incidentes del periodo: el recolector de op.mon.3 del manager no informa.`;
  }

  const reales = incidentes.vigentes.filter(e => campo(e, 'incidente_id') !== 'ninguno');
  const citados = new Map<string, string[]>();

  inspecciones.forEach(e => {
    const id = campo(e, 'incidente_id');

    citados.set(id, [...(citados.get(id) || []), `${campo(e, 'tipo')} del ${campo(e, 'fecha')}`]);
  });

  const conInspeccion = reales.filter(e => citados.has(campo(e, 'incidente_id')));
  const sinInspeccion = reales.filter(e => !citados.has(campo(e, 'incidente_id')));
  const desconocidos = Array.from(citados.keys()).filter(id => !reales.some(e => campo(e, 'incidente_id') === id));

  return [
    reales.length
      ? `${reales.length} incidentes en los últimos ${VENTANA_DIAS} días.`
      : `Ningún incidente en los últimos ${VENTANA_DIAS} días.`,
    conInspeccion.length
      ? `Con inspección posterior: ${lista(conInspeccion.map(e => `${campo(e, 'incidente_id')} (${(citados.get(campo(e, 'incidente_id')) || []).join(', ')})`))}.`
      : '',
    sinInspeccion.length ? `Sin inspección posterior registrada: ${lista(sinInspeccion.map(e => `${campo(e, 'incidente_id')} (${campo(e, 'severidad')})`))}.` : '',
    desconocidos.length ? `Inspecciones tras incidente que citan incidentes fuera del periodo o inexistentes: ${lista(desconocidos)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const DATO_EV13 =
  'Dato del informe, sin veredicto: el registro de incidentes (13 columnas, compartido con op.exp.7 y op.exp.9) no dice qué incidentes revelaron vulnerabilidades nuevas o subestimadas, que son los que R6 obliga a inspeccionar.';

// --- R3.1 y R4 · documentales -----------------------------------------------------

const documental = (context: ENSPolicyContext, parametro: string, que: string, columnas: (f: Record<string, string>) => string): Medida => {
  const declarado = filas(context, parametro);

  return sinMedir(
    `${que} no se puede medir: se acredita documentalmente con P-ATT.${declarado ? ` ${etiqueta(context, parametro)} declara: ${lista(declarado.map(columnas))}.` : ` ${etiqueta(context, parametro)} está sin declarar.`}`,
    'CONFIGURATION'
  );
};

// --- decisiones ------------------------------------------------------------------

type Fila = 'central' | 'agente' | 'desconocida';

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();
  const aplica = (requisito: string): boolean =>
    Boolean(
      context.control.requirements
        .find(r => r.id === requisito)
        ?.applicability.levels.includes(context.level)
    );

  const maquinas = maquinasDe(context);
  const fila: Fila = maquinas.has(MANAGER) ? 'central' : maquinas.size ? 'agente' : 'desconocida';
  const ctxM = deMaquina(context, MANAGER);

  // Cada medida se calcula una vez y solo si algún requisito que aplica la usa.
  const cache: Record<string, Medida> = {};
  const medir = (clave: string, calcula: () => Medida): Medida => {
    if (!cache[clave]) {
      cache[clave] = calcula();
    }

    return cache[clave];
  };

  let superficieMedida: Superficie | undefined;
  const sup = (): Superficie => {
    if (!superficieMedida) {
      superficieMedida = superficie(context, ctxM, ahora);
    }

    return superficieMedida;
  };

  // La medida de una evidencia del plano central, o lo que corresponde a la
  // fila: en la de un agente, NO_APLICA; sin hechos, nada se da por bueno.
  const central = (clave: string, calcula: () => Medida): Medida =>
    fila === 'agente'
      ? noAplica(SE_MIDE_EN_EL_MANAGER)
      : fila === 'desconocida'
      ? sinMedir(SIN_NINGUN_HECHO, 'COLLECTION')
      : medir(clave, calcula);

  const medidaDe = (evidencia: string): Medida => {
    switch (evidencia) {
      case 'EV-01':
        return central('EV-01', () => ev01(ctxM, ahora));
      case 'EV-02':
        return fila === 'desconocida' ? sinMedir(SIN_NINGUN_HECHO, 'COLLECTION') : medir('EV-02', () => ev02(context, ahora, maquinas));
      case 'EV-03':
        return central('EV-03', () => ev03(context, ctxM, ahora));
      case 'EV-04':
        return central('EV-04', () => {
          const s = sup();
          const ejes = [s.sca, s.inventario, s.detector].filter(
            (m, i, todas) => todas.findIndex(x => x.estado === m.estado && x.motivo === m.motivo) === i
          );

          return conDegradacion(
            ctxM,
            ahora,
            'EV-04',
            'package_inventory_observed',
            combina([...ejes, ...(peor(ejes) === 'CUMPLE' ? [cumple(CVE_SIN_MEDIR)] : [])])
          );
        });
      case 'EV-06':
        return central('EV-06', () => ev06(context, ctxM, ahora));
      case 'EV-08':
        return central('EV-08', () => ev08(context, ctxM, ahora));
      case 'EV-09':
        return central('EV-09', () => ev09(context, ctxM, ahora));
      case 'EV-10':
        return central('EV-10', () => conDegradacion(ctxM, ahora, 'EV-04', 'config_assessment_observed', sup().sca));
      default:
        return central('EV-11', () =>
          conDegradacion(ctxM, ahora, 'EV-04', 'package_inventory_observed', combina([sup().inventario, sup().detector]))
        );
    }
  };

  const requisitoDecisions: ENSPolicyDecision[] = [];
  const evidenciaDecisions: ENSPolicyDecision[] = [];

  const emite = (
    requisito: string,
    tipo: ENSTipoDeRegla,
    parametros: string[],
    medida: Medida,
    evidencias: { id: string; medida: Medida }[],
    esperado: string
  ) => {
    const responsables = evidencias.filter(p => p.medida.estado === medida.estado);

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`.
    requisitoDecisions.push(
      decide(
        requisito,
        medida.estado,
        (responsables.length ? responsables : evidencias).map(p => p.id),
        parametros,
        tipo,
        requisito,
        [
          ...(medida.motivo ? [medida.motivo] : []),
          ...evidencias.map(p => `${p.id} ${p.medida.estado}: ${p.medida.motivo}`),
        ].join(' | '),
        esperado,
        medida.causa ?? causaComun(responsables.map(p => p.medida))
      )
    );

    // Y una por evidencia, con SU estado.
    evidencias.forEach(p =>
      evidenciaDecisions.push(
        decide(requisito, p.medida.estado, [p.id], parametros, tipo, `${requisito}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`, p.medida.causa)
      )
    );
  };

  // Los técnicos: el peor de sus evidencias.
  const TECNICOS: { requisito: string; evidencias: string[]; parametros: string[]; tipo: ENSTipoDeRegla }[] = [
    { requisito: 'op.mon.3.1', evidencias: ['EV-01', 'EV-02'], parametros: ['P-01'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r1.1', evidencias: ['EV-03'], parametros: ['P-02'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r2.1', evidencias: ['EV-04'], parametros: ['P-03', 'P-11'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r3.2', evidencias: ['EV-06'], parametros: ['P-05'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r5.1', evidencias: ['EV-08'], parametros: ['P-07'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r5.2', evidencias: ['EV-09'], parametros: ['P-08'], tipo: 'COVERAGE_REQUIRED' },
  ];

  TECNICOS.filter(r => aplica(r.requisito)).forEach(definicion => {
    const propias = definicion.evidencias.map(id => ({ id, medida: medidaDe(id) }));
    const estado = peor(propias.map(p => p.medida));
    const responsables = propias.filter(p => p.medida.estado === estado);

    emite(
      definicion.requisito,
      definicion.tipo,
      definicion.parametros,
      { estado, motivo: '', ...(estado === 'NO_EVALUABLE' ? { causa: causaComun(responsables.map(p => p.medida)) } : {}) },
      propias,
      definicion.evidencias.map(id => `${id} CUMPLE`).join(' y ')
    );
  });

  // R3.1 y R4: documentales. Sin medida, la decisión queda sin medir
  // (CONFIGURATION) y P-ATT puede acreditarlos, porque el catálogo los declara
  // sin evidencias. En la fila de un agente no aplican: se acreditan en la del
  // manager.
  const DOCUMENTALES: { requisito: string; parametro: string; que: string; columnas: (f: Record<string, string>) => string }[] = [
    {
      requisito: 'op.mon.3.r3.1',
      parametro: 'P-04',
      que: 'La detección de comportamientos anómalos (Wazuh no trae motor de líneas base: son reglas que alguien escribe sobre los indicadores de la línea base)',
      columnas: f => `${f.indicador} (normal: ${f.normalidad || '-'}; anomalía: ${f.umbral_anomalia || '-'})`,
    },
    {
      requisito: 'op.mon.3.r4.1',
      parametro: 'P-06',
      que: 'El observatorio digital (un servicio de cibervigilancia externo, ajeno al perímetro de un SIEM)',
      columnas: f => `${f.servicio}${f.proveedor ? ` de ${f.proveedor}` : ''}${f.alcance ? ` (${f.alcance})` : ''}`,
    },
  ];

  DOCUMENTALES.filter(d => aplica(d.requisito)).forEach(d => {
    const medida = fila === 'agente' ? noAplica(SE_MIDE_EN_EL_MANAGER) : documental(context, d.parametro, d.que, d.columnas);

    emite(d.requisito, 'COVERAGE_REQUIRED', [d.parametro], medida, [], 'P-ATT del requisito');
  });

  // R6: P-09 manda.
  const INSPECCIONES: { requisito: string; tipo: TipoInspeccion; continua?: string; parametros: string[] }[] = [
    { requisito: 'op.mon.3.r6.1', tipo: 'verificacion_configuracion', continua: 'EV-10', parametros: ['P-03', 'P-09', 'P-10', 'P-11'] },
    { requisito: 'op.mon.3.r6.2', tipo: 'analisis_vulnerabilidades', continua: 'EV-11', parametros: ['P-03', 'P-09', 'P-10', 'P-11'] },
    { requisito: 'op.mon.3.r6.3', tipo: 'pentest', parametros: ['P-09', 'P-10'] },
  ];

  INSPECCIONES.filter(i => aplica(i.requisito)).forEach(i => {
    const esperado = i.continua ? `${i.continua} CUMPLE, o EV-12 dentro de P-09` : 'EV-12 dentro de P-09';

    if (fila !== 'central') {
      const medida = fila === 'agente' ? noAplica(SE_MIDE_EN_EL_MANAGER) : sinMedir(SIN_NINGUN_HECHO, 'COLLECTION');
      const evidencias = [...(i.continua ? [i.continua] : []), 'EV-12'].map(id => ({ id, medida }));

      emite(i.requisito, 'MAX_AGE', i.parametros, medida, evidencias, esperado);

      return;
    }

    const continua = i.continua ? { evidencia: i.continua, medida: medidaDe(i.continua) } : undefined;
    const { requisito, evidencias } = inspeccion(context, ctxM, ahora, i.tipo, continua);

    emite(i.requisito, 'MAX_AGE', i.parametros, requisito, evidencias, esperado);
  });

  // Las evidencias que se informan sin veredicto.
  const informativa = (requisito: string, evidencia: string, parametros: string[], motivo: string) =>
    evidenciaDecisions.push(decide(requisito, 'NO_APLICA', [evidencia], parametros, 'COVERAGE_REQUIRED', `${requisito}/${evidencia}`, motivo, 'dato del informe'));

  const lineaBase = filas(context, 'P-04');
  const listas = fila === 'central' ? estadoVigente(ctxM, 'ioc_list_observed', ahora).vigentes.filter(e => campo(e, 'lista') !== 'ninguna') : [];
  const datoEv13 = fila === 'central' ? `${DATO_EV13} ${ev13(ctxM, ahora)}` : DATO_EV13;

  informativa(
    'op.mon.3.r3.1',
    'EV-05',
    ['P-04'],
    `Dato del informe, sin veredicto: R3.1 se acredita documentalmente (P-ATT). ${lineaBase ? `Línea base de P-04: ${lista(lineaBase.map(f => `${f.indicador} (normal: ${f.normalidad || '-'}; anomalía: ${f.umbral_anomalia || '-'})`))}.` : 'P-04 sin declarar: no consta contra qué normalidad se detectan las anomalías.'}`
  );
  informativa(
    'op.mon.3.r4.1',
    'EV-07',
    ['P-06'],
    fila === 'agente'
      ? SE_MIDE_EN_EL_MANAGER
      : `Dato del informe, sin veredicto: R4 exige el servicio de cibervigilancia, que se acredita documentalmente (P-ATT). ${
          listas.length
            ? `Listas de indicadores cargadas: ${lista(listas.map(e => `${campo(e, 'lista')} (${campo(e, 'entradas') || '?'} entradas, del ${campo(e, 'actualizada') || '-'}, ${campo(e, 'reglas_que_la_usan') || '0'} reglas)`))}.`
            : 'El manager no carga ninguna lista de indicadores.'
        }`
  );
  informativa('op.mon.3.r6.1', 'EV-13', ['P-09', 'P-10'], fila === 'agente' ? SE_MIDE_EN_EL_MANAGER : datoEv13);

  const s = fila === 'central' && (aplica('op.mon.3.r2.1') || aplica('op.mon.3.r6.1') || aplica('op.mon.3.r6.2')) ? sup() : undefined;
  const variables: ENSRuntimeVariable[] = [
    {
      name: 'fila_de_medida',
      value: fila,
      parameterIds: [],
      evidenceIds: [],
      eventIds: [],
      description:
        fila === 'central'
          ? 'Fila del sistema central de recolección (manager): se miden todas las evidencias.'
          : fila === 'agente'
          ? 'Fila de un agente: se miden sus fuentes de P-01 (EV-02); lo demás se mide en el manager.'
          : SIN_NINGUN_HECHO,
    },
    ...Object.entries(cache).map(([clave, medida]) => ({
      name: `medida_${clave.replace(/[-.]/g, '')}`,
      value: medida.estado,
      parameterIds: [],
      evidenceIds: [clave],
      eventIds: [],
      description: medida.motivo,
    })),
    ...(s
      ? [
          { name: 'superficie_sca', value: s.sca.estado, parameterIds: ['P-03', 'P-11'], evidenceIds: ['EV-04', 'EV-10'], eventIds: [], description: s.sca.motivo },
          { name: 'superficie_inventario', value: s.inventario.estado, parameterIds: ['P-03', 'P-11'], evidenceIds: ['EV-04', 'EV-11'], eventIds: [], description: s.inventario.motivo },
          { name: 'superficie_detector', value: s.detector.estado, parameterIds: ['P-11'], evidenceIds: ['EV-04', 'EV-11'], eventIds: [], description: s.detector.motivo },
        ]
      : []),
    {
      name: 'cve_por_activo',
      value: 'sin_medir',
      parameterIds: ['P-03'],
      evidenceIds: ['EV-04'],
      eventIds: [],
      description: CVE_SIN_MEDIR,
    },
  ];

  return { decisions: [...requisitoDecisions, ...evidenciaDecisions], runtimeVariables: variables };
};

export const opMon3PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // Por categoría del sistema: base en las tres, R1 y R2 desde MEDIA, R3 a R6
  // solo en ALTA, R7 en ninguna.
  requirements: [
    {
      requirementId: 'op.mon.3.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-11'],
      evidenceIds: ['EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r3.2',
      levels: ['ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r4.1',
      levels: ['ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r5.1',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r5.2',
      levels: ['ALTO'],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r6.1',
      levels: ['ALTO'],
      parameterIds: ['P-03', 'P-09', 'P-10', 'P-11'],
      evidenceIds: ['EV-10', 'EV-12'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.3.r6.2',
      levels: ['ALTO'],
      parameterIds: ['P-03', 'P-09', 'P-10', 'P-11'],
      evidenceIds: ['EV-11', 'EV-12'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.3.r6.3',
      levels: ['ALTO'],
      parameterIds: ['P-09', 'P-10'],
      evidenceIds: ['EV-12'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.3.r7.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
