# Servidor de ENSFácil

Dos grupos de rutas, las dos bajo `/api/ensfacil`:

- `configuration` — la configuración ENS activa y su historial (ver `lib/configuration-handlers.ts`).
- `evaluation` — **la evaluación de los controles** (desde 1.2.0). El navegador no descarga hechos para juzgar: pide el resultado aquí.

## Evaluación

Todo se lee **como el usuario que mira** (`asCurrentUser`): el indexador sigue aplicando sus permisos, y la memoria del servidor es por usuario y roles. La configuración activa se lee como en `configuration` (`asInternalUser`).

Cómo se calcula (`lib/evaluation/evaluation-service.ts`):

1. Contexto: usuario, configuración activa (se relee solo si cambia su sello: `updatedAt`, `_seq_no` y `_primary_term`), alcance (inventario de `wazuh-monitoring-*`, el mismo código que el navegador) y una **sonda** de una sola consulta sin documentos: hechos por control y máquina (número y el más reciente), hechos sin control, los tipos que op.acc.3 lee de otros controles, la presencia de cada máquina (su primer hecho) y el último latido de cada día de cada máquina.
2. **Fila a fila**: cada control en cada máquina que lo mide (su plano y su alcance declarado) se evalúa con los hechos de ESA máquina de la ventana, leídos con `search_after` sobre una ventana fija (su final es el instante en que empieza la evaluación), ordenados por `@timestamp` con desempate `id`, `manager.name`, `agent.id` (nunca `_id`, sin PIT; si falta `id` en el borde de una página, la lectura falla), `_source` reducido a lo que lee el motor. Con ellos van los hechos de esa máquina que no nombran control, y los sintéticos que dan lo que el motor leía de otros controles: presencia (op.mon.3) y latidos (op.acc.3) — ver `common/ens/core/control-partition.ts`. Se evalúa con el motor de `common/ens/core` y se sueltan los hechos al terminar la fila y su serie. Como mucho `MAX_FACTS_PER_READ` (50.000, ~85 MB) hechos a la vez por lectura: por encima, error claro. Cada fila se evalúa con la configuración resuelta para su máquina (`configuration.agents`) por el mismo punto que en el navegador (`getActiveControlConfiguration(control, agente)`; `tests/evaluation-server-agents.test.ts`).
   - **Poda exacta de los hechos de estado.** De un hecho de estado el motor solo usa la última observación (`keepLatestRunStateFacts`). Antes de leer, el servidor calcula su MISMO corte —con los latidos de la máquina y el último hecho de cada evidencia, de una agregación por recolector, tipo, evidencia y día (`buildStateFactLastSeenRequest`)— para ahora y para el final de cada día de la serie (`computeStateFactCutoffsByCollector`), y no lee lo que queda bajo el corte en todos esos instantes (`prunableRanges`, `buildStateFactKeepClause`). Ante cualquier duda se lee todo: evidencia en otro campo, campos con varios valores, cubos que no caben en la agregación, más de `PRUNING_MAX_LEAVES` hojas. `tests/evaluation-queries.test.ts` comprueba que, a fecha de cada instante, el motor conserva lo mismo leyendo todo o lo podado. Las acciones y los hechos genéricos (`evidence_state`, `control_state`, `score_snapshot`) se leen enteros: el motor los juzga o los lista en la trazabilidad sobre toda la ventana.
   - **Una pasada por fila sirve a todas las vistas.** Con los mismos hechos, después de responder con el resultado actual, la fila evalúa el final de cada día de la ventana (del más reciente al más antiguo, uno tras otro en una cola y cediendo el hilo entre día y día) y guarda cada punto en cuanto sale. El panel (7 días) y la ficha (30) salen de esos puntos sin volver a leer. Una vista con serie espera hasta `SERIES_WAIT_MS` (20 s) a los días que aún se están calculando; si no llegan, responde sin serie (`meta.timelinePending`) y el navegador vuelve a pedir. Si la fila se recalcula el mismo día por hechos nuevos, los días pasados ya calculados se conservan y solo se lee lo de ahora.
