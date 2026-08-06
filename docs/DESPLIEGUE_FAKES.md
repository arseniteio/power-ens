# Desplegar los tres fakes — procedimiento único

Los tres controles se despliegan **igual**: mismos nombres de script, mismo
orden, mismos comandos de verificación. Solo cambia el id del control.

Sirve para dejar el servidor fake emitiendo evidencia simulada de `mp.info.6`,
`op.acc.1` y `op.acc.2`, y ver los tres en el plugin.

> **El servidor fake emite hechos inventados.** Todo evento simulado lleva
> `emisor: "simulado"`, que es lo que permite distinguirlo de la evidencia real
> en el índice. Nunca ejecutar `install-fake.sh` en el servidor real: aborta si
> detecta el pipeline real instalado (ver §5).

## 0. Antes de empezar

| Dónde | Qué |
|---|---|
| Manager | Wazuh manager en marcha; grupo de agentes `ens` existente |
| Servidor fake | Agente Wazuh instalado y en el grupo `ens` |
| Ambos | Clave SSH con acceso a los repos de GitLab |

Los tres repos:

```
git@gitlab.com:quersystem2/ens-controls-runbook/mp.info.6-proxmox-backup-runbook.git
git@gitlab.com:quersystem2/ens-controls-runbook/op.acc.1-identificacion.git
git@gitlab.com:quersystem2/ens-controls-runbook/op.acc.2-requisitos-de-acceso.git
```

## 1. En el MANAGER · reglas (una vez por control)

Instala las reglas del control y añade su `localfile` al `agent.conf` del grupo
`ens`. La verificación con `wazuh-logtest` es **bloqueante**: sin match, no
reinicia nada.

```bash
cd /opt/ensfacil
git clone <repo-del-control>      # o: git -C <dir> pull
cd <dir-del-control>
sudo ./install-manager.sh
```

Es idempotente: se puede repetir sin romper nada.

> **Aviso conocido.** Si `agent.conf` ya estaba bien, el script no reinicia el
> manager — pero las reglas nuevas sí necesitan reinicio para cargarse. Si al
> verificar (§3) no hay match, reinicia a mano:
> `sudo systemctl restart wazuh-manager`

## 2. En el MANAGER · configuración (una vez por control)

Sin este paso **la tarjeta del control no aparece** en la pestaña de
Configuración del plugin: el guardado desde la UI rechaza un control que no esté
ya en el índice.

```bash
cd /opt/ensfacil/Wazuh-ENS/config
export OS_USER=admin OS_PASS=<contraseña>

python3 inject-control.py mp.info.6           # dry-run: enseña el plan
python3 inject-control.py mp.info.6 --apply   # escribe

python3 inject-control.py op.acc.1 --apply
python3 inject-control.py op.acc.2 --apply
```

Conserva el resto del documento `active` y, si el control ya estaba,
**conserva los valores que el auditor haya puesto desde la UI**: solo añade los
parámetros que falten. Se puede repetir sin miedo.

> Hasta el 30/07 sustituía el bloque entero, y una segunda siembra tumbó
> op.acc.2 de 83 % a 17 %. Si alguna vez hace falta el comportamiento antiguo
> —descartar lo configurado y volver a la plantilla— es `--sustituir`, y dice
> por pantalla qué valores se pierden.

## 3. En el MANAGER · verificar que las reglas disparan

Un evento por control. Si no hay match, las reglas no están cargadas — vuelve
al aviso de §1.

```bash
echo '{"ensfacil":"mp.info.6","event":"backup_ok","host":"wazuh-fake","estado":"CUMPLE"}' \
  | sudo /var/ossec/bin/wazuh-logtest

echo '{"ensfacil":"op.acc.1","event":"generic_account_login","host":"wazuh-fake","estado":"NO_CUMPLE"}' \
  | sudo /var/ossec/bin/wazuh-logtest

echo '{"ensfacil":"op.acc.2","event":"world_writable","host":"wazuh-fake","estado":"NO_CUMPLE"}' \
  | sudo /var/ossec/bin/wazuh-logtest
```

Deben dar `Phase 3` con id **106650**, **106801** y **106902**.

