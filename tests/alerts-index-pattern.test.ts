/**
 * La búsqueda del patrón de índice de la barra: por su título exacto, con la
 * lista de patrones recién leída (un patrón creado con la página abierta se
 * encuentra sin recargar), y sin confundir «no existe» con «no se pudo leer».
 *
 *   npx --yes tsx tests/alerts-index-pattern.test.ts
 */
import { findIndexPatternByTitle } from '../public/search/alerts-index-pattern';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

const patron = { id: 'wazuh-alerts-*', title: 'wazuh-alerts-*', timeFieldName: 'timestamp' };

// El servicio `data.indexPatterns` del dashboard, de mentira: `getIdsWithTitle`
// solo vuelve a leer los patrones cuando se le pide (`refresh`); si no, sirve
// la lista que guardó la primera vez.
const servicio = (opciones: { lista?: () => { id: string; title: string }[]; get?: (id: string) => unknown } = {}) => {
  const llamadas: { refresh?: boolean; get: string[] } = { get: [] };
  let cache: { id: string; title: string }[] | undefined;
  return {
    llamadas,
    getIdsWithTitle: async (refresh?: boolean) => {
      llamadas.refresh = refresh;
      if (!cache || refresh) cache = (opciones.lista || (() => [{ id: patron.id, title: patron.title }]))();
      return cache;
    },
    get: async (id: string) => {
      llamadas.get.push(id);
      return (opciones.get || (() => patron))(id) as typeof patron;
    },
  };
};

(async () => {
  const s = servicio();
  const hallado = await findIndexPatternByTitle(s, 'wazuh-alerts-*');
  comprueba('lo encuentra por su título', hallado.indexPattern === patron && !hallado.error, hallado);
  comprueba('carga el patrón por su id', s.llamadas.get.join() === 'wazuh-alerts-*', s.llamadas.get);
  comprueba('pide la lista recién leída, no la de la caché', s.llamadas.refresh === true, s.llamadas.refresh);

  // La caché se llenó sin el patrón; el usuario lo crea y vuelve a la pestaña.
  let creado = false;
  const tarde = servicio({ lista: () => (creado ? [{ id: 'nuevo', title: 'wazuh-alerts-*' }] : [{ id: 'otro', title: 'otro-*' }]) });
  await tarde.getIdsWithTitle();
  creado = true;
  const despues = await findIndexPatternByTitle(tarde, 'wazuh-alerts-*');
  comprueba('un patrón creado después de llenarse la caché se encuentra', despues.indexPattern === patron, despues);

  const parecido = await findIndexPatternByTitle(
    servicio({ lista: () => [{ id: 'a', title: 'wazuh-alerts-4.x-*' }, { id: 'b', title: 'wazuh-alerts' }] }),
    'wazuh-alerts-*'
  );
  comprueba('título parecido no vale: no existe', !parecido.indexPattern && !parecido.error, parecido);

  const ninguno = await findIndexPatternByTitle(servicio({ lista: () => [] }), 'wazuh-alerts-*');
  comprueba('sin patrones: no existe, sin error', !ninguno.indexPattern && ninguno.error === undefined, ninguno);

  const sinPermiso = await findIndexPatternByTitle(
    servicio({
      lista: () => {
        throw new Error('Forbidden');
      },
    }),
    'wazuh-alerts-*'
  );
  comprueba('la lista no se puede leer: error con su causa, no «no existe»', sinPermiso.error === 'Forbidden' && !sinPermiso.indexPattern, sinPermiso);

  const rotoAlCargar = await findIndexPatternByTitle(
    servicio({
      get: () => {
        throw new Error('Network error');
      },
    }),
    'wazuh-alerts-*'
  );
  comprueba('el patrón no se puede cargar: error con su causa', rotoAlCargar.error === 'Network error' && !rotoAlCargar.indexPattern, rotoAlCargar);

  const rarisimo = await findIndexPatternByTitle(
    servicio({
      lista: () => {
        throw 'sin mensaje';
      },
    }),
    'wazuh-alerts-*'
  );
  comprueba('un fallo sin mensaje también se cuenta', rarisimo.error === 'sin mensaje', rarisimo);

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
