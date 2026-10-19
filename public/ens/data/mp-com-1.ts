import { ENSControl } from '../types';

export const mpCom1Control: ENSControl = {
  id: 'mp.com.1',
  title: 'Perímetro seguro',
  framework: 'ENS',
  category: 'Protección de las comunicaciones',
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
        'mp.com.1 → Requisitos base: mp.com.1.1 + mp.com.1.2',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.com.1 → Ídem categoría BÁSICA.',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.com.1 → Ídem categoría BÁSICA. Sin refuerzos. La concreción técnica la aporta la ITS de Interconexión.',
    },
  },
  requirements: [
    {
      id: 'mp.com.1.1',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Perímetro que separa la red interna y por el que pasa todo el tráfico',
      description:
        'Se dispondrá de un sistema de protección perimetral que separe la red interna del exterior. Todo el tráfico deberá atravesar dicho sistema.',
      evidences: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-07', 'EV-08'],
    },
    {
      id: 'mp.com.1.2',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      title: 'Flujos a través del perímetro autorizados previamente',
      description:
        'Todos los flujos de información a través del perímetro deben estar autorizados previamente.',
      evidences: ['EV-01', 'EV-02', 'EV-06', 'EV-07', 'EV-08'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.com.1.1', 'mp.com.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Ingesta de los registros del sistema de protección perimetral',
      description:
        'Recolección de los registros de los elementos de P-01: conexiones aceptadas y denegadas, con origen, destino, protocolo, puerto y regla aplicada. Es la base de todo el control: sin registros del perímetro no hay forma de acreditar qué flujos pasan.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.com.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Flujos observados frente a flujos autorizados',
      description:
        'Contraste entre los flujos que efectivamente atraviesan el perímetro y el registro de flujos autorizados de P-02. Un flujo que pasa sin autorización previa registrada incumple mp.com.1.2 de forma directa, con independencia de que la regla del cortafuegos exista.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.com.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Interfaces de red no previstas en los sistemas',
      description:
        'Detección de adaptadores de red adicionales, interfaces virtuales, conexiones inalámbricas activas o módems en los sistemas del alcance, que constituyan una vía por la que el tráfico no atraviese el perímetro. Es la verificación directa del «todo el tráfico» de mp.com.1.1.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.com.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Rutas y salidas alternativas a redes externas',
      description:
        'Identificación de rutas por defecto hacia destinos distintos del perímetro previsto y de conexiones salientes que no aparecen en los registros del perímetro, lo que evidencia una vía de elusión.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.com.1.1'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Túneles y canales de evasión del perímetro',
      description:
        'Detección de túneles salientes, clientes VPN no corporativos, software de acceso remoto inverso y servicios de tunelización que permiten eludir el perímetro desde dentro, lo que vulnera mp.com.1.1 aunque el cortafuegos esté perfectamente configurado.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-06',
      requirement: ['mp.com.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Reglas del perímetro sin uso y reglas permisivas',
      description:
        'Identificación de flujos autorizados en P-02 sin tráfico observado en el período —candidatos a retirada— y de patrones de regla excesivamente permisiva según P-05. Da soporte a la revisión periódica de P-04.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-07',
      requirement: ['mp.com.1.1', 'mp.com.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Servicios de administración expuestos al exterior',
      description:
        'Detección de tráfico entrante desde redes externas hacia puertos de administración —SSH, RDP, paneles web, bases de datos—, que evidencia una exposición perimetral que rara vez está autorizada de forma consciente.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['mp.com.1.1', 'mp.com.1.2'],
      level: ['BAJO', 'MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Continuidad del registro del perímetro',
      description:
        'Verificación de que los registros de todos los elementos de P-01 llegan de forma continua, sin lagunas. Un período sin registros del perímetro es un período sin acreditación posible de qué flujos pasaron, y es además el escenario en que un cambio de reglas pasa inadvertido.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'elementos_perimetrales',
      description:
        'Elementos que constituyen el sistema de protección perimetral: cortafuegos, pasarelas, proxies inversos, concentradores VPN, con su ubicación en la topología y su forma de enviar registros a Wazuh.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.1'],
      type: 'table',
      usage:
        'Define de qué fuentes ingiere Wazuh los registros del perímetro. Sin ellos no hay forma de verificar qué flujos pasan, y el control queda sin evidencia más allá de la declaración de que el cortafuegos existe.',
      missingBehavior:
        'El control es NO EVALUABLE. No hay registros del perímetro y mp.com.1.2 queda sin verificación posible.',
    },
    {
      id: 'P-02',
      name: 'flujos_autorizados_perimetro',
      description:
        'Registro de los flujos de información autorizados a través del perímetro, con origen, destino, protocolo, puerto, quién lo autorizó y cuándo. mp.com.1.2 exige autorización PREVIA, de modo que este registro es la evidencia del requisito.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.2'],
      type: 'table',
      usage:
        'ENSFácil contrasta los flujos observados en los registros del perímetro con este registro. Flujo que pasa sin estar autorizado → hallazgo directo de mp.com.1.2. Es la comprobación central del control.',
      missingBehavior:
        'mp.com.1.2 NO EVALUABLE. Se ven los flujos pero no se puede juzgar si están autorizados.',
    },
    {
      id: 'P-03',
      name: 'salidas_a_red_externa_previstas',
      description:
        'Puntos de salida a redes externas que deben existir según la topología, con su elemento perimetral asociado. Es la referencia para detectar vías de elusión: toda salida no incluida aquí es una vía por la que el tráfico no atraviesa el perímetro.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.1'],
      type: 'table',
      usage:
        'ENSFácil detecta interfaces de red, rutas por defecto y conexiones salientes que no corresponden a estas salidas previstas. Es la verificación del «todo el tráfico deberá atravesar dicho sistema», que es la parte del requisito que suele darse por buena sin comprobar.',
      missingBehavior:
        'No se puede verificar que todo el tráfico atraviesa el perímetro. mp.com.1.1 acreditado solo parcialmente.',
    },
    {
      id: 'P-04',
      name: 'periodicidad_revision_reglas_dias',
      description:
        'Cada cuánto deben revisarse las reglas del perímetro para detectar reglas obsoletas, redundantes o excesivamente permisivas. El ENS no lo fija en mp.com.1, pero un conjunto de reglas sin revisar acumula autorizaciones que ya nadie recuerda por qué están.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.2'],
      type: 'duration_days',
      usage:
        'ENSFácil registra las revisiones y alerta al superarse P-04. Puede además señalar reglas de P-02 sin tráfico observado en el período, que son candidatas a retirada, y reglas con tráfico no previsto en P-02.',
      missingBehavior:
        'Las reglas del perímetro envejecen sin control. Riesgo de autorizaciones vigentes sin justificación actual.',
    },
    {
      id: 'P-05',
      name: 'reglas_permisivas_prohibidas',
      description:
        'Patrones de regla que se consideran inadmisibles en el perímetro: origen o destino «cualquiera» con destino interno, servicios de administración expuestos, protocolos en claro hacia el exterior.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.1', 'mp.com.1.2'],
      type: 'list',
      usage:
        'ENSFácil analiza la configuración del perímetro cuando esté accesible, y en todo caso detecta el tráfico que evidencia estas reglas. Una regla permisiva no es incumplimiento por sí misma si el flujo está autorizado, pero suele indicar que la autorización fue genérica y no previa y concreta.',
      missingBehavior:
        'No se detectan reglas excesivamente permisivas. El perímetro puede existir y filtrar muy poco.',
    },
    {
      id: 'P-06',
      name: 'referencia_its_interconexion',
      description:
        'Referencia a la Instrucción Técnica de Seguridad de Interconexión de Sistemas de Información aplicable y a los requisitos que de ella se derivan para la categoría del sistema. El propio texto de mp.com.1 remite a ella de forma expresa.',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1'],
      type: 'string',
      usage:
        'ENSFácil recoge la referencia y los requisitos concretos que de ella se derivan, para incorporarlos a las comprobaciones. Es importante porque la medida se aplica igual en las tres categorías, pero la ITS sí diferencia requisitos por categoría.',
      missingBehavior:
        'La concreción técnica del perímetro queda sin referencia normativa. Riesgo de aplicar un mínimo genérico.',
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
