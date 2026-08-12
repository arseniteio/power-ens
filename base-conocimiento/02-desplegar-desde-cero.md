# 02 · Desplegar ENSFácil desde cero en una máquina nueva

Runbook completo, en orden de ejecución real, desde una máquina sin nada hasta
que el panel del plugin muestra datos de ella.

Sirve para las **dos clases de máquina** que hoy tienen recolector:

| | **Linux normal** | **Servidor de directorio LDAP** |
|---|---|---|
| Ejemplo medido | `wazuh-real` · agente **024** · Ubuntu 24.04.4 | `zimbraHldap` · agente **028** · Ubuntu 22.04.5 · Zimbra |
| Repos | `op.acc.{1,2,3,4}-…` | `op.acc.{1,2,3,4}-ldap` |
| Recolector se instala en | `/usr/local/bin/ens_opaccN_collect.sh` | `/opt/ensfacil/ens_opaccNldap_collect.sh` |
| `score.py` / `watchdog.py` | **sí** en op.acc.1 y op.acc.2 | **no**, en ninguno |
| Reglas del manager | las instala `install-manager.sh` | **ninguna nueva**: son las mismas |
| Poblaciones auditadas | una (`plano=sistema`) | dos: `plano=sistema` + `plano=directorio`. El tercer plano `consolidado` **solo existe en op.acc.1 y op.acc.2** (§7, salto 2) |

Donde no se diga nada, el paso es idéntico en las dos. Los pasos que difieren
llevan el rótulo **`LINUX`** o **`LDAP`**.

> **Antes de nada, y aunque vayas en orden: si "no aparece nada" en el panel, el
> culpable casi siempre es el alcance ENS (§3), no el despliegue.** Se puede
> tener el agente perfecto, las reglas cargadas y las alertas en el índice, y el
> plugin no evaluar la máquina porque su ID no está en `scope.agentIds`. Cuesta
> 30 segundos comprobarlo y es lo primero que hay que descartar.

Lo que **NO** cubre este documento: compilar e instalar el plugin en el
dashboard (eso es `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md`), el control
`mp.info.6`, y el agente Windows `WIN-OPACC-LAB` (029), para el que no hay
runbook leído.

---

## Mapa: qué queda puesto al terminar

En el **manager** (una vez por manager, no por agente):

```
/var/ossec/etc/rules/ensfacil_op_acc_1_json_rules.xml
/var/ossec/etc/rules/ensfacil_op_acc_2_json_rules.xml
/var/ossec/etc/rules/ensfacil_op_acc_3_json_rules.xml
/var/ossec/etc/rules/ensfacil_op_acc_4_json_rules.xml
/var/ossec/etc/shared/ens/agent.conf          ← un <localfile> por control
```

En **cada agente**:

```
/opt/ensfacil/                 librerías compartidas + (LDAP) los recolectores
/usr/local/bin/ens_opaccN_*    (LINUX) recolector, score, watchdog
/etc/ensfacil/                 .env de observación + ficheros de política local
/etc/cron.d/ensfacil-opaccN*   la planificación
/etc/audit/rules.d/ensfacil-*  reglas de auditd (escritas, NO cargadas)
/var/log/ensfacil/op_acc_N.json  el NDJSON que lee Wazuh
/var/lib/ensfacil/             estado entre pasadas y candados
```

En el **índice** `wazuh-ens-configuration`, documento `active`: el alcance
(`configuration.scope`) y la política (`configuration.controls[].parameters`).

---

## 1 · Requisitos previos

### 1.1 El agente de Wazuh, dado de alta y en el grupo `ens`

El grupo `ens` tiene que existir **antes** de correr `install-manager.sh`: el
instalador inserta su `<localfile>` en `/var/ossec/etc/shared/ens/agent.conf` y
**aborta si ese fichero no existe**.

Crearlo desde la interfaz: menú hamburguesa → **Agent management** → **Summary**
→ pestaña **Groups** → **Add new group** → nombre `ens`.

Wazuh crea entonces `/var/ossec/etc/shared/ens/agent.conf`, que puede quedar de
0 bytes. Eso es normal, pero `install-manager.sh` se niega a escribir sobre un
`agent.conf` sin un bloque `<agent_config>…</agent_config>` completo (§2.3).

Alta del agente: **Agent management** → **Summary** → **Deploy new agent**,
eligiendo SO, IP del manager y, en *Assign the agent to a group*, `ens`. Wazuh
devuelve el comando con la clave de enrolamiento. Después:

```bash
sudo systemctl enable --now wazuh-agent
```

Un agente que ya existía se añade al grupo desde el manager:

```bash
sudo /var/ossec/bin/agent_groups -a -i <ID> -g ens -q
```

Comprobación (medida el 12/08/2026 en wazuh4):

```bash
sudo /var/ossec/bin/agent_control -l
sudo /var/ossec/bin/agent_groups -s -i 028
# → The agent 'zimbraHldap' with ID '028' belongs to groups: default, ens.
```

Y desde el propio agente:

```bash
sudo systemctl status wazuh-agent
sudo grep -a -i 'Connected to the server' /var/ossec/logs/ossec.log | tail -3
```

> `ossec.log` puede contener bytes que `grep` considera binarios y entonces
> responde `binary file matches` sin enseñar nada. Usa `grep -a`. Lo confirmé en
> `ldap-adm` el 12/08/2026.

Si el agente no conecta, **no sigas**: el NDJSON se generará en local y no
llegará nunca al manager, y el fallo aparecerá en §7 sin que la causa esté en
este runbook.

### 1.2 Si el agente NO está en `ens`, nada de lo demás importa

El `agent.conf` del grupo es lo único que hace que `logcollector` lea
`/var/log/ensfacil/*.json`. El del grupo `ens` de wazuh4, tal cual está hoy:

```xml
<agent_config os="^Linux">
  <localfile><log_format>json</log_format><location>/var/log/ensfacil/mp_info_6.json</location></localfile>
  <localfile><log_format>json</log_format><location>/var/log/ensfacil/op_acc_1.json</location></localfile>
  <localfile><log_format>json</log_format><location>/var/log/ensfacil/op_acc_2.json</location></localfile>
  <localfile><log_format>json</log_format><location>/var/log/ensfacil/op_acc_3.json</location></localfile>
  <localfile><log_format>json</log_format><location>/var/log/ensfacil/op_acc_4.json</location></localfile>
</agent_config>
```

(reformateado para caber; el fichero real tiene los bloques en varias líneas y
el atributo `os="^Linux"`).

### 1.3 Paquetes del sistema

| Paquete | Para qué | ¿Lo pone el instalador? |
|---|---|---|
| `jq` | El emisor construye cada línea NDJSON con `jq`. Sin él `ens_emit` devuelve 3 y **no se persiste ni un evento** | Sí. En op.acc.1 y op.acc.2 de Linux, si falla **aborta** |
| `flock` (`util-linux`) | Candado del emisor y candado anti-solape del recolector | No: viene de serie |
| `python3` ≥ 3.8 | `score.py` y `watchdog.py` de op.acc.1/op.acc.2 **LINUX**. Solo stdlib | No: viene de serie en Ubuntu |
| `ldap-utils` (`ldapsearch`) | **LDAP**: sin él no hay plano directorio | **Solo tres de los cuatro**: lo ponen op.acc.1/2/3-ldap. **`op.acc.4-ldap/install.sh` solo instala `jq`** (verificado leyendo su bloque `1/6 · dependencias`). Si op.acc.4-ldap es el primero que corres en una máquina limpia, instala `ldap-utils` a mano |
| `acl` (`getfacl`) | Tercer eje de EV-04 de op.acc.2 | Sí; si falla **avisa y sigue** |
| `auditd` | `auditctl`/`ausearch`. Ver §5 | **op.acc.2 LINUX sí**; los demás **no** (deliberado) |

Comprobación rápida en el agente:

```bash
command -v jq flock python3
jq --version
```

Medido el 12/08/2026: `wazuh-real` tiene `jq-1.7`, `ldap-adm` tiene `jq-1.6`;
`flock` está en `/usr/bin/flock` en las dos.

### 1.4 Cómo llega el código a la máquina

Verificado el 12/08/2026:

- **wazuh4** y **wazuh-real** tienen `git` y llegan a GitLab (`git ls-remote`
  devuelve `rc=0` contra `op.acc.1-identificacion.git` y contra `Wazuh-ENS.git`).
- **ldap-adm NO tiene `git` instalado.** Sus runbooks (`~/op.acc.2-ldap`,
  `~/op.acc.4-ldap`) están copiados desde el portátil — se ve por los ficheros
  `._*` de AppleDouble que deja `scp`/`rsync` desde macOS.

URLs reales, leídas de los `remote origin` de cada repo local:

```
git@gitlab.com:quersystem2/ens-controls-runbook/op.acc.1-identificacion.git
git@gitlab.com:quersystem2/ens-controls-runbook/op.acc.2-requisitos-de-acceso.git
git@gitlab.com:quersystem2/ens-controls-runbook/op.acc.3-segregacion-de-funciones-y-tareas.git
git@gitlab.com:quersystem2/ens-controls-runbook/op.acc.4-proceso-de-gestion-de-derechos-de-acceso.git

git@gitlab.com:quersystem2/ens-controls-runbook/zimbra-ldap/op.acc.1-ldap.git
git@gitlab.com:quersystem2/ens-controls-runbook/zimbra-ldap/op.acc.2-ldap.git
git@gitlab.com:quersystem2/ens-controls-runbook/zimbra-ldap/op.acc.3-ldap.git
git@gitlab.com:quersystem2/ens-controls-runbook/zimbra-ldap/op.acc.4-ldap.git

git@gitlab.com:quersystem2/Wazuh-ENS.git          (el plugin)
```

> **Trampa documental.** `op.acc.1-identificacion/docs/02-manager.md` y
> `03-agente.md` mandan clonar
> `…/op.acc.1-control-access-1-runbook.git`. Ese nombre ya no es el del remoto;
> es el nombre viejo, y **el directorio con ese nombre todavía existe en
> `/opt/ensfacil/` de wazuh4**. Usa las URLs de arriba.

En una máquina sin `git` (caso `ldap-adm`), copia el repo desde donde lo tengas:

