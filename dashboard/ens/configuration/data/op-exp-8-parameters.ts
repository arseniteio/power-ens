import { ENSControlConfiguration } from '../types';

export const opExp8Configuration: ENSControlConfiguration = {
  controlId: 'op.exp.8',
  controlName: 'Registro de la actividad',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.exp.8',
      name: 'eventos_auditables',
      label: 'Eventos auditables',
      description:
        'Relación de eventos de seguridad que serán auditados, que R3 exige que figure en la documentación de seguridad del sistema. Determina el alcance de la ingesta y es el primer documento que un auditor pedirá para verificar este control.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.8.1', 'op.exp.8.r3.1'],
      type: 'table',
      example: 'autenticación | AD, sshd | todos / cambios FIM | rutas críticas | todos',
      columns: [
        {
          name: 'categor_a_de_evento',
          label: 'Categoría de evento',
          type: 'string',
          required: true,
        },
        {
          name: 'fuente',
          label: 'Fuente',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Define la configuración de log collection y los niveles de alerta.',
      ensfacilUsage:
        'ENSFácil verifica que cada categoría declarada tiene ingesta efectiva y reporta las que no generan eventos, que suelen ser fuentes mal configuradas.',
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-07', 'EV-13'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede acreditar qué se audita ni verificar la cobertura. op.exp.8.r3.1 incumplido por falta de documentación.',
    },
    {
      id: 'P-02',
      controlId: 'op.exp.8',
      name: 'servidores_en_alcance',
      label: 'Servidores en alcance',
      description:
        'Servidores en los que deben estar activados los registros de actividad. op.exp.8.2 es taxativo y específico: «se activarán los registros de actividad en los servidores», sin matices ni excepciones.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.8.2'],
      type: 'list',
      example: 'srv-dc01 | Windows | DC / srv-web01 | Linux | web',
      required: true,
      wazuhUsage:
        'ENSFácil contrasta esta lista contra los agentes activos que efectivamente reportan. Servidor declarado sin agente o con agente desconectado → hallazgo directo de op.exp.8.2.',
      ensfacilUsage:
        'ENSFácil contrasta esta lista contra los agentes activos que efectivamente reportan. Servidor declarado sin agente o con agente desconectado → hallazgo directo de op.exp.8.2.',
      evidenceIds: ['EV-02', 'EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la cobertura de servidores. op.exp.8.2 sin acreditación, siendo requisito base.',
    },
    {
      id: 'P-03',
      controlId: 'op.exp.8',
      name: 'campos_minimos_registro',
      label: 'Campos minimos registro',
      description:
        'Verificación de que los eventos ingeridos contienen los cinco campos que op.exp.8.1 exige como mínimo: identificador de usuario o entidad, fecha y hora, información sobre la que se actúa, tipo de evento y resultado (fallo o éxito).',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.exp.8.1'],
      type: 'list',
      example: 'usuario→data.srcuser / resultado→rule.groups',
      required: true,
      wazuhUsage:
        'ENSFácil audita una muestra de eventos por fuente y verifica la presencia de los cinco campos. Fuente cuyos eventos carecen de alguno → hallazgo de decodificador incompleto, que es un hallazgo técnico muy concreto y fácil de corregir.',
      ensfacilUsage:
        'ENSFácil audita una muestra de eventos por fuente y verifica la presencia de los cinco campos. Fuente cuyos eventos carecen de alguno → hallazgo de decodificador incompleto, que es un hallazgo técnico muy concreto y fácil de corregir.',
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-13'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la suficiencia del registro de auditoría. op.exp.8.1 acreditable solo por muestreo manual.',
    },
    {
      id: 'P-04',
      controlId: 'op.exp.8',
      name: 'periodicidad_revision_registros_dias',
      label: 'Periodicidad revision registros dias',
      description:
        'Cada cuánto deben revisarse los registros de actividad buscando patrones anormales. R1 exige revisión «informalmente, de forma periódica», sin fijar plazo: lo determina la organización. Obligatorio desde MEDIO.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r1.1'],
      type: 'duration_days',
      example: '7 (semanal) / o 30 (mensual)',
      required: true,
      wazuhUsage:
        'ENSFácil registra cada revisión realizada —quién, cuándo, qué alcance y qué se encontró— y alerta al superarse P-04. El término «informalmente» del ENS no exime de dejar constancia de que se hizo.',
      ensfacilUsage:
        'ENSFácil registra cada revisión realizada —quién, cuándo, qué alcance y qué se encontró— y alerta al superarse P-04. El término «informalmente» del ENS no exime de dejar constancia de que se hizo.',
      evidenceIds: ['EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'R1 NO EVALUABLE. La revisión puede estar haciéndose pero sin constancia no es acreditable ante un auditor.',
    },
    {
      id: 'P-05',
      controlId: 'op.exp.8',
      name: 'fuente_tiempo_ntp',
      label: 'Fuente tiempo ntp',
      description:
        'Servidores de tiempo empleados como referencia y si la sincronización usa mecanismos de autenticación e integridad, exigidos expresamente por R2 cuando hay sincronización con otros dispositivos.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r2.1'],
      type: 'list',
      example: 'hora.roa.es (NTS) | / autenticado / ntp.interno | NTP autenticado',
      required: true,
      wazuhUsage:
        'SCA verifica la configuración NTP de cada agente: servidores configurados, estado de sincronización y uso de autenticación. Un reloj desviado invalida la correlación temporal de todo el registro.',
      ensfacilUsage:
        'SCA verifica la configuración NTP de cada agente: servidores configurados, estado de sincronización y uso de autenticación. Un reloj desviado invalida la correlación temporal de todo el registro.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'R2 NO EVALUABLE. Riesgo grave: sin referencia de tiempo fiable ningún registro es probatorio.',
    },
    {
      id: 'P-06',
      controlId: 'op.exp.8',
      name: 'desviacion_maxima_reloj_segundos',
      label: 'Desviacion maxima reloj segundos',
      description:
        'Desviación máxima admitida entre el reloj de cada sistema y la referencia de tiempo. Determina cuándo una desincronización pasa a ser hallazgo.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r2.1'],
      type: 'number',
      example: '1, 5 o 30',
      required: true,
      wazuhUsage:
        'ENSFácil compara la marca temporal del evento en origen con la de recepción en el Manager y detecta desviaciones superiores a P-06. También vigila los eventos de cambio manual de hora, que R2 califica como función de administración.',
      ensfacilUsage:
        'ENSFácil compara la marca temporal del evento en origen con la de recepción en el Manager y detecta desviaciones superiores a P-06. También vigila los eventos de cambio manual de hora, que R2 califica como función de administración.',
      evidenceIds: ['EV-06'],
      ruleIds: [],
      ifNotConfigured:
        'No se detectan desviaciones de reloj. La correlación entre sistemas puede ser errónea sin que nadie lo advierta.',
    },
    {
      id: 'P-07',
      controlId: 'op.exp.8',
      name: 'retencion_registros_dias',
      label: 'Retencion registros dias',
      description:
        'Tiempo de retención de los registros antes de ser eliminados, que R3 exige indicar en la documentación de seguridad del sistema. Debe ser coherente con el período de retención de cuentas de op.acc.1 y con el registro de accesos de op.acc.5 y op.acc.6.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r3.1'],
      type: 'duration_days',
      example: 'autenticación: 365 / FIM: 365 / tráfico: 90',
      required: true,
      wazuhUsage:
        'Configura las políticas ISM del Wazuh Indexer.',
      ensfacilUsage:
        'ENSFácil verifica que la retención efectiva de los índices coincide con la declarada y que no hay eliminación prematura.',
      evidenceIds: ['EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'R3 NO EVALUABLE. Riesgo de eliminar registros antes de tiempo o de conservarlos sin criterio documentado.',
    },
    {
      id: 'P-08',
      controlId: 'op.exp.8',
      name: 'personal_autorizado_registros',
      label: 'Personal autorizado registros',
      description:
        'Personas autorizadas a acceder o eliminar los registros de actividad y sus copias de seguridad. R4 es taxativo: «solamente podrán ser accedidos o eliminarse por personal debidamente autorizado».',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r4.1'],
      type: 'table',
      example: 'auditor1 | solo lectura | todos / admin_siem | total | todos',
      columns: [
        {
          name: 'cuenta',
          label: 'Cuenta',
          type: 'identifier',
          required: true,
        },
        {
          name: 'permiso',
          label: 'Permiso',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'Configura los roles y políticas RBAC del Wazuh Indexer y de la API.',
      ensfacilUsage:
        'ENSFácil verifica que no existen cuentas con acceso a los índices fuera de esta lista y audita los accesos efectivamente producidos.',
      evidenceIds: ['EV-08', 'EV-09', 'EV-13'],
      ruleIds: [],
      ifNotConfigured:
        'R4 NO EVALUABLE. Es el refuerzo más delicado: acceso indiscriminado a los registros compromete su valor probatorio.',
    },
    {
      id: 'P-09',
      controlId: 'op.exp.8',
      name: 'copias_seguridad_registros',
      label: 'Copias seguridad registros',
      description:
        'Existencia, destino y periodicidad de las copias de seguridad de los registros de actividad. R4 las menciona expresamente («y, en su caso, las copias de seguridad de los mismos»), extendiéndoles la misma protección.',
      levels: ['MEDIO', 'ALTO'],
      requirements: ['op.exp.8.r4.1'],
      type: 'table',
      example: 'snapshots índices | / repo S3 cifrado | diaria',
      columns: [
        {
          name: 'alcance',
          label: 'Alcance',
          type: 'string',
          required: true,
        },
        {
          name: 'destino',
          label: 'Destino',
          type: 'string',
          required: false,
        },
        {
          name: 'frecuencia',
          label: 'Frecuencia',
          type: 'string',
          required: false,
        },
      ],
      required: true,
      wazuhUsage:
        'ENSFácil verifica la existencia y frescura de los snapshots del Indexer y que el destino tiene acceso restringido al personal de P-08. Una copia de registros accesible a cualquiera vulnera R4 igual que el índice.',
      ensfacilUsage:
        'ENSFácil verifica la existencia y frescura de los snapshots del Indexer y que el destino tiene acceso restringido al personal de P-08. Una copia de registros accesible a cualquiera vulnera R4 igual que el índice.',
      evidenceIds: ['EV-08', 'EV-09', 'EV-13'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la protección de las copias, que R4 protege con el mismo rigor que los registros originales.',
    },
    {
      id: 'P-10',
      controlId: 'op.exp.8',
      name: 'reglas_correlacion_activas',
      label: 'Reglas correlacion activas',
      description:
        'Conjunto de reglas de correlación y de detección desplegadas, y su cobertura respecto a las categorías de evento de P-01. R5 exige herramientas para analizar la actividad en búsqueda de comprometimientos posibles o reales. Obligatorio en nivel ALTO.',
      levels: ['ALTO'],
      requirements: ['op.exp.8.r5.1'],
      type: 'string',
      example: 'reglas base + CIS + / personalizadas del cliente',
      required: false,
      wazuhUsage:
        'ENSFácil documenta qué reglas están activas, qué técnicas MITRE ATT&CK cubren y qué categorías de P-01 quedan sin regla asociada. Es la acreditación directa de op.exp.8.r5.1.',
      ensfacilUsage:
        'ENSFácil documenta qué reglas están activas, qué técnicas MITRE ATT&CK cubren y qué categorías de P-01 quedan sin regla asociada. Es la acreditación directa de op.exp.8.r5.1.',
      evidenceIds: ['EV-10'],
      ruleIds: [],
      ifNotConfigured:
        'R5 parcialmente NO EVALUABLE. No se puede documentar la capacidad de análisis desplegada.',
    },
    {
      id: 'P-11',
      controlId: 'op.exp.8',
      name: 'respuesta_automatica_configurada',
      label: 'Respuesta automatica configurada',
      description:
        'Acciones de respuesta automática configuradas ante los eventos correlacionados, con su condición de disparo, alcance y mecanismo de reversión. op.exp.8.r5.2 exige «respuesta automática ante los mismos», no solo detección. Obligatorio en nivel ALTO.',
      levels: ['ALTO'],
      requirements: ['op.exp.8.r5.2'],
      type: 'table',
      example: 'bloqueo IP | fuerza bruta | / perímetro | 30 min',
      columns: [
        {
          name: 'acci_n',
          label: 'Acción',
          type: 'string',
          required: true,
        },
        {
          name: 'disparador',
          label: 'Disparador',
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
      required: false,
      wazuhUsage:
        'Configura Active Response. Nótese que R5 no se satisface solo con recolectar y correlacionar: exige respuesta automática. Un Wazuh sin Active Response cumple dos tercios de op.exp.8.r5.2.',
      ensfacilUsage:
        'Configura Active Response. Nótese que R5 no se satisface solo con recolectar y correlacionar: exige respuesta automática. Un Wazuh sin Active Response cumple dos tercios de op.exp.8.r5.2.',
      evidenceIds: ['EV-11', 'EV-12'],
      ruleIds: [],
      ifNotConfigured:
        'R5 incompleto. Se cumple la recolección y correlación pero no la respuesta automática que el requisito exige.',
    },
    {
      id: 'P-ATT',
      controlId: 'op.exp.8',
      name: 'atestaciones_documentales',
      label: 'Atestaciones documentales',
      description:
        'Documentos con los que se acredita un requisito que ninguna medida técnica puede demostrar. Se rellena una fila por requisito, con el nombre del documento y un enlace que permita consultarlo. En este control es la vía para acreditar la documentación de seguridad del registro que ninguna telemetría puede demostrar.',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: [],
      type: 'table',
      example: 'op.exp.8.r3.1 | Política de registro y retención | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-05-12 | Responsable de Seguridad',
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
