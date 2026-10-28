import { ENSControlConfiguration } from '../types';

export const mpS3Configuration: ENSControlConfiguration = {
  controlId: 'mp.s.3',
  controlName: 'Protección de la navegación web',
  family: 'Medidas de protección',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'mp.s.3',
      name: 'normativa_navegacion',
      label: 'Normativa navegacion',
      description:
        'Normativa de utilización de la navegación web con el uso autorizado, las limitaciones de uso personal y, de forma expresa, el uso permitido de conexiones cifradas. mp.s.3.1 menciona este último punto en particular.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.1'],
      type: 'string',
      example: '«NT-03 Uso de internet v2», con las limitaciones de uso personal y el régimen de conexiones cifradas',
      required: true,
      wazuhUsage:
        'Acreditación documental. Es el requisito del que cuelga la legitimidad de todo lo demás: sin normativa difundida, el registro de navegación de R1 carece de base informativa frente al personal.',
      powerEnsUsage:
        'Power ENS recoge la referencia y el registro de difusión.',
      evidenceIds: ['EV-12'],
      ruleIds: [],
      ifNotConfigured:
        'mp.s.3.1 NO ACREDITADO, y queda además sin base la monitorización que R1 exige en categoría ALTA.',
    },
    {
      id: 'P-02',
      controlId: 'mp.s.3',
      name: 'proxy_filtrado_web',
      label: 'Proxy filtrado web',
      description:
        'Solución de filtrado y control de la navegación, con la ubicación de sus registros. Es la fuente de evidencia de la mayor parte del control.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.5', 'mp.s.3.6'],
      type: 'string',
      example: 'Proxy con filtrado por categorías y antimalware; registros a Wazuh por syslog',
      required: true,
      wazuhUsage:
        'Habilita la ingesta y los decodificadores. Sin registros del proxy no hay evidencia de que el filtrado opere ni de qué se bloquea, y el control queda reducido a la configuración declarada.',
      powerEnsUsage:
        'Habilita la ingesta y los decodificadores. Sin registros del proxy no hay evidencia de que el filtrado opere ni de qué se bloquea, y el control queda reducido a la configuración declarada.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-06', 'EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'La mayor parte del control queda sin evidencia técnica. Solo acreditable por configuración declarada.',
    },
    {
      id: 'P-03',
      controlId: 'mp.s.3',
      name: 'categorias_bloqueadas',
      label: 'Categorias bloqueadas',
      description:
        'Categorías de destino bloqueadas conforme a la normativa de P-01, y tratamiento de las descargas de ejecutables y del contenido activo que mp.s.3.6 pide prevenir.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.5', 'mp.s.3.6'],
      type: 'table',
      example: 'descarga de ejecutables | bloqueo',
      columns: [
        {
          name: 'categoria',
          label: 'Categoría',
          type: 'string',
          required: true,
        },
        {
          name: 'accion',
          label: 'Acción',
          type: 'identifier',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Power ENS verifica que el filtrado opera sobre las categorías declaradas y mide el volumen bloqueado por cada una. Enlaza con op.exp.6: la navegación es, junto al correo, la vía principal de entrada de código dañino.',
      powerEnsUsage:
        'Power ENS verifica que el filtrado opera sobre las categorías declaradas y mide el volumen bloqueado por cada una. Enlaza con op.exp.6: la navegación es, junto al correo, la vía principal de entrada de código dañino.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-06', 'EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar qué se filtra ni acreditar la protección frente a lo que llega por la web.',
    },
    {
      id: 'P-04',
      controlId: 'mp.s.3',
      name: 'proteccion_resolucion_nombres',
      label: 'Proteccion resolucion nombres',
      description:
        'Mecanismos de protección de la resolución de direcciones web y del establecimiento de conexiones que exige mp.s.3.4: resolutores autorizados, filtrado en el propio resolutor, DNSSEC, prohibición de resolutores externos.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.4'],
      type: 'string',
      example: 'Resolutores internos obligatorios; DNS externo bloqueado en el perímetro; filtrado en el resolutor',
      required: true,
      wazuhUsage:
        'Power ENS verifica que las consultas de resolución salen solo por los resolutores autorizados y detecta intentos de usar resolutores externos o canales alternativos de resolución, que son una vía habitual de evasión del filtrado.',
      powerEnsUsage:
        'Power ENS verifica que las consultas de resolución salen solo por los resolutores autorizados y detecta intentos de usar resolutores externos o canales alternativos de resolución, que son una vía habitual de evasión del filtrado.',
      evidenceIds: ['EV-05', 'EV-11'],
      ruleIds: [],
      ifNotConfigured:
        'mp.s.3.4 NO EVALUABLE. La evasión del filtrado por resolución alternativa pasa inadvertida.',
    },
    {
      id: 'P-05',
      controlId: 'mp.s.3',
      name: 'politica_cookies',
      label: 'Politica cookies',
      description:
        'Política ejecutiva de control de cookies, orientada en particular a evitar la contaminación entre uso personal y uso organizativo, como exige mp.s.3.7. Suele implementarse con aislamiento de perfiles de navegador o de sesión.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.7'],
      type: 'string',
      example: 'Perfiles de navegador separados; borrado de cookies de terceros; sin sincronización con cuentas personales',
      required: true,
      wazuhUsage:
        'SCA verifica la configuración del navegador gestionado. Es un requisito peculiar del ENS y poco habitual en otros marcos, de modo que conviene no pasarlo por alto: pide política ejecutiva, no recomendación.',
      powerEnsUsage:
        'SCA verifica la configuración del navegador gestionado. Es un requisito peculiar del ENS y poco habitual en otros marcos, de modo que conviene no pasarlo por alto: pide política ejecutiva, no recomendación.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'mp.s.3.7 NO EVALUABLE. Es uno de los requisitos que con más frecuencia se omite por desconocimiento.',
    },
    {
      id: 'P-06',
      controlId: 'mp.s.3',
      name: 'concienciacion_navegacion',
      label: 'Concienciacion navegacion',
      description:
        'Actividades de concienciación sobre higiene en la navegación web realizadas, con fecha, alcance y participación. mp.s.3.2 las exige «regularmente», de modo que conviene fijar también la periodicidad.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.2'],
      type: 'table',
      example: 'sesión de higiene en la navegación | 2026-03-05 | toda la plantilla',
      columns: [
        {
          name: 'actividad',
          label: 'Actividad',
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
          name: 'alcance',
          label: 'Alcance',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Registro documental. No es verificable técnicamente, aunque el descenso de clics en destinos bloqueados tras una campaña es un indicador indirecto aprovechable.',
      powerEnsUsage:
        'Power ENS controla la periodicidad y enlaza con mp.per.3.',
      evidenceIds: ['EV-12'],
      ruleIds: [],
      ifNotConfigured:
        'mp.s.3.2 NO ACREDITADO. Requisito de naturaleza formativa.',
    },
    {
      id: 'P-07',
      controlId: 'mp.s.3',
      name: 'formacion_administradores',
      label: 'Formacion administradores',
      description:
        'Formación específica del personal encargado de la administración del sistema en monitorización del servicio y respuesta a incidentes, exigida por mp.s.3.3. Es un requisito dirigido a los administradores, no a los usuarios.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.3'],
      type: 'table',
      example: 'A. Martínez | monitorización del proxy y respuesta a incidentes | 2026-02-10 | 2027-02-10',
      columns: [
        {
          name: 'persona',
          label: 'Persona',
          type: 'string',
          required: true,
        },
        {
          name: 'formacion',
          label: 'Formación',
          type: 'string',
          required: true,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'date',
          required: false,
        },
        {
          name: 'vigencia',
          label: 'Vigente hasta',
          type: 'date',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'Registro documental enlazado con mp.per.4. Es un requisito que se confunde a menudo con la concienciación de mp.s.3.2, pero tiene destinatario y contenido distintos: va dirigido a quien administra, y sobre monitorización y respuesta a incidentes.',
      powerEnsUsage:
        'Registro documental enlazado con mp.per.4. Es un requisito que se confunde a menudo con la concienciación de mp.s.3.2, pero tiene destinatario y contenido distintos: va dirigido a quien administra, y sobre monitorización y respuesta a incidentes.',
      evidenceIds: ['EV-12'],
      ruleIds: [],
      ifNotConfigured:
        'mp.s.3.3 NO ACREDITADO. Se confunde con frecuencia con la concienciación general de mp.s.3.2.',
    },
    {
      id: 'P-08',
      controlId: 'mp.s.3',
      name: 'elementos_registro_navegacion',
      label: 'Elementos registro navegacion',
      description:
        'Elementos que se registran del uso de la navegación, período de retención y uso que el organismo prevé hacer de los registros. mp.s.3.r1.1 exige declarar expresamente los tres. Obligatorio en categoría ALTA.',
      levels: ['ALTO'],
      requirements: ['mp.s.3.r1.1'],
      type: 'string',
      example: 'Se registran URL, categoría, usuario, fecha y volumen; retención de 90 días; uso previsto: seguridad e investigación de incidentes',
      required: false,
      wazuhUsage:
        'Configura la ingesta y la política de retención, y queda recogido en el informe como declaración. Es además la base de información al personal: los tres extremos que el ENS pide declarar coinciden con lo que exige la transparencia en materia de protección de datos.',
      powerEnsUsage:
        'Configura la ingesta y la política de retención, y queda recogido en el informe como declaración. Es además la base de información al personal: los tres extremos que el ENS pide declarar coinciden con lo que exige la transparencia en materia de protección de datos.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE y es obligatorio en ALTA. Sin declaración de elementos, retención y uso, el registro carece de base.',
    },
    {
      id: 'P-09',
      controlId: 'mp.s.3',
      name: 'inspeccion_canales_cifrados',
      label: 'Inspeccion canales cifrados',
      description:
        'Función de ruptura de canales cifrados para inspeccionar su contenido, con las cuatro declaraciones que el ENS exige —qué se analiza, qué se registra, cuánto se retiene y qué uso se prevé— y la relación de destinos de confianza con acceso cifrado autorizado sin inspección.',
      levels: ['ALTO'],
      requirements: ['mp.s.3.r1.2'],
      type: 'string',
      example: 'Se analiza el contenido descargado y se registran la URL y el veredicto, con retención de 90 días; destinos excluidos: banca, salud y asesoramiento jurídico',
      required: false,
      wazuhUsage:
        'Configura la inspección y, sobre todo, sus exclusiones. El propio ENS prevé la salvedad de los accesos cifrados singulares a destinos de confianza, y es el parámetro que acota una medida con implicaciones que van más allá del ENS.',
      powerEnsUsage:
        'Power ENS verifica que la inspección respeta las exclusiones declaradas.',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE. Y si la inspección se aplica sin las declaraciones y exclusiones, el riesgo excede el del propio ENS.',
    },
    {
      id: 'P-10',
      controlId: 'mp.s.3',
      name: 'lista_negra_destinos',
      label: 'Lista negra destinos',
      description:
        'Lista negra de destinos vetados exigida por mp.s.3.r1.3 en categoría ALTA, con su fuente de actualización: listas de reputación, indicadores del CCN-CERT, destinos añadidos por decisión propia.',
      levels: ['ALTO'],
      requirements: ['mp.s.3.r1.3'],
      type: 'list',
      example: 'listas de reputación\navisos del CCN-CERT\nañadidos internos con su fecha',
      required: false,
      wazuhUsage:
        'Se carga en el proxy y como CDB list en Wazuh para detectar también los intentos que no pasen por el proxy. Enlaza con op.exp.7 R3: los indicadores de los avisos del CCN-CERT alimentan esta lista de forma natural.',
      powerEnsUsage:
        'Se carga en el proxy y como CDB list en Wazuh para detectar también los intentos que no pasen por el proxy. Enlaza con op.exp.7 R3: los indicadores de los avisos del CCN-CERT alimentan esta lista de forma natural.',
      evidenceIds: ['EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'R1 parcialmente NO EVALUABLE. No hay lista negra verificable ni detección de intentos hacia destinos vetados.',
    },
    {
      id: 'P-11',
      controlId: 'mp.s.3',
      name: 'lista_blanca_destinos',
      label: 'Lista blanca destinos',
      description:
        'Lista blanca de destinos accesibles, si se implementa. Corresponde a R2, no obligatorio en ninguna categoría, y es un modelo mucho más restrictivo que la lista negra de R1.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['mp.s.3.r2.1'],
      type: 'list',
      example: 'sede.org.es\nboe.es',
      required: false,
      wazuhUsage:
        'Power ENS verifica que todo acceso fuera de la lista queda vetado y que las excepciones responden a autorización singular expresa, como el refuerzo exige. Solo aplicable en entornos muy controlados.',
      powerEnsUsage:
        'Power ENS verifica que todo acceso fuera de la lista queda vetado y que las excepciones responden a autorización singular expresa, como el refuerzo exige. Solo aplicable en entornos muy controlados.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'R2 sin acreditar. No supone incumplimiento al no ser exigible en ninguna categoría.',
    },
  ],
};
