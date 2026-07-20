# ENSFácil — ENS Compliance Engine Architecture

**Versión:** 1.0  
**Estado:** Borrador arquitectónico inicial  
**Ubicación:** `public/components/overview/ens/`  
**Objetivo:** Definir la arquitectura base del motor de cumplimiento ENS de ENSFácil sobre Wazuh.

---

## 1. Visión del proyecto

ENSFácil no debe entenderse como una colección de pantallas dentro de Wazuh Dashboard.

ENSFácil debe entenderse como una plataforma de cumplimiento ENS construida sobre Wazuh, donde Wazuh actúa como fuente principal de datos técnicos y ENSFácil transforma esos datos en evidencias, evaluaciones, resultados de cumplimiento e informes auditables.

La finalidad principal del ENS Compliance Engine es centralizar toda la lógica de cumplimiento del Esquema Nacional de Seguridad para que Dashboard, Controls, Evidences, Events, Reports y el botón ENS por agente consuman una única fuente de verdad.

---

## 2. Principio fundamental

Ninguna pantalla debe calcular cumplimiento ENS.

Las pantallas únicamente deben representar información ya evaluada por el ENS Compliance Engine.

Esto significa que Dashboard, Controls, Control Detail, Evidences, Events, Reports y el botón ENS por agente no deben decidir si un control cumple, no cumple, es parcial, no evaluable o no aplica.

Esa decisión pertenece exclusivamente al motor.

---

## 3. Objetivo arquitectónico

El objetivo del ENS Compliance Engine es permitir que ENSFácil pueda incorporar controles ENS presentes y futuros sin rediseñar las pantallas ni duplicar lógica.

Un nuevo control ENS debe incorporarse mediante catálogos, configuración, evidencias y reglas de evaluación, no mediante nuevas pantallas específicas ni condiciones hardcodeadas.

No debe existir lógica del tipo:

```ts
if (controlId === 'mp.info.6') {
  // lógica específica del control
}
```

El motor debe trabajar de forma genérica con controles, requisitos, parámetros, evidencias, eventos y resultados.

# ENS Engine Architecture v2

## Objetivo

El motor ENS debe evaluar controles del Esquema Nacional de Seguridad de forma desacoplada del Dashboard, permitiendo incorporar nuevos controles sin modificar la lógica principal del motor.

El Dashboard no calcula cumplimiento ENS. Solo consume resultados ya evaluados por el motor.

## Principio arquitectónico principal

Cada módulo responde una única pregunta:

| Módulo | Pregunta |
|---|---|
| Catalog | ¿Qué controles, requisitos y evidencias existen? |
| Configuration | ¿Qué parámetros ha definido el cliente? |
| Applicability Engine | ¿Este requisito aplica al nivel/contexto del cliente? |
| Data Source Engine | ¿Qué datos técnicos existen en Wazuh/OpenSearch? |
| Evidence Engine | ¿Existe evidencia suficiente? |
| Requirement Evaluator | ¿Cumple el requisito ENS? |
| Control Evaluator | ¿Cumple el control ENS? |
| Scoring Engine | ¿Cuál es la puntuación? |
| Summary Engine | ¿Qué métricas agregadas existen? |
| Dashboard Adapter | ¿Qué modelo necesita la UI? |

## Jerarquía del modelo ENS

```txt
ENSControl
  └── ENSRequirement[]
        └── ENSEvidence[]

Nunca debe calcularse el control directamente desde evidencias sueltas.

Estados permitidos
CUMPLE
PARCIAL
NO_CUMPLE
NO_EVALUABLE
NO_APLICA
Regla crítica de NO_APLICA

NO_APLICA es una decisión de aplicabilidad, no una falta de datos.

Un requisito NO_APLICA:

debe existir;
debe mostrarse;
debe contabilizarse;
no debe penalizar score;
no debe convertirse en NO_EVALUABLE;
debe incluir motivo.

Ejemplo:

mp.info.6.r2.1
Nivel cliente: BAJO/MEDIO
Resultado: NO_APLICA
Motivo: requisito aplicable solo a nivel ALTO

---

## Arquitectura lógica ENS Engine v2

```txt
ENS Domain
  ├── Control
  ├── Requirement
  ├── Evidence
  ├── Parameter
  ├── Applicability
  ├── Scoring
  └── Summary

