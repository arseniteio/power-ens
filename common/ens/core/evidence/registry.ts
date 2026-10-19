import { ENSEvidenceDefinition } from './types';
import { ENSEvidenceCatalog } from './catalog';

const registry = new Map<string, ENSEvidenceDefinition[]>();

for (const evidence of ENSEvidenceCatalog) {
  if (!registry.has(evidence.controlId)) {
    registry.set(evidence.controlId, []);
  }

  registry.get(evidence.controlId)!.push(evidence);
}

export const getEvidenceDefinitions = (
  controlId: string
): ENSEvidenceDefinition[] => registry.get(controlId) || [];

export const getRegisteredControls = (): string[] =>
  Array.from(registry.keys());

// ¿Puede llegar algún hecho de este control? No, si NINGUNA de sus evidencias
// escucha un evento ni tiene primitiva que juzgue hechos: es un control que se
// juzga solo con la configuración declarada en la pantalla (op.cont.2, que no
// tiene runbook ni reglas). Para un control así, que no haya llegado nada no es
// un fallo de RECOGIDA —no hay nada que recoger—, y lo que la policy no puede
// acreditar se queda con SU causa (CONFIGURATION), en vez de convertirse en
// «restablecer la recogida» sobre un recolector que no existe.
//
// Se deriva del catálogo de evidencias y no de una marca aparte: es ese
// contrato el que decide qué eventos se leen, así que no puede divergir de él.
// Un control sin evidencias registradas se trata como siempre (espera hechos).
export const controlExpectsFacts = (controlId: string): boolean => {
  const definitions = getEvidenceDefinitions(controlId);

  return (
    definitions.length === 0 ||
    definitions.some(
      definition =>
        definition.expectedEventTypes.length > 0 ||
        Boolean(definition.judgment)
    )
  );
};
