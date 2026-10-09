import { ENSControlDefinition } from './types';

export const opCont2CatalogDefinition: ENSControlDefinition = {
  id: 'op.cont.2',
  name: 'Plan de continuidad',
  family: 'Marco operacional',
  category: 'Continuidad del servicio',
  dimension: 'Disponibilidad (ÚNICA dimensión)',
  // El Anexo II aplica op.cont.2 por el NIVEL de la Disponibilidad, no por la
  // categoría del sistema, y solo en ALTO: se evalúa con `availabilityLevel`
  // de la configuración global y, si no está declarado, con el nivel ENS. Un
  // sistema de categoría MEDIA no puede tener D en ALTO, así que allí es
  // NO_APLICA siempre.
  levelDimension: 'D',
  // Es de la ORGANIZACIÓN, no de una máquina: el plan, sus funciones, sus
  // contratos y su formación se declaran en la pantalla de Configuración y la
  // policy juzga su vigencia (`policies/op-cont-2.policy.ts`). Se evalúa una
  // vez, en la fila del manager (000), como los demás controles de la
  // organización. No tiene runbook ni reglas: ninguna máquina emite hechos para
  // él (`tests/controls-without-runbook.json`).
  measurementPlanes: ['manager'],
  description:
    'op.cont.2 es un control de planificación y su acreditación es documental: existe el plan, identifica funciones, contempla medios alternativos contratados, se ha formado a las personas y está integrado con los demás planes de la organización.',
  levels: ['ALTO'],
  status: 'DRAFT',
  version: '1.0.0',
  // Las evidencias de cada requisito son las del diseño (spec 2026-10-09 §5),
  // no las que la plantilla asocia. Cada requisito es un contenido del plan
  // («dicho plan contemplará…»), así que los cinco se apoyan en EV-01 (el plan
  // y su vigencia) además de su propia declaración: 2.3 en EV-04 (contratos) y
  // 2.4 en EV-06 (formación); 2.1, 2.2 y 2.5 juzgan P-03, P-02 y P-06 en la
  // decisión del requisito. La plantilla no da evidencia a 2.5: se le asigna
  // EV-01. EV-02, EV-05, EV-07 y EV-08 quedan como datos del informe, sin
  // requisito que las juzgue, y EV-03 es de R2, que no se exige.
  requirements: [
    {
      id: 'op.cont.2.1',
      title: 'Funciones, responsabilidades y actividades',
      description:
        'Se identificarán funciones, responsabilidades y actividades a realizar.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-01', 'P-03', 'P-08'],
    },
    {
      id: 'op.cont.2.2',
      title: 'Previsión para coordinar los medios alternativos',
      description:
        'Existirá una previsión para coordinar la entrada en servicio de los medios alternativos de forma que se garantice poder seguir prestando los servicios esenciales de la organización.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-01', 'P-02', 'P-08'],
    },
    {
      id: 'op.cont.2.3',
      title: 'Medios alternativos en acuerdos o contratos',
      description:
        'Todos los medios alternativos estarán planificados y materializados en acuerdos o contratos con los proveedores correspondientes.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-04'],
      parameterIds: ['P-01', 'P-04', 'P-08'],
    },
    {
      id: 'op.cont.2.4',
      title: 'Formación de las personas afectadas',
      description:
        'Las personas afectadas por el plan recibirán formación específica relativa a su papel en dicho plan.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01', 'EV-06'],
      parameterIds: ['P-01', 'P-03', 'P-05', 'P-08'],
    },
    {
      id: 'op.cont.2.5',
      title: 'Integración con los demás planes de continuidad',
      description:
        'El plan de continuidad será parte integral y armónica de los planes de continuidad de la organización en otras materias ajenas a la seguridad.',
      kind: 'BASE',
      applicability: {
        levels: ['ALTO'],
      },
      evidenceIds: ['EV-01'],
      parameterIds: ['P-01', 'P-06', 'P-08'],
    },
    {
      id: 'op.cont.2.r1.1',
      title: 'Plan de emergencia y contingencia (R1)',
      description:
        'Refuerzo R1 – Plan de emergencia y contingencia: Cuando se determine la necesidad de continuidad de los sistemas, deberá existir un plan de emergencia y contingencia en consonancia. En función del análisis de Impacto, se determinarán los aspectos a cubrir.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ningún nivel de Disponibilidad (Anexo II): no aplica.',
      },
      evidenceIds: [],
      parameterIds: [],
    },
    {
      id: 'op.cont.2.r2.1',
      title: 'Comprobación de integridad tras una caída (R2)',
      description:
        'Refuerzo R2 – Comprobación de integridad: Ante una caída o discontinuidad del sistema, se deberá comprobar la integridad del sistema operativo, del firmware y de los ficheros de configuración.',
      kind: 'REFUERZO',
      applicability: {
        levels: [],
        reason:
          'Definido en el texto del ENS pero no exigido en ningún nivel de Disponibilidad (Anexo II): no aplica.',
      },
      evidenceIds: ['EV-03'],
      parameterIds: ['P-07'],
    },
  ],
};
