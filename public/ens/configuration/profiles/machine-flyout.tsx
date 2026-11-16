import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonGroup,
  EuiCallOut,
  EuiDescriptionList,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { isEmptyValue } from '../../../../common/ens/profiles/resolve';
import type { ENSResolvedParameter } from '../../../../common/ens/profiles/resolve';
import { ageLabel } from '../../../../common/ens/core/date-label';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { LoadingSpinner } from '../../../platform/loading-spinner';
import { controlTitle } from './parameter-titles';
import { FIELD_LABELS, hostLabel, layerLabel, matchText, roleLabel, signalSourceText } from './profile-labels';
import { ProfileTag } from './profile-tag';
import { ENSHostDetail, profilesClient } from './profiles-client';
import { originText, valueText } from './value-text';

interface MachineFlyoutProps {
  agentId: string;
  onClose: () => void;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
}

type Section = 'values' | 'profiles' | 'identity';
type ValueFilter = 'all' | 'set' | 'unset';

const VALUE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'set', label: 'Con valor' },
  { id: 'unset', label: 'Sin valor' },
];

const ORIGIN_COLORS: Record<string, string> = {
  agent: 'accent',
  template: 'primary',
  'type-template': 'hollow',
  organisation: 'hollow',
  profile: 'success',
};

const ValueRow = ({ parameter }: { parameter: ENSResolvedParameter }) => {
  const empty = isEmptyValue(parameter.value);
  const firstProfile = parameter.sources.find(source => source.kind === 'profile');
  return (
    <>
      <EuiFlexGroup gutterSize='s' justifyContent='spaceBetween' responsive={false}>
        <EuiFlexItem>
          <EuiText size='s'>
            <strong>{parameter.label}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size='xs' color='subdued'>
            <code>{`${parameter.controlId} ${parameter.parameterId}`}</code>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiText size='xs' color={empty ? 'subdued' : 'default'}>
        <p style={{ wordBreak: 'break-word' }}>{valueText(parameter)}</p>
      </EuiText>
      <EuiSpacer size='xs' />
      <EuiBadge color={empty ? 'warning' : ORIGIN_COLORS[parameter.sources[0]?.kind] || 'hollow'}>{originText(parameter.sources)}</EuiBadge>
      {firstProfile && parameter.sources.length > 1 && (
        <EuiText size='xs' color='subdued'>
          <p>Las listas se suman entre capas, de la más específica a la menos.</p>
        </EuiText>
      )}
      <EuiHorizontalRule margin='s' />
    </>
  );
};

const ValuesSection = ({ detail }: { detail: ENSHostDetail }) => {
  const [filter, setFilter] = useState<ValueFilter>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = detail.parameters.filter(parameter => {
    const empty = isEmptyValue(parameter.value);
    if ((filter === 'set' && empty) || (filter === 'unset' && !empty)) return false;
    return !q || `${parameter.controlId} ${parameter.parameterId} ${parameter.label}`.toLowerCase().includes(q);
  });
  const byControl = useMemo(() => {
    const groups = new Map<string, ENSResolvedParameter[]>();
    shown.forEach(parameter => groups.set(parameter.controlId, [...(groups.get(parameter.controlId) || []), parameter]));
    return Array.from(groups.entries());
  }, [shown]);
  const unset = detail.parameters.filter(parameter => isEmptyValue(parameter.value)).length;

  return (
    <>
      <EuiText size='s' color='subdued'>
        <p>
          {`Los ${detail.parameters.length} parámetros que se fijan por máquina, con el valor que el motor usará en su siguiente pasada y de dónde sale. ${
            unset ? `${unset} no tienen valor.` : 'Todos tienen valor.'
          }`}
        </p>
      </EuiText>
      <EuiSpacer size='s' />
      <EuiFlexGroup gutterSize='s' responsive={false} alignItems='center'>
        <EuiFlexItem>
          <EuiFieldSearch compressed fullWidth placeholder='Buscar un parámetro o un control' value={query} onChange={event => setQuery(event.target.value)} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend='Qué parámetros mostrar'
            options={VALUE_FILTERS}
            idSelected={filter}
            onChange={id => setFilter(id as ValueFilter)}
            buttonSize='compressed'
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size='m' />
      {byControl.length === 0 && (
        <EuiText size='s' color='subdued'>
          <p>Ningún parámetro coincide.</p>
        </EuiText>
      )}
      {byControl.map(([controlId, parameters]) => (
        <React.Fragment key={controlId}>
          <EuiTitle size='xxs'>
            <h4>{`${controlId} · ${controlTitle(controlId)}`}</h4>
          </EuiTitle>
          <EuiSpacer size='s' />
          {parameters.map(parameter => (
            <ValueRow key={parameter.parameterId} parameter={parameter} />
          ))}
          <EuiSpacer size='s' />
        </React.Fragment>
      ))}
    </>
  );
};

