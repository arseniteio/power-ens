import { ENSControlConfiguration } from '../types';

export const opExp5Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.5',
  controlName: 'Gestión de cambios',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.5',
      name: 'sistema_gestion_cambios',
      label: 'Sistema gestion cambios',
      description:
        'Sistema donde se registran las peticiones de cambio con su número de referencia, y forma de acceso a ese registro. op.exp.5.1 exige numeración y seguimiento equivalentes a los del registro de incidentes.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.1', 'op.exp.5.2'],
      type: 'select',
      example: 'Jira Service Management / (API) / GLPI / ServiceNow / / registro en hoja de cálculo',
      required: true,
      wazuhUsage:
        'Es la pieza que hace posible el contraste. Cambio detectado sin petición asociada → hallazgo.',
      ensfacilUsage:
        'ENSFácil consulta las peticiones aprobadas y las correlaciona con los cambios que FIM y Syscollector detectan en los sistemas.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede contrastar cambio real contra cambio autorizado. La aportación principal de ENSFácil a este control se pierde.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.5',
      name: 'campos_minimos_peticion_cambio',
      label: 'Campos minimos peticion cambio',
      description:
        'Información mínima que debe contener cada petición de cambio para que el autorizador «no tenga dudas al respecto» (op.exp.5.2): descripción, sistemas afectados, solicitante, ventana prevista, impacto, plan de reversión, resultado del análisis de riesgos.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.2'],
      type: 'list',
      example: 'descripción, sistemas, / solicitante, riesgo, reversión, / aprobador, fecha',
      required: true,
      wazuhUsage:
        'ENSFácil verifica la completitud de cada petición consultada en P-01. Petición implementada con campos obligatorios vacíos → hallazgo de información insuficiente para autorizar.',
      ensfacilUsage:
        'ENSFácil verifica la completitud de cada petición consultada en P-01. Petición implementada con campos obligatorios vacíos → hallazgo de información insuficiente para autorizar.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la suficiencia de la información. op.exp.5.2 solo acreditable por muestreo manual.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.5',
      name: 'criterios_cambio_riesgo_alto',
      label: 'Criterios cambio riesgo alto',
      description:
        'Criterios que determinan cuándo un cambio implica riesgo de nivel ALTO y por tanto exige aprobación explícita y previa del Responsable de la Seguridad (op.exp.5.4). Es el umbral que dispara el requisito más exigente del control.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.4'],
      type: 'list',
      example: 'cambio en perímetro, / en mecanismo de autenticación, / en cifrado, en ACL de datos / especialmente protegidos',
      required: true,
      wazuhUsage:
        'ENSFácil clasifica los cambios detectados según estos criterios y verifica que los de riesgo ALTO cuentan con aprobación explícita del RSI en P-01, y que esa aprobación es ANTERIOR a la implantación.',
      ensfacilUsage:
        'ENSFácil clasifica los cambios detectados según estos criterios y verifica que los de riesgo ALTO cuentan con aprobación explícita del RSI en P-01, y que esa aprobación es ANTERIOR a la implantación.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede identificar qué cambios exigían aprobación del RSI. op.exp.5.4 NO EVALUABLE.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.5',
      name: 'responsable_seguridad',
      label: 'Responsable seguridad',
      description:
        'Identificación del Responsable de la Seguridad y de su cuenta o identificador en el sistema de gestión de cambios, para poder verificar que la aprobación de los cambios de riesgo ALTO proviene efectivamente de él.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.4'],
      type: 'string',
      example: 'A. Martínez | / amartinez@org.es',
      required: true,
      wazuhUsage:
        'ENSFácil verifica la identidad del aprobador en las peticiones clasificadas como riesgo ALTO. Aprobación firmada por otra persona → hallazgo, porque el ENS atribuye esa competencia al RSI de forma expresa.',
      ensfacilUsage:
        'ENSFácil verifica la identidad del aprobador en las peticiones clasificadas como riesgo ALTO. Aprobación firmada por otra persona → hallazgo, porque el ENS atribuye esa competencia al RSI de forma expresa.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar que la aprobación de cambios de riesgo ALTO proviene del Responsable de la Seguridad.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.5',
      name: 'entorno_preproduccion',
      label: 'Entorno preproduccion',
      description:
        'Emparejamiento entre sistemas de producción y sus equivalentes de preproducción, y acreditación de que son equivalentes «al menos en los aspectos específicos del cambio» (op.exp.5.3). Puede compartirse con el parámetro homólogo de op.exp.4.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.3'],
      type: 'table',
      example: 'srv-app01 → pre-app01',
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
      ],
      required: true,
      wazuhUsage:
        'ENSFácil correlaciona cada cambio en producción con actividad previa en su par de preproducción. Requiere agente Wazuh también en preproducción. Nótese el matiz «siempre que sea posible realizarlas», que admite justificación de imposibilidad.',
      ensfacilUsage:
        'ENSFácil correlaciona cada cambio en producción con actividad previa en su par de preproducción. Requiere agente Wazuh también en preproducción. Nótese el matiz «siempre que sea posible realizarlas», que admite justificación de imposibilidad.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede acreditar el paso por preproducción. op.exp.5.3 queda como acreditación documental.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.5',
      name: 'documentacion_configuracion',
      label: 'Documentacion configuracion',
      description:
        'Documentos de configuración que deben actualizarse tras un cambio aceptado (op.exp.5.5): diagramas de red, manuales de operación, inventario de activos. Debe indicarse dónde residen para poder verificar su actualización.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.5.5'],
      type: 'list',
      example: 'diagrama red | / \\\\srv\\doc\\red.vsdx / inventario | CMDB',
      required: true,
      wazuhUsage:
        'FIM sobre las rutas declaradas permite detectar si el documento se actualizó en la ventana posterior al cambio. Cambio aceptado sin actualización documental posterior → hallazgo de op.exp.5.5.',
      ensfacilUsage:
        'FIM sobre las rutas declaradas permite detectar si el documento se actualizó en la ventana posterior al cambio. Cambio aceptado sin actualización documental posterior → hallazgo de op.exp.5.5.',
      evidenceIds: ['EV-06', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la actualización de la documentación tras el cambio.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.5',
      name: 'canal_comunicacion_fallos',
      label: 'Canal comunicacion fallos',
      description:
        'Vía por la que se comunican al responsable de seguridad los fallos de software y hardware, exigida por op.exp.5.r1.2 en categoría ALTA. Debe ser un canal cuyo uso deje registro.',
      levels: ['ALTO'],
      requirements: ['op.exp.5.r1.2'],
      type: 'select',
      example: 'cola ITSM «Seguridad» / / buzón rsi@org.es / / integración Wazuh → ITSM',
      required: false,
      wazuhUsage:
        'ENSFácil puede correlacionar las alertas de fallo que Wazuh detecta (servicios caídos, errores hardware en logs del sistema) con su comunicación efectiva por el canal declarado. Fallo detectado sin comunicación → hallazgo.',
      ensfacilUsage:
        'ENSFácil puede correlacionar las alertas de fallo que Wazuh detecta (servicios caídos, errores hardware en logs del sistema) con su comunicación efectiva por el canal declarado. Fallo detectado sin comunicación → hallazgo.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la comunicación de fallos al responsable de seguridad. op.exp.5.r1.2 NO EVALUABLE.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.5',
      name: 'mecanismo_reversion',
      label: 'Mecanismo reversion',
      description:
        'Mecanismo previsto para revertir cada tipo de cambio en caso de efectos adversos: snapshot, punto de restauración, backup de configuración, versión anterior en repositorio. Coincide en sustancia con el parámetro homólogo de op.exp.4 (R2) y conviene gestionarlos de forma unificada.',
      levels: ['ALTO'],
      requirements: ['op.exp.5.r1.1'],
      type: 'table',
      example: 'cambio config → backup / despliegue app → snapshot VM',
      columns: [
        {
          name: 'tipo_de_cambio',
          label: 'Tipo de cambio',
          type: 'string',
          required: true,
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
        'ENSFácil verifica que existe evidencia del punto de reversión en la ventana anterior a cada cambio implantado. Reutiliza la lógica de op.exp.4 EV-09.',
      ensfacilUsage:
        'ENSFácil verifica que existe evidencia del punto de reversión en la ventana anterior a cada cambio implantado. Reutiliza la lógica de op.exp.4 EV-09.',
      evidenceIds: ['EV-07', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'R1 parcialmente NO EVALUABLE. No se acredita la previsión de reversión exigida por op.exp.5.r1.1.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.5',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el procedimiento de gestión de cambios y los requisitos que ningún evento del sistema puede demostrar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.5.3 | Procedimiento de pruebas en preproducción | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
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
      required: false,
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
