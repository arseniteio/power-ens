import { ENSControlConfiguration } from '../types';

export const opAcc5Configuration: ENSControlConfiguration = {
  controlId: 'op.acc.5',
  controlName: 'Mecanismo de autenticación (usuarios externos)',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.acc.5',
      name: 'refuerzo_autenticacion_elegido',
      label: 'Refuerzo autenticacion elegido',
      description:
        'Refuerzo de autenticación implementado para usuarios externos. Es una elección entre opciones, no un acumulativo. Determina qué comprobaciones ejecuta ENSFácil.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.r1 a', 'op.acc.5.r4'],
      type: 'select',
      example: 'R1 (contraseña) —solo BAJO / R2 (contraseña+OTP) / R3 (certificado cualificado) / R4 (certificado en tarjeta)',
      required: true,
      wazuhUsage:
        'Activa el conjunto de reglas correspondiente.',
      ensfacilUsage:
        'Si el sistema es de nivel MEDIO o ALTO y P-01 = R1, ENSFácil marca incumplimiento directo: la contraseña sola no es opción admisible por encima de BAJO.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'El control es NO EVALUABLE. Sin saber qué mecanismo se usa no se puede verificar ninguna de sus condiciones.',
    },
    {
      id: 'P-02',
      controlId: 'op.acc.5',
      name: 'servicios_acceso_externo',
      label: 'Servicios acceso externo',
      description:
        'Portales, aplicaciones o endpoints a través de los cuales se autentican los usuarios externos: sede electrónica, portal del ciudadano, API pública con credenciales, extranet de proveedores.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.1', 'op.acc.5.8', 'op.acc.5.r5.1'],
      type: 'list',
      example: 'sede | sede.org.es | / /var/log/nginx/sede.log',
      required: true,
      wazuhUsage:
        'Define de qué fuentes debe recoger Wazuh los eventos de autenticación externa y qué decodificador aplicar. Sin esta lista, los accesos externos no llegan al SIEM.',
      ensfacilUsage:
        'Define de qué fuentes debe recoger Wazuh los eventos de autenticación externa y qué decodificador aplicar. Sin esta lista, los accesos externos no llegan al SIEM.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'No hay ingesta de eventos de autenticación externa. Todas las evidencias quedan sin fuente.',
    },
    {
      id: 'P-03',
      controlId: 'op.acc.5',
      name: 'max_intentos_fallidos',
      label: 'Max intentos fallidos',
      description:
        'Número máximo de intentos de autenticación fallidos consecutivos antes de bloquear el acceso. El ENS exige que el número sea limitado (op.acc.5.8) pero deja la cifra a la organización.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.8'],
      type: 'number',
      example: '3, 5 o 10',
      required: true,
      wazuhUsage:
        'ENSFácil verifica en la configuración del servicio que existe el límite y genera una regla de correlación que alerta si se superan P-03 intentos sin que se produzca el bloqueo efectivo de la cuenta.',
      ensfacilUsage:
        'ENSFácil verifica en la configuración del servicio que existe el límite y genera una regla de correlación que alerta si se superan P-03 intentos sin que se produzca el bloqueo efectivo de la cuenta.',
      evidenceIds: ['EV-02', 'EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar op.acc.5.8. No se distingue un ataque de fuerza bruta de un bloqueo funcionando bien.',
    },
    {
      id: 'P-04',
      controlId: 'op.acc.5',
      name: 'procedimiento_reactivacion',
      label: 'Procedimiento reactivacion',
      description:
        'Referencia al procedimiento documentado de reactivación de cuenta tras bloqueo. El ENS exige expresamente que la intervención específica para reactivar «se describirá en la documentación».',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.8'],
      type: 'string',
      example: '«PR-07 Reactivación de credenciales v1.2»',
      required: true,
      wazuhUsage:
        'Referencia documental en el informe.',
      ensfacilUsage:
        'ENSFácil además monitoriza los eventos de desbloqueo para verificar que existe intervención explícita y no un desbloqueo automático por tiempo.',
      evidenceIds: ['EV-02', 'EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'El informe no puede acreditar la parte documental de op.acc.5.8.',
    },
    {
      id: 'P-05',
      controlId: 'op.acc.5',
      name: 'periodicidad_cambio_credenciales_dias',
      label: 'Periodicidad cambio credenciales dias',
      description:
        'Cada cuántos días deben cambiarse las credenciales de usuarios externos. El ENS remite expresamente a la política de seguridad de la organización (op.acc.5.4), no fija plazo.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.4'],
      type: 'duration_days',
      example: '90, 180 o 365 / o «n.a.» si el mecanismo / es certificado',
      required: true,
      wazuhUsage:
        'ENSFácil calcula la antigüedad de cada credencial y alerta cuando supera P-05. Si P-01 = R3 o R4, este parámetro se sustituye por la vigencia del certificado.',
      ensfacilUsage:
        'ENSFácil calcula la antigüedad de cada credencial y alerta cuando supera P-05. Si P-01 = R3 o R4, este parámetro se sustituye por la vigencia del certificado.',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar op.acc.5.4. La caducidad de credenciales queda sin control automático.',
    },
    {
      id: 'P-06',
      controlId: 'op.acc.5',
      name: 'plazo_max_inhabilitar_credencial_horas',
      label: 'Plazo max inhabilitar credencial horas',
      description:
        'Tiempo máximo admitido entre que consta o se sospecha el compromiso de una credencial y su inhabilitación efectiva (op.acc.5.5). También aplica al fin de relación con el sistema (op.acc.5.6).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.5', 'op.acc.5.6'],
      type: 'duration_hours',
      example: '4, 24 o 72',
      required: true,
      wazuhUsage:
        'ENSFácil correlaciona el evento de notificación de compromiso o de fin de relación con el evento de inhabilitación de la credencial. Si el intervalo supera P-06 → alerta.',
      ensfacilUsage:
        'ENSFácil correlaciona el evento de notificación de compromiso o de fin de relación con el evento de inhabilitación de la credencial. Si el intervalo supera P-06 → alerta.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede medir la reacción ante compromiso. op.acc.5.5 y .5.6 quedan NO EVALUABLES.',
    },
    {
      id: 'P-07',
      controlId: 'op.acc.5',
      name: 'vigencia_certificados_admitidos',
      label: 'Vigencia certificados admitidos',
      description:
        'Autoridades de certificación admitidas y política de validación (OCSP, CRL) cuando el mecanismo elegido es R3 o R4. Necesario para verificar que los certificados son efectivamente cualificados.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.5.r3.1', 'op.acc.5.r4.1'],
      type: 'list',
      example: 'FNMT-RCM | OCSP / DNIe | CRL',
      required: true,
      wazuhUsage:
        'ENSFácil verifica en los logs del servicio que los certificados presentados provienen de las AC declaradas y que se ejecuta la comprobación de revocación en cada autenticación.',
      ensfacilUsage:
        'ENSFácil verifica en los logs del servicio que los certificados presentados provienen de las AC declaradas y que se ejecuta la comprobación de revocación en cada autenticación.',
      evidenceIds: ['EV-08'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar que los certificados sean cualificados ni que se valide su estado de revocación.',
    },
    {
      id: 'P-08',
      controlId: 'op.acc.5',
      name: 'retencion_registro_accesos_dias',
      label: 'Retencion registro accesos dias',
      description:
        'Período de conservación del registro de accesos con éxito y fallidos exigido por R5 (obligatorio en MEDIO y ALTO). Debe ser coherente con el período de retención definido en op.acc.1.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.5.r5.1'],
      type: 'duration_days',
      example: '365 / (coherente con op.acc.1)',
      required: true,
      wazuhUsage:
        'Configura la política de retención de índices en Wazuh Indexer.',
      ensfacilUsage:
        'ENSFácil verifica que el registro cubre efectivamente el período declarado y alerta si hay lagunas.',
      evidenceIds: ['EV-01', 'EV-09'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede acreditar la conservación del registro exigido por R5. Riesgo de pérdida de trazabilidad.',
    },
    {
      id: 'P-09',
      controlId: 'op.acc.5',
      name: 'notificacion_ultimo_acceso',
      label: 'Notificacion ultimo acceso',
      description:
        'Indica si el servicio informa al usuario del último acceso efectuado con su identidad, exigido por op.acc.5.r5.2 en nivel MEDIO y ALTO. Es una funcionalidad del portal, no detectable en logs.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.acc.5.r5.2'],
      type: 'boolean',
      example: '(sí / no + captura o / referencia técnica)',
      required: true,
      wazuhUsage:
        'Declaración de configuración que ENSFácil recoge en el informe. No es verificable automáticamente por Wazuh: se acredita documentalmente con la evidencia aportada.',
      ensfacilUsage:
        'Declaración de configuración que ENSFácil recoge en el informe. No es verificable automáticamente por Wazuh: se acredita documentalmente con la evidencia aportada.',
      evidenceIds: [],
      ruleIds: [],
      ifNotConfigured:
        'R5 queda parcialmente sin acreditar. op.acc.5.r5.2 marcado como pendiente de evidencia documental.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.acc.5',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar, como un procedimiento aprobado o un contrato firmado. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar el registro fidedigno previo, el acuse de recibo de las credenciales, la entrega bajo control exclusivo del usuario y la información de derechos y obligaciones: nada de eso deja rastro en un log.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.acc.5.1 | Procedimiento de registro de usuarios externos | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
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
      required: true,
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
