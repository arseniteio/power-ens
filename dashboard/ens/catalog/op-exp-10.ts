import { ENSControlDefinition } from './types';

export const opExp10CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.10',
  name: 'Protección de claves criptográficas',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'Este es el control del bloque de explotación con menor cobertura automática, y conviene plantearlo así desde el principio.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.10.1',
      title: 'Claves protegidas durante todo su ciclo de vida',
      description:
        'Las claves criptográficas se protegerán durante todo su ciclo de vida: (1) generación, (2) transporte al punto de explotación, (3) custodia durante la explotación, (4) archivo posterior a su retirada de explotación activa y (5) destrucción final.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-07', 'EV-08'],
      parameterIds: ['P-01', 'P-02', 'P-07', 'P-08'],
    },
    {
      id: 'op.exp.10.2',
      title: 'Generación aislada de la explotación',
      description:
        'Los medios de generación estarán aislados de los medios de explotación.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-05'],
    },
    {
      id: 'op.exp.10.3',
      title: 'Claves retiradas archivadas fuera de explotación',
      description:
        'Las claves retiradas de operación que deban ser archivadas, lo serán en medios aislados de los de explotación.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-06'],
    },
    {
      id: 'op.exp.10.r1.1',
      title: 'Algoritmos y parámetros autorizados por el CCN (R1)',
      description:
        'Se emplearán algoritmos y parámetros autorizados por el CCN.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-03', 'EV-04', 'EV-07'],
      parameterIds: ['P-03', 'P-04'],
    },
    {
      id: 'op.exp.10.r2.1',
      title: 'Cifradores conformes a la guía CCN-STIC (R2)',
      description:
        'Refuerzo R2 – Protección avanzada de claves criptográficas: Se emplearán cifradores que cumplan con los requisitos establecidos en la guía CCN-STIC que sea de aplicación.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Exigible en . Para BAJO y MEDIO y ALTO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: ['P-09'],
    },
  ],
};
