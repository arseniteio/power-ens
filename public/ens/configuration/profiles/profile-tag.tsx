import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiHealth, EuiText, EuiToolTip } from '@elastic/eui';
import type { ENSProfileLayer } from '../../../../common/ens/profiles/types';
import { LAYER_COLORS, layerLabel } from './profile-labels';

export const ProfileTag = ({ name, layer, prominent = false }: { name: string; layer: string; prominent?: boolean }) => (
  <EuiToolTip content={`Capa: ${layerLabel(layer)}`}>
    <EuiHealth color={LAYER_COLORS[layer as ENSProfileLayer] || 'subdued'}>
      <EuiText size={prominent ? 's' : 'xs'}>{prominent ? <strong>{name}</strong> : <span>{name}</span>}</EuiText>
    </EuiHealth>
  </EuiToolTip>
);

export const ProfileTags = ({ profiles }: { profiles: Array<{ id: string; name: string; layer: string }> }) =>
  profiles.length ? (
    <EuiFlexGroup gutterSize='s' wrap responsive={false}>
      {profiles.map(profile => (
        <EuiFlexItem grow={false} key={profile.id}>
          <ProfileTag name={profile.name} layer={profile.layer} />
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  ) : (
    <EuiText size='xs' color='subdued'>
      <span>Ninguno</span>
    </EuiText>
  );
