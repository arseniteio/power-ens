import React from 'react';
import { EuiPage, EuiPanel, EuiTitle, EuiText } from '@elastic/eui';

export const DashboardENS = () => (
  <EuiPage paddingSize='m'>
    <EuiPanel>
      <EuiTitle size='m'>
        <h2>ENS Dashboard</h2>
      </EuiTitle>
      <EuiText>
        <p>
          Módulo ENS preparado para mostrar el cumplimiento global, controles,
          evidencias y eventos.
        </p>
      </EuiText>
    </EuiPanel>
  </EuiPage>
);
