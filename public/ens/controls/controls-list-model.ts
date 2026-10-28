// All catalogue controls always appear; those not measured on the chosen machine go last, greyed, with the reason and no number.
import type { ENSControlSummaryEntry, ENSAgentControlsRow } from '../../../common/ens/evaluation/types';
import type { ENSNotMeasuredReason } from '../../../common/ens/core/scope/measurement-planes';
import { describePendingMeasurement, getENSCatalogControl, isPendingMeasurement } from '../../../common/ens/catalog';
import { describeLevelSource } from '../../../common/ens/core/control-level';

interface ENSListControl {
  id: string;
  title: string;
  activeLevels: string[];
}

export interface ENSMachineTally {
  cumple: number;
  parcial: number;
  noCumple: number;
  sinDatos: number;
  noAplica: number;
  total: number;
}

export interface ENSControlListEntry {
  id: string;
  title: string;
  levels: string;
  measured: boolean;
  notMeasured?: ENSNotMeasuredReason;
  // A catalog control without collector yet (`DRAFT`): no verdict on any machine, it keeps its Annex II place.
  pendingMeasurement?: string;
  configured: boolean;
  appliesAtLevel: boolean;
  summary?: ENSControlSummaryEntry;
  machines?: ENSMachineTally;
}

interface ENSControlListOptions {
  agentId?: string;
  summaries: Map<string, ENSControlSummaryEntry>;
  agentRows?: ENSAgentControlsRow[];
  isConfigured: (controlId: string) => boolean;
  notMeasured: (controlId: string) => ENSNotMeasuredReason | undefined;
  levelOf: (controlId: string) => string;
}

export const tallyMachines = (controlId: string, agentRows: ENSAgentControlsRow[] = []): ENSMachineTally | undefined => {
  const tally: ENSMachineTally = { cumple: 0, parcial: 0, noCumple: 0, sinDatos: 0, noAplica: 0, total: 0 };
  agentRows.forEach(row => {
    const entry = row.controls.find(control => control.controlId === controlId);
    if (!entry) return;
    tally.total += 1;
    if (entry.status === 'CUMPLE') tally.cumple += 1;
    else if (entry.status === 'PARCIAL') tally.parcial += 1;
    else if (entry.status === 'NO_CUMPLE') tally.noCumple += 1;
    else if (entry.status === 'NO_APLICA') tally.noAplica += 1;
    else tally.sinDatos += 1;
  });
  return tally.total ? tally : undefined;
};

export const describeTally = (tally: ENSMachineTally): string =>
  [
    tally.cumple ? `${tally.cumple} ${tally.cumple === 1 ? 'cumple' : 'cumplen'}` : '',
    tally.parcial ? `${tally.parcial} parcial${tally.parcial === 1 ? '' : 'es'}` : '',
    tally.noCumple ? `${tally.noCumple} no ${tally.noCumple === 1 ? 'cumple' : 'cumplen'}` : '',
    tally.sinDatos ? `${tally.sinDatos} sin datos` : '',
    tally.noAplica ? `${tally.noAplica} no aplica${tally.noAplica === 1 ? '' : 'n'}` : '',
  ]
    .filter(Boolean)
    .join(' · ') + ` (de ${tally.total} máquina${tally.total === 1 ? '' : 's'})`;

export const buildControlListEntries = (controls: ENSListControl[], options: ENSControlListOptions): ENSControlListEntry[] => {
  const entries = controls.map(control => {
    const catalogControl = getENSCatalogControl(control.id);
    const pendingMeasurement =
      catalogControl && isPendingMeasurement(catalogControl) ? describePendingMeasurement(catalogControl) : undefined;
    // Measured nowhere yet: that comes before the plane or the declared scope of a machine.
    const notMeasured = options.agentId && !pendingMeasurement ? options.notMeasured(control.id) : undefined;
    return {
      id: control.id,
      title: control.title,
      levels: control.activeLevels.join(', '),
      measured: !notMeasured,
      ...(notMeasured ? { notMeasured } : {}),
      ...(pendingMeasurement ? { pendingMeasurement } : {}),
      configured: options.isConfigured(control.id),
      appliesAtLevel: control.activeLevels.includes(options.levelOf(control.id)),
      summary: notMeasured || pendingMeasurement ? undefined : options.summaries.get(control.id),
      ...(!options.agentId && options.agentRows && !pendingMeasurement ? { machines: tallyMachines(control.id, options.agentRows) } : {}),
    };
  });
  return [...entries.filter(entry => entry.measured), ...entries.filter(entry => !entry.measured)];
};

export const describeLevelExclusions = (
  entries: (Pick<ENSControlListEntry, 'id' | 'appliesAtLevel'> & Partial<Pick<ENSControlListEntry, 'pendingMeasurement'>>)[],
  globalLevel: string,
  // A control governed by a dimension is excluded by its own level: the text says which one, not the ENS level.
  levelOf?: (controlId: string) => string
): { count: number; ids: string[]; text: string } | undefined => {
  // A control without collector is not evaluated at any level: it carries its own label, not this notice.
  const ids = entries.filter(entry => !entry.appliesAtLevel && !entry.pendingMeasurement).map(entry => entry.id);
  if (!ids.length) return undefined;
  const named = ids.map(id => {
    const level = levelOf ? levelOf(id) : globalLevel;
    const source = describeLevelSource(getENSCatalogControl(id) || {});
    return level !== globalLevel && source ? `${id}: nivel aplicable ${level} por ${source}` : id;
  });
  return {
    count: ids.length,
    ids,
    text: `Nivel ${globalLevel}: ${ids.length} control${ids.length === 1 ? ' no aplica' : 'es no aplican'} (${named.join(', ')})`,
  };
};
