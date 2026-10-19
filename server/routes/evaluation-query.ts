// Los parámetros que admiten las rutas de evaluación. La ruta los valida con
// `unknowns: 'ignore'`, y en `@osd/config-schema` eso QUITA de `request.query`
// lo que no esté declarado aquí (no lo deja pasar): un parámetro que mande una
// pantalla y falte en esta lista no llega nunca al servicio, sin error. Por
// eso la lista vive aparte, sin dependencias del dashboard, y
// `tests/evaluation-route-query.test.ts` pasa por ella las consultas reales de
// cada pantalla.
//
// El resto de comprobaciones (control del catálogo, máquina del alcance, zona
// IANA, páginas acotadas) las hace `normalizeQuery`, con un 400 y el motivo.
export const EVALUATION_QUERY_FIELDS: Record<string, number> = {
  // Todas las vistas.
  agentId: 64,
  controlId: 64,
  include: 16,
  timelineDays: 3,
  timeZone: 64,
  // `true`: los puntos de la serie llevan el estado de cada control (la
  // tendencia de la Vista general).
  timelineControls: 5,
  // `1`: «Reintentar» un refresco que falló.
  retryRefresh: 5,
  // Las páginas de la trazabilidad.
  from: 8,
  size: 4,
};

// Lo mínimo de `@osd/config-schema` que hace falta para armarla (se pasa el
// `schema` real desde la ruta).
export interface EvaluationQuerySchemaBuilder {
  object(props: any, options: any): any;
  maybe(type: any): any;
  string(options: any): any;
}

export const buildEvaluationQuerySchema = (schema: EvaluationQuerySchemaBuilder) =>
  schema.object(
    Object.fromEntries(
      Object.entries(EVALUATION_QUERY_FIELDS).map(([campo, maxLength]) => [campo, schema.maybe(schema.string({ maxLength }))])
    ),
    { unknowns: 'ignore' }
  );
