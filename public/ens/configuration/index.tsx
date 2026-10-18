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

// El formulario se descarga solo al entrar en Configuración.
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

  // EL ERROR VA PRIMERO, y esto no es una preferencia de estilo.
  //
  // El alcance se hidrata DESPUÉS de la configuración y solo si la
  // configuración salió bien. Cuando falla la configuración, `hydrateENSRuntime`
  // lanza antes de llegar al alcance, así que el alcance se queda para siempre
  // en NOT_STARTED — que es exactamente uno de los estados que pintaban el
  // spinner. Resultado: la pantalla se quedaba en «Cargando configuración y
  // alcance ENS…» para siempre y el aviso que decía POR QUÉ no se pintaba
  // nunca, porque su comprobación venía después.
  //
  // Pasó el 06/08/2026 en producción: el documento del índice traía columnas
  // sin `required` booleano, el validador lo rechazaba con el camino exacto del
  // campo malo —`controls[3].parameters[0].columns[1].required`— y ese mensaje,
  // que resolvía el problema en un minuto, no llegó a la pantalla. Se
  // diagnosticó reproduciendo el validador a mano contra el documento real.
  //
  // Un fallo que se presenta como una carga infinita es peor que un fallo: no
  // se puede distinguir de «va lento» y no dice dónde mirar.
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
