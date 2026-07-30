# Auditoría de coherencia de los tres controles — 2026-07-30

Rama `main`. Auditoría posterior a la desconexión del evaluador de op.acc.1
(`policies/op-acc-1.policy.ts`), hecha para que los tres controles se declaren y
se auditen igual.

Método: lectura de código y cruce de datos entre `agent/rules/*.xml`,
`agent/collectors/`, `dashboard/ens/**` y `config/`. No se compila ni se ejecuta
nada: este repo no es compilable por sí solo.

---

## 0. Lo más grave, primero

1. **El motor fabricaba cumplimiento a partir del nombre del evento.
   CORREGIDO.** En dos sitios independientes, un evento sin `estado` declarado
   acababa en `CUMPLE`: `evidence/engine.ts` terminaba su inferencia en
   `: 'CUMPLE'`, y `data-source-engine.ts` elevaba a `CUMPLE` cualquier nombre
   que contuviera `success`, `ok` o `configured`. La ausencia de un dato
   producía una afirmación de conformidad, que es la violación más directa del
   principio rector. Detalle, arreglo y efecto verificado en §5.1.

2. **La trazabilidad estaba rota en los tres controles. CORREGIDO.** 32 de los
   46 identificadores de regla declarados en TypeScript eran simbólicos
   (`ENS-OPACC1-INVENTORY`) y no correspondían a ninguna regla real, y de los 14
   numéricos varios apuntaban a reglas genéricas de estado en vez de a la que
   acredita la evidencia (§1).

3. **mp.info.6 declara 14 tipos de evento que ninguna regla emite, y 5 eventos
   reales no los declara ninguna evidencia.** El vocabulario del catálogo y el
   del runbook se han separado. Mapa completo, evidencia por evidencia, en §4
   — está puesto ahí para que se corrija en el runbook, que es el sitio
   correcto; este informe no lo toca.

4. **Dos reglas son inertes para el plugin.** 106605 y 106923 re-etiquetan
   alertas `syscheck` que no llevan campo `ensfacil`, y el proveedor de datos
   filtra por `data.control` o `data.ensfacil`. Documentadas en el XML (§2).

5. **El formulario no sabía editar listas. CORREGIDO.** No era un desajuste de
   tipo puntual en P-04 de op.acc.1: el form-engine no tenía renderer de `list`,
   así que los nueve parámetros de tipo lista del producto se escribían como
   texto libre y se guardaban como cadena. Por eso se pudo escribir `"si"` en
   una lista de nombres de cuenta (§3.2).

6. **No existía `config/mp-info-6-control-block.json`. CORREGIDO.** Sin bloque
   sembrado, la tarjeta de configuración del control no aparece en la UI y sus
   parámetros obligatorios cuentan como ausentes (§3.6).

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

### 3.2 El formulario no sabía editar listas — CORREGIDO

Esta es la causa real del incidente de 3.1, y merece enunciarse con precisión:
**no fue un desajuste de tipo puntual entre la ficha y el evaluador, fue que no
había forma de introducir una lista en el formulario.**

`form-engine/factory/parameter-renderer-factory.tsx` solo tenía dos renderers:
`NumberParameterRenderer` para `number`, `duration_hours` y `duration_days`, y
`TextParameterRenderer` **para todo lo demás**. Es decir, `list`, `boolean`,
`select`, `path` y `url` se editaban como texto libre y se guardaban como
cadena, aunque `ENSControlParameter['value']` declare `string | number |
boolean | string[]` y el validador de estructura acepte explícitamente arrays
de cadenas. Nada impedía escribir `"si"` en un parámetro declarado como lista.

Afecta a los nueve parámetros `type: 'list'` del producto: mp.info.6 P-04 y
P-07; op.acc.1 P-02, P-03, P-04 y P-07; op.acc.2 P-01, P-02 y P-06. Entre ellos
están las tres listas que alimentan CDB lists en Wazuh (cuentas de servicio,
cuentas genéricas prohibidas y usuarios autorizados).

**Añadido `renderers/list-parameter-renderer.tsx`**, un combo de pastillas
(`EuiComboBox`) que guarda siempre `string[]`. Con él, escribir `"si"` produce
`['si']` —una lista de un elemento, revisable— en vez de un escalar que el motor
pueda confundir con un booleano. Tolera el valor legacy en forma de cadena para
poder editar sin perder lo que ya hay en el índice: parte por saltos de línea y
por comas, nunca por `|`, que en este producto separa los campos de un mismo
elemento (`srv-dc01 | Windows`).

