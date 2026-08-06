# Cómo llegar al 100 % de cumplimiento en ENSFácil

Guía paso a paso para dejar una máquina en cumplimiento total —el máximo
medible— en los tres controles implementados: `mp.info.6` (copias de
seguridad), `op.acc.1` (identificación) y `op.acc.2` (requisitos de acceso).

Está escrita para alguien que sabe administrar Linux y **no conoce este
producto**. Todos los comandos, rutas y nombres de parámetro salen del código
o de los `.env.example` reales de cada runbook; donde algo no se ha podido
verificar, se dice.

---

## 0. Lee esto antes que nada

**Esta NO es una guía para que el panel se ponga verde. Es una guía para que la
máquina cumpla de verdad y para que todo lo que exige el control se pueda
medir.**

La diferencia es el producto entero. ENSFácil existe para que un auditor pueda
recorrer la cadena `CUMPLE → evidencia → rule ID → evento crudo` hasta el
final, y su principio rector es que **sin datos se dice `NO_EVALUABLE`, nunca
un `CUMPLE` falso ni un `NO_CUMPLE` falso**. Una guía que dijera «pon este
parámetro a tal valor y sale verde» convertiría el producto en un adorno y
dejaría al cliente indefenso ante una auditoría real: el auditor no mira el
semáforo, mira la evidencia que hay debajo.

### El 100 % se alcanza por dos vías, y hay que recorrer las dos

| | Vía | Ejemplo |
|---|---|---|
| **1** | **Que el sistema cumpla el requisito de verdad** | El `umask` de la máquina es al menos el que exige la política |
| **2** | **Que ENSFácil pueda medirlo** | La política declara qué `umask` se exige (`OPACC2_UMASK_MINIMO`) y el recolector puede leer la fuente (`/etc/login.defs`) |

Saltarse la vía 1 y quedarse con la 2 es hacer trampa, y además no funciona:
la mayoría de las evidencias miran la máquina, no el fichero de configuración.
Saltarse la vía 2 y quedarse con la 1 deja una máquina que cumple y un panel
en gris: correcto, pero inservible como prueba.

### Donde hay una decisión de política, se dice

Varios parámetros no son un valor técnico: son una **decisión del responsable**
que queda declarada y que un auditor puede cuestionar. Están marcados así a lo
largo de la guía:

> **DECISIÓN DE POLÍTICA.** Qué se está declarando y qué implica cada opción.

