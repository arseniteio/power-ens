# Servidor de ENSFácil

Dos grupos de rutas, las dos bajo `/api/ensfacil`:

- `configuration` — la configuración ENS activa y su historial (ver `lib/configuration-handlers.ts`).
- `evaluation` — **la evaluación de los controles** (desde 1.2.0). El navegador no descarga hechos para juzgar: pide el resultado aquí.

## Evaluación

Todo se lee **como el usuario que mira** (`asCurrentUser`): el indexador sigue aplicando sus permisos, y la memoria del servidor es por usuario y roles. La configuración activa se lee como en `configuration` (`asInternalUser`).

Cómo se calcula (`lib/evaluation/evaluation-service.ts`):

1. Contexto: usuario, configuración activa (se relee solo si cambia su `updatedAt`), alcance (inventario de `wazuh-monitoring-*`, el mismo código que el navegador) y una **sonda** de una sola consulta sin documentos: hechos por control (número y el más reciente), hechos sin control y el primer hecho de cada máquina.
2. Cada control se evalúa con **todos** sus hechos de la ventana de la configuración, leídos con `search_after` (sobre PIT si el indexador lo permite), `_source` reducido a lo que lee el motor y **sin** los hechos de estado de pasadas anteriores que el motor descartaría (`computeStateFactPruningCutoffs`). Se evalúa con el motor de `common/ens/core` (`evaluateENSControlPartition`) y se sueltan los hechos antes de leer el siguiente control.
3. El estado del panel se arma con los resultados de cada control (`assembleENSComplianceState`): es el de `getENSComplianceState` sobre todos los hechos (`tests/control-partition.test.ts`, `tests/evaluation-server.test.ts`).
4. Siempre se evalúa el alcance entero; la vista de una máquina sale de sus filas sin volver a leer.
5. Memoria: por control, mientras no cambien su huella (configuración, alcance, hechos del control y presencia de las máquinas) y no pasen 10 minutos (el motor mide contra el reloj). Los días pasados de una serie se calculan una vez al día.

### `GET /api/ensfacil/evaluation`

Parámetros: `include` (`summary` | `results` | `dashboard` | `control`), `agentId`, `controlId`, `timelineDays` (0-90), `timeZone` (IANA, la del navegador: decide qué es «un día» en la serie).

Respuesta: `{ statusCode: 200, error: 0, data }`, con `data`:

| `include` | Para | Contenido |
|---|---|---|
| `summary` | Lista de controles | `meta`, resúmenes del estado (`controlSummary`, `requirementSummary`, `agentSummary`, `evidenceSummary`), `controls[]` = `{ controlId, status, score, evaluated, requirementsNotMet, requirementsNotEvidenced }`, `agents[]` = `{ agentId, agentName, summary }` |
| `dashboard` | Panel | lo anterior + `dashboard` (el modelo del panel ya construido, con `impactEvents` y `evolution`), `agents[].results` = `{ controlId, status, score }[]` y `timeline` |
| `results` | Evidencias, panorama de op.mon.2 | resúmenes + `results[]` (el `ENSComplianceResult` de cada control **sin** `traceability`), `agents` y `timeline` |
| `control` (con `controlId`) | Ficha del control, informes | `result` (el `ENSComplianceResult` con las 100 entradas más recientes de `traceability`), `traceabilityTotal`, `agents[]` = `{ agentId, agentName, status, score }` y `timeline` |

`meta`: `{ fingerprint, evaluatedAt, configurationUpdatedAt, level, window: { from, to }, agentId, controlId, facts: { count, newest }, scope[], inventory: { stale, newestTimestamp, agents }, stats }`.

Un punto de `timeline`: `{ date, label, isCurrent, events, score, status? }`. `events` cuenta hechos (documentos) conocidos hasta ese día; el último punto es el resultado de arriba.

### `GET /api/ensfacil/evaluation/probe`

Mismos `agentId`, `controlId` y `timeZone`. Unos cientos de bytes: `{ fingerprint, checkedAt, configurationUpdatedAt, facts: { count, newest } }`. Si `fingerprint` es la de la última evaluación, no ha cambiado nada (el navegador lo comprueba cada 5 minutos con la pestaña a la vista, `public/evaluation/use-evaluation.ts`).

### `GET /api/ensfacil/evaluation/traceability`

`controlId` (obligatorio), `agentId`, `from`, `size` (≤ 500): una página de la trazabilidad del control, de las 2.000 entradas más recientes que se guardan; `{ total, available, from, items }`.
