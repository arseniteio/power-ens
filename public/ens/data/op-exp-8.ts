import { ENSControl } from '../types';

export const opExp8Control: ENSControl = {
  id: 'op.exp.8',
  title: 'Registro de la actividad',
  framework: 'ENS',
  category: 'Explotación',
  family: 'Marco operacional',
  dimension: 'Trazabilidad (ÚNICA dimensión)',
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
        'op.exp.8 → Requisitos base: op.exp.8.1 + op.exp.8.2',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.8 + R1 + R2 + R3 + R4 → Base + revisión periódica + sincronización de reloj + retención documentada + control de acceso a los registros',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.8 + R1 + R2 + R3 + R4 + R5 → Todo lo anterior + revisión automática, correlación de eventos y respuesta automática',
    },
  },
  requirements: [
    {
      id: 'op.exp.8.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Registro de auditoría con los campos mínimos',
      description:
        'Se generará un registro de auditoría, que incluirá, al menos, el identificador del usuario o entidad asociado al evento, fecha y hora, sobre qué información se realiza el evento, tipo de evento y el resultado del evento (fallo o éxito), según la política de seguridad y los procedimientos asociados a la misma.',
      evidences: ['EV-01', 'EV-03', 'EV-04', 'EV-13'],
    },
    {
      id: 'op.exp.8.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Registros de actividad activos en los servidores',
      description:
        'Se activarán los registros de actividad en los servidores.',
      evidences: ['EV-02', 'EV-04'],
    },
    {
      id: 'op.exp.8.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Revisión periódica de los registros (R1)',
      description:
        'Se revisarán informalmente, de forma periódica, los registros de actividad, buscando patrones anormales.',
      evidences: ['EV-05'],
    },
    {
      id: 'op.exp.8.r2.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Referencia de tiempo sincronizada y protegida (R2)',
      description:
        'El sistema deberá disponer de una referencia de tiempo (timestamp) para facilitar las funciones de registro de eventos y auditoría. La modificación de la referencia de tiempo del sistema será una función de administración y, en caso de realizarse su sincronización con otros dispositivos, deberán utilizarse mecanismos de autenticación e integridad.',
      evidences: ['EV-06'],
    },
    {
      id: 'op.exp.8.r3.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Eventos auditados y retención documentados (R3)',
      description:
        'En la documentación de seguridad del sistema se deberán indicar los eventos de seguridad que serán auditados y el tiempo de retención de los registros antes de ser eliminados.',
      evidences: ['EV-07'],
    },
    {
      id: 'op.exp.8.r4.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Acceso a los registros solo para personal autorizado (R4)',
      description:
        'Los registros de actividad y, en su caso, las copias de seguridad de los mismos, solamente podrán ser accedidos o eliminarse por personal debidamente autorizado.',
      evidences: ['EV-08', 'EV-09', 'EV-13'],
    },
    {
      id: 'op.exp.8.r5.1',
      level: ['ALTO'],
      title: 'Análisis de la actividad en busca de compromisos (R5)',
      description:
        'El sistema deberá implementar herramientas para analizar y revisar la actividad del sistema y la información de auditoría, en búsqueda de comprometimientos de la seguridad posibles o reales.',
      evidences: ['EV-10'],
      active: false,
    },
    {
      id: 'op.exp.8.r5.2',
      level: ['ALTO'],
      title: 'Recolección, correlación y respuesta automáticas (R5)',
      description:
        'Se dispondrá de un sistema automático de recolección de registros, correlación de eventos y respuesta automática ante los mismos.',
      evidences: ['EV-11', 'EV-12'],
      active: false,
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.8.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Generación y conservación del registro de auditoría',
      description:
        'Ingesta centralizada de los eventos de todas las categorías declaradas en P-01, conservados de forma consultable y con los cinco campos mínimos que exige op.exp.8.1. Es el registro de auditoría del sistema en sentido propio: no una evidencia sobre el control, sino el control mismo materializado.',
      format: 'json_line',
      events: ['evidence_state', 'audit_log_status', 'audit_coverage'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.8.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cobertura de registro en los servidores',
      description:
        'Verificación de que todos los servidores de P-02 tienen los registros de actividad activados y reportando efectivamente al Manager. op.exp.8.2 es un requisito base, taxativo y específico para servidores.',
      format: 'json_line',
      events: ['evidence_state', 'agent_status'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.8.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Suficiencia de los campos del registro de auditoría',
      description:
        'Auditoría de una muestra de eventos por cada fuente ingerida para verificar que contienen los cinco campos mínimos de op.exp.8.1: identificador de usuario o entidad, fecha y hora, información afectada, tipo de evento y resultado.',
      format: 'json_line',
      events: ['evidence_state', 'audit_record_fields'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.8.1', 'op.exp.8.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Continuidad de la ingesta y detección de lagunas',
      description:
        'Vigilancia de la continuidad del registro por agente, por su latido con el manager: en cada pasada, el último keepalive de cada servidor contra el silencio máximo tolerado. Una laguna en el registro es el defecto más grave posible en este control: el período afectado queda sin trazabilidad y sin posibilidad de reconstruirla.',
      format: 'json_line',
      events: ['evidence_state', 'agent_keepalive_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.8.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Registro de las revisiones periódicas de los registros (R1)',
      description:
        'Constancia de cada revisión de los registros de actividad realizada: quién la hizo, cuándo, con qué alcance y qué patrones anormales encontró. R1 habla de revisión «informal», pero sin constancia documentada no es acreditable ante un auditor.',
      format: 'json_line',
      events: ['evidence_state', 'log_review_recorded'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.8.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Sincronización del reloj y protección de la referencia de tiempo (R2)',
      description:
        'Verificación de que cada sistema está sincronizado con las fuentes de tiempo de P-05, que la desviación no supera P-06, que la sincronización emplea mecanismos de autenticación e integridad, y que los cambios manuales de hora quedan registrados como función de administración.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'time_sync_status', 'clock_change_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.8.r3.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Retención efectiva de los registros frente a la declarada (R3)',
      description:
        'Comprobación de que la retención real de los índices coincide con el tiempo declarado en P-07, sin eliminación prematura ni conservación indefinida sin criterio. R3 exige que ese tiempo conste en la documentación de seguridad del sistema.',
      format: 'json_line',
      events: ['evidence_state', 'log_retention_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.exp.8.r4.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Control de acceso a los registros de actividad (R4)',
      description:
        'Auditoría de los accesos a los índices y a la API de Wazuh, verificando que provienen únicamente de las cuentas autorizadas en P-08, y detección de intentos de eliminación o modificación de índices. R4 es taxativo sobre quién puede acceder o eliminar.',
      format: 'json_line',
      events: ['evidence_state', 'log_access_permissions'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.exp.8.r4.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Protección de las copias de seguridad de los registros (R4)',
      description:
        'Verificación de que existen copias de los registros conforme a P-09, que están al día y que su destino tiene el acceso restringido al mismo personal autorizado de P-08. R4 extiende expresamente su protección a las copias de seguridad.',
      format: 'json_line',
      events: ['evidence_state', 'log_backup_status'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-10',
      requirement: ['op.exp.8.r5.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Análisis automático en busca de comprometimientos (R5)',
      description:
        'Conjunto de reglas de correlación activas que analizan de forma continua la actividad del sistema y la información de auditoría buscando comprometimientos de la seguridad posibles o reales, con su mapeo a técnicas conocidas. Es la acreditación directa de op.exp.8.r5.1.',
      format: 'json_line',
      events: ['evidence_state', 'correlation_rules_inventory'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-11',
      requirement: ['op.exp.8.r5.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Sistema automático de recolección, correlación y respuesta (R5)',
      description:
        'Acreditación de que existe un sistema automático que recolecta los registros, correlaciona los eventos y responde automáticamente ante ellos. El propio despliegue de Wazuh con Active Response operativo materializa literalmente lo que op.exp.8.r5.2 exige.',
      format: 'json_line',
      events: ['evidence_state', 'active_response_configured'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-12',
      requirement: ['op.exp.8.r5.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Respuestas automáticas ejecutadas (R5)',
      description:
        'Registro de las acciones de respuesta automática efectivamente disparadas en el período, con la regla de origen, el objetivo, el resultado y la reversión si la hubo. Es la evidencia de que la respuesta automática de R5 no es solo una capacidad declarada sino una capacidad operativa.',
      format: 'json_line',
      events: ['evidence_state', 'active_response_executed'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-13',
      requirement: ['op.exp.8.1', 'op.exp.8.r4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Integridad del propio sistema de registro',
      description:
        'Vigilancia de la integridad y disponibilidad del componente que sostiene el control: configuración del Manager, reglas y decodificadores, estado de los servicios y de los nodos del Indexer. Si el sistema de registro es el control, su integridad es requisito del control.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'logging_service_status'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'eventos_auditables',
      description:
        'Relación de eventos de seguridad que serán auditados, que R3 exige que figure en la documentación de seguridad del sistema. Determina el alcance de la ingesta y es el primer documento que un auditor pedirá para verificar este control.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.8.1', 'op.exp.8.r3.1'],
      type: 'table',
      usage:
        'Define la configuración de log collection y los niveles de alerta.',
      missingBehavior:
        'No se puede acreditar qué se audita ni verificar la cobertura. op.exp.8.r3.1 incumplido por falta de documentación.',
    },
    {
      id: 'P-02',
      name: 'servidores_en_alcance',
      description:
        'Servidores en los que deben estar activados los registros de actividad. op.exp.8.2 es taxativo y específico: «se activarán los registros de actividad en los servidores», sin matices ni excepciones.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.8.2'],
      type: 'list',
      usage:
        'Power ENS contrasta esta lista contra los agentes activos que efectivamente reportan. Servidor declarado sin agente o con agente desconectado → hallazgo directo de op.exp.8.2.',
      missingBehavior:
        'No se puede verificar la cobertura de servidores. op.exp.8.2 sin acreditación, siendo requisito base.',
    },
    {
      id: 'P-03',
      name: 'campos_minimos_registro',
      description:
        'Verificación de que los eventos ingeridos contienen los cinco campos que op.exp.8.1 exige como mínimo: identificador de usuario o entidad, fecha y hora, información sobre la que se actúa, tipo de evento y resultado (fallo o éxito).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.8.1'],
      type: 'list',
      usage:
        'Power ENS audita una muestra de eventos por fuente y verifica la presencia de los cinco campos. Fuente cuyos eventos carecen de alguno → hallazgo de decodificador incompleto, que es un hallazgo técnico muy concreto y fácil de corregir.',
      missingBehavior:
        'No se puede verificar la suficiencia del registro de auditoría. op.exp.8.1 acreditable solo por muestreo manual.',
    },
    {
      id: 'P-04',
      name: 'periodicidad_revision_registros_dias',
      description:
        'Cada cuánto deben revisarse los registros de actividad buscando patrones anormales. R1 exige revisión «informalmente, de forma periódica», sin fijar plazo: lo determina la organización. Obligatorio desde MEDIO.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r1.1'],
      type: 'duration_days',
      usage:
        'Power ENS registra cada revisión realizada —quién, cuándo, qué alcance y qué se encontró— y alerta al superarse P-04. El término «informalmente» del ENS no exime de dejar constancia de que se hizo.',
      missingBehavior:
        'R1 NO EVALUABLE. La revisión puede estar haciéndose pero sin constancia no es acreditable ante un auditor.',
    },
    {
      id: 'P-05',
      name: 'fuente_tiempo_ntp',
      description:
        'Servidores de tiempo empleados como referencia y si la sincronización usa mecanismos de autenticación e integridad, exigidos expresamente por R2 cuando hay sincronización con otros dispositivos.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r2.1'],
      type: 'list',
      usage:
        'SCA verifica la configuración NTP de cada agente: servidores configurados, estado de sincronización y uso de autenticación. Un reloj desviado invalida la correlación temporal de todo el registro.',
      missingBehavior:
        'R2 NO EVALUABLE. Riesgo grave: sin referencia de tiempo fiable ningún registro es probatorio.',
    },
    {
      id: 'P-06',
      name: 'desviacion_maxima_reloj_segundos',
      description:
        'Desviación máxima admitida entre el reloj de cada sistema y la referencia de tiempo. Determina cuándo una desincronización pasa a ser hallazgo.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r2.1'],
      type: 'number',
      usage:
        'Power ENS compara la marca temporal del evento en origen con la de recepción en el Manager y detecta desviaciones superiores a P-06. También vigila los eventos de cambio manual de hora, que R2 califica como función de administración.',
      missingBehavior:
        'No se detectan desviaciones de reloj. La correlación entre sistemas puede ser errónea sin que nadie lo advierta.',
    },
    {
      id: 'P-07',
      name: 'retencion_registros_dias',
      description:
        'Tiempo de retención de los registros antes de ser eliminados, que R3 exige indicar en la documentación de seguridad del sistema. Debe ser coherente con el período de retención de cuentas de op.acc.1 y con el registro de accesos de op.acc.5 y op.acc.6.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r3.1'],
      type: 'duration_days',
      usage:
        'Configura las políticas ISM del Wazuh Indexer.',
      missingBehavior:
        'R3 NO EVALUABLE. Riesgo de eliminar registros antes de tiempo o de conservarlos sin criterio documentado.',
    },
    {
      id: 'P-08',
      name: 'personal_autorizado_registros',
      description:
        'Personas autorizadas a acceder o eliminar los registros de actividad y sus copias de seguridad. R4 es taxativo: «solamente podrán ser accedidos o eliminarse por personal debidamente autorizado».',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r4.1'],
      type: 'table',
      usage:
        'Configura los roles y políticas RBAC del Wazuh Indexer y de la API.',
      missingBehavior:
        'R4 NO EVALUABLE. Es el refuerzo más delicado: acceso indiscriminado a los registros compromete su valor probatorio.',
    },
    {
      id: 'P-09',
      name: 'copias_seguridad_registros',
      description:
        'Existencia, destino y periodicidad de las copias de seguridad de los registros de actividad. R4 las menciona expresamente («y, en su caso, las copias de seguridad de los mismos»), extendiéndoles la misma protección.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r4.1'],
      type: 'table',
      usage:
        'Power ENS verifica la existencia y frescura de los snapshots del Indexer y que el destino tiene acceso restringido al personal de P-08. Una copia de registros accesible a cualquiera vulnera R4 igual que el índice.',
      missingBehavior:
        'No se puede verificar la protección de las copias, que R4 protege con el mismo rigor que los registros originales.',
    },
    {
      id: 'P-10',
      name: 'reglas_correlacion_activas',
      description:
        'Conjunto de reglas de correlación y de detección desplegadas, y su cobertura respecto a las categorías de evento de P-01. R5 exige herramientas para analizar la actividad en búsqueda de comprometimientos posibles o reales. Obligatorio en nivel ALTO.',
      level: ['ALTO'],
      requirements: ['op.exp.8.r5.1'],
      type: 'string',
      usage:
        'Power ENS documenta qué reglas están activas, qué técnicas MITRE ATT&CK cubren y qué categorías de P-01 quedan sin regla asociada. Es la acreditación directa de op.exp.8.r5.1.',
      missingBehavior:
        'R5 parcialmente NO EVALUABLE. No se puede documentar la capacidad de análisis desplegada.',
    },
    {
      id: 'P-11',
      name: 'respuesta_automatica_configurada',
      description:
        'Acciones de respuesta automática configuradas ante los eventos correlacionados, con su condición de disparo, alcance y mecanismo de reversión. op.exp.8.r5.2 exige «respuesta automática ante los mismos», no solo detección. Obligatorio en nivel ALTO.',
      level: ['ALTO'],
      requirements: ['op.exp.8.r5.2'],
      type: 'table',
      usage:
        'Configura Active Response. Nótese que R5 no se satisface solo con recolectar y correlacionar: exige respuesta automática. Un Wazuh sin Active Response cumple dos tercios de op.exp.8.r5.2.',
      missingBehavior:
        'R5 incompleto. Se cumple la recolección y correlación pero no la respuesta automática que el requisito exige.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la documentación de seguridad del registro que ninguna telemetría puede demostrar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'Power ENS lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'audit_log_status', 'audit_coverage', 'agent_status', 'audit_record_fields', 'agent_keepalive_observed', 'log_review_recorded', 'time_sync_status', 'clock_change_observed', 'log_retention_observed', 'log_access_permissions', 'log_backup_status', 'correlation_rules_inventory', 'active_response_configured', 'active_response_executed', 'logging_service_status'],
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
