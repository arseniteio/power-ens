# De 0 % a 100 %: lo que se hizo en wazuh-real, paso a paso

El 06 y 07 de agosto de 2026 se llevó una máquina real —`wazuh-real`, Ubuntu
24.04, agente 024— desde «no hay nada de cumplimiento» hasta esto:

| Control | Antes | Después | Qué lo movió |
|---|---|---|---|
| op.acc.1 | 38 % | **75 %** | declarar P-07 y P-ATT, y distinguir «cero bajas» de «sin registro» |
| op.acc.2 | 0 % | **100 %** | declarar P-04, P-08, P-10, P-11 y endurecer el `umask` |
| op.acc.3 | no aplica | 0 % | pasarlo a ACTIVE; el 0 % es un hallazgo real, no un fallo |
| op.acc.4 | no aplica | 20 % | columnas de P-01/P-02/P-07 y corregir el recolector |

Este documento es el registro de **qué se hizo y en qué orden**, para que
cualquiera lo repita. La guía general del método está en
[`PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md`](PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md);
esto es el caso concreto con sus números.

Se escribe también lo que **no** subió y por qué, porque un procedimiento que
solo cuenta los aciertos no sirve para repetirlo.

---

## Lo primero: el cumplimiento no se arregla en el sitio donde se mira

La lección que más tiempo costó. Durante horas se midió **el agente** —cuántas
evidencias recogía el recolector— y se reportó como avance. El panel mide **el
motor**, que es otra cosa: el agente puede recoger siete evidencias y el motor
no poder juzgar ninguna.

Y hay un tercer sitio: **el plugin desplegado**. Un arreglo en el código no
existe hasta que se recompila y se instala. Tres veces en esta sesión se dio por
hecho que un cambio estaba en producción sin estarlo.

Antes de decir «esto ya está», comprueba los tres:

```bash
# 1. ¿El agente emite?
sudo jq -r 'select(.event=="collector_run")|.evidencias_cubiertas' \
  /var/log/ensfacil/op_acc_1.json | tail -1

# 2. ¿El motor tiene con qué juzgar? (parámetros obligatorios sin valor)
#    Ver el bloque "Comprobar la configuración" más abajo.

# 3. ¿Lo desplegado es lo compilado?
sudo stat -c '%n %y' $(sudo find /usr/share/wazuh-dashboard/plugins/wazuh \
  -name 'wazuh.chunk.2.js')
```

---

## Paso 1 · Acotar el alcance a lo que de verdad se audita

El índice tenía `{mode: 'group', groupIds: ['ens']}`, y en ese grupo había una
máquina de otro proyecto sin recolectores. Generaba no conformidades de «fallo de
recogida» en cascada —cinco de las nueve de op.acc.4— y, peor, **inflaba el
cumplimiento**: una máquina sin agente puntuaba 100 en op.acc.3 (ver el paso 6).

El alcance real vive en `configuration.scope`, un objeto. **No confundirlo con
`configuration.global.scope`, que es el texto descriptivo de la pantalla** — se
escribió ahí por error y dejó el documento inválido.

```json
{ "mode": "agent", "agentIds": ["024"], "groupIds": [] }
```

Sacar una máquina del alcance es legítimo solo si de verdad no está auditada.
Si lo está y no reporta, eso es un hallazgo y tiene que contar.

---

## Paso 2 · Declarar lo que el responsable decide

Aquí es donde se gana la mayor parte del cumplimiento, y **no toca la máquina**:
son decisiones que el ENS exige que alguien tome por escrito.

Se hace con `config/set-parameters.py`, que fusiona, es dry-run por defecto y se
niega a escribir un parámetro que el control no declare:

```bash
export OS_CERT=/etc/wazuh-indexer/certs/admin.pem
export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem
python3 config/set-parameters.py config/politicas/wazuh-real.json          # plan
python3 config/set-parameters.py config/politicas/wazuh-real.json --apply  # escribe
```

Lo que se declaró, y **por qué cada cosa es defendible**:

### op.acc.2 P-10 · línea base de SUID/SGID

Se enumeraron los binarios de la máquina, se revisaron uno a uno contra el juego
estándar de Ubuntu 24.04 y **entonces** se declararon:

```bash
sudo find /usr /bin /sbin /opt -xdev \( -perm -4000 -o -perm -2000 \) -type f | sort
```

Salieron 21, todos conocidos (`sudo`, `passwd`, `mount`, los helpers de
dbus/openssh/polkit…), ninguno en `/opt` ni en un `home`. **La revisión ES el
control**: sembrar P-10 con lo que hay sin mirarlo declararía autorizada la
puerta trasera de un sistema ya comprometido.

