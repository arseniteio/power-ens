import { ENSControl } from '../types';

export const opMon3Control: ENSControl = {
  id: 'op.mon.3',
  title: 'Vigilancia',
  framework: 'ENS',
  category: 'Monitorización del sistema',
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
        'op.mon.3 → Requisito base: op.mon.3.1',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.mon.3 + R1 + R2 → Base + correlación de eventos + análisis dinámico de superficie de exposición',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.mon.3 + R1 + R2 + R3 + R4 + R5 + R6 → Base + los SEIS refuerzos de forma acumulativa. R3.1 y R4 se acreditan documentalmente (P-ATT); R3.2, R4 y R6.3 exigen componentes externos (sonda de red, servicio de cibervigilancia y pruebas de penetración).',
    },
  },
  requirements: [
    {
      id: 'op.mon.3.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Recolección automática de eventos de seguridad',
      description:
        'Se dispondrá de un sistema automático de recolección de eventos de seguridad.',
      evidences: ['EV-01', 'EV-02'],
    },
    {
      id: 'op.mon.3.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Correlación de eventos (R1)',
      description:
        'Se dispondrá de un sistema automático de recolección de eventos de seguridad que permita la correlación de los mismos.',
      evidences: ['EV-03'],
    },
    {
      id: 'op.mon.3.r2.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Superficie de exposición: vulnerabilidades y configuración (R2)',
      description:
        'Se dispondrá de soluciones de vigilancia que permitan determinar la superficie de exposición con relación a vulnerabilidades y deficiencias de configuración.',
      evidences: ['EV-04'],
    },
    {
      id: 'op.mon.3.r3.1',
      level: ['ALTO'],
      title: 'Amenazas avanzadas y comportamientos anómalos (R3)',
      description:
        'Se dispondrá de sistemas para detección de amenazas avanzadas y comportamientos anómalos.',
      evidences: [],
      active: false,
    },
    {
      id: 'op.mon.3.r3.2',
      level: ['ALTO'],
      title: 'APT por anomalías en el tráfico de red (R3)',
      description:
        'Se dispondrá de sistemas para la detección de amenazas persistentes avanzadas (Advanced Persistent Threat, APT) mediante la detección de anomalías significativas en el tráfico de la red.',
      evidences: ['EV-06'],
      active: false,
    },
    {
      id: 'op.mon.3.r4.1',
      level: ['ALTO'],
      title: 'Observatorios digitales (R4)',
      description:
        'Se dispondrá de observatorios digitales con fines de cibervigilancia dedicados a la detección y seguimiento de anomalías que pudieran representar indicadores de amenaza en contenidos digitales.',
      evidences: [],
      active: false,
    },
    {
      id: 'op.mon.3.r5.1',
      level: ['ALTO'],
      title: 'Limitación y vigilancia de consultas (R5)',
      description:
        'Limitación de las consultas, monitorizando volumen y frecuencia.',
      evidences: ['EV-08'],
      active: false,
    },
    {
      id: 'op.mon.3.r5.2',
      level: ['ALTO'],
      title: 'Alerta en tiempo real a los administradores (R5)',
      description:
        'Alerta a los administradores de seguridad de comportamientos sospechosos en tiempo real.',
      evidences: ['EV-09'],
      active: false,
    },
    {
      id: 'op.mon.3.r6.1',
      level: ['ALTO'],
      title: 'Inspección: verificación de configuración (R6)',
      description:
        'Verificación de configuración.',
      evidences: ['EV-10', 'EV-12'],
      active: false,
    },
    {
      id: 'op.mon.3.r6.2',
      level: ['ALTO'],
      title: 'Inspección: análisis de vulnerabilidades (R6)',
      description:
        'Análisis de vulnerabilidades.',
      evidences: ['EV-11', 'EV-12'],
      active: false,
    },
    {
      id: 'op.mon.3.r6.3',
      level: ['ALTO'],
      title: 'Inspección: pruebas de penetración (R6)',
      description:
        'Pruebas de penetración.',
      evidences: ['EV-12'],
      active: false,
    },
    {
      id: 'op.mon.3.r7.1',
      level: [],
      title: 'Interconexiones: control de flujos por metadatos (R7)',
      description:
        'Refuerzo R7 – Interconexiones: En las interconexiones que lo requieran se aplicarán controles en los flujos de intercambio de información a través del uso de metadatos.',
      evidences: [],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.mon.3.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Sistema automático de recolección de eventos de seguridad',
      description:
        'El sistema central de recolección en marcha y recibiendo: estado del servicio wazuh-manager, contadores del motor de análisis (eventos recibidos, procesados y descartados) cuya serie entre pasadas horarias prueba que recolecta y que no pierde eventos, conexiones de <remote> (secure y syslog, con su puerto) y agentes registrados y activos en global.db.',
      format: 'json_line',
      events: ['evidence_state', 'event_collection_status'],
      wazuhRuleIds: ['111401'],
    },
    {
      id: 'EV-02',
      requirement: ['op.mon.3.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cobertura y continuidad de la recolección',
      description:
        'Por cada fuente que lee el logcollector de cada máquina (wazuh-logcollector.state): eventos, bytes y descartes desde el arranque y en el último periodo, y el último instante en que su contador creció; por cada agente, su conexión y su cola de envío (wazuh-agentd.state); y por cada emisor syslog que recibe el manager, su última alerta. Se contrasta con P-01: una fuente declarada que no se lee, que descarta eventos o que lleva más de max_horas_sin_eventos sin uno nuevo es un punto ciego de la vigilancia.',
      format: 'json_line',
      events: ['evidence_state', 'log_source_observed', 'agent_forwarding_observed', 'syslog_source_observed'],
      wazuhRuleIds: ['111402', '111403', '111404'],
    },
    {
      id: 'EV-03',
      requirement: ['op.mon.3.r1.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Capacidad de correlación de eventos (R1)',
      description:
        'Por conjunto de reglas cargado en el manager: reglas, reglas que correlacionan (frequency y timeframe, o if_matched_sid / if_matched_group, con nivel efectivo de 1 o más) y técnicas MITRE ATT&CK que cubren. Y las alertas producidas por correlación en el periodo, por regla y día. Se contrasta con los conjuntos de P-02: R1 exige que se correlacione, no solo que se recolecte.',
      format: 'json_line',
      events: ['evidence_state', 'correlation_rules_inventory', 'correlation_alert_observed'],
      wazuhRuleIds: ['111405', '111406'],
    },
    {
      id: 'EV-04',
      requirement: ['op.mon.3.r2.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Superficie de exposición: vulnerabilidades y configuración (R2)',
      description:
        'Por cada activo de P-03, de su base en el manager (queue/db/NNN.db): el fin de su última pasada SCA por política, con aprobados, fallos y puntuación, y la fecha de su inventario de paquetes, del que se alimenta el detector de vulnerabilidades. Del detector: habilitado en ossec.conf, fecha de su fuente (queue/vd/feed) y errores del conector del indexer al escribir el estado de vulnerabilidades en las últimas 24 h (ossec.log). Un detector que no consigue escribir no determina nada. El recuento de CVE por activo no es local: se informa como «sin medir».',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'config_assessment_observed', 'package_inventory_observed', 'vulnerability_detection_status'],
      wazuhRuleIds: ['111407', '111408', '111409'],
    },
    {
      id: 'EV-05',
      requirement: ['op.mon.3.r3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Detección de comportamientos anómalos (R3.1)',
      description:
        'Línea base de comportamiento de P-04 (indicadores, normalidad y umbral de anomalía). Wazuh no calcula líneas base ni hace UEBA: las anomalías son reglas que alguien escribe sobre esos indicadores. Dato del informe, sin veredicto: R3.1 se acredita documentalmente (P-ATT).',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-06',
      requirement: ['op.mon.3.r3.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Detección de APT por anomalías en el tráfico de red (R3.2)',
      description:
        'Sistemas de detección en red (Suricata, Snort, Zeek) cuyos eventos ingiere el manager, por dónde llegan y su última alerta. Wazuh correlaciona esa detección pero no la genera: sin sonda de red, R3.2 no se cumple.',
      format: 'json_line',
      events: ['evidence_state', 'network_detection_observed'],
      wazuhRuleIds: ['111410'],
      active: false,
    },
    {
      id: 'EV-07',
      requirement: ['op.mon.3.r4.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Incorporación de indicadores de cibervigilancia (R4)',
      description:
        'Listas CDB que carga el manager (<list> de ossec.conf): entradas, fecha de actualización y reglas que las usan, que es donde acaban los indicadores de un servicio de cibervigilancia. Dato del informe, sin veredicto: R4 exige disponer del observatorio, que se acredita documentalmente (P-ATT).',
      format: 'json_line',
      events: ['evidence_state', 'ioc_list_observed'],
      wazuhRuleIds: ['111411'],
      active: false,
    },
    {
      id: 'EV-08',
      requirement: ['op.mon.3.r5.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Detección de intentos de minería de datos (R5.1)',
      description:
        'Ids de las reglas de umbral cargadas en el manager (con frequency y que pueden alertar) y sus alertas en el periodo. Se contrasta con P-07: cada consulta declarada tiene que estar vigilada por una regla de umbral. Requiere que la base de datos o la aplicación registren las consultas, no solo las conexiones.',
      format: 'json_line',
      events: ['evidence_state', 'query_volume_rules_observed'],
      wazuhRuleIds: ['111412', '111406'],
      active: false,
    },
    {
      id: 'EV-09',
      requirement: ['op.mon.3.r5.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Alerta en tiempo real a los administradores de seguridad (R5.2)',
      description:
        'Canales de notificación del manager: el correo (email_notification, nivel mínimo y número de destinatarios) y cada <integration> de ossec.conf (nombre, nivel, grupos y errores de envío en integrations.log en 24 h). Nunca su hook_url ni su api_key. Se contrasta con P-08. La latencia alerta → aviso no es medible: Wazuh no anota los envíos correctos.',
      format: 'json_line',
      events: ['evidence_state', 'notification_channel_configured'],
      wazuhRuleIds: ['111413'],
      active: false,
    },
    {
      id: 'EV-10',
      requirement: ['op.mon.3.r6.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Inspección: verificación de configuración (R6.1)',
      description:
        'Verificación continua de la configuración con SCA en los activos de P-03 (los hechos de EV-04, contra P-11), o la última verificación del registro de inspecciones dentro de la periodicidad de P-09. La continuidad supera la exigencia de periodicidad.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'config_assessment_observed'],
      wazuhRuleIds: ['111407'],
      active: false,
    },
    {
      id: 'EV-11',
      requirement: ['op.mon.3.r6.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Inspección: análisis de vulnerabilidades (R6.2)',
      description:
        'Análisis continuo de vulnerabilidades: el detector habilitado, con su fuente al día y escribiendo sin errores, sobre el inventario reciente de cada activo de P-03 (los hechos de EV-04, contra P-11), o el último análisis del registro de inspecciones dentro de la periodicidad de P-09.',
      format: 'json_line',
      events: ['evidence_state', 'package_inventory_observed', 'vulnerability_detection_status'],
      wazuhRuleIds: ['111408', '111409'],
      active: false,
    },
    {
      id: 'EV-12',
      requirement: ['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Registro y seguimiento de las inspecciones de seguridad (R6)',
      description:
        'Filas del registro de inspecciones del manager (/etc/ensfacil/security-inspection-register.tsv): fecha, tipo (verificación de configuración, análisis de vulnerabilidades o prueba de penetración), alcance, ejecutor, hallazgos, estado de su remediación, motivo (periódica o tras incidente) e incidente. La última de cada tipo se contrasta con la periodicidad de P-09.',
      format: 'json_line',
      events: ['evidence_state', 'security_inspection_recorded'],
      wazuhRuleIds: ['111414'],
      active: false,
    },
    {
      id: 'EV-13',
      requirement: ['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Inspecciones desencadenadas por incidentes',
      description:
        'Incidentes del periodo del registro de incidentes del manager y las inspecciones del registro de inspecciones que los citan (motivo «post_incidente»). Dato del informe, sin veredicto: el registro de incidentes no dice qué incidentes revelaron vulnerabilidades nuevas o subestimadas, que son los que R6 obliga a inspeccionar.',
      format: 'json_line',
      events: ['evidence_state', 'incident_registered'],
      wazuhRuleIds: ['111415'],
      active: false,
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'fuentes_eventos_seguridad',
      description:
        'Fuentes de eventos de seguridad que alimentan la recolección, una por fila. Con método «agente», sistema es el NOMBRE o el ID del agente que la lee (el manager es el 000) y ubicación es la ruta o el nombre exacto del localfile tal como lo declara Wazuh (/var/log/auth.log, journald; admite * y ?). Con método «syslog», sistema es la IP desde la que el emisor envía al manager, tal como figura en el campo location de sus alertas, y ubicación se deja vacía. La columna max_horas_sin_eventos es opcional: con valor, más horas sin un evento nuevo de esa fuente es una laguna de la vigilancia; vacía, solo se juzgan su presencia y sus descartes, y una fuente que se lee sin haber dado nunca un evento queda sin evaluar hasta que se declare.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.mon.3.1'],
      type: 'table',
      usage:
        'Reglas 111402 (log_source_observed), 111403 (agent_forwarding_observed) y 111404 (syslog_source_observed): cada 6 h el recolector de cada agente, y el del manager para sí mismo, lee de wazuh-logcollector.state los eventos, bytes y descartes de cada localfile y de wazuh-agentd.state su conexión; el del manager resume por emisor las alertas de las fuentes syslog que recibe. EV-02 cruza cada fuente con su hecho: una fuente que el logcollector no lee, que descarta eventos o que lleva más de max_horas_sin_eventos sin uno nuevo es un punto ciego de la vigilancia. Cada fuente de agente se juzga en la fila de su máquina; en la del manager, además, que ese agente exista en el manager y esté conectado. Las fuentes syslog se juzgan en la fila del manager.',
      missingBehavior:
        'No hay fuentes declaradas contra las que verificar la recolección: op.mon.3.1 queda sin evaluar. Bloquea el control: es obligatorio.',
    },
    {
      id: 'P-02',
      name: 'reglas_correlacion',
      description:
        'Conjuntos de reglas de correlación que tienen que estar desplegados. R1 exige que el sistema de recolección permita la correlación de los eventos: recolectar sin correlacionar no basta desde categoría MEDIA. El conjunto se nombra como lo agrupa ENSFácil: «wazuh» para el ruleset oficial (ruleset/rules) y, para las reglas propias (etc/rules), el prefijo del fichero hasta el primer «_», «.» o «-» (quersystem_mariadb_rules.xml → quersystem; local_rules.xml → local).',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.3.r1.1'],
      type: 'table',
      usage:
        'Regla 111405 (correlation_rules_inventory): cada 6 h el recolector del manager analiza los ficheros de reglas cargados y cuenta, por conjunto, las reglas que correlacionan (frequency y timeframe, o if_matched_sid / if_matched_group) y sus técnicas MITRE ATT&CK. La regla 111406 resume las alertas de correlación del periodo. EV-03 exige que cada conjunto de P-02 esté cargado con al menos una regla de correlación que pueda alertar. Las detecciones por correlación del periodo se informan.',
      missingBehavior:
        'R1 queda sin evaluar (causa CONFIGURATION): se ve qué correlaciona el manager, pero no qué conjuntos tiene que tener desplegados.',
    },
    {
      id: 'P-03',
      name: 'alcance_superficie_exposicion',
      description:
        'Activos sobre los que tiene que determinarse la superficie de exposición (vulnerabilidades y deficiencias de configuración), como exige R2, incluidos los expuestos a redes no controladas. activo es el NOMBRE o el ID de su agente (el manager es el 000). politicas_sca es opcional: los identificadores de las políticas SCA que tienen que evaluarse en el activo (cis_ubuntu24-04), separados por comas; vacía, basta cualquier política.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.3.r2.1', 'op.mon.3.r6.1', 'op.mon.3.r6.2'],
      type: 'table',
      usage:
        'Reglas 111407 (config_assessment_observed) y 111408 (package_inventory_observed): cada 6 h el recolector del manager lee, de la base de cada agente en el manager (queue/db/NNN.db), el fin de su última pasada SCA por política y la fecha de su inventario de paquetes, del que se alimenta el detector de vulnerabilidades. EV-04 (y EV-10, EV-11 en ALTA) exige que cada activo tenga SCA e inventario dentro de P-11 horas. El recuento de vulnerabilidades por activo vive en el indexer y no se mide sin credenciales: se informa como «sin medir».',
      missingBehavior:
        'R2 queda sin evaluar (causa CONFIGURATION): no consta sobre qué activos debe determinarse la superficie de exposición.',
    },
    {
      id: 'P-04',
      name: 'linea_base_comportamiento',
      description:
        'Patrones de comportamiento normal del sistema contra los que detectar anomalías: horarios habituales de acceso, volúmenes de tráfico, procesos esperados, destinos de conexión habituales. Wazuh no trae motor de líneas base: la detección de anomalías son reglas que alguien escribe sobre estos indicadores, y su validación requiere conocimiento del negocio.',
      level: ['ALTO'],
      requirements: ['op.mon.3.r3.1'],
      type: 'table',
      usage:
        'Sin hecho propio: la anomalía no es medible desde fuera de quien la define. Se muestra al auditor en EV-05 y en el informe. R3.1 es documental: se acredita con P-ATT (la línea base validada y el procedimiento de detección).',
      missingBehavior:
        'El informe no puede decir contra qué normalidad se detectan las anomalías; R3.1 sigue dependiendo de P-ATT.',
    },
    {
      id: 'P-05',
      name: 'sonda_deteccion_red',
      description:
        'Solución de detección de anomalías en el tráfico de red que exige R3.2 (APT por anomalías significativas en el tráfico). Wazuh NO genera esta detección: la ingiere y la correlaciona. Es un componente externo obligatorio en categoría ALTA. Una fila por producto (Suricata, Snort, Zeek); max_dias_sin_alertas es opcional: con valor, más días sin una alerta de la sonda es una ingesta parada.',
      level: ['ALTO'],
      requirements: ['op.mon.3.r3.2'],
      type: 'table',
      usage:
        'Regla 111410 (network_detection_observed): cada 6 h el recolector del manager informa de los NIDS cuyos eventos llegan (syslog, localfile de un grupo o grupos de las alertas) y de su última alerta. EV-06 exige que el manager ingiera alertas de cada producto declarado y, si la fila lo dice, que la última sea más reciente que max_dias_sin_alertas. Sin ninguna detección en red, R3.2 no se cumple.',
      missingBehavior:
        'Si el manager no ingiere ninguna detección en red, R3.2 no se cumple igualmente; si la ingiere, queda sin evaluar (causa CONFIGURATION) hasta que se declare la sonda.',
    },
    {
      id: 'P-06',
      name: 'servicio_observatorio_digital',
      description:
        'Servicio de cibervigilancia u observatorio digital para la detección y seguimiento de anomalías en contenidos digitales que pudieran representar indicadores de amenaza (dominios similares, credenciales filtradas, menciones). Es OSINT y vigilancia de marca, ajeno al perímetro de un SIEM. Obligatorio en categoría ALTA.',
      level: ['ALTO'],
      requirements: ['op.mon.3.r4.1'],
      type: 'table',
      usage:
        'Regla 111411 (ioc_list_observed): cada 6 h el recolector del manager informa de las listas CDB cargadas, sus entradas, su fecha y las reglas que las usan, que es donde acaban los indicadores del servicio. Se muestra en EV-07 y en el apartado de componentes externos del informe. R4 es documental: el servicio se acredita con P-ATT (el contrato o el servicio vigente).',
      missingBehavior:
        'El informe declara R4 sin servicio de cibervigilancia; el requisito sigue dependiendo de P-ATT.',
    },
    {
      id: 'P-07',
      name: 'umbrales_mineria_datos',
      description:
        'Límites de volumen y frecuencia de consultas a partir de los cuales se considera que puede haber un intento de minería de datos, por sistema y perfil de usuario. R5 exige limitar las consultas monitorizando volumen y frecuencia. La columna reglas lleva los ids (o rangos) de las reglas de umbral (frequency y timeframe) que vigilan cada fila: 100510, 100500-100509. Una fila sin regla es una consulta que nadie vigila.',
      level: ['ALTO'],
      requirements: ['op.mon.3.r5.1'],
      type: 'table',
      usage:
        'Regla 111412 (query_volume_rules_observed): cada 6 h el recolector del manager informa de los ids de las reglas de umbral cargadas (con frequency y que pueden alertar). La regla 111406 resume sus alertas. EV-08 exige que cada fila tenga al menos una de sus reglas cargada como regla de umbral. Las superaciones del periodo se informan.',
      missingBehavior:
        'R5.1 queda sin evaluar (causa CONFIGURATION): no consta qué consultas deben vigilarse ni con qué umbral.',
    },
    {
      id: 'P-08',
      name: 'destinatarios_alerta_tiempo_real',
      description:
        'Administradores de seguridad que deben recibir alerta en tiempo real de comportamientos sospechosos y el canal por el que la reciben: «correo» (email_notification de Wazuh) o el nombre de la integración tal como figura en ossec.conf (slack, pagerduty, custom-teams…). nivel_minimo es opcional: el nivel de alerta desde el que el canal tiene que avisar (1-16). Un resumen periódico no satisface el requisito.',
      level: ['ALTO'],
      requirements: ['op.mon.3.r5.2'],
      type: 'table',
      usage:
        'Regla 111413 (notification_channel_configured): cada 6 h el recolector del manager informa del correo (email_notification, email_alert_level, número de destinatarios) y de cada <integration> de ossec.conf (nombre, nivel, grupos y errores en integrations.log), nunca de su hook_url ni de su api_key. EV-09 exige que cada canal declarado exista, esté habilitado, avise desde el nivel declarado y no registre errores de envío en 24 h. La latencia alerta → aviso no es medible: Wazuh no anota los envíos correctos.',
      missingBehavior:
        'R5.2 queda sin evaluar (causa CONFIGURATION): no consta a quién ni por dónde tiene que llegar la alerta.',
    },
    {
      id: 'P-09',
      name: 'plan_inspecciones_seguridad',
      description:
        'Periodicidad y ejecutor de las tres inspecciones que exige R6: verificación de configuración, análisis de vulnerabilidades y pruebas de penetración. periodicidad es un número de días (365 para anual) o «continua». Las dos primeras pueden ser continuas (SCA y detector de vulnerabilidades), lo que supera la exigencia de periodicidad; una prueba de penetración no lo es.',
      level: ['ALTO'],
      requirements: ['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'],
      type: 'table',
      usage:
        'La verificación de configuración y el análisis de vulnerabilidades continuos se miden con los hechos de EV-04 (111407, 111408 y 111409); las inspecciones puntuales, con las filas del registro de inspecciones (111414). Una inspección continua se acredita con SCA (EV-10) o con el detector de vulnerabilidades (EV-11); una periódica, con su última fila del registro dentro de la periodicidad (EV-12), o con la medida continua si la hay.',
      missingBehavior:
        'R6 queda sin evaluar (causa CONFIGURATION): no consta con qué periodicidad deben hacerse las inspecciones.',
    },
    {
      id: 'P-10',
      name: 'registro_inspecciones_realizadas',
      description:
        'Dónde se registran las inspecciones efectivamente realizadas (fecha, tipo, alcance, ejecutor, hallazgos, estado, motivo e incidente), incluidas las hechas tras incidentes, y quién mantiene el registro. ENSFácil lee el registro del manager /etc/ensfacil/security-inspection-register.tsv, que la organización mantiene aunque use otra herramienta, con una fila por inspección y la referencia a su informe.',
      level: ['ALTO'],
      requirements: ['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'],
      type: 'table',
      usage:
        'Regla 111414 (security_inspection_recorded): cada 6 h el recolector del manager reemite el registro de inspecciones entero, fila a fila, sin juzgarlo. Se muestra al auditor. No se compara: lo que se juzga es el registro del manager (EV-12).',
      missingBehavior:
        'El auditor no sabe dónde está el expediente de cada inspección; el registro del manager se sigue leyendo igual.',
    },
    {
      id: 'P-11',
      name: 'antiguedad_maxima_analisis_horas',
      description:
        'Horas que puede pasar un activo de P-03 sin una pasada completa de SCA o sin inventario de paquetes (del que se alimenta el detector de vulnerabilidades) antes de considerar que su superficie de exposición ya no se determina. Vale también para la fuente del detector de vulnerabilidades (el feed): más vieja que P-11, el detector no se actualiza. SCA pasa cada 12 h e inventario cada hora por defecto: el valor tiene que superar su frecuencia configurada (p. ej., 26 h para 12 h).',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.mon.3.r2.1', 'op.mon.3.r6.1', 'op.mon.3.r6.2'],
      type: 'duration_hours',
      usage:
        'Reglas 111407, 111408 y 111409: el recolector del manager emite instantes (fin de la pasada SCA, fecha del inventario, fecha de la fuente del detector), nunca edades. EV-04, EV-10 y EV-11 miden cada antigüedad en el instante en que el recolector la leyó y la comparan con P-11.',
      missingBehavior:
        'R2 queda sin evaluar (causa CONFIGURATION): no hay contra qué medir que la determinación de la superficie de exposición siga activa.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la detección de comportamientos anómalos (R3.1: la línea base validada y su procedimiento) y el observatorio digital (R4: el contrato o el servicio de cibervigilancia).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'Sin hecho propio: un documento no deja rastro en Wazuh. ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica (R3.1 y R4), así que una atestación nunca puede tapar una medida que ha fallado. En pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control (R3.1 y R4) se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'event_collection_status', 'log_source_observed', 'agent_forwarding_observed', 'syslog_source_observed', 'correlation_rules_inventory', 'correlation_alert_observed', 'config_assessment_observed', 'package_inventory_observed', 'vulnerability_detection_status', 'network_detection_observed', 'ioc_list_observed', 'query_volume_rules_observed', 'notification_channel_configured', 'security_inspection_recorded', 'incident_registered'],
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
