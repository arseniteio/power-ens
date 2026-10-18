// op.mon.1 · Detección de intrusión
//
// Por qué este control tiene policy propia. Es el control que Wazuh cubre por
// existir, y por eso el diseño (spec 2026-10-09 §1) mide lo que la plantilla
// pide de verdad: que la detección cubra los sistemas declarados, que produzca
// resultado, que responda al análisis de riesgos, que su ruleset esté vigente y
// que sus exclusiones consten. Nada de eso cabe en una primitiva:
//
//   1. TODO SE MIDE EN EL MANAGER y los hechos hablan de OTROS sistemas. El
//      recolector del manager (agent.id=000) emite una fila por agente con su
//      campo `agente`, así que cada fila de P-01 se cruza con su hecho por ID o
//      por nombre exacto (EV-02, EV-03). Un agente que no está en P-01 —uno de
//      prueba, uno dado de baja— no cuenta; uno que está en P-01 y no se
//      encuentra, o casa con dos agentes, se dice.
//   2. CRUCES ENTRE TABLAS: cada situación de P-04 contra los rangos de ids de
//      las reglas cargadas (EV-04); EV-05 solo si P-02 exige detección en red;
//      cada silenciamiento contra P-06 (EV-08).
//   3. LA SERIE: que el motor procesa se ve comparando sus contadores entre dos
//      pasadas (EV-01).
//
// Qué decide cada requisito (spec §1.3):
//
//   op.mon.1.1     EV-01 (motor activo, procesando, con reglas), EV-02, EV-03,
//                  EV-04 y EV-05.
//   op.mon.1.r1.1  EV-01, los conjuntos de P-03 cargados (medida propia, no
//                  una evidencia) y EV-08 con sus dos ejes (antigüedad contra
//                  P-08; silenciamientos contra P-06), combinados como en
//                  op.exp.8.
//   op.mon.1.r2.1  documental: la tabla de procedimientos de P-05, con cada
//                  fila completa, lo acredita con la marca `attested` (en
//                  pantalla, «acreditado documentalmente»). Sin P-05, queda sin
//                  medir y lo puede acreditar P-ATT, porque el catálogo lo
//                  declara sin evidencias. Su decisión lleva `documental`.
//   op.mon.1.r3.1  no se exige en ninguna categoría: EV-07 se mide y se
//                  INFORMA, sin veredicto (NO_APLICA con lo que hay).
//
// EV-06 queda en el catálogo sin requisito que la juzgue: sale NO_APLICA con
// el motivo «dato del informe» para que no se pinte en gris.
//
// Invariantes, las de `evidence/judgment.ts`:
//   - el recolector emite instantes y recuentos, no edades: toda antigüedad se
//     mide aquí contra `context.now`;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo y causa; nunca un
//     CUMPLE por ausencia;
//   - lo que el recolector declara que no pudo medir (evidence_state
//     NO_EVALUABLE) sale NO_EVALUABLE con SU motivo y SU causa;
//   - la policy nunca inventa política: ningún plazo, umbral o lista tiene
//     valor por defecto.
//
// Solo se emiten decisiones de los requisitos que aplican al nivel (la
// categoría del sistema): una decisión de R1 en BÁSICA no cuenta para el
// requisito, pero el puente la llevaría a la tabla de evidencias.
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
import type { ENSNormalizedEvent } from '../../data-source/types';
// Por la ruta del fichero, nunca por el barrel (TDZ de Settings).
import {
  HORA,
  DIA,
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
  MISMA_PASADA,
  sinTildes,
  vacio,
  iguales,
  filas,
  escalar,
  faltaParametro,
  lectorDeHechos,
  decisorDe,
} from './policy-kit';
import type { ENSTipoDeRegla, Medida } from './policy-kit';

const CONTROL = 'op.mon.1';
const POLICY = 'policy.op.mon.1';

// Los hechos de op.mon.1, con la frescura de los hechos de estado (26 h): el
// recolector pasa cada hora (el motor) y cada 6 h (lo demás), y reemite el
// estado entero.
const { hechos, validos, estadoVigente, degradacion, sinHechos, conDegradacion } = lectorDeHechos(CONTROL, {
  recolector: 'el recolector de op.mon.1 del manager',
});

const decide = decisorDe(POLICY);

// Frescura del estado del MOTOR, que llega cada hora. No vale la de 26 h: los
// hechos de ENSFácil llegan al índice A TRAVÉS de wazuh-analysisd, así que si el
// motor muere deja de llegar su propio estado, y el último —«procesando»—
// seguiría acreditando el control un día entero. 3 h toleran dos pasadas
// horarias perdidas.
const FRESCURA_MOTOR_HORAS = 3;

// --- los sistemas de P-01 y sus agentes ------------------------------------
//
// Un sistema de P-01 es el NOMBRE o el ID de su agente. Se busca primero por ID
// (un número, con o sin ceros a la izquierda: 24 es el agente 024) y después
// por nombre EXACTO, sin distinguir mayúsculas. Nunca por parecido: un agente
// de prueba que se llame «wazuh-real-old» no es «wazuh-real». Si el nombre casa
// con dos agentes distintos, no se elige: se pide declararlo por ID.

type Resolucion =
  | { tipo: 'unico'; hecho: ENSNormalizedEvent }
  | { tipo: 'ninguno' }
  | { tipo: 'ambiguo'; ids: string[] };

const idDeAgente = (texto: string): string | undefined =>
  /^\d+$/.test(texto.trim()) ? texto.trim().padStart(3, '0') : undefined;

// El ID del agente de un hecho, normalizado igual que el de P-01: un recolector
// que emita «24» en vez de «024» no deja al sistema sin agente.
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
  const ids = Array.from(new Set(porNombre.map(e => idDelHecho(e))));

  if (ids.length === 1) {
    return { tipo: 'unico', hecho: porNombre[0] };
  }

  return ids.length > 1 ? { tipo: 'ambiguo', ids } : { tipo: 'ninguno' };
};

const ambiguo = (sistema: string, ids: string[]): Medida =>
  sinMedir(
    `P-01 declara «${sistema}» y en el manager hay ${ids.length} agentes con ese nombre (${ids.join(', ')}): no se elige uno. Decláralo por su ID.`,
    'CONFIGURATION'
  );

