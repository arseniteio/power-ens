# Diagnóstico · qué mirar cuando algo no cuadra

Entra por el síntoma, no por el componente. Cada entrada lleva la causa real que
se comprobó, el comando que lo confirma y el arreglo.

---

## «No aparece nada de cumplimiento en el panel»

**Es el fallo más frecuente y casi nunca es el pipeline.** Comprueba en este
orden, porque cada paso descarta el siguiente.

### 1 · ¿Está el agente dentro del alcance ENS?

Esta es la causa número uno. Si el alcance está en modo `agent` y el ID del
agente no figura, **el plugin ni siquiera lo evalúa**: los eventos llegan al
índice y se descartan antes de mirarlos.

```sh
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["_source"]["configuration"]["scope"])'
```

Si sale `{"mode": "agent", "agentIds": ["024"], ...}` y tu agente es el 028, ese
es el problema. Se corrige desde la pantalla de Configuración.

> `mode: "global"` evalúa todos los agentes, incluidos los que no tienen
> ENSFácil instalado, y hunde la media con máquinas que nadie instrumentó. Es
> preferible listar los IDs.

### 2 · ¿Está el agente en el grupo `ens`?

Sin el grupo, el agente no recibe los `localfile` que leen los ndjson.

```sh
sudo /var/ossec/bin/agent_groups -s -i <ID>          # en el manager
sudo /var/ossec/bin/agent_groups -a -i <ID> -g ens -q
```

Y en el agente, para que baje la configuración: `sudo systemctl restart wazuh-agent`.

### 3 · ¿Llegan los eventos al índice?

```sh
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     -H 'Content-Type: application/json' \
     'https://localhost:9200/wazuh-alerts-*/_search' -d '{
       "size":0,
       "query":{"bool":{"must":[
         {"term":{"agent.name":"<AGENTE>"}},
         {"prefix":{"rule.id":"106"}},
         {"range":{"@timestamp":{"gte":"now-1h"}}}]}},
       "aggs":{"r":{"terms":{"field":"rule.id","size":20}}}}'
```

Si sale vacío pero el ndjson de la máquina tiene líneas, el problema está entre
el agente y el manager. **Sospecha primero de esto:** `logcollector` empieza a
leer un fichero que **ya existe** por el FINAL, así que la primera pasada nunca
llega. Basta con lanzar otra:

```sh
sudo /opt/ensfacil/ens_opacc1_collect.sh      # o el que toque
```

### 4 · ¿Persiste el recolector?

```sh
sudo /opt/ensfacil/ens_opacc1_collect.sh; echo "rc=$?"
sudo wc -l /var/log/ensfacil/op_acc_1.json
```

`rc=3` significa **falta `jq`**, y sin él `ens_emit` no persiste ni un evento.
No viene de serie en Ubuntu Server.

---

## «No se pudo cargar el entorno ENS»

```
Invalid ENS configuration structure: configuration.controls[N].parameters[M].value has an invalid value.
```

**Un parámetro inválido no degrada su control: impide cargar ENSFácil entero.**

`isParameterValue` acepta exactamente `undefined | string | number | boolean |
string[]`. **`null` no está.** Un parámetro nunca configurado **no tiene la clave
`value`**; ponerla a `null` rompe el documento completo.

Lo mismo con una tabla que tenga más celdas que columnas declaradas, o con comas
en una columna de tipo `identifier` (valida contra `/^[^\s|,]+$/`, y un DN de
LDAP va lleno de ellas).

**Comprobación antes de guardar cualquier cambio en la configuración:**

```sh
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

Y **copia previa siempre**, antes de tocar nada:

```sh
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     https://localhost:9200/wazuh-ens-configuration/_doc/active > copia-config.json
```

Para vaciar un parámetro: **borra la clave**, no le asignes `null` ni `[]`.

---

## «Este control tiene evidencias en verde y marca 0 %»

No es un fallo. Un requisito cumple **solo si todas** sus evidencias conforman,
y el porcentaje son requisitos, no evidencias.

Mira la línea **«Lo que separa las dos cifras»** del panel: te dice qué evidencia
arrastra a qué requisitos. Si una evidencia aparece en todos, ella sola mantiene
el control a cero por muchas otras que conformen.

Caso real: `op.acc.2` del servidor LDAP.

```
op.acc.2.1 = EV-01 ✗ + EV-03 ✗   → no cumple
op.acc.2.2 = EV-03 ✗ + EV-04 ✓   → no cumple por EV-03
op.acc.2.3 = EV-03 ✗ + EV-07 ✓   → no cumple por EV-03
```

---

## «Arreglé la máquina y el número no cambia»

Dos causas posibles, y conviene descartar la primera antes de tocar nada.

### La ventana de 30 días todavía contiene el pasado

El motor juzga **todo lo observado en la ventana**, no el último estado. Un
privilegio retirado hoy sigue contando hasta que su último evento caduque.

Para ver si es eso, mira **cuántos eventos** hay y **de cuándo son**:

```sh
# ejemplo con los miembros de grupo privilegiado de op.acc.4
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     -H 'Content-Type: application/json' \
     'https://localhost:9200/wazuh-alerts-*/_search' -d '{
       "size":5,"sort":[{"@timestamp":{"order":"desc"}}],
       "query":{"bool":{"must":[
         {"term":{"agent.name":"<AGENTE>"}},
         {"term":{"data.event":"privileged_group_member"}},
         {"terms":{"data.usuario":["<CUENTA>"]}}]}}}'
