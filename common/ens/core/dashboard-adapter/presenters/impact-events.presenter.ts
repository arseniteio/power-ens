// Operational SOC alerts of the panel (ENS-DASH-004, Francisco Caicedo): one row per incident, shown only where the engine's result makes it applicable; a multi-role row is rated by the engine's non-conformity, never by the agent's `estado`.
import { getENSCatalogControl } from '../../../catalog';
import { ENSNormalizedEvent } from '../../data-source/types';
import { ENSComplianceState } from '../../compliance-state/types';
import { getEvidenceDefinitions } from '../../evidence/registry';
import type { ENSComplianceResult } from '../../evaluation/types';
import type { ENSAgentScope } from '../../scope/types';
import {
  ENS_MANAGER_AGENT_ID,
  isControlMeasuredOnAgent,
  isControlMeasuredOnPlane,
} from '../../scope/measurement-planes';
import {
  ImpactEventRowModel,
  ImpactEventSeverity,
  ImpactEventsModel,
} from '../models/impact-events.model';

// Alert types and the `data.*` fields of their incident key besides `agent.id`: most warnings name a `parametro`, only mp.info.6's an `origen`/`objeto`; op.exp.7 emits one fact per rule, system and hour, so `primera` stays out and `descripcion` (fixed by the rule) only labels it.
export const OPERATIONAL_ALERT_KEY_FIELDS: Record<string, string[]> = {
  collector_warning: ['ensfacil', 'requisito', 'parametro', 'origen', 'objeto', 'motivo'],
  security_alert_observed: ['ensfacil', 'agente_id', 'sistema', 'regla', 'descripcion'],
  multi_role_usage: ['ensfacil', 'requisito', 'usuario', 'motivo'],
};

// Rows the panel shows.
export const OPERATIONAL_ALERT_ROWS = 5;

const FIXED_LABEL: Record<string, string> = {
  collector_warning: 'Advertencia del recolector ENS.',
  security_alert_observed: 'Alerta de seguridad observada por Wazuh.',
  multi_role_usage: 'Uso de identificadores sin separación de privilegios.',
};

const SEVERITY_ORDER: Record<ImpactEventSeverity, number> = { error: 0, warning: 1, success: 2, info: 3 };

const MAX_LABEL = 140;

// One group of facts with the same key on the same emitting agent: a server bucket or its in-memory equivalent.
export interface OperationalIncident {
  eventType: string;
  agentId: string;
  // Key fields; '' when absent.
  fields: Record<string, string>;
  count: number;
  lastObserved: string;
}

export interface OperationalAlertsOptions {
  // The ENS scope of the view: only its machines are shown.
  scope: ENSAgentScope[];
  // Machine view: only that machine and the manager, like the facts it reads.
  agentId?: string;
  // The per-type bound when the read hit it: the total is then a lower bound.
  truncatedAt?: number;
}

const ALERTS_TITLE = 'ALERTAS OPERATIVAS SOC';

// The panel when the alerts could not be read: the rest of the dashboard is unaffected.
export const unreadOperationalAlertsModel = (): ImpactEventsModel => ({
  title: ALERTS_TITLE,
  rows: [],
  total: 0,
  error: 'No se han podido leer las alertas operativas.',
});

// The line under the rows: how many are left out, and whether the read stopped at its bound.
const summaryOf = (shown: number, total: number, truncatedAt?: number): string | undefined =>
  truncatedAt
    ? `Se muestran ${shown} de al menos ${total}: solo se leen los ${truncatedAt} incidentes más recientes de cada tipo.`
    : total > shown
    ? `Se muestran ${shown} de ${total}.`
    : undefined;

const text = (value: unknown): string =>
  value === undefined || value === null ? '' : String(Array.isArray(value) ? value[0] ?? '' : value);

