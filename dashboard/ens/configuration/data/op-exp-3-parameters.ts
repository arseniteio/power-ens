import { ENSControlConfiguration } from '../types';

export const opExp3Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.3',
  controlName: 'Gestión de la configuración de seguridad',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.3',
      name: 'baseline_configuracion_autorizada',
      label: 'Baseline configuracion autorizada',
      description:
        'Configuración hardware/software autorizada y documentada para cada tipo de activo: servidores, elementos de red y estaciones de trabajo. Es la referencia frente a la que se detecta cualquier desviación.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.1'],
      type: 'string',
      example: '«Baseline srv Linux v3.1» / + política SCA asociada / + inventario HW/SW esperado',
      required: true,
      wazuhUsage:
        'ENSFácil compara de forma continua el inventario de Syscollector y el resultado SCA contra esta línea base. Toda desviación no autorizada genera hallazgo. Es la pieza central de R1.',
      ensfacilUsage:
        'ENSFácil compara de forma continua el inventario de Syscollector y el resultado SCA contra esta línea base. Toda desviación no autorizada genera hallazgo. Es la pieza central de R1.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE. Sin línea base autorizada no hay referencia con la que detectar elementos no autorizados.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.3',
      name: 'lista_servicios_autorizados',
      label: 'Lista servicios autorizados',
      description:
        'Relación de servicios permitidos en servidores y estaciones de trabajo, exigida expresamente por op.exp.3.r1.3. Puede coincidir con el P-02 de op.exp.2, pero aquí el énfasis está en su mantenimiento y verificación periódica, no en la configuración inicial.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.3', 'op.exp.3.1'],
      type: 'table',
      example: 'estación | navegador, / ofimática, antivirus, VPN',
      columns: [
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          name: 'servicios_autorizados',
          label: 'Servicios autorizados',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'CDB list en Wazuh. Todo servicio no autorizado en ejecución es un hallazgo de R1 y también de op.exp.3.1.',
      ensfacilUsage:
        'Syscollector detecta los servicios en ejecución y ENSFácil contrasta contra la lista.',
      evidenceIds: ['EV-01', 'EV-04', 'EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.3.r1.3 NO EVALUABLE y op.exp.3.1 queda sin verificación de continuidad.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.3',
      name: 'administradores_configuracion',
      label: 'Administradores configuracion',
      description:
        'Personal autorizado para editar la configuración de seguridad. En categoría BÁSICA y MEDIA basta con identificarlos (op.exp.3.6). En categoría ALTA, R2 exige además que sean «un número muy limitado», por lo que debe fijarse el número máximo admitido.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.6', 'op.exp.3.r2.1'],
      type: 'list',
      example: '3 administradores',
      required: true,
      wazuhUsage:
        'CDB list en Wazuh. Cualquier cambio en ficheros de configuración de seguridad ejecutado por una cuenta fuera de la lista genera alerta.',
      ensfacilUsage:
        'En ALTA, ENSFácil verifica además que el número no supera el umbral.',
      evidenceIds: ['EV-02', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.3.6 NO EVALUABLE. No se puede distinguir un cambio legítimo de uno no autorizado.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.3',
      name: 'rutas_configuracion_seguridad',
      label: 'Rutas configuracion seguridad',
      description:
        'Ficheros y rutas que contienen la configuración de seguridad del sistema y de las aplicaciones, que deben vigilarse con FIM para detectar toda edición.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.6', 'op.exp.3.1', 'op.exp.3.2'],
      type: 'path',
      example: '/etc/ssh/, /etc/pam.d/, / /etc/sudoers, /etc/firewalld/ / HKLM\\SYSTEM\\CCS\\Services',
      required: true,
      wazuhUsage:
        'Configuración del módulo FIM con whodata activado para capturar qué usuario realizó cada cambio. Es la evidencia directa de op.exp.3.6 y la base para detectar degradación de la configuración.',
      ensfacilUsage:
        'Configuración del módulo FIM con whodata activado para capturar qué usuario realizó cada cambio. Es la evidencia directa de op.exp.3.6 y la base para detectar degradación de la configuración.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'No se detectan ediciones de la configuración de seguridad. op.exp.3.6 sin verificación automática.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.3',
      name: 'periodicidad_verificacion_config_dias',
      label: 'Periodicidad verificacion config dias',
      description:
        'Cada cuánto debe verificarse la configuración hardware/software para asegurar que no se han introducido elementos no autorizados (op.exp.3.r1.2). El ENS exige verificación «periódica» sin fijar plazo.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.2'],
      type: 'duration_days',
      example: '30 (mensual) / o 90 (trimestral)',
      required: true,
      wazuhUsage:
        'Define el intervalo de la comparación formal contra la línea base P-01 que ENSFácil registra como verificación acreditada. Independientemente, SCA y Syscollector operan de forma continua.',
      ensfacilUsage:
        'Define el intervalo de la comparación formal contra la línea base P-01 que ENSFácil registra como verificación acreditada. Independientemente, SCA y Syscollector operan de forma continua.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede acreditar la periodicidad de la verificación exigida por R1. Se aplica 30 días por defecto.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.3',
      name: 'procedimiento_autorizacion_cambios',
      label: 'Procedimiento autorizacion cambios',
      description:
        'Referencia al procedimiento de autorización previa de cambios de configuración, exigido por op.exp.3.3 con remisión expresa a op.acc.4. Debe permitir correlacionar un cambio detectado con su autorización.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.3'],
      type: 'string',
      example: '«PR-15 Gestión de cambios» / + integración con ITSM / (Jira, GLPI, ServiceNow)',
      required: true,
      wazuhUsage:
        'Si hay integración con el sistema de tickets, ENSFácil correlaciona cada cambio detectado por FIM con su ticket de autorización. Cambio sin ticket asociado → hallazgo de cambio no autorizado.',
      ensfacilUsage:
        'Si hay integración con el sistema de tickets, ENSFácil correlaciona cada cambio detectado por FIM con su ticket de autorización. Cambio sin ticket asociado → hallazgo de cambio no autorizado.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'Todo cambio detectado queda sin poder contrastarse contra su autorización. op.exp.3.3 solo documental.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.3',
      name: 'config_backup_destino',
      label: 'Config backup destino',
      description:
        'Destino, periodicidad y alcance de las copias de seguridad de la configuración del sistema, exigidas por R3 en categoría ALTA para permitir la reconstrucción tras un incidente.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r3.1'],
      type: 'table',
      example: 'configs servidores | / repo Git interno | diaria',
      columns: [
        {
          name: 'alcance',
          label: 'Alcance',
          type: 'string',
          required: true,
        },
        {
          name: 'destino',
          label: 'Destino',
          type: 'string',
          required: false,
        },
        {
          name: 'frecuencia',
          label: 'Frecuencia',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil verifica la existencia y frescura de las copias mediante FIM sobre el destino o ingesta de los logs del proceso de respaldo. Ausencia o antigüedad excesiva → hallazgo de R3.',
      ensfacilUsage:
        'ENSFácil verifica la existencia y frescura de las copias mediante FIM sobre el destino o ingesta de los logs del proceso de respaldo. Ausencia o antigüedad excesiva → hallazgo de R3.',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'R3 NO EVALUABLE. No se puede acreditar la capacidad de reconstrucción tras incidente.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.3',
      name: 'umbral_desviacion_baseline',
      label: 'Umbral desviacion baseline',
      description:
        'Grado de desviación respecto a la línea base P-01 que se considera aceptable antes de marcar el activo como no conforme. Permite absorber variaciones menores sin disparar hallazgos continuos.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.1', 'op.exp.3.r1.2'],
      type: 'number',
      example: '≤ 5 % desviación / admisible, salvo checks / marcados como críticos',
      required: true,
      wazuhUsage:
        'Configura los cortes del semáforo por activo. Los elementos marcados como críticos en la línea base generan hallazgo con independencia del porcentaje global.',
      ensfacilUsage:
        'Configura los cortes del semáforo por activo. Los elementos marcados como críticos en la línea base generan hallazgo con independencia del porcentaje global.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'Se aplica tolerancia cero por defecto, lo que puede producir ruido excesivo en el informe.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.3',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la línea base de configuración aprobada y la capacidad real de reconstruir el sistema a partir de sus copias, que ningún evento puede demostrar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.3.r1.1 | Línea base de configuración aprobada | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        {
          name: 'requisito',
          label: 'Requisito',
          type: 'string',
          required: true,
        },
        {
          name: 'referencia',
          label: 'Referencia',
          type: 'string',
          required: false,
        },
        {
          name: 'enlace',
          label: 'Enlace',
          type: 'string',
          required: false,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      ensfacilUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Los requisitos puramente documentales del control se quedan sin acreditar y cuentan en contra: lo que no se puede demostrar, no cumple.',
    },
  ],
};
