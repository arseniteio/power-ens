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
        'Sistema o directorio de identidades que gestiona las cuentas de usuario en la organización.',
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
        'Determina qué integración de Wazuh se activa: módulo AD, colector de eventos Windows, auditd en Linux o conector cloud.',
      ensfacilUsage:
        'Define de dónde obtiene ENSFácil los eventos de alta, modificación y baja de cuentas.',
      evidenceIds: ['EV-01', 'EV-02'],
      // Hueco de trazabilidad: ninguna regla comprueba la fuente de identidad
      // declarada; el recolector la usa, pero no la acredita ninguna alerta.
      ruleIds: [],
      ifNotConfigured:
        'Wazuh no sabe de dónde vienen las identidades. Todos los checks de cuentas quedan NO EVALUABLE.',
    },
    {
      id: 'P-02',
      controlId: 'op.acc.1',
      name: 'sistemas_monitorizados',
      label: 'Sistemas incluidos en el alcance',
      description:
        'Lista de sistemas en los que ENSFácil debe verificar el cumplimiento de la política de identificación.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.3', 'op.acc.1.4'],
      type: 'list',
      example: 'srv-dc01 | Windows',
      required: true,
      wazuhUsage:
        'Define el alcance de la monitorización. Wazuh solo detecta anomalías en los sistemas incluidos.',
      ensfacilUsage:
        'Delimita el alcance real auditado del control de identificación.',
      evidenceIds: ['EV-01'],
      // Hueco de trazabilidad: ninguna regla detecta un sistema del alcance que
      // deja de enviar eventos.
      ruleIds: [],
      ifNotConfigured:
        'ENSFácil no sabe qué sistemas entran en scope. No se puede emitir un semáforo fiable.',
    },
    {
      id: 'P-03',
      controlId: 'op.acc.1',
      name: 'cuentas_servicio_definidas',
      label: 'Cuentas de servicio legítimas',
      description:
        'Lista de cuentas técnicas o de proceso legítimas que no corresponden a personas físicas. Un nombre por línea. NO uses «|»: el motor parte esta lista por saltos de línea y comas, nunca por barra, así que «cuenta | sistema» se compararía entero contra el nombre de la cuenta y no casaría nunca — un silencio que el motor leería como cumplimiento.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.2', 'op.acc.1.3'],
      type: 'list',
      example: 'svc_backup',
      required: true,
      wazuhUsage:
        'El agente ya no lee esta lista: emite la autenticación observada (regla 106873) y el juicio lo hace el motor de ENSFácil con el valor de esta pantalla.',
      ensfacilUsage:
        'El motor contrasta con esta lista el usuario de cada autenticación observada (NINGUNO_EN_LISTA). Cambiar el valor aquí cambia el veredicto de EV-05 sin tocar ningún servidor.',
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
        'Sin declarar qué cuentas son de servicio no hay contra qué comparar: EV-05 no se puede demostrar y op.acc.1.2 cuenta como incumplimiento (criterio del 04/08).',
    },
    {
      id: 'P-04',
      controlId: 'op.acc.1',
      name: 'cuentas_genericas_prohibidas',
      label: 'Cuentas genéricas prohibidas',
      description:
        'Nombres de cuenta prohibidos que, si existen activas, rompen la unicidad del identificador. Un nombre por entrada: admin, guest, test, temp.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.1', 'op.acc.1.3'],
      type: 'list',
      example: 'admin',
      required: true,
      wazuhUsage:
        'Se carga como CDB list. Cualquier autenticación exitosa con estas cuentas genera alerta crítica.',
      ensfacilUsage:
        'Permite verificar la unicidad del identificador y detectar cuentas compartidas.',
      evidenceIds: ['EV-03'],
      ruleIds: ['106801'],
      ifNotConfigured:
        'No se detectan cuentas genéricas activas. EV-03 queda parcialmente desactivado.',
    },
    {
      id: 'P-05',
      controlId: 'op.acc.1',
      name: 'plazo_max_deshabilitar_dias',
      label: 'Plazo máximo para deshabilitar',
      description:
        'Plazo máximo desde que un usuario cesa o deja la organización hasta que su cuenta debe estar deshabilitada.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'duration_days',
      example: '1',
      required: true,
      minValue: 0,
      wazuhUsage:
        'Compara la fecha del evento de baja/cese contra la fecha de deshabilitación de la cuenta.',
      ensfacilUsage:
        'Evalúa si las cuentas se deshabilitan dentro del plazo definido tras la baja.',
      evidenceIds: ['EV-04'],
      // 106815 account_disabled, 106816/106817 account_offboarding. Los dos
      // ids que había aquí (106820, 106844) no existen en ningún manager.
      ruleIds: ['106815', '106816', '106817'],
      ifNotConfigured:
        'No se puede verificar si las cuentas se deshabilitan en plazo. op.acc.1.4 b) NO EVALUABLE.',
    },
    {
      id: 'P-06',
      controlId: 'op.acc.1',
      name: 'periodo_retencion_cuentas_dias',
      label: 'Retención de cuentas deshabilitadas',
      description:
        'Periodo durante el que se conservan las cuentas deshabilitadas para garantizar la trazabilidad de la actividad asociada.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'duration_days',
      example: '365',
      required: true,
      minValue: 1,
      wazuhUsage:
        'Verifica que las cuentas deshabilitadas no se eliminen antes de cumplir el periodo.',
      ensfacilUsage:
        'Evalúa el cumplimiento de la retención de cuentas para trazabilidad.',
      evidenceIds: ['EV-08'],
      // 106818 account_deleted, 106819 retention_violation. Los dos ids que
      // había aquí (106821, 106856) no existen en ningún manager.
      ruleIds: ['106818', '106819'],
      ifNotConfigured:
        'No se puede verificar si la retención de cuentas cumple la normativa interna.',
    },
    {
      id: 'P-07',
      controlId: 'op.acc.1',
      name: 'lista_usuarios_autorizados',
      label: 'Lista de usuarios autorizados',
      description:
        'Lista maestra de usuarios autorizados a acceder a los sistemas en scope, mantenida por el administrador de seguridad. Exigida por R1. Una fila por persona. Solo la columna Usuario se contrasta con las cuentas activas de la máquina, y la comparación es literal y distingue mayúsculas; sistema y rol acompañan a la decisión en el informe.',
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
        'El agente ya no mantiene ningún fichero de autorizados: emite una cuenta activa por cada cuenta de /etc/passwd (regla 106811) y el juicio lo hace el motor de ENSFácil con esta tabla.',
      ensfacilUsage:
        'El motor comprueba que toda cuenta activa figure en la columna Usuario (TODOS_EN_LISTA). Es el refuerzo R1 (op.acc.1.r1.3), y editar la tabla aquí cambia el veredicto sin tocar ningún servidor.',
      evidenceIds: ['EV-07'],
      // 106811 (account_active) es el hecho crudo que el motor contrasta con
      // la columna 'usuario' de esta tabla desde la migración de EV-07; las
      // otras tres son las reglas del modelo viejo, conservadas por el
      // índice histórico. Los cuatro ids que había aquí (106832, 106833,
      // 106839, 106840) no existen en ningún manager.
      ruleIds: ['106811', '106824', '106825', '106826'],
      ifNotConfigured:
        'Sin la lista no hay contra qué contrastar las cuentas activas: op.acc.1.r1.3 cuenta como incumplimiento en MEDIO y ALTO (criterio del 04/08). En BAJO el refuerzo no aplica y no resta.',
    },
    {
      id: 'P-08',
      controlId: 'op.acc.1',
      name: 'integracion_rrhh',
      label: 'Integración con RRHH',
      description:
        'Indica si ENSFácil tiene acceso a un sistema de RRHH o directorio que notifique altas y bajas de empleados. Valores admitidos: sí o no.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'boolean',
      example: 'sí',
      required: false,
      wazuhUsage:
        'Si está activa, correlaciona eventos de baja de RRHH con la deshabilitación de la cuenta.',
      ensfacilUsage:
        'Determina si la detección de cuentas de bajas puede automatizarse o requiere declaración manual.',
      evidenceIds: ['EV-04'],
      // Hueco de trazabilidad: no existe regla de correlación con RRHH.
      ruleIds: [],
      ifNotConfigured:
        'La detección de cuentas activas de usuarios dados de baja no puede automatizarse.',
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
        'Ceses que se declaran a mano cuando no hay integración con RRHH (P-08 = no). Una fila por persona, con la fecha en formato AAAA-MM-DD. Es la fecha que se resta de la de deshabilitación de la cuenta para medir el plazo de P-05, así que una fecha que no existe deja la medida sin base.',
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
        'Cada baja declarada se compara con la fecha de deshabilitación de esa cuenta. Fuera de plazo genera account_offboarding.',
      ensfacilUsage:
        'Permite medir op.acc.1.4 b) en una organización sin integración de RRHH, en vez de dejarlo NO EVALUABLE.',
      evidenceIds: ['EV-04'],
      ruleIds: ['106816', '106817'],
      ifNotConfigured:
        'Si además P-08 es no, no hay ninguna fuente de bajas y EV-04 se queda sin nada que medir.',
    },
    {
      id: 'P-10',
      controlId: 'op.acc.1',
      name: 'uid_minimo_persona',
      label: 'UID mínimo de cuenta de persona',
      description:
        'UID a partir del cual una cuenta se considera de una persona física. Por debajo se trata como cuenta del sistema y no entra en el inventario de identidades ni en el contraste con la lista de autorizados.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.1', 'op.acc.1.3'],
      type: 'number',
      example: '1000',
      required: false,
      minValue: 0,
      wazuhUsage:
        'Delimita qué cuentas de /etc/passwd entran en el inventario que se publica como account_inventory.',
      ensfacilUsage:
        'Un umbral mal puesto mete las cuentas de sistema en el contraste con la lista de autorizados y produce incumplimientos que no lo son.',
      evidenceIds: ['EV-01'],
      // Hueco de trazabilidad: ninguna regla acredita el umbral en sí; se ve su
      // efecto en el inventario, no el valor.
      ruleIds: [],
      ifNotConfigured:
        'El agente aplica su valor de fábrica (1000) y el informe no puede citar una decisión del cliente.',
    },
    {
      id: 'P-11',
      controlId: 'op.acc.1',
      name: 'grupos_privilegiados',
      label: 'Grupos que otorgan privilegio administrativo',
      description:
        'Grupos del sistema cuya pertenencia concede privilegios de administración. Define qué cuenta como uso de privilegio en esta máquina.',
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
        'Es la mitad de la comprobación de identificador diferenciado: sin saber qué grupo es privilegiado no se puede detectar quién acumula roles.',
      evidenceIds: ['EV-06'],
      ruleIds: ['106808'],
      ifNotConfigured:
        'El agente aplica su lista de fábrica (sudo, wheel, admin) y el informe no puede citar una decisión del cliente.',
    },
    {
      id: 'P-12',
      controlId: 'op.acc.1',
      name: 'sufijo_admin',
      label: 'Sufijo del identificador administrativo',
      description:
        'Sufijo que distingue la cuenta administrativa de la cuenta ordinaria de la misma persona, como jgomez y jgomez.adm. Sin él no se puede distinguir a quien tiene dos identidades por diseño de quien acumula roles en una sola cuenta, y todos los privilegiados pasan a ser candidatos a multi-rol.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.2'],
      type: 'string',
      example: '.adm',
      required: false,
      wazuhUsage:
        'Excluye del multi-rol a las cuentas administrativas diferenciadas por este sufijo.',
      ensfacilUsage:
        'Permite acreditar op.acc.1.2 cuando la organización separa la identidad administrativa de la ordinaria.',
      evidenceIds: ['EV-06'],
      ruleIds: ['106807'],
      ifNotConfigured:
        'No se excluye a nadie: todos los usuarios privilegiados pasan a ser candidatos a identificador con varios roles.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.acc.1',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna telemetría puede demostrar. Una fila por requisito, con el documento y su enlace.',
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
        'No lo lee ningún agente: es la prueba documental de lo que la telemetría no alcanza. El motor lo aplica SOLO a requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que falla.',
      ensfacilUsage:
        'El requisito pasa a CUMPLE marcado como acreditado documentalmente, con su documento y su enlace en el informe. Nunca se presenta como medido.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Los requisitos sin evidencia técnica siguen contando como no conformes, que es el criterio por defecto: la carga de la prueba es del auditado.',
    },
  ],
};
