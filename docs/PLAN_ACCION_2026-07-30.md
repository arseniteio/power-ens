# Plan de acción — 30 de julio de 2026

Sustituye a `PLAN_REVISADO_2026-07-30.md`, que se escribió por la mañana, antes
de arreglar la incoherencia de evaluación y antes de auditar los tres controles
contra `main`. Aquel planteaba una decisión de arquitectura; ésta ya está tomada
e implementada, y lo que queda es distinto.

## Dónde estamos (verificado, no supuesto)

Los tres controles siguen **un solo modelo**: el agente emite `evidence_state`
con su `estado`, y el motor consolida. `op-acc-1.evaluator.ts` sigue en el repo
pero desconectado (`3e92f5c`).

| Control | Simulador | Recolectores reales | En el plugin |
|---|---|---|---|
| `mp.info.6` | sí (nuevo) | sí (los hizo un compañero) | evidencias, trazabilidad |
| `op.acc.1` | sí | sí, 8 evidencias | evidencias, trazabilidad, no conformidades |
| `op.acc.2` | sí | **no** (1 de 15 tareas) | evidencias, trazabilidad, no conformidades |

Demo con evidencia simulada funcionando de punta a punta en el servidor fake.
Despliegue real: pendiente en los tres.

### Los repositorios, ya consistentes

Cuatro repos. Los tres runbooks tienen **la misma estructura y los mismos
nombres de script**, que es lo que permite desplegarlos igual:

```
Wazuh-ENS/                     el plugin (dashboard, reglas canónicas, config, docs)
<control>-runbook/
  install-manager.sh           reglas + agent.conf en el manager
  install-fake.sh              simulador (aborta ante el pipeline real)
  install-real.sh              pipeline real (retira el simulador)
  lib/  scripts/  fake/  etc/  manager/  tests/  docs/
```

Procedimiento único de despliegue: `docs/DESPLIEGUE_FAKES.md`.

Salvedad: `install-real.sh` de op.acc.2 falla a propósito —sus recolectores
reales no existen todavía (fase 3)— y el de mp.info.6 está anotado y pendiente
por decisión, porque lo despliega un compañero.

## Lo que se arregló hoy

| | |
|---|---|
| `3e92f5c` | Evaluador de op.acc.1 desconectado. Era el único control con uno: dos caminos de evaluación daban respuestas distintas sobre los mismos datos |
| `fe55749` | La ausencia de `estado` ya no produce CUMPLE. Estaba en **dos** sitios; el de `data-source-engine.ts` es el que actúa sobre los datos reales |
| `b2e94bf` | EV-01 y EV-05 de mp.info.6 no escuchaban `evidence_state`. Ya lo hacen las 22 evidencias de los tres controles |
| `e862cac` | El form-engine no tenía renderer de listas: los 9 parámetros de tipo lista se editaban como texto libre. Ésa es la causa real del incidente de P-04 |
| `d9545f0` | 85 rule IDs reales en los tres puntos de verdad; 10 huecos dejados vacíos y documentados en vez de inventados |
| runbooks | `install-fake.sh` / `install-real.sh` con el mismo nombre y contrato en los tres repos; asimetría deliberada documentada |
| mp.info.6 | Tres bugs de contrato que rompían la trazabilidad en silencio, incluido un CUMPLE de EV-05 **inalcanzable** porque 106651 no disparaba nunca |

## Lo que sigue roto

Ordenado por lo que más daña la capacidad de auditar.

### 1. Los parámetros de la UI no deciden nada (op.acc.1 y op.acc.2)

**Hay dos almacenes de parámetros y nadie los sincroniza.** El auditor edita en
la pestaña Configuración, que escribe en el índice `wazuh-ens-configuration`. El
agente decide el veredicto leyendo `/etc/ensfacil/opacc1.env` en cada máquina.
Verificado: en los runbooks no hay una sola referencia a
`wazuh-ens-configuration`.

