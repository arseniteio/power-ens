# ENSFácil

Cumplimiento del Esquema Nacional de Seguridad (RD 311/2022) dentro del
dashboard de Wazuh.

Los agentes observan cada máquina y emiten hechos técnicos. El plugin los
contrasta con la política que la organización declara en pantalla y genera
informes que un auditor puede recorrer de principio a fin:

```
CUMPLE  →  evidencia  →  rule ID  →  evento crudo
```

## Controles

| Control | Nombre | Niveles | Refuerzos |
|---|---|---|---|
| `mp.info.6` | Copias de seguridad | BAJO+ | R1 (MEDIO+), R2 (ALTO) |
| `op.acc.1` | Identificación | BAJO+ | R1 (MEDIO+) |
| `op.acc.2` | Requisitos de acceso | BAJO+ | R1 (solo ALTO) |
| `op.acc.3` | Segregación de funciones | MEDIO+ | R1 (solo ALTO) |
| `op.acc.4` | Gestión de derechos de acceso | BAJO+ | sin refuerzos |

Cada control tiene su propio repositorio de despliegue, con una variante por
tipo de máquina: Linux, servidor de directorio LDAP y Windows.

---

# Desplegar

Intervienen dos tipos de máquina: el manager, donde están Wazuh y el dashboard,
y cada agente auditado.

Dos recomendaciones de método. Clona y actualiza los repositorios con tu
usuario, no con `sudo`: si root se queda con el `.git`, las actualizaciones
posteriores fallan. Y comprueba el resultado de cada paso antes de seguir, para
que un fallo se detecte donde ocurre.

## 1 · Acceso a los repositorios

Una vez por máquina:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/gitlab-qs -N "" -C "$(whoami)@$(hostname)"
cat ~/.ssh/gitlab-qs.pub
```

Registra esa clave pública en la cuenta de GitLab que tenga acceso a los
repositorios, y declárala en `~/.ssh/config`:

```bash
cat >> ~/.ssh/config <<'EOF'

Host gitlab.com
  User git
  IdentityFile ~/.ssh/gitlab-qs
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

ssh -T git@gitlab.com
```

`IdentitiesOnly yes` es necesario: sin esa opción el agente SSH puede ofrecer
otra clave y el error resultante indica que el proyecto no existe, cuando el
problema es la identidad.

## 2 · Wazuh Manager

```bash
sudo mkdir -p /opt/ensfacil && sudo chown "$USER" /opt/ensfacil
git clone git@gitlab.com:quersystem2/Wazuh-ENS.git /opt/ensfacil/repo

cd ~
BASE=git@gitlab.com:quersystem2/ens-controls-runbook
git clone $BASE/op.acc.1-identificacion.git
git clone $BASE/op.acc.2-requisitos-de-acceso.git
git clone $BASE/op.acc.3-segregacion-de-funciones-y-tareas.git
git clone $BASE/op.acc.4-proceso-de-gestion-de-derechos-de-acceso.git
git clone $BASE/mp.info.6-proxmox-backup-runbook.git
```

### 2.1 · Reglas

```bash
for r in op.acc.1-identificacion op.acc.2-requisitos-de-acceso \
         op.acc.3-segregacion-de-funciones-y-tareas \
         op.acc.4-proceso-de-gestion-de-derechos-de-acceso \
         mp.info.6-proxmox-backup-runbook; do
  sudo bash ~/$r/install-manager.sh
done
```

Cada instalador verifica con `wazuh-logtest` que sus reglas disparan antes de
reiniciar el servicio. Si no hay coincidencia, se detiene y lo indica.

Las reglas son las mismas para Linux, LDAP y Windows, así que basta con
instalarlas una vez por manager.

### 2.2 · Plugin

Procedimiento completo, con comprobaciones y vuelta atrás, en
[docs/DESPLEGAR_EL_PLUGIN.md](docs/DESPLEGAR_EL_PLUGIN.md). Resumido:

```bash
sudo -i                        # sesión de root: node está en su PATH
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

Las rutas de borrado son exactas. No uses el comodín `wazuh*`: elimina también
`wazuhCore` y el dashboard deja de arrancar.

### 2.3 · Sembrar la configuración

Sin este paso, la tarjeta del control no aparece en la pantalla de
Configuración.

```bash
cd /opt/ensfacil/repo/config
export OS_USER=admin
read -rsp "clave: " OS_PASS && export OS_PASS && echo
for c in mp.info.6 op.acc.1 op.acc.2 op.acc.3 op.acc.4; do
  python3 inject-control.py "$c" --apply
done
```

La operación fusiona: conserva los valores que ya estuvieran declarados, y se
puede repetir sin riesgo.

## 3 · Agentes

Clona en cada máquina los runbooks de los controles que le apliquen, en la
variante que corresponda a su sistema.

En Linux y en servidores de directorio:

```bash
sudo bash ~/op.acc.1-identificacion/install.sh
```

En Windows, desde PowerShell como Administrador:

```powershell
.\install.ps1
```

Los ficheros `.env` que crea el instalador contienen ajustes de observación
—dónde mirar, qué rango de UID corresponde a personas— con valores válidos para
cualquier sistema. No es necesario editarlos.

Cada repositorio incluye su propia guía en `docs/Instalar.md`.

## 4 · Declarar la política

