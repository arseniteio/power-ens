import { ENSControl } from '../types';

export const opAcc6Control: ENSControl = {
  id: 'op.acc.6',
  title: 'Mecanismo de autenticación (usuarios de la organización)',
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
      score: 47,
      condition:
        'op.acc.6 + [R1 o R2 o R3 o R4] + R8 + R9 → Base + UN mecanismo + doble factor en zona no controlada + acceso remoto. Sin evidencia tecnica en: op.acc.6.1, op.acc.6.2, op.acc.6.3, op.acc.6.9, op.acc.6.r2.1, op.acc.6.r3.1, op.acc.6.r3.2, op.acc.6.r4.1, op.acc.6.r4.2, por lo que el nivel no puede pasar de PARCIAL.',
    },
    medio: {
      status: 'PARCIAL',
      score: 47,
      condition:
        'op.acc.6 + [R1 o R2 o R3 o R4] + R5 + R8 + R9 → Ídem BAJO + registro de accesos obligatorio. Sin evidencia tecnica en: op.acc.6.1, op.acc.6.2, op.acc.6.3, op.acc.6.9, op.acc.6.r2.1, op.acc.6.r3.1, op.acc.6.r3.2, op.acc.6.r4.1, op.acc.6.r4.2, op.acc.6.r5.2, por lo que el nivel no puede pasar de PARCIAL.',
    },
    alto: {
      status: 'PARCIAL',
      score: 52,
      condition:
        'op.acc.6 + [R1 o R2 o R3 o R4] + R5 + R6 + R7 + R8 + R9 → Ídem MEDIO + renovación de autenticación + suspensión por no uso. Sin evidencia tecnica en: op.acc.6.1, op.acc.6.2, op.acc.6.3, op.acc.6.9, op.acc.6.r2.1, op.acc.6.r3.1, op.acc.6.r3.2, op.acc.6.r4.1, op.acc.6.r4.2, op.acc.6.r5.2, op.acc.6.r9.1, por lo que el nivel no puede pasar de PARCIAL.',
    },
  },
  requirements: [
    {
      id: 'op.acc.6.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Aceptación previa de la política de seguridad',
      description:
        'Antes de proporcionar las credenciales a los usuarios, estos deberán conocer y aceptar la política de seguridad del organismo en los aspectos que les afecten.',
      evidences: [],
    },
    {
      id: 'op.acc.6.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Acuse de recibo y obligaciones de custodia',
      description:
        'Antes de activar el mecanismo de autenticación, el usuario reconocerá que ha recibido las credenciales de acceso y que conoce y acepta las obligaciones que implica su tenencia, en particular, el deber de custodia diligente, la protección de su confidencialidad y el deber de notificación inmediata en caso de pérdida.',
      evidences: [],
    },
    {
      id: 'op.acc.6.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Credencial bajo control exclusivo del usuario',
      description:
        'Las credenciales estarán bajo el control exclusivo del usuario y se activarán una vez estén bajo su control efectivo.',
      evidences: [],
    },
    {
      id: 'op.acc.6.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Cambio periódico de credenciales',
      description:
        'Las credenciales se cambiarán con una periodicidad marcada por la política de seguridad de la organización.',
      evidences: ['EV-05'],
    },
    {
      id: 'op.acc.6.5',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Inhabilitación ante compromiso',
      description:
        'Las credenciales serán inhabilitadas —pudiendo ser regeneradas, en su caso—, cuando conste o se sospeche su pérdida, compromiso o revelación a entidades (personas, equipos o procesos) no autorizadas.',
      evidences: ['EV-06'],
    },
    {
      id: 'op.acc.6.6',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Inhabilitación al cesar la relación',
      description:
        'Las credenciales serán inhabilitadas cuando el usuario que autentican termina su relación con el sistema.',
      evidences: ['EV-06'],
    },
    {
      id: 'op.acc.6.7',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Rechazo que no revela el motivo',
      description:
        'Antes de autorizar el acceso, la información presentada por el sistema será la mínima imprescindible para que el usuario se autentique, evitando todo aquello que pueda, directa o indirectamente, revelar información sobre el sistema o la cuenta, sus características, su operación o su estado. Las credenciales solamente se validarán cuando se tengan todos los datos necesarios y, si se rechaza, no se informará del motivo del rechazo.',
      evidences: ['EV-12'],
    },
    {
      id: 'op.acc.6.8',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Límite de intentos con bloqueo efectivo',
      description:
        'El número de intentos permitidos será limitado, bloqueando la oportunidad de acceso una vez superado tal número, y requiriendo una intervención específica para reactivar la cuenta, que se describirá en la documentación.',
      evidences: ['EV-03', 'EV-04'],
    },
    {
      id: 'op.acc.6.9',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Información de derechos tras el acceso',
      description:
        'El sistema informará al usuario de sus derechos u obligaciones inmediatamente después de obtener el acceso.',
      evidences: [],
    },
    {
      id: 'op.acc.6.r1.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Contraseña solo desde zona controlada (R1)',
      description:
        'Se empleará una contraseña como mecanismo de autenticación cuando el acceso se realiza desde zonas controladas y sin atravesar zonas no controladas (véase refuerzo R8).',
      evidences: ['EV-02'],
    },
    {
      id: 'op.acc.6.r1.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Complejidad mínima de la contraseña (R1)',
      description:
        'Se impondrán normas de complejidad mínima y robustez frente a ataques de adivinación (ver guías CCN-STIC).',
      evidences: ['EV-11'],
    },
    {
      id: 'op.acc.6.r2.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Segundo factor junto a la contraseña (R2)',
      description:
        'Se requerirá un segundo factor tal como «algo que se tiene», es decir, un dispositivo, una contraseña de un solo uso (OTP, en inglés) como complemento a la contraseña de usuario, o «algo que se es».',
      evidences: [],
    },
    {
      id: 'op.acc.6.r3.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Certificado cualificado (R3)',
      description:
        'Se emplearán certificados cualificados como mecanismo de autenticación.',
      evidences: [],
    },
    {
      id: 'op.acc.6.r3.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Certificado protegido por PIN o biometría (R3)',
      description:
        'El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
      evidences: [],
    },
    {
      id: 'op.acc.6.r4.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Certificado en soporte físico autorizado (R4)',
      description:
        'Se emplearán certificados cualificados como mecanismo de autenticación, en soporte físico (tarjeta o similar) usando algoritmos, parámetros y dispositivos autorizados por el CCN.',
      evidences: [],
    },
    {
      id: 'op.acc.6.r4.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Soporte físico protegido por PIN o biometría (R4)',
      description:
        'El uso del certificado estará protegido por un segundo factor, del tipo PIN o biométrico.',
      evidences: [],
    },
    {
      id: 'op.acc.6.r5.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Registro de accesos con éxito y fallidos (R5)',
      description:
        'Se registrarán los accesos con éxito y los fallidos.',
      evidences: ['EV-01'],
    },
    {
      id: 'op.acc.6.r5.2',
      level: ['MEDIO', 'ALTO'],
      title: 'Aviso del último acceso efectuado (R5)',
      description:
        'Se informará al usuario del último acceso efectuado con su identidad.',
      evidences: [],
    },
    {
      id: 'op.acc.6.r6.1',
      level: ['ALTO'],
      title: 'Reautenticación en operaciones críticas (R6)',
      description:
        'Se definirán aquellos puntos en los que el sistema requerirá una renovación de la autenticación del usuario, mediante identificación singular, no bastando con la sesión establecida.',
      evidences: ['EV-09'],
      active: false,
    },
    {
      id: 'op.acc.6.r7.1',
      level: ['ALTO'],
      title: 'Suspensión por no utilización (R7)',
      description:
        'Las credenciales se suspenderán tras un periodo definido de no utilización.',
      evidences: ['EV-10'],
      active: false,
    },
    {
      id: 'op.acc.6.r8.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Doble factor desde zona no controlada (R8)',
      description:
        'Para el acceso desde o a través de zonas no controladas se requerirá un doble factor de autenticación: R2, R3 o R4.',
      evidences: ['EV-02'],
    },
    {
      id: 'op.acc.6.r9.1',
      level: ['ALTO'],
      title: 'Aplicación de la ITS de interconexión (R9)',
      description:
        'Será de aplicación la ITS de Interconexión de sistemas de información.',
      evidences: [],
      active: false,
    },
    {
      id: 'op.acc.6.r9.2',
      level: ['ALTO'],
      title: 'Acceso remoto autorizado, cifrado y auditado (R9)',
      description:
        'El acceso remoto deberá considerar los siguientes aspectos: a) Ser autorizado por la autoridad correspondiente. b) El tráfico deberá ser cifrado. c) Si la utilización no se produce de manera constante, el acceso remoto deberá encontrarse inhabilitado y habilitarse únicamente cuando sea necesario. d) Deberán recogerse registros de auditoría de este tipo de conexiones.',
      evidences: ['EV-07', 'EV-08'],
      active: false,
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.acc.6.r5.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Registro de accesos con éxito y fallidos',
      description:
        'Ingesta de todos los eventos de autenticación del personal de la organización desde el directorio corporativo declarado en P-03. Es la evidencia central del Refuerzo R5 (obligatorio desde MEDIO) y la base de casi todas las demás detecciones del control.',
      format: 'json_line',
      events: ['evidence_state', 'authentication_success', 'authentication_failure'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.acc.6.r1.1', 'op.acc.6.r8.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación del doble factor en accesos desde zona no controlada',
      description:
        'Clasificación de cada autenticación según la IP de origen contra los rangos de zona controlada (P-02), y verificación de que las procedentes de zona no controlada llevan segundo factor. Es la evidencia del Refuerzo R8, obligatorio desde nivel BAJO.',
      format: 'json_line',
      events: ['evidence_state', 'mfa_used'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['op.acc.6.8'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Límite de intentos y bloqueo efectivo de cuenta',
      description:
        'Detección de cuentas que acumulan más de P-05 intentos fallidos sin que se registre el bloqueo, evidenciando que el límite exigido por op.acc.6.8 está declarado pero no es operativo.',
      format: 'json_line',
      events: ['evidence_state', 'account_locked'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['op.acc.6.8'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ataques de fuerza bruta, password spraying y Kerberoasting',
      description:
        'Identificación de patrones de ataque contra las credenciales corporativas: fallos masivos contra una cuenta, un mismo intento contra muchas cuentas (password spraying), o solicitudes anómalas de tickets de servicio Kerberos. Es el riesgo que op.acc.6.8 pretende mitigar.',
      format: 'json_line',
      events: ['evidence_state', 'authentication_attack_pattern'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['op.acc.6.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Antigüedad de credenciales y política de cambio',
      description:
        'Cálculo de la antigüedad de la credencial de cada usuario activo frente a la periodicidad P-04, y verificación de que la política del dominio impone efectivamente ese máximo.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'credential_age_checked'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.acc.6.5', 'op.acc.6.6'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Reacción ante compromiso y baja de personal',
      description:
        'Medición del intervalo entre el evento de notificación de compromiso de credencial, o de baja del usuario, y la inhabilitación efectiva de su cuenta. Contraste con el plazo máximo P-06.',
      format: 'json_line',
      events: ['evidence_state', 'credential_disabled', 'compromise_reported', 'offboarding_reported'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.acc.6.r9.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Acceso remoto: canal, cifrado y autorización',
      description:
        'Registro de todas las conexiones remotas del personal con identificación del canal empleado, si el tráfico va cifrado, la IP de origen y el usuario. Contraste contra los canales autorizados de P-07. Cubre los apartados a), b) y d) de op.acc.6.r9.2.',
      format: 'json_line',
      events: ['evidence_state', 'remote_access_connection'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.acc.6.r9.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Canales de acceso remoto habilitados sin uso constante',
      description:
        'Detección de canales de acceso remoto declarados en P-07 como de uso no constante que permanecen permanentemente habilitados. El apartado c) de op.acc.6.r9.2 exige que estén inhabilitados y se habiliten únicamente cuando sea necesario.',
      format: 'json_line',
      events: ['evidence_state', 'remote_channel_listening'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['op.acc.6.r6.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Renovación de autenticación en puntos críticos (R6)',
      description:
        'Verificación de que las operaciones declaradas en P-08 van precedidas de un evento de reautenticación singular y no se amparan únicamente en la sesión ya establecida. Obligatorio en nivel ALTO.',
      format: 'json_line',
      events: ['evidence_state', 'critical_operation_executed', 'reauthentication_performed'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-10',
      requirement: ['op.acc.6.r7.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Credenciales activas sin utilización prolongada (R7)',
      description:
        'Identificación de cuentas que permanecen habilitadas pese a no haberse utilizado durante más días de los definidos en P-09. Obligatorio en nivel ALTO y, en la práctica, una de las comprobaciones que más hallazgos produce en cualquier organización.',
      format: 'json_line',
      events: ['evidence_state', 'account_inactivity_checked'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-11',
      requirement: ['op.acc.6.r1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Complejidad y robustez de las contraseñas (R1)',
      description:
        'Verificación de que la política de contraseñas configurada en el dominio o en los sistemas cumple los requisitos de complejidad mínima y robustez frente a adivinación declarados en P-10, conforme a las guías CCN-STIC que el propio ENS señala como referencia.',
      format: 'sca_or_json_line',
      events: ['evidence_state', 'password_policy_checked'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-12',
      requirement: ['op.acc.6.7'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Información revelada en el proceso de autenticación',
      description:
        'Detección de respuestas del sistema que revelan información en los rechazos de autenticación: mensajes que distinguen usuario inexistente de credencial incorrecta, o banners que exponen tecnología y versión. Vulnera op.acc.6.7.',
      format: 'json_line',
      events: ['evidence_state', 'auth_rejection_message'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'refuerzo_autenticacion_elegido',
      description:
        'Mecanismo de autenticación implementado para el personal de la organización. A diferencia de op.acc.5, R1 (contraseña) es admisible en los tres niveles, pero solo para accesos desde zona controlada.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r1 a', 'op.acc.6.r4'],
      type: 'select',
      usage:
        'Activa el conjunto de reglas correspondiente.',
      missingBehavior:
        'El control es NO EVALUABLE. Sin saber qué mecanismo se usa no se puede verificar ninguna condición.',
    },
    {
      id: 'P-02',
      name: 'definicion_zonas_controladas',
      description:
        'Delimitación de qué redes, ubicaciones y rangos de direcciones se consideran zona controlada según la definición del ENS: no de acceso público y con autenticación física previa del usuario ante el equipo. Todo lo demás es zona no controlada y activa la exigencia de R8.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r8.1', 'op.acc.6.r1.1'],
      type: 'list',
      usage:
        'Es el parámetro más crítico del control. Sin P-02, R8 no es verificable.',
      missingBehavior:
        'R8 NO EVALUABLE, y R8 es obligatorio desde nivel BAJO. El control queda en GRIS aunque todo lo demás esté bien.',
    },
    {
      id: 'P-03',
      name: 'fuente_directorio_corporativo',
      description:
        'Directorio de identidades del personal de la organización y su fuente de eventos de autenticación. Debe ser coherente con el parámetro equivalente de op.acc.1.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r5.1', 'op.acc.6.8'],
      type: 'select',
      usage:
        'Determina qué integración activa Wazuh: colector de eventos de Windows en los controladores de dominio, auditd en Linux, o conector de Azure AD. Es la fuente de EV-01 y de casi todas las demás evidencias.',
      missingBehavior:
        'No hay ingesta de eventos de autenticación corporativa. Todas las evidencias quedan sin fuente.',
    },
    {
      id: 'P-04',
      name: 'periodicidad_cambio_credenciales_dias',
      description:
        'Cada cuántos días deben cambiarse las credenciales del personal. El ENS remite expresamente a la política de seguridad de la organización (op.acc.6.4), no fija plazo.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.4'],
      type: 'duration_days',
      usage:
        'ENSFácil consulta el atributo pwdLastSet en AD (o equivalente) y calcula la antigüedad de cada credencial. Superar P-04 → alerta. SCA verifica además que la política de dominio fija ese máximo.',
      missingBehavior:
        'No se puede verificar op.acc.6.4 ni que la política de dominio esté alineada con la normativa interna.',
    },
    {
      id: 'P-05',
      name: 'max_intentos_fallidos',
      description:
        'Número máximo de intentos fallidos consecutivos antes del bloqueo de cuenta. El ENS exige que el número sea limitado (op.acc.6.8) pero deja la cifra a la organización.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.8'],
      type: 'number',
      usage:
        'SCA verifica que la política de bloqueo de cuentas del dominio está configurada con este umbral. Las reglas de correlación alertan si se superan P-05 intentos sin que se registre el bloqueo (EventID 4740).',
      missingBehavior:
        'No se puede verificar op.acc.6.8. No se distingue un ataque de un bloqueo funcionando correctamente.',
    },
    {
      id: 'P-06',
      name: 'plazo_max_inhabilitar_credencial_horas',
      description:
        'Tiempo máximo admitido entre que consta o se sospecha el compromiso de una credencial (o el usuario termina su relación con el sistema) y su inhabilitación efectiva.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.5', 'op.acc.6.6'],
      type: 'duration_hours',
      usage:
        'Correlación entre el evento de notificación de compromiso o de baja de RRHH y el EventID 4725 (cuenta deshabilitada). Intervalo superior a P-06 → alerta. Coherente con op.acc.1 P-05.',
      missingBehavior:
        'No se puede medir la reacción ante compromiso ni ante baja de personal.',
    },
    {
      id: 'P-07',
      name: 'canales_acceso_remoto',
      description:
        'Canales autorizados de acceso remoto, con indicación de si el tráfico va cifrado, quién autoriza cada acceso y si el canal debe permanecer deshabilitado cuando no se usa. R9 es obligatorio en los tres niveles.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r9.2'],
      type: 'table',
      usage:
        'ENSFácil verifica: que el tráfico va cifrado (EV-07), que existe autorización para cada usuario, que los canales de uso no constante no están permanentemente habilitados (EV-08), y que hay registro de auditoría.',
      missingBehavior:
        'R9 NO EVALUABLE, y es obligatorio desde nivel BAJO. Los cuatro apartados de op.acc.6.r9.2 quedan sin verificar.',
    },
    {
      id: 'P-08',
      name: 'puntos_renovacion_autenticacion',
      description:
        'Puntos del sistema en los que debe exigirse una nueva autenticación singular sin que baste la sesión establecida: acceso a datos especialmente protegidos, operaciones administrativas, firma de actos administrativos. Obligatorio en nivel ALTO.',
      level: ['ALTO'],
      requirements: ['op.acc.6.r6.1'],
      type: 'list',
      usage:
        'ENSFácil verifica en los logs que las operaciones declaradas van precedidas de un evento de reautenticación propio, y no solo de la sesión inicial. Operación sin reautenticación → alerta.',
      missingBehavior:
        'R6 NO EVALUABLE. En nivel ALTO esto deja un refuerzo obligatorio sin acreditar.',
    },
    {
      id: 'P-09',
      name: 'periodo_no_utilizacion_dias',
      description:
        'Días de inactividad tras los cuales una credencial debe suspenderse automáticamente. El ENS exige «un periodo definido» sin fijarlo (op.acc.6.r7.1). Obligatorio en nivel ALTO.',
      level: ['ALTO'],
      requirements: ['op.acc.6.r7.1'],
      type: 'duration_days',
      usage:
        'ENSFácil consulta lastLogonTimestamp en AD (o equivalente) y detecta cuentas activas cuyo último acceso supera P-09 sin haber sido suspendidas. Es una de las comprobaciones más productivas del control.',
      missingBehavior:
        'R7 NO EVALUABLE. Las cuentas dormidas permanecen activas sin detección, con el riesgo que ello supone.',
    },
    {
      id: 'P-10',
      name: 'politica_complejidad_contrasenas',
      description:
        'Requisitos de complejidad y robustez exigidos a las contraseñas cuando P-01 = R1 o R2: longitud mínima, conjuntos de caracteres, historial, y protección frente a contraseñas comprometidas conocidas.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r1.2'],
      type: 'string',
      usage:
        'SCA verifica la política de contraseñas del dominio o del sistema contra estos valores. Las guías CCN-STIC son la referencia que el propio ENS señala para fijarlos.',
      missingBehavior:
        'No se puede verificar op.acc.6.r1.2. La robustez de las contraseñas queda sin acreditar.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la aceptación previa de la política, el acuse de recibo de las credenciales, la entrega bajo control exclusivo, el aviso del último acceso y la aplicación de la ITS de interconexión: nada de eso deja rastro en un log.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'authentication_success', 'authentication_failure', 'mfa_used', 'account_locked', 'authentication_attack_pattern', 'credential_age_checked', 'credential_disabled', 'compromise_reported', 'offboarding_reported', 'remote_access_connection', 'remote_channel_listening', 'critical_operation_executed', 'reauthentication_performed', 'account_inactivity_checked', 'password_policy_checked', 'auth_rejection_message'],
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
