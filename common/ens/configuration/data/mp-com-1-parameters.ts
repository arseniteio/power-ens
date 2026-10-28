import { ENSControlConfiguration } from '../types';

export const mpCom1Configuration: ENSControlConfiguration = {
  controlId: 'mp.com.1',
  controlName: 'Perímetro seguro',
  family: 'Medidas de protección',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'mp.com.1',
      name: 'elementos_perimetrales',
      label: 'Elementos perimetrales',
      description:
        'Elementos que constituyen el sistema de protección perimetral: cortafuegos, pasarelas, proxies inversos, concentradores VPN, con su ubicación en la topología y su forma de enviar registros a Wazuh.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.1'],
      type: 'table',
      example: 'fw-perim01 | cortafuegos | DMZ norte | syslog 514',
      columns: [
        {
          name: 'elemento',
          label: 'Elemento',
          type: 'string',
          required: true,
        },
        {
          name: 'funcion',
          label: 'Función',
          type: 'string',
          required: false,
        },
        {
          name: 'ubicacion',
          label: 'Ubicación',
          type: 'string',
          required: false,
        },
        {
          name: 'log',
          label: 'Log',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Define de qué fuentes ingiere Wazuh los registros del perímetro. Sin ellos no hay forma de verificar qué flujos pasan, y el control queda sin evidencia más allá de la declaración de que el cortafuegos existe.',
      powerEnsUsage:
        'Define de qué fuentes ingiere Wazuh los registros del perímetro. Sin ellos no hay forma de verificar qué flujos pasan, y el control queda sin evidencia más allá de la declaración de que el cortafuegos existe.',
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'El control es NO EVALUABLE. No hay registros del perímetro y mp.com.1.2 queda sin verificación posible.',
    },
    {
      id: 'P-02',
      controlId: 'mp.com.1',
      name: 'flujos_autorizados_perimetro',
      label: 'Flujos autorizados perimetro',
      description:
        'Registro de los flujos de información autorizados a través del perímetro, con origen, destino, protocolo, puerto, quién lo autorizó y cuándo. mp.com.1.2 exige autorización PREVIA, de modo que este registro es la evidencia del requisito.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.2'],
      type: 'table',
      example: 'DMZ web | BD interna | TCP | 3306 | Responsable de Seguridad | 2026-02-01',
      columns: [
        {
          name: 'origen',
          label: 'Origen',
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
          name: 'protocolo',
          label: 'Protocolo',
          type: 'string',
          required: false,
        },
        {
          name: 'puerto',
          label: 'Puerto',
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
        'Power ENS contrasta los flujos observados en los registros del perímetro con este registro. Flujo que pasa sin estar autorizado → hallazgo directo de mp.com.1.2. Es la comprobación central del control.',
      powerEnsUsage:
        'Power ENS contrasta los flujos observados en los registros del perímetro con este registro. Flujo que pasa sin estar autorizado → hallazgo directo de mp.com.1.2. Es la comprobación central del control.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-06', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'mp.com.1.2 NO EVALUABLE. Se ven los flujos pero no se puede juzgar si están autorizados.',
    },
    {
      id: 'P-03',
      controlId: 'mp.com.1',
      name: 'salidas_a_red_externa_previstas',
      label: 'Salidas a red externa previstas',
      description:
        'Puntos de salida a redes externas que deben existir según la topología, con su elemento perimetral asociado. Es la referencia para detectar vías de elusión: toda salida no incluida aquí es una vía por la que el tráfico no atraviesa el perímetro.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.1'],
      type: 'table',
      example: 'enlace principal | fw-perim01 | tráfico general',
      columns: [
        {
          name: 'salida',
          label: 'Salida',
          type: 'string',
          required: true,
        },
        {
          name: 'elemento',
          label: 'Elemento',
          type: 'string',
          required: false,
        },
        {
          name: 'uso',
          label: 'Uso',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Power ENS detecta interfaces de red, rutas por defecto y conexiones salientes que no corresponden a estas salidas previstas. Es la verificación del «todo el tráfico deberá atravesar dicho sistema», que es la parte del requisito que suele darse por buena sin comprobar.',
      powerEnsUsage:
        'Power ENS detecta interfaces de red, rutas por defecto y conexiones salientes que no corresponden a estas salidas previstas. Es la verificación del «todo el tráfico deberá atravesar dicho sistema», que es la parte del requisito que suele darse por buena sin comprobar.',
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-05', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar que todo el tráfico atraviesa el perímetro. mp.com.1.1 acreditado solo parcialmente.',
    },
    {
      id: 'P-04',
      controlId: 'mp.com.1',
      name: 'periodicidad_revision_reglas_dias',
      label: 'Periodicidad revision reglas dias',
      description:
        'Cada cuánto deben revisarse las reglas del perímetro para detectar reglas obsoletas, redundantes o excesivamente permisivas. El ENS no lo fija en mp.com.1, pero un conjunto de reglas sin revisar acumula autorizaciones que ya nadie recuerda por qué están.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.2'],
      type: 'duration_days',
      example: '180',
      required: true,
      wazuhUsage:
        'Power ENS registra las revisiones y alerta al superarse P-04. Puede además señalar reglas de P-02 sin tráfico observado en el período, que son candidatas a retirada, y reglas con tráfico no previsto en P-02.',
      powerEnsUsage:
        'Power ENS registra las revisiones y alerta al superarse P-04. Puede además señalar reglas de P-02 sin tráfico observado en el período, que son candidatas a retirada, y reglas con tráfico no previsto en P-02.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-06', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'Las reglas del perímetro envejecen sin control. Riesgo de autorizaciones vigentes sin justificación actual.',
    },
    {
      id: 'P-05',
      controlId: 'mp.com.1',
      name: 'reglas_permisivas_prohibidas',
      label: 'Reglas permisivas prohibidas',
      description:
        'Patrones de regla que se consideran inadmisibles en el perímetro: origen o destino «cualquiera» con destino interno, servicios de administración expuestos, protocolos en claro hacia el exterior.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.1', 'mp.com.1.2'],
      type: 'list',
      example: 'any → red interna en cualquier puerto\nRDP o SSH expuestos a internet\ntelnet/FTP/SMBv1 salientes',
      required: true,
      wazuhUsage:
        'Power ENS analiza la configuración del perímetro cuando esté accesible, y en todo caso detecta el tráfico que evidencia estas reglas. Una regla permisiva no es incumplimiento por sí misma si el flujo está autorizado, pero suele indicar que la autorización fue genérica y no previa y concreta.',
      powerEnsUsage:
        'Power ENS analiza la configuración del perímetro cuando esté accesible, y en todo caso detecta el tráfico que evidencia estas reglas. Una regla permisiva no es incumplimiento por sí misma si el flujo está autorizado, pero suele indicar que la autorización fue genérica y no previa y concreta.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'No se detectan reglas excesivamente permisivas. El perímetro puede existir y filtrar muy poco.',
    },
    {
      id: 'P-06',
      controlId: 'mp.com.1',
      name: 'referencia_its_interconexion',
      label: 'Referencia its interconexion',
      description:
        'Referencia a la Instrucción Técnica de Seguridad de Interconexión de Sistemas de Información aplicable y a los requisitos que de ella se derivan para la categoría del sistema. El propio texto de mp.com.1 remite a ella de forma expresa.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.com.1.1', 'mp.com.1.2'],
      type: 'string',
      example: 'ITS de Interconexión de Sistemas de Información: requisitos del perímetro para la categoría MEDIA',
      required: true,
      wazuhUsage:
        'Power ENS recoge la referencia y los requisitos concretos que de ella se derivan, para incorporarlos a las comprobaciones. Es importante porque la medida se aplica igual en las tres categorías, pero la ITS sí diferencia requisitos por categoría.',
      powerEnsUsage:
        'Power ENS recoge la referencia y los requisitos concretos que de ella se derivan, para incorporarlos a las comprobaciones. Es importante porque la medida se aplica igual en las tres categorías, pero la ITS sí diferencia requisitos por categoría.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'La concreción técnica del perímetro queda sin referencia normativa. Riesgo de aplicar un mínimo genérico.',
    },
  ],
};
