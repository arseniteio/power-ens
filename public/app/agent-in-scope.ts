// Is the machine in the URL in the ENS scope? An `agentId` outside it (stale link) made the server answer 400 and every screen showed 'sin datos'. No React.

// As the server does: `24` is `024`.
export const normalizeAgentIdForScope = (value: string): string => {
  const text = String(value || '').trim();
  return /^\d+$/.test(text) ? text.padStart(3, '0') : text;
};

export const isAgentInScope = (agentId: string | undefined, scope: { id: string }[]): boolean =>
  !agentId || scope.some(agent => agent.id === normalizeAgentIdForScope(agentId));

export const describeAgentOutOfScope = (agentId: string): string =>
  `La máquina ${agentId} no está en el alcance ENS.`;
