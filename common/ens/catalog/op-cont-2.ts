import { ENSControlDefinition } from './types';

export const opCont2CatalogDefinition: ENSControlDefinition = {
  id: 'op.cont.2',
  name: 'Plan de continuidad',
  family: 'Marco operacional',
  category: 'Continuidad del servicio',
  dimension: 'Disponibilidad (ÚNICA dimensión)',
  // Annex II applies op.cont.2 by the Availability LEVEL, not the system category, and only at ALTO: evaluated with `availabilityLevel` of the global configuration and, if not declared, the ENS level. A MEDIA-category system cannot have D at ALTO, so there it is always NO_APLICA.
  levelDimension: 'D',
  // Belongs to the ORGANISATION, not a machine: the plan, its functions, contracts and training are declared on the Configuration screen and the policy judges their validity (`policies/op-cont-2.policy.ts`). Evaluated once, on the manager row (000).
  // No runbook or rules: no machine emits facts for it (`tests/controls-without-runbook.json`).
  measurementPlanes: ['manager'],
  description:
    'op.cont.2 es un control de planificación y su acreditación es documental: existe el plan, identifica funciones, contempla medios alternativos contratados, se ha formado a las personas y está integrado con los demás planes de la organización.',
  levels: ['ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  // The evidences of each requirement are the design's, not the template's. Each requirement is a plan content, so all five rest on EV-01 (the plan and its validity) besides their own declaration: 2.3 on EV-04 (contracts), 2.4 on EV-06 (training); 2.1, 2.2 and 2.5 judge P-03, P-02 and P-06 in the requirement decision.
  // The template gives 2.5 no evidence: EV-01 is assigned. EV-02, EV-05, EV-07 and EV-08 stay as report data with no requirement judging them, and EV-03 is R2, which is not required.
  requirements: [
    {
      id: 'op.cont.2.1',
      title: 'Funciones, responsabilidades y actividades',
      description:
        'Se identificarán funciones, responsabilidades y actividades a realizar.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-01', 'P-03', 'P-08'],
    },
    {
      id: 'op.cont.2.2',
      title: 'Previsión para coordinar los medios alternativos',
      description:
        'Existirá una previsión para coordinar la entrada en servicio de los medios alternativos de forma que se garantice poder seguir prestando los servicios esenciales de la organización.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-01', 'P-02', 'P-08'],
    },
    {
      id: 'op.cont.2.3',
      title: 'Medios alternativos en acuerdos o contratos',
      description:
        'Todos los medios alternativos estarán planificados y materializados en acuerdos o contratos con los proveedores correspondientes.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-04'],
      parameterIds: ['P-01', 'P-04', 'P-08'],
    },
    {
      id: 'op.cont.2.4',
      title: 'Formación de las personas afectadas',
      description:
        'Las personas afectadas por el plan recibirán formación específica relativa a su papel en dicho plan.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-06'],
      parameterIds: ['P-01', 'P-03', 'P-05', 'P-08'],
    },
    {
      id: 'op.cont.2.5',
      title: 'Integración con los demás planes de continuidad',
      description:
        'El plan de continuidad será parte integral y armónica de los planes de continuidad de la organización en otras materias ajenas a la seguridad.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-01', 'P-06', 'P-08'],
    },
    {
      id: 'op.cont.2.r1.1',
      title: 'Plan de emergencia y contingencia (R1)',
      description:
        'Refuerzo R1 – Plan de emergencia y contingencia: Cuando se determine la necesidad de continuidad de los sistemas, deberá existir un plan de emergencia y contingencia en consonancia. En función del análisis de Impacto, se determinarán los aspectos a cubrir.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ningún nivel de Disponibilidad (Anexo II): no aplica.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.cont.2.r2.1',
      title: 'Comprobación de integridad tras una caída (R2)',
      description:
        'Refuerzo R2 – Comprobación de integridad: Ante una caída o discontinuidad del sistema, se deberá comprobar la integridad del sistema operativo, del firmware y de los ficheros de configuración.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ningún nivel de Disponibilidad (Anexo II): no aplica.',
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-07'],
    },
  ],
};
