# Manager en contenedor (imágenes oficiales de Wazuh en Docker)
[English](06-wazuh-in-docker.en.md)

Qué cambia respecto a la [instalación desde cero](01-installation-from-scratch.md)
cuando Wazuh corre con las imágenes oficiales `wazuh/wazuh-manager` y
`wazuh/wazuh-dashboard` (Amazon Linux 2023). El orden de los pasos es el mismo;
aquí solo está lo que en un contenedor se hace de otra forma. En los ejemplos,
`MGR` es el nombre del contenedor del manager (`docker ps --format '{{.Names}}'`;
en el despliegue *single-node* oficial suele ser `single-node-wazuh.manager-1`).

> [!important]
> **Qué está verificado y qué no.**
>
> - **Verificado en laboratorio (VM con paquetes):** todo el procedimiento de la
>   [guía 01](01-installation-from-scratch.md).
> - **Verificado en laboratorio con la imagen `wazuh/wazuh-manager:4.14.7`**
>   (contenedor aislado, sin indexer ni agentes, 02/10/2026): las herramientas que
>   faltan; su instalación con `dnf`; los `install-manager.sh` de op.acc.1,
>   op.exp.7, op.exp.8 y op.exp.9 con `ENSFACIL_SYSTEMCTL` (reinicio y
>   `wazuh-logtest` correctos); los tres recolectores del manager lanzados con
>   `docker exec` y `ENS_HOST`; que el script de arranque de la imagen copia
>   `/wazuh-config-mount` sobre `/var/ossec` en cada arranque.
> - **Orientación sin probar todavía:** el despliegue completo con
>   `docker compose`, indexer y agentes; la imagen del dashboard con ENSFácil;
>   el cron del host (también los cinco recolectores de 1.1.0, que no se han probado en contenedor); la recreación del contenedor con los volúmenes propuestos;
>   un clúster con varios nodos. Lo que falte por comprobar dice «por verificar».

[[_TOC_]]

## 1. Lo que falta en la imagen del manager

| Falta | Quién lo usa | Qué pasa sin ello | Solución |
|---|---|---|---|
| `systemctl` | los `install-manager.sh`, para reiniciar el manager | el instalador falla al reiniciar y deshace su cambio | `ENSFACIL_SYSTEMCTL` (apartado 4) |
| `flock` | el emisor común de todos los recolectores | **no se escribe ningún hecho** (el emisor sale con error) | paquete `util-linux-core` |
| `jq` | los `install-manager.sh` de op.exp.7-9 y los cinco de 1.1.0 (op.mon.1-3, op.nub.1, op.cont.3), y el emisor | el instalador se detiene (el de op.exp.7 intenta `apt-get`, que no existe) | paquete `jq` |
| `hostname` | el emisor (campo `host` de cada hecho) | `host` sale vacío | paquete `hostname`, o `ENS_HOST` (apartado 5) |
| `cron` | los recolectores del manager (op.exp.7-9 y los cinco de 1.1.0: op.mon.1-3, op.nub.1, op.cont.3) | no se ejecutan nunca | cron del host con `docker exec` (apartado 6) |
| `git` | clonar los runbooks; compilar el plugin | — | clonar en el host y copiar; compilar fuera (apartado 7) |

`python3` sí está en la imagen.

## 2. Imagen del manager con las herramientas

Lo instalado con `dnf` dentro de un contenedor se pierde al recrearlo. Se fija
en una imagen propia, con la misma versión que la oficial:

```dockerfile
FROM wazuh/wazuh-manager:4.14.7
RUN dnf install -y jq util-linux-core hostname && dnf clean all
```

En el `docker-compose.yml`, el servicio del manager pasa a usar esa imagen. Para
salir del paso sin reconstruir (se pierde al recrear el contenedor):

```bash
docker exec MGR dnf install -y jq util-linux-core hostname
docker exec MGR sh -c 'command -v jq flock hostname'
```

## 3. Qué persiste y qué se pierde al recrear el contenedor

El despliegue oficial monta volúmenes en `/var/ossec/etc`, `/var/ossec/logs`,
`/var/ossec/queue`, `/var/ossec/api/configuration`, `/var/ossec/var/multigroups`,
`/var/ossec/integrations`, `/var/ossec/active-response/bin`,
`/var/ossec/agentless`, `/var/ossec/wodles`, `/etc/filebeat` y
`/var/lib/filebeat`.

