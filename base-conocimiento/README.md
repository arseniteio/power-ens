# Base de conocimiento · ENSFácil

Todo lo necesario para desplegar ENSFácil en una máquina, llevarla al máximo
cumplimiento ENS y diagnosticar cuando algo no cuadra.

Está escrita para que **una IA pueda leerla entera y guiar un despliegue de
principio a fin** sin tener que abrir los 10 repositorios ni las ~37.000 líneas
de documentación que hay repartidas por ellos.

---

## Cómo usarla

**Si eres una IA a la que le acaban de pasar esta carpeta:** lee
[`00-EMPIEZA-AQUI.md`](00-EMPIEZA-AQUI.md) entero antes de responder nada. Lleva
el contexto mínimo y, sobre todo, **las cinco reglas que no se rompen**. Una
recomendación que viole cualquiera de ellas está mal aunque funcione, porque el
producto entero existe para no afirmar cumplimiento sin haberlo medido.

**Si eres una persona:** entra por el índice de abajo según lo que necesites.

---

## Los documentos

| | Documento | Para qué |
|---|---|---|
| **00** | [Empieza aquí](00-EMPIEZA-AQUI.md) | Contexto mínimo, las reglas que no se rompen, cómo se calcula el número |
| **01** | [Cómo funciona](01-como-funciona.md) | El recorrido de un dato, dónde vive cada cosa, los dos modelos de evaluación |
| **02** | [Desplegar desde cero](02-desplegar-desde-cero.md) | Runbook completo, Linux y LDAP, hasta que el panel muestre datos |
| **03** | [Conseguir el cumplimiento](03-conseguir-el-cumplimiento.md) | Evidencia a evidencia: qué tiene que ser cierto y qué declarar |
| **04** | [Diagnóstico](04-diagnostico.md) | Entra por el síntoma. Qué mirar cuando algo no cuadra |
| **05** | [Trampas verificadas](05-trampas-verificadas.md) | Fallos que ya han pasado, con su síntoma y su arreglo |
| **06** | [Estado actual](06-estado-actual.md) | Dónde está cada máquina hoy y qué la bloquea |
| **07** | [Mapa de la documentación](07-mapa-de-la-documentacion.md) | Índice **por pregunta**: qué documento contesta a qué |
| **08** | [Índice completo](08-indice-completo.md) | Los 97 documentos, por carpeta y con su tamaño |

---

## Está todo aquí dentro

**97 documentos · 42.000 líneas.** No hace falta abrir ningún otro repositorio:

```
controles/     la documentación COMPLETA de los 9 runbooks
producto/      arquitectura del motor, del dashboard y del despliegue del plugin
informes/      estado real por evidencia de las dos máquinas
```

Todo lo de `controles/` y `producto/` son **copias**, y cada una lleva su
cabecera de procedencia diciendo de dónde salió y cuándo.

> **Si una copia y su original difieren, manda el original**, que es lo que
> está desplegado. Estas copias existen para que la base sea autocontenida y se
> pueda entregar entera, no para sustituir al repositorio del runbook.

El índice completo, documento a documento y con su tamaño, está en
[`08-indice-completo.md`](08-indice-completo.md).

## Lo que esta base NO hace

- **No es una fuente de verdad sobre el estado.** El documento **06** lleva fecha
  y caduca: los números hay que leerlos en el panel.
- **No decide política.** Qué cuentas están autorizadas, qué privilegios son
  legítimos y qué documentos existen lo decide el responsable de la organización.
  Aquí solo está escrito **dónde se declara** y **qué pasa si falta**.

---

## Las tres cosas que hay que saber antes de dar un número

Si alguien va a presentar resultados, esto tiene que salir con ellos. Está
desarrollado en el documento **06**.

1. **Tres atestaciones apuntan a documentos que todavía no existen.** Sostienen
   dos de los ocho requisitos de `op.acc.1` en las dos máquinas. Sin ellas, ese
   control está en 50 %, no en 75 %.
2. **Dos números de `wazuh-real` no son medidas completas.** El motor avisa de
   que ha calculado sobre 10.000 hechos de 20.052: son un mínimo, no un
   resultado.
3. **Hay un incumplimiento sin solución técnica.** Un solo administrador que
   ejerce cinco funciones incompatibles no se arregla con configuración.

---

## Dónde está el resto

```
Wazuh-ENS/
  base-conocimiento/     ← estás aquí
  informes/              estado por evidencia de las dos máquinas (HTML)
  docs/                  19 documentos de arquitectura y despliegue
  dashboard/ens/         el plugin: motor, configuración, catálogo, UI
  agent/                 reglas del manager y pipeline del agente
  config/                bloques de configuración e inyector

op.acc.{1,2,3,4}-*                    los 4 runbooks de LINUX
op.acc.{1,2,3,4}-ldap                 los 4 runbooks de DIRECTORIO
mp.info.6-proxmox-backup-runbook      copias de seguridad
```

Los ocho runbooks de control son **desplegables**: lo que viaja al servidor es el
recolector, sus reglas y sus instaladores. Cada uno lleva su `README.md` y su
`CUMPLIMIENTO.md`; los de LDAP llevan además `CUMPLIMIENTO_TOTAL.md` y
`DIFERENCIAS_CON_EL_CONTROL_NORMAL.md`.
