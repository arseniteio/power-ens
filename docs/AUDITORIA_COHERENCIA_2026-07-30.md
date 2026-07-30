# Auditoría de coherencia de los tres controles — 2026-07-30

Rama `main`. Auditoría posterior a la desconexión del evaluador de op.acc.1
(`policies/op-acc-1.policy.ts`), hecha para que los tres controles se declaren y
se auditen igual.

Método: lectura de código y cruce de datos entre `agent/rules/*.xml`,
`agent/collectors/`, `dashboard/ens/**` y `config/`. No se compila ni se ejecuta
nada: este repo no es compilable por sí solo.

---

## 0. Lo más grave, primero

1. **op.acc.1 no puede acreditar nada desde que se desconectó el evaluador, y
   una de sus ocho evidencias puede salir en verde sin respaldo.** Su agente
   emite únicamente hechos técnicos neutros (`event_class=technical_fact`, con
   `estado` y `nivel` **rechazados activamente** por el emisor), y su fichero de
   reglas no tiene ninguna regla de `evidence_state` / `control_state` /
   `score_snapshot`. El motor consolida desde `evidence_state`: esos eventos no
   existen para op.acc.1 y no pueden existir sin cambiar el contrato del agente.
   Detalle y consecuencias exactas en §5.

2. **La trazabilidad estaba rota en los tres controles**: 32 de los 46
   identificadores de regla declarados en TypeScript eran simbólicos
   (`ENS-OPACC1-INVENTORY`) y no correspondían a ninguna regla real, y de los 14
   numéricos varios apuntaban a reglas genéricas de estado en vez de a la que
   acredita la evidencia. Corregido (§1).

3. **Dos reglas son inertes para el plugin**: 106605 y 106923 re-etiquetan
   alertas `syscheck` que no llevan campo `ensfacil`, y el proveedor de datos
   filtra por `data.control` o `data.ensfacil`. Documentadas en el XML (§2).

4. **mp.info.6 declara en su catálogo 15 tipos de evento que ninguna regla
   emite**, y no declara 7 que sí se emiten — entre ellos `offsite_ok`, el
   evento del CUMPLE de R2 (nivel ALTO), que el catálogo llama
   `offsite_success` (§4).

5. **No existía `config/mp-info-6-control-block.json`.** Sin bloque sembrado, la
   tarjeta de configuración del control no aparece en la UI y sus parámetros
   obligatorios cuentan como ausentes (§3).

---

## 1. Mapa evidencia → rule ID (TAREA 1)

Construido leyendo `agent/rules/*.xml`: para cada regla, el `evidencia=` de su
`<info type="text">` (o el `EV_xx` de su `<group>` cuando no hay `info`) y el
`<field name="event">` que la dispara.

Criterio de inclusión en el código:

- se incluyen las reglas que acreditan la evidencia y generan alerta;
- se excluyen las de `level="0"` (106600, 106800, 106900 y 106652), que nunca
  producen alerta y por tanto no llevan a ningún evento crudo;
- se excluyen las inertes (106605, 106923), que nunca llegan al plugin;
- no se listan las genéricas de `evidence_state` (106700-106703 /
  106950-106953): `core/evidence/engine.ts` añade el `ruleId` del evento que
  resuelve la evidencia, así que aparecen solas cuando son el origen real.

### mp.info.6 · Copias de seguridad

| Evidencia | Reglas | Eventos |
|---|---|---|
| EV-01 Última copia correcta | 106650, 106601 | `backup_ok`, `backup_missing` |
| EV-02 Copia dentro del intervalo | 106601, 106603 | `backup_missing`, `freq_deviation` |
| EV-03 Retención configurada | 106604, 106609, 106660, 106661 | `access`, `encfp_changed`, `verify_ok`, `verify_error` |
| EV-04 Acceso autorizado al repositorio | 106604 | `access` (authorized=false) |
| EV-05 Prueba de restauración | 106651, 106606, 106607 | `restore_ok`, `restore_missing`, `restore_error` |
| EV-06 Repositorio alternativo | 106662, 106663 | `offsite_ok`, `offsite_error` |
| EV-07 Logs interpretados | 106690, 106602, 106609 | `backup_error`, correlación 3/24h, `encfp_changed` |

