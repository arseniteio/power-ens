import { POWER_ENS_HOSTS_PATH, POWER_ENS_PROFILES_PATH } from '../../../../common/constants';
import type { ENSListedProfile } from '../../../../common/ens/profiles/builtin';
import type { ENSImportItem } from '../../../../common/ens/profiles/import-plan';
import type { ENSResolvedParameter } from '../../../../common/ens/profiles/resolve';
import type { ENSProfile, ENSProfileCondition, ENSProfileOrigin, ENSProfileVersion } from '../../../../common/ens/profiles/types';
import { getHttp } from '../../../services';

interface ApiResponse<T> {
  data: T;
}

const messageOf = (error: any): string => error?.body?.message || error?.message || String(error);

const call = async <T>(request: () => Promise<ApiResponse<T>>): Promise<T> => {
  try {
    return (await request()).data;
  } catch (error) {
    throw new Error(messageOf(error));
  }
};

export interface ENSProfileList {
  profiles: ENSListedProfile[];
  canChange: boolean;
}

export interface ENSProfileUpsertRequest {
  profile: ENSProfile;
  expectedVersion: ENSProfileVersion | null | undefined;
}

export interface ENSProfileDeletionRequest {
  id: string;
  expectedVersion: ENSProfileVersion | undefined;
}

export interface ENSProfileSummary {
  id: string;
  name: string;
  layer: string;
}

export interface ENSHostRow {
  agentId: string;
  name: string;
  hostname: string;
  distro: string;
  family: string;
  role: string;
  services: string[];
  groups: string[];
  os: { name?: string; version?: string; platform?: string; architecture?: string };
  profiles: ENSProfileSummary[];
  updatedAt?: string;
}

export interface ENSFacetBucket {
  value: string;
  count: number;
}

export interface ENSHostFilters {
  distro?: string;
  family?: string;
  role?: string;
  service?: string;
  group?: string;
  profile?: string;
}

export interface ENSHostPage {
  total: number;
  page: number;
  size: number;
  hosts: ENSHostRow[];
  facets: { distro: ENSFacetBucket[]; family: ENSFacetBucket[]; role: ENSFacetBucket[]; service: ENSFacetBucket[]; group: ENSFacetBucket[]; profile: Record<string, number> };
  profiles: ENSProfileSummary[];
}

export interface ENSPendingParameter {
  controlId: string;
  parameterId: string;
  evidences: string[];
  agents: number;
}

export interface ENSHostSummary {
  total: number;
  withoutProfile: number;
  roles: ENSFacetBucket[];
  distros: ENSFacetBucket[];
  services: ENSFacetBucket[];
  profiles: Array<ENSProfileSummary & { count: number }>;
  hostsUpdatedAt?: string;
  pending: { agents: number; parameters: ENSPendingParameter[]; newest?: string } | null;
}

export interface ENSHostPreview {
  total: number;
  hosts: Array<{ agentId: string; name: string; distro: string; role: string }>;
  problems: string[];
}

export interface ENSHostDetail {
  host: ENSHostRow & { signals: Array<{ field: string; value: string; from: string }>; engineVersion: string };
  matched: Array<ENSProfileSummary & { match: ENSProfileCondition[]; origin: ENSProfileOrigin }>;
  hasOwnConfiguration: boolean;
  parameters: ENSResolvedParameter[];
}

export const profilesClient = {
  list: () => call<ENSProfileList>(() => getHttp().get(POWER_ENS_PROFILES_PATH)),
  apply: (upserts: ENSProfileUpsertRequest[], deletions: ENSProfileDeletionRequest[]) =>
    call<{ written: string[]; deleted: string[] }>(() => getHttp().post(`${POWER_ENS_PROFILES_PATH}/apply`, { body: JSON.stringify({ upserts, deletions }) })),
  planImport: (text: string) =>
    call<{ items: ENSImportItem[] }>(() => getHttp().post(`${POWER_ENS_PROFILES_PATH}/import/plan`, { body: JSON.stringify({ text }) })),
  exportYaml: async (ids: string[]): Promise<string> => {
    try {
      return await getHttp().get<string>(`${POWER_ENS_PROFILES_PATH}/export`, { query: ids.length ? { ids: ids.join(',') } : {} });
    } catch (error) {
      throw new Error(messageOf(error));
    }
  },
  searchHosts: (request: { page: number; size: number; text: string; filters: ENSHostFilters }, signal?: AbortSignal) =>
    call<ENSHostPage>(() => getHttp().post(`${POWER_ENS_HOSTS_PATH}/search`, { body: JSON.stringify(request), signal })),
  summary: () => call<ENSHostSummary>(() => getHttp().get(`${POWER_ENS_HOSTS_PATH}/summary`)),
  preview: (match: ENSProfileCondition[], signal?: AbortSignal) =>
    call<ENSHostPreview>(() => getHttp().post(`${POWER_ENS_HOSTS_PATH}/preview`, { body: JSON.stringify({ match }), signal })),
  host: (agentId: string) => call<ENSHostDetail>(() => getHttp().get(`${POWER_ENS_HOSTS_PATH}/${encodeURIComponent(agentId)}`)),
};
