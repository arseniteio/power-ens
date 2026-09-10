import { tFilter } from '../../../index';
import { DATA_SOURCE_FILTER_CONTROLLED_ENS_EXIST } from '../../../../../../../common/constants';
import { AlertsDataSource } from '../alerts-data-source';
import {
  buildENSScopeAgentQueryFilter,
  getActiveENSScopeAgents,
} from '../../../../../overview/ens/core/scope';

const KEY_EXIST = 'rule.groups';
const KEY_VALUE = 'ensfacil';

const AGENT_ID_KEY = 'agent.id';
const ENS_SCOPE_FILTER_CONTROLLED_BY = 'hidden-ens-scope-agents';

export class ENSDataSource extends AlertsDataSource {
  constructor(id: string, title: string) {
    super(id, title);
  }

  private getFilterExist() {
    return [
      {
        meta: {
          index: this.id,
          negate: false,
          disabled: false,
          alias: null,
          type: 'phrase',
          key: KEY_EXIST,
          value: KEY_VALUE,
          params: {
            query: KEY_VALUE,
            type: 'phrase',
          },
          controlledBy: DATA_SOURCE_FILTER_CONTROLLED_ENS_EXIST,
        },
        query: {
          match_phrase: {
            [KEY_EXIST]: KEY_VALUE,
          },
        },
        $state: {
          store: 'appState',
        },
      } as tFilter,
    ];
  }

  private getScopeFilter(): tFilter[] {
    const scopeAgents = getActiveENSScopeAgents();

    const scopeAgentIds = Array.from(
      new Set(scopeAgents.map((agent) => agent.id.trim()).filter(Boolean))
    );

    const query = buildENSScopeAgentQueryFilter(scopeAgents);

    return [
      {
        meta: {
          index: this.id,
          negate: false,
          disabled: false,
          alias: null,
          type: 'custom',
          key: AGENT_ID_KEY,
          value: scopeAgentIds.length > 0 ? scopeAgentIds.join(', ') : 'match_none',
          controlledBy: ENS_SCOPE_FILTER_CONTROLLED_BY,
        },
        query,
        $state: {
          store: 'appState',
        },
      } as tFilter,
    ];
  }

  getFixedFilters(): tFilter[] {
    return [
      ...super.getFixedFiltersClusterManager(),
      ...this.getFilterExist(),
      ...this.getScopeFilter(),
      ...super.getFixedFilters(),
    ];
  }
}