const nombreDe = (sistema: string, e: ENSNormalizedEvent): string => {
  const id = idDelHecho(e);
  const agente = campo(e, 'agente');

  return iguales(agente, sistema) ? `${sistema} (${id})` : `${sistema} (${agente}, ${id})`;
};

// Los agentes que el manager tiene registrados y P-01 no declara: no cuentan,
// pero se dicen, para que un auditor vea qué queda fuera y en qué estado.
const fueraDeP01 = (sistemas: Record<string, string>[], deAgentes: ENSNormalizedEvent[]): string => {
  const dentro = new Set<string>();

  sistemas.forEach(fila => {
    const r = resuelve(fila.sistema, deAgentes);

    if (r.tipo === 'unico') {
      dentro.add(idDelHecho(r.hecho));
    }
  });

  const fuera = deAgentes.filter(e => !dentro.has(idDelHecho(e)));

  if (!fuera.length) {
    return '';
  }

  const desconectados = fuera.filter(e => campo(e, 'estado_conexion') && campo(e, 'estado_conexion') !== 'active');

  return ` Fuera de P-01 hay ${fuera.length} agente(s) registrado(s)${
    desconectados.length ? ` (${desconectados.length} sin conectar: ${lista(desconectados.map(e => `${campo(e, 'agente')} ${idDelHecho(e)} ${campo(e, 'estado_conexion')}`))})` : ''
  }, que no cuentan.`;
};

// --- rangos de ids -----------------------------------------------------------

type Rango = [number, number];

// '5700-5799,80790' (el hecho) o 'reglas 5710, 80790' (la celda de P-04).
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

interface Conjunto {
  conjunto: string;
  rangos: Rango[];
  reglas?: number;
  partes: number;
  presentes: Set<number>;
}

// Los conjuntos de la última pasada, con sus partes unidas. Un conjunto con
// tantos ids que no caben en una línea llega en varias (`parte`, `partes`).
const conjuntosCargados = (vigentes: ENSNormalizedEvent[]): Conjunto[] => {
  const porNombre = new Map<string, Conjunto>();

  vigentes.forEach(e => {
    const nombre = campo(e, 'conjunto');
    const c =
      porNombre.get(nombre) ||
      { conjunto: nombre, rangos: [], partes: 1, presentes: new Set<number>() };

    c.rangos.push(...rangos(campo(e, 'ids')));
    c.reglas = numero(campo(e, 'reglas')) ?? c.reglas;
    c.partes = Math.max(c.partes, numero(campo(e, 'partes')) || 1);
    c.presentes.add(numero(campo(e, 'parte')) || 1);
    porNombre.set(nombre, c);
  });

  return Array.from(porNombre.values());
};

const incompleto = (c: Conjunto): boolean => c.presentes.size < c.partes;

// --- EV-01 · el motor de reglas activo, procesando y con reglas ---------------

const ev01Base = (context: ENSPolicyContext, ahora: number): Medida => {
  const serie = validos(context, 'detection_engine_status', ahora);
  const ultimo = serie.length ? momento(serie[serie.length - 1]) : undefined;

  if (ultimo === undefined) {
    return sinHechos(context, 'EV-01', ahora, ultimo, 'estado del motor de reglas del manager');
  }

  if (ahora - ultimo > FRESCURA_MOTOR_HORAS * HORA) {
    return sinMedir(
      `El último estado del motor de reglas es de ${iso(ultimo)}, hace ${horas(ahora - ultimo)} h (más de ${FRESCURA_MOTOR_HORAS} h, y el recolector pasa cada hora): se ha parado el recolector de op.mon.1 o el propio motor de análisis (wazuh-analysisd), por el que llegan sus hechos. No se puede afirmar que el motor esté detectando.`,
      'COLLECTION'
    );
  }

  const actual = serie[serie.length - 1];
  const anterior = [...serie].reverse().find(e => momento(e) < ultimo - MISMA_PASADA);
  const partes: Medida[] = [];

  const activo = campo(actual, 'activo');

  if (activo !== 'si') {
    partes.push(noCumple(`wazuh-manager no está activo (${activo || 'desconocido'}): no hay motor de detección en marcha.`));
  } else {
    partes.push(cumple('wazuh-manager activo.'));
  }

  // Que procesa: los contadores del motor de análisis entre dos pasadas.
  const procesados = numero(campo(actual, 'eventos_procesados'));
  const antes = anterior ? numero(campo(anterior, 'eventos_procesados')) : undefined;
  const nuevas = numero(campo(actual, 'alertas_nuevas'));
  const volumen = `${campo(actual, 'eventos_recibidos') || '-'} recibidos, ${campo(actual, 'eventos_descartados') || '-'} descartados, ${campo(actual, 'alertas_escritas') || '-'} alertas escritas`;

  if (procesados === undefined) {
    // Sin contadores (el fichero de estado del motor no existe en esta versión
    // o no se pudo leer): la otra prueba de que procesa es que escribe alertas.
    // `alertas_nuevas` no cuenta las de ENSFácil: los propios hechos de los
    // recolectores no prueban que el motor detecte nada.
    if (nuevas !== undefined && nuevas > 0) {
      partes.push(cumple(`El motor escribe alertas: ${nuevas} alertas de detección nuevas en alerts.json desde la pasada anterior, sin contar las de ENSFácil (sin contadores del motor: ${campo(actual, 'fuente_contadores') || '-'}).`));
    } else {
      partes.push(
        degradacion(context, 'EV-01', ahora, ultimo + 1) ||
          sinMedir(
            `El recolector no ha podido leer los contadores del motor de análisis (${campo(actual, 'fuente_contadores') || 'sin fuente'})${nuevas === 0 ? ' y no hay alertas de detección nuevas desde la pasada anterior' : ''}: no se puede afirmar que el motor procese eventos.`,
            'COLLECTION'
          )
      );
    }
  } else if (anterior === undefined || antes === undefined) {
    partes.push(
      procesados > 0
        ? cumple(`El motor ha procesado ${procesados} eventos (${volumen}); una sola pasada, sin serie todavía.`)
        : sinMedir('El motor no ha procesado ningún evento y no hay una pasada anterior con la que comparar.')
    );
  } else if (procesados > antes) {
    partes.push(cumple(`El motor procesa: ${procesados - antes} eventos entre ${iso(momento(anterior))} y ${iso(ultimo)} (${volumen}).`));
  } else if (procesados < antes) {
    // Los contadores vuelven a cero al reiniciar el servicio.
    partes.push(
      procesados > 0
        ? cumple(`El motor se reinició entre ${iso(momento(anterior))} y ${iso(ultimo)} y ha procesado ${procesados} eventos desde entonces.`)
        : sinMedir(`El motor se reinició entre ${iso(momento(anterior))} y ${iso(ultimo)} y todavía no ha procesado ningún evento.`)
    );
  } else {
    partes.push(
      noCumple(`El motor de análisis no ha procesado ningún evento entre ${iso(momento(anterior))} y ${iso(ultimo)} (contador parado en ${procesados}): está en marcha, pero no analiza.`)
    );
  }

  // Que hay reglas: el ruleset de la última pasada completa.
  const { vigentes, ultimo: ultimoRuleset } = estadoVigente(context, 'ruleset_version_observed', ahora);
  const ruleset = vigentes[vigentes.length - 1];

  if (!ruleset) {
    partes.push(sinHechos(context, 'EV-01', ahora, ultimoRuleset, 'inventario del ruleset del manager'));
  } else {
    const reglas = numero(campo(ruleset, 'reglas')) || 0;

    partes.push(
      reglas > 0
        ? cumple(
            `Ruleset de Wazuh ${campo(ruleset, 'version_wazuh') || '(versión desconocida)'} con ${reglas} reglas cargadas en ${campo(ruleset, 'ficheros')} ficheros, ${campo(ruleset, 'reglas_mitre') || '0'} con técnica MITRE ATT&CK.`
          )
        : noCumple('El manager no carga ninguna regla de detección: la detección no está basada en reglas.')
    );
  }

  return combina(partes);
};

