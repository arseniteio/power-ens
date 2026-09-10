/**
 * La línea diaria de UN control, la del detalle.
 *
 *     npx tsx tests/evolution-by-control.test.ts
 *
 * POR QUÉ EXISTE, y por qué no reutiliza la del panel. La serie del panel
 * promedia TODOS los controles del alcance: en la pantalla de detalle no dice
 * nada sobre el que se está mirando, y ponerla ahí repetiría el defecto que se
 * corrigió el 05/08 —dos números con denominadores distintos en la misma
 * pantalla, sin que nada avisara de que no hablaban de lo mismo—.
 *
 * QUÉ SE PRUEBA Y QUÉ NO. `ens-engine` arrastra `kibana-services`, que solo
 * existe dentro del árbol del plugin, así que la función pública no se puede
 * importar aquí —le pasa lo mismo a `compliance-timeline.ts`, que por eso no
 * tiene pruebas—. Por eso el módulo se parte: `mapCutsToControlPoints` es puro
 * y recibe el evaluador, y es donde vive todo lo que puede romperse. El motor
 * real se prueba en sus propias suites.
 */
import {
  mapCutsToControlPoints,
} from '../dashboard/ens/core/timeline/control-timeline-points';
import { buildENSTimelineCuts } from '../dashboard/ens/core/timeline/timeline-cuts';
import type { ENSNormalizedEvent } from '../dashboard/ens/core/data-source/types';

declare const process: { exit(code: number): void };

const fallos: string[] = [];

const comprueba = (
  nombre: string,
  condicion: boolean,
  detalle?: unknown
): void => {
  if (condicion) {
    console.log(`  ok   ${nombre}`);

    return;
  }

  console.log(`  FALLA ${nombre}${detalle !== undefined ? ` — ${String(detalle)}` : ''}`);
  fallos.push(nombre);
};

const bloque = (titulo: string): void => console.log(`\n${titulo}`);

let contador = 0;

const AHORA = new Date(2026, 7, 7, 12, 0, 0);

const diasAntes = (dias: number): Date => {
  const cuando = new Date(AHORA);
  cuando.setDate(cuando.getDate() - dias);
  cuando.setHours(9, 0, 0, 0);

  return cuando;
};

const evento = (cuando: Date): ENSNormalizedEvent => ({
  id: `evt-${(contador += 1)}`,
  controlId: 'op.acc.1',
  eventType: 'account_active',
  sourceType: 'WAZUH_ALERT',
  timestamp: cuando.toISOString(),
  agentId: '024',
});

const cortes = (eventos: ENSNormalizedEvent[], dias = 10) =>
  buildENSTimelineCuts(eventos, { now: AHORA, days: dias });

// --- 1. cada punto se evalúa a SU instante --------------------------------

bloque('1. Cada punto se evalúa al instante de su día, no al de hoy');

{
  const eventos = [diasAntes(5), diasAntes(3), diasAntes(0)].map(evento);

  const instantes: string[] = [];

  const serie = mapCutsToControlPoints(
    cortes(eventos),
    (delCorte, cutoff) => {
      instantes.push(cutoff.toISOString());

      return { score: delCorte.length * 10, status: 'PARCIAL' };
    }
  );

  comprueba(
    'el evaluador recibe un instante distinto por punto',
    new Set(instantes).size === instantes.length,
    instantes.join(' ')
  );

  comprueba(
    'los instantes van en orden creciente',
    instantes.every((valor, i) => i === 0 || valor >= instantes[i - 1]),
    instantes.join(' ')
  );

  comprueba(
    'y el último es AHORA, no el fin de un día',
    instantes[instantes.length - 1] === AHORA.toISOString(),
    instantes[instantes.length - 1]
  );

  comprueba(
    'el último punto va marcado como el presente',
    serie[serie.length - 1].isCurrent,
    JSON.stringify(serie[serie.length - 1])
  );

  // El prefijo crece: cada punto conoce lo de los anteriores más lo suyo.
  comprueba(
    'cada punto conoce al menos tantos eventos como el anterior',
    serie.every((punto, i) => i === 0 || punto.events >= serie[i - 1].events),
    JSON.stringify(serie.map(p => p.events))
  );
}

// --- 2. NO_APLICA no es un cero -------------------------------------------

bloque('2. Un día en que el control no aplicaba sale SIN número');

{
  const eventos = [diasAntes(3), diasAntes(0)].map(evento);

  // El motor devuelve `score: undefined` cuando el control es NO_APLICA.
  const serie = mapCutsToControlPoints(
    cortes(eventos),
    () => ({ score: undefined, status: 'NO_APLICA' })
  );

  comprueba(
    'el punto no trae número',
    serie.every(punto => punto.score === undefined),
    JSON.stringify(serie.map(p => p.score))
  );

  comprueba(
    'y NO se convierte en cero',
    serie.every(punto => punto.score !== 0),
    JSON.stringify(serie.map(p => p.score))
  );

  comprueba(
    'y el estado lo dice',
    serie.every(punto => punto.status === 'NO_APLICA'),
    JSON.stringify(serie.map(p => p.status))
  );

  // LA REVERSIÓN: un cero de verdad SÍ se conserva. Sin esto, un `?? undefined`
  // demasiado agresivo borraría los incumplimientos reales y la comprobación de
  // arriba pasaría igual.
  const conCero = mapCutsToControlPoints(
    cortes(eventos),
    () => ({ score: 0, status: 'NO_CUMPLE' })
  );

  comprueba(
    'un 0 medido de verdad sí se conserva',
    conCero.every(punto => punto.score === 0),
    JSON.stringify(conCero.map(p => p.score))
  );

  comprueba(
    'y se distingue del NO_APLICA por el estado',
    conCero.every(punto => punto.status === 'NO_CUMPLE'),
    JSON.stringify(conCero.map(p => p.status))
  );
}

// --- 3. sin resultado, NO_EVALUABLE ---------------------------------------

bloque('3. Si el motor no devuelve nada, el punto no se inventa');

{
  const serie = mapCutsToControlPoints(
    cortes([diasAntes(2), diasAntes(0)].map(evento)),
    () => undefined
  );

  comprueba(
    'sin resultado, el estado es NO_EVALUABLE',
    serie.every(punto => punto.status === 'NO_EVALUABLE'),
    JSON.stringify(serie.map(p => p.status))
  );

  comprueba(
    'y sin número',
    serie.every(punto => punto.score === undefined),
    JSON.stringify(serie.map(p => p.score))
  );
}

// --- salida ---------------------------------------------------------------

console.log('');

if (fallos.length) {
  console.log(`${fallos.length} comprobación(es) fallan:`);
  fallos.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('Todas las comprobaciones pasan.');
