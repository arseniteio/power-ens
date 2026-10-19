/** Without the role the server answers 403 with the reason in the body; the client must show the reason. */
import { setServices } from '../public/services';
import {
  getENSConfiguration,
  saveENSConfiguration,
} from '../common/ens/configuration/services/configuration-http-client';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const MOTIVE = 'Hace falta el rol ensfacil_admin o all_access para cambiar la configuración ENS o ver su historial.';

const coreError = (statusText: string, status: number, body?: unknown) =>
  Object.assign(new Error(statusText), { name: 'Error', body, response: { status } });

let responde: () => Promise<unknown> = async () => ({});
setServices({ http: { get: () => responde(), put: () => responde() } } as any, {} as any);

const configuration: any = { controls: [] };
const messageOf = (p: Promise<unknown>) => p.then(() => 'SIN ERROR', (e: any) => e?.message);

(async () => {
  responde = () => Promise.reject(coreError('Forbidden', 403, { statusCode: 403, error: 'Forbidden', message: MOTIVE }));
  check('saving without the role: the reason is shown, not «Forbidden»', (await messageOf(saveENSConfiguration(configuration))) === MOTIVE);
  check('reading with a server reason: the reason is shown', (await messageOf(getENSConfiguration())) === MOTIVE);

  responde = () => Promise.reject(coreError('Internal Server Error', 500));
  check('no body: the core error stays', (await messageOf(saveENSConfiguration(configuration))) === 'Internal Server Error');

  responde = () => Promise.reject(coreError('Bad Gateway', 502, '<html>proxy</html>'));
  check('body that is not the server\'s: the core error stays', (await messageOf(saveENSConfiguration(configuration))) === 'Bad Gateway');

  const estado = { configuration: { controls: [] }, metadata: null };
  responde = async () => ({ statusCode: 200, error: 0, data: estado });
  const saved = await saveENSConfiguration(configuration).catch((e: any) => e);
  check('saving with the role: still returns what the server says', saved === estado, saved?.message);

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
