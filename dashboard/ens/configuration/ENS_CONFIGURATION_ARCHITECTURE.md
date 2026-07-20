# ENSFácil Configuration Architecture

## Objetivo

El módulo Configuration define cómo se configuran, versionan, auditan y activan los parámetros utilizados por el motor ENSFácil dentro de Wazuh Dashboard 4.14.5.

Configuration no debe calcular cumplimiento. Su responsabilidad es proporcionar al ENS Engine una configuración válida, trazable y persistente.

## Principio principal

La configuración es una fuente de verdad del motor ENS.

Ninguna pantalla debe interpretar parámetros por su cuenta.

Flujo objetivo:

OpenSearch / Wazuh Alerts  
→ normalizeWazuhAlerts()  
→ ENS Engine  
→ Configuration Runtime  
→ Policy Runtime  
→ Evaluation Engine  
→ ENSComplianceResult  
→ Dashboard / Controls / Traceability / Evidences / Reports

## Modelo principal

La entidad principal es:

ENSConfigurationVersion

Debe representar una versión completa de configuración ENS.

Campos principales:

- id
- clientId
- version
- status
- createdAt
- updatedAt
- createdBy
- updatedBy
- changeReason
- global
- scope
- controls
- auditTrail

## Alcance

La configuración debe soportar tres modos:

- global
- agent
- group

Modelo:

```ts
export type ENSConfigurationScopeMode = 'global' | 'agent' | 'group';

export interface ENSConfigurationScope {
  mode: ENSConfigurationScopeMode;
  agentIds: string[];
  groupIds: string[];
}

Configuración global

La configuración global define el contexto ENS:

cliente
organización
nivel ENS
versión ENS
alcance funcional
periodo de evaluación
zona horaria
idioma de informe
política activa
Configuración por control

Cada control ENS debe tener su propia configuración:

controlId
controlName
family
enabled
applicableLevels
parameters

Ejemplo:

mp.info.6
mp.info.7
op.acc.*
op.exp.*
mp.si.*
Parámetros

Los parámetros no son simples campos de formulario.

Cada parámetro debe incluir:

id
controlId
name
label
description
levels
requirements
type
required
defaultValue
value
wazuhUsage
ensfacilUsage
evidenceIds
ruleIds
ifNotConfigured
status

Esto permite que el motor ENS conozca la relación entre configuración, evidencias, requisitos y reglas.

Ciclo de vida

Estados actuales:

DRAFT
CONFIGURED
INCOMPLETE
INVALID

Estados futuros recomendados:

ACTIVE
ARCHIVED

Regla:

Solo una configuración debe estar activa por cliente y alcance.

Versionado

Cada cambio relevante debe crear o actualizar una versión trazable.

La configuración activa debe indicar:

versión
fecha de activación
usuario
motivo del cambio
controles afectados
Auditoría

Cada cambio debe registrarse en auditTrail.

Ejemplo:

{
  action: 'UPDATED',
  user: 'current-user',
  date: '2026-07-09T00:00:00.000Z',
  summary: 'Configuración actualizada para mp.info.6.'
}
Repository

Configuration no debe depender directamente de memoria, React ni OpenSearch.

Debe acceder mediante:

Configuration State Service
→ ENSConfigurationRepository

El Repository será la única pieza sustituible.

Implementación actual:

Memory Repository

Implementación futura:

OpenSearch Repository

Persistencia futura

Índice recomendado:

ensfacil-configurations

Un documento por versión de configuración.

Ventajas:

histórico
auditoría
rollback
exportación
comparación de versiones
trazabilidad de evaluaciones
Integración con ENS Engine

El ENS Engine debe obtener siempre la configuración activa mediante:

getActiveControlConfiguration(controlId)

El motor no debe conocer la UI.

La UI no debe interpretar reglas de cumplimiento.

Integración con Policy Runtime

Policy Runtime debe recibir contexto ya construido:

control
configuration
level
events
evidences

Configuration no decide cumplimiento.

Solo entrega valores.

Regla de arquitectura

Permitido en Configuration:

editar parámetros
validar parámetros
guardar versiones
mostrar estado de configuración
registrar auditoría

No permitido en Configuration:

calcular score
decidir CUMPLE / NO_CUMPLE
interpretar eventos Wazuh
generar informes de cumplimiento
duplicar reglas del ENS Engine
Estado actual

Ya implementado:

modelo de dominio
registry de controles
parámetros de mp.info.6
Configuration State Service
Repository intermedio
clientId
scope global / agent / group

Pendiente:

persistencia real
histórico
selector de versiones
activación de configuración
rollback
integración con usuario real
configuración por agente/grupo
Estrategia de evolución

Fase 1: Repository intermedio en memoria
Fase 2: Modelo con clientId y scope
Fase 3: Documento de arquitectura
Fase 4: Repository persistente
Fase 5: Histórico y auditoría
Fase 6: Configuración por agente/grupo
Fase 7: Soporte multi-control ENS completo

Decisión final

Configuration debe evolucionar como infraestructura central del framework ENSFácil.

No debe ser una pantalla aislada.

Debe ser el punto desde el que se alimenta el motor ENS para todos los controles actuales y futuros.
