import { ENSControl } from '../types';

export const mpS1Control: ENSControl = {
  id: 'mp.s.1',
  title: 'Protección del correo electrónico',
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
      status: 'PARCIAL',
      score: 86,
      condition:
        'mp.s.1 → Requisitos base: mp.s.1.1 a mp.s.1.7 Sin evidencia tecnica en: mp.s.1.6, por lo que el nivel no puede pasar de PARCIAL.',
    },
    medio: {
      status: 'PARCIAL',
      score: 86,
      condition:
        'mp.s.1 → Ídem categoría BÁSICA. Sin evidencia tecnica en: mp.s.1.6, por lo que el nivel no puede pasar de PARCIAL.',
    },
    alto: {
      status: 'PARCIAL',
      score: 86,
      condition:
        'mp.s.1 → Ídem categoría BÁSICA. No existen refuerzos en este control. Sin evidencia tecnica en: mp.s.1.6, por lo que el nivel no puede pasar de PARCIAL.',
    },
  },
  requirements: [
    {
      id: 'mp.s.1.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Protección del cuerpo de los mensajes y de los anexos',
      description:
        'La información distribuida por medio de correo electrónico se protegerá, tanto en el cuerpo de los mensajes como en los anexos.',
      evidences: ['EV-06', 'EV-09'],
    },
    {
      id: 'mp.s.1.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Protección del encaminamiento y del establecimiento de conexiones',
      description:
        'Se protegerá la información de encaminamiento de mensajes y establecimiento de conexiones.',
      evidences: ['EV-06', 'EV-07', 'EV-08', 'EV-09'],
    },
    {
      id: 'mp.s.1.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Protección frente al correo no solicitado',
      description:
        'Correo no solicitado, en su expresión inglesa «spam».',
      evidences: ['EV-01', 'EV-02', 'EV-08', 'EV-09'],
    },
    {
      id: 'mp.s.1.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Protección frente al código dañino',
      description:
        'Código dañino, constituidos por virus, gusanos, troyanos, espías, u otros de naturaleza análoga.',
      evidences: ['EV-01', 'EV-03', 'EV-04', 'EV-09'],
    },
    {
      id: 'mp.s.1.5',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Protección frente al código móvil',
      description:
        'Código móvil de tipo micro-aplicación, en su expresión inglesa «applet».',
      evidences: ['EV-01', 'EV-05', 'EV-09'],
    },
    {
      id: 'mp.s.1.6',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Normas de uso: limitaciones a las comunicaciones privadas',
      description:
        'Limitaciones al uso como soporte de comunicaciones privadas.',
      evidences: [],
    },
    {
      id: 'mp.s.1.7',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Concienciación y formación sobre el uso del correo',
      description:
        'Actividades de concienciación y formación relativas al uso del correo electrónico.',
      evidences: ['EV-10'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.s.1.3', 'mp.s.1.4', 'mp.s.1.5'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ingesta de los registros de la plataforma de correo',
      description:
        'Recolección de los eventos del servicio de correo y de su pasarela de seguridad declarados en P-01: mensajes entregados, filtrados, en cuarentena, con detección, y resultado de cada filtro. Es la base de todo el bloque de amenazas del control.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.s.1.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Eficacia del filtrado de correo no solicitado',
      description:
        'Volumen de mensajes clasificados como no solicitados, entregados, puestos en cuarentena y liberados, con la tasa de falsos positivos aparente. Acredita que el filtro de mp.s.1.3 no solo existe sino que opera y está razonablemente calibrado.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.s.1.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detecciones de código dañino en el correo',
      description:
        'Detecciones registradas en mensajes y anexos por tipo de amenaza, con el destinatario, el remitente y la acción aplicada. mp.s.1.4 enumera expresamente virus, gusanos, troyanos y espías, de modo que conviene desglosar por categoría.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.s.1.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación del análisis de anexos sobre todo el correo',
      description:
        'Comprobación de que el análisis de código dañino se ejecuta sobre todos los mensajes con anexo y no se omite por tamaño, tipo de fichero, cifrado del anexo o remitente en lista de confianza. Las omisiones son el hueco por el que entra lo que entra.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.s.1.5'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Tratamiento del código móvil y del contenido activo',
      description:
        'Verificación de que el contenido activo en los mensajes se bloquea o neutraliza conforme a P-07: anexos con macros, scripts en cuerpos HTML, ejecutables, aplicaciones embebidas. Acredita mp.s.1.5.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['mp.s.1.1', 'mp.s.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cifrado en tránsito del correo',
      description:
        'Verificación de que el correo viaja cifrado conforme a P-03: versión de TLS negociada en los saltos SMTP entrantes y salientes, y porcentaje de correo que viaja en claro. Acredita la parte de tránsito de mp.s.1.1 y de mp.s.1.2.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['mp.s.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Autenticación del dominio: SPF, DKIM y DMARC',
      description:
        'Verificación de la existencia y coherencia de los registros de P-02 y análisis de los informes agregados de DMARC. Protege la información de encaminamiento de mp.s.1.2 y previene la suplantación del dominio propio. NOTA: estos mecanismos no aparecen nombrados en el texto del ENS; son el medio estándar de cumplir el requisito, no una exigencia literal.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['mp.s.1.2', 'mp.s.1.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Suplantación del dominio propio y fraude por correo',
      description:
        'Detección de mensajes que suplantan el dominio o la identidad de personas de la organización: fallos de alineación DMARC, dominios similares al propio, remitente interno con origen externo. Es la amenaza de mayor impacto económico del correo y se apoya en mp.s.1.2.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['mp.s.1.1', 'mp.s.1.2', 'mp.s.1.3', 'mp.s.1.4', 'mp.s.1.5'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Integridad de la configuración del servicio de correo',
      description:
        'Vigilancia de los cambios en la configuración del MTA, de las reglas de la pasarela y de los registros DNS del dominio, para detectar degradaciones: desactivación de un filtro, relajación de TLS, alteración de SPF, incorporación de remitentes a lista de confianza.',
      format: 'fim_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-10',
      requirement: ['mp.s.1.7'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Resultados de las campañas de concienciación',
      description:
        'Si se realizan campañas de phishing simulado conforme a P-09: tasa de apertura, de clic y de notificación por parte de los usuarios. Es la única parte del bloque normativo que produce datos aprovechables, y da una métrica de eficacia de la concienciación de mp.s.1.7.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'plataforma_correo',
      description:
        'Solución de correo electrónico empleada, su pasarela de seguridad y la forma en que ambas envían registros a Wazuh. Sin ingesta no hay evidencia del funcionamiento de ninguno de los filtros.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.1.1', 'mp.s.1.2', 'mp.s.1.3', 'mp.s.1.4', 'mp.s.1.5', 'mp.s.1.6', 'mp.s.1.7'],
      type: 'select',
      usage:
        'Define los decodificadores y el módulo de integración. Para correo en la nube se emplea el conector correspondiente; para infraestructura propia, log collection del MTA y del filtro. Es el parámetro que habilita todo lo demás.',
      missingBehavior:
        'El control es NO EVALUABLE en su parte técnica. No hay evidencia de que los filtros operen.',
    },
    {
      id: 'P-02',
      name: 'dominios_correo_propios',
      description:
        'Dominios de correo de la organización, con su configuración de autenticación: registros SPF, DKIM y DMARC, y política declarada en DMARC.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.1.2'],
      type: 'table',
      usage:
        'Power ENS verifica la existencia y coherencia de estos registros y vigila su alteración. Protegen la información de encaminamiento y previenen la suplantación del dominio propio, que es la vía más común de fraude por correo.',
      missingBehavior:
        'mp.s.1.2 acreditado solo parcialmente. El dominio queda expuesto a suplantación sin detección.',
    },
    {
      id: 'P-03',
      name: 'requisitos_tls_correo',
      description:
        'Exigencias de cifrado en tránsito para el correo: versión mínima de TLS en los saltos SMTP, si se exige TLS obligatorio con determinados destinos, y tratamiento del correo que llega sin cifrar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.1.1', 'mp.s.1.2'],
      type: 'string',
      usage:
        'SCA verifica la configuración del MTA y los logs permiten comprobar qué porcentaje del correo viaja cifrado y con qué versión. Correo en claro hacia destinos que admiten TLS → hallazgo de mp.s.1.1.',
      missingBehavior:
        'No se puede verificar la protección en tránsito del cuerpo ni de los anexos.',
    },
    {
      id: 'P-04',
      name: 'criterios_cifrado_contenido',
      description:
        'Supuestos en que el contenido del mensaje o sus anexos deben ir cifrados más allá del cifrado en tránsito, en función de la confidencialidad de la información. mp.s.1.1 pide proteger cuerpo y anexos, y el TLS de transporte no protege el mensaje en reposo en los buzones intermedios.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.1.1'],
      type: 'table',
      usage:
        'Power ENS recoge el criterio y, cuando la pasarela lo registre, verifica su aplicación en los envíos que cumplan el supuesto. Es un requisito que la mayoría de las implantaciones resuelve solo con TLS, lo que deja el mensaje sin proteger en reposo.',
      missingBehavior:
        'mp.s.1.1 acreditado solo en tránsito. El contenido queda sin protección en los buzones y servidores intermedios.',
    },
    {
      id: 'P-05',
      name: 'filtro_antispam',
      description:
        'Mecanismo de filtrado de correo no solicitado, su configuración y los umbrales aplicados. mp.s.1.3 lo exige desde categoría BÁSICA.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.1.3'],
      type: 'string',
      usage:
        'Power ENS mide el volumen filtrado y la eficacia a partir de los logs: mensajes clasificados como spam, entregados, en cuarentena y liberados. Un filtro con tasa de liberación muy alta está mal calibrado.',
      missingBehavior:
        'mp.s.1.3 NO EVALUABLE. No se puede acreditar que el filtro de correo no solicitado opere.',
    },
    {
      id: 'P-06',
      name: 'analisis_codigo_danino_correo',
      description:
        'Mecanismo de análisis de código dañino en mensajes y anexos, con su configuración: análisis de anexos, detonación en entorno aislado si existe, reescritura de enlaces. mp.s.1.4 enumera virus, gusanos, troyanos y espías.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.1.4'],
      type: 'string',
      usage:
        'Power ENS mide las detecciones por tipo de amenaza y verifica que el análisis se ejecuta sobre todos los mensajes con anexo. Enlaza con op.exp.6: el correo es la vía de entrada principal de código dañino y mp.s.1.4 es su control específico.',
      missingBehavior:
        'mp.s.1.4 NO EVALUABLE. La principal vía de entrada de código dañino queda sin verificación.',
    },
    {
      id: 'P-07',
      name: 'tratamiento_codigo_movil',
      description:
        'Tratamiento del código móvil de tipo micro-aplicación en el correo: bloqueo de contenido activo, desactivación de macros en anexos, eliminación de scripts en HTML. mp.s.1.5 lo exige expresamente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.1.5'],
      type: 'select',
      usage:
        'Power ENS verifica en los logs de la pasarela que el contenido activo se bloquea o neutraliza, y mide el volumen afectado. Es el requisito más olvidado de los tres de amenazas, pese a que las macros siguen siendo un vector habitual.',
      missingBehavior:
        'mp.s.1.5 NO EVALUABLE. El código móvil en el correo queda sin tratamiento verificable.',
    },
    {
      id: 'P-08',
      name: 'normas_uso_correo',
      description:
        'Referencia a las normas de uso del correo electrónico para el personal, con las limitaciones al uso como soporte de comunicaciones privadas de mp.s.1.6 y su registro de difusión. Remite expresamente a org.2.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.1.6'],
      type: 'string',
      usage:
        'Acreditación documental. No es verificable técnicamente: el uso privado del correo corporativo no se detecta con un SIEM, y pretender medirlo plantearía además problemas de proporcionalidad.',
      missingBehavior:
        'mp.s.1.6 NO ACREDITADO. Requisito de naturaleza normativa, sin cobertura técnica posible.',
    },
    {
      id: 'P-09',
      name: 'concienciacion_correo',
      description:
        'Actividades de concienciación y formación relativas al uso del correo electrónico realizadas, con fecha, alcance y participación. mp.s.1.7 las exige expresamente como contenido de las normas de uso.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.1.7'],
      type: 'table',
      usage:
        'Registro documental en Power ENS, enlazado con mp.per.3 y mp.per.4. Si se realizan campañas de phishing simulado, sus resultados sí son datos aprovechables y dan una métrica de eficacia de la concienciación.',
      missingBehavior:
        'mp.s.1.7 NO ACREDITADO. Es, junto a mp.s.1.6, la pata normativa del control.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar las normas de uso del correo electrónico (mp.s.1.6), que ninguna medida técnica puede demostrar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'Power ENS lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
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
