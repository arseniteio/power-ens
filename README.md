# ENSFácil

Cumplimiento ENS (RD 311/2022) dentro del dashboard de Wazuh. Los agentes
observan la máquina y emiten hechos; el plugin los juzga contra la política que
tú declaras en pantalla, y genera informes que un auditor puede recorrer:

```
CUMPLE  →  evidencia  →  rule ID  →  evento crudo
```

| Control | Nombre | Niveles | Refuerzos |
|---|---|---|---|
| `mp.info.6` | Copias de seguridad | BAJO+ | R1 (MEDIO+), R2 (ALTO) |
| `op.acc.1` | Identificación | BAJO+ | R1 (MEDIO+) |
| `op.acc.2` | Requisitos de acceso | BAJO+ | R1 (solo ALTO) |
| `op.acc.3` | Segregación de funciones | MEDIO+ | R1 (solo ALTO) · **en borrador** |
| `op.acc.4` | Gestión de derechos de acceso | BAJO+ | sin refuerzos · **en borrador** |

Los dos **en borrador** están definidos y se configuran, pero todavía no tienen
agente que emita sus evidencias, así que **no entran en el índice**: salen
`NO_APLICA` y no restan. Es deliberado — un control sin instrumento de medida no
puede acusar de incumplimiento.

---

# Desplegar

Son **dos máquinas**: el *manager* (donde están Wazuh y el dashboard) y cada
*agente* auditado. Cuatro repos: éste, y uno por control.

> **Las dos reglas que ahorran la tarde.** Clona y haz `pull` **como tu usuario,
> nunca con `sudo`** — si root se queda con el `.git`, después no puedes
> actualizar. Y **comprueba después de cada paso**, no al final: si algo falla en
> el segundo, el síntoma en el cuarto es «no ha cambiado nada».

## 0 · Acceso a GitLab (una vez por máquina)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/gitlab-qs -N "" -C "$(whoami)@$(hostname)"
cat ~/.ssh/gitlab-qs.pub
```

Pega esa clave en GitLab **con la cuenta `@devqs` (quersystem2)**, que es donde
viven los repos. Y déjala configurada en `~/.ssh/config`:

```bash
cat >> ~/.ssh/config <<'EOF'

Host gitlab.com
  User git
  IdentityFile ~/.ssh/gitlab-qs
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

ssh -T git@gitlab.com          # → Welcome to GitLab, @devqs!
```

**En `~/.ssh/config` y no en `git config core.sshCommand`**, aunque las dos
funcionen para clonar. `core.sshCommand` es un ajuste **de git**: `ssh -T` no lo
lee, así que la comprobación de arriba pasaría por alto justo lo que acabas de
configurar y te diría «Permission denied» con la clave bien puesta. Una
verificación que no ejercita lo verificado es peor que no tener ninguna.

`IdentitiesOnly` no es adorno: sin él, el agente ssh puede ofrecer otra clave
tuya, GitLab responde con esa identidad y el error que ves es *«el proyecto no
existe»* — que despista, porque el proyecto sí existe.

Si prefieres no tocar `~/.ssh/config`, la alternativa es
`git config --global core.sshCommand 'ssh -o IdentitiesOnly=yes -i ~/.ssh/gitlab-qs'`,
pero entonces la comprobación tiene que llevar la clave delante:
`ssh -o IdentitiesOnly=yes -i ~/.ssh/gitlab-qs -T git@gitlab.com`.

## 1 · Manager

```bash
# el directorio con sudo, el CLONE con tu usuario: si root se queda con el
# .git, el `git pull` de la próxima actualización falla y no sabrás por qué
sudo mkdir -p /opt/ensfacil && sudo chown "$USER" /opt/ensfacil
git clone git@gitlab.com:quersystem2/Wazuh-ENS.git /opt/ensfacil/repo

cd ~
BASE=git@gitlab.com:quersystem2/ens-controls-runbook
git clone $BASE/op.acc.1-identificacion.git
git clone $BASE/op.acc.2-requisitos-de-acceso.git
git clone $BASE/mp.info.6-proxmox-backup-runbook.git
```

### 1.1 · Reglas

```bash
sudo bash ~/op.acc.1-identificacion/install-manager.sh
sudo bash ~/op.acc.2-requisitos-de-acceso/install-manager.sh
sudo bash ~/mp.info.6-proxmox-backup-runbook/install-manager.sh
```

Cada uno verifica con `wazuh-logtest` que sus reglas disparan antes de reiniciar
nada. Si no hay match, para y lo dice.

### 1.2 · Plugin

Procedimiento completo con sus comprobaciones y su vuelta atrás:
**[docs/DESPLEGAR_EL_PLUGIN.md](docs/DESPLEGAR_EL_PLUGIN.md)**. En corto:

```bash
sudo -i                        # `sudo -i`, no `sudo`: node vive en el PATH de root
DEST=/opt/ensfacil/build/plugins/main/public/components/overview/ens
rm -rf "$DEST" && cp -r /opt/ensfacil/repo/dashboard/ens "$DEST"
cp /opt/ensfacil/repo/dashboard/app-router.tsx \
   /opt/ensfacil/build/plugins/main/public/app-router.tsx

