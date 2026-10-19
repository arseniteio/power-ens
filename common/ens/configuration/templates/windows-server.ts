import type { ENSPlatformSource } from './types';

// Windows Server. SOLO op.acc.1, op.acc.2, op.acc.3 y op.acc.4 tienen recolector
// para Windows (`op.acc.{1..4}-windows`); el resto de controles no se mide en
// esta plataforma, que no es lo mismo que no cumplir.
//
// Fija únicamente lo que se puede fundamentar para Windows:
//   - el grupo privilegiado local `Administrators` (op.acc.1 P-11, op.acc.4 P-06);
// y deja sin valor, a propósito:
//   - op.acc.1 P-01: depende de si el servidor está aislado («Local») o en un
//     dominio («Active Directory»); lo decide el responsable en el agente;
//   - op.acc.1 P-10 y op.acc.2 P-07, P-10 y P-11: UID, umask, SUID y
//     world-writable son de Linux. El recolector de op.acc.2 para Windows usa
//     sus SID (`grupos_privilegiados_sids` de `opacc2.config.template.json`);
//   - op.acc.4 P-04: el canal (WinRM, puerto 5985) es de la plataforma, pero el
//     origen permitido es una decisión de cada organización.
export const windowsServerTemplate: ENSPlatformSource = {
  id: 'windows-server',
  label: 'Windows',
  description: 'Servidor Windows: solo lo que se puede fundamentar para la plataforma; lo que depende del dominio o de la organización queda sin valor.',
  kind: 'base',
  systemTypes: ['windows'],
  onlyControls: ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4'],
  sources: [
    'op.acc.4-windows/etc/README.md (grupo local Administrators)',
    'op.acc.2-windows/etc/opacc2.config.template.json',
  ],
  values: {
    'op.acc.1': {
      'P-11': ['Administrators'],
    },
    'op.acc.4': {
      'P-06': ['Administrators'],
    },
  },
};
