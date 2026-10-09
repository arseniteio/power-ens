import { ENSControlDefinition } from './types';

export const opMon2CatalogDefinition: ENSControlDefinition = {
  id: 'op.mon.2',
  name: 'Sistema de métricas',
  family: 'Marco operacional',
  category: 'Monitorización del sistema',
  dimension: 'Todas',
  description:
    'op.mon.2 pide medir tres cosas: el grado de implantación de las medidas de seguridad, el comportamiento del sistema de gestión de incidentes y los recursos consumidos por el sistema de seguridad.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.mon.2.1',
      title: 'Datos del grado de implantación y del informe del art. 32',
      description:
        'Atendiendo a la categoría de seguridad del sistema, se recopilarán los datos necesarios para conocer el grado de implantación de las medidas de seguridad que resulten aplicables y, en su caso, para proveer el informe anual requerido por el artículo 32.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02', 'EV-04'],
      parameterIds: ['P-01', 'P-02', 'P-05', 'P-06'],
    },
    {
      id: 'op.mon.2.r1.1',
      title: 'Datos del comportamiento de la gestión de incidentes (R1)',
      description:
        'Se recopilarán los datos precisos que posibiliten evaluar el comportamiento del sistema de gestión de incidentes, de acuerdo con la Instrucción Técnica de Seguridad de Notificación de Incidentes de Seguridad y con la correspondiente guía CCN-STIC.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-02', 'P-03'],
    },
    {
      id: 'op.mon.2.r2.1',
      title: 'Datos de eficiencia: horas y presupuesto (R2)',
      description:
        'Se recopilarán los datos precisos para conocer la eficiencia del sistema de seguridad, en relación con los recursos consumidos, en términos de horas y presupuesto.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-02', 'P-04', 'P-05'],
    },
  ],
};
