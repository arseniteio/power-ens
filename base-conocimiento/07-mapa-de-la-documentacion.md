# 07 · Mapa de la documentación

Índice de toda la documentación de ENSFácil, organizado **por pregunta**. Sirve
para no abrir doce repositorios buscando una cosa.

Todo lo de aquí está leído de los ficheros. Donde algo no se ha podido
verificar, se dice con esas palabras.

**Rutas.** Todas son relativas a
`/Users/diqueran/Documents/Proyectos/Quersystem/Wazuh/ENS-Desarrollo/`, que en
adelante se abrevia `<RAIZ>`.

---

## 0. Cuánto hay y dónde

Lo que se cuenta aquí es la **documentación de origen**: los repos del producto
y de los controles. Se excluyen a propósito las bases de conocimiento
(`*base-conocimiento*`, `*base-de-conocimiento*`), porque este documento vive
dentro de una de ellas y contarse a sí mismo da un número que cambia cada vez
que alguien escribe. Medido el 12/08/2026 a las 13:30 con:

```bash
cd <RAIZ>
BASE="-not -path */.git/* -not -path */venv/*"
# todo (informes de agente incluidos)
find . -name '*.md' -not -path '*/.git/*' -not -path '*/venv/*' \
       -not -path '*/Automatización-Controles/Wazuh-ENS/*' \
       -not -path '*base-conocimiento*' -not -path '*base-de-conocimiento*' | wc -l
find . -name '*.md' -not -path '*/.git/*' -not -path '*/venv/*' \
       -not -path '*/Automatización-Controles/Wazuh-ENS/*' \
       -not -path '*base-conocimiento*' -not -path '*base-de-conocimiento*' \
       -exec cat {} + | wc -l
# sin los informes de agente: añadir  -not -path '*superpowers*'  a los dos
```

| | Ficheros `.md` | Líneas |
|---|---|---|
| Todo | 140 | 52.309 |
| Sin los informes de agente (`.superpowers/`, `docs/superpowers/`) | 98 | 26.191 |

La cifra útil —lo que alguien va a leer— es la segunda. La diferencia son los
`task-N-report.md` y `progress.md` que dejaron las sesiones de desarrollo,
sobre todo en `op.acc.1-identificacion/.superpowers/sdd/` (27 ficheros).

> **Cualquier recuento de este documento es una foto, y el árbol se mueve.**
> Mientras se verificaba esto (12/08, 13:00-13:30) aparecieron 98 `.md` nuevos
> en `<RAIZ>` que antes no estaban. Si un número no cuadra, **vuelve a ejecutar
> el comando** en vez de discutir con la tabla.

### Los repositorios

Doce directorios con `.git` propio, más uno que no es repo. La columna de
líneas **excluye** `superpowers/` (los informes de agente) y las bases de
conocimiento, e incluye todo lo demás:

| Directorio | Qué es | `.md` (líneas) |
|---|---|---|
| `Wazuh-ENS/` | **El plugin.** Motor, UI, reglas canónicas, config, `docs/`, y esta `base-conocimiento/` (no contada) | 7.866 |
| `mp.info.6-proxmox-backup-runbook/` | Runbook Linux · copias de seguridad (Proxmox Backup Server) | 2.406 |
| `op.acc.1-identificacion/` | Runbook Linux · identificación | 1.968 |
| `op.acc.2-requisitos-de-acceso/` | Runbook Linux · requisitos de acceso | 2.487 |
| `op.acc.3-segregacion-de-funciones-y-tareas/` | Runbook Linux · segregación | 1.068 |
| `op.acc.4-proceso-de-gestion-de-derechos-de-acceso/` | Runbook Linux · gestión de derechos | 1.238 |
| `op.acc.1-ldap/` | Runbook Zimbra/LDAP · identificación | 1.653 |
| `op.acc.2-ldap/` | Runbook Zimbra/LDAP · requisitos de acceso | 2.018 |
| `op.acc.3-ldap/` | Runbook Zimbra/LDAP · segregación | 1.614 |
| `op.acc.4-ldap/` | Runbook Zimbra/LDAP · gestión de derechos | 1.980 |
| `Automatización-Controles/` | **Generador** de controles desde el Excel del auditor (Python) | 1.881 · 2.416 si se cuenta el `venv/`, que la tabla de arriba excluye |
| `Deploy-Plugin-Playbook/` | Playbooks Ansible para compilar y desplegar el plugin | 12 |
| `Archivos-Auditor/` | **No es repo.** 4 plantillas `.xlsx` de op.acc.1-4 | 0 |

> `Automatización-Controles/Wazuh-ENS/` es un **clon anidado** del repo del
> plugin, que el generador usa como destino de escritura. No es documentación
> nueva: son copias. Su propio README lo dice —«El plugin es un repositorio
> APARTE. Se clona aquí dentro»—.

---

## 1. El índice por pregunta

### A · Acabo de llegar. ¿Por dónde empiezo?

| Pregunta | Dónde |
|---|---|
| ¿Qué es esto y qué hace? | `Wazuh-ENS/README.md` |
| ¿Cuáles son las reglas que no se rompen? (principios, trampas, rangos de rule ID) | `Wazuh-ENS/CLAUDE.md` |
| ¿Cómo despliego los cinco controles, de cero? | `Wazuh-ENS/README.md` §0-§4 — «dos máquinas» ahí es **manager + agente auditado**, no las dos máquinas reales del cliente. Ojo: su línea «Cuatro repos: éste, y uno por control» está vieja — hoy son este repo, 5 runbooks Linux y 4 LDAP |
| ¿Cómo doy acceso a GitLab a un servidor nuevo? | `Wazuh-ENS/README.md` §0 (clave `gitlab-qs`, `~/.ssh/config`, **no** `core.sshCommand`) |
| ¿Qué controles existen y en qué estado están? | `Wazuh-ENS/CLAUDE.md` → «Controles implementados» · `Wazuh-ENS/README.md` (tabla de cabecera) |
| ¿Qué significa `DRAFT` y por qué op.acc.3/4 no puntúan? | `Wazuh-ENS/CLAUDE.md` → «Controles implementados» |

### B · El motor: ¿cómo se decide un CUMPLE?

