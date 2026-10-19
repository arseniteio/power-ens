import type { ENSPlatformSource } from './types';
import {
  AUDITD_RECORD_FIELDS,
  LINUX_AUDITABLE_EVENTS,
  LINUX_SECURITY_CONFIGURATION_PATHS,
  linuxUbuntuTemplate,
} from './linux-ubuntu';

// Servidor LDAP de Zimbra: un Ubuntu con el directorio de Zimbra. Es la
// plantilla de Linux con lo que cambia en el directorio, así que se aplica SOLA
// (no hace falta aplicar también «Linux Ubuntu»). Se propone a los agentes que
// emiten hechos del recolector LDAP (`data.plano = directorio`).
//
// Los ajustes propios del recolector LDAP (SSF mínimo, hashes fuertes, socket
// `ldapi`) no son parámetros del plugin: viven en el `.env` de la máquina.
// Las cuentas de Zimbra con sufijo aleatorio (`spam.*`, `ham.*`,
// `virus-quarantine.*`, `galsync.*`) son de cada instalación: se declaran como
// valor propio del agente.

const linux = linuxUbuntuTemplate.values;

export const zimbraLdapTemplate: ENSPlatformSource = {
  id: 'zimbra-ldap',
  label: 'Servidor LDAP',
  description: 'Servidor de directorio de Zimbra sobre Ubuntu: los valores de «Linux» más los del directorio.',
  kind: 'base',
  systemTypes: ['zimbra-ldap'],
  sources: [
    'op.acc.2-ldap/etc/opacc2-ldap.env.example (OPACC2LDAP_RUTAS_CRITICAS, OPACC2LDAP_GRUPOS_PRIVILEGIADOS, OPACC2LDAP_WW_EXCEPCIONES)',
    'opciones del bloque semilla de op.acc.1 (fuente de identidad LDAP)',
    'valores reales de un servidor LDAP de Zimbra de laboratorio, sin lo que es de esa instalación',
    'la plantilla «Linux Ubuntu» para el resto',
  ],
  values: {
    ...linux,
    'op.acc.1': {
      ...linux['op.acc.1'],
      'P-01': 'LDAP',
      'P-03': [...(linux['op.acc.1']['P-03'] as string[]), 'zimbra', 'ldapcopy'],
    },
    'op.acc.2': {
      ...linux['op.acc.2'],
      'P-02': [
        '/etc/passwd', '/etc/shadow', '/etc/group', '/etc/gshadow', '/etc/sudoers',
        '/etc/sudoers.d', '/etc/ssh/sshd_config', '/etc/crontab', '/etc/cron.d',
        '/etc/login.defs', '/opt/zimbra/conf/localconfig.xml',
      ],
      'P-11': ['/tmp', '/var/tmp', '/dev/shm'],
      'P-12': ['sudo', 'wheel', 'admin', 'root'],
    },
    'op.acc.6': {
      ...linux['op.acc.6'],
      'P-03': ['local', 'ldap'],
      'P-07': [
        'ssh | si | Responsable de Seguridad | si',
        'ldap | si | Responsable de Seguridad | si',
      ],
      'P-11': ['sshd:version_software', 'slapd:rootdse_anonimo'],
    },
    'op.exp.2': {
      ...linux['op.exp.2'],
      'P-03': [
        'admin | Zimbra (administrador por defecto) y aplicaciones web',
        ...(linux['op.exp.2']['P-03'] as string[]),
      ],
    },
    'op.exp.3': {
      ...linux['op.exp.3'],
      'P-04': [
        ...LINUX_SECURITY_CONFIGURATION_PATHS,
        '/opt/zimbra/data/ldap/config',
        '/opt/zimbra/conf/localconfig.xml',
      ],
    },
    'op.exp.4': {
      ...linux['op.exp.4'],
      'P-03': [
        ...(linux['op.exp.4']['P-03'] as string[]),
        'zimbra | Zimbra Security Center y notas de versión de Zimbra | web y correo',
      ],
    },
    'op.exp.6': {
      ...linux['op.exp.6'],
      'P-07': [
        ...(linux['op.exp.6']['P-07'] as string[]),
        '* | /opt/zimbra/data/ldap/config',
        '* | /opt/zimbra/common/libexec',
      ],
    },
    'op.exp.8': {
      ...linux['op.exp.8'],
      'P-01': [...LINUX_AUDITABLE_EVENTS, 'directorio LDAP | slapd | 3'],
      'P-03': [
        AUDITD_RECORD_FIELDS,
        'slapd | BIND dn | cabecera syslog | base, dn | op | RESULT err',
      ],
    },
  },
};
