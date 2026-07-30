import { ENSNormalizedEvent } from '../data-source/types';

// Utilidades compartidas sobre eventos normalizados. Vivían dentro de
// `engine.ts`, al servicio del contrato de calidad; las usa también
// `judgment.ts` para leer el hecho crudo. Están aquí para que los dos caminos
// lean y ordenen los eventos EXACTAMENTE igual: dos interpretaciones del mismo
// evento es el problema que se arregló al desconectar el evaluador por control.

export const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
};

// Primero `attributes` (donde el normalizador deja los campos propios del
// evento del agente) y luego la raíz del evento normalizado.
export const getEventFieldValue = (
  event: ENSNormalizedEvent,
  field: string
): unknown => {
  if (
    event.attributes &&
    Object.prototype.hasOwnProperty.call(
      event.attributes,
      field
    )
  ) {
    return event.attributes[field];
  }

  const directEvent = event as unknown as Record<
    string,
    unknown
  >;

  return directEvent[field];
};

export const sortByTimestampDesc = (
  events: ENSNormalizedEvent[]
): ENSNormalizedEvent[] =>
  [...events].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() -
      new Date(a.timestamp).getTime()
  );
