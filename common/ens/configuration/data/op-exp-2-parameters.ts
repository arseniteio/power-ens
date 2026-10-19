import { ENSControlConfiguration } from '../types';

// op.exp.2 · each parameter a judgment contrasts says here HOW it is written, because the comparison is literal.
// `ruleIds` are the rules whose facts are judged against the parameter (they exist in
// ensfacil_op_exp_2_json_rules.xml); P-07 and P-ATT have none because no fact is contrasted with them.
export const opExp2Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.2',
  controlName: 'Configuración de seguridad',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.2',
      name: 'politicas_sca_por_perfil',
      label: 'Políticas SCA por perfil',
      description:
        'Línea base de seguridad de cada perfil de activo: la política SCA de Wazuh que debe evaluarse en sus máquinas, una fila por perfil (el nombre del agente salvo OPEXP2_PERFIL). En «Política SCA» van los identificadores (cis_ubuntu24-04, no «CIS Ubuntu») separados por coma, sin espacios y en orden alfabético, comparados literalmente con las políticas evaluadas.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.1', 'op.exp.2.2', 'op.exp.2.3'],
      type: 'table',
      example: 'srv-web-01 | cis_ubuntu24-04',
      columns: [
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          // `string`, not `multiselect`, on purpose: with `multiselect` it would suffice that EACH evaluated
          // policy is in the cell, and a cell with two policies would accept a machine evaluating only one. The
          // whole SET is compared.
          name: 'politica_sca',
          label: 'Política SCA',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'El recolector lee del ossec.log del agente qué políticas SCA evaluó en las últimas 36 horas y las emite como `sca_evaluation` (regla 110301).',
      ensfacilUsage:
        'EV-01 casa las políticas evaluadas con la fila del perfil (CONFORME_A_TABLA). Un perfil sin fila no incumple: es una decisión sin escribir y sale NO_EVALUABLE.',
      evidenceIds: ['EV-01'],
      ruleIds: ['110301'],
      ifNotConfigured:
        'EV-01 NO EVALUABLE: no consta la línea base de cada máquina y op.exp.2.1, .2 y .3 no se acreditan.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.2',
      name: 'servicios_justificados_por_perfil',
      label: 'Servicios justificados por perfil',
      description:
        'Servicios y puertos justificados por perfil (mínima funcionalidad), una fila por perfil. «Servicios»: procesos como los emite el agente (sshd, slapd, systemd-resolve; en el directorio, slapd:<backend>); «Puertos»: números y `efimero` para sockets UDP del rango efímero, separados por coma; una celda vacía no se contrasta.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.2'],
      type: 'table',
      example: 'srv-web-01 | sshd,systemd-resolve,systemd-network | 22121,53,68',
      columns: [
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          name: 'servicios',
          label: 'Servicios',
          type: 'multiselect',
          required: false,
        },
        {
          name: 'puertos',
          label: 'Puertos',
          type: 'multiselect',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'El recolector emite cada socket en escucha y cada función expuesta del directorio como `service_exposed` (regla 110304), con servicio, protocolo, puerto y si escucha en local o en red.',
      ensfacilUsage:
        'EV-03 casa cada función expuesta con la fila de su perfil (CONFORME_A_TABLA): servicio y puerto deben estar justificados. Lo que sobra incumple op.exp.2.2.',
      evidenceIds: ['EV-03'],
      ruleIds: ['110304'],
      ifNotConfigured:
        'op.exp.2.2 NO EVALUABLE: Wazuh ve los servicios activos pero no puede juzgar si están justificados.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.2',
      name: 'cuentas_contrasenas_estandar',
      label: 'Cuentas y contraseñas estándar',
      description:
        'Cuentas por defecto de los productos desplegados que deben haberse retirado (admin, root, sa, tomcat, cuentas de demostración), una fila por cuenta con su producto. La comparación no distingue mayúsculas.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.1'],
      type: 'table',
      example: 'admin | Zimbra',
      columns: [
        {
          name: 'cuenta',
          label: 'Cuenta',
          type: 'identifier',
          required: true,
        },
        {
          name: 'producto',
          label: 'Producto',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'El recolector emite las cuentas no retiradas (shell interactiva, contraseña utilizable o claves ssh) como `login_account` (regla 110302) y cada autenticación correcta como `account_authenticated` (regla 110303). No prueba contraseñas.',
      ensfacilUsage:
        'EV-02 comprueba que ninguna de esas cuentas figura en P-03 (NINGUNO_EN_LISTA). Con el latido confirmado, no observar ninguna es cumplimiento.',
      evidenceIds: ['EV-02'],
      ruleIds: ['110302', '110303'],
      ifNotConfigured:
        'EV-02 NO EVALUABLE: no se detecta la pervivencia de cuentas por defecto y op.exp.2.1 queda sin verificación específica.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.2',
      name: 'excepciones_autorizadas',
      label: 'Excepciones autorizadas',
      description:
        'Desviaciones de la seguridad por defecto autorizadas formalmente, una fila por desviación. «Comprobación» es la desviación EXACTA que emite el agente, con la máquina (srv-web-01:ssh_x11forwarding); sin excepciones se declara «ninguno | ninguna | Sin excepciones autorizadas», y la vigencia se muestra pero no se contrasta.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.3'],
      type: 'table',
      example: 'srv-web-01 | srv-web-01:ssh_permitrootlogin | acceso de emergencia por clave | Responsable de Seguridad | 2027-03-31',
      columns: [
        {
          name: 'activo',
          label: 'Activo',
          type: 'identifier',
          required: true,
        },
        {
          name: 'comprobacion',
          label: 'Comprobación',
          type: 'string',
          required: true,
        },
        {
          name: 'motivo',
          label: 'Motivo',
          type: 'string',
          required: false,
        },
        {
          name: 'aprobo',
          label: 'Aprobó',
          type: 'string',
          required: false,
        },
        {
          name: 'vigencia',
          label: 'Vigencia',
          type: 'date',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'El recolector emite cada valor por defecto inseguro como `insecure_default` (regla 110305), con `desviacion` = <máquina>:<comprobación>.',
      ensfacilUsage:
        'EV-04 comprueba que toda desviación observada figura en la columna Comprobación (NINGUNO_FUERA_DE_LISTA). Sin desviaciones y con latido confirmado, cumple.',
      evidenceIds: ['EV-04'],
      ruleIds: ['110305'],
      ifNotConfigured:
        'EV-04 NO EVALUABLE: sin la decisión escrita de qué se autoriza, ni una máquina sin desviaciones se da por conforme.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.2',
      name: 'umbral_cumplimiento_sca',
      label: 'Umbral de cumplimiento SCA',
      description:
        'Porcentaje mínimo de checks SCA superados, según la puntuación que calcula Wazuh por política. Ninguna puntuación observada en el periodo puede quedar por debajo.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.2', 'op.exp.2.3'],
      type: 'number',
      example: '90',
      minValue: 0,
      maxValue: 100,
      required: true,
      wazuhUsage:
        'Solo el manager guarda la puntuación SCA. El recolector la lee de la API de Wazuh con un usuario de solo lectura declarado en su .env y la emite como `sca_score` (regla 110307).',
      ensfacilUsage:
        'EV-06 comprueba que ninguna puntuación de la serie queda por debajo del umbral (UMBRAL_MINIMO). Las excepciones de P-04 no se descuentan de la puntuación.',
      evidenceIds: ['EV-06'],
      ruleIds: ['110307'],
      ifNotConfigured:
        'EV-06 NO EVALUABLE: no hay umbral contra el que juzgar la puntuación SCA.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.2',
      name: 'inventario_virtualizacion',
      label: 'Inventario de virtualización',
      description:
        'Máquinas virtuales y anfitriones gestionados con el mismo rigor que una física, una fila por máquina: hipervisor que la aloja, máquina (nombre de su agente) y gestión del anfitrión (nombre de su agente o, en cloud, referencia de su acreditación). Declarar la fila AFIRMA que el anfitrión está gestionado; una VM cuyo anfitrión no lo está no se declara y EV-05 incumple (op.exp.2.4).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.2.4'],
      type: 'table',
      example: 'pve01 | srv-web01 | agente pve01',
      columns: [
        {
          name: 'hipervisor',
          label: 'Hipervisor',
          type: 'string',
          required: false,
        },
        {
          name: 'maquina',
          label: 'Máquina',
          type: 'identifier',
          required: true,
        },
        {
          // Contrasted with no fact (the VM does not see its host): it is the DECLARED proof that the host is
          // managed, and goes to the report.
          name: 'agente',
          label: 'Gestión del anfitrión',
          type: 'string',
          required: true,
        },
      ],
      // Not required: its absence only affects op.exp.2.4 (EV-05 NO_EVALUABLE); requiring it would also block
      // op.exp.2.1, .2 and .3.
      required: false,
      wazuhUsage:
        'El recolector emite `virtualization_role` (regla 110306) si la máquina es virtual o aloja máquinas virtuales.',
      ensfacilUsage:
        'EV-05 comprueba que toda VM o anfitrión observado consta en la columna Máquina (NINGUNO_FUERA_DE_LISTA). Que el anfitrión esté gestionado lo afirma quien declara la fila; lo mide el agente del anfitrión, no el de la VM.',
      evidenceIds: ['EV-05'],
      ruleIds: ['110306'],
      ifNotConfigured:
        'op.exp.2.4 NO EVALUABLE: no se verifica que las máquinas virtuales y sus anfitriones estén gestionados.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.2',
      name: 'momento_verificacion_pre_produccion',
      label: 'Verificación previa a producción',
      description:
        'Si existe un punto de control formal antes de poner un activo en operación. op.exp.2 exige configuración segura PREVIA a la operación. Es documental: ningún hecho posterior demuestra el orden, así que ningún juicio lo contrasta y no bloquea la evaluación.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'select',
      options: ['sí', 'no'],
      example: 'sí',
      required: false,
      wazuhUsage:
        'Ningún agente lo lee.',
      ensfacilUsage:
        'Se muestra en el informe junto a EV-07. No cambia ningún veredicto.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'El informe no cita el procedimiento de puesta en producción.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.2',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos que acreditan un requisito que ninguna medida técnica puede demostrar. En op.exp.2 los cuatro requisitos tienen evidencia técnica, así que no hay ninguno al que aplicarlo; se conserva para que el control tenga la misma forma que los demás.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.2.1 | Procedimiento de bastionado previo a producción | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
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
        'Ningún agente lo lee.',
      ensfacilUsage:
        'Solo se aplica a requisitos sin evidencia técnica, por lo que nunca tapa una medida fallida.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'Sin efecto: ningún requisito de op.exp.2 es solo documental.',
    },
  ],
};