| Pregunta | Dónde |
|---|---|
| ¿Cuál es el flujo completo del motor, módulo a módulo? | `Wazuh-ENS/docs/ENS_ENGINE_ARCHITECTURE.md` |
| ¿Qué estados existen y qué significa cada uno? | `Wazuh-ENS/docs/ENS_ENGINE_ARCHITECTURE.md` · `Wazuh-ENS/docs/CUMPLIMIENTO_TOTAL.md` §1 |
| ¿Por qué `NO_APLICA` no penaliza y `NO_EVALUABLE` sí? | `Wazuh-ENS/CLAUDE.md` → «Principio rector» · `CUMPLIMIENTO_TOTAL.md` §1 |
| **¿Por qué esta evidencia la juzga el motor y no el agente?** | `Wazuh-ENS/docs/PRIMITIVAS_DE_JUICIO.md` y `Wazuh-ENS/docs/MIGRAR_UNA_EVIDENCIA.md` |
| ¿Qué primitivas de juicio hay y cuál le toca a cada evidencia? | `Wazuh-ENS/docs/PRIMITIVAS_DE_JUICIO.md` §«Las siete» y §«El plan, evidencia a evidencia» |
| ¿Por qué siete primitivas y no tres? ¿Qué se descartó? | `PRIMITIVAS_DE_JUICIO.md` §«Por qué siete…» y §«Lo que se consideró y NO entró» |
| ¿Qué evidencias NO se pueden migrar nunca, y por qué? | `PRIMITIVAS_DE_JUICIO.md` §«Las siete que no se pueden migrar» |
| ¿Cómo se calcula la línea de evolución diaria? | `Wazuh-ENS/CLAUDE.md` → `core/timeline/` |
| ¿Qué es el parámetro `now` del motor y por qué importa? | `Wazuh-ENS/CLAUDE.md` → «Motor» |
| ¿Por qué op.acc.3 tiene evaluador propio y ningún otro? | `Wazuh-ENS/CLAUDE.md` · `op.acc.3-segregacion-de-funciones-y-tareas/CUMPLIMIENTO.md` |
| ¿Cómo se consolidan agentes y alcance (scope)? | `Wazuh-ENS/CLAUDE.md` → «Motor» (`compliance-state/`, `scope/`) |

### C · La pantalla de Configuración

