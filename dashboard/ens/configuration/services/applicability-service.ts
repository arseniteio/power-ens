// Declaración de Aplicabilidad: excluir un control entero cuando el sistema no
// tiene aquello que el control regula.
//
// POR QUÉ HACE FALTA. op.acc.5 regula cómo se autentican los usuarios AJENOS a
// la organización. En un servidor donde no se autentica nadie de fuera no hay
// sujeto que medir, y el motor lo publicaba como 0 %: un incumplimiento
// inventado sobre algo que no existe, que además hundía el índice global. El
// ENS lo resuelve con la Declaración de Aplicabilidad, que excluye una medida
// con su justificación, y así lo audita un auditor humano.
//
// POR QUÉ ESTO NO ROMPE «NUNCA UN CUMPLE FALSO». Una exclusión es la forma más
// cómoda de esconder un incumplimiento, así que tiene dos límites duros:
//
//   1. UNA DECLARACIÓN INCOMPLETA NO EXCLUYE. Sin motivo, sin referencia o sin
//      un documento al que apuntar es una casilla marcada, no una prueba.
//
//   2. NUNCA TAPA LO MEDIDO. Si en una máquina se ha medido o acreditado
//      cualquier requisito del control, el sujeto existe y la exclusión queda
//      contradicha: no se aplica, y se dice. Ese límite vive en
//      `core/evaluation/requirement/applicability.ts`, que mira los resultados,
//      no la declaración.
//
// Y lo excluido nunca se confunde con lo cumplido: sale NO_APLICA, sin número,
// con la referencia y el motivo en cada requisito.
//
// Tipos desde el fichero, nunca desde un barrel de alto nivel.
import type { ENSControlConfiguration } from '../types';
import { cells, isUsableLink, parameterRows } from './attestation-service';

// El id del parámetro, igual en todos los controles que lo declaren. Fijo por
// la misma razón que P-ATT: el motor lo busca sin saber de qué control se trata.
export const ENS_APPLICABILITY_PARAMETER_ID = 'P-DA';

export interface ENSApplicabilityDeclaration {
  // Por qué el control no aplica a este sistema. Es lo primero que lee un
  // auditor, y lo que decide si la exclusión se sostiene.
  reason: string;
  // Cómo se llama el documento que la aprueba.
  reference: string;
  links: string[];
  date?: string;
  responsible?: string;
}

// La declaración de un control: la primera fila con motivo y referencia.
//
// El formato de la fila es `motivo | referencia | enlace | fecha | responsable`,
// y los enlaces adicionales se separan por espacios dentro de su celda, igual
// que en las atestaciones.
export const parseApplicabilityDeclaration = (
  configuration?: ENSControlConfiguration
): ENSApplicabilityDeclaration | undefined => {
  const parameter = configuration?.parameters.find(
    candidate => candidate.id === ENS_APPLICABILITY_PARAMETER_ID
  );

  for (const row of parameterRows(parameter)) {
    const [reason, reference, rawLinks, date, responsible] = cells(row);

    if (!reason || !reference) {
      continue;
    }

    return {
      reason,
      reference,
      links: (rawLinks || '').split(/[\s,;]+/).filter(isUsableLink),
      date: date || undefined,
      responsible: responsible || undefined,
    };
  }

  return undefined;
};

// ¿Está lo bastante completa para excluir? Motivo, referencia Y al menos un
// enlace utilizable. La fecha y el responsable viajan al informe, pero no
// bloquean.
export const isDeclarationSufficient = (
  declaration?: ENSApplicabilityDeclaration
): boolean =>
  Boolean(
    declaration &&
      declaration.reason.trim() &&
      declaration.reference.trim() &&
      declaration.links.length > 0
  );

// La frase de la pantalla y del informe. Dice SIEMPRE que es una exclusión
// declarada: es lo que impide que se lea como cumplimiento.
export const describeDeclaration = (
  declaration: ENSApplicabilityDeclaration
): string => {
  const parts = [
    `Excluido por la Declaración de Aplicabilidad: ${declaration.reference}`,
  ];

  if (declaration.date) {
    parts.push(`de ${declaration.date}`);
  }

  if (declaration.responsible) {
    parts.push(`declarado por ${declaration.responsible}`);
  }

  return `${parts.join(', ')}. Motivo: ${declaration.reason}. ${declaration.links.join(' ')}`;
};
