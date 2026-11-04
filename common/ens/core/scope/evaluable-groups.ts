import type { ENSConfigurationScope, ENSConfigurationVersion } from '../../configuration/types';

export const ENS_OUT_OF_GROUP_LABEL = 'Fuera de grupo ENS (No Evaluable)';

export const describeEvaluableGroups = (scope: ENSConfigurationScope): string =>
  scope.groupIds.length
    ? `Grupos evaluables: ${scope.groupIds.join(', ')}. Se cambian en Configuración, pestaña Organización.`
    : 'No hay grupos evaluables definidos. Se definen en Configuración, pestaña Organización.';

export const withEvaluableGroups = (configuration: ENSConfigurationVersion, groups: string[]): ENSConfigurationVersion => ({
  ...configuration,
  scope: {
    ...configuration.scope,
    mode: 'group',
    groupIds: Array.from(new Set(groups.map(group => group.trim()).filter(Boolean))),
  },
});

const ENS_EXCLUSION_GROUP_PREFIX = 'ens-excluir-';

export const exclusionGroupOf = (controlId: string): string => `${ENS_EXCLUSION_GROUP_PREFIX}${controlId}`;

export const withControlGroups = (configuration: ENSConfigurationVersion, controlGroups: boolean): ENSConfigurationVersion => ({
  ...configuration,
  scope: { ...configuration.scope, controlGroups },
});
