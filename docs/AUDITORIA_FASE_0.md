# Auditoría de consistencia — Fase 0

> **AVISO DE VIGENCIA (2026-07-30).** Este documento se escribió contra la rama
> `coherencia-estructura-controles`, que refactorizaba el motor en ficheros por
> control. **`main` NO tiene ese refactor** y sigue otra arquitectura: el
> recolector (`agent/collectors/ens_op_acc1_audit.py`) emite solo hechos
> técnicos —sin `estado` ni `nivel`, que el emisor rechaza activamente— y el
> juicio lo hace `dashboard/ens/core/policy-runtime/policies/op-acc-1.evaluator.ts`.
> Lo desplegado es `main`. Las partes de este documento que describan
> `core/evidence/<control>.evidence.ts`, `policy-runtime/runtime/` o
> `informes/report-registry.ts` **no aplican a lo desplegado**. Reconciliar las
> dos arquitecturas es trabajo de la fase 3.


**Repositorio:** `Wazuh-ENS` · **Rama:** `coherencia-estructura-controles` · **Commit base:** `f9f489c`
**Fecha:** 2026-07-29 · **Alcance:** solo lectura. Ningún fichero de código modificado.
**Método:** lectura de código y de las reglas XML del agente, cruce con `grep`/`rg` y scripts de
extracción. El repo no compila por sí solo (sin `package.json`/`tsconfig`), así que no se ha
compilado ni ejecutado ningún test.

**Documentos de referencia auditados:** `CLAUDE.md`, `docs/ENS_CONTROL_DEPLOYMENT.md`.

---

## Entrega 1 — Auditoría de consistencia estructural

### 1.1 Matriz de los 7 ficheros y sus registros

`docs/ENS_CONTROL_DEPLOYMENT.md:14-22` define 7 ficheros por control más el alta en
`ens-requirements.ts`. Verificación fichero a fichero:

| # | Fichero / registro | `mp.info.6` | `op.acc.1` | `op.acc.2` |
|---|---|---|---|---|
| 1 | `catalog/<X>.ts` | OK | OK | OK |
| 1 | registrado en `ENSCatalog` (`catalog/index.ts:11-15`) | OK | OK | OK |
| 2 | `data/<X>.ts` | OK | OK | OK |
| 2 | registrado en `ENSControls` (`data/index.ts:5`) | OK | OK | OK |
| 3 | `configuration/data/<X>-parameters.ts` | OK | OK | OK |
| 3 | `export *` en `configuration/data/index.ts:3-5` | OK | OK | OK |
| 3 | en `ENSConfigurationRegistry` (`configuration/registry/index.ts:6-10`) | OK | OK | OK |
| 4 | `core/policy-runtime/policies/<X>.policy.ts` | OK | OK | OK |
| 4 | en `ENSPolicyRegistry` (`policies/index.ts:10-14`) | OK (registro **muerto**, ver 1.5) | OK (muerto) | OK (muerto) |
| 5 | `core/evidence/<X>.evidence.ts` | OK | OK | OK |
| 5 | spread en `core/evidence/catalog.ts:6-10` | OK | OK | OK |
| 6 | `core/policy-runtime/runtime/<X>.runtime.ts` *(opcional)* | OK | **no existe** (previsto) | **no existe** (previsto) |
| 6 | en `ControlRuntimeRegistry` (`runtime/index.ts:9-11`) | OK | n/a | n/a |
| 7 | `informes/<X>-report-model.ts` | OK | OK | OK |
| 7 | en `ENSReportModelRegistry` (`informes/report-registry.ts:45-49`) | OK | OK | OK |
| + | requisitos en `ens-requirements.ts` | 7/7 | 8/8 | 5/5 |

**Conclusión:** los 8 registros/barrels están completos y sin huecos para los tres controles.
La estructura de alta funciona. Las desviaciones son de **contenido**, no de registro.

### 1.2 Desviaciones documentación ↔ código

| # | Desviación | Fichero / línea | Gravedad |
|---|---|---|---|
| D-01 | El doc sitúa las descripciones de requisitos en `dashboard/ens/ens-requirements.ts`; el fichero real está en `dashboard/ens-requirements.ts` (un nivel arriba, como indica `CLAUDE.md:47`). | `docs/ENS_CONTROL_DEPLOYMENT.md:25` vs `dashboard/ens-requirements.ts` | Baja |
| D-02 | El doc afirma «Ningún control se especial-casa en ficheros compartidos» pero `informes/index.tsx` mantiene un mapa `CONTROL_META` con los tres controles a mano. Degrada con fallback (`|| controlId`), pero es datos por control fuera de registro. | `docs/ENS_CONTROL_DEPLOYMENT.md:5-6` vs `dashboard/ens/informes/index.tsx:42-56` | Baja |
| D-03 | El paso 5 del checklist («sembrar la configuración») solo tiene bloque semilla para op-acc: no existe `config/mp-info-6-control-block.json`. | `docs/ENS_CONTROL_DEPLOYMENT.md:52-57` vs `config/` | Media |
| D-04 | El doc no menciona que `configuration/data/<X>-parameters.ts` también declara `ruleIds` simbólicos, que el motor **mezcla** con los `relatedRules` de evidencia. Es un cuarto punto de verdad no documentado. | `core/evaluation/evaluation-engine.ts:109-114` | Media |
| D-05 | `configuration/data/control-parameters.ts` está **vacío (0 bytes)** y se re-exporta con `export *`. Bajo `isolatedModules` esto es error de compilación (`is not a module`). | `dashboard/ens/configuration/data/control-parameters.ts` (0 B) y `configuration/data/index.ts:2` | Media |
| D-06 | Módulos muertos que no cuelgan del barrel `ens/index.ts` pero siguen leyendo `wazuhRuleIds`: `dashboard/ens/evidence/index.tsx` (`EvidenceENS`) y `dashboard/ens/traceability/index.tsx` (`TraceabilityENS`). Ninguno se exporta en `dashboard/ens/index.ts:1-6`. | `dashboard/ens/evidence/index.tsx:13`, `dashboard/ens/traceability/index.tsx:25` | Baja |
| D-07 | Comentario copiado: el modelo de informe de op.acc.1 se documenta a sí mismo como `buildMpInfo6ReportModel`. | `dashboard/ens/informes/op-acc-1-report-model.ts:79` | Baja |

### 1.3 `family` / `category` intercambiados — confirmado, alcance real

**Confirmado y limitado a `mp.info.6`.**

| Control | `catalog/` (`family` / `category`) | `data/` (`family` / `category`) | `configuration/data/` (`family`) | ¿Intercambio? |
|---|---|---|---|---|
| `mp.info.6` | `Medidas de protección` (L6) / `Protección de la información` (L7) | `Protección de la información` (L8) / `Medidas de protección` (L7) | `Medidas de protección` (L6) | **SÍ** |
| `op.acc.1` | `Marco operacional` (L6) / `Control de acceso` (L7) | `Marco operacional` (L8) / `Control de acceso` (L7) | `Marco operacional` (L6) | No |
| `op.acc.2` | `Marco operacional` (L6) / `Control de acceso` (L7) | `Marco operacional` (L8) / `Control de acceso` (L7) | `Marco operacional` (L6) | No |

`configuration/data/mp-info-6-parameters.ts:6` sigue la convención de `catalog/`. Por tanto el
único fichero desalineado del producto es `dashboard/ens/data/mp-info-6.ts:7-8`.

**Impacto funcional:** `evaluation-engine.ts:355-362` copia `family` y `category` **del catálogo**
al `ENSComplianceResult`, y `core/dashboard-adapter/presenters/family.presenter.ts` agrupa por ese
valor. La agrupación por familias del dashboard usa la convención de `catalog/`, correcta. El valor
invertido de `data/` solo se ve en las pantallas que leen `ENSControls` (`controls/index.tsx:118`).
Es decir: **incoherencia visual, no error de cálculo.**

### 1.4 Doble catálogo `catalog/` (moderno) vs `data/` (legacy) — divergencias campo a campo

Recordatorio de quién manda: el motor evalúa **solo** desde `catalog/` (`core/ens-engine.ts:65`,
`evaluation-engine.ts:88` y `requirement-evaluator.ts:106` filtran por
`requirement.evidenceIds` del catálogo). `data/` solo alimenta la UI. Toda divergencia es, por
tanto, **una discrepancia entre lo que el auditor ve y lo que el motor calcula**.

#### 1.4.1 `mp.info.6` — el más divergente de los tres

**Cabecera del control**

