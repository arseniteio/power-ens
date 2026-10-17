# Registro de cambios
[English](CHANGELOG.en.md)

Aquí se anotan los cambios de cada versión de ENSFácil. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones
siguen el [versionado semántico](https://semver.org/lang/es/).

La entrada de cada versión son las notas de su release en GitLab.

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
