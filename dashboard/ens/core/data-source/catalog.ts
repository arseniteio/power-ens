import { ENSDataSourceDefinition } from './types';

export const ENSDataSourceCatalog: ENSDataSourceDefinition[] = [
  {
    id: 'wazuh-alerts',
    name: 'Wazuh Alerts',
    type: 'WAZUH_ALERT',
    description: 'Alertas generadas por reglas Wazuh, decoders y eventos normalizados.',
    enabled: true,
  },
  {
    id: 'sca',
    name: 'Security Configuration Assessment',
    type: 'SCA',
    description: 'Resultados SCA utilizados como fuente de cumplimiento ENS.',
    enabled: true,
  },
  {
    id: 'fim',
    name: 'File Integrity Monitoring',
    type: 'FIM',
    description: 'Eventos FIM usados para evidenciar cambios, accesos o integridad.',
    enabled: true,
  },
  {
    id: 'local-json',
    name: 'Local JSON',
    type: 'LOCAL_JSON',
    description: 'Eventos JSON generados por scripts ENSFácil en agentes.',
    enabled: true,
  },
];
