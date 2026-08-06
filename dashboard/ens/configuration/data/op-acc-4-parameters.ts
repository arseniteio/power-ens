import { ENSControlConfiguration } from '../types';

export const opAcc4Configuration: ENSControlConfiguration = {
  controlId: 'op.acc.4',
  controlName: 'Proceso de gestión de derechos de acceso',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.acc.4',
      name: 'matriz_privilegios_autorizados',
      label: 'Matriz privilegios autorizados',
      description:
        'Matriz que define, para cada perfil o rol, qué recursos puede acceder y con qué tipo de acceso. Es la referencia contra la que se contrasta la configuración real del sistema.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.1', 'op.acc.4.2', 'op.acc.4.3'],
      type: 'table',
      example: 'ops | /srv/app | rw / dev | /srv/app | r',
      columns: [
        {
          name: 'rol',
          label: 'Rol',
          type: 'identifier',
          required: true,
        },
        {
          name: 'recurso',
          label: 'Recurso',
          type: 'path',
          required: false,
        },
        {
          name: 'acceso',
          label: 'Acceso',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Núcleo del control. Cualquier privilegio no contemplado → alerta de acceso sin autorización expresa.',
      ensfacilUsage:
        'ENSFácil compara los privilegios reales detectados por SCA contra esta matriz.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'op.acc.4.1, .2 y .3 NO EVALUABLES. Sin referencia autorizada no se puede juzgar si un privilegio es excesivo.',
    },
    {
      id: 'P-02',
      controlId: 'op.acc.4',
      name: 'personal_con_capacidad_autorizar',
      label: 'Personal con capacidad autorizar',
      description:
        'Lista de cuentas o personas con competencia para conceder, alterar o anular autorizaciones de acceso, y sobre qué ámbito de recursos.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.4'],
      type: 'table',
      example: 'rsec | global / admin_bd | bases de datos',
      columns: [
        {
          name: 'cuenta',
          label: 'Cuenta',
          type: 'identifier',
          required: true,
        },
        {
          name: '_mbito',
          label: 'Ámbito',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'CDB list en Wazuh. Cualquier evento de cambio de permisos o membresía de grupo ejecutado por una cuenta fuera de esta lista → alerta de autorización no competente.',
      ensfacilUsage:
        'CDB list en Wazuh. Cualquier evento de cambio de permisos o membresía de grupo ejecutado por una cuenta fuera de esta lista → alerta de autorización no competente.',
      evidenceIds: ['EV-03', 'EV-04', 'EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar op.acc.4.4. Cualquier cambio de permisos se registra sin poder juzgar su legitimidad.',
    },
    {
      id: 'P-03',
      controlId: 'op.acc.4',
      name: 'periodicidad_revision_permisos_dias',
      label: 'Periodicidad revision permisos dias',
      description:
        'Cada cuánto deben revisarse los permisos de acceso. El ENS exige revisión periódica (op.acc.4.4) pero deja la periodicidad concreta a la normativa interna de la organización.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.4'],
      type: 'duration_days',
      example: '90 (trimestral) / o 180 (semestral) / o 365 (anual)',
      required: true,
      wazuhUsage:
        'ENSFácil registra la fecha de la última revisión declarada o detectada y alerta cuando se supera el plazo P-03 sin que conste una nueva revisión.',
      ensfacilUsage:
        'ENSFácil registra la fecha de la última revisión declarada o detectada y alerta cuando se supera el plazo P-03 sin que conste una nueva revisión.',
      evidenceIds: ['EV-03', 'EV-04', 'EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar el cumplimiento de la revisión periódica exigida por op.acc.4.4.',
    },
    {
      id: 'P-04',
      controlId: 'op.acc.4',
      name: 'canales_acceso_remoto_permitidos',
      label: 'Canales acceso remoto permitidos',
      description:
        'Canales, protocolos y orígenes autorizados para el acceso remoto al sistema: VPN corporativa, bastión SSH, escritorio remoto con doble factor, rangos de IP permitidos.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.5'],
      type: 'list',
      example: 'VPN | 1194 | cualquiera / SSH bastión | 22 | 10.0.0.0/8',
      required: true,
      wazuhUsage:
        'ENSFácil genera reglas Wazuh que alertan ante conexiones remotas por canales, puertos u orígenes no incluidos en P-04. Es la traducción técnica de la política de acceso remoto.',
      ensfacilUsage:
        'ENSFácil genera reglas Wazuh que alertan ante conexiones remotas por canales, puertos u orígenes no incluidos en P-04. Es la traducción técnica de la política de acceso remoto.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'op.acc.4.5 NO EVALUABLE. No se puede distinguir un acceso remoto legítimo de uno no autorizado.',
    },
    {
      id: 'P-05',
      controlId: 'op.acc.4',
      name: 'usuarios_autorizados_acceso_remoto',
      label: 'Usuarios autorizados acceso remoto',
      description:
        'Cuentas que tienen autorización expresa para acceder remotamente al sistema. El ENS exige autorización expresa para el acceso remoto (op.acc.4.5).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.5'],
      type: 'list',
      example: 'jgomez | VPN | indefinida / ext_sop | SSH | hasta 31/12',
      required: true,
      wazuhUsage:
        'CDB list en Wazuh. Cualquier acceso remoto de una cuenta no incluida genera alerta de acceso remoto sin autorización expresa.',
      ensfacilUsage:
        'CDB list en Wazuh. Cualquier acceso remoto de una cuenta no incluida genera alerta de acceso remoto sin autorización expresa.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la autorización expresa individual para acceso remoto.',
    },
    {
      id: 'P-06',
      controlId: 'op.acc.4',
      name: 'grupos_privilegiados',
      label: 'Grupos privilegiados',
      description:
        'Grupos del sistema o del directorio cuya pertenencia otorga privilegios elevados (Administrators, Domain Admins, wheel, sudo, root-equivalentes). Su vigilancia es la vía más directa para verificar el mínimo privilegio.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.2'],
      type: 'list',
      example: 'Domain Admins | AD / wheel | servidores Linux',
      required: true,
      wazuhUsage:
        'Wazuh monitoriza altas y bajas en estos grupos (EventID 4728/4732/4756 en Windows, cambios en /etc/group en Linux). Toda alta debe corresponder a la matriz P-01.',
      ensfacilUsage:
        'Wazuh monitoriza altas y bajas en estos grupos (EventID 4728/4732/4756 en Windows, cambios en /etc/group en Linux). Toda alta debe corresponder a la matriz P-01.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'No se detectan escaladas de privilegio por adición a grupos privilegiados.',
    },
    {
      id: 'P-07',
      controlId: 'op.acc.4',
      name: 'recursos_sensibles_necesidad_conocer',
      label: 'Recursos sensibles necesidad conocer',
      description:
        'Recursos que contienen información sujeta al principio de necesidad de conocer, con indicación de qué perfiles tienen justificación de acceso (op.acc.4.3).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.4.3'],
      type: 'table',
      example: '/datos/rrhh | rrhh / /datos/nominas | rrhh+dir',
      columns: [
        {
          name: 'recurso',
          label: 'Recurso',
          type: 'path',
          required: true,
        },
        {
          name: 'perfiles',
          label: 'Perfiles',
          type: 'identifier',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil monitoriza accesos a estos recursos y alerta cuando accede un perfil sin justificación declarada, aunque técnicamente tenga permiso.',
      ensfacilUsage:
        'ENSFácil monitoriza accesos a estos recursos y alerta cuando accede un perfil sin justificación declarada, aunque técnicamente tenga permiso.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'op.acc.4.3 NO EVALUABLE. No se puede distinguir acceso técnicamente posible de acceso justificado.',
    },
  ],
};
