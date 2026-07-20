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

let hydrationPromise:
  | Promise<ENSConfigurationVersion>
  | null = null;

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

      return ensConfigurationRepository.completeHydration(
        configuration
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

export const getActiveControlConfiguration = (
  controlId: string
): ENSControlConfiguration | undefined =>
  getConfiguredControlById(controlId);

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
              ? controlConfiguration
              : control
        ),
    };

  const changeReason =
    `Configuración actualizada para ${controlConfiguration.controlId}.`;

  const serverState =
    await saveENSConfiguration(
      candidateConfiguration,
      changeReason
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

  return ensConfigurationRepository.commitPersisted(
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

  const serverState =
    await saveENSConfiguration(
      candidateConfiguration,
      'Configuración global ENS actualizada.'
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

  return ensConfigurationRepository.commitPersisted(
    persistedConfiguration
  );
};
