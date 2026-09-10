# Integración de ENSFácil con Wazuh Dashboard

Esta carpeta contiene la capa necesaria para integrar el núcleo ENSFácil con el plugin oficial de Wazuh Dashboard.

[[_TOC_]]

## Alcance

El núcleo funcional de ENSFácil se encuentra en `dashboard/ens`.

La integración adicional está formada por:

| Elemento | Descripción |
|---|---|
| 10 parches | sobre archivos existentes del plugin oficial de Wazuh. |
| 7 archivos adicionales | necesarios para completar la integración frontend y backend. |

Los 7 archivos adicionales corresponden a:

| Cantidad | Archivo |
|---|---|
| 1 | catálogo de requisitos ENS para la vista de cumplimiento. |
| 2 | archivos TypeScript del datasource ENS. |
| 1 | recurso gráfico con el logotipo ENS. |
| 1 | ruta backend para la configuración ENS. |
| 1 | controlador backend para la configuración ENS. |
| 1 | módulo de persistencia para la configuración ENS. |

## Backend ENS

La integración incorpora las rutas `GET /ens/configuration`, `PUT /ens/configuration` y `GET /ens/configuration/history`.

La persistencia utiliza el índice `wazuh-ens-configuration` y el documento activo utiliza el identificador `active`.

## Versiones validadas

| Concepto | Versión |
|---|---|
| Origen funcional analizado | Wazuh 4.14.5. |
| Base de parches | wazuh-dashboard-plugins v4.14.5. |
| Compatibilidad de aplicación comprobada | Wazuh 4.14.7. |
| OpenSearch Dashboards | 2.19.5. |

> [!warning]
> La compatibilidad con otras versiones no debe asumirse. Debe ejecutarse el precheck antes de aplicar la integración.

## Validación de la integración

Sobre una copia limpia de Wazuh 4.14.7 se valida el ciclo completo de integración: precheck, aplicación, verificación, rollback y comparación exacta con el estado inicial, sin ficheros `.rej` ni conflictos. También se valida la actualización desde una integración anterior y su rollback exacto.

## Scripts

| Script | Función |
|---|---|
| `check-integration.sh` | comprueba la versión, la integridad de los archivos y si los parches pueden aplicarse sin modificar el árbol objetivo. |
| `apply-integration.sh` | realiza un precheck, genera una copia de seguridad, aplica los parches, copia los archivos ENS y verifica el resultado. |
| `rollback-integration.sh` | restaura los archivos base desde el backup generado y elimina los archivos añadidos por la integración cuando no existían previamente. |

## Seguridad del despliegue

Los scripts actúan sobre la ruta `plugins/main` indicada expresamente como argumento.

> [!note]
> No modifican por sí mismos Wazuh Manager, Wazuh Indexer, reglas ENS ni configuración de agentes.

La instalación y reinicio de Wazuh Dashboard se realizan posteriormente como una fase independiente.
