# Desplegar el plugin ENSFácil

Procedimiento de compilación y despliegue en el manager de Wazuh, con la
comprobación que va después de cada paso. Todo lo de aquí está medido: los
avisos vienen de fallos que han costado tiempo de verdad.

**Regla que resume el documento: comprueba entre paso y paso, no al final.** El
ciclo tiene cuatro tramos —traer, copiar, compilar, instalar— y si solo miras el
resultado, un fallo en el segundo se manifiesta como "no ha cambiado nada" sin
decirte cuál falló.

## 0. Antes de nada: sé root de verdad

```bash
sudo -i
```

**`sudo -i` no es lo mismo que `sudo`.** El primero carga el perfil de root y con
él su `PATH`; el segundo no. `node` vive en el `PATH` de root, así que
`sudo node …` falla con `command not found` mientras que dentro de `sudo -i`
funciona. Todo el ciclo se hace en una sesión de root.

Rutas, para tenerlas a mano:

| | |
|---|---|
| Repo de artefactos fuente | `/opt/ensfacil/repo` |
| Árbol del plugin de Wazuh | `/opt/ensfacil/build/plugins/main` |
| Módulo ENS dentro del árbol | `…/public/components/overview/ens` |
| Plugin instalado | `/usr/share/wazuh-dashboard/plugins/wazuh` |
| Respaldos | `/opt/ensfacil/artifacts` |

## 1. Traer el código

```bash
git -C /opt/ensfacil/repo pull
git -C /opt/ensfacil/repo log --oneline -1
```

Anota ese hash: es contra lo que vas a comprobar al final.

> Si el `pull` da `Permission denied (publickey)`, la clave SSH es de tu usuario,
> no de root. Sal de root, haz el `pull` como tú, y vuelve a entrar.

## 2. Respaldar

```bash
STAMP=$(date +%F-%H%M)
mkdir -p /opt/ensfacil/artifacts/backup-$STAMP
cp -r /opt/ensfacil/build/plugins/main/public/components/overview/ens \
      /opt/ensfacil/artifacts/backup-$STAMP/
cp /opt/ensfacil/build/plugins/main/build/wazuh-2.19.5.zip \
   /opt/ensfacil/artifacts/backup-$STAMP/
echo "respaldo en /opt/ensfacil/artifacts/backup-$STAMP"
```

El zip es lo que de verdad permite volver atrás en un minuto (ver §7).

## 3. Copiar los fuentes al árbol

Este repo **no compila por sí solo**: son los artefactos que se copian dentro del
árbol de Wazuh.

```bash
DEST=/opt/ensfacil/build/plugins/main/public/components/overview/ens

rm -rf "$DEST"
[ -e "$DEST" ] && { echo "ERROR: no se pudo borrar. PARA AQUI."; } || echo "borrado OK"

cp -r /opt/ensfacil/repo/dashboard/ens "$DEST"
cp /opt/ensfacil/repo/dashboard/app-router.tsx \
   /opt/ensfacil/build/plugins/main/public/app-router.tsx

ls -d "$DEST/ens" 2>/dev/null && echo "ERROR: se ha anidado. PARA AQUI."
```

> **Por qué el `rm` se comprueba.** `cp -r origen destino` **cuando el destino ya
> existe copia DENTRO de él**. Si el `rm -rf` falla —permisos, por ejemplo— no da
> error: crea `ens/ens` y deja el `ens/` viejo intacto. El síntoma es
> desconcertante: aparecen ficheros nuevos (los copiados dentro) pero los que ya
> existían siguen siendo los antiguos. Nos costó dos rondas de diagnóstico.

**Comprobación del paso**, con una marca del cambio que traes:

```bash
grep -c "unmeasuredRequirements" "$DEST/core/evaluation/evaluation-engine.ts"
```

Elige tú la marca: un identificador o una cadena que solo exista en lo nuevo.
Si da 0, la copia no trajo lo que crees y **no tiene sentido compilar**.