| Campo | `catalog/mp-info-6.ts` | `data/mp-info-6.ts` | Diverge |
|---|---|---|---|
| `id` | `mp.info.6` | `mp.info.6` | No |
| nombre | `name: 'Copias de seguridad'` (L5) | `title: 'Copias de seguridad'` (L5) | No (distinto nombre de campo) |
| familia | `Medidas de protección` (L6) | `Protección de la información` (L8) | **Sí** |
| categoría | `Protección de la información` (L7) | `Medidas de protección` (L7) | **Sí** |
| dimensión | `Disponibilidad` (L8) | `Disponibilidad` (L9) | No |
| niveles | `levels: [BAJO, MEDIO, ALTO]` (L11) | `scope.activeLevels/declaredLevels: [BAJO, MEDIO, ALTO]` + `highLevelStatus: 'NO_EVALUABLE'` (L10-14) | Parcial: `highLevelStatus` no existe en `catalog/` y nadie lo consume |
| — | — | `expectedResult` (L15-34): BAJO CUMPLE/100, MEDIO PARCIAL-85→CUMPLE, ALTO **NO_APLICA** | Solo en `data/`. Contradice `catalog/` que declara ALTO aplicable |

**Requisitos — niveles**

| Requisito | `catalog/` (`applicability.levels`) | `data/` (`level`) | Diverge |
|---|---|---|---|
| `mp.info.6.1` | BAJO, MEDIO, ALTO (L22) | BAJO, MEDIO (L38) | **Sí** |
| `mp.info.6.2.a` | BAJO, MEDIO, ALTO (L34) | BAJO, MEDIO (L46) | **Sí** |
| `mp.info.6.2.b` | BAJO, MEDIO, ALTO (L46) | BAJO, MEDIO (L54) | **Sí** |
| `mp.info.6.2.c` | BAJO, MEDIO, ALTO (L58) | BAJO, MEDIO (L62) | **Sí** |
| `mp.info.6.2.d` | BAJO, MEDIO, ALTO (L70) | BAJO, MEDIO (L70) | **Sí** |
| `mp.info.6.r1.1` | MEDIO, ALTO (L82) | MEDIO (L78) | **Sí** |
| `mp.info.6.r2.1` | ALTO (L94) | ALTO + `active: false` (L86, L91) | Concepto `active` solo en `data/` |

Es decir: **6 de 7 requisitos declaran niveles distintos** en los dos catálogos. En nivel ALTO el
motor evalúa 7 requisitos y la UI legacy solo pinta 1 como aplicable.

**Requisitos — títulos** (los 7 difieren)

| Requisito | `catalog/` | `data/` |
|---|---|---|
| `.1` | Realización de copias de seguridad | Copias realizadas y recuperabilidad temporal |
| `.2.a` | Periodicidad de las copias | Frecuencia de las copias |
| `.2.b` | Conservación de las copias | Almacenamiento en el propio lugar |
| `.2.c` | Almacenamiento en otros lugares | Almacenamiento en otros lugares (descripción distinta) |
| `.2.d` | Control de acceso a las copias | Acceso autorizado a las copias |
| `r1.1` | Pruebas de restauración | Prueba de restauración regular |
| `r2.1` | Copia en ubicación alternativa | Copia separada |

Nótese que `.2.b` cambia de **significado**: «Conservación» (retención) en `catalog/` vs
«Almacenamiento en el propio lugar» (rutas locales) en `data/`. La `policy` le asigna
`ruleType: 'MIN_RETENTION'` (`policies/mp-info-6.policy.ts:27`), coherente con `catalog/`.
`ens-requirements.ts:9-10` sigue la versión de `data/` («Almacenamiento local»).

**Evidencias por requisito:** los conjuntos `evidenceIds` (catalog) y `evidences` (data)
**coinciden** en los 7 requisitos.

**Evidencias — niveles y títulos**

| EV | niveles `data/` | niveles `core/evidence/` | Título `data/` | Título `core/evidence/` |
|---|---|---|---|---|
| EV-01 | BAJO, MEDIO (L98) | BAJO, MEDIO, ALTO (L10) | Backup correcto en ventana temporal | Última copia realizada correctamente |
| EV-02 | BAJO, MEDIO (L110) | BAJO, MEDIO, ALTO (L35) | Periodicidad configurada | Copia dentro del intervalo permitido |
| EV-03 | BAJO, MEDIO (L122) | BAJO, MEDIO, ALTO (L49) | Integridad de rutas y elementos de backup | **Retención de copias configurada** |
| EV-04 | BAJO, MEDIO (L134) | BAJO, MEDIO, ALTO (L63) | Acceso técnico controlado | Acceso autorizado al repositorio |
| EV-05 | MEDIO (L146) | MEDIO, ALTO (L77) | Restore real con md5sum | Prueba de restauración correcta |
| EV-06 | ALTO (L158) + `active:false` (L166) | ALTO (L109) | Copia separada R2 | Repositorio alternativo operativo |
| EV-07 | BAJO, MEDIO (L171) | BAJO, MEDIO, ALTO (L126) | Ausencia de errores recientes | **Logs correctamente interpretados** |

EV-03 y EV-07 no solo cambian de redacción: describen **evidencias distintas**. `data/` habla de
integridad de rutas y de ausencia de errores; `core/evidence/` habla de retención y de decodificación.
Los `expectedEventTypes` confirman que son cosas distintas (ver 2.4).

**Parámetros:** la única divergencia de asignación requisito↔parámetro es `P-02`
(`margen_tolerancia_horas`): `catalog/mp-info-6.ts:37` lo asocia a `mp.info.6.2.a`, pero
`data/mp-info-6.ts:197` y `configuration/data/mp-info-6-parameters.ts:35` solo lo asocian a
`mp.info.6.1`. Aquí el outlier es `catalog/`.
Vocabulario de `type` distinto entre los dos catálogos: `data/` usa `int_hours`, `int_days`,
`path_list`, `user_process_list`, `enum`, `int_days_by_criticality`, `list_hostname_criticality`,
`path_or_url` (campo libre, `types/index.ts:37`), mientras `configuration/` usa la unión cerrada
`duration_hours | duration_days | list | path | select | string | boolean`
(`configuration/types/index.ts`). Ninguno de los tipos de `data/` es válido en `configuration/`.

#### 1.4.2 `op.acc.1` — coherente salvo la atribución evidencia↔requisito

| Campo | Resultado |
|---|---|
| id, nombre, familia, categoría, dimensión | Coinciden (`catalog/op-acc-1.ts:4-8` ↔ `data/op-acc-1.ts:4-9`) |
| niveles del control | Coinciden |
| niveles de los 8 requisitos | **Coinciden todos** |
| títulos de los 8 requisitos | Coinciden |
| evidencias por requisito (`evidenceIds` ↔ `evidences`) | **Coinciden todos** |
| `expectedResult` | Solo en `data/` (L15-34): BAJO/MEDIO/ALTO todos CUMPLE-100 |
| eventos por evidencia | **Coinciden todos** entre `data/` y `core/evidence/` |
| niveles y títulos de evidencia | **Coinciden todos** |

Divergencia real (dirección inversa evidencia→requisito):

| Evidencia | `core/evidence/op-acc-1.evidence.ts` y `data/` dicen pertenecer a… | `catalog/op-acc-1.ts` la lista en… | Problema |
|---|---|---|---|
| EV-03 | `op.acc.1.1`, `op.acc.1.3` (L53) | solo `op.acc.1.1` (L24) | El motor **no** usa EV-03 al evaluar `op.acc.1.3`; el informe sí la atribuye |
| EV-05 | `op.acc.1.2`, `op.acc.1.3` (L89) | solo `op.acc.1.2` (L36) | Idem |

Divergencia parámetro↔requisito (`catalog.parameterIds` vs `parameter.requirements`):

| Requisito | `catalog/` declara | Parámetros que se declaran de ese requisito (`configuration/` y `data/`) | Diferencia |
|---|---|---|---|
| `op.acc.1.1` | P-01, P-04 (L25) | P-04 | **P-01 no reconoce `op.acc.1.1`** (`op-acc-1-parameters.ts:18`) |
| `op.acc.1.3` | P-01, P-02, P-03 (L49) | P-01, P-02, P-03, **P-04** | P-04 se declara de `.3` (`op-acc-1-parameters.ts:81`) y el catálogo no lo recoge |
| `op.acc.1.4` | P-05, P-06, P-08 (L61) | P-01, P-02, P-05, P-06, P-08 | P-01/P-02 se declaran de `.4` y el catálogo no los recoge |
| `op.acc.1.5` | P-01 (L73) | **ninguno** | Ningún parámetro se declara de `op.acc.1.5` |
| `op.acc.1.r1.1` | P-02 (L85) | **ninguno** | Ningún parámetro se declara de `op.acc.1.r1.1` |
| `op.acc.1.r1.2` | P-07 (L97) | P-07 | OK |
| `op.acc.1.r1.3` | P-07 (L111) | P-07 | OK |

#### 1.4.3 `op.acc.2` — coherente salvo EV-04 y la atribución de EV-01/EV-03

