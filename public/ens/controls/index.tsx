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
import { statusBadgeColor, statusColor } from '../status-colors';

// The colour is the control status; NO_EVALUABLE and NO_APLICA keep distinct greys (status-colors.ts).
const statusColorValue = (status: string): string => statusColor(status);

const statusBadge = (status: string): string => statusBadgeColor(status);

export const ControlsENS = () => {
  const { control, agentId } = useRouterSearch();

  // The open control comes from the URL (`control=`), not local state: it survives tab changes and reloads.
  const selectedControl: ENSControl | null = ENSControls.find(item => item.id === control) || null;

  const updateUrl = useSetRouterSearch();

   const scopeAgents = useActiveENSScopeAgents();

   // One request for the whole list; not requested while the detail is open.
   const summary = useEnsEvaluation<ENSSummaryEvaluationResponse>({
     include: 'summary',
     agentId,
     enabled: !selectedControl,
   });

   const summaryOf = useMemo(
     () => new Map((summary.data?.controls || []).map(entry => [entry.controlId, entry])),
     [summary.data],
   );

   const agentName = scopeAgents.find(agent => agent.id === agentId)?.name;
   const configuration = getActiveENSConfiguration();
   const globalLevel = configuration.global.ensLevel;
   const [, setRevision] = useState(0);

   const entries = buildControlListEntries(
     ENSControls.map(ensControl => ({
       id: ensControl.id,
       title: ensControl.title,
       activeLevels: ensControl.scope.activeLevels,
     })),
     {
       agentId,
       summaries: summaryOf,
       agentRows: summary.data?.agents,
       isConfigured: id => Boolean(getActiveControlConfiguration(id)),
       notMeasured: id => {
         const catalogControl = getENSCatalogControl(id);
         return catalogControl && agentId
           ? describeNotMeasuredOnAgent(catalogControl, agentId, agentName, getActiveControlConfiguration(id, agentId))
           : undefined;
       },
       levelOf: id => resolveControlLevel(getENSCatalogControl(id) || {}, globalLevel, configuration.global),
     },
   );
   const outOfLevel = describeLevelExclusions(entries, globalLevel);
   const unmeasured = entries.filter(entry => !entry.measured).length;

  if (selectedControl) {
    return (
      <ControlDetailENS
        control={selectedControl}
        agentId={agentId}
        onBack={() => updateUrl({ control: undefined })}
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
        {summary.error ? (
          <>
            <FactsReadErrorCallOut error={summary.error} onRetry={summary.retry} />
            <EuiSpacer size='m' />
          </>
        ) : (
          <EvaluationStatusLine meta={summary.data?.meta} refreshing={summary.isRefreshing} onRetry={summary.retry} />
        )}
        {outOfLevel && (
          <>
            <EuiText size='s' color='subdued'>
              <p>
                <EuiIcon type='iInCircle' /> {outOfLevel.text}: se evalúan, pero ninguno de sus requisitos rige en
                este nivel.{' '}
                <EuiLink onClick={() => updateUrl({ tabView: 'configuration', configView: undefined, configAgent: undefined, configControl: undefined, configParam: undefined })}>
                  Cambiar el nivel en Configuración
                </EuiLink>
              </p>
            </EuiText>
            <EuiSpacer size='s' />
          </>
        )}
        {agentId && unmeasured > 0 && (
          <>
            <EuiText size='s' color='subdued'>
              <p>
                {`${unmeasured} ${unmeasured === 1 ? 'control no se mide' : 'controles no se miden'} en ${agentId}${
                  agentName ? ` · ${agentName}` : ''
                }: ${unmeasured === 1 ? 'sale' : 'salen'} al final, en gris, con el motivo.`}{' '}
                <EuiLink onClick={() => updateUrl({ agentId: undefined })}>Ver todas las máquinas</EuiLink>
              </p>
            </EuiText>
            <EuiSpacer size='s' />
          </>
        )}
        <EuiFacetGroup>
          {entries.map(entry => (
            <ControlRow
              key={entry.id}
              entry={entry}
              isLoading={summary.isLoading}
              error={summary.error}
              colorDelEstado={statusColorValue}
              badgeDelEstado={statusBadge}
              onSelect={() => updateUrl({ control: entry.id })}
              onConfigurationChanged={() => {
                setRevision(n => n + 1);
                summary.retry();
              }}
            />
          ))}
        </EuiFacetGroup>
      </EuiPanel>
    </EuiPage>
  );
};
