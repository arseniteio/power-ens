import { ENSControlConfiguration } from '../types';

// op.cont.3 parameters. Governed by the Availability level and only with D at ALTO.
// P-04 and P-05 declare WHERE the test and deficiency TSV registers of the manager are kept (the collector only
// reads them); with another tool, what depends on them is unproven. P-02, P-03 and P-07 are tables because the
// engine compares against their columns: P-02 uses the registry's \`tipo\` vocabulary (revision_documental,
// escritorio, parcial, simulacro) with a periodicity per type; P-03 has no "last test" column (it comes from the
// registry); P-07 declares the RTO per system (or \`*\`).
// P-06 decides nothing: the measurement uses the REAL window of each registry row; it serves op.exp.7 and the
// report. \`required\` everywhere except P-06; no parameter has a default value.
const REGISTRO_PRUEBAS = 'Registro Power ENS (/etc/power-ens/continuity-test-register.tsv)';
const REGISTRO_DEFICIENCIAS = 'Registro Power ENS (/etc/power-ens/continuity-deficiency-register.tsv)';

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
        'Cada cuántos meses, como máximo, debe probarse el plan de continuidad y cada escenario de P-03; el ENS exige pruebas «periódicas» sin fijar plazo. Es también la periodicidad de los tipos de P-02 sin la suya y el periodo cuyas pruebas se contrastan con lo medido (EV-04).',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'number',
      example: '12',
      required: true,
      wazuhUsage:
        'Power ENS calcula los meses desde la última prueba registrada y alerta al aproximarse y al superarse P-01. Es la comprobación más elemental del control.',
      powerEnsUsage:
        'Al leer el registro de pruebas, mide cuánto hace de la última prueba, de la última de cada escenario de P-03 y de la última de cada tipo de P-02 sin periodicidad propia: más de P-01 meses incumple la primera obligación.',
      evidenceIds: ['EV-02', 'EV-04', 'EV-05'],
      ruleIds: [],
      ifNotConfigured:
        'No se verifica la periodicidad: op.cont.3.1 queda sin evaluar en su primera obligación (causa CONFIGURATION).',
    },
    {
      id: 'P-02',
      controlId: 'op.cont.3',
      name: 'tipos_prueba',
      label: 'Tipos de prueba previstos',
      description:
        'Modalidades de prueba previstas: revisión documental, prueba de escritorio (tabletop), prueba parcial de componentes o simulacro completo con conmutación real; el tipo es el de la columna `tipo` del registro de pruebas. La periodicidad es la del tipo, en meses o mensual, bimestral, trimestral, cuatrimestral, semestral, anual o bienal; vacía, se aplica P-01.',
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
      required: true,
      wazuhUsage:
        'Power ENS registra qué tipo de prueba se hizo en cada ocasión: no todas acreditan lo mismo, y una prueba de escritorio no demuestra que los medios alternativos funcionen.',
      powerEnsUsage:
        'Exige que P-02 prevea al menos un tipo que ejercite los medios alternativos (parcial o simulacro) y que el registro contenga una prueba de ese alcance (EV-01), y que cada tipo se haya hecho dentro de su periodicidad (EV-02).',
      evidenceIds: ['EV-01', 'EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No se valora la suficiencia de las pruebas ni la periodicidad por tipo (causa CONFIGURATION).',
    },
    {
      id: 'P-03',
      controlId: 'op.cont.3',
      name: 'escenarios_prueba',
      label: 'Escenarios de interrupción que hay que probar',
      description:
        'Escenarios de interrupción que deben probarse, derivados del análisis de impacto y de riesgos: pérdida de CPD, caída de proveedor crítico, indisponibilidad de personal clave, ciberincidente con cifrado de datos. El nombre es el de la columna `escenario` del registro de pruebas (sin distinguir mayúsculas ni tildes); la fecha de su última prueba sale del registro.',
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
      required: true,
      wazuhUsage:
        'Power ENS mantiene la matriz de escenarios y señala los nunca probados o cuya última prueba supera P-01.',
      powerEnsUsage:
        'Busca en el registro la última prueba de cada escenario: uno nunca probado, o probado hace más de P-01 meses, incumple (EV-02).',
      evidenceIds: ['EV-02'],
      ruleIds: [],
      ifNotConfigured:
        'No se verifica la cobertura de escenarios: el plan podría probarse siempre con el mismo caso fácil (causa CONFIGURATION).',
    },
    {
      id: 'P-04',
      controlId: 'op.cont.3',
      name: 'registro_pruebas_realizadas',
      label: 'Registro de las pruebas realizadas',
      description:
        'Dónde se registra cada prueba ejecutada. Power ENS solo lee /etc/power-ens/continuity-test-register.tsv en el manager (una fila por prueba con inicio, fin, tipo, escenario, sistemas, participantes, resultado, deficiencias y referencia; formato en la guía del runbook linux/op.cont.3); con otra herramienta, lo que depende del registro queda sin demostrar.',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'select',
      options: [REGISTRO_PRUEBAS, 'Otra herramienta'],
      example: REGISTRO_PRUEBAS,
      required: true,
      wazuhUsage:
        'Power ENS conserva el histórico y lo presenta junto a la medición técnica de cada prueba para contrastar el resultado declarado con lo ocurrido en los sistemas.',
      powerEnsUsage:
        'El recolector del manager lee el registro en cada pasada y emite una fila por prueba con lo que midió de su ventana. Registro vacío: no consta ninguna prueba (incumple); ausente: sin demostrar, causa CONFIGURATION.',
      evidenceIds: ['EV-01', 'EV-02', 'EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'op.cont.3.1 sin acreditar: no está declarado dónde se registran las pruebas (causa CONFIGURATION).',
    },
    {
      id: 'P-05',
      controlId: 'op.cont.3',
      name: 'seguimiento_deficiencias',
      label: 'Registro del seguimiento de las deficiencias',
      description:
        'Dónde se registran las deficiencias de cada prueba, con estado de corrección, responsable y plazo; es la segunda obligación del requisito («localizar y, en su caso, corregir»). Power ENS solo lee /etc/power-ens/continuity-deficiency-register.tsv en el manager, una fila por deficiencia (formato en la guía del runbook linux/op.cont.3).',
      levels: ['ALTO'],
      requirements: ['op.cont.3.1'],
      type: 'select',
      options: [REGISTRO_DEFICIENCIAS, 'Otra herramienta'],
      example: REGISTRO_DEFICIENCIAS,
      required: true,
      wazuhUsage:
        'Power ENS sigue el cierre y alerta de deficiencias abiertas fuera de plazo o aún abiertas en la siguiente prueba, la señal más clara de que el ciclo no se cierra.',
      powerEnsUsage:
        'El recolector del manager emite una fila por deficiencia. Incumple la corrección una abierta fuera de plazo o tras la prueba siguiente, o una prueba que declara más deficiencias de las que el registro sigue (EV-05); las cerradas sin versión del plan se señalan (EV-07).',
      evidenceIds: ['EV-05', 'EV-07'],
      ruleIds: [],
      ifNotConfigured:
        'No se verifica la corrección de deficiencias, el incumplimiento más frecuente del control (causa CONFIGURATION).',
    },
    {
      id: 'P-06',
      controlId: 'op.cont.3',
      name: 'ventanas_prueba',
      label: 'Ventanas previstas para las pruebas',
      description:
        'Franjas previstas para ejecutar pruebas, como información para el informe. Power ENS no etiqueta ni suprime los eventos de un simulacro: la medida de op.cont.3 usa la ventana REAL de cada fila del registro de pruebas, no esta.',
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
          // A list ("srv-web, srv-bd"), not an identifier.
          name: 'sistemas_implicados',
          label: 'Sistemas implicados',
          type: 'string',
          required: false,
        },
      ],
      required: false,
      wazuhUsage:
        'Permite etiquetar los eventos del periodo como parte de la prueba y suprimir la escalada de incidente.',
      powerEnsUsage:
        'Se muestra en el informe junto a la medición de cada prueba (EV-03). No decide ningún veredicto.',
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
        'RTO comprometido de cada sistema que interviene en las pruebas, en horas (admite decimales: 0,5), y tolerancia en minutos (vacía, 0). El sistema es el nombre o ID de su agente, como en la columna `sistemas` del registro; `*` da el RTO de los que no tienen fila, y un sistema que no vuelve no alcanza su RTO.',
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
      required: true,
      wazuhUsage:
        'Power ENS mide la indisponibilidad de cada sistema durante la prueba con eventos reales y la compara con su objetivo, en lugar de la impresión de los participantes.',
      powerEnsUsage:
        'Por cada prueba parcial o simulacro del periodo compara la caída más larga de cada sistema con su RTO más la tolerancia: una prueba declarada satisfactoria que no lo alcanzó es una discrepancia (EV-04).',
      evidenceIds: ['EV-04'],
      ruleIds: [],
      ifNotConfigured:
        'El resultado de la prueba queda como valoración cualitativa, sin datos que lo respalden (causa CONFIGURATION).',
    },
  ],
};
