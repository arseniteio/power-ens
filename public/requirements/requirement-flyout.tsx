// Panel lateral de un requisito de la pestaña Controles: su descripción y sus
// hechos más recientes con los filtros de la vista (barra, fechas, alcance).
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
import { buildENSRequirementQuery } from '../ens/core/compliance-view/ens-requirement-index';
import { useSetRouterSearch } from '../routing/use-router-search';
import { useEsSearch } from '../search/use-es-search';
import { controlOf } from './requirements-model';

interface FilaHecho {
  id: string;
  timestamp?: string;
  agente?: string;
  evento?: string;
  requisito?: string;
  evidencia?: string;
  regla?: string;
  reglaId?: string;
}

const texto = (valor: unknown): string | undefined =>
  valor === undefined || valor === null || valor === '' ? undefined : String(valor);

const fecha = (valor?: string): string => {
  if (!valor) return '—';
  const instante = new Date(valor);
  return isNaN(instante.getTime()) ? valor : instante.toLocaleString('es-ES');
};

const COLUMNAS = [
  { field: 'timestamp', name: 'timestamp', width: '170px', render: (v?: string) => fecha(v) },
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
  filters: filtrosDeLaVista,
  refreshKey,
  onClose,
}: {
  requirementId: string;
  description: string;
  filters: unknown[];
  // El de la barra: «Actualizar» vuelve a buscar también con rango absoluto.
  refreshKey: number;
  onClose: () => void;
}) => {
  const cambia = useSetRouterSearch();
  // Con tope: los más recientes primero (tests/query-order.test.ts).
  const { esResults, isLoading, error } = useEsSearch({
    preAppliedFilters: [...filtrosDeLaVista, buildENSRequirementQuery(requirementId)],
    size: 100,
    sorting: [{ timestamp: { order: 'desc' } }],
    refreshKey,
  });

  // Si la búsqueda de los filtros de ahora falla, lo que queda en `esResults`
  // es de la anterior: ni sus filas ni su recuento se enseñan como de ahora.
  const hits: any[] = error ? [] : esResults?.hits?.hits || [];
  const total = Number(esResults?.hits?.total?.value ?? esResults?.hits?.total ?? hits.length) || 0;
  const filas: FilaHecho[] = hits.map((hit, i) => {
    const s = hit?._source || {};
    return {
      id: String(hit?._id ?? i),
      timestamp: texto(s.timestamp),
      agente: texto(s.agent?.name),
      evento: texto(s.data?.event),
      requisito: texto(s.data?.requisito),
      evidencia: texto(s.data?.evidence_id),
      regla: texto(s.rule?.description),
      reglaId: texto(s.rule?.id),
    };
  });

  return (
    <EuiFlyout onClose={onClose} size="l" ownFocus aria-labelledby="ens-requisito-titulo">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="ens-requisito-titulo">Requisito {requirementId}</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s">
          <p>{description}</p>
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiText size="s" color="subdued">
          <p>
            {isLoading
              ? 'Buscando los hechos del requisito…'
              : error
              ? 'No se pudieron leer los hechos del requisito con los filtros y las fechas de ahora; pulsa «Actualizar» en la barra para volver a intentarlo.'
              : total > filas.length
              ? `Los ${filas.length} hechos más recientes de ${total}, con los filtros y las fechas de la barra.`
              : `${total} ${total === 1 ? 'hecho' : 'hechos'}, con los filtros y las fechas de la barra.`}
          </p>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiBasicTable
          items={filas}
          itemId="id"
          columns={COLUMNAS}
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
              onClick={() => cambia({ tabView: 'plugins', control: controlOf(requirementId) })}
            >
              Ver el control
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
