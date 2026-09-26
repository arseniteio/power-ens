import { ENSControl } from '../types';

export const opExp9Control: ENSControl = {
  id: 'op.exp.9',
  title: 'Registro de la gestión de incidentes',
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
        'op.exp.9 → Requisitos base: op.exp.9.1 + op.exp.9.2 + op.exp.9.3',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.9 → Ídem categoría BÁSICA.',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.9 → Ídem categoría BÁSICA. No existen refuerzos en este control.',
    },
  },
  requirements: [
    {
      id: 'op.exp.9.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Reportes, actuaciones y cambios del incidente registrados',
      description:
        'Se registrarán los reportes iniciales, intermedios y finales de los incidentes, las actuaciones de emergencia y las modificaciones del sistema derivadas del incidente.',
      evidences: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-09'],
    },
    {
      id: 'op.exp.9.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Evidencias con valor jurisdiccional registradas',
      description:
        'Se registrará aquella evidencia que pueda dirimirse en un ámbito jurisdiccional, especialmente cuando el incidente pueda comportar acciones disciplinarias sobre el personal interno, sobre proveedores externos o en la persecución de delitos. En la determinación de la composición y detalle de estas evidencias, se recurrirá a asesoramiento legal especializado.',
      evidences: ['EV-05', 'EV-06', 'EV-07', 'EV-09'],
    },
    {
      id: 'op.exp.9.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Eventos auditables revisados tras los incidentes',
      description:
        'Como consecuencia del análisis de los incidentes, se revisará la determinación de los eventos auditables.',
      evidences: ['EV-08', 'EV-09'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.9.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Registro de eventos que originan cada incidente',
      description:
        'Conservación del conjunto de eventos que dieron lugar a la detección del incidente, con su marca temporal y sistemas implicados. Es la materia prima del reporte inicial que exige op.exp.9.1 y el punto de partida de cualquier análisis posterior.',
      format: 'json_line',
      events: ['evidence_state', 'incident_source_events_available'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.9.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Completitud de los reportes inicial, intermedio y final',
      description:
        'Verificación de que cada incidente cuenta con los tres tipos de reporte que op.exp.9.1 distingue, cumplimentados según las plantillas de P-02. Un incidente con solo registro de cierre no satisface el requisito, que menciona expresamente los tres momentos.',
      format: 'json_line',
      events: ['evidence_state', 'incident_report_registered'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.9.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Registro de las actuaciones de emergencia',
      description:
        'Constancia de las medidas urgentes ejecutadas durante el incidente: aislamiento, detención de servicios, bloqueos. op.exp.9.1 exige registrar expresamente «las actuaciones de emergencia», y Active Response produce ese registro de forma automática y fiable.',
      format: 'json_line',
      events: ['evidence_state', 'emergency_action_linked'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.9.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Registro de las modificaciones del sistema derivadas del incidente',
      description:
        'Constancia de los cambios realizados en los sistemas como consecuencia del incidente: cambios de configuración, parches aplicados, reglas modificadas, cuentas deshabilitadas. op.exp.9.1 los exige registrar de forma expresa.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'derived_change_linked'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.9.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Exportación sellada de evidencias con valor probatorio',
      description:
        'Generación automática, al marcarse un incidente como de relevancia jurídica según P-04, del conjunto de evidencias declarado en P-03: registros del período y sistemas afectados, exportados con cálculo de hash y sellado de tiempo.',
      format: 'json_line',
      events: ['evidence_state', 'evidence_export_sealed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.9.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cadena de custodia de las evidencias',
      description:
        'Registro de todos los accesos a las evidencias custodiadas: quién, cuándo y con qué finalidad, junto con la verificación periódica de que el hash de la evidencia sigue coincidiendo. Sin cadena de custodia acreditable, la evidencia pierde valor probatorio con independencia de su contenido.',
      format: 'json_line',
      events: ['evidence_state', 'custody_access_recorded', 'custody_integrity_checked'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.9.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Protección de los registros del período del incidente',
      description:
        'Bloqueo de la eliminación automática por política de retención de los índices correspondientes al período y sistemas de un incidente abierto o con relevancia jurídica, evitando que la rotación normal destruya evidencia necesaria.',
      format: 'json_line',
      events: ['evidence_state', 'incident_logs_retained'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.exp.9.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Realimentación de los eventos auditables tras el incidente',
      description:
        'Verificación de que el análisis de cada incidente relevante se traduce en revisión de la lista de eventos auditables y, en su caso, en nuevas reglas de detección. op.exp.9.3 lo exige expresamente y es el bucle que conecta este control con op.exp.8.',
      format: 'json_line',
      events: ['evidence_state', 'auditable_events_revised'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.exp.9.1', 'op.exp.9.2', 'op.exp.9.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Trazabilidad completa del expediente de incidente',
      description:
        'Consolidación en un único expediente consultable de todo lo relacionado con el incidente: alertas originarias, reportes, actuaciones de emergencia, modificaciones derivadas, evidencias custodiadas y revisión de eventos auditables. Es el entregable que un auditor querrá ver en su conjunto.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'sistema_registro_incidentes',
      description:
        'Herramienta donde se registran los reportes iniciales, intermedios y finales de cada incidente. Normalmente coincide con el sistema de gestión de incidentes de op.exp.7, y conviene que sea el mismo para no duplicar registros.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.1'],
      type: 'select',
      usage:
        'ENSFácil verifica que cada incidente cuenta con los tres tipos de reporte que exige op.exp.9.1 y que constan las actuaciones de emergencia y las modificaciones del sistema derivadas.',
      missingBehavior:
        'op.exp.9.1 NO EVALUABLE. No se puede verificar la completitud del registro de la gestión.',
    },
    {
      id: 'P-02',
      name: 'estructura_reportes_incidente',
      description:
        'Contenido mínimo exigido a los reportes inicial, intermedio y final. op.exp.9.1 los menciona como tres momentos distintos, de modo que un único registro de cierre no satisface el requisito.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.1'],
      type: 'string',
      usage:
        'ENSFácil verifica la presencia de los tres reportes por incidente y su cumplimentación. Incidente con solo reporte de cierre → hallazgo, porque el requisito distingue expresamente tres momentos.',
      missingBehavior:
        'No se puede verificar que existan los tres reportes exigidos ni su suficiencia.',
    },
    {
      id: 'P-03',
      name: 'composicion_evidencia_jurisdiccional',
      description:
        'Composición y detalle de las evidencias que deben recogerse para que puedan dirimirse en ámbito jurisdiccional, determinada con el asesoramiento legal especializado que op.exp.9.2 exige expresamente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.2'],
      type: 'list',
      usage:
        'Define qué exporta y sella ENSFácil automáticamente al abrirse un incidente con potencial relevancia jurídica. La determinación de la lista NO es técnica: el ENS remite a asesoramiento legal especializado.',
      missingBehavior:
        'op.exp.9.2 NO EVALUABLE. Riesgo real de que la evidencia recogida no sea admisible cuando haga falta.',
    },
    {
      id: 'P-04',
      name: 'criterios_relevancia_juridica',
      description:
        'Criterios que determinan cuándo un incidente puede comportar acciones disciplinarias sobre personal interno, sobre proveedores externos o persecución de delitos, activando el régimen probatorio reforzado de op.exp.9.2.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.2'],
      type: 'list',
      usage:
        'ENSFácil marca automáticamente los incidentes que cumplen estos criterios y activa la recogida sellada de las evidencias de P-03, además de alertar de que el caso requiere tratamiento probatorio reforzado.',
      missingBehavior:
        'No se activa el régimen probatorio reforzado. La evidencia puede perderse antes de saber que se necesitaba.',
    },
    {
      id: 'P-05',
      name: 'custodia_evidencias',
      description:
        'Repositorio de custodia de las evidencias, con su control de acceso, mecanismo de sellado de integridad y registro de cadena de custodia. Condiciona directamente el valor probatorio de lo recogido.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.2'],
      type: 'string',
      usage:
        'ENSFácil deposita las exportaciones selladas y registra cada acceso posterior. El almacenamiento inmutable y el sellado de tiempo son los dos elementos que más refuerzan la admisibilidad.',
      missingBehavior:
        'La evidencia queda sin cadena de custodia acreditable, lo que puede hacerla inservible en sede judicial.',
    },
    {
      id: 'P-06',
      name: 'retencion_evidencias_dias',
      description:
        'Tiempo de conservación de las evidencias de incidentes. Debe atender a los plazos de prescripción aplicables según el tipo de responsabilidad —disciplinaria, contractual o penal—, no solo a la retención general de registros de op.exp.8.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.2'],
      type: 'duration_days',
      usage:
        'ENSFácil aplica la política de retención al repositorio de custodia. Es un parámetro que debe fijarse con el mismo asesoramiento legal de P-03: la retención general de op.exp.8 suele ser insuficiente aquí.',
      missingBehavior:
        'Riesgo de destruir evidencia antes de que prescriba la responsabilidad que podría acreditar.',
    },
    {
      id: 'P-07',
      name: 'procedimiento_revision_eventos_auditables',
      description:
        'Proceso por el que el análisis de los incidentes lleva a revisar la determinación de los eventos auditables, exigido por op.exp.9.3. Es el bucle de realimentación con op.exp.8.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.3', 'op.exp.8.r3.1'],
      type: 'string',
      usage:
        'ENSFácil correlaciona el cierre de incidentes con modificaciones posteriores en la lista de eventos auditables (P-01 de op.exp.8) y en las reglas de detección. Permite demostrar que el sistema aprende.',
      missingBehavior:
        'op.exp.9.3 NO EVALUABLE. El registro de eventos auditables queda estático y no se realimenta.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar los requisitos que ningún registro técnico puede demostrar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'incident_source_events_available', 'incident_report_registered', 'emergency_action_linked', 'derived_change_linked', 'evidence_export_sealed', 'custody_access_recorded', 'custody_integrity_checked', 'incident_logs_retained', 'auditable_events_revised'],
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
