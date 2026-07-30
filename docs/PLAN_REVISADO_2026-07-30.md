# Plan revisado — 30 de julio de 2026

> **SUPERADO por [`PLAN_ACCION_2026-07-30.md`](PLAN_ACCION_2026-07-30.md)
> (misma fecha, más tarde).** Este documento planteaba la decisión de
> arquitectura como una elección abierta entre tres opciones. La decisión ya
> está tomada e implementada —opción C, un solo modelo clásico para los tres
> controles, `3e92f5c`— y las fases que propone abajo ya no son las que quedan.
> Se conserva porque documenta cómo se descubrió el problema y por qué.

Sustituye la planificación por fases anterior. Se escribe después de desplegar
por primera vez en un servidor real y descubrir que el punto de partida era
incorrecto.

## Qué se sabe ahora que no se sabía

El proyecto no tiene dos arquitecturas compitiendo. Tiene **una migración a
medias**:

| Control | Modelo | Estado |
|---|---|---|
| `mp.info.6` | Clásico: el agente emite `evidence_state`, el motor consolida | Sin migrar |
| `op.acc.1` | Nuevo: el agente emite hechos crudos, `op-acc-1.evaluator.ts` juzga | **Migrado a medias** |
| `op.acc.2` | Clásico | Sin migrar |

El modelo nuevo entró en `main` el 28/07 (`4726088`): un recolector de 3.881
líneas y un evaluador de 2.491, solo para op.acc.1. El emisor de ese modelo
**rechaza activamente** eventos con `estado` o `nivel`.

El runbook construido el 29-30/07 implementa op.acc.1 con el **modelo clásico**,
porque la decisión de arquitectura se tomó sin verificar qué había desplegado.
Es un fallo de método: se ofreció una elección sobre una premisa no comprobada.

Consecuencia observada en el despliegue: op.acc.2 funciona de punta a punta
(83 %, evidencias, trazabilidad, no conformidades) y op.acc.1 muestra sus
evidencias pero no puede calcular el veredicto, porque su evaluador no reconoce
el vocabulario de eventos que emite el runbook.

## La decisión que bloquea todo lo demás

**Un solo modelo para los tres controles.** Mientras convivan dos, cada control
nuevo hereda la ambigüedad y cada despliegue descubre una sorpresa distinta.

### Opción A — Completar la migración al modelo nuevo

Los tres controles emiten hechos crudos; el motor juzga.

- **A favor:** es la dirección ya iniciada. Alinea con el principio del producto
  —el juicio lo toma el motor determinista, no el agente—. Un solo sitio donde
  se decide el semáforo, más fácil de auditar.
- **En contra:** hay que escribir un evaluador por control. El de op.acc.1 son
  2.491 líneas. Multiplicado por tres controles es el grueso del trabajo
  restante, y deja el runbook de op.acc.1 a medio reutilizar.

### Opción B — Revertir al modelo clásico

Los tres controles emiten `evidence_state`; el motor consolida.

- **A favor:** funciona hoy para dos de los tres. El runbook de op.acc.1 encaja
  sin tocarlo. Es la vía más corta a tener los tres controles coherentes.
- **En contra:** el juicio vive en el agente, repartido entre `score.py` de cada
  control. Cambiar una regla de evaluación obliga a tocar todos los agentes
  desplegados en vez de recompilar el plugin.

### Opción C — Modelo clásico ahora, migración ordenada después

Unificar en clásico para cerrar el ciclo, y planificar la migración al modelo
nuevo como proyecto propio, con los tres controles a la vez.

**Recomendación: C.** El modelo nuevo es mejor, pero migrar a mitad de camino es
justo lo que ha causado el problema de hoy. Primero coherencia, luego mejora.

Esta decisión es del responsable del producto, no técnica.

## Fases revisadas

### Fase 0 bis — Auditoría de lo desplegado *(bloqueante, ~1 sesión)*

La auditoría anterior se hizo sobre la rama `coherencia-estructura-controles`,
que no es lo desplegado. Hay que repetirla sobre `main`.

1. Inventario real: qué modelo sigue cada control, qué evalúa cada policy, qué
   consume cada evaluador.
2. Mapa de rule IDs sobre `main` (32 simbólicos frente a 14 numéricos).
3. Contrato de eventos por control: qué emite cada agente y qué espera el motor.
4. Qué del refactor sin fusionar merece rescatarse.

### Fase 1 bis — Coherencia de op.acc.1 *(depende de la decisión)*

Con opción B o C: adaptar el evaluador para que consuma `evidence_state`, o
retirarlo y dejar que op.acc.1 caiga al rollup como op.acc.2. Es el cambio más
pequeño que pone los tres controles a funcionar igual.

Con opción A: adaptar el runbook para emitir el vocabulario y el envoltorio que
el evaluador espera (`event_class`, `synthetic`, `execution_id`, `collector`), y
retirar `score.py` y `watchdog.py`.

En ambos casos hay que decidir qué pasa con `ens_op_acc1_audit.py`: conviven dos
recolectores para el mismo control.

### Fase 2 — Recolectores reales de op.acc.2 *(15 tareas, planificadas)*

El plan está escrito y su Task 1 implementada y revisada. **No continuar hasta
cerrar la fase 1 bis**: sus 14 tareas restantes se construirían sobre el mismo
supuesto que falló hoy.

### Fase 3 — Trazabilidad y parámetros del plugin

- Rule IDs reales en los tres puntos de verdad.
- Que los parámetros configurables afecten al veredicto.
- Corregir el desajuste de tipo de P-04 (declarado lista, leído como booleano).

### Fase 4 — Despliegue real

op.acc.1 y op.acc.2 en el servidor real, con los parámetros ajustados sobre la
máquina del cliente.

### Fase 5 — mp.info.6

Retrofit a la estructura común. Su README está roto —títulos que no coinciden
con las rutas ni con el código— y dos scripts son Python en ficheros `.sh` sin
shebang, que desde cron no arrancan. Hay un compañero que va a tirar de ese
repo.

## Qué sobrevive del trabajo del 29-30 de julio

Independientemente de la decisión de arquitectura:

- **op.acc.2 completo y funcionando**: simulador, reglas, despliegue verificado.
- **Los recolectores de op.acc.1**: leer `passwd`, `shadow`, `group` y el log de
  autenticación, con sus guardas de plausibilidad. Sirven con cualquier modelo;
  lo que cambia es qué se hace con lo leído.
- **Reglas, instaladores, documentación y procedimiento de despliegue.**
- **Las doce clases de fallo encontradas en revisión**, que son el activo más
  reutilizable: fuente legible pero vacía, ventana sin cota superior, marcador
  que degrada al lado inseguro, filtro y extracción desalineados, registro de
  intento confundido con registro de hecho, y la simetría del principio rector
  —ni CUMPLE ni NO_CUMPLE sin datos—.

## Qué no volver a hacer

**Verificar lo desplegado antes de planificar.** Esta es la lección cara del
proyecto. Un plan bien ejecutado sobre una premisa no comprobada produce trabajo
correcto que no encaja. Antes de la primera decisión de arquitectura de
cualquier fase:

1. Mirar qué hay corriendo en el servidor.
2. Comprobar que la copia local coincide con lo desplegado.
3. Contrastar la rama de trabajo con `main`.