3. La vista de conjunto de cada control se consolida con la consolidación del motor (`consolidateENSControlRows`: filas + máquinas declaradas fuera del alcance). Un control que ninguna máquina mide se evalúa, como el motor, sobre todos sus hechos. La vista de una máquina sale de sus filas sin volver a leer. El estado del panel se arma con `assembleENSComplianceState`. Todo da lo que da `getENSComplianceState` sobre todos los hechos a la vez (`tests/control-partition.test.ts`, `tests/evaluation-server*.test.ts`).
4. **Datos completos o nada**: cada búsqueda va con `allow_partial_search_results=false` y se comprueban `_shards.failed`, `timed_out` y `terminated_early`. Con cualquiera de ellos la petición responde **503** «Datos incompletos: N de M shards fallaron…; reintentar», no se evalúa ni se guarda nada.
5. **Memoria por fila** (usuario y roles, nunca compartida): vale mientras su huella (configuración, alcance, hechos de ese control en esa máquina, sus hechos sin control, su presencia y, para op.acc.3, su último latido) sea la misma y no pasen 60 minutos (para lo que cambia solo con el reloj). Si cambió, la ruta responde **al instante con lo guardado** (`meta.refreshing: true`, `meta.computedAt`) y lo recalcula detrás; una entrada de otra configuración no se enseña. Una fila guarda su resultado sin trazabilidad, las 500 primeras entradas de la trazabilidad comprimidas (deflate) y su serie. Tope de 64 MB para todo lo guardado; al llenarse se va la que lleva más tiempo sin usarse. En el laboratorio (86 filas por usuario) una fila ocupa de media 45 KB (máximo 90 KB) y un usuario 4,3 MB contados: caben 14 usuarios.
   - **Un refresco que falla no se calla.** Lo guardado se sigue enseñando y la respuesta lleva `meta.refreshError` = `{ message, at }`. El siguiente intento en segundo plano espera 30 s, 1, 2, 4 y luego 5 minutos; `retryRefresh=1` («Reintentar» en el navegador) lo intenta ya.
6. **Cálculos compartidos**: una fila la calcula una sola vez quien la necesite a la vez (el panel y la lista abiertos juntos); como mucho 2 lecturas pesadas a la vez, y lo que alguien espera pasa delante de lo que se refresca en segundo plano; lo que sale de la memoria no espera. Si el navegador cierra la petición y nadie más espera esa fila, el cálculo se cancela (lo que se recalcula en segundo plano, no); quien llega después de la cancelación empieza un cálculo nuevo, no hereda el cancelado.
7. La serie diaria de cada vista se arma con los puntos de sus filas (consolidados como el resultado de ahora) y los hechos por día, y se guarda hasta el día siguiente (por zona horaria).

### Errores

| Estado | Cuándo |
|---|---|
| 400 | `controlId` fuera del catálogo, `agentId` fuera del alcance, `timeZone` que no es IANA, `timelineDays` fuera de 0-90, página de trazabilidad fuera de sus límites. Con el motivo. |
| 401/403 | Sin sesión o sin permiso en el indexador. |
| 499 | Cancelada: el navegador se fue y nadie más esperaba. |
| 503 | Datos incompletos (shards fallidos, tiempo agotado en el indexador) o demasiados hechos para una sola lectura. Con el motivo. |

### `GET /api/ensfacil/evaluation`

Parámetros: `include` (`summary` | `results` | `dashboard` | `control`), `agentId`, `controlId`, `timelineDays` (0-90), `timeZone` (IANA, la del navegador: decide qué es «un día» en la serie), `retryRefresh` (`1`: reintentar ya un refresco que falló).

Respuesta: `{ statusCode: 200, error: 0, data }`, con `data`:

| `include` | Para | Contenido |
|---|---|---|
| `summary` | Lista de controles | `meta`, resúmenes del estado (`controlSummary`, `requirementSummary`, `agentSummary`, `evidenceSummary`), `controls[]` = `{ controlId, status, score, evaluated, requirementsNotMet, requirementsNotEvidenced }`, `agents[]` = `{ agentId, agentName, summary }` |
| `dashboard` | Panel | lo anterior + `dashboard` (el modelo del panel ya construido, con `impactEvents` y `evolution`), `agents[].results` = `{ controlId, status, score }[]` y `timeline` |
| `results` | Evidencias, panorama de op.mon.2 | resúmenes + `results[]` (el `ENSComplianceResult` de cada control **sin** `traceability`), `agents` y `timeline` |
| `control` (con `controlId`) | Ficha del control, informes | `result` (el `ENSComplianceResult` con las 100 primeras entradas de `traceability`), `traceabilityTotal`, `traceabilityAvailable` (las que se pueden recorrer por páginas), `agents[]` = `{ agentId, agentName, status, score }` y `timeline` |

