// Prefix filter over ENS identifiers, compared by segment: 'op.exp.1' must not match 'op.exp.10'.
// Only the last segment may match partially, and only if nothing matches by whole segments.

import { ENSPrefixFilterResult } from './types';
import {
  compareENSControlIdsByAnnex,
  compareENSFamiliesByAnnex,
} from '../../../common/ens/catalog';

// Lists of controls follow the Annex II order (op.acc 4.2 … op.mon 4.7, then mp.* 5.x), not the alphabet.
export const compareENSControlsInAnnexOrder = compareENSControlIdsByAnnex;

export const splitENSId = (id: string): string[] =>
  String(id).trim().toLowerCase().split('.');

export const normalizeENSPrefixQuery = (raw: string): string =>
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

export const ensFamilyOf = (id: string): string => {
  const segments = splitENSId(id);

  return segments.length > 1
    ? segments.slice(0, -1).join('.')
    : segments.join('.');
};

const compareENSIdSegments = (a: string, b: string): number => {
  const aNumber = Number(a);
  const bNumber = Number(b);
  const aIsNumber = a !== '' && Number.isFinite(aNumber);
  const bIsNumber = b !== '' && Number.isFinite(bNumber);

  if (aIsNumber && bIsNumber) {
    return aNumber - bNumber;
  }

  if (aIsNumber) {
    return -1;
  }

  if (bIsNumber) {
    return 1;
  }

  return a < b ? -1 : a > b ? 1 : 0;
};

export const compareENSIds = (a: string, b: string): number => {
  const aSegments = splitENSId(a);
  const bSegments = splitENSId(b);
  const shared = Math.min(aSegments.length, bSegments.length);

  for (let index = 0; index < shared; index += 1) {
    const verdict = compareENSIdSegments(aSegments[index], bSegments[index]);

    if (verdict !== 0) {
      return verdict;
    }
  }

  return aSegments.length - bSegments.length;
};

export const listENSFamilies = (ids: readonly string[]): string[] => {
  const families = ids.map(ensFamilyOf).filter(family => family !== '');

  return [...new Set(families)].sort(compareENSFamiliesByAnnex);
};

// Sections start closed; with exactly one matching control the section starts open.
export const isENSSectionOpenByDefault = (matchedCount: number): boolean =>
  matchedCount === 1;

export const resolveENSSectionOpenState = (
  explicitState: Record<string, boolean | undefined>,
  controlId: string,
  matchedCount: number
): boolean =>
  explicitState[controlId] ?? isENSSectionOpenByDefault(matchedCount);
