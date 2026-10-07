import { ENSControlConfiguration } from '../types';

// op.exp.5 · la política que decide el control. El agente emite los cambios
// reales y el registro de peticiones tal cual; el veredicto sale de
// contrastarlos con lo que aquí se decide (`policies/op-exp-5.policy.ts`).
//
// Cambios frente a la plantilla del auditor, todos porque el tipo que traía no
// podía alimentar ningún juicio:
//
//   P-01  «Selección + acceso» → tabla herramienta | ubicacion |
//         prefijo_referencia. Sin ITSM, las peticiones viven en el registro TSV
//         de cada máquina (`/etc/ensfacil/change-register.tsv`) y P-01 declara
//         que ESE es el registro de verdad. Si declara otro sistema, el
//         contraste queda sin demostrar en vez de juzgar una copia.
//   P-04  «Nombre + cuenta ITSM» → tabla nombre | cuenta: se compara la cuenta.
//   P-06  «Lista documento | ubicación» → tabla documento | ubicacion |
//         plazo_dias. Dos campos por fila no caben en una lista, y «en la
//         ventana posterior al cambio» necesita un plazo.
//   P-07  «Selección + destino» → tabla canal | destino.
//   P-08  «tipo de cambio | mecanismo» → el esquema de P-07 de op.exp.4
//         (sistema | mecanismo | evidencia | ventana_horas). Sin sistema ni
//         ventana, «ANTES del cambio» no se puede medir y un snapshot de la
//         semana pasada valdría como uno de ayer.
//   P-09  NUEVO. «Efectos adversos en la ventana posterior al cambio» (EV-07)
//         necesita esa ventana, y la plantilla no la declaraba. No se le da
//         valor por defecto: sería política escrita en el código.
export const opExp5Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.5',
  controlName: 'Gestión de cambios',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.5',
      name: 'sistema_gestion_cambios',
      label: 'Sistema de gestión de cambios',
      description:
        'Dónde se registran las peticiones de cambio y con qué numeración. Sin integración con un ITSM, el registro que ENSFácil sabe leer es el TSV que la organización mantiene en cada máquina (/etc/ensfacil/change-register.tsv): herramienta «registro_tsv». Si las peticiones viven en otro sistema (Jira, GLPI, ServiceNow), decláralo: el contraste quedará sin demostrar en vez de juzgar un registro que nadie mantiene. «prefijo_referencia», si se declara, es el comienzo obligatorio del número de cada petición (por ejemplo «RFC-»).',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.1', 'op.exp.5.2', 'op.exp.5.4', 'op.exp.5.r1.3'],
      type: 'table',
      example: 'registro_tsv | /etc/ensfacil/change-register.tsv (mantenido por el RSI) | RFC-',
      columns: [
        {
          name: 'herramienta',
          label: 'Herramienta',
          type: 'select',
          options: ['registro_tsv', 'jira', 'glpi', 'servicenow', 'otro'],
          required: true,
        },
        {
          name: 'ubicacion',
          label: 'Ubicación y acceso',
          type: 'string',
          required: true,
        },
        {
          name: 'prefijo_referencia',
          label: 'Prefijo del número de referencia',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Es la pieza que hace posible el contraste. Cambio real sin petición aprobada que lo cubra → hallazgo.',
      ensfacilUsage:
        'EV-02 busca, para cada cambio real que observa el agente, una petición aprobada del registro cuya ventana lo cubra. La fuente es el registro TSV mantenido a mano, y el informe lo dice así.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede contrastar cambio real contra cambio autorizado: EV-02, EV-03, EV-04 y EV-06 quedan NO_EVALUABLE por configuración.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.5',
      name: 'campos_minimos_peticion_cambio',
      label: 'Campos mínimos de una petición de cambio',
      description:
        'Columnas del registro de peticiones que una petición autorizada tiene que traer rellenas para que quien la autoriza «no tenga dudas al respecto» (op.exp.5.2). Un valor por fila, con el nombre de la columna: peticion_id, fecha_registro, sistema, descripcion, riesgo, aprobado_por, fecha_aprobacion, ventana_inicio, ventana_fin, preproduccion, estado, documentacion, impacto_seguridad, referencia. En categoría ALTA se exige además impacto_seguridad aunque no se declare aquí (op.exp.5.r1.3).',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.2', 'op.exp.5.r1.3'],
      type: 'list',
      example: 'descripcion',
      required: true,
      wazuhUsage:
        'Petición autorizada con alguno de estos campos vacíos o «-» → hallazgo de información insuficiente para autorizar.',
      ensfacilUsage:
        'EV-03 revisa, fila a fila, las peticiones aprobadas, implantadas o revertidas del registro de la máquina.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la suficiencia de la información: op.exp.5.2 queda NO_EVALUABLE.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.5',
      name: 'criterios_cambio_riesgo_alto',
      label: 'Criterios de cambio de riesgo alto',
      description:
        'Criterios del análisis de riesgos que determinan cuándo un cambio es de riesgo ALTO y exige aprobación expresa y previa del Responsable de la Seguridad (op.exp.5.4). La clasificación de cada cambio la escribe quien gestiona la petición en la columna «riesgo» del registro; estos criterios son lo que esa clasificación aplica, y lo que el informe enseña al auditor.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.4'],
      type: 'list',
      example: 'cambio en el perímetro o en el cortafuegos',
      required: true,
      wazuhUsage:
        'Documental: ninguna primitiva compara un cambio con estos criterios. Sin ellos, la columna «riesgo» no se apoya en ningún análisis declarado.',
      ensfacilUsage:
        'EV-04 exige que estén declarados antes de juzgar la aprobación de los cambios de riesgo alto.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede identificar qué cambios exigían aprobación del RSI: op.exp.5.4 queda NO_EVALUABLE.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.5',
      name: 'responsable_seguridad',
      label: 'Responsable de la Seguridad',
      description:
        'Responsable de la Seguridad y la cuenta con la que aprueba las peticiones. La columna «cuenta» se compara literalmente con la columna «aprobado_por» del registro de peticiones.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.4'],
      type: 'table',
      example: 'A. Martínez | amartinez',
      columns: [
        {
          name: 'nombre',
          label: 'Nombre',
          type: 'string',
          required: false,
        },
        {
          name: 'cuenta',
          label: 'Cuenta con la que aprueba',
          type: 'identifier',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'Cambio de riesgo alto aprobado por otra cuenta, o aprobado después de implantarse → hallazgo.',
      ensfacilUsage:
        'EV-04 compara «aprobado_por» con esta columna y la fecha de aprobación con el primer cambio real que la petición cubre.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar que la aprobación de los cambios de riesgo alto venga del RSI: op.exp.5.4 queda NO_EVALUABLE.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.5',
      name: 'entorno_preproduccion',
      label: 'Entorno de preproducción',
      description:
        'Parejas de sistema de producción y sistema de preproducción, con la referencia que acredita que son equivalentes en los aspectos del cambio. Mismo esquema que P-06 de op.exp.4, a propósito: es la misma declaración.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.3'],
      type: 'table',
      example: 'srv-app01 | pre-app01 | informe de consistencia 2026-05',
      columns: [
        {
          name: 'sistema_prod',
          label: 'Sistema de producción',
          type: 'identifier',
          required: true,
        },
        {
          name: 'sistema_preprod',
          label: 'Sistema de preproducción',
          type: 'identifier',
          required: true,
        },
        {
          name: 'consistencia',
          label: 'Evidencia de equivalencia',
          type: 'string',
          required: false,
        },
      ],
      // No obligatorio A PROPÓSITO, como P-06 de op.exp.4: sin preproducción,
      // op.exp.5.3 ya sale sin demostrar por la policy, y la única forma de
      // «rellenarlo» sin tenerla sería inventarla.
      required: false,
      wazuhUsage:
        'Cambio en producción sin actividad previa equivalente en su preproducción → hallazgo.',
      ensfacilUsage:
        'EV-05 necesita los cambios de las DOS máquinas de la pareja. El motor evalúa cada máquina por separado, así que hoy la precedencia no se puede demostrar y op.exp.5.3 queda sin acreditar aunque la tabla esté rellena.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.5.3 no se puede demostrar.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.5',
      name: 'documentacion_configuracion',
      label: 'Documentación de configuración',
      description:
        'Documentos de configuración que se actualizan tras un cambio aceptado (diagramas de red, manuales, inventario), dónde viven y en cuántos días desde el fin de la ventana del cambio tienen que estar actualizados. «documento» es el nombre que la columna «documentacion» del registro de peticiones usa para pedir su actualización. Solo se puede comprobar un documento que sea un fichero de la máquina y que su recolector vigile (OPEXP5_DOCUMENTOS); uno en una CMDB o en un recurso de red se declara igual y sale sin demostrar.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.5'],
      type: 'table',
      example: 'inventario | /srv/doc/inventario-activos.ods | 7',
      columns: [
        {
          name: 'documento',
          label: 'Documento',
          type: 'identifier',
          required: true,
        },
        {
          name: 'ubicacion',
          label: 'Ubicación',
          type: 'string',
          required: true,
        },
        {
          name: 'plazo_dias',
          label: 'Plazo (días)',
          type: 'number',
          required: true,
        },
      ],
      minValue: 0,
      required: true,
      wazuhUsage:
        'Cambio implantado cuya documentación no se modifica dentro del plazo → hallazgo de op.exp.5.5.',
      ensfacilUsage:
        'EV-06 busca, para cada petición implantada que declare documentación, una modificación del fichero entre el inicio de su ventana y el fin de su ventana más el plazo.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la actualización de la documentación tras el cambio: EV-06 queda NO_EVALUABLE.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.5',
      name: 'canal_comunicacion_fallos',
      label: 'Canal de comunicación de fallos',
      description:
        'Vía por la que se comunican al responsable de seguridad los fallos de software y hardware (op.exp.5.r1.2) y a quién. Un canal que no deja huella observable en la máquina (un buzón, una cola atendida por personas) se declara igual, y la comunicación queda sin demostrar.',
      levels: ['ALTO'],
      requirements: ['op.exp.5.r1.2'],
      type: 'table',
      example: 'buzon | rsi@organizacion.es',
      columns: [
        {
          name: 'canal',
          label: 'Canal',
          type: 'select',
          options: ['cola_itsm', 'buzon', 'integracion_wazuh'],
          required: true,
        },
        {
          name: 'destino',
          label: 'Destino',
          type: 'string',
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Fallo detectado sin comunicación registrada por el canal → hallazgo.',
      ensfacilUsage:
        'EV-08 detecta los fallos (servicios caídos en la máquina); la comunicación no tiene hoy ningún hecho que la observe y queda sin demostrar.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.5.r1.2 no se puede demostrar en ALTO.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.5',
      name: 'mecanismo_reversion',
      label: 'Mecanismo de reversión',
      description:
        'Mecanismo previsto para revertir un cambio y ventana, en horas, en la que tiene que existir el punto de reversión ANTES del cambio. «sistema» es el nombre del agente o «*». Los mecanismos lvm, zfs y btrfs los observa el agente en la máquina; hipervisor y backup no dejan huella en ella y no se pueden demostrar con este control. Mismo esquema que P-07 de op.exp.4.',
      levels: ['ALTO'],
      requirements: ['op.exp.5.r1.1'],
      type: 'table',
      example: '* | lvm | snapshot previo al cambio | 24',
      columns: [
        {
          name: 'sistema',
          label: 'Sistema',
          type: 'identifier',
          required: true,
        },
        {
          name: 'mecanismo',
          label: 'Mecanismo',
          type: 'select',
          options: ['lvm', 'zfs', 'btrfs', 'hipervisor', 'backup'],
          required: true,
        },
        {
          name: 'evidencia',
          label: 'Evidencia',
          type: 'string',
          required: false,
        },
        {
          name: 'ventana_horas',
          label: 'Ventana previa (horas)',
          type: 'number',
          required: true,
        },
      ],
      minValue: 0,
      required: false,
      wazuhUsage:
        'Cambio sin punto de reversión en la ventana previa → hallazgo de R1.',
      ensfacilUsage:
        'EV-09 busca, para cada cambio real de configuración o de software, un punto de reversión del mecanismo declarado creado en las horas previas a su inicio. Es la lógica de EV-09 de op.exp.4.',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'R1 no se puede demostrar en ALTO: no se acredita la previsión de reversión de op.exp.5.r1.1.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.5',
      name: 'ventana_estabilidad_horas',
      label: 'Ventana de estabilidad tras un cambio (horas)',
      description:
        'Horas siguientes a un cambio real en las que un servicio que cae se atribuye a ese cambio. Si sigue caído en la última pasada del recolector y no consta la reversión del cambio en el registro (estado «revertida»), es un efecto adverso sostenido. No está en la plantilla del auditor: EV-07 la necesita para decidir qué es «la ventana posterior al cambio».',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.5', 'op.exp.5.r1.1'],
      type: 'duration_hours',
      example: '24',
      minValue: 1,
      required: false,
      wazuhUsage:
        'Servicio caído dentro de esta ventana tras un cambio, sin reversión registrada → hallazgo.',
      ensfacilUsage:
        'EV-07 sitúa el instante de caída de cada servicio que sigue caído respecto de los cambios reales observados.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'EV-07 queda NO_EVALUABLE: sin ventana no se puede atribuir un fallo a un cambio.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.5',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. En op.exp.5 todos los requisitos tienen evidencia técnica, así que hoy no se aplica a ninguno: queda disponible por coherencia con el resto de controles.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.5.3 | Procedimiento de pruebas en preproducción | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
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
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado.',
      ensfacilUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto en este control: ningún requisito de op.exp.5 es puramente documental.',
    },
  ],
};

