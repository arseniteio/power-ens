import React, { useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type { ENSConfigurationVersion, ENSControlConfiguration } from '../../../../common/ens/configuration/types';
import { ENS_NO_TEMPLATE, ENS_SYSTEM_TYPE_LABELS } from '../../../../common/agent-configuration';
import { ENSControlTemplate, getControlTemplates } from '../../../../common/ens/configuration/templates';
import {
  ENSTemplateInput,
  createControlTemplate,
  deleteControlTemplate,
  duplicateControlTemplate,
  getTemplateUsage,
  updateControlTemplate,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import { ConfirmModal, errorMessage } from './confirm-modal';
import { ENSTemplateEditorMode, TemplateEditorModal, templateParameters } from './template-editor-modal';

interface ControlTemplatesPanelProps {
  configuration: ENSConfigurationVersion;
  control: ENSControlConfiguration;
  onConfigurationSaved: () => void;
}

type Editor = { mode: ENSTemplateEditorMode; template?: ENSControlTemplate } | undefined;

const TYPE_DEFAULT = '';

// «Plantillas»: built-in ones (read-only, duplicated to customise) and custom ones (create, edit, delete).
export const ControlTemplatesPanel = ({ configuration, control, onConfigurationSaved }: ControlTemplatesPanelProps) => {
  const controlId = control.controlId;
  const templates = getControlTemplates(configuration, controlId);
  const total = templateParameters(control).length;
  const [editor, setEditor] = useState<Editor>();
  const [removal, setRemoval] = useState<ENSControlTemplate | undefined>();
  const [reassignTo, setReassignTo] = useState<string>(TYPE_DEFAULT);
  const [notice, setNotice] = useState<{ color: 'success' | 'danger'; text: string } | undefined>();

  const save = async (
    build: (latest: ENSConfigurationVersion) => ENSConfigurationVersion,
    reason: string
  ): Promise<string | undefined> => {
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: build(latest), reason }));
      setNotice({ color: 'success', text: reason });
      onConfigurationSaved();
      return undefined;
    } catch (failure) {
      return errorMessage(failure);
    }
  };

  const duplicate = async (template: ENSControlTemplate) => {
    let created = '';
    const failure = await save(latest => {
      const result = duplicateControlTemplate(latest, controlId, template.id);
      created = result.template.name;
      return result.configuration;
    }, `${controlId}: plantilla «${template.name}» duplicada.`);
    if (failure) setNotice({ color: 'danger', text: failure });
    else if (created) setNotice({ color: 'success', text: `${controlId}: plantilla «${created}» creada a partir de «${template.name}».` });
  };

  const saveEditor = async (input: Omit<ENSTemplateInput, 'controlId'>) => {
    const current = editor?.template;
    const failure = current && editor?.mode === 'edit'
      ? await save(latest => updateControlTemplate(latest, current.id, input), `${controlId}: plantilla «${input.name}» guardada.`)
      : await save(latest => createControlTemplate(latest, { ...input, controlId }).configuration, `${controlId}: plantilla «${input.name}» creada.`);
    if (!failure) setEditor(undefined);
    return failure;
  };

  const usage = (template: ENSControlTemplate) => getTemplateUsage(configuration, controlId, template.id);

  const confirmRemoval = async () => {
    if (!removal) return undefined;
    const users = usage(removal);
    const target = reassignTo === TYPE_DEFAULT ? undefined : reassignTo;
    const failure = await save(
      latest => deleteControlTemplate(latest, removal.id, users.length ? { templateId: target } : undefined),
      `${controlId}: plantilla «${removal.name}» borrada${users.length ? `; ${users.join(', ')} pasan a ${target === undefined ? 'la de serie de su tipo' : target === ENS_NO_TEMPLATE ? 'sin plantilla' : `«${templates.find(item => item.id === target)?.name || target}»`}` : ''}.`
    );
    if (!failure) setRemoval(undefined);
    return failure;
  };

  const columns = [
    {
      field: 'name',
      name: 'Plantilla',
      render: (name: string, template: ENSControlTemplate) => (
        <span>
          {name}{' '}
          <EuiBadge color={template.builtin ? 'hollow' : 'primary'}>{template.builtin ? 'De serie' : 'Propia'}</EuiBadge>
          {template.builtin && !template.typeDefault && <EuiBadge color='default'>alternativa</EuiBadge>}
        </span>
      ),
    },
    {
      field: 'systemType',
      name: 'Tipo',
      render: (type: ENSControlTemplate['systemType']) => (type ? ENS_SYSTEM_TYPE_LABELS[type] : 'Cualquiera'),
    },
    {
      field: 'values',
      name: 'Valores',
      render: (values: ENSControlTemplate['values']) => `${Object.keys(values).length} de ${total}`,
    },
    {
      field: 'id',
      name: 'Asignada a',
      render: (_id: string, template: ENSControlTemplate) => {
        const users = usage(template);
        return users.length ? `${users.length} agente(s)` : template.typeDefault ? 'por tipo' : '—';
      },
    },
    {
      field: 'id',
      name: 'Acciones',
      render: (_id: string, template: ENSControlTemplate) => (
        <span>
          <EuiButtonEmpty size='xs' onClick={() => setEditor({ mode: 'view', template })}>Ver</EuiButtonEmpty>
          <EuiButtonEmpty size='xs' onClick={() => duplicate(template)}>Duplicar</EuiButtonEmpty>
          {!template.builtin && (
            <>
              <EuiButtonEmpty size='xs' onClick={() => setEditor({ mode: 'edit', template })}>Editar</EuiButtonEmpty>
              <EuiButtonEmpty size='xs' color='danger' onClick={() => { setReassignTo(TYPE_DEFAULT); setRemoval(template); }}>Borrar</EuiButtonEmpty>
            </>
          )}
        </span>
      ),
    },
  ];

  const removalUsers = removal ? usage(removal) : [];

  return (
    <>
      <EuiTitle size='s'>
        <h3>Plantillas</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>
          Conjuntos de valores con nombre para los parámetros por sistema y por plataforma. La de serie de cada tipo
          se aplica a los agentes de ese tipo sin plantilla asignada. Las de serie no se editan: se duplican.
        </p>
      </EuiText>
      <EuiSpacer size='s' />

      {notice && (
        <>
          <EuiCallOut color={notice.color} iconType={notice.color === 'success' ? 'check' : 'alert'} size='s' title={notice.text} />
          <EuiSpacer size='s' />
        </>
      )}

      <EuiBasicTable items={templates} itemId='id' columns={columns as any} noItemsMessage='Este control no tiene plantillas.' />
      <EuiSpacer size='s' />
      <EuiButton size='s' iconType='plusInCircle' onClick={() => setEditor({ mode: 'create' })}>
        Crear plantilla
      </EuiButton>

      {editor && (
        <TemplateEditorModal
          mode={editor.mode}
          control={control}
          template={editor.template}
          usage={editor.template ? usage(editor.template) : []}
          onCancel={() => setEditor(undefined)}
          onSave={saveEditor}
        />
      )}

      {removal && (
        <ConfirmModal
          title={`Borrar la plantilla «${removal.name}»`}
          confirmLabel='Borrar'
          danger
          typedWord={removalUsers.length ? 'borrar' : undefined}
          onCancel={() => setRemoval(undefined)}
          onConfirm={confirmRemoval}
        >
          <EuiText size='s'>
            {removalUsers.length ? (
              <p>Está asignada a {removalUsers.length} agente(s): {removalUsers.join(', ')}. Antes de borrarla se les asigna otra.</p>
            ) : (
              <p>No está asignada a ningún agente.</p>
            )}
            <p>La versión anterior queda en el historial.</p>
          </EuiText>
          {removalUsers.length > 0 && (
            <EuiFormRow label='Reasignar sus agentes a'>
              <EuiSelect
                options={[
                  { value: TYPE_DEFAULT, text: 'La de serie de su tipo' },
                  ...templates.filter(item => item.id !== removal.id).map(item => ({ value: item.id, text: item.name })),
                  { value: ENS_NO_TEMPLATE, text: 'Sin plantilla (valores comunes)' },
                ]}
                value={reassignTo}
                onChange={event => setReassignTo(event.target.value)}
              />
            </EuiFormRow>
          )}
        </ConfirmModal>
      )}
    </>
  );
};
