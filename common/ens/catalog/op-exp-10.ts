import { ENSControlDefinition } from './types';

export const opExp10CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.10',
  name: 'Protección de claves criptográficas',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'op.exp.10 regula el ciclo de vida de las claves criptográficas, y buena parte de él ocurre donde un SIEM no llega (generación en un HSM, custodia física, destrucción). ENSFácil mide lo que sí vive en las máquinas: quién accede a las claves en disco, dónde están y cómo están protegidas, si se generan claves en explotación, si siguen presentes claves retiradas, la vigencia de los certificados y los algoritmos que aceptan y negocian los servicios frente a los autorizados por el CCN.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  annexSection: '4.3.10',
  source: { template: 'ENSFacil_Plantilla_op.exp.10', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
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
      // Transport and destruction (phases 2 and 5) leave no trace on any machine: documented in P-07. The requirement has technical evidence (custody), so an attestation cannot replace it.
      evidenceIds: ['EV-01', 'EV-02', 'EV-07', 'EV-08'],
      parameterIds: ['P-01', 'P-02', 'P-07', 'P-08', 'P-10'],
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
      parameterIds: ['P-01', 'P-05', 'P-06'],
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
          'R1 es exigible en MEDIO y ALTO (MEDIA y ALTA exigen exactamente lo mismo). En BAJO se muestra como NO_APLICA.',
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
          'El ENS define este refuerzo pero no lo exige en ninguna categoría: se muestra como NO_APLICA en los tres niveles.',
      },
      evidenceIds: [],
      parameterIds: ['P-09'],
    },
  ],
};
