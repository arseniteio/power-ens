import { ENSControlDefinition } from './types';

export const opMon1CatalogDefinition: ENSControlDefinition = {
  id: 'op.mon.1',
  name: 'Detección de intrusión',
  family: 'Marco operacional',
  category: 'Monitorización del sistema',
  dimension: 'Todas',
  // Measured ONLY on the manager: the rule engine, the agent base and the alerts are in the central system, and facts speak about other systems through `agente`. Result is the manager row's (000).
  measurementPlanes: ['manager'],
  description:
    'op.mon.1 es uno de los controles que Wazuh cubre por naturaleza: es un HIDS con motor de reglas, de modo que el requisito base y R1 quedan satisfechos con el propio despliegue.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  annexSection: '4.7.1',
  source: { template: 'PowerENS_Plantilla_op.mon.1', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  // The evidences of each requirement are the design's, not the template's: op.mon.1.1 is decided with EV-01 to EV-05 and R1 with EV-01 and EV-08. R2 is documentary (no technical evidence: accredited by P-05 or P-ATT) and EV-06 stays as report data with no requirement judging it. R3 is required in no category.
  requirements: [
    {
      id: 'op.mon.1.1',
      title: 'Herramientas de detección o prevención de intrusiones',
      description:
        'Se dispondrá de herramientas de detección o prevención de intrusiones.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05'],
      parameterIds: ['P-01', 'P-02', 'P-04', 'P-09', 'P-10'],
    },
    {
      id: 'op.mon.1.r1.1',
      title: 'Detección basada en reglas (R1)',
      description:
        'El sistema dispondrá de herramientas de detección o prevención de intrusiones basadas en reglas.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIA y ALTA. En categoría BÁSICA no aplica.',
      },
      evidenceIds: ['EV-01', 'EV-08'],
      parameterIds: ['P-03', 'P-06', 'P-08'],
    },
    {
      id: 'op.mon.1.r2.1',
      title: 'Procedimientos de respuesta a las alertas (R2)',
      description:
        'Existirán procedimientos de respuesta a las alertas generadas por el sistema de detección o prevención de intrusiones.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      // Documentary: accredited by the P-05 procedures table (the policy marks the decision `attested`) or, failing that, a P-ATT attestation.
      evidenceIds: [],
      parameterIds: ['P-05'],
    },
    {
      id: 'op.mon.1.r3.1',
      title: 'Acciones predeterminadas automáticas (R3)',
      description:
        'Refuerzo R3 – Acciones predeterminadas: El sistema ejecutará automáticamente acciones predeterminadas de respuesta a las alertas generadas. Esto puede incluir la finalización del proceso que está ocasionando la alerta, la inhabilitación de determinados servicios, la desconexión de usuarios y el bloqueo de cuentas.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ninguna categoría (Anexo II): no aplica. Lo que hay configurado y ejecutado se informa en EV-07.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-07'],
    },
  ],
};
