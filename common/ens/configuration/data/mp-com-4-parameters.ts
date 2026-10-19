import { ENSControlConfiguration } from '../types';

export const mpCom4Configuration: ENSControlConfiguration = {
  controlId: 'mp.com.4',
  controlName: 'Separación de flujos de información en la red',
  family: 'Medidas de protección',
  enabled: true,
  applicableLevels: ['MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'mp.com.4',
      name: 'mapa_segmentos',
      label: 'Mapa segmentos',
      description:
        'Segmentos en que está dividida la red con su propósito, rango de direcciones y los equipos o tipos de equipo que contiene. R1 exige como mínimo distinguir usuarios, servicios y administración.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.1', 'mp.com.4.r1.2'],
      type: 'table',
      example: 'VLAN 10 | usuarios | / 10.1.0.0/16 / VLAN 20 | servicios | 10.2.0.0/16 / VLAN 30 | administración',
      columns: [
        {
          name: 'segmento',
          label: 'Segmento',
          type: 'string',
          required: true,
        },
        {
          name: 'proposito',
          label: 'Propósito',
          type: 'string',
          required: false,
        },
        {
          name: 'rango',
          label: 'Rango',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Es la referencia de todo el control.',
      ensfacilUsage:
        'ENSFácil clasifica cada evento de red según el segmento de origen y destino, lo que permite verificar la separación sin inspeccionar la configuración de la electrónica.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-08', 'EV-09', 'EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'El control es NO EVALUABLE. Sin mapa de segmentos no se puede clasificar ningún flujo.',
    },
    {
      id: 'P-02',
      controlId: 'mp.com.4',
      name: 'matriz_flujos_entre_segmentos',
      label: 'Matriz flujos entre segmentos',
      description:
        'Comunicaciones permitidas entre segmentos, con protocolo y puerto. Es la traducción operativa de mp.com.4.1: para saber si un equipo accede solo a la información que necesita hay que haber definido qué necesita.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.1'],
      type: 'table',
      example: 'usuarios → servicios | TCP 443 | sí / usuarios → administración | — | no',
      columns: [
        {
          name: 'origen_destino',
          label: 'Origen → destino',
          type: 'string',
          required: true,
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
          name: 'autorizado',
          label: 'Autorizado',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil contrasta cada flujo observado con esta matriz. Flujo entre segmentos no autorizado → hallazgo de fuga de segmentación. Es la comprobación central y la que revela si la segmentación funciona de verdad.',
      ensfacilUsage:
        'ENSFácil contrasta cada flujo observado con esta matriz. Flujo entre segmentos no autorizado → hallazgo de fuga de segmentación. Es la comprobación central y la que revela si la segmentación funciona de verdad.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-09', 'EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'mp.com.4.1 NO EVALUABLE. Se ven los flujos pero no se puede juzgar si cruzan segmentos indebidamente.',
    },
    {
      id: 'P-03',
      controlId: 'mp.com.4',
      name: 'modalidad_segmentacion',
      label: 'Modalidad segmentacion',
      description:
        'Forma de segmentación implementada: VLAN (R1), VPN (R2) o medios físicos separados (R3). Es una elección entre alternativas, no acumulativa. ATENCIÓN: en categoría ALTA la VLAN no figura entre las opciones admisibles.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.r1.1', 'mp.com.4.r2.1', 'mp.com.4.r3.1'],
      type: 'select',
      // The chosen reinforcement, as in op.acc.5 P-01: the requirements of the options not chosen will come out NO_APLICA.
      options: ['R1', 'R2', 'R3'],
      example: 'R2',
      required: true,
      wazuhUsage:
        'Determina qué refuerzo evalúa ENSFácil. Si la categoría es ALTA y P-03 = R1, se emite incumplimiento directo sin más comprobaciones: la VLAN deja de ser opción válida al subir de MEDIA a ALTA.',
      ensfacilUsage:
        'Determina qué refuerzo evalúa ENSFácil. Si la categoría es ALTA y P-03 = R1, se emite incumplimiento directo sin más comprobaciones: la VLAN deja de ser opción válida al subir de MEDIA a ALTA.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede determinar qué refuerzo es aplicable ni verificar su admisibilidad para la categoría.',
    },
    {
      id: 'P-04',
      controlId: 'mp.com.4',
      name: 'segmento_inalambrico',
      label: 'Segmento inalambrico',
      description:
        'Segmento o segmentos en que se encuentran las comunicaciones inalámbricas, separados del resto. mp.com.4.2 es taxativo y específico: si hay inalámbricas, en segmento separado.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.2'],
      type: 'table',
      example: 'CORP-WIFI | VLAN 40 | / sí | solo a servicios / INVITADOS | VLAN 90 | sí | solo internet',
      columns: [
        {
          name: 'ssid',
          label: 'SSID',
          type: 'string',
          required: true,
        },
        {
          name: 'segmento',
          label: 'Segmento',
          type: 'string',
          required: false,
        },
        {
          name: 'aislamiento',
          label: 'Aislamiento',
          type: 'string',
          required: false,
        },
        {
          name: 'acceso_permitido',
          label: 'Acceso permitido',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil verifica que el tráfico originado en los rangos inalámbricos permanece en su segmento y solo alcanza lo autorizado en P-02. Enlaza con mp.eq.4 P-06 para el tratamiento de invitados y BYOD.',
      ensfacilUsage:
        'ENSFácil verifica que el tráfico originado en los rangos inalámbricos permanece en su segmento y solo alcanza lo autorizado en P-02. Enlaza con mp.eq.4 P-06 para el tratamiento de invitados y BYOD.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'mp.com.4.2 NO EVALUABLE. No se puede verificar la separación de las comunicaciones inalámbricas.',
    },
    {
      id: 'P-05',
      controlId: 'mp.com.4',
      name: 'puntos_interconexion',
      label: 'Puntos interconexion',
      description:
        'Puntos de interconexión entre segmentos, con el elemento que los controla y su forma de enviar registros. R4 los hace obligatorios en categoría ALTA y les remite expresamente las exigencias de mp.com.1.',
      levels: ['ALTO'],
      requirements: ['mp.com.4.r4.1', 'mp.com.4.r4.2'],
      type: 'table',
      example: 'IC-01 | usuarios↔servicios | / fw-interno01 | syslog',
      columns: [
        {
          name: 'punto',
          label: 'Punto',
          type: 'string',
          required: true,
        },
        {
          name: 'segmentos',
          label: 'Segmentos',
          type: 'string',
          required: false,
        },
        {
          name: 'elemento',
          label: 'Elemento',
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
      required: false,
      wazuhUsage:
        'Define de qué elementos ingiere Wazuh los registros del tráfico entre segmentos. Sin ellos, la verificación de la separación depende solo de lo que se vea desde los hosts, que es menos completo.',
      ensfacilUsage:
        'Define de qué elementos ingiere Wazuh los registros del tráfico entre segmentos. Sin ellos, la verificación de la separación depende solo de lo que se vea desde los hosts, que es menos completo.',
      evidenceIds: ['EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'R4 NO EVALUABLE y es obligatorio en categoría ALTA. El tráfico entre segmentos queda sin registro propio.',
    },
    {
      id: 'P-06',
      controlId: 'mp.com.4',
      name: 'control_entrada_usuarios_segmento',
      label: 'Control entrada usuarios segmento',
      description:
        'Mecanismo de control de entrada de los usuarios que llegan a cada segmento, exigido por mp.com.4.r4.1 en categoría ALTA: autenticación de red, asignación dinámica de segmento por identidad, NAC.',
      levels: ['ALTO'],
      requirements: ['mp.com.4.r4.1'],
      type: 'table',
      example: 'administración | 802.1X + / pertenencia a grupo AD',
      columns: [
        {
          name: 'segmento',
          label: 'Segmento',
          type: 'string',
          required: true,
        },
        {
          name: 'mecanismo',
          label: 'Mecanismo',
          type: 'string',
          required: false,
        },
        {
          name: 'criterio',
          label: 'Criterio',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFáci ingiere los eventos de autenticación de red y verifica que la asignación de segmento se corresponde con la identidad del usuario. Usuario en segmento que no le corresponde → hallazgo.',
      ensfacilUsage:
        'ENSFáci ingiere los eventos de autenticación de red y verifica que la asignación de segmento se corresponde con la identidad del usuario. Usuario en segmento que no le corresponde → hallazgo.',
      evidenceIds: ['EV-05', 'EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'R4 parcialmente NO EVALUABLE. No se puede verificar el control de entrada de usuarios a cada segmento.',
    },
    {
      id: 'P-07',
      controlId: 'mp.com.4',
      name: 'periodicidad_revision_segmentacion_dias',
      label: 'Periodicidad revision segmentacion dias',
      description:
        'Cada cuánto debe revisarse la matriz de flujos entre segmentos para retirar autorizaciones que ya no tienen justificación. Una matriz sin revisar acumula excepciones hasta vaciar de contenido la segmentación.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.1'],
      type: 'duration_days',
      example: '180 o 365',
      required: true,
      wazuhUsage:
        'ENSFácil registra las revisiones y alerta al superarse P-07. Señala además los flujos de P-02 sin tráfico observado, candidatos a retirada, y los flujos observados que no estaban previstos.',
      ensfacilUsage:
        'ENSFácil registra las revisiones y alerta al superarse P-07. Señala además los flujos de P-02 sin tráfico observado, candidatos a retirada, y los flujos observados que no estaban previstos.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-09', 'EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'La matriz envejece sin control. La segmentación se degrada por acumulación de excepciones.',
    },
  ],
};
