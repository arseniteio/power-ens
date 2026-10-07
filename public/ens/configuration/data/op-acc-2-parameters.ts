import { ENSControlConfiguration } from '../types';

export const opAcc2Configuration: ENSControlConfiguration = {
  controlId: 'op.acc.2',
  controlName: 'Requisitos de acceso',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.acc.2',
      name: 'sistemas_en_scope',
      label: 'Sistemas incluidos en el alcance',
      description:
        'Lista de sistemas (hostname/IP y SO) sobre los que ENSFácil debe verificar el cumplimiento de op.acc.2.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.1', 'op.acc.2.3'],
      type: 'list',
      example: 'srv01 | Linux',
      required: true,
      wazuhUsage:
        'Define en qué sistemas se ejecutan las comprobaciones SCA, FIM y log collection.',
      ensfacilUsage:
        'Delimita el alcance real auditado del control de acceso.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03'],
      // Hueco de trazabilidad: ninguna regla detecta un sistema del alcance que
      // deja de enviar eventos.
      ruleIds: [],
      ifNotConfigured:
        'Control marcado como NO EVALUABLE. Sin scope definido no se puede emitir semáforo.',
    },
    {
      id: 'P-02',
      controlId: 'op.acc.2',
      name: 'rutas_criticas_so',
      label: 'Rutas críticas del sistema operativo',
      description:
        'Rutas de ficheros y directorios del SO consideradas críticas que deben estar bajo control de acceso estricto y monitorizadas por FIM. Una ruta por entrada: /etc/passwd, /etc/shadow, /etc/sudoers, /etc/ssh/sshd_config.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.3'],
      // La ficha define una lista de rutas criticas (la regla 106923 cubre
      // cinco): `list`, no `path`, que designa una ruta unica. El ejemplo es UNA
      // ruta porque el formulario guarda un elemento por entrada; las demas van
      // en la descripcion.
      type: 'list',
      example: '/etc/passwd',
      // La forma del elemento: una RUTA, no un nombre suelto. Antes de
      // declararla, un `passwd` a secas se daba por bueno y FIM no vigilaba
      // nada.
      columns: [
        {
          name: 'ruta',
          label: 'Ruta crítica',
          type: 'path',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'Se configura en el módulo FIM de Wazuh como rutas a monitorizar. Cualquier cambio genera alerta.',
      ensfacilUsage:
        'Permite evidenciar la integridad de los componentes del sistema operativo.',
      evidenceIds: ['EV-02'],
      ruleIds: ['106920', '106921', '106922'],
      ifNotConfigured:
        'EV-02 (FIM sobre SO) desactivado. op.acc.2.3 NO EVALUABLE automáticamente.',
    },
    {
      id: 'P-03',
      controlId: 'op.acc.2',
      name: 'permisos_world_writable_permitidos',
      label: 'World-writable permitidos',
      description:
        'Indica si se permiten ficheros o directorios con permisos de escritura para todos (world-writable). Si no, cualquier world-writable es incumplimiento. Valores admitidos: sí o no; las excepciones concretas (/tmp, /var/tmp) se cargan como whitelist en Wazuh, no en este campo.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.1'],
      type: 'boolean',
      example: 'no',
      required: true,
      wazuhUsage:
        'SCA verifica permisos. Si P-03 = no, cualquier world-writable genera alerta. Las excepciones se cargan como whitelist.',
      ensfacilUsage:
        'Permite distinguir world-writable de incumplimiento frente a los legítimos.',
      evidenceIds: ['EV-01'],
      ruleIds: ['106902'],
      ifNotConfigured:
        'No se puede distinguir qué world-writable files son incumplimiento y cuáles legítimos.',
    },
    {
      id: 'P-04',
      controlId: 'op.acc.2',
      name: 'politica_acceso_so_referencia',
      label: 'Referencia de la política de acceso',
      description:
        'Referencia a la política o normativa interna que establece los derechos de acceso a los recursos del sistema. Acredita op.acc.2.2.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.2'],
      type: 'string',
      example: 'Política de Control de Acceso v2.1, aprobada 01/01/2025',
      required: true,
      wazuhUsage:
        'Se incluye como referencia documental en el informe. Acredita respaldo normativo interno de los derechos de acceso.',
      ensfacilUsage:
        'Permite acreditar que los derechos de acceso siguen la decisión del responsable del recurso.',
      evidenceIds: ['EV-04'],
      // Hueco de trazabilidad: parámetro documental; ninguna alerta lo acredita.
      ruleIds: [],
      ifNotConfigured:
        'El informe no puede acreditar el cumplimiento de op.acc.2.2. Campo del informe vacío.',
    },
    {
      id: 'P-05',
      controlId: 'op.acc.2',
      name: 'modelo_privilegios',
      label: 'Modelo de privilegios',
      description:
        'Modelo de privilegios utilizado en el sistema. Exigido por R1. Si el modelo implantado no es ninguno de los de la lista (ABAC, por ejemplo), seleccione Otro y detállelo en la política referenciada en P-04.',
      levels: ['ALTO'],
      requirements: ['op.acc.2.r1.1', 'op.acc.2.r1.2'],
      type: 'select',
      example: 'RBAC sobre AD',
      options: [
        'RBAC sobre AD',
        'ACL granular por recurso',
        'Mínimo privilegio + sudo',
        'Otro',
      ],
      required: false,
      wazuhUsage:
        'ENSFácil verifica en logs y SCA que el modelo declarado se implementa. Detecta usuarios con privilegios de admin no justificados.',
      ensfacilUsage:
        'Permite verificar el refuerzo R1 (op.acc.2.r1.1) sobre el modelo de privilegios.',
      evidenceIds: ['EV-05'],
      ruleIds: ['106930', '106931'],
      ifNotConfigured:
        'R1 marcado como NO EVALUABLE. No se puede verificar op.acc.2.r1.1 ni op.acc.2.r1.2.',
    },
    {
      id: 'P-06',
      controlId: 'op.acc.2',
      name: 'tipos_acceso_permitidos_por_perfil',
      label: 'Tipos de acceso permitidos por perfil',
      description:
        'Tipos de acceso que cada perfil puede ejercer sobre cada recurso. Una fila por perfil y recurso. El perfil enlaza con la columna Perfil de P-09. El recurso tiene que ser una ruta absoluta, y es además la que se vigila con auditd: no se admiten /, /etc, /usr, /var, /var/log, /proc, /sys, /dev, /bin, /sbin, /lib ni /boot, porque vigilar cualquiera de ellas inunda el log de auditoría y tumba el servidor.',
      levels: ['ALTO'],
      requirements: ['op.acc.2.r1.2'],
      // Era `list` con el ejemplo 'ops -> lectura+escritura', que no es lo que
      // el agente lee: `opacc2-accesos.tsv` tiene TRES columnas. El valor
      // guardado no cambia de forma (sigue siendo `string[]`, una fila por
      // elemento), así que lo que hubiera en el índice se sigue viendo; lo que
      // cambia es que ahora se valida columna a columna, y una fila con el
      // formato viejo sale en rojo con el motivo en vez de darse por buena.
      type: 'table',
      example: 'ops | /srv/datos | lectura,escritura',
      columns: [
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          name: 'recurso',
          label: 'Recurso',
          type: 'path',
          required: true,
        },
        {
          name: 'tipos_permitidos',
          label: 'Tipos de acceso',
          type: 'multiselect',
          required: true,
          // El vocabulario ENS, cerrado: un 'todos' o un 'rw' no significan
          // nada para quien compara esto con un acceso real.
          options: [
            'lectura',
            'escritura',
            'ejecucion',
            'modificacion',
          ],
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil cruza los permisos de SCA (EV-01) y las ACLs reales contra esta tabla. Diferencias generan alerta.',
      ensfacilUsage:
        'Permite verificar si los privilegios detectados se corresponden con los autorizados (op.acc.2.r1.2).',
      evidenceIds: ['EV-04', 'EV-06'],
      ruleIds: ['106935', '106936'],
      ifNotConfigured:
        'No se puede verificar si los privilegios detectados se corresponden con los autorizados.',
    },
    {
      id: 'P-07',
      controlId: 'op.acc.2',
      name: 'umask_minimo',
      label: 'umask mínimo exigido',
      description:
        'Valor mínimo de umask exigido para la creación de ficheros. Garantiza que los nuevos ficheros no se crean con permisos abiertos por defecto. Tres o cuatro dígitos octales: 022 deja permisos 755/644 y 027 deja 750/640.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.1'],
      type: 'string',
      example: '027',
      required: true,
      wazuhUsage:
        'SCA verifica el umask en perfiles de usuario y /etc/profile. Si el umask real es más permisivo que P-07, genera alerta.',
      ensfacilUsage:
        'Permite verificar si la configuración de permisos por defecto es suficientemente restrictiva.',
      evidenceIds: ['EV-01'],
      ruleIds: ['106903', '106904'],
      ifNotConfigured:
        'No se puede verificar si la configuración de permisos por defecto es suficientemente restrictiva.',
    },
    // --- Política que vivía en ficheros de la máquina ------------------------
    //
    // P-08 a P-12 son lo que hasta ahora escribía el operador por SSH en
    // /etc/ensfacil (opacc2-acl.tsv, opacc2-privilegios.tsv, opacc2-suid.allow y
    // dos listas del .env). El auditor no las veía en ninguna pantalla, y son
    // literalmente las decisiones que op.acc.2 exige del responsable del
    // recurso. Ahora se declaran aquí.
    {
      id: 'P-08',
      controlId: 'op.acc.2',
      name: 'acl_declarada',
      label: 'Derechos de acceso declarados por recurso',
      description:
        'Derechos que el responsable del recurso decide para cada ruta protegida: una fila por recurso. El modo se compara como número octal, así que 750 y 0750 son el mismo. La ACL extendida se escribe con la sintaxis de setfacl (u:auditor:r-x). Propietario y ACL se pueden dejar vacíos cuando ese eje no se declara.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.2'],
      type: 'table',
      example: '/srv/datos | 750 | root:ops | u:auditor:r-x',
      columns: [
        {
          name: 'recurso',
          label: 'Recurso',
          type: 'path',
          required: true,
        },
        {
          name: 'modo',
          label: 'Modo',
          type: 'octal',
          required: true,
        },
        {
          name: 'propietario_grupo',
          label: 'Propietario:grupo',
          type: 'string',
          required: false,
        },
        {
          name: 'acl_esperada',
          label: 'ACL esperada',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Es la tabla contra la que se comparan las ACLs reales de cada recurso. Una diferencia genera acl_deviation.',
      ensfacilUsage:
        'Acredita que los derechos de acceso responden a una decisión escrita del responsable del recurso, que es literalmente lo que exige op.acc.2.2.',
      evidenceIds: ['EV-04'],
      ruleIds: ['106913', '106914'],
      ifNotConfigured:
        'EV-04 se publica NO_EVALUABLE, nunca CUMPLE: sin la decisión escrita no hay contra qué comparar las ACLs reales de la máquina.',
    },
    {
      id: 'P-09',
      controlId: 'op.acc.2',
      name: 'privilegios_declarados',
      label: 'Privilegios declarados por usuario',
      description:
        'Perfil y privilegios que el responsable concede a cada cuenta. El usuario se escribe tal y como aparece en /etc/passwd: la comparación es literal y distingue mayúsculas, porque un error de tecleo del administrador no puede pasar por una autorización válida. El perfil es la etiqueta que enlaza con P-06.',
      levels: ['ALTO'],
      requirements: ['op.acc.2.r1.1', 'op.acc.2.r1.2'],
      type: 'table',
      example: 'jgomez | admin | sudo:total',
      columns: [
        {
          name: 'usuario',
          label: 'Usuario',
          type: 'identifier',
          required: true,
        },
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          name: 'privilegios',
          label: 'Privilegios concedidos',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Se contrasta con la pertenencia real a grupos privilegiados y con el uso de sudo. Un usuario con más de lo declarado genera excessive_privilege.',
      ensfacilUsage:
        'Permite verificar el refuerzo R1: que los privilegios se mantienen individualmente y restringen el tipo de acceso.',
      evidenceIds: ['EV-05', 'EV-06'],
      ruleIds: ['106933'],
      ifNotConfigured:
        'EV-05 se publica NO_EVALUABLE, y EV-06 también: sin el perfil de cada usuario no se puede decidir si un acceso supera el tipo autorizado.',
    },
    {
      id: 'P-10',
      controlId: 'op.acc.2',
      name: 'suid_autorizados',
      label: 'Línea base de binarios SUID/SGID autorizados',
      description:
        'Rutas absolutas de los binarios con bit SUID o SGID que el responsable ha revisado y autoriza. Un nombre de binario sin ruta (sudo, passwd) no casa con nada y dejaría los ~25 SUID legítimos de un sistema limpio como no autorizados. No se siembra sola a propósito: sembrarla con lo que hay en la máquina declararía autorizada la puerta trasera de un sistema ya comprometido; la revisión ES el control.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.1', 'op.acc.2.3'],
      // Lista, no tabla: el elemento es UNA ruta. Se declara su forma para que
      // un 'sudo' sin ruta no pase por línea base válida.
      type: 'list',
      example: '/usr/bin/sudo',
      columns: [
        {
          name: 'ruta',
          label: 'Binario autorizado',
          type: 'path',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'Todo binario SUID/SGID encontrado fuera de esta lista se publica como suid_sgid no autorizado.',
      ensfacilUsage:
        'Permite distinguir un SUID legítimo revisado de uno que nadie ha autorizado, que es la única forma de que EV-07 signifique algo.',
      evidenceIds: ['EV-07'],
      ruleIds: ['106925', '106926'],
      ifNotConfigured:
        'EV-07 se publica NO_EVALUABLE, nunca CUMPLE: sin línea base revisada, ni encontrar SUID ni no encontrarlos dice nada.',
    },
    {
      id: 'P-11',
      controlId: 'op.acc.2',
      name: 'world_writable_excepciones',
      label: 'Excepciones world-writable',
      description:
        'Rutas con escritura para todos que el responsable declara legítimas, como los directorios temporales con sticky bit. Fuera de esta lista, un recurso world-writable es incumplimiento cuando P-03 dice que no se permiten. Son DATO y no código a propósito: el auditor las ve aquí y no escondidas dentro del recolector.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.1'],
      type: 'list',
      example: '/tmp',
      columns: [
        {
          name: 'ruta',
          label: 'Ruta exceptuada',
          type: 'path',
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Actúa como lista blanca de la comprobación de world-writable: lo que está aquí no genera alerta.',
      ensfacilUsage:
        'Permite distinguir el world-writable legítimo del incumplimiento sin apagar la comprobación entera.',
      evidenceIds: ['EV-01'],
      ruleIds: ['106902'],
      ifNotConfigured:
        'No se declara ninguna excepción: cualquier recurso world-writable cuenta como incumplimiento si P-03 es no.',
    },
    {
      id: 'P-12',
      controlId: 'op.acc.2',
      name: 'grupos_privilegiados',
      label: 'Grupos que otorgan privilegio administrativo',
      description:
        'Grupos del sistema cuya pertenencia concede privilegios de administración. Es la decisión que define qué cuenta como privilegio en esta máquina: pertenecer a uno de ellos y no estar declarado en P-09 es un privilegio no justificado.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.1', 'op.acc.2.r1.1'],
      type: 'list',
      example: 'sudo',
      columns: [
        {
          name: 'grupo',
          label: 'Grupo privilegiado',
          type: 'identifier',
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Define qué pertenencias se registran como group_membership privilegiada.',
      ensfacilUsage:
        'Sin esta decisión, ENSFácil aplicaría la lista de fábrica del recolector y el informe afirmaría algo que el cliente no ha declarado.',
      evidenceIds: ['EV-05'],
      ruleIds: ['106932'],
      ifNotConfigured:
        'El agente aplica su lista de fábrica (sudo, wheel, admin, adm, root) y el informe no puede citar una decisión del cliente.',
    },
  ],
};
