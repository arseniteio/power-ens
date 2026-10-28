import { ENSConfigurationVersion } from '../types';
import { defaultENSGlobalConfiguration } from './global-configuration';
import { ENSConfigurationRegistry } from '../registry';

export const defaultENSConfigurationTemplate: ENSConfigurationVersion = {
  id: 'power-ens-default-configuration',
  clientId: 'default',
  version: '1.0.0',
  status: 'DRAFT',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: 'system',
  updatedBy: 'system',
  changeReason: 'Configuración inicial Power ENS',
  global: defaultENSGlobalConfiguration,
  scope: {
    mode: 'global',
    agentIds: [],
    groupIds: [],
  },
  controls: ENSConfigurationRegistry,
  // New documents are born 1.3.0: no 1.2.0 templates to convert.
  templates: [],
  // And with the organisation data block: nothing to migrate.
  organizationData: { values: {} },
  auditTrail: [
    {
      action: 'CREATED',
      user: 'system',
      date: new Date().toISOString(),
      summary: 'Configuración inicial creada.',
    },
  ],
};