// The agent's own motive (the rule's description for a security alert), cut to 140 characters, or the type's fixed text.
const labelOf = (incident: OperationalIncident): string => {
  const reason = (incident.fields[incident.eventType === 'security_alert_observed' ? 'descripcion' : 'motivo'] || '').trim();
  if (!reason) return FIXED_LABEL[incident.eventType] || 'Acontecimiento operativo ENS.';
  return reason.length > MAX_LABEL ? `${reason.slice(0, MAX_LABEL - 3)}...` : reason;
};

const detailOf = (incident: OperationalIncident): string => {
  const f = (name: string) => (incident.fields[name] || '').trim();
  const parts =
    incident.eventType === 'multi_role_usage'
      ? [f('usuario') && `Cuenta ${f('usuario')}`, f('requisito') && `requisito ${f('requisito')}`]
      : incident.eventType === 'security_alert_observed'
      ? [f('regla') && `Regla ${f('regla')}`, f('sistema') && `en ${f('sistema')}`]
      : [f('parametro') && `Parámetro ${f('parametro')}`, f('origen'), f('objeto'), f('requisito') && `requisito ${f('requisito')}`];
  return parts.filter(Boolean).join(' · ') || 'Sin más detalle del agente.';
};

// What the count counts: op.exp.7 emits one fact per rule, system and hour, so for a security alert it is hours with alerts.
const countLabelOf = (eventType: string, count: number): string | undefined =>
  count < 2 ? undefined : eventType === 'security_alert_observed' ? `alertas en ${count} horas` : `${count} observaciones`;

// The engine's result that judges that control for that machine: its own row or, for a control measured on the manager, the view's result.
const controlResultFor = (
  state: ENSComplianceState,
  controlId: string,
  agentId: string
): ENSComplianceResult | undefined => {
  const control = getENSCatalogControl(controlId);
  // A control that is not ACTIVE produces nothing to attend to.
  if (!control || control.status !== 'ACTIVE') return undefined;
  const own = state.agents
    .find(agent => agent.agentId === agentId)
    ?.results.find(result => result.control.id === controlId);
  if (own) return own;
  const judgedOnManager =
    isControlMeasuredOnPlane(control, 'manager') &&
    (agentId === ENS_MANAGER_AGENT_ID || !isControlMeasuredOnAgent(control, agentId));
  return judgedOnManager ? state.results.find(result => result.control.id === controlId) : undefined;
};

const toRow = (
  incident: OperationalIncident,
  state: ENSComplianceState,
  options: OperationalAlertsOptions
): ImpactEventRowModel | undefined => {
  const f = (name: string) => (incident.fields[name] || '').trim();
  const controlId = f('ensfacil');
  // A security alert names the machine it happened on (`agente_id` and `sistema`); the rest belong to the emitter.
  const attributed = incident.eventType === 'security_alert_observed' && Boolean(f('agente_id') && f('sistema'));
  const agentId = attributed ? f('agente_id') : incident.agentId.trim();
  if (!controlId || !agentId) return undefined;

  const scopeAgent = options.scope.find(agent => agent.id === agentId);
  if (!scopeAgent) return undefined;
  if (options.agentId && agentId !== options.agentId && agentId !== ENS_MANAGER_AGENT_ID) return undefined;

  const result = controlResultFor(state, controlId, agentId);
  if (!result) return undefined;

  const requirementId = f('requisito');
  let severity: ImpactEventSeverity;
  if (incident.eventType === 'multi_role_usage') {
    // The engine judges: an error only if it holds a measured non-conformity of that requirement on that machine, raised by an evidence that listens to this fact (EV-06 on op.acc.1).
    const listening = getEvidenceDefinitions(controlId)
      .filter(evidence => evidence.expectedEventTypes.includes(incident.eventType))
      .map(evidence => evidence.id);
    const judged = (result.nonConformities || []).some(
      nonConformity =>
        nonConformity.requirementId === requirementId &&
        nonConformity.origin === 'MEDIDA' &&
        (nonConformity.evidenceIds?.length ? nonConformity.evidenceIds : [nonConformity.evidenceId]).some(id => listening.includes(id))
    );
    if (!requirementId || !judged) return undefined;
    severity = 'error';
  } else {
    // Only where the control has an applicable requirement: the one the fact names (a warning may carry `requisito`), otherwise any.
    const applicable = requirementId
      ? result.requirements.some(requirement => requirement.id === requirementId && requirement.status !== 'NO_APLICA')
      : result.requirements.some(requirement => requirement.status !== 'NO_APLICA');
    if (!applicable) return undefined;
    severity = 'warning';
  }

  const key = [incident.eventType, agentId, controlId, ...OPERATIONAL_ALERT_KEY_FIELDS[incident.eventType]
    .filter(name => name !== 'ensfacil' && name !== 'agente_id' && name !== 'sistema')
    .map(f)].join('|');

  return {
    id: key,
    eventType: incident.eventType,
    label: labelOf(incident),
    description: detailOf(incident),
    severity,
    count: incident.count,
    controlId,
    agentId,
    agentName: scopeAgent.name || (attributed ? f('sistema') : undefined),
    lastObserved: incident.lastObserved,
  };
};