// R1 añade que estén cargados los conjuntos de reglas que declara P-03.
const conjuntosDeP03 = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'ruleset_rules_loaded', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-04', ahora, ultimo, 'inventario de reglas cargadas por conjunto');
  }

  const cargados = conjuntosCargados(vigentes);
  const resumen = cargados.map(c => `${c.conjunto} (${c.reglas ?? '?'} reglas)`).join(', ');
  const declarados = filas(context, 'P-03');

  if (!declarados) {
    return faltaParametro(context, 'P-03', `qué conjuntos de reglas tienen que estar activos (cargados hoy: ${resumen})`);
  }

  const faltan = declarados
    .map(f => f.conjunto)
    .filter(nombre => !cargados.some(c => iguales(c.conjunto, nombre) && (c.reglas ?? c.rangos.length) > 0));

  return faltan.length
    ? noCumple(`Conjuntos de reglas de P-03 que el manager no carga: ${faltan.join(', ')}. Cargados: ${resumen}.`)
    : cumple(`Cargados todos los conjuntos de reglas de P-03 (${resumen}).`);
};

// --- EV-02 · cada sistema de P-01 con agente conectado y análisis activo ------

// La degradación de EV-02 entera solo la declara el recolector cuando no puede
// leer global.db. Si lo que no puede leer es la base de UN agente
// (queue/db/NNN.db), emite igualmente su hecho con `lectura=error`: cuenta solo
// si ese agente está en P-01, y un NO_CUMPLE medido de otro sistema sigue
// mandando.
const ev02Hechos = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'detection_coverage_observed', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(context, 'EV-02', ahora, ultimo, 'estado de los agentes leído en el manager');
  }

  const sistemas = filas(context, 'P-01');

  if (!sistemas) {
    return faltaParametro(context, 'P-01', `qué sistemas tienen que estar bajo detección (el manager tiene hoy ${vigentes.length} agentes registrados)`);
  }

  const plazo = escalar(context, 'P-10');
  const fallos: string[] = [];
  const conectados: string[] = [];
  const bien: string[] = [];
  const partes: Medida[] = [];

  sistemas.forEach(fila => {
    const r = resuelve(fila.sistema, vigentes);

    if (r.tipo === 'ninguno') {
      fallos.push(`${fila.sistema}: no figura en la base de agentes del manager`);

      return;
    }

    if (r.tipo === 'ambiguo') {
      partes.push(ambiguo(fila.sistema, r.ids));

      return;
    }

    const e = r.hecho;
    const nombre = nombreDe(fila.sistema, e);
    const estado = campo(e, 'estado_conexion');

    if (estado !== 'active') {
      fallos.push(`${nombre}: agente ${estado || 'en estado desconocido'}, último keepalive ${vacio(campo(e, 'ultimo_keepalive')) ? 'nunca' : campo(e, 'ultimo_keepalive')}`);

      return;
    }

    conectados.push(nombre);

    if (campo(e, 'lectura') === 'error') {
      partes.push(
        sinMedir(
          `${nombre}: el recolector no ha podido leer su base en el manager (queue/db/${idDelHecho(e)}.db), así que no se sabe si sus pasadas de FIM y SCA siguen.`,
          'COLLECTION'
        )
      );

      return;
    }

    if (plazo === undefined) {
      return;
    }

    const problemas: string[] = [];
    const visto: string[] = [];

    ([['fim_ultimo_fin', 'FIM'], ['sca_ultimo_fin', 'SCA']] as [string, string][]).forEach(([f, modulo]) => {
      const t = instante(campo(e, f));

      if (t === undefined) {
        problemas.push(`ninguna pasada de ${modulo} completada`);
      } else if (momento(e) - t > plazo * HORA) {
        // Se juzga en el instante de la LECTURA, no al evaluar: el hecho puede
        // tener hasta 26 h, y medir contra el reloj convertiría una pasada
        // perdida del recolector en un «análisis inactivo» del agente.
        problemas.push(`la última pasada de ${modulo} terminó el ${iso(t)}, ${horas(momento(e) - t)} h antes de la lectura del ${iso(momento(e))}`);
      } else {
        visto.push(`${modulo} ${iso(t)}`);
      }
    });

    if (problemas.length) {
      fallos.push(`${nombre}: ${problemas.join(' y ')} (P-10 = ${plazo} h), el análisis no está activo`);
    } else {
      bien.push(`${nombre} (${visto.join(', ')})`);
    }
  });

  const fuera = fueraDeP01(sistemas, vigentes);

  if (fallos.length) {
    partes.push(noCumple(`Sistemas de P-01 sin cobertura de detección efectiva: ${lista(fallos)}.${fuera}`));
  }

  if (plazo === undefined) {
    partes.push(
      faltaParametro(
        context,
        'P-10',
        `si el análisis de FIM y SCA de cada sistema sigue activo (con el agente conectado: ${lista(conectados) || 'ninguno'})`
      )
    );
  } else if (!fallos.length && bien.length) {
    partes.push(cumple(`Los ${bien.length} sistemas de P-01 tienen el agente conectado y pasadas de FIM y SCA en las últimas ${plazo} h: ${lista(bien)}.${fuera}`));
  }

  return combina(partes);
};

