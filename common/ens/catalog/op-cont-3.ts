import { ENSControlDefinition } from './types';

export const opCont3CatalogDefinition: ENSControlDefinition = {
  id: 'op.cont.3',
  name: 'Pruebas periódicas',
  family: 'Marco operacional',
  category: 'Continuidad del servicio',
  dimension: 'Disponibilidad (ÚNICA dimensión)',
  // Governed by the Availability LEVEL, not the system category: evaluated with `availabilityLevel` of the global configuration and, if not declared, the ENS level. Applies only with D at ALTO; a MEDIA-category system has no dimension at ALTO, so it is NO_APLICA by definition.
  levelDimension: 'D',
  // Measured ONLY on the manager: the test and deficiency registers live in the manager's /etc/ensfacil/, and the stops, starts and restores of each test are seen in its alerts.json. Facts speak about other systems through `agente`. Result is the manager row's (000).
  measurementPlanes: ['manager'],
  description:
    'op.cont.3 pide probar el plan de continuidad con periodicidad y corregir lo que las pruebas revelen.',
  levels: ['ALTO'],
  annexSection: '4.6.3',
  source: { template: 'ENSFacil_Plantilla_op.cont.3', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  // A requirement with two obligations: decided with EV-01, EV-02, EV-04 and EV-05. EV-03, EV-06, EV-07 and EV-08 feed EV-04 and the report, without verdict of their own.
  requirements: [
    {
      id: 'op.cont.3.1',
      title: 'Pruebas periódicas del plan y corrección de lo detectado',
      description:
        'Se realizarán pruebas periódicas para localizar y, en su caso, corregir los errores o deficiencias que puedan existir en el plan de continuidad.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-05'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07'],
    },
  ],
};
