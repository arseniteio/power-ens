import React, { useState } from 'react';
import { EuiCallOut, EuiFormRow, EuiPanel, EuiSpacer, EuiSwitch, EuiText, EuiTitle } from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services';
import { exclusionGroupOf, withControlGroups } from '../../../../common/ens/core/scope/evaluable-groups';

interface ControlGroupsPanelProps {
  configuration: ENSConfigurationVersion;
  onConfigurationSaved: () => void;
}

export const ControlGroupsPanel = ({ configuration, onConfigurationSaved }: ControlGroupsPanelProps) => {
  const enabled = Boolean(configuration.scope.controlGroups);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  const change = async (next: boolean) => {
    setSaving(true);
    setSaveError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: withControlGroups(latest, next),
        reason: next ? 'Grupos por control activados.' : 'Grupos por control desactivados.',
      }));
      onConfigurationSaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudo guardar la opción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EuiPanel paddingSize='m' color='subdued'>
      <EuiTitle size='s'>
        <h3>Grupos por control</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>
          El motor crea en Wazuh un grupo por control, como <code>{exclusionGroupOf('op.acc.1')}</code>. Una máquina que metas en ese grupo deja de
          evaluarse en ese control y aparece como «No aplica». El manager de Wazuh no admite grupos, así que no se puede excluir así.
        </p>
        <p>Al desactivarla, los grupos se ignoran y no se borra ninguno.</p>
      </EuiText>
      <EuiSpacer size='s' />
      {saveError && (
        <>
          <EuiCallOut size='s' color='danger' iconType='alert' title={saveError} />
          <EuiSpacer size='s' />
        </>
      )}
      <EuiFormRow>
        <EuiSwitch label='Usar grupos por control' checked={enabled} disabled={saving} onChange={event => change(event.target.checked)} />
      </EuiFormRow>
    </EuiPanel>
  );
};
