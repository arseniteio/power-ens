import { ENSControlDefinition } from './types';

export const opAcc3CatalogDefinition: ENSControlDefinition = {
  id: 'op.acc.3',
  name: 'Segregación de funciones y tareas',
  family: 'Marco operacional',
  category: 'Control de acceso',
  dimension: 'Confidencialidad, Integridad, Trazabilidad y Autenticidad',
  description:
    'op.acc.3 es una medida fundamentalmente organizativa: exige que ciertas funciones no recaigan en la misma persona.',
  levels: ['MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.acc.3.1',
      title: 'Siempre que sea posible, las capacidades de desarrollo y…',
      description:
        'Siempre que sea posible, las capacidades de desarrollo y operación no recaerán en la misma persona.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-06'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-06'],
    },
    {
      id: 'op.acc.3.2',
      title: 'Siempre que sea posible, las personas que autorizan y…',
      description:
        'Siempre que sea posible, las personas que autorizan y controlan el uso serán distintas.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      // EV-03 (concurrencia en tareas críticas) vive aquí y no en op.acc.3.1
      // porque «quien autoriza y quien controla son personas distintas» ES el
      // control dual que mide P-04. Hasta el 06/08/2026 no la reclamaba ningún
      // requisito: la policy la evaluaba contra `op.acc.3`, el id del CONTROL,
      // que no casa con ninguno, y el veredicto se perdía sin ruido.
      evidenceIds: ['EV-02', 'EV-03', 'EV-06'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-06'],
    },
    {
      id: 'op.acc.3.r1.1',
      title: 'Siempre que sea posible, la misma persona no aunará…',
      description:
        'Siempre que sea posible, la misma persona no aunará funciones de configuración y mantenimiento del sistema.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-04', 'EV-06'],
      parameterIds: ['P-01', 'P-02'],
    },
    {
      id: 'op.acc.3.r1.2',
      title: 'La misma persona no puede aunar funciones de auditoría o…',
      description:
        'La misma persona no puede aunar funciones de auditoría o supervisión con cualquier otra función.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-01', 'P-02', 'P-05'],
    },
    {
      id: 'op.acc.3.r2.1',
      title: 'Refuerzo R2 – Privilegios de auditoría: Existirán cuentas…',
      description:
        'Refuerzo R2 – Privilegios de auditoría: Existirán cuentas con privilegios de auditoría estrictamente controladas y personalizadas.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Exigible en . Para MEDIO y ALTO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.acc.3.r3.1',
      title: 'Refuerzo R3 – Acceso a la información de seguridad: El…',
      description:
        'Refuerzo R3 – Acceso a la información de seguridad: El acceso a la información de seguridad del sistema estará permitido únicamente a los administradores de seguridad/sistema autorizados, utilizando los mecanismos de acceso imprescindibles (consola, interfaz web, acceso remoto, etc.).',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Exigible en . Para MEDIO y ALTO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: [],
    },
  ],
};
