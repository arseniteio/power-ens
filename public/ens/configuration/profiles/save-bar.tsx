import React, { useState } from 'react';
import {
  EuiBadge,
  EuiBottomBar,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiTable,
  EuiTableBody,
  EuiTableRow,
  EuiTableRowCell,
  EuiText,
} from '@elastic/eui';
import { ENSStagedChange, useProfileChanges } from './profile-changes';
import { layerLabel, matchText } from './profile-labels';

const changesText = (count: number): string => (count === 1 ? '1 cambio pendiente en grupos' : `${count} cambios pendientes en grupos`);

const ChangeRow = ({ change, onUndo }: { change: ENSStagedChange; onUndo: () => void }) => {
  const isUpsert = change.kind === 'upsert';
  const label = isUpsert ? (change.isNew ? 'Nuevo' : 'Modificado') : change.restoresBuiltin ? 'Vuelve al incluido' : 'Eliminado';
  const color = isUpsert ? (change.isNew ? 'success' : 'primary') : change.restoresBuiltin ? 'warning' : 'danger';
  return (
    <EuiTableRow>
      <EuiTableRowCell width='150px'>
        <EuiBadge color={color}>{label}</EuiBadge>
      </EuiTableRowCell>
      <EuiTableRowCell>
        <EuiText size='s'>
          <strong>{isUpsert ? change.profile.name : change.name}</strong>
          {isUpsert && (
            <EuiText size='xs' color='subdued'>
              {layerLabel(change.profile.layer)} · {matchText(change.profile.match)}
            </EuiText>
          )}
        </EuiText>
      </EuiTableRowCell>
      <EuiTableRowCell width='110px' align='right'>
        <EuiButtonEmpty size='xs' onClick={onUndo}>
          Deshacer
        </EuiButtonEmpty>
      </EuiTableRowCell>
    </EuiTableRow>
  );
};

export const ProfileSaveBar = () => {
  const { changes, saving, saveError, save, discard, unstage, canChange } = useProfileChanges();
  const [reviewing, setReviewing] = useState(false);

  if (!changes.length) return null;

  const idOf = (change: ENSStagedChange) => (change.kind === 'upsert' ? change.profile.id : change.id);

  return (
    <>
      <EuiBottomBar position='sticky' paddingSize='s'>
        <EuiFlexGroup alignItems='center' justifyContent='spaceBetween' gutterSize='s' responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiText size='s' color='ghost'>
              {saveError ? `No se ha guardado. ${saveError}` : changesText(changes.length)}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize='s' responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty color='ghost' size='s' onClick={discard} isDisabled={saving}>
                  Descartar
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton color='ghost' size='s' onClick={() => setReviewing(true)} isDisabled={saving}>
                  Revisar
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton color='primary' fill size='s' iconType='save' onClick={save} isLoading={saving} isDisabled={!canChange}>
                  Guardar
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiBottomBar>

      {reviewing && (
        <EuiModal onClose={() => setReviewing(false)} style={{ width: 640 }}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>
              <h1>Cambios sin guardar</h1>
            </EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiSpacer size='m' />
            {!canChange && (
              <>
                <EuiCallOut size='s' color='warning' iconType='lock' title='Guardar necesita el rol power_ens_admin o all_access.' />
                <EuiSpacer size='m' />
              </>
            )}
            {saveError && (
              <>
                <EuiCallOut size='s' color='danger' iconType='alert' title={saveError} />
                <EuiSpacer size='m' />
              </>
            )}
            <EuiTable>
              <EuiTableBody>
                {changes.map(change => (
                  <ChangeRow key={idOf(change)} change={change} onUndo={() => unstage(idOf(change))} />
                ))}
              </EuiTableBody>
            </EuiTable>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => setReviewing(false)}>Cerrar</EuiButtonEmpty>
            <EuiButton
              fill
              iconType='save'
              isLoading={saving}
              isDisabled={!canChange}
              onClick={async () => {
                if (await save()) setReviewing(false);
              }}
            >
              Guardar
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}
    </>
  );
};
