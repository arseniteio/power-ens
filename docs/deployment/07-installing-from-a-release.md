# Instalar ENSFácil desde una release
[English](07-installing-from-a-release.en.md)

[[_TOC_]]

## 1. Objetivo

Esta guía instala o actualiza el plugin ENSFácil con los ficheros de una release
de GitLab, sin compilar y sin el código fuente.

Es la forma recomendada. Para compilar el zip, véase
[Compilar desde el código fuente](08-building-from-source.md).

> [!note]
> La instalación de los apartados 8 a 15 corresponde a la instalación por
> paquetes (systemd). Con Wazuh en Docker, la descarga y la comprobación de la
> release (apartados 2 a 7) son las mismas, y el resto del procedimiento está
> en [Wazuh en Docker](06-wazuh-in-docker.md).

> [!note]
> La release instala el plugin, que evalúa los hechos. Los hechos los recogen
> las reglas del manager y los runbooks de cada máquina, que se instalan por
> separado (apartado 14).

## 2. Qué es una release

Cada versión publicada de ENSFácil tiene una release en GitLab, con el nombre
`ENSFácil X.Y.Z` y la etiqueta `vX.Y.Z`. Contiene cuatro ficheros:

| Fichero | Contenido |
|---|---|
| `ensfacil-X.Y.Z-osd-2.19.5.zip` | el plugin, compilado para OpenSearch Dashboards 2.19.5 |
| `deploy-plugin.sh` | el script que instala el zip en Wazuh Dashboard |
| `create-admin-role.sh` | el script que crea el rol `ensfacil_admin` y lo asigna |
| `SHA256SUMS` | la suma SHA-256 de los otros tres ficheros |

La descripción de la release contiene las notas de esa versión (su entrada del
[registro de cambios](../../CHANGELOG.md)), la compatibilidad, las órdenes
rápidas de instalación, un enlace a esta guía y el SHA-256 del zip.

### 2.1 Compatibilidad

Cada zip sirve para una sola versión de OpenSearch Dashboards, la que figura en
el nombre (`-osd-2.19.5`). OpenSearch Dashboards solo acepta un plugin
compilado para su versión exacta.

| ENSFácil | Wazuh | OpenSearch Dashboards | Fichero |
|---|---|---|---|
| `1.0.0` | `4.14.7` | `2.19.5` | `ensfacil-1.0.0-osd-2.19.5.zip` |
| `1.1.0` | `4.14.7` | `2.19.5` | `ensfacil-1.1.0-osd-2.19.5.zip` |
| `1.2.0` | `4.14.7` | `2.19.5` | `ensfacil-1.2.0-osd-2.19.5.zip` |

