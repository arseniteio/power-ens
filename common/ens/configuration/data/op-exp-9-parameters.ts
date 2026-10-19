import { ENSControlConfiguration } from '../types';

// op.exp.9 · the policy that decides the control. The manager collector emits facts without judging (rows of the
// registers the organization keeps and what the manager keeps and observes); the verdict comes from correlating
// them per incident and contrasting them with what is decided here.
// P-02, P-03, P-05, P-06 and P-07 were tables written as text and are tables now. P-08 is not in the sheet: it
// is the contrast of the EMPTY register, since zero registered incidents can only be judged against what the
// manager saw.
const REGISTRO_ENSFACIL = 'Registro ENSFácil (/etc/ensfacil/incident-register.tsv)';

const FASES = ['inicial', 'intermedio', 'final'];
const SEVERIDADES = ['baja', 'media', 'alta', 'critica'];

export const opExp9Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.9',
  controlName: 'Registro de la gestión de incidentes',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.9',
      name: 'sistema_registro_incidentes',
      label: 'Sistema de registro de incidentes',
      description:
        'Herramienta donde se registran los reportes inicial, intermedio y final de cada incidente, conveniente que sea la de op.exp.7. ENSFácil solo lee /etc/ensfacil/incident-register.tsv del manager, compartido con op.exp.7; con otra herramienta los requisitos quedan sin demostrar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.1'],
      type: 'select',
      options: [REGISTRO_ENSFACIL, 'Jira Service Management', 'TheHive', 'GLPI', 'Otro'],
      example: REGISTRO_ENSFACIL,
      required: true,
      wazuhUsage:
        'ENSFácil verifica que cada incidente tiene los tres tipos de reporte de op.exp.9.1 y que constan las actuaciones de emergencia y las modificaciones del sistema derivadas.',
      ensfacilUsage:
        'El recolector del manager lee el TSV en cada pasada y emite una fila por fase de cada incidente. Si P-01 declara otra herramienta, las evidencias de op.exp.9.1 salen sin demostrar indicando que esa integración no existe.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.9.1 NO EVALUABLE: no se verifica la completitud del registro de la gestión.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.9',
      name: 'estructura_reportes_incidente',
      label: 'Estructura de los reportes de incidente',
      description:
        'Una fila por fase de reporte exigida (inicial, intermedio, final) con su contenido mínimo; «Exigible desde horas» omite una fase en incidentes breves (un intermedio con 24 solo se exige a incidentes de más de 24 horas; vacía, siempre) y el final solo se exige con el incidente cerrado. ENSFácil comprueba la presencia de cada fase y que la fila traiga severidad, sistemas y referencia, no el texto.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.1'],
      type: 'table',
      example: 'intermedio | evolución, medidas adoptadas | 24',
      columns: [
        {
          name: 'fase',
          label: 'Fase',
          type: 'select',
          options: FASES,
          required: true,
        },
        {
          name: 'contenido_minimo',
          label: 'Contenido mínimo',
          type: 'string',
          required: false,
        },
        {
          name: 'exigible_desde_horas',
          label: 'Exigible desde (horas)',
          type: 'number',
          required: false,
        },
      ],
      minValue: 0,
      required: true,
      wazuhUsage:
        'ENSFácil verifica la presencia de los tres reportes por incidente y su cumplimentación. Un incidente con solo reporte de cierre es hallazgo.',
      ensfacilUsage:
        'EV-02 agrupa las filas del registro por incidente y exige una fila de cada fase declarada, salvo la excepción de duración y del final de un incidente abierto.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No se verifica que existan los tres reportes ni su suficiencia.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.9',
      name: 'composicion_evidencia_jurisdiccional',
      label: 'Composición de la evidencia jurisdiccional',
      description:
        'Evidencias que deben recogerse para poder dirimirse en ámbito jurisdiccional, determinadas con el asesoramiento legal que exige op.exp.9.2: una fila por tipo con su destino de custodia. El tipo se compara con «tipo_evidencia» del registro de custodia sin distinguir mayúsculas y el destino, si se declara, literalmente con «destino».',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.2'],
      type: 'table',
      example: 'logs sellados del período | repositorio-custodia',
      columns: [
        {
          name: 'tipo_evidencia',
          label: 'Tipo de evidencia',
          type: 'string',
          required: true,
        },
        {
          name: 'destino',
          label: 'Destino',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Define qué exporta y sella ENSFácil al abrirse un incidente con posible relevancia jurídica. La lista no es técnica: el ENS remite a asesoramiento legal.',
      ensfacilUsage:
        'EV-05 exige, por cada incidente con relevancia jurídica, una exportación sellada de cada tipo de evidencia de esta tabla.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.9.2 NO EVALUABLE: riesgo de que la evidencia recogida no sea admisible.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.9',
      name: 'criterios_relevancia_juridica',
      label: 'Criterios de relevancia jurídica',
      description:
        'Criterios que determinan cuándo un incidente puede comportar acciones disciplinarias sobre personal, sobre proveedores o persecución de delitos, activando el régimen probatorio reforzado de op.exp.9.2. Son cualitativos: la organización los aplica al marcar «relevancia_juridica» en el registro de incidentes.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.2'],
      type: 'list',
      example: 'acceso no autorizado por empleado, exfiltración, sabotaje, incumplimiento de proveedor',
      required: true,
      wazuhUsage:
        'ENSFácil marca los incidentes que cumplen estos criterios, activa la recogida sellada de las evidencias de P-03 y avisa de que requieren tratamiento probatorio reforzado.',
      ensfacilUsage:
        'Sin criterios declarados, la marca de relevancia jurídica no tiene base y EV-05 y EV-06 quedan sin demostrar.',
      evidenceIds: ['EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se activa el régimen probatorio reforzado: la evidencia puede perderse antes de saber que se necesitaba.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.9',
      name: 'custodia_evidencias',
      label: 'Custodia de evidencias',
      description:
        'Repositorio de custodia de las evidencias, con su sellado de integridad y control de acceso, una fila por repositorio. «destino» se compara literalmente con el del registro de custodia: una evidencia en un destino ausente de la tabla está fuera de custodia.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.2'],
      type: 'table',
      example: 'repositorio-custodia | SHA-256 + sellado de tiempo | solo Responsable de Seguridad',
      columns: [
        {
          name: 'destino',
          label: 'Destino',
          type: 'string',
          required: true,
        },
        {
          name: 'mecanismo_sellado',
          label: 'Mecanismo de sellado',
          type: 'string',
          required: false,
        },
        {
          name: 'control_acceso',
          label: 'Control de acceso',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil deposita las exportaciones selladas y registra cada acceso posterior. El almacenamiento inmutable y el sellado de tiempo son lo que más refuerza la admisibilidad.',
      ensfacilUsage:
        'EV-06 exige que toda evidencia sellada esté en un destino de esta tabla, con registro de cadena de custodia y con el SHA-256 coincidente cuando el manager pueda leerla.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'La evidencia queda sin cadena de custodia acreditable y puede resultar inservible en sede judicial.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.9',
      name: 'retencion_evidencias_dias',
      label: 'Retención de evidencias (días)',
      description:
        'Días de conservación de las evidencias según el tipo de responsabilidad (disciplinaria, contractual o penal), fijados con el asesoramiento legal de P-03 y no con la retención general de op.exp.8; una fila por tipo. Como el registro no indica qué responsabilidad acredita cada evidencia, se aplica el plazo MÁS LARGO.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.2'],
      type: 'table',
      example: 'disciplinaria | 1095',
      columns: [
        {
          name: 'tipo_responsabilidad',
          label: 'Tipo de responsabilidad',
          type: 'string',
          required: true,
        },
        {
          name: 'dias_retencion',
          label: 'Días de retención',
          type: 'number',
          required: false,
        },
      ],
      minValue: 0,
      required: true,
      wazuhUsage:
        'ENSFácil aplica la política de retención al repositorio de custodia. La retención general de op.exp.8 suele ser insuficiente aquí.',
      ensfacilUsage:
        'EV-06 da por destruida antes de plazo toda evidencia custodiada en el manager que ya no existe y se recogió hace menos que el plazo más largo de la tabla.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'Riesgo de destruir evidencia antes de que prescriba la responsabilidad que podría acreditar.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.9',
      name: 'procedimiento_revision_eventos_auditables',
      label: 'Revisión de eventos auditables tras un incidente',
      description:
        'Qué incidentes obligan a revisar los eventos auditables y en qué plazo desde su cierre, una fila por severidad (baja, media, alta, critica; sin fila no obliga), con la severidad más alta de cualquiera de sus fases. La revisión se acredita con una fila «revision_eventos» en el registro de actuaciones o con un cambio de reglas, decodificadores, ossec.conf o agent.conf del manager dentro del plazo; la periodicidad consolidada es documental.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.3', 'op.exp.8.r3.1'],
      type: 'table',
      example: 'alta | 30 | PRO-SEG-07 revisión tras incidente + revisión semestral',
      columns: [
        {
          name: 'severidad',
          label: 'Severidad',
          type: 'select',
          options: SEVERIDADES,
          required: true,
        },
        {
          name: 'plazo_dias',
          label: 'Plazo (días)',
          type: 'number',
          required: true,
        },
        {
          name: 'procedimiento',
          label: 'Procedimiento',
          type: 'string',
          required: false,
        },
      ],
      minValue: 0,
      required: true,
      wazuhUsage:
        'ENSFácil correlaciona el cierre de incidentes con modificaciones posteriores de la lista de eventos auditables (P-01 de op.exp.8) y de las reglas de detección.',
      ensfacilUsage:
        'EV-08 toma cada incidente cerrado de una severidad de la tabla y busca su revisión entre el reporte inicial y el cierre más el plazo.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.9.3 NO EVALUABLE: el registro de eventos auditables queda estático y sin realimentación.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.9',
      name: 'nivel_alerta_sin_expediente',
      label: 'Nivel de alerta que exige expediente',
      description:
        'Nivel mínimo de regla de Wazuh (7-15) desde el que una alerta ajena a ENSFácil no puede quedar sin expediente; solo se usa con el registro de incidentes VACÍO, donde cero incidentes con alertas de este nivel en 30 días es un incumplimiento medido. Decidir qué alerta es incidente es op.exp.7.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.1'],
      type: 'number',
      example: '12',
      minValue: 7,
      maxValue: 15,
      required: false,
      wazuhUsage:
        'Contraste del registro vacío con el volumen de alertas del manager.',
      ensfacilUsage:
        'El recolector del manager cuenta por nivel las alertas de los últimos 30 días que no son de ENSFácil. Con el registro vacío, EV-02 compara ese recuento con este nivel.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'Un registro vacío no se puede juzgar: sin nivel no hay contra qué contrastar la ausencia de incidentes.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.9',
      name: 'grupos_alerta_sin_expediente',
      label: 'Grupos de alerta que no exigen expediente',
      description:
        'Grupos de reglas de Wazuh cuyas alertas no son incidentes por sí mismas y no cuentan en el contraste de P-08 aunque superen su nivel (caso típico: «vulnerability-detector», trabajo de op.exp.4). Se comparan literalmente con los grupos de cada regla y basta uno.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.1'],
      type: 'list',
      example: 'vulnerability-detector',
      required: false,
      wazuhUsage:
        'Contraste del registro vacío con el volumen de alertas del manager.',
      ensfacilUsage:
        'EV-02 descuenta del contraste de P-08 las reglas con alguno de estos grupos. Todo grupo excluido se muestra en el motivo.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'Cuentan todas las alertas del nivel de P-08 o superior, incluidas las que no son incidentes.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.9',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos que acreditan un requisito que ninguna medida técnica puede demostrar, una fila por requisito con nombre del documento y enlace. Aquí acredita lo que ningún registro técnico demuestra.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.9.3 | Procedimiento de revisión de eventos auditables | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
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
      required: false,
      wazuhUsage:
        'Solo se aplica a requisitos sin evidencia técnica, por lo que nunca tapa una medida fallida. Se marca ATESTACION y se lee «acreditado documentalmente», no «cumple».',
      ensfacilUsage:
        'Solo se aplica a requisitos sin evidencia técnica, por lo que nunca tapa una medida fallida. Se marca ATESTACION y se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Los requisitos documentales quedan sin acreditar y cuentan en contra: lo que no se demuestra, no cumple.',
    },
  ],
};