| Campo | Resultado |
|---|---|
| id, nombre, familia, categoría, dimensión, niveles | Coinciden |
| niveles y títulos de los 5 requisitos | Coinciden |
| evidencias por requisito | Coinciden |
| eventos, niveles y títulos de evidencia (`data/` ↔ `core/evidence/`) | **Coinciden todos** |
| parámetros por requisito (`catalog/` ↔ `configuration/`) | **Coinciden todos** |
| `expectedResult` | Solo en `data/` (L15-33): ALTO **PARCIAL** por R1 no acreditado |
| `active: false` | Solo en `data/`: requisitos `r1.1`/`r1.2` (L66, L75) y EV-05/EV-06 (L148, L161) |

Divergencias concretas:

| Elemento | `core/evidence/op-acc-2.evidence.ts` | `data/op-acc-2.ts` | `catalog/op-acc-2.ts` |
|---|---|---|---|
| EV-04 → requisitos | `op.acc.2.2`, **`op.acc.2.r1.2`** (L73) | solo `op.acc.2.2` (L122) | `r1.2` lista EV-05, EV-06 — **no EV-04** (L76) |
| EV-01 → requisitos | `op.acc.2.1`, `op.acc.2.3` (L10) | igual (L81) | `op.acc.2.3` lista EV-02, EV-03, EV-07 — **no EV-01** (L48) |
| EV-03 → requisitos | `op.acc.2.1`, `op.acc.2.2` (L52) | igual (L105) | `op.acc.2.3` **sí** lista EV-03 (L48), pero la evidencia no lo reconoce |

`configuration/data/op-acc-2-parameters.ts:131` refuerza la lectura de `core/evidence/`: `P-06`
(exclusivo de `r1.2`) declara `evidenceIds: ['EV-04','EV-06']`. Hay por tanto **dos creencias
coexistentes** sobre si EV-04 sostiene `op.acc.2.r1.2`; el motor sigue la del catálogo (no la usa).

### 1.5 `ENSPolicyDefinition` declarativas de op-acc: existen y **no se consumen** — confirmado

Verificado por búsqueda exhaustiva: `ENSPolicyRegistry` y `getENSPolicyDefinition`
(`policies/index.ts:10` y `:16`) **no tienen ningún consumidor** en todo el árbol. El orquestador
`runPolicyRuntime` (`policy-runtime.ts:8-33`) resuelve el módulo por
`getControlRuntimeModule(context.control.id)` (`:11`) contra `ControlRuntimeRegistry`
(`runtime/index.ts:9-11`), que solo contiene `mpInfo6Runtime`.

Consecuencia exacta para op.acc.1 y op.acc.2:

- `runPolicyRuntime` devuelve `decisions: []` y `runtimeVariables: []` (`policy-runtime.ts:13-32`).
- En `requirement-evaluator.ts:110-120` no se encuentra `policyDecision`, así que el estado sale de
  `resolveFunctionalStatus(...)` — puro **rollup del estado de las evidencias**.
- Los `ruleType` declarados en `op-acc-1.policy.ts` (`WHITELIST` ×2, `MAX_AGE` ×1,
  `COVERAGE_REQUIRED` ×5) y en `op-acc-2.policy.ts` (`PATH_MATCH`, `CONDITIONAL_REQUIRED`,
  `WHITELIST`, `COVERAGE_REQUIRED` ×2) **no se ejecutan**. Son documentación con forma de tipo.
- En particular, `op.acc.1.4` declara `MAX_AGE` (`op-acc-1.policy.ts:34`) pero nunca compara
  `plazo_max_deshabilitar_dias` (P-05) contra el `dias_desde_baja` observado: el veredicto sale
  únicamente de si EV-01/EV-02/EV-04/EV-08 traen eventos y de qué `estado` traen. Si el agente emite
  `account_offboarding` con `estado=CUMPLE`, el requisito sale CUMPLE aunque el plazo se haya
  incumplido — el juicio lo hace hoy **la regla del manager**, no el plugin.
- Igual con `op.acc.2.3` (`PATH_MATCH`, `op-acc-2.policy.ts:27`): las rutas de P-02 nunca se cotejan
  contra la `ruta` del evento FIM.
- Lo mismo con `P-07 umask_minimo`: nunca se compara `umask_real` contra el umbral configurado.

Esto es coherente con lo anotado en `docs/ENS_CONTROL_DEPLOYMENT.md:117-128`, pero conviene
remarcar el efecto de producto: **hoy los parámetros de configuración de op.acc.1 y op.acc.2 no
influyen en el veredicto salvo por la vía de "parámetro requerido sin valor → NO_EVALUABLE"**
(`evaluation-engine.ts:85-94` y `requirement-evaluator.ts:63-65`).

### 1.6 Especial-casing en ficheros compartidos

Búsqueda de identificadores de control codificados a mano fuera de los ficheros dedicados: **solo
aparecen en barrels/registries legítimos**, más dos excepciones:

| Fichero | Línea | Naturaleza |
|---|---|---|
| `dashboard/ens/informes/index.tsx` | 42-56 | `CONTROL_META`: nombre y subtítulo por control, a mano. Con fallback `|| controlId` (L508, L774) |
| `dashboard/ens/core/ens-engine.test-fixture.ts` | 9, 20, 31, 41, 44 | Fixture de pruebas, solo `mp.info.6`. Aceptable, pero es el único control con fixture |

No se ha encontrado ningún `if (controlId === 'mp.info.6')` en el motor. **El refactor de coherencia
estructural cumplió su objetivo en el motor.**

---

## Entrega 2 — Mapa EV → rule ID, verificado contra las reglas reales

### 2.0 Nota metodológica

La tabla siguiente se ha derivado leyendo los `<field name="event">`, los `<group>` y los
`<info type="text">` de cada `<rule>` de:
`agent/rules/ensfacil_mp_info_6_json_rules.xml`, `agent/rules/ensfacil_mp_info_6_pbs_rules.xml`,
`agent/rules/ensfacil_op_acc_1_json_rules.xml`, `agent/rules/ensfacil_op_acc_2_json_rules.xml`.

Las reglas genéricas de `evidence_state` (`1066xx`/`1068xx`/`1069xx` terminadas en 50-53 / 00-03)
**aplican a cualquier EV** porque el `evidence_id` viaja en el payload, no en la regla; no deben
declararse como `relatedRules` de una evidencia concreta.

### 2.1 `mp.info.6` — tabla real (rango 106600-106722)

| EV | Requisito | Eventos | Rule IDs reales |
|---|---|---|---|
| EV-01 | `mp.info.6.1` | `backup_ok`, `backup_missing` | **106650** (backup_ok, CUMPLE), **106601** (backup_missing, NO_CUMPLE — comparte EV-02) |
| EV-02 | `mp.info.6.1`, `.2.a` | `backup_missing`, `freq_deviation` | **106601**, **106603** (freq_deviation, NO_CUMPLE) |
| EV-03 | `.2.b`, `.2.d` | `access` (authorized=false), FIM nativo, `encfp_changed`, `verify_ok`, `verify_error` | **106604** (comparte EV-04), **106605** (FIM nativo — *no funcional*, ver 2.5), **106609** (comparte EV-07), **106660**, **106661** (fichero PBS) |
| EV-04 | `.2.d` | `access` con `authorized=false` | **106604** |
| EV-05 | `r1.1` | `restore_ok`, `restore_error`, `restore_missing` | **106651** (CUMPLE, exige `job_id`+`restored_path`+`status`+`md5`), **106607** (restore_error), **106606** (restore_missing → NO_EVALUABLE), *106652 (level 0, suprime sintéticos — no genera alerta)* |
| EV-06 | `r2.1` | `offsite_ok`, `offsite_error` | **106662**, **106663** (fichero PBS) |
| EV-07 | `.1`, `.2.b`, `.2.c` | `backup_error`, `encfp_changed` | **106690** (backup_error, nivel 7), **106602** (`if_matched_sid=106690`, 3×/24 h → NO_CUMPLE), **106609** |

### 2.2 `op.acc.1` — tabla real (rango 106800-106872)

