import { ENSControl } from '../types';

export const opExp6Control: ENSControl = {
  id: 'op.exp.6',
  title: 'Protección frente a código dañino',
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
        'op.exp.6 → Requisitos base: op.exp.6.1 a op.exp.6.5',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.6 + R1 + R2 → Base + escaneo periódico + revisión de funciones críticas al arranque',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.exp.6 + R1 + R2 + R3 + R4 → Base + R1 + R2 + lista blanca de aplicaciones + EDR',
    },
  },
  requirements: [
    {
      id: 'op.exp.6.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Prevención y reacción frente a código dañino',
      description:
        'Se dispondrá de mecanismos de prevención y reacción frente a código dañino, incluyendo el correspondiente mantenimiento de acuerdo a las recomendaciones del fabricante.',
      evidences: ['EV-01', 'EV-04', 'EV-10', 'EV-11'],
    },
    {
      id: 'op.exp.6.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Antimalware instalado en todos los equipos',
      description:
        'Se instalará software de protección frente a código dañino en todos los equipos: puestos de usuario, servidores y elementos perimetrales.',
      evidences: ['EV-01'],
    },
    {
      id: 'op.exp.6.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Ficheros externos analizados antes de usarlos',
      description:
        'Todo fichero procedente de fuentes externas será analizado antes de trabajar con él.',
      evidences: ['EV-08', 'EV-12'],
    },
    {
      id: 'op.exp.6.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Bases de detección actualizadas',
      description:
        'Las bases de datos de detección de código dañino permanecerán permanentemente actualizadas.',
      evidences: ['EV-02'],
    },
    {
      id: 'op.exp.6.5',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Configuración adecuada y protección en tiempo real',
      description:
        'El software de detección de código dañino instalado en los puestos de usuario deberá estar configurado de forma adecuada e implementará protección en tiempo real de acuerdo a las recomendaciones del fabricante.',
      evidences: ['EV-03'],
    },
    {
      id: 'op.exp.6.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Escaneo periódico de todo el sistema (R1)',
      description:
        'Todo el sistema se escaneará regularmente para detectar código dañino.',
      evidences: ['EV-05'],
    },
    {
      id: 'op.exp.6.r2.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Funciones críticas analizadas al arranque (R2)',
      description:
        'Las funciones críticas se analizarán al arrancar el sistema en prevención de modificaciones no autorizadas.',
      evidences: ['EV-06'],
    },
    {
      id: 'op.exp.6.r3.1',
      level: ['ALTO'],
      title: 'Lista blanca de aplicaciones (R3)',
      description:
        'Solamente se podrán ejecutar aquellas aplicaciones previamente autorizadas. Se implementará una lista blanca para impedir la ejecución de aplicaciones no autorizadas.',
      evidences: ['EV-07'],
      active: false,
    },
    {
      id: 'op.exp.6.r4.1',
      level: ['ALTO'],
      title: 'Detección y respuesta en equipos, EDR (R4)',
      description:
        'Se emplearán herramientas de seguridad orientadas a detectar, investigar y resolver actividades sospechosas en puestos de usuario y servidores (EDR – Endpoint Detection and Response).',
      evidences: ['EV-08', 'EV-09', 'EV-10', 'EV-11'],
      active: false,
    },
    {
      id: 'op.exp.6.r5.1',
      level: [],
      title: 'Configuración avanzada del antimalware (R5)',
      description:
        'Refuerzo R5 – Configuración de la herramienta de detección de código dañino: El software de detección de código dañino permitirá realizar configuraciones avanzadas y revisar el sistema en el arranque y cada vez que se conecte un dispositivo extraíble.',
      evidences: ['EV-12'],
    },
    {
      id: 'op.exp.6.r5.2',
      level: [],
      title: 'Protección en tiempo real en servidores (R5)',
      description:
        'El software de detección de código dañino instalado en servidores y elementos perimetrales deberá estar configurado de forma adecuada e implementará protección en tiempo real de acuerdo a las recomendaciones del fabricante.',
      evidences: ['EV-03'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.6.1', 'op.exp.6.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Presencia y estado del antimalware en todos los equipos',
      description:
        'Verificación de que el producto declarado en P-01 está instalado y en ejecución en cada equipo de P-02, incluidos servidores y elementos perimetrales. op.exp.6.2 es taxativo en la exigencia de cobertura total, y los elementos perimetrales son el hueco más frecuente.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'antimalware_installed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.6.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Antigüedad de las bases de datos de detección',
      description:
        'Fecha de la última actualización de firmas en cada equipo, contrastada con el umbral P-03. op.exp.6.4 exige que permanezcan «permanentemente actualizadas», y esta es la comprobación que más hallazgos produce en la práctica.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'antimalware_signatures_updated'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.6.5', 'op.exp.6.r5.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Configuración adecuada y protección en tiempo real',
      description:
        'Verificación de que los ajustes de P-04 están activos en cada equipo: protección en tiempo real, protección contra manipulación, análisis de correo y descargas. Un antimalware con tiempo real desactivado está instalado pero no protege.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'antimalware_setting'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.6.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detecciones de código dañino y su resolución',
      description:
        'Registro de todas las detecciones del antimalware con el equipo afectado, el fichero o proceso, la amenaza identificada y la acción aplicada (limpiado, bloqueado, en cuarentena, fallido). Las detecciones con acción fallida son las que exigen intervención inmediata.',
      format: 'json_line',
      events: ['evidence_state', 'malware_detected'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.6.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ejecución del escaneo periódico completo (R1)',
      description:
        'Fecha del último escaneo completo por equipo, contrastada con la periodicidad P-06. R1 exige escaneo regular de todo el sistema y es obligatorio desde categoría MEDIA.',
      format: 'json_line',
      events: ['evidence_state', 'full_scan_completed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.6.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Integridad de funciones críticas al arranque (R2)',
      description:
        'Verificación de que los componentes críticos declarados en P-07 no han sido modificados sin autorización, comprobada al arrancar el sistema. Cubre R2, obligatorio desde categoría MEDIA.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'boot_integrity_check'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.6.r3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Efectividad de la lista blanca de aplicaciones (R3)',
      description:
        'Comprobación de que el mecanismo de lista blanca está activo y en modo aplicación —no solo auditoría—, y detección de ejecuciones de binarios no incluidos en P-08. R3 es obligatorio en categoría ALTA.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'execution_control_status', 'execution_observed'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-08',
      requirement: ['op.exp.6.3', 'op.exp.6.r4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Análisis reputacional de ficheros nuevos y modificados (R4)',
      description:
        'Consulta automática a VirusTotal del hash de cada fichero nuevo o modificado en rutas monitorizadas, aportando una segunda opinión independiente del antimalware local. Es una capacidad EDR que cubre R4.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'file_reputation_checked'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.exp.6.r4.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Detección por reglas de contenido en ficheros (R4)',
      description:
        'Escaneo del contenido de ficheros nuevos o modificados con reglas YARA, que detecta familias de malware, webshells y artefactos conocidos por patrones internos y no solo por hash. Complementa al antimalware y refuerza la capacidad EDR de R4.',
      format: 'json_line',
      events: ['evidence_state', 'content_rule_match'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-10',
      requirement: ['op.exp.6.1', 'op.exp.6.r4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Detección de actividad sospechosa en puestos y servidores (R4)',
      description:
        'Identificación de comportamientos asociados a código dañino aunque no haya fichero detectado: procesos ocultos, conexiones a dominios de mando y control, persistencia anómala, ejecución de scripts codificados, escalada de privilegios. Es el núcleo de lo que R4 pide a un EDR.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'suspicious_activity_detected'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-11',
      requirement: ['op.exp.6.1', 'op.exp.6.r4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Contención automática ante detección (R4)',
      description:
        'Ejecución de acciones de contención al detectar código dañino: aislamiento del equipo de la red, bloqueo de la IP de origen, detención del proceso, eliminación del fichero. Cubre la parte de «resolver» que R4 exige junto a detectar e investigar.',
      format: 'json_line',
      events: ['evidence_state', 'active_response_executed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-12',
      requirement: ['op.exp.6.3', 'op.exp.6.r5.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Análisis de ficheros de fuentes externas y dispositivos extraíbles',
      description:
        'Verificación de que los ficheros que entran por las vías declaradas en P-05 se analizan antes de su uso, y de que la conexión de dispositivos extraíbles va seguida de análisis o queda bloqueada según P-10.',
      format: 'json_line',
      events: ['evidence_state', 'external_file_scanned', 'removable_device_connected'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'producto_antimalware',
      description:
        'Solución de protección frente a código dañino desplegada, por tipo de equipo, con la ubicación de sus logs o su método de integración. Determina qué decodificador aplica Wazuh para interpretar su actividad.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.1', 'op.exp.6.2'],
      type: 'table',
      usage:
        'Es el parámetro que habilita todo el control. Wazuh ingiere y decodifica los eventos del producto declarado para verificar instalación, estado, firmas y detecciones. Cada fabricante requiere su propio decodificador.',
      missingBehavior:
        'Todo el control queda NO EVALUABLE. Wazuh no puede verificar un antimalware cuya existencia y logs desconoce.',
    },
    {
      id: 'P-02',
      name: 'cobertura_esperada_antimalware',
      description:
        'Relación de equipos que deben tener antimalware instalado, incluidos servidores y elementos perimetrales. op.exp.6.2 es taxativo: «en todos los equipos: puestos de usuario, servidores y elementos perimetrales».',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.2'],
      type: 'list',
      usage:
        'ENSFácil contrasta esta lista contra la presencia real del producto detectada por Syscollector y por los eventos del propio antimalware. Equipo sin protección → hallazgo. Los elementos perimetrales suelen ser el hueco.',
      missingBehavior:
        'No se puede verificar la cobertura completa. op.exp.6.2 solo acreditable parcialmente.',
    },
    {
      id: 'P-03',
      name: 'max_antiguedad_firmas_horas',
      description:
        'Antigüedad máxima admitida de las bases de datos de detección. op.exp.6.4 exige que permanezcan «permanentemente actualizadas», lo que en la práctica se traduce en un umbral que fija la organización.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.4'],
      type: 'duration_hours',
      usage:
        'ENSFácil extrae de los eventos del antimalware la fecha de la última actualización de firmas por equipo y alerta cuando supera P-03. Es una de las comprobaciones más productivas y de hallazgo más frecuente.',
      missingBehavior:
        'op.exp.6.4 NO EVALUABLE. Equipos con firmas obsoletas pasan desapercibidos.',
    },
    {
      id: 'P-04',
      name: 'config_proteccion_tiempo_real',
      description:
        'Valores de configuración que deben estar activos en el antimalware según las recomendaciones del fabricante: protección en tiempo real, análisis de correo, análisis de descargas, protección contra manipulación. op.exp.6.5 los exige en puestos de usuario.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.5', 'op.exp.6.r5.2'],
      type: 'list',
      usage:
        'SCA verifica estos ajustes en cada equipo. Protección en tiempo real desactivada es un hallazgo crítico: el antimalware está instalado pero no protege. Extender a servidores cubre además R5 aunque no sea exigible.',
      missingBehavior:
        'No se puede verificar la configuración adecuada ni la protección en tiempo real. op.exp.6.5 sin acreditar.',
    },
    {
      id: 'P-05',
      name: 'puntos_entrada_ficheros_externos',
      description:
        'Vías por las que entran ficheros de fuentes externas y que deben someterlos a análisis antes de trabajar con ellos: correo electrónico, descargas web, dispositivos extraíbles, transferencias SFTP, carpetas compartidas con terceros.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.3'],
      type: 'table',
      usage:
        'ENSFácil verifica que cada vía declarada cuenta con análisis efectivo, contrastando con los logs de la pasarela de correo, del proxy y con eventos de montaje de dispositivos extraíbles seguidos de análisis.',
      missingBehavior:
        'op.exp.6.3 NO EVALUABLE. No se puede acreditar que los ficheros externos se analizan antes de su uso.',
    },
    {
      id: 'P-06',
      name: 'periodicidad_escaneo_completo_dias',
      description:
        'Cada cuántos días debe ejecutarse un escaneo completo del sistema. R1 exige escaneo «regularmente» sin fijar periodicidad: la determina la organización. Obligatorio desde categoría MEDIA.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.6.r1.1'],
      type: 'duration_days',
      usage:
        'ENSFácil registra la fecha del último escaneo completo por equipo a partir de los eventos del antimalware y alerta cuando se supera P-06. Distinguir escaneo completo de escaneo rápido en la decodificación.',
      missingBehavior:
        'R1 NO EVALUABLE. No se puede acreditar la regularidad del escaneo exigida desde categoría MEDIA.',
    },
    {
      id: 'P-07',
      name: 'funciones_criticas_arranque',
      description:
        'Funciones, ficheros y componentes críticos que deben analizarse al arrancar el sistema en prevención de modificaciones no autorizadas, como exige R2. Típicamente: binarios del sistema, cargador de arranque, módulos del kernel, servicios de seguridad.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.6.r2.1'],
      type: 'path',
      usage:
        'FIM de Wazuh con verificación de hash al arranque del agente cubre esta exigencia de forma natural. Cualquier modificación no autorizada en estas rutas genera alerta. Complementar con rootcheck.',
      missingBehavior:
        'R2 NO EVALUABLE. Las modificaciones no autorizadas en funciones críticas no se detectan al arranque.',
    },
    {
      id: 'P-08',
      name: 'lista_blanca_aplicaciones',
      description:
        'Relación de aplicaciones cuya ejecución está autorizada. R3 exige implementar lista blanca para impedir la ejecución de aplicaciones no autorizadas. Obligatorio en categoría ALTA.',
      level: ['ALTO'],
      requirements: ['op.exp.6.r3.1'],
      type: 'table',
      usage:
        'Wazuh no es la herramienta de aplicación de lista blanca (eso corresponde a AppLocker, WDAC o equivalente), pero sí la VERIFICA: detecta ejecuciones de binarios fuera de P-08 y comprueba que el mecanismo de bloqueo está activo y en modo aplicación, no solo en auditoría.',
      missingBehavior:
        'R3 NO EVALUABLE. No se puede verificar ni la existencia ni la efectividad de la lista blanca.',
    },
    {
      id: 'P-09',
      name: 'integracion_edr',
      description:
        'Capacidades EDR desplegadas y su configuración: integración con VirusTotal, reglas YARA, Active Response, y alcance en puestos y servidores. R4 es obligatorio en categoría ALTA y Wazuh lo cubre de forma nativa.',
      level: ['ALTO'],
      requirements: ['op.exp.6.r4.1'],
      type: 'select',
      usage:
        'Determina qué módulos activa ENSFácil: integración VirusTotal sobre eventos FIM, escaneo YARA sobre ficheros nuevos, Active Response para contención. Es el refuerzo que Wazuh cubre con más ventaja competitiva.',
      missingBehavior:
        'R4 NO EVALUABLE y es obligatorio en categoría ALTA. Se pierde la mayor aportación de Wazuh a este control.',
    },
    {
      id: 'P-10',
      name: 'politica_dispositivos_extraibles',
      description:
        'Tratamiento de los dispositivos extraíbles: si están permitidos, y si lo están, exigencia de análisis al conectarlos. Corresponde a op.exp.6.3 y también a R5 (no obligatorio) en su exigencia de revisión al conectar dispositivo extraíble.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.6.3', 'op.exp.6.r5.1'],
      type: 'select',
      usage:
        'Wazuh detecta eventos de conexión de dispositivos extraíbles (EventID 6416 en Windows, udev en Linux) y verifica que va seguido de análisis, o que el bloqueo está efectivamente aplicado.',
      missingBehavior:
        'No se puede verificar el tratamiento de dispositivos extraíbles, que es una vía habitual de entrada de malware.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar los requisitos que ninguna medida técnica del equipo puede demostrar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'antimalware_installed', 'antimalware_signatures_updated', 'antimalware_setting', 'malware_detected', 'full_scan_completed', 'boot_integrity_check', 'execution_control_status', 'execution_observed', 'file_reputation_checked', 'content_rule_match', 'suspicious_activity_detected', 'active_response_executed', 'external_file_scanned', 'removable_device_connected'],
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
