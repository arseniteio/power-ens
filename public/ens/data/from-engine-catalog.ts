import type { ENSControl } from '../types';

export const toScreenControl = (entry: any): ENSControl => ({
  id: entry.control,
  title: entry.title,
  framework: entry.framework,
  category: entry.category,
  family: entry.family,
  dimension: entry.dimension,
  scope: { activeLevels: entry.levels, declaredLevels: entry.levels, highLevelStatus: 'NO_EVALUABLE' },
  requirements: entry.requirements.map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    level: r.levels,
    evidences: r.evidence_ids,
  })),
  evidences: entry.evidences.map((e: any) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    level: e.levels,
    expectedStatus: 'CUMPLE',
    format: 'json',
    events: [],
    wazuhRuleIds: [],
    requirement: e.requirements,
  })),
  parameters: Object.entries(entry.parameters).map(([id, p]: [string, any]) => ({
    id,
    name: p.name,
    description: p.description,
    level: p.levels,
    requirements: p.requirements,
    type: p.type,
    usage: p.engine_usage,
    missingBehavior: p.if_not_configured,
  })),
});