| EV | Requisito | Eventos | Rule IDs reales |
|---|---|---|---|
| EV-01 | `op.acc.1.3` (+ `.4`, `.5`, `r1.1`, `r1.2` por catálogo) | `account_inventory`, `account_active` | **106810**, **106811** |
| EV-02 | `op.acc.1.3`, `.4` | `account_created`, `account_modified`, `account_deleted` | **106812**, **106813**, **106818** (comparte EV-08) |
| EV-03 | `op.acc.1.1` | `generic_account_login`, `auth_success` | **106801** (NO_CUMPLE), **106802** (CUMPLE) |
| EV-04 | `op.acc.1.4` | `account_disabled`, `account_offboarding` | **106815** (CUMPLE), **106816** (`account_offboarding` + `estado=NO_CUMPLE`), **106817** (`account_offboarding` genérico) |
| EV-05 | `op.acc.1.2` | `service_account_interactive`, `interactive_login` | **106805** (NO_CUMPLE), **106806** (CUMPLE) |
| EV-06 | `op.acc.1.2` (+ `r1.2`) | `multi_role_usage`, `privilege_use` | **106807** (NO_CUMPLE), **106808** (CUMPLE) |
| EV-07 | `op.acc.1.r1.3` | `authorized_list_check`, `unauthorized_user` | **106825** (CUMPLE), **106826** (NO_CUMPLE) |
| EV-08 | `op.acc.1.4` | `account_deleted`, `retention_violation` | **106818**, **106819** (NO_CUMPLE) |

Genéricas (aplican a todas): 106850 CUMPLE · 106851 NO_CUMPLE · 106852 NO_EVALUABLE · 106853 NO_APLICA.
Control/score: 106860-106863 y 106870-106872. Base: 106800.

### 2.3 `op.acc.2` — tabla real (rango 106900-106972)

| EV | Requisito | Eventos | Rule IDs reales |
|---|---|---|---|
| EV-01 | `op.acc.2.1` | `sca_check`, `world_writable`, `umask_check` | **106901** (CUMPLE), **106902** (world_writable, NO_CUMPLE), **106903** (`umask_check` + `estado=NO_CUMPLE`), **106904** (`umask_check` CUMPLE) |
| EV-02 | `op.acc.2.3` | `fim_modified`, `fim_added`, `fim_deleted` | **106920**, **106921**, **106922**, **106923** (FIM nativo — *no funcional*, ver 2.5) |
| EV-03 | `op.acc.2.2` (`.1` según catálogo) | `access_denied`, `privilege_escalation`, `sudo_usage` | **106910**, **106911** (NO_CUMPLE), **106912** |
| EV-04 | `op.acc.2.2` | `acl_check`, `acl_deviation` | **106913** (CUMPLE), **106914** (NO_CUMPLE) |
| EV-05 | `op.acc.2.r1.1` | `privilege_check`, `excessive_privilege`, `group_membership` | **106930** (CUMPLE), **106931** (NO_CUMPLE), **106932** |
| EV-06 | `op.acc.2.r1.2` | `access_type_violation`, `object_access` | **106935** (NO_CUMPLE), **106936** (CUMPLE) |
| EV-07 | `op.acc.2.3` (`.1` según catálogo) | `rootcheck`, `suid_sgid`, `no_owner_file` | **106925** (CUMPLE), **106926** (NO_CUMPLE), **106927** (NO_CUMPLE) |

Genéricas: 106950-106953 · control 106960-106963 · score 106970-106972 · base 106900.

### 2.4 Lo que declara hoy TypeScript vs lo que debería declarar

**Recuento global de identificadores declarados** (conteo exacto sobre los ficheros):

| Campo | Fichero(s) | Total | Numéricos | Simbólicos |
|---|---|---:|---:|---:|
| `relatedRules` | `core/evidence/{mp-info-6,op-acc-1,op-acc-2}.evidence.ts` | 23 | **0** | **23** |
| `wazuhRuleIds` | `data/{mp-info-6,op-acc-1,op-acc-2}.ts` | 34 | 18 (solo mp.info.6) | **16** |
| `ruleIds` | `configuration/data/{...}-parameters.ts` | 26 | **0** | **26** |
| **Total** | | **83** | **18** | **65** |

De los 18 numéricos, **10 son incorrectos** (apuntan a reglas genéricas o de otro evento, ver 2.4.1).

#### 2.4.1 `mp.info.6`

| EV | `core/evidence/mp-info-6.evidence.ts` → `relatedRules` | `data/mp-info-6.ts` → `wazuhRuleIds` | Debería ser | Diagnóstico |
|---|---|---|---|---|
| EV-01 | `['ENS-MPINFO6-BACKUP-SUCCESS']` (L15) | `['106650']` (L105) | `106650, 106601` | Simbólico en evidence; falta 106601 en data |
| EV-02 | `['ENS-MPINFO6-BACKUP-MISSING']` (L40) | `['106700','106720','106721']` (L117) | `106601, 106603` | **Los 3 IDs de `data/` son falsos**: 106700 es `evidence_state` genérica; 106720/106721 son `score_snapshot` |
| EV-03 | `['ENS-MPINFO6-RETENTION']` (L54) | `['106609','106700','106701']` (L129) | `106604, 106609, 106660, 106661` (+106605 no funcional) | 106609 correcto; 106700/106701 son genéricas; faltan 106604, 106660, 106661 |
| EV-04 | `['ENS-MPINFO6-UNAUTHORIZED-ACCESS']` (L68) | `['106700','106701']` (L141) | `106604` | **Los 2 IDs son genéricos**; falta el único ID real |
| EV-05 | `['ENS-MPINFO6-RESTORE-MISSING']` (L87) | `['106651','106607','106606','106702']` (L153) | `106651, 106607, 106606` | Correcto salvo 106702 (genérica NO_EVALUABLE) |
| EV-06 | `['ENS-MPINFO6-OFFSITE']` (L114) | `['106703','106713']` (L165) | `106662, 106663` | **Ambos falsos**: 106703 es `evidence_state NO_APLICA`, 106713 es `control_state NO_APLICA` |
| EV-07 | `['ENS-MPINFO6-DECODER']` (L131) | `['106690','106602','106609']` (L178) | `106690, 106602, 106609` | **Único caso correcto del repo** |

#### 2.4.2 `op.acc.1`

| EV | `relatedRules` (`op-acc-1.evidence.ts`) | `wazuhRuleIds` (`data/op-acc-1.ts`) | Debería ser |
|---|---|---|---|
| EV-01 | `['ENS-OPACC1-INVENTORY']` (L22) | `['ENS-OPACC1-INVENTORY']` (L118) | `106810, 106811` |
| EV-02 | `['ENS-OPACC1-IDENTITY-FIM']` (L43) | idem (L135) | `106812, 106813, 106818` |
| EV-03 | `['ENS-OPACC1-GENERIC-ACCOUNT']` (L59) | idem (L147) | `106801, 106802` |
| EV-04 | `['ENS-OPACC1-DISABLE-DELAY']` (L79) | idem (L159) | `106815, 106816, 106817` |
| EV-05 | `['ENS-OPACC1-SERVICE-INTERACTIVE']` (L99) | idem (L175) | `106805, 106806` |
| EV-06 | `['ENS-OPACC1-MULTI-ROLE']` (L115) | idem (L187) | `106807, 106808` |
| EV-07 | `['ENS-OPACC1-UNAUTHORIZED-USER']` (L135) | idem (L199) | `106825, 106826` |
| EV-08 | `['ENS-OPACC1-RETENTION']` (L155) | idem (L211) | `106818, 106819` |

**16 de 16 identificadores simbólicos.** El nombre `ENS-OPACC1-IDENTITY-FIM` de EV-02 induce además
a error: no existe ninguna regla FIM para op.acc.1; las reglas 106812/106813/106818 son de eventos
propios (`if_sid 106800`), no de `syscheck`.

#### 2.4.3 `op.acc.2`

| EV | `relatedRules` (`op-acc-2.evidence.ts`) | `wazuhRuleIds` (`data/op-acc-2.ts`) | Debería ser |
|---|---|---|---|
| EV-01 | `['ENS-OPACC2-WORLD-WRITABLE','ENS-OPACC2-UMASK']` (L21) | idem (L89) | `106901, 106902, 106903, 106904` |
| EV-02 | `['ENS-OPACC2-FIM-SO']` (L42) | idem (L101) | `106920, 106921, 106922` (106923 no funcional) |
| EV-03 | `['ENS-OPACC2-ACCESS-DENIED']` (L63) | idem (L118) | `106910, 106911, 106912` |
| EV-04 | `['ENS-OPACC2-ACL-DEVIATION']` (L79) | idem (L130) | `106913, 106914` |
| EV-05 | `['ENS-OPACC2-PRIV-INDIVIDUAL']` (L100) | idem (L147) | `106930, 106931, 106932` |
| EV-06 | `['ENS-OPACC2-ACCESS-TYPE']` (L120) | idem (L160) | `106935, 106936` |
| EV-07 | `['ENS-OPACC2-ROOTCHECK']` (L141) | idem (L173) | `106925, 106926, 106927` |

**16 de 16 simbólicos** (EV-01 declara dos).

#### 2.4.4 Cuarto punto de verdad no contemplado: `configuration/data/*-parameters.ts`

