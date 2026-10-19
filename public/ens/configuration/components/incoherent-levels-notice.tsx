// One line above the Controls list and the dashboard when a declared dimension exceeds the ENS level: the General tab will not save, so the reader is sent there.
import React from 'react';
import { EuiCallOut, EuiLink, EuiSpacer } from '@elastic/eui';
import type { ENSGlobalConfiguration } from '../../../../common/ens/configuration/types';
import {
  ENS_DIMENSION_LEVEL_KEYS,
  ENS_DIMENSION_NAMES,
  findDimensionsAboveENSLevel,
} from '../../../../common/ens/core/control-level';
import { configurationSearchChanges } from '../../../routing/configuration-link';
import { useSetRouterSearch } from '../../../routing/use-router-search';

// «Disponibilidad (D) ALTO supera el nivel ENS MEDIO»; undefined when the levels are coherent.
export const describeIncoherentLevelsLine = (global?: Partial<ENSGlobalConfiguration>): string | undefined => {
  const above = findDimensionsAboveENSLevel(global);

  if (!above.length || !global) {
    return undefined;
  }

  const list = above.map(d => `${ENS_DIMENSION_NAMES[d]} (${d}) ${global[ENS_DIMENSION_LEVEL_KEYS[d]]}`).join(', ');

  return `Niveles incoherentes: ${list} ${above.length === 1 ? 'supera' : 'superan'} el nivel ENS ${global.ensLevel}.`;
};

export const IncoherentLevelsNotice = ({ global }: { global?: Partial<ENSGlobalConfiguration> }) => {
  const updateUrl = useSetRouterSearch();
  const line = describeIncoherentLevelsLine(global);

  if (!line) {
    return null;
  }

  return (
    <>
      <EuiCallOut
        size='s'
        color='warning'
        iconType='alert'
        title={
          <>
            {line}{' '}
            <EuiLink onClick={() => updateUrl(configurationSearchChanges({ view: 'general' }))}>
              Corregir en Configuración &gt; General
            </EuiLink>
          </>
        }
      />
      <EuiSpacer size='s' />
    </>
  );
};
