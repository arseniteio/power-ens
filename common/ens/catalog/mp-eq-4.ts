import { ENSControlDefinition } from './types';

export const mpEq4CatalogDefinition: ENSControlDefinition = {
  id: 'mp.eq.4',
  name: 'Otros dispositivos conectados a la red',
  family: 'Medidas de protección',
  category: 'Protección de los equipos',
  dimension: 'Confidencialidad (ÚNICA dimensión)',
  // Governed by the dimension LEVEL, not the system category: evaluated with `confidentialityLevel` of the global configuration and, if not declared, with the ENS level.
  levelDimension: 'C',
  annexSection: '5.3.4',
  source: { template: 'PowerENS_Plantilla_mp.eq.4', version: '2.0', date: '2026-10-15' },
  description:
    'mp.eq.4 es el control de los dispositivos que no llevan agente: multifunción, multimedia, IoT y BYOD.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.eq.4.1',
      title: 'Configuración segura y flujos de entrada y salida controlados',
      description:
        'Los dispositivos presentes en el sistema deberán contar con una configuración de seguridad adecuada de manera que se garantice el control del flujo definido de entrada y salida de la información.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-07'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-06'],
    },
    {
      id: 'mp.eq.4.2',
      title: 'Borrado del almacenamiento de los dispositivos de red',
      description:
        'Los dispositivos presentes en la red que dispongan de algún tipo de almacenamiento temporal o permanente de información proporcionarán la funcionalidad necesaria para eliminar información de soportes de información. (Ver [mp.si.5]).',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-04', 'EV-08'],
      parameterIds: ['P-05'],
    },
    {
      id: 'mp.eq.4.r1.1',
      title: 'Productos o servicios conformes con op.pl.5',
      description:
        'Se usarán, cuando sea posible, productos o servicios que cumplan lo establecido en [op.pl.5].',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: ['P-07'],
    },
    {
      id: 'mp.eq.4.r2.1',
      title: 'Control de los dispositivos conectados a la red',
      description:
        'Refuerzo R2 – Control de dispositivos conectados a la red: Se dispondrá de soluciones que permitan visualizar los dispositivos presentes en la red, controlar su conexión/desconexión a la misma y verificar su configuración de seguridad.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ninguna categoría (Anexo II): no aplica.',
      },
      evidenceIds: ['EV-01', 'EV-06'],
      parameterIds: ['P-03', 'P-08'],
    },
  ],
};
