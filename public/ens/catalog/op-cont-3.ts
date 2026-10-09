import { ENSControlDefinition } from './types';

export const opCont3CatalogDefinition: ENSControlDefinition = {
  id: 'op.cont.3',
  name: 'Pruebas periódicas',
  family: 'Marco operacional',
  category: 'Continuidad del servicio',
  dimension: 'Disponibilidad (ÚNICA dimensión)',
  // Se rige por el NIVEL de la dimension, no por la categoria del sistema: se evalua con `availabilityLevel` de la configuracion global y, si no esta declarado, con el nivel ENS.
  levelDimension: 'D',
  description:
    'op.cont.3 pide probar el plan de continuidad con periodicidad y corregir lo que las pruebas revelen.',
  levels: ['ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
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