```bash
rsync -a --exclude .git ~/ENS-Desarrollo/op.acc.1-ldap/ ldap-adm:~/op.acc.1-ldap/
```

Clonar como **tu usuario, nunca con `sudo`**: si root se queda con el `.git`, no
puedes volver a actualizar.

---

## 2 · El manager: qué reglas tienen que estar

### 2.1 Qué hay que ver

Estado medido en wazuh4 el 12/08/2026:

```bash
sudo ls -l /var/ossec/etc/rules/ | grep -i ensfacil
```

```
-rw-r----- 1 wazuh wazuh 24898 ensfacil_mp_info_6_json_rules.xml
-rw-r----- 1 wazuh wazuh  2900 ensfacil_mp_info_6_pbs_rules.xml
-rw-r----- 1 wazuh wazuh 38571 ensfacil_op_acc_1_json_rules.xml
-rw-r----- 1 wazuh wazuh 30863 ensfacil_op_acc_2_json_rules.xml
-rw-r----- 1 wazuh wazuh  5159 ensfacil_op_acc_3_json_rules.xml
-rw-r----- 1 root  wazuh  8990 ensfacil_op_acc_4_json_rules.xml
```

> El de op.acc.4 tiene propietario `root:wazuh` en vez de `wazuh:wazuh`. Funciona
> —el grupo lee— pero es una desviación respecto de los otros cinco. No sé por
> qué está así; no lo he cambiado.

Bandas reservadas por control: **op.acc.1** 106800-106899 · **op.acc.2**
106900-106999 · **op.acc.3** 107000-107099 · **op.acc.4** 107100-107199.

### 2.2 Instalarlas — `LINUX`

Una vez por manager. Los cuatro instaladores son idempotentes.

```bash
cd ~
BASE=git@gitlab.com:quersystem2/ens-controls-runbook
REPOS="op.acc.1-identificacion op.acc.2-requisitos-de-acceso
       op.acc.3-segregacion-de-funciones-y-tareas
       op.acc.4-proceso-de-gestion-de-derechos-de-acceso"

for r in $REPOS; do
  if [ -d "$HOME/$r" ]; then (cd "$HOME/$r" && git pull -q); else git clone -q "$BASE/$r.git"; fi
done

for r in $REPOS; do
  sudo bash "$HOME/$r/install-manager.sh"
done
```

> **Los nombres van enteros, no con comodín.** Un `~/op.acc.1-*` engancharía
> también `~/op.acc.1-ldap` si estuviera clonado en esa máquina, y los repos LDAP
> **no traen `install-manager.sh`** (§2.3): el bucle se caería con un
> `No such file or directory` a mitad de la instalación.

Qué hace cada uno, en este orden (leído de `install-manager.sh` de op.acc.1, y
los otros tres son iguales): comprueba root y `python3` → copia su XML a
`/var/ossec/etc/rules/` con `640 wazuh:wazuh` → analiza el `agent.conf` del grupo
→ inserta su `<localfile>` justo antes de `</agent_config>` (con copia previa en
`/var/ossec/backup/`) → **si no cambió nada, termina sin verificar ni reiniciar**
→ **verifica con `wazuh-logtest`** → si no matchea, restaura el `agent.conf` y
aborta → y solo entonces `systemctl restart wazuh-manager`.

Salida esperada la primera vez (op.acc.1):

```
>>> reglas instaladas en /var/ossec/etc/rules/
>>> localfile añadido a /var/ossec/etc/shared/ens/agent.conf (copia en /var/ossec/backup/…)
>>> comprobando que la regla 106873 matchea
>>> OK: matchea la regla 106873
>>> wazuh-manager reiniciado
```

**La verificación es BLOQUEANTE y va ANTES del reinicio, no después.** Lo dice la
cabecera del script: «sin match de 106873 no se reinicia nada». Si falla, el
script restaura el `agent.conf` desde la copia y sale con rc≠0, sin haber tocado
el servicio: una instalación a medias no puede reportarse como buena.

> **Consecuencia en un manager nuevo, y no está resuelta en el script.**
> `wazuh-logtest` no compila el ruleset del disco: habla con el `analysisd` **en
> marcha**. En un manager que nunca tuvo estas reglas, el XML acaba de copiarse y
> el demonio todavía no lo ha leído, así que la comprobación puede fallar sobre
> un despliegue correcto. **No lo he reproducido**, pero es lo que se deduce de
> leer el script (una sola llamada a `systemctl restart`, en la última línea).
> Si te pasa: reinicia el manager a mano, comprueba §2.4, y vuelve a lanzar el
> instalador —es idempotente—.
>
> ```bash
> sudo systemctl restart wazuh-manager && sleep 20
> ```

La regla que verifica cada instalador:

| Control | Regla bloqueante |
|---|---|
| op.acc.1 | **106873** |
| op.acc.2 | **106902** |
| op.acc.3 | **107001** |
| op.acc.4 | **107106** |

Variables para casos especiales (`install-manager.sh` de op.acc.1, iguales en los
demás): `OSSEC` (`/var/ossec`), `GRUPO_ENS` (`ens`), `ENSFACIL_DUENO`
(`wazuh:wazuh`), `ENSFACIL_BACKUP_DIR` (`$OSSEC/backup`), `ENSFACIL_SYSTEMCTL`,
`ENSFACIL_SIN_ROOT`.

```bash
sudo GRUPO_ENS=ens-produccion bash install-manager.sh
```

### 2.3 Instalarlas — `LDAP`: no hay nada que instalar

**Los repos LDAP no traen `install-manager.sh`.** Su `manager/` solo tiene el XML
de reglas y un `agent.conf.fragmento.xml` con un comentario que dice que ya está
puesto.

Y no hace falta más: comprobé con `diff` que los cuatro XML de los repos LDAP son
**byte a byte idénticos** a los de los repos de Linux. Es el mismo control sobre
otra clase de máquina, con los mismos rule ID. Lo que distingue las dos
superficies del servidor de directorio es el campo `plano` de cada evento, que se
indexa solo.

Consecuencia práctica: **si el manager ya sirve a un Linux con ENSFácil, añadir un
servidor LDAP es cero cambios en el manager.** Si el manager es nuevo, se corren
los `install-manager.sh` de los repos de **Linux** (§2.2) y con eso el LDAP queda
cubierto.

### 2.4 Comprobar que las reglas matchean

Verificado en wazuh4 el 12/08/2026:

```bash
echo '{"ensfacil":"op.acc.1","event":"account_authenticated","ts":"2026-08-12T10:00:00Z","host":"test","evidence_id":"EV-03","requisito":"op.acc.1.1","usuario":"admin","origen":"10.0.0.55"}' \
  | sudo /var/ossec/bin/wazuh-logtest
```

Salida real (recortada):

```
**Phase 2: Completed decoding.
	name: 'json'
	ensfacil: 'op.acc.1'
**Phase 3: Completed filtering (rules).
	id: '106873'
	level: '3'
	description: 'op.acc.1 · op.acc.1.1/op.acc.1.2 · HECHO (EV-03, EV-05) · Autenticación observada de admin desde 10.0.0.55'
	info: 'requisito=op.acc.1.1,op.acc.1.2 evidencia=EV-03,EV-05 juicio=motor parametro=P-04,P-03 formato=json_line'
**Alert to be generated.
```

Los otros tres:

```bash
echo '{"ensfacil":"op.acc.2","event":"world_writable","host":"H","estado":"NO_CUMPLE"}' \
  | sudo /var/ossec/bin/wazuh-logtest    # → 106902

echo '{"ensfacil":"op.acc.3","event":"account_action","usuario":"x","accion":"/usr/bin/git"}' \
  | sudo /var/ossec/bin/wazuh-logtest    # → 107001

echo '{"ensfacil":"op.acc.4","event":"remote_access","usuario":"x","canal":"ssh","origen":"10.0.0.1"}' \
  | sudo /var/ossec/bin/wazuh-logtest    # → 107106
```

> **`ensfacil` lleva el ID del control, no `true`.** Un evento de prueba con
> `"ensfacil": true` decodifica perfectamente y no dispara nada, y parece que las
> reglas no están cargadas cuando sí lo están. Ante la duda, copia una línea real
> de `/var/log/ensfacil/op_acc_N.json`.

Si no hay `Phase 3`: `install-manager.sh` no reinicia el manager cuando el
`agent.conf` no cambia, pero **las reglas nuevas sí necesitan recarga**.

```bash
sudo systemctl restart wazuh-manager && sleep 20
```

### 2.5 Si el instalador se niega a tocar el `agent.conf`

Solo modifica el fichero si la estructura es manipulable con seguridad:
**exactamente un** bloque `<agent_config>…</agent_config>`, con el cierre solo en
su línea. Tres motivos de rechazo:

| Mensaje | Qué pasa |
|---|---|
| `no se encontró un bloque <agent_config>...</agent_config> completo` | El `agent.conf` está vacío (0 bytes al crear el grupo) o le falta el cierre |
| `hay más de un bloque <agent_config>` | El grupo usa varios bloques con filtros de perfil o de SO. El script no elige por ti |
| `</agent_config> comparte línea con más contenido` | El fichero está normalizado en una línea |

En los tres casos **no se modificó nada**. Se arregla pegando a mano el contenido
de `manager/agent.conf.fragmento.xml` dentro del `<agent_config>` que corresponda:

```bash
# apunta antes cómo está, y déjalo igual al terminar
sudo ls -l /var/ossec/etc/shared/ens/agent.conf
sudo nano  /var/ossec/etc/shared/ens/agent.conf
sudo systemctl restart wazuh-manager
```

> **No inventes el propietario.** En wazuh4, medido el 12/08/2026, el fichero es
> `root:wazuh` con modo `640` —no `wazuh:wazuh 660`—, y con eso funciona. El
> `install-manager.sh` **no lo toca**: solo aplica `ENSFACIL_DUENO`
> (`wazuh:wazuh`) a los XML de `/var/ossec/etc/rules/`. Si editas a mano, deja el
> `agent.conf` con el dueño y el modo que tenía.

Dos cosas al editar a mano: el bloque tiene que quedar **dentro** de
`<agent_config>` (fuera, Wazuh lo ignora sin avisar) y **no vale dentro de un
comentario XML** — el analizador ignora lo comentado, y el agente también.