Consecuencia: cambiar `cuentas_genericas_prohibidas` en la UI **no cambia lo que
el agente detecta**. La UI solo comprueba que el campo esté relleno, y con eso
decide si el control es evaluable (`NC-CFG`).

Y no es igual en los tres: mp.info.6 sí consume valores en el plugin (su runtime
los lee por nombre); op.acc.1 y op.acc.2 no. Tercera incoherencia entre
controles del mismo producto.

### 2. `inject-control.py` borra la configuración del cliente

Sustituye el bloque entero por la plantilla. Lo avisa por pantalla, pero un
script de despliegue que destruye datos del cliente **no puede depender de que
alguien lea el aviso**. Pasó hoy: se perdieron los valores puestos desde la UI y
op.acc.2 cayó de 83 % a 17 %.

### 3. Un nivel que no se puede evaluar no genera alerta

`control_state` y `score_snapshot` con estado `NO_EVALUABLE` **no tienen regla**
(106710-106713 y 106720-106722 solo cubren CUMPLE/PARCIAL/NO_CUMPLE/NO_APLICA).
Decodifica por la regla base, nivel 0, y no llega al índice. El hueco solo se ve
por la vía de `evidence_state`. Afecta a los tres.

### 4. Nadie detecta que un sistema del alcance deja de reportar

Ninguno de los tres controles tiene regla para eso. Un agente apagado es
indistinguible de un agente que no encuentra nada — que es exactamente la
diferencia entre `NO_EVALUABLE` y `CUMPLE`.

### 5. Deuda menor pero anotada

- ~~`data-source-engine.ts` traduce a mano `offsite_ok → offsite_success`~~
  **CERRADO 30/07**: la regla 106662 emite `offsite_success` en origen y la
  traducción cableada se ha retirado del fichero compartido.
- ~~`*_missing` no tiene estado consistente entre reglas: 106601 lo declara
  `NO_CUMPLE`, 106606 `NO_EVALUABLE`.~~ **CERRADO 30/07, y la asimetría se
  queda**: no era una incoherencia, eran dos hechos distintos. Una ausencia
  solo se declara `NO_CUMPLE` cuando el despliegue garantiza que, de haber
  ocurrido el hecho, se habría observado. De la copia el runbook es el
  **ejecutor** (`pxbackup.sh` la hace y emite la evidencia), así que la
  ausencia está medida; de la restauración es una **sonda opcional** dormida de
  fábrica, así que lo que falta es la medida. El razonamiento está escrito
  junto a las dos reglas en `agent/rules/ensfacil_mp_info_6_json_rules.xml`, y
  lo fija una prueba (`test_vocabulario.sh` §7 del runbook) que contrasta el
  `estado` que emite el agente con el `estado=` que declara la regla: el
  contraste que nadie hacía y por el que el desajuste sobrevivió.
- ~~mp.info.6 declara 14 tipos de evento que ninguna regla emite, y 5 eventos
  reales que ninguna evidencia escucha~~ **CERRADO 30/07**: los 14 retirados del
  catálogo y los 5 adoptados; `authorized_access`/`unauthorized_access` pasan a
  ser el evento `access` con su campo `authorized`, también en el runtime.
  `retention_configured` se retira sin sustituto porque no tiene productor: la
  decisión MIN_RETENTION sale NO_EVALUABLE hasta que lo tenga.
- Ninguno de los tres repos tiene desinstalador.
- Conviven dos recolectores para op.acc.1: el de `main` (hechos crudos) y el del
  runbook (modelo clásico). El desplegado es el del runbook.

## Fases

### Fase 1 — El plugin manda sobre los parámetros *(bloqueante, en curso)*

Sin esto, la pantalla de Configuración le miente al auditor: le deja creer que
ajusta el control cuando no ajusta nada.

