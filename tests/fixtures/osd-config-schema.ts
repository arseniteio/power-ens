/** Stand-in for `@osd/config-schema` when the dashboard's package is not reachable: the same contract the routes use
 * (an object forbids unknown keys, `maybe` accepts undefined, `nullable` accepts null) and the same error text. */
type Validator = { validate: (value: unknown, context?: unknown, namespace?: string) => unknown };

const fail = (namespace: string | undefined, message: string): never => {
  throw new Error(namespace ? `[${namespace}]: ${message}` : message);
};

const typeOf = (value: unknown): string => (value === null ? 'null' : Array.isArray(value) ? 'Array' : typeof value);

const primitive = (expected: string): Validator => ({
  validate: (value, _context, namespace) =>
    typeof value === expected ? value : fail(namespace, `expected value of type [${expected}] but got [${typeOf(value)}]`),
});

export const schema = {
  any: (): Validator => ({ validate: value => value }),
  string: (): Validator => primitive('string'),
  number: (): Validator => primitive('number'),
  boolean: (): Validator => primitive('boolean'),
  maybe: (inner: Validator): Validator => ({
    validate: (value, context, namespace) => (value === undefined ? value : inner.validate(value, context, namespace)),
  }),
  nullable: (inner: Validator): Validator => ({
    validate: (value, context, namespace) => (value === null ? value : inner.validate(value, context, namespace)),
  }),
  object: (props: Record<string, Validator>): Validator => ({
    validate: (value, context, namespace) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return fail(namespace, `expected a plain object value, but found [${typeOf(value)}] instead.`);
      }
      Object.keys(value).forEach(key => {
        if (!(key in props)) fail(namespace ? `${namespace}.${key}` : key, 'definition for this key is missing');
      });
      Object.entries(props).forEach(([key, inner]) =>
        inner.validate((value as Record<string, unknown>)[key], context, namespace ? `${namespace}.${key}` : key)
      );
      return value;
    },
  }),
};
