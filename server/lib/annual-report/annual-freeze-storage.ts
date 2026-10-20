// Frozen art. 32 reports in `wazuh-ens-snapshots` (`annual_freeze|<period>`, earlier ones `|r<n>`), with no `date` field.
import type { Logger } from '../../../../../src/core/server';
import { ENS_SNAPSHOTS_INDEX } from '../../../common/constants';
import type { ENSAnnualFreeze, ENSAnnualFreezeEntry } from '../../../common/ens/annual-report/annual-report-types';
import { assertCompleteResponse } from '../evaluation/facts-reader';
import { ensureSnapshotsIndex } from '../maturity/snapshot-storage';

export const ENS_ANNUAL_FREEZE_TYPE = 'annual_freeze';
export const annualFreezeId = (period: string): string => `${ENS_ANNUAL_FREEZE_TYPE}|${period}`;
export const annualFreezeRevisionId = (period: string, revision: number): string => `${annualFreezeId(period)}|r${revision}`;

export class ENSAnnualFreezeConflictError extends Error {
  statusCode = 409;
  constructor(message = 'El informe congelado ha cambiado desde que lo abriste. Recarga la página.') {
    super(message);
  }
}

export interface ENSStoredAnnualFreeze {
  freeze: ENSAnnualFreeze;
  version: { seqNo: number; primaryTerm: number };
}

const isFreeze = (source: any): source is ENSAnnualFreeze =>
  Boolean(source) && source.documentType === ENS_ANNUAL_FREEZE_TYPE && typeof source.period === 'string' && Number.isInteger(source.revision) && Boolean(source.report);

// The current freeze of a period (or of one earlier revision), read with `client`; undefined if there is none.
export async function readAnnualFreeze(client: any, period: string, revision?: number): Promise<ENSStoredAnnualFreeze | undefined> {
  const id = revision === undefined ? annualFreezeId(period) : annualFreezeRevisionId(period, revision);
  const result = await client.search({
    index: ENS_SNAPSHOTS_INDEX,
    ignore_unavailable: true,
    allow_partial_search_results: false,
    body: { size: 1, seq_no_primary_term: true, query: { ids: { values: [id] } } },
  });
  assertCompleteResponse(result.body, 'el informe anual congelado');
  const hit = result.body?.hits?.hits?.[0];
  if (!hit || !isFreeze(hit._source)) return undefined;
  return { freeze: hit._source, version: { seqNo: hit._seq_no, primaryTerm: hit._primary_term } };
}

// What is frozen for each of `periods` (without the data sets).
export async function listAnnualFreezes(client: any, periods: string[]): Promise<(ENSAnnualFreezeEntry & { period: string; history: ENSAnnualFreezeEntry[] })[]> {
  const result = await client.search({
    index: ENS_SNAPSHOTS_INDEX,
    ignore_unavailable: true,
    allow_partial_search_results: false,
    body: {
      size: periods.length,
      query: { ids: { values: periods.map(annualFreezeId) } },
      _source: ['documentType', 'period', 'revision', 'frozenAt', 'frozenBy', 'reason', 'history'],
    },
  });
  assertCompleteResponse(result.body, 'los informes anuales congelados');
  return (result.body?.hits?.hits || [])
    .map((hit: any) => hit._source)
    .filter((source: any) => source?.documentType === ENS_ANNUAL_FREEZE_TYPE && typeof source.period === 'string')
    .map((source: any) => ({
      period: source.period,
      revision: source.revision,
      frozenAt: source.frozenAt,
      frozenBy: source.frozenBy,
      ...(source.reason ? { reason: source.reason } : {}),
      history: Array.isArray(source.history) ? source.history : [],
    }))
    .sort((a: any, b: any) => b.period.localeCompare(a.period));
}

const bulkOne = async (client: any, action: Record<string, unknown>, document: unknown) => {
  const written = await client.bulk({ body: `${JSON.stringify(action)}\n${JSON.stringify(document)}\n`, refresh: 'wait_for' });
  const item = written.body?.items?.[0]?.create || written.body?.items?.[0]?.index;
  return { errors: Boolean(written.body?.errors), item };
};

const conflict = (item: any): boolean => item?.status === 409 || item?.error?.type === 'version_conflict_engine_exception';

// The first freeze of a period: `create`, so a second one (two runs, two dashboards) finds it and writes nothing.
export async function createAnnualFreeze(client: any, logger: Logger, freeze: ENSAnnualFreeze): Promise<'created' | 'exists'> {
  await ensureSnapshotsIndex(client, logger);
  const { errors, item } = await bulkOne(client, { create: { _index: ENS_SNAPSHOTS_INDEX, _id: annualFreezeId(freeze.period) } }, freeze);
  if (!errors) return 'created';
  if (conflict(item)) return 'exists';
  throw new Error(`Could not write the annual freeze of ${freeze.period}: ${JSON.stringify(item?.error || item)}`);
}

// A new revision over `previous` (read at `version`): the previous data set is kept in its own document first.
export async function replaceAnnualFreeze(client: any, logger: Logger, previous: ENSStoredAnnualFreeze, freeze: ENSAnnualFreeze): Promise<void> {
  await ensureSnapshotsIndex(client, logger);
  const archived = previous.freeze;
  const kept = await bulkOne(client, { create: { _index: ENS_SNAPSHOTS_INDEX, _id: annualFreezeRevisionId(archived.period, archived.revision) } }, archived);
  if (kept.errors && !conflict(kept.item)) {
    throw new Error(`Could not keep revision ${archived.revision} of the annual freeze of ${archived.period}: ${JSON.stringify(kept.item?.error || kept.item)}`);
  }
  const { errors, item } = await bulkOne(
    client,
    { index: { _index: ENS_SNAPSHOTS_INDEX, _id: annualFreezeId(freeze.period), if_seq_no: previous.version.seqNo, if_primary_term: previous.version.primaryTerm } },
    freeze
  );
  if (!errors) return;
  if (conflict(item)) throw new ENSAnnualFreezeConflictError();
  throw new Error(`Could not write the annual freeze of ${freeze.period}: ${JSON.stringify(item?.error || item)}`);
}
