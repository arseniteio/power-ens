import React, { useEffect, useMemo, useState } from 'react';
import { ControlRow } from './control-row';
import { useRouterSearch } from '../../../common/hooks';
import { useEsSearch } from '../../../common/hooks/use-es-search';
import {
  EuiBadge,
  EuiBasicTable,
  EuiFacetButton,
  EuiFacetGroup,
  EuiButtonEmpty,
  EuiHealth,
  EuiPage,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENSControls } from '../data';
import { ENSControl } from '../types';
import { ControlDetailENS } from './control-detail';
import { getActiveENSConfiguration } from '../configuration/services';
import {
  buildENSEvaluationTimeRangeFilter,
  getENSComplianceResultByControl,
  normalizeWazuhAlerts,
} from '../core';
import {
  buildENSScopeAgentQueryFilter,
  getActiveENSScopeAgents,
} from '../core/scope';

// El color de un control es su ESTADO, y son tres cosas distintas:
//
//   CUMPLE        verde   · no hay nada que hacer
//   PARCIAL       ámbar   · parte conforma y parte no
//   NO_CUMPLE     rojo    · nada de lo aplicable conforma
//   NO_APLICA     gris    · fuera del nivel ENS activo
//
// Pintarlas del mismo color porque todas tienen alguna no conformidad convierte
// la lista en un semáforo de una sola luz: el auditor no puede priorizar y deja
// de mirarla.
const colorDelEstado = (estado: string): string => {
  if (estado === 'CUMPLE') {
    return '#00A65A';
  }

  if (estado === 'PARCIAL') {
    return '#F5A700';
  }

  if (estado === 'NO_CUMPLE') {
    return '#BD271E';
  }

  return '#98A2B3';
};

const badgeDelEstado = (estado: string): string => {
  if (estado === 'CUMPLE') {
    return 'success';
  }

  if (estado === 'PARCIAL') {
    return 'warning';
  }

  if (estado === 'NO_CUMPLE') {
    return 'danger';
  }

  return 'default';
};

export const ControlsENS = () => {
  const [selectedControl, setSelectedControl] = useState<ENSControl | null>(
    null,
  );

  const { control, agentId } = useRouterSearch();

  useEffect(() => {
    if (!control || selectedControl) {
      return;
    }

    const controlFromUrl = ENSControls.find(
      item => item.id === control,
    );

    if (controlFromUrl) {
      setSelectedControl(controlFromUrl);
    }
  }, [control, selectedControl]);

  const activeConfiguration = getActiveENSConfiguration();
  const ensLevel = activeConfiguration.global.ensLevel;
  const evaluationTimeFilter = buildENSEvaluationTimeRangeFilter(
    activeConfiguration.global.evaluationPeriod,
  );

   const scopeAgents =
     getActiveENSScopeAgents();

   const scopeAgentQueryFilter =
     buildENSScopeAgentQueryFilter(
       scopeAgents,
       agentId,
     );

   // La consulta compartida se ha retirado: la hacía cada fila por su cuenta
   // desde el 10/08/2026. Ver `control-row.tsx`.

  if (selectedControl) {
    return (
      <ControlDetailENS
        control={selectedControl}
        agentId={agentId}
        onBack={() => setSelectedControl(null)}
      />
    );
  }

  // El bloque `items` se ha retirado: cada fila calcula lo suyo desde el
  // 10/08/2026, porque una consulta compartida hacía que el control con más
  // volumen dejara a los demás sin datos. Ver `control-row.tsx`.

  return (
    <EuiPage paddingSize='m'>
      <EuiPanel>
        <EuiTitle size='m'>
          <h2>ENS Controls</h2>
        </EuiTitle>
        <EuiText>
          <p>
            Catálogo de controles ENS. El número en rojo son las no
            conformidades abiertas del control: la carga de la prueba es del
            auditado, así que lo que no se ha podido demostrar cuenta igual que
            lo demostrado. «No evidenciadas» dice cuántas de ellas lo son por
            falta de prueba —otra acción y otra persona—, no otro hallazgo.
            Pulsa un control para ver su detalle completo.
          </p>
        </EuiText>
        <EuiSpacer size='l' />
        {/* CADA FILA CONSULTA LO SUYO. Ver la cabecera de `control-row.tsx`:
            una sola búsqueda compartida hacía que el control con más volumen
            se quedara con los 10.000 hechos y dejara a los demás sin datos, y
            la lista contradecía a la ficha del mismo control. */}
        <EuiFacetGroup>
          {ENSControls.map(ensControl => (
            <ControlRow
              key={ensControl.id}
              controlId={ensControl.id}
              title={ensControl.title}
              levels={ensControl.scope.activeLevels.join(', ')}
              ensLevel={ensLevel}
              evaluationPeriod={activeConfiguration.global.evaluationPeriod}
              agentId={agentId}
              scopeAgents={scopeAgents}
              scopeFilter={scopeAgentQueryFilter}
              colorDelEstado={colorDelEstado}
              badgeDelEstado={badgeDelEstado}
              onSelect={() => setSelectedControl(ensControl)}
            />
          ))}
        </EuiFacetGroup>
      </EuiPanel>
    </EuiPage>
  );
};
