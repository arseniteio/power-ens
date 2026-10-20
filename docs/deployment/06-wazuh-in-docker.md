# Wazuh en Docker
[English](06-wazuh-in-docker.en.md)

Procedimiento para desplegar ENSFácil cuando Wazuh se ejecuta con las imágenes
oficiales de Docker (`wazuh/wazuh-indexer`, `wazuh/wazuh-manager` y
`wazuh/wazuh-dashboard`) y el `docker compose` oficial de `wazuh-docker`.

Apartados 3 a 12: imagen del dashboard con ENSFácil, arranque, rol, configuración, siembra, validación, actualización, vuelta atrás y retirada. Apartado 13: diferencias con la [instalación desde cero](01-installation-from-scratch.md) cuando el manager se ejecuta en un contenedor.

> [!note]
> `deploy-plugin.sh` y los comandos con `systemctl`, `dpkg-query` y
> `/etc/wazuh-indexer/certs` de las guías 01, 02, 04 y 07 corresponden a la
> instalación por paquetes. En Docker se aplican los procedimientos de esta guía.

[[_TOC_]]

## 1. Estado de la verificación

| Parte | Estado |
|---|---|
| Imagen del dashboard con ENSFácil 1.1.0, arranque y comprobaciones (apartados 3 y 4) | verificado el 17/10/2026 |
| Rol `ensfacil_admin` desde un contenedor de la red del compose (apartado 5) | verificado el 17/10/2026 |
| Primer guardado y comprobación del documento `active` (apartado 6) | verificado el 17/10/2026 |
| Siembra de los 23 controles desde un contenedor (apartado 8) | verificado el 17/10/2026 |
| Validación con `node:22-alpine` (apartado 9) | verificado el 17/10/2026 |
| Copia y restauración del documento con la función `ix` (apartados 2.4, 7 y 12.2) y `set-parameters.py` desde un contenedor (apartado 10) | verificado el 17/10/2026 |
| Vuelta atrás por etiqueta (apartado 12.2) y retirada con la imagen oficial (apartado 12.3) | verificado el 17/10/2026 |
| Herramientas que faltan en la imagen del manager, su instalación con `dnf`, `install-manager.sh` de op.acc.1, op.exp.7, op.exp.8 y op.exp.9 con `ENSFACIL_SYSTEMCTL`, recolectores del manager con `docker exec` y `ENS_HOST`, copia de `/wazuh-config-mount` sobre `/var/ossec` en cada arranque | verificado el 02/10/2026 con la imagen `wazuh/wazuh-manager:4.14.7` en un contenedor aislado, sin indexer ni agentes |
| Lado del manager dentro del despliegue con `docker compose`: `install-manager.sh` con `ENSFACIL_SYSTEMCTL` en la imagen oficial, cron del host, `<localfile>` en `wazuh_manager.conf`, agentes | sin verificar |
| Clúster de varios nodos | sin verificar |
| El plugin en un despliegue real de cliente | sin verificar |

Entorno de las verificaciones del 17/10/2026: despliegue *single-node* oficial
de `wazuh-docker` v4.14.7 (indexer, manager y dashboard), certificados
generados con `generate-indexer-certs.yml`, en un portátil con las imágenes
amd64 en emulación.

## 2. Requisitos previos

### 2.1 El despliegue oficial de Wazuh

- Wazuh 4.14.7 desplegado con el `docker-compose.yml` oficial de `wazuh-docker`
  (por ejemplo, la carpeta `single-node`), con los certificados generados por
  `generate-indexer-certs.yml` en `config/wazuh_indexer_ssl_certs/`
  (`admin.pem`, `admin-key.pem`, `root-ca.pem`, `wazuh.indexer.pem`, entre otros).
- Docker con el plugin `compose`, un usuario con permiso para ejecutar
  `docker`, y acceso a Docker Hub para descargar `debian:12`,
  `python:3.12-slim` y `node:22-alpine`.
- Acceso por SSH autorizado al repositorio del plugin en GitLab, para clonarlo
  (apartado 2.3).
- Acceso a Internet desde los contenedores, para que `npx` descargue `tsx` en
  la validación (apartado 9).
- `unzip` en el host, para la comprobación `--solo-id` de la release
  (apartado 2.3).

Comprobar, desde la carpeta del compose, que los tres servicios están en marcha
con la versión 4.14.7:

```bash
docker compose ps --format '{{.Service}} {{.Image}} {{.State}}'
docker network ls --filter name=_default
```

Resultado esperado: `wazuh.indexer`, `wazuh.manager` y `wazuh.dashboard`, con
imágenes de etiqueta `4.14.7` y estado `running`, y la red del compose, que se
llama `<carpeta del compose>_default` (por ejemplo, `single-node_default`). Si
la versión es otra, detener el procedimiento y consultar la
[compatibilidad de versiones](03-version-compatibility.md).