**Decidido (30/07): manda el plugin.** Los agentes solo emiten datos; el manager
los interpreta al completo. Esa frase es literalmente el modelo de la fase 6, y
eso descarta la implementación obvia —generar el `.env` de cada agente desde el
índice y repartirlo— porque funciona hoy y la fase 6 la tira entera: cuando el
motor juzgue, ningún agente necesitará parámetros.

La vía elegida es **subir el juicio al motor evidencia a evidencia**, en los tres
controles a la vez, empezando por las que dependen de parámetros. Cada evidencia
migrada deja de depender del `.env` del agente. Es la fase 6 hecha por partes.

**Invariante que ninguna tarea puede romper:** si el motor no recibe el hecho
crudo, la evidencia sale `NO_EVALUABLE`. Nunca CUMPLE por ausencia, y nunca
NO_CUMPLE por ausencia. Un agente viejo que aún no emita el hecho nuevo dejará
su evidencia en gris — visible y honesto — jamás en verde.

---

**T1.1 · `inject-control.py` fusiona en vez de sustituir**

`config/inject-control.py:106-107` reemplaza la lista de controles entera, así
que los valores puestos desde la UI se pierden. Pasó el 30/07: op.acc.2 cayó de
83 % a 17 %.

Conservar el `value` de cada parámetro que ya existiera, añadir los nuevos, y
avisar de los que desaparecen del bloque. `--sustituir` explícito para el
comportamiento destructivo actual. Informe por pantalla de qué se conserva, qué
se añade y qué se retira.

*Acceptance:* ejecutarlo dos veces seguidas sobre un control con valores puestos
no cambia ni un valor. Con `--sustituir`, sí.

---

**T1.2 · Primitivas de juicio declarativas en el motor**

Hoy no hay dónde poner "el motor decide esta evidencia". El sitio que había era
el evaluador por control, y tener uno solo en op.acc.1 es lo que rompió la
coherencia el 30/07. **No se reintroduce un evaluador por control.**

Un conjunto pequeño de primitivas declarativas, iguales para los tres controles,
declaradas en el catálogo de evidencias junto al parámetro del que dependen:

| Primitiva | Juicio |
|---|---|
| `NINGUNO_EN_LISTA` | CUMPLE si ningún hecho observado está en la lista del parámetro |
| `TODOS_EN_LISTA` | CUMPLE si todo hecho observado está en la lista |
| `UMBRAL_MAXIMO` | CUMPLE si el valor observado no supera el del parámetro |

Sin hecho observado → `NO_EVALUABLE`. Sin parámetro configurado →
`NO_EVALUABLE` con motivo, nunca un veredicto.

*Acceptance:* las tres primitivas con pruebas de los cuatro casos (hecho y
parámetro; hecho sin parámetro; parámetro sin hecho; ninguno de los dos).

---

**T1.3 · Piloto: EV-03 de op.acc.1 juzgada por el motor con P-04**

`cuentas_genericas_prohibidas` es el parámetro del incidente, el que más
claramente debe mandar desde la pantalla, y su evidencia es de las más simples.

- El agente emite el **hecho crudo**: qué cuentas se han autenticado en la
  ventana, sin juzgar. Mantiene su `collector_run`, que es lo que distingue
  "he mirado y no hay nada" de "no he podido mirar".
- El agente **deja de emitir `evidence_state` para EV-03**. Corte limpio: dos
  caminos sobre la misma evidencia es justo lo que se arregló hoy.
- El motor juzga EV-03 con `NINGUNO_EN_LISTA` contra P-04.

*Acceptance:* cambiar P-04 en la UI cambia el veredicto de EV-03 sin tocar el
agente. Es la prueba de que la pantalla ha dejado de mentir.

---

**T1.4 · "Configurado" pasa a significar "válido"**

Hoy basta con que el campo no esté vacío: un `umask_minimo` de `abc` cuenta como
configurado y el control se declara evaluable. Validar por tipo (`duration_days`
entero no negativo, `umask` tres octales, `path` absoluta, `list` no vacía) en el
guardado y en la evaluación.