| Pregunta | Dónde |
|---|---|
| ¿Cómo está pensado el módulo de Configuración? | `Wazuh-ENS/docs/ENS_CONFIGURATION_ARCHITECTURE.md` ⚠ ver §3 |
| ¿Por qué no aparece la tarjeta de un control? | `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §8 · `docs/DESPLIEGUE_FAKES.md` §2 |
| ¿Cómo siembro el bloque de configuración de un control? | `DESPLEGAR_EL_PLUGIN.md` §8 (`config/inject-control.py <control> --apply`) |
| ¿Qué hace `--sustituir` y por qué es peligroso? | `Wazuh-ENS/CLAUDE.md` → «Trampas conocidas» · `DESPLIEGUE_FAKES.md` §2 |
| ¿Dónde vive cada parámetro: pantalla, `.env` o fichero de política? | `Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` §«Los tres sitios» |
| ¿Por qué editar la pantalla a veces no cambia el veredicto? | `Wazuh-ENS/CLAUDE.md` → «Dos almacenes de parámetros» · `MIGRAR_UNA_EVIDENCIA.md` §«Qué modelo hay» |

### D · Cuadro de mando e informes

| Pregunta | Dónde |
|---|---|
| ¿Qué tarjeta consume qué resumen, y por qué? | `Wazuh-ENS/docs/ENS_DASHBOARD_FUNCTIONAL_ARCHITECTURE.md` |
| ¿Qué modelo alimenta cada tarjeta? | `Wazuh-ENS/docs/ENS_DASHBOARD_SPECIFICATION.md` ⚠ ver §3 |
| ¿Por qué el índice global usa `ControlSummary` y no `RequirementSummary`? | `ENS_DASHBOARD_FUNCTIONAL_ARCHITECTURE.md` §«Decisión para el índice global» |
| ¿Cobertura y cumplimiento son lo mismo? | `ENS_DASHBOARD_FUNCTIONAL_ARCHITECTURE.md` §«Decisión para cobertura ENS» (no lo son) |

### E · Añadir o cambiar un control

| Pregunta | Dónde |
|---|---|
| **¿Cómo añado un control nuevo?** | `Wazuh-ENS/docs/ENS_CONTROL_DEPLOYMENT.md` ⚠ ver §3 · resumen vigente en `CLAUDE.md` → «Añadir un control nuevo» |
| ¿Qué siete ficheros y qué registros hay que tocar? | `ENS_CONTROL_DEPLOYMENT.md` §«Convención por control» |
| ¿Cómo se genera casi todo desde el Excel? | `Automatización-Controles/README.md` |
| ¿Qué rellena el generador y qué queda para el humano? | `Automatización-Controles/README.md` · `ENS_CONTROL_DEPLOYMENT.md` §«Qué genera el script» |
| ¿Qué es el `ruleType` y por qué es el campo más peligroso? | `ENS_CONTROL_DEPLOYMENT.md` §«Aviso crítico» · `CLAUDE.md` |
| ¿De dónde saco un rule ID libre? | `CLAUDE.md` → «Controles implementados» (las bandas reservadas). **Su lista de sitios donde comprobar está vieja**: dice «los tres `manager/`» y hoy hay **nueve** directorios `manager/` con reglas (5 runbooks Linux + 4 LDAP), más las dos canónicas de op.acc.1. Ver §4 |
| ¿Por qué no puedo importar tipos desde un barrel? | `ENS_CONTROL_DEPLOYMENT.md` §«Disciplina TDZ» · `CLAUDE.md` → «Trampas conocidas» |

### F · Migrar una evidencia al modelo nuevo

| Pregunta | Dónde |
|---|---|
| **¿Cómo migro una evidencia paso a paso?** | `Wazuh-ENS/docs/MIGRAR_UNA_EVIDENCIA.md` |
| ¿Qué primitiva le toca y contra qué parámetro se juzga? | `Wazuh-ENS/docs/PRIMITIVAS_DE_JUICIO.md` |
| ¿Puedo reutilizar un hecho que ya emite otra evidencia? | `MIGRAR_UNA_EVIDENCIA.md` §4 bis |
| ¿Cuándo readmitir un nombre de evento viejo es un falso verde? | `MIGRAR_UNA_EVIDENCIA.md` §4 (el caso `unauthorized_user` de EV-07) |
| ¿En cuántos sitios hay que cortar el `evidence_state`? | `MIGRAR_UNA_EVIDENCIA.md` §5 (cuatro: recolector, `score.py`, watchdog, simulador) |
| ¿Qué es la cobertura del recolector y cuándo la ausencia puede ser CUMPLE? | `MIGRAR_UNA_EVIDENCIA.md` §8 (`CONFIRMADA` / `AUSENTE` / `DESCONOCIDA`) |
| ¿Cuál es la prueba de aceptación de una migración? | `MIGRAR_UNA_EVIDENCIA.md` §9 |
| ¿Cuántas van migradas? | `MIGRAR_UNA_EVIDENCIA.md` §«Estado de la migración» · `CLAUDE.md` (aviso de cabecera) |

### G · Desplegar el plugin en el manager

| Pregunta | Dónde |
|---|---|
| **¿Cómo compilo e instalo el plugin?** | `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` |
| ¿Por qué `sudo -i` y no `sudo`? | `DESPLEGAR_EL_PLUGIN.md` §0 |
| ¿Por qué el `cp -r` puede anidar `ens/ens`? | `DESPLEGAR_EL_PLUGIN.md` §3 |
| ¿Cómo compruebo que el zip trae mi cambio? | `DESPLEGAR_EL_PLUGIN.md` §4 (la marca **en par**: positiva y negativa) |
| ¿Qué rutas se borran al instalar? | `DESPLEGAR_EL_PLUGIN.md` §5 (exactas; **nunca** `wazuh*`) |
| ¿Cómo vuelvo atrás? | `DESPLEGAR_EL_PLUGIN.md` §7 |
| ¿Sigo viendo lo viejo en el navegador? | `DESPLEGAR_EL_PLUGIN.md` §6 (caché, incógnito) |
| ¿Hay una vía automatizada? | `Deploy-Plugin-Playbook/README.md` (`status.yaml`, `pull.yaml`, `compile.yaml`, `deploy.yaml`) |

### H · Montar la demo (servidor fake)

| Pregunta | Dónde |
|---|---|
| **¿Cómo dejo un servidor emitiendo evidencia simulada?** | `Wazuh-ENS/docs/DESPLIEGUE_FAKES.md` |
| ¿Qué escenarios hay? | `DESPLIEGUE_FAKES.md` §6 (`cumple`, `mixto`, `incumple`, `no_evaluable`) |
| ¿Por qué `install-fake.sh` aborta y `install-real.sh` no? | `DESPLIEGUE_FAKES.md` §5 (la asimetría es deliberada) |
| ¿Cómo distingo un evento simulado de uno real? | `DESPLIEGUE_FAKES.md` (campo `emisor: "simulado"`) |
| ¿Cómo lo deshago? | `DESPLIEGUE_FAKES.md` §9 |
| Lo mismo, por control | `<control>/docs/06-servidor-fake.md` en cada runbook |

### I · Llevar una máquina al cumplimiento

| Pregunta | Dónde |
|---|---|
| **¿Cuál es el procedimiento completo, en orden?** | `Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` |
| ¿Qué hay que hacer evidencia a evidencia para los tres controles clásicos? | `Wazuh-ENS/docs/CUMPLIMIENTO_TOTAL.md` (1.529 líneas; §6 op.acc.2, §7 op.acc.1, §8 mp.info.6) |
| ¿Qué se hizo en una máquina real, con números? | `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` |
| ¿Qué **no** se puede llevar al 100 % hoy? | `CUMPLIMIENTO_TOTAL.md` §11 · `CASO_REAL_WAZUH_REAL.md` §«El techo honesto» |
| ¿Dónde están todas las decisiones de política juntas? | `CUMPLIMIENTO_TOTAL.md` §10 |
| ¿Cómo acoto el alcance a las máquinas que de verdad audito? | `CASO_REAL_WAZUH_REAL.md` §Paso 1 (`configuration.scope`, **no** `configuration.global.scope`) |
| Lo propio de un control concreto | `<runbook>/CUMPLIMIENTO.md` |

### J · Servidor de directorio (Zimbra / LDAP)

| Pregunta | Dónde |
|---|---|
| **¿Por qué no vale el runbook de Linux en un LDAP?** | `op.acc.<N>-ldap/DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` (idéntico en los cuatro) |
| ¿Cómo llevo el servidor Zimbra al máximo cumplimiento? | `op.acc.<N>-ldap/CUMPLIMIENTO_TOTAL.md` (idéntico en los cuatro; cubre los 4 controles; Paso 0 … Paso 6) |
| ¿Qué hace falta para cumplir este control en LDAP, evidencia a evidencia? | `op.acc.<N>-ldap/CUMPLIMIENTO.md` (uno por control, distintos) |
| ¿Hay que tocar el manager para el LDAP? | `op.acc.<N>-ldap/README.md` — **no**: mismos rule ID, mismas evidencias, mismo fichero de eventos |
| ¿Qué es `plano=sistema` frente a `plano=directorio`? | `DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` §1 |
| ¿Se puede leer el directorio sin credenciales? | `DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` §6 |

> **Los cuatro `CUMPLIMIENTO_TOTAL.md` de LDAP son el mismo fichero**
> (`md5 9b7f3c10a3dd4e75c21c9e269a634597`), y los cuatro
> `DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` también (`16484531b3c69e…`). Se
> duplican porque cada repo tiene que ser desplegable por sí solo. Leer
> cualquiera de los cuatro es leer los cuatro.

### K · Diagnóstico: algo no sale

| Pregunta | Dónde |
|---|---|
| **Tabla de síntoma → causa del despliegue del plugin** | `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` §10 |
| ¿Cómo compruebo que una evidencia concreta funciona? | `Wazuh-ENS/docs/COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md` |
| ¿Funciona la evidencia o cumple la máquina? (no es lo mismo) | `COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md` §«Cómo leer las tablas» |
| ¿Por qué mi `tail` del NDJSON me engaña? | `DESPLEGAR_EL_PLUGIN.md` §9 · `COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md` (es un **histórico**: aislar la pasada con `mv`) |
| ¿Por qué `wazuh-logtest` no da `Phase 3`? | `DESPLEGAR_EL_PLUGIN.md` §9 (`ensfacil` lleva el **id del control**, no `true`; y las reglas nuevas necesitan reinicio) |
| ¿Cómo compruebo la coherencia entre los repos? | `python3 Wazuh-ENS/tests/check-coherencia.py` — documentado en `CLAUDE.md` y `DESPLEGAR_EL_PLUGIN.md` §9 |
| ¿Qué salió mal la primera vez en máquina real? | `Wazuh-ENS/docs/HALLAZGOS_DESPLIEGUE_REAL_2026-07-31.md` |
| Verificación de la cadena, por control | `<runbook>/docs/05-verificacion.md` |

### L · Historia y decisiones: «¿por qué esto es así?»

| Pregunta | Dónde |
|---|---|
| ¿Por qué se desconectó el evaluador de op.acc.1? | `Wazuh-ENS/docs/PLAN_ACCION_2026-07-30.md` · `PLAN_REVISADO_2026-07-30.md` (las tres opciones y por qué ganó la C) |
| ¿Por qué el motor ya no infiere CUMPLE del nombre del evento? | `Wazuh-ENS/docs/AUDITORIA_COHERENCIA_2026-07-30.md` §0.1 y §5.1 |
| ¿Por qué los `relatedRules` son numéricos y no simbólicos? | `AUDITORIA_COHERENCIA_2026-07-30.md` §1 · cabecera de `dashboard/ens/core/evidence/catalog.ts` |
| ¿Por qué la carga de la prueba es del auditado desde el 04/08? | `Wazuh-ENS/CLAUDE.md` → «Principio rector» (commit `5a60647`) |
| ¿Qué se auditó en la fase 0 y qué riesgos quedaron? | `Wazuh-ENS/docs/AUDITORIA_FASE_0.md` ⚠ ver §3 |
| ¿Qué fases quedan? | `PLAN_ACCION_2026-07-30.md` §«Fases» y §«Lo que sigue roto» |
| ¿Qué error de método no repetir? | `PLAN_ACCION_2026-07-30.md` §«Método — lo que no volver a hacer» |

### M · Estado medido hoy

| Pregunta | Dónde |
|---|---|
| ¿En qué estado está cada evidencia de las dos máquinas reales? | `Wazuh-ENS/informes/estado-por-evidencia.html` (abrir en navegador) |
| ¿Por qué un control con evidencias en verde marca 0 %? | `estado-por-evidencia.html`, primer apartado |
| ¿Por qué op.acc.3 marca 100 % con dos evidencias sin medir? | `estado-por-evidencia.html`, segundo apartado |
| ¿Cómo se llegó a los números de `wazuh-real`? | `Wazuh-ENS/docs/CASO_REAL_WAZUH_REAL.md` |
| ¿Cómo se llegó a los de `zimbraHldap`? | `op.acc.<N>-ldap/CUMPLIMIENTO_TOTAL.md` §«Estado alcanzado» |

---

## 2. Ficha de una línea por documento

### `Wazuh-ENS/` — raíz

| Fichero | Líneas | Contesta |
|---|---|---|
| `README.md` | 304 | Cómo desplegar los cinco controles en las dos máquinas, de cero, incluida la clave SSH de GitLab. |
| `CLAUDE.md` | 324 | Los principios que no se rompen, la estructura del repo, el ciclo de build, las trampas conocidas y las bandas de rule ID. ⚠ lleva aviso de vigencia propio. |

### `Wazuh-ENS/docs/` — los 19 documentos

Ordenados por para qué sirven, no alfabéticamente.

**Arquitectura**

| Fichero | Líneas | Contesta en una línea |
|---|---|---|
| `ENS_ENGINE_ARCHITECTURE.md` | 312 | Qué pregunta responde cada módulo del motor, la jerarquía control→requisito→evidencia y los contratos de tipos. |
| `ENS_CONFIGURATION_ARCHITECTURE.md` | 280 | Qué es una versión de configuración, sus modos de alcance (global/agent/group) y qué NO le está permitido a Configuración. ⚠ |
| `ENS_DASHBOARD_FUNCTIONAL_ARCHITECTURE.md` | 89 | Qué resumen consume cada tarjeta del panel, en tres niveles de lectura: ejecutivo, auditor, evidencial. |
| `ENS_DASHBOARD_SPECIFICATION.md` | 97 | Qué modelo alimenta cada tarjeta y por qué React solo renderiza. ⚠ |
| `pipeline-agente.md` | 116 | El contrato del evento NDJSON, las bandas de rule ID de op.acc.1/2 y qué eventos emite cada evidencia. ⚠ |

**Hacer cosas**

| Fichero | Líneas | Contesta en una línea |
|---|---|---|
| `DESPLEGAR_EL_PLUGIN.md` | 284 | Compilar e instalar el plugin en el manager, con la comprobación que va **después de cada paso** y una tabla síntoma→causa. |
| `ENS_CONTROL_DEPLOYMENT.md` | 141 | Los siete ficheros y ocho registros que hay que tocar para dar de alta un control nuevo. ⚠ |
| `MIGRAR_UNA_EVIDENCIA.md` | 271 | La receta de nueve pasos para pasar una evidencia del agente-que-juzga al motor-que-juzga. |
| `PRIMITIVAS_DE_JUICIO.md` | 307 | Las siete primitivas del motor y, evidencia a evidencia, cuál le toca, qué hecho crudo necesita y contra qué parámetro se juzga. |
| `DESPLIEGUE_FAKES.md` | 193 | Dejar un servidor de demostración emitiendo evidencia simulada de los tres controles clásicos. |
| `PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` | 359 | El procedimiento general —los tres sitios donde vive la configuración, el orden de trabajo y las trampas que cuestan una tarde—. |
| `CUMPLIMIENTO_TOTAL.md` | 1.529 | Qué hay que hacer y declarar, evidencia a evidencia, para el máximo cumplimiento medible de mp.info.6, op.acc.1 y op.acc.2 — con un §11 de lo que hoy no llega. |
| `COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md` | 231 | Qué mira, qué emite y qué regla recoge cada una de las 22 evidencias **de los tres controles desplegados**, con el comando que dice si funciona. Las 15 de op.acc.3/4 no están, y el fichero explica por qué: no hay recolector ni regla con que demostrarlas. |

**Registro de lo que pasó**

| Fichero | Líneas | Contesta en una línea |
|---|---|---|
| `CASO_REAL_WAZUH_REAL.md` | 301 | Cómo se llevó `wazuh-real` de 0 % a los números de hoy los días 06-07/08/2026, incluido lo que no subió y por qué. |
| `HALLAZGOS_DESPLIEGUE_REAL_2026-07-31.md` | 140 | Los cinco fallos que solo aparecieron al salir del contenedor, empezando por `collector_run` sin regla. |
| `AUDITORIA_COHERENCIA_2026-07-30.md` | 620 | La auditoría de los tres controles contra `main`: el CUMPLE fabricado por el nombre del evento, la trazabilidad rota y el form-engine sin renderer de listas. |
| `AUDITORIA_FASE_0.md` | 762 | La auditoría estructural previa: matriz de los 7 ficheros por control, mapa EV→rule ID y riesgos para la fase 3. ⚠ |
| `PLAN_ACCION_2026-07-30.md` | 280 | Qué se arregló el 30/07, qué siguió roto y las fases que quedaban. |
| `PLAN_REVISADO_2026-07-30.md` | 148 | Las tres opciones de arquitectura que se plantearon y cómo se descubrió que había una migración a medias. ⚠ **SUPERADO**. |

**`Wazuh-ENS/docs/superpowers/`** — 3 ficheros de proceso de desarrollo:
`plans/2026-07-28-coherencia-estructura-controles.md`,
`specs/2026-07-28-coherencia-estructura-controles-design.md`,
`specs/2026-07-29-runbooks-op-acc-1-2-design.md`. Son el plan y el diseño de la
rama `coherencia-estructura-controles`.

> **Cuidado con cómo se cuenta esto** (verificado con `git`). La rama **sí está
> fusionada en `main`**: `git merge-base --is-ancestor coherencia-estructura-controles main`
> dice que sí y `git log coherencia-estructura-controles ^main` da 0 commits.
> Lo que no entró fue **el código**. El merge es `af82dfc`, «unifica
> coherencia-estructura-controles en main sin tocar el plugin desplegado», y su
> propio mensaje lo explica: *«Esta fusion aporta SOLO documentacion y el script
> de siembra de configuracion. Todo `dashboard/`, `agent/` y `config/` queda
> identico a main»*. Por eso los ficheros del refactor
> (`<control>.evidence.ts`, `policy-runtime/runtime/`, `report-registry.ts`)
> existen en el árbol de la rama y **no** en el de `main`. No hace falta —ni
> sirve— volver a fusionarla: reconciliar las dos arquitecturas es trabajo
> aparte.

**`Wazuh-ENS/informes/estado-por-evidencia.html`** — 32 KB, no es markdown:
estado real evidencia a evidencia de `wazuh-real` y `zimbraHldap`, con por qué
no cumple cada una y qué le falta.

### Los cuatro runbooks de Linux `op.acc.*`

Los cuatro tienen **la misma forma**: `README.md`, `CUMPLIMIENTO.md` y
`docs/01…07`. Lo que cambia es el contenido.

| Documento | Contesta en una línea |
|---|---|
| `README.md` | Qué mide el control, los dos comandos de despliegue y los tres o cuatro parámetros que desbloquean cumplimiento. |
| `CUMPLIMIENTO.md` | Evidencia a evidencia: qué tiene que ser cierto en la máquina y qué hay que declarar en la pantalla para que salga CUMPLE. |
| `docs/01-instalacion.md` | Requisitos previos: versión del manager, alta del agente y **crear el grupo `ens` antes de nada**. |
| `docs/02-manager.md` | Instalar las reglas y el `localfile` en el manager, con la tabla regla→evento→evidencia y su banda reservada. |
| `docs/03-agente.md` | Instalar el recolector en cada servidor auditado, y qué hace y qué deliberadamente **no** hace. |
| `docs/04-parametros.md` | Cada parámetro, su valor por defecto, su formato y **qué pasa si falta**. |
| `docs/05-verificacion.md` | Recorrer la cadena recolector→NDJSON→regla→índice→plugin en orden y parar en el primer eslabón roto. |
| `docs/06-servidor-fake.md` | Instalar el simulador y pintar escenarios — nunca en un servidor real. |
| `docs/07-mapa-evidencias.md` | La tabla `evidencia → requisito → evento → rule ID → función que lo produce`. |

Tamaños y particularidades:

| Runbook | `CUMPLIMIENTO.md` | Rango en uso | Particularidad documentada |
|---|---|---|---|
| `op.acc.1-identificacion` | 337 | 106800-106891 | Su `docs/07` lleva el **aviso de numeración compartida**: dos ficheros de reglas sobre la misma banda. |
| `op.acc.2-requisitos-de-acceso` | 822 | 106900-106974 | Su `docs/04` explica los **dos sitios** de configuración: el `.env` y los cuatro `.tsv`/`.allow` de política declarada. Su `docs/05` dice qué **no** se pudo verificar en contenedor (auditd, SCA). |
| `op.acc.3-segregacion-de-funciones-y-tareas` | 588 | 107000-107050 | Cinco evidencias comparten la regla 107001; el agente emite acciones **sin clasificar**. No rige en nivel BAJO. |
| `op.acc.4-proceso-de-gestion-de-derechos-de-acceso` | 600 | 107100-107150 | Primer control que **nace entero en el modelo nuevo**: sin `score.py` ni watchdog. Su `docs/07` da la primitiva y el parámetro de cada evidencia. |

`mp.info.6-proxmox-backup-runbook/` sigue la misma forma (README 126,
CUMPLIMIENTO 456, `docs/01…07`), con un `docs/07-mapa-evidencias.md` de 852
líneas —el más extenso de todos los mapas— y un
`docs/superpowers/informe-runbook.md` que registra su reestructuración del
30/07.

### Los cuatro runbooks de LDAP

Sin `docs/01…07`: cuatro ficheros en la raíz. (`op.acc.1-ldap/` tiene además un
`docs/` y un `tests/` **vacíos**, comprobado: no falta documentación ahí, es que
nunca hubo.)

| Documento | Contesta en una línea |
|---|---|
| `README.md` | Que es el mismo control sobre otra clase de máquina —mismos rule ID, mismas evidencias, **sin tocar el manager**— y qué instalar. |
| `CUMPLIMIENTO.md` | Evidencia a evidencia en el directorio: qué sale hoy en `ldapserver.qsprueba.com`, por qué, y cómo se lleva a CUMPLE. |
| `CUMPLIMIENTO_TOTAL.md` | Llevar el servidor Zimbra al máximo en los **cuatro** controles. Siete apartados numerados, Paso 0 … Paso 6: los pasos 0-5 son de ejecución (alcance, recolectores, auditd, identidad administrativa, umask, declarar la política) y el **Paso 6 no es un paso**, es lo que hoy sigue bloqueado y qué falta exactamente. |
| `DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` | Las ocho razones por las que un servidor de directorio no se audita como un Linux más, y el resumen para la dirección. |

`CUMPLIMIENTO.md` es el único distinto entre los cuatro repos: 597 (op.acc.1),
905 (op.acc.2), 494 (op.acc.3), 885 (op.acc.4) líneas.

### Repos auxiliares

| Fichero | Contesta en una línea |
|---|---|
| `Automatización-Controles/README.md` | Cómo convertir la plantilla Excel del auditor en los artefactos del plugin, con `venv` y Ollama opcional. |
| `Automatización-Controles/docs/superpowers/plans|specs/2026-07-24-ens-generator-refactor*.md` | El plan y el diseño del refactor del generador. |
| `Deploy-Plugin-Playbook/README.md` | 12 líneas: crear `inventory.ini` y ejecutar `status`/`pull`/`compile`/`deploy.yaml`. |

---

## 3. Qué está obsoleto, y quién lo dice

Solo se marca lo que **el propio fichero** declara, más las divergencias que se
ven cruzando dos ficheros leídos. Se distingue lo uno de lo otro.

### Lo declara el propio fichero

| Fichero | Qué dice su aviso |
|---|---|
| `Wazuh-ENS/CLAUDE.md` | «AVISO DE VIGENCIA (2026-07-30). Partes de este documento se escribieron contra la rama `coherencia-estructura-controles`… **`main` NO tiene ese refactor**: lo que describa `core/evidence/<control>.evidence.ts`, `policy-runtime/runtime/` o `informes/report-registry.ts` no aplica a lo desplegado.» |
| `docs/ENS_CONTROL_DEPLOYMENT.md` | El mismo aviso **en sustancia, pero más largo** que el de `CLAUDE.md` (no es la misma redacción). Su tabla de siete ficheros nombra rutas que no existen en `main` (ver §4). |
| `docs/AUDITORIA_FASE_0.md` | Lleva ese aviso largo **palabra por palabra igual que `ENS_CONTROL_DEPLOYMENT.md`** (comprobado). Se escribió contra la rama `coherencia-estructura-controles`, commit base `f9f489c`, fecha 2026-07-29. |
| `docs/PLAN_REVISADO_2026-07-30.md` | «**SUPERADO por `PLAN_ACCION_2026-07-30.md`** (misma fecha, más tarde)… Se conserva porque documenta cómo se descubrió el problema y por qué.» |

`docs/PLAN_ACCION_2026-07-30.md` no lleva aviso, pero se declara sustituto del
anterior en su primera línea.

> **El aviso de vigencia largo está él mismo medio obsoleto, y en la mitad
> peligrosa.** `ENS_CONTROL_DEPLOYMENT.md` y `AUDITORIA_FASE_0.md` dicen en
> cabecera que en `main` *«el juicio lo hace
> `dashboard/ens/core/policy-runtime/policies/op-acc-1.evaluator.ts`»*. Eso ya
> no es verdad: `CLAUDE.md` dice que ese evaluador **está desconectado** desde
> `3e92f5c` («desconecta el evaluador y unifica el camino de evaluacion»,
> comprobado en el log), y el fichero sigue en el repo sin usarse. Quien lea
> solo el aviso creerá que hay un segundo camino de evaluación vivo. No lo hay.

### Divergencias que se ven cruzando ficheros (no las declara nadie)

Estas cinco NO llevan aviso en su fichero. Se anotan porque están verificadas
contra otro documento o contra el árbol de directorios.

1. **`docs/ENS_CONFIGURATION_ARCHITECTURE.md` describe un estado anterior.** En
   su apartado del Repository dice *«Implementación actual: Memory Repository»*
   (línea 176-180) y su apartado «Estado actual» lista *«Pendiente: persistencia
   real»* (línea 255-257). Pero `docs/DESPLEGAR_EL_PLUGIN.md`
   §8 y `docs/DESPLIEGUE_FAKES.md` §2 operan sobre un índice real
   `wazuh-ens-configuration`, y el código tiene
   `configuration/services/configuration-http-client.ts` y
   `configuration/repository/`. La persistencia existe.

2. **`docs/ENS_DASHBOARD_SPECIFICATION.md` da a la «Tendencia de score» la
   fuente `Eventos score_snapshot`.** `CLAUDE.md` dice que eso se cambió el
   05/08: *«Hasta el 05/08 ese gráfico promediaba por SEMANA los
   `score_snapshot` del agente… Ahora cada punto es una pasada del motor»*, y
   existe `core/timeline/`. La ficha de esa tarjeta está desactualizada.

3. **`docs/pipeline-agente.md` cierra con un «PENDIENTE TRAS ESTO» ya
   resuelto**: pide alinear los `relatedRules` simbólicos a IDs numéricos. La
   cabecera de `dashboard/ens/core/evidence/catalog.ts` documenta que ya son
   numéricos y con qué criterio de inclusión. Además sus recuentos son de
   entonces —«op.acc.2 → 33 reglas, 106900-106972»— frente a las **42** reglas
   y el rango 106900-106974 que hay hoy en
   `agent/rules/ensfacil_op_acc_2_json_rules.xml`.

4. **La tabla de rangos de `ENS_CONTROL_DEPLOYMENT.md` no solo se queda corta:
   los rangos que da también están viejos.** Dice `mp.info.6` 106600-106722,
   `op.acc.1` 106800-106872 y `op.acc.2` 106900-106972, y hoy el XML llega a
   106723, 106891 y 106974 respectivamente (medido, ver §4). Y no menciona
   op.acc.3 ni op.acc.4. La tabla vigente está en `CLAUDE.md` → «Controles
   implementados», y la medida sobre el XML en §4 de este documento.

5. **`CLAUDE.md` dice «22 evidencias» y el catálogo tiene 37.** Su aviso de
   cabecera se escribió antes de que op.acc.3 y op.acc.4 entraran el 06/08.
   Detalle y recuento en §4. Es un ejemplo literal de la regla de abajo: cuando
   `CLAUDE.md` discrepa del árbol, manda el árbol.

### Regla práctica

> Cuando dos documentos discrepen, **manda `CLAUDE.md`**, y cuando `CLAUDE.md`
> discrepe del árbol, manda el árbol. Los documentos de arquitectura
> (`ENS_*_ARCHITECTURE.md`, `ENS_DASHBOARD_SPECIFICATION.md`) se escribieron
> como diseño: describen la intención, no necesariamente lo desplegado. Uno lo
> dice en su cabecera —`ENS_ENGINE_ARCHITECTURE.md`, «**Estado:** Borrador
> arquitectónico inicial»—; **es el único de los cuatro que lo declara**, así
> que a los otros tres hay que aplicarles la misma cautela sin que ellos avisen.

---

## 4. Mapa del código

Verificado recorriendo el árbol real de `Wazuh-ENS/` el 12/08/2026.

### El repo no compila por sí solo

No hay `package.json` ni `tsconfig`. Son **artefactos fuente** que se copian
dentro del árbol del plugin `main` de Wazuh, donde sí se compila. El generador
Python tampoco vive aquí: `main.py` está en `Automatización-Controles/`,
comprobado —es el único `main.py` de todo `<RAIZ>`—. `CLAUDE.md` y
`ENS_CONTROL_DEPLOYMENT.md` dicen que vive «en el árbol del plugin `main`»; en
este portátil no está ahí.

### `dashboard/` — el módulo del plugin

```
dashboard/
  app-router.tsx        Router. Carga Settings con React.lazy (TDZ, no revertir)
  ens-requirements.ts   Descripciones de requisitos para la vista clásica de Wazuh
  ens/
    index.ts
    types/index.ts
