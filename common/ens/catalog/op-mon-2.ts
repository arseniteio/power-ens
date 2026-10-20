import { ENSControlDefinition } from './types';

export const opMon2CatalogDefinition: ENSControlDefinition = {
  id: 'op.mon.2',
  name: 'Sistema de métricas',
  family: 'Marco operacional',
  category: 'Monitorización del sistema',
  dimension: 'Todas',
  // Measured ONLY on the manager: the two organisation registers live in its /etc/ensfacil/, and the agent base and all collectors' heartbeats (alerts.json) are in the central system. Result is the manager row's (000).
  measurementPlanes: ['manager'],
  description:
    'op.mon.2 pide medir tres cosas: el grado de implantación de las medidas de seguridad, el comportamiento del sistema de gestión de incidentes y los recursos consumidos por el sistema de seguridad.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  annexSection: '4.7.2',
  source: { template: 'ENSFacil_Plantilla_op.mon.2', version: '2.0', date: '2026-10-15' },
  status: 'ACTIVE',
  version: '1.0.0',
  // A METACONTROL. The implementation degree of all controls (EV-01), the greys (EV-05) and the art. 32 report data (EV-07) are engine output: they go to the report model without verdict, with no requirement judging them. Requirements are decided with what leaves a trace on the manager:
  // validated metrics cycles (EV-02), measurement reliability (EV-04), the op.exp.7 incident register (EV-03) and the last cycle's resources (EV-06, declared datum).
  requirements: [
    {
      id: 'op.mon.2.1',
      title: 'Datos del grado de implantación y del informe del art. 32',
      description:
        'Atendiendo a la categoría de seguridad del sistema, se recopilarán los datos necesarios para conocer el grado de implantación de las medidas de seguridad que resulten aplicables y, en su caso, para proveer el informe anual requerido por el artículo 32.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02', 'EV-04'],
      parameterIds: ['P-01', 'P-02', 'P-05', 'P-06'],
    },
    {
      id: 'op.mon.2.r1.1',
      title: 'Datos del comportamiento de la gestión de incidentes (R1)',
      description:
        'Se recopilarán los datos precisos que posibiliten evaluar el comportamiento del sistema de gestión de incidentes, de acuerdo con la Instrucción Técnica de Seguridad de Notificación de Incidentes de Seguridad y con la correspondiente guía CCN-STIC.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIA y ALTA. En categoría BÁSICA no aplica.',
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-02', 'P-03'],
    },
    {
      id: 'op.mon.2.r2.1',
      title: 'Datos de eficiencia: horas y presupuesto (R2)',
      description:
        'Se recopilarán los datos precisos para conocer la eficiencia del sistema de seguridad, en relación con los recursos consumidos, en términos de horas y presupuesto.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIA y ALTA. En categoría BÁSICA no aplica.',
      },
      // Declared datum: the policy marks its CUMPLE as documentary (`attested`). The tool records it, does not verify it.
      evidenceIds: ['EV-06'],
      parameterIds: ['P-02', 'P-04', 'P-05'],
    },
  ],
};
