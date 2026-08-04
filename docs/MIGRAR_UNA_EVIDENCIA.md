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

**Incluye los nombres de evento viejos.** Lo que se descarta del modelo viejo es
el `estado`, que este camino no lee en ningún punto; el hecho sigue siendo
utilizable. Así la migración no deja ciega a la evidencia sobre los datos ya
indexados, y esos datos pasan a juzgarse con el parámetro de **hoy** en vez de
con el `.env` de aquel día.

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
| `op.acc.1` | EV-03 | **migrada** — hecho `account_authenticated`, regla 106873, parámetro P-04 |
| resto | 21 evidencias | modelo clásico |

**Son 22, no 24.** El catálogo (`core/evidence/catalog.ts`) tiene 7 de
mp.info.6, 8 de op.acc.1 y 7 de op.acc.2; este documento decía 23 restantes y
`CLAUDE.md` lo repite. De las 21 que quedan, **14 se pueden migrar** con las
siete primitivas y 7 no: el porqué de cada una está en
[`PRIMITIVAS_DE_JUICIO.md`](PRIMITIVAS_DE_JUICIO.md).

Cuando estén las migrables, `op-acc-1.evaluator.ts` deja de tener sentido como
punto de partida y se puede retirar.
