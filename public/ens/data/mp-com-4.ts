import { ENSControl } from '../types';

export const mpCom4Control: ENSControl = {
  id: 'mp.com.4',
  title: 'Separación de flujos de información en la red',
  framework: 'ENS',
  category: 'Protección de las comunicaciones',
  family: 'Medidas de protección',
  dimension: 'Todas',
  scope: {
    activeLevels: ['MEDIO', 'ALTO'],
    declaredLevels: ['MEDIO', 'ALTO'],
    highLevelStatus: 'NO_EVALUABLE',
  },
  expectedResult: {
    bajo: {
      status: 'NO_APLICA',
      score: 0,
      condition:
        'La medida no es exigible en nivel BAJO (Anexo II, RD 311/2022).',
    },
    medio: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.com.4 + [R1 o R2 o R3] → Base + UNA de las tres formas de segmentación',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'mp.com.4 + [R2 o R3] + R4 → Base + VPN o separación física (VLAN excluida) + control de puntos de interconexión',
    },
  },
  requirements: [
    {
      id: 'mp.com.4.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Tráfico segregado: cada equipo accede solo a lo que necesita',
      description:
        'El tráfico por la red se segregará para que cada equipo solamente tenga acceso a la información que necesita.',
      evidences: ['EV-01', 'EV-02', 'EV-03', 'EV-09', 'EV-10'],
    },
    {
      id: 'mp.com.4.2',
      level: ['MEDIO', 'ALTO'],
      title: 'Comunicaciones inalámbricas en un segmento separado',
      description:
        'Si se emplean comunicaciones inalámbricas, será en un segmento separado.',
      evidences: ['EV-04'],
    },
    {
      id: 'mp.com.4.r1.1',
      level: ['MEDIO'],
      title: 'Segmentos implementados con VLAN',
      description:
        'Los segmentos de red se implementarán por medio de redes de área local virtuales (Virtual Local Area Network, VLAN).',
      evidences: ['EV-07'],
    },
    {
      id: 'mp.com.4.r1.2',
      level: ['MEDIO'],
      title: 'Subredes separadas de usuarios, servicios y administración',
      description:
        'La red que conforma el sistema deberá segregarse en distintas subredes contemplando como mínimo: • Usuarios. • Servicios. • Administración.',
      evidences: ['EV-08'],
    },
    {
      id: 'mp.com.4.r2.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Segmentos implementados con redes privadas virtuales',
      description:
        'Los segmentos de red se implementarán por medio de redes privadas virtuales (Virtual Private Network, VPN).',
      evidences: ['EV-07'],
    },
    {
      id: 'mp.com.4.r3.1',
      level: ['MEDIO', 'ALTO'],
      title: 'Segmentos implementados con medios físicos separados',
      description:
        'Los segmentos de red se implementarán con medios físicos separados.',
      evidences: ['EV-07'],
    },
    {
      id: 'mp.com.4.r4.1',
      level: ['ALTO'],
      title: 'Control de entrada de usuarios y de información en cada segmento',
      description:
        'Control de entrada de los usuarios que llegan a cada segmento y control de entrada y salida de la información disponible en cada segmento.',
      evidences: ['EV-05', 'EV-06'],
      active: false,
    },
    {
      id: 'mp.com.4.r4.2',
      level: ['ALTO'],
      title: 'Punto de interconexión asegurado, mantenido y monitorizado',
      description:
        'El punto de interconexión estará particularmente asegurado, mantenido y monitorizado, (como en [mp.com.1]).',
      evidences: ['EV-05'],
      active: false,
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['mp.com.4.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Clasificación de los flujos por segmento de origen y destino',
      description:
        'Enriquecimiento de cada evento de red con el segmento de origen y de destino según el mapa de P-01. Es la base de todo el control: permite razonar sobre segmentos en lugar de sobre direcciones, que es como está formulado el requisito.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-02',
      requirement: ['mp.com.4.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Fugas de segmentación: flujos entre segmentos no autorizados',
      description:
        'Detección de comunicaciones entre segmentos que no figuran en la matriz de P-02. Es la verificación del efecto de la segmentación: no comprueba si existe la VLAN, comprueba si el tráfico se comporta como si la hubiera, que es lo que el requisito persigue.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-03',
      requirement: ['mp.com.4.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Equipos con presencia en más de un segmento',
      description:
        'Detección de sistemas con interfaces en segmentos distintos, que constituyen un puente entre ellos y pueden anular la separación sin que ninguna regla lo autorice. Un servidor con dos tarjetas en VLAN distintas es una pasarela no declarada.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-04',
      requirement: ['mp.com.4.2'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Separación efectiva de las comunicaciones inalámbricas',
      description:
        'Verificación de que el tráfico originado en los rangos inalámbricos de P-04 permanece en su segmento y solo alcanza lo autorizado. mp.com.4.2 es un requisito específico y taxativo sobre las inalámbricas.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-05',
      requirement: ['mp.com.4.r4.1', 'mp.com.4.r4.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Registro del tráfico en los puntos de interconexión (R4)',
      description:
        'Ingesta de los registros de los elementos que controlan los puntos de interconexión de P-05, con las conexiones aceptadas y denegadas entre segmentos. R4 remite expresamente a mp.com.1, de modo que cada punto de interconexión hereda las exigencias del perímetro.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-06',
      requirement: ['mp.com.4.r4.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Control de entrada de usuarios a cada segmento (R4)',
      description:
        'Verificación de que la asignación de segmento a cada usuario se corresponde con su identidad según los criterios de P-06. mp.com.4.r4.1 exige control de entrada de los usuarios que llegan a cada segmento, no solo control del tráfico.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-07',
      requirement: ['mp.com.4.r1.1', 'mp.com.4.r2.1', 'mp.com.4.r3.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Modalidad de segmentación implementada (R1, R2, R3)',
      description:
        'Verificación de la forma de segmentación declarada en P-03: existencia y configuración de VLAN con su etiquetado, túneles VPN establecidos, o separación física efectiva. Incluye la comprobación de admisibilidad para la categoría del sistema.',
      format: 'sca_or_json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-08',
      requirement: ['mp.com.4.r1.2'],
      level: ['MEDIO'],
      expectedStatus: 'CUMPLE',
      title: 'Segregación mínima en usuarios, servicios y administración',
      description:
        'Verificación de que existen al menos los tres segmentos que exige mp.com.4.r1.2 —usuarios, servicios y administración— y de que los equipos están en el que les corresponde por su función.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-09',
      requirement: ['mp.com.4.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Propagación de incidentes entre segmentos',
      description:
        'Verificación del propósito declarado del control: que los incidentes queden encapsulados en su segmento. Detección de actividad maliciosa que se propaga de un segmento a otro, lo que evidencia que la segmentación no está acotando la propagación.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
    {
      id: 'EV-10',
      requirement: ['mp.com.4.1'],
      level: ['MEDIO', 'ALTO'],
      expectedStatus: 'CUMPLE',
      title: 'Estado y vigencia de la matriz de flujos',
      description:
        'Flujos autorizados en P-02 sin tráfico observado —candidatos a retirada— y flujos observados que no estaban previstos, como soporte a la revisión periódica de P-07.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'mapa_segmentos',
      description:
        'Segmentos en que está dividida la red con su propósito, rango de direcciones y los equipos o tipos de equipo que contiene. R1 exige como mínimo distinguir usuarios, servicios y administración.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.1', 'mp.com.4.r1.2'],
      type: 'table',
      usage:
        'Es la referencia de todo el control.',
      missingBehavior:
        'El control es NO EVALUABLE. Sin mapa de segmentos no se puede clasificar ningún flujo.',
    },
    {
      id: 'P-02',
      name: 'matriz_flujos_entre_segmentos',
      description:
        'Comunicaciones permitidas entre segmentos, con protocolo y puerto. Es la traducción operativa de mp.com.4.1: para saber si un equipo accede solo a la información que necesita hay que haber definido qué necesita.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.1'],
      type: 'table',
      usage:
        'ENSFácil contrasta cada flujo observado con esta matriz. Flujo entre segmentos no autorizado → hallazgo de fuga de segmentación. Es la comprobación central y la que revela si la segmentación funciona de verdad.',
      missingBehavior:
        'mp.com.4.1 NO EVALUABLE. Se ven los flujos pero no se puede juzgar si cruzan segmentos indebidamente.',
    },
    {
      id: 'P-03',
      name: 'modalidad_segmentacion',
      description:
        'Forma de segmentación implementada: VLAN (R1), VPN (R2) o medios físicos separados (R3). Es una elección entre alternativas, no acumulativa. ATENCIÓN: en categoría ALTA la VLAN no figura entre las opciones admisibles.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.r1.1', 'mp.com.4.r2.1', 'mp.com.4.r3.1'],
      type: 'select',
      usage:
        'Determina qué refuerzo evalúa ENSFácil. Si la categoría es ALTA y P-03 = R1, se emite incumplimiento directo sin más comprobaciones: la VLAN deja de ser opción válida al subir de MEDIA a ALTA.',
      missingBehavior:
        'No se puede determinar qué refuerzo es aplicable ni verificar su admisibilidad para la categoría.',
    },
    {
      id: 'P-04',
      name: 'segmento_inalambrico',
      description:
        'Segmento o segmentos en que se encuentran las comunicaciones inalámbricas, separados del resto. mp.com.4.2 es taxativo y específico: si hay inalámbricas, en segmento separado.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.2'],
      type: 'table',
      usage:
        'ENSFácil verifica que el tráfico originado en los rangos inalámbricos permanece en su segmento y solo alcanza lo autorizado en P-02. Enlaza con mp.eq.4 P-06 para el tratamiento de invitados y BYOD.',
      missingBehavior:
        'mp.com.4.2 NO EVALUABLE. No se puede verificar la separación de las comunicaciones inalámbricas.',
    },
    {
      id: 'P-05',
      name: 'puntos_interconexion',
      description:
        'Puntos de interconexión entre segmentos, con el elemento que los controla y su forma de enviar registros. R4 los hace obligatorios en categoría ALTA y les remite expresamente las exigencias de mp.com.1.',
      level: ['ALTO'],
      requirements: ['mp.com.4.r4.1', 'mp.com.4.r4.2'],
      type: 'table',
      usage:
        'Define de qué elementos ingiere Wazuh los registros del tráfico entre segmentos. Sin ellos, la verificación de la separación depende solo de lo que se vea desde los hosts, que es menos completo.',
      missingBehavior:
        'R4 NO EVALUABLE y es obligatorio en categoría ALTA. El tráfico entre segmentos queda sin registro propio.',
    },
    {
      id: 'P-06',
      name: 'control_entrada_usuarios_segmento',
      description:
        'Mecanismo de control de entrada de los usuarios que llegan a cada segmento, exigido por mp.com.4.r4.1 en categoría ALTA: autenticación de red, asignación dinámica de segmento por identidad, NAC.',
      level: ['ALTO'],
      requirements: ['mp.com.4.r4.1'],
      type: 'table',
      usage:
        'ENSFáci ingiere los eventos de autenticación de red y verifica que la asignación de segmento se corresponde con la identidad del usuario. Usuario en segmento que no le corresponde → hallazgo.',
      missingBehavior:
        'R4 parcialmente NO EVALUABLE. No se puede verificar el control de entrada de usuarios a cada segmento.',
    },
    {
      id: 'P-07',
      name: 'periodicidad_revision_segmentacion_dias',
      description:
        'Cada cuánto debe revisarse la matriz de flujos entre segmentos para retirar autorizaciones que ya no tienen justificación. Una matriz sin revisar acumula excepciones hasta vaciar de contenido la segmentación.',
      level: ['MEDIO', 'ALTO'],
      requirements: ['mp.com.4.1'],
      type: 'duration_days',
      usage:
        'ENSFácil registra las revisiones y alerta al superarse P-07. Señala además los flujos de P-02 sin tráfico observado, candidatos a retirada, y los flujos observados que no estaban previstos.',
      missingBehavior:
        'La matriz envejece sin control. La segmentación se degrada por acumulación de excepciones.',
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
