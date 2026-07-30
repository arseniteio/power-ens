import { ENSControlConfiguration } from '../types';

export const opAcc2Configuration: ENSControlConfiguration = {
  controlId: 'op.acc.2',
  controlName: 'Requisitos de acceso',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.acc.2',
      name: 'sistemas_en_scope',
      label: 'Sistemas incluidos en el alcance',
      description:
        'Lista de sistemas (hostname/IP y SO) sobre los que ENSFácil debe verificar el cumplimiento de op.acc.2.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.1', 'op.acc.2.3'],
      type: 'list',
      example: 'srv01 | Linux',
      required: true,
      wazuhUsage:
        'Define en qué sistemas se ejecutan las comprobaciones SCA, FIM y log collection.',
      ensfacilUsage:
        'Delimita el alcance real auditado del control de acceso.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03'],
      // Hueco de trazabilidad: ninguna regla detecta un sistema del alcance que
      // deja de enviar eventos.
      ruleIds: [],
      ifNotConfigured:
        'Control marcado como NO EVALUABLE. Sin scope definido no se puede emitir semáforo.',
    },
    {
      id: 'P-02',
      controlId: 'op.acc.2',
      name: 'rutas_criticas_so',
      label: 'Rutas críticas del sistema operativo',
      description:
        'Rutas de ficheros y directorios del SO consideradas críticas que deben estar bajo control de acceso estricto y monitorizadas por FIM.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.3'],
      // La ficha define una lista de rutas criticas (el ejemplo trae tres y la
      // regla 106923 cubre cinco): `list`, no `path`, que designa una ruta unica.
      type: 'list',
      example: '/etc/passwd | /etc/sudoers | /etc/ssh/sshd_config',
      required: true,
      wazuhUsage:
        'Se configura en el módulo FIM de Wazuh como rutas a monitorizar. Cualquier cambio genera alerta.',
      ensfacilUsage:
        'Permite evidenciar la integridad de los componentes del sistema operativo.',
      evidenceIds: ['EV-02'],
      ruleIds: ['106920', '106921', '106922'],
      ifNotConfigured:
        'EV-02 (FIM sobre SO) desactivado. op.acc.2.3 NO EVALUABLE automáticamente.',
    },
    {
      id: 'P-03',
      controlId: 'op.acc.2',
      name: 'permisos_world_writable_permitidos',
      label: 'World-writable permitidos',
      description:
        'Indica si se permiten ficheros o directorios con permisos de escritura para todos (world-writable). Si no, cualquier world-writable es incumplimiento.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.1'],
      type: 'boolean',
      example: 'no (ninguno) / sí - /tmp, /var/tmp',
      required: true,
      wazuhUsage:
        'SCA verifica permisos. Si P-03 = no, cualquier world-writable genera alerta. Las excepciones se cargan como whitelist.',
      ensfacilUsage:
        'Permite distinguir world-writable de incumplimiento frente a los legítimos.',
      evidenceIds: ['EV-01'],
      ruleIds: ['106902'],
      ifNotConfigured:
        'No se puede distinguir qué world-writable files son incumplimiento y cuáles legítimos.',
    },
    {
      id: 'P-04',
      controlId: 'op.acc.2',
      name: 'politica_acceso_so_referencia',
      label: 'Referencia de la política de acceso',
      description:
        'Referencia a la política o normativa interna que establece los derechos de acceso a los recursos del sistema. Acredita op.acc.2.2.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.2'],
      type: 'string',
      example: 'Política de Control de Acceso v2.1, aprobada 01/01/2025',
      required: true,
      wazuhUsage:
        'Se incluye como referencia documental en el informe. Acredita respaldo normativo interno de los derechos de acceso.',
      ensfacilUsage:
        'Permite acreditar que los derechos de acceso siguen la decisión del responsable del recurso.',
      evidenceIds: ['EV-04'],
      // Hueco de trazabilidad: parámetro documental; ninguna alerta lo acredita.
      ruleIds: [],
      ifNotConfigured:
        'El informe no puede acreditar el cumplimiento de op.acc.2.2. Campo del informe vacío.',
    },
    {
      id: 'P-05',
      controlId: 'op.acc.2',
      name: 'modelo_privilegios',
      label: 'Modelo de privilegios',
      description:
        'Modelo de privilegios utilizado en el sistema (mínimo privilegio, RBAC, ABAC, ACLs granulares, etc.). Exigido por R1.',
      levels: ['ALTO'],
      requirements: ['op.acc.2.r1.1', 'op.acc.2.r1.2'],
      type: 'select',
      example: 'RBAC sobre AD / ACL granular por recurso / Mínimo privilegio + sudo',
      required: false,
      wazuhUsage:
        'ENSFácil verifica en logs y SCA que el modelo declarado se implementa. Detecta usuarios con privilegios de admin no justificados.',
      ensfacilUsage:
        'Permite verificar el refuerzo R1 (op.acc.2.r1.1) sobre el modelo de privilegios.',
      evidenceIds: ['EV-05'],
      ruleIds: ['106930', '106931'],
      ifNotConfigured:
        'R1 marcado como NO EVALUABLE. No se puede verificar op.acc.2.r1.1 ni op.acc.2.r1.2.',
    },
    {
      id: 'P-06',
      controlId: 'op.acc.2',
      name: 'tipos_acceso_permitidos_por_perfil',
      label: 'Tipos de acceso permitidos por perfil',
      description:
        'Mapa de tipos de acceso permitidos (lectura, escritura, modificación, borrado, ejecución) por perfil o rol sobre los recursos. Base para R1.',
      levels: ['ALTO'],
      requirements: ['op.acc.2.r1.2'],
      type: 'list',
      example: 'ops -> lectura+escritura | dev -> lectura | admin -> todos',
      required: false,
      wazuhUsage:
        'ENSFácil cruza los permisos de SCA (EV-01) y las ACLs reales contra esta tabla. Diferencias generan alerta.',
      ensfacilUsage:
        'Permite verificar si los privilegios detectados se corresponden con los autorizados (op.acc.2.r1.2).',
      evidenceIds: ['EV-04', 'EV-06'],
      ruleIds: ['106935', '106936'],
      ifNotConfigured:
        'No se puede verificar si los privilegios detectados se corresponden con los autorizados.',
    },
    {
      id: 'P-07',
      controlId: 'op.acc.2',
      name: 'umask_minimo',
      label: 'umask mínimo exigido',
      description:
        'Valor mínimo de umask exigido para la creación de ficheros. Garantiza que los nuevos ficheros no se crean con permisos abiertos por defecto.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.2.1'],
      type: 'string',
      example: '022 (permisos 755/644) / 027 (permisos 750/640)',
      required: true,
      wazuhUsage:
        'SCA verifica el umask en perfiles de usuario y /etc/profile. Si el umask real es más permisivo que P-07, genera alerta.',
      ensfacilUsage:
        'Permite verificar si la configuración de permisos por defecto es suficientemente restrictiva.',
      evidenceIds: ['EV-01'],
      ruleIds: ['106903', '106904'],
      ifNotConfigured:
        'No se puede verificar si la configuración de permisos por defecto es suficientemente restrictiva.',
    },
  ],
};