`meta`: `{ fingerprint, refreshing, timelinePending, refreshError, computedAt, evaluatedAt, configurationUpdatedAt, level, window: { from, to }, agentId, controlId, facts: { count, newest }, scope[], inventory: { stale, newestTimestamp, agents }, stats }`. Con `refreshing` (o la serie pendiente), `fingerprint` empieza por `refreshing:` (la sonda siguiente siempre la verá distinta). `refreshError` = `{ message, at }`: el último refresco en segundo plano que falló; lo que se enseña es lo anterior a él. Los tipos están en `common/ens/evaluation/types.ts`.

Un punto de `timeline`: `{ date, label, isCurrent, events, score, status? }`. `events` cuenta hechos (documentos) conocidos hasta ese día; el último punto es el resultado de arriba.

### `GET /api/ensfacil/evaluation/probe`

Mismos `agentId`, `controlId` y `timeZone`. Unos cientos de bytes: `{ fingerprint, checkedAt, configurationUpdatedAt, facts: { count, newest } }`. Si `fingerprint` es la de la última evaluación, no ha cambiado nada (el navegador lo comprueba cada 5 minutos con la pestaña a la vista y, si lo que tiene se estaba recalculando, a los 10 segundos; `public/evaluation/refresh-policy.ts`).

### `GET /api/ensfacil/evaluation/traceability`

`controlId` (obligatorio), `agentId`, `from` (≤ 500), `size` (1-500): una página de la trazabilidad del control, de las 500 primeras entradas que se guardan (`ENS_EVALUATION_LIMITS`, `common/ens/evaluation/limits.ts`); `{ total, available, from, items }`.

## Medir la evaluación contra un indexador

`scripts/measure-evaluation.ts` ejecuta el servicio de evaluación (sin la capa HTTP) contra un indexador real con la secuencia de las pantallas —lista de controles en frío, panel con 7 días, ficha de un control con 30 días, ficha de op.mon.3 en una máquina, todos los resultados y, en caliente, otra vez— e imprime por petición el tiempo, las llamadas, los MB leídos, las filas calculadas y si la serie quedó pendiente. Al final, lo leído por control y clase (estado, acciones, genéricos, latidos) frente a lo que hay en la ventana, y la memoria del proceso.

Es **de solo lecturas por construcción**: el cliente que recibe el servicio solo puede hacer `POST /<índice>/_search` (con una lista cerrada de parámetros, sin `scroll` ni PIT), `HEAD /<índice>` y `GET /_plugins/_security/authinfo`; cualquier otra petición (crear el índice de configuración si falta, `_doc`, `_bulk`…) se rechaza antes de enviarse y la medida falla. No escribe ficheros.

Desde la raíz del plugin, con Node 18 o posterior:

```bash
npx --yes tsx server/scripts/measure-evaluation.ts \
  --url https://127.0.0.1:9200 \
  --ca /ruta/root-ca.pem --cert /ruta/admin.pem --key /ruta/admin-key.pem \
  --tz Europe/Madrid --control op.acc.1 --agent 000
```

Resultado esperado: una línea por petición (`summary`, `dashboard 7 días`, …) con `ms`, `llamadas`, `leído`, `filas calculadas` y `serie`; después, «por control: leído / en la ventana» y el total.

Las mismas opciones por entorno: `ENSFACIL_INDEXER_URL`, `ENSFACIL_INDEXER_CA`, `ENSFACIL_INDEXER_CERT`, `ENSFACIL_INDEXER_KEY`, `ENSFACIL_TZ`, `ENSFACIL_CONTROL`, `ENSFACIL_AGENT`. `--insecure` (o `ENSFACIL_INDEXER_INSECURE=1`) no comprueba el certificado del indexador. En un servidor sin Node, con el contenedor oficial de Node y el plugin y los certificados montados de solo lectura:

```bash
docker run --rm --network host -v "$PWD":/plugin:ro -v /ruta/certs:/certs:ro -w /plugin node:18 \
  npx --yes tsx server/scripts/measure-evaluation.ts --ca /certs/root-ca.pem --cert /certs/admin.pem --key /certs/admin-key.pem
```