`evaluation-engine.ts:109-114` construye `ENSComplianceResult.relatedRules` como
**unión de `configuration.parameters[].ruleIds` y `evidences[].relatedRules`**. Los 26 `ruleIds` de
configuración son **todos** simbólicos (11 en mp.info.6, 8 en op.acc.1, 7 en op.acc.2), y **9 de
ellos no se corresponden ni con una regla existente ni con un identificador usado en las
evidencias** — no hay nada que traducir, hay que eliminarlos:

| Identificador simbólico huérfano | Fichero:línea | Comentario |
|---|---|---|
| `ENS-MPINFO6-SYSTEM-MISSING` | `mp-info-6-parameters.ts:79` | No hay regla de «sistema sin cobertura» |
| `ENS-MPINFO6-FIM-LOCAL` | `mp-info-6-parameters.ts:114` | La única FIM (106605) no es funcional |
| `ENS-MPINFO6-OFFSITE-FIM` | `mp-info-6-parameters.ts:165` | No existe |
| `ENS-OPACC1-IDENTITY-SOURCE` | `op-acc-1-parameters.ts:27` | No existe |
| `ENS-OPACC1-SYSTEM-MISSING` | `op-acc-1-parameters.ts:48` | No existe |
| `ENS-OPACC1-HR-CORRELATION` | `op-acc-1-parameters.ts:176` | No existe |
| `ENS-OPACC2-SYSTEM-MISSING` | `op-acc-2-parameters.ts:27` | No existe |
| `ENS-OPACC2-POLICY-REF` | `op-acc-2-parameters.ts:90` | No existe |
| `ENS-OPACC2-PRIV-MODEL` | `op-acc-2-parameters.ts:111` | No existe |

#### 2.4.5 Dónde ve el auditor estos identificadores

Ambas familias llegan a pantalla, en tablas distintas del **mismo** detalle de control:

- `relatedRules` → columna «rule id» en `controls/control-detail/index.tsx:213` y en
  `evidences/index.tsx:180`.
- `wazuhRuleIds` → columna «Rule IDs Wazuh» en `controls/control-detail/index.tsx:190` y en
  `evidence/index.tsx:22` (módulo muerto).

Matiz importante: `core/evidence/engine.ts:322-327` **añade** el `rule.id` numérico real del evento
que resolvió la evidencia. Es decir, cuando llega evento el auditor ve
`ENS-OPACC1-INVENTORY, 106810`; cuando **no** llega (que es justo el caso en el que necesita
auditar), ve solo `ENS-OPACC1-INVENTORY`, un identificador que no existe en ningún sitio de Wazuh.
La cadena `CUMPLE → evidencia → rule ID → evento crudo` se rompe precisamente en el estado
NO_EVALUABLE.

### 2.5 Reglas que dependen de alertas nativas de Wazuh — confirmado y ampliado

**Confirmado el mecanismo.** `core/data-source/opensearch-provider.ts:16-24` construye el filtro:

```ts
const buildControlFilter = (controlId: string) => ({
  bool: {
    should: [
      { term: { 'data.control': controlId } },
      { term: { 'data.ensfacil': controlId } },
    ],
    minimum_should_match: 1,
  },
});
```

y se aplica como cláusula `must` (`:47-49`). Una alerta sin `data.ensfacil` (ni `data.control`)
**nunca** llega al plugin. Además `data-source-engine.ts:209-214` deduce `controlId` de
`data.ensfacil || data.ens || data.control_id || data.control`: sin ninguno de esos campos el evento
queda sin control asignado.

**Reglas afectadas — hay DOS, no una:**

| Regla | Fichero:línea | Ancla | Diagnóstico |
|---|---|---|---|
| **106923** (op.acc.2 · EV-02) | `agent/rules/ensfacil_op_acc_2_json_rules.xml:121-127` | `<if_group>syscheck</if_group>` | Re-etiqueta alertas FIM nativas. El evento resultante lleva `syscheck.*`, no `data.ensfacil` → **nunca llega al plugin**. Confirmado. |
| **106605** (mp.info.6 · EV-03) | `agent/rules/ensfacil_mp_info_6_json_rules.xml:48-54` | `<if_group>syscheck</if_group>` | Misma construcción, mismas rutas de backup. **Mismo problema, no documentado hasta ahora.** |

El resto de reglas de los tres controles cuelgan de `if_sid` de la regla base
(106600 / 106800 / 106900), que exige `<field name="ensfacil">`, o de `if_matched_sid` sobre una
regla que sí lo exige (106602 sobre 106690; 106652 sobre 106651). Todas ellas conservan
`data.ensfacil` en la alerta compuesta y sí llegan al plugin.

Caso aparte: **106652** (`ensfacil_mp_info_6_json_rules.xml:100-106`) es `level="0"`, por lo que no
genera alerta y nunca aparecerá en `wazuh-alerts-*`. No es un fallo: es supresión de eventos
sintéticos, y su función la duplica el motor en `evidence/engine.ts:134-141` vía
`qualityRequirements.rejectSynthetic`.

### 2.6 Eventos huérfanos: reglas que sí llegan pero que ninguna evidencia acepta

`core/evidence/engine.ts:237-239` y `:250` exigen `definition.expectedEventTypes.includes(event.eventType)`
para que un evento resuelva una evidencia. Cruzando los `<field name="event">` del XML contra los
`expectedEventTypes` declarados:

**`mp.info.6` — 5 eventos reales que ninguna evidencia acepta:**

| Evento | Regla | Consecuencia |
|---|---|---|
| `freq_deviation` | 106603 (NO_CUMPLE, EV-02) | Una desviación de frecuencia **no puede** poner EV-02 en NO_CUMPLE |
| `access` (`authorized=false`) | 106604 (NO_CUMPLE, EV-03/EV-04) | Un acceso no autorizado a las copias **no puede** poner EV-03/EV-04 en NO_CUMPLE |
| `encfp_changed` | 106609 (NO_CUMPLE, EV-03/EV-07) | Un cambio de fingerprint de cifrado **no puede** poner EV-03/EV-07 en NO_CUMPLE |
| `verify_ok` / `verify_error` | 106660 / 106661 (EV-03) | La verificación de integridad PBS **no alimenta** ninguna evidencia |

Estos eventos sí llegan (llevan `ensfacil`) y aparecen en la traza histórica
(`evaluation-engine.ts:149-289`), pero **no alteran el semáforo**. Son incumplimientos que se
pierden silenciosamente. Simétricamente, 15 `expectedEventTypes` declarados en
`core/evidence/mp-info-6.evidence.ts` no tienen regla que los produzca (`backup_success`,
`retention_configured`, `backup_modified`, `backup_deleted`, `backup_ransomware`,
`authorized_access`, `unauthorized_access`, `decoder_ok`, `backup_warning`, `backup_timeout`,
`backup_disk_full`, `backup_network_error`, `restore_success`, `offsite_missing`, `offsite_success`
— este último sí, vía la normalización `offsite_ok → offsite_success` de
`data-source-engine.ts:194-197`).

**`op.acc.1` y `op.acc.2`: correspondencia perfecta.** Cero eventos huérfanos en ambos sentidos.
Los `expectedEventTypes` de `core/evidence/op-acc-*.evidence.ts` coinciden exactamente con los
`<field name="event">` del XML y con `data/op-acc-*.ts`. Es la parte mejor construida del repo.

---

## Entrega 3 — Riesgos para la fase 3

### 3.1 Interfaz exacta de `ControlRuntimeModule`

`dashboard/ens/core/policy-runtime/runtime/types.ts:10-17`:

```ts
export interface ControlRuntimeModule {
  controlId: string;
  buildRuntimeVariables: (context: ENSPolicyContext) => ENSRuntimeVariable[];
  buildDecisions: (
    context: ENSPolicyContext,
    variables: ENSRuntimeVariable[]
  ) => ENSPolicyDecision[];
}
```

Tipos asociados (`core/policy-runtime/types.ts`):

- `ENSPolicyContext` (`:25-31`): `{ control: ENSControlDefinition; configuration?: ENSControlConfiguration; level: ENSLevel; events: ENSNormalizedEvent[]; evidences: ENSEvidenceResolved[] }`.
- `ENSRuntimeVariable` (`:40-47`): `{ name; value: ENSRuntimeVariableValue; parameterIds: string[]; evidenceIds: string[]; eventIds: string[]; description: string }`.
- `ENSPolicyDecision` (`:58-68`): `{ policyId; requirementId; status: ENSComplianceStatus; parameterIds; evidenceIds; eventIds; runtimeVariables: string[]; trace: ENSPolicyTrace; reason: string }`.
- `ENSPolicyTrace` (`:49-56`): `{ ruleId; ruleType: ENSPolicyRuleType; expression; expected; actual; result: boolean }`.
- `ENSPolicyRuleType` (`:8-15`): `MAX_AGE | MIN_RETENTION | COVERAGE_REQUIRED | WHITELIST | CONDITIONAL_REQUIRED | PATH_MATCH | TOOL_MATCH`.

