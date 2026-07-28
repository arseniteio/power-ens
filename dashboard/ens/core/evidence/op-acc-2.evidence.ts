import { ENSEvidenceDefinition } from './types';

export const opAcc2Evidences: ENSEvidenceDefinition[] = [
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
    relatedRules: ['ENS-OPACC2-WORLD-WRITABLE', 'ENS-OPACC2-UMASK'],
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
    relatedRules: ['ENS-OPACC2-FIM-SO'],
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
    relatedRules: ['ENS-OPACC2-ACCESS-DENIED'],
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
    relatedRules: ['ENS-OPACC2-ACL-DEVIATION'],
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
    relatedRules: ['ENS-OPACC2-PRIV-INDIVIDUAL'],
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
    relatedRules: ['ENS-OPACC2-ACCESS-TYPE'],
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
    relatedRules: ['ENS-OPACC2-ROOTCHECK'],
    auditQuestion:
      '¿Se detectan configuraciones del SO que debilitan el control de acceso (SUID/SGID, ficheros sin propietario)?',
  },
];