const ev02 = (context: ENSPolicyContext, ahora: number): Medida =>
  conDegradacion(context, ahora, 'EV-02', 'detection_coverage_observed', ev02Hechos(context, ahora));

// --- EV-03 · cada sistema de P-01 conectado produce detecciones -------------

const ev03Hechos = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'detection_activity_observed', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(context, 'EV-03', ahora, ultimo, 'resumen de detecciones por agente');
  }

  const sistemas = filas(context, 'P-01');

  if (!sistemas) {
    return faltaParametro(context, 'P-01', 'qué sistemas tienen que producir detecciones');
  }

  const plazo = escalar(context, 'P-09');

  if (plazo === undefined) {
    return faltaParametro(context, 'P-09', 'cuántos días sin detecciones en un sistema activo son un fallo de la detección');
  }

  const cobertura = estadoVigente(context, 'detection_coverage_observed', ahora).vigentes;
  const fallos: string[] = [];
  const bien: string[] = [];
  const aparte: string[] = [];
  const partes: Medida[] = [];

  sistemas.forEach(fila => {
    const rc = resuelve(fila.sistema, cobertura);
    const ra = resuelve(fila.sistema, vigentes);

    if (rc.tipo === 'ambiguo' || ra.tipo === 'ambiguo') {
      partes.push(ambiguo(fila.sistema, rc.tipo === 'ambiguo' ? rc.ids : (ra as { ids: string[] }).ids));

      return;
    }

    // Solo se juzga la actividad de un sistema conectado: uno desconectado o
    // sin agente lo juzga EV-02, y aquí no se cuenta dos veces.
    if (rc.tipo === 'unico' && campo(rc.hecho, 'estado_conexion') !== 'active') {
      aparte.push(`${nombreDe(fila.sistema, rc.hecho)}, ${campo(rc.hecho, 'estado_conexion') || 'estado desconocido'}`);

      return;
    }

    if (rc.tipo === 'ninguno' && ra.tipo === 'ninguno') {
      aparte.push(`${fila.sistema}, sin agente`);

      return;
    }

    if (ra.tipo === 'ninguno') {
      partes.push(sinMedir(`${fila.sistema}: el recolector del manager no informa de su actividad de detección.`, 'COLLECTION'));

      return;
    }

    const e = ra.hecho;
    const nombre = nombreDe(fila.sistema, e);
    const ultima = instante(campo(e, 'ultima_alerta'));
    const desde = instante(campo(e, 'observado_desde'));
    const tecnicas = vacio(campo(e, 'tecnicas_mitre')) ? '' : `, técnicas ${campo(e, 'tecnicas_mitre')}`;
    const detalle = `${campo(e, 'alertas_24h') || '0'} alertas en 24 h, nivel máximo ${campo(e, 'nivel_max_24h') || '-'}, ${campo(e, 'reglas_distintas_24h') || '0'} reglas distintas${tecnicas}`;

    if (ultima !== undefined) {
      if (ahora - ultima > plazo * DIA) {
        fallos.push(`${nombre}: ${dias(ahora - ultima)} días sin ninguna detección (la última, ${iso(ultima)})`);
      } else {
        bien.push(`${nombre}: última detección ${iso(ultima)}; ${detalle}`);
      }
    } else if (desde !== undefined && ahora - desde > plazo * DIA) {
      fallos.push(`${nombre}: ninguna detección desde que el manager lo observa (${iso(desde)})`);
    } else {
      partes.push(
        sinMedir(
          `${nombre}: sin detecciones observadas, y se observa desde ${desde !== undefined ? iso(desde) : 'un instante desconocido'}, menos que P-09 (${plazo} días): todavía no se puede afirmar ni negar que la detección funcione en él.`
        )
      );
    }
  });

  const noJuzgados = aparte.length ? ` No se juzgan aquí, porque no están conectados (los juzga EV-02): ${lista(aparte)}.` : '';

  if (fallos.length) {
    partes.push(
      noCumple(
        `Sistemas de P-01 conectados sin detecciones en más de P-09 (${plazo} días): ${lista(fallos)}. Un sistema activo que no produce detecciones indica reglas que no se aplican o una ingesta que no llega.${noJuzgados}`
      )
    );
  } else if (bien.length) {
    partes.push(cumple(`Los sistemas de P-01 conectados producen detecciones dentro de P-09 (${plazo} días): ${lista(bien)}.${noJuzgados}`));
  } else if (!partes.length) {
    partes.push(sinMedir(`Ningún sistema de P-01 está conectado: no hay actividad que juzgar.${noJuzgados}`));
  }

  return combina(partes);
};

const ev03 = (context: ENSPolicyContext, ahora: number): Medida =>
  conDegradacion(context, ahora, 'EV-03', 'detection_activity_observed', ev03Hechos(context, ahora));

// --- EV-04 · cada situación de P-04 con al menos una regla cargada ----------

const SIN_REGLA = /^(-|ninguna|ninguno|sin regla|punto ciego)$/i;

// La celda de reglas de P-04 solo admite ids y rangos: «5710, 5712, 80700-80799».
// Cualquier otro texto se rechaza en vez de interpretarse: «pendiente 2026-12»,
// «CVE-2021-44228» o «AR-2026-04» llevan números con guion, y leídos como rangos
// convertían un punto ciego declarado en una situación cubierta.
const REGLAS_DE_P04 = /^\d+(\s*-\s*\d+)?(\s*[,;\s]\s*\d+(\s*-\s*\d+)?)*$/;

