import { ENSControlDefinition } from '../types';

const compareENSIds = (a: string, b: string): number => {
  const left = String(a).trim().toLowerCase().split('.');
  const right = String(b).trim().toLowerCase().split('.');

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const x = left[index];
    const y = right[index];
    const xNumber = x !== '' && Number.isFinite(Number(x));
    const yNumber = y !== '' && Number.isFinite(Number(y));
    const verdict = xNumber && yNumber ? Number(x) - Number(y) : xNumber ? -1 : yNumber ? 1 : x < y ? -1 : x > y ? 1 : 0;

    if (verdict !== 0) {
      return verdict;
    }
  }

  return left.length - right.length;
};

export const compareControlsByAnnex = (
  a: Pick<ENSControlDefinition, 'id'> & { annexSection?: string },
  b: Pick<ENSControlDefinition, 'id'> & { annexSection?: string }
): number => {
  if (a.annexSection && b.annexSection) {
    return compareENSIds(a.annexSection, b.annexSection) || compareENSIds(a.id, b.id);
  }

  if (a.annexSection) {
    return -1;
  }

  if (b.annexSection) {
    return 1;
  }

  return compareENSIds(a.id, b.id);
};
