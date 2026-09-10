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

Sobre una copia limpia de Wazuh 4.14.7 se validó el ciclo completo de integración:

| Resultado |
|---|
| 9 parches aplicados correctamente. |
| 7 archivos adicionales copiados correctamente. |
| 0 archivos `.rej`. |
| rollback completado correctamente. |
| estado final idéntico a la copia inicial. |

El backend `/ens/configuration` fue compilado, instalado y registrado en Wazuh4. Las pestañas Controles y Eventos fueron validadas funcionalmente. El décimo parche evita que el Data Grid intente renderizar columnas ENS todavía ausentes del index pattern en una instalación nueva. También se validó Threat Hunting > Events como prueba de regresión. El ciclo completo 10+7 ya fue validado sobre una copia limpia de Wazuh 4.14.7, incluyendo precheck, aplicación, verificación, rollback y comparación exacta contra el baseline. También se validó la actualización desde el estado 9+7 al 10+7 y su rollback exacto al estado anterior. Ambos ciclos finalizaron sin rejects ni conflictos. Queda pendiente completar las pruebas de persistencia e histórico de configuración.

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

## Núcleo ENS

La comparación con el servidor funcional mostró que las únicas diferencias dentro de `dashboard/ens` corresponden a dos comentarios de documentación y un archivo `.pyc` generado automáticamente. No se detectaron diferencias funcionales de código que deban incorporarse.
