// op.exp.4 · Mantenimiento y actualizaciones de seguridad
//
// Por qué este control tiene policy propia. Las siete primitivas contrastan UN
// hecho contra UN parámetro, y las preguntas centrales de op.exp.4 no caben en
// ninguna:
//
//   EV-02  la vulnerabilidad abierta se clasifica con P-08 (CVSS → criticidad)
//          y con ESO se busca su plazo en P-01 (criticidad → días), midiendo
//          contra el reloj. Dos tablas encadenadas y una resta con `now`.
//   EV-03  lo pendiente de seguridad y el reinicio pendiente se miden contra el
//          plazo MÁS LARGO de P-01, y lo observado desde la línea base es una
//          cota, no una antigüedad.
//   EV-05  una fecha de fin de soporte comparada con hoy, la más temprana entre
//          la declarada (P-05) y la del fabricante.
//   EV-07  cada cambio situado en las franjas horarias de P-04.
//   EV-09  el punto de reversión tiene que ser ANTERIOR al cambio (P-07).
//   EV-10  la tendencia de la deuda semana a semana.
//
// Lo que se juzga con primitivas se deja a las primitivas (EV-04, EV-06,
// EV-11) y aquí solo se LEE su resultado. op.exp.4.3 no tiene decisión: la
// resuelve EV-04 sola.
//
// Invariantes, las mismas que `evidence/judgment.ts`:
//   - el agente emite instantes, no edades: toda antigüedad se mide aquí
//     contra `context.now`, así que el mismo hecho envejece solo;
//   - sin hecho o sin parámetro, NO_EVALUABLE con motivo; nunca un CUMPLE por
//     ausencia salvo la aserción negativa de EV-07 con el latido confirmado;
//   - la policy nunca inventa política: ningún plazo, ventana ni fecha tiene
//     valor por defecto, salvo la escala CVSS de P-08, que la ficha del control
//     dice expresamente que se aplica si no se declara.
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
import type { ENSComplianceStatus } from '../../evaluation/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSControlParameter } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';

const CONTROL = 'op.exp.4';
const POLICY = 'policy.op.exp.4';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// Frescura de una instantánea. El puente y el recolector reemiten cada 24 h lo
// que no cambia y corren cada hora: 24 h + una pasada + margen. Es tolerancia
// de OBSERVACIÓN, no política: más ancha convertiría una instantánea vieja en
// la situación de hoy.
const FRESCURA_HORAS = 26;

// Mismo margen de reloj que `resolveCollectorCoverage`: un hecho del futuro no
// acredita nada.
const TOLERANCIA_FUTURO = 5 * 60 * 1000;

// Latido para la aserción negativa de EV-07, igual que en las primitivas.
const LATIDO_HORAS = 24;

type Medida = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;
  motivo: string;
};

const cumple = (motivo: string): Medida => ({ estado: 'CUMPLE', motivo });
const noCumple = (motivo: string): Medida => ({ estado: 'NO_CUMPLE', motivo });
const sinMedir = (motivo: string): Medida => ({ estado: 'NO_EVALUABLE', motivo });

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

// --- lectura de hechos -----------------------------------------------------

