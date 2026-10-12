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
        'Porcentaje de implantación de cada medida aplicable según la Declaración de Aplicabilidad (P-01), agregado por marco y global, con el resultado que ENSFácil da a cada control. Es salida del motor, no un hecho: va al informe de op.mon.2 sin veredicto, y la serie que acredita que se consolida es EV-02.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.mon.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Serie histórica de los ciclos de métricas',
      description:
        'Registro de ciclos de métricas de la organización (/etc/ensfacil/metrics-cycle-register.tsv): cada vez que se consolida y valida el informe de ENSFácil se anota el periodo, la fecha de consolidación, el grado de implantación global y quién lo validó. El motor solo ve 30 días de hechos, así que la serie trimestral o anual no se puede reconstruir: se acredita con este registro. El último ciclo validado por un responsable de P-05 tiene que estar dentro de la periodicidad de P-02, con la Declaración de Aplicabilidad (P-01) configurada.',
      format: 'json_line',
      events: ['evidence_state', 'metrics_register_read', 'metrics_cycle_recorded'],
      wazuhRuleIds: ['111301', '111302'],
    },
    {
      id: 'EV-03',
      requirement: ['op.mon.2.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Métricas de comportamiento de la gestión de incidentes (R1)',
      description:
        'Indicadores de P-03 calculados con el registro de incidentes de op.exp.7 (/etc/ensfacil/incident-register.tsv, mismo fichero y mismo formato de 13 columnas), reemitido con la etiqueta op.mon.2: incidentes por tipo y por severidad, tiempos medios de contención y de resolución, notificados al CCN-CERT y a la AEPD. Cada incidente del periodo tiene que tener los datos que necesita cada indicador. Sin incidentes en el periodo, los indicadores valen cero y cumple si el registro existe y el último ciclo de métricas está en plazo.',
      format: 'json_line',
      events: ['evidence_state', 'incident_register_read', 'incident_registered'],
      wazuhRuleIds: ['111303', '111304'],
    },
    {
      id: 'EV-04',
      requirement: ['op.mon.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Fiabilidad de la medición',
      description:
        'Cobertura de la monitorización sobre la que se calculan las métricas: de los sistemas del alcance ENS (el grupo ens y el manager), cuántos tienen el agente conectado y todos sus recolectores de ENSFácil al día (su último latido en las 24 h anteriores a la lectura y sin fallar). Se contrasta con el objetivo cobertura_monitorizacion de P-06, menos su tolerancia: un grado de implantación calculado sobre una monitorización incompleta no es un dato sólido.',
      format: 'json_line',
      events: ['evidence_state', 'agent_keepalive_observed', 'collector_heartbeat_observed'],
      wazuhRuleIds: ['111305', '111306'],
    },
    {
      id: 'EV-05',
      requirement: ['op.mon.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Controles no evaluables por falta de parámetros',
      description:
        'Recuento y relación de los controles con requisitos que ENSFácil no puede evaluar porque falta configuración del cliente, con el parámetro que falta en cada caso. Es salida del motor: va al informe de op.mon.2 sin veredicto, frente al objetivo controles_no_evaluables de P-06 si se declara.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.mon.2.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Recursos consumidos por el sistema de seguridad (R2)',
      description:
        'Horas internas, horas externas y presupuesto ejecutado del último ciclo del registro de ciclos de métricas, validados por un responsable de P-05 del ámbito «recursos», con el significado de cada columna declarado en P-04. Es un DATO DECLARADO, no obtenido de Wazuh: la herramienta lo registra y lo presenta junto a las métricas técnicas, pero no lo verifica, y el requisito sale acreditado documentalmente.',
      format: 'json_line',
      events: ['evidence_state', 'metrics_cycle_recorded'],
      wazuhRuleIds: ['111302'],
    },
    {
      id: 'EV-07',
      requirement: ['op.mon.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Datos consolidados para el informe anual del artículo 32',
      description:
        'El conjunto de datos con la estructura del informe anual al que remite op.mon.2.1: grado de implantación, serie de ciclos, fiabilidad de la medición, controles no evaluables, indicadores de incidentes y recursos, cada cifra con su origen. Es la salida del modelo de informe, sin veredicto propio.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'declaracion_aplicabilidad',
      description:
        'Relación de medidas de seguridad aplicables al sistema según su categoría y los niveles de sus dimensiones: es la base contra la que se calcula el grado de implantación. Una fila por medida, con su identificador del ENS (op.acc.1, mp.info.6, org.1), si aplica (sí/no), el nivel y los refuerzos exigibles. Un identificador que no tenga la forma de una medida del ENS deja op.mon.2.1 sin evaluar, nombrando la fila.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1'],
      type: 'table',
      usage:
        'El informe de op.mon.2 calcula sobre esta relación, y no sobre el catálogo completo del ENS, el grado de implantación de cada medida aplicable, agregado por marco y global (EV-01, dato del informe sin veredicto). Sin ella op.mon.2.1 no se puede evaluar.',
      missingBehavior:
        'No se puede calcular el grado de implantación: op.mon.2.1 queda NO EVALUABLE (causa CONFIGURATION) y el informe del art. 32 sin base.',
    },
    {
      id: 'P-02',
      name: 'periodicidad_calculo_metricas',
      description:
        'Cada cuánto se consolida y valida un ciclo de métricas (el informe de ENSFácil que la organización anota en el registro de ciclos), con los días de margen que se admiten tras el fin del periodo y la fecha del cierre anual del informe del artículo 32 (MM-DD). Una sola fila. El plazo del último ciclo es la duración del periodo (mensual 31 días, trimestral 92, semestral 184, anual 366) más el margen.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1', 'op.mon.2.r1.1', 'op.mon.2.r2.1'],
      type: 'table',
      usage:
        'Convierte la periodicidad en plazo: el último ciclo validado tiene que estar dentro de él (op.mon.2.1), los datos de incidentes se dan por consolidados si el último ciclo lo está (R1) y los recursos se toman del último ciclo en plazo (R2). La ventana de los indicadores de incidentes es el periodo.',
      missingBehavior:
        'Ningún requisito se puede evaluar (causa CONFIGURATION): no hay plazo contra el que medir el último ciclo validado. La serie de ciclos sigue en el registro.',
    },
    {
      id: 'P-03',
      name: 'metricas_gestion_incidentes',
      description:
        'Indicadores del comportamiento de la gestión de incidentes que se consolidan en cada ciclo (R1), conforme a la Instrucción Técnica de Seguridad de Notificación de Incidentes. Solo los que se pueden calcular con el registro de incidentes de op.exp.7: incidentes por tipo y por severidad, tiempos medios de contención y de resolución, notificados al CCN-CERT y notificados a la AEPD. El tiempo medio de detección no está: el registro anota cuándo se registró el incidente, no cuándo empezó; lo mide op.exp.7 cruzando con las alertas.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.2.r1.1'],
      type: 'list',
      usage:
        'ENSFácil calcula cada indicador con las fases del registro y exige que cada incidente del periodo tenga los datos que el indicador necesita (clasificación, fase inicial, contención anotada, datos personales). Sin incidentes en el periodo, los indicadores valen cero y R1 cumple si el registro existe y el último ciclo está en plazo.',
      missingBehavior:
        'R1 queda NO EVALUABLE (causa CONFIGURATION): no se sabe qué indicadores consolidar.',
    },
    {
      id: 'P-04',
      name: 'recursos_consumidos_seguridad',
      description:
        'Qué entra en cada columna de recursos del registro de ciclos (horas internas, horas externas y presupuesto ejecutado): una fila por partida, con la columna en la que se suma y el criterio con el que se cuenta. Las cifras de cada ciclo las anota la organización en el registro; esta tabla dice de dónde salen. Es información de gestión que no reside en ningún sistema técnico.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.2.r2.1'],
      type: 'table',
      usage:
        'ENSFácil exige que cada una de las tres columnas de recursos tenga al menos una partida declarada, y toma las cifras del último ciclo del registro. Se presentan como DATO DECLARADO: la herramienta las registra, no las verifica.',
      missingBehavior:
        'R2 queda NO EVALUABLE (causa CONFIGURATION): las cifras del registro no tienen un significado declarado.',
    },
    {
      id: 'P-05',
      name: 'responsable_metricas',
      description:
        'Quién valida cada ciclo de métricas antes de su uso en el informe anual del artículo 32 (ámbito «metricas») y quién aporta y valida los datos de recursos (ámbito «recursos»), o los dos («ambos»). La columna validado_por del registro de ciclos tiene que coincidir con el responsable o con el cargo de una fila de su ámbito, sin distinguir mayúsculas ni tildes. Una fila sin ámbito vale para los dos.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1', 'op.mon.2.r2.1'],
      type: 'table',
      usage:
        'ENSFácil da por validado un ciclo solo si validado_por es un responsable de P-05 de su ámbito: da trazabilidad a un dato que después se reporta fuera de la organización.',
      missingBehavior:
        'op.mon.2.1 y R2 quedan NO EVALUABLES (causa CONFIGURATION): no se sabe quién tiene que validar los ciclos.',
    },
    {
      id: 'P-06',
      name: 'umbrales_objetivo',
      description:
        'Valor objetivo de cada métrica, con su tolerancia, que permite interpretar el dato. Métricas: cobertura_monitorizacion (%, como mínimo), implantacion_global (%, como mínimo), controles_no_evaluables (número, como máximo), tiempo_medio_contencion y tiempo_medio_resolucion (horas, como máximo). La tolerancia, en las mismas unidades, se resta del mínimo o se suma al máximo; vacía es 0. Una fila por métrica.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.2.1'],
      type: 'table',
      usage:
        'El objetivo de cobertura_monitorizacion decide la fiabilidad de la medición (EV-04, op.mon.2.1): el porcentaje de sistemas del alcance con el agente conectado y todos sus recolectores de ENSFácil al día. Los demás objetivos no deciden nada: el informe presenta cada métrica frente a su objetivo y marca las desviaciones.',
      missingBehavior:
        'op.mon.2.1 queda NO EVALUABLE (causa CONFIGURATION): sin objetivo de cobertura no se puede decidir si la medición es fiable, y las demás métricas se presentan sin referencia.',
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