*Acceptance:* un valor inválido deja la evidencia en `NO_EVALUABLE` con el
motivo, no en un veredicto.

---

**T1.5 · Contrato documentado y receta para la siguiente evidencia**

Qué emite el agente, qué juzga el motor, cómo se declara una primitiva y cómo se
migra la siguiente evidencia. Sin esto, la migración por partes se queda en el
piloto.

### Fase 2 — Huecos de reglas *(los tres a la vez)*

4. Reglas para `control_state` y `score_snapshot` con `NO_EVALUABLE`.
5. Regla de "sistema del alcance que deja de reportar", con su ventana.
6. ~~Unificar el estado de `*_missing` entre 106601 y 106606.~~ **HECHO
   (30/07), y la respuesta fue NO unificar.** Unificar en `NO_CUMPLE`
   reintroduce el falso incumplimiento contra toda máquina de fábrica;
   unificar en `NO_EVALUABLE` convierte "esta máquina no tiene copias" en un
   hueco de cobertura. Ver el §5 de arriba y el comentario de 106601.
7. ~~Retirar el caso especial `offsite_ok → offsite_success` del fichero
   compartido, renombrando en origen.~~ **HECHO (30/07).**
8. ~~mp.info.6: reconciliar los 14 tipos declarados sin regla y los 5 eventos sin
   evidencia.~~ **HECHO (30/07).** Verificado midiendo: sobre 4.536 evaluaciones
   del motor, ninguna cambia de veredicto cuando los eventos son de los que el
   pipeline desplegado puede emitir.

### Fase 3 — Recolectores reales de op.acc.2

14 de 15 tareas. El plan está escrito y su Task 1 revisada. Ahora sí se puede
continuar: se construía sobre un supuesto de arquitectura que hoy está resuelto.

### Fase 4 — Despliegue real

9. Desinstalador en los tres repos.
10. op.acc.1 y op.acc.2 en el servidor del cliente, con parámetros ajustados
    sobre su máquina.
11. Decidir qué pasa con `ens_op_acc1_audit.py`: dos recolectores para el mismo
    control es una bomba de relojería en cuanto alguien despliegue el otro.

### Fase 5 — mp.info.6 real

Lo despliega un compañero tirando del repo. Falta su `install-real.sh` (anotado
y pendiente, por decisión) y la nota de migración de nombres de campo.

### Fase 6 — Migración al modelo nuevo *(la dirección, decidida)*

El agente observa, el motor juzga. `op-acc-1.evaluator.ts` son 2.491 líneas que
ya lo implementan y es el punto de partida.

Deja de ser opcional: el 30/07 se decidió que los agentes solo emiten datos y el
manager los interpreta al completo. Hoy no es así —`score.py` calcula el
`estado` dentro de cada agente— y esa es la brecha que cierra esta fase.

**Los tres controles a la vez, o evidencia a evidencia en los tres a la vez.**
Lo que no se puede repetir es migrar un control de tres, que es lo que causó el
problema del 30/07. La vía incremental de la fase 1 (punto 2) es la entrada
natural: cada evidencia cuyo juicio sube al motor es una menos que depende del
`.env` del agente.

## Método — lo que no volver a hacer

1. **Verificar lo desplegado antes de planificar.** Un plan bien ejecutado sobre
   una premisa no comprobada produce trabajo correcto que no encaja.
2. **No inventar el dato de prueba.** El evento de verificación con
   `wazuh-logtest` se escribió a mano en vez de copiarlo de un evento real
   emitido; llevaba `ensfacil: true` cuando la regla base exige el id del
   control. Media hora buscando un fallo que no existía.
3. **Un script que puede destruir datos del cliente no avisa: pregunta.** El
   aviso por pantalla no evitó la pérdida.
4. **Una asimetría deliberada se documenta donde está el código**, con el
   razonamiento, o alguien la "arregla" a simetría en seis meses.
