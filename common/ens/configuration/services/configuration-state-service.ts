import {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSGlobalConfiguration,
} from '../types';
import {
  ENSConfigurationHydrationState,
  ensConfigurationRepository,
} from '../repository';
import {
  getENSConfiguration,
  saveENSConfiguration,
} from './configuration-http-client';
import {
  assertENSConfigurationVersion,
} from './configuration-structure-validator';
import { resolveControlConfigurationForAgent } from '../agents/configuration-resolver';
import {
  ENSTemplateMigrationPlan,
  planTemplateMigration,
  summarizeTemplateMigration,
} from '../agents/template-migration';
import {
  ENSOrganizationMigrationReport,
  keepOrganizationParameters,
  normalizeOrganizationData,
  summarizeOrganizationMigration,
} from '../organization/organization-data-migration';

let hydrationPromise:
  | Promise<ENSConfigurationVersion>
  | null = null;

// The 1.2.0 -> 1.3.0 conversion done on load: held in memory and written by the next save of any kind.
let pendingTemplateMigration: ENSTemplateMigrationPlan | undefined;

export const getPendingTemplateMigration = (): ENSTemplateMigrationPlan | undefined =>
  pendingTemplateMigration;

// The organisation data migration done on load, same rule: in memory until the next save. Only set when it moves,
// writes or finds a conflict; adding the empty block needs no notice.
let pendingOrganizationMigration: ENSOrganizationMigrationReport | undefined;

export const getPendingOrganizationMigration = (): ENSOrganizationMigrationReport | undefined =>
  pendingOrganizationMigration;

const commitPersisted = (
  configuration: ENSConfigurationVersion
): ENSConfigurationVersion => {
  pendingTemplateMigration = undefined;
  pendingOrganizationMigration = undefined;
  return ensConfigurationRepository.commitPersisted(configuration);
};

// The save that first writes a conversion also says so in the history and the audit trail.
const withPendingConversion = (reason: string): string => {
  const conversions = [
    pendingTemplateMigration ? summarizeTemplateMigration(pendingTemplateMigration) : '',
    pendingOrganizationMigration && (pendingOrganizationMigration.moved.length || pendingOrganizationMigration.written.length)
      ? summarizeOrganizationMigration({ ...pendingOrganizationMigration, conflicts: [] })
      : '',
  ].filter(conversion => conversion && !reason.includes(conversion));
  return conversions.length ? `${reason} ${conversions.join(' ')}` : reason;
};

export const getENSConfigurationHydrationState =
  (): ENSConfigurationHydrationState =>
    ensConfigurationRepository.getHydrationState();

