import { ENSControlDefinition } from './types';

export const opExp7CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.7',
  name: 'Gestión de incidentes',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'op.exp.7 es el control donde Wazuh y el proceso del cliente tienen que encajar: Wazuh detecta y el proceso clasifica, escala, resuelve y notifica. Se mide en el manager, cruzando sus alertas con el registro de incidentes que mantiene la organización.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.7.1',
      title: 'Proceso integral de gestión de incidentes',
      description:
        'Se dispondrá de un proceso integral para hacer frente a los incidentes que puedan tener un impacto en la seguridad del sistema, que incluya el informe de eventos de seguridad y debilidades, detallando los criterios de clasificación y el escalado de la notificación.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-04'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-12'],
    },
    {
      id: 'op.exp.7.2',
      title: 'Incidentes con datos personales según el RGPD',
      description:
        'La gestión de incidentes que afecten a datos personales tendrá en cuenta lo dispuesto en el Reglamento General de Protección de Datos; la Ley Orgánica 3/2018, de 5 de diciembre, en especial su disposición adicional primera, así como el resto de normativa de aplicación, sin perjuicio de los requisitos establecidos en este real decreto.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-07'],
    },
    {
      id: 'op.exp.7.r1.1',
      title: 'Notificación al CCN-CERT por ventanilla única (R1)',
      description:
        'Se dispondrá de soluciones de ventanilla única para la notificación de incidentes al CCN-CERT, que permita la distribución de notificaciones a las diferentes entidades de manera federada, utilizando para ello dependencias administrativas jerárquicas.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-06', 'P-01', 'P-02'],
    },
    {
      id: 'op.exp.7.r2.1',
      title: 'Medidas urgentes y protección de evidencias (R2)',
      description:
        'Implantación de medidas urgentes, incluyendo la detención de servicios, el aislamiento del sistema afectado, la recogida de evidencias y protección de los registros, según convenga al caso.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-05', 'EV-06'],
      parameterIds: ['P-08', 'P-09'],
    },
    {
      id: 'op.exp.7.r2.2',
      title: 'Recursos para investigar y resolver (R2)',
      description:
        'Asignación de recursos para investigar las causas, analizar las consecuencias y resolver el incidente.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-05', 'P-01'],
    },
    {
      id: 'op.exp.7.r2.3',
      title: 'Información a los responsables afectados (R2)',
      description:
        'Informar del incidente a los responsables de la información y servicios afectados y de las actuaciones llevadas a cabo para su resolución.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-04'],
      parameterIds: ['P-02', 'P-04'],
    },
    {
      id: 'op.exp.7.r2.4',
      title: 'Medidas para que no se repita (R2)',
      description:
        'Medidas para: a) Prevenir que se repita el incidente. b) Incluir en los procedimientos de usuario la identificación y forma de tratar el incidente. c) Actualizar, extender, mejorar u optimizar los procedimientos de resolución de incidentes.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-12'],
      parameterIds: [],
    },
    {
      id: 'op.exp.7.r3.1',
      title: 'Reconfiguración dinámica ante ataques (R3)',
      description:
        'La reconfiguración dinámica incluye, por ejemplo, cambios en las reglas de los enrutadores (routers), listas de control de acceso, parámetros del sistema de detección / prevención de intrusiones y reglas en los cortafuegos y puertas de enlace, aislamiento de elementos críticos y aislamiento de las copias de seguridad.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-09'],
      parameterIds: ['P-09', 'P-10'],
    },
    {
      id: 'op.exp.7.r3.2',
      title: 'Adaptación a los avisos del CCN-CERT (R3)',
      description:
        'El organismo adaptará los procedimientos de reconfiguración dinámica reaccionando a los anuncios recibidos del CCN-CERT relativos a ciberamenazas sofisticadas y campañas de ataques.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-10'],
      parameterIds: ['P-11'],
    },
    {
      id: 'op.exp.7.r4.1',
      title: 'Prevención y respuesta automática (R4)',
      description:
        'Refuerzo R4 – Prevención y Respuesta Automática: Se dispondrá de herramientas que automaticen el proceso de prevención y respuesta mediante la detección e identificación de anomalías, la segmentación dinámica de la red para reducir la superficie de ataque, el aislamiento de dispositivos críticos, etc.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'El ENS define este refuerzo pero no lo exige en ninguna categoría: se muestra como NO_APLICA en los tres niveles.',
      },
      evidenceIds: ['EV-11'],
      parameterIds: ['P-09'],
    },
  ],
};
