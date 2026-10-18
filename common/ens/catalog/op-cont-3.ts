import { ENSControlDefinition } from './types';

export const opCont3CatalogDefinition: ENSControlDefinition = {
  id: 'op.cont.3',
  name: 'Pruebas periódicas',
  family: 'Marco operacional',
  category: 'Continuidad del servicio',
  dimension: 'Disponibilidad (ÚNICA dimensión)',
  // Se rige por el NIVEL de la Disponibilidad, no por la categoría del
  // sistema: se evalúa con `availabilityLevel` de la configuración global y,
  // si no está declarado, con el nivel ENS. Solo aplica con D en ALTO: un
  // sistema de categoría MEDIA no tiene ninguna dimensión en ALTO, así que ahí
  // es NO_APLICA por definición.
  levelDimension: 'D',
  // Se mide SOLO en el manager: los registros de pruebas y de deficiencias
  // viven en /etc/ensfacil/ del manager, y las caídas, los arranques y las
  // restauraciones de cada prueba se ven en su alerts.json. Los hechos hablan
  // de los demás sistemas por su campo `agente`. Su resultado es el de la fila
  // del manager (000).
  measurementPlanes: ['manager'],
  description:
    'op.cont.3 pide probar el plan de continuidad con periodicidad y corregir lo que las pruebas revelen.',
  levels: ['ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  // Un requisito con dos obligaciones (spec 2026-10-09 §6.3): se decide con
  // EV-01, EV-02, EV-04 y EV-05. EV-03, EV-06, EV-07 y EV-08 alimentan EV-04 y
  // el informe, sin veredicto propio.
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
