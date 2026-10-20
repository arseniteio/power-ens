# Instalar ENSFácil desde una release
[English](07-installing-from-a-release.en.md)

[[_TOC_]]

## 1. Objetivo

Instala o actualiza ENSFácil con los ficheros de una release de GitLab, sin compilar.

Es la forma recomendada. Para compilar el zip, véase
[Compilar desde el código fuente](08-building-from-source.md).

> [!note]
> La instalación de los apartados 8 a 15 corresponde a la instalación por
> paquetes (systemd). Con Wazuh en Docker, la descarga y la comprobación de la
> release (apartados 2 a 7) son las mismas, y el resto del procedimiento está
> en [Wazuh en Docker](06-wazuh-in-docker.md).

> [!note]
> La release instala solo el plugin. Las reglas del manager y los runbooks de cada máquina se instalan por separado (apartado 14).

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

Cada zip sirve para una sola versión de OpenSearch Dashboards, la del nombre (`-osd-2.19.5`).

| ENSFácil | Wazuh | OpenSearch Dashboards | Fichero |
|---|---|---|---|
| `1.0.0` | `4.14.7` | `2.19.5` | `ensfacil-1.0.0-osd-2.19.5.zip` |
| `1.1.0` | `4.14.7` | `2.19.5` | `ensfacil-1.1.0-osd-2.19.5.zip` |
| `1.2.0` | `4.14.7` | `2.19.5` | `ensfacil-1.2.0-osd-2.19.5.zip` |
| `1.3.0` | `4.14.7` | `2.19.5` | `ensfacil-1.3.0-osd-2.19.5.zip` |
| `1.4.0` | `4.14.7` | `2.19.5` | `ensfacil-1.4.0-osd-2.19.5.zip` |

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

Requiere una cuenta de GitLab con acceso a `quersystem/plugin-wazuh-ens`.

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

Cada versión en su carpeta. Conservar la de la versión anterior (vuelta atrás).

```bash
V=1.4.0
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
   scp ensfacil-1.4.0-osd-2.19.5.zip deploy-plugin.sh create-admin-role.sh SHA256SUMS \
     <usuario>@<servidor>:/opt/ensfacil/releases/1.2.0/
   ```

Continuar en el apartado 7.

## 6. Descargar desde el servidor con un token de despliegue

Con acceso a `gitlab.com`, el servidor descarga la release con un token de despliegue del proyecto que solo lee paquetes.

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
> El token da acceso a todas las versiones. No escribirlo en la línea de órdenes (`curl -u usuario:token …`) ni en una asignación (`T=…`): queda en el historial y en la lista de procesos. Revocarlo en la misma pantalla de GitLab.

### 6.2 Guardar el token solo para root

Para actualizaciones posteriores, guardar el token en un fichero de configuración de curl legible solo por `root`: `/etc/ensfacil/gitlab-descarga.curlrc` (`0600`, `root:root`).

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

`read` y `printf` son órdenes internas de bash: el token no queda en el historial ni en la lista de procesos.

Resultado esperado: `600 root:root`. El fichero tiene una sola línea,
`user = "<usuario>:<token>"`.

### 6.3 Descargar los cuatro ficheros

