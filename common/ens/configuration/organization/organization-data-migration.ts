import type {
  ENSAgentParameterValue,
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSControlParameter,
  ENSOrganizationData,
} from '../types';
import { isEmptyParameterValue, validateParameterValue } from '../services/parameter-value-validator';
import { organizationDataParameter } from './organization-data-form';
import {
  ENS_ORGANIZATION_DATA_ITEMS,
  ENSOrganizationDataItem,
  ENSOrganizationDataView,
  isOrganizationDataParameter,
} from './organization-data-items';
import {
  ENSOrganizationRow,
  mergeOrganizationRow,
  organizationRows,
  organizationValueFromRows,
  organizationViewRows,
  organizationViewValue,
  projectOrganizationRows,
  sameParameterValue,
} from './organization-data-views';

type ENSOrganizationDocument = Pick<ENSConfigurationVersion, 'controls' | 'organizationData'>;

export const ORGANIZATION_SOURCE = 'organizacion';

export interface ENSOrganizationViewState {
  view: ENSOrganizationDataView;
  key: string;
  parameter?: ENSControlParameter;
  value?: ENSControlParameter['value'];
  configured: boolean;
}

export interface ENSOrganizationCandidate {
  value: ENSAgentParameterValue;
  from: string;
  keeps: string[];
}

export type ENSOrganizationItemStatus = 'informative' | 'empty' | 'value' | 'conflict' | 'incomplete';

export interface ENSOrganizationItemState {
  item: ENSOrganizationDataItem;
  status: ENSOrganizationItemStatus;
  value?: ENSAgentParameterValue;
  stored: boolean;
  views: ENSOrganizationViewState[];
  candidates: ENSOrganizationCandidate[];
  unrepresentable: string[];
  reasons: string[];
  blocked: string[];
  notice?: string;
}

const hasOwn = (record: object | undefined, key: string): boolean =>
  !!record && Object.prototype.hasOwnProperty.call(record, key);

const storedOrganizationValue = (
  configuration: Pick<ENSConfigurationVersion, 'organizationData'>,
  itemId: string
): ENSAgentParameterValue | undefined => {
  const values = configuration.organizationData?.values;
  return hasOwn(values, itemId) && !isEmptyParameterValue(values![itemId]) ? values![itemId] : undefined;
};

const viewStates = (configuration: ENSOrganizationDocument, item: ENSOrganizationDataItem): ENSOrganizationViewState[] =>
  item.views.map(view => {
    const parameter = configuration.controls
      .find(control => control.controlId === view.controlId)
      ?.parameters.find(candidate => candidate.id === view.parameterId);
    return {
      view,
      key: `${view.controlId} ${view.parameterId}`,
      parameter,
      value: parameter?.value,
      configured: !!parameter && !isEmptyParameterValue(parameter.value),
    };
  });

const projected = (item: ENSOrganizationDataItem, state: ENSOrganizationViewState, rows: ENSOrganizationRow[]) =>
  projectOrganizationRows(item, state.view, state.parameter!, rows);

const keepsValue = (item: ENSOrganizationDataItem, state: ENSOrganizationViewState, rows: ENSOrganizationRow[]): boolean =>
  sameParameterValue(state.parameter!, projected(item, state, rows), state.value);

const inverse = (item: ENSOrganizationDataItem, state: ENSOrganizationViewState): ENSOrganizationRow[] =>
  organizationViewRows(item, state.view, state.parameter!, state.value);

const mergeAll = (item: ENSOrganizationDataItem, rows: ENSOrganizationRow[], extra: ENSOrganizationRow[]): ENSOrganizationRow[] =>
  extra.reduce((accumulated, row) => mergeOrganizationRow(item, accumulated, row), rows);

