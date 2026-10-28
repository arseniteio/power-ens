/** Report model registry by control. There is no default model: a control without one has no report (`undefined`), never another control's. */
import { compareENSControlIdsByAnnex } from '../../../common/ens/catalog';
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';

import { buildOpAcc1ReportModel } from './op-acc-1-report-model';
import { buildOpAcc2ReportModel } from './op-acc-2-report-model';
import { buildOpAcc3ReportModel } from './op-acc-3-report-model';
import { buildOpAcc4ReportModel } from './op-acc-4-report-model';
import { buildOpAcc5ReportModel } from './op-acc-5-report-model';
import { buildOpAcc6ReportModel } from './op-acc-6-report-model';

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
