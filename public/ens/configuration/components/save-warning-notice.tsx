import React from 'react';
import { EuiCallOut, EuiSpacer } from '@elastic/eui';

import { getLastSaveWarning } from '../../../../common/ens/configuration/services/configuration-state-service';

// The last save went through but something after it did not (the history entry); kept until the next save.
export const SaveWarningNotice = () => {
  const warning = getLastSaveWarning();
  if (!warning) return null;
  return (
    <>
      <EuiCallOut color='warning' iconType='alert' title={warning}>
        <p>La configuración se ha guardado. El detalle está en el log del dashboard.</p>
      </EuiCallOut>
      <EuiSpacer size='m' />
    </>
  );
};
