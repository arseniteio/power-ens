# Empieza aquí

Contexto mínimo para poder ayudar con ENSFácil sin decir nada falso. Si solo vas
a leer un documento de esta base, que sea este.

---

## Qué es ENSFácil

Un plugin del dashboard de Wazuh que evalúa controles del **Esquema Nacional de
Seguridad** (RD 311/2022) a partir de evidencias técnicas reales recogidas por
agentes de Wazuh, y genera informes auditables. Producto de **Quersystem** para
clientes con obligación ENS.

**El valor del producto es la cadena de trazabilidad:**

```
CUMPLE → evidencia → rule ID → evento crudo
```

Un auditor tiene que poder recorrerla entera. Todo el diseño gira en torno a
preservar esa cadena, y cualquier propuesta que la rompa está mal aunque
funcione.

---

## Las cinco reglas que no se rompen

Son la razón de ser del producto. Una recomendación que viole cualquiera de
ellas es una recomendación equivocada, por muy conveniente que parezca.

### 1 · Nunca un CUMPLE falso

El motor **no afirma cumplimiento sobre lo que no ha medido**. Si una fuente no
se pudo leer, el resultado es `NO_EVALUABLE` con su causa, jamás `CUMPLE`.

Esto tiene una consecuencia que aparece constantemente: **el silencio solo
cuenta como cumplimiento si el recolector ha declarado que miró**. Por eso cada
pasada emite un latido con `evidencias_cubiertas`, que es una lista blanca: el
motor solo convierte «cero hechos» en `CUMPLE` para lo que aparezca ahí.

### 2 · Lo que no se puede demostrar, no cumple

La carga de la prueba es del auditado. Un auditor no escribe «no evaluable»:
escribe «no evidenciado» y cuenta en contra.

Pero **medida y veredicto son dos capas distintas**: el requisito no cumple, y
a la vez la evidencia conserva `NO_EVALUABLE` con su causa. Las dos cosas a la
vez, porque restan igual pero se arreglan al revés.

| Estado | Qué pasó | Qué hacer |
|---|---|---|
| `NO_CUMPLE` | el motor miró y no conforma | corregir la máquina |
| `NO_EVALUABLE` · `COLLECTION` | no se pudo leer la fuente | arreglar el despliegue de Wazuh |
| `NO_EVALUABLE` · `CONFIGURATION` | falta una decisión escrita | declararla |
| `NO_APLICA` | refuerzo por encima del nivel ENS activo | nada · sale del denominador |

### 3 · El agente observa, el motor juzga

El agente es un vigilante: emite hechos y **no edita nada** del sistema
auditado. Ni crea cuentas, ni cambia permisos, ni toca configuración.

Toda la política vive en Wazuh —incluidas las tablas— porque es lo que mira el
auditor.

### 4 · `NO_APLICA` es la única salida del denominador

Y solo para refuerzos por encima del nivel ENS activo. Es lo que permite que un
cliente de nivel BAJO llegue al 100 % sin arrastrar R1 ni R2.

### 5 · La IA va en los bordes, nunca en el juicio

Normalizar entrada, redactar salida, sugerir. **El semáforo lo decide el motor
determinista** a partir de reglas y evidencias, no un modelo. Y los logs son de
clientes con ISO 27001: inferencia local siempre, nada de APIs externas con
datos de cliente.

---

## Cómo se calcula el número

Es la fuente de confusión más frecuente, así que conviene tenerlo claro antes de
explicar nada:

```
porcentaje del control = requisitos que cumplen ÷ requisitos aplicables
```

Y **un requisito cumple solo si TODAS sus evidencias conforman.**

Las evidencias no puntúan por su cuenta. De ahí salen dos situaciones que
parecen errores y no lo son:

- **Un control con evidencias en verde puede marcar 0 %.** Si una evidencia
  está en todos sus requisitos, basta que ella falle. Caso real: `op.acc.2` del
  servidor LDAP tiene tres evidencias conformes y marca cero, porque sus tres
  requisitos pasan por EV-03.
- **Un control puede marcar 100 % con evidencias sin medir.** `op.acc.3` es el
  único con evaluador de política propio: resuelve sus requisitos midiendo
  directamente si alguna cuenta acumula funciones incompatibles, en vez de
  encadenar evidencias.

> **Consejo operativo:** para decidir dónde invertir esfuerzo, mira **a cuántos
> requisitos afecta** cada evidencia, no cuántas evidencias fallan. Una evidencia
> presente en tres requisitos vale tres veces más que una que toca a uno.

---

## Las tres cosas que más confunden al empezar

### La ventana de evaluación es de 30 días

`defaultEvaluationPeriodFrom = 'now-30d'`. El motor juzga **todo lo observado en
la ventana**, no el último estado. Así que **arreglar la máquina no limpia el
pasado**: un privilegio retirado hoy sigue contando mientras su último evento
esté dentro de la ventana.