Fuera del mapa: 106600 (base, level 0), 106652 (supresión de restore sintético,
level 0), 106605 (inerte) y las familias genéricas 106700-106703 /
106710-106713 / 106720-106722.

### op.acc.1 · Identificación

| Evidencia | Reglas |
|---|---|
| EV-01 Inventario de cuentas activas | 106810, 106811, 106809, 106822, 106835 |
| EV-02 Cambios en ficheros de identidad | 106812, 106813, 106814, 106837, 106838 |
| EV-03 Cuentas genéricas o compartidas | 106801, 106802, 106824, 106827, 106828 |
| EV-04 Cuentas de usuarios de baja | 106820, 106841, 106842, 106843, 106844, 106845, 106846, 106847 |
| EV-05 Cuentas de servicio interactivas | 106805, 106857, 106858, 106859, 106864, 106865, 106866, 106867, 106868 |
| EV-06 Uso multi-rol | 106823, 106848, 106849, 106854, 106855 |
| EV-07 Lista de usuarios autorizados | 106829, 106830, 106831, 106832, 106833, 106836, 106839, 106840 |
| EV-08 Eliminación prematura de cuentas | 106803, 106804, 106818, 106821, 106834, 106856 |

Fuera del mapa: 106800 (base, level 0). **No hay reglas de `evidence_state`,
`control_state` ni `score_snapshot` para op.acc.1**: ver §5.

El colector y las reglas de op.acc.1 sí están perfectamente alineados entre sí:
**51 eventos emitidos, 51 reglas, correspondencia 1:1 sin sobrantes ni
faltantes**. El desajuste está aguas arriba, en el catálogo del plugin.

### op.acc.2 · Requisitos de acceso

| Evidencia | Reglas | Eventos |
|---|---|---|
| EV-01 Permisos en recursos | 106901, 106902, 106903, 106904 | `sca_check`, `world_writable`, `umask_check` |
| EV-02 FIM sobre el SO | 106920, 106921, 106922 | `fim_modified`, `fim_added`, `fim_deleted` |
| EV-03 Accesos denegados y escaladas | 106910, 106911, 106912 | `access_denied`, `privilege_escalation`, `sudo_usage` |
| EV-04 ACLs por recurso | 106913, 106914 | `acl_check`, `acl_deviation` |
| EV-05 Privilegios individuales (R1) | 106930, 106931, 106932 | `privilege_check`, `excessive_privilege`, `group_membership` |
| EV-06 Tipo de acceso (R1) | 106935, 106936 | `access_type_violation`, `object_access` |
| EV-07 Rootcheck | 106925, 106926, 106927 | `rootcheck`, `suid_sgid`, `no_owner_file` |

Fuera del mapa: 106900 (base, level 0), 106923 (inerte) y las genéricas
106950-106953 / 106960-106963 / 106970-106972.

### Verificación cruzada

- **Ningún identificador numérico citado en TypeScript o en los bloques de
  `config/` falta en el XML**: 85 identificadores distintos, todos existen.
- **Reglas que ninguna evidencia ni parámetro reclama** (28): las tres base de
  nivel 0 (106600, 106800, 106900), la supresión 106652, las dos inertes
  (106605, 106923) y las 22 genéricas de estado
  (106700-106703, 106710-106713, 106720-106722, 106950-106953, 106960-106963,
  106970-106972). Todas ellas por diseño; ninguna es una regla huérfana real.

### Estado antes y después

|  | antes | después |
|---|---|---|
| identificadores simbólicos distintos | 32 (80 apariciones) | 0 |
| identificadores numéricos distintos | 14 (18 apariciones) | 85 |

