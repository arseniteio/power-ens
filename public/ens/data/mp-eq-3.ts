import { ENSControl } from '../types';

export const mpEq3Control: ENSControl = {
  id: 'mp.eq.3',
  title: 'Protección de dispositivos portátiles',
  framework: 'ENS',
  category: 'Protección de los equipos',
  family: 'Medidas de protección',
  dimension: 'Todas',
  scope: {
    activeLevels: ['BAJO', 'MEDIO', 'ALTO'],
    declaredLevels: ['BAJO', 'MEDIO', 'ALTO'],
    highLevelStatus: 'NO_EVALUABLE',
  },
  expectedResult: {
    bajo: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.eq.3 → Requisitos base: mp.eq.3.1 a mp.eq.3.4',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.eq.3 → Ídem categoría BÁSICA.',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.eq.3 + R1 + R2 → Base + cifrado de disco + uso restringido a entornos protegidos',
    },
  },
  requirements: [
    {
      id: 'mp.eq.3.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Inventario de portátiles con responsable y control de custodia',
      description:
        'Se llevará un inventario de dispositivos portátiles junto con una identificación de la persona responsable de cada uno de ellos y un control regular de que está positivamente bajo su control.',
      evidences: ['EV-01', 'EV-02'],
    },
    {
      id: 'mp.eq.3.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Procedimiento de aviso de pérdidas o sustracciones',
      description:
        'Se establecerá un procedimiento operativo de seguridad para informar al servicio de gestión de incidentes de pérdidas o sustracciones.',
      evidences: ['EV-06'],
    },
    {
      id: 'mp.eq.3.3',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Acceso remoto limitado a lo imprescindible y autorizado',
      description:
        'Cuando un dispositivo portátil se conecte remotamente a través de redes que no están bajo el estricto control de la organización, el ámbito de operación del servidor limitará la información y los servicios accesibles a los mínimos imprescindibles, requiriendo autorización previa de los responsables de la información y los servicios afectados. Este punto es de aplicación a conexiones a través de internet y otras redes que no sean de confianza.',
      evidences: ['EV-05'],
    },
    {
      id: 'mp.eq.3.4',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Sin claves de acceso remoto prescindibles en el portátil',
      description:
        'Se evitará, en la medida de lo posible, que el dispositivo portátil contenga claves de acceso remoto a la organización que no sean imprescindibles. Se considerarán claves de acceso remoto aquellas que sean capaces de habilitar un acceso a otros equipos de la organización u otras de naturaleza análoga.',
      evidences: ['EV-03', 'EV-06'],
    },
    {
      id: 'mp.eq.3.r1.1',
      level: ['ALTO'],
      title: 'Cifrado del disco con información de nivel MEDIO o superior',
      description:
        'Se protegerá el dispositivo portátil mediante cifrado del disco duro cuando el nivel de confidencialidad de la información almacenada en el mismo sea de nivel MEDIO.',
      evidences: ['EV-04', 'EV-08'],
      active: false,
    },
    {
      id: 'mp.eq.3.r2.1',
      level: ['ALTO'],
      title: 'Uso fuera de las instalaciones solo en entornos protegidos',
      description:
        'El uso de dispositivos portátiles fuera de las instalaciones de la organización se restringirá a entornos protegidos, donde el acceso sea controlado y a salvo de hurtos y miradas indiscretas.',
      evidences: ['EV-07'],
      active: false,
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.eq.3.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Inventario de dispositivos portátiles con su responsable',
      description:
        'Contraste entre el inventario declarado en P-01 y los equipos portátiles efectivamente detectados por Syscollector —identificables por chasis, presencia de batería y modelo—, verificando que cada uno tiene responsable asignado. mp.eq.3.1 exige inventario Y responsable.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.eq.3.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Señal de vida y control de custodia',
      description:
        'Última conexión de cada dispositivo portátil y tiempo transcurrido, como señal complementaria al control regular de custodia que exige mp.eq.3.1. Un dispositivo que no reporta durante semanas merece verificación activa de su paradero.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.eq.3.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Claves de acceso remoto almacenadas en el dispositivo',
      description:
        'Detección de la presencia de claves de acceso remoto a la organización en los dispositivos portátiles: claves SSH privadas, perfiles de VPN con credenciales incrustadas, ficheros con secretos, almacenes de contraseñas. mp.eq.3.4 pide expresamente evitarlas.',
      format: 'fim_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.eq.3.r1.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Estado del cifrado del disco (R1)',
      description:
        'Verificación de que el cifrado de disco está activo en los dispositivos a los que resulta exigible según P-06, con el mecanismo y el estado de protección de la clave de recuperación. R1 es obligatorio en categoría ALTA para los dispositivos que almacenen información de confidencialidad MEDIA o ALTA.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-05',
      requirement: ['mp.eq.3.3'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Servicios accesibles en conexiones desde dispositivos portátiles',
      description:
        'Verificación de que las conexiones remotas desde dispositivos portátiles a través de redes no controladas solo alcanzan la información y servicios del perfil autorizado en P-04. mp.eq.3.3 exige limitarlos a los mínimos imprescindibles.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['mp.eq.3.2', 'mp.eq.3.4'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Reacción ante pérdida o sustracción',
      description:
        'Verificación de que cada incidente de pérdida registrado fue seguido de las acciones de P-08 en plazo: revocación de certificados, deshabilitación de cuentas, cierre de sesiones, borrado o bloqueo remoto.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['mp.eq.3.r2.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Patrones de uso en entornos no previstos',
      description:
        'Señal indirecta para R2: accesos desde geografías, rangos de direcciones o redes inusuales que sugieren uso del dispositivo fuera de los entornos protegidos previstos. No acredita R2 —que es normativo— pero aporta información útil al responsable.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-08',
      requirement: ['mp.eq.3.r1.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Configuración de seguridad específica de los portátiles',
      description:
        'Verificación de los ajustes que reducen el impacto de una pérdida más allá del cifrado: arranque seguro habilitado, contraseña de BIOS/UEFI, arranque desde medios externos deshabilitado, bloqueo de puerto de depuración. Complementa el requisito general de protección adecuada del enunciado.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'inventario_dispositivos_portatiles',
      description:
        'Relación de dispositivos susceptibles de salir de las instalaciones con la persona responsable de cada uno. mp.eq.3.1 exige expresamente el inventario Y la identificación del responsable.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.1'],
      type: 'table',
      usage:
        'ENSFácil cruza este inventario con los agentes Wazuh detectados en equipos portátiles y señala tanto los declarados sin agente como los detectados sin entrada en el inventario. Comparte lógica con op.exp.1.',
      missingBehavior:
        'El control es NO EVALUABLE. mp.eq.3.1 incumplido por ausencia del inventario que exige de forma expresa.',
    },
    {
      id: 'P-02',
      name: 'periodicidad_control_custodia_dias',
      description:
        'Cada cuántos días debe confirmarse que cada dispositivo está positivamente bajo el control de su responsable. mp.eq.3.1 exige «un control regular» sin fijar periodicidad.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.1'],
      type: 'duration_days',
      usage:
        'ENSFácil registra cada confirmación de custodia y alerta al superarse P-02. Como señal complementaria, aporta la última conexión del agente: un dispositivo que no reporta desde hace semanas merece verificación activa de dónde está.',
      missingBehavior:
        'No se puede acreditar el control regular de custodia que exige mp.eq.3.1.',
    },
    {
      id: 'P-03',
      name: 'procedimiento_perdida_robo',
      description:
        'Referencia al procedimiento operativo de seguridad para informar al servicio de gestión de incidentes de pérdidas o sustracciones, exigido por mp.eq.3.2.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.2'],
      type: 'string',
      usage:
        'Referencia documental.',
      missingBehavior:
        'mp.eq.3.2 NO ACREDITADO. Riesgo de pérdidas no comunicadas y por tanto sin revocación de accesos.',
    },
    {
      id: 'P-04',
      name: 'perfil_acceso_remoto_portatiles',
      description:
        'Información y servicios accesibles desde dispositivos portátiles conectados a través de redes no controladas, limitados a los mínimos imprescindibles, con la autorización de los responsables de la información y servicios afectados que mp.eq.3.3 exige.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.3'],
      type: 'table',
      usage:
        'ENSFácil verifica en los logs de acceso remoto que desde dispositivos portátiles solo se alcanzan los servicios de esta tabla. Acceso a un servicio fuera del perfil → hallazgo. Enlaza con op.acc.4 y op.acc.6 R9.',
      missingBehavior:
        'mp.eq.3.3 NO EVALUABLE. No se puede verificar la limitación de información y servicios accesibles.',
    },
    {
      id: 'P-05',
      name: 'rutas_claves_acceso_remoto',
      description:
        'Rutas y artefactos donde pueden residir claves de acceso remoto a la organización que mp.eq.3.4 pide evitar: claves SSH privadas, perfiles de VPN con credenciales, ficheros de configuración con secretos, almacenes de contraseñas del navegador.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.4'],
      type: 'path',
      usage:
        'FIM y Syscollector detectan la presencia de estos artefactos en los dispositivos de P-01. Es la comprobación de mayor valor del control y la que casi nunca se hace: la mayoría de los portátiles corporativos llevan claves que no deberían.',
      missingBehavior:
        'mp.eq.3.4 NO EVALUABLE. Un dispositivo perdido puede dar acceso directo a la red corporativa.',
    },
    {
      id: 'P-06',
      name: 'cifrado_disco_exigido',
      description:
        'Dispositivos que deben tener el disco cifrado y mecanismo empleado. R1 lo exige en categoría ALTA cuando la confidencialidad de la información almacenada sea de nivel MEDIO O SUPERIOR, de modo que el criterio de aplicación depende del contenido del dispositivo y no solo de la categoría del sistema.',
      level: ['ALTO'],
      requirements: ['mp.eq.3.r1.1'],
      type: 'table',
      usage:
        'SCA verifica el estado real del cifrado en cada dispositivo.',
      missingBehavior:
        'R1 NO EVALUABLE. No se puede verificar el cifrado ni determinar a qué dispositivos resulta exigible.',
    },
    {
      id: 'P-07',
      name: 'normativa_entornos_protegidos',
      description:
        'Normativa que restringe el uso de dispositivos portátiles fuera de las instalaciones a entornos protegidos, con acceso controlado y a salvo de hurtos y miradas indiscretas, exigida por R2 en categoría ALTA.',
      level: ['ALTO'],
      requirements: ['mp.eq.3.r2.1'],
      type: 'string',
      usage:
        'Es una norma de comportamiento, no una configuración: ENSFácil recoge la referencia y el registro de difusión y aceptación. Como señal indirecta, puede reportar los accesos desde redes y geografías inusuales, que sugieren uso en entornos no previstos.',
      missingBehavior:
        'R2 NO ACREDITADO y es obligatorio en categoría ALTA. Queda sin cubrir por ser de naturaleza normativa.',
    },
    {
      id: 'P-08',
      name: 'acciones_ante_perdida',
      description:
        'Acciones previstas al declararse la pérdida o sustracción de un dispositivo: bloqueo remoto, borrado, revocación de certificados y credenciales, cambio de contraseñas del usuario, invalidación de sesiones.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.eq.3.2', 'mp.eq.3.4'],
      type: 'table',
      usage:
        'ENSFácil verifica que cada incidente de pérdida fue seguido de estas acciones en plazo, correlacionando con los eventos de revocación de certificado, deshabilitación de cuenta y cierre de sesiones.',
      missingBehavior:
        'No se puede verificar la reacción ante pérdida. El dispositivo perdido puede seguir teniendo acceso válido.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot'],
  presentationRules: {
    auditorSees: [
      'control ENS',
      'evidence ID',
      'description',
      'level',
      'status',
      'score',
      'finding',
    ],
    internalTraceability: [
      'wazuh rule.id',
      'technical event',
      'agent',
      'timestamp',
    ],
    neverShowAsControls: ['rule id as control'],
  },
};