cd /opt/ensfacil/build/plugins/main
YARN_IGNORE_ENGINES=1 node ../../scripts/plugin_helpers build \
  --allow-root --opensearch-dashboards-version=2.19.5

systemctl stop wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove wazuh
rm -rf /usr/share/wazuh-dashboard/plugins/wazuh /usr/share/wazuh-dashboard/plugins/.plugin.installing
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin \
  install file:///opt/ensfacil/build/plugins/main/build/wazuh-2.19.5.zip
systemctl start wazuh-dashboard
```

> **Nunca borres con el comodín `wazuh*`**: se lleva por delante `wazuhCore` y
> deja el dashboard entero roto. Las dos rutas van exactas.

### 1.3 · Sembrar la configuración

Sin esto, la tarjeta del control **no aparece** en la pantalla de Configuración.

```bash
cd /opt/ensfacil/repo/config
export OS_USER=admin
read -rsp "clave: " OS_PASS && export OS_PASS && echo
for c in mp.info.6 op.acc.1 op.acc.2; do python3 inject-control.py "$c" --apply; done
```

Fusiona: conserva los valores que ya hubiera puesto el auditor. Se puede repetir.

## 2 · Agente

Clona los runbooks de los controles que apliquen a esa máquina y:

```bash
sudo bash ~/op.acc.1-identificacion/install-real.sh
sudo bash ~/op.acc.2-requisitos-de-acceso/install-real.sh
```

**Usa rutas absolutas.** `sudo -i` abre una sesión nueva y se come el `cd` que
venga pegado detrás; el instalador acaba corriendo en otro directorio y no te
enteras.

Los `.env` que crea llevan solo **ajustes de observación** —dónde mirar, qué UID
es una persona— con valores que funcionan en cualquier Linux. No hace falta
editarlos.

## 3 · Declarar la política (Configuración → el control)

**Aquí es donde una máquina pasa a cumplir.** El agente no juzga nada: contrasta
lo que observa con lo que tú declaras aquí, así que un parámetro vacío no es un
cero técnico, es una decisión que nadie ha escrito — y eso no acredita.

Qué rellenar en cada control, con la evidencia y el requisito que desbloquea:
**[docs/CUMPLIMIENTO_TOTAL.md](docs/CUMPLIMIENTO_TOTAL.md)**.

Y si lo que quieres es comprobar **si cada evidencia funciona** —qué mira, qué
emite y el comando que te lo dice— evidencia a evidencia y para los tres
controles:
**[docs/COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md](docs/COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md)**.
Son dos preguntas distintas: una evidencia puede funcionar perfectamente y salir
en rojo.

### Borrar lo declarado

Al final de la pantalla de cada control hay **Borrar la configuración de
`<control>`**. Pide escribir el id a mano, y es deliberado: un «¿seguro?» se
acepta sin leerlo. Borra **los valores**, no el control — la tarjeta sigue ahí y
se puede volver a configurar.

Mientras esté sin configurar, sus evidencias salen no evaluables y sus
requisitos no cumplen. Es lo correcto, pero el índice lo nota.

### ¿Y el `.env` del agente? No se toca desde aquí

**Son dos almacenes que no se hablan**, y conviene saberlo antes de buscar un
botón que no existe:

```
PANTALLA ──▶ índice wazuh-ens-configuration ──▶ MOTOR (juzga en el navegador)

