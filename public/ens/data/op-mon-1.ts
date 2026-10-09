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
        'Acreditación de que existe un sistema de detección de intrusiones basado en host, con motor de reglas, desplegado en los sistemas de P-01 y generando detecciones. Cubre simultáneamente el requisito base op.mon.1.1 y el Refuerzo R1, porque Wazuh es por definición detección basada en reglas.',
      format: 'json_line',
      events: ['evidence_state', 'detection_engine_status', 'ruleset_version_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.mon.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cobertura efectiva de la detección',
      description:
        'Contraste entre los sistemas que deben estar bajo detección según P-01 y los que efectivamente tienen agente activo y reportando. Los sistemas sin cobertura son puntos ciegos del control, no detalles de despliegue pendientes.',
      format: 'json_line',
      events: ['evidence_state', 'detection_coverage_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.mon.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detecciones de intrusión del período',
      description:
        'Registro de todas las detecciones generadas: regla disparada, sistema afectado, severidad, técnica MITRE ATT&CK asociada y estado de tratamiento. Es la evidencia de que el control no solo está desplegado sino que funciona y produce resultado.',
      format: 'json_line',
      events: ['evidence_state', 'detection_activity_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.mon.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Trazabilidad entre análisis de riesgos y capacidad de detección',
      description:
        'Verificación de que cada situación de compromiso identificada en el análisis de riesgos (P-04) cuenta con al menos una regla de detección asociada. El enunciado general del bloque op.mon vincula expresamente la monitorización con lo que figure en el análisis de riesgos.',
      format: 'json_line',
      events: ['evidence_state', 'ruleset_rules_loaded'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.mon.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ingesta y correlación de eventos de detección en red',
      description:
        'Si P-02 = sí: ingesta de los eventos del sistema de detección en red (Suricata, Snort, Zeek) y su correlación con las detecciones de host, lo que permite reconstruir un ataque desde la red hasta el endpoint afectado.',
      format: 'json_line',
      events: ['evidence_state', 'network_detection_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.mon.1.r2.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Aplicación de los procedimientos de respuesta (R2)',
      description:
        'Verificación de que las alertas generadas fueron tratadas conforme al procedimiento de respuesta que les corresponde según P-05. R2 es obligatorio en categoría ALTA y exige que esos procedimientos existan, lo que implica que deben poder acreditarse aplicados.',
      format: 'json_line',
      events: ['evidence_state'],
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
        'Registro de las acciones automáticas disparadas ante detección conforme a P-07: finalización de proceso, inhabilitación de servicio, desconexión de usuario, bloqueo de cuenta o de IP. Son exactamente las acciones que enumera el enunciado general del bloque op.mon.',
      format: 'json_line',
      events: ['evidence_state', 'active_response_configured', 'active_response_executed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.mon.1.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Vigencia del conjunto de reglas y gestión de exclusiones',
      description:
        'Seguimiento de la actualización del ruleset y del registro de exclusiones aplicadas: qué reglas se han silenciado, por qué motivo y quién lo autorizó. Un conjunto de reglas desactualizado o excesivamente excluido degrada la detección sin que nadie lo advierta.',
      format: 'json_line',
      events: ['evidence_state', 'rule_silenced'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'alcance_deteccion_host',
      description:
        'Sistemas que deben estar bajo detección de intrusiones basada en host. El requisito base habla de disponer de herramientas, pero su suficiencia depende de que cubran los sistemas que el análisis de riesgos identifica como relevantes.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'table',
      usage:
        'Define el despliegue de agentes.',
      missingBehavior:
        'No se puede determinar si la cobertura de detección es suficiente. El control queda sin alcance definido.',
    },
    {
      id: 'P-02',
      name: 'necesidad_deteccion_red',
      description:
        'Determina, a partir del análisis de riesgos, si las amenazas identificadas requieren detección de intrusiones en red (NIDS) además de la detección en host. Wazuh es HIDS; si hace falta inspección de tráfico se necesita un componente adicional cuyos eventos Wazuh ingiere.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'table',
      usage:
        'Si P-02 = sí, ENSFácil configura la ingesta de los eventos del NIDS y los correlaciona con los del HIDS. Si P-02 = no, debe constar la justificación en el análisis de riesgos, porque un auditor preguntará por la detección en red.',
      missingBehavior:
        'Riesgo de hallazgo: cobertura de detección solo en host sin justificación de por qué no se requiere en red.',
    },
    {
      id: 'P-03',
      name: 'conjuntos_reglas_activos',
      description:
        'Conjuntos de reglas de detección desplegados y su cobertura. R1 exige expresamente que la detección sea «basada en reglas», de modo que el inventario de reglas activas es la evidencia directa del refuerzo.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r1.1'],
      type: 'table',
      usage:
        'ENSFácil documenta qué conjuntos están activos, su versión y su fecha de última actualización. Un ruleset desactualizado es un hallazgo: las reglas de detección envejecen igual que las firmas de antivirus.',
      missingBehavior:
        'R1 NO EVALUABLE. No se puede acreditar que la detección es basada en reglas ni valorar su vigencia.',
    },
    {
      id: 'P-04',
      name: 'situaciones_compromiso_analisis_riesgos',
      description:
        'Situaciones de compromiso de la seguridad identificadas en el análisis de riesgos, que el enunciado general del bloque op.mon señala como el criterio que determina qué se monitoriza y qué acciones se ejecutan.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'table',
      usage:
        'ENSFácil verifica que cada situación de compromiso identificada en el análisis de riesgos tiene al menos una regla de detección asociada. Situación sin regla → punto ciego documentado, que es un hallazgo defendible.',
      missingBehavior:
        'No se puede verificar la trazabilidad entre análisis de riesgos y capacidad de detección efectiva.',
    },
    {
      id: 'P-05',
      name: 'procedimientos_respuesta_alertas',
      description:
        'Procedimientos documentados de respuesta a las alertas generadas por el sistema de detección, por tipo de alerta. R2 los exige en categoría ALTA y es un requisito documental, no tecnológico.',
      level: ['ALTO'],
      requirements: ['op.mon.1.r2.1'],
      type: 'table',
      usage:
        'ENSFácil vincula cada categoría de alerta con su procedimiento de respuesta y verifica que las alertas generadas fueron tratadas conforme a él, correlacionando con el sistema de gestión de incidentes de op.exp.7.',
      missingBehavior:
        'R2 NO EVALUABLE y es obligatorio en categoría ALTA. Las alertas se generan pero no hay respuesta pautada.',
    },
    {
      id: 'P-06',
      name: 'umbrales_falsos_positivos',
      description:
        'Reglas y situaciones declaradas como falso positivo conocido en el entorno del cliente, con su justificación. Un sistema de detección con exceso de ruido deja de ser operativo, lo que acaba vaciando el control de contenido.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r1.1'],
      type: 'table',
      usage:
        'Configura las exclusiones en Wazuh de forma trazable.',
      missingBehavior:
        'Riesgo doble: ruido excesivo que inutiliza el control, o exclusiones no documentadas que lo degradan sin constancia.',
    },
    {
      id: 'P-07',
      name: 'acciones_respuesta_automatica',
      description:
        'Acciones de respuesta automática configuradas y su alcance. Corresponde a R3, no obligatorio, pero su contenido coincide con el enunciado general del bloque op.mon, que describe la finalización de procesos, la inhabilitación de servicios, la desconexión de usuarios y el bloqueo de cuentas.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r3.1'],
      type: 'table',
      usage:
        'Configura Active Response. Permite acreditar R3 aunque no sea exigible y, más relevante, da cumplimiento al enunciado general del bloque, que un auditor puede invocar aunque R3 no esté marcado como obligatorio.',
      missingBehavior:
        'No hay respuesta automática. El enunciado general del bloque op.mon queda cubierto solo parcialmente.',
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
        'El recolector del manager informa de la versión de Wazuh y de la fecha del fichero más reciente del ruleset.',
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
        'El recolector del manager lee alerts.json y anota, por agente, el instante de su última alerta propia (sin las de ENSFácil). ENSFácil da por incumplido op.mon.1.1 si un sistema de P-01 conectado lleva más de P-09 días sin detecciones.',
      missingBehavior:
        'op.mon.1.1 queda sin evaluar (causa CONFIGURATION): no se puede decidir si un sistema activo sin detecciones es un fallo de la detección.',
    },
    {
      id: 'P-10',
      name: 'antiguedad_maxima_analisis_horas',
      description:
        'Horas que puede pasar un sistema de P-01 sin completar una pasada de FIM y de SCA antes de considerar que su módulo de análisis está deshabilitado. Las pasadas de FIM y SCA son cada 12 h por defecto: el valor tiene que ser mayor que su frecuencia configurada (p. ej., 26 h para 12 h).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'duration_hours',
      usage:
        'El recolector del manager lee, de la base de cada agente en el manager, el fin de su última pasada de FIM y de SCA.',
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
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
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
