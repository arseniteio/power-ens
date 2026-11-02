import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiButtonIcon,
  EuiCallOut,
  EuiCodeBlock,
  EuiDataGrid,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiProgress,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { getActiveENSScopeAgents } from '../../common/ens/core/scope';
import { useRouterSearch } from '../routing/use-router-search';
import { AlertsSearchFrame, useAlertsSearchBar } from '../search/alerts-search-bar';
import { useEsSearch } from '../search/use-es-search';
import {
  buildEventsFilters,
  ENS_EVENT_COLUMNS,
  ENS_EVENTS_MAX_WINDOW,
  getField,
  navigableEventRows,
  pageIndexFor,
} from './events-columns';
import { dateTimeLabel } from '../../common/ens/core/date-label';

const PAGE_SIZES = [25, 50, 100];
const INITIAL_PAGE_SIZE = 50;

const COLUMNS = ENS_EVENT_COLUMNS.map(c => ({
  id: c.id,
  displayAsText: c.label,
  initialWidth: c.initialWidth,
}));
const ALL = ENS_EVENT_COLUMNS.map(c => c.id);
const TABLE_TOOLBAR = { showSortSelector: false };

const number = (n: number): string => n.toLocaleString('es-ES');

const date = (value: string): string => {
  if (!value) return '';
  const instant = new Date(value);
  return isNaN(instant.getTime()) ? value : dateTimeLabel(instant);
};

const count = (total: number, isLoading: boolean, hasResults: boolean): string => {
  if (isLoading && !hasResults) return 'Buscando hechos…';
  if (total > ENS_EVENTS_MAX_WINDOW) {
    return `${number(total)} hechos; la tabla recorre los ${number(ENS_EVENTS_MAX_WINDOW)} más recientes.`;
  }
  return `${number(total)} ${total === 1 ? 'hecho' : 'hechos'}`;
};

const DocumentHeader = () => (
  <EuiScreenReaderOnly>
    <span>Documento del hecho</span>
  </EuiScreenReaderOnly>
);

const EventDocument = ({ hit, onClose }: { hit: any; onClose: () => void }) => {
  const s = hit?._source || {};
  const summary = [date(getField(s, 'timestamp')), getField(s, 'agent.name'), getField(s, 'rule.description')]
    .filter(Boolean)
    .join(' · ');

  return (
    <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="ens-hecho-titulo">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="ens-hecho-titulo">Hecho</h2>
        </EuiTitle>
        {summary && (
          <>
            <EuiSpacer size="s" />
            <EuiText size="s" color="subdued">
              <p>{summary}</p>
            </EuiText>
          </>
        )}
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiCodeBlock language="json" isCopyable paddingSize="s" fontSize="s">
          {JSON.stringify(s, null, 2)}
        </EuiCodeBlock>
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

const EventsScreen = ({ barFilters, refreshKey }: { barFilters: unknown[]; refreshKey: number }) => {
  const { agentId } = useRouterSearch();
  const filters = [...buildEventsFilters(getActiveENSScopeAgents(), agentId), ...barFilters];
  const key = JSON.stringify(filters);

  const [pageSize, setPageSize] = useState(INITIAL_PAGE_SIZE);
  const [pageNumber, setPageNumber] = useState({ key: key, index: 0 });
  const pageIndex = pageIndexFor(pageNumber, key);
  useEffect(() => {
    setPageNumber(p => (p.key === key ? p : { key: key, index: 0 }));
  }, [key]);

  const [visibleItems, setVisible] = useState<string[]>(ALL);
  const [isOpen, setIsOpen] = useState<any>();

  const { esResults, isLoading, error } = useEsSearch({
    preAppliedFilters: filters,
    size: pageSize,
    from: pageIndex * pageSize,
    sorting: [{ timestamp: { order: 'desc' } }],
    refreshKey,
  });

  const hits: any[] = useMemo(() => esResults?.hits?.hits || [], [esResults]);
  const total = Number(esResults?.hits?.total?.value ?? esResults?.hits?.total ?? 0) || 0;
  const start = pageIndex * pageSize;

  const cell = useCallback(
    ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
      const value = getField(hits[rowIndex - start]?._source, columnId);
      return columnId === 'timestamp' ? date(value) : value;
    },
    [hits, start]
  );
  const documentButton = useCallback(
    ({ rowIndex }: { rowIndex: number }) => {
      const hit = hits[rowIndex - start];
      if (!hit) return null;
      return (
        <EuiButtonIcon
          iconType="inspect"
          color="text"
          aria-label={`Ver el documento del hecho del ${date(getField(hit._source, 'timestamp'))}`}
          onClick={() => setIsOpen(hit)}
        />
      );
    },
    [hits, start]
  );
  const controlColumns = useMemo(
    () => [{ id: 'documento', width: 40, headerCellRender: DocumentHeader, rowCellRender: documentButton }],
    [documentButton]
  );

  const changePage = useCallback((index: number) => setPageNumber({ key: key, index }), [key]);
  const changePageSize = useCallback(
    (newItem: number) => {
      setPageSize(newItem);
      setPageNumber({ key: key, index: 0 });
    },
    [key]
  );

  if (error) {
    return (
      <>
        {isLoading && <EuiProgress size="xs" color="accent" />}
        <EuiCallOut color="danger" iconType="alert" title="No se pudieron leer los hechos con los filtros y las fechas de ahora">
          <p>{String((error as any)?.message || error)}</p>
          <p>Pulsa «Actualizar» en la barra para volver a intentarlo.</p>
        </EuiCallOut>
        {isOpen && <EventDocument hit={isOpen} onClose={() => setIsOpen(undefined)} />}
      </>
    );
  }

  return (
    <>
      <EuiText size="s">
        <p>
          <strong>{count(total, isLoading, hits.length > 0)}</strong>
        </p>
      </EuiText>
      <EuiSpacer size="s" />

      <div style={{ position: 'relative' }}>
        {isLoading && <EuiProgress size="xs" color="accent" position="absolute" />}
        <EuiDataGrid
          aria-label="Hechos ENS"
          columns={COLUMNS}
          columnVisibility={{ visibleColumns: visibleItems, setVisibleColumns: setVisible }}
          leadingControlColumns={controlColumns}
          rowCount={navigableEventRows(total)}
          renderCellValue={cell}
          toolbarVisibility={TABLE_TOOLBAR}
          gridStyle={{ fontSize: 's', cellPadding: 's', border: 'horizontal', header: 'underline' }}
          pagination={{
            pageIndex,
            pageSize: pageSize,
            pageSizeOptions: PAGE_SIZES,
            onChangePage: changePage,
            onChangeItemsPerPage: changePageSize,
          }}
        />
      </div>

      {!isLoading && total === 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            <p>Ningún hecho ENS con los filtros y las fechas de la barra.</p>
          </EuiText>
        </>
      )}

      {isOpen && <EventDocument hit={isOpen} onClose={() => setIsOpen(undefined)} />}
    </>
  );
};

export const EventsView = () => {
  const bar = useAlertsSearchBar();

  return (
    <AlertsSearchFrame barra={bar}>
      <EventsScreen barFilters={bar.filters} refreshKey={bar.refreshKey} />
    </AlertsSearchFrame>
  );
};