const keyOrder = (item: ENSOrganizationDataItem, rows: ENSOrganizationRow[], sources: ENSOrganizationRow[][]): ENSOrganizationRow[] => {
  const key = item.key || [];
  if (!key.length) return rows;
  const signature = (row: ENSOrganizationRow) => key.map(column => String(row[column] ?? '').trim().toLowerCase()).join('|');
  const order: string[] = [];
  sources.forEach(source =>
    source.forEach(row => {
      if (!order.includes(signature(row))) order.push(signature(row));
    })
  );
  const position = (row: ENSOrganizationRow) => {
    const index = order.indexOf(signature(row));
    return index < 0 ? order.length : index;
  };
  return rows.map((row, index) => ({ row, index })).sort((a, b) => position(a.row) - position(b.row) || a.index - b.index).map(entry => entry.row);
};

const candidateFrom = (
  item: ENSOrganizationDataItem,
  start: ENSOrganizationViewState,
  others: ENSOrganizationRow[][],
  present: ENSOrganizationViewState[],
  reference: ENSOrganizationRow[][]
): ENSOrganizationCandidate | undefined => {
  let rows = mergeAll(item, [], inverse(item, start));
  others.forEach(source =>
    source.forEach(row => {
      const tentative = mergeOrganizationRow(item, rows, row);
      if (keepsValue(item, start, tentative)) rows = tentative;
    })
  );
  const value = organizationValueFromRows(item, keyOrder(item, rows, reference));
  if (value === undefined) return undefined;
  return { value, from: start.key, keeps: present.filter(state => keepsValue(item, state, rows)).map(state => state.key) };
};

