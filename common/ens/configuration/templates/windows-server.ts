import type { ENSPlatformSource } from './types';

// Windows Server. ONLY op.acc.1-4 have a Windows collector (`op.acc.{1..4}-windows`); the rest is not measured
// on this platform.
// Sets only what can be grounded: the local privileged group `Administrators` (op.acc.1 P-11, op.acc.4 P-06).
// Left unset on purpose:
//   - op.acc.1 P-01: isolated ("Local") or domain ("Active Directory"), decided per agent;
//   - op.acc.1 P-10, op.acc.2 P-07, P-10, P-11: UID, umask, SUID and world-writable are Linux-only (the Windows
// collector uses SIDs, `grupos_privilegiados_sids`);
//   - op.acc.4 P-04: the channel (WinRM 5985) is platform-defined, the allowed origin is an organization decision.
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