`boolean`, `select`, `path` y `url` siguen en el renderer de texto: se editan
como cadena, que es lo que declaran, así que su valor y su tipo no se
contradicen. Un `select` sin lista de opciones y un `boolean` sin interruptor
siguen siendo mejorables, pero no producen un valor de tipo equivocado.

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

### mp.info.6 — el catálogo y el runbook hablan vocabularios distintos

Hay un agente reestructurando este runbook, así que va el mapa completo. **La
corrección va en el runbook y en el catálogo, no en el motor.**

Antes de leer las tablas, una precisión importante: `data-source-engine.ts`
traduce a mano un nombre, y solo uno:

```ts
const eventType =
  String(rawEventType).toLowerCase() === 'offsite_ok'
    ? 'offsite_success'
    : rawEventType;
```

O sea, la regla 106662 emite `offsite_ok`, el catálogo espera `offsite_success`,
y el desajuste está parcheado con un caso especial cableado en un fichero
compartido del motor. **EV-06 sí resuelve hoy**, pero a costa de esa traducción.
Cuando el runbook y el catálogo usen el mismo nombre, esa línea debe
desaparecer: es deuda escondida en el sitio donde nadie la busca.

#### A · Declarados en el catálogo y que ninguna regla emite (14)

| Evento declarado | Evidencia que lo declara |
|---|---|
| `backup_success` | EV-01, EV-02 |
| `backup_modified` | EV-03 |
| `backup_deleted` | EV-03 |
| `backup_ransomware` | EV-03 |
| `retention_configured` | EV-03 |
| `authorized_access` | EV-04 |
| `unauthorized_access` | EV-04 |
| `restore_success` | EV-05 |
| `offsite_missing` | EV-06 |
| `decoder_ok` | EV-07 |
| `backup_warning` | EV-07 |
| `backup_timeout` | EV-07 |
| `backup_disk_full` | EV-07 |
| `backup_network_error` | EV-07 |

#### B · Emitidos por las reglas y que ninguna evidencia declara (5)

| Evento emitido | Regla | La regla lo asigna a | Estado que declara |
|---|---|---|---|
| `freq_deviation` | 106603 | EV-02 | NO_CUMPLE |
| `access` | 106604 | EV-03, EV-04 | NO_CUMPLE |
| `encfp_changed` | 106609 | EV-03, EV-07 | NO_CUMPLE |
| `verify_ok` | 106660 | EV-03 | CUMPLE |
| `verify_error` | 106661 | EV-03 | NO_CUMPLE |

Los cinco son eventos reales, con regla, con `evidencia=` declarada en su
`<info>` y con estado explícito, que el catálogo no escucha. **EV-03 es el caso
extremo: declara cuatro nombres que no existen y no declara ninguno de los
cuatro que sus propias reglas emiten**, así que solo puede resolverse por
`evidence_state`. Lo mismo EV-04 con `access`.

#### C · Otras dos observaciones sobre estas evidencias

- **EV-01 y EV-05 son las dos únicas evidencias del producto que no declaran
  `evidence_state`.** Dependen enteramente de su evento propio, así que un
  `evidence_state` de mp.info.6 para EV-01 o EV-05 se descarta.
- **`control_state` está declarado en EV-03, EV-04 y EV-06 pero es inerte ahí.**
  `evidence/engine.ts` exige `evidenceId` coincidente para los eventos genéricos
  y `control_state` no lleva `evidence_id`, así que nunca casa.

### op.acc.1 — vocabulario legacy completo

El catálogo del plugin habla el vocabulario antiguo (`account_disabled`,
`multi_role_usage`, `authorized_list_check`, `retention_violation`,
`interactive_login`, `account_offboarding`, `unauthorized_user`, `privilege_use`:
ocho nombres que **ninguna regla emite**), mientras el colector y las reglas
hablan el vocabulario de hechos técnicos. De los dieciséis nombres declarados
solo ocho existen como evento real, y uno de esos ocho (`account_deleted`, bajo
EV-02) tampoco resuelve porque su `evidence_id` es EV-08. Ver §5.2.

---

## 5. La inferencia de estado y el caso op.acc.1

### 5.1 El motor fabricaba cumplimiento — CORREGIDO

`evidence/engine.ts` resolvía el estado de un evento así:

```ts
const inferredStatus = event.status || (
  event.eventType.includes('missing') || event.eventType.includes('error') ||
  event.eventType.includes('unauthorized') ? 'NO_CUMPLE' : 'CUMPLE'
);
```

