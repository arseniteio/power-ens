# Servidor de ENSFácil

Tres grupos de rutas, todos bajo `/api/ensfacil`:

- `configuration` — la configuración ENS activa y su historial (ver `lib/configuration-handlers.ts`).
- `evaluation` — **la evaluación de los controles** (desde 1.2.0). El navegador no descarga hechos para juzgar: pide el resultado aquí.
- `maturity` — los registros de madurez de cada control y sus instantáneas diarias (desde 1.4.0; apartado «Madurez»).

## Evaluación

Todo se lee **como el usuario que mira** (`asCurrentUser`): el indexador sigue aplicando sus permisos, y la memoria del servidor es por usuario y roles. La configuración activa se lee como en `configuration` (`asInternalUser`).

Cómo se calcula (`lib/evaluation/evaluation-service.ts`):

1. Contexto: usuario, configuración activa (se relee solo si cambia su sello: `updatedAt`, `_seq_no` y `_primary_term`), alcance (inventario de `wazuh-monitoring-*`, el mismo código que el navegador) y una **sonda** de una sola consulta sin documentos: hechos por control y máquina (número y el más reciente), hechos sin control, los tipos que op.acc.3 lee de otros controles, la presencia de cada máquina (su primer hecho) y el último latido de cada día de cada máquina.
2. **Fila a fila**: cada control en cada máquina que lo mide (su plano y su alcance declarado) es una fila, y se evalúa con los hechos que leería la consulta de esa fila sola: los que nombran el control en `data.ensfacil`, `data.ens`, `data.control_id` o `data.control`, los que no nombran ninguno, y (op.acc.3) los tipos que lee de otros controles. Con ellos van los sintéticos que dan lo que el motor leía de otros controles: presencia (op.mon.3) y latidos (op.acc.3) — ver `common/ens/core/control-partition.ts`. Se evalúa con el motor de `common/ens/core`, de una fila en una, y se sueltan los hechos.
   - **Un flujo por máquina.** En el indexador real cuesta cada llamada (0,16-0,34 s, tenga o no hechos), no los bytes. Por eso las filas de una máquina no se leen una a una: un flujo ordenado por `data.ensfacil` (y dentro, por `@timestamp` con desempate `id`, `manager.name`, `agent.id`, sin PIT ni `_id`, páginas de 5.000) trae los de varios controles, y cada control se evalúa en cuanto termina su tramo. Una máquina con muchos hechos se parte en grupos de controles de unos 20.000 (los baratos primero, según la sonda). Una vez por máquina se lee lo que el flujo no lleva —los hechos sin `data.ensfacil` o con un campo de control antiguo, repartidos en memoria con la misma regla que la consulta de cada fila—, sus latidos y, en una sola agregación, el último hecho de estado de cada control. Cada fila recibe sus hechos en el mismo orden que leyéndola sola (`mergeFactsInOrder`). op.acc.3, los controles sin filas y la vista de una máquina de un control de organización sin fila del manager se leen solos, como antes. El orden por `data.ensfacil` lleva `unmapped_type: keyword`: la plantilla de Wazuh mapea `data.*` de forma dinámica y un índice diario sin hechos de ENSFácil (un día sin recolectores, los anteriores a instalarlo) no tiene ese campo; sin él OpenSearch rechazaría la búsqueda entera. Si el indexador rechaza el flujo de una máquina por cualquier otro motivo (un 4xx), sus filas —y su serie— se leen una a una, con el orden de siempre.
   - **Los índices de la ventana.** La sonda (con el comodín `wazuh-alerts-*`) dice qué índices tienen hechos de la ventana; las demás lecturas los nombran (con los de cada día de la ventana si siguen el nombre diario de Wazuh) y `ignore_unavailable`. Sin lista fiable, el comodín.
   - **Hasta 4 lecturas a la vez y el motor de uno en uno**, cediendo el hilo entre página y página y entre fila y fila: el proceso del dashboard sigue atendiendo otras peticiones durante un cálculo. Lo que alguien espera pasa delante de lo que se hace en segundo plano. Como mucho `MAX_FACTS_PER_READ` (50.000, ~85 MB) hechos por fila: por encima, error claro.
   - **Poda exacta de los hechos de estado.** De un hecho de estado el motor solo usa la última observación (`keepLatestRunStateFacts`). Antes de leer se calcula su MISMO corte —con los latidos de la máquina y el último hecho de cada evidencia— para los instantes que se evalúan (ahora, para el resultado; ahora y el final de cada día, para la serie) y no se lee lo que queda bajo el corte en todos ellos (`computeStateFactCutoffsByCollector`, `prunableRanges`, `buildStateFactKeepClause`). Ante cualquier duda se lee todo: evidencia en otro campo, campos con varios valores, cubos que no caben en la agregación, demasiadas hojas. `tests/evaluation-queries.test.ts` comprueba que, a fecha de cada instante, el motor conserva lo mismo leyendo todo o lo podado. Las acciones y los hechos genéricos (`evidence_state`, `control_state`, `score_snapshot`) se leen enteros: el motor los juzga o los lista en la trazabilidad sobre toda la ventana.
   - **Primera carga por partes.** La lista (`summary`), la Vista general (`overview`) y el panel (`dashboard`) responden como mucho a los 1,5 s de empezar a leer (`FIRST_RESPONSE_MS`) con las filas que ya están y `meta.pending` = `{ rows, controls, total }`: cuántas filas faltan y de qué controles. Esos controles van en la lista marcados `pending` (sin estado); el panel no enseña cifras de conjunto hasta tenerlos todos, y la Vista general pinta «…» en sus filas de la matriz y deja para entonces las cifras por máquina y la cola de trabajo. El cálculo sigue detrás aunque el navegador se vaya (lo guardado le sirve al volver) y el navegador vuelve a pedir cada 2 s durante 2 minutos y después cada 15 s (con la pestaña a la vista). Las demás vistas esperan a tener sus filas y se cancelan si el navegador se va y nadie más las espera. Una fila que falla después de responder se dice, una vez, en la petición siguiente.
   - **La serie, después y detrás de todo.** Nunca se espera por ella. Cuando no queda nada de primer plano en marcha, de grupo en grupo (los baratos primero), se leen los hechos con la poda para ahora y el final de cada día y se evalúa cada día (del más reciente al más antiguo, cada uno en su turno del motor); los puntos se guardan en la fila según salen. Hasta tenerlos, las vistas que piden serie responden sin `timeline` y con `meta.seriesPending`; luego el panel (7 días) y la ficha (30) salen de esos puntos sin volver a leer. Los hechos nuevos son de hoy: cuando una fila se recalcula por ellos, su serie (entera o a medias) pasa a la versión nueva y se sigue llenando, y la cola de la serie trabaja siempre con la versión guardada en ese momento. La sonda cuenta además los hechos de los días pasados enteros de la ventana: solo si cambian (un hecho tardío fechado en un día pasado) la serie de esa fila se vuelve a calcular. Cada vista guarda sus días pasados hasta el día siguiente aunque alguna fila se esté refrescando; mientras una fila no tiene sus puntos, la vista sirve su última serie buena del día marcada «actualizándose» (solo el punto de hoy es de ahora). Con filas de la vista aún pendientes no hay serie (`seriesPending`): su punto de hoy saldría de una parte de los controles. La serie lleva el día y la zona de quien mira: al pasar la medianoche, o con otra zona, se vuelve a calcular detrás (una lectura por usuario y día). Una serie que falla se reintenta con espera creciente (30 s … 5 min).
