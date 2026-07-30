# Despliegue de un control ENS — método canónico

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


Guía para dar de alta un control ENS nuevo en ENSFácil. Tras el refactor de
coherencia estructural, **cada control se registra igual en todas las carpetas**:
un fichero dedicado + una línea en un registro/barrel. Ningún control se
especial-casa en ficheros compartidos.

## Convención por control

Sea `<X>` el id kebab del control (`mp.info.6` → `mp-info-6`) y `<camel>` su
forma camel (`mpInfo6`, `opAcc1`, `opAcc2`). Cada control aporta estos ficheros
y se registra en el punto indicado:

| # | Fichero | Símbolo exportado | Registro |
|---|---|---|---|
| 1 | `dashboard/ens/catalog/<X>.ts` | `<camel>CatalogDefinition` | array `ENSCatalog` en `catalog/index.ts` |
| 2 | `dashboard/ens/data/<X>.ts` | `<camel>Control` | array `ENSControls` en `data/index.ts` |
| 3 | `dashboard/ens/configuration/data/<X>-parameters.ts` | `<camel>Configuration` | `export *` en `configuration/data/index.ts` **y** array `ENSConfigurationRegistry` en `configuration/registry/index.ts` |
| 4 | `dashboard/ens/core/policy-runtime/policies/<X>.policy.ts` | `<camel>PolicyDefinition` | array `ENSPolicyRegistry` en `policies/index.ts` |
| 5 | `dashboard/ens/core/evidence/<X>.evidence.ts` | `<camel>Evidences: ENSEvidenceDefinition[]` | spread en `core/evidence/catalog.ts` |
| 6 | `dashboard/ens/core/policy-runtime/runtime/<X>.runtime.ts` *(opcional)* | `<camel>Runtime: ControlRuntimeModule` | array `ControlRuntimeRegistry` en `runtime/index.ts` |
| 7 | `dashboard/ens/informes/<X>-report-model.ts` | `build<Camel>ReportModel` | map `ENSReportModelRegistry` en `informes/report-registry.ts` |

Además: describir los requisitos del control en
`dashboard/ens/ens-requirements.ts`.

**Nota sobre el fichero 6 (runtime):** solo se crea si el control necesita una
**capa imperativa** — comparar parámetros contra valores observados (umbrales,
whitelist, retención…). Un control sin módulo de runtime obtiene su veredicto del
**rollup del estado de sus evidencias** en el motor de evaluación
(`core/evaluation/`). Hoy solo `mp.info.6` tiene módulo de runtime; `op.acc.1` y
`op.acc.2` se resuelven por rollup.

## Checklist de alta

El Excel de la plantilla es la **fuente de verdad**. El generador (`main.py`,
también `generar.py`, que vive en el árbol del plugin `main`, no en este repo)
produce casi todo:

1. **Rellenar la plantilla Excel** del control (5 hojas: Ficha, Parámetros,
   Evidencias Wazuh, Condiciones de Incumplimiento, Informe). Para producción,
   fijar el `ruleType` en la hoja `Motor` (ver aviso abajo).
2. **`python3 main.py`** → genera los ficheros 1-5 y 7 de la tabla, los registra
   en sus barrels/registries, inserta las evidencias y escribe el bloque JSON de
   config. Idempotente (lee lo existente y regenera el fichero entero).
3. **Fichero de runtime (6)**, solo si el control lleva capa imperativa: crearlo
   a mano en `core/policy-runtime/runtime/<X>.runtime.ts` exportando un
   `ControlRuntimeModule` y añadirlo a `ControlRuntimeRegistry`.
4. **Reglas del manager** en `agent/rules/ensfacil_<X>_json_rules.xml` con un
   rango de rule IDs libre (ver tabla de rangos abajo), y añadir el `localfile`
   correspondiente en `agent/agent.conf`.
5. **Sembrar la configuración** en el índice `wazuh-ens-configuration` (EN EL
   SERVIDOR). El ejemplo en este repo es `config/inject-opacc2.py`: dry-run por
   defecto, `--apply` para escribir, lee `OS_USER`/`OS_PASS` del entorno,
   preserva el resto del doc `active` y es idempotente. Necesario porque el
   guardado desde la UI rechaza un control que no esté ya en el índice
   (huevo/gallina).
