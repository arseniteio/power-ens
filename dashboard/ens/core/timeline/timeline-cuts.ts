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

export const buildENSTimelineCuts = (
  events: ENSNormalizedEvent[] = [],
  options: ENSTimelineCutsOptions = {}
): ENSTimelineCut[] => {
  const now = options.now || new Date();

  const days =
    options.days && options.days > 0
      ? Math.floor(options.days)
      : DEFAULT_DAYS;

  // Se ordena UNA vez y cada corte es un prefijo de este array. Un `filter` por
  // punto recorrería los mismos miles de eventos una vez por día.
  const sorted = events
    .map(event => ({
      event,
      time: new Date(event.timestamp).getTime(),
    }))
    .filter(item => Number.isFinite(item.time))
    .sort((left, right) => left.time - right.time);

  if (!sorted.length) {
    return [];
  }

  const nowMs = now.getTime();

  // Un evento con fecha futura —reloj desviado en el agente— no puede definir
  // el origen de la serie ni alargarla hacia adelante. Sí entra en el punto
  // del presente: ahí el conjunto de eventos tiene que ser EXACTAMENTE el del
  // panel, o los dos números dejarían de ser comparables, que es justo el
  // defecto que esta serie viene a corregir.
  const past = sorted.filter(
    item => item.time <= nowMs
  );

  if (!past.length) {
    return [];
  }

  const windowStart = startOfDay(
    addDays(now, -(days - 1))
  );

  const today = startOfDay(now);

  const cuts: ENSTimelineCut[] = [];

  // Los cortes van hacia adelante sobre un array ordenado, así que el prefijo
  // solo crece: este índice avanza una vez en toda la serie.
  let cursor = 0;

  for (
    let day = new Date(windowStart);
    day.getTime() <= today.getTime();
    day = addDays(day, 1)
  ) {
    const isCurrent =
      day.getTime() === today.getTime();

    if (isCurrent) {
      cuts.push({
        day,
        label: labelOf(day),
        cutoff: now,
        isCurrent: true,
        events,
      });

      continue;
    }

    const cutoff = endOfDay(day);
    const cutoffMs = cutoff.getTime();

    while (
      cursor < past.length &&
      past[cursor].time <= cutoffMs
    ) {
      cursor += 1;
    }

    // Sin nada conocido todavía, no hay punto. Es lo que impide el 0 % falso
    // de los días anteriores al primer evento: con cero eventos el motor
    // devuelve los tres controles NO_EVALUABLE, que como veredicto es legítimo
    // y como histórico dibujaría a la máquina incumpliendo antes de que nadie
    // la mirase.
    if (!cursor) {
      continue;
    }

    cuts.push({
      day,
      label: labelOf(day),
      cutoff,
      isCurrent: false,
      events: past
        .slice(0, cursor)
        .map(item => item.event),
    });
  }

  return cuts;
};
