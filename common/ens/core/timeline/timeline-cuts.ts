// Los cortes de la serie diaria: qué días tienen punto, contra qué instante se
// evalúa cada uno y con qué eventos.
//
// Vive aparte de `compliance-timeline.ts` y sin importar el motor a propósito.
// El motor arrastra `configuration/services` y con él `kibana-services`, que
// solo existe en el árbol del plugin `main` de Wazuh: cualquier fichero que lo
// importe deja de poder probarse fuera de ese árbol. Aquí está toda la lógica
// que puede equivocarse —el reparto por días, el acumulado, el origen de la
// serie— y aquí es donde se prueba.
//
// Las tres decisiones que definen qué significa un punto:
//
//   1. Los eventos son ACUMULADOS hasta el corte, no los del día suelto. El
//      cumplimiento es un estado, no un caudal: la evidencia de anteayer sigue
//      siendo lo último que se sabe de esa máquina hasta que llegue otra. Que
//      caduque es asunto de la ventana del recolector, que es para lo que
//      existe.
//
//   2. Cada punto se evalúa contra SU corte, no contra hoy. Sin esto todas las
//      ventanas de cobertura se medirían contra el presente y el histórico
//      entero saldría vencido: una línea que baja hacia el pasado por el mero
//      hecho de que el pasado es viejo.
//
//   3. Un día ANTERIOR al primer evento no produce punto. Con cero eventos el
//      motor devuelve los tres controles NO_EVALUABLE, que es un 0 % legítimo
//      como veredicto y una mentira como histórico: dibujaría a la máquina
//      incumpliendo antes de que nadie la mirase.
import type { ENSNormalizedEvent } from '../data-source/types';

export interface ENSTimelineCut {
  // Inicio del día que representa el punto.
  day: Date;
  label: string;
  // El instante al que se evalúa: el final del día, o AHORA para el último.
  cutoff: Date;
  isCurrent: boolean;
  // Todo lo conocido hasta el corte.
  events: ENSNormalizedEvent[];
}

export interface ENSTimelineCutsOptions {
  // Cuántos días como máximo. Cada corte es una pasada completa del motor.
  days?: number;
  now?: Date;
  // Zona horaria de los días (IANA, «Europe/Madrid»). Sin ella, la del
  // proceso: en el navegador es la de quien mira. El servidor la recibe del
  // navegador para que los días del gráfico sean los mismos.
  timeZone?: string;
  // El presupuesto de la serie (ver `pasoQueCabe`). El servidor lo quita
  // (`Infinity`): calcula los días pasados una vez y los guarda.
  maxEvaluatedEvents?: number;
}

const DEFAULT_DAYS = 7;

export const startOfDay = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  return start;
};

const endOfDay = (date: Date): Date => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return end;
};

const addDays = (date: Date, days: number): Date => {
  const moved = new Date(date);
  moved.setDate(moved.getDate() + days);

  return moved;
};

