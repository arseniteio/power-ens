// EL VALOR QUE APLICA A ESTA MÁQUINA Y DE DÓNDE SALE. Donde el Detalle del
// control y los Informes citan un parámetro, se dice el valor con el que se ha
// evaluado esa máquina (agente → plantillas → organización, o la unión en el
// manager) y su origen, con el resolutor de Configuración
// (`resolveControlConfigurationWithOrigins`). Sin máquina, el de la vista de
// organización. Sin React (`tests/configure-links.test.ts`).
import { resolveControlConfigurationWithOrigins } from '../../../common/ens/configuration/agents/configuration-resolver';
import type { ENSResolvedValueOrigin } from '../../../common/ens/configuration/agents/configuration-resolver';
import { getConfigurationTemplate } from '../../../common/ens/configuration/templates';
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

export const describeValueOrigin = (origin: ENSResolvedValueOrigin | undefined, empty: boolean, machine: boolean): string => {
  if (!origin) return 'el control no está en la configuración activa';
  if (origin.source === 'agent') return 'valor propio de esta máquina';
  if (origin.source === 'template') return `de la plantilla «${getConfigurationTemplate(origin.templateId || '')?.label || origin.templateId}»`;
  if (origin.source === 'union') return `unión de la organización y de los sistemas ${(origin.contributors || []).join(', ')}`;
  if (empty) return 'sin valor: ni propio, ni de plantilla, ni de la organización';
  return machine ? 'heredado de la organización' : 'de la organización';
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
  return {
    id: parameterId,
    label: parametro.label || parametro.name,
    value: text,
    empty,
    origin: describeValueOrigin(origin, empty, Boolean(agentId)),
    source: origin?.source,
  };
};