// Lo más que puede abarcar un rango de P-04: b - a <= 9999. Cabe cualquier
// banda de un ruleset real, y no un par como «2021-44228».
const ANCHO_MAXIMO_P04 = 9999;

const ev04Hechos = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'ruleset_rules_loaded', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(context, 'EV-04', ahora, ultimo, 'inventario de reglas cargadas por conjunto');
  }

  const situaciones = filas(context, 'P-04');

  if (!situaciones) {
    return faltaParametro(context, 'P-04', 'qué situaciones del análisis de riesgos tienen que tener una regla de detección');
  }

  const cargados = conjuntosCargados(vigentes);
  const incompletos = cargados.filter(incompleto);
  const enQue = (r: Rango): string | undefined =>
    cargados.find(c => c.rangos.some(cargado => seCortan(cargado, r)))?.conjunto;

  const ciegas: string[] = [];
  const sinCargar: string[] = [];
  const bien: string[] = [];
  const partes: Medida[] = [];

  situaciones.forEach(fila => {
    const texto = (fila.regla_que_la_detecta || '').trim();

    if (!texto || SIN_REGLA.test(texto)) {
      ciegas.push(`«${fila.situacion}»${fila.activo_afectado ? ` (${fila.activo_afectado})` : ''}`);

      return;
    }

    if (!REGLAS_DE_P04.test(texto)) {
      partes.push(
        sinMedir(
          `P-04, situación «${fila.situacion}»: la columna de reglas dice «${texto}», que no es una lista de ids o rangos de reglas (5710, 5712, 80700-80799). Si la situación no tiene regla, escribe «ninguna»: es un punto ciego declarado.`,
          'CONFIGURATION'
        )
      );

      return;
    }

    // Un rango al revés no es un rango de reglas: «2026-12» es una fecha, y
    // leído como 12-2026 cubriría cualquier regla de ese tramo.
    const alReves = (texto.match(/\d+\s*-\s*\d+/g) || []).filter(r => {
      const [a, b] = r.split('-').map(n => Number(n.trim()));

      return a > b;
    });

    if (alReves.length) {
      partes.push(
        sinMedir(
          `P-04, situación «${fila.situacion}»: «${alReves.join(', ')}» no es un rango de reglas, porque el primer id es mayor que el último (¿una fecha o una referencia?). Escribe los rangos de menor a mayor (80700-80799), o «ninguna» si la situación no tiene regla.`,
          'CONFIGURATION'
        )
      );

      return;
    }

    // Un rango de más de ANCHO_MAXIMO_P04 ids no es una banda de reglas: es un
    // par con aspecto de CVE o de referencia («2021-44228») que, leído como
    // rango, cubriría cualquier regla del tramo.
    const anchos = (texto.match(/\d+\s*-\s*\d+/g) || []).filter(r => {
      const [a, b] = r.split('-').map(n => Number(n.trim()));

      return b - a > ANCHO_MAXIMO_P04;
    });

    if (anchos.length) {
      partes.push(
        sinMedir(
          `P-04, situación «${fila.situacion}»: «${anchos.join(', ')}» abarca más de ${ANCHO_MAXIMO_P04 + 1} ids, más que cualquier banda de reglas real (¿una referencia o un CVE?). Si de verdad son reglas, parte el rango en tramos más pequeños.`,
          'CONFIGURATION'
        )
      );

      return;
    }

    const declaradas = rangos(texto);

    const cubiertas = declaradas.filter(r => enQue(r) !== undefined);
    const fuera = declaradas.filter(r => enQue(r) === undefined);

    if (cubiertas.length) {
      bien.push(
        `«${fila.situacion}» → ${cubiertas.map(r => `${describeRango(r)} (${enQue(r)})`).join(', ')}${fuera.length ? `; declaradas y no cargadas: ${fuera.map(describeRango).join(', ')}` : ''}`
      );
    } else if (incompletos.length) {
      partes.push(
        sinMedir(
          `«${fila.situacion}»: ninguna de sus reglas (${declaradas.map(describeRango).join(', ')}) aparece en lo recibido, pero faltan partes del inventario de ${incompletos.map(c => `${c.conjunto} (${c.presentes.size} de ${c.partes})`).join(', ')}: no se puede afirmar que no estén cargadas.`,
          'COLLECTION'
        )
      );
    } else {
      sinCargar.push(`«${fila.situacion}» (${declaradas.map(describeRango).join(', ')})`);
    }
  });

  if (ciegas.length) {
    partes.push(noCumple(`Situaciones de compromiso de P-04 sin ninguna regla de detección asociada, puntos ciegos declarados: ${lista(ciegas)}.`));
  }

  if (sinCargar.length) {
    partes.push(noCumple(`Situaciones de P-04 cuyas reglas no están cargadas en el manager (o son de nivel 0 y no alertan): ${lista(sinCargar)}.`));
  }

  if (!ciegas.length && !sinCargar.length && bien.length) {
    partes.push(cumple(`Las ${situaciones.length} situaciones de compromiso de P-04 tienen regla de detección cargada: ${lista(bien)}.`));
  }

  return combina(partes);
};

const ev04 = (context: ENSPolicyContext, ahora: number): Medida =>
  conDegradacion(context, ahora, 'EV-04', 'ruleset_rules_loaded', ev04Hechos(context, ahora));

// --- EV-05 · la detección en red, si P-02 la exige ----------------------------

const esSi = (texto: string): boolean => ['si', 'yes', 'true'].includes(sinTildes(texto.trim()));

