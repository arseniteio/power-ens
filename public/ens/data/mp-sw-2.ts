import { ENSControl } from '../types';

export const mpSw2Control: ENSControl = {
  id: 'mp.sw.2',
  title: 'Aceptación y puesta en servicio',
  framework: 'ENS',
  category: 'Protección de las aplicaciones informáticas',
  family: 'Medidas de protección',
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
        'mp.sw.2 → Requisito base: mp.sw.2.1 a) y b)',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.sw.2 + R1 → Base + pruebas en entorno aislado de preproducción',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.sw.2 + R1 → Ídem categoría MEDIA. No hay exigencia adicional en ALTA.',
    },
  },
  requirements: [
    {
      id: 'mp.sw.2.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Criterios de aceptación cumplidos sin deteriorar otros componentes',
      description:
        'Se comprobará que: a) Se cumplen los criterios de aceptación en materia de seguridad. b) No se deteriora la seguridad de otros componentes del servicio.',
      evidences: ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
    },
    {
      id: 'mp.sw.2.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Pruebas en un entorno aislado de preproducción',
      description:
        'Las pruebas se realizarán en un entorno aislado (pre-producción).',
      evidences: ['EV-07', 'EV-08'],
    },
    {
      id: 'mp.sw.2.r2.1',
      level: [],
      title: 'Auditoría del código fuente',
      description:
        'Refuerzo R2 – Inspección de código fuente: Se realizará una auditoría de código fuente.',
      evidences: ['EV-10'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: [],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de puestas en servicio de aplicaciones',
      description:
        'Identificación del momento en que una aplicación o una nueva versión entra en producción, a partir de los cambios en el inventario de software de los sistemas de P-01. Es el disparador de todas las demás comprobaciones del control.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.sw.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Existencia de aceptación previa a la puesta en servicio',
      description:
        'Verificación de que cada puesta en servicio detectada en EV-01 estuvo precedida de un acta de aceptación registrada en P-07. El enunciado del control es expreso: la comprobación se hace ANTES de pasar a producción.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.sw.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Diferencial de seguridad del entorno antes y después del despliegue',
      description:
        'Comparación del estado de seguridad de los sistemas afectados en la ventana previa y posterior a la puesta en servicio según P-04: porcentaje de cumplimiento SCA, puertos abiertos, servicios en ejecución y vulnerabilidades detectadas. Es la verificación directa de mp.sw.2.1 b).',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.sw.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Exposición introducida por la aplicación',
      description:
        'Puertos y servicios que aparecen tras el despliegue, contrastados con los previstos para la aplicación en P-06. Un puerto nuevo no declarado amplía el perímetro de exposición sin que nadie lo haya autorizado.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.sw.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Vulnerabilidades introducidas con la aplicación',
      description:
        'Vulnerabilidades conocidas que aparecen en el inventario tras el despliegue, atribuibles a la aplicación o a sus componentes de terceros. Es la forma más concreta de deterioro de seguridad que mp.sw.2.1 b) pretende evitar.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['mp.sw.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación automática de los criterios de aceptación',
      description:
        'Comprobación de los criterios de P-02 que son técnicamente verificables: ausencia de vulnerabilidades por encima del umbral, configuración criptográfica conforme, registro de actividad activo, autenticación según lo exigido.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['mp.sw.2.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Trazabilidad del paso por preproducción (R1)',
      description:
        'Verificación de que la versión desplegada en producción estuvo previamente instalada en el entorno de preproducción emparejado en P-03. R1 es obligatorio desde categoría MEDIA.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['mp.sw.2.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Aislamiento efectivo del entorno de preproducción (R1)',
      description:
        'Verificación de que el entorno de preproducción está realmente aislado: sin rutas hacia producción, sin acceso a datos reales, con credenciales propias. R1 exige expresamente «entorno aislado», y un preproducción conectado a producción no lo es.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['mp.sw.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Estabilidad del servicio tras la puesta en servicio',
      description:
        'Detección de degradación funcional o de seguridad en la ventana posterior al despliegue: errores en volumen anómalo, caídas de servicio, fallos de autenticación nuevos. Da soporte objetivo a la comprobación de «correcto funcionamiento» del enunciado.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-10',
      requirement: ['mp.sw.2.r2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Seguimiento de hallazgos de auditoría de código (R2)',
      description:
        'Si existe auditoría de código fuente conforme a P-08: registro de su realización y seguimiento del cierre de los hallazgos, cruzándolos con las vulnerabilidades observadas en producción.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'aplicaciones_en_alcance',
      description:
        'Aplicaciones del sistema sujetas al control, con los sistemas en que se despliegan, su responsable y si son de desarrollo propio o de terceros.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'table',
      usage:
        'Define el alcance.',
      missingBehavior:
        'El control es NO EVALUABLE. No se puede asociar un despliegue detectado a una aplicación ni a su aceptación.',
    },
    {
      id: 'P-02',
      name: 'criterios_aceptacion_seguridad',
      description:
        'Criterios de aceptación en materia de seguridad que la aplicación debe cumplir antes de pasar a producción, exigidos expresamente por mp.sw.2.1 a). Sin criterios escritos el requisito no tiene referencia.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'list',
      usage:
        'Power ENS verifica automáticamente los criterios que sean comprobables —vulnerabilidades, configuración criptográfica, registro activo— y recoge como declaración los que no lo sean. Es la pieza que convierte el acta de aceptación en algo contrastable.',
      missingBehavior:
        'mp.sw.2.1 a) NO EVALUABLE por falta de referencia. El acta de aceptación queda sin criterios que verificar.',
    },
    {
      id: 'P-03',
      name: 'entorno_preproduccion',
      description:
        'Emparejamiento entre sistemas de producción y sus equivalentes de preproducción, con acreditación de aislamiento. R1 exige entorno aislado. Coincide con el parámetro homólogo de op.exp.4 y op.exp.5 y conviene gestionarlo de forma unificada.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.r1.1'],
      type: 'table',
      usage:
        'Power ENS correlaciona la aparición de una versión en producción con su presencia previa en el par de preproducción. Verifica además el aislamiento: preproducción con ruta abierta a producción no es un entorno aislado, y el refuerzo lo exige expresamente.',
      missingBehavior:
        'R1 NO EVALUABLE desde categoría MEDIA. No se puede acreditar el paso por un entorno aislado.',
    },
    {
      id: 'P-04',
      name: 'ventana_medicion_deterioro_dias',
      description:
        'Días antes y después de la puesta en servicio que Power ENS compara para determinar si se ha deteriorado la seguridad de otros componentes del servicio, como exige mp.sw.2.1 b).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'duration_days',
      usage:
        'Define la ventana del análisis diferencial: cumplimiento SCA, puertos abiertos, servicios en ejecución y vulnerabilidades antes y después. Es la forma de medir el deterioro en lugar de declararlo.',
      missingBehavior:
        'Se aplica una ventana por defecto. La medición de deterioro pierde precisión pero sigue siendo posible.',
    },
    {
      id: 'P-05',
      name: 'umbral_deterioro_aceptable',
      description:
        'Variación admisible en los indicadores de seguridad del entorno tras el despliegue antes de considerar que hay deterioro: descenso de cumplimiento SCA, puertos nuevos, vulnerabilidades introducidas.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'table',
      usage:
        'Define cuándo el diferencial de EV-03 es hallazgo. Para vulnerabilidades críticas lo razonable es tolerancia cero; para puertos, admitir los declarados como necesarios por la aplicación.',
      missingBehavior:
        'Cualquier variación se reporta como deterioro, lo que produce ruido y acaba desatendiéndose.',
    },
    {
      id: 'P-06',
      name: 'puertos_servicios_previstos_app',
      description:
        'Puertos y servicios que cada aplicación de P-01 necesita legítimamente exponer, declarados antes del despliegue. Permite distinguir un puerto nuevo previsto de uno inesperado.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'table',
      usage:
        'Power ENS contrasta los puertos y servicios que aparecen tras el despliegue con esta declaración. Puerto nuevo no previsto → deterioro del perímetro de exposición. Enlaza con op.exp.2 (mínima funcionalidad) y con mp.com.1.',
      missingBehavior:
        'No se puede distinguir exposición legítima de la aplicación de exposición accidental introducida con ella.',
    },
    {
      id: 'P-07',
      name: 'registro_actas_aceptacion',
      description:
        'Registro de las actas de aceptación con su fecha, aplicación, versión, criterios verificados, resultado y quién aceptó. Es la evidencia documental del requisito base.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'table',
      usage:
        'Power ENS conserva el registro y lo contrasta con las puestas en servicio efectivamente detectadas. Despliegue en producción sin acta previa → hallazgo del enunciado del control, que exige comprobación ANTES de pasar a producción.',
      missingBehavior:
        'mp.sw.2.1 sin acreditación documental. No consta que la comprobación previa se haya realizado.',
    },
    {
      id: 'P-08',
      name: 'auditoria_codigo_fuente',
      description:
        'Auditorías de código fuente realizadas, con fecha, alcance, metodología y hallazgos. Corresponde a R2, no obligatorio en ninguna categoría, pero relevante en aplicaciones de desarrollo propio.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.r2.1'],
      type: 'table',
      usage:
        'Power ENS registra la realización y hace seguimiento del cierre de hallazgos, cruzándolos con las vulnerabilidades que el Vulnerability Detector observe en producción. La auditoría de código en sí es un servicio o una herramienta SAST, no una funcionalidad de Wazuh.',
      missingBehavior:
        'R2 sin acreditar. No supone incumplimiento al no ser exigible en ninguna categoría.',
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