3. La vista de conjunto de cada control se consolida con la consolidación del motor (`consolidateENSControlRows`: filas + máquinas declaradas fuera del alcance). Un control que ninguna máquina mide se evalúa, como el motor, sobre todos sus hechos. La vista de una máquina sale de sus filas sin volver a leer. El estado del panel se arma con `assembleENSComplianceState`. Todo da lo que da `getENSComplianceState` sobre todos los hechos a la vez (`tests/control-partition.test.ts`, `tests/evaluation-server*.test.ts`).
4. **Datos completos o nada**: cada búsqueda va con `allow_partial_search_results=false` y se comprueban `_shards.failed`, `timed_out` y `terminated_early`. Con cualquiera de ellos la petición responde **503** «Datos incompletos: N de M shards fallaron…; reintentar», no se evalúa ni se guarda nada.
5. **Memoria por fila** (usuario y roles, nunca compartida): vale mientras su huella (configuración, alcance, hechos de ese control en esa máquina, sus hechos sin control, su presencia y, para op.acc.3, su último latido) sea la misma y no pasen 60 minutos (para lo que cambia solo con el reloj). Si cambió, la ruta responde **al instante con lo guardado** (`meta.refreshing: true`, `meta.computedAt`) y lo recalcula detrás; una entrada de otra configuración no se enseña. Una fila guarda su resultado sin trazabilidad, las 500 primeras entradas de la trazabilidad comprimidas (deflate) y su serie. El tope de lo guardado sigue al alcance: que quepan 10 usuarios con todas sus filas (~60 KB cada una), entre 64 y 256 MB; al llenarse se va lo que lleva más tiempo sin usarse. En el laboratorio (86 filas por usuario) una fila ocupa de media 45 KB.
   - **Un refresco que falla no se calla.** Lo guardado se sigue enseñando y la respuesta lleva `meta.refreshError` = `{ message, at }`. El siguiente intento en segundo plano espera 30 s, 1, 2, 4 y luego 5 minutos; `retryRefresh=1` («Reintentar» en el navegador) lo intenta ya. **Un intento nuevo borra el error anterior**: mientras corre, la respuesta es lo guardado con `refreshing` y sin `refreshError`; si también falla, se anota con su hora.
