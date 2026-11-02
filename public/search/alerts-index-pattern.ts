
interface IndexPatternLookupService<P> {
  getIdsWithTitle: (refresh?: boolean) => Promise<Array<{ id: string; title: string }>>;
  get: (id: string) => Promise<P>;
}

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
