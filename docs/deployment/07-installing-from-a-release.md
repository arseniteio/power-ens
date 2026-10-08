# Instalar ENSFácil desde una release
[English](07-installing-from-a-release.en.md)

[[_TOC_]]

## 1. Objetivo

Esta guía instala o actualiza el plugin ENSFácil con los ficheros de una release
de GitLab. No hace falta compilar ni tener el código fuente.

Es la forma recomendada. Si necesitas compilar el zip tú mismo, sigue
[Compilar desde el código fuente](08-building-from-source.md).

> [!note]
> La release instala el plugin, que juzga. Los datos que juzga los recogen las
> reglas del manager y los runbooks de cada máquina, que se instalan aparte
> (apartado 14).

## 2. Qué es una release

Cada versión publicada de ENSFácil tiene una release en GitLab, con el nombre
`ENSFácil X.Y.Z` y la etiqueta `vX.Y.Z`. Lleva cuatro ficheros:

| Fichero | Qué es |
|---|---|
| `ensfacil-X.Y.Z-osd-2.19.5.zip` | el plugin, compilado para OpenSearch Dashboards 2.19.5 |
| `deploy-plugin.sh` | el script que instala el zip en Wazuh Dashboard |
| `create-admin-role.sh` | el script que crea el rol `ensfacil_admin` y lo asigna |
| `SHA256SUMS` | la suma SHA-256 de los otros tres ficheros |

La descripción de la release tiene las notas de esa versión (su entrada del
[registro de cambios](../../CHANGELOG.md)), la compatibilidad, las órdenes
rápidas de instalación, un enlace a esta guía y el SHA-256 del zip.

### 2.1 Compatibilidad

Cada zip sirve para una sola versión de OpenSearch Dashboards, la que lleva en
el nombre (`-osd-2.19.5`). OpenSearch Dashboards solo acepta un plugin
compilado para su versión exacta.

| ENSFácil | Wazuh | OpenSearch Dashboards | Fichero |
|---|---|---|---|
| `1.x` | `4.14.7` | `2.19.5` | `ensfacil-1.x.y-osd-2.19.5.zip` |

Cada release dice su compatibilidad en la descripción. Compruébala con tu
versión antes de descargar nada:

```bash
dpkg-query -W -f='${Package} ${Version}\n' wazuh-dashboard
sudo python3 -c 'import json; print(json.load(open("/usr/share/wazuh-dashboard/package.json"))["version"])'
```

Qué tiene que salir: `wazuh-dashboard 4.14.7-1` y `2.19.5`. Con otra versión, no
sigas: consulta la [compatibilidad de versiones](03-version-compatibility.md).

## 3. Dónde están las releases

El proyecto es privado: todo lo siguiente pide una cuenta de GitLab con acceso a
`quersystem/plugin-wazuh-ens`.

| Dónde | Para qué |
|---|---|
| *Deploy → Releases*, en el proyecto de GitLab | ver las versiones, sus notas y descargar los ficheros desde el navegador |
| `https://gitlab.com/quersystem/plugin-wazuh-ens/-/releases/vX.Y.Z/downloads/<fichero>` | el enlace permanente de cada fichero, para compartirlo; necesita una sesión de GitLab en el navegador |
| *Deploy → Package registry → ensfacil → X.Y.Z* | los mismos cuatro ficheros, en el registro de paquetes |
| `https://gitlab.com/api/v4/projects/quersystem%2Fplugin-wazuh-ens/packages/generic/ensfacil/X.Y.Z/<fichero>` | la descarga desde un servidor, con un token de despliegue (apartado 6) |

> [!note]
> Los enlaces `/-/releases/…/downloads/…` no funcionan desde un servidor: piden
> la sesión del navegador. Un servidor descarga siempre por la URL de la API.

## 4. Preparar la carpeta en el servidor

Cada versión va en su propia carpeta. Conserva la de la versión anterior: es tu
vuelta atrás.

```bash
V=1.0.0
R=/opt/ensfacil/releases/$V
sudo mkdir -p "$R"
sudo chown "$USER":root "$R"
```

Cambia `1.0.0` por la versión que vas a instalar. Los apartados siguientes usan
`V` y `R`.

## 5. Descargar desde el navegador

1. En GitLab, abre el proyecto `quersystem/plugin-wazuh-ens` y entra en
   *Deploy → Releases*.
2. Abre la release `ENSFácil X.Y.Z` y descarga sus cuatro ficheros, en
   *Assets*.
3. Cópialos a la carpeta del servidor:

   ```bash
   scp ensfacil-1.0.0-osd-2.19.5.zip deploy-plugin.sh create-admin-role.sh SHA256SUMS \
     <usuario>@<servidor>:/opt/ensfacil/releases/1.0.0/
   ```

Sigue en el apartado 7.

