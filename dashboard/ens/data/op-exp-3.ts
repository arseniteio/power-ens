import { ENSControl } from '../types';

export const opExp3Control: ENSControl = {
  id: 'op.exp.3',
  title: 'Gestión de la configuración de seguridad',
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
        'Pendiente de definir.',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'Pendiente de definir.',
    },
    alto: {
      status: 'PARCIAL',
      score: 91,
      condition:
        'Pendiente de definir. Sin evidencia tecnica en: op.exp.3.r1.1, por lo que el nivel no puede pasar de PARCIAL.',
    },
  },
  requirements: [
    {
      id: 'op.exp.3.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Funcionalidad mínima mantenida en el tiempo',
      description:
        'Se mantenga en todo momento la regla de «funcionalidad mínima» ([op.exp.2]).',
      evidences: ['EV-01', 'EV-04', 'EV-10'],
    },
    {
      id: 'op.exp.3.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Mínimo privilegio mantenido en el tiempo',
      description:
        'Se mantenga en todo momento la regla de «mínimo privilegio» ([op.exp.2]).',
      evidences: ['EV-01', 'EV-10'],
    },
    {
      id: 'op.exp.3.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Cambios previamente autorizados',
      description:
        'El sistema se adapte a las nuevas necesidades, previamente autorizadas. (Ver [op.acc.4]).',
      evidences: ['EV-05'],
    },
    {
      id: 'op.exp.3.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Reacción a vulnerabilidades notificadas',
      description:
        'El sistema reaccione a vulnerabilidades notificadas. (Ver [op.exp.4]).',
      evidences: ['EV-06'],
    },
    {
      id: 'op.exp.3.5',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Reacción a incidentes',
      description:
        'El sistema reaccione a incidentes. (Ver [op.exp.7]).',
      evidences: ['EV-07'],
    },
    {
      id: 'op.exp.3.6',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Solo personal autorizado edita la configuración',
      description:
        'La configuración de seguridad solamente podrá editarse por personal debidamente autorizado.',
      evidences: ['EV-02'],
    },
    {
      id: 'op.exp.3.r1.1',
      level: ['ALTO'],
      title: 'Línea base de configuración autorizada (R1)',
      description:
        'Existirán configuraciones hardware/software, autorizadas y mantenidas regularmente, para los servidores, elementos de red y estaciones de trabajo.',
      evidences: [],
      active: false,
    },
    {
      id: 'op.exp.3.r1.2',
      level: ['ALTO'],
      title: 'Verificación periódica frente a la línea base (R1)',
      description:
        'Se verificará periódicamente la configuración hardware/software del sistema para asegurar que no se han introducido ni instalado elementos no autorizados.',
      evidences: ['EV-03'],
      active: false,
    },
    {
      id: 'op.exp.3.r1.3',
      level: ['ALTO'],
      title: 'Lista de servicios autorizados (R1)',
      description:
        'Se mantendrá una lista de servicios autorizados para servidores y estaciones de trabajo.',
      evidences: ['EV-04'],
      active: false,
    },
    {
      id: 'op.exp.3.r2.1',
      level: ['ALTO'],
      title: 'Número muy limitado de administradores (R2)',
      description:
        'La configuración de seguridad del sistema operativo y aplicaciones, tanto de estaciones y servidores como de la electrónica de red del sistema, será responsabilidad de un número muy limitado de administradores del sistema.',
      evidences: ['EV-08'],
      active: false,
    },
    {
      id: 'op.exp.3.r3.1',
      level: ['ALTO'],
      title: 'Copias de configuración para reconstruir (R3)',
      description:
        'Se realizarán copias de seguridad de la configuración del sistema de forma que sea posible reconstruirlo en parte o en su totalidad tras un incidente.',
      evidences: ['EV-09'],
      active: false,
    },
    {
      id: 'op.exp.3.r4.1',
      level: [],
      title: 'Configuración por procedimiento de actualización (R4)',
      description:
        'Refuerzo R4 – Aplicación de la configuración: La configuración de seguridad del sistema operativo y de las aplicaciones se mantendrá actualizada a través de una aplicación o procedimiento manual que permita la instalación de las correspondientes modificaciones de versión y actualizaciones de seguridad oportunas.',
      evidences: [],
    },
    {
      id: 'op.exp.3.r5.1',
      level: [],
      title: 'Herramientas de estado de dispositivos de red (R5)',
      description:
        'Refuerzo R5 – Control del estado de seguridad de la configuración: Se dispondrá de herramientas que permitan conocer de forma periódica el estado de seguridad de la configuración de los dispositivos de red y, en el caso de que resulte deficiente, permitir su corrección.',
      evidences: ['EV-10'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.3.1', 'op.exp.3.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Mantenimiento en el tiempo de la línea base',
      description:
        'Ejecución periódica y sostenida de las políticas SCA, con seguimiento de la evolución del cumplimiento por activo. A diferencia de op.exp.2, aquí lo relevante no es el resultado puntual sino la SERIE: demuestra que la funcionalidad mínima y el mínimo privilegio se mantienen «en todo momento».',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.3.6'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ediciones de la configuración de seguridad y su autor',
      description:
        'Detección de toda modificación en los ficheros y rutas de P-04, capturando qué usuario realizó el cambio, con qué proceso y en qué momento. Es la evidencia directa de op.exp.3.6, que exige que solo edite la configuración personal debidamente autorizado.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'config_file_modified', 'config_file_modified_unauthorized'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.3.r1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Elementos no autorizados introducidos en el sistema',
      description:
        'Comparación periódica del inventario hardware/software de cada activo contra la línea base autorizada P-01. Detecta software instalado, hardware conectado o servicios añadidos que no estaban previstos. Es la verificación que exige op.exp.3.r1.2.',
      format: 'json_line',
      events: ['evidence_state', 'baseline_deviation_detected', 'baseline_verification_performed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.3.1', 'op.exp.3.r1.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Servicios en ejecución fuera de la lista autorizada',
      description:
        'Contraste continuo entre los servicios y procesos detectados en cada activo y la lista de servicios autorizados P-02. Cubre op.exp.3.r1.3 y, por remisión a op.exp.2, también op.exp.3.1 (mantenimiento de la funcionalidad mínima).',
      format: 'json_line',
      events: ['evidence_state', 'unauthorized_service_running'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.3.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cambios de configuración sin autorización previa',
      description:
        'Correlación entre los cambios de configuración detectados por FIM y su correspondiente autorización en el sistema de gestión de cambios (P-06). Un cambio sin ticket o solicitud asociada incumple op.exp.3.3, que exige que las nuevas necesidades estén «previamente autorizadas».',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'change_authorization_missing'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.3.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Reacción de la configuración ante vulnerabilidades notificadas',
      description:
        'Seguimiento de las vulnerabilidades detectadas en los activos y de si la configuración se ha ajustado para mitigarlas o si se ha aplicado la actualización correspondiente. op.exp.3.4 exige que el sistema «reaccione a vulnerabilidades notificadas», con remisión a op.exp.4.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'vulnerability_remediated', 'vulnerability_unremediated'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.3.5'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Reacción de la configuración ante incidentes',
      description:
        'Verificación de que, tras un incidente de seguridad registrado, se produjeron los cambios de configuración correspondientes para evitar su repetición. op.exp.3.5 exige que el sistema «reaccione a incidentes», con remisión a op.exp.7.',
      format: 'json_line',
      events: ['evidence_state', 'incident_config_reaction', 'incident_without_reaction'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.exp.3.r2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Concentración de la administración de la configuración (R2)',
      description:
        'Identificación de todas las cuentas que han editado efectivamente la configuración de seguridad en el período. En categoría ALTA, R2 exige que la responsabilidad recaiga en «un número muy limitado» de administradores: esta evidencia mide cuántos son en la práctica, no cuántos están autorizados.',
      format: 'fim_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.exp.3.r3.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Existencia y frescura de las copias de configuración (R3)',
      description:
        'Verificación de que se realizan copias de seguridad de la configuración del sistema con la periodicidad declarada en P-07 y de que están disponibles para una eventual reconstrucción. R3 es obligatorio en categoría ALTA.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'config_backup_created', 'config_backup_stale'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-10',
      requirement: ['op.exp.3.1', 'op.exp.3.2', 'op.exp.3.r5.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Regresiones del estado de seguridad de la configuración',
      description:
        'Identificación específica de checks que pasaron de conforme a no conforme entre dos evaluaciones sucesivas. Es el indicador más directo de que la gestión continua de la configuración está fallando, y cubre de facto el Refuerzo R5 aunque no sea exigible.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'sca_regression_detected'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'baseline_configuracion_autorizada',
      description:
        'Configuración hardware/software autorizada y documentada para cada tipo de activo: servidores, elementos de red y estaciones de trabajo. Es la referencia frente a la que se detecta cualquier desviación.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.1'],
      type: 'string',
      usage:
        'ENSFácil compara de forma continua el inventario de Syscollector y el resultado SCA contra esta línea base. Toda desviación no autorizada genera hallazgo. Es la pieza central de R1.',
      missingBehavior:
        'R1 NO EVALUABLE. Sin línea base autorizada no hay referencia con la que detectar elementos no autorizados.',
    },
    {
      id: 'P-02',
      name: 'lista_servicios_autorizados',
      description:
        'Relación de servicios permitidos en servidores y estaciones de trabajo, exigida expresamente por op.exp.3.r1.3. Puede coincidir con el P-02 de op.exp.2, pero aquí el énfasis está en su mantenimiento y verificación periódica, no en la configuración inicial.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.3', 'op.exp.3.1'],
      type: 'table',
      usage:
        'CDB list en Wazuh. Todo servicio no autorizado en ejecución es un hallazgo de R1 y también de op.exp.3.1.',
      missingBehavior:
        'op.exp.3.r1.3 NO EVALUABLE y op.exp.3.1 queda sin verificación de continuidad.',
    },
    {
      id: 'P-03',
      name: 'administradores_configuracion',
      description:
        'Personal autorizado para editar la configuración de seguridad. En categoría BÁSICA y MEDIA basta con identificarlos (op.exp.3.6). En categoría ALTA, R2 exige además que sean «un número muy limitado», por lo que debe fijarse el número máximo admitido.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.6', 'op.exp.3.r2.1'],
      type: 'list',
      usage:
        'CDB list en Wazuh. Cualquier cambio en ficheros de configuración de seguridad ejecutado por una cuenta fuera de la lista genera alerta.',
      missingBehavior:
        'op.exp.3.6 NO EVALUABLE. No se puede distinguir un cambio legítimo de uno no autorizado.',
    },
    {
      id: 'P-04',
      name: 'rutas_configuracion_seguridad',
      description:
        'Ficheros y rutas que contienen la configuración de seguridad del sistema y de las aplicaciones, que deben vigilarse con FIM para detectar toda edición.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.6', 'op.exp.3.1', 'op.exp.3.2'],
      type: 'path',
      usage:
        'Configuración del módulo FIM con whodata activado para capturar qué usuario realizó cada cambio. Es la evidencia directa de op.exp.3.6 y la base para detectar degradación de la configuración.',
      missingBehavior:
        'No se detectan ediciones de la configuración de seguridad. op.exp.3.6 sin verificación automática.',
    },
    {
      id: 'P-05',
      name: 'periodicidad_verificacion_config_dias',
      description:
        'Cada cuánto debe verificarse la configuración hardware/software para asegurar que no se han introducido elementos no autorizados (op.exp.3.r1.2). El ENS exige verificación «periódica» sin fijar plazo.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.2'],
      type: 'duration_days',
      usage:
        'Define el intervalo de la comparación formal contra la línea base P-01 que ENSFácil registra como verificación acreditada. Independientemente, SCA y Syscollector operan de forma continua.',
      missingBehavior:
        'No se puede acreditar la periodicidad de la verificación exigida por R1. Se aplica 30 días por defecto.',
    },
    {
      id: 'P-06',
      name: 'procedimiento_autorizacion_cambios',
      description:
        'Referencia al procedimiento de autorización previa de cambios de configuración, exigido por op.exp.3.3 con remisión expresa a op.acc.4. Debe permitir correlacionar un cambio detectado con su autorización.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.3'],
      type: 'string',
      usage:
        'Si hay integración con el sistema de tickets, ENSFácil correlaciona cada cambio detectado por FIM con su ticket de autorización. Cambio sin ticket asociado → hallazgo de cambio no autorizado.',
      missingBehavior:
        'Todo cambio detectado queda sin poder contrastarse contra su autorización. op.exp.3.3 solo documental.',
    },
    {
      id: 'P-07',
      name: 'config_backup_destino',
      description:
        'Destino, periodicidad y alcance de las copias de seguridad de la configuración del sistema, exigidas por R3 en categoría ALTA para permitir la reconstrucción tras un incidente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r3.1'],
      type: 'table',
      usage:
        'ENSFácil verifica la existencia y frescura de las copias mediante FIM sobre el destino o ingesta de los logs del proceso de respaldo. Ausencia o antigüedad excesiva → hallazgo de R3.',
      missingBehavior:
        'R3 NO EVALUABLE. No se puede acreditar la capacidad de reconstrucción tras incidente.',
    },
    {
      id: 'P-08',
      name: 'umbral_desviacion_baseline',
      description:
        'Grado de desviación respecto a la línea base P-01 que se considera aceptable antes de marcar el activo como no conforme. Permite absorber variaciones menores sin disparar hallazgos continuos.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.1', 'op.exp.3.r1.2'],
      type: 'number',
      usage:
        'Configura los cortes del semáforo por activo. Los elementos marcados como críticos en la línea base generan hallazgo con independencia del porcentaje global.',
      missingBehavior:
        'Se aplica tolerancia cero por defecto, lo que puede producir ruido excesivo en el informe.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la línea base de configuración aprobada y la capacidad real de reconstruir el sistema a partir de sus copias, que ningún evento puede demostrar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'config_file_modified', 'config_file_modified_unauthorized', 'baseline_deviation_detected', 'baseline_verification_performed', 'unauthorized_service_running', 'change_authorization_missing', 'vulnerability_remediated', 'vulnerability_unremediated', 'incident_config_reaction', 'incident_without_reaction', 'config_backup_created', 'config_backup_stale', 'sca_regression_detected'],
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
