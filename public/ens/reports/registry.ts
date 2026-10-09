/**
 * Registro de modelos de informe por control.
 *
 * POR QUÉ EXISTE ESTE FICHERO. Hasta ahora la pantalla de Informes elegía el
 * modelo con una cadena de ternarios cuya RAMA POR DEFECTO era mp.info.6:
 *
 *     controlId === 'op.acc.2' ? buildOpAcc2ReportModel(result)
 *   : controlId === 'op.acc.1' ? buildOpAcc1ReportModel(result)
 *   : buildMpInfo6ReportModel(result);          // <- cualquier otro control
 *
 * Un control nuevo se registra bien en `data/`, sale en la lista con su nombre
 * y su nivel correctos, y al abrir su informe generaba el de las copias de
 * seguridad: los requisitos de mp.info.6, sus evidencias y sus campos, bajo la
 * cabecera del control nuevo. No rompía nada visible; producía un documento
 * PLAUSIBLE Y EQUIVOCADO, y ese documento va firmado ante un auditor. Es el
 * mismo género de fallo que el principio rector prohíbe en el semáforo: sin
 * dato que signifique algo, no se afirma nada.
 *
 * El registro devuelve `undefined` para lo no registrado y la pantalla lo dice
 * con todas las letras. Misma convención que `core/evidence/registry.ts`,
 * `core/policy-runtime/policies/registry.ts` y `configuration/registry/`:
 * definiciones en una lista, mapa por `controlId`, `get…` que devuelve
 * `undefined`, y `getRegistered…` para que se pueda auditar el registro entero.
 *
 * AL AÑADIR UN CONTROL: una entrada aquí, con su `name` (es el título del
 * informe en pantalla y el encabezado del PDF) y su `build`. Si se olvida, no
 * se genera el informe de otro: sale un aviso nombrando al control, y
 * `tests/check-consistency.py` (comprobación 8) y
 * `tests/report-by-control.test.ts` fallan.
 *
 * Tipos desde el fichero, nunca desde el barrel `../core`: por ahí vuelve el
 * ciclo transitivo del TDZ de Settings.
 */
import { compareENSIds } from '../control-filter/prefix';
import type { ENSComplianceResult } from '../core/evaluation/types';

import { buildMpInfo6ReportModel } from './report-model';
import { buildOpAcc1ReportModel } from './op-acc-1-report-model';
import { buildOpAcc2ReportModel } from './op-acc-2-report-model';
import { buildOpAcc3ReportModel } from './op-acc-3-report-model';
import { buildOpAcc4ReportModel } from './op-acc-4-report-model';
import { buildOpAcc5ReportModel } from './op-acc-5-report-model';
import { buildOpAcc6ReportModel } from './op-acc-6-report-model';
import { buildOpExp1ReportModel } from './op-exp-1-report-model';
import { buildOpExp2ReportModel } from './op-exp-2-report-model';
import { buildOpExp3ReportModel } from './op-exp-3-report-model';
import { buildOpExp4ReportModel } from './op-exp-4-report-model';
import { buildOpExp5ReportModel } from './op-exp-5-report-model';
import { buildOpExp6ReportModel } from './op-exp-6-report-model';
import { buildOpExp7ReportModel } from './op-exp-7-report-model';
import { buildOpExp8ReportModel } from './op-exp-8-report-model';
import { buildOpExp9ReportModel } from './op-exp-9-report-model';
import { buildOpExp10ReportModel } from './op-exp-10-report-model';
import { buildOpMon1ReportModel } from './op-mon-1-report-model';
import { buildOpMon2ReportModel } from './op-mon-2-report-model';

