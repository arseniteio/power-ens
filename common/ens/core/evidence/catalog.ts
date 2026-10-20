import { ENSEvidenceDefinition } from './types';

// `relatedRules` lists the REAL numeric rule IDs deployed in the runbook `manager/` copy (agent/rules/ensfacil_<control>_*.xml), taken from each `evidencia=`.
// Excluded: `level="0"` rules, inert rules (106923), collector diagnostics (106830/106831), and the aggregate event types
// (`control_state`, `score_snapshot`), which speak about a requirement or level, not about one evidence.
// Generic `evidence_state` rules are not listed: engine.ts adds the event's own ruleId.
// Rule IDs must exist in the DEPLOYED manager files and mean the same evidence there; `tests/check-consistency.py` checks it.
//
// `expectedEventTypes` is the contract with the agent: only events whose `eventType` is listed resolve the evidence,
// and only names emitted by the deployed rules belong there. Check 4 of `tests/check-consistency.py` guards it.
export const ENSEvidenceCatalog: ENSEvidenceDefinition[] = [
  // mp.info.6, rules band 106600-106799, shared by both backup origins (Proxmox PBS and Zimbra). The collector emits FACTS
  // with the common contract (`origen`, `objeto`) and an `evidence_state` only when it could not look; the verdict comes from
  // `policies/mp-info-6.policy.ts`. No evidence declares `judgment`: judgment is per backup (origin, object, `backup_id`), worst wins.
  //
  // State facts are reissued whole on every pass; the restore test is an ACTION judged by the window. The last pass is delimited
  // by `origen` because the mailbox server has two collectors. Since the collector only declares gaps, an old verdict inside the
  // window resolves nothing (`agentDeclaresOnlyGaps`).
  {
    id: 'EV-01',
    controlId: 'mp.info.6',
    title: 'Última copia realizada correctamente',
    description:
      'Estado de cada copia en la última pasada del recolector (`backup_run`): cuándo terminó bien por última vez, cuándo falló, el resultado de la última ejecución, su tipo y su destino. Una copia por origen (PBS, Zimbra) y objeto (ficheros, buzones, directorio). Incumple también si dejó fuera puntos de montaje de otro disco que no se incluyeron expresamente, salvo los que la organización acepta a propósito.',
    requirements: ['mp.info.6.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'EXECUTION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: ['evidence_state', 'backup_run'],
    stateFactEventTypes: ['backup_run'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106601'],
    auditQuestion: '¿Existe evidencia reciente de que la copia de seguridad se ha realizado correctamente?',
    qualityRequirements: {
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-02',
    controlId: 'mp.info.6',
    title: 'Copia dentro del intervalo permitido',
    description:
      'Antigüedad de la última copia correcta de cada copia (`backup_run`) frente a P-01 más el margen de P-02, y su planificación (`backup_schedule`: el cron real o `zmschedulebackup`) frente a P-01.',
    requirements: ['mp.info.6.1', 'mp.info.6.2.a'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'backup_run', 'backup_schedule'],
    stateFactEventTypes: ['backup_run', 'backup_schedule'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106601', '106602'],
    auditQuestion: '¿La última copia se encuentra dentro del intervalo máximo definido por la organización?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.info.6',
    title: 'Retención de las copias',
    description:
      'Retención configurada de cada copia (`backup_retention`) frente a P-03, con la copia más antigua que se conserva.',
    requirements: ['mp.info.6.2.b', 'mp.info.6.2.d'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API', 'SCA'],
    expectedEventTypes: ['evidence_state', 'backup_retention'],
    stateFactEventTypes: ['backup_retention'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106603'],
    auditQuestion: '¿Existe una política de retención configurada y verificable para las copias de seguridad?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.info.6',
    title: 'Acceso autorizado al repositorio',
    description:
      'Quién puede leer el repositorio de cada copia (`backup_access`: ruta, modo, propietario, grupo y cuentas con lectura) frente a P-07, y los permisos de la clave de cifrado de las copias: solo la puede leer su dueño (0600 o 0400).',
    requirements: ['mp.info.6.2.d'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'backup_access'],
    stateFactEventTypes: ['backup_access'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106604'],
    auditQuestion: '¿El acceso al repositorio de copias está limitado a usuarios y procesos autorizados?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.info.6',
    title: 'Prueba de restauración del testigo',
    description:
      'Pruebas de restauración sobre el testigo de cada copia (`restore_test`: fichero, cuenta de buzón o volcado del directorio): si restauró, si el contenido coincide con el esperado y si lo restaurado se pudo borrar después, frente al plazo de P-05.',
    requirements: ['mp.info.6.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'RECOVERY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    // Action, not state: each test counts inside the window.
    expectedEventTypes: ['evidence_state', 'restore_test'],
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106606'],
    auditQuestion: '¿Existe evidencia de una prueba de restauración correcta dentro del periodo definido?',
    qualityRequirements: {
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-06',
    controlId: 'mp.info.6',
    title: 'Copia fuera de la máquina',
    description:
      'Destinos de cada copia (`backup_storage`): si están en la misma máquina, de qué tipo son (local, montaje, remoto) y si están activos. Acredita el almacenamiento en otros lugares y la copia en ubicación alternativa de R2; como la copia físicamente separada solo se exige en ALTO, solo aplica en ese nivel.',
    requirements: ['mp.info.6.2.c', 'mp.info.6.r2.1'],
    levels: ['ALTO'],
    category: 'OFFSITE',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: ['evidence_state', 'backup_storage'],
    stateFactEventTypes: ['backup_storage'],
    stateFactCollectorField: 'origen',
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106605'],
    auditQuestion: '¿Existe una copia en ubicación alternativa operativa cuando el nivel ENS lo exige?',
    qualityRequirements: {
      rejectSynthetic: true,
    },
  },
  {
    // Collector heartbeat (106797): which evidences it declares covered.
    id: 'EV-07',
    controlId: 'mp.info.6',
    title: 'Latido del recolector de copias',
    description:
      'Última pasada del recolector de copias en la máquina (`collector_run`): su resultado, su papel (PBS, buzones, directorio) y las evidencias que declara cubiertas. Sin una pasada reciente y completa, lo que dicen los demás hechos no describe el estado de hoy.',
    requirements: ['mp.info.6.1', 'mp.info.6.2.b', 'mp.info.6.2.c'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'TRACEABILITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'collector_run'],
    agentDeclaresOnlyGaps: true,
    relatedRules: ['106797'],
    auditQuestion: '¿Los eventos de backup y restauración son interpretados correctamente por Wazuh y ENSFácil?',
  },
  {
    id: 'EV-01',
    controlId: 'op.acc.1',
    title: 'Inventario de cuentas activas',
    description:
      'Existe un inventario de las cuentas de usuario activas en los sistemas monitorizados que permite verificar la unicidad del identificador.',
    requirements: ['op.acc.1.3', 'op.acc.1.4', 'op.acc.1.r1.2', 'op.acc.1.r1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API', 'SCA'],
    expectedEventTypes: ['evidence_state', 'account_inventory', 'account_active'],
    relatedRules: ['106809', '106810', '106811'],
    auditQuestion:
      '¿Existe un inventario actualizado de cuentas activas con identificador único por entidad?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.1',
    title: 'Cambios en ficheros de identidad',
    description:
      'Se detectan modificaciones en los ficheros o repositorios que controlan las identidades del sistema.',
    requirements: ['op.acc.1.3', 'op.acc.1.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: [
      'evidence_state',
      'account_created',
      'account_modified',
      'account_deleted',
    ],
    relatedRules: ['106812', '106813', '106818'],
    auditQuestion:
      '¿Se detectan y controlan las modificaciones no autorizadas sobre las cuentas del sistema?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.1',
    title: 'Detección de cuentas genéricas o compartidas',
    description:
      'No se detecta autenticación exitosa con cuentas genéricas o compartidas que rompan la unicidad del identificador.',
    requirements: ['op.acc.1.1', 'op.acc.1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'account_authenticated',
      'generic_account_login',
      'auth_success',
    ],
    relatedRules: ['106801', '106802', '106873'],
    auditQuestion:
      '¿Se garantiza que no se utilizan cuentas genéricas o compartidas para el acceso al sistema?',

    // First evidence decided by the engine. The agent emits `account_authenticated` without qualifying it and the engine judges it against P-04.
    // `factEventTypes` keeps the two old names on purpose: an outdated agent still emits them and their `usuario` field is a usable fact;
    // only the old `estado` is discarded.
    judgment: {
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-04',
      factEventTypes: [
        'account_authenticated',
        'generic_account_login',
        'auth_success',
      ],
      factField: 'usuario',
    },
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.1',
    title: 'Cuentas activas de usuarios dados de baja',
    description:
      'No existen cuentas que permanezcan habilitadas más tiempo del permitido tras la baja o cese del usuario.',
    requirements: ['op.acc.1.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: [
      'evidence_state',
      'account_disabled',
      'account_offboarding',
    ],
    relatedRules: ['106815', '106816', '106817'],
    auditQuestion:
      '¿Las cuentas de usuarios que causan baja se deshabilitan dentro del plazo definido?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.1',
    title: 'Cuentas de servicio con acceso interactivo',
    description:
      'No se detectan logins interactivos realizados con cuentas de proceso o servicio declaradas.',
    requirements: ['op.acc.1.2', 'op.acc.1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'account_authenticated',
      'service_account_interactive',
      'interactive_login',
    ],
    relatedRules: ['106805', '106806', '106873'],
    auditQuestion:
      '¿Se impide que las cuentas de servicio se utilicen para accesos interactivos?',

    // Migrated. Shares the raw fact of EV-03; only the list it is checked against changes (P-03 instead of P-04).
    // Old names may be readmitted only when together they cover the SAME population as the new fact. Here they do (offenders plus the rest);
    // when the old name covered only offenders (`unauthorized_user` in EV-07) readmitting it would fabricate a CUMPLE over a biased sample.
    judgment: {
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-03',
      factEventTypes: [
        'account_authenticated',
        'service_account_interactive',
        'interactive_login',
      ],
      factField: 'usuario',
    },
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.1',
    title: 'Uso multi-rol sin identificadores diferenciados',
    description:
      'No se detecta un mismo identificador utilizado con privilegios administrativos y de usuario normal sin identificadores separados.',
    requirements: ['op.acc.1.2', 'op.acc.1.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'multi_role_usage', 'privilege_use'],
    relatedRules: ['106807', '106808'],
    auditQuestion:
      '¿Cada rol de un usuario dispone de un identificador diferenciado con sus privilegios delimitados?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.1',
    title: 'Estado de la lista de usuarios autorizados',
    description:
      'Existe y se mantiene actualizada una lista de usuarios autorizados contra la que se contrastan las cuentas activas (Refuerzo R1).',
    requirements: ['op.acc.1.r1.3'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: [
      'evidence_state',
      'account_active',
      'authorized_list_check',
      'unauthorized_user',
    ],
    relatedRules: ['106824', '106825', '106826', '106811'],
    auditQuestion:
      '¿Existe una lista actualizada de usuarios autorizados y todas las cuentas activas figuran en ella?',

    // Migrated: the authorized list lives only in P-07. First evidence pointing at a `table` parameter, hence `parameterColumn`
    // (P-07 is 'usuario | sistema | rol' and the user is what is compared); without it the engine compares nothing and says so.
    // The fact `account_active` (rule 106811) is shared with EV-01 (`evidence_id=EV-01,EV-07`).
    // `factEventTypes` does NOT readmit the old names: `unauthorized_user` covered only failing accounts and `authorized_list_check` has no `usuario`.
    judgment: {
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-07',
      parameterColumn: 'usuario',
      factEventTypes: ['account_active'],
      factField: 'usuario',
    },
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.1',
    title: 'Eliminación prematura de cuentas',
    description:
      'No se eliminan cuentas deshabilitadas antes de cumplir el periodo de retención definido.',
    requirements: ['op.acc.1.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'TRACEABILITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: [
      'evidence_state',
      'account_deleted',
      'retention_violation',
    ],
    relatedRules: ['106818', '106819'],
    auditQuestion:
      '¿Se conservan las cuentas deshabilitadas durante el periodo de retención antes de eliminarlas?',
  },

  {
    id: 'EV-01',
    controlId: 'op.acc.2',
    title: 'Verificación de permisos en recursos del sistema',
    description:
      'Comprobación automatizada de que los recursos del sistema (ficheros, directorios, servicios, puertos) tienen controles de acceso que impiden su uso no autorizado. Detecta world-writable no permitidos, permisos abiertos y umask insuficiente.',
    requirements: ['op.acc.2.1', 'op.acc.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'sca_check',
      'world_writable',
      'umask_check',
    ],
    // 106905 is the NO_CUMPLE pair of `sca_check`; 106901 is the generic CUMPLE and ignores `estado`.
    relatedRules: ['106901', '106902', '106903', '106904', '106905'],
    auditQuestion:
      '¿Los recursos del sistema tienen controles de acceso que impiden su uso no autorizado?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.2',
    title: 'Monitorización de ficheros y registros del SO',
    description:
      'Vigilancia de cambios (creación, modificación, eliminación, cambio de permisos) en los componentes del sistema operativo y sus ficheros o registros de configuración declarados en P-02.',
    requirements: ['op.acc.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: [
      'evidence_state',
      'fim_modified',
      'fim_added',
      'fim_deleted',
    ],
    relatedRules: ['106920', '106921', '106922'],
    auditQuestion:
      '¿Se detectan y controlan los cambios no autorizados en los componentes del sistema operativo?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.2',
    title: 'Detección de accesos denegados y escaladas de privilegio',
    description:
      'Captura de eventos de autenticación y autorización fallidos o exitosos que evidencian intentos de acceso a recursos sin los derechos suficientes. Incluye accesos denegados por ACL y uso de sudo/su.',
    requirements: ['op.acc.2.1', 'op.acc.2.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'access_denied',
      'privilege_escalation',
      'sudo_usage',
    ],
    relatedRules: ['106910', '106911', '106912'],
    auditQuestion:
      '¿Se registran los intentos de acceso a recursos sin los derechos suficientes?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.2',
    title: 'Verificación de ACLs y derechos de acceso por recurso',
    description:
      'Auditoría de que los derechos de acceso a cada recurso siguen la política interna (P-04) y las decisiones del responsable del recurso. Detecta recursos con ACLs que difieren de la tabla P-06.',
    requirements: ['op.acc.2.2', 'op.acc.2.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'acl_check', 'acl_deviation'],
    relatedRules: ['106913', '106914'],
    auditQuestion:
      '¿Los derechos de acceso a cada recurso siguen la política interna y las decisiones del responsable?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.2',
    title: 'Verificación de privilegios individuales por usuario (R1)',
    description:
      'Comprobación de que cada usuario autorizado tiene privilegios mantenidos individualmente y de que restringen el tipo de acceso según P-05 y P-06. Detecta usuarios con privilegios excesivos o sin definición individual.',
    requirements: ['op.acc.2.r1.1', 'op.acc.2.r1.2'],
    levels: ['ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'privilege_check',
      'excessive_privilege',
      'group_membership',
    ],
    // 106933 is the NO_CUMPLE pair of `privilege_check` (106930 is the generic CUMPLE).
    relatedRules: ['106930', '106931', '106932', '106933'],
    auditQuestion:
      '¿Cada usuario autorizado tiene privilegios mantenidos individualmente que restringen el tipo de acceso?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.2',
    title: 'Detección de accesos fuera del tipo permitido (R1)',
    description:
      'Identificación de accesos que superan el tipo de acceso autorizado para el usuario (lectura que intenta escribir, desarrollo que accede a producción, etc.). Requiere P-06 configurado.',
    requirements: ['op.acc.2.r1.2'],
    levels: ['ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'access_type_violation',
      'object_access',
    ],
    relatedRules: ['106935', '106936'],
    auditQuestion:
      '¿Se detectan accesos que superan el tipo de acceso autorizado para el usuario?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.2',
    title: 'Detección de vulnerabilidades de control de acceso en el SO',
    description:
      'El módulo rootcheck detecta configuraciones que debilitan el control de acceso: ficheros SUID/SGID no esperados, directorios con permisos excesivos, servicios corriendo con privilegios de root innecesariamente y ficheros sin propietario.',
    requirements: ['op.acc.2.1', 'op.acc.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'rootcheck',
      'suid_sgid',
      'no_owner_file',
    ],
    // 106924 is the NO_CUMPLE pair of `rootcheck` (106925 is the generic CUMPLE). It matters here because EV-07 is a negative assertion.
    relatedRules: ['106924', '106925', '106926', '106927'],
    auditQuestion:
      '¿Se detectan configuraciones del SO que debilitan el control de acceso (SUID/SGID, ficheros sin propietario)?',
  },
  {
    id: 'EV-01',
    controlId: 'op.acc.3',
    title: 'Detección de desarrollo y operación en la misma cuenta',
    description:
      'Identificación de cuentas que, dentro de la ventana P-06, han ejecutado tanto acciones clasificadas como desarrollo (según P-03) como acciones de operación. Vulnera directamente op.acc.3.1.',
    requirements: ['op.acc.3.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: detección de desarrollo y operación en la misma cuenta?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.3',
    title: 'Detección de autorización y control en la misma cuenta',
    description:
      'Identificación de cuentas que autorizan un acceso o cambio y a la vez ejercen la función de control o verificación sobre ese mismo ámbito. Vulnera op.acc.3.2.',
    requirements: ['op.acc.3.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: detección de autorización y control en la misma cuenta?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.3',
    title: 'Verificación de concurrencia en tareas críticas',
    description:
      'Comprobación de que las tareas declaradas como críticas en P-04 han sido ejecutadas o aprobadas por al menos el número de personas distintas exigido. Detecta tareas críticas realizadas unilateralmente.',
    // `op.acc.3` alone is the control id, not a requirement; the requirement is op.acc.3.2 (dual control declared in P-04).
    requirements: ['op.acc.3.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'critical_task_run'],
    relatedRules: ['107002'],
    auditQuestion:
      '¿Se acredita: verificación de concurrencia en tareas críticas?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.3',
    title: 'Detección de configuración y mantenimiento en la misma cuenta (R1)',
    description:
      'Identificación de cuentas que aúnan funciones de configuración del sistema y de mantenimiento dentro de la ventana P-06. Aplicable solo en nivel ALTO.',
    requirements: ['op.acc.3.r1.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: detección de configuración y mantenimiento en la misma cuenta (r1)?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.3',
    title: 'Cuentas de auditoría ejerciendo otras funciones (R1)',
    description:
      'Detección de cuentas incluidas en P-05 (auditoría/supervisión) que ejecutan acciones ajenas a su función: escritura, cambios de configuración, despliegues, gestión de usuarios. Vulnera op.acc.3.r1.2, que es taxativo (no admite el matiz «siempre que sea posible»).',
    requirements: ['op.acc.3.r1.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: cuentas de auditoría ejerciendo otras funciones (r1)?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.3',
    title: 'Inventario de acciones por cuenta y función',
    description:
      'Registro agregado de qué acciones ha ejecutado cada cuenta en el período, clasificadas por función según P-03. Es la evidencia documental de soporte para acreditar la segregación ante un auditor, incluso cuando no hay alertas.',
    requirements: ['op.acc.3.1', 'op.acc.3.2', 'op.acc.3.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_action'],
    relatedRules: ['107001'],
    auditQuestion:
      '¿Se acredita: inventario de acciones por cuenta y función?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.3',
    title: 'Acceso a la información de seguridad del sistema',
    description:
      'Monitorización de accesos a la configuración de seguridad, logs de auditoría y consolas de gestión, para verificar que solo los administradores de seguridad/sistema autorizados acceden. Corresponde al Refuerzo R3, no obligatorio pero recomendable.',
    requirements: ['op.acc.3.r3.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'security_info_access'],
    relatedRules: ['107003'],
    auditQuestion:
      '¿Se acredita: acceso a la información de seguridad del sistema?',
  },
  {
    id: 'EV-01',
    controlId: 'op.acc.4',
    title: 'Verificación de denegación por defecto',
    description:
      'Comprobación de que la configuración de los sistemas aplica denegación por defecto: políticas de firewall con DROP por defecto, servicios sin acceso anónimo, recursos compartidos sin permisos para «Todos» o «Everyone».',
    requirements: ['op.acc.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'default_deny_violation'],
    relatedRules: ['107101'],
    judgment: {
      // Each observed deviation from default-deny is checked against the declared exceptions; with none declared, any deviation fails.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'recurso',
      factEventTypes: ['default_deny_violation'],
      factField: 'recurso',
    },
    auditQuestion:
      '¿Se acredita: verificación de denegación por defecto?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.4',
    title: 'Contraste de privilegios reales contra matriz autorizada',
    description:
      'Extracción de los privilegios efectivamente configurados en los sistemas (ACLs, membresías de grupo, permisos sudo) y comparación con la matriz P-01. Detecta privilegios asignados sin autorización expresa y privilegios superiores al mínimo imprescindible.',
    requirements: ['op.acc.4.1', 'op.acc.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'privilege_grant'],
    relatedRules: ['107102'],
    judgment: {
      // Each effective privilege must match, cell by cell, its row in the declared matrix (an 'rw' where the matrix says 'r' fails).
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-01',
      factEventTypes: ['privilege_grant'],
      factField: 'sujeto',
      // `factKeyField` is the FACT field that identifies the row; `tableKeyColumn` is the TABLE column. Both are needed:
      // without `tableKeyColumn` the row index is empty and CONFORME_A_TABLA never matches.
      factKeyField: 'sujeto',
      tableKeyColumn: 'rol',
      // The row is identified by subject AND resource (a simple key judged sudo against the firewall row).
      factKeyFields: ['sujeto', 'recurso'],
      tableKeyColumns: ['rol', 'recurso'],
      tableChecks: [
        { column: 'recurso', factField: 'recurso' },
        { column: 'acceso', factField: 'acceso' },
      ],
    },
    auditQuestion:
      '¿Se acredita: contraste de privilegios reales contra matriz autorizada?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.4',
    title: 'Cambios en grupos privilegiados',
    description:
      'Detección de altas y bajas en los grupos declarados en P-06. Toda incorporación a un grupo privilegiado supone una concesión de derechos que debe estar contemplada en P-01 y realizada por personal competente (P-02).',
    requirements: ['op.acc.4.2', 'op.acc.4.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'privileged_group_member'],
    relatedRules: ['107103'],
    judgment: {
      // Every observed member of a privileged group must be in the matrix. The column is `rol` because the matrix declares profiles.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'rol',
      factEventTypes: ['privileged_group_member'],
      factField: 'usuario',
    },
    auditQuestion:
      '¿Se acredita: cambios en grupos privilegiados?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.4',
    title: 'Cambios de permisos por cuenta no competente',
    description:
      'Identificación de eventos de concesión, alteración o anulación de permisos ejecutados por cuentas que no figuran en P-02 como personal con capacidad de autorizar.',
    requirements: ['op.acc.4.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'permission_change'],
    relatedRules: ['107104'],
    judgment: {
      // The ACTOR is checked, not the subject of the change.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-02',
      // P-02 is a `cuenta | ambito` table; the column must be named or the whole row is compared with an account name.
      parameterColumn: 'cuenta',
      factEventTypes: ['permission_change'],
      factField: 'actor',
    },
    auditQuestion:
      '¿Se acredita: cambios de permisos por cuenta no competente?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.4',
    title: 'Control de la revisión periódica de permisos',
    description:
      'Registro de la fecha de la última revisión de permisos realizada y verificación de que no se ha superado el plazo P-03. La revisión puede detectarse por evidencias en el sistema o declararse en ENSFácil.',
    requirements: ['op.acc.4.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'permission_review'],
    relatedRules: ['107105'],
    judgment: {
      // The only EXISTENTIAL evidence of the control: a recent enough review suffices, and it never passes by absence.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-03',
      factEventTypes: ['permission_review'],
      factField: 'fecha',
    },
    auditQuestion:
      '¿Se acredita: control de la revisión periódica de permisos?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.4',
    title: 'Accesos remotos por canal, origen y usuario',
    description:
      'Registro de todas las conexiones remotas al sistema con identificación de canal, puerto, IP de origen y cuenta. Contraste contra los canales permitidos (P-04) y los usuarios autorizados (P-05).',
    requirements: ['op.acc.4.5'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'remote_access'],
    relatedRules: ['107106'],
    judgment: {
      // `NINGUNO_FUERA_DE_LISTA`, not `TODOS_EN_LISTA`: what is required is that nobody else enters, not that every authorized account does.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-05',
      factEventTypes: ['remote_access'],
      factField: 'usuario',
    },
    auditQuestion:
      '¿Se acredita: accesos remotos por canal, origen y usuario?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.4',
    title: 'Accesos a recursos sujetos a necesidad de conocer',
    description:
      'Monitorización de accesos a los recursos declarados en P-07, con identificación del perfil de la cuenta que accede. Detecta accesos por perfiles sin justificación declarada, aunque el permiso técnico exista.',
    requirements: ['op.acc.4.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'sensitive_access'],
    relatedRules: ['107107'],
    judgment: {
      // What is judged is whether the profile has a declared justification for the resource, not whether the technical permission exists.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-07',
      factEventTypes: ['sensitive_access'],
      factField: 'recurso',
      factKeyField: 'recurso',
      tableKeyColumn: 'recurso',
      tableChecks: [
        { column: 'perfiles', factField: 'perfil' },
      ],
    },
    auditQuestion:
      '¿Se acredita: accesos a recursos sujetos a necesidad de conocer?',
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.4',
    title: 'Cuentas con privilegios excesivos o innecesarios',
    description:
      'Identificación de cuentas cuyos privilegios exceden lo necesario: usuarios con shell innecesaria, cuentas de servicio con permisos de administrador, usuarios con sudo sin restricción de comandos (ALL=(ALL) ALL).',
    requirements: ['op.acc.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'excessive_privilege'],
    relatedRules: ['107108'],
    judgment: {
      // A privilege above the minimum is a FACT, not a verdict: it fails only if the subject is not in the matrix.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'rol',
      factEventTypes: ['excessive_privilege'],
      factField: 'sujeto',
    },
    auditQuestion:
      '¿Se acredita: cuentas con privilegios excesivos o innecesarios?',
  },
  // op.acc.5. The agent emits facts and each evidence is judged here against the screen. What no primitive expresses
  // (which reinforcement counts per P-01, R1 at MEDIO/ALTO, the documentary part of .8, P-09) is decided by `op-acc-5.policy.ts`.
  // EV-06 and EV-09 use P-02 as a FORBIDDEN list on purpose: a service outside P-02 is out of scope.
  {
    id: 'EV-01',
    controlId: 'op.acc.5',
    title: 'Registro de accesos con éxito y fallidos',
    description:
      'Ingesta y conservación de todos los eventos de autenticación de los servicios de P-02, tanto exitosos como fallidos. Es la evidencia central del Refuerzo R5, obligatorio en MEDIO y ALTO, y la base sobre la que se construyen el resto de detecciones del control.',
    requirements: ['op.acc.5.r5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'access_log_source', 'external_auth_success', 'external_auth_failure'],
    relatedRules: ['110002', '110011'],
    judgment: {
      // Each pass declares how many days each service keeps its authentication log; all must reach P-08. Successes and failures (110001, 110002) travel in the trace.
      primitive: 'UMBRAL_MINIMO',
      parameterId: 'P-08',
      factEventTypes: ['access_log_source'],
      factField: 'dias_conservados',
    },
    auditQuestion:
      '¿Se registran los accesos con éxito y fallidos de los servicios de P-02 y se conservan el periodo de P-08?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.5',
    title: 'Superación del límite de intentos sin bloqueo efectivo',
    description:
      'Límite de intentos que el servicio aplica (su política de bloqueo) y rachas de fallos consecutivos por cuenta. Cualquiera de los dos por encima de P-03 demuestra que el límite exigido por op.acc.5.8 no es el declarado o no es operativo. La política de complejidad viaja en la misma evidencia para op.acc.5.r1.2.',
    requirements: ['op.acc.5.8', 'op.acc.5.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'lockout_policy', 'failed_attempt_streak', 'password_policy'],
    relatedRules: ['110004', '110005', '110006'],
    judgment: {
      // One field for two facts: the CONFIGURED limit (`lockout_policy`) and the OBSERVED streak (`failed_attempt_streak`); neither may exceed P-03.
      // A disabled lockout arrives WITHOUT `intentos` (a 0 would pass the threshold) and the policy turns it into a failure.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-03',
      factEventTypes: ['lockout_policy', 'failed_attempt_streak'],
      factField: 'intentos',
    },
    auditQuestion:
      '¿El servicio limita los intentos a lo declarado en P-03 y el bloqueo es efectivo?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.5',
    title: 'Ataques de fuerza bruta y credential stuffing contra el servicio externo',
    description:
      'Fallos de autenticación agregados por origen: cuántos intentos y contra cuántas cuentas llegan desde una misma dirección. Un origen por encima de P-03 es un ataque que el mecanismo de bloqueo no ha contenido. Es el riesgo que op.acc.5.8 pretende mitigar.',
    requirements: ['op.acc.5.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_failures_by_origin'],
    relatedRules: ['110003'],
    judgment: {
      // Without failures there are no facts and the threshold does not pass by absence; the .8 policy accepts that silence only with the heartbeat covering EV-03.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-03',
      factEventTypes: ['auth_failures_by_origin'],
      factField: 'fallos',
    },
    auditQuestion:
      '¿Algún origen acumula más fallos de los que P-03 admite sin que se le contenga?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.5',
    title: 'Antigüedad de las credenciales frente a la periodicidad exigida',
    description:
      'Cálculo del tiempo transcurrido desde el último cambio de credencial de cada usuario externo activo, y contraste con la periodicidad P-05 fijada por la política de la organización.',
    requirements: ['op.acc.5.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_age'],
    relatedRules: ['110007'],
    judgment: {
      // An account whose last change is unknown arrives without `dias_desde_cambio` and the evidence stays unasserted.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-05',
      factEventTypes: ['credential_age'],
      factField: 'dias_desde_cambio',
    },
    auditQuestion:
      '¿Ninguna credencial activa de usuario externo supera la periodicidad de cambio de P-05?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.5',
    title: 'Reacción ante compromiso o fin de relación',
    description:
      'Medición del intervalo entre el evento de notificación de pérdida, compromiso o revelación de una credencial (o de fin de relación del usuario con el sistema) y el evento de inhabilitación efectiva de esa credencial. Contraste con el plazo máximo P-06.',
    requirements: ['op.acc.5.5', 'op.acc.5.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_disable_delay'],
    relatedRules: ['110008'],
    judgment: {
      // Pending items are reissued every pass with their hours; an undisabled notification fails by itself once P-06 passes.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-06',
      factEventTypes: ['credential_disable_delay'],
      factField: 'horas',
    },
    auditQuestion:
      '¿Las credenciales comprometidas o de relaciones terminadas se inhabilitan dentro de P-06?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.5',
    title: 'Verificación de mensajes de error no informativos',
    description:
      'Detección de respuestas del servicio que revelan información sobre el sistema o la cuenta en los rechazos de autenticación: mensajes que distinguen «usuario inexistente» de «contraseña incorrecta», estado de la cuenta, trazas de error, versiones del software. Vulnera op.acc.5.7.',
    requirements: ['op.acc.5.7'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_error_verbose'],
    relatedRules: ['110009'],
    judgment: {
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-02',
      parameterColumn: 'servicio',
      factEventTypes: ['auth_error_verbose'],
      factField: 'servicio',
    },
    auditQuestion:
      '¿Algún servicio de acceso externo revela información sobre la cuenta o el sistema al rechazar una autenticación?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.5',
    title: 'Mecanismo de autenticación efectivamente aplicado (R1 a R4)',
    description:
      'Verificación de que las autenticaciones con éxito usan efectivamente el mecanismo del refuerzo declarado en P-01: contraseña en R1, contraseña más OTP en R2, certificado con PIN o biometría en R3, certificado en soporte físico con PIN en R4. Detecta sesiones completadas sin el factor adicional.',
    requirements: ['op.acc.5.r1.1', 'op.acc.5.r2.1', 'op.acc.5.r3.2', 'op.acc.5.r4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'external_auth_success'],
    relatedRules: ['110001'],
    judgment: {
      // The agent CLASSIFIES the observed factors into the ENS class (R1..R4 or `ninguno`); P-01 says which class is required.
      // Lower class is a missing factor; higher class means P-01 does not describe the service.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-01',
      factEventTypes: ['external_auth_success'],
      factField: 'refuerzo',
    },
    auditQuestion:
      '¿Todas las autenticaciones con éxito usan el mecanismo del refuerzo declarado en P-01?',
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.5',
    title: 'Validación de certificados y estado de revocación (R3, R4)',
    description:
      'Comprobación de que los certificados presentados provienen de las autoridades admitidas en P-07 y de que se ejecuta la consulta de revocación (OCSP o CRL) que P-07 declara para cada una. Detecta aceptación de certificados sin validar revocación.',
    requirements: ['op.acc.5.r3.1', 'op.acc.5.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'certificate_validation'],
    relatedRules: ['110010'],
    judgment: {
      // A CA without a P-07 row is NO_EVALUABLE / CONFIGURATION, not NO_CUMPLE (the engine cannot tell 'not admitted' and 'not declared' apart).
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-07',
      factEventTypes: ['certificate_validation'],
      factField: 'emisor',
      factKeyField: 'emisor',
      tableKeyColumn: 'ac',
      tableChecks: [
        { column: 'validacion', factField: 'revocacion' },
      ],
    },
    auditQuestion:
      '¿Los certificados aceptados son de las AC de P-07 y se comprueba su revocación como P-07 declara?',
  },
  {
    id: 'EV-09',
    controlId: 'op.acc.5',
    title: 'Continuidad e integridad del registro de accesos',
    description:
      'Verificación de que el registro exigido por R5 no presenta lagunas: el registro de un servicio declarado que desaparece, o que encoge sin haber rotado. Una laguna en el registro compromete la acreditación de R5.',
    requirements: ['op.acc.5.r5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'access_log_gap'],
    relatedRules: ['110012'],
    judgment: {
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-02',
      parameterColumn: 'servicio',
      factEventTypes: ['access_log_gap'],
      factField: 'servicio',
    },
    auditQuestion:
      '¿El registro de accesos de los servicios de P-02 se conserva sin lagunas?',
  },
  {
    id: 'EV-01',
    controlId: 'op.acc.6',
    title: 'Registro de accesos con éxito y fallidos',
    description:
      'Barrido de las fuentes de autenticación declaradas en P-03 buscando huecos de registro: una fuente que no existe, que nunca ha registrado nada o cuya configuración no registra los accesos con éxito o los fallidos (LogLevel de sshd, olcLogLevel de slapd, journald sin almacenamiento). Los propios accesos (110101, 110102) son el registro que se acredita. Es la evidencia central del Refuerzo R5, obligatorio desde MEDIO.',
    requirements: ['op.acc.6.r5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_logging_gap', 'authentication_success', 'authentication_failure'],
    stateFactEventTypes: ['auth_logging_gap'],
    relatedRules: ['110101', '110102', '110105'],
    judgment: {
      // A logging gap fails only if the unlogged source is among those declared monitored. With the source looked at (heartbeat) and no gaps, silence passes.
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-03',
      factEventTypes: ['auth_logging_gap'],
      factField: 'fuente',
    },
    auditQuestion:
      '¿Registran las fuentes de autenticación declaradas los accesos con éxito y los fallidos, sin huecos?',
  },
  {
    id: 'EV-02',
    controlId: 'op.acc.6',
    title: 'Verificación del doble factor en accesos desde zona no controlada',
    description:
      'Cada acceso con éxito con su origen y los factores que el servidor verificó, y cada canal de autenticación en escucha con las direcciones en que escucha y el mínimo de factores que exige. El motor clasifica origen y direcciones contra las zonas controladas de P-02. Es la evidencia del Refuerzo R8, obligatorio desde nivel BAJO, y la de R1 (contraseña solo desde zona controlada) y R2 (segundo factor).',
    requirements: ['op.acc.6.r1.1', 'op.acc.6.r2.1', 'op.acc.6.r8.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // No `judgment` on purpose: classifying an address against CIDR ranges and requiring factors per zone is decided by the op-acc-6 policy.
    expectedEventTypes: ['evidence_state', 'authentication_success', 'remote_channel_listening'],
    stateFactEventTypes: ['remote_channel_listening'],
    relatedRules: ['110101', '110108'],
    auditQuestion:
      '¿Todo acceso desde o a través de zona no controlada ha verificado dos factores, y ningún canal expuesto fuera de zona controlada admite uno solo?',
  },
  {
    id: 'EV-03',
    controlId: 'op.acc.6',
    title: 'Límite de intentos y bloqueo efectivo de cuenta',
    description:
      'Configuración del límite de intentos de cada camino de autenticación con contraseña en uso (pam_faillock, pam_tally2 o la política del directorio): si hay bloqueo, tras cuántos fallos y si la cuenta se desbloquea sola. Se contrasta con P-05 y con la exigencia de que reactivar la cuenta requiera una intervención específica.',
    requirements: ['op.acc.6.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // No `judgment`: op.acc.6.8 is three simultaneous conditions, decided by the policy.
    expectedEventTypes: ['evidence_state', 'lockout_policy_checked', 'account_locked'],
    stateFactEventTypes: ['lockout_policy_checked'],
    relatedRules: ['110103', '110104'],
    auditQuestion:
      '¿Cada camino de autenticación con contraseña bloquea la cuenta tras P-05 fallos y exige una intervención para reactivarla?',
  },
  {
    id: 'EV-04',
    controlId: 'op.acc.6',
    title: 'Fallos acumulados sin bloqueo (fuerza bruta y password spraying)',
    description:
      'Fallos de autenticación agregados por cuenta, origen y canal en cada pasada, y bloqueos registrados. Una cuenta existente con más de P-05 fallos en una pasada sin bloqueo registrado evidencia que el límite no es operativo. Los fallos contra cuentas inexistentes se muestran como patrón de ataque pero no se pueden bloquear. Kerberoasting no aplica: no hay KDC.',
    requirements: ['op.acc.6.8'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // No `judgment`: correlates failures and lockouts per account; decided by the policy together with EV-03.
    expectedEventTypes: ['evidence_state', 'authentication_failure', 'account_locked'],
    relatedRules: ['110102', '110103'],
    auditQuestion:
      '¿Alguna cuenta acumula más fallos de los admitidos sin que se registre su bloqueo?',
  },
  {
    id: 'EV-05',
    controlId: 'op.acc.6',
    title: 'Antigüedad de credenciales y política de cambio',
    description:
      'Por cada credencial de una cuenta que puede autenticarse: su antigüedad en días (contraseña, desde /etc/shadow o pwdChangedTime; clave ssh, desde la fecha de su fichero, que es una cota inferior) y la caducidad que el sistema impone (99999 si no impone ninguna). Las dos medidas se contrastan con la periodicidad P-04.',
    requirements: ['op.acc.6.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_age_checked'],
    stateFactEventTypes: ['credential_age_checked'],
    relatedRules: ['110106'],
    judgment: {
      // No value may exceed P-04. A policy with no expiry (99999) does not guarantee periodic change.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-04',
      factEventTypes: ['credential_age_checked'],
      factField: 'dias',
    },
    auditQuestion:
      '¿Ninguna credencial supera la periodicidad de cambio P-04, y el sistema impone esa caducidad?',
  },
  {
    id: 'EV-06',
    controlId: 'op.acc.6',
    title: 'Reacción ante compromiso y baja de personal',
    description:
      'Horas entre cada notificación de compromiso o de baja anotada por la organización y la inhabilitación de la cuenta observada por el agente, o las que lleva habilitada si no se ha inhabilitado. Contraste con el plazo máximo P-06.',
    requirements: ['op.acc.6.5', 'op.acc.6.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'credential_disable_checked'],
    relatedRules: ['110107'],
    judgment: {
      // Not existential: EVERY notification must be attended in time. Without notifications it is NO_EVALUABLE.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-06',
      factEventTypes: ['credential_disable_checked'],
      factField: 'horas',
    },
    auditQuestion:
      '¿Toda credencial comprometida o de una persona que causó baja se inhabilitó dentro del plazo P-06?',
  },
  {
    id: 'EV-07',
    controlId: 'op.acc.6',
    title: 'Acceso remoto: canal y registro de auditoría',
    description:
      'Cada acceso remoto con éxito queda registrado con su canal, origen, usuario y métodos (el mismo hecho 110101 de EV-01 y EV-02). Se contrasta el canal con los autorizados en P-07. Cubre los apartados a) y d) de op.acc.6.r9.2; el cifrado y el uso constante de cada canal los cubre EV-08.',
    requirements: ['op.acc.6.r9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'authentication_success'],
    relatedRules: ['110101'],
    judgment: {
      // What is required is that nobody enters through another channel. Only REMOTE accesses arrive here (the console is not tagged EV-07).
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-07',
      parameterColumn: 'canal',
      factEventTypes: ['authentication_success'],
      factField: 'canal',
    },
    auditQuestion:
      '¿Todo acceso remoto registrado entró por un canal autorizado en P-07?',
  },
  {
    id: 'EV-08',
    controlId: 'op.acc.6',
    title: 'Canales de acceso remoto: cifrado y habilitación',
    description:
      'Cada canal de acceso remoto en escucha fuera de loopback, con el cifrado que exige (ssh sí; ldap sin TLS obligatorio, no) y si arranca siempre. Se casa con su fila de P-07: el cifrado tiene que coincidir, y un canal que arranca siempre tiene que estar declarado de uso constante. Cubre los apartados b) y c) de op.acc.6.r9.2.',
    requirements: ['op.acc.6.r9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'remote_channel_listening'],
    stateFactEventTypes: ['remote_channel_listening'],
    relatedRules: ['110108'],
    judgment: {
      // A channel without a row is an undecided case, not a proven failure. `uso_constante` is checked against `habilitado_permanente`.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-07',
      factEventTypes: ['remote_channel_listening'],
      factField: 'canal',
      factKeyField: 'canal',
      tableKeyColumn: 'canal',
      tableChecks: [
        { column: 'cifrado', factField: 'cifrado' },
        { column: 'uso_constante', factField: 'habilitado_permanente' },
      ],
    },
    auditQuestion:
      '¿Cada canal remoto en escucha está autorizado en P-07, cifra como declara y solo está habilitado siempre si su uso es constante?',
  },
  {
    id: 'EV-09',
    controlId: 'op.acc.6',
    title: 'Renovación de autenticación en puntos críticos (R6)',
    description:
      'Barrido de las configuraciones que permiten ejecutar un punto crítico sin volver a autenticarse: sudo con NOPASSWD o !authenticate, credencial de sudo sin caducidad, su con pam_wheel trust. Se contrasta con los puntos declarados en P-08. Obligatorio en nivel ALTO.',
    requirements: ['op.acc.6.r6.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'reauthentication_not_required'],
    stateFactEventTypes: ['reauthentication_not_required'],
    relatedRules: ['110109'],
    judgment: {
      // P-08 lists the points where the session is NOT enough. A finding on a declared point fails; on an undeclared one it does not.
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-08',
      factEventTypes: ['reauthentication_not_required'],
      factField: 'punto',
    },
    auditQuestion:
      '¿Ningún punto declarado en P-08 se puede ejecutar amparándose solo en la sesión establecida?',
  },
  {
    id: 'EV-10',
    controlId: 'op.acc.6',
    title: 'Credenciales activas sin utilización prolongada (R7)',
    description:
      'Por cada cuenta habilitada (shell que permite sesión, no caducada, con contraseña usable o claves autorizadas), los días desde su último acceso: lo más reciente entre lastlog, wtmp y los accesos que el agente anota del log de autenticación. Una cuenta que nunca ha accedido cuenta desde la fecha de su credencial. Obligatorio en nivel ALTO.',
    requirements: ['op.acc.6.r7.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'account_inactivity_checked'],
    stateFactEventTypes: ['account_inactivity_checked'],
    relatedRules: ['110110'],
    judgment: {
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-09',
      factEventTypes: ['account_inactivity_checked'],
      factField: 'dias',
    },
    auditQuestion:
      '¿Ninguna cuenta habilitada lleva más de P-09 días sin utilizarse?',
  },
  {
    id: 'EV-11',
    controlId: 'op.acc.6',
    title: 'Complejidad y robustez de las contraseñas (R1)',
    description:
      'Lo que el sistema impone al fijar una contraseña: longitud mínima, clases de caracteres exigidas, historial y si se consulta una lista de bloqueo (pila password de PAM; en un directorio, su política de contraseñas). Se contrasta con los mínimos de P-10. Rige con R1 y con R2.',
    requirements: ['op.acc.6.r1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // No `judgment`: P-10 is several minimums at once and applies only with R1 or R2 (P-01); decided by the policy.
    expectedEventTypes: ['evidence_state', 'password_policy_checked'],
    stateFactEventTypes: ['password_policy_checked'],
    relatedRules: ['110111'],
    auditQuestion:
      '¿La política de contraseñas impuesta alcanza cada mínimo de P-10?',
  },
  {
    id: 'EV-12',
    controlId: 'op.acc.6',
    title: 'Información expuesta antes de autenticar',
    description:
      'Barrido de lo que cada servicio de autenticación muestra a quien todavía no se ha identificado: versión del software y de la distribución en la identificación de SSH, banner previo, rootDSE o bind anónimos del directorio. Se contrasta con lo que la organización admite en P-11. OpenSSH y slapd no distinguen usuario inexistente de credencial incorrecta hacia el cliente, así que ese caso no produce hallazgo.',
    requirements: ['op.acc.6.7'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'auth_disclosure_observed'],
    stateFactEventTypes: ['auth_disclosure_observed'],
    relatedRules: ['110112'],
    judgment: {
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-11',
      factEventTypes: ['auth_disclosure_observed'],
      factField: 'exposicion',
    },
    auditQuestion:
      '¿Los servicios de autenticación solo exponen, antes de autenticar, lo que la organización admite en P-11?',
  },
  {
    id: 'EV-01',
    controlId: 'op.exp.1',
    title: 'Inventario de hardware y sistema operativo',
    description:
      'Foto del hardware y del sistema operativo de cada activo que toma el recolector de op.exp.1 en cada pasada: fabricante, modelo, número de serie, virtualización, CPU, memoria, sistema operativo, versión, kernel y arquitectura. Es la base del inventario técnico exigido por op.exp.1.1. No se lee de Syscollector: el inventario nativo no genera alertas (regla 221, nivel 0) y el motor solo lee wazuh-alerts-*.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'asset_system'],
    stateFactEventTypes: ['asset_system'],
    relatedRules: ['110201'],
    judgment: {
      // 'Inventory UP TO DATE' as a primitive: the latest snapshot cannot be older than P-08, measured against the clock over the fact's emission instant (`ts`).
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-08',
      factEventTypes: ['asset_system'],
      factField: 'ts',
    },
    auditQuestion:
      '¿Consta una foto del hardware y del sistema operativo de este activo tomada dentro del plazo declarado en P-08?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.1',
    title: 'Inventario de software y paquetes instalados',
    description:
      'Resumen del software instalado en cada activo en cada pasada: gestor de paquetes, número de paquetes y snaps, y huella de la lista completa, más las altas, bajas y actualizaciones respecto de la pasada anterior. Cubre de forma natural el contenido del Refuerzo R4 (relación de componentes software). En un servidor de directorio lleva además el paquete que instala el servicio LDAP y los ficheros del producto que no controla el gestor de paquetes.',
    requirements: ['op.exp.1.1', 'op.exp.1.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'software_inventory'],
    stateFactEventTypes: ['software_inventory'],
    relatedRules: ['110202'],
    judgment: {
      // Same question as EV-01 on another source.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-08',
      factEventTypes: ['software_inventory'],
      factField: 'ts',
    },
    auditQuestion:
      '¿Consta un inventario del software instalado en este activo tomado dentro del plazo declarado en P-08?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.1',
    title: 'Inventario de red: interfaces, puertos y procesos',
    description:
      'Interfaces de red con sus direcciones, servicios en escucha con su proceso y número de procesos en ejecución, en cada pasada. Es lo que dice qué servicios presta el activo, es decir, su naturaleza técnica. En un servidor de directorio el hecho solo se emite si además se ha podido observar el servicio LDAP (binario, escucha, sufijo del directorio): sin eso el inventario de esa máquina no dice lo que es.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'network_inventory'],
    stateFactEventTypes: ['network_inventory'],
    relatedRules: ['110203'],
    judgment: {
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-08',
      factEventTypes: ['network_inventory'],
      factField: 'ts',
    },
    auditQuestion:
      '¿Consta un inventario de las interfaces y los servicios en escucha de este activo tomado dentro del plazo declarado en P-08?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.1',
    title: 'Visualización continua del estado de los equipos',
    description:
      'Estado de la conexión del agente de Wazuh con el manager, leído del propio agente: estado (conectado, pendiente, desconectado) y último keepalive. Detecta el activo declarado que ha dejado de reportar de forma sostenida. Cubre de forma natural lo que pide el Refuerzo R2.',
    requirements: ['op.exp.1.1', 'op.exp.1.r2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'agent_status'],
    stateFactEventTypes: ['agent_status'],
    relatedRules: ['110204'],
    judgment: {
      // The agent's keepalive registered with the manager is measured, not the fact instant; a never-connected agent has no keepalive and stays NO_EVALUABLE.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-08',
      factEventTypes: ['agent_status'],
      factField: 'ultimo_keepalive',
    },
    auditQuestion:
      '¿El agente de este activo ha mantenido contacto con el manager dentro del plazo declarado en P-08?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.1',
    title: 'Detección de activos nuevos no inventariados',
    description:
      'Hosts vecinos que esta máquina ve en su tabla de vecinos de red (ARP / NDP), con su IP, MAC y si es la pasarela, sin sondear la red. Se contrastan con los activos sin agente declarados (P-02): un host que habla con el sistema y no figura en el inventario incumple directamente op.exp.1.1. No detecta hosts que no hablen con esta máquina.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'network_host_observed'],
    stateFactEventTypes: ['network_host_observed'],
    relatedRules: ['110205'],
    judgment: {
      // A sweep: seeing no undeclared neighbour is normal, so it can pass by silence, but only if the heartbeat confirms the neighbour table was read (EV-05 in `evidencias_cubiertas`).
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-02',
      parameterColumn: 'ip',
      factEventTypes: ['network_host_observed'],
      factField: 'ip',
    },
    auditQuestion:
      '¿Todo host de red que se observa desde este activo figura, por su IP, en el inventario de activos sin agente (P-02)?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.1',
    title: 'Cambios en la composición de los activos',
    description:
      'Variaciones en el inventario de un activo existente —software instalado, eliminado o actualizado, cambios de hardware, servicios que empiezan o dejan de escuchar—, detectadas comparando cada foto con la anterior, y la revisión formal del inventario en la que esos cambios pasan al inventario declarado. Un inventario «actualizado» implica reflejar los cambios, no solo el alta inicial.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // The four change types are listened to for the trace but not judged: no parameter declares which change is authorised.
    // What is judged is that the organisation reviews the inventory within P-04.
    expectedEventTypes: [
      'evidence_state',
      'inventory_review',
      'asset_software_change',
      'asset_hardware_change',
      'asset_port_opened',
      'asset_port_closed',
    ],
    relatedRules: ['110210', '110206', '110207', '110208', '110209'],
    judgment: {
      // Existential: a recent enough review suffices; never passes by absence.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-04',
      factEventTypes: ['inventory_review'],
      factField: 'fecha',
    },
    auditQuestion:
      '¿Consta una revisión formal del inventario de este activo, que recoja sus cambios de composición, dentro del plazo declarado en P-04?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.1',
    title: 'Cobertura del inventario frente a activos declarados',
    description:
      'Contraste entre el activo que Wazuh observa (el nombre de máquina de la foto de EV-01) y la tabla de responsables declarada por el cliente (P-01). Un activo monitorizado sin fila en P-01 no tiene responsable ni naturaleza declarados, y eso es la mitad organizativa de op.exp.1.1 que Wazuh no puede ver por sí solo.',
    requirements: ['op.exp.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'asset_system'],
    stateFactEventTypes: ['asset_system'],
    relatedRules: ['110201'],
    judgment: {
      // The SAME fact as EV-01: one observation, two questions. TODOS_EN_LISTA, because the fact ACCREDITS that the asset exists.
      // Owner and nature are mandatory P-01 columns, so they are not compared here.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'activo',
      factEventTypes: ['asset_system'],
      factField: 'activo',
    },
    auditQuestion:
      '¿El activo observado por Wazuh figura en la tabla de responsables (P-01), con responsable y naturaleza declarados?',
  },
  {
    id: 'EV-01',
    controlId: 'op.exp.2',
    title: 'Evaluación contra la línea base de configuración segura',
    description:
      'Ejecución periódica de la política SCA asignada a cada activo según P-01, con el detalle de checks superados y fallidos. Es la evidencia central del control: acredita de forma objetiva y repetible el estado de bastionado de cada equipo.',
    requirements: ['op.exp.2.1', 'op.exp.2.2', 'op.exp.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'sca_evaluation'],
    stateFactEventTypes: ['sca_evaluation'],
    relatedRules: ['110301'],
    judgment: {
      // What is judged is WHICH baseline is evaluated on the machine, not its result (that lives in the manager's wazuh-db and is EV-06).
      // The fact carries the set of policies the agent really evaluated (ossec.log) and is compared literally with the P-01 cell.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-01',
      factEventTypes: ['sca_evaluation'],
      factField: 'perfil',
      factKeyField: 'perfil',
      tableKeyColumn: 'perfil',
      tableChecks: [
        { column: 'politica_sca', factField: 'politicas' },
      ],
    },
    auditQuestion:
      '¿Se acredita: evaluación contra la línea base de configuración segura?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.2',
    title: 'Pervivencia de cuentas y contraseñas estándar',
    description:
      'Detección de cuentas por defecto de P-03 que siguen existiendo o, peor, que registran autenticaciones exitosas. op.exp.2.1 exige su retirada antes de la entrada en operación.',
    requirements: ['op.exp.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: [
      'evidence_state',
      'login_account',
      'account_authenticated',
    ],
    stateFactEventTypes: ['login_account'],
    relatedRules: ['110302', '110303'],
    judgment: {
      // Two populations with the same field: accounts not retired and accounts that authenticate. P-03 says which names are 'standard', so the fact name carries no verdict.
      // Negative assertion: no account plus confirmed heartbeat passes.
      primitive: 'NINGUNO_EN_LISTA',
      parameterId: 'P-03',
      parameterColumn: 'cuenta',
      factEventTypes: ['login_account', 'account_authenticated'],
      factField: 'usuario',
    },
    auditQuestion:
      '¿Se acredita: pervivencia de cuentas y contraseñas estándar?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.2',
    title: 'Servicios y puertos no justificados en ejecución',
    description:
      'Contraste entre los servicios en ejecución y puertos en escucha detectados por Syscollector y la relación de servicios justificados por perfil (P-02). Todo lo que sobra es superficie de exposición innecesaria y vulnera la regla de mínima funcionalidad.',
    requirements: ['op.exp.2.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'service_exposed'],
    stateFactEventTypes: ['service_exposed'],
    relatedRules: ['110304'],
    judgment: {
      // Each exposed function is matched with the row of ITS profile in P-02. A profile without a row is NO_EVALUABLE.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-02',
      factEventTypes: ['service_exposed'],
      factField: 'perfil',
      factKeyField: 'perfil',
      tableKeyColumn: 'perfil',
      tableChecks: [
        { column: 'servicios', factField: 'servicio' },
        { column: 'puertos', factField: 'puerto' },
      ],
    },
    auditQuestion:
      '¿Se acredita: servicios y puertos no justificados en ejecución?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.2',
    title: 'Verificación de la regla de seguridad por defecto',
    description:
      'Comprobación de que los valores de configuración por defecto de los servicios son los seguros: cifrado activado, protocolos obsoletos deshabilitados, autenticación exigida, permisos restrictivos en la instalación inicial. Es la traducción práctica de op.exp.2.3.',
    requirements: ['op.exp.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'insecure_default'],
    stateFactEventTypes: ['insecure_default'],
    relatedRules: ['110305'],
    judgment: {
      // A sweep: each insecure default is a finding unless authorised in P-04. `desviacion` (<machine>:<check>) is compared so that one asset's exception does not excuse another's.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-04',
      parameterColumn: 'comprobacion',
      factEventTypes: ['insecure_default'],
      factField: 'desviacion',
    },
    auditQuestion:
      '¿Se acredita: verificación de la regla de seguridad por defecto?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.2',
    title: 'Configuración segura de hipervisores y máquinas virtuales',
    description:
      'Verificación de que los anfitriones de virtualización declarados en P-06 están monitorizados, tienen política SCA propia y reciben el mismo tratamiento que las máquinas físicas en parcheado, gestión de cuentas y protección antimalware, como exige expresamente op.exp.2.4.',
    requirements: ['op.exp.2.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'virtualization_role'],
    stateFactEventTypes: ['virtualization_role'],
    relatedRules: ['110306'],
    judgment: {
      // Every observed VM or host must be in the P-06 inventory. Whether a VM's host has an agent is a cross-machine question answered by the host's own agent.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-06',
      parameterColumn: 'maquina',
      factEventTypes: ['virtualization_role'],
      factField: 'maquina',
    },
    auditQuestion:
      '¿Se acredita: configuración segura de hipervisores y máquinas virtuales?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.2',
    title: 'Evolución del nivel de cumplimiento de la línea base',
    description:
      'Serie temporal del porcentaje de checks SCA superados por activo y agregado del sistema. Permite distinguir un bastionado sólido y estable de una configuración que se degrada con el tiempo, y sirve de enlace natural con op.exp.3.',
    requirements: ['op.exp.2.2', 'op.exp.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'sca_score'],
    relatedRules: ['110307'],
    judgment: {
      // The SCA score series of the window against the P-05 threshold; the slope is not judged. The agent gets the fact from the Wazuh API; without declared access it is NO_EVALUABLE.
      primitive: 'UMBRAL_MINIMO',
      parameterId: 'P-05',
      factEventTypes: ['sca_score'],
      factField: 'puntuacion',
    },
    auditQuestion:
      '¿Se acredita: evolución del nivel de cumplimiento de la línea base?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.2',
    title: 'Conformidad previa a la entrada en operación',
    description:
      'Verificación de que cada activo superó la línea base ANTES de entrar en producción. Se contrasta la fecha de alta del agente y de puesta en servicio con la fecha del primer scan SCA conforme. Un equipo que entra en operación y luego se bastiona no cumple el enunciado de op.exp.2.',
    requirements: [],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    // No judgment and no rule on purpose: 'configured BEFORE going into operation' is an order between two dates no agent observes. Documented in P-07 and the report.
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: conformidad previa a la entrada en operación?',
  },
  {
    // No fact on the machine: the SCA series lives in the manager database. The collector declares NO_EVALUABLE (rule 110450).
    id: 'EV-01',
    controlId: 'op.exp.3',
    title: 'Mantenimiento en el tiempo de la línea base',
    description:
      'Ejecución periódica y sostenida de las políticas SCA, con seguimiento de la evolución del cumplimiento por activo. A diferencia de op.exp.2, aquí lo relevante no es el resultado puntual sino la SERIE: demuestra que la funcionalidad mínima y el mínimo privilegio se mantienen «en todo momento».',
    requirements: ['op.exp.3.1', 'op.exp.3.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita que el cumplimiento de la línea base SCA se mantiene en el tiempo, como serie y no como foto?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.3',
    title: 'Ediciones de la configuración de seguridad y su autor',
    description:
      'Toda escritura sobre las rutas de configuración de seguridad (P-04) registrada por auditd, con la cuenta de la sesión que la hizo, la operación, el proceso y el intervalo en que ocurrió. En un servidor LDAP incluye los cambios de cn=config con la identidad del directorio que los hizo. Es la evidencia directa de op.exp.3.6.',
    requirements: ['op.exp.3.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_file_modified'],
    relatedRules: ['110401'],
    judgment: {
      // The ACTOR (session account, even through sudo) is checked against who may edit. A sweep: NINGUNO_FUERA_DE_LISTA, passing only if the heartbeat confirms all paths were watched.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-03',
      parameterColumn: 'cuenta',
      factEventTypes: ['config_file_modified'],
      factField: 'actor',
    },
    auditQuestion:
      '¿Solo el personal autorizado en P-03 ha editado la configuración de seguridad?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.3',
    title: 'Elementos no autorizados introducidos en el sistema',
    description:
      'Software instalado de nuevo en el activo (no actualizado) y pedido de forma explícita, leído de dpkg.log y del historial de apt, con quién lo pidió y cuántas dependencias trajo. Se contrasta contra el software autorizado sobre la línea base (P-01). Es la verificación de elementos introducidos que exige op.exp.3.r1.2.',
    requirements: ['op.exp.3.r1.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'software_installed'],
    relatedRules: ['110402'],
    judgment: {
      // Each installation is a FINDING of a package-registry sweep. Zero tolerance: P-08 is declared but does not relax this.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-01',
      parameterColumn: 'paquete',
      factEventTypes: ['software_installed'],
      factField: 'paquete',
    },
    auditQuestion:
      '¿Todo el software introducido en el periodo figura como autorizado sobre la línea base?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.3',
    title: 'Servicios en ejecución frente a la lista autorizada',
    description:
      'Servicios en ejecución en cada activo (unidades de systemd y procesos que escuchan en red fuera de ellas; en un servidor LDAP, además, los módulos, backends, overlays y puntos de escucha de slapd), con el perfil que identifica a la máquina en P-02. Cubre op.exp.3.r1.3 y, por remisión a op.exp.2, la parte de funcionalidad mínima de op.exp.3.1.',
    requirements: ['op.exp.3.1', 'op.exp.3.r1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'service_running'],
    stateFactEventTypes: ['service_running'],
    relatedRules: ['110403'],
    judgment: {
      // Facts ACCREDIT what runs on the machine: table primitive, never passes by absence. `factKeyField` is the FACT field, `tableKeyColumn` the TABLE column.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-02',
      factEventTypes: ['service_running'],
      factField: 'perfil',
      factKeyField: 'perfil',
      tableKeyColumn: 'perfil',
      tableChecks: [
        { column: 'servicios_autorizados', factField: 'servicio' },
      ],
    },
    auditQuestion:
      '¿Todos los servicios en ejecución figuran en la lista de servicios autorizados del perfil de la máquina?',
  },
  {
    // No fact on the machine: requires an integration with the change-management system (P-06). Until then the collector declares NO_EVALUABLE; no correlation is simulated.
    id: 'EV-05',
    controlId: 'op.exp.3',
    title: 'Cambios de configuración frente a su autorización previa',
    description:
      'Correlación entre cada edición de la configuración registrada por EV-02 y el cambio aprobado que la autoriza en el sistema de gestión de cambios declarado en P-06. Un cambio sin autorización asociada incumple op.exp.3.3. Requiere integración con el ITSM del cliente.',
    requirements: ['op.exp.3.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Cada cambio de configuración detectado tiene una autorización previa aprobada?',
  },
  {
    // No fact on the machine: vulnerability response is measured on the manager's detector (op.exp.4 evidence); duplicating it would give two numbers for one fact.
    id: 'EV-06',
    controlId: 'op.exp.3',
    title: 'Reacción de la configuración ante vulnerabilidades notificadas',
    description:
      'Seguimiento de las vulnerabilidades detectadas en los activos y de si la configuración se ha ajustado o se ha aplicado la actualización correspondiente. op.exp.3.4 remite a op.exp.4, que es quien mide la remediación con el detector de vulnerabilidades del manager.',
    requirements: ['op.exp.3.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿El sistema reacciona a las vulnerabilidades notificadas (medido por op.exp.4)?',
  },
  {
    // No fact on the machine: requires an incident register (op.exp.7) to correlate EV-02 edits against.
    id: 'EV-07',
    controlId: 'op.exp.3',
    title: 'Reacción de la configuración ante incidentes',
    description:
      'Verificación de que, tras un incidente de seguridad registrado, se produjeron los cambios de configuración correspondientes en los activos afectados, o consta por qué no procedían. op.exp.3.5 remite a op.exp.7. Requiere el registro de incidentes.',
    requirements: ['op.exp.3.5'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Los incidentes cerrados produjeron una reacción en la configuración de los activos afectados?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.3',
    title: 'Concentración de la administración de la configuración (R2)',
    description:
      'Número de cuentas distintas que han editado de verdad la configuración de seguridad en la ventana de observación, contado sobre lo que registra EV-02. Mide cuántos administradores hay en la práctica, no cuántos están autorizados. Solo se emite cuando la ventana entera se ha observado sin huecos.',
    requirements: ['op.exp.3.r2.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_admins_observed'],
    relatedRules: ['110404'],
    judgment: {
      // A count over a PARTIAL window would be too low, and a low number against a maximum is a false CUMPLE, so the agent emits the fact only with the full window.
      primitive: 'UMBRAL_MAXIMO',
      parameterId: 'P-09',
      factEventTypes: ['config_admins_observed'],
      factField: 'administradores',
    },
    auditQuestion:
      '¿La configuración de seguridad la administra en la práctica un número de cuentas no superior al máximo declarado?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.3',
    title: 'Existencia y frescura de las copias de configuración (R3)',
    description:
      'Instante de la copia más reciente de la configuración, del alcance que peor está (el sistema; en un servidor LDAP, además, cn=config). Se mide su antigüedad contra el reloj y el plazo de P-10. Sin ninguna copia no hay hecho y no se acredita la capacidad de reconstrucción que exige op.exp.3.r3.1.',
    requirements: ['op.exp.3.r3.1'],
    levels: ['ALTO'],
    category: 'RECOVERY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_backup_observed'],
    relatedRules: ['110405'],
    judgment: {
      // Existential; never passes by absence. The fact is the copy INSTANT, so age grows on its own if copies stop.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-10',
      factEventTypes: ['config_backup_observed'],
      factField: 'fecha',
    },
    auditQuestion:
      '¿Existe una copia de la configuración lo bastante reciente como para reconstruir el sistema?',
  },
  {
    // No fact on the machine, same reason as EV-01.
    id: 'EV-10',
    controlId: 'op.exp.3',
    title: 'Regresiones del estado de seguridad de la configuración',
    description:
      'Checks SCA que pasaron de conforme a no conforme entre dos evaluaciones sucesivas, por activo. Es el indicador más directo de que la gestión continua de la configuración falla. Requiere la serie de resultados SCA del manager.',
    requirements: ['op.exp.3.1', 'op.exp.3.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se han detectado regresiones de checks SCA de conforme a no conforme en el periodo?',
  },
  {
    // Split from EV-03: the template treats verification periodicity as its own failure condition (A11) and an evidence has a single judgment.
    id: 'EV-11',
    controlId: 'op.exp.3',
    title: 'Verificación periódica de la configuración frente a la línea base',
    description:
      'Fecha de la verificación formal más reciente de la configuración hardware/software frente a la línea base aprobada, anotada por la organización en el registro del runbook, contrastada con la periodicidad de P-05. Acredita la periodicidad que exige op.exp.3.r1.2. Evidencia propia de ENSFácil: la plantilla del auditor no la incluye.',
    requirements: ['op.exp.3.r1.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'baseline_verification_performed'],
    relatedRules: ['110406'],
    judgment: {
      // An organisational act: never passes by absence.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-05',
      factEventTypes: ['baseline_verification_performed'],
      factField: 'fecha',
    },
    auditQuestion:
      '¿La última verificación formal de la configuración es más reciente que la periodicidad declarada?',
  },
  // op.exp.4. Three evidences are judged by a primitive (EV-04, EV-06, EV-11); the rest by `policies/op-exp-4.policy.ts`, resolved without `judgment`
  // and carried to the table by `evaluation/policy-evidence-bridge.ts`. Rules band 110500-110599.
  {
    id: 'EV-01',
    controlId: 'op.exp.4',
    title: 'Inventario continuo de vulnerabilidades por activo',
    description:
      'Detección automática de vulnerabilidades conocidas (CVE) en los productos instalados en cada activo, cruzando el inventario de Syscollector con los feeds de los fabricantes y bases públicas. Es la evidencia central del control y, además, cubre de facto el Refuerzo R4.',
    requirements: ['op.exp.4.1', 'op.exp.4.2', 'op.exp.4.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Header of the Vulnerability Detector state snapshot delivered by the manager bridge. Continuous = a recent snapshot.
    expectedEventTypes: ['evidence_state', 'vulnerability_inventory'],
    relatedRules: ['110501'],
    auditQuestion:
      '¿Consta un inventario reciente de las vulnerabilidades de este activo?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.4',
    title: 'Tiempo de remediación frente a los plazos del procedimiento',
    description:
      'Medición del tiempo transcurrido entre la primera detección de cada vulnerabilidad y su desaparición del inventario (por parcheo o mitigación), contrastado con el plazo que le corresponde según su criticidad en P-01 y P-08. Es la evidencia directa de op.exp.4.2.',
    requirements: ['op.exp.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // `vulnerability_open` is the OLDEST open one per CVSS score, with its detection instant; the agent does not subtract dates.
    expectedEventTypes: ['evidence_state', 'vulnerability_open', 'vulnerability_resolved'],
    relatedRules: ['110502', '110503'],
    auditQuestion:
      '¿Se resuelven las vulnerabilidades dentro del plazo que el procedimiento fija para su criticidad?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.4',
    title: 'Estado de parcheado del parque',
    description:
      'Inventario de versiones de paquetes, aplicaciones y actualizaciones instaladas en cada activo, incluidos los hotfixes de Windows. Permite acreditar que el mantenimiento se realiza efectivamente y conocer el nivel de actualización real del parque.',
    requirements: ['op.exp.4.1', 'op.exp.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'patch_status'],
    relatedRules: ['110504'],
    auditQuestion:
      '¿Está la máquina al día de sus actualizaciones de seguridad, parches activos incluidos?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.4',
    title: 'Instalaciones y actualizaciones por personal no autorizado',
    description:
      'Detección de instalaciones, actualizaciones o desinstalaciones de software cuyo actor no figura entre el personal autorizado de P-02. op.exp.4.3 es taxativo: el mantenimiento solo puede realizarlo personal debidamente autorizado.',
    requirements: ['op.exp.4.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'package_changed'],
    relatedRules: ['110505'],
    judgment: {
      // The ACTOR of each software transaction is checked. A sweep of the apt/dpkg logs; no change in the window with the heartbeat confirming the logs were read is the normal result.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-02',
      // P-02 is `cuenta | ambito | tipo`; the column must be named.
      parameterColumn: 'cuenta',
      factEventTypes: ['package_changed'],
      factField: 'actor',
    },
    auditQuestion:
      '¿Todo cambio de software lo ha hecho una cuenta autorizada para el mantenimiento?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.4',
    title: 'Software fuera de soporte del fabricante',
    description:
      'Identificación de productos instalados cuya versión ha alcanzado el fin de soporte declarado en P-05, o está próxima a alcanzarlo. Un componente sin soporte no recibirá actualizaciones de seguridad, lo que impide materialmente cumplir op.exp.4.1.',
    requirements: ['op.exp.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'product_support'],
    relatedRules: ['110506'],
    auditQuestion:
      '¿Todo producto instalado sigue dentro del soporte de su fabricante?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.4',
    title: 'Cobertura del seguimiento de anuncios de defectos',
    description:
      'Contraste entre los fabricantes y productos realmente presentes en el inventario y las fuentes de seguimiento declaradas en P-03 y los feeds activos del Vulnerability Detector. Revela puntos ciegos: productos desplegados de los que nadie vigila los boletines.',
    requirements: ['op.exp.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'vendor_observed'],
    relatedRules: ['110507'],
    judgment: {
      // Each manufacturer in the inventory ACCREDITS something that exists, so observing none is not compliance.
      primitive: 'TODOS_EN_LISTA',
      parameterId: 'P-03',
      parameterColumn: 'fabricante',
      factEventTypes: ['vendor_observed'],
      factField: 'fabricante',
    },
    auditQuestion:
      '¿Se siguen los anuncios de defectos de todos los fabricantes del software instalado?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.4',
    title: 'Actualizaciones aplicadas fuera de ventana de mantenimiento',
    description:
      'Detección de cambios de software aplicados fuera de las franjas autorizadas en P-04, lo que puede indicar intervención improvisada al margen del procedimiento de gestión de cambios exigido por op.exp.4.2.',
    requirements: ['op.exp.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // The SAME fact as EV-04: the transaction carries its instant in local time.
    expectedEventTypes: ['evidence_state', 'package_changed'],
    relatedRules: ['110505'],
    auditQuestion:
      '¿Se aplican los cambios de software dentro de las ventanas de mantenimiento declaradas?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.4',
    title: 'Trazabilidad del paso por preproducción (R1)',
    description:
      'Verificación de que cada versión desplegada en producción estuvo previamente instalada en el entorno de preproducción emparejado en P-06. Es la evidencia técnica del Refuerzo R1, obligatorio desde categoría MEDIA.',
    requirements: ['op.exp.4.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Production and pre-production software changes. Precedence needs TWO machines and the engine evaluates each separately, so the policy always declares it unproven.
    expectedEventTypes: ['evidence_state', 'package_changed'],
    relatedRules: ['110505'],
    auditQuestion:
      '¿Pasó cada versión desplegada en producción antes por su preproducción?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.4',
    title: 'Existencia de punto de reversión previo (R2)',
    description:
      'Verificación de que antes de cada aplicación de parches o cambios de configuración se generó el mecanismo de reversión declarado en P-07: snapshot, backup o imagen. R2 es obligatorio en categoría ALTA.',
    requirements: ['op.exp.4.r2.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'reversion_point_created', 'package_changed'],
    relatedRules: ['110505', '110508'],
    auditQuestion:
      '¿Existía un punto de reversión antes de cada cambio de software?',
  },
  {
    id: 'EV-10',
    controlId: 'op.exp.4',
    title: 'Evolución de la deuda de vulnerabilidades',
    description:
      'Serie temporal del número de vulnerabilidades abiertas por criticidad y del tiempo medio de remediación. Distingue una organización que parchea con ritmo sostenido de otra que acumula deuda, que es exactamente lo que un auditor busca valorar en este control.',
    requirements: ['op.exp.4.2', 'op.exp.4.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'vulnerability_inventory', 'vulnerability_resolved'],
    relatedRules: ['110501', '110503'],
    auditQuestion:
      '¿Se mantiene o reduce la deuda de vulnerabilidades en lugar de crecer semana tras semana?',
  },
  {
    id: 'EV-11',
    controlId: 'op.exp.4',
    title: 'Versiones de firmware de dispositivos hardware (R3)',
    description:
      'Registro de las versiones de firmware de los dispositivos de P-09 y contraste con los boletines del fabricante para detectar versiones vulnerables o desactualizadas. Corresponde al Refuerzo R3, no obligatorio en ninguna categoría.',
    requirements: ['op.exp.4.r3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'LOW',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'firmware_version'],
    relatedRules: ['110509'],
    judgment: {
      // The observed version must match the one declared in the device row. It records VERSION, not integrity.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-09',
      factEventTypes: ['firmware_version'],
      factField: 'dispositivo',
      factKeyField: 'dispositivo',
      tableKeyColumn: 'dispositivo',
      tableChecks: [
        { column: 'firmware_actual', factField: 'version' },
      ],
    },
    auditQuestion:
      '¿Coincide el firmware observado con la versión declarada para el dispositivo?',
  },
  // op.exp.5. No evidence declares a primitive: the policy (`policies/op-exp-5.policy.ts`) crosses REAL machine changes with the organisation's change register
  // by system and time interval. The register is `/etc/ensfacil/change-register.tsv` (110605 header, 110606 one row per request).
  // Real changes reuse the op.exp.3 and op.exp.4 code relabelled op.exp.5, because the engine filters by control. Rules band 110600-110699.
  {
    id: 'EV-01',
    controlId: 'op.exp.5',
    title: 'Cambios reales detectados en los sistemas',
    description:
      'Registro de todos los cambios efectivamente producidos en la máquina: escrituras en las rutas de configuración vigiladas por auditd (con su autor), transacciones de software de apt y dpkg (con su actor), puertos en escucha que aparecen o desaparecen y componentes de hardware que cambian. Es la base objetiva contra la que se contrasta el registro de peticiones. Se acredita cuando el latido del recolector declara leídas las cuatro fuentes.',
    requirements: ['op.exp.5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed'],
    relatedRules: ['110601', '110602', '110603', '110604'],
    auditQuestion:
      '¿Se detectan todos los cambios reales de la máquina, con su autor cuando se puede saber?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.5',
    title: 'Cambios implantados sin petición registrada',
    description:
      'Correlación entre cada cambio real de EV-01 y las peticiones del registro de la máquina: tiene que haber una petición aprobada ANTES del cambio, del mismo sistema, cuya ventana contenga el cambio (o, para un cambio que solo se sabe entre dos pasadas, que solape con él). Un cambio sin petición es el hallazgo principal del control. La fuente de las peticiones es un registro mantenido a mano, no un ITSM, y el motivo lo dice.',
    requirements: ['op.exp.5.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'change_register_read', 'change_request_registered', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed'],
    relatedRules: ['110601', '110602', '110603', '110604', '110605', '110606'],
    auditQuestion:
      '¿Cada cambio real de la máquina tiene una petición aprobada cuya ventana lo cubre?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.5',
    title: 'Completitud de la información de la petición de cambio',
    description:
      'Verificación de que cada petición autorizada (aprobada, implantada o revertida) del registro trae rellenos los campos mínimos declarados en P-02 y, si P-01 lo declara, un número con el prefijo de referencia. En categoría ALTA se exige además la valoración del impacto en la seguridad (op.exp.5.r1.3). Una fila que no tiene las catorce columnas es una petición que no se puede leer.',
    requirements: ['op.exp.5.2', 'op.exp.5.r1.3'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'change_register_read', 'change_request_registered'],
    relatedRules: ['110605', '110606'],
    auditQuestion:
      '¿Traen las peticiones autorizadas la información suficiente para decidir sobre ellas?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.5',
    title: 'Aprobación previa del RSI en cambios de riesgo ALTO',
    description:
      'Para cada petición de riesgo alto implantada (o que cubre algún cambio real), que la aprobó la cuenta del Responsable de la Seguridad de P-04 y que la fecha de aprobación es ANTERIOR a la implantación: el primer cambio real que la petición cubre o, si no se ha observado ninguno, el inicio de su ventana. Exige que los criterios de riesgo alto (P-03) estén declarados.',
    requirements: ['op.exp.5.4'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'change_register_read', 'change_request_registered', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed'],
    relatedRules: ['110601', '110602', '110603', '110604', '110605', '110606'],
    auditQuestion:
      '¿Los cambios de riesgo alto los aprobó el RSI antes de implantarlos?',
  },
  {
    // No rule on purpose. Proving a change went through pre-production needs the changes of two machines; the engine evaluates each separately. The register's
    // 'preproduccion' column is a declaration, not an observation. The policy leaves it NO_EVALUABLE.
    id: 'EV-05',
    controlId: 'op.exp.5',
    title: 'Trazabilidad del paso por preproducción',
    description:
      'Comprobación de que los cambios aplicados en producción tuvieron actividad equivalente previa en el sistema de preproducción emparejado en P-05. Hoy no se puede demostrar: exige cruzar las dos máquinas y el motor evalúa cada una por separado.',
    requirements: ['op.exp.5.3'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Pasó cada cambio de producción antes por su preproducción equivalente?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.5',
    title: 'Actualización de la documentación de configuración tras el cambio',
    description:
      'Para cada petición implantada que declara en su columna «documentacion» documentos de P-06, que el fichero del documento se modificó entre el inicio de la ventana del cambio y el fin de su ventana más el plazo de P-06. Solo se puede comprobar un documento que sea un fichero de la máquina vigilado por su recolector.',
    requirements: ['op.exp.5.5'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'change_register_read', 'change_request_registered', 'config_doc_modified'],
    relatedRules: ['110605', '110606', '110607'],
    auditQuestion:
      '¿Se actualizó en plazo la documentación de configuración que cada cambio implantado exigía?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.5',
    title: 'Estabilidad del servicio tras el cambio',
    description:
      'Servicios que siguen caídos en la última pasada del recolector y cuya caída empezó en las horas de P-09 siguientes a un cambio real, sin que el registro declare revertido ese cambio. Da soporte objetivo a las pruebas de aceptación de op.exp.5.5 y a la reversión de R1.',
    requirements: ['op.exp.5.5', 'op.exp.5.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'service_failed', 'config_file_modified', 'package_changed', 'listening_port_changed', 'hardware_changed'],
    // STATE fact: the collector reissues ALL down services each pass; the last pass is judged (see `state-facts.ts`).
    stateFactEventTypes: ['service_failed'],
    relatedRules: ['110608', '110601', '110602', '110603', '110604'],
    auditQuestion:
      '¿Algún cambio ha dejado un servicio caído sin revertirse?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.5',
    title: 'Comunicación de fallos al responsable de seguridad (R1)',
    description:
      'Los fallos de software detectados en la máquina (servicios caídos, el mismo hecho de EV-07) y su comunicación al responsable de seguridad por el canal de P-07. La detección es real; la comunicación no deja hoy ningún hecho observable, así que la evidencia no se puede demostrar.',
    requirements: ['op.exp.5.r1.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // The fact arrives tagged EV-07, which declares it as state; the policy reads it for both.
    expectedEventTypes: ['evidence_state', 'service_failed'],
    relatedRules: ['110608'],
    auditQuestion:
      '¿Se comunican al responsable de seguridad los fallos de software y hardware?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.5',
    title: 'Existencia de punto de reversión previo al cambio (R1)',
    description:
      'Para cada cambio real de configuración o de software, un punto de reversión del mecanismo declarado en P-08 creado en las horas previas a su inicio. Es la lógica de EV-09 de op.exp.4 aplicada a todos los cambios. Solo lvm, zfs y btrfs dejan huella en la máquina.',
    requirements: ['op.exp.5.r1.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'reversion_point_created', 'config_file_modified', 'package_changed'],
    relatedRules: ['110609', '110601', '110602'],
    auditQuestion:
      '¿Existía un punto de reversión antes de cada cambio?',
  },
  // op.exp.6. Two evidences are judged by a primitive (EV-01, EV-03); the rest by `policies/op-exp-6.policy.ts`. EV-02, EV-04, EV-05 also read EV-01
  // (no antimalware means no signatures: a measured failure, not a gap). Rules band 110700-110799; no native Wazuh rule is used, only the facts the collector emits.
  {
    id: 'EV-01',
    controlId: 'op.exp.6',
    title: 'Presencia y estado del antimalware en todos los equipos',
    description:
      'Antimalware de cada plano de la máquina (el sistema; en un servidor que presta correo, además, el del servicio de correo): qué producto está instalado y si su servicio está en ejecución. Se contrasta el producto EN EJECUCIÓN con la fila del equipo y el plano en P-02: instalado y parado no protege. op.exp.6.2 es taxativo en la exigencia de cobertura total.',
    requirements: ['op.exp.6.1', 'op.exp.6.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'antimalware_status'],
    stateFactEventTypes: ['antimalware_status'],
    relatedRules: ['110701'],
    judgment: {
      // Facts ACCREDIT what runs on each plane: table primitive, never passes by absence. A machine without antimalware DOES emit a fact (`producto_activo=ninguno`).
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-02',
      factEventTypes: ['antimalware_status'],
      factField: 'equipo',
      factKeyFields: ['equipo', 'plano'],
      tableKeyColumns: ['equipo', 'plano'],
      tableChecks: [
        { column: 'producto_esperado', factField: 'producto_activo' },
      ],
    },
    auditQuestion:
      '¿Corre en cada equipo y plano el antimalware que declara la cobertura esperada?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.6',
    title: 'Antigüedad de las bases de datos de detección',
    description:
      'Instante en que el fabricante publicó las firmas del antimalware de cada plano (cabecera de la base diaria de ClamAV), medido contra el reloj y el umbral de P-03. Un plano con antimalware en ejecución y sin bases, o una máquina sin antimalware, no tiene bases que mantener al día: es un incumplimiento medido de op.exp.6.4.',
    requirements: ['op.exp.6.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'antimalware_signatures_updated', 'antimalware_status'],
    stateFactEventTypes: ['antimalware_signatures_updated'],
    relatedRules: ['110702', '110701'],
    auditQuestion:
      '¿Son las firmas de cada antimalware en ejecución más recientes que el umbral declarado?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.6',
    title: 'Configuración adecuada y protección en tiempo real',
    description:
      'Ajustes observados del antimalware de cada plano —protección en tiempo real, actualización automática de firmas, análisis de comprimidos, bloqueo en el acceso—, contrastados con la fila de su plano y ajuste en P-04. Una máquina sin antimalware no tiene protección en tiempo real: se observa y se emite así.',
    requirements: ['op.exp.6.5', 'op.exp.6.r5.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'antimalware_setting'],
    stateFactEventTypes: ['antimalware_setting'],
    relatedRules: ['110703'],
    judgment: {
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-04',
      factEventTypes: ['antimalware_setting'],
      factField: 'ajuste',
      factKeyFields: ['plano', 'ajuste'],
      tableKeyColumns: ['plano', 'ajuste'],
      tableChecks: [
        { column: 'valor_esperado', factField: 'valor' },
      ],
    },
    auditQuestion:
      '¿Tiene el antimalware de cada plano activos los ajustes que exige la organización, empezando por la protección en tiempo real?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.6',
    title: 'Detecciones de código dañino y su resolución',
    description:
      'Cada detección que anota el antimalware, con el fichero, la amenaza y la acción que se tomó (cuarentena, eliminado, bloqueado, sin acción o fallida). Una detección sin remediar o que se repite sobre el mismo fichero indica una infección no resuelta. Sin antimalware no hay mecanismo de detección ni de reacción.',
    requirements: ['op.exp.6.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'malware_detected', 'antimalware_status'],
    relatedRules: ['110704', '110701'],
    auditQuestion:
      '¿Se resuelven todas las detecciones de código dañino, sin infecciones que persistan?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.6',
    title: 'Ejecución del escaneo periódico completo (R1)',
    description:
      'Instante de fin del escaneo completo del sistema más reciente registrado por el antimalware, medido contra el reloj y la periodicidad de P-06. Un equipo que nunca ha completado un escaneo, o que no tiene antimalware, no lo cumple.',
    requirements: ['op.exp.6.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'full_scan_completed', 'antimalware_status'],
    relatedRules: ['110705', '110701'],
    auditQuestion:
      '¿Se ha completado un escaneo de todo el sistema dentro de la periodicidad declarada?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.6',
    title: 'Integridad de funciones críticas al arranque (R2)',
    description:
      'Lo que el agente de Wazuh analizó en su último arranque, leído de su propio log: las rutas que vigila su FIM, si lanzó el análisis nada más arrancar (scan_on_start) y si lo terminó, y la pasada de rootcheck. Cada ruta crítica de P-07 tiene que estar cubierta por una ruta vigilada. Las modificaciones que ese análisis encuentre las alerta el manager; lo que se acredita aquí es que el análisis al arranque existe y cubre lo crítico.',
    requirements: ['op.exp.6.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'boot_integrity_check'],
    relatedRules: ['110706'],
    auditQuestion:
      '¿Analizó el agente al arrancar todas las rutas críticas declaradas, y terminó el análisis?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.6',
    title: 'Efectividad de la lista blanca de aplicaciones (R3)',
    description:
      'Dos hechos que se juzgan juntos: el estado del mecanismo de lista blanca de ejecución (fapolicyd en Linux; el confinamiento de AppArmor no es una lista blanca) y las ejecuciones que el mecanismo registró con la decisión que tomó. Incumple sin mecanismo, con el mecanismo parado o en modo auditoría, y con una ejecución no bloqueada de una ruta que no figura en P-08.',
    requirements: ['op.exp.6.r3.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'execution_control_status', 'execution_observed'],
    stateFactEventTypes: ['execution_control_status'],
    relatedRules: ['110707', '110708'],
    auditQuestion:
      '¿Impide un mecanismo en modo aplicación la ejecución de lo que no está en la lista blanca?',
  },
  {
    // No fact on the machine: the VirusTotal query is made by the manager. The collector declares NO_EVALUABLE; the policy judges only the P-09 row.
    id: 'EV-08',
    controlId: 'op.exp.6',
    title: 'Análisis reputacional de ficheros nuevos y modificados (R4)',
    description:
      'Consulta automática a VirusTotal del hash de cada fichero nuevo o modificado en rutas monitorizadas. La hace el manager sobre las alertas de FIM, y su resultado no se observa desde el equipo: la evidencia solo puede juzgar lo que la organización declara en P-09.',
    requirements: ['op.exp.6.r4.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se consulta la reputación de los ficheros nuevos o modificados, y consta en el equipo?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.6',
    title: 'Detección por reglas de contenido en ficheros (R4)',
    description:
      'Si la respuesta activa de YARA que configura el manager está desplegada en el equipo (script y binario presentes), y las coincidencias que ha registrado. Se contrasta con la fila «yara» de P-09.',
    requirements: ['op.exp.6.r4.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'edr_capability_observed', 'content_rule_match'],
    stateFactEventTypes: ['edr_capability_observed'],
    relatedRules: ['110710', '110709'],
    auditQuestion:
      '¿Está desplegado en el equipo el análisis de contenido con reglas YARA que declara la organización?',
  },
  {
    id: 'EV-10',
    controlId: 'op.exp.6',
    title: 'Detección de actividad sospechosa en puestos y servidores (R4)',
    description:
      'Si rootcheck se ejecuta en el equipo y con sus bases de rootkits y troyanos, leído del log del agente. Sus hallazgos (procesos y puertos ocultos, binarios troyanizados) los recibe el manager y no quedan en el equipo, así que la ausencia de actividad sospechosa no se puede afirmar desde aquí: con rootcheck completo la evidencia queda sin demostrar, y con rootcheck roto o incompleto, incumple.',
    requirements: ['op.exp.6.1', 'op.exp.6.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'edr_capability_observed'],
    stateFactEventTypes: ['edr_capability_observed'],
    relatedRules: ['110710'],
    auditQuestion:
      '¿Busca el equipo actividad compatible con código dañino que el antimalware no ve, con la herramienta completa?',
  },
  {
    id: 'EV-11',
    controlId: 'op.exp.6',
    title: 'Contención automática ante detección (R4)',
    description:
      'Respuestas activas de contención que el manager configura para el equipo (etc/shared/ar.conf) y cuyo script está presente en él, y las que se han ejecutado. Se contrasta con la fila «active_response» de P-09.',
    requirements: ['op.exp.6.1', 'op.exp.6.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'edr_capability_observed', 'active_response_executed'],
    stateFactEventTypes: ['edr_capability_observed'],
    relatedRules: ['110710', '110711'],
    auditQuestion:
      '¿Puede el equipo contener automáticamente una detección con una respuesta activa desplegada?',
  },
  {
    id: 'EV-12',
    controlId: 'op.exp.6',
    title: 'Análisis de ficheros de fuentes externas y dispositivos extraíbles',
    description:
      'Por cada vía de entrada de P-05, lo que la máquina puede demostrar: el análisis del correo que hace su pasarela (amavis) y las conexiones de discos extraíbles que registra el kernel, contrastadas con la política de P-10. Las vías que se analizan fuera de la máquina (proxy, pasarela ajena) no se pueden demostrar desde ella.',
    requirements: ['op.exp.6.3', 'op.exp.6.r5.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'external_file_scanned', 'removable_device_connected'],
    relatedRules: ['110712', '110713'],
    auditQuestion:
      '¿Se analiza lo que entra por cada vía declarada, y se respeta la política de dispositivos extraíbles?',
  },
  // op.exp.7. The subject is the MANAGER: its collector (agent.id 000) emits every fact from local files, and `sistema`/`sistemas` says which machine they refer to.
  // No evidence has `judgment`; `policies/op-exp-7.policy.ts` decides. Rules band 110800-110899.
  {
    id: 'EV-01',
    controlId: 'op.exp.7',
    title: 'Detección de eventos de seguridad e incidentes',
    description:
      'Generación de alertas sobre los eventos que pueden tener impacto en la seguridad del sistema, clasificadas según los criterios de P-01. Es el motor de detección que alimenta el proceso de gestión de incidentes y la razón por la que un SIEM es el soporte natural de este control.',
    requirements: ['op.exp.7.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // Manager alerts at or above the observation level, aggregated by system, rule, level and hour. The ENS severity comes from the policy with P-01.
    expectedEventTypes: ['evidence_state', 'security_alert_observed'],
    relatedRules: ['110801'],
    auditQuestion:
      '¿Detecta el SIEM los eventos de seguridad de los sistemas del alcance y los clasifica por severidad?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.7',
    title: 'Conciliación entre alertas y expedientes de incidente',
    description:
      'Correlación entre las alertas de severidad relevante generadas por Wazuh y los tickets de incidente registrados en P-03. Identifica alertas huérfanas: detecciones críticas que nunca se convirtieron en incidente gestionado. Es el hallazgo más frecuente y más difícil de defender de este control.',
    requirements: ['op.exp.7.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Crosses two fact flows: each High or Critical alert (P-01) must fall inside a registered incident of that system, within the P-02 escalation time.
    expectedEventTypes: ['evidence_state', 'security_alert_observed', 'incident_registered'],
    relatedRules: ['110801', '110802'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['incident_registered'],
    auditQuestion:
      '¿Se convierte en incidente registrado toda alerta de severidad alta o crítica?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.7',
    title: 'Tiempos de detección, contención y resolución',
    description:
      'Medición del tiempo transcurrido entre la alerta de Wazuh, la apertura del incidente, la contención registrada y el cierre, contrastado con los plazos comprometidos en P-05. Es la métrica que permite valorar si la asignación de recursos que exige op.exp.7.r2.2 es efectiva o nominal.',
    requirements: ['op.exp.7.r2.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // MTTD and MTTR: differences between register phases against the row of their severity in P-05.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'security_alert_observed'],
    relatedRules: ['110801', '110802'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['incident_registered'],
    auditQuestion:
      '¿Se contienen y resuelven los incidentes dentro de los plazos comprometidos para su severidad?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.7',
    title: 'Verificación del escalado y de la notificación a responsables',
    description:
      'Comprobación de que cada incidente fue escalado al destinatario que corresponde según la matriz P-02 y dentro del plazo, y de que se informó a los responsables de la información y servicios afectados identificados en P-04, como exige op.exp.7.r2.3.',
    requirements: ['op.exp.7.1', 'op.exp.7.r2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Escalation against P-02 (recipient and time) and, from MEDIA, communication to the P-04 owners of each affected system.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'incident_notification_recorded'],
    relatedRules: ['110802', '110803'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['incident_registered', 'incident_notification_recorded'],
    auditQuestion:
      '¿Se escaló cada incidente a quien correspondía, en plazo, y se informó a los responsables de los sistemas afectados?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.7',
    title: 'Preservación de evidencias y protección de los registros',
    description:
      'Verificación de que ante cada incidente se exportaron y conservaron los registros del período y de los sistemas afectados, con sellado de integridad, según P-08. op.exp.7.r2.1 exige expresamente recogida de evidencias y protección de los registros.',
    requirements: ['op.exp.7.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // Alert log of each day an incident spans: kept, with its rotation SHA-256 seal intact and the whole seal chain.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'alert_log_seal_checked'],
    relatedRules: ['110802', '110806'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['incident_registered', 'alert_log_seal_checked'],
    auditQuestion:
      '¿Se conservan íntegros los registros de alertas del periodo de cada incidente?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.7',
    title: 'Medidas urgentes de contención aplicadas',
    description:
      'Registro de las acciones de contención ejecutadas ante cada incidente conforme a P-09: aislamiento del sistema afectado, detención de servicios, bloqueo de IP o de cuenta. op.exp.7.r2.1 enumera estas medidas de forma expresa.',
    requirements: ['op.exp.7.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Containment of each High or Critical incident: a P-09 active response on an affected system during the incident, or the manual 'intermedio' phase.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'active_response_executed', 'active_response_configured'],
    relatedRules: ['110802', '110807', '110808'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['incident_registered', 'active_response_configured'],
    auditQuestion:
      '¿Consta una medida urgente de contención en cada incidente de severidad alta o crítica?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.7',
    title: 'Incidentes que afectan a datos personales',
    description:
      'Identificación de los incidentes que afectan a sistemas con datos personales según P-07, activación del contador de 72 horas y verificación de que consta la valoración de brecha y, si procede, la notificación a la AEPD y la comunicación a los interesados.',
    requirements: ['op.exp.7.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // Incidents touching a P-07 system: personal-data assessment and AEPD notification within 72 hours when affected.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'incident_notification_recorded'],
    relatedRules: ['110802', '110803'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['incident_registered', 'incident_notification_recorded'],
    auditQuestion:
      '¿Se valoró cada incidente en sistemas con datos personales y se notificó a la AEPD en 72 horas cuando procedía?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.7',
    title: 'Notificación de incidentes al CCN-CERT (R1)',
    description:
      'Verificación de que los incidentes que debían notificarse al CCN-CERT según su clasificación constan efectivamente notificados a través de la solución de ventanilla única declarada en P-06. R1 es obligatorio desde categoría MEDIA.',
    requirements: ['op.exp.7.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Incidents of notifiable severity per P-01: CCN-CERT notification registered within the P-02 time, through the P-06 desk.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'ccn_cert_notification_recorded'],
    relatedRules: ['110802', '110804'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['incident_registered', 'ccn_cert_notification_recorded'],
    auditQuestion:
      '¿Consta notificado al CCN-CERT cada incidente que debía notificarse?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.7',
    title: 'Reconfiguración dinámica ejecutada ante incidente (R3)',
    description:
      'Detección de cambios en los elementos de P-10 —reglas de cortafuegos, ACL, enrutadores, parámetros de IDS/IPS— producidos en respuesta a un incidente activo, acreditando la capacidad de detener, desviar o limitar ataques que exige R3 en categoría ALTA.',
    requirements: ['op.exp.7.r3.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    // Dynamic reconfiguration = a P-09 active response executed on a P-10 element. An element without agent leaves nothing to observe.
    expectedEventTypes: ['evidence_state', 'active_response_executed', 'active_response_configured'],
    relatedRules: ['110807', '110808'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['active_response_configured'],
    auditQuestion:
      '¿Se ha ejercitado la reconfiguración dinámica sobre los elementos declarados?',
  },
  {
    id: 'EV-10',
    controlId: 'op.exp.7',
    title: 'Adaptación a los avisos del CCN-CERT (R3)',
    description:
      'Verificación de que los indicadores de compromiso y las recomendaciones de los avisos del CCN-CERT sobre ciberamenazas sofisticadas y campañas de ataques se incorporan efectivamente a la capacidad de detección, como exige op.exp.7.r3.2.',
    requirements: ['op.exp.7.r3.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    // Each P-11 CDB list: exists, is loaded, is used by some rule and is not staler than the declared period.
    expectedEventTypes: ['evidence_state', 'threat_list_observed'],
    relatedRules: ['110809'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['threat_list_observed'],
    auditQuestion:
      '¿Se incorporan los indicadores de los avisos del CCN-CERT a la capacidad de detección?',
  },
  {
    id: 'EV-11',
    controlId: 'op.exp.7',
    title: 'Detección de anomalías y respuesta automatizada (R4)',
    description:
      'Identificación de comportamientos anómalos respecto a la línea base del sistema y ejecución de respuesta automatizada: aislamiento de dispositivos críticos, bloqueo de tráfico. Cubre parcialmente el Refuerzo R4, no obligatorio pero alcanzable.',
    requirements: ['op.exp.7.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // R4 is not required: automatic response configured and exercised.
    expectedEventTypes: ['evidence_state', 'active_response_executed', 'active_response_configured'],
    relatedRules: ['110807', '110808'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['active_response_configured'],
    auditQuestion:
      '¿Hay respuesta automática configurada y se ha ejercitado?',
  },
  {
    id: 'EV-12',
    controlId: 'op.exp.7',
    title: 'Medidas de mejora derivadas del incidente',
    description:
      'Verificación de que tras cerrar cada incidente constan las medidas exigidas por op.exp.7.r2.4: prevención de la repetición, incorporación a los procedimientos de usuario y actualización de los procedimientos de resolución. Es el bucle de aprendizaje que cierra el proceso.',
    requirements: ['op.exp.7.r2.4'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Every closed incident (final phase) must have improvement measures registered.
    expectedEventTypes: ['evidence_state', 'incident_registered', 'improvement_action_recorded'],
    relatedRules: ['110802', '110805'],
    // Reissued whole on every manager pass.
    stateFactEventTypes: ['incident_registered', 'improvement_action_recorded'],
    auditQuestion:
      '¿Consta alguna medida de mejora en cada incidente cerrado?',
  },
  // op.exp.8. Two planes, separated by the heartbeat (`tipo_servidor`): SERVER (EV-01, 02, 03, 06, 08: every Linux or LDAP agent and the manager)
  // and CENTRAL (EV-04, 05, 07, 09..13: manager only, agent.id=000). Only EV-02 is judged by a primitive; the rest by `policies/op-exp-8.policy.ts`.
  // Rules band 110900-110999.
  {
    // Server plane. Judged by the policy: auditd active with rules and persistent system log; slapd with `stats` on the directory;
    // each category P-01 declares auditable against what the kernel rules really log (`audit_coverage`).
    id: 'EV-01',
    controlId: 'op.exp.8',
    title: 'Generación y conservación del registro de auditoría',
    description:
      'Fuentes de registro de cada servidor y su estado: auditd (activo, habilitado en el kernel y con cuántas reglas cargadas), el registro del sistema (journald persistente o rsyslog) y, en un servidor LDAP, el registro de operaciones de slapd (olcLogLevel). Y, por cada categoría de evento que P-01 declara auditable, lo que las reglas cargadas en el kernel registran de verdad: qué rutas vigilan en escritura o qué llamadas al sistema. Es el registro de auditoría en sentido propio, en el sitio donde se genera.',
    requirements: ['op.exp.8.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'audit_log_status', 'audit_coverage'],
    stateFactEventTypes: ['audit_log_status', 'audit_coverage'],
    relatedRules: ['110901', '110914'],
    auditQuestion:
      '¿Está activo en el servidor un registro de auditoría, se conserva el registro del sistema y se registran de verdad todas las categorías de eventos que P-01 declara auditables? En un servidor LDAP, ¿registra slapd sus operaciones?',
  },
  {
    // Server plane. The only primitive judgment of op.exp.8.
    id: 'EV-02',
    controlId: 'op.exp.8',
    title: 'Cobertura de registro en los servidores',
    description:
      'Estado del agente de Wazuh de cada servidor y el instante de su último keepalive con el manager, en UTC. Acredita que el servidor entrega su registro de actividad: un agente que deja de comunicar deja de registrar a efectos del sistema, y su último contacto envejece contra el plazo de P-12.',
    requirements: ['op.exp.8.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'agent_status'],
    stateFactEventTypes: ['agent_status'],
    relatedRules: ['110902'],
    judgment: {
      // Existential and against the clock: the fact is the INSTANT of the last keepalive (UTC), so age grows on its own if the agent stops delivering. Never passes by absence.
      primitive: 'ANTIGUEDAD_MAXIMA',
      parameterId: 'P-12',
      factEventTypes: ['agent_status'],
      factField: 'ultimo_keepalive',
    },
    auditQuestion:
      '¿El agente del servidor ha entregado su registro al manager dentro del plazo de P-12?',
  },
  {
    // Server plane. A field absent from the WHOLE sample of a source is a finding.
    id: 'EV-03',
    controlId: 'op.exp.8',
    title: 'Suficiencia de los campos del registro de auditoría',
    description:
      'Muestra de los registros de auditoría más recientes de cada fuente (auditd; en LDAP, slapd), con cuántos traen cada uno de los cinco campos mínimos de op.exp.8.1: usuario o entidad, fecha y hora, objeto, tipo de evento y resultado.',
    requirements: ['op.exp.8.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'audit_record_fields'],
    stateFactEventTypes: ['audit_record_fields'],
    relatedRules: ['110903'],
    auditQuestion:
      '¿Los registros de auditoría del servidor traen los cinco campos de op.exp.8.1 (usuario, fecha y hora, objeto, tipo y resultado)?',
  },
  {
    // Central plane. The policy crosses P-02 with each agent's last keepalive on every pass. NOT a state fact: the gap shows in the SERIES of passes,
    // and keeping only the last would erase last night's gap, so it declares no `stateFactEventTypes`.
    id: 'EV-04',
    controlId: 'op.exp.8',
    title: 'Continuidad de la ingesta y detección de lagunas',
    description:
      'Continuidad de la entrega de cada servidor al manager, medida por su latido: en cada pasada, el recolector del manager lee de la base local de agentes de Wazuh (global.db, en solo lectura) el último keepalive y el estado de conexión de cada agente. Se cruza con los servidores declarados en P-02: una pasada en la que el último keepalive de uno de ellos quedaba más atrás que P-12 es una laguna, y el periodo queda sin trazabilidad. Si faltan pasadas del propio recolector, la continuidad no se puede acreditar. Los eventos recibidos por agente viajan solo como dato informativo: un servidor tranquilo puede pasar horas sin alertas sin que eso sea una laguna.',
    requirements: ['op.exp.8.1', 'op.exp.8.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'agent_keepalive_observed'],
    relatedRules: ['110915'],
    auditQuestion:
      '¿Todos los servidores declarados en P-02 mantienen su latido con el manager sin lagunas mayores que P-12 en ninguna pasada de la ventana?',
  },
  {
    // Central plane. The organisation's TSV register on the manager.
    id: 'EV-05',
    controlId: 'op.exp.8',
    title: 'Registro de las revisiones periódicas de los registros (R1)',
    description:
      'Revisiones periódicas de los registros anotadas por la organización en el registro del manager (/etc/ensfacil/log-review-register.tsv): cuántas hay y la más reciente, con revisor, alcance, hallazgos y referencia. R1 habla de revisión «informal», pero sin constancia no es acreditable.',
    requirements: ['op.exp.8.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'log_review_recorded'],
    stateFactEventTypes: ['log_review_recorded'],
    relatedRules: ['110905'],
    auditQuestion:
      '¿La revisión más reciente de los registros anotada por la organización es más reciente que la periodicidad de P-04?',
  },
  {
    // Server plane. Three axes (sync and source, offset, authentication) plus the trace of time changes. `clock_change_observed` is an action, not a state fact.
    id: 'EV-06',
    controlId: 'op.exp.8',
    title: 'Sincronización del reloj y protección de la referencia de tiempo (R2)',
    description:
      'Referencia de tiempo de cada servidor: servicio de sincronización, si está sincronizado, fuentes en uso, si la sincronización se autentica (NTS o clave), desfase medido y si auditd registra los cambios de la hora del sistema; y cada cambio de hora registrado, con la cuenta que lo hizo.',
    requirements: ['op.exp.8.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'time_sync_status', 'clock_change_observed'],
    stateFactEventTypes: ['time_sync_status'],
    relatedRules: ['110906', '110907'],
    auditQuestion:
      '¿El reloj está sincronizado con una fuente declarada, con autenticación, dentro de la desviación de P-06, y quedan registrados los cambios de hora?',
  },
  {
    // Central plane. The indexer retention (ISM) is not visible without credentials: unproven with cause CONFIGURATION.
    id: 'EV-07',
    controlId: 'op.exp.8',
    title: 'Retención efectiva de los registros frente a la declarada (R3)',
    description:
      'Retención de los registros: lo que el manager conserva en disco (alertas diarias y archives) y la retención de los índices del Wazuh Indexer frente a P-07. La segunda solo se ve consultando el indexer, y sin credenciales queda sin demostrar.',
    requirements: ['op.exp.8.r3.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'log_retention_observed'],
    stateFactEventTypes: ['log_retention_observed'],
    relatedRules: ['110908'],
    auditQuestion:
      '¿La retención efectiva de los registros respeta la declarada en P-07?',
  },
  {
    // Both planes: on each server, who can read its logs; on the manager, also indexer accesses, unproven without credentials.
    id: 'EV-08',
    controlId: 'op.exp.8',
    title: 'Control de acceso a los registros de actividad (R4)',
    description:
      'Quién puede leer los registros de actividad de cada servidor (propietario, grupo, ACL y lectura por cualquiera, fichero a fichero dentro de cada directorio de registro) frente a las cuentas autorizadas de P-08. En el manager, los accesos efectivos a los índices (audit log del indexer) quedan sin demostrar sin credenciales.',
    requirements: ['op.exp.8.r4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'log_access_permissions'],
    stateFactEventTypes: ['log_access_permissions'],
    relatedRules: ['110909'],
    auditQuestion:
      '¿Solo las cuentas autorizadas en P-08 pueden leer los registros de actividad?',
  },
  {
    // No fact: indexer snapshots need an indexer credential the manager collector does not use. An evidence_state NO_EVALUABLE (110950) says so.
    id: 'EV-09',
    controlId: 'op.exp.8',
    title: 'Protección de las copias de seguridad de los registros (R4)',
    description:
      'Existencia, frescura y protección de las copias de los registros (snapshots del Wazuh Indexer). Solo se ven consultando el indexer; sin credenciales quedan sin demostrar.',
    requirements: ['op.exp.8.r4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Existen copias de los registros al día y con el acceso restringido al personal de P-08?',
  },
  {
    // Central plane.
    id: 'EV-10',
    controlId: 'op.exp.8',
    title: 'Análisis automático en busca de comprometimientos (R5)',
    description:
      'Conjuntos de reglas de análisis cargados por el manager (ruleset oficial y reglas propias), con cuántas reglas y cuántas mapean técnicas MITRE ATT&CK, frente a los conjuntos declarados en P-10.',
    requirements: ['op.exp.8.r5.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'correlation_rules_inventory'],
    stateFactEventTypes: ['correlation_rules_inventory'],
    relatedRules: ['110910'],
    auditQuestion:
      '¿Están desplegados en el manager los conjuntos de reglas de análisis declarados en P-10?',
  },
  {
    // Central plane.
    id: 'EV-11',
    controlId: 'op.exp.8',
    title: 'Sistema automático de recolección, correlación y respuesta (R5)',
    description:
      'Respuestas activas configuradas en el manager: comando, ubicación, reglas o grupos que las disparan, tiempo de reversión y si están habilitadas, frente a las acciones previstas en P-11.',
    requirements: ['op.exp.8.r5.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'active_response_configured'],
    stateFactEventTypes: ['active_response_configured'],
    relatedRules: ['110911'],
    auditQuestion:
      '¿Hay respuestas automáticas configuradas y habilitadas en el manager, incluidas las de P-11?',
  },
  {
    // Central plane. Action, not state.
    id: 'EV-12',
    controlId: 'op.exp.8',
    title: 'Respuestas automáticas ejecutadas (R5)',
    description:
      'Respuestas automáticas ejecutadas en la ventana, en cualquier agente o en el manager, con la regla que las disparó, el objetivo y el número de ejecuciones. Una ejecución sin alerta que la dispare (un reinicio pedido a mano) no acredita respuesta automática.',
    requirements: ['op.exp.8.r5.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'active_response_executed'],
    relatedRules: ['110912'],
    auditQuestion:
      '¿Consta en la ventana alguna respuesta automática ejecutada a raíz de una alerta?',
  },
  {
    // Central plane.
    id: 'EV-13',
    controlId: 'op.exp.8',
    title: 'Integridad del propio sistema de registro',
    description:
      'Estado de los servicios del sistema de registro (wazuh-manager, wazuh-indexer, wazuh-dashboard), desde cuándo están activos, sus reinicios y la huella de la configuración del manager y de sus reglas propias.',
    requirements: ['op.exp.8.1', 'op.exp.8.r4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'logging_service_status'],
    stateFactEventTypes: ['logging_service_status'],
    relatedRules: ['110913'],
    auditQuestion:
      '¿Están activos todos los servicios del sistema de registro (manager, indexer, dashboard)?',
  },
  {
    id: 'EV-01',
    controlId: 'op.exp.9',
    title: 'Registro de eventos que originan cada incidente',
    description:
      'Conservación del conjunto de eventos que dieron lugar a la detección del incidente, con su marca temporal y sistemas implicados. Es la materia prima del reporte inicial que exige op.exp.9.1 y el punto de partida de cualquier análisis posterior.',
    requirements: ['op.exp.9.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Per incident and affected system: agent alerts in the incident window and daily alert archives present with their Wazuh checksum chain verified.
    // Judged by the op.exp.9 policy (correlation by `incidente_id`).
    expectedEventTypes: ['evidence_state', 'incident_source_events_available', 'incident_report_registered', 'register_read'],
    relatedRules: ['111002', '111001', '111010'],
    // Reissued whole on every manager pass: judged by the last pass, not the 30-day window.
    stateFactEventTypes: ['incident_source_events_available', 'register_read'],
    auditQuestion:
      '¿Conserva el manager, íntegros, los eventos de cada sistema afectado en la ventana de cada incidente?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.9',
    title: 'Completitud de los reportes inicial, intermedio y final',
    description:
      'Verificación de que cada incidente cuenta con los tres tipos de reporte que op.exp.9.1 distingue, cumplimentados según las plantillas de P-02. Un incidente con solo registro de cierre no satisface el requisito, que menciona expresamente los tres momentos.',
    requirements: ['op.exp.9.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // One register row per phase. With an empty register, the contrast is the manager's alert volume by rule and level (P-08, without the P-09 groups).
    expectedEventTypes: ['evidence_state', 'incident_report_registered', 'register_read', 'alert_volume_observed', 'alert_rule_volume_observed'],
    relatedRules: ['111001', '111010', '111011', '111012'],
    // Reissued whole on every manager pass: judged by the last pass, not the 30-day window.
    stateFactEventTypes: ['incident_report_registered', 'register_read', 'alert_volume_observed', 'alert_rule_volume_observed'],
    auditQuestion:
      '¿Tiene cada incidente registrados los reportes inicial, intermedio y final que exige P-02?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.9',
    title: 'Registro de las actuaciones de emergencia',
    description:
      'Constancia de las medidas urgentes ejecutadas durante el incidente: aislamiento, detención de servicios, bloqueos. op.exp.9.1 exige registrar expresamente «las actuaciones de emergencia», y Active Response produce ese registro de forma automática y fiable.',
    requirements: ['op.exp.9.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // What Wazuh recorded (active_response alerts in the incident window) against what the organisation linked to the file.
    expectedEventTypes: ['evidence_state', 'emergency_action_observed', 'incident_action_registered', 'incident_source_events_available', 'register_read'],
    relatedRules: ['111003', '111005', '111002'],
    // Reissued whole on every manager pass: judged by the last pass, not the 30-day window.
    stateFactEventTypes: ['emergency_action_observed', 'incident_action_registered', 'register_read'],
    auditQuestion:
      '¿Consta en el expediente cada respuesta activa ejecutada en un sistema afectado durante el incidente?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.9',
    title: 'Registro de las modificaciones del sistema derivadas del incidente',
    description:
      'Constancia de los cambios realizados en los sistemas como consecuencia del incidente: cambios de configuración, parches aplicados, reglas modificadas, cuentas deshabilitadas. op.exp.9.1 los exige registrar de forma expresa.',
    requirements: ['op.exp.9.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // FIM, packages, configuration (op.exp.3) and accounts (op.acc.1) observed in manager alerts, against the registered derived modifications.
    expectedEventTypes: ['evidence_state', 'system_change_observed', 'incident_action_registered', 'incident_source_events_available', 'register_read'],
    relatedRules: ['111004', '111005', '111002'],
    // Reissued whole on every manager pass: judged by the last pass, not the 30-day window.
    stateFactEventTypes: ['system_change_observed', 'incident_action_registered', 'register_read'],
    auditQuestion:
      '¿Consta en el expediente cada modificación observada en un sistema afectado durante el incidente?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.9',
    title: 'Exportación sellada de evidencias con valor probatorio',
    description:
      'Generación automática, al marcarse un incidente como de relevancia jurídica según P-04, del conjunto de evidencias declarado en P-03: registros del período y sistemas afectados, exportados con cálculo de hash y sellado de tiempo.',
    requirements: ['op.exp.9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Conditioned by the register's legal-relevance flag: with no flagged incidents there is no export to require.
    expectedEventTypes: ['evidence_state', 'evidence_export_sealed', 'incident_report_registered', 'register_read'],
    relatedRules: ['111006', '111001'],
    // Reissued whole on every manager pass: judged by the last pass, not the 30-day window.
    stateFactEventTypes: ['evidence_export_sealed', 'register_read'],
    auditQuestion:
      '¿Tiene cada incidente con relevancia jurídica sellada la evidencia que determina P-03?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.9',
    title: 'Cadena de custodia de las evidencias',
    description:
      'Registro de todos los accesos a las evidencias custodiadas: quién, cuándo y con qué finalidad, junto con la verificación periódica de que el hash de la evidencia sigue coincidiendo. Sin cadena de custodia acreditable, la evidencia pierde valor probatorio con independencia de su contenido.',
    requirements: ['op.exp.9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // The SHA-256 is recomputed on the manager when the evidence is there; repository accesses are noted by the organisation.
    expectedEventTypes: ['evidence_state', 'custody_access_recorded', 'custody_integrity_checked', 'evidence_export_sealed', 'register_read'],
    relatedRules: ['111006', '111007', '111008'],
    // Reissued whole on every manager pass: judged by the last pass, not the 30-day window.
    stateFactEventTypes: ['evidence_export_sealed', 'custody_integrity_checked', 'custody_access_recorded', 'register_read'],
    auditQuestion:
      '¿Está cada evidencia custodiada en un repositorio de P-05, con cadena de custodia y su SHA-256 intacto?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.9',
    title: 'Protección de los registros del período del incidente',
    description:
      'Bloqueo de la eliminación automática por política de retención de los índices correspondientes al período y sistemas de un incidente abierto o con relevancia jurídica, evitando que la rotación normal destruya evidencia necesaria.',
    requirements: ['op.exp.9.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // The manager disk part is measured (daily archives and checksum); the indexer ISM exemption is not visible without credentials and stays unproven with cause CONFIGURATION.
    expectedEventTypes: ['evidence_state', 'incident_source_events_available', 'incident_report_registered', 'register_read'],
    relatedRules: ['111002', '111001'],
    // Reissued whole on every manager pass: judged by the last pass, not the 30-day window.
    stateFactEventTypes: ['incident_source_events_available', 'register_read'],
    auditQuestion:
      '¿Se conservan, protegidos de la rotación, los registros del periodo de los incidentes abiertos o con relevancia jurídica?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.9',
    title: 'Realimentación de los eventos auditables tras el incidente',
    description:
      'Verificación de que el análisis de cada incidente relevante se traduce en revisión de la lista de eventos auditables y, en su caso, en nuevas reglas de detección. op.exp.9.3 lo exige expresamente y es el bucle que conecta este control con op.exp.8.',
    requirements: ['op.exp.9.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Changes to rules, decoders, ossec.conf and agent.conf with their instant, and reviews registered per incident. The deadline starts at closure, which no primitive expresses.
    expectedEventTypes: ['evidence_state', 'auditable_events_revised', 'incident_action_registered', 'incident_report_registered', 'register_read'],
    relatedRules: ['111009', '111005', '111001'],
    // Reissued whole on every manager pass: judged by the last pass, not the 30-day window.
    stateFactEventTypes: ['auditable_events_revised', 'incident_action_registered', 'register_read'],
    auditQuestion:
      '¿Se revisaron los eventos auditables tras cada incidente cerrado que lo exige P-07, dentro de su plazo?',
  },
  {
    id: 'EV-09',
    controlId: 'op.exp.9',
    title: 'Trazabilidad completa del expediente de incidente',
    description:
      'Consolidación en un único expediente consultable de todo lo relacionado con el incidente: alertas originarias, reportes, actuaciones de emergencia, modificaciones derivadas, evidencias custodiadas y revisión de eventos auditables. Es el entregable que un auditor querrá ver en su conjunto.',
    requirements: ['op.exp.9.1', 'op.exp.9.2', 'op.exp.9.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'TRACEABILITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // Consolidated view per incident; what is measured is that the file can be rebuilt from the register.
    expectedEventTypes: ['evidence_state', 'incident_report_registered', 'register_read'],
    relatedRules: ['111001'],
    // Reissued whole on every manager pass: judged by the last pass, not the 30-day window.
    stateFactEventTypes: ['incident_report_registered', 'register_read'],
    auditQuestion:
      '¿Enlaza cada fila del registro con su expediente, de modo que el expediente se pueda presentar entero?',
  },
  // op.exp.10. Two evidences are judged by a primitive (EV-02, EV-08); the rest by `policies/op-exp-10.policy.ts`. EV-02, EV-06 and EV-08 share ONE fact,
  // `key_material_found` (rule 111102). Rules band 111100-111199.
  {
    id: 'EV-01',
    controlId: 'op.exp.10',
    title: 'Accesos auditados al material criptográfico',
    description:
      'Todo acceso (lectura, escritura, cambio de permisos, borrado) a los almacenes de claves de P-02: lecturas auditadas con auditd en Linux y en el servidor LDAP (reglas -w <ruta> -p rwa) y con una SACL de lectura en Windows (evento 4663); FIM solo detecta cambios de integridad y no registra lecturas. Con la cuenta de la sesión que lo hizo —la persona aunque haya pasado por sudo— o, sin sesión, la cuenta del proceso, el proceso y el intervalo. Se contrasta la cuenta contra el personal autorizado de P-08.',
    requirements: ['op.exp.10.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // No `judgment` on purpose: an authorised access observed only accredits what was watched, and the primitive ignores coverage when there are facts.
    expectedEventTypes: ['evidence_state', 'key_material_accessed'],
    relatedRules: ['111101'],
    auditQuestion:
      '¿Solo el personal autorizado en P-08 accede al material criptográfico, y consta que todos los almacenes estaban vigilados?',
  },
  {
    id: 'EV-02',
    controlId: 'op.exp.10',
    title: 'Claves privadas fuera de los almacenes declarados',
    description:
      'Barrido de las claves privadas presentes en disco (identificadas por su cabecera, no por la extensión) con el directorio en que están. Una clave cuyo directorio no es un almacén declarado en P-02 es un indicio de copia o exfiltración de material criptográfico.',
    requirements: ['op.exp.10.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'key_material_found'],
    // The sweep is reissued whole each pass: a deleted key stops counting as soon as the next pass does not see it.
    stateFactEventTypes: ['key_material_found'],
    relatedRules: ['111102'],
    judgment: {
      // Each key found is a FINDING of a sweep: finding none outside the stores, with the heartbeat confirming the sweep finished, is the normal result.
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-02',
      // P-02 is `ruta | modo_maximo | propietario`; the column must be named.
      parameterColumn: 'ruta',
      factEventTypes: ['key_material_found'],
      factField: 'directorio',
    },
    auditQuestion:
      '¿Toda clave privada presente en disco está en un almacén declarado en P-02?',
  },
  {
    id: 'EV-03',
    controlId: 'op.exp.10',
    title: 'Algoritmos y parámetros criptográficos configurados (R1)',
    description:
      'Algoritmos que acepta cada servicio criptográfico según su configuración EFECTIVA (en sshd, `sshd -T`: cifrados, MAC, intercambio de claves, algoritmos de firma, claves de host y claves autorizadas; en slapd, versión mínima de TLS, suites y hash de contraseñas), con su familia y longitud, contrastados con los autorizados por el CCN en P-03 y con el alcance de P-04.',
    requirements: ['op.exp.10.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'crypto_config_observed'],
    stateFactEventTypes: ['crypto_config_observed'],
    relatedRules: ['111103'],
    auditQuestion:
      '¿Todos los algoritmos y longitudes que aceptan los servicios criptográficos figuran entre los autorizados en P-03?',
  },
  {
    id: 'EV-04',
    controlId: 'op.exp.10',
    title: 'Uso efectivo de protocolos y algoritmos (R1)',
    description:
      'Algoritmos NEGOCIADOS de verdad en las conexiones del periodo, leídos del log del servicio: en sshd, el tipo de clave con que se autentica cada cliente (y, con LogLevel DEBUG1, el intercambio de claves, el cifrado y el MAC); en slapd, la versión de TLS y la suite de cada conexión. Detecta el servicio que declara mínimos correctos y sigue aceptando conexiones inferiores.',
    requirements: ['op.exp.10.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'crypto_protocol_negotiated'],
    relatedRules: ['111104'],
    auditQuestion:
      '¿Todo lo negociado en las conexiones del periodo figura entre lo autorizado en P-03, y consta que el log registra la negociación completa?',
  },
  {
    id: 'EV-05',
    controlId: 'op.exp.10',
    title: 'Generación de claves en medios de explotación',
    description:
      'Ejecuciones de herramientas de generación de claves (ssh-keygen generando, openssl genpkey, genrsa, req -newkey…) registradas por auditd en la máquina, con la cuenta que las lanzó. Se contrasta con la función de la máquina en P-05: en un medio de explotación, cualquier generación incumple op.exp.10.2.',
    requirements: ['op.exp.10.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'EXECUTION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'key_generation_tool_executed'],
    relatedRules: ['111105'],
    auditQuestion:
      '¿Se generan claves en máquinas declaradas como medios de explotación en P-05?',
  },
  {
    id: 'EV-06',
    controlId: 'op.exp.10',
    title: 'Claves retiradas presentes en medios de explotación',
    description:
      'Contraste entre las claves declaradas como retiradas en P-01 (columna `estado`) y las claves privadas que el barrido encuentra en disco, por huella de la parte pública o por ubicación. Una clave retirada que sigue presente no está archivada en un medio aislado como exige op.exp.10.3.',
    requirements: ['op.exp.10.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // The SAME fact as EV-02: all private keys on disk.
    expectedEventTypes: ['evidence_state', 'key_material_found'],
    stateFactEventTypes: ['key_material_found'],
    relatedRules: ['111102'],
    auditQuestion:
      '¿Alguna clave declarada como retirada en P-01 sigue presente en esta máquina?',
  },
  {
    id: 'EV-07',
    controlId: 'op.exp.10',
    title: 'Vigencia y algoritmos de los certificados',
    description:
      'Inventario de los certificados X.509 en disco (sin el almacén de CA públicas del sistema) con su caducidad, su clave pública y su firma. Un certificado caducado que sigue instalado incumple op.exp.10.1 (la retirada no se gestiona); una clave o una firma no autorizadas en P-03 incumplen op.exp.10.r1.1. Los que caducan dentro de la antelación de P-10 se señalan.',
    requirements: ['op.exp.10.1', 'op.exp.10.r1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state', 'certificate_observed'],
    stateFactEventTypes: ['certificate_observed'],
    relatedRules: ['111107'],
    auditQuestion:
      '¿Hay certificados caducados instalados, o con clave o firma no autorizadas en P-03?',
  },
  {
    id: 'EV-08',
    controlId: 'op.exp.10',
    title: 'Protección de los ficheros de clave',
    description:
      'Modo y propietario de cada clave privada presente en disco, contrastados con la protección que P-02 declara para su almacén. Una clave privada legible por quien no es su propietario está materialmente desprotegida aunque nadie la haya leído todavía.',
    requirements: ['op.exp.10.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    // The SAME fact as EV-02 and EV-06.
    expectedEventTypes: ['evidence_state', 'key_material_found'],
    stateFactEventTypes: ['key_material_found'],
    relatedRules: ['111102'],
    judgment: {
      // The row is looked up by the key's DIRECTORY. Column `octal` compares 'no more permissive'. A key whose directory has no row cannot be judged: EV-02 reports it.
      primitive: 'CONFORME_A_TABLA',
      parameterId: 'P-02',
      factEventTypes: ['key_material_found'],
      factField: 'directorio',
      factKeyField: 'directorio',
      tableKeyColumn: 'ruta',
      tableChecks: [
        { column: 'modo_maximo', factField: 'modo' },
        { column: 'propietario', factField: 'propietario' },
      ],
    },
    auditQuestion:
      '¿Toda clave privada tiene un modo no más permisivo y el propietario que P-02 declara para su almacén?',
  },
  // op.mon.1. Everything is measured on the MANAGER (agent.id=000) from local files without credentials. Facts speak about OTHER systems through `agente`,
  // so no primitive judges them: `policies/op-mon-1.policy.ts` crosses each P-01 row with its fact by name or ID.
  // The collector only declares gaps (`evidence_state` NO_EVALUABLE with cause). Hourly pass: engine state (EV-01) every pass, the rest every 6 h reissued whole.
  // Contract in the runbook, exercised by `tests/op-mon-1-judgment.test.ts`. Rules band 111200-111299.
  {
    // The engine series between passes proves it processes, so `detection_engine_status` is NOT a state fact (the last pass would erase the one it is compared with);
    // neither is `ruleset_version_observed` (every 6 h, the hourly pass would discard it). The policy takes the latest of each against its freshness.
    id: 'EV-01',
    controlId: 'op.mon.1',
    title: 'Capacidad de detección de intrusiones desplegada y operativa',
    description:
      'Motor de reglas del manager en marcha y procesando: estado del servicio wazuh-manager, contadores del motor de análisis (eventos recibidos, procesados y descartados, alertas escritas) cuya serie entre pasadas prueba que procesa, y el ruleset cargado: versión de Wazuh, fecha del fichero de reglas más reciente, ficheros, reglas y reglas con técnica MITRE ATT&CK. Los conjuntos de reglas de P-03 (R1) se juzgan aparte, con el inventario de EV-04.',
    requirements: ['op.mon.1.1', 'op.mon.1.r1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'detection_engine_status', 'ruleset_version_observed'],
    relatedRules: ['111201', '111202'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Está el motor de reglas del manager en marcha, procesando eventos y con reglas cargadas?',
  },
  {
    // Per agent, every 6 h. Agents outside P-01 do not count. An unreadable agent database arrives in its fact (`lectura=error`);
    // the evidence-level evidence_state is only for global.db.
    id: 'EV-02',
    controlId: 'op.mon.1',
    title: 'Cobertura efectiva de la detección',
    description:
      'Por cada agente registrado en el manager (global.db, leída en solo lectura): estado de conexión, último keepalive, versión y grupos; y, de su base en el manager, el fin de su última pasada de FIM, de SCA y de inventario. Se contrasta con los sistemas de P-01: un sistema declarado sin agente, con el agente desconectado o sin pasada de FIM o SCA en P-10 horas es un punto ciego del control.',
    requirements: ['op.mon.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'detection_coverage_observed'],
    stateFactEventTypes: ['detection_coverage_observed'],
    relatedRules: ['111203'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada sistema de P-01 su agente conectado y ha completado pasadas de FIM y de SCA dentro de P-10?',
  },
  {
    // Per agent, every 6 h: last own alert (excluding ENSFácil) and volume of the last 24 h. 'Active system without detections' decides, with P-09.
    id: 'EV-03',
    controlId: 'op.mon.1',
    title: 'Detecciones de intrusión del período',
    description:
      'Por cada agente, a partir de alerts.json del manager (sin las alertas de ENSFácil): instante de su última alerta, alertas y nivel máximo de las últimas 24 h, reglas distintas disparadas y técnicas MITRE ATT&CK. Es la prueba de que la detección no solo está desplegada sino que produce resultado: un sistema de P-01 conectado que pasa más de P-09 días sin ninguna detección indica reglas que no se aplican o una ingesta que no llega.',
    requirements: ['op.mon.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'detection_activity_observed'],
    stateFactEventTypes: ['detection_activity_observed'],
    relatedRules: ['111204'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Ha producido cada sistema de P-01 conectado alguna detección en los últimos P-09 días?',
  },
  {
    // Per ruleset, every 6 h: the ids that can alert, as compressed ranges split into several lines if too long.
    id: 'EV-04',
    controlId: 'op.mon.1',
    title: 'Trazabilidad entre análisis de riesgos y capacidad de detección',
    description:
      'Identificadores de las reglas que el manager carga y que pueden generar una alerta (sin los ficheros excluidos ni las reglas de nivel 0), por conjunto y en rangos comprimidos. Se cruza con P-04: cada situación de compromiso del análisis de riesgos tiene que tener al menos una regla de detección cargada. Una situación sin regla es un punto ciego del control.',
    requirements: ['op.mon.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'ruleset_rules_loaded'],
    stateFactEventTypes: ['ruleset_rules_loaded'],
    relatedRules: ['111205'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada situación de compromiso de P-04 al menos una regla de detección cargada en el manager?',
  },
  {
    // Per product, every 6 h. Judged only if P-02 requires network detection.
    id: 'EV-05',
    controlId: 'op.mon.1',
    title: 'Ingesta y correlación de eventos de detección en red',
    description:
      'Por cada sistema de detección en red (Suricata, Snort, Zeek u otro IDS) cuyos eventos ingiere el manager: de dónde llegan (syslog remoto o el fichero que recoge un agente) y la última alerta de red recibida, con las de las últimas 24 h. Solo se exige si P-02 declara que el análisis de riesgos pide detección en red; si no, se informa y la justificación de P-02 queda en el informe.',
    requirements: ['op.mon.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'network_detection_observed'],
    stateFactEventTypes: ['network_detection_observed'],
    relatedRules: ['111206'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      'Si P-02 exige detección en red, ¿ingiere el manager los eventos de ese NIDS y ha recibido alertas suyas dentro de P-09?',
  },
  {
    // Report datum with no requirement judging it: 'procedures will exist' is documentary (P-05 or P-ATT) and applying a procedure to each alert is measured by op.exp.7.
    // The policy returns NO_APLICA with that motive so it does not show grey.
    id: 'EV-06',
    controlId: 'op.mon.1',
    title: 'Aplicación de los procedimientos de respuesta (R2)',
    description:
      'Que las alertas generadas se trataron conforme al procedimiento de respuesta que les corresponde según P-05. Es un dato del informe, sin veredicto propio: la existencia de los procedimientos (R2) se acredita documentalmente con P-05, y su aplicación a cada alerta la mide op.exp.7 cruzando las alertas con el registro de incidentes.',
    requirements: ['op.mon.1.r2.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se trataron las alertas conforme al procedimiento de P-05? (dato del informe; lo mide op.exp.7)',
  },
  {
    // R3 is not required in any category: it is measured and REPORTED without verdict. `active_response_configured` is state (every 6 h); `active_response_executed` is an action.
    id: 'EV-07',
    controlId: 'op.mon.1',
    title: 'Acciones predeterminadas de respuesta ejecutadas (R3)',
    description:
      'Respuestas automáticas configuradas en el manager (comando, reglas o grupos que las disparan, reversión, si están habilitadas) frente a las acciones de P-07, y las ejecutadas en la ventana con la regla que las disparó, el agente y el objetivo. R3 no es exigible en ninguna categoría: se informa como cobertura de hecho del enunciado general del bloque op.mon.',
    requirements: ['op.mon.1.r3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'LOW',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'active_response_configured', 'active_response_executed'],
    stateFactEventTypes: ['active_response_configured'],
    relatedRules: ['111207', '111208'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué respuestas automáticas de P-07 están configuradas y cuáles se han ejecutado a raíz de una alerta? (se informa: R3 no es exigible)',
  },
  {
    // Two axes: ruleset age against P-08 using `ruleset_version_observed` (the fact belongs to EV-01: one event name cannot be in two evidences), and silencings against P-06.
    id: 'EV-08',
    controlId: 'op.mon.1',
    title: 'Vigencia del conjunto de reglas y gestión de exclusiones',
    description:
      'Antigüedad del ruleset (fecha de su fichero de reglas más reciente) frente a P-08, y el barrido de silenciamientos del manager: ficheros de reglas excluidos en ossec.conf (rule_exclude) y reglas reescritas a nivel 0 en las reglas propias. Cada silenciamiento tiene que figurar en P-06 con su motivo y quién lo aprobó: una exclusión sin constancia degrada la detección sin que nadie lo advierta.',
    requirements: ['op.mon.1.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'rule_silenced'],
    stateFactEventTypes: ['rule_silenced'],
    relatedRules: ['111202', '111209'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Es el ruleset más reciente que P-08 y figura en P-06, con motivo y aprobación, cada fichero excluido y cada regla silenciada?',
  },
  // op.cont.2. DOCUMENT control with no runbook or rules: no machine emits facts, so no evidence listens to any event (`expectedEventTypes` and `sourceTypes` empty).
  // The policy resolves all of them (`policies/op-cont-2.policy.ts`) from the screen tables and their validity. What cannot be accredited is CONFIGURATION, never COLLECTION (see `controlExpectsFacts` in `registry.ts`).
  // Governed by the Availability level, only at ALTO; with D at BAJO or MEDIO all are NO_APLICA by level.
  // EV-01, EV-04 and EV-06 judge declarations (CUMPLE means complete and in force, accredited documentarily). EV-02, 05, 07, 08 cannot be measured and EV-03 is R2: NO_APLICA as report data.
  {
    id: 'EV-01',
    controlId: 'op.cont.2',
    title: 'Registro del plan de continuidad y de su vigencia',
    description:
      'Constancia del plan aprobado de P-01 (referencia, versión y fecha de aprobación) y control de que su última aprobación no tiene más antigüedad que la periodicidad de revisión de P-08 en la fecha de la evaluación. NO es verificación del contenido del plan: es control documental de existencia y vigencia. Sostiene los cinco requisitos, porque cada uno es un contenido del plan.',
    requirements: ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Consta un plan de continuidad aprobado, con su versión y fecha, cuya última aprobación no supera la periodicidad de revisión de P-08?',
  },
  {
    id: 'EV-02',
    controlId: 'op.cont.2',
    title: 'Detección y datación de interrupciones reales del servicio',
    description:
      'Interrupciones efectivamente producidas en los sistemas que soportan servicios esenciales (caída de agente, parada de servicio, pérdida de conectividad), con su hora de inicio y de restablecimiento. Dato del informe, sin veredicto: el requisito pide una PREVISIÓN, no ausencia de caídas, y el hecho que las mediría no se recoge en esta versión.',
    requirements: ['op.cont.2.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Qué interrupciones han sufrido los sistemas que soportan los servicios esenciales de P-02, y cuánto duró cada una?',
  },
  {
    id: 'EV-03',
    controlId: 'op.cont.2',
    title: 'Comprobación de integridad tras caída o discontinuidad (R2)',
    description:
      'Verificación de la integridad del sistema operativo, del firmware y de los ficheros de configuración de P-07 al reanudarse el servicio tras una caída. R2 no se exige en ningún nivel: solo informe. La comprobación en el arranque ya la mide op.exp.6 en cada agente (su EV-06).',
    requirements: ['op.cont.2.r2.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Se comprueba la integridad de los componentes de P-07 cada vez que el sistema vuelve de una caída?',
  },
  {
    id: 'EV-04',
    controlId: 'op.cont.2',
    title: 'Vigencia de los contratos de medios alternativos',
    description:
      'Cada medio alternativo de P-04 con el acuerdo o contrato que lo materializa y en vigor en la fecha de la evaluación. op.cont.2.3 exige que TODOS estén materializados en contrato: un medio sin contrato, o con el contrato vencido, es un incumplimiento directo. Se juzga la declaración, no el contrato.',
    requirements: ['op.cont.2.3'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Tiene cada medio alternativo de P-04 un acuerdo o contrato en vigor?',
  },
  {
    id: 'EV-05',
    controlId: 'op.cont.2',
    title: 'Coherencia de las funciones asignadas en el plan',
    description:
      'Contraste entre las personas con función en P-03 y su situación real en la organización (bajas, cambios de puesto). Dato del informe, sin veredicto: no hay directorio corporativo integrado (las bajas de op.acc.1 son cuentas de sistema, no personas), así que la declaración de P-03 se juzga en op.cont.2.1 y su coherencia la revisa el auditor.',
    requirements: ['op.cont.2.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Siguen en la organización, y en el puesto, las personas a las que P-03 asigna una función del plan?',
  },
  {
    id: 'EV-06',
    controlId: 'op.cont.2',
    title: 'Estado de la formación del personal afectado',
    description:
      'Cada responsable y cada suplente de P-03 con una fila en P-05 y la formación vigente en la fecha de la evaluación. op.cont.2.4 la exige de forma expresa: una persona con función sin formación registrada, o con la formación vencida, es un incumplimiento. Se juzga la declaración, no la formación.',
    requirements: ['op.cont.2.4'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Tiene cada persona con función en el plan (P-03) formación específica vigente en P-05?',
  },
  {
    id: 'EV-07',
    controlId: 'op.cont.2',
    title: 'Disponibilidad real frente a los objetivos comprometidos',
    description:
      'Disponibilidad efectiva de los sistemas que soportan servicios esenciales contrastada con los RTO y RPO de P-02. Dato del informe, sin veredicto: depende de las interrupciones de EV-02, que no se recogen en esta versión.',
    requirements: ['op.cont.2.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Se ha restablecido cada servicio esencial dentro de su RTO en las interrupciones del período?',
  },
  {
    id: 'EV-08',
    controlId: 'op.cont.2',
    title: 'Entrada en servicio de los medios alternativos',
    description:
      'Activación efectiva de los medios alternativos (arranque en el emplazamiento secundario, conmutación de servicios) y el intervalo desde la caída del medio habitual. Dato del informe, sin veredicto: no hay un hecho genérico que distinga «arrancó el CPD alternativo» de «arrancó una máquina».',
    requirements: ['op.cont.2.2'],
    levels: ['ALTO'],
    category: 'RECOVERY',
    criticality: 'LOW',
    sourceTypes: [],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion:
      '¿Entraron en servicio los medios alternativos cuando hizo falta, y en cuánto tiempo?',
  },
  // op.cont.3. Only with Availability at ALTO (`levelDimension: 'D'`); at MEDIA everything is NO_APLICA. The policy (`policies/op-cont-3.policy.ts`) judges EV-01, 02, 04, 05;
  // EV-03, 06, 07, 08 feed EV-04 and the report as NO_APLICA report data.
  // Measured on the MANAGER (agent.id=000) from local files: the two TSV registers (/etc/ensfacil/continuity-test-register.tsv and continuity-deficiency-register.tsv)
  // and, per registered test, the alerts of its window (agent stops and starts 503/504/506, mp.info.6 restores 106606, later FIM changes).
  // Facts speak about OTHER systems through `agente`; the policy crosses them by ID or exact name.
  // All facts are STATE: the collector reissues whole what it saw for each registered test, because as actions they would leave the 30-day window and the last test would go unmeasured.
  // Contract in the runbook, exercised by `tests/op-cont-3-judgment.test.ts`. Rules band 111700-111799.
  {
    // Test register read in the last pass (111701) and one row per test (111702). Empty register is not absent register: empty means no test is recorded (NO_CUMPLE); absent means nothing to judge against (CONFIGURATION).
    id: 'EV-01',
    controlId: 'op.cont.3',
    title: 'Registro histórico de las pruebas realizadas',
    description:
      'Constancia de cada prueba del plan de continuidad en el registro de pruebas del manager (/etc/ensfacil/continuity-test-register.tsv): inicio y fin, tipo (revisión documental, escritorio, parcial o simulacro), escenario, sistemas implicados, participantes, resultado declarado, deficiencias detectadas y referencia al informe. Se exige al menos una prueba que ejercite los medios alternativos (parcial o simulacro), y que P-02 prevea alguna: una revisión de escritorio no demuestra que funcionen.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_test_register_read', 'continuity_test_recorded'],
    stateFactEventTypes: ['continuity_test_register_read', 'continuity_test_recorded'],
    relatedRules: ['111701', '111702'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Consta en el registro alguna prueba del plan de continuidad, y alguna que ejercite los medios alternativos?',
  },
  {
    // No fact of its own: the policy computes, over EV-01 rows, the last test overall, per P-02 type and per P-03 scenario, at the instant the register was read.
    id: 'EV-02',
    controlId: 'op.cont.3',
    title: 'Control de la periodicidad de las pruebas',
    description:
      'Meses transcurridos desde la última prueba registrada, desde la última de cada tipo de P-02 (con su periodicidad, o la de P-01) y desde la última de cada escenario de P-03, contra P-01. Los escenarios de P-03 que nunca se han probado son el hueco de cobertura más concreto. Es la verificación de la primera de las dos obligaciones del requisito.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_test_register_read', 'continuity_test_recorded'],
    relatedRules: ['111702'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se ha probado el plan, cada tipo de prueba de P-02 y cada escenario de P-03 dentro de su periodicidad?',
  },
  {
    // Report datum, no verdict: feeds EV-04. Per partial test or drill with systems and per candidate agent, the chronology of stops, disconnections and starts in the test's REAL window and the next 24 h.
    id: 'EV-03',
    controlId: 'op.cont.3',
    title: 'Medición objetiva de lo ocurrido durante la prueba',
    description:
      'Por cada prueba parcial o simulacro y cada sistema implicado que es un agente de Wazuh: la cronología de paradas (regla 506), desconexiones (504) y arranques (503) de su agente en la ventana real de la prueba (la de su fila del registro, no la prevista en P-06) y en las 24 h siguientes, de alerts.json del manager y sus archivos diarios. De ella sale la indisponibilidad medida de cada sistema, que juzga EV-04 contra P-07.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'availability_event_observed'],
    stateFactEventTypes: ['availability_event_observed'],
    relatedRules: ['111705'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué caídas y restablecimientos registró el manager en la ventana de cada prueba? (dato del informe; lo juzga EV-04)',
  },
  {
    // No fact of its own: the policy crosses EV-03 chronology and EV-08 restores of each test with the P-07 RTOs and the result its row declares. Discrepancy: declared satisfactory but measured out of target.
    id: 'EV-04',
    controlId: 'op.cont.3',
    title: 'Resultado de la prueba frente a los objetivos comprometidos',
    description:
      'Por cada prueba parcial o simulacro del periodo de P-01: la indisponibilidad más larga medida de cada sistema implicado frente a su RTO de P-07 (con su tolerancia), si se restableció, y el resultado de las restauraciones de copias de la ventana, contrastados con el resultado declarado en el registro. Una prueba declarada satisfactoria cuya medida no alcanzó los objetivos es la discrepancia que este control persigue.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_test_recorded', 'availability_event_observed', 'backup_restore_observed'],
    relatedRules: ['111702', '111705', '111706'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Coincide el resultado declarado de cada prueba con lo medido en los sistemas frente a los RTO de P-07?',
  },
  {
    // Deficiency register read in the last pass (111703) and one row per deficiency (111704). Column `estado` travels as `situacion`.
    id: 'EV-05',
    controlId: 'op.cont.3',
    title: 'Deficiencias detectadas y seguimiento de su corrección',
    description:
      'Las deficiencias que cada prueba revela, en el registro de deficiencias del manager (/etc/ensfacil/continuity-deficiency-register.tsv), con su prueba de origen, responsable, plazo, estado y cierre. No cumple una deficiencia abierta fuera de plazo, una que sigue abierta cuando ya se hizo la prueba siguiente, ni una prueba del periodo que declara más deficiencias de las que el registro sigue. Cubre la SEGUNDA obligación del requisito, que exige corregir y no solo localizar.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded'],
    stateFactEventTypes: ['continuity_deficiency_register_read', 'continuity_deficiency_recorded'],
    relatedRules: ['111703', '111704'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Está cada deficiencia de las pruebas registrada, dentro de su plazo y cerrada antes de la prueba siguiente?',
  },
  {
    // Report datum, no verdict. Per test and agent, the FIM alerts of the 24 h after the window ends, aggregated.
    id: 'EV-06',
    controlId: 'op.cont.3',
    title: 'Integridad y estado del sistema tras la prueba',
    description:
      'Por cada prueba parcial o simulacro y cada sistema implicado que es un agente de Wazuh: los cambios de FIM (grupo syscheck) en las 24 h siguientes al fin de su ventana, con las rutas cambiadas. Son desviaciones que la prueba pudo dejar y que deberían constar como deficiencia aunque la prueba se considerase satisfactoria. Dato del informe, sin veredicto propio.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'INTEGRITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'post_test_change_observed'],
    stateFactEventTypes: ['post_test_change_observed'],
    relatedRules: ['111707'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué cambió en los sistemas de cada prueba después de su ventana? (dato del informe)',
  },
  {
    // No fact of its own. The plan version is a parameter of ANOTHER control (op.cont.2 P-01), so it is resolved with the `version_plan` column of the deficiency register.
    // A deficiency closed without version is a possibly nominal correction: reported, because not every correction requires a plan change.
    id: 'EV-07',
    controlId: 'op.cont.3',
    title: 'Actualización del plan tras las pruebas',
    description:
      'Por cada deficiencia cerrada del registro: la versión del plan de continuidad que recoge la corrección (columna version_plan). Las cerradas sin versión se señalan como corrección posiblemente nominal. Dato del informe, sin veredicto propio: no toda corrección cambia el plan, y la versión vigente del plan es de op.cont.2.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded'],
    relatedRules: ['111704'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué versión del plan recoge cada deficiencia cerrada? (dato del informe)',
  },
  {
    // Report datum, no verdict: feeds EV-04. A failed restore in the window of a test declared satisfactory is a discrepancy.
    id: 'EV-08',
    controlId: 'op.cont.3',
    title: 'Restauración de copias de seguridad en las pruebas',
    description:
      'Las pruebas de restauración de mp.info.6 (regla 106606) que el manager recibió en la ventana de cada prueba y las 24 h siguientes, con su agente, instante, resultado y si el contenido restaurado coincide. Se leen de alerts.json del manager, sin credenciales y sin tocar mp.info.6. Dato del informe, sin veredicto propio: una restauración fallida en una prueba declarada satisfactoria la juzga EV-04.',
    requirements: ['op.cont.3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'backup_restore_observed'],
    stateFactEventTypes: ['backup_restore_observed'],
    relatedRules: ['111706'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué restauraciones de copias se hicieron en cada prueba y con qué resultado? (dato del informe; lo juzga EV-04)',
  },
  // op.mon.2. A METACONTROL: its raw material is the result of the other controls, which a control's policy cannot see. EV-01, EV-05 and EV-07 are engine output
  // computed by the report model, and the policy returns them NO_APLICA with motive 'dato del informe'.
  // What leaves a trace is measured on the MANAGER from local files, every 6 h and reissued whole: metrics cycle register (EV-02, EV-06), op.exp.7 incident register (EV-03),
  // agent database with the heartbeats of all collectors read from alerts.json (EV-04). The collector only declares gaps; `policies/op-mon-2.policy.ts` judges.
  // Rules band 111300-111399.
  {
    // Report datum, no verdict: implementation percentage of each applicable P-01 measure from the result of all other controls, computed by the report model.
    id: 'EV-01',
    controlId: 'op.mon.2',
    title: 'Grado de implantación de las medidas de seguridad',
    description:
      'Porcentaje de implantación de cada medida aplicable según la Declaración de Aplicabilidad (P-01), agregado por marco y global, con el resultado que ENSFácil da a cada control. Es salida del motor, no un hecho: va al informe de op.mon.2 sin veredicto, y la serie que acredita que se consolida es EV-02.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué grado de implantación tiene cada medida aplicable de P-01? (dato del informe, sin veredicto)',
  },
  {
    // Every 6 h: the cycle register reading (111301) and one fact per cycle of the last 400 days plus always the last one (111302). Empty is judged; absent is CONFIGURATION.
    id: 'EV-02',
    controlId: 'op.mon.2',
    title: 'Serie histórica de los ciclos de métricas',
    description:
      'Registro de ciclos de métricas de la organización (/etc/ensfacil/metrics-cycle-register.tsv): cada vez que se consolida y valida el informe de ENSFácil se anota el periodo, la fecha de consolidación, el grado de implantación global y quién lo validó. El motor solo ve 30 días de hechos, así que la serie trimestral o anual no se puede reconstruir: se acredita con este registro. El último ciclo validado por un responsable de P-05 tiene que estar dentro de la periodicidad de P-02, con la Declaración de Aplicabilidad (P-01) configurada.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'metrics_register_read', 'metrics_cycle_recorded'],
    stateFactEventTypes: ['metrics_register_read', 'metrics_cycle_recorded'],
    relatedRules: ['111301', '111302'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Está el último ciclo de métricas validado por un responsable de P-05 dentro de la periodicidad de P-02?',
  },
  {
    // Every 6 h: the op.exp.7 incident register reading (111303) and one row per phase of incidents alive in the last 400 days (111304), with the 13 register columns.
    id: 'EV-03',
    controlId: 'op.mon.2',
    title: 'Métricas de comportamiento de la gestión de incidentes (R1)',
    description:
      'Indicadores de P-03 calculados con el registro de incidentes de op.exp.7 (/etc/ensfacil/incident-register.tsv, mismo fichero y mismo formato de 13 columnas), reemitido con la etiqueta op.mon.2: incidentes por tipo y por severidad, tiempos medios de contención y de resolución, notificados al CCN-CERT y a la AEPD. Cada incidente del periodo tiene que tener los datos que necesita cada indicador. Sin incidentes en el periodo, los indicadores valen cero y cumple si el registro existe y el último ciclo de métricas está en plazo.',
    requirements: ['op.mon.2.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'incident_register_read', 'incident_registered'],
    stateFactEventTypes: ['incident_register_read', 'incident_registered'],
    relatedRules: ['111303', '111304'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Permite el registro de incidentes calcular cada indicador de P-03 del periodo, y se consolida en un ciclo de métricas en plazo?',
  },
  {
    // Every 6 h, per agent: its state in global.db (111305) and the last pass of each ENSFácil collector that reported from it, read from alerts.json collector_run and kept between passes (111306).
    id: 'EV-04',
    controlId: 'op.mon.2',
    title: 'Fiabilidad de la medición',
    description:
      'Cobertura de la monitorización sobre la que se calculan las métricas: de los sistemas del alcance ENS (el grupo ens y el manager), cuántos tienen el agente conectado y todos sus recolectores de ENSFácil al día (su último latido en las 24 h anteriores a la lectura y sin fallar). Se contrasta con el objetivo cobertura_monitorizacion de P-06, menos su tolerancia: un grado de implantación calculado sobre una monitorización incompleta no es un dato sólido.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'agent_keepalive_observed', 'collector_heartbeat_observed'],
    stateFactEventTypes: ['agent_keepalive_observed', 'collector_heartbeat_observed'],
    relatedRules: ['111305', '111306'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Alcanza la cobertura de la monitorización del alcance ENS el objetivo de P-06?',
  },
  {
    // Report datum, no verdict: the greys of each control with the missing parameter.
    id: 'EV-05',
    controlId: 'op.mon.2',
    title: 'Controles no evaluables por falta de parámetros',
    description:
      'Recuento y relación de los controles con requisitos que ENSFácil no puede evaluar porque falta configuración del cliente, con el parámetro que falta en cada caso. Es salida del motor: va al informe de op.mon.2 sin veredicto, frente al objetivo controles_no_evaluables de P-06 si se declara.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué controles no se pueden evaluar por falta de parámetros, y cuáles faltan? (dato del informe, sin veredicto)',
  },
  {
    // No fact of its own: reads `metrics_cycle_recorded`, which belongs to EV-02 (an event name cannot be in two evidences).
    id: 'EV-06',
    controlId: 'op.mon.2',
    title: 'Recursos consumidos por el sistema de seguridad (R2)',
    description:
      'Horas internas, horas externas y presupuesto ejecutado del último ciclo del registro de ciclos de métricas, validados por un responsable de P-05 del ámbito «recursos», con el significado de cada columna declarado en P-04. Es un DATO DECLARADO, no obtenido de Wazuh: la herramienta lo registra y lo presenta junto a las métricas técnicas, pero no lo verifica, y el requisito sale acreditado documentalmente.',
    requirements: ['op.mon.2.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: ['111302'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene el último ciclo de métricas en plazo sus horas y su presupuesto, validados por un responsable de P-05?',
  },
  {
    // Report datum, no verdict: the art. 32 report IS the op.mon.2 report model, which combines EV-01 to EV-06 with the trace of each figure.
    id: 'EV-07',
    controlId: 'op.mon.2',
    title: 'Datos consolidados para el informe anual del artículo 32',
    description:
      'El conjunto de datos con la estructura del informe anual al que remite op.mon.2.1: grado de implantación, serie de ciclos, fiabilidad de la medición, controles no evaluables, indicadores de incidentes y recursos, cada cifra con su origen. Es la salida del modelo de informe, sin veredicto propio.',
    requirements: ['op.mon.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué datos aporta ENSFácil al informe anual del artículo 32, y de dónde sale cada cifra? (dato del informe, sin veredicto)',
  },
  // op.mon.3. TWO PLANES. The MANAGER plane measures from local files without credentials: central collection (wazuh-analysisd.state, wazuh-remoted.state, <remote>), correlation,
  // exposure surface (queue/db/NNN.db, queue/vd/feed, indexer connector errors in ossec.log), real-time alerting and the organisation registers (/etc/ensfacil).
  // The AGENT plane reads each machine's Wazuh state files (wazuh-logcollector.state, wazuh-agentd.state): volume and drops per source are only visible there.
  // Facts speak about sources and assets declared on screen, so `policies/op-mon-3.policy.ts` judges. On an agent row only its P-01 sources are judged.
  // Collectors only declare gaps. The manager's runs hourly (EV-01) and reissues the rest every 6 h; the agent's samples hourly and emits every 6 h.
  // Contract in the runbook, exercised by `tests/op-mon-3-judgment.test.ts`. Rules band 111400-111499.
  {
    // The series of counters between hourly passes proves it collects and does not drop, so `event_collection_status` is NOT a state fact.
    id: 'EV-01',
    controlId: 'op.mon.3',
    title: 'Sistema automático de recolección de eventos de seguridad',
    description:
      'El sistema central de recolección en marcha y recibiendo: estado del servicio wazuh-manager, contadores del motor de análisis (eventos recibidos, procesados y descartados) cuya serie entre pasadas horarias prueba que recolecta y que no pierde eventos, conexiones de <remote> (secure y syslog, con su puerto) y agentes registrados y activos en global.db.',
    requirements: ['op.mon.3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'event_collection_status'],
    relatedRules: ['111401'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Está el sistema central de recolección en marcha, recibiendo eventos de sus fuentes y sin descartarlos?',
  },
  {
    // Per source, every 6 h, both planes. Each P-01 row is judged on its machine's row (agent + location) or, for syslog, on the manager's (sender IP).
    // An unreadable state database arrives in the fact (`lectura`), not as the evidence-level evidence_state.
    id: 'EV-02',
    controlId: 'op.mon.3',
    title: 'Cobertura y continuidad de la recolección',
    description:
      'Por cada fuente que lee el logcollector de cada máquina (wazuh-logcollector.state): eventos, bytes y descartes desde el arranque y en el último periodo, y el último instante en que su contador creció; por cada agente, su conexión y su cola de envío (wazuh-agentd.state); y por cada emisor syslog que recibe el manager, su última alerta. Se contrasta con P-01: una fuente declarada que no se lee, que descarta eventos o que lleva más de max_horas_sin_eventos sin uno nuevo es un punto ciego de la vigilancia.',
    requirements: ['op.mon.3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'log_source_observed', 'agent_forwarding_observed', 'syslog_source_observed'],
    stateFactEventTypes: ['log_source_observed', 'agent_forwarding_observed', 'syslog_source_observed'],
    relatedRules: ['111402', '111403', '111404'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Genera eventos cada fuente declarada en P-01, sin descartes y sin lagunas mayores que las que admite?',
  },
  {
    id: 'EV-03',
    controlId: 'op.mon.3',
    title: 'Capacidad de correlación de eventos (R1)',
    description:
      'Por conjunto de reglas cargado en el manager: reglas, reglas que correlacionan (frequency y timeframe, o if_matched_sid / if_matched_group, con nivel efectivo de 1 o más) y técnicas MITRE ATT&CK que cubren. Y las alertas producidas por correlación en el periodo, por regla y día. Se contrasta con los conjuntos de P-02: R1 exige que se correlacione, no solo que se recolecte.',
    requirements: ['op.mon.3.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'correlation_rules_inventory', 'correlation_alert_observed'],
    stateFactEventTypes: ['correlation_rules_inventory'],
    relatedRules: ['111405', '111406'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Carga el manager reglas que combinan eventos en cada conjunto que declara P-02?',
  },
  {
    // R2 by CAPABILITY: the per-asset vulnerability count lives in the indexer and is not read without credentials.
    id: 'EV-04',
    controlId: 'op.mon.3',
    title: 'Superficie de exposición: vulnerabilidades y configuración (R2)',
    description:
      'Por cada activo de P-03, de su base en el manager (queue/db/NNN.db): el fin de su última pasada SCA por política, con aprobados, fallos y puntuación, y la fecha de su inventario de paquetes, del que se alimenta el detector de vulnerabilidades. Del detector: habilitado en ossec.conf, fecha de su fuente (queue/vd/feed) y errores del conector del indexer al escribir el estado de vulnerabilidades en las últimas 24 h (ossec.log). Un detector que no consigue escribir no determina nada. El recuento de CVE por activo no es local: se informa como «sin medir».',
    requirements: ['op.mon.3.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'config_assessment_observed', 'package_inventory_observed', 'vulnerability_detection_status'],
    stateFactEventTypes: ['config_assessment_observed', 'package_inventory_observed', 'vulnerability_detection_status'],
    relatedRules: ['111407', '111408', '111409'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada activo de P-03 su configuración (SCA) y su inventario analizados dentro de P-11, con el detector de vulnerabilidades al día y escribiendo sin errores?',
  },
  {
    // No fact and no verdict: Wazuh has no baseline engine. R3.1 is accredited with P-ATT; this evidence reports the P-04 baseline.
    id: 'EV-05',
    controlId: 'op.mon.3',
    title: 'Detección de comportamientos anómalos (R3.1)',
    description:
      'Línea base de comportamiento de P-04 (indicadores, normalidad y umbral de anomalía). Wazuh no calcula líneas base ni hace UEBA: las anomalías son reglas que alguien escribe sobre esos indicadores. Dato del informe, sin veredicto: R3.1 se acredita documentalmente (P-ATT).',
    requirements: ['op.mon.3.r3.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué línea base de comportamiento se ha validado y contra qué indicadores se detectan anomalías?',
  },
  {
    id: 'EV-06',
    controlId: 'op.mon.3',
    title: 'Detección de APT por anomalías en el tráfico de red (R3.2)',
    description:
      'Sistemas de detección en red (Suricata, Snort, Zeek) cuyos eventos ingiere el manager, por dónde llegan y su última alerta. Wazuh correlaciona esa detección pero no la genera: sin sonda de red, R3.2 no se cumple.',
    requirements: ['op.mon.3.r3.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'network_detection_observed'],
    stateFactEventTypes: ['network_detection_observed'],
    relatedRules: ['111410'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Ingiere el manager las alertas de la sonda de red que declara P-05, y son recientes?',
  },
  {
    // Informative: the requirement is to have the SERVICE, which is documentary.
    id: 'EV-07',
    controlId: 'op.mon.3',
    title: 'Incorporación de indicadores de cibervigilancia (R4)',
    description:
      'Listas CDB que carga el manager (<list> de ossec.conf): entradas, fecha de actualización y reglas que las usan, que es donde acaban los indicadores de un servicio de cibervigilancia. Dato del informe, sin veredicto: R4 exige disponer del observatorio, que se acredita documentalmente (P-ATT).',
    requirements: ['op.mon.3.r4.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'ioc_list_observed'],
    stateFactEventTypes: ['ioc_list_observed'],
    relatedRules: ['111411'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué listas de indicadores carga el manager, de cuándo son y qué reglas las usan?',
  },
  {
    id: 'EV-08',
    controlId: 'op.mon.3',
    title: 'Detección de intentos de minería de datos (R5.1)',
    description:
      'Ids de las reglas de umbral cargadas en el manager (con frequency y que pueden alertar) y sus alertas en el periodo. Se contrasta con P-07: cada consulta declarada tiene que estar vigilada por una regla de umbral. Requiere que la base de datos o la aplicación registren las consultas, no solo las conexiones.',
    requirements: ['op.mon.3.r5.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'query_volume_rules_observed'],
    stateFactEventTypes: ['query_volume_rules_observed'],
    relatedRules: ['111412', '111406'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Vigila una regla de umbral cargada cada sistema y perfil de P-07?',
  },
  {
    id: 'EV-09',
    controlId: 'op.mon.3',
    title: 'Alerta en tiempo real a los administradores de seguridad (R5.2)',
    description:
      'Canales de notificación del manager: el correo (email_notification, nivel mínimo y número de destinatarios) y cada <integration> de ossec.conf (nombre, nivel, grupos y errores de envío en integrations.log en 24 h). Nunca su hook_url ni su api_key. Se contrasta con P-08. La latencia alerta → aviso no es medible: Wazuh no anota los envíos correctos.',
    requirements: ['op.mon.3.r5.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'notification_channel_configured'],
    stateFactEventTypes: ['notification_channel_configured'],
    relatedRules: ['111413'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Existe y está habilitado cada canal de P-08, avisa desde el nivel declarado y envía sin errores?',
  },
  {
    // No fact of its own: the same SCA facts as EV-04.
    id: 'EV-10',
    controlId: 'op.mon.3',
    title: 'Inspección: verificación de configuración (R6.1)',
    description:
      'Verificación continua de la configuración con SCA en los activos de P-03 (los hechos de EV-04, contra P-11), o la última verificación del registro de inspecciones dentro de la periodicidad de P-09. La continuidad supera la exigencia de periodicidad.',
    requirements: ['op.mon.3.r6.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: ['111407'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se verifica la configuración de los activos de P-03 de forma continua o con la periodicidad de P-09?',
  },
  {
    // No fact of its own: the vulnerability detector and the EV-04 inventory.
    id: 'EV-11',
    controlId: 'op.mon.3',
    title: 'Inspección: análisis de vulnerabilidades (R6.2)',
    description:
      'Análisis continuo de vulnerabilidades: el detector habilitado, con su fuente al día y escribiendo sin errores, sobre el inventario reciente de cada activo de P-03 (los hechos de EV-04, contra P-11), o el último análisis del registro de inspecciones dentro de la periodicidad de P-09.',
    requirements: ['op.mon.3.r6.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: ['111408', '111409'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se analizan las vulnerabilidades de los activos de P-03 de forma continua o con la periodicidad de P-09?',
  },
  {
    // The organisation's act register: the collector reissues it whole each pass without judging it. Empty register is not absent register.
    id: 'EV-12',
    controlId: 'op.mon.3',
    title: 'Registro y seguimiento de las inspecciones de seguridad (R6)',
    description:
      'Filas del registro de inspecciones del manager (/etc/ensfacil/security-inspection-register.tsv): fecha, tipo (verificación de configuración, análisis de vulnerabilidades o prueba de penetración), alcance, ejecutor, hallazgos, estado de su remediación, motivo (periódica o tras incidente) e incidente. La última de cada tipo se contrasta con la periodicidad de P-09.',
    requirements: ['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'],
    levels: ['ALTO'],
    category: 'TRACEABILITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'security_inspection_recorded'],
    stateFactEventTypes: ['security_inspection_recorded'],
    relatedRules: ['111414'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Consta en el registro cada inspección de R6 dentro de la periodicidad de P-09?',
  },
  {
    // Informative: the incident register (13 columns, shared with op.exp.7 and op.exp.9) does not say which incidents revealed vulnerabilities.
    id: 'EV-13',
    controlId: 'op.mon.3',
    title: 'Inspecciones desencadenadas por incidentes',
    description:
      'Incidentes del periodo del registro de incidentes del manager y las inspecciones del registro de inspecciones que los citan (motivo «post_incidente»). Dato del informe, sin veredicto: el registro de incidentes no dice qué incidentes revelaron vulnerabilidades nuevas o subestimadas, que son los que R6 obliga a inspeccionar.',
    requirements: ['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'],
    levels: ['ALTO'],
    category: 'TRACEABILITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'incident_registered'],
    stateFactEventTypes: ['incident_registered'],
    relatedRules: ['111415'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué incidentes del periodo tienen una inspección posterior registrada?',
  },
  // op.nub.1. Mostly contractual. Two planes the report does not mix. DOCUMENTARY: EV-08 (P-04 certification, R1) and EV-09 (per-service file: P-03, P-08, P-09, P-10) are screen tables with validity,
  // judged by the policy against the evaluation date; CUMPLE reads 'acreditado documentalmente'. TECHNICAL: EV-01, EV-04, EV-07 (and EV-02 at ALTA) are measured by the MANAGER collector from local files:
  // presence of Wazuh cloud modules in ossec.conf and group agent.conf (never their keys), their alerts in alerts.json and errors in ossec.log.
  // `policies/op-nub-1.policy.ts` crosses each P-06 row with its module.
  // EV-03 (shadow IT), EV-05 (encryption) and EV-06 (region) are report data without verdict; what is declared (P-09, P-08) is judged in EV-09.
  // The collector only declares gaps and runs every 6 h. Contract in the runbook, exercised by `tests/op-nub-1-judgment.test.ts`. Rules band 111500-111599.
  {
    // Per cloud module, every 6 h (or a fact with modulo=ninguno). The policy crosses each P-06 row with its module: configured and enabled, no errors in 24 h, logs newer than P-13.
    id: 'EV-01',
    controlId: 'op.nub.1',
    title: 'Ingesta de registros de los servicios en la nube',
    description:
      'Por cada módulo cloud de Wazuh (aws-s3, azure-logs, gcp-pubsub, gcp-bucket, office365, ms-graph, github): dónde está configurado (ossec.conf del manager, agent.conf de un grupo o el agente dedicado que envía sus alertas), si está habilitado, el instante de su última alerta, las alertas de las últimas 24 h y sus errores en ossec.log. Se contrasta con P-06: un servicio declarado como integrado cuyo módulo no está, está deshabilitado, da errores o lleva más de P-13 horas sin registros es un punto ciego de trazabilidad. Los servicios de P-02 sin integración se señalan en el informe, sin veredicto.',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'cloud_integration_observed'],
    stateFactEventTypes: ['cloud_integration_observed'],
    relatedRules: ['111501'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Llegan a Wazuh, sin errores y dentro de P-13 horas, los registros de cada servicio que P-06 declara integrado?',
  },
  {
    // ALTA only (R2). Not 'SCA cloud' (Wazuh 4.14 has none): the provider's own posture findings ingested by Wazuh, summarised per module, source and standard every 6 h.
    id: 'EV-02',
    controlId: 'op.nub.1',
    title: 'Configuración del inquilino según los hallazgos de postura del proveedor (R2)',
    description:
      'Por módulo, fuente y estándar: los controles de postura que el propio proveedor evalúa y envía a Wazuh (AWS Security Hub o Config por aws-s3, Microsoft Defender por ms-graph, Security Command Center por gcp-pubsub), con el último resultado de cada control, los fallidos y los críticos. Se contrasta con P-07: un control fallido en un servicio de P-07 incumple R2. Wazuh 4.14 no trae políticas SCA para inquilinos cloud; sin hallazgos de postura del proveedor, R2 no es automatizable.',
    requirements: ['op.nub.1.r2.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'cloud_posture_finding_observed'],
    stateFactEventTypes: ['cloud_posture_finding_observed'],
    relatedRules: ['111502'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Pasan los controles de postura del proveedor en cada servicio de P-07, con el estándar que declara?',
  },
  {
    // Report datum, no requirement judging it.
    id: 'EV-03',
    controlId: 'op.nub.1',
    title: 'Detección de servicios cloud no inventariados (shadow IT)',
    description:
      'Servicios en la nube en uso que no figuran en el inventario P-02. Es un dato del informe, sin veredicto: detectarlos exige el DNS o el proxy de los equipos, y con los ficheros locales del manager no se ven (el inventario de Wazuh solo da los puertos en escucha). Lo que sí se informa son los módulos cloud que Wazuh ingiere y P-06 no declara.',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Hay servicios en la nube en uso fuera de P-02? (dato del informe: no medible con ficheros locales)',
  },
  {
    // An action, aggregated per pass (module, account, actor). 30-day window. Each human actor must be in P-11 for its service.
    id: 'EV-04',
    controlId: 'op.nub.1',
    title: 'Operaciones administrativas en los servicios cloud',
    description:
      'Operaciones de administración con éxito en los servicios integrados (creación y modificación de identidades, permisos, configuración de seguridad, reglas de red), agregadas por módulo, cuenta y actor a partir de las alertas de los módulos cloud: CloudTrail, registro de actividad de Azure, Cloud Audit Logs. Cada actor humano tiene que figurar en P-11 para su servicio; las acciones de los propios servicios del proveedor no se contrastan. Sin operaciones de personas, solo cumple si el recolector lee un registro de administración del módulo (CloudTrail, el registro de actividad de Azure o los Cloud Audit Logs de Admin Activity) con eventos en los últimos 30 días: Entra ID por Graph, office365 y github no lo traen, y quedan sin evaluar.',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'cloud_admin_operation_observed'],
    relatedRules: ['111503'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Ha ejecutado operaciones de administración en algún servicio integrado un actor que P-11 no autoriza?',
  },
  {
    // Report datum: without 'SCA cloud' there is no measure of configured encryption; what P-09 declares is judged in EV-09.
    id: 'EV-05',
    controlId: 'op.nub.1',
    title: 'Verificación del cifrado y del modelo de gestión de claves',
    description:
      'El cifrado de los datos y el modelo de gestión de claves de cada servicio. Es un dato del informe, sin veredicto: Wazuh 4.14 no tiene SCA para inquilinos cloud y el recolector no usa credenciales del proveedor, así que el cifrado configurado no se puede medir. Lo declarado en P-09 forma parte del expediente documental (EV-09, op.nub.1.2 c).',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué cifrado y qué gestión de claves declara cada servicio en P-09? (dato del informe: no medible sin SCA cloud)',
  },
  {
    // Report datum: same with the region (P-08).
    id: 'EV-06',
    controlId: 'op.nub.1',
    title: 'Verificación de la región de los datos',
    description:
      'La región de los datos y de sus copias en cada servicio. Es un dato del informe, sin veredicto: Wazuh 4.14 no tiene SCA para inquilinos cloud ni el recolector usa credenciales del proveedor, así que la región configurada no se puede medir. Lo declarado en P-08 forma parte del expediente documental (EV-09, op.nub.1.2 d).',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Qué región de datos y de copias declara cada servicio en P-08? (dato del informe: no medible sin SCA cloud)',
  },
  {
    // An action, aggregated per pass (module, account, user, result, second factor). 30-day window. Report finding with no requirement judging it: the second-factor criterion is op.acc.6.r8.1
    // (Azure trusted locations would give false reds here). The policy returns NO_APLICA with what was observed.
    id: 'EV-07',
    controlId: 'op.nub.1',
    title: 'Autenticaciones y accesos en los servicios cloud',
    description:
      'Inicios de sesión interactivos en los servicios integrados (consola de AWS, inicios de sesión de Microsoft Entra ID), agregados por módulo, cuenta, usuario, resultado y segundo factor, con sus orígenes. Es un hallazgo del informe, sin veredicto en op.nub.1: un acceso con éxito sin segundo factor desde una zona no controlada lo juzga op.acc.6.r8.1, y aquí se señala cruzado con él. Si el proveedor no registra el segundo factor (accesos federados, Google Cloud), se dice.',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state', 'cloud_authentication_observed'],
    relatedRules: ['111504'],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Se ha accedido con éxito a algún servicio integrado sin segundo factor? (hallazgo del informe; lo juzga op.acc.6.r8.1)',
  },
  {
    // Documentary (R1): P-04 per service in use, against the evaluation date. No fact.
    id: 'EV-08',
    controlId: 'op.nub.1',
    title: 'Vigencia de las certificaciones de los proveedores (R1)',
    description:
      'Por cada servicio utilizado de P-02, su certificación de P-04 bajo una metodología reconocida, con su número y su vigencia frente a la fecha de la evaluación, y los días que le quedan. NO es verificación del documento: es control de su validez temporal, y su CUMPLE se lee «acreditado documentalmente». Una certificación vencida o ausente incumple R1.',
    requirements: ['op.nub.1.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada servicio de terceros una certificación reconocida en vigor? (declarado, acreditado documentalmente)',
  },
  {
    // Documentary: the per-service file, against the evaluation date. No fact.
    id: 'EV-09',
    controlId: 'op.nub.1',
    title: 'Expediente documental del servicio en la nube',
    description:
      'Por cada servicio utilizado de P-02: su conformidad con el ENS (de categoría no inferior a la del sistema) o con la guía CCN-STIC, vigente (P-03); su último informe de pentest, no más viejo que P-12 meses (P-10, op.nub.1.2 a); su cifrado y gestión de claves (P-09, c); la región de sus datos y copias y la jurisdicción (P-08, d). La transparencia (b) la cubre la conformidad declarada. Es DOCUMENTACIÓN APORTADA, no verificada técnicamente: su CUMPLE se lee «acreditado documentalmente».',
    requirements: ['op.nub.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    agentDeclaresOnlyGaps: true,
    auditQuestion:
      '¿Tiene cada servicio de terceros su expediente completo y vigente: conformidad, pentest, cifrado y jurisdicción? (declarado, acreditado documentalmente)',
  },
  // mp.eq.2. Born DRAFT without a collector (wave A, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 111800-111899.
  {
    id: 'EV-01',
    controlId: 'mp.eq.2',
    title: 'Política de bloqueo por inactividad configurada',
    description:
      'Verificación en cada equipo de P-03 de que existe bloqueo automático por inactividad, que su temporizador no supera P-01 y que el desbloqueo exige credenciales. El requisito pide expresamente «nueva autenticación», de modo que un salvapantallas sin contraseña no lo satisface.',
    requirements: ['mp.eq.2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: política de bloqueo por inactividad configurada?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.eq.2',
    title: 'Política de cancelación de sesiones configurada (R1)',
    description:
      'Verificación de que existe límite de sesión inactiva que cancela las sesiones abiertas, que su valor es superior al de P-01 y que no excede P-02. La relación entre ambos tiempos es parte del requisito.',
    requirements: ['mp.eq.2.r1.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: política de cancelación de sesiones configurada (r1)?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.eq.2',
    title: 'Eventos de bloqueo y desbloqueo de estación',
    description:
      'Registro de los eventos de bloqueo y desbloqueo efectivos en cada puesto, lo que permite comprobar que la política no solo está configurada sino que opera. Una política correcta que nunca produce eventos de bloqueo en equipos con actividad es un indicio claro de que algo la está neutralizando.',
    requirements: ['mp.eq.2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: eventos de bloqueo y desbloqueo de estación?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.eq.2',
    title: 'Sesiones de larga duración sin bloqueo intermedio',
    description:
      'Detección de sesiones que se mantienen activas durante períodos prolongados sin ningún evento de bloqueo, pese a que el patrón de actividad sugiere que debió haber inactividad. Es la señal de que el control no está operando en la práctica.',
    requirements: ['mp.eq.2.1', 'mp.eq.2.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: sesiones de larga duración sin bloqueo intermedio?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.eq.2',
    title: 'Herramientas de inhibición del temporizador de inactividad',
    description:
      'Detección de procesos o ejecutables instalados que neutralizan el bloqueo por inactividad simulando actividad del usuario. Es el vector de elusión del control y no se detecta con ninguna comprobación de configuración.',
    requirements: ['mp.eq.2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: herramientas de inhibición del temporizador de inactividad?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.eq.2',
    title: 'Cobertura y excepciones del control',
    description:
      'Contraste entre los equipos de P-03 y los que efectivamente tienen la política verificada, con las excepciones autorizadas de P-04 identificadas por separado. Permite distinguir un hueco de cobertura de una excepción aceptada.',
    requirements: ['mp.eq.2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: cobertura y excepciones del control?',
  },
  // mp.eq.3. Born DRAFT without a collector (wave B, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 111900-111999.
  {
    id: 'EV-01',
    controlId: 'mp.eq.3',
    title: 'Inventario de dispositivos portátiles con su responsable',
    description:
      'Contraste entre el inventario declarado en P-01 y los equipos portátiles efectivamente detectados por Syscollector —identificables por chasis, presencia de batería y modelo—, verificando que cada uno tiene responsable asignado. mp.eq.3.1 exige inventario Y responsable.',
    requirements: ['mp.eq.3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: inventario de dispositivos portátiles con su responsable?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.eq.3',
    title: 'Señal de vida y control de custodia',
    description:
      'Última conexión de cada dispositivo portátil y tiempo transcurrido, como señal complementaria al control regular de custodia que exige mp.eq.3.1. Un dispositivo que no reporta durante semanas merece verificación activa de su paradero.',
    requirements: ['mp.eq.3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: señal de vida y control de custodia?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.eq.3',
    title: 'Claves de acceso remoto almacenadas en el dispositivo',
    description:
      'Detección de la presencia de claves de acceso remoto a la organización en los dispositivos portátiles: claves SSH privadas, perfiles de VPN con credenciales incrustadas, ficheros con secretos, almacenes de contraseñas. mp.eq.3.4 pide expresamente evitarlas.',
    requirements: ['mp.eq.3.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: claves de acceso remoto almacenadas en el dispositivo?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.eq.3',
    title: 'Estado del cifrado del disco (R1)',
    description:
      'Verificación de que el cifrado de disco está activo en los dispositivos a los que resulta exigible según P-06, con el mecanismo y el estado de protección de la clave de recuperación. R1 es obligatorio en categoría ALTA para los dispositivos que almacenen información de confidencialidad MEDIA o ALTA.',
    requirements: ['mp.eq.3.r1.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: estado del cifrado del disco (r1)?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.eq.3',
    title: 'Servicios accesibles en conexiones desde dispositivos portátiles',
    description:
      'Verificación de que las conexiones remotas desde dispositivos portátiles a través de redes no controladas solo alcanzan la información y servicios del perfil autorizado en P-04. mp.eq.3.3 exige limitarlos a los mínimos imprescindibles.',
    requirements: ['mp.eq.3.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: servicios accesibles en conexiones desde dispositivos portátiles?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.eq.3',
    title: 'Reacción ante pérdida o sustracción',
    description:
      'Verificación de que cada incidente de pérdida registrado fue seguido de las acciones de P-08 en plazo: revocación de certificados, deshabilitación de cuentas, cierre de sesiones, borrado o bloqueo remoto.',
    requirements: ['mp.eq.3.2', 'mp.eq.3.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: reacción ante pérdida o sustracción?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.eq.3',
    title: 'Patrones de uso en entornos no previstos',
    description:
      'Señal indirecta para R2: accesos desde geografías, rangos de direcciones o redes inusuales que sugieren uso del dispositivo fuera de los entornos protegidos previstos. No acredita R2 —que es normativo— pero aporta información útil al responsable.',
    requirements: ['mp.eq.3.r2.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: patrones de uso en entornos no previstos?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.eq.3',
    title: 'Configuración de seguridad específica de los portátiles',
    description:
      'Verificación de los ajustes que reducen el impacto de una pérdida más allá del cifrado: arranque seguro habilitado, contraseña de BIOS/UEFI, arranque desde medios externos deshabilitado, bloqueo de puerto de depuración. Complementa el requisito general de protección adecuada del enunciado.',
    requirements: ['mp.eq.3.r1.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: configuración de seguridad específica de los portátiles?',
  },
  // mp.eq.4. Born DRAFT without a collector (wave C, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 112000-112099.
  {
    id: 'EV-01',
    controlId: 'mp.eq.4',
    title: 'Descubrimiento de dispositivos presentes en la red',
    description:
      'Identificación de los dispositivos conectados a partir de las fuentes de P-03: concesiones DHCP, tablas de direcciones de la electrónica de red, autenticaciones 802.1X. Es la única vía de ver dispositivos que no admiten agente, y cubre de facto la primera parte del Refuerzo R2.',
    requirements: ['mp.eq.4.1', 'mp.eq.4.r2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: descubrimiento de dispositivos presentes en la red?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.eq.4',
    title: 'Dispositivos no inventariados conectados a la red',
    description:
      'Contraste entre los dispositivos descubiertos en EV-01 y el inventario declarado en P-01. Un dispositivo conectado que no consta en el inventario no tiene configuración de seguridad verificada ni flujo de información definido, lo que vulnera mp.eq.4.1 en términos materiales.',
    requirements: ['mp.eq.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: dispositivos no inventariados conectados a la red?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.eq.4',
    title: 'Flujos de información de los dispositivos frente a lo autorizado',
    description:
      'Verificación de que los flujos de entrada y salida observados para cada dispositivo se ajustan a lo definido en P-02. Es la vía realista de verificar mp.eq.4.1 cuando no hay agente: no se evalúa la configuración del dispositivo, se evalúa su comportamiento en la red.',
    requirements: ['mp.eq.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: flujos de información de los dispositivos frente a lo autorizado?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.eq.4',
    title: 'Registros propios del dispositivo por syslog o SNMP',
    description:
      'Ingesta de los eventos que el propio dispositivo genera cuando lo permite según P-04: accesos al panel de administración, cambios de configuración, trabajos procesados, errores. Es la única evidencia desde dentro del dispositivo que se puede obtener sin agente.',
    requirements: ['mp.eq.4.1', 'mp.eq.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: registros propios del dispositivo por syslog o snmp?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.eq.4',
    title: 'Accesos al panel de administración de los dispositivos',
    description:
      'Detección de accesos a las interfaces de administración de los dispositivos, con origen y resultado. Un panel de multifunción con credenciales por defecto accesible desde la red de usuarios es un hallazgo frecuente y de impacto real, porque desde ahí se accede a los documentos almacenados.',
    requirements: ['mp.eq.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: accesos al panel de administración de los dispositivos?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.eq.4',
    title: 'Conexión y desconexión de dispositivos a la red (R2)',
    description:
      'Registro de los eventos de conexión y desconexión y de los intentos bloqueados por el mecanismo de control de P-08: autenticaciones 802.1X, violaciones de port security, decisiones del NAC. Cubre la segunda parte de R2, no obligatorio pero es lo que permite reaccionar en el momento.',
    requirements: ['mp.eq.4.r2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: conexión y desconexión de dispositivos a la red (r2)?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.eq.4',
    title: 'Dispositivos de invitados y BYOD en segmento no previsto',
    description:
      'Verificación de que los dispositivos no corporativos están en el segmento que les corresponde según P-06 y no alcanzan recursos internos. El ámbito del control incluye expresamente los dispositivos de invitados y los personales de los empleados.',
    requirements: ['mp.eq.4.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: dispositivos de invitados y byod en segmento no previsto?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.eq.4',
    title: 'Ejecución del borrado del almacenamiento del dispositivo',
    description:
      'Cuando el dispositivo lo registre, constancia de la ejecución de la función de eliminación de información de su almacenamiento conforme a P-05. mp.eq.4.2 exige que el dispositivo proporcione esa funcionalidad; que se use es lo que da sentido al requisito.',
    requirements: ['mp.eq.4.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ejecución del borrado del almacenamiento del dispositivo?',
  },
  // mp.com.1. Born DRAFT without a collector (wave C, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 112100-112199.
  {
    id: 'EV-01',
    controlId: 'mp.com.1',
    title: 'Ingesta de los registros del sistema de protección perimetral',
    description:
      'Recolección de los registros de los elementos de P-01: conexiones aceptadas y denegadas, con origen, destino, protocolo, puerto y regla aplicada. Es la base de todo el control: sin registros del perímetro no hay forma de acreditar qué flujos pasan.',
    requirements: ['mp.com.1.1', 'mp.com.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ingesta de los registros del sistema de protección perimetral?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.com.1',
    title: 'Flujos observados frente a flujos autorizados',
    description:
      'Contraste entre los flujos que efectivamente atraviesan el perímetro y el registro de flujos autorizados de P-02. Un flujo que pasa sin autorización previa registrada incumple mp.com.1.2 de forma directa, con independencia de que la regla del cortafuegos exista.',
    requirements: ['mp.com.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: flujos observados frente a flujos autorizados?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.com.1',
    title: 'Interfaces de red no previstas en los sistemas',
    description:
      'Detección de adaptadores de red adicionales, interfaces virtuales, conexiones inalámbricas activas o módems en los sistemas del alcance, que constituyan una vía por la que el tráfico no atraviese el perímetro. Es la verificación directa del «todo el tráfico» de mp.com.1.1.',
    requirements: ['mp.com.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: interfaces de red no previstas en los sistemas?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.com.1',
    title: 'Rutas y salidas alternativas a redes externas',
    description:
      'Identificación de rutas por defecto hacia destinos distintos del perímetro previsto y de conexiones salientes que no aparecen en los registros del perímetro, lo que evidencia una vía de elusión.',
    requirements: ['mp.com.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: rutas y salidas alternativas a redes externas?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.com.1',
    title: 'Túneles y canales de evasión del perímetro',
    description:
      'Detección de túneles salientes, clientes VPN no corporativos, software de acceso remoto inverso y servicios de tunelización que permiten eludir el perímetro desde dentro, lo que vulnera mp.com.1.1 aunque el cortafuegos esté perfectamente configurado.',
    requirements: ['mp.com.1.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: túneles y canales de evasión del perímetro?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.com.1',
    title: 'Reglas del perímetro sin uso y reglas permisivas',
    description:
      'Identificación de flujos autorizados en P-02 sin tráfico observado en el período —candidatos a retirada— y de patrones de regla excesivamente permisiva según P-05. Da soporte a la revisión periódica de P-04.',
    requirements: ['mp.com.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: reglas del perímetro sin uso y reglas permisivas?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.com.1',
    title: 'Servicios de administración expuestos al exterior',
    description:
      'Detección de tráfico entrante desde redes externas hacia puertos de administración —SSH, RDP, paneles web, bases de datos—, que evidencia una exposición perimetral que rara vez está autorizada de forma consciente.',
    requirements: ['mp.com.1.1', 'mp.com.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: servicios de administración expuestos al exterior?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.com.1',
    title: 'Continuidad del registro del perímetro',
    description:
      'Verificación de que los registros de todos los elementos de P-01 llegan de forma continua, sin lagunas. Un período sin registros del perímetro es un período sin acreditación posible de qué flujos pasaron, y es además el escenario en que un cambio de reglas pasa inadvertido.',
    requirements: ['mp.com.1.1', 'mp.com.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: continuidad del registro del perímetro?',
  },
  // mp.com.3. Born DRAFT without a collector (wave B, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 112200-112299.
  {
    id: 'EV-01',
    controlId: 'mp.com.3',
    title: 'Autenticación del extremo remoto previa al intercambio',
    description:
      'Verificación en los logs de cada canal de P-01 de que la autenticación mutua del otro extremo se completa ANTES de intercambiar información. mp.com.3.1 es expreso en el orden: autenticar y después intercambiar.',
    requirements: ['mp.com.3.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: autenticación del extremo remoto previa al intercambio?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.com.3',
    title: 'Algoritmos y parámetros configurados (R2)',
    description:
      'Verificación de que los algoritmos, suites de cifrado, longitudes de clave y versiones de protocolo configurados en cada extremo figuran entre los autorizados por el CCN según P-02. Es el refuerzo con mejor cobertura automática del control.',
    requirements: ['mp.com.3.1', 'mp.com.3.r2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: algoritmos y parámetros configurados (r2)?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.com.3',
    title: 'Algoritmos efectivamente negociados en las comunicaciones',
    description:
      'Protocolo y suite realmente negociados en cada conexión, frente a los configurados como mínimo admisible. Un extremo puede declarar TLS 1.2 como mínimo y seguir aceptando conexiones inferiores por un error de configuración o por una excepción heredada.',
    requirements: ['mp.com.3.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: algoritmos efectivamente negociados en las comunicaciones?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.com.3',
    title: 'Detección de alteración de información en tránsito',
    description:
      'Identificación del primero de los tres ataques activos de mp.com.3.2: fallos de verificación de integridad, errores de MAC o de firma en los canales, discrepancias de suma de comprobación en transferencias, renegociaciones anómalas.',
    requirements: ['mp.com.3.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: detección de alteración de información en tránsito?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.com.3',
    title: 'Detección de inyección de información espuria',
    description:
      'Identificación del segundo ataque activo: recepción de información no originada por el extremo legítimo, mensajes con estructura o firma inválida, peticiones con origen suplantado, respuestas DNS o ARP incoherentes en los canales.',
    requirements: ['mp.com.3.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: detección de inyección de información espuria?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.com.3',
    title: 'Detección de secuestro de sesión por tercera parte',
    description:
      'Identificación del tercer ataque activo: uso simultáneo o sucesivo de un mismo identificador de sesión desde orígenes distintos, cambio abrupto de dirección o de agente de usuario dentro de una sesión, reutilización de token tras su cierre.',
    requirements: ['mp.com.3.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: detección de secuestro de sesión por tercera parte?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.com.3',
    title: 'Activación del procedimiento de incidente ante ataque activo',
    description:
      'Verificación de que cada detección de ataque activo de EV-04 a EV-06 fue seguida de la apertura del incidente conforme a P-04. mp.com.3.2 no se satisface con detectar: exige garantizar que la detección activa los procedimientos previstos de tratamiento del incidente.',
    requirements: ['mp.com.3.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: activación del procedimiento de incidente ante ataque activo?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.com.3',
    title: 'Cifrado efectivo de los canales fuera del dominio (R1)',
    description:
      'Verificación de que los canales de P-01 que discurren por redes ajenas al dominio de seguridad van por VPN cifrada conforme a P-06, y de que el túnel está efectivamente establecido y en uso cuando hay tráfico.',
    requirements: ['mp.com.3.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: cifrado efectivo de los canales fuera del dominio (r1)?',
  },
  {
    id: 'EV-09',
    controlId: 'mp.com.3',
    title: 'Mecanismos de identificación aceptados y rechazados',
    description:
      'Verificación de que el servicio no rechaza mecanismos de identificación y autenticación previstos en el ordenamiento jurídico según P-05. mp.com.3.3 es un requisito de no exclusión: el incumplimiento consiste en rechazar un mecanismo legalmente válido.',
    requirements: ['mp.com.3.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: mecanismos de identificación aceptados y rechazados?',
  },
  {
    id: 'EV-10',
    controlId: 'mp.com.3',
    title: 'Integridad de la configuración de los canales protegidos',
    description:
      'Vigilancia de los ficheros de configuración de los extremos de comunicación y de los túneles, para detectar cambios que degraden la protección: relajación de algoritmos, desactivación de verificación de certificado del par, ampliación de suites admitidas.',
    requirements: ['mp.com.3.1', 'mp.com.3.r2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: integridad de la configuración de los canales protegidos?',
  },
  {
    id: 'EV-11',
    controlId: 'mp.com.3',
    title: 'Vigencia de las certificaciones de producto (R4)',
    description:
      'Seguimiento de la vigencia de las certificaciones conforme a op.pl.5 declaradas en P-08, con alerta anticipada de vencimiento. No es verificación del documento: es control de su validez temporal.',
    requirements: ['mp.com.3.r4.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: vigencia de las certificaciones de producto (r4)?',
  },
  // mp.com.4. Born DRAFT without a collector (wave C, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 112300-112399.
  {
    id: 'EV-01',
    controlId: 'mp.com.4',
    title: 'Clasificación de los flujos por segmento de origen y destino',
    description:
      'Enriquecimiento de cada evento de red con el segmento de origen y de destino según el mapa de P-01. Es la base de todo el control: permite razonar sobre segmentos en lugar de sobre direcciones, que es como está formulado el requisito.',
    requirements: ['mp.com.4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: clasificación de los flujos por segmento de origen y destino?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.com.4',
    title: 'Fugas de segmentación: flujos entre segmentos no autorizados',
    description:
      'Detección de comunicaciones entre segmentos que no figuran en la matriz de P-02. Es la verificación del efecto de la segmentación: no comprueba si existe la VLAN, comprueba si el tráfico se comporta como si la hubiera, que es lo que el requisito persigue.',
    requirements: ['mp.com.4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: fugas de segmentación: flujos entre segmentos no autorizados?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.com.4',
    title: 'Equipos con presencia en más de un segmento',
    description:
      'Detección de sistemas con interfaces en segmentos distintos, que constituyen un puente entre ellos y pueden anular la separación sin que ninguna regla lo autorice. Un servidor con dos tarjetas en VLAN distintas es una pasarela no declarada.',
    requirements: ['mp.com.4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: equipos con presencia en más de un segmento?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.com.4',
    title: 'Separación efectiva de las comunicaciones inalámbricas',
    description:
      'Verificación de que el tráfico originado en los rangos inalámbricos de P-04 permanece en su segmento y solo alcanza lo autorizado. mp.com.4.2 es un requisito específico y taxativo sobre las inalámbricas.',
    requirements: ['mp.com.4.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: separación efectiva de las comunicaciones inalámbricas?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.com.4',
    title: 'Registro del tráfico en los puntos de interconexión (R4)',
    description:
      'Ingesta de los registros de los elementos que controlan los puntos de interconexión de P-05, con las conexiones aceptadas y denegadas entre segmentos. R4 remite expresamente a mp.com.1, de modo que cada punto de interconexión hereda las exigencias del perímetro.',
    requirements: ['mp.com.4.r4.1', 'mp.com.4.r4.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: registro del tráfico en los puntos de interconexión (r4)?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.com.4',
    title: 'Control de entrada de usuarios a cada segmento (R4)',
    description:
      'Verificación de que la asignación de segmento a cada usuario se corresponde con su identidad según los criterios de P-06. mp.com.4.r4.1 exige control de entrada de los usuarios que llegan a cada segmento, no solo control del tráfico.',
    requirements: ['mp.com.4.r4.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: control de entrada de usuarios a cada segmento (r4)?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.com.4',
    title: 'Modalidad de segmentación implementada (R1, R2, R3)',
    description:
      'Verificación de la forma de segmentación declarada en P-03: existencia y configuración de VLAN con su etiquetado, túneles VPN establecidos, o separación física efectiva. Incluye la comprobación de admisibilidad para la categoría del sistema.',
    requirements: ['mp.com.4.r1.1', 'mp.com.4.r2.1', 'mp.com.4.r3.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: modalidad de segmentación implementada (r1, r2, r3)?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.com.4',
    title: 'Segregación mínima en usuarios, servicios y administración',
    description:
      'Verificación de que existen al menos los tres segmentos que exige mp.com.4.r1.2 —usuarios, servicios y administración— y de que los equipos están en el que les corresponde por su función.',
    requirements: ['mp.com.4.r1.2'],
    levels: ['MEDIO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: segregación mínima en usuarios, servicios y administración?',
  },
  {
    id: 'EV-09',
    controlId: 'mp.com.4',
    title: 'Propagación de incidentes entre segmentos',
    description:
      'Verificación del propósito declarado del control: que los incidentes queden encapsulados en su segmento. Detección de actividad maliciosa que se propaga de un segmento a otro, lo que evidencia que la segmentación no está acotando la propagación.',
    requirements: ['mp.com.4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: propagación de incidentes entre segmentos?',
  },
  {
    id: 'EV-10',
    controlId: 'mp.com.4',
    title: 'Estado y vigencia de la matriz de flujos',
    description:
      'Flujos autorizados en P-02 sin tráfico observado —candidatos a retirada— y flujos observados que no estaban previstos, como soporte a la revisión periódica de P-07.',
    requirements: ['mp.com.4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: estado y vigencia de la matriz de flujos?',
  },
  // mp.sw.2. Born DRAFT without a collector (wave A, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 112400-112499.
  // EV-01 covers no requirement on purpose: the template ties it to the control's statement. It detects each commissioning,
  // the trigger that EV-02 to EV-09 judge against mp.sw.2.1 and R1.
  {
    id: 'EV-01',
    controlId: 'mp.sw.2',
    title: 'Detección de puestas en servicio de aplicaciones',
    description:
      'Identificación del momento en que una aplicación o una nueva versión entra en producción, a partir de los cambios en el inventario de software de los sistemas de P-01. Es el disparador de todas las demás comprobaciones del control.',
    requirements: [],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: detección de puestas en servicio de aplicaciones?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.sw.2',
    title: 'Existencia de aceptación previa a la puesta en servicio',
    description:
      'Verificación de que cada puesta en servicio detectada en EV-01 estuvo precedida de un acta de aceptación registrada en P-07. El enunciado del control es expreso: la comprobación se hace ANTES de pasar a producción.',
    requirements: ['mp.sw.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: existencia de aceptación previa a la puesta en servicio?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.sw.2',
    title: 'Diferencial de seguridad del entorno antes y después del despliegue',
    description:
      'Comparación del estado de seguridad de los sistemas afectados en la ventana previa y posterior a la puesta en servicio según P-04: porcentaje de cumplimiento SCA, puertos abiertos, servicios en ejecución y vulnerabilidades detectadas. Es la verificación directa de mp.sw.2.1 b).',
    requirements: ['mp.sw.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: diferencial de seguridad del entorno antes y después del despliegue?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.sw.2',
    title: 'Exposición introducida por la aplicación',
    description:
      'Puertos y servicios que aparecen tras el despliegue, contrastados con los previstos para la aplicación en P-06. Un puerto nuevo no declarado amplía el perímetro de exposición sin que nadie lo haya autorizado.',
    requirements: ['mp.sw.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: exposición introducida por la aplicación?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.sw.2',
    title: 'Vulnerabilidades introducidas con la aplicación',
    description:
      'Vulnerabilidades conocidas que aparecen en el inventario tras el despliegue, atribuibles a la aplicación o a sus componentes de terceros. Es la forma más concreta de deterioro de seguridad que mp.sw.2.1 b) pretende evitar.',
    requirements: ['mp.sw.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: vulnerabilidades introducidas con la aplicación?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.sw.2',
    title: 'Verificación automática de los criterios de aceptación',
    description:
      'Comprobación de los criterios de P-02 que son técnicamente verificables: ausencia de vulnerabilidades por encima del umbral, configuración criptográfica conforme, registro de actividad activo, autenticación según lo exigido.',
    requirements: ['mp.sw.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: verificación automática de los criterios de aceptación?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.sw.2',
    title: 'Trazabilidad del paso por preproducción (R1)',
    description:
      'Verificación de que la versión desplegada en producción estuvo previamente instalada en el entorno de preproducción emparejado en P-03. R1 es obligatorio desde categoría MEDIA.',
    requirements: ['mp.sw.2.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'API', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: trazabilidad del paso por preproducción (r1)?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.sw.2',
    title: 'Aislamiento efectivo del entorno de preproducción (R1)',
    description:
      'Verificación de que el entorno de preproducción está realmente aislado: sin rutas hacia producción, sin acceso a datos reales, con credenciales propias. R1 exige expresamente «entorno aislado», y un preproducción conectado a producción no lo es.',
    requirements: ['mp.sw.2.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: aislamiento efectivo del entorno de preproducción (r1)?',
  },
  {
    id: 'EV-09',
    controlId: 'mp.sw.2',
    title: 'Estabilidad del servicio tras la puesta en servicio',
    description:
      'Detección de degradación funcional o de seguridad en la ventana posterior al despliegue: errores en volumen anómalo, caídas de servicio, fallos de autenticación nuevos. Da soporte objetivo a la comprobación de «correcto funcionamiento» del enunciado.',
    requirements: ['mp.sw.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: estabilidad del servicio tras la puesta en servicio?',
  },
  {
    id: 'EV-10',
    controlId: 'mp.sw.2',
    title: 'Seguimiento de hallazgos de auditoría de código (R2)',
    description:
      'Si existe auditoría de código fuente conforme a P-08: registro de su realización y seguimiento del cierre de los hallazgos, cruzándolos con las vulnerabilidades observadas en producción.',
    requirements: ['mp.sw.2.r2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: seguimiento de hallazgos de auditoría de código (r2)?',
  },
  // mp.s.1. Born DRAFT without a collector (wave A, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 112500-112599.
  {
    id: 'EV-01',
    controlId: 'mp.s.1',
    title: 'Ingesta de los registros de la plataforma de correo',
    description:
      'Recolección de los eventos del servicio de correo y de su pasarela de seguridad declarados en P-01: mensajes entregados, filtrados, en cuarentena, con detección, y resultado de cada filtro. Es la base de todo el bloque de amenazas del control.',
    requirements: ['mp.s.1.3', 'mp.s.1.4', 'mp.s.1.5'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ingesta de los registros de la plataforma de correo?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.s.1',
    title: 'Eficacia del filtrado de correo no solicitado',
    description:
      'Volumen de mensajes clasificados como no solicitados, entregados, puestos en cuarentena y liberados, con la tasa de falsos positivos aparente. Acredita que el filtro de mp.s.1.3 no solo existe sino que opera y está razonablemente calibrado.',
    requirements: ['mp.s.1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: eficacia del filtrado de correo no solicitado?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.s.1',
    title: 'Detecciones de código dañino en el correo',
    description:
      'Detecciones registradas en mensajes y anexos por tipo de amenaza, con el destinatario, el remitente y la acción aplicada. mp.s.1.4 enumera expresamente virus, gusanos, troyanos y espías, de modo que conviene desglosar por categoría.',
    requirements: ['mp.s.1.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: detecciones de código dañino en el correo?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.s.1',
    title: 'Verificación del análisis de anexos sobre todo el correo',
    description:
      'Comprobación de que el análisis de código dañino se ejecuta sobre todos los mensajes con anexo y no se omite por tamaño, tipo de fichero, cifrado del anexo o remitente en lista de confianza. Las omisiones son el hueco por el que entra lo que entra.',
    requirements: ['mp.s.1.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: verificación del análisis de anexos sobre todo el correo?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.s.1',
    title: 'Tratamiento del código móvil y del contenido activo',
    description:
      'Verificación de que el contenido activo en los mensajes se bloquea o neutraliza conforme a P-07: anexos con macros, scripts en cuerpos HTML, ejecutables, aplicaciones embebidas. Acredita mp.s.1.5.',
    requirements: ['mp.s.1.5'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: tratamiento del código móvil y del contenido activo?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.s.1',
    title: 'Cifrado en tránsito del correo',
    description:
      'Verificación de que el correo viaja cifrado conforme a P-03: versión de TLS negociada en los saltos SMTP entrantes y salientes, y porcentaje de correo que viaja en claro. Acredita la parte de tránsito de mp.s.1.1 y de mp.s.1.2.',
    requirements: ['mp.s.1.1', 'mp.s.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: cifrado en tránsito del correo?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.s.1',
    title: 'Autenticación del dominio: SPF, DKIM y DMARC',
    description:
      'Verificación de la existencia y coherencia de los registros de P-02 y análisis de los informes agregados de DMARC. Protege la información de encaminamiento de mp.s.1.2 y previene la suplantación del dominio propio. NOTA: estos mecanismos no aparecen nombrados en el texto del ENS; son el medio estándar de cumplir el requisito, no una exigencia literal.',
    requirements: ['mp.s.1.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: autenticación del dominio: spf, dkim y dmarc?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.s.1',
    title: 'Suplantación del dominio propio y fraude por correo',
    description:
      'Detección de mensajes que suplantan el dominio o la identidad de personas de la organización: fallos de alineación DMARC, dominios similares al propio, remitente interno con origen externo. Es la amenaza de mayor impacto económico del correo y se apoya en mp.s.1.2.',
    requirements: ['mp.s.1.2', 'mp.s.1.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: suplantación del dominio propio y fraude por correo?',
  },
  {
    id: 'EV-09',
    controlId: 'mp.s.1',
    title: 'Integridad de la configuración del servicio de correo',
    description:
      'Vigilancia de los cambios en la configuración del MTA, de las reglas de la pasarela y de los registros DNS del dominio, para detectar degradaciones: desactivación de un filtro, relajación de TLS, alteración de SPF, incorporación de remitentes a lista de confianza.',
    requirements: ['mp.s.1.1', 'mp.s.1.2', 'mp.s.1.3', 'mp.s.1.4', 'mp.s.1.5'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'INTEGRITY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: integridad de la configuración del servicio de correo?',
  },
  {
    id: 'EV-10',
    controlId: 'mp.s.1',
    title: 'Resultados de las campañas de concienciación',
    description:
      'Si se realizan campañas de phishing simulado conforme a P-09: tasa de apertura, de clic y de notificación por parte de los usuarios. Es la única parte del bloque normativo que produce datos aprovechables, y da una métrica de eficacia de la concienciación de mp.s.1.7.',
    requirements: ['mp.s.1.7'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: resultados de las campañas de concienciación?',
  },
  // mp.s.2. Born DRAFT without a collector (wave B, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 112600-112699.
  {
    id: 'EV-01',
    controlId: 'mp.s.2',
    title: 'Ingesta de los registros de los servidores y aplicaciones web',
    description:
      'Recolección de los registros de acceso y de error de los servidores de P-02, y del WAF si existe. Es la fuente de detección de las seis amenazas que enumera el requisito base y la base de todo el control.',
    requirements: ['mp.s.2.1', 'mp.s.2.2', 'mp.s.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ingesta de los registros de los servidores y aplicaciones web?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.s.2',
    title: 'Acceso a información protegida obviando la autenticación',
    description:
      'Detección de accesos exitosos a las rutas de P-03 sin que conste autenticación previa en la misma sesión. Es el supuesto central que mp.s.2.1 pretende impedir y la comprobación más directa del requisito.',
    requirements: ['mp.s.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: acceso a información protegida obviando la autenticación?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.s.2',
    title: 'Vías alternativas de acceso a los documentos',
    description:
      'Verificación de que están cerradas las vías de P-04: listado de directorios desactivado, acceso directo a ficheros no permitido, métodos HTTP no previstos deshabilitados. Y detección de accesos exitosos por esas vías. Acredita mp.s.2.1 a).',
    requirements: ['mp.s.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: vías alternativas de acceso a los documentos?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.s.2',
    title: 'Ataques de manipulación de URL y recorrido de rutas',
    description:
      'Detección de intentos de manipulación del localizador de recursos: recorrido de directorios, codificaciones anómalas, inclusión de ficheros, acceso a rutas no publicadas. Acredita mp.s.2.1 b).',
    requirements: ['mp.s.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ataques de manipulación de url y recorrido de rutas?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.s.2',
    title: 'Protección de las cookies de sesión',
    description:
      'Verificación de los atributos de P-05 en las cookies emitidas y detección de uso anómalo: misma cookie de sesión desde orígenes distintos, reutilización tras cierre de sesión, ausencia de rotación tras autenticación. Acredita mp.s.2.1 c).',
    requirements: ['mp.s.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: protección de las cookies de sesión?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.s.2',
    title: 'Ataques de inyección de código',
    description:
      'Detección de intentos de inyección en sus variantes habituales: inyección SQL, de órdenes del sistema, de plantillas, de objetos serializados, inclusión de ficheros. Acredita mp.s.2.1 d), que es la amenaza con más impacto potencial del requisito.',
    requirements: ['mp.s.2.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ataques de inyección de código?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.s.2',
    title: 'Intentos de escalado de privilegios en la aplicación',
    description:
      'Detección de accesos a funcionalidad o datos de otro nivel de privilegio: acceso a rutas administrativas por cuentas sin ese perfil, manipulación de identificadores para acceder a recursos ajenos, cambios de rol no previstos. Acredita mp.s.2.2.',
    requirements: ['mp.s.2.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: intentos de escalado de privilegios en la aplicación?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.s.2',
    title: 'Ataques de cross site scripting',
    description:
      'Detección de intentos de inyección de scripts en los parámetros de las peticiones, tanto reflejados como almacenados, y de los indicios de su ejecución en el navegador del usuario. Acredita mp.s.2.3, que el ENS menciona como requisito independiente.',
    requirements: ['mp.s.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ataques de cross site scripting?',
  },
  {
    id: 'EV-09',
    controlId: 'mp.s.2',
    title: 'Distinción entre intento y ataque exitoso',
    description:
      'Correlación de cada detección de ataque web con la respuesta del servidor y con la actividad posterior, para distinguir el intento bloqueado del ataque que surtió efecto. Es la diferencia entre un informe que dice «nos atacan» y uno que dice «el ataque funcionó».',
    requirements: ['mp.s.2.1', 'mp.s.2.2', 'mp.s.2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: distinción entre intento y ataque exitoso?',
  },
  {
    id: 'EV-10',
    controlId: 'mp.s.2',
    title: 'Vulnerabilidades del servidor y de la plataforma web',
    description:
      'Detección de vulnerabilidades conocidas en el servidor web, el motor de aplicaciones y sus componentes, y verificación de su configuración de seguridad. Complementa las auditorías de aplicación con la capa de plataforma, que las auditorías de código no cubren.',
    requirements: ['mp.s.2.r2.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: vulnerabilidades del servidor y de la plataforma web?',
  },
  {
    id: 'EV-11',
    controlId: 'mp.s.2',
    title: 'Registro y frecuencia de las auditorías de seguridad',
    description:
      'Constancia de las auditorías de P-08 con su modalidad, metodología y herramientas, y control de que se cumple la frecuencia del procedimiento de P-06. Incluye la verificación de admisibilidad de la modalidad para la categoría del sistema.',
    requirements: ['mp.s.2.r1.1', 'mp.s.2.r1.2', 'mp.s.2.r2.1', 'mp.s.2.r2.2'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: registro y frecuencia de las auditorías de seguridad?',
  },
  {
    id: 'EV-12',
    controlId: 'mp.s.2',
    title: 'Resolución efectiva de los hallazgos de auditoría (R2)',
    description:
      'Seguimiento del cierre de los hallazgos de P-09 y verificación de que los declarados resueltos ya no son detectables en producción. mp.s.2.r2.3 exige solventar las vulnerabilidades encontradas, no solo registrarlas.',
    requirements: ['mp.s.2.r2.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: resolución efectiva de los hallazgos de auditoría (r2)?',
  },
  {
    id: 'EV-13',
    controlId: 'mp.s.2',
    title: 'Protección de proxies y cachés (R3)',
    description:
      'Verificación de la configuración de los elementos de P-10 frente a sus ataques característicos: envenenamiento de caché, confusión en el tratamiento de peticiones, almacenamiento en caché de respuestas autenticadas. R3 es obligatorio en categoría ALTA.',
    requirements: ['mp.s.2.r3.1'],
    levels: ['ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: protección de proxies y cachés (r3)?',
  },
  // mp.s.3. Born DRAFT without a collector (wave C, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 112700-112799.
  {
    id: 'EV-01',
    controlId: 'mp.s.3',
    title: 'Ingesta de los registros del filtrado de navegación',
    description:
      'Recolección de los eventos del proxy o solución de filtrado de P-02: peticiones permitidas y bloqueadas, con categoría del destino, usuario, URL y motivo del bloqueo. Es la fuente de evidencia de la mayor parte del control.',
    requirements: ['mp.s.3.5', 'mp.s.3.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: ingesta de los registros del filtrado de navegación?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.s.3',
    title: 'Eficacia del filtrado por categorías',
    description:
      'Volumen de accesos bloqueados por cada categoría de P-03 y evolución en el período. Acredita que el filtrado opera efectivamente sobre las categorías declaradas y no solo está configurado, y permite detectar categorías que no producen bloqueos por estar mal aplicadas.',
    requirements: ['mp.s.3.5', 'mp.s.3.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: eficacia del filtrado por categorías?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.s.3',
    title: 'Bloqueo de descargas de código ejecutable y contenido activo',
    description:
      'Verificación de que se bloquean las descargas de ejecutables y el contenido activo conforme a P-03, que es lo que mp.s.3.6 pide prevenir de forma expresa al mencionar páginas activas y descargas de código ejecutable.',
    requirements: ['mp.s.3.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: bloqueo de descargas de código ejecutable y contenido activo?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.s.3',
    title: 'Accesos a destinos de reputación maliciosa',
    description:
      'Detección de accesos o intentos hacia destinos asociados a malware, phishing o infraestructura de mando y control, con el usuario y el puesto implicados. Un acceso exitoso a este tipo de destino exige verificación del puesto.',
    requirements: ['mp.s.3.5', 'mp.s.3.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: accesos a destinos de reputación maliciosa?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.s.3',
    title: 'Protección de la resolución de nombres',
    description:
      'Verificación de que la resolución de direcciones web se realiza solo por los resolutores autorizados en P-04 y detección de intentos de evasión: consultas a resolutores externos, resolución por canales alternativos, uso de resolución cifrada no autorizada. Acredita mp.s.3.4.',
    requirements: ['mp.s.3.4'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: protección de la resolución de nombres?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.s.3',
    title: 'Protección del puesto frente a amenazas de navegación',
    description:
      'Verificación de la configuración de seguridad del navegador gestionado y de las defensas del puesto frente a lo que llega por la web: complementos no autorizados, políticas de descarga, protección contra ransomware y spyware. Acredita mp.s.3.5 y mp.s.3.6 en el ámbito del puesto.',
    requirements: ['mp.s.3.5', 'mp.s.3.6'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: protección del puesto frente a amenazas de navegación?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.s.3',
    title: 'Política de control de cookies',
    description:
      'Verificación de la configuración de cookies conforme a P-05, orientada a evitar la contaminación entre uso personal y organizativo: perfiles separados, tratamiento de cookies de terceros, ausencia de sincronización con cuentas personales. Acredita mp.s.3.7.',
    requirements: ['mp.s.3.7'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: política de control de cookies?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.s.3',
    title: 'Registro del uso de la navegación web (R1)',
    description:
      'Registro de los elementos declarados en P-08 con la retención declarada. mp.s.3.r1.1 exige que se establezcan expresamente los elementos registrados, el período de retención y el uso previsto, de modo que la evidencia es tanto el registro como su declaración.',
    requirements: ['mp.s.3.r1.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: registro del uso de la navegación web (r1)?',
  },
  {
    id: 'EV-09',
    controlId: 'mp.s.3',
    title: 'Inspección de canales cifrados y respeto de las exclusiones (R1)',
    description:
      'Verificación de que la inspección de tráfico cifrado se aplica dentro de los límites declarados en P-09 y de que respeta los destinos de confianza excluidos. El ENS prevé expresamente la salvedad de los accesos cifrados singulares a destinos de confianza.',
    requirements: ['mp.s.3.r1.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: inspección de canales cifrados y respeto de las exclusiones (r1)?',
  },
  {
    id: 'EV-10',
    controlId: 'mp.s.3',
    title: 'Intentos de acceso a destinos de la lista negra (R1)',
    description:
      'Detección de intentos de acceso a los destinos vetados en P-10, incluidos los que no pasen por el proxy y por tanto no quedarían bloqueados por él. mp.s.3.r1.3 exige establecer la lista negra; detectar los intentos es lo que demuestra que opera.',
    requirements: ['mp.s.3.r1.3'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: intentos de acceso a destinos de la lista negra (r1)?',
  },
  {
    id: 'EV-11',
    controlId: 'mp.s.3',
    title: 'Evasión del filtrado de navegación',
    description:
      'Detección de intentos de eludir el control de navegación: uso de resolutores o canales de resolución alternativos, túneles, servicios de anonimización, navegación por puertos no estándar, conexiones directas sin pasar por el proxy.',
    requirements: ['mp.s.3.4', 'mp.s.3.5'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: evasión del filtrado de navegación?',
  },
  {
    id: 'EV-12',
    controlId: 'mp.s.3',
    title: 'Registro de normativa, concienciación y formación',
    description:
      'Constancia documental de la normativa de P-01 con su difusión, de las actividades de concienciación de P-06 y de la formación de administradores de P-07, con control de la periodicidad declarada.',
    requirements: ['mp.s.3.1', 'mp.s.3.2', 'mp.s.3.3'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: registro de normativa, concienciación y formación?',
  },
  // mp.s.4. Born DRAFT without a collector (wave C, owner decision 19/10/2026): every evidence listens only to `evidence_state`
  // and accredits no rule. The source each one needs is in `catalog/support/measurement-plan.ts`. Rules band 112800-112899.
  {
    id: 'EV-01',
    controlId: 'mp.s.4',
    title: 'Carga real frente a la capacidad dotada',
    description:
      'Medición continua de la carga de los servicios de P-01 —peticiones por segundo, conexiones concurrentes, consumo de recursos— contrastada con la carga prevista y la capacidad de P-02. Acredita la holgura que exige mp.s.4.1, que de otro modo queda como declaración de dimensionamiento.',
    requirements: ['mp.s.4.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: carga real frente a la capacidad dotada?',
  },
  {
    id: 'EV-02',
    controlId: 'mp.s.4',
    title: 'Tecnologías de prevención desplegadas y su configuración',
    description:
      'Verificación de las tecnologías de P-03 que sean comprobables desde el sistema: limitación de tasa en el proxy o servidor web, protección de la pila de red frente a inundación de conexiones, límites de conexiones concurrentes, tiempos de espera. Acredita mp.s.4.2 en su parte local.',
    requirements: ['mp.s.4.2'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: tecnologías de prevención desplegadas y su configuración?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.s.4',
    title: 'Detección temprana de saturación del servicio',
    description:
      'Identificación de patrones compatibles con denegación de servicio según los umbrales de P-04 y la línea base de P-07: tasa de peticiones anómala, agotamiento de conexiones, degradación de tiempos de respuesta, incremento de la tasa de error. Es la aportación principal de Wazuh a este control.',
    requirements: ['mp.s.4.r1.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: detección temprana de saturación del servicio?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.s.4',
    title: 'Medición del impacto del ataque en la disponibilidad',
    description:
      'Cuantificación del efecto de cada episodio sobre los servicios de P-01: tiempo de indisponibilidad total o parcial, tasa de error durante el ataque, grado de degradación del tiempo de respuesta. Es la evidencia que convierte un incidente en un dato.',
    requirements: ['mp.s.4.1', 'mp.s.4.2', 'mp.s.4.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: medición del impacto del ataque en la disponibilidad?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.s.4',
    title: 'Caracterización del ataque para la comunicación al proveedor',
    description:
      'Recopilación de los datos técnicos del episodio que el proveedor necesita para mitigar: rangos de origen, protocolos y puertos implicados, vector empleado, volumen y distribución temporal. Da soporte material a la comunicación que exige mp.s.4.r1.2.',
    requirements: ['mp.s.4.r1.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: caracterización del ataque para la comunicación al proveedor?',
  },
  {
    id: 'EV-06',
    controlId: 'mp.s.4',
    title: 'Activación del procedimiento de reacción',
    description:
      'Verificación de que cada episodio detectado activó el procedimiento de P-05 y, cuando procedía, la comunicación al proveedor de P-06, con los tiempos de cada paso. mp.s.4.r1.2 exige procedimientos de reacción, lo que implica poder acreditar su aplicación.',
    requirements: ['mp.s.4.r1.2'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: activación del procedimiento de reacción?',
  },
  {
    id: 'EV-07',
    controlId: 'mp.s.4',
    title: 'Medidas de contención automática aplicadas',
    description:
      'Acciones automáticas ejecutadas ante la detección: bloqueo de rangos de origen, activación de limitación de tasa más estricta, desvío de tráfico. Da soporte al tratamiento que exige mp.s.4.r1.1 y acorta el tiempo de reacción.',
    requirements: ['mp.s.4.r1.1'],
    levels: ['ALTO'],
    category: 'MONITORING',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: medidas de contención automática aplicadas?',
  },
  {
    id: 'EV-08',
    controlId: 'mp.s.4',
    title: 'Tráfico saliente anómalo: ataques desde las propias instalaciones (R2)',
    description:
      'Detección de volumen de tráfico saliente muy superior a la línea base, conexiones masivas desde equipos propios hacia un mismo destino externo, o patrones compatibles con participación en una red de bots. Cubre la primera parte de R2.',
    requirements: ['mp.s.4.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: tráfico saliente anómalo: ataques desde las propias instalaciones (r2)?',
  },
  {
    id: 'EV-09',
    controlId: 'mp.s.4',
    title: 'Servicios propios usados como amplificadores (R2)',
    description:
      'Detección de servicios propios expuestos que pueden emplearse para amplificar ataques contra terceros: resolución recursiva abierta, servicios de sincronización horaria respondiendo a consultas externas, servicios de descubrimiento accesibles desde internet.',
    requirements: ['mp.s.4.r2.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'SCA', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: servicios propios usados como amplificadores (r2)?',
  },
  {
    id: 'EV-10',
    controlId: 'mp.s.4',
    title: 'Histórico de episodios y evolución',
    description:
      'Registro de todos los episodios del período con su fecha, duración, vector, impacto y respuesta aplicada, con la evolución entre períodos. Permite valorar si la protección mejora y si el dimensionamiento de P-02 sigue siendo adecuado.',
    requirements: ['mp.s.4.1', 'mp.s.4.2', 'mp.s.4.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state'],
    relatedRules: [],
    auditQuestion:
      '¿Se acredita: histórico de episodios y evolución?',
  },
];