El apartado [§10](#10-las-decisiones-de-política-en-un-solo-sitio) las reúne
todas.

---

## 1. El vocabulario: cuatro estados, y solo uno es un hueco

Confundirlos es el error que más tiempo cuesta, porque dos de ellos se ven
igual de gris en el panel y significan cosas opuestas para el auditor.

| Estado | Qué significa | ¿Hay algo que hacer? |
|---|---|---|
| `CUMPLE` | Se ha medido y conforma | No |
| `NO_CUMPLE` | Se ha medido y **hay una no conformidad demostrada** | Sí: arreglar la máquina |
| `NO_EVALUABLE` | El requisito **rige** pero no se ha podido medir. Es un **hueco de cobertura** | Sí: es lo que esta guía cierra |
| `NO_APLICA` | El requisito **no rige** en este nivel o alcance. **No falta nada** | No |

`PARCIAL` existe solo para `control_state` y `score_snapshot`: una evidencia
individual nunca es parcial, o se puede afirmar o no.

**`NO_APLICA` no es un hueco.** Los refuerzos R1 y R2 solo rigen a partir de
cierto nivel; por debajo salen `NO_APLICA` y eso es correcto, no un fallo:

| Control | Refuerzo | Rige en |
|---|---|---|
| `mp.info.6` | R1 (`mp.info.6.r1.1`, EV-05) | MEDIO y ALTO |
| `mp.info.6` | R2 (`mp.info.6.r2.1`, EV-06) | **solo ALTO** |
| `op.acc.1` | R1 (`r1.1`, `r1.2`, `r1.3`; EV-07) | MEDIO y ALTO |
| `op.acc.2` | R1 (`r1.1`, `r1.2`; EV-05, EV-06) | **solo ALTO** |

Un `NO_APLICA` de EV-05 de op.acc.2 en nivel MEDIO **no es** un hueco que
cerrar: es que el requisito no rige. Sale del denominador del score y no
impide el 100 %.

---

## 2. Qué es exactamente «100 %»

El número no es «cuánto cumple la máquina», es **«de lo que se ha podido
medir, cuánto conforma»**. Lo calcula `score_de()` en el `score.py` de cada
control, y la regla es la misma en los tres:

1. Se parte de los requisitos **aplicables** al nivel (los `NO_APLICA` salen
   del denominador; en op.acc.1 salen también los **delegados**, ver §7).
2. Un requisito en `NO_EVALUABLE` o `PARCIAL` es un **hueco de medida** y sale
   del denominador: no se ha medido.
3. Si hay algún `NO_CUMPLE` demostrado → `score` sobre los requisitos
   **medidos**, y el nivel sale `NO_CUMPLE` o `PARCIAL`.
4. Si **no** hay ningún `NO_CUMPLE` pero queda algo sin medir → el nivel se
   publica **`NO_EVALUABLE` y SIN número**, con `requisitos_sin_medir`.
5. Solo cuando no hay incumplimientos **y** no queda ningún hueco, la fórmula
   da **100 exacto** y el nivel sale `CUMPLE`.

Consecuencias prácticas que conviene tener claras desde el principio:

- **Un nivel sin número no es un 0.** Ningún `score.py` publica `score: 0`
  junto a `NO_EVALUABLE`, a propósito: un 0 se leería como «0 % de
  cumplimiento» cuando lo que dice el estado es «no se ha medido».
- **Un hueco de medida nunca fabrica un incumplimiento**, y un incumplimiento
  demostrado siempre manda sobre un hueco.
- **El 100 % es todo o nada.** No hay redondeo que lo enmascare: una sola
  evidencia gris deja el nivel entero sin número.

Para ver el reparto exacto en una máquina, sin cruzar nada:

```bash
sudo jq -c 'select(.event=="score_snapshot")|{nivel,estado,score,requisitos_aplicables,requisitos_medidos,requisitos_sin_medir,motivo}' \
  /var/log/ensfacil/op_acc_2.json | tail -3
```

---

## 3. Orden de trabajo

De lo que más desbloquea con menos esfuerzo a lo que exige una decisión del
cliente. Si vas con prisa, los pasos 1-3 ya dan el nivel BAJO de `op.acc.2` y
`mp.info.6`, y llevan `op.acc.1` a su techo.

> **Sabe antes de empezar cuál es el máximo real**, o perderás la tarde buscando
> el 25 % que falta:
>
> | Control | BAJO | MEDIO | ALTO |
> |---|---|---|---|
> | `op.acc.1` | **80 %** · techo, §11.9 | **75 %** · techo, §11.9 | 75 % |
> | `op.acc.2` | 100 % | 100 % | 100 %, con los cuatro ficheros de política |
> | `mp.info.6` | 100 % | 100 % | **no alcanzable** · §11.1 |
>
> Los dos topes son reales y están explicados: `op.acc.1` tiene dos requisitos
> que **ninguna evidencia técnica** puede demostrar (atestación documental), y
> `mp.info.6` no recoge la copia externa. No son fallos del despliegue y no se
> arreglan en la máquina.

| # | Paso | Desbloquea | Coste |
|---|---|---|---|
| 1 | [Manager, agente y cron](#4-paso-0--lo-común-a-los-tres-controles) | **todo**: sin esto no hay ni un dato | 20 min, una vez por manager |
| 2 | [Arreglar el `umask` de la máquina](#61-ev-01--world-writable-y-umask) | op.acc.2 EV-01 | 5 min |
| 3 | [**P-03, P-04 y P-07 en la pantalla** de Configuración](#71-los-tres-parámetros-que-viven-en-la-pantalla-no-en-el-env) | op.acc.1 EV-03, EV-05 y EV-07 · **es lo que más desbloquea del control** | 15 min + decisión del responsable |
| 4 | [Promover la línea base de SUID](#66-ev-07--suidsgid-y-ficheros-sin-dueño) | op.acc.2 EV-07 | 30 min de **revisión humana** |
| 5 | [Escribir `opacc2-acl.tsv`](#64-ev-04--acls-frente-a-la-política-declarada) | op.acc.2 EV-04 → **BAJO y MEDIO al 100 %** | decisión del responsable |
| 6 | [`.env` de mp.info.6 + primera copia](#8-mpinfo6--copias-de-seguridad) | mp.info.6 BAJO | 30 min |
| 8 | [Prueba de restauración](#85-ev-05--prueba-de-restauración-r1) | mp.info.6 MEDIO | decisión operativa |
| 9 | [Cargar auditd + `privilegios.tsv` + `accesos.tsv`](#65-ev-05-y-ev-06--el-refuerzo-r1-solo-alto) | op.acc.2 **ALTO** | decisión del responsable |
| 10 | [Procedimiento de bajas](#74-ev-04--plazo-de-deshabilitación-tras-la-baja) | op.acc.1 EV-04 en régimen | decisión operativa |

---

## 4. Paso 0 · Lo común a los tres controles

Sin esto no hay ni un dato, y **todo sale `NO_EVALUABLE` con razón**.

### 4.1 En el manager (una vez por manager)

Cada runbook trae su instalador. Despliega las reglas y añade el `localfile`
al `agent.conf` del grupo `ens`.

```bash
cd mp.info.6-proxmox-backup-runbook   && sudo ./install-manager.sh
cd ../op.acc.1-control-access-1-runbook && sudo ./install-manager.sh
cd ../op.acc.2-requisitos-acceso-runbook && sudo ./install-manager.sh
```

**Comprobar que ha surtido efecto** — que una línea real decodifica y dispara
su regla:

```bash
echo '{"ensfacil":"op.acc.2","event":"world_writable","host":"H","estado":"NO_CUMPLE"}' \
  | sudo /var/ossec/bin/wazuh-logtest      # esperado: Phase 3, id 106902
```

> El campo `ensfacil` lleva **el id del control**, no `true`. Un evento de
> prueba con `ensfacil: true` decodifica bien y no dispara nada, y parece que
> las reglas no están cargadas cuando sí lo están.

### 4.2 En cada agente

```bash
cd mp.info.6-proxmox-backup-runbook   && sudo ./install-real.sh
cd ../op.acc.1-control-access-1-runbook && sudo ./install-real.sh
cd ../op.acc.2-requisitos-acceso-runbook && sudo ./install-real.sh
```

Los tres corren con `set -e`: si algo falla, abortan y **no** imprimen
`instalación completada`. Si no ves esa línea, la máquina **no** está
desplegada por muchos ficheros sueltos que haya. Es deliberado: una máquina que
no emite es un `NO_EVALUABLE` honesto; una que emite a medias, no.

Ninguno pisa nunca el `.env` ni los ficheros de política si ya existían.

**Comprobar:**

```bash
ls -l /etc/cron.d/ensfacil-mpinfo6 /etc/cron.d/ensfacil-opacc1 /etc/cron.d/ensfacil-opacc2
sudo /usr/local/bin/ens_opacc1_collect.sh && echo "rc=$?"
sudo /usr/local/bin/ens_opacc2_collect.sh && echo "rc=$?"
sudo tail -1 /var/log/ensfacil/op_acc_1.json | jq .
```

La última línea de cada pasada tiene que ser el latido `collector_run`.

### 4.3 Sembrar el bloque de configuración de cada control

La tarjeta de Configuración de un control **no aparece** hasta sembrar su
bloque en el índice `wazuh-ens-configuration` (el guardado desde la UI rechaza
un control que no esté ya en el índice). Sin esto, P-04 de op.acc.1 no se puede
rellenar y EV-03 se queda gris para siempre.

```bash
cd Wazuh-ENS
python3 config/inject-control.py op.acc.1            # sin --apply solo muestra el plan
python3 config/inject-control.py op.acc.1 --apply
python3 config/inject-control.py op.acc.2 --apply
python3 config/inject-control.py mp.info.6 --apply
```

> **Nunca uses `--sustituir` sobre un control ya configurado.** Es el flag
> destructivo: descarta los valores ya configurados en vez de conservarlos. Una
> segunda siembra con él borró la configuración de op.acc.2 el 30/07 y el
> control cayó del 83 % al 17 %. Sin el flag, `inject-control.py` **fusiona**.

### 4.4 El latido, y por qué decide más de lo que parece

Cada recolector cierra su pasada con un evento `collector_run` que lleva tres
campos, y no son intercambiables:

| Campo | Qué dice | Quién lo consume |
|---|---|---|
| `resultado` | `completada`, o `sin_evidencias` si ni una función llegó al final | El motor del plugin: con cualquier valor distinto de `completada`, **ninguna** evidencia puede convertir su silencio en `CUMPLE` |
| `evidencias_ok` | qué funciones llegaron al final, **incluidas las que degradaron** | `score.py`, para distinguir «degradó y dijo por qué» de «se rompió a mitad» |
| `evidencias_cubiertas` | qué evidencias además **pudieron mirar** su fuente | El motor: es la lista blanca con la que «cero hechos» puede significar `CUMPLE` |

Varias evidencias **cumplen justamente cuando no producen hechos** (EV-02,
EV-03, EV-06 y EV-07 de op.acc.2, por ejemplo). Sin el latido, «el recolector
corrió y no encontró nada» (`CUMPLE`) sería indistinguible de «el recolector no
corrió» (`NO_EVALUABLE`). Por eso una evidencia que degrada sale en
`evidencias_ok` y **no** en `evidencias_cubiertas`: meterla ahí convertiría su
propio `NO_EVALUABLE` en cumplimiento.

**Comprobar:**

```bash
sudo jq -c 'select(.event=="collector_run")|{resultado,evidencias_ok,evidencias_cubiertas}' \
  /var/log/ensfacil/op_acc_2.json | tail -1
```

---

## 5. Cómo se lee el resultado mientras trabajas

Los dos comandos que vas a repetir después de cada cambio. El primero dice
**qué falta**; el segundo, **si algún parámetro está mal escrito**.

```bash
# Qué evidencias siguen sin poder medirse, y por qué
sudo jq -c 'select(.event=="evidence_state" and .estado=="NO_EVALUABLE")|{evidence_id,motivo}' \
  /var/log/ensfacil/op_acc_2.json | tail -10

# Parámetros corruptos o filas de política inservibles (el valor por defecto está en uso)
sudo jq -c 'select(.event=="collector_warning")|{parametro,motivo}' \
  /var/log/ensfacil/op_acc_2.json | tail -10
```

Cada `NO_EVALUABLE` lleva su campo `motivo` diciendo qué falta. **Esa frase es
la instrucción**: la guía que sigue no es más que el catálogo de esos motivos
con lo que hay que hacer en cada caso.

Ciclo de trabajo, después de tocar cualquier `.env` o fichero de política:

```bash
sudo /usr/local/bin/ens_opacc2_collect.sh     # recoger con la configuración nueva
sudo bash -c 'set -a; . /etc/ensfacil/opacc2.env; exec /usr/local/bin/ens_opacc2_score.py'
```

> **Si lanzas varias pasadas seguidas a mano, deja pasar un segundo entre
> ellas.** El campo `ts` tiene resolución de segundo y `score.py` solo deja que
> unos hechos nuevos pisen una declaración anterior si son **estrictamente**
> posteriores: dos pasadas dentro del mismo segundo pueden dejar en pie el
> `NO_EVALUABLE` de la primera. Con la cadencia horaria del cron nunca ocurre.

Los dos scripts de Python **no** sourcean el `.env` por su cuenta: el cron lo
carga con `set -a` antes de invocarlos. Al lanzarlos a mano hay que hacer lo
mismo, o leerán las rutas y ventanas de fábrica.

---

## 6. op.acc.2 · Requisitos de acceso

Se empieza por aquí porque es el que más trabajo manual exige y el que más
sorprende en la primera pasada.

**Requisitos y niveles:** `op.acc.2.1`, `op.acc.2.2` y `op.acc.2.3` rigen en
BAJO, MEDIO y ALTO. `op.acc.2.r1.1` y `op.acc.2.r1.2` (el refuerzo R1) rigen
**solo en ALTO**. En BAJO y MEDIO el denominador son 3 requisitos; en ALTO, 5.

### Tabla resumen

| Ev | Qué tiene que ser cierto en la máquina | Qué configurar para poder medirlo | Si falta | Decisión de política |
|---|---|---|---|---|
| **EV-01** | Ningún fichero *world-writable* no autorizado bajo las rutas de P-02, y el `umask` efectivo al menos tan restrictivo como P-07 | `OPACC2_RUTAS_CRITICAS` (P-02), `OPACC2_UMASK_MINIMO` (P-07), `OPACC2_WORLD_WRITABLE_PERMITIDOS`/`_EXCEPCIONES` (P-03) | `NO_EVALUABLE` sin P-02 o con P-07 no octal. **`NO_CUMPLE`** si el `umask` real no alcanza | **Sí**: el `umask` mínimo exigible y qué *world-writable* son legítimos |
| **EV-02** | Los ficheros de P-02 no cambian sin control | `OPACC2_RUTAS_CRITICAS` (P-02). La línea base se fija sola en la 1.ª pasada | `NO_EVALUABLE` sin P-02 | No |
| **EV-03** | Sin escaladas de privilegio no autorizadas en el log de autenticación | Nada: el log de autenticación (`/var/log/auth.log` o journald) y `/etc/group` + `/etc/passwd` legibles | `NO_EVALUABLE` si no hay fuente de autenticación | No |
| **EV-04** | Las ACLs reales coinciden con la política declarada | **`/etc/ensfacil/opacc2-acl.tsv`** escrito a mano (TAB). `OPACC2_POLITICA_REF` (P-04) es opcional | `NO_EVALUABLE` sin fichero o sin ninguna fila utilizable | **Sí**: qué permisos debe tener cada recurso |
| **EV-05** | Cada usuario privilegiado está declarado en el modelo | `OPACC2_MODELO_PRIVILEGIOS` (P-05, etiqueta) **y** `/etc/ensfacil/opacc2-privilegios.tsv` | `NO_EVALUABLE`. `NO_APLICA` en BAJO/MEDIO | **Sí**: el modelo de privilegios y quién está autorizado |
| **EV-06** | Ningún acceso supera el tipo autorizado para su perfil | `/etc/ensfacil/opacc2-accesos.tsv` + `opacc2-privilegios.tsv` + **reglas de auditd cargadas** | `NO_EVALUABLE`. `NO_APLICA` en BAJO/MEDIO | **Sí**: qué tipo de acceso corresponde a cada perfil |
| **EV-07** | Ningún binario SUID/SGID fuera de la línea base, ningún fichero sin dueño | **`/etc/ensfacil/opacc2-suid.allow`**, promovido tras revisión humana | `NO_EVALUABLE` para el eje SUID. **`NO_CUMPLE`** si hay ficheros sin dueño, aunque falte la línea base | **Sí**: qué binarios SUID están autorizados |

### 6.1 EV-01 · World-writable y umask

**Lo que sorprende en la primera pasada:** un Ubuntu de fábrica trae
`UMASK 022` en `/etc/login.defs`, y el defecto de ENSFácil es `027`. **EV-01
sale `NO_CUMPLE`, no gris.** Eso es la vía 1 hablando: la máquina no cumple.

La comparación es **bit a bit**, no numérica. El código es
`[ $(( 8#$real & 8#$minimo )) -eq $(( 8#$minimo )) ]`: el `umask` real tiene
que llevar **todos** los bits del mínimo. Por eso `032` tampoco cumple contra
`027` aunque sea numéricamente mayor: no bloquea la lectura ajena.

De dónde sale el `umask` que se compara: se leen `/etc/login.defs`,
`/etc/profile`, `/etc/bash.bashrc` y `/etc/profile.d/*.sh`, y se toma **el
valor menos restrictivo de todos** —el que de verdad crea ficheros abiertos—.
El evento `umask_check` dice de qué fichero salió, en su campo `fuente`.

**Arreglar la máquina (vía 1):**

```bash
sudo sed -i 's/^UMASK.*/UMASK\t\t027/' /etc/login.defs
grep -riE '^\s*umask' /etc/login.defs /etc/profile /etc/bash.bashrc /etc/profile.d/*.sh
```

El `grep` es el paso de comprobación y es el que de verdad importa: si
cualquiera de esos ficheros deja un `umask 022`, ese es el que se compara.

**Declarar la política (vía 2)** — en `/etc/ensfacil/opacc2.env`:

```bash
OPACC2_UMASK_MINIMO="027"
```

> **DECISIÓN DE POLÍTICA (P-07).** El responsable declara qué `umask` mínimo
> exige. `027` da permisos 750/640 y es el que el propio Excel del auditor pone
> como ejemplo restrictivo. `022` deja lectura para todo el mundo, y en un
> sistema con obligación ENS no es un defecto defendible: se puede bajar, pero
> **queda declarado en el `.env`** y el auditor lo verá. Bajar P-07 para que
> salga verde es exactamente lo que esta guía no hace.

**Los world-writable:**

```bash
# Ver qué va a encontrar el recolector, antes de que lo encuentre
grep '^OPACC2_RUTAS_CRITICAS=' /etc/ensfacil/opacc2.env | cut -d'"' -f2 | tr ',' '\n' \
  | while read -r r; do
      [ -n "$r" ] && [ -e "$r" ] && sudo find "$r" -xdev -perm -0002 2>/dev/null
    done
```

> **DECISIÓN DE POLÍTICA (P-03).** `OPACC2_WORLD_WRITABLE_PERMITIDOS="no"`
> (defecto) significa que ningún *world-writable* es legítimo salvo los
> declarados en `OPACC2_WORLD_WRITABLE_EXCEPCIONES`. Con `"si"` se toleran
> además los directorios con *sticky bit* (la semántica de `/tmp`). Las
> excepciones son **dato**, no código: el auditor las lee en el `.env`, no
> escondidas en el recolector.

**Comprobar:**

```bash
sudo /usr/local/bin/ens_opacc2_collect.sh
sudo jq -c 'select(.event=="umask_check")|{estado,umask_real,umask_min,fuente}' \
  /var/log/ensfacil/op_acc_2.json | tail -1
```

Esperado: `{"estado":"CUMPLE","umask_real":"027","umask_min":"027","fuente":"/etc/login.defs"}`.

### 6.2 EV-02 · Integridad de los ficheros del SO

No hay nada que configurar más allá de P-02. **Pero la primera pasada no
compara nada**: solo fija la línea base en
`/var/lib/ensfacil/opacc2/fim.tsv`. Emitir un alta por cada fichero
presentaría el censo de hoy como si fueran altas de hoy.

**La segunda pasada ya compara.** No es un fallo, es lo correcto.

```bash
sudo /usr/local/bin/ens_opacc2_collect.sh   # fija la línea base
sleep 2
sudo /usr/local/bin/ens_opacc2_collect.sh   # ya compara
sudo test -s /var/lib/ensfacil/opacc2/fim.tsv && echo "línea base fijada"
```

### 6.3 EV-03 · Accesos denegados y escaladas de privilegio

Tampoco hay nada que configurar. Lo único que necesita es una **fuente de log
de autenticación** legible (`/var/log/auth.log`, o journald en Ubuntu 24.04+,
que ya no trae rsyslog por defecto) y `/etc/group` y `/etc/passwd` plausibles.

> **Precisión que corrige una creencia extendida en el equipo: EV-03 NO
> depende de auditd.** Su `NO_CUMPLE` sale del log de autenticación, que es
> obligatorio. La mitad de auditd solo aporta `access_denied`, que es `CUMPLE`:
> perderla reduce el volumen de evidencia, **no fabrica cumplimiento**, así que
> no degrada — deja un `collector_warning` («auditd sin las reglas
> `ensfacil_opacc2` cargadas: EV-03 solo cubre el log de autenticacion»). La que
> **sí** degrada sin auditd es **EV-06**, porque su `NO_CUMPLE` sale solo de
> ahí. Está escrito en `lib/opacc2-lib.sh`, sobre la llamada a
> `auditd_disponible` de `ev03_accesos` («PUNTO CIEGO QUE NO DEGRADA»).
>
> Si EV-03 está gris, **no mires auditd**: mira el `motivo` del
> `evidence_state`, que apuntará a la fuente de autenticación.

En la primera pasada EV-03 puede salir sin hechos: el log se lee desde el final
(o desde la última hora en journald) para no volcar semanas de logins
históricos como si fueran de ahora.

### 6.4 EV-04 · ACLs frente a la política declarada

**Aquí está la trampa que más tiempo cuesta.** Las plantillas se instalan con
extensión `.example` y **no se activan solas**. Y lo importante:

> **Las plantillas `.example` de op.acc.2 solo llevan comentarios.** Todas sus
> filas de ejemplo están comentadas con `#`. **Copiarlas no configura nada**:
> deja el fichero puesto en su ruta final y la evidencia exactamente igual de
> gris, porque no hay ni una fila utilizable. Hay que **escribir la política de
> verdad**.

El motivo que verás si solo copias la plantilla es
`politica de acceso declarada (opacc2-acl.tsv) sin ninguna fila utilizable`,
que es distinto del de «no existe» a propósito: llevan a sitios distintos.

```bash
sudo cp /etc/ensfacil/opacc2-acl.tsv.example /etc/ensfacil/opacc2-acl.tsv
sudo -e /etc/ensfacil/opacc2-acl.tsv
sudo chmod 640 /etc/ensfacil/opacc2-acl.tsv
```

Formato — **columnas separadas por TABULADOR, no por espacios**:

```
ruta	modo	propietario:grupo	acl_esperada
/srv/datos	750	root:ops	-
/srv/datos/publico	750	root:ops	u:auditor:r-x
/srv/informes	2770	-	-
```

- Las columnas 3 y 4 admiten `-` para «este eje no se declara». **Un `-` en la
  columna 4 no significa «aquí no se mira»**: significa «no se ha decidido
  conceder ninguna ACL extendida», así que una entrada nominativa aplicada
  sobre ese recurso sale como `acl_deviation`.
- El modo se compara como número octal: `750` y `0750` son el mismo.
- Si alguna fila declara ACL extendida hace falta el paquete `acl` (`getfacl`);
  si no está, EV-04 degrada con `falta el paquete acl (getfacl) y N fila(s)
  declaran ACL extendida`.

Una fila escrita con espacios deja la fila entera en la primera columna. El
recolector lo detecta y degrada con el motivo `… ninguna trae ruta y modo
separados por tabulador`, en vez de comparar contra basura —que produciría un
`NO_CUMPLE` falso por cada recurso—.

> **DECISIÓN DE POLÍTICA (P-04).** Esta tabla **es** la decisión del
> responsable del recurso sobre qué permisos debe tener cada cosa.
> `op.acc.2.2` exige literalmente que los derechos de acceso respondan a una
> decisión del responsable: sin esa decisión escrita no hay contra qué comparar,
> y por eso el estado honesto es `NO_EVALUABLE` y no `CUMPLE`. Elegir qué
> recursos entran en la tabla también es una decisión: lo que no se declara, no
> se mide.
>
> `OPACC2_POLITICA_REF` es aparte: la **referencia documental** (la norma
> interna que respalda estas ACLs). Sin ella EV-04 **no degrada**, pero el
> `acl_check` sale sin el campo `politica` y el informe no puede citar la norma.

**Comprobar (TAB de verdad, y filas utilizables):**

```bash
grep -P '\t' /etc/ensfacil/opacc2-acl.tsv | grep -vc '^#'   # > 0
sudo /usr/local/bin/ens_opacc2_collect.sh
sudo jq -c 'select(.evidence_id=="EV-04")|{event,estado,motivo}' \
  /var/log/ensfacil/op_acc_2.json | tail -3
```

### 6.5 EV-05 y EV-06 · El refuerzo R1 (solo ALTO)

**En BAJO y MEDIO estas dos salen `NO_APLICA` y no hay nada que hacer.** Este
apartado solo aplica si el cliente está en nivel ALTO.

#### Los dos ficheros de política

```bash
sudo cp /etc/ensfacil/opacc2-privilegios.tsv.example /etc/ensfacil/opacc2-privilegios.tsv
sudo cp /etc/ensfacil/opacc2-accesos.tsv.example     /etc/ensfacil/opacc2-accesos.tsv
sudo -e /etc/ensfacil/opacc2-privilegios.tsv
sudo -e /etc/ensfacil/opacc2-accesos.tsv
sudo chmod 640 /etc/ensfacil/opacc2-*.tsv
```

Otra vez: **copiar la plantilla no configura nada**, solo trae comentarios.

`opacc2-privilegios.tsv` — `usuario<TAB>perfil<TAB>privilegios`:

```
root	admin	sudo:total
jgomez	admin	sudo:total
ops1	ops	sudo:restringido
dev2	dev	-
```

> **Hay que declarar a TODAS las cuentas privilegiadas, `root` incluido.**
> EV-05 contrasta contra este fichero a los miembros de los grupos de
> `OPACC2_GRUPOS_PRIVILEGIADOS` (`sudo,wheel,admin,adm,root` por defecto), a
> quienes tienen uno de esos grupos como primario, a **todo UID 0** y a quien
> reciba una concesión en `sudoers`. Una cuenta privilegiada no declarada sale
> como `excessive_privilege` `NO_CUMPLE` con el motivo «pertenencia al grupo
> privilegiado X no justificada por el modelo de privilegios de P-05». Es el
> resultado **correcto** —un privilegio sin decisión detrás es justo lo que
> `r1.1` persigue— pero es el que más sorprende: en un Ubuntu recién instalado
> saltan `root` y la cuenta de administración de la imagen.

Para saber quién va a salir, **antes** de escribir el fichero:

```bash
for g in sudo wheel admin adm root; do getent group "$g"; done
awk -F: '$3 == 0 {print $1}' /etc/passwd
```

Y la etiqueta del modelo, en el `.env`:

```bash
OPACC2_MODELO_PRIVILEGIOS="Minimo privilegio + sudo"
```

> **DECISIÓN DE POLÍTICA (P-05).** Dos cosas: la **etiqueta del modelo**
> (`RBAC`, `ABAC`, `ACL granular`, `Minimo privilegio + sudo`…), que es lo que
> el responsable declara que aplica; y **quién está autorizado a qué**, que es
> el TSV. Sin la etiqueta, EV-05 sale `NO_EVALUABLE` con el motivo `P-05
> modelo_privilegios no configurado` aunque el TSV esté perfecto.

`opacc2-accesos.tsv` — `perfil<TAB>ruta<TAB>tipos_permitidos`:

```
ops	/srv/datos	lectura,escritura,ejecucion
dev	/srv/datos	lectura
admin	/srv/informes	lectura
```

- `perfil` enlaza con la columna 2 de `opacc2-privilegios.tsv`.
- `ruta` tiene que ser **absoluta**, y es además la ruta que se vigila con
  auditd.
- `tipos_permitidos` usa un vocabulario **cerrado**: `lectura`, `escritura`,
  `ejecucion`, `modificacion`. Un `rw` o un `read` convertiría todos los accesos
  de ese perfil en violaciones; una fila con un tipo desconocido se rechaza
  entera con un `collector_warning` y las demás se cargan.
- **Rutas prohibidas**: `/`, `/etc`, `/usr`, `/var`, `/var/log`, `/proc`,
  `/sys`, `/dev`, `/bin`, `/sbin`, `/lib` y `/boot`. Una vigilancia `-p rwxa`
  sobre cualquiera de ellas inunda el log de auditoría y tumba el servidor. La
  fila se rechaza con un `collector_warning` y las demás se cargan igual.

> **La dependencia cruzada que más despista:** EV-06 compara contra
> `opacc2-accesos.tsv`, pero **necesita `opacc2-privilegios.tsv`** para saber de
> qué perfil es cada usuario. Sin él, EV-06 sale `NO_EVALUABLE` aunque
> `accesos.tsv` esté impecable.

> **DECISIÓN DE POLÍTICA (P-06).** Qué tipo de acceso corresponde a cada perfil
> sobre cada recurso. Y también, implícitamente, **qué recursos se vigilan**: lo
> que no esté en esta tabla no genera regla de auditd y no se mide.

#### Cargar las reglas de auditd

**Este es el paso que se olvida.** `install-real.sh` **escribe**
`/etc/audit/rules.d/ensfacil-opacc2.rules` pero **no lo carga en el kernel**, a
propósito: recargar aplicaría de paso cualquier otro cambio que el operador
tuviera preparado en `rules.d` y todavía no hubiera querido activar.

**Mientras las reglas no estén cargadas, EV-06 sale `NO_EVALUABLE`.**

El fichero se **genera** a partir de P-02 y de `opacc2-accesos.tsv`, con la
misma función que usa el recolector, así que solo se generan reglas para las
rutas que **existen de verdad** en la máquina. Consecuencia práctica: escribe
primero `opacc2-accesos.tsv`, y **después** vuelve a lanzar el recolector (que
regenera el fichero de reglas) y **luego** carga.

```bash
sudo /usr/local/bin/ens_opacc2_collect.sh     # regenera el fichero de reglas
sudo augenrules --load
sudo auditctl -l | grep ensfacil_opacc2
sudo auditctl -s | head -3                    # pid distinto de 0 = el demonio corre
```

Esperado en el `grep`: al menos una línea por cada ruta de P-02 (cuatro por
ruta: dos arquitecturas × dos códigos de error) y una `-w … -p rwxa -k
ensfacil_opacc2_obj` por cada recurso de P-06.

> **`auditctl -D` NUNCA.** Ni al instalar ni al desinstalar ni «para probar».
> Descargaría **todas** las reglas del kernel, incluidas las del hardening del
> cliente o de su CIS benchmark. Es el mismo error de categoría que un `rm -rf`
> sobre un directorio compartido, pero sobre el kernel y sin dejar rastro en
> disco. Ni `install-real.sh` ni `uninstall.sh` lo ejecutan.
>
> Las reglas viven en el kernel, así que `auditctl -l` **las sigue listando con
> el demonio parado**: por eso hay que mirar también `auditctl -s`.

**Justo después de cargar verás esto, y es normal:**

```
collector_warning · parametro=auditd
"40 registro(s) de la clave ensfacil_opacc2 son cambios de la configuracion de
 auditoria de la maquina (type=CONFIG_CHANGE, p.ej. op=add_rule), no accesos..."
```

auditd registra un `CONFIG_CHANGE op=add_rule` por **cada** regla que se carga.
La cuenta cuadra: tantos registros como reglas lista `auditctl -l`. No son
accesos y no hay nada que revisar. Solo preocupa si el aviso sale en **todas**
las pasadas y no solo tras instalar: entonces sí hay algo recargando en bucle.

### 6.6 EV-07 · SUID/SGID y ficheros sin dueño

> **La línea base no se siembra sola, y no debe.** Sembrarla con lo que hay en
> la máquina declararía autorizada **la puerta trasera de un sistema ya
> comprometido**. Y lo contrario —no tener línea base y acusar a los ~25 SUID
> legítimos de un Ubuntu limpio— produce un `NO_CUMPLE` masivo que el cliente
> aprende a ignorar. La salida honesta mientras tanto es `NO_EVALUABLE`, con el
> candidato preparado. **La revisión es el control; copiar el candidato sin
> mirarlo lo anula.**

El recolector deja en `/var/lib/ensfacil/opacc2/suid.candidato` la lista de lo
que hay ahora mismo:

```bash
sudo /usr/local/bin/ens_opacc2_collect.sh
sudo cat /var/lib/ensfacil/opacc2/suid.candidato
```

**Cómo revisarlo de verdad** — no es leerlo por encima. Para cada ruta:

```bash
# ¿Pertenece a un paquete del sistema, o apareció de la nada?
while read -r f; do
  [ -n "$f" ] || continue
  if paquete="$(dpkg -S "$f" 2>/dev/null | cut -d: -f1)"; then
    printf '%s\t%s\n' "$f" "$paquete"
  else
    printf '%s\tSIN PAQUETE  <-- REVISAR\n' "$f"
  fi
done < /var/lib/ensfacil/opacc2/suid.candidato
```

Si el cliente tiene `debsums` instalado (no viene de serie en Ubuntu), esto
añade una segunda pasada: comprueba que el binario coincide con lo que el
paquete instaló. Los que fallen, uno a uno.

```bash
command -v debsums >/dev/null && sudo debsums -c 2>/dev/null | head
```

Una ruta **sin paquete** es la que hay que justificar o quitar. Los SUID
típicos de un Ubuntu limpio (`/usr/bin/sudo`, `/usr/bin/su`, `/usr/bin/passwd`,
`/usr/bin/chsh`, `/usr/bin/chfn`, `/usr/bin/gpasswd`, `/usr/bin/newgrp`,
`/usr/bin/mount`, `/usr/bin/umount`) vienen de paquetes.

Cuando la lista esté revisada:

```bash
sudo cp /var/lib/ensfacil/opacc2/suid.candidato /etc/ensfacil/opacc2-suid.allow
sudo -e /etc/ensfacil/opacc2-suid.allow          # quitar lo que no deba estar
sudo chmod 640 /etc/ensfacil/opacc2-suid.allow
```

Formato: **una ruta absoluta por línea**. Nombres de binario sin ruta (`sudo`,
`passwd`) **no casan con nada**, y entonces los ~25 SUID legítimos saldrían
como no autorizados: un `NO_CUMPLE` falso masivo. Si el fichero existe pero no
tiene ninguna ruta absoluta, el motivo es `linea base SUID declarada sin
ninguna ruta absoluta utilizable`.

> **DECISIÓN DE POLÍTICA.** Cada línea de este fichero es el responsable
> declarando «este binario con privilegios elevados está autorizado en esta
> máquina». Un auditor puede preguntar por cualquiera de ellas.

**No hace falta borrar `barrido.marca`.** El barrido tiene cadencia
(`OPACC2_BARRIDO_HORAS`, 24 h por defecto) porque un `find /` en cada pasada
horaria no es aceptable, pero **un cambio del contenido útil de la línea base
adelanta el barrido una vez**: la pasada siguiente vuelve a medir y EV-07 pasa
a `CUMPLE` sin esperar 24 horas. Lo mismo si alguien la retira: la evidencia
vuelve a degradar en la pasada siguiente. Reordenar el fichero o comentarlo no
dispara nada, así que un gestor de configuración que lo regenere cada hora no
convierte esto en un `find /` horario.

Si te toca una pasada fuera de cadencia, el motivo lo dice **y lo fecha**:

```
"sin linea base de binarios SUID/SGID autorizados (21 encontrados); revisa ...
 [dato del barrido de 2026-07-31T09:00:00Z, no de esta pasada: el barrido tiene
 cadencia de 24h y no se relanza hasta 2026-08-01T09:00:00Z (o antes, si cambia
 /etc/ensfacil/opacc2-suid.allow)]"
```

> **Los ficheros sin dueño se juzgan aunque falte la línea base.** Si el
> barrido encuentra alguno, EV-07 sale `NO_CUMPLE` por ellos y el eje de SUID se
> queda sin juzgar con un aviso: `NO_CUMPLE` manda sobre `NO_EVALUABLE`. Para
> eso hay que arreglar la máquina (vía 1), no la configuración:
>
> ```bash
> sudo find / -xdev \( -nouser -o -nogroup \) -type f 2>/dev/null | head
> ```

**Comprobar:**

```bash
sudo /usr/local/bin/ens_opacc2_collect.sh
sudo jq -c 'select(.evidence_id=="EV-07")|{event,estado,motivo}' \
  /var/log/ensfacil/op_acc_2.json | tail -3
```

---

## 7. op.acc.1 · Identificación

**Requisitos y niveles:** `op.acc.1.1` … `op.acc.1.5` rigen en BAJO, MEDIO y
ALTO. `op.acc.1.r1.1`, `r1.2` y `r1.3` (refuerzo R1) rigen en **MEDIO y ALTO**
—no solo en ALTO, al contrario que op.acc.2—.

> **ESTE CONTROL NO LLEGA AL 100 % HOY, y no es un fallo del despliegue.**
> `op.acc.1.5` (identificación conforme a eIDAS) y `op.acc.1.r1.1`
> (singularizar a la persona) **no tienen ninguna evidencia técnica** que los
> demuestre: la policy del plugin los declara con `evidenceIds: []`. Son
> atestación documental, y desde el criterio del 04/08 lo no demostrado cuenta
> en contra. **Techo real: 80 % en BAJO (4 de 5) y 75 % en MEDIO/ALTO (6 de
> 8).** Ver §11.9.
>
> **Y el `score_snapshot` del agente no es el score del control.** El agente
> solo puntúa lo que juzga él, y deja fuera dos familias que declara aparte:
>
> | | Requisitos | Por qué |
> |---|---|---|
> | `requisitos_delegados` | `op.acc.1.1`, `op.acc.1.r1.3` | los juzga el MOTOR sobre los hechos crudos de EV-03 y EV-07 |
> | `sin_evidencia` en su `control_state` | `op.acc.1.5`, `op.acc.1.r1.1` | no los juzga NADIE |
>
> Así que el agente puntúa sobre **3 requisitos en BAJO y 4 en MEDIO/ALTO**, y
> puede salir `CUMPLE` con el control al 75 %. El número que vale ante un
> auditor es el del plugin.
>
> **El gráfico de evolución dibujaba el número del agente** —promediando por
> semana sus `score_snapshot`— mientras el panel de arriba enseñaba el del
> motor, sin que nada avisara de que no eran lo mismo. Desde el 05/08 la serie
> la calcula el motor, un punto por día, y **el último punto es literalmente el
> número del panel**: si los dos discrepan, hay un defecto.

### Tabla resumen

| Ev | Qué tiene que ser cierto en la máquina | Qué configurar para poder medirlo | Si falta | Decisión de política |
|---|---|---|---|---|
| **EV-01** | Sin UIDs duplicados entre las cuentas de persona | Nada: `/etc/passwd` legible con entrada UID 0. `OPACC1_UID_MIN` acota qué es «persona» | `NO_EVALUABLE` si `passwd` no es legible o plausible. **`NO_CUMPLE`** si hay UIDs duplicados | No |
| **EV-02** | Los cambios de identidad quedan registrados | Nada. La 1.ª pasada fija el snapshot | `NO_EVALUABLE` sin `passwd`/`shadow` legibles | No |
| **EV-03** | Ninguna autenticación con cuenta genérica prohibida | **P-04 en la pantalla**, no en el `.env` (§7.1) | No acredita si P-04 está vacío → `op.acc.1.1` no cumple | **Sí**: qué cuentas se declaran genéricas prohibidas |
| **EV-04** | Las bajas se deshabilitan dentro del plazo | `OPACC1_PLAZO_DESHABILITAR_DIAS` (P-05) + una **fuente de fechas de baja**: `OPACC1_BAJAS` o el campo *expira* de `/etc/shadow` | `NO_EVALUABLE`: `sin fuente de fechas de baja: ni bajas.tsv (P-08) ni campo expira en shadow` | **Sí**: el plazo máximo y de dónde salen las bajas |
| **EV-05** | Ninguna cuenta de servicio inicia sesión interactiva | **P-03 en la pantalla**, no en el `.env` (§7.1) | No acredita si P-03 está vacío → `op.acc.1.2` no cumple | **Sí**: qué cuentas son de servicio |
| **EV-06** | Los privilegiados usan identificador administrativo diferenciado | `OPACC1_GRUPOS_PRIVILEGIADOS` y `OPACC1_SUFIJO_ADMIN` | `NO_EVALUABLE` si `/etc/group` no es legible | **Sí**: el sufijo y qué grupos son privilegiados |
| **EV-07** | Toda cuenta activa está en la lista de autorizados | **P-07 en la pantalla**: una TABLA, ya no un fichero de la máquina (§7.1) | No acredita si P-07 está vacío → `op.acc.1.r1.3` no cumple en MEDIO/ALTO | **Sí**: quién está autorizado |
| **EV-08** | Las cuentas se eliminan respetando la retención | `OPACC1_RETENCION_DIAS` (P-06) + el registro que mantiene EV-04 | `NO_EVALUABLE` por cuenta sin fecha de baja conocida | **Sí**: el periodo de retención |

### 7.1 Los tres parámetros que viven en la pantalla, no en el `.env`

**El `.env` de op.acc.1 ya no lleva política.** Solo ajustes de observación
—dónde mirar, qué UID es una persona— con valores que funcionan en cualquier
Linux. No hace falta abrirlo.

Las tres decisiones del control se declaran en **Configuración → op.acc.1** del
plugin, que es lo que mira el auditor, y **son las tres que desbloquean
cumplimiento**:

| Param | Qué declara | Evidencia | Si falta |
|---|---|---|---|
| **P-03** cuentas_servicio_definidas | qué cuentas técnicas **no deben** usarse para acceso interactivo | EV-05 | `op.acc.1.2` no cumple |
| **P-04** cuentas_genericas_prohibidas | qué nombres de cuenta rompen la unicidad del identificador | EV-03 | `op.acc.1.1` no cumple |
| **P-07** lista_usuarios_autorizados | **tabla** `usuario \| sistema \| rol`: quién está autorizado | EV-07 | `op.acc.1.r1.3` no cumple en MEDIO y ALTO |

#### Qué poner en cada uno

**P-04** — los nombres genéricos que no deben existir activos. Un punto de
partida razonable:

```
admin, administrador, guest, test, temp, usuario1
```

> **DECISIÓN DE POLÍTICA.** Una cuenta que se deja fuera puede autenticarse sin
> que nadie lo señale; una que se mete de más genera un `NO_CUMPLE` cada vez que
> alguien la use legítimamente.

**P-03** — las cuentas técnicas reales de la máquina. Para ver candidatas:

```bash
awk -F: '$3 >= 100 && $3 < 1000 {print $1}' /etc/passwd
```

> **DECISIÓN DE POLÍTICA.** El responsable declara qué cuentas son de proceso.
> Sin la lista no se puede distinguir una cuenta de servicio de una de persona,
> y afirmar que «ninguna hizo login interactivo» sería un cumplimiento
> fabricado.

**P-07** — una fila por persona. Las cuentas que hay que declarar son
**exactamente las que el agente está emitiendo**, no las que tú creas que hay:

```bash
jq -r 'select(.event=="account_active")|.usuario' \
  /var/log/ensfacil/op_acc_1.json | sort -u
```

Solo la columna *usuario* se contrasta; *sistema* y *rol* acompañan a la
decisión en el informe. La comparación es **literal y sensible a mayúsculas**:
`jgomez` no casa con `JGOMEZ` ni `ana.perez` con `ana-perez`. En `/etc/passwd`
el nombre de usuario *es* el identificador del sistema, así que normalizar
mayúsculas convertiría un error de tecleo en una autorización válida.

> **DECISIÓN DE POLÍTICA.** La tabla **es** la declaración de quién está
> autorizado a acceder al sistema. Mantenerla al día es un procedimiento, no un
> fichero: cada alta y cada baja se refleja aquí, y el auditor preguntará quién
> la mantiene y con qué periodicidad.

#### La prueba de que la migración funciona

Es la comprobación que más rápido te dice si todo el circuito está vivo:

```
P-04 sin la cuenta          →  EV-03 CUMPLE
se añade una cuenta que se autenticó, sin tocar el servidor
                            →  EV-03 NO_CUMPLE, y el motivo la NOMBRA
se quita                    →  vuelve a CUMPLE
```

Si el veredicto no se mueve, el plugin no está desplegado o el agente no está
emitiendo el hecho. Ver §7.5.


### 7.4 EV-04 · Plazo de deshabilitación tras la baja

> **Esta evidencia no puede cumplir en una máquina recién montada, y forzarla
> sería mentir.** EV-04 mide que las bajas se deshabilitan dentro del plazo. En
> una máquina sin ninguna baja no hay nada que medir **hasta que exista una
> fuente de fechas de baja**.

Lo que la desbloquea es una **decisión operativa**, no un parámetro: adoptar un
procedimiento por el que toda baja quede fechada. Hay dos vías, y basta una:

**Vía A — el campo *expira* de `/etc/shadow`** (el que fija `chage -E`).
Es la vía recomendada porque no exige mantener un fichero aparte: al dar de
baja a alguien, el procedimiento incluye

```bash
sudo chage -E "$(date -u +%F)" exempleado
sudo usermod -L exempleado
```

**Vía B — declarar las bajas a mano** en el TSV de `OPACC1_BAJAS`
(`/var/lib/ensfacil/opacc1/bajas.tsv` por defecto). El repo **no trae
plantilla**; separador **TABULADOR**, fecha `YYYY-MM-DD`:

```
exempleado	2026-03-14
otro.usuario	2026-05-02
```

El recolector busca primero en ese fichero y, si el usuario no aparece, cae al
campo *expira*. Si una cuenta deshabilitada no tiene fecha por ninguna de las
dos vías, se registra como fecha **desconocida** y EV-08 emite `NO_EVALUABLE`
para ella cuando desaparezca: sin fecha de baja real no se puede afirmar ni que
se respetó la retención ni que se violó.

> **Precisión sobre el código:** `OPACC1_INTEGRACION_RRHH` es **documental**,
> ningún script lo lee. Lo que decide el comportamiento es la existencia y el
> contenido de `OPACC1_BAJAS`. Poner `"si"` en P-08 **no** desactiva el TSV.

> **DECISIÓN DE POLÍTICA (P-05 y P-06).**
> `OPACC1_PLAZO_DESHABILITAR_DIAS` (defecto `1`) es el plazo máximo entre la
> baja y la deshabilitación efectiva: el responsable declara cuántos días tolera.
> `OPACC1_RETENCION_DIAS` (defecto `365`) es cuánto tiempo debe conservarse una
> cuenta deshabilitada antes de eliminarla. Los dos son compromisos que el
> auditor puede contrastar con la política interna del cliente.

### 7.5 Las tres evidencias que juzga el plugin, no el agente

EV-03, EV-05 y EV-07 están **migradas al modelo nuevo**: el agente emite el
hecho crudo —qué cuenta se autenticó, qué cuenta está activa— **sin `estado` ni
`nivel`**, y el veredicto lo pone el motor contrastándolo con el parámetro de la
pantalla.

Qué cambia en la práctica, y es el motivo de toda la migración:

- **Cambiar el parámetro cambia el veredicto sin tocar el agente**, y sin
  esperar a la siguiente pasada: se re-juzgan los hechos ya indexados.
- **Con el parámetro vacío, la evidencia no acredita.** No sale `CUMPLE` por
  silencio, que es lo que pasaba cuando el agente leía su propia copia.
- Si en una máquina actualizada siguen las líneas viejas en el `.env`, el
  recolector emite un `collector_warning` (regla 106830) en **cada** pasada.
  Borrarlas lo silencia.

```bash
sudo grep -nE 'OPACC1_(CUENTAS_GENERICAS|CUENTAS_SERVICIO|LISTA_AUTORIZADOS)' \
  /etc/ensfacil/opacc1.env      # no debe devolver ninguna ASIGNACIÓN
```

**Un mismo hecho sirve a dos evidencias.** No es un truco: un hecho crudo
describe una observación, no un veredicto, así que puede responder a dos
preguntas de auditoría distintas. El evento sale con las dos etiquetas y el
plugin lo reparte.

| Hecho | Regla | Evidencias | Se contrasta con |
|---|---|---|---|
| `account_authenticated` | 106873 | EV-03 y EV-05 | P-04 / P-03 |
| `account_active` | 106811 | EV-01 y EV-07 | — / columna *usuario* de P-07 |

Comprobar que el agente los emite bien:

```bash
jq -c 'select(.event=="account_active" or .event=="account_authenticated")
       |{event,evidence_id}' /var/log/ensfacil/op_acc_1.json | sort -u
```

Con un solo `evidence_id` por evento, el agente corre código anterior al 05/08.


### 7.6 EV-01, EV-02, EV-06 · Sin configuración

- **EV-01** necesita `/etc/passwd` legible con entrada UID 0. Sale `NO_CUMPLE`
  si hay **UIDs duplicados** entre cuentas de persona: eso rompe la unicidad que
  exige `op.acc.1.3` y hay que arreglarlo en la máquina.

  ```bash
  awk -F: -v m=1000 '$3>=m {print $3}' /etc/passwd | sort | uniq -d   # vacío = bien
  ```

  EV-01 tiene **recuento obligatorio**: si en la ventana no aparece ningún hecho
  `account_inventory`, sale `NO_EVALUABLE` («sin hecho recuento») aunque haya
  latido. Un latido sin recuento no es cumplimiento por silencio, es un
  recolector muerto a medias.

- **EV-02** fija su snapshot de identidad en la primera pasada y compara desde
  la segunda.

- **EV-06** contrasta a los miembros de `OPACC1_GRUPOS_PRIVILEGIADOS` contra el
  sufijo `OPACC1_SUFIJO_ADMIN`.

  > **DECISIÓN DE POLÍTICA.** `OPACC1_SUFIJO_ADMIN` (defecto `.adm`) es el
  > sufijo del identificador administrativo diferenciado: el responsable declara
  > que un administrador usa `jgomez` para trabajar y `jgomez.adm` para
  > administrar. **Dejarlo vacío no es «desactivarlo»**: significa que no se
  > excluye a nadie y **todos** los usuarios privilegiados pasan a ser candidatos
  > a multi-rol.

---

## 8. mp.info.6 · Copias de seguridad

**Requisitos y niveles:** `mp.info.6.1`, `.2.a`, `.2.b`, `.2.c` y `.2.d` rigen
en BAJO, MEDIO y ALTO (5 requisitos). `mp.info.6.r1.1` añade MEDIO (6).
`mp.info.6.r2.1` añade ALTO (7).

> **Lee el [§11](#11-qué-no-se-puede-llevar-al-100--hoy) antes de prometer un
> ALTO en este control.** Tiene un tope estructural.

### Tabla resumen

| Ev | Qué tiene que ser cierto en la máquina | Qué configurar para poder medirlo | Si falta | Decisión de política |
|---|---|---|---|---|
| **EV-01** | Hay una copia correcta dentro de la ventana | `PBS_HOST`, `PBS_REPO`, `PBS_PASSWORD`, `PBS_BACKUP_DIR`, `PBS_BACKUP_ID`, `MPINFO6_FRECUENCIA_HORAS`, `MPINFO6_TOLERANCIA_HORAS` | `NO_EVALUABLE` en rodaje; **`NO_CUMPLE`** en régimen sin copia | **Sí**: cada cuánto se copia y qué margen se tolera |
| **EV-02** | La copia está planificada | `MPINFO6_CRON_FICHERO` + `MPINFO6_CRON_PATRON` (el cron ya lo instala `install-real.sh`) | **`NO_CUMPLE`** si no encuentra el patrón | No |
| **EV-03** | Hay rutas locales de copia **con contenido** | `MPINFO6_RUTAS_BACKUP` | `NO_EVALUABLE` con motivo si está vacío | **Sí**: si hay copia local, y dónde |
| **EV-04** | El keyfile no da permisos a grupo ni a otros | **`PBS_KEYFILE`**, la misma que cifra (ver §8.2 si el `.env` trae `MPINFO6_KEYFILE`) | `NO_EVALUABLE` si no existe; **`NO_CUMPLE`** si los da | No |
| **EV-05** | Hay una restauración validada con md5 dentro del plazo | `ENS_RESTORE_ARCHIVE` + `ENS_RESTORE_CANARY` + `MPINFO6_RESTORE_MAX_DIAS` | `NO_EVALUABLE` (nunca `NO_CUMPLE`). `NO_APLICA` en BAJO | **Sí**: cada cuánto se prueba a restaurar, y sobre qué |
| **EV-06** | La copia se replica a ubicación alternativa | **nada que configurar: no se recoge** | `NO_APLICA` en BAJO/MEDIO, **`NO_EVALUABLE` en ALTO** | — (hueco estructural) |
| **EV-07** | Sin errores del agente de backup ni cambio de clave de cifrado | Nada | `NO_EVALUABLE` en rodaje; **`NO_CUMPLE`** con errores | No |

### 8.1 El `.env`

`/etc/ensfacil/mpinfo6.env`, permisos **640** y dueño root: lleva la credencial
del repositorio PBS.

```bash
sudo -e /etc/ensfacil/mpinfo6.env
sudo chmod 640 /etc/ensfacil/mpinfo6.env
```

Los que hay que rellenar sí o sí, o `pxbackup.sh` sale con 1 y lo dice por
stderr en vez de lanzar `proxmox-backup-client` con argumentos vacíos:

```bash
PBS_HOST="pbs.cliente.local"
PBS_REPO="usuario@pbs!token@pbs.cliente.local:datastore"
PBS_PASSWORD="<secreto del token>"
PBS_BACKUP_DIR="/srv"
PBS_BACKUP_ID="srv-app-01"
```

> **DECISIÓN DE POLÍTICA (P-01 y P-02).** `MPINFO6_FRECUENCIA_HORAS` (defecto
> `24`) es cada cuánto **se exige** una copia, y `MPINFO6_TOLERANCIA_HORAS`
> (defecto `2`) el margen antes de declarar el incumplimiento. La ventana de
> EV-01 es la suma. Subirlos hace el control más laxo y **queda declarado**.

### 8.2 EV-04 · El keyfile tiene UN solo nombre: `PBS_KEYFILE`

**Esta sección describía un falso verde real del producto. Ya está cerrado en el
código; se mantiene porque hay que saber migrar los `.env` que vienen de antes.**

`PBS_KEYFILE` es la variable que `pxbackup.sh`, `lib/pxbackup-lib.sh` y
`ens_mpinfo6_restore_test.sh` pasan a `proxmox-backup-client --keyfile` —el
fichero que **de verdad cifra** las copias— y es de la que
`scripts/ens_mpinfo6_score.py` resuelve el veredicto de EV-04. **Si mueves el
keyfile, cambias esa línea y ya está.**

```bash
PBS_KEYFILE="/ruta/nueva/proxmox-backup.key"
```

#### El fallo que había, y por qué importa

`score.py` leía **`MPINFO6_KEYFILE`**, un nombre que no usaba ningún otro script
y que ni el `.env.example` ni esta guía enseñaban a poner. Los dos valores de
fábrica son la misma ruta (`/var/lib/proxmox-backup/proxmox-backup.key`), así
que **una instalación estándar funcionaba por casualidad**. Al mover la clave:

1. El cliente cambiaba `PBS_KEYFILE` — lo único documentado.
2. La copia pasaba a cifrarse con la clave nueva.
3. EV-04 seguía midiendo los permisos de la **ruta de fábrica**.
4. Si allí quedaba el fichero antiguo con 600: **`CUMPLE` sobre una clave que ya
   no se usa.**

Cumplimiento afirmado sobre el artefacto equivocado, que es justo lo que el
principio rector de este producto prohíbe.

#### Qué hace hoy, caso por caso

`MPINFO6_KEYFILE` **se sigue aceptando** como alias obsoleto: borrarla habría
dejado sin configurar, en silencio, a toda máquina que ya la tuviera en su
`.env` — el mismo fallo por el otro lado.

| Qué hay en el `.env` | Qué mide EV-04 |
|---|---|
| solo `PBS_KEYFILE` | ese fichero. **Es lo correcto** |
| solo `MPINFO6_KEYFILE` | ese fichero, y deja un **`collector_warning` en cada pasada** pidiendo que la renombres |
| las dos, misma ruta | ese fichero, con el mismo aviso. Se comparan por `realpath` |
| las dos, **rutas distintas** | nada: **`NO_EVALUABLE`** con motivo, y EV-04 sale de `evidencias_cubiertas`. Esa máquina declara dos keyfiles; acreditar los permisos de uno afirmaría el control de acceso sobre el otro |
| ninguna, o vacías | el valor de fábrica. Una variable vacía cuenta como **no declarada** |

#### Migrar un `.env` antiguo

```bash
sudo sed -i 's/^MPINFO6_KEYFILE=/PBS_KEYFILE=/' /etc/ensfacil/mpinfo6.env
sudo grep -c '^PBS_KEYFILE=' /etc/ensfacil/mpinfo6.env   # esperado: 1, no 2
```

Si sale `2`, borra la línea duplicada dejando la que apunta a la clave en uso.
Comprobar que ya no queda aviso:

```bash
sudo jq -c 'select(.event=="collector_warning")|.detalle' \
  /var/log/ensfacil/mp_info_6.json | grep KEYFILE     # esperado: sin salida
```

**Arreglar los permisos de la máquina y comprobar:**

```bash
sudo chmod 600 /var/lib/proxmox-backup/proxmox-backup.key
sudo stat -c '%a %n' /var/lib/proxmox-backup/proxmox-backup.key    # esperado: 600
```

### 8.3 EV-03 · Rutas locales de copia

`MPINFO6_RUTAS_BACKUP` llega **vacío de fábrica, y a propósito**: con PBS las
copias viven en el repositorio **remoto** y puede que esta máquina no tenga
ninguna ruta local que mirar. En ese caso la respuesta honesta es
`NO_EVALUABLE` con motivo, no un `CUMPLE`.

```bash
MPINFO6_RUTAS_BACKUP="/srv/backups"
```

EV-03 solo sale `CUMPLE` si alguna ruta **existe y tiene contenido**: un
directorio de copias vacío no acredita nada.

> **NO pongas aquí `ENS_STATE_DIR`** (`/var/lib/pxbackup` por defecto). Ese es
> el directorio donde este agente escribe su marca de primera pasada, su cola y
> su caché: si copias y estado comparten directorio, «tiene contenido» se
> cumpliría solo con que el agente haya corrido una vez y **EV-03 saldría
> `CUMPLE` sin una sola copia**. Era el valor de fábrica y por eso ya no
> acredita: una ruta que resuelve al mismo directorio que `ENS_STATE_DIR` se
> publica `NO_EVALUABLE` diciendo por qué.

> **DECISIÓN DE POLÍTICA.** Declarar o no una ruta local es una decisión sobre
> el diseño de la copia. Dejarlo vacío es legítimo (todo va a PBS) pero deja
> `mp.info.6.2.b` sin uno de sus dos acreditantes.

### 8.4 EV-02 · Planificación, y el rodaje

El cron lo instala `install-real.sh` en `/etc/cron.d/ensfacil-mpinfo6`:

| Cuándo | Qué |
|---|---|
| `17 2 * * *` | `pxbackup.sh` — la copia, una vez al día |
| `23 * * * *` | `ens_mpinfo6_evidence.sh` — drenaje de la cola del camino degradado |
| `33 * * * *` | `ens_mpinfo6_score.py` — estados y score |
| `40 6 * * *` | `ens_mpinfo6_watchdog.py` — ausencia de copia y de restauración |

El patrón `pxbackup.sh` de la primera línea es **lo que busca EV-02**: si
cambias la ruta del script, cambia también `MPINFO6_CRON_PATRON` en el `.env`.

**El rodaje.** Durante la primera ventana tras instalar, EV-01, EV-03 y EV-07
publican `NO_EVALUABLE` con motivo en vez de acusar: en una instalación recién
hecha el despliegue **no** garantiza que, de haber ocurrido la copia, se habría
observado. Falta la medida, no la copia. El rodaje **no** tapa hechos: una copia
hecha el día de la instalación acredita EV-01 igual, y un error observado pone
EV-07 en `NO_CUMPLE` desde el primer minuto.

**Primera copia a mano, para no esperar al cron:**

```bash
sudo /usr/local/bin/pxbackup.sh; echo "rc=$?"
sudo jq -c 'select(.event=="backup_ok")|{job_id,status,start_time,end_time}' \
  /var/log/ensfacil/mp_info_6.json | tail -1
```

### 8.5 EV-05 · Prueba de restauración R1

> **La prueba está DORMIDA de fábrica, y forzar la evidencia sería mentir.**
> `ENS_RESTORE_ARCHIVE` y `ENS_RESTORE_CANARY` llegan vacíos porque **restaurar
> toca disco y hay que decidirlo**. Mientras lo estén, EV-05 se queda
> `NO_EVALUABLE` — nunca `NO_CUMPLE`: no haber probado a restaurar no demuestra
> que restaurar falle.

Lo que la desbloquea es una **decisión operativa**: autorizar que la máquina
restaure periódicamente un fichero testigo. Dos vías:

**Vía A — automática, dentro de `pxbackup.sh`:**

```bash
ENS_RESTORE_ARCHIVE="root.pxar"
ENS_RESTORE_CANARY="/srv/.ensfacil-canary"
ENS_RESTORE_EVERY_DAYS="7"
MPINFO6_RESTORE_MAX_DIAS="30"
```

**Vía B — a mano o con cron propio**, con el script dedicado:

```bash
sudo /usr/local/bin/ens_mpinfo6_restore_test.sh srv-app-01
```

Emite `restore_ok` con `job_id`, `restored_path`, `status` y un `md5` de 32 hex
—los cuatro campos que exige la regla 106651 y el contrato de calidad de EV-05—,
y además el `evidence_state` de EV-05.

> **Límite declarado de la vía B.** Si lanzas el script por tu cuenta **sin**
> poner `ENS_RESTORE_ARCHIVE` y `ENS_RESTORE_CANARY`, la evidencia se acredita
> igual pero el latido **no** declarará EV-05 como cubierta: `score.py` no tiene
> forma de saber que existe esa sonda externa. Es el lado seguro y no cuesta
> nada, porque EV-05 afirma algo *positivo* (que hubo una restauración validada)
> y el motor no acredita esas por ausencia. Si usas la vía B de forma
> permanente, pon igualmente los dos parámetros para que la cobertura sea
> honesta.

> **DECISIÓN DE POLÍTICA (P-05 del plugin).** `MPINFO6_RESTORE_MAX_DIAS`
> (defecto `30`) es el periodo máximo que el responsable acepta estar sin una
> prueba de restauración validada. Pasado ese plazo, EV-05 vuelve a
> `NO_EVALUABLE` y **MEDIO no puede salir `CUMPLE`**. Y decidir *qué* se
> restaura (`ENS_RESTORE_ARCHIVE`) y *contra qué testigo* se valida
> (`ENS_RESTORE_CANARY`) es también una decisión: una prueba sobre un fichero
> trivial acredita menos que una sobre datos reales.

**Comprobar:**

```bash
sudo jq -c 'select(.event|test("^restore_"))|{event,estado,md5}' \
  /var/log/ensfacil/mp_info_6.json | tail -3
```

---

## 9. Comprobación final

Cuando creas haber terminado, en cada agente:

```bash
for c in op_acc_1 op_acc_2 mp_info_6; do
  echo "===== $c"
  sudo jq -c 'select(.event=="evidence_state" and .emisor=="score")|{evidence_id,estado,motivo}' \
    /var/log/ensfacil/$c.json | tail -8
  sudo jq -c 'select(.event=="score_snapshot")|{nivel,estado,score,requisitos_sin_medir}' \
    /var/log/ensfacil/$c.json | tail -3
done
```

Lo que tiene que salir para un **100 % real** en el nivel objetivo:

1. **Ni un `evidence_state` en `NO_EVALUABLE`** entre las evidencias que rigen
   en ese nivel. Las de refuerzo por debajo de su nivel saldrán `NO_APLICA`, y
   eso está bien.
2. El `score_snapshot` del nivel con `"estado":"CUMPLE"` y `"score":100`, **sin**
   `requisitos_sin_medir`.
3. Ni un `collector_warning` pendiente.
4. Para **op.acc.1**, además: EV-03 en `CUMPLE` **en el plugin** (el agente no
   la juzga), lo que exige P-04 relleno en Configuración y la regla 106891
   desplegada.

Y en el manager, que las alertas llegan:

```bash
sudo grep -c 'op.acc.2' /var/ossec/logs/alerts/alerts.json
```

Y desde el repo del plugin, que la cadena de trazabilidad está entera:

```bash
cd Wazuh-ENS && python3 tests/check-coherencia.py    # 0 si todo cuadra
```

---

## 10. Las decisiones de política, en un solo sitio

Ninguna de estas la puede tomar quien despliega. Son del **responsable de
seguridad o del recurso**, y un auditor puede preguntar por cualquiera.

| # | Control | Dónde se declara | Qué está declarando el responsable |
|---|---|---|---|
| 1 | op.acc.2 | `OPACC2_UMASK_MINIMO` (P-07) | Qué `umask` mínimo se exige. Bajarlo de `027` a `022` da lectura a todo el mundo y queda escrito en el `.env` |
| 2 | op.acc.2 | `OPACC2_WORLD_WRITABLE_PERMITIDOS` + `_EXCEPCIONES` (P-03) | Qué ficheros *world-writable* son legítimos. `si` tolera además los directorios con *sticky bit* |
| 3 | op.acc.2 | `OPACC2_RUTAS_CRITICAS` (P-02) | Qué ficheros del SO se consideran críticos. Lo que no esté aquí no se vigila (ni integridad, ni permisos, ni reglas de auditd) |
| 4 | op.acc.2 | `/etc/ensfacil/opacc2-acl.tsv` (P-04) | Qué permisos debe tener cada recurso. **Es** la decisión que exige `op.acc.2.2` |
| 5 | op.acc.2 | `OPACC2_POLITICA_REF` (P-04) | La referencia documental que respalda esas ACLs. No degrada, pero sin ella el informe no puede citar la norma |
| 6 | op.acc.2 | `OPACC2_MODELO_PRIVILEGIOS` + `opacc2-privilegios.tsv` (P-05) | Qué modelo de privilegios aplica y **quién** está autorizado a qué. Solo ALTO |
| 7 | op.acc.2 | `/etc/ensfacil/opacc2-accesos.tsv` (P-06) | Qué tipo de acceso corresponde a cada perfil, y qué recursos se vigilan. Solo ALTO |
| 8 | op.acc.2 | `/etc/ensfacil/opacc2-suid.allow` | Qué binarios SUID/SGID están autorizados en esta máquina. **Exige revisión humana**, no se siembra |
| 9 | op.acc.1 | **P-04, pantalla de Configuración** | Qué cuentas se declaran genéricas y prohibidas |
| 10 | op.acc.1 | `OPACC1_CUENTAS_SERVICIO` (P-03) | Qué cuentas son de servicio y no deben usarse interactivamente |
| 11 | op.acc.1 | `OPACC1_LISTA_AUTORIZADOS` (P-07) | **Quién** está autorizado a acceder. Mantenerla al día es un procedimiento, no un fichero |
| 12 | op.acc.1 | `OPACC1_PLAZO_DESHABILITAR_DIAS` (P-05) | Cuántos días se tolera entre la baja y la deshabilitación |
| 13 | op.acc.1 | `OPACC1_RETENCION_DIAS` (P-06) | Cuánto se conserva una cuenta deshabilitada antes de eliminarla |
| 14 | op.acc.1 | Vía A/B de §7.4 | De dónde salen las fechas de baja: `chage -E` como procedimiento, o el TSV a mano |
| 15 | op.acc.1 | `OPACC1_SUFIJO_ADMIN` | El sufijo del identificador administrativo diferenciado. **Vacío no es «desactivar»**: es no excluir a nadie |
| 16 | op.acc.1 | `OPACC1_GRUPOS_PRIVILEGIADOS` | Qué grupos otorgan privilegios administrativos |
| 17 | mp.info.6 | `MPINFO6_FRECUENCIA_HORAS` + `_TOLERANCIA_HORAS` | Cada cuánto se exige copia y qué retraso se tolera |
| 18 | mp.info.6 | `MPINFO6_RUTAS_BACKUP` | Si hay copia local además de la remota, y dónde |
| 19 | mp.info.6 | `MPINFO6_RESTORE_MAX_DIAS` | Cuánto se acepta estar sin prueba de restauración validada |
| 20 | mp.info.6 | `ENS_RESTORE_ARCHIVE` + `ENS_RESTORE_CANARY` | Autorizar que la máquina restaure periódicamente, y sobre qué datos |

---

## 11. Qué NO se puede llevar al 100 % hoy

Con honestidad, porque el responsable tiene que saberlo **antes** de
prometérselo a un cliente.

### 11.1 mp.info.6 en nivel ALTO · tope estructural

**El nivel ALTO de mp.info.6 no puede alcanzar el 100 % hoy, y no depende de la
máquina.**

`mp.info.6.r2.1` (copia en ubicación alternativa) tiene **un solo acreditante,
EV-06**, y la evidencia de copia externa (`offsite_success` / `offsite_error`)
la produce **el propio servidor PBS**, en su tarea `sync`. Este runbook **no la
recoge**. No es que falte configurarla: no hay nada que configurar.

Consecuencia, tal como lo publica `score.py`:

| Nivel | EV-06 | `score_snapshot` |
|---|---|---|
| BAJO, MEDIO | `NO_APLICA` (R2 no rige) | puede llegar a `CUMPLE` / 100 |
| **ALTO** | **`NO_EVALUABLE` con motivo** | **`NO_EVALUABLE` y SIN número** |

El motivo que emite es literal: *«la evidencia de copia externa la produce el
propio servidor PBS (offsite_success/offsite_error); este runbook no la
recoge»*.

Y está bien que sea así. La versión anterior publicaba EV-06 como `NO_APLICA`
en todos los niveles «porque ningún script lo emite», y eso le decía al auditor
«aquí no hay nada que mirar» cuando la verdad es «esto no lo estamos midiendo»:
una afirmación falsa en la dirección cómoda, que es la peor.

**Qué cerraría el hueco:** monitorizar el PBS y recoger su tarea `sync`. Las
reglas del lado manager **ya están desplegadas** (106662 `offsite_success` y
106663 `offsite_error`), así que el día que se conecte esa fuente los eventos
decodifican sin tocar el manager. Es trabajo de producto, no de despliegue.

**Recomendación comercial:** con mp.info.6, comprometer **BAJO o MEDIO al
100 %**. En ALTO, comprometer los seis requisitos medibles y declarar `r2.1`
como hueco conocido con su plan de cierre.

### 11.2 mp.info.6 · cuatro parámetros del plugin sin recolector

P-03 (retención mínima), P-07 (usuarios y procesos autorizados), P-08 y P-09
(copia en ubicación alternativa) **no tienen recolector** en este runbook. No se
disimulan con un valor por defecto, pero conviene saber qué mide de verdad cada
evidencia:

- **EV-03** comprueba que la ruta de copias **tenga contenido**, no cuántos días
  se conserva.
- **EV-04** comprueba los **permisos del keyfile**, no una lista de autorizados.

Los requisitos salen `CUMPLE` con esa medida más estrecha. Es una limitación de
alcance declarada, no un falso verde, pero un auditor exigente puede pedir
evidencia documental adicional de la retención.

### 11.3 mp.info.6 · el keyfile con dos nombres · CERRADO

Descrito en §8.2. Era el único **falso verde posible** que esta guía había
encontrado en los tres controles: mover el keyfile sin declarar
`MPINFO6_KEYFILE` producía un `CUMPLE` sobre una clave que ya no se usa.

**Ya no es un límite del producto.** EV-04 se resuelve desde `PBS_KEYFILE`, la
misma variable que cifra, así que la evidencia mide por construcción el fichero
que protege las copias. `MPINFO6_KEYFILE` sobrevive solo como alias obsoleto que
avisa, y dos rutas distintas declaradas a la vez dan `NO_EVALUABLE` en vez de
elegir una.

**Lo único que queda es operativo:** un `.env` heredado puede seguir trayendo el
nombre viejo. No produce un falso verde —mide lo que nombra, y lo avisa en cada
pasada— pero conviene migrarlo con el `sed` del §8.2.

### 11.4 op.acc.1 · el 100 % del agente no es el 100 % del control

El `score_snapshot` del agente puntúa **solo lo que ese script juzga**, y deja
fuera cuatro requisitos de ocho por dos razones distintas:

| Fuera del denominador | Requisitos | Quién los juzga |
|---|---|---|
| `requisitos_delegados` | `op.acc.1.1`, `op.acc.1.r1.3` | el MOTOR, sobre los hechos crudos de EV-03 y EV-07 |
| `sin_evidencia=true` en su `control_state` | `op.acc.1.5`, `op.acc.1.r1.1` | nadie · §11.9 |

Así que el agente puntúa sobre **3 requisitos en BAJO y 4 en MEDIO/ALTO**, y
**puede publicar `CUMPLE` al 100 % con el control real al 75 %**.

**No es un hueco de medida** y no hay que perseguirlo en la máquina; es una
lectura que hay que hacer bien. **El número que vale ante un auditor es el del
plugin**, que sí cuenta los ocho. El del agente sirve para otra cosa: saber si
lo que ESA máquina puede demostrar por sí sola está en orden.

### 11.5 op.acc.1 · EV-04 y EV-08 necesitan historia real

En una máquina recién montada **no hay bajas**, así que no hay nada que medir
hasta que exista una fuente de fechas de baja (§7.4). Adoptar `chage -E` como
procedimiento la desbloquea desde la primera baja real; no hay atajo, y
fabricar una baja falsa para que salga verde sería inventar evidencia.

EV-08 (retención) va un paso más allá: necesita que una cuenta **desaparezca**
después de haber estado deshabilitada. En una máquina nueva no ocurrirá durante
meses, y para las cuentas cuya fecha de baja no consta emite `NO_EVALUABLE`
—correctamente: sin fecha real no se puede afirmar ni que se respetó la
retención ni que se violó—.

### 11.6 op.acc.2 · dos zonas no validadas en contenedor

Están declaradas en `docs/05-verificacion.md` del runbook:

- **auditd.** El kernel de Docker Desktop no tiene soporte de auditoría ni con
  `--privileged`, así que los fixtures de `auditctl -l` y `auditctl -s` están
  **reconstruidos del formato documentado**, no capturados de una máquina real.
  El formato **sí** se validó en el primer despliegue real (Ubuntu 24.04, audit
  3.1.2). Afecta a EV-03 y EV-06.
- **Lo que expone SCA localmente.** Afecta al metadato `sca_activo` de EV-01,
  **no a su veredicto**.

### 11.7 Alcance del vocabulario · D-7 y D-8

Dos cosas que el Excel del auditor pide y que **no se automatizan**, y se dice
en vez de fabricarlas:

- **D-7:** EV-01 debería comprobar «servicios y puertos» y detectar «servicios
  sin autenticación». El vocabulario de eventos del plugin no tiene ningún tipo
  para expresarlo, e inventarlo no serviría (un evento que ninguna regla matchea
  solo dispara la regla base de nivel 0 y **no llega al plugin**). Queda como
  **comprobación documental del auditor**.
- **D-8:** «accesos denegados repetidos al mismo componente» como
  incumplimiento. Se **reporta el recuento** (`access_denied` lleva
  `n:intentos`), no se fabrica el veredicto: no existe evento de incumplimiento
  por repetición y crearlo sería inventar un `NO_CUMPLE` que ninguna regla del
  manager etiqueta.

### 11.8 `control_state` y `score_snapshot` en `NO_EVALUABLE` no generan alerta

Las reglas de agregados cubren `CUMPLE`, `PARCIAL`, `NO_CUMPLE` y `NO_APLICA`,
pero **no** `NO_EVALUABLE` en `control_state` ni en `score_snapshot` de
mp.info.6 y op.acc.1. Un requisito o un nivel entero que no se puede evaluar
decodifica por la regla base de nivel 0 y no genera alerta.

En la práctica el hueco **sí** es visible, porque el `evidence_state`
`NO_EVALUABLE` sí tiene regla y es donde está el `motivo`. Pero conviene saberlo
al leer un panel: **el gris de un requisito se ve por sus evidencias, no por su
`control_state`**.

---

### 11.9 op.acc.1 · dos requisitos que ninguna evidencia técnica demuestra

**Es el tope de este control, y el más importante de conocer**: `op.acc.1` no
llega al 100 % en ningún nivel por mucho que la máquina esté impecable.

| Requisito | Qué exige | Por qué no hay evidencia técnica |
|---|---|---|
| `op.acc.1.5` | identificación conforme a **eIDAS** en las comunicaciones electrónicas | ningún dato de `/etc/passwd`, del log de autenticación ni de ningún recolector demuestra conformidad con el Reglamento (UE) 910/2014 |
| `op.acc.1.r1.1` | **singularizar a la persona** detrás del identificador y sus responsabilidades | un UID único es condición necesaria y no suficiente: falta el vínculo entre el identificador y una persona real, que no vive en el sistema |

La policy del plugin lo declara donde manda —`evidenceIds: []` en
`core/policy-runtime/policies/op-acc-1.policy.ts`— y desde el criterio del 04/08
lo no demostrado cuenta en contra. De ahí el techo: **80 % en BAJO (4 de 5) y
75 % en MEDIO/ALTO (6 de 8)**.

En el plugin salen como no conformidades **«del catálogo»**, con la acción
correcta: *«no hay nada que configurar en el cliente ni ningún agente que
arreglar»*. No las persigas en la máquina.

> **Esto NO era así hasta el 05/08, y el cambio importa.** El `score.py` del
> agente mapeaba EV-01 a los dos y los daba por `CUMPLE` en cuanto el inventario
> conformaba, mientras el motor los publicaba en rojo: dos números distintos
> sobre la misma máquina, y el del agente afirmando un cumplimiento que nadie
> había demostrado. Ahora el agente ni los acredita ni los puntúa, y lo declara
> con `sin_evidencia=true` en su `control_state`. Lo vigila la comprobación 9 de
> `tests/check-coherencia.py`.

**Qué haría falta para cerrarlo.** Una *atestación documental*: que el auditor
pueda declarar en la pantalla —con fecha, responsable y referencia al
documento— que el requisito se satisface por procedimiento, y que eso cuente
como evidencia con su propia trazabilidad. No existe hoy; es trabajo de
producto, no de despliegue.

---

### 11.10 op.acc.3 y op.acc.4 · definidos, sin instrumento de medida

Entraron el **06/08** generados del Excel del auditor, con sus requisitos, sus
13 parámetros y sus 15 evidencias. Lo que **no** tienen es agente: ni runbook,
ni recolector, ni una sola regla en ningún manager.

Los dos van en **`status: 'DRAFT'`**, y eso los deja `NO_APLICA` — fuera del
denominador, sin restar. No es una excepción al principio rector: «lo que no se
puede demostrar no cumple» hace responsable al auditado de probar **lo que se le
ha pedido medir**, no de probar aquello para lo que todavía no existe el
instrumento. Un 0 % ahí no diría nada de la máquina; diría que ENSFácil aún no
sabe mirar eso.

| | op.acc.3 | op.acc.4 |
|---|---|---|
| Rige desde | MEDIO (en BAJO es `n.a.` en el Anexo II) | BAJO |
| Requisitos exigidos | 2 en MEDIO · 4 en ALTO | 5 en los tres niveles |
| Fuera del denominador | `r2.1` y `r3.1`: el ENS los define pero no los exige | — |
| Qué hace falta | mapa de funciones por persona (P-01/P-02/P-03) y correlación | matriz de privilegios (P-01) y accesos remotos (P-04/P-05) |

**op.acc.4 es el que más cerca está**, porque buena parte de sus hechos ya los
emite otro agente: `account_authenticated` de op.acc.1 lleva `usuario` y
`origen` —que es literalmente el acceso remoto de su EV-06—, y `group_membership`
y `privilege_check` de op.acc.2 cubren EV-03 y EV-08. Es el mismo patrón de
hecho compartido que ya usan EV-03/EV-05 de op.acc.1.

**op.acc.3 es el más lejano**, y no por falta de trabajo: es la medida con mayor
componente organizativo del bloque. Sin el mapa de qué función ejerce cada
persona, Wazuh no puede saber que dos acciones legítimas por separado son
incompatibles juntas.

## 12. Resumen: qué nivel es alcanzable hoy

| Control | BAJO | MEDIO | ALTO |
|---|---|---|---|
| `op.acc.1` | **80 % · techo** · §11.9 | **75 % · techo** · §11.9 | igual que MEDIO |
| `op.acc.2` | **100 % alcanzable** | **100 % alcanzable** | **100 % alcanzable**, pero exige los tres ficheros de política, auditd cargado y la línea base SUID revisada |
| `mp.info.6` | **100 % alcanzable** | **100 % alcanzable** (exige prueba de restauración) | **NO alcanzable hoy** · §11.1 |

**`op.acc.1` no llega al 100 % en ningún nivel**, y no por el despliegue: dos
de sus requisitos son atestación documental y ninguna evidencia técnica los
demuestra (§11.9). Con todo lo demás en verde y los tres parámetros de la
pantalla rellenos, el máximo es **80 % en BAJO y 75 % en MEDIO/ALTO**. Es la
respuesta honesta y hay que darla antes de que la dé el auditor.

En los tres controles, el 100 % exige que la máquina **cumpla de verdad**: sin
UIDs duplicados, sin *world-writable* no autorizados, con el `umask` correcto,
sin SUID fuera de la línea base, sin ficheros sin dueño, con la copia hecha y
con el keyfile a 600. Ningún parámetro sustituye a eso, y esa es exactamente la
propiedad que hace que el producto valga ante un auditor.

---

## Referencias

Los detalles de cada parámetro y de cada regla están en la documentación de
cada runbook; esta guía enlaza, no copia:

| Control | Parámetros | Mapa de evidencias | Verificación |
|---|---|---|---|
| `mp.info.6` | [04-parametros](../../mp.info.6-proxmox-backup-runbook/docs/04-parametros.md) | [07-mapa-evidencias](../../mp.info.6-proxmox-backup-runbook/docs/07-mapa-evidencias.md) | [05-verificacion](../../mp.info.6-proxmox-backup-runbook/docs/05-verificacion.md) |
| `op.acc.1` | [04-parametros](../../op.acc.1-control-access-1-runbook/docs/04-parametros.md) | [07-mapa-evidencias](../../op.acc.1-control-access-1-runbook/docs/07-mapa-evidencias.md) | [05-verificacion](../../op.acc.1-control-access-1-runbook/docs/05-verificacion.md) |
| `op.acc.2` | [04-parametros](../../op.acc.2-requisitos-acceso-runbook/docs/04-parametros.md) | [07-mapa-evidencias](../../op.acc.2-requisitos-acceso-runbook/docs/07-mapa-evidencias.md) | [05-verificacion](../../op.acc.2-requisitos-acceso-runbook/docs/05-verificacion.md) |

Y en este repo: [`MIGRAR_UNA_EVIDENCIA.md`](MIGRAR_UNA_EVIDENCIA.md) para el
modelo nuevo (el agente observa, el motor juzga), y
[`ENS_CONTROL_DEPLOYMENT.md`](ENS_CONTROL_DEPLOYMENT.md) para añadir un control.
