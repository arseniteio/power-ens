import { ENSComplianceState } from '../compliance-state/types';
import { ENSNormalizedEvent } from '../data-source/types';
// `import type`, NO un import normal. `ENSComplianceTimelinePoint` es SOLO un
// tipo, pero importarlo como valor obliga a cargar `compliance-timeline` en
// tiempo de ejecución, y ese módulo importa el MOTOR entero. Resultado: este
// adaptador arrastraba `ens-engine` a su grafo por una anotación de tipo, y
// por ahí vuelve el ciclo del TDZ que deja el dashboard en blanco.
//
// Con `import type` la línea desaparece al compilar y no queda dependencia.
import type { ENSComplianceTimelinePoint } from '../timeline/compliance-timeline';
import {
  buildComplianceCardModel,
  buildCoverageCardModel,
  buildFamilyComplianceModel,
  buildFindingsCardModel,
  buildRequirementFindingsModel,
  buildLevelSummaryModel,
  buildImpactEventsModel,
  buildEvolutionModel,
  buildRequirementsSummaryModel,
} from './presenters';

// La serie diaria llega YA CALCULADA, no se calcula aquí: cada punto es una
// pasada completa del motor y este adaptador se reconstruye en cada refresco
// del panel. Quien la calcula la memoriza contra los eventos
// (`ens-dashboard-main.tsx`), que es lo que impide siete evaluaciones cada
// quince segundos sin que haya cambiado nada.
export const buildENSDashboardModel = (
  complianceState: ENSComplianceState,
  events: ENSNormalizedEvent[] = [],
  timeline: ENSComplianceTimelinePoint[] = []
) => ({

  compliance: buildComplianceCardModel(complianceState),
  coverage: buildCoverageCardModel(complianceState),
  findings: buildFindingsCardModel(complianceState),
  familyCompliance: buildFamilyComplianceModel(complianceState),
  requirementFindings: buildRequirementFindingsModel(complianceState),
  levelSummary: buildLevelSummaryModel(complianceState),
  impactEvents: buildImpactEventsModel(events),
  evolution: buildEvolutionModel(
    complianceState,
    timeline
  ),
  requirementsSummary: buildRequirementsSummaryModel(complianceState),
});
