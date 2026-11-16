import React, { useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiFilePicker,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
  EuiTextArea,
} from '@elastic/eui';
import type { ENSImportItem, ENSImportStatus } from '../../../../common/ens/profiles/import-plan';
import { useProfileChanges } from './profile-changes';
import { layerLabel } from './profile-labels';
import { profilesClient } from './profiles-client';

const STATUS: Record<ENSImportStatus, { text: string; color: string }> = {
  new: { text: 'Nuevo', color: 'success' },
  changed: { text: 'Cambia', color: 'primary' },
  same: { text: 'Igual', color: 'hollow' },
  invalid: { text: 'Con errores', color: 'danger' },
};

const MAX_BYTES = 5 * 1024 * 1024;

const readFiles = async (files: File[]): Promise<string> => {
  const texts = await Promise.all(files.map(file => file.text()));
  return texts.map(text => text.trim()).join('\n---\n');
};

const countText = (items: ENSImportItem[]): string => {
  const count = (status: ENSImportStatus) => items.filter(item => item.status === status).length;
  const parts = [
    [count('new'), 'nuevo', 'nuevos'],
    [count('changed'), 'cambia', 'cambian'],
    [count('same'), 'igual', 'iguales'],
    [count('invalid'), 'con errores', 'con errores'],
  ] as Array<[number, string, string]>;
  return parts
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join(', ');
};

export const ImportModal = ({ onClose }: { onClose: () => void }) => {
  const { stageUpsert } = useProfileChanges();
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [items, setItems] = useState<ENSImportItem[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [reading, setReading] = useState(false);

  const plan = async () => {
    setError(undefined);
    setItems(undefined);
    setReading(true);
    try {
      const content = mode === 'file' ? await readFiles(files) : text;
      if (new Blob([content]).size > MAX_BYTES) throw new Error('El contenido ocupa más de 5 MB.');
      setItems((await profilesClient.planImport(content)).items);
    } catch (failure: any) {
      setError(failure?.message || String(failure));
    } finally {
      setReading(false);
    }
  };

  const importable = (items || []).filter(item => item.status === 'new' || item.status === 'changed');
  const stage = () => {
    importable.forEach(item => stageUpsert(item.profile));
    onClose();
  };

  const columns: Array<EuiBasicTableColumn<ENSImportItem>> = [
    { field: 'status', name: 'Resultado', width: '120px', render: (status: ENSImportStatus) => <EuiBadge color={STATUS[status].color}>{STATUS[status].text}</EuiBadge> },
    {
      field: 'name',
      name: 'Perfil',
      render: (_name: string, item: ENSImportItem) => (
        <EuiText size='s'>
          <strong>{item.name || 'Sin nombre'}</strong>
          <EuiText size='xs' color='subdued'>
            <code>{item.id || 'sin identificador'}</code>
            {item.layer ? ` · ${layerLabel(item.layer)}` : ''}
          </EuiText>
        </EuiText>
      ),
    },
    {
      field: 'changes',
      name: 'Detalle',
      render: (_changes: string[], item: ENSImportItem) => {
        if (item.status === 'invalid') {
          return (
            <EuiText size='xs' color='danger'>
              <ul>
                {item.errors.map(message => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </EuiText>
          );
        }
        if (item.status === 'changed') return <EuiText size='xs'>{`Cambia: ${item.changes.join(', ')}`}</EuiText>;
        if (item.status === 'new') return <EuiText size='xs'>{item.replacesBuiltin ? `Sustituirá al perfil incluido con el mismo identificador. Cambia: ${item.changes.join(', ')}` : 'Se creará'}</EuiText>;
        return <EuiText size='xs' color='subdued'>Ya está así; no se toca</EuiText>;
      },
    },
  ];

  const ready = mode === 'file' ? files.length > 0 : text.trim().length > 0;

  return (
    <EuiModal onClose={onClose} style={{ width: 820 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>Importar perfiles</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText size='s' color='subdued'>
          <p>
            YAML o JSON con uno o varios perfiles, en el formato que exporta esta pantalla y que lee oscompliance-policy. Nada se escribe hasta que pulsas
            Guardar en la barra inferior.
          </p>
        </EuiText>
        <EuiSpacer size='m' />
        <EuiButtonGroup
          legend='Origen de los perfiles'
          options={[
            { id: 'file', label: 'Desde ficheros' },
            { id: 'text', label: 'Pegar texto' },
          ]}
          idSelected={mode}
          onChange={id => {
            setMode(id as 'file' | 'text');
            setItems(undefined);
          }}
          buttonSize='compressed'
        />
        <EuiSpacer size='m' />
        {mode === 'file' ? (
          <EuiFilePicker
            multiple
            fullWidth
            accept='.yaml,.yml,.json'
            initialPromptText='Arrastra aquí los ficheros .yaml, .yml o .json, o pulsa para elegirlos'
            onChange={list => {
              setFiles(list ? Array.from(list) : []);
              setItems(undefined);
            }}
            display='large'
          />
        ) : (
          <EuiTextArea
            fullWidth
            rows={12}
            value={text}
            placeholder={'id: zimbra\nname: Zimbra\nlayer: service\nmatch:\n  - field: service\n    op: has\n    value: zimbra\nvalues:\n  op.acc.1:\n    P-03: [zimbra, postfix]'}
            onChange={event => {
              setText(event.target.value);
              setItems(undefined);
            }}
            style={{ fontFamily: 'Roboto Mono, Menlo, monospace', fontSize: 12 }}
            aria-label='Perfiles en YAML o JSON'
          />
        )}
        <EuiSpacer size='m' />
        {error && (
          <>
            <EuiCallOut size='s' color='danger' iconType='alert' title={error} />
            <EuiSpacer size='m' />
          </>
        )}
        {items && (
          <>
            <EuiText size='s'>
              <h4>Qué se importará</h4>
              <p>{countText(items)}.</p>
            </EuiText>
            <EuiSpacer size='s' />
            <EuiBasicTable items={items} columns={columns} itemId={(item: ENSImportItem) => String(items.indexOf(item))} tableLayout='auto' />
          </>
        )}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
        {!items ? (
          <EuiButton fill onClick={plan} isLoading={reading} isDisabled={!ready}>
            Comprobar
          </EuiButton>
        ) : (
          <EuiButton fill onClick={stage} isDisabled={!importable.length}>
            {importable.length ? `Añadir al cambio (${importable.length})` : 'Nada que importar'}
          </EuiButton>
        )}
      </EuiModalFooter>
    </EuiModal>
  );
};
