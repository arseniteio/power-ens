// op.nub.1 · Protección de servicios en la nube
//
// Por qué este control tiene policy propia. Es mayoritariamente CONTRACTUAL
// (spec 2026-10-09 §4): la conformidad y la certificación del proveedor, su
// pentest, la jurisdicción de los datos y el cifrado son declaraciones de la
// pantalla con su vigencia, y la parte técnica es la integración de los
// servicios en la nube con Wazuh. Nada de eso cabe en una primitiva:
//
//   1. LO DOCUMENTAL SE JUZGA CON SU VIGENCIA (decisión 1 del responsable,
//      09/10). Cada servicio utilizado de P-02 se cruza por su nombre con
//      P-03, P-08, P-09 y P-10 (EV-09) y, desde MEDIA, con P-04 (EV-08), y
//      cada fecha se compara con `context.now`. Lo que cumple se marca
//      `attested`: en pantalla, «acreditado documentalmente», nunca medido.
//   2. LO TÉCNICO SE MIDE EN EL MANAGER y los hechos hablan de MÓDULOS cloud,
//      no de esta máquina: cada fila de P-06 se cruza con su módulo (EV-01),
//      con sus operaciones administrativas contra P-11 (EV-04) y con sus
//      accesos interactivos (EV-07). Un servicio sin integración es un
//      hallazgo del informe, no un veredicto (spec §4.6-4).
//   3. LA MEDIDA MANDA SOBRE EL DOCUMENTO. op.nub.1.2 cumple acreditado si el
//      expediente está completo y vigente y ninguna medida técnica está en
//      contra; una medida técnica en NO_CUMPLE lo deja en NO_CUMPLE, y lo
//      mismo hace `requirement-evaluator` por su cuenta.
//
// Qué decide cada requisito (spec §4.3):
//
//   op.nub.1.1     prestador: documental sin evidencia técnica. NO_APLICA si
//                  P-01 no es prestador ni ambos; si lo es, la conformidad de
//                  cada servicio prestado de P-02 en P-03, en vigor
//                  (`attested`).
//   op.nub.1.2     usuario: EV-09 (expediente) con EV-01, EV-04 y EV-07 de
//                  los servicios que P-06 integra.
//   op.nub.1.r1.1  EV-08: certificación de P-04 en vigor por servicio.
//   op.nub.1.r1.2  P-05 con una sola fila «ninguno» → NO_APLICA; vacío, o
//                  «ninguno» mezclado con servicios → sin medir
//                  (CONFIGURATION). Con servicios, cada uno con su
//                  verificación de op.pl.5 declarada, su referencia y su
//                  vigencia (`attested`); «cumple = no» o vencida, incumple.
//
// Sin P-ATT: decisión 1 del responsable, lo documental se juzga con su
// vigencia. op.nub.1 no declara el parámetro P-ATT, así que ninguna
// atestación sin caducidad puede acreditar 1.1 ni R1.2.
//   op.nub.1.r2.1  EV-02: hallazgos de postura del propio proveedor por
//                  servicio de P-07. No hay «SCA cloud» en Wazuh 4.14: sin esos
//                  hallazgos, no es automatizable.
//
// P-01 = ninguno deja TODO el control NO_APLICA, declarado y auditable.
//
// EV-03 (shadow IT), EV-05 (cifrado) y EV-06 (región) quedan en el catálogo
// sin requisito que las juzgue: salen NO_APLICA con el motivo «dato del
// informe» para que no se pinten en gris.
//
// Las decisiones de EV-08 y EV-09 NO llevan la marca `attested`, y es a
// propósito: el puente (`policy-evidence-bridge.ts`) no rellena una evidencia
// con una decisión acreditada, para que un documento no se haga pasar por la
// medida de una evidencia TÉCNICA y se filtre a otro requisito. EV-08 y EV-09
// no son técnicas: SON el expediente documental, cada una de un solo
// requisito, y su motivo dice «Acreditado documentalmente». Marcadas, se
// quedarían en «sin recogida», que manda al operador a buscar un recolector
// que no existe. La marca va en la decisión del REQUISITO.
//
// Invariantes, las de `evidence/judgment.ts` y del kit:
//   - el recolector emite instantes y recuentos, no edades: la antigüedad de
//     un registro se mide en el instante de la observación (`momento`), y la
//     de un documento contra `context.now`;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo y causa; nunca un
//     CUMPLE por ausencia;
//   - lo que el recolector declara que no pudo medir sale con SU motivo y SU
//     causa, combinado con lo medido;
//   - la policy nunca inventa política: ningún plazo, umbral o lista tiene
//     valor por defecto.
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
  iso,
  sinTildes,
  vacio,
  iguales,
  parametro,
  etiqueta,
  filas,
  escalar,
  faltaParametro,
  lectorDeHechos,
  decisorDe,
} from './policy-kit';
import type { ENSTipoDeRegla, Medida } from './policy-kit';

const CONTROL = 'op.nub.1';
const POLICY = 'policy.op.nub.1';

// Los hechos de op.nub.1, con la frescura de los hechos de estado (26 h): el
// recolector del manager pasa cada 6 h y reemite el estado entero.
const { validos, estadoVigente, degradacion, sinHechos, conDegradacion } = lectorDeHechos(CONTROL, {
  recolector: 'el recolector de op.nub.1 del manager',
});

// La INGESTA (EV-01) es un estado de vivacidad: dice si hoy entran registros.
// Con la frescura de 26 h, la foto de una pasada de hace un día seguiría
// acreditando una integración viva, y EV-04 («sin operaciones → cumple»)
// se apoya en ella. 13 h toleran dos pasadas de 6 h perdidas.
const FRESCURA_INGESTA_HORAS = 13;

const ingestaLector = lectorDeHechos(CONTROL, {
  recolector: 'el recolector de op.nub.1 del manager',
  frescuraHoras: FRESCURA_INGESTA_HORAS,
});

const decide = decisorDe(POLICY);

// Un hecho del futuro no acredita nada; tampoco un documento fechado en el
// futuro. Misma tolerancia de reloj que el kit.
const TOLERANCIA_FUTURO = 5 * 60 * 1000;

// Los módulos cloud de Wazuh 4.14 que P-06 puede declarar.
const MODULOS = ['aws-s3', 'azure-logs', 'gcp-pubsub', 'gcp-bucket', 'office365', 'ms-graph', 'github'];

const ACREDITADO = 'Acreditado documentalmente';

// Lo que se decide desde las tablas de la pantalla, no desde los hechos: sus
// decisiones llevan `documental` (op.nub.1.2, solo cuando lo decide el
// expediente; se marca donde se decide).
const REQUISITOS_DOCUMENTALES = ['op.nub.1.1', 'op.nub.1.r1.1', 'op.nub.1.r1.2'];
const EVIDENCIAS_DOCUMENTALES = ['EV-08', 'EV-09'];

// --- P-01: la posición del sistema ------------------------------------------

type Posicion = 'prestador' | 'usuario' | 'ambos' | 'ninguno';

const POSICIONES: Posicion[] = ['prestador', 'usuario', 'ambos', 'ninguno'];

const posicionDe = (
  context: ENSPolicyContext
): { posicion?: Posicion; medida?: Medida } => {
  const valor = parametro(context, 'P-01')?.value;
  const texto = valor === undefined || valor === null || Array.isArray(valor) ? '' : String(valor).trim();

  if (!texto) {
    return {
      medida: faltaParametro(context, 'P-01', 'qué requisitos son exigibles: si el sistema presta servicios en la nube, si los utiliza de terceros, ambas cosas o ninguna'),
    };
  }

  const posicion = POSICIONES.find(p => p === sinTildes(texto));

  return posicion
    ? { posicion }
    : {
        medida: sinMedir(
          `${etiqueta(context, 'P-01')} dice «${texto}», que no es ninguna de sus opciones (${POSICIONES.join(', ')}): no se puede saber qué requisitos son exigibles.`,
          'CONFIGURATION'
        ),
      };
};

const usa = (p?: Posicion): boolean => p === 'usuario' || p === 'ambos';
const presta = (p?: Posicion): boolean => p === 'prestador' || p === 'ambos';

