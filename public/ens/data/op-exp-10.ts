import { ENSControl } from '../types';

export const opExp10Control: ENSControl = {
  id: 'op.exp.10',
  title: 'Protección de claves criptográficas',
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
        'op.exp.10 → Requisitos base: op.exp.10.1 + op.exp.10.2 + op.exp.10.3',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.10 + R1 → Base + algoritmos y parámetros autorizados por el CCN',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.10 + R1 → Ídem categoría MEDIA. No hay exigencia adicional en ALTA.',
    },
  },
  requirements: [
    {
      id: 'op.exp.10.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Claves protegidas durante todo su ciclo de vida',
      description:
        'Las claves criptográficas se protegerán durante todo su ciclo de vida: (1) generación, (2) transporte al punto de explotación, (3) custodia durante la explotación, (4) archivo posterior a su retirada de explotación activa y (5) destrucción final.',
      evidences: ['EV-01', 'EV-02', 'EV-07', 'EV-08'],
    },
    {
      id: 'op.exp.10.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Generación aislada de la explotación',
      description:
        'Los medios de generación estarán aislados de los medios de explotación.',
      evidences: ['EV-05'],
    },
    {
      id: 'op.exp.10.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Claves retiradas archivadas fuera de explotación',
      description:
        'Las claves retiradas de operación que deban ser archivadas, lo serán en medios aislados de los de explotación.',
      evidences: ['EV-06'],
    },
    {
      id: 'op.exp.10.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Algoritmos y parámetros autorizados por el CCN (R1)',
      description:
        'Se emplearán algoritmos y parámetros autorizados por el CCN.',
      evidences: ['EV-03', 'EV-04', 'EV-07'],
    },
    {
      id: 'op.exp.10.r2.1',
      level: [],
      title: 'Cifradores conformes a la guía CCN-STIC (R2)',
      description:
        'Refuerzo R2 – Protección avanzada de claves criptográficas: Se emplearán cifradores que cumplan con los requisitos establecidos en la guía CCN-STIC que sea de aplicación.',
      evidences: [],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.10.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Accesos y modificaciones del material criptográfico',
      description:
        'Detección de todo acceso, lectura, copia, modificación o eliminación de los ficheros de claves declarados en P-02, con identificación de la cuenta y el proceso responsables. Es la aportación más directa de Wazuh a la custodia de claves durante la explotación.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'key_material_accessed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.10.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Copia o exfiltración de claves privadas',
      description:
        'Detección de operaciones que sugieren copia de material criptográfico fuera de su ubicación autorizada: aparición de ficheros de clave en rutas no previstas, lectura por procesos anómalos, o transferencia posterior a la lectura.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'key_material_found'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.10.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Algoritmos y parámetros criptográficos configurados (R1)',
      description:
        'Verificación de que los algoritmos, longitudes de clave y parámetros configurados en cada servicio de P-04 figuran entre los autorizados por el CCN según P-03. Es la evidencia que cubre R1 con más solidez y la que produce hallazgos con más frecuencia.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'crypto_config_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.10.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Uso efectivo de protocolos y cifradores obsoletos',
      description:
        'Detección del uso real —no solo la configuración— de protocolos o cifradores no autorizados en las conexiones establecidas: TLS 1.0 o 1.1 negociado, suites de cifrado débiles, claves de longitud insuficiente en los certificados presentados.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'crypto_protocol_negotiated'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.10.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Aislamiento entre medios de generación y de explotación',
      description:
        'Verificación de que en los sistemas declarados como de explotación en P-05 no se realizan operaciones de generación de claves, y de que el aislamiento de red entre ambos medios es efectivo. op.exp.10.2 lo exige de forma taxativa.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'key_generation_tool_executed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.10.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Claves retiradas presentes en medios de explotación',
      description:
        'Detección de material criptográfico correspondiente a claves declaradas como retiradas en P-01 que permanece presente y accesible en los sistemas de explotación, en lugar de estar archivado en medios aislados como exige op.exp.10.3.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'retired_key_present'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.10.1', 'op.exp.10.r1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Vigencia de certificados y material criptográfico',
      description:
        'Inventario de los certificados instalados en los sistemas con su fecha de caducidad, algoritmo y longitud de clave, permitiendo anticipar la retirada de explotación que op.exp.10.1 contempla como cuarta fase del ciclo de vida.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'certificate_observed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.exp.10.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Integridad y protección del almacén de claves',
      description:
        'Vigilancia de los permisos de los ficheros de clave y de los directorios que los contienen, verificando que son restrictivos y que no se han relajado. Una clave privada con permisos de lectura para todos está materialmente desprotegida aunque nadie la haya leído todavía.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'key_file_permissions'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'inventario_claves_criptograficas',
      description:
        'Relación de claves y material criptográfico del sistema con su finalidad, ubicación, tipo de soporte (HSM, fichero, almacén del sistema operativo, tarjeta) y responsable de su custodia.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'table',
      usage:
        'Define qué debe vigilar Power ENS. Las claves en HSM quedan fuera del alcance de Wazuh, pero las que residen en disco son monitorizables con FIM. Es imprescindible saber cuáles son de cada tipo.',
      missingBehavior:
        'El control es NO EVALUABLE. Sin inventario de claves no hay nada que vigilar ni contra qué contrastar.',
    },
    {
      id: 'P-02',
      name: 'rutas_almacenes_claves',
      description:
        'Rutas de ficheros y directorios que contienen material criptográfico en los sistemas: claves privadas, almacenes de certificados, ficheros de configuración con secretos.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'path',
      usage:
        'Configura FIM con whodata sobre estas rutas. Permite detectar accesos, copias, modificaciones y eliminaciones de material criptográfico, que es la aportación más directa de Wazuh a este control.',
      missingBehavior:
        'No se detecta ningún acceso ni copia indebida de claves. Se pierde la principal evidencia disponible.',
    },
    {
      id: 'P-03',
      name: 'algoritmos_parametros_autorizados',
      description:
        'Algoritmos, longitudes de clave y parámetros autorizados por el CCN que deben emplearse. R1 lo exige desde categoría MEDIA y remite a la autorización del CCN, no al criterio propio de la organización.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.10.r1.1'],
      type: 'table',
      usage:
        'Es el parámetro que permite cubrir R1 con solidez. SCA verifica los algoritmos y cifradores configurados en cada servicio y los contrasta con esta lista. Algoritmo no autorizado o longitud insuficiente → hallazgo.',
      missingBehavior:
        'R1 NO EVALUABLE, siendo obligatorio desde categoría MEDIA. Es el refuerzo que Wazuh mejor podría cubrir.',
    },
    {
      id: 'P-04',
      name: 'servicios_criptograficos',
      description:
        'Servicios que emplean criptografía y cuya configuración debe verificarse: servidores web y de aplicaciones, VPN, SSH, servidores de correo, bases de datos con cifrado, túneles.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.10.r1.1'],
      type: 'table',
      usage:
        'Define el alcance de las comprobaciones SCA sobre configuración criptográfica y de los análisis de protocolos y cifradores negociados. Servicio no declarado queda sin verificar.',
      missingBehavior:
        'La verificación de R1 queda incompleta: servicios criptográficos fuera de alcance pueden usar algoritmos obsoletos.',
    },
    {
      id: 'P-05',
      name: 'separacion_generacion_explotacion',
      description:
        'Identificación de los medios de generación de claves y de los medios de explotación, acreditando que están aislados. op.exp.10.2 lo exige de forma taxativa y sin matices.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.2'],
      type: 'table',
      usage:
        'Power ENS verifica que no se detecta actividad de generación de claves en los sistemas declarados como de explotación, y que el aislamiento de red entre ambos medios es efectivo.',
      missingBehavior:
        'op.exp.10.2 NO EVALUABLE. No se puede acreditar el aislamiento que el requisito exige expresamente.',
    },
    {
      id: 'P-06',
      name: 'archivo_claves_retiradas',
      description:
        'Ubicación y medio donde se archivan las claves retiradas de explotación activa, acreditando que está aislado de los medios de explotación, como exige op.exp.10.3.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.3'],
      type: 'string',
      usage:
        'Power ENS verifica que las claves retiradas no permanecen accesibles en los sistemas de explotación, contrastando el inventario P-01 con la presencia real de material criptográfico en las rutas de P-02.',
      missingBehavior:
        'op.exp.10.3 NO EVALUABLE. Riesgo de que claves retiradas sigan accesibles en producción.',
    },
    {
      id: 'P-07',
      name: 'procedimiento_ciclo_vida_claves',
      description:
        'Procedimiento documentado que cubre las cinco fases del ciclo de vida que enumera op.exp.10.1: generación, transporte al punto de explotación, custodia durante la explotación, archivo posterior a la retirada y destrucción final.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'string',
      usage:
        'Referencia documental que Power ENS recoge en el informe indicando qué fases están cubiertas y qué fases son verificables automáticamente. Las fases de transporte y destrucción son casi siempre documentales.',
      missingBehavior:
        'op.exp.10.1 acreditable solo parcialmente. Las fases no monitorizables quedan sin soporte documental.',
    },
    {
      id: 'P-08',
      name: 'personal_autorizado_claves',
      description:
        'Personal autorizado a acceder al material criptográfico, por clave o grupo de claves. Es la referencia para juzgar si un acceso detectado por FIM es legítimo o constituye una incidencia.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'table',
      usage:
        'CDB list en Wazuh. Todo acceso a las rutas de P-02 por una cuenta fuera de esta lista genera alerta. Es la comprobación que produce hallazgos con más frecuencia en este control.',
      missingBehavior:
        'No se puede distinguir un acceso legítimo de uno indebido. La vigilancia FIM pierde casi todo su valor.',
    },
    {
      id: 'P-09',
      name: 'cifradores_ccn_stic',
      description:
        'Cifradores empleados y su conformidad con los requisitos de la guía CCN-STIC aplicable. Corresponde al Refuerzo R2, no obligatorio en ninguna categoría pero relevante en entornos que manejan información clasificada o especialmente sensible.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.r2.1'],
      type: 'table',
      usage:
        'Power ENS recoge la declaración de conformidad en el informe. La verificación de conformidad de un cifrador con una guía CCN-STIC es documental y de certificación de producto, no observable desde Wazuh.',
      missingBehavior:
        'R2 sin acreditar. No supone incumplimiento al no ser exigible en ninguna categoría.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar las fases del ciclo de vida de las claves que ocurren fuera de los sistemas vigilados (generación en HSM, transporte, destrucción).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'Power ENS lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'key_material_accessed', 'key_material_found', 'crypto_config_observed', 'crypto_protocol_negotiated', 'key_generation_tool_executed', 'retired_key_present', 'certificate_observed', 'key_file_permissions'],
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