### op.acc.2 P-08 · derechos exigidos por recurso

Los permisos que el responsable **exige**, no una foto de lo que hubiera:

```
/etc/shadow  | 640 | root:shadow
/etc/sudoers | 440 | root:root
…
```

Son los valores endurecidos estándar de Debian/Ubuntu. La diferencia importa: si
la máquina se desvía de esto, EV-04 lo dirá. Si se hubiera sembrado con lo que
había, cualquier desviación previa quedaría bendecida.

### op.acc.4 P-01 · matriz de privilegios

Se leyó lo que `sudo` concede de verdad y se declaró **solo lo legítimo**:

```bash
sudo grep -rhE '^[^#].*ALL' /etc/sudoers /etc/sudoers.d/ | grep -v '^Defaults'
```

Faltaban `%sudo` (el grupo de administración estándar) y `syslog` en `adm` (la
cuenta que lee los logs). Sin ellos, EV-03 y EV-08 acusaban a dos cosas
legítimas: **no conformidades falsas, que mienten igual que un CUMPLE falso**.

Los dos `ALL=(ALL) NOPASSWD:ALL` **no se declararon**, a propósito: son sudo sin
contraseña y son un privilegio por encima del mínimo de verdad. EV-02 los señala
y tiene razón.

### op.acc.1 P-ATT · atestaciones documentales

`op.acc.1.5` (eIDAS) y `op.acc.1.r1.1` (singularizar a la persona) no los puede
demostrar ninguna telemetría: son documentos. El parámetro `P-ATT` acredita ese
tipo de requisito, y **solo ese tipo** — el motor comprueba que el requisito no
declare evidencias antes de admitirlo, así que una atestación nunca puede tapar
una medida que falló.

Formato: `requisito | documento | enlace | fecha | responsable`.

En esta máquina se pusieron con la referencia empezando por `PENDIENTE DE
SUSTITUIR`, porque **el documento real todavía no existe**. Eso es lo que el
panel enseña, así que ningún auditor se confunde. Cuando exista, se sustituye la
fila entera desde la pantalla.

---

## Paso 3 · Comprobar la configuración antes de seguir

Ningún cambio en la máquina compensa un parámetro obligatorio vacío. Esto lo
dice de un vistazo:

```bash
sudo curl -s --cert /etc/wazuh-indexer/certs/admin.pem \
  --key /etc/wazuh-indexer/certs/admin-key.pem -k \
  "https://localhost:9200/wazuh-ens-configuration/_doc/active" \
| python3 -c '
import json,sys
cfg = json.load(sys.stdin)["_source"]["configuration"]
for c in cfg["controls"]:
    vac = [p["id"] for p in c["parameters"]
           if p.get("required") and p.get("value") in (None,"",[],{})]
    print("%-11s obligatorios vacios: %s" % (c["controlId"], ", ".join(vac) or "ninguno"))
'
```

Objetivo: **ninguno** en todos los controles que se quieran evaluar.

---

## Paso 4 · Endurecer la máquina, y contar con que el control lo note

El único incumplimiento medido de op.acc.2 era `umask 022` frente al `027` que
declara P-07. Se corrigió en `/etc/login.defs`, guardando copia:

```bash
sudo cp /etc/login.defs /etc/login.defs.antes-ens-$(date +%Y%m%d)
sudo sed -i 's/^UMASK\t\t022/UMASK\t\t027/' /etc/login.defs
```

EV-01 pasó a CUMPLE. **Y EV-02 pasó a NO_CUMPLE**, porque `/etc/login.defs` es
una de las rutas críticas de P-02 y el control de integridad acababa de ver que
había cambiado.

Eso no es un fallo, es el producto funcionando: un cambio en un fichero vigilado
se reporta siempre, lo haga un atacante o el administrador. Se cierra en la
siguiente pasada, que sustituye la línea base por la foto nueva:

```bash
sudo /usr/local/bin/ens_opacc2_collect.sh
sudo bash -c 'set -a; . /etc/ensfacil/opacc2.env; exec /usr/local/bin/ens_opacc2_score.py'
```

**Comprueba que el cambio es el tuyo antes de volver a pasarlo.** Re-sellar la
línea base sobre un cambio que no reconoces es exactamente cómo se pierde una
intrusión.

Resultado: op.acc.2 con las **siete evidencias en CUMPLE** y el control al 100 %.

---

## Paso 5 · Distinguir «no ha pasado nada» de «no lo estoy mirando»