const ev05 = (context: ENSPolicyContext, ahora: number): Medida => {
  const declaradas = filas(context, 'P-02');

  if (!declaradas) {
    return faltaParametro(context, 'P-02', 'si el análisis de riesgos exige detección en red');
  }

  const { vigentes, ultimo } = estadoVigente(context, 'network_detection_observed', ahora);
  const observados = vigentes.filter(e => !vacio(campo(e, 'producto')) && campo(e, 'producto') !== 'ninguno');
  const vistos = observados.map(e => `${campo(e, 'producto')} por ${campo(e, 'fuente') || '-'}`).join(', ');
  const exigidas = declaradas.filter(f => esSi(f.necesaria));

  if (!exigidas.length) {
    const justificaciones = declaradas.map(f => f.justificacion).filter(Boolean);

    return justificaciones.length
      ? noAplica(
          `P-02 declara que el análisis de riesgos no exige detección en red: ${justificaciones.join('; ')}.${vistos ? ` El manager ingiere, de todos modos: ${vistos}.` : ''}`
        )
      : sinMedir(
          'P-02 declara que no hace falta detección en red sin la referencia al análisis de riesgos que lo justifique: es lo primero que un auditor preguntará.',
          'CONFIGURATION'
        );
  }

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(context, 'EV-05', ahora, ultimo, 'inventario de detección en red del manager');
  }

  // Solo cuando P-02 la exige: con «no», lo que no se pudo leer no cambia nada.
  const deg = degradacion(context, 'EV-05', ahora, ultimo + 1);
  const conDeg = (medida: Medida): Medida => (deg ? combina([medida, deg]) : medida);
  const plazo = escalar(context, 'P-09');

  if (plazo === undefined) {
    return conDeg(faltaParametro(context, 'P-09', 'cuánto tiempo sin alertas de red es una ingesta parada'));
  }

  const fallos: string[] = [];
  const bien: string[] = [];

  exigidas.forEach(f => {
    const producto = (f.producto || '').trim();
    const suyos = observados.filter(e =>
      !producto || iguales(campo(e, 'producto'), producto) || sinTildes(producto).split(/[^a-z0-9]+/).includes(sinTildes(campo(e, 'producto')))
    );
    const nombre = producto || 'detección en red';

    if (!suyos.length) {
      fallos.push(`${nombre}: P-02 la exige y el manager no ingiere eventos de ese sistema${vistos ? ` (ingiere: ${vistos})` : ''}`);

      return;
    }

    const ultimas = suyos.map(e => instante(campo(e, 'ultima_alerta'))).filter((t): t is number => t !== undefined);
    const ultima = ultimas.length ? Math.max(...ultimas) : undefined;
    const fuentes = suyos.map(e => campo(e, 'fuente')).join(', ');

    if (ultima === undefined) {
      fallos.push(`${nombre}: llega por ${fuentes} y no se ha recibido ninguna alerta suya`);
    } else if (ahora - ultima > plazo * DIA) {
      fallos.push(`${nombre}: su última alerta es del ${iso(ultima)}, hace ${dias(ahora - ultima)} días (P-09 = ${plazo})`);
    } else {
      const n24 = suyos.reduce((t, e) => t + (numero(campo(e, 'alertas_24h')) || 0), 0);

      bien.push(`${nombre} por ${fuentes}: última alerta ${iso(ultima)}, ${n24} en 24 h`);
    }
  });

  return conDeg(
    fallos.length
      ? noCumple(`Detección en red que P-02 exige y no está operativa: ${lista(fallos)}.`)
      : cumple(`El manager ingiere la detección en red que exige P-02: ${lista(bien)}.`)
  );
};

// --- EV-07 · las acciones predeterminadas (R3): se informan -----------------

const SIN_REVERSION = ['', '-', 'no', 'ninguna', 'sin reversion', 'sin reversión'];

// La medida DE HECHO de R3, la que se informa: con el mismo criterio que EV-11
// y EV-12 de op.exp.8.
const r3DeHecho = (context: ENSPolicyContext, ahora: number): Medida => {
  const { vigentes, ultimo } = estadoVigente(context, 'active_response_configured', ahora);

  if (!vigentes.length) {
    return sinHechos(context, 'EV-07', ahora, ultimo, 'inventario de respuestas automáticas del manager');
  }

  const habilitadas = vigentes.filter(
    e => !vacio(campo(e, 'comando')) && campo(e, 'deshabilitada') !== 'si' && campo(e, 'comando_definido') === 'si'
  );
  const ejecutadas = hechos(context, 'active_response_executed').filter(e => !vacio(campo(e, 'regla_origen')));
  const describeEjecucion = (e: ENSNormalizedEvent) =>
    `${campo(e, 'programa')} ${campo(e, 'accion')} en ${campo(e, 'agente')} por la regla ${campo(e, 'regla_origen')} (${campo(e, 'veces')} veces, la última el ${campo(e, 'ultima')})`;
  const ejecuciones = ejecutadas.length
    ? ` Ejecutadas a raíz de una alerta en la ventana: ${lista(ejecutadas.map(describeEjecucion))}.`
    : ' Ninguna ejecutada a raíz de una alerta en la ventana.';

  if (!habilitadas.length) {
    return noCumple(`El manager no tiene ninguna respuesta automática configurada y habilitada.${ejecuciones}`);
  }

  const resumen = habilitadas
    .map(e => `${campo(e, 'comando')} sobre ${!vacio(campo(e, 'reglas_id')) ? `reglas ${campo(e, 'reglas_id')}` : `grupos ${campo(e, 'grupos')}`}${!vacio(campo(e, 'timeout')) ? `, reversión ${campo(e, 'timeout')} s` : ''}`)
    .join('; ');
  const previstas = filas(context, 'P-07');

  if (!previstas) {
    return cumple(`Respuestas automáticas configuradas: ${resumen} (P-07 sin declarar, no se contrastan).${ejecuciones}`);
  }

  const fallos: string[] = [];

  previstas.forEach(f => {
    const suyas = habilitadas.filter(e => iguales(campo(e, 'comando'), f.accion));

    if (!suyas.length) {
      fallos.push(`${f.accion}: prevista en P-07 y no configurada o deshabilitada`);
    } else if (!SIN_REVERSION.includes((f.reversion || '').trim().toLowerCase()) && suyas.every(e => vacio(campo(e, 'timeout')))) {
      fallos.push(`${f.accion}: P-07 declara reversión (${f.reversion}) y la respuesta configurada no tiene timeout`);
    }
  });

  return fallos.length
    ? noCumple(`Acciones de P-07 que no están como se declaran: ${lista(fallos)}. Configuradas: ${resumen}.${ejecuciones}`)
    : cumple(`Configuradas y habilitadas las acciones de P-07 (${resumen}).${ejecuciones}`);
};

const NO_EXIGIBLE_R3 =
  'R3 no se exige en ninguna categoría (Anexo II): se informa, sin veredicto.';

// --- EV-08 · vigencia del ruleset y silenciamientos -------------------------

