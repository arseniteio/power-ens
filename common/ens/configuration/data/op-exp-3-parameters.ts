import { ENSControlConfiguration } from '../types';

// op.exp.3 parameters.
// `required` is deliberately scarce: a required parameter without value blocks the WHOLE control, so only the
// three that hold the base are: the service list (P-02), who can edit the configuration (P-03) and which
// configuration is watched (P-04). For reinforcement parameters, the judgment of their own evidence names what
// is missing (cause CONFIGURATION).
// P-09 (max administrators of R2) and P-10 (backup age) were split from P-03 and P-07 because a parameter has
// ONE type and the engine compares against it.
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
      label: 'Software autorizado sobre la línea base',
      description:
        'Software autorizado sobre la línea base aprobada, un paquete por línea con el nombre exacto del gestor de paquetes (nmap, postgresql-16); las dependencias automáticas no se declaran. El documento de la línea base se acredita en P-ATT (op.exp.3.r1.1).',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.1', 'op.exp.3.r1.2'],
      type: 'list',
      example: 'nmap',
      columns: [
        {
          name: 'paquete',
          label: 'Paquete',
          type: 'identifier',
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Regla 110402 (software_installed). El agente lee dpkg.log y el historial de apt y emite un hecho por paquete instalado de nuevo y pedido de forma explícita.',
      ensfacilUsage:
        'EV-03 con NINGUNO_FUERA_DE_LISTA: todo paquete introducido debe figurar aquí. Sin instalaciones en la ventana y con el recolector confirmando la lectura del registro, cumple.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'EV-03 NO_EVALUABLE (causa CONFIGURATION): no se decide si lo instalado estaba autorizado y op.exp.3.r1.2 no acredita.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.3',
      name: 'lista_servicios_autorizados',
      label: 'Servicios autorizados por perfil',
      description:
        'Una fila por perfil de máquina con sus servicios autorizados, separados por comas y como los emite el agente: unidades de systemd (ssh.service, getty@.service) y procesos que escuchan en red fuera de systemd (proceso:nombre). El perfil es por defecto el nombre corto del host, o OPEXP3_PERFIL en el .env; puede coincidir con la lista de op.exp.2, aquí demuestra que se MANTIENE.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.1', 'op.exp.3.r1.3'],
      type: 'table',
      example: 'srv-web01 | ssh.service,cron.service,nginx.service',
      columns: [
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          // `multiselect` without options: the cell is split by commas and the observed service must be AMONG
          // the declared ones. Closed options make no sense: each machine has its own.
          name: 'servicios_autorizados',
          label: 'Servicios autorizados',
          type: 'multiselect',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'Regla 110403 (service_running). El agente emite cada servicio en ejecución con el perfil de la máquina; se reemite al cambiar la lista y, si no cambia, cada 20 horas.',
      ensfacilUsage:
        'EV-04 con CONFORME_A_TABLA: cada servicio observado debe estar en la celda de su perfil. Un perfil sin fila es una decisión sin escribir: NO_EVALUABLE con causa CONFIGURATION.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'EV-04 NO_EVALUABLE: op.exp.3.1 y op.exp.3.r1.3 no acreditan. Bloquea el control, que es obligatorio.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.3',
      name: 'administradores_configuracion',
      label: 'Cuentas autorizadas a editar la configuración de seguridad',
      description:
        'Cuentas autorizadas a editar la configuración de seguridad, una por línea y como las emite el agente: la cuenta de la sesión aunque pasara por sudo; los cambios sin sesión (paquete, servicio) llegan con la cuenta del proceso, normalmente root, y declararla los acepta. En LDAP, las identidades que cambian cn=config van con su DN entero y las comas como guiones bajos (cn=config; gidNumber=0+uidNumber=0_cn=peercred_cn=external_cn=auth para root por el socket local); comparación literal y sensible a mayúsculas.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.6', 'op.exp.3.r2.1'],
      type: 'list',
      example: 'jgomez',
      columns: [
        {
          name: 'cuenta',
          label: 'Cuenta',
          type: 'identifier',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'Regla 110401 (config_file_modified). El agente lee auditd y emite cada edición de las rutas vigiladas con actor, operación, proceso e intervalo.',
      ensfacilUsage:
        'EV-02 con NINGUNO_FUERA_DE_LISTA: ningún actor observado puede quedar fuera de esta lista. Sin ediciones y con todas las rutas vigiladas confirmadas, cumple.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.3.6 NO EVALUABLE: no se distingue un cambio legítimo de uno no autorizado. Bloquea el control, que es obligatorio.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.3',
      name: 'rutas_configuracion_seguridad',
      label: 'Rutas de la configuración de seguridad',
      description:
        'Ficheros y directorios con la configuración de seguridad vigilados con auditd, una ruta absoluta por línea, iguales a los del fichero de reglas del runbook (/etc/audit/rules.d/ensfacil-opexp3.rules): son las dos mitades de EV-02. El agente comprueba que el kernel vigila cada ruta en escritura; el motor no verifica que coincidan con esta lista.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.6', 'op.exp.3.1', 'op.exp.3.2'],
      type: 'list',
      example: '/etc/ssh',
      columns: [
        {
          name: 'ruta',
          label: 'Ruta',
          type: 'path',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'Plantilla de reglas de auditd del runbook (clave ensfacil_opexp3_cfg). Es la política escrita de qué se vigila; ninguna primitiva la contrasta con un hecho.',
      ensfacilUsage:
        'Documental: indica al auditor qué configuración se considera de seguridad. EV-02 se juzga contra P-03.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No queda escrito qué se considera configuración de seguridad. Bloquea el control, que es obligatorio.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.3',
      name: 'periodicidad_verificacion_config_dias',
      label: 'Periodicidad de la verificación de la configuración (días)',
      description:
        'Cada cuántos días, como máximo, debe hacerse una verificación formal de la configuración frente a la línea base (op.exp.3.r1.2); el ENS exige verificación «periódica» sin fijar plazo. La organización anota cada una en el registro del runbook (opexp3-verificaciones.tsv).',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.2'],
      type: 'duration_days',
      example: '90',
      required: false,
      wazuhUsage:
        'Regla 110406 (baseline_verification_performed): la verificación más reciente anotada, con su fecha.',
      ensfacilUsage:
        'EV-11 con ANTIGUEDAD_MAXIMA: la verificación más reciente no puede superar este plazo. Sin ninguna anotada, no cumple.',
      evidenceIds: ['EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'EV-11 NO_EVALUABLE (causa CONFIGURATION) y op.exp.3.r1.2 no acredita. No se aplica plazo por defecto.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.3',
      name: 'procedimiento_autorizacion_cambios',
      label: 'Procedimiento de autorización de cambios',
      description:
        'Referencia al procedimiento de autorización previa de cambios de configuración y al sistema de gestión de cambios donde se aprueban (Jira, GLPI, ServiceNow). op.exp.3.3 exige cambios previamente autorizados, medible solo correlacionando cada edición de EV-02 con su cambio aprobado. Esa integración aún no existe: el parámetro deja escrita la referencia pero no desbloquea ninguna medida.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.3'],
      type: 'string',
      example: 'PR-15 Gestión de cambios en GLPI',
      required: false,
      wazuhUsage:
        'Ninguna regla. El agente declara EV-05 NO_EVALUABLE con causa COLLECTION por falta de integración con el sistema de gestión de cambios.',
      ensfacilUsage:
        'Documental hasta que exista la integración con el ITSM. No se juzga contra nada.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'No queda escrita la referencia. op.exp.3.3 sigue sin evidenciar mientras no haya integración, esté o no configurado.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.3',
      name: 'config_backup_destino',
      label: 'Alcance y destino de las copias de la configuración',
      description:
        'Qué configuración se copia y adónde, una fila por alcance, para reconstruir tras un incidente (R3). Es la declaración que lee el auditor; el plazo medible es P-10 y dónde busca el agente las copias se ajusta en su .env (OPEXP3_COPIAS_CONFIG).',
      levels: ['ALTO'],
      requirements: ['op.exp.3.r3.1'],
      type: 'table',
      example: 'configuración del sistema | repositorio git interno',
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
          required: true,
        },
      ],
      required: false,
      wazuhUsage:
        'Documental. La copia observada la emite la regla 110405 (config_backup_observed).',
      ensfacilUsage:
        'Documental: ninguna primitiva lo contrasta con un hecho.',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'No queda escrito dónde se copian las configuraciones. No bloquea EV-09, que se juzga contra P-10.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.3',
      name: 'umbral_desviacion_baseline',
      label: 'Umbral de desviación admitido (%)',
      description:
        'Grado de desviación respecto a la línea base considerado aceptable. Es política escrita, pero ninguna primitiva lo aplica: EV-03 juzga con tolerancia cero (todo paquete introducido debe estar autorizado en P-01).',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.2'],
      type: 'number',
      example: '5',
      minValue: 0,
      maxValue: 100,
      required: false,
      wazuhUsage:
        'Ninguna regla.',
      ensfacilUsage:
        'Documental. EV-03 aplica tolerancia cero.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto: se aplica tolerancia cero en cualquier caso.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.3',
      name: 'max_administradores_configuracion',
      label: 'Máximo de administradores efectivos de la configuración',
      description:
        'Número máximo de cuentas distintas que pueden editar de verdad la configuración de seguridad en la ventana de observación (30 días por defecto): el «número muy limitado» de R2 en categoría ALTA. Se cuenta lo que ocurre, no lo autorizado: una cuenta de P-03 que no edita nada no suma.',
      levels: ['ALTO'],
      requirements: ['op.exp.3.r2.1'],
      type: 'number',
      example: '3',
      minValue: 1,
      required: false,
      wazuhUsage:
        'Regla 110404 (config_admins_observed): cuentas que editaron la configuración en la ventana, emitido solo si la ventana entera se observó sin huecos.',
      ensfacilUsage:
        'EV-08 con UMBRAL_MAXIMO: el recuento observado no puede superar este número.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'EV-08 NO_EVALUABLE (causa CONFIGURATION) y op.exp.3.r2.1 no acredita.',
    },
    {
      id: 'P-10',
      controlId: 'op.exp.3',
      name: 'antiguedad_maxima_copia_configuracion_horas',
      label: 'Antigüedad máxima de la copia de la configuración (horas)',
      description:
        'Horas máximas de antigüedad de la copia más reciente de la configuración para considerar el sistema reconstruible (R3); con varios alcances cuenta el peor. Es la frecuencia de P-07 como plazo: 24 para diaria, 168 para semanal.',
      levels: ['ALTO'],
      requirements: ['op.exp.3.r3.1'],
      type: 'duration_hours',
      example: '24',
      required: false,
      wazuhUsage:
        'Regla 110405 (config_backup_observed): instante de la copia más reciente del alcance que peor está.',
      ensfacilUsage:
        'EV-09 con ANTIGUEDAD_MAXIMA: mide contra el reloj, así que la antigüedad crece sola si las copias se paran.',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'EV-09 NO_EVALUABLE (causa CONFIGURATION) y op.exp.3.r3.1 no acredita.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.3',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos que acreditan un requisito que ninguna medida técnica puede demostrar, una fila por requisito con nombre del documento y enlace. Aquí solo op.exp.3.r1.1: que la configuración hardware/software de servidores, red y estaciones está AUTORIZADA y se mantiene.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.1'],
      type: 'table',
      example: 'op.exp.3.r1.1 | Línea base de configuración aprobada | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        {
          name: 'requisito',
          label: 'Requisito',
          type: 'identifier',
          required: true,
        },
        {
          name: 'referencia',
          label: 'Documento',
          type: 'string',
          required: true,
        },
        {
          name: 'enlace',
          label: 'Enlace(s)',
          type: 'string',
          required: true,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Declarado por',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Ningún agente lo lee: es la prueba documental de lo que la telemetría no alcanza.',
      ensfacilUsage:
        'Solo se aplica a requisitos sin evidencia técnica, por lo que nunca tapa una medida fallida. Se marca ATESTACION y se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.3.r1.1 queda sin acreditar y cuenta en contra en MEDIO y ALTO: lo que no se demuestra, no cumple.',
    },
  ],
};