6. **Cálculos compartidos**: una fila la calcula una sola vez quien la necesite a la vez (el panel y la lista abiertos juntos se unen al mismo cálculo); lo que sale de la memoria no espera.
7. La serie diaria de cada vista se arma con los puntos de sus filas (consolidados como el resultado de ahora) y los hechos por día, y se guarda hasta el día siguiente (por zona horaria).

### Memoria

Medido con los hechos del laboratorio (6 máquinas, 86 filas, unos 210.000 hechos en 30 días), montón tras GC: una carga en frío deja unos **15 MB** por usuario (las filas guardadas, 4,4 MB contados, más lo de aparte de cada máquina, que se guarda 5 minutos), y la serie unos 13 MB en total. Mientras se calcula, la carga entera cabe con unos 50 MB libres en el montón (probado con `--max-old-space-size` ajustado a 47 MB sobre lo que ya ocupaba el proceso). Lo que lo acota en un alcance mayor:

| Límite | Valor | Peor caso |
|---|---|---|
| Hechos de una fila en memoria (`MAX_FACTS_PER_READ`) | 50.000 | unos 85 MB por lectura |
| Lecturas a la vez | 4 | unos 340 MB de hechos a la vez |
| La serie | un grupo de filas de una máquina a la vez | los hechos de ese grupo |
| Filas guardadas | 10 usuarios × las filas del alcance × 60 KB, entre 64 y 256 MB | 256 MB |
| Lo de aparte de cada máquina (hechos sin control, latidos, último hecho de estado) | una entrada por máquina y ventana, 5 minutos | las ventanas de 5 minutos de refrescos de todos los usuarios |

En un despliegue mayor que el laboratorio conviene darle al dashboard más montón que el que Node asigna por defecto (guía 04, apartado 8.1).

### Errores

| Estado | Cuándo |
|---|---|
| 400 | `controlId` fuera del catálogo, `agentId` fuera del alcance, `timeZone` que no es IANA, `timelineDays` fuera de 0-90, página de trazabilidad fuera de sus límites. Con el motivo. |
| 401/403 | Sin sesión o sin permiso en el indexador. |
| 499 | Cancelada: el navegador se fue y nadie más esperaba. |
| 503 | Datos incompletos (shards fallidos, tiempo agotado en el indexador) o demasiados hechos para una sola lectura. Con el motivo. |

### `GET /api/ensfacil/evaluation`

Parámetros: `include` (`summary` | `overview` | `results` | `dashboard` | `control`), `agentId`, `controlId`, `timelineDays` (0-90), `timeZone` (IANA, la del navegador: decide qué es «un día» en la serie), `timelineControls` (`true`: los puntos de la serie llevan además el estado de cada control; solo lo pide la tendencia de la Vista general), `retryRefresh` (`1`: reintentar ya un refresco que falló). Están declarados en `routes/evaluation-query.ts`: la ruta valida con `unknowns: 'ignore'`, que QUITA lo no declarado, así que un parámetro nuevo de una pantalla va allí o no llega (`tests/evaluation-route-query.test.ts` pasa por el esquema las consultas reales de cada pantalla). `include=overview` no admite `controlId` (400).