Después lanza a mano la comprobación de §2.4: el instalador ya no la ejecutará,
porque en la siguiente pasada verá la ruta instalada y saldrá sin cambios.

---

## 3 · EL ALCANCE ENS — el paso 0 real

**Este es el fallo más frecuente del producto.** Si `scope.agentIds` no incluye el
ID del agente, el plugin **ni lo evalúa**: no sale gris, no sale rojo, no sale.
Todo lo demás puede estar perfecto.

Pasó de verdad en el despliegue del servidor LDAP: `scope.agentIds` valía
`["024"]` y ese fue el motivo real de que no apareciera nada.

### 3.1 Mirarlo

Desde el manager (verificado en wazuh4 el 12/08/2026):

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["_source"]["configuration"]["scope"])'
```

Salida real de hoy:

```
{'mode': 'agent', 'agentIds': ['024', '028'], 'groupIds': []}
```

El certificado de administrador del indexer **siempre está en la máquina**; la
contraseña de `admin` vive en el keystore del dashboard y no se puede leer en
claro. Por eso se usa el certificado y no `-u admin:…`.

### 3.2 Los tres modos, y cuál usar

| `mode` | Qué evalúa | Cuándo |
|---|---|---|
| `agent` | solo los IDs de `agentIds` | **el recomendado** |
| `group` | todos los agentes de `groupIds` | arrastra a cualquiera que entre al grupo |
| `global` | **todos** los agentes del manager | hunde la media con máquinas que nadie instrumentó |

`global` y `group` mal usados no solo bajan el número: en el despliegue de
`wazuh-real` el alcance era `{mode:'group', groupIds:['ens']}` y una máquina de
otro proyecto, sin recolectores, generaba no conformidades de «fallo de recogida»
en cascada —cinco de las nueve de op.acc.4— y además **inflaba** el cumplimiento
(una máquina sin agente puntuaba 100 en op.acc.3).

> Sacar una máquina del alcance es legítimo **solo si de verdad no está
> auditada**. Si lo está y no reporta, eso es un hallazgo y tiene que contar.

### 3.3 Cambiarlo

**La vía normal es la pantalla de Configuración del plugin.** Es la que deja
rastro en `configuration.auditTrail`.

**No confundir `configuration.scope` con `configuration.global.scope`**: el
segundo es el texto descriptivo de la pantalla. Escribir el objeto ahí por error
dejó el documento inválido una vez.

El documento vive en el índice `wazuh-ens-configuration`, `_id: active`, y su
`_source` tiene estas claves (leídas hoy):

```
_source:        documentType, configuration, updatedAt, updatedBy
configuration:  id, clientId, version, status, createdAt, updatedAt,
                createdBy, updatedBy, changeReason, global, scope,
                controls, auditTrail
controls:       mp.info.6, op.acc.1, op.acc.2, op.acc.3, op.acc.4
```

**Antes de tocar el documento por API, copia:**

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active > copia-config.json
```

> **No he verificado ningún comando de ESCRITURA sobre `scope`.** No lo he
> ejecutado y no me lo invento: cambia el alcance desde la pantalla, o construye
> el `PUT` a partir de la copia de arriba y comprueba después con el comando de
> §3.1 que el valor es el que querías.

### 3.4 El otro requisito del alcance: que el control esté ACTIVE

Un control con `status: 'DRAFT'` **no entra en el índice**: `evaluateRequirement`
marca no aplicable todo requisito de un control que no esté `ACTIVE`, así que sale
`NO_APLICA` —sin número, no un 0— y `scoreAverage` lo excluye.

Comprobado hoy en `Wazuh-ENS/dashboard/ens/catalog/`: **los cinco controles
(`mp.info.6`, `op.acc.1`, `op.acc.2`, `op.acc.3`, `op.acc.4`) están en
`status: 'ACTIVE'`.** La cabecera de `CLAUDE.md` todavía dice que op.acc.3 y
op.acc.4 están en DRAFT: eso ya no es cierto en el código.

### 3.5 Y que la tarjeta del control exista en Configuración

La tarjeta de un control no aparece hasta sembrar su bloque en el índice: el
guardado desde la UI rechaza un control que no esté ya ahí (huevo y gallina).

Se corre **desde el manager**, en el directorio `config/` del repo `Wazuh-ENS`.
En wazuh4 ese repo está clonado en `/opt/ensfacil/repo` (verificado el
12/08/2026), así que la ruta es `/opt/ensfacil/repo/config`; en otra máquina será
donde lo hayas clonado.

```bash
cd /opt/ensfacil/repo/config      # = <clon de Wazuh-ENS>/config
export OS_CERT=/etc/wazuh-indexer/certs/admin.pem
export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem
for c in op.acc.1 op.acc.2 op.acc.3 op.acc.4; do
  sudo -E python3 inject-control.py "$c"            # dry-run: enseña el plan
done
for c in op.acc.1 op.acc.2 op.acc.3 op.acc.4; do
  sudo -E python3 inject-control.py "$c" --apply    # escribe
done
```

Ahí tienen que estar `inject-control.py`, `set-parameters.py` y los cinco
`<control>-control-block.json` (`mp-info-6`, `op-acc-1` … `op-acc-4`). El
`sudo -E` es necesario: sin `-E` se pierden `OS_CERT` y `OS_KEY` y el script
aborta pidiéndolos.

**Fusiona: conserva los valores que el auditor haya puesto.** Se puede repetir sin
miedo. `--sustituir` es el destructivo: hasta el 30/07 era el comportamiento por
defecto y una segunda siembra tumbó op.acc.2 de 83 % a 17 %.

---

## 4 · Instalar los recolectores de los cuatro controles

### 4.1 `LINUX`

```bash
sudo bash ~/op.acc.1-identificacion/install.sh
sudo bash ~/op.acc.2-requisitos-de-acceso/install.sh
sudo bash ~/op.acc.3-segregacion-de-funciones-y-tareas/install.sh
sudo bash ~/op.acc.4-proceso-de-gestion-de-derechos-de-acceso/install.sh
```

**Usa rutas absolutas.** `sudo -i` abre una sesión nueva y se come el `cd` que
venga pegado detrás: el instalador acaba corriendo en otro directorio y no te
enteras.

Los cuatro son idempotentes y **nunca pisan un `.env` ni un `.tsv` existentes**,
así que se pueden reejecutar para actualizar el código sin perder la
configuración del cliente.

Los cuatro corren con `set -e` (op.acc.1 y op.acc.2 con `set -eu`; op.acc.3 y
op.acc.4 con `set -euo pipefail`): si algo falla, abortan. **Solo op.acc.1 y
op.acc.2 imprimen `>>> instalación completada`** al terminar; si no ves esa línea
en esos dos, la máquina no está desplegada por muchos ficheros sueltos que haya.
op.acc.3 y op.acc.4 no imprimen ninguna línea equivalente: su señal de fin es el
bloque `QUEDA UNA COSA, Y NO SE HACE EN ESTA MÁQUINA` y `rc=0`.

**No existe un flag `--fake`.** Son dos scripts con nombre explícito,
`install.sh` e `install-fake.sh`, y **son deliberadamente asimétricos**:

- `install.sh` de **op.acc.1 y op.acc.2** **retira** el simulador y su cron
  si los encuentra (dirección segura: la máquina pasa a decir la verdad). Los de
  op.acc.3 y op.acc.4 **no lo hacen** —no tienen ese bloque—, así que ahí la
  retirada del simulador es cosa de `uninstall.sh --solo-fake` (§10).
- `install-fake.sh` **se niega** a instalar el simulador si encuentra el pipeline
  real, salvo `--reemplaza-real`. Esta mitad sí está en los cuatro.

Convertir en fake una máquina que emitía evidencia real es el peor fallo posible
del producto: esa evidencia inventada entra en el índice, la recoge el plugin y
puede acabar en un informe ENS firmado como un CUMPLE por datos fabricados.

> **Aviso de alcance.** `install.sh` rechaza cualquier argumento **solo en
> op.acc.1 y op.acc.2** (`if [ $# -gt 0 ]`, verificado). Los de op.acc.3 y
> op.acc.4 no comprueban los argumentos: un `--algo` mal escrito se **ignora en
> silencio** y la instalación sigue. Los cuatro repos LDAP tampoco los
> comprueban. No pases argumentos.
>
> **El simulador de op.acc.3 no existe todavía**: su `install-fake.sh` aborta
> diciéndolo, y el guardia contra reconvertir una máquina real sí es funcional.

Qué deja op.acc.1 (el más completo del modelo clásico):

| Ruta | Permisos |
|---|---|
| `/opt/ensfacil/ensfacil-emit.sh` | 644 |
| `/opt/ensfacil/opacc1-lib.sh` | 644 |
| `/usr/local/bin/ens_opacc1_collect.sh` | 755 |
| `/usr/local/bin/ens_opacc1_score.py` | 755 |
| `/usr/local/bin/ens_opacc1_watchdog.py` | 755 |
| `/etc/ensfacil/opacc1.env` | 640, **solo si no existía** |
| `/etc/cron.d/ensfacil-opacc1` | 644 |
| `/var/log/ensfacil/` | 750 (el NDJSON, 640) |
| `/var/lib/ensfacil/`, `/var/lib/ensfacil/opacc1/` | estado y candados |

Estado real de `wazuh-real` el 12/08/2026:

```
/usr/local/bin/ens_opacc1_collect.sh   ens_opacc1_score.py   ens_opacc1_watchdog.py
/usr/local/bin/ens_opacc2_collect.sh   ens_opacc2_score.py   ens_opacc2_watchdog.py
/usr/local/bin/ens_opacc3_collect.sh
/usr/local/bin/ens_opacc4_collect.sh
/opt/ensfacil/  ensfacil-auditd.sh  ensfacil-auth.sh  ensfacil-emit.sh
                opacc1-lib.sh  opacc2-lib.sh  opacc3-lib.sh  opacc4-lib.sh
```

**op.acc.3 y op.acc.4 no tienen `score.py` ni `watchdog.py`, y no es un olvido**:
nacieron en el modelo nuevo. Su agente no emite ningún veredicto de cumplimiento
—solo hechos— y quien juzga es el motor del plugin.

