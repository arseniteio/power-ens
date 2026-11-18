import React, { useState } from 'react';
import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiSwitch,
  EuiTextArea,
  EuiTextColor,
} from '@elastic/eui';
import type { ENSAgentParameterValue, ENSMatchMode } from '../../../../common/agent-configuration';
import { compileParameterPattern } from '../../../../common/ens/configuration/services/parameter-pattern';
import { checkProfileValue, lookupCatalogParameter } from '../../../../common/ens/profiles/validate';

export interface ENSParameterEdit {
  value: ENSAgentParameterValue;
  matchMode?: ENSMatchMode;
  replace: boolean;
}

interface ParameterValueEditorProps {
  controlId: string;
  parameterId: string;
  edit: ENSParameterEdit;
  readOnly: boolean;
  onChange: (edit: ENSParameterEdit) => void;
  onRemove: () => void;
}

const linesOf = (value: unknown): string => (Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : '');

const itemsOf = (text: string): string[] =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

export const emptyValueFor = (type: string): ENSAgentParameterValue => {
  if (type === 'boolean') return false;
  if (type === 'number' || type === 'duration_days' || type === 'duration_hours') return 0;
  if (type === 'list' || type === 'table') return [];
  return '';
};

const patternProblem = (value: unknown): string | undefined => {
  try {
    compileParameterPattern(value);
    return undefined;
  } catch (error: any) {
    return error?.message || String(error);
  }
};

export const ParameterValueEditor = ({ controlId, parameterId, edit, readOnly, onChange, onRemove }: ParameterValueEditorProps) => {
  const parameter = lookupCatalogParameter(controlId, parameterId);
  const [text, setText] = useState(() => linesOf(edit.value));
  if (!parameter) return null;

  const isList = parameter.type === 'list' || parameter.type === 'table';
  const isRegex = edit.matchMode === 'regex';
  const columns = parameter.columns;
  const problem = isRegex ? patternProblem(edit.value) : checkProfileValue(parameter, edit.value, edit.matchMode);
  const help = parameter.type === 'table' && columns?.length ? `Formato: ${columns.map(c => c.label).join(' | ')}` : isList ? 'Un valor por línea' : undefined;

  const setList = (next: string) => {
    setText(next);
    onChange({ ...edit, value: itemsOf(next) });
  };

  const field = () => {
    if (isList && isRegex) {
      return (
        <EuiFieldText
          fullWidth
          compressed
          value={typeof edit.value === 'string' ? edit.value : ''}
          readOnly={readOnly}
          onChange={event => onChange({ ...edit, value: event.target.value })}
          style={{ fontFamily: 'Roboto Mono, Menlo, monospace' }}
          aria-label={parameter.label}
        />
      );
    }
    if (isList) {
      return (
        <EuiTextArea
          fullWidth
          compressed
          rows={Math.min(10, Math.max(3, itemsOf(text).length + 1))}
          value={text}
          readOnly={readOnly}
          onChange={event => setList(event.target.value)}
          style={{ fontFamily: 'Roboto Mono, Menlo, monospace', fontSize: 12 }}
          aria-label={parameter.label}
        />
      );
    }
    if (parameter.type === 'boolean') {
      return (
        <EuiButtonGroup
          legend={parameter.label || parameterId}
          options={[
            { id: 'yes', label: 'Sí' },
            { id: 'no', label: 'No' },
          ]}
          idSelected={edit.value === true ? 'yes' : 'no'}
          isDisabled={readOnly}
          onChange={id => onChange({ ...edit, value: id === 'yes' })}
          buttonSize='compressed'
        />
      );
    }
    if (parameter.type === 'number' || parameter.type === 'duration_days' || parameter.type === 'duration_hours') {
      return (
        <EuiFieldNumber
          compressed
          value={typeof edit.value === 'number' ? edit.value : ''}
          readOnly={readOnly}
          onChange={event => onChange({ ...edit, value: event.target.value === '' ? '' : Number(event.target.value) })}
          aria-label={parameter.label}
        />
      );
    }
    return (
      <EuiFieldText fullWidth compressed value={String(edit.value ?? '')} readOnly={readOnly} onChange={event => onChange({ ...edit, value: event.target.value })} aria-label={parameter.label} />
    );
  };

  return (
    <>
      <EuiFlexGroup gutterSize='s' alignItems='flexStart' responsive={false}>
        <EuiFlexItem>
          <EuiFormRow
            fullWidth
            label={
              <span>
                {parameter.label || parameterId}{' '}
                <EuiTextColor color='subdued'>
                  <code>{`${controlId} ${parameterId}`}</code>
                </EuiTextColor>
              </span>
            }
            helpText={problem ? undefined : isList && !isRegex ? `${itemsOf(text).length} ${itemsOf(text).length === 1 ? 'valor' : 'valores'}. ${help}` : help}
            isInvalid={Boolean(problem)}
            error={problem}
          >
            {field()}
          </EuiFormRow>
        </EuiFlexItem>
        {!readOnly && (
          <EuiFlexItem grow={false} style={{ paddingTop: 22 }}>
            <EuiButtonIcon iconType='cross' color='danger' aria-label={`Quitar ${parameter.label || parameterId} del grupo`} onClick={onRemove} />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {isList && (
        <>
          <EuiSpacer size='xs' />
          <EuiFlexGroup gutterSize='m' responsive={false} alignItems='center' wrap>
            {parameter.pattern && (
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  legend='Forma del valor'
                  options={[
                    { id: 'exact', label: 'Lista' },
                    { id: 'regex', label: 'Expresión regular' },
                  ]}
                  idSelected={isRegex ? 'regex' : 'exact'}
                  isDisabled={readOnly}
                  onChange={id => {
                    if (id === 'regex') onChange({ ...edit, matchMode: 'regex', value: '', replace: false });
                    else {
                      setText('');
                      onChange({ ...edit, matchMode: undefined, value: [] });
                    }
                  }}
                  buttonSize='compressed'
                />
              </EuiFlexItem>
            )}
            {!isRegex && (
              <EuiFlexItem grow={false}>
                <EuiSwitch
                  compressed
                  label='Sustituir en lugar de sumar'
                  checked={edit.replace}
                  disabled={readOnly}
                  onChange={event => onChange({ ...edit, replace: event.target.checked })}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}
      <EuiSpacer size='m' />
    </>
  );
};