const ev08 = (context: ENSPolicyContext, ahora: number): Medida => {
  const partes: Medida[] = [];

  // Eje 1: antigüedad del ruleset contra P-08.
  const { vigentes: versiones, ultimo: ultimaVersion } = estadoVigente(context, 'ruleset_version_observed', ahora);
  const ruleset = versiones[versiones.length - 1];

  if (!ruleset) {
    partes.push(degradacion(context, 'EV-08', ahora) || sinHechos(context, 'EV-01', ahora, ultimaVersion, 'inventario del ruleset del manager'));
  } else {
    const maximo = escalar(context, 'P-08');
    const fecha = instante(campo(ruleset, 'fecha_ruleset'));
    const que = `ruleset de Wazuh ${campo(ruleset, 'version_wazuh') || '(versión desconocida)'}`;

    if (fecha === undefined) {
      partes.push(sinMedir(`El recolector no ha podido fechar el ${que} (fecha_ruleset=${campo(ruleset, 'fecha_ruleset') || 'vacía'}).`));
    } else if (maximo === undefined) {
      partes.push(faltaParametro(context, 'P-08', `la vigencia del ${que}, del ${iso(fecha)} (${dias(ahora - fecha)} días)`));
    } else if (ahora - fecha > maximo * DIA) {
      partes.push(
        noCumple(
          `El ${que} es del ${iso(fecha)} (${campo(ruleset, 'fichero_mas_reciente') || 'fichero más reciente'}): ${dias(ahora - fecha)} días, más que los ${maximo} de P-08. Las reglas de detección envejecen como las firmas de un antivirus.`
        )
      );
    } else {
      partes.push(cumple(`El ${que} es del ${iso(fecha)}: ${dias(ahora - fecha)} días, dentro de los ${maximo} de P-08.`));
    }
  }

  // Eje 2: cada silenciamiento, en P-06 con motivo y aprobación.
  const { vigentes: barrido, ultimo: ultimoBarrido } = estadoVigente(context, 'rule_silenced', ahora);

  if (!barrido.length || ultimoBarrido === undefined) {
    partes.push(sinHechos(context, 'EV-08', ahora, ultimoBarrido, 'barrido de exclusiones y reglas silenciadas'));

    return combina(partes);
  }

  // Lo que no se pudo barrer después de la última pasada buena se suma a lo
  // medido en ella, sin taparlo.
  const deg = degradacion(context, 'EV-08', ahora, ultimoBarrido + 1);

  if (deg) {
    partes.push(deg);
  }

  const silenciados = barrido.filter(e => campo(e, 'tipo') !== 'ninguno' && !vacio(campo(e, 'objeto')));
  const describe = (e: ENSNormalizedEvent) =>
    `${campo(e, 'objeto')} (${campo(e, 'tipo') === 'fichero_excluido' ? 'fichero excluido' : 'regla a nivel 0'} en ${campo(e, 'fichero') || '-'})`;

  if (!silenciados.length) {
    partes.push(cumple('El manager no tiene ningún fichero de reglas excluido ni ninguna regla reescrita a nivel 0.'));

    return combina(partes);
  }

  const autorizadas = filas(context, 'P-06');

  if (!autorizadas) {
    partes.push(faltaParametro(context, 'P-06', `si los ${silenciados.length} silenciamientos del manager están justificados (${lista(silenciados.map(describe))})`));

    return combina(partes);
  }

  const fuera: string[] = [];
  const sinJustificar: string[] = [];
  const bien: string[] = [];

  silenciados.forEach(e => {
    const objeto = campo(e, 'objeto');
    const fila = autorizadas.find(f => iguales(f.regla, objeto));

    if (!fila) {
      fuera.push(describe(e));
    } else if (!fila.motivo || !fila.aprobo) {
      sinJustificar.push(`${describe(e)}: ${!fila.motivo ? 'sin motivo' : 'sin quién lo aprobó'}`);
    } else {
      bien.push(`${objeto} (${fila.motivo}; aprobó ${fila.aprobo})`);
    }
  });

  if (fuera.length) {
    partes.push(noCumple(`Silenciamientos que P-06 no declara: ${lista(fuera)}. Una exclusión sin constancia degrada la detección sin que nadie lo advierta.`));
  }

  if (sinJustificar.length) {
    partes.push(noCumple(`Silenciamientos de P-06 sin justificación o sin aprobación: ${lista(sinJustificar)}.`));
  }

  if (!fuera.length && !sinJustificar.length) {
    partes.push(cumple(`Los ${silenciados.length} silenciamientos del manager están en P-06 con motivo y aprobación: ${lista(bien)}.`));
  }

  return combina(partes);
};

// --- R2 · los procedimientos de respuesta, declarados -----------------------

const r2 = (context: ENSPolicyContext): { medida: Medida; acreditado: boolean } => {
  const procedimientos = filas(context, 'P-05');

  if (!procedimientos) {
    return {
      medida: faltaParametro(context, 'P-05', 'qué procedimientos de respuesta a las alertas existen (R2 también se puede acreditar con P-ATT)'),
      acreditado: false,
    };
  }

  const incompletas = procedimientos.filter(f => !f.procedimiento || !f.responsable);

  if (incompletas.length) {
    return {
      medida: sinMedir(
        `P-05 tiene ${incompletas.length} tipo(s) de alerta sin procedimiento o sin responsable (${lista(incompletas.map(f => f.tipo_de_alerta))}): un procedimiento sin identificar o sin quien lo aplique no acredita una respuesta pautada.`,
        'CONFIGURATION'
      ),
      acreditado: false,
    };
  }

  return {
    medida: cumple(
      `P-05 declara ${procedimientos.length} procedimiento(s) de respuesta a las alertas, cada uno con su responsable: ${lista(procedimientos.map(f => `${f.tipo_de_alerta} → ${f.procedimiento} (${f.responsable})`))}. La aplicación de cada procedimiento a sus alertas la mide op.exp.7.`
    ),
    acreditado: true,
  };
};

const DATO_DEL_INFORME =
  'Dato del informe, sin veredicto: la existencia de los procedimientos de respuesta (R2) se acredita documentalmente con P-05 o P-ATT, y su aplicación a cada alerta la mide op.exp.7 cruzando las alertas con el registro de incidentes (sus EV-02 y EV-06).';

