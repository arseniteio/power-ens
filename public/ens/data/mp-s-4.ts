import { ENSControl } from '../types';

export const mpS4Control: ENSControl = {
  id: 'mp.s.4',
  title: 'Protección frente a la denegación de servicio',
  framework: 'ENS',
  category: 'Protección de los servicios',
  family: 'Medidas de protección',
  dimension: 'Disponibilidad (ÚNICA dimensión)',
  scope: {
    activeLevels: ['MEDIO', 'ALTO'],
    declaredLevels: ['MEDIO', 'ALTO'],
    highLevelStatus: 'NO_EVALUABLE',
  },
  expectedResult: {
    bajo: {
      status: 'NO_APLICA',
      score: 0,
      condition:
        'La medida no es exigible en nivel BAJO (Anexo II, RD 311/2022).',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.s.4 → Requisitos base: mp.s.4.1 + mp.s.4.2',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.s.4 + R1 → Base + sistema de detección y tratamiento + procedimientos de reacción',
    },
  },
  requirements: [
    {
      id: 'mp.s.4.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Capacidad suficiente y con holgura para la carga prevista',
      description:
        'Se planificará y dotará al sistema de capacidad suficiente para atender con holgura a la carga prevista.',
      evidences: ['EV-01', 'EV-04', 'EV-10'],
    },
    {
      id: 'mp.s.4.2',
      level: ['MEDIO', 'ALTO'],
      title: 'Tecnologías de prevención de ataques conocidos',
      description:
        'Se desplegarán tecnologías para prevenir los ataques conocidos.',
      evidences: ['EV-02', 'EV-04', 'EV-10'],
    },
    {
      id: 'mp.s.4.r1.1',
      level: ['ALTO'],
      title: 'Detección y tratamiento de la denegación de servicio',
      description:
        'Se establecerá un sistema de detección y tratamiento de ataques de denegación de servicio (DoS y DDoS).',
      evidences: ['EV-03', 'EV-04', 'EV-07', 'EV-10'],
      active: false,
    },
    {
      id: 'mp.s.4.r1.2',
      level: ['ALTO'],
      title: 'Procedimientos de reacción con el proveedor de comunicaciones',
      description:
        'Se establecerán procedimientos de reacción a los ataques, incluyendo la comunicación con el proveedor de comunicaciones.',
      evidences: ['EV-05', 'EV-06'],
      active: false,
    },
    {
      id: 'mp.s.4.r2.1',
      level: [],
      title: 'Detección y bloqueo de ataques lanzados desde las propias instalaciones',
      description:
        'Refuerzo R2 – Ataques propios: Se detectará y se evitará el lanzamiento de ataques desde las propias instalaciones perjudicando a terceros.',
      evidences: ['EV-08', 'EV-09'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.s.4.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Carga real frente a la capacidad dotada',
      description:
        'Medición continua de la carga de los servicios de P-01 —peticiones por segundo, conexiones concurrentes, consumo de recursos— contrastada con la carga prevista y la capacidad de P-02. Acredita la holgura que exige mp.s.4.1, que de otro modo queda como declaración de dimensionamiento.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.s.4.2'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Tecnologías de prevención desplegadas y su configuración',
      description:
        'Verificación de las tecnologías de P-03 que sean comprobables desde el sistema: limitación de tasa en el proxy o servidor web, protección de la pila de red frente a inundación de conexiones, límites de conexiones concurrentes, tiempos de espera. Acredita mp.s.4.2 en su parte local.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.s.4.r1.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Detección temprana de saturación del servicio',
      description:
        'Identificación de patrones compatibles con denegación de servicio según los umbrales de P-04 y la línea base de P-07: tasa de peticiones anómala, agotamiento de conexiones, degradación de tiempos de respuesta, incremento de la tasa de error. Es la aportación principal de Wazuh a este control.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-04',
      requirement: ['mp.s.4.1', 'mp.s.4.2', 'mp.s.4.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Medición del impacto del ataque en la disponibilidad',
      description:
        'Cuantificación del efecto de cada episodio sobre los servicios de P-01: tiempo de indisponibilidad total o parcial, tasa de error durante el ataque, grado de degradación del tiempo de respuesta. Es la evidencia que convierte un incidente en un dato.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.s.4.r1.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Caracterización del ataque para la comunicación al proveedor',
      description:
        'Recopilación de los datos técnicos del episodio que el proveedor necesita para mitigar: rangos de origen, protocolos y puertos implicados, vector empleado, volumen y distribución temporal. Da soporte material a la comunicación que exige mp.s.4.r1.2.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-06',
      requirement: ['mp.s.4.r1.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Activación del procedimiento de reacción',
      description:
        'Verificación de que cada episodio detectado activó el procedimiento de P-05 y, cuando procedía, la comunicación al proveedor de P-06, con los tiempos de cada paso. mp.s.4.r1.2 exige procedimientos de reacción, lo que implica poder acreditar su aplicación.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-07',
      requirement: ['mp.s.4.r1.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Medidas de contención automática aplicadas',
      description:
        'Acciones automáticas ejecutadas ante la detección: bloqueo de rangos de origen, activación de limitación de tasa más estricta, desvío de tráfico. Da soporte al tratamiento que exige mp.s.4.r1.1 y acorta el tiempo de reacción.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-08',
      requirement: ['mp.s.4.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Tráfico saliente anómalo: ataques desde las propias instalaciones (R2)',
      description:
        'Detección de volumen de tráfico saliente muy superior a la línea base, conexiones masivas desde equipos propios hacia un mismo destino externo, o patrones compatibles con participación en una red de bots. Cubre la primera parte de R2.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['mp.s.4.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Servicios propios usados como amplificadores (R2)',
      description:
        'Detección de servicios propios expuestos que pueden emplearse para amplificar ataques contra terceros: resolución recursiva abierta, servicios de sincronización horaria respondiendo a consultas externas, servicios de descubrimiento accesibles desde internet.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-10',
      requirement: ['mp.s.4.1', 'mp.s.4.2', 'mp.s.4.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Histórico de episodios y evolución',
      description:
        'Registro de todos los episodios del período con su fecha, duración, vector, impacto y respuesta aplicada, con la evolución entre períodos. Permite valorar si la protección mejora y si el dimensionamiento de P-02 sigue siendo adecuado.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'servicios_expuestos',
      description:
        'Servicios del sistema expuestos a redes públicas, susceptibles de sufrir denegación de servicio, con su criticidad y los objetivos de disponibilidad comprometidos.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.s.4.1', 'mp.s.4.2'],
      type: 'table',
      usage:
        'Define el alcance.',
      missingBehavior:
        'El control es NO EVALUABLE. No se sabe qué servicios proteger ni sobre cuáles medir el impacto.',
    },
    {
      id: 'P-02',
      name: 'carga_prevista',
      description:
        'Carga prevista por servicio y capacidad dotada, con el margen de holgura. mp.s.4.1 exige atender «con holgura» a la carga prevista, de modo que hay que haber dimensionado ambas cosas.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.s.4.1'],
      type: 'table',
      usage:
        'ENSFácil compara la carga real observada con la prevista y con la capacidad, y alerta cuando la utilización se aproxima al límite. Un servicio operando habitualmente al 85 % de su capacidad no atiende con holgura, aunque nunca haya caído.',
      missingBehavior:
        'mp.s.4.1 NO EVALUABLE. No hay referencia de carga prevista ni de capacidad contra la que medir la holgura.',
    },
    {
      id: 'P-03',
      name: 'tecnologias_prevencion',
      description:
        'Tecnologías desplegadas para prevenir los ataques conocidos que exige mp.s.4.2: limitación de tasa, protección del proveedor, servicio de mitigación, balanceo, protección contra inundación de conexiones, filtrado de tráfico anómalo.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.s.4.2'],
      type: 'table',
      usage:
        'ENSFácil verifica la configuración de lo que sea verificable desde el sistema —limitación de tasa, protección de pila de red— y recoge como declaración lo que opera en el proveedor. Mide además su eficacia a partir de los bloqueos registrados.',
      missingBehavior:
        'mp.s.4.2 NO ACREDITADO. No consta qué tecnologías previenen los ataques conocidos ni si operan.',
    },
    {
      id: 'P-04',
      name: 'umbrales_deteccion_dos',
      description:
        'Umbrales a partir de los cuales se considera que puede haber un ataque de denegación de servicio: tasa de peticiones, conexiones concurrentes, tiempo de respuesta, tasa de error, ancho de banda consumido.',
      level: ['ALTO'],
      requirements: ['mp.s.4.r1.1'],
      type: 'table',
      usage:
        'Configura las reglas de detección. Lo más robusto es definir los umbrales como múltiplo de la línea base observada y no como valor absoluto, porque la carga normal varía con el tiempo.',
      missingBehavior:
        'R1 NO EVALUABLE y es obligatorio en nivel ALTO. La saturación se detecta cuando el servicio ya ha caído.',
    },
    {
      id: 'P-05',
      name: 'procedimiento_reaccion',
      description:
        'Procedimiento de reacción a los ataques con las acciones previstas, los responsables y los plazos. mp.s.4.r1.2 lo exige en nivel ALTO.',
      level: ['ALTO'],
      requirements: ['mp.s.4.r1.2'],
      type: 'string',
      usage:
        'ENSFácil correlaciona cada detección con la activación del procedimiento y con la apertura del incidente en op.exp.7, y mide los tiempos. Procedimiento declarado sin activación registrada ante un ataque → hallazgo.',
      missingBehavior:
        'R1 parcialmente NO EVALUABLE. Puede haber detección sin respuesta pautada.',
    },
    {
      id: 'P-06',
      name: 'contacto_proveedor_comunicaciones',
      description:
        'Datos de contacto y vía de escalado al proveedor de comunicaciones para la mitigación, con el procedimiento y los plazos comprometidos. mp.s.4.r1.2 menciona expresamente la comunicación con el proveedor como parte del procedimiento de reacción.',
      level: ['ALTO'],
      requirements: ['mp.s.4.r1.2'],
      type: 'string',
      usage:
        'ENSFácil recoge la declaración y verifica que ante los ataques detectados consta la comunicación al proveedor y en qué plazo. Es el extremo del requisito que con más frecuencia se descubre ausente precisamente cuando hace falta.',
      missingBehavior:
        'R1 incompleto. La parte del procedimiento que depende del proveedor queda sin acreditar.',
    },
    {
      id: 'P-07',
      name: 'linea_base_trafico',
      description:
        'Patrón de tráfico y de carga normal por servicio y franja horaria, que sirve de referencia para detectar desviaciones. Es la base de los umbrales relativos de P-04.',
      level: ['ALTO'],
      requirements: ['mp.s.4.r1.1'],
      type: 'string',
      usage:
        'ENSFácil puede calcular la línea base a partir del histórico ingerido y proponerla. Permite detectar tanto la saturación como el patrón anómalo de bajo volumen, que es el de los ataques de agotamiento de recursos y pasa inadvertido con umbrales absolutos.',
      missingBehavior:
        'La detección depende de umbrales absolutos, que producen falsos positivos en picos legítimos y pasan por alto ataques lentos.',
    },
    {
      id: 'P-08',
      name: 'deteccion_ataques_salientes',
      description:
        'Indicadores para detectar el lanzamiento de ataques desde las propias instalaciones: volumen de tráfico saliente anómalo, conexiones masivas a un mismo destino externo, servicios propios usados como amplificadores. Corresponde a R2, no obligatorio en ningún nivel.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.s.4.r2.1'],
      type: 'list',
      usage:
        'Es el refuerzo con mejor cobertura de Wazuh en este control: el tráfico saliente anómalo y los servicios propios usados como amplificadores son detecciones directas de host y de perímetro. Conviene ofrecerlo aunque no sea exigible.',
      missingBehavior:
        'R2 sin cubrir. Riesgo de que la organización figure como origen de un ataque a terceros sin saberlo.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot'],
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
