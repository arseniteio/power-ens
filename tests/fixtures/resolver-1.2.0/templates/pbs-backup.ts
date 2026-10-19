import type { ENSConfigurationTemplate } from './types';

// Añadido «Copias con PBS» (mp.info.6 con Proxmox Backup Server). Se suma a la
// plantilla de la plataforma. Se propone a los agentes que emiten hechos de
// mp.info.6 con `data.origen = pbs`. No se combina con «Zimbra NE».
export const pbsBackupTemplate: ENSConfigurationTemplate = {
  id: 'pbs-backup',
  label: 'Copias con PBS',
  description:
    'mp.info.6 con Proxmox Backup Server: herramienta pbs, la clave de cifrado de PBS, el fichero y el testigo de la prueba de restauración, root como cuenta de las copias y /backup como directorio local.',
  kind: 'addon',
  systemTypes: ['linux'],
  incompatibleWith: ['zimbra-ne-backup'],
  sources: [
    'ejemplos del bloque semilla de mp.info.6',
    'mp.info.6-proxmox-backup-runbook (testigo /etc/ensfacil/mpinfo6-witness.txt)',
  ],
  values: {
    'mp.info.6': {
      'P-06': '/backup',
      'P-07': ['root'],
      'P-10': 'pbs',
      'P-11': '/root/.config/proxmox-backup/encryption-key.json',
      'P-12': 'root.pxar',
      'P-13': '/etc/ensfacil/mpinfo6-witness.txt',
    },
  },
};