6. **Build y deploy** en el árbol de Wazuh (ver abajo).

### Qué genera el script y qué rellena por IA

Genera del Excel: catalog, data legacy, parameters, policy, report-model,
evidence catalog, los registros/barrels, ens-requirements y el bloque de config.

Rellena por IA local (Ollama) lo que el Excel no trae: `title`, `ruleType`,
`label`, `events` de cada evidencia, `auditQuestion`, y qué parámetros muestra
cada campo del informe. Todo lo generado por IA se valida (listas cerradas,
formato) y se lista bajo "Rellenado por IA — REVISAR". Degrada sin Ollama.

## Aviso crítico: el `ruleType`

**El `ruleType` es el campo más peligroso.** Un modelo coder tiende a poner
`COVERAGE_REQUIRED` genérico, y equivocarse ahí es un fallo **SILENCIOSO**:
compila, despliega y evalúa mal sin avisar. Para controles a producción, fijarlo
en la hoja `Motor` del Excel (columnas: `requisito | ruleType`) que el script ya
busca. Los `ruleType` con semántica imperativa (`MAX_AGE`, `MIN_RETENTION`,
`WHITELIST`, `CONDITIONAL_REQUIRED`…) requieren además un módulo de runtime
(fichero 6) que implemente la comparación; sin él, el requisito cae al rollup de
evidencias.

## Disciplina TDZ (obligatoria)

Importar tipos siempre desde `./types` / `../types`, **nunca** desde un barrel de
alto nivel. Reintroducir un import de alto nivel puede destapar el ciclo
transitivo de `Settings` (`app-router.tsx` lo carga con `React.lazy` justo por
eso): `Cannot access 'Settings' before initialization` deja Wazuh en blanco.

## Ciclo de build y deploy

```bash
cd <arbol>/plugins/main
YARN_IGNORE_ENGINES=1 node ../../scripts/plugin_helpers build \
  --allow-root --opensearch-dashboards-version=2.19.5
# verificar: unzip -p build/wazuh-2.19.5.zip | grep -c "<control>"  (>0)
# deploy: stop dashboard, remove plugin, rm RUTAS EXACTAS (nunca wazuh*),
#         install file://, start
```

**Rutas de borrado EXACTAS en deploy** (`/usr/share/wazuh-dashboard/plugins/wazuh`
y `.plugin.installing`). Nunca el comodín `wazuh*`: borra `wazuhCore` y rompe
todo. El dashboard sirve SOLO el zip instalado, no recompila del fuente.

Este repo no compila por sí solo (no hay `package.json`/`tsconfig`): es el
conjunto de artefactos fuente que se copian dentro de `<arbol>/plugins/main`.

## Rangos de rule IDs

| Control | Nombre | Rango |
|---|---|---|
| `mp.info.6` | Copias de seguridad | 106600 - 106722 |
| `op.acc.1` | Identificación | 106800 - 106872 |
| `op.acc.2` | Requisitos de acceso | 106900 - 106972 |

Cada control nuevo toma un rango libre sin colisión.

## Deuda anotada (no-objetivos actuales)

- **Reescritura declarativa del motor.** Hoy `mp.info.6` implementa su capa
  imperativa a mano en su módulo de runtime; los `ENSPolicyDefinition`
  declarativos de op-acc (`policies/`) existen pero no los consume el runtime.
  Unificar todo en un motor que ejecute los `ruleType` desde datos es un proyecto
  de comportamiento aparte (riesgo de fallo silencioso; requiere build/tests).
- **Doble catálogo** `catalog/` (moderno) vs `data/` (legacy con
  `expectedResult`): pueden divergir.
- **`family`/`category` intercambiados** entre `catalog/` y `data/` en
  `mp.info.6`. Los controles nuevos siguen la convención de `catalog/`.
- **op.acc.1 / op.acc.2 sin módulo de runtime:** su veredicto sale del rollup de
  evidencias, no de comparaciones parámetro-vs-observado.
