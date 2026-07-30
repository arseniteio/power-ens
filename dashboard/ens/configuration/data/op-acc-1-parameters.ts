import { ENSControlConfiguration } from '../types';

export const opAcc1Configuration: ENSControlConfiguration = {
  controlId: 'op.acc.1',
  controlName: 'Identificación',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.acc.1',
      name: 'fuente_identidad',
      label: 'Fuente de identidad',
      description:
        'Sistema o directorio de identidades que gestiona las cuentas de usuario en la organización.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.3', 'op.acc.1.4'],
      type: 'select',
      example: 'Active Directory / LDAP / local / Azure AD / otro',
      required: true,
      wazuhUsage:
        'Determina qué integración de Wazuh se activa: módulo AD, colector de eventos Windows, auditd en Linux o conector cloud.',
      ensfacilUsage:
        'Define de dónde obtiene ENSFácil los eventos de alta, modificación y baja de cuentas.',
      evidenceIds: ['EV-01', 'EV-02'],
      // Hueco de trazabilidad: ninguna regla comprueba la fuente de identidad
      // declarada; el recolector la usa, pero no la acredita ninguna alerta.
      ruleIds: [],
      ifNotConfigured:
        'Wazuh no sabe de dónde vienen las identidades. Todos los checks de cuentas quedan NO EVALUABLE.',
    },
    {
      id: 'P-02',
      controlId: 'op.acc.1',
      name: 'sistemas_monitorizados',
      label: 'Sistemas incluidos en el alcance',
      description:
        'Lista de sistemas en los que ENSFácil debe verificar el cumplimiento de la política de identificación.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.3', 'op.acc.1.4'],
      type: 'list',
      example: 'srv-dc01 | Windows',
      required: true,
      wazuhUsage:
        'Define el alcance de la monitorización. Wazuh solo detecta anomalías en los sistemas incluidos.',
      ensfacilUsage:
        'Delimita el alcance real auditado del control de identificación.',
      evidenceIds: ['EV-01'],
      // Hueco de trazabilidad: ninguna regla detecta un sistema del alcance que
      // deja de enviar eventos.
      ruleIds: [],
      ifNotConfigured:
        'ENSFácil no sabe qué sistemas entran en scope. No se puede emitir un semáforo fiable.',
    },
    {
      id: 'P-03',
      controlId: 'op.acc.1',
      name: 'cuentas_servicio_definidas',
      label: 'Cuentas de servicio legítimas',
      description:
        'Lista de cuentas técnicas o de proceso legítimas que no corresponden a personas físicas.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.2', 'op.acc.1.3'],
      type: 'list',
      example: 'svc_backup | srv01',
      required: true,
      wazuhUsage:
        'Se puede cargar como CDB list para distinguir cuentas de usuario de cuentas de servicio.',
      ensfacilUsage:
        'Permite detectar cuentas de servicio usadas para acceso interactivo.',
      evidenceIds: ['EV-05'],
      ruleIds: ['106805', '106857', '106858'],
      ifNotConfigured:
        'No se puede detectar si una cuenta de servicio se usa para acceso interactivo.',
    },
    {
      id: 'P-04',
      controlId: 'op.acc.1',
      name: 'cuentas_genericas_prohibidas',
      label: 'Cuentas genéricas prohibidas',
      description:
        'Nombres de cuenta prohibidos que, si existen activas, rompen la unicidad del identificador (admin, guest, test, etc.).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.1', 'op.acc.1.3'],
      type: 'list',
      example: 'admin, guest, test, temp',
      required: true,
      wazuhUsage:
        'Se carga como CDB list. Cualquier autenticación exitosa con estas cuentas genera alerta crítica.',
      ensfacilUsage:
        'Permite verificar la unicidad del identificador y detectar cuentas compartidas.',
      evidenceIds: ['EV-03'],
      ruleIds: ['106801'],
      ifNotConfigured:
        'No se detectan cuentas genéricas activas. EV-03 queda parcialmente desactivado.',
    },
    {
      id: 'P-05',
      controlId: 'op.acc.1',
      name: 'plazo_max_deshabilitar_dias',
      label: 'Plazo máximo para deshabilitar',
      description:
        'Plazo máximo desde que un usuario cesa o deja la organización hasta que su cuenta debe estar deshabilitada.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'duration_days',
      example: '1',
      required: true,
      minValue: 0,
      wazuhUsage:
        'Compara la fecha del evento de baja/cese contra la fecha de deshabilitación de la cuenta.',
      ensfacilUsage:
        'Evalúa si las cuentas se deshabilitan dentro del plazo definido tras la baja.',
      evidenceIds: ['EV-04'],
      ruleIds: ['106820', '106844'],
      ifNotConfigured:
        'No se puede verificar si las cuentas se deshabilitan en plazo. op.acc.1.4 b) NO EVALUABLE.',
    },
    {
      id: 'P-06',
      controlId: 'op.acc.1',
      name: 'periodo_retencion_cuentas_dias',
      label: 'Retención de cuentas deshabilitadas',
      description:
        'Periodo durante el que se conservan las cuentas deshabilitadas para garantizar la trazabilidad de la actividad asociada.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'duration_days',
      example: '365',
      required: true,
      minValue: 1,
      wazuhUsage:
        'Verifica que las cuentas deshabilitadas no se eliminen antes de cumplir el periodo.',
      ensfacilUsage:
        'Evalúa el cumplimiento de la retención de cuentas para trazabilidad.',
      evidenceIds: ['EV-08'],
      ruleIds: ['106821', '106856'],
      ifNotConfigured:
        'No se puede verificar si la retención de cuentas cumple la normativa interna.',
    },
    {
      id: 'P-07',
      controlId: 'op.acc.1',
      name: 'lista_usuarios_autorizados',
      label: 'Lista de usuarios autorizados',
      description:
        'Lista maestra de usuarios autorizados a acceder a los sistemas en scope, mantenida por el administrador de seguridad. Exigida por R1.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.1.r1.2', 'op.acc.1.r1.3'],
      type: 'list',
      example: 'jgomez | srv01 | ops',
      required: true,
      wazuhUsage:
        'Se compara el inventario de cuentas activas contra esta lista. Cuenta activa no incluida genera alerta.',
      ensfacilUsage:
        'Permite verificar el refuerzo R1 (op.acc.1.r1.3) contrastando cuentas activas.',
      evidenceIds: ['EV-07'],
      ruleIds: ['106832', '106833', '106839', '106840'],
      ifNotConfigured:
        'El refuerzo R1 queda NO EVALUABLE. No se puede verificar op.acc.1.r1.3.',
    },
    {
      id: 'P-08',
      controlId: 'op.acc.1',
      name: 'integracion_rrhh',
      label: 'Integración con RRHH',
      description:
        'Indica si ENSFácil tiene acceso a un sistema de RRHH o directorio que notifique altas y bajas de empleados.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.4'],
      type: 'boolean',
      example: 'sí / no',
      required: false,
      wazuhUsage:
        'Si está activa, correlaciona eventos de baja de RRHH con la deshabilitación de la cuenta.',
      ensfacilUsage:
        'Determina si la detección de cuentas de bajas puede automatizarse o requiere declaración manual.',
      evidenceIds: ['EV-04'],
      // Hueco de trazabilidad: no existe regla de correlación con RRHH.
      ruleIds: [],
      ifNotConfigured:
        'La detección de cuentas activas de usuarios dados de baja no puede automatizarse.',
    },
  ],
};