const NINGUNO = 'P-01 declara que el sistema no presta ni utiliza servicios en la nube («ninguno»): op.nub.1 no aplica.';

// --- P-02: el inventario, separado en utilizados y prestados ----------------

interface Inventario {
  utilizados: Record<string, string>[];
  prestados: Record<string, string>[];
  // Filas que no se pueden clasificar: se dicen, nombrando la fila.
  errores: Medida[];
}

const inventario = (context: ENSPolicyContext, posicion: Posicion): Inventario | undefined => {
  const todas = filas(context, 'P-02');

  if (!todas) {
    return undefined;
  }

  const salida: Inventario = { utilizados: [], prestados: [], errores: [] };

  todas.forEach(fila => {
    const uso = sinTildes(fila.uso || '');
    const nombre = fila.servicio || '(sin nombre)';

    if (!uso) {
      if (posicion === 'usuario') {
        salida.utilizados.push(fila);
      } else if (posicion === 'prestador') {
        salida.prestados.push(fila);
      } else {
        salida.errores.push(
          sinMedir(`P-02, servicio «${nombre}»: con P-01 = ambos hay que decir en la columna «uso» si se utiliza de un tercero o se presta.`, 'CONFIGURATION')
        );
      }

      return;
    }

    if (uso !== 'utilizado' && uso !== 'prestado') {
      salida.errores.push(
        sinMedir(`P-02, servicio «${nombre}»: la columna «uso» dice «${fila.uso}», que no es «utilizado» ni «prestado».`, 'CONFIGURATION')
      );

      return;
    }

    if ((uso === 'prestado' && posicion === 'usuario') || (uso === 'utilizado' && posicion === 'prestador')) {
      salida.errores.push(
        sinMedir(`P-02, servicio «${nombre}»: se declara ${uso} y P-01 dice «${posicion}». Corrige una de las dos.`, 'CONFIGURATION')
      );

      return;
    }

    (uso === 'utilizado' ? salida.utilizados : salida.prestados).push(fila);
  });

  return salida;
};

const deServicio = (tabla: Record<string, string>[] | undefined, servicio: string): Record<string, string>[] =>
  (tabla || []).filter(f => iguales(f.servicio || '', servicio));

// --- fechas de los documentos ----------------------------------------------

// Solo AAAA-MM-DD y que exista (la columna es `date`). Cualquier otro texto
// («hasta 06/2027», «2027») no se interpreta: se pide corregir la fila.
const fecha = (texto: string): number | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((texto || '').trim());

  if (!m) {
    return undefined;
  }

  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(anio, mes - 1, dia);
  const d = new Date(t);

  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? t : undefined;
};

const dia10 = (t: number): string => iso(t).slice(0, 10);

// Días que quedan hasta el final del día de vigencia (negativo si ya venció).
const diasHasta = (fin: number, ahora: number): number => Math.floor((fin + DIA - ahora) / DIA);

// --- la categoría de una conformidad ENS ---------------------------------------

const CATEGORIA: Record<string, number> = { basica: 0, media: 1, alta: 2 };
const DEL_NIVEL: Record<string, number> = { BAJO: 0, MEDIO: 1, ALTO: 2 };
const NOMBRE_CATEGORIA = ['BÁSICA', 'MEDIA', 'ALTA'];

type Conformidad = { tipo: 'ens'; categoria: number } | { tipo: 'guia' } | { tipo: 'ens-sin-categoria' } | { tipo: 'desconocida' };

// Primero el ENS, con su categoría: una conformidad «ENS BÁSICA (CCN-STIC
// 809)» es ENS BÁSICA, y mirar antes la guía la daba por buena en un sistema
// MEDIA. Solo un texto sin «ENS» se lee como una guía CCN-STIC. Con dos
// categorías en el texto, la más baja.
const conformidadDe = (texto: string): Conformidad => {
  const t = sinTildes(texto || '');

  if (/\bens\b/.test(t)) {
    const categorias = (t.match(/\b(basica|media|alta)\b/g) || []).map(c => CATEGORIA[c]);

    return categorias.length ? { tipo: 'ens', categoria: Math.min(...categorias) } : { tipo: 'ens-sin-categoria' };
  }

  if (/\bccn-stic\b/.test(t)) {
    return { tipo: 'guia' };
  }

  return { tipo: 'desconocida' };
};

// La conformidad de UN servicio en P-03: ENS de categoría no inferior a la del
// sistema, o guía CCN-STIC, en vigor en la fecha de la evaluación. Basta una
// fila válida; si no la hay, se dice lo peor. La sirven op.nub.1.2 (servicios
// utilizados) y op.nub.1.1 (servicios prestados).
const conformidadDelServicio = (
  p03: Record<string, string>[],
  nombre: string,
  ahora: number,
  nivel: number,
  vigencias: string[]
): Medida => {
  const suyas = deServicio(p03, nombre);

  if (!suyas.length) {
    return noCumple('sin conformidad con el ENS ni con una guía CCN-STIC en P-03');
  }

  const juicios = suyas.map((fila): Medida => {
    const fin = fecha(fila.vigencia);
    const tipo = conformidadDe(fila.conformidad);

    if (fin === undefined) {
      return sinMedir(`P-03, fila de «${nombre}»: la vigencia «${fila.vigencia || ''}» no es una fecha AAAA-MM-DD`, 'CONFIGURATION');
    }

    if (tipo.tipo === 'desconocida' || tipo.tipo === 'ens-sin-categoria') {
      return sinMedir(
        `P-03, fila de «${nombre}»: la conformidad «${fila.conformidad || ''}» no dice ${tipo.tipo === 'ens-sin-categoria' ? 'la categoría (ENS BÁSICA, ENS MEDIA o ENS ALTA)' : 'si es ENS <categoría> o una guía CCN-STIC'}`,
        'CONFIGURATION'
      );
    }

    const quedan = diasHasta(fin, ahora);

    vigencias.push(`${nombre}: conformidad ${fila.conformidad} hasta ${dia10(fin)} (${quedan >= 0 ? `quedan ${quedan} días` : `vencida hace ${-quedan} días`})`);

    if (quedan < 0) {
      return noCumple(`conformidad ${fila.conformidad} vencida el ${dia10(fin)}`);
    }

    if (tipo.tipo === 'ens' && tipo.categoria < nivel) {
      return noCumple(`conformidad ENS ${NOMBRE_CATEGORIA[tipo.categoria]}, inferior a la categoría ${NOMBRE_CATEGORIA[nivel]} del sistema`);
    }

    return cumple(`conformidad ${fila.conformidad} hasta ${dia10(fin)}${fila.referencia ? ` (${fila.referencia})` : ''}`);
  });

  return juicios.find(j => j.estado === 'CUMPLE') || combina(juicios);
};

// --- op.nub.1.1 · la conformidad de los servicios que se prestan --------------

// Decisión 1 del responsable: lo documental se juzga con su vigencia, no con
// P-ATT (que no caduca). El prestador acredita las medidas del modelo prestado
// con la conformidad de cada servicio prestado en P-03.
const prestador = (
  context: ENSPolicyContext,
  ahora: number,
  prestados: Record<string, string>[]
): Expediente => {
  const p03 = filas(context, 'P-03');
  const vigencias: string[] = [];

  if (!p03) {
    return {
      medida: faltaParametro(context, 'P-03', `la conformidad de los servicios prestados (${lista(prestados.map(s => s.servicio))}) con las medidas del modelo según las guías CCN-STIC`),
      vigencias,
    };
  }

  const nivel = DEL_NIVEL[context.level] ?? 0;
  const porServicio = prestados.map(servicio => {
    const m = conformidadDelServicio(p03, servicio.servicio, ahora, nivel, vigencias);

    return { ...m, motivo: `«${servicio.servicio}»${servicio.modelo ? ` (${servicio.modelo})` : ''}: ${m.motivo}` };
  });
  const medida = combina(porServicio);

  return {
    medida:
      medida.estado === 'CUMPLE'
        ? { ...medida, motivo: `${ACREDITADO}: los ${prestados.length} servicios prestados tienen su conformidad en vigor. ${medida.motivo}` }
        : medida,
    vigencias,
  };
};

