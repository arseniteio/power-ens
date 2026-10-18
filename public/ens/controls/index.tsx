import { useActiveENSScopeAgents } from '../scope/use-active-scope-agents';
import React, { useMemo, useState } from 'react';
import { ControlRow } from './control-row';
import { useRouterSearch, useSetRouterSearch } from '../../routing/use-router-search';
import { useEnsEvaluation } from '../../evaluation/use-evaluation';
import { EvaluationStatusLine } from '../../evaluation/evaluation-status';
import { FactsReadErrorCallOut } from '../../platform/facts-read-error-callout';
import type { ENSSummaryEvaluationResponse } from '../../../common/ens/evaluation/types';
import {
  EuiBadge,
  EuiBasicTable,
  EuiFacetButton,
  EuiFacetGroup,
  EuiButtonEmpty,
  EuiHealth,
  EuiIcon,
  EuiLink,
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
import { describeNotMeasuredOnAgent } from '../../../common/ens/core/scope/measurement-planes';
import { getENSCatalogControl } from '../../../common/ens/catalog';
import { resolveControlLevel } from '../../../common/ens/core/control-level';
import { buildControlListEntries, describeLevelExclusions } from './controls-list-model';

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
   // cumplen) y, de cada máquina, el de cada control en su fila (la barra de
   // máquinas). Con la ficha abierta no se pide: la lista no se ve.
   const resumen = useEnsEvaluation<ENSSummaryEvaluationResponse>({
     include: 'summary',
     agentId,
     enabled: !selectedControl,
   });

   const resumenDe = useMemo(
     () => new Map((resumen.data?.controls || []).map(entry => [entry.controlId, entry])),
     [resumen.data],
   );

   // TODOS los controles del catálogo, siempre (`controls-list-model.ts`): los
   // que no se miden en la máquina elegida (los de plano agent en el manager,
   // mp.info.6 fuera de su P-04) van al final, en gris y con el motivo; antes
   // se quitaban de la lista y parecía que habían desaparecido.
   const nombreDelAgente = scopeAgents.find(agent => agent.id === agentId)?.name;
   const configuracion = getActiveENSConfiguration();
   const nivelGlobal = configuracion.global.ensLevel;
   const [, setRevision] = useState(0);

   const entradas = buildControlListEntries(
     ENSControls.map(ensControl => ({
       id: ensControl.id,
       title: ensControl.title,
       activeLevels: ensControl.scope.activeLevels,
     })),
     {
       agentId,
       summaries: resumenDe,
       agentRows: resumen.data?.agents,
       isConfigured: id => Boolean(getActiveControlConfiguration(id)),
       notMeasured: id => {
         const catalogControl = getENSCatalogControl(id);
         return catalogControl && agentId
           ? describeNotMeasuredOnAgent(catalogControl, agentId, nombreDelAgente, getActiveControlConfiguration(id, agentId))
           : undefined;
       },
       levelOf: id => resolveControlLevel(getENSCatalogControl(id) || {}, nivelGlobal, configuracion.global),
     },
   );
   const fueraDeNivel = describeLevelExclusions(entradas, nivelGlobal);
   const sinMedir = entradas.filter(entrada => !entrada.measured).length;

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
        {fueraDeNivel && (
          <>
            <EuiText size='s' color='subdued'>
              <p>
                <EuiIcon type='iInCircle' /> {fueraDeNivel.text}: se evalúan, pero ninguno de sus requisitos rige en
                este nivel.{' '}
                <EuiLink onClick={() => cambiaUrl({ tabView: 'configuration', configView: undefined, configAgent: undefined, configControl: undefined, configParam: undefined })}>
                  Cambiar el nivel en Configuración
                </EuiLink>
              </p>
            </EuiText>
            <EuiSpacer size='s' />
          </>
        )}
        {agentId && sinMedir > 0 && (
          <>
            <EuiText size='s' color='subdued'>
              <p>
                {`${sinMedir} ${sinMedir === 1 ? 'control no se mide' : 'controles no se miden'} en ${agentId}${
                  nombreDelAgente ? ` · ${nombreDelAgente}` : ''
                }: ${sinMedir === 1 ? 'sale' : 'salen'} al final, en gris, con el motivo.`}{' '}
                <EuiLink onClick={() => cambiaUrl({ agentId: undefined })}>Ver todas las máquinas</EuiLink>
              </p>
            </EuiText>
            <EuiSpacer size='s' />
          </>
        )}
        <EuiFacetGroup>
          {entradas.map(entrada => (
            <ControlRow
              key={entrada.id}
              entry={entrada}
              isLoading={resumen.isLoading}
              error={resumen.error}
              colorDelEstado={colorDelEstado}
              badgeDelEstado={badgeDelEstado}
              onSelect={() => cambiaUrl({ control: entrada.id })}
              onConfigurationChanged={() => {
                setRevision(n => n + 1);
                resumen.retry();
              }}
            />
          ))}
        </EuiFacetGroup>
      </EuiPanel>
    </EuiPage>
  );
};
