import { ENSControl } from '../types';

export const opMon2Control: ENSControl = {
  id: 'op.mon.2',
  title: 'Sistema de métricas',
  framework: 'ENS',
  category: 'Monitorización del sistema',
  family: 'Marco operacional',
  dimension: 'Todas',
  scope: {
    activeLevels: ['BAJO', 'MEDIO', 'ALTO'],
    declaredLevels: ['BAJO', 'MEDIO', 'ALTO'],
    highLevelStatus: 'NO_EVALUABLE',
  },
  expectedResult: {
    bajo: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.mon.2 → Requisito base: op.mon.2.1',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.mon.2 + R1 + R2 → Base + métricas de gestión de incidentes + métricas de recursos consumidos',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.mon.2 + R1 + R2 → Ídem categoría MEDIA. No hay exigencia adicional en ALTA.',
    },
  },
  requirements: [
    {
      id: 'op.mon.2.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Datos del grado de implantación y del informe del art. 32',
      description:
        'Atendiendo a la categoría de seguridad del sistema, se recopilarán los datos necesarios para conocer el grado de implantación de las medidas de seguridad que resulten aplicables y, en su caso, para proveer el informe anual requerido por el artículo 32.',
      evidences: ['EV-02', 'EV-04'],
    },
    {
      id: 'op.mon.2.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Datos del comportamiento de la gestión de incidentes (R1)',
      description:
        'Se recopilarán los datos precisos que posibiliten evaluar el comportamiento del sistema de gestión de incidentes, de acuerdo con la Instrucción Técnica de Seguridad de Notificación de Incidentes de Seguridad y con la correspondiente guía CCN-STIC.',
      evidences: ['EV-03'],
    },
    {
      id: 'op.mon.2.r2.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Datos de eficiencia: horas y presupuesto (R2)',
      description:
        'Se recopilarán los datos precisos para conocer la eficiencia del sistema de seguridad, en relación con los recursos consumidos, en términos de horas y presupuesto.',
      evidences: ['EV-06'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.mon.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Grado de implantación de las medidas de seguridad',
      description:
        'Cálculo del porcentaje de implantación de cada medida aplicable según P-01, agregado por marco, por categoría y global. Es la métrica central del requisito base y el subproducto natural de la evaluación que ENSFácil realiza control por control.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.mon.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Serie histórica y tendencia de implantación',
      description:
        'Evolución del grado de implantación a lo largo de los períodos de P-02, que permite distinguir un sistema que mejora de uno que se degrada. Es el dato que da sentido a la métrica: un 87 % de implantación significa cosas muy distintas si viene del 70 % o del 95 %.',
      format: 'json_line',
      events: ['evidence_state', 'metrics_register_read', 'metrics_cycle_recorded'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.mon.2.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Métricas de comportamiento de la gestión de incidentes (R1)',
      description:
        'Consolidación de los indicadores de P-03: número de incidentes por tipo y severidad, tiempos medios de detección, contención y resolución, proporción de alertas que derivaron en incidente, incidentes notificados al CCN-CERT y a la AEPD.',
      format: 'json_line',
      events: ['evidence_state', 'incident_register_read', 'incident_registered'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.mon.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cobertura de la monitorización como métrica',
      description:
        'Indicadores de la propia capacidad de medición: porcentaje de sistemas con agente activo, continuidad de la ingesta, categorías de evento cubiertas, parámetros de configuración cumplimentados. Mide la fiabilidad del resto de las métricas.',
      format: 'json_line',
      events: ['evidence_state', 'agent_keepalive_observed', 'collector_heartbeat_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.mon.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Controles no evaluables por falta de parámetros',
      description:
        'Recuento y relación de controles que ENSFácil no puede evaluar porque faltan parámetros de configuración del cliente. Es una métrica incómoda pero muy útil: convierte la deuda de configuración en un número que se puede reducir y seguir en el tiempo.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.mon.2.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Recursos consumidos por el sistema de seguridad (R2)',
      description:
        'Registro de las horas de dedicación y del presupuesto ejecutado aportados por el cliente conforme a P-04. NO es una evidencia obtenida de Wazuh: es un dato de gestión que la herramienta recoge, conserva y presenta junto a las métricas técnicas para completar el cuadro.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.mon.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Datos consolidados para el informe anual del artículo 32',
      description:
        'Conjunto de datos preparado con la estructura que requiere el informe anual al que remite op.mon.2.1, listo para su uso sin reelaboración. Es la salida de mayor valor práctico de este control.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'declaracion_aplicabilidad',
      description:
        'Relación de medidas de seguridad aplicables al sistema según su categoría y los niveles de sus dimensiones, que es la base contra la que se mide el grado de implantación. Es la Declaración de Aplicabilidad del sistema.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1'],
      type: 'table',
      usage:
        'Es el parámetro raíz de todo ENSFácil, no solo de este control: define qué controles hay que evaluar. El grado de implantación se calcula sobre esta relación, no sobre el catálogo completo del ENS.',
      missingBehavior:
        'No se puede calcular el grado de implantación. op.mon.2.1 NO EVALUABLE y el informe del art. 32 sin base.',
    },
    {
      id: 'P-02',
      name: 'periodicidad_calculo_metricas',
      description:
        'Cada cuánto se consolidan y publican las métricas de implantación. El ENS no fija periodicidad para el cálculo interno, pero el informe del artículo 32 es anual, de modo que conviene una cadencia que permita corregir antes del cierre.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1', 'op.mon.2.r1.1', 'op.mon.2.r2.1'],
      type: 'table',
      usage:
        'Configura la generación automática de los cuadros de métricas de ENSFácil y la serie histórica. Una cadencia trimestral permite ver tendencia y llegar al cierre anual sin sorpresas.',
      missingBehavior:
        'Se calcula solo a demanda. Se pierde la serie histórica, que es lo que permite demostrar mejora.',
    },
    {
      id: 'P-03',
      name: 'metricas_gestion_incidentes',
      description:
        'Indicadores de comportamiento del sistema de gestión de incidentes exigidos por R1, conforme a la Instrucción Técnica de Seguridad de Notificación de Incidentes y a la guía CCN-STIC correspondiente.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.2.r1.1'],
      type: 'list',
      usage:
        'ENSFácil calcula estos indicadores a partir de los datos de op.exp.7 y op.exp.9 sin trabajo adicional: la conciliación alerta–incidente y los tiempos de respuesta ya se miden allí. Aquí solo se consolidan con el formato que exige la ITS.',
      missingBehavior:
        'R1 NO EVALUABLE. Los datos existen en op.exp.7 pero no se consolidan en el formato exigido.',
    },
    {
      id: 'P-04',
      name: 'recursos_consumidos_seguridad',
      description:
        'Horas de dedicación y presupuesto consumidos por el sistema de seguridad, exigidos por R2. Es información de gestión y contabilidad que no reside en ningún sistema técnico y que el cliente debe aportar.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.2.r2.1'],
      type: 'table',
      usage:
        'Entrada MANUAL en ENSFácil. La herramienta la recoge, la conserva en serie y la presenta junto a las métricas técnicas, de modo que el informe sea completo, pero no puede obtenerla ni verificarla. Conviene decirlo con claridad al cliente desde el principio.',
      missingBehavior:
        'R2 NO EVALUABLE. Es el refuerzo que con más frecuencia queda sin cubrir por no ser de naturaleza técnica.',
    },
    {
      id: 'P-05',
      name: 'responsable_metricas',
      description:
        'Responsable de consolidar y validar las métricas antes de su uso en el informe anual del artículo 32, y de aportar los datos de recursos de P-04.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1', 'op.mon.2.r2.1'],
      type: 'table',
      usage:
        'ENSFácil registra la validación de cada ciclo de métricas con su responsable y fecha, lo que da trazabilidad al dato que después se reporta externamente.',
      missingBehavior:
        'Las métricas no tienen validación formal. El dato reportado en el informe anual queda sin responsable identificado.',
    },
    {
      id: 'P-06',
      name: 'umbrales_objetivo',
      description:
        'Valores objetivo o umbrales de aceptación para cada métrica, que permiten interpretar el dato. Una métrica sin umbral informa pero no permite decidir si el resultado es aceptable.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1'],
      type: 'table',
      usage:
        'ENSFácil presenta cada métrica con su objetivo y marca las desviaciones. Convierte el cuadro de métricas en una herramienta de gestión y no en una colección de cifras.',
      missingBehavior:
        'Las métricas se presentan sin referencia de aceptabilidad. Pierden utilidad para la toma de decisiones.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'metrics_register_read', 'metrics_cycle_recorded', 'incident_register_read', 'incident_registered', 'agent_keepalive_observed', 'collector_heartbeat_observed'],
  presentationRules: {
    auditorSees: [
      'control ENS',
      'evidence ID',
      'description',
      'level',
      'status',
      'score',
      'finding',
    ],
    internalTraceability: [
      'wazuh rule.id',
      'technical event',
      'agent',
      'timestamp',
    ],
    neverShowAsControls: ['rule id as control'],
  },
};
