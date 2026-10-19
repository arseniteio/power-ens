import { ENSControlConfiguration } from '../types';

// op.exp.1 · Asset inventory.
// Governed by the system CATEGORY (BÁSICA / MEDIA / ALTA, selected with the global level). Only op.exp.1.1
// scores; no reinforcement is mandatory. The agent observes the technical half (P-08 says how old that picture
// may get); the organizational half (who answers for each asset, its nature, assets without agent, review date)
// is declared HERE and the agent never reads it.
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
        'Inventario declarado de activos con agente: una fila por activo con su responsable («la persona que toma las decisiones relativas al mismo») y su naturaleza según P-03. El activo se escribe como lo emite el agente en `activo` (nombre corto, comparación literal y sensible a mayúsculas); responsable y naturaleza son obligatorios.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'table',
      example: 'srv-web01 | J. Gómez | Resp. Sistemas | HW servidor',
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
          required: true,
        },
        {
          name: 'rol',
          label: 'Rol',
          type: 'string',
          required: false,
        },
        {
          name: 'naturaleza',
          label: 'Naturaleza (P-03)',
          type: 'string',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'EV-07 contrasta el `activo` que observa el agente (regla 110201) con la columna `activo` de esta tabla (TODOS_EN_LISTA). Un activo monitorizado sin fila sale NO_CUMPLE nombrándolo.',
      ensfacilUsage:
        'Es la parte del requisito que Wazuh no observa: sin responsable identificado, op.exp.1.1 no se cumple aunque el inventario técnico sea impecable.',
      evidenceIds: ['EV-07'],
      ruleIds: ['110201'],
      ifNotConfigured:
        'EV-07 queda NO_EVALUABLE por configuración y op.exp.1.1 NO CUMPLE: el requisito exige identificar al responsable de cada activo.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.1',
      name: 'activos_sin_agente',
      label: 'Activos sin agente',
      description:
        'Elementos que no admiten agente Wazuh (switches, routers, firewalls, impresoras, SAI, OT/IoT, equipamiento de terceros), una fila por elemento con tipo, IP si la tiene y responsable. La IP se escribe como la ve el agente en `network_host_observed`; sin IP, celda vacía.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'table',
      example: 'sw-core01 | switch | 10.0.0.1 | M. López',
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
          required: true,
        },
        {
          name: 'ip',
          label: 'IP',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'EV-05 contrasta cada host vecino que observa el agente (regla 110205) con la columna `ip` de esta tabla (NINGUNO_FUERA_DE_LISTA). Un host que habla con el sistema y no figura sale NO_CUMPLE nombrando su IP.',
      ensfacilUsage:
        'Se incorporan al inventario consolidado. Los que no tienen IP o no hablan con ninguna máquina con agente no se observan: su inventario es declarativo, con verificación manual periódica.',
      evidenceIds: ['EV-05'],
      ruleIds: ['110205'],
      ifNotConfigured:
        'EV-05 queda NO_EVALUABLE por configuración y op.exp.1.1 NO CUMPLE: los elementos sin agente no aparecen en ningún inventario.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.1',
      name: 'naturaleza_activos_taxonomia',
      label: 'Taxonomía de naturaleza de los activos',
      description:
        'Taxonomía de la naturaleza de cada elemento («detallando su naturaleza»): servidor, estación de trabajo, electrónica de red, servicio, aplicación, soporte de información, instalación. Los valores de `naturaleza` (P-01) y `tipo` (P-02) salen de esta lista.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'list',
      example: 'HW servidor, HW red, SW aplicación, SW base, servicio, soporte, instalación',
      required: true,
      wazuhUsage:
        'Ninguna primitiva la contrasta con un hecho: la naturaleza se declara, no se observa. Se exige configurada y sale en el informe.',
      ensfacilUsage:
        'Estructura el inventario declarado por naturaleza. El motor no comprueba que cada `naturaleza` de P-01 pertenezca a esta lista.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'El control no se puede evaluar: el inventario no acredita la naturaleza que exige op.exp.1.1.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.1',
      name: 'periodicidad_revision_inventario_dias',
      label: 'Periodicidad de revisión del inventario (días)',
      description:
        'Cada cuántos días se revisa y valida formalmente el inventario, acto en el que los cambios de composición pasan al inventario declarado. El ENS exige que esté «actualizado» sin fijar periodicidad.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'duration_days',
      example: '90',
      required: true,
      minValue: 1,
      wazuhUsage:
        'EV-06 mide la antigüedad de la última revisión anotada en la máquina (regla 110210) contra este plazo (ANTIGUEDAD_MAXIMA).',
      ensfacilUsage:
        'Una revisión más antigua que el plazo, o ninguna anotada, deja op.exp.1.1 sin cumplir.',
      evidenceIds: ['EV-06'],
      ruleIds: ['110210'],
      ifNotConfigured:
        'EV-06 queda NO_EVALUABLE por configuración: no se acredita que el inventario se mantenga actualizado.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.1',
      name: 'umbral_alerta_activo_nuevo',
      label: 'Alerta ante un activo nuevo',
      description:
        'Si la aparición de un activo no inventariado genera alerta inmediata o solo consta en el informe periódico. Un equipo nuevo sin inventariar puede ser un despliegue legítimo no registrado o un elemento no autorizado.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'select',
      options: ['inmediata', 'periódica'],
      example: 'periódica',
      required: false,
      wazuhUsage:
        'Ninguna primitiva lo juzga: el veredicto de EV-05 es el mismo en ambos modos. La regla 110205 genera alerta de nivel 3 con cada observación.',
      ensfacilUsage:
        'Documenta la decisión de la organización sobre cómo atender un activo nuevo. Sale en el informe.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Se entiende el modo periódico: los activos no inventariados constan en el informe del periodo.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.1',
      name: 'activos_criticos',
      label: 'Activos críticos',
      description:
        'Categorización de los activos críticos por contexto de la organización y riesgo. Corresponde al refuerzo R3, no obligatorio en ninguna categoría, pero útil para priorizar alertas y remediación.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.r3.1'],
      type: 'table',
      example: 'srv-bd01 | alta | contiene datos personales',
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
          required: true,
        },
        {
          name: 'motivo',
          label: 'Motivo',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Ninguna primitiva lo juzga: R3 no es exigible y sale NO_APLICA.',
      ensfacilUsage:
        'Permite priorizar los activos críticos en el informe.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'No se prioriza por criticidad. No afecta al cumplimiento: R3 no es exigible.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.1',
      name: 'antiguedad_maxima_inventario_horas',
      label: 'Antigüedad máxima del inventario técnico (horas)',
      description:
        'Horas que puede pasar un activo sin renovar su inventario técnico ni su contacto con el manager; por encima, el inventario no se da por «actualizado» y el activo cuenta como uno que dejó de reportar. El recolector toma una foto cada 6 horas: 24 tolera tres pasadas perdidas.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.1.1'],
      type: 'duration_hours',
      example: '24',
      required: true,
      minValue: 1,
      wazuhUsage:
        'EV-01 a EV-04 miden contra este plazo la antigüedad de su hecho más reciente (reglas 110201-110204, ANTIGUEDAD_MAXIMA).',
      ensfacilUsage:
        'Convierte un agente apagado o un recolector roto en un incumplimiento visible sin que nadie emita nada.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04'],
      ruleIds: ['110201', '110202', '110203', '110204'],
      ifNotConfigured:
        'EV-01 a EV-04 quedan NO_EVALUABLE por configuración y op.exp.1.1 NO CUMPLE: no hay plazo para decidir si el inventario está al día.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.1',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos que acreditan un requisito que ninguna medida técnica puede demostrar, una fila por requisito con nombre del documento y enlace. Aquí acredita el etiquetado físico del equipamiento y del cableado (R1).',
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
      // Not required: the only documentary requirement of op.exp.1 is R1, not mandatory in any category;
      // requiring it would block op.exp.1.1.
      required: false,
      wazuhUsage:
        'Solo se aplica a requisitos sin evidencia técnica, por lo que nunca tapa una medida fallida. Se marca ATESTACION y se lee «acreditado documentalmente», no «cumple».',
      ensfacilUsage:
        'Solo se aplica a requisitos sin evidencia técnica, por lo que nunca tapa una medida fallida. Se marca ATESTACION y se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'R1 queda sin acreditar. No afecta al cumplimiento: no es exigible en ninguna categoría.',
    },
  ],
};
