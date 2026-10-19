import { ENSControlDefinition } from './types';

export const mpCom1CatalogDefinition: ENSControlDefinition = {
  id: 'mp.com.1',
  name: 'Perímetro seguro',
  family: 'Medidas de protección',
  category: 'Protección de las comunicaciones',
  dimension: 'Todas',
  annexSection: '5.4.1',
  source: { template: 'ENSFacil_Plantilla_mp.com.1', version: '2.0', date: '2026-10-15' },
  description:
    'mp.com.1 pide un perímetro por el que pase todo el tráfico y que solo deje pasar flujos previamente autorizados.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.com.1.1',
      title: 'Perímetro que separa la red interna y por el que pasa todo el tráfico',
      description:
        'Se dispondrá de un sistema de protección perimetral que separe la red interna del exterior. Todo el tráfico deberá atravesar dicho sistema.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-07', 'EV-08'],
      parameterIds: ['P-01', 'P-03', 'P-05'],
    },
    {
      id: 'mp.com.1.2',
      title: 'Flujos a través del perímetro autorizados previamente',
      description:
        'Todos los flujos de información a través del perímetro deben estar autorizados previamente.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-06', 'EV-07', 'EV-08'],
      parameterIds: ['P-02', 'P-04', 'P-05'],
    },
  ],
};
