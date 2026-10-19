import React, { useState } from 'react';
import { EuiButton, EuiCallOut, EuiSpacer } from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { ENS_SYSTEM_TYPE_LABELS } from '../../../../common/agent-configuration';
import {
  ENSAgentChangePreview,
  pendingDetectedTypes,
  previewConfigurationChange,
  saveDetectedTypes,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import { ChangePreviewModal } from './change-preview-modal';
import { errorMessage } from './confirm-modal';
import type { ENSAgentRow } from './use-agents-data';

interface DetectedTypesCalloutProps {
  configuration: ENSConfigurationVersion;
  rows: ENSAgentRow[];
  loading: boolean;
  onConfigurationSaved: () => void;
}

const entriesOf = (rows: ENSAgentRow[]) => rows.map(row => ({ agentId: row.id, agent: row.agent, detection: row.detection }));

// The built-in template of a type applies only once the type is stored: detected types not stored yet, saved after a preview.
export const DetectedTypesCallout = ({ configuration, rows, loading, onConfigurationSaved }: DetectedTypesCalloutProps) => {
  const [preview, setPreview] = useState<ENSAgentChangePreview[] | undefined>();
  const pending = loading ? [] : pendingDetectedTypes(configuration, entriesOf(rows));

  if (!pending.length) {
    return null;
  }

  const open = () =>
    setPreview(previewConfigurationChange(configuration, saveDetectedTypes(configuration, pending), pending.map(entry => entry.agentId)));

  const save = async (): Promise<string | undefined> => {
    const ids = pending.map(entry => entry.agentId);
    try {
      await saveFromLatestConfiguration(latest => {
        const still = pendingDetectedTypes(latest, entriesOf(rows));
        return still.length
          ? { configuration: saveDetectedTypes(latest, still), reason: `Tipos detectados guardados: ${ids.join(', ')}.` }
          : undefined;
      });
      setPreview(undefined);
      onConfigurationSaved();
      return undefined;
    } catch (failure) {
      return errorMessage(failure);
    }
  };

  return (
    <>
      <EuiCallOut color='warning' iconType='iInCircle' size='s' title={`${pending.length} agente(s) con el tipo detectado sin guardar`}>
        <p>
          La plantilla de serie de un tipo solo se aplica con el tipo guardado:{' '}
          {pending.map(entry => `${entry.agentId} (${ENS_SYSTEM_TYPE_LABELS[entry.detection.type!]})`).join(', ')}.
        </p>
        <EuiButton size='s' onClick={open}>
          Guardar los tipos detectados…
        </EuiButton>
      </EuiCallOut>
      <EuiSpacer size='s' />
      {preview && (
        <ChangePreviewModal
          title={`Guardar el tipo detectado de ${preview.length} agente(s)`}
          confirmLabel='Guardar los tipos'
          intro='Los controles sin plantilla asignada pasan a la plantilla de serie de su tipo.'
          previews={preview}
          onCancel={() => setPreview(undefined)}
          onConfirm={save}
        />
      )}
    </>
  );
};
