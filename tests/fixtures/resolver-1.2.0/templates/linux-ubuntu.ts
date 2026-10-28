import type { ENSConfigurationTemplate } from './types';

// Servidor Linux estándar (Ubuntu). Se propone a los agentes con `os.platform`
// de la familia Linux y sin hechos del recolector LDAP.

const CUENTAS_DE_SISTEMA_UBUNTU = [
  '_apt', 'backup', 'bin', 'daemon', 'dhcpcd', 'fwupd-refresh', 'games', 'irc',
  'landscape', 'list', 'lp', 'mail', 'man', 'messagebus', 'news', 'nobody',
  'polkitd', 'pollinate', 'proxy', 'sshd', 'sync', 'sys', 'syslog',
  'systemd-network', 'systemd-resolve', 'systemd-timesync', 'tcpdump', 'tss',
  'uucp', 'uuidd', 'wazuh', 'www-data', 'root',
];

// Los binarios SUID observados en Ubuntu 22.04 y 24.04 con el agente de Wazuh y
// los recolectores de Power ENS instalados.
const SUID_UBUNTU = [
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

// `OPACC2_RUTAS_CRITICAS` de `op.acc.2-access-requirements/etc/opacc2.env.example`.
export const RUTAS_CRITICAS_LINUX = [
  '/etc/passwd', '/etc/shadow', '/etc/group', '/etc/gshadow', '/etc/sudoers',
  '/etc/sudoers.d', '/etc/ssh/sshd_config', '/etc/crontab', '/etc/cron.d',
  '/etc/login.defs',
];

export const RUTAS_CONFIGURACION_SEGURIDAD_LINUX = [
  '/etc/ssh', '/etc/pam.d', '/etc/security', '/etc/login.defs', '/etc/sudoers',
  '/etc/sudoers.d', '/etc/audit', '/var/ossec/etc/ossec.conf',
  '/etc/sysctl.conf', '/etc/sysctl.d', '/etc/apparmor', '/etc/apparmor.d',
  '/etc/nftables.conf', '/etc/ufw', '/etc/iptables',
];

export const EVENTOS_AUDITABLES_LINUX = [
  'autenticación | sshd, sudo, auditd | 3',
  'cambios de configuración | auditd | 5',
];

export const CAMPOS_REGISTRO_AUDITD = 'auditd | auid | msg=audit(...) | exe, name | type | success, res';

export const linuxUbuntuTemplate: ENSConfigurationTemplate = {
  id: 'linux-ubuntu',
  label: 'Linux Ubuntu',
  description:
    'Servidor Ubuntu (22.04 o 24.04) con el agente de Wazuh y los recolectores de Power ENS: cuentas y grupos del sistema, rutas críticas, SUID, auditd, ClamAV y SSH. La lista de SUID es la de 22.04 y 24.04 juntas: en una 22.04 autoriza también binarios que solo trae la 24.04, y se ajusta con un valor propio si hace falta.',
  kind: 'base',
  systemTypes: ['linux'],
  sources: [
    'op.acc.2-access-requirements/etc/opacc2.env.example (rutas críticas, grupos privilegiados, excepciones world-writable)',
    'ejemplos de los bloques semilla de config/',
    'valores reales de un laboratorio con Ubuntu 22.04 y 24.04, sin lo que es de Zimbra, de Windows o de esa instalación',
  ],
  values: {
    'op.acc.1': {
      'P-01': 'Local',
      'P-03': CUENTAS_DE_SISTEMA_UBUNTU,
      'P-10': 1000,
      'P-11': ['sudo', 'wheel', 'admin'],
    },
    'op.acc.2': {
      'P-02': RUTAS_CRITICAS_LINUX,
      'P-10': SUID_UBUNTU,
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
    'op.exp.2': {
      'P-03': [
        'ubuntu | imagen cloud de Ubuntu',
        'guest | cuenta de invitado',
        'user | cuenta genérica de pruebas',
        'test | cuenta de pruebas',
        'demo | cuenta de demostración',
      ],
    },
    'op.exp.3': {
      'P-01': [
        'wazuh-agent', 'jq', 'auditd', 'audispd-plugins', 'curl',
        'libpam-pwquality', 'chrony', 'clamav', 'clamav-daemon',
        'clamav-freshclam', 'clamdscan',
      ],
      'P-04': RUTAS_CONFIGURACION_SEGURIDAD_LINUX,
    },
    'op.exp.4': {
      'P-03': [
        'ubuntu | Ubuntu Security Notices y Vulnerability Detector | RSS',
        'canonical | Snap Store y Ubuntu Security Notices | RSS',
        'wazuh | Wazuh security advisories | GitHub',
      ],
      'P-05': ['Ubuntu | 24.04 | 2029-05-31', 'Ubuntu | 22.04 | 2027-06-01'],
    },
    'op.exp.6': {
      'P-01': ['servidor | clamav | /var/log/clamav/clamav.log'],
      'P-04': ['sistema | proteccion_tiempo_real | si'],
      'P-07': ['* | /boot', '* | /usr/bin', '* | /usr/sbin', '* | /etc', '* | /lib/modules'],
    },
    'op.exp.8': {
      'P-01': EVENTOS_AUDITABLES_LINUX,
      'P-03': [CAMPOS_REGISTRO_AUDITD],
      'P-08': ['root | total | todos', 'syslog | escritura | registros del sistema'],
    },
    'op.exp.10': {
      'P-02': ['/etc/ssh | 600 | root'],
      'P-08': ['root | claves de host SSH | total'],
    },
  },
};
