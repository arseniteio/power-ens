import { useEffect, useState } from 'react';
import type { ENSResolvedParameter } from '../../../common/ens/profiles/resolve';
import { profilesClient } from '../configuration/profiles/profiles-client';
import { originText, valueText } from '../configuration/profiles/value-text';

export interface ENSHostParameterView {
  value: string;
  origin: string;
  matchMode?: ENSResolvedParameter['matchMode'];
}

export type ENSHostParameterLookup = (controlId: string, parameterId: string) => ENSHostParameterView | undefined;

const none: ENSHostParameterLookup = () => undefined;

// The server resolves per-machine values with the profiles the machine gets, as the engine
// does; a machine the engine has not described yet keeps the configuration-only view.
export const useHostParameters = (agentId: string | undefined): ENSHostParameterLookup => {
  const [lookup, setLookup] = useState<ENSHostParameterLookup>(() => none);

  useEffect(() => {
    setLookup(() => none);
    if (!agentId) return undefined;
    let current = true;
    profilesClient
      .host(agentId)
      .then(detail => {
        if (!current) return;
        const byKey = new Map(detail.parameters.map(parameter => [`${parameter.controlId}|${parameter.parameterId}`, parameter]));
        setLookup(() => (controlId: string, parameterId: string) => {
          const parameter = byKey.get(`${controlId}|${parameterId}`);
          return parameter && { value: valueText(parameter), origin: originText(parameter.sources), matchMode: parameter.matchMode };
        });
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [agentId]);

  return lookup;
};
