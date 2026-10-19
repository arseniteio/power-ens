/** Report model registry by control. There is no default model: a control without one has no report (`undefined`), never another control's. */
import { compareENSControlIdsByAnnex } from '../../../common/ens/catalog';
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';

import { buildMpCom1ReportModel } from './mp-com-1-report-model';
import { buildMpCom3ReportModel } from './mp-com-3-report-model';
import { buildMpCom4ReportModel } from './mp-com-4-report-model';
import { buildMpEq2ReportModel } from './mp-eq-2-report-model';
import { buildMpEq3ReportModel } from './mp-eq-3-report-model';
import { buildMpEq4ReportModel } from './mp-eq-4-report-model';
import { buildMpInfo6ReportModel } from './report-model';
import { buildMpSw2ReportModel } from './mp-sw-2-report-model';
import { buildOpAcc1ReportModel } from './op-acc-1-report-model';
import { buildOpAcc2ReportModel } from './op-acc-2-report-model';
import { buildOpAcc3ReportModel } from './op-acc-3-report-model';
import { buildOpAcc4ReportModel } from './op-acc-4-report-model';
import { buildOpAcc5ReportModel } from './op-acc-5-report-model';
import { buildOpAcc6ReportModel } from './op-acc-6-report-model';
import { buildOpCont2ReportModel } from './op-cont-2-report-model';
import { buildOpCont3ReportModel } from './op-cont-3-report-model';
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
import { buildOpMon3ReportModel } from './op-mon-3-report-model';
import { buildOpNub1ReportModel } from './op-nub-1-report-model';

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

  name: string;

  build: (
    result: ENSComplianceResult | undefined,
    panorama?: ENSComplianceResult[]
  ) => ENSReportModel;

  usesAllControls?: boolean;
}

const reportModelDefinitions: ENSReportModelDefinition[] = [
  {
    controlId: 'mp.com.1',
    name: 'mp.com.1 - Perímetro seguro',
    build: buildMpCom1ReportModel,
  },
  {
    controlId: 'mp.com.3',
    name: 'mp.com.3 - Protección de la integridad y de la autenticidad',
    build: buildMpCom3ReportModel,
  },
  {
    controlId: 'mp.com.4',
    name: 'mp.com.4 - Separación de flujos de información en la red',
    build: buildMpCom4ReportModel,
  },
  {
    controlId: 'mp.eq.2',
    name: 'mp.eq.2 - Bloqueo de puesto de trabajo',
    build: buildMpEq2ReportModel,
  },
  {
    controlId: 'mp.eq.3',
    name: 'mp.eq.3 - Protección de dispositivos portátiles',
    build: buildMpEq3ReportModel,
  },
  {
    controlId: 'mp.eq.4',
    name: 'mp.eq.4 - Otros dispositivos conectados a la red',
    build: buildMpEq4ReportModel,
  },
  {
    controlId: 'mp.info.6',
    name: 'mp.info.6 - Copias de seguridad',
    build: buildMpInfo6ReportModel,
  },
  {
    controlId: 'mp.sw.2',
    name: 'mp.sw.2 - Aceptación y puesta en servicio',
    build: buildMpSw2ReportModel,
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
    controlId: 'op.cont.2',
    name: 'op.cont.2 - Plan de continuidad',
    build: buildOpCont2ReportModel,
  },
  {
    controlId: 'op.cont.3',
    name: 'op.cont.3 - Pruebas periódicas',
    build: buildOpCont3ReportModel,
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
  {
    controlId: 'op.mon.3',
    name: 'op.mon.3 - Vigilancia',
    build: buildOpMon3ReportModel,
  },
  {
    controlId: 'op.nub.1',
    name: 'op.nub.1 - Protección de servicios en la nube',
    build: buildOpNub1ReportModel,
  },
];

// Exported so tests can exercise the guards below with their own list.
export const buildENSReportModelRegistry = (
  definitions: ENSReportModelDefinition[]
): Map<string, ENSReportModelDefinition> => {
  const registry = new Map<string, ENSReportModelDefinition>();

  for (const definition of definitions) {
    const controlId = (definition.controlId || '').trim();

    if (!controlId) {
      throw new Error(
        `Report model "${definition.name}" has no valid controlId.`
      );
    }

    if (registry.has(controlId)) {
      throw new Error(
        `Duplicate report model for control ${controlId}.`
      );
    }

    registry.set(controlId, definition);
  }

  return registry;
};

const reportModelRegistry = buildENSReportModelRegistry(
  reportModelDefinitions
);

// `undefined` for a control without a registered model; never a fallback model.
export const getENSReportModelDefinition = (
  controlId: string
): ENSReportModelDefinition | undefined =>
  reportModelRegistry.get((controlId || '').trim());

export const getRegisteredENSReportControls = (): string[] =>
  Array.from(reportModelRegistry.keys()).sort(compareENSControlIdsByAnnex);

export const buildENSReportModel = (
  controlId: string,
  result: ENSComplianceResult | undefined,
  panorama?: ENSComplianceResult[]
): ENSReportModel | undefined =>
  getENSReportModelDefinition(controlId)?.build(result, panorama);

// Which controls have no report model: it makes the omission visible.
export const listENSControlsWithoutReportModel = (
  controlIds: string[]
): string[] =>
  controlIds.filter(
    controlId => !reportModelRegistry.has((controlId || '').trim())
  );
