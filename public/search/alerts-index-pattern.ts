// Index pattern lookup for the bar, by exact title. No React or dashboard: the service comes from outside (`data.indexPatterns`), so tests/alerts-index-pattern.test.ts can drive it.

export interface IndexPatternLookupService<P> {
  // OSD 2.19.5: `getIdsWithTitle(refresh = false)`; with `true` it rereads the saved patterns instead of serving the first list.
  getIdsWithTitle: (refresh?: boolean) => Promise<Array<{ id: string; title: string }>>;
  get: (id: string) => Promise<P>;
}

// Three outcomes the view tells apart: found (`indexPattern`), does not exist (neither pattern nor error) and could not be determined (`error`). A read failure is not 'does not exist'.
export interface IndexPatternLookup<P> {
  indexPattern?: P;
  error?: string;
}

export const findIndexPatternByTitle = async <P>(
  service: IndexPatternLookupService<P>,
  title: string
): Promise<IndexPatternLookup<P>> => {
  try {
    const list = await service.getIdsWithTitle(true);
    const found = list.find(p => p.title === title);
    if (!found) return {};
    return { indexPattern: await service.get(found.id) };
  } catch (failure) {
    return { error: String((failure as Error)?.message || failure) };
  }
};