Respuesta: `{ statusCode: 200, error: 0, data }`, con `data`:

| `include` | Para | Contenido |
|---|---|---|
| `summary` | Lista de controles | `meta`, resúmenes del estado (`controlSummary`, `requirementSummary`, `agentSummary`, `evidenceSummary`), `controls[]` = `{ controlId, status, score, evaluated, requirementsNotMet, requirementsNotEvidenced }`, `agents[]` = `{ agentId, agentName, summary, controls[] }` (`controls`: lo mismo para cada control EN LA FILA de esa máquina; los que no se miden en ella no aparecen) y, con `timelineDays`, `timeline` |
| `overview` | Vista general | lo de `summary` + `freshness` = `{ checkedAt, agents[]: { agentId, count, earliest, newest, lastHeartbeat }, cells[]: { controlId, agentId, count, newest } }` (de la sonda: ninguna lectura más; los nombres, en `meta.scope`) + `nonConformities[]` = las no conformidades de la vista de conjunto, solo lo que pinta la cola de trabajo: `controlId`, `id`, `requirementId`, `origin`, `cause`, `documental`, `evidenceIds`, `agentIds` y el titular (`title`, `titleEvidenceId`, `titleStatus`: la primera frase de la evidencia culpable, `common/ens/evaluation/motive-parser.ts`) |
| `dashboard` | Panel | lo anterior + `dashboard` (el modelo del panel ya construido, con `impactEvents` y `evolution`), `agents[].results` = `{ controlId, status, score }[]` y `timeline` |
| `results` | Evidencias, panorama de op.mon.2 | resúmenes + `results[]` (el `ENSComplianceResult` de cada control **sin** `traceability`), `agents` y `timeline` |
| `control` (con `controlId`) | Ficha del control, informes | `result` (el `ENSComplianceResult` con las 100 primeras entradas de `traceability`), `traceabilityTotal`, `traceabilityAvailable` (las que se pueden recorrer por páginas), `agents[]` = `{ agentId, agentName, status, score }` y `timeline` |

`meta`: `{ fingerprint, refreshing, pending, seriesPending, refreshError, computedAt, evaluatedAt, configurationUpdatedAt, level, window: { from, to }, agentId, controlId, facts: { count, newest }, scope[], inventory: { stale, newestTimestamp, agents }, stats }`. Con `refreshing` (lo guardado mientras se recalcula, filas o serie pendientes), `fingerprint` empieza por `refreshing:` (la sonda siguiente siempre la verá distinta). `pending` = `{ rows, controls, total }`: la primera carga a medias (solo `summary`, `overview` y `dashboard`; el `dashboard` lleva entonces también `controls[]`). `seriesPending`: la vista pidió serie y aún se está calculando (va sin `timeline`). `refreshError` = `{ message, at }`: el último refresco en segundo plano que falló; lo que se enseña es lo anterior a él. Los tipos están en `common/ens/evaluation/types.ts`.

Un punto de `timeline`: `{ date, label, isCurrent, events, score, status?, controls? }`; `controls` (solo sin `controlId` y con `timelineControls=true`) = `{ [controlId]: { status, score } }`, el estado de cada control ese día en la vista. `events` cuenta hechos (documentos) conocidos hasta ese día; el último punto es el resultado de arriba.

### `GET /api/ensfacil/evaluation/probe`

Mismos `agentId`, `controlId` y `timeZone`. Unos cientos de bytes: `{ fingerprint, checkedAt, configurationUpdatedAt, facts: { count, newest } }`. Si `fingerprint` es la de la última evaluación, no ha cambiado nada (el navegador lo comprueba cada 5 minutos con la pestaña a la vista; si lo que tiene se estaba recalculando, vuelve a pedir a los 10 segundos, y con la primera carga o la serie a medias, cada 2; `public/evaluation/refresh-policy.ts`).

### `GET /api/ensfacil/evaluation/traceability`