// --- op.nub.1.r1.2 · los servicios de seguridad y op.pl.5 -----------------------

// Cada servicio de seguridad de P-05 con su verificación de op.pl.5 declarada,
// su referencia y su vigencia. ENSFácil no tiene op.pl.5: se juzga la
// declaración contra la fecha de la evaluación, como una certificación.
const seguridad = (context: ENSPolicyContext, ahora: number, p05: Record<string, string>[]): Medida => {
  const porServicio = p05.map((fila): Medida => {
    const nombre = `«${fila.servicio}»${fila.tipo_de_seguridad ? ` (${fila.tipo_de_seguridad})` : ''}`;
    const declara = sinTildes(fila.cumple_op_pl_5 || '');

    if (declara === 'no') {
      return noCumple(`${nombre}: P-05 declara que no cumple op.pl.5`);
    }

    if (declara !== 'si') {
      return sinMedir(`P-05, fila de ${nombre}: falta si cumple op.pl.5 («sí» o «no»)`, 'CONFIGURATION');
    }

    const fin = fecha(fila.vigente_hasta);

    if (vacio(fila.referencia || '') || fin === undefined) {
      return sinMedir(
        `P-05, fila de ${nombre}: ${vacio(fila.referencia || '') ? 'falta la referencia de la verificación de op.pl.5' : `la vigencia «${fila.vigente_hasta || ''}» no es una fecha AAAA-MM-DD`}`,
        'CONFIGURATION'
      );
    }

    const quedan = diasHasta(fin, ahora);

    return quedan < 0
      ? noCumple(`${nombre}: la verificación de op.pl.5 «${fila.referencia}» venció el ${dia10(fin)}`)
      : cumple(`${nombre}: verificación de op.pl.5 «${fila.referencia}» hasta ${dia10(fin)} (quedan ${quedan} días)`);
  });

  const medida = combina(porServicio);

  return medida.estado === 'CUMPLE'
    ? { ...medida, motivo: `${ACREDITADO}: los ${p05.length} servicios en la nube de seguridad de P-05 tienen su verificación de op.pl.5 en vigor. ${medida.motivo}` }
    : medida;
};

// --- EV-09 · el expediente documental de cada servicio utilizado -------------

interface Expediente {
  medida: Medida;
  // Lo que viaja al informe: la vigencia de cada conformidad.
  vigencias: string[];
}

const ev09 = (context: ENSPolicyContext, ahora: number, utilizados: Record<string, string>[]): Expediente => {
  const p03 = filas(context, 'P-03');
  const p08 = filas(context, 'P-08');
  const p09 = filas(context, 'P-09');
  const p10 = filas(context, 'P-10');
  const meses = escalar(context, 'P-12');
  const nivel = DEL_NIVEL[context.level] ?? 0;
  const vigencias: string[] = [];
  const globales: Medida[] = [];

  if (!p03) {
    globales.push(faltaParametro(context, 'P-03', 'la conformidad con el ENS de los servicios utilizados'));
  }

  if (!p10) {
    globales.push(faltaParametro(context, 'P-10', 'el pentest de los proveedores (op.nub.1.2 a)'));
  } else if (meses === undefined) {
    globales.push(faltaParametro(context, 'P-12', 'la antigüedad de los informes de pentest de P-10'));
  }

  if (!p09) {
    globales.push(faltaParametro(context, 'P-09', 'el cifrado y la gestión de claves (op.nub.1.2 c)'));
  }

  if (!p08) {
    globales.push(faltaParametro(context, 'P-08', 'la jurisdicción de los datos (op.nub.1.2 d)'));
  }

  const porServicio = utilizados.map(servicio => {
    const nombre = servicio.servicio;
    const partes: Medida[] = [];

    // Conformidad ENS o guía CCN-STIC, vigente y de categoría suficiente.
    if (p03) {
      partes.push(conformidadDelServicio(p03, nombre, ahora, nivel, vigencias));
    }

    // a) Pentest del proveedor, no más viejo que P-12 meses.
    if (p10 && meses !== undefined) {
      const suyos = deServicio(p10, nombre);

      if (!suyos.length) {
        partes.push(noCumple('a) sin informe de pentest del proveedor en P-10'));
      } else {
        const juicios = suyos.map((fila): Medida => {
          const t = fecha(fila.fecha);

          if (t === undefined || vacio(fila.ultimo_informe || '')) {
            return sinMedir(
              `P-10, fila de «${nombre}»: ${t === undefined ? `la fecha «${fila.fecha || ''}» no es una fecha AAAA-MM-DD` : 'falta el informe'}`,
              'CONFIGURATION'
            );
          }

          if (t > ahora + TOLERANCIA_FUTURO) {
            return sinMedir(`P-10, fila de «${nombre}»: el informe está fechado en el futuro (${dia10(t)})`, 'CONFIGURATION');
          }

          const fecha0 = new Date(t);
          const limite = Date.UTC(fecha0.getUTCFullYear(), fecha0.getUTCMonth() + meses, fecha0.getUTCDate()) + DIA;

          return ahora > limite
            ? noCumple(`a) el pentest «${fila.ultimo_informe}» es del ${dia10(t)}, más viejo que los ${meses} meses de P-12`)
            : cumple(`a) pentest «${fila.ultimo_informe}» del ${dia10(t)}`);
        });

        partes.push(juicios.find(j => j.estado === 'CUMPLE') || combina(juicios));
      }
    }

    // c) Cifrado y gestión de claves.
    if (p09) {
      const fila = deServicio(p09, nombre)[0];

      if (!fila) {
        partes.push(noCumple('c) sin cifrado ni gestión de claves declarados en P-09'));
      } else if (vacio(fila.cifrado || '') || vacio(fila.gestion_claves || '')) {
        partes.push(sinMedir(`P-09, fila de «${nombre}»: falta ${vacio(fila.cifrado || '') ? 'el cifrado' : 'la gestión de claves'}`, 'CONFIGURATION'));
      } else {
        partes.push(cumple(`c) ${fila.cifrado}, claves: ${fila.gestion_claves}`));
      }
    }

    // d) Región de los datos y de las copias, y jurisdicción.
    if (p08) {
      const fila = deServicio(p08, nombre)[0];
      const faltan = fila
        ? [['region_datos', 'la región de los datos'], ['region_copias', 'la de las copias'], ['jurisdiccion', 'la jurisdicción']]
            .filter(([c]) => vacio(fila[c] || ''))
            .map(([, texto]) => texto)
        : [];

      if (!fila) {
        partes.push(noCumple('d) sin región de los datos ni jurisdicción declaradas en P-08'));
      } else if (faltan.length) {
        partes.push(sinMedir(`P-08, fila de «${nombre}»: falta ${faltan.join(' y ')}`, 'CONFIGURATION'));
      } else {
        partes.push(cumple(`d) datos en ${fila.region_datos}, copias en ${fila.region_copias}, ${fila.jurisdiccion}`));
      }
    }

    if (!partes.length) {
      return undefined;
    }

    const juntas = combina(partes);

    return { ...juntas, motivo: `«${nombre}»: ${juntas.motivo}` };
  }).filter((m): m is Medida => Boolean(m));

  const medida = combina([...porServicio, ...globales]);

  return {
    medida:
      medida.estado === 'CUMPLE'
        ? {
            ...medida,
            motivo: `${ACREDITADO}: los ${utilizados.length} servicios utilizados de P-02 tienen su expediente completo y vigente (la transparencia, b), la cubre la conformidad declarada). ${porServicio.map(m => m.motivo).join(' ')}`,
          }
        : medida,
    vigencias,
  };
};

// --- EV-08 · la certificación de P-04 en vigor (R1) ----------------------------

