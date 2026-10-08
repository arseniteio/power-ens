// Atestación documental: acreditar por documento lo que ninguna telemetría
// puede demostrar.
//
// POR QUÉ ESTO NO ROMPE «NUNCA UN CUMPLE FALSO».
//
// Hay requisitos del ENS que NO son técnicos y no lo van a ser nunca.
// `op.acc.1.5` exige identificación en comunicaciones conforme a eIDAS;
// `op.acc.1.r1.1`, singularizar a la persona detrás de un identificador. Un
// agente no puede observar ninguna de las dos: la prueba de esos requisitos es
// un documento aprobado, y así los audita un auditor humano. Rechazarlos por no
// tener telemetría no es rigor, es dejar el control con un techo permanente del
// 75 % sobre algo que el cliente puede tener perfectamente cumplido.
//
// Lo que sí sería un CUMPLE falso es cualquiera de estas dos cosas, y por eso
// ninguna es posible:
//
//   1. QUE UNA ATESTACIÓN TAPE UNA MEDIDA. Solo se admite en requisitos que el
//      catálogo declara con `evidenceIds: []` — los que no tienen NADA con lo
//      que demostrarse. Si la máquina midió y falló, ningún enlace lo cambia.
//      Ese es el límite y es duro: `esRequisitoAtestable` no mira la atestación,
//      mira el catálogo.
//
//   2. QUE SE CONFUNDA CON UNA MEDIDA. Una atestación acredita, pero el
//      resultado va marcado `ATESTACION` y con su referencia, su fecha y quien
//      la firma. En la pantalla y en el informe se lee «acreditado
//      documentalmente», no «cumple». Un auditor tiene que poder separar de un
//      vistazo lo que se midió de lo que se declaró.
//
// Y una atestación INCOMPLETA no acredita. Sin referencia o sin responsable es
// una casilla marcada, y una casilla marcada no es una prueba.
//
// Tipos desde el fichero, nunca desde un barrel de alto nivel.
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../types';

// El id del parámetro que transporta las atestaciones, igual en todos los
// controles. Es un id fijo y no uno por control a propósito: el motor tiene que
// poder encontrarlo sin saber de qué control se trata.
export const ENS_ATTESTATION_PARAMETER_ID = 'P-ATT';

export interface ENSRequirementAttestation {
  requirementId: string;
  // Cómo se llama el documento que acredita. Es lo que un auditor pide.
  reference: string;
  // Enlaces al documento. Puede haber varios: una política y su anexo, el
  // acuerdo y su addenda. Se guardan todos.
  links: string[];
  date?: string;
  responsible?: string;
}

export const cells = (row: string): string[] =>
  row.split('|').map(cell => cell.trim());

// Un enlace utilizable. Se admite `http(s)://`, `file://` y una ruta de red
// (`\\servidor\...`), que es como media administración guarda sus políticas.
// Lo que NO se admite es texto suelto: «está en el SharePoint» no lleva a
// ninguna parte y convierte la traza en un rumor.
// El dominio del EJEMPLO del propio parámetro. Se rechaza a propósito.
//
// El ejemplo tiene que enseñar la FORMA sin ser una atestación que funcione: si
// funciona, alguien lo copia tal cual y se queda con un requisito en verde
// apuntando a un documento que no existe. Es la misma disciplina que en
// op.acc.2, donde copiar la plantilla `.example` no configura nada: declararía
// como política un ejemplo.
//
// `.invalido` no es un TLD asignable, así que ningún enlace real cae aquí por
// accidente.
const PLACEHOLDER_HOSTS = ['ejemplo.invalido', 'example.invalid'];

export const isUsableLink = (value: string): boolean => {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  const lowered = trimmed.toLowerCase();

  if (PLACEHOLDER_HOSTS.some(host => lowered.includes(host))) {
    return false;
  }

  return (
    /^https?:\/\/\S+$/i.test(trimmed) ||
    /^file:\/\/\S+$/i.test(trimmed) ||
    /^\\\\\S+/.test(trimmed) ||
    /^\/\S+/.test(trimmed)
  );
};

export const parameterRows = (
  parameter?: ENSControlParameter
): string[] => {
  const value = parameter?.value;

  if (Array.isArray(value)) {
    return value.map(item => String(item));
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split('\n');
  }

  return [];
};

// Las atestaciones declaradas, por requisito.
//
// El formato de cada fila es `requisito | referencia | enlace | fecha |
// responsable`, y los enlaces adicionales se separan por espacios dentro de su
// celda: una política puede tener anexos y obligar a una fila por enlace
// duplicaría la referencia y la fecha, que es donde empiezan las discrepancias.
export const parseRequirementAttestations = (
  configuration?: ENSControlConfiguration
): Map<string, ENSRequirementAttestation> => {
  const parameter = configuration?.parameters.find(
    candidate => candidate.id === ENS_ATTESTATION_PARAMETER_ID
  );

  const attestations = new Map<string, ENSRequirementAttestation>();

  parameterRows(parameter).forEach(row => {
    const [requirementId, reference, rawLinks, date, responsible] =
      cells(row);

    if (!requirementId || !reference) {
      return;
    }

    const links = (rawLinks || '')
      .split(/[\s,;]+/)
      .filter(isUsableLink);

    attestations.set(requirementId, {
      requirementId,
      reference,
      links,
      date: date || undefined,
      responsible: responsible || undefined,
    });
  });

  return attestations;
};

// ¿Está la atestación lo bastante completa para acreditar?
//
// Se exige referencia Y al menos un enlace utilizable. La fecha y el
// responsable son deseables y viajan al informe, pero no bloquean: una política
// sin fecha sigue siendo una política, mientras que una sin documento al que
// apuntar no es nada.
export const isAttestationSufficient = (
  attestation?: ENSRequirementAttestation
): boolean =>
  Boolean(
    attestation &&
      attestation.reference.trim() &&
      attestation.links.length > 0
  );

// La frase que se enseña en la pantalla y en el informe. Dice SIEMPRE que es
// documental: es lo que impide que se confunda con una medida.
export const describeAttestation = (
  attestation: ENSRequirementAttestation
): string => {
  const parts = [
    `Acreditado documentalmente: ${attestation.reference}`,
  ];

  if (attestation.date) {
    parts.push(`de ${attestation.date}`);
  }

  if (attestation.responsible) {
    parts.push(`declarado por ${attestation.responsible}`);
  }

  return `${parts.join(', ')}. ${attestation.links.join(' ')}`;
};
