// Plugin identity and names shared by browser and server.

export const POWER_ENS_PLUGIN_ID = 'powerEns';
export const POWER_ENS_APP_TITLE = 'Power ENS';
export const POWER_ENS_APP_ORDER = 401;

// The "Security operations" section of the Wazuh menu: same id, label and order, to appear beside its modules. An identifier, not Wazuh code; the section is created even without Wazuh installed.
export const POWER_ENS_APP_CATEGORY = {
  id: 'wz-category-security-operations',
  label: 'Security operations',
  order: 400,
  euiIconType: 'securityApp',
};

export const POWER_ENS_API_BASE = '/api/powerEns';
export const POWER_ENS_CONFIGURATION_PATH = `${POWER_ENS_API_BASE}/configuration`;
// The plugin server does the evaluation (since 1.2.0): the browser receives the result and downloads no facts.
export const POWER_ENS_EVALUATION_PATH = `${POWER_ENS_API_BASE}/evaluation`;
// Maturity records of each control (save) and its daily snapshots (read), since 1.4.0.
export const POWER_ENS_MATURITY_PATH = `${POWER_ENS_API_BASE}/maturity`;
// Annual report of art. 32 (read, export) and its freeze, since 1.4.0.
export const POWER_ENS_ANNUAL_REPORT_PATH = `${POWER_ENS_API_BASE}/annual-report`;

// Version written in the header of each annual report; `tests/plugin-manifest.test.ts` keeps it equal to the manifest.
export const POWER_ENS_PLUGIN_VERSION = '1.4.0';

export const ENS_ALERTS_INDEX = 'wazuh-alerts-*';
export const ENS_MONITORING_INDEX = 'wazuh-monitoring-*';
export const ENS_CONFIGURATION_INDEX = 'wazuh-ens-configuration';
// One document per control and day (status, score, coverage, accredited and assessed maturity).
export const ENS_SNAPSHOTS_INDEX = 'wazuh-ens-snapshots';
// Written by the OSCompliance engine: one verdict per evidence and pass, per requirement and day, per control and day.
export const ENS_VERDICTS_INDEX = 'oscompliance-verdicts';

// Who can save the configuration and see its history: the plugin's own role or the security plugin's superuser.
export const POWER_ENS_ADMIN_ROLES = ['power_ens_admin', 'all_access'];