const ev08 = (context: ENSPolicyContext, ahora: number, utilizados: Record<string, string>[]): Expediente => {
  const p04 = filas(context, 'P-04');
  const vigencias: string[] = [];

  if (!p04) {
    return {
      medida: faltaParametro(context, 'P-04', `la certificación reconocida de los servicios utilizados (${lista(utilizados.map(s => s.servicio))})`),
      vigencias,
    };
  }

  const porServicio = utilizados.map((servicio): Medida => {
    const nombre = servicio.servicio;
    const suyas = deServicio(p04, nombre);

    if (!suyas.length) {
      return noCumple(`«${nombre}»: sin certificación reconocida en P-04`);
    }

    const juicios = suyas.map((fila): Medida => {
      const fin = fecha(fila.vigencia);

      if (fin === undefined || vacio(fila.metodologia || '') || vacio(fila.n_certificado || '')) {
        return sinMedir(
          `P-04, fila de «${nombre}»: ${fin === undefined ? `la vigencia «${fila.vigencia || ''}» no es una fecha AAAA-MM-DD` : `falta ${vacio(fila.metodologia || '') ? 'la metodología' : 'el número de certificado'}`}`,
          'CONFIGURATION'
        );
      }

      const quedan = diasHasta(fin, ahora);

      vigencias.push(`${nombre}: certificación ${fila.metodologia} nº ${fila.n_certificado} hasta ${dia10(fin)} (${quedan >= 0 ? `quedan ${quedan} días` : `vencida hace ${-quedan} días`})`);

      return quedan < 0
        ? noCumple(`«${nombre}»: la certificación ${fila.metodologia} nº ${fila.n_certificado} venció el ${dia10(fin)}`)
        : cumple(`«${nombre}»: ${fila.metodologia} nº ${fila.n_certificado} hasta ${dia10(fin)} (quedan ${quedan} días)`);
    });

    return juicios.find(j => j.estado === 'CUMPLE') || combina(juicios);
  });

  const medida = combina(porServicio);

  return {
    medida:
      medida.estado === 'CUMPLE'
        ? { ...medida, motivo: `${ACREDITADO}: los ${utilizados.length} servicios utilizados tienen certificación reconocida en vigor. ${medida.motivo}` }
        : medida,
    vigencias,
  };
};

// --- P-06: los servicios integrados, agrupados por módulo ---------------------

interface Integraciones {
  // Módulo -> servicios de P-06 que lo declaran.
  porModulo: Map<string, string[]>;
  // Servicios con «ninguno» (o sin fila): hallazgo del informe.
  sinIntegrar: string[];
  errores: Medida[];
}

const integraciones = (context: ENSPolicyContext, servicios: Record<string, string>[]): Integraciones | undefined => {
  const p06 = filas(context, 'P-06');

  if (!p06) {
    return undefined;
  }

  const salida: Integraciones = { porModulo: new Map(), sinIntegrar: [], errores: [] };

  p06.forEach(fila => {
    const modulo = (fila.modulo || '').trim().toLowerCase();

    if (!modulo) {
      salida.errores.push(
        sinMedir(`P-06, servicio «${fila.servicio}»: falta el módulo de Wazuh (o «ninguno» si no se integra).`, 'CONFIGURATION')
      );

      return;
    }

    if (modulo === 'ninguno') {
      salida.sinIntegrar.push(fila.servicio);

      return;
    }

    if (!MODULOS.includes(modulo)) {
      salida.errores.push(
        sinMedir(`P-06, servicio «${fila.servicio}»: «${fila.modulo}» no es un módulo cloud de Wazuh (${MODULOS.join(', ')}, o «ninguno»).`, 'CONFIGURATION')
      );

      return;
    }

    salida.porModulo.set(modulo, [...(salida.porModulo.get(modulo) || []), fila.servicio]);
  });

  servicios
    .filter(s => !deServicio(p06, s.servicio).length)
    .forEach(s => salida.sinIntegrar.push(s.servicio));

  return salida;
};

const nombreModulo = (modulo: string, servicios: string[]): string => `${lista(servicios.map(s => `«${s}»`))} (${modulo})`;

// --- EV-01 · cada módulo declarado, configurado, vivo y sin errores ------------

interface Ingesta {
  medida: Medida;
  // Módulo -> su medida, para EV-04 y EV-07 (una ingesta parada no permite
  // afirmar que no haya operaciones ni accesos).
  porModulo: Map<string, Medida>;
}

