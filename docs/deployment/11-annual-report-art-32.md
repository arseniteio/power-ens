# Informe anual del artículo 32
[English](11-annual-report-art-32.en.md)

Conjunto de datos del informe anual del artículo 32 del RD 311/2022 en ENSFácil 1.4.0: qué contiene cada campo, de dónde sale, qué se declara a mano, cómo se congela al cierre y cómo se exporta.

## 1. Objetivo

op.mon.2.1 remite al informe anual del artículo 32, que las administraciones entregan al CCN (campaña INES). ENSFácil genera sus datos sin montarlos a mano: por cada medida del Anexo II, su aplicabilidad, nivel, implantación, cobertura y madurez; la categorización; los incidentes; los recursos y la fiabilidad de la medición. Cada cifra lleva su origen y su traza.

Los campos exactos del cuestionario INES vigente no están confirmados. El conjunto no imita ese formulario: es un conjunto estable con identificadores de campo documentados (apartado 9), que se mapean al cuestionario una sola vez cuando se disponga de él. Un identificador no cambia de significado; un dato nuevo es un identificador nuevo.

## 2. Requisitos previos

| Requisito | Comprobación |
|---|---|
| Plugin ENSFácil 1.4.0 o posterior | El detalle de op.mon.2 muestra el panel «Informe anual (art. 32)» |
| op.mon.2 configurado: P-01 (Declaración de Aplicabilidad) y P-02 (periodicidad y `cierre_anual`) | Configuración > op.mon.2 |
| Runbook de op.mon.2 en el manager, con el registro de ciclos y el registro de incidentes de op.exp.7 | [Runbooks y registros](05-runbooks-and-registers.md) |
| Rol `ensfacil_admin` o `all_access` para declarar, congelar y regenerar | Una declaración no devuelve el error 403 |
| Lectura del índice `wazuh-ens-snapshots` para ver los informes congelados | Apartado 6.4 |

## 3. Dónde se ve

| Pantalla | Contenido |
|---|---|
| Controles > op.mon.2 > «Informe anual (art. 32)» | Periodo, estado (en curso, cerrado sin congelar o congelado), resumen, «Descargar JSON», «Descargar CSV», «Congelar» o «Regenerar» y «Recursos TIC totales» |
| Controles > op.mon.2 > «Medidas sin motor» | Las 50 medidas del Anexo II que ENSFácil no mide, con su entrada declarada y el botón «Declarar» |
| Informes > op.mon.2 | El mismo panel; el campo 8 del PDF («Datos para el informe anual del artículo 32») es el resumen del mismo conjunto |

El informe es de la organización: es el mismo con o sin máquina seleccionada.

## 4. El periodo

- El periodo N termina el día de cierre de P-02 (`cierre_anual`, MM-DD) del año N y empieza el día siguiente al cierre del año anterior. Sin `cierre_anual`, el cierre es el 31 de diciembre. Un cierre `02-29` cae el 28 de febrero en los años no bisiestos.
- Los límites de cada día son los de la zona horaria de Configuración > General.
- El identificador del periodo es el año de su cierre: con cierre `03-31`, el periodo `2027` va del 2026-04-01 al 2027-03-31.
- Un periodo en curso muestra las cifras de hoy. Un periodo cerrado y sin congelar también muestra las de hoy, y el panel lo advierte. Solo un periodo congelado muestra las cifras de su cierre.

## 5. Qué se declara a mano

