import type { ENSConfigurationTemplate } from './types';

// Añadido «Zimbra NE con zmbackup» (mp.info.6 en un servidor de buzones o MTA
// de Zimbra 10 Network Edition). Solo vale para Zimbra 10 Network con zmbackup
// y no se combina con PBS. Se propone a los agentes que emiten hechos de
// mp.info.6 con `data.origen = zimbra-ne`.
//
// P-11, P-12 y P-13 son de PBS y se quedan sin valor: la prueba de restauración
// de zmbackup usa una cuenta testigo que se declara en el `.env` de la máquina.
export const zimbraNeBackupTemplate: ENSConfigurationTemplate = {
  id: 'zimbra-ne-backup',
  label: 'Copias Zimbra NE',
  description:
    'mp.info.6 con zmbackup de Zimbra 10 Network Edition: herramienta zimbra-ne, la cuenta zimbra y /opt/zimbra/backup como destino.',
  kind: 'addon',
  systemTypes: ['linux', 'zimbra-ldap'],
  incompatibleWith: ['pbs-backup'],
  sources: [
    'mp.info.6-zimbra/etc/mpinfo6zimbra.env.example (MPINFO6ZIMBRA_USUARIO, MPINFO6ZIMBRA_DESTINO)',
    'opciones del bloque semilla de mp.info.6 (herramienta zimbra-ne)',
  ],
  values: {
    'mp.info.6': {
      'P-06': '/opt/zimbra/backup',
      'P-07': ['zimbra'],
      'P-10': 'zimbra-ne',
    },
  },
};