`controlId` (obligatorio), `agentId`, `from` (≤ 500), `size` (1-500): una página de la trazabilidad del control, de las 500 primeras entradas que se guardan (`ENS_EVALUATION_LIMITS`, `common/ens/evaluation/limits.ts`); `{ total, available, from, items }`.

## Medir la evaluación contra un indexador

`scripts/measure-evaluation.ts` ejecuta el servicio de evaluación (sin la capa HTTP) contra un indexador real con la secuencia de las pantallas y escribe cada línea en cuanto la mide (sin búfer, aunque la salida sea una tubería):

- la lista de controles en frío: la primera respuesta (con lo pendiente) y cuándo están todas las filas, con las llamadas, los MB leídos, el tiempo de red (la suma de todas las llamadas) y el de `JSON.parse`;
- el desglose de esa carga por control: filas, hechos, esperando turno, esperando al indexador, normalizando y el motor (y, para la serie en segundo plano, filas, hechos, indexador, normalizar y motor); «(por máquina)» es lo que se lee una vez por máquina;
- el panel con 7 días (primero con la serie pendiente, después con ella), la ficha de un control con 30 días, la de op.mon.3 en una máquina, todos los resultados y, en caliente, otra vez;
- lo leído por control y clase (estado, acciones, genéricos, latidos) frente a lo que hay en la ventana, y la memoria del proceso.

Es **de solo lecturas por construcción**: el cliente que recibe el servicio solo puede hacer `POST /<índice o lista de índices>/_search` (con una lista cerrada de parámetros, sin `scroll` ni PIT), `HEAD /<índice>` y `GET /_plugins/_security/authinfo`; cualquier otra petición (crear el índice de configuración si falta, `_doc`, `_bulk`…) se rechaza antes de enviarse y la medida falla. No escribe ficheros. Al final espera, como mucho `--wait` segundos (300), a que termine lo que el servicio hace en segundo plano (series, refrescos) y sale con `process.exit`; un vigilante corta la medida entera a los `--timeout` segundos (900).

Desde la raíz del plugin, con Node 18 o posterior:

```bash
npx --yes tsx server/scripts/measure-evaluation.ts \
  --url https://127.0.0.1:9200 \
  --ca /ruta/root-ca.pem --cert /ruta/admin.pem --key /ruta/admin-key.pem \
  --tz Europe/Madrid --control op.acc.1 --agent 000
```

Resultado esperado: una línea por petición (`summary (first response)`, `summary complete`, `dashboard 7 days`, …) con `ms`, `calls`, `read`, `rows computed` y la serie; el desglose por control; «per control: read / in the window» y una última línea con la memoria y los totales.

Las mismas opciones por entorno: `ENSFACIL_INDEXER_URL`, `ENSFACIL_INDEXER_CA`, `ENSFACIL_INDEXER_CERT`, `ENSFACIL_INDEXER_KEY`, `ENSFACIL_TZ`, `ENSFACIL_CONTROL`, `ENSFACIL_AGENT`, `ENSFACIL_WAIT`, `ENSFACIL_TIMEOUT`. `--insecure` (o `ENSFACIL_INDEXER_INSECURE=1`) no comprueba el certificado del indexador. En un servidor sin Node, con el contenedor oficial de Node y el plugin y los certificados montados de solo lectura:

```bash
docker run --rm --network host -v "$PWD":/plugin:ro -v /ruta/certs:/certs:ro -w /plugin node:18 \
  npx --yes tsx server/scripts/measure-evaluation.ts --ca /certs/root-ca.pem --cert /certs/admin.pem --key /certs/admin-key.pem
```

## Madurez

La madurez CMM de cada control (`lib/maturity/maturity-service.ts`, motor en `common/ens/maturity/`) viaja con la evaluación: `include=control` lleva `maturity` (el `ENSControlMaturity` del control: niveles, puertas con su motivo y lo registrado) y `maturityVersion` (la versión del documento de madurez, `null` sin ninguno); `summary`, `overview` y `dashboard` llevan `maturity` = `{ controls[], distribution }` (la distribución solo con todos los controles de la organización calculados). Es siempre la de la organización: una vista de máquina la toma de la memoria de la última vista de conjunto y, si cambió, la recalcula detrás (sin pase extra en la petición). Si no se puede calcular, la respuesta lleva `maturityError` y la evaluación no falla. `results` no la lleva.

