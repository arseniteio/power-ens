import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { ENS_PROFILE_LAYERS } from '../../../../common/ens/profiles/types';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { LoadingSpinner } from '../../../platform/loading-spinner';
import { ExportModal } from './export-modal';
import { ImportModal } from './import-modal';
import { NewProfileModal } from './new-profile-modal';
import { ENSWorkingProfile, useProfileChanges } from './profile-changes';
import { ProfileEditor } from './profile-editor';
import { LAYER_HELP, layerLabel, machines, matchText } from './profile-labels';
import { ProfileTag } from './profile-tag';
import { profilesClient } from './profiles-client';

interface ProfilesTabProps {
  target: ENSConfigurationTarget;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
}

type Dialog = 'new' | 'import' | 'export' | undefined;

const STAGED_LABELS: Record<NonNullable<ENSWorkingProfile['staged']>, { text: string; color: string }> = {
  new: { text: 'Nuevo, sin guardar', color: 'success' },
  changed: { text: 'Modificado, sin guardar', color: 'primary' },
  deleted: { text: 'Se eliminará al guardar', color: 'danger' },
};

const useProfileCounts = (revision: number | undefined) => {
  const [counts, setCounts] = useState<Record<string, number> | undefined>();
  React.useEffect(() => {
    let current = true;
    profilesClient
      .summary()
      .then(summary => current && setCounts(Object.fromEntries(summary.profiles.map(p => [p.id, p.count]))))
      .catch(() => current && setCounts({}));
    return () => {
      current = false;
    };
  }, [revision]);
  return counts;
};