### 4.2 `LDAP`

```bash
sudo bash ~/op.acc.1-ldap/install.sh
sudo bash ~/op.acc.2-ldap/install.sh
sudo bash ~/op.acc.3-ldap/install.sh
sudo bash ~/op.acc.4-ldap/install.sh
```

**`sudo bash`, no `sudo ./`**: en el repo, los `install.sh` de op.acc.1,
op.acc.2 y op.acc.4 de LDAP **no tienen bit de ejecución** (`-rw-r--r--`). Solo el
de op.acc.3 lo tiene. Sus propias cabeceras documentan `sudo bash install.sh`.

Diferencias respecto de Linux, todas verificadas en `ldap-adm`:

- **Todo va a `/opt/ensfacil/`**, recolector incluido. No hay nada en
  `/usr/local/bin`.
- **La primera pasada la ejecuta el propio instalador** (paso 6/6 ó 7/7) y
  después imprime cuántos eventos hay en el NDJSON. En Linux la lanzas tú (§6).
- **op.acc.1-ldap, op.acc.2-ldap y op.acc.3-ldap instalan `ldap-utils`** además
  de `jq`; op.acc.2-ldap añade `acl`. **`op.acc.4-ldap` NO**: su bloque de
  dependencias solo comprueba `jq`. En `ldap-adm` no se notó porque otro
  instalador ya había puesto `ldapsearch` (`/usr/bin/ldapsearch`, verificado).
  En una máquina limpia, si empiezas por op.acc.4-ldap, ponlo tú.
- **op.acc.3-ldap y op.acc.4-ldap escriben reglas de auditd**; op.acc.1-ldap y
  op.acc.2-ldap no.
- **`ensfacil-emit.sh` es el mismo fichero byte a byte** en los ocho repos, los
  cuatro de LDAP y los cuatro de Linux (mismo md5 en los ocho, comprobado). Se
  reinstala en cada uno porque cualquiera puede ser el primero en llegar;
  modificarlo desde uno rompería los demás.

Estado real de `ldap-adm` el 12/08/2026:

```
/opt/ensfacil/ ensfacil-auth.sh  ensfacil-emit.sh
               ens_opacc1ldap_collect.sh  ens_opacc2ldap_collect.sh
               ens_opacc3ldap_collect.sh  ens_opacc4ldap_collect.sh
               opacc1ldap-lib.sh … opacc4ldap-lib.sh
/etc/ensfacil/ opacc1-ldap.env  opacc1-ldap-bajas.tsv
               opacc2-ldap.env  opacc2-ldap-acl.tsv(+.example)
                                opacc2-ldap-suid.allow(+.example)
               opacc3-ldap.env  opacc3-ldap-tareas.tsv
               opacc4-ldap.env  opacc4-ldap-revisiones.tsv
```

### 4.3 El cron que queda puesto

Leídos de las plantillas de cada repo. Todos redirigen a `/dev/null`: los avisos
viajan por el propio NDJSON (`collector_warning`), no por correo de cron.

**LINUX**

| Cuándo | Qué |
|---|---|
| `7 * * * *` | `ens_opacc1_collect.sh` |
| `12 * * * *` | `ens_opacc1_score.py` (5 min después del recolector) |
| `30 6 * * *` | `ens_opacc1_watchdog.py` |
| `12 * * * *` | `ens_opacc2_collect.sh` |
| `17 * * * *` | `ens_opacc2_score.py` |
| `33 4 * * *` | `ens_opacc2_watchdog.py` |
| `41 * * * *` | `ens_opacc3_collect.sh` |
| `17 * * * *` | `ens_opacc4_collect.sh` |

**LDAP** — solo recolector, uno por control, escalonados:

| Cuándo | Qué |
|---|---|
| `17 * * * *` | `/opt/ensfacil/ens_opacc1ldap_collect.sh` |
| `27 * * * *` | `/opt/ensfacil/ens_opacc2ldap_collect.sh` |
| `33 * * * *` | `/opt/ensfacil/ens_opacc3ldap_collect.sh` |
| `37 * * * *` | `/opt/ensfacil/ens_opacc4ldap_collect.sh` |

> **Los `.py` NO sourcean el `.env` por su cuenta**: lo carga el cron con `set -a`
> antes de invocarlos. Si los lanzas a mano tienes que hacer lo mismo (§7.1). Sin
> eso, mover el log en `opacc1.env` dejaría a score y watchdog leyendo la ruta
> vieja — rojo permanente en una máquina sana.

### 4.4 Ficheros de política local que hay que revisar a mano

Los instaladores **copian plantillas `.example` y no las activan**, a propósito.
Un fichero de política activo con lo que hay en la máquina diría «comparé contra
la política y no encontré desviaciones» sobre una política que nadie ha leído: un
CUMPLE falso el primer día, y en una máquina ya comprometida declararía autorizada
la puerta trasera del atacante. **La revisión ES el control.**

**op.acc.2 `LINUX`** — instala cuatro `.example` en `/etc/ensfacil/`:

```
opacc2-acl.tsv.example           → EV-04         (P-08)
opacc2-privilegios.tsv.example   → EV-05 y EV-06 (P-09)
opacc2-accesos.tsv.example       → EV-06         (P-06)
opacc2-suid.allow.example        → EV-07         (P-10)
```

Hasta que existan sin el sufijo, «el control sale PARCIAL en BAJO/MEDIO y
NO_CUMPLE en ALTO» —eso lo imprime el propio `install.sh` de op.acc.2, y lo
cito de ahí; el `CUMPLIMIENTO.md` no usa la palabra PARCIAL—. Lo que sí es firme
y es el principio del producto: **lo no demostrado no acredita**, y a nivel de
requisito cuenta en contra. La línea base SUID/SGID no se siembra sola: el recolector deja
lo que hay ahora en `/var/lib/ensfacil/opacc2/suid.candidato`; se revisa, se quita
lo que no deba estar y **entonces** se promueve a
`/etc/ensfacil/opacc2-suid.allow`.

**op.acc.2 `LDAP`** — dos: `opacc2-ldap-acl.tsv.example` y
`opacc2-ldap-suid.allow.example`.

**op.acc.3** (las dos clases) — `opacc3-tareas.tsv` / `opacc3-ldap-tareas.tsv`
**sí** se crean con contenido de ejemplo. Hay que revisarlos: los nombres tienen
que coincidir con P-04 de la pantalla.

**op.acc.4** — `opacc4-revisiones.tsv` / `opacc4-ldap-revisiones.tsv`
**no lo crea el instalador, y es deliberado**: lo escribe la organización el día
que hace la primera revisión de permisos de verdad. Anotar una revisión que no se
ha hecho es fabricar evidencia.

```bash
printf '2026-08-11\tSistema operativo y directorio LDAP\tdioni.quer\n' \
  | sudo tee -a /etc/ensfacil/opacc4-ldap-revisiones.tsv
```

> **Formato con TABULADOR, no espacios.** Escribirlos en un editor casi siempre
> mete espacios y entonces la fila no se lee. Usa `printf '…\t…\n'`.

---

## 5 · auditd y sus reglas: es lo que más desbloquea

**Es el mayor salto de todos.** En el servidor LDAP, sin auditd op.acc.3 no podía
cubrir ni una evidencia y op.acc.4 perdía la mitad; con él, op.acc.3 pasó a cubrir
sus siete.

### 5.1 Instalarlo

**auditd no lo instala ningún recolector salvo op.acc.2 de Linux, y es
deliberado.** Es un servicio que cambia el comportamiento del sistema auditado
—carga reglas en el kernel y escribe logs— y un vigilante no instala servicios en
la máquina que vigila sin que alguien lo decida.

```bash
sudo apt-get install -y auditd audispd-plugins
sudo systemctl enable --now auditd
```

Antes de seguir, comprobar que el kernel lo soporta:

```bash
sudo systemctl is-active auditd
sudo auditctl -s | head -3        # el 'pid' tiene que ser distinto de 0
```

Si sale `Error - audit support not in kernel`, esta máquina **no puede** dar esa
evidencia. Pasa en contenedores y en algunas VM. No es un fallo del runbook: las
evidencias afectadas salen `NO_EVALUABLE` con su motivo, que es la respuesta
honesta.

### 5.2 De dónde salen las reglas — y aquí op.acc.2 es distinto

| Control | Cómo se produce su fichero de `rules.d` |
|---|---|
| op.acc.1 | **no tiene reglas de auditd** |
| **op.acc.2 `LINUX`** | **se GENERA** a partir de P-02 (`OPACC2_RUTAS_CRITICAS` del `.env`) y de `opacc2-accesos.tsv` (P-06), con la misma función que usa el recolector cada hora (`auditd_generar_reglas` de `lib/ensfacil-auditd.sh`). No se copia una plantilla |
| op.acc.2 `LDAP` | no escribe reglas |
| op.acc.3 y op.acc.4 (las dos clases) | se **copia** `etc/ensfacil-opaccN*.audit.rules.plantilla` a `/etc/audit/rules.d/` |

Consecuencia de la fila de op.acc.2: **si ninguna de las rutas de
`OPACC2_RUTAS_CRITICAS` existe en la máquina, no se genera ni una regla** y el
instalador avisa. EV-03 no podrá observar nada.

Si `/etc/audit/rules.d` no existe (auditd no instalado), ningún instalador lo
crea: lo dice y sigue.

Los repos LDAP traen las plantillas y también se pueden instalar sueltas:

```bash
sudo install -m 640 ~/op.acc.3-ldap/etc/ensfacil-opacc3-ldap.audit.rules.plantilla \
                    /etc/audit/rules.d/ensfacil-opacc3-ldap.rules
sudo install -m 640 ~/op.acc.4-ldap/etc/ensfacil-opacc4-ldap.audit.rules.plantilla \
                    /etc/audit/rules.d/ensfacil-opacc4-ldap.rules
```

### 5.3 EL PASO QUE SE OLVIDA: cargarlas

**Escribir el fichero NO carga las reglas en el kernel.** Ningún instalador lo
hace por ti.

```bash
sudo augenrules --load
sudo systemctl restart auditd     # en el LDAP se hizo así
```

