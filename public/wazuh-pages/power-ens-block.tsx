import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiLink, EuiPanel, EuiSpacer, EuiStat, EuiText } from '@elastic/eui';

import { POWER_ENS_APP_TITLE, POWER_ENS_PLUGIN_ID } from '../../common/constants';
import { ENS_OUT_OF_GROUP_LABEL } from '../../common/ens/core/scope/evaluable-groups';
import { getCore } from '../services';
import { useControlSummary, type ControlSummary } from './use-control-summary';
import { powerEnsPathOf, type WazuhPage } from './wazuh-page';

const Figures = ({ summary }: { summary: ControlSummary }) =>
  summary.measured === 0 ? (
    <EuiText size='s' color='subdued'>Ningún control aplica todavía.</EuiText>
  ) : (
    <EuiFlexGroup gutterSize='m' responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiStat title={`${summary.scoreAverage} %`} description='Cumplimiento' titleSize='s' />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiStat title={summary.nonCompliant} description='No cumplen' titleSize='s' />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiStat title={summary.partial} description='Parciales' titleSize='s' />
      </EuiFlexItem>
    </EuiFlexGroup>
  );

export const PowerEnsBlock = ({ page }: { page: WazuhPage }) => {
  const state = useControlSummary(page.kind === 'agent' ? page.agentId : undefined);

  const open = () => getCore().application.navigateToApp(POWER_ENS_PLUGIN_ID, { path: powerEnsPathOf(page) });

  return (
    <EuiPanel paddingSize='s' hasShadow={false} color='subdued'>
      <EuiFlexGroup gutterSize='s' justifyContent='spaceBetween' responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size='s'><strong>{POWER_ENS_APP_TITLE}</strong></EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiLink onClick={open}>Abrir</EuiLink>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='xs' />
      {state.kind === 'loading' && <EuiText size='s' color='subdued'>Cargando…</EuiText>}
      {state.kind === 'outOfGroup' && <EuiText size='s' color='subdued'>{ENS_OUT_OF_GROUP_LABEL}</EuiText>}
      {state.kind === 'unavailable' && <EuiText size='s' color='subdued'>Sin datos ahora mismo.</EuiText>}
      {state.kind === 'ready' && <Figures summary={state.summary} />}
    </EuiPanel>
  );
};
