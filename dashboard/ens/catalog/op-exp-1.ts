import { ENSControlDefinition } from './types';

export const opExp1CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.1',
  name: 'Inventario de activos',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'op.exp.1 exige un inventario actualizado de todos los elementos del sistema, con su naturaleza y su responsable. El agente toma la foto técnica de cada activo (hardware, software, servicios, vecinos de red, conexión con el manager) y el motor la contrasta con lo que la organización declara: responsables, activos sin agente, plazos. Aplica por CATEGORÍA del sistema (BÁSICA, MEDIA y ALTA, que el producto selecciona con el nivel BAJO, MEDIO y ALTO) y solo puntúa el requisito base: ningún refuerzo es obligatorio.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.1.1',
      title: 'Inventario actualizado con naturaleza y responsable',
      description:
        'Se mantendrá un inventario actualizado de todos los elementos del sistema, detallando su naturaleza e identificando a su responsable; es decir, la persona que toma las decisiones relativas al mismo.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-08'],
    },
    {
      id: 'op.exp.1.r1.1',
      title: 'Etiquetado físico del equipamiento (R1)',
      description:
        'Refuerzo R1 – Inventario de etiquetado: El etiquetado del equipamiento y del cableado formará parte del inventario.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Refuerzo no exigible en ninguna categoría del sistema (BÁSICA, MEDIA ni ALTA): el Anexo II solo exige op.exp.1.1. Sale NO_APLICA y no cuenta en el denominador.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.exp.1.r2.1',
      title: 'Visualización continua del estado de la red (R2)',
      description:
        'Refuerzo R2 – Identificación periódica de activos: Se dispondrá de herramientas que permitan visualizar de forma continua el estado de todos los equipos en la red, en particular, los servidores y los dispositivos de red y de comunicaciones.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Refuerzo no exigible en ninguna categoría del sistema (BÁSICA, MEDIA ni ALTA): el Anexo II solo exige op.exp.1.1. Sale NO_APLICA y no cuenta en el denominador.',
      },
      evidenceIds: ['EV-04'],
      parameterIds: [],
    },
    {
      id: 'op.exp.1.r3.1',
      title: 'Categorización de activos críticos (R3)',
      description:
        'Refuerzo R3 – Identificación de activos críticos: Se dispondrá de herramientas que permitan categorizar los activos críticos por contexto de la organización y riesgos de seguridad.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Refuerzo no exigible en ninguna categoría del sistema (BÁSICA, MEDIA ni ALTA): el Anexo II solo exige op.exp.1.1. Sale NO_APLICA y no cuenta en el denominador.',
      },
      evidenceIds: [],
      parameterIds: ['P-06'],
    },
    {
      id: 'op.exp.1.r4.1',
      title: 'Relación de componentes software de terceros (R4)',
      description:
        'Refuerzo R4 – Lista de componentes software: Se mantendrá actualizada una relación formal de los componentes software de terceros empleados en el despliegue del sistema. Esta lista incluirá librerías software y los servicios requeridos para su despliegue (plataforma o entorno operacional). El contenido de la lista de componentes será equivalente a lo requerido en [mp.sw.1.r5].',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Refuerzo no exigible en ninguna categoría del sistema (BÁSICA, MEDIA ni ALTA): el Anexo II solo exige op.exp.1.1. Sale NO_APLICA y no cuenta en el denominador.',
      },
      evidenceIds: ['EV-02'],
      parameterIds: [],
    },
  ],
};
