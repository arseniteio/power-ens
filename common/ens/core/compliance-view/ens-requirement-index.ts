// Counts and per-requirement filter for Wazuh's classic compliance view (`section=ens`, the same screen as PCI DSS or GDPR). The view counts each requirement's facts with a `terms` aggregation and, on click, filters events with a `match_phrase` on the same field.
// A single field is not enough: `data.control` is sent only by the old scoring facts of op.acc.1 and op.acc.2, so fifteen controls showed every requirement at 0.
// A fact names its requirements in one of three ways, the first present being used:
// 1. `data.requisito`, a comma-separated LIST: counts for each.
// 2. `data.evidence_id` (also a list), in new-model facts without requirement: counts for each requirement the catalog associates with those evidences of its control.
// 3. `data.control`, in old facts carrying neither.
// Each fact counts by ONE of the three, so there are no doubles and a requirement's filter finds exactly the facts it counts.

import { ENSCatalog } from '../../catalog';

export interface ENSRequirementCount {
  key: string;
  doc_count: number;
}

const LIST_FIELD = 'data.requisito';
const EVIDENCE_FIELD = 'data.evidence_id';
const FACT_CONTROL_FIELD = 'data.ensfacil';
const LEGACY_FIELD = 'data.control';

// Distinct combinations, not facts: tens or hundreds today.
const MAX_LISTS = 5000;
const MAX_CONTROLS = 100;
const MAX_EVIDENCES = 500;

const withoutField = (fieldName: string) => ({ exists: { field: fieldName } });

export const ENS_REQUIREMENT_COUNT_AGGS = {
  ens_requisito: {
    terms: { field: LIST_FIELD, size: MAX_LISTS },
  },
  ens_evidencia: {
    filter: {
      bool: {
        must: [withoutField(EVIDENCE_FIELD)],
        must_not: [withoutField(LIST_FIELD)],
      },
    },
    aggs: {
      control: {
        terms: { field: FACT_CONTROL_FIELD, size: MAX_CONTROLS },
        aggs: {
          evidencia: { terms: { field: EVIDENCE_FIELD, size: MAX_EVIDENCES } },
        },
      },
    },
  },
  ens_control: {
    filter: {
      bool: {
        must_not: [withoutField(LIST_FIELD), withoutField(EVIDENCE_FIELD)],
      },
    },
    aggs: {
      control: { terms: { field: LEGACY_FIELD, size: MAX_LISTS } },
    },
  },
};

export const splitENSRequirementList = (value: unknown): string[] =>
  Array.from(
    new Set(
      String(value ?? '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
    )
  );

// From the catalog: requirements of each evidence of each control, and the reverse.
const requirementsByEvidence = new Map<string, Map<string, string[]>>();
const evidencesByRequirement = new Map<string, { control: string; evidences: string[] }>();

for (const control of ENSCatalog) {
  const byEvidence = new Map<string, string[]>();

  for (const requirement of control.requirements) {
    const evidences = (requirement as { evidenceIds?: string[] }).evidenceIds || [];

    evidencesByRequirement.set(requirement.id, { control: control.id, evidences });

    for (const evidence of evidences) {
      byEvidence.set(evidence, [...(byEvidence.get(evidence) || []), requirement.id]);
    }
  }

  requirementsByEvidence.set(control.id, byEvidence);
}

const sum = (totals: Map<string, number>, matchedKey: string, n: unknown): void => {
  totals.set(matchedKey, (totals.get(matchedKey) || 0) + (Number(n) || 0));
};

export const countENSRequirements = (
  aggregations: any
): ENSRequirementCount[] => {
  const totals = new Map<string, number>();

  for (const bucket of aggregations?.ens_requisito?.buckets || []) {
    for (const requirement of splitENSRequirementList(bucket.key)) {
      sum(totals, requirement, bucket.doc_count);
    }
  }

  for (const controlBucket of aggregations?.ens_evidencia?.control?.buckets || []) {
    const byEvidence = requirementsByEvidence.get(String(controlBucket.key ?? '').trim());

    if (!byEvidence) {
      continue;
    }

    for (const bucket of controlBucket.evidencia?.buckets || []) {
      // A fact of "EV-01,EV-02" counts ONCE for each requirement either serves.
      const requirements = new Set<string>();

      for (const evidence of splitENSRequirementList(bucket.key)) {
        (byEvidence.get(evidence) || []).forEach(id => requirements.add(id));
      }

      requirements.forEach(id => sum(totals, id, bucket.doc_count));
    }
  }

  for (const bucket of aggregations?.ens_control?.control?.buckets || []) {
    const control = String(bucket.key ?? '').trim();

    if (control) {
      sum(totals, control, bucket.doc_count);
    }
  }

  return Array.from(totals, ([key, doc_count]) => ({ key, doc_count }));
};

// The OpenSearch regular expression is anchored to the whole value and treats `@ & < > ~ #` as operators besides the usual ones.
const escapeRegexp = (text: string): string =>
  text.replace(/[.?+*|{}[\]()"\\#@&<>~^$]/g, '\\$&');

// An element of a comma-separated list, with or without surrounding spaces.
const inList = (alternatives: string[]): string =>
  `(.*,)? *(${alternatives.map(escapeRegexp).join('|')}) *(,.*)?`;

export const buildENSRequirementQuery = (requirementId: string) => {
  const id = String(requirementId ?? '').trim();
  const fromCatalog = evidencesByRequirement.get(id);
  const should: unknown[] = [{ regexp: { [LIST_FIELD]: inList([id]) } }];

  if (fromCatalog && fromCatalog.evidences.length) {
    should.push({
      bool: {
        must: [
          { term: { [FACT_CONTROL_FIELD]: fromCatalog.control } },
          { regexp: { [EVIDENCE_FIELD]: inList(fromCatalog.evidences) } },
        ],
        must_not: [withoutField(LIST_FIELD)],
      },
    });
  }

  should.push({
    bool: {
      must: [{ match_phrase: { [LEGACY_FIELD]: id } }],
      must_not: [withoutField(LIST_FIELD), withoutField(EVIDENCE_FIELD)],
    },
  });

  return { bool: { should, minimum_should_match: 1 } };
};

// Search-bar filter for a requirement: `custom`, because it is not a field equal to a value. `meta` carries what each screen needs (index pattern, who controls it).
export const buildENSRequirementFilter = (
  requirementId: string,
  meta: Record<string, unknown> = {}
) => {
  const query = buildENSRequirementQuery(requirementId);

  return {
    meta: {
      alias: `ENS ${String(requirementId ?? '').trim()}`,
      negate: false,
      disabled: false,
      type: 'custom',
      key: 'query',
      value: JSON.stringify(query),
      ...meta,
    },
    query,
    $state: { store: 'appState' },
  };
};