export const hydrateENSConfiguration = (
  force: boolean = false
): Promise<ENSConfigurationVersion> => {
  const hydrationState =
    getENSConfigurationHydrationState();

  if (hydrationPromise) {
    return hydrationPromise;
  }

  if (
    !force &&
    hydrationState.status === 'READY'
  ) {
    return Promise.resolve(
      ensConfigurationRepository.getActive()
    );
  }

  ensConfigurationRepository.beginHydration();

  hydrationPromise = (async () => {
    try {
      const serverState =
        await getENSConfiguration();

      if (serverState.configuration === null) {
        return ensConfigurationRepository.completeHydration(
          null
        );
      }

      const configuration =
        assertENSConfigurationVersion(
          serverState.configuration
        );

      const migration = planTemplateMigration(configuration);
      pendingTemplateMigration = migration.changed ? migration : undefined;

      const organization = normalizeOrganizationData(migration.configuration);
      pendingOrganizationMigration =
        organization.moved.length || organization.written.length || organization.conflicts.length
          ? organization
          : undefined;

      return ensConfigurationRepository.completeHydration(
        organization.configuration
      );
    } catch (error) {
      ensConfigurationRepository.failHydration(
        error
      );

      throw error;
    } finally {
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
};

export const retryENSConfigurationHydration =
  (): Promise<ENSConfigurationVersion> =>
    hydrateENSConfiguration(true);

export const getActiveENSConfiguration =
  (): ENSConfigurationVersion =>
    ensConfigurationRepository.getActive();

export const getConfiguredControls =
  (): ENSControlConfiguration[] =>
    getActiveENSConfiguration().controls;

export const getConfiguredControlById = (
  controlId: string
): ENSControlConfiguration | undefined =>
  getConfiguredControls().find(
    control => control.controlId === controlId
  );

// The single entry point of the configuration into the engine; see `agents/configuration-resolver.ts`.
export const getActiveControlConfiguration = (
  controlId: string,
  agentId?: string
): ENSControlConfiguration | undefined =>
  resolveControlConfigurationForAgent(
    getActiveENSConfiguration(),
    controlId,
    agentId
  );

export const updateActiveControlConfiguration = async (
  controlConfiguration: ENSControlConfiguration
): Promise<ENSConfigurationVersion> => {
  const activeENSConfiguration =
    getActiveENSConfiguration();

  const controlExists =
    activeENSConfiguration.controls.some(
      control =>
        control.controlId ===
        controlConfiguration.controlId
    );

  if (!controlExists) {
    throw new Error(
      `ENS control ${controlConfiguration.controlId} does not exist in the active configuration.`
    );
  }

  const candidateConfiguration:
    ENSConfigurationVersion = {
      ...activeENSConfiguration,
      controls:
        activeENSConfiguration.controls.map(
          control =>
            control.controlId ===
            controlConfiguration.controlId
              ? keepOrganizationParameters(controlConfiguration, control)
              : control
        ),
    };

  const changeReason =
    `Configuración actualizada para ${controlConfiguration.controlId}.`;

  const serverState =
    await saveENSConfiguration(
      candidateConfiguration,
      withPendingConversion(changeReason)
    );

  if (serverState.configuration === null) {
    throw new Error(
      'The ENS configuration server did not return the persisted configuration.'
    );
  }

  const persistedConfiguration =
    assertENSConfigurationVersion(
      serverState.configuration
    );

  const persistedControlExists =
    persistedConfiguration.controls.some(
      control =>
        control.controlId ===
        controlConfiguration.controlId
    );

  if (!persistedControlExists) {
    throw new Error(
      `The persisted ENS configuration does not contain control ${controlConfiguration.controlId}.`
    );
  }

  return commitPersisted(
    persistedConfiguration
  );
};

export const getENSConfigurationHistory =
  (): ENSConfigurationVersion[] =>
    ensConfigurationRepository.getHistory();

export const updateActiveGlobalConfiguration = async (
  globalConfiguration: ENSGlobalConfiguration
): Promise<ENSConfigurationVersion> => {
  const activeENSConfiguration =
    getActiveENSConfiguration();

  const candidateConfiguration:
    ENSConfigurationVersion = {
      ...activeENSConfiguration,
      global: {
        ...activeENSConfiguration.global,
        ...globalConfiguration,
      },
    };

  // Traceability and Availability levels are optional: the merge above would resurrect them from the active
  // configuration if the form removed them.
  if (!globalConfiguration.traceabilityLevel) {
    delete candidateConfiguration.global.traceabilityLevel;
  }

  if (!globalConfiguration.availabilityLevel) {
    delete candidateConfiguration.global.availabilityLevel;
  }

  const serverState =
    await saveENSConfiguration(
      candidateConfiguration,
      withPendingConversion('Configuración global ENS actualizada.')
    );

  if (serverState.configuration === null) {
    throw new Error(
      'The ENS configuration server did not return the persisted global configuration.'
    );
  }

  const persistedConfiguration =
    assertENSConfigurationVersion(
      serverState.configuration
    );

  return commitPersisted(
    persistedConfiguration
  );
};

// Saves a whole prepared document (used by the per-system configuration actions). The server keeps the previous
// version in the history and an entry with `changeReason` in `auditTrail`.
export const saveActiveENSConfiguration = async (
  candidateConfiguration: ENSConfigurationVersion,
  changeReason: string
): Promise<ENSConfigurationVersion> => {
  const serverState =
    await saveENSConfiguration(
      candidateConfiguration,
      withPendingConversion(changeReason)
    );

  if (serverState.configuration === null) {
    throw new Error(
      'The ENS configuration server did not return the persisted configuration.'
    );
  }

  const persistedConfiguration =
    assertENSConfigurationVersion(
      serverState.configuration
    );

  return commitPersisted(
    persistedConfiguration
  );
};

// Per-system saves run in a queue against the latest document, so consecutive saves do not overwrite each other.
let agentSaveQueue: Promise<unknown> = Promise.resolve();

export const saveFromLatestConfiguration = (
  build: (
    latest: ENSConfigurationVersion
  ) => { configuration: ENSConfigurationVersion; reason: string } | undefined
): Promise<ENSConfigurationVersion | undefined> => {
  const run = agentSaveQueue.then(async () => {
    const plan = build(getActiveENSConfiguration());
    if (!plan) return undefined;
    return saveActiveENSConfiguration(plan.configuration, plan.reason);
  });
  agentSaveQueue = run.catch(() => undefined);
  return run;
};
