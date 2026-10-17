import assert from 'node:assert/strict';
import { ENSRequestTimeoutError, withRequestTimeout } from '../common/platform/request-timeout';

async function main() {
  const successController = new AbortController();
  assert.equal(await withRequestTimeout(async () => 42, 'prueba', successController, 10), 42);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(successController.signal.aborted, false, 'una respuesta correcta limpia el temporizador');

  const failure = new Error('Sin permisos');
  await assert.rejects(withRequestTimeout(async () => { throw failure; }, 'prueba'), error => error === failure);
  await assert.rejects(withRequestTimeout(() => { throw failure; }, 'prueba'), error => error === failure);

  const controller = new AbortController();
  await assert.rejects(
    withRequestTimeout(() => new Promise(() => {}), 'inventario', controller, 5),
    error => error instanceof ENSRequestTimeoutError && error.message.includes('inventario'),
  );
  assert.equal(controller.signal.aborted, true, 'se cancela aunque el servicio no resuelva al abortar');

  await assert.rejects(withRequestTimeout(signal => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('AbortError')));
  }), 'configuración', new AbortController(), 5), ENSRequestTimeoutError);
  console.log('TODO OK: respuestas, fallos y consultas bloqueadas');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
