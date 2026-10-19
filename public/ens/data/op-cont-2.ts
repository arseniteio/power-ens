import { ENSControl } from '../types';

export const opCont2Control: ENSControl = {
  id: 'op.cont.2',
  title: 'Plan de continuidad',
  framework: 'ENS',
  category: 'Continuidad del servicio',
  family: 'Marco operacional',
  dimension: 'Disponibilidad (ÚNICA dimensión)',
  scope: {
    activeLevels: ['ALTO'],
    declaredLevels: ['ALTO'],
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
      status: 'NO_APLICA',
      score: 0,
      condition:
        'La medida no es exigible en nivel MEDIO (Anexo II, RD 311/2022).',
    },
    alto: {
      status: 'CUMPLE',
      score: 100,
      condition:
        'op.cont.2 → Requisitos base: op.cont.2.1 a op.cont.2.5. Sin refuerzos obligatorios.',
    },
  },
  requirements: [
    {
      id: 'op.cont.2.1',
      level: ['ALTO'],
      title: 'Funciones, responsabilidades y actividades',
      description:
        'Se identificarán funciones, responsabilidades y actividades a realizar.',
      evidences: ['EV-01'],
      active: false,
    },
    {
      id: 'op.cont.2.2',
      level: ['ALTO'],
      title: 'Previsión para coordinar los medios alternativos',
      description:
        'Existirá una previsión para coordinar la entrada en servicio de los medios alternativos de forma que se garantice poder seguir prestando los servicios esenciales de la organización.',
      evidences: ['EV-01'],
      active: false,
    },
    {
      id: 'op.cont.2.3',
      level: ['ALTO'],
      title: 'Medios alternativos en acuerdos o contratos',
      description:
        'Todos los medios alternativos estarán planificados y materializados en acuerdos o contratos con los proveedores correspondientes.',
      evidences: ['EV-01', 'EV-04'],
      active: false,
    },
    {
      id: 'op.cont.2.4',
      level: ['ALTO'],
      title: 'Formación de las personas afectadas',
      description:
        'Las personas afectadas por el plan recibirán formación específica relativa a su papel en dicho plan.',
      evidences: ['EV-01', 'EV-06'],
      active: false,
    },
    {
      id: 'op.cont.2.5',
      level: ['ALTO'],
      title: 'Integración con los demás planes de continuidad',
      description:
        'El plan de continuidad será parte integral y armónica de los planes de continuidad de la organización en otras materias ajenas a la seguridad.',
      evidences: ['EV-01'],
      active: false,
    },
    {
      id: 'op.cont.2.r1.1',
      level: [],
      title: 'Plan de emergencia y contingencia (R1)',
      description:
        'Refuerzo R1 – Plan de emergencia y contingencia: Cuando se determine la necesidad de continuidad de los sistemas, deberá existir un plan de emergencia y contingencia en consonancia. En función del análisis de Impacto, se determinarán los aspectos a cubrir.',
      evidences: [],
    },
    {
      id: 'op.cont.2.r2.1',
      level: [],
      title: 'Comprobación de integridad tras una caída (R2)',
      description:
        'Refuerzo R2 – Comprobación de integridad: Ante una caída o discontinuidad del sistema, se deberá comprobar la integridad del sistema operativo, del firmware y de los ficheros de configuración.',
      evidences: ['EV-03'],
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Registro del plan de continuidad y de su vigencia',
      description:
        'Constancia del plan aprobado de P-01 (referencia, versión y fecha de aprobación) y control de que su última aprobación no tiene más antigüedad que la periodicidad de revisión de P-08 en la fecha de la evaluación. NO es verificación del contenido del plan: es control documental de existencia y vigencia. Sostiene los cinco requisitos, porque cada uno es un contenido del plan.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-02',
      requirement: ['op.cont.2.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Detección y datación de interrupciones reales del servicio',
      description:
        'Interrupciones efectivamente producidas en los sistemas que soportan servicios esenciales (caída de agente, parada de servicio, pérdida de conectividad), con su hora de inicio y de restablecimiento. Dato del informe, sin veredicto: el requisito pide una PREVISIÓN, no ausencia de caídas, y el hecho que las mediría no se recoge en esta versión.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-03',
      requirement: ['op.cont.2.r2.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Comprobación de integridad tras caída o discontinuidad (R2)',
      description:
        'Verificación de la integridad del sistema operativo, del firmware y de los ficheros de configuración de P-07 al reanudarse el servicio tras una caída. R2 no se exige en ningún nivel: solo informe. La comprobación en el arranque ya la mide op.exp.6 en cada agente (su EV-06).',
      format: 'fim_or_json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-04',
      requirement: ['op.cont.2.3'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Vigencia de los contratos de medios alternativos',
      description:
        'Cada medio alternativo de P-04 con el acuerdo o contrato que lo materializa y en vigor en la fecha de la evaluación. op.cont.2.3 exige que TODOS estén materializados en contrato: un medio sin contrato, o con el contrato vencido, es un incumplimiento directo. Se juzga la declaración, no el contrato.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-05',
      requirement: ['op.cont.2.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Coherencia de las funciones asignadas en el plan',
      description:
        'Contraste entre las personas con función en P-03 y su situación real en la organización (bajas, cambios de puesto). Dato del informe, sin veredicto: no hay directorio corporativo integrado (las bajas de op.acc.1 son cuentas de sistema, no personas), así que la declaración de P-03 se juzga en op.cont.2.1 y su coherencia la revisa el auditor.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-06',
      requirement: ['op.cont.2.4'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Estado de la formación del personal afectado',
      description:
        'Cada responsable y cada suplente de P-03 con una fila en P-05 y la formación vigente en la fecha de la evaluación. op.cont.2.4 la exige de forma expresa: una persona con función sin formación registrada, o con la formación vencida, es un incumplimiento. Se juzga la declaración, no la formación.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-07',
      requirement: ['op.cont.2.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Disponibilidad real frente a los objetivos comprometidos',
      description:
        'Disponibilidad efectiva de los sistemas que soportan servicios esenciales frente al RTO declarado en P-02. Dato del informe, sin veredicto y sin medir en esta versión: depende de las interrupciones de EV-02, que no se recogen.',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-08',
      requirement: ['op.cont.2.2'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Entrada en servicio de los medios alternativos',
      description:
        'Activación efectiva de los medios alternativos (arranque en el emplazamiento secundario, conmutación de servicios) y el intervalo desde la caída del medio habitual. Dato del informe, sin veredicto: no hay un hecho genérico que distinga «arrancó el CPD alternativo» de «arrancó una máquina».',
      format: 'json_line',
      events: [],
      wazuhRuleIds: [],
      active: false,
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'plan_continuidad_referencia',
      description:
        'El plan de continuidad aprobado: su referencia, su versión, la fecha en que se aprobó, quién lo aprobó y su responsable. Es el documento cuya existencia y vigencia sostienen los cinco requisitos. Si se conservan varias versiones, cuenta la aprobada más recientemente.',
      level: ['ALTO'],
      requirements: ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'],
      type: 'table',
      usage:
        'EV-01: el plan aprobado más recientemente no puede tener más antigüedad que la periodicidad de revisión de P-08, contada en la fecha de la evaluación. Un plan vencido deja sin acreditar los cinco requisitos, porque cada uno es un contenido del plan.',
      missingBehavior:
        'Ningún requisito se puede acreditar (causa CONFIGURATION): sin plan registrado no hay nada que acreditar ni contra qué contrastar. Bloquea el control: es obligatorio.',
    },
    {
      id: 'P-02',
      name: 'servicios_esenciales',
      description:
        'Servicios esenciales de la organización cuya prestación deben garantizar los medios alternativos, con sus objetivos de recuperación del análisis de impacto: RTO (tiempo máximo hasta restablecer el servicio) y RPO (pérdida de datos máxima admitida), escritos como un número y su unidad: 30 min, 4 h, 2 d.',
      level: ['ALTO'],
      requirements: ['op.cont.2.2'],
      type: 'table',
      usage:
        'op.cont.2.2: con el plan vigente, cada servicio esencial tiene que declarar su RTO y su RPO con una duración legible. Una fila sin ellos, o con un valor que no es una duración, deja el requisito sin acreditar y se nombra.',
      missingBehavior:
        'op.cont.2.2 queda sin acreditar (causa CONFIGURATION): no consta la previsión para los servicios esenciales ni sus objetivos de recuperación.',
    },
    {
      id: 'P-03',
      name: 'funciones_responsabilidades_plan',
      description:
        'Funciones del plan con la persona responsable, su suplente y las actividades que tiene que realizar. op.cont.2.1 lo exige de forma expresa como primer contenido del plan. Los nombres de responsable y suplente son los que se usan en P-05: se comparan sin distinguir mayúsculas ni tildes.',
      level: ['ALTO'],
      requirements: ['op.cont.2.1', 'op.cont.2.4'],
      type: 'table',
      usage:
        'op.cont.2.1: con el plan vigente, cada función con su responsable y sus actividades. op.cont.2.4: cada responsable y cada suplente de P-03 tiene que tener formación vigente en P-05.',
      missingBehavior:
        'op.cont.2.1 y op.cont.2.4 quedan sin acreditar (causa CONFIGURATION): no constan las funciones del plan ni, por tanto, quién tiene que estar formado.',
    },
    {
      id: 'P-04',
      name: 'medios_alternativos_contratados',
      description:
        'Medios alternativos previstos en el plan, cada uno con su proveedor, la referencia del acuerdo o contrato que lo materializa, la fecha hasta la que está en vigor y el tiempo de activación comprometido. op.cont.2.3 es taxativo: TODOS los medios alternativos tienen que estar materializados en un acuerdo o contrato. Un medio sin contrato se declara con la columna del contrato vacía.',
      level: ['ALTO'],
      requirements: ['op.cont.2.3'],
      type: 'table',
      usage:
        'EV-04, en op.cont.2.3: cada medio con su contrato y en vigor en la fecha de la evaluación. Un medio sin contrato o con el contrato vencido es un incumplimiento directo; uno con contrato y sin fecha de vigencia queda sin acreditar.',
      missingBehavior:
        'op.cont.2.3 queda sin acreditar (causa CONFIGURATION): no consta qué medios alternativos hay ni con qué contrato.',
    },
    {
      id: 'P-05',
      name: 'formacion_personal_plan',
      description:
        'Formación específica recibida por las personas con función en el plan (P-03) sobre su papel en él: la persona, la formación, la fecha en que la recibió y la fecha hasta la que se considera vigente. op.cont.2.4 lo exige expresamente. Enlaza con mp.per.4: conviene llevar un único registro.',
      level: ['ALTO'],
      requirements: ['op.cont.2.4'],
      type: 'table',
      usage:
        'EV-06, en op.cont.2.4: cada responsable y cada suplente de P-03 tiene que tener aquí una fila con la formación vigente en la fecha de la evaluación. Sin fila, o con la formación vencida, es un incumplimiento.',
      missingBehavior:
        'op.cont.2.4 queda sin acreditar (causa CONFIGURATION). Es un hallazgo frecuente: el plan existe pero nadie ha sido formado en él.',
    },
    {
      id: 'P-06',
      name: 'integracion_planes_organizacion',
      description:
        'Planes de continuidad de la organización en materias ajenas a la seguridad con los que el plan de continuidad del sistema es parte integral y armónica, según op.cont.2.5. Uno por línea.',
      level: ['ALTO'],
      requirements: ['op.cont.2.5'],
      type: 'list',
      usage:
        'op.cont.2.5: con el plan vigente, al menos un plan de la organización con el que se integra. Que la integración sea de verdad «armónica» es revisión documental y requiere criterio humano.',
      missingBehavior:
        'op.cont.2.5 queda sin acreditar (causa CONFIGURATION): no consta con qué otros planes de la organización se integra el de continuidad.',
    },
    {
      id: 'P-07',
      name: 'rutas_integridad_post_caida',
      description:
        'Componentes cuya integridad debe comprobarse tras una caída o discontinuidad del sistema: ficheros del sistema operativo, firmware y ficheros de configuración. Corresponde al Refuerzo R2, que el ENS no exige en ningún nivel.',
      level: ['ALTO'],
      requirements: ['op.cont.2.r2.1'],
      type: 'list',
      usage:
        'Solo informe: R2 no se exige, y la comprobación de integridad tras el arranque ya la juzga op.exp.6.',
      missingBehavior:
        'Ninguna consecuencia en el cumplimiento: R2 no se exige. El informe no puede decir qué componentes se comprueban tras una caída.',
    },
    {
      id: 'P-08',
      name: 'periodicidad_revision_plan_meses',
      description:
        'Cada cuántos meses se revisa y aprueba de nuevo el plan de continuidad. El ENS no fija la periodicidad en op.cont.2, pero un plan desactualizado no cumple su función y suele ser hallazgo de auditoría: 12 (anual) o 24 (bienal) son los valores habituales.',
      level: ['ALTO'],
      requirements: ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'],
      type: 'number',
      usage:
        'EV-01: un plan cuya última aprobación (P-01) tiene más de P-08 meses en la fecha de la evaluación está vencido, y con él los cinco requisitos.',
      missingBehavior:
        'Ningún requisito se puede acreditar (causa CONFIGURATION): no hay contra qué medir la vigencia del plan. Bloquea el control: es obligatorio.',
    },
  ],
  // No runbook or rules: no machine emits op.cont.2 facts. The policy decides everything from the screen tables.
  events: [],
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