> **Nunca `auditctl -D`.** Descargaría también las reglas de auditoría del
> cliente, que no son nuestras. Por eso ningún instalador lo ejecuta.
>
> Y `augenrules --load` aplica **todo** lo que haya en `rules.d`, no solo lo
> nuestro. Cárgalas solo si te consta que no hay otros cambios pendientes ahí.

### 5.4 Comprobar

```bash
sudo auditctl -l | grep -c ensfacil
sudo auditctl -l | grep -oE '(key=|-k )ensfacil[a-z0-9_-]*' | sort | uniq -c
```

**Ojo con el recuento**: las vigilancias `-w` se listan con `-k <clave>` y las de
syscall con `-F key=<clave>`, así que un `grep key=` solo ve unas pocas. Formato
validado en máquina real (Ubuntu 24.04, audit 3.1.2).

Medido el 12/08/2026:

`wazuh-real` → **67** líneas con `ensfacil`, `pid 54196`:

```
      3 -k ensfacil_opacc2_obj
     12 -k ensfacil_opacc3_act
      3 -k ensfacil_opacc3_sec
      3 -k ensfacil_opacc4_kn
      3 -k ensfacil_opacc4_perms
     40 key=ensfacil_opacc2
      3 key=ensfacil_opacc4_perms
```

`ldap-adm` → **37** líneas, `pid 382`:

```
     17 -k ensfacil_opacc3_act
      5 -k ensfacil_opacc3_sec
      8 -k ensfacil_opacc4_kn
      4 -k ensfacil_opacc4_perms
      3 key=ensfacil_opacc4_perms
```

> `CUMPLIMIENTO_TOTAL.md` dice «debe dar ~22» para el LDAP. Hoy da 37: las reglas
> crecieron desde el 11/08. **El número no es el criterio; el criterio es que
> aparezca cada clave que tu despliegue necesita.**

Las reglas viven en el kernel, así que `auditctl -l` **las sigue listando con el
demonio parado**: por eso hay que mirar también `auditctl -s`.

### 5.5 El aviso normal justo después de cargar

```
collector_warning · parametro=auditd
"40 registro(s) de la clave ensfacil_opacc2 son cambios de la configuracion de
 auditoria de la maquina (type=CONFIG_CHANGE, p.ej. op=add_rule), no accesos..."
```

auditd registra un `CONFIG_CHANGE op=add_rule` **por cada regla** que carga, con
la clave de la regla afectada, así que `ausearch -k` los devuelve. No son accesos,
no se emiten como evidencia y **no hay nada que revisar**.

**El número NO tiene por qué coincidir con el de reglas: es un registro por regla
y por carga.** Medido en `wazuh-real` el 12/08/2026: `auditctl -l` da 40 reglas
con `key=ensfacil_opacc2` y el aviso habla de **80** registros (y 6 para
`ensfacil_opacc2_obj`, que tiene 3 reglas) — dos cargas. Cada `augenrules --load`
o reinicio de `auditd` añade otra tanda dentro de la ventana que mira el
recolector. Solo preocupa si sale en *todas* las pasadas y no solo tras instalar
o recargar: entonces sí hay algo recargando las reglas en bucle.

El texto exacto está en `auditd_generar_reglas` /
`lib/ensfacil-auditd.sh` del repo de op.acc.2; el bloque de arriba está recortado.

### 5.6 El coste, que hay que dimensionar antes

`ensfacil_opacc3_act` observa **todas** las ejecuciones de usuarios reales
(`execve` con `auid>=1000`). Es lo que la segregación necesita —no se puede saber
qué funciones ejerce alguien sin ver lo que hace— pero en un servidor con
actividad son muchos eventos:

```bash
sudo grep -E 'max_log_file|num_logs' /etc/audit/auditd.conf
```

El `sudo` no es opcional: `/etc/audit/auditd.conf` no es legible por un usuario
normal y sin él sale `Permission denied` (comprobado en `wazuh-real`). Ahí hoy:
`max_log_file = 8` (MB), `num_logs = 5`, `max_log_file_action = ROTATE` — 40 MB
de techo para **todo** auditd, no solo lo nuestro.

### 5.7 Sin auditd, no todas las evidencias quedan igual

Y confundirlas manda a buscar donde no hay nada:

| | Sin las reglas cargadas, o con el demonio parado |
|---|---|
| **op.acc.2 EV-06** | `NO_EVALUABLE`. Su único eje sale de auditd, así que el silencio no puede significar nada |
| **op.acc.2 EV-03** | **conserva su veredicto**. Su `NO_CUMPLE` sale del log de autenticación, que no depende de auditd. Queda un `collector_warning` |
| **op.acc.3** | las evidencias de EJECUCIÓN salen `NO_EVALUABLE`; las capacidades estructurales **sí** se miden |
| **op.acc.4 EV-04 y EV-07** | `NO_EVALUABLE`, diciéndolo con todas las letras |

Si op.acc.2 EV-03 está gris, **el problema no es auditd**: mira la fuente de
autenticación (`/var/log/auth.log` o `journalctl`) con el `motivo` del
`evidence_state`.

```bash
sudo test -r /var/log/auth.log && echo ok || journalctl -n 1 _COMM=sudo
```

> **Contradicción documental detectada, y cuál manda.** La cabecera de
> `op.acc.2-requisitos-de-acceso/install.sh` (y el aviso que imprime al no
> poder instalar auditd) todavía dice *«EV-03 y EV-06 quedarán NO_EVALUABLE»*.
> Eso ya no es cierto para EV-03: su `CUMPLIMIENTO.md` lo dice literal —«EV-03 NO
> depende de auditd»— porque su `NO_CUMPLE` sale del log de autenticación, y lo
> que auditd aporta ahí (`access_denied`) es evidencia de CUMPLE: perderla reduce
> el volumen, no fabrica cumplimiento, así que **no degrada**. **Manda
> `CUMPLIMIENTO.md`.** No he tocado el script.

---

## 6 · La primera pasada, y por qué no llega al manager

### 6.1 Lanzarla

**`LINUX`** — el ndjson es un **histórico**: un `tail` mezcla ejecuciones y enseña
estados ya superados. Aísla siempre la pasada:

```bash
sudo mv /var/log/ensfacil/op_acc_1.json /var/log/ensfacil/op_acc_1.json.antes
sudo /usr/local/bin/ens_opacc1_collect.sh; echo "rc=$?"
sudo tail -5 /var/log/ensfacil/op_acc_1.json
```

> **Esto es para un despliegue nuevo o un diagnóstico, no para una máquina en
> producción.** El `<localfile>` del grupo `ens` apunta a la ruta **exacta**
> `/var/log/ensfacil/op_acc_1.json`, sin comodines (§1.2): `op_acc_1.json.antes`
> **ya no lo lee nadie**, así que todo lo que quedara en él sin reenviar se queda
> ahí para siempre. No borra evidencia —el fichero sigue en disco— pero sí corta
> su camino al índice. Si no necesitas aislar, filtra por el `ts` del latido
> anterior (§7, salto 2) y no muevas nada.

**`LDAP`** — ya la ejecutó el instalador. Para repetirla:

```bash
for n in 1 2 3 4; do
  sudo /opt/ensfacil/ens_opacc${n}ldap_collect.sh; echo "op.acc.$n rc=$?"
done
```

### 6.2 EL PROBLEMA: la primera pasada no llega al manager

> **`logcollector` empieza a leer un fichero que YA EXISTE por el FINAL.**

Ese es el mecanismo, y explica el síntoma más desconcertante del primer
despliegue: el NDJSON tiene eventos, `wazuh-logtest` matchea, el agente está en
`ens`… y en el índice no hay nada.

**Solución: lanzar otra pasada.** Lo que se escriba a partir de que
`logcollector` haya abierto el fichero sí se lee.

```bash
# LINUX
sudo /usr/local/bin/ens_opacc1_collect.sh
# LDAP
sudo /opt/ensfacil/ens_opacc1ldap_collect.sh
```

Comprobar que el agente abrió el fichero (verificado en `wazuh-real`):

```bash
sudo grep -a "Analyzing file" /var/ossec/logs/ossec.log | grep ensfacil | tail -6
```

```
2026/08/12 11:02:47 wazuh-logcollector: INFO: (1950): Analyzing file: '/var/log/ensfacil/mp_info_6.json'.
2026/08/12 11:02:47 wazuh-logcollector: INFO: (1950): Analyzing file: '/var/log/ensfacil/op_acc_1.json'.
2026/08/12 11:02:47 wazuh-logcollector: INFO: (1950): Analyzing file: '/var/log/ensfacil/op_acc_2.json'.
2026/08/12 11:02:47 wazuh-logcollector: INFO: (1950): Analyzing file: '/var/log/ensfacil/op_acc_3.json'.
2026/08/12 11:02:47 wazuh-logcollector: INFO: (1950): Analyzing file: '/var/log/ensfacil/op_acc_4.json'.
```

Si ese `grep` no devuelve ninguna línea —cuéntalas para no dudar—, el
`<localfile>` no ha llegado al agente:

```bash
sudo grep -a "Analyzing file" /var/ossec/logs/ossec.log | grep -c ensfacil
```

Comprueba el grupo (§1.1) y fuerza la sincronización:

```bash
sudo systemctl restart wazuh-agent
```

### 6.3 Qué esperar de la primera pasada, y por qué está bien

- **EV-02 no emite ningún cambio.** Solo fija la línea base de identidad: no hay
  con qué comparar, y emitir un alta por cada cuenta existente presentaría el
  censo de hoy como si fueran altas de hoy. Igual en op.acc.2 con la integridad
  de ficheros: **la segunda pasada es la que empieza a comparar**.
- **Las evidencias que leen el log de autenticación pueden salir sin hechos.** El
  log se lee **desde el final** en la primera ejecución (o desde la última hora,
  si la fuente es journald), para no volcar semanas de logins históricos como si
  fueran de ahora. Es el mismo criterio que el de `logcollector`, aplicado por el
  recolector.
- **Mucho gris es lo esperado.** Las evidencias que dependen de un fichero de
  política del cliente o de un parámetro de la pantalla salen `NO_EVALUABLE`
  hasta que se rellenen. El motivo dice cuál falta.
