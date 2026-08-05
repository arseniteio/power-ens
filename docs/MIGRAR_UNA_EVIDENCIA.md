# Migrar una evidencia: del agente que juzga al motor que juzga

Receta para pasar una evidencia al modelo nuevo. La primera ya está hecha
—`op.acc.1` / EV-03— y sirve de ejemplo trabajado de cada paso.

## Qué modelo hay y por qué se migra

| | Modelo clásico | Modelo nuevo |
|---|---|---|
| El agente | calcula el `estado` y emite `evidence_state` | emite el **hecho crudo**, sin juzgar |
| El motor | consolida lo que el agente decidió | **decide**, contrastando el hecho con el parámetro |
| El parámetro | vive en `/etc/ensfacil/<control>.env`, en cada máquina | vive **solo** en la pantalla de Configuración |

El modelo clásico tiene dos almacenes de parámetros que nadie sincroniza: el
auditor edita en la pantalla y el agente decide con su fichero local. Cambiar un
valor en la UI no cambia lo que el agente detecta. **La pantalla promete algo
que no cumple**, y esa es la razón de la migración.

Se decidió el 30/07: manda el plugin, los agentes solo emiten datos.

## Las tres reglas que no se negocian

**1. El corte es total en los dos lados.** Una evidencia migrada no emite
`evidence_state` propio en **ningún** sitio: ni en el recolector, ni en
`score.py`, ni en el watchdog, ni en el simulador. Convivir los dos caminos
sobre la misma evidencia es exactamente lo que se arregló al desconectar el
evaluador de op.acc.1, y es peor que no migrar: como el hecho crudo ya no lleva
`estado`, la regla «latido sin incumplimientos ⇒ CUMPLE» de `score.py` daría la
evidencia por verde sin contrastar nada.

**2. Sin hecho crudo, `NO_EVALUABLE`.** Nunca CUMPLE por ausencia, y nunca
NO_CUMPLE por ausencia. Un agente viejo que aún no emita el hecho nuevo deja su
evidencia en gris —visible y honesto—, jamás en verde.

**3. Solo las dos primitivas de aserción NEGATIVA pueden convertir la ausencia
de hechos en CUMPLE**, y solo con cobertura `CONFIRMADA`. Las demás afirman algo
positivo sobre lo observado: sobre un conjunto vacío son ciertas en lógica y
falsas en una auditoría.

## Las primitivas

| Primitiva | CUMPLE si | Ausencia de hechos |
|---|---|---|
| `NINGUNO_EN_LISTA` | ningún hecho observado está en la lista **prohibida** | CUMPLE **solo** si la cobertura está confirmada |
| `TODOS_EN_LISTA` | todo hecho observado está en la lista **autorizada** | `NO_EVALUABLE` siempre |
| `NINGUNO_FUERA_DE_LISTA` | ningún **hallazgo** de un barrido queda fuera de la lista autorizada | CUMPLE **solo** si la cobertura está confirmada |
| `UMBRAL_MAXIMO` | ningún valor observado supera el del parámetro | `NO_EVALUABLE` siempre |
| `UMBRAL_MINIMO` | ningún valor observado queda por debajo | `NO_EVALUABLE` siempre |
| `ANTIGUEDAD_MAXIMA` | el hecho más reciente no es más viejo que el plazo | `NO_EVALUABLE` siempre |
| `CONFORME_A_TABLA` | cada hecho casa con **su fila** de la tabla, columna a columna | `NO_EVALUABLE` siempre |

Implementación en `dashboard/ens/core/evidence/judgment.ts`.

**Qué primitiva le toca a tu evidencia, qué hecho crudo tiene que emitir y contra
qué parámetro se juzga: [`PRIMITIVAS_DE_JUICIO.md`](PRIMITIVAS_DE_JUICIO.md)**,
que lo dice para las 22 y explica cuáles no se pueden migrar y por qué. **No
elijas primitiva sin mirarlo**: dos de las siete comparan exactamente igual y se
diferencian solo en si el silencio puede ser CUMPLE, que es la decisión que
distingue una evidencia honesta de un falso verde.

### Si tu evidencia apunta a un parámetro de tipo `table`

Declara también **`parameterColumn`** con la columna que se compara (P-07 de
op.acc.1 es `usuario | sistema | rol`, y lo que se contrasta con una cuenta
activa es `usuario`). Sin ella el juicio sale `NO_EVALUABLE` con motivo: comparar
la fila entera contra un valor suelto no encuentra nunca nada.

En `CONFORME_A_TABLA` se declara en su lugar `tableKeyColumn`, `factKeyField` y
`tableChecks` (una entrada por eje contrastado, con la columna de la política y
el campo del hecho, que se llaman distinto a propósito: uno dice lo que se
**decidió** y el otro lo que se **observó**).

## La receta

### 1. Elegir la evidencia

Empieza por las que **dependen de un parámetro**: son donde la pantalla miente
hoy. Una evidencia cuyo veredicto no dependa de ningún parámetro configurable no
gana nada con migrar.

### 2. Diseñar el hecho crudo

El agente describe **lo que observó**, no lo que concluye. Dos trampas:

