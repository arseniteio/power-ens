import { ENSControlDefinition } from './types';

export const opExp8CatalogDefinition: ENSControlDefinition = {
  id: 'op.exp.8',
  name: 'Registro de la actividad',
  family: 'Marco operacional',
  category: 'Explotación',
  dimension: 'Trazabilidad (ÚNICA dimensión)',
  // El Anexo II aplica op.exp.8 por el NIVEL de la Trazabilidad, no por la
  // categoría del sistema: se evalúa con `traceabilityLevel` de la configuración
  // global y, si no está declarado, con el nivel ENS.
  levelDimension: 'T',
  description:
    'op.exp.8 es el control que Wazuh cubre de forma más completa y, a la vez, el que exige más rigor en la propia configuración de Wazuh, porque aquí la herramienta no observa el control: la herramienta ES el control.',
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  status: 'ACTIVE',
  version: '1.0.0',
  requirements: [
    {
      id: 'op.exp.8.1',
      title: 'Registro de auditoría con los campos mínimos',
      description:
        'Se generará un registro de auditoría, que incluirá, al menos, el identificador del usuario o entidad asociado al evento, fecha y hora, sobre qué información se realiza el evento, tipo de evento y el resultado del evento (fallo o éxito), según la política de seguridad y los procedimientos asociados a la misma.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-13'],
      parameterIds: ['P-01', 'P-03'],
    },
    {
      id: 'op.exp.8.2',
      title: 'Registros de actividad activos en los servidores',
      description:
        'Se activarán los registros de actividad en los servidores.',
      kind: 'BASE',
      applicability: {
        levels: ['BAJO', 'MEDIO', 'ALTO'],
      },
      evidenceIds: ['EV-02', 'EV-04'],
      parameterIds: ['P-02', 'P-12'],
    },
    {
      id: 'op.exp.8.r1.1',
      title: 'Revisión periódica de los registros (R1)',
      description:
        'Se revisarán informalmente, de forma periódica, los registros de actividad, buscando patrones anormales.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-05'],
      parameterIds: ['P-04'],
    },
    {
      id: 'op.exp.8.r2.1',
      title: 'Referencia de tiempo sincronizada y protegida (R2)',
      description:
        'El sistema deberá disponer de una referencia de tiempo (timestamp) para facilitar las funciones de registro de eventos y auditoría. La modificación de la referencia de tiempo del sistema será una función de administración y, en caso de realizarse su sincronización con otros dispositivos, deberán utilizarse mecanismos de autenticación e integridad.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-06'],
      parameterIds: ['P-05', 'P-06'],
    },
    {
      id: 'op.exp.8.r3.1',
      title: 'Eventos auditados y retención documentados (R3)',
      description:
        'En la documentación de seguridad del sistema se deberán indicar los eventos de seguridad que serán auditados y el tiempo de retención de los registros antes de ser eliminados.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-07'],
      parameterIds: ['P-01', 'P-07'],
    },
    {
      id: 'op.exp.8.r4.1',
      title: 'Acceso a los registros solo para personal autorizado (R4)',
      description:
        'Los registros de actividad y, en su caso, las copias de seguridad de los mismos, solamente podrán ser accedidos o eliminarse por personal debidamente autorizado.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['MEDIO', 'ALTO'],
        reason:
          'Exigible en MEDIO y ALTO. Para BAJO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-08', 'EV-09', 'EV-13'],
      parameterIds: ['P-08', 'P-09'],
    },
    {
      id: 'op.exp.8.r5.1',
      title: 'Análisis de la actividad en busca de compromisos (R5)',
      description:
        'El sistema deberá implementar herramientas para analizar y revisar la actividad del sistema y la información de auditoría, en búsqueda de comprometimientos de la seguridad posibles o reales.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-10'],
      parameterIds: ['P-10'],
    },
    {
      id: 'op.exp.8.r5.2',
      title: 'Recolección, correlación y respuesta automáticas (R5)',
      description:
        'Se dispondrá de un sistema automático de recolección de registros, correlación de eventos y respuesta automática ante los mismos.',
      kind: 'REFUERZO',
      applicability: {
        levels: ['ALTO'],
        reason:
          'Exigible en ALTO. Para BAJO y MEDIO debe mostrarse como NO_APLICA.',
      },
      evidenceIds: ['EV-11', 'EV-12'],
      parameterIds: ['P-11'],
    },
  ],
};