Los 14 numéricos que ya existían estaban solo en `data/mp-info-6.ts`, y varios
apuntaban a reglas **genéricas de estado** en vez de a la que acredita la
evidencia: EV-02 citaba `106700, 106720, 106721` (una de `evidence_state` y dos
de `score_snapshot`), EV-04 citaba `106700, 106701` y EV-06 `106703, 106713`.
Un auditor que siguiera esos enlaces llegaba a la regla que registra *que hubo
un estado*, no a la que lo justifica.

### Huecos de trazabilidad que se dejan documentados

Diez parámetros no tienen ninguna regla detrás. Se dejan con `ruleIds: []` y un
comentario en el código que explica por qué. **Un hueco visible es preferible a
un ID numérico equivocado, porque el ID equivocado *parece* trazable.**

| Control | Parámetro | Por qué no hay regla |
|---|---|---|
| mp.info.6 | P-03 `retencion_dias` | La retención la calcula el motor (`mp.info.6.2.b.min_retention` en `policy-runtime.ts`), no Wazuh |
| mp.info.6 | P-04 `sistemas_monitorizados` | Ninguna regla detecta un sistema del alcance que deja de enviar eventos |
| mp.info.6 | P-06 `directorio_backup_local` | La única regla que lo vigila es 106605, **inerte** |
| mp.info.6 | P-09 `directorio_backup_offsite` | No hay regla que vigile el repositorio remoto |
| mp.info.6 | P-10 `herramienta_backup` | No hay regla que acredite el decoder de la herramienta declarada |
| op.acc.1 | P-01 `fuente_identidad` | El recolector la usa, pero ninguna alerta la acredita |
| op.acc.1 | P-02 `sistemas_monitorizados` | Igual que mp.info.6 P-04 |
| op.acc.1 | P-08 `integracion_rrhh` | No hay regla de correlación con RRHH |
| op.acc.2 | P-01 `sistemas_en_scope` | Igual que mp.info.6 P-04 |
| op.acc.2 | P-04 `politica_acceso_so_referencia` | Parámetro documental; ninguna alerta lo acredita |

El patrón es claro: **ningún control detecta el silencio**. Los parámetros de
alcance (qué sistemas deben enviar evidencia) no tienen regla en ninguno de los
tres, así que un sistema declarado que deja de reportar no produce hallazgo, y
la ausencia de datos se confunde con la ausencia de problemas. Es el hueco
estructural más repetido de los tres controles.

---

## 2. Reglas inertes para el plugin (TAREA 2)

`core/data-source/opensearch-provider.ts` filtra el índice por
`data.control` **o** `data.ensfacil`. Una alerta sin uno de esos campos no llega
nunca al motor.

| Regla | Fichero | Qué re-etiqueta |
|---|---|---|
| **106605** | `ensfacil_mp_info_6_json_rules.xml` | `<if_group>syscheck</if_group>` sobre `/opt/zimbra/backup/sessions`, `/var/lib/pxbackup`, `/var/lib/proxmox-backup`. Declara acreditar EV-03 de mp.info.6 |
| **106923** | `ensfacil_op_acc_2_json_rules.xml` | `<if_group>syscheck</if_group>` sobre `/etc/passwd`, `/etc/shadow`, `/etc/sudoers`, `/etc/ssh/sshd_config`, `/etc/crontab`. Declara acreditar EV-02 de op.acc.2 |

Ambas generan alerta en Wazuh (nivel 12 y 10) y se indexan, pero las alertas
`syscheck` nativas no llevan `ensfacil` ni `control`: el plugin no las consulta.
El efecto práctico es que EV-03 de mp.info.6 y EV-02 de op.acc.2 **parecen**
tener una regla FIM detrás que no puede acreditarlas.

No se borran: para el SOC siguen siendo útiles. Se ha añadido un comentario en
el propio XML explicando por qué no son funcionales para el plugin y qué haría
falta para que lo fueran (que el emisor publique un `json_line` con `ensfacil`,
o que el proveedor acepte alertas por grupo `ENS_<control>`).

