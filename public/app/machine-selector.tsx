// Sustituye a «Explore agent» de Wazuh: elige una máquina del alcance ENS o
// todas. Solo toca `agentId` en la URL, que es lo que leen las pantallas.
//
// Una máquina de la URL que no está en el alcance se dice (y se puede quitar):
// antes el selector se quedaba en blanco y todo salía «sin datos».
import React from 'react';
import { EuiButton, EuiCallOut, EuiFormRow, EuiSpacer, EuiSuperSelect, EuiHealth } from '@elastic/eui';
import { getActiveENSScopeAgents } from '../../common/ens/core/scope';
import { useRouterSearch, useSetRouterSearch } from '../routing/use-router-search';
import { describeAgentOutOfScope, isAgentInScope } from './agent-in-scope';

const TODAS = '__todas__';

export const MachineSelector = () => {
  const { agentId } = useRouterSearch();
  const cambia = useSetRouterSearch();
  const agentes = getActiveENSScopeAgents();
  const fuera = Boolean(agentId) && !isAgentInScope(agentId, agentes);

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
    ...(fuera
      ? [
          {
            value: agentId as string,
            inputDisplay: <EuiHealth color='danger'>{`${agentId} · fuera del alcance`}</EuiHealth>,
          },
        ]
      : []),
  ];

  return (
    <>
      <EuiFormRow label="Máquina" display="columnCompressed">
        <EuiSuperSelect
          compressed
          options={opciones}
          valueOfSelected={agentId || TODAS}
          onChange={valor => cambia({ agentId: valor === TODAS ? undefined : valor })}
        />
      </EuiFormRow>
      {fuera && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut size="s" color="warning" iconType="alert" title={`${agentId} no está en el alcance ENS`}>
            <p>{describeAgentOutOfScope(agentId as string)}</p>
            <EuiButton size="s" onClick={() => cambia({ agentId: undefined })}>
              Quitar la máquina y ver todas
            </EuiButton>
          </EuiCallOut>
        </>
      )}
    </>
  );
};
