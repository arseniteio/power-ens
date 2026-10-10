import { ENSControl } from '../types';

export const opNub1Control: ENSControl = {
  id: 'op.nub.1',
  title: 'Protección de servicios en la nube',
  framework: 'ENS',
  category: 'Servicios en la nube',
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
        'op.nub.1 → Requisitos base: op.nub.1.1 + op.nub.1.2. op.nub.1.1 y el expediente de cada servicio de op.nub.1.2 (EV-09) se acreditan documentalmente con las tablas de la pantalla y su vigencia; la integración de los servicios en Wazuh (EV-01, EV-04) se mide en el manager.',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.nub.1 + R1 → Base + servicios de terceros certificados (R1), acreditados documentalmente con su certificación vigente.',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.nub.1 + R1 + R2 → Base + R1 + configuración según la guía CCN-STIC específica (R2), acreditada documentalmente.',
    },
  },
  requirements: [
    {
      id: 'op.nub.1.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Medidas del modelo de servicio prestado (prestador)',
      description:
        'Los sistemas que suministran un servicio en la nube a organismos del sector público deberán cumplir con el conjunto de medidas de seguridad en función del modelo de servicio en la nube que presten: Software como Servicio (Software as a Service, SaaS), Plataforma como Servicio (Platform as a Service, PaaS) e Infraestructura como Servicio (Infrastructure as a Service, IaaS) definidas en las guías CCN-STIC que sean de aplicación.',
      evidences: [],
    },
    {
      id: 'op.nub.1.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Conformidad de los servicios en la nube de terceros (usuario)',
      description:
        'Cuando se utilicen servicios en la nube suministrados por terceros, los sistemas de información que los soportan deberán ser conformes con el ENS o cumplir con las medidas desarrolladas en una guía CCN-STIC que incluirá, entre otros, requisitos relativos a: a) Auditoría de pruebas de penetración (pentesting). b) Transparencia. c) Cifrado y gestión de claves. d) Jurisdicción de los datos.',
      evidences: ['EV-01', 'EV-04', 'EV-09'],
    },
    {
      id: 'op.nub.1.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Servicios de terceros certificados (R1)',
      description:
        'Cuando se utilicen servicios en la nube suministrados por terceros, estos deberán estar certificados bajo una metodología de certificación reconocida por el Organismo de Certificación del Esquema Nacional de Evaluación y Certificación de Seguridad de las Tecnologías de la Información.',
      evidences: ['EV-08'],
    },
    {
      id: 'op.nub.1.r1.2',
      level: ['MEDIO', 'ALTO'],
      title: 'Servicios cloud de seguridad conformes con op.pl.5 (R1)',
      description:
        'Si el servicio en la nube es un servicio de seguridad deberá cumplir con los requisitos establecidos en [op.pl.5].',
      evidences: [],
    },
    {
      id: 'op.nub.1.r2.1',
      level: ['ALTO'],
      title: 'Configuración según la guía CCN-STIC específica (R2)',
      description:
        'La configuración de seguridad de los sistemas que proporcionan estos servicios deberá realizarse según la correspondiente guía CCN-STIC de Configuración de Seguridad Específica, orientadas tanto al usuario como al proveedor.',
      evidences: ['EV-02'],
      active: false,
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ingesta de registros de los servicios en la nube',
      description:
        'Por cada módulo cloud de Wazuh (aws-s3, azure-logs, gcp-pubsub, gcp-bucket, office365, ms-graph, github): dónde está configurado (ossec.conf del manager, agent.conf de un grupo o el agente dedicado que envía sus alertas), si está habilitado, el instante de su última alerta, las alertas de las últimas 24 h y sus errores en ossec.log. Se contrasta con P-06: un servicio declarado como integrado cuyo módulo no está, está deshabilitado, da errores o lleva más de P-13 horas sin registros es un punto ciego de trazabilidad. Los servicios de P-02 sin integración se señalan en el informe, sin veredicto.',
      format: 'json_line',
      events: ['evidence_state', 'cloud_integration_observed'],
      wazuhRuleIds: ['111501'],
    },
    {
      id: 'EV-02',
      requirement: ['op.nub.1.r2.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Configuración del inquilino según los hallazgos de postura del proveedor (R2)',
      description:
        'Por módulo, fuente y estándar: los controles de postura que el propio proveedor evalúa y envía a Wazuh (AWS Security Hub o Config por aws-s3, Microsoft Defender por ms-graph, Security Command Center por gcp-pubsub), con el último resultado de cada control, los fallidos y los críticos. Se contrasta con P-07: un control fallido en un servicio de P-07 incumple R2. Wazuh 4.14 no trae políticas SCA para inquilinos cloud; sin hallazgos de postura del proveedor, R2 no es automatizable.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'cloud_posture_finding_observed'],
      wazuhRuleIds: ['111502'],
      active: false,
    },
    {
      id: 'EV-03',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de servicios cloud no inventariados (shadow IT)',
      description:
        'Servicios en la nube en uso que no figuran en el inventario P-02. Es un dato del informe, sin veredicto: detectarlos exige el DNS o el proxy de los equipos, y con los ficheros locales del manager no se ven (el inventario de Wazuh solo da los puertos en escucha). Lo que sí se informa son los módulos cloud que Wazuh ingiere y P-06 no declara.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Operaciones administrativas en los servicios cloud',
      description:
        'Operaciones de administración con éxito en los servicios integrados (creación y modificación de identidades, permisos, configuración de seguridad, reglas de red), agregadas por módulo, cuenta y actor a partir de las alertas de los módulos cloud: CloudTrail, registro de actividad de Azure, Cloud Audit Logs. Cada actor humano tiene que figurar en P-11 para su servicio; las acciones de los propios servicios del proveedor no se contrastan.',
      format: 'json_line',
      events: ['evidence_state', 'cloud_admin_operation_observed'],
      wazuhRuleIds: ['111503'],
    },
    {
      id: 'EV-05',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación del cifrado y del modelo de gestión de claves',
      description:
        'El cifrado de los datos y el modelo de gestión de claves de cada servicio. Es un dato del informe, sin veredicto: Wazuh 4.14 no tiene SCA para inquilinos cloud y el recolector no usa credenciales del proveedor, así que el cifrado configurado no se puede medir. Lo declarado en P-09 forma parte del expediente documental (EV-09, op.nub.1.2 c).',
      format: 'sca_or_json_line',
      events: [],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación de la región de los datos',
      description:
        'La región de los datos y de sus copias en cada servicio. Es un dato del informe, sin veredicto: Wazuh 4.14 no tiene SCA para inquilinos cloud ni el recolector usa credenciales del proveedor, así que la región configurada no se puede medir. Lo declarado en P-08 forma parte del expediente documental (EV-09, op.nub.1.2 d).',
      format: 'sca_or_json_line',
      events: [],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Autenticaciones y accesos en los servicios cloud',
      description:
        'Inicios de sesión interactivos en los servicios integrados (consola de AWS, inicios de sesión de Microsoft Entra ID), agregados por módulo, cuenta, usuario, resultado y segundo factor, con sus orígenes. Es un hallazgo del informe, sin veredicto en op.nub.1: un acceso con éxito sin segundo factor desde una zona no controlada lo juzga op.acc.6.r8.1, y aquí se señala cruzado con él. Si el proveedor no registra el segundo factor (accesos federados, Google Cloud), se dice.',
      format: 'json_line',
      events: ['evidence_state', 'cloud_authentication_observed'],
      wazuhRuleIds: ['111504'],
    },
    {
      id: 'EV-08',
      requirement: ['op.nub.1.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Vigencia de las certificaciones de los proveedores (R1)',
      description:
        'Por cada servicio utilizado de P-02, su certificación de P-04 bajo una metodología reconocida, con su número y su vigencia frente a la fecha de la evaluación, y los días que le quedan. NO es verificación del documento: es control de su validez temporal, y su CUMPLE se lee «acreditado documentalmente». Una certificación vencida o ausente incumple R1.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Expediente documental del servicio en la nube',
      description:
        'Por cada servicio utilizado de P-02: su conformidad con el ENS (de categoría no inferior a la del sistema) o con la guía CCN-STIC, vigente (P-03); su último informe de pentest, no más viejo que P-12 meses (P-10, op.nub.1.2 a); su cifrado y gestión de claves (P-09, c); la región de sus datos y copias y la jurisdicción (P-08, d). La transparencia (b) la cubre la conformidad declarada. Es DOCUMENTACIÓN APORTADA, no verificada técnicamente: su CUMPLE se lee «acreditado documentalmente».',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'posicion_cliente',
      description:
        'Si el sistema PRESTA servicios en la nube al sector público (op.nub.1.1), si UTILIZA servicios en la nube de terceros (op.nub.1.2 y sus refuerzos), ambas cosas, o ninguna. Es la primera decisión del control y condiciona todo lo demás. Con «ninguno» el control entero no aplica, y queda declarado.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.1', 'op.nub.1.2'],
      type: 'select',
      usage:
        'prestador: aplica op.nub.1.1 (la conformidad de lo prestado en P-03) y R2. usuario: aplican op.nub.1.2, R1 y R2. ambos: todos, y P-02 separa cada servicio por su columna «uso». ninguno: todo el control NO_APLICA.',
      missingBehavior:
        'El control es NO EVALUABLE (causa CONFIGURATION). No se puede determinar qué requisitos son exigibles ni qué evidencias pedir.',
    },
    {
      id: 'P-02',
      name: 'inventario_servicios_nube',
      description:
        'Relación de servicios en la nube utilizados o prestados, con su modelo (SaaS, PaaS, IaaS), proveedor, información tratada, criticidad y uso (utilizado de un tercero o prestado). Es el alcance del control: el nombre del servicio es la clave con la que se cruzan P-03 a P-11.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.1', 'op.nub.1.2', 'op.nub.1.r1.1'],
      type: 'table',
      usage:
        'Cada servicio utilizado necesita su expediente documental (P-03, P-08, P-09 y P-10, en EV-09) y, desde MEDIA, su certificación (P-04, en EV-08). Con P-01 = ambos, la columna «uso» es obligatoria en cada fila. La detección de servicios en uso que no figuran aquí (shadow IT) no se puede hacer con ficheros locales: se informa.',
      missingBehavior:
        'op.nub.1.2 y R1 quedan sin evaluar (causa CONFIGURATION): no hay servicios contra los que juzgar el expediente ni la certificación.',
    },
    {
      id: 'P-03',
      name: 'conformidad_ens_proveedores',
      description:
        'Para cada servicio de P-02 —de terceros o prestado—: conformidad con el ENS (con su categoría: ENS BÁSICA, ENS MEDIA o ENS ALTA) o con la guía CCN-STIC aplicable al modelo (SaaS, PaaS, IaaS), su alcance, su fecha de vigencia y la referencia de la declaración o certificación. op.nub.1.2 lo exige de los servicios de terceros; para los que se prestan, es la acreditación de op.nub.1.1.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.1', 'op.nub.1.2'],
      type: 'table',
      usage:
        'EV-09: cada servicio utilizado de P-02 tiene que tener aquí su conformidad, vigente en la fecha de la evaluación y, si es ENS, de una categoría no inferior a la del sistema (una conformidad ENS se juzga por su categoría aunque cite una guía). Una conformidad vencida o ausente es un incumplimiento de op.nub.1.2; una vigente lo acredita documentalmente. Con P-01 = prestador o ambos, cada servicio prestado necesita aquí la suya para op.nub.1.1, con el mismo criterio.',
      missingBehavior:
        'op.nub.1.2 (y op.nub.1.1 si se presta algún servicio) quedan sin acreditar (causa CONFIGURATION): no se puede demostrar la conformidad de los servicios.',
    },
    {
      id: 'P-04',
      name: 'certificacion_reconocida_occ',
      description:
        'Certificación de cada servicio de terceros bajo una metodología reconocida por el Organismo de Certificación del Esquema Nacional de Evaluación y Certificación de Seguridad de las TI, exigida por R1 desde categoría MEDIA. Es más específico que la conformidad general de P-03.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.nub.1.r1.1'],
      type: 'table',
      usage:
        'EV-08 (R1, desde MEDIA): cada servicio utilizado de P-02 tiene que tener aquí su certificación, con metodología y número, vigente en la fecha de la evaluación. Vigente: R1 acreditado documentalmente; vencida o ausente: incumplimiento. Los días que le quedan se dicen en el informe.',
      missingBehavior:
        'R1 queda sin acreditar (causa CONFIGURATION), y es obligatorio desde categoría MEDIA.',
    },
    {
      id: 'P-05',
      name: 'servicios_seguridad_cloud',
      description:
        'Los servicios en la nube utilizados que son servicios de SEGURIDAD (un SIEM gestionado, un WAF, copias de seguridad gestionadas), a los que op.nub.1.r1.2 exige además cumplir los requisitos de op.pl.5, con lo que la organización declara de esa verificación: si cumple, la referencia del informe que lo verifica y hasta cuándo vale. Si no se usa ninguno, una sola fila «ninguno». Es un supuesto que suele pasarse por alto.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.nub.1.r1.2'],
      type: 'table',
      usage:
        'Una sola fila «ninguno»: R1.2 no aplica (declarado). Con servicios: cada uno con «cumple op.pl.5 = sí», la referencia de la verificación y su vigencia en la fecha de la evaluación acredita R1.2 documentalmente; «no», o la verificación vencida, es un incumplimiento. Vacío, «ninguno» junto a servicios, o una fila sin la referencia o sin la fecha: R1.2 sin evaluar (causa CONFIGURATION).',
      missingBehavior:
        'R1.2 queda sin evaluar (causa CONFIGURATION): no consta si se usa algún servicio en la nube de seguridad. Si no se usa ninguno, se declara una sola fila «ninguno».',
    },
    {
      id: 'P-06',
      name: 'integraciones_cloud_wazuh',
      description:
        'Por cada servicio de P-02, el módulo de Wazuh que ingiere sus registros (aws-s3, azure-logs, gcp-pubsub, gcp-bucket, office365, ms-graph, github) o «ninguno», y su ámbito (cuenta, suscripción, proyecto, tipos de registro). La credencial del proveedor la pone el cliente en un agente dedicado, nunca en el manager ni en un agent.conf compartido: ENSFácil solo lee la presencia del módulo y sus alertas. Es la pieza que añade a lo documental la medida técnica.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2', 'op.nub.1.r2.1'],
      type: 'table',
      usage:
        'EV-01: cada servicio con módulo tiene que tenerlo configurado y habilitado, sin errores en 24 h y con registros más recientes que P-13 horas. EV-04 y EV-07 se juzgan sobre esos mismos servicios. Un servicio sin integración es un hallazgo del informe, no un incumplimiento. En ALTA, R2 lee los hallazgos de postura del módulo de cada servicio.',
      missingBehavior:
        'EV-01, EV-04 y EV-07 quedan sin evaluar (causa CONFIGURATION): no se sabe qué servicios tienen que llegar a Wazuh. op.nub.1.2 puede acreditarse igualmente con su expediente documental.',
    },
    {
      id: 'P-07',
      name: 'politicas_configuracion_cloud',
      description:
        'Por cada servicio en la nube, la guía CCN-STIC de Configuración de Seguridad Específica que le aplica y el estándar de postura del proveedor con el que se verifica (p. ej., AWS Foundational Security Best Practices o CIS en Security Hub, la puntuación de seguridad de Microsoft Defender, Security Command Center). R2 subraya que las guías están orientadas «tanto al usuario como al proveedor». Wazuh 4.14 no tiene políticas SCA para inquilinos cloud: la verificación son los hallazgos del propio proveedor que Wazuh ingiere.',
      level: ['ALTO'],
      requirements: ['op.nub.1.r2.1'],
      type: 'table',
      usage:
        'EV-02 (R2, solo ALTA): cada servicio de P-07 se juzga con los hallazgos de postura del módulo que P-06 le asigna (y, si se declara, solo los de ese estándar). Un control fallido incumple R2; sin hallazgos de postura del proveedor, R2 no es automatizable y queda sin evaluar.',
      missingBehavior:
        'R2 queda sin evaluar (causa CONFIGURATION), y es obligatorio en categoría ALTA.',
    },
    {
      id: 'P-08',
      name: 'jurisdiccion_datos',
      description:
        'Ubicación geográfica declarada de los datos y de sus copias en cada servicio, y jurisdicción aplicable. op.nub.1.2 d) lo exige expresamente como requisito del servicio.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      usage:
        'EV-09: cada servicio utilizado tiene que tener aquí la región de sus datos, la de sus copias y la jurisdicción. Una fila ausente o incompleta deja el expediente incompleto (op.nub.1.2 d).',
      missingBehavior:
        'El eje de jurisdicción del expediente (EV-09) queda sin evaluar (causa CONFIGURATION): op.nub.1.2 d) sin acreditar.',
    },
    {
      id: 'P-09',
      name: 'cifrado_gestion_claves_cloud',
      description:
        'Mecanismo de cifrado de los datos en el servicio y modelo de gestión de claves: claves gestionadas por el proveedor, por el cliente (CMK) o custodia externa (HYOK). op.nub.1.2 c) lo exige expresamente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      usage:
        'EV-09: cada servicio utilizado tiene que tener aquí su cifrado y su modelo de gestión de claves. Una fila ausente, o un cifrado «no» o «ninguno», incumple op.nub.1.2 c); una fila incompleta queda sin evaluar (causa CONFIGURATION).',
      missingBehavior:
        'El eje de cifrado del expediente (EV-09) queda sin evaluar (causa CONFIGURATION): op.nub.1.2 c) sin acreditar.',
    },
    {
      id: 'P-10',
      name: 'pentesting_proveedor',
      description:
        'Informes o certificaciones de auditoría de pruebas de penetración del proveedor del servicio, exigidos por op.nub.1.2 a), con su fecha. Es documentación del proveedor, no una prueba que el cliente ejecute. Muchos proveedores solo facilitan un resumen ejecutivo bajo acuerdo de confidencialidad, lo que conviene anticipar en el contrato.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      usage:
        'EV-09: cada servicio utilizado tiene que tener aquí su último informe de pentest, con una fecha no más vieja que P-12 meses en la fecha de la evaluación. Ausente o más viejo: el expediente queda incompleto (op.nub.1.2 a).',
      missingBehavior:
        'El eje del pentest del expediente (EV-09) queda sin evaluar (causa CONFIGURATION): op.nub.1.2 a) sin acreditar.',
    },
    {
      id: 'P-11',
      name: 'administradores_cloud_autorizados',
      description:
        'Identidades autorizadas a ejecutar operaciones de administración en cada servicio en la nube integrado en Wazuh (P-06), tal como las registra el proveedor: el ARN del usuario o del rol de IAM en AWS (arn:aws:iam::123456789012:role/Admin; la raíz de la cuenta es arn:aws:iam::123456789012:root), la cuenta o la aplicación que figura como autor en Azure y la cuenta principal (correo) en Google Cloud. Es el homólogo cloud de la lista de administradores de op.exp.3, que esta policy no puede leer.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      usage:
        'EV-04: cada actor humano de una operación de administración en la ventana tiene que figurar aquí para su servicio; uno que no figura incumple op.nub.1.2. Las acciones de los propios servicios del proveedor no se contrastan.',
      missingBehavior:
        'Si hay operaciones administrativas en un servicio integrado, EV-04 queda sin evaluar (causa CONFIGURATION): no hay contra qué contrastar a sus actores.',
    },
    {
      id: 'P-12',
      name: 'antiguedad_maxima_pentest_proveedor_meses',
      description:
        'Antigüedad máxima admitida, en meses, del último informe de pruebas de penetración de cada proveedor (P-10), contada desde su fecha. op.nub.1.2 a) exige la auditoría de pentesting; lo habitual es un informe anual.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'number',
      usage:
        'EV-09: ENSFácil compara la fecha de cada informe de P-10 con la fecha de la evaluación; un informe más viejo que P-12 meses deja el expediente del servicio incompleto (op.nub.1.2 a).',
      missingBehavior:
        'El eje del pentest del expediente (EV-09) queda sin evaluar (causa CONFIGURATION): no hay contra qué medir la antigüedad de los informes.',
    },
    {
      id: 'P-13',
      name: 'antiguedad_maxima_registros_cloud_horas',
      description:
        'Horas que puede pasar una integración cloud declarada en P-06 sin que entre en Wazuh ningún registro suyo antes de considerar que la ingesta está parada. CloudTrail y el registro de actividad de Azure producen eventos de forma continua en una cuenta en uso; una suscripción de Pub/Sub poco activa puede necesitar más margen. El valor tiene que ser mayor que el intervalo del módulo (interval en su bloque de configuración).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'duration_hours',
      usage:
        'EV-01: la integración de un servicio de P-06 está parada si su última alerta tiene más de P-13 horas en el momento de la observación.',
      missingBehavior:
        'EV-01 queda sin evaluar (causa CONFIGURATION) para los servicios integrados: no se puede decidir si una integración sin registros recientes está parada.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'cloud_integration_observed', 'cloud_posture_finding_observed', 'cloud_admin_operation_observed', 'cloud_authentication_observed'],
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
