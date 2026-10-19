# Instalación completa de ENSFácil desde cero
[English](01-installation-from-scratch.en.md)

[[_TOC_]]

## 1. Objetivo

Despliegue de ENSFácil desde una máquina limpia, con solo los repositorios autorizados de GitLab y los artefactos versionados.

## 2. Punto de partida

Esta ruta parte de una instalación de Ubuntu Server que dispone únicamente de:

- acceso administrativo mediante `sudo`;
- conectividad de red;
- acceso a Internet cuando sea necesario;
- acceso autorizado a los repositorios GitLab del proyecto.

No se presupone instalado nada: Wazuh, ENSFácil, el árbol de OpenSearch Dashboards, Node.js, Yarn, las reglas ENS, el grupo `ens` ni la configuración inicial.

> [!important]
> Instalación por paquetes de Wazuh, con el indexer en la misma máquina (todo en uno). Con Wazuh en Docker: [Wazuh en Docker](06-wazuh-in-docker.md); el plugin, el rol, la siembra y la validación se hacen allí de otra forma y la parte del manager se ejecuta sin `systemctl`, `hostname`, cron ni `git`.
>
> Enlaces a cada runbook y a sus guías, y registros de la organización: [Runbooks y registros de la organización](05-runbooks-and-registers.md).

## 3. Resultado esperado

Wazuh y ENSFácil instalados y validados: reglas del manager, plugin `ensfacil` junto al plugin oficial de Wazuh (sin modificar), rol `ensfacil_admin` y configuración inicial.

## 4. Principio de reproducibilidad

La instalación debe completarse desde una máquina limpia con solo GitLab y esta documentación, sin copiar ficheros de otro servidor ENSFácil.

## 5. Versiones y compatibilidad

ENSFácil debe desplegarse únicamente sobre combinaciones de versiones que hayan sido validadas.

Las combinaciones utilizadas en la validación de esta guía son:

| Componente | Versión |
|---|---|
| ENSFácil | `1.0.0` (validación inicial) y `1.1.0` |
| Wazuh | `4.14.7` |
| OpenSearch Dashboards | `2.19.5` |
| Node.js para compilación | `18.19.0` |

La matriz de compatibilidad se mantiene en:

[`docs/deployment/03-version-compatibility.md`](03-version-compatibility.md)

> [!note]
> Una versión nueva de Wazuh no es compatible por defecto: ENSFácil se compila para una versión exacta de OpenSearch Dashboards. Si la versión nueva de Wazuh Dashboard lleva otra, recompilar y validar antes de actualizar.

## 6. Flujo completo de instalación

Bloques de la instalación:

```mermaid
flowchart LR
  A["1. Instalar y validar<br/>Wazuh 4.14.7"] --> B["2. Descargar ENSFácil<br/>y los runbooks desde GitLab"]
  B --> C["3. Preparar Wazuh Manager<br/>para los controles ENS"]
  C --> D["4. Instalar el plugin<br/>ENSFácil (release o compilado)<br/>y crear su rol"]
  D --> E["5. Validar que ENSFácil<br/>queda instalado y operativo"]
```

1. Instalar y validar Wazuh 4.14.7.
2. Descargar ENSFácil y los runbooks desde GitLab.
3. Preparar Wazuh Manager para los controles ENS.
4. Instalar el plugin ENSFácil en Wazuh Dashboard, desde una release o compilado, y crear el rol `ensfacil_admin`.
5. Validar que ENSFácil queda instalado y operativo.

## 7. Regla de validación

Terminar un comando sin errores no basta: cada fase incluye una comprobación objetiva del resultado.

> [!important]
> Si una validación falla, el despliegue debe detenerse en ese punto. No se continuará con las fases posteriores hasta identificar y resolver la causa.

## 8. Preparar y validar la máquina base

### 8.1 Entorno utilizado para validar esta guía

La instalación inicial de esta guía se ha validado sobre el siguiente entorno de laboratorio:

| Recurso | Valor |
|---|---|
| Sistema operativo | Ubuntu Server `24.04.4 LTS` |
| Arquitectura | `x86_64` |
| CPU | 4 CPU lógicas |
| Memoria | 7,8 GiB de RAM |
| Disco | 80 GB de disco virtual |
| Red | conectividad a Internet |
| Acceso | acceso administrativo mediante `sudo` |

> [!note]
> Entorno de validación; ni sus valores ni su topología de red son requisitos mínimos de ENSFácil.

### 8.2 Comprobaciones previas

Comprobar sistema operativo, arquitectura, recursos, conectividad y herramientas básicas:

```bash
cat /etc/os-release
uname -m
nproc
free -h
df -h /
ip -br addr
ip route
getent hosts gitlab.com
curl -Is --max-time 10 https://gitlab.com | head -1
command -v sudo apt git curl wget python3
```

> [!warning]
> No continuar sin acceso administrativo o sin la conectividad necesaria para obtener repositorios y paquetes.

## 9. Instalar y validar Wazuh 4.14.7

ENSFácil necesita una instalación funcional y validada de Wazuh antes de instalar el plugin.