Las combinaciones validadas se mantienen en
[Compatibilidad de versiones](03-version-compatibility.md#2-versión-validada).
La descripción de cada release indica su compatibilidad. Antes de la descarga,
comprobar la versión instalada:

```bash
dpkg-query -W -f='${Package} ${Version}\n' wazuh-dashboard
sudo python3 -c 'import json; print(json.load(open("/usr/share/wazuh-dashboard/package.json"))["version"])'
```

Resultado esperado: `wazuh-dashboard 4.14.7-1` y `2.19.5`. Si la versión es
otra, detener el procedimiento y consultar la
[compatibilidad de versiones](03-version-compatibility.md). En Docker, la
comprobación previa a la instalación está en
[Wazuh en Docker, apartado 2.1](06-wazuh-in-docker.md#21-el-despliegue-oficial-de-wazuh).

## 3. Dónde están las releases

El proyecto es privado: todo lo siguiente requiere una cuenta de GitLab con
acceso a `quersystem/plugin-wazuh-ens`.

| Ubicación | Uso |
|---|---|
| *Deploy → Releases*, en el proyecto de GitLab | consultar las versiones y sus notas, y descargar los ficheros desde el navegador |
| `https://gitlab.com/quersystem/plugin-wazuh-ens/-/releases/vX.Y.Z/downloads/<fichero>` | el enlace permanente de cada fichero, para compartirlo; requiere una sesión de GitLab en el navegador |
| *Deploy → Package registry → ensfacil → X.Y.Z* | los mismos cuatro ficheros, en el registro de paquetes |
| `https://gitlab.com/api/v4/projects/quersystem%2Fplugin-wazuh-ens/packages/generic/ensfacil/X.Y.Z/<fichero>` | la descarga desde un servidor, con un token de despliegue (apartado 6) |

> [!note]
> Los enlaces `/-/releases/…/downloads/…` no funcionan desde un servidor:
> requieren la sesión del navegador. Un servidor descarga siempre por la URL de
> la API.

## 4. Preparar la carpeta en el servidor

Cada versión se guarda en su propia carpeta. Se conserva la carpeta de la
versión anterior: es necesaria para la vuelta atrás.

```bash
V=1.2.0
R=/opt/ensfacil/releases/$V
sudo mkdir -p "$R"
sudo chown "$USER":root "$R"
```

Sustituir `1.2.0` por la versión que se instala. Los apartados siguientes usan
`V` y `R`.

## 5. Descargar desde el navegador

1. En GitLab, abrir el proyecto `quersystem/plugin-wazuh-ens` y entrar en
   *Deploy → Releases*.
2. Abrir la release `ENSFácil X.Y.Z` y descargar sus cuatro ficheros, en
   *Assets*.
3. Copiar los ficheros a la carpeta del servidor:

   ```bash
   scp ensfacil-1.2.0-osd-2.19.5.zip deploy-plugin.sh create-admin-role.sh SHA256SUMS \
     <usuario>@<servidor>:/opt/ensfacil/releases/1.2.0/
   ```

Continuar en el apartado 7.

## 6. Descargar desde el servidor con un token de despliegue

Si el servidor tiene acceso a `gitlab.com`, puede descargar la release
directamente. Para ello necesita un token de despliegue del proyecto que solo
lea paquetes.

### 6.1 Crear el token

Lo crea un usuario con el rol Maintainer en el proyecto:

1. En `quersystem/plugin-wazuh-ens`, entrar en *Settings → Repository → Deploy
   tokens* y pulsar *Add token*.
2. Asignar un nombre que indique su finalidad (por ejemplo,
   `ensfacil-descarga`) y, opcionalmente, una fecha de caducidad.
3. Marcar solo el permiso `read_package_registry`.
4. Pulsar *Create deploy token*.

Resultado esperado: el usuario del token y el token. GitLab muestra el token
una sola vez: debe guardarse en ese momento. Si el campo de usuario se deja
vacío, GitLab asigna uno con la forma `gitlab+deploy-token-<n>`.

> [!warning]
> El token da acceso a todas las versiones publicadas. No debe escribirse en la
> línea de órdenes (`curl -u usuario:token …`) ni en una asignación (`T=…`):
> quedaría en el historial del shell y en la lista de procesos. Para retirarlo,
> se revoca en la misma pantalla de GitLab.

### 6.2 Guardar el token solo para root

Para las actualizaciones siguientes, el token se guarda en un fichero de
configuración de curl que solo lee `root`: `/etc/ensfacil/gitlab-descarga.curlrc`
(permisos `0600`, de `root:root`).

```bash
read -r -p "Usuario del token: " U
read -r -s -p "Token: " T; echo
sudo mkdir -p /etc/ensfacil
printf 'user = "%s:%s"\n' "$U" "$T" \
  | sudo sh -c 'umask 077 && cat > /etc/ensfacil/gitlab-descarga.curlrc'
unset U T
sudo chown root:root /etc/ensfacil/gitlab-descarga.curlrc
sudo chmod 0600 /etc/ensfacil/gitlab-descarga.curlrc
sudo stat -c '%a %U:%G' /etc/ensfacil/gitlab-descarga.curlrc
```

`read` y `printf` son órdenes internas de bash: el token no pasa por la línea de
órdenes de ningún proceso ni queda en el historial.

Resultado esperado: `600 root:root`. El fichero tiene una sola línea,
`user = "<usuario>:<token>"`.

### 6.3 Descargar los cuatro ficheros

```bash
V=1.2.0
R=/opt/ensfacil/releases/$V
API=https://gitlab.com/api/v4/projects/quersystem%2Fplugin-wazuh-ens/packages/generic/ensfacil/$V

for f in "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh SHA256SUMS; do
  sudo curl -fsS -K /etc/ensfacil/gitlab-descarga.curlrc -o "$R/$f" "$API/$f" || { echo "ERROR: $f"; break; }
done
ls -l "$R"
```

Resultado esperado: los cuatro ficheros en la carpeta y ninguna línea `ERROR`.

| Error de curl | Causa habitual |
|---|---|
| `401` o `403` | el token está mal copiado, caducado, revocado o sin `read_package_registry` |
| `404` | esa versión no está publicada, o `V` está mal escrita |

### 6.4 Sin guardar el token

Para una descarga puntual, curl puede leer el token de su entrada estándar. Así
no queda en ningún fichero:

```bash
read -r -p "Usuario del token: " U
read -r -s -p "Token: " T; echo
for f in "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh SHA256SUMS; do
  printf 'user = "%s:%s"\n' "$U" "$T" | curl -fsS -K - -o "$R/$f" "$API/$f" || { echo "ERROR: $f"; break; }
done
unset U T
ls -l "$R"
```

Resultado esperado: el mismo que en el apartado 6.3.

## 7. Comprobar los ficheros

```bash
cd "$R"
sha256sum -c SHA256SUMS
sha256sum "ensfacil-$V-osd-2.19.5.zip"
bash deploy-plugin.sh --solo-id "ensfacil-$V-osd-2.19.5.zip"
```

Resultado esperado:

| Comprobación | Resultado esperado |
|---|---|
| `sha256sum -c` | `OK` en los tres ficheros |
| `sha256sum` del zip | el mismo SHA-256 que indica la descripción de la release |
| `--solo-id` | `ensfacil` |

> [!warning]
> Si alguna línea indica `FAILED` o el SHA-256 no coincide con el de la
> release, no instalar nada: borrar la carpeta y descargar de nuevo.

## 8. Primera instalación

Antes de empezar, Wazuh 4.14.7 debe estar instalado y validado
([guía de instalación, apartado 9](01-installation-from-scratch.md#9-instalar-y-validar-wazuh-4147)).
`deploy-plugin.sh` usa `python3`, `unzip`, `curl`, `tar`, `systemctl` y `sudo`.

```bash
cd "$R"
sudo -u wazuh-dashboard test -r "ensfacil-$V-osd-2.19.5.zip" && echo "ZIP_ACCESIBLE=OK"
sudo bash deploy-plugin.sh "ensfacil-$V-osd-2.19.5.zip"
```

El script guarda el `ensfacil` instalado, si existe, en
`/var/backups/ensfacil/`. Después detiene el dashboard, retira la versión
anterior de `ensfacil`, instala el zip, sube el `build.number` del dashboard y
lo arranca. Solo modifica `ensfacil`: el plugin de Wazuh no cambia.

Resultado esperado: `ZIP_ACCESIBLE=OK` y, al final del despliegue,
`dashboard: active` y, en `plugins:`, `ensfacil` junto a `wazuh`, `wazuhCore` y
`wazuhCheckUpdates`.

Si falla, el script indica cómo volver al estado anterior y sale con un código
de error. Los códigos y las copias están en el
[diagnóstico, apartado 4.1](04-troubleshooting-and-rollback.md#41-si-deploy-pluginsh-falla-a-medias).

> [!note]
> Con Wazuh Dashboard en Docker, `deploy-plugin.sh` no se usa: presupone
> systemd y una instalación por paquetes. El zip de la release se instala en
> una imagen propia:
> [Wazuh en Docker, apartado 3](06-wazuh-in-docker.md#3-construir-la-imagen-del-dashboard-con-ensfácil).

En una instalación nueva, continuar con la configuración ENS (el rol del
apartado 9 es opcional): el primer guardado y la siembra de los controles
([guía de instalación, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens)).
La siembra usa las herramientas de `config/` del repositorio, que la release no
incluye. El acceso a GitLab y la clonación del repositorio se describen en la
[guía de instalación, apartados 10.1 y 10.2](01-installation-from-scratch.md#101-validar-el-acceso-al-repositorio-principal).

## 9. Crear el rol ensfacil_admin

> [!note]
> Este paso solo es necesario si un usuario sin `all_access` debe guardar la
> configuración o consultar su historial. El usuario `admin` de Wazuh tiene
> `all_access` y puede guardar la configuración sin este rol.

Solo los usuarios con el rol `ensfacil_admin` o `all_access` pueden guardar la
configuración ENS y consultar su historial. Los demás la ven, pero al guardar
reciben un error 403.

El rol no concede permisos por sí mismo. Cada usuario necesita además su rol
habitual de Wazuh, con lectura de `wazuh-alerts-*` y `wazuh-monitoring-*`.

Primero en modo prueba, que no envía ningún cambio. Sustituir `<usuario>` por
el usuario del dashboard que administrará ENSFácil:

```bash
cd "$R"
sudo bash create-admin-role.sh --dry-run --mapear <usuario>
```

Resultado esperado: la línea `== modo prueba: no se envía ningún cambio` y las
peticiones que se enviarían (`PUT …/roles/ensfacil_admin` y, si el usuario no
tiene el rol, `PUT` o `PATCH …/rolesmapping/ensfacil_admin`).

Después, la ejecución real:

```bash
sudo bash create-admin-role.sh --mapear <usuario>
```

Resultado esperado: `-> 200` o `-> 201` después de cada petición y, al final,
`usuarios con el rol ensfacil_admin: <usuario>`.

| Opción | Efecto |
|---|---|
| `--dry-run` | muestra las peticiones que cambiarían algo y no las envía |
| `--mapear <usuario>` | asigna el rol a ese usuario; se puede repetir para varios |
| sin `--mapear` | solo crea el rol |

El script usa el certificado de administrador del indexer, sin contraseña, y
comprueba el certificado del indexer contra su CA. Por defecto se conecta a
`https://127.0.0.1:9200`, el nombre para el que la instalación todo en uno de
Wazuh emite el certificado del indexer. Para otro indexer, se usan las
variables `OS_URL`, `OS_CERT`, `OS_KEY` y `OS_CA`. El detalle está en la
[guía de instalación, apartado 13.5](01-installation-from-scratch.md#135-crear-el-rol-ensfacil_admin).
En Docker, el certificado está emitido para `wazuh.indexer` y el script se
ejecuta desde un contenedor:
[Wazuh en Docker, apartado 5](06-wazuh-in-docker.md#5-crear-el-rol-ensfacil_admin).

La ejecución es repetible: el rol se escribe igual y solo se añaden los
usuarios que falten. En una actualización no es necesaria: el rol se conserva.

## 10. Comprobar que funciona

```bash
sudo systemctl is-active wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin list
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/api/ensfacil/configuration
```

Resultado esperado:

| Comprobación | Resultado esperado |
|---|---|
| servicio | `active` |
| plugins | `ensfacil@X.Y.Z`, la versión instalada, y `wazuh@4.14.7-01`, entre otros |
| `/api/ensfacil/configuration` | `401`: la ruta del plugin existe y pide sesión. Un `404` indica que el plugin no ha cargado |

En el navegador, entrar en Wazuh Dashboard. En el menú, dentro de «Security
operations», debe aparecer «ENSFácil», que se abre en la pestaña Panel. Desde
la 1.2.0, la portada de OpenSearch Dashboards (`/app/home`) muestra además la
tarjeta «ENSFácil»; la portada de Wazuh no admite tarjetas de otros plugins.

Si algún resultado no coincide, seguir el
[diagnóstico](04-troubleshooting-and-rollback.md#3-diagnóstico-básico). En
Docker, las comprobaciones equivalentes están en
[Wazuh en Docker, apartado 4](06-wazuh-in-docker.md#4-cambiar-el-compose-y-arrancar).

### 10.1 Que los datos siguen ahí

Instalar, actualizar o retirar el plugin no modifica los índices: la
configuración ENS, su historial y los hechos de los runbooks se conservan. Para
comprobarlo, con el certificado de administración del indexer de la instalación
todo en uno:

```bash
C=/etc/wazuh-indexer/certs
ix() { sudo curl -s --cacert $C/root-ca.pem --cert $C/admin.pem --key $C/admin-key.pem "https://127.0.0.1:9200/$1"; echo; }
ix 'wazuh-ens-configuration/_doc/active?_source_includes=updatedAt'
ix 'wazuh-ens-configuration/_count'
ix 'wazuh-alerts-*/_count?q=_exists_:data.ensfacil'
```

Resultado esperado: `"found":true` con el `updatedAt` del último guardado de la
configuración, el número de documentos de configuración y el número de hechos
de ENSFácil. Los tres valores se anotan antes de cambiar de versión. Después, la
configuración debe ser la misma (mismo `updatedAt`, mismos documentos) y los
hechos, los mismos o más, porque los runbooks siguen enviando.

En Docker, las mismas tres consultas se hacen con la función `ix` de
[Wazuh en Docker, apartado 2.4](06-wazuh-in-docker.md#24-función-de-consulta-del-indexer).

## 11. Actualizar a una release nueva

1. Leer las notas de la release nueva: su compatibilidad y si trae controles
   nuevos.
2. Guardar una copia del documento de configuración ENS:

   ```bash
   sudo mkdir -p /opt/ensfacil/artifacts
   sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://127.0.0.1:9200/wazuh-ens-configuration/_doc/active \
     | sudo tee "/opt/ensfacil/artifacts/active-$(date +%Y%m%d-%H%M%S).json" >/dev/null
   ```

   Resultado esperado: el fichero `active-<fecha>.json` en
   `/opt/ensfacil/artifacts`, con `"found":true`.

3. Descargar la versión nueva en su propia carpeta y comprobarla: apartados 4,
   6.3 (o 5) y 7, con la versión nueva en `V`. Con el token guardado, basta el
   apartado 6.3.
4. Desplegar la versión nueva como en el apartado 8. `deploy-plugin.sh`
   sustituye solo `ensfacil` y guarda antes la versión instalada en
   `/var/backups/ensfacil/`.
5. Comprobar como en el apartado 10. La lista de plugins debe indicar la
   versión nueva.
6. Si la versión trae controles o parámetros nuevos, sembrar su configuración
   **después** de desplegar
   ([guía de actualización, apartado 8](02-updating-an-existing-environment.md#8-sembrar-y-validar-la-configuración)).
7. Revisar en la pantalla de Configuración los niveles de Trazabilidad (T) y de
   Disponibilidad (D)
   ([guía de instalación, apartado 14.5](01-installation-from-scratch.md#145-declarar-la-política)).

> [!important]
> El orden es obligatorio: primero el plugin nuevo y después la siembra. El
> plugin instalado valida el documento de configuración con sus propias
> reglas: una siembra anterior al despliegue puede impedir que el panel cargue.

Se conserva la carpeta de la versión anterior hasta validar la nueva. El
procedimiento completo, con las reglas del manager y los agentes, está en la
[guía de actualización](02-updating-an-existing-environment.md). En Docker, la
actualización está en
[Wazuh en Docker, apartado 12.1](06-wazuh-in-docker.md#121-actualizar-a-una-versión-nueva).

## 12. Venir de la versión integrada

Si el entorno todavía tiene la versión integrada (el plugin de Wazuh
modificado, con la aplicación «ENS» en el menú), seguir la
[transición desde la versión integrada](02-updating-an-existing-environment.md#10-transición-desde-la-versión-integrada).
Se usan el zip de la release y el `deploy-plugin.sh` de su carpeta. La
configuración no se migra: las dos versiones usan el mismo índice.

Con Wazuh en Docker, ENSFácil se instala sobre la imagen oficial, que contiene
el plugin de Wazuh sin modificar:
[Wazuh en Docker, apartado 3](06-wazuh-in-docker.md#3-construir-la-imagen-del-dashboard-con-ensfácil).

## 13. Volver a una versión anterior

Para volver atrás, se despliega la release de la versión anterior. Si su
carpeta ya no existe, se descarga de nuevo (apartado 6.3, con esa versión en
`V`). Sustituir `X.Y.Z` por la versión de destino:

```bash
V=X.Y.Z
R=/opt/ensfacil/releases/$V
cd "$R" && sha256sum -c SHA256SUMS \
  && sudo bash deploy-plugin.sh "ensfacil-$V-osd-2.19.5.zip"
```

Resultado esperado: `OK` en los tres ficheros y, al final, `dashboard: active`.
Comprobar después como en el apartado 10: la lista de plugins debe indicar la
versión anterior.

Si la versión retirada había sembrado controles que la anterior no conoce,
restaurar también la copia de la configuración. Para volver de la 1.2.0 a la
1.1.0 después de «Migrar a sistemas», restaurar la versión del documento
anterior a la migración
([Configuración por sistema y plantillas, apartado 12](09-configuration-by-system.md#12-compatibilidad-y-vuelta-atrás)). El procedimiento completo está
en el [diagnóstico y rollback, apartado 4](04-troubleshooting-and-rollback.md#4-reinstalar-la-versión-anterior-de-ensfácil).
En Docker:
[Wazuh en Docker, apartado 12.2](06-wazuh-in-docker.md#122-volver-a-la-versión-anterior).

## 14. Lo que la release no instala

El plugin evalúa los hechos frente a la política declarada en la pantalla de
Configuración; no recoge datos. Los hechos los producen las reglas del manager
y los runbooks de cada máquina, que se instalan por separado:

- las reglas en el manager, con el `install-manager.sh` de cada runbook
  ([guía de instalación, apartados 10 a 12](01-installation-from-scratch.md#10-configurar-el-acceso-autorizado-a-gitlab);
  en Docker, [Wazuh en Docker, apartado 13](06-wazuh-in-docker.md#13-lado-del-manager));
- los recolectores en cada máquina, con la guía `01-installation` de cada
  runbook ([runbooks y registros](05-runbooks-and-registers.md#runbooks-por-control));
- la configuración ENS, con las herramientas de `config/` del repositorio
  ([guía de instalación, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens)).

Sin las reglas y los runbooks, el panel no tiene hechos que evaluar.

## 15. Cambiar de versión o desinstalar

| Situación de partida | Objetivo | Procedimiento |
|---|---|---|
| la versión integrada (el plugin de Wazuh modificado, con la aplicación «ENS») | ENSFácil desde una release | la [transición desde la versión integrada](02-updating-an-existing-environment.md#10-transición-desde-la-versión-integrada): instalar la release junto a la integrada, comparar y reinstalar el paquete oficial `wazuh-dashboard` 4.14.7 |
| una release de ENSFácil | una más nueva | el apartado 11 |
| una release de ENSFácil | la anterior | el apartado 13 |
| ENSFácil, después de la transición | la versión integrada otra vez | [volver a la versión integrada](04-troubleshooting-and-rollback.md#6-volver-a-la-versión-integrada), mientras se conserve la carpeta de la transición |
| ENSFácil | retirarlo | el bloque siguiente |

En todos los casos los datos se conservan; se comprueban antes y después como
en el apartado 10.1.

Desinstalar ENSFácil no modifica el plugin de Wazuh ni los datos:

```bash
sudo systemctl stop wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove ensfacil
sudo rm -rf /usr/share/wazuh-dashboard/plugins/ensfacil
sudo systemctl start wazuh-dashboard
```

Resultado esperado: el dashboard vuelve a arrancar sin `ensfacil`. Las
comprobaciones, y la retirada del rol y de la configuración si ENSFácil no se va
a volver a usar, están en
[retirar ENSFácil](04-troubleshooting-and-rollback.md#5-retirar-ensfácil). En
Docker:
[Wazuh en Docker, apartado 12.3](06-wazuh-in-docker.md#123-retirar-ensfácil).
