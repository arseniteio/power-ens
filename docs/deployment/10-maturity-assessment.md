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
| Documento `active` creado | [Instalación desde cero, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens). Sin él, el registro devuelve 409 «Todavía no hay configuración ENS guardada» |
| Copia del documento `active` antes de cambios desde el servidor | [Instalación desde cero, apartado 14.2](01-installation-from-scratch.md#142-copiar-el-documento-antes-de-modificarlo) |

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
| L2 | Hechos recurrentes sin huecos | Automático | Cada máquina que mide el control tiene hechos en cada uno de los últimos 7 días completos (periodicidad diaria) |
| L3 | Parámetros obligatorios completos | Automático | El control está en la configuración activa y no le falta ni tiene inválido ningún parámetro obligatorio |
| L3 | Procedimiento documentado y difundido | Documental | El procedimiento registrado (apartado 6) está completo, tiene enlace utilizable, está aprobado y sigue vigente |
| L3 | Evidencias continuas y sin lagunas | Automático | Cada máquina tiene hechos todos los días completos de la ventana y todos los requisitos aplicables están evidenciados |
| L4 | Umbral definido y vigilado | Declarado y medido | Hay un umbral de cumplimiento declarado; el motivo dice si la puntuación actual está dentro o en desviación |
| L4 | Revisiones periódicas registradas | Declarado y medido | La última revisión registrada no tiene más antigüedad que la periodicidad declarada (365 días por defecto) |
| L5 | Serie histórica con tendencia de mejora | Automático | En los últimos 180 días hay al menos 90 días y 10 instantáneas (apartado 10), y la media de la segunda mitad supera a la de la primera, o la puntuación se mantiene en el 100 % |
| L5 | Realimentación cerrada con cambio de procedimiento | Documental y declarado | Una lección o deficiencia registrada (apartado 7.3) está cerrada con una versión del procedimiento aprobada después de su apertura |

Reglas:

- El rojo y el gris no fijan L0. Un control gris (no se pudo medir) no acredita L2 ni superior desde la evidencia. Una máquina que deja de enviar datos impide L2 aunque las demás informen: el motivo nombra la máquina y los días sin hechos.
- Una evidencia que no llega mientras el recolector informa a diario no impide L2: impide L3 (requisitos sin evidencia).
- Un control en borrador (`DRAFT`) muestra «Sin medición todavía» y no tiene nivel acreditado. Se puede registrar su nivel valorado.
- Un control que no aplica en el nivel ENS (todos sus requisitos fuera del nivel) muestra «no aplica en este nivel» y queda fuera de la distribución.
- La ventana de evaluación es la de Configuración > General. Con «Últimas 24 horas» no hay días completos y no se acredita L2 ni superior.

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
2. Indicar la fecha, el revisor, el resultado («Conforme», «Con desviaciones» o «No conforme») y las acciones. Las acciones son obligatorias si la revisión no es conforme.
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

La valoración guarda el nivel acreditado de ese momento. Si después cambia lo acreditado, la marca se recalcula con el nivel actual.

## 9. Historial

Lo que se registra va a `configuration.maturity` del documento `active` de `wazuh-ens-configuration`, por control y en listas de solo añadir: procedimientos, revisiones, valoraciones, umbrales y realimentación. Cada entrada lleva `recordedAt` y `recordedBy`, que fija el servidor.

- Nada se sobrescribe ni se borra: la entrada vigente es la última.
- Cada registro deja la versión anterior del documento en el historial de la configuración y una línea en `auditTrail` («Madurez de op.acc.1: nivel valorado L3.»).
- El guardado de Configuración conserva siempre la madurez guardada, aunque el navegador la envíe distinta o no la envíe.
- Si la configuración cambió desde que se abrió la página, el registro se rechaza (409) con «La configuración ha cambiado desde que la abriste». Recargar la página y repetirlo.

Consultar la madurez registrada desde el servidor (variable `IDX` de la [instalación desde cero, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens)):

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  "$IDX/wazuh-ens-configuration/_doc/active?filter_path=_source.configuration.maturity&pretty"
```

Resultado esperado: un objeto por control con las listas `attestations`, `reviews`, `assessments`, `indicators` y `feedback`, de la entrada más antigua a la más reciente. Sin nada registrado, `{}`.

## 10. Instantáneas diarias

El índice `wazuh-ens-snapshots` guarda una instantánea por control y día: estado, puntuación, cobertura, requisitos aplicables y medidos, nivel ENS aplicable, nivel acreditado, nivel valorado y objetivo. La serie alimenta la tendencia de L5 y el informe anual.

- La escribe la evaluación del servidor cuando un usuario con el rol `ensfacil_admin` o `all_access` abre una vista de toda la organización (Vista general, panel, lista de controles o detalle de un control) y el resultado está completo y al día. Una vista recortada por los permisos de otro usuario no fija la serie de la organización.
- El identificador es `<control>|<AAAA-MM-DD>`, con el día en la zona horaria de Configuración > General: repetir la evaluación el mismo día sustituye el documento del día, nunca lo duplica. Un día sin ninguna vista de un administrador queda sin instantánea.
- Retención: 1095 días (tres años). Las más antiguas se borran con la primera escritura de cada día.

Consultar las instantáneas de un control:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  -H 'Content-Type: application/json' "$IDX/wazuh-ens-snapshots/_search?pretty" \
  -d '{"size":400,"query":{"term":{"controlId":"op.acc.1"}},"sort":[{"date":"asc"}]}'
```

Resultado esperado: un documento por día con `date`, `status`, `score`, `accredited`, `assessed` y `target`.

Desde el dashboard, con sesión y el rol de administración: `GET /api/ensfacil/maturity/snapshots?from=AAAA-MM-DD&to=AAAA-MM-DD[&controlId=…]`, como mucho 400 días por petición.

## 11. Informe

El informe de cada control, en pantalla y en PDF, lleva tras el resultado el bloque «Madurez del proceso (CMM)»: el nivel valorado, el acreditado y el objetivo, la marca y la justificación si se valoró por encima de lo acreditado, las puertas con su motivo, el procedimiento, la última revisión, el umbral, la realimentación y la nota metodológica (semáforo operativo, madurez normativa). El bloque es el mismo para todos los controles del catálogo, también los que se añadan.

La Vista general muestra bajo cada control su nivel («L2 acr. · obj. L3»: acreditado, sin valorar) y la tabla «Madurez de la organización»; el panel muestra la misma tabla.

## 12. Compatibilidad y vuelta atrás

- Un plugin 1.3.0 carga un documento con `maturity` y `global.maturityTargets`: no los lee. Al volver a la 1.4.0, la madurez registrada sigue en el documento o, si un guardado de la 1.3.0 la quitó, en el historial de la configuración (restaurar con la [guía de diagnóstico y rollback, apartado 7](04-troubleshooting-and-rollback.md#7-restaurar-la-configuración-ens)).
- El índice `wazuh-ens-snapshots` no lo lee ninguna versión anterior. Para retirarlo:

  ```bash
  sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
    -X DELETE "$IDX/wazuh-ens-snapshots"
  ```

  Resultado esperado: `{"acknowledged":true}`. La tendencia de L5 vuelve a empezar desde cero.