En op.acc.2 la cobertura real de EV-02 la dan 106920/106921/106922, que sí vienen
del emisor con `ensfacil=op.acc.2`. En mp.info.6, EV-03 se queda con 106604,
106609, 106660 y 106661.

---

## 3. Tipos de parámetro (TAREA 3)

Comparación campo a campo de los bloques de `config/` contra
`configuration/data/<control>-parameters.ts`: **hoy son idénticos en los tres
controles** (10 + 8 + 7 parámetros) y los tres pasan las reglas de
`configuration-structure-validator.ts`.

### 3.1 op.acc.1 P-04 `cuentas_genericas_prohibidas` — `list` leído como booleano

La ficha del auditor (`data/op-acc-1.ts`), el bloque
(`config/op-acc-1-control-block.json`) y `configuration/data/` lo declaran
`type: 'list'`: nombres de cuenta prohibidos (admin, guest, test...).

`op-acc-1.evaluator.ts` lo leía con `toBoolean` en dos sitios, y `toBoolean`
acepta `'si'` y `'sí'`. En el despliegue real hubo que escribir `"si"` en P-04
para desbloquear la evaluación, y con ello **se perdió la lista**: el motor dejó
de saber *qué* cuentas estaban prohibidas y solo supo que "hay prohibidas".

Manda la ficha: no se toca el tipo. Se ha documentado el desajuste en los dos
puntos del evaluador, que hoy está desconectado pero es el punto de partida de
la migración. **Acción pendiente en el despliegue: devolver a P-04 la lista
real.** Hoy nadie la lee como booleano, así que restaurarla no rompe nada.

### 3.2 El formulario no sabe editar listas

`form-engine/factory/parameter-renderer-factory.tsx` solo tiene dos renderers:
`NumberParameterRenderer` para `number`, `duration_hours` y `duration_days`, y
`TextParameterRenderer` **para todo lo demás**. Es decir, `list`, `boolean`,
`select`, `path` y `url` se editan como texto libre y se guardan como cadena.

Esta es la causa de fondo de 3.1: el tipo `list` no está implementado en la UI,
así que nada impedía escribir `"si"` en un parámetro declarado como lista.
Mientras no haya renderer de lista, cualquier parámetro `list` es en la práctica
una cadena, y el desajuste se puede repetir en los otros ocho parámetros de
tipo lista del producto (nueve en total tras 3.3).

### 3.3 op.acc.2 P-02 `rutas_criticas_so` — `path` para una lista de rutas

Estaba declarado `type: 'path'`, que designa una ruta única, cuando la ficha
describe "rutas de ficheros y directorios" en plural, el ejemplo trae tres y la
regla 106923 cubre cinco. **Corregido a `list`** en el TS y en el bloque. Es un
cambio de declaración: ni el validador ni el renderer distinguen hoy entre ambos
tipos (ver 3.2).

Los otros dos `path` del producto (mp.info.6 P-06 `directorio_backup_local` y
P-09 `directorio_backup_offsite`) sí son rutas únicas y se dejan como están.

### 3.4 op.acc.2 P-03 `permisos_world_writable_permitidos` — riesgo latente

Declarado `boolean`, y su descripción es efectivamente booleana. Pero su
`example` es `'no (ninguno) / sí - /tmp, /var/tmp'` y su `wazuhUsage` dice que
"las excepciones se cargan como whitelist": el ejemplo invita a escribir una
lista en un campo booleano. Es exactamente la misma trampa que 3.1, en sentido
contrario. **No se cambia** (la semántica la define la ficha), pero conviene o
bien separar la whitelist en un parámetro `list` propio, o bien reescribir el
ejemplo.

### 3.5 op.acc.1 P-07 — requisitos divergentes

