import { ENSControlConfiguration } from '../types';

export const opAcc3Configuration: ENSControlConfiguration = {
  controlId: 'op.acc.3',
  controlName: 'Segregación de funciones y tareas',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.acc.3',
      name: 'matriz_funciones_persona',
      label: 'Matriz de funciones por persona',
      description:
        'Relación entre cada cuenta y las funciones que tiene atribuidas en el sistema según el organigrama: desarrollo, operación, autorización, control, configuración, mantenimiento, auditoría o supervisión. Es una declaración organizativa del responsable y no se deduce de la máquina. Se escribe una fila por cuenta, con las funciones que ejerce.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3.1', 'op.acc.3.2', 'op.acc.3.r1.1', 'op.acc.3.r1.2'],
      type: 'table',
      example: 'jgomez | desarrollo',
      columns: [
        {
          name: 'cuenta',
          label: 'Cuenta',
          type: 'identifier',
          required: true,
        },
        {
          name: 'funciones',
          label: 'Funciones',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Ningún agente lee esta tabla. Lo que el agente recoge de la máquina son las acciones de cada cuenta sin clasificar, y esta matriz es la referencia organizativa contra la que se contrastan.',
      ensfacilUsage:
        'ENSFácil la incorpora al informe como soporte documental: permite comparar las funciones que una cuenta ejerce de hecho, deducidas de lo que hace, con las que tiene atribuidas sobre el papel. El veredicto de incompatibilidad no sale de aquí, sino del cruce de P-03 con P-02.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'El informe pierde la referencia organizativa y la comparación entre lo observado y lo atribuido pasa a hacerse a mano en la revisión documental. Al estar declarado obligatorio, además, la configuración del control queda incompleta hasta que se rellene.',
    },
    {
      id: 'P-02',
      controlId: 'op.acc.3',
      name: 'pares_funciones_incompatibles',
      label: 'Pares de funciones incompatibles',
      description:
        'Qué parejas de funciones no puede acumular una misma persona. En nivel MEDIO el ENS exige separar desarrollo de operación y autorización de control; en ALTO se añaden configuración frente a mantenimiento y auditoría frente a cualquier otra función, que se escribe con el comodín asterisco en la segunda celda. Se declara una pareja por línea, con las dos funciones separadas por una barra vertical, y los nombres tienen que escribirse exactamente igual que en P-03.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3.1', 'op.acc.3.2', 'op.acc.3.r1.1', 'op.acc.3.r1.2'],
      type: 'list',
      example: 'desarrollo | operacion',
      required: true,
      wazuhUsage:
        'Ningún agente lo lee: qué combinación de funciones está prohibida es una decisión de política y vive solo en esta pantalla. La máquina se limita a decir qué hizo cada cuenta.',
      ensfacilUsage:
        'Es la mitad del juicio de este control. El motor agrupa las acciones observadas por cuenta, las traduce a funciones con P-03 y comprueba si alguna cuenta reúne los dos términos de alguna de estas parejas. Cuando ocurre, el requisito correspondiente sale como no conforme nombrando la cuenta y las funciones que aúna, y cambiar una línea de aquí cambia el veredicto sin volver a ejecutar nada en el servidor.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'Los cuatro requisitos que dependen del cruce salen NO EVALUABLE y el motivo nombra este parámetro. No salen como incumplidos: sin saber qué combinaciones están prohibidas no se ha llegado a medir, y afirmar un incumplimiento sobre algo que no se ha comprobado sería falso.',
    },
    {
      id: 'P-03',
      controlId: 'op.acc.3',
      name: 'acciones_por_funcion',
      label: 'Acciones por función',
      description:
        'Traducción de cada función organizativa a lo que se puede observar en la máquina: qué comandos, binarios o rutas identifican una acción de desarrollo, de operación, de configuración o de auditoría. Cada fila lleva el nombre de la función y uno o varios indicadores. Cada indicador casa por subcadena contra el binario ejecutado y la ruta tocada, así que una misma acción puede pertenecer a varias funciones sin que eso sea un error.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3.1', 'op.acc.3.2'],
      type: 'table',
      example: 'desarrollo | git',
      columns: [
        {
          name: 'funcion',
          label: 'Función',
          type: 'string',
          required: true,
        },
        {
          name: 'indicadores',
          label: 'Indicadores',
          type: 'string',
          required: false,
          // La fila trae N indicadores: `funcion | ind | ind | ...`.
          variadic: true,
        },
      ],
      required: true,
      wazuhUsage:
        'El agente emite las acciones sin clasificar, con la cuenta, el binario y la ruta. Esta tabla es la que convierte esa observación en una función, y también la que decide qué vigila el sistema: la plantilla de reglas de auditoría del agente solo observa los binarios que aquí se declaran, así que al añadir una función hay que añadir su binario en la máquina y recargar las reglas.',
      ensfacilUsage:
        'Es la traducción indispensable entre el plano organizativo y el técnico, y sin ella el motor no puede saber qué función está ejerciendo una cuenta cuando ejecuta una acción. Con ella construye, para cada cuenta, el conjunto de funciones que ha ejercido en el periodo, que es lo que después se cruza con P-02.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'Los cuatro requisitos del cruce salen NO EVALUABLE nombrando este parámetro: sin la traducción de acción a función no hay ninguna incompatibilidad que ver, por buena que sea la telemetría recogida.',
    },
    {
      id: 'P-04',
      controlId: 'op.acc.3',
      name: 'tareas_criticas_doble_persona',
      label: 'Tareas críticas con doble persona',
      description:
        'Qué tareas se consideran críticas y cuántas personas distintas exige cada una, que es lo que pide el enunciado general de op.acc.3: despliegues en producción, cambios en el cortafuegos, restauración de copias o modificación de privilegios. Se declara una tarea por línea, con su nombre y el número de personas. Es la mitad de la declaración: qué comando es cada tarea en cada máquina se escribe en el fichero de tareas críticas del agente, y las dos mitades se unen por el nombre, en minúsculas.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3'],
      type: 'list',
      example: 'despliegue en produccion | 2',
      required: true,
      wazuhUsage:
        'El agente observa qué cuentas distintas ejecutaron cada tarea declarada en el fichero de tareas críticas de su máquina y emite una por persona, no una por ejecución. Contar cuántas hubo y compararlas con lo exigido no es cosa suya.',
      ensfacilUsage:
        'El motor cuenta cuántas cuentas distintas intervinieron en cada tarea que se haya ejecutado en el periodo y lo compara con el número declarado aquí. Una tarea que nadie ejecutó no incumple, porque exigir concurrencia a algo que no ocurrió sería acusar por una ausencia. Una fila con menos de dos personas, o con algo que no sea un número, se ignora.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'La concurrencia no se mide: la tarea se sigue observando pero no se juzga. Los hechos se recogen igualmente, así que al declararlo más tarde el veredicto se calcula sobre lo ya recogido sin volver a tocar el servidor.',
    },
    {
      id: 'P-05',
      controlId: 'op.acc.3',
      name: 'cuentas_auditoria',
      label: 'Cuentas de auditoría',
      description:
        'Qué cuentas ejercen funciones de auditoría o supervisión del sistema, con su ámbito. Solo se exige en nivel ALTO, y ahí el ENS es taxativo: esas cuentas no pueden aunar ninguna otra función. Se declara una cuenta por línea; del ámbito el motor solo lee la primera celda, que es la cuenta.',
      levels: ['ALTO'],
      requirements: ['op.acc.3.r1.2'],
      type: 'list',
      example: 'auditor1 | global',
      required: false,
      wazuhUsage:
        'Ningún agente lo lee: quién audita es una decisión organizativa. El agente se limita a emitir todas las acciones de todas las cuentas, incluidas las de auditoría.',
      ensfacilUsage:
        'El motor comprueba que ninguna cuenta declarada aquí tenga, en el conjunto de acciones observadas, ninguna función distinta de auditoría o supervisión. Reconoce esa función por su nombre literal, así que si en P-03 se le llama de otra forma la propia actividad de auditar contará como otra función y el requisito saldrá incumplido sin motivo.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'El requisito op.acc.3.r1.2 pierde su comprobación directa y solo puede verificarse por la otra vía, el comodín de auditoría en P-02. En niveles BAJO y MEDIO no es exigible y sale como no aplicable.',
    },
    {
      id: 'P-06',
      controlId: 'op.acc.3',
      name: 'ventana_correlacion_dias',
      label: 'Ventana de correlación en días',
      description:
        'Periodo, en días, dentro del cual dos acciones de una misma cuenta se consideran concurrentes a efectos de segregación. Es el horizonte que la organización declara ante el auditor y que el informe cita, y suele coincidir con su ciclo de revisión: un mes natural o un trimestre.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.3.1', 'op.acc.3.2'],
      type: 'duration_days',
      example: '30',
      required: true,
      wazuhUsage:
        'Ningún agente lo lee. Cada recolector decide por su cuenta qué tramo del registro de auditoría relee en cada pasada, que es otra cosa: eso solo evita repetir hechos ya emitidos.',
      ensfacilUsage:
        'Hoy el evaluador de op.acc.3 no consulta este parámetro: la correlación se calcula sobre la ventana de evaluación del motor, que es de treinta días. Se declara igualmente porque es lo que documenta el criterio ante el auditor y lo que el informe recoge.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'Rige la ventana de evaluación del motor, de treinta días, que puede no ajustarse al ciclo real de la organización. Al estar declarado obligatorio, además, la configuración del control queda incompleta hasta que se rellene.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.acc.3',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna telemetría puede demostrar. Se declara una fila por requisito, con el documento aprobado, su enlace, la fecha y quién lo declara. En op.acc.3 el caso es el refuerzo R2 sobre privilegios de auditoría, que exige que existan cuentas de auditoría estrictamente controladas y personalizadas: eso se acredita con un procedimiento escrito, no con un evento.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.acc.3.r2.1 | Nombre del documento aprobado | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        {
          name: 'requisito',
          label: 'Requisito',
          type: 'identifier',
          required: true,
        },
        {
          name: 'referencia',
          label: 'Documento',
          type: 'string',
          required: true,
        },
        {
          name: 'enlace',
          label: 'Enlace(s)',
          type: 'string',
          required: true,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Declarado por',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No lo lee ningún agente: es la prueba documental de lo que la telemetría no alcanza. El motor lo aplica solo a requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que falla.',
      ensfacilUsage:
        'El requisito pasa a cumplir marcado como acreditado documentalmente, con su documento y su enlace en el informe, y nunca se presenta como medido. Lo que no es legítimo es apuntar a un documento que todavía no se ha escrito.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Los requisitos sin evidencia técnica siguen contando como no conformes, que es el criterio por defecto: la carga de la prueba es del auditado.',
    },
  ],
};