## 6. Descargar desde el servidor con un token de despliegue

Si el servidor llega a `gitlab.com`, puede descargar la release él mismo. Para
eso necesita un token de despliegue del proyecto que solo lea paquetes.

### 6.1 Crear el token

Lo crea alguien con el rol Maintainer en el proyecto:

1. En `quersystem/plugin-wazuh-ens`, entra en *Settings → Repository → Deploy
   tokens* y pulsa *Add token*.
2. Ponle un nombre que diga para qué es (por ejemplo, `ensfacil-descarga`) y,
   si quieres, una fecha de caducidad.
3. Marca solo el permiso `read_package_registry`.
4. Pulsa *Create deploy token*.

Qué tiene que salir: el usuario del token y el token. GitLab enseña el token una
sola vez: guárdalo en ese momento. Si dejaste el usuario vacío, GitLab pone uno
como `gitlab+deploy-token-<n>`.

> [!warning]
> El token da acceso a todas las versiones publicadas. Nunca lo pongas en la
> línea de órdenes (`curl -u usuario:token …`) ni en una asignación
> (`T=…`): se quedaría en el historial del shell y en la lista de procesos.
> Para retirarlo, revócalo en la misma pantalla de GitLab.

### 6.2 Guardar el token solo para root

Para las actualizaciones siguientes, guarda el token en un fichero de
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

Qué tiene que salir: `600 root:root`. El fichero tiene una sola línea,
`user = "<usuario>:<token>"`.

### 6.3 Descargar los cuatro ficheros

```bash
V=1.0.0
R=/opt/ensfacil/releases/$V
API=https://gitlab.com/api/v4/projects/quersystem%2Fplugin-wazuh-ens/packages/generic/ensfacil/$V

for f in "ensfacil-$V-osd-2.19.5.zip" deploy-plugin.sh create-admin-role.sh SHA256SUMS; do
  sudo curl -fsS -K /etc/ensfacil/gitlab-descarga.curlrc -o "$R/$f" "$API/$f" || { echo "ERROR: $f"; break; }
done
ls -l "$R"
```

Qué tiene que salir: los cuatro ficheros en la carpeta y ninguna línea `ERROR`.

| Error de curl | Causa habitual |
|---|---|
| `401` o `403` | el token está mal copiado, caducado, revocado o sin `read_package_registry` |
| `404` | esa versión no está publicada, o `V` está mal escrita |

### 6.4 Sin guardar el token

Para una descarga suelta, curl puede leer el token de su entrada estándar. Así
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

Qué tiene que salir: lo mismo que en el apartado 6.3.

## 7. Comprobar los ficheros

```bash
cd "$R"
sha256sum -c SHA256SUMS
sha256sum "ensfacil-$V-osd-2.19.5.zip"
bash deploy-plugin.sh --solo-id "ensfacil-$V-osd-2.19.5.zip"
```

Qué tiene que salir:

| Comprobación | Resultado esperado |
|---|---|
| `sha256sum -c` | `OK` en los tres ficheros |
| `sha256sum` del zip | el mismo SHA-256 que dice la descripción de la release |
| `--solo-id` | `ensfacil` |

> [!warning]
> Si alguna línea dice `FAILED` o el SHA-256 no coincide con el de la release,
> no instales nada: borra la carpeta y descarga de nuevo.

## 8. Primera instalación

