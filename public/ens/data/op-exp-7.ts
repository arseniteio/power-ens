import { ENSControl } from '../types';

export const opExp7Control: ENSControl = {
  id: 'op.exp.7',
  title: 'Gestión de incidentes',
  framework: 'ENS',
  category: 'Explotación',
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
        'op.exp.7 → Requisitos base: op.exp.7.1 + op.exp.7.2',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.7 + R1 + R2 → Base + ventanilla única CCN-CERT + detección y respuesta',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.7 + R1 + R2 + R3 → Base + R1 + R2 + reconfiguración dinámica',
    },
  },
  requirements: [
    {
      id: 'op.exp.7.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Proceso integral de gestión de incidentes',
      description:
        'Se dispondrá de un proceso integral para hacer frente a los incidentes que puedan tener un impacto en la seguridad del sistema, que incluya el informe de eventos de seguridad y debilidades, detallando los criterios de clasificación y el escalado de la notificación.',
      evidences: ['EV-01', 'EV-02', 'EV-04'],
    },
    {
      id: 'op.exp.7.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Incidentes con datos personales según el RGPD',
      description:
        'La gestión de incidentes que afecten a datos personales tendrá en cuenta lo dispuesto en el Reglamento General de Protección de Datos; la Ley Orgánica 3/2018, de 5 de diciembre, en especial su disposición adicional primera, así como el resto de normativa de aplicación, sin perjuicio de los requisitos establecidos en este real decreto.',
      evidences: ['EV-07'],
    },
    {
      id: 'op.exp.7.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Notificación al CCN-CERT por ventanilla única (R1)',
      description:
        'Se dispondrá de soluciones de ventanilla única para la notificación de incidentes al CCN-CERT, que permita la distribución de notificaciones a las diferentes entidades de manera federada, utilizando para ello dependencias administrativas jerárquicas.',
      evidences: ['EV-08'],
    },
    {
      id: 'op.exp.7.r2.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Medidas urgentes y protección de evidencias (R2)',
      description:
        'Implantación de medidas urgentes, incluyendo la detención de servicios, el aislamiento del sistema afectado, la recogida de evidencias y protección de los registros, según convenga al caso.',
      evidences: ['EV-05', 'EV-06'],
    },
    {
      id: 'op.exp.7.r2.2',
      level: ['MEDIO', 'ALTO'],
      title: 'Recursos para investigar y resolver (R2)',
      description:
        'Asignación de recursos para investigar las causas, analizar las consecuencias y resolver el incidente.',
      evidences: ['EV-03'],
    },
    {
      id: 'op.exp.7.r2.3',
      level: ['MEDIO', 'ALTO'],
      title: 'Información a los responsables afectados (R2)',
      description:
        'Informar del incidente a los responsables de la información y servicios afectados y de las actuaciones llevadas a cabo para su resolución.',
      evidences: ['EV-04'],
    },
    {
      id: 'op.exp.7.r2.4',
      level: ['MEDIO', 'ALTO'],
      title: 'Medidas para que no se repita (R2)',
      description:
        'Medidas para: a) Prevenir que se repita el incidente. b) Incluir en los procedimientos de usuario la identificación y forma de tratar el incidente. c) Actualizar, extender, mejorar u optimizar los procedimientos de resolución de incidentes.',
      evidences: ['EV-12'],
    },
    {
      id: 'op.exp.7.r3.1',
      level: ['ALTO'],
      title: 'Reconfiguración dinámica ante ataques (R3)',
      description:
        'La reconfiguración dinámica incluye, por ejemplo, cambios en las reglas de los enrutadores (routers), listas de control de acceso, parámetros del sistema de detección / prevención de intrusiones y reglas en los cortafuegos y puertas de enlace, aislamiento de elementos críticos y aislamiento de las copias de seguridad.',
      evidences: ['EV-09'],
      active: false,
    },
    {
      id: 'op.exp.7.r3.2',
      level: ['ALTO'],
      title: 'Adaptación a los avisos del CCN-CERT (R3)',
      description:
        'El organismo adaptará los procedimientos de reconfiguración dinámica reaccionando a los anuncios recibidos del CCN-CERT relativos a ciberamenazas sofisticadas y campañas de ataques.',
      evidences: ['EV-10'],
      active: false,
    },
    {
      id: 'op.exp.7.r4.1',
      level: [],
      title: 'Prevención y respuesta automática (R4)',
      description:
        'Refuerzo R4 – Prevención y Respuesta Automática: Se dispondrá de herramientas que automaticen el proceso de prevención y respuesta mediante la detección e identificación de anomalías, la segmentación dinámica de la red para reducir la superficie de ataque, el aislamiento de dispositivos críticos, etc.',
      evidences: ['EV-11'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.7.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de eventos de seguridad e incidentes',
      description:
        'Generación de alertas sobre los eventos que pueden tener impacto en la seguridad del sistema, clasificadas según los criterios de P-01. Es el motor de detección que alimenta el proceso de gestión de incidentes y la razón por la que un SIEM es el soporte natural de este control.',
      format: 'json_line',
      events: ['evidence_state', 'security_alert_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.7.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Conciliación entre alertas y expedientes de incidente',
      description:
        'Correlación entre las alertas de severidad relevante generadas por Wazuh y los tickets de incidente registrados en P-03. Identifica alertas huérfanas: detecciones críticas que nunca se convirtieron en incidente gestionado. Es el hallazgo más frecuente y más difícil de defender de este control.',
      format: 'json_line',
      events: ['evidence_state', 'incident_registered'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.7.r2.2'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Tiempos de detección, contención y resolución',
      description:
        'Medición del tiempo transcurrido entre la alerta de Wazuh, la apertura del incidente, la contención registrada y el cierre, contrastado con los plazos comprometidos en P-05. Es la métrica que permite valorar si la asignación de recursos que exige op.exp.7.r2.2 es efectiva o nominal.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.7.1', 'op.exp.7.r2.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación del escalado y de la notificación a responsables',
      description:
        'Comprobación de que cada incidente fue escalado al destinatario que corresponde según la matriz P-02 y dentro del plazo, y de que se informó a los responsables de la información y servicios afectados identificados en P-04, como exige op.exp.7.r2.3.',
      format: 'json_line',
      events: ['evidence_state', 'incident_notification_recorded'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.7.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Preservación de evidencias y protección de los registros',
      description:
        'Verificación de que ante cada incidente se exportaron y conservaron los registros del período y de los sistemas afectados, con sellado de integridad, según P-08. op.exp.7.r2.1 exige expresamente recogida de evidencias y protección de los registros.',
      format: 'json_line',
      events: ['evidence_state', 'evidence_export_sealed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.7.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Medidas urgentes de contención aplicadas',
      description:
        'Registro de las acciones de contención ejecutadas ante cada incidente conforme a P-09: aislamiento del sistema afectado, detención de servicios, bloqueo de IP o de cuenta. op.exp.7.r2.1 enumera estas medidas de forma expresa.',
      format: 'json_line',
      events: ['evidence_state', 'active_response_executed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.7.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Incidentes que afectan a datos personales',
      description:
        'Identificación de los incidentes que afectan a sistemas con datos personales según P-07, activación del contador de 72 horas y verificación de que consta la valoración de brecha y, si procede, la notificación a la AEPD y la comunicación a los interesados.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.exp.7.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Notificación de incidentes al CCN-CERT (R1)',
      description:
        'Verificación de que los incidentes que debían notificarse al CCN-CERT según su clasificación constan efectivamente notificados a través de la solución de ventanilla única declarada en P-06. R1 es obligatorio desde categoría MEDIA.',
      format: 'json_line',
      events: ['evidence_state', 'ccn_cert_notification_recorded'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.exp.7.r3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Reconfiguración dinámica ejecutada ante incidente (R3)',
      description:
        'Detección de cambios en los elementos de P-10 —reglas de cortafuegos, ACL, enrutadores, parámetros de IDS/IPS— producidos en respuesta a un incidente activo, acreditando la capacidad de detener, desviar o limitar ataques que exige R3 en categoría ALTA.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'dynamic_reconfiguration_executed'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-10',
      requirement: ['op.exp.7.r3.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Adaptación a los avisos del CCN-CERT (R3)',
      description:
        'Verificación de que los indicadores de compromiso y las recomendaciones de los avisos del CCN-CERT sobre ciberamenazas sofisticadas y campañas de ataques se incorporan efectivamente a la capacidad de detección, como exige op.exp.7.r3.2.',
      format: 'json_line',
      events: ['evidence_state', 'threat_list_updated'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-11',
      requirement: ['op.exp.7.r4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de anomalías y respuesta automatizada (R4)',
      description:
        'Identificación de comportamientos anómalos respecto a la línea base del sistema y ejecución de respuesta automatizada: aislamiento de dispositivos críticos, bloqueo de tráfico. Cubre parcialmente el Refuerzo R4, no obligatorio pero alcanzable.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-12',
      requirement: ['op.exp.7.r2.4'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Medidas de mejora derivadas del incidente',
      description:
        'Verificación de que tras cerrar cada incidente constan las medidas exigidas por op.exp.7.r2.4: prevención de la repetición, incorporación a los procedimientos de usuario y actualización de los procedimientos de resolución. Es el bucle de aprendizaje que cierra el proceso.',
      format: 'json_line',
      events: ['evidence_state', 'improvement_action_recorded'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'criterios_clasificacion_incidentes',
      description:
        'Criterios que determinan la categoría y severidad de un incidente, exigidos expresamente por op.exp.7.1. Conviene alinearlos con la taxonomía del CCN-CERT para que la notificación de R1 sea directa.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.7.1'],
      type: 'table',
      usage:
        'Power ENS clasifica automáticamente las alertas de Wazuh según estos criterios y las presenta ya categorizadas, lo que reduce el trabajo manual de triaje y hace medible el cumplimiento del proceso.',
      missingBehavior:
        'op.exp.7.1 NO EVALUABLE en su parte de clasificación. Las alertas llegan sin categoría ENS asignada.',
    },
    {
      id: 'P-02',
      name: 'matriz_escalado',
      description:
        'A quién se escala cada tipo y severidad de incidente, en qué plazo y por qué canal. op.exp.7.1 exige detallar «el escalado de la notificación».',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.7.1', 'op.exp.7.r2.3'],
      type: 'table',
      usage:
        'Power ENS verifica que cada incidente detectado fue escalado al destinatario correcto dentro del plazo. Requiere que el escalado deje registro en el sistema de P-03 o en el canal declarado.',
      missingBehavior:
        'No se puede verificar el escalado. op.exp.7.1 y op.exp.7.r2.3 quedan sin acreditación automática.',
    },
    {
      id: 'P-03',
      name: 'sistema_gestion_incidentes',
      description:
        'Herramienta donde se registran y gestionan los incidentes con su ciclo de vida completo. Es la contraparte necesaria de Wazuh: sin ella no hay forma de saber si una alerta se convirtió en incidente gestionado.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.7.1', 'op.exp.9.1'],
      type: 'select',
      usage:
        'Power ENS correlaciona cada alerta de severidad relevante con su ticket de incidente. Alerta crítica sin ticket asociado → hallazgo de alerta huérfana, que es el hallazgo estrella de este control.',
      missingBehavior:
        'No se puede medir la conexión entre detección y gestión. La aportación diferencial de Power ENS se pierde.',
    },
    {
      id: 'P-04',
      name: 'responsables_informacion_servicios',
      description:
        'Responsables de la información y de los servicios a quienes hay que informar del incidente y de las actuaciones de resolución, según op.exp.7.r2.3. Debe asociarse cada sistema del alcance a su responsable.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r2.3'],
      type: 'table',
      usage:
        'Power ENS identifica automáticamente a quién debía informarse según los sistemas afectados por cada incidente y verifica que consta esa comunicación. Puede compartirse con el P-01 de op.exp.1.',
      missingBehavior:
        'op.exp.7.r2.3 NO EVALUABLE. No se puede verificar que se informó a los responsables correctos.',
    },
    {
      id: 'P-05',
      name: 'plazos_respuesta_por_severidad',
      description:
        'Tiempos máximos de detección, contención y resolución comprometidos para cada severidad. El ENS no los fija, pero exige asignación de recursos para resolver (op.exp.7.r2.2), lo que solo es medible con plazos.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r2.2'],
      type: 'table',
      usage:
        'Power ENS mide el tiempo desde la alerta de Wazuh hasta el registro de contención y de cierre en P-03, y lo contrasta con estos plazos. Es la métrica que un auditor pedirá para valorar la eficacia del proceso.',
      missingBehavior:
        'No se puede valorar si la respuesta fue diligente. op.exp.7.r2.2 solo acreditable de forma cualitativa.',
    },
    {
      id: 'P-06',
      name: 'ventanilla_unica_ccn_cert',
      description:
        'Solución de notificación de incidentes al CCN-CERT y datos de la dependencia administrativa jerárquica a través de la cual se federan las notificaciones. R1 es obligatorio desde categoría MEDIA.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r1.1'],
      type: 'select',
      usage:
        'Power ENS registra qué incidentes debían notificarse al CCN-CERT según su clasificación y verifica que consta la notificación. La integración técnica con la plataforma del CCN-CERT es lo ideal; si no, se registra la referencia de la notificación manualmente.',
      missingBehavior:
        'R1 NO EVALUABLE y es obligatorio desde categoría MEDIA. La notificación al CCN-CERT queda sin acreditar.',
    },
    {
      id: 'P-07',
      name: 'criterios_incidente_datos_personales',
      description:
        'Criterios que determinan cuándo un incidente afecta a datos personales y activa las obligaciones del RGPD y de la LO 3/2018, incluido el plazo de 72 horas de notificación a la AEPD. op.exp.7.2 remite expresamente a esa normativa.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.7.2'],
      type: 'string',
      usage:
        'Power ENS marca los incidentes que afectan a sistemas con datos personales, activa el contador de 72 horas y verifica que consta la valoración de brecha y, en su caso, la notificación a la AEPD y a los interesados.',
      missingBehavior:
        'op.exp.7.2 NO EVALUABLE. Riesgo doble: incumplimiento del ENS y de la normativa de protección de datos.',
    },
    {
      id: 'P-08',
      name: 'evidencias_a_preservar',
      description:
        'Qué evidencias deben recogerse y protegerse ante un incidente, y dónde se custodian. op.exp.7.r2.1 exige expresamente «la recogida de evidencias y protección de los registros». Enlaza con op.exp.9.2, que añade la perspectiva de validez jurisdiccional.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r2.1', 'op.exp.9.2'],
      type: 'list',
      usage:
        'Power ENS verifica que ante cada incidente se exportaron y preservaron los registros del período y sistemas afectados, con sellado de integridad. La protección de los registros frente a alteración es requisito expreso.',
      missingBehavior:
        'op.exp.7.r2.1 parcialmente NO EVALUABLE. Riesgo de perder evidencia utilizable en sede jurisdiccional.',
    },
    {
      id: 'P-09',
      name: 'acciones_respuesta_automatica',
      description:
        'Acciones de contención automática autorizadas y su alcance: aislamiento de equipo, bloqueo de IP, detención de servicio, bloqueo de cuenta. Da soporte a op.exp.7.r2.1 y a la reconfiguración dinámica de R3.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.7.r2.1', 'op.exp.7.r3.1'],
      type: 'table',
      usage:
        'Configura Active Response de Wazuh. Cada acción debe tener condición de disparo, alcance limitado y mecanismo de reversión. Una respuesta automática mal calibrada causa más indisponibilidad que el incidente.',
      missingBehavior:
        'No hay contención automática. La respuesta depende íntegramente de intervención manual, alargando el impacto.',
    },
    {
      id: 'P-10',
      name: 'elementos_reconfiguracion_dinamica',
      description:
        'Elementos del sistema sobre los que puede aplicarse reconfiguración dinámica —cortafuegos, enrutadores, listas de control de acceso, IDS/IPS, puertas de enlace— y quién está autorizado a modificarlos en respuesta a incidente. R3 es obligatorio en categoría ALTA.',
      level: ['ALTO'],
      requirements: ['op.exp.7.r3.1'],
      type: 'table',
      usage:
        'Power ENS verifica que existen los mecanismos y que se han ejercitado: cambios de configuración en estos elementos correlacionados con incidentes activos. Enlaza con op.exp.3 y op.exp.5 para su trazabilidad.',
      missingBehavior:
        'R3 NO EVALUABLE y es obligatorio en categoría ALTA. Sin capacidad de reconfiguración los daños no se acotan.',
    },
    {
      id: 'P-11',
      name: 'canal_avisos_ccn_cert',
      description:
        'Vía por la que se reciben y procesan los avisos del CCN-CERT sobre ciberamenazas sofisticadas y campañas de ataques, que el organismo debe usar para adaptar sus procedimientos de reconfiguración dinámica (op.exp.7.r3.2).',
      level: ['ALTO'],
      requirements: ['op.exp.7.r3.2'],
      type: 'select',
      usage:
        'Power ENS registra la recepción de avisos y verifica que van seguidos de adaptación de reglas de detección o de configuración. Los IoC de los avisos pueden cargarse como CDB lists en Wazuh para detección directa.',
      missingBehavior:
        'R3 parcialmente NO EVALUABLE. Los avisos del CCN-CERT no se traducen en capacidad de detección efectiva.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el procedimiento de gestión de incidentes y los requisitos que ninguna telemetría puede demostrar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'Power ENS lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'security_alert_observed', 'incident_registered', 'incident_notification_recorded', 'evidence_export_sealed', 'active_response_executed', 'ccn_cert_notification_recorded', 'dynamic_reconfiguration_executed', 'threat_list_updated', 'improvement_action_recorded'],
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
