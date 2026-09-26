// La serie diaria de UN control, para la pantalla de detalle.
//
// Es la hermana de `compliance-timeline.ts`, que produce la del panel. La
// diferencia es el denominador y por eso son dos: la del panel promedia todos
// los controles del alcance; esta mide UNO, así que su último punto es
// exactamente el porcentaje grande que se lee arriba en el detalle. Eso es lo
// que la hace comprobable: si no coinciden, uno de los dos miente y se ve.
//
// Mezclarlas sería repetir el defecto que se corrigió el 05/08: dos números
// distintos en la misma pantalla, con denominadores distintos y sin que nada
// avisara de que no hablaban de lo mismo.
//
// La regla de planos de medida la aplica el motor: en la vista de una máquina,
// un control de solo manager (op.exp.7, op.exp.9) sale en cada punto con el
// resultado del manager, igual que arriba en el detalle.
//
// Este fichero es solo la cáscara: importa el motor y por eso queda fuera de
// las pruebas. Todo lo que puede romperse vive en `control-timeline-points.ts`,
// que no lo importa y sí se prueba.
import { ENSLevel } from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { getENSComplianceResultByControl } from '../ens-engine';
import { ENSAgentScope } from '../scope/types';
import {
  ENSControlTimelinePoint,
  mapCutsToControlPoints,
} from './control-timeline-points';
import {
  buildENSTimelineCuts,
  ENSTimelineCutsOptions,
} from './timeline-cuts';

export interface ENSControlTimelineOptions
  extends ENSTimelineCutsOptions {
  agentId?: string;
  scopeAgents?: ENSAgentScope[];
}

export const buildENSControlComplianceTimeline = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  options: ENSControlTimelineOptions = {}
): ENSControlTimelinePoint[] =>
  mapCutsToControlPoints(
    buildENSTimelineCuts(events, options),
    (eventosDelCorte, cutoff) =>
      getENSComplianceResultByControl(
        controlId,
        level,
        eventosDelCorte,
        options.agentId,
        options.scopeAgents,
        cutoff
      )
  );