```

Si son dos eventos viejos y desde entonces el recolector no los ha vuelto a
emitir, **se cierra solo** cuando caduquen. No lo fuerces declarando autorizado
lo que acabas de retirar: el hallazgo es cierto para el periodo medido.

### El `.env` de la máquina manda sobre la librería

Los recolectores leen `/etc/ensfacil/<control>.env`, que **sobreescribe** el
valor por defecto de la librería. Si se cambia uno y no el otro, el arreglo no
surte efecto.

Ha pasado dos veces: con `adm` en la lista de grupos privilegiados y con
`/bin/sync` en la de shells sin login. En los dos casos la librería estaba bien
y el `.env` instalado seguía con el valor viejo.

```sh
sudo grep -E "^OPACC" /etc/ensfacil/opacc1-ldap.env
grep -E "^OPACC1LDAP_[A-Z_]+=" lib/opacc1ldap-lib.sh    # y compara
```

> `install-real.sh` **nunca pisa** un `.env` que ya exista, así que actualizar el
> repo no actualiza la máquina.

---

## «El veredicto se ha calculado sobre 10.000 hechos de N»

El motor solo trae del índice los **10.000 hechos más recientes** de la ventana.
Si el agente emite más, los antiguos **no se cuentan**, y el porcentaje sale
**mejor que la realidad**: un hallazgo anterior al corte no existe para el motor.

Mientras salga ese aviso, **el número es un mínimo, no un resultado**, y no se
puede afirmar que se han auditado los 30 días completos.

Se arregla reduciendo lo que emite el agente —un hecho por observación distinta,
no uno por repetición— o acortando el periodo de evaluación, que cambia lo que
se audita. Lo primero es trabajo de producto.

---

## «Cambié el plugin y el navegador sigue viendo lo de antes»

**Reinstalar el plugin no cambia la URL de los bundles.** OpenSearch Dashboards
los sirve en `/{buildHash}/bundles/plugin/wazuh/...`, y ese `buildHash` sale del
`build.number` del `package.json` **del dashboard**, no del plugin.

Como esos bundles se sirven pensados para ser inmutables por `buildHash`, el
navegador tiene el viejo cacheado y no lo vuelve a pedir — **ni con
Ctrl+Shift+R**, porque para el navegador esa URL ya está resuelta.

Usa `config/desplegar-plugin.sh`, que sube el `build.number` como último paso.

> Y no confundas compilar con desplegar: el dashboard sirve **solo el zip
> instalado**, nunca recompila del fuente.

---

## «La evidencia llega pero el motor dice que no tiene datos suficientes»

Casi siempre es el **contrato del evento**: el hecho llega sin el campo que la
primitiva necesita para juzgar.

Mira qué campo espera la evidencia en `dashboard/ens/core/evidence/catalog.ts`
(`factField`, `factKeyField`, `tableKeyColumn`) y compáralo con lo que emite el
agente:

```sh
sudo jq -c 'select(.event=="<TIPO>")' /var/log/ensfacil/op_acc_N.json | tail -1
```

Un caso real: el agente emitía sujetos con comas
(`dn.children=cn=admins,cn=zimbra`) y la columna que los casa es de tipo
`identifier`, que las rechaza. La evidencia no podía conformar **nunca**, y no
había nada que arreglar en la máquina.

---

## «Un veredicto tapa a otro»

Si un recolector emite por planos (`sistema` y `directorio`), el motor resuelve
la evidencia quedándose con el **evento más reciente**
(`sortByTimestampDesc` + `latestEvent`). Sin consolidar, el segundo veredicto
borra al primero.

Pasó de verdad: EV-06 emitía `sistema NO_CUMPLE` —tres cuentas con sudo sin
identificador diferenciado— y después `directorio NO_EVALUABLE`, y ganaba el
segundo. **El incumplimiento real desaparecía del diagnóstico** y el panel pedía
configurar un bind cuando lo que había que hacer era sacar tres cuentas de sudo.

Los recolectores con dos planos emiten al final un `plano=consolidado` con el
peor estado, y conservan el desglose en el campo `planos`. Si escribes una
evidencia nueva, tiene que pasar por ahí.

---

## Comprobación de la cadena completa

Cuando algo no cuadra y no sabes en qué salto está, recórrela entera:

```sh
# 1 · el recolector corre y persiste
sudo /opt/ensfacil/ens_opaccNldap_collect.sh; echo "rc=$?"

# 2 · qué ha dictaminado
sudo jq -r 'select(.event=="evidence_state")|[.evidence_id,(.plano//"-"),.estado,(.causa//"-")]|@tsv' \
  /var/log/ensfacil/op_acc_N.json | sort -u

# 3 · qué llegó a MIRAR (lo que permite que el silencio cuente)
sudo jq -r 'select(.event=="collector_run")' /var/log/ensfacil/op_acc_N.json | tail -1

# 4 · el manager lo recoge  (EN EL MANAGER)
sudo grep -h "<AGENTE>" /var/ossec/logs/alerts/alerts.json \
  | grep -oE '"id":"10[67][0-9]{3}"' | sort | uniq -c
```

El paso 4 es el que cierra `CUMPLE → evidencia → rule ID → evento crudo`. Si ahí
no sale nada, vuelve al punto 1 de esta guía.
