import React, { useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextColor,
  EuiTitle,
} from '@elastic/eui';
import type { ENSProfile } from '../../../../common/ens/profiles/types';
import { setGroupValue } from '../../../../common/ens/profiles/groups';
import type { ENSParameterGroup } from '../profiles/parameter-groups';
import { ENSParameterEdit, ParameterValueEditor, emptyValueFor } from '../profiles/parameter-value-editor';
import { controlTitle } from '../profiles/parameter-titles';

interface GroupControlFlyoutProps {
  group: ENSProfile;
  control: ENSParameterGroup;
  readOnly: boolean;
  onApply: (next: ENSProfile) => void;
  onClose: () => void;
}

const editOf = (group: ENSProfile, controlId: string, parameterId: string): ENSParameterEdit | undefined => {
  const values = group.values?.[controlId];
  if (!values || !Object.prototype.hasOwnProperty.call(values, parameterId)) return undefined;
  return {
    value: values[parameterId],
    ...(group.match_modes?.[controlId]?.[parameterId] === 'regex' ? { matchMode: 'regex' as const } : {}),
    replace: (group.replace?.[controlId] || []).includes(parameterId),
  };
};

const withEdit = (group: ENSProfile, controlId: string, parameterId: string, edit: ENSParameterEdit | undefined): ENSProfile => {
  const next = setGroupValue(group, controlId, parameterId, edit?.value);
  const modes = { ...(next.match_modes || {}) };
  const controlModes = { ...(modes[controlId] || {}) };
  if (edit?.matchMode === 'regex') controlModes[parameterId] = 'regex';
  else delete controlModes[parameterId];
  if (Object.keys(controlModes).length) modes[controlId] = controlModes;
  else delete modes[controlId];
  const replace = { ...(next.replace || {}) };
  const controlReplace = (replace[controlId] || []).filter(id => id !== parameterId);
  if (edit?.replace) controlReplace.push(parameterId);
  if (controlReplace.length) replace[controlId] = controlReplace;
  else delete replace[controlId];
  const { match_modes: _modes, replace: _replace, ...rest } = next;
  return { ...rest, ...(Object.keys(modes).length ? { match_modes: modes } : {}), ...(Object.keys(replace).length ? { replace } : {}) };
};

export const GroupControlFlyout = ({ group, control, readOnly, onApply, onClose }: GroupControlFlyoutProps) => {
  const [draft, setDraft] = useState<ENSProfile>(group);
  const changed = JSON.stringify(draft) !== JSON.stringify(group);

  return (
    <EuiFlyout size='m' ownFocus onClose={onClose} aria-labelledby='ens-group-control-title'>
      <EuiFlyoutHeader hasBorder>
        <EuiText size='xs' color='subdued'>
          <code>{control.controlId}</code>
        </EuiText>
        <EuiTitle size='s'>
          <h2 id='ens-group-control-title'>{controlTitle(control.controlId)}</h2>
        </EuiTitle>
        <EuiText size='s' color='subdued'>
          <p>{`Grupo: ${group.name}`}</p>
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {control.parameters.map(parameter => {
          const edit = editOf(draft, control.controlId, parameter.parameterId);
          return (
            <React.Fragment key={parameter.parameterId}>
              <EuiPanel hasBorder paddingSize='m'>
                <EuiFlexGroup justifyContent='spaceBetween' alignItems='center' gutterSize='s' responsive={false}>
                  <EuiFlexItem>
                    <EuiText size='s'>
                      <strong>{parameter.label}</strong>{' '}
                      <EuiTextColor color='subdued'>
                        <small>{parameter.parameterId}</small>
                      </EuiTextColor>
                    </EuiText>
                  </EuiFlexItem>
                  {!edit && !readOnly && (
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        size='s'
                        iconType='plusInCircle'
                        onClick={() =>
                          setDraft(withEdit(draft, control.controlId, parameter.parameterId, { value: emptyValueFor(parameter.type), replace: false }))
                        }
                      >
                        Dar valor
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
                {edit ? (
                  <>
                    <EuiSpacer size='s' />
                    <ParameterValueEditor
                      controlId={control.controlId}
                      parameterId={parameter.parameterId}
                      edit={edit}
                      readOnly={readOnly}
                      onChange={next => setDraft(withEdit(draft, control.controlId, parameter.parameterId, next))}
                      onRemove={() => setDraft(withEdit(draft, control.controlId, parameter.parameterId, undefined))}
                    />
                  </>
                ) : (
                  <EuiText size='xs' color='subdued'>
                    <p>Sin valor en el grupo</p>
                  </EuiText>
                )}
              </EuiPanel>
              <EuiSpacer size='s' />
            </React.Fragment>
          );
        })}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent='flexEnd' gutterSize='s' responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              isDisabled={readOnly || !changed}
              onClick={() => {
                onApply(draft);
                onClose();
              }}
            >
              Aplicar al grupo
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
