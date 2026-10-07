import { ENSControlDefinition } from './types';

export const opAcc2CatalogDefinition: ENSControlDefinition = {
  id: 'op.acc.2',
  name: 'Requisitos de acceso',
  family: 'Marco operacional',
  category: 'Control de acceso',
  dimension: 'Confidencialidad, Integridad, Trazabilidad y Autenticidad',
  description:
    'Control ENS orientado a garantizar que los recursos del sistema están protegidos por controles de acceso, que esos controles reflejan las decisiones del responsable del recurso, que los componentes y ficheros del sistema operativo están especialmente controlados y que, en nivel ALTO, los privilegios de acceso se mantienen individualmente y restringen el tipo de acceso.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.acc.2.1',
      title: 'Protección de los recursos mediante control de acceso',
      description:
        'Los recursos del sistema se protegerán con algún mecanismo que impida su utilización, salvo a las entidades que disfruten de derechos de acceso suficientes.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-03', 'EV-07'],
      parameterIds: ['P-01', 'P-03', 'P-07'],
    },
    {
      id: 'op.acc.2.2',
      title: 'Derechos de acceso según el responsable del recurso',
      description:
        'Los derechos de acceso de cada recurso se establecerán según las decisiones de la persona responsable del recurso, ateniéndose a la política y normativa de seguridad del sistema.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03', 'EV-04'],
      parameterIds: ['P-04'],
    },
    {
      id: 'op.acc.2.3',
      title: 'Control de acceso a componentes y ficheros del sistema operativo',
      description:
        'Particularmente, se controlará el acceso a los componentes del sistema operativo y a sus ficheros o registros de configuración.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02', 'EV-03', 'EV-07'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'op.acc.2.r1.1',
      title: 'Privilegios de seguridad mantenidos individualmente',
      description:
        'Todos los usuarios autorizados deben tener un conjunto de atributos de seguridad (privilegios) que puedan ser mantenidos individualmente.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Refuerzo R1 exigible únicamente en nivel ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-05'],
    },
    {
      id: 'op.acc.2.r1.2',
      title: 'Privilegios que restringen el tipo de acceso',
      description:
        'Los privilegios de acceso se implementarán para restringir el tipo de acceso que un usuario puede tener (lectura, escritura, modificación, borrado, etc.).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Refuerzo R1 exigible únicamente en nivel ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-05', 'EV-06'],
      parameterIds: ['P-05', 'P-06'],
    },
  ],
};