const ProfileRow = ({
  entry,
  count,
  first,
  onOpen,
  onDuplicate,
}: {
  entry: ENSWorkingProfile;
  count?: number;
  first: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
}) => (
  <>
    {!first && <EuiHorizontalRule margin='s' />}
    <EuiFlexGroup gutterSize='m' alignItems='center' responsive={false}>
      <EuiFlexItem style={{ minWidth: 0 }}>
        <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiLink onClick={onOpen}>
              <ProfileTag name={entry.profile.name} layer={entry.profile.layer} prominent />
            </EuiLink>
          </EuiFlexItem>
          {entry.origin === 'builtin' && (
            <EuiFlexItem grow={false}>
              <EuiToolTip content='Viene con Power ENS. Al guardarlo con cambios, tu versión sustituye a la incluida.'>
                <EuiBadge color='default'>Incluido</EuiBadge>
              </EuiToolTip>
            </EuiFlexItem>
          )}
          {entry.origin === 'override' && !entry.staged && (
            <EuiFlexItem grow={false}>
              <EuiBadge color='hollow'>Sustituye al incluido</EuiBadge>
            </EuiFlexItem>
          )}
          {entry.staged && (
            <EuiFlexItem grow={false}>
              <EuiBadge color={STAGED_LABELS[entry.staged].color}>{STAGED_LABELS[entry.staged].text}</EuiBadge>
            </EuiFlexItem>
          )}
          {entry.errors.length > 0 && (
            <EuiFlexItem grow={false}>
              <EuiToolTip content={entry.errors.join('; ')}>
                <EuiBadge color='danger'>El motor lo ignora: no es válido</EuiBadge>
              </EuiToolTip>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        <EuiText size='xs' color='subdued'>
          <p>{matchText(entry.profile.match)}</p>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false} style={{ width: 130, textAlign: 'right' }}>
        <EuiText size='s'>
          <span>{entry.staged === 'new' || count === undefined ? '—' : machines(count)}</span>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize='xs' responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='s' onClick={onDuplicate}>
              Duplicar
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size='s' onClick={onOpen}>
              {entry.staged === 'deleted' ? 'Ver' : 'Editar'}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  </>
);

export const ProfilesTab = ({ target, onNavigate }: ProfilesTabProps) => {
  const { loading, loadError, working, reload, savedAt } = useProfileChanges();
  const counts = useProfileCounts(savedAt);
  const [dialog, setDialog] = useState<Dialog>();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      working
        .filter(entry => !q || `${entry.profile.id} ${entry.profile.name} ${entry.profile.description || ''}`.toLowerCase().includes(q))
        .sort((a, b) => a.profile.name.localeCompare(b.profile.name, 'es')),
    [working, q]
  );

  if (loading && !working.length) return <LoadingSpinner message='Cargando perfiles...' />;
  if (loadError) {
    return (
      <EuiCallOut color='danger' iconType='alert' title='No se pudieron cargar los perfiles'>
        <p>{loadError}</p>
        <EuiButton size='s' color='danger' onClick={reload}>
          Reintentar
        </EuiButton>
      </EuiCallOut>
    );
  }

  if (target.profileId) {
    return <ProfileEditor key={target.profileId} profileId={target.profileId} onClose={() => onNavigate({ view: 'profiles' })} />;
  }

  const layers = [...ENS_PROFILE_LAYERS, ...Array.from(new Set(shown.map(e => e.profile.layer).filter(l => !(ENS_PROFILE_LAYERS as string[]).includes(l))))];

  return (
    <>
      <EuiText size='s' color='subdued'>
        <p>
          Cada máquina recibe los perfiles cuyas condiciones cumple. Si dos perfiles dan valor al mismo parámetro, gana la capa más específica, de sitio
          a distribución. Las listas se suman entre capas.
        </p>
      </EuiText>
      <EuiSpacer size='m' />
      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
        <EuiFlexItem style={{ minWidth: 240 }}>
          <EuiFieldSearch fullWidth placeholder='Buscar un perfil' value={query} onChange={event => setQuery(event.target.value)} aria-label='Buscar un perfil' />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton iconType='importAction' onClick={() => setDialog('import')}>
            Importar
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton iconType='exportAction' onClick={() => setDialog('export')}>
            Exportar
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton fill iconType='plusInCircle' onClick={() => setDialog('new')}>
            Nuevo perfil
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='m' />

      {layers.map(layer => {
        const entries = shown.filter(entry => entry.profile.layer === layer);
        return (
          <React.Fragment key={layer}>
            <EuiPanel paddingSize='m' hasBorder>
              <EuiFlexGroup gutterSize='s' alignItems='baseline' responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiText size='s'>
                    <strong>{layerLabel(layer)}</strong>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size='xs' color='subdued'>
                    <span>{(LAYER_HELP as Record<string, string>)[layer] || ''}</span>
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiHorizontalRule margin='s' />
              {entries.length ? (
                entries.map((entry, index) => (
                  <ProfileRow
                    key={`${entry.profile.id}-${entry.origin}`}
                    entry={entry}
                    first={index === 0}
                    count={counts?.[entry.profile.id]}
                    onOpen={() => onNavigate({ view: 'profiles', profileId: entry.profile.id })}
                    onDuplicate={() => onNavigate({ view: 'profiles', profileId: `copia:${entry.profile.id}` })}
                  />
                ))
              ) : (
                <EuiText size='s' color='subdued'>
                  <p>{q ? 'Ningún perfil de esta capa coincide con la búsqueda.' : 'Ningún perfil en esta capa.'}</p>
                </EuiText>
              )}
            </EuiPanel>
            <EuiSpacer size='m' />
          </React.Fragment>
        );
      })}

      {dialog === 'new' && (
        <NewProfileModal
          onClose={() => setDialog(undefined)}
          onBlank={() => onNavigate({ view: 'profiles', profileId: 'nuevo' })}
          onDuplicate={id => onNavigate({ view: 'profiles', profileId: `copia:${id}` })}
          onImport={() => setDialog('import')}
        />
      )}
      {dialog === 'import' && <ImportModal onClose={() => setDialog(undefined)} />}
      {dialog === 'export' && <ExportModal onClose={() => setDialog(undefined)} />}
    </>
  );
};
