# Compatibilidad de versiones de ENSFácil
[English](03-version-compatibility.en.md)

[[_TOC_]]

## 1. Objetivo

Combinaciones de versiones validadas de ENSFácil y procedimiento previo al uso de otra versión de Wazuh.

ENSFácil (`ensfacil`) se compila para una versión **exacta** de OpenSearch Dashboards, la que lleva Wazuh Dashboard.

> [!important]
> Una versión es compatible solo cuando ENSFácil se ha compilado y validado para ella.

## 2. Versión validada

| ENSFácil | Wazuh | OpenSearch Dashboards | Despliegue validado |
|---|---|---|---|
| `1.0.0` | `4.14.7` | `2.19.5` | paquetes, todo en uno |
| `1.1.0` | `4.14.7` | `2.19.5` | paquetes, todo en uno; Docker, lado del plugin ([Wazuh en Docker](06-wazuh-in-docker.md#1-estado-de-la-verificación)) |

Cualquier otra combinación está sin validar.

> [!note]
> `1.2.0` se publica para la misma combinación que la `1.1.0` (Wazuh `4.14.7`, OpenSearch Dashboards `2.19.5`). Se añade a esta tabla cuando cumple en un entorno real los criterios del apartado 6.

OpenSearch Dashboards solo acepta un zip compilado para su versión exacta (`opensearchDashboardsVersion` del manifiesto):

- al instalarlo, `opensearch-dashboards-plugin install` lo rechaza con `Plugin ensfacil [2.19.5] is incompatible with OpenSearch Dashboards […]`;
- si ya estaba instalado y el dashboard cambia de versión, el dashboard **no arranca**: `Failed to initialize plugins`.

> [!note]
> En las releases, el zip se llama `ensfacil-<versión>-osd-<versión de OpenSearch Dashboards>.zip`, por ejemplo `ensfacil-1.2.0-osd-2.19.5.zip`: hay un zip por versión del dashboard. Cada release dice en su descripción con qué versión de Wazuh y de OpenSearch Dashboards es compatible ([Instalar desde una release](07-installing-from-a-release.md#21-compatibilidad)). Compilado desde el código fuente, el zip se llama `ensfacil-2.19.5.zip`.

## 3. Comprobar las versiones instaladas

### 3.1 Instalación por paquetes

```bash
dpkg-query -W -f='${Package} ${Version}\n' wazuh-manager wazuh-indexer wazuh-dashboard
sudo python3 -c 'import json; print(json.load(open("/usr/share/wazuh-dashboard/package.json"))["version"])'
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin list
```

Resultado esperado: los tres paquetes en `4.14.7-1`; `2.19.5`; en la lista de plugins, la versión instalada de ENSFácil (por ejemplo, `ensfacil@1.2.0`) y `wazuh@4.14.7-01`.

### 3.2 Docker

Desde la carpeta del `docker-compose.yml` oficial, con `<dashboard>` como nombre
del contenedor del dashboard (`docker ps --format '{{.Names}}'`):

```bash
docker compose ps --format '{{.Service}} {{.Image}}'
docker exec <dashboard> python3 -c 'import json; p=json.load(open("/usr/share/wazuh-dashboard/package.json")); print(p["version"], p["build"]["number"])'
docker exec <dashboard> /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin list
```

Resultado esperado:

- antes de instalar ENSFácil: `wazuh.dashboard` con
  `wazuh/wazuh-dashboard:4.14.7`, `2.19.5 414701` y sin `ensfacil` en la lista;
- con ENSFácil 1.1.0 instalado: `wazuh.indexer` y `wazuh.manager` con imágenes
  de etiqueta `4.14.7` y `wazuh.dashboard` con `wazuh-dashboard-ensfacil:1.1.0`;
  `2.19.5 424801`; en la lista de plugins, `ensfacil@1.1.0` y `wazuh@4.14.7-01`.
El `build.number` se explica en
[Wazuh en Docker, apartado 3](06-wazuh-in-docker.md#3-construir-la-imagen-del-dashboard-con-ensfácil).

## 4. Antes de actualizar Wazuh

Comprobar en las notas de versión o en el paquete de Wazuh Dashboard qué versión de OpenSearch Dashboards trae la versión nueva.

- **Misma versión de OpenSearch Dashboards (`2.19.5`):** el zip de ENSFácil es el mismo. Aun así, la combinación nueva está sin validar hasta completar el apartado 5 en un entorno de pruebas.
- **Otra versión de OpenSearch Dashboards:** hace falta un zip de ENSFácil compilado para ella. Sin ese zip, no actualizar el dashboard: con `ensfacil` instalado, no arrancaría. Si hay que actualizar igualmente, retirar antes ENSFácil ([diagnóstico y rollback, apartado 5](04-troubleshooting-and-rollback.md#5-retirar-ensfácil)).

En Docker, actualizar Wazuh cambia la imagen base del dashboard. La imagen de
ENSFácil se reconstruye sobre la nueva
([Wazuh en Docker, apartado 3](06-wazuh-in-docker.md#3-construir-la-imagen-del-dashboard-con-ensfácil))
solo si existe un zip para su versión de OpenSearch Dashboards; si no existe,
el servicio del dashboard vuelve a la imagen oficial antes de actualizar
([Wazuh en Docker, apartado 12.3](06-wazuh-in-docker.md#123-retirar-ensfácil)).

> [!warning]
> No hacer esta evaluación directamente en un entorno de producción.

## 5. Evaluar una versión nueva

En un entorno de pruebas:

1. Preparar el árbol de compilación de la versión nueva de Wazuh Dashboard, como en [Compilar desde el código fuente, apartado 3.2](08-building-from-source.md#32-preparar-el-árbol-de-opensearch-dashboards-2195), con su etiqueta.
2. Ajustar la versión de OpenSearch Dashboards en `package.json`, `opensearch_dashboards.json` y `config/build-plugin.sh`. Para publicarla con CI, también en `.gitlab-ci.yml` y en `ci/osd-builder.Dockerfile`.
3. Compilar con `config/build-plugin.sh` y validar el zip ([Compilar desde el código fuente, apartados 3.3 y 5](08-building-from-source.md#33-compilar-el-plugin)).
4. Instalar con `config/deploy-plugin.sh` y comprobar el servicio, la lista de plugins y la respuesta `401` de `/api/ensfacil/configuration` ([instalación desde cero, apartado 13.4](01-installation-from-scratch.md#134-instalar-el-plugin-en-wazuh-dashboard)).
5. Pasar las pruebas del repositorio:

   ```bash
   cd /opt/ensfacil/repo
   python3 tests/check-consistency.py
   for t in tests/*.test.ts; do timeout 180 npx --yes tsx "$t" >/dev/null 2>&1 && echo "OK   $t" || echo "FAIL $t"; done
   for s in tests/*.test.sh; do bash "$s" >/dev/null 2>&1 && echo "OK   $s" || echo "FAIL $s"; done
   ```

   Resultado esperado: `coherencia OK` y ninguna línea `FAIL`.

6. Recorrer las pantallas con datos reales: Panel, Vista general, Configuración (pestañas «Controles», «Agentes» y «General»; guardar con y sin el rol `ensfacil_admin`), Controles, Detalle del control, Informes (un PDF), Evidencias y Eventos.

## 6. Criterios para declarar una versión compatible

Una versión nueva solo se añade a la tabla del apartado 2 cuando se ha demostrado que:

- [ ] el plugin compila contra esa versión de OpenSearch Dashboards;
- [ ] el zip se instala con `deploy-plugin.sh` sin tocar el plugin de Wazuh;
- [ ] Wazuh Dashboard arranca con los dos plugins;
- [ ] las pruebas del repositorio pasan;
- [ ] las pantallas de ENSFácil funcionan con datos reales;
- [ ] hay una vuelta atrás probada (retirar `ensfacil` o reinstalar la versión anterior).

## 7. Versiones no validadas

Una versión ausente de la tabla del apartado 2 está sin validar.

> [!important]
> Ante una versión sin validar, detener el procedimiento y hacer primero la evaluación del apartado 5.
