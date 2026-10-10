import { ENSControl } from '../types';

export const opMon1Control: ENSControl = {
  id: 'op.mon.1',
  title: 'Detección de intrusión',
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
        'op.mon.1 → Requisito base: op.mon.1.1',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.mon.1 + R1 → Base + detección o prevención basada en reglas',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.mon.1 + R1 + R2 → Base + R1 + procedimientos de respuesta a las alertas',
    },
  },
  requirements: [
    {
      id: 'op.mon.1.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Herramientas de detección o prevención de intrusiones',
      description:
        'Se dispondrá de herramientas de detección o prevención de intrusiones.',
      evidences: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05'],
    },
    {
      id: 'op.mon.1.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Detección basada en reglas (R1)',
      description:
        'El sistema dispondrá de herramientas de detección o prevención de intrusiones basadas en reglas.',
      evidences: ['EV-01', 'EV-08'],
    },
    {
      id: 'op.mon.1.r2.1',
      level: ['ALTO'],
      title: 'Procedimientos de respuesta a las alertas (R2)',
      description:
        'Existirán procedimientos de respuesta a las alertas generadas por el sistema de detección o prevención de intrusiones.',
      // Documental: P-05 o P-ATT. EV-06 es un dato del informe.
      evidences: [],
      active: false,
    },
    {
      id: 'op.mon.1.r3.1',
      level: [],
      title: 'Acciones predeterminadas automáticas (R3)',
      description:
        'Refuerzo R3 – Acciones predeterminadas: El sistema ejecutará automáticamente acciones predeterminadas de respuesta a las alertas generadas. Esto puede incluir la finalización del proceso que está ocasionando la alerta, la inhabilitación de determinados servicios, la desconexión de usuarios y el bloqueo de cuentas.',
      evidences: ['EV-07'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.mon.1.1', 'op.mon.1.r1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Capacidad de detección de intrusiones desplegada y operativa',
      description:
        'Motor de reglas del manager en marcha y procesando: estado del servicio wazuh-manager, contadores del motor de análisis (eventos recibidos, procesados y descartados, alertas escritas) cuya serie entre pasadas prueba que procesa, y el ruleset cargado: versión de Wazuh, fecha del fichero de reglas más reciente, ficheros, reglas y reglas con técnica MITRE ATT&CK. Los conjuntos de reglas de P-03 (R1) se juzgan aparte, con el inventario de EV-04.',
      format: 'json_line',
      events: ['evidence_state', 'detection_engine_status', 'ruleset_version_observed'],
      wazuhRuleIds: ['111201', '111202'],
    },
    {
      id: 'EV-02',
      requirement: ['op.mon.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cobertura efectiva de la detección',
      description:
        'Por cada agente registrado en el manager (global.db, leída en solo lectura): estado de conexión, último keepalive, versión y grupos; y, de su base en el manager, el fin de su última pasada de FIM, de SCA y de inventario. Se contrasta con los sistemas de P-01: un sistema declarado sin agente, con el agente desconectado o sin pasada de FIM o SCA en P-10 horas es un punto ciego del control.',
      format: 'json_line',
      events: ['evidence_state', 'detection_coverage_observed'],
      wazuhRuleIds: ['111203'],
    },
    {
      id: 'EV-03',
      requirement: ['op.mon.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detecciones de intrusión del período',
      description:
        'Por cada agente, a partir de alerts.json del manager (sin las alertas de ENSFácil): instante de su última alerta, alertas y nivel máximo de las últimas 24 h, reglas distintas disparadas y técnicas MITRE ATT&CK. Es la prueba de que la detección no solo está desplegada sino que produce resultado: un sistema de P-01 conectado que pasa más de P-09 días sin ninguna detección indica reglas que no se aplican o una ingesta que no llega.',
      format: 'json_line',
      events: ['evidence_state', 'detection_activity_observed'],
      wazuhRuleIds: ['111204'],
    },
    {
      id: 'EV-04',
      requirement: ['op.mon.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Trazabilidad entre análisis de riesgos y capacidad de detección',
      description:
        'Identificadores de las reglas que el manager carga y que pueden generar una alerta (sin los ficheros excluidos ni las reglas de nivel 0), por conjunto y en rangos comprimidos. Se cruza con P-04: cada situación de compromiso del análisis de riesgos tiene que tener al menos una regla de detección cargada. Una situación sin regla es un punto ciego del control.',
      format: 'json_line',
      events: ['evidence_state', 'ruleset_rules_loaded'],
      wazuhRuleIds: ['111205'],
    },
    {
      id: 'EV-05',
      requirement: ['op.mon.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ingesta y correlación de eventos de detección en red',
      description:
        'Por cada sistema de detección en red (Suricata, Snort, Zeek u otro IDS) cuyos eventos ingiere el manager: de dónde llegan (syslog remoto o el fichero que recoge un agente) y la última alerta de red recibida, con las de las últimas 24 h. Solo se exige si P-02 declara que el análisis de riesgos pide detección en red; si no, se informa y la justificación de P-02 queda en el informe.',
      format: 'json_line',
      events: ['evidence_state', 'network_detection_observed'],
      wazuhRuleIds: ['111206'],
    },
    {
      id: 'EV-06',
      requirement: ['op.mon.1.r2.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Aplicación de los procedimientos de respuesta (R2)',
      description:
        'Que las alertas generadas se trataron conforme al procedimiento de respuesta que les corresponde según P-05. Es un dato del informe, sin veredicto propio: la existencia de los procedimientos (R2) se acredita documentalmente con P-05, y su aplicación a cada alerta la mide op.exp.7 cruzando las alertas con el registro de incidentes.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-07',
      requirement: ['op.mon.1.r3.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Acciones predeterminadas de respuesta ejecutadas (R3)',
      description:
        'Respuestas automáticas configuradas en el manager (comando, reglas o grupos que las disparan, reversión, si están habilitadas) frente a las acciones de P-07, y las ejecutadas en la ventana con la regla que las disparó, el agente y el objetivo. R3 no es exigible en ninguna categoría: se informa como cobertura de hecho del enunciado general del bloque op.mon.',
      format: 'json_line',
      events: ['evidence_state', 'active_response_configured', 'active_response_executed'],
      wazuhRuleIds: ['111207', '111208'],
    },
    {
      id: 'EV-08',
      requirement: ['op.mon.1.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Vigencia del conjunto de reglas y gestión de exclusiones',
      description:
        'Antigüedad del ruleset (fecha de su fichero de reglas más reciente) frente a P-08, y el barrido de silenciamientos del manager: ficheros de reglas excluidos en ossec.conf (rule_exclude) y reglas reescritas a nivel 0 en las reglas propias. Cada silenciamiento tiene que figurar en P-06 con su motivo y quién lo aprobó: una exclusión sin constancia degrada la detección sin que nadie lo advierta.',
      format: 'json_line',
      events: ['evidence_state', 'rule_silenced'],
      wazuhRuleIds: ['111202', '111209'],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'alcance_deteccion_host',
      description:
        'Sistemas que deben estar bajo detección de intrusiones basada en host, uno por fila. La columna sistema es el NOMBRE o el ID DEL AGENTE tal como lo ve Wazuh (el manager figura como el agente 000). Solo los sistemas reales: un agente de prueba o dado de baja que se declare aquí cuenta como un sistema sin cobertura.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'table',
      usage:
        'EV-02 y EV-03 cruzan cada sistema con su agente por ID o por nombre exacto: sin agente, desconectado, sin pasada de FIM o SCA en P-10 horas o sin detecciones en P-09 días es un punto ciego del control. Los agentes registrados que no figuran aquí no cuentan.',
      missingBehavior:
        'No se puede determinar si la cobertura de detección es suficiente: op.mon.1.1 queda sin evaluar. Bloquea el control: es obligatorio.',
    },
    {
      id: 'P-02',
      name: 'necesidad_deteccion_red',
      description:
        'Si el análisis de riesgos exige detección de intrusiones en red (NIDS) además de la detección en host. Wazuh es HIDS: si hace falta inspección de tráfico, se necesita un componente adicional (Suricata, Snort, Zeek) cuyos eventos Wazuh ingiere. Con «sí», una fila por producto; con «no», la referencia del análisis de riesgos que lo justifica.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'table',
      usage:
        'Con «sí», EV-05 exige que el manager ingiera eventos de cada producto declarado y que su última alerta sea más reciente que P-09. Con «no», EV-05 no aplica, siempre que conste la referencia al análisis de riesgos; sin ella queda sin evaluar (causa CONFIGURATION), porque un auditor la pedirá.',
      missingBehavior:
        'EV-05 queda sin evaluar (causa CONFIGURATION) y con ella op.mon.1.1: no consta si la detección en red hace falta.',
    },
    {
      id: 'P-03',
      name: 'conjuntos_reglas_activos',
      description:
        'Conjuntos de reglas de detección que tienen que estar cargados en el manager. R1 exige que la detección sea «basada en reglas», y el inventario de reglas activas es su evidencia directa. El conjunto se nombra como lo informa ENSFácil: wazuh para el ruleset oficial y, para las reglas propias de etc/rules, el prefijo de sus ficheros (local, ensfacil…).',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r1.1'],
      type: 'table',
      usage:
        'ENSFácil lo juzga en R1 como medida propia, con el inventario de EV-04: cada conjunto de P-03 tiene que estar cargado con al menos una regla; el número de reglas declarado es informativo, y sin P-03 R1 queda sin evaluar, pero no la fila de EV-01.',
      missingBehavior:
        'R1 queda sin evaluar (causa CONFIGURATION): no se puede acreditar qué detección basada en reglas se exige.',
    },
    {
      id: 'P-04',
      name: 'situaciones_compromiso_analisis_riesgos',
      description:
        'Situaciones de compromiso de la seguridad identificadas en el análisis de riesgos, que el enunciado general del bloque op.mon señala como el criterio que determina qué se monitoriza, con las reglas que las detectan: solo ids sueltos o rangos (5710, 5712, 80700-80799). Una situación sin reglas se declara con «ninguna» y es un punto ciego; cualquier otro texto en esa columna (una fecha, una referencia) deja la situación sin evaluar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'table',
      usage:
        'ENSFácil exige en EV-04 que cada situación tenga al menos una de sus reglas cargada en el manager; una situación sin reglas, o con reglas que el manager no carga, es un punto ciego del control: un hallazgo defendible, pero un hallazgo.',
      missingBehavior:
        'No se puede verificar la trazabilidad entre el análisis de riesgos y la detección: EV-04 queda sin evaluar (causa CONFIGURATION) y con ella op.mon.1.1.',
    },
    {
      id: 'P-05',
      name: 'procedimientos_respuesta_alertas',
      description:
        'Procedimientos documentados de respuesta a las alertas generadas por el sistema de detección, por tipo de alerta, con su responsable. R2 los exige en categoría ALTA y es un requisito documental, no tecnológico.',
      level: ['ALTO'],
      requirements: ['op.mon.1.r2.1'],
      type: 'table',
      usage:
        'Acredita R2 documentalmente («acreditado documentalmente», nunca «medido») si cada fila nombra su procedimiento y su responsable. Si no se declara, R2 puede acreditarse con P-ATT. La aplicación del procedimiento a cada alerta la mide op.exp.7.',
      missingBehavior:
        'R2 queda sin acreditar en categoría ALTA, salvo que se declare en P-ATT: las alertas se generan pero no consta respuesta pautada.',
    },
    {
      id: 'P-06',
      name: 'umbrales_falsos_positivos',
      description:
        'Reglas silenciadas y ficheros de reglas excluidos en el entorno del cliente, con su justificación y quién lo aprobó. La columna regla es el id de la regla reescrita a nivel 0 o el nombre del fichero excluido en ossec.conf. Un sistema de detección con exceso de ruido deja de ser operativo; uno con exclusiones sin constancia se degrada sin que nadie lo advierta.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r1.1'],
      type: 'table',
      usage:
        'EV-08, en R1: todo silenciamiento observado tiene que figurar aquí con motivo y aprobación. Uno que no figure, o que figure sin motivo o sin quién lo aprobó, es un incumplimiento de R1.',
      missingBehavior:
        'Si el manager tiene algún silenciamiento, R1 queda sin evaluar (causa CONFIGURATION): no consta que esté justificado.',
    },
    {
      id: 'P-07',
      name: 'acciones_respuesta_automatica',
      description:
        'Acciones de respuesta automática previstas y su alcance. Corresponde a R3, que no es obligatorio en ninguna categoría, pero su contenido coincide con el enunciado general del bloque op.mon (finalizar procesos, inhabilitar servicios, desconectar usuarios, bloquear cuentas). La columna acción es el nombre del comando de Active Response.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r3.1'],
      type: 'table',
      usage:
        'EV-07 se INFORMA, sin veredicto: qué acciones de P-07 están configuradas y habilitadas y cuáles se han ejecutado a raíz de una alerta. Acredita la cobertura de hecho de R3 y del enunciado general del bloque.',
      missingBehavior:
        'Se informa de las respuestas configuradas sin contrastarlas con lo previsto. R3 no cuenta en ninguna categoría.',
    },
    {
      id: 'P-08',
      name: 'antiguedad_maxima_ruleset_dias',
      description:
        'Antigüedad máxima admitida del conjunto de reglas de detección que carga el manager, en días, contada desde la fecha del fichero de reglas más reciente del ruleset. Las reglas de detección envejecen igual que las firmas de un antivirus; la plantilla pide una alerta al superar un umbral de antigüedad sin un parámetro que lo declare.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r1.1'],
      type: 'duration_days',
      usage:
        'EV-08, en R1: un ruleset más viejo que P-08 es un incumplimiento de R1.',
      missingBehavior:
        'R1 queda sin evaluar (causa CONFIGURATION): no hay contra qué medir la vigencia del ruleset.',
    },
    {
      id: 'P-09',
      name: 'dias_maximos_sin_deteccion',
      description:
        'Días que un sistema de P-01 conectado puede pasar sin producir ninguna detección antes de considerarse que la detección no funciona en él (reglas que no se aplican o ingesta que no llega). En Linux, PAM, dpkg y syscheck generan alertas a diario: 7 días es razonable. Vale también para la detección en red cuando P-02 la exige.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'duration_days',
      usage:
        'EV-03: un sistema de P-01 conectado que lleva más de P-09 días sin detecciones incumple op.mon.1.1. EV-05: igual para un NIDS que P-02 exige.',
      missingBehavior:
        'op.mon.1.1 queda sin evaluar (causa CONFIGURATION): no se puede decidir si un sistema activo sin detecciones es un fallo de la detección.',
    },
    {
      id: 'P-10',
      name: 'antiguedad_maxima_analisis_horas',
      description:
        'Horas que puede pasar un sistema de P-01 sin completar una pasada de FIM y de SCA antes de considerar que su módulo de análisis está deshabilitado. Se mide en el instante en que ENSFácil lee la base del agente, no al evaluar. Las pasadas de FIM y SCA son cada 12 h por defecto: el valor tiene que ser mayor que su frecuencia configurada (p. ej., 26 h para 12 h).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'duration_hours',
      usage:
        'EV-02: un sistema de P-01 sin pasada de FIM o de SCA en P-10 horas tiene el análisis deshabilitado e incumple op.mon.1.1.',
      missingBehavior:
        'op.mon.1.1 queda sin evaluar (causa CONFIGURATION): no se puede afirmar que el análisis de los sistemas siga activo.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía alternativa para acreditar los procedimientos de respuesta a las alertas (R2) cuando no se declaran en P-05.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. En ENSFácil el resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'detection_engine_status', 'ruleset_version_observed', 'detection_coverage_observed', 'detection_activity_observed', 'ruleset_rules_loaded', 'network_detection_observed', 'active_response_configured', 'active_response_executed', 'rule_silenced'],
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
