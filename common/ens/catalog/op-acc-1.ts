import { ENSControlDefinition } from './types';

export const opAcc1CatalogDefinition: ENSControlDefinition = {
  id: 'op.acc.1',
  name: 'Identificación',
  family: 'Marco operacional',
  category: 'Control de acceso',
  // The OSCompliance engine judges every machine that sends facts, the manager included.
  measurementPlanes: ['agent', 'manager'],
  dimension: 'Trazabilidad y Autenticidad',
  // Annex II applies op.acc.1 by the levels of Traceability and Authenticity: the higher of the two rules.
  levelDimension: ['T', 'A'],
  description:
    'Control ENS orientado a garantizar que cada entidad que accede al sistema dispone de un identificador único, que las cuentas se gestionan y deshabilitan conforme a la política, y que existe una lista actualizada de usuarios autorizados.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  annexSection: '4.2.1',
  source: { template: 'ENSFacil_Plantilla_op.acc.1', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.acc.1.1',
      title: 'Identificador único válido',
      description:
        'Se podrá utilizar como identificador único los sistemas de identificación previstos en la normativa de aplicación, entre ellos, los sistemas de clave concertada y cualquier otro sistema que las administraciones consideren válido en los términos de la Ley 39/2015.',
      interpretation:
        'ENSFácil lo lee como unicidad del identificador: no se admiten cuentas genéricas o compartidas (P-04) con autenticación correcta (EV-03).',
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
        'Cuando el usuario tenga diferentes roles frente al sistema (como ciudadano, trabajador del organismo o administrador, por ejemplo) recibirá identificadores singulares para cada perfil, de forma que se recaben los correspondientes registros de actividad y se delimiten los privilegios de cada perfil.',
      interpretation:
        'ENSFácil comprueba que las cuentas de servicio (P-03) no se usan para acceso interactivo (EV-05) y que una misma cuenta no ejerce a la vez privilegios de administración y de usuario (EV-06).',
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
        'Cada entidad (usuario o proceso) que accede al sistema contará con un identificador singular que permita conocer el destinatario, los derechos de acceso que recibe y las acciones realizadas por dicha entidad.',
      interpretation:
        'ENSFácil contrasta el inventario de cuentas activas (EV-01) y los cambios en los ficheros de identidad (EV-02) con las cuentas genéricas (P-04) y de servicio (P-03) declaradas.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-05'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04'],
    },
    {
      id: 'op.acc.1.4',
      title: 'Gestión del ciclo de vida de las cuentas',
      description:
        'Las cuentas de usuario se gestionarán de la siguiente forma: a) Cada cuenta estará asociada a un identificador único. b) Las cuentas deben ser inhabilitadas cuando: el usuario deja la organización; cesa en la función para la cual se requería la cuenta; o la persona que la autorizó da orden contraria. c) Las cuentas se retendrán durante el período necesario para atender las necesidades de trazabilidad de los registros de actividad (denominado «período de retención»).',
      interpretation:
        'ENSFácil comprueba que la cuenta se inhabilita dentro del plazo de P-05 tras la baja (EV-04) y que no se elimina antes del periodo de retención de P-06 (EV-08).',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-08'],
      parameterIds: ['P-01', 'P-02', 'P-05', 'P-06', 'P-08'],
    },
    {
      id: 'op.acc.1.5',
      title: 'Identificación en comunicaciones electrónicas (eIDAS)',
      description:
        'En comunicaciones electrónicas, las partes se identificarán conforme al Reglamento (UE) n.º 910/2014 (eIDAS), con la siguiente correspondencia: a) Autenticidad nivel BAJO → nivel de seguridad eIDAS bajo, sustancial o alto. b) Autenticidad nivel MEDIO → nivel de seguridad eIDAS sustancial o alto. c) Autenticidad nivel ALTO → nivel de seguridad eIDAS alto.',
      interpretation:
        'Requisito documental: se acredita con una atestación (P-ATT), porque la telemetría de Wazuh no observa el nivel eIDAS de las comunicaciones.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.1.r1.1',
      title: 'Singularización de la persona',
      description:
        'La identificación del usuario permitirá al Responsable del Sistema, al Responsable de la Seguridad o a sus administradores delegados, singularizar a la persona asociada al mismo, así como sus responsabilidades en el sistema.',
      interpretation:
        'Requisito documental: se acredita con una atestación (P-ATT).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: [],
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
      parameterIds: [],
    },
    {
      id: 'op.acc.1.r1.3',
      title: 'Lista actualizada de usuarios autorizados',
      description:
        'Se asegurará la existencia de una lista actualizada de usuarios autorizados, mantenida por el administrador del sistema o de la seguridad del sistema.',
      interpretation:
        'ENSFácil contrasta las cuentas activas (EV-01) con la lista de usuarios autorizados de P-07 (EV-07).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Refuerzo R1 exigible en nivel MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-01', 'EV-07'],
      parameterIds: ['P-07'],
    },
  ],
};