El bloque y la ficha lo ligan a `op.acc.1.r1.2` y `op.acc.1.r1.3`;
`configuration/data/op-acc-1-parameters.ts` solo declaraba `r1.3`. **Alineado
con la ficha.** El campo `requirements` de un parámetro solo se transporta al
modelo de presentación (`evaluation-engine.ts:105`), así que el cambio no altera
ninguna evaluación.

Queda anotado, sin cambiar, que `catalog/op-acc-1.ts` y `op-acc-1.policy.ts`
declaran `parameterIds: []` para `op.acc.1.r1.2`; por coherencia con la ficha
debería ser `['P-07']`. No se toca `op-acc-1.policy.ts` porque tiene cambios en
curso sin confirmar.

### 3.6 `config/mp-info-6-control-block.json` no existía

`config/` solo tenía bloques de op.acc.1 y op.acc.2. Sin bloque sembrado en
`wazuh-ens-configuration`, la tarjeta de configuración del control no aparece en
la UI y sus parámetros obligatorios cuentan como ausentes (el problema de
huevo/gallina que documenta `CLAUDE.md`).

**Creado** desde `mp-info-6-parameters.ts`, que es lo que el plugin compila, con
el nombre que `inject-control.py` deduce del id del control. Verificado campo a
campo contra el TS y contra el validador de estructura.

---

## 4. `expectedEventTypes` frente a lo que emiten agentes y reglas (TAREA 4)

Cruce de `expectedEventTypes` del catálogo de evidencias contra el
`<field name="event">` de cada regla.

### op.acc.2 — alineado

Las siete evidencias declaran exactamente los eventos que emiten sus reglas. Es
el único control sin desviaciones. Sirve de referencia para los otros dos.

### mp.info.6 — 15 eventos declarados que ninguna regla emite

| Evidencia | Declarados sin regla | Reglas cuyo evento no se declara |
|---|---|---|
| EV-01 | `backup_success` | `backup_missing` |
| EV-02 | `backup_success` | `freq_deviation` |
| EV-03 | `retention_configured`, `backup_modified`, `backup_deleted`, `backup_ransomware` | `access`, `encfp_changed`, `verify_ok`, `verify_error` |
| EV-04 | `authorized_access`, `unauthorized_access` | `access` |
| EV-05 | `restore_success` | — |
| EV-06 | `offsite_success`, `offsite_missing` | `offsite_ok` |
| EV-07 | `decoder_ok`, `backup_warning`, `backup_timeout`, `backup_disk_full`, `backup_network_error` | `encfp_changed` |

Lo más serio de la lista:

- **EV-06 espera `offsite_success` y la regla 106662 emite `offsite_ok`.** El
  CUMPLE de R2 (nivel ALTO) no puede llegar por su propio evento; solo por
  `evidence_state`.
- **EV-03 no declara ninguno de los cuatro eventos que sus reglas emiten.** Sus
  cuatro nombres declarados no existen en el pipeline.
- EV-04 espera `authorized_access` / `unauthorized_access`; la regla 106604 emite
  `access` con `authorized:false`.
- EV-01 y EV-05 son las dos únicas evidencias del producto que **no** declaran
  `evidence_state`, así que dependen enteramente de su evento propio.
- `control_state` aparece en `expectedEventTypes` de EV-03, EV-04 y EV-06 pero
  es inerte ahí: `evidence/engine.ts` exige `evidenceId` coincidente para los
  eventos genéricos, y `control_state` no lleva `evidence_id`.

**No se han corregido.** Cambiar estos nombres altera el resultado de un control
en despliegue y varios de los eventos reales (`access`, `offsite_ok`) resolverían
su estado por heurística de nombre. Es una decisión de producto, no de
coherencia: ver §6.

### op.acc.1 — vocabulario legacy completo

