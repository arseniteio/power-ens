import { ENSControlDefinition } from './types';

export const mpInfo6CatalogDefinition: ENSControlDefinition = {
  id: 'mp.info.6',
  name: 'Copias de seguridad',
  family: 'Medidas de protección',
  category: 'Protección de la información',
  dimension: 'Disponibilidad',
  description:
    'Control ENS orientado a garantizar la existencia, conservación, protección y recuperación de copias de seguridad.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  // Las copias se miden solo en las máquinas que la organización declara en
  // P-04: no toda máquina del alcance ENS hace copias ni las guarda.
  scopeParameter: 'P-04',
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.info.6.1',
      title: 'Realización de copias de seguridad',
      description:
        'Deben realizarse copias de seguridad de la información necesaria para la prestación del servicio.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-07'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-10'],
    },
    {
      id: 'mp.info.6.2.a',
      title: 'Periodicidad de las copias',
      description:
        'La periodicidad debe estar definida según las necesidades del sistema y la política aplicable.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'mp.info.6.2.b',
      title: 'Conservación de las copias',
      description:
        'Las copias deben conservarse durante el periodo definido por la organización.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03', 'EV-07'],
      parameterIds: ['P-03'],
    },
    {
      id: 'mp.info.6.2.c',
      title: 'Almacenamiento en otros lugares',
      description:
        'Los procedimientos de respaldo deben definir los requisitos de almacenamiento en otros lugares. Se acredita con el recolector de copias (EV-07) y con los destinos de cada copia (EV-06); la copia físicamente separada solo se exige en nivel ALTO, donde también la acredita R2.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06', 'EV-07'],
      parameterIds: ['P-03'],
    },
    {
      id: 'mp.info.6.2.d',
      title: 'Control de acceso a las copias',
      description:
        'El acceso a las copias debe limitarse a usuarios y procesos autorizados.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03', 'EV-04'],
      parameterIds: ['P-07'],
    },
    {
      id: 'mp.info.6.r1.1',
      title: 'Pruebas de restauración',
      description:
        'Deben realizarse pruebas de recuperación para verificar que las copias son restaurables.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-04', 'P-05', 'P-10'],
    },
    {
      id: 'mp.info.6.r2.1',
      title: 'Copia en ubicación alternativa',
      description:
        'Debe existir copia en ubicación alternativa cuando el nivel ENS lo requiera.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Este requisito solo aplica a sistemas de nivel ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-08', 'P-09'],
    },
  ],
};
