# Poner una máquina en cumplimiento, de principio a fin

El procedimiento completo, en el orden en que hay que hacerlo, con lo que sale
mal en cada paso. Sale de desplegar los cinco controles sobre un servidor real
el 06/08/2026 y de arreglar lo que se rompió.

Cada control tiene además su propio **`CUMPLIMIENTO.md`** con lo suyo. Este
documento es el marco: **qué se hace, en qué orden y por qué**.

---

## El modelo, en dos frases

**El agente observa y el motor juzga.** El agente emite hechos —qué cuentas hay,
quién entró, qué privilegio existe— y el veredicto lo pone el plugin
contrastándolos con lo que tú declaras.

**Lo que no se puede demostrar, no cumple.** La carga de la prueba es del
auditado. Un parámetro vacío no es un cero técnico: es una decisión que nadie ha
escrito, y eso no acredita.

De ahí que el cumplimiento se alcance por **dos vías, y haya que recorrer las
dos**:

```
   LA MÁQUINA                        LA DECLARACIÓN
   que el sistema esté bien    +     que tú declares contra qué se compara
```

Ninguna de las dos sola sirve. Una máquina impecable sin política declarada sale
en gris; una política perfecta sobre una máquina mal configurada sale en rojo.

---

## Los tres sitios donde vive la configuración

Es el primer sitio donde se pierde la gente, y conviene tenerlo claro antes de
tocar nada.

| Dónde | Qué va ahí | Quién lo lee |
|---|---|---|
| **La pantalla** (índice `wazuh-ens-configuration`) | la política: qué está autorizado, qué plazos rigen | **el motor**, al juzgar |
| **Ficheros de la máquina** (`/etc/ensfacil/*`) | las decisiones que solo tienen sentido en ESA máquina: qué ACL debe tener cada recurso, qué comando es cada tarea crítica | **el agente**, al observar |
| **El `.env`** (`/etc/ensfacil/<control>.env`) | dónde mirar: rutas, umbrales de observación | el agente |

**Los tres almacenes no se sincronizan solos.** El plugin nunca escribe en una
máquina auditada y el agente nunca lee el índice. En op.acc.3 y op.acc.4 el
`.env` no lleva política ninguna; en op.acc.1, op.acc.2 y mp.info.6 sí queda
alguna, y ahí editar la pantalla no cambia el veredicto. Cada `CUMPLIMIENTO.md`
dice cuál es cuál en su control.

---

## El procedimiento

### 1 · Manager: reglas, plugin y siembra

```bash
# como TU USUARIO, nunca con sudo: si root se queda con el .git no puedes
# volver a actualizar
cd /opt/ensfacil/repo && git pull && git log --oneline -1

cd ~
BASE=git@gitlab.com:quersystem2/ens-controls-runbook
for r in mp.info.6-proxmox-backup-runbook op.acc.1-identificacion \
         op.acc.2-requisitos-de-acceso op.acc.3-segregacion-de-funciones-y-tareas \
         op.acc.4-proceso-de-gestion-de-derechos-de-acceso; do
  [ -d "$r" ] && (cd "$r" && git pull -q) || git clone -q "$BASE/$r.git"
done

for r in ~/mp.info.6-* ~/op.acc.*; do sudo bash "$r/install-manager.sh"; done
```

Cada instalador copia sus reglas, **recarga el manager y después verifica** con
`wazuh-logtest`. Si la regla no dispara, restaura y no deja el manager
funcionando con reglas que no casan.

> **El orden importa y costó una hora descubrirlo.** `wazuh-logtest` no compila
> el ruleset del disco: habla con el `analysisd` **en marcha**. Verificar antes
> de recargar pregunta por un ruleset que el demonio no ha leído todavía, y
> devuelve un falso negativo sobre un despliegue perfecto.

Después el plugin (**[`DESPLEGAR_EL_PLUGIN.md`](DESPLEGAR_EL_PLUGIN.md)**) y la
siembra de los bloques, sin la cual las tarjetas no aparecen:

