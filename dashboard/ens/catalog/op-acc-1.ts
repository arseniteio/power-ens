import { ENSControlDefinition } from './types';

export const opAcc1CatalogDefinition: ENSControlDefinition = {
  id: 'op.acc.1',
  name: 'Identificación',
  family: 'Marco operacional',
  category: 'Control de acceso',
  dimension: 'Trazabilidad y Autenticidad',
  description:
    'Control ENS orientado a garantizar que cada entidad que accede al sistema dispone de un identificador único, que las cuentas se gestionan y deshabilitan conforme a la política, y que existe una lista actualizada de usuarios autorizados.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.acc.1.1',
      title: 'Identificador único válido',
      description:
        'Se utilizarán identificadores únicos conforme a la normativa de aplicación; no se admiten cuentas genéricas o compartidas que rompan la unicidad del identificador.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-01', 'P-04'],
    },
    {
      id: 'op.acc.1.2',
      title: 'Identificadores singulares por rol',
      description:
        'Cuando un usuario tenga distintos roles frente al sistema recibirá identificadores singulares para cada perfil, de forma que se delimiten privilegios y se recaben los registros de actividad correspondientes.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05', 'EV-06'],
      parameterIds: ['P-03'],
    },
    {
      id: 'op.acc.1.3',
      title: 'Identificador singular por entidad',
      description:
        'Cada entidad (usuario o proceso) que accede al sistema contará con un identificador singular que permita conocer el destinatario, sus derechos de acceso y las acciones realizadas.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02'],
      parameterIds: ['P-01', 'P-02', 'P-03'],
    },
    {
      id: 'op.acc.1.4',
      title: 'Gestión del ciclo de vida de las cuentas',
      description:
        'Cada cuenta estará asociada a un identificador único, se inhabilitará cuando el usuario cese o deje la organización dentro del plazo definido, y se retendrá durante el periodo necesario para la trazabilidad de la actividad.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-08'],
      parameterIds: ['P-05', 'P-06', 'P-08'],
    },
    {
      id: 'op.acc.1.5',
      title: 'Identificación en comunicaciones electrónicas (eIDAS)',
      description:
        'En comunicaciones electrónicas las partes se identificarán conforme al Reglamento (UE) 910/2014 (eIDAS), con el nivel de aseguramiento correspondiente al nivel de autenticidad del sistema.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.1.r1.1',
      title: 'Singularización de la persona',
      description:
        'La identificación del usuario permitirá al Responsable del Sistema, al Responsable de la Seguridad o a sus administradores delegados singularizar a la persona asociada y sus responsabilidades en el sistema.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-02'],
    },
    {
      id: 'op.acc.1.r1.2',
      title: 'Identificación ligada a privilegios',
      description:
        'Los datos de identificación serán utilizados por el sistema para determinar los privilegios del usuario conforme a los requisitos de control de acceso establecidos en la documentación de seguridad.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-06'],
      parameterIds: ['P-07'],
    },
    {
      id: 'op.acc.1.r1.3',
      title: 'Lista actualizada de usuarios autorizados',
      description:
        'Se asegurará la existencia de una lista actualizada de usuarios autorizados, mantenida por el administrador del sistema o de la seguridad, contra la que se contrastan las cuentas activas.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Refuerzo R1 exigible en nivel MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-07'],
    },
  ],
};