Y `resolveEvidenceEventStatus` terminaba igual, en `: 'CUMPLE'`. Un evento sin
`estado` cuyo nombre no contuviera esas tres palabras **se convertía en
CUMPLE**: cualquier hecho técnico desconocido contaba como conforme.

El mismo defecto, en sentido más amplio, estaba aguas arriba en
`data-source/data-source-engine.ts`, que elevaba a `CUMPLE` cualquier nombre que
contuviera `success`, `ok` o `configured`, más `authorized_access` literal. Ése
es el que actúa sobre los datos reales, porque toda alerta pasa por
`normalizeWazuhAlerts` antes de llegar a las evidencias.

El efecto combinado, sobre los mismos datos: `auth_success` sube a verde por
contener "success", mientras `generic_account_login` —que *es* la no
conformidad— cae a `NO_EVALUABLE` y no puede poner nada en rojo. Verde sin
respaldo y rojo imposible.

**Arreglado en los dos sitios, con la misma lista de patrones** para que el
motor no dé dos respuestas distintas sobre el mismo evento:

1. si el evento **declara** estado, se usa tal cual;
2. si no, solo se infiere **hacia NO_CUMPLE**, con cuatro patrones justificados
   uno a uno en el comentario del código: `error` y `failed` (la operación que
   la evidencia debía acreditar no se completó), `missing` (falta el artefacto
   que la evidencia exige) y `unauthorized` (acceso o identidad fuera de lo
   autorizado);
3. en cualquier otro caso, **`NO_EVALUABLE`**. Ante la duda el motor no afirma.

Queda anotada una salvedad de `missing`: las reglas del propio producto no le
dan siempre el mismo estado (106601 `backup_missing` declara NO_CUMPLE, pero
106606 `restore_missing` declara NO_EVALUABLE). Como ambos eventos llegan con su
`estado`, la inferencia no se aplica sobre ellos y la discrepancia no se
manifiesta; si algún día un `*_missing` llegara sin `estado`, este patrón lo
pondría en rojo.

#### Efecto sobre los tres controles: ninguno

Verificado evento a evento antes de confirmar el cambio:

| Comprobación | Eventos | Cambian |
|---|---|---|
| Muestras reales de los agentes (`agent/samples/*.ndjson`, op.acc.1 y op.acc.2) | 42 | **0** |
| Tipos de evento de las reglas de mp.info.6, con el `estado=` de su `<info>` | 24 | **0** |

Todos los agentes desplegados emiten `estado` en cada evento, así que la rama de
inferencia no se alcanza y ni un solo estado cambia. Lo único que cambia es
exactamente el caso que el arreglo persigue: un evento **sin** `estado` deja de
salir verde.

Barriendo los 109 nombres de evento del vocabulario del producto (reglas,
`expectedEventTypes` y `events` de `data/`), **once** se elevaban solos a
`CUMPLE` por su nombre y ahora salen `NO_EVALUABLE` si llegan sin `estado`:
`auth_success`, `authorized_access`, `backup_ok`, `backup_success`,
`decoder_ok`, `offsite_ok`, `offsite_success`, `restore_ok`, `restore_success`,
`retention_configured` y `verify_ok`. De esos once, cinco no los emite ninguna
regla (§4-A) y los seis restantes llegan siempre con su `estado`.

La fixture de test (`ens-engine.test-fixture.ts`) declara ahora `status`
explícito en sus tres eventos, como hace cualquier alerta real; sin él simularía
un evento que ningún agente emite y el resultado de la fixture habría cambiado.

### 5.2 op.acc.1: el recolector de `main` frente al desplegado

Hay que distinguir dos recolectores, porque no se comportan igual:

- **El desplegado hoy** (los runbooks de los tres controles) emite `estado` en
  cada evento. Por eso op.acc.1 mostraba 6 CUMPLE y 2 NO_CUMPLE en el plugin, y
  por eso la desconexión del evaluador no lo bloquea: el motor consolida desde
  el estado declarado, no desde la heurística.
- **`agent/collectors/ens_op_acc1_audit.py`, el que está en `main`**, emite
  únicamente hechos técnicos neutros: `event_class=technical_fact`, y su emisor
  `ensfacil-emit-opacc.sh` **rechaza activamente** cualquier línea con `estado` o
  `nivel` (`"Línea N: estado o nivel no permitidos"`). El agente no puede emitir
  un juicio, por diseño.

El análisis que sigue describe qué pasaría con **el segundo**, que es hacia
donde apunta la arquitectura de `main`. No describe el servidor de hoy.

