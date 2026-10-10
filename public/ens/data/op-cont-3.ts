import { ENSControl } from '../types';

export const opCont3Control: ENSControl = {
  id: 'op.cont.3',
  title: 'Pruebas periódicas',
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
        'op.cont.3 → Requisito base: op.cont.3.1. Sin refuerzos.',
    },
  },
  requirements: [
    {
      id: 'op.cont.3.1',
      level: ['ALTO'],
      title: 'Pruebas periódicas del plan y corrección de lo detectado',
      description:
        'Se realizarán pruebas periódicas para localizar y, en su caso, corregir los errores o deficiencias que puedan existir en el plan de continuidad.',
      evidences: ['EV-01', 'EV-02', 'EV-04', 'EV-05'],
      active: false,
    },
  ],
  evidences: [
    {
      id: 'EV-01',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Registro histórico de las pruebas realizadas',
      description:
        'Constancia de cada prueba del plan de continuidad en el registro de pruebas del manager (/etc/ensfacil/continuity-test-register.tsv): inicio y fin, tipo (revisión documental, escritorio, parcial o simulacro), escenario, sistemas implicados, participantes, resultado declarado, deficiencias detectadas y referencia al informe. Se exige al menos una prueba que ejercite los medios alternativos (parcial o simulacro), y que P-02 prevea alguna: una revisión de escritorio no demuestra que funcionen.',
      format: 'json_line',
      events: ['evidence_state', 'continuity_test_register_read', 'continuity_test_recorded'],
      wazuhRuleIds: ['111701', '111702'],
      active: false,
    },
    {
      id: 'EV-02',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Control de la periodicidad de las pruebas',
      description:
        'Meses transcurridos desde la última prueba registrada, desde la última de cada tipo de P-02 (con su periodicidad, o la de P-01) y desde la última de cada escenario de P-03, contra P-01. Los escenarios de P-03 que nunca se han probado son el hueco de cobertura más concreto. Es la verificación de la primera de las dos obligaciones del requisito.',
      format: 'json_line',
      events: ['evidence_state', 'continuity_test_register_read', 'continuity_test_recorded'],
      wazuhRuleIds: ['111702'],
      active: false,
    },
    {
      id: 'EV-03',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Medición objetiva de lo ocurrido durante la prueba',
      description:
        'Por cada prueba parcial o simulacro y cada sistema implicado que es un agente de Wazuh: la cronología de paradas (regla 506), desconexiones (504) y arranques (503) de su agente en la ventana real de la prueba (la de su fila del registro, no la prevista en P-06) y en las 24 h siguientes, de alerts.json del manager y sus archivos diarios. De ella sale la indisponibilidad medida de cada sistema, que juzga EV-04 contra P-07.',
      format: 'json_line',
      events: ['evidence_state', 'availability_event_observed'],
      wazuhRuleIds: ['111705'],
      active: false,
    },
    {
      id: 'EV-04',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Resultado de la prueba frente a los objetivos comprometidos',
      description:
        'Por cada prueba parcial o simulacro del periodo de P-01: la indisponibilidad más larga medida de cada sistema implicado frente a su RTO de P-07 (con su tolerancia), si se restableció, y el resultado de las restauraciones de copias de la ventana, contrastados con el resultado declarado en el registro. Una prueba declarada satisfactoria cuya medida no alcanzó los objetivos es la discrepancia que este control persigue.',
      format: 'json_line',
      events: ['evidence_state', 'continuity_test_recorded', 'availability_event_observed', 'backup_restore_observed'],
      wazuhRuleIds: ['111702', '111705', '111706'],
      active: false,
    },
    {
      id: 'EV-05',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Deficiencias detectadas y seguimiento de su corrección',
      description:
        'Las deficiencias que cada prueba revela, en el registro de deficiencias del manager (/etc/ensfacil/continuity-deficiency-register.tsv), con su prueba de origen, responsable, plazo, estado y cierre. No cumple una deficiencia abierta fuera de plazo, una que sigue abierta cuando ya se hizo la prueba siguiente, ni una prueba del periodo que declara más deficiencias de las que el registro sigue. Cubre la SEGUNDA obligación del requisito, que exige corregir y no solo localizar.',
      format: 'json_line',
      events: ['evidence_state', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded'],
      wazuhRuleIds: ['111703', '111704'],
      active: false,
    },
    {
      id: 'EV-06',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Integridad y estado del sistema tras la prueba',
      description:
        'Por cada prueba parcial o simulacro y cada sistema implicado que es un agente de Wazuh: los cambios de FIM (grupo syscheck) en las 24 h siguientes al fin de su ventana, con las rutas cambiadas. Son desviaciones que la prueba pudo dejar y que deberían constar como deficiencia aunque la prueba se considerase satisfactoria. Dato del informe, sin veredicto propio.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'post_test_change_observed'],
      wazuhRuleIds: ['111707'],
      active: false,
    },
    {
      id: 'EV-07',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Actualización del plan tras las pruebas',
      description:
        'Por cada deficiencia cerrada del registro: la versión del plan de continuidad que recoge la corrección (columna version_plan). Las cerradas sin versión se señalan como corrección posiblemente nominal. Dato del informe, sin veredicto propio: no toda corrección cambia el plan, y la versión vigente del plan es de op.cont.2.',
      format: 'json_line',
      events: ['evidence_state', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded'],
      wazuhRuleIds: ['111704'],
      active: false,
    },
    {
      id: 'EV-08',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Restauración de copias de seguridad en las pruebas',
      description:
        'Las pruebas de restauración de mp.info.6 (regla 106606) que el manager recibió en la ventana de cada prueba y las 24 h siguientes, con su agente, instante, resultado y si el contenido restaurado coincide. Se leen de alerts.json del manager, sin credenciales y sin tocar mp.info.6. Dato del informe, sin veredicto propio: una restauración fallida en una prueba declarada satisfactoria la juzga EV-04.',
      format: 'json_line',
      events: ['evidence_state', 'backup_restore_observed'],
      wazuhRuleIds: ['111706'],
      active: false,
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'periodicidad_pruebas_meses',
      description:
        'Cada cuántos meses, como máximo, debe probarse el plan de continuidad, y cada escenario de P-03. El ENS exige pruebas «periódicas» sin fijar plazo: lo determina la organización en su normativa interna. Es también la periodicidad de los tipos de prueba de P-02 que no declaran la suya, y el periodo cuyas pruebas se contrastan con lo medido (EV-04).',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'number',
      usage:
        'En el instante en que el recolector leyó el registro de pruebas, ENSFácil mide cuánto hace de la última prueba, de la última de cada escenario de P-03 y de la última de cada tipo de P-02 sin periodicidad propia: más de P-01 meses es un incumplimiento de la primera obligación.',
      missingBehavior:
        'No se puede verificar la periodicidad exigida: op.cont.3.1 queda sin evaluar en su primera obligación (causa CONFIGURATION).',
    },
    {
      id: 'P-02',
      name: 'tipos_prueba',
      description:
        'Modalidades de prueba previstas y qué alcance cubre cada una: revisión documental, prueba de escritorio (tabletop), prueba parcial de componentes o simulacro completo con conmutación real a medios alternativos. El tipo es el de la columna `tipo` del registro de pruebas. La periodicidad, en meses, es la de ese tipo; vacía, se aplica P-01. Admite un número de meses o mensual, bimestral, trimestral, cuatrimestral, semestral, anual o bienal.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      usage:
        'ENSFácil exige que P-02 prevea al menos un tipo que ejercite los medios alternativos (parcial o simulacro) y que el registro contenga alguna prueba de ese alcance (EV-01), y que cada tipo previsto se haya hecho dentro de su periodicidad (EV-02).',
      missingBehavior:
        'No se puede valorar la suficiencia de las pruebas ni la periodicidad por tipo (causa CONFIGURATION).',
    },
    {
      id: 'P-03',
      name: 'escenarios_prueba',
      description:
        'Escenarios de interrupción que deben probarse, derivados del análisis de impacto y del análisis de riesgos: pérdida de CPD, caída de proveedor crítico, indisponibilidad de personal clave, ciberincidente con cifrado de datos. El nombre del escenario es el que se escribe en la columna `escenario` del registro de pruebas (sin distinguir mayúsculas ni tildes). La fecha de su última prueba sale del registro.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      usage:
        'ENSFácil busca en el registro de pruebas la última de cada escenario: uno que nunca se ha probado, o cuya última prueba tiene más de P-01 meses, es un incumplimiento (EV-02).',
      missingBehavior:
        'No se puede verificar la cobertura de escenarios: el plan puede probarse siempre con el mismo caso fácil (causa CONFIGURATION).',
    },
    {
      id: 'P-04',
      name: 'registro_pruebas_realizadas',
      description:
        'Dónde se registra cada prueba ejecutada. ENSFácil solo sabe leer su propio registro: /etc/ensfacil/continuity-test-register.tsv en el manager, una fila por prueba con inicio, fin, tipo, escenario, sistemas, participantes, resultado, deficiencias y referencia (formato en la guía del runbook linux/op.cont.3). Con cualquier otra herramienta, lo que depende del registro queda sin demostrar, porque no existe la integración.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'select',
      usage:
        'El recolector del manager lee el registro en cada pasada y emite una fila por prueba, con lo que pudo medir de su ventana. Registro vacío: no consta ninguna prueba (incumple). Registro ausente: sin demostrar, causa CONFIGURATION.',
      missingBehavior:
        'op.cont.3.1 sin acreditación: no está declarado dónde se registran las pruebas (causa CONFIGURATION).',
    },
    {
      id: 'P-05',
      name: 'seguimiento_deficiencias',
      description:
        'Dónde se registran las deficiencias que revela cada prueba, con su estado de corrección, responsable y plazo. Es la SEGUNDA obligación del requisito, que exige «localizar y, en su caso, corregir»: probar sin corregir no cumple. ENSFácil solo sabe leer su propio registro: /etc/ensfacil/continuity-deficiency-register.tsv en el manager, una fila por deficiencia (formato en la guía del runbook linux/op.cont.3).',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'select',
      usage:
        'El recolector del manager lee el registro en cada pasada y emite una fila por deficiencia. ENSFácil da por incumplida la corrección si una deficiencia sigue abierta fuera de su plazo o después de la prueba siguiente, o si una prueba del periodo declara más deficiencias de las que el registro sigue (EV-05). Las cerradas sin versión del plan se señalan (EV-07).',
      missingBehavior:
        'No se puede verificar la corrección de las deficiencias, que es el incumplimiento más frecuente del control (causa CONFIGURATION).',
    },
    {
      id: 'P-06',
      name: 'ventanas_prueba',
      description:
        'Franjas previstas para la ejecución de pruebas, para que los eventos de un simulacro planificado no se traten como los de una incidencia real (op.exp.7). La medida de op.cont.3 no usa esta ventana prevista, sino la REAL que declara cada fila del registro de pruebas.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      usage:
        'Se enseña en el informe junto a la medición de cada prueba (EV-03). No decide ningún veredicto de op.cont.3: la medida usa la ventana real del registro.',
      missingBehavior:
        'Los simulacros pueden generar alertas de incidente en op.exp.7. La medida de op.cont.3 no cambia.',
    },
    {
      id: 'P-07',
      name: 'metricas_objetivo_prueba',
      description:
        'El tiempo máximo de recuperación (RTO) comprometido para cada sistema que interviene en las pruebas, en horas (admite decimales: 0,5), y la tolerancia en minutos (vacía, 0). El sistema es el nombre o el ID de su agente, como en la columna `sistemas` del registro; `*` da el RTO de los que no tienen fila propia. Todo sistema tiene que restablecerse: uno que no vuelve no alcanza su RTO.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      usage:
        'Para cada prueba parcial o simulacro del periodo, ENSFácil compara la caída más larga medida de cada sistema con su RTO más la tolerancia: una prueba declarada satisfactoria que no lo alcanzó es una discrepancia (EV-04).',
      missingBehavior:
        'El resultado de la prueba queda como valoración cualitativa, sin datos que lo respalden (causa CONFIGURATION).',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'continuity_test_register_read', 'continuity_test_recorded', 'availability_event_observed', 'backup_restore_observed', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded', 'post_test_change_observed'],
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
