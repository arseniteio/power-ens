import { ENSControl } from '../types';

export const opExp2Control: ENSControl = {
  id: 'op.exp.2',
  title: 'Configuración de seguridad',
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
        'Pendiente de definir.',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'Pendiente de definir.',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'Pendiente de definir.',
    },
  },
  requirements: [
    {
      id: 'op.exp.2.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Retirada de cuentas y contraseñas estándar',
      description:
        'Se retiren cuentas y contraseñas estándar.',
      evidences: ['EV-01', 'EV-02'],
    },
    {
      id: 'op.exp.2.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Mínima funcionalidad en operación',
      description:
        'Se aplicará la regla de «mínima funcionalidad», es decir: a) El sistema debe proporcionar la funcionalidad mínima imprescindible para que la organización alcance sus objetivos. b) No proporcionará funciones injustificadas (de operación, administración o auditoría) al objeto de reducir al mínimo su perímetro de exposición, eliminándose o desactivándose aquellas funciones que sean innecesarias o inadecuadas al fin que se persigue.',
      evidences: ['EV-01', 'EV-03', 'EV-06'],
    },
    {
      id: 'op.exp.2.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Seguridad por defecto',
      description:
        'Se aplicará la regla de «seguridad por defecto», es decir: a) Las medidas de seguridad serán respetuosas con el usuario y protegerán a éste, salvo que se exponga conscientemente a un riesgo. b) Para reducir la seguridad, el usuario tendrá que realizar acciones conscientes. c) El uso natural, en los casos que el usuario no ha consultado el manual, será un uso seguro.',
      evidences: ['EV-01', 'EV-04', 'EV-06'],
    },
    {
      id: 'op.exp.2.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Máquinas virtuales con el mismo rigor',
      description:
        'Las máquinas virtuales estarán configuradas y gestionadas de un modo seguro. La gestión del parcheado, cuentas de usuarios, software antivirus, etc. se realizará como si se tratara de máquinas físicas, incluyendo la máquina anfitriona.',
      evidences: ['EV-05'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.2.1', 'op.exp.2.2', 'op.exp.2.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Evaluación contra la línea base de configuración segura',
      description:
        'Ejecución periódica de la política SCA asignada a cada activo según P-01, con el detalle de checks superados y fallidos. Es la evidencia central del control: acredita de forma objetiva y repetible el estado de bastionado de cada equipo.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'sca_evaluation'],
      wazuhRuleIds: ['110301'],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Pervivencia de cuentas y contraseñas estándar',
      description:
        'Detección de cuentas por defecto de P-03 que siguen existiendo o, peor, que registran autenticaciones exitosas. op.exp.2.1 exige su retirada antes de la entrada en operación.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'login_account', 'account_authenticated'],
      wazuhRuleIds: ['110302', '110303'],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.2.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Servicios y puertos no justificados en ejecución',
      description:
        'Contraste entre los servicios en ejecución y puertos en escucha detectados por Syscollector y la relación de servicios justificados por perfil (P-02). Todo lo que sobra es superficie de exposición innecesaria y vulnera la regla de mínima funcionalidad.',
      format: 'json_line',
      events: ['evidence_state', 'service_exposed'],
      wazuhRuleIds: ['110304'],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.2.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación de la regla de seguridad por defecto',
      description:
        'Comprobación de que los valores de configuración por defecto de los servicios son los seguros: cifrado activado, protocolos obsoletos deshabilitados, autenticación exigida, permisos restrictivos en la instalación inicial. Es la traducción práctica de op.exp.2.3.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'insecure_default'],
      wazuhRuleIds: ['110305'],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.2.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Configuración segura de hipervisores y máquinas virtuales',
      description:
        'Verificación de que los anfitriones de virtualización declarados en P-06 están monitorizados, tienen política SCA propia y reciben el mismo tratamiento que las máquinas físicas en parcheado, gestión de cuentas y protección antimalware, como exige expresamente op.exp.2.4.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'virtualization_role'],
      wazuhRuleIds: ['110306'],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.2.2', 'op.exp.2.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Evolución del nivel de cumplimiento de la línea base',
      description:
        'Serie temporal del porcentaje de checks SCA superados por activo y agregado del sistema. Permite distinguir un bastionado sólido y estable de una configuración que se degrada con el tiempo, y sirve de enlace natural con op.exp.3.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'sca_score'],
      wazuhRuleIds: ['110307'],
    },
    {
      id: 'EV-07',
      requirement: [],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Conformidad previa a la entrada en operación',
      description:
        'Verificación de que cada activo superó la línea base ANTES de entrar en producción. Se contrasta la fecha de alta del agente y de puesta en servicio con la fecha del primer scan SCA conforme. Un equipo que entra en operación y luego se bastiona no cumple el enunciado de op.exp.2.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'politicas_sca_por_perfil',
      description:
        'Línea base de configuración segura asignada a cada tipo o perfil de activo: servidor web, servidor de base de datos, controlador de dominio, estación de trabajo, hipervisor. Determina qué política SCA evalúa Wazuh en cada máquina.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.1', 'op.exp.2.2', 'op.exp.2.3'],
      type: 'table',
      usage:
        'ENSFácil despliega la política SCA correspondiente a cada agente según su perfil. Sin esta asignación, SCA evalúa con la política genérica del SO y pierde precisión en los servicios concretos del activo.',
      missingBehavior:
        'SCA evalúa solo con la política base del sistema operativo. La cobertura de op.exp.2 queda parcial.',
    },
    {
      id: 'P-02',
      name: 'servicios_justificados_por_perfil',
      description:
        'Relación de servicios, puertos, roles y funciones justificados para cada perfil de activo. Es la traducción operativa de la regla de mínima funcionalidad: sin saber para qué sirve un equipo, no se puede juzgar si un servicio en ejecución es innecesario.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.2'],
      type: 'table',
      usage:
        'ENSFácil cruza los servicios y puertos detectados por Syscollector contra esta tabla. Todo servicio en ejecución o puerto en escucha no justificado genera hallazgo de funcionalidad excesiva.',
      missingBehavior:
        'op.exp.2.2 NO EVALUABLE. Wazuh ve los servicios activos pero no puede juzgar si están justificados.',
    },
    {
      id: 'P-03',
      name: 'cuentas_contrasenas_estandar',
      description:
        'Listado de cuentas y credenciales por defecto propias de los productos desplegados que deben haberse retirado: admin/admin, root sin contraseña, sa en SQL Server, cuentas de demostración, usuarios de ejemplo de aplicaciones.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.1'],
      type: 'table',
      usage:
        'Se carga como CDB list. SCA verifica la existencia de estas cuentas en cada activo y las reglas de log alertan ante cualquier autenticación exitosa con ellas.',
      missingBehavior:
        'No se detecta la pervivencia de cuentas por defecto. op.exp.2.1 queda sin verificación específica.',
    },
    {
      id: 'P-04',
      name: 'excepciones_autorizadas',
      description:
        'Desviaciones respecto a la línea base que han sido autorizadas formalmente, con su justificación y el responsable que las aprobó. Toda excepción debe ser consciente y documentada, no un descuido.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.3'],
      type: 'table',
      usage:
        'ENSFácil excluye estos checks del cómputo de incumplimiento en los activos afectados, pero los mantiene visibles en el informe como riesgo aceptado con trazabilidad de quién lo autorizó.',
      missingBehavior:
        'Las desviaciones justificadas se contabilizan como incumplimiento, distorsionando el semáforo del control.',
    },
    {
      id: 'P-05',
      name: 'umbral_cumplimiento_sca',
      description:
        'Porcentaje mínimo de checks SCA superados por debajo del cual el activo se considera no conforme con la línea base. Permite graduar el semáforo en lugar de exigir el 100 % absoluto.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.2', 'op.exp.2.3'],
      type: 'number',
      usage:
        'Define los cortes del semáforo por activo y el cómputo agregado del control. Los checks marcados como críticos pueden ponderarse por encima del resto.',
      missingBehavior:
        'Se aplica un umbral por defecto del 90 %, que puede no reflejar el apetito de riesgo de la organización.',
    },
    {
      id: 'P-06',
      name: 'inventario_virtualizacion',
      description:
        'Relación de hipervisores y máquinas virtuales del sistema, con indicación de si el anfitrión está monitorizado. op.exp.2.4 exige expresamente incluir la máquina anfitriona en la gestión de seguridad.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.4'],
      type: 'table',
      usage:
        'ENSFácil verifica que los anfitriones tienen agente y política SCA propia de hipervisor, y que las VM reciben el mismo tratamiento de parcheado, cuentas y antivirus que las máquinas físicas.',
      missingBehavior:
        'op.exp.2.4 NO EVALUABLE. No se puede verificar que los anfitriones reciben el mismo tratamiento.',
    },
    {
      id: 'P-07',
      name: 'momento_verificacion_pre_produccion',
      description:
        'Define si existe un punto de control formal antes de la entrada en operación de un activo, y cómo se registra. op.exp.2 exige que la configuración segura sea PREVIA a la operación, no posterior.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'select',
      usage:
        'ENSFácil correlaciona la fecha de alta del agente con la fecha del primer scan SCA conforme. Si un activo entra en producción antes de superar la línea base, genera hallazgo.',
      missingBehavior:
        'No se puede verificar la exigencia de configuración PREVIA a la entrada en operación.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la verificación de la configuración ANTES de la entrada en operación, que ningún log posterior puede demostrar por sí solo.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'collector_run', 'sca_evaluation', 'login_account', 'account_authenticated', 'service_exposed', 'insecure_default', 'virtualization_role', 'sca_score'],
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
