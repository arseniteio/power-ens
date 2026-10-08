// Pestaña Controles: la vista clásica de requisitos. A la izquierda, cada
// control con la SUMA de los números de sus requisitos (pulsable para
// filtrar), que no es su total de hechos: un hecho que cita varios requisitos
// de un mismo control cuenta una vez por requisito. A la derecha, el
// buscador, el interruptor de requisitos sin hechos y la cuadrícula de
// requisitos con su número. Los hechos se cuentan con la barra de búsqueda y
// las fechas del dashboard, dentro del alcance ENS.
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
} from '../ens/core/compliance-view/ens-requirement-index';
import { getActiveENSScopeAgents } from '../ens/core/scope';
import { LoadingSpinner } from '../platform/loading-spinner';
import { useRouterSearch } from '../routing/use-router-search';
import { AlertsSearchFrame, useAlertsSearchBar } from '../search/alerts-search-bar';
import { buildRawFactsFilters } from '../search/raw-facts-filters';
import { useEsSearch } from '../search/use-es-search';
import { ENSRequirementRow, buildRequirementsModel } from './requirements-model';
import { RequirementFlyout } from './requirement-flyout';

// «Copias de seguridad - Se realizan…»: en la tarjeta va el título; la
// descripción entera, al pasar el ratón y en el panel del requisito.
const tituloDe = (descripcion: string): string => descripcion.split(' - ')[0];

const Requisitos = ({ barFilters, refreshKey }: { barFilters: unknown[]; refreshKey: number }) => {
  const { agentId } = useRouterSearch();
  const [search, setSearch] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [abierto, setAbierto] = useState<ENSRequirementRow | undefined>();

  // Con una máquina elegida, solo sus hechos (también en el panel del requisito).
  const fijos = buildRawFactsFilters(getActiveENSScopeAgents(), agentId);
  const filtrosDeLaVista = [...fijos, ...barFilters];
  // El `refreshKey` de la barra: «Actualizar» vuelve a contar aunque el rango
  // sea absoluto y los filtros no cambien.
  const { esResults, isLoading, error } = useEsSearch({
    preAppliedFilters: filtrosDeLaVista,
    preAppliedAggs: ENS_REQUIREMENT_COUNT_AGGS,
    size: 0,
    refreshKey,
  });

  const modelo = useMemo(
    () =>
      buildRequirementsModel(ensRequirementsFile, countENSRequirements(esResults?.aggregations), {
        search,
        hideEmpty,
        selected,
      }),
    [esResults, search, hideEmpty, selected]
  );

  const panel = abierto && (
    <RequirementFlyout
      requirementId={abierto.id}
      description={abierto.description}
      filters={filtrosDeLaVista}
      refreshKey={refreshKey}
      onClose={() => setAbierto(undefined)}
    />
  );

  // Si el recuento de los filtros de ahora falla, lo que queda en `esResults`
  // es de la búsqueda anterior (o nada, y todo saldría a cero): los números no
  // se enseñan como si fueran de ahora. Vuelven con el primer recuento que
  // salga bien.
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
            {modelo.controls.map(control => (
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

          {modelo.requirements.length === 0 ? (
            <EuiText size="s" color="subdued">
              <p>Ningún requisito con estos criterios.</p>
            </EuiText>
          ) : (
            <EuiFlexGrid columns={4} gutterSize="s">
              {modelo.requirements.map(requisito => (
                <EuiFlexItem key={requisito.id}>
                  <EuiToolTip position="top" display="block" content={requisito.description}>
                    <EuiPanel
                      paddingSize="s"
                      hasBorder
                      onClick={() => setAbierto(requisito)}
                      aria-label={`Requisito ${requisito.id}: ${requisito.count} hechos`}
                    >
                      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                        <EuiFlexItem>
                          <EuiText size="s">
                            <span>
                              <strong>{requisito.id}</strong> - {tituloDe(requisito.description)}
                            </span>
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiBadge color={requisito.count ? 'primary' : 'hollow'}>{requisito.count}</EuiBadge>
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
  const barra = useAlertsSearchBar();

  return (
    <AlertsSearchFrame barra={barra}>
      <Requisitos barFilters={barra.filters} refreshKey={barra.refreshKey} />
    </AlertsSearchFrame>
  );
};