Antes de empezar, Wazuh 4.14.7 tiene que estar instalado y validado
([guía de instalación, apartado 9](01-installation-from-scratch.md#9-instalar-y-validar-wazuh-4147)).
`deploy-plugin.sh` usa `python3`, `unzip` y `curl`.

```bash
cd "$R"
sudo -u wazuh-dashboard test -r "ensfacil-$V-osd-2.19.5.zip" && echo "ZIP_ACCESIBLE=OK"
sudo bash deploy-plugin.sh "ensfacil-$V-osd-2.19.5.zip"
```

El script guarda el `ensfacil` instalado, si lo hay, en
`/var/backups/ensfacil/`. Después para el dashboard, retira la versión anterior
de `ensfacil`, instala el zip, sube el `build.number` del dashboard y lo
arranca. Solo toca `ensfacil`: el plugin de Wazuh se queda como está.

Qué tiene que salir: `ZIP_ACCESIBLE=OK` y, al final del despliegue,
`dashboard: active` y, en `plugins:`, `ensfacil` junto a `wazuh`, `wazuhCore` y
`wazuhCheckUpdates`.

Si falla, el script dice cómo volver a como estaba y sale con un código de
error. Los códigos y las copias están en el
[diagnóstico, apartado 4.1](04-troubleshooting-and-rollback.md#41-si-deploy-pluginsh-falla-a-medias).

> [!note]
> ¿Wazuh Dashboard corre en un contenedor? `deploy-plugin.sh` presupone systemd
> y una instalación por paquetes. Usa el zip de la release como en
> [Manager en contenedor, apartado 7](06-wazuh-in-docker.md#7-el-plugin-en-el-contenedor-del-dashboard).

En una instalación nueva, sigue con el rol (apartado 9) y después con la
configuración ENS: el primer guardado y la siembra de los controles
([guía de instalación, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens)).
La siembra usa las herramientas de `config/` del repositorio, que la release no
trae.

## 9. Crear el rol ensfacil_admin

Solo los usuarios con el rol `ensfacil_admin` o `all_access` pueden guardar la
configuración ENS y ver su historial. Los demás la ven, pero al guardar reciben
un error 403.

El rol no da ningún permiso por sí mismo. Cada usuario necesita además su rol
habitual de Wazuh, con lectura de `wazuh-alerts-*` y `wazuh-monitoring-*`.

Primero en modo prueba, que no cambia nada. Cambia `<usuario>` por el usuario
del dashboard que administrará ENSFácil:

```bash
cd "$R"
sudo bash create-admin-role.sh --dry-run --mapear <usuario>
```

Qué tiene que salir: la línea `== modo prueba: no se envía ningún cambio` y las
peticiones que se enviarían (`PUT …/roles/ensfacil_admin` y, si el usuario no
lo tiene, `PUT` o `PATCH …/rolesmapping/ensfacil_admin`).

Después, de verdad:

```bash
sudo bash create-admin-role.sh --mapear <usuario>
```

Qué tiene que salir: `-> 200` o `-> 201` después de cada petición y, al final,
`usuarios con el rol ensfacil_admin: <usuario>`.

| Opción | Qué hace |
|---|---|
| `--dry-run` | enseña las peticiones que cambiarían algo y no las envía |
| `--mapear <usuario>` | asigna el rol a ese usuario; se puede repetir para varios |
| sin `--mapear` | solo crea el rol |

El script usa el certificado de administrador del indexer, sin contraseña, y
comprueba el certificado del indexer contra su CA. Habla con
`https://127.0.0.1:9200`, el nombre para el que Wazuh hace ese certificado. Para
otro indexer, usa las variables `OS_URL`, `OS_CERT`, `OS_KEY` y `OS_CA`. El
detalle está en la
[guía de instalación, apartado 13.5](01-installation-from-scratch.md#135-crear-el-rol-ensfacil_admin).

Se puede repetir: el rol se escribe igual y solo se añaden los usuarios que
falten. Al actualizar, no hace falta: el rol se queda.

## 10. Comprobar que funciona

```bash
sudo systemctl is-active wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin list
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/api/ensfacil/configuration
```

Qué tiene que salir:

| Comprobación | Resultado esperado |
|---|---|
| servicio | `active` |
| plugins | `ensfacil@X.Y.Z`, la versión que acabas de instalar, y `wazuh@4.14.7-01`, entre otros |
| `/api/ensfacil/configuration` | `401`: la ruta del plugin existe y pide sesión. Un `404` significa que el plugin no ha cargado |

En el navegador, entra en Wazuh Dashboard. En el menú, dentro de «Security
operations», tiene que aparecer «ENSFácil», y se abre en la pestaña Panel.

Si algo no sale así, sigue el [diagnóstico](04-troubleshooting-and-rollback.md#3-diagnóstico-básico).

### 10.1 Que los datos siguen ahí

Instalar, actualizar o retirar el plugin no toca los índices: la configuración
ENS, su historial y los hechos de los runbooks se quedan donde estaban. Para
comprobarlo, con el certificado de administración del indexer:

```bash
C=/etc/wazuh-indexer/certs
ix() { sudo curl -s --cacert $C/root-ca.pem --cert $C/admin.pem --key $C/admin-key.pem "https://127.0.0.1:9200/$1"; echo; }
ix 'wazuh-ens-configuration/_doc/active?_source_includes=updatedAt'
ix 'wazuh-ens-configuration/_count'
ix 'wazuh-alerts-*/_count?q=_exists_:data.ensfacil'
```

Qué tiene que salir: `"found":true` con el `updatedAt` del último guardado de la
configuración, el número de documentos de configuración y el número de hechos
de ENSFácil. Anota los tres antes de cambiar de versión: después, la
configuración tiene que ser la misma (mismo `updatedAt`, mismos documentos) y
los hechos, los mismos o más, porque los runbooks siguen enviando.

## 11. Actualizar a una release nueva

1. Lee las notas de la release nueva. Fíjate en su compatibilidad y en si trae
   controles nuevos.
2. Guarda una copia del documento de configuración ENS:

   ```bash
   sudo mkdir -p /opt/ensfacil/artifacts
   sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://127.0.0.1:9200/wazuh-ens-configuration/_doc/active \
     | sudo tee "/opt/ensfacil/artifacts/active-$(date +%Y%m%d-%H%M%S).json" >/dev/null
   ```

3. Descarga la versión nueva en su propia carpeta y compruébala: apartados 4, 6.3
   (o 5) y 7, con la versión nueva en `V`. Con el token guardado, basta el
   apartado 6.3.
4. Despliégala como en el apartado 8. `deploy-plugin.sh` sustituye solo
   `ensfacil` y guarda antes la versión instalada en `/var/backups/ensfacil/`.
5. Comprueba como en el apartado 10. La lista de plugins tiene que decir la
   versión nueva.
6. Si la versión trae controles o parámetros nuevos, siembra su configuración
   **después** de desplegar
   ([guía de actualización, apartado 8](02-updating-an-existing-environment.md#8-sembrar-y-validar-la-configuración)).

> [!important]
> El orden importa: primero el plugin nuevo y después la siembra. El plugin
> instalado valida el documento de configuración con sus propias reglas: sembrar
> antes puede dejar el panel entero sin cargar.

Conserva la carpeta de la versión anterior hasta validar la nueva. El
procedimiento completo, con las reglas del manager y los agentes, está en la
[guía de actualización](02-updating-an-existing-environment.md).

## 12. Venir de la versión integrada

Si el entorno todavía tiene la versión integrada (el plugin de Wazuh modificado,
con la app «ENS» en el menú), sigue la
[transición desde la versión integrada](02-updating-an-existing-environment.md#10-transición-desde-la-versión-integrada).
Usa el zip de la release y el `deploy-plugin.sh` de su carpeta. La configuración
no se migra: las dos versiones usan el mismo índice.

## 13. Volver a una versión anterior

Para volver atrás, despliega la release de la versión anterior. Si ya no tienes
su carpeta, descárgala de nuevo (apartado 6.3 con esa versión en `V`). Cambia
`X.Y.Z` por la versión a la que vuelves:

```bash
V=X.Y.Z
R=/opt/ensfacil/releases/$V
cd "$R" && sha256sum -c SHA256SUMS \
  && sudo bash deploy-plugin.sh "ensfacil-$V-osd-2.19.5.zip"
```

Qué tiene que salir: `OK` en los tres ficheros y, al final, `dashboard: active`.
Comprueba después como en el apartado 10: la lista de plugins tiene que decir la
versión anterior.

Si la versión retirada había sembrado controles que la anterior no conoce,
restaura también la copia de la configuración. El procedimiento completo está
en el [diagnóstico y rollback, apartado 4](04-troubleshooting-and-rollback.md#4-reinstalar-la-versión-anterior-de-ensfácil).

## 14. Lo que la release no instala

El plugin juzga: contrasta los hechos con la política declarada en pantalla.
No recoge nada. Los hechos los producen las reglas del manager y los runbooks de
cada máquina, y se instalan aparte:

- las reglas en el manager, con el `install-manager.sh` de cada runbook
  ([guía de instalación, apartados 10 a 12](01-installation-from-scratch.md#10-configurar-el-acceso-autorizado-a-gitlab));
- los recolectores en cada máquina, con la guía `01-installation` de cada
  runbook ([runbooks y registros](05-runbooks-and-registers.md#runbooks-por-control));
- la configuración ENS, con las herramientas de `config/` del repositorio
  ([guía de instalación, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens)).

Sin las reglas y los runbooks, el panel no tiene hechos que juzgar.

## 15. Cambiar de versión o desinstalar

| Tienes | Quieres | Qué hacer |
|---|---|---|
| la versión integrada (el plugin de Wazuh modificado, con la app «ENS») | ENSFácil desde una release | la [transición desde la versión integrada](02-updating-an-existing-environment.md#10-transición-desde-la-versión-integrada): instalar la release junto a la integrada, comparar y reinstalar el paquete oficial `wazuh-dashboard` 4.14.7 |
| una release de ENSFácil | una más nueva | el apartado 11 |
| una release de ENSFácil | la anterior | el apartado 13 |
| ENSFácil, después de la transición | la versión integrada otra vez | [volver a la versión integrada](04-troubleshooting-and-rollback.md#6-volver-a-la-versión-integrada), mientras se conserve la carpeta de la transición |
| ENSFácil | quitarlo | lo de abajo |

En todos los casos los datos se quedan donde están: compruébalo antes y después
como en el apartado 10.1.

Desinstalar ENSFácil no toca el plugin de Wazuh ni los datos:

```bash
sudo systemctl stop wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove ensfacil
sudo rm -rf /usr/share/wazuh-dashboard/plugins/ensfacil
sudo systemctl start wazuh-dashboard
```

Qué tiene que salir, y cómo quitar además el rol y la configuración si ENSFácil
no se va a volver a usar: [retirar ENSFácil](04-troubleshooting-and-rollback.md#5-retirar-ensfácil).
