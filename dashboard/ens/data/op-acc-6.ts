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
      evidences: ['EV-02'],
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
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Aplicación de la ITS de interconexión (R9)',
      description:
        'Será de aplicación la ITS de Interconexión de sistemas de información.',
      evidences: [],
    },
    {
      id: 'op.acc.6.r9.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Acceso remoto autorizado, cifrado y auditado (R9)',
      description:
        'El acceso remoto deberá considerar los siguientes aspectos: a) Ser autorizado por la autoridad correspondiente. b) El tráfico deberá ser cifrado. c) Si la utilización no se produce de manera constante, el acceso remoto deberá encontrarse inhabilitado y habilitarse únicamente cuando sea necesario. d) Deberán recogerse registros de auditoría de este tipo de conexiones.',
      evidences: ['EV-07', 'EV-08'],
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
      events: ['evidence_state', 'auth_logging_gap', 'authentication_success', 'authentication_failure'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.acc.6.r1.1', 'op.acc.6.r2.1', 'op.acc.6.r8.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación del doble factor en accesos desde zona no controlada',
      description:
        'Clasificación de cada autenticación según la IP de origen contra los rangos de zona controlada (P-02), y verificación de que las procedentes de zona no controlada llevan segundo factor. Es la evidencia del Refuerzo R8, obligatorio desde nivel BAJO.',
      format: 'json_line',
      events: ['evidence_state', 'authentication_success', 'remote_channel_listening'],
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
      events: ['evidence_state', 'lockout_policy_checked', 'account_locked'],
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
      events: ['evidence_state', 'authentication_failure', 'account_locked'],
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
      events: ['evidence_state', 'credential_disable_checked'],
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
      events: ['evidence_state', 'authentication_success'],
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
      events: ['evidence_state', 'reauthentication_not_required'],
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
      events: ['evidence_state', 'auth_disclosure_observed'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'refuerzo_autenticacion_elegido',
      description:
        'Mecanismo de autenticación implementado para el personal de la organización: R1 (contraseña, solo desde zona controlada), R2 (contraseña más otro factor), R3 (certificado cualificado) o R4 (certificado cualificado en soporte físico). El ENS exige UNO de los cuatro en todos los niveles, así que solo rigen los requisitos del refuerzo elegido; los otros tres no cuentan. La complejidad de contraseña (op.acc.6.r1.2) rige con R1 y con R2.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r1.1', 'op.acc.6.r1.2', 'op.acc.6.r2.1', 'op.acc.6.r3.1', 'op.acc.6.r3.2', 'op.acc.6.r4.1', 'op.acc.6.r4.2'],
      type: 'select',
      usage:
        'Los requisitos de los refuerzos no elegidos salen del denominador como NO_APLICA. Con R1, el acceso con contraseña desde una red fuera de P-02 incumple op.acc.6.r1.1; con R2, todo acceso tiene que haber verificado dos factores.',
      missingBehavior:
        'Ningún refuerzo de mecanismo se puede evaluar: sus siete requisitos quedan sin demostrar y cuentan en contra.',
    },
    {
      id: 'P-02',
      name: 'definicion_zonas_controladas',
      description:
        'Redes que son zona controlada según el ENS: no de acceso público y con autenticación física previa del usuario ante el equipo. Un elemento por línea: un rango CIDR (10.0.0.0/8, 192.168.10.0/24, fd00::/8), una dirección suelta, o la palabra local para la consola física de la máquina. Se puede añadir un comentario detrás del rango, separado por un espacio. Todo lo que no figure aquí es zona no controlada y exige doble factor (R8).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r8.1', 'op.acc.6.r1.1', 'op.acc.6.r2.1'],
      type: 'list',
      usage:
        'Es el parámetro más crítico del control. ENSFácil clasifica cada acceso por su origen y cada canal por las direcciones en que escucha: un acceso desde fuera de estos rangos con un solo factor, o un canal expuesto fuera de ellos que admite un solo factor, incumple R8.',
      missingBehavior:
        'R8 no se puede evaluar, y R8 es obligatorio desde nivel BAJO: queda sin demostrar y cuenta en contra.',
    },
    {
      id: 'P-03',
      name: 'fuente_directorio_corporativo',
      description:
        'Fuentes de identidad cuyos accesos tienen que quedar registrados: local (cuentas del sistema, log de autenticación), ldap (binds del directorio), active_directory o azure_ad. Una por línea. Debe ser coherente con el parámetro equivalente de op.acc.1.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r5.1'],
      type: 'list',
      usage:
        'Un hueco de registro en una fuente declarada aquí incumple op.acc.6.r5.1.',
      missingBehavior:
        'No se sabe qué fuentes tienen que registrar los accesos: op.acc.6.r5.1 queda sin demostrar.',
    },
    {
      id: 'P-04',
      name: 'periodicidad_cambio_credenciales_dias',
      description:
        'Cada cuántos días deben cambiarse las credenciales del personal. El ENS remite a la política de seguridad de la organización (op.acc.6.4) y no fija plazo.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.4'],
      type: 'duration_days',
      usage:
        'Una credencial más antigua que este plazo, o una caducidad configurada mayor, incumple op.acc.6.4.',
      missingBehavior:
        'op.acc.6.4 queda sin demostrar.',
    },
    {
      id: 'P-05',
      name: 'max_intentos_fallidos',
      description:
        'Número máximo de intentos fallidos antes del bloqueo de la cuenta. El ENS exige que el número sea limitado y que reactivar la cuenta requiera una intervención específica (op.acc.6.8).',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.8'],
      type: 'number',
      usage:
        'Incumple op.acc.6.8 un camino en uso sin bloqueo, con un umbral mayor que este valor o con desbloqueo automático, y una cuenta existente con más fallos que este valor en una pasada sin bloqueo registrado.',
      missingBehavior:
        'op.acc.6.8 queda sin demostrar.',
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
        'Una inhabilitación que tarda más que este plazo, o una cuenta que lo supera sin inhabilitar, incumple op.acc.6.5 y op.acc.6.6.',
      missingBehavior:
        'op.acc.6.5 y op.acc.6.6 quedan sin demostrar.',
    },
    {
      id: 'P-07',
      name: 'canales_acceso_remoto',
      description:
        'Canales de acceso remoto autorizados, uno por fila: canal (ssh, ldap, ldaps, rdp, vnc, tailscale, openvpn…, como lo nombra el agente), si su tráfico va cifrado (si/no), quién lo autoriza y si su uso es constante (si: puede estar habilitado siempre; no: debe estar inhabilitado y habilitarse solo cuando haga falta). R9 es obligatorio en los tres niveles.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r9.2'],
      type: 'table',
      usage:
        'Incumple op.acc.6.r9.2 un acceso por un canal que no figura aquí, un canal en escucha cuyo cifrado no coincide con su fila, o uno que arranca siempre y su fila dice uso no constante. Un canal en escucha sin fila no está decidido y tampoco se da por bueno.',
      missingBehavior:
        'R9 no se puede evaluar, y es obligatorio desde nivel BAJO: op.acc.6.r9.2 queda sin demostrar.',
    },
    {
      id: 'P-08',
      name: 'puntos_renovacion_autenticacion',
      description:
        'Puntos del sistema en los que se exige renovar la autenticación sin que baste la sesión establecida, uno por línea, con el nombre que usa el agente: sudo (elevación de privilegios), su. Obligatorio en nivel ALTO.',
      level: ['ALTO'],
      requirements: ['op.acc.6.r6.1'],
      type: 'list',
      usage:
        'Un punto declarado aquí que se puede ejecutar sin reautenticación incumple op.acc.6.r6.1.',
      missingBehavior:
        'R6 queda sin demostrar, y en nivel ALTO es obligatorio.',
    },
    {
      id: 'P-09',
      name: 'periodo_no_utilizacion_dias',
      description:
        'Días de inactividad tras los cuales una credencial debe estar suspendida. El ENS exige «un periodo definido» sin fijarlo (op.acc.6.r7.1). Obligatorio en nivel ALTO.',
      level: ['ALTO'],
      requirements: ['op.acc.6.r7.1'],
      type: 'duration_days',
      usage:
        'Una cuenta habilitada con más días de inactividad que este valor incumple op.acc.6.r7.1.',
      missingBehavior:
        'R7 queda sin demostrar, y en nivel ALTO es obligatorio.',
    },
    {
      id: 'P-10',
      name: 'politica_complejidad_contrasenas',
      description:
        'Mínimos de robustez de las contraseñas cuando P-01 es R1 o R2, uno por fila: criterio y valor mínimo. Criterios: longitud_minima (caracteres), clases_de_caracteres (0 a 4), historial (contraseñas anteriores que no se pueden repetir) y lista_de_bloqueo (1 si se exige comprobar contra un diccionario de contraseñas comprometidas). Referencia: guías CCN-STIC.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r1.2'],
      type: 'table',
      usage:
        'Una medida observada por debajo del mínimo de su fila incumple op.acc.6.r1.2.',
      missingBehavior:
        'Con R1 o R2, op.acc.6.r1.2 queda sin demostrar.',
    },
    {
      id: 'P-11',
      name: 'exposiciones_autenticacion_admitidas',
      description:
        'Información que la organización admite que un servicio de autenticación muestre antes de validar credenciales, una por línea, con el nombre que usa el agente: sshd:version_software (el protocolo SSH obliga a enviarla), sshd:version_distribucion, sshd:version_addendum, sshd:banner_previo, slapd:rootdse_anonimo, slapd:bind_anonimo. Si no se admite ninguna, escribir ninguna.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.7'],
      type: 'list',
      usage:
        'Una exposición observada que no figura aquí incumple op.acc.6.7.',
      missingBehavior:
        'op.acc.6.7 queda sin demostrar.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la aceptación previa de la política (op.acc.6.1), el acuse de recibo de las credenciales (op.acc.6.2), la entrega bajo control exclusivo (op.acc.6.3), la información de derechos tras el acceso (op.acc.6.9), el aviso del último acceso (op.acc.6.r5.2), la aplicación de la ITS de interconexión (op.acc.6.r9.1) y los certificados de R3 y R4: nada de eso deja rastro en un log.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'authentication_success', 'authentication_failure', 'account_locked', 'lockout_policy_checked', 'auth_logging_gap', 'credential_age_checked', 'credential_disable_checked', 'remote_channel_listening', 'reauthentication_not_required', 'account_inactivity_checked', 'password_policy_checked', 'auth_disclosure_observed', 'collector_run'],
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
