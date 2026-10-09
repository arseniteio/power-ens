import { ENSControlDefinition } from './types';

export const opMon3CatalogDefinition: ENSControlDefinition = {
  id: 'op.mon.3',
  name: 'Vigilancia',
  family: 'Marco operacional',
  category: 'Monitorización del sistema',
  dimension: 'Todas',
  // Se mide en los DOS planos. El manager (000) mide la recolección central,
  // la correlación, la superficie de exposición, los canales de alerta y los
  // registros; cada agente, el volumen y los descartes de sus propias fuentes
  // (wazuh-logcollector.state, wazuh-agentd.state), que solo se ven en la
  // máquina que las lee. La policy sabe en qué fila está por el `agent.id` de
  // sus hechos: en la de un agente solo juzga las fuentes de P-01 de esa
  // máquina, y lo demás sale NO_APLICA («se mide en el manager»).
  measurementPlanes: ['agent', 'manager'],
  description:
    'op.mon.3 es el control que mejor define la razón de ser de ENSFácil en categorías BÁSICA y MEDIA, y el que exige más honestidad en categoría ALTA.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  // Las evidencias de cada requisito son las del diseño (spec 2026-10-09
  // §3.3). R3.1 y R4 son documentales (sin evidencia técnica: los acredita
  // P-ATT) y sus evidencias EV-05 y EV-07 se informan sin veredicto, como
  // EV-13 (el registro de incidentes no dice qué incidentes revelaron
  // vulnerabilidades). EV-10 y EV-11 reutilizan los hechos de EV-04. R7 se
  // define y no se exige en ninguna categoría.
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
      // Documental: Wazuh no trae motor de líneas base. Lo acredita P-ATT; la
      // línea base de P-04 se informa en EV-05.
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
      // Documental: el observatorio es un servicio externo. Lo acredita P-ATT;
      // las listas de indicadores cargadas se informan en EV-07.
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
