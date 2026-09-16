import { ENSControl } from '../types';

export const opAcc5Control: ENSControl = {
  id: 'op.acc.5',
  title: 'Mecanismo de autenticación (usuarios externos)',
  framework: 'ENS',
  category: 'Control de acceso',
  family: 'Marco operacional',
  dimension: 'Confidencialidad, Integridad, Trazabilidad y Autenticidad',
  scope: {
    activeLevels: ['BAJO', 'MEDIO', 'ALTO'],
    declaredLevels: ['BAJO', 'MEDIO', 'ALTO'],
    highLevelStatus: 'NO_EVALUABLE',
  },
  expectedResult: {
    bajo: {
      status: 'PARCIAL',
      score: 61,
      condition:
        'op.acc.5 + [R1 o R2 o R3 o R4] → Base completa + UNO de los cuatro mecanismos de autenticación. Sin evidencia tecnica en: op.acc.5.1, op.acc.5.2, op.acc.5.3, op.acc.5.9, op.acc.5.r1.1, op.acc.5.r1.2, op.acc.5.r4.3, por lo que el nivel no puede pasar de PARCIAL.',
    },
    medio: {
      status: 'PARCIAL',
      score: 67,
      condition:
        'op.acc.5 + [R2 o R3 o R4] + R5 → Base completa + UNO de los tres mecanismos reforzados (R1 excluido) + registro obligatorio. Sin evidencia tecnica en: op.acc.5.1, op.acc.5.2, op.acc.5.3, op.acc.5.9, op.acc.5.r4.3, op.acc.5.r5.2, por lo que el nivel no puede pasar de PARCIAL.',
    },
    alto: {
      status: 'PARCIAL',
      score: 67,
      condition:
        'op.acc.5 + [R2 o R3 o R4] + R5 → Ídem Nivel MEDIO. No hay exigencia adicional en ALTO. Sin evidencia tecnica en: op.acc.5.1, op.acc.5.2, op.acc.5.3, op.acc.5.9, op.acc.5.r4.3, op.acc.5.r5.2, por lo que el nivel no puede pasar de PARCIAL.',
    },
  },
  requirements: [
    {
      id: 'op.acc.5.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Registro fidedigno previo a la entrega',
      description:
        'Antes de proporcionar las credenciales de autenticación a las entidades, usuarios o procesos, estos deberán haberse identificado y registrado de manera fidedigna ante el sistema o ante un Prestador Cualificado de Servicios de Confianza o un proveedor de identidad electrónica reconocido por las administraciones públicas, de conformidad con lo dispuesto en la Ley 39/2015, de 1 de octubre.',
      evidences: [],
    },
    {
      id: 'op.acc.5.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Acuse de recibo y deber de custodia',
      description:
        'Antes de activar el mecanismo de autenticación, el usuario reconocerá que las ha recibido y que conoce y acepta las obligaciones que implica su tenencia, en particular, el deber de custodia diligente, la protección de su confidencialidad y el deber de notificación inmediata en caso de pérdida.',
      evidences: [],
    },
    {
      id: 'op.acc.5.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Credencial bajo control exclusivo del usuario',
      description:
        'Las credenciales estarán bajo el control exclusivo del usuario y se activarán una vez estén bajo su control efectivo.',
      evidences: [],
    },
    {
      id: 'op.acc.5.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Cambio periódico de credenciales',
      description:
        'Las credenciales se cambiarán con una periodicidad marcada por la política de seguridad de la organización.',
      evidences: ['EV-04'],
    },
    {
      id: 'op.acc.5.5',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Inhabilitación ante compromiso',
      description:
        'Las credenciales serán inhabilitadas —pudiendo ser regeneradas, en su caso—, cuando conste o se sospeche su pérdida, compromiso o revelación a entidades (personas, equipos o procesos) no autorizadas.',
      evidences: ['EV-05'],
    },
    {
      id: 'op.acc.5.6',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Inhabilitación al terminar la relación',
      description:
        'Las credenciales serán inhabilitadas cuando la entidad (persona, equipo o proceso) que autentican termina su relación con el sistema.',
      evidences: ['EV-05'],
    },
    {
      id: 'op.acc.5.7',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Autenticación que no revela información',
      description:
        'Antes de autorizar el acceso, la información presentada por el sistema será la mínima imprescindible para que el usuario se autentique, evitando todo aquello que pueda, directa o indirectamente, revelar información sobre el sistema o la cuenta, sus características, su operación o su estado. Las credenciales solamente se validarán cuando se tengan todos los datos necesarios y, si se rechaza, no se informará del motivo del rechazo.',
      evidences: ['EV-06'],
    },
    {
      id: 'op.acc.5.8',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Límite de intentos y reactivación',
      description:
        'El número de intentos permitidos será limitado, bloqueando la oportunidad de acceso una vez superado tal número, y requiriendo una intervención específica para reactivar la cuenta, que se describirá en la documentación.',
      evidences: ['EV-02', 'EV-03'],
    },
    {
      id: 'op.acc.5.9',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Información de derechos y obligaciones',
      description:
        'El sistema informará al usuario de sus derechos u obligaciones inmediatamente después de obtener el acceso.',
      evidences: [],
    },
    {
      id: 'op.acc.5.r1.1',
      level: ['BAJO'],
      title: 'Contraseña como mecanismo (R1)',
      description:
        'Se empleará una contraseña como mecanismo de autenticación.',
      evidences: [],
    },
    {
      id: 'op.acc.5.r1.2',
      level: ['BAJO'],
      title: 'Complejidad mínima de la contraseña (R1)',
      description:
        'Se impondrán normas de complejidad mínima y robustez frente a ataques de adivinación (ver guías CCN-STIC).',
      evidences: [],
    },
    {
      id: 'op.acc.5.r2.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Segundo factor OTP (R2)',
      description:
        'Se requerirá una contraseña de un solo uso (OTP, en inglés) como complemento a la contraseña de usuario.',
      evidences: ['EV-07'],
    },
    {
      id: 'op.acc.5.r3.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Certificado cualificado (R3)',
      description:
        'Se emplearán certificados cualificados como mecanismo de autenticación.',
      evidences: ['EV-08'],
    },
    {
      id: 'op.acc.5.r3.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Segundo factor sobre el certificado (R3)',
      description:
        'El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
      evidences: ['EV-07'],
    },
    {
      id: 'op.acc.5.r3.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Registro previo cualificado (R3)',
      description:
        'Las credenciales utilizadas deberán haber sido obtenidas tras un registro previo presencial, o bien telemático, usando un certificado electrónico cualificado.',
      evidences: ['EV-08'],
    },
    {
      id: 'op.acc.5.r4.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Certificado en soporte físico autorizado (R4)',
      description:
        'Se emplearán certificados cualificados como mecanismo de autenticación, en soporte físico (tarjeta o similar) usando algoritmos, parámetros y dispositivos autorizados por el CCN.',
      evidences: ['EV-08'],
    },
    {
      id: 'op.acc.5.r4.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Segundo factor sobre el certificado (R4)',
      description:
        'El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
      evidences: ['EV-07'],
    },
    {
      id: 'op.acc.5.r4.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Registro previo cualificado (R4)',
      description:
        'Las credenciales utilizadas deberán haber sido obtenidas tras un registro previo presencial, o bien telemático, usando certificado electrónico cualificado.',
      evidences: [],
    },
    {
      id: 'op.acc.5.r5.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Registro de accesos con éxito y fallidos (R5)',
      description:
        'Se registrarán los accesos con éxito y los fallidos.',
      evidences: ['EV-01', 'EV-09'],
    },
    {
      id: 'op.acc.5.r5.2',
      level: ['MEDIO', 'ALTO'],
      title: 'Aviso del último acceso efectuado (R5)',
      description:
        'Se informará al usuario del último acceso efectuado con su identidad.',
      evidences: [],
    },
    {
      id: 'op.acc.5.r6.1',
      level: [],
      title: 'Renovación de la autenticación (R6)',
      description:
        'Refuerzo R6 – Limitación de la ventana de acceso: Se definirán aquellos puntos en los que el sistema requerirá una renovación de la autenticación del usuario, mediante identificación singular, no bastando con la sesión establecida.',
      evidences: [],
    },
    {
      id: 'op.acc.5.r7.1',
      level: [],
      title: 'Suspensión por no utilización (R7)',
      description:
        'Refuerzo R7 – Suspensión por no utilización: Las credenciales se suspenderán tras un periodo definido de no utilización.',
      evidences: [],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.acc.5.r5.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Registro de accesos con éxito y fallidos',
      description:
        'Ingesta y conservación de todos los eventos de autenticación de los servicios de P-02, tanto exitosos como fallidos. Es la evidencia central del Refuerzo R5, obligatorio en MEDIO y ALTO, y la base sobre la que se construyen el resto de detecciones del control.',
      format: 'json_line',
      events: ['evidence_state', 'external_auth_success', 'external_auth_failure'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.acc.5.8'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Superación del límite de intentos sin bloqueo efectivo',
      description:
        'Detección de cuentas externas que acumulan más de P-03 intentos fallidos consecutivos sin que se produzca el bloqueo de la cuenta. Evidencia que el límite exigido por op.acc.5.8 no está operativo, aunque esté declarado en la configuración.',
      format: 'json_line',
      events: ['evidence_state', 'lockout_not_applied'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.acc.5.8'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ataques de fuerza bruta y credential stuffing contra el servicio externo',
      description:
        'Identificación de patrones de ataque sobre los servicios de P-02: múltiples fallos desde una IP contra varias cuentas, o contra una cuenta desde múltiples IP. Es el riesgo que op.acc.5.8 pretende mitigar.',
      format: 'json_line',
      events: ['evidence_state', 'brute_force_pattern', 'credential_stuffing_pattern'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.acc.5.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Antigüedad de las credenciales frente a la periodicidad exigida',
      description:
        'Cálculo del tiempo transcurrido desde el último cambio de credencial de cada usuario externo activo, y contraste con la periodicidad P-05 fijada por la política de la organización.',
      format: 'json_line',
      events: ['evidence_state', 'credential_age'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.acc.5.5', 'op.acc.5.6'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Reacción ante compromiso o fin de relación',
      description:
        'Medición del intervalo entre el evento de notificación de pérdida, compromiso o revelación de una credencial (o de fin de relación del usuario con el sistema) y el evento de inhabilitación efectiva de esa credencial. Contraste con el plazo máximo P-06.',
      format: 'json_line',
      events: ['evidence_state', 'credential_disable_delay'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.acc.5.7'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación de mensajes de error no informativos',
      description:
        'Detección de respuestas del servicio que revelan información sobre el sistema o la cuenta en los rechazos de autenticación: mensajes que distinguen «usuario inexistente» de «contraseña incorrecta», trazas de error, versiones del software. Vulnera op.acc.5.7.',
      format: 'json_line',
      events: ['evidence_state', 'auth_error_verbose'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.acc.5.r2.1', 'op.acc.5.r3.2', 'op.acc.5.r4.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Autenticación con segundo factor efectivamente aplicado (R2, R3, R4)',
      description:
        'Verificación de que las autenticaciones registradas incluyen efectivamente el segundo factor exigido por el refuerzo elegido: OTP en R2, PIN o biometría sobre el certificado en R3 y R4. Detecta autenticaciones completadas sin el factor adicional.',
      format: 'json_line',
      events: ['evidence_state', 'second_factor_missing'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.acc.5.r3.1', 'op.acc.5.r3.3', 'op.acc.5.r4.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Validación de certificados y estado de revocación (R3, R4)',
      description:
        'Comprobación de que los certificados presentados provienen de las autoridades admitidas en P-07 y de que se ejecuta la consulta de revocación (OCSP o CRL) en cada autenticación. Detecta aceptación de certificados de AC no admitidas o sin validar revocación.',
      format: 'json_line',
      events: ['evidence_state', 'certificate_validation'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.acc.5.r5.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Continuidad e integridad del registro de accesos',
      description:
        'Verificación de que el registro exigido por R5 no presenta lagunas: períodos sin eventos en servicios que deberían tener actividad, o pérdida de eventos por fallo del agente o del colector. Una laguna en el registro compromete la acreditación de R5.',
      format: 'json_line',
      events: ['evidence_state', 'access_log_gap'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'refuerzo_autenticacion_elegido',
      description:
        'Refuerzo de autenticación implementado para usuarios externos. Es una elección entre opciones, no un acumulativo. Determina qué comprobaciones ejecuta ENSFácil.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.r1 a', 'op.acc.5.r4'],
      type: 'select',
      usage:
        'Activa el conjunto de reglas correspondiente.',
      missingBehavior:
        'El control es NO EVALUABLE. Sin saber qué mecanismo se usa no se puede verificar ninguna de sus condiciones.',
    },
    {
      id: 'P-02',
      name: 'servicios_acceso_externo',
      description:
        'Portales, aplicaciones o endpoints a través de los cuales se autentican los usuarios externos: sede electrónica, portal del ciudadano, API pública con credenciales, extranet de proveedores.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.1', 'op.acc.5.8', 'op.acc.5.r5.1'],
      type: 'list',
      usage:
        'Define de qué fuentes debe recoger Wazuh los eventos de autenticación externa y qué decodificador aplicar. Sin esta lista, los accesos externos no llegan al SIEM.',
      missingBehavior:
        'No hay ingesta de eventos de autenticación externa. Todas las evidencias quedan sin fuente.',
    },
    {
      id: 'P-03',
      name: 'max_intentos_fallidos',
      description:
        'Número máximo de intentos de autenticación fallidos consecutivos antes de bloquear el acceso. El ENS exige que el número sea limitado (op.acc.5.8) pero deja la cifra a la organización.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.8'],
      type: 'number',
      usage:
        'ENSFácil verifica en la configuración del servicio que existe el límite y genera una regla de correlación que alerta si se superan P-03 intentos sin que se produzca el bloqueo efectivo de la cuenta.',
      missingBehavior:
        'No se puede verificar op.acc.5.8. No se distingue un ataque de fuerza bruta de un bloqueo funcionando bien.',
    },
    {
      id: 'P-04',
      name: 'procedimiento_reactivacion',
      description:
        'Referencia al procedimiento documentado de reactivación de cuenta tras bloqueo. El ENS exige expresamente que la intervención específica para reactivar «se describirá en la documentación».',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.8'],
      type: 'string',
      usage:
        'Referencia documental en el informe.',
      missingBehavior:
        'El informe no puede acreditar la parte documental de op.acc.5.8.',
    },
    {
      id: 'P-05',
      name: 'periodicidad_cambio_credenciales_dias',
      description:
        'Cada cuántos días deben cambiarse las credenciales de usuarios externos. El ENS remite expresamente a la política de seguridad de la organización (op.acc.5.4), no fija plazo.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.4'],
      type: 'duration_days',
      usage:
        'ENSFácil calcula la antigüedad de cada credencial y alerta cuando supera P-05. Si P-01 = R3 o R4, este parámetro se sustituye por la vigencia del certificado.',
      missingBehavior:
        'No se puede verificar op.acc.5.4. La caducidad de credenciales queda sin control automático.',
    },
    {
      id: 'P-06',
      name: 'plazo_max_inhabilitar_credencial_horas',
      description:
        'Tiempo máximo admitido entre que consta o se sospecha el compromiso de una credencial y su inhabilitación efectiva (op.acc.5.5). También aplica al fin de relación con el sistema (op.acc.5.6).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.5', 'op.acc.5.6'],
      type: 'duration_hours',
      usage:
        'ENSFácil correlaciona el evento de notificación de compromiso o de fin de relación con el evento de inhabilitación de la credencial. Si el intervalo supera P-06 → alerta.',
      missingBehavior:
        'No se puede medir la reacción ante compromiso. op.acc.5.5 y .5.6 quedan NO EVALUABLES.',
    },
    {
      id: 'P-07',
      name: 'vigencia_certificados_admitidos',
      description:
        'Autoridades de certificación admitidas y política de validación (OCSP, CRL) cuando el mecanismo elegido es R3 o R4. Necesario para verificar que los certificados son efectivamente cualificados.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.r3.1', 'op.acc.5.r4.1'],
      type: 'list',
      usage:
        'ENSFácil verifica en los logs del servicio que los certificados presentados provienen de las AC declaradas y que se ejecuta la comprobación de revocación en cada autenticación.',
      missingBehavior:
        'No se puede verificar que los certificados sean cualificados ni que se valide su estado de revocación.',
    },
    {
      id: 'P-08',
      name: 'retencion_registro_accesos_dias',
      description:
        'Período de conservación del registro de accesos con éxito y fallidos exigido por R5 (obligatorio en MEDIO y ALTO). Debe ser coherente con el período de retención definido en op.acc.1.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.5.r5.1'],
      type: 'duration_days',
      usage:
        'Configura la política de retención de índices en Wazuh Indexer.',
      missingBehavior:
        'No se puede acreditar la conservación del registro exigido por R5. Riesgo de pérdida de trazabilidad.',
    },
    {
      id: 'P-09',
      name: 'notificacion_ultimo_acceso',
      description:
        'Indica si el servicio informa al usuario del último acceso efectuado con su identidad, exigido por op.acc.5.r5.2 en nivel MEDIO y ALTO. Es una funcionalidad del portal, no detectable en logs.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.5.r5.2'],
      type: 'boolean',
      usage:
        'Declaración de configuración que ENSFácil recoge en el informe. No es verificable automáticamente por Wazuh: se acredita documentalmente con la evidencia aportada.',
      missingBehavior:
        'R5 queda parcialmente sin acreditar. op.acc.5.r5.2 marcado como pendiente de evidencia documental.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar, como un procedimiento aprobado o un contrato firmado. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el registro fidedigno previo, el acuse de recibo de las credenciales, la entrega bajo control exclusivo del usuario y la información de derechos y obligaciones: nada de eso deja rastro en un log.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'external_auth_success', 'external_auth_failure', 'lockout_not_applied', 'brute_force_pattern', 'credential_stuffing_pattern', 'credential_age', 'credential_disable_delay', 'auth_error_verbose', 'second_factor_missing', 'certificate_validation', 'access_log_gap'],
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
