import { ENSControl } from '../types';

export const opExp1Control: ENSControl = {
  id: 'op.exp.1',
  title: 'Inventario de activos',
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
        'op.exp.1.1 cumple: las siete evidencias cumplen (inventario técnico no más viejo que P-08, hosts vecinos declarados en P-02, revisión dentro de P-04, activo con fila en P-01) y P-01, P-02, P-03, P-04 y P-08 están bien configurados. Los refuerzos no son exigibles.',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.1.1 cumple: las siete evidencias cumplen (inventario técnico no más viejo que P-08, hosts vecinos declarados en P-02, revisión dentro de P-04, activo con fila en P-01) y P-01, P-02, P-03, P-04 y P-08 están bien configurados. Los refuerzos no son exigibles.',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.1.1 cumple: las siete evidencias cumplen (inventario técnico no más viejo que P-08, hosts vecinos declarados en P-02, revisión dentro de P-04, activo con fila en P-01) y P-01, P-02, P-03, P-04 y P-08 están bien configurados. Los refuerzos no son exigibles.',
    },
  },
  requirements: [
    {
      id: 'op.exp.1.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Inventario actualizado con naturaleza y responsable',
      description:
        'Se mantendrá un inventario actualizado de todos los elementos del sistema, detallando su naturaleza e identificando a su responsable; es decir, la persona que toma las decisiones relativas al mismo.',
      evidences: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    },
    {
      id: 'op.exp.1.r1.1',
      level: [],
      title: 'Etiquetado físico del equipamiento (R1)',
      description:
        'Refuerzo R1 – Inventario de etiquetado: El etiquetado del equipamiento y del cableado formará parte del inventario.',
      evidences: [],
    },
    {
      id: 'op.exp.1.r2.1',
      level: [],
      title: 'Visualización continua del estado de la red (R2)',
      description:
        'Refuerzo R2 – Identificación periódica de activos: Se dispondrá de herramientas que permitan visualizar de forma continua el estado de todos los equipos en la red, en particular, los servidores y los dispositivos de red y de comunicaciones.',
      evidences: ['EV-04'],
    },
    {
      id: 'op.exp.1.r3.1',
      level: [],
      title: 'Categorización de activos críticos (R3)',
      description:
        'Refuerzo R3 – Identificación de activos críticos: Se dispondrá de herramientas que permitan categorizar los activos críticos por contexto de la organización y riesgos de seguridad.',
      evidences: [],
    },
    {
      id: 'op.exp.1.r4.1',
      level: [],
      title: 'Relación de componentes software de terceros (R4)',
      description:
        'Refuerzo R4 – Lista de componentes software: Se mantendrá actualizada una relación formal de los componentes software de terceros empleados en el despliegue del sistema. Esta lista incluirá librerías software y los servicios requeridos para su despliegue (plataforma o entorno operacional). El contenido de la lista de componentes será equivalente a lo requerido en [mp.sw.1.r5].',
      evidences: ['EV-02'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Inventario de hardware y sistema operativo',
      description:
        'Recogida automática y continua del inventario de hardware de cada agente: fabricante, modelo, CPU, memoria, número de serie, y datos del sistema operativo (nombre, versión, arquitectura, kernel). Es la base del inventario técnico exigido por op.exp.1.1.',
      format: 'json_line',
      events: ['evidence_state', 'asset_system'],
      wazuhRuleIds: ['110201'],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.1.1', 'op.exp.1.r4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Inventario de software y paquetes instalados',
      description:
        'Relación completa de paquetes y aplicaciones instaladas en cada activo, con versión y origen. Cubre el inventario de elementos software del sistema y, de forma natural, el contenido que el Refuerzo R4 pide para la lista de componentes software de terceros.',
      format: 'json_line',
      events: ['evidence_state', 'software_inventory'],
      wazuhRuleIds: ['110202'],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Inventario de red: interfaces, puertos y procesos',
      description:
        'Interfaces de red con sus direcciones, puertos abiertos en escucha con el proceso asociado, y procesos en ejecución. Permite completar la naturaleza del activo (qué servicios presta) y detectar servicios no inventariados.',
      format: 'json_line',
      events: ['evidence_state', 'network_inventory'],
      wazuhRuleIds: ['110203'],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.1.1', 'op.exp.1.r2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Visualización continua del estado de los equipos',
      description:
        'Estado en tiempo real de cada agente: activo, desconectado, nunca conectado, con fecha de último contacto. Cubre de forma natural lo que pide el Refuerzo R2 (visualizar de forma continua el estado de todos los equipos en la red).',
      format: 'json_line',
      events: ['evidence_state', 'agent_status'],
      wazuhRuleIds: ['110204'],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de activos nuevos no inventariados',
      description:
        'Identificación de agentes que se registran por primera vez o de hosts detectados en la red que no figuran en el inventario declarado. Un activo no inventariado incumple directamente op.exp.1.1, que exige inventario «de todos los elementos del sistema».',
      format: 'json_line',
      events: ['evidence_state', 'network_host_observed'],
      wazuhRuleIds: ['110205'],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cambios en la composición de los activos',
      description:
        'Detección de variaciones en el inventario de un activo existente: instalación o eliminación de software, cambio de hardware, apertura de puertos nuevos. Un inventario «actualizado» implica reflejar estos cambios, no solo el alta inicial del activo.',
      format: 'json_line',
      events: ['evidence_state', 'inventory_review', 'asset_software_change', 'asset_hardware_change', 'asset_port_opened', 'asset_port_closed'],
      wazuhRuleIds: ['110210', '110206', '110207', '110208', '110209'],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cobertura del inventario frente a activos declarados',
      description:
        'Contraste entre los activos que Wazuh inventaría automáticamente y el conjunto declarado por el cliente (P-01 + P-02). Detecta tanto activos monitorizados sin responsable asignado como activos declarados que han dejado de reportar.',
      format: 'json_line',
      events: ['evidence_state', 'asset_system'],
      wazuhRuleIds: ['110201'],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'responsables_por_activo',
      description:
        'Asignación de responsable a cada activo del sistema. El ENS exige identificar «la persona que toma las decisiones relativas al mismo». Syscollector detecta el activo, pero el responsable es información organizativa que solo puede aportar el cliente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'table',
      usage:
        'ENSFácil cruza el inventario de Syscollector con esta tabla. Todo activo detectado sin responsable asignado genera un hallazgo de inventario incompleto. Es la mitad del requisito que Wazuh no puede cubrir.',
      missingBehavior:
        'El inventario está técnicamente completo pero NO cumple op.exp.1.1, que exige identificar al responsable.',
    },
    {
      id: 'P-02',
      name: 'activos_sin_agente',
      description:
        'Relación de elementos del sistema que no admiten agente Wazuh: switches, routers, firewalls, impresoras, SAI, dispositivos OT/IoT, equipamiento de terceros. Deben inventariarse igualmente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'table',
      usage:
        'Se incorporan al inventario consolidado de ENSFácil. Cuando sea posible, se monitorizan por syslog o SNMP hacia Wazuh. En otro caso, se registran como inventario declarado con verificación periódica manual.',
      missingBehavior:
        'El inventario queda incompleto: los elementos del sistema sin agente no aparecen en ningún listado.',
    },
    {
      id: 'P-03',
      name: 'naturaleza_activos_taxonomia',
      description:
        'Taxonomía con la que se clasifica la naturaleza de cada elemento del sistema, tal como exige el requisito («detallando su naturaleza»): servidor, estación de trabajo, electrónica de red, servicio, aplicación, soporte de información, instalación.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'list',
      usage:
        'ENSFácil clasifica automáticamente lo detectable por Syscollector y solicita clasificación manual para el resto. Estructura el informe de inventario por naturaleza de activo.',
      missingBehavior:
        'El inventario no acredita el detalle de naturaleza que exige op.exp.1.1. Hallazgo de inventario incompleto.',
    },
    {
      id: 'P-04',
      name: 'periodicidad_revision_inventario_dias',
      description:
        'Cada cuánto debe revisarse y validarse el inventario. El ENS exige que esté «actualizado» pero no fija periodicidad: corresponde a la normativa interna de la organización.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'duration_days',
      usage:
        'ENSFácil registra la fecha de la última validación del inventario y alerta al superarse P-04. Independientemente, Syscollector actualiza el inventario técnico de forma continua.',
      missingBehavior:
        'No se puede acreditar que el inventario se mantiene actualizado mediante revisión formal.',
    },
    {
      id: 'P-05',
      name: 'umbral_alerta_activo_nuevo',
      description:
        'Determina si la aparición de un activo no inventariado debe generar alerta inmediata o solo figurar en el informe periódico. Un equipo nuevo en la red que no consta en el inventario puede ser un despliegue legítimo no registrado o un elemento no autorizado.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'select',
      usage:
        'Configura el comportamiento de la regla de detección de activos nuevos. En modo inmediato, cualquier agente nuevo o host detectado en la red sin registro previo genera alerta.',
      missingBehavior:
        'Se aplica el modo periódico por defecto. Los activos no autorizados pueden tardar hasta P-04 en detectarse.',
    },
    {
      id: 'P-06',
      name: 'activos_criticos',
      description:
        'Categorización de los activos críticos por contexto de la organización y riesgo de seguridad. Corresponde al Refuerzo R3, no obligatorio, pero muy útil para priorizar alertas y esfuerzo de remediación.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.r3.1'],
      type: 'table',
      usage:
        'ENSFácil pondera las alertas por criticidad del activo afectado y ordena el informe priorizando los activos críticos. Permite acreditar R3 aunque no sea exigible.',
      missingBehavior:
        'No se puede priorizar por criticidad. Todas las alertas tienen el mismo peso relativo en el informe.',
    },
    {
      id: 'P-08',
      name: 'antiguedad_maxima_inventario_horas',
      description:
        'Horas que puede pasar un activo sin renovar su inventario técnico ni su contacto con el manager. Por encima, su inventario ya no se puede dar por actualizado.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'duration_hours',
      usage:
        'EV-01, EV-02, EV-03 y EV-04 miden contra este plazo la antigüedad de su hecho más reciente.',
      missingBehavior:
        'EV-01 a EV-04 quedan NO_EVALUABLE por configuración y op.exp.1.1 no cumple.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el etiquetado físico del equipamiento y del cableado, que ningún dato de una máquina puede observar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'asset_system', 'software_inventory', 'network_inventory', 'agent_status', 'network_host_observed', 'inventory_review', 'asset_software_change', 'asset_hardware_change', 'asset_port_opened', 'asset_port_closed', 'collector_warning', 'collector_missing', 'collector_run'],
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