// El normalizador parte un evento con `evidence_id=EV-02,EV-10` en uno por
// evidencia (`<id>#EV-02`, `<id>#EV-10`). Aquí se juzga el HECHO, así que se
// cuenta una vez.
const hechos = (
  context: ENSPolicyContext,
  tipo: string
): ENSNormalizedEvent[] => {
  const vistos = new Set<string>();

  return context.events.filter(event => {
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

// Los números llegan como texto desde `alerts.json`.
const numero = (texto: string): number | undefined => {
  if (!/^-?\d+(\.\d+)?$/.test(texto)) {
    return undefined;
  }

  const valor = Number(texto);

  return Number.isFinite(valor) ? valor : undefined;
};

const instante = (texto: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(texto)) {
    return undefined;
  }

  const valor = new Date(texto).getTime();

  return Number.isFinite(valor) ? valor : undefined;
};

const dias = (ms: number): string => (ms / DIA).toFixed(1);

const sinTildes = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const lista = (elementos: string[], maximo = 5): string =>
  elementos.length > maximo
    ? `${elementos.slice(0, maximo).join('; ')} y ${elementos.length - maximo} más`
    : elementos.join('; ');

// --- lectura de parámetros -------------------------------------------------

const parametro = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

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

// La fila del sistema: la del nombre del agente o, si no tiene, la de «*».
const filaDelSistema = (
  tabla: Record<string, string>[],
  columna: string,
  agente: string | undefined
): Record<string, string> | undefined =>
  tabla.find(f => agente && f[columna].toLowerCase() === agente.toLowerCase()) ||
  tabla.find(f => f[columna] === '*');

const nombreDelAgente = (context: ENSPolicyContext): string | undefined =>
  context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName;

// --- P-01 y P-08 -----------------------------------------------------------

type Plazos = {
  porCriticidad: Map<string, number | null>;
  masLargo?: number;
};

const CRITICIDADES = ['critica', 'alta', 'media', 'baja'];
const SIN_PUNTUACION = 'sin puntuacion';

const NOMBRE: Record<string, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
  [SIN_PUNTUACION]: 'Sin puntuación',
};

// P-01: celda de días vacía = «sin plazo» (null), decisión escrita; una
// criticidad sin fila no está decidida y no aparece en el mapa.
const plazos = (context: ENSPolicyContext): Plazos | undefined => {
  const tabla = filas(context, 'P-01');

  if (!tabla) {
    return undefined;
  }

  const porCriticidad = new Map<string, number | null>();

  tabla.forEach(fila => {
    const clave = sinTildes(fila.criticidad);

    if (![...CRITICIDADES, SIN_PUNTUACION].includes(clave)) {
      return;
    }

    if (!fila.dias) {
      porCriticidad.set(clave, null);

      return;
    }

    const valor = numero(fila.dias.replace(',', '.'));

    if (valor !== undefined && valor >= 0) {
      porCriticidad.set(clave, valor);
    }
  });

  const numericos = Array.from(porCriticidad.values()).filter(
    (v): v is number => typeof v === 'number'
  );

  if (!porCriticidad.size) {
    return undefined;
  }

  return {
    porCriticidad,
    masLargo: numericos.length ? Math.max(...numericos) : undefined,
  };
};

// Escala cualitativa de CVSS v3.1 (FIRST). Solo se usa si P-08 no se declara,
// porque así lo dice la ficha del control.
const ESCALA_FIRST: [string, number][] = [
  ['critica', 9.0],
  ['alta', 7.0],
  ['media', 4.0],
  ['baja', 0.1],
];

const escalaCvss = (
  context: ENSPolicyContext
): { umbrales: [string, number][]; declarada: boolean } => {
  const tabla = filas(context, 'P-08');
  const umbrales: [string, number][] = [];

  (tabla || []).forEach(fila => {
    const clave = sinTildes(fila.criticidad);
    const minimo = numero((fila.cvss_minimo || '').replace(',', '.'));

    if (CRITICIDADES.includes(clave) && minimo !== undefined) {
      umbrales.push([clave, minimo]);
    }
  });

  return umbrales.length
    ? { umbrales: umbrales.sort((a, b) => b[1] - a[1]), declarada: true }
    : { umbrales: ESCALA_FIRST, declarada: false };
};

const clasifica = (
  cvss: string,
  umbrales: [string, number][]
): string | undefined => {
  if (cvss === '-' || cvss === '') {
    return SIN_PUNTUACION;
  }

  const valor = numero(cvss);

  if (valor === undefined) {
    return undefined;
  }

  // Una puntuación 0,0 no tiene gravedad en CVSS, pero sigue siendo una CVE
  // abierta: se trata como la criticidad más baja declarada.
  return (
    umbrales.find(([, minimo]) => valor >= minimo)?.[0] ||
    (valor === 0 ? umbrales[umbrales.length - 1]?.[0] : undefined)
  );
};

// --- la instantánea del Vulnerability Detector ----------------------------

type Instantanea = {
  momento: number;
  texto: string;
  cabecera: ENSNormalizedEvent;
  abiertas: ENSNormalizedEvent[];
};

// La cabecera más reciente y sus filas. Una instantánea con menos filas de las
// que declara no está completa: juzgarla sería juzgar una muestra.
const instantanea = (
  context: ENSPolicyContext,
  ahora: number
): Instantanea | Medida => {
  const cabeceras = hechos(context, 'vulnerability_inventory')
    .map(e => ({ e, t: instante(campo(e, 'instantanea')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO
    )
    .sort((a, b) => b.t - a.t);

  if (!cabeceras.length) {
    return sinMedir(
      'No consta ningún inventario del Vulnerability Detector para esta máquina: el puente del manager (ens_opexp4_vd_bridge.py) no ha entregado ninguna instantánea, o la respuesta activa no está habilitada en el agente.'
    );
  }

  const { e: cabecera, t } = cabeceras[0];
  const edad = ahora - t;

  if (edad > FRESCURA_HORAS * HORA) {
    return sinMedir(
      `La instantánea más reciente del Vulnerability Detector es de ${campo(cabecera, 'instantanea')} (hace ${(edad / HORA).toFixed(1)} h, más de ${FRESCURA_HORAS} h): no describe la situación de hoy.`
    );
  }

  const texto = campo(cabecera, 'instantanea');
  const porPuntuacion = new Map<string, ENSNormalizedEvent>();

  hechos(context, 'vulnerability_open')
    .filter(e => campo(e, 'instantanea') === texto)
    .forEach(e => porPuntuacion.set(campo(e, 'cvss'), e));

  const declaradas = numero(campo(cabecera, 'puntuaciones'));

  if (declaradas === undefined || porPuntuacion.size < declaradas) {
    return sinMedir(
      `La instantánea ${texto} declara ${campo(cabecera, 'puntuaciones') || '?'} puntuaciones CVSS con vulnerabilidades abiertas y solo han llegado ${porPuntuacion.size}: está incompleta y no se juzga sobre una parte.`
    );
  }

  return {
    momento: t,
    texto,
    cabecera,
    abiertas: Array.from(porPuntuacion.values()),
  };
};

const esMedida = (x: Instantanea | Medida): x is Medida =>
  (x as Medida).estado !== undefined;

// --- las evidencias --------------------------------------------------------

const ev01 = (context: ENSPolicyContext, ahora: number): Medida => {
  const foto = instantanea(context, ahora);

  if (esMedida(foto)) {
    return foto;
  }

  return cumple(
    `Inventario de vulnerabilidades vigente: instantánea del ${foto.texto} con ${campo(foto.cabecera, 'abiertas')} CVE abiertas (${campo(foto.cabecera, 'sin_puntuacion') || '0'} sin puntuación CVSS), leída del estado del Vulnerability Detector.`
  );
};

const ev02 = (context: ENSPolicyContext, ahora: number): Medida => {
  const foto = instantanea(context, ahora);

  if (esMedida(foto)) {
    return foto;
  }

  const p01 = plazos(context);

  if (!p01) {
    return sinMedir(
      `${etiqueta(context, 'P-01')} está sin configurar: hay ${campo(foto.cabecera, 'abiertas')} vulnerabilidades abiertas y no hay plazo contra el que juzgar si la reacción es tardía.`
    );
  }

  const { umbrales, declarada } = escalaCvss(context);
  const fueraDePlazo: { texto: string; exceso: number }[] = [];
  const sinDecidir: string[] = [];
  const sinPlazo: string[] = [];

  foto.abiertas.forEach(e => {
    const cvss = campo(e, 'cvss');
    const criticidad = clasifica(cvss, umbrales);
    const detectada = instante(campo(e, 'detectada'));
    const cve = campo(e, 'cve');
    const cuantas = campo(e, 'abiertas') || '1';

    if (!criticidad) {
      sinDecidir.push(`CVSS ${cvss}: ${declarada ? 'P-08' : 'la escala CVSS'} no le da criticidad`);

      return;
    }

    if (!p01.porCriticidad.has(criticidad)) {
      sinDecidir.push(`${cuantas} con CVSS ${cvss} (${NOMBRE[criticidad]}): P-01 no tiene fila para esa criticidad`);

      return;
    }

    const plazo = p01.porCriticidad.get(criticidad);

    if (plazo === null || plazo === undefined) {
      sinPlazo.push(`${NOMBRE[criticidad]} (CVSS ${cvss})`);

      return;
    }

    if (detectada === undefined) {
      sinDecidir.push(`${cve}: sin instante de detección legible`);

      return;
    }

    const abierta = ahora - detectada;

    if (abierta > plazo * DIA) {
      fueraDePlazo.push({
        exceso: abierta - plazo * DIA,
        texto: `${cve} (CVSS ${cvss}, ${NOMBRE[criticidad]}) abierta desde ${campo(e, 'detectada')}: ${dias(abierta)} días con plazo de ${plazo}${Number(cuantas) > 1 ? `; es la más antigua de ${cuantas} con esa puntuación` : ''}`,
      });
    }
  });

  // Las resueltas de la ventana: dato para el auditor, no veredicto. La ficha
  // juzga lo que SIGUE abierto fuera de plazo.
  const resueltas = hechos(context, 'vulnerability_resolved');
  const resumenResueltas = resueltas.length
    ? ` En la ventana constan ${resueltas.length} CVE resueltas.`
    : '';

  const escala = declarada
    ? ''
    : ' P-08 no está declarado: se ha aplicado la escala cualitativa de CVSS v3.1 (FIRST), como indica la ficha del control.';

  if (fueraDePlazo.length) {
    fueraDePlazo.sort((a, b) => b.exceso - a.exceso);

    return noCumple(
      `Vulnerabilidades abiertas fuera del plazo de su criticidad en P-01 (instantánea ${foto.texto}): ${lista(fueraDePlazo.map(f => f.texto))}.${escala}${resumenResueltas}`
    );
  }

  if (sinDecidir.length) {
    return sinMedir(
      `No se puede juzgar todo lo abierto: ${lista(sinDecidir)}. Declara la criticidad que falta en P-01 (y en P-08 si hace falta).${escala}`
    );
  }

  return cumple(
    `Ninguna de las ${campo(foto.cabecera, 'abiertas')} vulnerabilidades abiertas (instantánea ${foto.texto}) supera el plazo de su criticidad en P-01.${sinPlazo.length ? ` Sin plazo declarado, y por tanto sin juzgar: ${Array.from(new Set(sinPlazo)).join(', ')}.` : ''}${escala}${resumenResueltas}`
  );
};

// Una foto de parcheado de UN plano. En un servidor corriente solo hay el plano
// `sistema`; en un servidor de directorio llega además la del `directorio`
// (los parches de Zimbra, que no pasan por el bolsillo de seguridad de Ubuntu).
const ev03Plano = (
  context: ENSPolicyContext,
  ahora: number,
  delPlano: ENSNormalizedEvent[],
  plano: string
): Medida => {
  const fotos = delPlano
    .map(e => ({ e, t: instante(e.timestamp) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO)
    .sort((a, b) => b.t - a.t);

  if (!fotos.length || ahora - fotos[0].t > FRESCURA_HORAS * HORA) {
    return sinMedir(
      fotos.length
        ? `El último estado de parcheado del plano ${plano} es de ${fotos[0].e.timestamp}, más de ${FRESCURA_HORAS} h: el recolector no está informando.`
        : 'No consta ningún estado de parcheado de esta máquina: el recolector de op.exp.4 no está desplegado o no informa.'
    );
  }

  const foto = fotos[0].e;
  const p01 = plazos(context);

  if (!p01 || p01.masLargo === undefined) {
    return sinMedir(
      `${etiqueta(context, 'P-01')} no declara ningún plazo en días: no hay contra qué medir lo que lleva pendiente la máquina.`
    );
  }

  const plazo = p01.masLargo * DIA;
  const hallazgos: string[] = [];
  const cotas: string[] = [];

  const indice = instante(campo(foto, 'indice_paquetes'));

  if (indice === undefined || ahora - indice > plazo) {
    return sinMedir(
      `El índice de paquetes de la máquina ${indice === undefined ? 'no tiene fecha legible' : `no se actualiza desde ${campo(foto, 'indice_paquetes')}`}: con un índice más viejo que el plazo más largo de P-01 (${p01.masLargo} días), «pendientes» no significa nada.`
    );
  }

  const pendientes = numero(campo(foto, 'seguridad_pendientes')) || 0;
  const que =
    campo(foto, 'ambito_pendientes') === 'parches_zimbra'
      ? 'parche(s) de Zimbra'
      : 'actualización(es) de seguridad';

  if (pendientes > 0) {
    const desde = instante(campo(foto, 'seguridad_pendiente_desde'));
    const base = instante(campo(foto, 'linea_base'));

    if (desde !== undefined && ahora - desde > plazo) {
      hallazgos.push(
        `${pendientes} ${que} pendiente(s) desde ${campo(foto, 'seguridad_pendiente_desde')} (${dias(ahora - desde)} días), más que el plazo más largo de P-01 (${p01.masLargo} días)`
      );
    } else if (
      campo(foto, 'desde_linea_base') === 'si' &&
      base !== undefined &&
      ahora - base <= plazo
    ) {
      cotas.push(
        `${pendientes} ${que} ya estaban pendientes cuando el recolector empezó a observar (${campo(foto, 'linea_base')}): su antigüedad real no se conoce hasta que la observación cubra ${p01.masLargo} días`
      );
    }
  }

  if (campo(foto, 'reinicio_pendiente') === 'si') {
    const desde = instante(campo(foto, 'reinicio_pendiente_desde'));

    if (desde !== undefined && ahora - desde > plazo) {
      hallazgos.push(
        `parches instalados sin activar: reinicio pendiente desde ${campo(foto, 'reinicio_pendiente_desde')} (${dias(ahora - desde)} días, plazo más largo de P-01 ${p01.masLargo}) por ${campo(foto, 'paquetes_que_piden_reinicio') || 'paquetes sin identificar'}`
      );
    } else if (campo(foto, 'reinicio_desde_aproximado') === 'si') {
      cotas.push(
        `reinicio pendiente de fecha aproximada (${campo(foto, 'reinicio_pendiente_desde')}): no se puede afirmar que esté en plazo`
      );
    }
  }

  const resumen = `plano ${plano}: ${campo(foto, 'actualizaciones_pendientes') || '0'} actualizaciones pendientes, ${pendientes} de seguridad; actualizaciones automáticas ${campo(foto, 'actualizaciones_automaticas') || 'sin dato'}; última actualización aplicada ${campo(foto, 'ultima_actualizacion') || 'sin dato'}`;

  if (hallazgos.length) {
    return noCumple(`Mantenimiento atrasado: ${lista(hallazgos)}. (${resumen}.)`);
  }

  if (cotas.length) {
    return sinMedir(`${lista(cotas)}. (${resumen}.)`);
  }

  return cumple(`Nada pendiente más allá del plazo más largo de P-01 (${p01.masLargo} días): ${resumen}.`);
};

const ev03 = (context: ENSPolicyContext, ahora: number): Medida => {
  const porPlano = new Map<string, ENSNormalizedEvent[]>();

  hechos(context, 'patch_status').forEach(e => {
    const plano = campo(e, 'plano') || 'sistema';
    porPlano.set(plano, [...(porPlano.get(plano) || []), e]);
  });

  // El plano `sistema` se exige siempre: una foto del directorio sola no dice
  // nada del Ubuntu que lo sirve.
  if (!porPlano.has('sistema')) {
    porPlano.set('sistema', []);
  }

  const medidas = Array.from(porPlano.entries()).map(([plano, fotos]) =>
    ev03Plano(context, ahora, fotos, plano)
  );

  const estado = peor(medidas);

  return {
    estado,
    motivo: medidas.map(m => m.motivo).join(' | '),
  };
};

const ev05 = (context: ENSPolicyContext, ahora: number): Medida => {
  const ultimos = new Map<string, ENSNormalizedEvent>();

  hechos(context, 'product_support')
    .sort((a, b) => (instante(a.timestamp) || 0) - (instante(b.timestamp) || 0))
    .forEach(e => ultimos.set(`${campo(e, 'producto')}|${campo(e, 'version')}`, e));

  if (!ultimos.size) {
    return sinMedir('No consta ningún producto informado por el recolector: no se sabe qué soporte tiene lo instalado.');
  }

  const tabla = filas(context, 'P-05') || [];
  const vencidos: string[] = [];
  const sinFecha: string[] = [];
  const proximos: string[] = [];
  const vigentes: string[] = [];

  ultimos.forEach(e => {
    const producto = campo(e, 'producto');
    const version = campo(e, 'version');
    const nombre = `${producto} ${version}`.trim();

    const fila = tabla.find(
      f =>
        f.producto.toLowerCase() === producto.toLowerCase() &&
        (!f.version || version.startsWith(f.version))
    );

    const ampliado = campo(e, 'soporte_ampliado') === 'enabled';
    const delFabricante = instante(
      campo(e, ampliado ? 'fin_soporte_ampliado' : 'fin_soporte_estandar')
    );
    const declarada = fila?.eol ? instante(fila.eol) : undefined;

    const fechas = [delFabricante, declarada].filter((t): t is number => t !== undefined);

    if (!fechas.length || (!fila && (delFabricante === undefined || delFabricante > ahora))) {
      sinFecha.push(
        fila
          ? `${nombre}: la fila de P-05 no trae fecha y el fabricante no la publica en la máquina`
          : `${nombre}: no figura en P-05`
      );

      return;
    }

    const efectiva = Math.min(...fechas);
    const fecha = new Date(efectiva).toISOString().slice(0, 10);
    const origen =
      delFabricante === efectiva && declarada !== efectiva
        ? `fabricante${ampliado ? ', soporte ampliado' : ''}`
        : 'P-05';

    if (efectiva <= ahora) {
      vencidos.push(`${nombre} sin soporte desde ${fecha} (${origen})`);
    } else if (efectiva - ahora <= 365 * DIA) {
      proximos.push(`${nombre} pierde el soporte el ${fecha} (${origen})`);
    } else {
      vigentes.push(`${nombre} hasta ${fecha} (${origen})`);
    }
  });

  if (vencidos.length) {
    return noCumple(`Software fuera del soporte del fabricante: ${lista(vencidos)}.`);
  }

  if (sinFecha.length) {
    return sinMedir(`No se conoce el fin de soporte de: ${lista(sinFecha)}. Declara su fecha en P-05.`);
  }

  return cumple(
    `Todo lo informado está en soporte: ${lista(vigentes.concat(proximos))}.${proximos.length ? ` Próximos a perderlo en doce meses: ${lista(proximos)}.` : ''}`
  );
};

// P-04: «días HH:MM-HH:MM», tramos separados por «;». Minutos de la semana
// empezando en lunes 00:00.
const DIAS_SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
const SEMANA = 7 * 24 * 60;

const diasDe = (texto: string): number[] | undefined => {
  const t = sinTildes(texto).replace(/\s+/g, '');

  if (['*', 'todos', 'diario', 'cualquierdia'].includes(t)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  const resultado: number[] = [];

  for (const parte of t.split(',')) {
    const rango = parte.split('-');
    const ini = DIAS_SEMANA.indexOf(rango[0].slice(0, 3));
    const fin = DIAS_SEMANA.indexOf((rango[1] || rango[0]).slice(0, 3));

    if (ini < 0 || fin < 0 || rango.length > 2) {
      return undefined;
    }

    for (let d = ini; ; d = (d + 1) % 7) {
      resultado.push(d);

      if (d === fin) {
        break;
      }
    }
  }

  return resultado;
};

const tramos = (ventana: string): [number, number][] | undefined => {
  const resultado: [number, number][] = [];

  for (const tramo of ventana.split(';').map(t => t.trim()).filter(Boolean)) {
    const m = tramo.match(/^(.+?)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);

    if (!m) {
      return undefined;
    }

    const lista = diasDe(m[1]);
    const ini = Number(m[2]) * 60 + Number(m[3]);
    let fin = Number(m[4]) * 60 + Number(m[5]);

    if (!lista || ini >= 24 * 60 || fin > 24 * 60) {
      return undefined;
    }

    if (fin <= ini) {
      fin += 24 * 60;
    }

    lista.forEach(d => resultado.push([d * 24 * 60 + ini, d * 24 * 60 + fin]));
  }

  return resultado.length ? resultado : undefined;
};

// Minuto de la semana del INICIO del cambio en la hora local de la máquina, que
// es la que viaja escrita en el propio instante.
const minutoLocal = (iso: string): number | undefined => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);

  if (!m) {
    return undefined;
  }

  const diaSemana = (new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() + 6) % 7;

  return diaSemana * 24 * 60 + Number(m[4]) * 60 + Number(m[5]);
};

const dentro = (minuto: number, intervalos: [number, number][]): boolean =>
  intervalos.some(
    ([ini, fin]) =>
      (minuto >= ini && minuto < fin) ||
      (minuto + SEMANA >= ini && minuto + SEMANA < fin)
  );

const latidoConfirma = (
  context: ENSPolicyContext,
  evidencia: string,
  ahora: number
): boolean => {
  const latido = hechos(context, 'collector_run')
    .map(e => ({ e, t: instante(e.timestamp) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= ahora + TOLERANCIA_FUTURO && ahora - x.t <= LATIDO_HORAS * HORA
    )
    .sort((a, b) => b.t - a.t)[0];

  return Boolean(
    latido &&
      campo(latido.e, 'resultado') === 'completada' &&
      campo(latido.e, 'evidencias_cubiertas').split(',').map(s => s.trim()).includes(evidencia)
  );
};

const ev07 = (context: ENSPolicyContext, ahora: number): Medida => {
  const tabla = filas(context, 'P-04');

  if (!tabla) {
    return sinMedir(`${etiqueta(context, 'P-04')} está sin configurar: no hay franjas contra las que situar los cambios.`);
  }

  const agente = nombreDelAgente(context);
  const fila = filaDelSistema(tabla, 'sistema', agente);

  if (!fila) {
    return sinMedir(`P-04 no tiene fila para ${agente || 'esta máquina'} ni una fila «*».`);
  }

  const intervalos = tramos(fila.ventana);

  if (!intervalos) {
    return sinMedir(`La ventana «${fila.ventana}» de P-04 no se entiende: se esperan tramos como «sab 22:00-02:00» o «* 06:00-07:30», separados por «;».`);
  }

  const cambios = hechos(context, 'package_changed');

  if (!cambios.length) {
    return latidoConfirma(context, 'EV-07', ahora)
      ? cumple('No ha habido cambios de software en la ventana evaluada, y consta que el recolector leyó los logs de apt y dpkg.')
      : sinMedir('No consta ningún cambio de software ni un latido reciente del recolector que declare haber leído los logs: el silencio no acredita nada.');
  }

  const fuera: string[] = [];
  let ilegibles = 0;

  cambios.forEach(e => {
    const minuto = minutoLocal(campo(e, 'inicio'));

    if (minuto === undefined) {
      ilegibles += 1;

      return;
    }

    if (!dentro(minuto, intervalos)) {
      fuera.push(`${campo(e, 'inicio')} por ${campo(e, 'actor') || '?'} (${campo(e, 'mecanismo') || '?'})`);
    }
  });

  if (fuera.length) {
    return noCumple(`Cambios de software fuera de la ventana «${fila.ventana}» de P-04: ${lista(fuera)}.`);
  }

  if (ilegibles) {
    return sinMedir(`${ilegibles} cambio(s) sin instante de inicio legible: no se puede afirmar que todos estén en ventana.`);
  }

  return cumple(`Los ${cambios.length} cambios de software de la ventana evaluada empezaron dentro de «${fila.ventana}».`);
};

const ev08 = (context: ENSPolicyContext): Medida => {
  if (!filas(context, 'P-06')) {
    return sinMedir(`${etiqueta(context, 'P-06')} está sin configurar: no hay ningún entorno de preproducción declarado para esta máquina.`);
  }

  return sinMedir(
    'P-06 declara la preproducción, pero demostrar que cada versión pasó ANTES por ella exige cruzar los cambios de software de las dos máquinas, y el motor evalúa cada máquina por separado. R1 queda sin demostrar hasta que la consolidación entre máquinas lo soporte.'
  );
};

const MECANISMOS_LOCALES = ['lvm', 'zfs', 'btrfs'];

const ev09 = (context: ENSPolicyContext): Medida => {
  const tabla = filas(context, 'P-07');

  if (!tabla) {
    return sinMedir(`${etiqueta(context, 'P-07')} está sin configurar: no se ha previsto ningún mecanismo de reversión.`);
  }

  const agente = nombreDelAgente(context);
  const fila = filaDelSistema(tabla, 'sistema', agente);

  if (!fila) {
    return sinMedir(`P-07 no tiene fila para ${agente || 'esta máquina'} ni una fila «*».`);
  }

  const mecanismo = fila.mecanismo.toLowerCase();

  if (!MECANISMOS_LOCALES.includes(mecanismo)) {
    return sinMedir(
      `El mecanismo declarado en P-07 («${fila.mecanismo}») no deja huella en la máquina: un snapshot de hipervisor o una copia externa no los observa este control, y no se simulan.`
    );
  }

  const ventana = numero((fila.ventana_horas || '').replace(',', '.'));

  if (ventana === undefined || ventana <= 0) {
    return sinMedir(`La ventana previa de P-07 («${fila.ventana_horas}») no es un número de horas utilizable.`);
  }

  const cambios = hechos(context, 'package_changed');

  if (!cambios.length) {
    return sinMedir('No ha habido cambios de software en la ventana evaluada: no hay ningún punto de reversión que exigir ni que demostrar.');
  }

  const degradado = context.events.find(
    e => e.controlId === CONTROL && e.eventType === 'evidence_state' && e.evidenceId === 'EV-09'
  );

  const puntos = hechos(context, 'reversion_point_created')
    .filter(e => campo(e, 'mecanismo').toLowerCase() === mecanismo)
    .map(e => instante(campo(e, 'creado')))
    .filter((t): t is number => t !== undefined);

  const sinPunto: string[] = [];

  cambios.forEach(e => {
    const inicio = instante(campo(e, 'inicio'));

    if (inicio === undefined) {
      sinPunto.push(`cambio sin instante legible (${campo(e, 'inicio')})`);

      return;
    }

    if (!puntos.some(t => t <= inicio && inicio - t <= ventana * HORA)) {
      sinPunto.push(`${campo(e, 'inicio')} (${campo(e, 'actor') || '?'})`);
    }
  });

  if (!puntos.length && degradado) {
    return sinMedir(`El recolector no ha podido observar puntos de reversión: ${campo(degradado, 'motivo')}.`);
  }

  if (sinPunto.length) {
    return noCumple(
      `Cambios de software sin punto de reversión ${fila.mecanismo} en las ${ventana} h previas: ${lista(sinPunto)}.`
    );
  }

  return cumple(`Los ${cambios.length} cambios de software tenían un punto de reversión ${fila.mecanismo} en las ${ventana} h previas.`);
};

const ev10 = (context: ENSPolicyContext, ahora: number): Medida => {
  // Última cabecera de cada una de las semanas anteriores a `ahora`.
  const semanas = new Map<number, { t: number; abiertas: number }>();

  hechos(context, 'vulnerability_inventory').forEach(e => {
    const t = instante(campo(e, 'instantanea'));
    const abiertas = numero(campo(e, 'abiertas'));

    if (t === undefined || abiertas === undefined || t > ahora + TOLERANCIA_FUTURO) {
      return;
    }

    const semana = Math.floor((ahora - t) / (7 * DIA));
    const actual = semanas.get(semana);

    if (!actual || t > actual.t) {
      semanas.set(semana, { t, abiertas });
    }
  });

  const serie = [2, 1, 0].map(s => semanas.get(s));

  if (serie.some(punto => !punto)) {
    return sinMedir(
      `La serie del inventario de vulnerabilidades no cubre las tres últimas semanas (hay ${semanas.size} semana(s) con instantánea): todavía no se puede hablar de tendencia.`
    );
  }

  const [hace2, hace1, ahoraMismo] = serie as { t: number; abiertas: number }[];
  const texto = `${hace2.abiertas} → ${hace1.abiertas} → ${ahoraMismo.abiertas} CVE abiertas en las tres últimas semanas`;

  if (hace2.abiertas < hace1.abiertas && hace1.abiertas < ahoraMismo.abiertas) {
    return noCumple(`La deuda de vulnerabilidades crece de forma sostenida: ${texto}.`);
  }

  return cumple(`La deuda de vulnerabilidades no crece de forma sostenida: ${texto}.`);
};

// --- decisiones ------------------------------------------------------------

type Evidencias = Record<string, Medida>;

// La medida de una evidencia juzgada por primitiva, tal como la dejó su
// primitiva. Aquí no se re-juzga.
const deLaPrimitiva = (context: ENSPolicyContext, id: string): Medida => {
  const evidencia = context.evidences.find(e => e.id === id);
  const estado = evidencia?.status;
  const motivo = evidencia?.observations?.filter(o => !o.startsWith('Pregunta de auditoría')).slice(1).join(' ') || '';

  if (estado === 'CUMPLE') return cumple(motivo);
  if (estado === 'NO_CUMPLE' || estado === 'PARCIAL') return noCumple(motivo);

  return sinMedir(motivo || `${id} no se ha podido medir.`);
};

const REQUISITOS: Record<string, { evidencias: string[]; parametros: string[]; tipo: ENSPolicyDecision['trace']['ruleType'] }> = {
  'op.exp.4.1': { evidencias: ['EV-01', 'EV-03', 'EV-05', 'EV-06'], parametros: ['P-01', 'P-03', 'P-05'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.4.2': { evidencias: ['EV-01', 'EV-02', 'EV-03', 'EV-07', 'EV-10'], parametros: ['P-01', 'P-04', 'P-08'], tipo: 'MAX_AGE' },
  'op.exp.4.r1.1': { evidencias: ['EV-08'], parametros: ['P-06'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.4.r2.1': { evidencias: ['EV-09'], parametros: ['P-07'], tipo: 'CONDITIONAL_REQUIRED' },
  'op.exp.4.r4.1': { evidencias: ['EV-01', 'EV-10'], parametros: [], tipo: 'COVERAGE_REQUIRED' },
};

const decide = (
  requisito: string,
  estado: Medida['estado'],
  evidencias: string[],
  parametros: string[],
  tipo: ENSPolicyDecision['trace']['ruleType'],
  ruleId: string,
  motivo: string,
  esperado: string
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
});

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();

  const medidas: Evidencias = {
    'EV-01': ev01(context, ahora),
    'EV-02': ev02(context, ahora),
    'EV-03': ev03(context, ahora),
    'EV-05': ev05(context, ahora),
    'EV-06': deLaPrimitiva(context, 'EV-06'),
    'EV-07': ev07(context, ahora),
    'EV-08': ev08(context),
    'EV-09': ev09(context),
    'EV-10': ev10(context, ahora),
  };

  const decisions: ENSPolicyDecision[] = [];

  Object.entries(REQUISITOS).forEach(([requisito, { evidencias, parametros, tipo }]) => {
    const propias = evidencias.map(id => ({ id, medida: medidas[id] }));
    const estado = peor(propias.map(p => p.medida));

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`
    // (`find` devuelve la primera). Nombra solo las evidencias que la
    // sostienen, para que el puente no pinte una evidencia sana con el color de
    // otra.
    const responsables = propias.filter(p => p.medida.estado === estado);

    decisions.push(
      conPartes(decide(
        requisito,
        estado,
        responsables.map(p => p.id),
        parametros,
        tipo,
        requisito,
        motivoCompuesto(propias),
        evidencias.map(id => `${id} CUMPLE`).join(' y ')
      ), partesDe(propias))
    );

    // Y una por evidencia medida aquí, con SU estado, para que la tabla de
    // evidencias diga lo que se midió de cada una y no el agregado. Las de
    // primitiva (EV-06) ya tienen su veredicto y no se repiten.
    propias
      .filter(p => p.id !== 'EV-06')
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
            `${p.id} CUMPLE`
          )
        )
      );
  });

  const variables: ENSRuntimeVariable[] = Object.entries(medidas).map(([id, medida]) => ({
    name: `medida_${id.replace('-', '')}`,
    value: medida.estado,
    parameterIds: [],
    evidenceIds: [id],
    eventIds: [],
    description: medida.motivo,
  }));

  return { decisions, runtimeVariables: variables };
};

export const opExp4PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.exp.4.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03', 'P-05'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-05', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.4.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-04', 'P-08'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-07', 'EV-10'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.4.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-04'],
      ruleType: 'WHITELIST',
    },
    {
      // Refuerzo acumulativo: MEDIA «+ R1», ALTA «+ R1 + R2».
      requirementId: 'op.exp.4.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.4.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    // R3 y R4 los define el ENS pero no los exige en ninguna categoría: sin
    // niveles, el motor los evalúa NO_APLICA.
    {
      requirementId: 'op.exp.4.r3.1',
      levels: [],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-11'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.4.r4.1',
      levels: [],
      parameterIds: [],
      evidenceIds: ['EV-01', 'EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
