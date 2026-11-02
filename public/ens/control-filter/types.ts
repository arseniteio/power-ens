// Import from '../control-filter/types', never from a high-level barrel: it avoids the transitive TDZ cycle through Settings.

export interface ENSPrefixFilterResult<T> {
  query: string;

  isActive: boolean;

  matched: T[];
  hidden: T[];
  total: number;
}
