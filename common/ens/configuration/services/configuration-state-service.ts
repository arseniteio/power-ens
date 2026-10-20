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
  ENSConfigurationExpectedVersion,
  ENSConfigurationMetadata,
  ENSConfigurationServerState,
  getENSConfiguration,
  saveENSConfiguration,
} from './configuration-http-client';
import {
  assertENSConfigurationVersion,
} from './configuration-structure-validator';
import { resolveControlConfigurationForAgent } from '../agents/configuration-resolver';
import { describeNewLevelOptionIssues } from './level-options';
import {
  ENS_DIMENSION_LEVEL_KEYS,
  ENS_DIMENSIONS,
  describeDimensionsAboveENSLevel,
} from '../../core/control-level';
import {
  ENSTemplateMigrationPlan,
  planTemplateMigration,
  summarizeTemplateMigration,
} from '../agents/template-migration';
import {
  ENSOrganizationMigrationReport,
  describeOrganizationFills,
  keepOrganizationParameters,
  normalizeOrganizationData,
  summarizeOrganizationMigration,
} from '../organization/organization-data-migration';
import { saveMaturityEntry } from '../../maturity/maturity-http-client';
import type { ENSMaturitySaveResponse } from '../../maturity/maturity-http-client';
import type { ENSMaturityRecordKind, ENSMaturityVersion } from '../../maturity/types';

let hydrationPromise:
  | Promise<ENSConfigurationVersion>
  | null = null;

// The 1.2.0 -> 1.3.0 conversion done on load: held in memory and written by the next save of any kind.
let pendingTemplateMigration: ENSTemplateMigrationPlan | undefined;

export const getPendingTemplateMigration = (): ENSTemplateMigrationPlan | undefined =>
  pendingTemplateMigration;

// The organisation data migration done on load, kept until the next save; unset when there is nothing to tell.
let pendingOrganizationMigration: ENSOrganizationMigrationReport | undefined;

// Index version of the loaded document (null: there was none): a save over a newer one is refused with a 409.
let loadedVersion: ENSConfigurationExpectedVersion | null | undefined;

// What the last save could not do after saving (the history entry), to tell the user.
let lastSaveWarning: string | undefined;

export const getLastSaveWarning = (): string | undefined => lastSaveWarning;

// Every save waits for the previous one and builds on the document it left: two saves never carry the same version.
let saveQueue: Promise<unknown> = Promise.resolve();

const inSaveQueue = <T>(run: () => Promise<T>): Promise<T> => {
  const next = saveQueue.then(run);
  saveQueue = next.catch(() => undefined);
  return next;
};

const versionFrom = (metadata: ENSConfigurationMetadata | null | undefined): ENSConfigurationExpectedVersion | undefined =>
  metadata && Number.isInteger(metadata.seqNo) && Number.isInteger(metadata.primaryTerm)
    ? { seqNo: metadata.seqNo as number, primaryTerm: metadata.primaryTerm as number }
    : undefined;

const saveWithVersion = async (
  configuration: ENSConfigurationVersion,
  reason: string
): Promise<ENSConfigurationServerState> => {
  lastSaveWarning = undefined;
  const serverState = await saveENSConfiguration(configuration, reason, loadedVersion);
  loadedVersion = versionFrom(serverState.metadata);
  lastSaveWarning = serverState.warning;
  return serverState;
};

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
      ? [summarizeOrganizationMigration({ ...pendingOrganizationMigration, conflicts: [], incomplete: [] }), ...describeOrganizationFills(pendingOrganizationMigration.filled)].join(' ')
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

      // null only when there is no document at all: one without `configuration` is saved over its version.
      loadedVersion = serverState.metadata ? versionFrom(serverState.metadata) : null;
      lastSaveWarning = undefined;

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
        organization.moved.length || organization.written.length || organization.conflicts.length || organization.incomplete.length
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

export const updateActiveControlConfiguration = (
  controlConfiguration: ENSControlConfiguration
): Promise<ENSConfigurationVersion> => inSaveQueue(() => updateControlConfiguration(controlConfiguration));

const updateControlConfiguration = async (
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

  const levelIssues = describeNewLevelOptionIssues(candidateConfiguration, activeENSConfiguration);

  if (levelIssues.length) {
    throw new Error(`No se guarda: ${levelIssues.join('; ')}.`);
  }

  const changeReason =
    `Configuración actualizada para ${controlConfiguration.controlId}.`;

  const serverState =
    await saveWithVersion(
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

export const updateActiveGlobalConfiguration = (
  globalConfiguration: ENSGlobalConfiguration
): Promise<ENSConfigurationVersion> => inSaveQueue(() => updateGlobalConfiguration(globalConfiguration));

const updateGlobalConfiguration = async (
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

  // Dimension levels are optional: the merge above would resurrect them from the active configuration if the form removed them.
  ENS_DIMENSIONS.forEach(dimension => {
    const key = ENS_DIMENSION_LEVEL_KEYS[dimension];

    if (!globalConfiguration[key]) {
      delete candidateConfiguration.global[key];
    }
  });

  // Same for the maturity targets: removed in the form, removed in the document.
  if (!globalConfiguration.maturityTargets) {
    delete candidateConfiguration.global.maturityTargets;
  }

  const incoherentLevels = describeDimensionsAboveENSLevel(candidateConfiguration.global);

  if (incoherentLevels) {
    throw new Error(incoherentLevels);
  }

  // A level change that would leave a choice the new level does not admit (mp.s.2 P-07 = R1 in ALTO).
  const levelIssues = describeNewLevelOptionIssues(candidateConfiguration, activeENSConfiguration);

  if (levelIssues.length) {
    throw new Error(`No se guarda: ${levelIssues.join('; ')}. Corregir el parámetro antes de cambiar el nivel.`);
  }

  const serverState =
    await saveWithVersion(
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
    await saveWithVersion(
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

export const saveFromLatestConfiguration = (
  build: (
    latest: ENSConfigurationVersion
  ) => { configuration: ENSConfigurationVersion; reason: string } | undefined
): Promise<ENSConfigurationVersion | undefined> =>
  inSaveQueue(async () => {
    const plan = build(getActiveENSConfiguration());
    if (!plan) return undefined;
    return saveActiveENSConfiguration(plan.configuration, plan.reason);
  });

// Records one maturity entry over the maturity version the screen showed (its own document: no configuration 409).
export const recordMaturityEntry = (
  controlId: string,
  kind: ENSMaturityRecordKind,
  entry: Record<string, unknown>,
  expectedVersion: ENSMaturityVersion | null
): Promise<ENSMaturitySaveResponse> => saveMaturityEntry({ controlId, kind, entry, expectedVersion });