Este es el paso que hace que una máquina pase a cumplir. El agente no emite
veredictos: contrasta lo que observa con lo que la organización declara en la
pantalla de Configuración. Un parámetro vacío no es un valor por defecto, es una
decisión sin tomar, y no acredita cumplimiento.

Qué rellenar en cada control, con la evidencia y el requisito que desbloquea:
[docs/CUMPLIMIENTO_TOTAL.md](docs/CUMPLIMIENTO_TOTAL.md).

Para comprobar qué mira y qué emite cada evidencia:
[docs/COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md](docs/COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md).

Al final de la pantalla de cada control está la opción de borrar su
configuración. Pide escribir el identificador del control a mano. Borra los
valores declarados, no el control: la tarjeta permanece y se puede volver a
configurar.

## 5 · Comprobar

Una pasada aislada en el agente. El fichero de eventos es un histórico
acumulado, así que conviene apartarlo antes para leer solo la ejecución nueva:

```bash
mv /var/log/ensfacil/op_acc_1.json /var/log/ensfacil/op_acc_1.json.antes
/opt/ensfacil/ens_opacc1_collect.sh
jq -c 'select(.event=="collector_run")' /var/log/ensfacil/op_acc_1.json
```

En la pantalla, la comprobación de que el circuito completo funciona es que un
cambio de parámetro modifique el veredicto sin tocar el servidor: al añadir a
P-04 una cuenta que se haya autenticado, EV-03 pasa a incumplimiento nombrándola;
al quitarla, vuelve.

En la vista general, el gráfico de evolución dibuja un punto por día calculado
por el mismo motor que el panel. El último punto debe coincidir con el índice
global que aparece arriba.

---

# Cuando algo no cuadra

| Síntoma | Causa habitual |
|---|---|
| `Permission denied (publickey)` | la clave no está registrada en la cuenta correcta, o falta `IdentitiesOnly` |
| `detected dubious ownership` | el repositorio se clonó con `sudo`; corregir con `chown -R $USER:$USER` |
| El instalador se ejecuta pero nada cambia | la actualización del repositorio no llegó; comprobar el hash antes de instalar |
| Se despliega y sigue viéndose la versión anterior | caché del navegador; abrir una ventana de incógnito |
| Un parámetro configurado aparece como no configurado | el agente ejecuta una versión anterior; comparar con `md5sum` la librería instalada y la del repositorio |
| La tarjeta del control no aparece en Configuración | falta sembrar su bloque de configuración (paso 2.3) |

Comprobación de coherencia entre el plugin y los runbooks:

```bash
cd /opt/ensfacil/repo && python3 tests/check-coherencia.py
```

Verifica que toda regla acreditada por el plugin está desplegada en el manager,
que las copias de las reglas no divergen y que las evidencias escuchan los
eventos que los agentes emiten.

---

# Cómo decide el motor

Lo que no se puede demostrar, no cumple. La carga de la prueba corresponde al
auditado.

Medida y veredicto son capas distintas: la evidencia indica si se pudo observar
—y con qué causa, si no— y el requisito indica si eso acredita cumplimiento.
La causa determina a quién corresponde la corrección:

| Causa | Dónde se corrige |
|---|---|
| `CONFIGURATION` | falta declarar la política, en la pantalla de Configuración |
| `COLLECTION` | el agente no reporta, en el despliegue de Wazuh |
| `EVIDENCE` | el dato llega incompleto, en el recolector |

El agente observa y el motor juzga. Las evidencias del modelo actual declaran
una primitiva de juicio y el parámetro contra el que se contrastan; el agente
solo emite el hecho. Por eso un cambio en la pantalla modifica el veredicto sin
necesidad de volver a ejecutar nada en el servidor.

Detalle en [docs/PRIMITIVAS_DE_JUICIO.md](docs/PRIMITIVAS_DE_JUICIO.md).

---

# Desarrollo

Este repositorio no compila por sí solo: contiene los artefactos fuente que se
copian dentro del árbol del plugin de Wazuh (paso 2.2).

```
dashboard/ens/     módulo ENS (React + TypeScript)
  catalog/         definición de controles y requisitos
  configuration/   parámetros configurables
  core/            motor: evidencias, evaluación, consolidación
  controls/ informes/ evidences/    las tres pestañas
agent/rules/       reglas Wazuh por control
config/            bloques de configuración e inject-control.py
tests/             suites del motor
```

| Tarea | Documento |
|---|---|
| Añadir un control nuevo | [docs/ENS_CONTROL_DEPLOYMENT.md](docs/ENS_CONTROL_DEPLOYMENT.md) |
| Migrar una evidencia al motor | [docs/MIGRAR_UNA_EVIDENCIA.md](docs/MIGRAR_UNA_EVIDENCIA.md) |
| Arquitectura del motor | [docs/ENS_ENGINE_ARCHITECTURE.md](docs/ENS_ENGINE_ARCHITECTURE.md) |

Rangos de rule ID en uso:

| Control | Banda reservada | En uso |
|---|---|---|
| `mp.info.6` | 106600–106799 | 106600–106723 |
| `op.acc.1` | 106800–106899 | 106800–106891 |
| `op.acc.2` | 106900–106999 | 106900–106974 |
| `op.acc.3` | 107000–107099 | 107000–107050 |
| `op.acc.4` | 107100–107199 | 107100–107150 |
