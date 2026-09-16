import { ENSControlConfiguration } from '../types';

export const opExp1Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.1',
  controlName: 'Inventario de activos',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.1',
      name: 'responsables_por_activo',
      label: 'Responsables por activo',
      description:
        'Asignación de responsable a cada activo del sistema. El ENS exige identificar «la persona que toma las decisiones relativas al mismo». Syscollector detecta el activo, pero el responsable es información organizativa que solo puede aportar el cliente.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'table',
      example: 'srv-web01 | J. Gómez | / Resp. Sistemas',
      columns: [
        {
          name: 'activo',
          label: 'Activo',
          type: 'string',
          required: true,
        },
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: false,
        },
        {
          name: 'rol',
          label: 'Rol',
          type: 'identifier',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil cruza el inventario de Syscollector con esta tabla. Todo activo detectado sin responsable asignado genera un hallazgo de inventario incompleto. Es la mitad del requisito que Wazuh no puede cubrir.',
      ensfacilUsage:
        'ENSFácil cruza el inventario de Syscollector con esta tabla. Todo activo detectado sin responsable asignado genera un hallazgo de inventario incompleto. Es la mitad del requisito que Wazuh no puede cubrir.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'El inventario está técnicamente completo pero NO cumple op.exp.1.1, que exige identificar al responsable.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.1',
      name: 'activos_sin_agente',
      label: 'Activos sin agente',
      description:
        'Relación de elementos del sistema que no admiten agente Wazuh: switches, routers, firewalls, impresoras, SAI, dispositivos OT/IoT, equipamiento de terceros. Deben inventariarse igualmente.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'table',
      example: 'sw-core01 | switch | / 10.0.0.1 | M. López',
      columns: [
        {
          name: 'activo',
          label: 'Activo',
          type: 'string',
          required: true,
        },
        {
          name: 'tipo',
          label: 'Tipo',
          type: 'string',
          required: false,
        },
        {
          name: 'ip',
          label: 'IP',
          type: 'string',
          required: false,
        },
        {
          name: 'resp_',
          label: 'Resp.',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Se incorporan al inventario consolidado de ENSFácil. Cuando sea posible, se monitorizan por syslog o SNMP hacia Wazuh. En otro caso, se registran como inventario declarado con verificación periódica manual.',
      ensfacilUsage:
        'Se incorporan al inventario consolidado de ENSFácil. Cuando sea posible, se monitorizan por syslog o SNMP hacia Wazuh. En otro caso, se registran como inventario declarado con verificación periódica manual.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'El inventario queda incompleto: los elementos del sistema sin agente no aparecen en ningún listado.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.1',
      name: 'naturaleza_activos_taxonomia',
      label: 'Naturaleza activos taxonomia',
      description:
        'Taxonomía con la que se clasifica la naturaleza de cada elemento del sistema, tal como exige el requisito («detallando su naturaleza»): servidor, estación de trabajo, electrónica de red, servicio, aplicación, soporte de información, instalación.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'list',
      example: 'HW servidor, / HW red, SW aplicación, / SW base, servicio, / soporte, instalación',
      required: true,
      wazuhUsage:
        'ENSFácil clasifica automáticamente lo detectable por Syscollector y solicita clasificación manual para el resto. Estructura el informe de inventario por naturaleza de activo.',
      ensfacilUsage:
        'ENSFácil clasifica automáticamente lo detectable por Syscollector y solicita clasificación manual para el resto. Estructura el informe de inventario por naturaleza de activo.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'El inventario no acredita el detalle de naturaleza que exige op.exp.1.1. Hallazgo de inventario incompleto.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.1',
      name: 'periodicidad_revision_inventario_dias',
      label: 'Periodicidad revision inventario dias',
      description:
        'Cada cuánto debe revisarse y validarse el inventario. El ENS exige que esté «actualizado» pero no fija periodicidad: corresponde a la normativa interna de la organización.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'duration_days',
      example: '90 (trimestral) / o 180 (semestral)',
      required: true,
      wazuhUsage:
        'ENSFácil registra la fecha de la última validación del inventario y alerta al superarse P-04. Independientemente, Syscollector actualiza el inventario técnico de forma continua.',
      ensfacilUsage:
        'ENSFácil registra la fecha de la última validación del inventario y alerta al superarse P-04. Independientemente, Syscollector actualiza el inventario técnico de forma continua.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede acreditar que el inventario se mantiene actualizado mediante revisión formal.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.1',
      name: 'umbral_alerta_activo_nuevo',
      label: 'Umbral alerta activo nuevo',
      description:
        'Determina si la aparición de un activo no inventariado debe generar alerta inmediata o solo figurar en el informe periódico. Un equipo nuevo en la red que no consta en el inventario puede ser un despliegue legítimo no registrado o un elemento no autorizado.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'select',
      example: 'inmediata / periódica / + excepciones (rangos DHCP / de invitados, etc.)',
      required: true,
      wazuhUsage:
        'Configura el comportamiento de la regla de detección de activos nuevos. En modo inmediato, cualquier agente nuevo o host detectado en la red sin registro previo genera alerta.',
      ensfacilUsage:
        'Configura el comportamiento de la regla de detección de activos nuevos. En modo inmediato, cualquier agente nuevo o host detectado en la red sin registro previo genera alerta.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'Se aplica el modo periódico por defecto. Los activos no autorizados pueden tardar hasta P-04 en detectarse.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.1',
      name: 'activos_criticos',
      label: 'Activos criticos',
      description:
        'Categorización de los activos críticos por contexto de la organización y riesgo de seguridad. Corresponde al Refuerzo R3, no obligatorio, pero muy útil para priorizar alertas y esfuerzo de remediación.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.r3.1'],
      type: 'table',
      example: 'srv-bd01 | alta | / contiene datos personales',
      columns: [
        {
          name: 'activo',
          label: 'Activo',
          type: 'string',
          required: true,
        },
        {
          name: 'criticidad',
          label: 'Criticidad',
          type: 'string',
          required: false,
        },
        {
          name: 'motivo',
          label: 'Motivo',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil pondera las alertas por criticidad del activo afectado y ordena el informe priorizando los activos críticos. Permite acreditar R3 aunque no sea exigible.',
      ensfacilUsage:
        'ENSFácil pondera las alertas por criticidad del activo afectado y ordena el informe priorizando los activos críticos. Permite acreditar R3 aunque no sea exigible.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'No se puede priorizar por criticidad. Todas las alertas tienen el mismo peso relativo en el informe.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.1',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el etiquetado físico del equipamiento y del cableado, que ningún dato de una máquina puede observar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.1.r1.1 | Procedimiento de etiquetado de activos | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        {
          name: 'requisito',
          label: 'Requisito',
          type: 'string',
          required: true,
        },
        {
          name: 'referencia',
          label: 'Referencia',
          type: 'string',
          required: false,
        },
        {
          name: 'enlace',
          label: 'Enlace',
          type: 'string',
          required: false,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      ensfacilUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
};
