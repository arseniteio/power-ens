import { ENSControl } from '../types';

export const mpEq4Control: ENSControl = {
  id: 'mp.eq.4',
  title: 'Otros dispositivos conectados a la red',
  framework: 'ENS',
  category: 'Protección de los equipos',
  family: 'Medidas de protección',
  dimension: 'Confidencialidad (ÚNICA dimensión)',
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
        'mp.eq.4 → Requisitos base: mp.eq.4.1 + mp.eq.4.2',
    },
    medio: {
      status: 'PARCIAL',
      score: 67,
      condition:
        'mp.eq.4 + R1 → Base + productos o servicios conformes a op.pl.5, cuando sea posible Sin evidencia tecnica en: mp.eq.4.r1.1, por lo que el nivel no puede pasar de PARCIAL.',
    },
    alto: {
      status: 'PARCIAL',
      score: 67,
      condition:
        'mp.eq.4 + R1 → Ídem nivel MEDIO. No hay exigencia adicional en ALTO. Sin evidencia tecnica en: mp.eq.4.r1.1, por lo que el nivel no puede pasar de PARCIAL.',
    },
  },
  requirements: [
    {
      id: 'mp.eq.4.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Configuración segura y flujos de entrada y salida controlados',
      description:
        'Los dispositivos presentes en el sistema deberán contar con una configuración de seguridad adecuada de manera que se garantice el control del flujo definido de entrada y salida de la información.',
      evidences: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-07'],
    },
    {
      id: 'mp.eq.4.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Borrado del almacenamiento de los dispositivos de red',
      description:
        'Los dispositivos presentes en la red que dispongan de algún tipo de almacenamiento temporal o permanente de información proporcionarán la funcionalidad necesaria para eliminar información de soportes de información. (Ver [mp.si.5]).',
      evidences: ['EV-04', 'EV-08'],
    },
    {
      id: 'mp.eq.4.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Productos o servicios conformes con op.pl.5',
      description:
        'Se usarán, cuando sea posible, productos o servicios que cumplan lo establecido en [op.pl.5].',
      evidences: [],
    },
    {
      id: 'mp.eq.4.r2.1',
      level: [],
      title: 'Control de los dispositivos conectados a la red',
      description:
        'Refuerzo R2 – Control de dispositivos conectados a la red: Se dispondrá de soluciones que permitan visualizar los dispositivos presentes en la red, controlar su conexión/desconexión a la misma y verificar su configuración de seguridad.',
      evidences: ['EV-01', 'EV-06'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.eq.4.1', 'mp.eq.4.r2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Descubrimiento de dispositivos presentes en la red',
      description:
        'Identificación de los dispositivos conectados a partir de las fuentes de P-03: concesiones DHCP, tablas de direcciones de la electrónica de red, autenticaciones 802.1X. Es la única vía de ver dispositivos que no admiten agente, y cubre de facto la primera parte del Refuerzo R2.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.eq.4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Dispositivos no inventariados conectados a la red',
      description:
        'Contraste entre los dispositivos descubiertos en EV-01 y el inventario declarado en P-01. Un dispositivo conectado que no consta en el inventario no tiene configuración de seguridad verificada ni flujo de información definido, lo que vulnera mp.eq.4.1 en términos materiales.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.eq.4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Flujos de información de los dispositivos frente a lo autorizado',
      description:
        'Verificación de que los flujos de entrada y salida observados para cada dispositivo se ajustan a lo definido en P-02. Es la vía realista de verificar mp.eq.4.1 cuando no hay agente: no se evalúa la configuración del dispositivo, se evalúa su comportamiento en la red.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.eq.4.1', 'mp.eq.4.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Registros propios del dispositivo por syslog o SNMP',
      description:
        'Ingesta de los eventos que el propio dispositivo genera cuando lo permite según P-04: accesos al panel de administración, cambios de configuración, trabajos procesados, errores. Es la única evidencia desde dentro del dispositivo que se puede obtener sin agente.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.eq.4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Accesos al panel de administración de los dispositivos',
      description:
        'Detección de accesos a las interfaces de administración de los dispositivos, con origen y resultado. Un panel de multifunción con credenciales por defecto accesible desde la red de usuarios es un hallazgo frecuente y de impacto real, porque desde ahí se accede a los documentos almacenados.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['mp.eq.4.r2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Conexión y desconexión de dispositivos a la red (R2)',
      description:
        'Registro de los eventos de conexión y desconexión y de los intentos bloqueados por el mecanismo de control de P-08: autenticaciones 802.1X, violaciones de port security, decisiones del NAC. Cubre la segunda parte de R2, no obligatorio pero es lo que permite reaccionar en el momento.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['mp.eq.4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Dispositivos de invitados y BYOD en segmento no previsto',
      description:
        'Verificación de que los dispositivos no corporativos están en el segmento que les corresponde según P-06 y no alcanzan recursos internos. El ámbito del control incluye expresamente los dispositivos de invitados y los personales de los empleados.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['mp.eq.4.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ejecución del borrado del almacenamiento del dispositivo',
      description:
        'Cuando el dispositivo lo registre, constancia de la ejecución de la función de eliminación de información de su almacenamiento conforme a P-05. mp.eq.4.2 exige que el dispositivo proporcione esa funcionalidad; que se use es lo que da sentido al requisito.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'inventario_dispositivos_red',
      description:
        'Relación de dispositivos del ámbito del control —multifunción, multimedia, IoT, BYOD y otros— con su tipo, dirección, ubicación, responsable y si pueden acceder a información del sistema.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.4.1'],
      type: 'table',
      usage:
        'Es el alcance del control. Comparte contenido con op.exp.1 P-02 (activos sin agente) y conviene gestionarlo de forma unificada.',
      missingBehavior:
        'El control es NO EVALUABLE. Sin inventario no hay nada contra lo que contrastar lo que aparece en la red.',
    },
    {
      id: 'P-02',
      name: 'flujos_permitidos_por_tipo',
      description:
        'Flujos de entrada y salida de información autorizados para cada tipo de dispositivo. mp.eq.4.1 exige una configuración que «garantice el control del flujo definido de entrada y salida de la información», lo que presupone que ese flujo está definido.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.4.1'],
      type: 'table',
      usage:
        'ENSFácil verifica en los logs de cortafuegos y de la electrónica de red que los flujos observados se ajustan a esta definición. Flujo no previsto —una impresora hablando con internet— → hallazgo. Es la vía realista de verificar mp.eq.4.1 sin agente en el dispositivo.',
      missingBehavior:
        'mp.eq.4.1 NO EVALUABLE. No se puede juzgar si un flujo observado está autorizado o no.',
    },
    {
      id: 'P-03',
      name: 'fuentes_descubrimiento_red',
      description:
        'Fuentes de las que ENSFácil obtiene la presencia de dispositivos en la red: servidor DHCP, tablas de la electrónica de red, autenticación 802.1X, NAC si existe, barridos de descubrimiento.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.4.1', 'mp.eq.4.r2.1'],
      type: 'table',
      usage:
        'Sin agente en el dispositivo, estas fuentes son la única forma de saber qué hay conectado. Cubren además de facto la primera parte de R2 (visualizar los dispositivos presentes en la red), no exigible pero alcanzable.',
      missingBehavior:
        'No hay descubrimiento de dispositivos. El inventario queda sin verificación y las altas no previstas pasan inadvertidas.',
    },
    {
      id: 'P-04',
      name: 'dispositivos_con_syslog_snmp',
      description:
        'Dispositivos que permiten enviar registros por syslog o consultarse por SNMP, con su configuración. Es la única vía de obtener evidencia propia del dispositivo cuando no admite agente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.4.1'],
      type: 'table',
      usage:
        'Activa la ingesta en Wazuh con el decodificador correspondiente. Permite ver accesos al panel de administración del dispositivo, trabajos procesados, cambios de configuración y errores. Muchas multifunción corporativas lo soportan y casi nadie lo aprovecha.',
      missingBehavior:
        'Los dispositivos quedan sin trazabilidad propia. Solo se les ve desde la red, no desde dentro.',
    },
    {
      id: 'P-05',
      name: 'politica_borrado_almacenamiento',
      description:
        'Procedimiento de eliminación de la información almacenada en los dispositivos que disponen de almacenamiento temporal o permanente, y cómo se activa. mp.eq.4.2 exige que el dispositivo proporcione esa funcionalidad, con remisión expresa a mp.si.5.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.4.2'],
      type: 'table',
      usage:
        'ENSFácil registra la capacidad declarada y, cuando el dispositivo envíe logs (P-04), puede verificar la ejecución del borrado. La disponibilidad de la funcionalidad es una característica del producto y se acredita documentalmente.',
      missingBehavior:
        'mp.eq.4.2 NO ACREDITADO. Riesgo real: discos de multifunción retirados con documentos recuperables.',
    },
    {
      id: 'P-06',
      name: 'politica_byod',
      description:
        'Tratamiento de los dispositivos de invitados y personales de empleados: si se admiten, en qué segmento, con qué acceso y bajo qué condiciones. El apartado d) del ámbito los incluye expresamente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.4.1'],
      type: 'select',
      usage:
        'ENSFácil verifica que los dispositivos no corporativos detectados están en el segmento previsto y no alcanzan recursos internos. Enlaza directamente con mp.com.4 (separación de flujos).',
      missingBehavior:
        'No se puede distinguir un dispositivo de invitado legítimo de una conexión no autorizada a la red interna.',
    },
    {
      id: 'P-07',
      name: 'productos_certificados',
      description:
        'Dispositivos adquiridos que cumplen lo establecido en op.pl.5, con su referencia de certificación, y justificación documentada en los casos en que no fue posible. R1 incorpora el matiz «cuando sea posible», de modo que la justificación de indisponibilidad es parte del cumplimiento.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.eq.4.r1.1'],
      type: 'table',
      usage:
        'Registro documental en ENSFácil con control de vigencia. La conformidad con op.pl.5 es de certificación de producto y no observable desde Wazuh. Lo que sí aporta valor es registrar y conservar la justificación cuando no fue posible, porque el refuerzo la admite expresamente.',
      missingBehavior:
        'R1 NO ACREDITADO. Ni la certificación ni la justificación de su ausencia constan.',
    },
    {
      id: 'P-08',
      name: 'control_conexion_desconexion',
      description:
        'Mecanismo de control de la conexión y desconexión de dispositivos a la red: 802.1X, port security, NAC, o control manual de puertos. Corresponde a la segunda parte de R2, no obligatorio pero es lo que hace verificable el requisito base.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.4.r2.1'],
      type: 'select',
      usage:
        'ENSFácil ingiere los eventos de autenticación de red y de violación de port security, lo que permite detectar la conexión de dispositivos no autorizados en el momento en que ocurre y no en la siguiente revisión de inventario.',
      missingBehavior:
        'R2 sin cubrir. Un dispositivo no autorizado puede conectarse a la red sin que nada lo impida ni lo registre.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el uso de productos conformes con op.pl.5, que ninguna medida técnica puede demostrar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot'],
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
