// Sustituye a «Explore agent» de Wazuh: elige una máquina del alcance ENS o
// todas. Solo toca `agentId` en la URL, que es lo que leen las pantallas.
import React from 'react';
import { EuiFormRow, EuiSuperSelect, EuiHealth } from '@elastic/eui';
import { getActiveENSScopeAgents } from '../ens/core/scope';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';

const TODAS = '__todas__';

export const MachineSelector = () => {
  const { agentId } = useRouterSearch();
  const cambia = useSetRouterSearch();
  const agentes = getActiveENSScopeAgents();

  const opciones = [
    { value: TODAS, inputDisplay: 'Todas las máquinas' },
    ...agentes.map(a => ({
      value: a.id,
      inputDisplay: (
        <EuiHealth color={a.status === 'active' ? 'success' : 'subdued'}>
          {`${a.id} · ${a.name || 'sin nombre'}`}
        </EuiHealth>
      ),
    })),
  ];

  return (
    <EuiFormRow label="Máquina" display="columnCompressed">
      <EuiSuperSelect
        compressed
        options={opciones}
        valueOfSelected={agentId || TODAS}
        onChange={valor => cambia({ agentId: valor === TODAS ? undefined : valor })}
      />
    </EuiFormRow>
  );
};
