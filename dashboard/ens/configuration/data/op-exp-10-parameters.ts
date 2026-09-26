import { ENSControlConfiguration } from '../types';

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
      label: 'Inventario claves criptograficas',
      description:
        'Relación de claves y material criptográfico del sistema con su finalidad, ubicación, tipo de soporte (HSM, fichero, almacén del sistema operativo, tarjeta) y responsable de su custodia.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'table',
      example: 'cert TLS sede | HTTPS | / fichero | /etc/ssl/private',
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
      ],
      required: true,
      wazuhUsage:
        'Define qué debe vigilar ENSFácil. Las claves en HSM quedan fuera del alcance de Wazuh, pero las que residen en disco son monitorizables con FIM. Es imprescindible saber cuáles son de cada tipo.',
      ensfacilUsage:
        'Define qué debe vigilar ENSFácil. Las claves en HSM quedan fuera del alcance de Wazuh, pero las que residen en disco son monitorizables con FIM. Es imprescindible saber cuáles son de cada tipo.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'El control es NO EVALUABLE. Sin inventario de claves no hay nada que vigilar ni contra qué contrastar.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.10',
      name: 'rutas_almacenes_claves',
      label: 'Rutas almacenes claves',
      description:
        'Rutas de ficheros y directorios que contienen material criptográfico en los sistemas: claves privadas, almacenes de certificados, ficheros de configuración con secretos.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'path',
      example: '/etc/ssl/private/, / /etc/pki/tls/private/, / ~/.ssh/id_*, / almacén de certificados Windows',
      required: true,
      wazuhUsage:
        'Configura FIM con whodata sobre estas rutas. Permite detectar accesos, copias, modificaciones y eliminaciones de material criptográfico, que es la aportación más directa de Wazuh a este control.',
      ensfacilUsage:
        'Configura FIM con whodata sobre estas rutas. Permite detectar accesos, copias, modificaciones y eliminaciones de material criptográfico, que es la aportación más directa de Wazuh a este control.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'No se detecta ningún acceso ni copia indebida de claves. Se pierde la principal evidencia disponible.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.10',
      name: 'algoritmos_parametros_autorizados',
      label: 'Algoritmos parametros autorizados',
      description:
        'Algoritmos, longitudes de clave y parámetros autorizados por el CCN que deben emplearse. R1 lo exige desde categoría MEDIA y remite a la autorización del CCN, no al criterio propio de la organización.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.10.r1.1'],
      type: 'table',
      example: 'TLS | AES-256-GCM | / firma | RSA 3072 o ECDSA P-384 / hash | SHA-256 o superior',
      columns: [
        {
          name: 'uso',
          label: 'Uso',
          type: 'string',
          required: true,
        },
        {
          name: 'algoritmo',
          label: 'Algoritmo',
          type: 'string',
          required: false,
        },
        {
          name: 'longitud_m_n_',
          label: 'Longitud mín.',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Es el parámetro que permite cubrir R1 con solidez. SCA verifica los algoritmos y cifradores configurados en cada servicio y los contrasta con esta lista. Algoritmo no autorizado o longitud insuficiente → hallazgo.',
      ensfacilUsage:
        'Es el parámetro que permite cubrir R1 con solidez. SCA verifica los algoritmos y cifradores configurados en cada servicio y los contrasta con esta lista. Algoritmo no autorizado o longitud insuficiente → hallazgo.',
      evidenceIds: ['EV-03', 'EV-04', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE, siendo obligatorio desde categoría MEDIA. Es el refuerzo que Wazuh mejor podría cubrir.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.10',
      name: 'servicios_criptograficos',
      label: 'Servicios criptograficos',
      description:
        'Servicios que emplean criptografía y cuya configuración debe verificarse: servidores web y de aplicaciones, VPN, SSH, servidores de correo, bases de datos con cifrado, túneles.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.10.r1.1'],
      type: 'table',
      example: 'nginx | srv-web01 | 443 / sshd | todos | 22 / OpenVPN | fw01 | 1194',
      columns: [
        {
          name: 'servicio',
          label: 'Servicio',
          type: 'string',
          required: true,
        },
        {
          name: 'sistema',
          label: 'Sistema',
          type: 'identifier',
          required: false,
        },
        {
          name: 'puerto',
          label: 'Puerto',
          type: 'number',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Define el alcance de las comprobaciones SCA sobre configuración criptográfica y de los análisis de protocolos y cifradores negociados. Servicio no declarado queda sin verificar.',
      ensfacilUsage:
        'Define el alcance de las comprobaciones SCA sobre configuración criptográfica y de los análisis de protocolos y cifradores negociados. Servicio no declarado queda sin verificar.',
      evidenceIds: ['EV-03', 'EV-04', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'La verificación de R1 queda incompleta: servicios criptográficos fuera de alcance pueden usar algoritmos obsoletos.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.10',
      name: 'separacion_generacion_explotacion',
      label: 'Separacion generacion explotacion',
      description:
        'Identificación de los medios de generación de claves y de los medios de explotación, acreditando que están aislados. op.exp.10.2 lo exige de forma taxativa y sin matices.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.2'],
      type: 'table',
      example: 'HSM-gen | generación | / red aislada / srv-web01 | explotación | DMZ',
      columns: [
        {
          name: 'medio',
          label: 'Medio',
          type: 'string',
          required: true,
        },
        {
          name: 'funci_n',
          label: 'Función',
          type: 'string',
          required: false,
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
        'ENSFácil verifica que no se detecta actividad de generación de claves en los sistemas declarados como de explotación, y que el aislamiento de red entre ambos medios es efectivo.',
      ensfacilUsage:
        'ENSFácil verifica que no se detecta actividad de generación de claves en los sistemas declarados como de explotación, y que el aislamiento de red entre ambos medios es efectivo.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.10.2 NO EVALUABLE. No se puede acreditar el aislamiento que el requisito exige expresamente.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.10',
      name: 'archivo_claves_retiradas',
      label: 'Archivo claves retiradas',
      description:
        'Ubicación y medio donde se archivan las claves retiradas de explotación activa, acreditando que está aislado de los medios de explotación, como exige op.exp.10.3.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.3'],
      type: 'string',
      example: 'soporte offline en caja / fuerte / HSM de archivo / en red separada',
      required: true,
      wazuhUsage:
        'ENSFácil verifica que las claves retiradas no permanecen accesibles en los sistemas de explotación, contrastando el inventario P-01 con la presencia real de material criptográfico en las rutas de P-02.',
      ensfacilUsage:
        'ENSFácil verifica que las claves retiradas no permanecen accesibles en los sistemas de explotación, contrastando el inventario P-01 con la presencia real de material criptográfico en las rutas de P-02.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.10.3 NO EVALUABLE. Riesgo de que claves retiradas sigan accesibles en producción.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.10',
      name: 'procedimiento_ciclo_vida_claves',
      label: 'Procedimiento ciclo vida claves',
      description:
        'Procedimiento documentado que cubre las cinco fases del ciclo de vida que enumera op.exp.10.1: generación, transporte al punto de explotación, custodia durante la explotación, archivo posterior a la retirada y destrucción final.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'string',
      example: '«PR-20 Gestión de claves / criptográficas v2», con las / 5 fases documentadas',
      required: true,
      wazuhUsage:
        'Referencia documental que ENSFácil recoge en el informe indicando qué fases están cubiertas y qué fases son verificables automáticamente. Las fases de transporte y destrucción son casi siempre documentales.',
      ensfacilUsage:
        'Referencia documental que ENSFácil recoge en el informe indicando qué fases están cubiertas y qué fases son verificables automáticamente. Las fases de transporte y destrucción son casi siempre documentales.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'op.exp.10.1 acreditable solo parcialmente. Las fases no monitorizables quedan sin soporte documental.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.10',
      name: 'personal_autorizado_claves',
      label: 'Personal autorizado claves',
      description:
        'Personal autorizado a acceder al material criptográfico, por clave o grupo de claves. Es la referencia para juzgar si un acceso detectado por FIM es legítimo o constituye una incidencia.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.1'],
      type: 'table',
      example: 'adm_pki | todas | total / svc_nginx | cert TLS | lectura',
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
          name: 'operaci_n',
          label: 'Operación',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'CDB list en Wazuh. Todo acceso a las rutas de P-02 por una cuenta fuera de esta lista genera alerta. Es la comprobación que produce hallazgos con más frecuencia en este control.',
      ensfacilUsage:
        'CDB list en Wazuh. Todo acceso a las rutas de P-02 por una cuenta fuera de esta lista genera alerta. Es la comprobación que produce hallazgos con más frecuencia en este control.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-07', 'EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede distinguir un acceso legítimo de uno indebido. La vigilancia FIM pierde casi todo su valor.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.10',
      name: 'cifradores_ccn_stic',
      label: 'Cifradores ccn stic',
      description:
        'Cifradores empleados y su conformidad con los requisitos de la guía CCN-STIC aplicable. Corresponde al Refuerzo R2, no obligatorio en ninguna categoría pero relevante en entornos que manejan información clasificada o especialmente sensible.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.10.r2.1'],
      type: 'table',
      example: 'producto X | CCN-STIC-8xx | / certificado',
      columns: [
        {
          name: 'cifrador',
          label: 'Cifrador',
          type: 'string',
          required: true,
        },
        {
          name: 'gu_a_aplicable',
          label: 'Guía aplicable',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil recoge la declaración de conformidad en el informe. La verificación de conformidad de un cifrador con una guía CCN-STIC es documental y de certificación de producto, no observable desde Wazuh.',
      ensfacilUsage:
        'ENSFácil recoge la declaración de conformidad en el informe. La verificación de conformidad de un cifrador con una guía CCN-STIC es documental y de certificación de producto, no observable desde Wazuh.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'R2 sin acreditar. No supone incumplimiento al no ser exigible en ninguna categoría.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.10',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar las fases del ciclo de vida de las claves que ocurren fuera de los sistemas vigilados (generación en HSM, transporte, destrucción).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.10.1 | Procedimiento de ciclo de vida de las claves | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
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
