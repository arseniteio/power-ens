import { ENSComplianceState } from '../../compliance-state/types';
import { RequirementFindingsModel, RequirementFindingRowModel } from '../models/requirement-findings.model';
import { scoreByStatus } from '../../evaluation/utils/score';

const familyNames: Record<string, string> = {
  'OP.ACC': 'Control de acceso',
  'OP.EXP': 'Explotación',
  'OP.MON': 'Monitorización del sistema',
  'MP.INFO': 'Protección de la información',
  'MP.S': 'Protección de los servicios',
  'MP.COM': 'Protección de las comunicaciones',
  'MP.SW': 'Protección de las aplicaciones',
  'MP.EQ': 'Protección del equipo',
};

const getFamily = (requirementId: string): string =>
  String(requirementId || '').split('.').slice(0, 2).join('.').toUpperCase() ||
  'ENS';

export const buildRequirementFindingsModel = (
  complianceState: ENSComplianceState
): RequirementFindingsModel => {
  const rows: RequirementFindingRowModel[] = complianceState.results
    .flatMap(result =>
      result.requirements
        .filter(
          requirement =>
            requirement.status === 'NO_CUMPLE' ||
            requirement.status === 'PARCIAL' ||
            requirement.status === 'NO_EVALUABLE'
        )
        .map(requirement => {
          const family = getFamily(requirement.id);

          return {
            requirementId: requirement.id,
            title: requirement.title || requirement.id,
            family,
            familyLabel: familyNames[family] || family || 'ENS',
            status: requirement.status,
            score: scoreByStatus(requirement.status),
          };
        })
    )
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  return {
    title: 'REQUISITOS CON MAYOR RIESGO O SIN EVIDENCIA',
    rows,
    emptyMessage:
      'Todos los requisitos ENS evaluados se encuentran conformes o no aplicables.',
  };
};
