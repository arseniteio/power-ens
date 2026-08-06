import { ENSControl } from '../types';

export const opAcc3Control: ENSControl = {
  id: 'op.acc.3',
  title: 'Segregación de funciones y tareas',
  framework: 'ENS',
  category: 'Control de acceso',
  family: 'Marco operacional',
  dimension: 'Confidencialidad, Integridad, Trazabilidad y Autenticidad',
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
        'op.acc.3 → Requisitos base: op.acc.3.1 + op.acc.3.2',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.acc.3 + R1 → Requisitos base + op.acc.3.r1.1 + op.acc.3.r1.2',
    },
  },
  requirements: [
    {
      id: 'op.acc.3.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Siempre que sea posible, las capacidades de desarrollo y…',
      description:
        'Siempre que sea posible, las capacidades de desarrollo y operación no recaerán en la misma persona.',
      evidences: ['EV-01', 'EV-06'],
    },
    {
      id: 'op.acc.3.2',
      level: ['MEDIO', 'ALTO'],
      title: 'Siempre que sea posible, las personas que autorizan y…',
      description:
        'Siempre que sea posible, las personas que autorizan y controlan el uso serán distintas.',
      evidences: ['EV-02', 'EV-06'],
    },
    {
      id: 'op.acc.3.r1.1',
      level: ['ALTO'],
      title: 'Siempre que sea posible, la misma persona no aunará…',
      description:
        'Siempre que sea posible, la misma persona no aunará funciones de configuración y mantenimiento del sistema.',
      evidences: ['EV-04', 'EV-06'],
      active: false,
    },
    {
      id: 'op.acc.3.r1.2',
      level: ['ALTO'],
      title: 'La misma persona no puede aunar funciones de auditoría o…',
      description:
        'La misma persona no puede aunar funciones de auditoría o supervisión con cualquier otra función.',
      evidences: ['EV-05'],
      active: false,
    },
    {
      id: 'op.acc.3.r2.1',
      level: [],
      title: 'Refuerzo R2 – Privilegios de auditoría: Existirán cuentas…',
      description:
        'Refuerzo R2 – Privilegios de auditoría: Existirán cuentas con privilegios de auditoría estrictamente controladas y personalizadas.',
      evidences: [],
    },
    {
      id: 'op.acc.3.r3.1',
      level: [],
      title: 'Refuerzo R3 – Acceso a la información de seguridad: El…',
      description:
        'Refuerzo R3 – Acceso a la información de seguridad: El acceso a la información de seguridad del sistema estará permitido únicamente a los administradores de seguridad/sistema autorizados, utilizando los mecanismos de acceso imprescindibles (consola, interfaz web, acceso remoto, etc.).',
      evidences: ['EV-07'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.acc.3.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de desarrollo y operación en la misma cuenta',
      description:
        'Identificación de cuentas que, dentro de la ventana P-06, han ejecutado tanto acciones clasificadas como desarrollo (según P-03) como acciones de operación. Vulnera directamente op.acc.3.1.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.acc.3.2'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de autorización y control en la misma cuenta',
      description:
        'Identificación de cuentas que autorizan un acceso o cambio y a la vez ejercen la función de control o verificación sobre ese mismo ámbito. Vulnera op.acc.3.2.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.acc.3'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación de concurrencia en tareas críticas',
      description:
        'Comprobación de que las tareas declaradas como críticas en P-04 han sido ejecutadas o aprobadas por al menos el número de personas distintas exigido. Detecta tareas críticas realizadas unilateralmente.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.acc.3.r1.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Detección de configuración y mantenimiento en la misma cuenta (R1)',
      description:
        'Identificación de cuentas que aúnan funciones de configuración del sistema y de mantenimiento dentro de la ventana P-06. Aplicable solo en nivel ALTO.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-05',
      requirement: ['op.acc.3.r1.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Cuentas de auditoría ejerciendo otras funciones (R1)',
      description:
        'Detección de cuentas incluidas en P-05 (auditoría/supervisión) que ejecutan acciones ajenas a su función: escritura, cambios de configuración, despliegues, gestión de usuarios. Vulnera op.acc.3.r1.2, que es taxativo (no admite el matiz «siempre que sea posible»).',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-06',
      requirement: ['op.acc.3.1', 'op.acc.3.2', 'op.acc.3.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Inventario de acciones por cuenta y función',
      description:
        'Registro agregado de qué acciones ha ejecutado cada cuenta en el período, clasificadas por función según P-03. Es la evidencia documental de soporte para acreditar la segregación ante un auditor, incluso cuando no hay alertas.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.acc.3.r3.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Acceso a la información de seguridad del sistema',
      description:
        'Monitorización de accesos a la configuración de seguridad, logs de auditoría y consolas de gestión, para verificar que solo los administradores de seguridad/sistema autorizados acceden. Corresponde al Refuerzo R3, no obligatorio pero recomendable.',
      format: 'fim_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'matriz_funciones_persona',
      description:
        'Mapa que asocia cada persona/cuenta con las funciones que desempeña en el sistema: desarrollo, operación, autorización, control, configuración, mantenimiento, auditoría, supervisión.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3.1', 'op.acc.3.2', 'op.acc.3.r1.1', 'op.acc.3.r1.2'],
      type: 'list',
      usage:
        'Es la pieza central del control.',
      missingBehavior:
        'El control es NO EVALUABLE automáticamente. Solo puede acreditarse por revisión documental.',
    },
    {
      id: 'P-02',
      name: 'pares_funciones_incompatibles',
      description:
        'Definición de qué pares de funciones son incompatibles según el nivel del sistema. En MEDIO: desarrollo↔operación, autorización↔control. En ALTO se añade: configuración↔mantenimiento y auditoría↔cualquier otra.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3.1', 'op.acc.3.2', 'op.acc.3.r1.1', 'op.acc.3.r1.2'],
      type: 'list',
      usage:
        'Define la lógica de las reglas de correlación.',
      missingBehavior:
        'No se pueden generar reglas de incompatibilidad. Detección automática desactivada.',
    },
    {
      id: 'P-03',
      name: 'acciones_por_funcion',
      description:
        'Mapa que traduce cada función organizativa en acciones técnicas observables en logs: qué comandos, procesos, rutas o EventIDs identifican una acción de desarrollo, de operación, de configuración, de auditoría, etc.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3.1', 'op.acc.3.2'],
      type: 'list',
      usage:
        'Es la traducción indispensable entre el plano organizativo y el técnico. Sin ella Wazuh no puede saber qué función está ejerciendo un usuario cuando ejecuta una acción.',
      missingBehavior:
        'Las reglas de correlación no pueden clasificar las acciones. Detección automática inviable.',
    },
    {
      id: 'P-04',
      name: 'tareas_criticas_doble_persona',
      description:
        'Lista de tareas consideradas críticas que exigen la concurrencia de dos o más personas (enunciado general de op.acc.3): despliegues en producción, cambios en firewall, restauración de copias, modificación de privilegios, etc.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3'],
      type: 'list',
      usage:
        'ENSFácil verifica en los logs que estas tareas hayan sido ejecutadas o aprobadas por más de una cuenta distinta. Ejecución por una sola persona → alerta.',
      missingBehavior:
        'No se puede verificar el requisito de concurrencia de dos personas en tareas críticas.',
    },
    {
      id: 'P-05',
      name: 'cuentas_auditoria',
      description:
        'Cuentas con privilegios de auditoría o supervisión del sistema. En nivel ALTO estas cuentas no pueden aunar ninguna otra función (op.acc.3.r1.2).',
      level: ['ALTO'],
      requirements: ['op.acc.3.r1.2'],
      type: 'list',
      usage:
        'CDB list en Wazuh. Cualquier acción de estas cuentas que no sea de lectura/consulta (escritura, configuración, despliegue) genera alerta de segregación vulnerada.',
      missingBehavior:
        'R1 parcialmente NO EVALUABLE. No se puede verificar op.acc.3.r1.2.',
    },
    {
      id: 'P-06',
      name: 'ventana_correlacion_dias',
      description:
        'Ventana temporal en la que ENSFácil evalúa si una misma cuenta ha ejercido funciones incompatibles. Define el período de agregación de las reglas de correlación.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3.1', 'op.acc.3.2'],
      type: 'duration_days',
      usage:
        'Configura el timeframe de las reglas de correlación de Wazuh y el período de análisis agregado que ejecuta ENSFácil sobre el histórico de alertas.',
      missingBehavior:
        'Se aplica un valor por defecto de 30 días, que puede no ajustarse al ciclo real de la organización.',
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
