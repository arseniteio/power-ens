# Servidor de ENSFácil

Dos grupos de rutas, las dos bajo `/api/ensfacil`:

- `configuration` — la configuración ENS activa y su historial (ver `lib/configuration-handlers.ts`).
- `evaluation` — **la evaluación de los controles** (desde 1.2.0). El navegador no descarga hechos para juzgar: pide el resultado aquí.

## Evaluación

Todo se lee **como el usuario que mira** (`asCurrentUser`): el indexador sigue aplicando sus permisos, y la memoria del servidor es por usuario y roles. La configuración activa se lee como en `configuration` (`asInternalUser`).

Cómo se calcula (`lib/evaluation/evaluation-service.ts`):

1. Contexto: usuario, configuración activa (se relee solo si cambia su sello: `updatedAt`, `_seq_no` y `_primary_term`), alcance (inventario de `wazuh-monitoring-*`, el mismo código que el navegador) y una **sonda** de una sola consulta sin documentos: hechos por control y máquina (número y el más reciente), hechos sin control, los tipos que op.acc.3 lee de otros controles, la presencia de cada máquina (su primer hecho) y el último latido de cada día de cada máquina.
2. **Fila a fila**: cada control en cada máquina que lo mide (su plano y su alcance declarado) se evalúa con **todos** los hechos de ESA máquina de la ventana, leídos con `search_after` sobre una ventana fija (su final es el instante en que empieza la evaluación), ordenados por `@timestamp` con desempate `id`, `manager.name`, `agent.id` (nunca `_id`, sin PIT), `_source` reducido a lo que lee el motor y **sin** los hechos de estado de pasadas anteriores que el motor descartaría (`computeStateFactPruningCutoffs`; la cláusula es de una máquina y se acota a `PRUNING_MAX_KEYS` claves). Con ellos van los hechos de esa máquina que no nombran control, y los sintéticos que dan lo que el motor leía de otros controles: presencia (op.mon.3) y latidos (op.acc.3) — ver `common/ens/core/control-partition.ts`. Se evalúa con el motor de `common/ens/core` y se sueltan los hechos antes de la siguiente fila. Como mucho `MAX_FACTS_PER_READ` hechos a la vez: por encima, error claro. Cada fila se evalúa con la configuración resuelta para su máquina (`configuration.agents`) por el mismo punto que en el navegador (`getActiveControlConfiguration(control, agente)`; `tests/evaluation-server-agents.test.ts`).
3. La vista de conjunto de cada control se consolida con la consolidación del motor (`consolidateENSControlRows`: filas + máquinas declaradas fuera del alcance). Un control que ninguna máquina mide se evalúa, como el motor, sobre todos sus hechos. La vista de una máquina sale de sus filas sin volver a leer. El estado del panel se arma con `assembleENSComplianceState`. Todo da lo que da `getENSComplianceState` sobre todos los hechos a la vez (`tests/control-partition.test.ts`, `tests/evaluation-server*.test.ts`).
4. **Datos completos o nada**: cada búsqueda va con `allow_partial_search_results=false` y se comprueban `_shards.failed`, `timed_out` y `terminated_early`. Con cualquiera de ellos la petición responde **503** «Datos incompletos: N de M shards fallaron…; reintentar», no se evalúa ni se guarda nada.
5. **Memoria por fila** (usuario y roles, nunca compartida): vale mientras su huella (configuración, alcance, hechos de ese control en esa máquina, sus hechos sin control, su presencia y, para op.acc.3, su último latido) sea la misma y no pasen 60 minutos (para lo que cambia solo con el reloj). Si cambió, la ruta responde **al instante con lo guardado** (`meta.refreshing: true`, `meta.computedAt`) y lo recalcula detrás; una entrada de otra configuración no se enseña. Tope de 48 MB (JSON) para todo lo guardado.
6. **Cálculos compartidos**: una fila la calcula una sola vez quien la necesite a la vez (el panel y la lista abiertos juntos); como mucho 2 lecturas pesadas a la vez; lo que sale de la memoria no espera. Si el navegador cierra la petición y nadie más espera esa fila, el cálculo se cancela (lo que se recalcula en segundo plano, no).
7. La serie diaria: los días pasados se calculan una vez al día (por zona horaria) y se guardan.

### Errores

