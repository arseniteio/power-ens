import { ENSConfigurationVersion } from '../types';
import { defaultENSConfigurationTemplate } from '../data';

export type ENSConfigurationHydrationStatus =
  | 'NOT_STARTED'
  | 'LOADING'
  | 'READY'
  | 'ERROR';

export type ENSConfigurationHydrationSource =
  | 'DEFAULT'
  | 'PERSISTED'
  | null;

export interface ENSConfigurationHydrationState {
  status: ENSConfigurationHydrationStatus;
  source: ENSConfigurationHydrationSource;
  error?: string;
}

interface ENSConfigurationRepository {
  getActive(): ENSConfigurationVersion;

  replaceActive(
    configuration: ENSConfigurationVersion
  ): ENSConfigurationVersion;

  save(
    configuration: ENSConfigurationVersion
  ): ENSConfigurationVersion;

  commitPersisted(
    configuration: ENSConfigurationVersion
  ): ENSConfigurationVersion;

  reset(): ENSConfigurationVersion;

  getHistory(): ENSConfigurationVersion[];

  getHydrationState(): ENSConfigurationHydrationState;

  beginHydration(): ENSConfigurationHydrationState;

  completeHydration(
    configuration: ENSConfigurationVersion | null
  ): ENSConfigurationVersion;

  failHydration(
    error: unknown
  ): ENSConfigurationHydrationState;
}

let memoryConfiguration: ENSConfigurationVersion =
  defaultENSConfigurationTemplate;

let memoryHistory: ENSConfigurationVersion[] = [
  defaultENSConfigurationTemplate,
];

let hydrationState: ENSConfigurationHydrationState = {
  status: 'NOT_STARTED',
  source: null,
};

const replaceActiveConfiguration = (
  configuration: ENSConfigurationVersion
): ENSConfigurationVersion => {
  memoryConfiguration = configuration;

  return memoryConfiguration;
};

const appendHistory = (
  configuration: ENSConfigurationVersion
): void => {
  memoryHistory = [
    ...memoryHistory,
    configuration,
  ];
};

const resolveHydrationError = (
  error: unknown
): string => {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  if (
    typeof error === 'string' &&
    error.trim()
  ) {
    return error.trim();
  }

  return 'Unable to load the ENS configuration.';
};

export const ensConfigurationRepository: ENSConfigurationRepository = {
  getActive: () => memoryConfiguration,

  replaceActive: (
    configuration: ENSConfigurationVersion
  ): ENSConfigurationVersion =>
    replaceActiveConfiguration(configuration),

  save: (
    configuration: ENSConfigurationVersion
  ): ENSConfigurationVersion => {
    replaceActiveConfiguration(configuration);
    appendHistory(configuration);

    return memoryConfiguration;
  },

  commitPersisted: (
    configuration: ENSConfigurationVersion
  ): ENSConfigurationVersion => {
    replaceActiveConfiguration(configuration);
    appendHistory(configuration);

    hydrationState = {
      status: 'READY',
      source: 'PERSISTED',
    };

    return memoryConfiguration;
  },

  reset: (): ENSConfigurationVersion => {
    replaceActiveConfiguration(
      defaultENSConfigurationTemplate
    );

    appendHistory(
      defaultENSConfigurationTemplate
    );

    hydrationState = {
      status: 'READY',
      source: 'DEFAULT',
    };

    return memoryConfiguration;
  },

  getHistory: () => [
    ...memoryHistory,
  ],

  getHydrationState: () => ({
    ...hydrationState,
  }),

  beginHydration: (): ENSConfigurationHydrationState => {
    hydrationState = {
      status: 'LOADING',
      source: null,
    };

    return {
      ...hydrationState,
    };
  },

  completeHydration: (
    configuration: ENSConfigurationVersion | null
  ): ENSConfigurationVersion => {
    const resolvedConfiguration =
      configuration ||
      defaultENSConfigurationTemplate;

    replaceActiveConfiguration(
      resolvedConfiguration
    );

    memoryHistory = [
      resolvedConfiguration,
    ];

    hydrationState = {
      status: 'READY',
      source: configuration
        ? 'PERSISTED'
        : 'DEFAULT',
    };

    return memoryConfiguration;
  },

  failHydration: (
    error: unknown
  ): ENSConfigurationHydrationState => {
    hydrationState = {
      status: 'ERROR',
      source: null,
      error: resolveHydrationError(error),
    };

    return {
      ...hydrationState,
    };
  },
};
