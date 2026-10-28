import { ENSControl } from '../types';

export const opExp5Control: ENSControl = {
  id: 'op.exp.5',
  title: 'Gestión de cambios',
  framework: 'ENS',
  category: 'Explotación',
  family: 'Marco operacional',
  dimension: 'Todas',
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
        'op.exp.5 → Requisitos base: op.exp.5.1 a op.exp.5.5',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.5 + R1 → Base + op.exp.5.r1.1 + op.exp.5.r1.2 + op.exp.5.r1.3',
    },
  },
  requirements: [
    {
      id: 'op.exp.5.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Peticiones de cambio registradas y numeradas',
      description:
        'Los cambios se planificarán para reducir el impacto sobre la prestación de los servicios afectados. Para ello, todas las peticiones de cambio se registrarán asignando un número de referencia que permita su seguimiento, de forma equivalente al registro de los incidentes.',
      evidences: ['EV-01', 'EV-02'],
    },
    {
      id: 'op.exp.5.2',
      level: ['MEDIO', 'ALTO'],
      title: 'Información suficiente para autorizar el cambio',
      description:
        'La información a registrar para cada petición de cambio será suficiente para que quien deba autorizarlos no tenga dudas al respecto y permita gestionarlo hasta su desestimación o implementación.',
      evidences: ['EV-03'],
    },
    {
      id: 'op.exp.5.3',
      level: ['MEDIO', 'ALTO'],
      title: 'Pruebas en preproducción equivalente',
      description:
        'Las pruebas de preproducción, siempre que sea posible realizarlas, se efectuarán en equipos equivalentes a los de producción, al menos en los aspectos específicos del cambio.',
      evidences: ['EV-05'],
    },
    {
      id: 'op.exp.5.4',
      level: ['MEDIO', 'ALTO'],
      title: 'Aprobación previa de los cambios de riesgo alto',
      description:
        'Mediante un análisis de riesgos se determinará si los cambios son relevantes para la seguridad del sistema. Aquellos cambios que impliquen un riesgo de nivel ALTO deberán ser aprobados, explícitamente, de forma previa a su implantación, por el Responsable de la Seguridad.',
      evidences: ['EV-04'],
    },
    {
      id: 'op.exp.5.5',
      level: ['MEDIO', 'ALTO'],
      title: 'Pruebas de aceptación y documentación actualizada',
      description:
        'Una vez implementado el cambio, se realizarán las pruebas de aceptación convenientes. Si son positivas, se actualizará la documentación de configuración (diagramas de red, manuales, el inventario, etc.), siempre que proceda.',
      evidences: ['EV-06', 'EV-07'],
    },
    {
      id: 'op.exp.5.r1.1',
      level: ['ALTO'],
      title: 'Posibilidad de reversión prevista (R1)',
      description:
        'Antes de la aplicación de los cambios, se deberá tener en cuenta la posibilidad de revertirlos en caso de la aparición de efectos adversos.',
      evidences: ['EV-07', 'EV-09'],
      active: false,
    },
    {
      id: 'op.exp.5.r1.2',
      level: ['ALTO'],
      title: 'Fallos comunicados al responsable de seguridad (R1)',
      description:
        'Todos los fallos en el software y hardware deberán ser comunicados al responsable designado en la organización de la seguridad.',
      evidences: ['EV-08'],
      active: false,
    },
    {
      id: 'op.exp.5.r1.3',
      level: ['ALTO'],
      title: 'Cambios documentados con impacto en seguridad (R1)',
      description:
        'Todos los cambios en el sistema deberán documentarse, incluyendo una valoración del impacto que dicho cambio supone en la seguridad del sistema.',
      evidences: ['EV-03'],
      active: false,
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.5.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cambios reales detectados en los sistemas',
      description:
        'Registro de todos los cambios efectivamente producidos en los sistemas del alcance: modificaciones de configuración, instalación o retirada de software, cambios de hardware, apertura o cierre de puertos. Es la base objetiva contra la que se contrasta el registro de peticiones de cambio del cliente.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.5.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cambios implantados sin petición registrada',
      description:
        'Correlación entre los cambios detectados (EV-01) y las peticiones de cambio registradas en P-01. Un cambio en producción sin número de referencia asociado evidencia que el control continuo de cambios que exige el enunciado del control no está operando.',
      format: 'json_line',
      events: ['evidence_state', 'change_request_registered'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.5.2', 'op.exp.5.r1.3'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Completitud de la información de la petición de cambio',
      description:
        'Verificación de que cada petición implementada contiene los campos mínimos declarados en P-02, de modo que quien la autorizó dispuso de información suficiente, como exige op.exp.5.2.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.5.4'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Aprobación previa del RSI en cambios de riesgo ALTO',
      description:
        'Verificación de que los cambios clasificados como de riesgo ALTO según P-03 cuentan con aprobación explícita del Responsable de la Seguridad (P-04) y que la fecha de esa aprobación es ANTERIOR a la implantación detectada en EV-01. El ENS es expreso en ambos extremos.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.5.3'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Trazabilidad del paso por preproducción',
      description:
        'Comprobación de que los cambios aplicados en producción tuvieron actividad equivalente previa en el sistema de preproducción emparejado en P-05, al menos en los aspectos específicos del cambio.',
      format: 'json_line',
      events: ['evidence_state', 'preproduction_test_recorded'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.5.5'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Actualización de la documentación de configuración tras el cambio',
      description:
        'Verificación de que, tras un cambio aceptado, se modificaron los documentos de configuración declarados en P-06: diagramas de red, manuales, inventario. op.exp.5.5 lo exige expresamente cuando las pruebas de aceptación son positivas.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'config_doc_modified'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.5.5', 'op.exp.5.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Estabilidad del servicio tras el cambio',
      description:
        'Detección de efectos adversos aparecidos en la ventana posterior a cada cambio: caídas de servicio, errores en volumen anómalo, degradación de rendimiento. Da soporte objetivo a las pruebas de aceptación de op.exp.5.5 y justifica la activación del mecanismo de reversión de R1.',
      format: 'json_line',
      events: ['evidence_state', 'service_failed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.exp.5.r1.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Comunicación de fallos al responsable de seguridad (R1)',
      description:
        'Verificación de que los fallos de software y hardware detectados se comunican efectivamente al responsable designado en la organización de la seguridad, por el canal declarado en P-07. R1 es obligatorio en categoría ALTA.',
      format: 'json_line',
      events: ['evidence_state', 'fault_notification_recorded'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-09',
      requirement: ['op.exp.5.r1.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Existencia de punto de reversión previo al cambio (R1)',
      description:
        'Comprobación de que antes de aplicar cada cambio se generó el mecanismo de reversión declarado en P-08: snapshot, backup de configuración o imagen previa. Comparte lógica con op.exp.4 EV-09.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'reversion_point_created'],
      wazuhRuleIds: [],
      active: false,
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'sistema_gestion_cambios',
      description:
        'Sistema donde se registran las peticiones de cambio con su número de referencia, y forma de acceso a ese registro. op.exp.5.1 exige numeración y seguimiento equivalentes a los del registro de incidentes.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.1', 'op.exp.5.2'],
      type: 'select',
      usage:
        'Es la pieza que hace posible el contraste. Cambio detectado sin petición asociada → hallazgo.',
      missingBehavior:
        'No se puede contrastar cambio real contra cambio autorizado. La aportación principal de Power ENS a este control se pierde.',
    },
    {
      id: 'P-02',
      name: 'campos_minimos_peticion_cambio',
      description:
        'Información mínima que debe contener cada petición de cambio para que el autorizador «no tenga dudas al respecto» (op.exp.5.2): descripción, sistemas afectados, solicitante, ventana prevista, impacto, plan de reversión, resultado del análisis de riesgos.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.2'],
      type: 'list',
      usage:
        'Power ENS verifica la completitud de cada petición consultada en P-01. Petición implementada con campos obligatorios vacíos → hallazgo de información insuficiente para autorizar.',
      missingBehavior:
        'No se puede verificar la suficiencia de la información. op.exp.5.2 solo acreditable por muestreo manual.',
    },
    {
      id: 'P-03',
      name: 'criterios_cambio_riesgo_alto',
      description:
        'Criterios que determinan cuándo un cambio implica riesgo de nivel ALTO y por tanto exige aprobación explícita y previa del Responsable de la Seguridad (op.exp.5.4). Es el umbral que dispara el requisito más exigente del control.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.4'],
      type: 'list',
      usage:
        'Power ENS clasifica los cambios detectados según estos criterios y verifica que los de riesgo ALTO cuentan con aprobación explícita del RSI en P-01, y que esa aprobación es ANTERIOR a la implantación.',
      missingBehavior:
        'No se puede identificar qué cambios exigían aprobación del RSI. op.exp.5.4 NO EVALUABLE.',
    },
    {
      id: 'P-04',
      name: 'responsable_seguridad',
      description:
        'Identificación del Responsable de la Seguridad y de su cuenta o identificador en el sistema de gestión de cambios, para poder verificar que la aprobación de los cambios de riesgo ALTO proviene efectivamente de él.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.4'],
      type: 'string',
      usage:
        'Power ENS verifica la identidad del aprobador en las peticiones clasificadas como riesgo ALTO. Aprobación firmada por otra persona → hallazgo, porque el ENS atribuye esa competencia al RSI de forma expresa.',
      missingBehavior:
        'No se puede verificar que la aprobación de cambios de riesgo ALTO proviene del Responsable de la Seguridad.',
    },
    {
      id: 'P-05',
      name: 'entorno_preproduccion',
      description:
        'Emparejamiento entre sistemas de producción y sus equivalentes de preproducción, y acreditación de que son equivalentes «al menos en los aspectos específicos del cambio» (op.exp.5.3). Puede compartirse con el parámetro homólogo de op.exp.4.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.3'],
      type: 'table',
      usage:
        'Power ENS correlaciona cada cambio en producción con actividad previa en su par de preproducción. Requiere agente Wazuh también en preproducción. Nótese el matiz «siempre que sea posible realizarlas», que admite justificación de imposibilidad.',
      missingBehavior:
        'No se puede acreditar el paso por preproducción. op.exp.5.3 queda como acreditación documental.',
    },
    {
      id: 'P-06',
      name: 'documentacion_configuracion',
      description:
        'Documentos de configuración que deben actualizarse tras un cambio aceptado (op.exp.5.5): diagramas de red, manuales de operación, inventario de activos. Debe indicarse dónde residen para poder verificar su actualización.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.5'],
      type: 'list',
      usage:
        'FIM sobre las rutas declaradas permite detectar si el documento se actualizó en la ventana posterior al cambio. Cambio aceptado sin actualización documental posterior → hallazgo de op.exp.5.5.',
      missingBehavior:
        'No se puede verificar la actualización de la documentación tras el cambio.',
    },
    {
      id: 'P-07',
      name: 'canal_comunicacion_fallos',
      description:
        'Vía por la que se comunican al responsable de seguridad los fallos de software y hardware, exigida por op.exp.5.r1.2 en categoría ALTA. Debe ser un canal cuyo uso deje registro.',
      level: ['ALTO'],
      requirements: ['op.exp.5.r1.2'],
      type: 'select',
      usage:
        'Power ENS puede correlacionar las alertas de fallo que Wazuh detecta (servicios caídos, errores hardware en logs del sistema) con su comunicación efectiva por el canal declarado. Fallo detectado sin comunicación → hallazgo.',
      missingBehavior:
        'No se puede verificar la comunicación de fallos al responsable de seguridad. op.exp.5.r1.2 NO EVALUABLE.',
    },
    {
      id: 'P-08',
      name: 'mecanismo_reversion',
      description:
        'Mecanismo previsto para revertir cada tipo de cambio en caso de efectos adversos: snapshot, punto de restauración, backup de configuración, versión anterior en repositorio. Coincide en sustancia con el parámetro homólogo de op.exp.4 (R2) y conviene gestionarlos de forma unificada.',
      level: ['ALTO'],
      requirements: ['op.exp.5.r1.1'],
      type: 'table',
      usage:
        'Power ENS verifica que existe evidencia del punto de reversión en la ventana anterior a cada cambio implantado. Reutiliza la lógica de op.exp.4 EV-09.',
      missingBehavior:
        'R1 parcialmente NO EVALUABLE. No se acredita la previsión de reversión exigida por op.exp.5.r1.1.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el procedimiento de gestión de cambios y los requisitos que ningún evento del sistema puede demostrar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'Power ENS lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed', 'change_request_registered', 'preproduction_test_recorded', 'config_doc_modified', 'service_failed', 'fault_notification_recorded', 'reversion_point_created'],
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