| Ruta | Qué hay | ¿Persiste? |
|---|---|---|
| `/var/ossec/etc/rules/ensfacil_*.xml` | reglas de los 22 controles con reglas | sí (volumen de `/var/ossec/etc`) |
| `/var/ossec/etc/shared/ens/agent.conf`, `…/ens-copias/agent.conf` | `<localfile>` de los agentes | sí |
| `/var/ossec/etc/ossec.conf` | `<localfile>` del manager (op.exp.7-9 y los cinco de 1.1.0: op.mon.1-3, op.nub.1, op.cont.3) | **no, si se monta `wazuh_manager.conf`** (ver aviso) |
| `/etc/ensfacil/` | registros de la organización y `.env` | **no**: montar un volumen |
| `/var/lib/ensfacil/` | estado de los recolectores | **no**: montar un volumen |
| `/var/log/ensfacil/` | ficheros de hechos que lee logcollector | **no**: montar un volumen |
| `/opt/ensfacil/`, `/usr/local/bin/ens_op*` | librerías, plantillas y recolectores | no: volver a ejecutar los `install-manager.sh` de op.exp.7-9 y los cinco de 1.1.0 (op.mon.1-3, op.nub.1, op.cont.3) tras recrear (no pisan `.env` ni registros) |
| `/var/ossec/backup/` | copias que hacen los instaladores antes de tocar nada | no (opcional: volumen) |

```yaml
# docker-compose.yml, servicio del manager (añadir a sus volumes)
      - ensfacil_etc:/etc/ensfacil
      - ensfacil_state:/var/lib/ensfacil
      - ensfacil_log:/var/log/ensfacil
# y declarar ensfacil_etc, ensfacil_state y ensfacil_log en la sección volumes:
```

> [!warning]
> El despliegue oficial monta `config/wazuh_cluster/wazuh_manager.conf` en
> `/wazuh-config-mount/etc/ossec.conf`, y la imagen lo **copia encima de
> `/var/ossec/etc/ossec.conf` en cada arranque**. Los `<localfile>` que añaden
> los `install-manager.sh` de op.exp.7-9 y los cinco de 1.1.0 (op.mon.1-3, op.nub.1, op.cont.3) desaparecen en el
> siguiente reinicio del contenedor y esos controles se quedan sin datos.
> Hay que añadir este bloque, al final, **al fichero montado del host**:
>
> ```xml
> <!-- ENSFácil: hechos de los recolectores del manager -->
> <ossec_config>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_exp_7.json</location>
>   </localfile>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_exp_8.json</location>
>   </localfile>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_exp_9.json</location>
>   </localfile>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_mon_1.json</location>
>   </localfile>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_mon_2.json</location>
>   </localfile>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_mon_3.json</location>
>   </localfile>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_nub_1.json</location>
>   </localfile>
>   <localfile>
>     <log_format>json</log_format>
>     <location>/var/log/ensfacil/op_cont_3.json</location>
>   </localfile>
> </ossec_config>
> ```

## 4. Reglas en el manager: `install-manager.sh` sin systemd

Los `install-manager.sh` leen `SYSTEMCTL="${ENSFACIL_SYSTEMCTL:-systemctl}"` y
solo lo usan para una cosa: `"$SYSTEMCTL" restart wazuh-manager` (también en su
vuelta atrás). `wazuh-control restart wazuh-manager` ignora el segundo argumento,
reinicia todos los demonios y devuelve error si la configuración no es válida o
un demonio no arranca, así que la vuelta atrás de los instaladores sigue
funcionando. **No hay que editar los scripts**: basta con pasar la variable.

Los runbooks se clonan en el host (o en un puesto con acceso a GitLab), como en
el apartado 10.3 de la guía 01, y se copian al contenedor:

```bash
# en el host, con los 22 runbooks Linux en ./ensfacil/<control> y runbooks.txt
docker cp ./ensfacil/. MGR:/opt/ensfacil-runbooks/
docker exec MGR /var/ossec/bin/agent_groups -a -g ens -q
docker exec MGR /var/ossec/bin/agent_groups -a -g ens-copias -q

while read -r r; do
  echo "===== $r ====="
  docker exec -e ENSFACIL_SYSTEMCTL=/var/ossec/bin/wazuh-control MGR \
    bash "/opt/ensfacil-runbooks/$r/install-manager.sh" || { echo "ERROR: $r"; break; }
done < runbooks.txt
```

Comprobación (equivale al apartado 12.1 de la guía 01):

```bash
docker exec MGR /var/ossec/bin/wazuh-control status | grep -E 'analysisd|logcollector|remoted'
docker exec MGR /var/ossec/bin/wazuh-analysisd -t && echo "CONFIG_MANAGER=OK"
```

Donde la guía 01 dice `sudo systemctl restart wazuh-manager`, en el contenedor es
`docker exec MGR /var/ossec/bin/wazuh-control restart`. No usar
`docker restart` para esto: vuelve a copiar `wazuh_manager.conf` (aviso del
apartado 3).

## 5. El nombre de máquina sin el comando `hostname`