// `dd/mm` a mano y no con `toLocaleDateString`: el formateo por locale depende
// del ICU del runtime, y el mismo día sale `03/08` en un navegador y `3/8` en
// otro. En un eje de siete etiquetas eso descuadra la línea.
const labelOf = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${day}/${month}`;
};

// Los días del calendario de una zona horaria concreta. El servidor no puede
// usar la zona del proceso: la de quien mira es la que dice qué es «hoy».
interface ENSTimelineCalendar {
  startOfDay(date: Date): Date;
  endOfDay(date: Date): Date;
  addDays(date: Date, days: number): Date;
  label(date: Date): string;
}

const localCalendar: ENSTimelineCalendar = {
  startOfDay,
  endOfDay,
  addDays,
  label: labelOf,
};

const zonedParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const valor = (tipo: string) => Number(parts.find(p => p.type === tipo)?.value);

  return {
    year: valor('year'),
    month: valor('month'),
    day: valor('day'),
    hour: valor('hour'),
    minute: valor('minute'),
    second: valor('second'),
  };
};

// Desfase de la zona en ese instante (ms que hay que sumar a UTC).
const zoneOffset = (date: Date, timeZone: string): number => {
  const p = zonedParts(date, timeZone);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

  return comoUtc - (date.getTime() - date.getMilliseconds());
};

// La medianoche local de un día del calendario (año, mes, día) de la zona.
const zonedMidnight = (year: number, month: number, day: number, timeZone: string): Date => {
  const utc = Date.UTC(year, month - 1, day);
  let instante = utc - zoneOffset(new Date(utc), timeZone);
  // Una segunda vuelta por si entre medias cambia la hora (horario de verano).
  instante = utc - zoneOffset(new Date(instante), timeZone);

  return new Date(instante);
};

export const zonedCalendar = (timeZone: string): ENSTimelineCalendar => {
  const inicio = (date: Date): Date => {
    const p = zonedParts(date, timeZone);

    return zonedMidnight(p.year, p.month, p.day, timeZone);
  };
  const mover = (date: Date, days: number): Date => {
    const p = zonedParts(date, timeZone);
    const destino = new Date(Date.UTC(p.year, p.month - 1, p.day + days));

    return zonedMidnight(
      destino.getUTCFullYear(),
      destino.getUTCMonth() + 1,
      destino.getUTCDate(),
      timeZone
    );
  };

  return {
    startOfDay: inicio,
    endOfDay: date => new Date(mover(inicio(date), 1).getTime() - 1),
    addDays: (date, days) => mover(inicio(date), days),
    label: date => {
      const p = zonedParts(date, timeZone);

      return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
    },
  };
};

const calendarOf = (timeZone?: string): ENSTimelineCalendar =>
  timeZone ? zonedCalendar(timeZone) : localCalendar;

// Inicio del día de `date` en la zona (o en la del proceso, sin zona).
export const startOfDayIn = (date: Date, timeZone?: string): Date =>
  calendarOf(timeZone).startOfDay(date);

// EL PRESUPUESTO DE LA SERIE, y por qué existe.
//
// Cada punto es una pasada COMPLETA del motor sobre el prefijo de eventos de
// ese día. Con la ventana de 30 días de un cliente real —97.905 eventos ENS en
// wazuh-real el 06/08/2026— eso son unos treinta prefijos que promedian 50.000
// eventos: metro y medio de millón de evaluaciones en el hilo del navegador.
// La pestaña se queda en «Cargando configuración y alcance ENS…» y no vuelve.
//
// El día que op.acc.3 y op.acc.4 pasaron a ACTIVE fue lo que lo tiró: con los
// dos en DRAFT el motor abandonaba sus requisitos pronto, y al activarlos pasó
// a evaluar cinco controles por punto, uno de ellos con evaluador propio que
// recorre todos los eventos.
//
// La salida NO es recortar eventos. Un punto calculado sobre la mitad de los
// hechos es un número falso, y el valor de esta serie es justamente que cada
// punto se calcula igual que el panel. Lo que se recorta es CUÁNTOS PUNTOS: con
// el paso a 4 días la línea tiene ocho puntos en vez de treinta, y los ocho
// siguen siendo exactos. Una gráfica con menos resolución dice la verdad; una
// gráfica que no carga no dice nada.
//
// El presupuesto está en eventos-evaluados sumados a lo largo de toda la serie.
const MAX_EVENTOS_EVALUADOS = 400000;

// El paso en días que mantiene la serie dentro del presupuesto. Nunca menos de
// 1 (diario) y el punto de hoy entra siempre, sea cual sea el paso.
const pasoQueCabe = (
  dias: number,
  eventos: number,
  presupuesto: number = MAX_EVENTOS_EVALUADOS
): number => {
  if (dias <= 1 || eventos <= 0) {
    return 1;
  }

  // Los prefijos crecen de forma aproximadamente lineal, así que el coste de
  // una serie de N puntos es del orden de N * eventos / 2.
  const costeDiario = (dias * eventos) / 2;

  if (costeDiario <= presupuesto) {
    return 1;
  }

  return Math.min(
    dias,
    Math.ceil(costeDiario / presupuesto)
  );
};

// Un punto de la serie sin sus eventos: qué día, contra qué instante.
export type ENSTimelineCutPlan = Omit<ENSTimelineCut, 'events'>;

// Los puntos de la serie a partir de lo único que deciden: el primer evento
// del pasado y cuántos hay. Es la mitad sin eventos de `buildENSTimelineCuts`,
// que la usa; el servidor la usa también para evaluar control a control sin
// tener todos los eventos a la vez.
export const planENSTimelineCuts = (
  firstPastTime: number | undefined,
  pastCount: number,
  options: ENSTimelineCutsOptions = {}
): ENSTimelineCutPlan[] => {
  const now = options.now || new Date();
  const calendar = calendarOf(options.timeZone);

  const days =
    options.days && options.days > 0
      ? Math.floor(options.days)
      : DEFAULT_DAYS;

  if (firstPastTime === undefined || !pastCount) {
    return [];
  }

  const windowStart = calendar.startOfDay(
    calendar.addDays(now, -(days - 1))
  );

  const today = calendar.startOfDay(now);

  const cuts: ENSTimelineCutPlan[] = [];

  const paso = pasoQueCabe(days, pastCount, options.maxEvaluatedEvents);

  for (
    let day = new Date(windowStart);
    day.getTime() <= today.getTime();
    day = calendar.addDays(day, paso)
  ) {
    // El punto de hoy se añade FUERA del bucle, siempre. Con paso > 1 el bucle
    // avanza de `paso` en `paso` desde el inicio de la ventana y no tiene por
    // qué aterrizar en hoy: si el punto del presente dependiera de esa
    // coincidencia, la serie se quedaría sin el único punto que TIENE que ser
    // igual al del panel, y justo con las ventanas grandes, que es cuando el
    // paso crece.
    if (day.getTime() >= today.getTime()) {
      break;
    }

    const cutoff = calendar.endOfDay(day);

    // Sin nada conocido todavía, no hay punto. Es lo que impide el 0 % falso
    // de los días anteriores al primer evento: con cero eventos el motor
    // devuelve los tres controles NO_EVALUABLE, que como veredicto es legítimo
    // y como histórico dibujaría a la máquina incumpliendo antes de que nadie
    // la mirase.
    if (firstPastTime > cutoff.getTime()) {
      continue;
    }

    cuts.push({
      day,
      label: calendar.label(day),
      cutoff,
      isCurrent: false,
    });
  }

  // El presente: mismo instante y MISMOS eventos que el panel —todos, incluidos
  // los de fecha futura por un reloj desviado—, porque los dos números tienen
  // que ser el mismo número.
  cuts.push({
    day: today,
    label: calendar.label(today),
    cutoff: now,
    isCurrent: true,
  });

  return cuts;
};

export const buildENSTimelineCuts = (
  events: ENSNormalizedEvent[] = [],
  options: ENSTimelineCutsOptions = {}
): ENSTimelineCut[] => {
  const now = options.now || new Date();

  // Se ordena UNA vez y cada corte es un prefijo de este array. Un `filter` por
  // punto recorrería los mismos miles de eventos una vez por día.
  const sorted = events
    .map(event => ({
      event,
      time: new Date(event.timestamp).getTime(),
    }))
    .filter(item => Number.isFinite(item.time))
    .sort((left, right) => left.time - right.time);

  const nowMs = now.getTime();

  // Un evento con fecha futura —reloj desviado en el agente— no puede definir
  // el origen de la serie ni alargarla hacia adelante. Sí entra en el punto
  // del presente (ver `planENSTimelineCuts`).
  const past = sorted.filter(
    item => item.time <= nowMs
  );

  // Los cortes van hacia adelante sobre un array ordenado, así que el prefijo
  // solo crece: este índice avanza una vez en toda la serie.
  let cursor = 0;

  return planENSTimelineCuts(past[0]?.time, past.length, { ...options, now }).map(
    cut => {
      if (cut.isCurrent) {
        return { ...cut, events };
      }

      const cutoffMs = cut.cutoff.getTime();

      while (
        cursor < past.length &&
        past[cursor].time <= cutoffMs
      ) {
        cursor += 1;
      }

      return {
        ...cut,
        events: past
          .slice(0, cursor)
          .map(item => item.event),
      };
    }
  );
};
