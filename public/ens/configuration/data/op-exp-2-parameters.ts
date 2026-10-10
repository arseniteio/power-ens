import { ENSControlConfiguration } from '../types';

// op.exp.2 nace en el modelo nuevo: cada parámetro que un juicio del catálogo
// contrasta dice aquí CÓMO se escribe, porque la comparación es literal.
//
// `ruleIds` son las reglas cuyos hechos se juzgan contra el parámetro, y existen
// en ensfacil_op_exp_2_json_rules.xml. P-07 y P-ATT no los tienen porque ningún
// hecho se contrasta con ellos.
export const opExp2Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.2',
  controlName: 'Configuración de seguridad',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.2',
      name: 'politicas_sca_por_perfil',
      label: 'Políticas SCA por perfil',
      description:
        'Línea base de configuración segura asignada a cada perfil de activo: la política SCA de Wazuh que tiene que evaluarse en sus máquinas. Una fila por perfil. El perfil es el nombre del agente de Wazuh salvo que la máquina declare otro en OPEXP2_PERFIL. En «Política SCA» se escriben los IDENTIFICADORES de política (cis_ubuntu24-04, no «CIS Ubuntu»), y si son varios, separados por coma, sin espacios y en orden alfabético: se compara literal con el conjunto de políticas que el agente ha evaluado de verdad.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.1', 'op.exp.2.2', 'op.exp.2.3'],
      type: 'table',
      example: 'srv-web-01 | cis_ubuntu24-04',
      columns: [
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          // `string` y no `multiselect` a propósito: con `multiselect` bastaría
          // con que CADA política evaluada estuviera en la celda, y una celda
          // con dos políticas daría por buena una máquina que solo evalúa una.
          // Se compara el CONJUNTO entero.
          name: 'politica_sca',
          label: 'Política SCA',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'El recolector lee del ossec.log del agente qué políticas SCA ha evaluado de verdad en las últimas 36 horas y las emite como `sca_evaluation` (regla 110301).',
      ensfacilUsage:
        'EV-01 casa el conjunto de políticas evaluadas con la fila del perfil (CONFORME_A_TABLA). Un perfil sin fila no es un incumplimiento: es una decisión sin escribir, y sale NO_EVALUABLE.',
      evidenceIds: ['EV-01'],
      ruleIds: ['110301'],
      ifNotConfigured:
        'EV-01 NO EVALUABLE: no consta qué línea base toca a cada máquina, y op.exp.2.1, .2 y .3 no se pueden acreditar.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.2',
      name: 'servicios_justificados_por_perfil',
      label: 'Servicios justificados por perfil',
      description:
        'Servicios y puertos justificados para cada perfil de activo: la traducción operativa de la regla de mínima funcionalidad. Una fila por perfil. En «Servicios» van los nombres de proceso tal como los emite el agente (sshd, slapd, systemd-resolve) y, para funciones del directorio, slapd:<backend>; en «Puertos», los números, y `efimero` para los sockets UDP del rango efímero. Los dos separados por coma. Una celda vacía no se contrasta.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.2'],
      type: 'table',
      example: 'srv-web-01 | sshd,systemd-resolve,systemd-network | 22121,53,68',
      columns: [
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          name: 'servicios',
          label: 'Servicios',
          type: 'multiselect',
          required: false,
        },
        {
          name: 'puertos',
          label: 'Puertos',
          type: 'multiselect',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'El recolector emite cada socket en escucha y cada función expuesta del directorio como `service_exposed` (regla 110304), con su servicio, protocolo, puerto y si escucha solo en local o en red.',
      ensfacilUsage:
        'EV-03 casa cada función expuesta con la fila de su perfil (CONFORME_A_TABLA): el servicio tiene que estar entre los justificados y el puerto también. Lo que sobra incumple op.exp.2.2.',
      evidenceIds: ['EV-03'],
      ruleIds: ['110304'],
      ifNotConfigured:
        'op.exp.2.2 NO EVALUABLE. Wazuh ve los servicios activos pero no puede juzgar si están justificados.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.2',
      name: 'cuentas_contrasenas_estandar',
      label: 'Cuentas y contraseñas estándar',
      description:
        'Cuentas por defecto de los productos desplegados que deben haberse retirado: admin, root, sa, tomcat, cuentas de demostración. Una fila por cuenta, con el producto al que pertenece. La comparación con la cuenta observada no distingue mayúsculas: es una lista prohibida y equivocarse ahí solo produce un incumplimiento de más.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.1'],
      type: 'table',
      example: 'admin | Zimbra',
      columns: [
        {
          name: 'cuenta',
          label: 'Cuenta',
          type: 'identifier',
          required: true,
        },
        {
          name: 'producto',
          label: 'Producto',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'El recolector emite las cuentas que no están retiradas (shell interactiva, contraseña utilizable o claves ssh) como `login_account` (regla 110302) y cada autenticación con éxito como `account_authenticated` (regla 110303). No prueba contraseñas.',
      ensfacilUsage:
        'EV-02 comprueba que ninguna de esas cuentas figura en P-03 (NINGUNO_EN_LISTA). Con el latido confirmado, no observar ninguna es cumplimiento.',
      evidenceIds: ['EV-02'],
      ruleIds: ['110302', '110303'],
      ifNotConfigured:
        'EV-02 NO EVALUABLE: no se detecta la pervivencia de cuentas por defecto y op.exp.2.1 queda sin verificación específica.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.2',
      name: 'excepciones_autorizadas',
      label: 'Excepciones autorizadas',
      description:
        'Desviaciones de la seguridad por defecto autorizadas formalmente. Una fila por desviación. En «Comprobación» va la desviación EXACTA que emite el agente, que incluye la máquina (srv-web-01:ssh_x11forwarding): así una excepción autorizada para un activo no excusa la misma desviación en otro. Si no hay ninguna excepción, se declara una fila «ninguno | ninguna | Sin excepciones autorizadas», que es una decisión y no un hueco. La vigencia se muestra pero el motor no la contrasta.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.3'],
      type: 'table',
      example: 'srv-web-01 | srv-web-01:ssh_permitrootlogin | acceso de emergencia por clave | Responsable de Seguridad | 2027-03-31',
      columns: [
        {
          name: 'activo',
          label: 'Activo',
          type: 'identifier',
          required: true,
        },
        {
          name: 'comprobacion',
          label: 'Comprobación',
          type: 'string',
          required: true,
        },
        {
          name: 'motivo',
          label: 'Motivo',
          type: 'string',
          required: false,
        },
        {
          name: 'aprobo',
          label: 'Aprobó',
          type: 'string',
          required: false,
        },
        {
          name: 'vigencia',
          label: 'Vigencia',
          type: 'date',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'El recolector emite cada valor por defecto inseguro como `insecure_default` (regla 110305), con `desviacion` = <máquina>:<comprobación>.',
      ensfacilUsage:
        'EV-04 comprueba que toda desviación observada figura en la columna Comprobación (NINGUNO_FUERA_DE_LISTA). Sin desviaciones y con el latido confirmado, cumple.',
      evidenceIds: ['EV-04'],
      ruleIds: ['110305'],
      ifNotConfigured:
        'EV-04 NO EVALUABLE: sin la decisión escrita de qué se autoriza, ni siquiera una máquina sin desviaciones se puede dar por conforme.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.2',
      name: 'umbral_cumplimiento_sca',
      label: 'Umbral de cumplimiento SCA',
      description:
        'Porcentaje mínimo de checks SCA superados, según la puntuación que calcula Wazuh para cada política. Ninguna puntuación observada en el periodo evaluado puede quedar por debajo.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.2', 'op.exp.2.3'],
      type: 'number',
      example: '90',
      minValue: 0,
      maxValue: 100,
      required: true,
      wazuhUsage:
        'La puntuación SCA solo la guarda el manager. El recolector la lee de la API de Wazuh con un usuario de solo lectura declarado en su .env y la emite como `sca_score` (regla 110307).',
      ensfacilUsage:
        'EV-06 comprueba que ninguna puntuación de la serie queda por debajo del umbral (UMBRAL_MINIMO). Las excepciones de P-04 no se descuentan de la puntuación de Wazuh.',
      evidenceIds: ['EV-06'],
      ruleIds: ['110307'],
      ifNotConfigured:
        'EV-06 NO EVALUABLE: no hay umbral contra el que juzgar la puntuación SCA.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.2',
      name: 'inventario_virtualizacion',
      label: 'Inventario de virtualización',
      description:
        'Máquinas virtuales y anfitriones de virtualización cuyo anfitrión se gestiona con el mismo rigor que una máquina física. Una fila por máquina: el hipervisor que la aloja, la máquina (nombre de su agente de Wazuh; para un anfitrión, el suyo propio) y cómo se gestiona ese anfitrión (el nombre de su agente de Wazuh o, en un proveedor cloud, la referencia de su acreditación). Declarar una fila ES afirmar que el anfitrión está gestionado: una VM cuyo anfitrión no lo está no se declara, y EV-05 incumple, que es lo que pide op.exp.2.4.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.4'],
      type: 'table',
      example: 'pve01 | srv-web01 | agente pve01',
      columns: [
        {
          name: 'hipervisor',
          label: 'Hipervisor',
          type: 'string',
          required: false,
        },
        {
          name: 'maquina',
          label: 'Máquina',
          type: 'identifier',
          required: true,
        },
        {
          // No se contrasta con ningún hecho: la VM no ve a su anfitrión. Es la
          // prueba DECLARADA de que el anfitrión se gestiona, y viaja al informe
          // para que el auditor la pueda comprobar.
          name: 'agente',
          label: 'Gestión del anfitrión',
          type: 'string',
          required: true,
        },
      ],
      // No obligatorio: su ausencia solo afecta a op.exp.2.4 (EV-05 sale
      // NO_EVALUABLE y el requisito no evidenciado). Marcarlo obligatorio
      // bloquearía también op.exp.2.1, .2 y .3, que no dependen de él.
      required: false,
      wazuhUsage:
        'El recolector emite `virtualization_role` (regla 110306) si la máquina es virtual o si aloja máquinas virtuales.',
      ensfacilUsage:
        'EV-05 comprueba que toda VM o anfitrión observado consta en la columna Máquina (NINGUNO_FUERA_DE_LISTA). Si el anfitrión está gestionado lo afirma quien declara la fila; lo mide el agente del propio anfitrión, no el de la VM.',
      evidenceIds: ['EV-05'],
      ruleIds: ['110306'],
      ifNotConfigured:
        'op.exp.2.4 NO EVALUABLE. No se puede verificar que las máquinas virtuales y sus anfitriones están gestionados.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.2',
      name: 'momento_verificacion_pre_produccion',
      label: 'Verificación previa a producción',
      description:
        'Si existe un punto de control formal antes de la entrada en operación de un activo. op.exp.2 exige que la configuración segura sea PREVIA a la operación. Es documental: ningún hecho que un agente observe después demuestra el orden, así que ningún juicio lo contrasta y no bloquea la evaluación del control.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'select',
      options: ['sí', 'no'],
      example: 'sí',
      required: false,
      wazuhUsage:
        'No lo lee ningún agente.',
      ensfacilUsage:
        'Se muestra en el informe junto a EV-07. No cambia ningún veredicto.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'El informe no puede citar el procedimiento de puesta en producción.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.2',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. En op.exp.2 los cuatro requisitos tienen evidencia técnica, así que hoy no hay ninguno al que aplicarlo; se conserva para que el control tenga la misma forma que los demás.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.2.1 | Procedimiento de bastionado previo a producción | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
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
      required: false,
      wazuhUsage:
        'No lo lee ningún agente.',
      ensfacilUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto en este control: ningún requisito de op.exp.2 es solo documental.',
    },
  ],
};
