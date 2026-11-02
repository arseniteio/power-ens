import { ENSComplianceState } from '../../compliance-state/types';
import type { ENSComplianceTimelinePoint } from '../../timeline/compliance-timeline';
import { EvolutionModel, EvolutionRowModel } from '../models/evolution.model';

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
      ? 'Cumplimiento diario. El último punto es el actual.'
      : rows.length === 1
      ? 'Solo hay datos de un día.'
      : hasEvaluableControls
      ? 'Aún no hay serie diaria.'
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
