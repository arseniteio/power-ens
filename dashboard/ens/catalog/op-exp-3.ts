import { ENSControlDefinition } from './types';

// op.exp.3 · Gestión de la configuración de seguridad.
//
// El eje del Anexo II es la CATEGORÍA del sistema, y los refuerzos son
// ACUMULATIVOS, no alternativas: BÁSICA = los seis requisitos base; MEDIA = base
// + R1 entero (r1.1, r1.2, r1.3); ALTA = base + R1 + R2 + R3. BÁSICA/MEDIA/ALTA
// se leen aquí como BAJO/MEDIO/ALTO. R4 y R5 están definidos en el texto pero no
// son exigibles en ninguna categoría: van con `levels: []` y no entran nunca en
// el denominador.
//
// Es un control «paraguas»: .1 y .2 remiten a op.exp.2, .3 a op.acc.4, .4 a
// op.exp.4 y .5 a op.exp.7. Aquí se mide lo que es propio de op.exp.3 —que la
// configuración se MANTIENE— y lo que depende de una fuente que la máquina no
// tiene se declara igual, con su evidencia, y sale no evidenciado con su causa en
// vez de acreditarse con otra cosa.
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
      // Documental: que la línea base sea la AUTORIZADA lo dice un documento
      // aprobado, no una máquina. Se acredita con P-ATT. Lo técnico de R1 —que
      // no se introduzca nada fuera de ella— es r1.2.
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
      // Dos ejes, dos evidencias: EV-03 (nada introducido fuera de lo
      // autorizado) y EV-11 (la verificación formal se hace con la
      // periodicidad declarada). La plantilla ya los separa en dos condiciones
      // de incumplimiento; un requisito solo cumple con las dos.
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
