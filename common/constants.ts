// Plugin identity and names shared by browser and server.

export const ENSFACIL_PLUGIN_ID = 'ensfacil';
export const ENSFACIL_APP_TITLE = 'ENSFácil';
export const ENSFACIL_APP_ORDER = 401;

// The "Security operations" section of the Wazuh menu: same id, label and order, to appear beside its modules. An identifier, not Wazuh code; the section is created even without Wazuh installed.
export const ENSFACIL_APP_CATEGORY = {
  id: 'wz-category-security-operations',
  label: 'Security operations',
  order: 400,
  euiIconType: 'securityApp',
};

export const ENSFACIL_API_BASE = '/api/ensfacil';
export const ENSFACIL_CONFIGURATION_PATH = `${ENSFACIL_API_BASE}/configuration`;
// The plugin server does the evaluation (since 1.2.0): the browser receives the result and downloads no facts.
export const ENSFACIL_EVALUATION_PATH = `${ENSFACIL_API_BASE}/evaluation`;
// Maturity records of each control (save) and its daily snapshots (read), since 1.4.0.
export const ENSFACIL_MATURITY_PATH = `${ENSFACIL_API_BASE}/maturity`;
// Annual report of art. 32 (read, export) and its freeze, since 1.4.0.
export const ENSFACIL_ANNUAL_REPORT_PATH = `${ENSFACIL_API_BASE}/annual-report`;

// Version written in the header of each annual report; `tests/plugin-manifest.test.ts` keeps it equal to the manifest.
export const ENSFACIL_PLUGIN_VERSION = '1.4.0';

export const ENS_ALERTS_INDEX = 'wazuh-alerts-*';
export const ENS_MONITORING_INDEX = 'wazuh-monitoring-*';
export const ENS_CONFIGURATION_INDEX = 'wazuh-ens-configuration';
// One document per control and day (status, score, coverage, accredited and assessed maturity).
export const ENS_SNAPSHOTS_INDEX = 'wazuh-ens-snapshots';

// Who can save the configuration and see its history: the plugin's own role or the security plugin's superuser.
export const ENSFACIL_ADMIN_ROLES = ['ensfacil_admin', 'all_access'];
