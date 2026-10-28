import type { ENSPlatformSource } from './types';

// Standard Linux (Ubuntu) server: the default of agents whose inventory `os.platform` is of the Linux family.

const UBUNTU_SYSTEM_ACCOUNTS = [
  '_apt', 'backup', 'bin', 'daemon', 'dhcpcd', 'fwupd-refresh', 'games', 'irc',
  'landscape', 'list', 'lp', 'mail', 'man', 'messagebus', 'news', 'nobody',
  'polkitd', 'pollinate', 'proxy', 'sshd', 'sync', 'sys', 'syslog',
  'systemd-network', 'systemd-resolve', 'systemd-timesync', 'tcpdump', 'tss',
  'uucp', 'uuidd', 'wazuh', 'www-data', 'root',
];

// SUID binaries observed on Ubuntu 22.04 and 24.04 with the Wazuh agent and the Power ENS collectors installed.
const UBUNTU_SUID = [
  '/usr/bin/at', '/usr/bin/chage', '/usr/bin/chfn', '/usr/bin/chsh',
  '/usr/bin/crontab', '/usr/bin/expiry', '/usr/bin/fusermount3',
  '/usr/bin/gpasswd', '/usr/bin/mount', '/usr/bin/newgrp', '/usr/bin/passwd',
  '/usr/bin/ssh-agent', '/usr/bin/su', '/usr/bin/sudo', '/usr/bin/umount',
  '/usr/lib/dbus-1.0/dbus-daemon-launch-helper',
  '/usr/lib/openssh/ssh-keysign', '/usr/lib/polkit-1/polkit-agent-helper-1',
  '/usr/lib/x86_64-linux-gnu/utempter/utempter',
  '/usr/sbin/pam_extrausers_chkpwd', '/usr/sbin/unix_chkpwd', '/usr/bin/pkexec',
  '/usr/libexec/camel-lock-helper-1.2', '/usr/libexec/polkit-agent-helper-1',
  '/usr/lib/xorg/Xorg.wrap', '/usr/sbin/pppd',
];

// `OPACC2_RUTAS_CRITICAS` from `op.acc.2-access-requirements/etc/opacc2.env.example`.
const LINUX_CRITICAL_PATHS = [
  '/etc/passwd', '/etc/shadow', '/etc/group', '/etc/gshadow', '/etc/sudoers',
  '/etc/sudoers.d', '/etc/ssh/sshd_config', '/etc/crontab', '/etc/cron.d',
  '/etc/login.defs',
];

export const linuxUbuntuTemplate: ENSPlatformSource = {
  id: 'linux-ubuntu',
  label: 'Linux',
  description: 'Ubuntu 22.04 y 24.04 con el agente de Wazuh y el agente OSCompliance. La lista de SUID es la de 22.04 y 24.04 juntas.',
  kind: 'base',
  systemTypes: ['linux'],
  sources: [
    'op.acc.2-access-requirements/etc/opacc2.env.example (rutas críticas, grupos privilegiados, excepciones world-writable)',
    'ejemplos de los bloques semilla de config/',
    'valores reales de un laboratorio con Ubuntu 22.04 y 24.04',
  ],
  values: {
    'op.acc.1': {
      'P-01': 'Local',
      'P-03': UBUNTU_SYSTEM_ACCOUNTS,
      'P-10': 1000,
      'P-11': ['sudo', 'wheel', 'admin'],
    },
    'op.acc.2': {
      'P-02': LINUX_CRITICAL_PATHS,
      'P-10': UBUNTU_SUID,
      'P-11': ['/tmp', '/var/tmp', '/dev/shm'],
      'P-12': ['sudo', 'wheel', 'admin', 'adm', 'root'],
    },
    'op.acc.3': {
      'P-03': [
        'desarrollo | /usr/bin/git',
        'operacion | /usr/bin/systemctl',
        'operacion | /usr/bin/crontab',
        'autorizacion | /usr/sbin/visudo',
        'autorizacion | /usr/sbin/usermod',
        'autorizacion | /usr/sbin/useradd',
        'configuracion | /usr/bin/nano | /usr/bin/vim | /usr/bin/tee',
        'mantenimiento | /usr/bin/apt | /usr/bin/dpkg | /usr/bin/apt-get',
        'auditoria | /usr/sbin/ausearch | /usr/sbin/auditctl | /var/log/audit',
      ],
    },
    'op.acc.4': {
      'P-06': ['root', 'sudo', 'adm'],
    },
    'op.acc.6': {
      'P-03': ['local'],
      'P-07': ['ssh | si | Responsable de Seguridad | si'],
      'P-08': ['sudo'],
      'P-11': ['sshd:version_software'],
    },
  },
};
