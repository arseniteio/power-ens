// The maturity document (`_doc/maturity` of the configuration index), its own version and its append-only history.
import { randomBytes } from 'crypto';
import type { Logger } from '../../../../../src/core/server';
import { ENS_CONFIGURATION_INDEX } from '../../../common/constants';
import type { ENSMaturityRecordKind, ENSMaturityRecords, ENSMaturityVersion } from '../../../common/ens/maturity/types';
import { ensureENSConfigurationIndex } from '../configuration-storage';
import { assertCompleteResponse } from '../evaluation/facts-reader';

export const ENS_MATURITY_DOCUMENT_ID = 'maturity';
export const ENS_MATURITY_DOCUMENT_TYPE = 'MATURITY_RECORDS';
export const ENS_MATURITY_HISTORY_TYPE = 'MATURITY_HISTORY';
// The index maps `configuration` as a non-indexed object: the records go there, so no mapping changes.
const PAYLOAD = 'configuration';

export class ENSMaturityConflictError extends Error {
  constructor() {
    super('La madurez ha cambiado desde que la abriste. Recarga la página para ver los cambios.');
  }
}

export interface ENSMaturityDocument {
  records?: ENSMaturityRecords;
  version?: ENSMaturityVersion;
  updatedAt?: string;
  updatedBy?: string;
}

const versionOf = (seqNo: unknown, primaryTerm: unknown): ENSMaturityVersion | undefined =>
  Number.isInteger(seqNo) && Number.isInteger(primaryTerm) ? { seqNo: seqNo as number, primaryTerm: primaryTerm as number } : undefined;

export const parseMaturityVersion = (value: any): ENSMaturityVersion | undefined =>
  value && typeof value === 'object' ? versionOf(value.seqNo, value.primaryTerm) : undefined;

export const documentFromHit = (hit: any): ENSMaturityDocument =>
  hit
    ? {
        records: hit._source?.[PAYLOAD],
        version: versionOf(hit._seq_no, hit._primary_term),
        updatedAt: hit._source?.updatedAt,
        updatedBy: hit._source?.updatedBy,
      }
    : {};

export async function readMaturityDocument(client: any, logger: Logger): Promise<ENSMaturityDocument> {
  await ensureENSConfigurationIndex(client, logger);
  const result = await client.search({
    index: ENS_CONFIGURATION_INDEX,
    body: { size: 1, seq_no_primary_term: true, query: { ids: { values: [ENS_MATURITY_DOCUMENT_ID] } } },
  });
  assertCompleteResponse(result.body, 'la madurez registrada');
  return documentFromHit(result.body?.hits?.hits?.[0]);
}

// Writes the records over `expected` ('absent': create), then one history entry with what was added.
export async function persistMaturityRecords(
  client: any,
  logger: Logger,
  records: ENSMaturityRecords,
  username: string,
  expected: ENSMaturityVersion | 'absent',
  added: { controlId: string; kind: ENSMaturityRecordKind; entry: Record<string, unknown>; summary: string }
): Promise<{ version?: ENSMaturityVersion; updatedAt: string; historyError?: string }> {
  await ensureENSConfigurationIndex(client, logger);
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();
  const target = { _index: ENS_CONFIGURATION_INDEX, _id: ENS_MATURITY_DOCUMENT_ID };
  const action = expected === 'absent' ? { create: target } : { index: { ...target, if_seq_no: expected.seqNo, if_primary_term: expected.primaryTerm } };
  const document = { documentType: ENS_MATURITY_DOCUMENT_TYPE, [PAYLOAD]: records, updatedAt, updatedBy: username };
  const written = await client.bulk({ body: `${JSON.stringify(action)}\n${JSON.stringify(document)}\n`, refresh: 'wait_for' });
  const item = written.body?.items?.[0]?.create || written.body?.items?.[0]?.index;
  if (written.body?.errors) {
    if (item?.status === 409 || item?.error?.type === 'version_conflict_engine_exception') throw new ENSMaturityConflictError();
    throw new Error(`Could not persist the ENS maturity: ${JSON.stringify(item?.error || written.body.items)}`);
  }
  const saved = { version: versionOf(item?._seq_no, item?._primary_term), updatedAt };
  const historyId = ['maturity-history', now, randomBytes(6).toString('hex')].join('-');
  const history = {
    documentType: ENS_MATURITY_HISTORY_TYPE,
    [PAYLOAD]: { controlId: added.controlId, kind: added.kind, entry: added.entry, summary: added.summary },
    createdAt: updatedAt,
    createdBy: username,
  };
  // The records are saved: a failed history entry is reported, not turned into a failed save.
  try {
    const result = await client.bulk({ body: `${JSON.stringify({ create: { _index: ENS_CONFIGURATION_INDEX, _id: historyId } })}\n${JSON.stringify(history)}\n`, refresh: 'wait_for' });
    if (result.body?.errors) return { ...saved, historyError: JSON.stringify(result.body.items?.[0]?.create?.error || result.body.items) };
  } catch (error: any) {
    return { ...saved, historyError: error?.message || String(error) };
  }
  return saved;
}
