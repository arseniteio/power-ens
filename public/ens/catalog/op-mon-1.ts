import { ENSControlDefinition } from './types';

export const opMon1CatalogDefinition: ENSControlDefinition = {
  id: 'op.mon.1',
  name: 'Detección de intrusión',
  family: 'Marco operacional',
  category: 'Monitorización del sistema',
  dimension: 'Todas',
  // Se mide SOLO en el manager: el motor de reglas, la base de agentes y las
  // alertas están en el sistema central, y los hechos hablan de los demás
  // sistemas por su campo `agente`. Su resultado es el de la fila del manager
  // (000).
  measurementPlanes: ['manager'],
  description:
    'op.mon.1 es uno de los controles que Wazuh cubre por naturaleza: es un HIDS con motor de reglas, de modo que el requisito base y R1 quedan satisfechos con el propio despliegue.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  // Las evidencias de cada requisito son las del diseño (spec 2026-10-09 §1.3),
  // no las que la plantilla asocia: op.mon.1.1 se decide con EV-01 a EV-05 y R1
  // con EV-01 y EV-08. R2 es documental (sin evidencia técnica: lo acredita
  // P-05 o P-ATT), y EV-06 queda como dato del informe, sin requisito que la
  // juzgue. R3 no se exige en ninguna categoría.
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
      // Documental: lo acredita la tabla de procedimientos de P-05 (la policy
      // marca la decisión `attested`) o, si no, una atestación de P-ATT.
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