El catálogo del plugin habla el vocabulario antiguo (`account_disabled`,
`multi_role_usage`, `authorized_list_check`, `retention_violation`,
`interactive_login`, `account_offboarding`, `unauthorized_user`, `privilege_use`:
ocho nombres que **ninguna regla emite**), mientras el colector y las reglas
hablan el vocabulario de hechos técnicos. De los dieciséis nombres declarados
solo ocho existen como evento real, y uno de esos ocho (`account_deleted`, bajo
EV-02) tampoco resuelve porque su `evidence_id` es EV-08. Ver §5.

---

## 5. op.acc.1 tras la desconexión del evaluador

Este es el hallazgo que condiciona todo lo demás.

### La cadena, eslabón a eslabón

1. `agent/collectors/ens_op_acc1_audit.py` emite 51 tipos de hecho técnico.
2. `agent/emit/ensfacil-emit-opacc.sh` valida cada línea y **rechaza cualquier
   evento que contenga `estado` o `nivel`** (`"Línea N: estado o nivel no
   permitidos"`), y bloquea la ruta legacy para op.acc.1. El agente no puede
   emitir un juicio, por diseño.
3. `ensfacil_op_acc_1_json_rules.xml` tiene 52 reglas, todas de `technical_fact`.
   **No hay ninguna regla de `evidence_state`, `control_state` ni
   `score_snapshot`**, a diferencia de mp.info.6 (106700-106722) y op.acc.2
   (106950-106972).
4. `core/data-source/data-source-engine.ts` normaliza el estado: sin `estado` en
   el evento, mira el nombre del tipo de evento y **por defecto devuelve
   `NO_EVALUABLE`**.
5. `core/evidence/engine.ts` resuelve cada evidencia con el evento más reciente
   que coincida en `evidence_id` y en `expectedEventTypes`.

### Resultado real, evidencia por evidencia

| Evidencia | Evento que llega | Regla | Estado que produce |
|---|---|---|---|
| EV-01 | `account_inventory`, `account_active` | 106810, 106811 | NO_EVALUABLE |
| EV-02 | `account_created`, `account_modified` | 106812, 106813 | NO_EVALUABLE |
| EV-03 | `auth_success` | 106802 | **CUMPLE** |
| EV-03 | `generic_account_login` | 106801 | NO_EVALUABLE |
| EV-04 | ninguno coincide | — | NO_EVALUABLE |
| EV-05 | `service_account_interactive` | 106805 | NO_EVALUABLE |
| EV-06 | ninguno coincide | — | NO_EVALUABLE |
| EV-07 | ninguno coincide | — | NO_EVALUABLE |
| EV-08 | `account_deleted` | 106818 | NO_EVALUABLE |

Dos consecuencias, y la segunda es la mala:

- **Siete de las ocho evidencias quedan en gris permanente.** Es el
  comportamiento correcto según el principio rector —sin datos evaluables,
  `NO_EVALUABLE`— pero significa que op.acc.1 no acredita nada.

- **EV-03 puede salir en verde sin respaldo.** `auth_success` contiene la
  subcadena `success`, así que la normalización lo eleva a `CUMPLE`. Una
  autenticación correcta no demuestra que no se usen cuentas genéricas, que es
  lo que pregunta EV-03. Y peor: `generic_account_login` —la regla 106801, que
  *es* la no conformidad— se normaliza a `NO_EVALUABLE`, no a `NO_CUMPLE`, así
  que **no puede poner EV-03 en rojo**. Si el evento más reciente de EV-03 es un
  `auth_success`, la evidencia sale CUMPLE aunque en la misma ventana haya
  habido inicios de sesión con cuenta genérica.

Esto vulnera las dos caras del principio rector a la vez: un CUMPLE que los
datos no sostienen, y un NO_CUMPLE real que no se puede expresar.

### Por qué no se ha "arreglado" aquí

Las tres salidas posibles son decisiones de producto, no de coherencia:

1. **Reconectar el evaluador** de op.acc.1. Es lo que traducía hechos técnicos a
   juicio ENS. Vuelve a dejar dos caminos de evaluación distintos, que es
   justamente lo que la desconexión quería evitar.
