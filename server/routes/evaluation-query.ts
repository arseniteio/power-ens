// Parameters the evaluation routes accept. The route validates with `unknowns: 'ignore'`, and in
// `@osd/config-schema` that REMOVES undeclared keys from `request.query`: a parameter a screen sends and this
// list lacks never reaches the service, without error. Hence the list lives apart, free of dashboard
// dependencies, and `tests/evaluation-route-query.test.ts` runs each screen's real queries through it.
// The other checks (catalog control, in-scope machine, IANA zone, bounded pages) are done by `normalizeQuery`,
// with a 400 and the reason.
export const EVALUATION_QUERY_FIELDS: Record<string, number> = {
  // All views.
  agentId: 64,
  controlId: 64,
  include: 16,
  timelineDays: 3,
  timeZone: 64,
  // `true`: series points carry the state of each control (the Vista general trend).
  timelineControls: 5,
  // `1`: "Reintentar" a failed refresh.
  retryRefresh: 5,
  // The traceability pages.
  from: 8,
  size: 4,
};

// The minimum of `@osd/config-schema` needed to build it (the real `schema` is passed from the route).
export interface EvaluationQuerySchemaBuilder {
  object(props: any, options: any): any;
  maybe(type: any): any;
  string(options: any): any;
}

export const buildEvaluationQuerySchema = (schema: EvaluationQuerySchemaBuilder) =>
  schema.object(
    Object.fromEntries(
      Object.entries(EVALUATION_QUERY_FIELDS).map(([field, maxLength]) => [field, schema.maybe(schema.string({ maxLength }))])
    ),
    { unknowns: 'ignore' }
  );
