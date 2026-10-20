// The evidences of a control without collector (`DRAFT`, see `catalog/support/measurement-plan.ts`): copied from the
// catalog, without reading any fact, all NO_APLICA with the source each one needs. No instrument exists, so there
// is nothing to resolve and nothing that could fail.
import { ENSEvidenceCatalog } from './catalog';
import type { ENSEvidenceResolved } from './types';
import { describeRequiredSource } from '../../catalog/support/measurement-plan';

export const buildPendingMeasurementEvidences = (controlId: string): ENSEvidenceResolved[] =>
  ENSEvidenceCatalog.filter(evidence => evidence.controlId === controlId).map(evidence => {
    const source = describeRequiredSource(controlId, evidence.id);

    return {
      id: evidence.id,
      controlId: evidence.controlId,
      title: evidence.title,
      description: evidence.description,
      status: 'NO_APLICA',
      requirements: evidence.requirements,
      levels: evidence.levels,
      category: evidence.category,
      criticality: evidence.criticality,
      sourceTypes: evidence.sourceTypes,
      expectedEventTypes: evidence.expectedEventTypes,
      relatedRules: evidence.relatedRules,
      auditQuestion: evidence.auditQuestion,
      qualityRequirements: evidence.qualityRequirements,
      observations: [
        `Sin medición todavía: ningún recolector emite esta evidencia.${source ? ` Fuente necesaria: ${source}.` : ''}`,
      ],
    };
  });
