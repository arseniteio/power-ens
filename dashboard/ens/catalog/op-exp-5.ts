import { ENSControlDefinition } from './types';

export const opExp5CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.5',
  name: 'Gestión de cambios',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Todas',
  description:
    'op.exp.5 contrasta los cambios que REALMENTE se producen en cada máquina (configuración, software, puertos en escucha y hardware) con el registro de peticiones de cambio que mantiene la organización. Sin ITSM, ese registro es un fichero TSV en cada máquina, mantenido a mano, y así se declara.',
  // El Anexo II lo declara «n.a.» en BÁSICA: ni siquiera la base aplica. Sin
  // BAJO aquí, en ese nivel todos sus requisitos salen NO_APLICA y el control
  // queda fuera del denominador (tests/op-exp-5-judgment.test.ts, bloque 1).
  levels: ['MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.5.1',
      title: 'Peticiones de cambio registradas y numeradas',
      description:
        'Los cambios se planificarán para reducir el impacto sobre la prestación de los servicios afectados. Para ello, todas las peticiones de cambio se registrarán asignando un número de referencia que permita su seguimiento, de forma equivalente al registro de los incidentes.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02'],
      parameterIds: ['P-01'],
    },
    {
      id: 'op.exp.5.2',
      title: 'Información suficiente para autorizar el cambio',
      description:
        'La información a registrar para cada petición de cambio será suficiente para que quien deba autorizarlos no tenga dudas al respecto y permita gestionarlo hasta su desestimación o implementación.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'op.exp.5.3',
      title: 'Pruebas en preproducción equivalente',
      description:
        'Las pruebas de preproducción, siempre que sea posible realizarlas, se efectuarán en equipos equivalentes a los de producción, al menos en los aspectos específicos del cambio.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-05'],
    },
    {
      id: 'op.exp.5.4',
      title: 'Aprobación previa de los cambios de riesgo alto',
      description:
        'Mediante un análisis de riesgos se determinará si los cambios son relevantes para la seguridad del sistema. Aquellos cambios que impliquen un riesgo de nivel ALTO deberán ser aprobados, explícitamente, de forma previa a su implantación, por el Responsable de la Seguridad.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-04'],
      parameterIds: ['P-01', 'P-03', 'P-04'],
    },
    {
      id: 'op.exp.5.5',
      title: 'Pruebas de aceptación y documentación actualizada',
      description:
        'Una vez implementado el cambio, se realizarán las pruebas de aceptación convenientes. Si son positivas, se actualizará la documentación de configuración (diagramas de red, manuales, el inventario, etc.), siempre que proceda.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-06', 'EV-07'],
      parameterIds: ['P-06', 'P-09'],
    },
    {
      id: 'op.exp.5.r1.1',
      title: 'Posibilidad de reversión prevista (R1)',
      description:
        'Antes de la aplicación de los cambios, se deberá tener en cuenta la posibilidad de revertirlos en caso de la aparición de efectos adversos.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'R1 es exigible solo en ALTO. En MEDIO se muestra como NO_APLICA; en BAJO no aplica el control entero.',
      },
      evidenceIds: ['EV-07', 'EV-09'],
      parameterIds: ['P-08', 'P-09'],
    },
    {
      id: 'op.exp.5.r1.2',
      title: 'Fallos comunicados al responsable de seguridad (R1)',
      description:
        'Todos los fallos en el software y hardware deberán ser comunicados al responsable designado en la organización de la seguridad.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'R1 es exigible solo en ALTO. En MEDIO se muestra como NO_APLICA; en BAJO no aplica el control entero.',
      },
      evidenceIds: ['EV-08'],
      parameterIds: ['P-07'],
    },
    {
      id: 'op.exp.5.r1.3',
      title: 'Cambios documentados con impacto en seguridad (R1)',
      description:
        'Todos los cambios en el sistema deberán documentarse, incluyendo una valoración del impacto que dicho cambio supone en la seguridad del sistema.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'R1 es exigible solo en ALTO. En MEDIO se muestra como NO_APLICA; en BAJO no aplica el control entero.',
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-01', 'P-02'],
    },
  ],
};