export type ENSReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface ENSReportField {
  id: string;
  title: string;
  status: ENSReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

// La forma común de los tres modelos (`MPInfo6ReportModel`, `OpAcc1ReportModel`
// y `OpAcc2ReportModel` son idénticos campo a campo). Es lo único que la
// pantalla consume, así que es lo único que el registro promete.
export interface ENSReportModel {
  controlId: string;
  status: ENSReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: ENSReportField[];
}

export interface ENSReportModelDefinition {
  controlId: string;

  // Título del informe en pantalla y encabezado del PDF. Vivía en un
  // `CONTROL_META` aparte, un segundo mapa por control que había que acordarse
  // de tocar además del selector de modelo; dos sitios que mantener para un
  // solo hecho son dos sitios que se olvidan por separado.
  name: string;

  build: (
    result: ENSComplianceResult | undefined,
    panorama?: ENSComplianceResult[]
  ) => ENSReportModel;

  // El informe necesita el resultado de TODOS los controles, no solo el suyo
  // (op.mon.2, el sistema de métricas: su informe es el cuadro de mando). La
  // pantalla lee entonces los hechos de todos los controles, con el mismo tope
  // y el mismo orden que el panel, y pasa a `build` el resultado de cada uno
  // como `panorama`.
  usesAllControls?: boolean;
}

const reportModelDefinitions: ENSReportModelDefinition[] = [
  {
    controlId: 'mp.info.6',
    name: 'mp.info.6 - Copias de seguridad',
    build: buildMpInfo6ReportModel,
  },
  {
    controlId: 'op.acc.1',
    name: 'op.acc.1 - Identificación',
    build: buildOpAcc1ReportModel,
  },
  {
    controlId: 'op.acc.2',
    name: 'op.acc.2 - Requisitos de acceso',
    build: buildOpAcc2ReportModel,
  },
  {
    controlId: 'op.acc.3',
    name: 'op.acc.3 - Segregación de funciones y tareas',
    build: buildOpAcc3ReportModel,
  },
  {
    controlId: 'op.acc.4',
    name: 'op.acc.4 - Proceso de gestión de derechos de acceso',
    build: buildOpAcc4ReportModel,
  },
  {
    controlId: 'op.acc.5',
    name: 'op.acc.5 - Mecanismo de autenticación (usuarios externos)',
    build: buildOpAcc5ReportModel,
  },
  {
    controlId: 'op.acc.6',
    name: 'op.acc.6 - Mecanismo de autenticación (usuarios de la organización)',
    build: buildOpAcc6ReportModel,
  },
  {
    controlId: 'op.exp.1',
    name: 'op.exp.1 - Inventario de activos',
    build: buildOpExp1ReportModel,
  },
  {
    controlId: 'op.exp.2',
    name: 'op.exp.2 - Configuración de seguridad',
    build: buildOpExp2ReportModel,
  },
  {
    controlId: 'op.exp.3',
    name: 'op.exp.3 - Gestión de la configuración de seguridad',
    build: buildOpExp3ReportModel,
  },
  {
    controlId: 'op.exp.4',
    name: 'op.exp.4 - Mantenimiento y actualizaciones de seguridad',
    build: buildOpExp4ReportModel,
  },
  {
    controlId: 'op.exp.5',
    name: 'op.exp.5 - Gestión de cambios',
    build: buildOpExp5ReportModel,
  },
  {
    controlId: 'op.exp.6',
    name: 'op.exp.6 - Protección frente a código dañino',
    build: buildOpExp6ReportModel,
  },
  {
    controlId: 'op.exp.7',
    name: 'op.exp.7 - Gestión de incidentes',
    build: buildOpExp7ReportModel,
  },
  {
    controlId: 'op.exp.8',
    name: 'op.exp.8 - Registro de la actividad',
    build: buildOpExp8ReportModel,
  },
  {
    controlId: 'op.exp.9',
    name: 'op.exp.9 - Registro de la gestión de incidentes',
    build: buildOpExp9ReportModel,
  },
  {
    controlId: 'op.exp.10',
    name: 'op.exp.10 - Protección de claves criptográficas',
    build: buildOpExp10ReportModel,
  },
  {
    controlId: 'op.mon.1',
    name: 'op.mon.1 - Detección de intrusión',
    build: buildOpMon1ReportModel,
  },
  {
    controlId: 'op.mon.2',
    name: 'op.mon.2 - Sistema de métricas',
    build: buildOpMon2ReportModel,
    usesAllControls: true,
  },
];

// Exportada para que las dos guardas de abajo las pueda ejercitar una prueba
// con su propia lista: una guarda que ningún fixture ejecuta no es una guarda,
// es un comentario con `throw`.
export const buildENSReportModelRegistry = (
  definitions: ENSReportModelDefinition[]
): Map<string, ENSReportModelDefinition> => {
  const registry = new Map<string, ENSReportModelDefinition>();

  for (const definition of definitions) {
    const controlId = (definition.controlId || '').trim();

    if (!controlId) {
      throw new Error(
        `Modelo de informe «${definition.name}» sin controlId válido.`
      );
    }

    if (registry.has(controlId)) {
      throw new Error(
        `Modelo de informe duplicado para el control ${controlId}.`
      );
    }

    registry.set(controlId, definition);
  }

  return registry;
};

const reportModelRegistry = buildENSReportModelRegistry(
  reportModelDefinitions
);

// `undefined` para un control sin modelo registrado. NUNCA un modelo de
// repuesto: el repuesto sería el informe de otro control.
export const getENSReportModelDefinition = (
  controlId: string
): ENSReportModelDefinition | undefined =>
  reportModelRegistry.get((controlId || '').trim());

export const getRegisteredENSReportControls = (): string[] =>
  Array.from(reportModelRegistry.keys()).sort(compareENSIds);

// El modelo ya construido, o `undefined` si el control no tiene modelo. Quien
// llame tiene que tratar el `undefined`; no hay forma de recibir por descuido
// el modelo de otro control.
export const buildENSReportModel = (
  controlId: string,
  result: ENSComplianceResult | undefined,
  panorama?: ENSComplianceResult[]
): ENSReportModel | undefined =>
  getENSReportModelDefinition(controlId)?.build(result, panorama);

// Cuáles de estos controles NO tienen modelo de informe. Es lo que convierte el
// olvido en algo visible: la pantalla lo usa para nombrarlos arriba del todo, y
// las pruebas para exigir que la lista esté vacía.
export const listENSControlsWithoutReportModel = (
  controlIds: string[]
): string[] =>
  controlIds.filter(
    controlId => !reportModelRegistry.has((controlId || '').trim())
  );
