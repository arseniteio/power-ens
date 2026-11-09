import React from 'react';
import { EuiCard, EuiIcon } from '@elastic/eui';

import { POWER_ENS_APP_TITLE, POWER_ENS_PLUGIN_ID } from '../../common/constants';
import ensLogo from '../assets/ens-logo.png';
import { getCore } from '../services';

const DESCRIPTION = 'Cumplimiento del Esquema Nacional de Seguridad: controles, evidencias, no conformidades e informes.';

export const SecurityOperationsCard = () => (
  <EuiCard
    size='xs'
    layout='horizontal'
    icon={<EuiIcon size='xl' type={ensLogo} />}
    className='wz-module-card-title h-100'
    title={POWER_ENS_APP_TITLE}
    titleSize='xs'
    description={DESCRIPTION}
    onClick={() => getCore().application.navigateToApp(POWER_ENS_PLUGIN_ID)}
  />
);