AGENTE ──▶ /etc/ensfacil/<control>.env ──▶ recolector ──▶ hechos ──▶ Wazuh
```

El plugin **nunca escribe en una máquina auditada**, y el agente **nunca lee el
índice**. Lo que hace que un parámetro cambie el veredicto depende del modelo:

| | Quién decide | Qué pasa al cambiar el parámetro |
|---|---|---|
| **Modelo nuevo** (`op.acc.3`, `op.acc.4`, y EV-03/05/07 de `op.acc.1`) | el motor, contra la pantalla | el color cambia **al instante**: se rejuzgan los eventos ya indexados. El `.env` solo dice dónde mirar |
| **Modelo clásico** (`mp.info.6`, casi todo `op.acc.1` y `op.acc.2`) | el agente, con su `.env` | en op.acc.1 y op.acc.2 **no cambia nada**: la pantalla solo comprueba que está relleno. En mp.info.6 sí lo consume el motor |

Esa segunda fila es la incoherencia mayor abierta del producto. El camino para
cerrarla no es empujar el `.env` desde Wazuh —sería construir el segundo
almacén en vez de eliminarlo— sino migrar cada evidencia al modelo nuevo, que es
lo que ya se está haciendo.

## 4 · Comprobar

```bash
# en el agente, una pasada aislada (el ndjson es un histórico: un `tail` mezcla ejecuciones)
mv /var/log/ensfacil/op_acc_1.json /var/log/ensfacil/op_acc_1.json.antes
/usr/local/bin/ens_opacc1_collect.sh
jq -c 'select(.event=="collector_run")' /var/log/ensfacil/op_acc_1.json
```

Y en la pantalla del control, la prueba de que todo el circuito está vivo:
**cambia un parámetro y el veredicto cambia sin tocar el servidor.** Añade a P-04
una cuenta que se haya autenticado y EV-03 pasa a rojo nombrándola; quítala y
vuelve. Se rejuzgan los eventos ya indexados.

En la vista general, la comprobación equivalente es el **gráfico de evolución**:
un punto por día, calculado por el mismo motor que el panel, y el último —el
marcado como «ahora»— tiene que dar **el mismo número que el índice global de
arriba**. Si discrepan, hay un defecto. Un día que baja sin que la máquina haya
cambiado suele significar que ese día el agente dejó de reportar y venció la
ventana del recolector.

---

# Cuando algo no cuadra

| Síntoma | Causa casi segura |
|---|---|
| `Permission denied (publickey)` | la clave no está en la cuenta `@devqs`, o falta `IdentitiesOnly` |
| `detected dubious ownership` | clonaste con `sudo`; `chown -R $USER:$USER` al repo |
| El instalador corre pero no cambia nada | `git pull` no llegó. **Comprueba el hash antes de instalar** |
| Desplegado y se ve lo viejo | caché del navegador: ventana de incógnito |
| Un parámetro configurado sale «no configurado» | el agente corre una versión vieja: `md5sum` la librería instalada contra la del repo |
| La tarjeta del control no está en Configuración | falta sembrar el bloque (paso 1.3) |

**Coherencia entre los cuatro repos** — el comando que más veces ha salvado un
despliegue:

```bash
cd /opt/ensfacil/repo && python3 tests/check-coherencia.py
```

Verifica que toda regla que el plugin acredita está desplegada, que las copias
de las reglas no divergen, y que las evidencias escuchan lo que los agentes
emiten.

---

# Cómo decide el motor

Dos cosas que explican casi todo lo que verás en pantalla:

**Lo que no se puede demostrar, no cumple.** La carga de la prueba es del
auditado. Pero *medida* y *veredicto* son capas distintas: la **evidencia** dice
si se pudo mirar (`NO_EVALUABLE` con su causa) y el **requisito** dice si eso
cuenta (`NO_CUMPLE`). Las dos hacen falta — el número sale igual en rojo, y la
causa es lo que te dice a quién llamar:

| Causa | Quién lo arregla |
|---|---|
| `CONFIGURATION` | falta declarar la política → la pantalla de Configuración |
| `COLLECTION` | el agente no reporta → el despliegue de Wazuh |
| `EVIDENCE` | el dato llegó y no sirve → el recolector |

**El agente observa, el motor juzga.** Las evidencias migradas al modelo nuevo
declaran una *primitiva* y el parámetro contra el que se contrastan; el agente
solo emite el hecho crudo. Es lo que hace que cambiar la pantalla cambie el
veredicto sin volver a ejecutar nada.

Detalle: [docs/PRIMITIVAS_DE_JUICIO.md](docs/PRIMITIVAS_DE_JUICIO.md) ·
[docs/MIGRAR_UNA_EVIDENCIA.md](docs/MIGRAR_UNA_EVIDENCIA.md)

---

# Para desarrollar

Este repo **no compila por sí solo**: contiene los artefactos fuente que se
copian dentro del árbol del plugin de Wazuh (paso 1.2).

```
dashboard/ens/     módulo ENS (React + TypeScript)
  catalog/         definición de controles y requisitos
  configuration/   parámetros configurables
  core/            motor: evidencias, evaluación, consolidación
  controls/ informes/ evidences/    las tres pestañas
agent/rules/       reglas Wazuh por control (canónicas)
config/            bloques de configuración + inject-control.py
tests/             suites del motor (`bun run tests/<x>.test.ts`)
```

| Tarea | Documento |
|---|---|
| Añadir un control nuevo | [docs/ENS_CONTROL_DEPLOYMENT.md](docs/ENS_CONTROL_DEPLOYMENT.md) |
| Migrar una evidencia al motor | [docs/MIGRAR_UNA_EVIDENCIA.md](docs/MIGRAR_UNA_EVIDENCIA.md) |
| Montar un servidor de demostración | [docs/DESPLIEGUE_FAKES.md](docs/DESPLIEGUE_FAKES.md) |
| Arquitectura del motor | [docs/ENS_ENGINE_ARCHITECTURE.md](docs/ENS_ENGINE_ARCHITECTURE.md) |

Rangos de rule IDs: `mp.info.6` 106600-106723 · `op.acc.1` 106800-106891 ·
`op.acc.2` 106900-106974.
