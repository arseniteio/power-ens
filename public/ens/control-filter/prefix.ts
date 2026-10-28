// Prefix filter over ENS identifiers, compared by segment: 'op.exp.1' must not match 'op.exp.10'.
// Only the last segment may match partially, and only if nothing matches by whole segments.

import { ENSPrefixFilterResult } from './types';
import { compareENSFamiliesByAnnex } from '../../../common/ens/catalog';

;

const splitENSId = (id: string): string[] =>
  String(id).trim().toLowerCase().split('.');

const normalizeENSPrefixQuery = (raw: string): string =>
  String(raw ?? '')
    .trim()
    .toLowerCase();

const matchesCompleteSegments = (
  idSegments: string[],
  querySegments: string[]
): boolean =>
  querySegments.length <= idSegments.length &&
  querySegments.every((segment, index) => segment === idSegments[index]);

const matchesTypingPrefix = (
  idSegments: string[],
  querySegments: string[]
): boolean =>
  querySegments.length <= idSegments.length &&
  querySegments.every((segment, index) =>
    index === querySegments.length - 1
      ? idSegments[index].startsWith(segment)
      : segment === idSegments[index]
  );

export const filterByENSPrefix = <T>(
  items: readonly T[],
  rawQuery: string,
  getIds: (item: T) => string[]
): ENSPrefixFilterResult<T> => {
  const query = normalizeENSPrefixQuery(rawQuery);

  if (!query) {
    return {
      query,
      isActive: false,
      matched: [...items],
      hidden: [],
      total: items.length,
    };
  }

  const querySegments = query.split('.');

  const matching = (
    predicate: (idSegments: string[], querySegments: string[]) => boolean
  ): T[] =>
    items.filter(item =>
      getIds(item).some(id => predicate(splitENSId(id), querySegments))
    );

  const complete = matching(matchesCompleteSegments);

  const matched =
    complete.length > 0 ? complete : matching(matchesTypingPrefix);

  const matchedItems = new Set<T>(matched);

  return {
    query,
    isActive: true,
    matched,
    hidden: items.filter(item => !matchedItems.has(item)),
    total: items.length,
  };
};

const ensFamilyOf = (id: string): string => {
  const segments = splitENSId(id);

  return segments.length > 1
    ? segments.slice(0, -1).join('.')
    : segments.join('.');
};

export const listENSFamilies = (ids: readonly string[]): string[] => {
  const families = ids.map(ensFamilyOf).filter(family => family !== '');

  return [...new Set(families)].sort(compareENSFamiliesByAnnex);
};

// Sections start closed; with exactly one matching control the section starts open.
const isENSSectionOpenByDefault = (matchedCount: number): boolean =>
  matchedCount === 1;

export const resolveENSSectionOpenState = (
  explicitState: Record<string, boolean | undefined>,
  controlId: string,
  matchedCount: number
): boolean =>
  explicitState[controlId] ?? isENSSectionOpenByDefault(matchedCount);
