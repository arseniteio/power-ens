import { useActiveENSScopeAgents } from '../scope/use-active-scope-agents';
import React, { useEffect, useMemo, useState } from 'react';
import { ControlRow } from './control-row';
import { useRouterSearch, useSetRouterSearch } from '../../routing/use-router-search';
import { useEsSearch } from '../../search/use-es-search';
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
import {
  getActiveControlConfiguration,
  getActiveENSConfiguration,
} from '../../../common/ens/configuration/services';
import {
  buildENSEvaluationTimeRangeFilter,
  getENSComplianceResultByControl,
  normalizeWazuhAlerts,
} from '../../../common/ens/core';
import {
  buildENSScopeAgentQueryFilter,
} from '../../../common/ens/core/scope';
import {
  isControlInDeclaredScope,
  isControlMeasuredOnAgent,
  isManagerAgentId,
} from '../../../common/ens/core/scope/measurement-planes';
import { getENSCatalogControl } from '../../../common/ens/catalog';

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
  const cambiaUrl = useSetRouterSearch();

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

   const scopeAgents = useActiveENSScopeAgents();

   const scopeAgentQueryFilter =
     buildENSScopeAgentQueryFilter(
       scopeAgents,
       agentId,
     );

   // La consulta compartida se ha retirado: la hacía cada fila por su cuenta
   // desde el 10/08/2026. Ver `control-row.tsx`.

   // Seleccionado el manager (000), solo se listan los controles que se miden
   // en él: los demás no tienen resultado en su fila, y pintarlos en gris los
   // confundiría con un control fuera del catálogo. En la vista de cualquier
   // otra máquina salen todos (los de solo manager, con el resultado del
   // manager) salvo los que declaran un alcance que no la incluye (mp.info.6
   // fuera de su P-04): tampoco tienen resultado en su fila.
   const nombreDelAgente = scopeAgents.find(agent => agent.id === agentId)?.name;

   const controlesListados = isManagerAgentId(agentId)
     ? ENSControls.filter(ensControl => {
         const catalogControl = getENSCatalogControl(ensControl.id);

         return (
           !catalogControl ||
           isControlMeasuredOnAgent(catalogControl, agentId as string)
         );
       })
     : agentId
     ? ENSControls.filter(ensControl => {
         const catalogControl = getENSCatalogControl(ensControl.id);

         return (
           !catalogControl ||
           isControlInDeclaredScope(
             catalogControl,
             nombreDelAgente,
             getActiveControlConfiguration(catalogControl.id),
           )
         );
       })
     : ENSControls;

  if (selectedControl) {
    return (
      <ControlDetailENS
        control={selectedControl}
        agentId={agentId}
        // También fuera de la URL: con `control=` en ella, el efecto de arriba
        // volvería a abrir el detalle al cambiar de pestaña y volver.
        onBack={() => {
          cambiaUrl({ control: undefined });
          setSelectedControl(null);
        }}
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
          {controlesListados.map(ensControl => (
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