El emisor común (`/opt/ensfacil/ensfacil-emit.sh`) toma el campo `host` de
`ENS_HOST` y, si no está, de `$(hostname)`. Dos formas:

- con la imagen del apartado 2 (`hostname` instalado), sale el nombre del
  contenedor: fijarlo con `hostname:` en el `docker-compose.yml` (el oficial usa
  `wazuh.manager`) para que no cambie al recrear;
- o pasar `-e ENS_HOST=<nombre>` en cada `docker exec` (apartado 6).

En los recolectores del manager no hay otra llamada a `hostname`. Lo único que
`ENS_HOST` no cubre: op.exp.9 reconoce el propio manager en la columna
`sistemas` del registro de incidentes por el nombre del contenedor
(`socket.gethostname()` de Python, sin comando); con un `hostname:` fijo no hay
sorpresas.

## 6. Planificar los recolectores del manager desde el host

La imagen no tiene cron, y los `install-manager.sh` dejan sus ficheros en
`/etc/cron.d/` del contenedor, donde nadie los lee (no molestan). Se planifican
en el cron del host con las mismas cadencias que los runbooks:

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

La primera pasada, a mano (la de op.exp.7 siembra 30 días de alertas y tarda
unos minutos):

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

Si se activa el puente opcional de op.exp.4 (`--con-puente-vd`), su línea es
`40 * * * * root docker exec MGR /opt/ensfacil/ens_opexp4_vd_bridge.py >>/var/log/ensfacil/opexp4-vd-bridge.log 2>&1`
(por verificar en contenedor).

## 7. El plugin en el contenedor del dashboard

ENSFácil es un plugin propio (`ensfacil`) que se instala **junto** al plugin de
Wazuh, sin tocarlo. En contenedor se hace con una imagen propia basada en la
oficial.

**El zip.** Descarga el de la release para Wazuh `4.14.7` (OpenSearch
Dashboards `2.19.5`), `ensfacil-<versión>-osd-2.19.5.zip`, y compruébalo con su
`SHA256SUMS` ([Instalar desde una release](07-installing-from-a-release.md)).
Si hay que compilarlo, se hace **fuera de producción**, en un equipo de
compilación con exactamente las mismas versiones o con la imagen de compilación
de CI ([Compilar desde el código fuente](08-building-from-source.md); resultado
`ensfacil-2.19.5.zip`). Un zip de otra versión no se instala.

El `Dockerfile` de abajo espera el zip con el nombre `ensfacil-2.19.5.zip`. El de
la release se copia con ese nombre: `cp ensfacil-1.1.0-osd-2.19.5.zip ensfacil-2.19.5.zip`.

**Instalar.** `config/deploy-plugin.sh` presupone systemd y una instalación por
paquetes. En contenedor, lo mismo en una imagen propia, con el zip junto al
`Dockerfile`:

```dockerfile
FROM wazuh/wazuh-dashboard:4.14.7
USER root
COPY ensfacil-2.19.5.zip /tmp/ensfacil-2.19.5.zip
RUN /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin install file:///tmp/ensfacil-2.19.5.zip --allow-root \
 && rm /tmp/ensfacil-2.19.5.zip \
 && chown -R wazuh-dashboard:wazuh-dashboard /usr/share/wazuh-dashboard/plugins/ensfacil \
 && python3 -c "import json; f='/usr/share/wazuh-dashboard/package.json'; p=json.load(open(f)); p['build']['number']=str(int(p['build']['number'])+1); json.dump(p, open(f,'w'), indent=2)"
USER wazuh-dashboard
```

```bash
docker build -t wazuh-dashboard-ensfacil:4.14.7 .
docker run --rm --entrypoint /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin \
  wazuh-dashboard-ensfacil:4.14.7 list
# en docker-compose.yml, el servicio del dashboard: image: wazuh-dashboard-ensfacil:4.14.7
docker compose up -d
```

Qué tiene que salir en la lista: `ensfacil@1.1.0` junto a `wazuh`, `wazuhCore` y
`wazuhCheckUpdates`. El plugin de Wazuh es el de la imagen oficial: no se retira
ni se sustituye.

Sin subir el `build.number`, el navegador sigue usando los ficheros de la versión
anterior de ENSFácil al actualizarla (la URL de los bundles depende de ese
número). Cada versión nueva de ENSFácil es una imagen nueva con el zip nuevo.

Después, crear el rol `ensfacil_admin` (apartado 13.5 de la guía 01) con el
certificado de administrador del indexer del despliegue (apartado 8).
`create-admin-role.sh` comprueba el certificado del indexer contra su CA raíz,
así que la URL tiene que llevar el nombre para el que está hecho ese
certificado. En el despliegue oficial (`config/certs.yml` de `wazuh-docker`) es
`wazuh.indexer`, no `127.0.0.1`: con `https://127.0.0.1:9200`, curl se niega
(«no alternative certificate subject name matches»). El nombre se ve en el
propio certificado:

```bash
C=/ruta/al/despliegue/config/wazuh_indexer_ssl_certs
sudo openssl x509 -in $C/wazuh.indexer.pem -noout -ext subjectAltName
```

Ese nombre solo se resuelve dentro de la red de Docker del despliegue. Desde el
host, donde el `docker-compose.yml` publica el puerto `9200` del indexer, basta
con una entrada en `/etc/hosts` que lo lleve a la propia máquina; `OS_CA` es la
CA raíz del despliegue (`root-ca.pem`), la que firmó el certificado del indexer:

```bash
grep -q '[[:space:]]wazuh\.indexer$' /etc/hosts || echo '127.0.0.1 wazuh.indexer' | sudo tee -a /etc/hosts
sudo env OS_CERT=$C/admin.pem OS_KEY=$C/admin-key.pem OS_CA=$C/root-ca.pem OS_URL=https://wazuh.indexer:9200 \
  bash /opt/ensfacil/repo/config/create-admin-role.sh --mapear <usuario>
```

La entrada puede quitarse al terminar; esto borra solo la línea que se añadió aquí, no otra que ya hubiera: `sudo sed -i '/^127\.0\.0\.1 wazuh\.indexer$/d' /etc/hosts`.
Si el indexer no está publicado en el host, lo mismo desde un equipo que llegue
a él, con la entrada apuntando a su dirección. En un clúster con varios nodos,
el nombre es el del nodo al que se habla (`wazuh1.indexer` en el despliegue
oficial multinodo): usar siempre el que salga en el certificado.

Comprobado en la imagen `wazuh/wazuh-dashboard:4.14.7`: trae `python3` y la
línea que sube el `build.number` funciona. Por verificar (sin probar todavía en
un despliegue con Docker): la instalación del zip de ENSFácil en la imagen, su
arranque en el entorno del cliente y la creación del rol con el nombre del
certificado del indexer.

## 8. Sembrar y validar la configuración

`inject-control.py`, `set-parameters.py` y la descarga del documento `active`
hablan con el indexer con su **certificado de administrador**. En el despliegue
oficial con Docker, los certificados se generan en el host, en
`config/wazuh_indexer_ssl_certs/` (`admin.pem`, `admin-key.pem`). Se ejecutan
desde el host (Python 3 y el repositorio del plugin clonado allí), apuntando al
indexer publicado por el `docker-compose.yml` (puerto `9200`):

```bash
C=/ruta/al/despliegue/config/wazuh_indexer_ssl_certs
CERT="OS_CERT=$C/admin.pem OS_KEY=$C/admin-key.pem ENS_OS_URL=https://127.0.0.1:9200"
cd /opt/ensfacil/repo/config
sudo env $CERT python3 inject-control.py op.exp.7            # plan
sudo env $CERT python3 inject-control.py op.exp.7 --apply    # escribe
```

El resto es igual que el apartado 14 de la guía 01 (primer guardado desde la
pantalla, copia previa, siembra de los 23, `set-parameters.py`). La validación
del documento entero (`validate-configuration.ts`) no necesita el indexer: se
descarga el documento con el mismo certificado y se valida en cualquier equipo
con Node.js 18 o superior (o con la imagen `node:22-alpine`, apartado 14.4).
Si el indexer no está publicado en el host, ejecutarlas desde un equipo que sí
llegue a él con ese certificado (por verificar en cada despliegue).

## 9. Lo que todavía no se mide igual en un contenedor

- **Recolector de agente de op.mon.3**: además del del manager, su `install.sh` en cada máquina del grupo `ens` instala `ens_opmon3_agent_collect.sh` con un cron horario; eso ocurre en la máquina auditada, no en el contenedor del manager.
- **op.exp.8 EV-13** (servicios del sistema de registro): el recolector pregunta
  a systemd por `wazuh-manager`, `wazuh-indexer` y `wazuh-dashboard`. En el
  contenedor no hay systemd y emite `activo=desconocido`, que el panel juzga
  `NO_CUMPLE`. Ninguna variable lo cubre; queda pendiente de adaptar el
  recolector. No simular `systemctl`: sería una evidencia falsa.
- **op.exp.8 en la fila del manager** mide también el propio servidor (auditd,
  journald, hora). Dentro del contenedor no hay auditd y sale «no instalado»; qué
  debe medirse en el host que ejecuta Docker está por verificar.
- **Clúster con varios nodos**: por verificar (reglas y `agent.conf` se
  sincronizan desde el maestro; los recolectores del manager y sus `<localfile>`
  irían en el maestro).
