import React, { useEffect, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiCodeBlock,
  EuiComboBox,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { useProfileChanges } from './profile-changes';
import { layerLabel } from './profile-labels';
import { profilesClient } from './profiles-client';

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/yaml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const ExportModal = ({ onClose }: { onClose: () => void }) => {
  const { listed, changes } = useProfileChanges();
  const [scope, setScope] = useState<'all' | 'some'>('all');
  const [ids, setIds] = useState<string[]>([]);
  const [yaml, setYaml] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const options = listed
    .filter(entry => entry.errors.length === 0)
    .map(entry => ({ label: entry.profile.name, value: entry.profile.id, append: <EuiText size='xs' color='subdued'>{layerLabel(entry.profile.layer)}</EuiText> }));
  const chosen = scope === 'all' ? [] : ids;

  useEffect(() => {
    if (scope === 'some' && !ids.length) {
      setYaml(undefined);
      return;
    }
    let current = true;
    setLoading(true);
    profilesClient
      .exportYaml(scope === 'all' ? [] : ids)
      .then(text => {
        if (!current) return;
        setYaml(text);
        setError(undefined);
      })
      .catch(failure => current && setError(failure?.message || String(failure)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [scope, ids]);

  const fileName = chosen.length === 1 ? `${chosen[0]}.yaml` : 'perfiles-ens.yaml';

  return (
    <EuiModal onClose={onClose} style={{ width: 760 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>Exportar grupos</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        {changes.length > 0 && (
          <>
            <EuiSpacer size='s' />
            <EuiCallOut size='s' color='warning' iconType='iInCircle' title='Solo lo guardado' />
          </>
        )}
        <EuiSpacer size='m' />
        <EuiButtonGroup
          legend='Grupos a exportar'
          options={[
            { id: 'all', label: 'Todos' },
            { id: 'some', label: 'Elegir' },
          ]}
          idSelected={scope}
          onChange={id => setScope(id as 'all' | 'some')}
          buttonSize='compressed'
        />
        {scope === 'some' && (
          <>
            <EuiSpacer size='s' />
            <EuiComboBox
              fullWidth
              placeholder='Buscar grupo'
              options={options}
              selectedOptions={options.filter(option => ids.includes(option.value))}
              onChange={selected => setIds(selected.map(option => option.value as string))}
              aria-label='Grupos a exportar'
            />
          </>
        )}
        <EuiSpacer size='m' />
        {error && <EuiCallOut size='s' color='danger' iconType='alert' title={error} />}
        {!error && yaml !== undefined && (
          <EuiCodeBlock language='yaml' fontSize='s' paddingSize='s' overflowHeight={360} isCopyable>
            {yaml}
          </EuiCodeBlock>
        )}
        {!error && scope === 'some' && !ids.length && (
          <EuiText size='s' color='subdued'>
            <p>Ningún grupo elegido</p>
          </EuiText>
        )}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cerrar</EuiButtonEmpty>
        <EuiButton fill iconType='download' isLoading={loading} isDisabled={!yaml} onClick={() => yaml && download(fileName, yaml)}>
          Descargar
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
