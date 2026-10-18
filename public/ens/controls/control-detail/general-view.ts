// Cómo se enseña la vista general del detalle del control: sin agente
// seleccionado, la pantalla responde a «qué pasa con el control», no a «qué pasa
// en cada máquina» —el parte de cada máquina se lee seleccionando su agente—.
//
// El motor ya entrega los motivos y las tarjetas agrupados por contenido, con la
// lista de máquinas de cada grupo (ver `core/compliance-state/consolidation.ts`).
// Aquí solo se decide CUÁNTO se enseña de golpe, y la regla es una: lo que se
// recorta se anuncia siempre con un recuento, nunca se calla. Agregar no es
// esconder.
//
// Vive fuera del `.tsx` a propósito: es lógica pura, sin JSX, y así se puede
// comprobar de verdad (`tests/aggregated-overview.test.ts`) sin arrastrar
// `react` ni `@elastic/eui`, que solo existen en el árbol del plugin `main`.
//
// Tipos desde el fichero, nunca desde el barrel `../../core`: ahí vive el ciclo
// transitivo del TDZ de `Settings`.
import type {
  ENSAgentRef,
  ENSObservationGroup,
} from '../../../../common/ens/core/evaluation/types';

// Motivos distintos que se enseñan en una celda antes de contar el resto. Tres
// caben sin que la fila crezca; el cuarto ya obliga a hacer scroll para leer la
// tabla, que es justo lo que se está arreglando.
export const MAX_MOTIVOS_VISIBLES = 3;

// Máquinas que se nombran antes de contarlas. A partir de la quinta, el nombre
// informa menos que el número.
export const MAX_MAQUINAS_NOMBRADAS = 4;

export const nombreDeMaquina = (agent: ENSAgentRef): string =>
  agent.agentName ? `${agent.agentName} (${agent.agentId})` : agent.agentId;

export const listarMaquinas = (agents: ENSAgentRef[]): string => {
  const nombres = agents.map(nombreDeMaquina);
  const visibles = nombres.slice(0, MAX_MAQUINAS_NOMBRADAS);
  const resto = nombres.length - visibles.length;

  return visibles.join(', ') + (resto > 0 ? ` y ${resto} más` : '');
};

// «6 máquinas» y «las 7 (todas)» son dos cosas distintas para un auditor: la
// primera dice que hay una que se comporta de otra manera y hay que ir a
// buscarla. Sin el total no se puede distinguir una de otra.
export const describirAlcance = (
  agents: ENSAgentRef[],
  totalMaquinas: number,
): string | undefined => {
  if (agents.length === 0) {
    return undefined;
  }

  if (agents.length === 1) {
    return nombreDeMaquina(agents[0]);
  }

  return `${agents.length} máquinas${etiquetaTodas(
    agents,
    totalMaquinas,
  )}: ${listarMaquinas(agents)}`;
};

const etiquetaTodas = (
  agents: ENSAgentRef[],
  totalMaquinas: number,
): string =>
  totalMaquinas > 0 && agents.length === totalMaquinas ? ' (todas)' : '';

// Lo que va delante del motivo en la tabla de evidencias: con una sola máquina
// se la nombra —perder el nombre obligaría a seleccionar el agente para saber
// dónde ir a mirar—; con varias, se cuentan.
export const etiquetaDeMaquinas = (
  agents: ENSAgentRef[],
  totalMaquinas: number,
): string =>
  agents.length === 1
    ? nombreDeMaquina(agents[0])
    : `${agents.length} máquinas${etiquetaTodas(agents, totalMaquinas)}`;

// De más extendido a más raro. Con el corte en tres, esto garantiza que el
// motivo que afecta a media flota se ve siempre; los minoritarios que no quepan
// se cuentan en el «y N más». El orden de los empatados no se toca: `sort` es
// estable, así que dos motivos con las mismas máquinas salen como llegaron.
export const ordenarMotivos = (
  grupos: ENSObservationGroup[],
): ENSObservationGroup[] =>
  [...grupos].sort(
    (izquierda, derecha) => derecha.agents.length - izquierda.agents.length,
  );

export interface ResumenDeMotivos {
  visibles: ENSObservationGroup[];

  // Cuántos motivos DISTINTOS quedan fuera. Nunca cuántas máquinas: el auditor
  // que lee «y 2 motivos más» sabe que hay dos razones que no está viendo.
  ocultos: number;
}

export const resumirMotivos = (
  grupos: ENSObservationGroup[],
): ResumenDeMotivos => {
  const ordenados = ordenarMotivos(grupos);
  const visibles = ordenados.slice(0, MAX_MOTIVOS_VISIBLES);

  return {
    visibles,
    ocultos: ordenados.length - visibles.length,
  };
};

// Lo que dice la fila de un requisito que CUMPLE en el panel «Requisitos» del
// detalle. Un cumplimiento DOCUMENTAL —`P-ATT` o una declaración que la policy
// acredita con su vigencia— se dice como tal: el auditor tiene que separar de
// un vistazo lo que se midió de lo que se declaró.
export const etiquetaDeRequisitoQueCumple = (requisito: {
  attested?: boolean;
}): string => (requisito.attested ? 'acreditado documentalmente' : 'cumple');