```bash
cd /opt/ensfacil/repo/config
export OS_CERT=/etc/wazuh-indexer/certs/admin.pem
export OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem
for c in mp.info.6 op.acc.1 op.acc.2 op.acc.3 op.acc.4; do
  sudo -E python3 inject-control.py "$c" --apply
done
```

El certificado de administrador del indexer siempre está en la máquina; la
contraseña de `admin` vive en el keystore del dashboard y no se puede leer en
claro. Por eso se usa el certificado: para no acabar buscando una contraseña
fuera de la máquina.

### 2 · Agente: instalar y abrir las fuentes

```bash
sudo bash ~/op.acc.1-identificacion/install-real.sh
sudo bash ~/op.acc.2-requisitos-de-acceso/install-real.sh
sudo bash ~/op.acc.4-proceso-de-gestion-de-derechos-de-acceso/install-real.sh
sudo bash ~/op.acc.3-segregacion-de-funciones-y-tareas/install-real.sh

sudo augenrules --load                     # ← el paso que se olvida
sudo auditctl -l | grep ensfacil           # tiene que devolver algo
sudo systemctl enable --now wazuh-agent    # sin esto nada llega al manager
```

**`augenrules --load` es un paso aparte a propósito**: escribir el fichero de
reglas no las carga, y el instalador nunca hace `auditctl -D`, que descargaría
también las reglas del hardening del cliente.

> **op.acc.3 tiene coste de disco.** Su regla observa *todas* las ejecuciones de
> usuarios reales. Mira `max_log_file` y `num_logs` en `auditd.conf` antes de
> cargarla en una máquina con actividad.

### 3 · Declarar la política

Dos mitades, y hacen falta las dos.

**En la pantalla.** A mano en *Configuración → el control*, o de forma
reproducible con un fichero versionado:

```bash
cd /opt/ensfacil/repo/config
sudo -E python3 set-parameters.py politicas/<maquina>.json          # plan
sudo -E python3 set-parameters.py politicas/<maquina>.json --apply  # escribe
```

Fusiona: lo que no se nombra no se toca. Y no inventa parámetros — si el fichero
nombra uno que el control no declara, se para.

**En la máquina.** Los ficheros de `/etc/ensfacil/`, que cada `CUMPLIMIENTO.md`
detalla. Formato con **TABULADOR**, no espacios:

```bash
printf 'usuario\t2026-08-02\n' | sudo tee /var/lib/ensfacil/opacc1/bajas.tsv
```

Escribirlos en un editor casi siempre mete espacios y entonces la fila no se lee.

### 4 · Comprobar que mide

```bash
# una pasada aislada: el ndjson es un HISTÓRICO y un `tail` mezcla ejecuciones
sudo mv /var/log/ensfacil/op_acc_1.json /var/log/ensfacil/op_acc_1.json.antes
sudo /usr/local/bin/ens_opacc1_collect.sh

# el latido: de aquí cuelga que un silencio pueda valer como cumplimiento
sudo jq -c 'select(.event=="collector_run")|{resultado,evidencias_cubiertas}' \
  /var/log/ensfacil/op_acc_1.json | tail -1

# y lo que no se pudo medir, con su causa
sudo jq -c 'select(.event=="evidence_state")|{evidence_id,causa,motivo}' \
  /var/log/ensfacil/op_acc_1.json
```

| Causa | Quién lo arregla |
|---|---|
| `CONFIGURATION` | tú: falta declarar algo, en la pantalla o en un fichero |
| `COLLECTION` | el despliegue: falta auditd, una ruta no se puede leer |
| `EVIDENCE` | el recolector: el dato llegó y no sirve |

> **`collect.sh` no es la pasada completa** en los controles del modelo clásico.
> El cron ejecuta también `score.py`, que es quien deriva los estados agregados.
> Corriendo solo el recolector faltan evidencias que aún no se han calculado.

### 5 · La prueba de que el circuito entero está vivo

**Cambia un parámetro y mira si el color cambia sin tocar el servidor.**

Añade a P-04 de op.acc.1 una cuenta que se haya autenticado: EV-03 pasa a rojo
nombrándola. Quítala y vuelve. Se rejuzgan los eventos ya indexados.