const uniqueCandidates = (candidates: (ENSOrganizationCandidate | undefined)[]): ENSOrganizationCandidate[] => {
  const seen = new Set<string>();
  return candidates.filter((candidate): candidate is ENSOrganizationCandidate => {
    if (!candidate) return false;
    const signature = JSON.stringify(candidate.value);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
};

const describeOrganizationItem = (
  configuration: ENSOrganizationDocument,
  item: ENSOrganizationDataItem
): ENSOrganizationItemState => {
  const views = viewStates(configuration, item);
  const base = { item, views, candidates: [] as ENSOrganizationCandidate[], unrepresentable: [] as string[], reasons: [] as string[], blocked: [] as string[] };

  if (!item.views.length) return { ...base, status: 'informative', stored: false };

  const present = views.filter(state => state.parameter);
  const configured = present.filter(state => state.configured);
  const unrepresentable = configured.filter(state => !keepsValue(item, state, mergeAll(item, [], inverse(item, state))));
  const representable = configured.filter(state => !unrepresentable.includes(state));
  const stored = storedOrganizationValue(configuration, item.id);
  const refusedFills = (rows: ENSOrganizationRow[]): { key: string; reason: string }[] =>
    present
      .filter(state => !state.configured)
      .flatMap(state => {
        const next = projected(item, state, rows);
        const verdict = isEmptyParameterValue(next) ? { valid: true } : validateParameterValue(state.parameter!, next);
        return verdict.valid ? [] : [{ key: state.key, reason: `${state.key} no admite el valor común: ${verdict.reason}` }];
      });

  if (stored !== undefined) {
    const storedRows = organizationRows(item, stored);
    const diverging = configured.filter(state => !keepsValue(item, state, storedRows));
    if (!diverging.length) {
      const refused = refusedFills(storedRows);
      return {
        ...base,
        status: 'value',
        value: stored,
        stored: true,
        reasons: refused.map(entry => entry.reason),
        blocked: refused.map(entry => entry.key),
        ...(refused.length ? { notice: `${refused.map(entry => entry.reason).join('; ')}: se queda sin valor hasta corregir «${item.label}».` } : {}),
      };
    }
    const storedCandidate: ENSOrganizationCandidate = {
      value: stored,
      from: ORGANIZATION_SOURCE,
      keeps: present.filter(state => keepsValue(item, state, storedRows)).map(state => state.key),
    };
    return {
      ...base,
      status: 'conflict',
      stored: true,
      value: stored,
      unrepresentable: unrepresentable.map(state => state.key),
      candidates: uniqueCandidates([
        storedCandidate,
        ...diverging
          .filter(state => representable.includes(state))
          .map(state =>
            candidateFrom(
              item,
              state,
              [storedRows, ...representable.filter(other => other !== state).map(other => inverse(item, other))],
              present,
              [storedRows, ...representable.map(other => inverse(item, other))]
            )
          ),
      ]),
    };
  }

  if (!configured.length) return { ...base, status: 'empty', stored: false };

  const full = configured.reduce((rows, state) => mergeAll(item, rows, inverse(item, state)), [] as ENSOrganizationRow[]);
  const agreed = !unrepresentable.length && configured.every(state => keepsValue(item, state, full));
  const composed = organizationValueFromRows(item, full);
  const own = validateParameterValue(organizationDataParameter(item), composed);
  const reasons = !agreed ? [] : own.valid ? refusedFills(full).map(entry => entry.reason) : [own.reason || 'valor no válido'];
  if (agreed && !reasons.length) {
    return { ...base, status: 'value', value: composed, stored: false };
  }
  if (agreed) {
    const owners = configured.map(state => state.view.controlId);
    const who = owners.length === 1 ? `Solo ${owners[0]} tiene valor` : `${owners.join(' y ')} tienen el mismo valor`;
    return { ...base, status: 'incomplete', stored: false, reasons, notice: `${who} y no vale para «${item.label}»: ${reasons.join('; ')}.` };
  }

  return {
    ...base,
    status: 'conflict',
    stored: false,
    reasons,
    unrepresentable: unrepresentable.map(state => state.key),
    candidates: uniqueCandidates(
      representable.map(state =>
        candidateFrom(
          item,
          state,
          representable.filter(other => other !== state).map(other => inverse(item, other)),
          present,
          representable.map(other => inverse(item, other))
        )
      )
    ),
  };
};

export const describeOrganizationData = (configuration: ENSOrganizationDocument): ENSOrganizationItemState[] =>
  ENS_ORGANIZATION_DATA_ITEMS.map(item => describeOrganizationItem(configuration, item));

const writeThrough = <T extends ENSOrganizationDocument>(
  configuration: T,
  item: ENSOrganizationDataItem,
  value: ENSAgentParameterValue | undefined,
  blocked: string[] = []
): { configuration: T; written: string[] } => {
  const written: string[] = [];
  const controls = configuration.controls.map(control => {
    const views = item.views.filter(view => view.controlId === control.controlId);
    if (!views.length) return control;
    let changed = false;
    const parameters = control.parameters.map(parameter => {
      const view = views.find(candidate => candidate.parameterId === parameter.id);
      if (!view || blocked.includes(`${control.controlId} ${parameter.id}`)) return parameter;
      const next = organizationViewValue(item, view, parameter, value);
      if (sameParameterValue(parameter, next, parameter.value) && isEmptyParameterValue(next) === isEmptyParameterValue(parameter.value)) {
        return parameter;
      }
      changed = true;
      written.push(`${control.controlId} ${parameter.id}`);
      const updated: ENSControlParameter = { ...parameter };
      if (next === undefined) delete updated.value;
      else updated.value = next;
      return updated;
    });
    return changed ? { ...control, parameters } : control;
  });
  return written.length ? { configuration: { ...configuration, controls }, written } : { configuration, written };
};

const withValues = <T extends ENSOrganizationDocument>(configuration: T, values: Record<string, ENSAgentParameterValue>): T => ({
  ...configuration,
  organizationData: { ...(configuration.organizationData || {}), values } as ENSOrganizationData,
});

export interface ENSOrganizationFill {
  parameter: string;
  from: string[];
}

export interface ENSOrganizationMigrationReport<T extends ENSOrganizationDocument = ENSConfigurationVersion> {
  configuration: T;
  changed: boolean;
  added: boolean;
  moved: string[];
  written: string[];
  filled: ENSOrganizationFill[];
  conflicts: string[];
  incomplete: string[];
}

export const normalizeOrganizationData = <T extends ENSOrganizationDocument>(configuration: T): ENSOrganizationMigrationReport<T> => {
  if (!Array.isArray(configuration.controls)) {
    return { configuration, changed: false, added: false, moved: [], written: [], filled: [], conflicts: [], incomplete: [] };
  }

  const added = !configuration.organizationData;
  const values: Record<string, ENSAgentParameterValue> = { ...(configuration.organizationData?.values || {}) };
  let next = withValues(configuration, values);
  const moved: string[] = [];
  const written: string[] = [];
  const filled: ENSOrganizationFill[] = [];
  const conflicts: string[] = [];
  const incomplete: string[] = [];

  ENS_ORGANIZATION_DATA_ITEMS.forEach(item => {
    const state = describeOrganizationItem(next, item);
    if (state.status === 'conflict') {
      conflicts.push(item.id);
      return;
    }
    if (state.status === 'incomplete') {
      incomplete.push(item.id);
      return;
    }
    if (state.status !== 'value') return;
    if (!state.stored) {
      values[item.id] = state.value!;
      moved.push(item.id);
    }
    const result = writeThrough(next, item, state.value, state.blocked);
    next = result.configuration;
    written.push(...result.written);
    const from = state.stored ? [ORGANIZATION_SOURCE] : state.views.filter(view => view.configured).map(view => view.key);
    result.written.forEach(parameter => filled.push({ parameter, from }));
  });

  const changed = added || moved.length > 0 || written.length > 0;
  return { configuration: changed ? withValues(next, values) : configuration, changed, added, moved, written, filled, conflicts, incomplete };
};

export const setOrganizationValue = <T extends ENSOrganizationDocument>(
  configuration: T,
  itemId: string,
  value: ENSAgentParameterValue | undefined
): T => {
  const item = ENS_ORGANIZATION_DATA_ITEMS.find(candidate => candidate.id === itemId);
  if (!item || !item.views.length) {
    throw new Error(`«${itemId}» no es un dato de la organización que se pueda editar.`);
  }
  const values: Record<string, ENSAgentParameterValue> = { ...(configuration.organizationData?.values || {}) };
  if (value === undefined || isEmptyParameterValue(value)) delete values[itemId];
  else values[itemId] = value;
  return writeThrough(withValues(configuration, values), item, values[itemId]).configuration;
};

export const describeOrganizationFills = (filled: ENSOrganizationFill[]): string[] =>
  filled.map(
    fill =>
      `Se ha completado ${fill.parameter} con el valor de ${fill.from
        .map(source => (source === ORGANIZATION_SOURCE ? 'Datos de la organización' : source))
        .join(' y ')}.`
  );

export const summarizeOrganizationMigration = (
  report: Pick<ENSOrganizationMigrationReport, 'moved' | 'written' | 'conflicts'> & { incomplete?: string[] }
): string => {
  const parts = [
    report.moved.length ? `${report.moved.length} dato(s) unificado(s) con el valor que ya tenían sus controles` : '',
    report.written.length ? `${report.written.length} parámetro(s) toman el valor común` : '',
    report.conflicts.length ? `${report.conflicts.length} dato(s) con valores distintos entre controles, pendientes de elegir` : '',
    report.incomplete?.length ? `${report.incomplete.length} dato(s) sin valor común: lo que tienen sus controles no vale para el dato` : '',
  ].filter(Boolean);
  return parts.length ? `Datos de la organización: ${parts.join('; ')}.` : 'Datos de la organización: sin cambios.';
};

export const keepOrganizationParameters = (
  next: ENSControlConfiguration,
  current: ENSControlConfiguration | undefined
): ENSControlConfiguration => {
  if (!current) return next;
  let changed = false;
  const parameters = next.parameters.map(parameter => {
    if (!isOrganizationDataParameter(next.controlId, parameter.id)) return parameter;
    const stored = current.parameters.find(candidate => candidate.id === parameter.id);
    if (JSON.stringify(stored?.value) === JSON.stringify(parameter.value)) return parameter;
    changed = true;
    const kept: ENSControlParameter = { ...parameter };
    if (stored?.value === undefined) delete kept.value;
    else kept.value = stored.value;
    return kept;
  });
  return changed ? { ...next, parameters } : next;
};
