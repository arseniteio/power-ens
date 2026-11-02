import type { ENSAgentProfile } from '../types';
import type { ENSDetectableAgent, ENSSystemDetection } from './system-detection';
import { hostnameFromUname } from './system-detection';

export const cloneDocument = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const profileIdentity = (
  agent?: ENSDetectableAgent,
  detection?: ENSSystemDetection
): ENSAgentProfile => {
  const hostname = hostnameFromUname(agent?.os?.uname);
  return {
    ...(agent?.name ? { name: agent.name } : {}),
    ...(hostname && hostname.toLowerCase() !== String(agent?.name || '').toLowerCase() ? { aliases: [hostname] } : {}),
    ...(detection?.type ? { detectedType: detection.type, detectedBy: detection.evidence } : {}),
  };
};

export const mergeAliases = (left?: string[], right?: string[]): string[] | undefined => {
  const all = Array.from(new Set([...(left || []), ...(right || [])].map(alias => alias.trim()).filter(Boolean)));
  return all.length ? all : undefined;
};