Su fichero de reglas tiene 52 reglas, todas de `technical_fact`, y **ninguna de
`evidence_state`, `control_state` ni `score_snapshot`**, a diferencia de
mp.info.6 (106700-106722) y op.acc.2 (106950-106972). El colector y las reglas
están perfectamente alineados entre sí —51 eventos, 51 reglas, 1:1 sin sobrantes
ni faltantes—, pero el catálogo del plugin habla el vocabulario antiguo:
`account_disabled`, `account_offboarding`, `interactive_login`,
`multi_role_usage`, `privilege_use`, `authorized_list_check`,
`unauthorized_user` y `retention_violation` son ocho nombres que ninguna regla
emite. De los dieciséis nombres declarados solo ocho existen como evento real, y
uno de esos ocho (`account_deleted`, bajo EV-02) tampoco resuelve porque su
`evidence_id` es EV-08.

Resultado con ese recolector, ya con la heurística corregida:

| Evidencia | Evento que llega | Regla | Estado |
|---|---|---|---|
| EV-01 | `account_inventory`, `account_active` | 106810, 106811 | NO_EVALUABLE |
| EV-02 | `account_created`, `account_modified` | 106812, 106813 | NO_EVALUABLE |
| EV-03 | `auth_success`, `generic_account_login` | 106802, 106801 | NO_EVALUABLE |
| EV-04 | ninguno coincide | — | NO_EVALUABLE |
| EV-05 | `service_account_interactive` | 106805 | NO_EVALUABLE |
| EV-06 | ninguno coincide | — | NO_EVALUABLE |
| EV-07 | ninguno coincide | — | NO_EVALUABLE |
| EV-08 | `account_deleted` | 106818 | NO_EVALUABLE |

Antes del arreglo, EV-03 salía **CUMPLE** por el `auth_success`. Ahora las ocho
quedan en gris, que es el comportamiento correcto —sin datos evaluables,
`NO_EVALUABLE`— pero significa que con ese recolector op.acc.1 no acredita nada
mientras el motor no vuelva a juzgar los hechos técnicos.

Las tres salidas posibles, todas decisiones de producto:

1. **Reconectar el evaluador** de op.acc.1. Es lo que traducía hechos técnicos a
   juicio ENS. Vuelve a dejar dos caminos de evaluación distintos.
2. **Migrar el emisor y las reglas de op.acc.1 al contrato `evidence_state`**,
   como los otros dos. Exige tocar colector, emisor (que hoy rechaza `estado` a
   propósito) y añadir reglas equivalentes a 106700-106703.
3. **Migrar los tres controles al modelo de hechos técnicos** y que el motor
   juzgue siempre, que es hacia donde apunta el comentario de
   `op-acc-1.policy.ts`.

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
| `fix(motor)` | La ausencia de `estado` ya no produce `CUMPLE`: inferencia solo hacia NO_CUMPLE, con patrones justificados, y `NO_EVALUABLE` por defecto, en `evidence/engine.ts` y en `data-source-engine.ts` |
| `feat(config)` | Renderer de listas en el form-engine: los nueve parámetros `type: 'list'` dejan de guardarse como cadena |

## 8. Pendiente de decisión

1. **Corregir el vocabulario de mp.info.6** (§4): 14 nombres declarados que
   nadie emite y 5 eventos reales que ninguna evidencia escucha. Al hacerlo,
   eliminar la traducción cableada de `offsite_ok` → `offsite_success` de
   `data-source-engine.ts`, que hoy tapa uno de los desajustes.
2. **Elegir camino para op.acc.1** (§5.2) si se adopta el recolector de hechos
   técnicos de `main`. Con el recolector desplegado hoy el control funciona.
3. Devolver la lista real a P-04 de op.acc.1 en la configuración desplegada
   (§3.1). Ya hay renderer de listas para poder introducirla.
4. Separar la whitelist de excepciones de op.acc.2 P-03, o reescribir su
   ejemplo, para que un `boolean` no invite a escribir una lista (§3.4).
5. Registro de modelos de informe por `controlId` en vez de la cadena de
   ternarios que cae por defecto en mp.info.6 (§6).
6. Decidir sobre la deriva `catalog/` vs `data/`, en particular el nivel ALTO
   ausente en `data/mp-info-6.ts` (§6).
7. Ninguno de los tres controles detecta el silencio: los parámetros de alcance
   no tienen regla que avise de un sistema declarado que deja de reportar (§1).
