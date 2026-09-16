import { ENSControl } from '../types';

// Catálogo heredado de op.exp.3. La fuente de verdad es `catalog/op-exp-3.ts`
// y `core/evidence/catalog.ts`; este fichero repite lo mismo en la forma antigua
// y tiene que decir lo mismo.
export const opExp3Control: ENSControl = {
  id: 'op.exp.3',
  title: 'Gestión de la configuración de seguridad',
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
      status: 'NO_CUMPLE',
      condition:
        'op.exp.3 → requisitos base op.exp.3.1 a op.exp.3.6. Sin integración con los resultados SCA del manager, con el sistema de gestión de cambios, con op.exp.4 y con op.exp.7, los requisitos .1 a .5 no se pueden evidenciar: el techo técnico hoy es op.exp.3.6.',
    },
    medio: {
      status: 'NO_CUMPLE',
      condition:
        'op.exp.3 + R1 → base + op.exp.3.r1.1 (documental, P-ATT) + op.exp.3.r1.2 (EV-03 y EV-11) + op.exp.3.r1.3 (EV-04).',
    },
    alto: {
      status: 'NO_CUMPLE',
      condition:
        'op.exp.3 + R1 + R2 + R3 → base + R1 + op.exp.3.r2.1 (EV-08) + op.exp.3.r3.1 (EV-09). R4 y R5 no son exigibles en ninguna categoría.',
    },
  },
  requirements: [
    {
      id: 'op.exp.3.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Funcionalidad mínima mantenida en el tiempo',
      description:
        'Se mantenga en todo momento la regla de «funcionalidad mínima» ([op.exp.2]).',
      evidences: ['EV-01', 'EV-04', 'EV-10'],
    },
    {
      id: 'op.exp.3.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Mínimo privilegio mantenido en el tiempo',
      description:
        'Se mantenga en todo momento la regla de «mínimo privilegio» ([op.exp.2]).',
      evidences: ['EV-01', 'EV-10'],
    },
    {
      id: 'op.exp.3.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Cambios previamente autorizados',
      description:
        'El sistema se adapte a las nuevas necesidades, previamente autorizadas. (Ver [op.acc.4]).',
      evidences: ['EV-05'],
    },
    {
      id: 'op.exp.3.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Reacción a vulnerabilidades notificadas',
      description:
        'El sistema reaccione a vulnerabilidades notificadas. (Ver [op.exp.4]).',
      evidences: ['EV-06'],
    },
    {
      id: 'op.exp.3.5',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Reacción a incidentes',
      description:
        'El sistema reaccione a incidentes. (Ver [op.exp.7]).',
      evidences: ['EV-07'],
    },
    {
      id: 'op.exp.3.6',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Solo personal autorizado edita la configuración',
      description:
        'La configuración de seguridad solamente podrá editarse por personal debidamente autorizado.',
      evidences: ['EV-02'],
    },
    {
      id: 'op.exp.3.r1.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Línea base de configuración autorizada (R1)',
      description:
        'Existirán configuraciones hardware/software, autorizadas y mantenidas regularmente, para los servidores, elementos de red y estaciones de trabajo.',
      evidences: [],
      active: false,
    },
    {
      id: 'op.exp.3.r1.2',
      level: ['MEDIO', 'ALTO'],
      title: 'Verificación periódica frente a la línea base (R1)',
      description:
        'Se verificará periódicamente la configuración hardware/software del sistema para asegurar que no se han introducido ni instalado elementos no autorizados.',
      evidences: ['EV-03', 'EV-11'],
      active: false,
    },
    {
      id: 'op.exp.3.r1.3',
      level: ['MEDIO', 'ALTO'],
      title: 'Lista de servicios autorizados (R1)',
      description:
        'Se mantendrá una lista de servicios autorizados para servidores y estaciones de trabajo.',
      evidences: ['EV-04'],
      active: false,
    },
    {
      id: 'op.exp.3.r2.1',
      level: ['ALTO'],
      title: 'Número muy limitado de administradores (R2)',
      description:
        'La configuración de seguridad del sistema operativo y aplicaciones, tanto de estaciones y servidores como de la electrónica de red del sistema, será responsabilidad de un número muy limitado de administradores del sistema.',
      evidences: ['EV-08'],
      active: false,
    },
    {
      id: 'op.exp.3.r3.1',
      level: ['ALTO'],
      title: 'Copias de configuración para reconstruir (R3)',
      description:
        'Se realizarán copias de seguridad de la configuración del sistema de forma que sea posible reconstruirlo en parte o en su totalidad tras un incidente.',
      evidences: ['EV-09'],
      active: false,
    },
    {
      id: 'op.exp.3.r4.1',
      level: [],
      title: 'Configuración por procedimiento de actualización (R4)',
      description:
        'Refuerzo R4 – Aplicación de la configuración: La configuración de seguridad del sistema operativo y de las aplicaciones se mantendrá actualizada a través de una aplicación o procedimiento manual que permita la instalación de las correspondientes modificaciones de versión y actualizaciones de seguridad oportunas.',
      evidences: [],
    },
    {
      id: 'op.exp.3.r5.1',
      level: [],
      title: 'Herramientas de estado de dispositivos de red (R5)',
      description:
        'Refuerzo R5 – Control del estado de seguridad de la configuración: Se dispondrá de herramientas que permitan conocer de forma periódica el estado de seguridad de la configuración de los dispositivos de red y, en el caso de que resulte deficiente, permitir su corrección.',
      evidences: [],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.exp.3.1', 'op.exp.3.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Mantenimiento en el tiempo de la línea base',
      description:
        'Ejecución periódica y sostenida de las políticas SCA, con seguimiento de la evolución del cumplimiento por activo. A diferencia de op.exp.2, aquí lo relevante no es el resultado puntual sino la SERIE: demuestra que la funcionalidad mínima y el mínimo privilegio se mantienen «en todo momento».',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['op.exp.3.6'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ediciones de la configuración de seguridad y su autor',
      description:
        'Toda escritura sobre las rutas de configuración de seguridad (P-04) registrada por auditd, con la cuenta de la sesión que la hizo, la operación, el proceso y el intervalo en que ocurrió. En un servidor LDAP incluye los cambios de cn=config con la identidad del directorio que los hizo. Es la evidencia directa de op.exp.3.6.',
      format: 'json_line',
      events: ['evidence_state', 'config_file_modified'],
      wazuhRuleIds: ['110401'],
    },
    {
      id: 'EV-03',
      requirement: ['op.exp.3.r1.2'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Elementos no autorizados introducidos en el sistema',
      description:
        'Software instalado de nuevo en el activo (no actualizado) y pedido de forma explícita, leído de dpkg.log y del historial de apt, con quién lo pidió y cuántas dependencias trajo. Se contrasta contra el software autorizado sobre la línea base (P-01). Es la verificación de elementos introducidos que exige op.exp.3.r1.2.',
      format: 'json_line',
      events: ['evidence_state', 'software_installed'],
      wazuhRuleIds: ['110402'],
    },
    {
      id: 'EV-04',
      requirement: ['op.exp.3.1', 'op.exp.3.r1.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Servicios en ejecución frente a la lista autorizada',
      description:
        'Servicios en ejecución en cada activo (unidades de systemd y procesos que escuchan en red fuera de ellas; en un servidor LDAP, además, los módulos, backends, overlays y puntos de escucha de slapd), con el perfil que identifica a la máquina en P-02. Cubre op.exp.3.r1.3 y, por remisión a op.exp.2, la parte de funcionalidad mínima de op.exp.3.1.',
      format: 'json_line',
      events: ['evidence_state', 'service_running'],
      wazuhRuleIds: ['110403'],
    },
    {
      id: 'EV-05',
      requirement: ['op.exp.3.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Cambios de configuración frente a su autorización previa',
      description:
        'Correlación entre cada edición de la configuración registrada por EV-02 y el cambio aprobado que la autoriza en el sistema de gestión de cambios declarado en P-06. Un cambio sin autorización asociada incumple op.exp.3.3. Requiere integración con el ITSM del cliente.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['op.exp.3.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Reacción de la configuración ante vulnerabilidades notificadas',
      description:
        'Seguimiento de las vulnerabilidades detectadas en los activos y de si la configuración se ha ajustado o se ha aplicado la actualización correspondiente. op.exp.3.4 remite a op.exp.4, que es quien mide la remediación con el detector de vulnerabilidades del manager.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['op.exp.3.5'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Reacción de la configuración ante incidentes',
      description:
        'Verificación de que, tras un incidente de seguridad registrado, se produjeron los cambios de configuración correspondientes en los activos afectados, o consta por qué no procedían. op.exp.3.5 remite a op.exp.7. Requiere el registro de incidentes.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['op.exp.3.r2.1'],
      level: ['ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Concentración de la administración de la configuración (R2)',
      description:
        'Número de cuentas distintas que han editado de verdad la configuración de seguridad en la ventana de observación, contado sobre lo que registra EV-02. Mide cuántos administradores hay en la práctica, no cuántos están autorizados. Solo se emite cuando la ventana entera se ha observado sin huecos.',
      format: 'json_line',
      events: ['evidence_state', 'config_admins_observed'],
      wazuhRuleIds: ['110404'],
    },
    {
      id: 'EV-09',
      requirement: ['op.exp.3.r3.1'],
      level: ['ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Existencia y frescura de las copias de configuración (R3)',
      description:
        'Instante de la copia más reciente de la configuración, del alcance que peor está (el sistema; en un servidor LDAP, además, cn=config). Se mide su antigüedad contra el reloj y el plazo de P-10. Sin ninguna copia no hay hecho y no se acredita la capacidad de reconstrucción que exige op.exp.3.r3.1.',
      format: 'json_line',
      events: ['evidence_state', 'config_backup_observed'],
      wazuhRuleIds: ['110405'],
    },
    {
      id: 'EV-10',
      requirement: ['op.exp.3.1', 'op.exp.3.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Regresiones del estado de seguridad de la configuración',
      description:
        'Checks SCA que pasaron de conforme a no conforme entre dos evaluaciones sucesivas, por activo. Es el indicador más directo de que la gestión continua de la configuración falla. Requiere la serie de resultados SCA del manager.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-11',
      requirement: ['op.exp.3.r1.2'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Verificación periódica de la configuración frente a la línea base',
      description:
        'Fecha de la verificación formal más reciente de la configuración hardware/software frente a la línea base aprobada, anotada por la organización en el registro del runbook, contrastada con la periodicidad de P-05. Acredita la periodicidad que exige op.exp.3.r1.2.',
      format: 'json_line',
      events: ['evidence_state', 'baseline_verification_performed'],
      wazuhRuleIds: ['110406'],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'baseline_configuracion_autorizada',
      description:
        'Software cuya instalación está autorizada sobre la línea base aprobada: un paquete por línea, con el nombre exacto que usa el gestor de paquetes (nmap, postgresql-16). El agente emite cada paquete instalado de nuevo, y todo el que no figure aquí es un elemento no autorizado introducido en el sistema. Las dependencias automáticas no hace falta declararlas: llegan con el paquete que las trae. La línea base aprobada en sí (el documento) se acredita en P-ATT para op.exp.3.r1.1.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.1', 'op.exp.3.r1.2'],
      type: 'list',
      usage:
        'EV-03 con NINGUNO_FUERA_DE_LISTA: todo paquete introducido tiene que figurar en esta lista. Sin instalaciones en la ventana y con el recolector confirmando que leyó el registro, cumple.',
      missingBehavior:
        'EV-03 NO_EVALUABLE (causa CONFIGURATION): sin la lista de software autorizado no se puede decidir si lo instalado estaba autorizado, y op.exp.3.r1.2 no acredita.',
    },
    {
      id: 'P-02',
      name: 'lista_servicios_autorizados',
      description:
        'Una fila por perfil de máquina con los servicios que tiene autorizados, separados por comas y escritos como los emite el agente: unidades de systemd (ssh.service, cron.service; las instancias como getty@.service) y procesos que escuchan en red fuera de systemd (proceso:nombre). El perfil es, por defecto, el nombre corto del host; varias máquinas pueden compartir perfil fijando OPEXP3_PERFIL en su .env. Puede coincidir con la lista de op.exp.2; aquí se usa para demostrar que se MANTIENE.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.1', 'op.exp.3.r1.3'],
      type: 'table',
      usage:
        'EV-04 con CONFORME_A_TABLA: cada servicio observado tiene que estar en la celda de su perfil. Un perfil sin fila no es un incumplimiento, es una decisión sin escribir: NO_EVALUABLE con causa CONFIGURATION.',
      missingBehavior:
        'EV-04 NO_EVALUABLE: op.exp.3.1 y op.exp.3.r1.3 no acreditan. Además bloquea el control: es obligatorio.',
    },
    {
      id: 'P-03',
      name: 'administradores_configuracion',
      description:
        'Cuentas autorizadas a editar la configuración de seguridad, una por línea y tal como las emite el agente: la cuenta de la sesión que hizo el cambio aunque pasara por sudo (dioni, no root). Los cambios sin sesión (un paquete que se actualiza, un servicio) llegan con la cuenta del proceso, normalmente root: declararla aquí acepta esos cambios, y no declararla los deja como hallazgo para que se revisen. En un servidor LDAP, las identidades del directorio que cambian cn=config van por su RDN (cn=config, gidNumber=0+uidNumber=0). La comparación es literal y distingue mayúsculas.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.6', 'op.exp.3.r2.1'],
      type: 'list',
      usage:
        'EV-02 con NINGUNO_FUERA_DE_LISTA: ningún actor observado puede quedar fuera de esta lista. Sin ediciones y con el recolector confirmando que todas las rutas estaban vigiladas, cumple.',
      missingBehavior:
        'op.exp.3.6 NO EVALUABLE: no se puede distinguir un cambio legítimo de uno no autorizado. Además bloquea el control: es obligatorio.',
    },
    {
      id: 'P-04',
      name: 'rutas_configuracion_seguridad',
      description:
        'Ficheros y directorios que contienen la configuración de seguridad y se vigilan con auditd, una ruta absoluta por línea. Tienen que ser las mismas que declara el fichero de reglas de auditd del runbook (/etc/audit/rules.d/ensfacil-opexp3.rules): lo que se declara aquí y lo que se vigila allí son las dos mitades de EV-02. El agente comprueba ruta a ruta que el kernel la vigila en escritura; el motor no puede comprobar que coincidan con esta lista, así que mantenerlas iguales es responsabilidad de quien las declara.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.6', 'op.exp.3.1', 'op.exp.3.2'],
      type: 'list',
      usage:
        'Documental: dice al auditor qué configuración se considera de seguridad. El juicio de EV-02 se hace contra P-03.',
      missingBehavior:
        'No queda escrito qué se considera configuración de seguridad. Bloquea el control: es obligatorio.',
    },
    {
      id: 'P-05',
      name: 'periodicidad_verificacion_config_dias',
      description:
        'Cada cuántos días debe hacerse, como mucho, una verificación formal de la configuración hardware/software frente a la línea base aprobada (op.exp.3.r1.2). El ENS exige verificación «periódica» sin fijar plazo. La verificación la anota la organización en el registro del runbook (opexp3-verificaciones.tsv).',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.2'],
      type: 'duration_days',
      usage:
        'EV-11 con ANTIGUEDAD_MAXIMA: la verificación más reciente no puede ser más antigua que este plazo. Sin ninguna verificación anotada no cumple nunca.',
      missingBehavior:
        'EV-11 NO_EVALUABLE (causa CONFIGURATION) y op.exp.3.r1.2 no acredita. No se aplica ningún plazo por defecto: el motor no juzga contra un valor que nadie ha declarado.',
    },
    {
      id: 'P-06',
      name: 'procedimiento_autorizacion_cambios',
      description:
        'Referencia al procedimiento de autorización previa de cambios de configuración y al sistema de gestión de cambios donde se aprueban (Jira, GLPI, ServiceNow). op.exp.3.3 exige que cada cambio esté previamente autorizado, y eso solo se puede medir correlacionando cada edición que registra EV-02 con su cambio aprobado. Esa integración no existe todavía en ENSFácil: mientras tanto este parámetro deja escrita la referencia, pero no desbloquea ninguna medida.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.3'],
      type: 'string',
      usage:
        'Documental hasta que exista la integración con el ITSM. No se juzga contra nada.',
      missingBehavior:
        'No queda escrita la referencia al procedimiento. op.exp.3.3 sigue sin evidenciar mientras no haya integración, esté o no configurado.',
    },
    {
      id: 'P-07',
      name: 'config_backup_destino',
      description:
        'Qué configuración se copia y adónde, una fila por alcance, para permitir la reconstrucción tras un incidente (R3). Es la declaración que lee el auditor; el plazo medible es P-10, y dónde busca el agente las copias en cada máquina se ajusta en su .env (OPEXP3_COPIAS_CONFIG).',
      level: ['ALTO'],
      requirements: ['op.exp.3.r3.1'],
      type: 'table',
      usage:
        'Documental: ninguna primitiva lo contrasta contra un hecho.',
      missingBehavior:
        'No queda escrito dónde se copian las configuraciones. No bloquea el juicio de EV-09, que se hace contra P-10.',
    },
    {
      id: 'P-08',
      name: 'umbral_desviacion_baseline',
      description:
        'Grado de desviación respecto a la línea base que se considera aceptable. Se declara porque es la política escrita, pero hoy ninguna primitiva lo aplica: EV-03 juzga con tolerancia cero (todo paquete introducido tiene que estar autorizado en P-01), que es el extremo estricto. Un porcentaje exigiría conocer la línea base completa paquete a paquete, y eso no es lo que se declara.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.2'],
      type: 'number',
      usage:
        'Documental. El juicio de EV-03 es de tolerancia cero.',
      missingBehavior:
        'Sin efecto sobre el juicio: se aplica tolerancia cero en cualquier caso.',
    },
    {
      id: 'P-09',
      name: 'max_administradores_configuracion',
      description:
        'Número máximo de cuentas distintas que pueden editar de verdad la configuración de seguridad en la ventana de observación (30 días por defecto). Es el «número muy limitado» que exige R2 en categoría ALTA. Se cuenta lo que ocurre, no lo que está autorizado: una cuenta autorizada en P-03 que no edita nada no suma.',
      level: ['ALTO'],
      requirements: ['op.exp.3.r2.1'],
      type: 'number',
      usage:
        'EV-08 con UMBRAL_MAXIMO: el recuento observado no puede superar este número.',
      missingBehavior:
        'EV-08 NO_EVALUABLE (causa CONFIGURATION) y op.exp.3.r2.1 no acredita.',
    },
    {
      id: 'P-10',
      name: 'antiguedad_maxima_copia_configuracion_horas',
      description:
        'Horas que puede tener, como mucho, la copia más reciente de la configuración para que el sistema se considere reconstruible (R3). Con varios alcances cuenta el que peor está. Es la frecuencia de P-07 expresada como plazo: 24 para una copia diaria, 168 para una semanal.',
      level: ['ALTO'],
      requirements: ['op.exp.3.r3.1'],
      type: 'duration_hours',
      usage:
        'EV-09 con ANTIGUEDAD_MAXIMA: mide contra el reloj, así que la antigüedad crece sola si las copias se paran.',
      missingBehavior:
        'EV-09 NO_EVALUABLE (causa CONFIGURATION) y op.exp.3.r3.1 no acredita.',
    },
    {
      id: 'P-ATT',
      name: 'atestaciones_documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control solo hay uno: op.exp.3.r1.1, que la configuración hardware/software de servidores, elementos de red y estaciones está AUTORIZADA y se mantiene. Eso lo dice un documento aprobado, no una máquina.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.1'],
      type: 'table',
      usage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      missingBehavior:
        'op.exp.3.r1.1 queda sin acreditar y cuenta en contra en MEDIO y ALTO: lo que no se puede demostrar, no cumple.',
    },
  ],
  events: ['evidence_state', 'config_file_modified', 'software_installed', 'service_running', 'config_admins_observed', 'config_backup_observed', 'baseline_verification_performed', 'collector_run', 'collector_warning', 'collector_missing'],
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
