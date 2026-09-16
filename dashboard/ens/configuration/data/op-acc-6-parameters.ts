import { ENSControlConfiguration } from '../types';

export const opAcc6Configuration: ENSControlConfiguration = {
  controlId: 'op.acc.6',
  controlName: 'Mecanismo de autenticación (usuarios de la organización)',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.acc.6',
      name: 'refuerzo_autenticacion_elegido',
      label: 'Refuerzo autenticacion elegido',
      description:
        'Mecanismo de autenticación implementado para el personal de la organización: R1 (contraseña, solo desde zona controlada), R2 (contraseña más otro factor), R3 (certificado cualificado) o R4 (certificado cualificado en soporte físico). El ENS exige UNO de los cuatro en todos los niveles, así que solo rigen los requisitos del refuerzo elegido; los otros tres no cuentan. La complejidad de contraseña (op.acc.6.r1.2) rige con R1 y con R2.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [
        'op.acc.6.r1.1',
        'op.acc.6.r1.2',
        'op.acc.6.r2.1',
        'op.acc.6.r3.1',
        'op.acc.6.r3.2',
        'op.acc.6.r4.1',
        'op.acc.6.r4.2',
      ],
      type: 'select',
      example: 'R2',
      options: ['R1', 'R2', 'R3', 'R4'],
      required: true,
      wazuhUsage:
        'No cambia lo que observa el agente: decide qué requisitos de refuerzo se evalúan.',
      ensfacilUsage:
        'Los requisitos de los refuerzos no elegidos salen del denominador como NO_APLICA. Con R1, el acceso con contraseña desde una red fuera de P-02 incumple op.acc.6.r1.1; con R2, todo acceso tiene que haber verificado dos factores.',
      evidenceIds: ['EV-02', 'EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'Ningún refuerzo de mecanismo se puede evaluar: sus siete requisitos quedan sin demostrar y cuentan en contra.',
    },
    {
      id: 'P-02',
      controlId: 'op.acc.6',
      name: 'definicion_zonas_controladas',
      label: 'Definicion zonas controladas',
      description:
        'Redes que son zona controlada según el ENS: no de acceso público y con autenticación física previa del usuario ante el equipo. Un elemento por línea: un rango CIDR (10.0.0.0/8, 192.168.10.0/24, fd00::/8), una dirección suelta, o la palabra local para la consola física de la máquina. Se puede añadir un comentario detrás del rango, separado por un espacio. Todo lo que no figure aquí es zona no controlada y exige doble factor (R8).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r8.1', 'op.acc.6.r1.1', 'op.acc.6.r2.1'],
      type: 'list',
      example: '192.168.10.0/24 red de la sede',
      required: true,
      wazuhUsage:
        'El agente emite la dirección de origen de cada acceso y las direcciones en las que escucha cada canal de autenticación, sin clasificarlas.',
      ensfacilUsage:
        'Es el parámetro más crítico del control. ENSFácil clasifica cada acceso por su origen y cada canal por las direcciones en que escucha: un acceso desde fuera de estos rangos con un solo factor, o un canal expuesto fuera de ellos que admite un solo factor, incumple R8.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'R8 no se puede evaluar, y R8 es obligatorio desde nivel BAJO: queda sin demostrar y cuenta en contra.',
    },
    {
      id: 'P-03',
      controlId: 'op.acc.6',
      name: 'fuente_directorio_corporativo',
      label: 'Fuente directorio corporativo',
      description:
        'Fuentes de identidad cuyos accesos tienen que quedar registrados: local (cuentas del sistema, log de autenticación), ldap (binds del directorio), active_directory o azure_ad. Una por línea. Debe ser coherente con el parámetro equivalente de op.acc.1.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r5.1'],
      type: 'list',
      example: 'local',
      columns: [
        {
          name: 'fuente',
          label: 'Fuente',
          type: 'select',
          required: true,
          options: ['local', 'ldap', 'active_directory', 'azure_ad'],
        },
      ],
      required: true,
      wazuhUsage:
        'El agente emite un hueco de registro cuando una fuente no existe, no ha registrado nunca nada o su configuración no registra éxitos o fallos (LogLevel de sshd, olcLogLevel de slapd).',
      ensfacilUsage:
        'Un hueco de registro en una fuente declarada aquí incumple op.acc.6.r5.1.',
      evidenceIds: ['EV-01'],
      ruleIds: [],
      ifNotConfigured:
        'No se sabe qué fuentes tienen que registrar los accesos: op.acc.6.r5.1 queda sin demostrar.',
    },
    {
      id: 'P-04',
      controlId: 'op.acc.6',
      name: 'periodicidad_cambio_credenciales_dias',
      label: 'Periodicidad cambio credenciales dias',
      description:
        'Cada cuántos días deben cambiarse las credenciales del personal. El ENS remite a la política de seguridad de la organización (op.acc.6.4) y no fija plazo.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.4'],
      type: 'duration_days',
      example: '180',
      minValue: 1,
      required: true,
      wazuhUsage:
        'El agente emite, por credencial, su antigüedad en días (contraseña desde /etc/shadow; clave ssh desde la fecha de su fichero) y la caducidad que el sistema impone (99999 si ninguna).',
      ensfacilUsage:
        'Una credencial más antigua que este plazo, o una caducidad configurada mayor, incumple op.acc.6.4.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'op.acc.6.4 queda sin demostrar.',
    },
    {
      id: 'P-05',
      controlId: 'op.acc.6',
      name: 'max_intentos_fallidos',
      label: 'Max intentos fallidos',
      description:
        'Número máximo de intentos fallidos antes del bloqueo de la cuenta. El ENS exige que el número sea limitado y que reactivar la cuenta requiera una intervención específica (op.acc.6.8).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.8'],
      type: 'number',
      example: '5',
      minValue: 1,
      required: true,
      wazuhUsage:
        'El agente emite la configuración de bloqueo de cada camino de autenticación con contraseña (pam_faillock, pam_tally2, ppolicy) y los fallos y bloqueos que registra el log.',
      ensfacilUsage:
        'Incumple op.acc.6.8 un camino en uso sin bloqueo, con un umbral mayor que este valor o con desbloqueo automático, y una cuenta existente con más fallos que este valor en una pasada sin bloqueo registrado.',
      evidenceIds: ['EV-03', 'EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'op.acc.6.8 queda sin demostrar.',
    },
    {
      id: 'P-06',
      controlId: 'op.acc.6',
      name: 'plazo_max_inhabilitar_credencial_horas',
      label: 'Plazo max inhabilitar credencial horas',
      description:
        'Tiempo máximo admitido entre que consta o se sospecha el compromiso de una credencial (o el usuario termina su relación con el sistema) y su inhabilitación efectiva.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.5', 'op.acc.6.6'],
      type: 'duration_hours',
      example: '24',
      minValue: 1,
      required: true,
      wazuhUsage:
        'La organización anota cada notificación de compromiso o baja en el registro del agente; el agente emite las horas hasta que observa la cuenta inhabilitada, o las que lleva habilitada.',
      ensfacilUsage:
        'Una inhabilitación que tarda más que este plazo, o una cuenta que lo supera sin inhabilitar, incumple op.acc.6.5 y op.acc.6.6.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'op.acc.6.5 y op.acc.6.6 quedan sin demostrar.',
    },
    {
      id: 'P-07',
      controlId: 'op.acc.6',
      name: 'canales_acceso_remoto',
      label: 'Canales acceso remoto',
      description:
        'Canales de acceso remoto autorizados, uno por fila: canal (ssh, ldap, ldaps, rdp, vnc, tailscale, openvpn…, como lo nombra el agente), si su tráfico va cifrado (si/no), quién lo autoriza y si su uso es constante (si: puede estar habilitado siempre; no: debe estar inhabilitado y habilitarse solo cuando haga falta). R9 es obligatorio en los tres niveles.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r9.2'],
      type: 'table',
      example: 'ssh | si | Responsable de Seguridad | si',
      columns: [
        {
          name: 'canal',
          label: 'Canal',
          type: 'identifier',
          required: true,
        },
        {
          name: 'cifrado',
          label: 'Cifrado',
          type: 'select',
          required: true,
          options: ['si', 'no'],
        },
        {
          name: 'autoriza',
          label: 'Autoriza',
          type: 'string',
          required: true,
        },
        {
          name: 'uso_constante',
          label: 'Uso constante',
          type: 'select',
          required: true,
          options: ['si', 'no'],
        },
      ],
      required: true,
      wazuhUsage:
        'El agente emite cada canal en escucha (con su cifrado observado y si arranca siempre) y cada acceso con su canal.',
      ensfacilUsage:
        'Incumple op.acc.6.r9.2 un acceso por un canal que no figura aquí, un canal en escucha cuyo cifrado no coincide con su fila, o uno que arranca siempre y su fila dice uso no constante. Un canal en escucha sin fila no está decidido y tampoco se da por bueno.',
      evidenceIds: ['EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'R9 no se puede evaluar, y es obligatorio desde nivel BAJO: op.acc.6.r9.2 queda sin demostrar.',
    },
    {
      id: 'P-08',
      controlId: 'op.acc.6',
      name: 'puntos_renovacion_autenticacion',
      label: 'Puntos renovacion autenticacion',
      description:
        'Puntos del sistema en los que se exige renovar la autenticación sin que baste la sesión establecida, uno por línea, con el nombre que usa el agente: sudo (elevación de privilegios), su. Obligatorio en nivel ALTO.',
      levels: ['ALTO'],
      requirements: ['op.acc.6.r6.1'],
      type: 'list',
      example: 'sudo',
      required: true,
      wazuhUsage:
        'El agente emite cada configuración que permite ejecutar un punto sin volver a autenticarse (sudo NOPASSWD o !authenticate, credencial de sudo sin caducidad, su con pam_wheel trust).',
      ensfacilUsage:
        'Un punto declarado aquí que se puede ejecutar sin reautenticación incumple op.acc.6.r6.1.',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'R6 queda sin demostrar, y en nivel ALTO es obligatorio.',
    },
    {
      id: 'P-09',
      controlId: 'op.acc.6',
      name: 'periodo_no_utilizacion_dias',
      label: 'Periodo no utilizacion dias',
      description:
        'Días de inactividad tras los cuales una credencial debe estar suspendida. El ENS exige «un periodo definido» sin fijarlo (op.acc.6.r7.1). Obligatorio en nivel ALTO.',
      levels: ['ALTO'],
      requirements: ['op.acc.6.r7.1'],
      type: 'duration_days',
      example: '45',
      minValue: 1,
      required: true,
      wazuhUsage:
        'El agente emite, por cada cuenta habilitada, los días desde su último acceso (lastlog, wtmp y los accesos que él mismo anota del log de autenticación).',
      ensfacilUsage:
        'Una cuenta habilitada con más días de inactividad que este valor incumple op.acc.6.r7.1.',
      evidenceIds: ['EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'R7 queda sin demostrar, y en nivel ALTO es obligatorio.',
    },
    {
      id: 'P-10',
      controlId: 'op.acc.6',
      name: 'politica_complejidad_contrasenas',
      label: 'Politica complejidad contrasenas',
      description:
        'Mínimos de robustez de las contraseñas cuando P-01 es R1 o R2, uno por fila: criterio y valor mínimo. Criterios: longitud_minima (caracteres), clases_de_caracteres (0 a 4), historial (contraseñas anteriores que no se pueden repetir) y lista_de_bloqueo (1 si se exige comprobar contra un diccionario de contraseñas comprometidas). Referencia: guías CCN-STIC.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.r1.2'],
      type: 'table',
      example: 'longitud_minima | 12',
      columns: [
        {
          name: 'criterio',
          label: 'Criterio',
          type: 'select',
          required: true,
          options: [
            'longitud_minima',
            'clases_de_caracteres',
            'historial',
            'lista_de_bloqueo',
          ],
        },
        {
          name: 'minimo',
          label: 'Mínimo',
          type: 'number',
          required: true,
        },
      ],
      // No es obligatorio para el CONTROL: solo rige con R1 o R2, y exigirlo
      // con R3 bloquearía la evaluación entera por un requisito que no aplica.
      // Con R1 o R2 y sin declarar, op.acc.6.r1.2 queda sin demostrar.
      required: false,
      wazuhUsage:
        'El agente emite lo que la pila password de PAM impone (pam_pwquality, pam_cracklib, pam_unix, pam_pwhistory) y, en un directorio, su política de contraseñas.',
      ensfacilUsage:
        'Una medida observada por debajo del mínimo de su fila incumple op.acc.6.r1.2.',
      evidenceIds: ['EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'Con R1 o R2, op.acc.6.r1.2 queda sin demostrar.',
    },
    {
      id: 'P-11',
      controlId: 'op.acc.6',
      name: 'exposiciones_autenticacion_admitidas',
      label: 'Exposiciones autenticacion admitidas',
      description:
        'Información que la organización admite que un servicio de autenticación muestre antes de validar credenciales, una por línea, con el nombre que usa el agente: sshd:version_software (el protocolo SSH obliga a enviarla), sshd:version_distribucion, sshd:version_addendum, sshd:banner_previo, slapd:rootdse_anonimo, slapd:bind_anonimo. Si no se admite ninguna, escribir ninguna.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.6.7'],
      type: 'list',
      example: 'sshd:version_software',
      required: true,
      wazuhUsage:
        'El agente emite cada dato que un servicio de autenticación expone antes de autenticar, leído de su configuración efectiva.',
      ensfacilUsage:
        'Una exposición observada que no figura aquí incumple op.acc.6.7.',
      evidenceIds: ['EV-12'],
      ruleIds: [],
      ifNotConfigured:
        'op.acc.6.7 queda sin demostrar.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.acc.6',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la aceptación previa de la política (op.acc.6.1), el acuse de recibo de las credenciales (op.acc.6.2), la entrega bajo control exclusivo (op.acc.6.3), la información de derechos tras el acceso (op.acc.6.9), el aviso del último acceso (op.acc.6.r5.2), la aplicación de la ITS de interconexión (op.acc.6.r9.1) y los certificados de R3 y R4: nada de eso deja rastro en un log.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.acc.6.1 | Política de seguridad aprobada | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        {
          name: 'requisito',
          label: 'Requisito',
          type: 'string',
          required: true,
        },
        {
          name: 'referencia',
          label: 'Referencia',
          type: 'string',
          required: false,
        },
        {
          name: 'enlace',
          label: 'Enlace',
          type: 'string',
          required: false,
        },
        {
          name: 'fecha',
          label: 'Fecha',
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
      required: true,
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