- **La última línea *de la pasada del recolector* debe ser el latido
  `collector_run`.** Ojo: no tiene por qué ser la última línea del fichero. En
  op.acc.1 y op.acc.2 de **LINUX**, `score.py` corre 5 minutos después y añade sus
  `evidence_state` / `control_state` / `score_snapshot` detrás. Medido en
  `wazuh-real` el 12/08/2026: la última línea de `op_acc_1.json` es un
  `score_snapshot`, y está bien. Para ver el latido, búscalo (§6.4).

### 6.4 El latido: por qué existe

Casi todas las evidencias son aserciones negativas. EV-03 de op.acc.1 cumple
justamente cuando *no* encuentra ninguna autenticación con una cuenta prohibida
por P-04. Sin una señal de «la pasada se completó», *«el recolector corrió y no
encontró nada»* (que es CUMPLE) sería indistinguible de *«el recolector no
corrió»* (que es NO_EVALUABLE con causa `COLLECTION`).

```bash
sudo jq -c 'select(.event=="collector_run")|{resultado,evidencias_cubiertas}' \
  /var/log/ensfacil/op_acc_1.json | tail -1
```

Esperado: `resultado: "completada"` y una lista de evidencias.

**`evidencias_cubiertas` NO es `evidencias_emitidas`.** La primera dice qué
evidencias esta pasada llegó a **mirar**; la segunda, sobre cuántas dijo algo. Es
una **lista blanca**: el motor solo convierte «cero hechos» en CUMPLE para las
evidencias que aparezcan ahí (`resolveCollectorCoverage`, en
`dashboard/ens/core/evidence/judgment.ts`).

Verificado en `ldap-adm` el 12/08/2026:

```bash
sudo jq -r 'select(.event=="collector_run")|"cubiertas=[\(.evidencias_cubiertas)] resultado=\(.resultado)"' \
  /var/log/ensfacil/op_acc_3.json | tail -1
# → cubiertas=[EV-01,EV-02,EV-04,EV-05,EV-06,EV-03,EV-07] resultado=completada
```

Si la lista sale **vacía**, el recolector corrió y no pudo mirar nada: mira las
causas.

### 6.5 `LINUX`: `collect.sh` no es la pasada completa

En op.acc.1 y op.acc.2 el cron ejecuta también `score.py`, que es quien deriva los
estados agregados (`evidence_state`, `control_state`, `score_snapshot`). Si solo
lanzas el recolector, faltan. A mano hay que cargarle el entorno igual que hace el
cron:

```bash
sudo bash -c 'set -a; . /etc/ensfacil/opacc1.env; exec /usr/local/bin/ens_opacc1_score.py'
sudo grep score_snapshot /var/log/ensfacil/op_acc_1.json | tail -3
```

En op.acc.3, op.acc.4 y **todos los LDAP** no hay `score.py`: el recolector es
toda la pasada.

---

## 7 · Verificación de la cadena completa

La cadena que hay que poder recorrer, de punta a punta:

```
recolector → NDJSON en el agente → logcollector → decoder json →
reglas 106800-107199 → alerta en wazuh-alerts-* → motor → panel
```

Un eslabón roto en medio se manifiesta siempre igual —el control en gris— así que
se comprueba **por orden** y se para en el primero que falle.

### Salto 1 · El recolector emite (en el agente)

```bash
# LINUX
sudo /usr/local/bin/ens_opacc1_collect.sh; echo "rc=$?"
# LDAP
sudo /opt/ensfacil/ens_opacc1ldap_collect.sh; echo "rc=$?"

sudo tail -5 /var/log/ensfacil/op_acc_1.json
```

Esperado: `rc=0`, líneas NDJSON con `"ensfacil":"op.acc.1"`, `ts` actual, **sin**
campo `emisor` en los hechos (ese campo solo lo llevan `score`, `watchdog` y
`simulado`), y un `collector_run` al final.

### Salto 2 · Los hechos y sus veredictos

```bash
sudo jq -c 'select(.event=="evidence_state")|{evidence_id,estado,causa,motivo}' \
  /var/log/ensfacil/op_acc_1.json
```

**`LDAP`** — en **op.acc.1 y op.acc.2** el veredicto útil es el consolidado, no el
de cada plano:

```bash
for n in 1 2; do
  echo "── op.acc.$n"
  sudo jq -r 'select(.event=="evidence_state" and .plano=="consolidado")
              | [.evidence_id,.estado,(.causa//"-")] | @tsv' \
    /var/log/ensfacil/op_acc_$n.json | sort -u
done
```

> **En op.acc.3 y op.acc.4 este filtro NO devuelve nada, y es lo correcto.**
> Medido en `ldap-adm` el 12/08/2026: sus `evidence_state` salen con
> `plano=directorio`, `plano=sistema` o sin `plano`, **nunca `consolidado`**, y
> siempre con `estado=NO_EVALUABLE` y su causa. Nacieron en el modelo nuevo: su
> agente **no emite ningún veredicto de cumplimiento**, solo hechos y huecos de
> medida, y quien juzga es el motor. Un bloque vacío aquí no es un recolector
> roto. Para verlos, quita el filtro de plano:
>
> ```bash
> for n in 3 4; do
>   echo "── op.acc.$n"
>   sudo jq -r 'select(.event=="evidence_state")
>               | [(.plano//"(sin plano)"),.evidence_id,.estado,(.causa//"-")] | @tsv' \
>     /var/log/ensfacil/op_acc_$n.json | sort -u
> done
> ```
>
> Y lo que sí hay que mirar en esos dos son los **hechos** y el latido (§6.4):
> `account_action` / `critical_task_run` en op.acc.3; `remote_access`,
> `privilege_grant`, `privileged_group_member`, `excessive_privilege`,
> `default_deny_violation`, `permission_review` en op.acc.4.

Salida real de `ldap-adm` (op.acc.1) el 12/08/2026 — y es un buen ejemplo de la
trampa del histórico, porque `sort -u` sobre el fichero entero mezcla pasadas:

```
EV-01	CUMPLE	-
EV-02	CUMPLE	-
EV-02	NO_EVALUABLE	COLLECTION
EV-04	CUMPLE	-
EV-04	NO_EVALUABLE	CONFIGURATION
EV-06	NO_CUMPLE	-
EV-06	NO_EVALUABLE	CONFIGURATION
EV-08	CUMPLE	-
EV-08	NO_EVALUABLE	EVIDENCE
```

Para saber el estado **de ahora**, aísla la pasada (§6.1) o filtra por el `ts` del
latido anterior.

> **La ventana empieza en el latido ANTERIOR, no en el último.** El
> `collector_run` es el **último** evento de la pasada, así que filtrar por
> `.ts >= <último latido>` deja fuera todos los hechos de esa pasada y da la
> impresión de que el recolector no emitió nada.

Las cuatro causas, y quién las arregla:

| Causa | Qué pasó | Quién lo arregla |
|---|---|---|
| `CATALOG` | el requisito no tiene con qué demostrarse | nadie: atestación documental, o nada |
| `CONFIGURATION` | falta una decisión escrita | tú: la pantalla o un fichero de `/etc/ensfacil/` |
| `COLLECTION` | no se pudo leer la fuente | el despliegue de Wazuh: auditd, permisos, ruta |
| `EVIDENCE` | el dato llegó y no sirve | el recolector |

### Salto 3 · La regla matchea (en el manager)

Los cuatro `wazuh-logtest` de §2.4. Es la misma comprobación bloqueante que hace
`install-manager.sh` **solo en la pasada en que inserta el `localfile`**; en una
reejecución sin cambios el instalador sale antes de verificar, así que esta
comprobación manual es la única.

### Salto 4 · El agente está leyendo el fichero

Los dos comandos son **en el agente**:

```bash
sudo grep -ac 'op_acc_1.json' /var/ossec/logs/ossec.log
sudo grep -A3 'op_acc_1.json' /var/ossec/etc/shared/agent.conf
```

Esperado: un número mayor que 0 (en `wazuh-real`, hoy, 3) y el bloque
`<localfile>` con la ruta. Si el contador es 0, vuelve a §6.2.

> **En el agente la ruta NO lleva el nombre del grupo.** El manager tiene
> `/var/ossec/etc/shared/<grupo>/agent.conf`; el agente recibe la configuración
> ya fusionada y la deja en `/var/ossec/etc/shared/agent.conf`, sin subdirectorio
> (junto a `merged.mg`). Buscar `…/shared/ens/agent.conf` en el agente da
> `No such file or directory` —comprobado en `wazuh-real`— y parece que el
> `localfile` no llegó cuando sí está.

### Salto 5 · Las alertas llegan al manager

```bash
sudo grep -h "<nombre-del-agente>" /var/ossec/logs/alerts/alerts.json \
  | grep -oE '"id":"10[67][0-9]{3}"' | sort | uniq -c
```

**Este es el paso que cierra `CUMPLE → evidencia → rule ID → evento crudo`.**

Salida real para `zimbraHldap` el 12/08/2026 (recortada):

```
     77 "id":"106811"     ← account_active (EV-01, EV-07)
      6 "id":"106830"     ← collector_warning
     61 "id":"106850"
     28 "id":"106852"
      4 "id":"106873"     ← account_authenticated (EV-03, EV-05)
      7 "id":"106891"     ← collector_run, el latido
     54 "id":"106901"
      1 "id":"106925"
    333 "id":"106936"
     76 "id":"107001"     ← account_action de op.acc.3
```

Si ahí no sale nada: el agente no está en el grupo `ens`, o `logcollector` arrancó
leyendo el fichero por el final (§6.2).

### Salto 6 · Las alertas llegan al índice

Desde el manager, con el certificado de administrador:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     'https://localhost:9200/wazuh-alerts*/_search' \
     -H 'Content-Type: application/json' -d '{
       "size":0,
       "query":{"bool":{"must":[
         {"term":{"agent.id":"028"}},
         {"exists":{"field":"data.ensfacil"}}]}},
       "aggs":{"c":{"terms":{"field":"data.ensfacil","size":10}}}}' \
  | python3 -m json.tool
