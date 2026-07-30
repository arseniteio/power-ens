import { ENSEvidenceDefinition } from './types';

// `relatedRules` es el eslabón «evidencia → rule ID» de la cadena de
// trazabilidad. Contiene los identificadores numéricos REALES declarados en
// agent/rules/ensfacil_<control>_*.xml, derivados del `evidencia=` de cada
// `<info type="text">`. Antes había identificadores simbólicos
// (`ENS-OPACC1-INVENTORY`) que no correspondían a ninguna regla: la UI los
// mostraba al auditor como si fueran trazables y la cadena moría ahí.
//
// Criterio de inclusión:
//   - se incluyen las reglas que acreditan la evidencia y generan alerta;
//   - se excluyen las reglas `level="0"` (106600/106800/106900 y 106652), que
//     nunca producen alerta y por tanto no llevan a ningún evento crudo;
//   - se excluyen las reglas inertes para el plugin (106605 y 106923), que
//     re-etiquetan alertas syscheck sin campo `ensfacil` y nunca llegan aquí
//     (ver el comentario en el propio XML).
//
// Las reglas genéricas de `evidence_state` (106700-106703 / 106950-106953) no
// se listan: engine.ts añade el ruleId del evento que resuelve la evidencia,
// así que aparecen solas cuando son el origen real del estado.
export const ENSEvidenceCatalog: ENSEvidenceDefinition[] = [
  {
    id: 'EV-01',
    controlId: 'mp.info.6',
    title: 'Última copia realizada correctamente',
    description: 'Existe evidencia de una copia de seguridad finalizada correctamente.',
    requirements: ['mp.info.6.1'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'EXECUTION',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: ['backup_success', 'backup_ok', 'backup_error'],
    relatedRules: ['106650', '106601'],
    auditQuestion: '¿Existe evidencia reciente de que la copia de seguridad se ha realizado correctamente?',
    qualityRequirements: {
      requiredFields: [
        'job_id',
        'start_time',
        'end_time',
        'status',
        'bytes_written',
      ],
      requiredFieldsWhenStatus: ['CUMPLE'],
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-02',
    controlId: 'mp.info.6',
    title: 'Copia dentro del intervalo permitido',
    description: 'La copia se ha realizado dentro de la frecuencia definida por el cliente.',
    requirements: ['mp.info.6.1', 'mp.info.6.2.a'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state','backup_success', 'backup_ok', 'backup_missing'],
    relatedRules: ['106601', '106603'],
    auditQuestion: '¿La última copia se encuentra dentro del intervalo máximo definido por la organización?',
  },
  {
    id: 'EV-03',
    controlId: 'mp.info.6',
    title: 'Retención de copias configurada',
    description: 'Existe evidencia de política de retención de copias.',
    requirements: ['mp.info.6.2.b', 'mp.info.6.2.d'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'CONFIGURATION',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API', 'SCA'],
    expectedEventTypes: ['evidence_state','control_state','retention_configured','backup_modified','backup_deleted','backup_ransomware'],
    relatedRules: ['106604', '106609', '106660', '106661'],
    auditQuestion: '¿Existe una política de retención configurada y verificable para las copias de seguridad?',
  },
  {
    id: 'EV-04',
    controlId: 'mp.info.6',
    title: 'Acceso autorizado al repositorio',
    description: 'Se controla el acceso de usuarios y procesos autorizados al repositorio de copias.',
    requirements: ['mp.info.6.2.d'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'ACCESS_CONTROL',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON'],
    expectedEventTypes: ['evidence_state','control_state','authorized_access','unauthorized_access'],
    relatedRules: ['106604'],
    auditQuestion: '¿El acceso al repositorio de copias está limitado a usuarios y procesos autorizados?',
  },
  {
    id: 'EV-05',
    controlId: 'mp.info.6',
    title: 'Prueba de restauración correcta',
    description: 'Existe evidencia de restauración correcta y verificación de integridad.',
    requirements: ['mp.info.6.r1.1'],
    levels: ['MEDIO', 'ALTO'],
    category: 'RECOVERY',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: [
      'restore_ok',
      'restore_success',
      'restore_missing',
      'restore_error',
    ],
    relatedRules: ['106651', '106606', '106607'],
    auditQuestion: '¿Existe evidencia de una prueba de restauración correcta dentro del periodo definido?',
    qualityRequirements: {
      requiredFields: [
        'job_id',
        'restored_path',
        'status',
        'md5',
      ],
      requiredFieldsWhenStatus: ['CUMPLE'],
      fieldPatterns: {
        md5: '^[a-fA-F0-9]{32}$',
      },
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-06',
    controlId: 'mp.info.6',
    title: 'Repositorio alternativo operativo',
    description: 'Existe evidencia de copia en ubicación alternativa cuando aplica.',
    requirements: ['mp.info.6.r2.1'],
    levels: ['ALTO'],
    category: 'OFFSITE',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'FIM', 'LOCAL_JSON', 'SCRIPT', 'API'],
    expectedEventTypes: ['evidence_state','control_state','offsite_success','offsite_missing','offsite_error'],
    relatedRules: ['106662', '106663'],
    auditQuestion: '¿Existe una copia en ubicación alternativa operativa cuando el nivel ENS lo exige?',
    qualityRequirements: {
      rejectSynthetic: true,
    },
  },
  {
    id: 'EV-07',
    controlId: 'mp.info.6',
    title: 'Logs correctamente interpretados',
    description: 'Los logs de backup se interpretan correctamente por Wazuh/ENSFácil.',
    requirements: ['mp.info.6.1', 'mp.info.6.2.b', 'mp.info.6.2.c'],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'TRACEABILITY',
    criticality: 'MEDIUM',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
    expectedEventTypes: ['evidence_state','decoder_ok','backup_warning','backup_error','backup_timeout','backup_disk_full','backup_network_error',],
    relatedRules: ['106690', '106602', '106609'],
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
    relatedRules: ['106810', '106811', '106809', '106822', '106835'],
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
    relatedRules: ['106812', '106813', '106814', '106837', '106838'],
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
    expectedEventTypes: ['evidence_state', 'generic_account_login', 'auth_success'],
    relatedRules: ['106801', '106802', '106824', '106827', '106828'],
    auditQuestion:
      '¿Se garantiza que no se utilizan cuentas genéricas o compartidas para el acceso al sistema?',
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
    relatedRules: ['106820', '106841', '106842', '106843', '106844', '106845', '106846', '106847'],
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
      'service_account_interactive',
      'interactive_login',
    ],
    relatedRules: [
      '106805',
      '106857',
      '106858',
      '106859',
      '106864',
      '106865',
      '106866',
      '106867',
      '106868',
    ],
    auditQuestion:
      '¿Se impide que las cuentas de servicio se utilicen para accesos interactivos?',
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
    relatedRules: ['106823', '106848', '106849', '106854', '106855'],
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
      'authorized_list_check',
      'unauthorized_user',
    ],
    relatedRules: ['106829', '106830', '106831', '106832', '106833', '106836', '106839', '106840'],
    auditQuestion:
      '¿Existe una lista actualizada de usuarios autorizados y todas las cuentas activas figuran en ella?',
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
    relatedRules: ['106803', '106804', '106818', '106821', '106834', '106856'],
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
    relatedRules: ['106901', '106902', '106903', '106904'],
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
    relatedRules: ['106930', '106931', '106932'],
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
    relatedRules: ['106925', '106926', '106927'],
    auditQuestion:
      '¿Se detectan configuraciones del SO que debilitan el control de acceso (SUID/SGID, ficheros sin propietario)?',
  },

];
