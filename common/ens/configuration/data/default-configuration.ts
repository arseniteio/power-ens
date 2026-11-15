import { ENSConfigurationVersion } from '../types';
import { defaultENSGlobalConfiguration } from './global-configuration';
import { ENSConfigurationRegistry } from '../registry';
import catalogDefault from '../../catalog/default-configuration.json';

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
    mode: catalogDefault.scope.mode as ENSConfigurationVersion['scope']['mode'],
    agentIds: [],
    groupIds: [...catalogDefault.scope.groupIds],
  },
  controls: ENSConfigurationRegistry,
  templates: [],
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
