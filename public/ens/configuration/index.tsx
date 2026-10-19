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

import { LoadingSpinner } from '../../platform/loading-spinner';
import { loadENSAgentInventory } from '../../agents/load-agent-inventory';
import type {
  ENSAgentScope,
} from '../../../common/ens/core/scope';
import {
  getENSScopeHydrationState,
  hydrateENSScope,
  retryENSScopeHydration,
} from '../../../common/ens/core/scope';

import {
  getENSConfigurationHydrationState,
  hydrateENSConfiguration,
  retryENSConfigurationHydration,
} from '../../../common/ens/configuration/services';

// The form is downloaded only on entering the Configuración screen.
const ConfigurationShell = React.lazy(() =>
  import('./components/configuration-shell').then(m => ({ default: m.ConfigurationShell }))
);

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

  // ERROR FIRST. The scope hydrates after the configuration and only if it succeeded; when the configuration
  // fails `hydrateENSRuntime` throws before the scope, which stays NOT_STARTED (one of the spinner states). The
  // error notice must be checked before the spinner, or the screen loads forever without saying why.
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


  return <>{children}</>;
};

export const ConfigurationENS = () => (
  <ENSConfigurationBootstrap>
    <ConfigurationShell />
  </ENSConfigurationBootstrap>
);
