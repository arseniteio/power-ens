# Cómo funciona ENSFácil por dentro

Lo que hay que entender para diagnosticar, para decidir dónde tocar algo, y para
no proponer cambios que rompan la cadena de trazabilidad.

---

## El recorrido de un dato, de la máquina al porcentaje

```
  MÁQUINA AUDITADA                    MANAGER              NAVEGADOR
  ────────────────                    ───────              ─────────
  recolector (bash)
       │ emite
       ▼
  /var/log/ensfacil/op_acc_N.json     
       │ (ndjson, una línea por hecho)
       ▼
  logcollector ──────────────────►  decoder json
                                         │
                                         ▼
                                    reglas 106xxx / 107xxx
                                         │
                                         ▼
                                    wazuh-alerts-*  ──────►  MOTOR ENS
                                                                 │
                                    wazuh-ens-configuration ─────┤
                                                                 ▼
                                                              porcentaje
```

**Los dos detalles del dibujo que más problemas causan:**

1. **El motor corre en el navegador**, no en el servidor. Lee del índice y de la
   configuración, y calcula ahí. Por eso un cambio de configuración se nota al
   recargar, sin reiniciar nada.
2. **El agente nunca lee `wazuh-ens-configuration`.** La flecha va solo hacia el
   motor. Ver más abajo, «los dos almacenes».

---

## Dónde vive cada cosa

### En la máquina auditada

```
/opt/ensfacil/
  ensfacil-emit.sh            emisor canónico · lo comparten TODOS los controles
  opaccNlib.sh                las evidencias de un control
  ens_opaccN_collect.sh       orquestador: candado, evidencias, latido
/etc/ensfacil/
  opaccN.env                  ajustes de OBSERVACIÓN (dónde mirar)
  <ficheros de política>      bajas, revisiones, línea base de SUID, ACL declarada
/var/lib/ensfacil/opaccN/     estado entre pasadas (offsets, snapshots, marcas)
/var/log/ensfacil/op_acc_N.json   el ndjson que lee el agente de Wazuh
/etc/cron.d/ensfacil-opaccN   la pasada periódica
```

> `ensfacil-emit.sh` es **canónico y compartido**. No se modifica desde un
> runbook: si se toca, se rompen todos los controles de esa máquina. Por eso
> `uninstall.sh` nunca lo borra.

### En el manager

```
/var/ossec/etc/rules/ensfacil_op_acc_N_json_rules.xml   las reglas
/var/ossec/etc/shared/ens/agent.conf                    los localfile del grupo
```

### En el plugin

```
dashboard/ens/
  core/            EL MOTOR
    ens-engine.ts          punto de entrada · getENSComplianceState(...)
    evidence/              resuelve evidencias · catalog.ts y judgment.ts
    policy-runtime/        políticas por control (op.acc.3 tiene la suya)
    evaluation/            de evidencias a requisitos
    compliance-state/      consolida por agente y alcance
    scope/                 qué agentes entran en la evaluación
    data-source/           consultas al índice · ventana de evaluación
    timeline/              la serie diaria del gráfico
  configuration/   la pantalla de parámetros y su validación
  catalog/         definición moderna de cada control
  data/            definición legacy que consume la UI
  controls/        pestaña Controles y detalle
  informes/        pestaña Informes y PDF
```

---

## Los dos modelos de evaluación

Conviven, y es importante saber cuál rige una evidencia antes de tocarla.

### Modelo clásico · el agente dictamina

El recolector emite un `evidence_state` con su `estado` ya decidido, y el motor
lo consolida.

```json
{"event":"evidence_state","evidence_id":"EV-01","estado":"CUMPLE",
 "requisito":"op.acc.1.3","motivo":"..."}
```

El agente juzga leyendo **ficheros de su propia máquina**. Si necesita una
decisión de política, tiene que estar en `/etc/ensfacil/`.

### Modelo nuevo · el agente observa, el motor juzga

