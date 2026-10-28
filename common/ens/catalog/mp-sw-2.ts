import { ENSControlDefinition } from './types';

export const mpSw2CatalogDefinition: ENSControlDefinition = {
  id: 'mp.sw.2',
  name: 'Aceptación y puesta en servicio',
  family: 'Medidas de protección',
  category: 'Protección de las aplicaciones informáticas',
  dimension: 'Todas',
  annexSection: '5.6.2',
  source: { template: 'PowerENS_Plantilla_mp.sw.2', version: '2.0', date: '2026-10-15' },
  description:
    'mp.sw.2 exige comprobar antes de producción que la aplicación cumple los criterios de seguridad y que no deteriora la seguridad de lo que ya había.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.sw.2.1',
      title: 'Criterios de aceptación cumplidos sin deteriorar otros componentes',
      description:
        'Se comprobará que: a) Se cumplen los criterios de aceptación en materia de seguridad. b) No se deteriora la seguridad de otros componentes del servicio.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      parameterIds: ['P-01', 'P-02', 'P-04', 'P-05', 'P-06', 'P-07'],
    },
    {
      id: 'mp.sw.2.r1.1',
      title: 'Pruebas en un entorno aislado de preproducción',
      description:
        'Las pruebas se realizarán en un entorno aislado (pre-producción).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-07', 'EV-08'],
      parameterIds: ['P-03'],
    },
    {
      id: 'mp.sw.2.r2.1',
      title: 'Auditoría del código fuente',
      description:
        'Refuerzo R2 – Inspección de código fuente: Se realizará una auditoría de código fuente.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ninguna categoría (Anexo II): no aplica.',
      },
      evidenceIds: ['EV-10'],
      parameterIds: ['P-08'],
    },
  ],
};
