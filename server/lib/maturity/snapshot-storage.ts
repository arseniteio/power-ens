// Daily snapshots per control (`<controlId>|<YYYY-MM-DD>`, replaced within the day), kept 1095 days.
import type { Logger } from '../../../../../src/core/server';
import { ENS_SNAPSHOTS_INDEX } from '../../../common/constants';
import type { ENSControlSnapshot } from '../../../common/ens/maturity/types';
import { assertCompleteResponse } from '../evaluation/facts-reader';

// Three years: the annual report compares the year with the previous one, and L5 reads the last 180 days.
export const ENS_SNAPSHOT_RETENTION_DAYS = 1095;

export const snapshotId = (controlId: string, date: string): string => `${controlId}|${date}`;

const alreadyExists = (error: any): boolean =>
  (error?.body?.error?.type || error?.meta?.body?.error?.type) === 'resource_already_exists_exception' ||
  String(error?.message || error).includes('resource_already_exists_exception');

const SNAPSHOT_SETTINGS = { index: { number_of_shards: 1, auto_expand_replicas: '0-1' } };
const SNAPSHOT_MAPPINGS = {
  dynamic: false,
  properties: {
    date: { type: 'date', format: 'yyyy-MM-dd' },
    controlId: { type: 'keyword' },
    status: { type: 'keyword' },
    score: { type: 'float' },
    coverage: { type: 'float' },
    applicableRequirements: { type: 'integer' },
    measuredRequirements: { type: 'integer' },
    level: { type: 'keyword' },
    accredited: { type: 'byte' },
    assessed: { type: 'byte' },
    target: { type: 'byte' },
    recordedAt: { type: 'date' },
    recordedBy: { type: 'keyword' },
  },
};

// Checked once per process, not on every write.
let indexReady = false;

export async function ensureSnapshotsIndex(client: any, logger: Logger): Promise<void> {
  if (indexReady) return;
  // A template too: an index deleted and created again by a write keeps its field types.
  try {
    await client.indices.putIndexTemplate({
      name: ENS_SNAPSHOTS_INDEX,
      body: { index_patterns: [ENS_SNAPSHOTS_INDEX], priority: 100, template: { settings: SNAPSHOT_SETTINGS, mappings: SNAPSHOT_MAPPINGS } },
    });
  } catch (error: any) {
    logger.warn(`ENSFácil: could not put the index template of ${ENS_SNAPSHOTS_INDEX} (the index keeps its own mapping): ${error?.message || error}`);
  }
  const exists = await client.indices.exists({ index: ENS_SNAPSHOTS_INDEX });
  if (exists.body) {
    indexReady = true;
    return;
  }
  try {
    await client.indices.create({ index: ENS_SNAPSHOTS_INDEX, body: { settings: SNAPSHOT_SETTINGS, mappings: SNAPSHOT_MAPPINGS } });
    logger.info(`Index ${ENS_SNAPSHOTS_INDEX} created`);
  } catch (error) {
    if (!alreadyExists(error)) throw error;
  }
  indexReady = true;
}

// Writes (or replaces) each snapshot of its day.
export async function writeSnapshots(client: any, logger: Logger, snapshots: ENSControlSnapshot[]): Promise<void> {
  if (!snapshots.length) return;
  await ensureSnapshotsIndex(client, logger);
  const body =
    snapshots
      .flatMap(snapshot => [
        JSON.stringify({ index: { _index: ENS_SNAPSHOTS_INDEX, _id: snapshotId(snapshot.controlId, snapshot.date) } }),
        JSON.stringify(snapshot),
      ])
      .join('\n') + '\n';
  const written = await client.bulk({ body });
  if (written.body?.errors) {
    const failures = (written.body.items || []).map((item: any) => item.index?.error).filter(Boolean);
    throw new Error(`Could not write the maturity snapshots: ${JSON.stringify(failures).slice(0, 500)}`);
  }
}

// Snapshots between two days (inclusive), oldest first, in pages; without the index there are none.
export async function readSnapshots(
  client: any,
  range: { from: string; to: string; controlIds?: string[] },
  pageSize: number = 5000,
  max: number = 50000
): Promise<ENSControlSnapshot[]> {
  const filter: unknown[] = [{ range: { date: { gte: range.from, lte: range.to } } }];
  if (range.controlIds?.length) filter.push({ terms: { controlId: range.controlIds } });
  const sort = [{ date: { order: 'asc' } }, { controlId: { order: 'asc' } }];
  const list: ENSControlSnapshot[] = [];
  let after: unknown[] | undefined;
  while (list.length < max) {
    const result = await client.search({
      index: ENS_SNAPSHOTS_INDEX,
      ignore_unavailable: true,
      allow_partial_search_results: false,
      body: { size: pageSize, query: { bool: { filter } }, sort, ...(after ? { search_after: after } : {}) },
    });
    assertCompleteResponse(result.body, 'las instantáneas de madurez');
    const hits = result.body?.hits?.hits || [];
    hits.forEach((hit: any) => list.push(hit._source as ENSControlSnapshot));
    if (hits.length < pageSize) break;
    after = hits[hits.length - 1].sort;
    if (!after) break;
  }
  return list;
}

// Deletes the snapshots older than the retention.
export async function purgeSnapshots(client: any, before: string): Promise<number> {
  const result = await client.deleteByQuery({
    index: ENS_SNAPSHOTS_INDEX,
    ignore_unavailable: true,
    conflicts: 'proceed',
    body: { query: { range: { date: { lt: before } } } },
  });
  return Number(result.body?.deleted || 0);
}
