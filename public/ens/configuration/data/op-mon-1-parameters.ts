import { ENSControlConfiguration } from '../types';

// Parámetros de op.mon.1. Se rige por la categoría del sistema.
//
// Seis parámetros de la plantilla estaban mal tipados y se corrigen aquí,
// porque un parámetro tiene UN tipo y el motor compara contra ese tipo:
//
//   P-01  «Lista» con tres columnas (sistema | SO | criticidad): es una tabla.
//   P-02  «Booleano + solución»: un booleano no lleva el producto ni la
//         justificación que la propia plantilla pide si P-02 = no. Tabla
//         necesaria | producto | justificación.
//   P-03  «Inventario» no es un tipo del motor: tabla.
//   P-04  «Lista» con tres columnas, y la cabecera partida en dos líneas: tabla
//         situación | activo afectado | reglas.
//   P-05  la cabecera partida en dos líneas dejaba fuera «responsable».
//   P-06  «Lista» con tres columnas (regla | motivo | aprobó): tabla.
//   P-07  la cabecera partida dejaba fuera «reversión», y «acción» salía como
//         `acci_n`. Calcada de P-11 de op.exp.8.
//
// Y tres no están en la plantilla (spec 2026-10-09 §1.2): P-08 (antigüedad
// máxima del ruleset), P-09 (días sin detección) y P-10 (horas sin pasada de
// FIM o SCA). Ninguno tiene valor por defecto: sin él, su evidencia sale
// NO_EVALUABLE con causa CONFIGURATION.
//
// P-06 se juzga en R1 (EV-08, spec §1.3), no en el requisito base: sus niveles
// son los de R1.
//
// `required` solo en P-01, el que sostiene el control («GRIS: no evaluable por
// ausencia de P-01», dice la ficha). Los demás, si faltan, los nombra el juicio
// de su propia evidencia con causa CONFIGURATION.
export const opMon1Configuration: ENSControlConfiguration = {
  controlId: 'op.mon.1',
  controlName: 'Detección de intrusión',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.mon.1',
      name: 'alcance_deteccion_host',
      label: 'Alcance de la detección en host',
      description:
        'Sistemas que deben estar bajo detección de intrusiones basada en host, uno por fila. La columna sistema es el NOMBRE o el ID DEL AGENTE tal como lo ve Wazuh (el manager figura como el agente 000). Solo los sistemas reales: un agente de prueba o dado de baja que se declare aquí cuenta como un sistema sin cobertura.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'table',
      example: 'srv-web01 | Linux | alta',
      columns: [
        {
          name: 'sistema',
          label: 'Sistema (nombre o ID del agente)',
          type: 'identifier',
          required: true,
        },
        {
          name: 'so',
          label: 'Sistema operativo',
          type: 'string',
          required: false,
        },
        {
          name: 'criticidad',
          label: 'Criticidad',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Reglas 111203 (detection_coverage_observed) y 111204 (detection_activity_observed): cada 6 h el recolector del manager lee, por agente, su estado en global.db, sus pasadas de FIM, SCA e inventario y su última alerta en alerts.json.',
      ensfacilUsage:
        'EV-02 y EV-03 cruzan cada sistema con su agente por ID o por nombre exacto: sin agente, desconectado, sin pasada de FIM o SCA en P-10 horas o sin detecciones en P-09 días es un punto ciego del control. Los agentes registrados que no figuran aquí no cuentan.',
      evidenceIds: ['EV-02', 'EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede determinar si la cobertura de detección es suficiente: op.mon.1.1 queda sin evaluar. Bloquea el control: es obligatorio.',
    },
    {
      id: 'P-02',
      controlId: 'op.mon.1',
      name: 'necesidad_deteccion_red',
      label: 'Necesidad de detección en red',
      description:
        'Si el análisis de riesgos exige detección de intrusiones en red (NIDS) además de la detección en host. Wazuh es HIDS: si hace falta inspección de tráfico, se necesita un componente adicional (Suricata, Snort, Zeek) cuyos eventos Wazuh ingiere. Con «sí», una fila por producto; con «no», la referencia del análisis de riesgos que lo justifica.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'table',
      example: 'sí | Suricata | AR-2026 §4.2: segmento DMZ → syslog a Wazuh',
      columns: [
        {
          name: 'necesaria',
          label: '¿Hace falta detección en red?',
          type: 'select',
          options: ['sí', 'no'],
          required: true,
        },
        {
          name: 'producto',
          label: 'Producto',
          type: 'string',
          required: false,
        },
        {
          name: 'justificacion',
          label: 'Referencia al análisis de riesgos',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Regla 111206 (network_detection_observed): cada 6 h el recolector del manager informa de los NIDS cuyos eventos llegan (syslog remoto en ossec.conf o un fichero de alertas en agent.conf) y de su última alerta.',
      ensfacilUsage:
        'Con «sí», EV-05 exige que el manager ingiera eventos de cada producto declarado y que su última alerta sea más reciente que P-09. Con «no», EV-05 no aplica, siempre que conste la referencia al análisis de riesgos; sin ella queda sin evaluar (causa CONFIGURATION), porque un auditor la pedirá.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'EV-05 queda sin evaluar (causa CONFIGURATION) y con ella op.mon.1.1: no consta si la detección en red hace falta.',
    },
    {
      id: 'P-03',
      controlId: 'op.mon.1',
      name: 'conjuntos_reglas_activos',
      label: 'Conjuntos de reglas activos',
      description:
        'Conjuntos de reglas de detección que tienen que estar cargados en el manager. R1 exige que la detección sea «basada en reglas», y el inventario de reglas activas es su evidencia directa. El conjunto se nombra como lo informa ENSFácil: wazuh para el ruleset oficial y, para las reglas propias de etc/rules, el prefijo de sus ficheros (local, ensfacil…).',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r1.1'],
      type: 'table',
      example: 'wazuh | ruleset oficial de Wazuh | 4500',
      columns: [
        {
          name: 'conjunto',
          label: 'Conjunto (como lo informa ENSFácil)',
          type: 'identifier',
          required: true,
        },
        {
          name: 'origen',
          label: 'Origen',
          type: 'string',
          required: false,
        },
        {
          name: 'n_reglas',
          label: 'Nº de reglas',
          type: 'number',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Regla 111205 (ruleset_rules_loaded): cada 6 h el recolector del manager informa, por conjunto, de las reglas cargadas que pueden alertar.',
      ensfacilUsage:
        'EV-01, en R1: cada conjunto de P-03 tiene que estar cargado con al menos una regla. El número de reglas declarado es informativo.',
      evidenceIds: ['EV-01'],
      ruleIds: [],
      ifNotConfigured:
        'R1 queda sin evaluar (causa CONFIGURATION): no se puede acreditar qué detección basada en reglas se exige.',
    },
    {
      id: 'P-04',
      controlId: 'op.mon.1',
      name: 'situaciones_compromiso_analisis_riesgos',
      label: 'Situaciones de compromiso del análisis de riesgos',
      description:
        'Situaciones de compromiso de la seguridad identificadas en el análisis de riesgos, que el enunciado general del bloque op.mon señala como el criterio que determina qué se monitoriza, con las reglas que las detectan: solo ids sueltos o rangos (5710, 5712, 80700-80799). Una situación sin reglas se declara con «ninguna» y es un punto ciego; cualquier otro texto en esa columna (una fecha, una referencia) deja la situación sin evaluar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'table',
      example: 'acceso no autorizado por SSH | servidores Linux | 5710, 5712, 5720',
      columns: [
        {
          name: 'situacion',
          label: 'Situación de compromiso',
          type: 'string',
          required: true,
        },
        {
          name: 'activo_afectado',
          label: 'Activo afectado',
          type: 'string',
          required: false,
        },
        {
          name: 'reglas',
          label: 'Reglas que la detectan (ids o rangos)',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Regla 111205 (ruleset_rules_loaded): los ids de las reglas cargadas que pueden alertar, por conjunto y en rangos comprimidos.',
      ensfacilUsage:
        'EV-04: cada situación tiene que tener al menos una de sus reglas cargada en el manager. Una situación sin reglas, o con reglas que el manager no carga, es un punto ciego del control: un hallazgo defendible, pero un hallazgo.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la trazabilidad entre el análisis de riesgos y la detección: EV-04 queda sin evaluar (causa CONFIGURATION) y con ella op.mon.1.1.',
    },
    {
      id: 'P-05',
      controlId: 'op.mon.1',
      name: 'procedimientos_respuesta_alertas',
      label: 'Procedimientos de respuesta a las alertas',
      description:
        'Procedimientos documentados de respuesta a las alertas generadas por el sistema de detección, por tipo de alerta, con su responsable. R2 los exige en categoría ALTA y es un requisito documental, no tecnológico.',
      levels: ['ALTO'],
      requirements: ['op.mon.1.r2.1'],
      type: 'table',
      example: 'intrusión en servidor | PR-18 Respuesta a intrusión | Responsable de Seguridad',
      columns: [
        {
          name: 'tipo_alerta',
          label: 'Tipo de alerta',
          type: 'string',
          required: true,
        },
        {
          name: 'procedimiento',
          label: 'Procedimiento',
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
        'No lo usa ningún recolector: es una declaración de la organización.',
      ensfacilUsage:
        'Acredita R2 documentalmente («acreditado documentalmente», nunca «medido») si cada fila nombra su procedimiento y su responsable. Si no se declara, R2 puede acreditarse con P-ATT. La aplicación del procedimiento a cada alerta la mide op.exp.7.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'R2 queda sin acreditar en categoría ALTA, salvo que se declare en P-ATT: las alertas se generan pero no consta respuesta pautada.',
    },
    {
      id: 'P-06',
      controlId: 'op.mon.1',
      name: 'umbrales_falsos_positivos',
      label: 'Exclusiones y falsos positivos autorizados',
      description:
        'Reglas silenciadas y ficheros de reglas excluidos en el entorno del cliente, con su justificación y quién lo aprobó. La columna regla es el id de la regla reescrita a nivel 0 o el nombre del fichero excluido en ossec.conf. Un sistema de detección con exceso de ruido deja de ser operativo; uno con exclusiones sin constancia se degrada sin que nadie lo advierta.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r1.1'],
      type: 'table',
      example: '0215-policy_rules.xml | exclusión de fábrica de Wazuh | RSI',
      columns: [
        {
          name: 'regla',
          label: 'Regla o fichero',
          type: 'string',
          required: true,
        },
        {
          name: 'motivo',
          label: 'Motivo',
          type: 'string',
          required: false,
        },
        {
          name: 'aprobo',
          label: 'Aprobó',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Regla 111209 (rule_silenced): cada 6 h el recolector del manager barre los rule_exclude de ossec.conf y las reglas reescritas a nivel 0 en etc/rules.',
      ensfacilUsage:
        'EV-08, en R1: todo silenciamiento observado tiene que figurar aquí con motivo y aprobación. Uno que no figure, o que figure sin motivo o sin quién lo aprobó, es un incumplimiento de R1.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'Si el manager tiene algún silenciamiento, R1 queda sin evaluar (causa CONFIGURATION): no consta que esté justificado.',
    },
    {
      id: 'P-07',
      controlId: 'op.mon.1',
      name: 'acciones_respuesta_automatica',
      label: 'Acciones de respuesta automática',
      description:
        'Acciones de respuesta automática previstas y su alcance. Corresponde a R3, que no es obligatorio en ninguna categoría, pero su contenido coincide con el enunciado general del bloque op.mon (finalizar procesos, inhabilitar servicios, desconectar usuarios, bloquear cuentas). La columna acción es el nombre del comando de Active Response.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r3.1'],
      type: 'table',
      example: 'firewall-drop | fuerza bruta SSH (5763) | agente | 180 s',
      columns: [
        { name: 'accion', label: 'Acción (comando)', type: 'identifier', required: true },
        { name: 'disparador', label: 'Disparador', type: 'string', required: false },
        { name: 'alcance', label: 'Alcance', type: 'string', required: false },
        { name: 'reversion', label: 'Reversión', type: 'string', required: false },
      ],
      required: false,
      wazuhUsage:
        'Reglas 111207 (active_response_configured) y 111208 (active_response_executed): respuestas configuradas en ossec.conf y ejecutadas en la ventana.',
      ensfacilUsage:
        'EV-07 se INFORMA, sin veredicto: qué acciones de P-07 están configuradas y habilitadas y cuáles se han ejecutado a raíz de una alerta. Acredita la cobertura de hecho de R3 y del enunciado general del bloque.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'Se informa de las respuestas configuradas sin contrastarlas con lo previsto. R3 no cuenta en ninguna categoría.',
    },
    {
      id: 'P-08',
      controlId: 'op.mon.1',
      name: 'antiguedad_maxima_ruleset_dias',
      label: 'Antigüedad máxima del ruleset (días)',
      description:
        'Antigüedad máxima admitida del conjunto de reglas de detección que carga el manager, en días, contada desde la fecha del fichero de reglas más reciente del ruleset. Las reglas de detección envejecen igual que las firmas de un antivirus; la plantilla pide una alerta al superar un umbral de antigüedad sin un parámetro que lo declare.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.1.r1.1'],
      type: 'duration_days',
      example: '180',
      required: false,
      wazuhUsage:
        'Regla 111202 (ruleset_version_observed): cada 6 h el recolector del manager informa de la versión de Wazuh y de la fecha del fichero más reciente del ruleset.',
      ensfacilUsage:
        'EV-08, en R1: un ruleset más viejo que P-08 es un incumplimiento de R1.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'R1 queda sin evaluar (causa CONFIGURATION): no hay contra qué medir la vigencia del ruleset.',
    },
    {
      id: 'P-09',
      controlId: 'op.mon.1',
      name: 'dias_maximos_sin_deteccion',
      label: 'Días máximos sin detección',
      description:
        'Días que un sistema de P-01 conectado puede pasar sin producir ninguna detección antes de considerarse que la detección no funciona en él (reglas que no se aplican o ingesta que no llega). En Linux, PAM, dpkg y syscheck generan alertas a diario: 7 días es razonable. Vale también para la detección en red cuando P-02 la exige.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'duration_days',
      example: '7',
      required: false,
      wazuhUsage:
        'Reglas 111204 (detection_activity_observed) y 111206 (network_detection_observed): el instante de la última alerta propia de cada agente (sin las de ENSFácil) y de cada NIDS.',
      ensfacilUsage:
        'EV-03: un sistema de P-01 conectado que lleva más de P-09 días sin detecciones incumple op.mon.1.1. EV-05: igual para un NIDS que P-02 exige.',
      evidenceIds: ['EV-03', 'EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'op.mon.1.1 queda sin evaluar (causa CONFIGURATION): no se puede decidir si un sistema activo sin detecciones es un fallo de la detección.',
    },
    {
      id: 'P-10',
      controlId: 'op.mon.1',
      name: 'antiguedad_maxima_analisis_horas',
      label: 'Antigüedad máxima del análisis (horas)',
      description:
        'Horas que puede pasar un sistema de P-01 sin completar una pasada de FIM y de SCA antes de considerar que su módulo de análisis está deshabilitado. Se mide en el instante en que ENSFácil lee la base del agente, no al evaluar. Las pasadas de FIM y SCA son cada 12 h por defecto: el valor tiene que ser mayor que su frecuencia configurada (p. ej., 26 h para 12 h).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.1.1'],
      type: 'duration_hours',
      example: '26',
      required: false,
      wazuhUsage:
        'Regla 111203 (detection_coverage_observed): el fin de la última pasada de FIM y de SCA de cada agente, leído de su base en el manager.',
      ensfacilUsage:
        'EV-02: un sistema de P-01 sin pasada de FIM o de SCA en P-10 horas tiene el análisis deshabilitado e incumple op.mon.1.1.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'op.mon.1.1 queda sin evaluar (causa CONFIGURATION): no se puede afirmar que el análisis de los sistemas siga activo.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.mon.1',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía alternativa para acreditar los procedimientos de respuesta a las alertas (R2) cuando no se declaran en P-05.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.mon.1.r2.1 | PR-18 Respuesta a intrusión | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        { name: 'requisito', label: 'Requisito', type: 'string', required: true },
        { name: 'referencia', label: 'Referencia', type: 'string', required: false },
        { name: 'enlace', label: 'Enlace', type: 'string', required: false },
        { name: 'fecha', label: 'Fecha', type: 'string', required: false },
        { name: 'responsable', label: 'Responsable', type: 'string', required: false },
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
