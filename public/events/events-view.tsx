// Pestaña Eventos: los hechos ENS de las máquinas del alcance, los más
// recientes primero, con la barra de búsqueda y las fechas del dashboard.
// Una página de la tabla es una búsqueda (`from`/`size`); la fecha de cada
// fila abre el documento entero.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiCallOut,
  EuiCodeBlock,
  EuiDataGrid,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLink,
  EuiProgress,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { getActiveENSScopeAgents } from '../ens/core/scope';
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

const TAMANOS = [25, 50, 100];
const TAMANO_INICIAL = 50;

// Fuera del componente: las columnas no cambian y la cuadrícula no tiene que
// recalcularlas en cada render. La fecha es un enlace, no se despliega.
const COLUMNAS = ENS_EVENT_COLUMNS.map(c => ({
  id: c.id,
  displayAsText: c.label,
  initialWidth: c.initialWidth,
  isExpandable: c.id !== 'timestamp',
}));
const TODAS = ENS_EVENT_COLUMNS.map(c => c.id);
// Sin ordenar desde la tabla: el orden es el de la búsqueda (los más
// recientes primero) y un orden por columna solo ordenaría la página.
const BARRA_DE_LA_TABLA = { showSortSelector: false };

const numero = (n: number): string => n.toLocaleString('es-ES');

const fecha = (valor: string): string => {
  if (!valor) return '';
  const instante = new Date(valor);
  return isNaN(instante.getTime()) ? valor : instante.toLocaleString('es-ES');
};

const recuento = (total: number, isLoading: boolean, hayResultados: boolean): string => {
  if (isLoading && !hayResultados) return 'Buscando hechos…';
  if (total > ENS_EVENTS_MAX_WINDOW) {
    return `${numero(total)} hechos; la tabla recorre los ${numero(ENS_EVENTS_MAX_WINDOW)} más recientes.`;
  }
  return `${numero(total)} ${total === 1 ? 'hecho' : 'hechos'}`;
};

const Documento = ({ hit, onClose }: { hit: any; onClose: () => void }) => {
  const s = hit?._source || {};
  const resumen = [fecha(getField(s, 'timestamp')), getField(s, 'agent.name'), getField(s, 'rule.description')]
    .filter(Boolean)
    .join(' · ');

  return (
    <EuiFlyout onClose={onClose} size="m" ownFocus aria-labelledby="ens-hecho-titulo">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="ens-hecho-titulo">Hecho</h2>
        </EuiTitle>
        {resumen && (
          <>
            <EuiSpacer size="s" />
            <EuiText size="s" color="subdued">
              <p>{resumen}</p>
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

const Eventos = ({ barFilters }: { barFilters: unknown[] }) => {
  const { agentId } = useRouterSearch();
  // Deterministas (alcance, máquina) más los de la barra, memorizados en su
  // hook: el mismo JSON entre renders, y `useEsSearch` no vuelve a buscar.
  const filtros = [...buildEventsFilters(getActiveENSScopeAgents(), agentId), ...barFilters];
  const clave = JSON.stringify(filtros);

  const [tamano, setTamano] = useState(TAMANO_INICIAL);
  const [pagina, setPagina] = useState({ key: clave, index: 0 });
  // Con otros filtros, la primera página desde este mismo render: no se pide
  // la página vieja con los filtros nuevos. El efecto solo lo deja guardado.
  const pageIndex = pageIndexFor(pagina, clave);
  useEffect(() => {
    setPagina(p => (p.key === clave ? p : { key: clave, index: 0 }));
  }, [clave]);

  const [visibles, setVisibles] = useState<string[]>(TODAS);
  const [abierto, setAbierto] = useState<any>();

  // Con tope: los más recientes primero (tests/query-order.test.ts).
  const { esResults, isLoading, error } = useEsSearch({
    preAppliedFilters: filtros,
    size: tamano,
    from: pageIndex * tamano,
    sorting: [{ timestamp: { order: 'desc' } }],
  });

  const hits: any[] = useMemo(() => esResults?.hits?.hits || [], [esResults]);
  const total = Number(esResults?.hits?.total?.value ?? esResults?.hits?.total ?? 0) || 0;
  const inicio = pageIndex * tamano;

  // Estable mientras no cambien las filas: la cuadrícula la trata como un
  // componente y una función nueva en cada render volvería a montar las celdas.
  const celda = useCallback(
    ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
      const hit = hits[rowIndex - inicio];
      const valor = getField(hit?._source, columnId);
      if (columnId !== 'timestamp' || !hit) return valor;
      return (
        <EuiLink onClick={() => setAbierto(hit)} aria-label={`Ver el documento del hecho del ${fecha(valor)}`}>
          {fecha(valor)}
        </EuiLink>
      );
    },
    [hits, inicio]
  );

  const cambiaPagina = useCallback((index: number) => setPagina({ key: clave, index }), [clave]);
  const cambiaTamano = useCallback(
    (nuevo: number) => {
      setTamano(nuevo);
      setPagina({ key: clave, index: 0 });
    },
    [clave]
  );

  return (
    <>
      {error && (
        <>
          <EuiCallOut color="danger" iconType="alert" title="No se pudieron leer los hechos">
            <p>{String((error as any)?.message || error)}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiText size="s">
        <p>
          <strong>{recuento(total, isLoading, hits.length > 0)}</strong>
        </p>
      </EuiText>
      <EuiSpacer size="s" />

      <div style={{ position: 'relative' }}>
        {isLoading && <EuiProgress size="xs" color="accent" position="absolute" />}
        <EuiDataGrid
          aria-label="Hechos ENS"
          columns={COLUMNAS}
          columnVisibility={{ visibleColumns: visibles, setVisibleColumns: setVisibles }}
          rowCount={navigableEventRows(total)}
          renderCellValue={celda}
          toolbarVisibility={BARRA_DE_LA_TABLA}
          gridStyle={{ fontSize: 's', cellPadding: 's', border: 'horizontal', header: 'underline' }}
          pagination={{
            pageIndex,
            pageSize: tamano,
            pageSizeOptions: TAMANOS,
            onChangePage: cambiaPagina,
            onChangeItemsPerPage: cambiaTamano,
          }}
        />
      </div>

      {!isLoading && !error && total === 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            <p>Ningún hecho ENS con los filtros y las fechas de la barra.</p>
          </EuiText>
        </>
      )}

      {abierto && <Documento hit={abierto} onClose={() => setAbierto(undefined)} />}
    </>
  );
};

export const EventsView = () => {
  const barra = useAlertsSearchBar();

  return (
    <AlertsSearchFrame barra={barra}>
      <Eventos barFilters={barra.filters} />
    </AlertsSearchFrame>
  );
};