> [!note]
> En hosts macOS, `generate-indexer-certs.yml` puede dejar sin copiar
> `root-ca-manager.pem` y `root-ca-manager.key`, y el compose no arranca. El
> síntoma y la solución están en el
> [diagnóstico, apartado 9.3](04-troubleshooting-and-rollback.md#93-problemas-conocidos-en-docker).

### 2.2 Marcadores de esta guía

| Marcador | Significado | Ejemplo |
|---|---|---|
| `<ruta>` | carpeta del `docker-compose.yml` oficial | `/srv/wazuh-docker/single-node` |
| `<proyecto>` | nombre del proyecto de compose, que es el de su carpeta; la red es `<proyecto>_default` | `single-node` |
| `<release>` | carpeta con los ficheros de la release de ENSFácil, comprobados con `SHA256SUMS` | `/opt/ensfacil/releases/1.1.0` |
| `<repo>` | clon del repositorio del plugin | `/opt/ensfacil/repo` |
| `<imagen>` | carpeta de trabajo para construir la imagen del dashboard | `/opt/ensfacil/imagen-1.1.0` |
| `<copias>` | carpeta de las copias del documento de configuración | `/opt/ensfacil/artifacts` |
| `<usuario>` | usuario del dashboard que administrará ENSFácil | `admin` |
| `MGR` | nombre del contenedor del manager (`docker ps --format '{{.Names}}'`) | `single-node-wazuh.manager-1` |

Los comandos `docker compose` se ejecutan desde `<ruta>`.

### 2.3 La release y el repositorio

La release de ENSFácil se descarga y se comprueba como en
[Instalar desde una release, apartados 4 a 7](07-installing-from-a-release.md#4-preparar-la-carpeta-en-el-servidor).
De sus cuatro ficheros, en Docker se usan el zip, `create-admin-role.sh` y
`SHA256SUMS`; `deploy-plugin.sh`, solo para la comprobación `--solo-id` del
apartado 7 de la guía 07, que necesita `unzip` en el host.

La siembra y la validación usan el repositorio del plugin (`config/` y el motor
que importa el validador). El acceso a GitLab se configura como en la
[instalación desde cero, apartado 10.1](01-installation-from-scratch.md#101-validar-el-acceso-al-repositorio-principal).

Las carpetas de trabajo de esta guía (`<repo>`, `<imagen>`, `<copias>`) están en
`/opt/ensfacil`, que el apartado 4 de la guía 07 crea como `root`. Asignarla al
usuario que ejecuta el procedimiento y clonar el repositorio:

```bash
sudo mkdir -p /opt/ensfacil
sudo chown "$USER":root /opt/ensfacil
git ls-remote git@gitlab.com:quersystem/plugin-wazuh-ens.git HEAD
git clone git@gitlab.com:quersystem/plugin-wazuh-ens.git <repo>
```

Resultado esperado: un hash seguido de `HEAD` y el repositorio clonado en
`<repo>`.

### 2.4 Función de consulta del indexer

El certificado del indexer está emitido para `wazuh.indexer`, que solo se resuelve dentro de la red del compose: las consultas al indexer se hacen desde un contenedor conectado a esa red.

La función `ix` envía una petición al indexer con el certificado de administrador y verifica el certificado del indexer contra `root-ca.pem`. Recibe la ruta y, opcionalmente, más opciones de curl. Definirla en la sesión del shell, con `<proyecto>` y `<ruta>` sustituidos:

```bash
ix() {
  docker run --rm -i --network <proyecto>_default \
    -v <ruta>/config/wazuh_indexer_ssl_certs:/certs:ro debian:12 bash -c '
      export DEBIAN_FRONTEND=noninteractive; apt-get -qq update </dev/null >/dev/null 2>&1 && apt-get -qq install -y curl </dev/null >/dev/null 2>&1 &&
      curl -s --cacert /certs/root-ca.pem --cert /certs/admin.pem --key /certs/admin-key.pem \
        "https://wazuh.indexer:9200/$1" "${@:2}"; echo' _ "$@"
}
```

La función se pierde al cerrar el shell: definirla de nuevo en cada sesión. Cada llamada instala `curl` en un contenedor nuevo (unos segundos).

## 3. Construir la imagen del dashboard con ENSFácil

Imagen propia basada en `wazuh/wazuh-dashboard:4.14.7`, con `ensfacil` instalado junto al plugin de Wazuh (sin modificarlo).

Preparar la carpeta de construcción con el zip de la release, renombrado a
`ensfacil-2.19.5.zip`:

```bash
mkdir -p <imagen>
cp <release>/ensfacil-1.1.0-osd-2.19.5.zip <imagen>/ensfacil-2.19.5.zip
```

Crear `<imagen>/Dockerfile` con este contenido:

```dockerfile
FROM wazuh/wazuh-dashboard:4.14.7
ARG ENSFACIL_VERSION
COPY --chown=wazuh-dashboard:wazuh-dashboard ensfacil-2.19.5.zip /tmp/ensfacil-2.19.5.zip
RUN /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin install file:///tmp/ensfacil-2.19.5.zip \
 && rm /tmp/ensfacil-2.19.5.zip
USER root
RUN python3 -c "import json,sys; f='/usr/share/wazuh-dashboard/package.json'; p=json.load(open(f)); v=[int(x) for x in sys.argv[1].split('.')]; p['build']['number']=str(int(p['build']['number'])+v[0]*10000+v[1]*100+v[2]); json.dump(p, open(f,'w'), indent=2); print('build.number', p['build']['number'])" "$ENSFACIL_VERSION"
USER wazuh-dashboard
```

El plugin se instala con el usuario `wazuh-dashboard` de la imagen, sin
`--allow-root` ni `chown`. Solo el cambio de `package.json` se hace como `root`.

Construir la imagen, con la versión de ENSFácil del zip en `ENSFACIL_VERSION` y
en la etiqueta, y comprobarla:

```bash
cd <imagen>
docker build --build-arg ENSFACIL_VERSION=1.1.0 -t wazuh-dashboard-ensfacil:1.1.0 .
docker run --rm --entrypoint /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin \
  wazuh-dashboard-ensfacil:1.1.0 list
docker run --rm --entrypoint python3 wazuh-dashboard-ensfacil:1.1.0 \
  -c "import json; print(json.load(open('/usr/share/wazuh-dashboard/package.json'))['build']['number'])"
```

Resultado esperado: la construcción termina sin errores; la lista de plugins
incluye `ensfacil@1.1.0` junto a `wazuh@4.14.7-01`; el `build.number` es
`424801`.

El `build.number` de la imagen es el de la oficial (`414701` en `wazuh/wazuh-dashboard:4.14.7`) más X·10000 + Y·100 + Z para la versión X.Y.Z de ENSFácil. Para 1.1.0: 414701 + 10000 + 100 + 0 = 424801. Sin `--build-arg ENSFACIL_VERSION`, la construcción falla.

> [!important]
> `ENSFACIL_VERSION` debe ser la versión del zip: con otro valor, dos imágenes con versiones distintas pueden compartir `build.number` y los navegadores usarían ficheros en caché.

## 4. Cambiar el compose y arrancar

En `<ruta>/docker-compose.yml`, cambiar la imagen del servicio
`wazuh.dashboard`:

```yaml
  wazuh.dashboard:
    image: wazuh-dashboard-ensfacil:1.1.0
```

Recrear el servicio y comprobar el arranque:

```bash
cd <ruta>
docker compose up -d
docker compose ps wazuh.dashboard
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/app/login
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/api/ensfacil/configuration
docker compose logs wazuh.dashboard | grep -o 'Setting up \[[0-9]*\] plugins: \[[^]]*\]' | tail -1
```

Resultado esperado:

| Comprobación | Resultado esperado |
|---|---|
| `docker compose ps` | `wazuh.dashboard` con la imagen `wazuh-dashboard-ensfacil:1.1.0` y estado `running` |
| `/app/login` | `200`, unos 20 segundos después de `docker compose up -d` |
| `/api/ensfacil/configuration` | `401`: el dashboard pide sesión. Sin sesión, la respuesta es `401` también sin el plugin: este valor es el esperado con el plugin instalado, pero no demuestra que haya cargado. Lo demuestran el registro del dashboard y la misma petición con sesión, que devuelve `200` |
| registro del dashboard | `Setting up [52] plugins: [...]`, con `ensfacil` en la lista |

Con una sesión iniciada en el navegador, `/api/ensfacil/configuration`
devuelve `200`. Antes del primer guardado, la respuesta empieza por
`{"configuration":null`.

Si alguna comprobación falla, detener el procedimiento y seguir el
[diagnóstico, apartado 9](04-troubleshooting-and-rollback.md#9-docker).

## 5. Crear el rol `ensfacil_admin`

Necesario solo si un usuario sin `all_access` debe guardar la configuración o consultar su historial (el usuario `admin` de Wazuh tiene `all_access`). El rol no concede otros permisos: cada usuario necesita además su rol de Wazuh con lectura de `wazuh-alerts-*` y `wazuh-monitoring-*`.

`create-admin-role.sh`, de la carpeta de la release, se ejecuta en un
contenedor conectado a la red del compose, con el certificado de administrador
del despliegue. Primero en modo prueba, que no envía ningún cambio:

```bash
docker run --rm --network <proyecto>_default \
  -v <ruta>/config/wazuh_indexer_ssl_certs:/certs:ro \
  -v <release>/create-admin-role.sh:/t/create-admin-role.sh:ro \
  -e OS_CERT=/certs/admin.pem -e OS_KEY=/certs/admin-key.pem -e OS_CA=/certs/root-ca.pem \
  -e OS_URL=https://wazuh.indexer:9200 debian:12 \
  bash -c 'export DEBIAN_FRONTEND=noninteractive; apt-get -qq update >/dev/null 2>&1 && apt-get -qq install -y curl python3 >/dev/null 2>&1 && bash /t/create-admin-role.sh --dry-run --mapear <usuario>'
```

El resultado siguiente corresponde a un rol que todavía no está asignado a
ningún usuario.

Resultado esperado:

```text
== dry-run mode: no change is sent
== role ensfacil_admin
PUT _plugins/_security/api/roles/ensfacil_admin {"description":"ENSFácil: puede cambiar la configuración ENS y ver su historial","cluster_permissions":[],"index_permissions":[],"tenant_permissions":[]}
== assignment of ensfacil_admin
PUT _plugins/_security/api/rolesmapping/ensfacil_admin {"users":["<usuario>"]}
```

Si el rol ya está asignado a otros usuarios, la última petición es un `PATCH`
que añade `<usuario>` sin retirar a ninguno.

Después, la ejecución real: el mismo comando con
`bash /t/create-admin-role.sh --mapear <usuario>` al final, sin `--dry-run`.

Resultado esperado: `-> 201` (o `-> 200` si el rol ya existía) después de cada
petición y, al final, `users with the role ensfacil_admin: <usuario>`.

- Repetible: solo se añaden los usuarios que falten.
- Varios usuarios: `--mapear <usuario1> --mapear <usuario2>`.
- Sin `--mapear`, el script solo crea el rol.
- Si un usuario con sesión abierta sigue recibiendo el error 403, cerrar la sesión e iniciar otra.

> [!note]
> Alternativa desde el host: una entrada `127.0.0.1 wazuh.indexer` en `/etc/hosts` permite usar `OS_URL=https://wazuh.indexer:9200` con el puerto `9200` publicado por el compose. En un clúster de varios nodos, el nombre es el del nodo del indexer que figura en su certificado
> (`openssl x509 -in <ruta>/config/wazuh_indexer_ssl_certs/wazuh.indexer.pem -noout -ext subjectAltName`).

## 6. Primer guardado de la configuración

En una instalación nueva, el documento `active` del índice
`wazuh-ens-configuration` no existe hasta el primer guardado. Hasta entonces,
`inject-control.py` se detiene con el mensaje `ERROR: document 'active' does not exist in index
'wazuh-ens-configuration'.`, que termina con «save the configuration once and run again.».

Entrar en Wazuh Dashboard con un usuario con `ensfacil_admin` o `all_access`,
abrir ENSFácil > Configuración y guardar la configuración una vez. Abrir la
pantalla sin guardar no crea el documento.

Comprobar que el documento existe:

```bash
ix 'wazuh-ens-configuration/_doc/active?filter_path=found,_source.documentType'
```

Resultado esperado: `{"found":true,"_source":{"documentType":"ACTIVE_CONFIGURATION"}}`.

> [!warning]
> Si el documento no existe, no continuar con la siembra hasta completar el
> primer guardado.

## 7. Copiar el documento `active`

Antes de cada siembra o cambio de parámetros, guardar una copia del documento:

```bash
mkdir -p <copias>
COPIA=<copias>/active-$(date +%Y%m%d-%H%M%S).json
ix wazuh-ens-configuration/_doc/active > "$COPIA"
grep -c '"found":true' "$COPIA"
ix wazuh-ens-configuration/_doc/maturity > "${COPIA/active-/maturity-}"
```

Resultado esperado: `1`, y la copia de la madurez registrada (desde la 1.4.0; `"found":false` si no hay). La restauración de esta copia en Docker se describe en
el apartado 12.2.

## 8. Sembrar los controles

> [!important]
> Sembrar solo con la imagen de ENSFácil ya desplegada (apartado 4).

`inject-control.py` se ejecuta en un contenedor `python:3.12-slim` conectado a
la red del compose, con la carpeta `config/` del repositorio montada en solo
lectura. Para un control, sin `--apply` muestra el plan y con `--apply` escribe.
El plan de un control:

```bash
docker run --rm --network <proyecto>_default \
  -v <ruta>/config/wazuh_indexer_ssl_certs:/certs:ro -v <repo>/config:/cfg:ro \
  -e OS_CERT=/certs/admin.pem -e OS_KEY=/certs/admin-key.pem -e OS_CA=/certs/root-ca.pem \
  -e ENS_OS_URL=https://wazuh.indexer:9200 -w /cfg python:3.12-slim \
  python3 inject-control.py <control>
```

Resultado esperado: el plan del control y, al final, `== DRY-RUN ==`.

Sembrar los 23 controles. Primero el plan, sin `--apply`, que no escribe nada:

```bash
CONTROLS="mp.info.6 op.acc.1 op.acc.2 op.acc.3 op.acc.4 op.acc.5 op.acc.6 op.exp.1 op.exp.2 op.exp.3 op.exp.4 op.exp.5 op.exp.6 op.exp.7 op.exp.8 op.exp.9 op.exp.10 op.mon.1 op.mon.2 op.mon.3 op.nub.1 op.cont.2 op.cont.3"

for c in $CONTROLS; do
  echo "===== $c ====="
  docker run --rm --network <proyecto>_default \
    -v <ruta>/config/wazuh_indexer_ssl_certs:/certs:ro -v <repo>/config:/cfg:ro \
    -e OS_CERT=/certs/admin.pem -e OS_KEY=/certs/admin-key.pem -e OS_CA=/certs/root-ca.pem \
    -e ENS_OS_URL=https://wazuh.indexer:9200 -w /cfg python:3.12-slim \
    python3 inject-control.py "$c" || break
done
```

Revisar el plan de cada control: parámetros nuevos, valores que se conservan y,
si aparece, la línea `NO LONGER IN THE BLOCK and lost`. Si el plan es
correcto, repetir el bucle con `python3 inject-control.py "$c" --apply`.

Resultado esperado: `== APPLIED ==` en cada control.

La siembra fusiona: conserva el valor de cada parámetro que ya tenía uno y añade
los que faltan. Conserva también los ajustes de los agentes (`configuration.agents`) y
las plantillas propias (`configuration.templates`).

Con ENSFácil 1.3.0 o posterior, un control que el documento no tiene se puede
añadir también desde ENSFácil > Configuración > Controles, con «Añadir con
valores por defecto» ([Configuración por controles y plantillas, apartado 5.1](09-configuration-by-system.md#51-añadir-un-control-del-catálogo)).

> [!note]
> Las evidencias que dependen de parámetros obligatorios sin valor quedan en `NO_EVALUABLE`, con causa `CONFIGURATION`, y sus requisitos no se acreditan hasta declararlos.

## 9. Validar el documento

Un valor que el plugin no acepta impide cargar el entorno ENS completo («No se pudo cargar el entorno ENS»). Tras cada siembra o cambio de parámetros, validar el documento entero con `config/validate-configuration.ts`, que necesita el repositorio completo (importa el motor del plugin); la orden instala antes las dependencias en `node_modules/`.

```bash
ix wazuh-ens-configuration/_doc/active > <repo>/active.json
docker run --rm -v <repo>:/w -w /w node:22-alpine \
  sh -c 'npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive && npx --yes tsx config/validate-configuration.ts /w/active.json'
```

Resultado esperado: `controls (23): mp.info.6 op.acc.1 …`,
`VALID STRUCTURE: the plugin will load this configuration.` y, con ajustes de
agentes, una línea por agente; al final, `VALID AGENT AND TEMPLATE SETTINGS.`

Un `scope` sin las listas `agentIds` y `groupIds` se rechaza (`configuration.scope.agentIds must be a string array`); solo ocurre en un documento escrito a mano.

> [!warning]
> Si la validación falla, restaurar la copia del apartado 7 (apartado 12.2)
> antes de abrir el panel, y corregir el parámetro indicado.

`<repo>/active.json` puede borrarse después de la validación.

## 10. Declarar la política: niveles de las dimensiones

Los valores de los parámetros se declaran en ENSFácil > Configuración. En la tarjeta de configuración global se declaran también:

| Campo | Controles | Sin declarar |
|---|---|---|
| Nivel ENS | todos | — |
| Nivel de Confidencialidad (C) | op.acc.2 a op.acc.6 | se usa el nivel ENS |
| Nivel de Integridad (I) | op.acc.2 a op.acc.6 | se usa el nivel ENS |
| Nivel de Trazabilidad (T) | op.acc.1 a op.acc.6 y op.exp.8 | se usa el nivel ENS |
| Nivel de Autenticidad (A) | op.acc.1 a op.acc.6 | se usa el nivel ENS |
| Nivel de Disponibilidad (D) | mp.info.6, op.cont.2 y op.cont.3 (estos dos solo aplican con D en ALTO) | se usa el nivel ENS |

Un control con varias dimensiones se evalúa con la más alta de ellas. Ninguna dimensión puede superar el nivel ENS.

Con el nivel ENS en MEDIO y sin declarar D, op.cont.2 y op.cont.3 muestran
«No aplica».

Para declarar valores de parámetros desde un fichero JSON, `set-parameters.py`
se ejecuta como `inject-control.py`, con la carpeta del fichero montada:

```bash
docker run --rm --network <proyecto>_default \
  -v <ruta>/config/wazuh_indexer_ssl_certs:/certs:ro -v <repo>/config:/cfg:ro \
  -v <carpeta de la política>:/pol:ro \
  -e OS_CERT=/certs/admin.pem -e OS_KEY=/certs/admin-key.pem \
  -e ENS_OS_URL=https://wazuh.indexer:9200 -w /cfg python:3.12-slim \
  python3 set-parameters.py /pol/politica.json
```

Sin `--apply` muestra el plan; con `--apply` escribe.

Resultado esperado: los cambios por parámetro y `DRY-RUN: nothing written`; con
`--apply`, `<n> change(s) written to wazuh-ens-configuration/active`.

El formato del fichero y sus reglas están en la
[instalación desde cero, apartado 14.5](01-installation-from-scratch.md#145-declarar-la-política).
Para la sección `agents` (plantilla y ajustes propios de un agente), montar el repositorio
completo, `-v <repo>:/repo:ro -w /repo/config`, en lugar de `<repo>/config`: la
herramienta lee la clasificación de los parámetros de `public/`
([Configuración por controles y plantillas, apartado 11.1](09-configuration-by-system.md#111-declarar-la-plantilla-y-los-ajustes-de-un-agente-con-set-parameterspy)).
Después de declarar valores, repetir la copia (apartado 7) antes y la
validación (apartado 9) después.

Los datos de la organización (sección `organization` y parámetros como op.acc.1
P-11 u op.exp.4 P-06) también necesitan el repositorio completo montado: la
herramienta lee los datos de `common/`. Sin él, escribe solo el parámetro, avisa
con `WARNING: cannot read the organisation data items` y el plugin muestra el
conflicto en General
([Configuración por controles y plantillas, apartado 11.4](09-configuration-by-system.md#114-declarar-datos-de-la-organización-con-set-parameterspy)).

## 11. Comprobación final en el navegador

Entrar en Wazuh Dashboard y comprobar que:

- en el menú, dentro de «Security operations», aparece «ENSFácil»;
- se abre en la pestaña Panel, con las pestañas Panel, Configuración,
  Controles, Detalle del control, Informes, Evidencias y Eventos;
- aparecen los 23 controles;
- hay un selector «Máquina» para ver todas las máquinas del alcance o una sola.

Los controles que se miden en el manager (apartado 13) muestran datos en la
fila del manager (agente `000`) después de la primera ejecución de sus
recolectores. Los agentes, los grupos y el alcance ENS se configuran con la
[configuración inicial de ENSFácil](https://gitlab.com/quersystem/ens-controls-runbook/initial-setup).

## 12. Actualizar, volver atrás y retirar

Cada versión de ENSFácil es una imagen con su etiqueta. Instalar, actualizar o retirar la imagen no modifica los índices: se conservan la configuración ENS, su historial y los hechos.

### 12.1 Actualizar a una versión nueva

1. Leer las notas de la release nueva: compatibilidad, controles y parámetros
   nuevos.
2. Descargar y comprobar la release en su propia carpeta
   ([Instalar desde una release, apartados 4 a 7](07-installing-from-a-release.md#4-preparar-la-carpeta-en-el-servidor)).
3. Copiar el documento `active` (apartado 7).
4. Construir la imagen nueva como en el apartado 3, con la versión nueva en el
   nombre del zip de origen, en `ENSFACIL_VERSION` y en la etiqueta. Por
   ejemplo, para X.Y.Z:

   ```bash
   mkdir -p <imagen nueva>
   cp <imagen>/Dockerfile <imagen nueva>/
   cp <release nueva>/ensfacil-X.Y.Z-osd-2.19.5.zip <imagen nueva>/ensfacil-2.19.5.zip
   cd <imagen nueva>
   docker build --build-arg ENSFACIL_VERSION=X.Y.Z -t wazuh-dashboard-ensfacil:X.Y.Z .
   ```

   Resultado esperado: el del apartado 3, con `ensfacil@X.Y.Z` y
   `build.number` = 414701 + X·10000 + Y·100 + Z.

5. Cambiar la etiqueta en `docker-compose.yml`
   (`image: wazuh-dashboard-ensfacil:X.Y.Z`), ejecutar `docker compose up -d` y
   comprobar como en el apartado 4. La lista de plugins de la imagen nueva debe
   indicar `ensfacil@X.Y.Z`.
6. Si la versión trae controles o parámetros nuevos, sembrarlos después de
   desplegar (apartado 8) y validar el documento (apartado 9).
7. Revisar los niveles de las dimensiones (apartado 10).

La imagen anterior se conserva hasta validar la nueva: es la vuelta atrás.

### 12.2 Volver a la versión anterior

Cambiar la etiqueta en `docker-compose.yml` por la de la versión anterior y
recrear el servicio:

```bash
docker image ls wazuh-dashboard-ensfacil
cd <ruta>
docker compose up -d
```

Resultado esperado: la etiqueta anterior aparece en la lista de imágenes, y las
comprobaciones del apartado 4 dan el mismo resultado con la versión anterior.
Si la imagen anterior ya no existe, construirla de nuevo (apartado 3) con su
release.

Si la versión retirada sembró controles que la anterior no conoce, restaurar
también la copia del documento `active` hecha antes de la actualización. Se
reescribe el `_source` de la copia:

```bash
COPIA=<copias>/active-AAAAMMDD-HHMMSS.json
docker run --rm -i python:3.12-slim \
  python3 -c "import json,sys; json.dump(json.load(sys.stdin)['_source'], sys.stdout, ensure_ascii=False)" \
  < "$COPIA" > <copias>/active-restore.json
ix wazuh-ens-configuration/_doc/active -H 'Content-Type: application/json' -X PUT --data-binary @- \
  < <copias>/active-restore.json
```

Resultado esperado: la respuesta incluye `"result":"updated"`. Después, validar
el documento (apartado 9) y recargar el panel.

### 12.3 Retirar ENSFácil

Volver a la imagen oficial en `docker-compose.yml`
(`image: wazuh/wazuh-dashboard:4.14.7`) y recrear el servicio:

```bash
cd <ruta>
docker compose up -d
```

Resultado esperado: «ENSFácil» ya no aparece en el menú del dashboard.
Comprobación equivalente desde el host, con sesión: tras
`curl -sk -c cj -X POST https://localhost/auth/login -H 'osd-xsrf: true' -H 'Content-Type: application/json' -d '{"username":"<usuario>","password":"<contraseña>"}'`,
`curl -sk -b cj -o /dev/null -w '%{http_code}\n' https://localhost/api/ensfacil/configuration`
devuelve `404` (con el plugin instalado devuelve `200`). Sin sesión, la
respuesta es `401` en los dos casos y no sirve como comprobación. El fichero
`cj` contiene la sesión y se borra después.

El plugin de Wazuh es el de la imagen oficial y no se ve afectado.

Si ENSFácil no se va a volver a usar en este entorno, eliminar la configuración ENS (índice `wazuh-ens-configuration`) y el rol `ensfacil_admin`. Esto borra la configuración y su historial: antes, guardar una copia del documento (apartado 7). No ejecutar este paso si otra instalación usa el mismo indexer.

```bash
ix _plugins/_security/api/rolesmapping/ensfacil_admin -X DELETE
ix _plugins/_security/api/roles/ensfacil_admin -X DELETE
ix wazuh-ens-configuration -X DELETE
docker image rm wazuh-dashboard-ensfacil:1.1.0
```

Resultado esperado: `"status":"OK"` en las dos primeras (en la primera,
`NOT_FOUND` si el rol no tenía usuarios), `"acknowledged":true` en la tercera y
la imagen eliminada. Los hechos se conservan en `wazuh-alerts-*` y caducan con
la retención de esos índices.

## 13. Lado del manager

Reglas y recolectores del manager: `install-manager.sh` de los runbooks, en el contenedor del manager. Diferencias con la [instalación desde cero, apartados 10 a 12](01-installation-from-scratch.md#10-configurar-el-acceso-autorizado-a-gitlab). Lo verificado y lo pendiente está en el apartado 1: dentro del despliegue con `docker compose`, este apartado está sin verificar.

### 13.1 Lo que falta en la imagen del manager

| Falta | Quién lo usa | Efecto | Solución |
|---|---|---|---|
| `systemctl` | los `install-manager.sh`, para reiniciar el manager | el instalador falla al reiniciar y deshace su cambio | `ENSFACIL_SYSTEMCTL` (apartado 13.5) |
| `flock` | el emisor común de todos los recolectores | no se escribe ningún hecho: el emisor termina con error | paquete `util-linux-core` |
| `jq` | los `install-manager.sh` de op.exp.7, op.exp.8, op.exp.9, op.mon.1, op.mon.2, op.mon.3, op.nub.1 y op.cont.3, y el emisor | el instalador se detiene. El de op.exp.7 intenta instalar `jq` con `apt-get` y los demás indican `apt-get install jq`; la imagen usa `dnf` | paquete `jq` |
| `hostname` | el emisor (campo `host` de cada hecho) | `host` queda vacío | paquete `hostname`, o `ENS_HOST` (apartado 13.6) |
| `cron` | los recolectores del manager (op.exp.7, op.exp.8, op.exp.9, op.mon.1, op.mon.2, op.mon.3, op.nub.1 y op.cont.3) | no se ejecutan | cron del host con `docker exec` (apartado 13.7) |
| `git` | la clonación de los runbooks | — | clonar en el host y copiar al contenedor (apartado 13.5) |

`python3` está en la imagen. Los `install-manager.sh` de op.mon.1 y op.cont.3
usan `sqlite3` o, si no está, el módulo `sqlite3` de `python3`; sin ninguno de
los dos, parte de sus evidencias queda en `NO_EVALUABLE`. Comprobarlo (sin
verificar en la imagen):

```bash
docker exec MGR python3 -c 'import sqlite3; print("SQLITE3=OK")'
```

Resultado esperado: `SQLITE3=OK`.

### 13.2 Imagen del manager con las herramientas

Lo instalado con `dnf` en un contenedor se pierde al recrearlo: fijar las herramientas en una imagen propia, con la versión de la oficial:

```dockerfile
FROM wazuh/wazuh-manager:4.14.7
RUN dnf install -y jq util-linux-core hostname && dnf clean all
```

En `docker-compose.yml`, el servicio `wazuh.manager` pasa a usar esa imagen.

Alternativa temporal, sin reconstruir la imagen. Los cambios se pierden al
recrear el contenedor:

```bash
docker exec MGR dnf install -y jq util-linux-core hostname
docker exec MGR sh -c 'command -v jq flock hostname'
```

Resultado esperado: las rutas de `jq`, `flock` y `hostname`.

### 13.3 Persistencia al recrear el contenedor

El despliegue oficial monta volúmenes en `/var/ossec/etc`, `/var/ossec/logs`,
`/var/ossec/queue`, `/var/ossec/api/configuration`,
`/var/ossec/var/multigroups`, `/var/ossec/integrations`,
`/var/ossec/active-response/bin`, `/var/ossec/agentless`, `/var/ossec/wodles`,
`/etc/filebeat` y `/var/lib/filebeat`.

| Ruta | Contenido | Persiste |
|---|---|---|
| `/var/ossec/etc/rules/ensfacil_*.xml` | reglas de los 22 controles con reglas | sí, en el volumen de `/var/ossec/etc` |
| `/var/ossec/etc/shared/ens/agent.conf`, `…/ens-copias/agent.conf` | `<localfile>` de los agentes | sí |
| `/var/ossec/etc/ossec.conf` | `<localfile>` del manager (los ocho recolectores del manager) | no, si se monta `wazuh_manager.conf` (apartado 13.4) |
| `/etc/ensfacil/` | registros de la organización y `.env` | no: montar un volumen |
| `/var/lib/ensfacil/` | estado de los recolectores | no: montar un volumen |
| `/var/log/ensfacil/` | ficheros de hechos que lee logcollector | no: montar un volumen |
| `/opt/ensfacil-runbooks/` | copia de los runbooks (apartado 13.5) | no |
| `/opt/ensfacil/`, `/usr/local/bin/ens_op*` | librerías, plantillas y recolectores | no |
| `/var/ossec/backup/` | copias que hacen los instaladores antes de cada cambio | no (opcional: montar un volumen) |

```yaml
# docker-compose.yml, servicio wazuh.manager (añadir a sus volumes)
      - ensfacil_etc:/etc/ensfacil
      - ensfacil_state:/var/lib/ensfacil
      - ensfacil_log:/var/log/ensfacil
# y declarar ensfacil_etc, ensfacil_state y ensfacil_log en la sección volumes:
```

Después de recrear el contenedor, repetir la copia de los runbooks y los
`install-manager.sh` (apartado 13.5). Los instaladores no sobrescriben `.env`
ni los registros de la organización.

### 13.4 Los `<localfile>` en `wazuh_manager.conf`

El despliegue oficial monta `config/wazuh_cluster/wazuh_manager.conf` en `/wazuh-config-mount/etc/ossec.conf` y el arranque de la imagen lo copia sobre `/var/ossec/etc/ossec.conf`: los `<localfile>` que añaden los `install-manager.sh` desaparecen en el siguiente arranque y esos controles se quedan sin datos.

Antes de ejecutar los instaladores, añadir este bloque al final de
`<ruta>/config/wazuh_cluster/wazuh_manager.conf`, en el host:

```xml
<!-- ENSFácil: hechos de los recolectores del manager -->
<ossec_config>
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/ensfacil/op_exp_7.json</location>
  </localfile>
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/ensfacil/op_exp_8.json</location>
  </localfile>
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/ensfacil/op_exp_9.json</location>
  </localfile>
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/ensfacil/op_mon_1.json</location>
  </localfile>
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/ensfacil/op_mon_2.json</location>
  </localfile>
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/ensfacil/op_mon_3.json</location>
  </localfile>
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/ensfacil/op_nub_1.json</location>
  </localfile>
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/ensfacil/op_cont_3.json</location>
  </localfile>
</ossec_config>
```

Aplicar el fichero reiniciando el contenedor del manager:

```bash
cd <ruta>
docker compose restart wazuh.manager
docker exec MGR grep -c 'ENSFácil: hechos de los recolectores del manager' /var/ossec/etc/ossec.conf
```

Resultado esperado: `1`.

Cada `install-manager.sh` comprueba si su `<location>` ya está en `ossec.conf`
y, si está, no lo añade de nuevo (mensaje «el localfile de … ya está en …»). Con
el bloque ya aplicado, los instaladores no duplican la lectura de ningún
fichero.

A partir de aquí, para reiniciar el manager se usa
`docker exec MGR /var/ossec/bin/wazuh-control restart`. Un reinicio del
contenedor (`docker restart` o `docker compose restart`) vuelve a copiar
`wazuh_manager.conf` y descarta cualquier cambio de `ossec.conf` que no esté en
ese fichero.

### 13.5 Grupos, copia previa e instaladores sin systemd

Los runbooks se clonan en el host, en `/opt/ensfacil`, con el fichero
`/opt/ensfacil/runbooks.txt`, como en la
[instalación desde cero, apartados 10.3 y 10.4](01-installation-from-scratch.md#103-clonar-los-runbooks-ens).

Crear los grupos `ens` y `ens-copias` y comprobar sus `agent.conf`:

```bash
docker exec MGR /var/ossec/bin/agent_groups -a -g ens -q
docker exec MGR /var/ossec/bin/agent_groups -a -g ens-copias -q
docker exec MGR grep -c '<agent_config' /var/ossec/etc/shared/ens/agent.conf
docker exec MGR grep -c '<agent_config' /var/ossec/etc/shared/ens-copias/agent.conf
```

Resultado esperado: `1` en las dos comprobaciones. Los `install-manager.sh` se
niegan a modificar un `agent.conf` sin bloque `<agent_config>` o con más de uno
([instalación desde cero, apartado 11](01-installation-from-scratch.md#11-crear-y-validar-el-grupo-ens)).

Guardar una copia de la configuración del manager en el host:

```bash
mkdir -p <copias>
docker exec MGR tar czf - -C /var/ossec etc/rules etc/decoders etc/shared/ens etc/shared/ens-copias etc/ossec.conf \
  > <copias>/manager-$(date +%Y%m%d-%H%M%S).tar.gz
```

Resultado esperado: el fichero `.tar.gz` en `<copias>`, sin mensajes de error.

Copiar al contenedor solo las carpetas de los runbooks de `runbooks.txt`:

```bash
docker exec MGR mkdir -p /opt/ensfacil-runbooks
while read -r r; do
  docker cp "/opt/ensfacil/$r/." "MGR:/opt/ensfacil-runbooks/$r" || { echo "ERROR: $r"; break; }
done < /opt/ensfacil/runbooks.txt
```

Resultado esperado: ninguna línea `ERROR`.

Los `install-manager.sh` leen `SYSTEMCTL="${ENSFACIL_SYSTEMCTL:-systemctl}"` y solo lo usan para `"$SYSTEMCTL" restart wazuh-manager`, también en su vuelta atrás. `wazuh-control restart wazuh-manager` ignora el segundo argumento, reinicia todos los demonios y devuelve error si la configuración no es válida o un demonio no arranca. Los scripts no se modifican: basta con la variable.

```bash
while read -r r; do
  echo "===== $r ====="
  docker exec -e ENSFACIL_SYSTEMCTL=/var/ossec/bin/wazuh-control MGR \
    bash "/opt/ensfacil-runbooks/$r/install-manager.sh" || { echo "ERROR: $r"; break; }
done < /opt/ensfacil/runbooks.txt
```

Resultado esperado: ninguna línea `ERROR`. Cada instalador termina con su
comprobación de `wazuh-logtest`.

### 13.6 El nombre de máquina sin el comando `hostname`

El emisor común (`/opt/ensfacil/ensfacil-emit.sh`) toma el campo `host` de
`ENS_HOST` y, si no está definida, de `$(hostname)`. Hay dos opciones:

- con la imagen del apartado 13.2 (`hostname` instalado), el valor es el nombre
  del contenedor. Se recomienda fijarlo con `hostname:` en el
  `docker-compose.yml` (el oficial usa `wazuh.manager`) para que no cambie al
  recrear el contenedor;
- pasar `-e ENS_HOST=<nombre>` en cada `docker exec` (apartado 13.7).

Los recolectores del manager no tienen otra llamada a `hostname`. La única
excepción: op.exp.9 reconoce el propio manager en la columna `sistemas` del
registro de incidentes por el nombre del contenedor (`socket.gethostname()` de
Python). Un `hostname:` fijo mantiene ese valor estable.

### 13.7 Planificar los recolectores desde el host

La imagen no tiene cron: los ficheros que los `install-manager.sh` dejan en `/etc/cron.d/` del contenedor no se ejecutan. Planificar los recolectores en el cron del host, con las cadencias de los runbooks:

```bash
# /etc/cron.d/ensfacil-manager en el HOST (sustituir MGR y el nombre)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
23 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp7_collect.sh >/dev/null 2>&1
47 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp8_manager_collect.sh >/dev/null 2>&1
23 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp9_manager_collect.sh >/dev/null 2>&1
31 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opmon1_collect.sh >/dev/null 2>&1
5 */6 * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opmon2_collect.sh >/dev/null 2>&1
33 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opmon3_collect.sh >/dev/null 2>&1
37 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opnub1_collect.sh >/dev/null 2>&1
5 */6 * * * root docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opcont3_collect.sh >/dev/null 2>&1
```

Primera pasada, a mano. La de op.exp.7 siembra 30 días de alertas y tarda unos
minutos:

```bash
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp7_collect.sh
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp8_manager_collect.sh
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opexp9_manager_collect.sh
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opmon1_collect.sh
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opmon2_collect.sh
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opmon3_collect.sh
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opnub1_collect.sh
docker exec -e ENS_HOST=wazuh.manager MGR /usr/local/bin/ens_opcont3_collect.sh
docker exec MGR sh -c 'wc -l /var/log/ensfacil/op_*.json'
```

Resultado esperado: un recuento de líneas mayor que `0` en cada fichero
`op_*.json`.

Si se activa el puente opcional de op.exp.4 (`--con-puente-vd`), su línea en el
cron del host es
`40 * * * * root docker exec -e ENS_HOST=wazuh.manager MGR /opt/ensfacil/ens_opexp4_vd_bridge.py >>/var/log/ensfacil/opexp4-vd-bridge.log 2>&1`
(sin verificar en contenedor).

### 13.8 Comprobar las reglas

```bash
docker exec MGR /var/ossec/bin/wazuh-control status | grep -E 'analysisd|logcollector|remoted'
docker exec MGR /var/ossec/bin/wazuh-analysisd -t && echo "CONFIG_MANAGER=OK"
cd /opt/ensfacil/repo && python3 tests/check-consistency.py | tail -1
```

Resultado esperado: `wazuh-analysisd is running...`,
`wazuh-logcollector is running...` y `wazuh-remoted is running...`;
`CONFIG_MANAGER=OK`; `consistency OK`. `check-consistency.py` se ejecuta en el
host, con el repositorio en `/opt/ensfacil/repo` y los runbooks clonados junto
a él.

La regla que cada instalador confirma con `wazuh-logtest` está en la tabla de la
[instalación desde cero, apartado 12.1](01-installation-from-scratch.md#121-validar-la-instalación-de-las-reglas).
Para comprobar una regla a mano: `docker exec -it MGR /var/ossec/bin/wazuh-logtest`.

Si un `install-manager.sh` falla después de copiar sus reglas, al repetirlo no
detecta cambios y no reinicia el manager. En ese caso, reiniciar con
`docker exec MGR /var/ossec/bin/wazuh-control restart` y confirmar la regla con
`wazuh-logtest`.

## 14. Limitaciones conocidas en contenedor

- **Recolector de agente de op.mon.3.** Además del recolector del manager, el
  `install.sh` de op.mon.3 instala `ens_opmon3_agent_collect.sh` con un cron
  horario en cada máquina del grupo `ens`. Se ejecuta en la máquina auditada,
  no en el contenedor del manager.
- **op.exp.8 EV-13** (servicios del sistema de registro). El recolector consulta
  a systemd el estado de `wazuh-manager`, `wazuh-indexer` y `wazuh-dashboard`.
  En el contenedor no hay systemd: emite `activo=desconocido`, que el panel
  juzga `NO_CUMPLE`. Ninguna variable lo evita; queda pendiente de adaptar el
  recolector. No se debe simular `systemctl`: produciría una evidencia falsa.
- **op.exp.8 en la fila del manager.** Mide también el propio servidor (auditd,
  journald, hora). En el contenedor no hay auditd y el resultado es «no
  instalado». Qué debe medirse en el host que ejecuta Docker está sin
  verificar.
- **Clúster de varios nodos.** Sin verificar. Las reglas y los `agent.conf` se
  sincronizan desde el maestro; los recolectores del manager y sus
  `<localfile>` irían en el maestro.