El recolector emite un **hecho crudo**, sin veredicto, y el motor lo contrasta
con un parámetro de la pantalla usando una primitiva.

```json
{"event":"account_active","evidence_id":"EV-01,EV-07","usuario":"root","uid":0}
```

**Las siete primitivas:**

| Primitiva | Pregunta que responde | ¿Cumple por ausencia? |
|---|---|---|
| `NINGUNO_EN_LISTA` | ¿algún hecho está en la lista prohibida? | sí |
| `TODOS_EN_LISTA` | ¿están todos los hechos en la lista permitida? | **no** |
| `NINGUNO_FUERA_DE_LISTA` | ¿hay algún hecho fuera de lo declarado? | sí |
| `UMBRAL_MAXIMO` / `UMBRAL_MINIMO` | ¿el valor pasa del umbral? | según |
| `ANTIGUEDAD_MAXIMA` | ¿el hecho más reciente es más viejo que el plazo? | no |
| `CONFORME_A_TABLA` | ¿cada hecho casa con su fila de la tabla? | sí |

> **«Cumple por ausencia» es la clave de la cobertura.** Solo esas primitivas
> pueden convertir «cero hechos» en `CUMPLE`, y **solo si el latido declaró que
> se miró**. `TODOS_EN_LISTA` no cumple por ausencia nunca: «todas las cuentas
> están autorizadas» sobre cero cuentas observadas es cierto en lógica y falso en
> una auditoría.

**El corte es total en los dos lados.** El agente de una evidencia migrada no
emite `evidence_state` suyo ni en el recolector, ni en el score, ni en el
watchdog. Convivir los dos caminos sobre la misma evidencia hace imposible
auditar de forma consistente — se arregló desconectando un evaluador que lo hacía.

### El caso aparte · `op.acc.3`

Es el **único control con evaluador de política propio**, y la razón es
estructural: su hecho no significa nada por sí solo. «jgomez ejecutó `git push`»
no incumple; incumple si *esa misma cuenta* ejerce además una función
incompatible en la ventana.

Eso exige tres cosas a la vez —clasificar por P-03, agrupar por cuenta y cruzar
contra P-02— y ninguna primitiva contrasta más de un hecho contra un parámetro.
Por eso el agente emite acciones **sin clasificar** y la política decide.

Consecuencia práctica: en `op.acc.3` los requisitos pueden cumplir con evidencias
en `NO_EVALUABLE`, porque no se resuelven encadenándolas.

---

## El latido, y por qué el silencio a veces vale

Cada pasada termina emitiendo un `collector_run`:

```json
{"event":"collector_run","resultado":"completada",
 "evidencias_cubiertas":"EV-01,EV-06","evidencias_emitidas":6}
```

`evidencias_cubiertas` es una **lista blanca**: el motor solo convierte «cero
hechos» en `CUMPLE` para lo que aparezca ahí.

La regla al escribir un recolector: **se declara la evidencia cuya fuente ESTA
pasada ha comprobado y cuya primitiva puede convertir el silencio en cumplimiento.**
Las dos condiciones, y comprobando la fuente de verdad —no de oficio.

Declarar cobertura sin comprobar es el `CUMPLE` falso más fácil de cometer y el
más difícil de ver: no falla nada, simplemente el control se pone verde sobre
una fuente que nadie leyó.

---

## Dos planos, cuando la máquina tiene dos superficies

Un servidor de directorio tiene dos poblaciones de identidades, y cada evidencia
se pronuncia **una vez por plano**:

```json
{"event":"evidence_state","evidence_id":"EV-06","plano":"sistema","estado":"NO_CUMPLE"}
{"event":"evidence_state","evidence_id":"EV-06","plano":"directorio","estado":"NO_EVALUABLE"}
{"event":"evidence_state","evidence_id":"EV-06","plano":"consolidado","estado":"NO_CUMPLE",
 "planos":"sistema:NO_CUMPLE,directorio:NO_EVALUABLE"}
```

