// La mitad PURA de la serie por control: cortes + evaluador → puntos.
//
// Vive en su propio fichero, y no es manía. `ens-engine` arrastra
// `configuration/services` y con él `kibana-services`, que solo existe dentro
// del árbol del plugin `main`: basta un `import` estático en la cabecera para
// que TODO el módulo quede fuera del alcance de las pruebas, aunque la función
// que se quiera probar no toque el motor. Le pasó a `compliance-timeline.ts`,
// que por eso no tiene ninguna.
//
// Aquí está lo único que puede romperse de verdad —el instante de cada corte,
// el `undefined` de un NO_APLICA, que el último punto sea el presente— y aquí
// no se importa el motor. `control-timeline.ts` es la cáscara que le pasa el
// motor real.
import { ENSNormalizedEvent } from '../data-source/types';
import { ENSTimelineCut } from './timeline-cuts';

export interface ENSControlTimelinePoint {
  date: Date;
  label: string;
  // El porcentaje del control ese día. `undefined` cuando el control salió
  // NO_APLICA: no es un cero, es que no había nada que puntuar, y dibujarlo
  // como cero diría que la máquina incumplía justo cuando el control ni
  // siquiera regía.
  score?: number;
  status: string;
  isCurrent: boolean;
  events: number;
}

// Lo que la serie necesita saber del motor, y nada más.
export type ENSControlEvaluator = (
  events: ENSNormalizedEvent[],
  cutoff: Date
) => { score?: number; status?: string } | undefined;

export const mapCutsToControlPoints = (
  cuts: ENSTimelineCut[],
  evaluar: ENSControlEvaluator
): ENSControlTimelinePoint[] =>
  cuts.map(cut => {
    const resultado = evaluar(cut.events, cut.cutoff);

    return {
      date: cut.cutoff,
      label: cut.label,
      // Se conserva el `undefined` a propósito: un `?? 0` convertiría un
      // «no aplica» en un incumplimiento dibujado.
      score: resultado?.score,
      status: resultado?.status || 'NO_EVALUABLE',
      isCurrent: cut.isCurrent,
      events: cut.events.length,
    };
  });
