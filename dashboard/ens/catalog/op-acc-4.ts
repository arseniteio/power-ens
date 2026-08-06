import { ENSControlDefinition } from './types';

export const opAcc4CatalogDefinition: ENSControlDefinition = {
  id: 'op.acc.4',
  name: 'Proceso de gestión de derechos de acceso',
  family: 'Marco operacional',
  category: 'Control de acceso',
  dimension: 'Confidencialidad, Integridad, Trazabilidad y Autenticidad',
  description:
    'op.acc.4 establece los principios que rigen la asignación de derechos: denegación por defecto, mínimo privilegio, necesidad de conocer, capacidad de autorizar y política de acceso remoto.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.acc.4.1',
      title: 'Todo acceso estará prohibido, salvo autorización expresa.',
      description:
        'Todo acceso estará prohibido, salvo autorización expresa.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02'],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.acc.4.2',
      title: 'Mínimo privilegio: los privilegios de cada entidad, usuario…',
      description:
        'Mínimo privilegio: los privilegios de cada entidad, usuario o proceso se reducirán al mínimo imprescindible para cumplir sus obligaciones o funciones.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02', 'EV-03', 'EV-08'],
      parameterIds: ['P-01', 'P-06'],
    },
    {
      id: 'op.acc.4.3',
      title: 'Necesidad de conocer y responsabilidad de compartir: los…',
      description:
        'Necesidad de conocer y responsabilidad de compartir: los privilegios se asignarán de forma que las entidades, usuarios o procesos sólo accederán al conocimiento de aquella información requerida para cumplir sus obligaciones o funciones. La información es patrimonio del organismo y toda aquella que resulte necesaria para el usuario estará a su disposición.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-01', 'P-07'],
    },
    {
      id: 'op.acc.4.4',
      title: 'Capacidad de autorizar: Exclusivamente el personal con…',
      description:
        'Capacidad de autorizar: Exclusivamente el personal con competencia para ello podrá conceder, alterar o anular la autorización de acceso a los recursos, conforme a los criterios establecidos por su responsable. Los permisos de acceso se revisarán de forma periódica.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03', 'EV-04', 'EV-05'],
      parameterIds: ['P-02', 'P-03'],
    },
    {
      id: 'op.acc.4.5',
      title: 'Se establecerá una política específica de acceso remoto,…',
      description:
        'Se establecerá una política específica de acceso remoto, requiriéndose autorización expresa.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-04', 'P-05'],
    },
  ],
};
