import { ENSControlDefinition } from './types';

export const mpCom3CatalogDefinition: ENSControlDefinition = {
  id: 'mp.com.3',
  name: 'Protección de la integridad y de la autenticidad',
  family: 'Medidas de protección',
  category: 'Protección de las comunicaciones',
  dimension: 'Integridad y Autenticidad',
  // Governed by the dimension LEVEL, not the system category: evaluated with `integrityLevel`, `authenticityLevel` of the global configuration (the maximum applies) and, if not declared, with the ENS level.
  levelDimension: ['I', 'A'],
  annexSection: '5.4.3',
  source: { template: 'ENSFacil_Plantilla_mp.com.3', version: '2.0', date: '2026-10-15' },
  description:
    'mp.com.3 protege la integridad y autenticidad de las comunicaciones con el exterior del dominio de seguridad.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.com.3.1',
      title: 'Autenticidad del otro extremo antes de intercambiar información',
      description:
        'En comunicaciones con puntos exteriores al dominio propio de seguridad, se asegurará la autenticidad del otro extremo del canal de comunicación antes de intercambiar información. (Ver [op.acc.5]).',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-10'],
      parameterIds: ['P-01'],
    },
    {
      id: 'mp.com.3.2',
      title: 'Prevención de ataques activos con activación del tratamiento del incidente',
      description:
        'Se prevendrán ataques activos garantizando que al ser detectados se activarán los procedimientos previstos de tratamiento del incidente. Se considerarán ataques activos: a) La alteración de la información en tránsito. b) La inyección de información espuria. c) El secuestro de la sesión por una tercera parte.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-04', 'EV-05', 'EV-06', 'EV-07'],
      parameterIds: ['P-03', 'P-04'],
    },
    {
      id: 'mp.com.3.3',
      title: 'Mecanismos de identificación y autenticación admitidos',
      description:
        'Se aceptará cualquier mecanismo de identificación y autenticación de los previstos en el ordenamiento jurídico y en la normativa de aplicación.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-09'],
      parameterIds: ['P-05'],
    },
    {
      id: 'mp.com.3.r1.1',
      title: 'Redes privadas virtuales cifradas fuera del dominio propio',
      description:
        'Se emplearán redes privadas virtuales cifradas cuando la comunicación discurra por redes fuera del propio dominio de seguridad.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-01', 'P-06'],
    },
    {
      id: 'mp.com.3.r2.1',
      title: 'Algoritmos y parámetros autorizados por el CCN',
      description:
        'Se emplearán algoritmos y parámetros autorizados por el CCN.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-02', 'EV-03', 'EV-10'],
      parameterIds: ['P-02'],
    },
    {
      id: 'mp.com.3.r3.1',
      title: 'Dispositivos hardware para la red privada virtual',
      description:
        'Se recomienda emplear dispositivos hardware en el establecimiento y utilización de la red privada virtual.',
      kind: 'REFUERZO',
      interpretation:
        'el requisito está redactado como recomendación, pero la tabla de aplicabilidad del Anexo II lo incluye como refuerzo exigible en nivel ALTO.',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: ['P-07'],
    },
    {
      id: 'mp.com.3.r4.1',
      title: 'Productos certificados conforme a op.pl.5',
      description:
        'Se emplearán productos certificados conforme a lo establecido en [op.pl.5].',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-11'],
      parameterIds: ['P-08'],
    },
    {
      id: 'mp.com.3.r5.1',
      title: 'Cifradores conformes con la guía CCN-STIC',
      description:
        'Refuerzo R5 – Cifradores: Se emplearán cifradores que cumplan con los requisitos establecidos en la guía CCN-STIC que sea de aplicación.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ninguna categoría (Anexo II): no aplica.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
  ],
};