const ingestaDeModulo = (
  context: ENSPolicyContext,
  modulo: string,
  servicios: string[],
  vigentes: ENSNormalizedEvent[]
): Medida => {
  const quien = nombreModulo(modulo, servicios);
  const suyos = vigentes.filter(e => iguales(campo(e, 'modulo'), modulo));

  if (!suyos.length) {
    return noCumple(
      `${quien}: P-06 lo declara integrado y Wazuh no tiene el módulo ${modulo} configurado en el manager ni en ningún grupo, ni recibe sus registros de ningún agente.`
    );
  }

  const donde = Array.from(new Set(suyos.flatMap(e => campo(e, 'donde').split(',').map(x => x.trim()).filter(x => !vacio(x))))).join(', ') || 'origen desconocido';
  const partes: Medida[] = [];

  // Habilitado: lo dice su configuración; el de un agente dedicado solo se ve
  // por sus alertas (habilitado=-), y entonces su ingesta lo demuestra.
  if (suyos.every(e => campo(e, 'habilitado') === 'no')) {
    partes.push(noCumple(`${quien}: el módulo está configurado en ${donde} pero deshabilitado.`));
  }

  // Errores del módulo en las últimas 24 h (en ossec.log del manager, o en el
  // del agente si lo reenvía; si no se ven, `-`).
  const conErrores = suyos.filter(e => (numero(campo(e, 'errores_24h')) || 0) > 0);
  const errores = conErrores.reduce((t, e) => t + (numero(campo(e, 'errores_24h')) || 0), 0);
  const sinVista = suyos.every(e => numero(campo(e, 'errores_24h')) === undefined);

  if (errores > 0) {
    const ultimo = conErrores.map(e => campo(e, 'ultimo_error')).find(t => !vacio(t));

    partes.push(noCumple(`${quien}: el módulo registra ${errores} errores en 24 h${ultimo ? ` (el último: «${ultimo}»)` : ''}: hay registros que no entran.`));
  }

  // Registros recientes, medidos en el instante de la observación.
  const plazo = escalar(context, 'P-13');
  const conAlerta = suyos
    .map(e => ({ e, t: instante(campo(e, 'ultima_alerta')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined)
    .sort((a, b) => b.t - a.t)[0];
  const n24 = suyos.reduce((t, e) => t + (numero(campo(e, 'alertas_24h')) || 0), 0);

  if (plazo === undefined) {
    partes.push(faltaParametro(context, 'P-13', `si la ingesta de ${quien} está parada${conAlerta ? ` (última alerta ${iso(conAlerta.t)})` : ''}`));
  } else if (conAlerta) {
    const edad = momento(conAlerta.e) - conAlerta.t;

    partes.push(
      edad > plazo * HORA
        ? noCumple(`${quien}: su última alerta es del ${iso(conAlerta.t)}, ${horas(edad)} h antes de la observación (P-13 = ${plazo} h): la ingesta está parada.`)
        : cumple(
            `${quien}: configurado en ${donde}, última alerta ${iso(conAlerta.t)}, ${n24} en 24 h${sinVista ? ' (sus errores no se ven desde el manager: el módulo corre en un agente que no reenvía su ossec.log)' : ', sin errores'}.`
          )
    );
  } else {
    const desdes = suyos.map(e => instante(campo(e, 'observado_desde'))).filter((t): t is number => t !== undefined);
    const desde = desdes.length ? Math.min(...desdes) : undefined;
    const observado = Math.max(...suyos.map(momento));

    partes.push(
      desde !== undefined && observado - desde > plazo * HORA
        ? noCumple(`${quien}: configurado en ${donde} y sin ningún registro desde que se observa (${iso(desde)}), más que P-13 (${plazo} h).`)
        : sinMedir(
            `${quien}: configurado en ${donde}, sin registros todavía y observado desde ${desde !== undefined ? iso(desde) : 'un instante desconocido'}, menos que P-13 (${plazo} h): no se puede afirmar ni negar que la ingesta funcione.`
          )
    );
  }

  return combina(partes);
};

const ev01 = (context: ENSPolicyContext, ahora: number, servicios: Record<string, string>[]): Ingesta => {
  const porModulo = new Map<string, Medida>();
  const integ = integraciones(context, servicios);

  if (!integ) {
    return {
      medida: faltaParametro(context, 'P-06', 'qué servicios de P-02 se integran en Wazuh y con qué módulo (o «ninguno»)'),
      porModulo,
    };
  }

  const { vigentes, ultimo } = ingestaLector.estadoVigente(context, 'cloud_integration_observed', ahora);
  const observados = vigentes.filter(e => !vacio(campo(e, 'modulo')) && campo(e, 'modulo') !== 'ninguno');
  const declarados = Array.from(integ.porModulo.keys());
  const sinIntegrar = integ.sinIntegrar.length
    ? ` Sin integración en Wazuh (hallazgo del informe, sin veredicto: el ENS no exige integrarlos): ${lista(integ.sinIntegrar.map(s => `«${s}»`))}.`
    : '';
  const ajenos = observados.filter(e => !declarados.includes(campo(e, 'modulo').toLowerCase()));
  const noDeclarados = ajenos.length
    ? ` Wazuh ingiere además ${lista(Array.from(new Set(ajenos.map(e => campo(e, 'modulo')))))}, que P-06 no declara.`
    : '';
  const secretos = observados.filter(e => campo(e, 'secreto_en_linea') === 'si');
  const aviso = secretos.length
    ? ` Aviso: ${lista(secretos.map(e => `${campo(e, 'modulo')} en ${campo(e, 'donde')}`))} lleva la credencial del proveedor escrita en la configuración del manager o de un grupo; tiene que vivir solo en el agente dedicado.`
    : '';

  if (!declarados.length) {
    return {
      medida: combina([
        ...integ.errores,
        noAplica(`P-06 no declara ningún servicio integrado en Wazuh: la parte técnica de op.nub.1.2 no aplica.${sinIntegrar}${noDeclarados}`),
      ]),
      porModulo,
    };
  }

  if (!vigentes.length || ultimo === undefined) {
    const falta = ingestaLector.sinHechos(context, 'EV-01', ahora, ultimo, 'inventario de integraciones cloud del manager');

    declarados.forEach(m => porModulo.set(m, falta));

    return { medida: combina([...integ.errores, { ...falta, motivo: `${falta.motivo}${sinIntegrar}` }]), porModulo };
  }

  const medidas = declarados.map(modulo => {
    const medida = ingestaDeModulo(context, modulo, integ.porModulo.get(modulo) || [], vigentes);

    porModulo.set(modulo, medida);

    return medida;
  });

  const juntas = combina([...medidas, ...integ.errores]);

  return {
    medida: ingestaLector.conDegradacion(context, ahora, 'EV-01', 'cloud_integration_observed', {
      ...juntas,
      motivo: `${juntas.motivo}${sinIntegrar}${noDeclarados}${aviso}`,
    }),
    porModulo,
  };
};

// --- EV-04 · las operaciones administrativas, contra P-11 ---------------------

// Una medida técnica por módulo integrado, sobre los hechos de la ventana.
const porModuloIntegrado = (
  context: ENSPolicyContext,
  servicios: Record<string, string>[],
  ingesta: Ingesta,
  juzga: (modulo: string, servicios: string[], ingestaDelModulo: Medida | undefined) => Medida
): Medida => {
  const integ = integraciones(context, servicios);

  if (!integ) {
    return faltaParametro(context, 'P-06', 'qué servicios se integran en Wazuh');
  }

  const modulos = Array.from(integ.porModulo.keys());

  if (!modulos.length) {
    return noAplica('P-06 no declara ningún servicio integrado en Wazuh: no hay registros del proveedor que juzgar (hallazgo del informe, sin veredicto).');
  }

  return combina(
    modulos.map(modulo => juzga(modulo, integ.porModulo.get(modulo) || [], ingesta.porModulo.get(modulo)))
  );
};

const viva = (ingestaDelModulo: Medida | undefined): boolean => ingestaDelModulo?.estado === 'CUMPLE';

// Sin ingesta demostrada, la ausencia de registros no prueba nada. Si lo que
// falta es el propio recolector, el hueco es de RECOGIDA.
const noViva = (quien: string, ingestaDelModulo: Medida | undefined, extra = ''): Medida =>
  sinMedir(
    `${quien}: su ingesta no está demostrada (ver EV-01), así que la ausencia de registros no prueba nada.${extra}`,
    ingestaDelModulo?.estado === 'NO_EVALUABLE' && ingestaDelModulo.causa === 'COLLECTION' ? 'COLLECTION' : 'EVIDENCE'
  );

const ev04 = (context: ENSPolicyContext, ahora: number, servicios: Record<string, string>[], ingesta: Ingesta): Medida => {
  const operaciones = validos(context, 'cloud_admin_operation_observed', ahora);
  const p11 = filas(context, 'P-11');

  const medida = porModuloIntegrado(context, servicios, ingesta, (modulo, suyos, ingestaDelModulo) => {
    const quien = nombreModulo(modulo, suyos);
    const deModulo = operaciones.filter(e => iguales(campo(e, 'modulo'), modulo));
    // Las acciones de los propios servicios del proveedor (AWSService, una
    // identidad administrada de Azure) no se contrastan con P-11.
    const humanas = deModulo.filter(e => campo(e, 'tipo_actor') !== 'servicio');

    if (!humanas.length) {
      return viva(ingestaDelModulo)
        ? cumple(`${quien}: ninguna operación de administración de una persona en la ventana${deModulo.length ? ` (${deModulo.length} de servicios del proveedor)` : ''}.`)
        : noViva(quien, ingestaDelModulo);
    }

    // Por actor, toda la ventana.
    const actores = new Map<string, { veces: number; operaciones: Set<string>; ultima: number; cuentas: Set<string> }>();

    humanas.forEach(e => {
      const actor = campo(e, 'actor');
      const a = actores.get(actor.toLowerCase()) || { veces: 0, operaciones: new Set<string>(), ultima: 0, cuentas: new Set<string>() };

      a.veces += numero(campo(e, 'veces')) || 1;
      campo(e, 'operaciones').split(',').map(x => x.trim()).filter(x => !vacio(x)).forEach(o => a.operaciones.add(o));
      a.ultima = Math.max(a.ultima, instante(campo(e, 'ultima')) || momento(e));
      if (!vacio(campo(e, 'cuenta'))) {
        a.cuentas.add(campo(e, 'cuenta'));
      }
      actores.set(actor.toLowerCase(), a);
    });

    const describe = (actor: string) => {
      const a = actores.get(actor)!;
      const original = humanas.find(e => campo(e, 'actor').toLowerCase() === actor);

      return `${original ? campo(original, 'actor') : actor} (${a.veces} operaciones: ${lista(Array.from(a.operaciones), 4)}; la última el ${iso(a.ultima)})`;
    };

    if (!p11) {
      return faltaParametro(context, 'P-11', `si los ${actores.size} actores con operaciones de administración en ${quien} están autorizados (${lista(Array.from(actores.keys()).map(describe))})`);
    }

    const autorizadas = p11
      .filter(f => suyos.some(s => iguales(f.servicio || '', s)))
      .map(f => (f.identidad || '').trim().toLowerCase())
      .filter(Boolean);
    const fuera = Array.from(actores.keys()).filter(a => !autorizadas.includes(a));

    return fuera.length
      ? noCumple(`${quien}: operaciones de administración de actores que P-11 no autoriza para el servicio: ${lista(fuera.map(describe))}.`)
      : cumple(`${quien}: las operaciones de administración de la ventana son de actores autorizados en P-11: ${lista(Array.from(actores.keys()).map(describe))}.`);
  });

  // Lo que el recolector no pudo emitir (demasiados actores en una pasada) se
  // suma a lo medido, sin taparlo.
  const deg = degradacion(context, 'EV-04', ahora);

  return deg && medida.estado !== 'NO_APLICA' ? combina([medida, deg]) : medida;
};

// --- EV-07 · los accesos interactivos, con segundo factor ---------------------

const ev07 = (context: ENSPolicyContext, ahora: number, servicios: Record<string, string>[], ingesta: Ingesta): Medida => {
  const accesos = validos(context, 'cloud_authentication_observed', ahora);

  const medida = porModuloIntegrado(context, servicios, ingesta, (modulo, suyos, ingestaDelModulo) => {
    const quien = nombreModulo(modulo, suyos);
    const deModulo = accesos.filter(e => iguales(campo(e, 'modulo'), modulo));
    const exitos = deModulo.filter(e => campo(e, 'resultado') === 'exito');
    const fallos = deModulo.filter(e => campo(e, 'resultado') === 'fallo');
    const veces = (es: ENSNormalizedEvent[]) => es.reduce((t, e) => t + (numero(campo(e, 'veces')) || 1), 0);
    const intentos = fallos.length
      ? ` Intentos fallidos en la ventana: ${veces(fallos)} de ${new Set(fallos.map(e => campo(e, 'usuario').toLowerCase())).size} usuario(s).`
      : '';
    const describe = (e: ENSNormalizedEvent) =>
      `${campo(e, 'usuario')}${vacio(campo(e, 'cuenta')) ? '' : ` en ${campo(e, 'cuenta')}`} (${campo(e, 'veces') || '1'} veces, la última el ${campo(e, 'ultima')}${vacio(campo(e, 'origenes')) ? '' : `, desde ${campo(e, 'origenes')}`})`;

    const sinFactor = exitos.filter(e => campo(e, 'segundo_factor') === 'no');
    const sinDato = exitos.filter(e => campo(e, 'segundo_factor') !== 'no' && campo(e, 'segundo_factor') !== 'si');

    if (sinFactor.length) {
      return noCumple(
        `${quien}: accesos interactivos con éxito SIN segundo factor, y un servicio en la nube es acceso desde una zona no controlada (op.acc.6): ${lista(sinFactor.map(describe))}.${intentos}`
      );
    }

    if (sinDato.length) {
      return sinMedir(
        `${quien}: el registro del proveedor no dice si estos accesos usaron segundo factor (accesos federados o sin el dato): ${lista(sinDato.map(describe))}. No se puede afirmar que todos lo usaran.${intentos}`
      );
    }

    if (exitos.length) {
      return cumple(`${quien}: los ${veces(exitos)} accesos interactivos con éxito de la ventana usaron segundo factor (${new Set(exitos.map(e => campo(e, 'usuario').toLowerCase())).size} usuario(s)).${intentos}`);
    }

    return viva(ingestaDelModulo)
      ? sinMedir(
          `${quien}: no consta ningún acceso interactivo con éxito en la ventana, así que no hay nada que demuestre el segundo factor (la integración puede no traer los inicios de sesión).${intentos}`
        )
      : noViva(quien, ingestaDelModulo, intentos);
  });

  const deg = degradacion(context, 'EV-07', ahora);

  return deg && medida.estado !== 'NO_APLICA' ? combina([medida, deg]) : medida;
};

// --- EV-02 · los hallazgos de postura del proveedor (R2) -----------------------

const ev02 = (context: ENSPolicyContext, ahora: number): Medida => {
  const p07 = filas(context, 'P-07');

  if (!p07) {
    return faltaParametro(context, 'P-07', 'qué guía CCN-STIC y qué estándar de postura aplican a cada servicio');
  }

  const p06 = filas(context, 'P-06');

  if (!p06) {
    return faltaParametro(context, 'P-06', 'qué módulo de Wazuh trae los hallazgos de postura de cada servicio de P-07');
  }

  const { vigentes, ultimo } = estadoVigente(context, 'cloud_posture_finding_observed', ahora);

  if (!vigentes.length || ultimo === undefined) {
    return sinHechos(context, 'EV-02', ahora, ultimo, 'resumen de hallazgos de postura del manager');
  }

  const hallazgos = vigentes.filter(e => !vacio(campo(e, 'fuente')) && campo(e, 'fuente') !== 'ninguna');

  const medidas = p07.map((fila): Medida => {
    const nombre = fila.servicio;
    const integracion = deServicio(p06, nombre)
      .map(f => (f.modulo || '').trim().toLowerCase())
      .find(m => MODULOS.includes(m));

    if (!integracion) {
      return sinMedir(
        `«${nombre}»: no tiene integración en Wazuh (P-06), y sin los hallazgos de postura del propio proveedor R2 no es automatizable (Wazuh 4.14 no tiene SCA para inquilinos cloud).`
      );
    }

    const estandar = (fila.estandar || '').trim();
    const suyos = hallazgos.filter(
      e => iguales(campo(e, 'modulo'), integracion) && (!estandar || sinTildes(campo(e, 'estandar')).includes(sinTildes(estandar)))
    );

    if (!suyos.length) {
      return sinMedir(
        `«${nombre}» (${integracion}): Wazuh no recibe hallazgos de postura del proveedor${estandar ? ` del estándar «${estandar}»` : ''} (Security Hub, Defender, Security Command Center): R2 no es automatizable para este servicio.`
      );
    }

    const evaluados = suyos.reduce((t, e) => t + (numero(campo(e, 'controles_evaluados')) || 0), 0);
    const fallidos = suyos.reduce((t, e) => t + (numero(campo(e, 'controles_fallidos')) || 0), 0);
    const criticos = suyos.reduce((t, e) => t + (numero(campo(e, 'fallidos_criticos')) || 0), 0);
    const estandares = Array.from(new Set(suyos.map(e => `${campo(e, 'fuente')}: ${campo(e, 'estandar')}`))).join('; ');

    if (fallidos > 0) {
      const cuales = suyos.flatMap(e => campo(e, 'fallidos').split(',').map(x => x.trim()).filter(x => !vacio(x)));

      return noCumple(
        `«${nombre}» (${estandares}): ${fallidos} de ${evaluados} controles fallidos${criticos ? `, ${criticos} críticos o altos` : ''}: ${lista(cuales, 8)}. La configuración no sigue ${fila.guia_ccn_stic || 'la guía CCN-STIC aplicable'}.`
      );
    }

    return evaluados > 0
      ? cumple(`«${nombre}» (${estandares}): los ${evaluados} controles evaluados pasan (${fila.guia_ccn_stic || 'guía CCN-STIC sin declarar'}).`)
      : sinMedir(`«${nombre}» (${estandares}): el proveedor no ha evaluado ningún control.`);
  });

  return conDegradacion(context, ahora, 'EV-02', 'cloud_posture_finding_observed', combina(medidas));
};

// --- datos del informe ---------------------------------------------------------

const DATO_EV03 =
  'Dato del informe, sin veredicto: detectar servicios en la nube en uso que no figuran en P-02 (shadow IT) exige el DNS o el proxy de los equipos, y con los ficheros locales del manager no se ven. EV-01 dice, eso sí, qué módulos cloud ingiere Wazuh que P-06 no declara.';

const datoDeclarado = (context: ENSPolicyContext, id: string, que: string, columnas: string[]): string => {
  const tabla = filas(context, id);

  return tabla
    ? ` Declarado en ${id}: ${lista(tabla.map(f => `${f.servicio}: ${columnas.map(c => f[c]).filter(x => !vacio(x || '')).join(', ') || '-'}`))}.`
    : ` ${id} sin declarar: ${que} no consta.`;
};

const DATO_EV05 =
  'Dato del informe, sin veredicto: Wazuh 4.14 no tiene SCA para inquilinos cloud y el recolector no usa credenciales del proveedor, así que el cifrado configurado no se puede medir. Lo declarado en P-09 se juzga en el expediente (EV-09, op.nub.1.2 c).';

const DATO_EV06 =
  'Dato del informe, sin veredicto: sin SCA cloud ni credenciales del proveedor la región configurada no se puede medir. Lo declarado en P-08 se juzga en el expediente (EV-09, op.nub.1.2 d).';

// --- decisiones ------------------------------------------------------------

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();
  const aplica = (requisito: string): boolean =>
    Boolean(
      context.control.requirements
        .find(r => r.id === requisito)
        ?.applicability.levels.includes(context.level)
    );
  const parametrosDe = (requisito: string): string[] =>
    context.control.requirements.find(r => r.id === requisito)?.parameterIds || [];
  const tipoDe = (requisito: string): ENSTipoDeRegla =>
    opNub1PolicyDefinition.requirements.find(r => r.requirementId === requisito)?.ruleType || 'CONDITIONAL_REQUIRED';

  const requisitoDecisions: ENSPolicyDecision[] = [];
  const evidenciaDecisions: ENSPolicyDecision[] = [];
  const medidas: Record<string, Medida> = {};

  // `documental`: la decisión sale de las tablas de la pantalla, no de los
  // hechos, y sobrevive a un recolector parado (ver `ENSPolicyDecision`).
  const marca = (decision: ENSPolicyDecision, documental: boolean): ENSPolicyDecision =>
    documental ? { ...decision, documental: true } : decision;

  const decideRequisito = (
    requisito: string,
    medida: Medida,
    evidencias: string[],
    esperado: string,
    acreditado = false,
    documental = REQUISITOS_DOCUMENTALES.includes(requisito)
  ) =>
    requisitoDecisions.push(
      marca(
        decide(requisito, medida.estado, evidencias, parametrosDe(requisito), tipoDe(requisito), requisito, medida.motivo, esperado, medida.causa, acreditado),
        documental
      )
    );

  const decideEvidencia = (
    requisito: string,
    evidencia: string,
    medida: Medida,
    esperado = `${evidencia} CUMPLE`,
    documental = EVIDENCIAS_DOCUMENTALES.includes(evidencia)
  ) => {
    medidas[evidencia] = medida;
    evidenciaDecisions.push(
      marca(
        decide(requisito, medida.estado, [evidencia], parametrosDe(requisito), tipoDe(requisito), `${requisito}/${evidencia}`, medida.motivo, esperado, medida.causa),
        documental
      )
    );
  };

  const { posicion, medida: sinPosicion } = posicionDe(context);

  // Sin P-01 (o con un valor que no es una de sus opciones) no se sabe qué es
  // exigible: todo lo que aplica al nivel queda sin medir por CONFIGURATION.
  if (!posicion) {
    const sin = sinPosicion!;

    context.control.requirements
      .filter(r => aplica(r.id))
      .forEach(r => {
        // Sin P-01 el hueco es de CONFIGURACIÓN, también con el recolector
        // parado: se marca documental para que no pase a ser de RECOGIDA.
        decideRequisito(r.id, sin, r.evidenceIds, 'P-01 configurado', false, true);
        r.evidenceIds.forEach(ev => decideEvidencia(r.id, ev, sin, `${ev} CUMPLE`, true));
      });

    ['EV-03', 'EV-05', 'EV-06'].forEach(ev => decideEvidencia('op.nub.1.2', ev, noAplica(ev === 'EV-03' ? DATO_EV03 : ev === 'EV-05' ? DATO_EV05 : DATO_EV06), 'dato del informe'));

    return {
      decisions: [...requisitoDecisions, ...evidenciaDecisions],
      runtimeVariables: [{ name: 'posicion_P01', value: 'sin configurar', parameterIds: ['P-01'], evidenceIds: [], eventIds: [], description: sin.motivo }],
    };
  }

  // P-01 = ninguno: todo NO_APLICA, declarado.
  if (posicion === 'ninguno') {
    const fuera = noAplica(NINGUNO);

    context.control.requirements
      .filter(r => aplica(r.id))
      .forEach(r => {
        decideRequisito(r.id, fuera, r.evidenceIds, 'servicios en la nube en el alcance');
        r.evidenceIds.forEach(ev => decideEvidencia(r.id, ev, fuera));
      });

    ['EV-03', 'EV-05', 'EV-06'].forEach(ev => decideEvidencia('op.nub.1.2', ev, fuera, 'dato del informe'));

    return {
      decisions: [...requisitoDecisions, ...evidenciaDecisions],
      runtimeVariables: [{ name: 'posicion_P01', value: 'ninguno', parameterIds: ['P-01'], evidenceIds: [], eventIds: [], description: NINGUNO }],
    };
  }

  const inv = inventario(context, posicion);
  const sinInventario = faltaParametro(context, 'P-02', 'qué servicios en la nube están en el alcance');
  const todos = inv ? [...inv.utilizados, ...inv.prestados] : [];
  const vigencias: string[] = [];

  // --- op.nub.1.1 · prestador: la conformidad de lo prestado, con su vigencia --
  if (aplica('op.nub.1.1')) {
    if (!presta(posicion)) {
      decideRequisito('op.nub.1.1', noAplica(`P-01 = ${posicion}: el sistema no presta servicios en la nube al sector público.`), [], 'prestador');
    } else {
      let medida: Medida;

      if (!inv) {
        medida = sinInventario;
      } else if (!inv.prestados.length) {
        medida = combina([
          ...inv.errores,
          sinMedir(`${etiqueta(context, 'P-02')} no declara ningún servicio prestado (columna «uso»), y P-01 = ${posicion}.`, 'CONFIGURATION'),
        ]);
      } else {
        const e = prestador(context, ahora, inv.prestados);

        vigencias.push(...e.vigencias);
        medida = e.medida;
      }

      decideRequisito('op.nub.1.1', medida, [], 'conformidad en vigor de cada servicio prestado (P-03)', medida.estado === 'CUMPLE');
    }
  }

  // --- op.nub.1.2 · usuario: expediente + medida técnica --------------------
  let ingesta: Ingesta | undefined;

  if (aplica('op.nub.1.2')) {
    if (!usa(posicion)) {
      const fuera = noAplica(`P-01 = ${posicion}: el sistema no utiliza servicios en la nube de terceros.`);

      decideRequisito('op.nub.1.2', fuera, ['EV-01', 'EV-04', 'EV-07', 'EV-09'], 'usuario');
      ['EV-01', 'EV-04', 'EV-07', 'EV-09'].forEach(ev => decideEvidencia('op.nub.1.2', ev, fuera));
    } else {
      const utilizados = inv?.utilizados || [];
      const expediente: Medida = !inv
        ? sinInventario
        : !utilizados.length
        ? combina([...inv.errores, sinMedir(`${etiqueta(context, 'P-02')} no declara ningún servicio utilizado de un tercero, y P-01 = ${posicion}.`, 'CONFIGURATION')])
        : (() => {
            const e = ev09(context, ahora, utilizados);

            vigencias.push(...e.vigencias);

            return inv.errores.length ? combina([e.medida, ...inv.errores]) : e.medida;
          })();

      ingesta = ev01(context, ahora, todos);
      const tecnicas: { id: string; medida: Medida }[] = [
        { id: 'EV-01', medida: ingesta.medida },
        { id: 'EV-04', medida: ev04(context, ahora, todos, ingesta) },
        { id: 'EV-07', medida: ev07(context, ahora, todos, ingesta) },
      ];
      const propias = [{ id: 'EV-09', medida: expediente }, ...tecnicas];
      const enContra = propias.filter(p => p.medida.estado === 'NO_CUMPLE');
      const resumen = propias.map(p => `${p.id} ${p.medida.estado}: ${p.medida.motivo}`).join(' | ');

      // La medida manda: un NO_CUMPLE (técnico o del expediente) decide. Si
      // no, el expediente completo y vigente acredita el requisito aunque la
      // parte técnica no se haya podido medir (integrar no es exigible).
      // Documental cuando lo decide SOLO el expediente: un NO_CUMPLE solo de
      // EV-09, el CUMPLE acreditado (lo técnico solo puede tumbarlo) y el sin
      // medir, que siempre es del expediente. Con una medida técnica en contra
      // no lo es: esa decisión sale de los hechos.
      if (enContra.length) {
        decideRequisito(
          'op.nub.1.2',
          noCumple(resumen),
          enContra.map(p => p.id),
          'EV-09 CUMPLE y ninguna medida técnica en contra',
          false,
          enContra.every(p => p.id === 'EV-09')
        );
      } else if (expediente.estado === 'CUMPLE') {
        decideRequisito(
          'op.nub.1.2',
          cumple(`${ACREDITADO}: el expediente de los servicios utilizados está completo y vigente, y ninguna medida técnica está en contra. ${resumen}`),
          ['EV-09'],
          'EV-09 CUMPLE y ninguna medida técnica en contra',
          true,
          true
        );
      } else {
        const sinMedirAun = propias.filter(p => p.medida.estado === 'NO_EVALUABLE');

        decideRequisito(
          'op.nub.1.2',
          { estado: 'NO_EVALUABLE', motivo: resumen, causa: causaComun([expediente]) },
          sinMedirAun.length ? sinMedirAun.map(p => p.id) : ['EV-09'],
          'EV-09 CUMPLE y ninguna medida técnica en contra',
          false,
          true
        );
      }

      propias.forEach(p => decideEvidencia('op.nub.1.2', p.id, p.medida));
    }

    // Datos del informe, sin veredicto.
    decideEvidencia('op.nub.1.2', 'EV-03', noAplica(DATO_EV03), 'dato del informe');
    decideEvidencia('op.nub.1.2', 'EV-05', noAplica(`${DATO_EV05}${datoDeclarado(context, 'P-09', 'el cifrado', ['cifrado', 'gestion_claves'])}`), 'dato del informe');
    decideEvidencia('op.nub.1.2', 'EV-06', noAplica(`${DATO_EV06}${datoDeclarado(context, 'P-08', 'la región', ['region_datos', 'region_copias', 'jurisdiccion'])}`), 'dato del informe');
  }

  // --- op.nub.1.r1.1 · certificación en vigor ------------------------------
  if (aplica('op.nub.1.r1.1')) {
    if (!usa(posicion)) {
      const fuera = noAplica(`P-01 = ${posicion}: R1 es para los servicios en la nube de terceros que se utilizan.`);

      decideRequisito('op.nub.1.r1.1', fuera, ['EV-08'], 'usuario');
      decideEvidencia('op.nub.1.r1.1', 'EV-08', fuera);
    } else {
      const utilizados = inv?.utilizados || [];
      let medida: Medida;

      if (!inv) {
        medida = sinInventario;
      } else if (!utilizados.length) {
        medida = sinMedir(`${etiqueta(context, 'P-02')} no declara ningún servicio utilizado de un tercero.`, 'CONFIGURATION');
      } else {
        const e = ev08(context, ahora, utilizados);

        vigencias.push(...e.vigencias);
        medida = e.medida;
      }

      decideRequisito('op.nub.1.r1.1', medida, ['EV-08'], 'EV-08 CUMPLE', medida.estado === 'CUMPLE');
      decideEvidencia('op.nub.1.r1.1', 'EV-08', medida);
    }
  }

  // --- op.nub.1.r1.2 · servicios de seguridad y op.pl.5 ----------------------
  if (aplica('op.nub.1.r1.2')) {
    const p05 = filas(context, 'P-05');

    if (!usa(posicion)) {
      decideRequisito('op.nub.1.r1.2', noAplica(`P-01 = ${posicion}: R1.2 es para los servicios en la nube de terceros que se utilizan.`), [], 'usuario');
    } else if (!p05) {
      // Vacío no es «ninguno»: lo no declarado no se puede sacar del
      // denominador. «ninguno» es una declaración y se escribe.
      decideRequisito(
        'op.nub.1.r1.2',
        sinMedir(
          `${etiqueta(context, 'P-05')} está sin configurar: no consta si alguno de los servicios en la nube es de seguridad (un SIEM gestionado, un WAF, copias gestionadas). Si no se usa ninguno, declara una sola fila «ninguno».`,
          'CONFIGURATION'
        ),
        [],
        'servicios de seguridad en P-05, o «ninguno»'
      );
    } else if (p05.some(f => sinTildes(f.servicio || '') === 'ninguno')) {
      decideRequisito(
        'op.nub.1.r1.2',
        p05.length === 1
          ? noAplica(`${etiqueta(context, 'P-05')} declara que no se utiliza ningún servicio en la nube de seguridad («ninguno»): R1.2 no aplica.`)
          : sinMedir(
              `${etiqueta(context, 'P-05')} mezcla «ninguno» con ${p05.length - 1} servicio(s) (${lista(p05.filter(f => sinTildes(f.servicio || '') !== 'ninguno').map(f => f.servicio))}): o una sola fila «ninguno», o los servicios de seguridad.`,
              'CONFIGURATION'
            ),
        [],
        'servicios de seguridad en P-05, o «ninguno»'
      );
    } else {
      const medida = seguridad(context, ahora, p05);

      decideRequisito('op.nub.1.r1.2', medida, [], 'verificación de op.pl.5 en vigor de cada servicio de seguridad (P-05)', medida.estado === 'CUMPLE');
    }
  }

  // --- op.nub.1.r2.1 · configuración del inquilino --------------------------
  if (aplica('op.nub.1.r2.1')) {
    const medida = ev02(context, ahora);

    decideRequisito('op.nub.1.r2.1', medida, ['EV-02'], 'EV-02 CUMPLE');
    decideEvidencia('op.nub.1.r2.1', 'EV-02', medida);
  }

  // Lo que el informe separa: el bloque documental y el técnico.
  const estadoDe = (ids: string[]) => {
    const suyas = ids.filter(id => medidas[id]).map(id => medidas[id]);

    return suyas.length ? peor(suyas) : 'NO_APLICA';
  };
  const describeBloque = (ids: string[]) =>
    ids
      .filter(id => medidas[id])
      .map(id => `${id} ${medidas[id].estado}`)
      .join(', ') || 'no aplica';
  const sinIntegrar = (() => {
    const integ = inv ? integraciones(context, todos) : undefined;

    return integ ? integ.sinIntegrar : [];
  })();

  const variables: ENSRuntimeVariable[] = [
    { name: 'posicion_P01', value: posicion, parameterIds: ['P-01'], evidenceIds: [], eventIds: [], description: `P-01 = ${posicion}` },
    {
      name: 'bloque_documental',
      value: estadoDe(['EV-08', 'EV-09']),
      parameterIds: ['P-03', 'P-04', 'P-08', 'P-09', 'P-10'],
      evidenceIds: ['EV-08', 'EV-09'],
      eventIds: [],
      description: `Documentación aportada, no verificada técnicamente: ${describeBloque(['EV-09', 'EV-08'])}.`,
    },
    {
      name: 'bloque_tecnico',
      value: estadoDe(['EV-01', 'EV-04', 'EV-07', 'EV-02']),
      parameterIds: ['P-06', 'P-07', 'P-11', 'P-13'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-07'],
      eventIds: [],
      description: `Medido en el manager de Wazuh: ${describeBloque(['EV-01', 'EV-04', 'EV-07', 'EV-02'])}.`,
    },
    {
      name: 'servicios_sin_integracion',
      value: sinIntegrar,
      parameterIds: ['P-02', 'P-06'],
      evidenceIds: ['EV-01'],
      eventIds: [],
      description: sinIntegrar.length
        ? `Servicios sin integración en Wazuh (hallazgo del informe, sin veredicto): ${sinIntegrar.join(', ')}.`
        : 'Todos los servicios declarados tienen integración en Wazuh, o P-06 no está declarado.',
    },
    {
      name: 'vigencias',
      value: vigencias,
      parameterIds: ['P-03', 'P-04'],
      evidenceIds: ['EV-08', 'EV-09'],
      eventIds: [],
      description: vigencias.length ? vigencias.join('; ') : 'Sin vigencias declaradas.',
    },
    ...Object.entries(medidas).map(([id, medida]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: medida.estado,
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: medida.motivo,
    })),
  ];

  return { decisions: [...requisitoDecisions, ...evidenciaDecisions], runtimeVariables: variables };
};

export const opNub1PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // Por categoría del sistema: base en las tres, R1 desde MEDIA, R2 solo en
  // ALTA. Qué requisitos son exigibles dentro del nivel lo decide P-01.
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
      evidenceIds: ['EV-01', 'EV-04', 'EV-07', 'EV-09'],
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