Si eso funciona, el circuito completo —agente, reglas, índice, motor, pantalla—
está vivo. Si no, algo está roto aguas arriba y ningún parámetro lo va a
arreglar.

---

## Lo que hace que un número sea honesto

Tres cosas que este producto no hace, y conviene saber por qué al mirar un rojo.

### Un silencio no acredita sin fuente viva

«No he visto ninguna cuenta genérica autenticarse» solo vale si el recolector
**pudo mirar**. Por eso cada pasada emite un latido con `evidencias_cubiertas`,
y una evidencia que degradó no consta ahí.

Esto no es teoría. En el despliegue del 06/08, `ausearch` sin `--input-logs`
leía de **stdin**: desde una terminal devolvía 3812 eventos y **desde cron,
cero**. El recolector daba ese vacío por bueno y el motor lo convertía en
CUMPLE — un cumplimiento afirmado sobre una fuente rota, invisible en cualquier
prueba manual. Ahora, antes de aceptar un silencio, se comprueba que la fuente
rinde algo.

### Un hallazgo falso es tan grave como un CUMPLE falso

Declarar como política algo que la máquina no tiene produce rojos que nadie
puede cerrar. Por eso la política tiene que **describir la máquina**, no una
máquina ideal: si declaras un ACL «correcto» que el sistema no tiene, no has
mejorado nada, has fabricado una desviación.

### Una atestación no puede tapar una medida

Los requisitos que ninguna telemetría alcanza —eIDAS, singularizar a la
persona— se acreditan con documento en **P-ATT**. Pero solo esos: el motor lo
admite únicamente donde el catálogo declara que no hay evidencia técnica. Si la
máquina midió y falló, ningún enlace lo cambia.

---

## Cuando no se llega al 100 %

**Es lo normal, y muchas veces es lo correcto.** Un control en rojo por un
hallazgo real está haciendo su trabajo.

Los rojos se clasifican en tres, y solo uno se arregla configurando:

| Tipo | Qué significa | Qué hacer |
|---|---|---|
| **Medido y no conforma** | el motor miró y el sistema no cumple | arreglar la máquina |
| **No evidenciado · configuración** | falta declarar la política | rellenarla |
| **No evidenciado · del catálogo** | el requisito no tiene con qué demostrarse | atestación documental, o nada |

Y hay techos estructurales, que están documentados en
**[`CUMPLIMIENTO_TOTAL.md`](CUMPLIMIENTO_TOTAL.md)**: mp.info.6 no alcanza ALTO
porque la copia externa no tiene recolector, y op.acc.3 no es alcanzable en una
máquina de un solo administrador — no porque falte configurarlo, sino porque la
segregación de funciones exige más de una persona.

**Ese último caso conviene decirlo en el informe tal cual.** «No alcanzable con
un solo administrador» es una conclusión de auditoría legítima y útil; un verde
fabricado sobre la misma máquina, no.

---

## Dos trampas del despliegue que cuestan una tarde