const ProfilesSection = ({ detail, onNavigate }: { detail: ENSHostDetail; onNavigate: MachineFlyoutProps['onNavigate'] }) =>
  detail.matched.length ? (
    <>
      <EuiText size='s' color='subdued'>
        <p>Los perfiles cuyas condiciones cumple, de la capa más específica a la menos.</p>
      </EuiText>
      <EuiSpacer size='m' />
      {detail.matched.map(profile => (
        <React.Fragment key={profile.id}>
          <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
            <EuiFlexItem grow={false}>
              <ProfileTag name={profile.name} layer={profile.layer} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color='hollow'>{layerLabel(profile.layer)}</EuiBadge>
            </EuiFlexItem>
            {profile.origin === 'builtin' && (
              <EuiFlexItem grow={false}>
                <EuiBadge color='default'>Incluido</EuiBadge>
              </EuiFlexItem>
            )}
            <EuiFlexItem />
            <EuiFlexItem grow={false}>
              <EuiButton size='s' onClick={() => onNavigate({ view: 'profiles', profileId: profile.id })}>
                Abrir
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiText size='xs' color='subdued'>
            <p>{`Se aplica porque ${matchText(profile.match)}.`}</p>
          </EuiText>
          <EuiHorizontalRule margin='s' />
        </React.Fragment>
      ))}
    </>
  ) : (
    <EuiCallOut size='s' color='warning' iconType='iInCircle' title='Ningún perfil se aplica a esta máquina'>
      <p>Solo recibe la plantilla de su tipo, si la hay. Revisa las condiciones de los perfiles o crea uno que la incluya.</p>
    </EuiCallOut>
  );

const IdentitySection = ({ detail }: { detail: ENSHostDetail }) => {
  const { host } = detail;
  const items = [
    { title: 'Nombre del agente', description: host.name || (host.agentId === '000' ? 'El manager no tiene nombre de agente' : '—') },
    { title: 'Hostname', description: host.hostname || 'El inventario no lo trae; se usa el nombre del agente' },
    { title: 'Sistema', description: [host.os.name, host.os.version].filter(Boolean).join(' ') || '—' },
    { title: 'Arquitectura', description: host.os.architecture || '—' },
    { title: 'Distribución', description: host.distro || 'Sin deducir' },
    { title: 'Familia', description: host.family || 'Sin deducir' },
    { title: 'Función', description: roleLabel(host.role) },
    { title: 'Servicios', description: host.services.length ? host.services.join(', ') : 'Ninguno detectado' },
    { title: 'Grupos de Wazuh', description: host.groups.length ? host.groups.join(', ') : 'Ninguno' },
    { title: 'Descrita', description: `${ageLabel(host.updatedAt)} por el motor ${host.engineVersion || ''}`.trim() },
  ];
  return (
    <>
      <EuiText size='s' color='subdued'>
        <p>Lo que el motor deduce del inventario de Wazuh en cada pasada. No se configura nada en la máquina.</p>
      </EuiText>
      <EuiSpacer size='m' />
      <EuiDescriptionList type='column' compressed listItems={items} />
      <EuiSpacer size='l' />
      <EuiTitle size='xxs'>
        <h4>Señales del inventario</h4>
      </EuiTitle>
      <EuiSpacer size='s' />
      {host.signals.length ? (
        <EuiDescriptionList
          type='column'
          compressed
          listItems={host.signals.map(signal => ({
            title: `${FIELD_LABELS[signal.field] || signal.field}: ${signal.field === 'role' ? roleLabel(signal.value) : signal.value}`,
            description: `Por ${signalSourceText(signal.from)}`,
          }))}
        />
      ) : (
        <EuiText size='s' color='subdued'>
          <p>El inventario no trae ninguna señal reconocible.</p>
        </EuiText>
      )}
    </>
  );
};

export const MachineFlyout = ({ agentId, onClose, onNavigate }: MachineFlyoutProps) => {
  const [section, setSection] = useState<Section>('values');
  const [detail, setDetail] = useState<ENSHostDetail | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let current = true;
    setDetail(undefined);
    setError(undefined);
    profilesClient
      .host(agentId)
      .then(result => current && setDetail(result))
      .catch(failure => current && setError(failure?.message || String(failure)));
    return () => {
      current = false;
    };
  }, [agentId]);

  const host = detail?.host;

  return (
    <EuiFlyout size='m' ownFocus onClose={onClose} aria-labelledby='ens-machine-flyout-title'>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size='s'>
          <h2 id='ens-machine-flyout-title'>{host ? hostLabel(host) : `Agente ${agentId}`}</h2>
        </EuiTitle>
        {host && (
          <EuiText size='s' color='subdued'>
            <p>{[`Agente ${host.agentId}`, host.distro, roleLabel(host.role)].filter(Boolean).join(' · ')}</p>
          </EuiText>
        )}
        <EuiSpacer size='s' />
        <EuiTabs size='s'>
          <EuiTab isSelected={section === 'values'} onClick={() => setSection('values')}>
            Valores
          </EuiTab>
          <EuiTab isSelected={section === 'profiles'} onClick={() => setSection('profiles')}>
            {`Perfiles${detail ? ` (${detail.matched.length})` : ''}`}
          </EuiTab>
          <EuiTab isSelected={section === 'identity'} onClick={() => setSection('identity')}>
            Identidad
          </EuiTab>
        </EuiTabs>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {error && <EuiCallOut color='danger' iconType='alert' title={error} />}
        {!error && !detail && <LoadingSpinner message='Leyendo la máquina...' />}
        {detail && section === 'values' && (
          <>
            <EuiFlexGroup justifyContent='flexEnd' responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButton size='s' iconType='pencil' onClick={() => onNavigate({ view: 'agents', agentId: detail.host.agentId })}>
                  {detail.hasOwnConfiguration ? 'Editar valores propios' : 'Dar valores propios'}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size='s' />
            <ValuesSection detail={detail} />
          </>
        )}
        {detail && section === 'profiles' && <ProfilesSection detail={detail} onNavigate={onNavigate} />}
        {detail && section === 'identity' && <IdentitySection detail={detail} />}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