Patrón de referencia: `mp-info-6.runtime.ts` exporta al final (`:1944-1948`)
`export const mpInfo6Runtime: ControlRuntimeModule = { controlId: 'mp.info.6', buildRuntimeVariables, buildDecisions: buildPolicyDecisions }`,
donde `buildPolicyDecisions` (`:1918-1942`) concatena 7 constructores, uno por requisito.
El alta es una línea en `runtime/index.ts:9-11`.

### 3.2 Conexión runtime ↔ rollup de evidencias, y quién gana

Cadena completa: `ens-engine.ts:74-91` construye contexto → `runPolicyRuntime` →
`evaluateENSControl(catalogControl, configuration, level, evidences, policyRuntime, scopedEvents)`
→ `evaluation-engine.ts:88-94` pasa `policyRuntime?.decisions || []` a `evaluateRequirements` →
`requirement-evaluator.ts:110-120`:

```ts
const policyDecision = policyDecisions.find(
  decision => decision.requirementId === requirement.id
);

const status = policyDecision
  ? policyDecision.status
  : resolveFunctionalStatus(
      requirement.evidenceIds,
      requirementEvidences,
      hasMissingRequiredParameters
    );
```

**Gana el runtime, sin excepciones y por requisito.** Si existe una `ENSPolicyDecision` cuyo
`requirementId` coincide, su `status` sustituye por completo al rollup. Consecuencias exactas:

1. La decisión del runtime **también sobreescribe la protección de configuración incompleta**:
   `hasMissingRequiredParameters` solo se consulta dentro de `resolveFunctionalStatus`
   (`:22`, `:56-65`), que ya no se ejecuta. Una decisión mal construida puede producir **CUMPLE con
   la configuración vacía** — exactamente lo que prohíbe el principio rector.
2. La decisión **no** anula el `NO_APLICA` por nivel: `requirement-evaluator.ts:88-104` sale antes,
   de modo que un requisito fuera de nivel sigue en NO_APLICA aunque el runtime opine.
3. El rollup sí conserva su papel para los requisitos **sin** decisión, y las observaciones se
   suman: `requirement-evaluator.ts:129-135` concatena observaciones de evidencia + `decision.reason`.
4. Aguas abajo, `evaluateControlStatus` (`control/control-evaluator.ts:41-49`) agrega los estados de
   requisito ya resueltos; el runtime no interviene ahí.
5. Las no conformidades cambian de redacción cuando hay decisión:
   `evaluation-engine.ts:315-352` usa `decision.reason`, `decision.trace.expected` y
   `decision.trace.actual` en lugar del texto genérico.

**Regla de oro para fase 3:** un constructor de decisión debe devolver `[]` (no una decisión
NO_EVALUABLE, y desde luego no CUMPLE) cuando le falte el parámetro o la variable. Ese es el patrón
de `mp-info-6.runtime.ts:965-973`:

```ts
if (backupThresholdHours === undefined || lastBackupAgeHours === undefined) {
  return [];
}
```

Devolver `[]` cede el requisito al rollup, que ya sabe caer a NO_EVALUABLE.

### 3.3 Parámetros comparables contra valores observados, y de qué campo sale el observado

