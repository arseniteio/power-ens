import { ENSControl } from '../types';

export const mpCom3Control: ENSControl = {
  id: 'mp.com.3',
  title: 'Protección de la integridad y de la autenticidad',
  framework: 'ENS',
  category: 'Protección de las comunicaciones',
  family: 'Medidas de protección',
  dimension: 'Integridad y Autenticidad',
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
        'mp.com.3 → Requisitos base: mp.com.3.1 + mp.com.3.2 + mp.com.3.3',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.com.3 + R1 + R2 → Base + VPN cifrada fuera del dominio + algoritmos autorizados por el CCN',
    },
    alto: {
      status: 'PARCIAL',
      score: 86,
      condition:
        'mp.com.3 + R1 + R2 + R3 + R4 → Base + R1 + R2 + dispositivos hardware + productos certificados Sin evidencia tecnica en: mp.com.3.r3.1, por lo que el nivel no puede pasar de PARCIAL.',
    },
  },
  requirements: [
    {
      id: 'mp.com.3.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Autenticidad del otro extremo antes de intercambiar información',
      description:
        'En comunicaciones con puntos exteriores al dominio propio de seguridad, se asegurará la autenticidad del otro extremo del canal de comunicación antes de intercambiar información. (Ver [op.acc.5]).',
      evidences: ['EV-01', 'EV-02', 'EV-10'],
    },
    {
      id: 'mp.com.3.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Prevención de ataques activos con activación del tratamiento del incidente',
      description:
        'Se prevendrán ataques activos garantizando que al ser detectados se activarán los procedimientos previstos de tratamiento del incidente. Se considerarán ataques activos: a) La alteración de la información en tránsito. b) La inyección de información espuria. c) El secuestro de la sesión por una tercera parte.',
      evidences: ['EV-04', 'EV-05', 'EV-06', 'EV-07'],
    },
    {
      id: 'mp.com.3.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Mecanismos de identificación y autenticación admitidos',
      description:
        'Se aceptará cualquier mecanismo de identificación y autenticación de los previstos en el ordenamiento jurídico y en la normativa de aplicación.',
      evidences: ['EV-09'],
    },
    {
      id: 'mp.com.3.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Redes privadas virtuales cifradas fuera del dominio propio',
      description:
        'Se emplearán redes privadas virtuales cifradas cuando la comunicación discurra por redes fuera del propio dominio de seguridad.',
      evidences: ['EV-08'],
    },
    {
      id: 'mp.com.3.r2.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Algoritmos y parámetros autorizados por el CCN',
      description:
        'Se emplearán algoritmos y parámetros autorizados por el CCN.',
      evidences: ['EV-02', 'EV-03', 'EV-10'],
    },
    {
      id: 'mp.com.3.r3.1',
      level: ['ALTO'],
      title: 'Dispositivos hardware para la red privada virtual',
      description:
        'Se recomienda emplear dispositivos hardware en el establecimiento y utilización de la red privada virtual.',
      evidences: [],
      active: false,
    },
    {
      id: 'mp.com.3.r4.1',
      level: ['ALTO'],
      title: 'Productos certificados conforme a op.pl.5',
      description:
        'Se emplearán productos certificados conforme a lo establecido en [op.pl.5].',
      evidences: ['EV-11'],
      active: false,
    },
    {
      id: 'mp.com.3.r5.1',
      level: [],
      title: 'Cifradores conformes con la guía CCN-STIC',
      description:
        'Refuerzo R5 – Cifradores: Se emplearán cifradores que cumplan con los requisitos establecidos en la guía CCN-STIC que sea de aplicación.',
      evidences: [],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.com.3.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Autenticación del extremo remoto previa al intercambio',
      description:
        'Verificación en los logs de cada canal de P-01 de que la autenticación mutua del otro extremo se completa ANTES de intercambiar información. mp.com.3.1 es expreso en el orden: autenticar y después intercambiar.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.com.3.1', 'mp.com.3.r2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Algoritmos y parámetros configurados (R2)',
      description:
        'Verificación de que los algoritmos, suites de cifrado, longitudes de clave y versiones de protocolo configurados en cada extremo figuran entre los autorizados por el CCN según P-02. Es el refuerzo con mejor cobertura automática del control.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.com.3.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Algoritmos efectivamente negociados en las comunicaciones',
      description:
        'Protocolo y suite realmente negociados en cada conexión, frente a los configurados como mínimo admisible. Un extremo puede declarar TLS 1.2 como mínimo y seguir aceptando conexiones inferiores por un error de configuración o por una excepción heredada.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.com.3.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de alteración de información en tránsito',
      description:
        'Identificación del primero de los tres ataques activos de mp.com.3.2: fallos de verificación de integridad, errores de MAC o de firma en los canales, discrepancias de suma de comprobación en transferencias, renegociaciones anómalas.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.com.3.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de inyección de información espuria',
      description:
        'Identificación del segundo ataque activo: recepción de información no originada por el extremo legítimo, mensajes con estructura o firma inválida, peticiones con origen suplantado, respuestas DNS o ARP incoherentes en los canales.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['mp.com.3.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de secuestro de sesión por tercera parte',
      description:
        'Identificación del tercer ataque activo: uso simultáneo o sucesivo de un mismo identificador de sesión desde orígenes distintos, cambio abrupto de dirección o de agente de usuario dentro de una sesión, reutilización de token tras su cierre.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['mp.com.3.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Activación del procedimiento de incidente ante ataque activo',
      description:
        'Verificación de que cada detección de ataque activo de EV-04 a EV-06 fue seguida de la apertura del incidente conforme a P-04. mp.com.3.2 no se satisface con detectar: exige garantizar que la detección activa los procedimientos previstos de tratamiento del incidente.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['mp.com.3.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cifrado efectivo de los canales fuera del dominio (R1)',
      description:
        'Verificación de que los canales de P-01 que discurren por redes ajenas al dominio de seguridad van por VPN cifrada conforme a P-06, y de que el túnel está efectivamente establecido y en uso cuando hay tráfico.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['mp.com.3.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Mecanismos de identificación aceptados y rechazados',
      description:
        'Verificación de que el servicio no rechaza mecanismos de identificación y autenticación previstos en el ordenamiento jurídico según P-05. mp.com.3.3 es un requisito de no exclusión: el incumplimiento consiste en rechazar un mecanismo legalmente válido.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-10',
      requirement: ['mp.com.3.1', 'mp.com.3.r2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Integridad de la configuración de los canales protegidos',
      description:
        'Vigilancia de los ficheros de configuración de los extremos de comunicación y de los túneles, para detectar cambios que degraden la protección: relajación de algoritmos, desactivación de verificación de certificado del par, ampliación de suites admitidas.',
      format: 'fim_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-11',
      requirement: ['mp.com.3.r4.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Vigencia de las certificaciones de producto (R4)',
      description:
        'Seguimiento de la vigencia de las certificaciones conforme a op.pl.5 declaradas en P-08, con alerta anticipada de vencimiento. No es verificación del documento: es control de su validez temporal.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'canales_exteriores_dominio',
      description:
        'Canales de comunicación con puntos exteriores al dominio propio de seguridad, con su contraparte, el mecanismo de autenticación mutua empleado y si discurren por redes ajenas al dominio.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.3.1', 'mp.com.3.r1.1'],
      type: 'table',
      usage:
        'Es el alcance del control.',
      missingBehavior:
        'El control es NO EVALUABLE. Sin inventario de canales no hay nada sobre lo que verificar la autenticidad del extremo.',
    },
    {
      id: 'P-02',
      name: 'algoritmos_parametros_ccn',
      description:
        'Algoritmos, suites de cifrado, longitudes de clave y versiones de protocolo autorizados por el CCN para la protección de integridad y autenticidad. R2 remite a la autorización del CCN, no al criterio propio.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.3.r2.1'],
      type: 'table',
      usage:
        'SCA verifica la configuración de cada extremo y el análisis de los protocolos negociados verifica el uso efectivo. Es el refuerzo con mejor cobertura automática del control y el que más hallazgos produce.',
      missingBehavior:
        'R2 NO EVALUABLE, siendo obligatorio desde nivel MEDIO. Riesgo de algoritmos obsoletos en uso sin detectar.',
    },
    {
      id: 'P-03',
      name: 'patrones_ataque_activo',
      description:
        'Traducción de los tres ataques activos que enumera mp.com.3.2 en indicadores detectables: alteración de información en tránsito, inyección de información espuria y secuestro de sesión por tercera parte.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.3.2'],
      type: 'table',
      usage:
        'Define las reglas de correlación que materializan el requisito. Sin esta traducción, mp.com.3.2 queda como declaración de intenciones: el ENS dice qué hay que prevenir, pero no cómo se detecta.',
      missingBehavior:
        'mp.com.3.2 NO EVALUABLE en su parte de detección, que es la que tiene cobertura técnica real.',
    },
    {
      id: 'P-04',
      name: 'procedimiento_incidente_ataque_activo',
      description:
        'Procedimiento de tratamiento del incidente que debe activarse al detectarse un ataque activo. mp.com.3.2 no pide solo detectar: exige garantizar que la detección ACTIVA el procedimiento previsto.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.3.2'],
      type: 'string',
      usage:
        'ENSFácil correlaciona cada detección de ataque activo con la apertura efectiva del incidente en el sistema de op.exp.7. Detección sin incidente asociado → incumplimiento de la segunda mitad del requisito.',
      missingBehavior:
        'No se puede acreditar que la detección activa el procedimiento. El requisito queda cumplido a medias.',
    },
    {
      id: 'P-05',
      name: 'mecanismos_identificacion_admitidos',
      description:
        'Mecanismos de identificación y autenticación admitidos de entre los previstos en el ordenamiento jurídico y la normativa de aplicación, que mp.com.3.3 obliga a aceptar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.3.3'],
      type: 'table',
      usage:
        'ENSFácil verifica en los logs que el servicio no rechaza mecanismos admitidos. Es un requisito de no exclusión: el incumplimiento consiste en rechazar un mecanismo legalmente válido, no en aceptar pocos.',
      missingBehavior:
        'mp.com.3.3 NO EVALUABLE. Puede estarse rechazando un mecanismo legalmente admisible sin saberlo.',
    },
    {
      id: 'P-06',
      name: 'vpn_canales_fuera_dominio',
      description:
        'Canales que discurren por redes fuera del dominio propio de seguridad y VPN cifrada empleada en cada uno, con su configuración. R1 lo exige desde nivel MEDIO.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.3.r1.1'],
      type: 'table',
      usage:
        'SCA verifica la configuración del concentrador y de los extremos. Los logs de la VPN permiten comprobar que los canales de P-01 que discurren por redes ajenas efectivamente van por túnel cifrado.',
      missingBehavior:
        'R1 NO EVALUABLE. No se puede verificar que la comunicación fuera del dominio va cifrada por VPN.',
    },
    {
      id: 'P-07',
      name: 'dispositivos_hardware_vpn',
      description:
        'Dispositivos hardware empleados en el establecimiento y utilización de la VPN, exigidos por R3 en nivel ALTO. Téngase en cuenta la tensión de redacción: el requisito dice «se recomienda», la tabla lo exige.',
      level: ['ALTO'],
      requirements: ['mp.com.3.r3.1'],
      type: 'table',
      usage:
        'Syscollector identifica el equipamiento cuando admite agente; en otro caso se declara.',
      missingBehavior:
        'R3 NO ACREDITADO en nivel ALTO. Conviene documentar el criterio adoptado sobre la tensión de redacción.',
    },
    {
      id: 'P-08',
      name: 'productos_certificados_op_pl_5',
      description:
        'Productos empleados en la protección de integridad y autenticidad con su certificación conforme a op.pl.5, referencia y vigencia. R4 es obligatorio en nivel ALTO y aquí, a diferencia de mp.eq.4 R1, no incorpora el matiz «cuando sea posible».',
      level: ['ALTO'],
      requirements: ['mp.com.3.r4.1'],
      type: 'table',
      usage:
        'Registro documental con control de vigencia y alerta anticipada. La conformidad con op.pl.5 es de certificación de producto y no observable desde Wazuh; lo que sí aporta es que no caduque sin que nadie lo advierta.',
      missingBehavior:
        'R4 NO ACREDITADO. A diferencia de otros refuerzos análogos, este no admite excepción por indisponibilidad.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el uso de dispositivos hardware en la red privada virtual, que ninguna medida técnica puede demostrar.',
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