## 4. Compilar

```bash
cd /opt/ensfacil/build/plugins/main
YARN_IGNORE_ENGINES=1 node ../../scripts/plugin_helpers build \
  --allow-root --opensearch-dashboards-version=2.19.5
```

Tarda unos cuatro minutos y parece colgado un buen rato: es normal. Los avisos de
`caniuse-lite` y el de `[BABEL] … deoptimised` son ruido conocido.

**Comprobación del paso** — la misma marca, ahora dentro del zip:

```bash
unzip -p build/wazuh-2.19.5.zip | grep -c "unmeasuredRequirements"
```

Mayor que 0. Si compila y el zip no la trae, el problema es del build y no sirve
de nada instalar.

## 5. Instalar

```bash
systemctl stop wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove wazuh
rm -rf /usr/share/wazuh-dashboard/plugins/wazuh
rm -rf /usr/share/wazuh-dashboard/plugins/.plugin.installing
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin \
  install file:///opt/ensfacil/build/plugins/main/build/wazuh-2.19.5.zip
systemctl start wazuh-dashboard
```

> **Las dos rutas de borrado son exactas. NUNCA el comodín `wazuh*`**: se lleva
> por delante `wazuhCore` y deja el dashboard entero roto.

```bash
journalctl -u wazuh-dashboard -n 30 --no-pager | tail -15
```

## 6. Comprobar que lo desplegado es lo compilado

**Esta es la comprobación que separa "he desplegado" de "funciona".**

```bash
grep -rl "Pendientes de medición" /usr/share/wazuh-dashboard/plugins/wazuh/ 2>/dev/null | head -3
```

Cambia la cadena por una del cambio que traes. Devuelve una ruta bajo
`target/public/*.js` → el servidor sirve el código nuevo.

Y si el navegador sigue enseñando lo viejo, **es caché**. Dashboards sirve los
chunks con nombre estable y cabeceras largas, así que `Ctrl+Shift+R` no siempre
basta:

1. Ventana de **incógnito** — la prueba definitiva, no toca tu perfil.
2. F12 → Network → *Disable cache*, y recargar con esa pestaña abierta.
3. F12 → Application → Storage → *Clear site data*.

## 7. Volver atrás

```bash
ls /opt/ensfacil/artifacts        # elige el backup-<fecha>

systemctl stop wazuh-dashboard
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove wazuh
rm -rf /usr/share/wazuh-dashboard/plugins/wazuh /usr/share/wazuh-dashboard/plugins/.plugin.installing
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin \
  install file:///opt/ensfacil/artifacts/backup-STAMP/wazuh-2.19.5.zip
systemctl start wazuh-dashboard
```

## 8. Sembrar la configuración de un control

Solo hace falta con un control **nuevo**, o cuando su bloque gana parámetros u
opciones. Sin esto **la tarjeta del control no aparece** en la pantalla de
Configuración: el guardado desde la UI rechaza un control que no esté ya en el
índice (huevo y gallina).

```bash
cd /opt/ensfacil/repo/config
export OS_USER=admin
read -rsp "clave: " OS_PASS && export OS_PASS && echo

python3 inject-control.py op.acc.1            # dry-run: enseña el plan
python3 inject-control.py op.acc.1 --apply    # escribe
```

**Fusiona: conserva los valores que el auditor haya puesto** y solo añade lo que
falte. Se puede repetir sin miedo. (Hasta el 30/07 sustituía el bloque entero y
una segunda siembra tumbó op.acc.2 de 83 % a 17 %.) Para volver a la plantilla
vacía, `--sustituir`, que dice qué valores se pierden.

## 9. Comandos útiles

**Coherencia entre los cuatro repos** — el que más veces ha salvado el despliegue:

```bash
cd /opt/ensfacil/repo && python3 tests/check-coherencia.py
```

Verifica que toda regla que el plugin acredita esté desplegada en el manager, que
la canónica y las copias no divergen, que las evidencias escuchan el contrato que
emiten los agentes, y que los tres runbooks tienen los cuatro scripts. `rc=0` o
te dice exactamente qué falla.

