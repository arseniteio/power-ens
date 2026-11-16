import type { Logger } from '../../../../../src/core/server';
import { ENS_CONFIGURATION_INDEX } from '../../../common/constants';
import type { ENSStoredProfile } from '../../../common/ens/profiles/builtin';
import { ENSProfile, ENSProfileVersion, ENS_PROFILE_DOCUMENT_TYPE, profileDocumentId } from '../../../common/ens/profiles/types';
import { ensureENSConfigurationIndex } from '../configuration-storage';
import { assertCompleteResponse } from '../evaluation/search';

// The engine reads at most this many profile documents in one search.
export const MAX_STORED_PROFILES = 1000;

const versionOf = (hit: any): ENSProfileVersion | undefined =>
  Number.isInteger(hit?._seq_no) && Number.isInteger(hit?._primary_term) ? { seqNo: hit._seq_no, primaryTerm: hit._primary_term } : undefined;

export const readStoredProfiles = async (client: any, logger: Logger): Promise<ENSStoredProfile[]> => {
  await ensureENSConfigurationIndex(client, logger);
  const result = await client.search({
    index: ENS_CONFIGURATION_INDEX,
    ignore_unavailable: true,
    body: {
      size: MAX_STORED_PROFILES,
      seq_no_primary_term: true,
      query: { term: { documentType: ENS_PROFILE_DOCUMENT_TYPE } },
    },
  });
  assertCompleteResponse(result.body, 'los perfiles');
  return (result.body?.hits?.hits || [])
    .filter((hit: any) => hit._source?.configuration && typeof hit._source.configuration === 'object')
    .map((hit: any) => ({
      profile: hit._source.configuration as ENSProfile,
      version: versionOf(hit),
      updatedAt: hit._source.updatedAt,
      updatedBy: hit._source.updatedBy,
    }));
};

export type ENSExpectedProfileVersion = ENSProfileVersion | null | undefined;

export interface ENSProfileUpsert {
  profile: ENSProfile;
  expectedVersion: ENSExpectedProfileVersion;
}

export interface ENSProfileDeletion {
  id: string;
  expectedVersion: ENSExpectedProfileVersion;
}

export interface ENSProfileWriteResult {
  written: string[];
  deleted: string[];
  conflicts: string[];
  failures: Array<{ id: string; reason: string }>;
}

const target = (id: string) => ({ _index: ENS_CONFIGURATION_INDEX, _id: profileDocumentId(id) });

const guarded = (id: string, expected: ENSExpectedProfileVersion) =>
  expected ? { ...target(id), if_seq_no: expected.seqNo, if_primary_term: expected.primaryTerm } : target(id);

const upsertAction = ({ profile, expectedVersion }: ENSProfileUpsert) =>
  expectedVersion === null ? { create: target(profile.id) } : { index: guarded(profile.id, expectedVersion) };

const isConflict = (item: any): boolean => item?.status === 409 || item?.error?.type === 'version_conflict_engine_exception';

export const writeProfiles = async (
  client: any,
  logger: Logger,
  upserts: ENSProfileUpsert[],
  deletions: ENSProfileDeletion[],
  username: string
): Promise<ENSProfileWriteResult> => {
  await ensureENSConfigurationIndex(client, logger);
  const now = new Date().toISOString();
  const lines: string[] = [];
  const order: Array<{ id: string; kind: 'write' | 'delete' }> = [];

  upserts.forEach(upsert => {
    lines.push(JSON.stringify(upsertAction(upsert)));
    lines.push(JSON.stringify({ documentType: ENS_PROFILE_DOCUMENT_TYPE, configuration: upsert.profile, updatedAt: now, updatedBy: username }));
    order.push({ id: upsert.profile.id, kind: 'write' });
  });
  deletions.forEach(deletion => {
    lines.push(JSON.stringify({ delete: guarded(deletion.id, deletion.expectedVersion) }));
    order.push({ id: deletion.id, kind: 'delete' });
  });

  const result: ENSProfileWriteResult = { written: [], deleted: [], conflicts: [], failures: [] };
  if (!lines.length) return result;

  const { body } = await client.bulk({ body: `${lines.join('\n')}\n`, refresh: 'wait_for' });
  (body?.items || []).forEach((entry: any, index: number) => {
    const item = entry.create || entry.index || entry.delete;
    const { id, kind } = order[index];
    if (isConflict(item)) result.conflicts.push(id);
    else if (item?.error) result.failures.push({ id, reason: item.error.reason || item.error.type || 'error desconocido' });
    else if (kind === 'delete' && item?.result === 'not_found') result.conflicts.push(id);
    else (kind === 'write' ? result.written : result.deleted).push(id);
  });
  return result;
};
