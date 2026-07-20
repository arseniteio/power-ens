import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiPage,
  EuiSpacer,
} from '@elastic/eui';

import {
  LoadingSpinner,
} from '../../../common/loading-spinner/loading-spinner';
import {
  getAgentsService,
} from '../../../endpoints-summary/services/get-agents';
import type {
  ENSAgentScope,
} from '../core/scope';
import {
  getENSScopeHydrationState,
  hydrateENSScope,
  retryENSScopeHydration,
} from '../core/scope';

import {
  getENSConfigurationHydrationState,
  hydrateENSConfiguration,
  retryENSConfigurationHydration,
} from './services';

import {
  ConfigurationShell,
} from './components/configuration-shell';

const loadENSAgentInventory = async (): Promise<
  ENSAgentScope[]
> => {
  const {
    affected_items: agents,
  } = await getAgentsService({});

  return agents.map(agent => ({
    id: agent.id,
    name: agent.name,
    groups: Array.isArray(agent.group)
      ? [...agent.group]
      : [],
  }));
};

const hydrateENSRuntime = async (
  force: boolean = false
): Promise<ENSAgentScope[]> => {
  const configuration = force
    ? await retryENSConfigurationHydration()
    : await hydrateENSConfiguration();

  return force
    ? retryENSScopeHydration(
        configuration.scope,
        loadENSAgentInventory
      )
    : hydrateENSScope(
        configuration.scope,
        loadENSAgentInventory
      );
};

interface ENSConfigurationBootstrapProps {
  children: React.ReactNode;
}

export const ENSConfigurationBootstrap = ({
  children,
}: ENSConfigurationBootstrapProps) => {
  const [
    hydrationState,
    setHydrationState,
  ] = useState(
    getENSConfigurationHydrationState()
  );

  const [
    scopeHydrationState,
    setScopeHydrationState,
  ] = useState(
    getENSScopeHydrationState()
  );

  const mountedRef = useRef(false);

  const synchronizeHydrationStates =
    useCallback(() => {
      if (!mountedRef.current) {
        return;
      }

      setHydrationState(
        getENSConfigurationHydrationState()
      );

      setScopeHydrationState(
        getENSScopeHydrationState()
      );
    }, []);

  useEffect(() => {
    mountedRef.current = true;

    const hydration =
      hydrateENSRuntime();

    synchronizeHydrationStates();

    hydration
      .then(synchronizeHydrationStates)
      .catch(synchronizeHydrationStates);

    return () => {
      mountedRef.current = false;
    };
  }, [synchronizeHydrationStates]);

  const handleRetry = () => {
    const retry =
      hydrateENSRuntime(true);

    synchronizeHydrationStates();

    retry
      .then(synchronizeHydrationStates)
      .catch(synchronizeHydrationStates);
  };

  if (
    hydrationState.status === 'NOT_STARTED' ||
    hydrationState.status === 'LOADING' ||
    scopeHydrationState.status === 'NOT_STARTED' ||
    scopeHydrationState.status === 'LOADING'
  ) {
    return (
      <LoadingSpinner
        message='Cargando configuración y alcance ENS...'
      />
    );
  }

  if (
    hydrationState.status === 'ERROR' ||
    scopeHydrationState.status === 'ERROR'
  ) {
    return (
      <EuiPage paddingSize='m'>
        <EuiCallOut
          title='No se pudo cargar el entorno ENS'
          color='danger'
          iconType='alert'
        >
          <p>
            {hydrationState.error ||
              scopeHydrationState.error ||
              'La configuración o el alcance ENS no están disponibles.'}
          </p>

          <EuiSpacer size='s' />

          <EuiButton
            color='danger'
            onClick={handleRetry}
          >
            Reintentar
          </EuiButton>
        </EuiCallOut>
      </EuiPage>
    );
  }

  return <>{children}</>;
};

export const ConfigurationENS = () => (
  <ENSConfigurationBootstrap>
    <ConfigurationShell />
  </ENSConfigurationBootstrap>
);
