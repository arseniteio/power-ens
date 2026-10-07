# Compatibilidad de versiones de ENSFácil
[English](03-version-compatibility.en.md)

[[_TOC_]]

## 1. Objetivo

Esta guía dice con qué versiones funciona ENSFácil y qué hacer antes de usar otra versión de Wazuh.

ENSFácil es un plugin propio de Wazuh Dashboard (`ensfacil`). No modifica el plugin de Wazuh: Wazuh se puede actualizar por su cuenta. Pero ENSFácil se compila para una versión **exacta** de OpenSearch Dashboards, la que lleva Wazuh Dashboard.

> [!important]
> La compatibilidad nunca debe suponerse porque Wazuh se instale o arranque bien. Una versión es compatible cuando se ha compilado ENSFácil para ella y se ha validado.

## 2. Versión validada

| ENSFácil | Wazuh | OpenSearch Dashboards |
|---|---|---|
| `1.0.0` | `4.14.7` | `2.19.5` |

Cualquier otra combinación está sin validar.

El zip lleva la versión de OpenSearch Dashboards en el nombre (`ensfacil-2.19.5.zip`) y en su manifiesto (`opensearchDashboardsVersion`). OpenSearch Dashboards solo acepta un plugin compilado para su versión exacta:

- al instalarlo, `opensearch-dashboards-plugin install` lo rechaza con `Plugin ensfacil [2.19.5] is incompatible with OpenSearch Dashboards […]`;
- si ya estaba instalado y el dashboard cambia de versión, el dashboard **no arranca**: `Failed to initialize plugins`.

## 3. Comprobar las versiones instaladas

```bash
dpkg-query -W -f='${Package} ${Version}\n' wazuh-manager wazuh-indexer wazuh-dashboard
sudo python3 -c 'import json; print(json.load(open("/usr/share/wazuh-dashboard/package.json"))["version"])'
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin list
```

Qué tiene que salir, en la combinación validada: los tres paquetes en `4.14.7-1`, `2.19.5` y, en la lista de plugins, `ensfacil@1.0.0`.

## 4. Antes de actualizar Wazuh

Comprobar qué versión de OpenSearch Dashboards trae la versión nueva de Wazuh Dashboard (en sus notas de versión o en su paquete).

- **Misma versión de OpenSearch Dashboards (`2.19.5`):** el zip de ENSFácil es el mismo. Aun así, la combinación nueva está sin validar hasta completar el apartado 5 en un entorno de pruebas.
- **Otra versión de OpenSearch Dashboards:** hace falta un zip de ENSFácil compilado para ella. Sin ese zip, no actualizar el dashboard: con `ensfacil` instalado, no arrancaría. Si hay que actualizar igualmente, retirar antes ENSFácil ([diagnóstico y rollback, apartado 5](04-troubleshooting-and-rollback.md#5-retirar-ensfácil)).

> [!warning]
> No hacer esta evaluación directamente en un entorno de producción.

## 5. Evaluar una versión nueva

En un entorno de pruebas:

1. Preparar el árbol de compilación de la versión nueva de Wazuh Dashboard, como en la [guía de instalación, apartado 13.2](01-installation-from-scratch.md#132-preparar-el-árbol-de-opensearch-dashboards-2195), con su etiqueta.
2. Ajustar la versión de OpenSearch Dashboards en `package.json`, `opensearch_dashboards.json` y `config/build-plugin.sh`.
3. Compilar con `config/build-plugin.sh` y validar el zip ([apartado 13.3](01-installation-from-scratch.md#133-compilar-y-validar-el-plugin)).
4. Instalar con `config/deploy-plugin.sh` y comprobar el servicio, la lista de plugins y la respuesta `401` de `/api/ensfacil/configuration` ([apartado 13.4](01-installation-from-scratch.md#134-instalar-el-plugin-en-wazuh-dashboard)).
5. Pasar las pruebas del repositorio:

   ```bash
   cd /opt/ensfacil/repo
   for t in tests/*.test.ts; do npx --yes tsx "$t" >/dev/null 2>&1 || echo "FALLA $t"; done
   python3 tests/check-consistency.py | tail -1
   ```

   Qué tiene que salir: ninguna línea `FALLA` y `coherencia OK`.

6. Recorrer las pantallas con datos reales: Panel, Configuración (guardar con y sin el rol `ensfacil_admin`), Controles, Detalle del control, Informes (un PDF), Evidencias y Eventos.

## 6. Criterios para declarar una versión compatible

Una versión nueva solo se añade a la tabla del apartado 2 cuando se ha demostrado que:

- [ ] el plugin compila contra esa versión de OpenSearch Dashboards;
- [ ] el zip se instala con `deploy-plugin.sh` sin tocar el plugin de Wazuh;
- [ ] Wazuh Dashboard arranca con los dos plugins;
- [ ] las pruebas del repositorio pasan;
- [ ] las pantallas de ENSFácil funcionan con datos reales;
- [ ] hay una vuelta atrás probada (retirar `ensfacil` o reinstalar la versión anterior).

## 7. Versiones no validadas

Una versión que no está en la tabla del apartado 2 está sin validar. No quiere decir que sea incompatible, sino que todavía no hay pruebas para autorizar el despliegue.

> [!important]
> Ante una versión sin validar, detener el procedimiento y hacer primero la evaluación del apartado 5.
