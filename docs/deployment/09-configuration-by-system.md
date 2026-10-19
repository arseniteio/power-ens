# Configuración por controles y plantillas

Pantalla de Configuración de ENSFácil 1.3.0: pestañas, valor aplicado a cada agente, plantillas, asignación, listas y modo «Expresión regular», conversión desde la 1.2.0 y declaración desde el servidor.

## 1. Objetivo

Declarar cada control una sola vez: los ajustes comunes de la organización, las plantillas que agrupan los valores de cada tipo de sistema y, en cada agente, solo lo que es propio de esa máquina.

## 2. Requisitos previos

| Requisito | Comprobación |
|---|---|
| Plugin ENSFácil 1.3.0 o posterior desplegado | ENSFácil > Configuración muestra las pestañas «Controles», «Agentes» y «General» |
| Usuario con el rol `ensfacil_admin` o `all_access` | Un guardado desde Configuración no devuelve el error 403 ([instalación desde cero, apartado 13.5](01-installation-from-scratch.md#135-crear-el-rol-ensfacil_admin)) |
| Documento `active` creado y controles sembrados | [Instalación desde cero, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens) |
| Copia del documento `active` antes de cada cambio desde el servidor | [Instalación desde cero, apartado 14.2](01-installation-from-scratch.md#142-copiar-el-documento-antes-de-modificarlo) |

> [!note]
> El alcance ENS (qué agentes se evalúan) no se edita en Configuración: se define en la [configuración inicial](https://gitlab.com/quersystem/ens-controls-runbook/initial-setup). La pestaña «General» lo muestra en solo lectura y la pestaña «Agentes» lista sus agentes.

## 3. Estructura de Configuración

| Pestaña | Contenido |
|---|---|
| Controles | Los 23 controles del catálogo con su estado. En cada control: «Ajustes comunes», «Plantillas» y «Asignación» |
| Agentes | Los agentes del alcance con su tipo detectado y su completitud. En cada agente, control por control: la plantilla que usa y sus ajustes propios |
| General | Nivel ENS, niveles de las dimensiones (C, I, T, A y D), el resto de la configuración global y el alcance ENS en solo lectura |

Cada parámetro de cada control pertenece a una de tres clases (`common/ens/configuration/agents/parameter-classes.ts`), las mismas para la pantalla, la evaluación, los validadores y `set-parameters.py`.

| Clase | Qué describe | Parámetros (23 controles) | Dónde se declara |
|---|---|---|---|
| Común (organización) | Periodicidades, umbrales, roles, registros, procedimientos, documentos, nube, plan de continuidad | 163 | «Ajustes comunes» del control |
| Por sistema | El estado de una máquina concreta: cuentas, servicios, rutas, ACL, claves, calendario de copia, criticidad o responsable | 41 | Plantilla o ajuste propio del agente |
| Por plataforma | Lo que depende del sistema operativo o del producto y es igual en todas las máquinas de esa plataforma | 35 | Plantilla o ajuste propio del agente |

Los controles op.cont.2, op.exp.9, op.mon.2 y op.nub.1 solo tienen ajustes comunes: no tienen plantillas ni asignación.

## 4. Valor que se aplica a un agente

Cada parámetro por sistema o por plataforma toma en un agente su ajuste propio; si no lo tiene, el valor de la plantilla asignada en el control o, sin plantilla asignada, el de la plantilla de serie de su tipo; si la plantilla no lo fija, el valor común del control.

La asignación «Sin plantilla (valores comunes)» deja el agente con el valor común.

Reglas de la resolución:

- Los parámetros comunes salen siempre de los ajustes comunes del control.
- Se sustituye el parámetro **entero**: una tabla del agente o de la plantilla reemplaza a la común, sin mezclar filas. Es el mismo criterio que `set-parameters.py`.
- La plantilla de serie de un tipo se aplica solo a los agentes con el tipo **guardado** en su perfil (detectado o corregido a mano, apartado 6.1). Sin tipo guardado, el agente toma el valor común.
- Los parámetros por sistema que describen **otras** máquinas en un control que se mide en el manager se resuelven por **unión**: en la fila del manager, el valor es el común más las filas de cada agente (ajuste propio o plantilla), sin repetir. Son op.exp.7 P-04 y P-07, op.cont.3 P-07, op.mon.1 P-01 y, en la fila del manager, op.exp.8 P-02 y op.mon.3 P-01, P-03 y P-07.
- El alcance declarado de mp.info.6 (P-04) también se resuelve por unión, en todas las filas.
- El modo de comparación de un valor («Texto exacto» o «Expresión regular», apartado 5.5) va con el valor: el agente toma el modo del nivel del que toma el valor.

La pantalla indica el origen de cada valor de un agente: «ajuste propio de este agente», «heredado de la plantilla asignada «…»», «heredado de la plantilla de serie «…» de su tipo», «heredado del valor común del control» o, en una unión, «este agente no aporta filas propias».

## 5. Pestaña «Controles»

La pestaña lista los 23 controles del catálogo con su estado y, por control, sus plantillas de serie, sus plantillas propias y el número de agentes con plantilla asignada.

| Estado | Significado |
|---|---|
| Configurado | Todos los ajustes comunes obligatorios del nivel del control tienen valor, y ningún agente del alcance que lo evalúa tiene un parámetro obligatorio sin valor |
| Incompleto | Faltan ajustes comunes obligatorios («Falta «<parámetro>».») o algún agente no tiene valor para un parámetro obligatorio («Falta «<parámetro>» en N agentes.») |
| Inválido | Algún ajuste común tiene un valor inválido; se listan debajo |
| Sin configurar | Ningún ajuste común tiene valor |
| Sin añadir | El control existe en el catálogo pero no está en el documento; no se evalúa |

Mientras se leen los agentes, la columna muestra «Comprobando los agentes…». El detalle por agente está en «Asignación» y en la pestaña «Agentes».

### 5.1 Añadir un control del catálogo

1. Pulsar «Añadir con valores por defecto» en el control, o «Añadir los N que faltan con valores por defecto».

   Resultado esperado: el control pasa a «Sin configurar» o «Incompleto», con sus parámetros sin valor salvo los `defaultValue` de su bloque, y se abre con «Abrir».

2. Declarar sus ajustes comunes obligatorios (apartado 5.2).

   Resultado esperado: el estado pasa a «Configurado».

El botón añade la definición del control del bloque semilla de `config/`, como `inject-control.py` con un control ausente, sin modificar otros controles, plantillas ni ajustes de agentes. Para fusionar un control existente con una versión nueva de su bloque: `inject-control.py` ([actualización de un entorno existente, apartado 8](02-updating-an-existing-environment.md#8-sembrar-y-validar-la-configuración)).

> [!note]
> Mientras un control obligatorio tenga parámetros sin valor, sus evidencias quedan en `NO_EVALUABLE` con causa `CONFIGURATION`.

### 5.2 Ajustes comunes

1. Abrir el control con «Abrir».

   Resultado esperado: la página del control con «Ajustes comunes», «Plantillas» y «Asignación».

2. En «Ajustes comunes», pulsar «Configurar <control>» («Completar configuración», «Corregir configuración» o «Revisar configuración», según el estado), declarar los valores y guardar.

   Resultado esperado: el estado del control se actualiza. El desplegable «Valor común de los parámetros que cambian por agente» muestra el valor que toma un agente sin ajuste propio ni plantilla que fije el parámetro.

### 5.3 Plantillas

Una plantilla es un conjunto de valores con nombre para los parámetros por sistema y por plataforma de un control. Nunca fija un parámetro común.

- **De serie**: incluidas en el plugin, una por tipo de sistema en los controles en que aplica ese tipo, no editables. Si un valor no se puede fundamentar, la plantilla lo indica con «Sin valores de serie en este control: se aplican los ajustes comunes».
- **Propias**: se crean, se duplican, se editan y se borran en el documento (`configuration.templates`).

| Plantilla de serie | Tipo | Controles | Qué fija |
|---|---|---|---|
| Linux | Linux | Los controles que se miden en las máquinas | op.acc.1 P-01 `Local`, P-03 cuentas de sistema de Ubuntu, P-10 `1000`, P-11; op.acc.2 P-02 rutas críticas, P-10 SUID de Ubuntu 22.04 y 24.04, P-11, P-12; op.acc.3 P-03; op.acc.4 P-06; op.acc.6 P-03, P-07, P-08, P-11; op.exp.2 P-03; op.exp.3 P-01, P-04; op.exp.4 P-03, P-05; op.exp.6 P-01, P-04, P-07; op.exp.8 P-01, P-03, P-08; op.exp.10 P-02, P-08 |
| Servidor LDAP | Servidor LDAP | Los mismos que Linux | Lo de «Linux» más: op.acc.1 P-01 `LDAP` y las cuentas `zimbra` y `ldapcopy`; op.acc.2 P-02 con `/opt/zimbra/conf/localconfig.xml` y P-12 sin `adm`; op.acc.6 canal y exposición de slapd; op.exp.2 P-03 `admin` de Zimbra; op.exp.3 P-04 y op.exp.6 P-07 con las rutas de Zimbra; op.exp.4 P-03 con Zimbra; op.exp.8 P-01 y P-03 con slapd |
| Windows | Windows | op.acc.1, op.acc.2, op.acc.3 y op.acc.4 (los únicos con recolector para Windows) | op.acc.1 P-11 y op.acc.4 P-06 `Administrators` |
| Manager Wazuh | Manager Wazuh | Los controles que se miden en el manager | op.exp.8 P-01 y P-03 (auditd) y P-08 (`root`, `syslog`, `wazuh`, `wazuh-indexer`) |
| Copias con PBS | Linux | mp.info.6 | P-06 `/backup`, P-07 `root`, P-10 `pbs`, P-11 clave de PBS, P-12 `root.pxar`, P-13 testigo de restauración |
| Copias Zimbra NE | — | mp.info.6 | P-06 `/opt/zimbra/backup`, P-07 `zimbra`, P-10 `zimbra-ne` |

«Copias con PBS» y «Copias Zimbra NE» son alternativas de mp.info.6: no se aplican por tipo y se asignan a cada agente. Los datos de copias de mp.info.6 (`data.origen = pbs` o `data.origen = zimbra-ne`) las proponen en la asignación con «Propuesta por sus datos». Zimbra 10 Network con zmbackup no se combina con PBS.

La tabla de «Plantillas» muestra, por plantilla, la insignia «De serie» o «Propia», su tipo, cuántos parámetros fija y, en «Agentes», a cuántos está asignada y a cuántos se aplica por su tipo.

#### 5.3.1 Crear o duplicar una plantilla

1. Para duplicar, pulsar «Duplicar» en una plantilla.

   Resultado esperado: se guarda al momento una plantilla propia «<nombre> (copia)» con todos los valores de la original. Para cambiarle el nombre o los valores, pulsar después «Editar» en la copia (apartado 5.3.2).

2. Para crear una plantilla vacía, pulsar «Crear plantilla», escribir el nombre, la descripción y, si procede, el tipo de sistema; declarar los valores de los parámetros que fija y pulsar «Guardar plantilla».

   Resultado esperado: la plantilla aparece con la insignia «Propia». Un parámetro sin valor toma el valor común. Un valor inválido se rechaza con el motivo y no se guarda nada; un nombre que ya tiene otra plantilla del control, de serie o propia, también se rechaza.

El tipo de sistema de una plantilla propia es informativo: al asignarla a un agente de otro tipo, la vista previa lo avisa.

#### 5.3.2 Editar una plantilla propia

1. Pulsar «Editar» en la plantilla.

   Resultado esperado: la ventana «Editar plantilla · <control>» con «Asignada a N agente(s): …» si está en uso.

2. Cambiar los valores y pulsar «Guardar plantilla».

   Resultado esperado: si la plantilla está asignada, la ventana «Guardar «…»: cambia N agentes» con, por agente, los parámetros que cambian; tras pulsar «Guardar plantilla» (teclear antes `aplicar` si se pide), el cambio se aplica a esos agentes, salvo en los parámetros con ajuste propio. Sin agentes asignados, se guarda al momento.

Las plantillas de serie solo admiten «Ver» y «Duplicar».

#### 5.3.3 Borrar una plantilla propia

1. Pulsar «Borrar» en la plantilla.

   Resultado esperado: la ventana «Borrar la plantilla «…»». Si está asignada, indica a qué agentes y pide «Reasignar sus agentes a»: «La de serie de su tipo», otra plantilla del control o «Sin plantilla (valores comunes)».

2. Elegir la reasignación, teclear `borrar` si se pide y pulsar «Borrar».

   Resultado esperado: la plantilla desaparece y sus agentes pasan a la plantilla elegida. Una plantilla en uso no se borra sin reasignar sus agentes.

### 5.4 Asignación

La tabla «Asignación» lista los agentes del alcance y los perfiles guardados de agentes fuera de él, con cuatro columnas:

| Columna | Contenido |
|---|---|
| Agente | Id y nombre; abre la página del agente en ese control |
| Tipo | El tipo guardado o, si no lo está, «<tipo> (detectado, sin guardar)» |
| Plantilla | La que se aplica: la asignada, «… (de serie, por su tipo)», «Sin plantilla (valores comunes)», «Ninguna: valores comunes» o, con el tipo sin guardar, «Ninguna hasta guardar su tipo: valores comunes» y, sin tipo detectado, «Ninguna: sin tipo, valores comunes»; la propuesta por sus datos; y si el control no se evalúa en ese agente |
| Ajustes propios | Cuántos tiene, cuántos obligatorios quedan sin valor y si está fuera del alcance |

Para asignar una plantilla a varios agentes:

1. Marcar las casillas de los agentes, elegir en el desplegable «La de serie de su tipo», una plantilla o «Sin plantilla (valores comunes)», y pulsar «Asignar a N agente(s)…».

   Resultado esperado: la ventana «Asignar … en <control> a N agente(s)» con, por agente, el cambio de plantilla («… → …»), los parámetros que cambian de valor, los ajustes propios que siguen ganando, los obligatorios que se quedan sin valor y, si la plantilla es de otro tipo, el aviso «Tipo distinto».

2. Revisar cada agente y pulsar «Asignar»; si aparece «Tipo distinto» o «Se quedan sin valor parámetros obligatorios», teclear antes `aplicar`.

   Resultado esperado: la plantilla en la columna «Plantilla» de cada agente y las casillas vacías. Los ajustes propios se conservan.

### 5.5 Listas y expresiones regulares

En un campo de lista se escriben o se pegan varios elementos separados por comas, punto y coma o saltos de línea. Se descartan las entradas vacías y los duplicados. En op.acc.1 P-03 y P-04 el espacio también separa: `admin,test administrador` añade tres cuentas. En las demás listas el espacio forma parte del elemento: en op.acc.1 P-01, `Active Directory, Azure AD` añade dos fuentes. Los valores ya guardados no se vuelven a dividir.

Los parámetros cuyo juicio compara una lista plana admiten dos modos, «Texto exacto» y «Expresión regular», en los ajustes comunes, en las plantillas y en los ajustes propios de un agente:

| Control | Parámetros |
|---|---|
| op.acc.1 | P-03 Cuentas de servicio legítimas; P-04 Cuentas genéricas prohibidas |
| op.acc.4 | P-05 Usuarios autorizados acceso remoto |
| op.acc.6 | P-08 Puntos renovacion autenticacion; P-11 Exposiciones autenticacion admitidas |

Para declarar una expresión regular:

1. En «Ajustes comunes» (apartado 5.2), en «Crear plantilla» o «Editar» (apartado 5.3) o en «Dar ajuste propio» de un agente (apartado 6.2), elegir «Expresión regular» en «Modo de <parámetro>».

   Resultado esperado: el campo propone una expresión que coincide con los mismos nombres que «Texto exacto», con sus caracteres especiales escapados, y aparece «Probar con un valor». En op.acc.1 P-03 y P-04 y en op.acc.6 P-08, donde «Texto exacto» no distingue mayúsculas, la propuesta empieza por `(?i)`: `admin.*` y `guest` dan `(?i)^(?:admin\.\*|guest)$`, que sigue señalando `Admin` y `ADMIN`. En op.acc.4 P-05 y op.acc.6 P-11 dan `^(?:admin\.\*|guest)$`.

2. Escribir el patrón, sin barras `/…/`.

   Resultado esperado: un patrón inválido se marca en el campo con el motivo y la posición (por ejemplo, «Falta el corchete de cierre ] (posición 1).») y no se guarda.

3. Escribir un valor en «Probar con un valor».

   Resultado esperado: «Coincide con la expresión.» o «No coincide con la expresión.», con la misma comparación que la evaluación.

4. Guardar.

   Resultado esperado: tras guardar los ajustes comunes, el resumen muestra «Expresión regular: <patrón>»; una plantilla, la página del agente, el detalle del control y los informes muestran el valor igual.

Ejemplos:

```text
^svc_.*$                        Cuentas que empiezan por svc_
^(admin|test|administrador)$    Uno de esos tres nombres
(?i)^admin$                     admin sin distinguir mayúsculas
```

Reglas:

- Sintaxis RE2 (`re2js` 2.8.6), hasta 512 caracteres, sin espacios al principio ni al final. No admite lookaround ni referencias a grupos anteriores. El motor es lineal: un patrón no puede bloquear la evaluación.
- Se compara el valor completo y se distinguen mayúsculas y minúsculas; `(?i)` al principio deja de distinguirlas.
- Una coincidencia no es cumplimiento por sí sola: en una lista prohibida (op.acc.1 P-04) señala una cuenta prohibida; en una lista autorizada (op.acc.4 P-05), una cuenta admitida.
- Al cambiar de modo durante la edición se conservan los borradores de los dos modos. Se guarda solo el modo elegido y su valor.
- El modo se guarda junto al valor de su nivel: `matchMode` junto a `value` en los ajustes comunes, y `matchModes.<parámetro>` en la plantilla y en el control del agente. Solo se guarda `regex`; sin la clave, el valor es texto exacto. El patrón es texto en `value`, así que el tipo del campo en el índice no cambia.
- El modo va con el valor (apartado 4): una lista de una plantilla o de un ajuste propio se compara como texto exacto aunque el valor común sea una expresión regular, y al revés.
- Un patrón inválido recibido de una configuración externa deja la evidencia en `NO_EVALUABLE` con el motivo; `validate-configuration.ts` lo lista (apartado 11.2).
- Una configuración sin `matchMode` se compara como texto exacto, igual que en la 1.2.0.
- `inject-control.py` conserva el valor y su modo. Borrar la configuración del control quita los dos.

## 6. Pestaña «Agentes»

La pestaña lista los agentes del alcance con su tipo, las plantillas que usan y su completitud, y los perfiles guardados de agentes que ya no están en el alcance, con «fuera del alcance».

### 6.1 Tipo de sistema

El tipo de cada agente se detecta con la primera regla que se cumple:

| Orden | Regla | Tipo | Evidencia que se muestra |
|---|---|---|---|
| 1 | El agente es el manager de Wazuh (id `000`) | Manager Wazuh | «detectado por ser el manager de Wazuh» |
| 2 | `os.platform` es `windows` en el inventario de agentes | Windows | «detectado por el inventario de agentes (Windows)» |
| 3 | Hay hechos de ENSFácil con `data.plano = directorio` en los últimos 30 días | Servidor LDAP | «detectado por N datos del directorio LDAP en 30 días» |
| 4 | `os.platform` es de la familia Linux, o `os.uname` empieza por «Linux» | Linux | «detectado por el inventario de agentes (Ubuntu)» |
| 5 | `os.platform` trae un valor que no es de los anteriores | Sin detectar | «el sistema «…» no es un tipo previsto; se elige a mano» |
| 6 | El inventario no trae el sistema operativo | Sin detectar | «el inventario no trae su sistema operativo …; se elige a mano» |

El tipo que decide la plantilla de serie es el **guardado** en el perfil del agente. Mientras el tipo detectado no está guardado, las tablas lo muestran como «<tipo> (detectado, sin guardar)», la página del agente indica que su plantilla de serie se aplica al guardar el tipo, y las pestañas «Agentes» y «Controles» muestran «N agente(s) con el tipo detectado sin guardar». En una instalación nueva ninguna plantilla de serie se aplica hasta guardar los tipos. Un agente con el tipo corregido a mano no se cuenta.

1. Pulsar «Guardar los tipos detectados…».

   Resultado esperado: la ventana «Guardar el tipo detectado de N agente(s)» con los parámetros que cambian en cada agente al pasar a la plantilla de serie de su tipo.

2. Pulsar «Guardar los tipos» (teclear antes `aplicar` si se pide).

   Resultado esperado: el aviso desaparece y la columna «Plantillas» de la lista indica la plantilla de serie de cada tipo.

Para corregir el tipo de un agente:

1. Abrir el agente y elegir el tipo en «Tipo de sistema».

   Resultado esperado: si el cambio altera algún valor, la ventana «Cambiar el tipo de …» con lo que cambia; si no, se guarda directamente. El texto bajo el campo pasa a «corregido a mano (detectado: …, por …)».

2. Para volver al tipo detectado, elegir «El detectado: …».

   Resultado esperado: el texto vuelve a «detectado por …».

> [!note]
> Un servidor LDAP de Zimbra recién instalado, sin hechos todavía, se detecta como Linux: en el inventario es un Ubuntu más. Se corrige a mano con el procedimiento anterior.

### 6.2 Plantilla y ajustes propios de un agente

La página del agente agrupa por control los parámetros por sistema y por plataforma, con la plantilla, los ajustes propios y, por parámetro, su clase, si es obligatorio y el origen del valor.

Para cambiar la plantilla de un control:

1. Elegir en «Plantilla» «La de serie de su tipo («…»)» («La de serie de su tipo (tipo sin guardar)» mientras el tipo no está guardado), una plantilla del control o «Sin plantilla (valores comunes)», y pulsar «Asignar…».

   Resultado esperado: si cambia algún valor, la ventana con el cambio de plantilla y los parámetros que cambian; tras confirmarlo, la plantilla en la cabecera del control.

Para declarar un ajuste propio:

1. Pulsar «Dar ajuste propio» (o «Editar», si ya lo tiene), escribir el valor y pulsar «Guardar para este agente». En los parámetros del apartado 5.5, elegir antes el modo en «Modo de <parámetro>».

   Resultado esperado: el origen pasa a «ajuste propio de este agente». Un valor inválido se rechaza con el motivo y no se guarda.

2. Para volver a heredar, pulsar «Quitar ajuste propio (vuelve a heredar)», o vaciar el campo y guardar.

   Resultado esperado: el origen pasa a la plantilla o al valor común.

3. Para quitar todos los ajustes propios de un control, pulsar «Quitar ajustes propios» y confirmar.

   Resultado esperado: la ventana lista cada ajuste que se quita; tras confirmar, el control conserva su plantilla y sus parámetros vuelven a heredar.

Reglas del guardado:

- Un valor vacío no se guarda como ajuste propio: el agente vuelve a heredar.
- Un valor igual al que el agente ya heredaba, en el mismo modo, no se guarda como propio: sigue a su origen cuando cambie.
- Los guardados de una misma página se hacen en orden y sobre la versión más reciente del documento.

Los parámetros que describen máquinas (op.exp.7 P-04 y P-07, op.cont.3 P-07, op.mon.1 P-01, op.exp.8 P-02 y op.mon.3 P-01, P-03 y P-07 en un control que se mide en el manager, y el alcance declarado de mp.info.6) se declaran en cada agente solo con sus filas: la página enseña aparte «Del valor común», de solo lectura, y el botón es «Declarar filas de este agente». En la página del manager se enseña además «Lo que se evalúa en esta fila», la unión completa.

Cada guardado escribe el documento entero; el servidor guarda la versión anterior en el historial y una entrada en `auditTrail`.

### 6.3 Quitar ajustes que no se aplican

Un perfil puede guardar ajustes que no se aplican: el de un parámetro que el control ya no declara, el de un control que no está en la configuración, el de un parámetro común o un modo de comparación sin su ajuste propio. La página del agente los lista en «Ajustes de este agente que no se aplican», y la pestaña «Agentes» en «Ajustes de agentes que hay que corregir».

1. Pulsar «Quitar» junto al ajuste.

   Resultado esperado: el ajuste desaparece del documento; el resto del perfil se conserva.

2. Para un control entero que no está en la configuración, o para un perfil guardado con un nombre en lugar de un id, pulsar «Quitar» junto a él.

   Resultado esperado: la ventana «Quitar …» con cada dato que se borra (nombre, otros nombres, tipo corregido, plantillas asignadas y cada ajuste). Un perfil entero exige teclear `quitar`.

Lo que esta versión no conoce (una clave guardada por una versión posterior) se lista en «Datos de otra versión del plugin (se ignoran)» y no se quita. Una asignación a una plantilla que ya no existe se indica como error y el agente toma la plantilla de serie de su tipo.

### 6.4 Otros nombres de un agente

El reparto por agentes (apartado 9) reconoce a una máquina por su id, su nombre de agente y el nombre del equipo. Si las tablas la nombran de otra forma, ese nombre se declara en su página.

1. Escribir los nombres en «Otros nombres de este agente», separados por comas, y pulsar «Guardar otros nombres».

   Resultado esperado: los nombres se quedan en el campo tras guardar, y la pestaña «Agentes» deja de avisar de las filas que los usan.

## 7. Pestaña «General»

1. Abrir ENSFácil > Configuración > General.

   Resultado esperado: el formulario «Configuración global de evaluación» con el nivel ENS, los niveles de **Confidencialidad (C)**, **Integridad (I)**, **Trazabilidad (T)**, **Autenticidad (A)** y **Disponibilidad (D)**, cada uno con una línea que indica los controles que lo usan, y el resto de la configuración global, con «Descripción del alcance (informes)», el texto que describe el alcance en los informes; debajo, «Alcance ENS», en solo lectura, con «Agentes evaluados» y, según el modo, los grupos o los agentes.

2. Cambiar los niveles y pulsar «Guardar configuración global».

   Resultado esperado: «Configuración guardada». Una dimensión sin declarar es el nivel ENS. Un control con varias dimensiones se evalúa con la más alta. op.cont.2 y op.cont.3 solo aplican con D en ALTO. Si una dimensión supera el nivel ENS, aparece «Niveles incoherentes» y el botón no guarda: el nivel ENS es la categoría del sistema, el más alto de sus dimensiones.

   | Dimensiones | Controles |
   |---|---|
   | C, I, T y A | op.acc.2 a op.acc.6 |
   | T y A | op.acc.1 |
   | T | op.exp.8 |
   | D | mp.info.6, op.cont.2 y op.cont.3 |
   | ninguna | el resto, por la categoría (nivel ENS) |

El alcance se cambia con la [configuración inicial](https://gitlab.com/quersystem/ens-controls-runbook/initial-setup).

## 8. Conversión de una configuración de la 1.2.0

En la 1.2.0 las plantillas eran de plataforma y se aplicaban a cada agente para todos los controles. La 1.3.0 convierte el documento al cargarlo, sin cambiar ningún valor:

- Cada plantilla aplicada pasa a ser la plantilla asignada, de serie y con el mismo id, en cada control en que fijaba valores. «Copias con PBS» y «Copias Zimbra NE» pasan a mp.info.6.
- Si dos plantillas aplicadas fijaban valores en el mismo control y la segunda aportaba parámetros que la primera no fija, se crea una plantilla propia «<plantilla> + <plantilla> (de la 1.2.0)» con los valores de las dos, ganando la primera, y se asigna.
- En los controles en que el agente no tenía plantilla y la plantilla de serie de su tipo guardado fijaría valores, se asigna «Sin plantilla (valores comunes)», para que siga con el valor común como en la 1.2.0.
- Los ajustes propios, los otros nombres y el tipo se conservan tal cual. Una plantilla de la 1.2.0 que esta versión no conoce, y que tampoco se aplicaba, se descarta y se indica.
- La conversión es idempotente y no se escribe al cargar. La evaluación del servidor aplica la misma conversión al leer el documento, de modo que los veredictos son los mismos antes y después de guardarla.

Mientras la conversión no está guardada, Configuración muestra «Configuración de la 1.2.0 convertida a plantillas por control» con el resumen.

1. Copiar el documento `active` según la [instalación desde cero, apartado 14.2](01-installation-from-scratch.md#142-copiar-el-documento-antes-de-modificarlo).

   Resultado esperado: `COPIA_OK`.

2. Pulsar «Guardar la conversión», o guardar cualquier otro cambio de Configuración.

   Resultado esperado: el aviso desaparece y la versión de la 1.2.0 queda en el historial. Con «Guardar la conversión», la entrada de `auditTrail` es «Conversión de la configuración 1.2.0: …».

3. Validar el documento entero (apartado 11.2).

   Resultado esperado: `VALID STRUCTURE` y `VALID AGENT AND TEMPLATE SETTINGS.`

## 9. Reparto por agentes de filas comunes

Tablas con una columna que nombra el sistema (`sistema`, `activo`, `equipo`, `servidor`, `perfil`, `ambito`…) declaradas como valor común antes de la 1.2.0. «Repartir por agentes» copia esas filas a cada agente como ajuste propio, sin perder ninguna ni dejar a ningún agente sin valor:

- Las filas de las tablas con columna de sistema que nombran a un agente se **copian** a ese agente. El agente se reconoce por su id, su nombre, el hostname de `os.uname`, la parte corta de ambos (antes del primer punto) y sus otros nombres (apartado 6.4), sin distinguir mayúsculas.
- Una fila copiada **sale** del valor común solo si con eso ningún agente del alcance que evalúa el control se queda sin valor. Si no, la fila se queda también en el valor común.
- Las filas `*` se quedan en el valor común y se copian también al agente que recibe filas propias, porque su ajuste propio sustituye al valor común.
- Las filas que no nombran a ningún agente, o que nombran a varios, se quedan en el valor común y se listan como aviso.
- Dos filas son la misma solo si son idénticas: las mayúsculas cuentan (`Ana` y `ana` son dos cuentas).
- No se tocan las listas de alcance (mp.info.6 P-04, op.acc.1 P-02, op.acc.2 P-01), las tablas por sistema sin columna de sistema (rutas, ACL, matrices de privilegios) ni las listas que mezclan plataformas.
- Nada se borra: un parámetro común que se queda sin filas pierde la clave `value` (nunca se escribe `null`). Es idempotente.

La pestaña «Agentes» calcula el reparto al cargarse, sin escribir: si hay filas que copiar, muestra «Hay filas del valor común que son de un agente concreto», el resumen, el detalle en «Ver qué se mueve y qué se copia» y el botón «Repartir por agentes». Si el alcance ENS no tiene ningún agente, el botón aparece desactivado con el aviso ««Repartir por agentes» no está disponible: el alcance ENS no tiene ningún agente».

### 9.1 Repartir

1. Copiar el documento `active` según la [instalación desde cero, apartado 14.2](01-installation-from-scratch.md#142-copiar-el-documento-antes-de-modificarlo).

   Resultado esperado: `COPIA_OK`.

2. Abrir ENSFácil > Configuración > Agentes, revisar «Ver qué se mueve y qué se copia» y los avisos.

   Resultado esperado: cada línea indica agente, control, parámetro, número de filas y si salen del valor común o se copian; cada aviso indica la fila y el nombre que no casa.

3. Pulsar «Repartir por agentes».

   Resultado esperado: la ventana «Repartir por agentes» con, por agente, lo que se mueve y lo que se copia; «Parámetros que se quedarían sin valor en algún agente del alcance: ninguno»; y los avisos de veredictos y del historial.

4. Teclear `repartir` y pulsar «Repartir».

   Resultado esperado: el aviso «Reparto por agentes: … La versión anterior queda en el historial.» y la desaparición del bloque de reparto.

5. Validar el documento entero (apartado 11.2).

   Resultado esperado: `VALID STRUCTURE` y `VALID AGENT AND TEMPLATE SETTINGS.`

6. Para una fila que nombra un agente del alcance con otro nombre, declarar ese nombre en el agente (apartado 6.4) y repetir los pasos 2 a 5.

   Resultado esperado: el aviso de esa fila desaparece y la fila aparece en «Ver qué se mueve y qué se copia».

## 10. Abrir Configuración desde la URL

| URL (consulta) | Se abre |
|---|---|
| `?tabView=configuration&configControl=op.acc.1` | «Controles», página de op.acc.1 |
| `?tabView=configuration&configControl=op.acc.1&configParam=P-04` | La misma página, con los ajustes comunes abiertos en P-04 |
| `?tabView=configuration&configView=agentes` | «Agentes», lista de agentes |
| `?tabView=configuration&configView=general` | «General» |
| `?tabView=configuration&configAgent=001` | «Agentes», página del agente 001 |
| `?tabView=configuration&configAgent=001&configControl=op.acc.1&configParam=P-07` | La página del agente 001 con op.acc.1 desplegado y P-07 en edición |

Un enlace de la 1.2.0 con `configView=sistemas` abre «Agentes».

Desde el Detalle del control, «Configurar este control» y las insignias de parámetro de cada no conformidad añaden a la URL `control` (el control del detalle), `agentId` (la máquina elegida) y `configBack=plugins`. Con una máquina elegida y un parámetro por sistema o por plataforma, se abre la página de ese agente en «Agentes»; con un parámetro común, o sin máquina, la página del control en «Controles». Configuración muestra entonces «Volver al detalle de op.acc.1 (001)», que vuelve al mismo control y a la misma máquina; mientras está, es la única vuelta (no aparece «Volver a controles» ni «Volver a agentes»).

Resultado esperado: tras guardar y pulsar «Volver al detalle de …», el Detalle del control muestra el mismo control y la misma máquina, y la URL ya no lleva ningún parámetro `config*`.

Si el control no está en el documento, la pestaña «Controles» lo indica y lo resalta en la lista; si no es ningún control del catálogo, lo dice. Un agente que no está en el inventario ni en la configuración se abre con un aviso. La navegación dentro de Configuración actualiza la URL, de modo que el botón «atrás» del navegador vuelve a la vista anterior.

## 11. Desde el servidor

Las herramientas de `config/` se ejecutan con el certificado de administrador del indexer, como en la [instalación desde cero, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens):

```bash
CERT="OS_CERT=/etc/wazuh-indexer/certs/admin.pem OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem"
```

### 11.1 Declarar la plantilla y los ajustes de un agente con set-parameters.py

`set-parameters.py` admite, además de los valores comunes, una sección `agents` con, por id de agente y por control, la plantilla asignada (`template`) y los ajustes propios:

```json
{
  "op.acc.1": { "P-04": ["admin", "test"] },
  "agents": {
    "001": {
      "op.acc.1": { "template": "linux-ubuntu", "P-07": ["usuario1 | servidor1 | Administrador de sistema"] },
      "op.acc.2": { "template": "custom-servidores-web" },
      "op.exp.2": { "template": "none" },
      "op.exp.4": { "template": null, "P-04": null }
    }
  }
}
```

Reglas:

- `template` es el id de una plantilla de serie del control (`linux-ubuntu`, `zimbra-ldap`, `windows-server`, `manager-wazuh`, `pbs-backup` o `zimbra-ne-backup`, las que tenga ese control) o de una plantilla propia del mismo control; `none` deja el agente sin plantilla (valores comunes); `null` quita la asignación y vuelve la plantilla de serie de su tipo. Sin la clave `template`, la asignación no cambia.
- Un documento de la 1.2.0 no admite `template`: se guarda antes la conversión desde Configuración (apartado 8).
- La clave del agente es su id; `7` se normaliza a `007`. Un nombre se rechaza y, si el documento ya lo conoce, se indica el id.
- Solo admiten ajuste propio los parámetros por sistema y por plataforma; uno común se rechaza.
- Vacío es sin valor: `null`, `""` y `[]` quitan el ajuste propio, que vuelve a heredar, y en los valores comunes quitan la clave `value`. En el documento nunca se escribe `null`.
- Quitar se admite siempre, también un ajuste que no se aplica.
- El valor de cada parámetro nombrado se sustituye entero.
- Una expresión regular (apartado 5.5) se declara con un objeto, en los valores comunes y en un agente: `"P-04": { "value": "^(admin|guest)$", "matchMode": "regex" }`. Un valor sin objeto es texto exacto y quita el modo que hubiera; vaciar el valor quita también su modo. Se comprueban el modo, el parámetro, la longitud y que no empiece ni termine con espacios; la sintaxis RE2 la comprueba `validate-configuration.ts` (apartado 11.2).
- La herramienta lee la clasificación de `common/ens/configuration/agents/parameter-classes.ts`: se ejecuta desde `config/` dentro del repositorio completo del plugin.

```bash
cd /opt/ensfacil/repo/config
sudo env $CERT python3 set-parameters.py /ruta/agentes.json            # plan
sudo env $CERT python3 set-parameters.py /ruta/agentes.json --apply    # escribe
```

Resultado esperado: sin `--apply`, una línea por cambio bajo `── agent 001` (`op.acc.1 template (the built-in of its type)  ->  linux-ubuntu` para una asignación) y `DRY-RUN: nothing written`; con `--apply`, `Previous version saved in: history of wazuh-ens-configuration (…)` y `<n> change(s) written to wazuh-ens-configuration/active`. Ante un control no sembrado, un parámetro que no existe, un parámetro común, una plantilla que el control no tiene, un nombre en lugar de un id o un valor con forma imposible, la herramienta muestra `ERROR:` y no escribe nada.

> [!note]
> En Docker ([Wazuh en Docker, apartado 10](06-wazuh-in-docker.md#10-declarar-la-política-niveles-de-las-dimensiones)), la sección `agents` necesita el repositorio completo montado: `-v <repo>:/repo:ro -w /repo/config` en lugar de `-v <repo>/config:/cfg:ro -w /cfg`.

Las plantillas propias se crean y se editan en la pantalla (apartado 5.3).

### 11.2 Validar el documento

`config/validate-configuration.ts` comprueba también los valores comunes, las plantillas propias y los ajustes de los agentes ([instalación desde cero, apartado 14.4](01-installation-from-scratch.md#144-validar-el-documento-entero)):

```bash
cd /opt/ensfacil/repo
npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive
npx --yes tsx config/validate-configuration.ts /opt/ensfacil/artifacts/active-now.json
```

Resultado esperado: `Done` tras la instalación de las dependencias; después, `VALID STRUCTURE: the plugin will load this configuration.`, la línea `custom templates: …`, una línea por agente con su tipo, sus plantillas asignadas y sus ajustes propios, y `VALID AGENT AND TEMPLATE SETTINGS.` Sin ajustes de agentes, la línea es `agents with settings: none (everything is evaluated with each control's common value)`. Con un documento de la 1.2.0, la línea `1.2.0 document: Conversión de la configuración 1.2.0: …` resume la conversión y el resto se valida sobre el documento convertido.

| Mensaje | Significado | Actuación |
|---|---|---|
| `INVALID STRUCTURE` con `configuration.agents…` o `configuration.templates…` | Un valor `null` o un objeto en un agente o en una plantilla, un modo que no es `exact` ni `regex` en `matchModes`, o un campo conocido con un tipo que no es el suyo: el plugin no carga el entorno | Restaurar la copia y corregir el dato indicado |
| `INVALID COMMON VALUES` | Un valor común que no es válido para su parámetro, por ejemplo una expresión regular escrita con `set-parameters.py` que no compila: el control queda «Inválido» | Corregir el valor en «Ajustes comunes» o con `set-parameters.py` |
| `INVALID AGENT OR TEMPLATE SETTINGS` con «no se aplica» | Un perfil guardado con un nombre en lugar de un id, un control o un parámetro que no existen, un parámetro común o un modo de comparación sin ajuste propio: el ajuste se ignora | Quitarlo con «Quitar» (apartado 6.3) o con `set-parameters.py` y `null` |
| `INVALID AGENT OR TEMPLATE SETTINGS` con «se evalúa con una configuración inválida» | Un valor que no es válido para su parámetro | Corregir el valor en la página del agente o con `set-parameters.py` |
| `INVALID AGENT OR TEMPLATE SETTINGS` con «la plantilla asignada «…» no existe» | Una asignación a una plantilla borrada o de otra versión: el agente toma la de serie de su tipo | Asignar otra plantilla (apartados 5.4 o 6.2) |
| `INVALID AGENT OR TEMPLATE SETTINGS` con `plantilla <id>` | Una plantilla propia con un id reservado o repetido, de un control que no está o con un valor inválido | Corregir o borrar la plantilla (apartado 5.3) |
| `INVALID AGENT OR TEMPLATE SETTINGS` con «Expresión regular inválida» o «no admite expresiones regulares» | Un patrón que no compila o un modo «Expresión regular» en un parámetro que no lo admite: la evidencia queda en `NO_EVALUABLE` | Corregir el patrón o volver a «Texto exacto» (apartado 5.5) |
| `warnings (…)` | Claves de una versión posterior del plugin, nombres de plantilla repetidos, plantillas de la 1.2.0 sin convertir o un modo de comparación sin valor en una plantilla | Ninguna: no cambian la salida |

### 11.3 Sembrar controles

`inject-control.py` conserva `configuration.agents` y `configuration.templates` en cada siembra, también con `--sustituir`, y en la fusión conserva el `matchMode` de cada valor común. Si el bloque ya no declara un parámetro y un agente o una plantilla propia tenía valor para él, el plan muestra `AVISO: valores de parámetros retirados, quedan huérfanos: …`; esos valores no se aplican y se quitan como en el apartado 6.3 o editando la plantilla. Al sembrar un control nuevo no se crean plantillas, asignaciones ni ajustes de agentes.

## 12. Compatibilidad y vuelta atrás

- Las plantillas propias van en la clave de primer nivel `configuration.templates`, y la asignación de cada agente en `configuration.agents.<id>.controls.<control>.templateId`, junto a sus ajustes propios en `parameters`. `controls[].parameters[].value` sigue siendo el valor común, que es lo que leen un plugin 1.1.0, el chatbot y los scripts.
- Un plugin 1.2.0 carga un documento de la 1.3.0: su validador no comprueba claves desconocidas, ignora `templates` y avisa de `templateId` como clave que no conoce. Evalúa con los ajustes propios y con el valor común, sin las plantillas asignadas.
- El servidor de la 1.3.0 rechaza con el error 400 un guardado cuyo `agents` o `templates` no tiene la forma correcta o con un `matchMode` que no es `exact` ni `regex` en un valor común, y conserva los existentes cuando el cuerpo no trae la clave.
- Un plugin 1.2.0 ignora `matchMode` y `matchModes` y compara un patrón como un nombre literal. Antes de volver a la 1.2.0 se pasan esos valores a «Texto exacto» o se restaura una versión del documento sin ellos.
- Un modo de comparación que la versión instalada no conoce impide cargar el entorno ENS. Antes de volver de una versión posterior que añada modos, se pasan esos valores a «Texto exacto» o «Expresión regular», o se restaura una versión del documento sin ellos.
- **Cada versión del documento queda en el historial antes de sustituirse**, con independencia de quién escribe: el servidor la añade al historial si no es ya su última entrada, también en la conversión de la 1.2.0 y en el reparto por agentes; y `inject-control.py` y `set-parameters.py` guardan la versión que sustituyen antes de escribir, en el historial o, si el índice no lo admite, en un fichero local `active-antes-<fecha>.json`. Las dos indican dónde quedó con `Previous version saved in: …`.
- Para volver a la 1.2.0 basta con desplegar su zip ([instalar desde una release, apartado 15](07-installing-from-a-release.md#15-cambiar-de-versión-o-desinstalar)). Para que la 1.2.0 evalúe con sus plantillas, se restaura la versión del documento anterior a la conversión. Para volver a la 1.1.0 después de «Repartir por agentes», se restaura la versión anterior al reparto.

Para restaurar una versión anterior, con la copia del apartado 8 o 9.1, paso 1, se sigue la [guía de diagnóstico y rollback](04-troubleshooting-and-rollback.md#7-restaurar-la-configuración-ens). Sin esa copia, se usa la versión del historial:

1. Listar las últimas versiones del historial:

   ```bash
   C="--cacert /etc/wazuh-indexer/certs/root-ca.pem --cert /etc/wazuh-indexer/certs/admin.pem --key /etc/wazuh-indexer/certs/admin-key.pem"
   sudo curl -s $C "https://127.0.0.1:9200/wazuh-ens-configuration/_search?q=documentType:CONFIGURATION_HISTORY&sort=createdAt:desc&size=10&filter_path=hits.hits._id,hits.hits._source.createdAt,hits.hits._source.createdBy,hits.hits._source.configuration.changeReason&pretty"
   ```

   Resultado esperado: las versiones de la más reciente a la más antigua, con su `_id`. La anterior a la conversión es la que va justo después del primer guardado desde la 1.3.0 («Conversión de la configuración 1.2.0: …» si se guardó con «Guardar la conversión»); la anterior al reparto, la que va justo después de «Reparto por agentes: …».

2. Copiarla como documento activo, con el `_id` del paso 1:

   ```bash
   ID=<_id de la versión que se restaura>
   sudo curl -s $C "https://127.0.0.1:9200/wazuh-ens-configuration/_doc/$ID" -o /opt/ensfacil/artifacts/historial.json
   sudo python3 -c "import json,sys; d=json.load(open(sys.argv[1])); s=d['_source']; s['documentType']='ACTIVE_CONFIGURATION'; json.dump({'_source': s, 'found': True}, open(sys.argv[2],'w'), ensure_ascii=False)" \
     /opt/ensfacil/artifacts/historial.json /opt/ensfacil/artifacts/active-desde-historial.json
   ```

   Resultado esperado: el fichero `/opt/ensfacil/artifacts/active-desde-historial.json`.

3. Restaurar ese fichero según la [guía de diagnóstico y rollback](04-troubleshooting-and-rollback.md#7-restaurar-la-configuración-ens), con `COPIA=/opt/ensfacil/artifacts/active-desde-historial.json`.

   Resultado esperado: la respuesta incluye `"result":"updated"`.
