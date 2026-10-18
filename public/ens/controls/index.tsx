import { useActiveENSScopeAgents } from '../scope/use-active-scope-agents';
import React, { useMemo } from 'react';
import { ControlRow, ControlRowSummary } from './control-row';
import { useRouterSearch, useSetRouterSearch } from '../../routing/use-router-search';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { EvaluationStatusLine } from '../../evaluation/evaluation-status';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import type { ENSEvaluationMeta } from '../../../common/ens/evaluation/types';
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
} from '../../../common/ens/configuration/services';
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
  const { control, agentId } = useRouterSearch();

  // EL CONTROL ABIERTO ES EL DE LA URL (`control=`), no un estado local: así
  // se conserva al cambiar de pestaña y volver, al recargar, al venir de la
  // Vista general o de «Volver al detalle» en Configuración, y la ficha sigue
  // a la URL si cambia con ella abierta. Con `control=` la ficha se abre en el
  // PRIMER render, sin lanzar antes la evaluación de la lista.
  const selectedControl: ENSControl | null = ENSControls.find(item => item.id === control) || null;

  const cambiaUrl = useSetRouterSearch();

   const scopeAgents = useActiveENSScopeAgents();

   // UNA petición para toda la lista: el servidor evalúa cada control con
   // todos sus hechos y devuelve el resumen (estado y requisitos que no
   // cumplen). Con la ficha abierta no se pide: la lista no se ve.
   const resumen = useEnsEvaluation<{ controls: ControlRowSummary[]; meta: ENSEvaluationMeta }>({
     include: 'summary',
     agentId,
     enabled: !selectedControl,
   });

   const resumenDe = useMemo(
     () => new Map((resumen.data?.controls || []).map(entry => [entry.controlId, entry])),
     [resumen.data],
   );

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
        onBack={() => cambiaUrl({ control: undefined })}
      />
    );
  }

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
        {/* Una sola evaluación para toda la lista (ver `control-row.tsx`):
            cada control con todos sus hechos, evaluado en el servidor igual
            que en su ficha. */}
        {resumen.error ? (
          <>
            <FactsReadErrorCallOut error={resumen.error} onRetry={resumen.retry} />
            <EuiSpacer size='m' />
          </>
        ) : (
          <EvaluationStatusLine meta={resumen.data?.meta} refreshing={resumen.isRefreshing} />
        )}
        <EuiFacetGroup>
          {controlesListados.map(ensControl => (
            <ControlRow
              key={ensControl.id}
              controlId={ensControl.id}
              title={ensControl.title}
              levels={ensControl.scope.activeLevels.join(', ')}
              summary={resumenDe.get(ensControl.id)}
              isLoading={resumen.isLoading}
              error={resumen.error}
              colorDelEstado={colorDelEstado}
              badgeDelEstado={badgeDelEstado}
              onSelect={() => cambiaUrl({ control: ensControl.id })}
            />
          ))}
        </EuiFacetGroup>
      </EuiPanel>
    </EuiPage>
  );
};