| Dato | Dónde se declara | Campos del informe |
|---|---|---|
| Medidas aplicables | op.mon.2 P-01 (Declaración de Aplicabilidad) | `measure.soa`, `measure.applies` |
| Entrada de cada medida sin motor: aplica, madurez valorada y objetivo, referencia documental, enlace, responsable, fecha y, si no aplica, justificación | «Medidas sin motor» > «Declarar» | `measure.applies`, `measure.maturity_assessed`, `measure.maturity_target`, `measure.documentary_reference`, `measure.owner`, `measure.assessed_at` |
| Madurez de los controles medidos (procedimiento, valoración) | Panel «Madurez» de cada control ([guía 10](10-maturity-assessment.md)) | `measure.maturity_assessed`, `measure.documentary_reference`, `measure.owner` |
| Horas internas y externas y presupuesto ejecutado de cada ciclo | Registro de ciclos del manager (`/etc/ensfacil/metrics-cycle-register.tsv`) | `resources.hours_internal`, `resources.hours_external`, `resources.budget_executed` |
| Presupuesto TIC total, plantilla TIC total y plantilla de seguridad del periodo | «Informe anual (art. 32)» > «Recursos TIC totales» | `resources.ict_budget_total`, `resources.ict_staff_total`, `resources.security_staff` |
| Fecha de ocurrencia de cada incidente (opcional) | Columna `fecha_ocurrencia` del registro de incidentes ([guía de cumplimiento de op.exp.7](https://gitlab.com/quersystem/ens-controls-runbook/linux/op.exp.7/-/blob/main/docs/deployment/02-compliance.md)) | `incidents.mttd_hours`, `incidents.mttd_from_occurrence` |

Las entradas declaradas y los recursos TIC se guardan en el documento de madurez (`wazuh-ens-configuration/_doc/maturity`) por la misma ruta que la madurez: rol de administración, versión leída (`expectedVersion`), historial que no se sobrescribe. Cada entrada nueva se añade; la vigente es la última.

Las 50 medidas sin motor son las 39 del Anexo II que no están en el catálogo (org.1-4, op.pl.1-5, op.ext.1-4, op.cont.1, op.cont.4, mp.if.1-7, mp.per.1-4, mp.eq.1, mp.com.2, mp.si.1-5, mp.sw.1, mp.info.1-5) y las 11 del catálogo «Sin medición todavía» (mp.eq.2-4, mp.com.1, mp.com.3, mp.com.4, mp.sw.2, mp.s.1-4). Un control medido por el motor no admite entrada declarada.

Declarar una medida:

1. Abrir Controles > op.mon.2 y bajar a «Medidas sin motor».
2. Pulsar «Declarar» en la fila de la medida.
3. Rellenar el formulario y pulsar «Guardar».

Resultado esperado: la fila muestra la entrada (aplica, madurez, referencia, responsable y fecha) con el origen «declarada».

## 6. Congelado anual

### 6.1 Congelado automático al cierre

La tarea diaria del servidor (02:30, hora de la zona configurada), tras escribir las instantáneas del día, congela el periodo que acaba de cerrar:

- solo si el cierre fue hace 31 días o menos; pasado ese plazo, el periodo se congela únicamente a petición (apartado 6.2);
- con el usuario interno del dashboard, nunca con el de quien mira;
- una sola vez: el documento se crea con `create` y una segunda pasada, o un segundo dashboard, no escribe nada;
- un fallo no impide las instantáneas del día y se reintenta con la pasada del día siguiente.

El documento es `annual_freeze|<periodo>` en el índice `wazuh-ens-snapshots`, con la revisión 1, el instante, el autor (`ENSFácil (tarea diaria)`) y el conjunto completo. No tiene campo `date`: las lecturas de instantáneas, la comprobación de la tarea diaria y la purga de instantáneas de más de 1095 días no lo tocan.

### 6.2 Congelar o regenerar a petición

1. Abrir «Informe anual (art. 32)» y elegir el periodo cerrado en «Periodo».
2. Pulsar «Congelar» (periodo sin congelar) o «Regenerar» (periodo congelado).
3. Escribir el motivo y confirmar.

Resultado esperado: el estado pasa a «congelado el … por …, revisión N («motivo»)».

Reglas:

- solo un periodo cerrado; el periodo en curso no se congela;
- motivo obligatorio (hasta 1000 caracteres): queda en el conjunto (`header.freeze_reason`) y en el historial;
- el servidor comprueba el rol (`ensfacil_admin` o `all_access`) y escribe con el usuario interno;
- la petición lleva la revisión leída (`expectedRevision`, nulo si no había ninguna); si otro la ha cambiado, devuelve 409;
- las cifras son las del momento de la petición, no las del cierre: un congelado tardío lo indica con `header.frozen_at` posterior a `header.period_to`;
- la revisión anterior se conserva entera en `annual_freeze|<periodo>|r<N>` y sigue disponible para leer y exportar.

### 6.3 Reproducibilidad

El informe de un periodo congelado se sirve tal como se guardó: las entradas declaradas, la configuración o los hechos posteriores no lo cambian. Para incorporarlos hay que regenerarlo (apartado 6.2), lo que deja una revisión nueva y conserva la anterior.

### 6.4 Comprobar el congelado en el indexer

Desde el servidor (variable `IDX` de la [instalación desde cero, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens)), con el periodo que corresponda:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  -H 'Content-Type: application/json' "$IDX/wazuh-ens-snapshots/_search" \
  -d '{"query":{"ids":{"values":["annual_freeze|2026"]}},"_source":["period","revision","frozenAt","frozenBy","reason","history"]}' \
  | jq '.hits.hits[]._source'
```

Resultado esperado: el periodo, su revisión, el instante, el autor, el motivo y el historial de revisiones anteriores. Sin resultado, el periodo no está congelado.

Un usuario sin permiso de lectura de `wazuh-ens-snapshots` ve el informe calculado en el momento y el aviso «Sin permiso de lectura de wazuh-ens-snapshots». El permiso se concede con el patrón de índice `wazuh-ens-snapshots` y la acción `read` en su rol.

## 7. Exportar

| Formato | Contenido | Nombre del fichero |
|---|---|---|
| JSON | El conjunto completo: `schema`, `period` y las secciones `header`, `categorisation`, `implementation`, `maturity`, `measures` (cada medida con sus 16 datos), `incidents`, `resources` y `measurement` | `ensfacil-informe-art32-<periodo>[-r<revisión>].json` |
| CSV | Una fila por dato con las columnas `field_id`, `key`, `value`, `unit`, `source`, `trace` | `ensfacil-informe-art32-<periodo>[-r<revisión>].csv` |

El CSV sigue el RFC 4180: separador coma, comillas dobles para las celdas con coma, comillas o saltos de línea, fin de línea CRLF, UTF-8 sin BOM. Una celda `value` vacía significa «sin dato»; la columna `trace` dice por qué. `key` distingue los datos que se repiten: la medida (`op.acc.1`), el marco (`org`, `op`, `mp`), el tipo de incidente, la severidad o el nivel de madurez (`L0` a `L5`). El plugin no incluye un generador de XLSX; el CSV se abre en una hoja de cálculo.

Cada dato es un objeto `{ id, key, value, unit, source, trace }`. `value` es texto, número, booleano o nulo.

## 8. Orígenes

| `source` | Significado |
|---|---|
| `ENGINE` | Motor de ENSFácil sobre los hechos de Wazuh (estado, porcentaje, cobertura) |
| `MATURITY_ENGINE` | Nivel de madurez acreditado por las evidencias ([guía 10](10-maturity-assessment.md)) |
| `ASSESSMENT` | Valoración de madurez registrada por una persona |
| `DECLARED` | Entrada declarada de una medida sin motor, procedimiento registrado o recursos TIC totales |
| `SOA` | Declaración de Aplicabilidad, op.mon.2 P-01 |
| `ANNEX_II` | Tabla del Anexo II con los niveles de las dimensiones |
| `CONFIGURATION` | Configuración > General u op.mon.2 P-02 |
| `CYCLE_REGISTER` | Registro de ciclos de métricas del manager (dato declarado por la organización) |
| `INCIDENT_REGISTER` | Registro de incidentes de op.exp.7, reemitido por op.mon.2 |
| `ALERT_RECONCILIATION` | Conciliación de alertas e incidentes de op.exp.7 |
| `FREEZE` | Datos del congelado |
| `NONE` | Sin dato o dato informativo; `trace` explica cuál |

## 9. Campos

### 9.1 Cabecera

| Campo | Contenido |
|---|---|
| `header.schema` | Versión del formato: `ensfacil.art32.v1` |
| `header.organisation` | Configuración > General, «Cliente» |
| `header.unit` | Configuración > General, «Organización» |
| `header.system` | Configuración > General, «Alcance» (un ENSFácil es un sistema) |
| `header.period` | Año del cierre del periodo |
| `header.period_from` | Primer día del periodo (AAAA-MM-DD) |
| `header.period_to` | Último día del periodo: el cierre |
| `header.period_open` | `true` mientras el periodo no ha cerrado |
| `header.category` | Categoría del sistema: BÁSICA, MEDIA o ALTA |
| `header.generated_at` | Instante de la evaluación con la que se generó |
| `header.plugin_version` | Versión de ENSFácil |
| `header.frozen` | `true` si es un conjunto congelado |
| `header.frozen_at` | Instante del congelado |
| `header.frozen_by` | Autor del congelado (`ENSFácil (tarea diaria)` o el usuario) |
| `header.revision` | Revisión del congelado (1 = el del cierre) |
| `header.freeze_reason` | Motivo de la regeneración |

### 9.2 Categorización

| Campo | Contenido |
|---|---|
| `category.level_c` | Nivel de Confidencialidad; clave ausente: el nivel ENS |
| `category.level_i` | Nivel de Integridad |
| `category.level_t` | Nivel de Trazabilidad |
| `category.level_a` | Nivel de Autenticidad |
| `category.level_d` | Nivel de Disponibilidad |
| `category.ens_level` | Nivel ENS de Configuración > General |
| `category.category` | Categoría: el mayor nivel de las dimensiones (Anexo I); la traza avisa si una dimensión supera al nivel ENS |

### 9.3 Por medida del Anexo II (`key` = medida)

| Campo | Contenido |
|---|---|
| `measure.name` | Nombre de la medida |
| `measure.engine` | `MEDIDO` (catálogo, activo), `SIN_MEDICION` (catálogo, borrador) o `SIN_MOTOR` (fuera del catálogo) |
| `measure.axis` | Eje de aplicación: `Categoría` o las dimensiones (`T A`) |
| `measure.level` | Nivel con que se aplica: la categoría o el mayor de sus dimensiones |
| `measure.annex_requirement` | Exigencia del Anexo II en ese nivel: `aplica`, los refuerzos (`+R1`) o `n.a.` |
| `measure.soa` | Lo que dice P-01: `sí`, `no` o nulo si no tiene fila |
| `measure.applies` | Si aplica: P-01; sin fila, la entrada declarada; sin ella, el Anexo II |
| `measure.status` | Estado del motor (`CUMPLE`, `PARCIAL`, `NO_CUMPLE`, `NO_EVALUABLE`, `NO_APLICA`), o `SIN_MEDICION` / `SIN_MOTOR` |
| `measure.implementation_pct` | Porcentaje del motor; nulo sin motor o si no aplica en su nivel |
| `measure.coverage_pct` | Cobertura del motor: requisitos con evidencia sobre los aplicables |
| `measure.maturity_accredited` | Nivel acreditado por las evidencias (solo medidas medidas) |
| `measure.maturity_assessed` | Nivel valorado por una persona o declarado; el más reciente |
| `measure.maturity_target` | Objetivo: el declarado o valorado, o el de la categoría de su nivel (Configuración > General) |
| `measure.documentary_reference` | Referencia documental de la entrada declarada o, en una medida medida, el procedimiento registrado |
| `measure.owner` | Responsable de la entrada declarada o del procedimiento |
| `measure.assessed_at` | Fecha de la valoración o de la entrada declarada |

### 9.4 Grado de implantación

| Campo | Contenido |
|---|---|
| `implementation.global_pct` | Media del porcentaje del motor de las medidas que aplican y tienen porcentaje |
| `implementation.framework_pct` | La misma media por marco (`key`: `org`, `op`, `mp`) |
| `implementation.measures_applicable` | Medidas que aplican |
| `implementation.measures_measured` | De ellas, con porcentaje del motor |
| `implementation.measures_declared` | De ellas, sin porcentaje y con madurez valorada o declarada |
| `implementation.measures_without_data` | De ellas, sin porcentaje ni madurez; la traza las enumera |

### 9.5 Madurez

| Campo | Contenido |
|---|---|
| `maturity.measures_at_level` | Medidas que aplican por nivel (`key`: `L0` a `L5`): el valorado o declarado y, sin él, el acreditado |
| `maturity.not_assessed` | Medidas que aplican sin nivel |
| `maturity.below_target` | Medidas por debajo de su objetivo; la traza las enumera |

### 9.6 Incidentes

| Campo | Contenido |
|---|---|
| `incidents.window_from` | Inicio de la ventana: el del periodo |
| `incidents.window_to` | Fin de la ventana: el del periodo o, en curso, la generación |
| `incidents.total` | Incidentes abiertos en el periodo (primera fase `inicial`, o la primera fase) |
| `incidents.by_type` | Por `clasificacion` (`key`: el tipo; `sin clasificar` si falta) |
| `incidents.by_severity` | Por severidad, la mayor de sus fases (`key`: `baja`, `media`, `alta`, `critica`) |
| `incidents.mttd_hours` | Tiempo medio de detección en horas: de `fecha_ocurrencia` a la fase `inicial`; sin ella, de la primera alerta conciliada por op.exp.7 a la fase `inicial` |
| `incidents.mttd_from_occurrence` | Incidentes medidos con `fecha_ocurrencia` |
| `incidents.mttd_from_alert` | Incidentes medidos con la primera alerta conciliada: cota inferior, solo en la ventana de 30 días de op.exp.7 |
| `incidents.mttd_without_data` | Incidentes sin ninguno de los dos datos; la traza los enumera |
| `incidents.mttc_hours` | Tiempo medio de contención: de la fase `inicial` a la primera `intermedio` |
| `incidents.mttr_hours` | Tiempo medio de resolución: de la fase `inicial` a la última `final` |
| `incidents.notified_ccn_cert` | Incidentes con `notificacion_ccn_cert` |
| `incidents.with_personal_data` | Incidentes con `datos_personales` = `si` |
| `incidents.notified_aepd` | De ellos, con `AEPD` en `notificado_a` |
| `incidents.alerts_relevant` | Alertas Alta y Crítica de la conciliación de op.exp.7 (sin las excluidas por su P-12) |
| `incidents.alerts_in_incident` | De ellas, dentro de un incidente registrado |
| `incidents.alerts_to_incident_pct` | Porcentaje de alertas decididas (en incidente o fuera de plazo sin él) que acabaron en incidente; nulo si ninguna está decidida |

Los datos de alertas cubren los 30 días de la conciliación de op.exp.7 hasta la generación, no el periodo entero; la traza lo indica.

### 9.7 Recursos

| Campo | Contenido |
|---|---|
| `resources.cycles` | Ciclos del registro consolidados en el periodo |
| `resources.hours_internal` | Suma de `horas_internas` de esos ciclos |
| `resources.hours_external` | Suma de `horas_externas` |
| `resources.budget_executed` | Suma de `presupuesto_ejecutado` (euros) |
| `resources.ict_budget_total` | Presupuesto TIC total declarado para el periodo (euros) |
| `resources.ict_staff_total` | Plantilla TIC total declarada (personas, equivalentes a tiempo completo) |
| `resources.security_staff` | Plantilla de seguridad declarada |
| `resources.budget_pct_of_ict` | Presupuesto ejecutado sobre el presupuesto TIC total |
| `resources.security_staff_pct_of_ict` | Plantilla de seguridad sobre la plantilla TIC total |

### 9.8 Fiabilidad de la medición

| Campo | Contenido |
|---|---|
| `measurement.coverage_pct` | Cobertura de la monitorización de op.mon.2 EV-04 |
| `measurement.controls_not_evaluable` | Controles con requisitos sin evaluar por falta de configuración; la traza los enumera |
| `measurement.last_cycle` | Último ciclo del registro de ciclos |
| `measurement.last_cycle_implementation_pct` | `implantacion_global` de ese ciclo, dato declarado |

## 10. API

| Ruta | Quién | Uso |
|---|---|---|
| `GET /api/ensfacil/annual-report` | Cualquier usuario que pueda leer la evaluación | Periodo en curso; `?period=AAAA` un periodo; `?period=AAAA&revision=N` una revisión congelada anterior |
| `POST /api/ensfacil/annual-report/freeze` | `ensfacil_admin` o `all_access` | Cuerpo `{ "period": "AAAA", "reason": "…", "expectedRevision": N o null }` |

Mientras la evaluación de todos los controles se calcula, la lectura devuelve `pending: true` sin conjunto; el panel vuelve a pedirlo cada 5 segundos.

## 11. Limitaciones

| Limitación | Consecuencia |
|---|---|
| Los campos del cuestionario INES no están confirmados | Los identificadores son de ENSFácil; el mapeo al cuestionario se hace cuando se disponga de él |
| La conciliación de alertas de op.exp.7 cubre 30 días | `incidents.alerts_*` y el MTTD por alerta no abarcan el periodo entero |
| op.exp.9 y op.mon.3 exigen la cabecera de 13 columnas del registro de incidentes | No añadir `fecha_ocurrencia` en un manager con esos runbooks hasta que la admitan |
| El motor recalcula con los hechos vivos | Un periodo sin congelar no reproduce las cifras de su cierre; un congelado tardío lleva las cifras del día en que se pidió |
| Un ENSFácil es un sistema | La relación de sistemas de una organización con varios se compone con un informe por instalación |
