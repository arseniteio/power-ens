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
import { ENSAgentRow, agentRowLabel } from './use-agents-data';

interface DetectedTypesCalloutProps {
  configuration: ENSConfigurationVersion;
  rows: ENSAgentRow[];
  loading: boolean;
  onConfigurationSaved: () => void;
}

const entriesOf = (rows: ENSAgentRow[]) => rows.map(row => ({ agentId: row.id, agent: row.agent, detection: row.detection }));

// The built-in of a type follows the stored type only, so an unsaved detection is announced, never applied silently.
export const DetectedTypesCallout = ({ configuration, rows, loading, onConfigurationSaved }: DetectedTypesCalloutProps) => {
  const [preview, setPreview] = useState<ENSAgentChangePreview[] | undefined>();
  const pending = loading ? [] : pendingDetectedTypes(configuration, entriesOf(rows));
  const labels = Object.fromEntries(rows.map(row => [row.id, agentRowLabel(row)]));

  if (!pending.length) {
    return null;
  }

  const open = () =>
    setPreview(previewConfigurationChange(configuration, saveDetectedTypes(configuration, pending), pending.map(entry => entry.agentId)));

  const save = async (): Promise<string | undefined> => {
    try {
      await saveFromLatestConfiguration(latest => {
        const still = pendingDetectedTypes(latest, entriesOf(rows));
        return still.length
          ? { configuration: saveDetectedTypes(latest, still), reason: `Tipos detectados guardados: ${still.map(entry => entry.agentId).join(', ')}.` }
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
          Su plantilla de serie se aplica al guardar el tipo:{' '}
          {pending.map(entry => `${labels[entry.agentId] || entry.agentId} (${ENS_SYSTEM_TYPE_LABELS[entry.detection.type!]})`).join(', ')}.
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
          configuration={configuration}
          agentLabels={labels}
          previews={preview}
          onCancel={() => setPreview(undefined)}
          onConfirm={save}
        />
      )}
    </>
  );
};
