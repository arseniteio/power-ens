import { ENSControl } from '../types';

export const opExp4Control: ENSControl = {
  id: 'op.exp.4',
  title: 'Mantenimiento y actualizaciones de seguridad',
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
      status: 'CUMPLE',
      score: 100,
      condition:
        'Pendiente de definir.',
    },
  },
  requirements: [
    {
      id: 'op.exp.4.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Vigilancia de los anuncios del fabricante',
      description:
        'Se atenderá a las especificaciones de los fabricantes en lo relativo a instalación y mantenimiento de los sistemas, lo que incluirá un seguimiento continuo de los anuncios de defectos.',
      evidences: ['EV-01', 'EV-03', 'EV-05', 'EV-06'],
    },
    {
      id: 'op.exp.4.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Plazos de actualización según el riesgo',
      description:
        'Se dispondrá de un procedimiento para analizar, priorizar y determinar cuándo aplicar las actualizaciones de seguridad, parches, mejoras y nuevas versiones. La priorización tendrá en cuenta la variación del riesgo en función de la implantación o no de la actualización.',
      evidences: ['EV-01', 'EV-02', 'EV-03', 'EV-07', 'EV-10'],
    },
    {
      id: 'op.exp.4.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Mantenimiento por personal autorizado',
      description:
        'El mantenimiento solo podrá realizarse por personal debidamente autorizado.',
      evidences: ['EV-04'],
    },
    {
      id: 'op.exp.4.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Prueba previa en preproducción (R1)',
      description:
        'Antes de poner en producción una nueva versión o una versión parcheada, se comprobará en un entorno de prueba controlado y consistente en configuración al entorno de producción, que la nueva instalación funciona correctamente y no disminuye la eficacia de las funciones necesarias para el trabajo diario.',
      evidences: ['EV-08'],
      active: false,
    },
    {
      id: 'op.exp.4.r2.1',
      level: ['ALTO'],
      title: 'Mecanismo de reversión previsto (R2)',
      description:
        'Antes de la aplicación de las configuraciones, parches y actualizaciones de seguridad se preverá un mecanismo para revertirlos en caso de aparición de efectos adversos.',
      evidences: ['EV-09'],
      active: false,
    },
    {
      id: 'op.exp.4.r3.1',
      level: [],
      title: 'Integridad periódica del firmware (R3)',
      description:
        'Refuerzo R3 – Actualizaciones y pruebas periódicas: Se deberá comprobar de forma periódica la integridad del firmware utilizado en los dispositivos hardware del sistema (infraestructura de red, BIOS, etc.). La periodicidad de estas comprobaciones seguirá las recomendaciones de la Guía CCN-STIC que sea de aplicación.',
      evidences: ['EV-11'],
    },
    {
      id: 'op.exp.4.r4.1',
      level: [],
      title: 'Monitorización continua de amenazas (R4)',
      description:
        'Refuerzo R4 – Monitorización continua: Se desplegará a nivel de sistema una estrategia de monitorización continua de amenazas y vulnerabilidades. Esta estrategia detallará: 1. Los indicadores críticos de seguridad a emplear. 2. La política de aplicación de parches de seguridad de los componentes software relacionados en las listas de [op.exp.1.r4], [op.ext.3.r3] y [mp.sw.1.r5]. 3. Los criterios de revisión regular y excepcional de las amenazas sobre el sistema.',
      evidences: ['EV-01', 'EV-10'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.4.1', 'op.exp.4.2', 'op.exp.4.r4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Inventario continuo de vulnerabilidades por activo',
      description:
        'Detección automática de vulnerabilidades conocidas (CVE) en los productos instalados en cada activo, cruzando el inventario de Syscollector con los feeds de los fabricantes y bases públicas. Es la evidencia central del control y, además, cubre de facto el Refuerzo R4.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.4.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Tiempo de remediación frente a los plazos del procedimiento',
      description:
        'Medición del tiempo transcurrido entre la primera detección de cada vulnerabilidad y su desaparición del inventario (por parcheo o mitigación), contrastado con el plazo que le corresponde según su criticidad en P-01 y P-08. Es la evidencia directa de op.exp.4.2.',
      format: 'json_line',
      events: ['evidence_state', 'vulnerability_detected', 'vulnerability_resolved'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.4.1', 'op.exp.4.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Estado de parcheado del parque',
      description:
        'Inventario de versiones de paquetes, aplicaciones y actualizaciones instaladas en cada activo, incluidos los hotfixes de Windows. Permite acreditar que el mantenimiento se realiza efectivamente y conocer el nivel de actualización real del parque.',
      format: 'json_line',
      events: ['evidence_state', 'package_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.4.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Instalaciones y actualizaciones por personal no autorizado',
      description:
        'Detección de instalaciones, actualizaciones o desinstalaciones de software cuyo actor no figura entre el personal autorizado de P-02. op.exp.4.3 es taxativo: el mantenimiento solo puede realizarlo personal debidamente autorizado.',
      format: 'json_line',
      events: ['evidence_state', 'package_changed'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Software fuera de soporte del fabricante',
      description:
        'Identificación de productos instalados cuya versión ha alcanzado el fin de soporte declarado en P-05, o está próxima a alcanzarlo. Un componente sin soporte no recibirá actualizaciones de seguridad, lo que impide materialmente cumplir op.exp.4.1.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cobertura del seguimiento de anuncios de defectos',
      description:
        'Contraste entre los fabricantes y productos realmente presentes en el inventario y las fuentes de seguimiento declaradas en P-03 y los feeds activos del Vulnerability Detector. Revela puntos ciegos: productos desplegados de los que nadie vigila los boletines.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.4.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Actualizaciones aplicadas fuera de ventana de mantenimiento',
      description:
        'Detección de cambios de software aplicados fuera de las franjas autorizadas en P-04, lo que puede indicar intervención improvisada al margen del procedimiento de gestión de cambios exigido por op.exp.4.2.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.exp.4.r1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Trazabilidad del paso por preproducción (R1)',
      description:
        'Verificación de que cada versión desplegada en producción estuvo previamente instalada en el entorno de preproducción emparejado en P-06. Es la evidencia técnica del Refuerzo R1, obligatorio desde categoría MEDIA.',
      format: 'json_line',
      events: ['evidence_state', 'preprod_deployment'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.exp.4.r2.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Existencia de punto de reversión previo (R2)',
      description:
        'Verificación de que antes de cada aplicación de parches o cambios de configuración se generó el mecanismo de reversión declarado en P-07: snapshot, backup o imagen. R2 es obligatorio en categoría ALTA.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'reversion_point_created'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-10',
      requirement: ['op.exp.4.2', 'op.exp.4.r4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Evolución de la deuda de vulnerabilidades',
      description:
        'Serie temporal del número de vulnerabilidades abiertas por criticidad y del tiempo medio de remediación. Distingue una organización que parchea con ritmo sostenido de otra que acumula deuda, que es exactamente lo que un auditor busca valorar en este control.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-11',
      requirement: ['op.exp.4.r3.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Versiones de firmware de dispositivos hardware (R3)',
      description:
        'Registro de las versiones de firmware de los dispositivos de P-09 y contraste con los boletines del fabricante para detectar versiones vulnerables o desactualizadas. Corresponde al Refuerzo R3, no obligatorio en ninguna categoría.',
      format: 'json_line',
      events: ['evidence_state', 'firmware_version'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'plazos_aplicacion_parches',
      description:
        'Plazos máximos de aplicación de actualizaciones de seguridad según la criticidad de la vulnerabilidad. El ENS exige un procedimiento de priorización que tenga en cuenta la variación del riesgo (op.exp.4.2), pero no fija plazos: los define la organización.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.4.2'],
      type: 'table',
      usage:
        'Es el parámetro central del control. Superarlo → hallazgo.',
      missingBehavior:
        'op.exp.4.2 NO EVALUABLE. Se detectan las vulnerabilidades pero no se puede juzgar si la reacción es tardía.',
    },
    {
      id: 'P-02',
      name: 'personal_autorizado_mantenimiento',
      description:
        'Cuentas y personas autorizadas para realizar tareas de mantenimiento y aplicar actualizaciones. op.exp.4.3 es taxativo: el mantenimiento solo podrá realizarse por personal debidamente autorizado.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.4.3'],
      type: 'table',
      usage:
        'CDB list en Wazuh. Toda instalación, actualización o desinstalación de software detectada cuyo actor no figure en esta lista genera alerta de mantenimiento no autorizado.',
      missingBehavior:
        'op.exp.4.3 NO EVALUABLE. No se puede distinguir un parcheado legítimo de una instalación no autorizada.',
    },
    {
      id: 'P-03',
      name: 'fuentes_anuncios_defectos',
      description:
        'Fuentes de seguimiento de anuncios de defectos y boletines de seguridad de los fabricantes del equipamiento desplegado, exigidas por op.exp.4.1 («seguimiento continuo de los anuncios de defectos»).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.4.1'],
      type: 'table',
      usage:
        'Power ENS documenta la cobertura del seguimiento y verifica que los feeds del Vulnerability Detector incluyen los fabricantes del inventario real. Fabricante presente en el inventario sin feed configurado → punto ciego declarado.',
      missingBehavior:
        'No se puede acreditar el seguimiento continuo de anuncios de defectos exigido por op.exp.4.1.',
    },
    {
      id: 'P-04',
      name: 'ventanas_mantenimiento',
      description:
        'Franjas horarias autorizadas para la aplicación de actualizaciones y tareas de mantenimiento. Permite distinguir un parcheado planificado de una instalación fuera de procedimiento.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.4.2', 'op.exp.4.3'],
      type: 'table',
      usage:
        'Power ENS contrasta la marca temporal de cada cambio de software detectado con las ventanas declaradas. Actualización aplicada fuera de ventana sin declaración de urgencia → hallazgo de procedimiento.',
      missingBehavior:
        'No se puede distinguir mantenimiento planificado de intervención improvisada. Se pierde una señal útil.',
    },
    {
      id: 'P-05',
      name: 'software_fin_de_soporte',
      description:
        'Relación de productos desplegados con su fecha de fin de soporte del fabricante. Un producto fuera de soporte no recibe actualizaciones de seguridad, lo que hace imposible cumplir op.exp.4.1 y op.exp.4.2 sobre ese componente.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.4.1'],
      type: 'table',
      usage:
        'Power ENS cruza el inventario de Syscollector contra esta tabla y alerta de productos fuera de soporte o próximos a estarlo. Es un hallazgo de auditoría muy habitual y de difícil defensa.',
      missingBehavior:
        'No se detectan productos fuera de soporte. Riesgo de hallazgo sorpresa en la auditoría de certificación.',
    },
    {
      id: 'P-06',
      name: 'entorno_preproduccion',
      description:
        'Identificación del entorno de pruebas y acreditación de que es consistente en configuración con producción, como exige R1. Debe permitir correlacionar cada despliegue en producción con su paso previo por preproducción.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.4.r1.1'],
      type: 'table',
      usage:
        'Power ENS correlaciona la instalación de una versión en producción con su instalación previa en el sistema de preproducción emparejado. Versión que aparece en producción sin haber pasado por preproducción → hallazgo de R1.',
      missingBehavior:
        'R1 NO EVALUABLE. En categoría MEDIA y ALTA queda un refuerzo obligatorio sin acreditar automáticamente.',
    },
    {
      id: 'P-07',
      name: 'mecanismo_reversion',
      description:
        'Mecanismo previsto para revertir configuraciones, parches y actualizaciones en caso de efectos adversos: snapshots de máquina virtual, puntos de restauración, imágenes previas, repositorio de versiones anteriores. R2 es obligatorio en categoría ALTA.',
      level: ['ALTO'],
      requirements: ['op.exp.4.r2.1'],
      type: 'table',
      usage:
        'Power ENS verifica que existe evidencia del punto de reversión ANTES de cada actualización: snapshot creado, backup ejecutado o imagen registrada en la ventana previa al cambio. Actualización sin punto de reversión previo → hallazgo de R2.',
      missingBehavior:
        'R2 NO EVALUABLE. En categoría ALTA queda un refuerzo obligatorio sin acreditar.',
    },
    {
      id: 'P-08',
      name: 'criticidad_cvss_umbral',
      description:
        'Correspondencia entre la puntuación CVSS que reporta el Vulnerability Detector y las categorías de criticidad con las que la organización prioriza en P-01. Permite automatizar la priorización.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.4.2'],
      type: 'table',
      usage:
        'Power ENS clasifica automáticamente cada vulnerabilidad detectada y le aplica el plazo de P-01 correspondiente. Puede ponderarse además por la criticidad del activo afectado (op.exp.1 P-06).',
      missingBehavior:
        'Se aplica la correspondencia CVSS estándar por defecto, que puede no reflejar la valoración de riesgo propia.',
    },
    {
      id: 'P-09',
      name: 'dispositivos_firmware',
      description:
        'Dispositivos hardware cuyo firmware debe verificarse periódicamente: electrónica de red, BIOS/UEFI de servidores, controladoras. Corresponde al Refuerzo R3, no obligatorio en ninguna categoría.',
      level: [],
      requirements: ['op.exp.4.r3.1'],
      type: 'table',
      usage:
        'Power ENS registra la versión de firmware declarada y la contrasta con los boletines del fabricante. Permite acreditar R3 aunque no sea exigible. La verificación de integridad en sí suele requerir herramientas del propio fabricante.',
      missingBehavior:
        'R3 sin acreditar. No supone incumplimiento al no ser exigible, pero es un punto ciego de seguridad real.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la verificación criptográfica de integridad del firmware y la estrategia de monitorización continua, que ningún agente puede observar.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'Power ENS lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'vulnerability_detected', 'vulnerability_resolved', 'package_state', 'package_changed', 'preprod_deployment', 'reversion_point_created', 'firmware_version'],
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
