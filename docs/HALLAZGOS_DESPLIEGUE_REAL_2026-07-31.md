# Hallazgos del primer despliegue real — 31 de julio de 2026

Primera vez que el pipeline real de `op.acc.1` y `op.acc.2` corre fuera de un
contenedor. Máquina: `wazuh-real`, Ubuntu 24.04.4, `audit 3.1.2`, agente 024.

Todo lo anterior estaba probado en Docker sobre 24.04 y 20.04 —unas 3.000
aserciones entre los cuatro repos, cada comportamiento verificado por
reversión—. Los cinco hallazgos de abajo **no eran alcanzables desde ahí**, y
por eso este documento existe: para que la próxima vez se busquen antes.

## Lo que sí funcionó a la primera

- **La cadena de trazabilidad, entera y sobre datos reales.**
  `op.acc.2 NO_CUMPLE → EV-01 → regla 106903 → umask_check` con
  `umask_real: "022"`, `umask_min: "027"`, `fuente: "/etc/login.defs"`.
  Un auditor recorre desde el semáforo hasta el fichero que lo causa.
- **El fixture reconstruido de `auditctl -l` coincidía con la realidad.** Se
  había marcado como no validable en contenedor (el kernel de Docker Desktop no
  tiene soporte de auditoría ni con `--privileged`). El formato real es
  `-F key=ensfacil_opacc2`, que es lo que el fixture suponía, y la comparación
  por palabra completa distingue correctamente `ensfacil_opacc2` de
  `ensfacil_opacc2_obj`.
- **Los instaladores**, incluida la asimetría y el aviso de auditd.
- **Los motivos nombran el fichero exacto que falta**, no un genérico.

## Los cinco hallazgos

### 1. `collector_run` no llega al índice · CRÍTICO

**Síntoma.** EV-03 de op.acc.1 sale `NO_EVALUABLE` en una máquina sana, con
motivo *"Cobertura del recolector: DESCONOCIDA. No consta ningún evento de
recolector (collector_run) para EV-03"*. El agente **sí lo emite**, con
`resultado: completada` y `evidencias_cubiertas: "EV-03,EV-05,EV-06"`.

**Causa.** `collector_run` no tiene regla de Wazuh: cae en la regla base
(`level="0"`), no genera alerta y nunca llega al índice.

**Por qué es instructivo.** Son **dos decisiones correctas por separado** que
juntas producen un fallo:

1. *"`collector_run` no necesita regla: sería ruido, `score_snapshot` ya late con
   la misma cadencia y expresa lo mismo."* Razonado por extenso en el XML de
   op.acc.1. Correcto **para el modelo clásico**.
2. *"El motor decide EV-03 mirando `collector_run` para saber si la ausencia de
   hechos puede significar CUMPLE."* Introducido al migrar EV-03
   (`6822436`). Correcto **para el modelo nuevo**.

Ninguna prueba unitaria puede cazar esto, porque cada mitad está bien. Solo
aparece al mirar el sistema entero funcionando.

**Lección.** Cuando un evento cambia de ser diagnóstico a ser **load-bearing**
para una decisión del motor, hay que revisar todas las decisiones tomadas
sobre él con el rol anterior — empezando por si llega al índice.

### 2. El motor del plugin acusa por lo que no ha medido · CRÍTICO

**Síntoma.** op.acc.1 en el dashboard: **PARCIAL 38 %, 4 no conformidades
abiertas**. Las cuatro evidencias citadas están en `NO_EVALUABLE`, no en
`NO_CUMPLE`. La máquina no incumple nada: son parámetros del cliente sin
configurar.

**Causa.** El principio *"un hueco de medida no puede fabricar un
incumplimiento"* se implementó el 30/07 en los tres agentes (`63ac3bc`,
`706f04c`, `26b4dd5`) y **no en el motor del plugin**, que recalcula por su
cuenta desde las evidencias e ignora el `score_snapshot` del agente.

**Lección.** Un criterio de producto se aplica en **todas** las capas que lo
evalúan, y en este producto son dos: el agente y el motor. Arreglar una sola
las hace divergir, que es el problema que este proyecto lleva una semana
corrigiendo en otros sitios.

### 3. Los registros de `CONFIG_CHANGE` no son accesos

**Síntoma.** Primera pasada tras cargar las reglas:

```
collector_warning · "40 registro(s) de la clave ensfacil_opacc2 traen
success=yes y no son denegaciones; revisa las reglas de /etc/audit/rules.d"
```

**Causa.** Al cargar las reglas, auditd escribe un `type=CONFIG_CHANGE
op=add_rule` por cada una, y **cada uno lleva la clave de la regla que se estaba
añadiendo**, así que `ausearch -k` los devuelve. La `key` de la línea
`type=SYSCALL` es `(null)`; la nuestra aparece solo en el `CONFIG_CHANGE`. La
syscall es `sendto` — `auditctl` hablando con el kernel por netlink.
Exactamente 40 registros para 40 reglas cargadas.

**Qué funcionó.** El recolector **no** los emitió como `access_denied`. Habría
fabricado 40 no conformidades sobre una máquina limpia.

**Qué falló.** El diagnóstico: el mensaje culpa a las reglas, que están bien. Y
se repetirá en cada instalación o recarga.

### 4. Un motivo que describe la pasada anterior

**Síntoma.** El operador promueve la línea base de SUID como le pide el mensaje,
relanza el recolector, y EV-07 **repite el mismo motivo** diciendo que falta.
Forzando el barrido (borrando `barrido.marca`), pasa a `CUMPLE`.

**Causa.** El barrido tiene cadencia —correcto: un `find /` horario sobre la
máquina del cliente es lo que la regla vinculante 15 prohíbe— pero al saltárselo
la evidencia reemite el resultado anterior **con su motivo anterior**.

**Por qué importa.** No es inseguro (el estado es `NO_EVALUABLE`, el lado
seguro) pero engaña justo cuando alguien está configurando el control: hace lo
que el mensaje pide y el mensaje no cambia.

### 5. `umask` 022 frente a 027 — no es un fallo, es una decisión

La máquina tiene `umask 022` (el defecto de Ubuntu) y el parámetro
`umask_minimo` está en `027`, que es el valor de la plantilla. La no conformidad
es **correcta y real**: la política declarada exige más de lo que la máquina
hace.

Las dos salidas son legítimas —apretar el umask, o declarar 022 como política—
pero **no se cambia el parámetro solo para que se ponga verde**: es una
declaración de qué exige la organización, y un auditor puede preguntar por ella.

Queda anotado porque el valor por defecto de la plantilla determina la primera
foto de todo cliente nuevo, y conviene que sea una decisión consciente.

## Qué hacer distinto la próxima vez

1. **Un evento que pasa a ser load-bearing exige revisar su cadena entera.**
   Empezando por si llega al índice.
2. **Un criterio de producto se aplica en las dos capas que evalúan**, agente y
   motor. Si solo se toca una, divergen.
3. **Un mensaje al operador describe el estado de ESTA pasada.** Reemitir un
   motivo cacheado engaña cuando la configuración ha cambiado en medio.
4. **Lo que el contenedor no puede validar hay que listarlo antes de
   desplegar**, no descubrirlo después. Se hizo, y funcionó: los dos puntos
   señalados (`auditd` y SCA) fueron los primeros que se comprobaron, y el
   fixture de auditd resultó correcto.
5. **Los valores por defecto de las plantillas son decisiones de producto**, no
   relleno: determinan la primera lectura de cada cliente.

## Estado

Los hallazgos 1 a 4 están en corrección. El 5 es una decisión del responsable,
no un defecto.