> El campo `ensfacil` lleva **el id del control**, no `true`: es lo que exige la
> regla base de cada control (106600 / 106800 / 106900). Un evento de prueba
> inventado con `ensfacil: true` decodifica bien y no dispara ninguna regla, y
> parece que las reglas no están cargadas cuando sí lo están. Si dudas, copia
> una línea real de `/var/log/ensfacil/<control>.json`.

## 4. En el SERVIDOR FAKE · instalar los tres simuladores

```bash
cd /opt/ensfacil
git clone <repo-del-control>      # o: git -C <dir> pull
cd <dir-del-control>
sudo ./install-fake.sh
```

Instala **solo** el emisor y el simulador con su cron. Nunca instala el pipeline
real: en un servidor fake, el `score` real derivaría estado a partir de la
máquina de verdad y contradiría el escenario que el simulador acaba de pintar.

## 5. La asimetría de los instaladores (leer antes de tocar)

No es un descuido. Las dos direcciones no son equivalentes:

| Script | Si encuentra el otro pipeline |
|---|---|
| `install-real.sh` | **Lo retira.** La máquina pasa a decir la verdad: seguro. |
| `install-fake.sh` | **Aborta** con rc≠0. Solo lo retira con `--reemplaza-real`. |

Convertir en simulada una máquina que está midiendo de verdad mete evidencia
fabricada en un informe ENS firmado, y sin ninguna señal de que ha pasado. Un
operador en la terminal equivocada tiene que toparse con un error, no con un
éxito silencioso.

Para reconvertir un servidor real en banco de pruebas, deliberadamente:

```bash
sudo ./install-fake.sh --reemplaza-real
```

## 6. Pintar un escenario

Los tres simuladores aceptan los mismos cuatro escenarios:

```bash
sudo /usr/local/bin/ens_mpinfo6_fake.sh --escenario mixto
sudo /usr/local/bin/ens_opacc1_fake.sh  --escenario mixto
sudo /usr/local/bin/ens_opacc2_fake.sh  --escenario mixto
```

| Escenario | Para qué |
|---|---|
| `cumple` | Todo en verde |
| `mixto` | Verdes, rojos y grises — **el más útil para enseñar el producto** |
| `incumple` | No conformidades |
| `no_evaluable` | Sin datos: demuestra que el producto no inventa un verde |

El cron los repinta solo; ejecutarlos a mano da resultado inmediato.

## 7. El plugin

Reconstruir e instalar en el árbol de Wazuh (`<arbol>/plugins/main`), según
`CLAUDE.md` → "Ciclo de build y deploy". El dashboard sirve **solo el zip
instalado**, no recompila del fuente.

**Rutas de borrado exactas**: `/usr/share/wazuh-dashboard/plugins/wazuh` y
`.plugin.installing`. Nunca el comodín `wazuh*` — borra `wazuhCore` y rompe
todo el dashboard.

## 8. Verificar en la UI

1. **Controles** — los tres aparecen con su porcentaje. Ninguno al 0 % con
   evidencias visibles: eso indicaba el desajuste de evaluación que se corrigió
   el 30/07.
2. **Evidencias** — filtrar por el agente fake. Cada evidencia con su estado y
   su motivo.
3. **Trazabilidad** — de un `CUMPLE` hasta el rule ID y el evento crudo. Es lo
   que hay que enseñarle al auditor: la cadena entera.
4. **Configuración** — la tarjeta de los tres controles. Si falta alguna, es
   que se saltó §2.

Un `NO_EVALUABLE` con motivo **no es un fallo de la demo**: es el producto
diciendo que no puede medir algo en vez de inventarse un verde. Es el argumento
más fuerte que hay frente a un auditor.

## 9. Deshacerlo después

No hay desinstalador; el simulador vive en cuatro sitios conocidos:

```bash
sudo rm -f /etc/cron.d/ensfacil-mpinfo6-fake \
           /etc/cron.d/ensfacil-opacc1-fake \
           /etc/cron.d/ensfacil-opacc2-fake
sudo rm -f /usr/local/bin/ens_mpinfo6_fake.sh \
           /usr/local/bin/ens_opacc1_fake.sh \
           /usr/local/bin/ens_opacc2_fake.sh
sudo rm -rf /var/log/ensfacil
```

Los eventos ya emitidos siguen en el índice; se filtran por
`data.emisor: "simulado"` o por el nombre del agente fake.
