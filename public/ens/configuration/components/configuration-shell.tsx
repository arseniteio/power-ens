import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  EuiBadge,
  EuiHorizontalRule,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import {
  getActiveENSConfiguration,
} from '../../../../common/ens/configuration/services';
import { ENSLevel } from '../../../../common/ens/configuration/types';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import { resolveControlLevel } from '../../../../common/ens/core/control-level';
import {
  useRouterSearch,
  useSetRouterSearch,
} from '../../../routing/use-router-search';
import {
  ENSConfigurationTarget,
  configurationSearchChanges,
  parseConfigurationTarget,
} from '../../../routing/configuration-link';

import { OrganisationLevel } from './organisation-level';
import { SystemsLevel } from './systems-level';

// CONFIGURACIÓN, en dos niveles:
//   «Organización» — la política común de cada control (los parámetros de
//                    organización) y el nivel global;
//   «Sistemas»     — los agentes del alcance con su tipo detectado y, dentro
//                    de cada uno, sus parámetros por sistema y por plataforma.
// Lo que se ve lo decide la URL (`configControl`, `configAgent`, `configParam`,
// `configView`): así el Detalle del control enlaza aquí y «atrás» funciona.
export const ConfigurationShell = () => {
  const target = parseConfigurationTarget(useRouterSearch());
  const setSearch = useSetRouterSearch();

  const [
    configurationRevision,
    setConfigurationRevision,
  ] = useState(0);

  const handleConfigurationSaved =
    useCallback(() => {
      setConfigurationRevision(
        currentRevision =>
          currentRevision + 1
      );
    }, []);

  const activeConfiguration =
    useMemo(
      () =>
        getActiveENSConfiguration(),
      [configurationRevision]
    );

  // El nivel contra el que se validan los parámetros de UN control es el mismo
  // con el que lo evalúa el motor: el global, salvo que el control se rija por
  // el nivel de una dimensión (op.exp.8 y la Trazabilidad).
  const getControlActiveLevel =
    useCallback(
      (controlId: string): ENSLevel =>
        resolveControlLevel(
          getENSCatalogControl(controlId) || {},
          activeConfiguration.global.ensLevel,
          activeConfiguration.global
        ),
      [activeConfiguration]
    );

  const navigate = useCallback(
    (next: Partial<ENSConfigurationTarget>) => setSearch(configurationSearchChanges(next)),
    [setSearch]
  );

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel paddingSize='l'>
        <EuiTitle size='m'>
          <h2>Configuración ENS</h2>
        </EuiTitle>

        <EuiText color='subdued'>
          <p>
            La política común de la organización y, para cada sistema del
            alcance, sus valores propios. Un valor se resuelve así: el del
            agente; si no tiene, el de sus plantillas; si tampoco, el de la
            organización.
          </p>
        </EuiText>

        <EuiSpacer size='m' />

        <EuiBadge color='hollow'>
          Estado global:{' '}
          {activeConfiguration.status}
        </EuiBadge>

        <EuiSpacer size='m' />

        <EuiTabs>
          <EuiTab
            isSelected={target.view === 'organisation'}
            onClick={() => navigate({ view: 'organisation' })}
          >
            Organización
          </EuiTab>
          <EuiTab
            isSelected={target.view === 'systems'}
            onClick={() => navigate({ view: 'systems' })}
          >
            Sistemas
          </EuiTab>
        </EuiTabs>

        <EuiHorizontalRule />

        {target.view === 'organisation' ? (
          <OrganisationLevel
            configuration={activeConfiguration}
            target={target}
            getActiveLevel={getControlActiveLevel}
            onNavigate={navigate}
            onConfigurationSaved={handleConfigurationSaved}
          />
        ) : (
          <SystemsLevel
            configuration={activeConfiguration}
            target={target}
            getActiveLevel={getControlActiveLevel}
            onNavigate={navigate}
            onConfigurationSaved={handleConfigurationSaved}
          />
        )}
      </EuiPanel>
    </EuiPage>
  );
};
