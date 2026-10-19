// Side panel of a requirement in the Controles tab: its description and latest facts with the view filters (bar, dates, scope).
import React from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { buildENSRequirementQuery } from '../../common/ens/core/compliance-view/ens-requirement-index';
import { useSetRouterSearch } from '../routing/use-router-search';
import { useEsSearch } from '../search/use-es-search';
import { controlOf, requirementTextsOf } from './requirements-model';
import { ProvenancedText } from '../ens/controls/control-detail/requirement-texts';

interface FactRow {
  id: string;
  timestamp?: string;
  agente?: string;
  evento?: string;
  requisito?: string;
  evidencia?: string;
  regla?: string;
  reglaId?: string;
}

const text = (value: unknown): string | undefined =>
  value === undefined || value === null || value === '' ? undefined : String(value);

const date = (value?: string): string => {
  if (!value) return '—';
  const instant = new Date(value);
  return isNaN(instant.getTime()) ? value : instant.toLocaleString('es-ES');
};

const COLUMNS = [
  { field: 'timestamp', name: 'timestamp', width: '170px', render: (v?: string) => date(v) },
  { field: 'agente', name: 'agent.name', render: (v?: string) => v || '—' },
  { field: 'evento', name: 'data.event', render: (v?: string) => v || '—' },
  { field: 'requisito', name: 'data.requisito', render: (v?: string) => v || '—' },
  { field: 'evidencia', name: 'data.evidence_id', render: (v?: string) => v || '—' },
  { field: 'regla', name: 'rule.description', render: (v?: string) => v || '—' },
  { field: 'reglaId', name: 'rule.id', width: '80px', render: (v?: string) => v || '—' },
];

export const RequirementFlyout = ({
  requirementId,
  description,
  filters: viewFilters,
  refreshKey,
  onClose,
}: {
  requirementId: string;
  description: string;
  filters: unknown[];
  refreshKey: number;
  onClose: () => void;
}) => {
  const changes = useSetRouterSearch();
  const { esResults, isLoading, error } = useEsSearch({
    preAppliedFilters: [...viewFilters, buildENSRequirementQuery(requirementId)],
    size: 100,
    sorting: [{ timestamp: { order: 'desc' } }],
    refreshKey,
  });

  // If the search for the current filters fails, `esResults` holds the previous one: neither its rows nor its count are shown as current.
  const hits: any[] = error ? [] : esResults?.hits?.hits || [];
  const total = Number(esResults?.hits?.total?.value ?? esResults?.hits?.total ?? hits.length) || 0;
  const rows: FactRow[] = hits.map((hit, i) => {
    const s = hit?._source || {};
    return {
      id: String(hit?._id ?? i),
      timestamp: text(s.timestamp),
      agente: text(s.agent?.name),
      evento: text(s.data?.event),
      requisito: text(s.data?.requisito),
      evidencia: text(s.data?.evidence_id),
      regla: text(s.rule?.description),
      reglaId: text(s.rule?.id),
    };
  });

  return (
    <EuiFlyout onClose={onClose} size="l" ownFocus aria-labelledby="ens-requisito-titulo">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="ens-requisito-titulo">Requisito {requirementId}</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        {description.includes(' - ') && (
          <EuiText size="s">
            <p>
              <strong>{description.split(' - ')[0]}</strong>
            </p>
          </EuiText>
        )}
        {requirementTextsOf(requirementId, description).map(text => (
          <ProvenancedText key={text.provenance} provenance={text.provenance} text={text.text} />
        ))}
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiText size="s" color="subdued">
          <p>
            {isLoading
              ? 'Buscando los hechos del requisito…'
              : error
              ? 'No se pudieron leer los hechos del requisito con los filtros y las fechas de ahora; pulsa «Actualizar» en la barra para volver a intentarlo.'
              : total > rows.length
              ? `Los ${rows.length} hechos más recientes de ${total}, con los filtros y las fechas de la barra.`
              : `${total} ${total === 1 ? 'hecho' : 'hechos'}, con los filtros y las fechas de la barra.`}
          </p>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiBasicTable
          items={rows}
          itemId="id"
          columns={COLUMNS}
          loading={isLoading}
          error={error ? String((error as any)?.message || error) : undefined}
          noItemsMessage="Ningún hecho de este requisito con los filtros y las fechas de la barra"
        />
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              iconType="arrowRight"
              iconSide="right"
              onClick={() => changes({ tabView: 'plugins', control: controlOf(requirementId) })}
            >
              Ver el control
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
