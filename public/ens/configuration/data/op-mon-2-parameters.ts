import { ENSControlConfiguration } from '../types';

// op.mon.2 · Sistema de métricas.
//
// Con los registros de la organización (`/etc/ensfacil/metrics-cycle-register.tsv`
// y el `incident-register.tsv` de op.exp.7) estas tablas dejan de ser almacén y
// pasan a DESCRIBIRLOS: qué periodicidad tienen los ciclos, qué indicadores se
// consolidan, qué partidas entran en cada columna de recursos y quién valida.
// Las celdas que la policy compara (medidas de P-01, indicadores de P-03,
// métricas de P-06) tienen un vocabulario cerrado: cualquier otro texto deja el
// requisito sin evaluar (CONFIGURATION) nombrando la fila.
export const opMon2Configuration: ENSControlConfiguration = {
  controlId: 'op.mon.2',
  controlName: 'Sistema de métricas',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.mon.2',
      name: 'declaracion_aplicabilidad',
      label: 'Declaración de aplicabilidad',
      description:
        'Relación de medidas de seguridad aplicables al sistema según su categoría y los niveles de sus dimensiones: es la base contra la que se calcula el grado de implantación. Una fila por medida, con su identificador del ENS (op.acc.1, mp.info.6, org.1), si aplica (sí/no), el nivel y los refuerzos exigibles. Un identificador que no tenga la forma de una medida del ENS deja op.mon.2.1 sin evaluar, nombrando la fila.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1'],
      type: 'table',
      example: 'op.acc.1 | sí | MEDIO | R1',
      columns: [
        {
          name: 'medida',
          label: 'Medida (identificador del ENS)',
          type: 'string',
          required: true,
        },
        {
          name: 'aplicable',
          label: 'Aplicable',
          type: 'select',
          options: ['sí', 'no'],
          required: true,
        },
        {
          name: 'nivel',
          label: 'Nivel',
          type: 'select',
          options: ['BAJO', 'MEDIO', 'ALTO'],
          required: false,
        },
        {
          name: 'refuerzos_exigibles',
          label: 'Refuerzos exigibles',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'No se configura en Wazuh: es la Declaración de Aplicabilidad del sistema, el parámetro raíz de ENSFácil.',
      ensfacilUsage:
        'El informe de op.mon.2 calcula sobre esta relación, y no sobre el catálogo completo del ENS, el grado de implantación de cada medida aplicable, agregado por marco y global (EV-01, dato del informe sin veredicto). Sin ella op.mon.2.1 no se puede evaluar.',
      evidenceIds: ['EV-01', 'EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede calcular el grado de implantación: op.mon.2.1 queda NO EVALUABLE (causa CONFIGURATION) y el informe del art. 32 sin base.',
    },
    {
      id: 'P-02',
      controlId: 'op.mon.2',
      name: 'periodicidad_calculo_metricas',
      label: 'Periodicidad de los ciclos de métricas',
      description:
        'Cada cuánto se consolida y valida un ciclo de métricas (el informe de ENSFácil que la organización anota en el registro de ciclos), con los días de margen que se admiten tras el fin del periodo y la fecha del cierre anual del informe del artículo 32 (MM-DD). Una sola fila. El plazo del último ciclo es la duración del periodo (mensual 31 días, trimestral 92, semestral 184, anual 366) más el margen.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1', 'op.mon.2.r1.1', 'op.mon.2.r2.1'],
      type: 'table',
      example: 'trimestral | 15 | 12-31',
      columns: [
        {
          name: 'periodicidad',
          label: 'Periodicidad',
          type: 'select',
          options: ['mensual', 'trimestral', 'semestral', 'anual'],
          required: true,
        },
        {
          name: 'margen_dias',
          label: 'Margen (días)',
          type: 'number',
          required: false,
        },
        {
          name: 'cierre_anual',
          label: 'Cierre anual del art. 32 (MM-DD)',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'No se configura en Wazuh. El recolector del manager lee el registro de ciclos (/etc/ensfacil/metrics-cycle-register.tsv) cada 6 h.',
      ensfacilUsage:
        'Convierte la periodicidad en plazo: el último ciclo validado tiene que estar dentro de él (op.mon.2.1), los datos de incidentes se dan por consolidados si el último ciclo lo está (R1, decisión del responsable 7) y los recursos se toman del último ciclo en plazo (R2). La ventana de los indicadores de incidentes es el periodo.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'Ningún requisito se puede evaluar (causa CONFIGURATION): no hay plazo contra el que medir el último ciclo, y sin cadencia se pierde la serie histórica.',
    },
    {
      id: 'P-03',
      controlId: 'op.mon.2',
      name: 'metricas_gestion_incidentes',
      label: 'Indicadores de la gestión de incidentes',
      description:
        'Indicadores del comportamiento de la gestión de incidentes que se consolidan en cada ciclo (R1), conforme a la Instrucción Técnica de Seguridad de Notificación de Incidentes. Solo los que se pueden calcular con el registro de incidentes de op.exp.7: incidentes por tipo y por severidad, tiempos medios de contención y de resolución, notificados al CCN-CERT y notificados a la AEPD. El tiempo medio de detección no está: el registro anota cuándo se registró el incidente, no cuándo empezó; lo mide op.exp.7 cruzando con las alertas.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.2.r1.1'],
      type: 'list',
      example: 'tiempo_medio_resolucion',
      columns: [
        {
          name: 'indicador',
          label: 'Indicador',
          type: 'select',
          options: [
            'incidentes_por_tipo',
            'incidentes_por_severidad',
            'tiempo_medio_contencion',
            'tiempo_medio_resolucion',
            'notificados_ccn_cert',
            'notificados_aepd',
          ],
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'No se configura en Wazuh. El recolector del manager reemite con la etiqueta op.mon.2 el registro de incidentes de op.exp.7 (/etc/ensfacil/incident-register.tsv), sin cambiar su formato.',
      ensfacilUsage:
        'ENSFácil calcula cada indicador con las fases del registro y exige que cada incidente del periodo tenga los datos que el indicador necesita (clasificación, fase inicial, contención anotada, datos personales). Sin incidentes en el periodo, los indicadores valen cero y R1 cumple si el registro existe y el último ciclo está en plazo.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'R1 queda NO EVALUABLE (causa CONFIGURATION): no se sabe qué indicadores consolidar.',
    },
    {
      id: 'P-04',
      controlId: 'op.mon.2',
      name: 'recursos_consumidos_seguridad',
      label: 'Partidas de los recursos consumidos',
      description:
        'Qué entra en cada columna de recursos del registro de ciclos (horas internas, horas externas y presupuesto ejecutado): una fila por partida, con la columna en la que se suma y el criterio con el que se cuenta. Las cifras de cada ciclo las anota la organización en el registro; esta tabla dice de dónde salen. Es información de gestión que no reside en ningún sistema técnico.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.2.r2.1'],
      type: 'table',
      example: 'Personal TIC propio | horas_internas | partes de dedicación al sistema de seguridad',
      columns: [
        {
          name: 'partida',
          label: 'Partida',
          type: 'string',
          required: true,
        },
        {
          name: 'columna',
          label: 'Columna del registro',
          type: 'select',
          options: ['horas_internas', 'horas_externas', 'presupuesto_ejecutado'],
          required: true,
        },
        {
          name: 'criterio',
          label: 'Criterio',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Entrada MANUAL: no se obtiene de Wazuh ni de ningún sistema técnico.',
      ensfacilUsage:
        'ENSFácil exige que cada una de las tres columnas de recursos tenga al menos una partida declarada, y toma las cifras del último ciclo del registro. Se presentan como DATO DECLARADO: la herramienta las registra, no las verifica.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'R2 queda NO EVALUABLE (causa CONFIGURATION): las cifras del registro no tienen un significado declarado.',
    },
    {
      id: 'P-05',
      controlId: 'op.mon.2',
      name: 'responsable_metricas',
      label: 'Responsables de validar las métricas',
      description:
        'Quién valida cada ciclo de métricas antes de su uso en el informe anual del artículo 32 (ámbito «metricas») y quién aporta y valida los datos de recursos (ámbito «recursos»), o los dos («ambos»). La columna validado_por del registro de ciclos tiene que coincidir con el responsable o con el cargo de una fila de su ámbito, sin distinguir mayúsculas ni tildes. Una fila sin ámbito vale para los dos.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1', 'op.mon.2.r2.1'],
      type: 'table',
      example: 'Responsable de Seguridad | RSEG | metricas',
      columns: [
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: true,
        },
        {
          name: 'cargo',
          label: 'Cargo',
          type: 'string',
          required: false,
        },
        {
          name: 'ambito',
          label: 'Ámbito',
          type: 'select',
          options: ['metricas', 'recursos', 'ambos'],
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No se configura en Wazuh.',
      ensfacilUsage:
        'ENSFácil da por validado un ciclo solo si validado_por es un responsable de P-05 de su ámbito: da trazabilidad a un dato que después se reporta fuera de la organización.',
      evidenceIds: ['EV-02', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'op.mon.2.1 y R2 quedan NO EVALUABLES (causa CONFIGURATION): no se sabe quién tiene que validar los ciclos.',
    },
    {
      id: 'P-06',
      controlId: 'op.mon.2',
      name: 'umbrales_objetivo',
      label: 'Objetivos de las métricas',
      description:
        'Valor objetivo de cada métrica, con su tolerancia, que permite interpretar el dato. Métricas: cobertura_monitorizacion (%, como mínimo), implantacion_global (%, como mínimo), controles_no_evaluables (número, como máximo), tiempo_medio_contencion y tiempo_medio_resolucion (horas, como máximo). La tolerancia, en las mismas unidades, se resta del mínimo o se suma al máximo; vacía es 0. Una fila por métrica.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1'],
      type: 'table',
      example: 'cobertura_monitorizacion | 95 | 5',
      columns: [
        {
          name: 'metrica',
          label: 'Métrica',
          type: 'select',
          options: [
            'cobertura_monitorizacion',
            'implantacion_global',
            'controles_no_evaluables',
            'tiempo_medio_contencion',
            'tiempo_medio_resolucion',
          ],
          required: true,
        },
        {
          name: 'objetivo',
          label: 'Objetivo',
          type: 'number',
          required: true,
        },
        {
          name: 'tolerancia',
          label: 'Tolerancia',
          type: 'number',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No se configura en Wazuh.',
      ensfacilUsage:
        'El objetivo de cobertura_monitorizacion decide la fiabilidad de la medición (EV-04, op.mon.2.1): el porcentaje de sistemas del alcance con el agente conectado y todos sus recolectores de ENSFácil al día. Los demás objetivos no deciden nada: el informe presenta cada métrica frente a su objetivo y marca las desviaciones.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'op.mon.2.1 queda NO EVALUABLE (causa CONFIGURATION): sin objetivo de cobertura no se puede decidir si la medición es fiable, y las demás métricas se presentan sin referencia.',
    },
  ],
};
