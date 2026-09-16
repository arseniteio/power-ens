import { ENSControlConfiguration } from '../types';

// Parámetros de op.exp.3.
//
// `required` es deliberadamente escaso. Un obligatorio sin valor bloquea el
// control ENTERO (ningún requisito puede salir CUMPLE mientras falte), así que
// solo lo son los tres que sostienen la base en todas las categorías: la lista
// de servicios (P-02), quién puede editar la configuración (P-03) y qué
// configuración se vigila (P-04). Los de los refuerzos no lo son: si faltan, lo
// dice el juicio de su propia evidencia, con causa CONFIGURATION y nombrándolos,
// sin arrastrar a los requisitos base.
//
// Dos parámetros no están en la plantilla y salen de partir otros dos, porque un
// parámetro tiene UN tipo y el motor compara contra ese tipo:
//
//   P-09  el «nº máximo admitido» que la plantilla metía dentro de P-03 (lista +
//         umbral). La lista sigue en P-03; el umbral de R2 es P-09.
//   P-10  la «frecuencia» que la plantilla metía como celda de P-07. Ninguna
//         primitiva mide la antigüedad contra una celda de texto; P-07 queda
//         como declaración de alcance y destino, y el plazo medible es P-10.
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
        'Software cuya instalación está autorizada sobre la línea base aprobada: un paquete por línea, con el nombre exacto que usa el gestor de paquetes (nmap, postgresql-16). El agente emite cada paquete instalado de nuevo, y todo el que no figure aquí es un elemento no autorizado introducido en el sistema. Las dependencias automáticas no hace falta declararlas: llegan con el paquete que las trae. La línea base aprobada en sí (el documento) se acredita en P-ATT para op.exp.3.r1.1.',
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
        'Regla 110402 (software_installed). El agente lee dpkg.log y el historial de apt, y emite un hecho por paquete instalado de nuevo y pedido de forma explícita.',
      ensfacilUsage:
        'EV-03 con NINGUNO_FUERA_DE_LISTA: todo paquete introducido tiene que figurar en esta lista. Sin instalaciones en la ventana y con el recolector confirmando que leyó el registro, cumple.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'EV-03 NO_EVALUABLE (causa CONFIGURATION): sin la lista de software autorizado no se puede decidir si lo instalado estaba autorizado, y op.exp.3.r1.2 no acredita.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.3',
      name: 'lista_servicios_autorizados',
      label: 'Servicios autorizados por perfil',
      description:
        'Una fila por perfil de máquina con los servicios que tiene autorizados, separados por comas y escritos como los emite el agente: unidades de systemd (ssh.service, cron.service; las instancias como getty@.service) y procesos que escuchan en red fuera de systemd (proceso:nombre). El perfil es, por defecto, el nombre corto del host; varias máquinas pueden compartir perfil fijando OPEXP3_PERFIL en su .env. Puede coincidir con la lista de op.exp.2; aquí se usa para demostrar que se MANTIENE.',
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
          // `multiselect` sin opciones: la celda se parte por comas y el
          // servicio observado tiene que estar ENTRE los declarados. Opciones
          // cerradas no tienen sentido aquí: cada máquina tiene los suyos.
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
        'EV-04 con CONFORME_A_TABLA: cada servicio observado tiene que estar en la celda de su perfil. Un perfil sin fila no es un incumplimiento, es una decisión sin escribir: NO_EVALUABLE con causa CONFIGURATION.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'EV-04 NO_EVALUABLE: op.exp.3.1 y op.exp.3.r1.3 no acreditan. Además bloquea el control: es obligatorio.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.3',
      name: 'administradores_configuracion',
      label: 'Cuentas autorizadas a editar la configuración de seguridad',
      description:
        'Cuentas autorizadas a editar la configuración de seguridad, una por línea y tal como las emite el agente: la cuenta de la sesión que hizo el cambio aunque pasara por sudo (dioni, no root). Los cambios sin sesión (un paquete que se actualiza, un servicio) llegan con la cuenta del proceso, normalmente root: declararla aquí acepta esos cambios, y no declararla los deja como hallazgo para que se revisen. En un servidor LDAP, las identidades del directorio que cambian cn=config van por su RDN (cn=config, gidNumber=0+uidNumber=0). La comparación es literal y distingue mayúsculas.',
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
        'Regla 110401 (config_file_modified). El agente lee auditd y emite cada edición de las rutas vigiladas con su actor, la operación, el proceso y el intervalo en que ocurrió.',
      ensfacilUsage:
        'EV-02 con NINGUNO_FUERA_DE_LISTA: ningún actor observado puede quedar fuera de esta lista. Sin ediciones y con el recolector confirmando que todas las rutas estaban vigiladas, cumple.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.3.6 NO EVALUABLE: no se puede distinguir un cambio legítimo de uno no autorizado. Además bloquea el control: es obligatorio.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.3',
      name: 'rutas_configuracion_seguridad',
      label: 'Rutas de la configuración de seguridad',
      description:
        'Ficheros y directorios que contienen la configuración de seguridad y se vigilan con auditd, una ruta absoluta por línea. Tienen que ser las mismas que declara el fichero de reglas de auditd del runbook (/etc/audit/rules.d/ensfacil-opexp3.rules): lo que se declara aquí y lo que se vigila allí son las dos mitades de EV-02. El agente comprueba ruta a ruta que el kernel la vigila en escritura; el motor no puede comprobar que coincidan con esta lista, así que mantenerlas iguales es responsabilidad de quien las declara.',
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
        'Plantilla de reglas de auditd del runbook (clave ensfacil_opexp3_cfg). Es la política escrita de qué se vigila; ninguna primitiva la contrasta contra un hecho.',
      ensfacilUsage:
        'Documental: dice al auditor qué configuración se considera de seguridad. El juicio de EV-02 se hace contra P-03.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No queda escrito qué se considera configuración de seguridad. Bloquea el control: es obligatorio.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.3',
      name: 'periodicidad_verificacion_config_dias',
      label: 'Periodicidad de la verificación de la configuración (días)',
      description:
        'Cada cuántos días debe hacerse, como mucho, una verificación formal de la configuración hardware/software frente a la línea base aprobada (op.exp.3.r1.2). El ENS exige verificación «periódica» sin fijar plazo. La verificación la anota la organización en el registro del runbook (opexp3-verificaciones.tsv).',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.3.r1.2'],
      type: 'duration_days',
      example: '90',
      required: false,
      wazuhUsage:
        'Regla 110406 (baseline_verification_performed): la verificación más reciente anotada, con su fecha.',
      ensfacilUsage:
        'EV-11 con ANTIGUEDAD_MAXIMA: la verificación más reciente no puede ser más antigua que este plazo. Sin ninguna verificación anotada no cumple nunca.',
      evidenceIds: ['EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'EV-11 NO_EVALUABLE (causa CONFIGURATION) y op.exp.3.r1.2 no acredita. No se aplica ningún plazo por defecto: el motor no juzga contra un valor que nadie ha declarado.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.3',
      name: 'procedimiento_autorizacion_cambios',
      label: 'Procedimiento de autorización de cambios',
      description:
        'Referencia al procedimiento de autorización previa de cambios de configuración y al sistema de gestión de cambios donde se aprueban (Jira, GLPI, ServiceNow). op.exp.3.3 exige que cada cambio esté previamente autorizado, y eso solo se puede medir correlacionando cada edición que registra EV-02 con su cambio aprobado. Esa integración no existe todavía en ENSFácil: mientras tanto este parámetro deja escrita la referencia, pero no desbloquea ninguna medida.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.3.3'],
      type: 'string',
      example: 'PR-15 Gestión de cambios en GLPI',
      required: false,
      wazuhUsage:
        'Ninguna regla hoy. El agente declara EV-05 NO_EVALUABLE con causa COLLECTION porque no hay integración con el sistema de gestión de cambios.',
      ensfacilUsage:
        'Documental hasta que exista la integración con el ITSM. No se juzga contra nada.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'No queda escrita la referencia al procedimiento. op.exp.3.3 sigue sin evidenciar mientras no haya integración, esté o no configurado.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.3',
      name: 'config_backup_destino',
      label: 'Alcance y destino de las copias de la configuración',
      description:
        'Qué configuración se copia y adónde, una fila por alcance, para permitir la reconstrucción tras un incidente (R3). Es la declaración que lee el auditor; el plazo medible es P-10, y dónde busca el agente las copias en cada máquina se ajusta en su .env (OPEXP3_COPIAS_CONFIG).',
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
        'Documental: ninguna primitiva lo contrasta contra un hecho.',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'No queda escrito dónde se copian las configuraciones. No bloquea el juicio de EV-09, que se hace contra P-10.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.3',
      name: 'umbral_desviacion_baseline',
      label: 'Umbral de desviación admitido (%)',
      description:
        'Grado de desviación respecto a la línea base que se considera aceptable. Se declara porque es la política escrita, pero hoy ninguna primitiva lo aplica: EV-03 juzga con tolerancia cero (todo paquete introducido tiene que estar autorizado en P-01), que es el extremo estricto. Un porcentaje exigiría conocer la línea base completa paquete a paquete, y eso no es lo que se declara.',
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
        'Documental. El juicio de EV-03 es de tolerancia cero.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto sobre el juicio: se aplica tolerancia cero en cualquier caso.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.3',
      name: 'max_administradores_configuracion',
      label: 'Máximo de administradores efectivos de la configuración',
      description:
        'Número máximo de cuentas distintas que pueden editar de verdad la configuración de seguridad en la ventana de observación (30 días por defecto). Es el «número muy limitado» que exige R2 en categoría ALTA. Se cuenta lo que ocurre, no lo que está autorizado: una cuenta autorizada en P-03 que no edita nada no suma.',
      levels: ['ALTO'],
      requirements: ['op.exp.3.r2.1'],
      type: 'number',
      example: '3',
      minValue: 1,
      required: false,
      wazuhUsage:
        'Regla 110404 (config_admins_observed): cuántas cuentas han editado la configuración en la ventana, emitido solo cuando la ventana entera se ha observado sin huecos.',
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
        'Horas que puede tener, como mucho, la copia más reciente de la configuración para que el sistema se considere reconstruible (R3). Con varios alcances cuenta el que peor está. Es la frecuencia de P-07 expresada como plazo: 24 para una copia diaria, 168 para una semanal.',
      levels: ['ALTO'],
      requirements: ['op.exp.3.r3.1'],
      type: 'duration_hours',
      example: '24',
      required: false,
      wazuhUsage:
        'Regla 110405 (config_backup_observed): el instante de la copia más reciente del alcance que peor está.',
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
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control solo hay uno: op.exp.3.r1.1, que la configuración hardware/software de servidores, elementos de red y estaciones está AUTORIZADA y se mantiene. Eso lo dice un documento aprobado, no una máquina.',
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
        'No lo lee ningún agente: es la prueba documental de lo que la telemetría no alcanza.',
      ensfacilUsage:
        'ENSFácil lo aplica SOLO a los requisitos que el catálogo declara sin ninguna evidencia técnica, así que una atestación nunca puede tapar una medida que ha fallado. El resultado se marca ATESTACION y en pantalla se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.3.r1.1 queda sin acreditar y cuenta en contra en MEDIO y ALTO: lo que no se puede demostrar, no cumple.',
    },
  ],
};
