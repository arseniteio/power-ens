// Identidad del plugin y nombres que comparten el navegador y el servidor.

export const ENSFACIL_PLUGIN_ID = 'ensfacil';
export const ENSFACIL_APP_TITLE = 'ENSFácil';
export const ENSFACIL_APP_ORDER = 401;

// La sección «Security operations» del menú de Wazuh: mismo id, etiqueta y
// orden, para salir junto a sus módulos. Es un identificador, no código de
// Wazuh; sin Wazuh instalado, la sección se crea igual.
export const ENSFACIL_APP_CATEGORY = {
  id: 'wz-category-security-operations',
  label: 'Security operations',
  order: 400,
  euiIconType: 'securityApp',
};

export const ENSFACIL_API_BASE = '/api/ensfacil';
export const ENSFACIL_CONFIGURATION_PATH = `${ENSFACIL_API_BASE}/configuration`;

export const ENS_ALERTS_INDEX = 'wazuh-alerts-*';
export const ENS_MONITORING_INDEX = 'wazuh-monitoring-*';
export const ENS_CONFIGURATION_INDEX = 'wazuh-ens-configuration';

// Quién puede guardar la configuración y ver su historial (decisión del
// 07/10/2026): el rol propio o el superusuario del plugin de seguridad.
export const ENSFACIL_ADMIN_ROLES = ['ensfacil_admin', 'all_access'];
