import { ENSControlConfiguration } from '../types';

export const mpEq3Configuration: ENSControlConfiguration = {
  controlId: 'mp.eq.3',
  controlName: 'Protección de dispositivos portátiles',
  family: 'Medidas de protección',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'mp.eq.3',
      name: 'inventario_dispositivos_portatiles',
      label: 'Inventario dispositivos portatiles',
      description:
        'Relación de dispositivos susceptibles de salir de las instalaciones con la persona responsable de cada uno. mp.eq.3.1 exige expresamente el inventario Y la identificación del responsable.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.1'],
      type: 'table',
      example: 'PRT-014 | portátil | J. Gómez | MEDIO',
      columns: [
        {
          name: 'dispositivo',
          label: 'Dispositivo',
          type: 'string',
          required: true,
        },
        {
          name: 'tipo',
          label: 'Tipo',
          type: 'string',
          required: false,
        },
        {
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: false,
        },
        {
          name: 'confidencialidad_de_la_info',
          label: 'Confidencialidad de la info',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil cruza este inventario con los agentes Wazuh detectados en equipos portátiles y señala tanto los declarados sin agente como los detectados sin entrada en el inventario. Comparte lógica con op.exp.1.',
      ensfacilUsage:
        'ENSFácil cruza este inventario con los agentes Wazuh detectados en equipos portátiles y señala tanto los declarados sin agente como los detectados sin entrada en el inventario. Comparte lógica con op.exp.1.',
      evidenceIds: ['EV-01', 'EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'El control es NO EVALUABLE. mp.eq.3.1 incumplido por ausencia del inventario que exige de forma expresa.',
    },
    {
      id: 'P-02',
      controlId: 'mp.eq.3',
      name: 'periodicidad_control_custodia_dias',
      label: 'Periodicidad control custodia dias',
      description:
        'Cada cuántos días debe confirmarse que cada dispositivo está positivamente bajo el control de su responsable. mp.eq.3.1 exige «un control regular» sin fijar periodicidad.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.1'],
      type: 'duration_days',
      example: '90',
      required: true,
      wazuhUsage:
        'ENSFácil registra cada confirmación de custodia y alerta al superarse P-02. Como señal complementaria, aporta la última conexión del agente: un dispositivo que no reporta desde hace semanas merece verificación activa de dónde está.',
      ensfacilUsage:
        'ENSFácil registra cada confirmación de custodia y alerta al superarse P-02. Como señal complementaria, aporta la última conexión del agente: un dispositivo que no reporta desde hace semanas merece verificación activa de dónde está.',
      evidenceIds: ['EV-01', 'EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede acreditar el control regular de custodia que exige mp.eq.3.1.',
    },
    {
      id: 'P-03',
      controlId: 'mp.eq.3',
      name: 'procedimiento_perdida_robo',
      label: 'Procedimiento perdida robo',
      description:
        'Referencia al procedimiento operativo de seguridad para informar al servicio de gestión de incidentes de pérdidas o sustracciones, exigido por mp.eq.3.2.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.2'],
      type: 'string',
      example: '«PR-09 Pérdida de dispositivos v1.2», con aviso a la cola ITSM «Seguridad»',
      required: true,
      wazuhUsage:
        'Referencia documental.',
      ensfacilUsage:
        'ENSFácil correlaciona los incidentes de pérdida registrados con las acciones posteriores: bloqueo remoto, borrado, revocación de credenciales del dispositivo.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'mp.eq.3.2 NO ACREDITADO. Riesgo de pérdidas no comunicadas y por tanto sin revocación de accesos.',
    },
    {
      id: 'P-04',
      controlId: 'mp.eq.3',
      name: 'perfil_acceso_remoto_portatiles',
      label: 'Perfil acceso remoto portatiles',
      description:
        'Información y servicios accesibles desde dispositivos portátiles conectados a través de redes no controladas, limitados a los mínimos imprescindibles, con la autorización de los responsables de la información y servicios afectados que mp.eq.3.3 exige.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.3'],
      type: 'table',
      example: 'correo e intranet | usuario estándar | Responsable de Seguridad | 2026-03-01',
      columns: [
        {
          name: 'servicio_accesible',
          label: 'Servicio accesible',
          type: 'string',
          required: true,
        },
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'string',
          required: false,
        },
        {
          name: 'autorizo',
          label: 'Autorizó',
          type: 'string',
          required: false,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil verifica en los logs de acceso remoto que desde dispositivos portátiles solo se alcanzan los servicios de esta tabla. Acceso a un servicio fuera del perfil → hallazgo. Enlaza con op.acc.4 y op.acc.6 R9.',
      ensfacilUsage:
        'ENSFácil verifica en los logs de acceso remoto que desde dispositivos portátiles solo se alcanzan los servicios de esta tabla. Acceso a un servicio fuera del perfil → hallazgo. Enlaza con op.acc.4 y op.acc.6 R9.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'mp.eq.3.3 NO EVALUABLE. No se puede verificar la limitación de información y servicios accesibles.',
    },
    {
      id: 'P-05',
      controlId: 'mp.eq.3',
      name: 'rutas_claves_acceso_remoto',
      label: 'Rutas claves acceso remoto',
      description:
        'Rutas y artefactos donde pueden residir claves de acceso remoto a la organización que mp.eq.3.4 pide evitar: claves SSH privadas, perfiles de VPN con credenciales, ficheros de configuración con secretos, almacenes de contraseñas del navegador.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.4'],
      // A list: the template asks for «Lista de rutas y patrones», one per line.
      type: 'list',
      example: '~/.ssh/id_*\n*.ovpn\n*.ppk\n*.pem',
      required: true,
      wazuhUsage:
        'FIM y Syscollector detectan la presencia de estos artefactos en los dispositivos de P-01. Es la comprobación de mayor valor del control y la que casi nunca se hace: la mayoría de los portátiles corporativos llevan claves que no deberían.',
      ensfacilUsage:
        'FIM y Syscollector detectan la presencia de estos artefactos en los dispositivos de P-01. Es la comprobación de mayor valor del control y la que casi nunca se hace: la mayoría de los portátiles corporativos llevan claves que no deberían.',
      evidenceIds: ['EV-03', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'mp.eq.3.4 NO EVALUABLE. Un dispositivo perdido puede dar acceso directo a la red corporativa.',
    },
    {
      id: 'P-06',
      controlId: 'mp.eq.3',
      name: 'cifrado_disco_exigido',
      label: 'Cifrado disco exigido',
      description:
        'Dispositivos que deben tener el disco cifrado y mecanismo empleado. R1 lo exige en categoría ALTA cuando la confidencialidad de la información almacenada sea de nivel MEDIO O SUPERIOR, de modo que el criterio de aplicación depende del contenido del dispositivo y no solo de la categoría del sistema.',
      levels: ['ALTO'],
      requirements: ['mp.eq.3.r1.1'],
      type: 'table',
      example: 'PRT-014 | MEDIO | sí | BitLocker',
      columns: [
        {
          name: 'dispositivo',
          label: 'Dispositivo',
          type: 'string',
          required: true,
        },
        {
          name: 'confidencialidad',
          label: 'Confidencialidad',
          type: 'string',
          required: false,
        },
        {
          name: 'cifrado_exigido',
          label: 'Cifrado exigido',
          type: 'string',
          required: false,
        },
        {
          name: 'mecanismo',
          label: 'Mecanismo',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'SCA verifica el estado real del cifrado en cada dispositivo.',
      ensfacilUsage:
        'ENSFácil marca como exigible todo dispositivo cuya confidencialidad declarada en P-01 sea MEDIA o ALTA, y contrasta con el estado efectivo.',
      evidenceIds: ['EV-04', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE. No se puede verificar el cifrado ni determinar a qué dispositivos resulta exigible.',
    },
    {
      id: 'P-07',
      controlId: 'mp.eq.3',
      name: 'normativa_entornos_protegidos',
      label: 'Normativa entornos protegidos',
      description:
        'Normativa que restringe el uso de dispositivos portátiles fuera de las instalaciones a entornos protegidos, con acceso controlado y a salvo de hurtos y miradas indiscretas, exigida por R2 en categoría ALTA.',
      levels: ['ALTO'],
      requirements: ['mp.eq.3.r2.1'],
      type: 'string',
      example: '«NT-04 Uso de dispositivos portátiles», con acuse de recepción del personal',
      required: false,
      wazuhUsage:
        'Es una norma de comportamiento, no una configuración: ENSFácil recoge la referencia y el registro de difusión y aceptación. Como señal indirecta, puede reportar los accesos desde redes y geografías inusuales, que sugieren uso en entornos no previstos.',
      ensfacilUsage:
        'Es una norma de comportamiento, no una configuración: ENSFácil recoge la referencia y el registro de difusión y aceptación. Como señal indirecta, puede reportar los accesos desde redes y geografías inusuales, que sugieren uso en entornos no previstos.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'R2 NO ACREDITADO y es obligatorio en categoría ALTA. Queda sin cubrir por ser de naturaleza normativa.',
    },
    {
      id: 'P-08',
      controlId: 'mp.eq.3',
      name: 'acciones_ante_perdida',
      label: 'Acciones ante perdida',
      description:
        'Acciones previstas al declararse la pérdida o sustracción de un dispositivo: bloqueo remoto, borrado, revocación de certificados y credenciales, cambio de contraseñas del usuario, invalidación de sesiones.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.2', 'mp.eq.3.4'],
      type: 'table',
      example: 'revocar el certificado de acceso remoto | 1 h | Responsable de Seguridad',
      columns: [
        {
          name: 'accion',
          label: 'Acción',
          type: 'string',
          required: true,
        },
        {
          name: 'plazo',
          label: 'Plazo',
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
        'ENSFácil verifica que cada incidente de pérdida fue seguido de estas acciones en plazo, correlacionando con los eventos de revocación de certificado, deshabilitación de cuenta y cierre de sesiones.',
      ensfacilUsage:
        'ENSFácil verifica que cada incidente de pérdida fue seguido de estas acciones en plazo, correlacionando con los eventos de revocación de certificado, deshabilitación de cuenta y cierre de sesiones.',
      evidenceIds: ['EV-03', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la reacción ante pérdida. El dispositivo perdido puede seguir teniendo acceso válido.',
    },
  ],
};