// The panel model from the incidents of the window: filtered against the engine's results, merged by incident key, most severe and most recent first.
export const buildOperationalAlertsModel = (
  incidents: OperationalIncident[],
  state: ENSComplianceState | undefined,
  options: OperationalAlertsOptions
): ImpactEventsModel => {
  const rows = new Map<string, ImpactEventRowModel>();
  if (state) {
    incidents.forEach(incident => {
      if (!OPERATIONAL_ALERT_KEY_FIELDS[incident.eventType]) return;
      const row = toRow(incident, state, options);
      if (!row) return;
      const previous = rows.get(row.id);
      if (!previous) {
        rows.set(row.id, row);
        return;
      }
      const newer = row.lastObserved > previous.lastObserved ? row : previous;
      rows.set(row.id, { ...newer, count: previous.count + row.count });
    });
  }

  const sorted = Array.from(rows.values()).sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.lastObserved.localeCompare(a.lastObserved) ||
      a.id.localeCompare(b.id)
  );

  const shown = sorted.slice(0, OPERATIONAL_ALERT_ROWS).map(row => {
    const countLabel = countLabelOf(row.eventType, row.count);
    return countLabel ? { ...row, countLabel } : row;
  });
  const summary = summaryOf(shown.length, sorted.length, options.truncatedAt);
  return { title: ALERTS_TITLE, rows: shown, total: sorted.length, ...(summary ? { summary } : {}) };
};

// The same grouping the server does with its aggregation, over events already in memory (one count per fact, not per evidence split).
export const operationalIncidentsFromEvents = (events: ENSNormalizedEvent[] = []): OperationalIncident[] => {
  const groups = new Map<string, { incident: OperationalIncident; facts: Set<string>; last: number }>();
  events.forEach(event => {
    const fields = OPERATIONAL_ALERT_KEY_FIELDS[event.eventType];
    const time = Date.parse(event.timestamp);
    if (!fields || event.isSynthetic || !event.agentId || !Number.isFinite(time)) return;
    const values = Object.fromEntries(fields.map(name => [name, text(event.attributes?.[name])]));
    const key = JSON.stringify([event.eventType, event.agentId, ...fields.map(name => values[name])]);
    let group = groups.get(key);
    if (!group) {
      group = { incident: { eventType: event.eventType, agentId: event.agentId, fields: values, count: 0, lastObserved: '' }, facts: new Set(), last: time };
      groups.set(key, group);
    }
    group.facts.add(event.id.split('#')[0]);
    group.last = Math.max(group.last, time);
  });
  return Array.from(groups.values()).map(group => ({
    ...group.incident,
    count: group.facts.size,
    lastObserved: new Date(group.last).toISOString(),
  }));
};

export const buildImpactEventsModel = (
  events: ENSNormalizedEvent[] = [],
  state?: ENSComplianceState,
  options: OperationalAlertsOptions = { scope: [] }
): ImpactEventsModel => buildOperationalAlertsModel(operationalIncidentsFromEvents(events), state, options);
