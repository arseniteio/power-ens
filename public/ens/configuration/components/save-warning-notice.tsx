import React from 'react';
import { EuiCallOut, EuiSpacer } from '@elastic/eui';

import { getLastSaveWarning } from '../../../../common/ens/configuration/services/configuration-state-service';

export const SaveWarningNotice = () => {
  const warning = getLastSaveWarning();
  if (!warning) return null;
  return (
    <>
      <EuiCallOut color='warning' iconType='alert' title={warning}>
        <p>Configuración guardada con avisos (ver el log del dashboard).</p>
      </EuiCallOut>
      <EuiSpacer size='m' />
    </>
  );
};
