import { ENSControlDefinition } from './types';

export const mpEq3CatalogDefinition: ENSControlDefinition = {
  id: 'mp.eq.3',
  name: 'Protección de dispositivos portátiles',
  family: 'Medidas de protección',
  category: 'Protección de los equipos',
  dimension: 'Todas',
  annexSection: '5.3.3',
  source: { template: 'PowerENS_Plantilla_mp.eq.3', version: '2.0', date: '2026-10-15' },
  description:
    'mp.eq.3 protege los equipos que salen de las instalaciones.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.eq.3.1',
      title: 'Inventario de portátiles con responsable y control de custodia',
      description:
        'Se llevará un inventario de dispositivos portátiles junto con una identificación de la persona responsable de cada uno de ellos y un control regular de que está positivamente bajo su control.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'mp.eq.3.2',
      title: 'Procedimiento de aviso de pérdidas o sustracciones',
      description:
        'Se establecerá un procedimiento operativo de seguridad para informar al servicio de gestión de incidentes de pérdidas o sustracciones.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-03', 'P-08'],
    },
    {
      id: 'mp.eq.3.3',
      title: 'Acceso remoto limitado a lo imprescindible y autorizado',
      description:
        'Cuando un dispositivo portátil se conecte remotamente a través de redes que no están bajo el estricto control de la organización, el ámbito de operación del servidor limitará la información y los servicios accesibles a los mínimos imprescindibles, requiriendo autorización previa de los responsables de la información y los servicios afectados. Este punto es de aplicación a conexiones a través de internet y otras redes que no sean de confianza.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-04'],
    },
    {
      id: 'mp.eq.3.4',
      title: 'Sin claves de acceso remoto prescindibles en el portátil',
      description:
        'Se evitará, en la medida de lo posible, que el dispositivo portátil contenga claves de acceso remoto a la organización que no sean imprescindibles. Se considerarán claves de acceso remoto aquellas que sean capaces de habilitar un acceso a otros equipos de la organización u otras de naturaleza análoga.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03', 'EV-06'],
      parameterIds: ['P-05', 'P-08'],
    },
    {
      id: 'mp.eq.3.r1.1',
      title: 'Cifrado del disco con información de nivel MEDIO o superior',
      description:
        'Se protegerá el dispositivo portátil mediante cifrado del disco duro cuando el nivel de confidencialidad de la información almacenada en el mismo sea de nivel MEDIO.',
      kind: 'REFUERZO',
      interpretation:
        'Se lee como «MEDIO o superior»: el cifrado se exige cuando la información del portátil es de nivel MEDIO o ALTO. Véase la nota de la tabla de aplicabilidad.',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-04', 'EV-08'],
      parameterIds: ['P-06'],
    },
    {
      id: 'mp.eq.3.r2.1',
      title: 'Uso fuera de las instalaciones solo en entornos protegidos',
      description:
        'El uso de dispositivos portátiles fuera de las instalaciones de la organización se restringirá a entornos protegidos, donde el acceso sea controlado y a salvo de hurtos y miradas indiscretas.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-07'],
    },
  ],
};
