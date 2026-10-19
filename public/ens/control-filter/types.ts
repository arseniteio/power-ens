// Import from '../control-filter/types', never from a high-level barrel: it avoids the transitive TDZ cycle through Settings.

// matched.length + hidden.length === total: `hidden` stops a short panel from reading as a panel without findings.
export interface ENSPrefixFilterResult<T> {
  query: string;

  isActive: boolean;

  matched: T[];
  hidden: T[];
  total: number;
}
