import { ENSControlDefinition } from './types';

export const mpEq2CatalogDefinition: ENSControlDefinition = {
  id: 'mp.eq.2',
  name: 'Bloqueo de puesto de trabajo',
  family: 'Medidas de protección',
  category: 'Protección de los equipos',
  dimension: 'Autenticidad (ÚNICA dimensión)',
  // Governed by the dimension LEVEL, not the system category: evaluated with `authenticityLevel` of the global configuration and, if not declared, with the ENS level.
  levelDimension: 'A',
  annexSection: '5.3.2',
  source: { template: 'PowerENS_Plantilla_mp.eq.2', version: '2.0', date: '2026-10-15' },
  description:
    'mp.eq.2 es uno de los controles más sencillos del ENS y de los que mejor se verifican con Wazuh: se reduce a dos temporizadores y a que el desbloqueo exija credenciales.',
  levels: ['MEDIO', 'ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  requirements: [
    {
      id: 'mp.eq.2.1',
      title: 'Bloqueo por inactividad con nueva autenticación',
      description:
        'El puesto de trabajo se bloqueará al cabo de un tiempo prudencial de inactividad, requiriendo una nueva autenticación del usuario para reanudar la actividad en curso.',
      kind: 'BASE',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
      parameterIds: ['P-01', 'P-03', 'P-04', 'P-05'],
    },
    {
      id: 'mp.eq.2.r1.1',
      title: 'Cancelación de las sesiones abiertas tras un tiempo superior',
      description:
        'Pasado un cierto tiempo, superior al anterior, se cancelarán las sesiones abiertas desde dicho puesto de trabajo.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-02', 'EV-04'],
      parameterIds: ['P-02'],
    },
  ],
};
