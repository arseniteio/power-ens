ENS Dashboard Functional Architecture v1

## Objetivo

La Dashboard ENS se organiza en tres niveles de lectura:

1. Nivel ejecutivo
2. Nivel auditor
3. Nivel evidencial

Cada tarjeta debe responder una pregunta concreta y consumir un único tipo de resumen: controles, requisitos o evidencias.

---

## Nivel Ejecutivo

Pregunta principal:

```txt
¿Cómo está el cumplimiento ENS global?
Elemento	Fuente correcta	Motivo
Índice global ENS	ControlSummary	Resume controles ENS completos
Controles por estado	ControlSummary	Cuenta controles, no requisitos
Hallazgos relevantes	RequirementResult[] agrupado por control	El fallo real vive en el requisito
Cumplimiento por familia	ControlResult[]	Agrupa controles por familia ENS
Nivel Auditor

Pregunta principal:

¿Qué requisitos concretos presentan problemas?
Elemento	Fuente correcta	Motivo
Requisitos evaluados	RequirementSummary	Cuenta requisitos
Distribución por estado	RequirementSummary	Muestra CUMPLE/PARCIAL/NO_CUMPLE/NO_APLICA
Tabla de requisitos	RequirementResult[]	Detalle auditable
Tendencia de score	Histórico de ControlResult o snapshots	Evolución temporal
Nivel Evidencial

Pregunta principal:

¿Con qué evidencias puedo demostrar el cumplimiento?
Elemento	Fuente correcta	Motivo
Cobertura ENS	EvidenceSummary	Mide evidencias disponibles
Tabla de evidencias	EvidenceResult[]	Trazabilidad
Eventos Wazuh	Eventos normalizados	Evidencia técnica
Reglas relacionadas	Wazuh rule IDs / SCA IDs	Trazabilidad técnica
Regla de oro
ControlSummary    → visión ejecutiva
RequirementSummary → visión auditora
EvidenceSummary    → visión evidencial

React no decide qué contar.

El Dashboard Adapter decide qué objeto recibe cada tarjeta.

Decisión para el índice global

El índice global ENS debe usar controlSummary.

No debe usar requirementSummary.

Motivo:

Un control ENS puede tener muchos requisitos.
Si contamos requisitos como controles, inflamos o distorsionamos el cumplimiento global.
Decisión para hallazgos relevantes

Los hallazgos relevantes deben mostrarse por requisito, pero agrupados por control.

Ejemplo:

Control: mp.info.6 - Copias de seguridad
  Hallazgo: mp.info.6.r1.1 - Prueba de restauración no evidenciada
  Estado: NO_CUMPLE
  Impacto: MEDIO

Motivo:

El control da contexto ejecutivo.
El requisito da precisión auditora.
Decisión para cobertura ENS

Cobertura no es cumplimiento.

Cobertura mide si existen evidencias suficientes para justificar los estados.

Cumplimiento → controles/requisitos
Cobertura    → evidencias

Cuando lo tengas, seguimos con el siguiente cambio real: crear el **CoverageCardModel** usando `evidenceSummary`.