```bash
V=1.4.0
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

Descarga puntual: curl lee el token de la entrada estándar y no queda en ningún fichero:

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

El script guarda el `ensfacil` instalado en `/var/backups/ensfacil/`, detiene el dashboard, sustituye `ensfacil`, sube el `build.number` y arranca el dashboard. El plugin de Wazuh no cambia.

Resultado esperado: `ZIP_ACCESIBLE=OK` y, al final del despliegue,
`dashboard: active` y, en `plugins:`, `ensfacil` junto a `wazuh`, `wazuhCore` y
`wazuhCheckUpdates`.

Si falla, el script indica cómo volver al estado anterior y sale con un código
de error. Los códigos y las copias están en el
[diagnóstico, apartado 4.1](04-troubleshooting-and-rollback.md#41-si-deploy-pluginsh-falla-a-medias).

> [!note]
> En Docker no se usa `deploy-plugin.sh` (presupone systemd y paquetes): [Wazuh en Docker, apartado 3](06-wazuh-in-docker.md#3-construir-la-imagen-del-dashboard-con-ensfácil).

En una instalación nueva, continuar con la configuración ENS (el rol del apartado 9 es opcional): primer guardado y siembra de los controles ([guía de instalación, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens)).
La siembra usa las herramientas de `config/` del repositorio, que la release no incluye. Acceso a GitLab y clonación: [guía de instalación, apartados 10.1 y 10.2](01-installation-from-scratch.md#101-validar-el-acceso-al-repositorio-principal).

## 9. Crear el rol ensfacil_admin

> [!note]
> Necesario solo si un usuario sin `all_access` debe guardar la configuración o consultar su historial. El usuario `admin` de Wazuh tiene `all_access`.

Sin `ensfacil_admin` ni `all_access`, guardar devuelve un error 403. El rol concede además lectura de `wazuh-ens-snapshots` (la serie de madurez, [Valoración de la madurez, apartado 10.2](10-maturity-assessment.md#102-quién-la-lee)) y ningún otro permiso: cada usuario necesita además su rol de Wazuh con lectura de `wazuh-alerts-*` y `wazuh-monitoring-*`.

Primero en modo prueba, que no envía ningún cambio. Sustituir `<usuario>` por
el usuario del dashboard que administrará ENSFácil:

```bash
cd "$R"
sudo bash create-admin-role.sh --dry-run --mapear <usuario>
```

Resultado esperado: la línea `== dry-run mode: no change is sent` y las
peticiones que se enviarían (`PUT …/roles/ensfacil_admin` y, si el usuario no
tiene el rol, `PUT` o `PATCH …/rolesmapping/ensfacil_admin`).

Después, la ejecución real:

```bash
sudo bash create-admin-role.sh --mapear <usuario>
```

Resultado esperado: `-> 200` o `-> 201` después de cada petición y, al final,
`users with the role ensfacil_admin: <usuario>`.

| Opción | Efecto |
|---|---|
| `--dry-run` | muestra las peticiones que cambiarían algo y no las envía |
| `--mapear <usuario>` | asigna el rol a ese usuario; se puede repetir para varios |
| sin `--mapear` | solo crea el rol |

El script usa el certificado de administrador del indexer, sin contraseña, y lo verifica contra su CA. Conexión por defecto: `https://127.0.0.1:9200`. Otro indexer: variables `OS_URL`, `OS_CERT`, `OS_KEY` y `OS_CA` ([guía de instalación, apartado 13.5](01-installation-from-scratch.md#135-crear-el-rol-ensfacil_admin)).
En Docker, el certificado está emitido para `wazuh.indexer` y el script se
ejecuta desde un contenedor:
[Wazuh en Docker, apartado 5](06-wazuh-in-docker.md#5-crear-el-rol-ensfacil_admin).

Repetible: solo se añaden los usuarios que falten. En una actualización no es necesario: el rol se conserva.

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

Instalar, actualizar o retirar el plugin no modifica los índices. Comprobación, con el certificado de administración del indexer de la instalación todo en uno:

```bash
C=/etc/wazuh-indexer/certs
ix() { sudo curl -s --cacert $C/root-ca.pem --cert $C/admin.pem --key $C/admin-key.pem "https://127.0.0.1:9200/$1"; echo; }
ix 'wazuh-ens-configuration/_doc/active?_source_includes=updatedAt'
ix 'wazuh-ens-configuration/_count'
ix 'wazuh-alerts-*/_count?q=_exists_:data.ensfacil'
```

Resultado esperado: `"found":true` con el `updatedAt` del último guardado, el número de documentos de configuración y el número de hechos de ENSFácil. Anotar los tres valores antes de cambiar de versión; después, la configuración debe ser la misma (mismo `updatedAt`, mismos documentos) y los hechos, los mismos o más.

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
   sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://127.0.0.1:9200/wazuh-ens-configuration/_doc/maturity \
     | sudo tee "/opt/ensfacil/artifacts/maturity-$(date +%Y%m%d-%H%M%S).json" >/dev/null
   ```

   Resultado esperado: el fichero `active-<fecha>.json` en
   `/opt/ensfacil/artifacts`, con `"found":true`, y `maturity-<fecha>.json`
   (madurez registrada desde la 1.4.0; `"found":false` si no hay).

3. Descargar la versión nueva en su propia carpeta y comprobarla: apartados 4,
   6.3 (o 5) y 7, con la versión nueva en `V`. Con el token guardado, basta el
   apartado 6.3.
4. Desplegar la versión nueva como en el apartado 8. `deploy-plugin.sh`
   sustituye solo `ensfacil` y guarda antes la versión instalada en
   `/var/backups/ensfacil/`.
5. Comprobar como en el apartado 10. La lista de plugins debe indicar la
   versión nueva.
6. Volver a ejecutar el `create-admin-role.sh` de la carpeta de la versión
   nueva, sin `--mapear` (las asignaciones existentes se conservan), para que el
   rol `ensfacil_admin` reciba los permisos que pida la versión; desde la 1.4.0,
   la lectura de `wazuh-ens-snapshots` que usa la madurez
   ([Valoración de la madurez, apartado 10.2](10-maturity-assessment.md#102-quién-la-lee)):

   ```bash
   sudo bash create-admin-role.sh
   ```

   Resultado esperado: el script termina sin error y
   `GET _plugins/_security/api/roles/ensfacil_admin` muestra
   `wazuh-ens-snapshots` en `index_permissions` con `read`.
7. Si la versión trae controles o parámetros nuevos, sembrar su configuración
   **después** de desplegar
   ([guía de actualización, apartado 8](02-updating-an-existing-environment.md#8-sembrar-y-validar-la-configuración)).
8. Revisar en la pantalla de Configuración los niveles de las dimensiones (C, I,
   T, A y D) y, en General, «Datos de la organización»: los datos pendientes de
   elegir y los que no tienen valor común
   ([guía de instalación, apartado 14.5](01-installation-from-scratch.md#145-declarar-la-política)).

> [!important]
> El orden es obligatorio: primero el plugin nuevo y después la siembra. Una siembra anterior al despliegue puede impedir que el panel cargue.

Conservar la carpeta de la versión anterior hasta validar la nueva. Procedimiento completo, con reglas del manager y agentes: [guía de actualización](02-updating-an-existing-environment.md). En Docker: [Wazuh en Docker, apartado 12.1](06-wazuh-in-docker.md#121-actualizar-a-una-versión-nueva).

## 12. Venir de la versión integrada

Con la versión integrada instalada (plugin de Wazuh modificado, app «ENS»), seguir la [transición desde la versión integrada](02-updating-an-existing-environment.md#10-transición-desde-la-versión-integrada). Se usan el zip de la release y el `deploy-plugin.sh` de su carpeta.

Con Wazuh en Docker, ENSFácil se instala sobre la imagen oficial:
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
restaurar también la copia de la configuración. Para volver de la 1.3.0 a la
1.2.0 con sus plantillas, o a la 1.1.0 después de «Repartir por agentes»,
restaurar la versión del documento anterior
([Configuración por controles y plantillas, apartado 12](09-configuration-by-system.md#12-compatibilidad-y-vuelta-atrás)). El procedimiento completo está
en el [diagnóstico y rollback, apartado 4](04-troubleshooting-and-rollback.md#4-reinstalar-la-versión-anterior-de-ensfácil).
En Docker:
[Wazuh en Docker, apartado 12.2](06-wazuh-in-docker.md#122-volver-a-la-versión-anterior).

## 14. Lo que la release no instala

Los hechos los producen las reglas del manager y los runbooks de cada máquina, que se instalan por separado:

- las reglas en el manager, con el `install-manager.sh` de cada runbook
  ([guía de instalación, apartados 10 a 12](01-installation-from-scratch.md#10-configurar-el-acceso-autorizado-a-gitlab);
  en Docker, [Wazuh en Docker, apartado 13](06-wazuh-in-docker.md#13-lado-del-manager));
- los recolectores en cada máquina, con la guía `01-installation` de cada
  runbook ([runbooks y registros](05-runbooks-and-registers.md#runbooks-por-control));
- la configuración ENS, con las herramientas de `config/` del repositorio
  ([guía de instalación, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens)).

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