```

Salida real de hoy para el agente 028 — **3531 documentos**:

```
op.acc.2  1735
op.acc.4   994
op.acc.1   530
op.acc.3   272
```

**`LINUX`, además**: comprobar que están los tres tipos agregados, que son los que
alimentan el semáforo, la pestaña de Evidencias y el score:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     'https://localhost:9200/wazuh-alerts*/_search' \
     -H 'Content-Type: application/json' -d '{
       "size":0,
       "query":{"match_phrase":{"data.ensfacil":"op.acc.1"}},
       "aggs":{"tipos":{"terms":{"field":"data.event","size":30}}}}' \
  | python3 -m json.tool
# esperado: evidence_state, control_state y score_snapshot entre los tipos
```

Si aparecen hechos (`account_authenticated`, `account_active`…) pero ningún
agregado, el recolector funciona y `score.py` no: revisa §6.5 y el cron.

**El latido tiene que estar en el índice**, y esto es lo que más despista.
`collector_run` genera alerta desde el 31/07/2026 (regla **106891**, nivel 3).
Antes solo casaba con la 106800, de nivel 0, y no llegaba. El motor lo lee **desde
el índice** para saber si el silencio de una evidencia puede significar CUMPLE;
sin él, EV-03 se queda sin acreditar con el motivo *«Cobertura del recolector:
DESCONOCIDA»* aunque la máquina esté sana.

### Salto 7 · El plugin lo presenta

En el dashboard, sobre el agente:

1. El control aparece con semáforo, **no en gris**.
2. Sus evidencias aparecen en la pestaña **Evidencias** con estado y motivo.
3. La pestaña de **Trazabilidad** enlaza hasta el evento crudo.

Si se ve, pero se ve **lo viejo**, es caché del navegador: ventana de incógnito,
o F12 → Network → *Disable cache*. Ver `docs/DESPLEGAR_EL_PLUGIN.md` §6.

### Salto 8 · La prueba de que el circuito entero está vivo

**Cambia un parámetro en la pantalla y mira si el color cambia sin tocar el
servidor.** Se rejuzgan los eventos ya indexados.

- op.acc.1: añade a **P-04** una cuenta que se haya autenticado → EV-03 pasa a
  rojo nombrándola. Quítala y vuelve.
- op.acc.4: añade a **P-05** una cuenta que aparezca en `remote_access` → EV-06
  pasa a verde; quítala y vuelve a rojo nombrándola.
- op.acc.3, la más demostrativa: declara en **P-03** `desarrollo | <binario que
  usó una cuenta>` y `operacion | <otro binario de la MISMA cuenta>`, y en
  **P-02** el par `desarrollo | operacion`. `op.acc.3.1` pasa a rojo nombrando la
  cuenta.

Si eso funciona, el circuito completo —agente, reglas, índice, motor, pantalla—
está vivo. Si no, algo está roto aguas arriba y ningún parámetro lo va a arreglar.

---

## 8 · Lo que queda después: declarar la política

Con lo anterior el panel **ya muestra datos**. Que muestre cumplimiento es otra
cosa: el agente observa, y **quién está autorizado lo decide el responsable**.

La configuración vive en **tres sitios que nadie sincroniza**:

| Dónde | Qué va ahí | Quién lo lee |
|---|---|---|
| La pantalla (índice `wazuh-ens-configuration`) | la política: qué está autorizado, qué plazos rigen | **el motor**, al juzgar |
| Ficheros de la máquina (`/etc/ensfacil/*.tsv`, `*.allow`) | decisiones que solo tienen sentido en ESA máquina | **el agente**, al observar |
| El `.env` (`/etc/ensfacil/<control>.env`) | dónde mirar: rutas y umbrales de observación | el agente |

**El agente no lee el índice jamás.** Si rellenas un parámetro en la pantalla y no
cambia nada, ese parámetro lo lee el agente desde su `.env`: mira el
`CUMPLIMIENTO.md` del control.

Reproducible, con fichero versionado:

```bash
cd /opt/ensfacil/repo/config
export OS_CERT=/etc/wazuh-indexer/certs/admin.pem
export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem
sudo -E python3 set-parameters.py politicas/wazuh-real.json          # plan
sudo -E python3 set-parameters.py politicas/wazuh-real.json --apply  # escribe
```

Fusiona, es dry-run por defecto y **se niega a escribir un parámetro que el
control no declare**. Hoy hay un solo fichero de política versionado:
`Wazuh-ENS/config/politicas/wazuh-real.json`.

**Los valores se leen de los propios hechos, no se adivinan:**

```bash
# op.acc.1 P-07: exactamente las cuentas que el agente está emitiendo
sudo jq -r 'select(.event=="account_active")|.usuario' \
  /var/log/ensfacil/op_acc_1.json | sort -u

# op.acc.4 P-01: los sujetos salen de tres eventos distintos
sudo jq -r '(select(.event=="privilege_grant" or .event=="excessive_privilege")|.sujeto),
            (select(.event=="privileged_group_member")|.usuario)' \
  /var/log/ensfacil/op_acc_4.json | sort -u

# op.acc.2 P-10: los SUID reales de la máquina
sudo find / -xdev -type f \( -perm -4000 -o -perm -2000 \) | sort
```

### Tres trampas que tumban el entorno entero, no solo el control

1. **`"value": null` invalida el documento.** El validador
   (`configuration/services/configuration-structure-validator.ts`) acepta
   `undefined | string | number | boolean | string[]`. **`null` no está.** Un
   parámetro nunca configurado **no tiene la clave `value`**; ponerla a `null`
   impide cargar ENSFácil completo con
   `Invalid ENS configuration structure: …has an invalid value`. Para vaciar un
   parámetro hay que **borrar la clave**.
2. **Las columnas `identifier` validan contra `/^[^\s|,]+$/`**: un solo token, sin
   espacios, barras ni comas. Un DN de LDAP va lleno de comas y no cabe. Una fila
   con menos columnas de las declaradas falla igual. **Un parámetro inválido no
   degrada: deja el control a 0 %.**
3. **La ventana de evaluación es de 30 días** (`defaultEvaluationPeriodFrom =
   'now-30d'`, en `core/data-source/evaluation-time-range.ts`), y hoy en wazuh4
   está en ese valor: `configuration.global.evaluationPeriod = "Últimos 30 días"`
   (leído el 12/08/2026). Arreglar la máquina no limpia el pasado: un privilegio
   retirado el 11/08 sigue contando hasta el 10/09. Declarar contra lo que emite
   **hoy** el recolector deja fuera valores que el motor sigue viendo.

Comprobación obligatoria antes de guardar, que replica la regla real del validador
sobre TODO el documento (ya ha fallado dos veces «con buen criterio»):

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active \
 | python3 -c '
import json,sys
def ok(p,k):
    if k not in p: return True
    v=p[k]
    if isinstance(v,bool): return True
    if isinstance(v,(str,int,float)): return True
    if isinstance(v,list): return all(isinstance(x,str) for x in v)
    return False
d=json.load(sys.stdin); malos=0
for ci,c in enumerate(d["_source"]["configuration"]["controls"]):
    for pi,p in enumerate(c.get("parameters",[])):
        for k in ("value","defaultValue"):
            if not ok(p,k):
                malos+=1
                print("INVALIDO controls[%d].parameters[%d].%s (%s/%s)"%(ci,pi,k,c["controlId"],p["id"]))
print("invalidos:",malos)'
```

Y para ver las columnas reales de una tabla antes de rellenarla:

```bash
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active \
 | python3 -c '
import json,sys
for c in json.load(sys.stdin)["_source"]["configuration"]["controls"]:
    for p in c.get("parameters",[]):
        for col in (p.get("columns") or []):
            print(c["controlId"], p["id"], col["label"], col["type"], col.get("required"))'
