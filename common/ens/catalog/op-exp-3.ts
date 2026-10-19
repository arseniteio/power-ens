import { ENSControlDefinition } from './types';

// op.exp.3. The Annex II axis is the system CATEGORY and reinforcements are CUMULATIVE: BÁSICA = the six base requirements; MEDIA = base + R1 (r1.1, r1.2, r1.3); ALTA = base + R1 + R2 + R3 (read here as BAJO/MEDIO/ALTO).
// R4 and R5 are defined but required in no category: `levels: []`, never in the denominator.
// An "umbrella" control: .1 and .2 refer to op.exp.2, .3 to op.acc.4, .4 to op.exp.4, .5 to op.exp.7. What is measured here is what belongs to op.exp.3 (the configuration is MAINTAINED); what depends on a source the machine lacks is declared with its evidence and comes out unevidenced with its cause.
export const opExp3CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.3',
  name: 'Gestión de la configuración de seguridad',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'op.exp.3 añade a op.exp.2 la dimensión temporal: no basta con bastionar bien al desplegar, hay que mantener esa configuración «en todo momento» y demostrarlo.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.3.1',
      title: 'Funcionalidad mínima mantenida en el tiempo',
      description:
        'Se mantenga en todo momento la regla de «funcionalidad mínima» ([op.exp.2]).',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-04', 'EV-10'],
      parameterIds: ['P-02', 'P-04'],
    },
    {
      id: 'op.exp.3.2',
      title: 'Mínimo privilegio mantenido en el tiempo',
      description:
        'Se mantenga en todo momento la regla de «mínimo privilegio» ([op.exp.2]).',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-10'],
      parameterIds: ['P-04'],
    },
    {
      id: 'op.exp.3.3',
      title: 'Cambios previamente autorizados',
      description:
        'El sistema se adapte a las nuevas necesidades, previamente autorizadas. (Ver [op.acc.4]).',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-06'],
    },
    {
      id: 'op.exp.3.4',
      title: 'Reacción a vulnerabilidades notificadas',
      description:
        'El sistema reaccione a vulnerabilidades notificadas. (Ver [op.exp.4]).',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06'],
      parameterIds: [],
    },
    {
      id: 'op.exp.3.5',
      title: 'Reacción a incidentes',
      description:
        'El sistema reaccione a incidentes. (Ver [op.exp.7]).',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-07'],
      parameterIds: [],
    },
    {
      id: 'op.exp.3.6',
      title: 'Solo personal autorizado edita la configuración',
      description:
        'La configuración de seguridad solamente podrá editarse por personal debidamente autorizado.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02'],
      parameterIds: ['P-03', 'P-04'],
    },
    {
      // Documentary: that the baseline is the AUTHORISED one is stated by an approved document, accredited with P-ATT. The technical part of R1 (nothing introduced outside it) is r1.2.
      id: 'op.exp.3.r1.1',
      title: 'Línea base de configuración autorizada (R1)',
      description:
        'Existirán configuraciones hardware/software, autorizadas y mantenidas regularmente, para los servidores, elementos de red y estaciones de trabajo.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'R1 es exigible desde la categoría MEDIA. En BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: ['P-01', 'P-ATT'],
    },
    {
      // Two axes, two evidences: EV-03 (nothing introduced outside what is authorised) and EV-11 (formal verification at the declared periodicity). A requirement passes only with both.
      id: 'op.exp.3.r1.2',
      title: 'Verificación periódica frente a la línea base (R1)',
      description:
        'Se verificará periódicamente la configuración hardware/software del sistema para asegurar que no se han introducido ni instalado elementos no autorizados.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'R1 es exigible desde la categoría MEDIA. En BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-03', 'EV-11'],
      parameterIds: ['P-01', 'P-05', 'P-08'],
    },
    {
      id: 'op.exp.3.r1.3',
      title: 'Lista de servicios autorizados (R1)',
      description:
        'Se mantendrá una lista de servicios autorizados para servidores y estaciones de trabajo.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'R1 es exigible desde la categoría MEDIA. En BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-04'],
      parameterIds: ['P-02'],
    },
    {
      id: 'op.exp.3.r2.1',
      title: 'Número muy limitado de administradores (R2)',
      description:
        'La configuración de seguridad del sistema operativo y aplicaciones, tanto de estaciones y servidores como de la electrónica de red del sistema, será responsabilidad de un número muy limitado de administradores del sistema.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'R2 solo es exigible en la categoría ALTA. En BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-03', 'P-09'],
    },
    {
      id: 'op.exp.3.r3.1',
      title: 'Copias de configuración para reconstruir (R3)',
      description:
        'Se realizarán copias de seguridad de la configuración del sistema de forma que sea posible reconstruirlo en parte o en su totalidad tras un incidente.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'R3 solo es exigible en la categoría ALTA. En BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-09'],
      parameterIds: ['P-07', 'P-10'],
    },
    {
      id: 'op.exp.3.r4.1',
      title: 'Configuración por procedimiento de actualización (R4)',
      description:
        'Refuerzo R4 – Aplicación de la configuración: La configuración de seguridad del sistema operativo y de las aplicaciones se mantendrá actualizada a través de una aplicación o procedimiento manual que permita la instalación de las correspondientes modificaciones de versión y actualizaciones de seguridad oportunas.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'R4 está definido en el texto del ENS pero no es exigible en ninguna categoría: NO_APLICA en BAJO, MEDIO y ALTO.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.exp.3.r5.1',
      title: 'Herramientas de estado de dispositivos de red (R5)',
      description:
        'Refuerzo R5 – Control del estado de seguridad de la configuración: Se dispondrá de herramientas que permitan conocer de forma periódica el estado de seguridad de la configuración de los dispositivos de red y, en el caso de que resulte deficiente, permitir su corrección.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'R5 está definido en el texto del ENS pero no es exigible en ninguna categoría: NO_APLICA en BAJO, MEDIO y ALTO.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
  ],
};
