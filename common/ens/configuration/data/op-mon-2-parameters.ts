import { ENSControlConfiguration } from '../types';

// op.mon.2 · Metrics system.
// With the organization's registers (`/etc/power-ens/metrics-cycle-register.tsv` and op.exp.7's
// `incident-register.tsv`), these tables DESCRIBE them instead of storing: cycle periodicity, consolidated
// indicators, items in each resource column and who validates. The cells the policy compares (measures of P-01,
// indicators of P-03, metrics of P-06) have a closed vocabulary: any other text leaves the requirement
// unevaluated (CONFIGURATION), naming the row.
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
        'Medidas de seguridad aplicables según la categoría y los niveles de las dimensiones: base del grado de implantación. Una fila por medida con su identificador del ENS (op.acc.1, mp.info.6, org.1), si aplica (sí/no), el nivel y los refuerzos; un identificador con forma no válida deja op.mon.2.1 sin evaluar nombrando la fila.',
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
        'No se configura en Wazuh: es la Declaración de Aplicabilidad del sistema, el parámetro raíz de Power ENS.',
      powerEnsUsage:
        'El informe de op.mon.2 calcula sobre esta relación, no sobre todo el catálogo del ENS, el grado de implantación de cada medida aplicable, por marco y global (EV-01, dato sin veredicto).',
      evidenceIds: ['EV-01', 'EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'op.mon.2.1 NO EVALUABLE (causa CONFIGURATION): no se calcula el grado de implantación y el informe del art. 32 queda sin base.',
    },
    {
      id: 'P-02',
      controlId: 'op.mon.2',
      name: 'periodicidad_calculo_metricas',
      label: 'Periodicidad de los ciclos de métricas',
      description:
        'Cada cuánto se consolida y valida un ciclo de métricas (anotado en el registro de ciclos), con los días de margen tras el fin del periodo y la fecha de cierre anual del informe del artículo 32 (MM-DD); una sola fila. El plazo del último ciclo es la duración del periodo (mensual 31, trimestral 92, semestral 184, anual 366 días) más el margen.',
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
        'No se configura en Wazuh. El recolector del manager lee el registro de ciclos (/etc/power-ens/metrics-cycle-register.tsv) cada 6 h.',
      powerEnsUsage:
        'Convierte la periodicidad en plazo: el último ciclo validado debe estar dentro (op.mon.2.1), los datos de incidentes se dan por consolidados si el último ciclo lo está (R1) y los recursos salen del último ciclo en plazo (R2). La ventana de los indicadores de incidentes es el periodo.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'Ningún requisito se evalúa (causa CONFIGURATION): no hay plazo contra el que medir el último ciclo ni serie histórica.',
    },
    {
      id: 'P-03',
      controlId: 'op.mon.2',
      name: 'metricas_gestion_incidentes',
      label: 'Indicadores de la gestión de incidentes',
      description:
        'Indicadores de la gestión de incidentes que se consolidan en cada ciclo (R1), conforme a la ITS de Notificación de Incidentes. Solo los calculables con el registro de incidentes de op.exp.7: incidentes por tipo y severidad, tiempos medios de contención y resolución, notificados al CCN-CERT y a la AEPD. El tiempo medio de detección no está: el registro anota cuándo se registró el incidente, no cuándo empezó; lo mide op.exp.7 con las alertas.',
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
        'No se configura en Wazuh. El recolector del manager reemite con la etiqueta op.mon.2 el registro de incidentes de op.exp.7 (/etc/power-ens/incident-register.tsv), sin cambiar su formato.',
      powerEnsUsage:
        'Calcula cada indicador con las fases del registro y exige que cada incidente del periodo tenga los datos necesarios (clasificación, fase inicial, contención, datos personales). Sin incidentes los indicadores valen cero y R1 cumple si el registro existe y el último ciclo está en plazo.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE (causa CONFIGURATION): no se sabe qué indicadores consolidar.',
    },
    {
      id: 'P-04',
      controlId: 'op.mon.2',
      name: 'recursos_consumidos_seguridad',
      label: 'Partidas de los recursos consumidos',
      description:
        'Qué entra en cada columna de recursos del registro de ciclos (horas internas, horas externas, presupuesto ejecutado): una fila por partida, con la columna donde se suma y el criterio de cómputo. Las cifras de cada ciclo las anota la organización: es información de gestión que no está en ningún sistema técnico.',
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
      powerEnsUsage:
        'Exige que cada una de las tres columnas tenga al menos una partida y toma las cifras del último ciclo. Se presentan como DATO DECLARADO: se registran, no se verifican.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'R2 NO EVALUABLE (causa CONFIGURATION): las cifras del registro no tienen significado declarado.',
    },
    {
      id: 'P-05',
      controlId: 'op.mon.2',
      name: 'responsable_metricas',
      label: 'Responsables de validar las métricas',
      description:
        'Quién valida cada ciclo de métricas antes del informe anual del artículo 32 (ámbito «metricas»), quién aporta y valida los recursos («recursos») o ambos («ambos»; sin ámbito vale para ambos). validado_por del registro debe coincidir con el responsable o cargo de una fila de su ámbito, sin distinguir mayúsculas ni tildes.',
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
      powerEnsUsage:
        'Da un ciclo por validado solo si validado_por es un responsable de P-05 de su ámbito: da trazabilidad a un dato que se reporta fuera de la organización.',
      evidenceIds: ['EV-02', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'op.mon.2.1 y R2 NO EVALUABLES (causa CONFIGURATION): no se sabe quién debe validar los ciclos.',
    },
    {
      id: 'P-06',
      controlId: 'op.mon.2',
      name: 'umbrales_objetivo',
      label: 'Objetivos de las métricas',
      description:
        'Objetivo y tolerancia de cada métrica, una fila por métrica: cobertura_monitorizacion e implantacion_global (%, mínimo), controles_no_evaluables (número, máximo), tiempo_medio_contencion y tiempo_medio_resolucion (horas, máximo). La tolerancia, en las mismas unidades, se resta del mínimo o se suma al máximo; vacía es 0.',
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
      powerEnsUsage:
        'El objetivo de cobertura_monitorizacion decide la fiabilidad de la medición (EV-04, op.mon.2.1): porcentaje de sistemas del alcance con el agente conectado y todos sus recolectores de Power ENS al día. Los demás no deciden nada: el informe presenta cada métrica frente a su objetivo y marca las desviaciones.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'op.mon.2.1 NO EVALUABLE (causa CONFIGURATION): sin objetivo de cobertura no se decide si la medición es fiable y las demás métricas se presentan sin referencia.',
    },
  ],
};
