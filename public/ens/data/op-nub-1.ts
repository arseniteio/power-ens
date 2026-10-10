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
      status: 'PARCIAL',
      score: 50,
      condition:
        'op.nub.1 → Requisitos base: op.nub.1.1 + op.nub.1.2 Sin evidencia tecnica en: op.nub.1.1, por lo que el nivel no puede pasar de PARCIAL.',
    },
    medio: {
      status: 'PARCIAL',
      score: 50,
      condition:
        'op.nub.1 + R1 → Base + servicios de terceros certificados Sin evidencia tecnica en: op.nub.1.1, op.nub.1.r1.2, por lo que el nivel no puede pasar de PARCIAL.',
    },
    alto: {
      status: 'PARCIAL',
      score: 60,
      condition:
        'op.nub.1 + R1 + R2 → Base + R1 + configuración según guía CCN-STIC específica Sin evidencia tecnica en: op.nub.1.1, op.nub.1.r1.2, por lo que el nivel no puede pasar de PARCIAL.',
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
      evidences: ['EV-01', 'EV-04', 'EV-07', 'EV-09'],
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
        'Recolección de los eventos de los servicios cloud declarados en P-06: autenticaciones, operaciones administrativas, cambios de configuración, accesos a datos. Extiende la trazabilidad del sistema al perímetro cloud, que de otro modo queda fuera de toda monitorización.',
      format: 'json_line',
      events: ['evidence_state', 'cloud_integration_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.nub.1.r2.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Configuración de seguridad del lado del cliente (R2)',
      description:
        'Evaluación de la configuración del inquilino del cliente en cada servicio cloud contra las políticas de P-07: almacenamiento expuesto públicamente, identidades sobreprivilegiadas, registro de auditoría desactivado, autenticación multifactor ausente, cifrado sin configurar.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'cloud_posture_finding_observed'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-03',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de servicios cloud no inventariados (shadow IT)',
      description:
        'Identificación de servicios en la nube en uso que no figuran en el inventario P-02, detectados a partir del tráfico de los endpoints o de las autenticaciones federadas. Un servicio cloud no inventariado no tiene ninguna verificación de conformidad.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Operaciones administrativas en los servicios cloud',
      description:
        'Registro de las operaciones de administración ejecutadas en el inquilino: creación y modificación de identidades, cambios de permisos, alteración de configuración de seguridad, modificación de reglas de red. Es donde se materializan los cambios de mayor impacto.',
      format: 'json_line',
      events: ['evidence_state', 'cloud_admin_operation_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación del cifrado y del modelo de gestión de claves',
      description:
        'Comprobación de que el cifrado de los datos está activo en cada servicio y de que el modelo de gestión de claves declarado en P-09 es el efectivamente configurado. op.nub.1.2 c) lo exige de forma expresa.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación de la región de los datos',
      description:
        'Comprobación de que la región geográfica configurada para el almacenamiento de datos y sus copias coincide con la declarada en P-08. Una discrepancia tiene consecuencias tanto de ENS como de transferencias internacionales de datos personales.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Autenticaciones y accesos en los servicios cloud',
      description:
        'Registro de las autenticaciones a los servicios cloud con su origen, resultado y método, lo que permite aplicar sobre el perímetro cloud los mismos controles de op.acc.5 y op.acc.6: doble factor, accesos desde zonas no controladas, intentos fallidos.',
      format: 'json_line',
      events: ['evidence_state', 'cloud_authentication_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.nub.1.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Vigencia de certificaciones y conformidad de proveedores',
      description:
        'Seguimiento de la vigencia de las declaraciones de conformidad de P-03 y de las certificaciones de P-04, con alerta anticipada de vencimiento. NO es verificación del documento: es control de su validez temporal.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.nub.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Expediente documental del servicio en la nube',
      description:
        'Consolidación por servicio de toda la documentación exigida: conformidad ENS, certificación reconocida, informe de pentesting del proveedor, cláusulas de transparencia, jurisdicción de los datos y modelo de cifrado. Es el entregable que un auditor pedirá servicio por servicio.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'posicion_cliente',
      description:
        'Determina si el cliente actúa como PRESTADOR de servicios en la nube al sector público (op.nub.1.1) o como USUARIO de servicios de terceros (op.nub.1.2), o ambas cosas. Es la primera decisión del control y condiciona todo lo demás.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.1', 'op.nub.1.2'],
      type: 'select',
      usage:
        'Determina qué requisitos aplican y qué evidencias pide ENSFácil. Como prestador, la carga es demostrar el cumplimiento de las medidas del modelo prestado; como usuario, verificar la conformidad del proveedor y la configuración propia.',
      missingBehavior:
        'El control es NO EVALUABLE. No se puede determinar qué requisitos son exigibles ni qué evidencias pedir.',
    },
    {
      id: 'P-02',
      name: 'inventario_servicios_nube',
      description:
        'Relación de servicios en la nube utilizados o prestados, con su modelo (SaaS, PaaS, IaaS), proveedor, información tratada y criticidad. Es el alcance del control.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.1', 'op.nub.1.2', 'op.nub.1.r1.1'],
      type: 'table',
      usage:
        'Define el alcance de la monitorización cloud y de las comprobaciones documentales.',
      missingBehavior:
        'El inventario queda incompleto. Riesgo de servicios cloud en uso sin ninguna verificación de conformidad.',
    },
    {
      id: 'P-03',
      name: 'conformidad_ens_proveedores',
      description:
        'Para cada servicio de terceros: conformidad con el ENS o con la guía CCN-STIC aplicable, con la referencia de la declaración o certificación, su alcance y su fecha de vigencia. op.nub.1.2 lo exige de forma directa.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      usage:
        'ENSFácil registra y vigila la vigencia de cada declaración, alertando antes del vencimiento. La verificación del documento en sí es documental: la herramienta no puede validar una certificación.',
      missingBehavior:
        'op.nub.1.2 NO ACREDITADO. No se puede demostrar la conformidad de los servicios de terceros utilizados.',
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
        'ENSFácil registra la certificación y su vigencia con alerta anticipada de vencimiento. Conviene no confundir este requisito con el de P-03: R1 exige certificación bajo metodología reconocida, no una simple declaración de conformidad.',
      missingBehavior:
        'R1 NO ACREDITADO y es obligatorio desde categoría MEDIA. Es un hallazgo documental difícil de subsanar deprisa.',
    },
    {
      id: 'P-05',
      name: 'servicios_seguridad_cloud',
      description:
        'Identificación de los servicios en la nube que son servicios de SEGURIDAD, a los que op.nub.1.r1.2 exige además cumplir los requisitos de op.pl.5. Es un supuesto específico que suele pasarse por alto.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.nub.1.r1.2'],
      type: 'table',
      usage:
        'ENSFácil marca estos servicios para exigirles la verificación adicional de op.pl.5 y lo refleja en el informe. Es llamativo que la propia plataforma de seguridad, si se consume como servicio cloud, entra en este supuesto.',
      missingBehavior:
        'Se omite la verificación adicional que R1.2 exige para servicios de seguridad en la nube.',
    },
    {
      id: 'P-06',
      name: 'integraciones_cloud_wazuh',
      description:
        'Servicios cloud cuyos registros se ingieren en Wazuh y mediante qué integración. Es la pieza que convierte este control de documental en técnicamente verificable en lo que respecta a la configuración del lado del cliente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2', 'op.nub.1.r2.1'],
      type: 'table',
      usage:
        'Activa los módulos de integración cloud de Wazuh. Permite recoger eventos de autenticación, cambios de configuración, accesos a datos y operaciones administrativas en el proveedor, que es donde se materializan los riesgos reales del lado del usuario.',
      missingBehavior:
        'Los servicios cloud quedan fuera de la monitorización. Punto ciego grave si tratan información del sistema.',
    },
    {
      id: 'P-07',
      name: 'politicas_configuracion_cloud',
      description:
        'Políticas de configuración de seguridad aplicables a cada servicio cloud según la guía CCN-STIC de Configuración de Seguridad Específica correspondiente. R2 subraya que están orientadas «tanto al usuario como al proveedor», de modo que la configuración del lado del cliente es exigible.',
      level: ['ALTO'],
      requirements: ['op.nub.1.r2.1'],
      type: 'table',
      usage:
        'ENSFácil evalúa la configuración de cada servicio contra la política correspondiente. Las políticas CIS para AWS, Azure, GCP y M365 son un punto de partida razonable cuando no hay política derivada directamente de la guía CCN-STIC.',
      missingBehavior:
        'R2 NO EVALUABLE y es obligatorio en categoría ALTA. La configuración del lado del cliente queda sin verificar.',
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
        'ENSFácil registra la declaración y, cuando la integración de P-06 lo permita, verifica la región efectivamente configurada en el proveedor contra la declarada. Discrepancia → hallazgo relevante también a efectos de protección de datos.',
      missingBehavior:
        'op.nub.1.2 d) NO ACREDITADO. Riesgo concurrente en materia de transferencias internacionales de datos.',
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
        'SCA sobre la configuración cloud verifica que el cifrado está activo y qué modelo de claves se emplea. Enlaza directamente con op.exp.10: las claves de los servicios cloud forman parte del material criptográfico a proteger.',
      missingBehavior:
        'op.nub.1.2 c) NO VERIFICABLE. Riesgo de datos en la nube sin cifrado o con claves bajo control exclusivo del proveedor.',
    },
    {
      id: 'P-10',
      name: 'pentesting_proveedor',
      description:
        'Informes o certificaciones de auditoría de pruebas de penetración del proveedor del servicio, exigidos por op.nub.1.2 a). Es documentación del proveedor, no una prueba que el cliente ejecute.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      usage:
        'ENSFácil registra la referencia y la fecha, y alerta cuando la antigüedad del informe es excesiva. Muchos proveedores solo facilitan resumen ejecutivo bajo acuerdo de confidencialidad, lo que conviene anticipar en la negociación contractual.',
      missingBehavior:
        'op.nub.1.2 a) NO ACREDITADO. Queda sin evidencia uno de los cuatro requisitos expresos del requisito base.',
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
        'El recolector del manager agrupa, por actor, las operaciones administrativas que llegan en las alertas de los módulos cloud (CloudTrail, registro de actividad de Azure, Cloud Audit Logs).',
      missingBehavior:
        'Si hay operaciones administrativas en un servicio integrado, EV-04 queda sin evaluar (causa CONFIGURATION): no hay contra qué contrastar a sus actores.',
    },
    {
      id: 'P-12',
      name: 'antiguedad_maxima_pentest_proveedor_meses',
      description:
        'Antigüedad máxima admitida, en meses, del último informe de pruebas de penetración de cada proveedor (P-10), contada desde su fecha. op.nub.1.2 a) exige la auditoría de pentesting y la plantilla habla de una antigüedad excesiva sin declararla: lo habitual es un informe anual.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'number',
      usage:
        'ENSFácil compara la fecha de cada informe de P-10 con la fecha de la evaluación: un informe más viejo que P-12 meses deja el expediente del servicio incompleto (op.nub.1.2 a).',
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
        'El recolector del manager anota, por módulo cloud, el instante de la última alerta suya en alerts.json.',
      missingBehavior:
        'EV-01 queda sin evaluar (causa CONFIGURATION) para los servicios integrados: no se puede decidir si una integración sin registros recientes está parada.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar op.nub.1.1 (el conjunto de medidas del modelo de servicio prestado según las guías CCN-STIC) y op.nub.1.r1.2 (la verificación de op.pl.5 de los servicios cloud de seguridad, que ENSFácil no mide).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
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