**De dónde sale el valor observado.** `data-source-engine.ts:65-70` construye
`attributes` haciendo `{...data, ...campos derivados}`. Como todo el payload JSON del evento se
vuelca en `attributes`, **cualquier campo del ndjson emitido es accesible como
`event.attributes.<nombre>`** (y también como `evidence.resolvedAttributes.<nombre>`,
`evidence/engine.ts:337). Los nombres de campo se han verificado contra
`agent/samples/muestra_op_acc_1.ndjson` y `agent/samples/muestra_op_acc_2.ndjson`.

**Aviso:** no reutilizar los alias derivados de mp.info.6. `buildEventAttributes` fija a `undefined`
para eventos op-acc los campos `job_id`, `start_time`, `end_time`, `bytes_written`, `tool`,
`last_sync`, `replication_*`, `backup_path` (`:71-109`), y sobre todo `retention_days`
(`:143-147`) mapea `retention_days | retentionDays | retencion_dias | retencionDias`, **no**
`dias_retenida` ni `retencion_min` de op.acc.1. Además sobreescribe `status` con
`data.status ?? data.estado` (`:74`). Un runtime op-acc debe leer los nombres crudos.

#### op.acc.1 (`configuration/data/op-acc-1-parameters.ts`)

| Param | Nombre | `ruleType` propuesto | Comparación | Campo del evento (`attributes.*`) | Evento / regla |
|---|---|---|---|---|---|
| P-01 | `fuente_identidad` | `TOOL_MATCH` | igualdad con la fuente declarada por el agente | `fuente` | `account_inventory` / 106810 |
| P-02 | `sistemas_monitorizados` | `COVERAGE_REQUIRED` | cada sistema en scope debe aportar ≥1 evento | `event.agentName` (deriva de `agent.name` o `data.host`, `data-source-engine.ts:243-247`) | cualquiera |
| P-03 | `cuentas_servicio_definidas` | `WHITELIST` | `usuario ∈ P-03` con login interactivo → NO_CUMPLE | `usuario`, `tipo_logon` | `service_account_interactive` / 106805, `interactive_login` / 106806 |
| P-04 | `cuentas_genericas_prohibidas` | `WHITELIST` | `usuario ∈ P-04` con autenticación correcta → NO_CUMPLE | `usuario` | `generic_account_login` / 106801, `auth_success` / 106802 |
| **P-05** | `plazo_max_deshabilitar_dias` | **`MAX_AGE`** | `dias_desde_baja <= P-05` | `dias_desde_baja` (el emisor ya adjunta `plazo_max`, útil para contrastar la config del agente contra la del plugin) | `account_disabled` / 106815, `account_offboarding` / 106816-106817 |
| **P-06** | `periodo_retencion_cuentas_dias` | **`MIN_RETENTION`** | `dias_retenida >= P-06` | `dias_retenida` (y `retencion_min` como control cruzado) | `account_deleted` / 106818, `retention_violation` / 106819 |
| P-07 | `lista_usuarios_autorizados` | `WHITELIST` | `cuentas_activas == cuentas_autorizadas`; y `usuario ∉ P-07` → NO_CUMPLE | `cuentas_activas`, `cuentas_autorizadas`, `usuario` | `authorized_list_check` / 106825, `unauthorized_user` / 106826 |
| P-08 | `integracion_rrhh` | `CONDITIONAL_REQUIRED` | si `false`, EV-04 no puede acreditar automáticamente → NO_EVALUABLE en vez de CUMPLE | — (parámetro puro, sin observado) | — |

Los dos de mayor valor son **P-05 y P-06**: son los únicos que hoy dejan el juicio íntegramente en
manos de la regla del manager (`estado` calculado en el agente), y los únicos que permiten un
`trace.expected/actual` numérico auditable.

#### op.acc.2 (`configuration/data/op-acc-2-parameters.ts`)

| Param | Nombre | `ruleType` propuesto | Comparación | Campo del evento (`attributes.*`) | Evento / regla |
|---|---|---|---|---|---|
| P-01 | `sistemas_en_scope` | `COVERAGE_REQUIRED` | cobertura por agente | `event.agentName` / `host` | cualquiera |
| **P-02** | `rutas_criticas_so` | **`PATH_MATCH`** | `ruta ∈ P-02` (prefijo/glob) | `ruta` | `fim_modified` / 106920, `fim_added` / 106921, `fim_deleted` / 106922 |
| P-03 | `permisos_world_writable_permitidos` | `WHITELIST` | si `false`, cualquier `world_writable` → NO_CUMPLE; si `true`, `ruta` debe estar en la excepción | `ruta`, `permisos` | `world_writable` / 106902 |
| P-04 | `politica_acceso_so_referencia` | `TOOL_MATCH` | igualdad/no vacío contra la política citada por el evento | `politica` | `acl_check` / 106913 |
| P-05 | `modelo_privilegios` | `CONDITIONAL_REQUIRED` | `modelo == P-05`; sin P-05 → R1 NO_EVALUABLE | `modelo`, `grupo` | `privilege_check` / 106930, `excessive_privilege` / 106931 |
| P-06 | `tipos_acceso_permitidos_por_perfil` | `WHITELIST` | `acceso ⊆ permitido(perfil(usuario))` | `usuario`, `recurso`, `acceso`, `permitido` | `access_type_violation` / 106935, `object_access` / 106936 |
| **P-07** | `umask_minimo` | **`WHITELIST`** (comparación octal) | `umask_real` no más permisivo que P-07 | `umask_real` (y `umask_min` como control cruzado) | `umask_check` / 106903-106904 |

Los tres accionables de verdad son **P-02** (comparación de ruta), **P-07** (comparación octal) y
**P-06** (matriz perfil→tipo de acceso).

### 3.4 Disciplina TDZ — estado actual

`app-router.tsx:20-21` carga `Settings` con `React.lazy` y lo envuelve en `Suspense`
(`:102-104`). La disciplina se mantiene ahí. La convención (`CLAUDE.md:118-119`,
`docs/ENS_CONTROL_DEPLOYMENT.md:81-86`) exige importar tipos desde `./types` / `../types`, nunca
desde un barrel de alto nivel.

**Ficheros de los tres controles (los 7×3 + registros): todos limpios.**

| Fichero | Import | Veredicto |
|---|---|---|
| `catalog/{mp-info-6,op-acc-1,op-acc-2}.ts:1` | `from './types'` | OK |
| `data/{...}.ts:1` | `from '../types'` | OK |
| `configuration/data/{...}-parameters.ts:1` | `from '../types'` | OK |
| `core/policy-runtime/policies/{...}.policy.ts:1` | `from '../types'` | OK |
| `core/evidence/{...}.evidence.ts:1` | `from './types'` | OK |
| `core/policy-runtime/runtime/mp-info-6.runtime.ts:1-6` | `from '../types'` + `from './types'` | OK |
| `informes/{mp-info-6,op-acc-1,op-acc-2}-report-model.ts:1` | `import type { ENSComplianceResult } from '../core'` | **OK por `import type`**: se borra en compilación, no crea import en runtime. Si alguien le quita el `type`, arrastra `core/index.ts` entero (que reexporta `data-source` → `kibana-services`) |

**Ficheros de motor que sí infringen la convención** (no son de control, pero están en la ruta de
cualquier runtime nuevo):

| Fichero:línea | Import | Riesgo |
|---|---|---|
| `core/policy-runtime/types.ts:2` | `import { ENSControlDefinition } from '../../catalog'` | Barrel de alto nivel: `catalog/index.ts` construye el valor `ENSCatalog` (`:11-15`). Todo módulo de runtime lo hereda vía `runtime/types.ts:1-5` |
| `core/policy-runtime/policy-context-builder.ts:2` | idem | Idem |
| `core/evaluation/evaluation-engine.ts:2` | `from '../../catalog'` | Idem |
| `core/evaluation/evaluation-engine.ts:1` | `from '../policy-runtime'` (barrel) | Ciclo potencial: `policy-runtime/index.ts` → `runtime` → `types` → `catalog` |
| **`core/evaluation/evaluation-engine.ts:4`** | `import { validateControlConfiguration } from '../../configuration/services'` | **El peor**: el barrel `configuration/services/index.ts:4` reexporta `configuration-http-client.ts`, cuya línea 1 es `import { getHttp } from '../../../../../kibana-services'`. Se arrastra `kibana-services` — el módulo del plugin `main` que participa en el ciclo de `Settings` — solo para usar una función pura que vive en `validation-engine.ts:96` |
| `core/ens-engine.ts:4` | idem | Idem |
| `core/evaluation/requirement/requirement-evaluator.ts:1` | `from '../../../catalog'` | Incoherente **dentro del propio fichero**: la línea 2 sí usa `'../../../catalog/types'` |
| `core/evaluation/requirement/requirement-evaluator.ts:5` | `from '../../policy-runtime'` (barrel) | Idem |
| `core/evaluation/types.ts:12` | `from '../policy-runtime'` (barrel) | Idem |
| `core/data-source/index.ts:6` | reexporta `wazuh-search-source-provider.ts`, cuya línea 1 importa `getPlugins` de `kibana-services` | Cualquier `from './data-source'` arrastra `kibana-services` |

Ninguna de estas infracciones está en un fichero de control, y todas son preexistentes. Pero
**`core/policy-runtime/types.ts:2` sí está en la ruta obligatoria de un módulo de runtime**: un
`op-acc-1.runtime.ts` que copie las 6 primeras líneas de `mp-info-6.runtime.ts` hereda la cadena
`runtime/types.ts → policy-runtime/types.ts → catalog/index.ts`. Es tolerable hoy porque
`catalog/` no importa nada de `core/`, pero cualquier ampliación que haga que `catalog/` importe de
`core/` cierra el ciclo.

**Reglas concretas para los dos ficheros nuevos de fase 3:**

- Copiar literalmente el bloque de imports de `mp-info-6.runtime.ts:1-6` y **no añadir nada más**.
- Prohibido en `op-acc-*.runtime.ts`: `from '../../../catalog'`, `from '../../../configuration/services'`,
  `from '../../evaluation'`, `from '../../../../core'`, `from '../../../index'`.
- Si hace falta un tipo de configuración: `from '../../../configuration/types'` (módulo de tipos, sin
  valores ni `kibana-services`). Si hace falta un tipo de evidencia: `from '../../evidence/types'`.
- Si hace falta un tipo del catálogo: `from '../../../catalog/types'`, **nunca** `'../../../catalog'`.

### 3.5 Riesgos concretos de romper algo, con fichero y línea

| # | Riesgo | Fichero:línea | Por qué rompe | Mitigación |
|---|---|---|---|---|
| **R-01** | **CUMPLE falso con configuración vacía.** La decisión del runtime sustituye al rollup sin comprobar `hasMissingRequiredParameters` | `core/evaluation/requirement/requirement-evaluator.ts:114-120` | Es la única vía por la que un runtime nuevo puede violar el principio rector del producto | Todo constructor devuelve `[]` si falta parámetro o variable (patrón `mp-info-6.runtime.ts:965-973`). Nunca emitir CUMPLE por defecto |
| **R-02** | **Regresión silenciosa del veredicto de op-acc.** Hoy sale del rollup; al registrar el runtime pasa a salir de las decisiones para todo requisito cubierto | `core/policy-runtime/runtime/index.ts:9-11` (alta) → efecto en `requirement-evaluator.ts:114` | Un mismo dato puede cambiar de CUMPLE a NO_CUMPLE sin cambiar el evento. Sin build ni tests aquí, el fallo es silencioso | Cubrir requisito a requisito, no de golpe. Documentar en `ENS_CONTROL_DEPLOYMENT.md` qué requisitos pasan a decisión |
| **R-03** | **Cambio de texto de las no conformidades.** Con decisión, la NC usa `decision.reason` / `trace.expected` / `trace.actual` en vez del texto genérico | `core/evaluation/evaluation-engine.ts:315-352` (esp. `:338-345`) | El PDF y la tabla de hallazgos cambian de redacción para op-acc | Redactar `reason` en español, con expected/actual explícitos, antes de registrar el módulo |
| **R-04** | **Migración parcial de rule IDs.** `relatedRules` del control se construye uniendo `configuration.parameters[].ruleIds` y `evidences[].relatedRules` | `core/evaluation/evaluation-engine.ts:109-114` | Si solo se migra `core/evidence/*.evidence.ts`, la misma celda mostrará `106810, ENS-OPACC1-IDENTITY-SOURCE` | Migrar los **tres** sitios a la vez: `core/evidence/*.evidence.ts` (23), `data/*.ts` (16 simbólicos + 10 numéricos erróneos) y `configuration/data/*-parameters.ts` (26, de los cuales 9 huérfanos que deben eliminarse, no traducirse) |
| **R-05** | **Dos tablas del mismo detalle de control con vocabulario distinto.** `wazuhRuleIds` y `relatedRules` se pintan en la misma pantalla | `controls/control-detail/index.tsx:190` y `:213`; `evidences/index.tsx:180`; `evidence/index.tsx:22` | Migrar solo una deja al auditor con dos listas contradictorias | Migrar ambas en el mismo commit |
| **R-06** | **IDs numéricos ya presentes que son falsos.** 10 de los 18 de `data/mp-info-6.ts` apuntan a reglas genéricas o de otro evento | `data/mp-info-6.ts:117` (106700/106720/106721), `:141` (106700/106701), `:165` (106703/106713), `:129` (106700/106701 sobrantes), `:153` (106702 sobrante) | Fase 3 podría dar por buenos los numéricos existentes y migrar solo los simbólicos | Corregir `data/mp-info-6.ts` con la tabla de 2.1, no solo traducir los simbólicos |
| **R-07** | **Declarar reglas que nunca llegan.** 106923 y 106605 dependen de `syscheck` y no llevan `data.ensfacil` | `agent/rules/ensfacil_op_acc_2_json_rules.xml:121-127`; `agent/rules/ensfacil_mp_info_6_json_rules.xml:48-54`; filtro en `core/data-source/opensearch-provider.ts:16-24` | Si se declaran en `relatedRules`, el auditor pincha un rule ID que jamás producirá un evento visible | No declararlas, o reescribirlas para que inyecten `ensfacil` (p. ej. regla propia que emita el evento `fim_modified` con el campo) |
| **R-08** | **Eventos que el runtime querrá leer y la evidencia descarta.** `encfp_changed`, `freq_deviation`, `access`, `verify_*` no están en ningún `expectedEventTypes` de mp.info.6 | `core/evidence/mp-info-6.evidence.ts:14, 39, 53, 67, 81, 113, 130` vs XML | Un runtime que recorra `context.events` sí los verá, pero `context.evidences` no; decisiones y evidencias contarán historias distintas | Alinear `expectedEventTypes` con el XML antes de tocar el runtime, o basar la decisión solo en `context.events` y documentarlo |
| **R-09** | **Ambigüedad parámetro↔requisito en op.acc.1.** El catálogo y la configuración no coinciden en 5 de 8 requisitos | `catalog/op-acc-1.ts:25, 49, 61, 73, 85` vs `configuration/data/op-acc-1-parameters.ts:18, 39, 81, 102, 124, 146` | Un runtime que resuelva «qué parámetros aplican a este requisito» por una vía u otra obtendrá conjuntos distintos. `op.acc.1.5` y `op.acc.1.r1.1` no tienen **ningún** parámetro que se declare suyo | Fijar `catalog.parameterIds` como fuente única (es lo que el motor ya usa para todo lo demás) y corregir la configuración |
| **R-10** | **Ambigüedad EV-04 ↔ `op.acc.2.r1.2`.** La evidencia y P-06 lo afirman; el catálogo y `data/` lo niegan | `core/evidence/op-acc-2.evidence.ts:73`; `configuration/data/op-acc-2-parameters.ts:131`; `catalog/op-acc-2.ts:76`; `data/op-acc-2.ts:122` | El runtime de `r1.2` podría incluir o excluir EV-04 en `decision.evidenceIds`, cambiando la NC que se muestra (`evaluation-engine.ts:331-335`) | Decidir y unificar antes de escribir el runtime |
| **R-11** | **Fichero vacío reexportado.** `control-parameters.ts` tiene 0 bytes y se reexporta | `configuration/data/control-parameters.ts` (0 B); `configuration/data/index.ts:2` | Bajo `isolatedModules` (habitual en el build de Wazuh) es error `is not a module`. Cualquier toque a ese barrel lo destapa | Borrar el fichero y su `export *`, o añadirle `export {};` |
| **R-12** | **Niveles del legacy sin ALTO en mp.info.6.** El motor evalúa 7 requisitos en ALTO; la UI legacy pinta 6 como BAJO/MEDIO | `data/mp-info-6.ts:38, 46, 54, 62, 70, 78` vs `catalog/mp-info-6.ts:22, 34, 46, 58, 70, 82` | Al añadir trazas nuevas, la discrepancia motor/UI se hará más visible en nivel ALTO | Alinear `data/mp-info-6.ts` con el catálogo (fuera del alcance de fase 3, pero anotarlo) |
| **R-13** | **TDZ por conveniencia.** Es tentador importar `ENSControlDefinition` desde `'../../../catalog'` en el runtime nuevo | Precedente en `core/policy-runtime/types.ts:2` y `core/evaluation/requirement/requirement-evaluator.ts:1` | Reintroduce el ciclo transitivo de `Settings`: Wazuh en blanco con `Cannot access 'Settings' before initialization` | Copiar los imports de `mp-info-6.runtime.ts:1-6` y nada más (ver 3.4) |

---

## Resumen ejecutivo

1. **65 de los 83 identificadores de regla declarados en TypeScript son simbólicos e inexistentes**
   (`ENS-OPACC1-INVENTORY`…): rompen la cadena `CUMPLE → evidencia → rule ID → evento crudo`
   justo cuando la evidencia está NO_EVALUABLE, que es cuando el auditor la necesita.
2. **10 de los 18 IDs numéricos de `data/mp-info-6.ts` son falsos**: apuntan a reglas genéricas
   (`evidence_state`, `control_state`, `score_snapshot`) o a otro evento. EV-04 y EV-06 no tienen
   ni un solo ID correcto. Es peor que el simbólico: parece trazable y no lo es.
3. **Dos reglas no llegan nunca al plugin**, no una: 106923 (op.acc.2) y **106605 (mp.info.6)**,
   ambas ancladas a `syscheck` sin campo `ensfacil`.
4. **5 eventos reales de mp.info.6 se pierden en silencio** (`encfp_changed`, `freq_deviation`,
   `access`, `verify_ok/error`): ninguna evidencia los acepta, así que un NO_CUMPLE del manager no
   mueve el semáforo.
5. **Riesgo nº1 de la fase 3**: la decisión del runtime sobreescribe el rollup *y* la protección de
   configuración incompleta (`requirement-evaluator.ts:114-120`) — puede generar el CUMPLE falso
   que el producto prohíbe. Todo constructor debe devolver `[]` si falta el dato.
6. Las `ENSPolicyDefinition` de op-acc están **confirmadas como código muerto**: `ENSPolicyRegistry`
   no tiene consumidores; hoy los parámetros de op.acc.1/op.acc.2 no influyen en el veredicto.
7. **`family`/`category` intercambiados solo en `data/mp-info-6.ts:7-8`** (op-acc está bien);
   impacto visual, no de cálculo.
8. **`mp.info.6` es el control incoherente**: 6 de 7 requisitos con niveles distintos entre
   catálogos, los 7 títulos distintos y EV-03/EV-07 describiendo evidencias diferentes.
   `op.acc.1` y `op.acc.2` están casi limpios.
9. Desajustes menores a corregir antes de fase 3: `op.acc.1.5` y `op.acc.1.r1.1` sin ningún
   parámetro que se declare suyo; EV-04 ↔ `op.acc.2.r1.2` afirmado por evidencia y negado por
   catálogo; `control-parameters.ts` vacío y reexportado (error bajo `isolatedModules`).
10. **La disciplina TDZ se respeta en los 19 ficheros de control** (7 de mp.info.6, 6 de op.acc.1 y
    6 de op.acc.2); las infracciones están en el
    motor (`evaluation-engine.ts:4` arrastra `kibana-services` vía el barrel de servicios) y no deben
    copiarse en `op-acc-1.runtime.ts` / `op-acc-2.runtime.ts`.

---

## Adenda (2026-07-30) — hallazgos posteriores a la auditoría

Encontrados durante la implementación de la fase 1 y del simulador de op.acc.2.
Todos son del plugin y ninguno se ha corregido aquí; van a la fase 3.

### A1. `op-acc-2.evidence.ts` no concuerda con la policy ni con el catálogo

`EV-01` se declara de `op.acc.2.3` y `EV-04` de `op.acc.2.r1.2`, pero esos
requisitos no las listan entre sus evidencias. Es una discrepancia en el mismo
control y en la misma dirección que el doble catálogo ya anotado.

Criterio aplicado mientras tanto, al construir el simulador de op.acc.2: **la
policy manda**, porque es lo que ejecuta el motor. El `requisito` de cada evento
se toma del `<info>` de su regla Wazuh.

### A2. Dos reglas describían CUMPLE para eventos que también llegan NO_CUMPLE

`106810` (`account_inventory`) y `106825` (`authorized_list_check`) eran regla
única de nivel 3 con descripción de CUMPLE, pero los recolectores emiten esos
mismos eventos con `estado=NO_CUMPLE` —UIDs duplicados y cuentas activas que no
figuran en la lista autorizada—. Un incumplimiento real aparecía en la vista de
alertas de Wazuh como nivel 3 diciendo CUMPLE y sin el grupo `non_conformity`.

**Corregido** (commits `48f5653` y `2bb831b`): añadidas `106809` y `106824` con
el patrón de `106903`/`106904` de op.acc.2, y severidades alineadas con la
convención de op.acc.1 (12 para el hecho incumplidor, 10 para el agregado).

Conviene barrer op.acc.2 y mp.info.6 buscando el mismo patrón cuando tengan
recolectores reales que emitan ambos estados.

### A3. `data.uid` tenía dos tipos entre controles

op.acc.1 lo emite numérico y la muestra de op.acc.2 lo traía como cadena. Como
ambos controles escriben en `wazuh-alerts-*`, es un solo campo con un solo tipo:
el primero en llegar fija el mapping y el otro falla al indexar en silencio.
Unificado a numérico en el simulador de op.acc.2.

**Regla general para controles nuevos**: antes de dar por bueno un evento,
cruzar el **tipo** de cada campo contra los que ya emiten los demás controles,
no solo su nombre.

### A4. `muestra_op_acc_2.ndjson` no es autoritativa

Sus `ts` están congelados en julio y emite `control_state` con el id del control
(`op.acc.2`) en vez del requisito, que es lo que producen `score.py` y el script
de mp.info.6 y lo que consume el motor. Sirve como referencia de campos, no de
contrato. Conviene regenerarla desde el simulador.
