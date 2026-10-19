// Controles tab: the classic requirements view. Each control shows the SUM of its requirements' numbers (clickable to filter), which is not its total of facts.
import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiCallOut,
  EuiFacetButton,
  EuiFacetGroup,
  EuiFieldSearch,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { ensRequirementsFile } from '../ens-requirements';
import {
  ENS_REQUIREMENT_COUNT_AGGS,
  countENSRequirements,
} from '../../common/ens/core/compliance-view/ens-requirement-index';
import { getActiveENSScopeAgents } from '../../common/ens/core/scope';
import { LoadingSpinner } from '../platform/loading-spinner';
import { useRouterSearch } from '../routing/use-router-search';
import { AlertsSearchFrame, useAlertsSearchBar } from '../search/alerts-search-bar';
import { buildRawFactsFilters } from '../search/raw-facts-filters';
import { useEsSearch } from '../search/use-es-search';
import { ENSRequirementRow, buildRequirementsModel } from './requirements-model';
import { RequirementFlyout } from './requirement-flyout';

const titleOf = (description: string): string => description.split(' - ')[0];

const RequirementsScreen = ({ barFilters, refreshKey }: { barFilters: unknown[]; refreshKey: number }) => {
  const { agentId } = useRouterSearch();
  const [search, setSearch] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [isOpen, setIsOpen] = useState<ENSRequirementRow | undefined>();

  const fixed = buildRawFactsFilters(getActiveENSScopeAgents(), agentId);
  const viewFilters = [...fixed, ...barFilters];
  const { esResults, isLoading, error } = useEsSearch({
    preAppliedFilters: viewFilters,
    preAppliedAggs: ENS_REQUIREMENT_COUNT_AGGS,
    size: 0,
    refreshKey,
  });

  const model = useMemo(
    () =>
      buildRequirementsModel(ensRequirementsFile, countENSRequirements(esResults?.aggregations), {
        search,
        hideEmpty,
        selected,
      }),
    [esResults, search, hideEmpty, selected]
  );

  const panel = isOpen && (
    <RequirementFlyout
      requirementId={isOpen.id}
      description={isOpen.description}
      filters={viewFilters}
      refreshKey={refreshKey}
      onClose={() => setIsOpen(undefined)}
    />
  );

  // If the count for the current filters fails, `esResults` holds the previous search (or nothing, and all would read zero): the numbers are not shown as current.
  if (error) {
    return (
      <>
        {isLoading && <EuiProgress size="xs" color="accent" />}
        <EuiCallOut color="danger" iconType="alert" title="No se pudieron contar los hechos con los filtros y las fechas de ahora">
          <p>{String((error as any)?.message || error)}</p>
          <p>Pulsa «Actualizar» en la barra para volver a intentarlo.</p>
        </EuiCallOut>
        {panel}
      </>
    );
  }

  if (isLoading && !esResults?.aggregations) {
    return <LoadingSpinner message="Contando los hechos de cada requisito…" />;
  }

  return (
    <>
      <EuiFlexGroup gutterSize="l" alignItems="flexStart">
        <EuiFlexItem grow={false} style={{ minWidth: 220 }}>
          <EuiTitle size="xxs">
            <h3>Controles</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiFacetGroup>
            {model.controls.map(control => (
              <EuiFacetButton
                key={control.id}
                quantity={control.count}
                isSelected={selected === control.id}
                onClick={() => setSelected(selected === control.id ? undefined : control.id)}
              >
                {control.id}
              </EuiFacetButton>
            ))}
          </EuiFacetGroup>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false} wrap>
            <EuiFlexItem style={{ minWidth: 240 }}>
              <EuiFieldSearch
                fullWidth
                isClearable
                placeholder="Buscar requisito por identificador o descripción"
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiSwitch
                label="Ocultar requisitos sin hechos"
                checked={hideEmpty}
                onChange={e => setHideEmpty(e.target.checked)}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />

          {model.requirements.length === 0 ? (
            <EuiText size="s" color="subdued">
              <p>Ningún requisito con estos criterios.</p>
            </EuiText>
          ) : (
            <EuiFlexGrid columns={4} gutterSize="s">
              {model.requirements.map(requirement => (
                <EuiFlexItem key={requirement.id}>
                  <EuiToolTip position="top" display="block" content={requirement.description}>
                    <EuiPanel
                      paddingSize="s"
                      hasBorder
                      onClick={() => setIsOpen(requirement)}
                      aria-label={`Requisito ${requirement.id}: ${requirement.count} hechos`}
                    >
                      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                        <EuiFlexItem>
                          <EuiText size="s">
                            <span>
                              <strong>{requirement.id}</strong> - {titleOf(requirement.description)}
                            </span>
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiBadge color={requirement.count ? 'primary' : 'hollow'}>{requirement.count}</EuiBadge>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPanel>
                  </EuiToolTip>
                </EuiFlexItem>
              ))}
            </EuiFlexGrid>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>

      {panel}
    </>
  );
};

export const RequirementsView = () => {
  const bar = useAlertsSearchBar();

  return (
    <AlertsSearchFrame barra={bar}>
      <RequirementsScreen barFilters={bar.filters} refreshKey={bar.refreshKey} />
    </AlertsSearchFrame>
  );
};
