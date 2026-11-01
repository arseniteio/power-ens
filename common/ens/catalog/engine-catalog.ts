// The controls the OSCompliance engine judges are defined once, in its catalog (oscompliance-ens
// catalog/controls/ens). `common/ens/catalog/engine/` is a byte-for-byte copy kept by
// `config/sync-catalog.ts`; `tests/engine-catalog.test.ts` fails when it drifts.
import type { ENSControlConfiguration, ENSControlParameter } from '../configuration/types';
import type { ENSEvidenceDefinition } from '../core/evidence/types';
import type { ENSControlDefinition } from './types';
import mpCom1 from './engine/mp.com.1.json';
import mpCom3 from './engine/mp.com.3.json';
import mpCom4 from './engine/mp.com.4.json';
import mpInfo6 from './engine/mp.info.6.json';
import opAcc1 from './engine/op.acc.1.json';
import opAcc2 from './engine/op.acc.2.json';
import opAcc3 from './engine/op.acc.3.json';
import opAcc4 from './engine/op.acc.4.json';
import opAcc5 from './engine/op.acc.5.json';
import opAcc6 from './engine/op.acc.6.json';
import opCont2 from './engine/op.cont.2.json';
import opCont3 from './engine/op.cont.3.json';
import opExp1 from './engine/op.exp.1.json';
import opExp10 from './engine/op.exp.10.json';
import opExp2 from './engine/op.exp.2.json';
import opExp3 from './engine/op.exp.3.json';
import opExp4 from './engine/op.exp.4.json';
import opExp5 from './engine/op.exp.5.json';
import opExp6 from './engine/op.exp.6.json';
import opExp7 from './engine/op.exp.7.json';
import opExp8 from './engine/op.exp.8.json';
import opExp9 from './engine/op.exp.9.json';
import opMon1 from './engine/op.mon.1.json';
import opMon2 from './engine/op.mon.2.json';
import opMon3 from './engine/op.mon.3.json';
import opNub1 from './engine/op.nub.1.json';

export const ENGINE_CATALOG: any[] = [opAcc1, opAcc2, opAcc3, opAcc4, opAcc5, opAcc6, opExp1, opExp2, opExp3, opExp4, opExp5, opExp6, opExp7, opExp8, opExp9, opExp10, mpInfo6, opMon1, opMon2, opMon3, opCont2, opCont3, opNub1, mpCom1, mpCom3, mpCom4];

const defined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

const levelDimensionOf = (dimensions?: string[]) =>
  !dimensions ? undefined : dimensions.length === 1 ? dimensions[0] : dimensions;

export const toControlDefinition = (entry: any): ENSControlDefinition =>
  defined({
    id: entry.control,
    name: entry.title,
    family: entry.family,
    category: entry.category,
    dimension: entry.dimension,
    levelDimension: levelDimensionOf(entry.level_dimension),
    measurementPlanes: entry.measurement_planes,
    description: entry.description,
    levels: entry.levels,
    annexSection: entry.annex_section,
    source: entry.source,
    status: entry.status,
    version: entry.version,
    requirements: entry.requirements.map((r: any) =>
      defined({
        id: r.id,
        title: r.title,
        description: r.description,
        interpretation: r.interpretation,
        kind: r.kind,
        applicability: defined({ levels: r.levels, reason: r.applicability_reason }),
        evidenceIds: r.evidence_ids,
        parameterIds: r.parameter_ids || [],
      })
    ),
  }) as ENSControlDefinition;

export const toEvidenceDefinitions = (entry: any): ENSEvidenceDefinition[] =>
  entry.evidences.map((e: any) => ({
    id: e.id,
    controlId: entry.control,
    title: e.title,
    description: e.description,
    requirements: e.requirements,
    levels: e.levels,
    category: e.category,
    criticality: e.criticality,
    sourceTypes: ['WAZUH_ALERT'],
    expectedEventTypes: [],
    relatedRules: [],
    auditQuestion: e.audit_question,
  }));

const toParameter = (controlId: string, id: string, p: any): ENSControlParameter =>
  defined({
    id,
    controlId,
    name: p.name,
    label: p.label,
    description: p.description,
    levels: p.levels,
    requirements: p.requirements,
    type: p.type,
    matchMode: p.match_mode,
    example: p.example,
    options: p.options,
    optionsByLevel: p.options_by_level,
    required: p.required === true,
    minValue: p.min_value,
    maxValue: p.max_value,
    defaultValue: p.default_value,
    value: p.initial_value,
    wazuhUsage: p.agent_usage,
    powerEnsUsage: p.engine_usage,
    evidenceIds: p.evidence_ids || [],
    ruleIds: [],
    ifNotConfigured: p.if_not_configured,
    columns: p.columns,
  }) as ENSControlParameter;

export const toControlConfiguration = (entry: any): ENSControlConfiguration => ({
  controlId: entry.control,
  controlName: entry.title,
  family: entry.family,
  enabled: true,
  applicableLevels: entry.levels,
  parameters: Object.entries(entry.parameters).map(([id, p]) => toParameter(entry.control, id, p)),
});

export const toParameterClasses = (entry: any): Record<string, string> =>
  Object.fromEntries(Object.entries(entry.parameters).map(([id, p]: [string, any]) => [id, p.class]));

export const engineCatalogEntry = (controlId: string): any => {
  const entry = ENGINE_CATALOG.find(item => item.control === controlId);
  if (!entry) throw new Error(`${controlId} is not in the engine catalog`);
  return entry;
};

// What `config/inject-control.py` seeds: the configuration without initial values.
export const controlBlockOf = (entry: any): ENSControlConfiguration => {
  const configuration = toControlConfiguration(entry);
  return { ...configuration, parameters: configuration.parameters.map(({ value, ...parameter }) => parameter) };
};
