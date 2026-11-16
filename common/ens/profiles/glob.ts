// Mirrors Go's path.Match, which the engine uses for the "matches" operator:
// '*' and '?' never match '/', a class may, and '\' escapes the next character.

type GlobToken =
  | { kind: 'star' }
  | { kind: 'any' }
  | { kind: 'char'; char: string }
  | { kind: 'class'; negated: boolean; ranges: Array<[string, string]> };

export class GlobPatternError extends Error {}

const escapedChar = (chars: string[], at: number): [string, number] => {
  const char = chars[at];
  if (char === undefined || char === '-' || char === ']') throw new GlobPatternError('bad pattern');
  if (char !== '\\') return [char, at + 1];
  if (chars[at + 1] === undefined) throw new GlobPatternError('bad pattern');
  return [chars[at + 1], at + 2];
};

const parseClass = (chars: string[], start: number): [GlobToken, number] => {
  let at = start;
  const negated = chars[at] === '^';
  if (negated) at++;
  const ranges: Array<[string, string]> = [];
  for (;;) {
    if (chars[at] === ']' && ranges.length > 0) return [{ kind: 'class', negated, ranges }, at + 1];
    const [lo, next] = escapedChar(chars, at);
    at = next;
    let hi = lo;
    if (chars[at] === '-') {
      [hi, at] = escapedChar(chars, at + 1);
    }
    ranges.push([lo, hi]);
  }
};

const parseGlob = (pattern: string): GlobToken[] => {
  const chars = Array.from(pattern);
  const tokens: GlobToken[] = [];
  let at = 0;
  while (at < chars.length) {
    const char = chars[at];
    if (char === '*') {
      tokens.push({ kind: 'star' });
      at++;
    } else if (char === '?') {
      tokens.push({ kind: 'any' });
      at++;
    } else if (char === '[') {
      const [token, next] = parseClass(chars, at + 1);
      tokens.push(token);
      at = next;
    } else if (char === '\\') {
      if (chars[at + 1] === undefined) throw new GlobPatternError('bad pattern');
      tokens.push({ kind: 'char', char: chars[at + 1] });
      at += 2;
    } else {
      tokens.push({ kind: 'char', char });
      at++;
    }
  }
  return tokens;
};

export const isValidGlob = (pattern: string): boolean => {
  try {
    parseGlob(pattern);
    return true;
  } catch {
    return false;
  }
};

const escapeForLuceneClass = (char: string): string => (/[A-Za-z0-9]/.test(char) ? char : `\\${char}`);

const escapeForJsClass = (char: string): string => (/[\\\][^-]/.test(char) ? `\\${char}` : char);

const classSource = (token: Extract<GlobToken, { kind: 'class' }>, escapeOutsideRange: (c: string) => string): string =>
  `[${token.negated ? '^' : ''}${token.ranges
    .map(([lo, hi]) => (lo === hi ? escapeOutsideRange(lo) : `${escapeOutsideRange(lo)}-${escapeOutsideRange(hi)}`))
    .join('')}]`;

const jsLiteral = (char: string): string => char.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const toJsSource = (tokens: GlobToken[]): string =>
  tokens
    .map(token => {
      switch (token.kind) {
        case 'star':
          return '[^/]*';
        case 'any':
          return '[^/]';
        case 'char':
          return jsLiteral(token.char);
        default:
          return classSource(token, escapeForJsClass);
      }
    })
    .join('');

export const globMatches = (pattern: string, value: string): boolean => {
  try {
    return new RegExp(`^${toJsSource(parseGlob(pattern))}$`, 'su').test(value);
  } catch {
    return false;
  }
};

const LUCENE_RESERVED = /[.?+*|{}[\]()"\\#@&<>~]/;

const luceneLiteral = (char: string): string => (LUCENE_RESERVED.test(char) ? `\\${char}` : char);

// Lucene regexp syntax for the OpenSearch regexp query; anchoring is implicit there.
export const globToLuceneRegexp = (pattern: string): string =>
  parseGlob(pattern)
    .map(token => {
      switch (token.kind) {
        case 'star':
          return '[^/]*';
        case 'any':
          return '[^/]';
        case 'char':
          return luceneLiteral(token.char);
        default:
          return classSource(token, escapeForLuceneClass);
      }
    })
    .join('');
