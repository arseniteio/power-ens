import { ENSControl } from '../types';

export const opAcc4Control: ENSControl = {
  id: 'op.acc.4',
  title: 'Proceso de gestión de derechos de acceso',
  framework: 'ENS',
  category: 'Control de acceso',
  family: 'Marco operacional',
  dimension: 'Confidencialidad, Integridad, Trazabilidad y Autenticidad',
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
        'op.acc.4 → Requisitos base: op.acc.4.1 a op.acc.4.5',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.acc.4 → Ídem Nivel BAJO.',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.acc.4 → Ídem Nivel BAJO. No existen refuerzos en este control.',
    },
  },
  requirements: [
    {
      id: 'op.acc.4.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Todo acceso estará prohibido, salvo autorización expresa.',
      description:
        'Todo acceso estará prohibido, salvo autorización expresa.',
      evidences: ['EV-01', 'EV-02'],
    },
    {
      id: 'op.acc.4.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Mínimo privilegio: los privilegios de cada entidad, usuario…',
      description:
        'Mínimo privilegio: los privilegios de cada entidad, usuario o proceso se reducirán al mínimo imprescindible para cumplir sus obligaciones o funciones.',
      evidences: ['EV-02', 'EV-03', 'EV-08'],
    },
    {
      id: 'op.acc.4.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Necesidad de conocer y responsabilidad de compartir: los…',
      description:
        'Necesidad de conocer y responsabilidad de compartir: los privilegios se asignarán de forma que las entidades, usuarios o procesos sólo accederán al conocimiento de aquella información requerida para cumplir sus obligaciones o funciones. La información es patrimonio del organismo y toda aquella que resulte necesaria para el usuario estará a su disposición.',
      evidences: ['EV-07'],
    },
    {
      id: 'op.acc.4.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Capacidad de autorizar: Exclusivamente el personal con…',
      description:
        'Capacidad de autorizar: Exclusivamente el personal con competencia para ello podrá conceder, alterar o anular la autorización de acceso a los recursos, conforme a los criterios establecidos por su responsable. Los permisos de acceso se revisarán de forma periódica.',
      evidences: ['EV-03', 'EV-04', 'EV-05'],
    },
    {
      id: 'op.acc.4.5',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Se establecerá una política específica de acceso remoto,…',
      description:
        'Se establecerá una política específica de acceso remoto, requiriéndose autorización expresa.',
      evidences: ['EV-06'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.acc.4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación de denegación por defecto',
      description:
        'Comprobación de que la configuración de los sistemas aplica denegación por defecto: políticas de firewall con DROP por defecto, servicios sin acceso anónimo, recursos compartidos sin permisos para «Todos» o «Everyone».',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.acc.4.1', 'op.acc.4.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Contraste de privilegios reales contra matriz autorizada',
      description:
        'Extracción de los privilegios efectivamente configurados en los sistemas (ACLs, membresías de grupo, permisos sudo) y comparación con la matriz P-01. Detecta privilegios asignados sin autorización expresa y privilegios superiores al mínimo imprescindible.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.acc.4.2', 'op.acc.4.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cambios en grupos privilegiados',
      description:
        'Detección de altas y bajas en los grupos declarados en P-06. Toda incorporación a un grupo privilegiado supone una concesión de derechos que debe estar contemplada en P-01 y realizada por personal competente (P-02).',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.acc.4.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cambios de permisos por cuenta no competente',
      description:
        'Identificación de eventos de concesión, alteración o anulación de permisos ejecutados por cuentas que no figuran en P-02 como personal con capacidad de autorizar.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.acc.4.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Control de la revisión periódica de permisos',
      description:
        'Registro de la fecha de la última revisión de permisos realizada y verificación de que no se ha superado el plazo P-03. La revisión puede detectarse por evidencias en el sistema o declararse en ENSFácil.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.acc.4.5'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Accesos remotos por canal, origen y usuario',
      description:
        'Registro de todas las conexiones remotas al sistema con identificación de canal, puerto, IP de origen y cuenta. Contraste contra los canales permitidos (P-04) y los usuarios autorizados (P-05).',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.acc.4.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Accesos a recursos sujetos a necesidad de conocer',
      description:
        'Monitorización de accesos a los recursos declarados en P-07, con identificación del perfil de la cuenta que accede. Detecta accesos por perfiles sin justificación declarada, aunque el permiso técnico exista.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.acc.4.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cuentas con privilegios excesivos o innecesarios',
      description:
        'Identificación de cuentas cuyos privilegios exceden lo necesario: usuarios con shell innecesaria, cuentas de servicio con permisos de administrador, usuarios con sudo sin restricción de comandos (ALL=(ALL) ALL).',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'matriz_privilegios_autorizados',
      description:
        'Matriz que define, para cada perfil o rol, qué recursos puede acceder y con qué tipo de acceso. Es la referencia contra la que se contrasta la configuración real del sistema.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.1', 'op.acc.4.2', 'op.acc.4.3'],
      type: 'list',
      usage:
        'Núcleo del control. Cualquier privilegio no contemplado → alerta de acceso sin autorización expresa.',
      missingBehavior:
        'op.acc.4.1, .2 y .3 NO EVALUABLES. Sin referencia autorizada no se puede juzgar si un privilegio es excesivo.',
    },
    {
      id: 'P-02',
      name: 'personal_con_capacidad_autorizar',
      description:
        'Lista de cuentas o personas con competencia para conceder, alterar o anular autorizaciones de acceso, y sobre qué ámbito de recursos.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.4'],
      type: 'list',
      usage:
        'CDB list en Wazuh. Cualquier evento de cambio de permisos o membresía de grupo ejecutado por una cuenta fuera de esta lista → alerta de autorización no competente.',
      missingBehavior:
        'No se puede verificar op.acc.4.4. Cualquier cambio de permisos se registra sin poder juzgar su legitimidad.',
    },
    {
      id: 'P-03',
      name: 'periodicidad_revision_permisos_dias',
      description:
        'Cada cuánto deben revisarse los permisos de acceso. El ENS exige revisión periódica (op.acc.4.4) pero deja la periodicidad concreta a la normativa interna de la organización.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.4'],
      type: 'duration_days',
      usage:
        'ENSFácil registra la fecha de la última revisión declarada o detectada y alerta cuando se supera el plazo P-03 sin que conste una nueva revisión.',
      missingBehavior:
        'No se puede verificar el cumplimiento de la revisión periódica exigida por op.acc.4.4.',
    },
    {
      id: 'P-04',
      name: 'canales_acceso_remoto_permitidos',
      description:
        'Canales, protocolos y orígenes autorizados para el acceso remoto al sistema: VPN corporativa, bastión SSH, escritorio remoto con doble factor, rangos de IP permitidos.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.5'],
      type: 'list',
      usage:
        'ENSFácil genera reglas Wazuh que alertan ante conexiones remotas por canales, puertos u orígenes no incluidos en P-04. Es la traducción técnica de la política de acceso remoto.',
      missingBehavior:
        'op.acc.4.5 NO EVALUABLE. No se puede distinguir un acceso remoto legítimo de uno no autorizado.',
    },
    {
      id: 'P-05',
      name: 'usuarios_autorizados_acceso_remoto',
      description:
        'Cuentas que tienen autorización expresa para acceder remotamente al sistema. El ENS exige autorización expresa para el acceso remoto (op.acc.4.5).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.5'],
      type: 'list',
      usage:
        'CDB list en Wazuh. Cualquier acceso remoto de una cuenta no incluida genera alerta de acceso remoto sin autorización expresa.',
      missingBehavior:
        'No se puede verificar la autorización expresa individual para acceso remoto.',
    },
    {
      id: 'P-06',
      name: 'grupos_privilegiados',
      description:
        'Grupos del sistema o del directorio cuya pertenencia otorga privilegios elevados (Administrators, Domain Admins, wheel, sudo, root-equivalentes). Su vigilancia es la vía más directa para verificar el mínimo privilegio.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.2'],
      type: 'list',
      usage:
        'Wazuh monitoriza altas y bajas en estos grupos (EventID 4728/4732/4756 en Windows, cambios en /etc/group en Linux). Toda alta debe corresponder a la matriz P-01.',
      missingBehavior:
        'No se detectan escaladas de privilegio por adición a grupos privilegiados.',
    },
    {
      id: 'P-07',
      name: 'recursos_sensibles_necesidad_conocer',
      description:
        'Recursos que contienen información sujeta al principio de necesidad de conocer, con indicación de qué perfiles tienen justificación de acceso (op.acc.4.3).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.3'],
      type: 'list',
      usage:
        'ENSFácil monitoriza accesos a estos recursos y alerta cuando accede un perfil sin justificación declarada, aunque técnicamente tenga permiso.',
      missingBehavior:
        'op.acc.4.3 NO EVALUABLE. No se puede distinguir acceso técnicamente posible de acceso justificado.',
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
