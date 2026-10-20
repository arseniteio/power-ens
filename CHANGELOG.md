# Registro de cambios
[English](CHANGELOG.en.md)

Aquí se anotan los cambios de cada versión de ENSFácil. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones
siguen el [versionado semántico](https://semver.org/lang/es/).

La entrada de cada versión son las notas de su release en GitLab.

## [1.4.0] - Sin publicar

Correcciones del catálogo según las plantillas del auditor v2.0: aplicabilidad
por las cinco dimensiones, textos literales del BOE con su procedencia y orden
del Anexo II. Datos de la organización pedidos una sola vez.

### Añadido

- Configuración > General > «Datos de la organización»: los datos que piden
  varios controles (personal autorizado, preproducción, reversión, algoritmos
  del CCN, retención, grupos privilegiados, canales de acceso remoto y otros)
  se declaran una vez y cada parámetro que los lee conserva su `P-xx`. Al
  cargar, los valores iguales se unifican solos, un parámetro vacío toma el
  valor si lo admite y los valores distintos quedan pendientes de elegir.
- Guardado con control de versión: si la configuración cambia mientras está
  abierta, el guardado se rechaza (409) con «La configuración ha cambiado desde
  que la abriste» y se conservan los cambios en pantalla. `set-parameters.py` e
  `inject-control.py` escriben solo sobre la versión que leyeron.

- Niveles de Confidencialidad (C), Integridad (I) y Autenticidad (A) en
  Configuración > General, junto a los de Trazabilidad (T) y Disponibilidad
  (D), cada uno con los controles que lo usan. Clave ausente = nivel ENS,
  nunca `null`.
- Etiquetas «Norma ENS» (literal del BOE) y «Criterio de aplicación»
  (interpretación de ENSFácil o de la plantilla del auditor) por fila en el
  detalle de cada control, en la vista Controles y en el informe (pantalla y
  PDF). El catálogo guarda la interpretación aparte (`interpretation`).
- Apartado del Anexo II, eje de aplicación y plantilla de origen de cada
  control en el encabezado del detalle y del informe (`annexSection`,
  `source`). op.acc.2 sigue en la plantilla v1.0, sin fecha.
- mp.info.6: «Correspondencia con la plantilla del auditor» en el detalle, el
  informe y el PDF, con la cobertura de cada P-xx y EV-xx de la plantilla.
  Parámetros, evidencias y requisitos desplegados no cambian.
- op.exp.10 en Windows: regla 111109 (evento 4663 de lectura de un almacén de
  claves con SACL) para el runbook `windows/op.exp.10`. EV-01 acepta los
  accesos auditados con auditd (Linux y LDAP) o con SACL de lectura (Windows).
- Aviso «Niveles incoherentes» en Controles y en el panel, con enlace a
  General, cuando una dimensión supera el nivel ENS; General no guarda y
  `config/validate-configuration.ts` termina con código 1.
- Los 11 controles nuevos del paquete v2.0 del auditor, en estado `DRAFT`
  (documentales, medición por oleadas): mp.eq.2, mp.eq.3, mp.eq.4, mp.com.1,
  mp.com.3, mp.com.4, mp.sw.2, mp.s.1, mp.s.2, mp.s.3 y mp.s.4, con sus
  requisitos, parámetros, evidencias, informe y bloque de configuración. Ejes
  del índice: mp.eq.2 por A, mp.eq.4 por C, mp.com.3 por I y A, mp.s.4 por D;
  el resto, por la categoría. No entran en el índice: Controles y Vista
  general muestran «Sin medición todavía» y el detalle, por evidencia, la
  «Fuente necesaria». Bandas de rule ID 111800–112899 reservadas, sin reglas.
  Se siembran con `config/inject-control.py <control>` como cualquier otro.
  Leen «Datos de la organización»: mp.sw.2 P-03 (entorno de preproducción,
  que gana la columna «Aislamiento de producción» y une las filas por pareja
  de sistemas), mp.com.3 P-02 (algoritmos autorizados por el CCN), mp.com.3
  P-08 (productos certificados) y mp.s.3 P-07 (formación del personal).

### Cambiado

- Ejes de aplicación del índice del auditor: mp.info.6 por D; op.acc.1 por T
  y A; op.acc.2 a op.acc.6 por C, I, T y A; op.exp.8 por T; op.cont.2 y
  op.cont.3 por D. Con varias dimensiones rige la más alta.
- Textos de requisito literales del BOE: 14 del catálogo (mp.info.6 y
  op.acc.1) y 20 de la vista Controles (mp.info.6, op.acc.1 y op.acc.2).
  mp.info.6.2.a a .2.d llevan el literal de su letra.
- Las listas de controles siguen el orden del Anexo II (op.acc, op.exp,
  op.nub, op.cont, op.mon y, al final, mp.info.6), también la de cada agente
  en Configuración.
- Un control gobernado por una dimensión muestra «Nivel aplicable» con su
  dimensión, por ejemplo «Nivel aplicable: ALTO (Disponibilidad)».
- op.exp.10 EV-01 «Accesos auditados al material criptográfico»: lecturas
  auditadas con auditd (Linux y LDAP) o con SACL de lectura (Windows); FIM solo
  detecta cambios de integridad.
- op.exp.3 EV-11 se declara evidencia propia de ENSFácil.

### Actualizar desde la 1.3.0

- Sin ninguna dimensión declarada, los resultados no cambian.
- Un documento que declara T o D puede cambiar de veredicto: D gobierna
  también mp.info.6, y T también op.acc.1 a op.acc.6 cuando es la más alta de
  sus dimensiones. Antes de actualizar, comprobar el documento con
  `config/validate-configuration.ts` (guía 02, apartado 5.1).

## [1.3.0] - 2026-10-19

Configuración por plantillas de control, comparación por expresión regular y
código en inglés.

### Añadido

- Configuración en tres pestañas (guía 09): «Controles», con los ajustes
  comunes, las plantillas y la asignación por agente; «Agentes», con el tipo
  detectado de cada agente y, por control, su plantilla y sus ajustes propios
  con el origen de cada valor; y «General», con el nivel ENS, los niveles T y
  D y el alcance de solo lectura.
- Plantillas por control: una de serie por tipo de sistema (Linux, servidor
  LDAP, Windows, manager de Wazuh, copia PBS, copia Zimbra NE) y las propias, que se crean, duplican,
  editan y borran. Editar o borrar una plantilla en uso muestra los agentes
  afectados y pide confirmación. La asignación admite varios agentes a la vez.
- Valor que se aplica a un agente: su ajuste propio; si no, la plantilla
  asignada en ese control; si no, la plantilla de serie de su tipo; si no, el
  valor común del control.
- Comparación «Texto exacto» o «Expresión regular» (sintaxis RE2, hasta 512
  caracteres, coincidencia completa) en op.acc.1 P-03 y P-04, op.acc.4 P-05 y
  op.acc.6 P-08 y P-11, en los ajustes comunes, en las plantillas y en los
  ajustes de cada agente, con «Probar con un valor».
- Las listas aceptan varios elementos separados por comas, punto y coma o
  saltos de línea; se quitan las entradas vacías y las repetidas.
- La dependencia `re2js` 2.8.6.
- `config/set-parameters.py` admite, por agente y control, la clave `template` (id de plantilla, `none` o `null`) y valores como objeto `{value, matchMode}`; `config/inject-control.py` conserva el `matchMode` y las plantillas propias; `config/validate-configuration.ts` lista los valores comunes inválidos y las plantillas por agente.

### Cambiado

- Una configuración de la 1.2.0 se convierte al guardar: las plantillas
  aplicadas pasan a asignaciones por control. No se pierde ningún valor y la
  versión anterior queda en el historial.
- La pestaña «Controles» de Configuración marca como incompleto un control al que le falta un
  valor obligatorio en algún agente.
- En el detalle del control y en los informes, un valor que se compara como expresión regular lleva la etiqueta «Expresión regular: …».
- La cabecera del detalle del control: el identificador en una etiqueta y el
  título en su propia línea.
- Los textos de Configuración usan nombres de parámetros y de agentes, sin
  códigos internos; las descripciones de los parámetros son más cortas.
- El campo «Alcance» de la configuración global pasa a llamarse «Descripción
  del alcance (informes)».
- Código, comentarios, mensajes de registro, scripts de `config/` y tests en
  inglés. La interfaz sigue en español.
- Un modo de comparación de un agente sin su ajuste propio se muestra como ajuste que no se aplica y se quita con «Quitar».
- Documentación más directa, en español y en inglés.

### Notas de actualización

- La salida de `config/` (`inject-control.py`, `set-parameters.py`, `validate-configuration.ts`, `create-admin-role.sh`, `deploy-plugin.sh`, `build-plugin.sh`) está en inglés; los runbooks que la citan se actualizan.
- Los tests y `config/validate-configuration.ts` necesitan antes
  `npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive`
  (guías 01 y 08).
- Volver a la 1.2.0: basta con desplegar su zip. Restaurar desde el
  historial la versión anterior a la conversión solo hace falta para que la
  1.2.0 evalúe con sus plantillas (guía 09, apartado 12). La
  1.2.0 compara una expresión regular como un nombre literal.

## [1.2.0] - 2026-10-18

Evaluación en el servidor con toda la ventana, configuración por sistema y
pantallas que no desaparecen.

### Añadido

- La configuración por sistema (guía 09, «Configuración por sistema y
  plantillas», en `docs/deployment/`). La pantalla de Configuración tiene dos
  niveles: «Organización», con la política común, y «Sistemas», con lo propio
  de cada agente del alcance y de su plataforma. Cada parámetro es de
  organización, por sistema o por plataforma.
  En la fila de una máquina, un parámetro por sistema o por plataforma toma el
  valor propio del agente, si no el de sus plantillas y si no el de la
  organización; los que describen otras máquinas en un control del manager se
  resuelven por unión. Sin valores por sistema, los veredictos son los de la
  configuración de la organización.
  - El tipo de cada sistema (manager, Windows, LDAP de Zimbra o Linux) se
    detecta con el inventario y los hechos, se muestra con la evidencia de la
    detección y se corrige a mano.
  - Plantillas de plataforma «Linux Ubuntu», «Servidor LDAP Zimbra», «Windows
    Server» y «Manager Wazuh», y los añadidos «Copias con PBS» y «Copias Zimbra
    NE», con una vista previa por sistema antes de guardar.
  - «Migrar a sistemas» copia a cada agente las filas de las tablas de la
    organización que lo nombran, sin perder ninguna fila y sin dejar a ninguna
    máquina sin valor. Es opcional y se confirma tecleando `migrar`.
  - Cada versión del documento queda en el historial antes de sustituirse, la
    escriba el plugin, `inject-control.py` o `set-parameters.py`, también en la
    migración.
  - `config/set-parameters.py` declara los valores de un sistema (clave
    `agents`) y `config/validate-configuration.ts` los valida.
- «Controles del catálogo sin añadir», en «Organización»: los controles que
  existen en el plugin y no están en el documento, con «Añadir con valores por
  defecto». La lista de controles y el detalle de un control así ofrecen el
  mismo botón.
- La pestaña **Vista general**: todas las máquinas del alcance y todos los
  controles a la vez. Incluye un resumen por máquina (estados, requisitos que
  no cumplen, último dato y sus peores controles), la matriz controles ×
  máquinas por cumplimiento o por frescura de la recogida, la cola de trabajo
  agrupada por quien tiene que actuar y la tendencia de 30 días con el estado
  de cada control cada día.
- **Configurar este control**, en el detalle del control, y una insignia por
  cada parámetro citado en una no conformidad, con el valor que aplica a la
  máquina y su origen (propio, de una plantilla o de la organización). Abren
  Configuración en ese control o en ese parámetro, con «Volver al detalle de
  …». Informes muestra también el origen del valor aplicado.
- La tarjeta «ENSFácil» en la portada de OpenSearch Dashboards (`/app/home`),
  cuando el dashboard incluye el plugin `home`. La portada de Wazuh no ofrece
  ningún punto de extensión para tarjetas de otros plugins: en ella, ENSFácil
  sigue estando solo en el menú.

### Cambiado

- **La evaluación se hace en el servidor del plugin con todos los hechos de la
  ventana de 30 días**, con los permisos del usuario que mira. El navegador ya
  no descarga hechos: recibe los resultados (la lista de controles pasa de
  unos 170 MB a unos KB). La 1.1.0 evaluaba en el navegador con los 10.000
  hechos más recientes (en el panel, de todos los controles juntos; en la lista
  y el detalle, de cada control), que en un alcance con actividad cubren horas
  y no la ventana entera. **Al actualizar, algunos veredictos cambian**, porque
  ahora son los de la ventana completa. En el laboratorio, con los mismos
  hechos, el panel de la 1.1.0 daba CUMPLE a tres evidencias que en los 30 días
  son NO_CUMPLE y contaba menos no conformidades de las que hay, porque dejaba
  fuera máquinas enteras.
- La primera carga responde por partes. La lista de controles, la Vista general
  y el panel muestran en unos segundos los controles ya calculados y
  «Calculando…» en los demás, y se completan sin intervención; mientras faltan
  controles, no muestran cifras de conjunto. La evolución diaria se calcula
  después y, hasta tenerla, el gráfico indica «Calculando la serie…». Después,
  el resultado guardado se muestra al instante y se recalcula en segundo plano
  cuando llegan hechos nuevos («Actualizando…»). Si un recálculo falla, se
  indica el motivo con «Reintentar» sobre el último resultado correcto.
- La lista de controles muestra siempre los 23. Los que no se miden en la
  máquina elegida van al final, en gris, con el motivo y sin número. Una línea
  indica los controles que no aplican en el nivel («Nivel BAJO: 4 controles no
  aplican (…)»). Sin máquina elegida, cada control lleva su barra de máquinas
  («1 cumple · 1 no cumple (de 2 máquinas)»).
- Las no conformidades se leen por partes. El titular es la evidencia que falla,
  su estado y la primera frase de su motivo, sin la plantilla del puente y sin
  negrita. Debajo aparecen el resto del motivo, las listas como listas, lo que
  va tras «Además» aparte, las demás evidencias del requisito con su estado y
  las que conforman plegadas. El texto de los motivos en Informes y en el PDF
  no cambia.
- El detalle del control conserva el control abierto en la URL: cambiar de
  pestaña o recargar la página lo vuelve a abrir.
- op.acc.1: P-01 (origen de las identidades) pasa de menú a lista, porque una
  organización puede tener varias fuentes de identidad; P-03 y P-04 traen como
  valor inicial las cuentas de sistema de una base Linux y las cuentas
  genéricas prohibidas.

### Corregido

- El detalle de un control que no se mide en la máquina elegida se quedaba
  vacío e indicaba «Todo lo aplicable … conforme». Ahora indica que el control
  no se mide en esa máquina, con el motivo.
- Al cambiar de máquina, el detalle evaluaba durante unos segundos la máquina
  nueva con los hechos de la anterior. Ahora muestra el resultado anterior
  rotulado con su máquina y su hora hasta que llega el nuevo.
- Un error o un tiempo agotado sustituía la página entera. Ahora el aviso, con
  «Reintentar», aparece encima del último resultado.
- «Activo:», en el detalle, mostraba el nombre del manager con una máquina
  elegida.
- Con el manager elegido, la lista de controles ocultaba los 14 controles que
  solo se miden en las máquinas (y mp.info.6, en las máquinas fuera de su
  P-04). Configuración no mostraba los controles del catálogo que el documento
  no tenía.
- Mientras cargaba, la lista de controles mostraba un estado en cada fila.
- Una dirección con una máquina fuera del alcance ponía todos los controles
  «sin datos». Ahora el selector lo indica, con «Quitar la máquina y ver
  todas».
- La acción propuesta para un control que no está en la configuración activa
  mandaba a corregir el productor de la evidencia. Ahora indica cómo añadirlo.
- `config/deploy-plugin.sh` paraba el dashboard antes de comprobar que su
  usuario podía leer el zip, y lo dejaba parado si no podía (por ejemplo, con
  el zip en `/home`). Ahora instala desde una copia legible comprobada antes de
  parar y, si no la consigue, termina con el código 4 sin tocar el servicio.

### Notas de actualización

- No hay nada que migrar automáticamente: la configuración de la 1.1.0 se
  evalúa igual, con los valores de la organización.
- «Migrar a sistemas» es opcional y reversible: la versión anterior del
  documento queda en el historial.
- Para volver a la 1.1.0 después de migrar, hay que restaurar la versión del
  documento anterior a la migración: una 1.1.0 no ve las filas que salieron de
  la organización (guía 09, apartado 12).
- La primera carga de cada usuario tras arrancar el dashboard lee la ventana
  entera. En el laboratorio, los primeros controles aparecen en unos segundos y
  el resultado completo en unos 20 s; después, las vistas se sirven al
  instante.
- El servidor del dashboard evalúa ahora los controles, y eso ocupa memoria
  suya: en el laboratorio (6 máquinas), unos 15 MB por usuario tras la primera
  carga y unos 50 MB mientras se calcula. Lo acotan 50.000 hechos por lectura,
  4 lecturas a la vez y una memoria de resultados de 64 a 256 MB según el
  alcance. En un despliegue mayor, dar más montón al dashboard
  (`--max-old-space-size`, guía 04, apartado 8.1).

## [1.1.0] - 2026-10-10

Seis controles nuevos: el catálogo pasa de 17 a 23.

### Añadido

- Seis controles en el catálogo, todos medidos en el manager (op.mon.3 también
  en las máquinas):
  - `op.cont.2` Plan de continuidad (solo con D en ALTO), sin recolector ni
    reglas (runbook solo de documentación): lo juzga el plugin con las tablas
    de la pantalla y su vigencia;
  - `op.cont.3` Pruebas periódicas (solo con D en ALTO), con los registros de
    pruebas y de deficiencias del manager y las caídas y arranques medidos en
    la ventana real de cada prueba;
  - `op.mon.1` Detección de intrusión;
  - `op.mon.2` Sistema de métricas, con el registro de ciclos de métricas;
  - `op.mon.3` Vigilancia, en el manager y en las máquinas del grupo `ens`;
  - `op.nub.1` Protección de servicios en la nube.
- La dimensión de Disponibilidad (D): en Configuración > Configuración global,
  el campo opcional **Nivel de Disponibilidad (D)**. Solo lo leen op.cont.2 y
  op.cont.3; vacío, usan el nivel ENS global.
- La marca de acreditación documental (`attested`) en las decisiones de las
  policies: un requisito que cumple por una declaración en vigor sale
  «Acreditado documentalmente», nunca «Medido», y no rellena como medidas sus
  evidencias.
- La marca documental (`documental`) en las decisiones que salen solo de las
  tablas de la pantalla (op.cont.2 entero, R2 de op.mon.1 y lo documental de
  op.nub.1): un recolector parado o un alcance sin máquinas no las borran, y
  un incumplimiento documental se lee «Declarado (documental)» y manda a
  renovar o completar la documentación, no a corregir la máquina.
- Informes: el de op.mon.2 recibe el resultado de todos los controles (el
  panorama) con una segunda búsqueda de hechos, la misma que la del panel.

### Cambiado

- En las instalaciones nuevas, el índice de configuración,
  `wazuh-ens-configuration`, se crea con `auto_expand_replicas: 0-1`: en un
  indexer de un solo nodo ya no se queda en amarillo. El plugin no toca un
  índice que ya existe: uno creado por la 1.0.0 se ajusta a mano al actualizar
  (guía de actualización, apartado 8).
- Un control cuyas evidencias no escuchan ningún hecho (op.cont.2) no espera
  hechos: lo que no puede acreditar es de CONFIGURACIÓN, nunca de RECOGIDA.
- Una evidencia nombrada por la policy solo sustituye a un NO_EVALUABLE
  heredado de su requisito; un NO_CUMPLE o un PARCIAL heredado sigue mandando.
- En el detalle del control, las no conformidades documentales tienen su
  propio bloque y no cuentan en «Corregir el sistema auditado».

## [1.0.0] - 2026-10-08

Primera versión de ENSFácil como plugin independiente de Wazuh Dashboard.

### Añadido

- El plugin `ensfacil` para OpenSearch Dashboards 2.19.5 (Wazuh 4.14.7). Se
  instala junto al plugin de Wazuh y no lo modifica.
- La app «ENSFácil», en el menú «Security operations», con las pestañas Panel,
  Configuración, Controles, Detalle del control, Informes, Evidencias y Eventos,
  y el selector «Máquina».
- 17 controles en el catálogo:
  - `mp.info.6` Copias de seguridad;
  - `op.acc.1` Identificación;
  - `op.acc.2` Requisitos de acceso;
  - `op.acc.3` Segregación de funciones y tareas;
  - `op.acc.4` Proceso de gestión de derechos de acceso;
  - `op.acc.5` Mecanismo de autenticación (usuarios externos);
  - `op.acc.6` Mecanismo de autenticación (usuarios de la organización);
  - `op.exp.1` Inventario de activos;
  - `op.exp.2` Configuración de seguridad;
  - `op.exp.3` Gestión de la configuración de seguridad;
  - `op.exp.4` Mantenimiento y actualizaciones de seguridad;
  - `op.exp.5` Gestión de cambios;
  - `op.exp.6` Protección frente a código dañino;
  - `op.exp.7` Gestión de incidentes;
  - `op.exp.8` Registro de la actividad;
  - `op.exp.9` Registro de la gestión de incidentes;
  - `op.exp.10` Protección de claves criptográficas.
- Las rutas propias de la configuración, `/api/ensfacil/configuration` y su
  historial.
- El rol `ensfacil_admin`: solo quien lo tiene, o tiene `all_access`, puede
  guardar la configuración y ver su historial. Los intentos rechazados quedan en
  el registro del dashboard. `config/create-admin-role.sh` crea el rol y lo
  asigna.
- `config/build-plugin.sh` compila el plugin y `config/deploy-plugin.sh` lo
  instala: sube el `build.number` del dashboard, guarda antes el plugin
  instalado y, si falla, dice cómo volver atrás.
- Releases por CI/CD: cada etiqueta `vX.Y.Z` publica en GitLab la release
  `ENSFácil X.Y.Z` con `ensfacil-X.Y.Z-osd-2.19.5.zip`, `deploy-plugin.sh`,
  `create-admin-role.sh` y `SHA256SUMS`.
- Las guías para instalar desde una release y para compilar desde el código
  fuente, la guía para contribuir y este registro de cambios.

### Cambiado

- La configuración ENS sigue en el mismo índice, `wazuh-ens-configuration`, y
  con el mismo formato que en la versión integrada: no hay que migrarla.

### Retirado

- La versión integrada, que modificaba el plugin de Wazuh y añadía la app «ENS».
  Ya no se mantiene ni se distribuye, y el plugin de Wazuh vuelve a ser el
  oficial. La transición está en la guía de actualización, apartado 10.
