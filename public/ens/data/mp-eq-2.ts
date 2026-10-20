import { ENSControl } from '../types';

export const mpEq2Control: ENSControl = {
  id: 'mp.eq.2',
  title: 'Bloqueo de puesto de trabajo',
  framework: 'ENS',
  category: 'Protección de los equipos',
  family: 'Medidas de protección',
  dimension: 'Autenticidad (ÚNICA dimensión)',
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
        'mp.eq.2 → Requisito base: mp.eq.2.1 (bloqueo por inactividad con reautenticación)',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.eq.2 + R1 → Base + mp.eq.2.r1.1 (cancelación de sesiones abiertas)',
    },
  },
  requirements: [
    {
      id: 'mp.eq.2.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Bloqueo por inactividad con nueva autenticación',
      description:
        'El puesto de trabajo se bloqueará al cabo de un tiempo prudencial de inactividad, requiriendo una nueva autenticación del usuario para reanudar la actividad en curso.',
      evidences: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
    },
    {
      id: 'mp.eq.2.r1.1',
      level: ['ALTO'],
      title: 'Cancelación de las sesiones abiertas tras un tiempo superior',
      description:
        'Pasado un cierto tiempo, superior al anterior, se cancelarán las sesiones abiertas desde dicho puesto de trabajo.',
      evidences: ['EV-02', 'EV-04'],
      active: false,
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.eq.2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Política de bloqueo por inactividad configurada',
      description:
        'Verificación en cada equipo de P-03 de que existe bloqueo automático por inactividad, que su temporizador no supera P-01 y que el desbloqueo exige credenciales. El requisito pide expresamente «nueva autenticación», de modo que un salvapantallas sin contraseña no lo satisface.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.eq.2.r1.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Política de cancelación de sesiones configurada (R1)',
      description:
        'Verificación de que existe límite de sesión inactiva que cancela las sesiones abiertas, que su valor es superior al de P-01 y que no excede P-02. La relación entre ambos tiempos es parte del requisito.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-03',
      requirement: ['mp.eq.2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Eventos de bloqueo y desbloqueo de estación',
      description:
        'Registro de los eventos de bloqueo y desbloqueo efectivos en cada puesto, lo que permite comprobar que la política no solo está configurada sino que opera. Una política correcta que nunca produce eventos de bloqueo en equipos con actividad es un indicio claro de que algo la está neutralizando.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.eq.2.1', 'mp.eq.2.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Sesiones de larga duración sin bloqueo intermedio',
      description:
        'Detección de sesiones que se mantienen activas durante períodos prolongados sin ningún evento de bloqueo, pese a que el patrón de actividad sugiere que debió haber inactividad. Es la señal de que el control no está operando en la práctica.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.eq.2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Herramientas de inhibición del temporizador de inactividad',
      description:
        'Detección de procesos o ejecutables instalados que neutralizan el bloqueo por inactividad simulando actividad del usuario. Es el vector de elusión del control y no se detecta con ninguna comprobación de configuración.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['mp.eq.2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cobertura y excepciones del control',
      description:
        'Contraste entre los equipos de P-03 y los que efectivamente tienen la política verificada, con las excepciones autorizadas de P-04 identificadas por separado. Permite distinguir un hueco de cobertura de una excepción aceptada.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'timeout_bloqueo_minutos',
      description:
        'Minutos de inactividad tras los cuales el puesto de trabajo debe bloquearse exigiendo nueva autenticación. El ENS habla de «tiempo prudencial» sin fijarlo: lo determina la normativa interna o la guía CCN-STIC.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.eq.2.1'],
      type: 'number',
      usage:
        'SCA verifica el valor configurado en la política de cada equipo y alerta si es superior a P-01 o si el bloqueo está deshabilitado. Es la comprobación central del control.',
      missingBehavior:
        'mp.eq.2.1 NO EVALUABLE. No hay referencia contra la que comparar la política configurada.',
    },
    {
      id: 'P-02',
      name: 'timeout_cierre_sesion_minutos',
      description:
        'Minutos tras los cuales deben cancelarse las sesiones abiertas desde el puesto. R1 exige que este tiempo sea SUPERIOR al de bloqueo de P-01, de modo que la relación entre ambos valores es parte del requisito.',
      level: ['ALTO'],
      requirements: ['mp.eq.2.r1.1'],
      type: 'number',
      usage:
        'SCA verifica los límites de sesión configurados.',
      missingBehavior:
        'R1 NO EVALUABLE y es obligatorio en nivel ALTO. Las sesiones pueden quedar abiertas indefinidamente.',
    },
    {
      id: 'P-03',
      name: 'equipos_en_alcance',
      description:
        'Puestos de trabajo sujetos al control, con su sistema operativo y el método de aplicación de la política (GPO de dominio, política local, MDM).',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.eq.2.1'],
      type: 'table',
      usage:
        'Define el alcance de las comprobaciones SCA.',
      missingBehavior:
        'No se puede determinar la cobertura del control ni detectar equipos exentos de la política.',
    },
    {
      id: 'P-04',
      name: 'excepciones_autorizadas',
      description:
        'Equipos o perfiles con excepción autorizada al bloqueo por inactividad —puestos de control continuo, pantallas de monitorización, quioscos— con su justificación y las medidas compensatorias aplicadas.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.eq.2.1'],
      type: 'table',
      usage:
        'ENSFácil excluye estos equipos del cómputo de incumplimiento pero los mantiene visibles en el informe como riesgo aceptado con trazabilidad de quién lo autorizó.',
      missingBehavior:
        'Las excepciones legítimas se contabilizan como incumplimiento y distorsionan el semáforo.',
    },
    {
      id: 'P-05',
      name: 'vigilar_inhibidores_bloqueo',
      description:
        'Determina si debe vigilarse el uso de herramientas que inhiben el temporizador de inactividad (mouse jigglers por software, utilidades tipo «caffeine», scripts de pulsación simulada), que neutralizan el control sin modificar la política.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.eq.2.1'],
      type: 'table',
      usage:
        'Syscollector detecta estos procesos y ejecutables instalados. Es un vector de incumplimiento silencioso: la política está bien, el usuario la elude y ningún check de configuración lo revela.',
      missingBehavior:
        'No se detecta la elusión del control por software. La política puede estar correcta y no aplicarse en la práctica.',
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
