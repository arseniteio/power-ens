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
        'Constancia del plan aprobado de P-01 con su versión, fecha y responsable, y control de que su antigüedad no supera la periodicidad de revisión de P-08. NO es verificación del contenido del plan: es control documental de existencia y vigencia.',
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
        'Identificación de las interrupciones efectivamente producidas en los sistemas que soportan servicios esenciales: caída de agente, parada de servicio, pérdida de conectividad, con su hora de inicio y de restablecimiento. Aporta al plan datos reales en lugar de hipótesis.',
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
        'Verificación de la integridad del sistema operativo, del firmware y de los ficheros de configuración declarados en P-07 al reanudarse el servicio tras una caída. Es el único requisito de este control con cobertura técnica directa y plena.',
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
        'Seguimiento de la vigencia de los acuerdos y contratos que materializan los medios alternativos de P-04, con alerta anticipada de vencimiento. op.cont.2.3 exige que TODOS los medios alternativos estén materializados en contrato.',
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
        'Contraste entre las personas con función asignada en P-03 y su situación real en la organización, detectando responsables que han causado baja o cambiado de puesto. Un plan con funciones asignadas a quien ya no está no cumple op.cont.2.1 en términos materiales.',
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
        'Seguimiento de la formación específica de P-05: personas con función asignada que no tienen formación registrada, o cuya formación tiene antigüedad excesiva. op.cont.2.4 la exige de forma expresa.',
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
        'Cálculo de la disponibilidad efectiva de los sistemas que soportan servicios esenciales y contraste con los RTO y RPO de P-02. Convierte los objetivos del plan en una métrica medida y no declarada.',
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
        'Detección de la activación efectiva de medios alternativos: arranque de sistemas en emplazamiento secundario, conmutación de servicios, cambio de rutas de acceso. Permite acreditar que la previsión de coordinación de op.cont.2.2 funciona cuando hace falta.',
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
        'Referencia al plan de continuidad aprobado, con su versión, fecha de aprobación, alcance y responsable. Es el documento cuya existencia constituye el cumplimiento del requisito base.',
      level: ['ALTO'],
      requirements: ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'],
      type: 'table',
      usage:
        'ENSFácil registra la referencia y vigila su vigencia, alertando cuando supere el plazo de revisión previsto. No verifica el contenido del plan: eso es revisión documental, no monitorización.',
      missingBehavior:
        'Ningún requisito se puede acreditar: sin plan registrado no hay nada que acreditar ni contra qué contrastar.',
    },
    {
      id: 'P-02',
      name: 'servicios_esenciales',
      description:
        'Servicios esenciales de la organización cuya prestación debe garantizarse mediante los medios alternativos, con sus objetivos de recuperación (RTO y RPO) si están definidos en el análisis de impacto.',
      level: ['ALTO'],
      requirements: ['op.cont.2.2'],
      type: 'table',
      usage:
        'ENSFácil vincula cada servicio esencial con los sistemas que lo soportan y puede medir la disponibilidad real de esos sistemas, contrastando las interrupciones detectadas con los RTO comprometidos.',
      missingBehavior:
        'No se puede relacionar la monitorización con los servicios esenciales ni medir el cumplimiento de los RTO.',
    },
    {
      id: 'P-03',
      name: 'funciones_responsabilidades_plan',
      description:
        'Funciones, responsabilidades y actividades asignadas en el plan, con las personas designadas para cada una. op.cont.2.1 lo exige de forma expresa como primer contenido del plan.',
      level: ['ALTO'],
      requirements: ['op.cont.2.1', 'op.cont.2.4'],
      type: 'table',
      usage:
        'ENSFácil registra la asignación y verifica su coherencia con el directorio de la organización, detectando responsables que ya no pertenecen a la entidad — un plan con responsables dados de baja es un plan inservible.',
      missingBehavior:
        'op.cont.2.1 sin acreditación. Riesgo de plan con funciones asignadas a personas que ya no están.',
    },
    {
      id: 'P-04',
      name: 'medios_alternativos_contratados',
      description:
        'Medios alternativos previstos con la referencia del acuerdo o contrato que los materializa, su alcance y vigencia. op.cont.2.3 es taxativo: TODOS los medios alternativos deben estar planificados y materializados en acuerdos o contratos.',
      level: ['ALTO'],
      requirements: ['op.cont.2.3'],
      type: 'table',
      usage:
        'ENSFácil registra y vigila la vigencia de cada contrato, alertando antes del vencimiento. Un medio alternativo previsto sin contrato vigente es un incumplimiento directo de op.cont.2.3.',
      missingBehavior:
        'op.cont.2.3 sin acreditación. No se detecta el vencimiento de contratos de medios alternativos.',
    },
    {
      id: 'P-05',
      name: 'formacion_personal_plan',
      description:
        'Registro de la formación específica recibida por las personas afectadas por el plan relativa a su papel en él, con fecha y contenido. op.cont.2.4 lo exige expresamente.',
      level: ['ALTO'],
      requirements: ['op.cont.2.4'],
      type: 'table',
      usage:
        'ENSFácil mantiene el registro y alerta de personas con función asignada en P-03 sin formación registrada, o con formación cuya antigüedad sea excesiva. Enlaza con mp.per.4.',
      missingBehavior:
        'op.cont.2.4 sin acreditación. Es un hallazgo frecuente: el plan existe pero nadie ha sido formado en él.',
    },
    {
      id: 'P-06',
      name: 'integracion_planes_organizacion',
      description:
        'Referencia a los planes de continuidad de la organización en materias ajenas a la seguridad con los que el plan de continuidad del sistema debe ser parte integral y armónica, según op.cont.2.5.',
      level: ['ALTO'],
      requirements: ['op.cont.2.5'],
      type: 'list',
      usage:
        'Referencia documental que ENSFácil recoge en el informe. La verificación de que la integración es efectivamente «armónica» es revisión documental y requiere criterio humano.',
      missingBehavior:
        'op.cont.2.5 sin acreditación. El plan puede existir aislado y contradecir otros planes de la organización.',
    },
    {
      id: 'P-07',
      name: 'rutas_integridad_post_caida',
      description:
        'Componentes cuya integridad debe comprobarse tras una caída o discontinuidad del sistema: ficheros del sistema operativo, firmware y ficheros de configuración. Corresponde al Refuerzo R2, no obligatorio pero el único técnicamente verificable de este control.',
      level: ['ALTO'],
      requirements: ['op.cont.2.r2.1'],
      type: 'list',
      usage:
        'FIM con scan_on_start y verificación de hash cubre esto de forma natural: al reiniciarse el agente tras una caída, compara el estado con la línea base y alerta de cualquier desviación. Enlaza con op.exp.6 R2.',
      missingBehavior:
        'R2 sin cobertura. No se detectarían alteraciones del sistema aprovechando una caída, que es un vector real.',
    },
    {
      id: 'P-08',
      name: 'periodicidad_revision_plan_meses',
      description:
        'Cada cuánto debe revisarse y actualizarse el plan de continuidad. El ENS no fija periodicidad en op.cont.2, pero un plan desactualizado no cumple su función y suele ser hallazgo de auditoría.',
      level: ['ALTO'],
      requirements: ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'],
      type: 'number',
      usage:
        'ENSFácil alerta cuando la antigüedad del plan registrado en P-01 supere P-08, y también cuando se produzcan cambios significativos en los sistemas que soportan servicios esenciales, que deberían motivar su revisión.',
      missingBehavior:
        'No se vigila la vigencia del plan. Riesgo de plan formalmente existente pero materialmente obsoleto.',
    },
  ],
  // Sin runbook ni reglas: ninguna máquina emite hechos de op.cont.2. Todo lo
  // decide la policy con las tablas de la pantalla.
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
