// The filter with which the panel reads the facts of ALL controls. Kept apart so the report collecting all controls (op.mon.2) uses it too, or the panel and that report would judge different fact sets.
// Accepts the three ways an Power ENS fact arrives: the `data.power_ens` field of current collectors, `data.control` and `data.evidence_id` of old ones, and the rule groups `ENS` and `ENS_<control>`.
export const buildENSAllControlsFactsFilter = (controlIds: string[]) => {
  const ensRuleGroups = controlIds.map(controlId => `ENS_${controlId}`);

  return {
    bool: {
      should: [
        { exists: { field: 'data.power_ens' } },
        { exists: { field: 'data.control' } },
        { exists: { field: 'data.evidence_id' } },
        { match_phrase: { 'rule.groups': 'ENS' } },
        ...ensRuleGroups.map(group => ({
          match_phrase: { 'rule.groups': group },
        })),
        ...controlIds.flatMap(controlId => [
          { match_phrase: { 'data.control': controlId } },
          { match_phrase: { 'data.power_ens': controlId } },
        ]),
      ],
      minimum_should_match: 1,
    },
  };
};

// The cap of facts the panel, detail and reports read: the 10,000 MOST RECENT (OpenSearch default `index.max_result_window`).
export const ENS_FACTS_QUERY_LIMIT = 10000;

// Fields by which a fact says which control it belongs to, in the order the normalizer reads them (`data-source-engine.ts`): the first present rules.
export const ENS_CONTROL_ID_FIELDS = ['data.power_ens', 'data.ens', 'data.control_id', 'data.control'];

// The facts of ONE control: those naming it in any of those fields. The control card's filter; the server reads each control this way.
export const buildENSControlFactsFilter = (controlId: string) => ({
  bool: {
    should: ENS_CONTROL_ID_FIELDS.map(field => ({ match_phrase: { [field]: controlId } })),
    minimum_should_match: 1,
  },
});

// Facts naming no control: the all-controls filter admits them (by rule groups or `data.evidence_id`) and the engine treats them as every control's (`resolveEvidenceForControl`). The server reads them apart and gives them to each control.
export const buildENSFactsWithoutControlFilter = () => ({
  bool: {
    must_not: ENS_CONTROL_ID_FIELDS.map(field => ({ exists: { field } })),
  },
});
