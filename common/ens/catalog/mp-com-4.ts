import { ENSControlDefinition } from './types';

export const mpCom4CatalogDefinition: ENSControlDefinition = {
  id: 'mp.com.4',
  name: 'Separación de flujos de información en la red',
  family: 'Medidas de protección',
  category: 'Protección de las comunicaciones',
  dimension: 'Todas',
  annexSection: '5.4.4',
  source: { template: 'ENSFacil_Plantilla_mp.com.4', version: '2.0', date: '2026-10-15' },
  description:
    'mp.com.4 exige segmentar la red para que cada equipo solo alcance la información que necesita.',
  levels: ['MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.com.4.1',
      title: 'Tráfico segregado: cada equipo accede solo a lo que necesita',
      description:
        'El tráfico por la red se segregará para que cada equipo solamente tenga acceso a la información que necesita.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-09', 'EV-10'],
      parameterIds: ['P-01', 'P-02', 'P-07'],
    },
    {
      id: 'mp.com.4.2',
      title: 'Comunicaciones inalámbricas en un segmento separado',
      description:
        'Si se emplean comunicaciones inalámbricas, será en un segmento separado.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-04'],
      parameterIds: ['P-04'],
    },
    {
      id: 'mp.com.4.r1.1',
      title: 'Segmentos implementados con VLAN',
      description:
        'Los segmentos de red se implementarán por medio de redes de área local virtuales (Virtual Local Area Network, VLAN).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO'],
        reason:
          'Exigible en MEDIO. Para ALTO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-03'],
    },
    {
      id: 'mp.com.4.r1.2',
      title: 'Subredes separadas de usuarios, servicios y administración',
      description:
        'La red que conforma el sistema deberá segregarse en distintas subredes contemplando como mínimo: • Usuarios. • Servicios. • Administración.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO'],
        reason:
          'Exigible en MEDIO. Para ALTO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-01'],
    },
    {
      id: 'mp.com.4.r2.1',
      title: 'Segmentos implementados con redes privadas virtuales',
      description:
        'Los segmentos de red se implementarán por medio de redes privadas virtuales (Virtual Private Network, VPN).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-03'],
    },
    {
      id: 'mp.com.4.r3.1',
      title: 'Segmentos implementados con medios físicos separados',
      description:
        'Los segmentos de red se implementarán con medios físicos separados.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-03'],
    },
    {
      id: 'mp.com.4.r4.1',
      title: 'Control de entrada de usuarios y de información en cada segmento',
      description:
        'Control de entrada de los usuarios que llegan a cada segmento y control de entrada y salida de la información disponible en cada segmento.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-05', 'EV-06'],
      parameterIds: ['P-05', 'P-06'],
    },
    {
      id: 'mp.com.4.r4.2',
      title: 'Punto de interconexión asegurado, mantenido y monitorizado',
      description:
        'El punto de interconexión estará particularmente asegurado, mantenido y monitorizado, (como en [mp.com.1]).',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-05'],
    },
  ],
};
