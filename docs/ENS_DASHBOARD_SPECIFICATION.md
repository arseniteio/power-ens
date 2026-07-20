# ENS Dashboard Specification v1

## Objetivo

La Dashboard ENS debe ser una vista de presentación. No debe calcular cumplimiento, aplicabilidad, score, cobertura ni estados ENS.

Toda la información mostrada debe venir preparada desde:

```txt
ENS Engine
  ↓
Summary Engine
  ↓
Dashboard Adapter
  ↓
ENSDashboardModel
  ↓
React Dashboard
Regla principal

React solo renderiza.

No debe contener lógica de negocio ENS.

Tarjetas principales
Tarjeta	Modelo	Fuente
Índice global de cumplimiento ENS	ComplianceCardModel	ControlSummary
Requisitos evaluados	RequirementDistributionModel	RequirementSummary
Cobertura ENS	CoverageCardModel	EvidenceSummary
Hallazgos relevantes	FindingsCardModel	ControlResult[] / RequirementResult[]
Cumplimiento por familia	FamilyComplianceModel	ControlResult[]
Distribución por estado	RequirementDistributionModel	RequirementSummary
Tendencia de score	TrendChartModel	Eventos score_snapshot
Tabla de requisitos	RequirementTableModel	RequirementResult[]
Tabla de evidencias	EvidenceTableModel	EvidenceResult[]
Regla NO_APLICA

Los elementos NO_APLICA:

se muestran;
se cuentan;
no penalizan score;
deben tener motivo;
deben poder aparecer en tablas;
no deben confundirse con NO_EVALUABLE.
Regla NO_EVALUABLE

NO_EVALUABLE significa que el requisito aplica, pero no existe información suficiente para decidir.

Puede deberse a:

falta de parámetro;
falta de evidencia;
error de consulta;
fuente no configurada;
ausencia de eventos.
ComplianceCardModel

Representa la visión ejecutiva del cumplimiento ENS.

Debe consumir datos agregados de controles, no evidencias.

interface ComplianceCardModel {
  title: string;
  score: number;
  totalControls: number;
  cumple: number;
  parcial: number;
  noCumple: number;
  noEvaluable: number;
  noAplica: number;
  lastEvaluation: string;
}

Fuente:

ControlSummary

La tarjeta no calcula porcentajes. El porcentaje viene calculado desde el adapter.

CoverageCardModel

Representa la capacidad de demostrar cumplimiento mediante evidencias.

interface CoverageCardModel {
  title: string;
  percent: number;
  verified: number;
  pending: number;
  total: number;
}

Fuente:

EvidenceSummary

Cobertura no es cumplimiento. Cobertura indica evidencias disponibles frente a evidencias esperadas.
