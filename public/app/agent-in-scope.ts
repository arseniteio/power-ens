// ¿Está en el alcance ENS la máquina de la URL? Con un `agentId` que no está
// (un enlace viejo, una máquina sacada del grupo), el servidor responde 400 y
// todas las pantallas quedaban en «sin datos» con el selector en blanco. Sin
// React, para probarlo.

// Como el servidor: `24` es `024`.
export const normalizeAgentIdForScope = (value: string): string => {
  const texto = String(value || '').trim();
  return /^\d+$/.test(texto) ? texto.padStart(3, '0') : texto;
};

export const isAgentInScope = (agentId: string | undefined, scope: { id: string }[]): boolean =>
  !agentId || scope.some(agent => agent.id === normalizeAgentIdForScope(agentId));

export const describeAgentOutOfScope = (agentId: string): string =>
  `La máquina ${agentId} de la dirección no está en el alcance ENS (no existe, no está en el grupo del alcance o el enlace es antiguo). Ninguna pantalla puede evaluarla.`;