**Nunca retrasa la respuesta.** Lo que lee aparte de la evaluación —los días con hechos de cada control en cada máquina en sus propios 30 días (con el primer hecho de cada máquina y el hecho más antiguo que queda), en grupos por debajo de 20.000 cubos, y las instantáneas de 180 días— se lee como el usuario que mira, detrás, con el límite de 4 lecturas a la vez de la evaluación (detrás de lo que alguien espera) y se guarda 5 minutos. Mientras no está, la respuesta va sin `maturity` y con `meta.maturityPending` (y la huella `refreshing:`): el navegador vuelve a pedir cada 2 s, como con la serie. Los días los formatea el indexador (`format: yyyy-MM-dd`).

**Documento propio.** Lo registrado va en `wazuh-ens-configuration/_doc/maturity` (`documentType: MATURITY_RECORDS`, los registros en el campo no indexado `configuration`), con su versión y su sello en la huella de la vista: registrar no toca la configuración ni recalcula filas, y las pantallas abiertas se actualizan. Cada registro añade una entrada `MATURITY_HISTORY`. Los objetivos (`global.maturityTargets`) siguen en la configuración.

**Instantáneas.** Una por control y día en `wazuh-ens-snapshots`, id `<control>|<AAAA-MM-DD>` en la zona de Configuración > General: el mismo día se sustituye y no se reescribe si no cambia. Solo las escribe (`asInternalUser`) la tarea diaria (`lib/maturity/daily-snapshot-job.ts`: usuario interno, cada día a las 02:30 en la zona configurada —Europe/Madrid por defecto— y, 10 minutos tras arrancar, solo si el día no tiene instantánea; una evaluación completa propia, con su memoria aparte y sin serie diaria, y las entradas leídas en el momento; si el indexador la rechaza, un aviso y se detiene). El índice (y su plantilla) se comprueba una vez por proceso. Cada ejecución borra las de más de 1095 días; un borrado fallido se reintenta a la hora.

**Vistas de máquina.** Muestran la madurez de la organización de memoria; si está desfasada (un registro, hechos nuevos) o a medias, la respuesta la marca `maturityPending` (con la anterior a la vista y sin `maturityVersion`) y la recalcula detrás. Tras 3 intentos fallidos (a los 5 y 30 s), `maturityError` «No se ha podido calcular la madurez.»; `retryRefresh=1` vuelve a empezar. La regla de la justificación usa entradas de 15 minutos como mucho y lee las instantáneas con el usuario interno.

### `PUT /api/ensfacil/maturity`

Cuerpo: `{ controlId, kind, entry, expectedVersion }`, con `kind` = `attestation` | `review` | `assessment` | `indicators` | `feedback` y `expectedVersion` obligatoria (la versión del documento de madurez leída; `null` si no había: solo crea). Rol `ensfacil_admin` o `all_access`. Valida la entrada (`validateMaturityEntry`, la misma regla que la pantalla); en una valoración calcula el nivel acreditado y sus puertas de ese momento, los guarda con ella y exige justificación si el valorado lo supera (o si no se puede calcular). Añade la entrada al final de su lista con `recordedAt` y `recordedBy`, escribe solo sobre la versión leída y añade la entrada de historial. Respuesta: `{ record, version, updatedAt, warning? }`.

| Estado | Cuándo |
|---|---|
| 400 | Control fuera del catálogo, registro desconocido, sin `expectedVersion`, entrada no válida o valoración por encima de lo acreditado sin justificación. Con el motivo |
| 401/403 | Sin sesión o sin el rol |
| 409 | El documento de madurez cambió desde que se leyó («La madurez ha cambiado desde que la abriste») |

El guardado de la configuración (`PUT /api/ensfacil/configuration`) rechaza (400) un `global.maturityTargets` que no sea un nivel de 0 a 5 por categoría.

### `GET /api/ensfacil/maturity/snapshots`

`from`, `to` (AAAA-MM-DD, como mucho 400 días) y `controlId` opcional. Se lee como el usuario: los permisos de `wazuh-ens-snapshots` deciden quién ve la serie (403 sin ellos). `{ from, to, controlId, snapshots[] }`, de la más antigua a la más reciente.
