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
        'Constancia de cada prueba del plan de continuidad con su fecha, tipo según P-02, escenario según P-03, participantes y resultado. Es la evidencia documental principal del control y lo primero que un auditor solicitará.',
      format: 'json_line',
      events: ['evidence_state', 'continuity_test_register_read', 'continuity_test_recorded'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-02',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Control de la periodicidad de las pruebas',
      description:
        'Cálculo de los meses transcurridos desde la última prueba de cada tipo y escenario, con contraste frente a la periodicidad de P-01. Es la verificación de la primera de las dos obligaciones del requisito.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-03',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Medición objetiva de lo ocurrido durante la prueba',
      description:
        'Registro de todos los eventos producidos durante la ventana de prueba declarada en P-06: caída de servicios, arranque de sistemas alternativos, conmutación de rutas, restablecimiento. Permite medir el RTO realmente alcanzado en lugar de estimarlo.',
      format: 'json_line',
      events: ['evidence_state', 'availability_event_observed'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-04',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Resultado de la prueba frente a los objetivos comprometidos',
      description:
        'Comparación entre las métricas medidas en EV-03 y los objetivos de P-07: RTO alcanzado frente al comprometido, porcentaje de servicios esenciales restablecidos, integridad de los datos recuperados. Convierte el resultado de la prueba en un dato verificable.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-05',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Deficiencias detectadas y seguimiento de su corrección',
      description:
        'Registro de las deficiencias que cada prueba revela, con su responsable, plazo y estado de cierre. Cubre la SEGUNDA obligación del requisito, que exige corregir y no solo localizar.',
      format: 'json_line',
      events: ['evidence_state', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-06',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Integridad y estado del sistema tras la prueba',
      description:
        'Verificación de que, tras una prueba que implicó conmutación o restauración, el sistema queda en el estado esperado: integridad de ficheros de configuración, versiones de software coherentes, servicios restablecidos. Una prueba puede dejar el sistema peor de lo que estaba.',
      format: 'fim_or_json_line',
      events: ['evidence_state', 'post_test_change_observed'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-07',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Actualización del plan tras las pruebas',
      description:
        'Verificación de que las deficiencias cerradas se tradujeron en actualización efectiva del plan de continuidad de op.cont.2, cerrando el bucle entre prueba, corrección y documento vigente.',
      format: 'json_line',
      events: ['evidence_state'],
      wazuhRuleIds: [],
      active: false,
    },
    {
      id: 'EV-08',
      requirement: ['op.cont.3.1'],
      level: ['ALTO'],
      expectedStatus: 'NO_APLICA',
      title: 'Restauración de copias de seguridad en las pruebas',
      description:
        'Cuando la prueba incluye restauración de copias, registro de la operación y verificación de su resultado: integridad de los datos recuperados y tiempo empleado. Enlaza con mp.info.6 (copias de seguridad), porque una copia que no se restaura no está verificada.',
      format: 'json_line',
      events: ['evidence_state', 'backup_restore_observed'],
      wazuhRuleIds: [],
      active: false,
    },
  ],
  parameters: [
    {
      id: 'P-01',
      name: 'periodicidad_pruebas_meses',
      description:
        'Cada cuántos meses deben realizarse las pruebas del plan de continuidad. El ENS exige pruebas «periódicas» sin fijar plazo: lo determina la organización en su normativa interna.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'number',
      usage:
        'ENSFácil calcula los meses transcurridos desde la última prueba registrada y alerta al aproximarse y al superarse P-01. Es la comprobación más elemental del control y la que más incumplimientos revela.',
      missingBehavior:
        'No se puede verificar la periodicidad exigida. op.cont.3.1 NO EVALUABLE en su primera obligación.',
    },
    {
      id: 'P-02',
      name: 'tipos_prueba',
      description:
        'Modalidades de prueba previstas y qué alcance cubre cada una: revisión documental, prueba de escritorio (tabletop), prueba parcial de componentes, simulacro completo con conmutación real a medios alternativos.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      usage:
        'ENSFácil registra qué tipo de prueba se realizó en cada ocasión. Importa porque no todas acreditan lo mismo: una revisión de escritorio no demuestra que los medios alternativos funcionen, y un auditor distingue perfectamente entre ambas cosas.',
      missingBehavior:
        'No se puede valorar la suficiencia de las pruebas realizadas. Riesgo de acreditar con pruebas de alcance insuficiente.',
    },
    {
      id: 'P-03',
      name: 'escenarios_prueba',
      description:
        'Escenarios de interrupción que deben probarse, derivados del análisis de impacto y del análisis de riesgos: pérdida de CPD, caída de proveedor crítico, indisponibilidad de personal clave, ciberincidente con cifrado de datos.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      usage:
        'ENSFácil mantiene la matriz de escenarios y señala los que no se han probado nunca o cuya última prueba es más antigua que P-01. Un escenario relevante nunca probado es un hueco concreto y defendible como hallazgo.',
      missingBehavior:
        'No se puede verificar la cobertura de escenarios. El plan puede probarse siempre con el mismo caso fácil.',
    },
    {
      id: 'P-04',
      name: 'registro_pruebas_realizadas',
      description:
        'Registro de cada prueba ejecutada con su fecha, tipo, escenario, participantes, resultado y deficiencias detectadas. Es la evidencia documental principal del control.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'select',
      usage:
        'ENSFácil conserva el histórico y lo presenta junto a la medición técnica de cada prueba, de modo que el resultado declarado pueda contrastarse con lo que efectivamente ocurrió en los sistemas.',
      missingBehavior:
        'op.cont.3.1 sin acreditación. Las pruebas pueden haberse hecho pero no consta ni su alcance ni su resultado.',
    },
    {
      id: 'P-05',
      name: 'seguimiento_deficiencias',
      description:
        'Deficiencias detectadas en cada prueba con su estado de corrección, responsable y plazo. Es la SEGUNDA obligación del requisito, que exige «localizar y, en su caso, corregir»: probar sin corregir no cumple.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'select',
      usage:
        'ENSFácil hace seguimiento del cierre y alerta de deficiencias abiertas más allá de su plazo, y de las que siguen abiertas al llegar la siguiente prueba — que es la señal más clara de que el ciclo no se cierra.',
      missingBehavior:
        'No se puede verificar la corrección de las deficiencias. Es el incumplimiento más frecuente del control.',
    },
    {
      id: 'P-06',
      name: 'ventanas_prueba',
      description:
        'Franjas previstas para la ejecución de pruebas, necesarias para que ENSFácil distinguya los eventos de un simulacro planificado de los de una incidencia real. Sin esta distinción, un simulacro genera alertas de incidente y una incidencia real puede confundirse con una prueba.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      usage:
        'Permite a ENSFácil etiquetar los eventos del período como pertenecientes a la prueba, suprimir la escalada de incidente y, sobre todo, medir con precisión lo ocurrido durante el simulacro.',
      missingBehavior:
        'Los simulacros generan alertas de incidente y su medición se mezcla con la operación normal.',
    },
    {
      id: 'P-07',
      name: 'metricas_objetivo_prueba',
      description:
        'Valores que la prueba debe verificar: RTO y RPO alcanzados, porcentaje de servicios esenciales restablecidos, integridad de los datos recuperados. Permiten que el resultado de la prueba sea un dato y no una valoración subjetiva.',
      level: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      usage:
        'ENSFácil mide estos valores durante la ventana de P-06 a partir de los eventos reales y los compara con los objetivos. Es la aportación de mayor valor del control: sustituye la impresión de los participantes por una medición.',
      missingBehavior:
        'El resultado de la prueba queda como valoración cualitativa, sin datos que lo respalden ante un auditor.',
    },
  ],
  events: ['evidence_state', 'control_state', 'score_snapshot', 'continuity_test_register_read', 'continuity_test_recorded', 'availability_event_observed', 'continuity_deficiency_register_read', 'continuity_deficiency_recorded', 'post_test_change_observed', 'backup_restore_observed'],
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
