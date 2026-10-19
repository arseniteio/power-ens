import { RE2JS, RE2JSSyntaxException } from 're2js';
import type { ENSMatchMode } from '../../../agent-configuration';

export const MAX_PARAMETER_PATTERN_LENGTH = 512;
const MAX_PATTERN_PROGRAM_SIZE = 10000;

// RE2 error descriptions (re2js `Parser.ERR_*`) in the words the screen uses.
const SYNTAX_ERRORS: Record<string, string> = {
  'missing closing ]': 'falta el corchete de cierre ]',
  'missing closing )': 'falta el paréntesis de cierre )',
  'unexpected )': 'sobra un paréntesis de cierre )',
  'missing argument to repetition operator': 'un repetidor *, +, ? o {n} sin nada delante',
  'invalid nested repetition operator': 'dos repetidores seguidos',
  'invalid repeat count': 'una repetición {n,m} no válida: como mucho 1000 y n no mayor que m',
  'invalid or unsupported Perl syntax': 'una construcción que RE2 no admite, como lookaround',
  'invalid escape sequence': 'una secuencia de escape que RE2 no admite',
  'trailing backslash at end of expression': 'una barra invertida al final',
  'invalid character class range': 'un rango de caracteres al revés',
  'invalid named capture': 'un grupo con nombre no válido o una construcción que RE2 no admite',
  'duplicate capture group name': 'dos grupos con el mismo nombre',
  'expression nests too deeply': 'demasiados niveles de paréntesis',
  'expression too large': 'una expresión demasiado grande',
};

// The `(` left open: RE2 reports the whole expression for a missing `)`.
const unclosedParen = (pattern: string): number | undefined => {
  const open: number[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '\\') i += 1;
    else if (inClass) inClass = char !== ']';
    else if (char === '[') inClass = true;
    else if (char === '(') open.push(i);
    else if (char === ')') open.pop();
  }
  return open.length ? open[open.length - 1] + 1 : undefined;
};

// Position (1-based) of what RE2 reports; for an unexpected `)` its fragment ends at it.
const errorPosition = (pattern: string, error: RE2JSSyntaxException): number | undefined => {
  const description = error.getDescription();
  const fragment = error.getPattern();
  if (description === 'missing closing )') return unclosedParen(pattern);
  if (!fragment) return description.startsWith('trailing backslash') ? pattern.length : undefined;
  const at = description === 'duplicate capture group name' ? pattern.lastIndexOf(fragment) : pattern.indexOf(fragment);
  if (at < 0) return undefined;
  return description === 'unexpected )' ? at + fragment.length : at + 1;
};

const describeSyntaxError = (pattern: string, error: RE2JSSyntaxException): string => {
  const position = errorPosition(pattern, error);
  const text = SYNTAX_ERRORS[error.getDescription()] || 'una sintaxis que RE2 no admite';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${position ? ` (posición ${position})` : ''}.`;
};

// The same engine validates, previews and evaluates; RE2 has no backtracking, so a configured pattern cannot hang the evaluation.
export const compileParameterPattern = (value: unknown): RE2JS => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Escribe una expresión regular.');
  }
  if (value !== value.trim()) {
    throw new Error('La expresión regular no puede empezar ni terminar con espacios.');
  }
  if (value.length > MAX_PARAMETER_PATTERN_LENGTH) {
    throw new Error(`La expresión regular admite hasta ${MAX_PARAMETER_PATTERN_LENGTH} caracteres.`);
  }
  let compiled: RE2JS;
  try {
    compiled = RE2JS.compile(value);
  } catch (error) {
    throw error instanceof RE2JSSyntaxException ? new Error(describeSyntaxError(value, error)) : error;
  }
  if (compiled.programSize() > MAX_PATTERN_PROGRAM_SIZE) {
    throw new Error('La expresión regular es demasiado compleja.');
  }
  return compiled;
};

// The mode belongs to the level the value comes from: absent means exact, so a value never inherits another level's mode.
export const withMatchMode = <T extends { matchMode?: ENSMatchMode }>(parameter: T, matchMode: ENSMatchMode | undefined): T => {
  const next = { ...parameter };
  if (matchMode === 'regex') next.matchMode = 'regex';
  else delete next.matchMode;
  return next;
};

// Exactly the names «Texto exacto» compared, metacharacters escaped; `ignoreCase` where that comparison ignored case.
export const patternFromItems = (items: string[], ignoreCase = false): string => {
  const names = items.map(item => item.trim()).filter(Boolean);
  return names.length
    ? `${ignoreCase ? '(?i)' : ''}^(?:${names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`
    : '';
};
