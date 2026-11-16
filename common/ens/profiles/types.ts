import type { ENSAgentParameterValue, ENSMatchMode } from '../../agent-configuration';

export type ENSProfileLayer = 'distro' | 'role' | 'service' | 'site';

export const ENS_PROFILE_LAYERS: ENSProfileLayer[] = ['distro', 'role', 'service', 'site'];

export type ENSProfileScalarField = 'distro' | 'family' | 'role' | 'hostname';
export type ENSProfileListField = 'service' | 'group';
export type ENSProfileField = ENSProfileScalarField | ENSProfileListField;

export type ENSProfileScalarOp = 'is' | 'is_not' | 'matches';
export type ENSProfileListOp = 'has' | 'has_not';
export type ENSProfileOp = ENSProfileScalarOp | ENSProfileListOp;

export const ENS_PROFILE_SCALAR_FIELDS: ENSProfileScalarField[] = ['distro', 'family', 'role', 'hostname'];
export const ENS_PROFILE_LIST_FIELDS: ENSProfileListField[] = ['service', 'group'];
export const ENS_PROFILE_SCALAR_OPS: ENSProfileScalarOp[] = ['is', 'is_not', 'matches'];
export const ENS_PROFILE_LIST_OPS: ENSProfileListOp[] = ['has', 'has_not'];

export const ENS_PROFILE_GROUP_PREFIX = 'ens-perfil-';
export const ENS_PROFILE_DOCUMENT_TYPE = 'PROFILE';
export const ENS_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const profileDocumentId = (profileId: string): string => `profile-${profileId}`;

export interface ENSProfileCondition {
  field: string;
  op: string;
  value: string;
}

export interface ENSProfile {
  id: string;
  name: string;
  description?: string;
  layer: string;
  match: ENSProfileCondition[];
  values: Record<string, Record<string, ENSAgentParameterValue>>;
  match_modes?: Record<string, Record<string, ENSMatchMode>>;
  replace?: Record<string, string[]>;
}

export interface ENSHostFacts {
  distro: string;
  family: string;
  role: string;
  hostname: string;
  services: string[];
  groups: string[];
}

export type ENSProfileOrigin = 'builtin' | 'stored' | 'override';

export interface ENSProfileVersion {
  seqNo: number;
  primaryTerm: number;
}

export interface ENSProfileEntry {
  profile: ENSProfile;
  origin: ENSProfileOrigin;
  version?: ENSProfileVersion;
  updatedAt?: string;
  updatedBy?: string;
}
