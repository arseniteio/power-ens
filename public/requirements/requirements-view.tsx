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
import { buildENSScopeAgentQueryFilter, getActiveENSScopeAgents } from '../ens/core/scope';
import { LoadingSpinner } from '../platform/loading-spinner';
import { useRouterSearch } from '../routing/use-router-search';
import { AlertsSearchFrame, useAlertsSearchBar } from '../search/alerts-search-bar';
import { useEsSearch } from '../search/use-es-search';
import { ENSRequirementRow, buildRequirementsModel } from './requirements-model';
import { RequirementFlyout } from './requirement-flyout';

// «Copias de seguridad - Se realizan…»: en la tarjeta va el título; la
// descripción entera, al pasar el ratón y en el panel del requisito.
const tituloDe = (descripcion: string): string => descripcion.split(' - ')[0];

const Requisitos = ({ barFilters }: { barFilters: unknown[] }) => {
  const { agentId } = useRouterSearch();
  const [search, setSearch] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [abierto, setAbierto] = useState<ENSRequirementRow | undefined>();

  const fijos = [
    { match_phrase: { 'rule.groups': 'ensfacil' } },
    buildENSScopeAgentQueryFilter(getActiveENSScopeAgents(), agentId),
  ];
  const filtrosDeLaVista = [...fijos, ...barFilters];
  const { esResults, isLoading, error } = useEsSearch({
    preAppliedFilters: filtrosDeLaVista,
    preAppliedAggs: ENS_REQUIREMENT_COUNT_AGGS,
    size: 0,
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

  if (isLoading && !esResults?.aggregations) {
    return <LoadingSpinner message="Contando los hechos de cada requisito…" />;
  }

  return (
    <>
      {error && (
        <>
          <EuiCallOut color="danger" iconType="alert" title="No se pudieron contar los hechos: los números no son fiables">
            <p>{String((error as any)?.message || error)}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

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

      {abierto && (
        <RequirementFlyout
          requirementId={abierto.id}
          description={abierto.description}
          filters={filtrosDeLaVista}
          onClose={() => setAbierto(undefined)}
        />
      )}
    </>
  );
};

export const RequirementsView = () => {
  const barra = useAlertsSearchBar();

  return (
    <AlertsSearchFrame barra={barra}>
      <Requisitos barFilters={barra.filters} />
    </AlertsSearchFrame>
  );
};
