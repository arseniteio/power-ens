/**
 * Sin el rol, el servidor responde 403 con el motivo en el cuerpo. El cliente
 * HTTP del núcleo pone en el error solo el texto del estado («Forbidden»), y
 * eso es lo que salía en pantalla. Tiene que salir el motivo.
 *
 *   npx --yes tsx tests/configuration-save-error.test.ts
 */
import { setServices } from '../public/services';
import {
  getENSConfiguration,
  saveENSConfiguration,
} from '../public/ens/configuration/services/configuration-http-client';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

const MOTIVO = 'Hace falta el rol ensfacil_admin o all_access para cambiar la configuración ENS o ver su historial.';

// La forma del error del núcleo (HttpFetchError): mensaje = statusText, y el
// cuerpo de la respuesta en `body`.
const errorDelNucleo = (statusText: string, status: number, body?: unknown) =>
  Object.assign(new Error(statusText), { name: 'Error', body, response: { status } });

let responde: () => Promise<unknown> = async () => ({});
setServices({ http: { get: () => responde(), put: () => responde() } } as any, {} as any);

const configuracion: any = { controls: [] };
const mensajeDe = (p: Promise<unknown>) => p.then(() => 'SIN ERROR', (e: any) => e?.message);

(async () => {
  responde = () => Promise.reject(errorDelNucleo('Forbidden', 403, { statusCode: 403, error: 'Forbidden', message: MOTIVO }));
  comprueba('guardar sin rol: sale el motivo, no «Forbidden»', (await mensajeDe(saveENSConfiguration(configuracion))) === MOTIVO);
  comprueba('leer con un motivo del servidor: sale el motivo', (await mensajeDe(getENSConfiguration())) === MOTIVO);

  responde = () => Promise.reject(errorDelNucleo('Internal Server Error', 500));
  comprueba('sin cuerpo: se queda el error del núcleo', (await mensajeDe(saveENSConfiguration(configuracion))) === 'Internal Server Error');

  responde = () => Promise.reject(errorDelNucleo('Bad Gateway', 502, '<html>proxy</html>'));
  comprueba('cuerpo que no es del servidor: se queda el error del núcleo', (await mensajeDe(saveENSConfiguration(configuracion))) === 'Bad Gateway');

  const estado = { configuration: { controls: [] }, metadata: null };
  responde = async () => ({ statusCode: 200, error: 0, data: estado });
  const guardado = await saveENSConfiguration(configuracion).catch((e: any) => e);
  comprueba('guardar con rol: sigue devolviendo lo que dice el servidor', guardado === estado, guardado?.message);

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