**El consolidado no es cosmético.** El motor resuelve cada evidencia quedándose
con el evento **más reciente** (`sortByTimestampDesc` + `latestEvent`), así que
sin él el segundo veredicto tapa al primero. Pasó: un `NO_CUMPLE` real quedó
enterrado bajo un `NO_EVALUABLE` posterior, y el panel pedía arreglar lo que no
era.

El consolidado emite el **peor** de los planos y espera a que el reloj cambie de
segundo, porque `ts` tiene resolución de un segundo y el desempate no es estable
dentro del mismo.

---

## Los dos almacenes de parámetros que nadie sincroniza

Es la incoherencia estructural del producto. Tenerla presente evita escribir
evidencias imposibles.

| | Pantalla de Configuración | `.env` de la máquina |
|---|---|---|
| Dónde vive | índice `wazuh-ens-configuration` | `/etc/ensfacil/opaccN.env` |
| Quién lo lee | **el motor**, en el navegador | **el agente**, en la máquina |
| Para qué | juzgar evidencias del modelo nuevo | decidir veredictos del modelo clásico |

**El agente no consulta el índice jamás.** De ahí salió un defecto real: una
evidencia emitía `NO_EVALUABLE` diciendo «la lista se declara en P-10 de la
pantalla», una condición que el agente no puede cumplir nunca. El control se
quedó en 0 % por diseño hasta que se pasó a juzgar contra un fichero local.

**Regla al escribir una evidencia nueva:**

- Si el veredicto lo emite **el agente** → lo que necesita para decidir tiene que
  estar **en la máquina**.
- Si la política solo puede vivir **en la pantalla** → la evidencia debe declarar
  `judgment` en el catálogo y dejar que juzgue **el motor**.

Lo que no puede es pedir algo que no alcanza.

> El camino por el que se cierra esta incoherencia es la migración: cada
> evidencia que pasa al modelo nuevo **retira del `.env` el parámetro que ya no
> consume**. Dejarlo ahí sin efecto es peor que quitarlo — el operador lo edita y
> no cambia nada.

---

## El instante de evaluación

El último parámetro del motor es `now`, **el instante al que se evalúa**, y no
es un adorno.

Por defecto es ahora, que es el caso del panel. La serie diaria del gráfico lo
usa para evaluar el **mismo motor** a fechas pasadas. Sin él, cada punto del
histórico se juzgaría contra hoy y la línea bajaría hacia el pasado por el mero
hecho de que el pasado es viejo.

Baja hasta la resolución de evidencias (ventana del latido) y hasta el contexto
de política (antigüedad de la copia).

---

## Numeración de reglas

Cada control tiene una banda reservada. Un id nuevo se toma del primer hueco de
su banda, y **hay que comprobar que está libre en todos los repos**: la canónica
de `agent/rules/`, la copia de cada `manager/` de runbook, y los ficheros de
hechos crudos que numeran sobre la misma banda sin desplegarse.

| Control | Banda |
|---|---|
| mp.info.6 | 106600 – 106799 |
| op.acc.1 | 106800 – 106899 |
| op.acc.2 | 106900 – 106999 |
| op.acc.3 | 107000 – 107099 |
| op.acc.4 | 107100 – 107199 |

Un id **no puede significar dos evidencias** según qué fichero se mire. En
op.acc.1 hay dos ficheros de reglas sobre el mismo rango y solo uno se despliega:
la trazabilidad del catálogo tiene que salir **del desplegado**, o el auditor
sigue un rule ID que no existe en ningún manager.

---

## Comprobación de coherencia entre repos

```sh
python3 tests/check-coherencia.py   # 0 si todo cuadra
```

Verifica lo que ninguna prueba unitaria ve, porque vive en el hueco entre el
plugin y los runbooks: que toda regla acreditada exista en un manager, que la
canónica y la copia desplegada no diverjan, que toda evidencia escuche
`evidence_state`, que todo tipo declarado lo emita alguna regla, y que cada
control tenga su bloque de configuración.
