import { ENSControlConfiguration } from '../types';

// op.exp.9 · la política que decide el control. El recolector del manager
// emite hechos sin juzgar —las filas de los registros que mantiene la
// organización y lo que el manager conserva y observa— y el veredicto sale de
// correlacionarlos por incidente y contrastarlos con lo que aquí se decide.
//
// La ficha traía cuatro parámetros que eran tablas escritas como texto: P-02
// (tres fases con su contenido), P-03 (tipos de evidencia con su destino),
// P-06 (días por tipo de responsabilidad) y P-07 (qué severidad obliga a
// revisar y en qué plazo). Con un tipo plano el motor habría comparado la fila
// entera contra un valor suelto y no habría casado nunca. P-05 mezclaba tres
// conceptos en un campo y también pasa a tabla.
//
// P-08 no está en la ficha: es el contraste del registro VACÍO. Cero
// incidentes registrados solo se puede juzgar frente a lo que el manager vio.
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
        'Herramienta donde se registran los reportes iniciales, intermedios y finales de cada incidente. Normalmente coincide con el sistema de gestión de incidentes de op.exp.7, y conviene que sea el mismo para no duplicar registros. ENSFácil solo sabe leer su propio registro, /etc/ensfacil/incident-register.tsv en el manager, compartido con op.exp.7: con cualquier otra herramienta los requisitos quedan sin demostrar, porque no existe la integración.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.1'],
      type: 'select',
      options: [REGISTRO_ENSFACIL, 'Jira Service Management', 'TheHive', 'GLPI', 'Otro'],
      example: REGISTRO_ENSFACIL,
      required: true,
      wazuhUsage:
        'ENSFácil verifica que cada incidente cuenta con los tres tipos de reporte que exige op.exp.9.1 y que constan las actuaciones de emergencia y las modificaciones del sistema derivadas.',
      ensfacilUsage:
        'El recolector del manager lee el registro TSV en cada pasada y emite una fila por fase de cada incidente. Si P-01 declara otra herramienta, las evidencias de op.exp.9.1 salen sin demostrar diciendo que esa integración no existe.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.9.1 NO EVALUABLE. No se puede verificar la completitud del registro de la gestión.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.9',
      name: 'estructura_reportes_incidente',
      label: 'Estructura de los reportes de incidente',
      description:
        'Una fila por fase de reporte exigida (inicial, intermedio, final) con su contenido mínimo. La columna «exigible desde horas» permite no exigir una fase en incidentes breves: un reporte intermedio con 24 solo se exige a los incidentes que duran (o llevan abiertos) más de 24 horas. Vacía, la fase se exige siempre; el reporte final solo se exige cuando el incidente está cerrado, porque un incidente abierto todavía no puede tenerlo. El contenido mínimo es documental: ENSFácil comprueba la presencia de cada fase y que la fila trae severidad, sistemas y referencia al expediente, no el texto del reporte.',
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
        'ENSFácil verifica la presencia de los tres reportes por incidente y su cumplimentación. Incidente con solo reporte de cierre → hallazgo, porque el requisito distingue expresamente tres momentos.',
      ensfacilUsage:
        'EV-02 agrupa las filas del registro por incidente y exige una fila de cada fase declarada aquí, con la excepción de la duración y del reporte final de un incidente abierto.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar que existan los tres reportes exigidos ni su suficiencia.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.9',
      name: 'composicion_evidencia_jurisdiccional',
      label: 'Composición de la evidencia jurisdiccional',
      description:
        'Composición y detalle de las evidencias que deben recogerse para que puedan dirimirse en ámbito jurisdiccional, determinada con el asesoramiento legal especializado que op.exp.9.2 exige expresamente. Una fila por tipo de evidencia, con el destino de custodia donde debe depositarse. El tipo se compara con la columna «tipo_evidencia» del registro de custodia sin distinguir mayúsculas; el destino, si se declara, literalmente con su columna «destino».',
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
        'Define qué exporta y sella ENSFácil automáticamente al abrirse un incidente con potencial relevancia jurídica. La determinación de la lista NO es técnica: el ENS remite a asesoramiento legal especializado.',
      ensfacilUsage:
        'EV-05 exige, para cada incidente marcado con relevancia jurídica en el registro, una exportación sellada de cada tipo de evidencia de esta tabla.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.9.2 NO EVALUABLE. Riesgo real de que la evidencia recogida no sea admisible cuando haga falta.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.9',
      name: 'criterios_relevancia_juridica',
      label: 'Criterios de relevancia jurídica',
      description:
        'Criterios que determinan cuándo un incidente puede comportar acciones disciplinarias sobre personal interno, sobre proveedores externos o persecución de delitos, activando el régimen probatorio reforzado de op.exp.9.2. Son criterios cualitativos: los aplica la organización al marcar la columna «relevancia_juridica» del registro de incidentes, y ENSFácil exige que estén declarados para dar por buena esa marca.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.2'],
      type: 'list',
      example: 'acceso no autorizado por empleado, exfiltración, sabotaje, incumplimiento de proveedor',
      required: true,
      wazuhUsage:
        'ENSFácil marca automáticamente los incidentes que cumplen estos criterios y activa la recogida sellada de las evidencias de P-03, además de alertar de que el caso requiere tratamiento probatorio reforzado.',
      ensfacilUsage:
        'Sin criterios declarados, la marca de relevancia jurídica del registro no tiene contra qué haberse tomado y EV-05 y EV-06 quedan sin demostrar.',
      evidenceIds: ['EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se activa el régimen probatorio reforzado. La evidencia puede perderse antes de saber que se necesitaba.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.9',
      name: 'custodia_evidencias',
      label: 'Custodia de evidencias',
      description:
        'Repositorio de custodia de las evidencias, con su mecanismo de sellado de integridad y su control de acceso. Una fila por repositorio. La columna «destino» se compara literalmente con la del registro de custodia: una evidencia depositada en un destino que no figura aquí está fuera de custodia.',
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
        'ENSFácil deposita las exportaciones selladas y registra cada acceso posterior. El almacenamiento inmutable y el sellado de tiempo son los dos elementos que más refuerzan la admisibilidad.',
      ensfacilUsage:
        'EV-06 exige que toda evidencia sellada esté en un destino de esta tabla, que tenga registro de cadena de custodia y que su SHA-256 siga coincidiendo cuando el manager puede leerla.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'La evidencia queda sin cadena de custodia acreditable, lo que puede hacerla inservible en sede judicial.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.9',
      name: 'retencion_evidencias_dias',
      label: 'Retención de evidencias (días)',
      description:
        'Tiempo de conservación de las evidencias de incidentes según el tipo de responsabilidad —disciplinaria, contractual o penal—, fijado con el mismo asesoramiento legal de P-03 y no con la retención general de registros de op.exp.8. Una fila por tipo. Como el registro no dice qué responsabilidad acredita cada evidencia, ENSFácil aplica el plazo MÁS LARGO declarado: una evidencia que desaparece antes de él es una evidencia destruida.',
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
        'ENSFácil aplica la política de retención al repositorio de custodia. Es un parámetro que debe fijarse con el mismo asesoramiento legal de P-03: la retención general de op.exp.8 suele ser insuficiente aquí.',
      ensfacilUsage:
        'EV-06 da por destruida antes de plazo toda evidencia custodiada en el manager que ya no existe y cuya recogida es más reciente que el plazo más largo de esta tabla.',
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
        'Qué incidentes obligan a revisar la determinación de los eventos auditables y en qué plazo desde su cierre. Una fila por severidad del registro (baja, media, alta, critica); una severidad sin fila no obliga a revisar. Un incidente con varias filas tiene la severidad más alta registrada en cualquiera de sus fases, la misma regla que op.exp.7. La revisión se acredita con una fila «revision_eventos» del incidente en el registro de actuaciones o con un cambio de reglas, decodificadores, ossec.conf o agent.conf del manager dentro del plazo. La periodicidad consolidada (semestral, por ejemplo) es documental y va en la columna del procedimiento.',
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
        'ENSFácil correlaciona el cierre de incidentes con modificaciones posteriores en la lista de eventos auditables (P-01 de op.exp.8) y en las reglas de detección. Permite demostrar que el sistema aprende.',
      ensfacilUsage:
        'EV-08 toma cada incidente cerrado de una severidad de esta tabla y busca su revisión entre el reporte inicial y el cierre más el plazo.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.9.3 NO EVALUABLE. El registro de eventos auditables queda estático y no se realimenta.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.9',
      name: 'nivel_alerta_sin_expediente',
      label: 'Nivel de alerta que exige expediente',
      description:
        'Nivel mínimo de regla de Wazuh (7-15) a partir del cual una alerta ajena a ENSFácil no puede quedar sin ningún expediente. Solo se usa cuando el registro de incidentes está VACÍO: cero incidentes registrados con alertas de este nivel en los últimos 30 días es un incumplimiento medido, y sin ninguna es la constatación de que no había nada que registrar. Con incidentes registrados no se usa: decidir qué alerta es un incidente es op.exp.7.',
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
        'El recolector del manager cuenta, por nivel, las alertas de los últimos 30 días que no son de ENSFácil. Si el registro está vacío, EV-02 compara ese recuento con este nivel.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'Un registro vacío no se puede juzgar: sin un nivel declarado no hay contra qué contrastar la ausencia de incidentes.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.9',
      name: 'grupos_alerta_sin_expediente',
      label: 'Grupos de alerta que no exigen expediente',
      description:
        'Grupos de reglas de Wazuh cuyas alertas no son incidentes por sí mismas y no cuentan en el contraste de P-08, aunque su nivel lo supere. El caso típico es «vulnerability-detector»: una CVE publicada es trabajo de op.exp.4, no un incidente. Se compara literalmente con los grupos de cada regla; basta con que la regla tenga uno de ellos.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.9.1'],
      type: 'list',
      example: 'vulnerability-detector',
      required: false,
      wazuhUsage:
        'Contraste del registro vacío con el volumen de alertas del manager.',
      ensfacilUsage:
        'EV-02 descuenta del contraste de P-08 las reglas que llevan alguno de estos grupos. Todo grupo excluido se enseña en el motivo, para que el auditor vea qué se ha dejado fuera.',
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
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar los requisitos que ningún registro técnico puede demostrar.',
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
