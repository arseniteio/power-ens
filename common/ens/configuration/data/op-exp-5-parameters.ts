import { ENSControlConfiguration } from '../types';

// op.exp.5 · the policy that decides the control. The agent emits the real changes and the request register as
// is; the verdict comes from contrasting them with what is decided here (`policies/op-exp-5.policy.ts`).
// Changes against the auditor's template, all because the original type could feed no judgment: P-01 is a table
// `herramienta | ubicacion | prefijo_referencia` (without an ITSM, requests live in each machine's TSV, and
// declaring another system leaves the contrast unproven); P-04 `nombre | cuenta`; P-06 `documento | ubicacion |
// plazo_dias`; P-07 `canal | destino`; P-08 uses the op.exp.4 P-07 schema (`sistema | mecanismo | evidencia |
// ventana_horas`), because without system and window "BEFORE the change" cannot be measured; P-09 is new (the
// window after a change for EV-07) and has no default value.
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
        'Dónde se registran las peticiones de cambio y con qué numeración: sin ITSM integrado, ENSFácil lee el TSV de cada máquina (/etc/ensfacil/change-register.tsv, herramienta «registro_tsv»), y si viven en otro sistema (Jira, GLPI, ServiceNow) se declara y el contraste queda sin demostrar. «prefijo_referencia», si se declara, es el comienzo obligatorio del número (por ejemplo «RFC-»).',
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
        'Hace posible el contraste. Cambio real sin petición aprobada que lo cubra: hallazgo.',
      ensfacilUsage:
        'EV-02 busca, para cada cambio real que observa el agente, una petición aprobada del registro cuya ventana lo cubra. La fuente es el TSV mantenido a mano y el informe lo indica.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se contrasta cambio real con cambio autorizado: EV-02, EV-03, EV-04 y EV-06 quedan NO_EVALUABLE por configuración.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.5',
      name: 'campos_minimos_peticion_cambio',
      label: 'Campos mínimos de una petición de cambio',
      description:
        'Columnas del registro que una petición autorizada debe traer rellenas para que quien la autoriza «no tenga dudas al respecto» (op.exp.5.2), un nombre de columna por fila: peticion_id, fecha_registro, sistema, descripcion, riesgo, aprobado_por, fecha_aprobacion, ventana_inicio, ventana_fin, preproduccion, estado, documentacion, impacto_seguridad, referencia. En ALTA se exige además impacto_seguridad aunque no se declare (op.exp.5.r1.3).',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.2', 'op.exp.5.r1.3'],
      type: 'list',
      example: 'descripcion',
      required: true,
      wazuhUsage:
        'Petición autorizada con alguno de estos campos vacío o «-»: hallazgo de información insuficiente.',
      ensfacilUsage:
        'EV-03 revisa, fila a fila, las peticiones aprobadas, implantadas o revertidas del registro de la máquina.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'No se verifica la suficiencia de la información: op.exp.5.2 queda NO_EVALUABLE.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.5',
      name: 'criterios_cambio_riesgo_alto',
      label: 'Criterios de cambio de riesgo alto',
      description:
        'Criterios del análisis de riesgos que determinan cuándo un cambio es de riesgo ALTO y exige aprobación expresa y previa del Responsable de la Seguridad (op.exp.5.4). Quien gestiona la petición escribe la clasificación en la columna «riesgo» del registro; estos criterios son lo que aplica y lo que el informe muestra al auditor.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.4'],
      type: 'list',
      example: 'cambio en el perímetro o en el cortafuegos',
      required: true,
      wazuhUsage:
        'Documental: ninguna primitiva compara un cambio con estos criterios. Sin ellos, «riesgo» no se apoya en ningún análisis declarado.',
      ensfacilUsage:
        'EV-04 exige que estén declarados antes de juzgar la aprobación de los cambios de riesgo alto.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'No se identifica qué cambios exigían aprobación del RSI: op.exp.5.4 queda NO_EVALUABLE.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.5',
      name: 'responsable_seguridad',
      label: 'Responsable de la Seguridad',
      description:
        'Responsable de la Seguridad y cuenta con la que aprueba las peticiones. La columna «cuenta» se compara literalmente con «aprobado_por» del registro.',
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
        'Cambio de riesgo alto aprobado por otra cuenta, o aprobado después de implantarse: hallazgo.',
      ensfacilUsage:
        'EV-04 compara «aprobado_por» con esta columna y la fecha de aprobación con el primer cambio real que cubre la petición.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'No se verifica que la aprobación de los cambios de riesgo alto venga del RSI: op.exp.5.4 queda NO_EVALUABLE.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.5',
      name: 'entorno_preproduccion',
      label: 'Entorno de preproducción',
      description:
        'Parejas de sistema de producción y de preproducción, con la referencia que acredita que son equivalentes en los aspectos del cambio. Mismo esquema que P-06 de op.exp.4: es la misma declaración.',
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
      // Not required ON PURPOSE, as P-06 of op.exp.4: without preproduction op.exp.5.3 already shows unproven in
      // the policy, and the only way to "fill" it would be to invent it.
      required: false,
      wazuhUsage:
        'Cambio en producción sin actividad previa equivalente en su preproducción: hallazgo.',
      ensfacilUsage:
        'EV-05 necesita los cambios de las DOS máquinas de la pareja. El motor evalúa cada máquina por separado, así que hoy la precedencia no se demuestra y op.exp.5.3 queda sin acreditar aunque la tabla esté rellena.',
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
        'Documentos de configuración que se actualizan tras un cambio aceptado (diagramas, manuales, inventario), dónde viven y en cuántos días desde el fin de la ventana; «documento» es el nombre que usa la columna «documentacion» del registro. Solo se comprueba un fichero de la máquina vigilado por su recolector (OPEXP5_DOCUMENTOS); uno en una CMDB o recurso de red se declara igual y queda sin demostrar.',
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
        'Cambio implantado cuya documentación no se modifica en plazo: hallazgo de op.exp.5.5.',
      ensfacilUsage:
        'EV-06 busca, para cada petición implantada que declare documentación, una modificación del fichero entre el inicio de su ventana y el fin más el plazo.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se verifica la actualización de la documentación tras el cambio: EV-06 queda NO_EVALUABLE.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.5',
      name: 'canal_comunicacion_fallos',
      label: 'Canal de comunicación de fallos',
      description:
        'Vía por la que se comunican al responsable de seguridad los fallos de software y hardware (op.exp.5.r1.2) y a quién. Un canal sin huella observable en la máquina (un buzón, una cola atendida por personas) se declara igual y la comunicación queda sin demostrar.',
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
        'Fallo detectado sin comunicación registrada por el canal: hallazgo.',
      ensfacilUsage:
        'EV-08 detecta los fallos (servicios caídos en la máquina); la comunicación no tiene hechos que la observen y queda sin demostrar.',
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
        'Mecanismo previsto para revertir un cambio y horas de ventana en que el punto de reversión debe existir ANTES del cambio; «sistema» es el nombre del agente o «*». Mismo esquema que P-07 de op.exp.4: el agente observa lvm, zfs y btrfs, no hipervisor ni backup.',
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
        'Cambio sin punto de reversión en la ventana previa: hallazgo de R1.',
      ensfacilUsage:
        'EV-09 busca, para cada cambio real de configuración o software, un punto de reversión del mecanismo declarado creado en las horas previas a su inicio (misma lógica que EV-09 de op.exp.4).',
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
        'Horas siguientes a un cambio real en las que la caída de un servicio se atribuye a ese cambio; si sigue caído en la última pasada y el registro no marca el cambio como «revertida», es un efecto adverso sostenido. EV-07 la usa como «ventana posterior al cambio».',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.5', 'op.exp.5.r1.1'],
      type: 'duration_hours',
      example: '24',
      minValue: 1,
      required: false,
      wazuhUsage:
        'Servicio caído dentro de esta ventana tras un cambio, sin reversión registrada: hallazgo.',
      ensfacilUsage:
        'EV-07 sitúa el instante de caída de cada servicio que sigue caído respecto de los cambios reales observados.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'EV-07 queda NO_EVALUABLE: sin ventana no se atribuye un fallo a un cambio.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.5',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos que acreditan un requisito que ninguna medida técnica puede demostrar. En op.exp.5 todos los requisitos tienen evidencia técnica, así que hoy no se aplica a ninguno; queda por coherencia con los demás controles.',
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
        'Solo se aplica a requisitos sin evidencia técnica, por lo que nunca tapa una medida fallida.',
      ensfacilUsage:
        'Solo se aplica a requisitos sin evidencia técnica. Se marca ATESTACION y se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto: ningún requisito de op.exp.5 es solo documental.',
    },
  ],
};

