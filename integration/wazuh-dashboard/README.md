# Integración de ENSFácil con Wazuh Dashboard

Esta carpeta contiene la capa necesaria para integrar el núcleo ENSFácil con el plugin oficial de Wazuh Dashboard.

## Alcance

El núcleo funcional de ENSFácil se encuentra en `dashboard/ens`.

La integración adicional está formada por:

- 6 parches sobre archivos del plugin oficial de Wazuh.
- 2 archivos TypeScript del datasource ENS.
- 1 recurso gráfico con el logotipo ENS.

## Versiones validadas

- Origen funcional analizado: Wazuh 4.14.5.
- Base de parches: wazuh-dashboard-plugins v4.14.5.
- Compatibilidad de aplicación comprobada: Wazuh 4.14.7.
- OpenSearch Dashboards: 2.19.5.

La compatibilidad con otras versiones no debe asumirse. Debe ejecutarse el precheck antes de aplicar la integración.

## Scripts

`check-integration.sh` comprueba la versión, la integridad de los archivos y si los parches pueden aplicarse sin modificar el árbol objetivo.

`apply-integration.sh` realiza un precheck, genera una copia de seguridad, aplica los parches, copia los archivos ENS y verifica el resultado.

## Seguridad del despliegue

Los scripts actúan sobre la ruta `plugins/main` indicada expresamente como argumento.

No modifican por sí mismos Wazuh Manager, Wazuh Indexer, reglas ENS ni configuración de agentes.

La instalación y reinicio de Wazuh Dashboard se realizan posteriormente como una fase independiente.

## Núcleo ENS

La comparación con el servidor funcional mostró que las únicas diferencias dentro de `dashboard/ens` corresponden a dos comentarios de documentación y un archivo `.pyc` generado automáticamente. No se detectaron diferencias funcionales de código que deban incorporarse.