2. **Migrar el emisor y las reglas de op.acc.1 al contrato `evidence_state`**,
   como mp.info.6 y op.acc.2. Exige tocar el colector, el emisor (que hoy
   rechaza `estado` a propósito) y añadir las reglas 1068xx equivalentes a
   106700-106703. Es el camino coherente con "los tres iguales", pero contradice
   el diseño explícito del emisor, que separa hecho de juicio.
3. **Migrar los tres controles al modelo de hechos técnicos** y que el motor
   juzgue siempre, que es hacia donde apunta el comentario de
   `op-acc-1.policy.ts`.

Mientras no se elija una, **op.acc.1 no debería presentarse como CUMPLE en
ningún informe**. Y hay una mitigación de una línea que no depende de esa
decisión: quitar `auth_success` de los `expectedEventTypes` de EV-03. Con ella,
EV-03 pasa a NO_EVALUABLE como sus siete hermanas y desaparece el verde sin
respaldo. No se ha aplicado porque cambia el resultado visible del control y
corresponde decidirlo a quien lleva el despliegue.

Una alternativa más de fondo, en `evidence/engine.ts`:
`resolveEvidenceEventStatus` devuelve `CUMPLE` por defecto para cualquier evento
que no contenga `missing`, `error` o `unauthorized` en el nombre. Invertir ese
defecto a `NO_EVALUABLE` (respetando `event.status === 'CUMPLE'` cuando venga
explícito) alinearía el motor con el principio rector para los tres controles, a
costa de que mp.info.6 y op.acc.2 dejaran de dar por buenos los eventos que
lleguen sin `estado`.

---

## 6. Coherencia estructural entre los tres controles (TAREA 4)

### Ficheros y registros

| | mp.info.6 | op.acc.1 | op.acc.2 |
|---|---|---|---|
| `catalog/` | sí, en `ENSCatalog` | sí | sí |
| `data/` | sí, en `ENSControls` | sí | sí |
| `configuration/data/` | sí, en registry y barrel | sí | sí |
| `policies/` | sí, en registry | sí (+ evaluador desconectado) | sí |
| `evidence/` | catálogo único compartido | ídem | ídem |
| `informes/` | **en `report-model.ts`** | `op-acc-1-report-model.ts` | `op-acc-2-report-model.ts` |
| `config/` | **creado ahora** | sí | sí |
| `agent/rules/` | 2 ficheros (json + pbs) | 1 | 1 |

Corregido: `configuration/data/index.ts` solo reexportaba
`mp-info-6-parameters`; los otros dos llegaban únicamente por el registry.
Añadidos los tres. No introduce ninguna arista nueva en el grafo de módulos
(`default-configuration`, ya en el barrel, importa el registry, que los carga
igual), así que no toca el ciclo del TDZ.

### `family` y `category`

Convención de `catalog/`: `family` = marco ENS, `category` = grupo.

| Fichero | mp.info.6 | op.acc.1 | op.acc.2 |
|---|---|---|---|
| `catalog/` | family=Medidas de protección, category=Protección de la información | family=Marco operacional, category=Control de acceso | ídem op.acc.1 |
| `configuration/data/` | family=Medidas de protección | family=Marco operacional | family=Marco operacional |
| `data/` (antes) | **invertidos** | correcto | correcto |

**Corregido** `data/mp-info-6.ts`. De paso, la miga de pan del detalle del
control (`controls/control-detail/index.tsx`) mostraba
`{category} / {family}`, es decir de lo concreto a lo general en los tres
controles; ahora va de lo general a lo concreto.

### Controles especial-caseados en ficheros compartidos

1. **`core/policy-runtime/policy-runtime.ts` (2.013 líneas) es enteramente de
   mp.info.6.** Dos guardas `if (context.control.id !== 'mp.info.6') return []`
   hacen que op.acc.1 y op.acc.2 no reciban ninguna variable ni ninguna decisión
   de runtime. No es un fallo —ambos están diseñados para evaluarse solo por
   consolidación de evidencias— pero significa que "los tres siguen el mismo
   camino" es cierto solo aguas abajo de ese punto. Documentado con un comentario
   en el fichero.