| Estado | Cuándo |
|---|---|
| 400 | `controlId` fuera del catálogo, `agentId` fuera del alcance, `timeZone` que no es IANA, `timelineDays` fuera de 0-90, página de trazabilidad fuera de sus límites. Con el motivo. |
| 401/403 | Sin sesión o sin permiso en el indexador. |
| 499 | Cancelada: el navegador se fue y nadie más esperaba. |
| 503 | Datos incompletos (shards fallidos, tiempo agotado en el indexador) o demasiados hechos para una sola lectura. Con el motivo. |

### `GET /api/ensfacil/evaluation`

Parámetros: `include` (`summary` | `overview` | `results` | `dashboard` | `control`), `agentId`, `controlId`, `timelineDays` (0-90), `timeZone` (IANA, la del navegador: decide qué es «un día» en la serie), `timelineControls` (`true`: los puntos de la serie llevan además el estado de cada control; solo lo pide la tendencia de la Vista general).

Respuesta: `{ statusCode: 200, error: 0, data }`, con `data`:

| `include` | Para | Contenido |
|---|---|---|
| `summary` | Lista de controles | `meta`, resúmenes del estado (`controlSummary`, `requirementSummary`, `agentSummary`, `evidenceSummary`), `controls[]` = `{ controlId, status, score, evaluated, requirementsNotMet, requirementsNotEvidenced }`, `agents[]` = `{ agentId, agentName, summary, controls[] }` (`controls`: lo mismo para cada control EN LA FILA de esa máquina; los que no se miden en ella no aparecen) y, con `timelineDays`, `timeline` |
| `overview` | Vista general | lo de `summary` + `freshness` = `{ checkedAt, agents[]: { agentId, count, earliest, newest, lastHeartbeat }, cells[]: { controlId, agentId, count, newest } }` (de la sonda: ninguna lectura más; los nombres, en `meta.scope`) + `nonConformities[]` = las no conformidades de la vista de conjunto, solo lo que pinta la cola de trabajo: `controlId`, `id`, `requirementId`, `origin`, `cause`, `documental`, `evidenceIds`, `agentIds` y el titular (`title`, `titleEvidenceId`, `titleStatus`: la primera frase de la evidencia culpable, `common/ens/evaluation/motive-parser.ts`) |
| `dashboard` | Panel | lo anterior + `dashboard` (el modelo del panel ya construido, con `impactEvents` y `evolution`), `agents[].results` = `{ controlId, status, score }[]` y `timeline` |
| `results` | Evidencias, panorama de op.mon.2 | resúmenes + `results[]` (el `ENSComplianceResult` de cada control **sin** `traceability`), `agents` y `timeline` |
| `control` (con `controlId`) | Ficha del control, informes | `result` (el `ENSComplianceResult` con las 100 primeras entradas de `traceability`), `traceabilityTotal`, `traceabilityAvailable` (las que se pueden recorrer por páginas), `agents[]` = `{ agentId, agentName, status, score }` y `timeline` |

`meta`: `{ fingerprint, refreshing, computedAt, evaluatedAt, configurationUpdatedAt, level, window: { from, to }, agentId, controlId, facts: { count, newest }, scope[], inventory: { stale, newestTimestamp, agents }, stats }`. Con `refreshing`, `fingerprint` empieza por `refreshing:` (la sonda siguiente siempre la verá distinta). Los tipos están en `common/ens/evaluation/types.ts`.

Un punto de `timeline`: `{ date, label, isCurrent, events, score, status?, controls? }`; `controls` (solo sin `controlId` y con `timelineControls=true`) = `{ [controlId]: { status, score } }`, el estado de cada control ese día en la vista. `events` cuenta hechos (documentos) conocidos hasta ese día; el último punto es el resultado de arriba.

### `GET /api/ensfacil/evaluation/probe`

Mismos `agentId`, `controlId` y `timeZone`. Unos cientos de bytes: `{ fingerprint, checkedAt, configurationUpdatedAt, facts: { count, newest } }`. Si `fingerprint` es la de la última evaluación, no ha cambiado nada (el navegador lo comprueba cada 5 minutos con la pestaña a la vista y, si lo que tiene se estaba recalculando, a los 10 segundos; `public/evaluation/refresh-policy.ts`).

### `GET /api/ensfacil/evaluation/traceability`

`controlId` (obligatorio), `agentId`, `from` (≤ 500), `size` (1-500): una página de la trazabilidad del control, de las 500 primeras entradas que se guardan (`ENS_EVALUATION_LIMITS`, `common/ens/evaluation/limits.ts`); `{ total, available, from, items }`.
