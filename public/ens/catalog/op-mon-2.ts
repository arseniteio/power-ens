import { ENSControlDefinition } from './types';

export const opMon2CatalogDefinition: ENSControlDefinition = {
  id: 'op.mon.2',
  name: 'Sistema de métricas',
  family: 'Marco operacional',
  category: 'Monitorización del sistema',
  dimension: 'Todas',
  // Se mide SOLO en el manager: los dos registros de la organización viven en
  // su /etc/ensfacil/, y la base de agentes y los latidos de todos los
  // recolectores (alerts.json) están en el sistema central. Su resultado es el
  // de la fila del manager (000).
  measurementPlanes: ['manager'],
  description:
    'op.mon.2 pide medir tres cosas: el grado de implantación de las medidas de seguridad, el comportamiento del sistema de gestión de incidentes y los recursos consumidos por el sistema de seguridad.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  // Es un METACONTROL (spec 2026-10-09 §2). El grado de implantación de todos
  // los controles (EV-01), los grises (EV-05) y los datos del informe del
  // art. 32 (EV-07) son salida del motor: van al modelo de informe, sin
  // veredicto, y quedan en el catálogo sin requisito que los juzgue. Los
  // requisitos se deciden con lo que deja huella en el manager: los ciclos de
  // métricas anotados y validados (EV-02), la fiabilidad de la medición
  // (EV-04), el registro de incidentes de op.exp.7 (EV-03) y los recursos del
  // último ciclo (EV-06, dato declarado).
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
      // Dato declarado: la policy marca su CUMPLE como acreditado
      // documentalmente (`attested`). La herramienta lo registra, no lo
      // verifica.
      evidenceIds: ['EV-06'],
      parameterIds: ['P-02', 'P-04', 'P-05'],
    },
  ],
};
