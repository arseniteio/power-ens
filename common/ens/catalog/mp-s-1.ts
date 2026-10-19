import { ENSControlDefinition } from './types';

export const mpS1CatalogDefinition: ENSControlDefinition = {
  id: 'mp.s.1',
  name: 'Protección del correo electrónico',
  family: 'Medidas de protección',
  category: 'Protección de los servicios',
  dimension: 'Todas',
  annexSection: '5.8.1',
  source: { template: 'ENSFacil_Plantilla_mp.s.1', version: '2.0', date: '2026-10-15' },
  description:
    'mp.s.1 reúne siete requisitos de tres naturalezas: protección de la información del correo, defensa frente a amenazas y normas de uso para el personal.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.s.1.1',
      title: 'Protección del cuerpo de los mensajes y de los anexos',
      description:
        'La información distribuida por medio de correo electrónico se protegerá, tanto en el cuerpo de los mensajes como en los anexos.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-03', 'P-04'],
    },
    {
      id: 'mp.s.1.2',
      title: 'Protección del encaminamiento y del establecimiento de conexiones',
      description:
        'Se protegerá la información de encaminamiento de mensajes y establecimiento de conexiones.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06', 'EV-07', 'EV-08'],
      parameterIds: ['P-02', 'P-03'],
    },
    {
      id: 'mp.s.1.3',
      title: 'Protección frente al correo no solicitado',
      description:
        'Correo no solicitado, en su expresión inglesa «spam».',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-08'],
      parameterIds: ['P-05'],
    },
    {
      id: 'mp.s.1.4',
      title: 'Protección frente al código dañino',
      description:
        'Código dañino, constituidos por virus, gusanos, troyanos, espías, u otros de naturaleza análoga.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-03', 'EV-04'],
      parameterIds: ['P-06'],
    },
    {
      id: 'mp.s.1.5',
      title: 'Protección frente al código móvil',
      description:
        'Código móvil de tipo micro-aplicación, en su expresión inglesa «applet».',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-05'],
      parameterIds: ['P-07'],
    },
    {
      id: 'mp.s.1.6',
      title: 'Normas de uso: limitaciones a las comunicaciones privadas',
      description:
        'Limitaciones al uso como soporte de comunicaciones privadas.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: [],
      parameterIds: ['P-08'],
    },
    {
      id: 'mp.s.1.7',
      title: 'Concienciación y formación sobre el uso del correo',
      description:
        'Actividades de concienciación y formación relativas al uso del correo electrónico.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-10'],
      parameterIds: ['P-09'],
    },
  ],
};