ENS Catalog
  └── Define controles ENS disponibles

ENS Configuration
  └── Define parámetros del cliente

ENS Core
  ├── Data Source Engine
  ├── Evidence Engine
  ├── Requirement Evaluator
  ├── Control Evaluator
  ├── Scoring Engine
  └── Summary Engine

ENS Dashboard
  └── Consume resultados ya evaluados
Separación de responsabilidades
Domain

Contiene tipos, contratos y reglas puras del ENS.

No debe importar:

React
OpenSearch
Wazuh API
EUI
componentes visuales
Catalog

Define qué controles existen.

Ejemplo:

mp.info.6
  ├── mp.info.6.1
  ├── mp.info.6.2.a
  ├── mp.info.6.2.b
  ├── mp.info.6.2.c
  ├── mp.info.6.2.d
  ├── mp.info.6.r1.1
  └── mp.info.6.r2.1

El catálogo no evalúa.

Configuration

Define los parámetros configurados por el cliente.

Ejemplo para mp.info.6:

P-01 frecuencia_backup_horas
P-02 margen_tolerancia_horas
P-03 retencion_dias
P-04 sistemas_monitorizados
P-05 periodo_max_sin_prueba_dias
P-06 directorio_backup_local
P-07 usuarios_procesos_autorizados
P-08 repositorio_offsite_activo
P-09 directorio_backup_offsite
P-10 herramienta_backup

Configuration no decide cumplimiento.

Data Source Engine

Obtiene datos técnicos desde Wazuh/OpenSearch.

No interpreta cumplimiento ENS.

Evidence Engine

Convierte eventos normalizados en evidencias ENS.

Ejemplo:

Evento Wazuh
  ↓
EV-01 CUMPLE

No calcula requisitos.

Requirement Evaluator

Calcula el estado de un requisito ENS.

Entrada:

RequirementDefinition
EvidenceResult[]
ApplicabilityResult

Salida:

RequirementResult
Control Evaluator

Calcula el estado de un control ENS.

Entrada:

RequirementResult[]

Salida:

ControlResult
Scoring Engine

Calcula puntuaciones.

No decide estados.

Summary Engine

Calcula métricas agregadas.

Ejemplo:

ControlSummary
RequirementSummary
EvidenceSummary

## Contratos definitivos del motor

### ENSState

```ts
type ENSState =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA';
ApplicabilityResult
interface ApplicabilityResult {
  targetId: string;
  applies: boolean;
  state: 'APLICA' | 'NO_APLICA';
  reason: string;
}
EvidenceResult
interface EvidenceResult {
  evidenceId: string;
  requirementIds: string[];
  state: ENSState;
  sourceStatus: 'FOUND' | 'MISSING' | 'ERROR' | 'NOT_APPLICABLE';
  lastSeen?: string;
  observations: string[];
}
RequirementResult
interface RequirementResult {
  requirementId: string;
  state: ENSState;
  applicable: boolean;
  score: number | null;
  evidences: EvidenceResult[];
  observations: string[];
}
ControlResult
interface ControlResult {
  controlId: string;
  state: ENSState;
  score: number | null;
  requirements: RequirementResult[];
  evaluatedAt: string;
}
SummaryResult
interface SummaryResult {
  controls: ControlSummary;
  requirements: RequirementSummary;
  evidences: EvidenceSummary;
}
Regla de oro

El flujo siempre debe ser:

ControlDefinition
  ↓
ApplicabilityResult
  ↓
EvidenceResult
  ↓
RequirementResult
  ↓
ControlResult
  ↓
SummaryResult
  ↓
DashboardModel


