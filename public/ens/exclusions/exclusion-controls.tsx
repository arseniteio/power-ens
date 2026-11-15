import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFormRow,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
  EuiTextArea,
} from '@elastic/eui';

import { getActiveENSConfiguration } from '../../../common/ens/configuration/services';
import { EXCLUSION_REASON_MAX_LENGTH, MANAGER_AGENT_ID } from '../../../common/ens/exclusions';
import type { ENSExclusionRecord } from '../../../common/ens/exclusions';
import { getCore, getHttp } from '../../services';
import { createExclusionService } from './exclusion-service';
import { describeExclusionEffect, describeExclusionNotice, ENGINE_PASS_NOTE } from './exclusion-view';

interface ExclusionTarget {
  agentId?: string;
  agentLabel: string;
  controlId: string;
}

interface ExclusionState {
  inGroup: boolean;
  latest: ENSExclusionRecord | null;
  canChange: boolean;
}

const exclusionService = () => createExclusionService(getHttp(), () => document.cookie);

const appliesTo = (agentId?: string): agentId is string =>
  Boolean(agentId) && agentId !== MANAGER_AGENT_ID && Boolean(getActiveENSConfiguration().scope.controlGroups);

export const useExclusion = ({ agentId, controlId }: ExclusionTarget) => {
  const [state, setState] = useState<ExclusionState | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const enabled = appliesTo(agentId);

  const load = useCallback(async () => {
    if (!appliesTo(agentId)) return;
    setLoadError(undefined);
    try {
      const service = exclusionService();
      const [status, inGroup] = await Promise.all([service.readStatus(agentId, controlId), service.isExcluded(agentId, controlId)]);
      setState({ ...status, inGroup });
    } catch (error) {
      setState(undefined);
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [agentId, controlId]);

  useEffect(() => {
    setState(undefined);
    load();
  }, [load]);

  return { enabled, state, loadError, reload: load };
};

type Exclusion = ReturnType<typeof useExclusion>;

export const ExclusionButton = ({ target, exclusion }: { target: ExclusionTarget; exclusion: Exclusion }) => {
  const [open, setOpen] = useState(false);
  const { enabled, state } = exclusion;
  if (!enabled || !state?.canChange || !target.agentId) return null;

  const excluding = !state.inGroup;

  return (
    <>
      <EuiButton iconType={excluding ? 'minusInCircle' : 'plusInCircle'} onClick={() => setOpen(true)}>
        {excluding ? 'Excluir de este control' : 'Volver a incluir'}
      </EuiButton>
      {open && (
        <ExclusionModal
          target={{ ...target, agentId: target.agentId }}
          excluding={excluding}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            exclusion.reload();
          }}
        />
      )}
    </>
  );
};

export const ExclusionNotice = ({ exclusion, verdictStatus }: { exclusion: Exclusion; verdictStatus?: string }) => {
  const { enabled, state, loadError } = exclusion;
  const notice = useMemo(
    () => (state ? describeExclusionNotice(state.inGroup, state.latest, verdictStatus) : undefined),
    [state, verdictStatus]
  );
  if (!enabled) return null;

  if (loadError) {
    return (
      <>
        <EuiSpacer size='m' />
        <EuiCallOut size='s' color='warning' iconType='alert' title='No se pudo comprobar si la máquina está excluida de este control'>
          <p>{loadError}</p>
        </EuiCallOut>
      </>
    );
  }

  if (!notice) return null;

  return (
    <>
      <EuiSpacer size='m' />
      <EuiCallOut size='s' color='primary' iconType='minusInCircle' title='Excluida de este control'>
        <p>Motivo: {notice.reason}</p>
        {notice.recordedBy && <p>Registrado por {notice.recordedBy}.</p>}
        {notice.pendingEngine && <p>Aparecerá como «No aplica» tras la próxima evaluación del motor. {ENGINE_PASS_NOTE}</p>}
      </EuiCallOut>
    </>
  );
};

interface ExclusionModalProps {
  target: ExclusionTarget & { agentId: string };
  excluding: boolean;
  onClose: () => void;
  onDone: () => void;
}

const ExclusionModal = ({ target, excluding, onClose, onDone }: ExclusionModalProps) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const action = excluding ? 'Excluir' : 'Volver a incluir';

  const confirm = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      await exclusionService().change({
        agentId: target.agentId,
        controlId: target.controlId,
        action: excluding ? 'EXCLUDED' : 'INCLUDED',
        reason,
      });
      getCore().notifications.toasts.addSuccess({
        title: excluding ? `${target.agentLabel} excluida de ${target.controlId}` : `${target.agentLabel} incluida de nuevo en ${target.controlId}`,
        text: ENGINE_PASS_NOTE,
      });
      onDone();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  };

  return (
    <EuiModal onClose={onClose} style={{ width: 560 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>
            {action} {excluding ? 'de' : 'en'} {target.controlId}
          </h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText size='s'>
          <p>{describeExclusionEffect(target.agentLabel, target.controlId, excluding)}</p>
        </EuiText>
        <EuiSpacer size='m' />
        <EuiFormRow label='Motivo' helpText='Queda registrado con tu usuario y la fecha como evidencia para la auditoría.' fullWidth>
          <EuiTextArea
            value={reason}
            rows={3}
            fullWidth
            maxLength={EXCLUSION_REASON_MAX_LENGTH}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value)}
          />
        </EuiFormRow>
        {saveError && (
          <>
            <EuiSpacer size='s' />
            <EuiCallOut size='s' color='danger' iconType='alert' title={saveError} />
          </>
        )}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose} disabled={saving}>
          Cancelar
        </EuiButtonEmpty>
        <EuiButton fill onClick={confirm} isLoading={saving} disabled={!reason.trim()}>
          {action}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