**El plugin se compila con node 18, no con el que tengas por defecto.** Con node
22 el bundle compila bien —`succ 1 bundles compiled successfully`— y acto
seguido el proceso muere por un `DeprecationWarning` de `fs.Stats`, sin decir
"error" en ninguna parte. Si además canalizas la salida por `tail`, el código de
salida es el del `tail` y parece que fue bien. No hay zip y nadie lo dice:

    nvm use 18.19.0
    cd <arbol>/plugins/main
    YARN_IGNORE_ENGINES=1 node ../../scripts/plugin_helpers build \
      --allow-root --opensearch-dashboards-version=2.19.5
    ls -la build/*.zip        # si no hay zip, NO se ha construido

**`wazuh.chunk.2.js` no lleva hash en el nombre.** El navegador sirve el que
tiene cacheado aunque acabes de desplegar otro, así que una recarga normal
enseña el plugin viejo y parece que el despliegue no ha hecho nada. Hay que
recargar forzando (Cmd/Ctrl + Shift + R) o abrir en una ventana privada. Para
comprobar desde el servidor qué se está sirviendo de verdad:

    sudo stat -c '%n %y' $(sudo find /usr/share/wazuh-dashboard/plugins/wazuh \
      -name 'wazuh.chunk.2.js')

## Endurecer la máquina cambia ficheros que el propio control vigila

Es la secuencia que más desconcierta la primera vez, y es correcta:

1. El panel dice que `op.acc.2` EV-01 no conforma: `umask 022` frente al `027`
   que exige P-07.
2. Se corrige en `/etc/login.defs`. EV-01 pasa a CUMPLE.
3. **Y EV-02 pasa a NO_CUMPLE**, porque `/etc/login.defs` es una de las rutas
   críticas de P-02 y el control de integridad acaba de ver que ha cambiado.

No es un fallo: es el control haciendo su trabajo. Un cambio en un fichero
vigilado se reporta SIEMPRE, lo haga un atacante o el administrador. Lo que
distingue a uno de otro no es la herramienta, es que el segundo esté autorizado
y quede constancia.

El hallazgo se emite UNA vez y la línea base se sustituye por la foto nueva, así
que la siguiente pasada del recolector lo cierra:

    sudo /usr/local/bin/ens_opacc2_collect.sh
    sudo bash -c 'set -a; . /etc/ensfacil/opacc2.env; exec /usr/local/bin/ens_opacc2_score.py'

Antes de volver a pasarlo, comprueba que el cambio es el que querías. Volver a
sellar la línea base sobre un cambio que no reconoces es exactamente cómo se
pierde una intrusión.

Y guarda la copia previa (`cp /etc/login.defs /etc/login.defs.antes-ens-AAAAMMDD`
antes de editar): es lo que enseña un auditor cuando pregunta qué había antes.

**Sobre el `umask` en concreto**: `022` crea ficheros 644, legibles por cualquier
usuario del sistema; `027` los crea 640. Solo afecta a los ficheros NUEVOS, no a
los que ya existen, y solo a los procesos que arranquen después. Si algún
servicio esperaba ficheros legibles por todos, se entera al reiniciarlo, no
antes.

## Los errores que cuestan una tarde

Ordenados por las veces que han pasado de verdad.

| Síntoma | Causa |
|---|---|
| «He desplegado y se ve lo viejo» | caché del navegador. `wazuh.chunk.2.js` **no lleva hash**, así que una recarga normal sirve el chunk anterior. `Ctrl+Shift+R` |
| «El instalador corre y no cambia nada» | el `git pull` no llegó. **Comprueba el hash antes de instalar** |
| «La regla no dispara» tras instalar | `wazuh-logtest` habla con el `analysisd` en marcha: recarga primero |
| «El recolector escribe y no llega nada» | falta el `<localfile>` en el `agent.conf` del grupo, o el agente está parado |
| «Una evidencia sale en gris tras el despliegue» | `augenrules --load` sin ejecutar |
| «Rellené el parámetro y no cambia nada» | ese parámetro lo lee el agente desde su `.env`, no el motor. Ver el `CUMPLIMIENTO.md` del control |
| «La lista no casa con nada» | la escribiste con `\|` y el motor parte por líneas y comas. Un valor por línea |
| «Permission denied» al clonar | la clave no está en la cuenta `@devqs`, o falta `IdentitiesOnly` |
| El panel no coincide con el fichero | el panel lee **OpenSearch**, no el fichero. Borrar el ndjson no limpia el panel |

---

## Enlaces

| | |
|---|---|
| Qué configurar, control a control | [`CUMPLIMIENTO_TOTAL.md`](CUMPLIMIENTO_TOTAL.md) |
| Si cada evidencia funciona, y cómo comprobarlo | [`COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md`](COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md) |
| Desplegar el plugin | [`DESPLEGAR_EL_PLUGIN.md`](DESPLEGAR_EL_PLUGIN.md) |
| Cómo juzga el motor | [`PRIMITIVAS_DE_JUICIO.md`](PRIMITIVAS_DE_JUICIO.md) |
| Lo propio de cada control | el `CUMPLIMIENTO.md` de su runbook |
