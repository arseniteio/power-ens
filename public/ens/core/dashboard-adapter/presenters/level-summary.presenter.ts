import { ENSComplianceState } from '../../compliance-state/types';
import { LevelSummaryModel } from '../models/level-summary.model';

const levels: Array<'BAJO' | 'MEDIO' | 'ALTO'> = ['BAJO', 'MEDIO', 'ALTO'];

const levelLabels: Record<string, string> = {
  BAJO: 'Bajo',
  MEDIO: 'Medio',
  ALTO: 'Alto',
};

export const buildLevelSummaryModel = (
  complianceState: ENSComplianceState
): LevelSummaryModel => {
  const requirements = complianceState.results.flatMap(
    result => result.requirements
  );

  const total = requirements.length || 0;

  const rows = levels.map(level => {
    const count = requirements.filter(requirement =>
      requirement.level.includes(level)
    ).length;

    return {
      level,
      label: levelLabels[level],
      count,
      percent: total ? Math.round((count * 100) / total) : 0,
    };
  });

  const donutGradient =
    `conic-gradient(#00A65A 0 ${rows[0].percent}%, ` +
    `#F5B700 ${rows[0].percent}% ${
      rows[0].percent + rows[1].percent
    }%, ` +
    `#BD271E ${
      rows[0].percent + rows[1].percent
    }% 100%)`;

  return {
    title: 'REQUISITOS EVALUADOS POR NIVEL ENS',
    rows,
    donutGradient,
  };
};
