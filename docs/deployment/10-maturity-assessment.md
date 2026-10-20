# Valoración de la madurez
[English](10-maturity-assessment.en.md)

Madurez CMM (L0 a L5) de cada control en ENSFácil 1.4.0: nivel acreditado por la evidencia, puertas de cada nivel, registros documentales, valoración por una persona, historial, instantáneas diarias e informe.

## 1. Objetivo

Valorar cada control como proceso, según el apartado 6 del Anexo II del RD 311/2022, junto al semáforo y al porcentaje y sin mezclarse con ellos. ENSFácil calcula el nivel que acreditan las evidencias; una persona lo confirma o lo ajusta con su justificación; todo cambio queda en un historial que no se sobrescribe.

## 2. Requisitos previos

| Requisito | Comprobación |
|---|---|
| Plugin ENSFácil 1.4.0 o posterior desplegado | El detalle de un control muestra «Madurez: …» junto al semáforo |
| Usuario con el rol `ensfacil_admin` o `all_access` para registrar | Un registro de madurez no devuelve el error 403 ([instalación desde cero, apartado 13.5](01-installation-from-scratch.md#135-crear-el-rol-ensfacil_admin)) |
| Lectura del índice `wazuh-ens-snapshots` para ver la tendencia y las instantáneas | Apartado 10.2 |
| Copia de los documentos `active` y `maturity` antes de cambios desde el servidor | [Instalación desde cero, apartado 14.2](01-installation-from-scratch.md#142-copiar-el-documento-antes-de-modificarlo) |

## 3. Madurez y semáforo

| Indicador | Pregunta a la que responde | Quién lo fija |
|---|---|---|
| Semáforo y porcentaje | ¿Hay algo que atender hoy? (operativo) | El motor, con las evidencias de la ventana de evaluación |
| Madurez | ¿Existe un proceso y en qué grado está institucionalizado? (normativo) | El nivel acreditado, ENSFácil; el nivel valorado, una persona |

Los dos se informan a la vez. Verde con L2 significa que el control funciona sin procedimiento escrito; ámbar con L4, un proceso sólido con una desviación detectada que se está tratando.

La madurez es de la organización, no de una máquina: se calcula sobre el resultado consolidado de todas las máquinas del alcance y es la misma con o sin máquina seleccionada.

## 4. Nivel acreditado

El nivel acreditado es el más alto cuyas puertas, y las de todos los niveles inferiores, se cumplen. Cada puerta muestra en el panel «Madurez» si se cumple y el motivo.

| Nivel | Puerta | Origen | Se cumple cuando |
|---|---|---|---|
| L1 | Hechos del control en el periodo | Automático | Hay algún hecho del control en la ventana de evaluación |
| L2 | Hechos recurrentes sin huecos | Automático | Cada máquina que mide el control tiene hechos en cada uno de los últimos 7 días completos (periodicidad diaria), salvo los anteriores a su primer hecho |
| L3 | Parámetros obligatorios completos | Automático | El control está en la configuración activa y no le falta ni tiene inválido ningún parámetro obligatorio |
| L3 | Procedimiento documentado y difundido | Documental | El procedimiento registrado (apartado 6) está completo, tiene enlace utilizable, está aprobado y sigue vigente |
| L3 | Evidencias continuas y sin lagunas | Automático | Cada máquina tiene hechos todos los días completos del periodo desde su primer hecho, y en la evaluación actual todos los requisitos aplicables están evidenciados |
| L4 | Umbral definido y vigilado | Declarado y medido | Hay un umbral de cumplimiento declarado. Si la última instantánea está por debajo, hay una revisión (apartado 7.1) fechada desde la primera instantánea de esa racha bajo el umbral, con acciones o con el resultado «Desviación en tratamiento» |
| L4 | Revisiones periódicas registradas | Declarado y medido | La última revisión registrada no tiene más antigüedad que la periodicidad declarada (365 días por defecto) |
| L5 | Serie histórica con tendencia de mejora | Automático | En los últimos 180 días hay al menos 90 días y 10 instantáneas (apartado 10), y la media de la segunda mitad supera a la de la primera, o la puntuación se mantiene en el 100 % |
| L5 | Realimentación cerrada con cambio de procedimiento | Documental y declarado | Una lección o deficiencia registrada (apartado 7.3) está cerrada con una versión del procedimiento aprobada después de su apertura |

Reglas:

- Periodo propio: L1 a L3 leen los últimos 30 días de hechos de toda la organización, sea cual sea la ventana de evaluación de la pantalla. Si solo hay hechos de menos días (retención del índice o instalación reciente), se leen los que hay y el motivo lo dice («solo hay hechos desde el …»). Si `wazuh-alerts-*` conserva menos de 30 días, L3 nunca cubre el periodo completo.
- Una máquina que entra en el alcance durante el periodo cuenta desde su primer hecho: el motivo lo indica («… desde el …»).
- El rojo y el gris no fijan L0. Solo un gris por falta de recogida (sin datos del recolector o recolector parado) deja el control en L1. Un gris por configuración o por catálogo puede acreditar L2 si los hechos son recurrentes, como prevé la tabla del auditor; L3 no se cumple por los parámetros o los requisitos sin evidencia.
- Una máquina que deja de enviar datos impide L2 aunque las demás informen: el motivo nombra la máquina y los días sin hechos.
- Una evidencia que no llega mientras el recolector informa a diario no impide L2: impide L3 (requisitos sin evidencia).
- Un control en borrador (`DRAFT`) muestra «Sin medición todavía» y no tiene nivel acreditado. Se puede registrar su nivel valorado.
- Un control que no aplica en el nivel ENS (todos sus requisitos fuera del nivel) muestra «no aplica en este nivel» y queda fuera de la distribución.
- La primera vez que se abre una vista, la madurez aparece unos segundos después del resultado («Madurez: calculando…»), como la serie diaria: su lectura nunca retrasa la evaluación.

## 5. Objetivo por categoría

El objetivo de cada control es el de la categoría con la que se aplica: el nivel ENS o, en los controles que se aplican por dimensión, el más alto de sus dimensiones. Por defecto: L2 en BÁSICA, L3 en MEDIA y L4 en ALTA, a falta de confirmación del auditor.

1. Abrir ENSFácil > Configuración > General.
2. En «Objetivo de madurez por categoría», elegir el nivel de cada categoría o «Por defecto».
3. Pulsar «Guardar configuración global».

   Resultado esperado: el detalle de cada control muestra «objetivo L…» con el nuevo valor. El documento guarda `global.maturityTargets` solo con las categorías declaradas; «Por defecto» quita la clave, nunca la deja en `null`.

Una valoración (apartado 8) puede fijar otro objetivo para un control concreto.

## 6. Registrar el procedimiento

El procedimiento es el del control como proceso, uno por control y para toda la organización. No sustituye a las atestaciones `P-ATT` de cada requisito.

1. Abrir el detalle del control y, en el panel «Madurez», pulsar «Registrar el procedimiento».
2. Rellenar los campos:

   | Campo | Contenido |
   |---|---|
   | Referencia | Código o título del procedimiento |
   | Versión | Versión aprobada |
   | Enlace | `http(s)://`, `file://` o ruta de red. No vale el enlace de ejemplo |
   | Fecha de aprobación | AAAA-MM-DD, no posterior a hoy |
   | Vigente hasta | AAAA-MM-DD, no anterior a la aprobación. Vencida, la puerta no se cumple |
   | Fecha de difusión | AAAA-MM-DD, no anterior a la aprobación |
   | Difundido a | Personas, grupos o listas que lo recibieron |
   | Responsable | Persona responsable. El campo sugiere las personas de los datos de la organización |

3. Pulsar «Guardar».

   Resultado esperado: la puerta «Procedimiento documentado y difundido» se cumple con la referencia, la versión y la vigencia en el motivo. Una versión nueva se registra igual; la anterior queda en el historial y cuenta para la realimentación (apartado 7.3).

## 7. Revisiones, umbral y realimentación

### 7.1 Registrar una revisión

1. En el panel «Madurez», pulsar «Registrar una revisión».
2. Indicar la fecha, el revisor, el resultado («Conforme», «Con desviaciones», «No conforme» o «Desviación en tratamiento») y las acciones. Las acciones son obligatorias con desviaciones o no conforme. Una revisión con acciones o con «Desviación en tratamiento» trata una desviación del umbral (L4).
3. Pulsar «Guardar».

   Resultado esperado: «Última revisión» muestra la nueva y la puerta «Revisiones periódicas registradas» se cumple si está dentro de la periodicidad.

### 7.2 Declarar el umbral y la periodicidad

1. Pulsar «Umbral y periodicidad de revisión».
2. Indicar el umbral de cumplimiento (0 a 100 %) y la periodicidad de revisión (1 a 1095 días).
3. Pulsar «Guardar».

   Resultado esperado: la puerta «Umbral definido y vigilado» se cumple y su motivo compara la puntuación actual con el umbral.

### 7.3 Registrar realimentación

Una lección aprendida (op.exp.9.3), un incidente (op.exp.7), una deficiencia de una prueba (op.cont.3), un hallazgo de auditoría o de revisión que afecta al control.

1. Pulsar «Registrar realimentación».
2. Indicar la referencia, el origen, la descripción y la fecha de apertura.
3. Para cerrarla, registrar de nuevo la misma referencia con la fecha de cierre y la versión del procedimiento que la cierra.
4. Pulsar «Guardar».

   Resultado esperado: «Realimentación» muestra la referencia cerrada. La puerta de L5 se cumple si esa versión del procedimiento está registrada (apartado 6) con una aprobación posterior a la apertura.

## 8. Valorar

1. En el panel «Madurez», pulsar «Valorar». El formulario indica el nivel que acredita la evidencia.
2. Elegir el nivel valorado y, si procede, el objetivo del control. Indicar el revisor y la fecha.
3. Escribir la justificación. Es obligatoria si el nivel valorado supera al acreditado; el servidor calcula el acreditado en el momento de guardar y rechaza la valoración sin justificación (400).
4. Pulsar «Guardar».

   Resultado esperado: el encabezado del detalle muestra «Madurez: L… (acreditado L…, objetivo L…)». Por encima de lo acreditado, el panel y el informe lo marcan con la justificación.

La valoración guarda el nivel acreditado y sus puertas de ese momento. El panel y el informe muestran siempre quién valoró y cuándo; la marca «por encima de lo acreditado al registrarlo» se calcula con ese nivel guardado. Si después la evidencia acredita menos que entonces y menos que lo valorado, se muestra «La evidencia acreditaba L… al valorarlo (fecha); hoy acredita L…: revisar la valoración».

## 9. Historial

Lo que se registra va a su propio documento, `maturity`, del índice `wazuh-ens-configuration` (`documentType: MATURITY_RECORDS`), con su propia versión: registrar madurez no cambia la configuración y nadie que la esté editando recibe un 409 por ello.

- Por control, listas de solo añadir: procedimientos, revisiones, valoraciones, umbrales y realimentación. Cada entrada lleva `recordedAt` y `recordedBy`, que fija el servidor. Nada se sobrescribe ni se borra.
- Cada registro añade además una entrada de historial (`documentType: MATURITY_HISTORY`) con el control, el tipo, la entrada y una línea («Madurez de op.acc.1: nivel valorado L3.»).
- Cada registro envía la versión del documento que mostraba la pantalla (`expectedVersion`, obligatoria; `null` si no había ninguno). Si cambió desde entonces, se rechaza (409) con «La madurez ha cambiado desde que la abriste». Recargar la página y repetirlo. Tras un registro, las pantallas abiertas se actualizan solas.

Consultar la madurez registrada y su historial desde el servidor (variable `IDX` de la [instalación desde cero, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens)):

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  "$IDX/wazuh-ens-configuration/_doc/maturity?filter_path=found,_seq_no,_source.updatedAt&pretty"
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  -H 'Content-Type: application/json' "$IDX/wazuh-ens-configuration/_search?pretty" \
  -d '{"size":50,"query":{"term":{"documentType":"MATURITY_HISTORY"}},"sort":[{"createdAt":"desc"}]}'
```

Resultado esperado: `"found" : true` con su `_seq_no` (o `false` sin nada registrado) y las últimas entradas de historial, de la más reciente a la más antigua.

Copia del documento antes de cambios desde el servidor, junto a la del documento `active`:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  "$IDX/wazuh-ens-configuration/_doc/maturity" | sudo tee "/opt/ensfacil/artifacts/maturity-$(date +%Y%m%d-%H%M%S).json" >/dev/null
```

## 10. Instantáneas diarias

El índice `wazuh-ens-snapshots` guarda una instantánea por control y día: estado, puntuación, cobertura, requisitos aplicables y medidos, nivel ENS aplicable, nivel acreditado, nivel valorado y objetivo. La serie alimenta la tendencia de L5, la desviación de L4 y el informe anual.

### 10.1 Quién la escribe

- **La tarea diaria del servidor**, con el usuario interno del dashboard: 10 minutos después de arrancar y después cada hora comprueba si el día ya tiene instantánea; si no, hace una evaluación completa de toda la organización (propia, sin tocar la memoria de los usuarios), espera a que termine y escribe el día. En Wazuh, el usuario interno tiene el rol de serie `manage_wazuh_index` (lectura, escritura, borrado y gestión en `wazuh-*`), que basta para crear el índice, escribir y purgar. Si el indexador rechaza una llamada, el log del dashboard lo avisa una vez y la tarea se detiene.
- **Las vistas de un administrador** (`ensfacil_admin` o `all_access`) de toda la organización (Vista general, panel, lista de controles o detalle de un control), cuando el resultado está completo y al día.
- El identificador es `<control>|<AAAA-MM-DD>`, con el día en la zona horaria de Configuración > General: repetir el mismo día sustituye el documento del día, nunca lo duplica.
- Retención: 1095 días (tres años). Las más antiguas se borran con la primera escritura de cada día; si el borrado falla, se reintenta con la siguiente escritura.

### 10.2 Quién la lee

La tendencia de L5, la desviación de L4 y la ruta de lectura leen el índice **como el usuario que mira**: los permisos del índice deciden quién ve la serie de la organización. Necesitan `read` sobre `wazuh-ens-snapshots`: lo dan los roles de serie `readall` y `all_access`, o un rol propio con `read` sobre `wazuh-*` o sobre ese índice. Sin él, la puerta de tendencia dice «No se pudieron leer las instantáneas: sin permiso de lectura de wazuh-ens-snapshots» y la ruta responde 403.

Consultar las instantáneas de un control:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  -H 'Content-Type: application/json' "$IDX/wazuh-ens-snapshots/_search?pretty" \
  -d '{"size":400,"query":{"term":{"controlId":"op.acc.1"}},"sort":[{"date":"asc"}]}'
```

Resultado esperado: un documento por día con `date`, `status`, `score`, `accredited`, `assessed`, `target` y `recordedBy` («ENSFácil (tarea diaria)» o el administrador).

Desde el dashboard, con sesión: `GET /api/ensfacil/maturity/snapshots?from=AAAA-MM-DD&to=AAAA-MM-DD[&controlId=…]`, como mucho 400 días por petición.

## 11. Informe

El informe de cada control, en pantalla y en PDF, lleva tras el resultado el bloque «Madurez del proceso (CMM)»: el nivel valorado, el acreditado y el objetivo; quién valoró, cuándo y con qué justificación; la marca si se valoró por encima de lo acreditado al registrarlo, o el aviso si la evidencia acredita hoy menos; las puertas con su motivo, el procedimiento, la última revisión, el umbral, la realimentación y la nota metodológica (semáforo operativo, madurez normativa). El bloque es el mismo para todos los controles del catálogo, también los que se añadan.

La Vista general muestra bajo cada control su nivel («L2 acreditado · objetivo L3» o «L3 valorado · objetivo L3») y la tabla «Madurez de la organización»; el panel muestra la misma tabla.

## 12. Compatibilidad y vuelta atrás

- Un plugin 1.3.0 no lee el documento `maturity`, sus entradas de historial ni `global.maturityTargets`, y su guardado no los toca: al volver a la 1.4.0 siguen ahí.
- El índice `wazuh-ens-snapshots` no lo lee ninguna versión anterior. Para retirar la madurez por completo:

  ```bash
  sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
    -X DELETE "$IDX/wazuh-ens-snapshots"
  sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
    -X DELETE "$IDX/wazuh-ens-configuration/_doc/maturity"
  ```

  Resultado esperado: `{"acknowledged":true}` y `"result" : "deleted"`. La tendencia de L5 vuelve a empezar desde cero; las entradas `MATURITY_HISTORY` quedan como registro.
