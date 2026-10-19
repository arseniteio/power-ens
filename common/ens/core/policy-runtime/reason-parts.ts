// `reasonParts` describen UN `reason` (ver `ENSReasonPart`). Quien sustituye el
// motivo de una decisión (recolector parado, alcance declarado que no nombra a
// nadie, consolidación de varias máquinas) tiene que soltar las partes: si no,
// la pantalla enseñaría las de un motivo que ya no es el de la decisión (los
// veredictos viejos de otro requisito en vez de «Sin datos del recolector…»).
import type { ENSPolicyDecision } from './types';

export const withReplacedReason = (
  decision: ENSPolicyDecision,
  changes: Partial<ENSPolicyDecision> & { reason: string }
): ENSPolicyDecision => {
  const { reasonParts, ...rest } = decision;
  void reasonParts;
  return { ...rest, ...changes };
};
