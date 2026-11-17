import type { ENSConfigurationVersion } from '../../configuration/types';

export const ENS_OUT_OF_GROUP_LABEL = 'Fuera de grupo ENS (No Evaluable)';

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
