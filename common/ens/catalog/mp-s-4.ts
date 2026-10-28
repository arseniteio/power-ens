import { ENSControlDefinition } from './types';

export const mpS4CatalogDefinition: ENSControlDefinition = {
  id: 'mp.s.4',
  name: 'Protección frente a la denegación de servicio',
  family: 'Medidas de protección',
  category: 'Protección de los servicios',
  dimension: 'Disponibilidad (ÚNICA dimensión)',
  // Governed by the dimension LEVEL, not the system category: evaluated with `availabilityLevel` of the global configuration and, if not declared, with the ENS level.
  levelDimension: 'D',
  annexSection: '5.8.4',
  source: { template: 'PowerENS_Plantilla_mp.s.4', version: '2.0', date: '2026-10-15' },
  description:
    'mp.s.4 pide capacidad holgada y tecnologías de prevención, y en nivel ALTO detección y procedimientos de reacción con el proveedor.',
  levels: ['MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.s.4.1',
      title: 'Capacidad suficiente y con holgura para la carga prevista',
      description:
        'Se planificará y dotará al sistema de capacidad suficiente para atender con holgura a la carga prevista.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-04', 'EV-10'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'mp.s.4.2',
      title: 'Tecnologías de prevención de ataques conocidos',
      description:
        'Se desplegarán tecnologías para prevenir los ataques conocidos.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02', 'EV-04', 'EV-10'],
      parameterIds: ['P-01', 'P-03'],
    },
    {
      id: 'mp.s.4.r1.1',
      title: 'Detección y tratamiento de la denegación de servicio',
      description:
        'Se establecerá un sistema de detección y tratamiento de ataques de denegación de servicio (DoS y DDoS).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-03', 'EV-04', 'EV-07', 'EV-10'],
      parameterIds: ['P-04', 'P-07'],
    },
    {
      id: 'mp.s.4.r1.2',
      title: 'Procedimientos de reacción con el proveedor de comunicaciones',
      description:
        'Se establecerán procedimientos de reacción a los ataques, incluyendo la comunicación con el proveedor de comunicaciones.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-05', 'EV-06'],
      parameterIds: ['P-05', 'P-06'],
    },
    {
      id: 'mp.s.4.r2.1',
      title: 'Detección y bloqueo de ataques lanzados desde las propias instalaciones',
      description:
        'Refuerzo R2 – Ataques propios: Se detectará y se evitará el lanzamiento de ataques desde las propias instalaciones perjudicando a terceros.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ninguna categoría (Anexo II): no aplica.',
      },
      evidenceIds: ['EV-08', 'EV-09'],
      parameterIds: ['P-08'],
    },
  ],
};
