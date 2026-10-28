import { ENSControl } from '../types';

export const mpS3Control: ENSControl = {
  id: 'mp.s.3',
  title: 'Protección de la navegación web',
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
        'mp.s.3 → Requisitos base: mp.s.3.1 a mp.s.3.7',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.s.3 → Ídem categoría BÁSICA.',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.s.3 + R1 → Base + registro de navegación, inspección de canales cifrados y lista negra',
    },
  },
  requirements: [
    {
      id: 'mp.s.3.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Normativa de utilización de la navegación',
      description:
        'Se establecerá una normativa de utilización, definiendo el uso que se autoriza y las limitaciones de uso personal. En particular, se concretará el uso permitido de conexiones cifradas.',
      evidences: ['EV-12'],
    },
    {
      id: 'mp.s.3.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Concienciación regular sobre higiene en la navegación',
      description:
        'Se llevarán a cabo regularmente actividades de concienciación sobre higiene en la navegación web, fomentando el uso seguro y alertando de usos incorrectos.',
      evidences: ['EV-12'],
    },
    {
      id: 'mp.s.3.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Formación de los administradores en monitorización y respuesta',
      description:
        'Se formará al personal encargado de la administración del sistema en monitorización del servicio y respuesta a incidentes.',
      evidences: ['EV-12'],
    },
    {
      id: 'mp.s.3.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Protección de la resolución de nombres y de las conexiones',
      description:
        'Se protegerá la información de resolución de direcciones web y de establecimiento de conexiones.',
      evidences: ['EV-05', 'EV-11'],
    },
    {
      id: 'mp.s.3.5',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Protección frente a problemas que llegan por la navegación',
      description:
        'Se protegerá a la organización en general y al puesto de trabajo en particular frente a problemas que se materializan vía navegación web.',
      evidences: ['EV-01', 'EV-02', 'EV-04', 'EV-06', 'EV-11'],
    },
    {
      id: 'mp.s.3.6',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Protección frente a código dañino y contenido activo',
      description:
        'Se protegerá contra la actuación de programas dañinos tales como páginas activas, descargas de código ejecutable, etc., previniendo la exposición del sistema a vectores de ataque del tipo spyware, ransomware, etc.',
      evidences: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-06'],
    },
    {
      id: 'mp.s.3.7',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Política ejecutiva de control de cookies',
      description:
        'Se establecerá una política ejecutiva de control de cookies, en particular, para evitar la contaminación entre uso personal y uso organizativo.',
      evidences: ['EV-07'],
    },
    {
      id: 'mp.s.3.r1.1',
      level: ['ALTO'],
      title: 'Registro del uso de la navegación con su retención',
      description:
        'Se registrará el uso de la navegación web, estableciendo los elementos que se registran, el periodo de retención de estos registros y el uso que el organismo prevé hacer de ellos.',
      evidences: ['EV-08'],
      active: false,
    },
    {
      id: 'mp.s.3.r1.2',
      level: ['ALTO'],
      title: 'Inspección de canales cifrados con exclusiones declaradas',
      description:
        'Se establecerá una función para la ruptura de canales cifrados a fin de inspeccionar su contenido, indicando qué se analiza, qué se registra, durante cuánto tiempo se retienen los registros y qué uso prevé hacer el organismo de estas inspecciones. Todo ello sin perjuicio de que se puedan autorizar accesos cifrados singulares a destinos de confianza.',
      evidences: ['EV-09'],
      active: false,
    },
    {
      id: 'mp.s.3.r1.3',
      level: ['ALTO'],
      title: 'Lista negra de destinos vetados',
      description:
        'Se establecerá una lista negra de destinos vetados.',
      evidences: ['EV-10'],
      active: false,
    },
    {
      id: 'mp.s.3.r2.1',
      level: [],
      title: 'Lista blanca de destinos accesibles',
      description:
        'Refuerzo R2 – Destinos autorizados: Se establecerá una lista blanca de destinos accesibles. Todo acceso fuera de los lugares señalados en la lista blanca estará vetado, salvo autorización singular expresa.',
      evidences: [],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.s.3.5', 'mp.s.3.6'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ingesta de los registros del filtrado de navegación',
      description:
        'Recolección de los eventos del proxy o solución de filtrado de P-02: peticiones permitidas y bloqueadas, con categoría del destino, usuario, URL y motivo del bloqueo. Es la fuente de evidencia de la mayor parte del control.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.s.3.5', 'mp.s.3.6'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Eficacia del filtrado por categorías',
      description:
        'Volumen de accesos bloqueados por cada categoría de P-03 y evolución en el período. Acredita que el filtrado opera efectivamente sobre las categorías declaradas y no solo está configurado, y permite detectar categorías que no producen bloqueos por estar mal aplicadas.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.s.3.6'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Bloqueo de descargas de código ejecutable y contenido activo',
      description:
        'Verificación de que se bloquean las descargas de ejecutables y el contenido activo conforme a P-03, que es lo que mp.s.3.6 pide prevenir de forma expresa al mencionar páginas activas y descargas de código ejecutable.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.s.3.5', 'mp.s.3.6'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Accesos a destinos de reputación maliciosa',
      description:
        'Detección de accesos o intentos hacia destinos asociados a malware, phishing o infraestructura de mando y control, con el usuario y el puesto implicados. Un acceso exitoso a este tipo de destino exige verificación del puesto.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.s.3.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Protección de la resolución de nombres',
      description:
        'Verificación de que la resolución de direcciones web se realiza solo por los resolutores autorizados en P-04 y detección de intentos de evasión: consultas a resolutores externos, resolución por canales alternativos, uso de resolución cifrada no autorizada. Acredita mp.s.3.4.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['mp.s.3.5', 'mp.s.3.6'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Protección del puesto frente a amenazas de navegación',
      description:
        'Verificación de la configuración de seguridad del navegador gestionado y de las defensas del puesto frente a lo que llega por la web: complementos no autorizados, políticas de descarga, protección contra ransomware y spyware. Acredita mp.s.3.5 y mp.s.3.6 en el ámbito del puesto.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['mp.s.3.7'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Política de control de cookies',
      description:
        'Verificación de la configuración de cookies conforme a P-05, orientada a evitar la contaminación entre uso personal y organizativo: perfiles separados, tratamiento de cookies de terceros, ausencia de sincronización con cuentas personales. Acredita mp.s.3.7.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['mp.s.3.r1.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Registro del uso de la navegación web (R1)',
      description:
        'Registro de los elementos declarados en P-08 con la retención declarada. mp.s.3.r1.1 exige que se establezcan expresamente los elementos registrados, el período de retención y el uso previsto, de modo que la evidencia es tanto el registro como su declaración.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-09',
      requirement: ['mp.s.3.r1.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Inspección de canales cifrados y respeto de las exclusiones (R1)',
      description:
        'Verificación de que la inspección de tráfico cifrado se aplica dentro de los límites declarados en P-09 y de que respeta los destinos de confianza excluidos. El ENS prevé expresamente la salvedad de los accesos cifrados singulares a destinos de confianza.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-10',
      requirement: ['mp.s.3.r1.3'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Intentos de acceso a destinos de la lista negra (R1)',
      description:
        'Detección de intentos de acceso a los destinos vetados en P-10, incluidos los que no pasen por el proxy y por tanto no quedarían bloqueados por él. mp.s.3.r1.3 exige establecer la lista negra; detectar los intentos es lo que demuestra que opera.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-11',
      requirement: ['mp.s.3.4', 'mp.s.3.5'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Evasión del filtrado de navegación',
      description:
        'Detección de intentos de eludir el control de navegación: uso de resolutores o canales de resolución alternativos, túneles, servicios de anonimización, navegación por puertos no estándar, conexiones directas sin pasar por el proxy.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-12',
      requirement: ['mp.s.3.1', 'mp.s.3.2', 'mp.s.3.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Registro de normativa, concienciación y formación',
      description:
        'Constancia documental de la normativa de P-01 con su difusión, de las actividades de concienciación de P-06 y de la formación de administradores de P-07, con control de la periodicidad declarada.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'normativa_navegacion',
      description:
        'Normativa de utilización de la navegación web con el uso autorizado, las limitaciones de uso personal y, de forma expresa, el uso permitido de conexiones cifradas. mp.s.3.1 menciona este último punto en particular.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.1'],
      type: 'string',
      usage:
        'Acreditación documental. Es el requisito del que cuelga la legitimidad de todo lo demás: sin normativa difundida, el registro de navegación de R1 carece de base informativa frente al personal.',
      missingBehavior:
        'mp.s.3.1 NO ACREDITADO, y queda además sin base la monitorización que R1 exige en categoría ALTA.',
    },
    {
      id: 'P-02',
      name: 'proxy_filtrado_web',
      description:
        'Solución de filtrado y control de la navegación, con la ubicación de sus registros. Es la fuente de evidencia de la mayor parte del control.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.5', 'mp.s.3.6'],
      type: 'string',
      usage:
        'Habilita la ingesta y los decodificadores. Sin registros del proxy no hay evidencia de que el filtrado opere ni de qué se bloquea, y el control queda reducido a la configuración declarada.',
      missingBehavior:
        'La mayor parte del control queda sin evidencia técnica. Solo acreditable por configuración declarada.',
    },
    {
      id: 'P-03',
      name: 'categorias_bloqueadas',
      description:
        'Categorías de destino bloqueadas conforme a la normativa de P-01, y tratamiento de las descargas de ejecutables y del contenido activo que mp.s.3.6 pide prevenir.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.5', 'mp.s.3.6'],
      type: 'table',
      usage:
        'Power ENS verifica que el filtrado opera sobre las categorías declaradas y mide el volumen bloqueado por cada una. Enlaza con op.exp.6: la navegación es, junto al correo, la vía principal de entrada de código dañino.',
      missingBehavior:
        'No se puede verificar qué se filtra ni acreditar la protección frente a lo que llega por la web.',
    },
    {
      id: 'P-04',
      name: 'proteccion_resolucion_nombres',
      description:
        'Mecanismos de protección de la resolución de direcciones web y del establecimiento de conexiones que exige mp.s.3.4: resolutores autorizados, filtrado en el propio resolutor, DNSSEC, prohibición de resolutores externos.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.4'],
      type: 'string',
      usage:
        'Power ENS verifica que las consultas de resolución salen solo por los resolutores autorizados y detecta intentos de usar resolutores externos o canales alternativos de resolución, que son una vía habitual de evasión del filtrado.',
      missingBehavior:
        'mp.s.3.4 NO EVALUABLE. La evasión del filtrado por resolución alternativa pasa inadvertida.',
    },
    {
      id: 'P-05',
      name: 'politica_cookies',
      description:
        'Política ejecutiva de control de cookies, orientada en particular a evitar la contaminación entre uso personal y uso organizativo, como exige mp.s.3.7. Suele implementarse con aislamiento de perfiles de navegador o de sesión.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.7'],
      type: 'string',
      usage:
        'SCA verifica la configuración del navegador gestionado. Es un requisito peculiar del ENS y poco habitual en otros marcos, de modo que conviene no pasarlo por alto: pide política ejecutiva, no recomendación.',
      missingBehavior:
        'mp.s.3.7 NO EVALUABLE. Es uno de los requisitos que con más frecuencia se omite por desconocimiento.',
    },
    {
      id: 'P-06',
      name: 'concienciacion_navegacion',
      description:
        'Actividades de concienciación sobre higiene en la navegación web realizadas, con fecha, alcance y participación. mp.s.3.2 las exige «regularmente», de modo que conviene fijar también la periodicidad.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.2'],
      type: 'table',
      usage:
        'Registro documental. No es verificable técnicamente, aunque el descenso de clics en destinos bloqueados tras una campaña es un indicador indirecto aprovechable.',
      missingBehavior:
        'mp.s.3.2 NO ACREDITADO. Requisito de naturaleza formativa.',
    },
    {
      id: 'P-07',
      name: 'formacion_administradores',
      description:
        'Formación específica del personal encargado de la administración del sistema en monitorización del servicio y respuesta a incidentes, exigida por mp.s.3.3. Es un requisito dirigido a los administradores, no a los usuarios.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.3'],
      type: 'table',
      usage:
        'Registro documental enlazado con mp.per.4. Es un requisito que se confunde a menudo con la concienciación de mp.s.3.2, pero tiene destinatario y contenido distintos: va dirigido a quien administra, y sobre monitorización y respuesta a incidentes.',
      missingBehavior:
        'mp.s.3.3 NO ACREDITADO. Se confunde con frecuencia con la concienciación general de mp.s.3.2.',
    },
    {
      id: 'P-08',
      name: 'elementos_registro_navegacion',
      description:
        'Elementos que se registran del uso de la navegación, período de retención y uso que el organismo prevé hacer de los registros. mp.s.3.r1.1 exige declarar expresamente los tres. Obligatorio en categoría ALTA.',
      level: ['ALTO'],
      requirements: ['mp.s.3.r1.1'],
      type: 'string',
      usage:
        'Configura la ingesta y la política de retención, y queda recogido en el informe como declaración. Es además la base de información al personal: los tres extremos que el ENS pide declarar coinciden con lo que exige la transparencia en materia de protección de datos.',
      missingBehavior:
        'R1 NO EVALUABLE y es obligatorio en ALTA. Sin declaración de elementos, retención y uso, el registro carece de base.',
    },
    {
      id: 'P-09',
      name: 'inspeccion_canales_cifrados',
      description:
        'Función de ruptura de canales cifrados para inspeccionar su contenido, con las cuatro declaraciones que el ENS exige —qué se analiza, qué se registra, cuánto se retiene y qué uso se prevé— y la relación de destinos de confianza con acceso cifrado autorizado sin inspección.',
      level: ['ALTO'],
      requirements: ['mp.s.3.r1.2'],
      type: 'string',
      usage:
        'Configura la inspección y, sobre todo, sus exclusiones. El propio ENS prevé la salvedad de los accesos cifrados singulares a destinos de confianza, y es el parámetro que acota una medida con implicaciones que van más allá del ENS.',
      missingBehavior:
        'R1 NO EVALUABLE. Y si la inspección se aplica sin las declaraciones y exclusiones, el riesgo excede el del propio ENS.',
    },
    {
      id: 'P-10',
      name: 'lista_negra_destinos',
      description:
        'Lista negra de destinos vetados exigida por mp.s.3.r1.3 en categoría ALTA, con su fuente de actualización: listas de reputación, indicadores del CCN-CERT, destinos añadidos por decisión propia.',
      level: ['ALTO'],
      requirements: ['mp.s.3.r1.3'],
      type: 'list',
      usage:
        'Se carga en el proxy y como CDB list en Wazuh para detectar también los intentos que no pasen por el proxy. Enlaza con op.exp.7 R3: los indicadores de los avisos del CCN-CERT alimentan esta lista de forma natural.',
      missingBehavior:
        'R1 parcialmente NO EVALUABLE. No hay lista negra verificable ni detección de intentos hacia destinos vetados.',
    },
    {
      id: 'P-11',
      name: 'lista_blanca_destinos',
      description:
        'Lista blanca de destinos accesibles, si se implementa. Corresponde a R2, no obligatorio en ninguna categoría, y es un modelo mucho más restrictivo que la lista negra de R1.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.r2.1'],
      type: 'list',
      usage:
        'Power ENS verifica que todo acceso fuera de la lista queda vetado y que las excepciones responden a autorización singular expresa, como el refuerzo exige. Solo aplicable en entornos muy controlados.',
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