```

El detalle evidencia a evidencia está en el `CUMPLIMIENTO.md` de cada runbook y en
`op.acc.*-ldap/CUMPLIMIENTO_TOTAL.md`.

---

## 9 · Diagnóstico rápido

| Síntoma | Eslabón roto | Dónde mirar |
|---|---|---|
| **El agente no aparece en el panel, ni en gris** | **el alcance** | **§3: `scope.agentIds`** |
| El control sale `NO_APLICA` sin número | `status` del catálogo | §3.4 |
| La tarjeta del control no aparece en Configuración | falta sembrar el bloque | §3.5, `inject-control.py` |
| No existe `/var/log/ensfacil/op_acc_N.json` | el recolector no corrió nunca, o falta `jq` | §4 |
| El ndjson no crece | el cron no está: `ls /etc/cron.d/ensfacil-*` | §4.3 |
| Hay NDJSON pero `wazuh-logtest` no matchea | reglas no cargadas | §2.4, `systemctl restart wazuh-manager` |
| `wazuh-logtest` sin `Phase 3` con `ensfacil: true` | el evento de prueba está mal | §2.4 |
| `wazuh-logtest` matchea y `ossec.log` no menciona el fichero | el `localfile` no llegó al agente | §1.2, grupo `ens` |
| Ndjson con eventos y nada en el índice, primer despliegue | logcollector leyó por el final | **§6.2: lanza otra pasada** |
| Una evidencia sale gris justo tras el despliegue | `augenrules --load` sin ejecutar | §5.3 |
| op.acc.2 EV-06 siempre gris | auditd parado o sin reglas | §5.4 |
| op.acc.2 EV-03 gris | **no es auditd**: mira la fuente de autenticación | §5.7 |
| Alertas en el índice sin `score_snapshot` | `score.py` no corre | §6.5 y el cron |
| Un parámetro configurado sale como «no configurado» | pipeline del agente desactualizado | `md5sum` (§9.1) |
| Rellené el parámetro y no cambia nada | ese parámetro lo lee el **agente** desde su `.env` | §8 |
| El motivo de una evidencia no cuadra con la config de ahora | estás leyendo la cola del histórico | §6.1 |
| El control entero a 0 % de golpe | parámetro inválido (`null`, coma en `identifier`) | §8, trampas 1 y 2 |
| «He desplegado el plugin y se ve lo viejo» | caché del navegador | `docs/DESPLEGAR_EL_PLUGIN.md` §6 |
| El panel no coincide con el fichero | el panel lee **OpenSearch**, no el fichero | borrar el ndjson no limpia el panel |
| `grep` del `agent.conf` en el agente da `No such file or directory` | buscaste la ruta del **manager** | §7 salto 4: en el agente es `/var/ossec/etc/shared/agent.conf`, sin el grupo |
| **LDAP**: op.acc.3 / op.acc.4 sin ningún `evidence_state` consolidado | **no es un fallo**: esos dos no consolidan planos ni emiten veredicto | §7 salto 2 |
| `install-manager.sh` aborta con «NO matcheó 1068xx» en un manager nuevo | el `analysisd` en marcha aún no leyó el XML recién copiado | §2.2: reinicia el manager y reejecuta |
| `ens_emit` devuelve 3 y no se persiste ni un evento | falta `jq` | §1.3 |
| **LDAP**: op.acc.4 sin plano directorio y el resto bien | falta `ldapsearch`: su instalador no lo pone | §1.3, §4.2 |

### 9.1 Que el agente corre la versión del repo

Una máquina con el pipeline desactualizado da síntomas que apuntan al sitio
equivocado: dio *«parámetro no configurado» con el parámetro configurado*, porque
la librería vieja lo descartaba.

```bash
# LINUX
md5sum /usr/local/bin/ens_opacc1_collect.sh ~/op.acc.1-*/scripts/ens_opacc1_collect.sh
md5sum /opt/ensfacil/opacc1-lib.sh          ~/op.acc.1-*/lib/opacc1-lib.sh
# LDAP
md5sum /opt/ensfacil/ens_opacc4ldap_collect.sh ~/op.acc.4-ldap/scripts/ens_opacc4ldap_collect.sh
md5sum /opt/ensfacil/opacc4ldap-lib.sh         ~/op.acc.4-ldap/lib/opacc4ldap-lib.sh
```

### 9.2 Coherencia entre los repos

El que más veces ha salvado un despliegue. Verifica que toda regla que el plugin
acredita exista desplegada en un manager, que la canónica y las copias no
divergen, y que las evidencias escuchan el contrato que emiten los agentes.

```bash
cd /opt/ensfacil/repo && python3 tests/check-coherencia.py   # rc=0 si todo cuadra
```

---

## 10 · Retirar un control de una máquina

**Los `uninstall.sh` de LINUX y de LDAP no son el mismo script y no aceptan los
mismos flags.** Comprobado en los ocho repos.

### 10.1 `LINUX`

```bash
sudo bash ~/op.acc.1-identificacion/uninstall.sh                  # real + simulador
sudo bash ~/op.acc.1-identificacion/uninstall.sh --solo-real
sudo bash ~/op.acc.1-identificacion/uninstall.sh --solo-fake
```

Uso completo, leído de la cabecera del script:

```
uninstall.sh [--solo-fake|--solo-real] [--deja-el-simulador]
             [--borra-evidencias] [--borra-config] [--todo]
```

Es idempotente; la segunda pasada termina con `NADA QUE RETIRAR`. **Nunca borra
con comodín**: solo rutas literales de su propio inventario.

Lo que **no** borra, y por qué:

| Se conserva | Motivo | Cómo destruirlo |
|---|---|---|
| `/var/log/ensfacil/op_acc_N.json` y sus rotados | es la evidencia del control | `--borra-evidencias` |
| `/etc/ensfacil/<control>.env` y los `.tsv` | ajustes y decisiones del responsable | `--borra-config` |
| `/opt/ensfacil/ensfacil-emit.sh` y los directorios | compartidos con los demás controles | nunca desde aquí |

`--solo-real` sobre una máquina con el cron del simulador la dejaría emitiendo
**solo evidencia inventada**: aborta con código distinto de 0 sin tocar nada, y la
única vía de escape es `--deja-el-simulador`.

### 10.2 `LDAP`

Otro script, mucho más corto, y **solo tiene `--todo`**:

```bash
sudo bash ~/op.acc.1-ldap/uninstall.sh          # retira cron y scripts; CONSERVA datos
sudo bash ~/op.acc.1-ldap/uninstall.sh --todo   # además: .env, estado y ndjson
```

> **No hay `--solo-real`, `--solo-fake`, `--borra-evidencias` ni `--borra-config`
> en los repos LDAP, y el script NO valida los argumentos**: escribir
> `--solo-real` no da error, se ignora y se ejecuta la retirada por defecto. Los
> repos LDAP tampoco traen simulador (`install-fake.sh` no existe en ninguno de
> los cuatro), así que la distinción real/fake no aplica ahí.

Igual que en Linux, `ensfacil-emit.sh` **no se borra**: lo comparten todos los
controles de la máquina.

### 10.3 El manager hay que limpiarlo a mano

**Ningún `uninstall.sh` toca el manager**, y **`install-manager.sh` tampoco retira
nada**: solo instala. Si quieres dejar de recibir un control, el XML de
`/var/ossec/etc/rules/` y el `<localfile>` del `agent.conf` del grupo `ens` se
quitan tú mismo, con copia previa y un `systemctl restart wazuh-manager` después.
**No lo he ejecutado**, así que aquí no doy los comandos como verificados.

Cuidado con el orden: quitar el `<localfile>` deja de recoger, pero las alertas
ya indexadas siguen en `wazuh-alerts-*` y el motor las sigue viendo durante la
ventana de evaluación (§8, trampa 3).

---

## Qué NO he podido verificar en este documento

Lo digo con estas palabras porque no se puede escribir lo que no se ha
comprobado.

- **No he ejecutado ningún instalador.** Ni `install-manager.sh` ni
  `install.sh`. Las dos máquinas ya los tenían aplicados; lo que verifiqué es
  el **resultado** (ficheros, permisos, cron, reglas de auditd, reglas del
  manager), no el proceso. Las salidas de pantalla que cito están **leídas del
  código de los scripts y de los `docs/`**, no capturadas de una ejecución mía.
- **El orden interno de `install-manager.sh` está leído del código, no
  ejecutado.** Lo que sí está verificado línea a línea es que la comprobación con
  `wazuh-logtest` es **bloqueante y previa** al único `systemctl restart` del
  script, en los cuatro repos de Linux. Lo que **no** he reproducido es el falso
  negativo que eso puede provocar en un manager que nunca cargó las reglas
  (§2.2): está deducido, y así está escrito.
- **No he cambiado el alcance ENS ni ningún parámetro.** El comando de lectura de
  §3.1 sí está ejecutado y verificado; **el de escritura no existe en este
  documento a propósito**.
- **No he creado un grupo `ens` ni dado de alta un agente nuevo.** Los pasos de
  §1.1 salen de `docs/01-instalacion.md` de op.acc.1 y op.acc.2 y del comando
  `agent_groups -a` de `CUMPLIMIENTO_TOTAL.md`. `agent_groups -s` sí lo ejecuté.
- **No he probado el comportamiento de `logcollector` leyendo por el final.** Es
  el mecanismo documentado en `op.acc.1-ldap/CUMPLIMIENTO_TOTAL.md` (paso 0) y lo
  que explica el síntoma; no lo he reproducido midiendo.
- **No he probado `augenrules --load` ni cargado ninguna regla de auditd.** Solo
  he leído el estado ya cargado en las dos máquinas.
- **No he cubierto `mp.info.6`** (existe en el manager y en el `agent.conf`, pero
  su runbook no entra en este documento) **ni el agente Windows `WIN-OPACC-LAB`
  (029)**, para el que no he leído ningún runbook.
- **No sé por qué `ensfacil_op_acc_4_json_rules.xml` tiene propietario
  `root:wazuh`** en vez de `wazuh:wazuh` como los otros cinco. Lo he observado y
  no lo he tocado.
- **Los `docs/01..07` de los repos LDAP no existen.** `op.acc.1-ldap/docs/` está
  vacío y los otros tres repos LDAP no tienen `docs/`. Todo lo de LDAP sale de
  `CUMPLIMIENTO_TOTAL.md`, `DIFERENCIAS_CON_EL_CONTROL_NORMAL.md`, `README.md` y
  los propios `install.sh`.
- **El recuento de `auditctl -l | grep -c ensfacil` no es un criterio estable.**
  `CUMPLIMIENTO_TOTAL.md` dice ~22 para el LDAP y hoy da 37, y wazuh-real da 67.
  No he investigado la diferencia más allá de constatar que las reglas cambiaron.
- **No he retirado ningún control de ninguna máquina.** Los flags de §10 salen de
  la cabecera y del parseo de argumentos de cada `uninstall.sh`, leídos; no he
  ejecutado ninguno. La limpieza del manager (§10.3) no la he hecho ni la doy
  como verificada.
- **No he probado que `op.acc.4-ldap/install.sh` falle sin `ldap-utils`.** Lo
  que sí está verificado es que su bloque de dependencias solo comprueba `jq`, y
  que en `ldap-adm` `ldapsearch` ya estaba puesto por otro instalador. La
  consecuencia en una máquina limpia está deducida de ahí.
- **Contradicciones entre fuentes que he dejado anotadas y no he «arreglado»**,
  porque no me toca tocar los repos: la cabecera de `install.sh` de op.acc.2
  sobre EV-03 (§5.7), los `docs/02-manager.md` y `03-agente.md` de op.acc.1 con la
  URL vieja del remoto (§1.4), y `CLAUDE.md` de `Wazuh-ENS`, cuya tabla de
  "Controles implementados" todavía marca op.acc.3 y op.acc.4 como **DRAFT**
  cuando `catalog/op-acc-3.ts` y `catalog/op-acc-4.ts` dicen `status: 'ACTIVE'`
  (§3.4, comprobado en el código el 12/08/2026).

---

## Enlaces

| | |
|---|---|
| Compilar e instalar el plugin | `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` |
| Llevar una máquina Linux al cumplimiento | `Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` |
| El caso real, con números antes y después | `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` |
| Llevar un servidor LDAP al cumplimiento | `op.acc.*-ldap/CUMPLIMIENTO_TOTAL.md` |
| Por qué el LDAP necesita runbook propio | `op.acc.*-ldap/DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` |
| Qué configurar, evidencia a evidencia | el `CUMPLIMIENTO.md` de cada runbook |
| Cómo juzga el motor | `Wazuh-ENS/docs/PRIMITIVAS_DE_JUICIO.md` |
| Detalle por control (Linux) | `op.acc.{1,2,3,4}-*/docs/01..07` |