2. **`informes/index.tsx` · `buildReportModelFor` cae por defecto en el informe
   de mp.info.6.** op.acc.1 y op.acc.2 tienen fichero propio; mp.info.6 vive en
   `report-model.ts`, de nombre genérico, y además es la rama `else`. Un control
   nuevo que no se añada a esa cadena no fallará: se le generará en silencio el
   informe de mp.info.6, con los requisitos y las evidencias de otro control. Lo
   correcto sería un registro por `controlId` que devuelva `undefined` para los
   no registrados. Documentado con un comentario; no se refactoriza aquí.

3. `informes/index.tsx` mantiene además un `CONTROL_META` con el nombre y el
   subtítulo de cada control, duplicando lo que ya está en `catalog/`.

### Deriva entre el catálogo moderno y el legacy (`catalog/` vs `data/`)

`CLAUDE.md` ya avisa de que el doble catálogo puede divergir. Ha divergido:

- **mp.info.6: `data/` no declara el nivel ALTO en ninguno de sus requisitos**
  (los cinco base salen como `['BAJO','MEDIO']` y `r1.1` como `['MEDIO']`),
  mientras `catalog/` los declara en los tres niveles y el propio control define
  `expectedResult.alto`. En un sistema de nivel ALTO, la vista legacy se queda
  sin requisitos base.
- **op.acc.1: `catalog/` deja `op.acc.1.5` (eIDAS) y `op.acc.1.r1.1` sin
  evidencias**, mientras la ficha les asigna EV-01. Como la evaluación usa el
  `catalog/`, esos dos requisitos son NO_EVALUABLE por construcción y arrastran
  el score del control.
- op.acc.1: `catalog/` asigna a `op.acc.1.3` las evidencias EV-01, EV-02, EV-03 y
  EV-05; la ficha solo EV-01 y EV-02. Y a `r1.3` le añade EV-01.
- op.acc.2 no presenta ninguna deriva entre los dos ficheros.

No se corrigen: cambiar el `catalog/` cambia el resultado de la evaluación y
cambiar `data/` cambia lo que ve el auditor. Ambos son decisiones de producto.

---

## 7. Resumen de cambios aplicados

| Commit | Qué |
|---|---|
| `fix(trazabilidad)` | 32 identificadores simbólicos → rule IDs reales en los tres puntos de verdad y en los bloques de `config/`; 10 huecos documentados con `ruleIds: []`; fixture de test actualizada |
| `docs(reglas)` | 106605 y 106923 marcadas como inertes en el propio XML |
| `fix(config)` | op.acc.2 P-02 `path`→`list`; op.acc.1 P-07 alineado con la ficha; desajuste de `toBoolean` en P-04 documentado en el evaluador; `config/mp-info-6-control-block.json` creado |
| `fix(coherencia)` | `family`/`category` de mp.info.6 unificados y miga de pan corregida; barrel de `configuration/data` simétrico; especializaciones de mp.info.6 documentadas en `policy-runtime.ts` e `informes/index.tsx` |

## 8. Pendiente de decisión

1. Elegir camino para op.acc.1 (§5). Hasta entonces, no presentarlo como CUMPLE.
2. Quitar `auth_success` de EV-03 de op.acc.1, o invertir el defecto de
   `resolveEvidenceEventStatus` (§5).
3. Corregir los `expectedEventTypes` de mp.info.6, empezando por
   `offsite_success` → `offsite_ok` (§4).
4. Devolver la lista real a P-04 de op.acc.1 en la configuración desplegada
   (§3.1).
5. Implementar un renderer de lista en el form-engine (§3.2).
6. Decidir sobre la deriva `catalog/` vs `data/`, en particular el nivel ALTO
   ausente en `data/mp-info-6.ts` (§6).
