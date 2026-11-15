import { ENSGlobalConfiguration } from '../types';
import catalogDefault from '../../catalog/default-configuration.json';

export const defaultENSGlobalConfiguration: ENSGlobalConfiguration = {
  clientName: '',
  organization: '',
  ensLevel: catalogDefault.ensLevel as ENSGlobalConfiguration['ensLevel'],
  ensVersion: 'RD 311/2022',
  scope: '',
  evaluationPeriod: 'Últimos 30 días',
  timezone: 'Europe/Madrid',
  reportLanguage: 'es',
  activePolicy: 'Política ENS principal',
};
