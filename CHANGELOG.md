# Registro de cambios
[English](CHANGELOG.en.md)

Aquí se anotan los cambios de cada versión de ENSFácil. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las versiones
siguen el [versionado semántico](https://semver.org/lang/es/).

La entrada de cada versión son las notas de su release en GitLab.

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
