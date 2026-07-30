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

- `data-source-engine.ts` traduce a mano `offsite_ok → offsite_success`: un caso
  especial de un control cableado en un fichero compartido.
- `*_missing` no tiene estado consistente entre reglas: 106601 lo declara
  `NO_CUMPLE`, 106606 `NO_EVALUABLE`.
- mp.info.6 declara 14 tipos de evento que ninguna regla emite, y 5 eventos
  reales que ninguna evidencia escucha.
- Ninguno de los tres repos tiene desinstalador.
- Conviven dos recolectores para op.acc.1: el de `main` (hechos crudos) y el del
  runbook (modelo clásico). El desplegado es el del runbook.

## Fases

### Fase 1 — Coherencia de parámetros *(bloqueante)*

Sin esto, la pantalla de Configuración le miente al auditor: le deja creer que
ajusta el control cuando no ajusta nada.

1. **`inject-control.py` deja de pisar valores.** Fusiona: conserva los valores
   existentes y solo añade parámetros nuevos. `--sustituir` explícito para el
   comportamiento actual.
2. **Manda el plugin. Decidido (30/07).** Los agentes solo emiten datos; el
   manager los interpreta al completo.

   Esa frase es literalmente el modelo de la fase 6, así que la implementación
   de esta fase hay que elegirla sabiendo eso:

   - *Distribuir el `.env` desde el índice*: el manager genera el fichero de
     parámetros de cada agente y lo reparte por grupo. Funciona con el modelo
     actual y es rápido, pero **es trabajo que la fase 6 tira entero**: cuando
     el motor juzgue, ningún agente necesitará parámetros.
   - *Adelantar el juicio de las evidencias que dependen de parámetros*: el
     agente emite el hecho crudo (`cuenta_generica_detectada: operador`) además
     de su `evidence_state`, y el motor decide esa evidencia contrastando con
     el parámetro del índice. **Evidencia a evidencia, sin reescribir los tres
     agentes de golpe**, y cada una que se migra deja de depender del `.env`.

   Recomendación: la segunda. Es la fase 6 hecha por partes, empezando por
   donde más duele hoy —la pantalla que promete ajustar y no ajusta— y sin
   construir un repartidor de ficheros que luego hay que retirar.
3. **Que "configurado" signifique algo.** Hoy basta con que el campo no esté
   vacío. Un `umask_minimo` de `abc` cuenta como configurado.

### Fase 2 — Huecos de reglas *(los tres a la vez)*

4. Reglas para `control_state` y `score_snapshot` con `NO_EVALUABLE`.
5. Regla de "sistema del alcance que deja de reportar", con su ventana.
6. Unificar el estado de `*_missing` entre 106601 y 106606.
7. Retirar el caso especial `offsite_ok → offsite_success` del fichero
   compartido, renombrando en origen.
8. mp.info.6: reconciliar los 14 tipos declarados sin regla y los 5 eventos sin
   evidencia.

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