op.acc.1 EV-04 mide el plazo de deshabilitación tras una baja. En esta máquina
nunca se había ido nadie, y el recolector la dejaba `NO_EVALUABLE` para siempre.

Cero bajas no es lo mismo que no llevar registro. Lo que le importa a un auditor
es si el responsable **declaró dónde se anotan**. Basta con que el fichero exista:

```bash
sudo tee /var/lib/ensfacil/opacc1/bajas.tsv >/dev/null <<'EOF'
# Bajas de personal declaradas a mano (P-09 de la pantalla).
# Una fila por persona: usuario<TAB>AAAA-MM-DD.
# El fichero EXISTE aunque no haya ninguna baja: su presencia declara que aquí
# es donde se anotan, y su ausencia es lo que deja EV-04 sin medir.
EOF
sudo chmod 640 /var/lib/ensfacil/opacc1/bajas.tsv
```

EV-04 pasa a CUMPLE con el motivo escrito: *la fuente está declarada y se ha
consultado; no consta ninguna baja, así que no hay ningún plazo que se haya
podido incumplir*. En cuanto haya una baja fuera de plazo, la misma función la
acusa.

**Esto no vale para todo.** op.acc.4 EV-05 exige que la revisión periódica de
permisos **haya ocurrido**: ahí un fichero vacío no acredita nada, porque el ENS
pide una acción, no la ausencia de un evento. Por eso `opacc4-revisiones.tsv` se
dejó con cabeceras y un comentario explicando por qué está vacío.

---

## Paso 6 · Desconfiar de los CUMPLE que salen solos

Dos se encontraron auditando el código, no mirando la pantalla, y los dos
inflaban el número:

**op.acc.3 daba 100 puntos a una máquina sin agente.** Sin acciones observadas
respondía «no hay ninguna cuenta que aúne funciones». Pero *«no he visto a nadie
aunar funciones»* y *«no he mirado»* producen el mismo conjunto vacío. Ahora
exige un latido `collector_run` de las últimas 24 horas; sin él, `NO_EVALUABLE`.

**Al consolidar varias máquinas, el score de un requisito se quedaba con el de la
primera** aunque el veredicto fuera el peor.

La regla que sale de aquí: **cuando un control pase a verde sin que nadie haya
tocado la máquina, sospecha.** El silencio solo acredita si consta que se barrió.

---

## Lo que no subió, y por qué

Ninguna de estas se arregla con código ni configuración. Están aquí porque un
procedimiento honesto tiene que decir dónde se para.

**op.acc.1 EV-06 · `dioni` acumula rol de usuario y administrador.** Está en
`sudo` y no existe `dioni.adm`. La corrección ENS es crear la cuenta
administrativa aparte y sacar al usuario del grupo — un cambio en los accesos de
la organización, no un ajuste técnico.

**op.acc.3 · una sola persona ejerce todas las funciones.** El hallazgo literal
es `dioni (auditoria + operacion + desarrollo + mantenimiento)`. En una máquina
con un único administrador **eso es verdad y el control tiene razón**. La
segregación de funciones no se resuelve con software: se resuelve con más
personas, o declarando en P-02 qué pares se aceptan con su justificación.

**op.acc.4 EV-02 · sudo sin contraseña.** `/etc/sudoers.d/dioni-ensfacil`, un
acceso temporal de desarrollo. Se cierra retirándolo:

```bash
sudo rm /etc/sudoers.d/dioni-ensfacil
```

**op.acc.4 EV-05 · nunca se ha hecho una revisión de permisos documentada.** El
ENS la exige (`op.acc.4.4`). Cuando se haga de verdad, se anota:

```
fecha<TAB>alcance<TAB>responsable
```

Inventarse una fila con una fecha falsa es exactamente el CUMPLE falso que este
producto existe para no dar.

**mp.info.6 · sin configurar.** Necesita las credenciales del Proxmox Backup
Server.

---

## El techo honesto de esta máquina

Con todo lo anterior aplicado y **sin hacer trampas**:

- **op.acc.2 llega al 100 %** y es real.
- **op.acc.1 se queda en el 75 %** hasta que exista `dioni.adm`.
- **op.acc.3 se queda en el 0 %** mientras una sola persona haga todo. Es el
  resultado correcto, no un defecto: un servidor administrado por una única
  persona no tiene segregación de funciones, y decir lo contrario sería mentir.
- **op.acc.4 sube al retirar el sudo temporal** y llega a su techo cuando se
  documente la primera revisión de permisos.

Un 0 % que dice la verdad vale más que un 100 % que no.