Consecuencia práctica al declarar política: hay que mirar la ventana entera, no
la última pasada del recolector.

### El agente no lee la pantalla de Configuración. Nunca

Hay **dos almacenes de parámetros que nadie sincroniza**:

- La **pantalla** escribe en el índice `wazuh-ens-configuration`, y **el motor**
  lo lee para juzgar las evidencias del modelo nuevo.
- El **agente** decide sus veredictos leyendo `/etc/ensfacil/*` en su máquina, y
  **no consulta el índice jamás**.

Si el veredicto lo emite el agente, lo que necesita para decidir tiene que estar
**en la máquina**. Una evidencia que pida un parámetro que el agente no alcanza
queda `NO_EVALUABLE` para siempre — ha pasado.

### Hay dos modelos de evaluación conviviendo

- **Modelo clásico:** el agente emite `evidence_state` con su `estado` y el
  motor consolida.
- **Modelo nuevo:** el agente emite un **hecho crudo** y el motor lo juzga
  contrastándolo con un parámetro de la pantalla, mediante una de siete
  primitivas (`NINGUNO_EN_LISTA`, `TODOS_EN_LISTA`, `NINGUNO_FUERA_DE_LISTA`,
  `UMBRAL_MAXIMO`, `UMBRAL_MINIMO`, `ANTIGUEDAD_MAXIMA`, `CONFORME_A_TABLA`).

El corte es **total** en los dos lados: el agente de una evidencia migrada no
emite `evidence_state` suyo. Convivir los dos caminos sobre la misma evidencia
hace imposible auditar de forma consistente.

`op.acc.4` es el primer control que nace entero en el modelo nuevo. `op.acc.3`
es el único con evaluador de política propio.

---

## El parque actual

Dos máquinas instrumentadas, un manager.

| | `wazuh-real` | `zimbraHldap` |
|---|---|---|
| Qué es | Ubuntu 24.04 · servidor Linux | Ubuntu 22.04 · directorio Zimbra |
| Agente | 024 | 028 |
| Manager | `wazuh4` (89.167.83.18) | `wazuh4` |
| Runbooks | los 4 de Linux | los 4 de `zimbra-ldap/` |

**Estado medido el 12/08/2026, nivel ENS MEDIO:**

| Control | wazuh-real | zimbraHldap |
|---|---|---|
| op.acc.1 · Identificación | 75 % | 75 % |
| op.acc.2 · Requisitos de acceso | **100 %** | 0 % |
| op.acc.3 · Segregación de funciones | 50 % | **100 %** |
| op.acc.4 · Gestión de derechos | 20 % | 20 % |

El detalle evidencia por evidencia está en
[`06-estado-actual.md`](06-estado-actual.md).

---

## Lo que hay que decir aunque no lo pregunten

Si alguien va a presentar estos números, tres cosas tienen que salir con ellos.
Callárselas sería exactamente el tipo de cumplimiento aparente que este producto
existe para evitar.

**1 · Tres atestaciones apuntan a documentos que no existen.** Llevan
«PENDIENTE DE SUSTITUIR» en el propio texto y sostienen `op.acc.1.5` y
`op.acc.1.r1.1` **en las dos máquinas**. Sin ellas, op.acc.1 no está en 75 %
sino en **50 %**.

**2 · Dos números de `wazuh-real` no son medidas completas.** `op.acc.3` y
`op.acc.4` avisan de truncamiento: el veredicto se calcula sobre **10.000 hechos
de 20.052**. Son un mínimo, no un resultado — un hallazgo anterior al corte no
está contado.

**3 · Hay un incumplimiento sin solución técnica.** En `wazuh-real`, una sola
cuenta ejerce operación, desarrollo, mantenimiento, configuración **y
auditoría**. En una máquina administrada por una persona eso no se arregla con
configuración: o hay una segunda persona, o es un riesgo aceptado y documentado.

---

## Por dónde seguir

| Quieres… | Ve a |
|---|---|
| entender cómo funciona por dentro | [`01-como-funciona.md`](01-como-funciona.md) |
| desplegar en una máquina nueva | [`02-desplegar-desde-cero.md`](02-desplegar-desde-cero.md) |
| subir el cumplimiento | [`03-conseguir-el-cumplimiento.md`](03-conseguir-el-cumplimiento.md) |
| arreglar algo que no funciona | [`04-diagnostico.md`](04-diagnostico.md) |
| no repetir un error conocido | [`05-trampas-verificadas.md`](05-trampas-verificadas.md) |
| saber dónde está cada máquina | [`06-estado-actual.md`](06-estado-actual.md) |
| encontrar un documento concreto | [`07-mapa-de-la-documentacion.md`](07-mapa-de-la-documentacion.md) |
