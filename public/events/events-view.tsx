// Pestaña Eventos: los hechos ENS de las máquinas del alcance, los más
// recientes primero, con la barra de búsqueda y las fechas del dashboard.
// Una página de la tabla es una búsqueda (`from`/`size`); el botón de la
// primera columna de cada fila abre el documento entero.
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

const TAMANOS = [25, 50, 100];
const TAMANO_INICIAL = 50;

// Fuera del componente: las columnas no cambian y la cuadrícula no tiene que
// recalcularlas en cada render.
const COLUMNAS = ENS_EVENT_COLUMNS.map(c => ({
  id: c.id,
  displayAsText: c.label,
  initialWidth: c.initialWidth,
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

// Cabecera de la columna del botón que abre el documento: sin texto a la
// vista, con nombre para el lector de pantalla.
const CabeceraDocumento = () => (
  <EuiScreenReaderOnly>
    <span>Documento del hecho</span>
  </EuiScreenReaderOnly>
);

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

const Eventos = ({ barFilters, refreshKey }: { barFilters: unknown[]; refreshKey: number }) => {
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

  // Con tope: los más recientes primero (tests/query-order.test.ts). El
  // `refreshKey` de la barra hace que «Actualizar» vuelva a buscar aunque el
  // rango sea absoluto y los filtros no cambien.
  const { esResults, isLoading, error } = useEsSearch({
    preAppliedFilters: filtros,
    size: tamano,
    from: pageIndex * tamano,
    sorting: [{ timestamp: { order: 'desc' } }],
    refreshKey,
  });

  const hits: any[] = useMemo(() => esResults?.hits?.hits || [], [esResults]);
  const total = Number(esResults?.hits?.total?.value ?? esResults?.hits?.total ?? 0) || 0;
  const inicio = pageIndex * tamano;

  // Estables mientras no cambien las filas: la cuadrícula los trata como
  // componentes y una función nueva en cada render volvería a montar las celdas.
  const celda = useCallback(
    ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
      const valor = getField(hits[rowIndex - inicio]?._source, columnId);
      return columnId === 'timestamp' ? fecha(valor) : valor;
    },
    [hits, inicio]
  );
  const botonDocumento = useCallback(
    ({ rowIndex }: { rowIndex: number }) => {
      const hit = hits[rowIndex - inicio];
      if (!hit) return null;
      return (
        <EuiButtonIcon
          iconType="inspect"
          color="text"
          aria-label={`Ver el documento del hecho del ${fecha(getField(hit._source, 'timestamp'))}`}
          onClick={() => setAbierto(hit)}
        />
      );
    },
    [hits, inicio]
  );
  // Una columna de control, fuera de las que el usuario oculta: el documento
  // se puede abrir con cualquier selección de columnas.
  const columnasDeControl = useMemo(
    () => [{ id: 'documento', width: 40, headerCellRender: CabeceraDocumento, rowCellRender: botonDocumento }],
    [botonDocumento]
  );

  const cambiaPagina = useCallback((index: number) => setPagina({ key: clave, index }), [clave]);
  const cambiaTamano = useCallback(
    (nuevo: number) => {
      setTamano(nuevo);
      setPagina({ key: clave, index: 0 });
    },
    [clave]
  );

  // Si la búsqueda de los filtros de ahora falla, lo que queda en `esResults`
  // es de la búsqueda anterior: ni la tabla ni el recuento se enseñan como si
  // fueran de ahora. Vuelven con la primera búsqueda que salga bien.
  if (error) {
    return (
      <>
        {isLoading && <EuiProgress size="xs" color="accent" />}
        <EuiCallOut color="danger" iconType="alert" title="No se pudieron leer los hechos con los filtros y las fechas de ahora">
          <p>{String((error as any)?.message || error)}</p>
          <p>Pulsa «Actualizar» en la barra para volver a intentarlo.</p>
        </EuiCallOut>
        {abierto && <Documento hit={abierto} onClose={() => setAbierto(undefined)} />}
      </>
    );
  }

  return (
    <>
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
          leadingControlColumns={columnasDeControl}
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

      {!isLoading && total === 0 && (
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
      <Eventos barFilters={barra.filters} refreshKey={barra.refreshKey} />
    </AlertsSearchFrame>
  );
};
