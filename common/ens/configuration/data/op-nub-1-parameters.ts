import { ENSControlConfiguration } from '../types';

// Parámetros de op.nub.1. Se rige por la categoría del sistema.
//
// Correcciones sobre la plantilla, porque un parámetro tiene UN tipo y el motor
// compara contra ese tipo:
//
//   P-01  gana la opción `ninguno` (spec 2026-10-09 §4.2): el sistema no presta
//         ni usa servicios en la nube y el control entero sale NO_APLICA,
//         declarado y auditable. El «+ modelo» de la plantilla vive en P-02.
//   P-02  gana la columna `uso` (utilizado / prestado): con P-01 = ambos es lo
//         único que separa los servicios de terceros (op.nub.1.2, R1) de los
//         que se prestan (op.nub.1.1). `modelo` es un desplegable.
//   P-03, P-04 y P-10  su vigencia o su fecha es una columna `date`
//         (AAAA-MM-DD): la policy las juzga contra la fecha de la evaluación y
//         un texto como «hasta 06/2027» no se puede comparar.
//   P-05  «Lista» con tres columnas: tabla, con `cumple op.pl.5` sí/no.
//   P-06  `módulo` es un desplegable con los módulos cloud de Wazuh 4.14 (o
//         `ninguno`): es lo que cruza la declaración con lo que mide el
//         recolector del manager.
//   P-07  la «política SCA equivalente» no existe en Wazuh 4.14 (no hay SCA
//         cloud): la columna es el estándar de los hallazgos de postura del
//         propio proveedor (Security Hub, Defender, Security Command Center).
//
// Y tres no están en la plantilla: P-11 (administradores cloud autorizados),
// P-12 (antigüedad máxima del pentest del proveedor) y P-13 (horas sin
// registros de una integración). Ninguno tiene valor por defecto: sin él, su
// evidencia sale NO_EVALUABLE con causa CONFIGURATION.
//
// SIN P-ATT, a propósito (decisión 1 del responsable): lo documental se juzga
// con su vigencia. op.nub.1.1 lo acredita la conformidad en vigor de cada
// servicio prestado (P-03) y op.nub.1.r1.2 la verificación de op.pl.5 en vigor
// de cada servicio de seguridad (P-05). Una atestación no caduca: si existiera,
// el motor la aplicaría a esos dos requisitos, que no tienen evidencia técnica.
//
//   P-03  cubre también los servicios PRESTADOS (op.nub.1.1).
//   P-05  gana la referencia y la vigencia de la verificación de op.pl.5.
//
// `required` solo en P-01, el que sostiene el control («GRIS: no evaluable por
// ausencia de P-01», dice la ficha). Los demás, si faltan, los nombra el juicio
// de su propia evidencia con causa CONFIGURATION.
export const opNub1Configuration: ENSControlConfiguration = {
  controlId: 'op.nub.1',
  controlName: 'Protección de servicios en la nube',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.nub.1',
      name: 'posicion_cliente',
      label: 'Posición respecto a los servicios en la nube',
      description:
        'Si el sistema PRESTA servicios en la nube al sector público (op.nub.1.1), si UTILIZA servicios en la nube de terceros (op.nub.1.2 y sus refuerzos), ambas cosas, o ninguna. Es la primera decisión del control y condiciona todo lo demás. Con «ninguno» el control entero no aplica, y queda declarado.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.1', 'op.nub.1.2'],
      type: 'select',
      options: ['prestador', 'usuario', 'ambos', 'ninguno'],
      example: 'usuario',
      required: true,
      wazuhUsage:
        'No configura nada en Wazuh: decide qué requisitos aplican. Como prestador, op.nub.1.1 se acredita con la conformidad en vigor de lo prestado (P-03); como usuario, op.nub.1.2 y R1 juzgan los servicios de terceros de P-02.',
      ensfacilUsage:
        'prestador: aplica op.nub.1.1 (la conformidad de lo prestado en P-03) y R2. usuario: aplican op.nub.1.2, R1 y R2. ambos: todos, y P-02 separa cada servicio por su columna «uso». ninguno: todo el control NO_APLICA.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-07', 'EV-08', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'El control es NO EVALUABLE (causa CONFIGURATION). No se puede determinar qué requisitos son exigibles ni qué evidencias pedir.',
    },
    {
      id: 'P-02',
      controlId: 'op.nub.1',
      name: 'inventario_servicios_nube',
      label: 'Inventario de servicios en la nube',
      description:
        'Relación de servicios en la nube utilizados o prestados, con su modelo (SaaS, PaaS, IaaS), proveedor, información tratada, criticidad y uso (utilizado de un tercero o prestado). Es el alcance del control: el nombre del servicio es la clave con la que se cruzan P-03 a P-11.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.1', 'op.nub.1.2', 'op.nub.1.r1.1'],
      type: 'table',
      example: 'M365 | SaaS | Microsoft | datos personales | alta | utilizado',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'modelo',
          label: 'Modelo',
          type: 'select',
          options: ['SaaS', 'PaaS', 'IaaS'],
          required: false,
        },
        {
          name: 'proveedor',
          label: 'Proveedor',
          type: 'string',
          required: false,
        },
        {
          name: 'informacion',
          label: 'Información tratada',
          type: 'string',
          required: false,
        },
        {
          name: 'criticidad',
          label: 'Criticidad',
          type: 'string',
          required: false,
        },
        {
          name: 'uso',
          label: 'Uso (utilizado o prestado)',
          type: 'select',
          options: ['utilizado', 'prestado'],
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No configura nada en Wazuh. Los servicios utilizados sin fila en P-06 (o con módulo «ninguno») se señalan en el informe como puntos ciegos de trazabilidad: es un hallazgo, no un incumplimiento (el ENS no exige integrarlos).',
      ensfacilUsage:
        'Cada servicio utilizado necesita su expediente documental (P-03, P-08, P-09 y P-10, en EV-09) y, desde MEDIA, su certificación (P-04, en EV-08). Con P-01 = ambos, la columna «uso» es obligatoria en cada fila. La detección de servicios en uso que no figuran aquí (shadow IT) no se puede hacer con ficheros locales: se informa.',
      evidenceIds: ['EV-08', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'op.nub.1.2 y R1 quedan sin evaluar (causa CONFIGURATION): no hay servicios contra los que juzgar el expediente ni la certificación.',
    },
    {
      id: 'P-03',
      controlId: 'op.nub.1',
      name: 'conformidad_ens_proveedores',
      label: 'Conformidad ENS de los proveedores',
      description:
        'Para cada servicio de P-02 —de terceros o prestado—: conformidad con el ENS (con su categoría: ENS BÁSICA, ENS MEDIA o ENS ALTA) o con la guía CCN-STIC aplicable al modelo (SaaS, PaaS, IaaS), su alcance, su fecha de vigencia y la referencia de la declaración o certificación. op.nub.1.2 lo exige de los servicios de terceros; para los que se prestan, es la acreditación de op.nub.1.1.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.1', 'op.nub.1.2'],
      type: 'table',
      example: 'M365 | ENS MEDIA | Microsoft 365 | 2027-06-30 | declaración de conformidad nº…',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'conformidad',
          label: 'Conformidad (ENS <categoría> o guía CCN-STIC)',
          type: 'string',
          required: false,
        },
        {
          name: 'alcance',
          label: 'Alcance',
          type: 'string',
          required: false,
        },
        {
          name: 'vigencia',
          label: 'Vigente hasta (AAAA-MM-DD)',
          type: 'date',
          required: false,
        },
        {
          name: 'referencia',
          label: 'Referencia',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No configura nada en Wazuh: es una declaración de la organización. ENSFácil no puede validar el documento, solo su vigencia.',
      ensfacilUsage:
        'EV-09: cada servicio utilizado de P-02 tiene que tener aquí su conformidad, vigente en la fecha de la evaluación y, si es ENS, de una categoría no inferior a la del sistema (una conformidad ENS se juzga por su categoría aunque cite una guía). Una conformidad vencida o ausente es un incumplimiento de op.nub.1.2; una vigente lo acredita documentalmente. Con P-01 = prestador o ambos, cada servicio prestado necesita aquí la suya para op.nub.1.1, con el mismo criterio.',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'op.nub.1.2 (y op.nub.1.1 si se presta algún servicio) quedan sin acreditar (causa CONFIGURATION): no se puede demostrar la conformidad de los servicios.',
    },
    {
      id: 'P-04',
      controlId: 'op.nub.1',
      name: 'certificacion_reconocida_occ',
      label: 'Certificación reconocida por el Organismo de Certificación',
      description:
        'Certificación de cada servicio de terceros bajo una metodología reconocida por el Organismo de Certificación del Esquema Nacional de Evaluación y Certificación de Seguridad de las TI, exigida por R1 desde categoría MEDIA. Es más específico que la conformidad general de P-03.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.nub.1.r1.1'],
      type: 'table',
      example: 'AWS producción | Common Criteria EAL4+ | CCN-2026-001 | 2027-03-31',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'metodologia',
          label: 'Metodología',
          type: 'string',
          required: false,
        },
        {
          name: 'n_certificado',
          label: 'Nº certificado',
          type: 'string',
          required: false,
        },
        {
          name: 'vigencia',
          label: 'Vigente hasta (AAAA-MM-DD)',
          type: 'date',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No configura nada en Wazuh: es una declaración de la organización. ENSFácil no puede validar el certificado, solo su vigencia.',
      ensfacilUsage:
        'EV-08 (R1, desde MEDIA): cada servicio utilizado de P-02 tiene que tener aquí su certificación, con metodología y número, vigente en la fecha de la evaluación. Vigente: R1 acreditado documentalmente; vencida o ausente: incumplimiento. Los días que le quedan se dicen en el informe.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'R1 queda sin acreditar (causa CONFIGURATION), y es obligatorio desde categoría MEDIA.',
    },
    {
      id: 'P-05',
      controlId: 'op.nub.1',
      name: 'servicios_seguridad_cloud',
      label: 'Servicios en la nube de seguridad',
      description:
        'Los servicios en la nube utilizados que son servicios de SEGURIDAD (un SIEM gestionado, un WAF, copias de seguridad gestionadas), a los que op.nub.1.r1.2 exige además cumplir los requisitos de op.pl.5, con lo que la organización declara de esa verificación: si cumple, la referencia del informe que lo verifica y hasta cuándo vale. Si no se usa ninguno, una sola fila «ninguno». Es un supuesto que suele pasarse por alto.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.nub.1.r1.2'],
      type: 'table',
      example: 'SIEM gestionado | SIEM | sí | informe de verificación op.pl.5 nº 12 | 2027-05-31',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio (o «ninguno»)',
          type: 'string',
          required: true,
        },
        {
          name: 'tipo_de_seguridad',
          label: 'Tipo de seguridad',
          type: 'string',
          required: false,
        },
        {
          name: 'cumple_op_pl_5',
          label: 'Cumple op.pl.5',
          type: 'select',
          options: ['sí', 'no'],
          required: false,
        },
        {
          name: 'referencia',
          label: 'Referencia de la verificación',
          type: 'string',
          required: false,
        },
        {
          name: 'vigente_hasta',
          label: 'Vigente hasta (AAAA-MM-DD)',
          type: 'date',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No configura nada en Wazuh. ENSFácil no tiene op.pl.5: se juzga la verificación declarada, con su referencia y su vigencia.',
      ensfacilUsage:
        'Una sola fila «ninguno»: R1.2 no aplica (declarado). Con servicios: cada uno con «cumple op.pl.5 = sí», la referencia de la verificación y su vigencia en la fecha de la evaluación acredita R1.2 documentalmente; «no», o la verificación vencida, es un incumplimiento. Vacío, «ninguno» junto a servicios, o una fila sin la referencia o sin la fecha: R1.2 sin evaluar (causa CONFIGURATION).',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'R1.2 queda sin evaluar (causa CONFIGURATION): no consta si se usa algún servicio en la nube de seguridad. Si no se usa ninguno, se declara una sola fila «ninguno».',
    },
    {
      id: 'P-06',
      controlId: 'op.nub.1',
      name: 'integraciones_cloud_wazuh',
      label: 'Integraciones cloud en Wazuh',
      description:
        'Por cada servicio de P-02, el módulo de Wazuh que ingiere sus registros (aws-s3, azure-logs, gcp-pubsub, gcp-bucket, office365, ms-graph, github) o «ninguno», y su ámbito (cuenta, suscripción, proyecto, tipos de registro). La credencial del proveedor la pone el cliente en un agente dedicado, nunca en el manager ni en un agent.conf compartido: ENSFácil solo lee la presencia del módulo y sus alertas. Es la pieza que añade a lo documental la medida técnica.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2', 'op.nub.1.r2.1'],
      type: 'table',
      example: 'AWS producción | aws-s3 | CloudTrail y GuardDuty de la cuenta 123456789012',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'modulo',
          label: 'Módulo de Wazuh',
          type: 'select',
          options: ['aws-s3', 'azure-logs', 'gcp-pubsub', 'gcp-bucket', 'office365', 'ms-graph', 'github', 'ninguno'],
          required: false,
        },
        {
          name: 'ambito',
          label: 'Ámbito',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Regla 111501 (cloud_integration_observed): cada 6 h el recolector del manager informa, por módulo cloud, de dónde está configurado (ossec.conf del manager, agent.conf de un grupo o, si solo se ve por sus alertas, el agente dedicado), si está habilitado, su última alerta, las de 24 h y sus errores en ossec.log.',
      ensfacilUsage:
        'EV-01: cada servicio con módulo tiene que tenerlo configurado y habilitado, sin errores en 24 h y con registros más recientes que P-13 horas. EV-04 y EV-07 se juzgan sobre esos mismos servicios. Un servicio sin integración es un hallazgo del informe, no un incumplimiento. En ALTA, R2 lee los hallazgos de postura del módulo de cada servicio.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-04', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'EV-01, EV-04 y EV-07 quedan sin evaluar (causa CONFIGURATION): no se sabe qué servicios tienen que llegar a Wazuh. op.nub.1.2 puede acreditarse igualmente con su expediente documental.',
    },
    {
      id: 'P-07',
      controlId: 'op.nub.1',
      name: 'politicas_configuracion_cloud',
      label: 'Políticas de configuración cloud',
      description:
        'Por cada servicio en la nube, la guía CCN-STIC de Configuración de Seguridad Específica que le aplica y el estándar de postura del proveedor con el que se verifica (p. ej., AWS Foundational Security Best Practices o CIS en Security Hub, la puntuación de seguridad de Microsoft Defender, Security Command Center). R2 subraya que las guías están orientadas «tanto al usuario como al proveedor». Wazuh 4.14 no tiene políticas SCA para inquilinos cloud: la verificación son los hallazgos del propio proveedor que Wazuh ingiere.',
      levels: ['ALTO'],
      requirements: ['op.nub.1.r2.1'],
      type: 'table',
      example: 'AWS producción | CCN-STIC-887 | AWS Foundational Security Best Practices',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'guia_ccn_stic',
          label: 'Guía CCN-STIC',
          type: 'string',
          required: false,
        },
        {
          name: 'estandar',
          label: 'Estándar de postura',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Regla 111502 (cloud_posture_finding_observed): cada 6 h el recolector del manager resume, por módulo, fuente y estándar, el último resultado de cada control de postura que el proveedor ha enviado a Wazuh.',
      ensfacilUsage:
        'EV-02 (R2, solo ALTA): cada servicio de P-07 se juzga con los hallazgos de postura del módulo que P-06 le asigna (y, si se declara, solo los de ese estándar). Un control fallido incumple R2; sin hallazgos de postura del proveedor, R2 no es automatizable y queda sin evaluar.',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'R2 queda sin evaluar (causa CONFIGURATION), y es obligatorio en categoría ALTA.',
    },
    {
      id: 'P-08',
      controlId: 'op.nub.1',
      name: 'jurisdiccion_datos',
      label: 'Jurisdicción de los datos',
      description:
        'Ubicación geográfica declarada de los datos y de sus copias en cada servicio, y jurisdicción aplicable. op.nub.1.2 d) lo exige expresamente como requisito del servicio.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      example: 'M365 | UE (Irlanda) | UE | RGPD',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'region_datos',
          label: 'Región de los datos',
          type: 'string',
          required: false,
        },
        {
          name: 'region_copias',
          label: 'Región de las copias',
          type: 'string',
          required: false,
        },
        {
          name: 'jurisdiccion',
          label: 'Jurisdicción',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No configura nada en Wazuh: es una declaración. Wazuh 4.14 no puede leer la región configurada en el proveedor sin credenciales (no hay SCA cloud), así que EV-06 la informa sin veredicto.',
      ensfacilUsage:
        'EV-09: cada servicio utilizado tiene que tener aquí la región de sus datos, la de sus copias y la jurisdicción. Una fila ausente o incompleta deja el expediente incompleto (op.nub.1.2 d).',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'El eje de jurisdicción del expediente (EV-09) queda sin evaluar (causa CONFIGURATION): op.nub.1.2 d) sin acreditar.',
    },
    {
      id: 'P-09',
      controlId: 'op.nub.1',
      name: 'cifrado_gestion_claves_cloud',
      label: 'Cifrado y gestión de claves',
      description:
        'Mecanismo de cifrado de los datos en el servicio y modelo de gestión de claves: claves gestionadas por el proveedor, por el cliente (CMK) o custodia externa (HYOK). op.nub.1.2 c) lo exige expresamente.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      example: 'AWS producción | AES-256 en S3 y EBS | KMS con CMK propia y rotación anual',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'cifrado',
          label: 'Cifrado',
          type: 'string',
          required: false,
        },
        {
          name: 'gestion_claves',
          label: 'Gestión de claves',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No configura nada en Wazuh: es una declaración. Wazuh 4.14 no tiene SCA cloud con el que verificar el cifrado configurado, así que EV-05 lo informa sin veredicto. Las claves de los servicios cloud son material criptográfico de op.exp.10.',
      ensfacilUsage:
        'EV-09: cada servicio utilizado tiene que tener aquí su cifrado y su modelo de gestión de claves. Una fila ausente, o un cifrado «no» o «ninguno», incumple op.nub.1.2 c); una fila incompleta queda sin evaluar (causa CONFIGURATION).',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'El eje de cifrado del expediente (EV-09) queda sin evaluar (causa CONFIGURATION): op.nub.1.2 c) sin acreditar.',
    },
    {
      id: 'P-10',
      controlId: 'op.nub.1',
      name: 'pentesting_proveedor',
      label: 'Pentesting del proveedor',
      description:
        'Informes o certificaciones de auditoría de pruebas de penetración del proveedor del servicio, exigidos por op.nub.1.2 a), con su fecha. Es documentación del proveedor, no una prueba que el cliente ejecute. Muchos proveedores solo facilitan un resumen ejecutivo bajo acuerdo de confidencialidad, lo que conviene anticipar en el contrato.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      example: 'AWS producción | resumen ejecutivo del pentest 2026 | 2026-02-15 | plataforma completa',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'ultimo_informe',
          label: 'Último informe',
          type: 'string',
          required: false,
        },
        {
          name: 'fecha',
          label: 'Fecha del informe (AAAA-MM-DD)',
          type: 'date',
          required: false,
        },
        {
          name: 'alcance',
          label: 'Alcance',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'No configura nada en Wazuh: es una declaración de la organización.',
      ensfacilUsage:
        'EV-09: cada servicio utilizado tiene que tener aquí su último informe de pentest, con una fecha no más vieja que P-12 meses en la fecha de la evaluación. Ausente o más viejo: el expediente queda incompleto (op.nub.1.2 a).',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'El eje del pentest del expediente (EV-09) queda sin evaluar (causa CONFIGURATION): op.nub.1.2 a) sin acreditar.',
    },
    {
      id: 'P-11',
      controlId: 'op.nub.1',
      name: 'administradores_cloud_autorizados',
      label: 'Administradores cloud autorizados',
      description:
        'Identidades autorizadas a ejecutar operaciones de administración en cada servicio en la nube integrado en Wazuh (P-06), tal como las registra el proveedor: el ARN del usuario o del rol de IAM en AWS (arn:aws:iam::123456789012:role/Admin; la raíz de la cuenta es arn:aws:iam::123456789012:root), la cuenta o la aplicación que figura como autor en Azure y la cuenta principal (correo) en Google Cloud. Es el homólogo cloud de la lista de administradores de op.exp.3, que esta policy no puede leer.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'table',
      example: 'AWS producción | arn:aws:iam::123456789012:role/Admin',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'identidad',
          label: 'Identidad (como la registra el proveedor)',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Regla 111503 (cloud_admin_operation_observed): en cada pasada el recolector del manager agrupa, por módulo, cuenta y actor, las operaciones de administración con éxito que llegan en las alertas de los módulos cloud (CloudTrail, registro de actividad de Azure, Cloud Audit Logs).',
      ensfacilUsage:
        'EV-04: cada actor humano de una operación de administración en la ventana tiene que figurar aquí para su servicio; uno que no figura incumple op.nub.1.2. Las acciones de los propios servicios del proveedor no se contrastan.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'Si hay operaciones administrativas en un servicio integrado, EV-04 queda sin evaluar (causa CONFIGURATION): no hay contra qué contrastar a sus actores.',
    },
    {
      id: 'P-12',
      controlId: 'op.nub.1',
      name: 'antiguedad_maxima_pentest_proveedor_meses',
      label: 'Antigüedad máxima del pentest del proveedor (meses)',
      description:
        'Antigüedad máxima admitida, en meses, del último informe de pruebas de penetración de cada proveedor (P-10), contada desde su fecha. op.nub.1.2 a) exige la auditoría de pentesting; lo habitual es un informe anual.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'number',
      example: '12',
      required: false,
      wazuhUsage:
        'No configura nada en Wazuh.',
      ensfacilUsage:
        'EV-09: ENSFácil compara la fecha de cada informe de P-10 con la fecha de la evaluación; un informe más viejo que P-12 meses deja el expediente del servicio incompleto (op.nub.1.2 a).',
      evidenceIds: ['EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'El eje del pentest del expediente (EV-09) queda sin evaluar (causa CONFIGURATION): no hay contra qué medir la antigüedad de los informes.',
    },
    {
      id: 'P-13',
      controlId: 'op.nub.1',
      name: 'antiguedad_maxima_registros_cloud_horas',
      label: 'Horas máximas sin registros de una integración cloud',
      description:
        'Horas que puede pasar una integración cloud declarada en P-06 sin que entre en Wazuh ningún registro suyo antes de considerar que la ingesta está parada. CloudTrail y el registro de actividad de Azure producen eventos de forma continua en una cuenta en uso; una suscripción de Pub/Sub poco activa puede necesitar más margen. El valor tiene que ser mayor que el intervalo del módulo (interval en su bloque de configuración).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.nub.1.2'],
      type: 'duration_hours',
      example: '24',
      required: false,
      wazuhUsage:
        'Regla 111501 (cloud_integration_observed): el recolector del manager anota, por módulo cloud, el instante de la última alerta suya en alerts.json (sin las de ENSFácil).',
      ensfacilUsage:
        'EV-01: la integración de un servicio de P-06 está parada si su última alerta tiene más de P-13 horas en el momento de la observación.',
      evidenceIds: ['EV-01'],
      ruleIds: [],
      ifNotConfigured:
        'EV-01 queda sin evaluar (causa CONFIGURATION) para los servicios integrados: no se puede decidir si una integración sin registros recientes está parada.',
    },
  ],
};
