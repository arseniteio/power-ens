// The incidents of one report period read on the server from op.mon.2's latest register read (not the capped variable).
import { ENS_ALERTS_INDEX } from '../../../common/constants';
import { opMon2CatalogDefinition } from '../../../common/ens/catalog/op-mon-2';
import { resolveControlConfigurationForAgent } from '../../../common/ens/configuration/agents/configuration-resolver';
import type { ENSConfigurationVersion } from '../../../common/ens/configuration/types';
import { resolveControlLevel } from '../../../common/ens/core/control-level';
import { normalizeWazuhAlerts } from '../../../common/ens/core/data-source/data-source-engine';
import { resolveEvidenceForControl } from '../../../common/ens/core/evidence/engine';
import { art32IncidentsData } from '../../../common/ens/core/policy-runtime/policies/op-mon-2.policy';
import { SAME_RUN_WINDOW_MS } from '../../../common/ens/core/policy-runtime/policies/policy-kit';
import { buildPolicyContext } from '../../../common/ens/core/policy-runtime/policy-context-builder';
import { buildENSControlFactsFilter } from '../../../common/ens/dashboard/all-controls-facts-filter';
import { ENSTooManyFactsError, readAllFacts, searchComplete } from '../evaluation/facts-reader';
import { ENGINE_SOURCE_FIELDS, FACTS_SORT } from '../evaluation/queries';

const CONTROL = 'op.mon.2';
const MANAGER = '000';
const HOUR_MS = 3600e3;
// A period may have at most this many incidents in the report; beyond it, no incident figure is published.
export const ENS_ART32_PERIOD_INCIDENTS_LIMIT = 10000;
// Rows read for one period: every phase of up to the limit of incidents.
const MAX_ROWS = ENS_ART32_PERIOD_INCIDENTS_LIMIT * 6;

const factsOf = (event: string, range: Record<string, string>) => ({
  bool: {
    filter: [
      buildENSControlFactsFilter(CONTROL),
      { term: { 'data.event': event } },
      { term: { 'agent.id': MANAGER } },
      { range: { '@timestamp': range } },
    ],
  },
});

// op.mon.2's last read of the incident register and the rows of that run, normalised as the engine sees them.
const latestRegisterRun = async (client: any, now: Date) => {
  const read = await searchComplete(
    client,
    {
      index: ENS_ALERTS_INDEX,
      body: {
        size: 1,
        _source: ENGINE_SOURCE_FIELDS,
        sort: FACTS_SORT,
        query: factsOf('incident_register_read', { gte: new Date(now.getTime() - 7 * 24 * HOUR_MS).toISOString(), lte: new Date(now.getTime() + 5 * 60e3).toISOString() }),
      },
    },
    'la última lectura del registro de incidentes'
  );
  const latest = read?.hits?.hits?.[0];
  if (!latest) return [];
  const at = Date.parse(latest._source?.['@timestamp'] || latest._source?.timestamp);
  const rows: any[] = [];
  await readAllFacts(
    client,
    factsOf('incident_registered', { gte: new Date(at - SAME_RUN_WINDOW_MS).toISOString(), lte: new Date(at + HOUR_MS).toISOString() }),
    hits => {
      rows.push(...hits);
    },
    undefined,
    { maxFacts: MAX_ROWS, what: 'las filas del registro de incidentes' }
  );
  return normalizeWazuhAlerts([latest, ...rows]);
};

// The period's incidents as `informe_art32_incidentes` describes them (or why not), with op.mon.2's own rules.
export async function readPeriodIncidents(
  client: any,
  configuration: ENSConfigurationVersion,
  now: Date,
  window: { fromMs: number; toMs: number },
  limit: number = ENS_ART32_PERIOD_INCIDENTS_LIMIT
): Promise<Record<string, unknown>> {
  let events;
  try {
    events = await latestRegisterRun(client, now);
  } catch (error: any) {
    if (error instanceof ENSTooManyFactsError) {
      return { motivo: `no disponible: el registro de incidentes reemitido por op.mon.2 tiene más de ${MAX_ROWS} filas`, incidentes: [] };
    }
    throw error;
  }
  const control = resolveControlConfigurationForAgent(configuration, CONTROL, MANAGER);
  const level = resolveControlLevel(opMon2CatalogDefinition, configuration.global.ensLevel, configuration.global);
  const evidences = resolveEvidenceForControl(CONTROL, events, MANAGER, level, control, now);
  const context = buildPolicyContext(opMon2CatalogDefinition, control, level, events, evidences, now);
  return art32IncidentsData(context, now.getTime(), { ...window, limit });
}