// --- decisiones ------------------------------------------------------------

// Con qué medidas se decide cada requisito técnico. R1 añade una medida que NO
// es una evidencia: los conjuntos de reglas de P-03 cargados. Va aparte, con el
// nombre del parámetro, para que un P-03 sin configurar deje R1 sin demostrar
// sin pintar EV-01 en gris mientras la base, con la misma EV-01, cumple. No
// lleva decisión por evidencia, y en la del requisito solo figura si es la que
// decide (el puente no encuentra ninguna evidencia «P-03» y no pinta nada).
const MEDIDA_P03 = 'P-03';

const TECNICOS: { requisito: string; medidas: string[]; parametros: string[]; tipo: ENSTipoDeRegla }[] = [
  { requisito: 'op.mon.1.1', medidas: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05'], parametros: ['P-01', 'P-02', 'P-04', 'P-09', 'P-10'], tipo: 'COVERAGE_REQUIRED' },
  { requisito: 'op.mon.1.r1.1', medidas: ['EV-01', MEDIDA_P03, 'EV-08'], parametros: ['P-03', 'P-06', 'P-08'], tipo: 'MAX_AGE' },
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
  const medir = (clave: string, calcula: () => Medida): Medida => {
    if (!cache[clave]) {
      cache[clave] = calcula();
    }

    return cache[clave];
  };

  const medidaDe = (medida: string): Medida => {
    switch (medida) {
      case 'EV-01':
        return medir('EV-01', () => ev01Base(context, ahora));
      case MEDIDA_P03:
        return medir(MEDIDA_P03, () => conjuntosDeP03(context, ahora));
      case 'EV-02':
        return medir('EV-02', () => ev02(context, ahora));
      case 'EV-03':
        return medir('EV-03', () => ev03(context, ahora));
      case 'EV-04':
        return medir('EV-04', () => ev04(context, ahora));
      case 'EV-05':
        return medir('EV-05', () => ev05(context, ahora));
      default:
        return medir('EV-08', () => ev08(context, ahora));
    }
  };

  const requisitoDecisions: ENSPolicyDecision[] = [];
  const evidenciaDecisions: ENSPolicyDecision[] = [];

  TECNICOS.filter(r => aplica(r.requisito)).forEach(definicion => {
    const propias = definicion.medidas.map(id => ({ id, medida: medidaDe(id) }));
    const estado = peor(propias.map(p => p.medida));
    const responsables = propias.filter(p => p.medida.estado === estado);

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`.
    requisitoDecisions.push(
      conPartes(decide(
        definicion.requisito,
        estado,
        responsables.map(p => p.id),
        definicion.parametros,
        definicion.tipo,
        definicion.requisito,
        motivoCompuesto(propias),
        definicion.medidas.map(id => `${id} CUMPLE`).join(' y '),
        causaComun(responsables.map(p => p.medida))
      ), partesDe(propias))
    );

    // Y una por evidencia, con SU estado. La de P-03 no es una evidencia.
    propias
      .filter(p => p.id !== MEDIDA_P03)
      .forEach(p =>
        evidenciaDecisions.push(
          decide(definicion.requisito, p.medida.estado, [p.id], definicion.parametros, definicion.tipo, `${definicion.requisito}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`, p.medida.causa)
        )
      );
  });

  // R2: documental. Una declaración completa en P-05 lo acredita; sin ella, la
  // decisión queda sin medir y puede acreditarlo P-ATT. Sale solo de la tabla
  // de la pantalla, así que lleva `documental`: un recolector parado no la
  // convierte en un hueco de RECOGIDA (ver `ENSPolicyDecision`).
  let medidaR2: Medida | undefined;

  if (aplica('op.mon.1.r2.1')) {
    const { medida, acreditado } = r2(context);

    medidaR2 = medida;
    requisitoDecisions.push({
      ...decide(
        'op.mon.1.r2.1',
        medida.estado,
        [],
        ['P-05'],
        'COVERAGE_REQUIRED',
        'op.mon.1.r2.1',
        medida.motivo,
        'P-05 con procedimiento y responsable por tipo de alerta, o P-ATT',
        medida.causa,
        acreditado
      ),
      documental: true,
    });
  }

  // EV-06: dato del informe. EV-07: R3 se informa con lo que hay.
  const r3 = r3DeHecho(context, ahora);

  evidenciaDecisions.push(
    decide('op.mon.1.r2.1', 'NO_APLICA', ['EV-06'], ['P-05'], 'COVERAGE_REQUIRED', 'op.mon.1.r2.1/EV-06', DATO_DEL_INFORME, 'dato del informe'),
    decide(
      'op.mon.1.r3.1',
      'NO_APLICA',
      ['EV-07'],
      ['P-07'],
      'COVERAGE_REQUIRED',
      'op.mon.1.r3.1/EV-07',
      `${NO_EXIGIBLE_R3} De hecho: ${r3.motivo}`,
      'se informa'
    )
  );

  const variables: ENSRuntimeVariable[] = [
    ...Object.entries(cache).map(([clave, medida]) => ({
      name: `medida_${clave.replace('-', '')}`,
      value: medida.estado,
      parameterIds: clave === MEDIDA_P03 ? [MEDIDA_P03] : [],
      evidenceIds: clave === MEDIDA_P03 ? [] : [clave],
      eventIds: [],
      description: medida.motivo,
    })),
    ...(medidaR2
      ? [
          {
            name: 'acreditacion_R2',
            value: medidaR2.estado,
            parameterIds: ['P-05'],
            evidenceIds: [],
            eventIds: [],
            description: medidaR2.motivo,
          },
        ]
      : []),
    {
      name: 'cobertura_de_hecho_R3',
      value: r3.estado,
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07'],
      eventIds: [],
      description: r3.motivo,
    },
  ];

  return { decisions: [...requisitoDecisions, ...evidenciaDecisions], runtimeVariables: variables };
};

export const opMon1PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // Por categoría del sistema: base en las tres, R1 desde MEDIA, R2 solo en
  // ALTA, R3 en ninguna.
  requirements: [
    {
      requirementId: 'op.mon.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-04', 'P-09', 'P-10'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.1.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-06', 'P-08'],
      evidenceIds: ['EV-01', 'EV-08'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.1.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.1.r3.1',
      levels: [],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
