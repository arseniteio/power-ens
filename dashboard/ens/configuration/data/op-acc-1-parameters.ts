import { ENSControlConfiguration } from '../types';

export const opAcc1Configuration: ENSControlConfiguration = {
  controlId: 'op.acc.1',
  controlName: 'Identificación',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.acc.1',
      name: 'fuente_identidad',
      label: 'Fuente de identidad',
      description:
        'Sistema o directorio que gestiona las cuentas de usuario de la ' +
        'organización, y del que nacen las identidades que este control ' +
        'audita. Es lo primero que pregunta un auditor antes de mirar ninguna ' +
        'cuenta, porque determina dónde se dan de alta y de baja las personas ' +
        'y, por tanto, dónde hay que ir a comprobar que el ciclo de vida se ' +
        'cumple.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.3', 'op.acc.1.4'],
      type: 'select',
      example: 'Active Directory',
      options: [
        'Active Directory',
        'LDAP',
        'Local',
        'Azure AD',
        'Otro',
      ],
      required: true,
      wazuhUsage:
        'Determina qué integración de Wazuh aporta los eventos de cuenta: el ' +
        'módulo de Active Directory, el colector de eventos de Windows, ' +
        'auditd en Linux o un conector cloud.',
      ensfacilUsage:
        'Deja constancia en el informe del origen de las identidades ' +
        'auditadas. El agente no lee este valor: recoge siempre las cuentas ' +
        'de la máquina en la que está instalado, así que declararlo no cambia ' +
        'lo que se mide, sino lo que el informe puede afirmar sobre el ' +
        'alcance.',
      evidenceIds: ['EV-01', 'EV-02'],
      // Hueco de trazabilidad: ninguna regla comprueba la fuente de identidad
      // declarada; el recolector la usa, pero no la acredita ninguna alerta.
      ruleIds: [],
      ifNotConfigured:
        'Sin declararlo, el informe no puede decir de dónde vienen las ' +
        'cuentas que se están auditando y el alcance del control queda sin ' +
        'justificar ante el auditor.',
    },
    {
      id: 'P-02',
      controlId: 'op.acc.1',
      name: 'sistemas_monitorizados',
      label: 'Sistemas incluidos en el alcance',
      description:
        'Relación de sistemas en los que la organización declara que debe ' +
        'verificarse la política de identificación. Es la declaración de ' +
        'alcance del control: lo que quede fuera de esta lista no se está ' +
        'auditando, aunque exista y tenga cuentas.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.3', 'op.acc.1.4'],
      type: 'list',
      example: 'srv-dc01 | Windows',
      required: true,
      wazuhUsage:
        'Delimita la monitorización: Wazuh solo detecta anomalías de cuentas ' +
        'en los sistemas incluidos.',
      ensfacilUsage:
        'Permite contrastar el alcance declarado con las máquinas de las que ' +
        'están llegando evidencias, que es como se detecta un servidor que ' +
        'debería auditarse y no reporta.',
      evidenceIds: ['EV-01'],
      // Hueco de trazabilidad: ninguna regla detecta un sistema del alcance que
      // deja de enviar eventos.
      ruleIds: [],
      ifNotConfigured:
        'Sin declararlo no hay alcance con el que contrastar lo recibido, así ' +
        'que no se puede distinguir un sistema que cumple de uno que ' +
        'sencillamente no está enviando nada.',
    },
    {
      id: 'P-03',
      controlId: 'op.acc.1',
      name: 'cuentas_servicio_definidas',
      label: 'Cuentas de servicio legítimas',
      description:
        'Cuentas técnicas o de proceso que no corresponden a una persona ' +
        'física y que, por tanto, no deben usarse nunca para iniciar sesión ' +
        'de forma interactiva. Se escribe un nombre de cuenta por línea, sin ' +
        'más columnas: el motor separa esta lista por saltos de línea y por ' +
        'comas, nunca por barra vertical, así que una entrada del tipo cuenta ' +
        'más sistema se compararía entera contra el nombre de la cuenta, no ' +
        'coincidiría jamás, y ese silencio se leería como cumplimiento.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.2', 'op.acc.1.3'],
      type: 'list',
      example: 'svc_backup',
      required: true,
      wazuhUsage:
        'Se puede cargar como lista CDB para distinguir en las alertas las ' +
        'cuentas de servicio de las de persona.',
      ensfacilUsage:
        'Es la lista contra la que el motor juzga EV-05: cada autenticación ' +
        'observada por el agente se contrasta con ella para detectar una ' +
        'cuenta de servicio usada como si fuera de una persona.',
      evidenceIds: ['EV-05'],
      // 106873 es el hecho crudo que el motor juzga contra este parámetro
      // desde la migración de EV-05; 106805 y 106806 son las reglas del
      // modelo viejo, que se conservan por el índice histórico. 106857 y
      // 106858, que estaban aquí, NO EXISTEN en ningún manager: un id
      // numérico inventado engaña más que no poner ninguno, porque el
      // auditor que lo sigue no encuentra la regla y no sabe si el fallo es
      // suyo o del producto.
      ruleIds: ['106873', '106805', '106806'],
      ifNotConfigured:
        'Sin ella no se puede comprobar si una cuenta de servicio se está ' +
        'usando para acceso interactivo, así que EV-05 no acredita y el ' +
        'requisito op.acc.1.2 cuenta como incumplimiento.',
    },
    {
      id: 'P-04',
      controlId: 'op.acc.1',
      name: 'cuentas_genericas_prohibidas',
      label: 'Cuentas genéricas prohibidas',
      description:
        'Nombres de cuenta que la organización prohíbe porque no identifican ' +
        'a nadie en particular, como admin, guest, test o temp. Una cuenta ' +
        'así, si existe y se usa, rompe la unicidad del identificador: la ' +
        'actividad registrada con ella no se puede atribuir a una persona. Se ' +
        'escribe un nombre por entrada.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.1', 'op.acc.1.3'],
      type: 'list',
      example: 'admin',
      required: true,
      wazuhUsage:
        'Se carga como lista CDB, de forma que cualquier autenticación ' +
        'correcta con una de estas cuentas genere alerta.',
      ensfacilUsage:
        'Es la lista contra la que el motor juzga EV-03: cada autenticación ' +
        'que observa el agente se contrasta con ella, así que basta con ' +
        'editarla en esta pantalla para que el veredicto cambie, sin volver a ' +
        'ejecutar nada en la máquina.',
      evidenceIds: ['EV-03'],
      ruleIds: ['106801'],
      ifNotConfigured:
        'Sin ella no hay nada contra lo que contrastar las autenticaciones ' +
        'observadas: EV-03 no acredita y el requisito op.acc.1.1 cuenta como ' +
        'incumplimiento.',
    },
    {
      id: 'P-05',
      controlId: 'op.acc.1',
      name: 'plazo_max_deshabilitar_dias',
      label: 'Plazo máximo para deshabilitar',
      description:
        'Plazo máximo, en días, desde que una persona cesa o deja la ' +
        'organización hasta que su cuenta tiene que estar deshabilitada. Es ' +
        'el compromiso que la organización se fija a sí misma, y es contra ' +
        'ese número contra el que se mide cada baja.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'duration_days',
      example: '1',
      required: true,
      minValue: 0,
      wazuhUsage:
        'Compara la fecha de baja de la persona con la fecha en que su cuenta ' +
        'quedó deshabilitada.',
      ensfacilUsage:
        'Fija el umbral con el que EV-04 decide si una baja se resolvió a ' +
        'tiempo. Cada hecho que emite el agente viaja con el plazo aplicado y ' +
        'con los días medidos, de modo que el informe puede mostrar las dos ' +
        'cifras juntas.',
      evidenceIds: ['EV-04'],
      // 106815 account_disabled, 106816/106817 account_offboarding. Los dos
      // ids que había aquí (106820, 106844) no existen en ningún manager.
      ruleIds: ['106815', '106816', '106817'],
      ifNotConfigured:
        'Sin plazo declarado no hay contra qué medir el retraso de una ' +
        'deshabilitación, así que la letra b del requisito op.acc.1.4 no se ' +
        'puede acreditar.',
    },
    {
      id: 'P-06',
      controlId: 'op.acc.1',
      name: 'periodo_retencion_cuentas_dias',
      label: 'Retención de cuentas deshabilitadas',
      description:
        'Periodo, en días, durante el que se conservan las cuentas ya ' +
        'deshabilitadas antes de eliminarlas. Existe para que la actividad ' +
        'registrada con esa identidad siga siendo atribuible: si la cuenta ' +
        'desaparece antes de tiempo, el día que haya que responder a quién ' +
        'hizo algo el identificador ya no existe.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'duration_days',
      example: '365',
      required: true,
      minValue: 1,
      wazuhUsage:
        'Verifica que una cuenta deshabilitada no se elimine antes de haber ' +
        'cumplido el periodo.',
      ensfacilUsage:
        'Fija el umbral con el que EV-08 juzga las cuentas que desaparecen ' +
        'del sistema. Cada hecho viaja con el umbral aplicado y con los días ' +
        'realmente retenidos.',
      evidenceIds: ['EV-08'],
      // 106818 account_deleted, 106819 retention_violation. Los dos ids que
      // había aquí (106821, 106856) no existen en ningún manager.
      ruleIds: ['106818', '106819'],
      ifNotConfigured:
        'Sin periodo declarado no se puede afirmar si una cuenta eliminada se ' +
        'retuvo lo suficiente, y la letra c del requisito op.acc.1.4 queda ' +
        'sin acreditar.',
    },
    {
      id: 'P-07',
      controlId: 'op.acc.1',
      name: 'lista_usuarios_autorizados',
      label: 'Lista de usuarios autorizados',
      description:
        'Relación maestra de las personas autorizadas a acceder a los ' +
        'sistemas incluidos en el alcance, mantenida por el responsable de ' +
        'seguridad. La exige el refuerzo R1, o sea las categorías MEDIA y ' +
        'ALTA. Se rellena una fila por persona. Solo la columna de usuario se ' +
        'contrasta con las cuentas activas de la máquina, y la comparación es ' +
        'literal y distingue mayúsculas de minúsculas; el sistema y el rol ' +
        'acompañan a la decisión en el informe, para que se vea por qué esa ' +
        'persona está autorizada.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.1.r1.2', 'op.acc.1.r1.3'],
      // Esto era una RUTA en el .env del agente (OPACC1_LISTA_AUTORIZADOS
      // apuntaba a un fichero que había que crear a mano en el servidor). La
      // lista vive ahora aquí, que es lo que el auditor puede ver y editar.
      //
      // El valor guardado NO cambia de forma: ya era `string[]` con el elemento
      // 'usuario | sistema | rol'. Solo Usuario es obligatorio, así que las
      // entradas heredadas de una sola columna ('jgomez', que es lo que había en
      // el fichero) siguen siendo válidas y se ven en su columna.
      type: 'table',
      example: 'jgomez | srv01 | ops',
      columns: [
        {
          name: 'usuario',
          label: 'Usuario',
          type: 'identifier',
          required: true,
        },
        {
          name: 'sistema',
          label: 'Sistema',
          type: 'string',
          required: false,
        },
        {
          name: 'rol',
          label: 'Rol',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'El inventario de cuentas activas se compara con esta lista, y una ' +
        'cuenta activa que no figure en ella genera alerta.',
      ensfacilUsage:
        'Es la lista contra la que el motor juzga EV-07. Las cuentas que hay ' +
        'que declarar son exactamente las que el agente está emitiendo como ' +
        'activas, así que la lista se puede construir a partir de lo que ya ' +
        'reporta la máquina.',
      evidenceIds: ['EV-07'],
      // 106811 (account_active) es el hecho crudo que el motor contrasta con
      // la columna 'usuario' de esta tabla desde la migración de EV-07; las
      // otras tres son las reglas del modelo viejo, conservadas por el
      // índice histórico. Los cuatro ids que había aquí (106832, 106833,
      // 106839, 106840) no existen en ningún manager.
      ruleIds: ['106811', '106824', '106825', '106826'],
      ifNotConfigured:
        'Sin ella no se puede comprobar que toda cuenta activa esté ' +
        'autorizada: EV-07 no acredita y el requisito op.acc.1.r1.3 cuenta ' +
        'como incumplimiento en las categorías MEDIA y ALTA.',
    },
    {
      id: 'P-08',
      controlId: 'op.acc.1',
      name: 'integracion_rrhh',
      label: 'Integración con RRHH',
      description:
        'Indica si ENSFácil recibe de un sistema de recursos humanos o de un ' +
        'directorio las altas y bajas de empleados. Es la respuesta a de ' +
        'dónde sale la fecha de baja de una persona: de un sistema que la ' +
        'notifica, o de una declaración manual. Se admite sí o no.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'boolean',
      example: 'sí',
      required: false,
      wazuhUsage:
        'Si hay integración, los eventos de baja de recursos humanos se ' +
        'correlacionan con la deshabilitación de la cuenta.',
      ensfacilUsage:
        'Documenta en el informe cómo llegan las bajas. No cambia por sí solo ' +
        'el comportamiento del agente: lo que el agente consulta es el ' +
        'registro de bajas de la propia máquina, cuya ruta y formato se ' +
        'explican en la documentación del runbook.',
      evidenceIds: ['EV-04'],
      // Hueco de trazabilidad: no existe regla de correlación con RRHH.
      ruleIds: [],
      ifNotConfigured:
        'Sin declararlo, el informe no puede decir si la detección de bajas ' +
        'está automatizada o depende de que alguien las anote a mano, que es ' +
        'la diferencia entre un control sostenible y uno que se olvida.',
    },
    // --- Política que vivía en el .env o en un fichero de la máquina ---------
    //
    // P-09 era OPACC1_BAJAS (una RUTA a un TSV que el repo ni siquiera traía de
    // plantilla); P-10, P-11 y P-12 eran los "ajustes finos" del .env, que de
    // finos no tienen nada: los tres deciden qué cuenta como cuenta de persona,
    // qué cuenta como privilegio y quién tiene identidad administrativa
    // diferenciada.
    {
      id: 'P-09',
      controlId: 'op.acc.1',
      name: 'bajas_declaradas',
      label: 'Bajas declaradas manualmente',
      description:
        'Ceses que se declaran a mano cuando no hay integración con recursos ' +
        'humanos. Se rellena una fila por persona, con la fecha en formato de ' +
        'año, mes y día. Es la fecha de la que se resta la deshabilitación de ' +
        'la cuenta para medir el plazo de P-05, así que una fecha que no ' +
        'existe deja la medida sin base.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'table',
      example: 'mlopez | 2026-03-31',
      columns: [
        {
          name: 'usuario',
          label: 'Usuario',
          type: 'identifier',
          required: true,
        },
        {
          name: 'fecha_baja',
          label: 'Fecha de baja',
          type: 'date',
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Cada baja declarada se compara con la fecha de deshabilitación de ' +
        'esa cuenta, y una fuera de plazo genera el hecho correspondiente.',
      ensfacilUsage:
        'Documenta las bajas ante el auditor. El agente no lee esta tabla: ' +
        'consulta el registro de bajas de su propia máquina, así que una baja ' +
        'declarada solo aquí queda documentada pero no se mide. La ruta y el ' +
        'formato de ese registro están en la documentación del runbook.',
      evidenceIds: ['EV-04'],
      ruleIds: ['106816', '106817'],
      ifNotConfigured:
        'Si además no hay integración con recursos humanos, no queda ninguna ' +
        'fuente de fechas de baja y EV-04 se queda sin nada que medir.',
    },
    {
      id: 'P-10',
      controlId: 'op.acc.1',
      name: 'uid_minimo_persona',
      label: 'UID mínimo de cuenta de persona',
      description:
        'Identificador numérico a partir del cual una cuenta de un sistema ' +
        'Linux se considera de una persona física. Por debajo se trata como ' +
        'cuenta del sistema y no entra ni en el inventario de identidades ni ' +
        'en el contraste con la lista de autorizados. Es la frontera entre lo ' +
        'que se audita como persona y lo que es maquinaria del sistema ' +
        'operativo.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.1', 'op.acc.1.3'],
      type: 'number',
      example: '1000',
      required: false,
      minValue: 0,
      wazuhUsage:
        'Delimita qué cuentas del fichero de usuarios entran en el inventario ' +
        'que se publica como evidencia.',
      ensfacilUsage:
        'Deja constancia de la frontera que la organización aplica. Un umbral ' +
        'demasiado bajo mete cuentas del sistema en el contraste con la lista ' +
        'de autorizados y produce incumplimientos que no lo son; uno ' +
        'demasiado alto esconde cuentas de persona.',
      evidenceIds: ['EV-01'],
      // Hueco de trazabilidad: ninguna regla acredita el umbral en sí; se ve su
      // efecto en el inventario, no el valor.
      ruleIds: [],
      ifNotConfigured:
        'El agente aplica su valor de fábrica, mil, y el informe no puede ' +
        'citar una decisión del cliente sino un valor por defecto del ' +
        'producto.',
    },
    {
      id: 'P-11',
      controlId: 'op.acc.1',
      name: 'grupos_privilegiados',
      label: 'Grupos que otorgan privilegio administrativo',
      description:
        'Grupos del sistema cuya pertenencia concede privilegios de ' +
        'administración. Define qué cuenta como uso de privilegio en estas ' +
        'máquinas, que es la mitad de la comprobación de identificador ' +
        'diferenciado: sin saber qué grupo es privilegiado no se puede ' +
        'detectar quién acumula el papel de usuario y el de administrador en ' +
        'una sola cuenta.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.2'],
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
        'Define qué pertenencias se registran como uso de privilegios.',
      ensfacilUsage:
        'Deja constancia de qué considera privilegio administrativo esta ' +
        'organización. Conviene revisarlo: un grupo que solo da lectura de ' +
        'registros no permite administrar nada, e incluirlo marcaría como ' +
        'acumulación de roles a cuentas que no pueden cambiar el sistema.',
      evidenceIds: ['EV-06'],
      ruleIds: ['106808'],
      ifNotConfigured:
        'El agente aplica su lista de fábrica, sudo, wheel y admin, y el ' +
        'informe no puede citar una decisión del cliente sino un valor por ' +
        'defecto del producto.',
    },
    {
      id: 'P-12',
      controlId: 'op.acc.1',
      name: 'sufijo_admin',
      label: 'Sufijo del identificador administrativo',
      description:
        'Sufijo que distingue la cuenta administrativa de la cuenta ordinaria ' +
        'de la misma persona, como jgomez y jgomez.adm. Es lo que permite ' +
        'reconocer a quien tiene dos identidades por diseño, que es ' +
        'justamente lo que el control pide, y separarlo de quien acumula los ' +
        'dos papeles en una sola cuenta.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.2'],
      type: 'string',
      example: '.adm',
      required: false,
      wazuhUsage:
        'Excluye del hallazgo de acumulación de roles a las cuentas ' +
        'administrativas diferenciadas por este sufijo.',
      ensfacilUsage:
        'Permite acreditar el requisito op.acc.1.2 cuando la organización ' +
        'separa la identidad administrativa de la ordinaria, y hace que el ' +
        'hallazgo señale solo a quien de verdad no la ha separado.',
      evidenceIds: ['EV-06'],
      ruleIds: ['106807'],
      ifNotConfigured:
        'Sin sufijo declarado no se excluye a nadie, así que todas las ' +
        'cuentas con privilegio administrativo pasan a ser candidatas a ' +
        'acumular roles y el hallazgo pierde precisión.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.acc.1',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida ' +
        'técnica puede demostrar, como una política aprobada o un ' +
        'procedimiento firmado. Se rellena una fila por requisito, con el ' +
        'nombre del documento y un enlace que permita consultarlo. En este ' +
        'control es la vía para acreditar la identificación conforme a eIDAS ' +
        'y la singularización de la persona detrás de cada identificador, que ' +
        'ningún dato de una máquina puede demostrar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.acc.1.5 | Nombre del documento aprobado | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        {
          name: 'requisito',
          label: 'Requisito',
          type: 'identifier',
          required: true,
        },
        {
          name: 'referencia',
          label: 'Documento',
          type: 'string',
          required: true,
        },
        {
          name: 'enlace',
          label: 'Enlace(s)',
          type: 'string',
          required: true,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Declarado por',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No lo lee ningún agente: es la prueba documental de lo que la ' +
        'telemetría no alcanza. El motor lo aplica solo a los requisitos que ' +
        'el catálogo declara sin ninguna evidencia técnica, de modo que una ' +
        'atestación nunca puede tapar una medida que ha fallado.',
      ensfacilUsage:
        'El requisito pasa a cumplir marcado como acreditado documentalmente, ' +
        'con su documento y su enlace en el informe, y nunca se presenta como ' +
        'medido. Una atestación que apunte a un documento que todavía no se ' +
        'ha escrito acredita sobre el papel algo que no existe, así que ' +
        'conviene declararla solo cuando el documento está aprobado.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Los requisitos que ninguna evidencia técnica puede demostrar siguen ' +
        'contando como no conformes, que es el criterio por defecto: la carga ' +
        'de la prueba es del auditado.',
    },
  ],
};
