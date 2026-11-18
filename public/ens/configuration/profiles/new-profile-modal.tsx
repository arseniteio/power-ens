import React, { useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
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
import { Choice as VisibleChoice } from '../../ui/choice';

interface NewProfileModalProps {
  onClose: () => void;
  onBlank: () => void;
  onDuplicate: (id: string) => void;
  onImport: () => void;
}

const Choice = ({ title, text, action, last = false, children }: { title: string; text: string; action: React.ReactNode; last?: boolean; children?: React.ReactNode }) => (
  <>
    <EuiFlexGroup gutterSize='m' alignItems='center' responsive={false}>
      <EuiFlexItem>
        <EuiText size='s'>
          <strong>{title}</strong>
        </EuiText>
        <EuiText size='xs' color='subdued'>
          <p>{text}</p>
        </EuiText>
        {children}
      </EuiFlexItem>
      <EuiFlexItem grow={false}>{action}</EuiFlexItem>
    </EuiFlexGroup>
    {!last && <EuiHorizontalRule margin='m' />}
  </>
);

export const NewProfileModal = ({ onClose, onBlank, onDuplicate, onImport }: NewProfileModalProps) => {
  const { working } = useProfileChanges();
  const [source, setSource] = useState<string | undefined>();
  const options = working
    .filter(entry => entry.errors.length === 0 && entry.staged !== 'deleted')
    .map(entry => ({ label: entry.profile.name, value: entry.profile.id, append: <EuiText size='xs' color='subdued'>{layerLabel(entry.profile.layer)}</EuiText> }));

  return (
    <EuiModal onClose={onClose} style={{ width: 620 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>Nuevo grupo</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <Choice title='En blanco' text='Sin condiciones ni valores' action={<EuiButton onClick={onBlank}>Empezar</EuiButton>} />
        <Choice
          title='A partir de uno existente'
          text='Copia de condiciones y valores'
          action={
            <EuiButton isDisabled={!source} onClick={() => source && onDuplicate(source)}>
              Copiar
            </EuiButton>
          }
        >
          <EuiSpacer size='s' />
          <VisibleChoice
            legend='Grupo de origen'
            options={options.map(option => ({ value: String(option.value), text: option.label }))}
            value={source || ''}
            onChange={setSource}
          />
        </Choice>
        <Choice
          title='Importar desde un fichero'
          text='YAML o JSON'
          action={<EuiButton onClick={onImport}>Importar</EuiButton>}
          last
        />
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancelar</EuiButtonEmpty>
      </EuiModalFooter>
    </EuiModal>
  );
};
