// The evolution chart. The series is computed by the engine day by day and this file only paints it; see `core/timeline/compliance-timeline.ts`. It no longer averages the agent's `score_snapshot` per week, which was another number.
import { ENSComplianceState } from '../../compliance-state/types';
// `import type`: only a type; as a value it would drag the whole engine into this presenter. See the header of `dashboard-adapter.ts`.
import type { ENSComplianceTimelinePoint } from '../../timeline/compliance-timeline';
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

  // Without a series, a single point with the current value, the same number the last point would give, so the card never contradicts the panel.
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
