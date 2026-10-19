import { ENSControlConfiguration } from '../types';

export const mpSw2Configuration: ENSControlConfiguration = {
  controlId: 'mp.sw.2',
  controlName: 'Aceptación y puesta en servicio',
  family: 'Medidas de protección',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'mp.sw.2',
      name: 'aplicaciones_en_alcance',
      label: 'Aplicaciones en alcance',
      description:
        'Aplicaciones del sistema sujetas al control, con los sistemas en que se despliegan, su responsable y si son de desarrollo propio o de terceros.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'table',
      example: 'portal expedientes | / srv-web01/02 | J. Ruiz | propio',
      columns: [
        {
          name: 'aplicacion',
          label: 'Aplicación',
          type: 'string',
          required: true,
        },
        {
          name: 'sistemas',
          label: 'Sistemas',
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
          name: 'origen',
          label: 'Origen',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Define el alcance.',
      ensfacilUsage:
        'ENSFácil vincula cada puesta en servicio detectada con la aplicación correspondiente y con los sistemas en que debe medirse el deterioro de seguridad.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'El control es NO EVALUABLE. No se puede asociar un despliegue detectado a una aplicación ni a su aceptación.',
    },
    {
      id: 'P-02',
      controlId: 'mp.sw.2',
      name: 'criterios_aceptacion_seguridad',
      label: 'Criterios aceptacion seguridad',
      description:
        'Criterios de aceptación en materia de seguridad que la aplicación debe cumplir antes de pasar a producción, exigidos expresamente por mp.sw.2.1 a). Sin criterios escritos el requisito no tiene referencia.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'list',
      example: 'sin vulnerabilidades críticas; / autenticación conforme a op.acc.5; / registro de actividad activo; / TLS ≥1.2',
      required: true,
      wazuhUsage:
        'ENSFácil verifica automáticamente los criterios que sean comprobables —vulnerabilidades, configuración criptográfica, registro activo— y recoge como declaración los que no lo sean. Es la pieza que convierte el acta de aceptación en algo contrastable.',
      ensfacilUsage:
        'ENSFácil verifica automáticamente los criterios que sean comprobables —vulnerabilidades, configuración criptográfica, registro activo— y recoge como declaración los que no lo sean. Es la pieza que convierte el acta de aceptación en algo contrastable.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'mp.sw.2.1 a) NO EVALUABLE por falta de referencia. El acta de aceptación queda sin criterios que verificar.',
    },
    {
      id: 'P-03',
      controlId: 'mp.sw.2',
      name: 'entorno_preproduccion',
      label: 'Entorno preproduccion',
      description:
        'Emparejamiento entre sistemas de producción y sus equivalentes de preproducción, con acreditación de aislamiento. R1 exige entorno aislado. Coincide con el parámetro homólogo de op.exp.4 y op.exp.5 y conviene gestionarlo de forma unificada.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.r1.1'],
      type: 'table',
      example: 'srv-web01 → pre-web01 | / VLAN separada sin ruta a prod',
      columns: [
        {
          name: 'sistema_prod',
          label: 'Sistema prod',
          type: 'identifier',
          required: true,
        },
        {
          name: 'sistema_preprod',
          label: 'Sistema preprod',
          type: 'identifier',
          required: false,
        },
        {
          name: 'aislamiento',
          label: 'Aislamiento',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil correlaciona la aparición de una versión en producción con su presencia previa en el par de preproducción. Verifica además el aislamiento: preproducción con ruta abierta a producción no es un entorno aislado, y el refuerzo lo exige expresamente.',
      ensfacilUsage:
        'ENSFácil correlaciona la aparición de una versión en producción con su presencia previa en el par de preproducción. Verifica además el aislamiento: preproducción con ruta abierta a producción no es un entorno aislado, y el refuerzo lo exige expresamente.',
      evidenceIds: ['EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE desde categoría MEDIA. No se puede acreditar el paso por un entorno aislado.',
    },
    {
      id: 'P-04',
      controlId: 'mp.sw.2',
      name: 'ventana_medicion_deterioro_dias',
      label: 'Ventana medicion deterioro dias',
      description:
        'Días antes y después de la puesta en servicio que ENSFácil compara para determinar si se ha deteriorado la seguridad de otros componentes del servicio, como exige mp.sw.2.1 b).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'duration_days',
      example: '7 antes / 7 después',
      required: true,
      wazuhUsage:
        'Define la ventana del análisis diferencial: cumplimiento SCA, puertos abiertos, servicios en ejecución y vulnerabilidades antes y después. Es la forma de medir el deterioro en lugar de declararlo.',
      ensfacilUsage:
        'Define la ventana del análisis diferencial: cumplimiento SCA, puertos abiertos, servicios en ejecución y vulnerabilidades antes y después. Es la forma de medir el deterioro en lugar de declararlo.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'Se aplica una ventana por defecto. La medición de deterioro pierde precisión pero sigue siendo posible.',
    },
    {
      id: 'P-05',
      controlId: 'mp.sw.2',
      name: 'umbral_deterioro_aceptable',
      label: 'Umbral deterioro aceptable',
      description:
        'Variación admisible en los indicadores de seguridad del entorno tras el despliegue antes de considerar que hay deterioro: descenso de cumplimiento SCA, puertos nuevos, vulnerabilidades introducidas.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'table',
      example: 'cumplimiento SCA: 0 pts / CVE críticas nuevas: 0 / puertos nuevos: solo los previstos',
      columns: [
        {
          name: 'indicador',
          label: 'Indicador',
          type: 'string',
          required: true,
        },
        {
          name: 'tolerancia',
          label: 'Tolerancia',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Define cuándo el diferencial de EV-03 es hallazgo. Para vulnerabilidades críticas lo razonable es tolerancia cero; para puertos, admitir los declarados como necesarios por la aplicación.',
      ensfacilUsage:
        'Define cuándo el diferencial de EV-03 es hallazgo. Para vulnerabilidades críticas lo razonable es tolerancia cero; para puertos, admitir los declarados como necesarios por la aplicación.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'Cualquier variación se reporta como deterioro, lo que produce ruido y acaba desatendiéndose.',
    },
    {
      id: 'P-06',
      controlId: 'mp.sw.2',
      name: 'puertos_servicios_previstos_app',
      label: 'Puertos servicios previstos app',
      description:
        'Puertos y servicios que cada aplicación de P-01 necesita legítimamente exponer, declarados antes del despliegue. Permite distinguir un puerto nuevo previsto de uno inesperado.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'table',
      example: 'portal expedientes | / 443 | nginx, php-fpm',
      columns: [
        {
          name: 'aplicacion',
          label: 'Aplicación',
          type: 'string',
          required: true,
        },
        {
          name: 'puertos',
          label: 'Puertos',
          type: 'string',
          required: false,
        },
        {
          name: 'servicios',
          label: 'Servicios',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil contrasta los puertos y servicios que aparecen tras el despliegue con esta declaración. Puerto nuevo no previsto → deterioro del perímetro de exposición. Enlaza con op.exp.2 (mínima funcionalidad) y con mp.com.1.',
      ensfacilUsage:
        'ENSFácil contrasta los puertos y servicios que aparecen tras el despliegue con esta declaración. Puerto nuevo no previsto → deterioro del perímetro de exposición. Enlaza con op.exp.2 (mínima funcionalidad) y con mp.com.1.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede distinguir exposición legítima de la aplicación de exposición accidental introducida con ella.',
    },
    {
      id: 'P-07',
      controlId: 'mp.sw.2',
      name: 'registro_actas_aceptacion',
      label: 'Registro actas aceptacion',
      description:
        'Registro de las actas de aceptación con su fecha, aplicación, versión, criterios verificados, resultado y quién aceptó. Es la evidencia documental del requisito base.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.1'],
      type: 'table',
      example: 'aplicación | versión | fecha | / aceptó | resultado',
      columns: [
        {
          name: 'aplicacion',
          label: 'Aplicación',
          type: 'string',
          required: true,
        },
        {
          name: 'version',
          label: 'Versión',
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
          name: 'acepto',
          label: 'Aceptó',
          type: 'string',
          required: false,
        },
        {
          name: 'resultado',
          label: 'Resultado',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil conserva el registro y lo contrasta con las puestas en servicio efectivamente detectadas. Despliegue en producción sin acta previa → hallazgo del enunciado del control, que exige comprobación ANTES de pasar a producción.',
      ensfacilUsage:
        'ENSFácil conserva el registro y lo contrasta con las puestas en servicio efectivamente detectadas. Despliegue en producción sin acta previa → hallazgo del enunciado del control, que exige comprobación ANTES de pasar a producción.',
      evidenceIds: ['EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'mp.sw.2.1 sin acreditación documental. No consta que la comprobación previa se haya realizado.',
    },
    {
      id: 'P-08',
      controlId: 'mp.sw.2',
      name: 'auditoria_codigo_fuente',
      label: 'Auditoria codigo fuente',
      description:
        'Auditorías de código fuente realizadas, con fecha, alcance, metodología y hallazgos. Corresponde a R2, no obligatorio en ninguna categoría, pero relevante en aplicaciones de desarrollo propio.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.sw.2.r2.1'],
      type: 'table',
      example: 'portal | 02/2026 | SAST / interno | 14 | 12 cerrados',
      columns: [
        {
          name: 'aplicacion',
          label: 'Aplicación',
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
          name: 'ejecutor',
          label: 'Ejecutor',
          type: 'string',
          required: false,
        },
        {
          name: 'hallazgos',
          label: 'Hallazgos',
          type: 'string',
          required: false,
        },
        {
          name: 'estado',
          label: 'Estado',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil registra la realización y hace seguimiento del cierre de hallazgos, cruzándolos con las vulnerabilidades que el Vulnerability Detector observe en producción. La auditoría de código en sí es un servicio o una herramienta SAST, no una funcionalidad de Wazuh.',
      ensfacilUsage:
        'ENSFácil registra la realización y hace seguimiento del cierre de hallazgos, cruzándolos con las vulnerabilidades que el Vulnerability Detector observe en producción. La auditoría de código en sí es un servicio o una herramienta SAST, no una funcionalidad de Wazuh.',
      evidenceIds: ['EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'R2 sin acreditar. No supone incumplimiento al no ser exigible en ninguna categoría.',
    },
  ],
};