- **El nombre del evento no puede incorporar el veredicto.** EV-03 emitía
  `generic_account_login` y `auth_success` como eventos distintos: elegir entre
  los dos ya era juzgar. Ahora emite un solo `account_authenticated` con el
  usuario, y quién decide si eso está bien es el motor.
- **Sin `estado` y sin `nivel`.** El veredicto es del motor; el nivel lo sabe el
  catálogo.

```json
{"ensfacil":"op.acc.1","ts":"…","host":"…","event":"account_authenticated",
 "evidence_id":"EV-03","requisito":"op.acc.1.1","usuario":"admin","origen":"10.0.0.55"}
```

### 3. Regla para el hecho crudo

Rule ID de la banda reservada a hechos crudos del control (op.acc.1:
**106873-106889**), nivel bajo, y **sin `cumple` / `no_cumple` /
`non_conformity` en el `<group>`**: un hecho técnico no es una no conformidad, y
etiquetarlo así devuelve el veredicto al manager.

Se escribe en `agent/rules/` (canónica) **y** en `manager/` del runbook (lo
desplegado). `tests/check-coherencia.py` verifica que no divergen.

### 4. Declarar `judgment` en el catálogo

En `core/evidence/catalog.ts`:

```ts
judgment: {
  primitive: 'NINGUNO_EN_LISTA',
  parameterId: 'P-04',              // el `id`, no el `name`
  factEventTypes: [
    'account_authenticated',        // el hecho nuevo
    'generic_account_login',        // los nombres viejos, a propósito
    'auth_success',
  ],
  factField: 'usuario',
},
```

**Incluye los nombres de evento viejos, PERO solo si entre todos cubren la misma
población que el hecho nuevo.** Lo que se descarta del modelo viejo es el
`estado`, que este camino no lee en ningún punto; el hecho sigue siendo
utilizable, y así la migración no deja ciega a la evidencia sobre los datos ya
indexados —que pasan a juzgarse con el parámetro de **hoy** en vez de con el
`.env` de aquel día—.

La condición no es un detalle. El modelo viejo solía emitir DOS nombres, uno por
veredicto, y entre los dos cubrían todo lo observado: EV-03 emitía
`generic_account_login` y `auth_success`, EV-05 `service_account_interactive` e
`interactive_login`. Readmitir los dos es seguro. Pero cuando el nombre viejo
solo se emitía para los INFRACTORES —`unauthorized_user` en EV-07— readmitirlo
juzga la evidencia sobre una muestra sesgada: `TODOS_EN_LISTA` diría «todas las
cuentas observadas están autorizadas» en cuanto la única observada resultara
estar hoy en la lista, con las otras cuarenta sin mirar. **Es la forma de falso
verde que esta migración estuvo más cerca de producir.**

Y un agregado sin el campo que se lee (`authorized_list_check` no trae
`usuario`) tampoco entra: dejaría la evidencia en `NO_EVALUABLE` permanente por
hechos ilegibles.

### 4 bis. ¿Ya lo emite otra evidencia? Entonces no inventes un hecho

**El caso más barato de todos, y hasta hoy el más frecuente: el hecho ya existe,
lo emite otra evidencia, y basta con etiquetarlo también con la tuya.** Dos
evidencias pueden preguntar cosas distintas sobre la misma observación:

| Hecho | Regla | Evidencias | Cada una lo contrasta con |
|---|---|---|---|
| `account_authenticated` | 106873 | op.acc.1 EV-03 y EV-05 | P-04 (genéricas) / P-03 (servicio) |
| `account_active` | 106811 | op.acc.1 EV-01 y EV-07 | — (EV-01 es clásica) / columna *usuario* de P-07 |

El agente emite **un solo evento** con `evidence_id=EV-03,EV-05`, y
`normalizeWazuhAlerts` lo reparte en uno por evidencia. No es un patrón nuevo:
106609 de mp.info.6 lleva `evidencia=EV-03,EV-07` desde antes de este modelo.

Emitirlo dos veces —una por evidencia, como hacía el clásico— es lo que
permitía que las dos copias de la misma línea de log acabaran discrepando.

**Qué hay que revisar al hacerlo**, y son cuatro cosas concretas:

1. **Todo lo que lea `evidence_id` tiene que partir por comas.** El plugin ya lo
   hace (`getEvidenceIds`); en el agente hay que mirar `score.py`, el recuento
   `evidencias_emitidas` del orquestador y el del simulador. Sin eso, el par
   cuenta como UNA evidencia con un nombre que no existe.
2. **La regla declara las dos evidencias** en su `<group>` y su `<info>`.
3. **La población tiene que ser la misma para las dos.** Si tu evidencia solo
   necesita un subconjunto de lo que la otra observa, el hecho compartido no
   vale: estarías juzgando sobre una muestra que no es la tuya. Es la misma
   condición del paso 4 sobre los nombres viejos, por otra vía.
