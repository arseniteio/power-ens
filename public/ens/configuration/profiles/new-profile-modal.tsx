import React, { useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiComboBox,
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
  const selected = options.filter(option => option.value === source);

  return (
    <EuiModal onClose={onClose} style={{ width: 620 }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>Nuevo perfil</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <Choice title='En blanco' text='Eliges las condiciones y los valores desde cero.' action={<EuiButton onClick={onBlank}>Empezar</EuiButton>} />
        <Choice
          title='A partir de uno existente'
          text='Copia sus condiciones y sus valores; después cambias lo que haga falta.'
          action={
            <EuiButton isDisabled={!source} onClick={() => source && onDuplicate(source)}>
              Copiar
            </EuiButton>
          }
        >
          <EuiSpacer size='s' />
          <EuiComboBox
            compressed
            fullWidth
            placeholder='Escribe para buscar un perfil'
            singleSelection={{ asPlainText: true }}
            options={options}
            selectedOptions={selected}
            onChange={choice => setSource(choice[0]?.value)}
            aria-label='Perfil que copiar'
          />
        </Choice>
        <Choice
          title='Importar desde un fichero'
          text='YAML o JSON, con uno o varios perfiles. Antes de aplicar nada ves qué se crea, qué cambia y qué errores hay.'
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
