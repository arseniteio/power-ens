import { ENSControlConfiguration } from '../types';

// op.exp.10 · the policy that decides the control. The agent emits facts about the machine's cryptographic
// material and the verdict comes from contrasting them with what is decided here.
// P-01 has `estado` (activa | retirada) and `huella`: without `estado` there is no place to read the declared
// retired keys that EV-06 contrasts. P-02 is a table `ruta | modo_maximo | propietario` (an empty cell leaves
// that axis undeclared). P-06 is a table `destino | soporte | aislamiento`. P-10 is new: the notice days for
// "close to expiry" (the AMBER of the sheet); it turns nothing into a breach.
const USOS_ALGORITMO = [
  'protocolo',
  'cifrado',
  'mac',
  'intercambio',
  'firma',
  'hash',
  'hash_contrasenas',
];

export const opExp10Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.10',
  controlName: 'Protección de claves criptográficas',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.10',
      name: 'inventario_claves_criptograficas',
      label: 'Inventario de claves criptográficas',
      description:
        'Claves y material criptográfico del sistema con finalidad, soporte (HSM, fichero, almacén del SO, tarjeta), ubicación, responsable de custodia y ESTADO: activa o retirada. La huella es la de la parte pública: SHA256:… de `ssh-keygen -l -f` para SSH y sha256:<hex> de `openssl pkey -in <clave> -pubout -outform DER | sha256sum` para PEM. Una clave retirada se reconoce por su huella o, sin ella, por su ubicación exacta.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1', 'op.exp.10.3'],
      type: 'table',
      example: 'cert TLS sede | HTTPS | fichero | /etc/ssl/private/sede.key | Responsable de Sistemas | activa | sha256:3f1a…',
      columns: [
        {
          name: 'clave',
          label: 'Clave',
          type: 'string',
          required: true,
        },
        {
          name: 'finalidad',
          label: 'Finalidad',
          type: 'string',
          required: false,
        },
        {
          name: 'soporte',
          label: 'Soporte',
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
          name: 'responsable',
          label: 'Responsable',
          type: 'string',
          required: false,
        },
        {
          name: 'estado',
          label: 'Estado',
          type: 'select',
          options: ['activa', 'retirada'],
          required: true,
        },
        {
          name: 'huella',
          label: 'Huella (parte pública)',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Define qué debe vigilar ENSFácil. Las claves en HSM quedan fuera del alcance de Wazuh; las de disco son monitorizables.',
      ensfacilUsage:
        'Sin inventario, op.exp.10.1 y op.exp.10.3 no se demuestran. Las filas «retirada» se contrastan con las claves privadas halladas en disco (EV-06): si una retirada sigue presente, por huella o ubicación, op.exp.10.3 no se cumple.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.10.1 y op.exp.10.3 NO EVALUABLES: sin inventario no hay nada que vigilar ni contrastar.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.10',
      name: 'rutas_almacenes_claves',
      label: 'Almacenes de claves',
      description:
        'Directorios con material criptográfico autorizado (claves privadas, almacenes de certificados, ficheros con secretos) y protección exigida. `ruta` es el DIRECTORIO de la clave, sin barra final (/etc/ssh, /etc/ssl/private, /var/ossec/etc); una clave fuera de estos directorios está fuera de un almacén declarado. `modo_maximo` es el modo más permisivo admitido (600, 640, 400); uno más restrictivo cumple. `propietario` es la cuenta dueña esperada. Una celda vacía deja ese eje sin declarar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'table',
      example: '/etc/ssh | 600 | root',
      columns: [
        {
          name: 'ruta',
          label: 'Directorio del almacén',
          type: 'path',
          required: true,
        },
        {
          name: 'modo_maximo',
          label: 'Modo máximo',
          type: 'octal',
          required: false,
        },
        {
          name: 'propietario',
          label: 'Propietario',
          type: 'identifier',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Las mismas rutas se vigilan en lectura para EV-01: con auditd en Linux y LDAP (fichero de reglas del runbook) y con una SACL de lectura en Windows. Una ruta de P-02 sin vigilancia de lectura es un hueco que el recolector declara.',
      ensfacilUsage:
        'EV-02 contrasta el directorio de cada clave privada hallada en disco con `ruta`: una clave fuera de los almacenes es indicio de copia. EV-08 contrasta su modo y propietario con los de su fila.',
      evidenceIds: ['EV-02', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'No se distingue una clave en su almacén de una copiada fuera ni se juzga su protección: EV-02 y EV-08 NO EVALUABLES.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.10',
      name: 'algoritmos_parametros_autorizados',
      label: 'Algoritmos y parámetros autorizados',
      description:
        'Algoritmos y longitudes mínimas autorizados por el CCN (CCN-STIC-807), una fila por algoritmo y uso, escritos como FAMILIA normalizada del agente (AES-GCM, CHACHA20-POLY1305, HMAC-SHA2-256, X25519, RSA, ECDSA-P256, ED25519, SHA-256, TLS1.2, TLS1.3…; tabla completa en la guía del runbook). La longitud mínima en bits se compara con la observada (vacía: no se exige) y todo lo observado sin fila para su uso es un algoritmo NO autorizado.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.10.r1.1'],
      type: 'table',
      example: 'cifrado | AES-GCM | 128',
      columns: [
        {
          name: 'uso',
          label: 'Uso',
          type: 'select',
          options: USOS_ALGORITMO,
          required: true,
        },
        {
          name: 'algoritmo',
          label: 'Algoritmo (familia)',
          type: 'string',
          required: true,
        },
        {
          name: 'longitud_min',
          label: 'Longitud mínima (bits)',
          type: 'number',
          required: false,
        },
      ],
      minValue: 0,
      // Optional on purpose: only R1 (MEDIO and ALTO) requires it, and a reinforcement's required parameter must
      // not block the base requirements.
      required: false,
      wazuhUsage:
        'Permite cubrir R1 con solidez. Algoritmo sin fila para su uso o longitud por debajo del mínimo: hallazgo.',
      ensfacilUsage:
        'Se contrastan con esta tabla los algoritmos que ACEPTAN los servicios (EV-03), los que se NEGOCIAN (EV-04) y la clave y firma de cada certificado (EV-07).',
      evidenceIds: ['EV-03', 'EV-04', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.10.r1.1 NO EVALUABLE, obligatorio desde categoría MEDIA.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.10',
      name: 'servicios_criptograficos',
      label: 'Servicios criptográficos',
      description:
        'Servicios que emplean criptografía y cuya configuración debe verificarse. `servicio` es el nombre que emite el agente (sshd, slapd). `sistema` es el nombre del agente de Wazuh o * para todos. El puerto es informativo.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.10.r1.1'],
      type: 'table',
      example: 'sshd | * | 22',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'identifier',
          required: true,
        },
        {
          name: 'sistema',
          label: 'Sistema',
          type: 'identifier',
          required: true,
        },
        {
          name: 'puerto',
          label: 'Puerto',
          type: 'number',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Define el alcance de la verificación de R1. Un servicio no declarado queda sin exigir.',
      ensfacilUsage:
        'Todo servicio declarado para una máquina debe haberse observado en ella; si no, R1 queda sin demostrar. Los servicios observados se juzgan todos contra P-03, estén o no declarados.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'La verificación de R1 queda incompleta: sin alcance no se afirma que todos los servicios criptográficos se verificaron. op.exp.10.r1.1 NO EVALUABLE.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.10',
      name: 'separacion_generacion_explotacion',
      label: 'Separación entre generación y explotación',
      description:
        'Medios de generación de claves y medios de explotación. `medio` es el nombre del agente de Wazuh (o de un HSM o equipo sin agente); `funcion` indica generación o explotación; `aislamiento` describe la separación (red aislada, DMZ, fuera de línea).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.2', 'op.exp.10.3'],
      type: 'table',
      example: 'srv-web01 | explotacion | DMZ',
      columns: [
        {
          name: 'medio',
          label: 'Medio',
          type: 'identifier',
          required: true,
        },
        {
          name: 'funcion',
          label: 'Función',
          type: 'select',
          options: ['generacion', 'explotacion'],
          required: true,
        },
        {
          name: 'aislamiento',
          label: 'Aislamiento',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil verifica que no se ejecutan herramientas de generación de claves en los sistemas declarados de explotación.',
      ensfacilUsage:
        'EV-05: una generación de claves observada en una máquina declarada «explotacion» incumple op.exp.10.2; una máquina sin fila no se juzga. El aislamiento de red se declara aquí y no se mide.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.10.2 NO EVALUABLE: no se acredita el aislamiento que exige el requisito.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.10',
      name: 'archivo_claves_retiradas',
      label: 'Archivo de claves retiradas',
      description:
        'Dónde y en qué soporte se archivan las claves retiradas de explotación y cómo está aislado de los medios de explotación. Una fila por destino.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.3'],
      type: 'table',
      example: 'caja fuerte CPD | soporte fuera de línea | sin conexión a red',
      columns: [
        {
          name: 'destino',
          label: 'Destino',
          type: 'string',
          required: true,
        },
        {
          name: 'soporte',
          label: 'Soporte',
          type: 'string',
          required: false,
        },
        {
          name: 'aislamiento',
          label: 'Aislamiento',
          type: 'string',
          required: true,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil verifica que las claves retiradas no siguen accesibles en los sistemas de explotación, contrastando el inventario de P-01 con el material criptográfico presente en disco.',
      ensfacilUsage:
        'Sin destino de archivo, op.exp.10.3 no se demuestra. Un destino que sea una máquina declarada «explotacion» en P-05 incumple op.exp.10.3.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.10.3 NO EVALUABLE: riesgo de que claves retiradas sigan accesibles en producción.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.10',
      name: 'procedimiento_ciclo_vida_claves',
      label: 'Procedimiento de ciclo de vida de las claves',
      description:
        'Procedimiento documentado de las cinco fases del ciclo de vida de op.exp.10.1: generación, transporte al punto de explotación, custodia durante la explotación, archivo tras la retirada y destrucción final. Referencia y fases cubiertas.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'string',
      example: '«PR-20 Gestión de claves criptográficas v2», con las 5 fases documentadas',
      required: true,
      wazuhUsage:
        'Referencia documental que ENSFácil recoge en el informe con las fases cubiertas y las verificables automáticamente. Transporte y destrucción son casi siempre documentales.',
      ensfacilUsage:
        'La ficha lo pide junto a P-01: sin procedimiento, op.exp.10.1 no se demuestra aunque la custodia medida esté bien.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.10.1 NO EVALUABLE: las fases no monitorizables quedan sin soporte documental.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.10',
      name: 'personal_autorizado_claves',
      label: 'Personal autorizado a las claves',
      description:
        'Cuentas autorizadas a acceder al material criptográfico, comparadas por CUENTA de forma literal y sensible a mayúsculas. Incluye las de servicio que leen sus claves (root para sshd, wazuh para client.keys), porque un acceso sin sesión se atribuye a la cuenta del proceso.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'table',
      example: 'root | todas | total',
      columns: [
        {
          name: 'cuenta',
          label: 'Cuenta',
          type: 'identifier',
          required: true,
        },
        {
          name: 'claves',
          label: 'Claves',
          type: 'string',
          required: false,
        },
        {
          name: 'operacion',
          label: 'Operación',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Todo acceso a los almacenes vigilados por una cuenta ajena a esta lista es hallazgo. Es la comprobación que más hallazgos produce en este control.',
      ensfacilUsage:
        'EV-01 contrasta el actor de cada acceso registrado (auditd en Linux y LDAP, evento 4663 en Windows) con la columna `cuenta`. `claves` y `operacion` documentan el alcance de cada autorización y no se juzgan por clave.',
      evidenceIds: ['EV-01'],
      ruleIds: [],
      ifNotConfigured:
        'No se distingue un acceso legítimo de uno indebido: EV-01 NO EVALUABLE.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.10',
      name: 'cifradores_ccn_stic',
      label: 'Cifradores conformes a CCN-STIC',
      description:
        'Cifradores empleados y su conformidad con la guía CCN-STIC aplicable. Corresponde al refuerzo R2, no obligatorio en ninguna categoría pero relevante con información clasificada o especialmente sensible.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.r2.1'],
      type: 'table',
      example: 'producto X | CCN-STIC-8xx | certificado',
      columns: [
        {
          name: 'cifrador',
          label: 'Cifrador',
          type: 'string',
          required: true,
        },
        {
          name: 'guia_aplicable',
          label: 'Guía aplicable',
          type: 'string',
          required: false,
        },
        {
          name: 'conformidad',
          label: 'Conformidad',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil recoge la declaración de conformidad en el informe. La conformidad de un cifrador con una guía CCN-STIC es documental y de certificación de producto: Wazuh no la observa.',
      ensfacilUsage:
        'Solo informativo: R2 no es exigible en ninguna categoría.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'R2 sin acreditar. No supone incumplimiento: no es exigible en ninguna categoría.',
    },
    {
      id: 'P-10',
      controlId: 'op.exp.10',
      name: 'antelacion_caducidad_certificados',
      label: 'Antelación de caducidad de certificados',
      description:
        'Días antes de su caducidad desde los que un certificado se considera próximo a caducar. Es el ÁMBAR de la ficha: no convierte un certificado vigente en incumplimiento, lo avisa en el motivo para preparar la retirada.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'duration_days',
      example: '30',
      minValue: 0,
      required: false,
      wazuhUsage:
        'EV-07 inventaría la fecha de caducidad de cada certificado en disco.',
      ensfacilUsage:
        'Un certificado caducado incumple op.exp.10.1. Uno vigente que caduca dentro de este plazo se señala como próximo a caducar en el motivo de EV-07.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'Sin aviso anticipado: los certificados solo se señalan cuando ya han caducado.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.10',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos que acreditan un requisito que ninguna medida técnica puede demostrar. En op.exp.10 es solo R2 (op.exp.10.r2.1), no exigible; las fases del ciclo de vida fuera de los sistemas vigilados se documentan en P-07 y nunca sustituyen la evidencia técnica de op.exp.10.1.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.10.r2.1 | Certificación CCN-STIC del cifrador | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
      columns: [
        {
          name: 'requisito',
          label: 'Requisito',
          type: 'identifier',
          required: true,
        },
        {
          name: 'referencia',
          label: 'Documento',
          type: 'string',
          required: true,
        },
        {
          name: 'enlace',
          label: 'Enlace(s)',
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
          name: 'responsable',
          label: 'Declarado por',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Solo se aplica a requisitos sin evidencia técnica, por lo que nunca tapa una medida fallida.',
      ensfacilUsage:
        'Solo se aplica a requisitos sin evidencia técnica. Se marca ATESTACION y se lee «acreditado documentalmente», no «cumple».',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto sobre el cumplimiento: el único requisito documental de op.exp.10 (R2) no es exigible.',
    },
  ],
};