4. **El `estado` del hecho es de la otra evidencia, no tuya.** `account_active`
   lleva `estado=CUMPLE` porque EV-01 sigue en el modelo clásico; el camino de
   `judgeEvidence` no lo lee, y por eso conviven sin estorbarse. Escríbelo en el
   comentario de la regla, o el siguiente que la lea pensará que el veredicto
   sigue en el agente.

### 5. Cortar el `evidence_state` en los cuatro sitios

Recolector, `score.py`, watchdog y simulador. Ver regla 1.

Si el requisito lo acreditaba **solo** esa evidencia, sale del denominador del
score del agente (`REQ_DELEGADOS`), como un `NO_APLICA`. Dejarlo dentro como
`NO_EVALUABLE` pondría el score en PARCIAL permanente en toda máquina sana sin
un solo hallazgo real: un NO_CUMPLE falso, que el principio prohíbe igual que el
CUMPLE falso. Se declara donde se ve: `delegadas`/`motivo` en su `control_state`
y `requisitos_delegados` en cada `score_snapshot`.

### 6. El simulador tiene que emitir el hecho nuevo

En **todos** sus escenarios. Si no, la demo del servidor fake deja de enseñar esa
evidencia, y esa demo es la que se le enseña al auditor.

### 7. Retirar el parámetro del `.env`

Un parámetro editable y sin efecto es peor que no tenerlo: es la incoherencia de
los dos almacenes con el agravante de que el valor local ya no hace nada.
Retíralo, y que el recolector emita un `collector_warning` si lo encuentra
definido en un despliegue viejo (`install-real.sh` nunca pisa un `.env`
existente) y haga `unset` para que nadie lo lea por accidente.

### 8. La cobertura del recolector

`resolveCollectorCoverage` decide si la ausencia de hechos puede ser CUMPLE:

| | |
|---|---|
| `CONFIRMADA` | el latido declara `resultado=completada` **y** la evidencia figura en `evidencias_cubiertas` |
| `AUSENTE` | el latido declara un fallo |
| `DESCONOCIDA` | no hay latido, o no declara resultado, o no declara qué llegó a mirar |

Un latido que no declara qué miró no demuestra cobertura: demuestra que el
agente es más viejo que el contrato. Y la ventana tiene **cota superior** además
de inferior (ahora + 5 min de tolerancia de reloj): sin ella, un latido fechado
en 2099 valdría como latido perpetuo y dejaría en verde para siempre cualquier
aserción negativa con el agente apagado.

`evidencias_cubiertas` no es lo mismo que "evidencias que emitieron algo": una
evidencia puede callar legítimamente —no hubo autenticaciones— y ese silencio es
justo el caso que puede ser CUMPLE. Lo que decide es si la fuente **se pudo
leer**.

**Y no toda evidencia migrada entra en la lista.** Se lista la que cumple las
DOS condiciones: esta pasada comprobó su fuente, y su primitiva puede convertir
el silencio en CUMPLE (solo las dos de aserción negativa). EV-07 está migrada y
NO se lista, porque `TODOS_EN_LISTA` no cumple por ausencia nunca: declarar su
cobertura sería afirmar algo cierto y sin efecto, y el día que alguien cambiara
la primitiva pasaría a tener efecto sin que nadie lo revisara.

### 9. Verificar

La prueba de aceptación de toda la migración:

> **Cambiar el parámetro en la pantalla cambia el veredicto de la evidencia,
> sin tocar el agente.**

Demuéstralo con el mismo objeto de eventos en las tres evaluaciones:

```
P-04 por defecto · jgomez no está en la lista        → CUMPLE
se añade jgomez a P-04 · MISMO evento del agente     → NO_CUMPLE
el motivo nombra la cuenta, no dice «algo falló»
se quita jgomez de P-04                              → vuelve a CUMPLE
```

Y comprueba que `python3 tests/check-coherencia.py` sigue en `coherencia OK`.

## Estado de la migración

| Control | Evidencia | Estado |
|---|---|---|
| `op.acc.1` | EV-03 | **migrada** — `account_authenticated`, regla 106873, P-04 |
| `op.acc.1` | EV-05 | **migrada** — el MISMO hecho de EV-03, P-03 |
| `op.acc.1` | EV-07 | **migrada** — `account_active` de EV-01, regla 106811, columna *usuario* de P-07 |
| resto | 19 evidencias | modelo clásico |

Las tres migradas hasta hoy **no han necesitado ni un hecho nuevo**: dos
comparten el de EV-03 y una el de EV-01. Es lo esperable y lo deseable —el
agente ya observa casi todo lo que hace falta; lo que sobraba era el veredicto—
y explica por qué la banda de reglas reservada a hechos crudos (106873-106889)
sigue teniendo una sola regla.

**Son 22.** El catálogo (`core/evidence/catalog.ts`) tiene 7 de mp.info.6, 8 de
op.acc.1 y 7 de op.acc.2. De las 19 que quedan, **12 se pueden migrar** con las
siete primitivas y 7 no: el porqué de cada una está en
[`PRIMITIVAS_DE_JUICIO.md`](PRIMITIVAS_DE_JUICIO.md).

Cuando estén las migrables, `op-acc-1.evaluator.ts` deja de tener sentido como
punto de partida y se puede retirar.
