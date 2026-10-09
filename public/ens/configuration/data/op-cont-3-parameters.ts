import { ENSControlConfiguration } from '../types';

// Parámetros de op.cont.3. Se rige por el NIVEL de la Disponibilidad y solo
// aplica con D en ALTO.
//
// La plantilla traía dos parámetros que eran, en realidad, actos fechados:
// P-04 (registro de pruebas realizadas) y P-05 (seguimiento de deficiencias).
// La decisión del 26/09 los manda a registros TSV del manager, que el
// recolector solo lee (spec 2026-10-09 §6.2). Aquí pasan a declarar DÓNDE se
// registra, como P-01 de op.exp.9: ENSFácil solo sabe leer su propio registro,
// y con otra herramienta lo que dependa de él sale sin demostrar.
//
// Y tres tablas se corrigen, porque el motor compara contra sus columnas:
//
//   P-02  `tipo` con el vocabulario de la spec (revision_documental,
//         escritorio, parcial, simulacro), que es el de la columna `tipo` del
//         registro de pruebas, y una periodicidad por tipo en meses.
//   P-03  sin la columna «última prueba»: ahora sale del registro.
//   P-07  «métrica | objetivo | tolerancia» en texto libre no se puede medir;
//         lo que el manager mide es la indisponibilidad de cada sistema, así
//         que P-07 declara el RTO por sistema (o `*` para todos).
//
// P-06 (ventanas previstas) no decide nada aquí: la medida usa la ventana REAL
// de cada fila del registro. Sirve a op.exp.7 para no escalar un simulacro
// como incidente, y se enseña en el informe.
//
// `required` en P-01, P-04 y P-05, que sostienen las dos obligaciones del
// requisito. Los demás, si faltan, los nombra el juicio de su evidencia con
// causa CONFIGURATION. Ninguno tiene valor por defecto.
const REGISTRO_PRUEBAS = 'Registro ENSFácil (/etc/ensfacil/continuity-test-register.tsv)';
const REGISTRO_DEFICIENCIAS = 'Registro ENSFácil (/etc/ensfacil/continuity-deficiency-register.tsv)';

