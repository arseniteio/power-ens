# Configuración por sistema y plantillas

Esta guía describe la configuración por sistema que incorpora ENSFácil 1.2.0: los dos niveles de la pantalla de Configuración, la detección del tipo de cada sistema, las plantillas, la herencia de valores, la migración de una configuración anterior y la declaración de valores por sistema desde el servidor.

## 1. Objetivo

Declarar la política común una sola vez, en el nivel de la organización, y declarar en cada sistema del alcance solo lo que es propio de esa máquina (sus cuentas, servicios, rutas, criticidad o responsable) o de su plataforma (Linux, servidor LDAP de Zimbra, Windows, manager de Wazuh).

## 2. Requisitos previos

| Requisito | Comprobación |
|---|---|
| Plugin ENSFácil 1.2.0 o posterior desplegado | ENSFácil > Configuración muestra las pestañas «Organización» y «Sistemas» |
| Usuario con el rol `ensfacil_admin` o `all_access` | Un guardado desde Configuración no devuelve el error 403 ([instalación desde cero, apartado 13.5](01-installation-from-scratch.md#135-crear-el-rol-ensfacil_admin)) |
| Documento `active` creado y controles sembrados | [Instalación desde cero, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens) |
| Copia del documento `active` antes de cada cambio desde el servidor | [Instalación desde cero, apartado 14.2](01-installation-from-scratch.md#142-copiar-el-documento-antes-de-modificarlo) |

> [!note]
> El alcance ENS (qué agentes entran) no se edita en Configuración: se define en la [configuración inicial](https://gitlab.com/quersystem/ens-controls-runbook/initial-setup). La pestaña «Sistemas» lista los agentes de ese alcance.

## 3. Los dos niveles de Configuración

Cada parámetro de cada control pertenece a una de tres clases. La clasificación es única y la usan la pantalla, la evaluación, el validador y `set-parameters.py`; está en `public/ens/configuration/agents/parameter-classes.ts`.

| Clase | Qué describe | Parámetros (23 controles) | Dónde se declara |
|---|---|---|---|
| Organización | Política común: periodicidades, umbrales, roles, registros, procedimientos, documentos, nube, plan de continuidad | 163 | Pestaña «Organización», en la ficha de cada control |
| Por sistema | El estado de una máquina concreta: sus cuentas, servicios, rutas, ACL, claves, calendario de copia, criticidad o responsable | 41 | Pestaña «Sistemas», dentro de cada agente |
| Por plataforma | Lo que depende del sistema operativo o del producto y es igual en todas las máquinas de esa plataforma | 35 | Pestaña «Sistemas», dentro de cada agente, normalmente con una plantilla |

En la ficha de un control de la pestaña «Organización» se muestran arriba los parámetros de organización, y el estado del control («Configurado», «Configuración incompleta») se calcula solo con ellos. Los parámetros por sistema y por plataforma aparecen en el desplegable «Valores que heredan los sistemas»: su valor es el que hereda una máquina sin valor propio ni plantilla que lo fije.

## 4. Cómo se resuelve un valor

Para evaluar un control en la fila de una máquina, cada parámetro por sistema o por plataforma toma el primer valor disponible en este orden:

1. el valor propio del agente;
2. el de sus plantillas, en el orden en que están aplicadas (gana la primera que fija el parámetro);
3. el de la organización.

Los parámetros de organización salen siempre de la organización.

Reglas de la resolución:

- Se sustituye el parámetro **entero**: una tabla del agente reemplaza a la de la organización, sin mezclar filas. Es el mismo criterio que `set-parameters.py`.
- Los parámetros por sistema que describen **otras** máquinas en un control que se mide en el manager se resuelven por **unión**: en la fila del manager, el valor es el de la organización más las filas de cada agente (valor propio o de plantilla), sin repetir. Son op.exp.7 P-04 y P-07, op.cont.3 P-07, op.mon.1 P-01 y, en la fila del manager, op.exp.8 P-02 y op.mon.3 P-01, P-03 y P-07.
- El alcance declarado de mp.info.6 (P-04) también se resuelve por unión, en todas las filas: el motor lo lee entero para saber en qué máquinas se mide el control.
- Sin valores por sistema, la evaluación recibe exactamente la configuración de la organización, y los veredictos son los mismos que en la 1.1.0.

La pantalla indica el origen de cada valor de un sistema: «valor propio de este sistema», «heredado de la plantilla …», «heredado de la organización» o, en una unión, «este sistema no aporta filas propias».

## 5. Detección del tipo de sistema

La pestaña «Sistemas» detecta el tipo de cada agente con la primera regla que se cumple:

| Orden | Regla | Tipo | Evidencia que se muestra |
|---|---|---|---|
| 1 | El id del agente es `000` | Manager | «el id 000, que en Wazuh es siempre el manager» |
| 2 | `os.platform` es `windows` en el inventario de agentes | Windows | «os.platform = windows en el inventario de agentes» |
| 3 | Hay hechos de ENSFácil con `data.plano = directorio` en los últimos 30 días | LDAP (Zimbra) | «N hechos del recolector LDAP (data.plano = directorio) en 30 días» |
| 4 | `os.platform` es de la familia Linux, o `os.uname` empieza por «Linux» | Linux | «os.platform = ubuntu en el inventario de agentes» |
| 5 | El inventario no trae el sistema operativo | Sin detectar | «el inventario no trae su sistema operativo …; se elige a mano» |

Además, los hechos de mp.info.6 con `data.origen = pbs` proponen el añadido «Copias con PBS», y los que traen `data.origen = zimbra-ne`, el añadido «Copias Zimbra NE». Proponer una plantilla no la aplica.

El inventario sale de `wazuh-monitoring-*` y los hechos, de una única agregación sobre `wazuh-alerts-*` de los últimos 30 días, sin descargar documentos.

> [!note]
> Un servidor LDAP de Zimbra recién instalado, sin hechos todavía, se detecta como Linux: en el inventario es un Ubuntu más. Se corrige a mano con el procedimiento siguiente.

### 5.1 Corregir el tipo a mano

1. Abrir ENSFácil > Configuración > Sistemas y pulsar el agente.

   Resultado esperado: se abre la página del agente con el campo «Tipo de sistema» y, debajo, el texto «detectado por …».

2. Elegir el tipo en «Tipo de sistema».

   Resultado esperado: el texto pasa a «corregido a mano (detectado: …, por …)» y la lista de sistemas muestra el tipo nuevo.

3. Para volver al tipo detectado, elegir «El detectado: …».

   Resultado esperado: el texto vuelve a «detectado por …».

El tipo corregido decide qué plantilla se propone y, en Windows, qué controles cuentan para la completitud. No cambia por sí solo ningún valor.

## 6. Plantillas

Una plantilla fija parámetros por plataforma y, cuando hay un valor fundamentado, siembra parámetros por sistema. Nunca toca un parámetro de organización. Cada valor sale de un ejemplo del bloque semilla, del `.env.example` o la plantilla de configuración de un runbook, o de un valor real de un laboratorio sin lo que es de otra plataforma o de esa instalación. Lo que no se puede fundamentar se queda sin valor. Las plantillas van con el plugin: cambian con su versión y el documento guarda qué plantillas tiene cada agente, no una copia de sus valores.

| Plantilla | Tipo | Qué fija | Qué deja sin valor |
|---|---|---|---|
| Linux Ubuntu | plataforma | op.acc.1 P-01 `Local`, P-03 cuentas de sistema de Ubuntu, P-10 `1000`, P-11; op.acc.2 P-02 rutas críticas, P-10 SUID de Ubuntu 22.04 y 24.04, P-11, P-12; op.acc.3 P-03; op.acc.4 P-06; op.acc.6 P-03, P-07, P-08, P-11; op.exp.2 P-03; op.exp.3 P-01, P-04; op.exp.4 P-03, P-05; op.exp.6 P-01, P-04, P-07; op.exp.8 P-01, P-03, P-08; op.exp.10 P-02, P-08 | op.acc.4 P-04 (puerto y origen de SSH de cada organización), op.exp.2 P-01 (la primera columna nombra la máquina), op.exp.6 P-08 |
| Servidor LDAP Zimbra | plataforma | Lo de «Linux Ubuntu» más: op.acc.1 P-01 `LDAP` y las cuentas `zimbra` y `ldapcopy`; op.acc.2 P-02 con `/opt/zimbra/conf/localconfig.xml` y P-12 sin `adm`; op.acc.6 canal y exposición de slapd; op.exp.2 P-03 `admin` de Zimbra; op.exp.3 P-04 y op.exp.6 P-07 con las rutas de Zimbra; op.exp.4 P-03 con Zimbra; op.exp.8 P-01 y P-03 con slapd | Las cuentas de Zimbra con sufijo aleatorio (`spam.*`, `ham.*`, `virus-quarantine.*`, `galsync.*`): son de cada instalación y se declaran como valor propio |
| Windows Server | plataforma | op.acc.1 P-11 y op.acc.4 P-06 `Administrators` | op.acc.1 P-01 (aislado o en dominio), op.acc.1 P-10 y op.acc.2 P-07, P-10 y P-11 (son de Linux), op.acc.4 P-04 (el origen permitido). Solo op.acc.1, op.acc.2, op.acc.3 y op.acc.4 tienen recolector para Windows: el resto de controles no se mide en esta plataforma, lo que no equivale a un incumplimiento |
| Manager Wazuh | plataforma | op.exp.8 P-01 y P-03 (auditd) y P-08 (`root`, `syslog`, `wazuh`, `wazuh-indexer`) | El resto de lo que se mide en el manager es política de organización |
| Copias con PBS | añadido | mp.info.6 P-06 `/backup`, P-07 `root`, P-10 `pbs`, P-11 clave de PBS, P-12 `root.pxar`, P-13 testigo de restauración | — |
| Copias Zimbra NE | añadido | mp.info.6 P-06 `/opt/zimbra/backup`, P-07 `zimbra`, P-10 `zimbra-ne` | mp.info.6 P-11, P-12 y P-13 (son de PBS) |

Reglas de aplicación:

- Una máquina tiene una sola plantilla de plataforma: aplicar otra sustituye a la anterior y conserva los añadidos.
- «Copias con PBS» y «Copias Zimbra NE» no se combinan: el plugin rechaza la segunda con el motivo. Zimbra 10 Network con zmbackup no se mezcla con PBS.
- Las plantillas de plataforma van antes que los añadidos; en la resolución gana la primera que fija cada parámetro.

### 6.1 Aplicar una plantilla a uno o varios sistemas

1. Abrir ENSFácil > Configuración > Sistemas.

   Resultado esperado: la tabla de sistemas con su tipo, sus plantillas y su completitud.

2. Marcar las casillas de los sistemas, elegir la plantilla en el desplegable de encima de la tabla y pulsar «Aplicar a N sistema(s) seleccionado(s)».

   Resultado esperado: el aviso «… aplicada a …» y la plantilla en la columna «Plantillas» de cada sistema. Si algún sistema no la admite, el aviso indica cuál y por qué.

3. Para un solo sistema, abrir el agente, elegir la plantilla en «Plantillas aplicadas» (las propuestas llevan «(propuesta)») y pulsar «Aplicar».

   Resultado esperado: la plantilla aparece en «Plantillas aplicadas» y los parámetros que fija muestran «heredado de la plantilla …».

4. Para quitar una plantilla, pulsar la cruz de su etiqueta en «Plantillas aplicadas».

   Resultado esperado: la etiqueta desaparece y esos parámetros vuelven a heredar de la organización, salvo los que tengan valor propio.

## 7. Valores propios de un sistema

Dentro de cada agente, los parámetros por sistema y por plataforma se agrupan por control. Cada uno muestra su clase («por sistema» o «por plataforma»), si es obligatorio al nivel del control y el origen de su valor.

1. Abrir el agente y desplegar el control.

   Resultado esperado: cada parámetro con su valor efectivo y su origen.

2. Pulsar «Dar valor propio» (o «Editar», si ya lo tiene), escribir el valor y pulsar «Guardar para este sistema».

   Resultado esperado: el origen pasa a «valor propio de este sistema». Un valor que no es válido para el parámetro se rechaza con el motivo y no se guarda. Un valor igual al que el sistema ya heredaba no se guarda como propio.

3. Para volver a heredar, pulsar «Quitar valor propio (vuelve a heredar)».

   Resultado esperado: el origen pasa a «heredado de la plantilla …» o a «heredado de la organización».

En una unión (apartado 4), el valor que se edita en un agente es solo lo que aporta ese sistema; la página lo indica con «Se evalúa como UNIÓN …». Los controles que se miden en el manager aparecen en cada agente con la etiqueta correspondiente: sus filas se juntan en la fila del manager.

Cada guardado escribe el documento entero; el servidor guarda la versión anterior en el historial y una entrada en `auditTrail`.

## 8. Migración a sistemas

Antes de la 1.2.0, lo que era de una máquina se declaraba en la organización: tablas con una columna que nombra el sistema (`sistema`, `activo`, `equipo`, `servidor`, `perfil`, `ambito`…) y listas que mezclan máquinas. La migración reparte esas filas sin perder ninguna:

- Las filas de las tablas con columna de sistema que nombran a un agente pasan a ese agente. El agente se reconoce por su id, su nombre, el hostname de `os.uname`, la parte corta de ambos (antes del primer punto) y los alias guardados en su perfil, sin distinguir mayúsculas.
- Las filas `*` se quedan en la organización y se copian también al agente que recibe filas propias, porque su valor propio sustituye al de la organización.
- Las filas que no nombran a ningún agente, o que nombran a varios, se quedan en la organización y se listan como aviso.
- No se tocan las listas de alcance (mp.info.6 P-04, op.acc.1 P-02, op.acc.2 P-01), las tablas por sistema sin columna de sistema (rutas, ACL, matrices de privilegios) ni las listas que mezclan plataformas: se reparten en cada agente o con una plantilla.
- Nada se borra: un parámetro de la organización que se queda sin filas pierde la clave `value` (nunca se escribe `null`), y la versión anterior del documento queda en el historial.
- Es idempotente: sobre un documento ya migrado no cambia nada.

La pestaña «Sistemas» calcula la migración al cargarse, sin escribir: si hay filas que mover, muestra «Hay valores de organización que son de un sistema concreto», el resumen, el detalle en «Ver qué se mueve» y el botón «Migrar a sistemas». Los avisos de filas sin agente se muestran siempre que existan.

### 8.1 Migrar

1. Copiar el documento `active` según la [instalación desde cero, apartado 14.2](01-installation-from-scratch.md#142-copiar-el-documento-antes-de-modificarlo).

   Resultado esperado: `COPIA_OK`.

2. Abrir ENSFácil > Configuración > Sistemas, revisar «Ver qué se mueve» y los avisos.

   Resultado esperado: cada movimiento indica control, parámetro, agente y número de filas; cada aviso indica la fila y el nombre que no casa.

3. Pulsar «Migrar a sistemas».

   Resultado esperado: el aviso «Migración a sistemas: N fila(s) de M parámetro(s) pasan a K agente(s)…» y la desaparición del bloque de migración. Los avisos de filas sin agente siguen visibles.

4. Validar el documento entero (apartado 11.2).

   Resultado esperado: `ESTRUCTURA VÁLIDA` y `VALORES POR SISTEMA VÁLIDOS.`

Para una fila que nombra una máquina del alcance con otro nombre, añadir el valor en el agente (apartado 7) y quitar la fila de la organización en la ficha del control.

## 9. Controles del catálogo sin añadir

La pestaña «Organización» lista, en «Controles del catálogo sin añadir», los controles que existen en la versión del plugin pero no están en el documento. No se evalúan hasta que se añaden.

1. Pulsar «Añadir con valores por defecto» en el control, o «Añadir los N con valores por defecto».

   Resultado esperado: el control aparece en «Controles configurables» con sus parámetros sin valor (salvo los `defaultValue` de su bloque), y desaparece de la lista de controles sin añadir.

2. Declarar sus parámetros obligatorios.

   Resultado esperado: el estado del control pasa a «Configurado» cuando están todos.

El botón añade la definición del control tal cual, la misma que el bloque semilla de `config/`, igual que `inject-control.py` con un control que no estaba. No modifica los demás controles ni los valores por sistema. Para fusionar un control que ya está con una versión nueva de su bloque se sigue usando `inject-control.py` ([actualización de un entorno existente, apartado 8](02-updating-an-existing-environment.md#8-sembrar-y-validar-la-configuración)).

> [!note]
> Mientras un control obligatorio tenga parámetros sin valor, sus evidencias quedan en `NO_EVALUABLE` con causa `CONFIGURATION`. La ausencia de información no equivale a cumplimiento.

## 10. Abrir un control desde la URL

La pestaña Configuración se abre en un control, un agente o un parámetro con estos parámetros de la URL de ENSFácil. El Detalle del control los usa para enlazar con la configuración del control.

| URL (consulta) | Se abre |
|---|---|
| `?tabView=configuration&configControl=op.acc.1` | «Organización», ficha de op.acc.1 |
| `?tabView=configuration&configControl=op.acc.1&configParam=P-04` | La misma ficha, con el formulario abierto en P-04 |
| `?tabView=configuration&configView=sistemas` | «Sistemas», lista de sistemas |
| `?tabView=configuration&configAgent=024` | «Sistemas», página del agente 024 |
| `?tabView=configuration&configAgent=024&configControl=op.acc.1&configParam=P-07` | La página del agente 024 con op.acc.1 desplegado y P-07 en edición |

Si el control no está en el documento, la pestaña «Organización» lo indica y lo resalta en «Controles del catálogo sin añadir». La navegación dentro de Configuración actualiza la URL, de modo que el botón «atrás» del navegador vuelve a la vista anterior.

## 11. Desde el servidor

Las herramientas de `config/` se ejecutan con el certificado de administrador del indexer, como en la [instalación desde cero, apartado 14](01-installation-from-scratch.md#14-inicializar-y-sembrar-la-configuración-ens):

```bash
CERT="OS_CERT=/etc/wazuh-indexer/certs/admin.pem OS_KEY=/etc/wazuh-indexer/certs/admin-key.pem"
```

### 11.1 Declarar valores de un sistema con set-parameters.py

`set-parameters.py` admite, además de los valores de organización, una sección `agents` con los valores propios de cada máquina por su id de Wazuh:

```json
{
  "op.acc.1": { "P-04": ["admin", "test"] },
  "agents": {
    "028": {
      "op.acc.1": { "P-07": ["usuario1 | servidor1 | Administrador de sistema"] },
      "op.exp.4": { "P-04": null }
    }
  }
}
```

Reglas:

- Solo admiten valor por agente los parámetros por sistema y por plataforma; uno de organización se rechaza.
- `null` quita el valor propio de ese agente, que vuelve a heredar; en el documento nunca se escribe `null`.
- El id se normaliza a tres cifras (`28` es `028`).
- Como en la organización, el valor de cada parámetro nombrado se sustituye entero.
- La herramienta lee la clasificación de `public/ens/configuration/agents/parameter-classes.ts`: se ejecuta desde `config/` dentro del repositorio completo del plugin.

```bash
cd /opt/ensfacil/repo/config
sudo env $CERT python3 set-parameters.py /ruta/sistemas.json            # plan
sudo env $CERT python3 set-parameters.py /ruta/sistemas.json --apply    # escribe
```

Resultado esperado: sin `--apply`, una línea por cambio bajo `── agente 028` y `DRY-RUN: nada escrito`; con `--apply`, `<n> cambio(s) escritos en wazuh-ens-configuration/active`. Ante un control no sembrado, un parámetro que no existe, un parámetro de organización o un valor con forma imposible, la herramienta muestra `ERROR:` y no escribe nada.

> [!note]
> En Docker ([Wazuh en Docker, apartado 10](06-wazuh-in-docker.md#10-declarar-la-política-niveles-t-y-d)), la sección `agents` necesita el repositorio completo montado: `-v <repo>:/repo:ro -w /repo/config` en lugar de `-v <repo>/config:/cfg:ro -w /cfg`.

### 11.2 Validar el documento

`config/validate-configuration.ts` comprueba también los valores por sistema ([instalación desde cero, apartado 14.4](01-installation-from-scratch.md#144-validar-el-documento-entero)):

```bash
cd /opt/ensfacil/repo
npx --yes tsx config/validate-configuration.ts /opt/ensfacil/artifacts/active-now.json
```

Resultado esperado: `ESTRUCTURA VÁLIDA: el plugin cargará esta configuración.`, una línea por agente con su tipo, sus plantillas y sus valores propios, y `VALORES POR SISTEMA VÁLIDOS.` Sin valores por sistema, la línea es `valores por sistema: ninguno (todo se evalúa con el valor de la organización)`.

| Mensaje | Significado | Actuación |
|---|---|---|
| `ESTRUCTURA INVÁLIDA` con `configuration.agents…` | Un valor `null`, un objeto o una clave desconocida en un agente: el plugin no carga el entorno | Restaurar la copia y corregir el agente indicado |
| `VALORES POR SISTEMA INVÁLIDOS` | Un control o parámetro que no existe, un parámetro de organización por agente, una plantilla desconocida o incompatible, o un valor inválido para su parámetro: el entorno carga, pero esa máquina se evalúa con una configuración inválida | Corregir el valor en la página del agente o con `set-parameters.py` |

### 11.3 Sembrar controles

`inject-control.py` conserva `configuration.agents` en cada siembra, también con `--sustituir`. Si un parámetro se retira del bloque y algún agente tenía valor propio para él, el plan muestra `AVISO: valores por agente de parámetros retirados, quedan huérfanos: …`; esos valores no los lee nadie y se quitan en la página del agente. Al sembrar un control nuevo no se crean valores por sistema.

## 12. Compatibilidad y vuelta atrás

- Los valores por sistema van en una clave nueva de primer nivel, `configuration.agents`. `controls[].parameters[].value` sigue siendo el valor de la organización, que es lo que leen un plugin 1.1.0 y los scripts.
- Un plugin 1.1.0 carga un documento de la 1.2.0: su validador no comprueba claves desconocidas, ignora `agents` y evalúa con los valores de la organización. Un guardado desde un plugin 1.1.0 conserva `agents`, porque reenvía el documento entero.
- El servidor de la 1.2.0 rechaza con el error 400 un guardado cuyo `agents` no tiene la forma correcta, y conserva el `agents` existente cuando el cuerpo no trae la clave.
- Para volver a la 1.1.0 basta con desplegar su zip ([instalar desde una release, apartado 15](07-installing-from-a-release.md#15-cambiar-de-versión-o-desinstalar)). Tras la migración, las filas movidas a los agentes ya no están en la organización: una 1.1.0 no las ve. Para recuperarlas en la 1.1.0, restaurar la copia anterior a la migración según la [guía de diagnóstico y rollback](04-troubleshooting-and-rollback.md#7-restaurar-la-configuración-ens).
