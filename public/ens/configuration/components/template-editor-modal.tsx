import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import type {
  ENSAgentParameterValue,
  ENSControlConfiguration,
  ENSControlParameter,
  ENSSystemType,
} from '../../../../common/ens/configuration/types';
import { ENS_SYSTEM_TYPES, ENS_SYSTEM_TYPE_LABELS } from '../../../../common/agent-configuration';
import { ENSControlTemplate, describeTemplate } from '../../../../common/ens/configuration/templates';
import type { ENSTemplateInput } from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { getParameterClass, isAgentLevelParameter } from '../../../../common/ens/configuration/agents/parameter-classes';
import { isEmptyParameterValue } from '../../../../common/ens/configuration/services/parameter-value-validator';
import { ParameterRendererFactory } from '../form-engine';
import { valueRows } from './agent-parameter-row';

export type ENSTemplateEditorMode = 'view' | 'create' | 'edit';

interface TemplateEditorModalProps {
  mode: ENSTemplateEditorMode;
  control: ENSControlConfiguration;
  template?: ENSControlTemplate;
  // Labels of the agents that have it assigned.
  usage: string[];
  onCancel: () => void;
  // Returns the error to show, or nothing.
  onSave: (input: Omit<ENSTemplateInput, 'controlId'>) => Promise<string | undefined>;
}

const Rows = ({ rows }: { rows: string[] }) =>
  rows.length ? <ul>{rows.map((row, index) => <li key={`${index}-${row}`}>{row}</li>)}</ul> : null;

export const templateParameters = (control: ENSControlConfiguration): ENSControlParameter[] =>
  control.parameters.filter(parameter => isAgentLevelParameter(control.controlId, parameter.id));

const TITLES: Record<ENSTemplateEditorMode, string> = {
  view: 'Plantilla',
  create: 'Crear plantilla',
  edit: 'Editar plantilla',
};

export const TemplateEditorModal = ({ mode, control, template, usage, onCancel, onSave }: TemplateEditorModalProps) => {
  const readOnly = mode === 'view';
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [systemType, setSystemType] = useState<string>(template?.systemType || '');
  const [values, setValues] = useState<Record<string, ENSAgentParameterValue | undefined>>(() => ({ ...(template?.values || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const save = async () => {
    setSaving(true);
    setError(undefined);
    const clean: Record<string, ENSAgentParameterValue> = {};
    Object.entries(values).forEach(([parameterId, value]) => {
      const typed = value as ENSAgentParameterValue | undefined;
      if (typed !== undefined && !isEmptyParameterValue(typed)) clean[parameterId] = typed;
    });
    const failure = await onSave({
      name,
      description,
      systemType: (systemType || undefined) as ENSSystemType | undefined,
      values: clean,
    });
    if (failure) {
      setSaving(false);
      setError(failure);
    }
  };

  return (
    <EuiModal onClose={onCancel} style={{ width: 900 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h3>{`${TITLES[mode]}${readOnly && template ? ` «${template.name}»` : ''} · ${control.controlId}`}</h3>
        </EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        {template && (
          <EuiBadge color={template.builtin ? 'hollow' : 'primary'}>{template.builtin ? 'De serie' : 'Propia'}</EuiBadge>
        )}
        {usage.length > 0 && (
          <EuiText size='s' color='subdued'>
            <p>Asignada a {usage.length} agente(s): {usage.join(', ')}.</p>
          </EuiText>
        )}
        {readOnly ? (
          <EuiText size='s'>
            {template && describeTemplate(template) && <p>{describeTemplate(template)}</p>}
            {template?.systemType && <p>Tipo de sistema: {ENS_SYSTEM_TYPE_LABELS[template.systemType]}</p>}
            {template?.sources && template.sources.length > 0 && <p>Origen de los valores: {template.sources.join('; ')}.</p>}
          </EuiText>
        ) : (
          <>
            <EuiFormRow label='Nombre' fullWidth>
              <EuiFieldText value={name} fullWidth onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)} />
            </EuiFormRow>
            <EuiFormRow label='Descripción' fullWidth>
              <EuiFieldText value={description} fullWidth onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDescription(event.target.value)} />
            </EuiFormRow>
            <EuiFormRow label='Tipo de sistema' helpText='Informativo: avisa al asignarla a un agente de otro tipo.'>
              <EuiSelect
                options={[{ value: '', text: 'Cualquiera' }, ...ENS_SYSTEM_TYPES.map(type => ({ value: type, text: ENS_SYSTEM_TYPE_LABELS[type] }))]}
                value={systemType}
                onChange={event => setSystemType(event.target.value)}
              />
            </EuiFormRow>
          </>
        )}

        <EuiSpacer size='m' />

        {templateParameters(control).map(parameter => {
          const value = values[parameter.id];
          const empty = value === undefined || isEmptyParameterValue(value);
          return (
            <React.Fragment key={parameter.id}>
              <EuiPanel paddingSize='s'>
                <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
                  <EuiFlexItem grow={false}>
                    <EuiText size='s'><strong>{parameter.id} · {parameter.label}</strong></EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color='hollow'>{getParameterClass(control.controlId, parameter.id) === 'system' ? 'propio de cada agente' : 'de la plataforma'}</EuiBadge>
                  </EuiFlexItem>
                  {empty && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color='default'>sin valor: toma el valor común</EuiBadge>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
                {readOnly ? (
                  <EuiText size='xs'><Rows rows={valueRows(parameter, value as ENSControlParameter['value'])} /></EuiText>
                ) : (
                  <>
                    <ParameterRendererFactory
                      parameter={parameter}
                      value={value as ENSControlParameter['value']}
                      onChange={(_name, next) => setValues(current => ({ ...current, [parameter.id]: next as ENSAgentParameterValue }))}
                    />
                    {!empty && (
                      <EuiButtonEmpty size='xs' color='danger' onClick={() => setValues(current => ({ ...current, [parameter.id]: undefined }))}>
                        Vaciar (valor común)
                      </EuiButtonEmpty>
                    )}
                  </>
                )}
              </EuiPanel>
              <EuiSpacer size='s' />
            </React.Fragment>
          );
        })}

        {error && <EuiCallOut color='danger' iconType='alert' size='s' title={error} />}
      </EuiModalBody>

      <EuiModalFooter>
        <EuiButtonEmpty onClick={onCancel}>{readOnly ? 'Cerrar' : 'Cancelar'}</EuiButtonEmpty>
        {!readOnly && (
          <EuiButton fill isLoading={saving} onClick={save}>
            Guardar plantilla
          </EuiButton>
        )}
      </EuiModalFooter>
    </EuiModal>
  );
};