export const opCont3Configuration: ENSControlConfiguration = {
  controlId: 'op.cont.3',
  controlName: 'Pruebas periódicas',
  family: 'Marco operacional',
  enabled: true,
  applicableLevels: ['ALTO'],
  parameters: [
    {
      id: 'P-01',
      controlId: 'op.cont.3',
      name: 'periodicidad_pruebas_meses',
      label: 'Periodicidad de las pruebas (meses)',
      description:
        'Cada cuántos meses, como máximo, debe probarse el plan de continuidad, y cada escenario de P-03. El ENS exige pruebas «periódicas» sin fijar plazo: lo determina la organización en su normativa interna. Es también la periodicidad de los tipos de prueba de P-02 que no declaran la suya, y el periodo cuyas pruebas se contrastan con lo medido (EV-04).',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'number',
      example: '12',
      required: true,
      wazuhUsage:
        'ENSFácil calcula los meses transcurridos desde la última prueba registrada y alerta al aproximarse y al superarse P-01. Es la comprobación más elemental del control y la que más incumplimientos revela.',
      ensfacilUsage:
        'En el instante en que el recolector leyó el registro de pruebas, ENSFácil mide cuánto hace de la última prueba, de la última de cada escenario de P-03 y de la última de cada tipo de P-02 sin periodicidad propia: más de P-01 meses es un incumplimiento de la primera obligación.',
      evidenceIds: ['EV-02', 'EV-04', 'EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la periodicidad exigida: op.cont.3.1 queda sin evaluar en su primera obligación (causa CONFIGURATION).',
    },
    {
      id: 'P-02',
      controlId: 'op.cont.3',
      name: 'tipos_prueba',
      label: 'Tipos de prueba previstos',
      description:
        'Modalidades de prueba previstas y qué alcance cubre cada una: revisión documental, prueba de escritorio (tabletop), prueba parcial de componentes o simulacro completo con conmutación real a medios alternativos. El tipo es el de la columna `tipo` del registro de pruebas. La periodicidad, en meses, es la de ese tipo; vacía, se aplica P-01. Admite un número de meses o mensual, bimestral, trimestral, cuatrimestral, semestral, anual o bienal.',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      example: 'simulacro | conmutación real al CPD alternativo | 12',
      columns: [
        {
          name: 'tipo',
          label: 'Tipo',
          type: 'select',
          options: ['revision_documental', 'escritorio', 'parcial', 'simulacro'],
          required: true,
        },
        {
          name: 'alcance',
          label: 'Alcance',
          type: 'string',
          required: false,
        },
        {
          name: 'periodicidad_meses',
          label: 'Periodicidad (meses)',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil registra qué tipo de prueba se realizó en cada ocasión. Importa porque no todas acreditan lo mismo: una revisión de escritorio no demuestra que los medios alternativos funcionen, y un auditor distingue perfectamente entre ambas cosas.',
      ensfacilUsage:
        'ENSFácil exige que P-02 prevea al menos un tipo que ejercite los medios alternativos (parcial o simulacro) y que el registro contenga alguna prueba de ese alcance (EV-01), y que cada tipo previsto se haya hecho dentro de su periodicidad (EV-02).',
      evidenceIds: ['EV-01', 'EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede valorar la suficiencia de las pruebas ni la periodicidad por tipo (causa CONFIGURATION).',
    },
    {
      id: 'P-03',
      controlId: 'op.cont.3',
      name: 'escenarios_prueba',
      label: 'Escenarios de interrupción que hay que probar',
      description:
        'Escenarios de interrupción que deben probarse, derivados del análisis de impacto y del análisis de riesgos: pérdida de CPD, caída de proveedor crítico, indisponibilidad de personal clave, ciberincidente con cifrado de datos. El nombre del escenario es el que se escribe en la columna `escenario` del registro de pruebas (sin distinguir mayúsculas ni tildes). La fecha de su última prueba sale del registro.',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      example: 'pérdida total de CPD | todos',
      columns: [
        {
          name: 'escenario',
          label: 'Escenario',
          type: 'string',
          required: true,
        },
        {
          name: 'servicios_afectados',
          label: 'Servicios afectados',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil mantiene la matriz de escenarios y señala los que no se han probado nunca o cuya última prueba es más antigua que P-01. Un escenario relevante nunca probado es un hueco concreto y defendible como hallazgo.',
      ensfacilUsage:
        'ENSFácil busca en el registro de pruebas la última de cada escenario: uno que nunca se ha probado, o cuya última prueba tiene más de P-01 meses, es un incumplimiento (EV-02).',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la cobertura de escenarios: el plan puede probarse siempre con el mismo caso fácil (causa CONFIGURATION).',
    },
    {
      id: 'P-04',
      controlId: 'op.cont.3',
      name: 'registro_pruebas_realizadas',
      label: 'Registro de las pruebas realizadas',
      description:
        'Dónde se registra cada prueba ejecutada. ENSFácil solo sabe leer su propio registro: /etc/ensfacil/continuity-test-register.tsv en el manager, una fila por prueba con inicio, fin, tipo, escenario, sistemas, participantes, resultado, deficiencias y referencia (formato en la guía del runbook linux/op.cont.3). Con cualquier otra herramienta, lo que depende del registro queda sin demostrar, porque no existe la integración.',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'select',
      options: [REGISTRO_PRUEBAS, 'Otra herramienta'],
      example: REGISTRO_PRUEBAS,
      required: true,
      wazuhUsage:
        'ENSFácil conserva el histórico y lo presenta junto a la medición técnica de cada prueba, de modo que el resultado declarado pueda contrastarse con lo que efectivamente ocurrió en los sistemas.',
      ensfacilUsage:
        'El recolector del manager lee el registro en cada pasada y emite una fila por prueba, con lo que pudo medir de su ventana. Registro vacío: no consta ninguna prueba (incumple). Registro ausente: sin demostrar, causa CONFIGURATION.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'op.cont.3.1 sin acreditación: no está declarado dónde se registran las pruebas (causa CONFIGURATION).',
    },
    {
      id: 'P-05',
      controlId: 'op.cont.3',
      name: 'seguimiento_deficiencias',
      label: 'Registro del seguimiento de las deficiencias',
      description:
        'Dónde se registran las deficiencias que revela cada prueba, con su estado de corrección, responsable y plazo. Es la SEGUNDA obligación del requisito, que exige «localizar y, en su caso, corregir»: probar sin corregir no cumple. ENSFácil solo sabe leer su propio registro: /etc/ensfacil/continuity-deficiency-register.tsv en el manager, una fila por deficiencia (formato en la guía del runbook linux/op.cont.3).',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'select',
      options: [REGISTRO_DEFICIENCIAS, 'Otra herramienta'],
      example: REGISTRO_DEFICIENCIAS,
      required: true,
      wazuhUsage:
        'ENSFácil hace seguimiento del cierre y alerta de deficiencias abiertas más allá de su plazo, y de las que siguen abiertas al llegar la siguiente prueba — que es la señal más clara de que el ciclo no se cierra.',
      ensfacilUsage:
        'El recolector del manager lee el registro en cada pasada y emite una fila por deficiencia. ENSFácil da por incumplida la corrección si una deficiencia sigue abierta fuera de su plazo o después de la prueba siguiente, o si una prueba del periodo declara más deficiencias de las que el registro sigue (EV-05). Las cerradas sin versión del plan se señalan (EV-07).',
      evidenceIds: ['EV-05', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'No se puede verificar la corrección de las deficiencias, que es el incumplimiento más frecuente del control (causa CONFIGURATION).',
    },
    {
      id: 'P-06',
      controlId: 'op.cont.3',
      name: 'ventanas_prueba',
      label: 'Ventanas previstas para las pruebas',
      description:
        'Franjas previstas para la ejecución de pruebas, para que los eventos de un simulacro planificado no se traten como los de una incidencia real (op.exp.7). La medida de op.cont.3 no usa esta ventana prevista, sino la REAL que declara cada fila del registro de pruebas.',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      example: '14/03/2026 | 22:00 | 02:00 | srv-web, srv-bd',
      columns: [
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'string',
          required: true,
        },
        {
          name: 'hora_inicio',
          label: 'Hora de inicio',
          type: 'string',
          required: false,
        },
        {
          name: 'fin',
          label: 'Fin',
          type: 'string',
          required: false,
        },
        {
          // Una lista («srv-web, srv-bd»), no un identificador.
          name: 'sistemas_implicados',
          label: 'Sistemas implicados',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Permite etiquetar los eventos del período como pertenecientes a la prueba y suprimir la escalada de incidente.',
      ensfacilUsage:
        'Se enseña en el informe junto a la medición de cada prueba (EV-03). No decide ningún veredicto de op.cont.3: la medida usa la ventana real del registro.',
      evidenceIds: ['EV-03'],
      ruleIds: [],
      ifNotConfigured:
        'Los simulacros pueden generar alertas de incidente en op.exp.7. La medida de op.cont.3 no cambia.',
    },
    {
      id: 'P-07',
      controlId: 'op.cont.3',
      name: 'metricas_objetivo_prueba',
      label: 'Objetivos de recuperación (RTO por sistema)',
      description:
        'El tiempo máximo de recuperación (RTO) comprometido para cada sistema que interviene en las pruebas, en horas (admite decimales: 0,5), y la tolerancia en minutos (vacía, 0). El sistema es el nombre o el ID de su agente, como en la columna `sistemas` del registro; `*` da el RTO de los que no tienen fila propia. Todo sistema tiene que restablecerse: uno que no vuelve no alcanza su RTO.',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'table',
      example: 'srv-web | 4 | 15',
      columns: [
        {
          name: 'sistema',
          label: 'Sistema',
          type: 'identifier',
          required: true,
        },
        {
          name: 'rto_horas',
          label: 'RTO (horas)',
          type: 'string',
          required: false,
        },
        {
          name: 'tolerancia_minutos',
          label: 'Tolerancia (minutos)',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'ENSFácil mide la indisponibilidad de cada sistema durante la prueba a partir de los eventos reales y la compara con su objetivo. Es la aportación de mayor valor del control: sustituye la impresión de los participantes por una medición.',
      ensfacilUsage:
        'Para cada prueba parcial o simulacro del periodo, ENSFácil compara la caída más larga medida de cada sistema con su RTO más la tolerancia: una prueba declarada satisfactoria que no lo alcanzó es una discrepancia (EV-04).',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'El resultado de la prueba queda como valoración cualitativa, sin datos que lo respalden (causa CONFIGURATION).',
    },
  ],
};
