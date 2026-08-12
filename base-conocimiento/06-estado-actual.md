# Estado actual del parque · 12/08/2026

Medido contra el índice del manager `wazuh4` y contra el panel. Nivel ENS activo:
**MEDIO**. Ventana de evaluación: **30 días**.

> Este documento caduca. Si la fecha de arriba tiene más de un par de semanas,
> vuelve a medir antes de afirmar nada: el comando está al final.

---

## Resumen

| Control | `wazuh-real` (024) | `zimbraHldap` (028) |
|---|---|---|
| op.acc.1 · Identificación | 75 % · 6/8 | 75 % · 6/8 |
| op.acc.2 · Requisitos de acceso | **100 %** · 3/3 | 0 % · 0/3 |
| op.acc.3 · Segregación de funciones | 50 % · 1/2 | **100 %** · 2/2 |
| op.acc.4 · Gestión de derechos | 20 % · 1/5 | 20 % · 1/5 |

`wazuh-real` es Ubuntu 24.04, servidor Linux. `zimbraHldap` es
`ldapserver.qsprueba.com`, Ubuntu 22.04 con directorio Zimbra. Los dos reportan
al manager `wazuh4`.

---

## Qué bloquea cada control

### `wazuh-real`

| Control | Qué falla | Naturaleza |
|---|---|---|
| op.acc.1 | **EV-06 `NO_CUMPLE`** · cuentas con privilegio sin identificador diferenciado | incumplimiento medido · se corrige en la máquina |
| op.acc.2 | nada | — |
| op.acc.3 | **EV-01 y EV-06 `NO_CUMPLE`** · `dioni` ejerce mantenimiento + operación + desarrollo + **auditoría** + configuración | organizativo · **sin solución técnica** |
| op.acc.4 | **EV-02 `NO_CUMPLE`** (privilegios fuera de P-01) · **EV-05** (`revisiones.tsv` vacío) · **EV-07** (falta P-07) | dos son declarar política |

**Aviso que solo afecta a esta máquina:** `op.acc.3` y `op.acc.4` avisan de
truncamiento — el veredicto se calcula sobre **10.000 hechos de 20.052** y de
12.371. Esos dos porcentajes son un **mínimo, no un resultado**.

### `zimbraHldap`

| Control | Qué falla | Naturaleza |
|---|---|---|
| op.acc.1 | **EV-06 `NO_EVALUABLE`** · el plano sistema conforma; el directorio necesita `zimbraIsAdminAccount`, que la ACL reserva | límite de medida · exige bind |
| op.acc.2 | **EV-03 `NO_EVALUABLE`** · slapd no registra accesos (`olcLogLevel` sin `stats`) · **EV-01 `NO_CUMPLE`** · sin TLS, `ssf=0` | uno es hallazgo real |
| op.acc.3 | nada | — |
| op.acc.4 | **EV-03 `NO_CUMPLE`** · dos eventos del 11/08 dentro de la ventana · **EV-07** · mismo `olcLogLevel` | EV-03 **se cierra sola** el 10/09 |

**El 0 % de op.acc.2 es una evidencia sola.** EV-03 está en los tres requisitos
del control, así que EV-02, EV-04 y EV-07 conforman y el número sigue en cero.
Arreglar EV-03 hace cumplir dos de los tres de golpe.

---

## Lo que hay que decir al presentar estos números

### Tres atestaciones apuntan a documentos que no existen

| Parámetro | Sostiene | Documento prometido |
|---|---|---|
| op.acc.1 `P-ATT` | `op.acc.1.5` | Política de identificación en comunicaciones (eIDAS) |
| op.acc.1 `P-ATT` | `op.acc.1.r1.1` | Procedimiento de singularización de identidades |
| op.acc.2 `P-04` | referencia de política | Política de Control de Acceso |

Llevan «PENDIENTE DE SUSTITUIR» en el propio texto, así que están declaradas con
honestidad. Pero **hoy no acreditan nada**: sostienen dos de los ocho requisitos
de op.acc.1 **en las dos máquinas**. Sin ellas, op.acc.1 está en **50 %**, no en
75 %.

### Un incumplimiento sin solución técnica

`op.acc.3` de `wazuh-real`. Con un solo administrador que ejerce cinco funciones
incompatibles —incluida auditoría— no hay configuración que lo arregle. O hay
una segunda persona que audite, o es un riesgo aceptado y documentado.

### Dos números que no son medidas completas

El truncamiento de `wazuh-real`. Reclamar un porcentaje sobre una medida
incompleta no se sostiene delante de un auditor.

---

## Camino al 100 %, y qué cuesta cada paso

Ordenado por retorno.

| # | Acción | Cierra | Quién |
|---|---|---|---|
| 1 | Anotar una revisión en `/etc/ensfacil/opacc4-revisiones.tsv` de `wazuh-real` | op.acc.4.4 | organización · **una línea** |
| 2 | `olcLogLevel: stats` en slapd | op.acc.2.2, op.acc.2.3 y EV-07 de op.acc.4 | cliente · **una operación, tres cierres** |
| 3 | Declarar P-01 y P-07 de op.acc.4 en `wazuh-real` | op.acc.4.1, .2 y .3 | responsable |
| 4 | Identidades `.adm` en `wazuh-real` | op.acc.1.2 y op.acc.1.r1.2 | operación |
| 5 | Cuenta LDAP de solo lectura | op.acc.1 del directorio al 100 % | cliente |
| 6 | Reducir el volumen que emite el agente en `wazuh-real` | quita el truncamiento | **producto** |
| 7 | TLS en slapd | op.acc.2.1 | cliente · certificados antes que SSF |
| 8 | Escribir los tres documentos `PENDIENTE` | op.acc.1.5 y op.acc.1.r1.1 de verdad | organización |
| 9 | Esperar al 10/09 | op.acc.4 EV-03 del LDAP | nadie |

**Siete de los ocho controles son alcanzables al 100 %.** El que no es
`op.acc.3` de `wazuh-real`, y no por falta de trabajo técnico.

---

## Cómo volver a medir

```sh
# estado consolidado por evidencia, de un agente y un control
sudo curl -sk --cert /etc/wazuh-indexer/certs/admin.pem \
     --key /etc/wazuh-indexer/certs/admin-key.pem \
     -H 'Content-Type: application/json' \
     'https://localhost:9200/wazuh-alerts-*/_search' -d '{
       "size":80,"sort":[{"@timestamp":{"order":"desc"}}],
       "query":{"bool":{"must":[
         {"term":{"agent.name":"zimbraHldap"}},
         {"term":{"data.ensfacil":"op.acc.2"}},
         {"term":{"data.event":"evidence_state"}},
         {"range":{"@timestamp":{"gte":"now-2d"}}}]}}}' \
 | python3 -c '
import json,sys
v={}
for h in json.load(sys.stdin)["hits"]["hits"]:
    d=h["_source"]["data"]
    if d.get("plano") not in (None,"consolidado"): continue
    v.setdefault(d["evidence_id"],(d["estado"],d.get("causa","-")))
for k in sorted(v): print(k, *v[k])'
```

> **Los porcentajes hay que leerlos en el panel**, no derivarlos de aquí: las
> evidencias del modelo nuevo las juzga el motor en el navegador y no dejan
> `evidence_state` en el índice.

El detalle completo, evidencia por evidencia y con qué necesita cada una, está en
`Wazuh-ENS/informes/estado-por-evidencia.html`.
