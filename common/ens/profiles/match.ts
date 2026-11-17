import { globMatches, globToLuceneRegexp } from './glob';
import { ENSHostFacts, ENSProfile, ENSProfileCondition, ENS_PROFILE_LAYERS } from './types';

const lower = (value: unknown): string => String(value ?? '').toLowerCase();

const containsFold = (list: string[], want: string): boolean => list.some(item => lower(item.trim()) === want);

// A group of machines chosen by hand lists their host names, comma-separated.
export const listOf = (value: unknown): string[] =>
  String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

const conditionHolds = (condition: ENSProfileCondition, facts: ENSHostFacts): boolean => {
  const want = lower(String(condition.value ?? '').trim());
  switch (condition.field) {
    case 'service':
      return (condition.op === 'has') === containsFold(facts.services, want);
    case 'group':
      return (condition.op === 'has') === containsFold(facts.groups, want);
    case 'distro':
    case 'family':
    case 'role':
    case 'hostname': {
      const got = lower(facts[condition.field]);
      if (condition.op === 'is') return got === want;
      if (condition.op === 'is_not') return got !== want;
      if (condition.op === 'matches') return globMatches(want, got);
      if (condition.op === 'in') return listOf(want).includes(got);
      return false;
    }
    default:
      return false;
  }
};

export const profileMatchesHost = (profile: Pick<ENSProfile, 'match'>, facts: ENSHostFacts): boolean =>
  Array.isArray(profile.match) && profile.match.length > 0 && profile.match.every(condition => conditionHolds(condition, facts));

export interface ENSHostProfileDocument {
  agent?: { id?: string; name?: string };
  hostname?: string;
  groups?: string[];
  os?: { name?: string; version?: string; platform?: string; architecture?: string };
  distro?: string;
  family?: string;
  role?: string;
  services?: string[];
  signals?: Array<{ field: string; value: string; from: string }>;
  engine_version?: string;
  '@timestamp'?: string;
}

const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

export const hostFactsOf = (doc: ENSHostProfileDocument): ENSHostFacts => ({
  distro: doc.distro || '',
  family: doc.family || '',
  role: doc.role || '',
  hostname: doc.hostname || doc.agent?.name || '',
  services: stringList(doc.services),
  groups: stringList(doc.groups),
});

const specificity = (layer: string): number => (ENS_PROFILE_LAYERS as string[]).indexOf(layer);

export const byMostSpecificLayer = (a: ENSProfile, b: ENSProfile): number =>
  specificity(b.layer) - specificity(a.layer) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const matchedProfiles = (profiles: ENSProfile[], facts: ENSHostFacts): ENSProfile[] =>
  profiles.filter(profile => profileMatchesHost(profile, facts)).sort(byMostSpecificLayer);

type Query = Record<string, unknown>;

const exists = (field: string): Query => ({ exists: { field } });
const not = (query: Query): Query => ({ bool: { must_not: [query] } });
const all = (...queries: Query[]): Query => ({ bool: { filter: queries } });
const any = (...queries: Query[]): Query => ({ bool: { should: queries, minimum_should_match: 1 } });

const term = (field: string, value: string): Query => ({ term: { [field]: { value, case_insensitive: true } } });

const scalarPositive = (field: string, op: string, want: string): Query => {
  if (op === 'in') return any(...listOf(want).map(item => term(field, item)));
  if (op !== 'matches') return term(field, want);
  let source: string;
  try {
    source = globToLuceneRegexp(want);
  } catch {
    return { match_none: {} };
  }
  const regexp: Query = { regexp: { [field]: { value: source, case_insensitive: true } } };
  return globMatches(want, '') ? any(regexp, not(exists(field))) : regexp;
};

// The engine reads the agent name as the hostname when the inventory has none.
const hostnamePositive = (op: string, want: string): Query =>
  any(all(exists('hostname'), scalarPositive('hostname', op, want)), all(not(exists('hostname')), scalarPositive('agent.name', op, want)));

const conditionQuery = (condition: ENSProfileCondition): Query => {
  const want = lower(String(condition.value ?? '').trim());
  switch (condition.field) {
    case 'service':
    case 'group': {
      const field = condition.field === 'service' ? 'services' : 'groups';
      return condition.op === 'has' ? term(field, want) : not(term(field, want));
    }
    case 'distro':
    case 'family':
    case 'role':
    case 'hostname': {
      if (!['is', 'is_not', 'matches', 'in'].includes(condition.op)) return { match_none: {} };
      if (condition.op === 'in' && !listOf(want).length) return { match_none: {} };
      const positiveOp = condition.op === 'is_not' ? 'is' : condition.op;
      const positive = condition.field === 'hostname' ? hostnamePositive(positiveOp, want) : scalarPositive(condition.field, positiveOp, want);
      return condition.op === 'is_not' ? not(positive) : positive;
    }
    default:
      return { match_none: {} };
  }
};

export const profileQuery = (profile: Pick<ENSProfile, 'match'>): Query =>
  Array.isArray(profile.match) && profile.match.length > 0 ? all(...profile.match.map(conditionQuery)) : { match_none: {} };

export const noProfileQuery = (profiles: ENSProfile[]): Query => ({ bool: { must_not: profiles.map(profileQuery) } });
