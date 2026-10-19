import { ENSControlDefinition } from './types';

export const opMon3CatalogDefinition: ENSControlDefinition = {
  id: 'op.mon.3',
  name: 'Vigilancia',
  family: 'Marco operacional',
  category: 'Monitorización del sistema',
  dimension: 'Todas',
  // Measured on BOTH planes. The manager (000) measures central collection, correlation, exposure surface, alert channels and registers; each agent, the volume and drops of its own sources (wazuh-logcollector.state, wazuh-agentd.state), visible only on the machine that reads them.
  // The policy knows its row by the `agent.id` of its facts: on an agent's row it judges only that machine's P-01 sources, and the rest comes out NO_APLICA ("se mide en el manager").
  measurementPlanes: ['agent', 'manager'],
  description:
    'op.mon.3 es el control que mejor define la razón de ser de ENSFácil en categorías BÁSICA y MEDIA, y el que exige más honestidad en categoría ALTA.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  // The evidences of each requirement are the design's. R3.1 and R4 are documentary (no technical evidence: accredited by P-ATT) and their evidences EV-05 and EV-07 are reported without verdict, as is EV-13 (the incident register does not say which incidents revealed vulnerabilities). EV-10 and EV-11 reuse EV-04's facts. R7 is defined and required in no category.
  requirements: [
    {
      id: 'op.mon.3.1',
      title: 'Recolección automática de eventos de seguridad',
      description:
        'Se dispondrá de un sistema automático de recolección de eventos de seguridad.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02'],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.mon.3.r1.1',
      title: 'Correlación de eventos (R1)',
      description:
        'Se dispondrá de un sistema automático de recolección de eventos de seguridad que permita la correlación de los mismos.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIA y ALTA. En categoría BÁSICA no aplica.',
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-02'],
    },
    {
      id: 'op.mon.3.r2.1',
      title: 'Superficie de exposición: vulnerabilidades y configuración (R2)',
      description:
        'Se dispondrá de soluciones de vigilancia que permitan determinar la superficie de exposición con relación a vulnerabilidades y deficiencias de configuración.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIA y ALTA. En categoría BÁSICA no aplica.',
      },
      evidenceIds: ['EV-04'],
      parameterIds: ['P-03', 'P-11'],
    },
    {
      id: 'op.mon.3.r3.1',
      title: 'Amenazas avanzadas y comportamientos anómalos (R3)',
      description:
        'Se dispondrá de sistemas para detección de amenazas avanzadas y comportamientos anómalos.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      // Documentary: Wazuh has no baseline engine. Accredited by P-ATT; the P-04 baseline is reported in EV-05.
      evidenceIds: [],
      parameterIds: ['P-04'],
    },
    {
      id: 'op.mon.3.r3.2',
      title: 'APT por anomalías en el tráfico de red (R3)',
      description:
        'Se dispondrá de sistemas para la detección de amenazas persistentes avanzadas (Advanced Persistent Threat, APT) mediante la detección de anomalías significativas en el tráfico de la red.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-05'],
    },
    {
      id: 'op.mon.3.r4.1',
      title: 'Observatorios digitales (R4)',
      description:
        'Se dispondrá de observatorios digitales con fines de cibervigilancia dedicados a la detección y seguimiento de anomalías que pudieran representar indicadores de amenaza en contenidos digitales.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      // Documentary: the observatory is an external service. Accredited by P-ATT; the loaded indicator lists are reported in EV-07.
      evidenceIds: [],
      parameterIds: ['P-06'],
    },
    {
      id: 'op.mon.3.r5.1',
      title: 'Limitación y vigilancia de consultas (R5)',
      description:
        'Limitación de las consultas, monitorizando volumen y frecuencia.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-07'],
    },
    {
      id: 'op.mon.3.r5.2',
      title: 'Alerta en tiempo real a los administradores (R5)',
      description:
        'Alerta a los administradores de seguridad de comportamientos sospechosos en tiempo real.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      evidenceIds: ['EV-09'],
      parameterIds: ['P-08'],
    },
    {
      id: 'op.mon.3.r6.1',
      title: 'Inspección: verificación de configuración (R6)',
      description:
        'Verificación de configuración.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      evidenceIds: ['EV-10', 'EV-12'],
      parameterIds: ['P-03', 'P-09', 'P-10', 'P-11'],
    },
    {
      id: 'op.mon.3.r6.2',
      title: 'Inspección: análisis de vulnerabilidades (R6)',
      description:
        'Análisis de vulnerabilidades.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      evidenceIds: ['EV-11', 'EV-12'],
      parameterIds: ['P-03', 'P-09', 'P-10', 'P-11'],
    },
    {
      id: 'op.mon.3.r6.3',
      title: 'Inspección: pruebas de penetración (R6)',
      description:
        'Pruebas de penetración.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible solo en categoría ALTA. En BÁSICA y MEDIA no aplica.',
      },
      evidenceIds: ['EV-12'],
      parameterIds: ['P-09', 'P-10'],
    },
    {
      id: 'op.mon.3.r7.1',
      title: 'Interconexiones: control de flujos por metadatos (R7)',
      description:
        'Refuerzo R7 – Interconexiones: En las interconexiones que lo requieran se aplicarán controles en los flujos de intercambio de información a través del uso de metadatos.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ninguna categoría (Anexo II): no aplica.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
  ],
};