**Suites del plugin** (necesitan `bun`):

```bash
cd /opt/ensfacil/repo
bun run tests/evidence-judgment.test.ts
bun run tests/hueco-de-medida.test.ts
bun run tests/vista-general-agregada.test.ts
python3 config/test_inject_control.py
python3 config/test_control_blocks.py
```

**Que una regla dispara**, en el manager:

```bash
echo '{"ensfacil":"op.acc.1","event":"generic_account_login","host":"H","estado":"NO_CUMPLE"}' \
  | /var/ossec/bin/wazuh-logtest
```

Busca `Phase 3` con un id del rango del control. El campo `ensfacil` lleva **el
id del control**, no `true`: un evento inventado con `ensfacil: true` decodifica
bien y no dispara nada, y parece que las reglas no están cargadas cuando sí lo
están. Ante la duda, copia una línea real de `/var/log/ensfacil/<control>.json`.

**Si no hay match**: `install-manager.sh` no reinicia el manager cuando
`agent.conf` no cambia, pero las reglas nuevas sí necesitan recarga.

```bash
systemctl restart wazuh-manager && sleep 20
```

**Qué emite un agente en UNA pasada** (no la cola del histórico):

```bash
mv /var/log/ensfacil/op_acc_1.json /var/log/ensfacil/op_acc_1.json.antes
/usr/local/bin/ens_opacc1_collect.sh
jq -c '{event,evidence_id,estado,motivo}' /var/log/ensfacil/op_acc_1.json
```

El ndjson es un **histórico**: un `tail` mezcla varias ejecuciones y enseña
estados ya superados. Diagnosticar sobre la cola nos costó media hora persiguiendo
un fallo que ya estaba arreglado.

**Que el agente corre la versión del repo:**

```bash
md5sum /usr/local/bin/ens_opacc1_collect.sh ~/ens/op.acc.1-*/scripts/ens_opacc1_collect.sh
md5sum /opt/ensfacil/opacc1-lib.sh ~/ens/op.acc.1-*/lib/opacc1-lib.sh
```

Tienen que coincidir. Una máquina con el pipeline desactualizado da síntomas que
apuntan al sitio equivocado: nos dio "parámetro no configurado" **con el
parámetro configurado**, porque la librería vieja lo descartaba.

## 10. Tabla de diagnóstico

| Síntoma | Causa más probable |
|---|---|
| `sudo: node: command not found` | `sudo` en vez de `sudo -i` (§0) |
| El `grep` del §3 da 0 | El `rm -rf` falló y el `cp` anidó en `ens/ens` |
| El zip no trae la marca | El build no llegó a correr; mira su salida entera |
| Desplegado pero se ve lo viejo | Caché del navegador (§6) |
| La tarjeta del control no aparece en Configuración | Falta sembrar el bloque (§8) |
| `wazuh-logtest` sin `Phase 3` | Reglas sin recargar, o `ensfacil: true` en el evento de prueba (§9) |
| Un parámetro configurado sale como "no configurado" | Pipeline del agente desactualizado (§9) |
| El motivo de una evidencia no cuadra con la configuración de ahora | Estás leyendo la cola del histórico, no una pasada (§9) |

## Enlaces

- [`DESPLIEGUE_FAKES.md`](DESPLIEGUE_FAKES.md) — servidor de demostración
- [`ENS_CONTROL_DEPLOYMENT.md`](ENS_CONTROL_DEPLOYMENT.md) — añadir un control nuevo
- [`MIGRAR_UNA_EVIDENCIA.md`](MIGRAR_UNA_EVIDENCIA.md) — pasar una evidencia al modelo nuevo
- [`HALLAZGOS_DESPLIEGUE_REAL_2026-07-31.md`](HALLAZGOS_DESPLIEGUE_REAL_2026-07-31.md) — qué salió mal la primera vez en máquina real
