import type { ENSPlatformSource } from './types';

// An mp.info.6 alternative for Zimbra 10 Network with zmbackup only, proposed by facts with `data.origen =
// zimbra-ne`.
// P-11, P-12 and P-13 are PBS-only and stay unset: the zmbackup restore test uses a witness account declared in
// the machine `.env`.
export const zimbraNeBackupTemplate: ENSPlatformSource = {
  id: 'zimbra-ne-backup',
  label: 'Copias Zimbra NE',
  description: 'Copias con zmbackup de Zimbra 10 Network Edition. No se combina con PBS.',
  kind: 'addon',
  systemTypes: ['linux', 'zimbra-ldap'],
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