Si Wazuh 4.14.7 no está instalado, seguir antes la [Guía de instalación de Wazuh 4.14.7](https://gitlab.com/quersystem/wazuh-4-installation-and-sizing-guide), pasos 1 a 4, y comprobar después que la plataforma está operativa.

### 9.1 Validar la instalación de Wazuh

Comprobar las versiones instaladas:

```bash
dpkg-query -W -f='${Package} ${Version}\n' wazuh-manager wazuh-indexer wazuh-dashboard
```

Comprobar que los servicios principales están activos:

```bash
sudo systemctl is-active wazuh-manager wazuh-indexer wazuh-dashboard filebeat
```

Resultado esperado: `active` en los cuatro servicios.

`wazuh-manager`, `wazuh-indexer` y `wazuh-dashboard` deben ser Wazuh `4.14.7` (paquetes `4.14.7-1`), con los cuatro servicios `active` y el acceso al Dashboard validado según el paso 4 de la guía de Wazuh.

> [!warning]
> Si alguna de estas comprobaciones falla, no continuar con la instalación de ENSFácil hasta resolver la causa.

## 10. Configurar el acceso autorizado a GitLab

Comprobar el acceso autorizado a los repositorios GitLab del proyecto antes de clonar.

### 10.1 Validar el acceso al repositorio principal

Comprobar que Git puede acceder mediante SSH al repositorio principal de ENSFácil:

```bash
git ls-remote git@gitlab.com:quersystem/plugin-wazuh-ens.git HEAD
```

Resultado esperado: un hash seguido de `HEAD`. Si Git solicita autenticación y no puede acceder al repositorio, no continuar hasta disponer de acceso autorizado.

### 10.2 Clonar el repositorio de ENSFácil

Crear el directorio base de ENSFácil y asignarlo al usuario administrativo que realizará el despliegue:

```bash
sudo mkdir -p /opt/ensfacil
sudo chown "$USER":root /opt/ensfacil
sudo chmod 755 /opt/ensfacil
git clone git@gitlab.com:quersystem/plugin-wazuh-ens.git /opt/ensfacil/repo
```

Después de la clonación, comprobar el repositorio y su remoto:

```bash
git -C /opt/ensfacil/repo remote -v
git -C /opt/ensfacil/repo branch --show-current
git -C /opt/ensfacil/repo status --short
```

Resultado esperado: el remoto `git@gitlab.com:quersystem/plugin-wazuh-ens.git`, la rama `main` y ningún cambio local.

### 10.3 Clonar los runbooks ENS

En el servidor Wazuh Manager, clonar bajo `/opt/ensfacil` los 22 runbooks Linux que se instalan, junto al repositorio principal (`tests/check-consistency.py` los lee como directorios hermanos de `/opt/ensfacil/repo`):

```bash
cat > /opt/ensfacil/runbooks.txt <<'EOF'
mp.info.6
op.acc.1
op.acc.2
op.acc.3
op.acc.4
op.acc.5
op.acc.6
op.exp.1
op.exp.2
op.exp.3
op.exp.4
op.exp.5
op.exp.6
op.exp.7
op.exp.8
op.exp.9
op.exp.10
op.mon.1
op.mon.2
op.mon.3
op.nub.1
op.cont.3
EOF

cd /opt/ensfacil
BASE=git@gitlab.com:quersystem/ens-controls-runbook/linux
while read -r r; do
  git clone "$BASE/$r.git" || break
done < /opt/ensfacil/runbooks.txt
# mp.info.6 tiene además un runbook para Zimbra; comparte las reglas y la
# comprobación de coherencia lo compara también.
git clone git@gitlab.com:quersystem/ens-controls-runbook/zimbra/zimbra-mta/mp.info.6.git zimbra-mta/mp.info.6
```

`/opt/ensfacil/runbooks.txt` se reutiliza en los pasos siguientes. El runbook de op.cont.2 (`linux/op.cont.2`) es solo documentación y no se clona en el manager.

> [!note]
> Cada runbook se llama como su control; el subgrupo indica la plataforma. Las variantes de Zimbra LDAP (`quersystem/ens-controls-runbook/zimbra/zimbra-ldap`) y Windows (`quersystem/ens-controls-runbook/windows`) se clonan en sus máquinas según su propia guía. En el manager bastan los runbooks Linux.

### 10.4 Validar los runbooks clonados

Comprobar que los 22 repositorios clonados existen y apuntan al remoto esperado:

```bash
while read -r r; do
  printf '%-48s %s\n' "$r" "$(git -C "/opt/ensfacil/$r" remote get-url origin 2>&1)"
done < /opt/ensfacil/runbooks.txt
```

Resultado esperado: los 22 repositorios con una URL bajo `git@gitlab.com:quersystem/ens-controls-runbook/linux/`.

## 11. Crear y validar el grupo ENS

> [!note]
> Este apartado crea los grupos en el manager. Agentes en los grupos, llegada de la configuración y alcance ENS: [configuración inicial de ENSFácil](https://gitlab.com/quersystem/ens-controls-runbook/initial-setup).

Antes de instalar las reglas de los controles, crear el grupo compartido `ens` en Wazuh Manager y el grupo `ens-copias`, el propio de mp.info.6, en el que solo van las máquinas cuyas copias se miden:

```bash
sudo /var/ossec/bin/agent_groups -a -g ens -q
sudo /var/ossec/bin/agent_groups -a -g ens-copias -q
```

Comprobar que Wazuh ha creado la estructura compartida del grupo:

```bash
sudo test -d /var/ossec/etc/shared/ens && echo "GRUPO_ENS=OK"
sudo test -f /var/ossec/etc/shared/ens/agent.conf && echo "AGENT_CONF_ENS=OK"
sudo grep -c "<agent_config" /var/ossec/etc/shared/ens/agent.conf
sudo test -f /var/ossec/etc/shared/ens-copias/agent.conf && echo "AGENT_CONF_ENS_COPIAS=OK"
sudo grep -c "<agent_config" /var/ossec/etc/shared/ens-copias/agent.conf
```

Resultado esperado: `GRUPO_ENS=OK`, `AGENT_CONF_ENS=OK`, `1`, `AGENT_CONF_ENS_COPIAS=OK` y `1`.

> [!warning]
> La instalación de las reglas ENS no debe continuar si los grupos `ens` y `ens-copias` o sus `agent.conf` no existen: sin `ens-copias`, el `install-manager.sh` de mp.info.6, el primero del bucle, se detiene.

> [!important]
> El `agent.conf` de cada grupo debe tener **un único bloque `<agent_config>`**: por eso las dos comprobaciones `grep -c` dan `1`. Los `install-manager.sh` de todos los controles se niegan a modificar un `agent.conf` sin bloque o con más de uno. Cualquier ajuste adicional del grupo, por ejemplo un `<syscheck>`, se añade dentro del bloque existente, nunca en un segundo `<agent_config>`. Después de una edición manual, validar el fichero con `sudo /var/ossec/bin/verify-agent-conf -f /var/ossec/etc/shared/ens/agent.conf`.

## 12. Instalar y validar las reglas ENS en el Manager

Con los grupos `ens` y `ens-copias` creados y los runbooks clonados, hacer una copia de la configuración del manager y ejecutar los instaladores del Manager. El proceso se detiene en el primero que falle:

```bash
sudo mkdir -p /opt/ensfacil/artifacts
sudo chown "$USER":root /opt/ensfacil/artifacts
sudo tar czf "/opt/ensfacil/artifacts/manager-$(date +%Y%m%d-%H%M%S).tar.gz" \
  -C /var/ossec etc/rules etc/decoders etc/shared/ens etc/shared/ens-copias etc/ossec.conf

(
while read -r r; do
  echo "===== $r ====="
  sudo bash "/opt/ensfacil/$r/install-manager.sh" || { echo "ERROR: $r"; exit 1; }
done < /opt/ensfacil/runbooks.txt
)
```

`install-manager.sh` de op.exp.7, op.exp.8 y op.exp.9 instala además un recolector que se ejecuta en el propio manager cada hora, sin ninguna credencial (solo lee ficheros locales), y añade su `<localfile>` al `ossec.conf` del manager, porque el `agent.conf` del grupo `ens` no se aplica al manager. Sus hechos llegan con `agent.id=000`.

Los de op.mon.1, op.mon.2, op.mon.3, op.nub.1 y op.cont.3 (versión 1.1.0) hacen lo mismo: cada uno instala su recolector en `/usr/local/bin/` (`ens_opmon1_collect.sh`, `ens_opmon2_collect.sh`, `ens_opmon3_collect.sh`, `ens_opnub1_collect.sh`, `ens_opcont3_collect.sh`), su `<localfile>` en el `ossec.conf` del manager y un cron en `/etc/cron.d`. Necesitan `jq` y respetan `ENSFACIL_SYSTEMCTL`. La cadencia del cron es horaria en op.mon.1, op.mon.3 y op.nub.1, y cada 6 horas en op.mon.2 y op.cont.3; op.mon.1 y op.nub.1 hacen su pasada completa cada 6 horas, y op.mon.3 la hace cada 6 horas (la superficie, cada 12). op.mon.3 tiene además un recolector de agente: su `install.sh`, en cada máquina del grupo `ens`, instala `ens_opmon3_agent_collect.sh` con un cron horario. op.cont.2 no tiene recolector ni reglas (su runbook es solo de documentación): el plugin lo evalúa a partir de las tablas de la pantalla de Configuración. op.cont.2 y op.cont.3 solo aplican con Disponibilidad (D) en ALTO; en MEDIO muestran «No aplica».

### 12.1 Validar la instalación de las reglas

Cada `install-manager.sh` realiza una comprobación bloqueante con `wazuh-logtest`. La instalación se considera correcta cuando se validan las siguientes reglas:

| Control | Regla | Control | Regla |
|---|---|---|---|
| `mp.info.6` | `106601` | `op.exp.3` | `110401` |
| `op.acc.1` | `106873` | `op.exp.4` | `110505` |
| `op.acc.2` | `106902` | `op.exp.5` | `110601` |
| `op.acc.3` | `107001` | `op.exp.6` | `110701` |
| `op.acc.4` | `107106` | `op.exp.7` | `110801` |
| `op.acc.5` | `110001` | `op.exp.8` | `110901` |
| `op.acc.6` | `110101` | `op.exp.9` | `111001` |
| `op.exp.1` | `110205` | `op.exp.10` | `111197` |
| `op.exp.2` | `110304` | `op.mon.1` | `111201` |
| `op.mon.2` | `111301` | `op.mon.3` | `111401` |
| `op.nub.1` | `111501` | `op.cont.3` | `111701` |

En mp.info.6, `install-manager.sh` de los dos runbooks (Proxmox y Zimbra) comprueba con `wazuh-logtest` que casa `106601` (`backup_run`). Después, en el índice, la regla que hay que buscar es `106797` (`collector_run`), el latido que el recolector emite en cada pasada aunque todavía no haya ninguna copia.

Después de ejecutar los instaladores, comprobar también que Wazuh Manager permanece activo, que su configuración es válida y que el plugin y los runbooks son coherentes:

```bash
sudo systemctl is-active wazuh-manager
sudo /var/ossec/bin/wazuh-analysisd -t && echo "CONFIG_MANAGER=OK"
cd /opt/ensfacil/repo && python3 tests/check-consistency.py | tail -1
```

Resultado esperado: `active`, `CONFIG_MANAGER=OK` y `consistency OK`. `check-consistency.py` compara las reglas que acredita el plugin con las de los runbooks clonados en `/opt/ensfacil`, no con las del manager.

> [!warning]
> Si cualquiera de los instaladores falla, no confirma su regla esperada o el Manager no queda activo, detener el despliegue antes de continuar.

> [!important]
> Si un `install-manager.sh` falla **después** de copiar sus reglas, al volver a ejecutarlo no detecta cambios y **no reinicia** el manager, así que las reglas nuevas pueden no estar cargadas aunque el instalador termine bien. En ese caso, reiniciar a mano y confirmar la regla del control con `wazuh-logtest`:
>
> ```bash
> sudo systemctl restart wazuh-manager
> sudo /var/ossec/bin/wazuh-logtest
> ```

## 13. Instalar el plugin

Plugin `ensfacil`, instalado **junto** al plugin oficial de Wazuh, que no se modifica ni se retira.

### 13.1 Elegir de dónde sale el zip

Dos formas de conseguir el zip; ambas terminan en el apartado 13.4.

| Opción | Cuándo | Guía |
|---|---|---|
| A. Desde una release (por defecto) | existe una release para la versión de Wazuh instalada | [Instalar desde una release](07-installing-from-a-release.md) |
| B. Compilar desde el código fuente | una versión sin release, la evaluación de otra versión de Wazuh o el desarrollo del plugin | [Compilar desde el código fuente](08-building-from-source.md) |

> [!note]
> Un zip compilado para otra versión de OpenSearch Dashboards no se instala. Para Wazuh 4.14.7 hace falta un zip para OpenSearch Dashboards `2.19.5`.

### 13.2 Opción A: desde una release

Descargar los cuatro ficheros de la release en `/opt/ensfacil/releases/<versión>`, desde el navegador o desde el servidor con un token de despliegue ([guía 07, apartados 4 a 6](07-installing-from-a-release.md#4-preparar-la-carpeta-en-el-servidor)), y verificar su integridad:

```bash
V=1.2.0
R=/opt/ensfacil/releases/$V
cd "$R"
sha256sum -c SHA256SUMS
```

Resultado esperado: `OK` en los tres ficheros. Si alguno indica `FAILED`, detener el procedimiento.

Continuar en el apartado 13.4 con:

```bash
ZIP=$R/ensfacil-$V-osd-2.19.5.zip
DEPLOY=$R/deploy-plugin.sh
```

### 13.3 Opción B: compilar desde el código fuente

Compilar y validar el zip con la [guía 08](08-building-from-source.md): con Node.js 18.19.0, Yarn Classic 1.22.22 y el árbol de OpenSearch Dashboards 2.19.5 en `/opt/ensfacil/build` (apartado 3), o con la imagen de compilación de CI (apartado 4). Validar el zip antes de continuar (apartado 5).

Continuar en el apartado 13.4 con estas rutas. Si el zip se compiló con la imagen en otro equipo, copiar el zip al servidor e indicar su ruta en `ZIP`:

```bash
ZIP=/opt/ensfacil/build/plugins/ensfacil/build/ensfacil-2.19.5.zip
DEPLOY=/opt/ensfacil/repo/config/deploy-plugin.sh
```

### 13.4 Instalar el plugin en Wazuh Dashboard

Instalar el zip con `deploy-plugin.sh`, con `ZIP` y `DEPLOY` del apartado 13.2 o del 13.3:

```bash
sudo -u wazuh-dashboard test -r "$ZIP" && echo "ZIP_ACCESIBLE=OK"

sudo bash "$DEPLOY" "$ZIP"
```

El script para el dashboard, retira la versión anterior de `ensfacil`, instala el zip, **sube el `build.number`** y arranca el dashboard. Solo toca `ensfacil`; el plugin de Wazuh (`wazuh`, `wazuhCore`, `wazuhCheckUpdates`) no cambia.

Resultado esperado: al final del despliegue, `dashboard: active` y, en `plugins:`, `ensfacil` junto a `wazuh`, `wazuhCore` y `wazuhCheckUpdates`.

Si algo falla, el script indica cómo volver al estado anterior y sale con error. Los códigos de salida y las copias que guarda están en el [diagnóstico, apartado 4.1](04-troubleshooting-and-rollback.md#41-si-deploy-pluginsh-falla-a-medias).

> [!important]
> Sin subir el `build.number`, el navegador sigue usando los ficheros de la versión anterior (ni una recarga forzada lo evita): instalar siempre con el script. El script guarda `package.json` como `package.json.antes-<fecha>`.

Comprobar:

```bash
sudo systemctl is-active wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin list
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/api/ensfacil/configuration
```

Resultado esperado:

| Comprobación | Resultado esperado |
|---|---|
| servicio | `active` |
| plugins | `ensfacil@1.2.0` (la versión instalada) y `wazuh@4.14.7-01`, entre otros |
| `/api/ensfacil/configuration` | `401`: la ruta del plugin existe y pide sesión. Un `404` significa que el plugin no ha cargado ([diagnóstico](04-troubleshooting-and-rollback.md)) |

### 13.5 Crear el rol ensfacil_admin

> [!note]
> Necesario solo si un usuario sin `all_access` debe guardar la configuración o consultar su historial. El usuario `admin` de Wazuh tiene `all_access`.

Sin `ensfacil_admin` ni `all_access`, guardar la configuración o ver su historial devuelve el error 403: «Hace falta el rol ensfacil_admin o all_access para cambiar la configuración ENS o ver su historial.».

`config/create-admin-role.sh` crea el rol y, si se le pide, lo asigna. Usa el certificado de administrador del indexer, sin contraseña, y verifica el certificado del indexer contra su CA (por defecto `/etc/wazuh-indexer/certs/root-ca.pem`; otra con `OS_CA`). Conexión por defecto: `https://127.0.0.1:9200`; con `localhost` la verificación falla. En Docker: [Wazuh en Docker, apartado 5](06-wazuh-in-docker.md#5-crear-el-rol-ensfacil_admin).

Con la opción A, la carpeta de la release trae `$R/create-admin-role.sh`, verificado con `SHA256SUMS` y con las mismas opciones.

> [!note]
> El rol no concede permisos por sí mismo: cada usuario necesita además su rol de Wazuh con lectura de `wazuh-alerts-*` y `wazuh-monitoring-*`.

Primero en modo prueba, que no cambia nada. Sustituir `<usuario>` por el usuario del dashboard que administrará ENSFácil:

```bash
sudo bash /opt/ensfacil/repo/config/create-admin-role.sh --dry-run --mapear <usuario>
```

El resultado siguiente corresponde a un rol que todavía no está asignado a ningún usuario.

Resultado esperado:

```text
== dry-run mode: no change is sent
== role ensfacil_admin
PUT _plugins/_security/api/roles/ensfacil_admin {"description":"ENSFácil: puede cambiar la configuración ENS y ver su historial","cluster_permissions":[],"index_permissions":[],"tenant_permissions":[]}
== assignment of ensfacil_admin
PUT _plugins/_security/api/rolesmapping/ensfacil_admin {"users":["<usuario>"]}
```

Si el rol ya está asignado a otros usuarios, la última línea es un `PATCH` que añade `<usuario>` sin quitar a nadie.

Después, la ejecución real:

```bash
sudo bash /opt/ensfacil/repo/config/create-admin-role.sh --mapear <usuario>
```

Resultado esperado: `-> 200` o `-> 201` después de cada petición y, al final, `users with the role ensfacil_admin: <usuario>`.

- Repetible: solo se añaden los usuarios que falten.
- Varios usuarios: `--mapear <usuario1> --mapear <usuario2>`.
- Sin `--mapear`, el script solo crea el rol.
- Si un usuario con sesión abierta sigue recibiendo el error 403, cerrar la sesión e iniciar otra.

### 13.6 Comprobar ENSFácil en el navegador

Entrar en Wazuh Dashboard y comprobar que:

- en el menú, dentro de «Security operations», aparece «ENSFácil»;
- en la portada de OpenSearch Dashboards (`/app/home`), la tarjeta «ENSFácil» abre la aplicación; en la portada de Wazuh, ENSFácil solo está en el menú;
- se abre en la pestaña Panel, con las pestañas Panel, Vista general, Configuración, Controles, Detalle del control, Informes, Evidencias y Eventos;
- hay un selector «Máquina» para ver todas las máquinas del alcance o una sola.

En una instalación nueva, seguir con el apartado 14: la configuración ENS se crea con el primer guardado.

## 14. Inicializar y sembrar la configuración ENS

Las herramientas de `config/` usan el **certificado de administrador del indexer** (`/etc/wazuh-indexer/certs/` en todo en uno), sin contraseña, y se ejecutan con `sudo` porque solo `root` lee la clave:

```bash
CERT="OS_CERT=/etc/wazuh-indexer/certs/admin.pem OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem"
IDX=https://127.0.0.1:9200
```

> [!note]
> Con el indexer en otra máquina, exportar `ENS_OS_URL` y usar el certificado de administrador de ese indexer. `OS_USER` y `OS_PASS` existen, pero no se recomiendan. En Docker: [Wazuh en Docker, apartados 6 a 10](06-wazuh-in-docker.md#6-primer-guardado-de-la-configuración).

> [!note]
> `inject-control.py` y `set-parameters.py` no verifican el certificado del indexer, por lo que admiten `127.0.0.1` o `localhost`. `create-admin-role.sh` sí lo verifica contra la CA (apartado 13.5) y necesita el nombre para el que está emitido el certificado.

### 14.1 Crear la configuración activa

En una instalación limpia, el índice `wazuh-ens-configuration` puede existir todavía sin el documento `active`.

Acceder desde Wazuh Dashboard a ENSFácil > Configuración y realizar un primer guardado de la configuración, con un usuario que tenga el rol `ensfacil_admin` o `all_access` (apartado 13.5). Con otro usuario, el guardado devuelve el error 403.

> [!important]
> Abrir la pantalla no basta: el primer guardado crea el documento `active`.

Después del guardado, comprobar desde el servidor que el documento existe:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  "$IDX/wazuh-ens-configuration/_doc/active?filter_path=found,_source.documentType&pretty"
```

| Comprobación | Resultado esperado |
|---|---|
| `found` | `true` |
| `_source.documentType` | `ACTIVE_CONFIGURATION` |

> [!warning]
> Si el documento todavía no existe, no ejecutar la siembra de controles hasta completar correctamente el primer guardado desde la pantalla de Configuración.

### 14.2 Copiar el documento antes de modificarlo

Antes de cada siembra o cambio de parámetros, guardar una copia del documento `active`:

```bash
BACKUP_DOC=/opt/ensfacil/artifacts/active-$(date +%Y%m%d-%H%M%S).json
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  "$IDX/wazuh-ens-configuration/_doc/active" | sudo tee "$BACKUP_DOC" >/dev/null
sudo python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print('COPIA_OK' if d.get('found') else 'COPIA_FALLIDA')" "$BACKUP_DOC"
```

La restauración de esta copia se describe en la [guía de diagnóstico y rollback](04-troubleshooting-and-rollback.md#7-restaurar-la-configuración-ens).

### 14.3 Sembrar los controles ENS

> [!important]
> Sembrar solo con el plugin ya desplegado (apartado 13.4). El motivo está en [Instalar desde una release, apartado 11](07-installing-from-a-release.md#11-actualizar-a-una-release-nueva).

Sembrar los 23 controles. Primero en modo de prueba (sin `--apply`), que muestra el plan sin escribir nada:

```bash
cd /opt/ensfacil/repo/config
CONTROLS="mp.info.6 op.acc.1 op.acc.2 op.acc.3 op.acc.4 op.acc.5 op.acc.6 op.exp.1 op.exp.2 op.exp.3 op.exp.4 op.exp.5 op.exp.6 op.exp.7 op.exp.8 op.exp.9 op.exp.10 op.mon.1 op.mon.2 op.mon.3 op.nub.1 op.cont.2 op.cont.3"

for c in $CONTROLS; do
  echo "===== $c ====="
  sudo env $CERT python3 inject-control.py "$c" || break
done
```

Revisar el plan de cada control (parámetros nuevos, valores que se conservan y, si aparece, la línea `NO LONGER IN THE BLOCK and lost`). Si es correcto, aplicarlo:

```bash
for c in $CONTROLS; do
  echo "===== $c ====="
  sudo env $CERT python3 inject-control.py "$c" --apply || break
done
```

| Comprobación | Resultado esperado |
|---|---|
| Salida de cada control | `== APPLIED ==` |

La siembra fusiona: conserva los valores existentes.

> [!note]
> Las evidencias que dependen de parámetros obligatorios sin valor quedan en `NO_EVALUABLE`, con causa `CONFIGURATION`, y sus requisitos no se acreditan hasta declararlos.

### 14.4 Validar el documento entero

Un valor que el plugin no acepta impide cargar el entorno ENS completo («No se pudo cargar el entorno ENS»). Tras cada siembra o cambio de parámetros, validar el documento completo con `config/validate-configuration.ts`. Requiere Node.js 18 o superior e Internet (`npx` descarga `tsx`; `yarn` instala `re2js`):

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem \
  "$IDX/wazuh-ens-configuration/_doc/active" -o /opt/ensfacil/artifacts/active-now.json

cd /opt/ensfacil/repo
npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive
npx --yes tsx config/validate-configuration.ts /opt/ensfacil/artifacts/active-now.json
```

Resultado esperado: `Done` tras la instalación; después, `controls (23): …`, `VALID STRUCTURE: the plugin will load this configuration.` y `VALID AGENT AND TEMPLATE SETTINGS.` ([Configuración por controles y plantillas, apartado 11.2](09-configuration-by-system.md#112-validar-el-documento)). Si el manager no tiene Node.js con `npx` o no tiene salida a Internet, copiar el fichero `active-now.json` a la raíz de un clon del repositorio del plugin en otro equipo y ejecutar allí el mismo comando o, con Docker, `docker run --rm -v <repo>:/w -w /w node:22-alpine sh -c 'npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive && npx --yes tsx config/validate-configuration.ts /w/active-now.json'`. El validador importa el motor del plugin: necesita el repositorio completo, no solo `config/`.

> [!warning]
> Si la validación falla, restaurar la copia del apartado 14.2 antes de que nadie abra el panel, y corregir el parámetro indicado.

### 14.5 Declarar la política

Los valores de los parámetros los decide el responsable y se declaran en ENSFácil > Configuración: en «Controles», los ajustes comunes de cada control, sus plantillas (de serie para Linux, Servidor LDAP, Windows y Manager Wazuh, y propias) y la plantilla asignada a cada agente; en «Agentes», lo propio de cada máquina del alcance. Procedimiento completo: [Configuración por controles y plantillas](09-configuration-by-system.md). En Configuración > General se declaran también el nivel ENS y, opcionalmente, el nivel de cada dimensión: **Confidencialidad (C)**, **Integridad (I)**, **Trazabilidad (T)**, **Autenticidad (A)** y **Disponibilidad (D)**. Los usan los controles que el Anexo II aplica por dimensión: op.acc.2 a op.acc.6 (C, I, T y A), op.acc.1 (T y A), op.exp.8 (T) y mp.info.6, op.cont.2 y op.cont.3 (D); con varias dimensiones rige la más alta. Una dimensión sin declarar es el nivel ENS, que no puede ser inferior a ninguna. op.cont.2 y op.cont.3 solo aplican con D en ALTO: con el nivel ENS en MEDIO y sin D, muestran «No aplica».

Para declarar valores desde el servidor (entornos reproducibles, o cuando la política ya está decidida por escrito) se usa `config/set-parameters.py` con un fichero JSON:

```json
{
  "op.exp.8": {
    "P-05": ["ntp1.ejemplo.invalido | NTS", "ntp2.ejemplo.invalido | NTS"]
  }
}
```

```bash
cd /opt/ensfacil/repo/config
sudo env $CERT python3 set-parameters.py /ruta/politica.json            # plan
sudo env $CERT python3 set-parameters.py /ruta/politica.json --apply    # escribe
```

> [!important]
> `set-parameters.py` sustituye el valor **entero** de cada parámetro que nombra: una lista o tabla no se amplía, se reemplaza. Para añadir una fila hay que pasar la lista completa (las filas que ya había más la nueva). Los parámetros que el fichero no nombra no se tocan. Si el fichero nombra un parámetro que el control no declara, la herramienta se detiene sin escribir nada.

> [!note]
> Un parámetro vacío es la clave `value` **ausente**, nunca `null`. Para vaciar un parámetro, hacerlo desde la pantalla de Configuración.

La plantilla y los ajustes propios de un agente se declaran con la sección `agents` del mismo fichero: [Configuración por controles y plantillas, apartado 11.1](09-configuration-by-system.md#111-declarar-la-plantilla-y-los-ajustes-de-un-agente-con-set-parameterspy).

Después de declarar valores, repetir la validación del apartado 14.4.

### 14.6 Comprobar el panel

Abrir ENSFácil y comprobar que:

- aparecen los 23 controles;
- el alcance incluye, además de las máquinas del grupo `ens`, el manager (agente `000`), porque en él se evalúan nueve controles: op.cont.2, op.cont.3, op.exp.7, op.exp.8, op.exp.9, op.mon.1, op.mon.2, op.mon.3 y op.nub.1. Los ocho distintos de op.cont.2 tienen recolector en el manager; op.cont.2 se evalúa con las tablas de la pantalla de Configuración;
- tras la primera ejecución de los recolectores del manager (horaria o cada 6 horas, según el control), esos controles muestran datos en la fila del manager.

La evaluación se hace en el servidor con todos los hechos de la ventana de 30 días. La primera carga de cada usuario responde por partes: «Calculando la evaluación», con las filas (control × máquina) listas.

Resultado esperado: en unos segundos aparecen los primeros controles y, al completarse todos, las cifras del panel; la evolución diaria indica «Calculando la serie…» hasta que está calculada.

### 14.7 Comprobar la vista general y el detalle de un control

Abrir la pestaña **Vista general** con «Todas las máquinas» en el selector. En la primera carga muestra «Calculando la evaluación: X de N filas (control × máquina) listas», «…» en las filas pendientes de la matriz y, al final, las cifras por máquina y la cola de trabajo; la tendencia indica «Calculando la serie de 30 días» hasta tenerla.

| Sección | Qué muestra | Resultado esperado |
|---|---|---|
| Máquinas | Una fila por máquina del alcance (el manager al final): controles medidos por estado, requisitos que no cumplen y cuántos de ellos sin demostrar, último dato recibido (el más reciente entre el último hecho y el último latido del recolector) y sus tres peores controles. | Una máquina sin datos desde hace más de 24 h aparece en rojo. Pulsar su nombre la elige en el selector; pulsar uno de sus peores controles abre su detalle en esa máquina. |
| Controles × máquinas | Los 23 controles por las máquinas del alcance. En «Cumplimiento», cada celda es el porcentaje del control en esa máquina y, en rojo, los requisitos que no cumplen; rayada, «no se mide en esta máquina»; «en el manager», un control de la organización cuyo resultado está en la columna `000`. En «Frescura de la recogida», el último dato de ese control en esa máquina. | Pulsar una celda abre el Detalle del control de ese control en esa máquina. Un control que se mide en una máquina y del que no ha llegado nada en la ventana dice «nunca», en rojo. La columna «Máquinas», junto a la del control, dice cuántas máquinas cumplen, cuántas no y cuántas no tienen datos. Con muchas máquinas, la tabla se desplaza en horizontal y la columna del control queda fija; cada cabecera lleva el id y el nombre de la máquina. |
| Cola de trabajo | Las no conformidades de todos los controles, agrupadas por quien tiene que actuar: sistema auditado, organización, responsable ENS, operación Wazuh, productor de la evidencia, producto ENSFácil. Con una máquina elegida, solo las suyas. | Cada fila dice el control, el requisito y la primera frase de la evidencia que falla, sin la plantilla «Resuelta por la política…». Pulsar el control abre su detalle. |
| Tendencia de 30 días | El índice medio de cumplimiento de cada día, con el primer y el último día, y debajo el estado de cada control cada día, con su leyenda. | Cada día se evalúa con los hechos conocidos hasta ese día. Un control que ha cambiado de estado en la ventana aparece en negrita, con el estado inicial y el final. |

Cambiar de máquina en el selector con la Vista general abierta.

Resultado esperado: la vista no vuelve a cargarse ni pierde la vista elegida («Cumplimiento» o «Frescura de la recogida»); la máquina elegida se resalta y la cola de trabajo muestra solo lo suyo. Solo la tendencia se vuelve a calcular, porque es la de esa máquina.

Abrir después **Detalle del control** y elegir el manager (`000`) en el selector.

Resultado esperado: la lista muestra los 23 controles. Los 14 que solo se miden en las máquinas (mp.info.6, op.acc.1-6, op.exp.1-6 y op.exp.10) aparecen al final, en gris, con «No se mide en esta máquina» y el motivo, y sin número. Con el nivel BAJO, una línea indica «Nivel BAJO: 4 controles no aplican (…)», con un enlace a Configuración. Un control del catálogo que no está en la configuración activa muestra «No está en la configuración activa» y el botón «Añadir con valores por defecto».

Abrir op.acc.1 con el manager elegido.

Resultado esperado: el detalle no se queda vacío ni indica «Todo lo aplicable … conforme»; muestra «op.acc.1 no se mide en 000 · …», el motivo y los botones «Ver todas las máquinas» y, si el control declara las máquinas en que se mide (P-04 de mp.info.6), «Configurar P-04».

Cambiar a otra máquina con el detalle abierto.

Resultado esperado: la pestaña no se vuelve a montar. Mientras llega el resultado de la máquina nueva, una barra de progreso y el aviso «Cargando … Mientras tanto se muestra el resultado de …» indican de qué máquina y de qué hora es lo que se ve. Si la evaluación falla, el aviso de error aparece encima del último resultado, con «Reintentar»; la página no desaparece. Una máquina de la dirección que no está en el alcance ENS solo muestra el aviso del selector, con «Quitar la máquina y ver todas».

Revisar una tarjeta de no conformidad.

Resultado esperado: el titular es la evidencia que falla, su estado y la primera frase de su motivo, en peso normal; un titular de más de 200 caracteres se corta en un espacio con «…» y continúa debajo. Debajo aparecen el resto del motivo en texto normal, las listas como listas (una sola vez y detrás de la frase que las presenta), lo que va tras «Además» aparte, las demás evidencias del requisito con su estado y las que conforman plegadas. Cada parámetro citado es una insignia que indica el valor que aplica a esa máquina y su origen (propio de la máquina, de una plantilla o de la organización); al pulsarla se abre Configuración en ese parámetro. Pulsar una evidencia abre Evidencias filtrada por ese control, con el filtro a la vista y «Quitar filtro». Bajo la clase de la no conformidad aparece la acción concreta. «Ver detalle» muestra el motivo completo.

Pulsar **Configurar este control** en la cabecera del detalle.

Resultado esperado: se abre Configuración en ese control (en la página de la máquina elegida, si el control tiene parámetros por sistema o por plataforma) con «Volver al detalle de …» arriba, que devuelve al mismo control y a la misma máquina. El detalle abierto se conserva en la URL (`control=`): cambiar de pestaña y volver, o recargar la página, lo vuelve a abrir.

Los agentes se incorporan después, instalando en cada máquina los runbooks que le correspondan según su propia guía (`docs/deployment/01-installation.md` **de cada runbook**, enlazada en la [tabla de runbooks](05-runbooks-and-registers.md#runbooks-por-control)); las máquinas cuyas copias se miden van además al grupo `ens-copias` y a P-04 de mp.info.6. Los runbooks de op.acc.2, op.acc.3, op.acc.4, op.exp.3, op.exp.4, op.exp.5, op.exp.8 y op.exp.10 escriben reglas de auditd que se cargan con `sudo augenrules --load` al terminar.
