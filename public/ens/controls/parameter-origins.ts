// The value a machine was evaluated with and where it comes from, for the control detail and the reports, from the
// configuration resolver. Without a machine, the common view. Without React (`tests/configure-links.test.ts`).
import { resolveControlConfigurationWithOrigins } from '../../../common/ens/configuration/agents/configuration-resolver';
import type { ENSResolvedValueOrigin } from '../../../common/ens/configuration/agents/configuration-resolver';
import type { ENSConfigurationVersion } from '../../../common/ens/configuration/types';

export interface ENSParameterForMachine {
  id: string;
  label?: string;
  value: string;
  empty: boolean;
  origin: string;
  source?: ENSResolvedValueOrigin['source'];
}

const MAX = 140;

export const summarizeParameterValue = (value: unknown): { text: string; empty: boolean } => {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return { text: 'sin valor', empty: true };
  }
  if (Array.isArray(value)) {
    const filas = value.map(v => String(v));
    const texto = filas.join('; ');
    const cabecera = `${filas.length} fila${filas.length === 1 ? '' : 's'}: `;
    return { text: cabecera + (texto.length > MAX ? `${texto.slice(0, MAX).trimEnd()}…` : texto), empty: false };
  }
  const texto = String(value);
  return { text: texto.length > MAX ? `${texto.slice(0, MAX).trimEnd()}…` : texto, empty: false };
};

export const describeValueOrigin = (origin: ENSResolvedValueOrigin | undefined, empty: boolean): string => {
  if (!origin) return 'el control no está en la configuración activa';
  if (origin.source === 'agent') return 'ajuste propio de esta máquina';
  if (origin.source === 'template') {
    const name = origin.templateName || origin.templateId;
    return origin.via === 'type' ? `de la plantilla de serie «${name}» de su tipo` : `de la plantilla «${name}» asignada en el control`;
  }
  if (origin.source === 'union') return `unión del valor común y de los agentes ${(origin.contributors || []).join(', ')}`;
  if (empty) return 'sin valor: ni ajuste propio, ni plantilla, ni valor común';
  return 'valor común del control';
};

export const describeParameterForMachine = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'agents'>,
  controlId: string,
  agentId: string | undefined,
  parameterId: string
): ENSParameterForMachine | undefined => {
  const resuelto = resolveControlConfigurationWithOrigins(configuration, controlId, agentId);
  const parametro = resuelto?.configuration.parameters.find(p => p.id === parameterId);
  if (!resuelto || !parametro) return undefined;
  const { text, empty } = summarizeParameterValue(parametro.value);
  const origin = resuelto.origins[parameterId];
  // Sin máquina, la vista de conjunto consolida filas evaluadas cada una con SU
  // valor: si alguna máquina tiene uno propio o de plantilla, se dice.
  const conValorPropio =
    agentId === undefined && origin?.source !== 'union'
      ? Object.keys(configuration.agents || {}).filter(id => {
          const fuente = resolveControlConfigurationWithOrigins(configuration, controlId, id)?.origins[parameterId]?.source;
          return fuente === 'agent' || fuente === 'template';
        })
      : [];
  return {
    id: parameterId,
    label: parametro.label || parametro.name,
    value: text,
    empty,
    origin: conValorPropio.length
      ? `varía por máquina: ${conValorPropio.join(', ')} con ajuste propio o plantilla; aquí, el valor común`
      : describeValueOrigin(origin, empty),
    source: origin?.source,
  };
};
