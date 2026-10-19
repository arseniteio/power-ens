export interface ENSEvaluationTimeRange {
  from: string;
  to: string;
}

export interface ENSEvaluationTimeRangeFilter {
  range: {
    '@timestamp': {
      gte: string;
      lte: string;
    };
  };
}

const evaluationPeriodFromMap: Record<string, string> = {
  'Últimas 24 horas': 'now-24h',
  'Últimos 7 días': 'now-7d',
  'Últimos 30 días': 'now-30d',
  'Últimos 90 días': 'now-90d',
};

const defaultEvaluationPeriodFrom = 'now-30d';

export const resolveENSEvaluationTimeRange = (
  evaluationPeriod: string
): ENSEvaluationTimeRange => ({
  from:
    evaluationPeriodFromMap[evaluationPeriod] ||
    defaultEvaluationPeriodFrom,
  to: 'now',
});

export const buildENSEvaluationTimeRangeFilter = (
  evaluationPeriod: string
): ENSEvaluationTimeRangeFilter => {
  const timeRange =
    resolveENSEvaluationTimeRange(
      evaluationPeriod
    );

  return {
    range: {
      '@timestamp': {
        gte: timeRange.from,
        lte: timeRange.to,
      },
    },
  };
};
