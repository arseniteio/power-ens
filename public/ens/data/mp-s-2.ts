import { ENSControl } from '../types';

export const mpS2Control: ENSControl = {
  id: 'mp.s.2',
  title: 'Protección de servicios y aplicaciones web',
  framework: 'ENS',
  category: 'Protección de los servicios',
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
        'mp.s.2 + [R1 o R2] → Base + UNA de las dos modalidades de auditoría',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.s.2 + [R1 o R2] → Ídem categoría BÁSICA.',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.s.2 + R2 + R3 → Base + auditoría de caja blanca obligatoria (R1 excluido) + protección de cachés',
    },
  },
  requirements: [
    {
      id: 'mp.s.2.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Imposible acceder a la información obviando la autenticación',
      description:
        'Cuando la información requiera control de acceso se garantizará la imposibilidad de acceder a la información obviando la autenticación, en particular, tomando medidas en los siguientes aspectos: a) Se evitará que el servidor ofrezca acceso a los documentos por vías alternativas al protocolo determinado. b) Se prevendrán ataques de manipulación del localizador uniforme de recursos (URL). c) Se prevendrán ataques de manipulación de fragmentos de información que se almacena en el disco duro del visitante de una página web a través de su navegador, a petición del servidor de la página, conocido en terminología inglesa como cookies. d) Se prevendrán ataques de inyección de código.',
      evidences: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
    },
    {
      id: 'mp.s.2.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Prevención del escalado de privilegios',
      description:
        'Se prevendrán intentos de escalado de privilegios.',
      evidences: ['EV-01', 'EV-07', 'EV-09'],
    },
    {
      id: 'mp.s.2.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Prevención del cross site scripting',
      description:
        'Se prevendrán ataques de cross site scripting.',
      evidences: ['EV-01', 'EV-08', 'EV-09'],
    },
    {
      id: 'mp.s.2.r1.1',
      level: ['BAJO', 'MEDIO'],
      title: 'Auditorías de caja negra antes de producción',
      description:
        'Se realizarán auditorías continuas de seguridad de «caja negra» sobre las aplicaciones web durante la fase de desarrollo y antes de la fase de producción.',
      evidences: ['EV-11'],
    },
    {
      id: 'mp.s.2.r1.2',
      level: ['BAJO', 'MEDIO'],
      title: 'Frecuencia de auditoría definida en el procedimiento',
      description:
        'La frecuencia de estas auditorías de seguridad quedará definida en el procedimiento de auditoría.',
      evidences: ['EV-11'],
    },
    {
      id: 'mp.s.2.r2.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Auditorías de caja blanca durante el desarrollo',
      description:
        'Se realizarán auditorías de seguridad de «caja blanca» sobre las aplicaciones web durante la fase de desarrollo.',
      evidences: ['EV-11'],
    },
    {
      id: 'mp.s.2.r2.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Metodologías y herramientas automáticas de detección',
      description:
        'Se emplearán metodologías definidas y herramientas automáticas de detección de vulnerabilidades en la realización de las auditorías de seguridad sobre las aplicaciones web.',
      evidences: ['EV-10', 'EV-11'],
    },
    {
      id: 'mp.s.2.r2.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Resolución de las vulnerabilidades encontradas',
      description:
        'Una vez finalizada una auditoría de seguridad, se analizarán los resultados y se solventarán las vulnerabilidades encontradas mediante los procedimientos definidos [op.exp.5].',
      evidences: ['EV-12'],
    },
    {
      id: 'mp.s.2.r3.1',
      level: ['ALTO'],
      title: 'Protección de proxies y cachés',
      description:
        'Se prevendrán ataques de manipulación de programas o dispositivos que realizan una acción en representación de otros, conocidos en terminología inglesa como «proxies» y, sistemas especiales de almacenamiento de alta velocidad, conocidos en terminología inglesa como «cachés».',
      evidences: ['EV-13'],
      active: false,
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.s.2.1', 'mp.s.2.2', 'mp.s.2.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ingesta de los registros de los servidores y aplicaciones web',
      description:
        'Recolección de los registros de acceso y de error de los servidores de P-02, y del WAF si existe. Es la fuente de detección de las seis amenazas que enumera el requisito base y la base de todo el control.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.s.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Acceso a información protegida obviando la autenticación',
      description:
        'Detección de accesos exitosos a las rutas de P-03 sin que conste autenticación previa en la misma sesión. Es el supuesto central que mp.s.2.1 pretende impedir y la comprobación más directa del requisito.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.s.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Vías alternativas de acceso a los documentos',
      description:
        'Verificación de que están cerradas las vías de P-04: listado de directorios desactivado, acceso directo a ficheros no permitido, métodos HTTP no previstos deshabilitados. Y detección de accesos exitosos por esas vías. Acredita mp.s.2.1 a).',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.s.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ataques de manipulación de URL y recorrido de rutas',
      description:
        'Detección de intentos de manipulación del localizador de recursos: recorrido de directorios, codificaciones anómalas, inclusión de ficheros, acceso a rutas no publicadas. Acredita mp.s.2.1 b).',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.s.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Protección de las cookies de sesión',
      description:
        'Verificación de los atributos de P-05 en las cookies emitidas y detección de uso anómalo: misma cookie de sesión desde orígenes distintos, reutilización tras cierre de sesión, ausencia de rotación tras autenticación. Acredita mp.s.2.1 c).',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['mp.s.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ataques de inyección de código',
      description:
        'Detección de intentos de inyección en sus variantes habituales: inyección SQL, de órdenes del sistema, de plantillas, de objetos serializados, inclusión de ficheros. Acredita mp.s.2.1 d), que es la amenaza con más impacto potencial del requisito.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['mp.s.2.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Intentos de escalado de privilegios en la aplicación',
      description:
        'Detección de accesos a funcionalidad o datos de otro nivel de privilegio: acceso a rutas administrativas por cuentas sin ese perfil, manipulación de identificadores para acceder a recursos ajenos, cambios de rol no previstos. Acredita mp.s.2.2.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['mp.s.2.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ataques de cross site scripting',
      description:
        'Detección de intentos de inyección de scripts en los parámetros de las peticiones, tanto reflejados como almacenados, y de los indicios de su ejecución en el navegador del usuario. Acredita mp.s.2.3, que el ENS menciona como requisito independiente.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['mp.s.2.1', 'mp.s.2.2', 'mp.s.2.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Distinción entre intento y ataque exitoso',
      description:
        'Correlación de cada detección de ataque web con la respuesta del servidor y con la actividad posterior, para distinguir el intento bloqueado del ataque que surtió efecto. Es la diferencia entre un informe que dice «nos atacan» y uno que dice «el ataque funcionó».',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-10',
      requirement: ['mp.s.2.r2.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Vulnerabilidades del servidor y de la plataforma web',
      description:
        'Detección de vulnerabilidades conocidas en el servidor web, el motor de aplicaciones y sus componentes, y verificación de su configuración de seguridad. Complementa las auditorías de aplicación con la capa de plataforma, que las auditorías de código no cubren.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-11',
      requirement: ['mp.s.2.r1.1', 'mp.s.2.r1.2', 'mp.s.2.r2.1', 'mp.s.2.r2.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Registro y frecuencia de las auditorías de seguridad',
      description:
        'Constancia de las auditorías de P-08 con su modalidad, metodología y herramientas, y control de que se cumple la frecuencia del procedimiento de P-06. Incluye la verificación de admisibilidad de la modalidad para la categoría del sistema.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-12',
      requirement: ['mp.s.2.r2.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Resolución efectiva de los hallazgos de auditoría (R2)',
      description:
        'Seguimiento del cierre de los hallazgos de P-09 y verificación de que los declarados resueltos ya no son detectables en producción. mp.s.2.r2.3 exige solventar las vulnerabilidades encontradas, no solo registrarlas.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-13',
      requirement: ['mp.s.2.r3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Protección de proxies y cachés (R3)',
      description:
        'Verificación de la configuración de los elementos de P-10 frente a sus ataques característicos: envenenamiento de caché, confusión en el tratamiento de peticiones, almacenamiento en caché de respuestas autenticadas. R3 es obligatorio en categoría ALTA.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'aplicaciones_web_en_alcance',
      description:
        'Aplicaciones y servicios web del sistema, con su URL, servidor, exposición (interna o a internet), tecnología y si requieren control de acceso. El requisito base se refiere específicamente al caso en que «la información requiera control de acceso».',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.2.1'],
      type: 'table',
      usage:
        'Define el alcance.',
      missingBehavior:
        'El control es NO EVALUABLE. Sin inventario de aplicaciones web no hay alcance ni priorización posible.',
    },
    {
      id: 'P-02',
      name: 'logs_servidores_web',
      description:
        'Servidores web y de aplicaciones con la ubicación de sus registros de acceso y de error, y el WAF si existe. Es la fuente de detección de todas las amenazas que enumera el requisito base.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.2.1', 'mp.s.2.2', 'mp.s.2.3'],
      type: 'table',
      usage:
        'Habilita log collection con los decodificadores correspondientes y las reglas de ataque web de Wazuh. Conviene registrar también los cuerpos de petición en los endpoints sensibles cuando sea viable, porque la inyección de código no siempre es visible en la URL.',
      missingBehavior:
        'Sin registros no hay detección de ninguna de las seis amenazas. El control queda reducido a declaración.',
    },
    {
      id: 'P-03',
      name: 'endpoints_autenticados',
      description:
        'Rutas y recursos que exigen autenticación en cada aplicación, con el mecanismo empleado. mp.s.2.1 pide garantizar la imposibilidad de acceder a la información obviando la autenticación, lo que exige saber qué debería estar protegido.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.2.1'],
      type: 'table',
      usage:
        'Power ENS detecta accesos exitosos a estas rutas sin autenticación previa registrada, que es exactamente el supuesto que el requisito pretende impedir. Es la comprobación más directa de mp.s.2.1.',
      missingBehavior:
        'mp.s.2.1 NO EVALUABLE en su enunciado principal. No se puede detectar un acceso que obvia la autenticación.',
    },
    {
      id: 'P-04',
      name: 'vias_alternativas_prohibidas',
      description:
        'Vías alternativas de acceso a los documentos que deben estar cerradas conforme a mp.s.2.1 a): listado de directorios, acceso directo a ficheros estáticos, métodos HTTP no previstos, protocolos adicionales en el mismo servidor.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.2.1'],
      type: 'table',
      usage:
        'SCA verifica la configuración del servidor y las reglas detectan los accesos exitosos por estas vías. Es el apartado más olvidado del requisito y el que suele permitir descargar documentos sin pasar por la aplicación.',
      missingBehavior:
        'mp.s.2.1 a) NO EVALUABLE. El acceso directo a documentos sin autenticación puede pasar inadvertido.',
    },
    {
      id: 'P-05',
      name: 'config_cookies',
      description:
        'Atributos de seguridad exigidos a las cookies de sesión: Secure, HttpOnly, SameSite, ámbito y caducidad. mp.s.2.1 c) pide prevenir los ataques de manipulación de cookies.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.2.1'],
      type: 'string',
      usage:
        'SCA y análisis de las cabeceras de respuesta verifican estos atributos. Las reglas detectan además el uso de una misma cookie de sesión desde orígenes distintos, que es el indicio de manipulación o robo. Enlaza con mp.com.3.2 c) (secuestro de sesión).',
      missingBehavior:
        'mp.s.2.1 c) NO EVALUABLE. Las cookies de sesión quedan sin verificación de sus atributos de protección.',
    },
    {
      id: 'P-06',
      name: 'procedimiento_auditoria_web',
      description:
        'Procedimiento de auditoría de las aplicaciones web con la frecuencia de las auditorías, exigida expresamente por mp.s.2.r1.2, y la modalidad empleada. Es el documento al que el refuerzo remite.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.2.r1.2'],
      type: 'string',
      usage:
        'Power ENS registra la referencia y controla el cumplimiento de la frecuencia declarada. Sin procedimiento con frecuencia definida, el refuerzo elegido queda sin umbral verificable.',
      missingBehavior:
        'El refuerzo de auditoría queda sin frecuencia verificable. mp.s.2.r1.2 NO ACREDITADO.',
    },
    {
      id: 'P-07',
      name: 'modalidad_auditoria',
      description:
        'Modalidad de auditoría implementada: R1 (caja negra) o R2 (caja blanca). Es una elección entre opciones en BÁSICA y MEDIA. ATENCIÓN: en categoría ALTA R1 no figura entre las opciones admisibles y R2 es obligatorio.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.2.r1.1', 'mp.s.2.r2.1'],
      type: 'select',
      usage:
        'Determina qué refuerzo evalúa Power ENS. Si la categoría es ALTA y P-07 = R1, se emite incumplimiento directo: la auditoría de caja negra deja de ser suficiente al subir a ALTA.',
      missingBehavior:
        'No se puede determinar qué refuerzo es aplicable ni verificar su admisibilidad para la categoría.',
    },
    {
      id: 'P-08',
      name: 'registro_auditorias_web',
      description:
        'Registro de las auditorías realizadas con fecha, aplicación, modalidad, metodología, herramientas empleadas y hallazgos. R2 exige expresamente metodologías definidas y herramientas automáticas.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.2.r1.1', 'mp.s.2.r2.1', 'mp.s.2.r2.2'],
      type: 'table',
      usage:
        'Power ENS conserva el histórico, controla la frecuencia de P-06 y verifica que en modalidad R2 constan metodología y herramientas, que son exigencia expresa de mp.s.2.r2.2.',
      missingBehavior:
        'El refuerzo de auditoría queda sin acreditación documental. No consta qué se auditó ni con qué.',
    },
    {
      id: 'P-09',
      name: 'seguimiento_hallazgos_auditoria',
      description:
        'Hallazgos de cada auditoría con su severidad, responsable, plazo y estado de resolución. mp.s.2.r2.3 es el requisito más exigente del control: no basta auditar, hay que SOLVENTAR las vulnerabilidades encontradas por los procedimientos de op.exp.5.',
      level: ['ALTO'],
      requirements: ['mp.s.2.r2.3'],
      type: 'table',
      usage:
        'Power ENS hace seguimiento del cierre y alerta de hallazgos abiertos fuera de plazo. Cruza además con las detecciones en producción: un hallazgo declarado cerrado cuyo patrón sigue detectándose no está cerrado.',
      missingBehavior:
        'mp.s.2.r2.3 NO EVALUABLE. Es el incumplimiento más frecuente: se audita y no se corrige.',
    },
    {
      id: 'P-10',
      name: 'proxies_caches',
      description:
        'Proxies y sistemas de caché en la ruta de los servicios web, con su configuración. R3 es obligatorio en categoría ALTA y se refiere a la manipulación de estos elementos.',
      level: ['ALTO'],
      requirements: ['mp.s.2.r3.1'],
      type: 'table',
      usage:
        'Power ENS verifica la configuración frente a los ataques característicos —envenenamiento de caché, confusión de petición, caché de respuestas autenticadas— e ingiere sus registros para detectar intentos. Una caché que almacena respuestas autenticadas es una fuga de información entre usuarios.',
      missingBehavior:
        'R3 NO EVALUABLE y es obligatorio en categoría ALTA. Los ataques sobre caché y proxy pasan inadvertidos.',
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
