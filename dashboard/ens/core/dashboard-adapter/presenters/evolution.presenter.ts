// El gráfico de evolución.
//
// Hasta el 05/08 este fichero promediaba por SEMANA los `score_snapshot` del
// agente. Eran otro número: el agente puntúa sobre su propio denominador y no
// lee los parámetros que el auditor declara en la pantalla, así que el panel y
// la línea podían discrepar sin que nada lo dijera —y discrepaban: op.acc.2 en
// 0 % arriba y la línea en otro sitio—.
//
// Ahora la serie la calcula el motor, día a día, y este fichero solo la pinta.
// Quién la produce y con qué criterio: `core/timeline/compliance-timeline.ts`.
import { ENSComplianceState } from '../../compliance-state/types';
import { ENSComplianceTimelinePoint } from '../../timeline/compliance-timeline';
import {
  EvolutionModel,
  EvolutionRowModel,
} from '../models/evolution.model';

export const buildEvolutionModel = (
  complianceState: ENSComplianceState,
  timeline: ENSComplianceTimelinePoint[] = []
): EvolutionModel => {
  const rows: EvolutionRowModel[] =
    timeline.map(point => ({
      label: point.label,
      score: point.score,
      date: point.date,
      isCurrent: point.isCurrent,
    }));

  const hasEvaluableControls =
    (
      complianceState
        .controlSummary.cumple +
      complianceState
        .controlSummary.noCumple +
      complianceState
        .controlSummary.parcial
    ) > 0;

  // Sin serie, un único punto con el valor de ahora. Es el mismo número que
  // habría dado el último punto, así que la tarjeta nunca contradice al panel.
  const fallbackRows:
    EvolutionRowModel[] =
      hasEvaluableControls
        ? [
            {
              label: 'Actual',
              score:
                complianceState
                  .controlSummary
                  .scoreAverage,
              isCurrent: true,
            },
          ]
        : [];

  const description =
    rows.length > 1
      ? 'Un punto por día, recalculado por el motor con los eventos conocidos ese día y los parámetros actuales. El último es el cumplimiento de este momento: el mismo número del panel.'
      : rows.length === 1
      ? 'Solo hay evidencia de un día dentro del periodo de evaluación. El punto es el cumplimiento de este momento: el mismo número del panel.'
      : hasEvaluableControls
      ? 'Todavía no hay eventos con los que construir la serie diaria. Se muestra el cumplimiento consolidado de este momento.'
      : 'No hay eventos ni controles evaluables para el nivel activo.';

  return {
    title:
      'EVOLUCIÓN DIARIA DEL CUMPLIMIENTO',

    rows:
      rows.length
        ? rows
        : fallbackRows,

    description,
  };
};