```

**`ens/catalog/`** — el catálogo moderno (`ENSControlDefinition`). Un fichero
por control: `mp-info-6.ts`, `op-acc-1.ts`, `op-acc-2.ts`, `op-acc-3.ts`,
`op-acc-4.ts`, más `index.ts` (el array `ENSCatalog`) y `types.ts`. Aquí vive el
`status: 'DRAFT'` → `'ACTIVE'` de cada control.

> **No es un interruptor de presentación.** `CLAUDE.md` fija la condición y hay
> que respetarla: se pasa a `ACTIVE` **el día que su agente emita y sus reglas
> estén desplegadas en un manager**, no antes. Un control `DRAFT` sale
> `NO_APLICA` y no resta; ponerlo `ACTIVE` sin instrumento de medida lo mete en
> el índice del cliente a 0 % y acusa de incumplir aquello que nadie está
> midiendo. Hoy op.acc.3 y op.acc.4 están en `DRAFT` por eso mismo, con reglas
> escritas y ningún manager que las tenga cargadas. Prueba que lo vigila:
> `tests/control-en-borrador.test.ts`.

**`ens/data/`** — el catálogo *legacy* con `expectedResult`, que consume la UI.
Los mismos cinco ficheros más `index.ts`. Es el **doble catálogo** que
`CLAUDE.md` marca como deuda técnica: pueden divergir.

**`ens/configuration/`** — la pantalla de Configuración y el contrato de
parámetros:

| Subcarpeta | Qué hay |
|---|---|
| `data/` | Los parámetros por control (`<control>-parameters.ts`), `global-configuration.ts`, `default-configuration.ts` |
| `registry/` | El `ENSConfigurationRegistry` |
| `form-engine/` | El motor de formularios, con `factory/` y `renderers/` (el que no tenía renderer de `list` hasta `e862cac`) |
| `services/` | `validation-engine.ts`, `parameter-value-validator.ts`, `configuration-http-client.ts`, `configuration-state-service.ts`, `configuration-structure-validator.ts`, `configuration-reset-service.ts`, `attestation-service.ts` |
| `repository/`, `sessions/`, `types/`, `workflow/`, `components/` | Persistencia, sesión de edición, tipos, flujo de guardado y UI |
| `engine.ts`, `index.tsx` | Entrada del módulo |

**`ens/core/`** — el motor. Punto de entrada `ens-engine.ts` →
`getENSComplianceState(...)`, cuyo último parámetro es `now`.

| Submódulo | Ficheros y qué hace |
|---|---|
| `evidence/` | `catalog.ts` (las **37** evidencias y sus `relatedRules`; su cabecera documenta el criterio de inclusión), **`judgment.ts`** (las siete primitivas), `engine.ts`, `normalized-events.ts`, `registry.ts`, `types.ts` |
| `evaluation/` | `evaluation-engine.ts`, `policy-evidence-bridge.ts`, `control/`, `requirement/`, `utils/`, `types.ts` |
| `policy-runtime/` | `policy-runtime.ts`, `policy-context-builder.ts`, `policies/` |
| `policy-runtime/policies/` | `mp-info-6.policy.ts`, `op-acc-1.policy.ts`, `op-acc-2.policy.ts`, **`op-acc-3.policy.ts`** (el único evaluador propio), `op-acc-4.policy.ts`, `registry.ts` y **`op-acc-1.evaluator.ts`, que sigue en el repo pero está DESCONECTADO** |
| `data-source/` | `opensearch-provider.ts`, `wazuh-search-source-provider.ts`, `data-source-engine.ts`, `evaluation-time-range.ts`, `catalog.ts`, `service/` |
| `compliance-state/` | `consolidation.ts`, `engine.ts`, `selectors.ts` — consolida por agente |
| `scope/` | `engine.ts`, `runtime.ts` — el alcance global/agent/group |
| `timeline/` | `compliance-timeline.ts`, **`timeline-cuts.ts`** (el reparto por días, *sin* importar el motor, para que sea probable), `control-timeline.ts`, `control-timeline-points.ts` |
| `traceability/` | `traceability-builder.ts` — la cadena evidencia→rule ID→evento |
| `dashboard-adapter/` | `dashboard-adapter.ts`, `dashboard-model.ts`, `models/`, `presenters/` |
| `compliance-result/` | `index.ts` |

> **Lo que `CLAUDE.md` avisa y aquí se confirma:** en `main` **no existen**
> `core/evidence/<control>.evidence.ts` (todo está en `evidence/catalog.ts`),
> ni `core/policy-runtime/runtime/`, ni `informes/report-registry.ts`. El
> registro de informes se llama **`informes/registry.ts`**.

> **Cuántas evidencias hay, y por qué se lee 22 en todas partes.** Contadas
> sobre el árbol —`grep -c "id: 'EV-" dashboard/ens/core/evidence/catalog.ts`—
> hoy son **37**: 7 de mp.info.6, 8 de op.acc.1, 7 de op.acc.2, 7 de op.acc.3 y
> 8 de op.acc.4. `CLAUDE.md` dice «22 evidencias (7 + 8 + 7)» y **está viejo**:
> es el recuento de antes de que op.acc.3 y op.acc.4 entraran el 06/08. El 22
> sigue siendo el número correcto en `COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md`,
> porque ahí se cuentan solo las evidencias **demostrables hoy**, que son las de
> los tres controles desplegados. Los dos números son ciertos sobre cosas
> distintas: 37 declaradas, 22 con instrumento de medida.

**Pantallas** (`ens/`): `controls/` (con `control-detail/` y `control-row.tsx`),
`evidences/`, `evidence/`, `events/`, `traceability/`, `dashboard/`,
`control-filter/` (`prefix.ts`).

**`ens/informes/`** — `index.tsx` (genera el PDF con `pdfmake`), `registry.ts`
(el mapa `controlId → modelo`; devuelve `undefined` para lo no registrado y la
pantalla lo dice), `report-model.ts` (`buildMpInfo6ReportModel` — **el de
mp.info.6 no tiene fichero con su nombre**), `op-acc-1…4-report-model.ts` y
`report-rows.ts`.

### `agent/` — el lado agente (canónico)

```
agent/agent.conf                        bloques localfile del grupo ens
agent/emit/ensfacil-emit-opacc.sh       emisor ndjson con bloqueo y rotación
agent/collectors/ens_op_acc1_audit.py   recolector del modelo nuevo (NO desplegado)
agent/samples/muestra_op_acc_{1,2}.ndjson
agent/rules/                            7 ficheros XML
```

Las reglas, con su rango real medido sobre el XML. **«Rango en uso» no es la
banda reservada**: la banda de op.acc.1 llega a 106899 aunque hoy se use hasta
106891. Las bandas reservadas están en `CLAUDE.md` → «Controles implementados».

| Fichero | Rango en uso | Reglas | ¿Desplegado? |
|---|---|---|---|
| `ensfacil_mp_info_6_json_rules.xml` | 106600-106723 | 27 | sí |
| `ensfacil_mp_info_6_pbs_rules.xml` | 106660-106663 | 4 | sí |
| `ensfacil_op_acc_1_json_rules.xml` | 106800-106891 | 37 | **sí** (recolector bash del runbook) |
| `ensfacil_op_acc_1_technical_fact_rules.xml` | 106800-106873 | 53 | **NO** (recolector Python) |
| `ensfacil_op_acc_2_json_rules.xml` | 106900-106974 | 42 | sí |
| `ensfacil_op_acc_3_json_rules.xml` | 107000-107050 | 6 | no desplegado en ningún manager |
| `ensfacil_op_acc_4_json_rules.xml` | 107100-107150 | 11 | no desplegado en ningún manager |

**Los dos ficheros de op.acc.1 numeran sobre la misma banda y no se pueden
fusionar.** Antes de coger un id nuevo hay que mirar los dos, más las copias en
los `manager/` de los runbooks — que hoy son **nueve** directorios, no tres:

```bash
cd <RAIZ>
ls */manager/*.xml            # 9 manager/, 5 Linux + 4 LDAP
```

Cada regla desplegada tiene su **copia** en `<runbook>/manager/`, y
`check-coherencia.py` verifica que no divergen. Los cuatro repos LDAP llevan
copia de las reglas de su control aunque **no haya que instalarlas otra vez**:
son las mismas que ya cargó el runbook de Linux en `wazuh4`.

### `config/` — la siembra de configuración

```
config/
  <control>-control-block.json    5 bloques semilla (mp-info-6, op-acc-1…4)
  inject-control.py               siembra en el índice; FUSIONA por defecto
  set-parameters.py
  desplegar-plugin.sh
  politicas/wazuh-real.json
  test_inject_control.py          pruebas sin dependencias
  test_control_blocks.py
```

### `tests/`

16 suites `.ts` (se ejecutan con `bun`) más **`check-coherencia.py`**, que es la
única que ve el hueco entre el plugin y los cinco runbooks: que toda regla
acreditada exista en un manager, que canónica y copia no diverjan, que cada
control tenga los cuatro scripts del procedimiento, que todo parámetro `table`
declare sus columnas y que ninguna evidencia acredite el id de un control en vez
de un requisito.

Se ejecuta desde `<RAIZ>` (necesita ver los repos de los runbooks, que busca
como hermanos de `Wazuh-ENS/`):

```bash
cd /Users/diqueran/Documents/Proyectos/Quersystem/Wazuh/ENS-Desarrollo
python3 Wazuh-ENS/tests/check-coherencia.py   # rc=0 si cuadra
```

Verificado el 12/08/2026: **13 comprobaciones sobre los 5 controles, todas OK,
`rc=0`**, y termina imprimiendo `coherencia OK`.

Suites nombradas en la documentación: `evidence-judgment.test.ts` (las siete
primitivas), `segregacion-funciones.test.ts` (op.acc.3),
`control-en-borrador.test.ts` (DRAFT), `evolucion-diaria.test.ts` (timeline),
`hueco-de-medida.test.ts`, `vista-general-agregada.test.ts`,
`informe-por-control.test.ts`.

### Dónde viven las reglas del agente, en resumen

| Sitio | Qué es | Manda |
|---|---|---|
| `Wazuh-ENS/agent/rules/*.xml` | La copia **canónica** | Para desarrollo |
| `<runbook>/manager/*.xml` | La copia **desplegable**, la que instala `install-manager.sh` | Para trazabilidad: `relatedRules` sale de lo desplegado |
| `/var/ossec/etc/rules/` en el manager | Lo que de verdad dispara | Para diagnóstico |

### Duplicados de documentación dentro del código

Cuatro documentos de arquitectura están **dos veces, idénticos** (md5
comprobado): en `docs/` y junto al código que describen.

| `docs/` | Copia |
|---|---|
| `ENS_ENGINE_ARCHITECTURE.md` | `dashboard/ens/ENS_ENGINE_ARCHITECTURE.md` |
| `ENS_CONFIGURATION_ARCHITECTURE.md` | `dashboard/ens/configuration/ENS_CONFIGURATION_ARCHITECTURE.md` |
| `ENS_DASHBOARD_SPECIFICATION.md` | `dashboard/ens/dashboard/ENS_DASHBOARD_SPECIFICATION.md` |
| `ENS_DASHBOARD_FUNCTIONAL_ARCHITECTURE.md` | `dashboard/ens/dashboard/ENS_DASHBOARD_FUNCTIONAL_ARCHITECTURE.md` |

Hoy son iguales. Al editar uno hay que editar el otro, o divergirán en silencio.

---

## 5. Atajos: los diez ficheros que resuelven el 80 %

Si solo se puede abrir una decena:

1. `Wazuh-ENS/CLAUDE.md` — los principios y las trampas.
2. `Wazuh-ENS/README.md` — desplegar de cero.
3. `Wazuh-ENS/docs/DESPLEGAR_EL_PLUGIN.md` — build, deploy y diagnóstico.
4. `Wazuh-ENS/docs/PONER_UNA_MAQUINA_EN_CUMPLIMIENTO.md` — el método.
5. `Wazuh-ENS/docs/CUMPLIMIENTO_TOTAL.md` — el detalle, evidencia a evidencia.
6. `Wazuh-ENS/docs/PRIMITIVAS_DE_JUICIO.md` — cómo juzga el motor.
7. `Wazuh-ENS/docs/MIGRAR_UNA_EVIDENCIA.md` — cómo se cambia una evidencia.
8. `Wazuh-ENS/docs/COMO_SE_DEMUESTRA_CADA_EVIDENCIA.md` — el comando que dice si va.
9. `op.acc.1-ldap/DIFERENCIAS_CON_EL_CONTROL_NORMAL.md` — por qué el LDAP es otra cosa.
10. `Wazuh-ENS/informes/estado-por-evidencia.html` — dónde estamos hoy.

---

## 6. Lo que NO se ha podido verificar

Se dice con estas palabras, como manda el producto.

- **No he abierto los ficheros de `.superpowers/` uno a uno.** Son 42 ficheros
  y 26.118 líneas de `task-N-brief/report`, `progress.md` y
  `plan-surgery-report.md` de sesiones de desarrollo. Los he identificado y
  contado, pero su contenido no está resumido aquí. No he podido verificar si
  alguno documenta una decisión que no esté ya en `docs/`.
- **No he leído íntegros los cuatro documentos largos**: `CUMPLIMIENTO_TOTAL.md`
  (1.529), `AUDITORIA_FASE_0.md` (762), `AUDITORIA_COHERENCIA_2026-07-30.md`
  (620) y `mp.info.6-.../docs/07-mapa-evidencias.md` (852). De ellos he leído la
  cabecera y el índice completo de apartados; los resúmenes de una línea salen
  de ahí, no de una lectura línea a línea.
- **No he comprobado nada contra las máquinas reales.** Todo lo de este
  documento sale de los ficheros del portátil. No se ha abierto sesión en
  `wazuh4`, `wazuh-real` ni `ldap-adm`.
- **La cifra de «~37.000 líneas» del encargo no cuadra con lo medido**: salen
  27.796 sin los informes de agente y 53.914 con ellos. No he podido
  reconstruir qué conjunto da 37.000.
- **El estado de sincronía de los repos con su remoto no está comprobado.** Se
  ha usado `git` en `Wazuh-ENS/` para comprobar commits y ramas (`af82dfc`,
  `3e92f5c`, `5a60647`, `e862cac`, `f9f489c`, todos existen), pero **no se ha
  hecho `fetch` ni comparado ningún repo con GitLab**. Lo que se describe es el
  árbol de trabajo local a 12/08/2026.
- **`Archivos-Auditor/` no es un repositorio git** y contiene exactamente cuatro
  `.xlsx`: `ENSFacil_Plantilla_op.acc.{1,2,3,4}.xlsx`. No se han abierto. **No
  hay plantilla Excel de mp.info.6 en ningún sitio de `<RAIZ>`**: los únicos
  seis `.xlsx` del árbol son esos cuatro más dos copias de op.acc.1 y op.acc.2
  en `Automatización-Controles/`. Dónde está la de mp.info.6 —si existe— sigue
  sin verificar.
