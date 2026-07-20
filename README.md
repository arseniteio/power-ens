# ENSFácil

Módulo de cumplimiento ENS (RD 311/2022) integrado en el dashboard de Wazuh.

Evalúa controles del Esquema Nacional de Seguridad a partir de evidencias
técnicas reales recogidas por Wazuh, y genera informes auditables.

## Controles implementados

| Control | Nombre | Familia | Refuerzos |
|---|---|---|---|
| `mp.info.6` | Copias de seguridad | Medidas de protección | R1 (MEDIO+), R2 (ALTO) |
| `op.acc.1`  | Identificación | Marco operacional | R1 (MEDIO+) |
| `op.acc.2`  | Requisitos de acceso | Marco operacional | R1 (solo ALTO) |

## Estructura

```
dashboard/          Código del plugin (React + TypeScript)
  ens/              Módulo ENS completo
    catalog/        Definición de controles (motor)
    data/           Catálogo legacy (UI)
    configuration/  Parámetros configurables por control
    core/           Motor de evaluación, evidencias, policies
    controls/       Pestaña Controles y Detalle
    informes/       Pestaña Informes + modelos de informe y PDF
    evidences/      Pestaña Evidencias
  app-router.tsx    Router del plugin (Settings en carga diferida)
  ens-requirements.ts  Descripciones de requisitos ENS

agent/              Pipeline del lado agente
  rules/            Reglas Wazuh por control
  emit/             Emisor de eventos ndjson
  samples/          Eventos de ejemplo por tipo
  agent.conf        Bloques localfile del grupo ens

config/             Scripts de alta de controles en el índice de configuración
docs/               Documentación de instalación y arquitectura
```

## Arquitectura del flujo

```
script del cliente
  -> emite ndjson en /var/log/ensfacil/<control>.json
  -> logcollector (tail)
  -> decoder json nativo de Wazuh
  -> reglas ENSFácil (106xxx)
  -> índice wazuh-alerts-*
  -> motor ENSFácil en el dashboard
  -> semáforo, evidencias e informes
```

## Añadir un control nuevo

1. Rellenar la plantilla Excel del control (ficha, parámetros, evidencias, informe).
2. Crear los 5 ficheros de datos en `dashboard/ens/`:
   `catalog/`, `data/`, `configuration/data/`, `core/policy-runtime/policies/`,
   `informes/<control>-report-model.ts`.
3. Registrarlo en los 5 barrels y añadir sus evidencias a `core/evidence/catalog.ts`.
4. Añadir sus requisitos a `ens-requirements.ts`.
5. Compilar, desplegar y sembrar su configuración en `wazuh-ens-configuration`.
6. Crear sus reglas en `agent/rules/` con un rango de IDs libre.

## Rangos de rule IDs

| Control | Rango |
|---|---|
| `mp.info.6` | 106600 - 106722 |
| `op.acc.1`  | 106800 - 106872 |
| `op.acc.2`  | 106900 - 106972 |
