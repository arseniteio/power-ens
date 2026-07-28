import { ENSEvidenceDefinition } from './types';

export const opAcc1Evidences: ENSEvidenceDefinition[] = [
  {
    id: 'EV-01',
    controlId: 'op.acc.1',
    title: 'Inventario de cuentas activas',
    description:
      'Existe un inventario de las cuentas de usuario activas en los sistemas monitorizados que permite verificar la unicidad del identificador.',
    requirements: [
      'op.acc.1.3',
      'op.acc.1.4',
      'op.acc.1.5',
      'op.acc.1.r1.1',
      'op.acc.1.r1.2',
    ],
    levels: ['BAJO', 'MEDIO', 'ALTO'],
    category: 'MONITORING',
    criticality: 'HIGH',
    sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT', 'API', 'SCA'],
    expectedEventTypes: ['evidence_state', 'account_inventory', 'account_active'],
    relatedRules: ['ENS-OPACC1-INVENTORY'],
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
    relatedRules: ['ENS-OPACC1-IDENTITY-FIM'],
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
    relatedRules: ['ENS-OPACC1-GENERIC-ACCOUNT'],
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
    relatedRules: ['ENS-OPACC1-DISABLE-DELAY'],
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
    relatedRules: ['ENS-OPACC1-SERVICE-INTERACTIVE'],
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
    relatedRules: ['ENS-OPACC1-MULTI-ROLE'],
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
    relatedRules: ['ENS-OPACC1-UNAUTHORIZED-USER'],
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
    relatedRules: ['ENS-OPACC1-RETENTION'],
    auditQuestion:
      '¿Se conservan las cuentas deshabilitadas durante el periodo de retención antes de eliminarlas?',
  },
];
